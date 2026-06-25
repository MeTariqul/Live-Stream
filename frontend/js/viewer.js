(function () {
  const config = window.APP_CONFIG || {};
  const API_BASE_URL = config.API_BASE_URL || 'http://localhost:3000';
  const STREAM_KEY = config.STREAM_KEY || 'mystream';
  const HLS_URL = `${API_BASE_URL}/hls/live/${STREAM_KEY}/index.m3u8`;

  const socket = io(API_BASE_URL, { transports: ['websocket', 'polling'] });

  const video = document.getElementById('video');
  const offlineOverlay = document.getElementById('offlineOverlay');
  const viewerCountEl = document.getElementById('viewerCount');
  const statusIndicator = document.getElementById('statusIndicator');
  const chatMessages = document.getElementById('chatMessages');
  const chatForm = document.getElementById('chatForm');
  const messageInput = document.getElementById('messageInput');
  const nicknameInput = document.getElementById('nicknameInput');

  let hls = null;
  let isLive = false;
  let loadAttempts = 0;

  console.log('[Viewer] Initialized, HLS_URL:', HLS_URL);
  console.log('[Viewer] Hls.js supported:', typeof Hls !== 'undefined' && Hls.isSupported());

  function loadStream() {
    console.log('[Viewer] loadStream called, isLive:', isLive);
    if (!isLive) return;

    if (Hls.isSupported()) {
      if (hls) {
        hls.destroy();
        hls = null;
      }
      hls = new Hls({
        debug: false,
        enableWorker: true,
        lowLatencyMode: true,
        maxBufferLength: 3,
        backBufferLength: 0,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 2,
        manifestLoadingMaxRetry: 2,
        levelLoadingMaxRetry: 1,
        fragLoadingMaxRetry: 2,
        fragLoadingRetryDelay: 200,
        fragLoadingMaxRetryTimeout: 1000
      });
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('[Viewer] HLS error:', data);
        if (data.fatal) {
          offlineOverlay.classList.remove('hidden');
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            console.log('[Viewer] Network error, seeking to live edge...');
            setTimeout(() => {
              if (isLive && hls) {
                hls.startLoad();
                hls.loadSource(HLS_URL);
              }
            }, 500);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            console.log('[Viewer] Media error, recovering...');
            hls.recoverMediaError();
          }
        }
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('[Viewer] Manifest parsed, playing');
        offlineOverlay.classList.add('hidden');
        video.play().catch(e => console.log('[Viewer] Autoplay blocked:', e.message));
      });
      hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
        if (!offlineOverlay.classList.contains('hidden')) {
          offlineOverlay.classList.add('hidden');
        }
      });
      console.log('[Viewer] Loading source:', HLS_URL);
      hls.loadSource(HLS_URL);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      console.log('[Viewer] Using native HLS');
      video.src = HLS_URL;
      video.addEventListener('loadedmetadata', () => {
        console.log('[Viewer] Native HLS metadata loaded');
        offlineOverlay.classList.add('hidden');
        video.play().catch(e => console.log('[Viewer] Autoplay blocked:', e.message));
      }, { once: true });
      video.addEventListener('playing', () => {
        offlineOverlay.classList.add('hidden');
      }, { once: true });
      video.addEventListener('error', (e) => {
        console.error('[Viewer] Video error:', e);
        if (isLive) {
          setTimeout(() => {
            video.load();
          }, 1000);
        }
      }, { once: true });
      video.load();
    } else {
      console.error('[Viewer] HLS not supported');
      offlineOverlay.classList.remove('hidden');
    }
    loadAttempts++;
  }
              }, 3000);
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              console.log('[Viewer] Media error, recovering...');
              hls.recoverMediaError();
            }
          }
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('[Viewer] Manifest parsed, playing');
          offlineOverlay.classList.add('hidden');
          video.play().catch(e => console.log('[Viewer] Autoplay blocked:', e.message));
        });
      }
      console.log('[Viewer] Loading source:', HLS_URL);
      hls.loadSource(HLS_URL);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      console.log('[Viewer] Using native HLS');
      video.src = HLS_URL;
      video.addEventListener('loadedmetadata', () => {
        console.log('[Viewer] Native HLS metadata loaded');
        offlineOverlay.classList.add('hidden');
        video.play().catch(e => console.log('[Viewer] Autoplay blocked:', e.message));
      }, { once: true });
      video.addEventListener('error', (e) => {
        console.error('[Viewer] Video error:', e);
        offlineOverlay.classList.remove('hidden');
      }, { once: true });
    } else {
      console.error('[Viewer] HLS not supported');
      offlineOverlay.classList.remove('hidden');
    }
    loadAttempts++;
  }

  function updateStreamStatus(live) {
    console.log('[Viewer] updateStreamStatus:', live, 'previous:', isLive);
    isLive = live;
    if (live) {
      offlineOverlay.classList.add('hidden');
      statusIndicator.innerHTML = '<span class="dot live"></span> Live';
      loadStream();
    } else {
      offlineOverlay.classList.remove('hidden');
      statusIndicator.innerHTML = '<span class="dot offline"></span> Offline';
      if (hls) {
        hls.destroy();
        hls = null;
      }
      video.removeAttribute('src');
      video.load();
    }
  }

  async function pollStreamStatus() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/stream-status`, { credentials: 'include' });
      if (!res.ok) {
        console.log('[Viewer] Stream status API returned:', res.status);
        return;
      }
      const data = await res.json();
      console.log('[Viewer] Polled stream status:', data);
      if (data.isLive !== isLive) {
        updateStreamStatus(data.isLive);
      }
      if (data.viewers !== undefined) {
        viewerCountEl.textContent = data.viewers;
      }
    } catch (err) {
      console.error('[Viewer] Failed to poll stream status:', err);
    }
  }

  socket.on('connect', () => {
    console.log('[Viewer] Socket connected');
    socket.emit('joinViewers');
  });

  socket.on('disconnect', () => {
    console.log('[Viewer] Socket disconnected');
  });

  socket.on('streamStatus', ({ isLive }) => {
    console.log('[Viewer] Received streamStatus event:', isLive);
    updateStreamStatus(isLive);
  });

  socket.on('viewerCount', (count) => {
    viewerCountEl.textContent = count;
  });

  socket.on('connect_error', (err) => {
    console.error('[Viewer] Socket connection error:', err);
  });

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nickname = nicknameInput.value.trim();
    const text = messageInput.value.trim();
    if (!nickname || !text) return;
    socket.emit('chatMessage', { nickname, text, time: new Date().toLocaleTimeString() });
    messageInput.value = '';
  });

  socket.on('chatMessage', (msg) => {
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.innerHTML = `<span class="nickname">${escapeHtml(msg.nickname)}</span><span class="text">${escapeHtml(msg.text)}</span>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });

  setInterval(pollStreamStatus, 5000);
  pollStreamStatus();

  // Also try loading stream directly after a short delay if still not live
  setTimeout(() => {
    if (!isLive) {
      console.log('[Viewer] Initial load timeout, forcing stream check');
      pollStreamStatus();
    }
  }, 2000);

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
