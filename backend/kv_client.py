import json
import os
import time
from typing import Optional, Any

KV_REST_API_URL = os.environ.get('KV_REST_API_URL', '')
KV_REST_API_TOKEN = os.environ.get('KV_REST_API_TOKEN', '')

_memory_store = {}
_memory_expiry = {}


async def _use_rest() -> bool:
    return bool(KV_REST_API_URL)


def _get_mem(key: str) -> Optional[str]:
    if key in _memory_expiry:
        if time.time() > _memory_expiry[key]:
            _memory_store.pop(key, None)
            _memory_expiry.pop(key, None)
            return None
    return _memory_store.get(key)


def _set_mem(key: str, value: str, ex: int = 7200):
    _memory_store[key] = value
    if ex > 0:
        _memory_expiry[key] = time.time() + ex


def _del_mem(key: str):
    _memory_store.pop(key, None)
    _memory_expiry.pop(key, None)


def _keys_mem(pattern: str = '*') -> list:
    import fnmatch
    return [k for k in _memory_store if fnmatch.fnmatch(k, pattern)]


async def kv_get(key: str) -> Optional[str]:
    if await _use_rest():
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f'{KV_REST_API_URL}/get/{key}',
                    headers={'Authorization': f'Bearer {KV_REST_API_TOKEN}'}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get('result')
                return None
        except Exception:
            return None
    return _get_mem(key)


async def kv_set(key: str, value: str, ex: int = 7200) -> bool:
    if await _use_rest():
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f'{KV_REST_API_URL}/set/{key}',
                    headers={
                        'Authorization': f'Bearer {KV_REST_API_TOKEN}',
                        'Content-Type': 'application/json'
                    },
                    json={'value': value, 'ex': ex}
                )
                return resp.status_code == 200
        except Exception:
            return False
    _set_mem(key, value, ex)
    return True


async def kv_delete(key: str) -> bool:
    if await _use_rest():
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                resp = await client.delete(
                    f'{KV_REST_API_URL}/del/{key}',
                    headers={'Authorization': f'Bearer {KV_REST_API_TOKEN}'}
                )
                return resp.status_code == 200
        except Exception:
            return False
    _del_mem(key)
    return True


async def kv_keys(pattern: str = '*') -> list:
    if await _use_rest():
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f'{KV_REST_API_URL}/keys/{pattern}',
                    headers={'Authorization': f'Bearer {KV_REST_API_TOKEN}'}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get('result', [])
                return []
        except Exception:
            return []
    return _keys_mem(pattern)


async def kv_get_json(key: str) -> Any:
    raw = await kv_get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


async def kv_set_json(key: str, value: Any, ex: int = 7200) -> bool:
    return await kv_set(key, json.dumps(value), ex=ex)


async def kv_exists(key: str) -> bool:
    if await _use_rest():
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f'{KV_REST_API_URL}/exists/{key}',
                    headers={'Authorization': f'Bearer {KV_REST_API_TOKEN}'}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get('result', 0) > 0
                return False
        except Exception:
            return False
    val = _get_mem(key)
    return val is not None
