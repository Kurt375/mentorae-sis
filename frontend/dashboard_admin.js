document.addEventListener('DOMContentLoaded', () => {
    const { token, user } = requireSession('login.html');

    document.getElementById('adminNameDisplay').textContent = user.full_name;

    if (user.full_name) {
        const parts = user.full_name.trim().split(/\s+/);
        const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
        const initEl = document.getElementById('dashboardAvatarInitials');
        if (initEl) initEl.textContent = initials;
    }

    authedFetch('/api/auth/profile', token).then((data) => {
        if (data.success && data.profile && data.profile.profilePictureUrl) {
            const img = document.getElementById('dashboardAvatarImg');
            const initials = document.getElementById('dashboardAvatarInitials');
            if (img && initials) {
                img.src = data.profile.profilePictureUrl;
                img.classList.remove('d-none');
                initials.classList.add('d-none');
            }
        }
    }).catch(() => {});

    const liveDateElement = document.getElementById('liveDate');
    const liveTimeElement = document.getElementById('liveTime');
    function updateDateTime() {
        const now = new Date();
        liveDateElement.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        liveTimeElement.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    async function loadOverview() {
        try {
            const data = await authedFetch('/api/analytics/institutional-overview', token);
            if (!data.success) return;
            const stEl = document.getElementById('dashboardEnrolledStudents');
            const secEl = document.getElementById('dashboardActiveSections');
            const attEl = document.getElementById('dashboardAttendanceRate');
            const gpaEl = document.getElementById('dashboardSchoolGpa');

            if (stEl) stEl.textContent = Number(data.enrolledStudents || 0).toLocaleString();
            if (secEl) secEl.textContent = Number(data.activeSections || 0).toLocaleString();
            if (attEl) attEl.textContent = `${Number(data.attendanceRate || 0)}%`;
            if (gpaEl) gpaEl.textContent = Number(data.schoolGpa || 0).toFixed(1);
        } catch (err) {
            console.warn('Could not load institutional overview:', err);
        }
    }
    loadOverview();

    let cachedAnnouncements = [];
    async function loadAnnouncementsBadge() {
        const badge = document.getElementById('announcementsCardBadge');
        if (!badge) return;
        try {
            const data = await authedFetch('/api/announcements', token);
            if (data && data.success && Array.isArray(data.announcements)) {
                cachedAnnouncements = data.announcements;
                const unseenCount = typeof getUnseenAnnouncementsCount === 'function'
                    ? getUnseenAnnouncementsCount(data.announcements, user)
                    : 0;
                if (unseenCount > 0) {
                    badge.textContent = unseenCount > 9 ? '9+' : String(unseenCount);
                    badge.classList.remove('d-none');
                } else {
                    badge.classList.add('d-none');
                }
            } else {
                badge.classList.add('d-none');
            }
        } catch (e) {
            badge.classList.add('d-none');
        }
    }

    const annAdminCardLink = document.querySelector('a[href*="announcement_admin.html"]');
    if (annAdminCardLink) {
        annAdminCardLink.addEventListener('click', () => {
            const badge = document.getElementById('announcementsCardBadge');
            if (badge) badge.classList.add('d-none');
            if (typeof markAnnouncementsAsSeen === 'function' && cachedAnnouncements.length > 0) {
                markAnnouncementsAsSeen(cachedAnnouncements, user);
            }
        });
    }

    loadAnnouncementsBadge();
    window.addEventListener('pageshow', loadAnnouncementsBadge);
    window.addEventListener('focus', loadAnnouncementsBadge);
    window.addEventListener('mentorae:announcements-seen', loadAnnouncementsBadge);

    async function loadSystemStatus() {
        try {
            const data = await authedFetch('/api/analytics/system-status', token);
            if (data && data.success) {
                const serverDot = document.getElementById('serverStatusDot');
                const serverDesc = document.getElementById('serverStatusDesc');
                const dbDot = document.getElementById('dbStatusDot');
                const dbDesc = document.getElementById('dbStatusDesc');
                const storageDot = document.getElementById('storageStatusDot');
                const storageDesc = document.getElementById('storageStatusDesc');

                if (serverDesc && data.server) {
                    const status = data.server.status || 'Operational';
                    const uptime = data.server.uptime || 'Active';
                    serverDesc.textContent = `${status} • Uptime: ${uptime}`;
                    if (serverDot) {
                        serverDot.className = `status-dot ${status === 'Operational' ? 'bg-success animate-pulse' : 'bg-warning'}`;
                    }
                }
                if (dbDesc && data.database) {
                    const dbStatus = data.database.status || 'Connected';
                    const latency = data.database.latencyMs !== undefined ? `${data.database.latencyMs}ms latency` : 'Active';
                    const mode = data.database.mode ? ` (${data.database.mode})` : '';
                    dbDesc.textContent = `${dbStatus}${mode} • ${latency}`;
                    if (dbDot) {
                        dbDot.className = `status-dot ${data.database.latencyMs < 1000 ? 'bg-primary' : 'bg-warning'}`;
                    }
                }
                if (storageDesc && (data.storage || data.database)) {
                    const display = (data.storage && data.storage.displaySize) || data.database.displaySize || `${data.database.sizeMB || 0} MB Used`;
                    storageDesc.textContent = display;
                }
            }
        } catch (e) {
            console.warn('Could not load system status:', e);
        }
    }
    loadSystemStatus();
    setInterval(loadSystemStatus, 15000);

    if (typeof initNotificationBell === 'function') {
        initNotificationBell('notifBellBtn', token, user.role);
    }

    wireLogout('logoutBtn', 'login.html', token);
});
