/**
 * Mentorae - Teacher Analytics Platform
 * Live Data Integration: Descriptive, Predictive, and Prescriptive Analytics
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Session Authentication
    const session = requireSession('../login.html');
    if (!session) return;
    const token = session.token;

    // 2. Live Date & Time Clock
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

    // 3. DOM Elements
    const filterGradeLevel = document.getElementById('filterGradeLevel');
    const filterStrand = document.getElementById('filterStrand');
    const filterSection = document.getElementById('filterSection');
    const atRiskCountEl = document.getElementById('atRiskCount');
    const riskAssessmentDirectory = document.getElementById('riskAssessmentDirectory');
    const gradeTrendCanvas = document.getElementById('gradeTrendCanvas');
    const riskDistributionCanvas = document.getElementById('riskDistributionCanvas');

    let gradeTrendChart = null;
    let riskDistChart = null;
    let availableSections = [];
    let availableStrands = [];
    let currentRiskStudents = [];

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Helper to get active query parameters from filters
    function getFilterQuery() {
        const params = new URLSearchParams();
        if (filterGradeLevel && filterGradeLevel.value !== 'all') {
            params.append('gradeLevel', filterGradeLevel.value);
        }
        if (filterStrand && filterStrand.value !== 'all') {
            params.append('strandId', filterStrand.value);
        }
        if (filterSection && filterSection.value !== 'all') {
            params.append('sectionId', filterSection.value);
        }
        return params.toString() ? `?${params.toString()}` : '';
    }

    // =========================================================================
    // 4. Load Filter Options (Grade Levels, Strands, Sections)
    // =========================================================================
    async function loadFilterOptions() {
        try {
            const data = await authedFetch('/api/analytics/filter-options', token);
            if (!data.success) return;

            // Save sections & strands
            if (Array.isArray(data.strands)) {
                availableStrands = data.strands;
            }
            if (Array.isArray(data.sections)) {
                availableSections = data.sections;
            }

            updateStrandDropdown();
            updateSectionDropdown();
        } catch (err) {
            console.error('loadFilterOptions error:', err);
        }
    }

    // Filter strand dropdown based on selected grade level
    function updateStrandDropdown() {
        if (!filterStrand) return;
        const selectedGrade = filterGradeLevel ? filterGradeLevel.value : 'all';
        const currentStrand = filterStrand.value;

        let filteredStrands = availableStrands;
        if (selectedGrade !== 'all') {
            const validStrandIds = new Set(
                availableSections.filter(s => String(s.grade_level) === String(selectedGrade)).map(s => String(s.strand_id))
            );
            filteredStrands = availableStrands.filter(st => validStrandIds.has(String(st.id)));
        }

        filterStrand.innerHTML = '<option value="all" selected>All Strands</option>' +
            filteredStrands.map(s => `<option value="${s.id}">${s.code} - ${s.title}</option>`).join('');

        if (currentStrand && filteredStrands.some(s => String(s.id) === String(currentStrand))) {
            filterStrand.value = currentStrand;
        } else {
            filterStrand.value = 'all';
        }
    }

    // Filter section dropdown based on selected grade level and strand
    function updateSectionDropdown() {
        if (!filterSection) return;

        const selectedGrade = filterGradeLevel ? filterGradeLevel.value : 'all';
        const selectedStrand = filterStrand ? filterStrand.value : 'all';

        const filtered = availableSections.filter(s => {
            const matchGrade = selectedGrade === 'all' || String(s.grade_level) === String(selectedGrade);
            const matchStrand = selectedStrand === 'all' || String(s.strand_id) === String(selectedStrand);
            return matchGrade && matchStrand;
        });

        filterSection.innerHTML = '<option value="all" selected>All Sections</option>' +
            filtered.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }

    // =========================================================================
    // 5. Load Class Average Grade Trend Chart
    // =========================================================================
    async function loadGradeTrend() {
        if (!gradeTrendCanvas || typeof Chart === 'undefined') return;

        try {
            const query = getFilterQuery();
            const data = await authedFetch(`/api/analytics/grade-trend${query}`, token);
            if (!data.success) return;

            const labels = (data.labels && data.labels.length > 0) ? data.labels : ['1st Quarter', '2nd Quarter', '3rd Quarter'];
            const histData = (data.data && data.data.length > 0) ? data.data : [82, 85, 88];

            const ctx = gradeTrendCanvas.getContext('2d');
            const gradientFill = ctx.createLinearGradient(0, 0, 0, 160);
            gradientFill.addColorStop(0, 'rgba(43, 120, 188, 0.35)');
            gradientFill.addColorStop(1, 'rgba(43, 120, 188, 0.02)');

            if (gradeTrendChart) {
                gradeTrendChart.data.labels = labels;
                gradeTrendChart.data.datasets[0].data = histData;
                gradeTrendChart.update();
            } else {
                gradeTrendChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Class Average Grade',
                                data: histData,
                                borderColor: '#2b78bc',
                                borderWidth: 2.5,
                                pointBackgroundColor: '#2b78bc',
                                pointBorderColor: '#ffffff',
                                pointBorderWidth: 2,
                                pointRadius: 5,
                                pointHoverRadius: 7,
                                fill: true,
                                backgroundColor: gradientFill,
                                tension: 0.3
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2),
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: 'rgba(30, 41, 59, 0.95)',
                                padding: 10,
                                cornerRadius: 8,
                                callbacks: {
                                    label: (context) => `Average: ${context.parsed.y}%`
                                }
                            }
                        },
                        scales: {
                            y: {
                                min: 65,
                                max: 100,
                                ticks: { stepSize: 5, color: '#64748b', font: { size: 10 } },
                                grid: { color: '#f1f5f9' }
                            },
                            x: {
                                ticks: { color: '#64748b', font: { size: 11, weight: '500' } },
                                grid: { color: '#f8fafc' }
                            }
                        }
                    }
                });
            }
        } catch (err) {
            console.error('loadGradeTrend error:', err);
        }
    }

    // =========================================================================
    // 6. Load At-Risk Student Distribution Doughnut Chart
    // =========================================================================
    async function loadRiskDistribution() {
        if (!riskDistributionCanvas || typeof Chart === 'undefined') return;

        try {
            const query = getFilterQuery();
            const data = await authedFetch(`/api/analytics/risk-distribution${query}`, token);
            if (!data.success) return;

            const counts = data.counts || { High: 0, Medium: 0, Low: 0 };
            const atRiskCount = data.atRiskCount !== undefined ? data.atRiskCount : (counts.High + counts.Medium);

            if (atRiskCountEl) {
                atRiskCountEl.textContent = atRiskCount;
            }

            const chartData = [counts.High, counts.Medium, counts.Low];
            // If completely 0 students in filter, provide baseline slice
            const renderData = (counts.High === 0 && counts.Medium === 0 && counts.Low === 0) ? [0, 0, 1] : chartData;

            const ctx = riskDistributionCanvas.getContext('2d');

            if (riskDistChart) {
                riskDistChart.data.datasets[0].data = renderData;
                riskDistChart.update();
            } else {
                riskDistChart = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: ['High Risk', 'Medium Risk', 'Low Risk'],
                        datasets: [
                            {
                                data: renderData,
                                backgroundColor: ['#e53935', '#fb8c00', '#198754'],
                                borderWidth: 2.5,
                                borderColor: '#ffffff',
                                hoverOffset: 4
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2),
                        cutout: '72%',
                        layout: {
                            padding: {
                                top: 4,
                                bottom: 2,
                                left: 4,
                                right: 4
                            }
                        },
                        plugins: {
                            legend: {
                                display: true,
                                position: 'bottom',
                                labels: {
                                    usePointStyle: true,
                                    pointStyle: 'circle',
                                    boxWidth: 8,
                                    padding: 10,
                                    font: { size: 10, weight: '600' }
                                }
                            },
                            tooltip: {
                                backgroundColor: 'rgba(30, 41, 59, 0.95)',
                                padding: 10,
                                cornerRadius: 8,
                                callbacks: {
                                    label: (context) => {
                                        const val = context.raw || 0;
                                        return ` ${context.label}: ${val} student${val === 1 ? '' : 's'}`;
                                    }
                                }
                            }
                        }
                    },
                    plugins: [
                        {
                            id: 'donutCenterPositionTeacher',
                            afterLayout(chart) {
                                const meta = chart.getDatasetMeta(0);
                                if (!meta || !meta.data || !meta.data[0]) return;
                                const centerX = meta.data[0].x;
                                const centerY = meta.data[0].y;
                                const box = chart.canvas.parentElement;
                                const label = box ? box.querySelector('.donut-center-label') : null;
                                if (label && typeof centerX === 'number' && typeof centerY === 'number') {
                                    label.style.left = `${centerX}px`;
                                    label.style.top = `${centerY}px`;
                                    label.style.transform = 'translate(-50%, -50%)';
                                }
                            }
                        }
                    ]
                });
            }
        } catch (err) {
            console.error('loadRiskDistribution error:', err);
        }
    }

    // =========================================================================
    // 7. Load Student Risk Assessment Directory Cards
    // =========================================================================
    async function loadRiskAssessment() {
        if (!riskAssessmentDirectory) return;
        riskAssessmentDirectory.innerHTML = `
            <div class="text-center py-4 text-muted small">
                <div class="spinner-border spinner-border-sm text-success me-2" role="status"></div>
                Loading student risk assessment...
            </div>
        `;

        try {
            const query = getFilterQuery();
            const data = await authedFetch(`/api/analytics/risk-assessment${query}`, token);
            if (!data.success || !Array.isArray(data.students)) {
                currentRiskStudents = [];
                riskAssessmentDirectory.innerHTML = '<p class="text-danger small py-3 text-center mb-0">Failed to load risk assessment data.</p>';
                return;
            }

            currentRiskStudents = data.students;

            if (data.students.length === 0) {
                riskAssessmentDirectory.innerHTML = `
                    <div class="card p-4 border-0 shadow-sm bg-white rounded-4 text-center text-muted">
                        <i class="bi bi-person-check fs-2 d-block mb-2 text-success opacity-75"></i>
                        <p class="m-0 fw-semibold">No students found matching the selected filter criteria.</p>
                        <span class="micro-text text-muted">Try selecting "All Strands" or "All Sections".</span>
                    </div>
                `;
                return;
            }

            riskAssessmentDirectory.innerHTML = data.students.map(s => {
                const actionButton = s.action.disabled
                    ? `<button type="button" class="btn btn-action-recommend btn-secondary w-100" disabled>Not Applicable</button>`
                    : `<a href="${s.action.url}" class="btn btn-action-recommend w-100 text-white text-decoration-none shadow-xs text-truncate" title="Create Intervention Topic">Create Intervention Topic</a>`;

                return `
                    <div class="card row-student-item p-3 border-0 shadow-sm bg-white rounded-4">
                        <div class="row align-items-center g-3 text-center text-sm-start">
                            <div class="col-12 col-sm-6">
                                <h4 class="fw-bold m-0 fs-6 text-dark">${s.name}</h4>
                                <p class="m-0 micro-text text-muted">${s.section}</p>
                                <p class="m-0 micro-text ${s.detailColor} mt-1">${s.detailText}</p>
                            </div>
                            <div class="col-12 col-sm-3 text-center border-start-sm">
                                <span class="badge risk-tag-badge ${s.riskClass}">${s.riskTier}</span>
                            </div>
                            <div class="col-12 col-sm-3 text-center text-sm-end px-md-3">
                                ${actionButton}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            console.error('loadRiskAssessment error:', err);
            currentRiskStudents = [];
            riskAssessmentDirectory.innerHTML = '<p class="text-danger small py-3 text-center mb-0">Error loading student risk assessment.</p>';
        }
    }

    // =========================================================================
    // 8. Refresh All Analytics
    // =========================================================================
    async function refreshAllAnalytics() {
        await Promise.all([
            loadGradeTrend(),
            loadRiskDistribution(),
            loadRiskAssessment()
        ]);
    }

    // Event listeners for filters
    if (filterGradeLevel) {
        filterGradeLevel.addEventListener('change', () => {
            updateStrandDropdown();
            updateSectionDropdown();
            refreshAllAnalytics();
        });
    }

    if (filterStrand) {
        filterStrand.addEventListener('change', () => {
            if (filterStrand.value !== 'all' && filterGradeLevel && filterGradeLevel.value === 'all') {
                const strandSections = availableSections.filter(s => String(s.strand_id) === String(filterStrand.value));
                const uniqueGrades = [...new Set(strandSections.map(s => s.grade_level))];
                if (uniqueGrades.length === 1) {
                    filterGradeLevel.value = String(uniqueGrades[0]);
                    updateStrandDropdown();
                }
            }
            updateSectionDropdown();
            refreshAllAnalytics();
        });
    }

    if (filterSection) {
        filterSection.addEventListener('change', () => {
            refreshAllAnalytics();
        });
    }

    // =========================================================================
    // 9. Export At-Risk Roster to Excel (.xlsx) using SheetJS
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

            // Determine active filter labels
            const gradeText = filterGradeLevel && filterGradeLevel.value !== 'all' ? `Grade ${filterGradeLevel.value}` : 'All Grades';
            const strandText = filterStrand && filterStrand.options[filterStrand.selectedIndex] ? filterStrand.options[filterStrand.selectedIndex].text : 'All Strands';
            const sectionText = filterSection && filterSection.options[filterSection.selectedIndex] ? filterSection.options[filterSection.selectedIndex].text : 'All Sections';

            // Filter out only High & Medium risk students for the Priority tab
            const priorityStudents = currentRiskStudents.filter(s => s.risk === 'High' || s.risk === 'Medium');
            const highCount = currentRiskStudents.filter(s => s.risk === 'High').length;
            const mediumCount = currentRiskStudents.filter(s => s.risk === 'Medium').length;
            const lowCount = currentRiskStudents.filter(s => s.risk === 'Low').length;

            const wb = XLSX.utils.book_new();

            // Helper to build rich styled worksheet
            function buildStyledWorksheet(studentsList, sheetCategoryTitle) {
                const ws = {};
                const merges = [];
                const rowHeights = [];

                // Helper to set cell with style
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
                    setCell(1, c, c === 0 ? "MENTORAE - TEACHER ACADEMIC RISK ASSESSMENT & INTERVENTION ROSTER" : "", {
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
                    const actionText = s.action && !s.action.disabled
                        ? 'Create Targeted Intervention Topic / Lesson'
                        : 'Maintain Satisfactory Academic Standing';

                    // Grade Color
                    let gradeColor = '16A34A';
                    if (s.overallGrade !== null && s.overallGrade !== undefined) {
                        if (s.overallGrade < 75) gradeColor = 'DC2626';
                        else if (s.overallGrade < 80) gradeColor = 'D97706';
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
                    setCell(curRow, 4, s.overallGrade !== null && s.overallGrade !== undefined ? `${s.overallGrade}%` : 'N/A', {
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

                // Configure bounds, merges, row heights, column widths
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

            // 2. Sheet: Complete Class Directory
            const wsComplete = buildStyledWorksheet(currentRiskStudents, "COMPLETE CLASS ACADEMIC RISK DIRECTORY");

            XLSX.utils.book_append_sheet(wb, wsPriority, "At-Risk Priority");
            XLSX.utils.book_append_sheet(wb, wsComplete, "All Evaluated");

            const safeSectionName = (sectionText !== 'All Sections' ? sectionText : (strandText !== 'All Strands' ? strandText : 'All_Classes'))
                .replace(/[^a-zA-Z0-9_-]/g, '_');
            const filename = `TSHS_At-Risk_Roster_${safeSectionName}_${new Date().toISOString().slice(0, 10)}.xlsx`;

            XLSX.writeFile(wb, filename);
        });
    }

    // =========================================================================
    // 10. Print At-Risk Roster
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

                rowsHtml += `
                    <tr>
                        <td style="text-align: center;">${idx + 1}</td>
                        <td><code>${escapeHtml(s.idNumber || 'N/A')}</code></td>
                        <td><strong>${escapeHtml(s.name)}</strong></td>
                        <td>${escapeHtml(s.section)}</td>
                        <td style="text-align: center;">${s.overallGrade !== null && s.overallGrade !== undefined ? s.overallGrade + '%' : '--'}</td>
                        <td style="text-align: center;">${s.attendanceRate !== null && s.attendanceRate !== undefined ? s.attendanceRate + '%' : '--'}</td>
                        <td style="text-align: center;">
                            <span style="display: inline-block; padding: 3px 8px; border-radius: 12px; font-weight: bold; font-size: 0.75rem; color: ${badgeColor}; background-color: ${badgeBg};">
                                ${escapeHtml(s.riskTier || s.risk)}
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
                    <title>At-Risk Student Roster - Talisay SHS</title>
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
                        <span class="text-muted small">Print Preview</span>
                        <button class="btn btn-sm btn-primary" onclick="window.print()">Print Now</button>
                    </div>
                    <div class="header-banner d-flex justify-content-between align-items-center">
                        <div>
                            <h4 class="m-0 fw-bold" style="color: #0a5c2c;">TALISAY SENIOR HIGH SCHOOL</h4>
                            <div class="small fw-semibold text-secondary">Student Risk Assessment & Academic Intervention Roster</div>
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
            setTimeout(() => {
                printWindow.print();
            }, 400);
        });
    }

    // Initial load
    await loadFilterOptions();
    await refreshAllAnalytics();
});