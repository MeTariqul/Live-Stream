from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
import logging
from datetime import timezone,  datetime
from uuid import uuid4
from typing import Optional

from kv_client import kv_get_json, kv_set_json, kv_delete
from mux_client import list_assets, get_asset, delete_asset, create_asset_download
from blob_client import upload_from_url, delete_file
from models import RecordingsUpdateRequest
from routers.admin_auth import get_current_admin
from routers.auth_users import get_current_user

logger = logging.getLogger('tv-backend')

router = APIRouter(prefix='/api', tags=['Recordings'])


async def _get_recordings() -> list:
    data = await kv_get_json('recordings')
    if data is None:
        return []
    return data


async def _save_recordings(recordings: list):
    await kv_set_json('recordings', recordings, ex=86400 * 30)


@router.get('/admin/recordings')
async def admin_get_recordings(current_user: dict = Depends(get_current_admin)):
    recordings = await _get_recordings()
    return JSONResponse(recordings)


@router.post('/admin/recordings/sync')
async def admin_sync_recordings(current_user: dict = Depends(get_current_admin)):
    try:
        assets = await list_assets(100)
    except Exception as e:
        logger.error('Failed to list Mux assets: %s', e)
        raise HTTPException(status_code=502, detail='Failed to fetch assets from Mux')

    existing = await _get_recordings()
    existing_ids = {r.get('asset_id') for r in existing}

    for asset in assets:
        asset_id = asset.get('id')
        if asset_id in existing_ids:
            continue
        playback_ids = asset.get('playback_ids', [])
        recording = {
            'id': str(uuid4()),
            'asset_id': asset_id,
            'title': asset.get('title', f'Recording {asset_id[:8]}'),
            'description': '',
            'duration': asset.get('duration', 0),
            'playback_id': playback_ids[0].get('id', '') if playback_ids else '',
            'playback_url': f'https://stream.mux.com/{playback_ids[0].get("id", "")}.m3u8' if playback_ids else None,
            'status': asset.get('status', 'unknown'),
            'created_at': asset.get('created_at', datetime.now(timezone.utc).isoformat()),
            'published': False,
            'blob_url': None,
            'channel_id': '',
            'channel_name': '',
        }
        existing.append(recording)

    await _save_recordings(existing)
    return JSONResponse({'synced': len(existing)})


@router.post('/admin/recordings/{recording_id}/download')
async def admin_download_recording(recording_id: str, current_user: dict = Depends(get_current_admin)):
    recordings = await _get_recordings()
    rec = next((r for r in recordings if r.get('id') == recording_id), None)
    if not rec:
        raise HTTPException(status_code=404, detail='Recording not found')

    try:
        mp4_url = await create_asset_download(rec['asset_id'])
    except Exception as e:
        logger.error('Failed to create download for asset %s: %s', rec['asset_id'], e)
        raise HTTPException(status_code=502, detail='Failed to generate download URL')

    if mp4_url:
        rec['download_url'] = mp4_url
        await _save_recordings(recordings)

    return JSONResponse({'download_url': mp4_url})


@router.post('/admin/recordings/{recording_id}/publish')
async def admin_publish_recording(recording_id: str, body: RecordingsUpdateRequest, current_user: dict = Depends(get_current_admin)):
    recordings = await _get_recordings()
    rec = next((r for r in recordings if r.get('id') == recording_id), None)
    if not rec:
        raise HTTPException(status_code=404, detail='Recording not found')

    if body.title is not None:
        rec['title'] = body.title
    if body.description is not None:
        rec['description'] = body.description
    if body.published is not None:
        rec['published'] = body.published

    if body.published and not rec.get('blob_url'):
        try:
            mp4_url = await create_asset_download(rec['asset_id'])
            if mp4_url:
                filename = f'vod/{recording_id}.mp4'
                blob_url = await upload_from_url(mp4_url, filename)
                if blob_url:
                    rec['blob_url'] = blob_url
        except Exception as e:
            logger.error('Failed to upload recording to Blob: %s', e)

    await _save_recordings(recordings)
    return JSONResponse(rec)


@router.post('/admin/recordings/{recording_id}/blob')
async def admin_upload_to_blob(recording_id: str, current_user: dict = Depends(get_current_admin)):
    recordings = await _get_recordings()
    rec = next((r for r in recordings if r.get('id') == recording_id), None)
    if not rec:
        raise HTTPException(status_code=404, detail='Recording not found')

    try:
        mp4_url = await create_asset_download(rec['asset_id'])
        if not mp4_url:
            raise HTTPException(status_code=502, detail='Download not ready')
        filename = f'vod/{recording_id}.mp4'
        blob_url = await upload_from_url(mp4_url, filename)
        rec['blob_url'] = blob_url
        await _save_recordings(recordings)
        return JSONResponse({'blob_url': blob_url})
    except Exception as e:
        logger.error('Failed to upload to Blob: %s', e)
        raise HTTPException(status_code=500, detail='Blob upload failed')


@router.delete('/admin/recordings/{recording_id}')
async def admin_delete_recording(recording_id: str, current_user: dict = Depends(get_current_admin)):
    recordings = await _get_recordings()
    rec = next((r for r in recordings if r.get('id') == recording_id), None)
    if not rec:
        raise HTTPException(status_code=404, detail='Recording not found')

    if rec.get('asset_id'):
        await delete_asset(rec['asset_id'])
    if rec.get('blob_url'):
        await delete_file(rec['blob_url'])

    recordings = [r for r in recordings if r.get('id') != recording_id]
    await _save_recordings(recordings)
    return JSONResponse({'success': True})


@router.get('/recordings')
async def get_public_recordings(request: Request, current_user: dict = Depends(get_current_user)):
    recordings = await _get_recordings()
    public = []
    for rec in recordings:
        if rec.get('published'):
            public.append({
                'id': rec.get('id'),
                'title': rec.get('title'),
                'description': rec.get('description'),
                'duration': rec.get('duration'),
                'playback_url': rec.get('playback_url'),
                'blob_url': rec.get('blob_url'),
                'channel_id': rec.get('channel_id'),
                'channel_name': rec.get('channel_name'),
                'created_at': rec.get('created_at'),
            })
    return JSONResponse(public)
