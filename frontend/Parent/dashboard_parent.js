document.addEventListener('DOMContentLoaded', () => {
    const { token, user } = requireSession('../login.html');

    const liveDateElement = document.getElementById('liveDate');
    const liveTimeElement = document.getElementById('liveTime');
    function updateDateTime() {
        if (!liveDateElement || !liveTimeElement) return;
        const now = new Date();
        liveDateElement.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        liveTimeElement.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    let firstChildId = null;

    async function loadChild() {
        const data = await authedFetch('/api/parent/children', token);
        if (!data.success || !data.children.length) {
            document.getElementById('childNameDisplay').textContent = 'No linked student';
            document.getElementById('childSectionDisplay').textContent = 'Contact the school administrator to link your child\'s account.';
            return;
        }

        // This dashboard design shows one child card — using the first linked child.
        const child = data.children[0];
        firstChildId = child.id;

        document.getElementById('childNameDisplay').textContent = child.name;
        document.getElementById('childSectionDisplay').textContent = child.section;
        document.getElementById('childStatusDisplay').textContent = child.lastStatus
            ? child.lastStatus.charAt(0).toUpperCase() + child.lastStatus.slice(1) + ' Today'
            : 'No record yet';

        document.getElementById('gradeVal').textContent = child.overallGrade ? `${child.overallGrade}%` : '—';
        document.getElementById('attendanceVal').textContent = child.attendanceRate ? `${child.attendanceRate}%` : '—';

        let progressLabel = '—';
        if (child.overallGrade) {
            if (child.overallGrade >= 90) progressLabel = 'Excellent';
            else if (child.overallGrade >= 80) progressLabel = 'Good';
            else if (child.overallGrade >= 75) progressLabel = 'Fair';
            else progressLabel = 'Needs Attention';
        }
        document.getElementById('progressVal').textContent = progressLabel;
    }

    document.getElementById('btnViewProgress').addEventListener('click', () => {
        if (!firstChildId) {
            alert('No linked student to view progress for.');
            return;
        }
        window.location.href = `progress_parent.html?studentId=${firstChildId}`;
    });

    wireLogout('logoutBtn', '../login.html', token);

    loadChild();
});
