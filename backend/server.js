require('dotenv').config();

const express = require('express');
const session = require('express-session');
const NodeMediaServer = require('node-media-server');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const FFMPEG_PATH = process.env.FFMPEG_PATH || (process.platform === 'win32' ? 'ffmpeg' : '/usr/bin/ffmpeg');

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN,
    credentials: true
  }
});

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Admin@123';
const STREAM_KEY = process.env.STREAM_KEY || 'mystream';
const HLS_DIR = process.env.HLS_DIR || path.join(require('os').tmpdir(), 'live-stream-hls', 'live');
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000', 10);
const RTMP_PORT = parseInt(process.env.RTMP_PORT || '1935', 10);

if (!fs.existsSync(HLS_DIR)) {
  fs.mkdirSync(HLS_DIR, { recursive: true });
}

const sessionSecret = process.env.SESSION_SECRET || 'change-this-secret-to-a-random-string-in-production';
const isProd = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1);
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: isProd ? 'none' : false,
    secure: isProd
  }
}));
app.use(express.json());

app.use(cors({
  origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN,
  credentials: true
}));

const frontendDir = path.join(__dirname, '..', 'frontend');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir, {
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  }));
}

app.use('/hls', express.static(HLS_DIR, {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

const nms = new NodeMediaServer({
  rtmp: {
    port: RTMP_PORT,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    mediaroot: HLS_DIR,
    allow_origin: '*',
    web_rtc_play: false,
    web_rtc_publish: false
  },
  trans: {
    ffmpeg: FFMPEG_PATH,
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=1:hls_list_size=3:hls_flags=delete_segments+append_list+omit_endlist]',
        vc: 'copy',
        vcParam: [],
        ac: 'copy',
        acParam: [],
        dash: false,
        dashFlags: '[f=dash:window_size=3:extra_window_size=5]'
      }
    ]
  }
});

let isLive = false;
let viewerCount = 0;
const HLS_STREAM_DIR = path.join(HLS_DIR, STREAM_KEY);

function cleanupHls() {
  try {
    if (!fs.existsSync(HLS_STREAM_DIR)) return;
    const files = fs.readdirSync(HLS_STREAM_DIR)
      .filter(f => f.endsWith('.ts'))
      .map(f => ({ name: f, time: fs.statSync(path.join(HLS_STREAM_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    
    const keep = files.slice(0, 5);
    let deleted = 0;
    for (const f of files.slice(3)) {
      try { fs.unlinkSync(path.join(HLS_STREAM_DIR, f.name)); deleted++; } catch {}
    }
    if (deleted > 0) console.log(`[HLS Cleanup] Removed ${deleted} old segments, kept ${keep.length}`);
  } catch (err) {
    console.error('[HLS Cleanup] Error:', err.message);
  }
}

setInterval(cleanupHls, 3000);
cleanupHls();

nms.run();
nms.on('postPublish', (id, streamPath, args) => {
  console.log('postPublish event:', { id, streamPath, args });
  isLive = true;
  io.emit('streamStatus', { isLive: true });
});

nms.on('donePublish', (id, streamPath, args) => {
  console.log('donePublish event:', { id, streamPath, args });
  isLive = false;
  io.emit('streamStatus', { isLive: false });
});

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/stream-status', (req, res) => {
  res.json({ isLive, viewers: viewerCount });
});

app.get('/api/stream-key', requireAuth, (req, res) => {
  const host = req.headers.host || `${req.hostname}:${HTTP_PORT}`;
  const rtmpUrl = `rtmp://${host}/live`;
  res.json({ streamKey: STREAM_KEY, rtmpUrl });
});

io.on('connection', (socket) => {
  socket.on('joinViewers', () => {
    viewerCount++;
    io.to('viewers').emit('viewerCount', viewerCount);
    io.to('admin').emit('viewerCount', viewerCount);
    socket.join('viewers');
  });

  socket.on('joinAdmin', () => {
    socket.join('admin');
    socket.emit('viewerCount', viewerCount);
  });

  socket.on('chatMessage', (msg) => {
    io.to('viewers').emit('chatMessage', msg);
  });

  socket.on('disconnect', () => {
    if (socket.rooms.has('viewers')) {
      viewerCount = Math.max(0, viewerCount - 1);
      io.to('viewers').emit('viewerCount', viewerCount);
      io.to('admin').emit('viewerCount', viewerCount);
    }
  });
});

const shutdown = () => {
  console.log('Shutting down gracefully...');
  nms.stop();
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(HTTP_PORT, () => {
  console.log(`HTTP server running on http://localhost:${HTTP_PORT}`);
  console.log(`RTMP server running on rtmp://localhost:${RTMP_PORT}`);
  console.log(`HLS path: rtmp://localhost:${RTMP_PORT}/live/${STREAM_KEY}`);
  console.log(`HLS URL: http://localhost:${HTTP_PORT}/hls/live/${STREAM_KEY}/index.m3u8`);
});
