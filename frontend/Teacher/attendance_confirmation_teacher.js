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

    async function loadSections() {
        const data = await authedFetch('/api/classes/my-sections', token);
        if (!data.success || !data.sections.length) {
            sectionFilter.innerHTML = '<option>No sections assigned</option>';
            return;
        }

        const advisory = data.sections.filter(s => Boolean(s.isAdvisory));
        const subjects = data.sections.filter(s => !Boolean(s.isAdvisory));

        let html = '';
        if (advisory.length) {
            html += `<optgroup label="⭐ My Advisory Class">`;
            advisory.forEach(s => {
                const subText = s.subjectsTaught ? ` — ${s.subjectsTaught}` : '';
                html += `<option value="${s.id}" data-advisory="1" data-subjects="${s.subjectsTaught || ''}">
                    ⭐ ${s.name} (Grade ${s.grade_level}-${s.strandCode})${subText}
                </option>`;
            });
            html += `</optgroup>`;
        }

        if (subjects.length) {
            html += `<optgroup label="📚 Subject Classes Handled">`;
            subjects.forEach(s => {
                const subText = s.subjectsTaught ? ` — ${s.subjectsTaught}` : '';
                html += `<option value="${s.id}" data-advisory="0" data-subjects="${s.subjectsTaught || ''}">
                    ${s.name} (Grade ${s.grade_level}-${s.strandCode})${subText}
                </option>`;
            });
            html += `</optgroup>`;
        }

        sectionFilter.innerHTML = html;
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
        const selectedOpt = sectionFilter.options[sectionFilter.selectedIndex];
        const subjectsTaught = selectedOpt?.dataset.subjects;

        if (sectionTypeBadgeWrap) {
            if (isAdvisory) {
                const advisorySubNote = subjectsTaught ? ` &bull; Taught: ${subjectsTaught}` : '';
                sectionTypeBadgeWrap.innerHTML = `
                    <div class="section-mode-pill">
                        <span class="pill-tag bg-success text-white shadow-sm">
                            <i class="bi bi-star-fill text-warning"></i> Advisory Class
                        </span>
                        <span class="pill-desc">Daily Time In &amp; Time Out${advisorySubNote}</span>
                    </div>
                `;
            } else {
                const subjectLabel = subjectsTaught ? `Taught: ${subjectsTaught}` : 'Period Attendance Only';
                sectionTypeBadgeWrap.innerHTML = `
                    <div class="section-mode-pill">
                        <span class="pill-tag bg-primary text-white shadow-sm">
                            <i class="bi bi-book-half"></i> Subject Class Handled
                        </span>
                        <span class="pill-desc">${subjectLabel}</span>
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
        const sectionId = sectionFilter.value;
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

    wireLogout('logoutBtn', '../login.html', token);

    loadSections();
    setInterval(refresh, 60000); // re-check the session lock every minute
});
