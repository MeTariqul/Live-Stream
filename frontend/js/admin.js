(function () {
  const config = window.APP_CONFIG || {};
  const API_BASE_URL = config.API_BASE_URL || 'http://localhost:3000';

  const socket = io(API_BASE_URL, { transports: ['websocket', 'polling'] });
  const isLoginPage = document.getElementById('loginForm') !== undefined;
  const isDashboardPage = document.getElementById('dashboardContainer') !== undefined;

  if (isLoginPage) {
    initLoginPage();
  } else if (isDashboardPage) {
    initDashboard();
  }

  function initLoginPage() {
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginError.textContent = '';
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      try {
        const res = await fetch(`${API_BASE_URL}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
          credentials: 'include'
        });
        const data = await res.json();
        if (res.ok) {
          window.location.href = 'dashboard.html';
        } else {
          loginError.textContent = data.error || 'Login failed';
        }
      } catch (err) {
        loginError.textContent = 'Server error';
      }
    });
  }

  function initDashboard() {
    const statusIndicator = document.getElementById('statusIndicator');
    const viewerCountEl = document.getElementById('viewerCount');
    const streamKeyEl = document.getElementById('streamKey');
    const rtmpUrlEl = document.getElementById('rtmpUrl');
    const logoutBtn = document.getElementById('logoutBtn');
    const copyKeyBtn = document.getElementById('copyKeyBtn');
    const copyUrlBtn = document.getElementById('copyUrlBtn');

    checkSession();

    logoutBtn.addEventListener('click', async () => {
      await fetch(`${API_BASE_URL}/api/logout`, { method: 'POST', credentials: 'include' });
      window.location.href = '../';
    });

    copyKeyBtn.addEventListener('click', () => {
      copyToClipboard(streamKeyEl.textContent, copyKeyBtn);
    });

    copyUrlBtn.addEventListener('click', () => {
      copyToClipboard(rtmpUrlEl.textContent, copyUrlBtn);
    });

    socket.on('viewerCount', (count) => {
      viewerCountEl.textContent = count;
    });

    async function checkSession() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/stream-key`, { credentials: 'include' });
        if (res.ok) {
          loadDashboard();
        } else {
          window.location.href = '../';
        }
      } catch {
        window.location.href = '../';
      }
    }

    async function loadDashboard() {
      socket.emit('joinAdmin');
      try {
        const [statusRes, keyRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/stream-status`, { credentials: 'include' }),
          fetch(`${API_BASE_URL}/api/stream-key`, { credentials: 'include' })
        ]);
        if (statusRes.ok) {
          const status = await statusRes.json();
          updateStatus(status.isLive, status.viewers);
        }
        if (keyRes.ok) {
          const data = await keyRes.json();
          streamKeyEl.textContent = data.streamKey;
          rtmpUrlEl.textContent = data.rtmpUrl;
        }
      } catch (err) {
        console.error('Failed to fetch stream info', err);
      }
    }

    function updateStatus(isLive, viewers) {
      if (isLive) {
        statusIndicator.innerHTML = '<span class="dot live"></span> Live';
      } else {
        statusIndicator.innerHTML = '<span class="dot offline"></span> Offline';
      }
      viewerCountEl.textContent = viewers;
    }

    setInterval(loadDashboard, 3000);
  }

  function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = original; }, 1500);
    }).catch(() => {
      btn.textContent = 'Failed';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
  }
})();
