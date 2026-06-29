from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from passlib.context import CryptContext
import logging

from kv_client import kv_get_json, kv_set_json
from models import ParentalPinRequest, SetParentalPinRequest
from routers.auth_users import get_current_user

logger = logging.getLogger('tv-backend')

router = APIRouter(prefix='/api', tags=['Parental Controls'])
pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')


@router.post('/parental/pin')
async def set_parental_pin(request: Request, body: SetParentalPinRequest, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    user_data = await kv_get_json(f'user:{username}')

    if not pwd_context.verify(body.current_password, user_data.get('password', '')):
        raise HTTPException(status_code=400, detail='Current password is incorrect')

    user_data['parental_pin'] = pwd_context.hash(body.pin)
    await kv_set_json(f'user:{username}', user_data, ex=86400 * 365)
    return JSONResponse({'success': True})


@router.post('/parental/verify')
async def verify_parental_pin(request: Request, body: ParentalPinRequest, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    user_data = await kv_get_json(f'user:{username}')
    stored_pin = user_data.get('parental_pin')
    if not stored_pin:
        raise HTTPException(status_code=400, detail='No parental PIN set')
    if not pwd_context.verify(body.pin, stored_pin):
        raise HTTPException(status_code=403, detail='Invalid PIN')
    return JSONResponse({'verified': True})


@router.post('/parental/remove')
async def remove_parental_pin(request: Request, body: SetParentalPinRequest, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    user_data = await kv_get_json(f'user:{username}')

    if not pwd_context.verify(body.current_password, user_data.get('password', '')):
        raise HTTPException(status_code=400, detail='Current password is incorrect')

    user_data['parental_pin'] = None
    await kv_set_json(f'user:{username}', user_data, ex=86400 * 365)
    return JSONResponse({'success': True})


@router.get('/parental/status')
async def get_parental_status(request: Request, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    user_data = await kv_get_json(f'user:{username}')
    return JSONResponse({
        'has_pin': bool(user_data.get('parental_pin')),
    })
