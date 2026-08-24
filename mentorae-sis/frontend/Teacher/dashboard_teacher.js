document.addEventListener('DOMContentLoaded', function() {
    const { token, user } = requireSession('../login.html');

    document.getElementById('teacherNameDisplay').textContent = user.full_name;

    authedFetch('/api/auth/status-summary', token).then((data) => {
        if (!data.success) return;
        const termEl = document.getElementById('teacherTermDisplay');
        if (termEl) {
            termEl.textContent = [data.summary.semester, data.summary.schoolYear].filter(Boolean).join(' • ') || '—';
        }
    }).catch(() => {});

    const liveDateElement = document.getElementById('liveDate');
    const liveTimeElement = document.getElementById('liveTime');

    function updateDateTime() {
        const now = new Date();
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        liveDateElement.textContent = now.toLocaleDateString('en-US', dateOptions);
        const timeOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true };
        liveTimeElement.textContent = now.toLocaleTimeString('en-US', timeOptions);
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    wireLogout('logoutBtn', '../login.html', token);
});
