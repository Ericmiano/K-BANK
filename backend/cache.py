"""
Redis Cache Layer for KenyaBank
Implements caching, session management, and performance optimization
"""
import redis
import json
import pickle
import asyncio
import aioredis
from typing import Any, Optional, Union, Dict, List
from datetime import timedelta
from config import settings
import logging

logger = logging.getLogger(__name__)

class CacheManager:
    """Redis cache manager for improved performance"""
    
    def __init__(self):
        self.redis_client = None
        self.redis_async = None
        self._setup_redis()
    
    def _setup_redis(self):
        """Setup Redis connections"""
        try:
            # Sync Redis client
            self.redis_client = redis.from_url(
                settings.redis_url,
                password=settings.redis_password,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
                health_check_interval=30
            )
            
            # Test connection
            self.redis_client.ping()
            logger.info("Redis connection established")
            
        except redis.ConnectionError as e:
            logger.warning(f"Redis connection failed: {e}. Cache will be disabled.")
            self.redis_client = None
        except Exception as e:
            logger.error(f"Redis setup failed: {e}")
            self.redis_client = None
    
    async def setup_async_redis(self):
        """Setup async Redis connection"""
        if not self.redis_async:
            try:
                self.redis_async = aioredis.from_url(
                    settings.redis_url,
                    password=settings.redis_password,
                    socket_connect_timeout=5,
                    socket_timeout=5,
                    retry_on_timeout=True
                )
                await self.redis_async.ping()
                logger.info("Async Redis connection established")
            except Exception as e:
                logger.warning(f"Async Redis connection failed: {e}")
                self.redis_async = None
    
    def set(self, key: str, value: Any, expiration: int = 3600) -> bool:
        """Set cache value with expiration"""
        if not self.redis_client:
            return False
        
        try:
            if isinstance(value, (dict, list)):
                value = json.dumps(value, default=str)
            elif not isinstance(value, str):
                value = str(value)
            
            self.redis_client.setex(key, expiration, value)
            return True
        except Exception as e:
            logger.error(f"Cache set failed for key {key}: {e}")
            return False
    
    def get(self, key: str) -> Any:
        """Get cache value"""
        if not self.redis_client:
            return None
        
        try:
            value = self.redis_client.get(key)
            if value is None:
                return None
            
            # Try to parse as JSON
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return value
        except Exception as e:
            logger.error(f"Cache get failed for key {key}: {e}")
            return None
    
    async def aset(self, key: str, value: Any, expiration: int = 3600) -> bool:
        """Async set cache value"""
        if not self.redis_async:
            await self.setup_async_redis()
        
        if not self.redis_async:
            return False
        
        try:
            if isinstance(value, (dict, list)):
                value = json.dumps(value, default=str)
            elif not isinstance(value, str):
                value = str(value)
            
            await self.redis_async.setex(key, expiration, value)
            return True
        except Exception as e:
            logger.error(f"Async cache set failed for key {key}: {e}")
            return False
    
    async def aget(self, key: str) -> Any:
        """Async get cache value"""
        if not self.redis_async:
            await self.setup_async_redis()
        
        if not self.redis_async:
            return None
        
        try:
            value = await self.redis_async.get(key)
            if value is None:
                return None
            
            # Try to parse as JSON
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return value
        except Exception as e:
            logger.error(f"Async cache get failed for key {key}: {e}")
            return None
    
    def delete(self, key: str) -> bool:
        """Delete cache key"""
        if not self.redis_client:
            return False
        
        try:
            self.redis_client.delete(key)
            return True
        except Exception as e:
            logger.error(f"Cache delete failed for key {key}: {e}")
            return False
    
    async def adelete(self, key: str) -> bool:
        """Async delete cache key"""
        if not self.redis_async:
            await self.setup_async_redis()
        
        if not self.redis_async:
            return False
        
        try:
            await self.redis_async.delete(key)
            return True
        except Exception as e:
            logger.error(f"Async cache delete failed for key {key}: {e}")
            return False
    
    def exists(self, key: str) -> bool:
        """Check if key exists in cache"""
        if not self.redis_client:
            return False
        
        try:
            return bool(self.redis_client.exists(key))
        except Exception as e:
            logger.error(f"Cache exists check failed for key {key}: {e}")
            return False
    
    def invalidate_pattern(self, pattern: str) -> int:
        """Delete all keys matching pattern"""
        if not self.redis_client:
            return 0
        
        try:
            keys = self.redis_client.keys(pattern)
            if keys:
                return self.redis_client.delete(*keys)
            return 0
        except Exception as e:
            logger.error(f"Cache pattern invalidation failed for {pattern}: {e}")
            return 0
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        if not self.redis_client:
            return {"error": "Redis not connected"}
        
        try:
            info = self.redis_client.info()
            return {
                "connected_clients": info.get("connected_clients", 0),
                "used_memory": info.get("used_memory_human", "0B"),
                "keyspace_hits": info.get("keyspace_hits", 0),
                "keyspace_misses": info.get("keyspace_misses", 0),
                "total_commands_processed": info.get("total_commands_processed", 0),
                "uptime_in_seconds": info.get("uptime_in_seconds", 0)
            }
        except Exception as e:
            logger.error(f"Failed to get cache stats: {e}")
            return {"error": str(e)}

class SessionManager:
    """Redis-based session management"""
    
    def __init__(self, cache_manager: CacheManager):
        self.cache = cache_manager
        self.session_prefix = "session:"
        self.user_sessions_prefix = "user_sessions:"
        self.default_expiration = 3600  # 1 hour
    
    def create_session(self, user_id: str, session_data: Dict[str, Any], expiration: int = None) -> str:
        """Create new session"""
        import secrets
        session_id = secrets.token_urlsafe(32)
        session_key = f"{self.session_prefix}{session_id}"
        
        session_data.update({
            "user_id": user_id,
            "created_at": str(datetime.utcnow()),
            "last_accessed": str(datetime.utcnow())
        })
        
        expiration = expiration or self.default_expiration
        success = self.cache.set(session_key, session_data, expiration)
        
        if success:
            # Track user sessions
            user_sessions_key = f"{self.user_sessions_prefix}{user_id}"
            user_sessions = self.cache.get(user_sessions_key) or []
            user_sessions.append(session_id)
            self.cache.set(user_sessions_key, user_sessions, expiration)
            
            return session_id
        
        return None
    
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session data"""
        session_key = f"{self.session_prefix}{session_id}"
        session_data = self.cache.get(session_key)
        
        if session_data:
            # Update last accessed
            session_data["last_accessed"] = str(datetime.utcnow())
            self.cache.set(session_key, session_data, self.default_expiration)
        
        return session_data
    
    def update_session(self, session_id: str, data: Dict[str, Any]) -> bool:
        """Update session data"""
        session_key = f"{self.session_prefix}{session_id}"
        session_data = self.cache.get(session_key)
        
        if session_data:
            session_data.update(data)
            session_data["last_accessed"] = str(datetime.utcnow())
            return self.cache.set(session_key, session_data, self.default_expiration)
        
        return False
    
    def delete_session(self, session_id: str) -> bool:
        """Delete session"""
        session_key = f"{self.session_prefix}{session_id}"
        session_data = self.cache.get(session_key)
        
        if session_data:
            user_id = session_data.get("user_id")
            self.cache.delete(session_key)
            
            # Remove from user sessions
            if user_id:
                user_sessions_key = f"{self.user_sessions_prefix}{user_id}"
                user_sessions = self.cache.get(user_sessions_key) or []
                if session_id in user_sessions:
                    user_sessions.remove(session_id)
                    self.cache.set(user_sessions_key, user_sessions, self.default_expiration)
            
            return True
        
        return False
    
    def delete_user_sessions(self, user_id: str) -> int:
        """Delete all sessions for a user"""
        user_sessions_key = f"{self.user_sessions_prefix}{user_id}"
        session_ids = self.cache.get(user_sessions_key) or []
        
        deleted_count = 0
        for session_id in session_ids:
            if self.delete_session(session_id):
                deleted_count += 1
        
        self.cache.delete(user_sessions_key)
        return deleted_count
    
    def get_active_sessions(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all active sessions for a user"""
        user_sessions_key = f"{self.user_sessions_prefix}{user_id}"
        session_ids = self.cache.get(user_sessions_key) or []
        
        active_sessions = []
        for session_id in session_ids:
            session_data = self.get_session(session_id)
            if session_data:
                active_sessions.append({
                    "session_id": session_id,
                    "created_at": session_data.get("created_at"),
                    "last_accessed": session_data.get("last_accessed"),
                    "ip_address": session_data.get("ip_address"),
                    "user_agent": session_data.get("user_agent")
                })
        
        return active_sessions

# Global instances
cache_manager = CacheManager()
session_manager = SessionManager(cache_manager)

# Cache decorators
def cache_result(key_prefix: str, expiration: int = 3600):
    """Decorator to cache function results"""
    def decorator(func):
        def wrapper(*args, **kwargs):
            # Create cache key from function name and arguments
            cache_key = f"{key_prefix}:{func.__name__}:{hash(str(args) + str(kwargs))}"
            
            # Try to get from cache
            cached_result = cache_manager.get(cache_key)
            if cached_result is not None:
                return cached_result
            
            # Execute function and cache result
            result = func(*args, **kwargs)
            cache_manager.set(cache_key, result, expiration)
            return result
        
        return wrapper
    return decorator

async def acache_result(key_prefix: str, expiration: int = 3600):
    """Async decorator to cache function results"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # Create cache key from function name and arguments
            cache_key = f"{key_prefix}:{func.__name__}:{hash(str(args) + str(kwargs))}"
            
            # Try to get from cache
            cached_result = await cache_manager.aget(cache_key)
            if cached_result is not None:
                return cached_result
            
            # Execute function and cache result
            result = await func(*args, **kwargs)
            await cache_manager.aset(cache_key, result, expiration)
            return result
        
        return wrapper
    return decorator