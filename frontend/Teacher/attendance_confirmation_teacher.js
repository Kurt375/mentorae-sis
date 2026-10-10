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

    if (closeFinishBannerBtn) {
        closeFinishBannerBtn.addEventListener('click', () => {
            if (finishBanner) finishBanner.classList.add('d-none');
        });
    }

    let currentRoster = [];
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
        renderRoster(currentRoster);

        if (data.allTimeOutsConfirmed) {
            setFinishedButtonState();
        } else {
            resetFinishButton();
        }
        markAttendanceSeen();
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

                let outContent = '—';
                if (s.timeOut) {
                    const outLabel = (s.timeOutStatus === 'excused' ? 'Left early' : 'Out') + ` (${s.timeOut.slice(0, 5)})`;
                    const badgeClass = outBadgeClass[s.timeOutStatus] || 'bg-secondary-subtle text-secondary';
                    const confirmedBadge = `<span class="badge bg-success-subtle text-success border border-success-subtle py-1 px-2" title="Time-out confirmed"><i class="bi bi-check-circle-fill me-1"></i>Confirmed</span>`;
                    const confirmBtn = `<button class="btn btn-sm btn-outline-primary py-0 px-2 confirm-out-btn" data-id="${s.id}" ${sessionAllowed ? '' : 'disabled'}>Confirm</button>`;

                    outContent = `
                        <div class="d-inline-flex align-items-center justify-content-center gap-1 flex-wrap">
                            <span class="badge ${badgeClass}" id="out-${s.id}">${outLabel}</span>
                            ${s.timeOutConfirmed ? confirmedBadge : confirmBtn}
                        </div>
                    `;
                }
                timeOutCell = `
                    <td class="px-4 py-3 text-center">
                        ${outContent}
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

        // Sync bottom daily history table
        loadDailyHistory();
        markAttendanceSeen();
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
        await loadDailyHistory();
    }

    sectionFilter.addEventListener('change', () => {
        if (finishBanner) finishBanner.classList.add('d-none');
        resetFinishButton();
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
                const term = searchBar.value.toLowerCase();
                if (term) {
                    renderRoster(currentRoster.filter(s =>
                        s.name.toLowerCase().includes(term) ||
                        s.idNumber.toLowerCase().includes(term) ||
                        s.strand.toLowerCase().includes(term) ||
                        s.status.toLowerCase().includes(term)
                    ));
                } else {
                    renderRoster(currentRoster);
                }

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
                    <td class="px-4 py-3">${r.idNumber}</td>
                    <td class="px-4 py-3 fw-medium">${r.name}</td>
                    <td class="px-4 py-3">${r.strand} - ${r.section}</td>
                    <td class="px-4 py-3 text-center font-monospace small">${formattedDate}</td>
                    <td class="px-4 py-3 text-center"><span class="badge ${r.timeIn ? 'bg-light text-dark border' : 'bg-secondary-subtle text-secondary'} font-monospace">${timeInFormatted}</span></td>
                    <td class="px-4 py-3 text-center">${timeOutHtml}</td>
                    <td class="px-4 py-3 text-center">${statusBadge}</td>
                    <td class="px-4 py-3 text-center">${verifierHtml}</td>
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

                    ${reviewInfoHtml}
                    ${actionsHtml}
                </div>
            `;
        }).join('');

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

