from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
import hmac
import hashlib
import json
import time
import logging
from datetime import timezone,  datetime

from kv_client import kv_get_json, kv_set_json, kv_exists, kv_set

logger = logging.getLogger('tv-backend')

router = APIRouter(prefix='/api', tags=['Webhooks'])

MUX_WEBHOOK_SECRET = ''


def configure(secret: str):
    global MUX_WEBHOOK_SECRET
    MUX_WEBHOOK_SECRET = secret


def _verify_signature(body: bytes, signature: str, secret: str) -> bool:
    if not secret or not signature:
        return False
    parts = {}
    for part in signature.split(','):
        key, _, value = part.partition('=')
        parts[key.strip()] = value.strip()

    timestamp = parts.get('t', '')
    v1 = parts.get('v1', '')
    if not timestamp or not v1:
        return False

    try:
        event_timestamp = int(timestamp)
        if abs(time.time() - event_timestamp) > 300:
            return False
    except ValueError:
        return False

    signed_payload = f'{timestamp},{body.decode()}'
    computed = hmac.new(secret.encode(), signed_payload.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, v1)


@router.post('/webhook/mux')
async def mux_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get('mux-signature', '')
    secret = MUX_WEBHOOK_SECRET or ''

    if not _verify_signature(body, signature, secret):
        raise HTTPException(status_code=403, detail='Invalid signature')

    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail='Invalid JSON')

    event_type = event.get('type', '')
    event_id = event.get('id', '')
    stream_id = event.get('data', {}).get('id', '')
    object_type = event.get('data', {}).get('object', {}).get('type', '')
    asset_id = event.get('data', {}).get('asset_id', '') or event.get('data', {}).get('id', '')

    processed_key = f'webhook:processed:{event_id}'
    already_processed = await kv_exists(processed_key)
    if already_processed:
        logger.info('Ignoring duplicate webhook event %s', event_id)
        return JSONResponse({'status': 'ok', 'duplicate': True})

    await kv_set(processed_key, '1', ex=86400)

    channels = await kv_get_json('channels') or []

    for ch in channels:
        if ch.get('stream_id') == stream_id:
            if event_type in ('live_stream.connected', 'live_stream.active'):
                ch['status'] = 'active'
                logger.info('Channel %s is now LIVE', ch.get('name'))
            elif event_type in ('live_stream.disconnected', 'live_stream.idle'):
                ch['status'] = 'idle'
                logger.info('Channel %s is now IDLE', ch.get('name'))
            elif event_type == 'live_stream.recording':
                if asset_id:
                    ch['last_asset_id'] = asset_id
                    recordings_data = ch.get('recordings', [])
                    recordings_data.append({
                        'asset_id': asset_id,
                        'recorded_at': datetime.now(timezone.utc).isoformat(),
                    })
                    ch['recordings'] = recordings_data
                    logger.info('Channel %s recorded asset %s', ch.get('name'), asset_id)

                    from routers.recordings import _get_recordings, _save_recordings
                    recordings = await _get_recordings()
                    playback_ids = event.get('data', {}).get('playback_ids', [])
                    recordings.append({
                        'id': f'rec_{asset_id[:8]}',
                        'asset_id': asset_id,
                        'title': f'{ch.get("name")} - Recording',
                        'description': '',
                        'duration': event.get('data', {}).get('duration', 0),
                        'playback_id': playback_ids[0].get('id', '') if playback_ids else '',
                        'playback_url': f'https://stream.mux.com/{playback_ids[0].get("id", "")}.m3u8' if playback_ids else None,
                        'status': 'ready',
                        'created_at': datetime.now(timezone.utc).isoformat(),
                        'published': False,
                        'blob_url': None,
                        'channel_id': ch.get('id'),
                        'channel_name': ch.get('name'),
                    })
                    await _save_recordings(recordings)
            break

    await kv_set_json('channels', channels, ex=86400)

    log_entry = {
        'type': 'webhook',
        'event_type': event_type,
        'event_id': event_id,
        'stream_id': stream_id,
        'asset_id': asset_id,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }
    try:
        logs = await kv_get_json('system:logs') or []
        logs.append(log_entry)
        logs = logs[-1000:]
        await kv_set_json('system:logs', logs, ex=86400 * 7)
    except Exception:
        pass

    return JSONResponse({'status': 'ok', 'event_type': event_type})
