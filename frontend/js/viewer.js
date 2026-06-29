(function () {
  const BACKEND_URL = window.BACKEND_URL || 'http://localhost:3000';
  let APP = {};

  APP.state = {
    user: null,
    channels: [],
    favorites: [],
    currentChannelId: null,
    isLive: false,
    hls: null,
    nowPlaying: [],
    upNext: [],
    notifications: [],
    recordings: [],
    epgGrid: {},
    epgDate: new Date().toISOString().slice(0, 10),
    activeTab: 'player',
    sidebarOpen: false,
    qualityLevels: [],
    currentLevel: -1,
    volume: 1,
    muted: false,
    playerReady: false,
    language: localStorage.getItem('lang') || 'en',
    settings: {},
    parentalVerified: {},
    lastChannelId: localStorage.getItem('lastChannelId') || null,
  };

  const $ = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => document.querySelectorAll(sel);

  I18N.setLanguage(APP.state.language);

  function html(str) { const d = document.createElement('div'); d.innerHTML = str; return d.firstElementChild; }

  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function t(key, params) { return I18N.t(key, params); }

  async function api(path, options = {}) {
    const res = await fetch(BACKEND_URL + path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    if (res.status === 401 && !path.includes('/login') && !path.includes('/signup') && path !== '/api/auth/me' && path !== '/api/channels') {
      APP.state.user = null;
      updateUI();
    }
    return res;
  }

  async function apiJSON(path, options = {}) {
    const res = await api(path, options);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'Request failed');
    }
    return res.json();
  }

  function showToast(msg, type = 'info') {
    let toast = qs('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = 'toast ' + type + ' show';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 4000);
  }

  function showModal(id) {
    const el = $(id);
    if (el) el.classList.add('show');
  }

  function hideModal(id) {
    const el = $(id);
    if (el) el.classList.remove('show');
  }

  /* ─── Auth ─── */
  async function checkAuth() {
    try {
      const data = await apiJSON('/api/auth/me');
      APP.state.user = data;
    } catch {
      APP.state.user = null;
    }
  }

  async function doLogin(username, password) {
    const data = await apiJSON('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    APP.state.user = { username: data.username, tier: data.tier };
    hideModal('loginModal');
    updateUI();
    showToast('Logged in as ' + username, 'success');
  }

  async function doSignup(username, password) {
    const data = await apiJSON('/api/signup', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    APP.state.user = { username: data.username, tier: 'basic' };
    hideModal('signupModal');
    updateUI();
    showToast('Account created!', 'success');
  }

  async function doLogout() {
    await api('/api/logout', { method: 'POST' });
    APP.state.user = null;
    updateUI();
    showToast('Logged out');
  }

  /* ─── Favorites ─── */
  async function fetchFavorites() {
    if (!APP.state.user) { APP.state.favorites = []; return; }
    try { APP.state.favorites = await apiJSON('/api/favorites'); } catch { APP.state.favorites = []; }
  }

  async function toggleFavorite(channelId) {
    if (!APP.state.user) { showModal('loginModal'); return; }
    const isFav = APP.state.favorites.includes(channelId);
    try {
      if (isFav) {
        await apiJSON('/api/favorites/' + channelId, { method: 'DELETE' });
        APP.state.favorites = APP.state.favorites.filter(f => f !== channelId);
      } else {
        const data = await apiJSON('/api/favorites/' + channelId, { method: 'POST' });
        APP.state.favorites = data.favorites;
      }
      renderChannelList();
    } catch (e) { showToast(e.message, 'error'); }
  }

  /* ─── Channels ─── */
  async function fetchChannels() {
    try {
      const data = await apiJSON('/api/channels');
      const prevId = APP.state.currentChannelId;
      APP.state.channels = data;
      if (data.length > 0) {
        const stillExists = data.find(c => c.id === prevId);
        if (!stillExists) {
          const active = data.find(c => c.status === 'active');
          APP.state.currentChannelId = active ? active.id : data[0].id;
        }
      } else {
        APP.state.currentChannelId = null;
      }
      renderChannelList();
      loadCurrentChannel();
      updateNowPlayingOverlay();
      updateUpNextOverlay();
    } catch {}
  }

  function renderChannelList() {
    const list = $('channelList');
    if (!list) return;
    const searchQ = ($('sidebarSearch')) ? $('sidebarSearch').value.toLowerCase() : '';
    const filter = window.appFilter || 'all';
    const catFilter = '';

    let channels = APP.state.channels;
    if (searchQ) {
      channels = channels.filter(c =>
        c.name.toLowerCase().includes(searchQ) ||
        (c.category || '').toLowerCase().includes(searchQ)
      );
    }
    if (filter === 'live') channels = channels.filter(c => c.status === 'active');
    if (filter === 'favorites' && APP.state.user) {
      channels = channels.filter(c => APP.state.favorites.includes(c.id));
    }
    if (catFilter) channels = channels.filter(c => c.category === catFilter);

    list.innerHTML = '';
    if (channels.length === 0) {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:#666;font-size:13px;">' + t('no_channels') + '</div>';
      return;
    }

    channels.forEach(ch => {
      const isActive = ch.status === 'active';
      const isFav = APP.state.favorites.includes(ch.id);
      const isCurrent = ch.id === APP.state.currentChannelId;
      const isMature = ch.is_mature;

      const item = document.createElement('div');
      item.className = 'channel-item' + (isCurrent ? ' active' : '');
      item.innerHTML = `
        <div class="channel-icon">${ch.icon_url ? '<img src="' + escapeHtml(ch.icon_url) + '" alt="">' : ch.name[0].toUpperCase()}</div>
        <div class="channel-info">
          <div class="channel-name">${escapeHtml(ch.name)}${isMature ? '<span class="mature-badge">18+</span>' : ''}</div>
          <div class="channel-category">${escapeHtml(ch.category || 'General')}</div>
        </div>
        <button class="fav-btn${isFav ? ' active' : ''}" data-id="${ch.id}" title="Favorite">${isFav ? '\u2605' : '\u2606'}</button>
        <div class="channel-status">
          <span class="status-dot ${isActive ? 'live' : 'idle'}"></span>
          <span class="status-text ${isActive ? 'live' : 'idle'}">${isActive ? t('live') : t('offline')}</span>
        </div>
      `;

      const favBtn = item.querySelector('.fav-btn');
      favBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleFavorite(ch.id); });

      item.addEventListener('click', () => {
        if (isMature && !APP.state.parentalVerified[ch.id]) {
          showParentalPin(ch.id, () => {
            selectChannel(ch.id);
          });
        } else {
          selectChannel(ch.id);
        }
      });

      list.appendChild(item);
    });
  }

  function selectChannel(channelId) {
    APP.state.currentChannelId = channelId;
    localStorage.setItem('lastChannelId', channelId);
    loadCurrentChannel();
    renderChannelList();
    if (window.innerWidth <= 768) {
      $('sidebar').classList.remove('open');
      APP.state.sidebarOpen = false;
    }
    logWatchHistory(channelId);
  }

  async function logWatchHistory(channelId) {
    if (!APP.state.user) return;
    const ch = APP.state.channels.find(c => c.id === channelId);
    try {
      await api('/api/history/last-watched', {
        method: 'POST',
        body: JSON.stringify({ channel_id: channelId, channel_name: ch ? ch.name : '' }),
      });
      await api('/api/history', {
        method: 'POST',
        body: JSON.stringify({ channel_id: channelId, channel_name: ch ? ch.name : '', program_title: '' }),
      });
    } catch {}
  }

  /* ─── Player ─── */
  function loadCurrentChannel() {
    const ch = APP.state.channels.find(c => c.id === APP.state.currentChannelId);
    const video = $('video');
    const offlineScreen = $('offlineScreen');

    if (!ch || ch.status !== 'active' || !ch.playback_url) {
      APP.state.isLive = false;
      if (offlineScreen) offlineScreen.classList.remove('hidden');
      destroyHls();
      if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
      updatePlayerUI();
      return;
    }

    if (APP.state.isLive && video && video.src && video.src.includes(ch.playback_url)) return;

    if (offlineScreen) offlineScreen.classList.add('hidden');
    loadHlsStream(ch.playback_url, ch.id);
    document.title = ch.name + ' - ' + (APP.state.settings.platform_name || 'My Live TV');
  }

  function destroyHls() {
    if (APP.state.hls) {
      try { APP.state.hls.destroy(); } catch {}
      APP.state.hls = null;
    }
    APP.state.playerReady = false;
    APP.state.qualityLevels = [];
  }

  function loadHlsStream(url, channelId) {
    const video = $('video');
    if (!video) return;
    destroyHls();

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        backBufferLength: 0,
        liveSyncDurationCount: 3,
        enableWorker: true,
      });

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        APP.state.playerReady = true;
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        APP.state.isLive = true;
        updatePlayerUI();
        video.play().catch(() => {});
        APP.state.qualityLevels = hls.levels.map((l, i) => ({
          index: i,
          height: l.height,
          bitrate: l.bitrate,
          name: l.height ? l.height + 'p' : (l.bitrate ? Math.round(l.bitrate / 1000) + 'k' : 'Auto'),
        }));
        updateQualitySelector();
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (e, data) => {
        APP.state.currentLevel = data.level;
      });

      hls.on(Hls.Events.ERROR, (e, data) => {
        if (data.fatal) {
          APP.state.isLive = false;
          const offline = $('offlineScreen');
          if (offline) offline.classList.remove('hidden');
          updatePlayerUI();
          setTimeout(() => {
            if (APP.state.currentChannelId === channelId) loadCurrentChannel();
          }, 5000);
        }
      });

      hls.on(Hls.Events.BUFFER_APPENDING, () => {
        const progress = $('progressBuffered');
        if (progress && hls) {
          const buffLen = hls.media?.buffered?.length || 0;
          if (buffLen > 0) {
            const buffEnd = hls.media.buffered.end(buffLen - 1);
            const dur = hls.media.duration || 1;
            progress.style.width = Math.min((buffEnd / dur) * 100, 100) + '%';
          }
        }
      });

      hls.loadSource(url);
      hls.attachMedia(video);
      APP.state.hls = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.addEventListener('loadedmetadata', () => {
        APP.state.isLive = true;
        updatePlayerUI();
        video.play().catch(() => {});
      });
      video.addEventListener('error', () => {
        APP.state.isLive = false;
        const offline = $('offlineScreen');
        if (offline) offline.classList.remove('hidden');
      });
    } else {
      const offline = $('offlineScreen');
      if (offline) offline.classList.remove('hidden');
    }
  }

  function updatePlayerUI() {
    const video = $('video');
    const liveIndicator = $('liveIndicator');
    const offlineScreen = $('offlineScreen');

    if (APP.state.isLive) {
      if (liveIndicator) { liveIndicator.textContent = t('live'); liveIndicator.classList.remove('hidden'); }
      if (offlineScreen) offlineScreen.classList.add('hidden');
    } else {
      if (liveIndicator) liveIndicator.classList.add('hidden');
    }

    if ($('progressPlayed')) $('progressPlayed').style.width = '0%';
    if ($('progressBuffered')) $('progressBuffered').style.width = '0%';
    if ($('currentTime')) $('currentTime').textContent = '0:00';
    if ($('duration')) $('duration').textContent = '0:00';
  }

  /* ─── Video Controls ─── */
  function setupVideoControls() {
    const video = $('video');
    const progressWrapper = $('progressWrapper');
    const progressPlayed = $('progressPlayed');
    const progressBuffered = $('progressBuffered');
    const currentTime = $('currentTime');
    const duration = $('duration');
    const volSlider = $('volumeSlider');
    const volBtn = $('volumeBtn');
    const fsBtn = $('fullscreenBtn');
    const qualitySelect = $('qualitySelect');
    const refreshBtn = $('refreshBtn');

    if (!video) return;

    video.addEventListener('timeupdate', () => {
      if (!video.duration) return;
      const pct = (video.currentTime / video.duration) * 100;
      if (progressPlayed) progressPlayed.style.width = pct + '%';
      if (currentTime) currentTime.textContent = formatTime(video.currentTime);
    });

    video.addEventListener('loadedmetadata', () => {
      if (duration) duration.textContent = formatTime(video.duration || 0);
    });

    video.addEventListener('volumechange', () => {
      if (volSlider) volSlider.value = video.volume;
      APP.state.volume = video.volume;
      APP.state.muted = video.muted;
      if (volBtn) volBtn.textContent = video.muted || video.volume === 0 ? '\u{1F507}' : video.volume < 0.5 ? '\u{1F509}' : '\u{1F50A}';
    });

    if (progressWrapper) {
      progressWrapper.addEventListener('click', (e) => {
        if (!video.duration) return;
        const rect = progressWrapper.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        video.currentTime = pct * video.duration;
      });
    }

    if (volSlider) {
      volSlider.addEventListener('input', () => {
        video.volume = parseFloat(volSlider.value);
        video.muted = video.volume === 0;
      });
    }

    if (volBtn) {
      volBtn.addEventListener('click', () => {
        video.muted = !video.muted;
      });
    }

    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        const wrapper = $('playerWrapper');
        if (!document.fullscreenElement) {
          if (wrapper.requestFullscreen) wrapper.requestFullscreen();
          else if (wrapper.webkitRequestFullscreen) wrapper.webkitRequestFullscreen();
        } else {
          if (document.exitFullscreen) document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
      });
    }

    if (qualitySelect) {
      qualitySelect.addEventListener('change', () => {
        const val = parseInt(qualitySelect.value);
        if (APP.state.hls) {
          APP.state.currentLevel = val;
          APP.state.hls.currentLevel = val;
        }
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        loadCurrentChannel();
        showToast('Stream refreshed', 'success');
      });
    }

    const playerWrapper = $('playerWrapper');
    if (playerWrapper) {
      playerWrapper.addEventListener('dblclick', () => {
        if (fsBtn) fsBtn.click();
      });
    }
  }

  function updateQualitySelector() {
    const sel = $('qualitySelect');
    if (!sel) return;
    sel.innerHTML = '<option value="-1">' + t('auto') + '</option>';
    APP.state.qualityLevels.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.index;
      opt.textContent = l.name;
      if (l.index === APP.state.currentLevel) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function formatTime(seconds) {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    return m + ':' + String(s).padStart(2, '0');
  }

  /* ─── Now Playing / Up Next ─── */
  async function fetchNowPlaying() {
    try {
      APP.state.nowPlaying = await apiJSON('/api/epg/now');
      updateNowPlayingOverlay();
    } catch {}
  }

  async function fetchUpNext() {
    try {
      APP.state.upNext = await apiJSON('/api/epg/upnext');
      updateUpNextOverlay();
    } catch {}
  }

  function updateNowPlayingOverlay() {
    const overlay = $('nowPlayingOverlay');
    if (!overlay) return;
    const current = APP.state.nowPlaying.find(p => p.channel_id === APP.state.currentChannelId);
    if (current) {
      overlay.innerHTML = `
        <div class="now-playing-title">${escapeHtml(current.title)}</div>
        ${current.description ? '<div class="now-playing-desc">' + escapeHtml(current.description) + '</div>' : ''}
        <div class="now-playing-time">${Math.floor((current.remaining_seconds || 0) / 60)}m remaining</div>
      `;
      overlay.style.display = 'block';
    } else {
      overlay.style.display = 'none';
    }
  }

  function updateUpNextOverlay() {
    const el = $('upNextInfo');
    if (!el) return;
    const next = APP.state.upNext.find(p => p.channel_id === APP.state.currentChannelId);
    if (next) {
      el.innerHTML = '<strong>' + t('up_next') + ':</strong> ' + escapeHtml(next.title) + ' (' + Math.floor((next.starts_in_seconds || 0) / 60) + 'm)';
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  }

  /* ─── EPG ─── */
  async function fetchEPGGrid() {
    try {
      APP.state.epgGrid = await apiJSON('/api/epg/grid?date=' + APP.state.epgDate);
      renderEPGGrid();
    } catch {}
  }

  function renderEPGGrid() {
    const container = $('epgGridContent');
    if (!container) return;
    const channels = APP.state.channels;
    const now = new Date();
    let html = '<table class="epg-table"><thead><tr><th>Channel</th>';
    for (let h = 6; h < 26; h++) {
      html += '<th>' + String(h % 24).padStart(2, '0') + ':00</th>';
    }
    html += '</tr></thead><tbody>';

    channels.forEach(ch => {
      const progs = APP.state.epgGrid[ch.id] || [];
      html += '<tr><td><strong>' + escapeHtml(ch.name) + '</strong></td>';
      for (let h = 6; h < 26; h++) {
        const hourStart = new Date(APP.state.epgDate + 'T' + String(h % 24).padStart(2, '0') + ':00:00');
        const hourEnd = new Date(hourStart.getTime() + 3600000);
        const match = progs.find(p => {
          try {
            const ps = new Date(p.start_datetime);
            const pe = new Date(p.end_datetime);
            return ps < hourEnd && pe > hourStart;
          } catch { return false; }
        });
        const isNow = match && (() => { try { return new Date(match.start_datetime) <= now && new Date(match.end_datetime) > now; } catch { return false; } })();
        html += '<td>' + (match ? '<div class="epg-program' + (isNow ? ' now' : '') + '"><div class="epg-title">' + escapeHtml(match.title) + '</div><div class="epg-time">' + match.start_datetime.slice(11, 16) + '-' + match.end_datetime.slice(11, 16) + '</div></div>' : '') + '</td>';
      }
      html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  /* ─── Notifications ─── */
  async function fetchNotifications() {
    try {
      APP.state.notifications = await apiJSON('/api/notifications');
      renderNotifications();
    } catch {}
  }

  function renderNotifications() {
    const banner = $('notificationBanner');
    if (!banner) return;
    const active = APP.state.notifications.filter(n => n.active);
    if (active.length > 0) {
      banner.textContent = active[0].message;
      banner.classList.add('show');
    } else {
      banner.classList.remove('show');
    }
  }

  async function checkFavoriteLive() {
    if (!APP.state.user) return;
    try {
      const live = await apiJSON('/api/notifications/favorite-live');
      live.forEach(ch => {
        if (Notification.permission === 'granted') {
          new Notification(ch.name + ' ' + t('channel_live'));
        }
      });
    } catch {}
  }

  async function checkReminders() {
    if (!APP.state.user) return;
    try {
      const due = await apiJSON('/api/notifications/reminders');
      due.forEach(d => {
        showToast(d.title + ' ' + t('program_reminder'));
        if (Notification.permission === 'granted') {
          new Notification(d.title + ' ' + t('program_reminder'));
        }
      });
    } catch {}
  }

  /* ─── Modal listeners ─── */
  function setupModalListeners() {
    const epgModal = $('epgModal');
    const recModal = $('recordingsModal');

    if (epgModal) {
      const observer = new MutationObserver(() => {
        if (epgModal.classList.contains('show')) {
          APP.state.epgDate = document.getElementById('epgDate')?.value || new Date().toISOString().slice(0, 10);
          fetchEPGGrid();
        }
      });
      observer.observe(epgModal, { attributes: true, attributeFilter: ['class'] });

      const dateInput = document.getElementById('epgDate');
      if (dateInput) {
        dateInput.addEventListener('change', () => {
          if (epgModal.classList.contains('show')) {
            APP.state.epgDate = dateInput.value;
            fetchEPGGrid();
          }
        });
      }
      const todayBtn = document.getElementById('epgTodayBtn');
      if (todayBtn) {
        todayBtn.addEventListener('click', () => {
          if (dateInput) {
            const today = new Date();
            dateInput.value = today.toISOString().slice(0, 10);
            APP.state.epgDate = dateInput.value;
            if (epgModal.classList.contains('show')) fetchEPGGrid();
          }
        });
      }
    }

    if (recModal) {
      const observer = new MutationObserver(() => {
        if (recModal.classList.contains('show')) {
          fetchRecordings();
        }
      });
      observer.observe(recModal, { attributes: true, attributeFilter: ['class'] });
    }
  }

  /* ─── Parental ─── */
  function showParentalPin(channelId, callback) {
    showModal('parentalModal');
    $('parentalChannelId').value = channelId;
    $('parentalCallback')._cb = callback;
    $('parentalError').textContent = '';
    $('parentalInput').value = '';
    $('parentalInput').focus();
  }

  async function submitParentalPin() {
    const pin = $('parentalInput').value;
    const channelId = $('parentalChannelId').value;
    try {
      await apiJSON('/api/parental/verify', {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      APP.state.parentalVerified[channelId] = true;
      hideModal('parentalModal');
      if ($('parentalCallback')._cb) $('parentalCallback')._cb();
      showToast('Access granted', 'success');
    } catch (e) {
      $('parentalError').textContent = 'Invalid PIN';
    }
  }

  /* ─── Recordings ─── */
  async function fetchRecordings() {
    if (!APP.state.user) return;
    try {
      APP.state.recordings = await apiJSON('/api/recordings');
      renderRecordings();
    } catch {}
  }

  function renderRecordings() {
    const container = $('recordingsList');
    if (!container) return;
    if (APP.state.recordings.length === 0) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">No VOD recordings available</div>';
      return;
    }
    container.innerHTML = '';
    APP.state.recordings.forEach(rec => {
      const card = document.createElement('div');
      card.className = 'recording-card';
      card.innerHTML = `
        <div class="recording-title">${escapeHtml(rec.title)}</div>
        <div class="recording-meta">${rec.duration ? Math.round(rec.duration) + 's' : ''} ${rec.channel_name ? '\u00B7 ' + escapeHtml(rec.channel_name) : ''}</div>
      `;
      card.addEventListener('click', () => {
        if (rec.playback_url) {
          const video = $('video');
          if (video) {
            destroyHls();
            video.src = rec.playback_url;
            video.play().catch(() => {});
            APP.state.isLive = false;
            const offline = $('offlineScreen');
            if (offline) offline.classList.add('hidden');
            updatePlayerUI();
          }
        }
      });
      container.appendChild(card);
    });
  }

  /* ─── Search ─── */
  let searchTimeout = null;
  function setupSearch() {
    const input = $('sidebarSearch');
    if (!input) return;
    input.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        renderChannelList();
      }, 300);
    });
  }

  /* ─── Tabs ─── */
  function setupTabs() {
    qsa('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-tab');
        qsa('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        qsa('.tab-content').forEach(tc => tc.classList.remove('active'));
        const content = $(target + 'Tab');
        if (content) content.classList.add('active');
        APP.state.activeTab = target;
        if (target === 'recordings') fetchRecordings();
        if (target === 'epg') { APP.state.epgDate = new Date().toISOString().slice(0, 10); fetchEPGGrid(); }
      });
    });
  }

  /* ─── Settings / Branding ─── */
  async function fetchPublicSettings() {
    try {
      APP.state.settings = await apiJSON('/api/admin/public/settings');
      applySettings();
    } catch {}
  }

  function applySettings() {
    const s = APP.state.settings;
    if (s.platform_name) {
      document.title = s.platform_name;
      qsa('.logo-text').forEach(el => el.textContent = s.platform_name);
    }
    if (s.logo_url) {
      qsa('.logo-img').forEach(el => { el.src = s.logo_url; el.style.display = 'inline'; });
    }
    if (s.primary_color) {
      document.documentElement.style.setProperty('--accent', s.primary_color);
    }
    if (s.default_language) {
      APP.state.language = s.default_language;
      I18N.setLanguage(s.default_language);
    }
  }

  /* ─── UI Updates ─── */
  function updateUI() {
    const user = APP.state.user;
    const loginBtn = $('loginBtn');
    const signupBtn = $('signupBtn');
    const userMenu = $('userMenu');
    const userName = $('userName');

    if (user) {
      if (loginBtn) loginBtn.style.display = 'none';
      if (signupBtn) signupBtn.style.display = 'none';
      if (userMenu) userMenu.style.display = 'flex';
      if (userName) userName.textContent = user.username;
    } else {
      if (loginBtn) loginBtn.style.display = 'inline-flex';
      if (signupBtn) signupBtn.style.display = 'inline-flex';
      if (userMenu) userMenu.style.display = 'none';
    }

    const favTab = qs('[data-tab="favorites"]');
    if (favTab) favTab.style.display = user ? 'block' : 'none';

    fetchFavorites();
  }

  /* ─── Hamburger ─── */
  function setupHamburger() {
    const btn = $('hamburger');
    const sidebar = $('sidebar');
    if (!btn || !sidebar) return;
    btn.addEventListener('click', () => {
      APP.state.sidebarOpen = !APP.state.sidebarOpen;
      sidebar.classList.toggle('open');
    });
  }

  /* ─── Mobile sidebar close on click outside ─── */
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && APP.state.sidebarOpen) {
      const sidebar = $('sidebar');
      const hamburger = $('hamburger');
      if (sidebar && !sidebar.contains(e.target) && !hamburger.contains(e.target)) {
        sidebar.classList.remove('open');
        APP.state.sidebarOpen = false;
      }
    }
  });

  /* ─── Init ─── */
  async function init() {
    await fetchPublicSettings();

    const loginForm = $('loginForm');
    const signupForm = $('signupForm');
    const logoutBtn = $('logoutBtn');
    const profileBtn = $('profileBtn');
    const showSignupLink = $('showSignup');
    const showLoginLink = $('showLogin');

    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = loginForm.querySelector('.form-error');
        try {
          await doLogin(
            loginForm.querySelector('[name="username"]').value,
            loginForm.querySelector('[name="password"]').value
          );
        } catch (e2) { if (err) err.textContent = e2.message; }
      });
    }

    if (signupForm) {
      signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = signupForm.querySelector('.form-error');
        const pw = signupForm.querySelector('[name="password"]').value;
        const cpw = signupForm.querySelector('[name="confirmPassword"]');
        if (cpw && pw !== cpw.value) { if (err) err.textContent = 'Passwords do not match'; return; }
        try {
          await doSignup(signupForm.querySelector('[name="username"]').value, pw);
        } catch (e2) { if (err) err.textContent = e2.message; }
      });
    }

    if (showSignupLink) {
      showSignupLink.addEventListener('click', (e) => { e.preventDefault(); hideModal('loginModal'); showModal('signupModal'); });
    }
    if (showLoginLink) {
      showLoginLink.addEventListener('click', (e) => { e.preventDefault(); hideModal('signupModal'); showModal('loginModal'); });
    }

    if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
    if (profileBtn) profileBtn.addEventListener('click', () => { showModal('profileModal'); loadProfile(); });

    $('parentalSubmit')?.addEventListener('click', submitParentalPin);
    $('parentalInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitParentalPin(); });

    setupHamburger();
    setupSearch();
    setupVideoControls();
    setupTabs();

    setupModalListeners();
    await checkAuth();
    updateUI();
    await fetchChannels();
    await fetchFavorites();
    await fetchNowPlaying();
    await fetchUpNext();

    if (APP.state.lastChannelId && APP.state.channels.find(c => c.id === APP.state.lastChannelId)) {
      APP.state.currentChannelId = APP.state.lastChannelId;
      loadCurrentChannel();
    } else {
      const active = APP.state.channels.find(c => c.status === 'active');
      if (active) {
        APP.state.currentChannelId = active.id;
        loadCurrentChannel();
      } else if (APP.state.channels.length > 0) {
        APP.state.currentChannelId = APP.state.channels[0].id;
        loadCurrentChannel();
      }
    }

    renderChannelList();

    setInterval(fetchChannels, 10000);
    setInterval(fetchNowPlaying, 30000);
    setInterval(fetchUpNext, 30000);
    setInterval(fetchNotifications, 30000);
    setInterval(checkFavoriteLive, 30000);
    setInterval(checkReminders, 60000);

    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function loadProfile() {
    if (!APP.state.user) return;
    const container = $('profileContent');
    if (!container) return;
    container.innerHTML = `
      <form id="changePwForm">
        <div class="form-group">
          <label>${t('current_password')}</label>
          <input type="password" name="currentPassword" required minlength="1">
        </div>
        <div class="form-group">
          <label>${t('new_password')}</label>
          <input type="password" name="newPassword" required minlength="6">
        </div>
        <button type="submit" class="btn btn-primary">${t('change_password')}</button>
        <div class="form-error"></div>
        <div class="form-success"></div>
      </form>
      <hr style="border-color:var(--border);margin:20px 0;">
      <button id="deleteAccountBtn" class="btn btn-danger">${t('delete_account')}</button>
    `;

    $('changePwForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('changePwForm').querySelector('.form-error');
      const success = $('changePwForm').querySelector('.form-success');
      try {
        await apiJSON('/api/users/me/change-password', {
          method: 'POST',
          body: JSON.stringify({
            current_password: $('changePwForm').querySelector('[name="currentPassword"]').value,
            new_password: $('changePwForm').querySelector('[name="newPassword"]').value,
          }),
        });
        if (success) success.textContent = 'Password changed successfully';
        if (err) err.textContent = '';
        $('changePwForm').querySelector('[name="currentPassword"]').value = '';
        $('changePwForm').querySelector('[name="newPassword"]').value = '';
      } catch (e2) { if (err) err.textContent = e2.message; }
    });

    $('deleteAccountBtn').addEventListener('click', async () => {
      if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;
      const pw = prompt('Enter your password to confirm deletion:');
      if (!pw) return;
      try {
        await apiJSON('/api/users/me/delete', {
          method: 'POST',
          body: JSON.stringify({ password: pw }),
        });
        APP.state.user = null;
        hideModal('profileModal');
        updateUI();
        showToast('Account deleted', 'success');
      } catch (e2) { showToast(e2.message, 'error'); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
