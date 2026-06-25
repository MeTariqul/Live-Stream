from fastapi import APIRouter, Request, HTTPException, status
from fastapi.responses import JSONResponse

from config import settings
from state import get_live, manager


router = APIRouter()


@router.get('/stream-status')
async def get_stream_status() -> JSONResponse:
    return JSONResponse({'isLive': get_live(), 'viewers': manager.viewer_count})


@router.get('/stream-key')
async def get_stream_key(request: Request) -> JSONResponse:
    if not request.session.get('authenticated'):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Unauthorized')
    host = request.headers.get('host', 'localhost')
    rtmp_url = settings.RTMP_PUBLIC_URL or f'rtmp://{host}/live'
    return JSONResponse({'streamKey': settings.STREAM_KEY, 'rtmpUrl': rtmp_url})
