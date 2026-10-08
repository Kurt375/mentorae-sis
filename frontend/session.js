const API_BASE = window.MENTORAE_CONFIG ? window.MENTORAE_CONFIG.API_BASE_URL : 'http://localhost:5000';
window.API_BASE = API_BASE;

let inactivityInterval = null;

/** Redirects to login if there's no session; returns { token, user }. */
function requireSession(loginPath) {
  const token = localStorage.getItem('mentorae_token');
  const user = JSON.parse(localStorage.getItem('mentorae_user') || 'null');
  if (!token || !user) {
    window.location.href = loginPath;
    throw new Error('redirecting to login');
  }

  // Setup session inactivity tracking (default: 30 minutes, or configured value)
  setupInactivityTracker(loginPath);

  return { token, user };
}

function setupInactivityTracker(loginPath) {
  if (window._mentoraeInactivityInitialized) return;
  window._mentoraeInactivityInitialized = true;

  const getTimeoutMinutes = () => {
    const saved = localStorage.getItem('mentorae_session_timeout_minutes');
    const val = parseInt(saved, 10);
    return isNaN(val) || val <= 0 ? 30 : val;
  };

  const recordActivity = () => {
    const now = Date.now();
    const lastActive = parseInt(localStorage.getItem('mentorae_last_active') || '0', 10);
    // Throttle writing to localStorage to once every 10 seconds
    if (now - lastActive > 10000) {
      localStorage.setItem('mentorae_last_active', String(now));
    }
  };

  // Initialize last active timestamp
  if (!localStorage.getItem('mentorae_last_active')) {
    localStorage.setItem('mentorae_last_active', String(Date.now()));
  }

  // Listen to user interactions
  const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll', 'click'];
  activityEvents.forEach((ev) => {
    window.addEventListener(ev, recordActivity, { passive: true });
  });

  // Periodic inactivity check every 20 seconds
  if (inactivityInterval) clearInterval(inactivityInterval);
  inactivityInterval = setInterval(() => {
    const lastActive = parseInt(localStorage.getItem('mentorae_last_active') || '0', 10);
    if (!lastActive) return;

    const timeoutMs = getTimeoutMinutes() * 60 * 1000;
    if (Date.now() - lastActive > timeoutMs) {
      console.warn('Session expired due to inactivity.');
      clearInterval(inactivityInterval);
      localStorage.removeItem('mentorae_token');
      localStorage.removeItem('mentorae_user');
      localStorage.removeItem('mentorae_last_active');
      window.location.href = `${loginPath}?reason=timeout`;
    }
  }, 20000);
}

async function authedFetch(path, token, options = {}) {
  const loginPath = window.location.pathname.includes('/Teacher/') || 
                    window.location.pathname.includes('/Student/') || 
                    window.location.pathname.includes('/Parent/') ? '../login.html' : 'login.html';

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // Handle Maintenance Mode (HTTP 503)
  if (res.status === 503) {
    const data = await res.json().catch(() => ({}));
    if (data.maintenance) {
      console.warn('Portal is in maintenance mode. Redirecting...');
      localStorage.removeItem('mentorae_token');
      localStorage.removeItem('mentorae_user');
      window.location.href = `${loginPath}?reason=maintenance`;
      return data;
    }
  }

  // Handle Session Expiration / Unauthorized (HTTP 401)
  if (res.status === 401) {
    console.warn('Unauthorized / token expired. Redirecting to login...');
    localStorage.removeItem('mentorae_token');
    localStorage.removeItem('mentorae_user');
    window.location.href = `${loginPath}?reason=timeout`;
    return { success: false, message: 'Session expired' };
  }

  if (res.status === 204) {
    return { success: true };
  }

  return res.json();
}

/**
 * Clears all session keys from localStorage, notifies backend, and optionally redirects to redirectPath.
 */
function clearSession(redirectPath) {
  try {
    fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
  } catch (err) {
    /* ignore */
  }
  localStorage.removeItem('mentorae_token');
  localStorage.removeItem('mentorae_user');
  localStorage.removeItem('mentorae_last_active');
  if (redirectPath) {
    const finalUrl = redirectPath.includes('?') ? redirectPath : `${redirectPath}?reason=logout`;
    window.location.href = finalUrl;
  }
}
window.clearSession = clearSession;

function wireLogout(btnId, loginPath, token) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to log out?')) return;
    clearSession(loginPath);
  });
}

/**
 * Returns all potential keys used to track announcement seen states for the current user.
 */
function getSeenAnnKeys(explicitUser = null) {
  const keys = ['mentorae_seen_ann_id_user'];
  try {
    const user = explicitUser || JSON.parse(localStorage.getItem('mentorae_user') || 'null');
    if (user) {
      if (user.id != null) keys.push(`mentorae_seen_ann_id_${user.id}`);
      if (user.role) {
        keys.push(`mentorae_seen_ann_id_${String(user.role).toLowerCase()}`);
        keys.push(`mentorae_seen_ann_id_${user.role}`);
      }
    }
  } catch (e) {}
  return [...new Set(keys)];
}

/**
 * Standard key to track the highest announcement ID seen by the current user.
 */
function getSeenAnnKey(explicitUser = null) {
  try {
    const user = explicitUser || JSON.parse(localStorage.getItem('mentorae_user') || 'null');
    if (user && user.id != null) return `mentorae_seen_ann_id_${user.id}`;
    if (user && user.role) return `mentorae_seen_ann_id_${String(user.role).toLowerCase()}`;
  } catch (e) {}
  return 'mentorae_seen_ann_id_user';
}

/**
 * Finds the highest seen announcement ID across all user/role storage keys.
 */
function getMaxSeenAnnId(explicitUser = null) {
  const keys = getSeenAnnKeys(explicitUser);
  let maxSeen = 0;
  for (const k of keys) {
    const val = parseInt(localStorage.getItem(k) || '0', 10);
    if (!isNaN(val) && val > maxSeen) {
      maxSeen = val;
    }
  }
  return maxSeen;
}

/**
 * Returns the count of announcements that have not been viewed yet by the current user.
 */
function getUnseenAnnouncementsCount(announcements, explicitUser = null) {
  if (!Array.isArray(announcements) || announcements.length === 0) return 0;
  const lastSeenId = getMaxSeenAnnId(explicitUser);
  return announcements.filter(a => Number(a.id) > lastSeenId).length;
}

/**
 * Marks all provided announcements as seen by updating the last seen announcement ID across all keys.
 */
function markAnnouncementsAsSeen(announcements, explicitUser = null) {
  if (!Array.isArray(announcements) || announcements.length === 0) return;
  const validIds = announcements.map(a => Number(a.id) || 0).filter(id => id > 0);
  if (!validIds.length) return;
  const newMax = Math.max(...validIds);
  const prevMax = getMaxSeenAnnId(explicitUser);
  const targetMax = Math.max(newMax, prevMax);

  const keys = getSeenAnnKeys(explicitUser);
  for (const k of keys) {
    localStorage.setItem(k, String(targetMax));
  }

  // Immediately hide visible card badges in active DOM
  const annCardBadges = document.querySelectorAll('#announcementsCardBadge, #announcementsBadge');
  annCardBadges.forEach(b => {
    b.textContent = '0';
    b.classList.add('d-none');
  });

  // Notify any active listeners/widgets
  try {
    window.dispatchEvent(new CustomEvent('mentorae:announcements-seen', { detail: { maxId: targetMax } }));
  } catch (e) {}
}

