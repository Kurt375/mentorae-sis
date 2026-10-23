document.addEventListener('DOMContentLoaded', () => {
    const { token, user } = requireSession('../login.html');

    // Function to update live date and time
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

    // QR Modal Logic
    const btnShowQr = document.getElementById('btnShowQr');
    const qrModal = document.getElementById('qrModal');
    const btnCloseQr = document.getElementById('btnCloseQr');
    const qrCodeContainer = document.getElementById('qrCodeContainer');
    const btnDownloadQr = document.getElementById('btnDownloadQr');

    let qrRendered = false;

    async function renderQrCode() {
        if (qrRendered || !qrCodeContainer) return;
        try {
            const data = await authedFetch('/api/attendance/my-qr', token);
            if (!data.success) {
                qrCodeContainer.innerHTML = `<p class="text-danger small">${data.message}</p>`;
                return;
            }
            new QRCode(qrCodeContainer, {
                text: data.qrText, // the student's own unique ID number
                width: 180,
                height: 180,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
            const studentQrLabel = document.getElementById('studentQrLabel');
            if (studentQrLabel) {
                studentQrLabel.textContent = `TSHS ID: ${data.qrText || (user && user.id_number) || 'N/A'}`;
            }
            qrRendered = true;
        } catch (err) {
            console.error(err);
            qrCodeContainer.innerHTML = '<p class="text-danger small">Could not load your QR code.</p>';
            const studentQrLabel = document.getElementById('studentQrLabel');
            if (studentQrLabel && user && user.id_number) {
                studentQrLabel.textContent = `TSHS ID: ${user.id_number}`;
            }
        }
    }

    if (btnShowQr && qrModal && btnCloseQr) {
        btnShowQr.addEventListener('click', () => {
            qrModal.classList.remove('d-none');
            renderQrCode();
        });
        btnCloseQr.addEventListener('click', () => qrModal.classList.add('d-none'));
        qrModal.addEventListener('click', (e) => {
            if (e.target === qrModal) qrModal.classList.add('d-none');
        });
    }

    if (btnDownloadQr && qrCodeContainer) {
        btnDownloadQr.addEventListener('click', () => {
            const canvas = qrCodeContainer.querySelector('canvas');
            if (canvas) {
                const link = document.createElement('a');
                link.download = 'student-attendance-qr.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
            } else {
                alert('Open "Show QR Code" first.');
            }
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function renderMonthlyTrends(monthlyTrends) {
        const container = document.getElementById('monthlyTrendContainer');
        if (!container) return;

        if (!monthlyTrends || !monthlyTrends.length) {
            container.innerHTML = `
                <div class="text-muted text-center py-4 text-xs">
                    <i class="bi bi-calendar2-range fs-4 d-block mb-1 text-secondary opacity-50"></i>
                    No monthly attendance data recorded yet.
                </div>
            `;
            return;
        }

        container.innerHTML = monthlyTrends.map(item => {
            const barColor = item.rate >= 90 ? 'bg-success' : (item.rate >= 75 ? 'bg-info' : 'bg-warning');
            const textColor = item.rate >= 90 ? 'text-success' : (item.rate >= 75 ? 'text-info' : 'text-warning');
            return `
                <div>
                    <div class="d-flex justify-content-between text-xs font-semibold mb-1">
                        <span class="text-dark">${escapeHtml(item.monthLabel)}</span>
                        <span class="${textColor} fw-bold">${item.rate}%</span>
                    </div>
                    <div class="progress progress-bar-scale bg-light">
                        <div class="progress-bar ${barColor}" style="width: ${Math.max(item.rate, 4)}%;"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderAttendanceAlerts(rate, streak, totalDays) {
        const container = document.getElementById('attendanceAlertsContainer');
        if (!container) return;

        let standingAlert = '';
        if (!totalDays) {
            standingAlert = `
                <div class="alert alert-secondary border-0 shadow-none m-0 p-2.5 d-flex align-items-start gap-2.5 rounded-3">
                    <i class="bi bi-info-circle-fill fs-5 mt-0.5 text-secondary"></i>
                    <div>
                        <div class="fw-bold text-xs">No Records Yet</div>
                        <div class="micro-text opacity-90 mt-0.5">Attendance logs will appear once class sessions are marked.</div>
                    </div>
                </div>
            `;
        } else if (rate >= 95) {
            standingAlert = `
                <div class="alert alert-success border-0 shadow-none m-0 p-2.5 d-flex align-items-start gap-2.5 rounded-3">
                    <i class="bi bi-shield-check-fill fs-5 mt-0.5 text-success"></i>
                    <div>
                        <div class="fw-bold text-xs">Perfect Attendance</div>
                        <div class="micro-text opacity-90 mt-0.5">You're doing great! Keep it up!</div>
                    </div>
                </div>
            `;
        } else if (rate >= 80) {
            standingAlert = `
                <div class="alert alert-success border-0 shadow-none m-0 p-2.5 d-flex align-items-start gap-2.5 rounded-3">
                    <i class="bi bi-check-circle-fill fs-5 mt-0.5 text-success"></i>
                    <div>
                        <div class="fw-bold text-xs">Good Standing</div>
                        <div class="micro-text opacity-90 mt-0.5">Your attendance is meeting school requirements.</div>
                    </div>
                </div>
            `;
        } else {
            standingAlert = `
                <div class="alert alert-warning border-0 shadow-none m-0 p-2.5 d-flex align-items-start gap-2.5 rounded-3">
                    <i class="bi bi-exclamation-triangle-fill fs-5 mt-0.5 text-warning"></i>
                    <div>
                        <div class="fw-bold text-xs">Attendance Warning (${rate}%)</div>
                        <div class="micro-text opacity-90 mt-0.5">Your attendance is below 80%. Please attend your classes regularly.</div>
                    </div>
                </div>
            `;
        }

        let streakAlert = '';
        const streakDays = Number(streak) || 0;
        if (streakDays >= 1) {
            streakAlert = `
                <div class="alert alert-info border-0 shadow-none m-0 p-2.5 d-flex align-items-start gap-2.5 rounded-3">
                    <i class="bi bi-lightning-charge-fill fs-5 mt-0.5 text-info"></i>
                    <div>
                        <div class="fw-bold text-xs">Streak: ${streakDays} ${streakDays === 1 ? 'Day' : 'Days'}</div>
                        <div class="micro-text opacity-90 mt-0.5">Consecutive days present in session track.</div>
                    </div>
                </div>
            `;
        } else {
            streakAlert = `
                <div class="alert alert-secondary border-0 shadow-none m-0 p-2.5 d-flex align-items-start gap-2.5 rounded-3">
                    <i class="bi bi-lightning-charge fs-5 mt-0.5 text-secondary"></i>
                    <div>
                        <div class="fw-bold text-xs">No Active Streak</div>
                        <div class="micro-text opacity-90 mt-0.5">Attend your next scheduled session on time to start a streak!</div>
                    </div>
                </div>
            `;
        }

        container.innerHTML = standingAlert + streakAlert;
    }

    // Load metrics + history from the real API
    async function loadSummary() {
        try {
            const data = await authedFetch('/api/attendance/summary', token);
            if (!data.success) return;
            document.getElementById('metricTotalDays').textContent = data.totalDays;
            document.getElementById('metricPresentDays').textContent = data.presentDays;
            document.getElementById('metricAttendanceRate').textContent = `${data.rate}%`;

            renderMonthlyTrends(data.monthlyTrends);
            renderAttendanceAlerts(data.rate, data.streak, data.totalDays);
        } catch (err) {
            console.error(err);
            renderMonthlyTrends([]);
            renderAttendanceAlerts(0, 0, 0);
        }
    }

    function formatDate(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatTime(timeStr) {
        if (!timeStr) return '-';
        const [h, m] = timeStr.split(':');
        const date = new Date();
        date.setHours(Number(h), Number(m));
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }

    const statusPillClass = {
        present: 'bg-success-subtle text-success',
        late: 'bg-warning-subtle text-warning',
        excused: 'bg-info-subtle text-info',
        absent: 'bg-danger-subtle text-danger',
    };

    let allAttendanceHistory = [];
    const attendanceSearchInput = document.getElementById('attendanceSearchInput');
    const attendanceStatusFilter = document.getElementById('attendanceStatusFilter');

    function renderAttendanceLogRows() {
        const tbody = document.getElementById('attendanceLogBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!allAttendanceHistory || !allAttendanceHistory.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">No attendance records yet.</td></tr>';
            return;
        }

        const search = (attendanceSearchInput ? attendanceSearchInput.value : '').trim().toLowerCase();
        const status = attendanceStatusFilter ? attendanceStatusFilter.value : 'all';

        const filtered = allAttendanceHistory.filter(row => {
            if (status !== 'all' && (row.status || '').toLowerCase() !== status.toLowerCase()) {
                return false;
            }
            if (search) {
                const formatted = formatDate(row.scan_date).toLowerCase();
                const rawDate = (row.scan_date || '').toLowerCase();
                const statusText = (row.status || '').toLowerCase();
                if (!formatted.includes(search) && !rawDate.includes(search) && !statusText.includes(search)) {
                    return false;
                }
            }
            return true;
        });

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">No attendance records matching your filter.</td></tr>';
            return;
        }

        for (const row of filtered) {
            const tr = document.createElement('tr');
            const label = row.status.charAt(0).toUpperCase() + row.status.slice(1);
            tr.innerHTML = `
                <td class="px-3 py-2.5 fw-medium text-dark">${formatDate(row.scan_date)}</td>
                <td class="px-3 py-2.5"><span class="badge attendance-pill ${statusPillClass[row.status] || ''}">${label}</span></td>
                <td class="px-3 py-2.5 text-secondary">${formatTime(row.scan_time)}</td>
                <td class="px-3 py-2.5 text-muted micro-text">${row.status === 'present' ? 'On Time' : (row.remarks || '')}</td>
            `;
            tbody.appendChild(tr);
        }
    }

    if (attendanceSearchInput) {
        attendanceSearchInput.addEventListener('input', renderAttendanceLogRows);
    }
    if (attendanceStatusFilter) {
        attendanceStatusFilter.addEventListener('change', renderAttendanceLogRows);
    }

    async function loadHistory() {
        try {
            const data = await authedFetch('/api/attendance/history', token);
            if (!data.success || !Array.isArray(data.history)) {
                allAttendanceHistory = [];
            } else {
                allAttendanceHistory = data.history;
            }
            renderAttendanceLogRows();
        } catch (err) {
            console.error(err);
            allAttendanceHistory = [];
            renderAttendanceLogRows();
        }
    }

    // Export Attendance Logs Logic
    const btnExportLogs = document.getElementById('btnExportLogs');
    if (btnExportLogs) {
        btnExportLogs.addEventListener('click', () => {
            const table = document.getElementById('attendanceLogTable');
            const tbody = document.getElementById('attendanceLogBody');
            if (!table || !tbody || !tbody.children.length || tbody.innerText.includes('No attendance records')) {
                alert('No attendance records available to export.');
                return;
            }
            const tableHtml = table.outerHTML;
            const pageTitle = document.title;
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Export - ${pageTitle}</title>
                        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
                        <link rel="stylesheet" href="attendance_student.css">
                        <style>
                            body { padding: 2rem; }
                            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
                        </style>
                    </head>
                    <body>
                        <h1>Attendance History</h1>
                        ${tableHtml}
                    </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.onload = function() {
                printWindow.focus();
                printWindow.print();
            };
        });
    }

    loadSummary();
    loadHistory();
});
