from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
import logging
from typing import Optional

from kv_client import kv_get_json
from routers.auth_users import get_current_user

logger = logging.getLogger('tv-backend')

router = APIRouter(prefix='/api', tags=['Search'])


@router.get('/search')
async def search(request: Request, q: str = '', category: Optional[str] = None):
    channels = await kv_get_json('channels') or []
    all_epg = await kv_get_json('epg:all') or {}

    q = q.strip().lower()
    results = {'channels': [], 'programs': []}

    for ch in channels:
        if category and ch.get('category', '') != category:
            continue
        if q:
            name_match = q in ch.get('name', '').lower()
            cat_match = q in ch.get('category', '').lower()
            if not name_match and not cat_match:
                continue
        results['channels'].append({
            'id': ch.get('id'),
            'name': ch.get('name'),
            'category': ch.get('category'),
            'status': ch.get('status', 'idle'),
            'icon_url': ch.get('icon_url', ''),
            'order': ch.get('order', 999),
        })

    if q:
        for ch_id, programs in all_epg.items():
            for p in programs:
                title_match = q in p.get('title', '').lower()
                desc_match = q in p.get('description', '').lower()
                if title_match or desc_match:
                    results['programs'].append({
                        'id': p.get('id'),
                        'channel_id': ch_id,
                        'title': p.get('title'),
                        'description': p.get('description', ''),
                        'start_datetime': p.get('start_datetime'),
                        'end_datetime': p.get('end_datetime'),
                    })

    results['channels'].sort(key=lambda c: (c.get('status') != 'active', c.get('order', 999)))

    return JSONResponse(results)


@router.get('/categories')
async def get_categories():
    channels = await kv_get_json('channels') or []
    categories = set()
    for ch in channels:
        cat = ch.get('category', 'General')
        if cat:
            categories.add(cat)
    return JSONResponse(sorted(categories))
