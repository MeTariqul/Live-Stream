from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
import logging

from kv_client import kv_get_json, kv_set_json
from blob_client import upload_file
from models import SettingsUpdate
from routers.admin_auth import get_current_admin

logger = logging.getLogger('tv-backend')

router = APIRouter(prefix='/api/admin', tags=['Settings'])


@router.get('/settings')
async def get_settings(current_user: dict = Depends(get_current_admin)):
    settings = await kv_get_json('settings') or {}
    defaults = {
        'platform_name': 'My Live TV',
        'primary_color': '#0066ff',
        'custom_css': '',
        'default_language': 'en',
        'logo_url': '',
        'max_login_attempts': 5,
    }
    defaults.update(settings)
    return JSONResponse(defaults)


@router.put('/settings')
async def update_settings(body: SettingsUpdate, current_user: dict = Depends(get_current_admin)):
    settings = await kv_get_json('settings') or {}
    update_map = body.model_dump(exclude_none=True)
    settings.update(update_map)
    await kv_set_json('settings', settings, ex=86400 * 365)
    return JSONResponse(settings)


@router.post('/settings/logo')
async def upload_logo(request: Request, current_user: dict = Depends(get_current_admin)):
    form = await request.form()
    file = form.get('file')
    if not file:
        raise HTTPException(status_code=400, detail='No file uploaded')
    content = await file.read()
    ext = file.filename.rsplit('.', 1)[-1] if '.' in file.filename else 'png'
    filename = f'branding/logo.{ext}'
    try:
        url = await upload_file(content, filename, file.content_type or 'image/png')
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    settings = await kv_get_json('settings') or {}
    settings['logo_url'] = url
    await kv_set_json('settings', settings, ex=86400 * 365)
    return JSONResponse({'url': url})


@router.get('/public/settings')
async def get_public_settings():
    settings = await kv_get_json('settings') or {}
    return JSONResponse({
        'platform_name': settings.get('platform_name', 'My Live TV'),
        'primary_color': settings.get('primary_color', '#0066ff'),
        'default_language': settings.get('default_language', 'en'),
        'logo_url': settings.get('logo_url', ''),
    })
