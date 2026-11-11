document.addEventListener('DOMContentLoaded', async () => {
    // 1. Session Guard & Role Verification
    const { token, user } = requireSession('../login.html');
    if (user && user.role !== 'parent' && user.role !== 'admin') {
        window.location.href = '../login.html';
        return;
    }

    // 2. Live Real-Time Clock Sync
    const liveDateElement = document.getElementById('liveDate');
    const liveTimeElement = document.getElementById('liveTime');

    function updateDateTime() {
        const now = new Date();
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        if (liveDateElement) liveDateElement.textContent = now.toLocaleDateString('en-US', dateOptions);

        if (liveTimeElement) {
            liveTimeElement.textContent = now.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
        }
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    // 3. Resolve Target Student from URL Search Params or First Linked Child
    const params = new URLSearchParams(window.location.search);
    const targetStudentId = params.get('studentId');

    let activeChild = null;

    // DOM Elements
    const studentHeaderName = document.getElementById('studentHeaderName');
    const studentHeaderStatus = document.getElementById('studentHeaderStatus');
    const studentHeaderMeta = document.getElementById('studentHeaderMeta');
    const excuseStudentName = document.getElementById('excuseStudentName');
    const linkProgressNav = document.getElementById('linkProgressNav');

    const metricTotalDays = document.getElementById('metricTotalDays');
    const metricPresentDays = document.getElementById('metricPresentDays');
    const metricAttendanceRate = document.getElementById('metricAttendanceRate');
    const attendanceSummaryNote = document.getElementById('attendanceSummaryNote');

    const absenceAlertBanner = document.getElementById('absenceAlertBanner');
    const absenceAlertText = document.getElementById('absenceAlertText');
    const attendanceTableBody = document.getElementById('attendanceTableBody');
    const filterStatusSelect = document.getElementById('filterStatusSelect');
    const btnExportLogs = document.getElementById('btnExportLogs');
    const excuseForm = document.getElementById('excuseForm');

    function formatTime(timeStr) {
        if (!timeStr) return '—';
        const parts = timeStr.split(':');
        if (parts.length < 2) return timeStr;
        let hours = parseInt(parts[0], 10);
        const minutes = parts[1];
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${hours}:${minutes} ${ampm}`;
    }

    // 4. Fetch Linked Children
    try {
        const childrenRes = await authedFetch('/api/parent/children', token);
        if (!childrenRes || !childrenRes.success || !Array.isArray(childrenRes.children) || childrenRes.children.length === 0) {
            if (studentHeaderName) studentHeaderName.textContent = 'No Linked Student';
            if (studentHeaderMeta) studentHeaderMeta.textContent = 'No enrolled student accounts are linked to your profile.';
            if (attendanceTableBody) {
                attendanceTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">No student found.</td></tr>';
            }
            return;
        }

        // Match studentId if provided, otherwise default to first child
        if (targetStudentId) {
            activeChild = childrenRes.children.find(c => String(c.id) === String(targetStudentId));
            if (!activeChild) {
                alert('Access denied. That student is not linked to your account.');
                window.location.replace('attendance_parent.html');
                return;
            }
        } else {
            activeChild = childrenRes.children[0];
        }

        // Render Student Identity Header
        if (studentHeaderName) studentHeaderName.textContent = activeChild.name || 'Student';
        const idText = activeChild.idNumber ? ` | ID: ${activeChild.idNumber}` : '';
        if (studentHeaderMeta) studentHeaderMeta.textContent = `${activeChild.section || 'Senior High School'}${idText}`;
        if (excuseStudentName) excuseStudentName.value = activeChild.name || 'Student';
        if (linkProgressNav) linkProgressNav.href = `progress_parent.html?studentId=${activeChild.id}`;

        // Status Badge
        const lastStatus = (activeChild.lastStatus || '').toLowerCase();
        if (studentHeaderStatus) {
            if (lastStatus === 'present') {
                studentHeaderStatus.className = 'badge badge-status-present fw-bold micro-text px-2.5 py-1 rounded-pill';
                studentHeaderStatus.textContent = 'Present Today';
            } else if (lastStatus === 'late') {
                studentHeaderStatus.className = 'badge badge-status-late fw-bold micro-text px-2.5 py-1 rounded-pill';
                studentHeaderStatus.textContent = 'Late Today';
            } else if (lastStatus === 'absent') {
                studentHeaderStatus.className = 'badge badge-status-absent fw-bold micro-text px-2.5 py-1 rounded-pill';
                studentHeaderStatus.textContent = 'Absent Today';
            } else {
                studentHeaderStatus.className = 'badge badge-status-empty fw-bold micro-text px-2.5 py-1 rounded-pill';
                studentHeaderStatus.textContent = 'No record yet';
            }
        }

        // Absence Alert Banner
        if (absenceAlertBanner) {
            if (lastStatus === 'absent') {
                absenceAlertBanner.classList.remove('d-none');
                if (absenceAlertText) {
                    absenceAlertText.innerHTML = `${activeChild.name} was marked <strong>Absent</strong> during today's attendance check-in.`;
                }
            } else {
                absenceAlertBanner.classList.add('d-none');
            }
        }

        // 5. Fetch Attendance Summary for Active Student
        try {
            const summaryRes = await authedFetch(`/api/attendance/summary?studentId=${activeChild.id}`, token);
            if (summaryRes && summaryRes.success) {
                if (metricTotalDays) metricTotalDays.textContent = summaryRes.totalDays ?? 0;
                if (metricPresentDays) metricPresentDays.textContent = summaryRes.presentDays ?? 0;
                const rateVal = summaryRes.rate !== undefined && summaryRes.rate !== null ? `${summaryRes.rate}%` : '—';
                if (metricAttendanceRate) metricAttendanceRate.textContent = rateVal;
                if (attendanceSummaryNote) {
                    attendanceSummaryNote.textContent = `${activeChild.name} maintains a ${rateVal} overall attendance compliance for the current academic term.`;
                }
            }
        } catch (e) {
            console.error('Error loading attendance summary:', e);
        }

        // 6. Fetch Attendance History Logs for Active Student
        try {
            const historyRes = await authedFetch(`/api/attendance/history?studentId=${activeChild.id}&limit=100`, token);
            if (attendanceTableBody) {
                if (historyRes && historyRes.success && Array.isArray(historyRes.history) && historyRes.history.length > 0) {
                    attendanceTableBody.innerHTML = '';
                    historyRes.history.forEach(log => {
                        if (!log.scan_date) return;
                        const checkDate = new Date(log.scan_date + 'T00:00:00');
                        if (checkDate.getDay() === 0 || checkDate.getDay() === 6) return; // Skip weekends

                        const tr = document.createElement('tr');
                        const statusLower = (log.status || '').toLowerCase();
                        tr.setAttribute('data-status', statusLower);

                        // Format date
                        let dateStr = log.scan_date || '';
                        try {
                            const d = new Date(log.scan_date + 'T00:00:00');
                            dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                        } catch (err) {}

                        // Status badge class
                        let badgeClass = 'badge-status-empty';
                        let statusText = log.status || 'Recorded';
                        let remarksText = 'Classroom check-in';

                        if (statusLower === 'present') {
                            badgeClass = 'badge-status-present';
                            statusText = 'Present';
                            remarksText = 'On Time via Attendance Scanner';
                        } else if (statusLower === 'late') {
                            badgeClass = 'badge-status-late';
                            statusText = 'Late';
                            remarksText = 'Late Check-in';
                        } else if (statusLower === 'absent') {
                            badgeClass = 'badge-status-absent';
                            statusText = 'Absent';
                            remarksText = 'Unexcused Absence';
                        } else if (statusLower === 'excused') {
                            badgeClass = 'badge-status-empty';
                            statusText = 'Excused';
                            remarksText = 'Excused by School Adviser';
                        }

                        const timeInStr = formatTime(log.scan_time);

                        tr.innerHTML = `
                            <td class="px-3 py-2.5 fw-medium text-dark">${dateStr}</td>
                            <td class="px-3 py-2.5"><span class="badge attendance-pill ${badgeClass}">${statusText}</span></td>
                            <td class="px-3 py-2.5 text-secondary">${timeInStr}</td>
                            <td class="px-3 py-2.5 text-muted micro-text">${remarksText}</td>
                        `;
                        attendanceTableBody.appendChild(tr);
                    });
                } else {
                    attendanceTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">No attendance records found for this student yet.</td></tr>';
                }
            }
        } catch (e) {
            console.error('Error loading attendance history:', e);
            if (attendanceTableBody) {
                attendanceTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-danger">Could not load attendance records.</td></tr>';
            }
        }

    } catch (err) {
        console.error('Error loading student context:', err);
    }

    // 7. Attendance Status Filter Logic
    if (filterStatusSelect && attendanceTableBody) {
        filterStatusSelect.addEventListener('change', (e) => {
            const selectedStatus = e.target.value;
            const rows = attendanceTableBody.querySelectorAll('tr[data-status]');

            rows.forEach(row => {
                const rowStatus = row.getAttribute('data-status');
                if (selectedStatus === 'all' || rowStatus === selectedStatus) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }

    // 8. Export / Print Attendance Logs (Print, .xlsx, .csv)
    const btnDownloadAttendanceExcel = document.getElementById('btnDownloadAttendanceExcel');
    const btnDownloadAttendanceCsv = document.getElementById('btnDownloadAttendanceCsv');

    function getParentAttendanceData() {
        const rows = attendanceTableBody ? Array.from(attendanceTableBody.querySelectorAll('tr[data-status]')) : [];
        return rows.map((tr, idx) => {
            const cells = tr.querySelectorAll('td');
            return {
                no: idx + 1,
                date: cells[0] ? cells[0].textContent.trim() : '',
                status: cells[1] ? cells[1].textContent.trim().toUpperCase() : '',
                time: cells[2] ? cells[2].textContent.trim() : '',
                remarks: cells[3] ? cells[3].textContent.trim() : ''
            };
        });
    }

    if (btnExportLogs) {
        btnExportLogs.addEventListener('click', () => {
            const logs = getParentAttendanceData();
            if (!logs.length) {
                alert('No attendance records available to export.');
                return;
            }

            const studentName = activeChild ? activeChild.name : 'Student';
            const studentId = activeChild ? (activeChild.idNumber || 'N/A') : 'N/A';
            const studentSec = activeChild ? (activeChild.section || 'Senior High School') : 'Senior High School';

            const presentCount = logs.filter(r => r.status === 'PRESENT').length;
            const lateCount = logs.filter(r => r.status === 'LATE').length;
            const absentCount = logs.filter(r => r.status === 'ABSENT').length;
            const excusedCount = logs.filter(r => r.status === 'EXCUSED').length;
            const totalCount = logs.length;
            const attendanceRate = totalCount > 0 ? Math.round(((presentCount + lateCount) / totalCount) * 100) : 0;

            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                window.print();
                return;
            }

            const rowsHtml = logs.map(r => `
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
                        <title>Attendance Records - ${studentName}</title>
                        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
                        <style>
                            @page { size: portrait; margin: 1.2cm; }
                            body { padding: 1.5rem; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; }
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
                            <span class="text-muted small">Parent Portal - Official Child Attendance Report</span>
                            <button class="btn btn-sm btn-primary" onclick="window.print()">Print Document</button>
                        </div>
                        <div class="header-box d-flex justify-content-between align-items-center">
                            <div>
                                <h4 style="color: #0a5c2c; font-weight: bold; margin: 0;">TALISAY SENIOR HIGH SCHOOL</h4>
                                <div class="small fw-semibold text-secondary">Learner Individual Attendance Log History (Parent & Guardian Copy)</div>
                                <div class="small text-muted mt-1">Learner: <strong>${studentName}</strong> | Class: <strong>${studentSec}</strong> | ID / LRN: <code>${studentId}</code></div>
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
        });
    }

    if (btnDownloadAttendanceExcel) {
        btnDownloadAttendanceExcel.addEventListener('click', () => {
            if (typeof XLSX === 'undefined') {
                alert('Excel library is loading. Please try again in a moment.');
                return;
            }
            const logs = getParentAttendanceData();
            if (!logs.length) {
                alert('No attendance records available to export.');
                return;
            }

            const studentName = activeChild ? activeChild.name : 'Student';
            const studentId = activeChild ? (activeChild.idNumber || 'N/A') : 'N/A';
            const studentSec = activeChild ? (activeChild.section || 'Senior High School') : 'Senior High School';

            const presentCount = logs.filter(r => r.status === 'PRESENT').length;
            const lateCount = logs.filter(r => r.status === 'LATE').length;
            const absentCount = logs.filter(r => r.status === 'ABSENT').length;
            const excusedCount = logs.filter(r => r.status === 'EXCUSED').length;
            const totalCount = logs.length;
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
                setCell(1, c, c === 0 ? "MENTORAE — ATTENDANCE LOG REPORT (PARENT & GUARDIAN COPY)" : "", {
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
                setCell(2, c, c === 0 ? `Learner: ${studentName}` : "", {
                    font: { name: "Segoe UI", sz: 11, bold: true, color: { rgb: "0A5C2C" } },
                    fill: { fgColor: { rgb: "E8F5E9" } },
                    alignment: { horizontal: "left", vertical: "center" },
                    border: { bottom: { style: "thin", color: { rgb: "0A5C2C" } } }
                });
            }
            for (let c = 3; c <= 4; c++) {
                setCell(2, c, c === 3 ? `Student ID / LRN: ${studentId}` : "", {
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
                setCell(3, c, c === 0 ? `Class Section: ${studentSec}` : "", {
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
            logs.forEach((r, idx) => {
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

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Attendance History");

            const safeName = studentName.replace(/[^a-zA-Z0-9_-]/g, '_');
            const filename = `Attendance_ParentCopy_${safeName}_${studentId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(wb, filename);
        });
    }

    if (btnDownloadAttendanceCsv) {
        btnDownloadAttendanceCsv.addEventListener('click', () => {
            const logs = getParentAttendanceData();
            if (!logs.length) {
                alert('No attendance records available to export.');
                return;
            }
            const studentName = activeChild ? activeChild.name : 'Student';
            const studentId = activeChild ? (activeChild.idNumber || 'student') : 'student';
            const studentSec = activeChild ? (activeChild.section || 'Senior High School') : 'Senior High School';
            const safeName = studentName.replace(/[^a-zA-Z0-9_-]/g, '_');

            let csv = "TALISAY SENIOR HIGH SCHOOL - ATTENDANCE LOG REPORT (PARENT COPY)\n";
            csv += `Learner: "${studentName}",Student ID / LRN: "${studentId}",Section: "${studentSec}",Export Date: "${new Date().toLocaleDateString()}"\n\n`;
            csv += "No,Date,Status,Time In/Out,Remarks\n";
            logs.forEach(r => {
                csv += `${r.no},"${r.date}","${r.status}","${r.time || '—'}","${(r.remarks || 'Regular scan').replace(/"/g, '""')}"\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Attendance_ParentCopy_${safeName}_${studentId}_${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    // 9. Filed Excuse Notes Loader & Submission Handler
    async function loadFiledExcuseNotes() {
        const container = document.getElementById('filedExcuseNotesContainer');
        if (!container || !activeChild) return;
        try {
            const data = await authedFetch(`/api/attendance/excuse-notes?studentId=${activeChild.id}`, token);
            const validNotes = (data && data.success && Array.isArray(data.notes))
                ? data.notes.filter(n => {
                    if (!n.absence_date) return false;
                    const d = new Date(String(n.absence_date).slice(0, 10) + 'T00:00:00');
                    return d.getDay() !== 0 && d.getDay() !== 6;
                })
                : [];
            if (validNotes.length > 0) {
                container.innerHTML = `
                    <div class="table-responsive">
                        <table class="table table-sm table-hover align-middle mb-0">
                            <thead>
                                <tr class="text-muted small">
                                    <th>Absence Date</th>
                                    <th>Primary Reason</th>
                                    <th>Remarks</th>
                                    <th>Proof File</th>
                                    <th>Status</th>
                                    <th>Filed On</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${validNotes.map((n) => {
                                    let badgeColor = 'bg-warning text-dark';
                                    if (n.status === 'approved') badgeColor = 'bg-success text-white';
                                    else if (n.status === 'rejected') badgeColor = 'bg-danger text-white';

                                    let dateStr = n.absence_date ? String(n.absence_date).slice(0, 10) : '—';
                                    let filedStr = n.created_at ? new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

                                    let proofHtml = '<span class="text-muted small">None</span>';
                                    if (n.has_proof || n.proof_file_name) {
                                        const isImg = (n.proof_file_type || '').startsWith('image/');
                                        const isPdf = (n.proof_file_type || '').includes('pdf');
                                        const icon = isImg ? 'bi-image' : (isPdf ? 'bi-file-earmark-pdf text-danger' : 'bi-file-earmark-word text-primary');
                                        proofHtml = `
                                            <a href="${API_BASE}/api/attendance/excuse-notes/${n.id}/proof?token=${token}" target="_blank" class="btn btn-xs btn-outline-success rounded-pill px-2.5 py-0.5 text-nowrap d-inline-flex align-items-center gap-1" style="font-size:0.75rem;" title="${n.proof_file_name || 'Proof Document'}">
                                                <i class="bi ${icon}"></i> View Proof
                                            </a>
                                        `;
                                    }

                                    return `
                                        <tr>
                                            <td class="fw-semibold text-dark">${dateStr}</td>
                                            <td>${n.reason}</td>
                                            <td class="small text-secondary">${n.remarks || '—'}</td>
                                            <td>${proofHtml}</td>
                                            <td><span class="badge ${badgeColor} rounded-pill px-2.5 py-1 text-uppercase" style="font-size:0.7rem;">${n.status}</span></td>
                                            <td class="small text-muted">${filedStr}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            } else {
                container.innerHTML = '<p class="text-muted small m-0">No excuse notes filed yet for this student.</p>';
            }
        } catch (err) {
            console.warn('Could not load filed excuse notes:', err);
            container.innerHTML = '<p class="text-muted small m-0">No excuse notes filed yet for this student.</p>';
        }
    }

    if (activeChild) {
        loadFiledExcuseNotes();
    }

    let isSubmittingExcuse = false;
    const excuseModalEl = document.getElementById('excuseModal');
    if (excuseModalEl) {
        excuseModalEl.addEventListener('hide.bs.modal', (event) => {
            if (isSubmittingExcuse) return;
            const remarks = (document.getElementById('excuseRemarks')?.value || '').trim();
            const fileInput = document.getElementById('excuseFile');
            const hasFile = !!(fileInput && fileInput.files && fileInput.files.length > 0);

            if (remarks !== '' || hasFile) {
                const confirmDiscard = confirm('You have unsaved details on this excuse note. Are you sure you want to discard them and close?');
                if (!confirmDiscard) {
                    event.preventDefault();
                }
            }
        });

        excuseModalEl.addEventListener('hidden.bs.modal', () => {
            isSubmittingExcuse = false;
        });
    }

    if (excuseForm) {
        excuseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isSubmittingExcuse) return;

            const reason = document.getElementById('excuseReason').value;
            const date = document.getElementById('excuseDate').value;
            const remarks = document.getElementById('excuseRemarks').value;
            const fileInput = document.getElementById('excuseFile');
            const file = fileInput?.files?.[0];

            if (date) {
                const d = new Date(date + 'T00:00:00');
                if (d.getDay() === 0 || d.getDay() === 6) {
                    alert('Excuse notes cannot be submitted for weekend dates (Saturday or Sunday). Please select a school day (Monday to Friday).');
                    return;
                }
            }

            if (file) {
                const allowedExts = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp'];
                const ext = (file.name || '').toLowerCase().slice((file.name || '').lastIndexOf('.'));
                if (!allowedExts.includes(ext)) {
                    alert('Invalid file format. Please upload a PDF, Word document (.doc/.docx), or photo/image (.jpg/.png/.webp).\n\nPowerPoint (PPT) and other large presentation/media files are not allowed.');
                    if (fileInput) fileInput.value = '';
                    return;
                }
                if (file.size > 5 * 1024 * 1024) {
                    alert('File size exceeds the 5MB limit. Please attach a smaller document or photo to conserve storage.');
                    if (fileInput) fileInput.value = '';
                    return;
                }
            }

            if (!activeChild || !activeChild.id) {
                alert('Please select a student first.');
                return;
            }

            const submitBtn = excuseForm.querySelector('button[type="submit"]');
            if (submitBtn && submitBtn.disabled) return;

            isSubmittingExcuse = true;
            const origBtnHtml = submitBtn ? submitBtn.innerHTML : 'Submit Note';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Submitting...';
            }

            try {
                const formData = new FormData();
                formData.append('studentId', activeChild.id);
                formData.append('absenceDate', date);
                formData.append('reason', reason);
                formData.append('remarks', remarks);
                if (file) {
                    formData.append('proofFile', file);
                }

                const res = await authedFetch('/api/attendance/excuse-note', token, {
                    method: 'POST',
                    body: formData,
                });

                const modalEl = document.getElementById('excuseModal');
                const modalInstance = modalEl ? bootstrap.Modal.getInstance(modalEl) : null;
                if (modalInstance) {
                    modalInstance.hide();
                }

                if (res && res.success) {
                    alert(`✅ Your excuse note for ${activeChild.name} on ${date} (${reason}) has been submitted successfully to the school adviser.`);
                    excuseForm.reset();
                    loadFiledExcuseNotes();
                } else {
                    alert(res?.message || 'Failed to submit excuse note.');
                }
            } catch (err) {
                console.error('Submit excuse note error:', err);
                alert('Could not submit excuse note. Please check connection and try again.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = origBtnHtml;
                }
                isSubmittingExcuse = false;
            }
        });

        const excuseDateInput = document.getElementById('excuseDate');
        if (excuseDateInput) {
            excuseDateInput.addEventListener('change', () => {
                if (!excuseDateInput.value) return;
                const d = new Date(excuseDateInput.value + 'T00:00:00');
                if (d.getDay() === 0 || d.getDay() === 6) {
                    alert('Excuse notes cannot be submitted for weekend dates (Saturday or Sunday). Please select a school day (Monday to Friday).');
                    excuseDateInput.value = '';
                }
            });
        }
    }
});
