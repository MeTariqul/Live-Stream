(function () {
  const BACKEND_URL = window.BACKEND_URL || 'http://localhost:3000';
  let ADMIN = {};

  ADMIN.state = {
    channels: [],
    recordings: [],
    users: [],
    logs: [],
    settings: {},
    analytics: {},
    epg: {},
    activeNav: 'overview',
  };

  const $ = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => document.querySelectorAll(sel);

  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function html(str) { const d = document.createElement('div'); d.innerHTML = str; return d.firstElementChild; }

  async function api(path, options = {}) {
    const res = await fetch(BACKEND_URL + path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    if (res.status === 401) {
      showLogin();
      throw new Error('Unauthorized');
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

  function showLogin() {
    $('loginContainer').style.display = 'flex';
    $('appContainer').style.display = 'none';
  }

  function showApp() {
    $('loginContainer').style.display = 'none';
    $('appContainer').style.display = 'flex';
  }

  async function doLogin(username, password) {
    const data = await apiJSON('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (data.success) {
      showApp();
      initAdmin();
    }
  }

  async function doLogout() {
    await api('/api/admin/logout', { method: 'POST' });
    showLogin();
  }

  async function checkAuth() {
    try {
      await apiJSON('/api/admin/check');
      showApp();
      initAdmin();
    } catch {
      showLogin();
    }
  }

  /* ─── Navigation ─── */
  function setupNav() {
    qsa('.admin-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const target = item.getAttribute('data-nav');
        qsa('.admin-nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        qsa('.tab-content').forEach(tc => tc.classList.remove('active'));
        const content = $(target + 'Tab');
        if (content) content.classList.add('active');
        ADMIN.state.activeNav = target;
        loadTab(target);
      });
    });

    if (window.innerWidth <= 768) {
      const hamburger = document.createElement('button');
      hamburger.className = 'hamburger';
      hamburger.innerHTML = '\u2630';
      hamburger.style.marginRight = '12px';
      $('adminTopbar').prepend(hamburger);
      hamburger.addEventListener('click', () => {
        qs('.admin-nav').classList.toggle('open');
      });
    }
  }

  function loadTab(tab) {
    switch (tab) {
      case 'overview': fetchOverview(); break;
      case 'channels': fetchChannels(); break;
      case 'epg': fetchEPGChannels(); break;
      case 'recordings': fetchRecordings(); break;
      case 'users': fetchUsers(); break;
      case 'logs': fetchLogs(); break;
      case 'settings': fetchSettings(); break;
    }
  }

  /* ─── Overview ─── */
  async function fetchOverview() {
    try {
      const data = await apiJSON('/api/admin/dashboard');
      $('totalChannels').textContent = data.total_channels || 0;
      $('activeStreams').textContent = data.active_streams || 0;
      $('totalUsers').textContent = data.total_users || 0;
      $('totalRecordings').textContent = data.recordings || 0;
    } catch {}

    try {
      const analytics = await apiJSON('/api/analytics/dashboard');
      ADMIN.state.analytics = analytics;
    } catch {}
  }

  /* ─── Channels ─── */
  async function fetchChannels() {
    try {
      ADMIN.state.channels = await apiJSON('/api/admin/channels');
      renderChannels();
    } catch {}
  }

  function renderChannels() {
    const list = $('channelsList');
    if (!list) return;
    if (ADMIN.state.channels.length === 0) {
      list.innerHTML = '<div class="empty-state">No channels. Create one below.</div>';
      return;
    }
    list.innerHTML = '';
    ADMIN.state.channels.forEach(ch => {
      const isLive = ch.status === 'active';
      const item = document.createElement('div');
      item.className = 'channel-item';
      item.style.margin = '0 0 12px 0';
      item.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;width:100%;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);">
          <div style="flex:1;min-width:150px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-weight:600;">${escapeHtml(ch.name)}</span>
              ${ch.is_mature ? '<span class="badge badge-live" style="background:var(--danger);color:#fff;">18+</span>' : ''}
              <span class="badge ${isLive ? 'badge-live' : 'badge-idle'}">${isLive ? 'LIVE' : 'OFFLINE'}</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Category: ${escapeHtml(ch.category || 'General')} | Order: ${ch.order || 999}</div>
          </div>
          <div style="font-size:11px;flex:2;min-width:200px;">
            <div><span style="color:var(--text-muted)">RTMP:</span> <code style="font-size:10px;word-break:break-all;">${escapeHtml(ch.rtmp_url || '')}</code></div>
            <div><span style="color:var(--text-muted)">Key:</span> <code style="font-size:10px;">${escapeHtml(ch.stream_key || '')}</code></div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-sm btn-secondary" onclick="ADMIN.copyText('${escapeHtml(ch.rtmp_url || '')}')">Copy RTMP</button>
            <button class="btn btn-sm btn-secondary" onclick="ADMIN.copyText('${escapeHtml(ch.stream_key || '')}')">Copy Key</button>
            <button class="btn btn-sm btn-secondary" onclick="ADMIN.editChannel('${ch.id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="ADMIN.deleteChannel('${ch.id}')">Delete</button>
          </div>
        </div>
      `;
      list.appendChild(item);
    });
  }

  ADMIN.copyText = function (text) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied!', 'success'));
  };

  ADMIN.editChannel = async function (id) {
    const ch = ADMIN.state.channels.find(c => c.id === id);
    if (!ch) return;
    const name = prompt('Channel name:', ch.name);
    if (!name) return;
    const category = prompt('Category:', ch.category || 'General');
    const order = prompt('Order (number):', String(ch.order || 999));
    try {
      await apiJSON('/api/admin/channels/' + id, {
        method: 'PUT',
        body: JSON.stringify({ name, category, order: order ? parseInt(order) : 999 }),
      });
      showToast('Channel updated', 'success');
      fetchChannels();
    } catch (e) { showToast(e.message, 'error'); }
  };

  ADMIN.deleteChannel = async function (id) {
    if (!confirm('Delete channel? This cannot be undone.')) return;
    try {
      await api('/api/admin/channels/' + id, { method: 'DELETE' });
      showToast('Channel deleted', 'success');
      fetchChannels();
    } catch (e) { showToast(e.message, 'error'); }
  };

  $('createChannelBtn')?.addEventListener('click', async () => {
    const name = $('newChannelName').value.trim();
    if (!name) return;
    const category = $('newChannelCategory')?.value || 'General';
    try {
      await apiJSON('/api/admin/channels', {
        method: 'POST',
        body: JSON.stringify({ name, category }),
      });
      $('newChannelName').value = '';
      showToast('Channel created!', 'success');
      fetchChannels();
    } catch (e) { showToast(e.message, 'error'); }
  });

  $('newChannelName')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('createChannelBtn').click(); });

  /* ─── EPG ─── */
  let epgChannelId = '';

  async function fetchEPGChannels() {
    try {
      ADMIN.state.channels = await apiJSON('/api/admin/channels');
      renderEPGChannels();
    } catch {}
  }

  function renderEPGChannels() {
    const sel = $('epgChannelSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">Select channel</option>';
    ADMIN.state.channels.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.textContent = ch.name;
      sel.appendChild(opt);
    });
  }

  $('epgChannelSelect')?.addEventListener('change', async () => {
    epgChannelId = $('epgChannelSelect').value;
    if (!epgChannelId) return;
    try {
      ADMIN.state.epg = await apiJSON('/api/admin/epg/' + epgChannelId);
      renderEPG();
    } catch { ADMIN.state.epg = []; renderEPG(); }
  });

  function renderEPG() {
    const list = $('epgList');
    if (!list) return;
    const programs = ADMIN.state.epg;
    if (!programs || programs.length === 0) {
      list.innerHTML = '<div class="empty-state">No programs for this channel</div>';
      return;
    }
    list.innerHTML = '';
    programs.sort((a, b) => (a.start_datetime || '').localeCompare(b.start_datetime || ''));
    programs.forEach(p => {
      const item = document.createElement('div');
      item.style.cssText = 'padding:10px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;';
      item.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <strong>${escapeHtml(p.title)}</strong>
            ${p.is_mature ? '<span class="badge badge-live" style="background:var(--danger);color:#fff;font-size:10px;">18+</span>' : ''}
            <div style="font-size:11px;color:var(--text-muted);">
              ${p.start_datetime ? p.start_datetime.slice(0, 16) : ''} - ${p.end_datetime ? p.end_datetime.slice(0, 16) : ''}
              ${p.recurring ? '(' + p.recurring + ')' : ''}
              ${p.episode_number ? '| Ep ' + p.episode_number : ''}
              ${p.genre ? '| ' + escapeHtml(p.genre) : ''}
            </div>
            ${p.description ? '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">' + escapeHtml(p.description) + '</div>' : ''}
          </div>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-xs btn-secondary" onclick="ADMIN.editProgram('${p.id}')">Edit</button>
            <button class="btn btn-xs btn-danger" onclick="ADMIN.deleteProgram('${p.id}')">Delete</button>
          </div>
        </div>
      `;
      list.appendChild(item);
    });
  }

  ADMIN.editProgram = function (id) {
    const p = ADMIN.state.epg.find(x => x.id === id);
    if (!p) return;
    const title = prompt('Title:', p.title);
    if (!title) return;
    const desc = prompt('Description:', p.description || '');
    try {
      apiJSON('/api/admin/epg/' + epgChannelId + '/' + id, {
        method: 'PUT',
        body: JSON.stringify({ title, description: desc }),
      }).then(() => { showToast('Program updated', 'success'); $('epgChannelSelect').dispatchEvent(new Event('change')); });
    } catch {}
  };

  ADMIN.deleteProgram = function (id) {
    if (!confirm('Delete program?')) return;
    api('/api/admin/epg/' + epgChannelId + '/' + id, { method: 'DELETE' })
      .then(() => { showToast('Program deleted', 'success'); $('epgChannelSelect').dispatchEvent(new Event('change')); })
      .catch(e => showToast(e.message, 'error'));
  };

  $('addProgramBtn')?.addEventListener('click', async () => {
    if (!epgChannelId) { showToast('Select a channel first', 'error'); return; }
    const title = $('programTitle').value.trim();
    if (!title) return;
    const desc = $('programDesc').value.trim();
    const start = $('programStart').value;
    const end = $('programEnd').value;
    if (!start || !end) { showToast('Start and end times required', 'error'); return; }
    const recurring = $('programRecurring')?.value || null;
    const genre = $('programGenre')?.value || null;
    const episode = $('programEpisode')?.value ? parseInt($('programEpisode').value) : null;
    const isMature = $('programMature')?.checked || false;

    try {
      await apiJSON('/api/admin/epg/' + epgChannelId, {
        method: 'POST',
        body: JSON.stringify({
          title, description: desc,
          start_datetime: new Date(start).toISOString(),
          end_datetime: new Date(end).toISOString(),
          recurring, genre,
          episode_number: episode,
          is_mature: isMature,
        }),
      });
      $('programTitle').value = '';
      $('programDesc').value = '';
      $('programStart').value = '';
      $('programEnd').value = '';
      showToast('Program added!', 'success');
      $('epgChannelSelect').dispatchEvent(new Event('change'));
    } catch (e) { showToast(e.message, 'error'); }
  });

  /* ─── Recordings ─── */
  async function fetchRecordings() {
    try {
      ADMIN.state.recordings = await apiJSON('/api/admin/recordings');
      renderRecordings();
    } catch {}
  }

  function renderRecordings() {
    const list = $('recordingsList');
    if (!list) return;
    if (ADMIN.state.recordings.length === 0) {
      list.innerHTML = '<div class="empty-state">No recordings. Click Sync to fetch from Mux.</div>';
      return;
    }
    list.innerHTML = '';
    ADMIN.state.recordings.forEach(rec => {
      const item = document.createElement('div');
      item.style.cssText = 'padding:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;';
      item.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <strong>${escapeHtml(rec.title)}</strong>
            <span class="badge ${rec.published ? 'badge-live' : 'badge-idle'}">${rec.published ? 'Published' : 'Draft'}</span>
            <div style="font-size:11px;color:var(--text-muted);">
              ${rec.duration ? Math.round(rec.duration) + 's' : ''}
              ${rec.channel_name ? '\u00B7 ' + escapeHtml(rec.channel_name) : ''}
              ${rec.created_at ? '\u00B7 ' + rec.created_at.slice(0, 10) : ''}
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            <button class="btn btn-xs btn-secondary" onclick="ADMIN.publishRecording('${rec.id}')">${rec.published ? 'Unpublish' : 'Publish'}</button>
            <button class="btn btn-xs btn-secondary" onclick="ADMIN.downloadRecording('${rec.id}')">Download</button>
            <button class="btn btn-xs btn-secondary" onclick="ADMIN.blobRecording('${rec.id}')">To Blob</button>
            <button class="btn btn-xs btn-danger" onclick="ADMIN.deleteRecording('${rec.id}')">Delete</button>
          </div>
        </div>
      `;
      list.appendChild(item);
    });
  }

  ADMIN.publishRecording = async function (id) {
    const rec = ADMIN.state.recordings.find(r => r.id === id);
    if (!rec) return;
    try {
      await apiJSON('/api/admin/recordings/' + id + '/publish', {
        method: 'POST',
        body: JSON.stringify({
          published: !rec.published,
          title: rec.title,
          description: rec.description,
        }),
      });
      showToast('Recording updated', 'success');
      fetchRecordings();
    } catch (e) { showToast(e.message, 'error'); }
  };

  ADMIN.downloadRecording = async function (id) {
    try {
      const data = await apiJSON('/api/admin/recordings/' + id + '/download');
      if (data.download_url) {
        window.open(data.download_url, '_blank');
      } else {
        showToast('Download not ready yet', 'error');
      }
    } catch (e) { showToast(e.message, 'error'); }
  };

  ADMIN.blobRecording = async function (id) {
    try {
      await apiJSON('/api/admin/recordings/' + id + '/blob');
      showToast('Uploaded to Blob storage', 'success');
      fetchRecordings();
    } catch (e) { showToast(e.message, 'error'); }
  };

  ADMIN.deleteRecording = async function (id) {
    if (!confirm('Delete this recording from Mux and Blob?')) return;
    try {
      await api('/api/admin/recordings/' + id, { method: 'DELETE' });
      showToast('Recording deleted', 'success');
      fetchRecordings();
    } catch (e) { showToast(e.message, 'error'); }
  };

  $('syncRecordingsBtn')?.addEventListener('click', async () => {
    try {
      const data = await apiJSON('/api/admin/recordings/sync');
      showToast('Synced ' + (data.synced || 0) + ' recordings', 'success');
      fetchRecordings();
    } catch (e) { showToast(e.message, 'error'); }
  });

  /* ─── Users ─── */
  async function fetchUsers() {
    try {
      ADMIN.state.users = await apiJSON('/api/admin/users');
      renderUsers();
    } catch {}
  }

  function renderUsers() {
    const list = $('usersList');
    if (!list) return;
    if (ADMIN.state.users.length === 0) {
      list.innerHTML = '<div class="empty-state">No users yet</div>';
      return;
    }
    list.innerHTML = '';
    ADMIN.state.users.forEach(u => {
      const item = document.createElement('div');
      item.style.cssText = 'padding:10px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;';
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(u.username)}</strong>
          <span class="badge ${u.tier === 'premium' ? 'badge-premium' : 'badge-basic'}">${u.tier}</span>
          ${u.banned ? '<span class="badge badge-banned">BANNED</span>' : ''}
          <div style="font-size:11px;color:var(--text-muted);">
            Created: ${u.created_at ? u.created_at.slice(0, 10) : 'N/A'} | Last login: ${u.last_login ? u.last_login.slice(0, 16) : 'Never'}
          </div>
        </div>
        <div style="display:flex;gap:4px;">
          ${u.banned
            ? '<button class="btn btn-xs btn-secondary" onclick="ADMIN.unbanUser(\'' + u.username + '\')">Unban</button>'
            : '<button class="btn btn-xs btn-danger" onclick="ADMIN.banUser(\'' + u.username + '\')">Ban</button>'
          }
          <button class="btn btn-xs btn-secondary" onclick="ADMIN.setTier(\'' + u.username + '\')">Tier</button>
        </div>
      `;
      list.appendChild(item);
    });
  }

  ADMIN.banUser = async function (username) {
    if (!confirm('Ban ' + username + '?')) return;
    try { await apiJSON('/api/admin/users/' + username + '/ban'); showToast(username + ' banned', 'success'); fetchUsers(); } catch (e) { showToast(e.message, 'error'); }
  };

  ADMIN.unbanUser = async function (username) {
    try { await apiJSON('/api/admin/users/' + username + '/unban'); showToast(username + ' unbanned', 'success'); fetchUsers(); } catch (e) { showToast(e.message, 'error'); }
  };

  ADMIN.setTier = async function (username) {
    const tier = prompt('Set tier (basic/premium):', 'basic');
    if (!tier || !['basic', 'premium'].includes(tier)) return;
    try { await apiJSON('/api/admin/users/' + username + '/tier', { method: 'POST', body: JSON.stringify({ tier }) }); showToast('Tier set to ' + tier, 'success'); fetchUsers(); } catch (e) { showToast(e.message, 'error'); }
  };

  /* ─── Logs ─── */
  async function fetchLogs() {
    try {
      ADMIN.state.logs = await apiJSON('/api/admin/logs');
      renderLogs();
    } catch {}
  }

  function renderLogs() {
    const list = $('logsList');
    if (!list) return;
    if (ADMIN.state.logs.length === 0) {
      list.innerHTML = '<div class="empty-state">No logs</div>';
      return;
    }
    list.innerHTML = '';
    ADMIN.state.logs.slice().reverse().slice(0, 200).forEach(log => {
      const item = document.createElement('div');
      item.style.cssText = 'padding:6px 10px;font-size:11px;border-bottom:1px solid var(--border);font-family:monospace;color:var(--text-secondary);';
      item.textContent = (log.timestamp ? log.timestamp.slice(0, 19) : '') + ' [' + (log.type || '') + '] ' + JSON.stringify(log.data || log);
      list.appendChild(item);
    });
  }

  $('purgeLogsBtn')?.addEventListener('click', async () => {
    if (!confirm('Purge all logs?')) return;
    try { await api('/api/admin/logs', { method: 'DELETE' }); showToast('Logs purged', 'success'); fetchLogs(); } catch (e) { showToast(e.message, 'error'); }
  });

  /* ─── Settings ─── */
  async function fetchSettings() {
    try {
      ADMIN.state.settings = await apiJSON('/api/admin/settings');
      $('platformName').value = ADMIN.state.settings.platform_name || '';
      $('primaryColor').value = ADMIN.state.settings.primary_color || '#0066ff';
      $('customCss').value = ADMIN.state.settings.custom_css || '';
      $('defaultLanguage').value = ADMIN.state.settings.default_language || 'en';
      $('maxLoginAttempts').value = ADMIN.state.settings.max_login_attempts || 5;
    } catch {}
  }

  $('saveSettingsBtn')?.addEventListener('click', async () => {
    try {
      await apiJSON('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          platform_name: $('platformName').value,
          primary_color: $('primaryColor').value,
          custom_css: $('customCss').value,
          default_language: $('defaultLanguage').value,
          max_login_attempts: parseInt($('maxLoginAttempts').value) || 5,
        }),
      });
      showToast('Settings saved', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });

  $('logoUploadBtn')?.addEventListener('click', async () => {
    const fileInput = $('logoFile');
    if (!fileInput || !fileInput.files[0]) return;
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    try {
      const res = await api('/api/admin/settings/logo', { method: 'POST', body: formData, headers: {} });
      const data = await res.json();
      showToast('Logo uploaded', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });

  /* ─── Notifications ─── */
  $('sendNotificationBtn')?.addEventListener('click', async () => {
    const msg = $('notificationMessage').value.trim();
    if (!msg) return;
    try {
      await apiJSON('/api/admin/notifications', {
        method: 'POST',
        body: JSON.stringify({ message: msg }),
      });
      $('notificationMessage').value = '';
      showToast('Notification sent!', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });

  /* ─── Init ─── */
  async function initAdmin() {
    setupNav();
    fetchOverview();
    fetchChannels();
    fetchRecordings();
    fetchUsers();
    fetchLogs();
    fetchSettings();
    fetchEPGChannels();

    setInterval(fetchOverview, 15000);
    setInterval(fetchChannels, 10000);
  }

  /* ─── Login ─── */
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('loginError').textContent = '';
    try {
      await doLogin(
        $('loginUsername').value.trim(),
        $('loginPassword').value
      );
    } catch (err) {
      $('loginError').textContent = err.message;
    }
  });

  $('logoutBtn')?.addEventListener('click', doLogout);

  checkAuth();
})();
