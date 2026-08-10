document.addEventListener('DOMContentLoaded', () => {

    const { token, user } = requireSession('../login.html');

    // 1. Live Real-time Clock Sync Element bindings
    const dateEl = document.getElementById('liveDate');
    const timeEl = document.getElementById('liveTime');

    function updateClock() {
        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = now.toLocaleDateString('en-US', options);
        timeEl.textContent = now.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        });
    }
    updateClock();
    setInterval(updateClock, 1000);

    // 2. Populate profile banner with the real logged-in student
    document.getElementById('studentNameDisplay').textContent = user.full_name;
    authedFetch('/api/auth/profile', token).then((data) => {
        if (data.success && data.profile.section) {
            document.getElementById('studentSectionDisplay').textContent = data.profile.section;
        }
    }).catch(() => {});

    // 3. Logout — now actually logs out
    wireLogout('logoutBtn', '../login.html', token);
});
