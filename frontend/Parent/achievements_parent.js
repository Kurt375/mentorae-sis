document.addEventListener('DOMContentLoaded', async () => {
    const { token, user } = requireSession('../login.html', ['parent', 'admin']);

    function updateDateTime() {
        const liveDate = document.getElementById('liveDate');
        const liveTime = document.getElementById('liveTime');
        if (!liveDate || !liveTime) return;
        const now = new Date();
        liveDate.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        liveTime.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    const contextStudentName = document.getElementById('contextStudentName');
    const contextStudentMeta = document.getElementById('contextStudentMeta');
    const childSelectDropdown = document.getElementById('childSelectDropdown');
    const childrenSelectorContainer = document.getElementById('childrenSelectorContainer');
    const totalPointsDisplay = document.getElementById('totalPointsDisplay');
    const badgesEarnedDisplay = document.getElementById('badgesEarnedDisplay');
    const classRankDisplay = document.getElementById('classRankDisplay');
    const badgesContainer = document.getElementById('badgesContainer');
    const btnPrintBadgeReport = document.getElementById('btnPrintBadgeReport');
    const btnExportBadgeExcel = document.getElementById('btnExportBadgeExcel');

    let childrenList = [];
    let activeChild = null;
    let earnedBadges = [];

    const BADGE_DEFAULTS = {
        perfect_attendance: { title: 'Perfect Attendance', icon: '🎯', category: 'Attendance', bg: '#d5ebd5', color: '#1f6e1f' },
        honor_student: { title: 'Honor Student', icon: '🏆', category: 'Academics', bg: '#fef2cb', color: '#b27a00' },
        quiz_master: { title: 'Quiz Master', icon: '🧠', category: 'Academics', bg: '#deeaf6', color: '#2f5597' },
        early_bird: { title: 'Early Bird', icon: '🌅', category: 'Attendance', bg: '#fce4d6', color: '#c65911' },
        top_scorer: { title: 'Top Scorer', icon: '🅰️', category: 'Academics', bg: '#f5d6f5', color: '#7b1fa2' },
        most_improved: { title: 'Most Improved', icon: '📈', category: 'Academics', bg: '#e0f2fe', color: '#0369a1' },
        active_participant: { title: 'Active Participant', icon: '🙋', category: 'Participation', bg: '#fef3c7', color: '#b45309' },
        leadership_award: { title: 'Student Leader', icon: '🎖️', category: 'Leadership', bg: '#e0e7ff', color: '#4338ca' },
        team_player: { title: 'Team Player', icon: '🤝', category: 'Character', bg: '#ecfdf5', color: '#047857' },
        creative_thinker: { title: 'Creative Thinker', icon: '💡', category: 'Creativity', bg: '#fff1f2', color: '#be123c' },
    };

    try {
        const resChildren = await authedFetch('/api/parent/children', token);
        if (resChildren && resChildren.success && Array.isArray(resChildren.children) && resChildren.children.length > 0) {
            childrenList = resChildren.children;

            const urlParams = new URLSearchParams(window.location.search);
            const requestedChildId = urlParams.get('childId') || urlParams.get('studentId');
            activeChild = childrenList.find(c => String(c.id) === String(requestedChildId)) || childrenList[0];

            if (childrenList.length > 1 && childrenSelectorContainer && childSelectDropdown) {
                childrenSelectorContainer.classList.remove('d-none');
                childSelectDropdown.innerHTML = childrenList.map(c =>
                    `<option value="${c.id}" ${c.id === activeChild.id ? 'selected' : ''}>${c.name} (${c.section || 'General'})</option>`
                ).join('');
                childSelectDropdown.addEventListener('change', (e) => {
                    const selected = childrenList.find(c => String(c.id) === String(e.target.value));
                    if (selected) {
                        activeChild = selected;
                        loadBadgesForChild(activeChild.id);
                    }
                });
            }

            updateChildHeader();
            await loadBadgesForChild(activeChild.id);
        } else {
            if (contextStudentName) contextStudentName.textContent = 'No Linked Students';
            if (badgesContainer) {
                badgesContainer.innerHTML = '<div class="col-12 text-center py-4 text-muted">No student records linked to your parent account.</div>';
            }
        }
    } catch (e) {
        console.error('Error initializing achievements_parent:', e);
    }

    function updateChildHeader() {
        if (!activeChild) return;
        if (contextStudentName) contextStudentName.textContent = activeChild.name;
        if (contextStudentMeta) {
            contextStudentMeta.textContent = `${activeChild.sectionName || activeChild.section || 'Medical Sciences'} | LRN / ID: ${activeChild.idNumber || '—'}`;
        }
    }

    async function loadBadgesForChild(childId) {
        if (!childId) return;
        updateChildHeader();

        if (badgesContainer) {
            badgesContainer.innerHTML = `
                <div class="col-12 text-center py-4 text-muted">
                    <div class="spinner-border spinner-border-sm text-success me-2" role="status"></div>
                    Loading achievements...
                </div>
            `;
        }

        try {
            const [badgeRes, lbRes] = await Promise.all([
                authedFetch(`/api/badges/student/${childId}`, token),
                authedFetch('/api/badges/leaderboard?scope=section', token)
            ]);

            earnedBadges = [];
            if (badgeRes && badgeRes.success && Array.isArray(badgeRes.badges)) {
                earnedBadges = badgeRes.badges.map(b => {
                    const def = BADGE_DEFAULTS[b.badge_id] || {};
                    return {
                        id: b.badge_id,
                        title: b.name || def.title || b.badge_id,
                        points: Number(b.points) || 10,
                        icon: def.icon || '🏅',
                        category: def.category || 'General Honor',
                        earnedAt: b.earned_at,
                        description: b.description || 'Awarded for outstanding learner excellence and dedication.'
                    };
                });
            }

            const totalPts = earnedBadges.reduce((s, b) => s + b.points, 0);
            if (totalPointsDisplay) totalPointsDisplay.textContent = totalPts;
            if (badgesEarnedDisplay) badgesEarnedDisplay.textContent = earnedBadges.length;

            let rank = '—';
            if (lbRes && lbRes.success && Array.isArray(lbRes.leaderboard)) {
                const found = lbRes.leaderboard.find(r => String(r.studentId) === String(childId));
                if (found) rank = `#${found.rank}`;
            }
            if (classRankDisplay) classRankDisplay.textContent = rank;

            renderBadges();
        } catch (err) {
            console.error('Error loading badges for child:', err);
            if (badgesContainer) {
                badgesContainer.innerHTML = '<div class="col-12 text-center py-4 text-danger">Could not load achievements.</div>';
            }
        }
    }

    function renderBadges() {
        if (!badgesContainer) return;
        if (!earnedBadges.length) {
            badgesContainer.innerHTML = `
                <div class="col-12 text-center py-5 text-muted">
                    <i class="bi bi-award fs-1 d-block mb-2 text-secondary opacity-50"></i>
                    <h6 class="fw-bold text-dark">No Badges Unlocked Yet</h6>
                    <p class="micro-text text-muted mb-0">Positive recognition badges awarded by teachers will appear here.</p>
                </div>
            `;
            return;
        }

        badgesContainer.innerHTML = earnedBadges.map(b => `
            <div class="col-12 col-md-6 col-lg-4">
                <div class="badge-card h-100 d-flex flex-column justify-content-between shadow-2xs">
                    <div class="d-flex align-items-start gap-3 mb-2">
                        <div class="badge-icon-wrap bg-light border">
                            ${b.icon}
                        </div>
                        <div class="flex-grow-1">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="badge bg-light text-secondary border micro-text">${b.category}</span>
                                <span class="fw-bold text-success small">+${b.points} pts</span>
                            </div>
                            <h5 class="fw-bold m-0 fs-6 text-dark">${b.title}</h5>
                            <div class="micro-text text-muted mt-0.5">Unlocked ${b.earnedAt ? new Date(b.earnedAt).toLocaleDateString() : 'Active Term'}</div>
                        </div>
                    </div>
                    <p class="micro-text text-muted m-0 mt-2 border-top pt-2">${b.description}</p>
                </div>
            </div>
        `).join('');
    }

    // =========================================================================
    // Print & Excel Badges Reports
    // =========================================================================
    if (btnPrintBadgeReport) {
        btnPrintBadgeReport.addEventListener('click', () => {
            if (!earnedBadges.length) {
                alert('No badges available to print.');
                return;
            }

            const studentName = activeChild ? activeChild.name : 'Student';
            const studentId = activeChild ? (activeChild.idNumber || 'N/A') : 'N/A';
            const studentSec = activeChild ? activeChild.section : '—';
            const totalPts = earnedBadges.reduce((s, b) => s + b.points, 0);

            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                alert('Pop-up blocked. Please allow pop-ups to print the achievements report.');
                return;
            }

            const rowsHtml = earnedBadges.map((b, idx) => `
                <tr>
                    <td style="text-align: center;">${idx + 1}</td>
                    <td><strong>${b.title}</strong></td>
                    <td style="text-align: center;">${b.category}</td>
                    <td style="text-align: center; font-weight: bold; color: #0a5c2c;">+${b.points} pts</td>
                    <td style="text-align: center;">${b.earnedAt ? new Date(b.earnedAt).toLocaleDateString() : 'Active Term'}</td>
                    <td>${b.description}</td>
                </tr>
            `).join('');

            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Achievements Portfolio - ${studentName}</title>
                    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
                    <style>
                        @page { size: landscape; margin: 1.2cm; }
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; padding: 1.5rem; }
                        .header-box { border-bottom: 2px solid #0a5c2c; padding-bottom: 0.75rem; margin-bottom: 1.25rem; }
                        @media print { .no-print { display: none !important; } }
                    </style>
                </head>
                <body>
                    <div class="no-print d-flex justify-content-between align-items-center mb-3">
                        <span class="text-muted small">Parent Portal - Child Achievements Portfolio</span>
                        <button class="btn btn-sm btn-primary" onclick="window.print()">Print Document</button>
                    </div>
                    <div class="header-box d-flex justify-content-between align-items-center">
                        <div>
                            <h4 class="m-0 fw-bold" style="color: #0a5c2c;">TALISAY SENIOR HIGH SCHOOL</h4>
                            <div class="small fw-semibold text-secondary">Learner Achievements &amp; Positive Recognition Badges (Parent Copy)</div>
                            <div class="small text-muted mt-1">Student: <strong>${studentName}</strong> | Class: ${studentSec} | ID: <code>${studentId}</code></div>
                        </div>
                        <div class="text-end">
                            <span class="badge bg-success fs-6 me-1">Total Points: ${totalPts}</span>
                            <span class="badge bg-primary fs-6">Badges: ${earnedBadges.length}</span>
                            <div class="small text-muted mt-1">Generated: ${new Date().toLocaleDateString()}</div>
                        </div>
                    </div>
                    <table class="table table-bordered table-sm align-middle mt-3">
                        <thead style="background-color: #0a5c2c; color: white;">
                            <tr>
                                <th style="width: 6%; text-align: center;">#</th>
                                <th style="width: 24%;">Badge Title</th>
                                <th style="width: 16%; text-align: center;">Category</th>
                                <th style="width: 12%; text-align: center;">Points</th>
                                <th style="width: 16%; text-align: center;">Date Earned</th>
                                <th style="width: 26%;">Recognition Citation</th>
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

    if (btnExportBadgeExcel) {
        btnExportBadgeExcel.addEventListener('click', () => {
            if (typeof XLSX === 'undefined') {
                alert('Excel library is loading. Please try again in a moment.');
                return;
            }
            if (!earnedBadges.length) {
                alert('No badges available to export.');
                return;
            }

            const studentName = activeChild ? activeChild.name : 'Student';
            const studentId = activeChild ? (activeChild.idNumber || 'N/A') : 'N/A';
            const studentSec = activeChild ? (activeChild.sectionName || activeChild.section || 'Medical Sciences') : 'Medical Sciences';
            const totalPts = earnedBadges.reduce((s, b) => s + b.points, 0);

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
            merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } });
            for (let c = 0; c <= 5; c++) {
                setCell(0, c, c === 0 ? "TALISAY SENIOR HIGH SCHOOL" : "", {
                    font: { name: "Segoe UI", sz: 14, bold: true, color: { rgb: "FFFFFF" } },
                    fill: { fgColor: { rgb: "0A5C2C" } },
                    alignment: { horizontal: "center", vertical: "center" }
                });
            }

            // ROW 1: System Title Ribbon
            rowHeights.push({ hpt: 20 });
            merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 5 } });
            for (let c = 0; c <= 5; c++) {
                setCell(1, c, c === 0 ? "MENTORAE — CHILD ACHIEVEMENTS & COMPETENCY BADGES (PARENT & GUARDIAN COPY)" : "", {
                    font: { name: "Segoe UI", sz: 10, bold: true, color: { rgb: "E6F4EA" } },
                    fill: { fgColor: { rgb: "074520" } },
                    alignment: { horizontal: "center", vertical: "center" }
                });
            }

            // ROW 2: Learner Information Bar
            rowHeights.push({ hpt: 22 });
            merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 2 } });
            merges.push({ s: { r: 2, c: 3 }, e: { r: 2, c: 5 } });
            for (let c = 0; c <= 2; c++) {
                setCell(2, c, c === 0 ? `Learner: ${studentName}` : "", {
                    font: { name: "Segoe UI", sz: 11, bold: true, color: { rgb: "0A5C2C" } },
                    fill: { fgColor: { rgb: "E8F5E9" } },
                    alignment: { horizontal: "left", vertical: "center" },
                    border: { bottom: { style: "thin", color: { rgb: "0A5C2C" } } }
                });
            }
            for (let c = 3; c <= 5; c++) {
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
            merges.push({ s: { r: 3, c: 4 }, e: { r: 3, c: 5 } });
            for (let c = 0; c <= 1; c++) {
                setCell(3, c, c === 0 ? `Class Section: ${studentSec}` : "", {
                    font: { name: "Segoe UI", sz: 9, bold: true, color: { rgb: "4A5568" } },
                    fill: { fgColor: { rgb: "F8F9FA" } },
                    alignment: { horizontal: "left", vertical: "center" }
                });
            }
            for (let c = 2; c <= 3; c++) {
                setCell(3, c, c === 2 ? `Accumulated: ${totalPts} Points` : "", {
                    font: { name: "Segoe UI", sz: 9, bold: true, color: { rgb: "0A5C2C" } },
                    fill: { fgColor: { rgb: "F8F9FA" } },
                    alignment: { horizontal: "center", vertical: "center" }
                });
            }
            for (let c = 4; c <= 5; c++) {
                setCell(3, c, c === 4 ? `Exported: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}` : "", {
                    font: { name: "Segoe UI", sz: 9, color: { rgb: "4A5568" } },
                    fill: { fgColor: { rgb: "F8F9FA" } },
                    alignment: { horizontal: "right", vertical: "center" }
                });
            }

            // ROW 4: KPI Summary Cards
            rowHeights.push({ hpt: 22 });
            merges.push({ s: { r: 4, c: 0 }, e: { r: 4, c: 1 } });
            merges.push({ s: { r: 4, c: 2 }, e: { r: 4, c: 3 } });
            merges.push({ s: { r: 4, c: 4 }, e: { r: 4, c: 5 } });

            const kpiBadges = { font: { name: "Segoe UI", sz: 9, bold: true, color: { rgb: "166534" } }, fill: { fgColor: { rgb: "DCFCE7" } }, alignment: { horizontal: "center", vertical: "center" }, border: cellBorder };
            const kpiPoints = { font: { name: "Segoe UI", sz: 9, bold: true, color: { rgb: "1E40AF" } }, fill: { fgColor: { rgb: "DBEAFE" } }, alignment: { horizontal: "center", vertical: "center" }, border: cellBorder };
            const kpiSection = { font: { name: "Segoe UI", sz: 9, bold: true, color: { rgb: "92400E" } }, fill: { fgColor: { rgb: "FEF3C7" } }, alignment: { horizontal: "center", vertical: "center" }, border: cellBorder };

            for (let c = 0; c <= 1; c++) setCell(4, c, c === 0 ? `TOTAL BADGES EARNED: ${earnedBadges.length}` : "", kpiBadges);
            for (let c = 2; c <= 3; c++) setCell(4, c, c === 2 ? `ACCUMULATED SCORE: ${totalPts} POINTS` : "", kpiPoints);
            for (let c = 4; c <= 5; c++) setCell(4, c, c === 4 ? `CLASS SECTION: ${studentSec}` : "", kpiSection);

            // ROW 5: Spacing Row
            rowHeights.push({ hpt: 8 });
            for (let c = 0; c <= 5; c++) setCell(5, c, "", {});

            // ROW 6: Table Headers
            rowHeights.push({ hpt: 26 });
            const headers = ["No.", "Badge Title", "Category", "Points Awarded", "Date Earned", "Recognition Citation & Criteria"];
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
            earnedBadges.forEach((b, idx) => {
                rowHeights.push({ hpt: 22 });
                const isEven = idx % 2 === 0;
                const rowBg = isEven ? "FFFFFF" : "F9FAF9";

                let catFill = "E0F2FE";
                let catColor = "0369A1";
                const cat = (b.category || '').toLowerCase();
                if (cat.includes('attend')) {
                    catFill = "DCFCE7";
                    catColor = "166534";
                } else if (cat.includes('leader') || cat.includes('special')) {
                    catFill = "FEF3C7";
                    catColor = "92400E";
                } else if (cat.includes('char') || cat.includes('values')) {
                    catFill = "F3E8FF";
                    catColor = "7E22CE";
                }

                setCell(curRow, 0, idx + 1, { font: { name: "Segoe UI", sz: 9 }, fill: { fgColor: { rgb: rowBg } }, alignment: { horizontal: "center", vertical: "center" }, border: cellBorder }, 'n');
                setCell(curRow, 1, b.title || 'Badge', { font: { name: "Segoe UI", sz: 9, bold: true, color: { rgb: "0A5C2C" } }, fill: { fgColor: { rgb: rowBg } }, alignment: { horizontal: "left", vertical: "center" }, border: cellBorder });
                setCell(curRow, 2, b.category || 'General', { font: { name: "Segoe UI", sz: 9, bold: true, color: { rgb: catColor } }, fill: { fgColor: { rgb: catFill } }, alignment: { horizontal: "center", vertical: "center" }, border: cellBorder });
                setCell(curRow, 3, `+${b.points || 10} pts`, { font: { name: "Segoe UI", sz: 9, bold: true, color: { rgb: "166534" } }, fill: { fgColor: { rgb: rowBg } }, alignment: { horizontal: "center", vertical: "center" }, border: cellBorder });
                setCell(curRow, 4, b.earnedAt ? new Date(b.earnedAt).toLocaleDateString() : 'Active Term', { font: { name: "Segoe UI", sz: 9 }, fill: { fgColor: { rgb: rowBg } }, alignment: { horizontal: "center", vertical: "center" }, border: cellBorder });
                setCell(curRow, 5, b.description || '', { font: { name: "Segoe UI", sz: 9 }, fill: { fgColor: { rgb: rowBg } }, alignment: { horizontal: "left", vertical: "center" }, border: cellBorder });

                curRow++;
            });

            ws['!ref'] = `A1:F${curRow}`;
            ws['!merges'] = merges;
            ws['!rows'] = rowHeights;
            ws['!cols'] = [
                { wch: 8 },   // No.
                { wch: 28 },  // Badge Title
                { wch: 18 },  // Category
                { wch: 16 },  // Points Awarded
                { wch: 16 },  // Date Earned
                { wch: 50 }   // Citation Description
            ];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Badges Portfolio");

            const safeName = (studentName || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_');
            const filename = `Achievements_ParentCopy_${safeName}_${studentId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(wb, filename);
        });
    }
});

