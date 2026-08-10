document.addEventListener('DOMContentLoaded', () => {
    const { token, user } = requireSession('../login.html');

    const liveDateElement = document.getElementById('liveDate');
    const liveTimeElement = document.getElementById('liveTime');
    function updateDateTime() {
        const now = new Date();
        liveDateElement.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        liveTimeElement.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    const sectionFilter = document.getElementById('filterSection');
    const searchBar = document.getElementById('searchBar');
    const tbody = document.getElementById('attendanceConfirmationBody');
    const lockBanner = document.getElementById('sessionLockBanner');
    const lockBannerIcon = document.getElementById('lockBannerIcon');
    const lockBannerTitle = document.getElementById('lockBannerTitle');
    const lockBannerMessage = document.getElementById('lockBannerMessage');

    let currentRoster = [];
    let sessionAllowed = false;

    async function loadSections() {
        const data = await authedFetch('/api/classes/my-sections', token);
        if (!data.success || !data.sections.length) {
            sectionFilter.innerHTML = '<option>No sections assigned</option>';
            return;
        }
        sectionFilter.innerHTML = data.sections.map(s => `<option value="${s.id}">${s.strandCode} ${s.grade_level} - ${s.name}</option>`).join('');
        refresh();
    }

    async function checkSession(sectionId) {
        const data = await authedFetch(`/api/attendance/session-status?sectionId=${sectionId}`, token);
        sessionAllowed = data.success && data.isAllowed;

        if (sessionAllowed) {
            lockBanner.classList.add('d-none');
        } else {
            lockBanner.classList.remove('d-none');
            lockBanner.classList.remove('alert-warning');
            lockBanner.classList.add('alert-warning');
            lockBannerIcon.className = 'bi bi-lock-fill fs-4 text-warning';
            lockBannerTitle.textContent = 'Session Locked';
            lockBannerMessage.textContent = data.reason || 'You cannot confirm attendance right now.';
        }
    }

    const statusBadgeClass = {
        present: 'bg-success-subtle text-success',
        late: 'bg-warning-subtle text-warning',
        excused: 'bg-info-subtle text-info',
        absent: 'bg-danger-subtle text-danger',
    };

    async function loadRoster(sectionId) {
        const data = await authedFetch(`/api/attendance/confirmation?sectionId=${sectionId}`, token);
        currentRoster = data.success ? data.roster : [];
        renderRoster(currentRoster);
    }

    function renderRoster(roster) {
        tbody.innerHTML = '';
        if (!roster.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No students in this section.</td></tr>';
            return;
        }
        for (const s of roster) {
            const tr = document.createElement('tr');
            const label = s.status.charAt(0).toUpperCase() + s.status.slice(1);
            tr.innerHTML = `
                <td class="px-4 py-3">${s.idNumber}</td>
                <td class="px-4 py-3">${s.name}</td>
                <td class="px-4 py-3">${s.strand}</td>
                <td class="px-4 py-3">${s.section}</td>
                <td class="px-4 py-3 text-center"><span class="badge ${statusBadgeClass[s.status] || ''}" id="status-${s.id}">${label}</span></td>
                <td class="px-4 py-3 text-center">
                    <button class="btn btn-sm btn-outline-success confirm-btn" data-id="${s.id}" data-status="present" ${sessionAllowed ? '' : 'disabled'}>Present</button>
                    <button class="btn btn-sm btn-outline-danger confirm-btn" data-id="${s.id}" data-status="absent" ${sessionAllowed ? '' : 'disabled'}>Absent</button>
                </td>
            `;
            tbody.appendChild(tr);
        }

        tbody.querySelectorAll('.confirm-btn').forEach(btn => {
            btn.addEventListener('click', () => setStatus(btn.dataset.id, btn.dataset.status));
        });
    }

    async function setStatus(studentId, status) {
        const sectionId = sectionFilter.value;
        const data = await authedFetch('/api/attendance/confirm', token, {
            method: 'POST',
            body: JSON.stringify({ studentId, status, sectionId }),
        });
        if (!data.success) {
            alert(data.message);
            return;
        }
        const badge = document.getElementById(`status-${studentId}`);
        if (badge) {
            badge.className = `badge ${statusBadgeClass[status] || ''}`;
            badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        }
    }

    searchBar.addEventListener('input', () => {
        const term = searchBar.value.toLowerCase();
        renderRoster(currentRoster.filter(s =>
            s.name.toLowerCase().includes(term) ||
            s.idNumber.toLowerCase().includes(term) ||
            s.strand.toLowerCase().includes(term) ||
            s.status.toLowerCase().includes(term)
        ));
    });

    async function refresh() {
        const sectionId = sectionFilter.value;
        if (!sectionId) return;
        await checkSession(sectionId);
        await loadRoster(sectionId);
    }

    sectionFilter.addEventListener('change', refresh);

    document.getElementById('btnFinishAttendance').addEventListener('click', () => {
        alert('Attendance confirmation complete for this session.');
        window.location.href = 'dashboard_teacher.html';
    });

    wireLogout('logoutBtn', '../login.html', token);

    loadSections();
    setInterval(refresh, 60000); // re-check the session lock every minute
});
