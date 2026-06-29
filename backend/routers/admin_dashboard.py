from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
import logging
from datetime import datetime

from kv_client import kv_get_json, kv_set_json, kv_delete
from routers.admin_auth import get_current_admin

logger = logging.getLogger('tv-backend')

router = APIRouter(prefix='/api/admin', tags=['Admin Dashboard'])


@router.get('/dashboard')
async def get_dashboard_overview(current_user: dict = Depends(get_current_admin)):
    channels = await kv_get_json('channels') or []
    recordings = await kv_get_json('recordings') or []
    settings = await kv_get_json('settings') or {}

    total_users = 0
    user_keys = []
    try:
        from kv_client import kv_keys
        user_keys = await kv_keys('user:*')
        total_users = len([k for k in user_keys if k.count(':') == 1])
    except Exception:
        pass

    active_streams = len([c for c in channels if c.get('status') == 'active'])
    published_vods = len([r for r in recordings if r.get('published')])

    return JSONResponse({
        'total_channels': len(channels),
        'active_streams': active_streams,
        'total_users': total_users,
        'recordings': len(recordings),
        'published_vods': published_vods,
        'storage_used': 'N/A',
        'platform_name': settings.get('platform_name', 'My Live TV'),
    })


@router.get('/users')
async def admin_list_users(current_user: dict = Depends(get_current_admin)):
    try:
        from kv_client import kv_keys
        keys = await kv_keys('user:*')
        user_keys = [k for k in keys if k.count(':') == 1]
    except Exception:
        user_keys = []

    users = []
    for key in user_keys:
        username = key.split(':', 1)[1]
        data = await kv_get_json(key)
        if data:
            users.append({
                'username': username,
                'tier': data.get('tier', 'basic'),
                'banned': data.get('banned', False),
                'created_at': data.get('created_at', ''),
                'last_login': data.get('last_login', ''),
                'login_attempts': data.get('login_attempts', 0),
            })
    return JSONResponse(users)


@router.post('/users/{username}/ban')
async def admin_ban_user(username: str, current_user: dict = Depends(get_current_admin)):
    data = await kv_get_json(f'user:{username}')
    if not data:
        raise HTTPException(status_code=404, detail='User not found')
    data['banned'] = True
    await kv_set_json(f'user:{username}', data, ex=86400 * 365)
    return JSONResponse({'success': True, 'banned': True})


@router.post('/users/{username}/unban')
async def admin_unban_user(username: str, current_user: dict = Depends(get_current_admin)):
    data = await kv_get_json(f'user:{username}')
    if not data:
        raise HTTPException(status_code=404, detail='User not found')
    data['banned'] = False
    data['login_attempts'] = 0
    data['locked_until'] = None
    await kv_set_json(f'user:{username}', data, ex=86400 * 365)
    return JSONResponse({'success': True, 'banned': False})


@router.post('/users/{username}/tier')
async def admin_set_user_tier(username: str, request: Request, current_user: dict = Depends(get_current_admin)):
    data = await kv_get_json(f'user:{username}')
    if not data:
        raise HTTPException(status_code=404, detail='User not found')
    body = await request.json()
    tier = body.get('tier', 'basic')
    if tier not in ('basic', 'premium'):
        raise HTTPException(status_code=400, detail='Invalid tier')
    data['tier'] = tier
    await kv_set_json(f'user:{username}', data, ex=86400 * 365)
    return JSONResponse({'success': True, 'tier': tier})


@router.get('/logs')
async def admin_get_logs(current_user: dict = Depends(get_current_admin)):
    logs = await kv_get_json('system:logs') or []
    return JSONResponse(logs)


@router.delete('/logs')
async def admin_purge_logs(current_user: dict = Depends(get_current_admin)):
    await kv_delete('system:logs')
    return JSONResponse({'success': True})
