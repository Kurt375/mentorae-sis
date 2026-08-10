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

    // Risk Assessment Directory
    const directoryData = await authedFetch('/api/analytics/risk-directory', token);
    const directoryEl = document.getElementById('riskAssessmentDirectory');
    if (!directoryData.success || !directoryData.directory.length) {
        directoryEl.innerHTML = '<p class="text-muted text-center py-3">No at-risk students right now.</p>';
        return;
    }

    const riskClass = {
        High: { badge: 'bg-high-risk text-danger', btn: 'btn-success', label: 'Study Lessons' },
        Medium: { badge: 'bg-medium-risk text-warning', btn: 'btn-success', label: 'Study Lessons' },
    };

    directoryEl.innerHTML = directoryData.directory.map(s => {
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
                        <button type="button" class="btn btn-action-recommend ${cfg.btn} w-100" disabled>${cfg.label}</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
});
