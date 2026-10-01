document.addEventListener('DOMContentLoaded', () => {
    const { token } = requireSession('login.html');

    function updateDateTime() {
        const liveDateElement = document.getElementById('liveDate');
        const liveTimeElement = document.getElementById('liveTime');
        if (!liveDateElement || !liveTimeElement) return;
        const now = new Date();
        liveDateElement.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        liveTimeElement.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    const teacherSelect = document.getElementById('teacherSelect');
    const subjectSelect = document.getElementById('subjectSelect');
    const strandSelect = document.getElementById('strandSelect');
    const sectionSelect = document.getElementById('sectionSelect');
    const daySelect = document.getElementById('daySelect');
    const quarterSelect = document.getElementById('quarterSelect');
    const startTime = document.getElementById('startTime');
    const endTime = document.getElementById('endTime');
    const startTimeError = document.getElementById('startTimeError');
    const endTimeError = document.getElementById('endTimeError');
    const form = document.getElementById('createScheduleForm');
    const searchInput = document.getElementById('scheduleSearch');
    const tbody = document.getElementById('scheduleTableBody');

    let allSections = [];
    let allSchedules = [];
    let allSubjects = [];
    let allStrands = [];

    // --- Populate dropdowns ---
    async function loadTeachers() {
        try {
            const data = await authedFetch('/api/users?role=teacher&limit=200', token);
            if (data && data.success && Array.isArray(data.users) && data.users.length > 0) {
                teacherSelect.innerHTML = '<option value="" disabled selected>Select Teacher</option>' +
                    data.users.map(t =>
                        `<option value="${t.id}">${t.first_name} ${t.last_name}</option>`
                    ).join('');
            } else {
                teacherSelect.innerHTML = '<option value="" disabled selected>No teachers available</option>';
            }
        } catch (err) {
            console.error('loadTeachers error:', err);
            teacherSelect.innerHTML = '<option value="" disabled selected>Failed to load teachers</option>';
        }
    }

    async function loadStrands() {
        try {
            const data = await authedFetch('/api/reference/strands', token);
            if (data && data.success && Array.isArray(data.strands) && data.strands.length > 0) {
                allStrands = data.strands;
                strandSelect.innerHTML = '<option value="" selected>All Strands / Select Strand</option>' +
                    data.strands.map(s => `<option value="${s.id}">${s.code} - ${s.title || s.name || ''}</option>`).join('');
            } else {
                strandSelect.innerHTML = '<option value="" disabled selected>No strands available</option>';
            }
        } catch (err) {
            console.error('loadStrands error:', err);
            strandSelect.innerHTML = '<option value="" disabled selected>Failed to load strands</option>';
        }
    }

    async function loadSections() {
        try {
            sectionSelect.innerHTML = '<option value="" disabled selected>Loading sections…</option>';
            const data = await authedFetch('/api/reference/sections', token);
            if (data && data.success && Array.isArray(data.sections) && data.sections.length > 0) {
                allSections = data.sections;
                renderSections();
            } else {
                sectionSelect.innerHTML = '<option value="" disabled selected>No sections found</option>';
            }
        } catch (err) {
            console.error('loadSections error:', err);
            sectionSelect.innerHTML = '<option value="" disabled selected>Failed to load sections</option>';
        }
    }

    function renderSections() {
        const selectedStrandId = strandSelect.value;
        const filtered = selectedStrandId
            ? allSections.filter(s => String(s.strand_id) === String(selectedStrandId))
            : allSections;

        if (!filtered.length) {
            sectionSelect.innerHTML = '<option value="" disabled selected>No sections found for this strand</option>';
            return;
        }

        const currentVal = sectionSelect.value;
        sectionSelect.innerHTML = '<option value="" disabled selected>Select Section</option>' +
            filtered.map(s => `<option value="${s.id}">${s.grade_level ? 'Grade ' + s.grade_level + ' - ' : ''}${s.name} (${s.strandCode || ''})</option>`).join('');

        if (currentVal && filtered.some(s => String(s.id) === String(currentVal))) {
            sectionSelect.value = currentVal;
        }
    }

    strandSelect.addEventListener('change', () => {
        renderSections();
        renderSubjects();
    });

    sectionSelect.addEventListener('change', () => {
        const selectedSec = allSections.find(s => String(s.id) === String(sectionSelect.value));
        if (selectedSec && !strandSelect.value) {
            strandSelect.value = String(selectedSec.strand_id);
            renderSections();
            sectionSelect.value = String(selectedSec.id);
        }
        renderSubjects();
    });

    if (quarterSelect) {
        quarterSelect.addEventListener('change', () => {
            renderSubjects();
        });
    }

    async function loadSubjects() {
        try {
            subjectSelect.innerHTML = '<option value="" disabled selected>Loading subjects…</option>';
            const data = await authedFetch('/api/reference/subjects', token);
            if (data && data.success && Array.isArray(data.subjects) && data.subjects.length > 0) {
                allSubjects = data.subjects;
                renderSubjects();
            } else {
                console.warn('loadSubjects returned no subjects:', data);
                subjectSelect.innerHTML = '<option value="" disabled selected>No subjects available</option>';
            }
        } catch (err) {
            console.error('loadSubjects error:', err);
            subjectSelect.innerHTML = '<option value="" disabled selected>Failed to load subjects</option>';
        }
    }

    function matchesTerm(s, termStr) {
        if (!termStr || termStr === 'All Terms') return true;
        const termNum = termStr === '1st Term' ? 1 : (termStr === '2nd Term' ? 2 : (termStr === '3rd Term' ? 3 : 0));
        const sQtr = s.quarter != null ? Number(s.quarter) : null;
        const sTerm = (s.term || s.termLabel || '').toLowerCase();

        // quarter 0 means year-round / all terms
        if (sQtr === 0 || sTerm === 'all terms' || sTerm === 'all') return true;
        if (sQtr !== null && sQtr === termNum) return true;
        if (sTerm.includes(termStr.toLowerCase())) return true;
        return false;
    }

    function matchesGrade(s, grade) {
        if (!grade) return true;
        const sGrade = s.gradeLevel != null ? Number(s.gradeLevel) : (s.grade_level != null ? Number(s.grade_level) : null);
        if (!sGrade) return true;
        return sGrade === grade;
    }

    function renderSubjects() {
        if (!allSubjects.length) {
            subjectSelect.innerHTML = '<option value="" disabled selected>No subjects available</option>';
            return;
        }

        const selectedTerm = quarterSelect ? quarterSelect.value : 'All Terms';
        const selectedStrand = strandSelect.value ? allStrands.find(st => String(st.id) === String(strandSelect.value)) : null;
        const selectedSec = sectionSelect.value ? allSections.find(sc => String(sc.id) === String(sectionSelect.value)) : null;
        const strandCode = selectedStrand ? selectedStrand.code.toUpperCase() : (selectedSec ? (selectedSec.strandCode || '').toUpperCase() : '');
        const gradeLevel = selectedSec ? Number(selectedSec.grade_level) : null;

        const currentVal = subjectSelect.value;

        // Filter subjects by selected Academic Term
        const termFiltered = allSubjects.filter(s => matchesTerm(s, selectedTerm));
        const candidateSubjects = termFiltered.length > 0 ? termFiltered : allSubjects;

        // If no strand or section selected yet, show all subjects for that term
        if (!strandCode && !gradeLevel) {
            subjectSelect.innerHTML = '<option value="" disabled selected>Select Subject</option>' +
                candidateSubjects.map(s => `<option value="${s.id}">${s.name} (${s.strand || 'Core'}${s.term && s.term !== 'All Terms' ? ' - ' + s.term : ''})</option>`).join('');
            if (currentVal && candidateSubjects.some(s => String(s.id) === String(currentVal))) {
                subjectSelect.value = currentVal;
            }
            return;
        }

        const relevant = [];
        const commonCore = [];

        for (const s of candidateSubjects) {
            const gradeMatches = matchesGrade(s, gradeLevel);
            // If section specifies a grade level, only include subjects for that grade level
            if (gradeLevel && !gradeMatches) continue;

            const sStrand = (s.strand || '').toUpperCase();
            const isCommon = sStrand === 'COMMON' || sStrand === 'ALL' || sStrand === '' || (s.strandSection && s.strandSection.includes('All Sections'));

            if (strandCode && sStrand === strandCode) {
                relevant.push(s);
            } else if (isCommon) {
                commonCore.push(s);
            }
            // "Other Track Subjects" are completely excluded to keep the list clean and avoid cross-strand mistakes
        }

        let html = '<option value="" disabled selected>Select Subject</option>';
        if (relevant.length) {
            html += `<optgroup label="${strandCode} Track Subjects (${gradeLevel ? 'Grade ' + gradeLevel : 'Specialized'}${selectedTerm !== 'All Terms' ? ' - ' + selectedTerm : ''})">` +
                relevant.map(s => `<option value="${s.id}">${s.name}</option>`).join('') +
                '</optgroup>';
        }
        if (commonCore.length) {
            html += `<optgroup label="Core & Applied Subjects (${gradeLevel ? 'Grade ' + gradeLevel + ' - ' : ''}${selectedTerm !== 'All Terms' ? selectedTerm : 'All Terms'})">` +
                commonCore.map(s => `<option value="${s.id}">${s.name}</option>`).join('') +
                '</optgroup>';
        }

        if (!relevant.length && !commonCore.length) {
            html += `<optgroup label="${strandCode || 'Selected Track'}"><option value="" disabled>No subjects found for this term</option></optgroup>`;
        }

        subjectSelect.innerHTML = html;
        if (currentVal && (relevant.some(s => String(s.id) === String(currentVal)) || commonCore.some(s => String(s.id) === String(currentVal)))) {
            subjectSelect.value = currentVal;
        }
    }

    // --- Time validation (real, not the crashing original) ---
    function validateTimeInputs() {
        startTimeError.textContent = '';
        endTimeError.textContent = '';
        let valid = true;

        const SCHOOL_OPEN = '07:00';
        const SCHOOL_CLOSE = '15:30';

        if (!startTime.value || !endTime.value) return false;

        if (startTime.value < SCHOOL_OPEN) {
            startTimeError.textContent = 'Cannot start before 7:00 AM.';
            valid = false;
        }
        if (endTime.value > SCHOOL_CLOSE) {
            endTimeError.textContent = 'Cannot end after 3:30 PM.';
            valid = false;
        }
        if (startTime.value >= endTime.value) {
            endTimeError.textContent = 'End time must be after start time.';
            valid = false;
        } else {
            const toMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
            const duration = toMinutes(endTime.value) - toMinutes(startTime.value);
            if (duration < 30) {
                endTimeError.textContent = 'Duration must be at least 30 minutes.';
                valid = false;
            } else if (duration > 120) {
                endTimeError.textContent = 'Duration cannot exceed 2 hours.';
                valid = false;
            }
        }
        return valid;
    }
    startTime.addEventListener('change', validateTimeInputs);
    endTime.addEventListener('change', validateTimeInputs);

    // --- Create schedule ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!teacherSelect.value) {
            alert('Please select a Teacher.');
            teacherSelect.focus();
            return;
        }
        if (!subjectSelect.value) {
            alert('Please select a Subject.');
            subjectSelect.focus();
            return;
        }
        if (!sectionSelect.value) {
            alert('Please select a Section.');
            sectionSelect.focus();
            return;
        }

        if (!validateTimeInputs()) {
            return; // errors already shown inline — this is the fixed version of the original crash
        }

        const days = daySelect.value === 'All Weekdays'
            ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
            : [daySelect.value];

        const data = await authedFetch('/api/schedules', token, {
            method: 'POST',
            body: JSON.stringify({
                teacherId: teacherSelect.value,
                subjectId: subjectSelect.value,
                sectionId: sectionSelect.value,
                quarter: quarterSelect.value,
                days,
                startTime: startTime.value,
                endTime: endTime.value,
            }),
        });

        if (!data.success) {
            alert(data.message);
            return;
        }
        alert(data.message);
        form.reset();
        teacherSelect.value = '';
        strandSelect.value = '';
        renderSections();
        subjectSelect.value = '';
        renderSubjects();
        loadSchedules();
    });

    // --- Master schedule table ---

    function formatTime(t) {
        if (!t) return '';
        const [h, m] = t.split(':');
        const d = new Date();
        d.setHours(Number(h), Number(m));
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }

    function formatDisplayDays(days) {
        if (!days || !days.length) return '—';
        const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const isAllWeekdays = weekdays.every(d => days.includes(d)) && days.length === 5;
        if (isAllWeekdays) return 'Weekdays';

        const isMWF = days.length === 3 && days.includes('Monday') && days.includes('Wednesday') && days.includes('Friday');
        if (isMWF) return 'MWF';

        const isTTH = days.length === 2 && days.includes('Tuesday') && days.includes('Thursday');
        if (isTTH) return 'TTH';

        const isMW = days.length === 2 && days.includes('Monday') && days.includes('Wednesday');
        if (isMW) return 'Mon, Wed';

        const isTF = days.length === 2 && days.includes('Tuesday') && days.includes('Friday');
        if (isTF) return 'Tue, Fri';

        if (days.length === 1) return days[0];

        const shortMap = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };
        return days.map(d => shortMap[d] || d).join(', ');
    }

    function getDayBadgeClass(dayLabel) {
        if (dayLabel === 'Weekdays') return 'bg-success-subtle text-success border border-success-subtle';
        if (dayLabel === 'MWF') return 'bg-primary-subtle text-primary border border-primary-subtle';
        if (dayLabel === 'TTH') return 'bg-info-subtle text-info border border-info-subtle';
        return 'bg-secondary-subtle text-secondary border border-secondary-subtle';
    }

    function groupSchedules(schedules) {
        const groups = [];
        const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

        for (const s of schedules) {
            const key = `${s.teacher}|||${s.subject}|||${s.strand}|||${s.section}|||${s.quarter || ''}|||${s.startTime}|||${s.endTime}`;
            let existing = groups.find(g => g.key === key);
            if (!existing) {
                existing = {
                    key,
                    teacher: s.teacher,
                    subject: s.subject,
                    strand: s.strand,
                    section: s.section,
                    quarter: s.quarter,
                    startTime: s.startTime,
                    endTime: s.endTime,
                    ids: [s.id],
                    days: [s.day]
                };
                groups.push(existing);
            } else {
                existing.ids.push(s.id);
                if (!existing.days.includes(s.day)) {
                    existing.days.push(s.day);
                }
            }
        }

        for (const g of groups) {
            g.days.sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
            g.displayDay = formatDisplayDays(g.days);
        }

        return groups;
    }

    function renderGroupedSchedules(grouped) {
        tbody.innerHTML = '';
        if (!grouped.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No schedules found.</td></tr>';
            return;
        }

        for (const s of grouped) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-3 py-2 fw-medium text-dark">${s.teacher}</td>
                <td class="px-3 py-2">${s.subject}</td>
                <td class="px-3 py-2">${s.strand} - ${s.section}</td>
                <td class="px-3 py-2">${s.quarter || '—'}</td>
                <td class="px-3 py-2">
                    <span class="badge ${getDayBadgeClass(s.displayDay)} px-2.5 py-1 text-xs fw-semibold">${s.displayDay}</span>
                </td>
                <td class="px-3 py-2">${formatTime(s.startTime)} - ${formatTime(s.endTime)}</td>
                <td class="px-3 py-2 text-center">
                    <button class="btn btn-link p-0 text-danger fs-5 btn-delete-schedule" title="Delete Schedule" data-ids="${s.ids.join(',')}">
                        <i class="bi bi-trash3-fill"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        }

        tbody.querySelectorAll('.btn-delete-schedule').forEach(btn => {
            btn.addEventListener('click', async () => {
                const ids = (btn.dataset.ids || '').split(',').filter(Boolean);
                if (!ids.length) return;
                const confirmMsg = ids.length > 1
                    ? `Delete this schedule for all ${ids.length} days?`
                    : 'Delete this schedule entry?';
                if (!confirm(confirmMsg)) return;

                btn.disabled = true;
                const results = await Promise.all(
                    ids.map(id => authedFetch(`/api/schedules/${id}`, token, { method: 'DELETE' }))
                );
                if (results.some(r => r && r.success)) {
                    loadSchedules();
                }
            });
        });
    }

    function filterAndRender() {
        const term = (searchInput ? searchInput.value : '').toLowerCase().trim();
        const grouped = groupSchedules(allSchedules);
        if (!term) {
            renderGroupedSchedules(grouped);
            return;
        }
        const filtered = grouped.filter(g =>
            g.teacher.toLowerCase().includes(term) ||
            g.subject.toLowerCase().includes(term) ||
            g.section.toLowerCase().includes(term) ||
            g.strand.toLowerCase().includes(term) ||
            (g.quarter && g.quarter.toLowerCase().includes(term)) ||
            g.displayDay.toLowerCase().includes(term) ||
            g.days.some(d => d.toLowerCase().includes(term))
        );
        renderGroupedSchedules(filtered);
    }

    async function loadSchedules() {
        const data = await authedFetch('/api/schedules', token);
        allSchedules = data && data.success ? data.schedules : [];
        filterAndRender();
    }

    if (searchInput) {
        searchInput.addEventListener('input', filterAndRender);
    }

    // --- Bulk Import Schedules ---
    const btnDownloadScheduleTemplate = document.getElementById('btnDownloadScheduleTemplate');
    if (btnDownloadScheduleTemplate) {
        btnDownloadScheduleTemplate.addEventListener('click', (e) => {
            e.preventDefault();
            window.open(`${window.MENTORAE_CONFIG.API_BASE_URL}/api/schedules/bulk-import/template?token=${encodeURIComponent(token)}`, '_blank');
        });
    }

    const btnRunBulkImportSchedule = document.getElementById('btnRunBulkImportSchedule');
    if (btnRunBulkImportSchedule) {
        btnRunBulkImportSchedule.addEventListener('click', async () => {
            const fileInput = document.getElementById('bulkScheduleFileInput');
            const progressEl = document.getElementById('bulkScheduleProgress');
            const resultsEl = document.getElementById('bulkScheduleResults');

            const file = fileInput.files[0];
            if (!file) {
                alert('Please choose an Excel or CSV file first.');
                return;
            }

            btnRunBulkImportSchedule.disabled = true;
            btnRunBulkImportSchedule.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Importing...';

            progressEl.innerHTML = `
                <div class="card border border-success-subtle shadow-xs rounded-3 p-3 bg-white mb-2" id="bulkScheduleProgressCard">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="text-xs fw-bold text-uppercase d-flex align-items-center gap-2">
                            <span class="spinner-border spinner-border-sm text-success" id="bulkSchedBarSpinner" role="status" style="width: 14px; height: 14px;"></span>
                            <span id="bulkSchedStageTitle" class="text-dark">Uploading schedule spreadsheet...</span>
                        </span>
                        <span class="text-xs fw-bold text-success" id="bulkSchedPercent">15%</span>
                    </div>
                    <div class="progress" style="height: 10px; border-radius: 6px; background-color: #e9ecef;">
                        <div class="progress-bar progress-bar-striped progress-bar-animated bg-success"
                             id="bulkSchedProgressBar"
                             role="progressbar"
                             style="width: 15%; transition: width 0.3s ease;"
                             aria-valuenow="15" aria-valuemin="0" aria-valuemax="100"></div>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mt-2 text-xs text-muted">
                        <span id="bulkSchedStageDetail">Reading spreadsheet rows...</span>
                        <span class="text-muted"><i class="bi bi-shield-lock me-1"></i>Please keep modal open</span>
                    </div>
                </div>
            `;
            resultsEl.innerHTML = '';

            function setSchedProgressBar(percent, title, detail, isError = false) {
                const bar = document.getElementById('bulkSchedProgressBar');
                const pctEl = document.getElementById('bulkSchedPercent');
                const titleEl = document.getElementById('bulkSchedStageTitle');
                const detailEl = document.getElementById('bulkSchedStageDetail');
                const spinner = document.getElementById('bulkSchedBarSpinner');
                if (bar) {
                    bar.style.width = `${percent}%`;
                    bar.setAttribute('aria-valuenow', percent);
                    if (isError) {
                        bar.classList.remove('bg-success', 'progress-bar-striped', 'progress-bar-animated');
                        bar.classList.add('bg-danger');
                    } else if (percent >= 100) {
                        bar.classList.remove('progress-bar-striped', 'progress-bar-animated');
                        bar.classList.add('bg-success');
                    }
                }
                if (pctEl) {
                    pctEl.textContent = `${percent}%`;
                    pctEl.className = isError ? 'text-xs fw-bold text-danger' : (percent >= 100 ? 'text-xs fw-bold text-success' : 'text-xs fw-bold text-primary');
                }
                if (titleEl) {
                    titleEl.textContent = title;
                    titleEl.className = isError ? 'text-danger fw-bold' : (percent >= 100 ? 'text-success fw-bold' : 'text-dark fw-bold');
                }
                if (detailEl) {
                    detailEl.textContent = detail;
                    detailEl.className = isError ? 'text-danger small' : 'text-muted';
                }
                if (spinner) {
                    if (isError) {
                        spinner.outerHTML = '<i class="bi bi-exclamation-triangle-fill text-danger fs-6" id="bulkSchedBarSpinner"></i>';
                    } else if (percent >= 100) {
                        spinner.outerHTML = '<i class="bi bi-check-circle-fill text-success fs-6" id="bulkSchedBarSpinner"></i>';
                    }
                }
            }

            let currentPct = 15;
            const progressInterval = setInterval(() => {
                if (currentPct < 40) {
                    currentPct += 5;
                    setSchedProgressBar(currentPct, 'Parsing Days, Times & Terms...', 'Validating time formats and weekday definitions...');
                } else if (currentPct < 75) {
                    currentPct += 4;
                    setSchedProgressBar(currentPct, 'Resolving Sections & Teachers...', 'Matching strands, sections, and teacher assignments...');
                } else if (currentPct < 90) {
                    currentPct += 2;
                    setSchedProgressBar(currentPct, 'Saving Schedule Records...', 'Inserting class timetables into database...');
                }
            }, 250);

            const formData = new FormData();
            formData.append('importFile', file);

            try {
                const res = await fetch(`${window.MENTORAE_CONFIG.API_BASE_URL}/api/schedules/bulk-import?token=${encodeURIComponent(token)}`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`
                    },
                    body: formData,
                });
                const data = await res.json();

                clearInterval(progressInterval);

                if (!data.success) {
                    setSchedProgressBar(100, 'Import Failed', data.message || 'Could not import schedules.', true);
                    return;
                }

                setSchedProgressBar(100, 'Import Complete!', data.message || 'Schedules created successfully.');

                if (Array.isArray(data.results) && data.results.length) {
                    resultsEl.innerHTML = data.results.map(r => {
                        let badgeClass = 'bg-danger-subtle text-danger border border-danger-subtle';
                        let icon = '<i class="bi bi-x-circle-fill me-1"></i>';
                        if (r.status === 'created') {
                            badgeClass = 'bg-success-subtle text-success border border-success-subtle';
                            icon = '<i class="bi bi-check-circle-fill me-1"></i>';
                        } else if (r.status === 'partial') {
                            badgeClass = 'bg-warning-subtle text-warning-emphasis border border-warning-subtle';
                            icon = '<i class="bi bi-exclamation-circle-fill me-1"></i>';
                        }

                        return `
                            <div class="p-2.5 mb-2 rounded border bg-light text-sm">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <strong class="text-dark">Row ${r.row}: ${r.name}</strong>
                                    <span class="badge ${badgeClass} px-2 py-1">${icon}${r.status.toUpperCase()}</span>
                                </div>
                                <div class="text-muted small">${r.message}</div>
                            </div>
                        `;
                    }).join('');
                }

                fileInput.value = '';
                loadSchedules();
            } catch (err) {
                clearInterval(progressInterval);
                console.error('Bulk schedule import error:', err);
                setSchedProgressBar(100, 'Import Error', 'Could not connect to the server.', true);
            } finally {
                clearInterval(progressInterval);
                btnRunBulkImportSchedule.disabled = false;
                btnRunBulkImportSchedule.innerHTML = '<i class="bi bi-upload"></i> Start Bulk Import';
            }
        });
    }

    loadTeachers();
    loadStrands();
    loadSections();
    loadSubjects();
    loadSchedules();
});
