document.addEventListener('DOMContentLoaded', () => {
    const { token } = requireSession('../login.html');

    function updateDateTime() {
        const now = new Date();
        document.getElementById('liveDate').textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        document.getElementById('liveTime').textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    // Same tiers as the backend's getRemarks(), so colors always match the label.
    function tierFor(average) {
        if (average >= 90) return { color: '#2e7d32', bg: 'bg-success-subtle', text: 'text-success' };
        if (average >= 85) return { color: '#1976d2', bg: 'bg-primary-subtle', text: 'text-primary' };
        if (average >= 80) return { color: '#0097a7', bg: 'bg-info-subtle', text: 'text-info' };
        if (average >= 75) return { color: '#f9a825', bg: 'bg-warning-subtle', text: 'text-warning' };
        return { color: '#d32f2f', bg: 'bg-danger-subtle', text: 'text-danger' };
    }

    function remarksFor(average) {
        if (average >= 90) return 'Outstanding';
        if (average >= 85) return 'Very Satisfactory';
        if (average >= 80) return 'Satisfactory';
        if (average >= 75) return 'Fairly Satisfactory';
        return 'Did Not Meet Expectations';
    }

    async function load() {
        const data = await authedFetch('/api/grades/mine', token);
        if (!data.success) return;

        // Overall summary
        const overallVal = document.getElementById('overallGradeVal');
        const overallBar = document.getElementById('overallProgressBar');
        const overallBadge = document.getElementById('overallRemarksBadge');
        const overallSubtitle = document.getElementById('overallSubtitle');

        if (data.overallGrade) {
            const avg = Number(data.overallGrade);
            const tier = tierFor(avg);
            overallVal.textContent = `${avg}%`;
            overallBar.style.width = `${avg}%`;
            overallBar.style.backgroundColor = tier.color;
            overallBadge.textContent = remarksFor(avg);
            overallBadge.className = `badge remarks-badge ${tier.bg} ${tier.text}`;
            overallSubtitle.textContent = `Averaged across ${data.grades.length} posted grade${data.grades.length === 1 ? '' : 's'}.`;
        } else {
            overallSubtitle.textContent = 'No grades posted yet.';
        }

        renderGrades(data.grades);
    }

    function renderGrades(grades) {
        const list = document.getElementById('gradesList');
        if (!grades.length) {
            list.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="bi bi-clipboard-data display-3 d-block mb-3 opacity-50"></i>
                    <h6>No grades posted yet</h6>
                    <p class="small">Check back once your teachers start encoding grades.</p>
                </div>`;
            return;
        }

        list.innerHTML = grades.map((g, i) => {
            const avg = Number(g.average);
            const tier = tierFor(avg);
            const quiz = Number(g.quiz_score), activity = Number(g.activity_score), exam = Number(g.exam_score);
            return `
            <div class="grade-card">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <h6 class="fw-bold mb-0">${g.subject}</h6>
                        <span class="text-muted small">${g.term}</span>
                    </div>
                    <div class="text-end">
                        <div class="fw-bold fs-5" style="color:${tier.color}">${avg}%</div>
                        <span class="badge remarks-badge ${tier.bg} ${tier.text}">${g.remarks}</span>
                    </div>
                </div>

                <div class="row g-3 mt-1">
                    <div class="col-4">
                        <div class="mini-bar-label"><span>Quiz</span><span>${quiz}/30</span></div>
                        <div class="mini-bar"><div class="mini-bar-fill" style="width:${(quiz / 30) * 100}%; background:#7c4dff;"></div></div>
                    </div>
                    <div class="col-4">
                        <div class="mini-bar-label"><span>Activity</span><span>${activity}/20</span></div>
                        <div class="mini-bar"><div class="mini-bar-fill" style="width:${(activity / 20) * 100}%; background:#26a69a;"></div></div>
                    </div>
                    <div class="col-4">
                        <div class="mini-bar-label"><span>Exam</span><span>${exam}/50</span></div>
                        <div class="mini-bar"><div class="mini-bar-fill" style="width:${(exam / 50) * 100}%; background:#ff7043;"></div></div>
                    </div>
                </div>

                <div class="goal-panel">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <label class="small fw-semibold m-0" for="goalSlider-${i}">
                            <i class="bi bi-bullseye"></i> What do I need for a target grade?
                        </label>
                        <span class="goal-slider-val" id="goalSliderVal-${i}">90%</span>
                    </div>
                    <input type="range" class="form-range goal-slider" id="goalSlider-${i}" min="60" max="100" step="1" value="90"
                           data-quiz="${quiz}" data-activity="${activity}" data-subject-id="${g.subjectId}" data-term="${encodeURIComponent(g.term)}">
                    <p class="small mb-0 mt-2" id="goalResult-${i}"></p>

                    <button type="button" class="btn btn-sm btn-outline-success mt-2 practice-path-btn" data-i="${i}">
                        <i class="bi bi-magic"></i> Recommended Practice Path
                    </button>
                    <div class="mt-2" id="practicePath-${i}"></div>
                </div>
            </div>`;
        }).join('');

        // Wire each card's slider independently and run an initial calculation.
        list.querySelectorAll('.goal-slider').forEach((slider, i) => {
            slider.addEventListener('input', () => updateGoal(i));
            updateGoal(i);
        });

        list.querySelectorAll('.practice-path-btn').forEach((btn) => {
            btn.addEventListener('click', () => loadPracticePath(Number(btn.dataset.i)));
        });
    }

    /**
     * Calls the ML-backed "Prescriptive Path to Goal" endpoint for a single
     * subject/term and renders the forecasted risk + recommended actions.
     */
    async function loadPracticePath(i) {
        const slider = document.getElementById(`goalSlider-${i}`);
        const container = document.getElementById(`practicePath-${i}`);
        const subjectId = slider.dataset.subjectId;
        const term = decodeURIComponent(slider.dataset.term);
        const targetGrade = slider.value;

        container.innerHTML = '<p class="small text-muted mb-0"><i class="bi bi-hourglass-split"></i> Building your practice path…</p>';

        const data = await authedFetch(
            `/api/grades/prescriptive-path?subjectId=${encodeURIComponent(subjectId)}&term=${encodeURIComponent(term)}&targetGrade=${encodeURIComponent(targetGrade)}`,
            token
        );

        if (!data.success) {
            container.innerHTML = `<p class="small text-danger mb-0">${data.message || 'Could not build a recommended path right now.'}</p>`;
            return;
        }

        const riskColor = { High: 'text-danger', Medium: 'text-warning', Low: 'text-success' };
        const confidenceText = data.confidence !== null ? ` (${Math.round(data.confidence * 100)}% confidence)` : '';

        container.innerHTML = `
            <div class="goal-panel border">
                <p class="small fw-semibold mb-1 ${riskColor[data.predictedRisk] || ''}">
                    <i class="bi bi-graph-up-arrow"></i> Forecast: ${data.predictedRisk} risk${confidenceText}
                    ${!data.modelTrained ? '<span class="text-muted fw-normal"> (rule-based estimate — ML model not trained yet)</span>' : ''}
                </p>
                <p class="small mb-1"><strong>Focus area:</strong> ${data.focusArea}</p>
                <ul class="small mb-0 ps-3">
                    ${data.recommendedPath.map((a) => `<li class="mb-1">${a}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    function updateGoal(i) {
        const slider = document.getElementById(`goalSlider-${i}`);
        const valEl = document.getElementById(`goalSliderVal-${i}`);
        const resultEl = document.getElementById(`goalResult-${i}`);
        const target = Number(slider.value);
        const quiz = Number(slider.dataset.quiz);
        const activity = Number(slider.dataset.activity);

        valEl.textContent = `${target}%`;

        const secured = quiz + activity; // out of 50, already locked in from quiz + activity
        const requiredExam = target - secured; // out of 50

        if (requiredExam <= 0) {
            resultEl.className = 'small mb-0 mt-2 text-success fw-semibold';
            resultEl.innerHTML = `<i class="bi bi-check-circle-fill"></i> You've already secured this grade from your quiz and activity scores alone.`;
        } else if (requiredExam <= 50) {
            const pct = Math.round((requiredExam / 50) * 100);
            resultEl.className = 'small mb-0 mt-2 text-dark';
            resultEl.innerHTML = `You need at least <strong>${requiredExam.toFixed(1)}/50</strong> (${pct}%) on the exam to reach <strong>${target}%</strong>.`;
        } else {
            const maxPossible = secured + 50;
            resultEl.className = 'small mb-0 mt-2 text-danger';
            resultEl.innerHTML = `Not possible this term — even a perfect exam score caps you at <strong>${maxPossible}%</strong>. Try a lower target.`;
        }
    }

    /**
     * Consolidated progress report: GWA + subject grades + attendance +
     * badges in one printable document (Objective 3.1). Reuses the same
     * "open a print-ready window" pattern as the Attendance page's Export
     * button, just combining three data sources instead of one table.
     */
    async function downloadFullReport() {
        const [gradesData, attendanceData, badgesData] = await Promise.all([
            authedFetch('/api/grades/mine', token),
            authedFetch('/api/attendance/summary', token),
            authedFetch(`/api/badges/student/${encodeURIComponent(getSelfId())}`, token),
        ]);

        function getSelfId() {
            try {
                return JSON.parse(atob(token.split('.')[1])).id;
            } catch (e) {
                return '';
            }
        }

        const studentName = document.querySelector('.student-name, #studentNameHeader')?.textContent?.trim() || 'Student';
        const gwa = gradesData.success && gradesData.overallGrade ? Number(gradesData.overallGrade).toFixed(1) : '—';
        const attendanceRate = attendanceData.success ? (attendanceData.attendanceRate ?? '—') : '—';
        const badgeCount = badgesData.success ? (badgesData.badges || []).length : 0;

        const subjectRows = (gradesData.success ? gradesData.subjects || [] : [])
            .map((s) => `<tr><td>${s.subjectName || s.name}</td><td>${s.average ?? '—'}</td><td>${remarksFor(Number(s.average) || 0)}</td></tr>`)
            .join('');

        const badgeRows = (badgesData.success ? badgesData.badges || [] : [])
            .map((b) => `<li>${b.name} — earned ${new Date(b.earned_at).toLocaleDateString()}</li>`)
            .join('');

        const w = window.open('', '_blank');
        w.document.write(`
            <html>
            <head>
                <title>Progress Report — ${studentName}</title>
                <style>
                    body { font-family: sans-serif; padding: 2.5rem; color: #212529; }
                    h1 { font-size: 1.4rem; margin-bottom: 0; }
                    .subtitle { color: #6c757d; margin-bottom: 1.5rem; }
                    .summary { display: flex; gap: 2rem; margin-bottom: 1.5rem; }
                    .summary div { border: 1px solid #dee2e6; border-radius: 8px; padding: 0.75rem 1.25rem; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
                    th, td { border: 1px solid #dee2e6; padding: 0.5rem; text-align: left; font-size: 0.9rem; }
                    th { background: #f1f3f5; }
                    @media print { body { -webkit-print-color-adjust: exact; } }
                </style>
            </head>
            <body>
                <h1>Mentorae — Student Progress Report</h1>
                <div class="subtitle">${studentName} · Generated ${new Date().toLocaleDateString()}</div>
                <div class="summary">
                    <div><strong>GWA</strong><br>${gwa}%</div>
                    <div><strong>Attendance Rate</strong><br>${attendanceRate}%</div>
                    <div><strong>Badges Earned</strong><br>${badgeCount}</div>
                </div>
                <h3>Subject Grades</h3>
                <table><tr><th>Subject</th><th>Average</th><th>Remarks</th></tr>${subjectRows || '<tr><td colspan="3">No grades yet.</td></tr>'}</table>
                <h3>Badges</h3>
                <ul>${badgeRows || '<li>No badges earned yet.</li>'}</ul>
            </body>
            </html>
        `);
        w.document.close();
        w.print();
    }

    const btnFullReport = document.getElementById('btnDownloadFullReport');
    if (btnFullReport) btnFullReport.addEventListener('click', downloadFullReport);

    load();
});
