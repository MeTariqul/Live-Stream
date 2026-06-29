from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from passlib.context import CryptContext
from slowapi import Limiter
from slowapi.util import get_remote_address
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone
import json
import logging
import time
from typing import Optional

from kv_client import kv_get, kv_set, kv_delete, kv_get_json, kv_set_json, kv_exists
from models import LoginRequest, SignupRequest, ChangePasswordRequest, DeleteAccountRequest, UserTierUpdate

logger = logging.getLogger('tv-backend')

router = APIRouter(prefix='/api', tags=['Users'])
pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')

ADMIN_USER = ''
JWT_SECRET = ''
JWT_ALGORITHM = 'HS256'
JWT_EXPIRY_MINUTES = 1440
ENVIRONMENT = 'development'
MAX_LOGIN_ATTEMPTS = 5


def configure(config: dict):
    global ADMIN_USER, JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRY_MINUTES, ENVIRONMENT, MAX_LOGIN_ATTEMPTS
    ADMIN_USER = config.get('ADMIN_USER', 'admin')
    JWT_SECRET = config.get('JWT_SECRET', '')
    JWT_ALGORITHM = config.get('JWT_ALGORITHM', 'HS256')
    JWT_EXPIRY_MINUTES = config.get('JWT_EXPIRY_MINUTES', 1440)
    ENVIRONMENT = config.get('ENVIRONMENT', 'development')
    MAX_LOGIN_ATTEMPTS = config.get('MAX_LOGIN_ATTEMPTS', 5)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRY_MINUTES)
    to_encode.update({'exp': expire, 'iss': 'tv-backend'})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_token_from_cookie(request: Request) -> Optional[dict]:
    token = request.cookies.get('auth_token')
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


async def get_current_user(request: Request) -> dict:
    payload = get_token_from_cookie(request)
    if not payload:
        raise HTTPException(status_code=401, detail='Not authenticated')
    username = payload.get('sub')
    if not username:
        raise HTTPException(status_code=401, detail='Invalid token')
    user_data = await kv_get_json(f'user:{username}')
    if not user_data:
        raise HTTPException(status_code=401, detail='User not found')
    if user_data.get('banned', False):
        raise HTTPException(status_code=403, detail='Account banned')
    return payload


def set_auth_cookie(response: JSONResponse, username: str):
    access_token = create_access_token({'sub': username})
    is_prod = (ENVIRONMENT == 'production')
    response.set_cookie(
        'auth_token',
        access_token,
        max_age=JWT_EXPIRY_MINUTES * 60,
        httponly=True,
        secure=is_prod,
        samesite='none' if is_prod else 'lax',
        path='/'
    )


def clear_auth_cookie(response: JSONResponse):
    response.delete_cookie('auth_token', path='/')


@router.get('/auth/me')
async def get_me(request: Request):
    payload = get_token_from_cookie(request)
    if not payload:
        raise HTTPException(status_code=401, detail='Not authenticated')
    username = payload.get('sub')
    user_data = await kv_get_json(f'user:{username}')
    if not user_data:
        raise HTTPException(status_code=401, detail='User not found')
    return JSONResponse({
        'username': username,
        'tier': user_data.get('tier', 'basic'),
        'created_at': user_data.get('created_at', ''),
        'has_parental_pin': bool(user_data.get('parental_pin')),
    })


@router.post('/signup')
async def signup(request: Request, body: SignupRequest):
    username = body.username.strip()
    password = body.password

    existing = await kv_exists(f'user:{username}')
    if existing:
        raise HTTPException(status_code=409, detail='Username already taken')

    hashed = pwd_context.hash(password)
    user_data = {
        'username': username,
        'password': hashed,
        'tier': 'basic',
        'banned': False,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'login_attempts': 0,
        'locked_until': None,
        'parental_pin': None,
        'last_login': None,
        'channel_order': [],
    }
    await kv_set_json(f'user:{username}', user_data, ex=86400 * 365)

    response = JSONResponse({'success': True, 'username': username})
    set_auth_cookie(response, username)
    return response


@router.post('/login')
async def login(request: Request, body: LoginRequest):
    username = body.username.strip()
    password = body.password

    user_data = await kv_get_json(f'user:{username}')
    if not user_data:
        raise HTTPException(status_code=401, detail='Invalid credentials')

    if user_data.get('banned', False):
        raise HTTPException(status_code=403, detail='Account banned')

    locked_until = user_data.get('locked_until')
    if locked_until:
        try:
            lock_time = datetime.fromisoformat(locked_until)
            if datetime.now(timezone.utc) < lock_time:
                remaining = int((lock_time - datetime.now(timezone.utc)).total_seconds())
                raise HTTPException(status_code=429, detail=f'Account locked. Try again in {remaining} seconds')
        except (ValueError, TypeError):
            pass

    if not pwd_context.verify(password, user_data.get('password', '')):
        attempts = user_data.get('login_attempts', 0) + 1
        user_data['login_attempts'] = attempts
        if attempts >= MAX_LOGIN_ATTEMPTS:
            lock_time = datetime.now(timezone.utc) + timedelta(minutes=15)
            user_data['locked_until'] = lock_time.isoformat()
            await kv_set_json(f'user:{username}', user_data, ex=86400 * 365)
            raise HTTPException(status_code=429, detail='Account locked for 15 minutes')
        await kv_set_json(f'user:{username}', user_data, ex=86400 * 365)
        raise HTTPException(status_code=401, detail='Invalid credentials')

    user_data['login_attempts'] = 0
    user_data['locked_until'] = None
    user_data['last_login'] = datetime.now(timezone.utc).isoformat()
    await kv_set_json(f'user:{username}', user_data, ex=86400 * 365)

    await log_event('login_success', {'username': username})

    response = JSONResponse({'success': True, 'username': username, 'tier': user_data.get('tier', 'basic')})
    set_auth_cookie(response, username)
    return response


@router.post('/logout')
async def logout(request: Request):
    response = JSONResponse({'success': True})
    clear_auth_cookie(response)
    return response


@router.get('/users/me')
async def get_profile(request: Request, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    user_data = await kv_get_json(f'user:{username}')
    return JSONResponse({
        'username': username,
        'tier': user_data.get('tier', 'basic'),
        'created_at': user_data.get('created_at', ''),
        'has_parental_pin': bool(user_data.get('parental_pin')),
    })


@router.post('/users/me/change-password')
async def change_password(request: Request, body: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    user_data = await kv_get_json(f'user:{username}')
    if not pwd_context.verify(body.current_password, user_data.get('password', '')):
        raise HTTPException(status_code=400, detail='Current password is incorrect')
    user_data['password'] = pwd_context.hash(body.new_password)
    await kv_set_json(f'user:{username}', user_data, ex=86400 * 365)
    return JSONResponse({'success': True})


@router.post('/users/me/delete')
async def delete_account(request: Request, body: DeleteAccountRequest, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    user_data = await kv_get_json(f'user:{username}')
    if not pwd_context.verify(body.password, user_data.get('password', '')):
        raise HTTPException(status_code=400, detail='Password is incorrect')
    await kv_delete(f'user:{username}')
    await kv_delete(f'favorites:{username}')
    await kv_delete(f'history:{username}')
    await kv_delete(f'reminders:{username}')
    response = JSONResponse({'success': True, 'message': 'Account deleted'})
    clear_auth_cookie(response)
    return response


@router.get('/users/me/tier')
async def get_user_tier(request: Request, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    user_data = await kv_get_json(f'user:{username}')
    return JSONResponse({'tier': user_data.get('tier', 'basic')})


async def log_event(event_type: str, data: dict):
    try:
        logs = await kv_get_json('system:logs') or []
        logs.append({
            'type': event_type,
            'data': data,
            'timestamp': datetime.now(timezone.utc).isoformat(),
        })
        logs = logs[-1000:]
        await kv_set_json('system:logs', logs, ex=86400 * 7)
    except Exception:
        pass
