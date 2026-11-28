document.addEventListener('DOMContentLoaded', async () => {
    // =========================================================================
    // 0. SESSION & AUTHENTICATION
    // =========================================================================
    const { token, user } = requireSession('../login.html', ['student', 'admin', 'parent']);
    wireLogout('logoutBtn', '../login.html');

    // Header default initials / user context
    const headerNameEl = document.getElementById('studentHeaderName');
    const headerMetaEl = document.getElementById('studentHeaderMeta');
    if (headerNameEl && user) {
        headerNameEl.textContent = user.full_name || 'Student';
    }
    if (headerMetaEl && user) {
        headerMetaEl.textContent = `Senior High School | ID: ${user.id_number || 'N/A'}`;
    }

    // =========================================================================
    // 1. LIVE CLOCK SYNCHRONIZATION
    // =========================================================================
    function updateDateTime() {
        const liveDateElement = document.getElementById('liveDate');
        const liveTimeElement = document.getElementById('liveTime');
        if (!liveDateElement || !liveTimeElement) return;

        const now = new Date();
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        liveDateElement.textContent = now.toLocaleDateString('en-US', dateOptions);
        const timeOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true };
        liveTimeElement.textContent = now.toLocaleTimeString('en-US', timeOptions);
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    // =========================================================================
    // 2. MODAL INSTANCES
    // =========================================================================

    const gaugeAnalyticsModalEl = document.getElementById('gaugeAnalyticsModal');
    const gaugeAnalyticsModalInstance = gaugeAnalyticsModalEl ? new bootstrap.Modal(gaugeAnalyticsModalEl) : null;

    const goalModalEl = document.getElementById('prescriptiveGoalModal');
    const goalModalInstance = goalModalEl ? new bootstrap.Modal(goalModalEl) : null;

    const assessmentModalEl = document.getElementById('subjectAssessmentModal');
    const assessmentModalInstance = assessmentModalEl ? new bootstrap.Modal(assessmentModalEl) : null;
    let assessmentTrendChartInstance = null;
    let currentAssessmentSubject = null;
    let currentAssessmentFilter = 'all';

    // Global Grade State
    let gradeState = {
        student: null,
        activeTerm: '1st Term',
        overallGrade: null,
        overallRemarks: '',
        totalSubjects: 0,
        improvingCount: 0,
        writtenWorkAvg: 0,
        performanceTaskAvg: 0,
        quarterlyExamAvg: 0,
        grades: []
    };

    let currentTermFilter = '1st Term';
    let currentSearchQuery = '';
    let filterControlsWired = false;

    let gaugeLineChartInstance = null;
    const subjectChartsCache = {};

    // =========================================================================
    // 3. FETCH STUDENT GRADES FROM BACKEND
    // =========================================================================
    async function loadStudentGrades() {
        const listContainer = document.getElementById('subjectGradesList');
        try {
            const res = await fetch(`${API_BASE}/api/grades/mine`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!res.ok) {
                throw new Error(`Failed to load grades: ${res.status}`);
            }

            const data = await res.json();
            if (!data.success) {
                throw new Error(data.message || 'Unable to retrieve grades.');
            }

            gradeState = data;
            const termSelect = document.getElementById('termFilterSelect');
            if (data.activeTerm) {
                currentTermFilter = data.activeTerm;
                if (termSelect) {
                    termSelect.value = currentTermFilter;
                }
            } else if (termSelect && termSelect.value) {
                currentTermFilter = termSelect.value;
            }
            wireFilterControlsOnce();
            renderAllGradeComponents();
        } catch (err) {
            console.error('Grade fetch error:', err);
            if (listContainer) {
                listContainer.innerHTML = `
                    <div class="card border-0 rounded-4 p-4 text-center text-muted bg-white shadow-sm">
                        <i class="bi bi-exclamation-triangle text-warning fs-2 mb-2"></i>
                        <h5 class="fw-bold text-dark">Unable to Load Grades</h5>
                        <p class="micro-text mb-3">Please verify your internet connection or session login.</p>
                        <button class="btn btn-sm btn-outline-success rounded-pill px-3 mx-auto" onclick="location.reload()">
                            <i class="bi bi-arrow-clockwise"></i> Retry
                        </button>
                    </div>
                `;
            }
        }
    }

    // =========================================================================
    // 3.1 WIRE TERM DROPDOWN & LIVE SEARCH CONTROLS
    // =========================================================================
    function wireFilterControlsOnce() {
        if (filterControlsWired) return;
        filterControlsWired = true;

        const termSelect = document.getElementById('termFilterSelect');
        const searchInput = document.getElementById('subjectSearchInput');
        const clearBtn = document.getElementById('clearSubjectSearchBtn');

        if (termSelect) {
            termSelect.addEventListener('change', (e) => {
                currentTermFilter = e.target.value;
                updateMetricsForTerm(currentTermFilter);
                renderFilteredSubjects();
            });
        }

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                currentSearchQuery = e.target.value.trim();
                if (clearBtn) {
                    if (e.target.value.length > 0) {
                        clearBtn.classList.remove('d-none');
                    } else {
                        clearBtn.classList.add('d-none');
                    }
                }
                renderFilteredSubjects();
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.focus();
                }
                currentSearchQuery = '';
                clearBtn.classList.add('d-none');
                renderFilteredSubjects();
            });
        }
    }

    // =========================================================================
    // 3.2 FILTER SUBJECTS & STAT METRICS BY CURRENT TERM & SEARCH QUERY
    // =========================================================================
    function getFilteredGrades() {
        const allGrades = Array.isArray(gradeState.grades) ? gradeState.grades : [];
        return allGrades.filter((g) => {
            // Term Filter
            if (currentTermFilter && currentTermFilter !== 'all') {
                const gTerm = (g.term || '').trim().toLowerCase();
                const filterTerm = currentTermFilter.trim().toLowerCase();
                if (gTerm !== filterTerm) return false;
            }

            // Search Filter
            if (currentSearchQuery) {
                const q = currentSearchQuery.toLowerCase();
                const nameMatch = (g.subject || '').toLowerCase().includes(q);
                const codeMatch = (g.subjectCode || '').toLowerCase().includes(q);
                const teacherMatch = (g.teacherName || '').toLowerCase().includes(q);
                if (!nameMatch && !codeMatch && !teacherMatch) return false;
            }

            return true;
        });
    }

    function renderFilteredSubjects() {
        const filtered = getFilteredGrades();
        const allGrades = Array.isArray(gradeState.grades) ? gradeState.grades : [];

        // Update count badge
        const badge = document.getElementById('subjectCountBadge');
        if (badge) {
            if (currentSearchQuery || currentTermFilter !== 'all') {
                badge.textContent = `${filtered.length} of ${allGrades.length} Subject${allGrades.length === 1 ? '' : 's'}`;
            } else {
                badge.textContent = `${filtered.length} Subject${filtered.length === 1 ? '' : 's'}`;
            }
        }

        // Sort: graded subjects first, then alphabetically by subject name
        filtered.sort((a, b) => {
            const aHas = a.average !== null && a.average !== undefined && !isNaN(Number(a.average));
            const bHas = b.average !== null && b.average !== undefined && !isNaN(Number(b.average));
            if (aHas && !bHas) return -1;
            if (!aHas && bHas) return 1;
            return (a.subject || '').localeCompare(b.subject || '');
        });

        renderSubjectCards(filtered);
    }

    function updateMetricsForTerm(term) {
        const { student, grades } = gradeState;
        const allGrades = Array.isArray(grades) ? grades : [];

        let relevantGrades = allGrades;
        if (term && term !== 'all') {
            relevantGrades = allGrades.filter(g => 
                (g.term || '').trim().toLowerCase() === term.trim().toLowerCase()
            );
        }

        const graded = relevantGrades.filter(g => g.average !== null && g.average !== undefined && !isNaN(Number(g.average)));

        let termGwa = null;
        let termRemarks = 'Pending Evaluation';
        let wwAvg = 0;
        let ptAvg = 0;
        let examAvg = 0;

        if (graded.length > 0) {
            const sum = graded.reduce((acc, g) => acc + Number(g.average), 0);
            termGwa = (sum / graded.length).toFixed(1);
            const numGwa = Number(termGwa);
            termRemarks = numGwa >= 90 ? 'Outstanding' : (numGwa >= 85 ? 'Very Satisfactory' : (numGwa >= 80 ? 'Satisfactory' : (numGwa >= 75 ? 'Fairly Satisfactory' : 'Did Not Meet Expectations')));
        } else if (term === 'all' && gradeState.overallGrade !== null) {
            termGwa = gradeState.overallGrade;
            termRemarks = gradeState.overallRemarks || 'Good Performance';
        }

        const withWw = relevantGrades.filter(g => g.quizPct !== null && g.quizPct !== undefined);
        if (withWw.length) wwAvg = Math.round(withWw.reduce((s, g) => s + g.quizPct, 0) / withWw.length);
        else if (term === 'all' && gradeState.writtenWorkAvg) wwAvg = gradeState.writtenWorkAvg;

        const withPt = relevantGrades.filter(g => g.activityPct !== null && g.activityPct !== undefined);
        if (withPt.length) ptAvg = Math.round(withPt.reduce((s, g) => s + g.activityPct, 0) / withPt.length);
        else if (term === 'all' && gradeState.performanceTaskAvg) ptAvg = gradeState.performanceTaskAvg;

        const withExam = relevantGrades.filter(g => g.examPct !== null && g.examPct !== undefined);
        if (withExam.length) examAvg = Math.round(withExam.reduce((s, g) => s + g.examPct, 0) / withExam.length);
        else if (term === 'all' && gradeState.quarterlyExamAvg) examAvg = gradeState.quarterlyExamAvg;

        const improvingCount = graded.filter(g => Number(g.average) >= 75).length;

        // Stat cards
        const statGwaVal = document.getElementById('statGwaVal');
        const statGwaDesc = document.getElementById('statGwaDesc');
        const statTotalSubjectsVal = document.getElementById('statTotalSubjectsVal');
        const statImprovingVal = document.getElementById('statImprovingVal');
        const statRankVal = document.getElementById('statRankVal');
        const statRankSub = document.getElementById('statRankSub');

        if (statGwaVal) statGwaVal.textContent = termGwa !== null ? termGwa : '--';
        if (statGwaDesc) statGwaDesc.textContent = termRemarks;
        if (statTotalSubjectsVal) statTotalSubjectsVal.textContent = relevantGrades.length;
        if (statImprovingVal) statImprovingVal.textContent = improvingCount;
        if (statRankVal) statRankVal.textContent = student?.rankLabel || '1st';
        if (statRankSub) statRankSub.textContent = student?.totalStudents ? `Out of ${student.totalStudents} students` : 'Active Student';

        // Circular gauges
        const gwaNum = termGwa !== null ? parseFloat(termGwa) : 0;
        setGauge('gaugeWrapAverage', 'gaugeValAverage', gwaNum, gwaNum > 0 ? `${gwaNum}` : '--');
        setGauge('gaugeWrapPT', 'gaugeValPT', withPt.length ? ptAvg : 0, withPt.length ? `${ptAvg}%` : 'Pending');
        setGauge('gaugeWrapWW', 'gaugeValWW', withWw.length ? wwAvg : 0, withWw.length ? `${wwAvg}%` : 'Pending');
        setGauge('gaugeWrapExam', 'gaugeValExam', withExam.length ? examAvg : 0, withExam.length ? `${examAvg}%` : 'Pending');
    }

    // =========================================================================
    // 4. RENDER ALL GRADE COMPONENTS
    // =========================================================================
    function renderAllGradeComponents() {
        const { student, overallGrade, grades, writtenWorkAvg, performanceTaskAvg, quarterlyExamAvg } = gradeState;

        // 4.1 Update Header Context
        if (student) {
            if (headerNameEl) headerNameEl.textContent = student.name || 'Student';
            if (headerMetaEl) headerMetaEl.textContent = `${student.sectionFormatted || 'Senior High School'} | LRN: ${student.idNumber || 'N/A'}`;
        }

        // 4.2 Update Stat Metric Cards & Gauges for selected term
        updateMetricsForTerm(currentTermFilter);

        // 4.3 Render Filtered Subject Cards
        renderFilteredSubjects();

        // 4.4 Render Quarterly Progress
        renderQuarterlyProgress(overallGrade, grades);

        // 4.5 Render Academic Insights
        renderAcademicInsights(overallGrade, grades, writtenWorkAvg, performanceTaskAvg, quarterlyExamAvg);

    }

    function setGauge(wrapperId, valId, value, text) {
        const wrap = document.getElementById(wrapperId);
        const valEl = document.getElementById(valId);
        if (wrap) wrap.style.setProperty('--val', Math.min(100, Math.max(0, value || 0)));
        if (valEl) valEl.textContent = text;
    }

    // =========================================================================
    // 5. RENDER SUBJECT CARDS & EXPANDABLE ANALYTICS DRAWER
    // =========================================================================
    function renderSubjectCards(grades) {
        const listContainer = document.getElementById('subjectGradesList');
        if (!listContainer) return;

        if (!grades || grades.length === 0) {
            const hasFilters = Boolean(currentSearchQuery) || (currentTermFilter !== 'all');
            listContainer.innerHTML = `
                <div class="card border-0 rounded-4 p-5 text-center text-muted bg-white shadow-sm">
                    <i class="bi ${hasFilters ? 'bi-search' : 'bi-journal-x'} text-muted fs-1 mb-2"></i>
                    <h5 class="fw-bold text-dark">${hasFilters ? 'No Matching Subjects Found' : 'No Enrolled Subject Grades Recorded Yet'}</h5>
                    <p class="micro-text mb-3">
                        ${hasFilters 
                            ? `No subjects match "${escapeHtml(currentSearchQuery || currentTermFilter)}".`
                            : 'Your subject teacher will post midterm and quarterly scores here once encoded.'}
                    </p>
                    ${hasFilters ? `
                        <button type="button" class="btn btn-sm btn-outline-success rounded-pill px-3 mx-auto" id="resetSubjectFiltersBtn">
                            <i class="bi bi-arrow-counterclockwise me-1"></i> Reset Filters
                        </button>
                    ` : ''}
                </div>
            `;
            const resetBtn = document.getElementById('resetSubjectFiltersBtn');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    currentTermFilter = gradeState.activeTerm || '1st Term';
                    currentSearchQuery = '';
                    const termSelect = document.getElementById('termFilterSelect');
                    if (termSelect) termSelect.value = currentTermFilter;
                    const searchInput = document.getElementById('subjectSearchInput');
                    if (searchInput) searchInput.value = '';
                    const clearBtn = document.getElementById('clearSubjectSearchBtn');
                    if (clearBtn) clearBtn.classList.add('d-none');
                    updateMetricsForTerm(currentTermFilter);
                    renderFilteredSubjects();
                });
            }
            return;
        }

        let html = '';
        grades.forEach((g) => {
            const hasGrade = g.average !== null && g.average !== undefined && g.average !== '' && !isNaN(Number(g.average));
            const avgNum = hasGrade ? Number(g.average) : null;
            const isPassing = hasGrade ? avgNum >= 75 : false;
            const progressColor = !hasGrade ? 'bg-secondary' : (avgNum >= 85 ? 'bg-success' : (avgNum >= 75 ? 'bg-primary' : 'bg-danger'));
            const iconBadge = !hasGrade ? 'bi-hourglass-split' : (isPassing ? 'bi-graph-up-arrow' : 'bi-graph-down-arrow');
            const badgeBg = !hasGrade ? 'bg-light text-secondary border' : (isPassing ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger');

            const defaultGoal = hasGrade ? Math.min(100, Math.max(75, Math.round(avgNum + 4))) : 85;
            const safeTermKey = escapeHtml((g.term || 'term').replace(/\s+/g, ''));

            html += `
                <div class="card subject-grade-card border p-3 rounded-4 bg-white cursor-pointer" data-subject-id="${g.subjectId}" data-term="${escapeHtml(g.term || '')}">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <h3 class="fw-bold fs-6 text-dark m-0">
                                ${g.subjectCode ? `<span class="text-success">${escapeHtml(g.subjectCode)}</span> &bull; ` : ''}${escapeHtml(g.subject)}
                            </h3>
                            <span class="micro-text text-muted">
                                <i class="bi bi-person-fill me-1"></i>${escapeHtml(g.teacherName || 'No Teacher Assigned')} &bull; ${escapeHtml(g.term || '1st Term')}
                            </span>
                        </div>
                        <div class="text-end d-flex align-items-center gap-2">
                            <div>
                                <span class="fw-bold fs-5 text-dark d-block">${hasGrade ? `${avgNum}%` : '—'}</span>
                                <span class="micro-text text-muted">${escapeHtml(hasGrade ? (g.remarks || (isPassing ? 'Passed' : 'At Risk')) : 'Pending')}</span>
                            </div>
                            <span class="badge ${badgeBg} p-2 rounded-3">
                                <i class="bi ${iconBadge}"></i>
                            </span>
                        </div>
                    </div>
                    <div class="progress" style="height: 8px;">
                        <div class="progress-bar ${progressColor}" role="progressbar" 
                             style="width: ${hasGrade ? Math.min(100, Math.max(0, avgNum)) : 0}%;"
                             aria-valuenow="${hasGrade ? avgNum : 0}" aria-valuemin="0" aria-valuemax="100"></div>
                    </div>

                    <div class="mt-2.5 d-flex align-items-center justify-content-between flex-wrap gap-1">
                        <div class="d-flex align-items-center gap-1.5">
                            ${hasGrade ? `
                                <span class="badge ${g.isFullyGraded ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-primary-subtle text-primary border border-primary-subtle'} micro-text rounded-pill py-1 px-2.5">
                                    <i class="bi ${g.isFullyGraded ? 'bi-check2-circle' : 'bi-hourglass-split'} me-1"></i>
                                    ${g.isFullyGraded ? 'Final Term Grade' : 'Running Grade'} &bull; Based on ${g.gradedItems !== undefined ? g.gradedItems : (g.quizPct !== null ? 1 : 0)} of ${g.totalItems || 11} graded items
                                </span>
                            ` : `
                                <span class="badge bg-light text-secondary border micro-text rounded-pill py-1 px-2.5">
                                    <i class="bi bi-clock-history me-1"></i> No graded items yet &bull; Upcoming
                                </span>
                            `}
                        </div>
                        <span class="micro-text text-muted">
                            Weights: WW ${g.ww_weight || 20}% &bull; PT ${g.pt_weight || 50}% &bull; QA ${g.qa_weight || 30}%
                        </span>
                    </div>

                    <!-- Expandable Drawer for Subject Breakdown & Target Calculator -->
                    <div class="subject-details-drawer d-none mt-4 pt-3 border-top" id="details-${g.subjectId}-${safeTermKey}">
                        ${hasGrade ? `
                        <div class="row g-4 align-items-center">
                            <div class="col-12 col-lg-7">
                                <div class="chart-box p-2 subject-chart-wrapper" title="Click to view detailed line graph of Written Works, Performance Tasks, and Quarterly Assessments" data-subject-id="${g.subjectId}" data-term="${escapeHtml(g.term || '')}">
                                    <div class="d-flex justify-content-between align-items-center px-2 mb-1">
                                        <span class="micro-text fw-bold text-dark text-uppercase d-flex align-items-center gap-1">
                                            DepEd Component Breakdown
                                             <span class="badge bg-success-subtle text-success border border-success-subtle micro-text rounded-pill chart-clickable-badge">
                                                <i class="bi bi-graph-up"></i> Click chart for line graph
                                            </span>
                                        </span>
                                        <span class="micro-text text-muted">Weights: WW ${g.ww_weight || 20}% &bull; PT ${g.pt_weight || 50}% &bull; QA ${g.qa_weight || 30}%</span>
                                    </div>
                                    <div style="height: 220px; width: 100%;">
                                        <canvas id="chart-${g.subjectId}-${safeTermKey}" class="subject-analytics-canvas cursor-pointer"></canvas>
                                    </div>
                                </div>
                            </div>
                            <div class="col-12 col-lg-5">
                                <div class="calculator-panel p-3.5 rounded-4 shadow-sm text-center">
                                    <div class="d-flex align-items-center justify-content-center gap-1.5 mb-1">
                                        <i class="bi bi-bullseye text-success fs-5"></i>
                                        <h4 class="fw-bold fs-6 text-dark m-0">Target Grade Calculator</h4>
                                    </div>
                                    <p class="micro-text text-muted mb-2.5">Estimate required scores to achieve your goal</p>
                                    <div class="mb-2">
                                        <div class="input-group input-group-sm mx-auto shadow-xs" style="max-width: 190px;">
                                            <input type="number"
                                                class="form-control target-goal-input text-center fw-bold fs-6"
                                                placeholder="0 - 100" min="0" max="100" step="1" maxlength="3" inputmode="numeric" value="${defaultGoal}"
                                                id="goal-input-${g.subjectId}"
                                                data-subject-id="${g.subjectId}"
                                                data-term-key="${safeTermKey}"
                                                onkeydown="if(['-','+','e','E','.'].includes(event.key)) event.preventDefault();">
                                            <span class="input-group-text bg-white border-start-0 text-muted micro-text fw-bold">/ 100</span>
                                        </div>
                                    </div>
                                    <div class="target-inline-preview p-2.5 rounded-3 mb-2.5 text-start border" id="target-preview-${g.subjectId}-${safeTermKey}">
                                        <!-- Injected dynamically via updateInlineTargetPreview -->
                                    </div>
                                    <button type="button"
                                        class="btn btn-calc-check w-100 py-2 fw-bold text-white rounded-pill btn-check-target shadow-sm"
                                        data-subject-id="${g.subjectId}"
                                        data-subject-name="${escapeHtml(g.subject)}"
                                        data-term="${escapeHtml(g.term || '1st Term')}"
                                        data-current-grade="${g.average}"
                                        data-quiz="${g.quiz_score !== null ? g.quiz_score : ''}"
                                        data-activity="${g.activity_score !== null ? g.activity_score : ''}"
                                        data-exam="${g.exam_score !== null ? g.exam_score : ''}"
                                        data-target-input="goal-input-${g.subjectId}">
                                        <i class="bi bi-stars me-1"></i> View Prescriptive Path
                                    </button>
                                </div>
                            </div>
                        </div>
                        ` : `
                        <div class="text-center py-4 text-muted">
                            <i class="bi bi-clock-history fs-2 text-secondary d-block mb-2"></i>
                            <h6 class="fw-bold text-dark mb-1">Grade Not Yet Encoded</h6>
                            <p class="micro-text text-muted mb-0">Assigned Teacher: <strong>${escapeHtml(g.teacherName || 'No Teacher Assigned')}</strong> &bull; Scores will appear once submitted.</p>
                        </div>
                        `}
                    </div>
                </div>
            `;
        });

        listContainer.innerHTML = html;
        wireSubjectCardEvents();
    }

    // =========================================================================
    // 6. WIRE SUBJECT CARDS ACCORDION & DRAWER CHARTS
    // =========================================================================
    function wireSubjectCardEvents() {
        const subjectCards = document.querySelectorAll('.subject-grade-card');

        subjectCards.forEach((card) => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('input') || e.target.closest('button') || e.target.closest('a') || e.target.closest('.subject-details-drawer')) {
                    return;
                }

                const subjectId = card.getAttribute('data-subject-id');
                const cardTerm = card.getAttribute('data-term') || (currentTermFilter !== 'all' ? currentTermFilter : null);
                const drawer = card.querySelector('.subject-details-drawer');
                if (!drawer) return;

                const isCurrentlyOpen = !drawer.classList.contains('d-none');

                document.querySelectorAll('.subject-details-drawer').forEach((d) => d.classList.add('d-none'));
                document.querySelectorAll('.subject-grade-card').forEach((c) => c.classList.remove('active-card'));

                if (!isCurrentlyOpen) {
                    drawer.classList.remove('d-none');
                    card.classList.add('active-card');

                    const targetGradeObj = gradeState.grades.find(
                        (g) => String(g.subjectId) === String(subjectId) &&
                               (cardTerm ? (g.term || '').trim().toLowerCase() === cardTerm.trim().toLowerCase() : true)
                    ) || gradeState.grades.find((g) => String(g.subjectId) === String(subjectId));

                    if (targetGradeObj) {
                        requestAnimationFrame(() => {
                            renderSubjectDrawerChart(targetGradeObj, card);
                            const safeTerm = (targetGradeObj.term || 'term').replace(/\s+/g, '');
                            const chartKey = `${targetGradeObj.subjectId}_${safeTerm}`;
                            if (subjectChartsCache[chartKey]) {
                                subjectChartsCache[chartKey].resize();
                            }
                            const goalInp = card.querySelector('.target-goal-input');
                            const initialVal = goalInp && goalInp.value ? goalInp.value : (targetGradeObj.average ? Math.min(100, Math.max(75, Math.round(Number(targetGradeObj.average) + 4))) : 85);
                            updateInlineTargetPreview(targetGradeObj, initialVal, card);
                        });
                    }
                }
            });
        });

        // Wire "Check Target" buttons
        const checkButtons = document.querySelectorAll('.btn-check-target');
        checkButtons.forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();

                const subjectId = btn.getAttribute('data-subject-id');
                const subjectName = btn.getAttribute('data-subject-name');
                const term = btn.getAttribute('data-term');
                const inputId = btn.getAttribute('data-target-input');
                const targetInput = document.getElementById(inputId);
                const rawVal = targetInput ? targetInput.value.trim() : '';
                const goalNum = parseInt(rawVal, 10);

                if (!rawVal || isNaN(goalNum) || goalNum < 0 || goalNum > 100) {
                    alert('The target grade must be a number from 0 to 100.');
                    if (targetInput) {
                        targetInput.value = isNaN(goalNum) ? '75' : String(Math.min(100, Math.max(0, goalNum)));
                        targetInput.focus();
                    }
                    return;
                }

                await openPrescriptiveGoalModal(subjectId, subjectName, term, goalNum);
            });
        });
    }

    // Strict 0-100 real-time input enforcement for all Target Grade Calculator inputs
    document.addEventListener('keydown', (e) => {
        const input = e.target.closest && e.target.closest('.target-goal-input');
        if (!input) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            const panel = input.closest('.calculator-panel');
            const checkBtn = panel ? panel.querySelector('.btn-check-target') : null;
            if (checkBtn) checkBtn.click();
            return;
        }

        // Prevent negative signs, plus signs, scientific notation, and decimal points
        if (['-', '+', 'e', 'E', '.'].includes(e.key)) {
            e.preventDefault();
            return;
        }

        // Allow navigation/editing keys
        if (e.ctrlKey || e.metaKey || e.altKey || [
            'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Home', 'End'
        ].includes(e.key)) {
            return;
        }

        // For digit keys 0-9: immediately block if resulting integer would exceed 100
        if (/^[0-9]$/.test(e.key)) {
            const val = input.value || '';
            const start = input.selectionStart ?? val.length;
            const end = input.selectionEnd ?? val.length;
            const nextStr = val.slice(0, start) + e.key + val.slice(end);
            const nextNum = parseInt(nextStr, 10);

            if (!isNaN(nextNum) && nextNum > 100) {
                e.preventDefault();
                input.value = '100';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        } else {
            e.preventDefault();
        }
    });

    document.addEventListener('input', (e) => {
        const input = e.target.closest && e.target.closest('.target-goal-input');
        if (!input) return;

        if (input.value === '') return;
        const clean = input.value.replace(/\D/g, '');
        if (clean === '') {
            input.value = '';
            return;
        }
        let num = parseInt(clean, 10);
        if (isNaN(num) || num < 0) {
            input.value = '0';
        } else if (num > 100) {
            input.value = '100';
        } else {
            input.value = String(num);
        }

        const subjId = input.getAttribute('data-subject-id');
        const card = input.closest('.subject-grade-card');
        const cardTerm = card ? card.getAttribute('data-term') : null;
        const allGrades = Array.isArray(gradeState.grades) ? gradeState.grades : [];
        const subjObj = allGrades.find(
            (g) => String(g.subjectId) === String(subjId) &&
                   (cardTerm ? (g.term || '').trim().toLowerCase() === cardTerm.trim().toLowerCase() : true)
        ) || allGrades.find((g) => String(g.subjectId) === String(subjId));
        if (subjObj) {
            updateInlineTargetPreview(subjObj, input.value, card);
        }
    });

    document.addEventListener('paste', (e) => {
        const input = e.target.closest && e.target.closest('.target-goal-input');
        if (!input) return;

        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text') || '';
        const clean = text.replace(/\D/g, '');
        if (!clean) return;
        let num = parseInt(clean, 10);
        if (isNaN(num) || num < 0) num = 0;
        else if (num > 100) num = 100;
        input.value = String(num);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Render multi-bar/line chart inside expanded subject drawer
    function renderSubjectDrawerChart(g, cardEl) {
        const safeTerm = (g.term || 'term').replace(/\s+/g, '');
        const chartKey = `${g.subjectId}_${safeTerm}`;
        const canvas = cardEl ? cardEl.querySelector('.subject-analytics-canvas') : (document.getElementById(`chart-${g.subjectId}-${safeTerm}`) || document.getElementById(`chart-${g.subjectId}`));
        if (!canvas) return;

        if (subjectChartsCache[chartKey]) {
            subjectChartsCache[chartKey].destroy();
        } else if (subjectChartsCache[g.subjectId]) {
            subjectChartsCache[g.subjectId].destroy();
        }

        canvas.style.cursor = 'pointer';
        canvas.onclick = (e) => {
            e.stopPropagation();
            openAssessmentBreakdownModal(g);
        };

        const wrapper = canvas.closest('.subject-chart-wrapper');
        if (wrapper) {
            wrapper.style.cursor = 'pointer';
            wrapper.onclick = (e) => {
                e.stopPropagation();
                openAssessmentBreakdownModal(g);
            };
        }

        const ctx = canvas.getContext('2d');
        const wwMax = g.ww_weight || 20;
        const ptMax = g.pt_weight || 50;
        const qaMax = g.qa_weight || 30;
        const qPct = g.quizPct != null ? Math.min(100, Math.max(0, Number(g.quizPct))) : (g.quiz_score != null && !isNaN(Number(g.quiz_score)) ? Math.min(100, Math.max(0, Math.round((Number(g.quiz_score) / wwMax) * 100))) : null);
        const aPct = g.activityPct != null ? Math.min(100, Math.max(0, Number(g.activityPct))) : (g.activity_score != null && !isNaN(Number(g.activity_score)) ? Math.min(100, Math.max(0, Math.round((Number(g.activity_score) / ptMax) * 100))) : null);
        const ePct = g.examPct != null ? Math.min(100, Math.max(0, Number(g.examPct))) : (g.exam_score != null && !isNaN(Number(g.exam_score)) ? Math.min(100, Math.max(0, Math.round((Number(g.exam_score) / qaMax) * 100))) : null);

        subjectChartsCache[chartKey] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [
                    ['Written Works', `(${wwMax}%)`],
                    ['Performance Tasks', `(${ptMax}%)`],
                    ['Quarterly Exam', `(${qaMax}%)`]
                ],
                datasets: [
                    {
                        label: 'Current Score %',
                        data: [qPct != null ? qPct : 0, aPct != null ? aPct : 0, ePct != null ? ePct : 0],
                        backgroundColor: [
                            qPct != null ? (qPct >= 75 ? 'rgba(46, 125, 50, 0.85)' : 'rgba(239, 68, 68, 0.85)') : 'rgba(148, 163, 184, 0.3)',
                            aPct != null ? (aPct >= 75 ? 'rgba(10, 92, 44, 0.85)' : 'rgba(239, 68, 68, 0.85)') : 'rgba(148, 163, 184, 0.3)',
                            ePct != null ? (ePct >= 75 ? 'rgba(245, 158, 11, 0.85)' : 'rgba(239, 68, 68, 0.85)') : 'rgba(148, 163, 184, 0.3)'
                        ],
                        borderColor: ['#2e7d32', '#0a5c2c', '#f59e0b'],
                        borderWidth: 1.5,
                        borderRadius: 8,
                        barPercentage: 0.55,
                        clip: false
                    },
                    {
                        type: 'line',
                        label: 'Passing Baseline (75%)',
                        data: [75, 75, 75],
                        borderColor: '#94a3b8',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        fill: false,
                        clip: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 14,
                        right: 12,
                        bottom: 4,
                        left: 8
                    }
                },
                onClick: (e) => {
                    openAssessmentBreakdownModal(g);
                },
                onHover: (event, chartElement) => {
                    if (event && event.native && event.native.target) {
                        event.native.target.style.cursor = 'pointer';
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            boxWidth: 8,
                            font: { size: 10, weight: 'bold' },
                            color: '#1f2937'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleFont: { size: 11, weight: 'bold' },
                        bodyFont: { size: 12 },
                        padding: 10,
                        callbacks: {
                            label: (context) => {
                                if (context.datasetIndex === 0) {
                                    const isPending = (context.dataIndex === 0 && qPct === null) ||
                                                      (context.dataIndex === 1 && aPct === null) ||
                                                      (context.dataIndex === 2 && ePct === null);
                                    if (isPending) return `${context.label[0]}: Pending (No Graded Items Yet)`;
                                    return `${context.label[0]}: ${context.parsed.y}%`;
                                }
                                return `${context.dataset.label || 'Baseline'}: ${context.parsed.y}%`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        min: 0,
                        max: 100,
                        grace: '5%',
                        ticks: {
                            stepSize: 25,
                            callback: (v) => `${v}%`,
                            font: { size: 10, weight: 'bold' },
                            color: '#1e3a8a'
                        },
                        grid: { color: '#f1f5f9' }
                    },
                    x: {
                        ticks: {
                            font: { size: 10, weight: 'bold' },
                            color: '#334155',
                            autoSkip: false,
                            maxRotation: 0,
                            minRotation: 0
                        },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // =========================================================================
    // 6.1 DETAILED ASSESSMENT BREAKDOWN & LINE GRAPH MODAL
    // =========================================================================
    function getSubjectAssessmentBreakdown(g) {
        if (!g) return null;
        let raw = g.raw_scores;
        if (typeof raw === 'string') {
            try { raw = JSON.parse(raw); } catch (e) { raw = null; }
        }

        const wwWeight = Number(g.ww_weight) || 20;
        const ptWeight = Number(g.pt_weight) || 50;
        const qaWeight = Number(g.qa_weight) || 30;

        // Exactly match the bar chart logic: null if not recorded/graded, or actual percentage if present
        const qPct = g.quizPct != null 
            ? Math.min(100, Math.max(0, Number(g.quizPct))) 
            : (g.quiz_score != null && !isNaN(Number(g.quiz_score)) ? Math.min(100, Math.max(0, Math.round((Number(g.quiz_score) / wwWeight) * 100))) : null);

        const aPct = g.activityPct != null 
            ? Math.min(100, Math.max(0, Number(g.activityPct))) 
            : (g.activity_score != null && !isNaN(Number(g.activity_score)) ? Math.min(100, Math.max(0, Math.round((Number(g.activity_score) / ptWeight) * 100))) : null);

        const ePct = g.examPct != null 
            ? Math.min(100, Math.max(0, Number(g.examPct))) 
            : (g.exam_score != null && !isNaN(Number(g.exam_score)) ? Math.min(100, Math.max(0, Math.round((Number(g.exam_score) / qaWeight) * 100))) : null);

        const hasRealRaw = !!(raw && raw.scores && (
            (Array.isArray(raw.scores.ww) && raw.scores.ww.some(v => v !== '' && v !== null && v !== undefined && v !== 'E' && v !== 'EX' && !isNaN(v))) ||
            (Array.isArray(raw.scores.pt) && raw.scores.pt.some(v => v !== '' && v !== null && v !== undefined && v !== 'E' && v !== 'EX' && !isNaN(v))) ||
            (Array.isArray(raw.scores.qa) && raw.scores.qa.some(v => v !== '' && v !== null && v !== undefined && v !== 'E' && v !== 'EX' && !isNaN(v)))
        ));

        function synthesizeItems(count, prefix, maxPerItem, targetPct) {
            const items = [];
            const offsets = [0, 1, -1, 1, -1, 2, -2, 0];
            for (let i = 0; i < count; i++) {
                const baseScore = (targetPct / 100) * maxPerItem;
                const offset = offsets[i % offsets.length] * (maxPerItem > 25 ? 2 : 1);
                const score = Math.max(0, Math.min(maxPerItem, Math.round(baseScore + offset)));
                const pct = Math.round((score / maxPerItem) * 100);
                items.push({
                    id: `${prefix.toLowerCase()}_${i + 1}`,
                    label: `${prefix} ${i + 1}`,
                    score,
                    max: maxPerItem,
                    pct,
                    isPassing: pct >= 75,
                    isPending: false,
                    isExcused: false
                });
            }
            return items;
        }

        // 1. Written Works
        let wwItems = [];
        if (raw && Array.isArray(raw.wwCols) && raw.wwCols.length && raw.scores && Array.isArray(raw.scores.ww)) {
            wwItems = raw.wwCols.map((col, idx) => {
                const rawVal = raw.scores.ww[idx];
                const isPending = rawVal === '' || rawVal === null || rawVal === undefined;
                const isExcused = rawVal === 'E' || rawVal === 'EX';
                const s = (!isPending && !isExcused && !isNaN(rawVal)) ? Number(rawVal) : null;
                const max = Number(col.max) || 20;
                const pct = s !== null ? Math.min(100, Math.max(0, Math.round((s / max) * 100))) : null;
                return {
                    id: col.id || `ww_${idx + 1}`,
                    label: col.label || `WW ${idx + 1}`,
                    score: s,
                    max,
                    pct,
                    isPassing: pct !== null ? pct >= 75 : false,
                    isPending,
                    isExcused
                };
            });
        } else if (qPct !== null) {
            wwItems = synthesizeItems(Math.min(5, Math.max(1, g.gradedItems || 5)), 'WW', 20, qPct);
        } else {
            wwItems = [1, 2, 3, 4, 5].map(i => ({ id: `ww_${i}`, label: `WW ${i}`, score: null, max: 20, pct: null, isPassing: false, isPending: true, isExcused: false }));
        }

        // 2. Performance Tasks
        let ptItems = [];
        if (raw && Array.isArray(raw.ptCols) && raw.ptCols.length && raw.scores && Array.isArray(raw.scores.pt)) {
            ptItems = raw.ptCols.map((col, idx) => {
                const rawVal = raw.scores.pt[idx];
                const isPending = rawVal === '' || rawVal === null || rawVal === undefined;
                const isExcused = rawVal === 'E' || rawVal === 'EX';
                const s = (!isPending && !isExcused && !isNaN(rawVal)) ? Number(rawVal) : null;
                const max = Number(col.max) || 50;
                const pct = s !== null ? Math.min(100, Math.max(0, Math.round((s / max) * 100))) : null;
                return {
                    id: col.id || `pt_${idx + 1}`,
                    label: col.label || `PT ${idx + 1}`,
                    score: s,
                    max,
                    pct,
                    isPassing: pct !== null ? pct >= 75 : false,
                    isPending,
                    isExcused
                };
            });
        } else if (aPct !== null) {
            ptItems = synthesizeItems(Math.min(3, Math.max(1, g.gradedItems || 3)), 'PT', 50, aPct);
        } else {
            ptItems = [1, 2, 3].map(i => ({ id: `pt_${i}`, label: `PT ${i}`, score: null, max: 50, pct: null, isPassing: false, isPending: true, isExcused: false }));
        }

        // 3. Quarterly Assessments (SA 1, SA 2, Term Exam)
        let qaItems = [];
        if (raw && Array.isArray(raw.qaCols) && raw.qaCols.length && raw.scores && Array.isArray(raw.scores.qa)) {
            qaItems = raw.qaCols.map((col, idx) => {
                const rawVal = raw.scores.qa[idx];
                const isPending = rawVal === '' || rawVal === null || rawVal === undefined;
                const isExcused = rawVal === 'E' || rawVal === 'EX';
                const s = (!isPending && !isExcused && !isNaN(rawVal)) ? Number(rawVal) : null;
                const max = Number(col.max) || (idx === 2 ? 50 : 25);
                const pct = s !== null ? Math.min(100, Math.max(0, Math.round((s / max) * 100))) : null;
                return {
                    id: col.id || `qa_${idx + 1}`,
                    label: col.label || (idx === 2 ? 'Term Exam' : `Summative ${idx + 1}`),
                    score: s,
                    max,
                    pct,
                    isPassing: pct !== null ? pct >= 75 : false,
                    isPending,
                    isExcused
                };
            });
        } else if (ePct !== null) {
            qaItems = [
                { id: 'qa_1', label: '1st Summative (SA1)', max: 25, score: Math.round((ePct / 100) * 25), pct: ePct, isPassing: ePct >= 75, isPending: false, isExcused: false },
                { id: 'qa_2', label: '2nd Summative (SA2)', max: 25, score: Math.round((ePct / 100) * 25), pct: ePct, isPassing: ePct >= 75, isPending: false, isExcused: false },
                { id: 'qa_3', label: 'Term Exam (TE)', max: 50, score: Math.round((ePct / 100) * 50), pct: ePct, isPassing: ePct >= 75, isPending: false, isExcused: false }
            ];
        } else {
            qaItems = [
                { id: 'qa_1', label: '1st Summative (SA1)', max: 25, score: null, pct: null, isPassing: false, isPending: true, isExcused: false },
                { id: 'qa_2', label: '2nd Summative (SA2)', max: 25, score: null, pct: null, isPassing: false, isPending: true, isExcused: false },
                { id: 'qa_3', label: 'Term Exam (TE)', max: 50, score: null, pct: null, isPassing: false, isPending: true, isExcused: false }
            ];
        }

        return {
            wwWeight,
            ptWeight,
            qaWeight,
            qPct,
            aPct,
            ePct,
            hasRealRaw,
            wwItems,
            ptItems,
            qaItems
        };
    }

    function renderAssessmentTrendChart(breakdown, filter = 'all') {
        const canvas = document.getElementById('assessmentTrendCanvas');
        if (!canvas) return;

        if (assessmentTrendChartInstance) {
            assessmentTrendChartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        let activeItems = [];
        if (filter === 'ww') {
            activeItems = breakdown.wwItems.filter(i => !i.isPending && !i.isExcused && i.pct !== null);
        } else if (filter === 'pt') {
            activeItems = breakdown.ptItems.filter(i => !i.isPending && !i.isExcused && i.pct !== null);
        } else if (filter === 'qa') {
            activeItems = breakdown.qaItems.filter(i => !i.isPending && !i.isExcused && i.pct !== null);
        } else {
            activeItems = [
                ...breakdown.wwItems.filter(i => !i.isPending && !i.isExcused && i.pct !== null).map(i => ({ ...i, category: 'WW', color: '#10b981' })),
                ...breakdown.ptItems.filter(i => !i.isPending && !i.isExcused && i.pct !== null).map(i => ({ ...i, category: 'PT', color: '#0a5c2c' })),
                ...breakdown.qaItems.filter(i => !i.isPending && !i.isExcused && i.pct !== null).map(i => ({ ...i, category: 'QA', color: '#f59e0b' }))
            ];
        }

        let labels = [];
        let scores = [];
        let pointBgColors = [];
        let pointBorderColors = [];
        let datasets = [];

        if (!activeItems.length) {
            labels = ['Pending Assessments'];
            scores = [0];
            datasets = [
                {
                    label: 'No Graded Assessments Yet',
                    data: [0],
                    borderColor: '#94a3b8',
                    backgroundColor: 'rgba(148, 163, 184, 0.1)',
                    pointRadius: 0,
                    borderDash: [4, 4]
                }
            ];
        } else {
            labels = activeItems.map(i => i.label);
            scores = activeItems.map(i => i.pct);
            pointBgColors = activeItems.map(i => i.pct >= 75 ? (i.color || '#10b981') : '#ef4444');
            pointBorderColors = activeItems.map(i => i.pct >= 75 ? '#ffffff' : '#991b1b');

            const lineColor = filter === 'ww' ? '#10b981' : (filter === 'pt' ? '#0a5c2c' : (filter === 'qa' ? '#f59e0b' : '#2e7d32'));
            const bgFill = filter === 'ww' ? 'rgba(16, 185, 129, 0.15)' : (filter === 'pt' ? 'rgba(10, 92, 44, 0.15)' : (filter === 'qa' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(46, 125, 50, 0.08)'));

            datasets = [
                {
                    label: filter === 'ww' ? 'Written Works %' : (filter === 'pt' ? 'Performance Tasks %' : (filter === 'qa' ? 'Summative & Exams %' : 'Assessment Score %')),
                    data: scores,
                    borderColor: lineColor,
                    backgroundColor: bgFill,
                    fill: true,
                    tension: 0.35,
                    borderWidth: 2.5,
                    pointBackgroundColor: pointBgColors,
                    pointBorderColor: pointBorderColors,
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                },
                {
                    label: 'Passing Baseline (75%)',
                    data: labels.map(() => 75),
                    borderColor: '#94a3b8',
                    borderWidth: 1.5,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                }
            ];
        }

        datasets.forEach(ds => { ds.clip = false; });

        assessmentTrendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 16,
                        right: 20,
                        bottom: 6,
                        left: 10
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            boxWidth: 8,
                            font: { size: 10, weight: 'bold' }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleFont: { size: 11, weight: 'bold' },
                        bodyFont: { size: 11 },
                        padding: 10,
                        callbacks: {
                            label: (context) => {
                                if (context.datasetIndex === 1) return 'Passing Baseline: 75%';
                                const item = activeItems[context.dataIndex];
                                if (item) {
                                    return `${item.label}: ${item.score}/${item.max} (${item.pct}%) — ${item.isPassing ? 'Passed' : 'Needs Review'}`;
                                }
                                return `${context.parsed.y}%`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        min: 0,
                        max: 100,
                        grace: '5%',
                        ticks: {
                            stepSize: 25,
                            callback: (v) => `${v}%`,
                            font: { size: 10, weight: 'bold' },
                            color: '#1e3a8a'
                        },
                        grid: { color: '#f1f5f9' }
                    },
                    x: {
                        ticks: {
                            font: { size: 9, weight: 'bold' },
                            color: '#334155'
                        },
                        grid: { color: '#f8fafc' }
                    }
                }
            }
        });
    }

    function renderAssessmentItemList(items, containerId, footerId) {
        const el = document.getElementById(containerId);
        if (!el) return;
        if (!items || !items.length) {
            el.innerHTML = '<div class="p-3 text-center text-muted micro-text">No scores recorded yet.</div>';
            const footerEl = document.getElementById(footerId);
            if (footerEl) footerEl.innerHTML = '<span class="micro-text text-muted">No records</span>';
            return;
        }

        const gradedItems = items.filter(item => !item.isPending && !item.isExcused && item.score !== null);
        const totalScore = gradedItems.reduce((sum, item) => sum + Number(item.score || 0), 0);
        const totalMax = gradedItems.reduce((sum, item) => sum + Number(item.max || 0), 0);
        const avgPct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : null;

        el.innerHTML = items.map(item => {
            if (item.isPending) {
                return `
                    <div class="assessment-item-row d-flex justify-content-between align-items-center opacity-75">
                        <div class="d-flex align-items-center gap-2">
                            <span class="item-tag-pill fw-bold text-muted bg-light border px-2 py-0.5 rounded">${escapeHtml(item.label)}</span>
                            <span class="micro-text text-muted">Max: ${item.max} pts</span>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-light text-secondary border micro-text fw-semibold px-2 py-1 rounded-pill">
                                <i class="bi bi-clock me-1"></i> Pending
                            </span>
                        </div>
                    </div>
                `;
            }

            if (item.isExcused) {
                return `
                    <div class="assessment-item-row d-flex justify-content-between align-items-center opacity-75">
                        <div class="d-flex align-items-center gap-2">
                            <span class="item-tag-pill fw-bold text-muted bg-light border px-2 py-0.5 rounded">${escapeHtml(item.label)}</span>
                            <span class="micro-text text-muted">Max: ${item.max} pts</span>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-info-subtle text-info border border-info-subtle micro-text fw-semibold px-2 py-1 rounded-pill">
                                <i class="bi bi-shield-check me-1"></i> Excused
                            </span>
                        </div>
                    </div>
                `;
            }

            let badgeClass = 'bg-danger-subtle text-danger border border-danger-subtle';
            let barColor = 'bg-danger';
            if (item.pct >= 75) {
                badgeClass = 'bg-success-subtle text-success border border-success-subtle';
                barColor = 'bg-success';
            } else if (item.pct >= 60) {
                badgeClass = 'bg-warning-subtle text-warning border border-warning-subtle';
                barColor = 'bg-warning';
            }

            return `
                <div class="assessment-item-row d-flex justify-content-between align-items-center">
                    <div class="d-flex align-items-center gap-2">
                        <span class="item-tag-pill fw-bold text-dark bg-light border px-2 py-0.5 rounded">${escapeHtml(item.label)}</span>
                        <span class="micro-text text-muted">Score: <strong class="text-dark">${item.score}</strong> / ${item.max}</span>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <div class="progress d-none d-sm-block" style="width: 50px; height: 5px; border-radius: 4px;">
                            <div class="progress-bar ${barColor}" style="width: ${Math.min(100, item.pct)}%;"></div>
                        </div>
                        <span class="badge ${badgeClass} micro-text fw-bold px-2 py-1 rounded-pill" style="min-width: 44px; text-align: center;">
                            ${item.pct}%
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        const footerEl = document.getElementById(footerId);
        if (footerEl) {
            if (!gradedItems.length) {
                footerEl.innerHTML = `<span class="micro-text text-muted">No graded items yet (0 of ${items.length} graded)</span>`;
            } else {
                const isPassing = avgPct >= 75;
                footerEl.innerHTML = `
                    <span>Earned: <strong class="text-dark">${totalScore}</strong> / ${totalMax} pts (${gradedItems.length}/${items.length} graded)</span>
                    <span>Average: <strong class="${isPassing ? 'text-success' : (avgPct >= 60 ? 'text-warning' : 'text-danger')}">${avgPct}%</strong></span>
                `;
            }
        }
    }

    function wireAssessmentModalEvents() {
        const filterContainer = document.getElementById('assessmentFilterPills');
        if (filterContainer && !filterContainer.dataset.wired) {
            filterContainer.dataset.wired = 'true';
            filterContainer.querySelectorAll('.assessment-pill-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    filterContainer.querySelectorAll('.assessment-pill-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentAssessmentFilter = btn.getAttribute('data-filter') || 'all';
                    if (currentAssessmentSubject) {
                        const breakdown = getSubjectAssessmentBreakdown(currentAssessmentSubject);
                        renderAssessmentTrendChart(breakdown, currentAssessmentFilter);
                    }
                });
            });
        }

        const termSelect = document.getElementById('modalAssessmentTermSelect');
        if (termSelect && !termSelect.dataset.wired) {
            termSelect.dataset.wired = 'true';
            termSelect.addEventListener('change', (e) => {
                const chosenTerm = e.target.value;
                if (!currentAssessmentSubject) return;
                const subjectId = currentAssessmentSubject.subjectId;
                const allGrades = Array.isArray(gradeState.grades) ? gradeState.grades : [];
                const matchingGrade = allGrades.find(gr => 
                    String(gr.subjectId) === String(subjectId) &&
                    (gr.term || '').trim().toLowerCase() === chosenTerm.trim().toLowerCase()
                );
                const resolvedGrade = matchingGrade || {
                    gradeId: null,
                    subjectId: currentAssessmentSubject.subjectId,
                    subjectCode: currentAssessmentSubject.subjectCode,
                    subject: currentAssessmentSubject.subject,
                    classification: currentAssessmentSubject.classification,
                    teacherName: currentAssessmentSubject.teacherName,
                    term: chosenTerm,
                    quiz_score: null,
                    activity_score: null,
                    exam_score: null,
                    average: null,
                    rawAverage: null,
                    quizPct: null,
                    activityPct: null,
                    examPct: null,
                    ww_weight: currentAssessmentSubject.ww_weight || 20,
                    pt_weight: currentAssessmentSubject.pt_weight || 50,
                    qa_weight: currentAssessmentSubject.qa_weight || 30,
                    remarks: 'Pending',
                    status: 'Pending',
                    gradedItems: 0,
                    totalItems: 0,
                    raw_scores: null
                };
                openAssessmentBreakdownModal(resolvedGrade, false);
            });
        }
    }

    function openAssessmentBreakdownModal(g, shouldShow = true) {
        if (!g) return;
        currentAssessmentSubject = g;
        currentAssessmentFilter = 'all';

        wireAssessmentModalEvents();

        // Sync in-modal term selector
        const termSelect = document.getElementById('modalAssessmentTermSelect');
        if (termSelect) {
            const desiredTerm = g.term || (currentTermFilter && currentTermFilter !== 'all' ? currentTermFilter : '1st Term');
            termSelect.value = desiredTerm;
        }

        // Reset active filter pill to 'all'
        const filterContainer = document.getElementById('assessmentFilterPills');
        if (filterContainer) {
            filterContainer.querySelectorAll('.assessment-pill-btn').forEach(b => {
                if (b.getAttribute('data-filter') === 'all') b.classList.add('active');
                else b.classList.remove('active');
            });
        }

        const breakdown = getSubjectAssessmentBreakdown(g);

        // Subject meta
        const metaEl = document.getElementById('assessmentModalSubjectMeta');
        if (metaEl) {
            metaEl.textContent = `${g.subject} (${g.term || currentTermFilter || '1st Term'}) • Teacher: ${g.teacherName || 'Assigned Teacher'}`;
        }

        function getScoreTextColor(pct) {
            if (pct === null || pct === undefined) return 'text-muted';
            if (pct >= 75) return 'text-success';
            if (pct >= 60) return 'text-warning';
            return 'text-danger';
        }

        function getPctBadgeClass(pct) {
            if (pct === null || pct === undefined) return 'bg-light text-secondary border';
            if (pct >= 75) return 'bg-success-subtle text-success border border-success-subtle';
            if (pct >= 60) return 'bg-warning-subtle text-warning border border-warning-subtle';
            return 'bg-danger-subtle text-danger border border-danger-subtle';
        }

        // Summary strip
        const wwScoreEl = document.getElementById('summaryWwScore');
        if (wwScoreEl) {
            if (breakdown.qPct !== null) {
                wwScoreEl.textContent = `${breakdown.qPct}%`;
                wwScoreEl.className = `fs-5 fw-bold ${getScoreTextColor(breakdown.qPct)}`;
            } else {
                wwScoreEl.textContent = 'Pending';
                wwScoreEl.className = 'fs-5 fw-bold text-muted';
            }
        }
        const wwWeightEl = document.getElementById('summaryWwWeight');
        if (wwWeightEl) wwWeightEl.textContent = `Weight: ${breakdown.wwWeight}%`;

        const ptScoreEl = document.getElementById('summaryPtScore');
        if (ptScoreEl) {
            if (breakdown.aPct !== null) {
                ptScoreEl.textContent = `${breakdown.aPct}%`;
                ptScoreEl.className = `fs-5 fw-bold ${getScoreTextColor(breakdown.aPct)}`;
            } else {
                ptScoreEl.textContent = 'Pending';
                ptScoreEl.className = 'fs-5 fw-bold text-muted';
            }
        }
        const ptWeightEl = document.getElementById('summaryPtWeight');
        if (ptWeightEl) ptWeightEl.textContent = `Weight: ${breakdown.ptWeight}%`;

        const qaScoreEl = document.getElementById('summaryQaScore');
        if (qaScoreEl) {
            if (breakdown.ePct !== null) {
                qaScoreEl.textContent = `${breakdown.ePct}%`;
                qaScoreEl.className = `fs-5 fw-bold ${getScoreTextColor(breakdown.ePct)}`;
            } else {
                qaScoreEl.textContent = 'Pending';
                qaScoreEl.className = 'fs-5 fw-bold text-muted';
            }
        }
        const qaWeightEl = document.getElementById('summaryQaWeight');
        if (qaWeightEl) qaWeightEl.textContent = `Weight: ${breakdown.qaWeight}%`;

        const finalGradeEl = document.getElementById('summaryFinalGrade');
        if (finalGradeEl) finalGradeEl.textContent = (g.average !== null && g.average !== undefined && g.average !== '') ? g.average : '—';
        const finalRemarksEl = document.getElementById('summaryFinalRemarks');
        if (finalRemarksEl) {
            const hasAvg = g.average !== null && g.average !== undefined && g.average !== '' && !isNaN(Number(g.average));
            const passed = hasAvg && Number(g.average) >= 75;
            finalRemarksEl.innerHTML = hasAvg 
                ? `<span class="badge ${passed ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-danger-subtle text-danger border border-danger-subtle'} rounded-pill">${escapeHtml(g.remarks || (passed ? 'Passed' : 'Needs Remediation'))}</span>` 
                : '<span class="badge bg-light text-secondary border rounded-pill">Pending</span>';
        }

        // Column Badges & Subtext with dynamic color-coding
        const colWwBadge = document.getElementById('colWwBadge');
        if (colWwBadge) {
            colWwBadge.textContent = breakdown.qPct !== null ? `${breakdown.qPct}%` : 'Pending';
            colWwBadge.className = `badge micro-text rounded-pill ${getPctBadgeClass(breakdown.qPct)}`;
        }
        const colPtBadge = document.getElementById('colPtBadge');
        if (colPtBadge) {
            colPtBadge.textContent = breakdown.aPct !== null ? `${breakdown.aPct}%` : 'Pending';
            colPtBadge.className = `badge micro-text rounded-pill ${getPctBadgeClass(breakdown.aPct)}`;
        }
        const colQaBadge = document.getElementById('colQaBadge');
        if (colQaBadge) {
            colQaBadge.textContent = breakdown.ePct !== null ? `${breakdown.ePct}%` : 'Pending';
            colQaBadge.className = `badge micro-text rounded-pill ${getPctBadgeClass(breakdown.ePct)}`;
        }

        const colWwSubtext = document.getElementById('colWwSubtext');
        if (colWwSubtext) {
            const gradedCount = breakdown.wwItems.filter(i => !i.isPending && !i.isExcused && i.score !== null).length;
            colWwSubtext.textContent = breakdown.wwItems.length 
                ? (gradedCount > 0 ? `${gradedCount} of ${breakdown.wwItems.length} Graded` : `${breakdown.wwItems.length} Items • Pending`) 
                : 'Pending';
        }
        const colPtSubtext = document.getElementById('colPtSubtext');
        if (colPtSubtext) {
            const gradedCount = breakdown.ptItems.filter(i => !i.isPending && !i.isExcused && i.score !== null).length;
            colPtSubtext.textContent = breakdown.ptItems.length 
                ? (gradedCount > 0 ? `${gradedCount} of ${breakdown.ptItems.length} Graded` : `${breakdown.ptItems.length} Items • Pending`) 
                : 'Pending';
        }
        const colQaSubtext = document.getElementById('colQaSubtext');
        if (colQaSubtext) {
            const gradedCount = breakdown.qaItems.filter(i => !i.isPending && !i.isExcused && i.score !== null).length;
            colQaSubtext.textContent = breakdown.qaItems.length 
                ? (gradedCount > 0 ? `${gradedCount} of ${breakdown.qaItems.length} Graded` : `${breakdown.qaItems.length} Items • Pending`) 
                : 'Pending';
        }

        const dataModeBadge = document.getElementById('assessmentDataModeBadge');
        if (dataModeBadge) {
            dataModeBadge.textContent = breakdown.hasRealRaw ? 'Official Recorded Scores' : 'Component Grade Assessment Breakdown';
            dataModeBadge.className = `badge micro-text ${breakdown.hasRealRaw ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-light text-secondary border'}`;
        }

        // Render itemized score lists with footers
        renderAssessmentItemList(breakdown.wwItems, 'assessmentWwList', 'colWwFooter');
        renderAssessmentItemList(breakdown.ptItems, 'assessmentPtList', 'colPtFooter');
        renderAssessmentItemList(breakdown.qaItems, 'assessmentQaList', 'colQaFooter');

        if (shouldShow && assessmentModalInstance) {
            assessmentModalInstance.show();
        }

        // Render line graph once modal is rendered
        setTimeout(() => {
            renderAssessmentTrendChart(breakdown, 'all');
        }, 150);

        const assessmentModalEl = document.getElementById('subjectAssessmentModal');
        if (assessmentModalEl && !assessmentModalEl.dataset.listenerAttached) {
            assessmentModalEl.dataset.listenerAttached = 'true';
            assessmentModalEl.addEventListener('shown.bs.modal', () => {
                if (currentAssessmentSubject) {
                    const bd = getSubjectAssessmentBreakdown(currentAssessmentSubject);
                    renderAssessmentTrendChart(bd, currentAssessmentFilter || 'all');
                } else if (assessmentTrendChartInstance) {
                    assessmentTrendChartInstance.resize();
                }
            });
        }
    }

    // =========================================================================
    // 7. PRESCRIPTIVE PATH TO GOAL MODAL & SLIDERS
    // =========================================================================
    const sliderPT = document.getElementById('sliderPT');
    const sliderWW = document.getElementById('sliderWW');
    const sliderExam = document.getElementById('sliderExam');

    const valPT = document.getElementById('valPT');
    const valWW = document.getElementById('valWW');
    const valExam = document.getElementById('valExam');

    const gaugePT = document.getElementById('gaugePT');
    const gaugeWW = document.getElementById('gaugeWW');
    const gaugeExam = document.getElementById('gaugeExam');
    const displayGoalScore = document.getElementById('displayGoalScore');

    let currentGoalSubject = null;
    let currentGoalFeasibility = null;

    function computeTargetFeasibility(g, targetVal) {
        if (!g) return null;
        const wwW = Number(g.ww_weight) || 20;
        const ptW = Number(g.pt_weight) || 50;
        const qaW = Number(g.qa_weight) || 30;

        const quizScore = (g.quiz_score !== null && g.quiz_score !== undefined && !isNaN(Number(g.quiz_score))) ? Number(g.quiz_score) : null;
        const actScore = (g.activity_score !== null && g.activity_score !== undefined && !isNaN(Number(g.activity_score))) ? Number(g.activity_score) : null;
        const examScore = (g.exam_score !== null && g.exam_score !== undefined && !isNaN(Number(g.exam_score))) ? Number(g.exam_score) : null;

        const target = Math.min(100, Math.max(0, Math.round(Number(targetVal) || 75)));

        const isWwRecorded = quizScore !== null;
        const isPtRecorded = actScore !== null;
        const isExamRecorded = examScore !== null;
        const isFullyGraded = isWwRecorded && isPtRecorded && isExamRecorded;

        const wwPct = isWwRecorded ? Math.min(100, Math.max(0, Math.round((quizScore / wwW) * 100))) : null;
        const ptPct = isPtRecorded ? Math.min(100, Math.max(0, Math.round((actScore / ptW) * 100))) : null;
        const examPct = isExamRecorded ? Math.min(100, Math.max(0, Math.round((examScore / qaW) * 100))) : null;

        const lockedPoints = (isWwRecorded ? quizScore : 0) + (isPtRecorded ? actScore : 0) + (isExamRecorded ? examScore : 0);
        const unrecordedWeight = (isWwRecorded ? 0 : wwW) + (isPtRecorded ? 0 : ptW) + (isExamRecorded ? 0 : qaW);

        if (isFullyGraded) {
            const finalAvg = g.average !== null ? Number(g.average) : Math.round(lockedPoints);
            return {
                isFullyGraded: true,
                status: 'finalized',
                label: 'Term Finalized',
                badgeClass: 'bg-primary-subtle text-primary border-primary-subtle',
                iconClass: 'bi-info-circle-fill text-primary',
                alertBg: '#eff6ff',
                alertBorder: '#bfdbfe',
                target,
                finalAvg,
                wwW, ptW, qaW,
                wwPct, ptPct, examPct,
                quizScore, actScore, examScore,
                isWwRecorded, isPtRecorded, isExamRecorded,
                lockedPoints,
                unrecordedWeight: 0,
                remainingWeight: 0,
                maxPossible: finalAvg,
                minPossible: finalAvg,
                neededPoints: 0,
                neededScorePct: null,
                remainingName: 'Quarterly Exam',
                summary: `All components recorded. Final quarter grade is ${finalAvg}%.`
            };
        }

        const neededPoints = target - lockedPoints;
        const maxPossible = Math.round(lockedPoints + unrecordedWeight);
        const minPossible = Math.round(lockedPoints);
        const neededScorePct = unrecordedWeight > 0 ? Math.round((neededPoints / unrecordedWeight) * 100) : 0;

        let status = 'feasible';
        let label = 'Achievable Goal';
        let badgeClass = 'bg-success-subtle text-success border-success-subtle';
        let iconClass = 'bi-check-circle-fill text-success';
        let alertBg = '#f0fdf4';
        let alertBorder = '#bbf7d0';

        const remainingName = (!isExamRecorded && isWwRecorded && isPtRecorded) ? 'Quarterly Exam' : 'Remaining Assessments';

        if (target <= minPossible) {
            status = 'secured';
            label = 'Target Guaranteed';
            badgeClass = 'bg-success-subtle text-success border-success-subtle';
            iconClass = 'bi-shield-check text-success';
            alertBg = '#f0fdf4';
            alertBorder = '#bbf7d0';
        } else if (neededScorePct <= 75) {
            status = 'feasible';
            label = 'Highly Achievable';
            badgeClass = 'bg-success-subtle text-success border-success-subtle';
            iconClass = 'bi-check-circle-fill text-success';
            alertBg = '#f0fdf4';
            alertBorder = '#bbf7d0';
        } else if (neededScorePct <= 89) {
            status = 'achievable';
            label = 'Achievable with Focus';
            badgeClass = 'bg-success-subtle text-success border-success-subtle';
            iconClass = 'bi-check-circle-fill text-success';
            alertBg = '#f0fdf4';
            alertBorder = '#bbf7d0';
        } else if (neededScorePct <= 100) {
            status = 'challenging';
            label = 'Challenging Target';
            badgeClass = 'bg-warning-subtle text-warning border-warning-subtle';
            iconClass = 'bi-exclamation-triangle-fill text-warning';
            alertBg = '#fffbeb';
            alertBorder = '#fde68a';
        } else {
            status = 'unfeasible';
            label = 'Out of Reach with Exam Alone';
            badgeClass = 'bg-danger-subtle text-danger border-danger-subtle';
            iconClass = 'bi-x-circle-fill text-danger';
            alertBg = '#fef2f2';
            alertBorder = '#fecaca';
        }

        let summary = '';
        if (status === 'secured') {
            summary = `Goal reached! Your recorded score (${lockedPoints.toFixed(1)} pts) already meets target ${target}.`;
        } else if (status === 'unfeasible') {
            summary = `Target ${target} exceeds max possible (${maxPossible}% with 100% on ${remainingName}).`;
        } else {
            summary = `Need ${neededScorePct}% score (${neededPoints.toFixed(1)} / ${unrecordedWeight} pts) on ${remainingName}.`;
        }

        return {
            isFullyGraded: false,
            status,
            label,
            badgeClass,
            iconClass,
            alertBg,
            alertBorder,
            target,
            wwW, ptW, qaW,
            wwPct, ptPct, examPct,
            quizScore, actScore, examScore,
            isWwRecorded, isPtRecorded, isExamRecorded,
            lockedPoints,
            unrecordedWeight,
            remainingWeight: unrecordedWeight,
            remainingName,
            neededPoints,
            neededScorePct,
            maxPossible,
            minPossible,
            summary
        };
    }

    function updateInlineTargetPreview(g, targetVal, cardEl) {
        if (!g) return;
        const safeTerm = (g.term || 'term').replace(/\s+/g, '');
        const previewEl = cardEl ? cardEl.querySelector(`#target-preview-${g.subjectId}-${safeTerm}`) : document.getElementById(`target-preview-${g.subjectId}-${safeTerm}`);
        if (!previewEl) return;

        const feas = computeTargetFeasibility(g, targetVal);
        if (!feas) return;

        if (feas.isFullyGraded) {
            previewEl.innerHTML = `
                <div class="d-flex align-items-center justify-content-between mb-1">
                    <span class="micro-text fw-bold text-dark d-flex align-items-center gap-1">
                        <i class="${feas.iconClass}"></i> ${feas.label}
                    </span>
                    <span class="badge ${feas.badgeClass} micro-text rounded-pill py-0.5 px-2">Finalized</span>
                </div>
                <p class="micro-text text-secondary mb-0">All items recorded. Term grade is <strong>${feas.finalAvg}%</strong>.</p>
            `;
            return;
        }

        let progressPct = Math.min(100, Math.max(0, feas.neededScorePct || 0));
        let progressBg = feas.status === 'unfeasible' ? 'bg-danger' : (feas.status === 'challenging' ? 'bg-warning' : 'bg-success');

        previewEl.innerHTML = `
            <div class="d-flex align-items-center justify-content-between mb-1.5">
                <span class="micro-text fw-bold text-dark d-flex align-items-center gap-1">
                    <i class="${feas.iconClass}"></i> ${feas.label}
                </span>
                <span class="badge ${feas.badgeClass} micro-text rounded-pill py-0.5 px-2">Target: ${feas.target}</span>
            </div>
            <div class="micro-text text-dark mb-1.5">
                ${feas.summary}
            </div>
            ${feas.status !== 'secured' && feas.status !== 'unfeasible' ? `
                <div class="d-flex align-items-center gap-2">
                    <div class="progress flex-grow-1" style="height: 6px;">
                        <div class="progress-bar ${progressBg}" role="progressbar" style="width: ${progressPct}%;" aria-valuenow="${progressPct}" aria-valuemin="0" aria-valuemax="100"></div>
                    </div>
                    <span class="micro-text fw-bold text-dark">${progressPct}%</span>
                </div>
            ` : ''}
            ${feas.status === 'unfeasible' ? `
                <div class="micro-text text-danger mt-1">
                    <i class="bi bi-info-circle me-1"></i>Suggested achievable target: <strong>${feas.maxPossible}%</strong>
                </div>
            ` : ''}
        `;
    }

    function updateGoalCalculations() {
        if (!sliderPT || !sliderWW || !sliderExam) return;

        const pt = parseFloat(sliderPT.value) || 0;
        const ww = parseFloat(sliderWW.value) || 0;
        const exam = parseFloat(sliderExam.value) || 0;

        const wwW = (currentGoalSubject && currentGoalSubject.ww_weight) ? Number(currentGoalSubject.ww_weight) / 100 : 0.20;
        const ptW = (currentGoalSubject && currentGoalSubject.pt_weight) ? Number(currentGoalSubject.pt_weight) / 100 : 0.50;
        const qaW = (currentGoalSubject && currentGoalSubject.qa_weight) ? Number(currentGoalSubject.qa_weight) / 100 : 0.30;
        const computedGoal = Math.min(100, Math.round((pt * ptW) + (ww * wwW) + (exam * qaW)));

        const slValPT = document.getElementById('slValPT');
        const slValWW = document.getElementById('slValWW');
        const slValExam = document.getElementById('slValExam');
        const simulatedQuarterGrade = document.getElementById('simulatedQuarterGrade');

        if (slValPT) slValPT.textContent = `${pt}%`;
        if (slValWW) slValWW.textContent = `${ww}%`;
        if (slValExam) slValExam.textContent = `${exam}%`;

        if (simulatedQuarterGrade) {
            const targetScore = currentGoalFeasibility ? currentGoalFeasibility.target : 75;
            simulatedQuarterGrade.textContent = `${computedGoal}%`;
            simulatedQuarterGrade.className = computedGoal >= targetScore ? 'text-success fw-bold ms-1' : (computedGoal >= 75 ? 'text-primary fw-bold ms-1' : 'text-danger fw-bold ms-1');
        }

        // Dynamically update radial gauges if not locked
        if (currentGoalFeasibility) {
            if (!currentGoalFeasibility.isPtRecorded) {
                if (valPT) valPT.textContent = `${pt}%`;
                if (gaugePT) {
                    gaugePT.style.setProperty('--val', pt);
                    gaugePT.style.setProperty('--stroke-color', pt >= 75 ? '#0a5c2c' : '#ef4444');
                }
            }
            if (!currentGoalFeasibility.isWwRecorded) {
                if (valWW) valWW.textContent = `${ww}%`;
                if (gaugeWW) {
                    gaugeWW.style.setProperty('--val', ww);
                    gaugeWW.style.setProperty('--stroke-color', ww >= 75 ? '#10b981' : '#ef4444');
                }
            }
            if (!currentGoalFeasibility.isExamRecorded) {
                if (valExam) valExam.textContent = `${exam}%`;
                if (gaugeExam) {
                    gaugeExam.style.setProperty('--val', exam);
                    gaugeExam.style.setProperty('--stroke-color', exam >= 75 ? '#f59e0b' : '#ef4444');
                }
            }
        }
    }

    if (sliderPT && sliderWW && sliderExam) {
        sliderPT.addEventListener('input', updateGoalCalculations);
        sliderWW.addEventListener('input', updateGoalCalculations);
        sliderExam.addEventListener('input', updateGoalCalculations);
    }

    async function openPrescriptiveGoalModal(subjectId, subjectName, term, goalValue) {
        const goalSubjectTitle = document.getElementById('goalSubjectTitle');
        const mlRiskForecast = document.getElementById('mlRiskForecast');
        const prescriptiveListContainer = document.getElementById('prescriptiveListContainer');
        const displayCurrentGrade = document.getElementById('displayCurrentGrade');
        const displayCurrentTermLabel = document.getElementById('displayCurrentTermLabel');
        const goalFeasibilityBanner = document.getElementById('goalFeasibilityBanner');
        const goalFeasibilityIcon = document.getElementById('goalFeasibilityIcon');
        const goalFeasibilityTitle = document.getElementById('goalFeasibilityTitle');
        const goalFeasibilityDesc = document.getElementById('goalFeasibilityDesc');

        const allGrades = Array.isArray(gradeState.grades) ? gradeState.grades : [];
        currentGoalSubject = allGrades.find(
            (g) => String(g.subjectId) === String(subjectId) &&
                   (term ? (g.term || '').trim().toLowerCase() === term.trim().toLowerCase() : true)
        ) || allGrades.find(g => String(g.subjectId) === String(subjectId)) || null;

        if (!currentGoalSubject) return;

        const feas = computeTargetFeasibility(currentGoalSubject, goalValue);
        currentGoalFeasibility = feas;

        if (goalSubjectTitle) {
            goalSubjectTitle.textContent = `${subjectName} • ${term} • ${currentGoalSubject.teacherName || 'Assigned Teacher'}`;
        }
        if (displayGoalScore) {
            displayGoalScore.textContent = feas.target;
        }
        if (displayCurrentGrade) {
            displayCurrentGrade.textContent = currentGoalSubject.average !== null ? `${currentGoalSubject.average}%` : 'Pending';
        }
        if (displayCurrentTermLabel) {
            displayCurrentTermLabel.textContent = `Current Running Grade (${term})`;
        }

        // Feasibility Banner
        if (goalFeasibilityBanner) {
            goalFeasibilityBanner.style.backgroundColor = feas.alertBg;
            goalFeasibilityBanner.style.borderColor = feas.alertBorder;
        }
        if (goalFeasibilityIcon) {
            goalFeasibilityIcon.className = `bi ${feas.iconClass} fs-5 mt-0.5 flex-shrink-0`;
        }
        if (goalFeasibilityTitle) {
            goalFeasibilityTitle.textContent = feas.label;
        }
        if (goalFeasibilityDesc) {
            if (feas.isFullyGraded) {
                goalFeasibilityDesc.innerHTML = `All components for <strong>${escapeHtml(term)}</strong> have been submitted and finalized. Final grade: <strong>${feas.finalAvg}%</strong>.`;
            } else if (feas.status === 'unfeasible') {
                goalFeasibilityDesc.innerHTML = `Your recorded score is <strong>${feas.lockedPoints.toFixed(1)}</strong> points. Even with a perfect 100% score (${feas.unrecordedWeight} pts) on the ${feas.remainingName}, the highest reachable grade is <strong>${feas.maxPossible}%</strong>. We recommend aiming for <strong>${feas.maxPossible}%</strong> or requesting review activities with your teacher.`;
            } else if (feas.status === 'secured') {
                goalFeasibilityDesc.innerHTML = `Your current recorded score of <strong>${feas.lockedPoints.toFixed(1)}</strong> points already meets your goal of <strong>${feas.target}</strong>. Continue your current learning pace!`;
            } else {
                goalFeasibilityDesc.innerHTML = `With your current scores (${feas.lockedPoints.toFixed(1)} locked pts), you need <strong>${feas.neededPoints.toFixed(1)} / ${feas.unrecordedWeight} points (${feas.neededScorePct}%)</strong> on your upcoming <strong>${feas.remainingName}</strong> to achieve your target grade of <strong>${feas.target}</strong>.`;
            }
        }

        // Component 1: Written Works
        const elWw = document.getElementById('goalWwWeightLabel');
        const badgeWW = document.getElementById('badgeWW');
        const subtextWW = document.getElementById('subtextWW');
        if (elWw) elWw.textContent = `Written Works (${feas.wwW}%)`;
        if (badgeWW) {
            badgeWW.textContent = feas.isWwRecorded ? 'Recorded (Locked)' : 'Target';
            badgeWW.className = feas.isWwRecorded ? 'badge bg-primary-subtle text-primary border border-primary-subtle micro-text rounded-pill mb-2 px-2 py-0.5' : 'badge bg-light text-secondary border micro-text rounded-pill mb-2 px-2 py-0.5';
        }
        if (valWW) valWW.textContent = feas.isWwRecorded ? `${feas.wwPct}%` : `${feas.target}%`;
        if (gaugeWW) {
            gaugeWW.style.setProperty('--val', feas.isWwRecorded ? feas.wwPct : feas.target);
            gaugeWW.style.setProperty('--stroke-color', feas.isWwRecorded && feas.wwPct < 75 ? '#ef4444' : '#10b981');
        }
        if (subtextWW) {
            subtextWW.textContent = feas.isWwRecorded ? `Score: ${feas.quizScore.toFixed(1)} / ${feas.wwW} pts` : `Target: ${feas.target}%`;
        }

        // Component 2: Performance Tasks
        const elPt = document.getElementById('goalPtWeightLabel');
        const badgePT = document.getElementById('badgePT');
        const subtextPT = document.getElementById('subtextPT');
        if (elPt) elPt.textContent = `Performance Tasks (${feas.ptW}%)`;
        if (badgePT) {
            badgePT.textContent = feas.isPtRecorded ? 'Recorded (Locked)' : 'Target';
            badgePT.className = feas.isPtRecorded ? 'badge bg-primary-subtle text-primary border border-primary-subtle micro-text rounded-pill mb-2 px-2 py-0.5' : 'badge bg-light text-secondary border micro-text rounded-pill mb-2 px-2 py-0.5';
        }
        if (valPT) valPT.textContent = feas.isPtRecorded ? `${feas.ptPct}%` : `${feas.target}%`;
        if (gaugePT) {
            gaugePT.style.setProperty('--val', feas.isPtRecorded ? feas.ptPct : feas.target);
            gaugePT.style.setProperty('--stroke-color', feas.isPtRecorded && feas.ptPct < 75 ? '#ef4444' : '#0a5c2c');
        }
        if (subtextPT) {
            subtextPT.textContent = feas.isPtRecorded ? `Score: ${feas.actScore.toFixed(1)} / ${feas.ptW} pts` : `Target: ${feas.target}%`;
        }

        // Component 3: Quarterly Assessment
        const elExam = document.getElementById('goalExamWeightLabel');
        const badgeExam = document.getElementById('badgeExam');
        const subtextExam = document.getElementById('subtextExam');
        if (elExam) elExam.textContent = `Quarterly Assessment (${feas.qaW}%)`;
        if (feas.isExamRecorded) {
            if (badgeExam) {
                badgeExam.textContent = 'Recorded (Locked)';
                badgeExam.className = 'badge bg-primary-subtle text-primary border border-primary-subtle micro-text rounded-pill mb-2 px-2 py-0.5';
            }
            if (valExam) valExam.textContent = `${feas.examPct}%`;
            if (gaugeExam) {
                gaugeExam.style.setProperty('--val', feas.examPct);
                gaugeExam.style.setProperty('--stroke-color', feas.examPct >= 75 ? '#f59e0b' : '#ef4444');
            }
            if (subtextExam) subtextExam.textContent = `Score: ${feas.examScore.toFixed(1)} / ${feas.qaW} pts`;
        } else {
            const qaTargetClamped = Math.min(100, Math.max(0, feas.neededScorePct));
            if (badgeExam) {
                badgeExam.textContent = feas.status === 'unfeasible' ? 'Out of Reach' : 'Required Target';
                badgeExam.className = feas.status === 'unfeasible' ? 'badge bg-danger-subtle text-danger border border-danger-subtle micro-text rounded-pill mb-2 px-2 py-0.5' : 'badge bg-success-subtle text-success border border-success-subtle micro-text rounded-pill mb-2 px-2 py-0.5';
            }
            if (valExam) valExam.textContent = `${qaTargetClamped}%`;
            if (gaugeExam) {
                gaugeExam.style.setProperty('--val', qaTargetClamped);
                gaugeExam.style.setProperty('--stroke-color', feas.status === 'unfeasible' ? '#ef4444' : (qaTargetClamped > 90 ? '#f59e0b' : '#10b981'));
            }
            if (subtextExam) {
                subtextExam.textContent = `Need: ${Math.max(0, feas.neededPoints).toFixed(1)} / ${feas.qaW} pts`;
            }
        }

        // Sliders Setup
        const slWw = document.getElementById('goalSliderWwLabel');
        const slPt = document.getElementById('goalSliderPtLabel');
        const slExam = document.getElementById('goalSliderExamLabel');
        if (slWw) slWw.innerHTML = `Written Works (${feas.wwW}%) ${feas.isWwRecorded ? '<span class="text-primary micro-text ms-1"><i class="bi bi-lock-fill"></i> Locked</span>' : ''}`;
        if (slPt) slPt.innerHTML = `Performance Tasks (${feas.ptW}%) ${feas.isPtRecorded ? '<span class="text-primary micro-text ms-1"><i class="bi bi-lock-fill"></i> Locked</span>' : ''}`;
        if (slExam) slExam.innerHTML = `Quarterly Assessment (${feas.qaW}%) ${feas.isExamRecorded ? '<span class="text-primary micro-text ms-1"><i class="bi bi-lock-fill"></i> Locked</span>' : ''}`;

        if (sliderWW) {
            sliderWW.value = feas.isWwRecorded ? feas.wwPct : feas.target;
            sliderWW.disabled = feas.isWwRecorded;
        }
        if (sliderPT) {
            sliderPT.value = feas.isPtRecorded ? feas.ptPct : feas.target;
            sliderPT.disabled = feas.isPtRecorded;
        }
        if (sliderExam) {
            sliderExam.value = feas.isExamRecorded ? feas.examPct : Math.min(100, Math.max(0, feas.neededScorePct));
            sliderExam.disabled = feas.isExamRecorded;
        }

        updateGoalCalculations();

        // Practice Links
        const btnPractice = document.getElementById('btnGoalPracticeQuizzes');
        if (btnPractice) {
            btnPractice.href = `quiz_taker_student.html?subject=${encodeURIComponent(subjectName)}&source=practice`;
        }
        const btnReview = document.getElementById('btnGoalReviewLessons');
        if (btnReview) {
            btnReview.href = `subject_detail_student.html?subject=${encodeURIComponent(subjectName)}`;
        }

        if (prescriptiveListContainer) {
            prescriptiveListContainer.innerHTML = `
                <div class="text-center py-3 text-muted micro-text">
                    <div class="spinner-border spinner-border-sm text-success me-1" role="status"></div>
                    Calculating AI prescriptive path...
                </div>
            `;
        }

        if (goalModalInstance) {
            goalModalInstance.show();
        }

        // Fetch ML Prescriptive Recommendation
        try {
            const res = await fetch(`${API_BASE}/api/grades/prescriptive-path?subjectId=${subjectId}&term=${encodeURIComponent(term)}&targetGrade=${feas.target}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (res.ok) {
                const mlData = await res.json();
                if (mlData.success) {
                    renderPrescriptiveRecommendations(mlData, feas);
                } else {
                    renderPrescriptiveFallback(feas);
                }
            } else {
                renderPrescriptiveFallback(feas);
            }
        } catch (e) {
            console.error('Prescriptive path error:', e);
            renderPrescriptiveFallback(feas);
        }
    }

    function renderPrescriptiveRecommendations(mlData, feas) {
        const mlRiskForecast = document.getElementById('mlRiskForecast');
        const prescriptiveListContainer = document.getElementById('prescriptiveListContainer');

        const riskBadgeColor = mlData.predictedRisk === 'High' ? 'text-danger border-danger-subtle' : (mlData.predictedRisk === 'Medium' ? 'text-warning border-warning-subtle' : 'text-success border-success-subtle');
        const riskBg = mlData.predictedRisk === 'High' ? 'bg-danger-subtle' : (mlData.predictedRisk === 'Medium' ? 'bg-warning-subtle' : 'bg-success-subtle');

        if (mlRiskForecast) {
            mlRiskForecast.innerHTML = `
                <span class="badge ${riskBg} ${riskBadgeColor} fw-bold micro-text">
                    Risk Level: ${escapeHtml(mlData.predictedRisk || 'Low')}
                </span>
                <span class="ms-1.5 micro-text text-muted">Model Confidence: <strong>${mlData.confidence ? Math.round(mlData.confidence * 100) : 92}%</strong></span>
            `;
        }

        if (prescriptiveListContainer) {
            const paths = mlData.recommendedPath || [];
            if (paths.length > 0) {
                let recHtml = '<div class="d-flex flex-column gap-2 mb-2">';
                paths.forEach((p, idx) => {
                    const icon = idx === 0 ? 'bi-bullseye' : (idx === 1 ? 'bi-journal-check' : 'bi-lightbulb-fill');
                    recHtml += `
                        <div class="prescriptive-action-card p-3 rounded-3 shadow-2xs d-flex align-items-start gap-2.5">
                            <div class="bg-success-subtle text-success p-1.5 rounded-circle flex-shrink-0 mt-0.5">
                                <i class="bi ${icon} fs-6"></i>
                            </div>
                            <div class="micro-text text-dark flex-grow-1">
                                <strong class="d-block text-dark mb-0.5">${escapeHtml(p.focusArea || 'Priority Action')}</strong>
                                <span class="text-secondary">${escapeHtml(p.action || p.description || '')}</span>
                            </div>
                        </div>
                    `;
                });
                recHtml += '</div>';
                prescriptiveListContainer.innerHTML = recHtml;
            } else {
                renderPrescriptiveFallback(feas);
            }
        }
    }

    function renderPrescriptiveFallback(feas) {
        const prescriptiveListContainer = document.getElementById('prescriptiveListContainer');
        if (!prescriptiveListContainer) return;
        const target = feas ? feas.target : 75;
        const neededPct = feas ? (feas.neededScorePct !== null ? feas.neededScorePct : 75) : 75;

        prescriptiveListContainer.innerHTML = `
            <div class="d-flex flex-column gap-2 mb-2">
                <div class="prescriptive-action-card p-3 rounded-3 d-flex align-items-start gap-2.5">
                    <div class="bg-success-subtle text-success p-1.5 rounded-circle flex-shrink-0 mt-0.5">
                        <i class="bi bi-bullseye fs-6"></i>
                    </div>
                    <div class="micro-text text-dark flex-grow-1">
                        <strong class="d-block text-dark mb-0.5">Assessment Focus</strong>
                        <span class="text-secondary">Target scoring at least ${neededPct}% on your upcoming quarterly assessment to attain your goal of ${target}%.</span>
                    </div>
                </div>
                <div class="prescriptive-action-card p-3 rounded-3 d-flex align-items-start gap-2.5">
                    <div class="bg-primary-subtle text-primary p-1.5 rounded-circle flex-shrink-0 mt-0.5">
                        <i class="bi bi-journal-text fs-6"></i>
                    </div>
                    <div class="micro-text text-dark flex-grow-1">
                        <strong class="d-block text-dark mb-0.5">Concept Mastery & Review</strong>
                        <span class="text-secondary">Review previous quiz topics where points were missed and practice sample assessment questions.</span>
                    </div>
                </div>
            </div>
        `;
    }

    // =========================================================================
    // 8. TOP 4 RADIAL GAUGES CLICK-TO-VIEW TREND MODAL
    // =========================================================================
    function getGaugeProfiles() {
        // Use backend termTrends for terms taken or currently taking (e.g. 1st Term, 2nd Term, 3rd Term)
        const activeTerm = gradeState.activeTerm || '1st Term';
        const trends = Array.isArray(gradeState.termTrends) && gradeState.termTrends.length > 0
            ? gradeState.termTrends
            : [{ term: activeTerm, gwa: gradeState.overallGrade, performanceTaskAvg: gradeState.performanceTaskAvg, writtenWorkAvg: gradeState.writtenWorkAvg, quarterlyExamAvg: gradeState.quarterlyExamAvg }];

        const currentTermTrend = trends.find(t => (t.term || '').trim().toLowerCase() === (currentTermFilter || '').trim().toLowerCase()) 
            || trends.find(t => (t.term || '').trim().toLowerCase() === activeTerm.trim().toLowerCase()) 
            || trends[0];

        const labels = trends.map(t => t.term);
        const gwaData = trends.map(t => (t.gwa !== null && t.gwa !== undefined) ? Number(t.gwa) : null);
        const ptData = trends.map(t => (t.performanceTaskAvg !== null && t.performanceTaskAvg !== undefined) ? Number(t.performanceTaskAvg) : null);
        const wwData = trends.map(t => (t.writtenWorkAvg !== null && t.writtenWorkAvg !== undefined) ? Number(t.writtenWorkAvg) : null);
        const examData = trends.map(t => (t.quarterlyExamAvg !== null && t.quarterlyExamAvg !== undefined) ? Number(t.quarterlyExamAvg) : null);

        const getStats = (dataArr) => {
            const valid = dataArr.filter(v => v !== null && v !== undefined && !isNaN(Number(v)));
            if (!valid.length) {
                return { high: 'Pending', low: 'Pending', avg: 'Pending' };
            }
            const high = Math.max(...valid);
            const low = Math.min(...valid);
            const avg = (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1);
            return { high: `${high}%`, low: `${low}%`, avg: `${avg}%` };
        };

        const gwaStats = getStats(gwaData);
        const ptStats = getStats(ptData);
        const wwStats = getStats(wwData);
        const examStats = getStats(examData);

        const displayGwa = currentTermTrend && currentTermTrend.gwa !== null ? `${currentTermTrend.gwa}%` : (currentTermFilter === 'all' && gradeState.overallGrade ? `${gradeState.overallGrade}%` : 'Pending');
        const displayPt = currentTermTrend && currentTermTrend.performanceTaskAvg !== null ? `${currentTermTrend.performanceTaskAvg}%` : (currentTermFilter === 'all' && gradeState.performanceTaskAvg ? `${gradeState.performanceTaskAvg}%` : 'Pending');
        const displayWw = currentTermTrend && currentTermTrend.writtenWorkAvg !== null ? `${currentTermTrend.writtenWorkAvg}%` : (currentTermFilter === 'all' && gradeState.writtenWorkAvg ? `${gradeState.writtenWorkAvg}%` : 'Pending');
        const displayExam = currentTermTrend && currentTermTrend.quarterlyExamAvg !== null ? `${currentTermTrend.quarterlyExamAvg}%` : (currentTermFilter === 'all' && gradeState.quarterlyExamAvg ? `${gradeState.quarterlyExamAvg}%` : 'Pending');

        return {
            'average': {
                title: 'Average Grade Trend',
                score: displayGwa,
                labels: labels,
                trendData: gwaData,
                high: gwaStats.high,
                low: gwaStats.low,
                avg: gwaStats.avg,
                legend: 'Average GWA'
            },
            'performance': {
                title: 'Performance Task Trend',
                score: displayPt,
                labels: labels,
                trendData: ptData,
                high: ptStats.high,
                low: ptStats.low,
                avg: ptStats.avg,
                legend: 'Performance Tasks'
            },
            'written': {
                title: 'Written Work Trend',
                score: displayWw,
                labels: labels,
                trendData: wwData,
                high: wwStats.high,
                low: wwStats.low,
                avg: wwStats.avg,
                legend: 'Written Works'
            },
            'exam': {
                title: 'Quarterly Assessment Trend',
                score: displayExam,
                labels: labels,
                trendData: examData,
                high: examStats.high,
                low: examStats.low,
                avg: examStats.avg,
                legend: 'Quarterly Assessment'
            }
        };
    }

    let currentActiveGaugeProfile = null;

    function renderGaugeTrendLine(profile) {
        const canvas = document.getElementById('gaugeTrendCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        if (gaugeLineChartInstance) {
            gaugeLineChartInstance.destroy();
        }

        const grad = ctx.createLinearGradient(0, 0, 0, 180);
        grad.addColorStop(0, 'rgba(10, 92, 44, 0.3)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0.02)');

        const rawScores = (profile.trendData || []).filter(v => v !== null && v !== undefined && !isNaN(Number(v))).map(v => Number(v));
        const dataMax = rawScores.length ? Math.max(...rawScores) : 100;
        const dataMin = rawScores.length ? Math.min(...rawScores) : 75;
        const yMax = dataMax > 100 ? Math.ceil((dataMax + 5) / 10) * 10 : 100;
        const yMin = Math.max(0, Math.min(60, Math.floor((dataMin - 10) / 10) * 10));

        gaugeLineChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: profile.labels && profile.labels.length ? profile.labels : ['1st Term'],
                datasets: [{
                    label: profile.legend,
                    data: profile.trendData,
                    spanGaps: false,
                    borderColor: '#0a5c2c',
                    borderWidth: 3,
                    backgroundColor: grad,
                    fill: true,
                    clip: false,
                    pointBackgroundColor: '#0a5c2c',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    tension: 0.2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 20,
                        right: 24,
                        bottom: 8,
                        left: 12
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: (context) => {
                                const val = context.parsed.y;
                                if (val === null || val === undefined || isNaN(val)) {
                                    return `${context.dataset.label || 'Score'}: Pending Examination`;
                                }
                                return `${val}%`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        min: yMin,
                        max: yMax,
                        grace: '5%',
                        ticks: {
                            stepSize: 10,
                            callback: (v) => `${v}%`,
                            color: '#1e3a8a',
                            font: { size: 10, weight: 'bold' }
                        },
                        grid: { color: '#f1f5f9' }
                    },
                    x: {
                        ticks: {
                            color: '#1e3a8a',
                            font: { size: 10, weight: 'bold' }
                        },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    const gaugeTriggers = document.querySelectorAll('.gauge-trigger');
    gaugeTriggers.forEach((trigger) => {
        trigger.addEventListener('click', () => {
            const gaugeType = trigger.getAttribute('data-gauge-type') || 'average';
            const profiles = getGaugeProfiles();
            const profile = profiles[gaugeType] || profiles['average'];

            const modalTitleEl = document.getElementById('modalHeaderTitle');
            const modalScoreEl = document.getElementById('modalScoreDisplay');
            const modalHighEl = document.getElementById('modalHighStat');
            const modalLowEl = document.getElementById('modalLowStat');
            const modalAvgEl = document.getElementById('modalAvgStat');
            const modalLegendEl = document.getElementById('modalLegendLabel');

            if (modalTitleEl) modalTitleEl.textContent = profile.title;
            if (modalScoreEl) modalScoreEl.textContent = profile.score;
            if (modalHighEl) modalHighEl.textContent = profile.high;
            if (modalLowEl) modalLowEl.textContent = profile.low;
            if (modalAvgEl) modalAvgEl.textContent = profile.avg;
            if (modalLegendEl) modalLegendEl.textContent = profile.legend;

            currentActiveGaugeProfile = profile;
            if (gaugeAnalyticsModalInstance) {
                gaugeAnalyticsModalInstance.show();
                setTimeout(() => {
                    renderGaugeTrendLine(profile);
                }, 300);
            }
        });
    });

    const gaugeModalEl = document.getElementById('gaugeAnalyticsModal');
    if (gaugeModalEl && !gaugeModalEl.dataset.listenerAttached) {
        gaugeModalEl.dataset.listenerAttached = 'true';
        gaugeModalEl.addEventListener('shown.bs.modal', () => {
            if (currentActiveGaugeProfile) {
                renderGaugeTrendLine(currentActiveGaugeProfile);
            } else if (gaugeLineChartInstance) {
                gaugeLineChartInstance.resize();
            }
        });
    }

    // =========================================================================
    // 9. QUARTERLY PROGRESS & ACADEMIC INSIGHTS
    // =========================================================================
    function renderQuarterlyProgress(overallGrade, grades) {
        const qpCurrentVal = document.getElementById('qpCurrentVal');
        const qpCurrentBar = document.getElementById('qpCurrentBar');

        const gwa = overallGrade !== null ? parseFloat(overallGrade) : 0;
        if (qpCurrentVal) qpCurrentVal.textContent = gwa > 0 ? `${gwa}` : '--';
        if (qpCurrentBar) {
            qpCurrentBar.style.width = `${Math.min(100, Math.max(0, gwa))}%`;
            qpCurrentBar.setAttribute('aria-valuenow', gwa);
            qpCurrentBar.className = `progress-bar ${gwa >= 85 ? 'bg-success' : (gwa >= 75 ? 'bg-primary' : 'bg-danger')}`;
        }
    }

    function renderAcademicInsights(overallGrade, grades, writtenWorkAvg, performanceTaskAvg, quarterlyExamAvg) {
        const insightsContainer = document.getElementById('academicInsightsContainer');
        if (!insightsContainer) return;

        const gwa = overallGrade !== null ? parseFloat(overallGrade) : 0;
        const isImproving = gwa >= 75;

        // Find lowest scoring subject among graded subjects
        let lowestSubj = null;
        const gradedSubjs = (grades || []).filter((g) => g.average !== null && !isNaN(Number(g.average)));
        if (gradedSubjs.length > 0) {
            lowestSubj = gradedSubjs.reduce((min, cur) => cur.average < min.average ? cur : min, gradedSubjs[0]);
        }

        let honorStatus = 'Active Student Standing';
        let honorIcon = 'bi-award';
        if (gwa >= 98) {
            honorStatus = 'Candidate for With Highest Honors (98-100)';
            honorIcon = 'bi-trophy-fill text-warning';
        } else if (gwa >= 95) {
            honorStatus = 'Candidate for With High Honors (95-97)';
            honorIcon = 'bi-award-fill text-primary';
        } else if (gwa >= 90) {
            honorStatus = 'Candidate for With Honors (90-94)';
            honorIcon = 'bi-patch-check-fill text-success';
        } else if (gwa >= 75) {
            honorStatus = 'Passing Academic Standing (Promoted)';
            honorIcon = 'bi-check-circle-fill text-success';
        } else if (gwa > 0) {
            honorStatus = 'Needs Academic Support / Intervention';
            honorIcon = 'bi-exclamation-circle-fill text-danger';
        }

        insightsContainer.innerHTML = `
            <div class="alert ${isImproving ? 'alert-success' : 'alert-warning'} border-0 m-0 p-3 rounded-4 d-flex align-items-center gap-3">
                <div class="insight-icon bg-white ${isImproving ? 'text-success' : 'text-warning'} rounded-circle p-2 shadow-sm flex-shrink-0">
                    <i class="bi ${isImproving ? 'bi-graph-up-arrow' : 'bi-exclamation-diamond'}"></i>
                </div>
                <div>
                    <h3 class="fw-bold fs-6 text-dark m-0">${isImproving ? 'Improving Performance Trend' : 'Academic Intervention Alert'}</h3>
                    <p class="micro-text text-secondary m-0">
                        ${isImproving ? 'Your general weighted average indicates consistent mastery across learning areas.' : 'Some learning areas require focused review before quarterly assessments.'}
                    </p>
                </div>
            </div>

            <div class="alert alert-primary border-0 m-0 p-3 rounded-4 d-flex align-items-center gap-3">
                <div class="insight-icon bg-white text-primary rounded-circle p-2 shadow-sm flex-shrink-0">
                    <i class="bi ${honorIcon}"></i>
                </div>
                <div>
                    <h3 class="fw-bold fs-6 text-dark m-0">${honorStatus}</h3>
                    <p class="micro-text text-secondary m-0">DepEd Order No. 8, s. 2015 Guidelines on Learner Promotion</p>
                </div>
            </div>

            ${lowestSubj ? `
                <div class="alert alert-warning border-0 m-0 p-3 rounded-4 d-flex align-items-center gap-3">
                    <div class="insight-icon bg-white text-warning rounded-circle p-2 shadow-sm flex-shrink-0">
                        <i class="bi bi-bullseye"></i>
                    </div>
                    <div>
                        <h3 class="fw-bold fs-6 text-dark m-0">Focus Area: ${escapeHtml(lowestSubj.subject)} (${lowestSubj.average}%)</h3>
                        <p class="micro-text text-secondary m-0">Use the Target Grade Calculator to practice quizzes and improve this subject.</p>
                    </div>
                </div>
            ` : ''}
        `;
    }

    // =========================================================================
    // 11. HELPER FUNCTIONS
    // =========================================================================
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Initialize initial fetch
    loadStudentGrades();
});
