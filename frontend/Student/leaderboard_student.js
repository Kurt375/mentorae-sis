document.addEventListener('DOMContentLoaded', () => {
    const { token, user } = requireSession('../login.html');

    const listEl = document.getElementById('leaderboardList');
    const scopeTabs = document.getElementById('scopeTabs');
    let currentScope = 'section';

    function rankBadge(rank) {
        if (rank === 1) return '<i class="bi bi-trophy-fill rank-1"></i>';
        if (rank === 2) return '<i class="bi bi-trophy-fill rank-2"></i>';
        if (rank === 3) return '<i class="bi bi-trophy-fill rank-3"></i>';
        return `#${rank}`;
    }

    async function load(scope) {
        listEl.innerHTML = '<p class="text-muted small text-center py-4">Loading…</p>';
        const data = await authedFetch(`/api/badges/leaderboard?scope=${scope}`, token);
        if (!data.success) {
            listEl.innerHTML = `<p class="text-danger small text-center py-4">${data.message}</p>`;
            return;
        }
        render(data.leaderboard);
    }

    function render(rows) {
        if (!rows.length) {
            listEl.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="bi bi-trophy display-3 d-block mb-3 opacity-50"></i>
                    <h6>No rankings yet</h6>
                    <p class="small">Badge points will show up here once teachers start awarding badges.</p>
                </div>`;
            return;
        }
        listEl.innerHTML = rows.map(r => `
            <div class="rank-row ${r.idNumber === user.id_number ? 'me' : ''}">
                <div class="rank-num">${rankBadge(r.rank)}</div>
                ${r.profilePictureUrl
                    ? `<img src="${r.profilePictureUrl}" class="rank-avatar" alt="">`
                    : `<div class="rank-avatar-icon"><i class="bi bi-person-fill"></i></div>`}
                <div class="flex-grow-1">
                    <div class="fw-semibold small">${r.name} ${r.idNumber === user.id_number ? '<span class="text-success">(You)</span>' : ''}</div>
                    <div class="text-muted" style="font-size: 0.75rem;">${r.section || '—'}</div>
                </div>
                <div class="text-end">
                    <div class="fw-bold text-success">${r.points} pts</div>
                    <div class="text-muted" style="font-size: 0.7rem;">${r.badgeCount} badge${r.badgeCount === 1 ? '' : 's'}</div>
                </div>
            </div>
        `).join('');
    }

    scopeTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-scope]');
        if (!btn) return;
        scopeTabs.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentScope = btn.dataset.scope;
        load(currentScope);
    });

    load(currentScope);
});
