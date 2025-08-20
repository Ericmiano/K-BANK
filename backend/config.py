"""
Configuration management for KenyaBank
Handles all environment variables and security configurations
"""
import os
from typing import Optional
from pydantic import BaseSettings, Field
from pathlib import Path

class Settings(BaseSettings):
    # Database Configuration
    mongo_url: str = Field(..., env="MONGO_URL")
    db_name: str = Field(default="kenyabank_prod", env="DB_NAME")
    
    # JWT Configuration
    secret_key: str = Field(default="kenyabank-ultra-secure-key-2024-production", env="SECRET_KEY")
    algorithm: str = Field(default="HS256", env="ALGORITHM")
    access_token_expire_minutes: int = Field(default=30, env="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(default=7, env="REFRESH_TOKEN_EXPIRE_DAYS")
    
    # M-Pesa Configuration
    mpesa_consumer_key: str = Field(..., env="MPESA_CONSUMER_KEY")
    mpesa_consumer_secret: str = Field(..., env="MPESA_CONSUMER_SECRET")
    mpesa_business_shortcode: str = Field(..., env="MPESA_BUSINESS_SHORTCODE")
    mpesa_passkey: str = Field(..., env="MPESA_PASSKEY")
    mpesa_base_url: str = Field(default="https://sandbox.safaricom.co.ke", env="MPESA_BASE_URL")
    
    # Security Configuration
    encryption_key: str = Field(default="kenyabank-encryption-key-256bit", env="ENCRYPTION_KEY")
    rate_limit_per_minute: int = Field(default=100, env="RATE_LIMIT_PER_MINUTE")
    max_login_attempts: int = Field(default=5, env="MAX_LOGIN_ATTEMPTS")
    account_lockout_duration: int = Field(default=900, env="ACCOUNT_LOCKOUT_DURATION")  # 15 minutes
    
    # Redis Configuration
    redis_url: str = Field(default="redis://localhost:6379", env="REDIS_URL")
    redis_password: Optional[str] = Field(default=None, env="REDIS_PASSWORD")
    
    # Email Configuration for MFA
    smtp_server: str = Field(default="smtp.gmail.com", env="SMTP_SERVER")
    smtp_port: int = Field(default=587, env="SMTP_PORT")
    smtp_username: Optional[str] = Field(default=None, env="SMTP_USERNAME")
    smtp_password: Optional[str] = Field(default=None, env="SMTP_PASSWORD")
    
    # Application Configuration
    app_name: str = Field(default="KenyaBank", env="APP_NAME")
    environment: str = Field(default="development", env="ENVIRONMENT")
    debug: bool = Field(default=False, env="DEBUG")
    cors_origins: list = Field(default=["*"], env="CORS_ORIGINS")
    
    # File Upload Configuration
    max_file_size: int = Field(default=10485760, env="MAX_FILE_SIZE")  # 10MB
    allowed_file_types: list = Field(default=[".jpg", ".jpeg", ".png", ".pdf"], env="ALLOWED_FILE_TYPES")
    
    # Monitoring Configuration
    sentry_dsn: Optional[str] = Field(default=None, env="SENTRY_DSN")
    log_level: str = Field(default="INFO", env="LOG_LEVEL")
    
    class Config:
        env_file = ".env"
        case_sensitive = False

# Global settings instance
settings = Settings()

# Security Headers Configuration
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY", 
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https:; connect-src 'self' https:; frame-ancestors 'none';",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
}

# Database Indexes Configuration
DATABASE_INDEXES = [
    # Users collection indexes
    {"collection": "users", "index": "email", "unique": True},
    {"collection": "users", "index": "account_number", "unique": True},
    {"collection": "users", "index": "phone", "unique": True},
    {"collection": "users", "index": "created_at"},
    {"collection": "users", "index": "role"},
    {"collection": "users", "index": "is_active"},
    
    # Transactions collection indexes
    {"collection": "transactions", "index": "from_account"},
    {"collection": "transactions", "index": "to_account"},
    {"collection": "transactions", "index": "created_at"},
    {"collection": "transactions", "index": "status"},
    {"collection": "transactions", "index": "transaction_type"},
    {"collection": "transactions", "index": "mpesa_code"},
    {"collection": "transactions", "index": [("from_account", 1), ("created_at", -1)]},
    {"collection": "transactions", "index": [("to_account", 1), ("created_at", -1)]},
    
    # Audit logs collection indexes
    {"collection": "audit_logs", "index": "user_id"},
    {"collection": "audit_logs", "index": "action"},
    {"collection": "audit_logs", "index": "timestamp"},
    {"collection": "audit_logs", "index": [("user_id", 1), ("timestamp", -1)]},
    
    # MFA tokens collection indexes
    {"collection": "mfa_tokens", "index": "user_id"},
    {"collection": "mfa_tokens", "index": "expires_at"},
    {"collection": "mfa_tokens", "index": "used"},
    
    # Login attempts collection indexes
    {"collection": "login_attempts", "index": "email"},
    {"collection": "login_attempts", "index": "ip_address"},
    {"collection": "login_attempts", "index": "timestamp"},
    {"collection": "login_attempts", "index": [("email", 1), ("timestamp", -1)]},
]