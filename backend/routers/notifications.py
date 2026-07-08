from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
import logging
from datetime import timezone, datetime
from typing import Optional

from kv_client import kv_get_json, kv_set_json
from models import NotificationCreate
from routers.admin_auth import get_current_admin

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
