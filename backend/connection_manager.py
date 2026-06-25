import json
import asyncio
from datetime import datetime
from collections import defaultdict
from typing import Dict, Set

from fastapi import WebSocket, WebSocketDisconnect


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        self.viewer_count: int = 0
        self.admin_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket, room: str = 'viewers', is_admin: bool = False) -> None:
        await websocket.accept()
        self.active_connections[room].add(websocket)
        if room == 'viewers':
            self.viewer_count += 1
        if is_admin:
            self.admin_connections.add(websocket)
        await self.broadcast_counts()

    def disconnect(self, websocket: WebSocket, room: str = 'viewers') -> None:
        if websocket in self.active_connections[room]:
            self.active_connections[room].remove(websocket)
            if room == 'viewers':
                self.viewer_count = max(0, self.viewer_count - 1)
        if websocket in self.admin_connections:
            self.admin_connections.remove(websocket)
        asyncio.create_task(self.broadcast_counts())

    async def broadcast_counts(self) -> None:
        payload = json.dumps({'type': 'viewerCount', 'count': self.viewer_count})
        for conn in list(self.active_connections.get('viewers', [])):
            try:
                await conn.send_text(payload)
            except Exception:
                pass
        for conn in list(self.admin_connections):
            try:
                await conn.send_text(payload)
            except Exception:
                pass

    async def send_stream_status(self, is_live: bool) -> None:
        payload = json.dumps({'type': 'streamStatus', 'isLive': is_live})
        for conn in list(self.active_connections.get('viewers', [])):
            try:
                await conn.send_text(payload)
            except Exception:
                pass
        for conn in list(self.admin_connections):
            try:
                await conn.send_text(payload)
            except Exception:
                pass


manager = ConnectionManager()
