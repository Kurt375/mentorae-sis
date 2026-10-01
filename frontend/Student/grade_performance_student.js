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
    const reportCardModalEl = document.getElementById('reportCardModal');
    const reportCardModalInstance = reportCardModalEl ? new bootstrap.Modal(reportCardModalEl) : null;

    const gaugeAnalyticsModalEl = document.getElementById('gaugeAnalyticsModal');
    const gaugeAnalyticsModalInstance = gaugeAnalyticsModalEl ? new bootstrap.Modal(gaugeAnalyticsModalEl) : null;

    const goalModalEl = document.getElementById('prescriptiveGoalModal');
    const goalModalInstance = goalModalEl ? new bootstrap.Modal(goalModalEl) : null;

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
            if (data.activeTerm) {
                currentTermFilter = data.activeTerm;
                const termSelect = document.getElementById('termFilterSelect');
                if (termSelect) {
                    termSelect.value = currentTermFilter;
                }
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

            const withWw = graded.filter(g => g.quizPct !== null && g.quizPct !== undefined);
            if (withWw.length) wwAvg = Math.round(withWw.reduce((s, g) => s + g.quizPct, 0) / withWw.length);

            const withPt = graded.filter(g => g.activityPct !== null && g.activityPct !== undefined);
            if (withPt.length) ptAvg = Math.round(withPt.reduce((s, g) => s + g.activityPct, 0) / withPt.length);

            const withExam = graded.filter(g => g.examPct !== null && g.examPct !== undefined);
            if (withExam.length) examAvg = Math.round(withExam.reduce((s, g) => s + g.examPct, 0) / withExam.length);
        } else if (term === 'all' && gradeState.overallGrade !== null) {
            termGwa = gradeState.overallGrade;
            termRemarks = gradeState.overallRemarks || 'Good Performance';
            wwAvg = gradeState.writtenWorkAvg || 0;
            ptAvg = gradeState.performanceTaskAvg || 0;
            examAvg = gradeState.quarterlyExamAvg || 0;
        }

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
        setGauge('gaugeWrapPT', 'gaugeValPT', ptAvg, ptAvg > 0 ? `${ptAvg}%` : '--');
        setGauge('gaugeWrapWW', 'gaugeValWW', wwAvg, wwAvg > 0 ? `${wwAvg}%` : '--');
        setGauge('gaugeWrapExam', 'gaugeValExam', examAvg, examAvg > 0 ? `${examAvg}%` : '--');
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

        // 4.6 Populate Report Card Modal
        populateReportCardModal();
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

            html += `
                <div class="card subject-grade-card border p-3 rounded-4 bg-white cursor-pointer" data-subject-id="${g.subjectId}">
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

                    <!-- Expandable Drawer for Subject Breakdown & Target Calculator -->
                    <div class="subject-details-drawer d-none mt-4 pt-3 border-top" id="details-${g.subjectId}">
                        ${hasGrade ? `
                        <div class="row g-4 align-items-center">
                            <div class="col-12 col-lg-7">
                                <div class="chart-box p-2">
                                    <div class="d-flex justify-content-between align-items-center px-2 mb-1">
                                        <span class="micro-text fw-bold text-dark text-uppercase">DepEd Component Breakdown</span>
                                        <span class="micro-text text-muted">Weights: WW ${g.ww_weight || 20}% &bull; PT ${g.pt_weight || 50}% &bull; QA ${g.qa_weight || 30}%</span>
                                    </div>
                                    <div style="height: 200px; width: 100%;">
                                        <canvas id="chart-${g.subjectId}" class="subject-analytics-canvas"></canvas>
                                    </div>
                                </div>
                            </div>
                            <div class="col-12 col-lg-5">
                                <div class="calculator-panel p-4 rounded-4 shadow-sm text-center">
                                    <h4 class="fw-bold fs-6 text-dark mb-1">Target Grade Calculator</h4>
                                    <p class="micro-text text-muted mb-3">Estimate required scores to achieve your goal</p>
                                    <div class="mb-3">
                                        <input type="number"
                                            class="form-control target-goal-input text-center mx-auto"
                                            placeholder="Grade Goal" min="75" max="100" value="${defaultGoal}"
                                            id="goal-input-${g.subjectId}">
                                    </div>
                                    <button type="button"
                                        class="btn btn-calc-check w-75 py-2 fw-bold text-white rounded-pill btn-check-target"
                                        data-subject-id="${g.subjectId}"
                                        data-subject-name="${escapeHtml(g.subject)}"
                                        data-term="${escapeHtml(g.term || '1st Term')}"
                                        data-current-grade="${g.average}"
                                        data-quiz="${g.quiz_score || 0}"
                                        data-activity="${g.activity_score || 0}"
                                        data-exam="${g.exam_score || 0}"
                                        data-target-input="goal-input-${g.subjectId}">
                                        <i class="bi bi-stars me-1"></i> Check Target
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
                if (e.target.closest('input') || e.target.closest('button') || e.target.closest('a')) {
                    return;
                }

                const subjectId = card.getAttribute('data-subject-id');
                const drawer = document.getElementById(`details-${subjectId}`);
                if (!drawer) return;

                const isCurrentlyOpen = !drawer.classList.contains('d-none');

                document.querySelectorAll('.subject-details-drawer').forEach((d) => d.classList.add('d-none'));
                document.querySelectorAll('.subject-grade-card').forEach((c) => c.classList.remove('active-card'));

                if (!isCurrentlyOpen) {
                    drawer.classList.remove('d-none');
                    card.classList.add('active-card');

                    const targetGradeObj = gradeState.grades.find((g) => String(g.subjectId) === String(subjectId));
                    if (targetGradeObj && targetGradeObj.average !== null) {
                        setTimeout(() => {
                            renderSubjectDrawerChart(targetGradeObj);
                        }, 50);
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
                const goalValue = targetInput ? parseFloat(targetInput.value) || 85 : 85;

                await openPrescriptiveGoalModal(subjectId, subjectName, term, goalValue);
            });
        });
    }

    // Render multi-bar/line chart inside expanded subject drawer
    function renderSubjectDrawerChart(g) {
        const canvasId = `chart-${g.subjectId}`;
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        if (subjectChartsCache[g.subjectId]) {
            subjectChartsCache[g.subjectId].destroy();
        }

        const ctx = canvas.getContext('2d');
        const wwMax = g.ww_weight || 20;
        const ptMax = g.pt_weight || 50;
        const qaMax = g.qa_weight || 30;
        const qPct = g.quizPct != null ? g.quizPct : Math.min(100, Math.round((Number(g.quiz_score) / wwMax) * 100));
        const aPct = g.activityPct != null ? g.activityPct : Math.min(100, Math.round((Number(g.activity_score) / ptMax) * 100));
        const ePct = g.examPct != null ? g.examPct : Math.min(100, Math.round((Number(g.exam_score) / qaMax) * 100));

        subjectChartsCache[g.subjectId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [`Written Works (${wwMax}%)`, `Performance Tasks (${ptMax}%)`, `Quarterly Assessment (${qaMax}%)`],
                datasets: [
                    {
                        label: 'Current Score %',
                        data: [qPct, aPct, ePct],
                        backgroundColor: [
                            qPct >= 75 ? 'rgba(46, 125, 50, 0.85)' : 'rgba(239, 68, 68, 0.85)',
                            aPct >= 75 ? 'rgba(10, 92, 44, 0.85)' : 'rgba(239, 68, 68, 0.85)',
                            ePct >= 75 ? 'rgba(245, 158, 11, 0.85)' : 'rgba(239, 68, 68, 0.85)'
                        ],
                        borderColor: ['#2e7d32', '#0a5c2c', '#f59e0b'],
                        borderWidth: 1.5,
                        borderRadius: 8,
                        barPercentage: 0.55
                    },
                    {
                        type: 'line',
                        label: 'Passing Baseline (75%)',
                        data: [75, 75, 75],
                        borderColor: '#94a3b8',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
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
                            label: (context) => `${context.dataset.label || 'Score'}: ${context.parsed.y}%`
                        }
                    }
                },
                scales: {
                    y: {
                        min: 0,
                        max: 100,
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
                            color: '#334155'
                        },
                        grid: { display: false }
                    }
                }
            }
        });
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

    function updateGoalCalculations() {
        if (!sliderPT || !sliderWW || !sliderExam) return;

        const pt = parseFloat(sliderPT.value) || 0;
        const ww = parseFloat(sliderWW.value) || 0;
        const exam = parseFloat(sliderExam.value) || 0;

        const wwW = (currentGoalSubject && currentGoalSubject.ww_weight) ? Number(currentGoalSubject.ww_weight) / 100 : 0.20;
        const ptW = (currentGoalSubject && currentGoalSubject.pt_weight) ? Number(currentGoalSubject.pt_weight) / 100 : 0.50;
        const qaW = (currentGoalSubject && currentGoalSubject.qa_weight) ? Number(currentGoalSubject.qa_weight) / 100 : 0.30;
        const computedGoal = Math.min(100, Math.round((pt * ptW) + (ww * wwW) + (exam * qaW)));

        if (valPT) valPT.textContent = `${pt}%`;
        if (valWW) valWW.textContent = `${ww}%`;
        if (valExam) valExam.textContent = `${exam}%`;
        if (displayGoalScore) displayGoalScore.textContent = computedGoal;

        if (gaugePT) gaugePT.style.setProperty('--val', pt);
        if (gaugeWW) gaugeWW.style.setProperty('--val', ww);
        if (gaugeExam) gaugeExam.style.setProperty('--val', exam);
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

        const allGrades = Array.isArray(gradeState.grades) ? gradeState.grades : [];
        currentGoalSubject = allGrades.find(g => String(g.subjectId) === String(subjectId)) || null;

        const wwW = currentGoalSubject?.ww_weight || 20;
        const ptW = currentGoalSubject?.pt_weight || 50;
        const qaW = currentGoalSubject?.qa_weight || 30;

        const elPt = document.getElementById('goalPtWeightLabel');
        if (elPt) elPt.textContent = `Performance Task (${ptW}%)`;
        const elWw = document.getElementById('goalWwWeightLabel');
        if (elWw) elWw.textContent = `Written Work (${wwW}%)`;
        const elExam = document.getElementById('goalExamWeightLabel');
        if (elExam) elExam.textContent = `Quarterly Assessment (${qaW}%)`;

        const slPt = document.getElementById('goalSliderPtLabel');
        if (slPt) slPt.textContent = `Goal Adjustment: Performance Task (${ptW}%)`;
        const slWw = document.getElementById('goalSliderWwLabel');
        if (slWw) slWw.textContent = `Goal Adjustment: Written Work (${wwW}%)`;
        const slExam = document.getElementById('goalSliderExamLabel');
        if (slExam) slExam.textContent = `Goal Adjustment: Quarterly Assessment (${qaW}%)`;

        if (goalSubjectTitle) goalSubjectTitle.textContent = `${subjectName} (${term})`;
        if (displayGoalScore) displayGoalScore.textContent = Math.round(goalValue);

        // Approximate required slider targets
        const targetNum = Math.min(100, Math.max(75, Math.round(goalValue)));
        if (sliderPT) sliderPT.value = Math.min(100, targetNum);
        if (sliderWW) sliderWW.value = Math.min(100, targetNum);
        if (sliderExam) sliderExam.value = Math.min(100, targetNum);
        updateGoalCalculations();

        if (prescriptiveListContainer) {
            prescriptiveListContainer.innerHTML = `
                <div class="text-center py-2 text-muted micro-text">
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
            const res = await fetch(`${API_BASE}/api/grades/prescriptive-path?subjectId=${subjectId}&term=${encodeURIComponent(term)}&targetGrade=${targetNum}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (res.ok) {
                const mlData = await res.json();
                if (mlData.success) {
                    renderPrescriptiveRecommendations(mlData);
                }
            }
        } catch (e) {
            console.error('Prescriptive path error:', e);
            if (prescriptiveListContainer) {
                prescriptiveListContainer.innerHTML = `
                    <div class="alert alert-success-subtle border-0 rounded-3 p-3 micro-text">
                        <strong class="d-block text-success mb-1"><i class="bi bi-lightbulb-fill me-1"></i>Study Guidance</strong>
                        Aim for at least ${targetNum}% across upcoming quizzes and quarterly assessments to attain your target grade of ${targetNum}.
                    </div>
                `;
            }
        }
    }

    function renderPrescriptiveRecommendations(mlData) {
        const mlRiskForecast = document.getElementById('mlRiskForecast');
        const prescriptiveListContainer = document.getElementById('prescriptiveListContainer');

        const riskBadgeColor = mlData.predictedRisk === 'High' ? 'text-danger' : (mlData.predictedRisk === 'Medium' ? 'text-warning' : 'text-success');
        if (mlRiskForecast) {
            mlRiskForecast.innerHTML = `
                <span class="badge bg-light border ${riskBadgeColor} fw-bold">
                    Risk Level: ${escapeHtml(mlData.predictedRisk || 'Low')}
                </span>
                <span class="ms-1 text-muted">Model Confidence: ${mlData.confidence ? Math.round(mlData.confidence * 100) : 92}%</span>
            `;
        }

        if (prescriptiveListContainer) {
            const paths = mlData.recommendedPath || [];
            if (paths.length > 0) {
                let recHtml = '<div class="list-group list-group-flush mb-2">';
                paths.forEach((p) => {
                    recHtml += `
                        <div class="list-group-item px-0 py-2 border-0 d-flex align-items-start gap-2">
                            <i class="bi bi-check-circle-fill text-success mt-0.5 flex-shrink-0"></i>
                            <div class="micro-text text-dark">
                                <strong>${escapeHtml(p.focusArea || 'Action Area')}:</strong> ${escapeHtml(p.action || p.description || '')}
                            </div>
                        </div>
                    `;
                });
                recHtml += '</div>';
                prescriptiveListContainer.innerHTML = recHtml;
            } else {
                prescriptiveListContainer.innerHTML = `
                    <div class="alert alert-success-subtle border-0 rounded-3 p-3 micro-text">
                        <strong class="d-block text-success mb-1"><i class="bi bi-check2-circle me-1"></i>On Track</strong>
                        Continue reviewing module flashcards and practice test items before the upcoming quarterly assessment.
                    </div>
                `;
            }
        }
    }

    // =========================================================================
    // 8. TOP 4 RADIAL GAUGES CLICK-TO-VIEW TREND MODAL
    // =========================================================================
    function getGaugeProfiles() {
        const gwa = gradeState.overallGrade !== null ? parseFloat(gradeState.overallGrade) : 90;
        const pt = gradeState.performanceTaskAvg || 92;
        const ww = gradeState.writtenWorkAvg || 90;
        const exam = gradeState.quarterlyExamAvg || 85;

        return {
            'average': {
                title: 'Average Grade Trend',
                score: `${gwa}%`,
                trendData: [Math.max(70, gwa - 4), Math.max(72, gwa - 2), gwa],
                high: `${Math.min(100, gwa + 3)}%`,
                low: `${Math.max(70, gwa - 4)}%`,
                avg: `${gwa}%`,
                legend: 'Average GWA'
            },
            'performance': {
                title: 'Performance Task Trend',
                score: `${pt}%`,
                trendData: [Math.max(70, pt - 3), Math.max(72, pt - 1), pt],
                high: `${Math.min(100, pt + 2)}%`,
                low: `${Math.max(70, pt - 3)}%`,
                avg: `${pt}%`,
                legend: 'Performance Tasks'
            },
            'written': {
                title: 'Written Work Trend',
                score: `${ww}%`,
                trendData: [Math.max(70, ww - 5), Math.max(72, ww - 2), ww],
                high: `${Math.min(100, ww + 2)}%`,
                low: `${Math.max(70, ww - 5)}%`,
                avg: `${ww}%`,
                legend: 'Written Works'
            },
            'exam': {
                title: 'Quarterly Assessment Trend',
                score: `${exam}%`,
                trendData: [Math.max(70, exam - 4), Math.max(72, exam - 2), exam],
                high: `${Math.min(100, exam + 3)}%`,
                low: `${Math.max(70, exam - 4)}%`,
                avg: `${exam}%`,
                legend: 'Quarterly Assessment'
            }
        };
    }

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

        gaugeLineChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Term 1', 'Term 2', 'Current'],
                datasets: [{
                    label: profile.legend,
                    data: profile.trendData,
                    borderColor: '#0a5c2c',
                    borderWidth: 3,
                    backgroundColor: grad,
                    fill: true,
                    pointBackgroundColor: '#0a5c2c',
                    pointBorderColor: '#ffffff',
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    tension: 0.2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: (context) => `${context.parsed.y}%`
                        }
                    }
                },
                scales: {
                    y: {
                        min: 60,
                        max: 100,
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

            if (gaugeAnalyticsModalInstance) {
                gaugeAnalyticsModalInstance.show();
                setTimeout(() => {
                    renderGaugeTrendLine(profile);
                }, 180);
            }
        });
    });

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
    // 10. REPORT CARD MODAL (DEPED SF9-SHS) & EXPORT ENGINE
    // =========================================================================
    function populateReportCardModal() {
        const { student, overallGrade, overallRemarks, grades } = gradeState;

        const rcLearnerName = document.getElementById('rcLearnerName');
        const rcLrn = document.getElementById('rcLrn');
        const rcGradeSection = document.getElementById('rcGradeSection');
        const rcTrackStrand = document.getElementById('rcTrackStrand');
        const rcGwa = document.getElementById('rcGwa');
        const rcGradingPeriod = document.getElementById('rcGradingPeriod');
        const rcAdviserName = document.getElementById('rcAdviserName');
        const rcTableBody = document.getElementById('rcTableBody');

        if (student) {
            if (rcLearnerName) rcLearnerName.textContent = student.formattedName || student.name || 'Dela Cruz, Juan';
            if (rcLrn) rcLrn.textContent = student.idNumber || '123456789012';
            if (rcGradeSection) rcGradeSection.textContent = student.sectionFormatted || 'Grade 11';
            if (rcTrackStrand) rcTrackStrand.textContent = student.trackStrand || 'Academic Track - STEM';
        }

        const gwaText = overallGrade !== null ? `${overallGrade} (${overallRemarks})` : '--';
        if (rcGwa) rcGwa.textContent = gwaText;
        if (rcGradingPeriod) rcGradingPeriod.textContent = grades[0]?.term ? `Academic Year 2026-2027 • ${grades[0].term}` : 'Academic Year 2026-2027';
        if (rcAdviserName) rcAdviserName.textContent = student?.adviserName || (grades.find((g) => g.teacherName && g.teacherName !== 'No Teacher Assigned')?.teacherName) || 'Class Adviser';

        if (rcTableBody) {
            if (!grades || grades.length === 0) {
                rcTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-3 text-muted">No subject grades recorded yet.</td></tr>`;
                return;
            }

            let bodyHtml = '';
            grades.forEach((g) => {
                const hasGrade = g.average !== null && g.average !== undefined && g.average !== '' && !isNaN(Number(g.average));
                const isPassed = hasGrade && Number(g.average) >= 75;
                const remarksText = hasGrade ? (g.remarks || (isPassed ? 'Passed' : 'Needs Remediation')) : 'Pending';
                const remarksColor = hasGrade ? (isPassed ? 'text-success' : 'text-danger') : 'text-muted';

                const wwMax = g.ww_weight || 20;
                const ptMax = g.pt_weight || 50;
                const qaMax = g.qa_weight || 30;

                bodyHtml += `
                    <tr>
                        <td>
                            <strong>${escapeHtml(g.subjectCode || 'SUBJ')}</strong> - ${escapeHtml(g.subject)}
                        </td>
                        <td class="text-center">${hasGrade && g.quizPct !== null ? `${g.quizPct}% (${g.quiz_score}/${wwMax})` : '—'}</td>
                        <td class="text-center">${hasGrade && g.activityPct !== null ? `${g.activityPct}% (${g.activity_score}/${ptMax})` : '—'}</td>
                        <td class="text-center">${hasGrade && g.examPct !== null ? `${g.examPct}% (${g.exam_score}/${qaMax})` : '—'}</td>
                        <td class="text-center fw-bold">${hasGrade ? g.average : '—'}</td>
                        <td class="text-center fw-bold ${remarksColor}">${escapeHtml(remarksText)}</td>
                    </tr>
                `;
            });

            // GWA Summary Row
            const gwaNum = overallGrade !== null ? parseFloat(overallGrade) : 0;
            const isGwaPassed = gwaNum >= 75;
            bodyHtml += `
                <tr class="report-card-gwa-row">
                    <td class="text-end fw-bold">GENERAL WEIGHTED AVERAGE (GWA):</td>
                    <td class="text-center fw-bold">${gradeState.writtenWorkAvg || 0}%</td>
                    <td class="text-center fw-bold">${gradeState.performanceTaskAvg || 0}%</td>
                    <td class="text-center fw-bold">${gradeState.quarterlyExamAvg || 0}%</td>
                    <td class="text-center fw-bold fs-6 text-success">${overallGrade || '--'}</td>
                    <td class="text-center fw-bold ${isGwaPassed ? 'text-success' : 'text-danger'}">
                        ${isGwaPassed ? 'Passed (Promoted)' : 'For Intervention'}
                    </td>
                </tr>
            `;

            rcTableBody.innerHTML = bodyHtml;
        }
    }

    const btnViewReportCard = document.getElementById('btnViewReportCard');
    const btnDownloadReportBanner = document.getElementById('btnDownloadReportBanner');
    const btnModalPrintReport = document.getElementById('btnModalPrintReport');
    const btnModalExportExcel = document.getElementById('btnModalExportExcel');

    function openReportCardModal(e) {
        if (e) e.stopPropagation();
        if (reportCardModalInstance) {
            reportCardModalInstance.show();
        }
    }

    if (btnViewReportCard) btnViewReportCard.addEventListener('click', openReportCardModal);

    // Official Landscape DepEd SF9 Print Document Generator
    function printOfficialReportCard(e) {
        if (e) e.stopPropagation();

        const { student, overallGrade, overallRemarks, grades } = gradeState;
        const studentName = student?.formattedName || 'Student';
        const lrn = student?.idNumber || 'N/A';
        const gradeSec = student?.sectionFormatted || 'Senior High School';
        const trackStrand = student?.trackStrand || 'Academic Track';
        const term = grades[0]?.term || '1st Term';
        const adviser = grades[0]?.teacherName || 'Class Adviser';

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            window.print();
            return;
        }

        let rowsHtml = '';
        grades.forEach((g) => {
            const wwMax = g.ww_weight || 20;
            const ptMax = g.pt_weight || 50;
            const qaMax = g.qa_weight || 30;
            rowsHtml += `
                <tr>
                    <td><strong>${escapeHtml(g.subjectCode || 'SUBJ')}</strong> - ${escapeHtml(g.subject)}</td>
                    <td style="text-align:center;">${g.quizPct !== null ? `${g.quizPct}% (${g.quiz_score}/${wwMax})` : '—'}</td>
                    <td style="text-align:center;">${g.activityPct !== null ? `${g.activityPct}% (${g.activity_score}/${ptMax})` : '—'}</td>
                    <td style="text-align:center;">${g.examPct !== null ? `${g.examPct}% (${g.exam_score}/${qaMax})` : '—'}</td>
                    <td style="text-align:center; font-weight:bold;">${g.average}</td>
                    <td style="text-align:center; font-weight:bold; color:${g.average >= 75 ? '#0a5c2c' : '#dc2626'};">
                        ${escapeHtml(g.remarks || (g.average >= 75 ? 'Passed' : 'Failed'))}
                    </td>
                </tr>
            `;
        });

        rowsHtml += `
            <tr style="background-color: #eaf8ee; font-weight: 800; border-top: 2px solid #0a5c2c;">
                <td style="text-align:right;">GENERAL WEIGHTED AVERAGE (GWA):</td>
                <td style="text-align:center;">${gradeState.writtenWorkAvg || 0}%</td>
                <td style="text-align:center;">${gradeState.performanceTaskAvg || 0}%</td>
                <td style="text-align:center;">${gradeState.quarterlyExamAvg || 0}%</td>
                <td style="text-align:center; font-size:1.05rem; color:#0a5c2c;">${overallGrade || '--'}</td>
                <td style="text-align:center; color:#0a5c2c;">${overallGrade >= 75 ? 'Passed (Promoted)' : 'For Intervention'}</td>
            </tr>
        `;

        printWindow.document.write(`
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>Official Report Card (SF9-SHS) - ${escapeHtml(studentName)}</title>
                    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
                    <style>
                        @page { size: landscape; margin: 0.8cm 1cm; }
                        body {
                            padding: 1.5rem 2.5rem;
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                            color: #1e293b;
                            background-color: #ffffff;
                        }
                        .header-box { border-bottom: 2.5px solid #0a5c2c; padding-bottom: 0.75rem; margin-bottom: 1.25rem; text-align: center; }
                        .school-title { color: #0a5c2c; font-weight: 800; font-size: 1.45rem; margin: 0; }
                        .deped-sub { font-size: 0.82rem; color: #475569; margin: 0; }
                        .report-card-title { font-size: 1rem; font-weight: 700; text-transform: uppercase; color: #0f172a; margin-top: 0.35rem; }
                        .meta-table { width: 100%; font-size: 0.83rem; border-collapse: collapse; margin-bottom: 1rem; }
                        .meta-table td { padding: 0.35rem 0.65rem; border: 1px solid #cbd5e1; }
                        .meta-label { background-color: #f1f5f9; font-weight: 700; color: #334155; width: 16%; }
                        .meta-val { font-weight: 600; color: #0f172a; width: 34%; }
                        .grade-table { width: 100%; font-size: 0.83rem; border-collapse: collapse; margin-bottom: 1rem; }
                        .grade-table th { background-color: #0a5c2c !important; color: #ffffff !important; text-align: center; padding: 0.5rem 0.65rem; font-weight: 700; border: 1px solid #0a5c2c; }
                        .grade-table td { padding: 0.4rem 0.65rem; border: 1px solid #cbd5e1; vertical-align: middle; }
                        .grading-scale-box { font-size: 0.75rem; border: 1px solid #cbd5e1; padding: 0.5rem 0.75rem; border-radius: 4px; background-color: #f8fafc; }
                        .signature-line { border-bottom: 1px solid #0f172a; width: 180px; margin: 0 auto 0.25rem; }
                        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0 !important; } }
                    </style>
                </head>
                <body>
                    <div class="header-box">
                        <p class="deped-sub">Republic of the Philippines &bull; Department of Education &bull; Region IV-A CALABARZON &bull; Division of Batangas</p>
                        <h1 class="school-title">TALISAY SENIOR HIGH SCHOOL</h1>
                        <div class="report-card-title">Senior High School Student Progress Report Card (SF9-SHS)</div>
                        <p class="deped-sub mt-1">Academic Year 2026-2027 &bull; ${escapeHtml(term)}</p>
                    </div>

                    <table class="meta-table">
                        <tr>
                            <td class="meta-label">Learner Name:</td>
                            <td class="meta-val">${escapeHtml(studentName)}</td>
                            <td class="meta-label">Learner Reference No. (LRN):</td>
                            <td class="meta-val">${escapeHtml(lrn)}</td>
                        </tr>
                        <tr>
                            <td class="meta-label">Grade & Section:</td>
                            <td class="meta-val">${escapeHtml(gradeSec)}</td>
                            <td class="meta-label">Track & Strand:</td>
                            <td class="meta-val">${escapeHtml(trackStrand)}</td>
                        </tr>
                        <tr>
                            <td class="meta-label">General Average (GWA):</td>
                            <td class="meta-val" style="color: #0a5c2c; font-weight: 800;">${overallGrade || '--'} (${overallRemarks})</td>
                            <td class="meta-label">Grading Period:</td>
                            <td class="meta-val">${escapeHtml(term)}</td>
                        </tr>
                    </table>

                    <table class="grade-table">
                        <thead>
                            <tr>
                                <th style="width: 44%; text-align: left;">Learning Areas (Subject Code & Description)</th>
                                <th style="width: 14%;">Written Works</th>
                                <th style="width: 14%;">Performance Tasks</th>
                                <th style="width: 14%;">Quarterly Assessment</th>
                                <th style="width: 14%;">Final Grade</th>
                                <th style="width: 14%;">Remarks</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>

                    <div class="row align-items-center mt-3 pt-1">
                        <div class="col-6">
                            <div class="grading-scale-box">
                                <span class="fw-bold d-block mb-1 text-dark">DepEd Grading Scale (DepEd Order No. 8, s. 2015):</span>
                                <table class="w-100" style="font-size: 0.73rem;">
                                    <tr><td><strong>90 - 100:</strong> Outstanding</td><td><strong>80 - 84:</strong> Satisfactory</td><td><strong>Below 75:</strong> Did Not Meet Expectations</td></tr>
                                    <tr><td><strong>85 - 89:</strong> Very Satisfactory</td><td><strong>75 - 79:</strong> Fairly Satisfactory</td><td><strong>Passing Grade:</strong> 75</td></tr>
                                </table>
                            </div>
                        </div>
                        <div class="col-3 text-center">
                            <div class="signature-line" style="margin-top: 1.5rem;"></div>
                            <span class="fw-bold d-block small text-dark">${escapeHtml(adviser)}</span>
                            <span class="text-muted" style="font-size: 0.72rem;">Class Adviser</span>
                        </div>
                        <div class="col-3 text-center">
                            <div class="signature-line" style="margin-top: 1.5rem;"></div>
                            <span class="fw-bold d-block small text-dark">School Administration</span>
                            <span class="text-muted" style="font-size: 0.72rem;">Senior High School Principal</span>
                        </div>
                    </div>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 350);
    }

    if (btnDownloadReportBanner) btnDownloadReportBanner.addEventListener('click', printOfficialReportCard);
    if (btnModalPrintReport) btnModalPrintReport.addEventListener('click', printOfficialReportCard);

    // Official Excel SF9 Export using SheetJS
    function exportReportCardExcel(e) {
        if (e) e.stopPropagation();
        if (typeof XLSX === 'undefined') {
            alert('Excel export library is loading. Please try again in a moment.');
            return;
        }

        const { student, overallGrade, overallRemarks, grades } = gradeState;
        const studentName = student?.name || 'Student';
        const lrn = student?.idNumber || 'N/A';
        const section = student?.sectionFormatted || 'Senior High School';
        const strand = student?.trackStrand || 'Academic Track';
        const term = grades[0]?.term || '1st Term';

        const dataRows = [
            ["TALISAY SENIOR HIGH SCHOOL"],
            ["Senior High School Student Progress Report Card (SF9-SHS)"],
            ["Academic Year 2026-2027 - " + term],
            [],
            ["Learner Name:", studentName, "LRN:", lrn],
            ["Grade & Section:", section, "Track & Strand:", strand],
            ["General Weighted Average (GWA):", `${overallGrade || '--'} (${overallRemarks})`, "Grading Period:", term],
            [],
            ["Subject Code", "Learning Area", "Written Works", "Performance Tasks", "Quarterly Assessment", "Final Grade", "Remarks"]
        ];

        grades.forEach((g) => {
            const wwMax = g.ww_weight || 20;
            const ptMax = g.pt_weight || 50;
            const qaMax = g.qa_weight || 30;
            dataRows.push([
                g.subjectCode || 'SUBJ',
                g.subject,
                g.quizPct !== null ? `${g.quizPct}% (${g.quiz_score}/${wwMax})` : '—',
                g.activityPct !== null ? `${g.activityPct}% (${g.activity_score}/${ptMax})` : '—',
                g.examPct !== null ? `${g.examPct}% (${g.exam_score}/${qaMax})` : '—',
                g.average,
                g.remarks || (g.average >= 75 ? 'Passed' : 'Failed')
            ]);
        });

        dataRows.push([]);
        dataRows.push([
            "",
            "GENERAL WEIGHTED AVERAGE (GWA)",
            `${gradeState.writtenWorkAvg || 0}%`,
            `${gradeState.performanceTaskAvg || 0}%`,
            `${gradeState.quarterlyExamAvg || 0}%`,
            overallGrade || '--',
            overallGrade >= 75 ? 'Passed (Promoted)' : 'For Intervention'
        ]);

        const ws = XLSX.utils.aoa_to_sheet(dataRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "SF9 Report Card");

        const sanitizedName = studentName.replace(/[^a-zA-Z0-9]/g, '_');
        XLSX.writeFile(wb, `Report_Card_SF9_${sanitizedName}.xlsx`);
    }

    if (btnModalExportExcel) btnModalExportExcel.addEventListener('click', exportReportCardExcel);

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
