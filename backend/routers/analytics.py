from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
import logging
from datetime import timezone, datetime, timedelta
from typing import Optional

from kv_client import kv_get_json
from mux_client import get_live_stream_stats
from routers.admin_auth import get_current_admin

logger = logging.getLogger('tv-backend')

router = APIRouter(prefix='/api/analytics', tags=['Analytics'])


@router.get('/concurrent')
async def get_concurrent_viewers(current_user: dict = Depends(get_current_admin)):
    channels = await kv_get_json('channels') or []
    results = []
    for ch in channels:
        stream_id = ch.get('stream_id')
        viewers = 0
        if stream_id and ch.get('status') == 'active':
            try:
                stats = await get_live_stream_stats(stream_id)
                viewers = stats.get('current_viewers', 0) or stats.get('viewer_count', 0) or 0
            except Exception as e:
                logger.debug('Failed to get stats for %s: %s', stream_id, e)
        results.append({
            'channel_id': ch.get('id'),
            'channel_name': ch.get('name'),
            'viewers': viewers,
        })
    return JSONResponse(results)


@router.get('/dashboard')
async def get_analytics_dashboard(current_user: dict = Depends(get_current_admin)):
    channels = await kv_get_json('channels') or []
    active_channels = [c for c in channels if c.get('status') == 'active']

    concurrent = []
    for ch in active_channels:
        try:
            stats = await get_live_stream_stats(ch['stream_id'])
            v = stats.get('current_viewers', 0) or 0
        except Exception:
            v = 0
        concurrent.append({'name': ch.get('name'), 'viewers': v})

    return JSONResponse({
        'active_streams': len(active_channels),
        'concurrent_viewers': concurrent,
        'total_viewers': sum(c['viewers'] for c in concurrent),
    })
