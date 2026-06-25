# Live Streaming Platform with OBS and Vercel Frontend

A split-architecture live streaming platform:
- **Frontend**: Static site deployed on Vercel
- **Backend**: Node.js server (deployable on Railway, Render, VPS, or Docker)

## Architecture

```
OBS → RTMP → Backend (Node-Media-Server) → HLS → Frontend (Vercel) → Viewers
                                            ↑
                                         Socket.IO (viewer count, chat)
```

## Prerequisites

- **Vercel** account (for frontend)
- **Backend hosting** supporting Node.js and long-running processes (Railway, Render, VPS)
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
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── media/hls/
├── .gitignore
├── inject-env.js            # Root build script
└── README.md
```

## Local Development

### Backend Security Setup

1. Generate a bcrypt hash for your admin password:
   ```bash
   cd backend
   node generate-hash.js YourSecurePassword
   ```
   Copy the output (e.g. `BCRYPT_HASH=$2b$10$...`).

2. Generate a secure session secret (64+ characters):
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

3. Copy `.env.example` to `.env` and fill in:
   - `ADMIN_USER` – your admin username
   - `ADMIN_PASS_HASH` – the bcrypt hash from step 1
   - `SESSION_SECRET` – the random string from step 2
   - `FRONTEND_ORIGIN` – your Vercel app URL (e.g. `https://your-app.vercel.app`)
   - `NODE_ENV` – `production` in production

4. Install dependencies and start:
   ```bash
   npm install
   node server.js
   ```

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

## Production Deployment

### 1. Deploy Backend

Push the `backend/` folder to your hosting provider (Railway, Render, VPS).

For **Railway**:
- Deploy from GitHub
- Add a TCP proxy for port `1935` (Railway supports TCP proxying)
- Set environment variables:

| Variable | Example | Description |
|-----------|---------|-------------|
| `ADMIN_USER` | `admin` | Admin username |
| `ADMIN_PASS` | `Admin@123` | Admin password |
| `STREAM_KEY` | `mystream` | RTMP stream key |
| `HTTP_PORT` | `3000` | HTTP server port |
| `RTMP_PORT` | `1935` | RTMP ingest port |
| `SESSION_SECRET` | random string | Session secret |
| `FFMPEG_PATH` | `/usr/bin/ffmpeg` | ffmpeg binary path |
| `FRONTEND_ORIGIN` | `https://your-app.vercel.app` | Vercel domain for CORS |
| `NODE_ENV` | `production` | Enable secure cookies |

For **VPS / Docker**:
```bash
cd backend
docker-compose up -d --build
```

### 2. Deploy Frontend to Vercel

```bash
cd frontend
vercel init
```

In **Vercel Dashboard**:
1. Set the **Root Directory** to `frontend`
2. Add environment variable:
   - `API_BASE_URL` = `https://your-backend.railway.app` (or your backend domain)
3. Deploy

Vercel will run `node inject-env.js` during build (defined in `vercel.json`) to inject the backend URL into `frontend/js/config.js`.

### 3. Configure OBS

1. Open OBS → **Settings** → **Stream**
2. Set **Service** to **Custom**
3. Set **Server** to `rtmp://<your-backend-host>:1935/live`
4. Set **Stream Key** to `mystream` (or your custom key)

**Limit to 720p @ 30fps:**

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

## Socket.IO Events

| Event | Direction | Room | Description |
|-------|-----------|------|-------------|
| `joinViewers` | Client → Server | viewers | Join viewer room |
| `joinAdmin` | Client → Server | admin | Join admin room |
| `viewerCount` | Server → Client | viewers, admin | Real-time viewer count |
| `streamStatus` | Server → Client | all | Stream went live/offline |
| `chatMessage` | Client → Server | viewers | Send chat message |
| `chatMessage` | Server → Client | viewers | Receive chat message |

## Environment Variables (Backend)

Copy `backend/.env.example` to `backend/.env`:

- `ADMIN_USER` — admin username (default `admin`)
- `ADMIN_PASS_HASH` — **bcrypt hash** of admin password. Generate with `node generate-hash.js <password>`
- `STREAM_KEY` — default RTMP stream key
- `HTTP_PORT` — backend HTTP port (default 3000)
- `RTMP_PORT` — backend RTMP port (default 1935)
- `SESSION_SECRET` — **mandatory**, 64+ random characters
- `FRONTEND_ORIGIN` — your Vercel domain for CORS (required in production)
- `FFMPEG_PATH` — path to ffmpeg
- `NODE_ENV` — `production` for HTTPS cookies

## Security Features

- **Bcrypt password hashing** — plaintext passwords are never stored
- **Rate limiting** — 5 login attempts per 15 minutes per IP; 100 API requests per 15 minutes
- **Helmet security headers** — CSP, HSTS, XSS protection
- **Strict CORS** — only `FRONTEND_ORIGIN` allowed, credentials required
- **Session hardening** — `httpOnly`, `secure` (production), `sameSite: 'none'`
- **Input sanitization** — all inputs stripped of control characters and validated
- **RTMP stream key validation** — only the configured key can publish
- **No persistent HLS storage** — segments auto-deleted every 3 seconds
- **Global error handler** — no stack traces exposed in production

## Configuration (Frontend)

`frontend/js/config.js` is auto-updated during Vercel build:

```js
window.APP_CONFIG = {
  API_BASE_URL: 'https://your-backend.vercel.app', // injected at build time
  STREAM_KEY: 'mystream'
};
```

## Troubleshooting

- **CORS / cookies not working**: Ensure `FRONTEND_ORIGIN` in backend matches the Vercel domain exactly. Verify `NODE_ENV=production` is set so cookies use `sameSite: 'none', secure: true`.
- **ffmpeg not found**: Install ffmpeg on the backend host or set `FFMPEG_PATH`.
- **HLS not loading**: Check that `media/hls` exists and is writable. Verify the RTMP stream key matches.
- **Socket.IO connection fails**: Ensure backend allows your Vercel origin in CORS settings.

## License

MIT
