document.addEventListener('DOMContentLoaded', async () => {
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

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    const filterGradeLevel = document.getElementById('filterGradeLevel');
    const filterStrand = document.getElementById('filterStrand');
    const filterSection = document.getElementById('filterSection');

    let gradeTrendChart = null;
    let riskDistributionChart = null;
    let currentRiskStudents = [];

    try {
        const optsRes = await authedFetch('/api/analytics/filter-options', token);
        if (optsRes && optsRes.success) {
            if (filterGradeLevel) {
                filterGradeLevel.innerHTML = '<option value="all" selected>All Grade Levels</option>' +
                    (optsRes.grades || []).map((g) => `<option value="${g}">Grade ${g}</option>`).join('');
            }
            if (filterStrand) {
                filterStrand.innerHTML = '<option value="all" selected>All Strands</option>' +
                    (optsRes.strands || []).map((st) => `<option value="${st.id}">${st.code} - ${st.title}</option>`).join('');
            }
            if (filterSection) {
                filterSection.innerHTML = '<option value="all" selected>All Sections</option>' +
                    (optsRes.sections || []).map((sec) => `<option value="${sec.id}">Grade ${sec.grade_level} - ${sec.strandCode} (${sec.name})</option>`).join('');
            }
        }
    } catch (e) {
        console.warn('Could not load analytics filter options:', e);
    }

    function getFilterQuery() {
        const params = new URLSearchParams();
        const g = filterGradeLevel ? filterGradeLevel.value : 'all';
        const st = filterStrand ? filterStrand.value : 'all';
        const sec = filterSection ? filterSection.value : 'all';
        if (g && g !== 'all') params.set('gradeLevel', g);
        if (st && st !== 'all') params.set('strandId', st);
        if (sec && sec !== 'all') params.set('sectionId', sec);
        const str = params.toString();
        return str ? `?${str}` : '';
    }

    async function loadCharts() {
        const q = getFilterQuery();

        // Grade Trend line chart
        const trendData = await authedFetch(`/api/analytics/grade-trend${q}`, token);
        if (trendData.success) {
            const canvas = document.getElementById('gradeTrendCanvas');
            if (gradeTrendChart) gradeTrendChart.destroy();
            gradeTrendChart = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: trendData.labels.length ? trendData.labels : ['No data yet'],
                    datasets: [{
                        label: 'Average Grade',
                        data: trendData.data.length ? trendData.data : [0],
                        borderColor: '#0a5c2c',
                        backgroundColor: 'rgba(10, 92, 44, 0.1)',
                        fill: true,
                        tension: 0.3,
                    }]
                },
                options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } }
            });
        }

        // Risk Distribution donut chart
        const riskData = await authedFetch(`/api/analytics/risk-distribution${q}`, token);
        if (riskData.success) {
            const canvas = document.getElementById('riskDistributionCanvas');
            if (riskDistributionChart) riskDistributionChart.destroy();
            riskDistributionChart = new Chart(canvas, {
                type: 'doughnut',
                data: {
                    labels: riskData.labels,
                    datasets: [{
                        data: riskData.data,
                        backgroundColor: ['#dc3545', '#ffc107', '#198754'],
                    }]
                },
                options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } }
            });
        }
    }

    // Predictive Risk Directory (ML: Random Forest forecast for in-progress terms)
    // Fetched up front so the descriptive directory's "Study Lessons" button can
    // pull a matching prescriptive recommendation when one exists.
    const predictiveData = await authedFetch('/api/analytics/predictive-risk', token);
    const predictiveByIdNumber = {};
    if (predictiveData && predictiveData.success && Array.isArray(predictiveData.predictions)) {
        predictiveData.predictions.forEach(p => { predictiveByIdNumber[p.idNumber] = p; });
    }

    const modalTitleEl = document.getElementById('recommendModalTitle');
    const modalBodyEl = document.getElementById('recommendModalBody');
    const recommendModal = new bootstrap.Modal(document.getElementById('recommendModal'));

    function showRecommendModal(name, prediction) {
        modalTitleEl.textContent = `Recommended Actions — ${name}`;
        if (!prediction) {
            modalBodyEl.innerHTML = '<p class="text-muted m-0">No ML forecast available for this student right now — they may not have a term in progress, or the predictive model has not been trained yet.</p>';
        } else {
            const confidencePct = prediction.confidence !== null ? `${Math.round(prediction.confidence * 100)}%` : '—';
            modalBodyEl.innerHTML = `
                <p class="small text-secondary mb-2">${prediction.subject} · ${prediction.term}</p>
                <p class="mb-2"><span class="badge risk-tag-badge ${prediction.predictedRisk === 'High' ? 'bg-high-risk text-danger' : 'bg-medium-risk text-warning'} text-uppercase">${prediction.predictedRisk} Risk (forecast)</span>
                <span class="micro-text text-muted ms-2">Model confidence: ${confidencePct}</span></p>
                <p class="small mb-2"><strong>Main driver:</strong> ${prediction.driverLabel}</p>
                <ul class="small mb-0 ps-3">
                    ${prediction.recommendedActions.map(a => `<li class="mb-1">${a}</li>`).join('')}
                </ul>
            `;
        }
        recommendModal.show();
    }

    // Load and render Student Risk Assessment directory with active filters
    async function loadRiskAssessment() {
        const q = getFilterQuery();
        try {
            const data = await authedFetch(`/api/analytics/risk-assessment${q}`, token);
            if (data && data.success && Array.isArray(data.students)) {
                currentRiskStudents = data.students;
            } else {
                const fallback = await authedFetch('/api/analytics/risk-directory', token);
                currentRiskStudents = (fallback && fallback.success && Array.isArray(fallback.directory))
                    ? fallback.directory.map(s => ({
                        ...s,
                        overallGrade: s.grade,
                        detailText: `Grade: ${s.grade ?? '—'}% | Attendance: ${s.attendanceRate ?? '—'}%`
                    }))
                    : [];
            }
        } catch (e) {
            console.warn('Could not load risk assessment:', e);
            currentRiskStudents = [];
        }

        const directoryEl = document.getElementById('riskAssessmentDirectory');
        if (!directoryEl) return;

        const atRiskList = currentRiskStudents.filter(s => s.risk === 'High' || s.risk === 'Medium');

        if (!atRiskList.length) {
            directoryEl.innerHTML = '<p class="text-muted text-center py-3">No at-risk students right now.</p>';
        } else {
            const riskClass = {
                High: { badge: 'bg-high-risk text-danger', btn: 'btn-success', label: 'Study Lessons' },
                Medium: { badge: 'bg-medium-risk text-warning', btn: 'btn-success', label: 'Study Lessons' },
            };

            directoryEl.innerHTML = atRiskList.map((s) => {
                const cfg = riskClass[s.risk] || riskClass.Medium;
                const gradeVal = s.overallGrade !== undefined && s.overallGrade !== null ? s.overallGrade : (s.grade !== undefined && s.grade !== null ? s.grade : '—');
                const attVal = s.attendanceRate !== undefined && s.attendanceRate !== null ? s.attendanceRate : '—';
                const sectionBadge = s.section ? `<span class="badge bg-light text-secondary border me-1">${escapeHtml(s.section)}</span>` : '';
                return `
                    <div class="card row-student-item p-3 border-0 shadow-sm bg-white rounded-3">
                        <div class="row align-items-center g-3 text-center text-sm-start">
                            <div class="col-12 col-sm-6 col-md-7">
                                <h4 class="fw-bold m-0 fs-6 text-dark">${escapeHtml(s.name)}</h4>
                                <p class="m-0 micro-text text-muted mt-1">${sectionBadge}Grade: <span class="fw-medium">${gradeVal}%</span> | Attendance: <span class="fw-medium">${attVal}%</span></p>
                                ${s.detailText ? `<p class="m-0 micro-text ${s.detailColor || 'text-muted'} mt-1">${s.detailText}</p>` : ''}
                            </div>
                            <div class="col-12 col-sm-3 col-md-2 text-center border-start-sm">
                                <span class="badge risk-tag-badge ${cfg.badge} text-uppercase">${escapeHtml(s.risk)} Risk</span>
                            </div>
                            <div class="col-12 col-sm-3 col-md-3 text-center text-sm-end">
                                <button type="button" class="btn btn-action-recommend ${cfg.btn} w-100" data-id-number="${escapeHtml(s.idNumber)}" data-name="${escapeHtml(s.name)}">${cfg.label}</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            directoryEl.querySelectorAll('.btn-action-recommend').forEach(btn => {
                btn.addEventListener('click', () => {
                    showRecommendModal(btn.dataset.name, predictiveByIdNumber[btn.dataset.idNumber]);
                });
            });
        }
    }

    async function refreshAll() {
        await Promise.all([loadCharts(), loadRiskAssessment()]);
    }

    await refreshAll();

    if (filterGradeLevel) filterGradeLevel.addEventListener('change', refreshAll);
    if (filterStrand) filterStrand.addEventListener('change', refreshAll);
    if (filterSection) filterSection.addEventListener('change', refreshAll);

    // =========================================================================
    // Export At-Risk Roster to Excel (.xlsx) using xlsx-js-style
    // =========================================================================
    const btnExportRiskExcel = document.getElementById('btnExportRiskExcel');
    if (btnExportRiskExcel) {
        btnExportRiskExcel.addEventListener('click', () => {
            if (typeof XLSX === 'undefined') {
                alert('Excel export library is loading. Please try again in a moment.');
                return;
            }

            if (!currentRiskStudents || currentRiskStudents.length === 0) {
                alert('No student records available to export for the current filter criteria.');
                return;
            }

            const gradeText = filterGradeLevel && filterGradeLevel.value !== 'all' ? `Grade ${filterGradeLevel.value}` : 'All Grades';
            const strandText = filterStrand && filterStrand.options[filterStrand.selectedIndex] ? filterStrand.options[filterStrand.selectedIndex].text : 'All Strands';
            const sectionText = filterSection && filterSection.options[filterSection.selectedIndex] ? filterSection.options[filterSection.selectedIndex].text : 'All Sections';

            const priorityStudents = currentRiskStudents.filter(s => s.risk === 'High' || s.risk === 'Medium');
            const highCount = currentRiskStudents.filter(s => s.risk === 'High').length;
            const mediumCount = currentRiskStudents.filter(s => s.risk === 'Medium').length;
            const lowCount = currentRiskStudents.filter(s => s.risk === 'Low').length;

            const wb = XLSX.utils.book_new();

            function buildStyledWorksheet(studentsList, sheetCategoryTitle) {
                const ws = {};
                const merges = [];
                const rowHeights = [];

                function setCell(r, c, val, style, type = 's') {
                    const colLetter = String.fromCharCode(65 + c);
                    const cellKey = colLetter + (r + 1);
                    ws[cellKey] = { v: val, t: type, s: style };
                }

                const thinBorder = { style: 'thin', color: { rgb: 'D0D7DE' } };
                const cellBorder = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

                // --- ROW 0: School Header Banner ---
                rowHeights.push({ hpt: 28 });
                merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } });
                for (let c = 0; c <= 8; c++) {
                    setCell(0, c, c === 0 ? "TALISAY SENIOR HIGH SCHOOL" : "", {
                        font: { name: "Calibri", sz: 14, bold: true, color: { rgb: "FFFFFF" } },
                        fill: { fgColor: { rgb: "0A5C2C" } },
                        alignment: { horizontal: "center", vertical: "center" }
                    });
                }

                // --- ROW 1: System Title Ribbon ---
                rowHeights.push({ hpt: 20 });
                merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 8 } });
                for (let c = 0; c <= 8; c++) {
                    setCell(1, c, c === 0 ? "MENTORAE - ADMIN ACADEMIC RISK ASSESSMENT & INTERVENTION ROSTER" : "", {
                        font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "E6F4EA" } },
                        fill: { fgColor: { rgb: "074520" } },
                        alignment: { horizontal: "center", vertical: "center" }
                    });
                }

                // --- ROW 2: Category Subtitle ---
                rowHeights.push({ hpt: 22 });
                merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 8 } });
                for (let c = 0; c <= 8; c++) {
                    setCell(2, c, c === 0 ? sheetCategoryTitle : "", {
                        font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "0A5C2C" } },
                        fill: { fgColor: { rgb: "E8F5E9" } },
                        alignment: { horizontal: "center", vertical: "center" },
                        border: { bottom: { style: "medium", color: { rgb: "0A5C2C" } } }
                    });
                }

                // --- ROW 3: Metadata Info ---
                rowHeights.push({ hpt: 19 });
                merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: 2 } });
                merges.push({ s: { r: 3, c: 3 }, e: { r: 3, c: 5 } });
                merges.push({ s: { r: 3, c: 6 }, e: { r: 3, c: 8 } });

                const metaLeft = { font: { name: "Calibri", sz: 9, bold: true, color: { rgb: "4A5568" } }, fill: { fgColor: { rgb: "F8F9FA" } }, alignment: { horizontal: "left", vertical: "center" } };
                const metaCenter = { font: { name: "Calibri", sz: 9, color: { rgb: "4A5568" } }, fill: { fgColor: { rgb: "F8F9FA" } }, alignment: { horizontal: "center", vertical: "center" } };
                const metaRight = { font: { name: "Calibri", sz: 9, italic: true, color: { rgb: "718096" } }, fill: { fgColor: { rgb: "F8F9FA" } }, alignment: { horizontal: "right", vertical: "center" } };

                for (let c = 0; c <= 2; c++) setCell(3, c, c === 0 ? "Academic Year: 2026-2027" : "", metaLeft);
                for (let c = 3; c <= 5; c++) setCell(3, c, c === 3 ? "Generated: " + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "", metaCenter);
                for (let c = 6; c <= 8; c++) setCell(3, c, c === 6 ? "Classification: DepEd SF Academic Intervention" : "", metaRight);

                // --- ROW 4: Filter Scope ---
                rowHeights.push({ hpt: 19 });
                merges.push({ s: { r: 4, c: 0 }, e: { r: 4, c: 1 } });
                merges.push({ s: { r: 4, c: 2 }, e: { r: 4, c: 8 } });
                for (let c = 0; c <= 1; c++) setCell(4, c, c === 0 ? "Active Filter Scope:" : "", { font: { name: "Calibri", sz: 9, bold: true, color: { rgb: "1E293B" } }, fill: { fgColor: { rgb: "F1F5F9" } }, alignment: { horizontal: "left", vertical: "center" } });
                for (let c = 2; c <= 8; c++) setCell(4, c, c === 2 ? `${gradeText}   |   ${strandText}   |   ${sectionText}` : "", { font: { name: "Calibri", sz: 9, bold: true, color: { rgb: "0A5C2C" } }, fill: { fgColor: { rgb: "F1F5F9" } }, alignment: { horizontal: "left", vertical: "center" } });

                // --- ROW 5: Summary Stat KPI Cards ---
                rowHeights.push({ hpt: 24 });
                merges.push({ s: { r: 5, c: 0 }, e: { r: 5, c: 1 } });
                merges.push({ s: { r: 5, c: 2 }, e: { r: 5, c: 3 } });
                merges.push({ s: { r: 5, c: 4 }, e: { r: 5, c: 5 } });
                merges.push({ s: { r: 5, c: 6 }, e: { r: 5, c: 8 } });

                const kpiHigh = { font: { name: "Calibri", sz: 9, bold: true, color: { rgb: "991B1B" } }, fill: { fgColor: { rgb: "FEE2E2" } }, alignment: { horizontal: "center", vertical: "center" }, border: { top: { style: 'thin', color: { rgb: 'FCA5A5' } }, bottom: { style: 'thin', color: { rgb: 'FCA5A5' } }, left: { style: 'thin', color: { rgb: 'FCA5A5' } }, right: { style: 'thin', color: { rgb: 'FCA5A5' } } } };
                const kpiMed = { font: { name: "Calibri", sz: 9, bold: true, color: { rgb: "92400E" } }, fill: { fgColor: { rgb: "FEF3C7" } }, alignment: { horizontal: "center", vertical: "center" }, border: { top: { style: 'thin', color: { rgb: 'FCD34D' } }, bottom: { style: 'thin', color: { rgb: 'FCD34D' } }, left: { style: 'thin', color: { rgb: 'FCD34D' } }, right: { style: 'thin', color: { rgb: 'FCD34D' } } } };
                const kpiLow = { font: { name: "Calibri", sz: 9, bold: true, color: { rgb: "166534" } }, fill: { fgColor: { rgb: "DCFCE7" } }, alignment: { horizontal: "center", vertical: "center" }, border: { top: { style: 'thin', color: { rgb: '86EFAC' } }, bottom: { style: 'thin', color: { rgb: '86EFAC' } }, left: { style: 'thin', color: { rgb: '86EFAC' } }, right: { style: 'thin', color: { rgb: '86EFAC' } } } };
                const kpiTot = { font: { name: "Calibri", sz: 9, bold: true, color: { rgb: "1E40AF" } }, fill: { fgColor: { rgb: "DBEAFE" } }, alignment: { horizontal: "center", vertical: "center" }, border: { top: { style: 'thin', color: { rgb: '93C5FD' } }, bottom: { style: 'thin', color: { rgb: '93C5FD' } }, left: { style: 'thin', color: { rgb: '93C5FD' } }, right: { style: 'thin', color: { rgb: '93C5FD' } } } };

                for (let c = 0; c <= 1; c++) setCell(5, c, c === 0 ? `HIGH RISK LEARNERS: ${highCount}` : "", kpiHigh);
                for (let c = 2; c <= 3; c++) setCell(5, c, c === 2 ? `MEDIUM RISK: ${mediumCount}` : "", kpiMed);
                for (let c = 4; c <= 5; c++) setCell(5, c, c === 4 ? `LOW RISK: ${lowCount}` : "", kpiLow);
                for (let c = 6; c <= 8; c++) setCell(5, c, c === 6 ? `TOTAL ANALYZED: ${currentRiskStudents.length} LEARNERS` : "", kpiTot);

                // --- ROW 6: Spacing Row ---
                rowHeights.push({ hpt: 10 });
                for (let c = 0; c <= 8; c++) setCell(6, c, "", {});

                // --- ROW 7: Table Column Headers ---
                rowHeights.push({ hpt: 28 });
                const headers = [
                    "No.",
                    "Student ID / LRN",
                    "Learner Full Name",
                    "Grade Level & Section",
                    "Quarter Grade",
                    "Attendance Rate",
                    "Risk Classification",
                    "Identified Risk Factor & Detail",
                    "Prescriptive Recommended Action"
                ];

                const headerStyle = {
                    font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
                    fill: { fgColor: { rgb: "0A5C2C" } },
                    alignment: { horizontal: "center", vertical: "center", wrapText: true },
                    border: {
                        top: { style: "medium", color: { rgb: "063E1D" } },
                        bottom: { style: "medium", color: { rgb: "063E1D" } },
                        left: { style: "thin", color: { rgb: "074724" } },
                        right: { style: "thin", color: { rgb: "074724" } }
                    }
                };

                headers.forEach((h, c) => {
                    setCell(7, c, h, headerStyle);
                });

                // --- ROW 8+: Student Data Rows ---
                let curRow = 8;
                studentsList.forEach((s, idx) => {
                    rowHeights.push({ hpt: 24 });
                    const isEven = idx % 2 === 0;
                    const rowBg = isEven ? "FFFFFF" : "F9FAF9";

                    const cleanDetail = (s.detailText || '')
                        .replace(/<[^>]+>/g, '')
                        .trim();
                    const actionText = (s.risk === 'High' || s.risk === 'Medium')
                        ? 'Schedule Academic Counseling & Remediation'
                        : 'Maintain Satisfactory Academic Standing';

                    // Grade Color
                    const gradeNum = s.overallGrade !== undefined && s.overallGrade !== null ? s.overallGrade : s.grade;
                    let gradeColor = '16A34A';
                    if (gradeNum !== null && gradeNum !== undefined) {
                        if (gradeNum < 75) gradeColor = 'DC2626';
                        else if (gradeNum < 80) gradeColor = 'D97706';
                    }

                    // Risk Badge Color Scheme
                    let riskFill = 'DCFCE7';
                    let riskFontColor = '166534';
                    let riskBorderColor = '86EFAC';
                    const rUpper = (s.risk || '').toUpperCase();
                    if (rUpper === 'HIGH') {
                        riskFill = 'FEE2E2';
                        riskFontColor = '991B1B';
                        riskBorderColor = 'FCA5A5';
                    } else if (rUpper === 'MEDIUM') {
                        riskFill = 'FEF3C7';
                        riskFontColor = '92400E';
                        riskBorderColor = 'FCD34D';
                    }

                    // Col 0: No.
                    setCell(curRow, 0, idx + 1, {
                        font: { name: "Calibri", sz: 9, color: { rgb: "64748B" } },
                        fill: { fgColor: { rgb: rowBg } },
                        alignment: { horizontal: "center", vertical: "center" },
                        border: cellBorder
                    }, 'n');

                    // Col 1: Student ID / LRN
                    setCell(curRow, 1, s.idNumber || 'N/A', {
                        font: { name: "Calibri", sz: 9, bold: true, color: { rgb: "1E293B" } },
                        fill: { fgColor: { rgb: rowBg } },
                        alignment: { horizontal: "center", vertical: "center" },
                        border: cellBorder
                    });

                    // Col 2: Learner Full Name
                    setCell(curRow, 2, s.name || 'Unnamed Student', {
                        font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "0F172A" } },
                        fill: { fgColor: { rgb: rowBg } },
                        alignment: { horizontal: "left", vertical: "center" },
                        border: cellBorder
                    });

                    // Col 3: Grade Level & Section
                    setCell(curRow, 3, s.section || 'General', {
                        font: { name: "Calibri", sz: 9, color: { rgb: "334155" } },
                        fill: { fgColor: { rgb: rowBg } },
                        alignment: { horizontal: "left", vertical: "center" },
                        border: cellBorder
                    });

                    // Col 4: Quarter Grade
                    setCell(curRow, 4, gradeNum !== null && gradeNum !== undefined ? `${gradeNum}%` : 'N/A', {
                        font: { name: "Calibri", sz: 10, bold: true, color: { rgb: gradeColor } },
                        fill: { fgColor: { rgb: rowBg } },
                        alignment: { horizontal: "center", vertical: "center" },
                        border: cellBorder
                    });

                    // Col 5: Attendance Rate
                    const attRate = s.attendanceRate !== null && s.attendanceRate !== undefined ? `${s.attendanceRate}%` : 'N/A';
                    const attColor = (s.attendanceRate !== null && s.attendanceRate < 80) ? 'DC2626' : '334155';
                    setCell(curRow, 5, attRate, {
                        font: { name: "Calibri", sz: 9, bold: s.attendanceRate !== null && s.attendanceRate < 80, color: { rgb: attColor } },
                        fill: { fgColor: { rgb: rowBg } },
                        alignment: { horizontal: "center", vertical: "center" },
                        border: cellBorder
                    });

                    // Col 6: Risk Classification (Badge)
                    setCell(curRow, 6, s.riskTier || (s.risk + ' Risk'), {
                        font: { name: "Calibri", sz: 9, bold: true, color: { rgb: riskFontColor } },
                        fill: { fgColor: { rgb: riskFill } },
                        alignment: { horizontal: "center", vertical: "center" },
                        border: {
                            top: { style: "thin", color: { rgb: riskBorderColor } },
                            bottom: { style: "thin", color: { rgb: riskBorderColor } },
                            left: { style: "thin", color: { rgb: riskBorderColor } },
                            right: { style: "thin", color: { rgb: riskBorderColor } }
                        }
                    });

                    // Col 7: Identified Risk Factor & Detail
                    setCell(curRow, 7, cleanDetail || 'N/A', {
                        font: { name: "Calibri", sz: 9, color: { rgb: "334155" } },
                        fill: { fgColor: { rgb: rowBg } },
                        alignment: { horizontal: "left", vertical: "center", wrapText: true },
                        border: cellBorder
                    });

                    // Col 8: Prescriptive Action Recommendation
                    setCell(curRow, 8, actionText, {
                        font: { name: "Calibri", sz: 9, color: { rgb: "0A5C2C" } },
                        fill: { fgColor: { rgb: rowBg } },
                        alignment: { horizontal: "left", vertical: "center", wrapText: true },
                        border: cellBorder
                    });

                    curRow++;
                });

                ws['!ref'] = `A1:I${curRow}`;
                ws['!merges'] = merges;
                ws['!rows'] = rowHeights;
                ws['!cols'] = [
                    { wch: 6 },  // A: No.
                    { wch: 18 }, // B: Student ID / LRN
                    { wch: 28 }, // C: Learner Full Name
                    { wch: 32 }, // D: Grade Level & Section
                    { wch: 16 }, // E: Academic Grade (%)
                    { wch: 18 }, // F: Attendance Rate (%)
                    { wch: 22 }, // G: Risk Classification
                    { wch: 45 }, // H: Risk Factor & Detail
                    { wch: 42 }  // I: Prescriptive Action
                ];
                ws['!views'] = [{ showGridLines: true }];

                return ws;
            }

            // 1. Sheet: Priority At-Risk (High & Medium)
            const wsPriority = buildStyledWorksheet(priorityStudents.length > 0 ? priorityStudents : currentRiskStudents, "AT-RISK PRIORITY INTERVENTION ROSTER");

            // 2. Sheet: Complete School Academic Directory
            const wsComplete = buildStyledWorksheet(currentRiskStudents, "COMPLETE SCHOOL ACADEMIC RISK DIRECTORY");

            XLSX.utils.book_append_sheet(wb, wsPriority, "At-Risk Priority");
            XLSX.utils.book_append_sheet(wb, wsComplete, "All Evaluated");

            const safeSectionName = (sectionText !== 'All Sections' ? sectionText : (strandText !== 'All Strands' ? strandText : 'All_Classes'))
                .replace(/[^a-zA-Z0-9_-]/g, '_');
            const filename = `TSHS_Admin_At-Risk_Roster_${safeSectionName}_${new Date().toISOString().slice(0, 10)}.xlsx`;

            XLSX.writeFile(wb, filename);
        });
    }

    // =========================================================================
    // Print At-Risk Roster
    // =========================================================================
    const btnPrintRiskRoster = document.getElementById('btnPrintRiskRoster');
    if (btnPrintRiskRoster) {
        btnPrintRiskRoster.addEventListener('click', () => {
            if (!currentRiskStudents || currentRiskStudents.length === 0) {
                alert('No student records available to print.');
                return;
            }

            const gradeText = filterGradeLevel && filterGradeLevel.value !== 'all' ? `Grade ${filterGradeLevel.value}` : 'All Grades';
            const strandText = filterStrand && filterStrand.options[filterStrand.selectedIndex] ? filterStrand.options[filterStrand.selectedIndex].text : 'All Strands';
            const sectionText = filterSection && filterSection.options[filterSection.selectedIndex] ? filterSection.options[filterSection.selectedIndex].text : 'All Sections';

            const highCount = currentRiskStudents.filter(s => s.risk === 'High').length;
            const mediumCount = currentRiskStudents.filter(s => s.risk === 'Medium').length;
            const lowCount = currentRiskStudents.filter(s => s.risk === 'Low').length;

            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                alert('Pop-up was blocked. Please allow pop-ups to print the at-risk roster.');
                return;
            }

            let rowsHtml = '';
            currentRiskStudents.forEach((s, idx) => {
                const cleanDetail = (s.detailText || '').replace(/<[^>]+>/g, '').trim();
                let badgeColor = '#198754';
                let badgeBg = '#d1e7dd';
                if (s.risk === 'High') {
                    badgeColor = '#dc3545';
                    badgeBg = '#f8d7da';
                } else if (s.risk === 'Medium') {
                    badgeColor = '#997404';
                    badgeBg = '#fff3cd';
                }

                const gradeVal = s.overallGrade !== undefined && s.overallGrade !== null ? s.overallGrade : (s.grade !== undefined && s.grade !== null ? s.grade : null);

                rowsHtml += `
                    <tr>
                        <td style="text-align: center;">${idx + 1}</td>
                        <td><code>${escapeHtml(s.idNumber || 'N/A')}</code></td>
                        <td><strong>${escapeHtml(s.name)}</strong></td>
                        <td>${escapeHtml(s.section || 'General')}</td>
                        <td style="text-align: center;">${gradeVal !== null ? gradeVal + '%' : '--'}</td>
                        <td style="text-align: center;">${s.attendanceRate !== null && s.attendanceRate !== undefined ? s.attendanceRate + '%' : '--'}</td>
                        <td style="text-align: center;">
                            <span style="display: inline-block; padding: 3px 8px; border-radius: 12px; font-weight: bold; font-size: 0.75rem; color: ${badgeColor}; background-color: ${badgeBg};">
                                ${escapeHtml(s.riskTier || (s.risk + ' Risk'))}
                            </span>
                        </td>
                        <td><small>${escapeHtml(cleanDetail)}</small></td>
                    </tr>
                `;
            });

            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>At-Risk Student Roster - Talisay SHS (Admin)</title>
                    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
                    <style>
                        @page { size: landscape; margin: 1cm; }
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 1rem; color: #1e293b; }
                        .header-banner { border-bottom: 2px solid #0a5c2c; padding-bottom: 0.75rem; margin-bottom: 1rem; }
                        table { font-size: 0.85rem; }
                        th { background-color: #0a5c2c !important; color: white !important; }
                        @media print { .no-print { display: none !important; } }
                    </style>
                </head>
                <body>
                    <div class="no-print d-flex justify-content-between align-items-center mb-3">
                        <span class="text-muted small">Print Preview (Admin Overview)</span>
                        <button class="btn btn-sm btn-primary" onclick="window.print()">Print Now</button>
                    </div>
                    <div class="header-banner d-flex justify-content-between align-items-center">
                        <div>
                            <h4 class="m-0 fw-bold" style="color: #0a5c2c;">TALISAY SENIOR HIGH SCHOOL</h4>
                            <div class="small fw-semibold text-secondary">Student Risk Assessment & Academic Intervention Roster (Admin)</div>
                            <div class="small text-muted">Academic Year 2026-2027 | Filter: ${escapeHtml(gradeText)} - ${escapeHtml(strandText)} - ${escapeHtml(sectionText)}</div>
                        </div>
                        <div class="text-end">
                            <span class="badge bg-danger">High Risk: ${highCount}</span>
                            <span class="badge bg-warning text-dark">Medium: ${mediumCount}</span>
                            <span class="badge bg-success">Low Risk: ${lowCount}</span>
                            <div class="micro-text text-muted mt-1">Generated: ${new Date().toLocaleDateString()}</div>
                        </div>
                    </div>
                    <table class="table table-bordered table-sm align-middle">
                        <thead>
                            <tr>
                                <th style="width: 4%;">#</th>
                                <th style="width: 14%;">Student ID</th>
                                <th style="width: 20%;">Learner Name</th>
                                <th style="width: 16%;">Grade & Section</th>
                                <th style="width: 8%; text-align: center;">Grade</th>
                                <th style="width: 8%; text-align: center;">Attendance</th>
                                <th style="width: 12%; text-align: center;">Risk Level</th>
                                <th style="width: 18%;">Identified Risk Factor</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </body>
                </html>
            `);

            printWindow.document.close();
            printWindow.focus();
        });
    }

    // Predictive/Prescriptive section: students with a term in progress, ML-forecasted.
    const predictiveEl = document.getElementById('predictiveRiskDirectory');
    const modelStatusBadge = document.getElementById('modelStatusBadge');

    if (!predictiveData.success) {
        predictiveEl.innerHTML = '<p class="text-muted text-center py-3">Could not load predictive analytics.</p>';
        modelStatusBadge.textContent = 'Error';
    } else {
        modelStatusBadge.textContent = predictiveData.modelTrained
            ? `Model trained ${new Date(predictiveData.trainedAt).toLocaleDateString()} · ${predictiveData.modelMeta?.sampleCount ?? '?'} samples`
            : 'Rule-based fallback — model not trained yet';
        modelStatusBadge.className = 'badge micro-text border ' + (predictiveData.modelTrained ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning');

        if (!predictiveData.predictions.length) {
            predictiveEl.innerHTML = '<p class="text-muted text-center py-3">No students with a term in progress right now.</p>';
        } else {
            const riskBadge = { High: 'bg-high-risk text-danger', Medium: 'bg-medium-risk text-warning', Low: 'bg-success-subtle text-success' };
            predictiveEl.innerHTML = predictiveData.predictions.map(p => `
                <div class="card row-student-item p-3 border-0 shadow-sm bg-white rounded-3">
                    <div class="row align-items-center g-3 text-center text-sm-start">
                        <div class="col-12 col-sm-6 col-md-7">
                            <h4 class="fw-bold m-0 fs-6 text-dark">${p.name}</h4>
                            <p class="m-0 micro-text text-muted mt-1">${p.subject} · ${p.term} · Attendance: <span class="fw-medium">${p.attendanceRate ?? '—'}%</span></p>
                        </div>
                        <div class="col-12 col-sm-3 col-md-2 text-center border-start-sm">
                            <span class="badge risk-tag-badge ${riskBadge[p.predictedRisk]} text-uppercase">${p.predictedRisk} Risk</span>
                            <div class="micro-text text-muted mt-1">${p.confidence !== null ? Math.round(p.confidence * 100) + '% conf.' : ''}</div>
                        </div>
                        <div class="col-12 col-sm-3 col-md-3 text-center text-sm-end">
                            <button type="button" class="btn btn-action-recommend btn-success w-100 predictive-recommend-btn" data-i="${predictiveData.predictions.indexOf(p)}">View Actions</button>
                        </div>
                    </div>
                </div>
            `).join('');

            predictiveEl.querySelectorAll('.predictive-recommend-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const p = predictiveData.predictions[Number(btn.dataset.i)];
                    showRecommendModal(p.name, p);
                });
            });
        }
    }
});
