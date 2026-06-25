import logging
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware
from starlette.staticfiles import StaticFiles

from config import settings
from state import manager

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger('live-stream')

app = FastAPI(
    title='Live Stream Backend',
    version='1.0.0',
    debug=(settings.ENVIRONMENT == 'development')
)


@app.middleware('http')
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '0'
    if settings.ENVIRONMENT == 'production':
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    if 'Server' in response.headers:
        del response.headers['Server']
    return response


app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SESSION_SECRET,
    max_age=86400,
    https_only=(settings.ENVIRONMENT == 'production'),
    same_site='none',
    session_cookie='sessionId'
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(settings.FRONTEND_ORIGIN)],
    allow_credentials=True,
    allow_methods=['GET', 'POST', 'OPTIONS'],
    allow_headers=['*'],
)


from routers import auth, stream, internal, websocket

app.include_router(auth.router, prefix='/api', tags=['auth'])
app.include_router(stream.router, prefix='/api', tags=['stream'])
app.include_router(internal.router, prefix='/api/internal', tags=['internal'])
app.include_router(websocket.router, tags=['websocket'])


hls_path = Path(settings.HLS_PATH)
if hls_path.exists() and hls_path.is_dir():
    app.mount('/hls', StaticFiles(directory=str(hls_path)), name='hls')


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error('Unhandled error: %s', exc, exc_info=True if settings.ENVIRONMENT == 'development' else False)
    return JSONResponse(
        status_code=500,
        content={'success': False, 'error': 'Internal server error' if settings.ENVIRONMENT == 'production' else str(exc)}
    )


@app.on_event('startup')
async def startup():
    logger.info('Starting Live Stream Backend')
    logger.info('HTTP port: %s', settings.HTTP_PORT)
    logger.info('RTMP port: %s', settings.RTMP_PORT)
    logger.info('HLS path: %s', settings.HLS_PATH)
    logger.info('Stream key: %s', settings.STREAM_KEY)
    rtmp_url = settings.RTMP_PUBLIC_URL or f'rtmp://{settings.FRONTEND_ORIGIN.host or "localhost"}:{settings.RTMP_PORT}/live'
    logger.info('RTMP ingest URL: %s', rtmp_url)


@app.on_event('shutdown')
async def shutdown():
    logger.info('Shutting down gracefully')


if __name__ == '__main__':
    uvicorn.run(
        'main:app',
        host='0.0.0.0',
        port=settings.HTTP_PORT,
        reload=(settings.ENVIRONMENT == 'development'),
        log_level='info'
    )
