from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
import logging

from kv_client import kv_get_json, kv_delete
from routers.admin_auth import get_current_admin

logger = logging.getLogger('tv-backend')

router = APIRouter(prefix='/api/admin', tags=['Admin Dashboard'])


@router.get('/dashboard')
async def get_dashboard_overview(current_user: dict = Depends(get_current_admin)):
    channels = await kv_get_json('channels') or []
    recordings = await kv_get_json('recordings') or []
    settings = await kv_get_json('settings') or {}

    active_streams = len([c for c in channels if c.get('status') == 'active'])
    published_vods = len([r for r in recordings if r.get('published')])

    return JSONResponse({
        'total_channels': len(channels),
        'active_streams': active_streams,
        'recordings': len(recordings),
        'published_vods': published_vods,
        'storage_used': 'N/A',
        'platform_name': settings.get('platform_name', 'My Live TV'),
    })


@router.get('/logs')
async def admin_get_logs(current_user: dict = Depends(get_current_admin)):
    logs = await kv_get_json('system:logs') or []
    return JSONResponse(logs)


@router.delete('/logs')
async def admin_purge_logs(current_user: dict = Depends(get_current_admin)):
    await kv_delete('system:logs')
    return JSONResponse({'success': True})
