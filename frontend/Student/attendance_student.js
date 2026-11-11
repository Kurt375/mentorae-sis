document.addEventListener('DOMContentLoaded', () => {
    const { token, user } = requireSession('../login.html');

    // Resolve Learner Details for Exports & Printables
    let studentFullName = (user && (user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.name)) || 'Student';
    let studentIdNumber = (user && user.id_number) || 'N/A';
    let studentSectionName = (user && (user.section_name || user.sectionName || user.section)) || '';
    let studentTrackStrand = (user && (user.strand || user.strandCode)) || '';

    function applyStudentProfile(p) {
        if (!p) return;
        if (p.fullName || p.full_name) {
            studentFullName = p.fullName || p.full_name;
        } else if (p.firstName || p.first_name || p.lastName || p.last_name) {
            studentFullName = `${p.firstName || p.first_name || ''} ${p.lastName || p.last_name || ''}`.trim();
        }
        if (p.idNumber || p.id_number) studentIdNumber = p.idNumber || p.id_number;

        const rawSec = p.sectionName || p.section_name || p.section || '';
        if (rawSec) {
            studentSectionName = rawSec;
        }
        if (p.strandCode || p.strand) studentTrackStrand = p.strandCode || p.strand;
    }

    // Eagerly hydrate complete profile from server
    authedFetch('/api/auth/profile', token).then(res => {
        if (res && res.success && res.profile) {
            applyStudentProfile(res.profile);
        }
    }).catch(() => {});

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
            if (data.student) {
                applyStudentProfile(data.student);
            }
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
    const attendanceYearFilter = document.getElementById('attendanceYearFilter');
    const attendanceTermFilter = document.getElementById('attendanceTermFilter');
    const attendanceStatusFilter = document.getElementById('attendanceStatusFilter');

    function getSchoolYearFromDate(dateStr) {
        if (!dateStr) return '';
        const parts = String(dateStr).slice(0, 10).split('-');
        if (parts.length < 3) return '';
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (isNaN(y) || isNaN(m)) return '';
        return m >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
    }

    function getTermFromDate(dateStr) {
        if (!dateStr) return '';
        const parts = String(dateStr).slice(0, 10).split('-');
        if (parts.length < 3) return '';
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        if (isNaN(m) || isNaN(d)) return '';
        // 1st Term: June 8 – September 15
        if ((m === 6 && d >= 8) || m === 7 || m === 8 || (m === 9 && d <= 15)) {
            return 'term1';
        }
        // 2nd Term: September 16 – December
        if ((m === 9 && d >= 16) || m === 10 || m === 11 || m === 12) {
            return 'term2';
        }
        // 3rd Term: January – May
        if (m >= 1 && m <= 5) {
            return 'term3';
        }
        return '';
    }

    function syncYearDropdownOptions(history) {
        if (!history || !history.length || !attendanceYearFilter) return;
        const yearsFound = new Set();
        history.forEach(r => {
            const sy = getSchoolYearFromDate(r.scan_date);
            if (sy) yearsFound.add(sy);
        });
        yearsFound.forEach(sy => {
            let exists = false;
            for (let i = 0; i < attendanceYearFilter.options.length; i++) {
                if (attendanceYearFilter.options[i].value === sy) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                const opt = document.createElement('option');
                opt.value = sy;
                opt.textContent = `S.Y. ${sy}`;
                attendanceYearFilter.appendChild(opt);
            }
        });
    }

    function getFilterMetadata() {
        const year = attendanceYearFilter ? attendanceYearFilter.value : 'all';
        const term = attendanceTermFilter ? attendanceTermFilter.value : 'all';
        const yearText = (attendanceYearFilter && attendanceYearFilter.selectedIndex >= 0)
            ? attendanceYearFilter.options[attendanceYearFilter.selectedIndex].text
            : 'All School Years';
        const termText = (attendanceTermFilter && attendanceTermFilter.selectedIndex >= 0)
            ? attendanceTermFilter.options[attendanceTermFilter.selectedIndex].text
            : 'All Terms';

        let tag = 'All';
        if (year !== 'all') tag = `SY_${year}`;
        if (term !== 'all') tag += `_${term}`;

        return {
            year,
            term,
            yearText,
            termText,
            tag,
            fullScope: `${yearText} • ${termText}`
        };
    }

    function getFilteredAttendanceRows() {
        if (!allAttendanceHistory || !allAttendanceHistory.length) return [];
        const search = (attendanceSearchInput ? attendanceSearchInput.value : '').trim().toLowerCase();
        const year = attendanceYearFilter ? attendanceYearFilter.value : 'all';
        const term = attendanceTermFilter ? attendanceTermFilter.value : 'all';
        const status = attendanceStatusFilter ? attendanceStatusFilter.value : 'all';

        return allAttendanceHistory.filter(row => {
            if (!row.scan_date) return false;
            const dateStr = String(row.scan_date).slice(0, 10);
            const d = new Date(dateStr + 'T00:00:00');
            const day = d.getDay();
            if (day === 0 || day === 6) return false; // Exclude weekends

            if (year !== 'all') {
                const rowSy = getSchoolYearFromDate(dateStr);
                if (rowSy !== year) return false;
            }

            if (term !== 'all') {
                const rowTerm = getTermFromDate(dateStr);
                if (rowTerm !== term) return false;
            }

            if (status !== 'all' && (row.status || '').toLowerCase() !== status.toLowerCase()) {
                return false;
            }

            if (search) {
                const formatted = formatDate(dateStr).toLowerCase();
                const rawDate = dateStr.toLowerCase();
                const statusText = (row.status || '').toLowerCase();
                if (!formatted.includes(search) && !rawDate.includes(search) && !statusText.includes(search)) {
                    return false;
                }
            }
            return true;
        });
    }

    function renderAttendanceLogRows() {
        const tbody = document.getElementById('attendanceLogBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!allAttendanceHistory || !allAttendanceHistory.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">No attendance records yet.</td></tr>';
            return;
        }

        const filtered = getFilteredAttendanceRows();

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
    if (attendanceYearFilter) {
        attendanceYearFilter.addEventListener('change', renderAttendanceLogRows);
    }
    if (attendanceTermFilter) {
        attendanceTermFilter.addEventListener('change', renderAttendanceLogRows);
    }
    if (attendanceStatusFilter) {
        attendanceStatusFilter.addEventListener('change', renderAttendanceLogRows);
    }

    async function loadHistory() {
        try {
            const data = await authedFetch('/api/attendance/history?limit=1000', token);
            if (!data.success || !Array.isArray(data.history)) {
                allAttendanceHistory = [];
            } else {
                allAttendanceHistory = data.history;
                syncYearDropdownOptions(allAttendanceHistory);
            }
            renderAttendanceLogRows();
        } catch (err) {
            console.error(err);
            allAttendanceHistory = [];
            renderAttendanceLogRows();
        }
    }

    // =========================================================================
    // Printable & Downloadable Attendance Reports (Print, .xlsx, .csv)
    // =========================================================================
    const btnExportLogs = document.getElementById('btnExportLogs');
    const btnDownloadAttendanceExcel = document.getElementById('btnDownloadAttendanceExcel');
    const btnDownloadAttendanceCsv = document.getElementById('btnDownloadAttendanceCsv');

    function getExportRows() {
        const rows = getFilteredAttendanceRows();
        if (!rows || !rows.length) return [];
        return rows.map((row, idx) => ({
            no: idx + 1,
            date: formatDate(row.scan_date),
            status: (row.status || '').toUpperCase(),
            time: formatTime(row.scan_time),
            remarks: row.status === 'present' ? 'On Time' : (row.remarks || 'Regular scan')
        }));
    }

    function printAttendanceReport() {
        const rows = getExportRows();
        if (!rows.length) {
            alert('No attendance records available to print for the selected filter.');
            return;
        }

        const meta = getFilterMetadata();

        const presentCount = rows.filter(r => r.status === 'PRESENT').length;
        const lateCount = rows.filter(r => r.status === 'LATE').length;
        const absentCount = rows.filter(r => r.status === 'ABSENT').length;
        const excusedCount = rows.filter(r => r.status === 'EXCUSED').length;
        const totalCount = rows.length;
        const attendanceRate = totalCount > 0 ? Math.round(((presentCount + lateCount) / totalCount) * 100) : 0;

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('Pop-up blocked. Please allow pop-ups to print your attendance report.');
            return;
        }

        const rowsHtml = rows.map(r => `
            <tr>
                <td style="text-align: center;">${r.no}</td>
                <td><strong>${r.date}</strong></td>
                <td style="text-align: center;"><span class="badge-status status-${r.status.toLowerCase()}">${r.status}</span></td>
                <td style="text-align: center;">${r.time || '—'}</td>
                <td>${r.remarks}</td>
            </tr>
        `).join('');

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Attendance History - ${studentFullName} (${meta.fullScope})</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
                <style>
                    @page { size: portrait; margin: 1.2cm; }
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; padding: 1rem; }
                    .header-box { border-bottom: 2px solid #0a5c2c; padding-bottom: 0.75rem; margin-bottom: 1rem; }
                    .badge-status { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; font-weight: bold; }
                    .status-present { background-color: #d1e7dd; color: #0f5132; }
                    .status-late { background-color: #fff3cd; color: #664d03; }
                    .status-excused { background-color: #cff4fc; color: #055160; }
                    .status-absent { background-color: #f8d7da; color: #842029; }
                    .kpi-pill { display: inline-block; padding: 3px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; margin-right: 4px; }
                    @media print { .no-print { display: none !important; } }
                </style>
            </head>
            <body>
                <div class="no-print d-flex justify-content-between align-items-center mb-3">
                    <span class="text-muted small">Student Attendance History Report (${meta.fullScope})</span>
                    <button class="btn btn-sm btn-primary" onclick="window.print()">Print Document</button>
                </div>
                <div class="header-box d-flex justify-content-between align-items-center">
                    <div>
                        <h4 class="m-0 fw-bold" style="color: #0a5c2c;">TALISAY SENIOR HIGH SCHOOL</h4>
                        <div class="small fw-semibold text-secondary">Learner Attendance Log History — ${meta.fullScope}</div>
                        <div class="small text-muted mt-1">Learner: <strong>${studentFullName}</strong> | ID / LRN: <code>${studentIdNumber}</code> | Section: <strong>${studentSectionName || 'Medical Sciences'}</strong></div>
                    </div>
                    <div class="text-end">
                        <div class="small text-muted">Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                        <div class="small fw-semibold text-success mt-1">Attendance Rate: ${attendanceRate}%</div>
                    </div>
                </div>
                <div class="mb-3 d-flex flex-wrap gap-1">
                    <span class="kpi-pill bg-light border text-dark">Total: ${totalCount}</span>
                    <span class="kpi-pill status-present">Present: ${presentCount}</span>
                    <span class="kpi-pill status-late">Late: ${lateCount}</span>
                    <span class="kpi-pill status-absent">Absent: ${absentCount}</span>
                    <span class="kpi-pill status-excused">Excused: ${excusedCount}</span>
                </div>
                <table class="table table-bordered table-sm align-middle mt-2">
                    <thead style="background-color: #0a5c2c; color: white;">
                        <tr>
                            <th style="width: 8%; text-align: center;">#</th>
                            <th style="width: 25%;">Date</th>
                            <th style="width: 18%; text-align: center;">Status</th>
                            <th style="width: 20%; text-align: center;">Time Logged</th>
                            <th style="width: 29%;">Remarks / Verification</th>
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
    }

    function exportAttendanceExcel() {
        if (typeof XLSX === 'undefined') {
            alert('Excel library is loading. Please try again in a moment.');
            return;
        }
        const rows = getExportRows();
        if (!rows.length) {
            alert('No attendance records available to export.');
            return;
        }

        const presentCount = rows.filter(r => r.status === 'PRESENT').length;
        const lateCount = rows.filter(r => r.status === 'LATE').length;
        const absentCount = rows.filter(r => r.status === 'ABSENT').length;
        const excusedCount = rows.filter(r => r.status === 'EXCUSED').length;
        const totalCount = rows.length;
        const attendanceRate = totalCount > 0 ? Math.round(((presentCount + lateCount) / totalCount) * 100) : 0;

        const ws = {};
        const merges = [];
        const rowHeights = [];

        function setCell(r, c, val, style = {}, type = 's') {
            const colLetter = String.fromCharCode(65 + c);
            const cellKey = colLetter + (r + 1);
            ws[cellKey] = { v: val, t: type, s: style };
        }

        const thinBorder = { style: 'thin', color: { rgb: 'D0D7DE' } };
        const cellBorder = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

        // ROW 0: School Header Banner
        rowHeights.push({ hpt: 28 });
        merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } });
        for (let c = 0; c <= 4; c++) {
            setCell(0, c, c === 0 ? "TALISAY SENIOR HIGH SCHOOL" : "", {
                font: { name: "Segoe UI", sz: 14, bold: true, color: { rgb: "FFFFFF" } },
                fill: { fgColor: { rgb: "0A5C2C" } },
                alignment: { horizontal: "center", vertical: "center" }
            });
        }

        // ROW 1: System Title Ribbon
        rowHeights.push({ hpt: 20 });
        merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 4 } });
        for (let c = 0; c <= 4; c++) {
            setCell(1, c, c === 0 ? "MENTORAE — OFFICIAL STUDENT ATTENDANCE LOG REPORT" : "", {
                font: { name: "Segoe UI", sz: 10, bold: true, color: { rgb: "E6F4EA" } },
                fill: { fgColor: { rgb: "074520" } },
                alignment: { horizontal: "center", vertical: "center" }
            });
        }

        // ROW 2: Learner Information Bar
        rowHeights.push({ hpt: 22 });
        merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 2 } });
        merges.push({ s: { r: 2, c: 3 }, e: { r: 2, c: 4 } });
        for (let c = 0; c <= 2; c++) {
            setCell(2, c, c === 0 ? `Learner: ${studentFullName}` : "", {
                font: { name: "Segoe UI", sz: 11, bold: true, color: { rgb: "0A5C2C" } },
                fill: { fgColor: { rgb: "E8F5E9" } },
                alignment: { horizontal: "left", vertical: "center" },
                border: { bottom: { style: "thin", color: { rgb: "0A5C2C" } } }
            });
        }
        for (let c = 3; c <= 4; c++) {
            setCell(2, c, c === 3 ? `Student ID / LRN: ${studentIdNumber}` : "", {
                font: { name: "Segoe UI", sz: 10, bold: true, color: { rgb: "1E293B" } },
                fill: { fgColor: { rgb: "E8F5E9" } },
                alignment: { horizontal: "right", vertical: "center" },
                border: { bottom: { style: "thin", color: { rgb: "0A5C2C" } } }
            });
        }

        // ROW 3: Secondary Metadata
        rowHeights.push({ hpt: 19 });
        merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: 1 } });
        merges.push({ s: { r: 3, c: 2 }, e: { r: 3, c: 3 } });
        for (let c = 0; c <= 1; c++) {
            setCell(3, c, c === 0 ? `Section: ${studentSectionName || 'Medical Sciences'}` : "", {
                font: { name: "Segoe UI", sz: 9, bold: true, color: { rgb: "4A5568" } },
                fill: { fgColor: { rgb: "F8F9FA" } },
                alignment: { horizontal: "left", vertical: "center" }
            });
        }
        for (let c = 2; c <= 3; c++) {
            setCell(3, c, c === 2 ? `Exported: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : "", {
                font: { name: "Segoe UI", sz: 9, color: { rgb: "4A5568" } },
                fill: { fgColor: { rgb: "F8F9FA" } },
                alignment: { horizontal: "center", vertical: "center" }
            });
        }
        setCell(3, 4, `Rate: ${attendanceRate}%`, {
            font: { name: "Segoe UI", sz: 9, bold: true, color: { rgb: attendanceRate >= 85 ? "166534" : "991B1B" } },
            fill: { fgColor: { rgb: "F8F9FA" } },
            alignment: { horizontal: "right", vertical: "center" }
        });

        // ROW 4: KPI Summary Cards
        rowHeights.push({ hpt: 22 });
        const kpiPresent = { font: { name: "Segoe UI", sz: 9, bold: true, color: { rgb: "166534" } }, fill: { fgColor: { rgb: "DCFCE7" } }, alignment: { horizontal: "center", vertical: "center" }, border: cellBorder };
        const kpiLate = { font: { name: "Segoe UI", sz: 9, bold: true, color: { rgb: "92400E" } }, fill: { fgColor: { rgb: "FEF3C7" } }, alignment: { horizontal: "center", vertical: "center" }, border: cellBorder };
        const kpiAbsent = { font: { name: "Segoe UI", sz: 9, bold: true, color: { rgb: "991B1B" } }, fill: { fgColor: { rgb: "FEE2E2" } }, alignment: { horizontal: "center", vertical: "center" }, border: cellBorder };
        const kpiExcused = { font: { name: "Segoe UI", sz: 9, bold: true, color: { rgb: "1E40AF" } }, fill: { fgColor: { rgb: "DBEAFE" } }, alignment: { horizontal: "center", vertical: "center" }, border: cellBorder };
        const kpiTotal = { font: { name: "Segoe UI", sz: 9, bold: true, color: { rgb: "1F2937" } }, fill: { fgColor: { rgb: "F1F5F9" } }, alignment: { horizontal: "center", vertical: "center" }, border: cellBorder };

        setCell(4, 0, `Total: ${totalCount}`, kpiTotal);
        setCell(4, 1, `Present: ${presentCount}`, kpiPresent);
        setCell(4, 2, `Late: ${lateCount}`, kpiLate);
        setCell(4, 3, `Absent: ${absentCount}`, kpiAbsent);
        setCell(4, 4, `Excused: ${excusedCount}`, kpiExcused);

        // ROW 5: Spacing Row
        rowHeights.push({ hpt: 8 });
        for (let c = 0; c <= 4; c++) setCell(5, c, "", {});

        // ROW 6: Table Headers
        rowHeights.push({ hpt: 26 });
        const headers = ["No.", "Date", "Status", "Time In / Out", "Remarks / Source"];
        const headerStyle = {
            font: { name: "Segoe UI", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "0A5C2C" } },
            alignment: { horizontal: "center", vertical: "center" },
            border: {
                top: { style: "medium", color: { rgb: "063E1D" } },
                bottom: { style: "medium", color: { rgb: "063E1D" } },
                left: { style: "thin", color: { rgb: "074724" } },
                right: { style: "thin", color: { rgb: "074724" } }
            }
        };
        headers.forEach((h, c) => setCell(6, c, h, headerStyle));

        // ROW 7+: Data Rows
        let curRow = 7;
        rows.forEach((r, idx) => {
            rowHeights.push({ hpt: 21 });
            const isEven = idx % 2 === 0;
            const rowBg = isEven ? "FFFFFF" : "F9FAF9";

            let statusFill = "DCFCE7";
            let statusColor = "166534";
            const st = (r.status || '').toUpperCase();
            if (st === 'LATE') {
                statusFill = "FEF3C7";
                statusColor = "92400E";
            } else if (st === 'ABSENT') {
                statusFill = "FEE2E2";
                statusColor = "991B1B";
            } else if (st === 'EXCUSED') {
                statusFill = "DBEAFE";
                statusColor = "1E40AF";
            }

            setCell(curRow, 0, r.no, { font: { name: "Segoe UI", sz: 9 }, fill: { fgColor: { rgb: rowBg } }, alignment: { horizontal: "center", vertical: "center" }, border: cellBorder }, 'n');
            setCell(curRow, 1, r.date, { font: { name: "Segoe UI", sz: 9 }, fill: { fgColor: { rgb: rowBg } }, alignment: { horizontal: "center", vertical: "center" }, border: cellBorder });
            setCell(curRow, 2, r.status, { font: { name: "Segoe UI", sz: 9, bold: true, color: { rgb: statusColor } }, fill: { fgColor: { rgb: statusFill } }, alignment: { horizontal: "center", vertical: "center" }, border: cellBorder });
            setCell(curRow, 3, r.time || '—', { font: { name: "Segoe UI", sz: 9 }, fill: { fgColor: { rgb: rowBg } }, alignment: { horizontal: "center", vertical: "center" }, border: cellBorder });
            setCell(curRow, 4, r.remarks || 'Regular scan', { font: { name: "Segoe UI", sz: 9 }, fill: { fgColor: { rgb: rowBg } }, alignment: { horizontal: "left", vertical: "center" }, border: cellBorder });

            curRow++;
        });

        ws['!ref'] = `A1:E${curRow}`;
        ws['!merges'] = merges;
        ws['!rows'] = rowHeights;
        ws['!cols'] = [
            { wch: 8 },   // No.
            { wch: 22 },  // Date
            { wch: 16 },  // Status
            { wch: 18 },  // Time In / Out
            { wch: 34 }   // Remarks / Source
        ];

        const meta = getFilterMetadata();

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `Attendance ${meta.tag.slice(0, 20)}`);

        const safeName = studentFullName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `Attendance_History_${safeName}_${meta.tag}_${studentIdNumber}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, filename);
    }

    function exportAttendanceCsv() {
        const rows = getExportRows();
        if (!rows.length) {
            alert('No attendance records available to export for the selected filter.');
            return;
        }
        const meta = getFilterMetadata();

        const safeName = studentFullName.replace(/[^a-zA-Z0-9_-]/g, '_');
        let csv = `TALISAY SENIOR HIGH SCHOOL - ATTENDANCE LOG REPORT (${meta.fullScope})\n`;
        csv += `Learner: "${studentFullName}",Student ID / LRN: "${studentIdNumber}",Section: "${studentSectionName || 'Medical Sciences'}",Academic Period: "${meta.fullScope}",Export Date: "${new Date().toLocaleDateString()}"\n\n`;
        csv += "No,Date,Status,Time In/Out,Remarks\n";
        rows.forEach(r => {
            csv += `${r.no},"${r.date}","${r.status}","${r.time || '—'}","${(r.remarks || 'Regular scan').replace(/"/g, '""')}"\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Attendance_History_${safeName}_${meta.tag}_${studentIdNumber}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    if (btnExportLogs) btnExportLogs.addEventListener('click', printAttendanceReport);
    if (btnDownloadAttendanceExcel) btnDownloadAttendanceExcel.addEventListener('click', exportAttendanceExcel);
    if (btnDownloadAttendanceCsv) btnDownloadAttendanceCsv.addEventListener('click', exportAttendanceCsv);

    loadSummary();
    loadHistory();
});
