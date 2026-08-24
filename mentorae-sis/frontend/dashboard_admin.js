document.addEventListener('DOMContentLoaded', () => {
    const { token, user } = requireSession('login.html');

    document.getElementById('adminNameDisplay').textContent = user.full_name;

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
        const data = await authedFetch('/api/users/overview', token);
        if (!data.success) return;
        document.getElementById('totalUsersVal').textContent = data.total;
        document.getElementById('studentsVal').textContent = data.students;
        document.getElementById('teachersVal').textContent = data.teachers;
    }
    loadOverview();

    wireLogout('logoutBtn', 'login.html', token);
});
