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
        }
        if (!activeChild) {
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

    // 8. Export / Print Attendance Logs
    if (btnExportLogs) {
        btnExportLogs.addEventListener('click', () => {
            const table = document.getElementById('attendanceLogTable');
            if (!table) {
                alert('Attendance table could not be found.');
                return;
            }

            const studentName = activeChild ? activeChild.name : 'Student';
            const studentMeta = activeChild ? `${activeChild.section} | ID: ${activeChild.idNumber || '—'}` : '';

            const tableHtml = table.outerHTML;
            const pageTitle = `Attendance Records - ${studentName}`;

            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                window.print();
                return;
            }

            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                    <head>
                        <title>Export - ${pageTitle}</title>
                        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
                        <link rel="stylesheet" href="attendance_parent.css">
                        <style>
                            body { padding: 2.5rem; font-family: sans-serif; }
                            .header-box { border-bottom: 2px solid #0a5c2c; padding-bottom: 1rem; margin-bottom: 1.5rem; }
                            @media print {
                                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                            }
                        </style>
                    </head>
                    <body>
                        <div class="header-box">
                            <h2 style="color: #0a5c2c; font-weight: bold; margin: 0;">Mentorae Portal - Attendance Report</h2>
                            <p style="margin: 0.25rem 0 0; color: #333;">Student: <strong>${studentName}</strong> | ${studentMeta}</p>
                            <p style="margin: 0; color: #777; font-size: 0.85rem;">Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
                        </div>
                        <h4 style="margin-bottom: 1rem;">Official Attendance History</h4>
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

    // 9. Filed Excuse Notes Loader & Submission Handler
    async function loadFiledExcuseNotes() {
        const container = document.getElementById('filedExcuseNotesContainer');
        if (!container || !activeChild) return;
        try {
            const data = await authedFetch(`/api/attendance/excuse-notes?studentId=${activeChild.id}`, token);
            if (data && data.success && Array.isArray(data.notes) && data.notes.length > 0) {
                container.innerHTML = `
                    <div class="table-responsive">
                        <table class="table table-sm table-hover align-middle mb-0">
                            <thead>
                                <tr class="text-muted small">
                                    <th>Absence Date</th>
                                    <th>Primary Reason</th>
                                    <th>Remarks</th>
                                    <th>Status</th>
                                    <th>Filed On</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.notes.map((n) => {
                                    let badgeColor = 'bg-warning text-dark';
                                    if (n.status === 'approved') badgeColor = 'bg-success text-white';
                                    else if (n.status === 'rejected') badgeColor = 'bg-danger text-white';

                                    let dateStr = n.absence_date ? String(n.absence_date).slice(0, 10) : '—';
                                    let filedStr = n.created_at ? new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

                                    return `
                                        <tr>
                                            <td class="fw-semibold text-dark">${dateStr}</td>
                                            <td>${n.reason}</td>
                                            <td class="small text-secondary">${n.remarks || '—'}</td>
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
            const reason = document.getElementById('excuseReason').value;
            const date = document.getElementById('excuseDate').value;
            const remarks = document.getElementById('excuseRemarks').value;

            if (!activeChild || !activeChild.id) {
                alert('Please select a student first.');
                return;
            }

            try {
                const res = await authedFetch('/api/attendance/excuse-note', token, {
                    method: 'POST',
                    body: JSON.stringify({
                        studentId: activeChild.id,
                        absenceDate: date,
                        reason,
                        remarks,
                    }),
                });

                const modalEl = document.getElementById('excuseModal');
                const modalInstance = modalEl ? bootstrap.Modal.getInstance(modalEl) : null;
                isSubmittingExcuse = true;
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
            }
        });
    }
});
