import json
from datetime import datetime
from fastapi import APIRouter, HTTPException, status, Request
from fastapi.responses import JSONResponse

from config import settings
from models import LoginRequest, LoginResponse, ErrorResponse


router = APIRouter()


@router.post('/login', response_model=LoginResponse, responses={401: {'model': ErrorResponse}})
async def login(request: Request, credentials: LoginRequest) -> JSONResponse:
    username = credentials.username
    password = credentials.password

    if username != settings.ADMIN_USER:
        _log_attempt(username, False)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid credentials')

    import bcrypt
    password_valid = bcrypt.checkpw(password.encode('utf-8'), settings.ADMIN_PASS_HASH.encode('utf-8'))
    if not password_valid:
        _log_attempt(username, False)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid credentials')

    request.session['authenticated'] = True
    _log_attempt(username, True)
    return JSONResponse({'success': True})


@router.post('/logout')
async def logout(request: Request) -> JSONResponse:
    request.session.clear()
    return JSONResponse({'success': True})


def _log_attempt(username: str, success: bool) -> None:
    status_str = 'SUCCESS' if success else 'FAILURE'
    print(f'[{datetime.utcnow().isoformat()}] AUTH {status_str} user={username}')
