document.addEventListener('DOMContentLoaded', async () => {
    // 0. Session Guard & Logout
    const { token, user } = requireSession('../login.html', ['parent', 'admin']);
    wireLogout('logoutBtn', '../login.html');

    // 1. Live Real-time Clock Sync
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

    // 2. Attendance Status Filter
    const filterStatusSelect = document.getElementById('filterStatusSelect');
    const attendanceTableBody = document.getElementById('attendanceTableBody');

    if (filterStatusSelect && attendanceTableBody) {
        filterStatusSelect.addEventListener('change', (e) => {
            const selectedStatus = e.target.value;
            const rows = attendanceTableBody.querySelectorAll('tr');

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

    // 3. Export / Print Attendance Logs Logic
    const btnExportLogs = document.getElementById('btnExportLogs');
    if (btnExportLogs) {
        btnExportLogs.addEventListener('click', () => {
            const table = document.getElementById('attendanceLogTable');
            if (!table) {
                alert('Attendance table could not be found.');
                return;
            }

            const tableHtml = table.outerHTML;
            const pageTitle = 'Student Attendance Records - Dela Cruz, Juan C.';

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
                            <p style="margin: 0.25rem 0 0; color: #555;">Student: <strong>Dela Cruz, Juan C.</strong> | Grade 12 - STEM | LRN: 123456789012</p>
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

    // 4. Excuse Note Submission Handler
    const excuseForm = document.getElementById('excuseForm');
    if (excuseForm) {
        excuseForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const reason = document.getElementById('excuseReason').value;
            const date = document.getElementById('excuseDate').value;
            const remarks = document.getElementById('excuseRemarks').value;

            // Close modal using bootstrap modal instance
            const modalEl = document.getElementById('excuseModal');
            const modalInstance = bootstrap.Modal.getInstance(modalEl);
            if (modalInstance) {
                modalInstance.hide();
            }

            alert(`Your excuse note for ${date} (${reason}) has been successfully submitted to Mrs. A. Cruz (Class Adviser) for verification.`);
            excuseForm.reset();
        });
    }

});
