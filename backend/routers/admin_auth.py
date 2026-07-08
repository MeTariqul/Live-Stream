from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from passlib.context import CryptContext
from slowapi import Limiter
from slowapi.util import get_remote_address
from jose import jwt, JWTError
from datetime import timezone,  datetime, timedelta

from models import LoginRequest

router = APIRouter(prefix='/api', tags=['Admin Auth'])
pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')

ADMIN_USER = ''
ADMIN_PASS_HASH = ''
JWT_SECRET = ''
JWT_ALGORITHM = 'HS256'
JWT_EXPIRY_MINUTES = 1440
ENVIRONMENT = 'development'


def configure(config: dict):
    global ADMIN_USER, ADMIN_PASS_HASH, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRY_MINUTES, ENVIRONMENT
    ADMIN_USER = config.get('ADMIN_USER', 'admin')
    ADMIN_PASS_HASH = config.get('ADMIN_PASS_HASH', '')
    JWT_SECRET = config.get('JWT_SECRET', '')
    JWT_ALGORITHM = config.get('JWT_ALGORITHM', 'HS256')
    JWT_EXPIRY_MINUTES = config.get('JWT_EXPIRY_MINUTES', 1440)
    ENVIRONMENT = config.get('ENVIRONMENT', 'development')


def create_admin_token() -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRY_MINUTES)
    return jwt.encode({'sub': ADMIN_USER, 'exp': expire, 'iss': 'tv-backend', 'role': 'admin'}, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_admin(request: Request) -> dict:
    token = request.cookies.get('admin_token')
    if not token:
        raise HTTPException(status_code=401, detail='Not authenticated')
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get('sub') != ADMIN_USER:
            raise HTTPException(status_code=401, detail='Invalid admin')
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail='Invalid token')


@router.post('/admin/login')
async def admin_login(request: Request, body: LoginRequest):
    if body.username != ADMIN_USER or not pwd_context.verify(body.password, ADMIN_PASS_HASH):
        raise HTTPException(status_code=401, detail='Invalid credentials')

    token = create_admin_token()
    is_prod = (ENVIRONMENT == 'production')
    response = JSONResponse({'success': True, 'token': token})
    response.set_cookie(
        'admin_token',
        token,
        max_age=JWT_EXPIRY_MINUTES * 60,
        httponly=True,
        secure=is_prod,
        samesite='none' if is_prod else 'lax',
        path='/'
    )
    return response


@router.post('/admin/logout')
async def admin_logout(request: Request):
    response = JSONResponse({'success': True})
    response.delete_cookie('admin_token', path='/')
    return response


@router.get('/admin/check')
async def admin_check(current_user: dict = Depends(get_current_admin)):
    return JSONResponse({'authenticated': True, 'username': ADMIN_USER})
