"""
Enhanced KenyaBank Server with Enterprise Security & Performance
Includes MFA, rate limiting, caching, monitoring, and comprehensive banking features
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request, Response, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from contextlib import asynccontextmanager
import os
import logging
import time
import json
from pathlib import Path
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import aiohttp
import base64
import asyncio

# Import our enhanced modules
from config import settings, SECURITY_HEADERS
from security import security_manager, rate_limiter, email_service, MFAToken, LoginAttempt, AuditLog
from cache import cache_manager, session_manager
from monitoring import MonitoringManager, AlertManager
from database import db_manager

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/kenyabank.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialize monitoring
monitoring_manager = None
alert_manager = AlertManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    # Startup
    logger.info("Starting KenyaBank application...")
    
    # Initialize database
    await db_manager.connect()
    
    # Initialize monitoring
    global monitoring_manager
    monitoring_manager = MonitoringManager(db_manager.client)
    
    # Setup background tasks
    asyncio.create_task(background_cleanup_task())
    asyncio.create_task(background_monitoring_task())
    
    logger.info("KenyaBank application started successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down KenyaBank application...")
    await db_manager.disconnect()

# Create FastAPI app with enhanced configuration
app = FastAPI(
    title="KenyaBank API",
    description="Enterprise Banking Platform with M-Pesa Integration",
    version="2.0.0",
    docs_url="/api/docs" if settings.debug else None,
    redoc_url="/api/redoc" if settings.debug else None,
    lifespan=lifespan
)

# API router with /api prefix
api_router = APIRouter(prefix="/api")

# Security setup
security = HTTPBearer()

# Enhanced Models
class UserCreate(BaseModel):
    email: str = Field(..., description="User email address")
    full_name: str = Field(..., min_length=2, max_length=100)
    phone: str = Field(..., regex=r'^254\d{9}$', description="Kenyan phone number format")
    password: str = Field(..., min_length=8, max_length=128)
    role: Optional[str] = Field(default="customer", regex="^(customer|admin)$")

class UserLogin(BaseModel):
    email: str
    password: str
    mfa_code: Optional[str] = None

class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    phone: str
    role: str
    account_number: str
    balance: float
    is_active: bool
    mfa_enabled: bool = False
    created_at: datetime

class TransactionCreate(BaseModel):
    to_account: Optional[str] = None
    amount: float = Field(..., gt=0, description="Transaction amount must be positive")
    transaction_type: str = Field(..., regex="^(transfer|deposit|withdrawal)$")
    description: str = Field(..., min_length=1, max_length=255)

class MpesaPayment(BaseModel):
    phone: str = Field(..., regex=r'^254\d{9}$')
    amount: float = Field(..., gt=0, le=50000, description="Amount between 1 and 50,000 KES")
    account_number: str

class Token(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: int
    mfa_required: bool = False

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    services: Dict[str, Any]
    system_metrics: Dict[str, Any]

# Middleware
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)

if settings.environment == "production":
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["*.kenyabank.com", "localhost"]
    )

# Request/Response middleware for monitoring and security
@app.middleware("http")
async def request_middleware(request: Request, call_next):
    start_time = time.time()
    
    if monitoring_manager:
        monitoring_manager.increment_active_requests()
    
    # Add security headers
    response = await call_next(request)
    
    # Add security headers
    for header_name, header_value in SECURITY_HEADERS.items():
        response.headers[header_name] = header_value
    
    # Record metrics
    if monitoring_manager:
        monitoring_manager.decrement_active_requests()
        response_time = (time.time() - start_time) * 1000
        is_error = response.status_code >= 400
        monitoring_manager.record_request(response_time, is_error)
    
    return response

# Rate limiting middleware
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host
    
    # Check rate limit
    if rate_limiter.is_rate_limited(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later."
        )
    
    return await call_next(request)

# Helper Functions
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current authenticated user with enhanced validation"""
    try:
        token = credentials.credentials
        payload = security_manager.verify_jwt_token(token)
        
        if payload is None:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        
        # Get user from database with caching
        user_data = await db_manager.get_user_by_email(email)
        if not user_data or not user_data.get("is_active"):
            raise HTTPException(status_code=401, detail="User not found or inactive")
        
        return user_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token validation error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")

async def get_admin_user(current_user: dict = Depends(get_current_user)):
    """Ensure current user is admin"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

async def log_security_event(user_id: str, action: str, details: Dict[str, Any], request: Request):
    """Log security-related events"""
    await db_manager.log_audit_event(
        user_id=user_id,
        action=action,
        resource="auth",
        details=details,
        ip_address=request.client.host,
        user_agent=request.headers.get("User-Agent", "Unknown")
    )

# M-Pesa Functions (Enhanced)
async def get_mpesa_access_token():
    """Get M-Pesa access token with caching"""
    cache_key = "mpesa_access_token"
    
    # Check cache first
    cached_token = await cache_manager.aget(cache_key)
    if cached_token:
        return cached_token
    
    auth_string = f"{settings.mpesa_consumer_key}:{settings.mpesa_consumer_secret}"
    encoded = base64.b64encode(auth_string.encode()).decode()
    url = f"{settings.mpesa_base_url}/oauth/v1/generate?grant_type=client_credentials"
    headers = {"Authorization": f"Basic {encoded}"}
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    access_token = data.get("access_token")
                    
                    if access_token:
                        # Cache token for 55 minutes (expires in 60)
                        await cache_manager.aset(cache_key, access_token, 3300)
                        return access_token
                
                logger.error(f"M-Pesa token request failed: {response.status}")
                return None
                
    except Exception as e:
        logger.error(f"M-Pesa token request error: {e}")
        return None

async def initiate_stk_push(phone: str, amount: float, account_number: str, user_id: str):
    """Enhanced STK Push with better error handling"""
    access_token = await get_mpesa_access_token()
    if not access_token:
        raise HTTPException(status_code=503, detail="M-Pesa service unavailable")
    
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    password = base64.b64encode(
        f"{settings.mpesa_business_shortcode}{settings.mpesa_passkey}{timestamp}".encode()
    ).decode()
    
    payload = {
        "BusinessShortCode": settings.mpesa_business_shortcode,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": int(amount),
        "PartyA": phone,
        "PartyB": settings.mpesa_business_shortcode,
        "PhoneNumber": phone,
        "CallBackURL": f"{settings.cors_origins[0] if settings.cors_origins != ['*'] else 'https://yourapp.com'}/api/mpesa/callback",
        "AccountReference": account_number,
        "TransactionDesc": f"KenyaBank deposit to {account_number}"
    }
    
    url = f"{settings.mpesa_base_url}/mpesa/stkpush/v1/processrequest"
    headers = {"Authorization": f"Bearer {access_token}"}
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers, timeout=30) as response:
                result = await response.json()
                
                # Log the M-Pesa request
                await db_manager.log_audit_event(
                    user_id=user_id,
                    action="mpesa_stk_push_initiated",
                    resource="mpesa",
                    details={
                        "phone": security_manager.mask_sensitive_data(phone),
                        "amount": amount,
                        "account_number": account_number,
                        "response_code": result.get("ResponseCode")
                    },
                    ip_address="system",
                    user_agent="mpesa_service"
                )
                
                return result
                
    except Exception as e:
        logger.error(f"STK Push error: {e}")
        raise HTTPException(status_code=503, detail="M-Pesa service error")

# Background Tasks
async def background_cleanup_task():
    """Background task for data cleanup"""
    while True:
        try:
            await asyncio.sleep(3600)  # Run every hour
            await db_manager.cleanup_old_data()
            logger.info("Background cleanup completed")
        except Exception as e:
            logger.error(f"Background cleanup error: {e}")

async def background_monitoring_task():
    """Background task for system monitoring"""
    while True:
        try:
            await asyncio.sleep(60)  # Run every minute
            
            if monitoring_manager:
                metrics = monitoring_manager.get_system_metrics()
                await alert_manager.check_and_send_alerts(metrics)
            
        except Exception as e:
            logger.error(f"Background monitoring error: {e}")

# Authentication Endpoints
@api_router.post("/auth/register", response_model=UserResponse)
async def register_user(user_data: UserCreate, request: Request, background_tasks: BackgroundTasks):
    """Enhanced user registration with security checks"""
    
    # Check if user exists
    existing_user = await db_manager.get_user_by_email(user_data.email)
    if existing_user:
        # Log failed registration attempt
        await db_manager.log_audit_event(
            user_id="anonymous",
            action="registration_failed",
            resource="auth",
            details={"reason": "email_already_exists", "email": user_data.email},
            ip_address=request.client.host,
            user_agent=request.headers.get("User-Agent", "Unknown")
        )
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Enhanced password hashing
    hashed_password, salt = security_manager.hash_password(user_data.password)
    
    # Create new user
    user = {
        "id": str(uuid.uuid4()),
        "email": user_data.email,
        "full_name": user_data.full_name,
        "phone": user_data.phone,
        "password_hash": hashed_password,
        "password_salt": salt,
        "role": user_data.role,
        "account_number": f"KB{str(uuid.uuid4())[:10].upper()}",
        "balance": 1000.0 if user_data.role == "customer" else 0.0,  # Welcome bonus for customers
        "is_active": True,
        "mfa_enabled": False,
        "mfa_secret": security_manager.generate_totp_secret(),  # Pre-generate for future use
        "created_at": datetime.utcnow(),
        "last_login": None,
        "login_attempts": 0,
        "locked_until": None
    }
    
    # Insert user to database
    result = await db_manager.db.users.insert_one(user)
    
    if result.inserted_id:
        # Log successful registration
        await log_security_event(
            user["id"],
            "user_registered",
            {
                "role": user_data.role,
                "email": security_manager.mask_sensitive_data(user_data.email),
                "account_number": user["account_number"]
            },
            request
        )
        
        # Invalidate cache
        await cache_manager.adelete(f"user:email:{user_data.email}")
        
        return UserResponse(**{k: v for k, v in user.items() if k not in ['password_hash', 'password_salt', 'mfa_secret']})
    
    raise HTTPException(status_code=500, detail="Failed to create user")

@api_router.post("/auth/login", response_model=Token)
async def login(user_data: UserLogin, request: Request):
    """Enhanced login with MFA and security monitoring"""
    
    # Check rate limiting for this email
    email_key = f"login:{user_data.email}"
    if rate_limiter.is_rate_limited(email_key, limit=5, window=900):  # 5 attempts per 15 minutes
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Please try again in 15 minutes."
        )
    
    # Get user
    user_doc = await db_manager.get_user_by_email(user_data.email, use_cache=False)
    
    # Record login attempt
    login_attempt = LoginAttempt(
        email=user_data.email,
        ip_address=request.client.host,
        user_agent=request.headers.get("User-Agent", "Unknown"),
        success=False
    )
    
    if not user_doc:
        login_attempt.failure_reason = "user_not_found"
        await db_manager.db.login_attempts.insert_one(login_attempt.dict())
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Check if account is locked
    if user_doc.get("locked_until") and user_doc["locked_until"] > datetime.utcnow():
        login_attempt.failure_reason = "account_locked"
        await db_manager.db.login_attempts.insert_one(login_attempt.dict())
        raise HTTPException(status_code=423, detail="Account is temporarily locked")
    
    # Verify password
    if not security_manager.verify_password(
        user_data.password,
        user_doc["password_hash"],
        user_doc["password_salt"]
    ):
        # Increment failed attempts
        failed_attempts = user_doc.get("login_attempts", 0) + 1
        update_data = {"login_attempts": failed_attempts}
        
        # Lock account after max attempts
        if failed_attempts >= settings.max_login_attempts:
            update_data["locked_until"] = datetime.utcnow() + timedelta(seconds=settings.account_lockout_duration)
        
        await db_manager.db.users.update_one(
            {"email": user_data.email},
            {"$set": update_data}
        )
        
        login_attempt.failure_reason = "invalid_password"
        await db_manager.db.login_attempts.insert_one(login_attempt.dict())
        
        # Log security event
        await log_security_event(
            user_doc["id"],
            "login_failed",
            {"reason": "invalid_password", "attempts": failed_attempts},
            request
        )
        
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Check MFA if enabled
    mfa_verified = True
    if user_doc.get("mfa_enabled") and not user_data.mfa_code:
        # Return token indicating MFA required
        temp_token = security_manager.create_jwt_token(
            {"sub": user_data.email, "mfa_pending": True},
            timedelta(minutes=10)
        )
        
        return Token(
            access_token=temp_token,
            token_type="bearer",
            expires_in=600,
            mfa_required=True
        )
    
    elif user_doc.get("mfa_enabled") and user_data.mfa_code:
        # Verify MFA code
        mfa_verified = security_manager.verify_totp(
            user_doc.get("mfa_secret", ""),
            user_data.mfa_code
        )
        
        if not mfa_verified:
            login_attempt.failure_reason = "invalid_mfa"
            await db_manager.db.login_attempts.insert_one(login_attempt.dict())
            raise HTTPException(status_code=401, detail="Invalid MFA code")
    
    # Successful login
    login_attempt.success = True
    await db_manager.db.login_attempts.insert_one(login_attempt.dict())
    
    # Reset failed attempts and update last login
    await db_manager.db.users.update_one(
        {"email": user_data.email},
        {
            "$set": {
                "last_login": datetime.utcnow(),
                "login_attempts": 0,
                "locked_until": None
            }
        }
    )
    
    # Create session and JWT token
    session_data = {
        "ip_address": request.client.host,
        "user_agent": request.headers.get("User-Agent", "Unknown"),
        "login_time": datetime.utcnow().isoformat()
    }
    
    session_id = session_manager.create_session(user_doc["id"], session_data)
    
    # Create access token
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = security_manager.create_jwt_token(
        {
            "sub": user_data.email,
            "user_id": user_doc["id"],
            "role": user_doc["role"],
            "session_id": session_id
        },
        access_token_expires
    )
    
    # Log successful login
    await log_security_event(
        user_doc["id"],
        "login_success",
        {"mfa_used": user_doc.get("mfa_enabled", False)},
        request
    )
    
    # Invalidate user cache to get fresh data
    await cache_manager.adelete(f"user:email:{user_data.email}")
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
        mfa_required=False
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_user_profile(current_user: dict = Depends(get_current_user)):
    """Get current user profile"""
    return UserResponse(**{
        k: v for k, v in current_user.items() 
        if k not in ['password_hash', 'password_salt', 'mfa_secret']
    })

@api_router.post("/auth/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """Enhanced logout with session cleanup"""
    try:
        # Get all user sessions and delete them
        deleted_count = session_manager.delete_user_sessions(current_user["id"])
        
        # Log logout
        logger.info(f"User {current_user['email']} logged out, {deleted_count} sessions deleted")
        
        return {"message": "Successfully logged out"}
    except Exception as e:
        logger.error(f"Logout error for user {current_user['id']}: {e}")
        return {"message": "Logout completed"}

# Enhanced Banking Endpoints
@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """Get enhanced dashboard statistics with caching"""
    try:
        # Get user statistics
        user_stats = await db_manager.get_user_statistics(current_user["id"])
        
        # Get recent transactions with pagination
        transactions_result = await db_manager.get_transactions_paginated(
            current_user["account_number"],
            page=1,
            limit=5
        )
        
        return {
            "balance": current_user["balance"],
            "account_number": current_user["account_number"],
            "recent_transactions": transactions_result["transactions"],
            "statistics": user_stats
        }
        
    except Exception as e:
        logger.error(f"Dashboard stats error for user {current_user['id']}: {e}")
        raise HTTPException(status_code=500, detail="Failed to load dashboard")

@api_router.post("/transactions/transfer")
async def create_transfer(
    transaction_data: TransactionCreate,
    current_user: dict = Depends(get_current_user),
    request: Request,
    background_tasks: BackgroundTasks
):
    """Enhanced money transfer with validation and monitoring"""
    
    if transaction_data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    # Validate transaction limits
    limit_validation = security_manager.validate_transaction_limits(
        current_user["role"],
        transaction_data.amount
    )
    
    if not limit_validation["valid"]:
        raise HTTPException(status_code=400, detail=limit_validation["reason"])
    
    # Check current balance
    current_balance = current_user["balance"]
    if current_balance < transaction_data.amount:
        await log_security_event(
            current_user["id"],
            "transfer_failed",
            {"reason": "insufficient_funds", "attempted_amount": transaction_data.amount},
            request
        )
        raise HTTPException(status_code=400, detail="Insufficient funds")
    
    # Find recipient
    recipient = await db_manager.get_user_by_account_number(transaction_data.to_account)
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient account not found")
    
    if not recipient.get("is_active"):
        raise HTTPException(status_code=400, detail="Recipient account is inactive")
    
    # Create transaction with signature
    transaction = {
        "id": str(uuid.uuid4()),
        "from_account": current_user["account_number"],
        "to_account": transaction_data.to_account,
        "amount": transaction_data.amount,
        "transaction_type": "transfer",
        "description": transaction_data.description,
        "status": "pending",
        "created_at": datetime.utcnow(),
        "user_id": current_user["id"]
    }
    
    # Add digital signature
    signature = security_manager.sign_transaction(transaction, current_user["id"])
    transaction["signature"] = signature
    
    try:
        # Update balances atomically
        sender_updated = await db_manager.update_user_balance(
            current_user["account_number"],
            -transaction_data.amount
        )
        
        if not sender_updated:
            raise HTTPException(status_code=400, detail="Insufficient funds")
        
        recipient_updated = await db_manager.update_user_balance(
            transaction_data.to_account,
            transaction_data.amount
        )
        
        if recipient_updated:
            transaction["status"] = "completed"
            transaction_id = await db_manager.create_transaction(transaction)
            
            # Log successful transfer
            await log_security_event(
                current_user["id"],
                "transfer_completed",
                {
                    "transaction_id": transaction_id,
                    "amount": transaction_data.amount,
                    "to_account": transaction_data.to_account
                },
                request
            )
            
            # Invalidate caches
            await cache_manager.adelete(f"user:account:{current_user['account_number']}")
            await cache_manager.adelete(f"user:account:{transaction_data.to_account}")
            
            return {"message": "Transfer successful", "transaction_id": transaction_id}
        else:
            # Rollback sender balance
            await db_manager.update_user_balance(
                current_user["account_number"],
                transaction_data.amount
            )
            raise HTTPException(status_code=500, detail="Transfer failed - recipient update failed")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transfer error: {e}")
        transaction["status"] = "failed"
        await db_manager.create_transaction(transaction)
        raise HTTPException(status_code=500, detail="Transfer failed")

@api_router.get("/transactions")
async def get_transactions(
    page: int = 1,
    limit: int = 20,
    transaction_type: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get paginated transaction history"""
    
    if limit > 100:
        limit = 100  # Prevent excessive data retrieval
    
    result = await db_manager.get_transactions_paginated(
        current_user["account_number"],
        page=page,
        limit=limit,
        transaction_type=transaction_type,
        status=status
    )
    
    return result

# Enhanced M-Pesa Endpoints
@api_router.post("/mpesa/deposit")
async def mpesa_deposit(
    payment_data: MpesaPayment,
    current_user: dict = Depends(get_current_user),
    request: Request
):
    """Enhanced M-Pesa deposit with validation"""
    
    if payment_data.account_number != current_user["account_number"]:
        await log_security_event(
            current_user["id"],
            "mpesa_deposit_unauthorized",
            {"attempted_account": payment_data.account_number},
            request
        )
        raise HTTPException(status_code=403, detail="Can only deposit to your own account")
    
    try:
        result = await initiate_stk_push(
            payment_data.phone,
            payment_data.amount,
            payment_data.account_number,
            current_user["id"]
        )
        
        # Create pending transaction
        transaction = {
            "id": str(uuid.uuid4()),
            "to_account": payment_data.account_number,
            "amount": payment_data.amount,
            "transaction_type": "mpesa_deposit",
            "description": f"M-Pesa deposit from {security_manager.mask_sensitive_data(payment_data.phone)}",
            "status": "pending",
            "mpesa_code": result.get("CheckoutRequestID"),
            "created_at": datetime.utcnow(),
            "user_id": current_user["id"]
        }
        
        transaction_id = await db_manager.create_transaction(transaction)
        
        return {
            "message": "STK Push sent to your phone",
            "checkout_request_id": result.get("CheckoutRequestID"),
            "transaction_id": transaction_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"M-Pesa deposit error: {e}")
        raise HTTPException(status_code=500, detail="M-Pesa service error")

@api_router.post("/mpesa/callback")
async def mpesa_callback(request: Request):
    """Enhanced M-Pesa callback with comprehensive processing"""
    try:
        data = await request.json()
        logger.info(f"M-Pesa callback received: {json.dumps(data, default=str)}")
        
        callback_data = data.get("Body", {}).get("stkCallback", {})
        checkout_request_id = callback_data.get("CheckoutRequestID")
        result_code = callback_data.get("ResultCode")
        
        if not checkout_request_id:
            logger.error("Missing CheckoutRequestID in callback")
            return {"ResultCode": 1, "ResultDesc": "Missing CheckoutRequestID"}
        
        # Find transaction
        transaction = await db_manager.db.transactions.find_one({
            "mpesa_code": checkout_request_id
        })
        
        if not transaction:
            logger.error(f"Transaction not found for CheckoutRequestID: {checkout_request_id}")
            return {"ResultCode": 1, "ResultDesc": "Transaction not found"}
        
        if result_code == 0:  # Success
            # Extract callback metadata
            callback_metadata = callback_data.get("CallbackMetadata", {}).get("Item", [])
            amount = None
            mpesa_receipt_number = None
            phone_number = None
            
            for item in callback_metadata:
                if item.get("Name") == "Amount":
                    amount = float(item.get("Value", 0))
                elif item.get("Name") == "MpesaReceiptNumber":
                    mpesa_receipt_number = item.get("Value")
                elif item.get("Name") == "PhoneNumber":
                    phone_number = item.get("Value")
            
            # Update transaction status
            await db_manager.db.transactions.update_one(
                {"mpesa_code": checkout_request_id},
                {
                    "$set": {
                        "status": "completed",
                        "mpesa_receipt_number": mpesa_receipt_number,
                        "completed_at": datetime.utcnow()
                    }
                }
            )
            
            # Update user balance
            balance_updated = await db_manager.update_user_balance(
                transaction["to_account"],
                amount or transaction["amount"]
            )
            
            if balance_updated:
                # Log successful deposit
                await db_manager.log_audit_event(
                    user_id=transaction.get("user_id", "unknown"),
                    action="mpesa_deposit_completed",
                    resource="mpesa",
                    details={
                        "amount": amount or transaction["amount"],
                        "receipt": mpesa_receipt_number,
                        "phone": security_manager.mask_sensitive_data(phone_number or "unknown")
                    },
                    ip_address="mpesa_callback",
                    user_agent="mpesa_system"
                )
                
                logger.info(f"M-Pesa deposit completed: {checkout_request_id}, Amount: {amount}")
            else:
                logger.error(f"Failed to update balance for M-Pesa deposit: {checkout_request_id}")
                
        else:
            # Failed transaction
            result_desc = callback_data.get("ResultDesc", "Unknown error")
            
            await db_manager.db.transactions.update_one(
                {"mpesa_code": checkout_request_id},
                {
                    "$set": {
                        "status": "failed",
                        "failure_reason": result_desc,
                        "completed_at": datetime.utcnow()
                    }
                }
            )
            
            logger.info(f"M-Pesa deposit failed: {checkout_request_id}, Reason: {result_desc}")
    
        return {"ResultCode": 0, "ResultDesc": "Success"}
        
    except Exception as e:
        logger.error(f"M-Pesa callback error: {e}")
        return {"ResultCode": 1, "ResultDesc": "Internal server error"}

# Enhanced Admin Endpoints
@api_router.get("/admin/users", response_model=List[UserResponse])
async def get_all_users(
    page: int = 1,
    limit: int = 50,
    role: Optional[str] = None,
    active: Optional[bool] = None,
    admin_user: dict = Depends(get_admin_user)
):
    """Get paginated users list with filtering"""
    
    skip = (page - 1) * limit
    if limit > 100:
        limit = 100
    
    query = {}
    if role:
        query["role"] = role
    if active is not None:
        query["is_active"] = active
    
    try:
        users = await db_manager.db.users.find(query)\
            .skip(skip)\
            .limit(limit)\
            .to_list(limit)
        
        return [
            UserResponse(**{
                k: v for k, v in user.items() 
                if k not in ['password_hash', 'password_salt', 'mfa_secret']
            })
            for user in users
        ]
        
    except Exception as e:
        logger.error(f"Admin get users error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve users")

@api_router.get("/admin/dashboard")
async def get_admin_dashboard(admin_user: dict = Depends(get_admin_user)):
    """Get comprehensive admin dashboard statistics"""
    
    try:
        stats = await db_manager.get_admin_dashboard_stats()
        return stats
    except Exception as e:
        logger.error(f"Admin dashboard error: {e}")
        raise HTTPException(status_code=500, detail="Failed to load admin dashboard")

@api_router.get("/admin/transactions")
async def get_all_transactions(
    page: int = 1,
    limit: int = 50,
    status: Optional[str] = None,
    transaction_type: Optional[str] = None,
    admin_user: dict = Depends(get_admin_user)
):
    """Get all transactions for admin oversight"""
    
    skip = (page - 1) * limit
    if limit > 100:
        limit = 100
    
    query = {}
    if status:
        query["status"] = status
    if transaction_type:
        query["transaction_type"] = transaction_type
    
    try:
        transactions = await db_manager.db.transactions.find(query)\
            .sort("created_at", -1)\
            .skip(skip)\
            .limit(limit)\
            .to_list(limit)
        
        # Convert ObjectId to string
        for transaction in transactions:
            if "_id" in transaction:
                transaction["_id"] = str(transaction["_id"])
        
        total_count = await db_manager.db.transactions.count_documents(query)
        
        return {
            "transactions": transactions,
            "total_count": total_count,
            "page": page,
            "limit": limit,
            "total_pages": (total_count + limit - 1) // limit
        }
        
    except Exception as e:
        logger.error(f"Admin get transactions error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve transactions")

# Health Check and Monitoring Endpoints
@api_router.get("/health", response_model=HealthResponse)
async def health_check():
    """Comprehensive health check endpoint"""
    
    if monitoring_manager:
        health_data = await monitoring_manager.get_comprehensive_health()
        return HealthResponse(**health_data)
    else:
        return HealthResponse(
            status="unknown",
            timestamp=datetime.utcnow().isoformat(),
            services={},
            system_metrics={}
        )

@api_router.get("/metrics")
async def get_metrics(admin_user: dict = Depends(get_admin_user)):
    """Get detailed system metrics (admin only)"""
    
    if not monitoring_manager:
        raise HTTPException(status_code=503, detail="Monitoring not available")
    
    try:
        return {
            "system_metrics": monitoring_manager.get_system_metrics().dict(),
            "cache_stats": cache_manager.get_cache_stats(),
            "recent_alerts": alert_manager.get_recent_alerts(hours=24),
            "uptime_seconds": (datetime.utcnow() - monitoring_manager.start_time).total_seconds()
        }
    except Exception as e:
        logger.error(f"Metrics error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve metrics")

# Include the API router
app.include_router(api_router)

# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "KenyaBank API v2.0 - Enterprise Banking Platform",
        "status": "operational",
        "docs": "/api/docs" if settings.debug else None
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8001,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )