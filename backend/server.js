require('dotenv').config();

const express = require('express');
const session = require('express-session');
const NodeMediaServer = require('node-media-server');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SESSION_SECRET = process.env.SESSION_SECRET;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH;
const STREAM_KEY = process.env.STREAM_KEY || 'mystream';
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000', 10);
const RTMP_PORT = parseInt(process.env.RTMP_PORT || '1935', 10);
const FFMPEG_PATH = process.env.FFMPEG_PATH || (process.platform === 'win32' ? 'ffmpeg' : '/usr/bin/ffmpeg');
const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || (NODE_ENV === 'production' ? undefined : 'http://localhost:3000');

if (!SESSION_SECRET || SESSION_SECRET.length < 64) {
  console.error('FATAL: SESSION_SECRET environment variable is required and must be at least 64 characters long.');
  process.exit(1);
}

if (!ADMIN_PASS_HASH) {
  console.error('FATAL: ADMIN_PASS_HASH environment variable is required. Run: node generate-hash.js <your-password>');
  process.exit(1);
}

if (NODE_ENV === 'production' && !FRONTEND_ORIGIN) {
  console.error('FATAL: FRONTEND_ORIGIN environment variable is required in production.');
  process.exit(1);
}

const HLS_DIR = path.join(require('os').tmpdir(), 'live-stream-hls');
if (!fs.existsSync(HLS_DIR)) fs.mkdirSync(HLS_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const isProd = NODE_ENV === 'production';
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'", FRONTEND_ORIGIN || '*', "cdn.socket.io"],
      workerSrc: ["'self'", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'Express');
  next();
});

app.use(cors({
  origin: FRONTEND_ORIGIN === '*' ? true : FRONTEND_ORIGIN,
  credentials: true
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'none',
    secure: isProd
  },
  name: 'sessionId'
}));

const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/[\x00-\x1F\x7F]/g, '').trim();
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    return (forwarded ? forwarded.split(',')[0].trim() : req.ip);
  },
  message: { success: false, error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    return (forwarded ? forwarded.split(',')[0].trim() : req.ip);
  },
  message: { success: false, error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated === true) {
    return next();
  }
  res.status(401).json({ success: false, error: 'Unauthorized' });
}

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
const HLS_STREAM_DIR = path.join(HLS_DIR, 'live', STREAM_KEY);

nms.on('prePublish', (id, streamPath, args) => {
  const pathParts = streamPath.split('/');
  const streamKey = pathParts[pathParts.length - 1];
  if (streamKey !== STREAM_KEY) {
    console.log(`[RTMP] Rejected invalid stream key attempt: ${streamKey}`);
    throw new Error('Invalid stream key');
  }
});

nms.on('postPublish', (id, streamPath, args) => {
  console.log(`[RTMP] Stream started: ${streamPath}`);
  isLive = true;
  io.emit('streamStatus', { isLive: true });
});

nms.on('donePublish', (id, streamPath, args) => {
  console.log(`[RTMP] Stream ended: ${streamPath}`);
  isLive = false;
  io.emit('streamStatus', { isLive: false });
});

function cleanupHls() {
  try {
    if (!fs.existsSync(HLS_STREAM_DIR)) return;
    const files = fs.readdirSync(HLS_STREAM_DIR)
      .filter(f => f.endsWith('.ts'))
      .map(f => ({ name: f, time: fs.statSync(path.join(HLS_STREAM_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    const keep = files.slice(0, 3);
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

app.use('/hls', express.static(HLS_DIR, {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', FRONTEND_ORIGIN === '*' ? '*' : FRONTEND_ORIGIN);
    const ext = path.extname(res.req.url);
    if (ext === '.m3u8') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=2');
    } else if (ext === '.ts') {
      res.setHeader('Cache-Control', 'public, max-age=10');
    }
  }
}));

app.use('/api', apiLimiter);
app.use('/api/admin', requireAuth);

app.post('/api/login', loginLimiter, async (req, res) => {
  try {
    const username = sanitizeString(req.body?.username);
    const password = req.body?.password;

    if (!username || username.length < 1 || username.length > 50 || !/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({ success: false, error: 'Invalid input' });
    }
    if (!password || password.length < 1 || password.length > 128) {
      return res.status(400).json({ success: false, error: 'Invalid input' });
    }

    const passwordMatch = username === ADMIN_USER && await bcrypt.compare(password, ADMIN_PASS_HASH);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    req.session.authenticated = true;
    res.json({ success: true });
  } catch (err) {
    console.error('[Login] Error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sessionId');
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

io.use((socket, next) => {
  const sessionMiddleware = session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'none',
      secure: isProd
    }
  });
  sessionMiddleware(socket.request, {}, next);
});

io.on('connection', (socket) => {
  const isAdmin = socket.request.session && socket.request.session.authenticated === true;

  socket.on('joinViewers', () => {
    viewerCount++;
    io.to('viewers').emit('viewerCount', viewerCount);
    if (isAdmin) {
      io.to('admin').emit('viewerCount', viewerCount);
      socket.join('admin');
    }
    socket.join('viewers');
  });

  socket.on('joinAdmin', () => {
    if (!isAdmin) return;
    socket.join('admin');
    socket.emit('viewerCount', viewerCount);
  });

  socket.on('chatMessage', (msg) => {
    if (!msg || typeof msg !== 'object') return;
    const nickname = sanitizeString(msg.nickname).slice(0, 30);
    const text = sanitizeString(msg.message).slice(0, 500);
    if (!nickname || !text) return;
    io.to('viewers').emit('chatMessage', { nickname, text });
  });

  socket.on('disconnect', () => {
    if (socket.rooms.has('viewers')) {
      viewerCount = Math.max(0, viewerCount - 1);
      io.to('viewers').emit('viewerCount', viewerCount);
      io.to('admin').emit('viewerCount', viewerCount);
    }
  });
});

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  nms.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000);
});
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  nms.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000);
});

nms.run();
server.listen(HTTP_PORT, () => {
  console.log(`HTTP server running on http://localhost:${HTTP_PORT}`);
  console.log(`RTMP server running on rtmp://localhost:${RTMP_PORT}`);
  console.log(`HLS path: rtmp://localhost:${RTMP_PORT}/live/${STREAM_KEY}`);
  console.log(`HLS URL: http://localhost:${HTTP_PORT}/hls/live/${STREAM_KEY}/index.m3u8`);
});
