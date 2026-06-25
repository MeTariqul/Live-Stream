import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from config import settings
from connection_manager import manager


router = APIRouter()


@router.websocket('/ws')
async def websocket_endpoint(websocket: WebSocket) -> None:
    is_admin = False
    try:
        await websocket.accept()
    except Exception:
        return

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({'type': 'error', 'detail': 'Invalid JSON'}))
                continue

            action = message.get('action')
            if action == 'join_viewer':
                await manager.connect(websocket, room='viewers')
            elif action == 'join_admin':
                session = getattr(websocket, 'session', {})
                is_admin = session.get('authenticated', False)
                if not is_admin:
                    await websocket.send_text(json.dumps({'type': 'error', 'detail': 'Unauthorized'}))
                    continue
                await manager.connect(websocket, room='admin', is_admin=True)
            elif action == 'chat':
                if not is_admin:
                    await websocket.send_text(json.dumps({'type': 'error', 'detail': 'Unauthorized'}))
                    continue
                nickname = str(message.get('nickname', '')).strip()[:30]
                text = str(message.get('message', '')).strip()[:500]
                if not nickname or not text:
                    continue
                payload = json.dumps({'type': 'chatMessage', 'nickname': nickname, 'text': text})
                for conn in list(manager.active_connections.get('viewers', [])):
                    try:
                        await conn.send_text(payload)
                    except Exception:
                        pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
