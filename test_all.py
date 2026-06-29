"""Run all feature tests against the backend."""
import subprocess, sys, time, os
import httpx
from datetime import datetime, timezone, timedelta

base = 'http://localhost:3000'

# Start server
print('Starting server...')
proc = subprocess.Popen(
    [sys.executable, '-m', 'uvicorn', 'main:app', '--port', '3000', '--host', '0.0.0.0', '--log-level', 'warning'],
    cwd='backend', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
)
time.sleep(5)

if proc.poll() is not None:
    print('Server failed to start')
    sys.exit(1)

print('Server started.')

results = []
def test(name, func):
    try:
        func()
        results.append((name, 'PASS', ''))
    except Exception as e:
        results.append((name, 'FAIL', str(e)))

# ==================== TESTS ====================

def t_health():
    r = httpx.get(f'{base}/api/health', timeout=5)
    assert r.status_code == 200
test('Health check', t_health)

admin_cookies = None
def t_admin_login():
    global admin_cookies
    r = httpx.post(f'{base}/api/admin/login', json={'username': 'admin', 'password': 'Admin@123'}, timeout=5)
    assert r.status_code == 200
    admin_cookies = r.cookies
test('Admin login', t_admin_login)

channel_ids = []
def t_create_channels():
    for name, cat in [('News','News'), ('Sports','Sports'), ('Entertainment','Entertainment')]:
        r = httpx.post(f'{base}/api/admin/channels', json={'name': name, 'category': cat}, cookies=admin_cookies, timeout=5)
        assert r.status_code == 201, f'Create {name}: {r.text}'
        channel_ids.append(r.json()['id'])
test('Create channels', t_create_channels)

def t_list_admin_channels():
    r = httpx.get(f'{base}/api/admin/channels', cookies=admin_cookies, timeout=5)
    assert r.status_code == 200 and len(r.json()) >= 3
test('List admin channels', t_list_admin_channels)

def t_update_channel():
    r = httpx.put(f'{base}/api/admin/channels/{channel_ids[0]}', json={'name': 'News HD', 'order': 1}, cookies=admin_cookies, timeout=5)
    assert r.status_code == 200 and r.json()['name'] == 'News HD'
test('Update channel', t_update_channel)

def t_delete_channel():
    r = httpx.post(f'{base}/api/admin/channels', json={'name': 'Temp'}, cookies=admin_cookies, timeout=5)
    tid = r.json()['id']
    r = httpx.delete(f'{base}/api/admin/channels/{tid}', cookies=admin_cookies, timeout=5)
    assert r.status_code == 200
test('Delete channel', t_delete_channel)

def t_public_channels():
    r = httpx.get(f'{base}/api/channels', timeout=5)
    assert r.status_code == 200 and len(r.json()) >= 3
test('Public channels', t_public_channels)

user_cookies = None
def t_signup():
    global user_cookies
    r = httpx.post(f'{base}/api/signup', json={'username': 'testuser1', 'password': 'pass123456'}, timeout=5)
    assert r.status_code == 200
    user_cookies = r.cookies
test('User signup', t_signup)

def t_signup_invalid():
    r = httpx.post(f'{base}/api/signup', json={'username': 'ab', 'password': 'pass123'}, timeout=5)
    assert r.status_code == 422
test('Signup validation', t_signup_invalid)

def t_signup_dup():
    r = httpx.post(f'{base}/api/signup', json={'username': 'testuser1', 'password': 'pass123456'}, timeout=5)
    assert r.status_code == 409
test('Signup duplicate', t_signup_dup)

def t_user_login():
    r = httpx.post(f'{base}/api/login', json={'username': 'testuser1', 'password': 'pass123456'}, timeout=5)
    assert r.status_code == 200
test('User login', t_user_login)

def t_auth_me():
    r = httpx.get(f'{base}/api/auth/me', cookies=user_cookies, timeout=5)
    assert r.status_code == 200 and r.json()['username'] == 'testuser1'
test('Auth me', t_auth_me)

def t_favorites():
    r = httpx.post(f'{base}/api/favorites/{channel_ids[0]}', cookies=user_cookies, timeout=5)
    assert r.status_code == 200
    r = httpx.get(f'{base}/api/favorites', cookies=user_cookies, timeout=5)
    assert channel_ids[0] in r.json()
    r = httpx.delete(f'{base}/api/favorites/{channel_ids[0]}', cookies=user_cookies, timeout=5)
    assert r.status_code == 200
test('Favorites', t_favorites)

prog_id = None
def t_epg_create():
    global prog_id
    s = datetime.now(timezone.utc).isoformat()
    e = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    r = httpx.post(f'{base}/api/admin/epg/{channel_ids[0]}', json={
        'title': 'Morning Show', 'description': 'Daily', 'start_datetime': s, 'end_datetime': e,
        'genre': 'Talk', 'episode_number': 1
    }, cookies=admin_cookies, timeout=5)
    assert r.status_code == 201
    prog_id = r.json()['id']
test('EPG create', t_epg_create)

def t_epg_now():
    r = httpx.get(f'{base}/api/epg/now', timeout=5)
    assert r.status_code == 200
test('EPG now', t_epg_now)

def t_epg_update():
    r = httpx.put(f'{base}/api/admin/epg/{channel_ids[0]}/{prog_id}', json={'title': 'Updated Show'}, cookies=admin_cookies, timeout=5)
    assert r.status_code == 200
test('EPG update', t_epg_update)

def t_epg_delete():
    r = httpx.delete(f'{base}/api/admin/epg/{channel_ids[0]}/{prog_id}', cookies=admin_cookies, timeout=5)
    assert r.status_code == 200
test('EPG delete', t_epg_delete)

def t_search():
    r = httpx.get(f'{base}/api/search?q=News', timeout=5)
    assert r.status_code == 200 and len(r.json()['channels']) > 0
test('Search', t_search)

def t_categories():
    r = httpx.get(f'{base}/api/categories', timeout=5)
    assert r.status_code == 200 and 'News' in r.json()
test('Categories', t_categories)

def t_change_password():
    global user_cookies
    r = httpx.post(f'{base}/api/users/me/change-password',
        json={'current_password': 'pass123456', 'new_password': 'newpass123'},
        cookies=user_cookies, timeout=5)
    assert r.status_code == 200
    r = httpx.post(f'{base}/api/login', json={'username': 'testuser1', 'password': 'newpass123'}, timeout=5)
    assert r.status_code == 200
    user_cookies = r.cookies
test('Change password', t_change_password)

def t_parental():
    r = httpx.post(f'{base}/api/parental/pin', json={'pin': '1234', 'current_password': 'newpass123'}, cookies=user_cookies, timeout=5)
    assert r.status_code == 200
    r = httpx.post(f'{base}/api/parental/verify', json={'pin': '1234'}, cookies=user_cookies, timeout=5)
    assert r.status_code == 200 and r.json()['verified']
test('Parental controls', t_parental)

def t_notification():
    r = httpx.post(f'{base}/api/admin/notifications', json={'message': 'Test broadcast'}, cookies=admin_cookies, timeout=5)
    assert r.status_code == 201
    r = httpx.get(f'{base}/api/notifications', timeout=5)
    assert any('Test broadcast' in n['message'] for n in r.json())
test('Notifications', t_notification)

def t_dashboard():
    r = httpx.get(f'{base}/api/admin/dashboard', cookies=admin_cookies, timeout=5)
    assert r.status_code == 200 and r.json()['total_channels'] >= 3
test('Admin dashboard', t_dashboard)

def t_users():
    r = httpx.get(f'{base}/api/admin/users', cookies=admin_cookies, timeout=5)
    assert r.status_code == 200 and any(u['username'] == 'testuser1' for u in r.json())
test('User management', t_users)

def t_ban():
    r = httpx.post(f'{base}/api/admin/users/testuser1/ban', cookies=admin_cookies, timeout=5)
    assert r.status_code == 200
    r = httpx.post(f'{base}/api/login', json={'username': 'testuser1', 'password': 'newpass123'}, timeout=5)
    assert r.status_code == 403
    r = httpx.post(f'{base}/api/admin/users/testuser1/unban', cookies=admin_cookies, timeout=5)
    assert r.status_code == 200
test('Ban/unban', t_ban)

def t_settings():
    r = httpx.put(f'{base}/api/admin/settings', json={'platform_name': 'TestTV'}, cookies=admin_cookies, timeout=5)
    assert r.status_code == 200
    r = httpx.get(f'{base}/api/admin/public/settings', timeout=5)
    assert r.json()['platform_name'] == 'TestTV'
    httpx.put(f'{base}/api/admin/settings', json={'platform_name': 'My Live TV'}, cookies=admin_cookies, timeout=5)
test('Settings', t_settings)

def t_analytics():
    for ep in ['concurrent', 'dashboard', 'daily-users', 'most-watched']:
        r = httpx.get(f'{base}/api/analytics/{ep}', cookies=admin_cookies, timeout=5)
        assert r.status_code == 200, f'Analytics/{ep} failed: {r.status_code}'
test('Analytics', t_analytics)

def t_history():
    r = httpx.post(f'{base}/api/history/last-watched', json={'channel_id': channel_ids[0], 'channel_name': 'News'}, cookies=user_cookies, timeout=5)
    assert r.status_code == 200
    r = httpx.get(f'{base}/api/history/last-watched', cookies=user_cookies, timeout=5)
    assert r.json()['channel_id'] == channel_ids[0]
test('Watch history', t_history)

def t_tier():
    r = httpx.post(f'{base}/api/admin/users/testuser1/tier', json={'tier': 'premium'}, cookies=admin_cookies, timeout=5)
    assert r.status_code == 200
    r = httpx.get(f'{base}/api/users/me/tier', cookies=user_cookies, timeout=5)
    assert r.json()['tier'] == 'premium'
test('User tier', t_tier)

def t_logs():
    r = httpx.get(f'{base}/api/admin/logs', cookies=admin_cookies, timeout=5)
    assert r.status_code == 200
test('System logs', t_logs)

def t_purge_logs():
    r = httpx.delete(f'{base}/api/admin/logs', cookies=admin_cookies, timeout=5)
    assert r.status_code == 200
    r = httpx.get(f'{base}/api/admin/logs', cookies=admin_cookies, timeout=5)
    assert len(r.json()) == 0
test('Purge logs', t_purge_logs)

def t_delete_account():
    global admin_cookies
    r = httpx.post(f'{base}/api/signup', json={'username': 'deleteme', 'password': 'temp123456'}, timeout=5)
    assert r.status_code == 200
    dc = r.cookies
    r = httpx.post(f'{base}/api/users/me/delete', json={'password': 'temp123456'}, cookies=dc, timeout=5)
    assert r.status_code == 200
    r = httpx.get(f'{base}/api/auth/me', cookies=dc, timeout=5)
    assert r.status_code == 401
test('Delete account', t_delete_account)

# ==================== RESULTS ====================
print('=' * 55)
print('  FEATURE TEST RESULTS')
print('=' * 55)
passed = sum(1 for r in results if r[1] == 'PASS')
failed = sum(1 for r in results if r[1] == 'FAIL')
for name, status, err in results:
    m = 'PASS' if status == 'PASS' else 'FAIL'
    print(f'  [{m}] {name}')
    if err:
        print(f'       Error: {err}')
print('=' * 55)
print(f'  Total: {len(results)} | Passed: {passed} | Failed: {failed}')
print('=' * 55)

# Cleanup
proc.terminate()
proc.wait()
