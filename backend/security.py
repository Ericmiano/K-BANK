"""
Enhanced Security Module for KenyaBank
Implements MFA, rate limiting, encryption, and security monitoring
"""
import hashlib
import secrets
import hmac
import base64
import pyotp
import qrcode
import io
import json
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from pydantic import BaseModel, Field
from email.mime.text import MimeText
from email.mime.multipart import MimeMultipart
import smtplib
import jwt
from config import settings
import logging

logger = logging.getLogger(__name__)

# Models
class MFAToken(BaseModel):
    id: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    user_id: str
    token: str
    expires_at: datetime
    used: bool = False
    method: str  # 'email', 'sms', 'totp'
    created_at: datetime = Field(default_factory=datetime.utcnow)

class LoginAttempt(BaseModel):
    id: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    email: str
    ip_address: str
    user_agent: str
    success: bool
    failure_reason: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class AuditLog(BaseModel):
    id: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    user_id: str
    action: str
    resource: str
    details: Dict[str, Any]
    ip_address: str
    user_agent: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class SecurityManager:
    """Enhanced security management for banking operations"""
    
    def __init__(self):
        self.cipher_suite = self._setup_encryption()
        
    def _setup_encryption(self) -> Fernet:
        """Setup encryption using the configured key"""
        key = settings.encryption_key.encode()
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b'kenyabank_salt_2024',
            iterations=100000,
        )
        fernet_key = base64.urlsafe_b64encode(kdf.derive(key))
        return Fernet(fernet_key)
    
    def encrypt_data(self, data: str) -> str:
        """Encrypt sensitive data"""
        try:
            encrypted = self.cipher_suite.encrypt(data.encode())
            return base64.urlsafe_b64encode(encrypted).decode()
        except Exception as e:
            logger.error(f"Encryption failed: {e}")
            raise
    
    def decrypt_data(self, encrypted_data: str) -> str:
        """Decrypt sensitive data"""
        try:
            encrypted_bytes = base64.urlsafe_b64decode(encrypted_data.encode())
            decrypted = self.cipher_suite.decrypt(encrypted_bytes)
            return decrypted.decode()
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            raise
    
    def hash_password(self, password: str, salt: Optional[str] = None) -> tuple:
        """Enhanced password hashing with salt"""
        if salt is None:
            salt = secrets.token_hex(32)
        
        # Use PBKDF2 with SHA-256 for stronger password hashing
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt.encode(),
            iterations=100000,
        )
        key = kdf.derive(password.encode())
        hashed_password = base64.urlsafe_b64encode(key).decode()
        
        return hashed_password, salt
    
    def verify_password(self, password: str, hashed_password: str, salt: str) -> bool:
        """Verify password against hash"""
        try:
            test_hash, _ = self.hash_password(password, salt)
            return hmac.compare_digest(hashed_password, test_hash)
        except Exception as e:
            logger.error(f"Password verification failed: {e}")
            return False
    
    def generate_mfa_token(self, length: int = 6) -> str:
        """Generate secure MFA token"""
        return str(secrets.randbelow(10**length)).zfill(length)
    
    def generate_totp_secret(self) -> str:
        """Generate TOTP secret for authenticator apps"""
        return pyotp.random_base32()
    
    def generate_totp_qr_code(self, user_email: str, secret: str) -> bytes:
        """Generate QR code for TOTP setup"""
        totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
            name=user_email,
            issuer_name=settings.app_name
        )
        
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(totp_uri)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        img_buffer = io.BytesIO()
        img.save(img_buffer, format='PNG')
        img_buffer.seek(0)
        
        return img_buffer.getvalue()
    
    def verify_totp(self, secret: str, token: str) -> bool:
        """Verify TOTP token"""
        try:
            totp = pyotp.TOTP(secret)
            return totp.verify(token, valid_window=1)  # Allow 1 window for time drift
        except Exception as e:
            logger.error(f"TOTP verification failed: {e}")
            return False
    
    def create_jwt_token(self, data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
        """Create JWT token with enhanced security"""
        to_encode = data.copy()
        
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
        
        to_encode.update({
            "exp": expire,
            "iat": datetime.utcnow(),
            "iss": settings.app_name,
            "jti": secrets.token_urlsafe(32)  # Unique token ID for revocation
        })
        
        return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    
    def verify_jwt_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify JWT token with enhanced checks"""
        try:
            payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
            
            # Verify issuer
            if payload.get("iss") != settings.app_name:
                logger.warning(f"Invalid issuer in JWT: {payload.get('iss')}")
                return None
                
            return payload
        except jwt.ExpiredSignatureError:
            logger.warning("JWT token expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid JWT token: {e}")
            return None
    
    def sign_transaction(self, transaction_data: Dict[str, Any], user_private_key: str) -> str:
        """Create digital signature for financial transactions"""
        # Create transaction hash
        transaction_string = json.dumps(transaction_data, sort_keys=True)
        transaction_hash = hashlib.sha256(transaction_string.encode()).hexdigest()
        
        # Sign with HMAC (simplified version - in production, use RSA/ECDSA)
        signature = hmac.new(
            user_private_key.encode(),
            transaction_hash.encode(),
            hashlib.sha256
        ).hexdigest()
        
        return signature
    
    def verify_transaction_signature(self, transaction_data: Dict[str, Any], signature: str, user_private_key: str) -> bool:
        """Verify transaction signature"""
        try:
            expected_signature = self.sign_transaction(transaction_data, user_private_key)
            return hmac.compare_digest(signature, expected_signature)
        except Exception as e:
            logger.error(f"Signature verification failed: {e}")
            return False
    
    def mask_sensitive_data(self, data: str, mask_char: str = "*", visible_chars: int = 4) -> str:
        """Mask sensitive data for logging/display"""
        if len(data) <= visible_chars * 2:
            return mask_char * len(data)
        
        return data[:visible_chars] + mask_char * (len(data) - visible_chars * 2) + data[-visible_chars:]
    
    def validate_transaction_limits(self, user_role: str, amount: float) -> Dict[str, Any]:
        """Validate transaction limits based on user role"""
        limits = {
            "customer": {"daily": 100000, "monthly": 500000, "single": 50000},
            "admin": {"daily": 1000000, "monthly": 5000000, "single": 500000}
        }
        
        user_limits = limits.get(user_role, limits["customer"])
        
        result = {
            "valid": True,
            "reason": None,
            "limits": user_limits
        }
        
        if amount > user_limits["single"]:
            result["valid"] = False
            result["reason"] = f"Amount exceeds single transaction limit of KES {user_limits['single']:,.2f}"
        
        return result

class RateLimiter:
    """Rate limiting implementation"""
    
    def __init__(self):
        self.attempts = {}  # In production, use Redis
    
    def is_rate_limited(self, identifier: str, limit: int = None, window: int = 60) -> bool:
        """Check if identifier is rate limited"""
        if limit is None:
            limit = settings.rate_limit_per_minute
        
        now = time.time()
        identifier_data = self.attempts.get(identifier, [])
        
        # Clean old attempts
        identifier_data = [attempt_time for attempt_time in identifier_data if now - attempt_time < window]
        
        # Check if limit exceeded
        if len(identifier_data) >= limit:
            return True
        
        # Record new attempt
        identifier_data.append(now)
        self.attempts[identifier] = identifier_data
        
        return False
    
    def get_remaining_attempts(self, identifier: str, limit: int = None) -> int:
        """Get remaining attempts for identifier"""
        if limit is None:
            limit = settings.rate_limit_per_minute
        
        current_attempts = len(self.attempts.get(identifier, []))
        return max(0, limit - current_attempts)

class EmailService:
    """Email service for MFA and notifications"""
    
    def __init__(self):
        self.smtp_server = settings.smtp_server
        self.smtp_port = settings.smtp_port
        self.username = settings.smtp_username
        self.password = settings.smtp_password
    
    def send_mfa_email(self, recipient_email: str, mfa_code: str, user_name: str) -> bool:
        """Send MFA code via email"""
        if not self.username or not self.password:
            logger.warning("Email credentials not configured")
            return False
        
        try:
            msg = MimeMultipart()
            msg['From'] = self.username
            msg['To'] = recipient_email
            msg['Subject'] = f"{settings.app_name} - Verification Code"
            
            body = f"""
            Dear {user_name},
            
            Your verification code is: {mfa_code}
            
            This code will expire in 5 minutes.
            
            If you did not request this code, please contact our security team immediately.
            
            Best regards,
            {settings.app_name} Security Team
            """
            
            msg.attach(MimeText(body, 'plain'))
            
            server = smtplib.SMTP(self.smtp_server, self.smtp_port)
            server.starttls()
            server.login(self.username, self.password)
            server.send_message(msg)
            server.quit()
            
            return True
        except Exception as e:
            logger.error(f"Failed to send MFA email: {e}")
            return False
    
    def send_security_alert(self, recipient_email: str, alert_message: str, user_name: str) -> bool:
        """Send security alert email"""
        if not self.username or not self.password:
            logger.warning("Email credentials not configured")
            return False
        
        try:
            msg = MimeMultipart()
            msg['From'] = self.username
            msg['To'] = recipient_email
            msg['Subject'] = f"{settings.app_name} - Security Alert"
            
            body = f"""
            Dear {user_name},
            
            SECURITY ALERT: {alert_message}
            
            Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}
            
            If this was not you, please contact our security team immediately and change your password.
            
            Best regards,
            {settings.app_name} Security Team
            """
            
            msg.attach(MimeText(body, 'plain'))
            
            server = smtplib.SMTP(self.smtp_server, self.smtp_port)
            server.starttls()
            server.login(self.username, self.password)
            server.send_message(msg)
            server.quit()
            
            return True
        except Exception as e:
            logger.error(f"Failed to send security alert: {e}")
            return False

# Global instances
security_manager = SecurityManager()
rate_limiter = RateLimiter()
email_service = EmailService()