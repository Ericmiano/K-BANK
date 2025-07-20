from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import hashlib
import jwt
import aiohttp
import base64
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
SECRET_KEY = "your-banking-secret-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# M-Pesa Configuration
MPESA_CONSUMER_KEY = "Ybrio42FAVwcDHQ56sLLquKcOrnWhiE3nhZnVUK3p339hSNs"
MPESA_CONSUMER_SECRET = "b76xlGaa3AGrG0fFPRTGJdnmntItSLD0dpm4Du6U8CiK9cE46XUbZT2KbtwTusUf"
MPESA_BUSINESS_SHORTCODE = "174379"
MPESA_PASSKEY = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919"
MPESA_BASE_URL = "https://sandbox.safaricom.co.ke"

# Create the main app
app = FastAPI(title="KenyaBank API", version="1.0.0")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    full_name: str
    phone: str
    password_hash: str
    role: str = "customer"  # customer or admin
    account_number: str = Field(default_factory=lambda: f"KB{str(uuid.uuid4())[:10].upper()}")
    balance: float = 0.0
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserCreate(BaseModel):
    email: str
    full_name: str
    phone: str
    password: str
    role: Optional[str] = "customer"

class UserLogin(BaseModel):
    email: str
    password: str

class Transaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    from_account: Optional[str] = None
    to_account: Optional[str] = None
    amount: float
    transaction_type: str  # deposit, withdrawal, transfer, mpesa_deposit, mpesa_withdrawal
    description: str
    status: str = "pending"  # pending, completed, failed
    mpesa_code: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TransactionCreate(BaseModel):
    to_account: Optional[str] = None
    amount: float
    transaction_type: str
    description: str

class MpesaPayment(BaseModel):
    phone: str
    amount: float
    account_number: str

class Token(BaseModel):
    access_token: str
    token_type: str

class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    phone: str
    role: str
    account_number: str
    balance: float
    is_active: bool
    created_at: datetime

# Utility Functions
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, hashed_password: str) -> bool:
    return hashlib.sha256(password.encode()).hexdigest() == hashed_password

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        
        user_data = await db.users.find_one({"email": email})
        if user_data is None:
            raise HTTPException(status_code=401, detail="User not found")
        
        return User(**user_data)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

async def get_admin_user(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

# M-Pesa Functions
async def get_mpesa_access_token():
    auth_string = f"{MPESA_CONSUMER_KEY}:{MPESA_CONSUMER_SECRET}"
    encoded = base64.b64encode(auth_string.encode()).decode()
    url = f"{MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials"
    headers = {"Authorization": f"Basic {encoded}"}
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers) as response:
            data = await response.json()
            return data.get("access_token")

async def initiate_stk_push(phone: str, amount: float, account_number: str):
    access_token = await get_mpesa_access_token()
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    password = base64.b64encode(
        f"{MPESA_BUSINESS_SHORTCODE}{MPESA_PASSKEY}{timestamp}".encode()
    ).decode()
    
    payload = {
        "BusinessShortCode": MPESA_BUSINESS_SHORTCODE,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": int(amount),
        "PartyA": phone,
        "PartyB": MPESA_BUSINESS_SHORTCODE,
        "PhoneNumber": phone,
        "CallBackURL": "https://f874cc22-69ba-48b8-8a48-c9cc4b777336.preview.emergentagent.com/api/mpesa/callback",
        "AccountReference": account_number,
        "TransactionDesc": "Bank Deposit"
    }
    
    url = f"{MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest"
    headers = {"Authorization": f"Bearer {access_token}"}
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, headers=headers) as response:
            return await response.json()

# Authentication Endpoints
@api_router.post("/auth/register", response_model=UserResponse)
async def register_user(user_data: UserCreate):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    hashed_password = hash_password(user_data.password)
    user = User(
        email=user_data.email,
        full_name=user_data.full_name,
        phone=user_data.phone,
        password_hash=hashed_password,
        role=user_data.role,
        balance=1000.0  # Initial bonus balance
    )
    
    await db.users.insert_one(user.dict())
    
    return UserResponse(**user.dict())

@api_router.post("/auth/login", response_model=Token)
async def login(user_data: UserLogin):
    user_doc = await db.users.find_one({"email": user_data.email})
    if not user_doc or not verify_password(user_data.password, user_doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user_data.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@api_router.get("/auth/me", response_model=UserResponse)
async def get_user_profile(current_user: User = Depends(get_current_user)):
    return UserResponse(**current_user.dict())

# Banking Endpoints
@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: User = Depends(get_current_user)):
    # Get recent transactions
    recent_transactions = await db.transactions.find({
        "$or": [
            {"from_account": current_user.account_number},
            {"to_account": current_user.account_number}
        ]
    }).sort("created_at", -1).limit(5).to_list(5)
    
    return {
        "balance": current_user.balance,
        "account_number": current_user.account_number,
        "recent_transactions": recent_transactions
    }

@api_router.post("/transactions/transfer")
async def create_transfer(transaction_data: TransactionCreate, current_user: User = Depends(get_current_user)):
    if transaction_data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    if current_user.balance < transaction_data.amount:
        raise HTTPException(status_code=400, detail="Insufficient funds")
    
    # Find recipient
    recipient = await db.users.find_one({"account_number": transaction_data.to_account})
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient account not found")
    
    # Create transaction
    transaction = Transaction(
        from_account=current_user.account_number,
        to_account=transaction_data.to_account,
        amount=transaction_data.amount,
        transaction_type="transfer",
        description=transaction_data.description,
        status="completed"
    )
    
    # Update balances
    await db.users.update_one(
        {"account_number": current_user.account_number},
        {"$inc": {"balance": -transaction_data.amount}}
    )
    
    await db.users.update_one(
        {"account_number": transaction_data.to_account},
        {"$inc": {"balance": transaction_data.amount}}
    )
    
    await db.transactions.insert_one(transaction.dict())
    
    return {"message": "Transfer successful", "transaction_id": transaction.id}

@api_router.get("/transactions")
async def get_transactions(current_user: User = Depends(get_current_user)):
    transactions = await db.transactions.find({
        "$or": [
            {"from_account": current_user.account_number},
            {"to_account": current_user.account_number}
        ]
    }).sort("created_at", -1).to_list(50)
    
    return transactions

# M-Pesa Endpoints
@api_router.post("/mpesa/deposit")
async def mpesa_deposit(payment_data: MpesaPayment, current_user: User = Depends(get_current_user)):
    if payment_data.account_number != current_user.account_number:
        raise HTTPException(status_code=403, detail="Can only deposit to your own account")
    
    result = await initiate_stk_push(payment_data.phone, payment_data.amount, payment_data.account_number)
    
    # Create pending transaction
    transaction = Transaction(
        to_account=payment_data.account_number,
        amount=payment_data.amount,
        transaction_type="mpesa_deposit",
        description=f"M-Pesa deposit from {payment_data.phone}",
        status="pending",
        mpesa_code=result.get("CheckoutRequestID")
    )
    
    await db.transactions.insert_one(transaction.dict())
    
    return {"message": "STK Push sent to your phone", "checkout_request_id": result.get("CheckoutRequestID")}

@api_router.post("/mpesa/callback")
async def mpesa_callback(request: Request):
    data = await request.json()
    
    try:
        callback_data = data.get("Body", {}).get("stkCallback", {})
        checkout_request_id = callback_data.get("CheckoutRequestID")
        result_code = callback_data.get("ResultCode")
        
        if result_code == 0:  # Success
            # Find transaction
            transaction_doc = await db.transactions.find_one({"mpesa_code": checkout_request_id})
            if transaction_doc:
                # Update transaction status
                await db.transactions.update_one(
                    {"mpesa_code": checkout_request_id},
                    {"$set": {"status": "completed"}}
                )
                
                # Update user balance
                await db.users.update_one(
                    {"account_number": transaction_doc["to_account"]},
                    {"$inc": {"balance": transaction_doc["amount"]}}
                )
        else:
            # Failed transaction
            await db.transactions.update_one(
                {"mpesa_code": checkout_request_id},
                {"$set": {"status": "failed"}}
            )
    except Exception as e:
        logging.error(f"M-Pesa callback error: {e}")
    
    return {"ResultCode": 0, "ResultDesc": "Success"}

# Admin Endpoints
@api_router.get("/admin/users", response_model=List[UserResponse])
async def get_all_users(admin_user: User = Depends(get_admin_user)):
    users = await db.users.find().to_list(1000)
    return [UserResponse(**user) for user in users]

@api_router.post("/admin/users", response_model=UserResponse)
async def create_user_by_admin(user_data: UserCreate, admin_user: User = Depends(get_admin_user)):
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = hash_password(user_data.password)
    user = User(
        email=user_data.email,
        full_name=user_data.full_name,
        phone=user_data.phone,
        password_hash=hashed_password,
        role=user_data.role,
        balance=0.0
    )
    
    await db.users.insert_one(user.dict())
    return UserResponse(**user.dict())

@api_router.get("/admin/transactions")
async def get_all_transactions(admin_user: User = Depends(get_admin_user)):
    transactions = await db.transactions.find().sort("created_at", -1).limit(100).to_list(100)
    return transactions

@api_router.patch("/admin/users/{user_id}/status")
async def toggle_user_status(user_id: str, admin_user: User = Depends(get_admin_user)):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_active": not user["is_active"]}}
    )
    
    return {"message": "User status updated"}

# Include router
app.include_router(api_router)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()