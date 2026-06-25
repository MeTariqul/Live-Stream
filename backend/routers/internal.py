import json
from datetime import datetime
from fastapi import APIRouter, Request, HTTPException, status
from fastapi.responses import JSONResponse

from config import settings
from state import set_live, get_live, manager


router = APIRouter()


@router.post('/stream-start')
async def stream_start(request: Request) -> JSONResponse:
    body = await request.json()
    stream_key = body.get('name', '').strip()
    
    if stream_key != settings.STREAM_KEY:
        print(f'[{datetime.utcnow().isoformat()}] RTMP rejected invalid key: {stream_key}')
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Invalid stream key')

    set_live(True)
    print(f'[{datetime.utcnow().isoformat()}] RTMP stream started: {stream_key}')
    await manager.send_stream_status(True)
    return JSONResponse({'status': 'ok'})


@router.post('/stream-stop')
async def stream_stop(request: Request) -> JSONResponse:
    body = await request.json()
    stream_key = body.get('name', '').strip()

    if stream_key != settings.STREAM_KEY:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Invalid stream key')

    set_live(False)
    print(f'[{datetime.utcnow().isoformat()}] RTMP stream ended: {stream_key}')
    await manager.send_stream_status(False)
    return JSONResponse({'status': 'ok'})
