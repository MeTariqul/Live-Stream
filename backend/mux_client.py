import os
import base64
import json
import logging
import time
import asyncio
from typing import Optional
from uuid import uuid4

import httpx

logger = logging.getLogger('tv-backend')

MUX_TOKEN_ID = os.environ.get('MUX_TOKEN_ID', '')
MUX_TOKEN_SECRET = os.environ.get('MUX_TOKEN_SECRET', '')
MUX_WEBHOOK_SECRET = os.environ.get('MUX_WEBHOOK_SECRET', '')

MUX_API_BASE = 'https://api.mux.com/video/v1'
MUX_RATE_LIMIT = 120
_last_request_time = 0


def _is_configured() -> bool:
    return bool(MUX_TOKEN_ID and MUX_TOKEN_SECRET)


def _auth_header() -> dict:
    raw = f'{MUX_TOKEN_ID}:{MUX_TOKEN_SECRET}'
    encoded = base64.b64encode(raw.encode()).decode()
    return {'Authorization': f'Basic {encoded}', 'Content-Type': 'application/json'}


async def _rate_limited_request(method: str, path: str, **kwargs) -> dict:
    global _last_request_time
    now = time.time()
    elapsed = now - _last_request_time
    min_interval = 60.0 / MUX_RATE_LIMIT
    if elapsed < min_interval:
        await asyncio.sleep(min_interval - elapsed)

    async with httpx.AsyncClient(timeout=30.0) as client:
        url = f'{MUX_API_BASE}/{path.lstrip("/")}'
        headers = kwargs.pop('headers', {})
        headers.update(_auth_header())
        response = await client.request(method, url, headers=headers, **kwargs)

    _last_request_time = time.time()

    if response.status_code == 429:
        retry_after = int(response.headers.get('Retry-After', '5'))
        logger.warning('Mux rate limited, retrying after %ds', retry_after)
        await asyncio.sleep(retry_after)
        return await _rate_limited_request(method, path, **kwargs)

    response.raise_for_status()
    return response.json()


async def create_live_stream(policy: str = 'public') -> dict:
    if not _is_configured():
        logger.info('Mux not configured, returning dev-mode stream data')
        playback_id = str(uuid4())[:8]
        return {
            'id': str(uuid4()),
            'stream_key': f'dev_{uuid4().hex[:16]}',
            'connect_stream_url': 'rtmp://dev.mock/live',
            'rtmp_url': 'rtmp://dev.mock/live',
            'playback_ids': [{'id': playback_id}],
            'playback_url': f'https://stream.mux.com/{playback_id}.m3u8',
        }
    data = await _rate_limited_request('POST', 'live-streams', json={
        'playback_policy': [policy],
        'new_asset_settings': {'playback_policy': [policy]}
    })
    return data.get('data', {})


async def delete_live_stream(stream_id: str) -> bool:
    if not _is_configured():
        return True
    try:
        await _rate_limited_request('DELETE', f'live-streams/{stream_id}')
        return True
    except Exception as e:
        logger.error('Failed to delete Mux stream %s: %s', stream_id, e)
        return False


async def get_live_stream(stream_id: str) -> dict:
    if not _is_configured():
        return {'status': 'idle', 'id': stream_id}
    data = await _rate_limited_request('GET', f'live-streams/{stream_id}')
    return data.get('data', {})


async def list_live_streams() -> list:
    if not _is_configured():
        return []
    data = await _rate_limited_request('GET', 'live-streams')
    return data.get('data', [])


async def get_live_stream_stats(stream_id: str) -> dict:
    if not _is_configured():
        return {'current_viewers': 0, 'viewer_count': 0}
    try:
        data = await _rate_limited_request('GET', f'live-streams/{stream_id}/stats')
        return data.get('data', {})
    except Exception:
        return {'current_viewers': 0}


async def create_asset_download(asset_id: str) -> Optional[str]:
    if not _is_configured():
        return f'https://dev.mock/downloads/{asset_id}.mp4'
    data = await _rate_limited_request('POST', f'assets/{asset_id}/downloads')
    downloads = data.get('data', {}).get('downloads', [])
    for d in downloads:
        if d.get('status') == 'ready':
            return d.get('url')
    return None


async def get_asset(asset_id: str) -> dict:
    if not _is_configured():
        return {'id': asset_id, 'status': 'ready', 'duration': 0, 'playback_ids': []}
    data = await _rate_limited_request('GET', f'assets/{asset_id}')
    return data.get('data', {})


async def delete_asset(asset_id: str) -> bool:
    if not _is_configured():
        return True
    try:
        await _rate_limited_request('DELETE', f'assets/{asset_id}')
        return True
    except Exception as e:
        logger.error('Failed to delete Mux asset %s: %s', asset_id, e)
        return False


async def list_assets(limit: int = 50) -> list:
    if not _is_configured():
        from kv_client import kv_get_json
        recordings = await kv_get_json('recordings') or []
        return [{'id': r.get('asset_id', ''), 'title': r.get('title', ''), 'status': 'ready',
                 'duration': r.get('duration', 0), 'playback_ids': [{'id': r.get('playback_id', '')}],
                 'created_at': r.get('created_at', '')} for r in recordings if r.get('asset_id')]
    data = await _rate_limited_request('GET', f'assets?limit={limit}')
    return data.get('data', [])


async def track_views(asset_id: str) -> int:
    if not _is_configured():
        return 0
    try:
        data = await _rate_limited_request('GET', f'assets/{asset_id}/views')
        return len(data.get('data', []))
    except Exception:
        return 0
