const API_BASE = window.MENTORAE_CONFIG.API_BASE_URL;

/** Redirects to login if there's no session; returns { token, user }. */
function requireSession(loginPath) {
  const token = localStorage.getItem('mentorae_token');
  const user = JSON.parse(localStorage.getItem('mentorae_user') || 'null');
  if (!token || !user) {
    window.location.href = loginPath;
    throw new Error('redirecting to login');
  }
  return { token, user };
}

async function authedFetch(path, token, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  return res.json();
}

function wireLogout(btnId, loginPath, token) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to log out?')) return;
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (err) {
      /* ignore */
    }
    localStorage.removeItem('mentorae_token');
    localStorage.removeItem('mentorae_user');
    window.location.href = loginPath;
  });
}
