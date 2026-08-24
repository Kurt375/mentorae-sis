/**
 * Minimal notifications bell: fetches /api/notifications, shows an unread
 * badge on the given button, and toggles a small dropdown panel listing
 * them (click a row to mark it read). Include after session.js/config.js.
 */
function initNotificationBell(buttonId, token) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;

    const badge = document.createElement('span');
    badge.className = 'position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger d-none';
    badge.style.fontSize = '0.65rem';
    btn.appendChild(badge);

    const panel = document.createElement('div');
    panel.className = 'card shadow-lg border-0 position-absolute d-none';
    panel.style.cssText = 'top: 60px; right: 20px; width: 320px; max-height: 400px; overflow-y: auto; z-index: 1050;';
    document.body.appendChild(panel);

    function timeAgo(dateStr) {
        const diffMin = Math.round((Date.now() - new Date(dateStr)) / 60000);
        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffMin < 1440) return `${Math.round(diffMin / 60)}h ago`;
        return `${Math.round(diffMin / 1440)}d ago`;
    }

    async function refresh() {
        const data = await authedFetch('/api/notifications', token);
        if (!data.success) return;
        badge.textContent = data.unread > 9 ? '9+' : String(data.unread);
        badge.classList.toggle('d-none', !data.unread);

        if (!data.notifications.length) {
            panel.innerHTML = '<div class="p-3 text-muted small text-center">No notifications yet.</div>';
            return;
        }
        panel.innerHTML = data.notifications.map(n => `
            <div class="p-3 border-bottom notif-row" data-id="${n.id}" style="cursor:pointer; ${n.is_read ? '' : 'background:#f4faf4;'}">
                <div class="fw-semibold small">${n.title}</div>
                <div class="text-muted small">${n.message}</div>
                <div class="text-muted" style="font-size: 0.7rem;">${timeAgo(n.created_at)}</div>
            </div>
        `).join('');
        panel.querySelectorAll('.notif-row').forEach(row => {
            row.addEventListener('click', async () => {
                await authedFetch(`/api/notifications/${row.dataset.id}/read`, token, { method: 'PATCH' });
                refresh();
            });
        });
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('d-none');
        if (!panel.classList.contains('d-none')) refresh();
    });
    document.addEventListener('click', (e) => {
        if (!panel.contains(e.target) && e.target !== btn) panel.classList.add('d-none');
    });

    refresh();
    setInterval(refresh, 60000);
}
