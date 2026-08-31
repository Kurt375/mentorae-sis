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

    // Grade Trend line chart
    const trendData = await authedFetch('/api/analytics/grade-trend', token);
    if (trendData.success) {
        new Chart(document.getElementById('gradeTrendCanvas'), {
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
    const riskData = await authedFetch('/api/analytics/risk-distribution', token);
    if (riskData.success) {
        new Chart(document.getElementById('riskDistributionCanvas'), {
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

    // Risk Assessment Directory (descriptive: current grade/attendance vs. thresholds)
    const directoryData = await authedFetch('/api/analytics/risk-directory', token);
    const directoryEl = document.getElementById('riskAssessmentDirectory');

    // Predictive Risk Directory (ML: Random Forest forecast for in-progress terms)
    // Fetched up front so the descriptive directory's "Study Lessons" button can
    // pull a matching prescriptive recommendation when one exists.
    const predictiveData = await authedFetch('/api/analytics/predictive-risk', token);
    const predictiveByIdNumber = {};
    if (predictiveData.success) {
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

    if (!directoryData.success || !directoryData.directory.length) {
        directoryEl.innerHTML = '<p class="text-muted text-center py-3">No at-risk students right now.</p>';
    } else {
        const riskClass = {
            High: { badge: 'bg-high-risk text-danger', btn: 'btn-success', label: 'Study Lessons' },
            Medium: { badge: 'bg-medium-risk text-warning', btn: 'btn-success', label: 'Study Lessons' },
        };

        directoryEl.innerHTML = directoryData.directory.map((s, i) => {
            const cfg = riskClass[s.risk] || riskClass.Medium;
            return `
                <div class="card row-student-item p-3 border-0 shadow-sm bg-white rounded-3">
                    <div class="row align-items-center g-3 text-center text-sm-start">
                        <div class="col-12 col-sm-6 col-md-7">
                            <h4 class="fw-bold m-0 fs-6 text-dark">${s.name}</h4>
                            <p class="m-0 micro-text text-muted mt-1">Grade: <span class="fw-medium">${s.grade ?? '—'}%</span> | Attendance: <span class="fw-medium">${s.attendanceRate ?? '—'}%</span></p>
                        </div>
                        <div class="col-12 col-sm-3 col-md-2 text-center border-start-sm">
                            <span class="badge risk-tag-badge ${cfg.badge} text-uppercase">${s.risk} Risk</span>
                        </div>
                        <div class="col-12 col-sm-3 col-md-3 text-center text-sm-end">
                            <button type="button" class="btn btn-action-recommend ${cfg.btn} w-100" data-id-number="${s.idNumber}" data-name="${s.name}">${cfg.label}</button>
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
