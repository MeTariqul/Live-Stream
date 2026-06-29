import os
import httpx
import tempfile
import shutil
from typing import Optional
from uuid import uuid4

BLOB_READ_WRITE_TOKEN = os.environ.get('BLOB_READ_WRITE_TOKEN', '')
BLOB_API_BASE = 'https://blob.vercel-storage.com'

_dev_dir = None


def _get_dev_dir() -> str:
    global _dev_dir
    if _dev_dir is None:
        _dev_dir = os.path.join(tempfile.gettempdir(), 'tv-blob-dev')
        os.makedirs(_dev_dir, exist_ok=True)
    return _dev_dir


def _is_configured() -> bool:
    return bool(BLOB_READ_WRITE_TOKEN)


async def upload_file(file_bytes: bytes, filename: str, content_type: str = 'application/octet-stream') -> Optional[str]:
    if not _is_configured():
        dev_path = os.path.join(_get_dev_dir(), filename.replace('/', '_'))
        os.makedirs(os.path.dirname(dev_path) or '.', exist_ok=True)
        with open(dev_path, 'wb') as f:
            f.write(file_bytes)
        dev_url = f'/dev-blob/{filename.replace("/", "_")}'
        logger.info('Blob dev-mode: saved to %s', dev_path)
        return dev_url
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f'{BLOB_API_BASE}/upload',
                headers={
                    'Authorization': f'Bearer {BLOB_READ_WRITE_TOKEN}',
                    'Content-Type': content_type,
                },
                params={'filename': filename},
                content=file_bytes,
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get('url')
    except Exception as e:
        raise RuntimeError(f'Blob upload failed: {e}')


async def delete_file(url: str) -> bool:
    if not _is_configured():
        return True
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f'{BLOB_API_BASE}/delete',
                headers={'Authorization': f'Bearer {BLOB_READ_WRITE_TOKEN}'},
                json={'url': url},
            )
            return resp.status_code == 200
    except Exception:
        return False


async def upload_from_url(source_url: str, filename: str) -> Optional[str]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(source_url)
        resp.raise_for_status()
        content = resp.content
        ct = resp.headers.get('content-type', 'video/mp4')
    return await upload_file(content, filename, ct)


import logging
logger = logging.getLogger('tv-backend')
