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
            const studentMeta = activeChild ? `${activeChild.section} | ID: ${activeChild.idNumber || '—'}` : '';

            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                window.print();
                return;
            }

            const rowsHtml = logs.map(r => `
                <tr>
                    <td style="text-align: center;">${r.no}</td>
                    <td><strong>${r.date}</strong></td>
                    <td style="text-align: center;">${r.status}</td>
                    <td style="text-align: center;">${r.time}</td>
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
                            body { padding: 2rem; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; }
                            .header-box { border-bottom: 2px solid #0a5c2c; padding-bottom: 0.75rem; margin-bottom: 1rem; }
                            @media print { .no-print { display: none !important; } }
                        </style>
                    </head>
                    <body>
                        <div class="no-print d-flex justify-content-between align-items-center mb-3">
                            <span class="text-muted small">Parent Portal - Attendance History</span>
                            <button class="btn btn-sm btn-primary" onclick="window.print()">Print Document</button>
                        </div>
                        <div class="header-box d-flex justify-content-between align-items-center">
                            <div>
                                <h4 style="color: #0a5c2c; font-weight: bold; margin: 0;">TALISAY SENIOR HIGH SCHOOL</h4>
                                <div class="small fw-semibold text-secondary">Learner Individual Attendance Log History (Parent View)</div>
                                <div class="small text-muted mt-1">Student: <strong>${studentName}</strong> (${studentMeta})</div>
                            </div>
                            <div class="text-end">
                                <div class="small text-muted">Generated: ${new Date().toLocaleDateString()}</div>
                                <div class="small fw-semibold text-success">Total Records: ${logs.length}</div>
                            </div>
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
            const studentSec = activeChild ? activeChild.section : '—';

            const data = [
                ["TALISAY SENIOR HIGH SCHOOL - ATTENDANCE LOG REPORT (PARENT COPY)"],
                ["Learner Name:", studentName, "Student ID / LRN:", studentId],
                ["Class Section:", studentSec, "Export Date:", new Date().toLocaleDateString()],
                [],
                ["No.", "Date", "Status", "Time In / Out", "Remarks / Source"]
            ];

            logs.forEach(r => {
                data.push([r.no, r.date, r.status, r.time, r.remarks]);
            });

            const ws = XLSX.utils.aoa_to_sheet(data);
            ws['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 30 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Attendance History");
            const filename = `Attendance_${studentId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
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
            const studentId = activeChild ? (activeChild.idNumber || 'student') : 'student';
            let csv = "No,Date,Status,Time Logged,Remarks\n";
            logs.forEach(r => {
                csv += `${r.no},"${r.date}","${r.status}","${r.time}","${r.remarks.replace(/"/g, '""')}"\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Attendance_${studentId}_${new Date().toISOString().slice(0, 10)}.csv`);
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
