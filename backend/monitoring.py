"""
Monitoring and Health Check System for KenyaBank
Implements health checks, metrics, and system monitoring
"""
import psutil
import time
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
import logging
import traceback
import json

logger = logging.getLogger(__name__)

class HealthCheck(BaseModel):
    service: str
    status: str  # 'healthy', 'degraded', 'unhealthy'
    response_time_ms: float
    timestamp: datetime
    details: Dict[str, Any] = {}
    error: Optional[str] = None

class SystemMetrics(BaseModel):
    timestamp: datetime
    cpu_usage_percent: float
    memory_usage_percent: float
    disk_usage_percent: float
    network_connections: int
    active_requests: int
    response_time_avg_ms: float
    error_rate_percent: float

class MonitoringManager:
    """System monitoring and health checks"""
    
    def __init__(self, db_client: AsyncIOMotorClient):
        self.db_client = db_client
        self.start_time = datetime.utcnow()
        self.request_count = 0
        self.error_count = 0
        self.response_times = []
        self.active_requests = 0
        
    async def check_database_health(self) -> HealthCheck:
        """Check database connectivity and performance"""
        start_time = time.time()
        
        try:
            # Test database connection
            await self.db_client.admin.command('ping')
            
            # Test basic operations
            db = self.db_client.kenyabank_prod
            await db.health_check.insert_one({
                "timestamp": datetime.utcnow(),
                "check": "database_health"
            })
            
            # Clean up test data
            await db.health_check.delete_many({
                "check": "database_health",
                "timestamp": {"$lt": datetime.utcnow() - timedelta(hours=1)}
            })
            
            response_time = (time.time() - start_time) * 1000
            
            return HealthCheck(
                service="database",
                status="healthy",
                response_time_ms=response_time,
                timestamp=datetime.utcnow(),
                details={
                    "connection": "ok",
                    "operations": "ok"
                }
            )
            
        except Exception as e:
            response_time = (time.time() - start_time) * 1000
            logger.error(f"Database health check failed: {e}")
            
            return HealthCheck(
                service="database",
                status="unhealthy",
                response_time_ms=response_time,
                timestamp=datetime.utcnow(),
                error=str(e),
                details={"error": str(e)}
            )
    
    async def check_redis_health(self) -> HealthCheck:
        """Check Redis connectivity and performance"""
        from cache import cache_manager
        
        start_time = time.time()
        
        try:
            if not cache_manager.redis_client:
                return HealthCheck(
                    service="redis",
                    status="degraded",
                    response_time_ms=0,
                    timestamp=datetime.utcnow(),
                    details={"connection": "not_configured"}
                )
            
            # Test Redis operations
            test_key = f"health_check_{int(time.time())}"
            test_value = "health_check_value"
            
            cache_manager.redis_client.set(test_key, test_value, ex=60)
            retrieved_value = cache_manager.redis_client.get(test_key)
            cache_manager.redis_client.delete(test_key)
            
            if retrieved_value != test_value:
                raise Exception("Redis read/write test failed")
            
            response_time = (time.time() - start_time) * 1000
            
            return HealthCheck(
                service="redis",
                status="healthy",
                response_time_ms=response_time,
                timestamp=datetime.utcnow(),
                details={
                    "connection": "ok",
                    "operations": "ok"
                }
            )
            
        except Exception as e:
            response_time = (time.time() - start_time) * 1000
            logger.error(f"Redis health check failed: {e}")
            
            return HealthCheck(
                service="redis",
                status="unhealthy",
                response_time_ms=response_time,
                timestamp=datetime.utcnow(),
                error=str(e),
                details={"error": str(e)}
            )
    
    async def check_mpesa_health(self) -> HealthCheck:
        """Check M-Pesa API connectivity"""
        start_time = time.time()
        
        try:
            from server import get_mpesa_access_token
            
            # Try to get M-Pesa access token
            token = await get_mpesa_access_token()
            
            if not token:
                raise Exception("Failed to get M-Pesa access token")
            
            response_time = (time.time() - start_time) * 1000
            
            return HealthCheck(
                service="mpesa",
                status="healthy",
                response_time_ms=response_time,
                timestamp=datetime.utcnow(),
                details={
                    "api_connection": "ok",
                    "token_retrieval": "ok"
                }
            )
            
        except Exception as e:
            response_time = (time.time() - start_time) * 1000
            logger.error(f"M-Pesa health check failed: {e}")
            
            return HealthCheck(
                service="mpesa",
                status="unhealthy",
                response_time_ms=response_time,
                timestamp=datetime.utcnow(),
                error=str(e),
                details={"error": str(e)}
            )
    
    def get_system_metrics(self) -> SystemMetrics:
        """Get current system metrics"""
        try:
            # CPU usage
            cpu_usage = psutil.cpu_percent(interval=1)
            
            # Memory usage
            memory = psutil.virtual_memory()
            memory_usage = memory.percent
            
            # Disk usage
            disk = psutil.disk_usage('/')
            disk_usage = (disk.used / disk.total) * 100
            
            # Network connections
            network_connections = len(psutil.net_connections())
            
            # Calculate average response time
            avg_response_time = 0
            if self.response_times:
                avg_response_time = sum(self.response_times[-100:]) / len(self.response_times[-100:])
            
            # Calculate error rate
            error_rate = 0
            if self.request_count > 0:
                error_rate = (self.error_count / self.request_count) * 100
            
            return SystemMetrics(
                timestamp=datetime.utcnow(),
                cpu_usage_percent=cpu_usage,
                memory_usage_percent=memory_usage,
                disk_usage_percent=disk_usage,
                network_connections=network_connections,
                active_requests=self.active_requests,
                response_time_avg_ms=avg_response_time,
                error_rate_percent=error_rate
            )
            
        except Exception as e:
            logger.error(f"Failed to get system metrics: {e}")
            return SystemMetrics(
                timestamp=datetime.utcnow(),
                cpu_usage_percent=0,
                memory_usage_percent=0,
                disk_usage_percent=0,
                network_connections=0,
                active_requests=self.active_requests,
                response_time_avg_ms=0,
                error_rate_percent=0
            )
    
    async def get_comprehensive_health(self) -> Dict[str, Any]:
        """Get comprehensive system health status"""
        health_checks = await asyncio.gather(
            self.check_database_health(),
            self.check_redis_health(),
            self.check_mpesa_health(),
            return_exceptions=True
        )
        
        system_metrics = self.get_system_metrics()
        
        # Determine overall status
        overall_status = "healthy"
        unhealthy_services = []
        
        for check in health_checks:
            if isinstance(check, HealthCheck):
                if check.status == "unhealthy":
                    unhealthy_services.append(check.service)
                    overall_status = "unhealthy"
                elif check.status == "degraded" and overall_status == "healthy":
                    overall_status = "degraded"
        
        uptime_seconds = (datetime.utcnow() - self.start_time).total_seconds()
        
        return {
            "status": overall_status,
            "timestamp": datetime.utcnow().isoformat(),
            "uptime_seconds": uptime_seconds,
            "services": {
                check.service: {
                    "status": check.status,
                    "response_time_ms": check.response_time_ms,
                    "details": check.details,
                    "error": check.error
                } for check in health_checks if isinstance(check, HealthCheck)
            },
            "system_metrics": {
                "cpu_usage_percent": system_metrics.cpu_usage_percent,
                "memory_usage_percent": system_metrics.memory_usage_percent,
                "disk_usage_percent": system_metrics.disk_usage_percent,
                "network_connections": system_metrics.network_connections,
                "active_requests": system_metrics.active_requests,
                "avg_response_time_ms": system_metrics.response_time_avg_ms,
                "error_rate_percent": system_metrics.error_rate_percent
            },
            "request_stats": {
                "total_requests": self.request_count,
                "error_count": self.error_count,
                "success_rate": ((self.request_count - self.error_count) / max(self.request_count, 1)) * 100
            }
        }
    
    def record_request(self, response_time_ms: float, is_error: bool = False):
        """Record request metrics"""
        self.request_count += 1
        self.response_times.append(response_time_ms)
        
        if is_error:
            self.error_count += 1
        
        # Keep only recent response times (last 1000)
        if len(self.response_times) > 1000:
            self.response_times = self.response_times[-1000:]
    
    def increment_active_requests(self):
        """Increment active request counter"""
        self.active_requests += 1
    
    def decrement_active_requests(self):
        """Decrement active request counter"""
        self.active_requests = max(0, self.active_requests - 1)

class AlertManager:
    """Alert management for critical system events"""
    
    def __init__(self):
        self.alert_thresholds = {
            "cpu_usage": 80,
            "memory_usage": 85,
            "disk_usage": 90,
            "error_rate": 5,
            "response_time": 5000
        }
        self.alert_history = []
    
    async def check_and_send_alerts(self, metrics: SystemMetrics):
        """Check metrics and send alerts if thresholds exceeded"""
        alerts = []
        
        if metrics.cpu_usage_percent > self.alert_thresholds["cpu_usage"]:
            alerts.append({
                "type": "cpu_usage",
                "severity": "high",
                "message": f"High CPU usage: {metrics.cpu_usage_percent:.1f}%",
                "threshold": self.alert_thresholds["cpu_usage"],
                "current_value": metrics.cpu_usage_percent
            })
        
        if metrics.memory_usage_percent > self.alert_thresholds["memory_usage"]:
            alerts.append({
                "type": "memory_usage",
                "severity": "high",
                "message": f"High memory usage: {metrics.memory_usage_percent:.1f}%",
                "threshold": self.alert_thresholds["memory_usage"],
                "current_value": metrics.memory_usage_percent
            })
        
        if metrics.disk_usage_percent > self.alert_thresholds["disk_usage"]:
            alerts.append({
                "type": "disk_usage",
                "severity": "critical",
                "message": f"High disk usage: {metrics.disk_usage_percent:.1f}%",
                "threshold": self.alert_thresholds["disk_usage"],
                "current_value": metrics.disk_usage_percent
            })
        
        if metrics.error_rate_percent > self.alert_thresholds["error_rate"]:
            alerts.append({
                "type": "error_rate",
                "severity": "medium",
                "message": f"High error rate: {metrics.error_rate_percent:.1f}%",
                "threshold": self.alert_thresholds["error_rate"],
                "current_value": metrics.error_rate_percent
            })
        
        if metrics.response_time_avg_ms > self.alert_thresholds["response_time"]:
            alerts.append({
                "type": "response_time",
                "severity": "medium",
                "message": f"High response time: {metrics.response_time_avg_ms:.1f}ms",
                "threshold": self.alert_thresholds["response_time"],
                "current_value": metrics.response_time_avg_ms
            })
        
        for alert in alerts:
            await self.send_alert(alert)
    
    async def send_alert(self, alert: Dict[str, Any]):
        """Send alert notification"""
        alert["timestamp"] = datetime.utcnow().isoformat()
        self.alert_history.append(alert)
        
        # Keep only recent alerts (last 1000)
        if len(self.alert_history) > 1000:
            self.alert_history = self.alert_history[-1000:]
        
        # Log alert
        logger.warning(f"ALERT [{alert['severity'].upper()}]: {alert['message']}")
        
        # In production, integrate with alerting services like PagerDuty, Slack, etc.
        # Example: await self.send_to_slack(alert)
        # Example: await self.send_to_pagerduty(alert)
    
    def get_recent_alerts(self, hours: int = 24) -> List[Dict[str, Any]]:
        """Get alerts from the last N hours"""
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)
        
        return [
            alert for alert in self.alert_history
            if datetime.fromisoformat(alert["timestamp"].replace('Z', '+00:00')) > cutoff_time
        ]