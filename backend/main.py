import os

# Load .env into os.environ BEFORE any imports that read from os.environ
_env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(_env_path):
    with open(_env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, _, val = line.partition('=')
                key = key.strip()
                val = val.strip().strip("'\"")
                if key and not os.environ.get(key):
                    os.environ[key] = val

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
import logging
import sys
from typing import Optional

from routers import (
    auth_users,
    admin_auth,
    channels,
    epg,
    recordings,
    favorites,
    notifications,
    search,
    admin_dashboard,
    analytics,
    settings as settings_router,
    webhook,
    parental,
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger('tv-backend')


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')
    ENVIRONMENT: str = 'development'
    ADMIN_USER: str = 'admin'
    ADMIN_PASS_HASH: str = ''
    JWT_SECRET: str = ''
    JWT_ALGORITHM: str = 'HS256'
    JWT_EXPIRY_MINUTES: int = 1440
    MUX_TOKEN_ID: str = ''
    MUX_TOKEN_SECRET: str = ''
    MUX_WEBHOOK_SECRET: str = ''
    FRONTEND_ORIGIN: str = 'http://localhost:3001'
    KV_REST_API_URL: Optional[str] = None
    KV_REST_API_TOKEN: Optional[str] = None
    BLOB_READ_WRITE_TOKEN: Optional[str] = None
    MAX_LOGIN_ATTEMPTS: int = 5
    SIGNUP_RATE_LIMIT: str = '10/hour'

    @field_validator('JWT_SECRET')
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        if len(v) < 64:
            raise ValueError('JWT_SECRET must be at least 64 characters long')
        return v

    @field_validator('FRONTEND_ORIGIN')
    @classmethod
    def validate_frontend_origin(cls, v: str) -> str:
        return v.rstrip('/')

    @field_validator('ENVIRONMENT')
    @classmethod
    def validate_environment(cls, v: str) -> str:
        if v not in ('development', 'production'):
            raise ValueError('ENVIRONMENT must be development or production')
        return v


settings = Settings()

app = FastAPI(
    title='TV Stream Backend',
    version='2.0.0',
    debug=(settings.ENVIRONMENT == 'development')
)


@app.middleware('http')
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    if settings.ENVIRONMENT == 'production':
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    if 'Server' in response.headers:
        del response.headers['Server']
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(settings.FRONTEND_ORIGIN)],
    allow_credentials=True,
    allow_methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allow_headers=['*'],
)

limiter = Limiter(key_func=get_remote_address, default_limits=['100/minute'])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

config = {
    'ADMIN_USER': settings.ADMIN_USER,
    'ADMIN_PASS_HASH': settings.ADMIN_PASS_HASH,
    'JWT_SECRET': settings.JWT_SECRET,
    'JWT_ALGORITHM': settings.JWT_ALGORITHM,
    'JWT_EXPIRY_MINUTES': settings.JWT_EXPIRY_MINUTES,
    'ENVIRONMENT': settings.ENVIRONMENT,
    'MAX_LOGIN_ATTEMPTS': settings.MAX_LOGIN_ATTEMPTS,
    'SIGNUP_RATE_LIMIT': settings.SIGNUP_RATE_LIMIT,
}

auth_users.configure(config)
admin_auth.configure(config)
webhook.configure(settings.MUX_WEBHOOK_SECRET)

import os
os.environ['BLOB_READ_WRITE_TOKEN'] = settings.BLOB_READ_WRITE_TOKEN or ''

app.include_router(auth_users.router)
app.include_router(admin_auth.router)
app.include_router(channels.router)
app.include_router(epg.router)
app.include_router(recordings.router)
app.include_router(favorites.router)
app.include_router(notifications.router)
app.include_router(search.router)
app.include_router(admin_dashboard.router)
app.include_router(analytics.router)
app.include_router(settings_router.router)
app.include_router(webhook.router)
app.include_router(parental.router)


@app.get('/api/health')
async def health():
    return JSONResponse({'status': 'ok', 'version': '2.0.0'})


@app.exception_handler(404)
async def not_found(request: Request, exc):
    return JSONResponse({'detail': 'Not found'}, status_code=404)
