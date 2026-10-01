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
    const thead = document.getElementById('attendanceConfirmationHead');
    const sectionTypeBadgeWrap = document.getElementById('sectionTypeBadgeWrap');
    const lockBanner = document.getElementById('sessionLockBanner');
    const lockBannerIcon = document.getElementById('lockBannerIcon');
    const lockBannerTitle = document.getElementById('lockBannerTitle');
    const lockBannerMessage = document.getElementById('lockBannerMessage');

    let currentRoster = [];
    let sessionAllowed = false;
    let isCurrentAdvisory = false;

    async function loadSections() {
        const data = await authedFetch('/api/classes/my-sections', token);
        if (!data.success || !data.sections.length) {
            sectionFilter.innerHTML = '<option>No sections assigned</option>';
            return;
        }
        sectionFilter.innerHTML = data.sections.map(s => {
            const isAdv = Boolean(s.isAdvisory);
            const icon = isAdv ? '⭐ ' : '';
            const role = isAdv ? ' (Advisory)' : '';
            return `<option value="${s.id}" data-advisory="${isAdv ? '1' : '0'}">${icon}${s.name}${role}</option>`;
        }).join('');
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
    const outBadgeClass = {
        out: 'bg-success-subtle text-success',
        excused: 'bg-danger-subtle text-danger',
    };

    function updateSectionHeaderAndView(isAdvisory) {
        if (sectionTypeBadgeWrap) {
            if (isAdvisory) {
                sectionTypeBadgeWrap.innerHTML = `
                    <div class="section-mode-pill">
                        <span class="pill-tag bg-success text-white shadow-sm">
                            <i class="bi bi-star-fill text-warning"></i> Advisory Class
                        </span>
                        <span class="pill-desc">Daily Time In &amp; Time Out</span>
                    </div>
                `;
            } else {
                sectionTypeBadgeWrap.innerHTML = `
                    <div class="section-mode-pill">
                        <span class="pill-tag bg-primary text-white shadow-sm">
                            <i class="bi bi-book-half"></i> Subject Class
                        </span>
                        <span class="pill-desc">Period Attendance Only</span>
                    </div>
                `;
            }
        }

        if (thead) {
            if (isAdvisory) {
                thead.innerHTML = `
                    <tr class="table-header-row text-white">
                        <th class="px-4 py-3 fw-semibold">Student ID</th>
                        <th class="px-4 py-3 fw-semibold">Name</th>
                        <th class="px-4 py-3 fw-semibold">Strand</th>
                        <th class="px-4 py-3 fw-semibold">Section</th>
                        <th class="px-4 py-3 fw-semibold text-center">Time In</th>
                        <th class="px-4 py-3 fw-semibold text-center">Time Out</th>
                        <th class="px-4 py-3 fw-semibold text-center">Status</th>
                        <th class="px-4 py-3 fw-semibold text-center">Action</th>
                    </tr>
                `;
            } else {
                thead.innerHTML = `
                    <tr class="table-header-row text-white">
                        <th class="px-4 py-3 fw-semibold">Student ID</th>
                        <th class="px-4 py-3 fw-semibold">Name</th>
                        <th class="px-4 py-3 fw-semibold">Strand</th>
                        <th class="px-4 py-3 fw-semibold">Section</th>
                        <th class="px-4 py-3 fw-semibold text-center">Status</th>
                        <th class="px-4 py-3 fw-semibold text-center">Action</th>
                    </tr>
                `;
            }
        }
    }

    async function loadRoster(sectionId) {
        const data = await authedFetch(`/api/attendance/confirmation?sectionId=${sectionId}`, token);
        currentRoster = data.success ? data.roster : [];

        const selectedOpt = sectionFilter.options[sectionFilter.selectedIndex];
        isCurrentAdvisory = data.isAdvisory !== undefined ? Boolean(data.isAdvisory) : (selectedOpt?.dataset.advisory === '1');

        updateSectionHeaderAndView(isCurrentAdvisory);
        renderRoster(currentRoster);
    }

    function renderRoster(roster) {
        tbody.innerHTML = '';
        const colSpan = isCurrentAdvisory ? 8 : 6;
        if (!roster.length) {
            tbody.innerHTML = `<tr><td colspan="${colSpan}" class="text-center text-muted py-4">No students in this section.</td></tr>`;
            return;
        }

        for (const s of roster) {
            const tr = document.createElement('tr');
            const label = s.status.charAt(0).toUpperCase() + s.status.slice(1);

            let timeInCell = '';
            let timeOutCell = '';

            if (isCurrentAdvisory) {
                const inFormatted = s.timeIn ? s.timeIn.slice(0, 5) : '—';
                timeInCell = `
                    <td class="px-4 py-3 text-center">
                        <span class="badge ${s.timeIn ? 'bg-light text-dark border' : 'bg-secondary-subtle text-secondary'} font-monospace">
                            ${inFormatted}
                        </span>
                    </td>
                `;

                const outLabel = s.timeOut ? (s.timeOutStatus === 'excused' ? 'Left early' : 'Out') + ` (${s.timeOut.slice(0, 5)})` : '—';
                const outConfirmBtn = s.timeOut
                    ? `<button class="btn btn-sm btn-outline-primary ms-1 py-0 px-2 confirm-out-btn" data-id="${s.id}">Confirm</button>`
                    : '';
                timeOutCell = `
                    <td class="px-4 py-3 text-center">
                        <span class="badge ${outBadgeClass[s.timeOutStatus] || 'bg-secondary-subtle text-secondary'}" id="out-${s.id}">${outLabel}</span>
                        ${outConfirmBtn}
                    </td>
                `;
            }

            tr.innerHTML = `
                <td class="px-4 py-3">${s.idNumber}</td>
                <td class="px-4 py-3 fw-medium">${s.name}</td>
                <td class="px-4 py-3">${s.strand}</td>
                <td class="px-4 py-3">${s.section}</td>
                ${timeInCell}
                ${timeOutCell}
                <td class="px-4 py-3 text-center"><span class="badge ${statusBadgeClass[s.status] || ''}" id="status-${s.id}">${label}</span></td>
                <td class="px-4 py-3 text-center">
                    <div class="d-inline-flex flex-wrap justify-content-center gap-1">
                        <button class="btn btn-sm btn-outline-success confirm-btn" data-id="${s.id}" data-status="present" ${sessionAllowed ? '' : 'disabled'}>Present</button>
                        <button class="btn btn-sm btn-outline-warning confirm-btn" data-id="${s.id}" data-status="late" ${sessionAllowed ? '' : 'disabled'}>Late</button>
                        <button class="btn btn-sm btn-outline-info confirm-btn" data-id="${s.id}" data-status="excused" ${sessionAllowed ? '' : 'disabled'}>Excused</button>
                        <button class="btn btn-sm btn-outline-danger confirm-btn" data-id="${s.id}" data-status="absent" ${sessionAllowed ? '' : 'disabled'}>Absent</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        }

        tbody.querySelectorAll('.confirm-btn').forEach(btn => {
            btn.addEventListener('click', () => setStatus(btn.dataset.id, btn.dataset.status));
        });
        if (isCurrentAdvisory) {
            tbody.querySelectorAll('.confirm-out-btn').forEach(btn => {
                btn.addEventListener('click', () => confirmOut(btn.dataset.id));
            });
        }
    }

    async function confirmOut(studentId) {
        const sectionId = sectionFilter.value;
        const data = await authedFetch('/api/attendance/confirm-out', token, {
            method: 'POST',
            body: JSON.stringify({ studentId, sectionId }),
        });
        if (!data.success) {
            alert(data.message);
            return;
        }
        const btn = tbody.querySelector(`.confirm-out-btn[data-id="${studentId}"]`);
        if (btn) btn.remove();
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
