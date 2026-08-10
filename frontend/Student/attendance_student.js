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
            qrRendered = true;
        } catch (err) {
            console.error(err);
            qrCodeContainer.innerHTML = '<p class="text-danger small">Could not load your QR code.</p>';
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

    // Load metrics + history from the real API
    async function loadSummary() {
        try {
            const data = await authedFetch('/api/attendance/summary', token);
            if (!data.success) return;
            document.getElementById('metricTotalDays').textContent = data.totalDays;
            document.getElementById('metricPresentDays').textContent = data.presentDays;
            document.getElementById('metricAttendanceRate').textContent = `${data.rate}%`;
        } catch (err) {
            console.error(err);
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

    async function loadHistory() {
        try {
            const data = await authedFetch('/api/attendance/history', token);
            const tbody = document.getElementById('attendanceLogBody');
            tbody.innerHTML = '';
            if (!data.success || !data.history.length) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">No attendance records yet.</td></tr>';
                return;
            }
            for (const row of data.history) {
                const tr = document.createElement('tr');
                const label = row.status.charAt(0).toUpperCase() + row.status.slice(1);
                tr.innerHTML = `
                    <td class="px-3 py-2.5 fw-medium text-dark">${formatDate(row.scan_date)}</td>
                    <td class="px-3 py-2.5"><span class="badge attendance-pill ${statusPillClass[row.status] || ''}">${label}</span></td>
                    <td class="px-3 py-2.5 text-secondary">${formatTime(row.scan_time)}</td>
                    <td class="px-3 py-2.5 text-muted micro-text">${row.status === 'present' ? 'On Time' : ''}</td>
                `;
                tbody.appendChild(tr);
            }
        } catch (err) {
            console.error(err);
        }
    }

    // Export Attendance Logs Logic
    const btnExportLogs = document.getElementById('btnExportLogs');
    if (btnExportLogs) {
        btnExportLogs.addEventListener('click', () => {
            const table = document.getElementById('attendanceLogTable');
            if (!table) {
                alert('Attendance table could not be found.');
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
