from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
import logging
from datetime import timezone,  datetime
from typing import Optional

from kv_client import kv_get_json, kv_set_json
from models import NotificationCreate
from routers.admin_auth import get_current_admin
from routers.auth_users import get_current_user

logger = logging.getLogger('tv-backend')

router = APIRouter(prefix='/api', tags=['Notifications'])


@router.post('/admin/notifications')
async def create_global_notification(body: NotificationCreate, current_user: dict = Depends(get_current_admin)):
    notifications = await kv_get_json('notifications:global') or []
    notification = {
        'id': f'n_{datetime.now(timezone.utc).timestamp()}',
        'message': body.message.strip(),
        'channel_id': body.channel_id,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'active': True,
    }
    notifications.append(notification)
    if len(notifications) > 50:
        notifications = notifications[-50:]
    await kv_set_json('notifications:global', notifications, ex=86400)
    return JSONResponse(notification, status_code=201)


@router.get('/notifications')
async def get_active_notifications():
    notifications = await kv_get_json('notifications:global') or []
    active = [n for n in notifications if n.get('active', False)]
    return JSONResponse(active)


@router.delete('/admin/notifications/{notification_id}')
async def dismiss_notification(notification_id: str, current_user: dict = Depends(get_current_admin)):
    notifications = await kv_get_json('notifications:global') or []
    for n in notifications:
        if n.get('id') == notification_id:
            n['active'] = False
            break
    await kv_set_json('notifications:global', notifications, ex=86400)
    return JSONResponse({'success': True})


@router.get('/notifications/favorite-live')
async def check_favorite_live(request: Request, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    favorites = await kv_get_json(f'favorites:{username}') or []
    channels = await kv_get_json('channels') or []
    live_favorites = []
    fav_set = set(favorites)
    for ch in channels:
        if ch.get('id') in fav_set and ch.get('status') == 'active':
            live_favorites.append({
                'id': ch.get('id'),
                'name': ch.get('name'),
            })
    return JSONResponse(live_favorites)


@router.get('/notifications/reminders')
async def check_reminders(request: Request, current_user: dict = Depends(get_current_user)):
    username = current_user.get('sub')
    reminder_ids = await kv_get_json(f'reminders:{username}') or []
    if not reminder_ids:
        return JSONResponse([])

    all_epg = await kv_get_json('epg:all') or {}
    now = datetime.now(timezone.utc)
    due = []

    for ch_id, programs in all_epg.items():
        for p in programs:
            if p.get('id') in reminder_ids:
                try:
                    start = datetime.fromisoformat(p['start_datetime'])
                    diff = (start - now).total_seconds()
                    if 0 <= diff <= 900:
                        due.append({
                            'program_id': p.get('id'),
                            'title': p.get('title'),
                            'channel_id': ch_id,
                            'starts_in_seconds': int(diff),
                        })
                except (ValueError, KeyError):
                    continue

    return JSONResponse(due)
