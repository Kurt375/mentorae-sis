document.addEventListener('DOMContentLoaded', () => {
    const { token } = requireSession('login.html');

    function escapeHtml(str) {
        if (!str && str !== 0) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

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

    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    const btnAddStrand = document.getElementById('btnAddStrand');
    const btnAddSection = document.getElementById('btnAddSection');
    const btnArchiveLogs = document.getElementById('btnArchiveLogs');
    const dbSearchInput = document.getElementById('dbSearchInput');
    const dbDynamicFiltersContainer = document.getElementById('dbDynamicFiltersContainer');
    let currentCategoryRecords = [];
    let currentCategoryHeaders = [];

    const categoryNavButtons = {
        students: document.getElementById('tabBtnStudents'),
        subjects: document.getElementById('tabBtnSubjects'),
        strands: document.getElementById('tabBtnStrands'),
        sections: document.getElementById('tabBtnSections'),
        'login-logs': document.getElementById('tabBtnLoginLogs'),
    };

    // Modals
    const modalAddStrandEl = document.getElementById('modalAddStrand');
    const modalAddStrand = modalAddStrandEl && typeof bootstrap !== 'undefined' ? new bootstrap.Modal(modalAddStrandEl) : null;

    const modalEditStrandEl = document.getElementById('modalEditStrand');
    const modalEditStrand = modalEditStrandEl && typeof bootstrap !== 'undefined' ? new bootstrap.Modal(modalEditStrandEl) : null;

    const modalDeleteStrandEl = document.getElementById('modalDeleteStrand');
    const modalDeleteStrand = modalDeleteStrandEl && typeof bootstrap !== 'undefined' ? new bootstrap.Modal(modalDeleteStrandEl) : null;

    const modalAddSectionEl = document.getElementById('modalAddSection');
    const modalAddSection = modalAddSectionEl && typeof bootstrap !== 'undefined' ? new bootstrap.Modal(modalAddSectionEl) : null;

    const modalEditSectionEl = document.getElementById('modalEditSection');
    const modalEditSection = modalEditSectionEl && typeof bootstrap !== 'undefined' ? new bootstrap.Modal(modalEditSectionEl) : null;

    const modalDeleteSectionEl = document.getElementById('modalDeleteSection');
    const modalDeleteSection = modalDeleteSectionEl && typeof bootstrap !== 'undefined' ? new bootstrap.Modal(modalDeleteSectionEl) : null;

    const modalArchiveLogsEl = document.getElementById('modalArchiveLogs');
    const modalArchiveLogs = modalArchiveLogsEl && typeof bootstrap !== 'undefined' ? new bootstrap.Modal(modalArchiveLogsEl) : null;
    const archiveRetentionDays = document.getElementById('archiveRetentionDays');
    const archiveFileFormat = document.getElementById('archiveFileFormat');
    const archiveEligibleCount = document.getElementById('archiveEligibleCount');
    const archiveCutoffText = document.getElementById('archiveCutoffText');
    const archiveCustomFileName = document.getElementById('archiveCustomFileName');
    const btnDownloadArchiveOnly = document.getElementById('btnDownloadArchiveOnly');
    const btnDownloadAndPurge = document.getElementById('btnDownloadAndPurge');

    let currentCategory = 'students';
    let strandToDeleteId = null;
    let sectionToDeleteId = null;
    let cachedStrands = [];
    let cachedAdvisers = [];
    let cachedSections = [];

    async function loadSectionDropdownOptions() {
        try {
            const [strandsRes, advRes, secRes] = await Promise.all([
                authedFetch('/api/database/strands', token),
                authedFetch('/api/database/advisers', token),
                authedFetch('/api/database/sections', token)
            ]);
            if (strandsRes && strandsRes.success) cachedStrands = strandsRes.records || [];
            if (advRes && advRes.success) cachedAdvisers = advRes.advisers || [];
            if (secRes && secRes.success) cachedSections = secRes.records || [];
        } catch (err) {
            console.error('Error loading section dropdown options:', err);
        }

        const strandOptions = '<option value="" disabled selected>— Select Strand —</option>' +
            cachedStrands.map(s => `<option value="${s.id}">${escapeHtml(s.code || s.f1)} - ${escapeHtml(s.title || s.f2)}</option>`).join('');

        const adviserOptions = '<option value="">— Unassigned / None —</option>' +
            cachedAdvisers.map(a => `<option value="${a.id}">${escapeHtml(a.name)} (${escapeHtml(a.idNumber || a.email)})</option>`).join('');

        const addStrandSel = document.getElementById('addSectionStrand');
        if (addStrandSel) addStrandSel.innerHTML = strandOptions;

        const addAdvSel = document.getElementById('addSectionAdviser');
        if (addAdvSel) addAdvSel.innerHTML = adviserOptions;

        const editStrandSel = document.getElementById('editSectionStrand');
        if (editStrandSel) editStrandSel.innerHTML = strandOptions;

        const editAdvSel = document.getElementById('editSectionAdviser');
        if (editAdvSel) editAdvSel.innerHTML = adviserOptions;
    }

    function setupCategoryFilters(category) {
        if (!dbDynamicFiltersContainer) return;
        const searchWrapper = document.getElementById('dbSearchWrapper');
        const filtersRow = document.getElementById('dbFiltersRow');

        if (category === 'students') {
            if (filtersRow) {
                filtersRow.classList.add('flex-wrap');
                filtersRow.classList.remove('flex-nowrap');
            }
            if (searchWrapper) {
                searchWrapper.classList.add('w-100', 'mb-2');
                searchWrapper.classList.remove('flex-grow-1');
            }
            dbDynamicFiltersContainer.className = 'w-100 d-flex align-items-center gap-2 flex-wrap flex-md-nowrap';
        } else {
            if (filtersRow) {
                filtersRow.classList.remove('flex-wrap');
                filtersRow.classList.add('flex-nowrap');
            }
            if (searchWrapper) {
                searchWrapper.classList.remove('w-100', 'mb-2');
                searchWrapper.classList.add('flex-grow-1');
            }
            dbDynamicFiltersContainer.className = 'd-flex align-items-center gap-2 flex-nowrap flex-shrink-0';
        }

        let html = '';
        if (category === 'students') {
            // Strand options
            let strandOpts = '<option value="">All Strands</option>';
            const strandList = cachedStrands.length
                ? cachedStrands.map(s => s.code || s.f1)
                : [...new Set(currentCategoryRecords.map(r => r.strandCode || r.f3).filter(Boolean))];
            [...new Set(strandList)].sort().forEach(code => {
                strandOpts += `<option value="${escapeHtml(code)}">${escapeHtml(code)}</option>`;
            });

            // Year of class options
            let yearOpts = '<option value="">All Class Years</option>';
            const detectedYears = [...new Set(currentCategoryRecords.map(r => r.yearOfClass).filter(Boolean))];
            if (!detectedYears.includes('2026 - 2027')) detectedYears.unshift('2026 - 2027');
            if (!detectedYears.includes('2025 - 2026')) detectedYears.push('2025 - 2026');
            if (!detectedYears.includes('2024 - 2025')) detectedYears.push('2024 - 2025');
            detectedYears.forEach(yr => {
                yearOpts += `<option value="${escapeHtml(yr)}">${escapeHtml(yr)}</option>`;
            });

            // Grade options
            const gradeOpts = `
                <option value="">All Grade Levels</option>
                <option value="11">Grade 11</option>
                <option value="12">Grade 12</option>
            `;

            // Section options
            let secOpts = '<option value="">All Sections</option>';
            const secList = cachedSections.length
                ? cachedSections.map(s => s.name || s.f1)
                : [...new Set(currentCategoryRecords.map(r => r.sectionName).filter(Boolean))];
            [...new Set(secList)].sort().forEach(sec => {
                secOpts += `<option value="${escapeHtml(sec)}">${escapeHtml(sec)}</option>`;
            });

            html = `
                <div class="input-group shadow-sm rounded-3 overflow-hidden bg-white border db-student-filter-item">
                    <span class="input-group-text bg-white border-0 text-muted ps-2.5 pe-1"><i class="bi bi-funnel"></i></span>
                    <select class="form-select border-0 py-2 text-sm" id="filterStudentStrand" title="Filter by Strand">
                        ${strandOpts}
                    </select>
                </div>
                <div class="input-group shadow-sm rounded-3 overflow-hidden bg-white border db-student-filter-item">
                    <span class="input-group-text bg-white border-0 text-muted ps-2.5 pe-1"><i class="bi bi-calendar3"></i></span>
                    <select class="form-select border-0 py-2 text-sm" id="filterStudentYear" title="Filter by Year of Class">
                        ${yearOpts}
                    </select>
                </div>
                <div class="input-group shadow-sm rounded-3 overflow-hidden bg-white border db-student-filter-item">
                    <span class="input-group-text bg-white border-0 text-muted ps-2.5 pe-1"><i class="bi bi-bar-chart-steps"></i></span>
                    <select class="form-select border-0 py-2 text-sm" id="filterStudentGrade" title="Filter by Grade Level">
                        ${gradeOpts}
                    </select>
                </div>
                <div class="input-group shadow-sm rounded-3 overflow-hidden bg-white border db-student-filter-item">
                    <span class="input-group-text bg-white border-0 text-muted ps-2.5 pe-1"><i class="bi bi-diagram-3"></i></span>
                    <select class="form-select border-0 py-2 text-sm" id="filterStudentSection" title="Filter by Section">
                        ${secOpts}
                    </select>
                </div>
            `;
        } else if (category === 'subjects') {
            html = `
                <div class="input-group shadow-sm rounded-3 overflow-hidden bg-white border db-filter-item">
                    <span class="input-group-text bg-white border-0 text-muted ps-2.5 pe-1"><i class="bi bi-tags"></i></span>
                    <select class="form-select border-0 py-2 text-sm" id="filterSubjectCategory" title="Filter by Subject Category">
                        <option value="">All Subject Categories</option>
                        <option value="Core">Core Subject</option>
                        <option value="Applied">Applied Subject</option>
                        <option value="Specialized">Specialized Subject</option>
                        <option value="Institutional">Institutional / Other</option>
                    </select>
                </div>
                <div class="input-group shadow-sm rounded-3 overflow-hidden bg-white border db-filter-item">
                    <span class="input-group-text bg-white border-0 text-muted ps-2.5 pe-1"><i class="bi bi-calendar2-range"></i></span>
                    <select class="form-select border-0 py-2 text-sm" id="filterSubjectTerm" title="Filter by Term">
                        <option value="">All Terms</option>
                        <option value="1st Term">1st Term</option>
                        <option value="2nd Term">2nd Term</option>
                        <option value="3rd Term">3rd Term</option>
                    </select>
                </div>
            `;
        } else if (category === 'strands') {
            html = `
                <div class="input-group shadow-sm rounded-3 overflow-hidden bg-white border db-filter-item">
                    <span class="input-group-text bg-white border-0 text-muted ps-2.5 pe-1"><i class="bi bi-layers"></i></span>
                    <select class="form-select border-0 py-2 text-sm" id="filterStrandTrack" title="Filter by Track">
                        <option value="">All Tracks</option>
                        <option value="Academic Track">Academic Track</option>
                        <option value="TVL Track">TVL Track</option>
                        <option value="Sports Track">Sports Track</option>
                    </select>
                </div>
            `;
        } else if (category === 'sections') {
            let strandOpts = '<option value="">All Strands</option>';
            const strandList = cachedStrands.length
                ? cachedStrands.map(s => s.code || s.f1)
                : [...new Set(currentCategoryRecords.map(r => r.strandCode || (r.f2 ? r.f2.split(' - ')[0] : '')).filter(Boolean))];
            [...new Set(strandList)].sort().forEach(code => {
                strandOpts += `<option value="${escapeHtml(code)}">${escapeHtml(code)}</option>`;
            });

            html = `
                <div class="input-group shadow-sm rounded-3 overflow-hidden bg-white border db-filter-item">
                    <span class="input-group-text bg-white border-0 text-muted ps-2.5 pe-1"><i class="bi bi-funnel"></i></span>
                    <select class="form-select border-0 py-2 text-sm" id="filterSectionStrand" title="Filter by Strand">
                        ${strandOpts}
                    </select>
                </div>
                <div class="input-group shadow-sm rounded-3 overflow-hidden bg-white border db-filter-item">
                    <span class="input-group-text bg-white border-0 text-muted ps-2.5 pe-1"><i class="bi bi-bar-chart-steps"></i></span>
                    <select class="form-select border-0 py-2 text-sm" id="filterSectionGrade" title="Filter by Grade Level">
                        <option value="">All Grade Levels</option>
                        <option value="11">Grade 11</option>
                        <option value="12">Grade 12</option>
                    </select>
                </div>
            `;
        } else if (category === 'login-logs') {
            html = `
                <div class="input-group shadow-sm rounded-3 overflow-hidden bg-white border db-filter-item">
                    <span class="input-group-text bg-white border-0 text-muted ps-2.5 pe-1"><i class="bi bi-person-badge"></i></span>
                    <select class="form-select border-0 py-2 text-sm" id="filterLogRole" title="Filter by Role">
                        <option value="">All Roles</option>
                        <option value="ADMIN">Admin</option>
                        <option value="TEACHER">Teacher</option>
                        <option value="STUDENT">Student</option>
                        <option value="PARENT">Parent</option>
                        <option value="EXTERNAL / GUEST">External / Guest</option>
                    </select>
                </div>
                <div class="input-group shadow-sm rounded-3 overflow-hidden bg-white border db-filter-item">
                    <span class="input-group-text bg-white border-0 text-muted ps-2.5 pe-1"><i class="bi bi-shield-check"></i></span>
                    <select class="form-select border-0 py-2 text-sm" id="filterLogStatus" title="Filter by Status">
                        <option value="">All Statuses</option>
                        <option value="Success">Success</option>
                        <option value="Failed Attempt">Failed Attempt</option>
                    </select>
                </div>
            `;
        }

        dbDynamicFiltersContainer.innerHTML = html;

        dbDynamicFiltersContainer.querySelectorAll('select').forEach(sel => {
            sel.addEventListener('change', () => {
                if (category === 'students' && (sel.id === 'filterStudentStrand' || sel.id === 'filterStudentGrade')) {
                    syncStudentSections();
                }
                renderCurrentCategoryRows();
            });
        });
    }

    function syncStudentSections() {
        const strandEl = document.getElementById('filterStudentStrand');
        const gradeEl = document.getElementById('filterStudentGrade');
        const secEl = document.getElementById('filterStudentSection');
        if (!secEl) return;

        const selStrand = strandEl ? strandEl.value : '';
        const selGrade = gradeEl ? gradeEl.value : '';
        const currentSecVal = secEl.value;

        let filteredSecs = cachedSections;
        if (selStrand) {
            filteredSecs = filteredSecs.filter(s => (s.strandCode === selStrand || (s.f2 && s.f2.includes(selStrand))));
        }
        if (selGrade) {
            filteredSecs = filteredSecs.filter(s => String(s.gradeLevel || s.grade_level) === selGrade);
        }

        let opts = '<option value="">All Sections</option>';
        filteredSecs.forEach(s => {
            const name = s.name || s.f1;
            opts += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
        });
        secEl.innerHTML = opts;
        if (currentSecVal && filteredSecs.some(s => (s.name || s.f1) === currentSecVal)) {
            secEl.value = currentSecVal;
        }
    }

    async function renderTable(category) {
        currentCategory = category;
        Object.values(categoryNavButtons).forEach(btn => {
            if (btn) btn.classList.remove('active');
        });
        if (categoryNavButtons[category]) categoryNavButtons[category].classList.add('active');

        if (btnAddStrand) {
            if (category === 'strands') {
                btnAddStrand.classList.remove('d-none');
            } else {
                btnAddStrand.classList.add('d-none');
            }
        }

        if (btnAddSection) {
            if (category === 'sections') {
                btnAddSection.classList.remove('d-none');
            } else {
                btnAddSection.classList.add('d-none');
            }
        }

        if (btnArchiveLogs) {
            if (category === 'login-logs') {
                btnArchiveLogs.classList.remove('d-none');
            } else {
                btnArchiveLogs.classList.add('d-none');
            }
        }

        // Configure contextual search placeholder
        if (dbSearchInput) {
            dbSearchInput.value = '';
            if (category === 'students') {
                dbSearchInput.placeholder = 'Search students by name, ID, strand, email...';
            } else if (category === 'subjects') {
                dbSearchInput.placeholder = 'Search subjects by code, name, strand, term...';
            } else if (category === 'strands') {
                dbSearchInput.placeholder = 'Search strands by code, title, track...';
            } else if (category === 'sections') {
                dbSearchInput.placeholder = 'Search sections by name, strand, adviser...';
            } else if (category === 'login-logs') {
                dbSearchInput.placeholder = 'Search logs by user, role, IP, date...';
            }
        }

        const data = await authedFetch(`/api/database/${category}`, token);
        if (!data.success) {
            tableBody.innerHTML = `<tr><td class="text-center text-muted py-4">${escapeHtml(data.message)}</td></tr>`;
            return;
        }

        currentCategoryRecords = data.records || [];
        currentCategoryHeaders = data.headers || [];

        setupCategoryFilters(category);
        renderCurrentCategoryRows();

        const countEl = { students: 'studentsCountVal', subjects: 'subjectsCountVal', strands: 'strandsCountVal', sections: 'sectionsCountVal', 'login-logs': 'loginLogsCountVal' }[category];
        if (countEl && document.getElementById(countEl)) {
            document.getElementById(countEl).textContent = currentCategoryRecords.length;
        }
    }

    function renderCurrentCategoryRows() {
        const isStrands = currentCategory === 'strands';
        const isSections = currentCategory === 'sections';
        const hasActions = isStrands || isSections;
        const headersHtml = currentCategoryHeaders.map(h => `<th class="px-3 py-2.5">${escapeHtml(h)}</th>`).join('');
        tableHead.innerHTML = `<tr class="table-header-row text-white">${headersHtml}${hasActions ? '<th class="px-3 py-2.5 text-end">Actions</th>' : ''}</tr>`;

        if (!currentCategoryRecords.length) {
            const colSpan = currentCategoryHeaders.length + (hasActions ? 1 : 0);
            tableBody.innerHTML = `<tr><td colspan="${colSpan}" class="text-center text-muted py-4">No records yet.</td></tr>`;
            return;
        }

        const q = dbSearchInput ? dbSearchInput.value.trim().toLowerCase() : '';

        let studentStrand = '';
        let studentYear = '';
        let studentGrade = '';
        let studentSection = '';

        let subjectCategory = '';
        let subjectTerm = '';

        let strandTrack = '';

        let sectionStrand = '';
        let sectionGrade = '';

        let logRole = '';
        let logStatus = '';

        if (currentCategory === 'students') {
            const elStrand = document.getElementById('filterStudentStrand');
            const elYear = document.getElementById('filterStudentYear');
            const elGrade = document.getElementById('filterStudentGrade');
            const elSection = document.getElementById('filterStudentSection');
            if (elStrand) studentStrand = elStrand.value;
            if (elYear) studentYear = elYear.value;
            if (elGrade) studentGrade = elGrade.value;
            if (elSection) studentSection = elSection.value;
        } else if (currentCategory === 'subjects') {
            const elCat = document.getElementById('filterSubjectCategory');
            const elTerm = document.getElementById('filterSubjectTerm');
            if (elCat) subjectCategory = elCat.value;
            if (elTerm) subjectTerm = elTerm.value;
        } else if (currentCategory === 'strands') {
            const elTrack = document.getElementById('filterStrandTrack');
            if (elTrack) strandTrack = elTrack.value;
        } else if (currentCategory === 'sections') {
            const elStrand = document.getElementById('filterSectionStrand');
            const elGrade = document.getElementById('filterSectionGrade');
            if (elStrand) sectionStrand = elStrand.value;
            if (elGrade) sectionGrade = elGrade.value;
        } else if (currentCategory === 'login-logs') {
            const elRole = document.getElementById('filterLogRole');
            const elStatus = document.getElementById('filterLogStatus');
            if (elRole) logRole = elRole.value;
            if (elStatus) logStatus = elStatus.value;
        }

        const filtered = currentCategoryRecords.filter(r => {
            if (currentCategory === 'students') {
                if (studentStrand && (r.strandCode || r.f3) !== studentStrand) return false;
                if (studentYear && (r.yearOfClass || '') !== studentYear && !(r.yearOfClass || '').includes(studentYear) && !studentYear.includes(r.yearOfClass || '')) return false;
                if (studentGrade && String(r.gradeLevel || '') !== studentGrade) return false;
                if (studentSection && (r.sectionName || '') !== studentSection && !(r.sectionName || '').toLowerCase().includes(studentSection.toLowerCase())) return false;
            } else if (currentCategory === 'subjects') {
                if (subjectCategory) {
                    const c = (r.classification || r.f3 || '').toLowerCase();
                    if (subjectCategory === 'Core' && !c.includes('core')) return false;
                    if (subjectCategory === 'Applied' && !c.includes('applied')) return false;
                    if (subjectCategory === 'Specialized' && !c.includes('specialized')) return false;
                    if (subjectCategory === 'Institutional' && (c.includes('core') || c.includes('applied') || c.includes('specialized'))) return false;
                }
                if (subjectTerm && (r.f4 || '') !== subjectTerm && !(r.f4 || '').includes(subjectTerm)) return false;
            } else if (currentCategory === 'strands') {
                if (strandTrack && (r.department || r.f3) !== strandTrack) return false;
            } else if (currentCategory === 'sections') {
                if (sectionStrand && (r.strandCode || '') !== sectionStrand && !(r.f2 || '').includes(sectionStrand)) return false;
                if (sectionGrade && String(r.gradeLevel || '') !== sectionGrade && !(r.f3 || '').includes(sectionGrade)) return false;
            } else if (currentCategory === 'login-logs') {
                if (logRole && (r.role || r.f2) !== logRole) return false;
                if (logStatus) {
                    const isSuccess = r.success === true || r.status === 'Success';
                    if (logStatus === 'Success' && !isSuccess) return false;
                    if (logStatus === 'Failed Attempt' && isSuccess) return false;
                }
            }

            if (q) {
                const combined = Object.values(r)
                    .filter(v => v !== null && v !== undefined && (typeof v === 'string' || typeof v === 'number'))
                    .join(' ')
                    .toLowerCase();
                if (!combined.includes(q)) return false;
            }
            return true;
        });

        if (!filtered.length) {
            const colSpan = currentCategoryHeaders.length + (hasActions ? 1 : 0);
            tableBody.innerHTML = `<tr><td colspan="${colSpan}" class="text-center text-muted py-4"><i class="bi bi-search me-1"></i> No matching records found.</td></tr>`;
            return;
        }


        if (isStrands) {
            tableBody.innerHTML = filtered.map(r => `
                <tr>
                    <td class="px-3 py-2 fw-semibold text-dark">${escapeHtml(r.f1 || r.code)}</td>
                    <td class="px-3 py-2">${escapeHtml(r.f2 || r.title)}</td>
                    <td class="px-3 py-2"><span class="badge bg-light text-dark border">${escapeHtml(r.f3 || r.department)}</span></td>
                    <td class="px-3 py-2">${escapeHtml(r.f4)}</td>
                    <td class="px-3 py-2 text-end text-nowrap">
                        <button type="button" class="btn btn-outline-primary btn-sm py-1 px-2.5 btn-edit-strand me-1"
                            data-id="${r.id}"
                            data-code="${escapeHtml(r.code || r.f1)}"
                            data-title="${escapeHtml(r.title || r.f2)}"
                            data-department="${escapeHtml(r.department || r.f3)}">
                            <i class="bi bi-pencil-square"></i> Edit
                        </button>
                        <button type="button" class="btn btn-outline-danger btn-sm py-1 px-2.5 btn-delete-strand"
                            data-id="${r.id}"
                            data-code="${escapeHtml(r.code || r.f1)}"
                            data-title="${escapeHtml(r.title || r.f2)}"
                            data-enrollees="${r.enrollees || 0}">
                            <i class="bi bi-trash"></i> Delete
                        </button>
                    </td>
                </tr>
            `).join('');

            attachStrandRowEvents();
        } else if (isSections) {
            tableBody.innerHTML = filtered.map(r => `
                <tr>
                    <td class="px-3 py-2 fw-semibold text-dark">${escapeHtml(r.f1 || r.name)}</td>
                    <td class="px-3 py-2"><span class="badge bg-light text-dark border">${escapeHtml(r.f2 || r.strandCode)}</span></td>
                    <td class="px-3 py-2"><span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1">${escapeHtml(r.f3 || ('Grade ' + r.gradeLevel))}</span></td>
                    <td class="px-3 py-2">
                        ${r.adviserName && r.adviserName !== 'Unassigned'
                    ? `<i class="bi bi-person-badge text-primary me-1"></i>${escapeHtml(r.adviserName)}`
                    : '<span class="text-muted fst-italic">Unassigned</span>'}
                    </td>
                    <td class="px-3 py-2 fw-semibold">${escapeHtml(r.f5 || (r.enrollees + ' Students'))}</td>
                    <td class="px-3 py-2 text-end text-nowrap">
                        <button type="button" class="btn btn-outline-primary btn-sm py-1 px-2.5 btn-edit-section me-1"
                            data-id="${r.id}"
                            data-name="${escapeHtml(r.name || r.f1)}"
                            data-strand-id="${r.strandId || ''}"
                            data-grade-level="${r.gradeLevel || ''}"
                            data-adviser-id="${r.adviserId || ''}">
                            <i class="bi bi-pencil-square"></i> Edit
                        </button>
                        <button type="button" class="btn btn-outline-danger btn-sm py-1 px-2.5 btn-delete-section"
                            data-id="${r.id}"
                            data-name="${escapeHtml(r.name || r.f1)}"
                            data-enrollees="${r.enrollees || 0}">
                            <i class="bi bi-trash"></i> Delete
                        </button>
                    </td>
                </tr>
            `).join('');

            attachSectionRowEvents();
        } else if (currentCategory === 'login-logs') {
            tableBody.innerHTML = filtered.map(r => {
                const isSuccess = r.success === true || r.status === 'Success';
                const statusBadge = isSuccess
                    ? '<span class="badge bg-success-subtle text-success border border-success-subtle fw-semibold px-2 py-1"><i class="bi bi-check-circle-fill me-1"></i>Success</span>'
                    : '<span class="badge bg-danger-subtle text-danger border border-danger-subtle fw-semibold px-2 py-1"><i class="bi bi-x-circle-fill me-1"></i>Failed Attempt</span>';

                let roleBadgeClass = 'bg-secondary-subtle text-secondary';
                if (r.role === 'ADMIN') roleBadgeClass = 'bg-primary-subtle text-primary border border-primary-subtle';
                else if (r.role === 'TEACHER') roleBadgeClass = 'bg-success-subtle text-success border border-success-subtle';
                else if (r.role === 'STUDENT') roleBadgeClass = 'bg-info-subtle text-info border border-info-subtle';
                else if (r.role === 'PARENT') roleBadgeClass = 'bg-warning-subtle text-dark border border-warning-subtle';

                return `
                    <tr>
                        <td class="px-3 py-2 fw-semibold text-dark">
                            <div>${escapeHtml(r.f1 || r.user)}</div>
                        </td>
                        <td class="px-3 py-2">
                            <span class="badge ${roleBadgeClass} px-2 py-1" style="font-size: 0.75rem;">${escapeHtml(r.f2 || r.role)}</span>
                        </td>
                        <td class="px-3 py-2">${statusBadge}</td>
                        <td class="px-3 py-2"><code class="small text-muted">${escapeHtml(r.f4 || r.ip)}</code></td>
                        <td class="px-3 py-2 text-muted small">${escapeHtml(r.f5 || r.timestamp)}</td>
                    </tr>
                `;
            }).join('');
        } else if (currentCategory === 'subjects') {
            tableBody.innerHTML = filtered.map(r => {
                let badgeClass = 'bg-primary-subtle text-primary border border-primary-subtle';
                if (r.f4 === 'All Terms') badgeClass = 'bg-secondary-subtle text-secondary border border-secondary-subtle';
                else if (r.f4 === '2nd Term') badgeClass = 'bg-info-subtle text-info border border-info-subtle';
                else if (r.f4 === '3rd Term') badgeClass = 'bg-warning-subtle text-dark border border-warning-subtle';

                return `
                    <tr>
                        <td class="px-3 py-2 fw-semibold text-dark">${escapeHtml(r.f1)}</td>
                        <td class="px-3 py-2">${escapeHtml(r.f2)}</td>
                        <td class="px-3 py-2"><span class="badge bg-light text-dark border">${escapeHtml(r.f3)}</span></td>
                        <td class="px-3 py-2"><span class="badge ${badgeClass} px-2 py-1 rounded-pill">${escapeHtml(r.f4)}</span></td>
                    </tr>
                `;
            }).join('');
        } else {
            tableBody.innerHTML = filtered.map(r => `
                <tr>
                    <td class="px-3 py-2">${escapeHtml(r.f1)}</td>
                    <td class="px-3 py-2">${escapeHtml(r.f2)}</td>
                    <td class="px-3 py-2">${escapeHtml(r.f3)}</td>
                    <td class="px-3 py-2">${escapeHtml(r.f4)}</td>
                </tr>
            `).join('');
        }
    }

    function attachStrandRowEvents() {
        document.querySelectorAll('.btn-edit-strand').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const code = btn.dataset.code;
                const title = btn.dataset.title;
                const dept = btn.dataset.department;

                document.getElementById('editStrandId').value = id;
                document.getElementById('editStrandCode').value = code;
                document.getElementById('editStrandTitle').value = title;
                document.getElementById('editStrandDepartment').value = dept;

                if (modalEditStrand) modalEditStrand.show();
            });
        });

        document.querySelectorAll('.btn-delete-strand').forEach(btn => {
            btn.addEventListener('click', () => {
                strandToDeleteId = btn.dataset.id;
                const code = btn.dataset.code;
                const title = btn.dataset.title;

                const labelEl = document.getElementById('deleteStrandCodeTitle');
                if (labelEl) {
                    labelEl.textContent = `${code} (${title})`;
                }

                if (modalDeleteStrand) modalDeleteStrand.show();
            });
        });
    }

    // Form Add Strand
    const formAddStrand = document.getElementById('formAddStrand');
    if (formAddStrand) {
        formAddStrand.addEventListener('submit', async (e) => {
            e.preventDefault();
            const code = document.getElementById('addStrandCode').value.trim();
            const title = document.getElementById('addStrandTitle').value.trim();
            const department = document.getElementById('addStrandDepartment').value;

            if (!code || !title) {
                alert('Please fill out all required fields.');
                return;
            }

            const submitBtn = formAddStrand.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            try {
                const res = await authedFetch('/api/database/strands', token, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code, title, department })
                });

                if (!res.success) {
                    alert(res.message || 'Could not create strand.');
                    return;
                }

                if (modalAddStrand) modalAddStrand.hide();
                formAddStrand.reset();
                await Promise.all([renderTable('strands'), loadAllCounts()]);
            } catch (err) {
                console.error('Create strand error:', err);
                alert('An unexpected network error occurred.');
            } finally {
                submitBtn.disabled = false;
            }
        });
    }

    // Form Edit Strand
    const formEditStrand = document.getElementById('formEditStrand');
    if (formEditStrand) {
        formEditStrand.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('editStrandId').value;
            const code = document.getElementById('editStrandCode').value.trim();
            const title = document.getElementById('editStrandTitle').value.trim();
            const department = document.getElementById('editStrandDepartment').value;

            if (!code || !title) {
                alert('Please fill out all required fields.');
                return;
            }

            const submitBtn = formEditStrand.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            try {
                const res = await authedFetch(`/api/database/strands/${id}`, token, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code, title, department })
                });

                if (!res.success) {
                    alert(res.message || 'Could not update strand.');
                    return;
                }

                if (modalEditStrand) modalEditStrand.hide();
                await Promise.all([renderTable('strands'), loadAllCounts()]);
            } catch (err) {
                console.error('Update strand error:', err);
                alert('An unexpected network error occurred.');
            } finally {
                submitBtn.disabled = false;
            }
        });
    }

    // Confirm Delete Strand Button
    const btnConfirmDeleteStrand = document.getElementById('btnConfirmDeleteStrand');
    if (btnConfirmDeleteStrand) {
        btnConfirmDeleteStrand.addEventListener('click', async () => {
            if (!strandToDeleteId) return;

            btnConfirmDeleteStrand.disabled = true;
            try {
                const res = await authedFetch(`/api/database/strands/${strandToDeleteId}`, token, {
                    method: 'DELETE'
                });

                if (!res.success) {
                    alert(res.message || 'Could not delete strand.');
                    return;
                }

                if (modalDeleteStrand) modalDeleteStrand.hide();
                strandToDeleteId = null;
                await Promise.all([renderTable('strands'), loadAllCounts()]);
            } catch (err) {
                console.error('Delete strand error:', err);
                alert('An unexpected network error occurred.');
            } finally {
                btnConfirmDeleteStrand.disabled = false;
            }
        });
    }

    function attachSectionRowEvents() {
        document.querySelectorAll('.btn-edit-section').forEach(btn => {
            btn.addEventListener('click', async () => {
                await loadSectionDropdownOptions();
                const id = btn.dataset.id;
                const name = btn.dataset.name;
                const strandId = btn.dataset.strandId;
                const gradeLevel = btn.dataset.gradeLevel;
                const adviserId = btn.dataset.adviserId;

                document.getElementById('editSectionId').value = id;
                document.getElementById('editSectionName').value = name;
                document.getElementById('editSectionStrand').value = strandId;
                document.getElementById('editSectionGrade').value = gradeLevel;
                document.getElementById('editSectionAdviser').value = adviserId || '';

                if (modalEditSection) modalEditSection.show();
            });
        });

        document.querySelectorAll('.btn-delete-section').forEach(btn => {
            btn.addEventListener('click', () => {
                sectionToDeleteId = btn.dataset.id;
                const name = btn.dataset.name;
                const enrollees = parseInt(btn.dataset.enrollees || '0', 10);

                const labelEl = document.getElementById('deleteSectionName');
                if (labelEl) {
                    labelEl.textContent = `${name} (${enrollees} active student${enrollees === 1 ? '' : 's'})`;
                }

                if (modalDeleteSection) modalDeleteSection.show();
            });
        });
    }

    if (btnAddSection) {
        btnAddSection.addEventListener('click', () => {
            loadSectionDropdownOptions();
        });
    }

    // Form Add Section
    const formAddSection = document.getElementById('formAddSection');
    if (formAddSection) {
        formAddSection.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('addSectionName').value.trim();
            const strandId = document.getElementById('addSectionStrand').value;
            const gradeLevel = document.getElementById('addSectionGrade').value;
            const adviserId = document.getElementById('addSectionAdviser').value || null;

            if (!name || !strandId || !gradeLevel) {
                alert('Please fill out all required fields.');
                return;
            }

            const submitBtn = formAddSection.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            try {
                const res = await authedFetch('/api/database/sections', token, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, strandId, gradeLevel, adviserId })
                });

                if (!res.success) {
                    alert(res.message || 'Could not create section.');
                    return;
                }

                if (modalAddSection) modalAddSection.hide();
                formAddSection.reset();
                await Promise.all([renderTable('sections'), loadAllCounts()]);
            } catch (err) {
                console.error('Create section error:', err);
                alert('An unexpected network error occurred.');
            } finally {
                submitBtn.disabled = false;
            }
        });
    }

    // Form Edit Section
    const formEditSection = document.getElementById('formEditSection');
    if (formEditSection) {
        formEditSection.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('editSectionId').value;
            const name = document.getElementById('editSectionName').value.trim();
            const strandId = document.getElementById('editSectionStrand').value;
            const gradeLevel = document.getElementById('editSectionGrade').value;
            const adviserId = document.getElementById('editSectionAdviser').value || null;

            if (!name || !strandId || !gradeLevel) {
                alert('Please fill out all required fields.');
                return;
            }

            const submitBtn = formEditSection.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            try {
                const res = await authedFetch(`/api/database/sections/${id}`, token, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, strandId, gradeLevel, adviserId })
                });

                if (!res.success) {
                    alert(res.message || 'Could not update section.');
                    return;
                }

                if (modalEditSection) modalEditSection.hide();
                await Promise.all([renderTable('sections'), loadAllCounts()]);
            } catch (err) {
                console.error('Update section error:', err);
                alert('An unexpected network error occurred.');
            } finally {
                submitBtn.disabled = false;
            }
        });
    }

    // Confirm Delete Section
    const btnConfirmDeleteSection = document.getElementById('btnConfirmDeleteSection');
    if (btnConfirmDeleteSection) {
        btnConfirmDeleteSection.addEventListener('click', async () => {
            if (!sectionToDeleteId) return;

            btnConfirmDeleteSection.disabled = true;
            try {
                const res = await authedFetch(`/api/database/sections/${sectionToDeleteId}`, token, {
                    method: 'DELETE'
                });

                if (!res.success) {
                    alert(res.message || 'Could not delete section.');
                    return;
                }

                if (modalDeleteSection) modalDeleteSection.hide();
                sectionToDeleteId = null;
                await Promise.all([renderTable('sections'), loadAllCounts()]);
            } catch (err) {
                console.error('Delete section error:', err);
                alert('An unexpected network error occurred.');
            } finally {
                btnConfirmDeleteSection.disabled = false;
            }
        });
    }

    // Archive & Purge Login Logs Logic
    async function updateArchiveCheck() {
        if (!archiveRetentionDays || !archiveEligibleCount) return;
        const days = archiveRetentionDays.value || 60;
        archiveEligibleCount.textContent = 'Calculating...';
        if (archiveCutoffText) archiveCutoffText.textContent = '';

        try {
            const res = await authedFetch(`/api/database/login-logs/archive-check?days=${days}`, token);
            if (res && res.success) {
                archiveEligibleCount.textContent = `${res.eligibleCount} log(s)`;
                if (archiveCutoffText && res.cutoffDate) {
                    const d = new Date(res.cutoffDate);
                    archiveCutoffText.textContent = `Recorded before ${d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
                }
            } else {
                archiveEligibleCount.textContent = '0 log(s)';
            }
        } catch (err) {
            console.error('Archive check error:', err);
            archiveEligibleCount.textContent = 'Error checking';
        }
    }

    if (archiveRetentionDays) {
        archiveRetentionDays.addEventListener('change', updateArchiveCheck);
    }

    if (archiveFileFormat && archiveCustomFileName) {
        archiveFileFormat.addEventListener('change', () => {
            const fmt = archiveFileFormat.value;
            let current = archiveCustomFileName.value.trim();
            if (fmt === 'xlsx') {
                archiveCustomFileName.value = current.replace(/\.csv$/i, '') + '.xlsx';
            } else {
                archiveCustomFileName.value = current.replace(/\.xlsx$/i, '') + '.csv';
            }
        });
    }

    if (btnArchiveLogs) {
        btnArchiveLogs.addEventListener('click', () => {
            updateArchiveCheck();
        });
    }

    if (modalArchiveLogsEl) {
        modalArchiveLogsEl.addEventListener('show.bs.modal', updateArchiveCheck);
    }

    if (btnDownloadArchiveOnly) {
        btnDownloadArchiveOnly.addEventListener('click', () => {
            const days = archiveRetentionDays ? archiveRetentionDays.value : 60;
            const format = archiveFileFormat ? archiveFileFormat.value : 'csv';
            const ext = format === 'xlsx' ? 'xlsx' : 'csv';
            const customName = archiveCustomFileName ? archiveCustomFileName.value.trim() : '';
            const nameParam = customName ? `&customName=${encodeURIComponent(customName)}` : '';
            window.open(`${API_BASE}/api/database/login-logs/archive.${ext}?days=${days}&format=${format}${nameParam}&token=${encodeURIComponent(token)}`, '_blank');
        });
    }

    if (btnDownloadAndPurge) {
        btnDownloadAndPurge.addEventListener('click', async () => {
            const days = archiveRetentionDays ? archiveRetentionDays.value : 60;
            const format = archiveFileFormat ? archiveFileFormat.value : 'csv';
            const ext = format === 'xlsx' ? 'xlsx' : 'csv';
            const customName = archiveCustomFileName && archiveCustomFileName.value.trim()
                ? archiveCustomFileName.value.trim()
                : `Mentorae_Logs_2026_Term1.${ext}`;
            const countText = archiveEligibleCount ? archiveEligibleCount.textContent : '';

            const confirmProceed = confirm(
                `Are you sure you want to download older logs and clean them from the live database?\n\n` +
                `• Target: Logs older than ${days} days (${countText})\n` +
                `• File name: ${customName} (${format.toUpperCase()})\n` +
                `• Database: These old records will be permanently removed from MySQL to free up database storage (< 1 GB).\n\n` +
                `After downloading, please save this file to your school Google Drive folder for safe permanent recordkeeping.\n\n` +
                `Proceed with download & purge?`
            );
            if (!confirmProceed) return;

            btnDownloadAndPurge.disabled = true;
            const originalContent = btnDownloadAndPurge.innerHTML;
            btnDownloadAndPurge.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Processing...';

            try {
                // 1. Trigger download first so the file is safely saved
                const nameParam = customName ? `&customName=${encodeURIComponent(customName)}` : '';
                const downloadUrl = `${API_BASE}/api/database/login-logs/archive.${ext}?days=${days}&format=${format}${nameParam}&token=${encodeURIComponent(token)}`;

                const link = document.createElement('a');
                link.href = downloadUrl;
                link.setAttribute('download', customName);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                // Short delay to allow download trigger
                await new Promise(r => setTimeout(r, 600));

                // 2. Execute database purge
                const res = await authedFetch('/api/database/login-logs/purge', token, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ days, confirm: 'PURGE' })
                });

                if (!res.success) {
                    alert(res.message || 'Could not purge logs from database.');
                    return;
                }

                alert(
                    `Archiving and Database Cleanup Complete!\n\n` +
                    `${res.message}\n\n` +
                    `Remember to save your downloaded ${format.toUpperCase()} file (${customName}) into your school Google Drive folder.`
                );

                if (modalArchiveLogs) modalArchiveLogs.hide();
                await Promise.all([renderTable('login-logs'), loadAllCounts()]);
            } catch (err) {
                console.error('Archive and purge error:', err);
                alert('An unexpected error occurred during database cleanup.');
            } finally {
                btnDownloadAndPurge.disabled = false;
                btnDownloadAndPurge.innerHTML = originalContent;
            }
        });
    }

    if (categoryNavButtons.students) {
        categoryNavButtons.students.addEventListener('click', () => renderTable('students'));
    }
    if (categoryNavButtons.subjects) {
        categoryNavButtons.subjects.addEventListener('click', () => renderTable('subjects'));
    }
    if (categoryNavButtons.strands) {
        categoryNavButtons.strands.addEventListener('click', () => renderTable('strands'));
    }
    if (categoryNavButtons.sections) {
        categoryNavButtons.sections.addEventListener('click', () => renderTable('sections'));
    }
    if (categoryNavButtons['login-logs']) {
        categoryNavButtons['login-logs'].addEventListener('click', () => renderTable('login-logs'));
    }

    if (dbSearchInput) {
        dbSearchInput.addEventListener('input', renderCurrentCategoryRows);
    }

    async function loadAllCounts() {
        const [students, subjects, strands, sections, logs] = await Promise.all([
            authedFetch('/api/database/students', token),
            authedFetch('/api/database/subjects', token),
            authedFetch('/api/database/strands', token),
            authedFetch('/api/database/sections', token),
            authedFetch('/api/database/login-logs', token),
        ]);
        if (students && students.success) document.getElementById('studentsCountVal').textContent = students.records.length;
        if (subjects && subjects.success) document.getElementById('subjectsCountVal').textContent = subjects.records.length;
        if (strands && strands.success) document.getElementById('strandsCountVal').textContent = strands.records.length;
        if (sections && sections.success) document.getElementById('sectionsCountVal').textContent = sections.records.length;
        if (logs && logs.success) document.getElementById('loginLogsCountVal').textContent = logs.records.length;
    }

    const btnExportExcel = document.getElementById('btnExportCurrentExcel');
    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', () => {
            window.open(`${API_BASE}/api/database/${currentCategory}/export.xlsx?token=${encodeURIComponent(token)}`, '_blank');
        });
    }

    const btnExportCsv = document.getElementById('btnExportCurrentCsv');
    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', () => {
            window.open(`${API_BASE}/api/database/${currentCategory}/export.csv?token=${encodeURIComponent(token)}`, '_blank');
        });
    }

    loadAllCounts();
    loadSectionDropdownOptions().then(() => {
        renderTable('students');
    }).catch(() => {
        renderTable('students');
    });
});
