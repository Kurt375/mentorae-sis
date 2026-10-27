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
    const historySectionFilter = document.getElementById('historySectionFilter');
    const searchBar = document.getElementById('searchBar');
    const filterStatus = document.getElementById('filterStatus');
    const tbody = document.getElementById('attendanceConfirmationBody');
    const thead = document.getElementById('attendanceConfirmationHead');
    const sectionTypeBadgeWrap = document.getElementById('sectionTypeBadgeWrap');
    const lockBanner = document.getElementById('sessionLockBanner');
    const lockBannerIcon = document.getElementById('lockBannerIcon');
    const lockBannerTitle = document.getElementById('lockBannerTitle');
    const lockBannerMessage = document.getElementById('lockBannerMessage');
    const finishBanner = document.getElementById('confirmationFinishedBanner');
    const finishBannerMessage = document.getElementById('finishBannerMessage');
    const closeFinishBannerBtn = document.getElementById('closeFinishBannerBtn');
    const btnFinish = document.getElementById('btnFinishAttendance');
    const btnSelectAllToolbar = document.getElementById('btnSelectAllToolbar');
    const selectedStudentsCountBadge = document.getElementById('selectedStudentsCountBadge');
    const btnClearSelection = document.getElementById('btnClearSelection');
    const btnBulkPresent = document.getElementById('btnBulkPresent');
    const btnBulkLate = document.getElementById('btnBulkLate');
    const btnBulkExcused = document.getElementById('btnBulkExcused');
    const btnBulkAbsent = document.getElementById('btnBulkAbsent');
    const btnBulkConfirmOut = document.getElementById('btnBulkConfirmOut');

    if (closeFinishBannerBtn) {
        closeFinishBannerBtn.addEventListener('click', () => {
            if (finishBanner) finishBanner.classList.add('d-none');
        });
    }

    let currentRoster = [];
    let currentlyRenderedRoster = [];
    const selectedStudentIds = new Set();
    let sessionAllowed = false;
    let isCurrentAdvisory = false;

    function markAttendanceSeen() {
        try {
            const todayStr = new Date().toISOString().slice(0, 10);
            const key = `mentorae_teacher_seen_attendance_${user.id}_${todayStr}`;
            localStorage.setItem(key, String(Date.now()));
            window.dispatchEvent(new CustomEvent('mentorae:attendance-confirmed'));
        } catch (e) {}
    }
    markAttendanceSeen();

    async function loadSections() {
        const data = await authedFetch('/api/classes/my-sections', token);
        if (!data.success || !data.sections.length) {
            sectionFilter.innerHTML = '<option>No sections assigned</option>';
            if (historySectionFilter) historySectionFilter.innerHTML = '<option>No sections assigned</option>';
            return;
        }

        // Top confirmation table: clean simple sections
        sectionFilter.innerHTML = data.sections.map(s => {
            const isAdv = Boolean(s.isAdvisory);
            const icon = isAdv ? '⭐ ' : '';
            const role = isAdv ? ' (Advisory)' : '';
            return `<option value="${s.id}" data-advisory="${isAdv ? '1' : '0'}">${icon}${s.name}${role}</option>`;
        }).join('');

        // Bottom Daily Attendance Records & History: rich Section Handled dropdown
        if (historySectionFilter) {
            const advisory = data.sections.filter(s => Boolean(s.isAdvisory));
            const subjects = data.sections.filter(s => !Boolean(s.isAdvisory));

            let histHtml = '';
            if (advisory.length) {
                histHtml += `<optgroup label="⭐ My Advisory Class">`;
                advisory.forEach(s => {
                    const subText = s.subjectsTaught ? ` — ${s.subjectsTaught}` : '';
                    histHtml += `<option value="${s.id}">⭐ ${s.name} (Grade ${s.grade_level}-${s.strandCode})${subText}</option>`;
                });
                histHtml += `</optgroup>`;
            }

            if (subjects.length) {
                histHtml += `<optgroup label="📚 Subject Classes Handled">`;
                subjects.forEach(s => {
                    const subText = s.subjectsTaught ? ` — ${s.subjectsTaught}` : '';
                    histHtml += `<option value="${s.id}">${s.name} (Grade ${s.grade_level}-${s.strandCode})${subText}</option>`;
                });
                histHtml += `</optgroup>`;
            }

            historySectionFilter.innerHTML = histHtml || '<option>No sections assigned</option>';
            if (sectionFilter.value) {
                historySectionFilter.value = sectionFilter.value;
            }
        }

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
        syncSelectAllStates();
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
                    <tr class="table-header-row text-white text-nowrap">
                        <th class="px-3 py-3 text-center" style="width: 44px;">
                            <input class="form-check-input my-0 cursor-pointer" type="checkbox" id="selectAllRoster" title="Select / Deselect All">
                        </th>
                        <th class="px-3 py-3 fw-semibold text-nowrap">Student ID</th>
                        <th class="px-3 py-3 fw-semibold text-nowrap">Name</th>
                        <th class="px-3 py-3 fw-semibold text-nowrap">Cluster</th>
                        <th class="px-3 py-3 fw-semibold text-nowrap">Section</th>
                        <th class="px-3 py-3 fw-semibold text-center text-nowrap">Time In</th>
                        <th class="px-3 py-3 fw-semibold text-center text-nowrap">Time Out</th>
                        <th class="px-3 py-3 fw-semibold text-center text-nowrap">Status</th>
                        <th class="px-3 py-3 fw-semibold text-center text-nowrap">Action</th>
                    </tr>
                `;
            } else {
                thead.innerHTML = `
                    <tr class="table-header-row text-white text-nowrap">
                        <th class="px-3 py-3 text-center" style="width: 44px;">
                            <input class="form-check-input my-0 cursor-pointer" type="checkbox" id="selectAllRoster" title="Select / Deselect All">
                        </th>
                        <th class="px-3 py-3 fw-semibold text-nowrap">Student ID</th>
                        <th class="px-3 py-3 fw-semibold text-nowrap">Name</th>
                        <th class="px-3 py-3 fw-semibold text-nowrap">Cluster</th>
                        <th class="px-3 py-3 fw-semibold text-nowrap">Section</th>
                        <th class="px-3 py-3 fw-semibold text-center text-nowrap">Status</th>
                        <th class="px-3 py-3 fw-semibold text-center text-nowrap">Action</th>
                    </tr>
                `;
            }
        }
        if (btnBulkConfirmOut) {
            if (isAdvisory) {
                btnBulkConfirmOut.classList.remove('d-none');
            } else {
                btnBulkConfirmOut.classList.add('d-none');
            }
        }
    }

    function resetFinishButton() {
        if (!btnFinish) return;
        btnFinish.disabled = false;
        btnFinish.className = 'btn btn-finish-action px-5 py-2.5 fw-bold fs-5 shadow-sm';
        btnFinish.innerHTML = 'Finish';
    }

    function setFinishedButtonState() {
        if (!btnFinish) return;
        btnFinish.disabled = false;
        btnFinish.className = 'btn btn-success px-5 py-2.5 fw-bold fs-5 shadow-sm';
        btnFinish.innerHTML = '<i class="bi bi-check2-circle me-2"></i>Confirmed &amp; Finished';
    }

    async function loadRoster(sectionId) {
        const data = await authedFetch(`/api/attendance/confirmation?sectionId=${sectionId}`, token);
        currentRoster = data.success ? data.roster : [];

        const selectedOpt = sectionFilter.options[sectionFilter.selectedIndex];
        isCurrentAdvisory = data.isAdvisory !== undefined ? Boolean(data.isAdvisory) : (selectedOpt?.dataset.advisory === '1');

        updateSectionHeaderAndView(isCurrentAdvisory);
        applyRosterFilters();

        if (data.allTimeOutsConfirmed) {
            setFinishedButtonState();
        } else {
            resetFinishButton();
        }
        markAttendanceSeen();
    }

    function syncSelectAllStates() {
        const totalVisible = currentlyRenderedRoster.length;
        const selectedVisible = currentlyRenderedRoster.filter(s => selectedStudentIds.has(String(s.id))).length;
        const count = selectedStudentIds.size;

        if (selectedStudentsCountBadge) {
            selectedStudentsCountBadge.textContent = `${count} selected`;
            if (count > 0) {
                selectedStudentsCountBadge.className = 'badge bg-success text-white py-1.5 px-2.5 fw-semibold';
                if (btnClearSelection) btnClearSelection.classList.remove('d-none');
            } else {
                selectedStudentsCountBadge.className = 'badge bg-light text-muted border py-1.5 px-2.5 fw-semibold';
                if (btnClearSelection) btnClearSelection.classList.add('d-none');
            }
        }

        const isAll = totalVisible > 0 && selectedVisible === totalVisible;
        const isSome = selectedVisible > 0 && selectedVisible < totalVisible;

        const selectAllRoster = document.getElementById('selectAllRoster');
        if (selectAllRoster) {
            selectAllRoster.checked = isAll;
            selectAllRoster.indeterminate = isSome;
        }
        if (btnSelectAllToolbar) {
            btnSelectAllToolbar.checked = isAll;
            btnSelectAllToolbar.indeterminate = isSome;
        }

        const canConfirm = count > 0 && sessionAllowed;
        if (btnBulkPresent) btnBulkPresent.disabled = !canConfirm;
        if (btnBulkLate) btnBulkLate.disabled = !canConfirm;
        if (btnBulkExcused) btnBulkExcused.disabled = !canConfirm;
        if (btnBulkAbsent) btnBulkAbsent.disabled = !canConfirm;

        if (btnBulkConfirmOut) {
            const hasPendingOut = currentlyRenderedRoster.some(s => selectedStudentIds.has(String(s.id)) && s.timeOut && !s.timeOutConfirmed);
            btnBulkConfirmOut.disabled = !canConfirm || !hasPendingOut;
        }
    }

    function toggleSelectAll(checked) {
        if (checked) {
            currentlyRenderedRoster.forEach(s => selectedStudentIds.add(String(s.id)));
        } else {
            currentlyRenderedRoster.forEach(s => selectedStudentIds.delete(String(s.id)));
        }
        tbody.querySelectorAll('.roster-checkbox').forEach(cb => {
            const sId = String(cb.dataset.id);
            const isChecked = selectedStudentIds.has(sId);
            cb.checked = isChecked;
            const tr = cb.closest('tr');
            if (tr) {
                tr.classList.toggle('table-active', isChecked);
            }
        });
        syncSelectAllStates();
    }

    async function executeBulkStatus(status) {
        const ids = Array.from(selectedStudentIds);
        if (!ids.length) {
            alert('Please select at least one student.');
            return;
        }
        const sectionId = sectionFilter.value;
        if (!sectionId) return;

        const activeBtn = status === 'present' ? btnBulkPresent
            : status === 'late' ? btnBulkLate
            : status === 'excused' ? btnBulkExcused
            : btnBulkAbsent;

        const originalText = activeBtn ? activeBtn.innerHTML : '';
        if (activeBtn) {
            activeBtn.disabled = true;
            activeBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span>Saving...`;
        }

        try {
            const data = await authedFetch('/api/attendance/confirm', token, {
                method: 'POST',
                body: JSON.stringify({ studentIds: ids, status, sectionId }),
            });

            if (!data.success) {
                alert(data.message || 'Could not update attendance in bulk.');
                return;
            }

            const idSet = new Set(ids.map(String));
            currentRoster.forEach(s => {
                if (idSet.has(String(s.id))) {
                    s.status = status;
                }
            });

            const label = status.charAt(0).toUpperCase() + status.slice(1);
            ids.forEach(sId => {
                const badge = document.getElementById(`status-${sId}`);
                if (badge) {
                    badge.className = `badge ${statusBadgeClass[status] || ''}`;
                    badge.textContent = label;
                }
            });

            if (filterStatus && filterStatus.value !== 'all') {
                applyRosterFilters();
            }

            loadDailyHistory();
            markAttendanceSeen();
        } catch (err) {
            console.error('executeBulkStatus error:', err);
            alert('An error occurred during bulk attendance confirmation.');
        } finally {
            if (activeBtn) {
                activeBtn.disabled = false;
                activeBtn.innerHTML = originalText;
            }
            syncSelectAllStates();
        }
    }

    async function executeBulkConfirmOut() {
        const ids = Array.from(selectedStudentIds).filter(sId => {
            const s = currentRoster.find(x => String(x.id) === String(sId));
            return s && s.timeOut && !s.timeOutConfirmed;
        });

        if (!ids.length) {
            alert('None of the selected students have unconfirmed time-outs.');
            return;
        }
        const sectionId = sectionFilter.value;
        if (!sectionId) return;

        const originalText = btnBulkConfirmOut.innerHTML;
        btnBulkConfirmOut.disabled = true;
        btnBulkConfirmOut.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span>Confirming...`;

        try {
            const data = await authedFetch('/api/attendance/confirm-out', token, {
                method: 'POST',
                body: JSON.stringify({ studentIds: ids, sectionId }),
            });

            if (!data.success) {
                alert(data.message || 'Could not confirm time-outs.');
                return;
            }

            const idSet = new Set(ids.map(String));
            currentRoster.forEach(s => {
                if (idSet.has(String(s.id))) {
                    s.timeOutConfirmed = true;
                }
            });

            applyRosterFilters();

            const hasPending = currentRoster.some(s => s.timeOut && !s.timeOutConfirmed);
            if (!hasPending && currentRoster.some(s => s.timeOut)) {
                setFinishedButtonState();
            }

            loadDailyHistory();
            markAttendanceSeen();
        } catch (err) {
            console.error('executeBulkConfirmOut error:', err);
            alert('An error occurred while confirming time-outs.');
        } finally {
            btnBulkConfirmOut.disabled = false;
            btnBulkConfirmOut.innerHTML = originalText;
            syncSelectAllStates();
        }
    }

    if (btnSelectAllToolbar) {
        btnSelectAllToolbar.addEventListener('change', (e) => toggleSelectAll(e.target.checked));
    }
    if (thead) {
        thead.addEventListener('change', (e) => {
            if (e.target && e.target.id === 'selectAllRoster') {
                toggleSelectAll(e.target.checked);
            }
        });
    }
    if (btnClearSelection) {
        btnClearSelection.addEventListener('click', () => {
            selectedStudentIds.clear();
            tbody.querySelectorAll('.roster-checkbox').forEach(cb => {
                cb.checked = false;
                const tr = cb.closest('tr');
                if (tr) tr.classList.remove('table-active');
            });
            syncSelectAllStates();
        });
    }
    if (btnBulkPresent) btnBulkPresent.addEventListener('click', () => executeBulkStatus('present'));
    if (btnBulkLate) btnBulkLate.addEventListener('click', () => executeBulkStatus('late'));
    if (btnBulkExcused) btnBulkExcused.addEventListener('click', () => executeBulkStatus('excused'));
    if (btnBulkAbsent) btnBulkAbsent.addEventListener('click', () => executeBulkStatus('absent'));
    if (btnBulkConfirmOut) btnBulkConfirmOut.addEventListener('click', executeBulkConfirmOut);

    function renderRoster(roster) {
        currentlyRenderedRoster = roster || [];
        tbody.innerHTML = '';
        const colSpan = isCurrentAdvisory ? 9 : 7;
        if (!roster.length) {
            tbody.innerHTML = `<tr><td colspan="${colSpan}" class="text-center text-muted py-4">No students in this section.</td></tr>`;
            syncSelectAllStates();
            return;
        }

        for (const s of roster) {
            const tr = document.createElement('tr');
            const isChecked = selectedStudentIds.has(String(s.id));
            if (isChecked) {
                tr.classList.add('table-active');
            }
            const label = s.status.charAt(0).toUpperCase() + s.status.slice(1);

            let timeInCell = '';
            let timeOutCell = '';

            if (isCurrentAdvisory) {
                const inFormatted = s.timeIn ? s.timeIn.slice(0, 5) : '—';
                timeInCell = `
                    <td class="px-3 py-3 text-center text-nowrap">
                        <span class="badge ${s.timeIn ? 'bg-light text-dark border' : 'bg-secondary-subtle text-secondary'} font-monospace">
                            ${inFormatted}
                        </span>
                    </td>
                `;

                let outContent = '—';
                if (s.timeOut) {
                    const outLabel = (s.timeOutStatus === 'excused' ? 'Left early' : 'Out') + ` (${s.timeOut.slice(0, 5)})`;
                    const badgeClass = outBadgeClass[s.timeOutStatus] || 'bg-secondary-subtle text-secondary';
                    const confirmedBadge = `<span class="badge bg-success-subtle text-success border border-success-subtle py-1 px-2" title="Time-out confirmed"><i class="bi bi-check-circle-fill me-1"></i>Confirmed</span>`;
                    const confirmBtn = `<button class="btn btn-sm btn-outline-primary py-0 px-2 confirm-out-btn" data-id="${s.id}" ${sessionAllowed ? '' : 'disabled'}>Confirm</button>`;

                    outContent = `
                        <div class="d-inline-flex align-items-center justify-content-center gap-1 flex-nowrap">
                            <span class="badge ${badgeClass}" id="out-${s.id}">${outLabel}</span>
                            ${s.timeOutConfirmed ? confirmedBadge : confirmBtn}
                        </div>
                    `;
                }
                timeOutCell = `
                    <td class="px-3 py-3 text-center text-nowrap">
                        ${outContent}
                    </td>
                `;
            }

            tr.innerHTML = `
                <td class="px-3 py-3 text-center">
                    <input class="form-check-input my-0 roster-checkbox cursor-pointer" type="checkbox" value="${s.id}" data-id="${s.id}" ${isChecked ? 'checked' : ''} aria-label="Select student">
                </td>
                <td class="px-3 py-3 text-nowrap">${s.idNumber}</td>
                <td class="px-3 py-3 fw-medium text-nowrap">${s.name}</td>
                <td class="px-3 py-3 text-nowrap">${s.strand}</td>
                <td class="px-3 py-3 text-nowrap">${s.section}</td>
                ${timeInCell}
                ${timeOutCell}
                <td class="px-3 py-3 text-center text-nowrap"><span class="badge ${statusBadgeClass[s.status] || ''}" id="status-${s.id}">${label}</span></td>
                <td class="px-3 py-3 text-center text-nowrap">
                    <div class="d-inline-flex flex-nowrap justify-content-center gap-1">
                        <button class="btn btn-sm btn-outline-success confirm-btn" data-id="${s.id}" data-status="present" ${sessionAllowed ? '' : 'disabled'}>Present</button>
                        <button class="btn btn-sm btn-outline-warning confirm-btn" data-id="${s.id}" data-status="late" ${sessionAllowed ? '' : 'disabled'}>Late</button>
                        <button class="btn btn-sm btn-outline-info confirm-btn" data-id="${s.id}" data-status="excused" ${sessionAllowed ? '' : 'disabled'}>Excused</button>
                        <button class="btn btn-sm btn-outline-danger confirm-btn" data-id="${s.id}" data-status="absent" ${sessionAllowed ? '' : 'disabled'}>Absent</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        }

        tbody.querySelectorAll('.roster-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                const sId = String(cb.dataset.id);
                const tr = cb.closest('tr');
                if (cb.checked) {
                    selectedStudentIds.add(sId);
                    if (tr) tr.classList.add('table-active');
                } else {
                    selectedStudentIds.delete(sId);
                    if (tr) tr.classList.remove('table-active');
                }
                syncSelectAllStates();
            });
        });

        tbody.querySelectorAll('.confirm-btn').forEach(btn => {
            btn.addEventListener('click', () => setStatus(btn.dataset.id, btn.dataset.status));
        });
        if (isCurrentAdvisory) {
            tbody.querySelectorAll('.confirm-out-btn').forEach(btn => {
                btn.addEventListener('click', () => confirmOut(btn.dataset.id));
            });
        }

        syncSelectAllStates();
    }

    async function confirmOut(studentId) {
        const sectionId = sectionFilter.value;
        const btn = tbody.querySelector(`.confirm-out-btn[data-id="${studentId}"]`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status"></span>`;
        }
        try {
            const data = await authedFetch('/api/attendance/confirm-out', token, {
                method: 'POST',
                body: JSON.stringify({ studentId, sectionId }),
            });
            if (!data.success) {
                alert(data.message || 'Could not confirm time-out.');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Confirm';
                }
                return;
            }

            // Update in-memory roster so search/filtering and re-renders keep confirmed state
            const student = currentRoster.find(s => s.id == studentId);
            if (student) {
                student.timeOutConfirmed = true;
            }

            // Replace button with Confirmed badge
            if (btn) {
                const confirmedBadge = document.createElement('span');
                confirmedBadge.className = 'badge bg-success-subtle text-success border border-success-subtle py-1 px-2';
                confirmedBadge.title = 'Time-out confirmed';
                confirmedBadge.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i>Confirmed';
                btn.replaceWith(confirmedBadge);
            }

            const hasPending = currentRoster.some(s => s.timeOut && !s.timeOutConfirmed);
            if (!hasPending && currentRoster.some(s => s.timeOut)) {
                setFinishedButtonState();
            }

            // Sync bottom daily history table
            loadDailyHistory();
            markAttendanceSeen();
        } catch (err) {
            console.error('confirmOut error:', err);
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Confirm';
            }
            alert('An error occurred while confirming time-out.');
        }
    }

    async function setStatus(studentId, status) {
        const sectionId = sectionFilter.value;
        const data = await authedFetch('/api/attendance/confirm', token, {
            method: 'POST',
            body: JSON.stringify({ studentId, status, sectionId }),
        });
        if (!data.success) {
            alert(data.message || 'Could not update attendance.');
            return;
        }
        const badge = document.getElementById(`status-${studentId}`);
        if (badge) {
            badge.className = `badge ${statusBadgeClass[status] || ''}`;
            badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        }
        const student = currentRoster.find(s => s.id == studentId);
        if (student) {
            student.status = status;
        }

        if (filterStatus && filterStatus.value !== 'all') {
            applyRosterFilters();
        }

        // Sync bottom daily history table
        loadDailyHistory();
        markAttendanceSeen();
    }

    function applyRosterFilters() {
        const term = (searchBar ? searchBar.value : '').trim().toLowerCase();
        const status = (filterStatus ? filterStatus.value : 'all').toLowerCase();

        let filtered = currentRoster || [];
        if (term) {
            filtered = filtered.filter(s =>
                (s.name && s.name.toLowerCase().includes(term)) ||
                (s.idNumber && s.idNumber.toLowerCase().includes(term)) ||
                (s.strand && s.strand.toLowerCase().includes(term)) ||
                (s.section && s.section.toLowerCase().includes(term)) ||
                (s.status && s.status.toLowerCase().includes(term))
            );
        }

        if (status !== 'all') {
            filtered = filtered.filter(s => s.status && s.status.toLowerCase() === status);
        }

        renderRoster(filtered);
    }

    if (searchBar) {
        searchBar.addEventListener('input', applyRosterFilters);
    }
    if (filterStatus) {
        filterStatus.addEventListener('change', applyRosterFilters);
    }

    async function refresh() {
        const sectionId = sectionFilter.value;
        if (!sectionId) return;
        await checkSession(sectionId);
        await loadRoster(sectionId);
        await loadDailyHistory();
    }

    sectionFilter.addEventListener('change', () => {
        if (finishBanner) finishBanner.classList.add('d-none');
        resetFinishButton();
        selectedStudentIds.clear();
        syncSelectAllStates();
        if (historySectionFilter) {
            historySectionFilter.value = sectionFilter.value;
        }
        refresh();
    });

    if (btnFinish) {
        btnFinish.addEventListener('click', async () => {
            const sectionId = sectionFilter.value;
            if (!sectionId) return;

            const secName = sectionFilter.options[sectionFilter.selectedIndex]?.text || 'this section';

            btnFinish.disabled = true;
            btnFinish.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span>Finalizing...`;

            try {
                const data = await authedFetch('/api/attendance/finish-section', token, {
                    method: 'POST',
                    body: JSON.stringify({ sectionId }),
                });

                if (!data.success) {
                    alert(data.message || 'Could not finalize attendance confirmation.');
                    resetFinishButton();
                    return;
                }

                // Mark all time-outs as confirmed in local state
                currentRoster.forEach(s => {
                    if (s.timeOut) {
                        s.timeOutConfirmed = true;
                    }
                });

                // Re-render so all buttons change to Confirmed badges immediately
                applyRosterFilters();

                setFinishedButtonState();

                if (finishBanner) {
                    finishBanner.classList.remove('d-none');
                    if (finishBannerMessage) {
                        const extra = data.confirmedOutsCount > 0
                            ? ` Attendance verified and ${data.confirmedOutsCount} student time-out scan(s) confirmed.`
                            : ' All student attendance and time-outs are up to date.';
                        finishBannerMessage.innerHTML = `Attendance confirmation for <strong>${secName}</strong> is finished and saved for today.${extra}`;
                    }
                    finishBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }

                // Refresh history records below so it mirrors the finalized state
                loadDailyHistory();
                markAttendanceSeen();
            } catch (err) {
                console.error('finishSection error:', err);
                alert('An error occurred while finalizing attendance confirmation.');
                resetFinishButton();
            }
        });
    }

    // -------------------------------------------------------------
    // Daily Attendance Records & History (Bottom Stacked Table)
    // -------------------------------------------------------------
    const historyDateInput = document.getElementById('historyDateInput');
    const btnHistoryToday = document.getElementById('btnHistoryToday');
    const btnHistoryYesterday = document.getElementById('btnHistoryYesterday');
    const historySearchInput = document.getElementById('historySearchInput');
    const historyStatusFilter = document.getElementById('historyStatusFilter');
    const historyTbody = document.getElementById('attendanceHistoryBody');

    const statTotalStudents = document.getElementById('statTotalStudents');
    const statPresent = document.getElementById('statPresent');
    const statLate = document.getElementById('statLate');
    const statExcused = document.getElementById('statExcused');
    const statAbsent = document.getElementById('statAbsent');
    const statRate = document.getElementById('statRate');

    let currentHistoryRecords = [];

    function toISODate(d) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    if (historyDateInput) {
        historyDateInput.value = toISODate(new Date());
    }

    async function loadDailyHistory() {
        const sectionId = (historySectionFilter && historySectionFilter.value) || sectionFilter.value;
        const dateVal = historyDateInput ? historyDateInput.value : toISODate(new Date());
        if (!sectionId || !dateVal) return;

        try {
            const data = await authedFetch(`/api/attendance/section-daily-history?sectionId=${sectionId}&date=${dateVal}`, token);
            if (!data.success) {
                if (historyTbody) {
                    historyTbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">${data.message || 'Could not load records.'}</td></tr>`;
                }
                return;
            }

            currentHistoryRecords = data.records || [];

            if (data.stats) {
                if (statTotalStudents) statTotalStudents.textContent = data.stats.totalStudents || 0;
                if (statPresent) statPresent.textContent = data.stats.presentCount || 0;
                if (statLate) statLate.textContent = data.stats.lateCount || 0;
                if (statExcused) statExcused.textContent = data.stats.excusedCount || 0;
                if (statAbsent) statAbsent.textContent = data.stats.absentCount || 0;
                if (statRate) statRate.textContent = `${data.stats.rate || 0}%`;
            }

            applyHistoryFiltersAndRender();
        } catch (err) {
            console.error('loadDailyHistory error:', err);
        }
    }

    function applyHistoryFiltersAndRender() {
        if (!historyTbody) return;
        const searchTerm = historySearchInput ? historySearchInput.value.toLowerCase().trim() : '';
        const statusVal = historyStatusFilter ? historyStatusFilter.value : 'all';

        const filtered = currentHistoryRecords.filter(r => {
            const matchesSearch = !searchTerm ||
                r.name.toLowerCase().includes(searchTerm) ||
                r.idNumber.toLowerCase().includes(searchTerm) ||
                r.strand.toLowerCase().includes(searchTerm);
            const matchesStatus = statusVal === 'all' || r.status === statusVal;
            return matchesSearch && matchesStatus;
        });

        if (!filtered.length) {
            historyTbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4"><i class="bi bi-calendar-x fs-3 d-block mb-1 text-secondary opacity-50"></i>No attendance records found for this date.</td></tr>`;
            return;
        }

        historyTbody.innerHTML = filtered.map(r => {
            const statusLabel = r.status.charAt(0).toUpperCase() + r.status.slice(1);
            const statusBadge = `<span class="badge ${statusBadgeClass[r.status] || 'bg-secondary-subtle text-secondary'}">${statusLabel}</span>`;
            const timeInFormatted = r.timeIn ? r.timeIn.slice(0, 5) : '—';

            let timeOutHtml = '—';
            if (r.timeOut) {
                const outLabel = (r.timeOutStatus === 'excused' ? 'Left early' : 'Out') + ` (${r.timeOut.slice(0, 5)})`;
                const confirmedBadge = r.timeOutConfirmed
                    ? `<span class="badge bg-success-subtle text-success border border-success-subtle ms-1 py-0.5 px-1.5"><i class="bi bi-check-circle-fill"></i> Confirmed</span>`
                    : '';
                timeOutHtml = `<div class="d-inline-flex align-items-center justify-content-center gap-1 flex-wrap"><span class="badge ${outBadgeClass[r.timeOutStatus] || 'bg-secondary-subtle text-secondary'}">${outLabel}</span>${confirmedBadge}</div>`;
            }

            const verifierHtml = r.verifier
                ? `<span class="small fw-medium text-dark"><i class="bi bi-person-check me-1 text-success"></i>${r.verifier}</span>`
                : `<span class="text-muted small">Auto/System</span>`;

            let formattedDate = r.scanDate;
            try {
                const [y, m, d] = r.scanDate.split('-').map(Number);
                const dObj = new Date(y, m - 1, d);
                formattedDate = dObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            } catch (_) {}

            return `
                <tr>
                    <td class="px-3 py-3 text-nowrap">${r.idNumber}</td>
                    <td class="px-3 py-3 fw-medium text-nowrap">${r.name}</td>
                    <td class="px-3 py-3 text-nowrap">${r.strand} - ${r.section}</td>
                    <td class="px-3 py-3 text-center font-monospace small text-nowrap">${formattedDate}</td>
                    <td class="px-3 py-3 text-center text-nowrap"><span class="badge ${r.timeIn ? 'bg-light text-dark border' : 'bg-secondary-subtle text-secondary'} font-monospace">${timeInFormatted}</span></td>
                    <td class="px-3 py-3 text-center text-nowrap">${timeOutHtml}</td>
                    <td class="px-3 py-3 text-center text-nowrap">${statusBadge}</td>
                    <td class="px-3 py-3 text-center text-nowrap">${verifierHtml}</td>
                </tr>
            `;
        }).join('');
    }

    if (historySectionFilter) {
        historySectionFilter.addEventListener('change', loadDailyHistory);
    }
    if (historyDateInput) {
        historyDateInput.addEventListener('change', loadDailyHistory);
    }
    if (btnHistoryToday) {
        btnHistoryToday.addEventListener('click', () => {
            if (historyDateInput) {
                historyDateInput.value = toISODate(new Date());
                loadDailyHistory();
            }
        });
    }
    if (btnHistoryYesterday) {
        btnHistoryYesterday.addEventListener('click', () => {
            if (historyDateInput) {
                const yest = new Date();
                yest.setDate(yest.getDate() - 1);
                historyDateInput.value = toISODate(yest);
                loadDailyHistory();
            }
        });
    }
    if (historySearchInput) {
        historySearchInput.addEventListener('input', applyHistoryFiltersAndRender);
    }
    if (historyStatusFilter) {
        historyStatusFilter.addEventListener('change', applyHistoryFiltersAndRender);
    }

    // ==========================================
    // EXCUSE LETTERS VERIFICATION & REVIEW LOGIC
    // ==========================================
    const excuseNotesModalEl = document.getElementById('excuseNotesModal');
    const excuseNotesModal = excuseNotesModalEl ? new bootstrap.Modal(excuseNotesModalEl) : null;
    const declineExcuseModalEl = document.getElementById('declineExcuseModal');
    const declineExcuseModal = declineExcuseModalEl ? new bootstrap.Modal(declineExcuseModalEl) : null;
    const proofViewerModalEl = document.getElementById('proofViewerModal');
    const proofViewerModal = proofViewerModalEl ? new bootstrap.Modal(proofViewerModalEl) : null;
    const proofViewerTitle = document.getElementById('proofViewerTitle');
    const proofViewerSubtitle = document.getElementById('proofViewerSubtitle');
    const proofViewerBody = document.getElementById('proofViewerBody');
    const proofViewerFileInfo = document.getElementById('proofViewerFileInfo');
    const proofViewerNewTabBtn = document.getElementById('proofViewerNewTabBtn');
    const proofViewerDownloadBtn = document.getElementById('proofViewerDownloadBtn');

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    let currentViewerActiveBlobUrl = null;

    function getMimeTypeFromFilename(filename, fallback = 'application/octet-stream') {
        if (!filename || typeof filename !== 'string') return fallback;
        const ext = filename.split('.').pop().toLowerCase();
        const mimeMap = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'ppt': 'application/vnd.ms-powerpoint',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'txt': 'text/plain',
            'csv': 'text/csv',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
            'mp4': 'video/mp4',
            'webm': 'video/webm'
        };
        return mimeMap[ext] || fallback;
    }

    function dataURItoBlob(dataURI, fileName = 'document') {
        if (!dataURI) return new Blob();
        if (!dataURI.includes(',')) return new Blob([dataURI]);
        try {
            const byteString = atob(dataURI.split(',')[1]);
            const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            return new Blob([ab], { type: mimeString });
        } catch (e) {
            return new Blob([dataURI]);
        }
    }

    async function loadFileData(resolvedUrl, fileName = '') {
        if (!resolvedUrl) throw new Error('No valid file URL provided.');
        const ext = (fileName || '').split('.').pop().toLowerCase();
        const isMedia = ['mp4', 'webm', 'ogg', 'mp3', 'wav', 'm4a'].includes(ext);

        if (resolvedUrl.startsWith('data:')) {
            try {
                const res = await fetch(resolvedUrl);
                const blob = await res.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const blobUrl = URL.createObjectURL(blob);
                return { blob, arrayBuffer, blobUrl, mimeType: blob.type || getMimeTypeFromFilename(fileName) };
            } catch (fetchErr) {
                const b = dataURItoBlob(resolvedUrl, fileName);
                if (!b) throw new Error('Could not parse data URI.');
                const arrayBuffer = await b.arrayBuffer();
                const blobUrl = URL.createObjectURL(b);
                return { blob: b, arrayBuffer, blobUrl, mimeType: b.type || getMimeTypeFromFilename(fileName) };
            }
        }

        if (resolvedUrl.startsWith('blob:')) {
            try {
                const res = await fetch(resolvedUrl);
                const blob = await res.blob();
                const arrayBuffer = await blob.arrayBuffer();
                return { blob, arrayBuffer, blobUrl: resolvedUrl, mimeType: blob.type || getMimeTypeFromFilename(fileName) };
            } catch (e) {
                return { blob: null, arrayBuffer: null, blobUrl: resolvedUrl, mimeType: getMimeTypeFromFilename(fileName) };
            }
        }

        if (isMedia && /^https?:\/\//i.test(resolvedUrl)) {
            return {
                blob: null,
                arrayBuffer: null,
                blobUrl: resolvedUrl,
                mimeType: getMimeTypeFromFilename(fileName)
            };
        }

        const token = localStorage.getItem('mentorae_token');
        const headers = {};
        if (token && resolvedUrl.includes('/api/')) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
            const res = await fetch(resolvedUrl, { headers, signal: controller.signal });
            if (!res.ok) {
                let errMsg = `Failed to load file (${res.status} ${res.statusText})`;
                try {
                    const errJson = await res.json();
                    if (errJson && errJson.message) errMsg = errJson.message;
                } catch (e) { }
                throw new Error(errMsg);
            }
            const blob = await res.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const blobUrl = URL.createObjectURL(blob);
            return { blob, arrayBuffer, blobUrl, mimeType: blob.type || getMimeTypeFromFilename(fileName) };
        } catch (fetchErr) {
            if (fetchErr.name === 'AbortError') {
                throw new Error('Connection timed out. The file may be temporarily unreachable.');
            }
            throw fetchErr;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    function paginateDocxContainer(hostEl) {
        if (!hostEl) return;
        const sections = Array.from(hostEl.querySelectorAll('section.docx, .docx-wrapper > section, .docx-paper-sheet'));
        if (!sections.length) return;

        const TARGET_PAGE_HEIGHT = 1056; // Standard 8.5" x 11" Letter page height at 96 DPI
        const PAGE_PADDING_V = 136;
        const USABLE_HEIGHT = TARGET_PAGE_HEIGHT - PAGE_PADDING_V;

        sections.forEach(sec => {
            if (sec.classList.contains('docx-paginated-done')) return;

            if (sec.offsetHeight <= TARGET_PAGE_HEIGHT + 60) {
                if (!sec.querySelector('.docx-page-footer-badge')) {
                    const footer = document.createElement('div');
                    footer.className = 'docx-page-footer-badge';
                    footer.innerHTML = '<span class="docx-page-num-badge">Page 1 of 1</span>';
                    sec.appendChild(footer);
                }
                sec.classList.add('docx-paginated-done');
                return;
            }

            const rawChildren = Array.from(sec.children).filter(c => 
                c.tagName !== 'HEADER' && 
                c.tagName !== 'FOOTER' && 
                !c.classList.contains('docx-page-footer-badge')
            );
            if (rawChildren.length <= 1) return;

            const pages = [];
            let curPageChildren = [];
            let accumulatedH = 0;

            rawChildren.forEach(child => {
                const h = child.offsetHeight || 30;
                if (accumulatedH + h > USABLE_HEIGHT && curPageChildren.length > 0) {
                    pages.push(curPageChildren);
                    curPageChildren = [child];
                    accumulatedH = h;
                } else {
                    curPageChildren.push(child);
                    accumulatedH += h;
                }
            });
            if (curPageChildren.length > 0) {
                pages.push(curPageChildren);
            }

            if (pages.length <= 1) return;

            pages.forEach((pageChildren, pageIdx) => {
                const pageSec = document.createElement('section');
                pageSec.className = `${sec.className} docx-paginated-done`;
                if (sec.style.cssText) pageSec.style.cssText = sec.style.cssText;
                pageSec.style.minHeight = `${TARGET_PAGE_HEIGHT}px`;
                pageSec.style.marginBottom = '32px';
                pageSec.style.position = 'relative';

                pageChildren.forEach(c => pageSec.appendChild(c));

                const pageFooter = document.createElement('div');
                pageFooter.className = 'docx-page-footer-badge';
                pageFooter.innerHTML = `<span class="docx-page-num-badge">Page ${pageIdx + 1} of ${pages.length}</span>`;
                pageSec.appendChild(pageFooter);

                sec.parentNode.insertBefore(pageSec, sec);
            });
            sec.remove();
        });
    }

    async function openClassroomViewer(fileName, resolvedUrl, subtitle = 'Excuse Proof Document', meta = {}, returnModal = null) {
        const viewerEl = document.getElementById('classroomFileViewer');
        const nameEl = document.getElementById('classroomViewerFileName');
        const subEl = document.getElementById('classroomViewerSubtitle');
        const iconEl = document.getElementById('classroomViewerIcon');
        const stageEl = document.getElementById('classroomViewerStage');
        const downloadBtn = document.getElementById('classroomViewerDownloadBtn');
        const popoutBtn = document.getElementById('classroomViewerPopoutBtn');
        const printBtn = document.getElementById('classroomViewerPrintBtn');
        const modeSwitcherEl = document.getElementById('classroomViewerModeSwitcher');

        if (!viewerEl || !stageEl) return;

        // Revoke prior active blob URL
        if (currentViewerActiveBlobUrl && currentViewerActiveBlobUrl.startsWith('blob:')) {
            try { URL.revokeObjectURL(currentViewerActiveBlobUrl); } catch (e) { }
            currentViewerActiveBlobUrl = null;
        }

        viewerEl.classList.remove('d-none');
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        // Track caller modal to restore on close
        let returnModalInstance = null;
        if (returnModal && typeof bootstrap !== 'undefined') {
            returnModalInstance = bootstrap.Modal.getInstance(returnModal) || new bootstrap.Modal(returnModal);
            if (returnModalInstance) returnModalInstance.hide();
        }

        let handleViewerKeydown = null;
        const closeViewer = () => {
            if (handleViewerKeydown) {
                window.removeEventListener('keydown', handleViewerKeydown);
                handleViewerKeydown = null;
            }
            viewerEl.classList.add('d-none');
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
            stageEl.innerHTML = '';
            if (modeSwitcherEl) modeSwitcherEl.innerHTML = '';
            if (currentViewerActiveBlobUrl && currentViewerActiveBlobUrl.startsWith('blob:')) {
                try { URL.revokeObjectURL(currentViewerActiveBlobUrl); } catch (e) { }
                currentViewerActiveBlobUrl = null;
            }
            if (returnModalInstance) {
                returnModalInstance.show();
            }
        };

        const closeBtn = document.getElementById('classroomViewerCloseBtn');
        const backBtn = document.getElementById('classroomViewerBackBtn');
        if (closeBtn) closeBtn.onclick = closeViewer;
        if (backBtn) backBtn.onclick = closeViewer;

        handleViewerKeydown = (e) => {
            if (e.key === 'Escape' && !viewerEl.classList.contains('d-none')) {
                e.preventDefault();
                closeViewer();
            }
        };
        window.addEventListener('keydown', handleViewerKeydown);

        if (nameEl) nameEl.textContent = fileName || 'Document';
        if (subEl) subEl.textContent = subtitle || 'Excuse Proof Document';

        const ext = (fileName || '').split('.').pop().toLowerCase();
        let mime = (meta && meta.type) ? meta.type : getMimeTypeFromFilename(fileName, '');

        if (iconEl) {
            if (ext === 'pdf') {
                iconEl.className = 'bi bi-file-earmark-pdf fs-4 text-danger';
            } else if (ext === 'pptx' || ext === 'ppt') {
                iconEl.className = 'bi bi-file-earmark-slides fs-4 text-warning';
            } else if (ext === 'docx' || ext === 'doc') {
                iconEl.className = 'bi bi-file-earmark-word fs-4 text-primary';
            } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
                iconEl.className = 'bi bi-file-earmark-excel fs-4 text-success';
            } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
                iconEl.className = 'bi bi-file-earmark-image fs-4 text-info';
            } else {
                iconEl.className = 'bi bi-file-earmark-text fs-4 text-light';
            }
        }

        stageEl.innerHTML = `
            <div class="d-flex flex-column align-items-center justify-content-center w-100 h-100 text-white">
                <div class="spinner-border text-success mb-3" style="width: 3.2rem; height: 3.2rem;" role="status"></div>
                <p class="fs-5 fw-semibold mb-1">Loading Document Preview...</p>
                <p class="text-white-50 small">${escapeHtml(fileName || 'Please wait')}</p>
            </div>
        `;
        if (modeSwitcherEl) modeSwitcherEl.innerHTML = '';

        let fileData = null;
        try {
            fileData = await loadFileData(resolvedUrl, fileName);
            if (fileData.blobUrl && fileData.blobUrl.startsWith('blob:')) {
                currentViewerActiveBlobUrl = fileData.blobUrl;
            }
        } catch (err) {
            console.error('Error loading file data:', err);
            stageEl.innerHTML = `
                <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 520px;">
                    <i class="bi bi-file-earmark-x text-warning display-4 mb-3 d-block"></i>
                    <h4 class="fw-bold text-white mb-2">Preview Unavailable</h4>
                    <p class="text-white-50 mb-3">${escapeHtml(fileName || 'File')}</p>
                    <p class="text-secondary small mb-4">${escapeHtml(err.message || 'File could not be opened.')}</p>
                    <div class="d-flex justify-content-center gap-2">
                        <button type="button" class="btn btn-outline-light rounded-pill px-4 fw-semibold" id="closeMissingFileViewerBtn">
                            <i class="bi bi-arrow-left me-2"></i> Close Viewer
                        </button>
                        <a href="${resolvedUrl}&download=1" class="btn btn-success rounded-pill px-4 fw-semibold" download="${escapeHtml(fileName)}">
                            <i class="bi bi-download me-1"></i> Download Directly
                        </a>
                    </div>
                </div>
            `;
            document.getElementById('closeMissingFileViewerBtn')?.addEventListener('click', closeViewer);
            return;
        }

        const activeUrl = fileData?.blobUrl || resolvedUrl;

        // Configure Top Action Buttons
        if (downloadBtn) {
            downloadBtn.href = `${resolvedUrl}&download=1`;
            downloadBtn.setAttribute('download', fileName || 'proof_document');
        }
        if (popoutBtn) {
            popoutBtn.href = activeUrl;
            popoutBtn.target = '_blank';
        }
        if (printBtn) {
            printBtn.onclick = () => {
                const ifr = stageEl.querySelector('iframe');
                if (ifr && ifr.contentWindow) {
                    try {
                        ifr.contentWindow.print();
                        return;
                    } catch (e) { }
                }
                const printWindow = window.open(activeUrl);
                if (printWindow) {
                    printWindow.addEventListener('load', () => printWindow.print(), { once: true });
                } else {
                    window.print();
                }
            };
        }

        // 1. PDF RENDERING (Dual Mode: High-Fidelity Canvas + Native Browser Reader)
        if (ext === 'pdf' || mime.includes('pdf')) {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
            if (isMobile) {
                stageEl.innerHTML = `
                    <div class="d-flex flex-column align-items-center justify-content-center w-100 h-100 text-white p-4">
                        <div class="text-center p-4 bg-dark bg-opacity-75 rounded-4 border border-secondary shadow-lg" style="max-width: 440px; width: 100%;">
                            <i class="bi bi-file-earmark-pdf text-danger" style="font-size: 4.5rem;"></i>
                            <h5 class="fw-bold text-white mt-3 text-truncate mb-1">${escapeHtml(fileName)}</h5>
                            <p class="text-white-50 small mb-4">Tap below to view this PDF in full screen.</p>
                            <a href="${activeUrl}" target="_blank" class="btn btn-danger btn-lg rounded-pill px-4 fw-bold w-100 mb-2">
                                <i class="bi bi-box-arrow-up-right me-2"></i> Open PDF Fullscreen
                            </a>
                            <a href="${activeUrl}" download="${escapeHtml(fileName)}" class="btn btn-outline-light rounded-pill px-4 fw-semibold w-100 btn-sm">
                                <i class="bi bi-download me-1"></i> Save to Device
                            </a>
                        </div>
                    </div>
                `;
                return;
            }

            const renderNativeView = () => {
                if (modeSwitcherEl) {
                    modeSwitcherEl.innerHTML = `
                        <button type="button" class="btn btn-sm btn-outline-light rounded-pill px-2.5 py-0.5 border-0 fw-semibold fs-8" id="pdfSwitchCanvasBtn" title="Switch to Page Canvas View">
                            <i class="bi bi-file-earmark-text me-1"></i> Page Canvas View
                        </button>
                    `;
                    document.getElementById('pdfSwitchCanvasBtn')?.addEventListener('click', () => renderCanvasView());
                }
                stageEl.innerHTML = `
                    <object data="${activeUrl}" type="application/pdf" class="w-100 h-100 border-0" style="background: #525659;">
                        <iframe src="${activeUrl}" class="w-100 h-100 border-0" title="${escapeHtml(fileName)}" style="background: #525659;">
                            <div class="p-5 text-center text-white">
                                <p class="mb-3">Unable to display PDF inline.</p>
                                <a href="${activeUrl}" target="_blank" class="btn btn-danger rounded-pill px-4">Open PDF</a>
                            </div>
                        </iframe>
                    </object>
                `;
            };

            const renderCanvasView = async () => {
                if (!window.pdfjsLib || !fileData || !fileData.arrayBuffer) {
                    renderNativeView();
                    return;
                }

                stageEl.innerHTML = `
                    <div class="docx-viewer-wrapper" id="pdfViewerWrapper">
                        <div id="pdfPagesHost" class="d-flex flex-column align-items-center py-4 w-100">
                            <div class="spinner-border text-danger mb-2" role="status"></div>
                            <span class="text-white-50 small">Rendering PDF Pages...</span>
                        </div>
                    </div>
                `;

                const host = document.getElementById('pdfPagesHost');
                try {
                    if (window.pdfjsLib.GlobalWorkerOptions) {
                        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    }
                    const loadingTask = window.pdfjsLib.getDocument({ data: fileData.arrayBuffer });
                    const pdfDoc = await loadingTask.promise;

                    host.innerHTML = '';
                    let currentZoom = 1.0;

                    if (modeSwitcherEl) {
                        modeSwitcherEl.innerHTML = `
                            <button type="button" class="btn btn-sm btn-outline-light rounded-circle p-1 border-0" id="pdfZoomOutBtn" title="Zoom Out" style="width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;">
                                <i class="bi bi-dash"></i>
                            </button>
                            <span class="text-white-50 px-2 fw-semibold" id="pdfZoomVal" style="font-size: 0.75rem; min-width: 42px; text-align: center;">100%</span>
                            <button type="button" class="btn btn-sm btn-outline-light rounded-circle p-1 border-0" id="pdfZoomInBtn" title="Zoom In" style="width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;">
                                <i class="bi bi-plus"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill px-2 py-0.5 border-0 ms-1 fw-semibold fs-8" id="pdfFitBtn" title="Reset Zoom">
                                Reset
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-light rounded-pill px-2.5 py-0.5 border-0 ms-1.5 fw-semibold fs-8" id="pdfSwitchNativeBtn" title="Open with Native Browser PDF Reader">
                                <i class="bi bi-window me-1"></i> Native Reader
                            </button>
                        `;

                        const updatePdfZoom = (z) => {
                            currentZoom = Math.min(Math.max(0.5, Math.round(z * 100) / 100), 2.5);
                            const zoomValEl = document.getElementById('pdfZoomVal');
                            if (zoomValEl) zoomValEl.textContent = `${Math.round(currentZoom * 100)}%`;
                            host.querySelectorAll('.pdf-page-canvas').forEach(cv => {
                                cv.style.transform = `scale(${currentZoom})`;
                                cv.style.transformOrigin = 'top center';
                            });
                        };

                        document.getElementById('pdfZoomOutBtn')?.addEventListener('click', () => updatePdfZoom(currentZoom - 0.15));
                        document.getElementById('pdfZoomInBtn')?.addEventListener('click', () => updatePdfZoom(currentZoom + 0.15));
                        document.getElementById('pdfFitBtn')?.addEventListener('click', () => updatePdfZoom(1.0));
                        document.getElementById('pdfSwitchNativeBtn')?.addEventListener('click', () => renderNativeView());
                    }

                    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                        const page = await pdfDoc.getPage(pageNum);
                        const viewport = page.getViewport({ scale: 1.5 });

                        const pageCard = document.createElement('div');
                        pageCard.className = 'pdf-page-card mb-4 text-center';
                        pageCard.style.maxWidth = '100%';

                        const canvas = document.createElement('canvas');
                        canvas.className = 'pdf-page-canvas shadow-lg rounded-2';
                        canvas.style.maxWidth = '100%';
                        canvas.style.height = 'auto';
                        canvas.style.background = '#ffffff';
                        canvas.style.transition = 'transform 0.15s ease';

                        const context = canvas.getContext('2d');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;

                        await page.render({ canvasContext: context, viewport: viewport }).promise;

                        pageCard.appendChild(canvas);

                        if (pdfDoc.numPages > 1) {
                            const badge = document.createElement('div');
                            badge.className = 'text-center mt-2 text-white-50 small';
                            badge.textContent = `Page ${pageNum} of ${pdfDoc.numPages}`;
                            pageCard.appendChild(badge);
                        }

                        host.appendChild(pageCard);
                    }
                } catch (pdfErr) {
                    console.warn('PDF.js render notice, switching to native viewer:', pdfErr);
                    renderNativeView();
                }
            };

            await renderCanvasView();
            return;
        }

        // 2. WORD DOCUMENTS (.docx, .doc)
        if (ext === 'docx' || ext === 'doc') {
            stageEl.innerHTML = `
                <div class="docx-viewer-wrapper">
                    <div id="docxPreviewHost" class="docx-preview-host"></div>
                </div>
            `;
            const host = document.getElementById('docxPreviewHost');

            if (modeSwitcherEl) {
                modeSwitcherEl.innerHTML = `
                    <button type="button" class="btn btn-sm btn-outline-light rounded-circle p-1 border-0" id="docxZoomOutBtn" title="Zoom Out" style="width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;">
                        <i class="bi bi-dash"></i>
                    </button>
                    <span class="text-white-50 px-2 fw-semibold" id="docxZoomVal" style="font-size: 0.75rem; min-width: 42px; text-align: center;">100%</span>
                    <button type="button" class="btn btn-sm btn-outline-light rounded-circle p-1 border-0" id="docxZoomInBtn" title="Zoom In" style="width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;">
                        <i class="bi bi-plus"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill px-2 py-0.5 border-0 ms-1 fw-semibold fs-8" id="docxFitBtn" title="Reset Zoom">
                        Reset
                    </button>
                `;
                let currentZoom = 1.0;
                const updateZoom = (z) => {
                    currentZoom = Math.min(Math.max(0.5, Math.round(z * 100) / 100), 2.0);
                    const zoomValEl = document.getElementById('docxZoomVal');
                    if (zoomValEl) zoomValEl.textContent = `${Math.round(currentZoom * 100)}%`;
                    if (host) {
                        host.style.transform = `scale(${currentZoom})`;
                        host.style.transformOrigin = 'top center';
                    }
                };
                document.getElementById('docxZoomOutBtn')?.addEventListener('click', () => updateZoom(currentZoom - 0.15));
                document.getElementById('docxZoomInBtn')?.addEventListener('click', () => updateZoom(currentZoom + 0.15));
                document.getElementById('docxFitBtn')?.addEventListener('click', () => updateZoom(1.0));
            }

            if (ext === 'docx' && window.docx && typeof window.docx.renderAsync === 'function' && fileData.arrayBuffer) {
                try {
                    await window.docx.renderAsync(fileData.arrayBuffer, host, null, {
                        className: 'docx',
                        inWrapper: true,
                        ignoreWidth: false,
                        ignoreHeight: false,
                        ignoreFonts: false,
                        breakPages: true,
                        ignoreLastRenderedPageBreak: false,
                        useBase64URL: true,
                        renderHeaders: true,
                        renderFooters: true,
                        renderFootnotes: true,
                        renderEndnotes: true
                    });
                    paginateDocxContainer(host);
                    setTimeout(() => paginateDocxContainer(host), 60);
                    return;
                } catch (docxErr) {
                    console.warn('docx-preview notice, trying mammoth fallback:', docxErr);
                }
            }

            if (window.mammoth && fileData.arrayBuffer) {
                try {
                    const result = await window.mammoth.convertToHtml({ arrayBuffer: fileData.arrayBuffer });
                    host.innerHTML = `
                        <div class="docx-paper-sheet">
                            ${result.value || '<p class="text-muted fst-italic">Empty Document.</p>'}
                        </div>
                    `;
                    paginateDocxContainer(host);
                    setTimeout(() => paginateDocxContainer(host), 60);
                    return;
                } catch (mErr) {
                    console.warn('mammoth error:', mErr);
                }
            }

            stageEl.innerHTML = `
                <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 500px;">
                    <i class="bi bi-file-earmark-word text-primary" style="font-size: 5rem;"></i>
                    <h4 class="fw-bold text-white mt-3">${escapeHtml(fileName)}</h4>
                    <p class="text-white-50 mb-4">Click download below to view this document in Microsoft Word.</p>
                    <a href="${activeUrl}" download="${escapeHtml(fileName)}" class="btn btn-primary btn-lg rounded-pill px-5 fw-bold">
                        <i class="bi bi-download me-2"></i> Download Document
                    </a>
                </div>
            `;
            return;
        }

        // 3. IMAGES (PNG, JPG, WEBP, GIF, SVG)
        if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) || mime.startsWith('image/')) {
            stageEl.innerHTML = `
                <div class="d-flex align-items-center justify-content-center w-100 h-100 p-4" style="background-color: #0b0c0e;">
                    <img src="${activeUrl}" alt="${escapeHtml(fileName)}" class="img-fluid rounded shadow-lg" style="max-height: 90vh; max-width: 95vw; object-fit: contain;">
                </div>
            `;
            return;
        }

        // 4. SPREADSHEETS (.xlsx, .xls, .csv)
        if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
            if (window.XLSX && fileData.arrayBuffer) {
                try {
                    const wb = window.XLSX.read(fileData.arrayBuffer, { type: 'array' });
                    const sheetNames = wb.SheetNames || [];
                    if (sheetNames.length > 0) {
                        const renderSheet = (sIdx) => {
                            const ws = wb.Sheets[sheetNames[sIdx]];
                            const htmlTable = window.XLSX.utils.sheet_to_html(ws, { editable: false });
                            stageEl.innerHTML = `
                                <div class="spreadsheet-viewer-wrapper">
                                    <div class="spreadsheet-tabs-bar">
                                        <span class="fw-bold text-dark small me-2"><i class="bi bi-file-earmark-spreadsheet text-success me-1"></i>Sheets:</span>
                                        ${sheetNames.map((name, i) => `
                                            <button type="button" class="btn btn-sm ${i === sIdx ? 'btn-success text-white fw-bold' : 'btn-outline-secondary'} rounded-pill px-3 py-1 small sheet-tab-btn" data-sidx="${i}">
                                                <i class="bi bi-table me-1"></i>${escapeHtml(name)}
                                            </button>
                                        `).join('')}
                                    </div>
                                    <div class="spreadsheet-table-container">
                                        ${htmlTable}
                                    </div>
                                </div>
                            `;
                            stageEl.querySelectorAll('.sheet-tab-btn').forEach(btn => {
                                btn.addEventListener('click', () => {
                                    const nextIdx = parseInt(btn.getAttribute('data-sidx'), 10);
                                    renderSheet(nextIdx);
                                });
                            });
                        };
                        renderSheet(0);
                        return;
                    }
                } catch (e) {
                    console.warn('XLSX render error:', e);
                }
            }
        }

        // 5. GENERIC / FALLBACK PREVIEW
        stageEl.innerHTML = `
            <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 500px;">
                <i class="bi bi-file-earmark-text text-secondary" style="font-size: 5rem;"></i>
                <h4 class="fw-bold text-white mt-3">${escapeHtml(fileName)}</h4>
                <p class="text-white-50 mb-4">Click download below to save and open this attachment on your device.</p>
                <div class="d-flex justify-content-center gap-2">
                    <a href="${activeUrl}" download="${escapeHtml(fileName)}" class="btn btn-primary btn-lg rounded-pill px-4 fw-bold">
                        <i class="bi bi-download me-2"></i> Download File
                    </a>
                    <a href="${activeUrl}" target="_blank" class="btn btn-outline-light btn-lg rounded-pill px-4">
                        <i class="bi bi-box-arrow-up-right me-1"></i> Open in New Tab
                    </a>
                </div>
            </div>
        `;
    }

    const btnOpenExcuseNotes = document.getElementById('btnOpenExcuseNotesModal');
    const excuseNotesPendingBadge = document.getElementById('excuseNotesPendingBadge');
    const tabPendingBadge = document.getElementById('tabPendingBadge');
    const tabApprovedBadge = document.getElementById('tabApprovedBadge');
    const tabRejectedBadge = document.getElementById('tabRejectedBadge');
    const tabAllBadge = document.getElementById('tabAllBadge');
    const excuseNotesContainer = document.getElementById('excuseNotesContainer');
    const excuseModalSearch = document.getElementById('excuseModalSearch');
    const btnRefreshExcuseNotes = document.getElementById('btnRefreshExcuseNotes');
    const btnConfirmDeclineExcuse = document.getElementById('btnConfirmDeclineExcuse');
    const declineRemarksInput = document.getElementById('declineRemarksInput');
    const declineNoteIdInput = document.getElementById('declineNoteId');

    let allExcuseNotes = [];
    let currentExcuseStatusTab = 'pending';

    async function loadTeacherExcuseNotes() {
        try {
            const res = await authedFetch('/api/attendance/excuse-notes', token);
            if (res && res.success && Array.isArray(res.notes)) {
                allExcuseNotes = res.notes;

                const summary = res.summary || {
                    total: res.notes.length,
                    pending: res.notes.filter(n => n.status === 'pending').length,
                    approved: res.notes.filter(n => n.status === 'approved').length,
                    rejected: res.notes.filter(n => n.status === 'rejected').length,
                };

                // Update toolbar badge
                if (excuseNotesPendingBadge) {
                    if (summary.pending > 0) {
                        excuseNotesPendingBadge.textContent = summary.pending > 9 ? '9+' : summary.pending;
                        excuseNotesPendingBadge.classList.remove('d-none');
                    } else {
                        excuseNotesPendingBadge.classList.add('d-none');
                    }
                }

                // Update modal tab badges
                if (tabPendingBadge) tabPendingBadge.textContent = summary.pending;
                if (tabApprovedBadge) tabApprovedBadge.textContent = summary.approved;
                if (tabRejectedBadge) tabRejectedBadge.textContent = summary.rejected;
                if (tabAllBadge) tabAllBadge.textContent = summary.total;

                renderExcuseNotesList();
            } else {
                if (excuseNotesContainer) {
                    excuseNotesContainer.innerHTML = '<div class="text-center py-4 text-muted">No excuse letters found.</div>';
                }
            }
        } catch (err) {
            console.error('loadTeacherExcuseNotes error:', err);
            if (excuseNotesContainer) {
                excuseNotesContainer.innerHTML = '<div class="text-center py-4 text-danger"><i class="bi bi-exclamation-triangle me-1"></i>Could not load excuse letters.</div>';
            }
        }
    }

    function renderExcuseNotesList() {
        if (!excuseNotesContainer) return;

        const query = (excuseModalSearch ? excuseModalSearch.value : '').toLowerCase().trim();

        const filtered = allExcuseNotes.filter(n => {
            const matchesTab = currentExcuseStatusTab === 'all' || n.status === currentExcuseStatusTab;
            const matchesQuery = !query ||
                (n.student_name && n.student_name.toLowerCase().includes(query)) ||
                (n.student_lrn && n.student_lrn.toLowerCase().includes(query)) ||
                (n.parent_name && n.parent_name.toLowerCase().includes(query)) ||
                (n.reason && n.reason.toLowerCase().includes(query)) ||
                (n.section_name && n.section_name.toLowerCase().includes(query));
            return matchesTab && matchesQuery;
        });

        if (!filtered.length) {
            let emptyMsg = 'No excuse letters found.';
            if (currentExcuseStatusTab === 'pending') emptyMsg = 'No pending excuse letters waiting for review.';
            else if (currentExcuseStatusTab === 'approved') emptyMsg = 'No approved excuse letters yet.';
            else if (currentExcuseStatusTab === 'rejected') emptyMsg = 'No declined excuse letters.';

            excuseNotesContainer.innerHTML = `
                <div class="text-center py-5 bg-white rounded-3 border">
                    <i class="bi bi-inbox fs-1 text-muted opacity-50 d-block mb-2"></i>
                    <h6 class="fw-bold text-dark m-0">${emptyMsg}</h6>
                    <p class="text-muted small m-0 mt-1">Submitted parent excuse letters will appear here for verification.</p>
                </div>
            `;
            return;
        }

        excuseNotesContainer.innerHTML = filtered.map(n => {
            let statusBadge = '';
            if (n.status === 'pending') {
                statusBadge = '<span class="excuse-status-badge excuse-status-pending"><i class="bi bi-hourglass-split me-1"></i>Pending Review</span>';
            } else if (n.status === 'approved') {
                statusBadge = '<span class="excuse-status-badge excuse-status-approved"><i class="bi bi-patch-check-fill me-1"></i>Certified &amp; Approved</span>';
            } else {
                statusBadge = '<span class="excuse-status-badge excuse-status-rejected"><i class="bi bi-x-circle-fill me-1"></i>Declined</span>';
            }

            // Reason Pill formatting
            let reasonIcon = 'bi-file-earmark-medical';
            const reasonLower = (n.reason || '').toLowerCase();
            if (reasonLower.includes('emergency') || reasonLower.includes('family')) reasonIcon = 'bi-shield-exclamation';
            else if (reasonLower.includes('activity') || reasonLower.includes('school')) reasonIcon = 'bi-trophy';
            else if (reasonLower.includes('weather') || reasonLower.includes('flood') || reasonLower.includes('transport')) reasonIcon = 'bi-cloud-rain';
            else if (reasonLower.includes('bereavement')) reasonIcon = 'bi-heartbreak';

            const reasonPill = `<span class="excuse-reason-pill"><i class="bi ${reasonIcon}"></i>${n.reason || 'Absence Excuse'}</span>`;

            // Formatted absence date
            let absDateStr = n.absence_date || '—';
            try {
                const [y, m, d] = n.absence_date.split('-').map(Number);
                const dObj = new Date(y, m - 1, d);
                absDateStr = dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
            } catch (_) {}

            // Filed on date
            const filedStr = n.created_at ? new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

            // Review Info block
            let reviewInfoHtml = '';
            if (n.status === 'approved') {
                const reviewedDate = n.reviewed_at ? new Date(n.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
                reviewInfoHtml = `
                    <div class="excuse-review-info mt-2.5 d-flex align-items-center justify-content-between flex-wrap gap-2">
                        <div>
                            <i class="bi bi-check-circle-fill me-1"></i> <strong>Certified &amp; Excused</strong> by ${n.reviewer_name || 'Class Adviser'} ${reviewedDate ? `on ${reviewedDate}` : ''}
                            ${n.review_remarks ? `<div class="mt-1 small text-dark opacity-85"><em>"${n.review_remarks}"</em></div>` : ''}
                        </div>
                    </div>
                `;
            } else if (n.status === 'rejected') {
                const reviewedDate = n.reviewed_at ? new Date(n.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
                reviewInfoHtml = `
                    <div class="excuse-review-info declined mt-2.5">
                        <div>
                            <i class="bi bi-x-circle-fill me-1"></i> <strong>Declined</strong> by ${n.reviewer_name || 'Class Adviser'} ${reviewedDate ? `on ${reviewedDate}` : ''}
                        </div>
                        ${n.review_remarks ? `<div class="mt-1 small fw-medium">Reason: "${n.review_remarks}"</div>` : ''}
                    </div>
                `;
            }

            // Action buttons (for pending items)
            let actionsHtml = '';
            if (n.status === 'pending') {
                actionsHtml = `
                    <div class="d-flex align-items-center gap-2 mt-3 pt-2 border-top justify-content-end flex-wrap">
                        <button type="button" class="btn btn-sm btn-outline-danger px-3 py-1.5 fw-semibold d-inline-flex align-items-center gap-1.5 btn-decline-excuse" data-id="${n.id}" data-student="${n.student_name}">
                            <i class="bi bi-x-circle"></i> Decline
                        </button>
                        <button type="button" class="btn btn-sm btn-success px-4 py-1.5 fw-bold d-inline-flex align-items-center gap-1.5 shadow-sm btn-certify-excuse" data-id="${n.id}" data-student="${n.student_name}">
                            <i class="bi bi-check2-circle fs-6"></i> Certify &amp; Approve
                        </button>
                    </div>
                `;
            }

            // Supporting Document / Proof File Section
            let proofSectionHtml = '';
            if (n.has_proof || n.proof_file_name) {
                const pType = (n.proof_file_type || '').toLowerCase();
                const pName = n.proof_file_name || 'proof-document';
                const isImg = pType.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(pName);
                const isPdf = pType.includes('pdf') || /\.pdf$/i.test(pName);
                const isDoc = pType.includes('word') || pType.includes('document') || /\.(doc|docx)$/i.test(pName);

                let docIcon = 'bi-file-earmark-text';
                let iconColor = 'text-primary';
                let typeBadge = 'DOCUMENT';
                if (isImg) { docIcon = 'bi-file-earmark-image-fill'; iconColor = 'text-info'; typeBadge = 'PHOTO / IMAGE'; }
                else if (isPdf) { docIcon = 'bi-file-earmark-pdf-fill'; iconColor = 'text-danger'; typeBadge = 'PDF DOCUMENT'; }
                else if (isDoc) { docIcon = 'bi-file-earmark-word-fill'; iconColor = 'text-primary'; typeBadge = 'WORD DOCUMENT'; }

                const sizeStr = n.proof_file_size ? `${(n.proof_file_size / 1024).toFixed(1)} KB` : '';
                const proofUrl = `${API_BASE}/api/attendance/excuse-notes/${n.id}/proof?token=${token}`;

                proofSectionHtml = `
                    <div class="mt-3 p-3 rounded-3 border bg-light d-flex align-items-center justify-content-between flex-wrap gap-2 excuse-proof-box">
                        <div class="d-flex align-items-center gap-2.5 min-w-0">
                            <div class="p-2 rounded-2 bg-white border ${iconColor} flex-shrink-0 d-flex align-items-center justify-content-center" style="width: 38px; height: 38px;">
                                <i class="bi ${docIcon} fs-4"></i>
                            </div>
                            <div class="min-w-0">
                                <div class="d-flex align-items-center gap-1.5 flex-wrap">
                                    <span class="badge bg-secondary-subtle text-secondary border fw-bold" style="font-size: 0.68rem;">${typeBadge}</span>
                                    <span class="fw-semibold text-dark text-sm text-truncate" style="max-width: 280px;" title="${escapeHtml(pName)}">${escapeHtml(pName)}</span>
                                </div>
                                <div class="micro-text text-muted mt-0.5">
                                    ${sizeStr ? `${sizeStr} &bull; ` : ''}Attached as Medical/Absence Proof
                                </div>
                            </div>
                        </div>
                        <div class="d-flex align-items-center gap-2 ms-auto me-1">
                            <button type="button" class="btn btn-sm btn-outline-success fw-bold rounded-pill px-3 py-1.5 d-inline-flex align-items-center gap-1 btn-view-proof shadow-xs" data-id="${n.id}" data-name="${escapeHtml(pName)}" data-type="${pType}" data-student="${escapeHtml(n.student_name)}" data-url="${proofUrl}">
                                <i class="bi bi-eye-fill"></i> View Proof
                            </button>
                            <a href="${proofUrl}&download=1" class="btn btn-sm btn-outline-secondary rounded-pill px-2.5 py-1.5 ms-1" title="Download Proof File" download="${escapeHtml(pName)}">
                                <i class="bi bi-download"></i>
                            </a>
                        </div>
                    </div>
                `;
            } else {
                proofSectionHtml = `
                    <div class="mt-2 text-muted micro-text fst-italic">
                        <i class="bi bi-paperclip me-1"></i>No supporting document attached to this excuse note.
                    </div>
                `;
            }

            return `
                <div class="excuse-note-card p-3.5 p-md-4 shadow-sm bg-white" id="excuseCard_${n.id}">
                    <div class="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2 mb-2 pb-2 border-bottom">
                        <div class="d-flex align-items-center gap-2 flex-wrap">
                            <span class="badge bg-dark text-white px-2.5 py-1 rounded-2">
                                <i class="bi bi-calendar-event me-1 text-warning"></i> Date of Absence: <strong>${absDateStr}</strong>
                            </span>
                            ${reasonPill}
                            ${n.section_name ? `<span class="badge bg-light text-secondary border px-2 py-1"><i class="bi bi-people me-1"></i>${n.section_name}</span>` : ''}
                        </div>
                        <div>
                            ${statusBadge}
                        </div>
                    </div>

                    <div class="row g-3">
                        <div class="col-12 col-md-6">
                            <div class="d-flex align-items-start gap-2.5">
                                <div class="bg-light text-success rounded-circle p-2 d-flex align-items-center justify-content-center flex-shrink-0" style="width: 36px; height: 36px;">
                                    <i class="bi bi-person-fill fs-5"></i>
                                </div>
                                <div>
                                    <div class="fw-bold text-dark fs-6">${n.student_name}</div>
                                    <div class="small text-muted">LRN: <span class="font-monospace">${n.student_lrn || '—'}</span> &bull; Grade ${n.grade_level || n.section_grade || '11/12'}</div>
                                </div>
                            </div>
                        </div>

                        <div class="col-12 col-md-6">
                            <div class="d-flex align-items-start gap-2.5">
                                <div class="bg-light text-primary rounded-circle p-2 d-flex align-items-center justify-content-center flex-shrink-0" style="width: 36px; height: 36px;">
                                    <i class="bi bi-person-heart fs-5"></i>
                                </div>
                                <div>
                                    <div class="fw-bold text-dark fs-6">${n.parent_name || 'Parent / Guardian'}</div>
                                    <div class="small text-muted">
                                        ${n.parent_contact ? `<i class="bi bi-telephone me-1"></i>${n.parent_contact}` : ''}
                                        ${n.parent_email ? ` &bull; <i class="bi bi-envelope me-1"></i>${n.parent_email}` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Parent Explanation / Remarks -->
                    <div class="mt-3">
                        <label class="form-label small text-muted fw-semibold mb-1"><i class="bi bi-chat-quote-fill me-1 text-secondary"></i>Parent Explanation &amp; Remarks:</label>
                        <div class="excuse-remarks-box">
                            ${n.remarks ? n.remarks : '<span class="text-muted fst-italic">No additional remarks provided.</span>'}
                        </div>
                        <div class="text-end text-muted mt-1" style="font-size: 0.72rem;">
                            Submitted on: ${filedStr}
                        </div>
                    </div>

                    ${proofSectionHtml}
                    ${reviewInfoHtml}
                    ${actionsHtml}
                </div>
            `;
        }).join('');

        // Wire View Proof Buttons
        excuseNotesContainer.querySelectorAll('.btn-view-proof').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name') || 'Supporting Document';
                const type = (btn.getAttribute('data-type') || '').toLowerCase();
                const student = btn.getAttribute('data-student') || '';
                const url = btn.getAttribute('data-url');
                if (!id || !url) return;

                const subtitle = student ? `Excuse Proof Document • ${student}` : 'Excuse Proof Document';
                openClassroomViewer(name, url, subtitle, { id, name, type, student }, excuseNotesModalEl);
            });
        });

        // Wire Action Buttons
        excuseNotesContainer.querySelectorAll('.btn-certify-excuse').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = btn.getAttribute('data-id');
                const student = btn.getAttribute('data-student');
                if (!id) return;

                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Certifying...';

                try {
                    const res = await authedFetch(`/api/attendance/excuse-notes/${id}`, token, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: 'approved' })
                    });

                    if (res && res.success) {
                        // Success feedback
                        await loadTeacherExcuseNotes();
                        // Refresh attendance roster & daily history
                        refresh();
                        if (typeof loadDailyHistory === 'function') loadDailyHistory();
                    } else {
                        alert(res.message || 'Could not certify excuse letter.');
                        btn.disabled = false;
                        btn.innerHTML = '<i class="bi bi-check2-circle fs-6"></i> Certify &amp; Approve';
                    }
                } catch (err) {
                    console.error('Certify excuse error:', err);
                    alert('An error occurred while certifying the excuse note.');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-check2-circle fs-6"></i> Certify &amp; Approve';
                }
            });
        });

        excuseNotesContainer.querySelectorAll('.btn-decline-excuse').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                if (!id) return;
                if (declineNoteIdInput) declineNoteIdInput.value = id;
                if (declineRemarksInput) declineRemarksInput.value = '';
                if (declineExcuseModal) declineExcuseModal.show();
            });
        });
    }

    // Modal tabs event wiring
    const excuseTabFilters = document.getElementById('excuseTabFilters');
    if (excuseTabFilters) {
        excuseTabFilters.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                excuseTabFilters.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentExcuseStatusTab = btn.getAttribute('data-status') || 'all';
                renderExcuseNotesList();
            });
        });
    }

    if (excuseModalSearch) {
        excuseModalSearch.addEventListener('input', renderExcuseNotesList);
    }

    if (btnRefreshExcuseNotes) {
        btnRefreshExcuseNotes.addEventListener('click', loadTeacherExcuseNotes);
    }

    if (btnOpenExcuseNotes) {
        btnOpenExcuseNotes.addEventListener('click', () => {
            if (excuseNotesModal) excuseNotesModal.show();
            loadTeacherExcuseNotes();
        });
    }

    if (btnConfirmDeclineExcuse) {
        btnConfirmDeclineExcuse.addEventListener('click', async () => {
            const id = declineNoteIdInput ? declineNoteIdInput.value : '';
            const remarks = declineRemarksInput ? declineRemarksInput.value.trim() : '';
            if (!id) return;

            btnConfirmDeclineExcuse.disabled = true;
            btnConfirmDeclineExcuse.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Declining...';

            try {
                const res = await authedFetch(`/api/attendance/excuse-notes/${id}`, token, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        status: 'rejected',
                        reviewRemarks: remarks
                    })
                });

                if (res && res.success) {
                    if (declineExcuseModal) declineExcuseModal.hide();
                    await loadTeacherExcuseNotes();
                } else {
                    alert(res.message || 'Could not decline excuse note.');
                }
            } catch (err) {
                console.error('Decline excuse error:', err);
                alert('An error occurred while declining the excuse note.');
            } finally {
                btnConfirmDeclineExcuse.disabled = false;
                btnConfirmDeclineExcuse.innerHTML = '<i class="bi bi-x-circle me-1"></i> Confirm Decline';
            }
        });
    }

    wireLogout('logoutBtn', '../login.html', token);

    loadSections();
    loadTeacherExcuseNotes();
    setInterval(refresh, 60000); // re-check the session lock every minute
    setInterval(loadTeacherExcuseNotes, 60000); // auto-refresh excuse notes every minute
});

