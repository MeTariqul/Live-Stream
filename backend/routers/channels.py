from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
import json
import logging
from datetime import timezone,  datetime
from uuid import uuid4
from typing import Optional

from kv_client import kv_get, kv_set, kv_get_json, kv_set_json
from mux_client import create_live_stream, delete_live_stream, get_live_stream
from blob_client import upload_file
from models import CreateChannelRequest, UpdateChannelRequest
from routers.admin_auth import get_current_admin


logger = logging.getLogger('tv-backend')

router = APIRouter(prefix='/api', tags=['Channels'])


def _apply_defaults(ch: dict) -> dict:
    ch.setdefault('category', 'General')
    ch.setdefault('order', 999)
    ch.setdefault('icon_url', '')
    ch.setdefault('is_mature', False)
    ch.setdefault('created_at', datetime.now(timezone.utc).isoformat())
    return ch


async def _get_channels() -> list:
    data = await kv_get_json('channels')
    if data is None:
        return []
    return [_apply_defaults(c) for c in data]


async def _save_channels(channels: list):
    await kv_set_json('channels', channels, ex=86400)


async def _find_channel_index(channels: list, channel_id: str) -> Optional[int]:
    for i, c in enumerate(channels):
        if c.get('id') == channel_id:
            return i
    return None


@router.get('/admin/channels')
async def admin_get_channels(current_user: dict = Depends(get_current_admin)):
    channels = await _get_channels()
    return JSONResponse(channels)


@router.post('/admin/channels')
async def admin_create_channel(request: Request, body: CreateChannelRequest, current_user: dict = Depends(get_current_admin)):
    try:
        stream_data = await create_live_stream('public')
    except Exception as e:
        logger.error('Mux create stream failed: %s', e)
        raise HTTPException(status_code=502, detail='Failed to create stream with Mux')

    stream_id = stream_data.get('id', '')
    stream_key = stream_data.get('stream_key', '')
    rtmp_url = stream_data.get('connect_stream_url', '') or stream_data.get('rtmp_url', '')
    playback_id = ''
    playback_url = None
    playback_ids = stream_data.get('playback_ids', [])
    if playback_ids:
        playback_id = playback_ids[0].get('id', '')
        playback_url = f'https://stream.mux.com/{playback_id}.m3u8'

    channel = _apply_defaults({
        'id': str(uuid4()),
        'name': body.name.strip(),
        'category': body.category or 'General',
        'order': body.order if body.order is not None else 999,
        'is_mature': body.is_mature,
        'stream_id': stream_id,
        'stream_key': stream_key,
        'rtmp_url': rtmp_url,
        'playback_id': playback_id,
        'playback_url': playback_url,
        'status': 'idle',
        'icon_url': '',
        'created_at': datetime.now(timezone.utc).isoformat(),
    })

    channels = await _get_channels()
    channels.append(channel)
    await _save_channels(channels)
    return JSONResponse(channel, status_code=201)


@router.put('/admin/channels/{channel_id}')
async def admin_update_channel(channel_id: str, body: UpdateChannelRequest, current_user: dict = Depends(get_current_admin)):
    channels = await _get_channels()
    idx = await _find_channel_index(channels, channel_id)
    if idx is None:
        raise HTTPException(status_code=404, detail='Channel not found')

    ch = channels[idx]
    if body.name is not None:
        ch['name'] = body.name.strip()
    if body.category is not None:
        ch['category'] = body.category
    if body.order is not None:
        ch['order'] = body.order
    if body.is_mature is not None:
        ch['is_mature'] = body.is_mature

    channels[idx] = ch
    await _save_channels(channels)
    return JSONResponse(ch)


@router.delete('/admin/channels/{channel_id}')
async def admin_delete_channel(channel_id: str, current_user: dict = Depends(get_current_admin)):
    channels = await _get_channels()
    idx = await _find_channel_index(channels, channel_id)
    if idx is None:
        raise HTTPException(status_code=404, detail='Channel not found')

    ch = channels[idx]
    if ch.get('stream_id'):
        await delete_live_stream(ch['stream_id'])
    del channels[idx]
    await _save_channels(channels)
    return JSONResponse({'success': True})


@router.post('/admin/channels/{channel_id}/icon')
async def admin_upload_channel_icon(channel_id: str, request: Request, current_user: dict = Depends(get_current_admin)):
    form = await request.form()
    file = form.get('file')
    if not file:
        raise HTTPException(status_code=400, detail='No file uploaded')

    content = await file.read()
    ext = file.filename.rsplit('.', 1)[-1] if '.' in file.filename else 'png'
    filename = f'channel-icons/{channel_id}.{ext}'

    try:
        url = await upload_file(content, filename, file.content_type or 'image/png')
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    channels = await _get_channels()
    idx = await _find_channel_index(channels, channel_id)
    if idx is not None:
        channels[idx]['icon_url'] = url
        await _save_channels(channels)

    return JSONResponse({'url': url})


@router.get('/channels')
async def get_public_channels(request: Request):
    channels = await _get_channels()
    result = []
    for ch in channels:
        public = {
            'id': ch.get('id'),
            'name': ch.get('name'),
            'status': ch.get('status', 'idle'),
            'category': ch.get('category', 'General'),
            'order': ch.get('order', 999),
            'icon_url': ch.get('icon_url', ''),
            'is_mature': ch.get('is_mature', False),
        }
        if ch.get('status') == 'active' and ch.get('playback_url'):
            public['playback_url'] = ch.get('playback_url')
        result.append(public)

    result.sort(key=lambda c: (c.get('order', 999), c.get('name', '')))
    return JSONResponse(result)
