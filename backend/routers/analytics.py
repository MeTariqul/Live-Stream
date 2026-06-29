from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
import logging
from datetime import timezone,  datetime, timedelta
from typing import Optional

from kv_client import kv_get_json
from mux_client import get_live_stream_stats
from routers.admin_auth import get_current_admin
from routers.auth_users import get_current_user

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


@router.get('/daily-users')
async def get_daily_active_users(current_user: dict = Depends(get_current_admin)):
    try:
        from kv_client import kv_keys
        keys = await kv_keys('user:*')
        user_keys = [k for k in keys if k.count(':') == 1]
    except Exception:
        user_keys = []

    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    active = 0
    for key in user_keys:
        data = await kv_get_json(key)
        if data and data.get('last_login', '').startswith(today):
            active += 1

    return JSONResponse({'date': today, 'daily_active_users': active})


@router.get('/most-watched')
async def get_most_watched(current_user: dict = Depends(get_current_admin)):
    try:
        from kv_client import kv_keys
        keys = await kv_keys('history:*:log')
    except Exception:
        keys = []

    channel_counts = {}
    for key in keys:
        history = await kv_get_json(key)
        if not history:
            continue
        for entry in history:
            ch_name = entry.get('channel_name', 'Unknown')
            channel_counts[ch_name] = channel_counts.get(ch_name, 0) + 1

    sorted_channels = sorted(channel_counts.items(), key=lambda x: x[1], reverse=True)
    return JSONResponse([
        {'channel_name': name, 'views': count}
        for name, count in sorted_channels[:20]
    ])


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
