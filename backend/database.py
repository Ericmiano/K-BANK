"""
Enhanced Database Layer for KenyaBank
Implements optimized queries, indexing, and performance monitoring
"""
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
import pymongo
from typing import Dict, Any, List, Optional, Union
from datetime import datetime
import logging
from config import settings, DATABASE_INDEXES
from cache import cache_manager

logger = logging.getLogger(__name__)

class DatabaseManager:
    """Enhanced database operations with caching and optimization"""
    
    def __init__(self):
        self.client: Optional[AsyncIOMotorClient] = None
        self.db: Optional[AsyncIOMotorDatabase] = None
        self.indexes_created = False
    
    async def connect(self):
        """Connect to MongoDB and setup database"""
        try:
            self.client = AsyncIOMotorClient(settings.mongo_url)
            self.db = self.client[settings.db_name]
            
            # Test connection
            await self.client.admin.command('ping')
            logger.info("Database connection established")
            
            # Create indexes for performance
            await self.create_indexes()
            
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            raise
    
    async def create_indexes(self):
        """Create database indexes for optimal performance"""
        if self.indexes_created:
            return
        
        try:
            for index_config in DATABASE_INDEXES:
                collection = self.db[index_config["collection"]]
                
                if isinstance(index_config["index"], str):
                    # Single field index
                    unique = index_config.get("unique", False)
                    await collection.create_index(
                        index_config["index"],
                        unique=unique,
                        background=True
                    )
                    logger.info(f"Created index on {index_config['collection']}.{index_config['index']}")
                
                elif isinstance(index_config["index"], list):
                    # Compound index
                    index_fields = []
                    for field_info in index_config["index"]:
                        if isinstance(field_info, tuple):
                            index_fields.append(field_info)
                        else:
                            index_fields.append((field_info, 1))
                    
                    await collection.create_index(
                        index_fields,
                        background=True
                    )
                    logger.info(f"Created compound index on {index_config['collection']}: {index_fields}")
            
            self.indexes_created = True
            logger.info("All database indexes created successfully")
            
        except Exception as e:
            logger.error(f"Failed to create indexes: {e}")
            # Don't raise - application should still work without indexes
    
    async def get_user_by_email(self, email: str, use_cache: bool = True) -> Optional[Dict[str, Any]]:
        """Get user by email with caching"""
        cache_key = f"user:email:{email}"
        
        if use_cache:
            cached_user = await cache_manager.aget(cache_key)
            if cached_user:
                return cached_user
        
        try:
            user = await self.db.users.find_one({"email": email})
            
            if user and use_cache:
                # Convert ObjectId to string for JSON serialization
                if "_id" in user:
                    user["_id"] = str(user["_id"])
                await cache_manager.aset(cache_key, user, 300)  # Cache for 5 minutes
            
            return user
        except Exception as e:
            logger.error(f"Failed to get user by email {email}: {e}")
            return None
    
    async def get_user_by_account_number(self, account_number: str, use_cache: bool = True) -> Optional[Dict[str, Any]]:
        """Get user by account number with caching"""
        cache_key = f"user:account:{account_number}"
        
        if use_cache:
            cached_user = await cache_manager.aget(cache_key)
            if cached_user:
                return cached_user
        
        try:
            user = await self.db.users.find_one({"account_number": account_number})
            
            if user and use_cache:
                if "_id" in user:
                    user["_id"] = str(user["_id"])
                await cache_manager.aset(cache_key, user, 300)
            
            return user
        except Exception as e:
            logger.error(f"Failed to get user by account number {account_number}: {e}")
            return None
    
    async def update_user_balance(self, account_number: str, amount_delta: float) -> bool:
        """Update user balance with transaction safety"""
        try:
            result = await self.db.users.update_one(
                {
                    "account_number": account_number,
                    "balance": {"$gte": abs(amount_delta) if amount_delta < 0 else 0}
                },
                {"$inc": {"balance": amount_delta}}
            )
            
            if result.modified_count == 1:
                # Invalidate cache
                await cache_manager.adelete(f"user:account:{account_number}")
                return True
            
            return False
        except Exception as e:
            logger.error(f"Failed to update balance for {account_number}: {e}")
            return False
    
    async def get_transactions_paginated(
        self, 
        account_number: str, 
        page: int = 1, 
        limit: int = 20,
        transaction_type: Optional[str] = None,
        status: Optional[str] = None,
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """Get paginated transactions with caching"""
        
        cache_key = f"transactions:{account_number}:{page}:{limit}:{transaction_type}:{status}"
        
        if use_cache:
            cached_result = await cache_manager.aget(cache_key)
            if cached_result:
                return cached_result
        
        try:
            skip = (page - 1) * limit
            
            # Build query
            query = {
                "$or": [
                    {"from_account": account_number},
                    {"to_account": account_number}
                ]
            }
            
            if transaction_type:
                query["transaction_type"] = transaction_type
            
            if status:
                query["status"] = status
            
            # Get total count
            total_count = await self.db.transactions.count_documents(query)
            
            # Get transactions
            transactions = await self.db.transactions.find(query)\
                .sort("created_at", -1)\
                .skip(skip)\
                .limit(limit)\
                .to_list(limit)
            
            # Convert ObjectId to string
            for transaction in transactions:
                if "_id" in transaction:
                    transaction["_id"] = str(transaction["_id"])
            
            result = {
                "transactions": transactions,
                "total_count": total_count,
                "page": page,
                "limit": limit,
                "total_pages": (total_count + limit - 1) // limit,
                "has_next": skip + len(transactions) < total_count,
                "has_prev": page > 1
            }
            
            if use_cache:
                await cache_manager.aset(cache_key, result, 60)  # Cache for 1 minute
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to get paginated transactions for {account_number}: {e}")
            return {
                "transactions": [],
                "total_count": 0,
                "page": page,
                "limit": limit,
                "total_pages": 0,
                "has_next": False,
                "has_prev": False
            }
    
    async def create_transaction(self, transaction_data: Dict[str, Any]) -> Optional[str]:
        """Create transaction with optimized write"""
        try:
            # Add timestamp if not present
            if "created_at" not in transaction_data:
                transaction_data["created_at"] = datetime.utcnow()
            
            result = await self.db.transactions.insert_one(transaction_data)
            
            # Invalidate related cache entries
            if "from_account" in transaction_data:
                await cache_manager.adelete(f"transactions:{transaction_data['from_account']}:*")
            if "to_account" in transaction_data:
                await cache_manager.adelete(f"transactions:{transaction_data['to_account']}:*")
            
            return str(result.inserted_id)
        except Exception as e:
            logger.error(f"Failed to create transaction: {e}")
            return None
    
    async def get_user_statistics(self, user_id: str, use_cache: bool = True) -> Dict[str, Any]:
        """Get user statistics with caching"""
        cache_key = f"user_stats:{user_id}"
        
        if use_cache:
            cached_stats = await cache_manager.aget(cache_key)
            if cached_stats:
                return cached_stats
        
        try:
            user = await self.db.users.find_one({"id": user_id})
            if not user:
                return {}
            
            account_number = user.get("account_number")
            
            # Aggregate transaction statistics
            pipeline = [
                {
                    "$match": {
                        "$or": [
                            {"from_account": account_number},
                            {"to_account": account_number}
                        ]
                    }
                },
                {
                    "$group": {
                        "_id": "$transaction_type",
                        "count": {"$sum": 1},
                        "total_amount": {"$sum": "$amount"}
                    }
                }
            ]
            
            transaction_stats = await self.db.transactions.aggregate(pipeline).to_list(None)
            
            # Get recent transaction count (last 30 days)
            thirty_days_ago = datetime.utcnow() - timedelta(days=30)
            recent_transactions = await self.db.transactions.count_documents({
                "$or": [
                    {"from_account": account_number},
                    {"to_account": account_number}
                ],
                "created_at": {"$gte": thirty_days_ago}
            })
            
            stats = {
                "total_transactions": sum(stat["count"] for stat in transaction_stats),
                "transaction_types": {
                    stat["_id"]: {
                        "count": stat["count"],
                        "total_amount": stat["total_amount"]
                    }
                    for stat in transaction_stats
                },
                "recent_transactions_30d": recent_transactions,
                "current_balance": user.get("balance", 0),
                "account_created": user.get("created_at"),
                "last_login": user.get("last_login")
            }
            
            if use_cache:
                await cache_manager.aset(cache_key, stats, 300)  # Cache for 5 minutes
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get user statistics for {user_id}: {e}")
            return {}
    
    async def get_admin_dashboard_stats(self, use_cache: bool = True) -> Dict[str, Any]:
        """Get admin dashboard statistics with caching"""
        cache_key = "admin_dashboard_stats"
        
        if use_cache:
            cached_stats = await cache_manager.aget(cache_key)
            if cached_stats:
                return cached_stats
        
        try:
            # Get user statistics
            total_users = await self.db.users.count_documents({})
            active_users = await self.db.users.count_documents({"is_active": True})
            admin_users = await self.db.users.count_documents({"role": "admin"})
            customer_users = await self.db.users.count_documents({"role": "customer"})
            
            # Get transaction statistics
            total_transactions = await self.db.transactions.count_documents({})
            pending_transactions = await self.db.transactions.count_documents({"status": "pending"})
            completed_transactions = await self.db.transactions.count_documents({"status": "completed"})
            failed_transactions = await self.db.transactions.count_documents({"status": "failed"})
            
            # Get transaction volume
            volume_pipeline = [
                {"$match": {"status": "completed"}},
                {"$group": {"_id": None, "total_volume": {"$sum": "$amount"}}}
            ]
            volume_result = await self.db.transactions.aggregate(volume_pipeline).to_list(1)
            total_volume = volume_result[0]["total_volume"] if volume_result else 0
            
            # Get recent activity (last 7 days)
            seven_days_ago = datetime.utcnow() - timedelta(days=7)
            recent_transactions = await self.db.transactions.count_documents({
                "created_at": {"$gte": seven_days_ago}
            })
            new_users = await self.db.users.count_documents({
                "created_at": {"$gte": seven_days_ago}
            })
            
            stats = {
                "users": {
                    "total": total_users,
                    "active": active_users,
                    "inactive": total_users - active_users,
                    "admins": admin_users,
                    "customers": customer_users
                },
                "transactions": {
                    "total": total_transactions,
                    "pending": pending_transactions,
                    "completed": completed_transactions,
                    "failed": failed_transactions,
                    "total_volume": total_volume
                },
                "recent_activity": {
                    "new_transactions_7d": recent_transactions,
                    "new_users_7d": new_users
                },
                "system": {
                    "last_updated": datetime.utcnow().isoformat()
                }
            }
            
            if use_cache:
                await cache_manager.aset(cache_key, stats, 120)  # Cache for 2 minutes
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get admin dashboard stats: {e}")
            return {}
    
    async def log_audit_event(self, user_id: str, action: str, resource: str, details: Dict[str, Any], ip_address: str, user_agent: str):
        """Log audit event for security monitoring"""
        try:
            audit_log = {
                "id": f"audit_{int(datetime.utcnow().timestamp())}_{user_id}",
                "user_id": user_id,
                "action": action,
                "resource": resource,
                "details": details,
                "ip_address": ip_address,
                "user_agent": user_agent,
                "timestamp": datetime.utcnow()
            }
            
            await self.db.audit_logs.insert_one(audit_log)
            
        except Exception as e:
            logger.error(f"Failed to log audit event: {e}")
    
    async def cleanup_old_data(self, days: int = 90):
        """Cleanup old data to maintain performance"""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            
            # Cleanup old audit logs
            result1 = await self.db.audit_logs.delete_many({
                "timestamp": {"$lt": cutoff_date}
            })
            
            # Cleanup old login attempts
            result2 = await self.db.login_attempts.delete_many({
                "timestamp": {"$lt": cutoff_date}
            })
            
            # Cleanup used MFA tokens
            result3 = await self.db.mfa_tokens.delete_many({
                "used": True,
                "created_at": {"$lt": cutoff_date}
            })
            
            logger.info(f"Cleanup completed: {result1.deleted_count} audit logs, {result2.deleted_count} login attempts, {result3.deleted_count} MFA tokens")
            
        except Exception as e:
            logger.error(f"Failed to cleanup old data: {e}")
    
    async def disconnect(self):
        """Disconnect from database"""
        if self.client:
            self.client.close()
            logger.info("Database connection closed")

# Global database manager instance
db_manager = DatabaseManager()