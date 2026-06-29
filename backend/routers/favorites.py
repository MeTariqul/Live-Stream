from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
import logging
from datetime import timezone,  datetime
from typing import Optional

from kv_client import kv_get_json, kv_set_json
from routers.auth_users import get_current_user

logger = logging.getLogger('tv-backend')

router = APIRouter(prefix='/api', tags=['Favorites'])


def _user_key(username: str, suffix: str = '') -> str:
    if suffix:
        return f'user:{username}:{suffix}'
    return f'user:{username}'


@router.get('/favorites')
async def get_favorites(request: Request, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    favorites = await kv_get_json(f'favorites:{username}') or []
    return JSONResponse(favorites)


@router.post('/favorites/{channel_id}')
async def add_favorite(channel_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    favorites = await kv_get_json(f'favorites:{username}') or []
    if channel_id not in favorites:
        favorites.append(channel_id)
        await kv_set_json(f'favorites:{username}', favorites, ex=86400 * 365)
    return JSONResponse({'favorites': favorites})


@router.delete('/favorites/{channel_id}')
async def remove_favorite(channel_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    favorites = await kv_get_json(f'favorites:{username}') or []
    favorites = [f for f in favorites if f != channel_id]
    await kv_set_json(f'favorites:{username}', favorites, ex=86400 * 365)
    return JSONResponse({'favorites': favorites})


@router.get('/history/last-watched')
async def get_last_watched(request: Request, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    data = await kv_get_json(f'history:{username}')
    if data and isinstance(data, dict):
        return JSONResponse({
            'channel_id': data.get('last_channel'),
            'channel_name': data.get('last_channel_name'),
            'timestamp': data.get('last_timestamp'),
        })
    return JSONResponse({'channel_id': None})


@router.post('/history/last-watched')
async def set_last_watched(request: Request, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    body = await request.json()
    channel_id = body.get('channel_id', '')
    channel_name = body.get('channel_name', '')

    data = await kv_get_json(f'history:{username}') or {}
    if isinstance(data, dict):
        data['last_channel'] = channel_id
        data['last_channel_name'] = channel_name
        data['last_timestamp'] = datetime.now(timezone.utc).isoformat()
    else:
        data = {'last_channel': channel_id, 'last_channel_name': channel_name, 'last_timestamp': datetime.now(timezone.utc).isoformat()}
    await kv_set_json(f'history:{username}', data, ex=86400 * 365)
    return JSONResponse({'success': True})


@router.get('/history')
async def get_watch_history(request: Request, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    history = await kv_get_json(f'history:{username}:log') or []
    return JSONResponse(history)


@router.post('/history')
async def add_watch_history(request: Request, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    body = await request.json()
    channel_id = body.get('channel_id', '')
    channel_name = body.get('channel_name', '')
    program_title = body.get('program_title', '')

    history = await kv_get_json(f'history:{username}:log') or []
    entry = {
        'channel_id': channel_id,
        'channel_name': channel_name,
        'program_title': program_title,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }
    history.append(entry)
    if len(history) > 500:
        history = history[-500:]
    await kv_set_json(f'history:{username}:log', history, ex=86400 * 365)
    return JSONResponse({'success': True})
