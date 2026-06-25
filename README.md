# Live Streaming Platform with OBS and Vercel Frontend

A split-architecture live streaming platform:
- **Frontend**: Static site deployed on Vercel
- **Backend**: Python FastAPI server (deployable on Railway, Render, VPS, or Docker)

## Architecture

```
OBS → RTMP → Nginx (RTMP module) → HLS → FastAPI Backend → Frontend (Vercel) → Viewers
                                              ↑
                                         WebSocket (viewer count, chat)
```

## Prerequisites

- **Vercel** account (for frontend)
- **Backend hosting** supporting Python 3.10+ and long-running processes (Railway, Render, VPS)
- **Nginx** with RTMP module installed on the backend host
- **ffmpeg** installed on the backend host
- **OBS Studio** for broadcasting

## Project Structure

```
live-stream-platform/
├── frontend/                 # Deploy to Vercel
│   ├── index.html
│   ├── admin/
│   │   ├── index.html
│   │   └── dashboard.html
│   ├── css/style.css
│   ├── js/
│   │   ├── config.js
│   │   ├── viewer.js
│   │   └── admin.js
│   ├── inject-env.js        # Vercel build script
│   └── vercel.json          # Vercel config
├── backend/                  # Deploy separately
│   ├── main.py
│   ├── config.py
│   ├── models.py
│   ├── state.py
│   ├── connection_manager.py
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── stream.py
│   │   ├── internal.py
│   │   └── websocket.py
│   ├── nginx.conf.j2
│   ├── generate_nginx_config.py
│   ├── generate_hash.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── Dockerfile
│   └── docker-compose.yml
├── .gitignore
├── inject-env.js            # Root build script
└── README.md
```

## Local Development

### Backend Security Setup

1. Generate a bcrypt hash for your admin password:
   ```bash
   cd backend
   python generate_hash.py YourSecurePassword
   ```
   Copy the output (e.g. `ADMIN_PASS_HASH=$2b$12$...`).

2. Generate a secure session secret (64+ characters):
   ```bash
   python -c "import secrets; print(secrets.token_hex(64))"
   ```

3. Copy `.env.example` to `.env` and fill in:
   - `ADMIN_USER` – your admin username
   - `ADMIN_PASS_HASH` – the bcrypt hash from step 1
   - `SESSION_SECRET` – the random string from step 2
   - `FRONTEND_ORIGIN` – your Vercel app URL (e.g. `https://your-app.vercel.app`)
   - `ENVIRONMENT` – `production` in production

4. Install dependencies and start:
   ```bash
   pip install -r requirements.txt
   python main.py
   ```

5. (Optional) Generate Nginx config:
   ```bash
   python generate_nginx_config.py
   ```

### Nginx Configuration

The backend includes a Jinja2 template (`nginx.conf.j2`). Render it with `python generate_nginx_config.py` and deploy to `/etc/nginx/nginx.conf` or use Docker Compose.

Key Nginx settings:
- RTMP listen: `{{ rtmp_port }}` (default 1935)
- HLS path: `{{ hls_path }}/live/{{ stream_key }}`
- Internal webhooks: `http://127.0.0.1:{{ http_port }}/api/internal/stream-start` and `stream-stop`

### Frontend Deployment

1. In Vercel Dashboard, set environment variables:
   - `API_BASE_URL` = your backend URL (e.g. `https://your-backend.railway.app`)
   - `NODE_ENV` = `production`

2. Set Root Directory to `frontend` and deploy.

### OBS Configuration (Max 720p @ 30fps)

1. Open OBS → **Settings** → **Stream**
2. Set **Service** to **Custom**
3. Set **Server** to `rtmp://<your-backend-host>:1935/live`
4. Set **Stream Key** to `mystream` (or your custom key)

**Limit resolution and framerate:**
- **Settings → Output → Simple mode:**
  - **Scaled Output Resolution**: `1280x720`
  - **FPS**: `30`
  - **Keyframe Interval**: `1 second`

- **Settings → Output → Advanced mode:**
  - **Video → Output Resolution**: `1280x720`
  - **Video → FPS**: `30`
  - **Video → Keyframe Interval**: `1s`

5. Click **Apply** and start streaming

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/login` | No | Validate credentials, create session |
| POST | `/api/logout` | No | Destroy session |
| GET | `/api/stream-status` | No | Returns `{ isLive, viewers }` |
| GET | `/api/stream-key` | Admin | Returns `{ streamKey, rtmpUrl }` |
| POST | `/api/internal/stream-start` | Localhost | Nginx webhook: stream started |
| POST | `/api/internal/stream-stop` | Localhost | Nginx webhook: stream stopped |

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `{"action": "join_viewer"}` | Client → Server | Join viewer room |
| `{"action": "join_admin"}` | Client → Server | Join admin room (requires auth) |
| `{"type": "viewerCount", "count": N}` | Server → Client | Real-time viewer count |
| `{"type": "streamStatus", "isLive": bool}` | Server → Client | Stream went live/offline |
| `{"action": "chat", "nickname": "...", "message": "..."}` | Client → Server | Send chat message (admin only) |
| `{"type": "chatMessage", ...}` | Server → Client | Receive chat message |

## Environment Variables

Copy `backend/.env.example` to `backend/.env`:

- `ADMIN_USER` — admin username (default `admin`)
- `ADMIN_PASS_HASH` — **bcrypt hash** of admin password. Generate with `python generate_hash.py <password>`
- `STREAM_KEY` — default RTMP stream key
- `HTTP_PORT` — backend HTTP port (default 3000)
- `RTMP_PORT` — backend RTMP port (default 1935)
- `SESSION_SECRET` — **mandatory**, 64+ random characters
- `FRONTEND_ORIGIN` — your Vercel domain for CORS (required in production)
- `RTMP_PUBLIC_URL` — public RTMP URL (e.g. `rtmp://your-server.com:1935/live`)
- `FFMPEG_PATH` — path to ffmpeg
- `ENVIRONMENT` — `production` for HTTPS cookies
- `HLS_PATH` — directory for Nginx HLS output

## Security Features

- **Bcrypt password hashing** — plaintext passwords are never stored
- **Rate limiting** — 5 login attempts per 15 minutes per IP; 100 API requests per 15 minutes (via slowapi)
- **Security headers** — CSP, HSTS, XSS protection, nosniff, frame-options
- **Strict CORS** — only `FRONTEND_ORIGIN` allowed, credentials required
- **Session hardening** — `httponly`, `secure` (production), `sameSite='none'`
- **Input validation** — all inputs validated via Pydantic models
- **RTMP stream key validation** — Nginx `on_publish` hook validates against Python backend
- **Global error handler** — no stack traces exposed in production

## Troubleshooting

- **CORS / cookies not working**: Ensure `FRONTEND_ORIGIN` matches your Vercel domain exactly (no trailing slash). Verify `ENVIRONMENT=production` sets secure cookies.
- **ffmpeg not found**: Install ffmpeg or set `FFMPEG_PATH`.
- **HLS not loading**: Check that `HLS_PATH` exists and Nginx can write to it. Verify stream key matches.
- **RTMP connection refused**: Ensure Nginx is running and listening on `RTMP_PORT`.
- **WebSocket fails**: Ensure backend allows your Vercel origin in CORS settings.

## License

MIT
