/**
 * Mentorae - Class Management & DepEd E-Class Record Synchronization Engine
 * Integrated with Live Mentorae Backend APIs:
 *  - /api/classes/my-sections
 *  - /api/classes/roster
 *  - /api/classes/my-subjects
 *  - /api/grades/roster & /api/grades
 *  - /api/badges/catalog
 *  - /api/badges/award
 *  - /api/badges/student/:studentId
 *  - /api/badges/leaderboard
 *  - /api/badges/reset
 *  - DepEd E-Class Record (.xlsx / .xlsm) SheetJS context parsing
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 0. Session Guard & Authentication
    const { token, user } = requireSession('../login.html', ['teacher', 'admin']);
    wireLogout('logoutBtn', '../login.html', token);

    // =========================================================================
    // 1. Live Clock Sync
    // =========================================================================
    const liveDateElement = document.getElementById('liveDate');
    const liveTimeElement = document.getElementById('liveTime');

    function updateDateTime() {
        if (!liveDateElement || !liveTimeElement) return;
        const now = new Date();
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        liveDateElement.textContent = now.toLocaleDateString('en-US', dateOptions);
        const timeOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true };
        liveTimeElement.textContent = now.toLocaleTimeString('en-US', timeOptions);
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    // =========================================================================
    // 2. DepEd Official Transmutation Engine (DO 8, s. 2015 & DO 15, s. 2026)
    // =========================================================================
    function transmuteDepEdGrade(initialGrade) {
        const g = parseFloat(initialGrade) || 0;
        if (g >= 100) return 100;
        if (g >= 99.50) return 100;
        if (g >= 98.32) return 99;
        if (g >= 97.14) return 98;
        if (g >= 95.96) return 97;
        if (g >= 94.78) return 96;
        if (g >= 93.60) return 95;
        if (g >= 92.42) return 94;
        if (g >= 91.24) return 93;
        if (g >= 90.06) return 92;
        if (g >= 88.88) return 91;
        if (g >= 87.70) return 90;
        if (g >= 86.52) return 89;
        if (g >= 85.34) return 88;
        if (g >= 84.16) return 87;
        if (g >= 82.98) return 86;
        if (g >= 81.80) return 85;
        if (g >= 80.62) return 84;
        if (g >= 79.44) return 83;
        if (g >= 78.26) return 82;
        if (g >= 77.08) return 81;
        if (g >= 75.90) return 80;
        if (g >= 74.72) return 79;
        if (g >= 73.54) return 78;
        if (g >= 72.36) return 77;
        if (g >= 71.18) return 76;
        if (g >= 70.00) return 75; // DepEd Order 15, s. 2026 passing mark
        if (g >= 65.34) return 74;
        if (g >= 60.67) return 73;
        if (g >= 56.01) return 72;
        if (g >= 51.34) return 71;
        if (g >= 46.67) return 70;
        if (g >= 42.01) return 69;
        if (g >= 37.34) return 68;
        if (g >= 32.68) return 67;
        if (g >= 28.01) return 66;
        if (g >= 23.35) return 65;
        if (g >= 18.68) return 64;
        if (g >= 14.01) return 63;
        if (g >= 9.35) return 62;
        if (g >= 4.68) return 61;
        return 60;
    }

    function getDepEdLetterGrade(transmutedGrade) {
        const t = parseFloat(transmutedGrade);
        if (isNaN(t) || t === null) return "";
        if (t >= 90) return "A";
        if (t >= 80) return "B";
        if (t >= 75) return "C";
        if (t >= 65) return "D";
        return "E";
    }

    function getDepEdDescriptor(grade) {
        const g = parseFloat(grade) || 0;
        if (g >= 90) return { text: 'Advancing', class: 'txt-outstanding' };
        if (g >= 80) return { text: 'Benchmarking', class: 'txt-verysatisfactory' };
        if (g >= 75) return { text: 'Connecting', class: 'txt-satisfactory' };
        if (g >= 65) return { text: 'Developing', class: 'txt-warning' };
        return { text: 'Emerging', class: 'txt-dnme' };
    }

    // =========================================================================
    // 2.5 Badge Metadata (Vibrant Icons, Colors, Points & Styles)
    // =========================================================================
    const SYSTEM_AWARDED_BADGES = new Set([
        'completed_grades',
        'completed_grade',
        'honor_student',
        'honor_students',
        'early_bird',
        'perfect_attendance'
    ]);

    function isSystemAutomatedBadge(badge) {
        if (!badge) return false;
        if (badge.is_system_awarded) return true;
        const id = String(badge.id || badge.badge_id || '').trim().toLowerCase();
        const name = String(badge.name || badge.title || '').trim().toLowerCase();
        if (SYSTEM_AWARDED_BADGES.has(id)) return true;
        if (id.includes('completed_grade') || name.includes('completed grade')) return true;
        if (id.includes('honor_student') || name.includes('honor student')) return true;
        if (id.includes('early_bird') || name.includes('early bird')) return true;
        if (id.includes('perfect_attendance') || name.includes('perfect attendance')) return true;
        return false;
    }

    const BADGE_METADATA = {
        perfect_attendance: { title: 'Perfect Attendance', icon: '🎯', points: 100, bg: '#d5ebd5', color: '#1f6e1f', systemAwarded: true },
        honor_student: { title: 'Honor Student', icon: '🏆', points: 150, bg: '#fef2cb', color: '#b27a00', systemAwarded: true },
        quiz_master: { title: 'Quiz Master', icon: '🧠', points: 120, bg: '#deeaf6', color: '#2f5597' },
        early_bird: { title: 'Early Bird', icon: '🌅', points: 80, bg: '#fce4d6', color: '#c65911', systemAwarded: true },
        top_scorer: { title: 'Top Scorer', icon: '🅰️', points: 150, bg: '#e2efda', color: '#385723' },
        most_active: { title: 'Most Active', icon: '👍', points: 100, bg: '#d5ebd5', color: '#1f6e1f' },
        innovative_thinker: { title: 'Innovative Thinker', icon: '💡', points: 120, bg: '#fef2cb', color: '#806000' },
        team_captain: { title: 'Team Captain', icon: '⭐', points: 100, bg: '#ebdcf5', color: '#6f30a0' },
        resilient_thinker: { title: 'Resilient Thinker', icon: '💎', points: 100, bg: '#d9f1f2', color: '#008080' },
        completed_grades: { title: 'Completed Grades', icon: '📅', points: 80, bg: '#e4dff2', color: '#5230a0', systemAwarded: true },
        recitation_master: { title: 'Recitation Master', icon: '💬', points: 90, bg: '#fce4d6', color: '#c65911' },
        critical_thinker: { title: 'Critical Thinker', icon: '🔍', points: 110, bg: '#dae8fc', color: '#3b6e8c' },
        coacher: { title: 'Coacher / Peer Tutor', icon: '🤝', points: 120, bg: '#d5e8d4', color: '#274e13' },
        top_performer: { title: 'Top Performer', icon: '🎖️', points: 150, bg: '#ffe6cc', color: '#d79b00' },
        most_improved: { title: 'Most Improved', icon: '📈', points: 130, bg: '#ebdcf5', color: '#6f30a0' },
        deped_values: { title: 'Core Values Award', icon: '🌟', points: 100, bg: '#fff2cc', color: '#b27a00' },
        punctuality_champ: { title: 'Punctuality Champ', icon: '⏰', points: 90, bg: '#deeaf6', color: '#2f5597' },
        helping_hand: { title: 'Helping Hand', icon: '❤️', points: 80, bg: '#f8cecc', color: '#b85450' }
    };


    // =========================================================================
    // 3. State Management & DOM Elements
    // =========================================================================
    let mySections = [];
    let currentSectionId = null;
    let currentSubjectId = 'all';
    let currentRoster = [];
    let currentSubjects = [];
    let badgeCatalog = [];
    let selectedBadgeIds = new Set();

    // DOM Elements
    const rosterTableBody = document.getElementById('studentRosterBody');
    const gradeTableBody = document.getElementById('gradeEncodingEntriesBody');
    const searchBar = document.getElementById('searchBar');
    const filterSection = document.getElementById('filterSection');
    const filterSubject = document.getElementById('filterSubject');
    const filterStrand = document.getElementById('filterStrand');
    const filterYear = document.getElementById('filterYear');

    const encodeSectionFilter = document.getElementById('encodeSectionFilter');
    const encodeTermFilter = document.getElementById('encodeTermFilter');
    const encodeSubjectFilter = document.getElementById('encodeSubjectFilter');

    const btnGiveBadge = document.getElementById('btnGiveBadge');
    const btnEncodeGrades = document.getElementById('btnEncodeGrades');
    const btnCancelAction = document.getElementById('btnCancelAction');
    const btnAwardBadges = document.getElementById('btnAwardBadges');
    const studentSelectBadge = document.getElementById('studentSelectBadge');
    const badgesSelectionGrid = document.getElementById('badgesSelectionGrid');
    const systemBadgesWrapper = document.getElementById('systemBadgesWrapper');
    const systemBadgesGrid = document.getElementById('systemBadgesGrid');
    const activityTimeline = document.getElementById('activityTimeline');

    // Multi-Student Badge Awarding Controls & State
    const btnModeSingleStudent = document.getElementById('btnModeSingleStudent');
    const btnModeMultipleStudents = document.getElementById('btnModeMultipleStudents');
    const singleStudentSelectorWrapper = document.getElementById('singleStudentSelectorWrapper');
    const multipleStudentsSelectorWrapper = document.getElementById('multipleStudentsSelectorWrapper');
    const btnSelectAllStudentsBadge = document.getElementById('btnSelectAllStudentsBadge');
    const btnClearAllStudentsBadge = document.getElementById('btnClearAllStudentsBadge');
    const badgeSelectedStudentsCounter = document.getElementById('badgeSelectedStudentsCounter');
    const badgeStudentSearchFilter = document.getElementById('badgeStudentSearchFilter');
    const btnClearBadgeStudentSearch = document.getElementById('btnClearBadgeStudentSearch');
    const badgeStudentsCheckboxList = document.getElementById('badgeStudentsCheckboxList');

    let badgeAwardMode = 'single'; // 'single' | 'multiple'
    const selectedMultiStudentIds = new Set();

    const btnSaveAllGradesNow = document.getElementById('btnSaveAllGradesNow');
    const btnResetGrades = document.getElementById('btnResetGrades');

    // Leaderboard DOM Elements
    const sectionLeaderboardList = document.getElementById('sectionLeaderboardList');
    const leaderboardSectionLabel = document.getElementById('leaderboardSectionLabel');
    const leaderboardTotalStudents = document.getElementById('leaderboardTotalStudents');

    // Stat metric elements
    const statCards = document.querySelectorAll('.stat-metric-card h2');

    function updateStatMetrics(overview, students) {
        const total = (overview && overview.totalHandled !== undefined) ? overview.totalHandled : (students || []).length;
        const present = (overview && overview.presentToday !== undefined) ? overview.presentToday : (students || []).filter(s => s.status === 'present' || s.status === 'late').length;
        const absent = (overview && overview.absentToday !== undefined) ? overview.absentToday : (students || []).filter(s => s.status === 'absent').length;
        const excused = (overview && overview.excusedToday !== undefined) ? overview.excusedToday : (students || []).filter(s => s.status === 'excused').length;

        const totalEl = document.getElementById('counterTotalStudent');
        const presentEl = document.getElementById('counterPresentToday');
        const absentEl = document.getElementById('counterAbsentToday');
        const excusedEl = document.getElementById('counterExcusedToday');

        if (totalEl) totalEl.textContent = total;
        if (presentEl) presentEl.textContent = present;
        if (absentEl) absentEl.textContent = absent;
        if (excusedEl) excusedEl.textContent = excused;

        if (statCards && statCards.length >= 4) {
            statCards[0].textContent = total;
            statCards[1].textContent = present;
            statCards[2].textContent = absent;
            statCards[3].textContent = excused;
        }
    }

    // =========================================================================
    // 4. Load Sections (Backend API)
    // =========================================================================
    async function loadSections() {
        try {
            const data = await authedFetch('/api/classes/my-sections', token);
            if (!data.success || !data.sections.length) {
                if (filterSection) filterSection.innerHTML = '<option value="">No sections assigned</option>';
                if (encodeSectionFilter) encodeSectionFilter.innerHTML = '<option value="">No sections assigned</option>';
                return;
            }

            mySections = data.sections;
            let optionsHtml = '';
            if (mySections.length > 1) {
                optionsHtml += `<option value="all">All Sections (${mySections.length} Classes Handled)</option>`;
            }
            optionsHtml += mySections.map(s => `
                <option value="${s.id}">${s.name}${s.isAdvisory ? ' ★ (Advisory Class)' : ''}</option>
            `).join('');

            if (filterSection) filterSection.innerHTML = optionsHtml;
            if (encodeSectionFilter) encodeSectionFilter.innerHTML = mySections.map(s => `
                <option value="${s.id}">${s.name}${s.isAdvisory ? ' ★ (Advisory Class)' : ''}</option>
            `).join('');

            // Prefer advisory section if assigned, otherwise first section
            const advSection = mySections.find(s => s.isAdvisory === 1 || s.isAdvisory === true);
            currentSectionId = advSection ? advSection.id : mySections[0].id;
            if (filterSection) filterSection.value = currentSectionId;
            if (encodeSectionFilter) encodeSectionFilter.value = currentSectionId;

            updateAdvisoryBanner();

            // Trigger data load for initial section (load subjects first, then roster and leaderboard)
            await loadSubjects(currentSectionId);
            await Promise.all([
                loadRoster(currentSectionId, currentSubjectId),
                loadLeaderboard(currentSectionId)
            ]);
        } catch (err) {
            console.error('loadSections error:', err);
        }
    }

    // Filter section change listeners
    if (filterSection) {
        filterSection.addEventListener('change', async () => {
            currentSectionId = filterSection.value;
            if (encodeSectionFilter) encodeSectionFilter.value = currentSectionId;
            updateAdvisoryBanner();
            await loadSubjects(currentSectionId);
            await Promise.all([
                loadRoster(currentSectionId, currentSubjectId),
                loadLeaderboard(currentSectionId)
            ]);
        });
    }

    if (encodeSectionFilter) {
        encodeSectionFilter.addEventListener('change', async () => {
            currentSectionId = encodeSectionFilter.value;
            if (filterSection) filterSection.value = currentSectionId;
            updateAdvisoryBanner();
            await loadSubjects(currentSectionId);
            await Promise.all([
                loadRoster(currentSectionId, currentSubjectId),
                loadLeaderboard(currentSectionId)
            ]);
        });
    }

    // Filter subject change listener (top filter bar)
    if (filterSubject) {
        filterSubject.addEventListener('change', async () => {
            currentSubjectId = filterSubject.value;
            if (encodeSubjectFilter && currentSubjectId !== 'all') {
                encodeSubjectFilter.value = currentSubjectId;
            }
            updateRosterSubjectBadge();
            await Promise.all([
                loadRoster(currentSectionId, currentSubjectId),
                loadGradeSheet()
            ]);
        });
    }

    // =========================================================================
    // 5. Load Class Roster (Backend API)
    // =========================================================================
    async function loadRoster(sectionId, subjectId) {
        if (!sectionId) return;
        if (rosterTableBody) {
            rosterTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4"><i class="bi bi-arrow-repeat me-2"></i>Loading student roster...</td></tr>';
        }

        const subParam = subjectId !== undefined ? subjectId : (filterSubject ? filterSubject.value : currentSubjectId);

        try {
            const data = await authedFetch(`/api/classes/roster?sectionId=${sectionId}&subjectId=${subParam || 'all'}`, token);
            if (!data.success || !data.roster) {
                currentRoster = [];
                renderRosterSheet([]);
                return;
            }

            currentRoster = data.roster;
            renderRosterSheet(currentRoster);
            updateStatMetrics(data.overview, currentRoster);
            populateBadgeStudentDropdown(currentRoster);
            const rosterCountEl = document.getElementById('rosterCountText');
            if (rosterCountEl) {
                rosterCountEl.textContent = `${currentRoster.length} student${currentRoster.length === 1 ? '' : 's'}`;
            }
        } catch (err) {
            console.error('loadRoster error:', err);
            if (rosterTableBody) {
                rosterTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-4">Error loading roster.</td></tr>';
            }
        }
    }

    function renderRosterSheet(records) {
        if (!rosterTableBody) return;
        rosterTableBody.innerHTML = '';

        if (!records || records.length === 0) {
            rosterTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No student records found in this section.</td></tr>`;
            return;
        }

        records.forEach(student => {
            const row = document.createElement('tr');
            const gradeVal = student.grade !== null && student.grade !== undefined ? student.grade : null;
            let gradeText = '—';
            let gradeClass = 'text-muted';

            if (gradeVal !== null) {
                gradeText = `${gradeVal}%`;
                if (gradeVal >= 90) gradeClass = 'grade-excellent';
                else if (gradeVal >= 80) gradeClass = 'grade-average';
                else gradeClass = 'grade-warning';
            }

            const statusVal = student.status || 'not_scanned';
            let statusDisplay = 'Not Scanned';
            if (statusVal === 'present') statusDisplay = 'Present';
            else if (statusVal === 'late') statusDisplay = 'Late';
            else if (statusVal === 'absent') statusDisplay = 'Absent';
            else if (statusVal === 'excused') statusDisplay = 'Excused';
            else if (statusVal === 'not_scanned' || statusVal === 'unscanned') statusDisplay = 'Not Scanned';
            else statusDisplay = statusVal.charAt(0).toUpperCase() + statusVal.slice(1);

            row.innerHTML = `
                <td class="px-4 py-3 text-secondary tracking-sm">${student.idNumber || student.id}</td>
                <td class="px-4 py-3 fw-medium text-dark">
                    <div class="d-flex align-items-center gap-2.5">
                        <div class="rounded-circle bg-light border overflow-hidden d-flex align-items-center justify-content-center flex-shrink-0" style="width: 32px; height: 32px;">
                            ${student.profilePictureUrl
                                ? `<img src="${student.profilePictureUrl}" class="w-100 h-100 object-fit-cover" alt="">`
                                : `<i class="bi bi-person text-secondary small"></i>`}
                        </div>
                        <button type="button" class="btn btn-link p-0 text-dark fw-semibold text-decoration-none student-roster-name-btn text-start" data-id="${student.id}" title="Click to view student details and update official ID photo">
                            ${student.name} ${student.sectionName && currentSectionId === 'all' ? `<span class="badge bg-light text-secondary border fw-normal micro-text ms-1">${escapeHtml(student.sectionName)}</span>` : ''} <i class="bi bi-info-circle text-muted ms-1 small"></i>
                        </button>
                    </div>
                </td>
                <td class="px-4 py-3 text-center fw-bold ${gradeClass}">${gradeText}</td>
                <td class="px-4 py-3 text-center text-dark fw-medium">${student.attendance || '—'}</td>
                <td class="px-4 py-3 text-center">
                    <span class="attendance-status-badge ${statusVal}">${statusDisplay}</span>
                </td>
                <td class="px-4 py-3 text-center">
                    <button type="button" class="btn btn-sm btn-outline-dark-green print-single-sf9-btn d-inline-flex align-items-center gap-1 shadow-sm px-2.5 py-1" data-id="${student.id}" data-name="${student.name}" title="Preview / Print SF9 Report Card">
                        <i class="bi bi-file-earmark-pdf"></i> SF9 Card
                    </button>
                </td>
            `;

            rosterTableBody.appendChild(row);
        });

        rosterTableBody.querySelectorAll('.student-roster-name-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const sId = btn.dataset.id;
                const student = records.find(s => String(s.id) === String(sId));
                if (!student) return;
                openStudentProfileModal(student);
            });
        });

        rosterTableBody.querySelectorAll('.print-single-sf9-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                generateBulkReportCards(currentSectionId, btn.dataset.id);
            });
        });
    }

    const studentProfileModalEl = document.getElementById('studentRosterProfileModal');
    const studentProfileModal = studentProfileModalEl ? new bootstrap.Modal(studentProfileModalEl) : null;
    let currentModalStudent = null;

    async function openStudentProfileModal(student) {
        if (!studentProfileModal) return;
        currentModalStudent = student;

        document.getElementById('modalStudentName').textContent = student.name || 'Student';
        document.getElementById('modalStudentId').textContent = `ID: ${student.idNumber || student.id}`;
        document.getElementById('modalStudentGrade').textContent = (student.grade !== null && student.grade !== undefined) ? `${student.grade}%` : '—';
        document.getElementById('modalStudentAttendance').textContent = student.attendance || '—';
        
        // Render current avatar or placeholder
        const avatarImg = document.getElementById('modalStudentAvatarImg');
        const avatarIcon = document.getElementById('modalStudentAvatarIcon');
        if (avatarImg && avatarIcon) {
            if (student.profilePictureUrl) {
                avatarImg.src = student.profilePictureUrl;
                avatarImg.classList.remove('d-none');
                avatarIcon.classList.add('d-none');
            } else {
                avatarImg.src = '';
                avatarImg.classList.add('d-none');
                avatarIcon.classList.remove('d-none');
            }
        }

        const statusVal = student.status || 'not_scanned';
        let statusDisplay = 'Not Scanned';
        if (statusVal === 'present') statusDisplay = 'Present';
        else if (statusVal === 'late') statusDisplay = 'Late';
        else if (statusVal === 'absent') statusDisplay = 'Absent';
        else if (statusVal === 'excused') statusDisplay = 'Excused';
        else if (statusVal === 'not_scanned' || statusVal === 'unscanned') statusDisplay = 'Not Scanned';
        else statusDisplay = statusVal.charAt(0).toUpperCase() + statusVal.slice(1);

        document.getElementById('modalStudentStatus').innerHTML = `<span class="attendance-status-badge ${statusVal}">${statusDisplay}</span>`;

        const sectionSelect = document.getElementById('filterSection');
        const sectionName = sectionSelect ? sectionSelect.options[sectionSelect.selectedIndex]?.text : '—';
        document.getElementById('modalStudentSection').textContent = sectionName;

        const badgesWrap = document.getElementById('modalStudentBadges');
        const badgeCount = document.getElementById('modalStudentBadgeCount');
        badgesWrap.innerHTML = '<span class="text-muted small">Loading badges…</span>';

        studentProfileModal.show();

        try {
            const data = await authedFetch(`/api/badges/student/${student.id}`, token);
            if (data.success && data.badges && data.badges.length) {
                badgeCount.textContent = `${data.badges.length} Badge${data.badges.length === 1 ? '' : 's'}`;
                badgesWrap.innerHTML = data.badges.map(b => `
                    <span class="badge py-1.5 px-2.5 rounded-pill d-inline-flex align-items-center gap-1" style="background:${b.bg || '#eef7ee'}; color:${b.color || '#0a5c2c'}; border: 1px solid #c8e6c9;" title="${b.name}">
                        ${b.icon ? `<i class="bi ${b.icon}"></i>` : '★'} ${b.name}
                    </span>
                `).join('');
            } else {
                badgeCount.textContent = '0 Badges';
                badgesWrap.innerHTML = '<span class="text-muted small">No badges awarded yet for this student.</span>';
            }
        } catch (err) {
            badgeCount.textContent = '0 Badges';
            badgesWrap.innerHTML = '<span class="text-muted small">Could not load badges.</span>';
        }
    }

    // Bind Teacher Official ID Photo upload triggers in modal
    const modalUploadIdPhotoBtn = document.getElementById('modalUploadIdPhotoBtn');
    const modalStudentAvatarTrigger = document.getElementById('modalStudentAvatarTrigger');
    const modalStudentPhotoInput = document.getElementById('modalStudentPhotoInput');

    function triggerStudentPhotoUpload() {
        if (!currentModalStudent) return;
        if (modalStudentPhotoInput) modalStudentPhotoInput.click();
    }

    if (modalUploadIdPhotoBtn) {
        modalUploadIdPhotoBtn.addEventListener('click', triggerStudentPhotoUpload);
    }
    if (modalStudentAvatarTrigger) {
        modalStudentAvatarTrigger.addEventListener('click', triggerStudentPhotoUpload);
    }

    if (modalStudentPhotoInput) {
        modalStudentPhotoInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            if (!file.type.match(/^image\/(png|jpeg|jpg|webp)$/i)) {
                alert('Please choose a valid image file (PNG, JPG, or WEBP).');
                modalStudentPhotoInput.value = '';
                return;
            }

            if (!currentModalStudent) return;

            if (typeof window.openAvatarCropper === 'function') {
                window.openAvatarCropper({
                    file,
                    token,
                    uploadEndpoint: `/api/classes/student/${currentModalStudent.id}/avatar`,
                    onSuccess: (newBase64) => {
                        currentModalStudent.profilePictureUrl = newBase64;
                        const avatarImg = document.getElementById('modalStudentAvatarImg');
                        const avatarIcon = document.getElementById('modalStudentAvatarIcon');
                        if (avatarImg) {
                            avatarImg.src = newBase64;
                            avatarImg.classList.remove('d-none');
                        }
                        if (avatarIcon) {
                            avatarIcon.classList.add('d-none');
                        }
                        // Update currentRoster record & re-render table to reflect new official photo
                        const matched = currentRoster.find(s => String(s.id) === String(currentModalStudent.id));
                        if (matched) matched.profilePictureUrl = newBase64;
                        renderRosterSheet(currentRoster);
                    }
                });
            } else {
                alert('Image cropper utility is loading. Please try again.');
            }
            modalStudentPhotoInput.value = '';
        });
    }

    const modalResetStudentPasswordBtn = document.getElementById('modalResetStudentPasswordBtn');
    if (modalResetStudentPasswordBtn) {
        modalResetStudentPasswordBtn.addEventListener('click', async () => {
            if (!currentModalStudent) return;
            const studentName = currentModalStudent.name || 'this student';
            const studentIdNum = currentModalStudent.idNumber || currentModalStudent.id || '';
            const confirmMsg = `Reset the password for ${studentName} back to their Student ID / LRN (${studentIdNum})?\n\nThey will be required to set a new permanent password on their next login.`;
            if (!confirm(confirmMsg)) return;

            try {
                modalResetStudentPasswordBtn.disabled = true;
                const res = await fetch(`${API_BASE}/api/classes/student/${currentModalStudent.id}/reset-password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                });
                const data = await res.json();
                if (data.success) {
                    alert(`Password successfully reset!\n\nTemporary Password: ${data.defaultPassword}\n\nThe student can now log in using their Student ID as their password and will be prompted to create a new one.`);
                } else {
                    alert(data.message || 'Could not reset password.');
                }
            } catch (err) {
                console.error('Reset student password error:', err);
                alert('Network error while resetting password.');
            } finally {
                modalResetStudentPasswordBtn.disabled = false;
            }
        });
    }

    function updateSelectedStudentsBadgeCounter(selectedCount, totalCount) {
        if (!badgeSelectedStudentsCounter) return;
        badgeSelectedStudentsCounter.innerHTML = `<i class="bi bi-person-check-fill me-1"></i> ${selectedCount} of ${totalCount} Selected`;
    }

    function renderBadgeStudentsCheckboxList(students) {
        if (!badgeStudentsCheckboxList) return;
        const studentList = students || currentRoster || [];
        const filterQuery = (badgeStudentSearchFilter ? badgeStudentSearchFilter.value : '').toLowerCase().trim();

        if (!studentList.length) {
            badgeStudentsCheckboxList.innerHTML = '<p class="text-muted small text-center my-3">No students enrolled in this section.</p>';
            updateSelectedStudentsBadgeCounter(0, 0);
            return;
        }

        const filtered = studentList.filter(s => {
            if (!filterQuery) return true;
            const name = (s.name || '').toLowerCase();
            const idNum = String(s.idNumber || s.id || '').toLowerCase();
            return name.includes(filterQuery) || idNum.includes(filterQuery);
        });

        if (!filtered.length) {
            badgeStudentsCheckboxList.innerHTML = '<p class="text-muted small text-center my-3">No matching students found.</p>';
            updateSelectedStudentsBadgeCounter(selectedMultiStudentIds.size, studentList.length);
            return;
        }

        badgeStudentsCheckboxList.innerHTML = filtered.map(s => {
            const isChecked = selectedMultiStudentIds.has(String(s.id));
            const initials = (s.name || 'S')
                .split(' ')
                .filter(Boolean)
                .map(part => part[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();

            return `
                <div class="badge-student-item ${isChecked ? 'selected' : ''}" data-student-id="${s.id}">
                    <input class="form-check-input badge-student-checkbox" type="checkbox" value="${s.id}" ${isChecked ? 'checked' : ''} id="chkStudentBadge_${s.id}">
                    <div class="badge-student-avatar">${initials}</div>
                    <div class="flex-grow-1 text-truncate">
                        <label class="form-check-label fw-semibold text-dark text-sm d-block text-truncate mb-0" for="chkStudentBadge_${s.id}" style="cursor: pointer;">
                            ${escapeHtml(s.name || 'Student')}
                        </label>
                        <span class="micro-text text-muted">ID/LRN: ${escapeHtml(String(s.idNumber || s.id))}</span>
                    </div>
                </div>
            `;
        }).join('');

        badgeStudentsCheckboxList.querySelectorAll('.badge-student-item').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.tagName && e.target.tagName.toLowerCase() === 'input') return;
                const cb = row.querySelector('.badge-student-checkbox');
                if (cb) {
                    cb.checked = !cb.checked;
                    cb.dispatchEvent(new Event('change'));
                }
            });

            const cb = row.querySelector('.badge-student-checkbox');
            if (cb) {
                cb.addEventListener('change', () => {
                    const sId = String(cb.value);
                    if (cb.checked) {
                        selectedMultiStudentIds.add(sId);
                        row.classList.add('selected');
                    } else {
                        selectedMultiStudentIds.delete(sId);
                        row.classList.remove('selected');
                    }
                    updateSelectedStudentsBadgeCounter(selectedMultiStudentIds.size, studentList.length);
                    updateMultiSelectActivityPreview();
                });
            }
        });

        updateSelectedStudentsBadgeCounter(selectedMultiStudentIds.size, studentList.length);
    }

    function updateMultiSelectActivityPreview() {
        if (badgeAwardMode !== 'multiple' || !activityTimeline) return;
        const total = selectedMultiStudentIds.size;
        if (total === 0) {
            activityTimeline.innerHTML = `
                <div class="text-center py-4 text-muted">
                    <i class="bi bi-people d-block mb-2 fs-3 opacity-50"></i>
                    <p class="m-0 text-sm fw-semibold">No students selected</p>
                    <p class="m-0 micro-text text-muted">Check students on the right to award badges simultaneously.</p>
                </div>
            `;
            return;
        }

        const selectedStudents = (currentRoster || []).filter(s => selectedMultiStudentIds.has(String(s.id)));
        const previewLimit = 8;
        const shown = selectedStudents.slice(0, previewLimit);
        const remainder = selectedStudents.length - shown.length;

        activityTimeline.innerHTML = `
            <div class="pb-2 mb-2 border-bottom">
                <span class="badge bg-success-subtle text-success border border-success-subtle fw-semibold px-2.5 py-1 rounded-pill text-xs">
                    <i class="bi bi-check2-circle me-1"></i> ${total} Selected Recipient(s)
                </span>
            </div>
            <div class="d-flex flex-column gap-1.5">
                ${shown.map(s => `
                    <div class="d-flex align-items-center gap-2 py-1 px-2 rounded-2 bg-light border border-light-subtle">
                        <i class="bi bi-person-check text-success"></i>
                        <div class="text-truncate">
                            <div class="text-xs fw-semibold text-dark text-truncate">${escapeHtml(s.name)}</div>
                            <div class="micro-text text-muted">ID: ${escapeHtml(String(s.idNumber || s.id))}</div>
                        </div>
                    </div>
                `).join('')}
                ${remainder > 0 ? `<div class="text-muted micro-text text-center py-1 bg-light rounded-pill">+ ${remainder} more student(s)</div>` : ''}
            </div>
        `;
    }

    function populateBadgeStudentDropdown(students) {
        if (studentSelectBadge) {
            studentSelectBadge.innerHTML = '';
            if (!students || !students.length) {
                studentSelectBadge.innerHTML = '<option value="">No students in section</option>';
            } else {
                students.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.textContent = `${s.name} (${s.idNumber || s.id})`;
                    studentSelectBadge.appendChild(opt);
                });
            }
        }

        // Reset multi-select when section students change
        selectedMultiStudentIds.clear();
        renderBadgeStudentsCheckboxList(students);

        // Load activity preview based on current mode
        if (badgeAwardMode === 'single') {
            if (students && students.length > 0) {
                loadActivity(students[0].id);
            }
        } else {
            updateMultiSelectActivityPreview();
        }
    }

    // Search filter on roster table
    if (searchBar) {
        searchBar.addEventListener('input', () => {
            const query = searchBar.value.toLowerCase().trim();
            const filtered = currentRoster.filter(s => {
                const name = (s.name || '').toLowerCase();
                const idNum = String(s.idNumber || s.id || '').toLowerCase();
                return name.includes(query) || idNum.includes(query);
            });
            renderRosterSheet(filtered);
            const rosterCountEl = document.getElementById('rosterCountText');
            if (rosterCountEl) {
                rosterCountEl.textContent = query
                    ? `${filtered.length} of ${currentRoster.length} student${currentRoster.length === 1 ? '' : 's'}`
                    : `${currentRoster.length} student${currentRoster.length === 1 ? '' : 's'}`;
            }
        });
    }

    // =========================================================================
    // 6. Section Leaderboard Table (Live Backend API)
    // =========================================================================
    async function loadLeaderboard(sectionId) {
        if (!sectionLeaderboardList) return;
        sectionLeaderboardList.innerHTML = '<p class="text-muted small py-3 text-center mb-0"><i class="bi bi-arrow-repeat me-2"></i>Loading live section leaderboard...</p>';

        let url = `/api/badges/leaderboard?scope=section&sectionId=${sectionId}&limit=100`;
        const secObj = mySections.find(s => String(s.id) === String(sectionId));
        if (sectionId === 'all') {
            url = `/api/badges/leaderboard?scope=school&limit=200`;
            if (leaderboardSectionLabel) leaderboardSectionLabel.textContent = 'All Classes Handled • Academic Standings';
        } else if (leaderboardSectionLabel && secObj) {
            leaderboardSectionLabel.textContent = `Grade ${secObj.grade_level} - ${secObj.strandCode || ''} (${secObj.name}) • Live Academic Standings`;
        }

        try {
            const data = await authedFetch(url, token);
            if (!data.success || !Array.isArray(data.leaderboard)) {
                const msg = data && data.message ? data.message : 'Select a section to see rankings.';
                sectionLeaderboardList.innerHTML = `<p class="text-muted small py-3 text-center mb-0">${msg}</p>`;
                if (leaderboardTotalStudents) leaderboardTotalStudents.innerHTML = '<i class="bi bi-people-fill"></i> <span>0 Students</span>';
                return;
            }

            const list = data.leaderboard;
            if (leaderboardTotalStudents) {
                leaderboardTotalStudents.innerHTML = `<i class="bi bi-people-fill"></i> <span>${list.length} Student${list.length === 1 ? '' : 's'} Ranked</span>`;
            }

            if (!list.length) {
                sectionLeaderboardList.innerHTML = `
                    <div class="text-center py-4 text-muted">
                        <i class="bi bi-people display-6 d-block mb-2 opacity-50"></i>
                        <h6 class="fw-bold text-dark">No Students Enrolled Yet</h6>
                        <p class="m-0 small">No students are currently enrolled in this section.</p>
                    </div>
                `;
                return;
            }

            sectionLeaderboardList.innerHTML = list.map(r => {
                let rankBadgeHtml = '';
                if (r.rank === 1) {
                    rankBadgeHtml = `<div class="leaderboard-rank-badge rank-badge-1" title="Rank 1 - Gold Champion">1</div>`;
                } else if (r.rank === 2) {
                    rankBadgeHtml = `<div class="leaderboard-rank-badge rank-badge-2" title="Rank 2 - Silver Leader">2</div>`;
                } else if (r.rank === 3) {
                    rankBadgeHtml = `<div class="leaderboard-rank-badge rank-badge-3" title="Rank 3 - Bronze Achiever">3</div>`;
                } else {
                    rankBadgeHtml = `<div class="leaderboard-rank-badge rank-badge-plain">#${r.rank}</div>`;
                }

                // Avatar
                const avatarHtml = r.profilePictureUrl
                    ? `<img src="${r.profilePictureUrl}" class="rounded-circle border border-2 border-white shadow-xs" style="width: 42px; height: 42px; object-fit: cover; flex-shrink: 0;" alt="${r.name}">`
                    : `<div class="rounded-circle bg-light border border-2 border-white shadow-xs d-flex align-items-center justify-content-center text-muted" style="width: 42px; height: 42px; flex-shrink: 0;"><i class="bi bi-person-fill fs-5"></i></div>`;

                // Badge icons tray - ONLY render if there are actually valid badges
                const validBadges = (r.badges || []).filter(b => b && (b.id || b.name));
                const badgePills = validBadges.slice(0, 3).map(b => {
                    const meta = BADGE_METADATA[b.id] || {};
                    const iconDisplay = meta.icon || b.symbol || '⭐';
                    const bg = meta.bg || '#fef2cb';
                    const col = meta.color || '#b27a00';
                    return `
                        <span class="badge-mini-circle d-inline-flex align-items-center justify-content-center" title="${b.name}" style="background: ${bg}; color: ${col};">
                            ${iconDisplay}
                        </span>
                    `;
                }).join('');

                const badgeTrayHtml = validBadges.length > 0
                    ? `<div class="d-none d-sm-flex align-items-center gap-1.5 me-2" title="${validBadges.length} badge(s) earned">${badgePills}</div>`
                    : '';

                return `
                    <div class="leaderboard-student-row d-flex justify-content-between align-items-center p-3 rounded-3 gap-3">
                        <div class="d-flex align-items-center gap-3 min-w-0">
                            ${rankBadgeHtml}
                            ${avatarHtml}
                            <div class="text-truncate">
                                <div class="fw-bold text-dark leaderboard-student-name text-truncate">${r.name}</div>
                                <div class="d-flex align-items-center gap-2 mt-0.5">
                                    <span class="badge bg-light text-secondary border px-2 py-0.5 rounded-pill micro-text font-monospace">${r.idNumber || '—'}</span>
                                </div>
                            </div>
                        </div>
                        <div class="d-flex align-items-center gap-2 gap-md-3 flex-shrink-0">
                            ${badgeTrayHtml}
                            <div class="d-flex flex-column align-items-end justify-content-center gap-1">
                                <span class="leaderboard-points-pill px-3 py-1 rounded-pill fw-bold d-inline-flex align-items-center gap-1.5 shadow-xs">
                                    <i class="bi bi-stars text-warning"></i>
                                    <span>${r.points}</span>
                                    <span class="micro-text opacity-75">pts</span>
                                </span>
                                <span class="leaderboard-count-pill text-muted d-inline-flex align-items-center gap-1 px-1">
                                    <i class="bi bi-award text-secondary"></i>
                                    <span>${r.badgeCount} badge${r.badgeCount === 1 ? '' : 's'}</span>
                                </span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            console.error('loadLeaderboard error:', err);
            sectionLeaderboardList.innerHTML = '<p class="text-danger small py-3 text-center mb-0">Could not load leaderboard.</p>';
        }
    }

    // =========================================================================
    // 7. Badges Catalog & Awarding (Live Backend API)
    // =========================================================================
    async function loadBadgeCatalog() {
        if (!badgesSelectionGrid) return;
        badgesSelectionGrid.innerHTML = '<p class="text-muted small col-12">Loading available badges...</p>';

        try {
            const data = await authedFetch('/api/badges/catalog', token);
            if (!data.success || !Array.isArray(data.badges)) {
                badgesSelectionGrid.innerHTML = '<p class="text-danger small col-12">Failed to load badge catalog.</p>';
                return;
            }

            badgeCatalog = data.badges;
            badgesSelectionGrid.innerHTML = '';
            if (systemBadgesGrid) {
                systemBadgesGrid.innerHTML = '';
            }

            const teacherBadges = [];
            const systemBadges = [];

            badgeCatalog.forEach(b => {
                if (isSystemAutomatedBadge(b)) {
                    systemBadges.push(b);
                } else {
                    teacherBadges.push(b);
                }
            });

            // Specific bottom order: 1. Completed Grades, 2. Honor Student, 3. Early Bird, 4. Perfect Attendance
            const bottomOrder = [
                'completed_grades', 'completed_grade',
                'honor_student', 'honor_students',
                'early_bird',
                'perfect_attendance'
            ];
            systemBadges.sort((a, b) => {
                const idA = String(a.id || '').toLowerCase();
                const idB = String(b.id || '').toLowerCase();
                const nameA = String(a.name || '').toLowerCase();
                const nameB = String(b.name || '').toLowerCase();
                const idxA = bottomOrder.findIndex(k => idA.includes(k) || nameA.includes(k.replace('_', ' ')));
                const idxB = bottomOrder.findIndex(k => idB.includes(k) || nameB.includes(k.replace('_', ' ')));
                return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
            });

            // 1. Render teacher-awardable badges (in main grid)
            teacherBadges.forEach(badge => {
                const meta = BADGE_METADATA[badge.id] || {};
                const iconDisplay = meta.icon || badge.symbol || '⭐';
                const badgeTitle = meta.title || badge.name || badge.id;
                const points = badge.points || meta.points || 100;
                const iconBg = meta.bg || badge.bg || '#fef2cb';
                const iconColor = meta.color || badge.color || '#b27a00';

                const col = document.createElement('div');
                col.className = 'col';
                col.innerHTML = `
                    <div class="card badge-card text-center p-3 h-100 position-relative shadow-xs" data-badge-id="${badge.id}" tabindex="0" role="button">
                        <input type="checkbox" class="form-check-input badge-card-checkbox" id="chk_${badge.id}">
                        <div class="badge-icon-wrap mx-auto mb-2" style="background: ${iconBg}; color: ${iconColor}; font-size: 2rem;">
                            ${iconDisplay}
                        </div>
                        <div class="badge-name text-truncate" title="${badgeTitle}">${badgeTitle}</div>
                        <div class="badge-meta">+${points} pts</div>
                    </div>
                `;
                badgesSelectionGrid.appendChild(col);
            });

            // 2. Render System-Automated Badges in dedicated container below
            if (systemBadges.length > 0) {
                if (systemBadgesWrapper) {
                    systemBadgesWrapper.classList.remove('d-none');
                }
                const targetGrid = systemBadgesGrid || badgesSelectionGrid;
                systemBadges.forEach(badge => {
                    const meta = BADGE_METADATA[badge.id] || {};
                    const iconDisplay = meta.icon || badge.symbol || '⭐';
                    const badgeTitle = meta.title || badge.name || badge.id;
                    const points = badge.points || meta.points || 100;
                    const iconBg = meta.bg || badge.bg || '#fef2cb';
                    const iconColor = meta.color || badge.color || '#b27a00';

                    const col = document.createElement('div');
                    col.className = 'col';
                    col.innerHTML = `
                        <div class="card badge-card system-automated text-center p-3 h-100 position-relative shadow-xs" 
                             data-badge-id="${badge.id}" 
                             data-system-awarded="true"
                             title="Automated Badge: Awarded directly by the system based on verified student records. Teachers cannot manually give this badge."
                             aria-disabled="true">
                            <span class="system-badge-pill" title="Automated by System">
                                <i class="bi bi-robot"></i> System
                            </span>
                            <div class="badge-icon-wrap mx-auto mb-2" style="background: ${iconBg}; color: ${iconColor}; font-size: 2rem;">
                                ${iconDisplay}
                            </div>
                            <div class="badge-name text-truncate" title="${badgeTitle}">${badgeTitle}</div>
                            <div class="badge-meta text-muted">+${points} pts</div>
                            <div class="badge-system-notice" title="Automatically granted by the system">
                                <i class="bi bi-cpu-fill me-1"></i>System-Awarded
                            </div>
                        </div>
                    `;
                    targetGrid.appendChild(col);
                });
            } else if (systemBadgesWrapper) {
                systemBadgesWrapper.classList.add('d-none');
            }

            // Card click toggle (only for teacher-awardable badges)
            badgesSelectionGrid.querySelectorAll('.badge-card').forEach(card => {
                if (card.dataset.systemAwarded === 'true' || isSystemAutomatedBadge({ id: card.dataset.badgeId })) {
                    // System automated badges cannot be selected or toggled
                    return;
                }

                card.addEventListener('click', (e) => {
                    const badgeId = card.dataset.badgeId;
                    const checkbox = card.querySelector('.badge-card-checkbox');
                    if (!checkbox) return;

                    if (e.target !== checkbox) {
                        checkbox.checked = !checkbox.checked;
                    }

                    if (checkbox.checked) {
                        selectedBadgeIds.add(badgeId);
                        card.classList.add('selected');
                    } else {
                        selectedBadgeIds.delete(badgeId);
                        card.classList.remove('selected');
                    }
                });
            });
        } catch (err) {
            console.error('loadBadgeCatalog error:', err);
        }
    }

    // Award Badge Mode Switcher Event Listeners
    if (btnModeSingleStudent) {
        btnModeSingleStudent.addEventListener('click', () => {
            badgeAwardMode = 'single';
            btnModeSingleStudent.classList.add('btn-success', 'shadow-xs');
            btnModeSingleStudent.classList.remove('btn-light', 'text-secondary');
            btnModeMultipleStudents.classList.remove('btn-success', 'shadow-xs');
            btnModeMultipleStudents.classList.add('btn-light', 'text-secondary');

            if (singleStudentSelectorWrapper) singleStudentSelectorWrapper.classList.remove('d-none');
            if (multipleStudentsSelectorWrapper) multipleStudentsSelectorWrapper.classList.add('d-none');

            // Restore recent activity for currently selected single student
            const studentId = studentSelectBadge ? studentSelectBadge.value : null;
            if (studentId) {
                loadActivity(studentId);
            }
        });
    }

    if (btnModeMultipleStudents) {
        btnModeMultipleStudents.addEventListener('click', () => {
            badgeAwardMode = 'multiple';
            btnModeMultipleStudents.classList.add('btn-success', 'shadow-xs');
            btnModeMultipleStudents.classList.remove('btn-light', 'text-secondary');
            btnModeSingleStudent.classList.remove('btn-success', 'shadow-xs');
            btnModeSingleStudent.classList.add('btn-light', 'text-secondary');

            if (singleStudentSelectorWrapper) singleStudentSelectorWrapper.classList.add('d-none');
            if (multipleStudentsSelectorWrapper) multipleStudentsSelectorWrapper.classList.remove('d-none');

            renderBadgeStudentsCheckboxList(currentRoster);
            updateMultiSelectActivityPreview();
        });
    }

    if (btnSelectAllStudentsBadge) {
        btnSelectAllStudentsBadge.addEventListener('click', () => {
            (currentRoster || []).forEach(s => selectedMultiStudentIds.add(String(s.id)));
            renderBadgeStudentsCheckboxList(currentRoster);
            updateMultiSelectActivityPreview();
        });
    }

    if (btnClearAllStudentsBadge) {
        btnClearAllStudentsBadge.addEventListener('click', () => {
            selectedMultiStudentIds.clear();
            renderBadgeStudentsCheckboxList(currentRoster);
            updateMultiSelectActivityPreview();
        });
    }

    if (badgeStudentSearchFilter) {
        badgeStudentSearchFilter.addEventListener('input', () => {
            if (btnClearBadgeStudentSearch) {
                btnClearBadgeStudentSearch.style.display = badgeStudentSearchFilter.value ? 'block' : 'none';
            }
            renderBadgeStudentsCheckboxList(currentRoster);
        });
    }

    if (btnClearBadgeStudentSearch) {
        btnClearBadgeStudentSearch.addEventListener('click', () => {
            badgeStudentSearchFilter.value = '';
            btnClearBadgeStudentSearch.style.display = 'none';
            renderBadgeStudentsCheckboxList(currentRoster);
        });
    }

    // Award Badge(s) Button Click (Supports Single and Multiple Students)
    if (btnAwardBadges) {
        btnAwardBadges.addEventListener('click', async () => {
            let targetStudentIds = [];

            if (badgeAwardMode === 'single') {
                const sId = studentSelectBadge ? studentSelectBadge.value : null;
                if (!sId) {
                    alert('Please select a student first.');
                    return;
                }
                targetStudentIds = [sId];
            } else {
                if (selectedMultiStudentIds.size === 0) {
                    alert('Please select at least one student from the list.');
                    return;
                }
                targetStudentIds = Array.from(selectedMultiStudentIds);
            }

            // Exclude any system automated badges
            const badgeIdsArray = Array.from(selectedBadgeIds).filter(id => !isSystemAutomatedBadge({ id }));

            if (!badgeIdsArray.length) {
                alert('Please select at least one teacher-awardable badge.');
                return;
            }

            btnAwardBadges.disabled = true;
            btnAwardBadges.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Awarding...';

            try {
                const res = await authedFetch('/api/badges/award', token, {
                    method: 'POST',
                    body: JSON.stringify({
                        studentIds: targetStudentIds,
                        badgeIds: badgeIdsArray
                    })
                });

                if (res.success) {
                    alert(`✅ Success: ${res.message || 'Badge(s) awarded successfully!'}`);

                    // Clear badge selections
                    selectedBadgeIds.clear();
                    badgesSelectionGrid.querySelectorAll('.badge-card').forEach(card => {
                        if (card.dataset.systemAwarded === 'true') return;
                        card.classList.remove('selected');
                        const cb = card.querySelector('.badge-card-checkbox');
                        if (cb) cb.checked = false;
                    });

                    // Clear multi-select student selections
                    selectedMultiStudentIds.clear();
                    renderBadgeStudentsCheckboxList(currentRoster);
                    updateMultiSelectActivityPreview();

                    // Refresh Section Leaderboard & Activity
                    const refreshPromises = [loadLeaderboard(currentSectionId)];
                    if (badgeAwardMode === 'single' && targetStudentIds[0]) {
                        refreshPromises.push(loadActivity(targetStudentIds[0]));
                    }
                    await Promise.all(refreshPromises);
                } else {
                    alert(`❌ Error: ${res.message || 'Could not award badge.'}`);
                }
            } catch (err) {
                console.error('Award badge error:', err);
                alert('An error occurred while awarding badges. Please try again.');
            } finally {
                btnAwardBadges.disabled = false;
                btnAwardBadges.innerHTML = 'Award Badge(s)';
            }
        });
    }

    if (btnCancelAction) {
        btnCancelAction.addEventListener('click', () => {
            selectedBadgeIds.clear();
            if (badgesSelectionGrid) {
                badgesSelectionGrid.querySelectorAll('.badge-card').forEach(card => {
                    card.classList.remove('selected');
                    const cb = card.querySelector('.badge-card-checkbox');
                    if (cb) cb.checked = false;
                });
            }
            selectedMultiStudentIds.clear();
            renderBadgeStudentsCheckboxList(currentRoster);
            updateMultiSelectActivityPreview();
            const giveBadgesSection = document.getElementById('giveBadgesSection');
            if (giveBadgesSection) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }

    // =========================================================================
    // 8. Recent Activity Stream (Live Backend API)
    // =========================================================================
    async function loadActivity(studentId) {
        if (!activityTimeline) return;
        activityTimeline.innerHTML = '<p class="text-muted small py-2">Loading activity...</p>';

        try {
            const data = await authedFetch(`/api/badges/student/${studentId}`, token);
            if (!data.success || !Array.isArray(data.activity)) {
                activityTimeline.innerHTML = '<p class="text-muted small py-2">No activity records found.</p>';
                return;
            }

            if (!data.activity.length) {
                activityTimeline.innerHTML = `
                    <div class="text-center py-3 text-muted">
                        <i class="bi bi-clock-history d-block mb-1 fs-5 opacity-50"></i>
                        <p class="m-0 micro-text">No recent badges awarded yet for this student.</p>
                    </div>
                `;
                return;
            }

            activityTimeline.innerHTML = data.activity.map(item => {
                const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                }) : 'Recently';

                let iconChar = '⭐';
                let iconBg = '#d5ebd5';
                let iconColor = '#1f6e1f';
                for (const [key, meta] of Object.entries(BADGE_METADATA)) {
                    if (item.description && (item.description.toLowerCase().includes(meta.title.toLowerCase()) || item.description.toLowerCase().includes(key.toLowerCase()))) {
                        iconChar = meta.icon;
                        iconBg = meta.bg;
                        iconColor = meta.color;
                        break;
                    }
                }

                return `
                    <div class="timeline-item d-flex gap-3 align-items-start position-relative">
                        <div class="badge-icon-status flex-shrink-0 rounded-circle d-flex align-items-center justify-content-center shadow-xs" style="width: 34px; height: 34px; background: ${iconBg}; color: ${iconColor}; font-size: 1.15rem; border: 1px solid rgba(0,0,0,0.06);">
                            ${iconChar}
                        </div>
                        <div>
                            <p class="m-0 text-sm text-dark">${item.description}</p>
                            <span class="micro-text text-muted">${dateStr}</span>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            console.error('loadActivity error:', err);
            activityTimeline.innerHTML = '<p class="text-muted small py-2">Could not load activity.</p>';
        }
    }

    if (studentSelectBadge) {
        studentSelectBadge.addEventListener('change', (e) => {
            const studentId = e.target.value;
            if (studentId) {
                loadActivity(studentId);
            }
            const previewSpan = document.getElementById('resetScopeStudentName');
            if (previewSpan && studentSelectBadge.selectedOptions[0]) {
                previewSpan.textContent = studentSelectBadge.selectedOptions[0].textContent;
            }
        });
    }

    // =========================================================================
    // 9. Teacher Term Badges Reset (Live Backend API)
    // =========================================================================
    const btnConfirmTeacherResetBadges = document.getElementById('btnConfirmTeacherResetBadges');
    const teacherResetScopeSelect = document.getElementById('teacherResetScopeSelect');
    const teacherResetModalEl = document.getElementById('teacherResetBadgesModal');

    if (btnConfirmTeacherResetBadges) {
        btnConfirmTeacherResetBadges.addEventListener('click', async () => {
            const scope = teacherResetScopeSelect ? teacherResetScopeSelect.value : 'selected';
            const studentId = studentSelectBadge ? studentSelectBadge.value : null;

            btnConfirmTeacherResetBadges.disabled = true;
            btnConfirmTeacherResetBadges.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Resetting...';

            try {
                const res = await authedFetch('/api/badges/reset', token, {
                    method: 'POST',
                    body: JSON.stringify({
                        scope,
                        studentId: scope === 'selected' ? studentId : null,
                        sectionId: scope === 'section' ? currentSectionId : null
                    })
                });

                if (res.success) {
                    alert(`✅ ${res.message || 'Badges have been reset for the new term.'}`);
                    if (teacherResetModalEl && typeof bootstrap !== 'undefined') {
                        const modalInstance = bootstrap.Modal.getInstance(teacherResetModalEl);
                        if (modalInstance) modalInstance.hide();
                    }
                    if (studentId) loadActivity(studentId);
                    loadLeaderboard(currentSectionId);
                } else {
                    alert(`❌ Error: ${res.message || 'Could not reset badges.'}`);
                }
            } catch (err) {
                console.error('Reset badges error:', err);
                alert('Could not complete term reset.');
            } finally {
                btnConfirmTeacherResetBadges.disabled = false;
                btnConfirmTeacherResetBadges.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i> Confirm & Reset for New Term';
            }
        });
    }

    // =========================================================================
    // 10. Enter Grades Multi-Table Matrix & Subjects (DepEd DO 15 Architecture)
    // =========================================================================
    let activeGradeBreakdown = {
        wwCols: [
            { id: 'ww_1', label: 'WW 1', max: 20 },
            { id: 'ww_2', label: 'WW 2', max: 20 },
            { id: 'ww_3', label: 'WW 3', max: 20 },
            { id: 'ww_4', label: 'WW 4', max: 20 },
            { id: 'ww_5', label: 'WW 5', max: 20 }
        ],
        ptCols: [
            { id: 'pt_1', label: 'PT 1', max: 50 },
            { id: 'pt_2', label: 'PT 2', max: 50 },
            { id: 'pt_3', label: 'PT 3', max: 50 }
        ],
        qaCols: [
            { id: 'qa_1', label: '1st Summative (SA1)', max: 25 },
            { id: 'qa_2', label: '2nd Summative (SA2)', max: 25 },
            { id: 'qa_3', label: 'Term Exam (TE)', max: 50 }
        ],
        students: {}
    };

    function getActiveSubjectWeights() {
        const subId = encodeSubjectFilter ? encodeSubjectFilter.value : null;
        const sub = currentSubjects.find(s => String(s.id) === String(subId));
        if (sub) {
            return {
                ww: Math.round(Number(sub.ww_weight) || 20),
                pt: Math.round(Number(sub.pt_weight) || 50),
                qa: Math.round(Number(sub.qa_weight) || 30),
                name: sub.name,
                code: sub.code || '',
                classification: sub.classification || 'Core Subject'
            };
        }
        return { ww: 20, pt: 50, qa: 30, name: 'General Mathematics', code: 'GENMATH', classification: 'Core Subject' };
    }

    function getComponentActiveCols(type) {
        const cols = type === 'ww' ? activeGradeBreakdown.wwCols : (type === 'pt' ? activeGradeBreakdown.ptCols : activeGradeBreakdown.qaCols);
        const scoresKey = type === 'ww' ? 'wwScores' : (type === 'pt' ? 'ptScores' : 'qaScores');
        const students = Object.values(activeGradeBreakdown.students);

        // A column is active only if at least one student in the section has an entered score
        return cols.filter((col, idx) => {
            return students.some(st => {
                const s = st[scoresKey] && st[scoresKey][idx];
                return s !== '' && s !== null && s !== undefined && !isNaN(s);
            });
        });
    }

    function getComponentEffectiveHpsTotal(type) {
        const cols = type === 'ww' ? activeGradeBreakdown.wwCols : (type === 'pt' ? activeGradeBreakdown.ptCols : activeGradeBreakdown.qaCols);
        const activeCols = getComponentActiveCols(type);
        // If at least one column has scores, HPS total is strictly the sum of active columns!
        // Unscored / future columns are completely excluded from the denominator so students are not penalized.
        // If no columns have scores anywhere yet, fallback to sum of all columns for clean initial display.
        const targetCols = activeCols.length > 0 ? activeCols : cols;
        return targetCols.reduce((sum, c) => sum + (parseFloat(c.max) || 0), 0);
    }

    function recomputeStudentBreakdown(studentId, weights) {
        const st = activeGradeBreakdown.students[studentId];
        if (!st) return;

        // 1. Written Works (calculated against active columns only)
        const wwHpsTotal = getComponentEffectiveHpsTotal('ww');
        let wwSum = 0;
        let hasWwScore = false;
        (st.wwScores || []).forEach(v => {
            if (v !== '' && v !== null && v !== undefined && !isNaN(v)) {
                wwSum += parseFloat(v);
                hasWwScore = true;
            }
        });
        st.wwTotal = hasWwScore ? Math.round(wwSum * 100) / 100 : '';
        st.wwPs = hasWwScore && wwHpsTotal > 0 ? Math.round(((wwSum / wwHpsTotal) * 100) * 100) / 100 : '';
        if (st.wwWsManual !== undefined && st.wwWsManual !== '') {
            st.wwWs = parseFloat(st.wwWsManual);
            st.wwPs = weights.ww > 0 ? Math.round(((st.wwWs / weights.ww) * 100) * 100) / 100 : '';
        } else {
            st.wwWs = hasWwScore && wwHpsTotal > 0 ? Math.round(((st.wwPs / 100) * weights.ww) * 100) / 100 : '';
        }

        // 2. Performance Tasks (calculated against active columns only)
        const ptHpsTotal = getComponentEffectiveHpsTotal('pt');
        let ptSum = 0;
        let hasPtScore = false;
        (st.ptScores || []).forEach(v => {
            if (v !== '' && v !== null && v !== undefined && !isNaN(v)) {
                ptSum += parseFloat(v);
                hasPtScore = true;
            }
        });
        st.ptTotal = hasPtScore ? Math.round(ptSum * 100) / 100 : '';
        st.ptPs = hasPtScore && ptHpsTotal > 0 ? Math.round(((ptSum / ptHpsTotal) * 100) * 100) / 100 : '';
        if (st.ptWsManual !== undefined && st.ptWsManual !== '') {
            st.ptWs = parseFloat(st.ptWsManual);
            st.ptPs = weights.pt > 0 ? Math.round(((st.ptWs / weights.pt) * 100) * 100) / 100 : '';
        } else {
            st.ptWs = hasPtScore && ptHpsTotal > 0 ? Math.round(((st.ptPs / 100) * weights.pt) * 100) / 100 : '';
        }

        // 3. Summative Tests & Term Exam (calculated against active columns only)
        const qaHpsTotal = getComponentEffectiveHpsTotal('qa');
        let qaSum = 0;
        let hasQaScore = false;
        (st.qaScores || []).forEach(v => {
            if (v !== '' && v !== null && v !== undefined && !isNaN(v)) {
                qaSum += parseFloat(v);
                hasQaScore = true;
            }
        });
        st.qaTotal = hasQaScore ? Math.round(qaSum * 100) / 100 : '';
        st.qaPs = hasQaScore && qaHpsTotal > 0 ? Math.round(((qaSum / qaHpsTotal) * 100) * 100) / 100 : '';
        if (st.qaWsManual !== undefined && st.qaWsManual !== '') {
            st.qaWs = parseFloat(st.qaWsManual);
            st.qaPs = weights.qa > 0 ? Math.round(((st.qaWs / weights.qa) * 100) * 100) / 100 : '';
        } else {
            st.qaWs = hasQaScore && qaHpsTotal > 0 ? Math.round(((st.qaPs / 100) * weights.qa) * 100) / 100 : '';
        }

        // 4. Initial & Transmuted Final Grade
        const wWw = st.wwWs !== '' && st.wwWs !== undefined ? parseFloat(st.wwWs) : 0;
        const wPt = st.ptWs !== '' && st.ptWs !== undefined ? parseFloat(st.ptWs) : 0;
        const wQa = st.qaWs !== '' && st.qaWs !== undefined ? parseFloat(st.qaWs) : 0;
        const anyScoreEntered = hasWwScore || hasPtScore || hasQaScore || (st.wwWs !== '' && st.wwWs !== undefined) || (st.ptWs !== '' && st.ptWs !== undefined) || (st.qaWs !== '' && st.qaWs !== undefined);

        if (anyScoreEntered) {
            const initial = Math.min(100, Math.max(0, wWw + wPt + wQa));
            st.initial = Math.round(initial * 100) / 100;
            st.transmuted = transmuteDepEdGrade(initial);
            const desc = getDepEdDescriptor(st.transmuted);
            st.descriptor = desc.text;
            st.descriptorClass = desc.class;
            st.remarks = st.transmuted >= 75 ? 'Passed' : 'Failed';
        } else {
            st.initial = '';
            st.transmuted = '—';
            st.descriptor = 'Pending';
            st.descriptorClass = 'text-muted';
            st.remarks = 'Pending';
        }
    }

    function updateStudentDomAcrossAllTables(studentId, activeComp, weights) {
        const st = activeGradeBreakdown.students[studentId];
        if (!st) return;

        // 1. Update sub-table if activeComp specified
        if (activeComp) {
            const targetTableId = activeComp === 'ww' ? 'tbodyWrittenWorks' : (activeComp === 'pt' ? 'tbodyPerformanceTasks' : 'tbodyQuarterlyExams');
            const subRow = document.querySelector(`#${targetTableId} tr[data-student-id="${studentId}"]`);
            if (subRow) {
                const totalEl = subRow.querySelector(`.student-${activeComp}-total`);
                const psEl = subRow.querySelector(`.student-${activeComp}-ps`);
                const wsEl = subRow.querySelector(`.student-${activeComp}-ws`);
                const totalVal = activeComp === 'ww' ? st.wwTotal : (activeComp === 'pt' ? st.ptTotal : st.qaTotal);
                const psVal = activeComp === 'ww' ? st.wwPs : (activeComp === 'pt' ? st.ptPs : st.qaPs);
                const wsVal = activeComp === 'ww' ? st.wwWs : (activeComp === 'pt' ? st.ptWs : st.qaWs);

                if (totalEl) totalEl.textContent = totalVal !== '' ? totalVal : '—';
                if (psEl) psEl.textContent = psVal !== '' ? `${psVal}%` : '—';
                if (wsEl) wsEl.textContent = wsVal !== '' ? wsVal : '—';
            }
        }

        // 2. Synchronize Summary Row
        const sumRow = document.querySelector(`#gradeEncodingEntriesBody tr[data-student-id="${studentId}"]`);
        if (sumRow) {
            const qInput = sumRow.querySelector('.quiz-grade');
            const aInput = sumRow.querySelector('.activity-grade');
            const eInput = sumRow.querySelector('.exam-grade');
            const avgEl = sumRow.querySelector('.average-grade');
            const remEl = sumRow.querySelector('.remarks-text');

            if (qInput && document.activeElement !== qInput) qInput.value = (st.wwWs !== '' && st.wwWs !== undefined) ? st.wwWs : '';
            if (aInput && document.activeElement !== aInput) aInput.value = (st.ptWs !== '' && st.ptWs !== undefined) ? st.ptWs : '';
            if (eInput && document.activeElement !== eInput) eInput.value = (st.qaWs !== '' && st.qaWs !== undefined) ? st.qaWs : '';

            if (avgEl) {
                avgEl.textContent = st.transmuted;
                avgEl.className = `computed-avg-cell-box average-grade fw-bold ${st.transmuted !== '—' && Number(st.transmuted) >= 75 ? 'text-success' : (st.transmuted !== '—' ? 'text-danger' : 'text-primary')}`;
            }
            if (remEl) {
                remEl.textContent = st.descriptor;
                remEl.className = `px-3 py-2.5 remark-matrix-pill remarks-text ${st.descriptorClass}`;
            }
        }
    }

    async function saveSingleStudentGrade(studentId, weights) {
        const st = activeGradeBreakdown.students[studentId];
        if (!st) return;

        const sectionId = encodeSectionFilter ? encodeSectionFilter.value : currentSectionId;
        const subjectId = (encodeSubjectFilter && encodeSubjectFilter.value) ? encodeSubjectFilter.value : (currentSubjects[0] ? currentSubjects[0].id : 11);
        const term = encodeTermFilter ? encodeTermFilter.value : '1st';

        const quizVal = (st.wwWs !== '' && st.wwWs !== undefined) ? st.wwWs : '';
        const actVal = (st.ptWs !== '' && st.ptWs !== undefined) ? st.ptWs : '';
        const examVal = (st.qaWs !== '' && st.qaWs !== undefined) ? st.qaWs : '';

        const rawData = {
            wwCols: activeGradeBreakdown.wwCols,
            ptCols: activeGradeBreakdown.ptCols,
            qaCols: activeGradeBreakdown.qaCols,
            scores: {
                ww: st.wwScores || [],
                pt: st.ptScores || [],
                qa: st.qaScores || []
            },
            manual: {
                ww: st.wwWsManual !== undefined ? st.wwWsManual : '',
                pt: st.ptWsManual !== undefined ? st.ptWsManual : '',
                qa: st.qaWsManual !== undefined ? st.qaWsManual : ''
            }
        };

        try {
            const res = await authedFetch('/api/grades', token, {
                method: 'POST',
                body: JSON.stringify({
                    studentId,
                    subjectId,
                    sectionId,
                    term,
                    quiz: quizVal,
                    activity: actVal,
                    exam: examVal,
                    raw_scores: rawData
                })
            });

            if (res.success) {
                alert(`✅ Grade saved for ${st.name}!`);
                loadRoster(currentSectionId);
                loadGradeSheet();
            } else {
                alert(`❌ Error: ${res.message || 'Could not save grade.'}`);
            }
        } catch (err) {
            console.error('Save grade error:', err);
            alert('An error occurred while saving grade.');
        }
    }

    function showScoreConstraintNotice(inputEl, maxScore) {
        if (!inputEl) return;
        inputEl.classList.add('score-exceeded-pulse');
        const parentCell = inputEl.closest('td') || inputEl.parentNode;
        if (parentCell) {
            parentCell.style.position = 'relative';
            let badge = parentCell.querySelector('.score-constraint-badge');
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'score-constraint-badge';
                badge.textContent = `Max: ${maxScore}`;
                parentCell.appendChild(badge);
            } else {
                badge.textContent = `Max: ${maxScore}`;
            }
            clearTimeout(inputEl._badgeTimer);
            inputEl._badgeTimer = setTimeout(() => {
                inputEl.classList.remove('score-exceeded-pulse');
                if (badge && badge.parentNode) badge.remove();
            }, 1400);
        }
    }

    function renderSummaryGradeTable(weights) {
        if (!gradeTableBody) return;
        gradeTableBody.innerHTML = '';

        const students = Object.values(activeGradeBreakdown.students);
        if (!students.length) {
            gradeTableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No student grade records available for this section and subject.</td></tr>';
            return;
        }

        students.forEach(st => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-student-id', st.studentId);
            tr.setAttribute('data-student-name', st.name || '');

            const isPassed = st.transmuted !== '—' && Number(st.transmuted) >= 75;
            const avgClass = st.transmuted !== '—' ? (isPassed ? 'text-success' : 'text-danger') : 'text-primary';

            const gwaNum = st.gwa !== null && st.gwa !== undefined && !isNaN(Number(st.gwa)) ? Number(st.gwa) : null;
            let gwaText = '—';
            let gwaBoxClass = 'gwa-pending';
            let gwaTitle = 'No grades recorded across subjects yet';

            if (gwaNum !== null && gwaNum > 0) {
                gwaText = gwaNum.toFixed(1);
                const isGwaPassed = gwaNum >= 75;
                gwaBoxClass = isGwaPassed ? 'gwa-pass' : 'gwa-fail';
                gwaTitle = `Overall General Weighted Average (All subjects): ${gwaText} (${isGwaPassed ? 'Passed' : 'For Intervention'})`;
            }

            tr.innerHTML = `
                <td class="px-3 py-2.5 text-start text-secondary tracking-sm">${escapeHtml(st.idNumber || st.studentId)}</td>
                <td class="px-3 py-2.5 text-start text-dark fw-medium">
                    <div>${escapeHtml(st.name)}</div>
                    ${gwaNum !== null && gwaNum > 0 ? `<div class="micro-text text-muted" style="font-size:0.75rem;">GWA: <span class="fw-bold ${gwaNum >= 75 ? 'text-success' : 'text-danger'}">${gwaText}</span></div>` : ''}
                </td>
                <td class="px-2 py-2.5 text-center">
                    <input type="number" class="form-control grade-input-cell quiz-grade" value="${st.wwWs !== undefined && st.wwWs !== '' ? st.wwWs : ''}" min="0" max="${weights.ww}" step="0.01" placeholder="0">
                </td>
                <td class="px-2 py-2.5 text-center">
                    <input type="number" class="form-control grade-input-cell activity-grade" value="${st.ptWs !== undefined && st.ptWs !== '' ? st.ptWs : ''}" min="0" max="${weights.pt}" step="0.01" placeholder="0">
                </td>
                <td class="px-2 py-2.5 text-center">
                    <input type="number" class="form-control grade-input-cell exam-grade" value="${st.qaWs !== undefined && st.qaWs !== '' ? st.qaWs : ''}" min="0" max="${weights.qa}" step="0.01" placeholder="0">
                </td>
                <td class="px-2 py-2.5 text-center">
                    <div class="computed-avg-cell-box average-grade fw-bold ${avgClass}">${st.transmuted}</div>
                </td>
                <td class="px-2 py-2.5 text-center">
                    <div class="gwa-avg-cell-box ${gwaBoxClass}" title="${gwaTitle}">${gwaText}</div>
                </td>
                <td class="px-3 py-2.5 remark-matrix-pill remarks-text ${st.descriptorClass}">${st.descriptor}</td>
                <td class="px-3 py-2.5 text-center">
                    <button class="btn btn-link p-0 fs-5 save-record-floppy-btn" title="Save This Student's Grade">
                        <i class="bi bi-floppy-fill text-success"></i>
                    </button>
                </td>
            `;

            // Live score input in summary table with constraint checking
            tr.querySelectorAll('.grade-input-cell').forEach(inp => {
                inp.addEventListener('input', (e) => {
                    const row = e.target.closest('tr');
                    const studentId = row.getAttribute('data-student-id');
                    const curSt = activeGradeBreakdown.students[studentId];
                    if (!curSt) return;

                    const maxLimit = parseFloat(e.target.getAttribute('max')) || 100;
                    let val = e.target.value.trim();
                    if (val !== '') {
                        let num = parseFloat(val);
                        if (num > maxLimit) {
                            num = maxLimit;
                            e.target.value = maxLimit;
                            showScoreConstraintNotice(e.target, maxLimit);
                        } else if (num < 0) {
                            num = 0;
                            e.target.value = 0;
                        }
                    }

                    curSt.wwWsManual = row.querySelector('.quiz-grade').value.trim();
                    curSt.ptWsManual = row.querySelector('.activity-grade').value.trim();
                    curSt.qaWsManual = row.querySelector('.exam-grade').value.trim();

                    recomputeStudentBreakdown(studentId, weights);
                    updateStudentDomAcrossAllTables(studentId, null, weights);
                });
            });

            // Floppy button
            const saveBtn = tr.querySelector('.save-record-floppy-btn');
            if (saveBtn) {
                saveBtn.addEventListener('click', async () => {
                    if (saveBtn.disabled) return;
                    saveBtn.disabled = true;
                    const origHtml = saveBtn.innerHTML;
                    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm text-success" style="width: 1rem; height: 1rem;"></span>';
                    try {
                        await saveSingleStudentGrade(st.studentId, weights);
                    } finally {
                        saveBtn.disabled = false;
                        saveBtn.innerHTML = origHtml;
                    }
                });
            }

            gradeTableBody.appendChild(tr);
        });
    }

    function renderComponentGradeTable(type, weights) {
        const theadEl = document.getElementById(type === 'ww' ? 'theadWrittenWorks' : (type === 'pt' ? 'theadPerformanceTasks' : 'theadQuarterlyExams'));
        const tbodyEl = document.getElementById(type === 'ww' ? 'tbodyWrittenWorks' : (type === 'pt' ? 'tbodyPerformanceTasks' : 'tbodyQuarterlyExams'));
        if (!theadEl || !tbodyEl) return;

        const cols = type === 'ww' ? activeGradeBreakdown.wwCols : (type === 'pt' ? activeGradeBreakdown.ptCols : activeGradeBreakdown.qaCols);
        const compWeight = type === 'ww' ? weights.ww : (type === 'pt' ? weights.pt : weights.qa);
        const scoresKey = type === 'ww' ? 'wwScores' : (type === 'pt' ? 'ptScores' : 'qaScores');
        const totalKey = type === 'ww' ? 'wwTotal' : (type === 'pt' ? 'ptTotal' : 'qaTotal');
        const psKey = type === 'ww' ? 'wwPs' : (type === 'pt' ? 'ptPs' : 'qaPs');
        const wsKey = type === 'ww' ? 'wwWs' : (type === 'pt' ? 'ptWs' : 'qaWs');

        const students = Object.values(activeGradeBreakdown.students);
        const isColActive = (colIdx) => {
            return students.some(st => {
                const s = st[scoresKey] && st[scoresKey][colIdx];
                return s !== '' && s !== null && s !== undefined && !isNaN(s);
            });
        };
        const hasAnyScoreInComp = cols.some((_, idx) => isColActive(idx));
        const hpsTotal = getComponentEffectiveHpsTotal(type);

        // Header with column edit & delete buttons, and smart active status
        theadEl.innerHTML = `
            <tr class="table-header-row text-center align-middle">
                <th class="px-3 py-2.5 text-start" style="width: 110px;">Student ID</th>
                <th class="px-3 py-2.5 text-start" style="min-width: 170px;">Learner's Name</th>
                ${cols.map((col, idx) => {
                    const active = isColActive(idx);
                    const isUpcoming = hasAnyScoreInComp && !active;
                    return `
                    <th class="px-2 py-2 text-center component-col-header ${isUpcoming ? 'opacity-75' : ''}" style="min-width: 95px;" data-comp="${type}" data-col-idx="${idx}">
                        <div class="d-flex flex-column align-items-center justify-content-center">
                            <div class="d-flex align-items-center justify-content-center gap-1 w-100">
                                <span class="col-title-text fw-bold text-truncate" style="max-width: 90px; cursor: pointer;" 
                                      data-comp="${type}" data-col-idx="${idx}" title="${escapeHtml(col.label)} (Click to edit)">
                                    ${escapeHtml(col.label)}
                                </span>
                                <div class="col-action-btns d-inline-flex align-items-center ms-0.5">
                                    <button type="button" class="btn btn-link p-0 btn-edit-col" 
                                            data-comp="${type}" data-col-idx="${idx}" title="Edit Name & Max Score">
                                        <i class="bi bi-pencil-fill"></i>
                                    </button>
                                    <button type="button" class="btn btn-link p-0 btn-delete-col ms-1" 
                                            data-comp="${type}" data-col-idx="${idx}" title="Delete Column">
                                        <i class="bi bi-trash3-fill"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="d-flex align-items-center justify-content-center mt-0.5">
                                <span class="micro-text text-muted">Max: <span class="col-max-label fw-semibold">${col.max}</span></span>
                                <span class="badge col-status-badge ms-1" style="display: ${isUpcoming ? 'inline-block' : 'none'};" 
                                      title="No scores entered yet — excluded from active grade calculations until scored">Unscored</span>
                            </div>
                        </div>
                    </th>`;
                }).join('')}
                <th class="px-2 py-2.5 text-center" style="min-width: 80px;">Total</th>
                <th class="px-2 py-2.5 text-center" style="min-width: 85px;">PS (%)</th>
                <th class="px-2 py-2.5 text-center" style="min-width: 90px;">WS (${compWeight}%)</th>
            </tr>
            <tr class="hps-header-row text-center align-middle">
                <td colspan="2" class="text-start px-3 py-2">
                    <i class="bi bi-award-fill text-success me-1"></i> <strong>HIGHEST POSSIBLE SCORE (HPS)</strong>
                </td>
                ${cols.map((col, idx) => `
                    <td class="px-2 py-1 text-center">
                        <input type="number" class="form-control form-control-sm hps-input m-auto" 
                               data-comp="${type}" data-col-idx="${idx}" value="${col.max}" min="1" step="1" title="Edit HPS for ${escapeHtml(col.label)}">
                    </td>
                `).join('')}
                <td class="px-2 py-1 text-center">
                    <span class="computed-cell computed-cell-total fw-bold" id="hps-total-${type}" title="Active HPS Total (Calculated only from scored activities)">${hpsTotal}</span>
                </td>
                <td class="px-2 py-1 text-center">
                    <span class="computed-cell computed-cell-ps fw-bold">100.0%</span>
                </td>
                <td class="px-2 py-1 text-center">
                    <span class="computed-cell computed-cell-ws fw-bold">${compWeight}%</span>
                </td>
            </tr>
        `;

        // Body
        tbodyEl.innerHTML = '';
        if (!students.length) {
            tbodyEl.innerHTML = `<tr><td colspan="${cols.length + 5}" class="text-center text-muted py-4">No student records available.</td></tr>`;
            return;
        }

        students.forEach(st => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-student-id', st.studentId);
            tr.className = 'align-middle';

            const userScores = st[scoresKey] || [];

            tr.innerHTML = `
                <td class="px-3 py-2.5 text-start text-secondary tracking-sm">${escapeHtml(st.idNumber || st.studentId)}</td>
                <td class="px-3 py-2.5 text-start text-dark fw-medium">${escapeHtml(st.name)}</td>
                ${cols.map((col, idx) => `
                    <td class="px-2 py-1 text-center">
                        <input type="number" class="form-control form-control-sm sub-activity-input m-auto ${type}-score-input"
                               data-comp="${type}" data-student-id="${st.studentId}" data-col-idx="${idx}"
                               value="${userScores[idx] !== undefined ? userScores[idx] : ''}"
                               min="0" max="${col.max}" step="0.5" placeholder="0">
                    </td>
                `).join('')}
                <td class="px-2 py-1 text-center">
                    <span class="computed-cell computed-cell-total student-${type}-total">${st[totalKey] !== '' ? st[totalKey] : '—'}</span>
                </td>
                <td class="px-2 py-1 text-center">
                    <span class="computed-cell computed-cell-ps student-${type}-ps">${st[psKey] !== '' ? st[psKey] + '%' : '—'}</span>
                </td>
                <td class="px-2 py-1 text-center">
                    <span class="computed-cell computed-cell-ws student-${type}-ws">${st[wsKey] !== '' ? st[wsKey] : '—'}</span>
                </td>
            `;

            tbodyEl.appendChild(tr);
        });

        // Wire Header Actions: Edit Column (Pencil icon or title click)
        theadEl.querySelectorAll('.btn-edit-col, .col-title-text').forEach(btn => {
            btn.addEventListener('click', () => {
                const comp = btn.getAttribute('data-comp');
                const colIdx = parseInt(btn.getAttribute('data-col-idx'), 10);
                openEditAssessmentModal(comp, colIdx);
            });
        });

        // Wire Header Actions: Delete Column
        theadEl.querySelectorAll('.btn-delete-col').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const comp = btn.getAttribute('data-comp');
                const colIdx = parseInt(btn.getAttribute('data-col-idx'), 10);
                deleteAssessmentColumn(comp, colIdx);
            });
        });

        // Wire sub-activity score inputs with strict max constraint and smart HPS recalculation
        tbodyEl.querySelectorAll('.sub-activity-input').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const comp = e.target.getAttribute('data-comp');
                const studentId = e.target.getAttribute('data-student-id');
                const colIdx = parseInt(e.target.getAttribute('data-col-idx'), 10);
                let val = e.target.value.trim();

                const st = activeGradeBreakdown.students[studentId];
                if (!st) return;

                const colsList = comp === 'ww' ? activeGradeBreakdown.wwCols : (comp === 'pt' ? activeGradeBreakdown.ptCols : activeGradeBreakdown.qaCols);
                const col = colsList[colIdx];
                const maxScore = col ? (parseFloat(col.max) || 100) : 100;

                // Constraint: Grade must NOT be more than maximum score and not less than 0
                if (val !== '') {
                    let num = parseFloat(val);
                    if (num > maxScore) {
                        num = maxScore;
                        e.target.value = maxScore;
                        showScoreConstraintNotice(e.target, maxScore);
                    } else if (num < 0) {
                        num = 0;
                        e.target.value = 0;
                    }
                    val = num;
                }

                const targetScores = comp === 'ww' ? (st.wwScores = st.wwScores || []) : (comp === 'pt' ? (st.ptScores = st.ptScores || []) : (st.qaScores = st.qaScores || []));
                while (targetScores.length <= colIdx) targetScores.push('');
                targetScores[colIdx] = val !== '' ? parseFloat(val) : '';

                if (comp === 'ww') st.wwWsManual = undefined;
                if (comp === 'pt') st.ptWsManual = undefined;
                if (comp === 'qa') st.qaWsManual = undefined;

                // Live recompute across all students so section-wide HPS denominator syncs instantly
                Object.keys(activeGradeBreakdown.students).forEach(stId => {
                    recomputeStudentBreakdown(stId, weights);
                    updateStudentDomAcrossAllTables(stId, comp, weights);
                });

                // Update HPS total badge in the header row
                const effectiveHps = getComponentEffectiveHpsTotal(comp);
                const hpsBadge = theadEl.querySelector(`#hps-total-${comp}`);
                if (hpsBadge) hpsBadge.textContent = effectiveHps;

                // Dynamically update unscored status badges for columns in this component
                const currentCols = comp === 'ww' ? activeGradeBreakdown.wwCols : (comp === 'pt' ? activeGradeBreakdown.ptCols : activeGradeBreakdown.qaCols);
                const scoresListKey = comp === 'ww' ? 'wwScores' : (comp === 'pt' ? 'ptScores' : 'qaScores');
                const anyScoreNow = currentCols.some((_, cIdx) => {
                    return Object.values(activeGradeBreakdown.students).some(s => {
                        const sc = s[scoresListKey] && s[scoresListKey][cIdx];
                        return sc !== '' && sc !== null && sc !== undefined && !isNaN(sc);
                    });
                });

                currentCols.forEach((_, cIdx) => {
                    const thEl = theadEl.querySelector(`.component-col-header[data-col-idx="${cIdx}"]`);
                    if (thEl) {
                        const badge = thEl.querySelector('.col-status-badge');
                        const colIsActive = Object.values(activeGradeBreakdown.students).some(s => {
                            const sc = s[scoresListKey] && s[scoresListKey][cIdx];
                            return sc !== '' && sc !== null && sc !== undefined && !isNaN(sc);
                        });
                        const colUpcoming = anyScoreNow && !colIsActive;
                        if (badge) badge.style.display = colUpcoming ? 'inline-block' : 'none';
                        if (colUpcoming) thEl.classList.add('opacity-75');
                        else thEl.classList.remove('opacity-75');
                    }
                });
            });

            // Double enforcement on blur / change
            inp.addEventListener('blur', (e) => {
                const comp = e.target.getAttribute('data-comp');
                const colIdx = parseInt(e.target.getAttribute('data-col-idx'), 10);
                const colsList = comp === 'ww' ? activeGradeBreakdown.wwCols : (comp === 'pt' ? activeGradeBreakdown.ptCols : activeGradeBreakdown.qaCols);
                const col = colsList[colIdx];
                const maxScore = col ? (parseFloat(col.max) || 100) : 100;
                if (e.target.value !== '' && parseFloat(e.target.value) > maxScore) {
                    e.target.value = maxScore;
                    e.target.dispatchEvent(new Event('input'));
                }
            });
        });

        // Wire HPS inputs in the header row
        theadEl.querySelectorAll('.hps-input').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const comp = e.target.getAttribute('data-comp');
                const colIdx = parseInt(e.target.getAttribute('data-col-idx'), 10);
                const newMax = Math.max(1, parseFloat(e.target.value) || 1);
                const colsList = comp === 'ww' ? activeGradeBreakdown.wwCols : (comp === 'pt' ? activeGradeBreakdown.ptCols : activeGradeBreakdown.qaCols);
                if (colsList[colIdx]) colsList[colIdx].max = newMax;

                // Update column max subtitle in th
                const thEl = theadEl.querySelector(`.component-col-header[data-col-idx="${colIdx}"]`);
                if (thEl) {
                    const maxLabel = thEl.querySelector('.col-max-label');
                    if (maxLabel) maxLabel.textContent = newMax;
                }

                const newHpsTotal = getComponentEffectiveHpsTotal(comp);
                const totalBadge = theadEl.querySelector(`#hps-total-${comp}`);
                if (totalBadge) totalBadge.textContent = newHpsTotal;

                // Update max attribute on all student inputs for this column AND clamp if any student's score exceeds newMax
                tbodyEl.querySelectorAll(`.sub-activity-input[data-col-idx="${colIdx}"]`).forEach(sinp => {
                    sinp.setAttribute('max', newMax);
                    if (sinp.value !== '' && parseFloat(sinp.value) > newMax) {
                        sinp.value = newMax;
                        showScoreConstraintNotice(sinp, newMax);
                    }
                });

                // Clamp scores in activeGradeBreakdown and recalculate
                const scoresKey = comp === 'ww' ? 'wwScores' : (comp === 'pt' ? 'ptScores' : 'qaScores');
                Object.keys(activeGradeBreakdown.students).forEach(stId => {
                    const st = activeGradeBreakdown.students[stId];
                    if (st && st[scoresKey] && st[scoresKey][colIdx] !== '' && st[scoresKey][colIdx] !== undefined && parseFloat(st[scoresKey][colIdx]) > newMax) {
                        st[scoresKey][colIdx] = newMax;
                    }
                    recomputeStudentBreakdown(stId, weights);
                    updateStudentDomAcrossAllTables(stId, comp, weights);
                });
            });
        });
    }

    function renderAllGradeTables(weights) {
        renderSummaryGradeTable(weights);
        renderComponentGradeTable('ww', weights);
        renderComponentGradeTable('pt', weights);
        renderComponentGradeTable('qa', weights);
    }

    function updateRosterSubjectBadge() {
        const badge = document.getElementById('rosterSubjectBadge');
        const badgeText = document.getElementById('rosterSubjectBadgeText');
        if (!badge || !badgeText) return;

        if (!currentSubjects.length) {
            badge.classList.add('d-none');
            return;
        }

        const selVal = filterSubject ? filterSubject.value : currentSubjectId;
        if (selVal === 'all') {
            badgeText.textContent = `All Subjects (${currentSubjects.length})`;
            badge.classList.remove('d-none');
        } else {
            const found = currentSubjects.find(s => String(s.id) === String(selVal));
            if (found) {
                badgeText.textContent = `${found.name} (${found.code || ''})`;
                badge.classList.remove('d-none');
            } else {
                badge.classList.add('d-none');
            }
        }
    }

    async function loadSubjects(sectionId) {
        const targetSec = (sectionId === 'all' || !sectionId) ? '' : sectionId;
        try {
            const data = await authedFetch(`/api/classes/my-subjects${targetSec ? `?sectionId=${targetSec}` : ''}`, token);
            if (data.success && data.subjects.length) {
                currentSubjects = data.subjects;
            } else {
                currentSubjects = [];
            }

            // 1. Populate top filter bar (filterSubject)
            if (filterSubject) {
                if (!currentSubjects.length) {
                    filterSubject.innerHTML = '<option value="">No subjects assigned</option>';
                    currentSubjectId = null;
                } else if (sectionId === 'all') {
                    let subHtml = `<option value="all">All Subjects Taught (${currentSubjects.length})</option>`;
                    subHtml += currentSubjects.map(sub => `
                        <option value="${sub.id}">${sub.name} (${sub.code || ''})</option>
                    `).join('');
                    filterSubject.innerHTML = subHtml;
                    currentSubjectId = 'all';
                    filterSubject.value = 'all';
                } else {
                    let subHtml = '';
                    if (currentSubjects.length > 1) {
                        subHtml += `<option value="all">All Subjects (${currentSubjects.length})</option>`;
                    }
                    subHtml += currentSubjects.map(sub => `
                        <option value="${sub.id}">${sub.name} (${sub.code || ''})</option>
                    `).join('');
                    filterSubject.innerHTML = subHtml;
                    currentSubjectId = currentSubjects[0].id;
                    filterSubject.value = currentSubjectId;
                }
            }

            // 2. Populate E-Class Record subject filter
            if (encodeSubjectFilter) {
                if (currentSubjects.length) {
                    encodeSubjectFilter.innerHTML = currentSubjects.map(sub => `
                        <option value="${sub.id}">${sub.name} (${sub.code || ''})</option>
                    `).join('');
                    if (currentSubjectId && currentSubjectId !== 'all') {
                        encodeSubjectFilter.value = currentSubjectId;
                    } else {
                        encodeSubjectFilter.value = currentSubjects[0].id;
                    }
                } else {
                    encodeSubjectFilter.innerHTML = '<option value="11">General Mathematics (GENMATH)</option>';
                    encodeSubjectFilter.value = '11';
                    currentSubjectId = '11';
                }
            }

            updateRosterSubjectBadge();
            await loadGradeSheet();
        } catch (err) {
            console.error('loadSubjects error:', err);
        }
    }

    async function loadGradeSheet() {
        if (!gradeTableBody) return;
        const sectionId = encodeSectionFilter ? encodeSectionFilter.value : currentSectionId;
        const subjectId = (encodeSubjectFilter && encodeSubjectFilter.value) ? encodeSubjectFilter.value : (currentSubjects[0] ? currentSubjects[0].id : 11);
        const term = encodeTermFilter ? encodeTermFilter.value : '1st';

        if (!sectionId || !subjectId) return;

        const weights = getActiveSubjectWeights();

        // Update headers and badges
        const thWw = document.getElementById('thWrittenWorks');
        const thPt = document.getElementById('thPerfTasks');
        const thQa = document.getElementById('thQuarterlyExam');
        if (thWw) thWw.innerHTML = `Written Works (${weights.ww}%)<br><span class="micro-text opacity-75" id="thWrittenWorksMax">/${weights.ww}</span>`;
        if (thPt) thPt.innerHTML = `Perf. Tasks (${weights.pt}%)<br><span class="micro-text opacity-75" id="thPerfTasksMax">/${weights.pt}</span>`;
        if (thQa) thQa.innerHTML = `Summative/Exam (${weights.qa}%)<br><span class="micro-text opacity-75" id="thQuarterlyExamMax">/${weights.qa}</span>`;

        document.querySelectorAll('.tab-ww-weight-label').forEach(el => el.textContent = `${weights.ww}%`);
        document.querySelectorAll('.tab-pt-weight-label').forEach(el => el.textContent = `${weights.pt}%`);
        document.querySelectorAll('.tab-qa-weight-label').forEach(el => el.textContent = `${weights.qa}%`);

        const activeCatEl = document.getElementById('activeCategoryWeightSummary');
        if (activeCatEl) {
            activeCatEl.innerHTML = `<i class="bi bi-info-circle text-primary me-1"></i> ${escapeHtml(weights.classification)} (${escapeHtml(weights.name || 'Subject')}) — WW: <strong>${weights.ww}%</strong> • PT: <strong>${weights.pt}%</strong> • QA: <strong>${weights.qa}%</strong>`;
        }

        gradeTableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4"><i class="bi bi-arrow-repeat me-2"></i>Loading grade records...</td></tr>';

        try {
            const data = await authedFetch(`/api/grades/roster?sectionId=${sectionId}&subjectId=${subjectId}&term=${encodeURIComponent(term)}`, token);
            if (!data.success || !Array.isArray(data.roster) || !data.roster.length) {
                gradeTableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No student grade records available for this section and subject.</td></tr>';
                return;
            }

            // Restore columns if saved raw_scores contain custom columns
            let foundRawCols = false;
            for (const s of data.roster) {
                let raw = s.raw_scores || s.rawScores;
                if (typeof raw === 'string') {
                    try { raw = JSON.parse(raw); } catch (e) { raw = null; }
                }
                if (raw && (raw.wwCols || raw.ptCols || raw.qaCols)) {
                    if (raw.wwCols && raw.wwCols.length) activeGradeBreakdown.wwCols = raw.wwCols;
                    if (raw.ptCols && raw.ptCols.length) activeGradeBreakdown.ptCols = raw.ptCols;
                    if (raw.qaCols && raw.qaCols.length) activeGradeBreakdown.qaCols = raw.qaCols;
                    foundRawCols = true;
                    break;
                }
            }

            // Defaults if not found
            if (!foundRawCols) {
                activeGradeBreakdown.wwCols = [
                    { id: 'ww_1', label: 'WW 1', max: 20 },
                    { id: 'ww_2', label: 'WW 2', max: 20 },
                    { id: 'ww_3', label: 'WW 3', max: 20 },
                    { id: 'ww_4', label: 'WW 4', max: 20 },
                    { id: 'ww_5', label: 'WW 5', max: 20 }
                ];
                activeGradeBreakdown.ptCols = [
                    { id: 'pt_1', label: 'PT 1', max: 50 },
                    { id: 'pt_2', label: 'PT 2', max: 50 },
                    { id: 'pt_3', label: 'PT 3', max: 50 }
                ];
                activeGradeBreakdown.qaCols = [
                    { id: 'qa_1', label: '1st Summative (SA1)', max: 25 },
                    { id: 'qa_2', label: '2nd Summative (SA2)', max: 25 },
                    { id: 'qa_3', label: 'Term Exam (TE)', max: 50 }
                ];
            }

            // Populate activeGradeBreakdown.students
            activeGradeBreakdown.students = {};
            data.roster.forEach(s => {
                let raw = s.raw_scores || s.rawScores;
                if (typeof raw === 'string') {
                    try { raw = JSON.parse(raw); } catch (e) { raw = null; }
                }

                const wwScores = (raw && raw.scores && Array.isArray(raw.scores.ww)) ? raw.scores.ww : [];
                const ptScores = (raw && raw.scores && Array.isArray(raw.scores.pt)) ? raw.scores.pt : [];
                const qaScores = (raw && raw.scores && Array.isArray(raw.scores.qa)) ? raw.scores.qa : [];

                const qVal = s.quiz_score !== undefined && s.quiz_score !== null ? s.quiz_score : (s.quiz !== undefined && s.quiz !== null ? s.quiz : null);
                const aVal = s.activity_score !== undefined && s.activity_score !== null ? s.activity_score : (s.activity !== undefined && s.activity !== null ? s.activity : null);
                const eVal = s.exam_score !== undefined && s.exam_score !== null ? s.exam_score : (s.exam !== undefined && s.exam !== null ? s.exam : null);

                const manual = raw && raw.manual ? raw.manual : {};
                const wwWsManual = (manual.ww !== undefined && manual.ww !== '') ? manual.ww : ((qVal !== null && qVal !== '') ? qVal : undefined);
                const ptWsManual = (manual.pt !== undefined && manual.pt !== '') ? manual.pt : ((aVal !== null && aVal !== '') ? aVal : undefined);
                const qaWsManual = (manual.qa !== undefined && manual.qa !== '') ? manual.qa : ((eVal !== null && eVal !== '') ? eVal : undefined);

                const stObj = {
                    studentId: s.studentId || s.id,
                    idNumber: s.idNumber || s.id_number || s.id || s.studentId,
                    name: s.name || `${s.first_name || ''} ${s.last_name || ''}`.trim(),
                    wwScores,
                    ptScores,
                    qaScores,
                    wwWsManual,
                    ptWsManual,
                    qaWsManual,
                    gwa: s.gwa !== undefined && s.gwa !== null ? Number(s.gwa) : null,
                    termGwa: s.termGwa !== undefined && s.termGwa !== null ? Number(s.termGwa) : null,
                    overallGwa: s.overallGwa !== undefined && s.overallGwa !== null ? Number(s.overallGwa) : null,
                };

                activeGradeBreakdown.students[stObj.studentId] = stObj;
                recomputeStudentBreakdown(stObj.studentId, weights);
            });

            // Render all 4 tables
            renderAllGradeTables(weights);

        } catch (err) {
            console.error('loadGradeSheet error:', err);
            gradeTableBody.innerHTML = '<tr><td colspan="9" class="text-center text-danger py-4">Could not load grade sheet.</td></tr>';
        }
    }

    if (encodeSubjectFilter) {
        encodeSubjectFilter.addEventListener('change', async () => {
            if (filterSubject) {
                filterSubject.value = encodeSubjectFilter.value;
                currentSubjectId = encodeSubjectFilter.value;
                updateRosterSubjectBadge();
            }
            await Promise.all([
                loadGradeSheet(),
                loadRoster(currentSectionId, encodeSubjectFilter.value)
            ]);
        });
    }
    if (encodeTermFilter) encodeTermFilter.addEventListener('change', loadGradeSheet);

    // =========================================================================
    // Assessment Column Management: Add, Edit, Delete & Constraints
    // =========================================================================
    function openAddAssessmentModal(type) {
        const modalEl = document.getElementById('modalAssessmentColumn');
        if (!modalEl) return;
        const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);

        const compTypeInput = document.getElementById('assessmentCompType');
        const colModeInput = document.getElementById('assessmentColMode');
        const colIndexInput = document.getElementById('assessmentColIndex');
        const titleInput = document.getElementById('assessmentTitleInput');
        const maxInput = document.getElementById('assessmentMaxInput');
        const modalLabel = document.getElementById('modalAssessmentColumnLabel');
        const modalSub = document.getElementById('modalAssessmentSub');
        const submitBtnText = document.getElementById('btnSubmitAssessmentText');
        const submitBtnIcon = document.getElementById('btnSubmitAssessmentIcon');
        const modalHeader = document.getElementById('modalAssessmentHeader');
        const modalIcon = document.getElementById('modalAssessmentIcon');

        if (compTypeInput) compTypeInput.value = type;
        if (colModeInput) colModeInput.value = 'add';
        if (colIndexInput) colIndexInput.value = -1;

        let defaultTitle = '';
        let defaultMax = 20;
        let compName = 'Written Work';
        let headerBgClass = 'bg-primary text-white';
        let iconClass = 'bi-pencil-square';

        if (type === 'ww') {
            const nextIdx = activeGradeBreakdown.wwCols.length + 1;
            defaultTitle = `WW ${nextIdx}`;
            defaultMax = 20;
            compName = 'Written Work';
            headerBgClass = 'bg-primary text-white';
            iconClass = 'bi-pencil-square';
        } else if (type === 'pt') {
            const nextIdx = activeGradeBreakdown.ptCols.length + 1;
            defaultTitle = `PT ${nextIdx}`;
            defaultMax = 50;
            compName = 'Performance Task';
            headerBgClass = 'bg-warning text-dark';
            iconClass = 'bi-palette-fill';
        } else if (type === 'qa') {
            const nextIdx = activeGradeBreakdown.qaCols.length + 1;
            defaultTitle = nextIdx <= 2 ? `${nextIdx === 1 ? '1st' : '2nd'} Summative (SA${nextIdx})` : (nextIdx === 3 ? 'Term Exam (TE)' : `Summative ${nextIdx - 1}`);
            defaultMax = 25;
            compName = 'Summative / Term Exam';
            headerBgClass = 'bg-info text-dark';
            iconClass = 'bi-file-earmark-check-fill';
        }

        if (modalLabel) modalLabel.textContent = `Add ${compName}`;
        if (modalSub) modalSub.textContent = `Specify the activity title and highest possible score`;
        if (titleInput) titleInput.value = defaultTitle;
        if (maxInput) maxInput.value = defaultMax;
        if (submitBtnText) submitBtnText.textContent = `Add ${compName} Column`;
        if (submitBtnIcon) submitBtnIcon.className = 'bi bi-plus-circle-fill me-1';

        if (modalHeader) modalHeader.className = `modal-header py-3 px-4 ${headerBgClass}`;
        if (modalIcon) modalIcon.className = `bi ${iconClass} fs-5`;

        bsModal.show();
        setTimeout(() => { if (titleInput) titleInput.select(); }, 350);
    }

    function openEditAssessmentModal(type, colIdx) {
        const modalEl = document.getElementById('modalAssessmentColumn');
        if (!modalEl) return;
        const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);

        const cols = type === 'ww' ? activeGradeBreakdown.wwCols : (type === 'pt' ? activeGradeBreakdown.ptCols : activeGradeBreakdown.qaCols);
        const col = cols[colIdx];
        if (!col) return;

        const compTypeInput = document.getElementById('assessmentCompType');
        const colModeInput = document.getElementById('assessmentColMode');
        const colIndexInput = document.getElementById('assessmentColIndex');
        const titleInput = document.getElementById('assessmentTitleInput');
        const maxInput = document.getElementById('assessmentMaxInput');
        const modalLabel = document.getElementById('modalAssessmentColumnLabel');
        const modalSub = document.getElementById('modalAssessmentSub');
        const submitBtnText = document.getElementById('btnSubmitAssessmentText');
        const submitBtnIcon = document.getElementById('btnSubmitAssessmentIcon');
        const modalHeader = document.getElementById('modalAssessmentHeader');
        const modalIcon = document.getElementById('modalAssessmentIcon');

        if (compTypeInput) compTypeInput.value = type;
        if (colModeInput) colModeInput.value = 'edit';
        if (colIndexInput) colIndexInput.value = colIdx;

        let compName = type === 'ww' ? 'Written Work' : (type === 'pt' ? 'Performance Task' : 'Summative Assessment');
        let headerBgClass = type === 'ww' ? 'bg-primary text-white' : (type === 'pt' ? 'bg-warning text-dark' : 'bg-info text-dark');
        let iconClass = 'bi-pencil-fill';

        if (modalLabel) modalLabel.textContent = `Edit ${compName} Details`;
        if (modalSub) modalSub.textContent = `Adjust the assessment name or maximum score`;
        if (titleInput) titleInput.value = col.label;
        if (maxInput) maxInput.value = col.max;
        if (submitBtnText) submitBtnText.textContent = 'Update Column';
        if (submitBtnIcon) submitBtnIcon.className = 'bi bi-check-circle-fill me-1';

        if (modalHeader) modalHeader.className = `modal-header py-3 px-4 ${headerBgClass}`;
        if (modalIcon) modalIcon.className = `bi ${iconClass} fs-5`;

        bsModal.show();
        setTimeout(() => { if (titleInput) titleInput.select(); }, 350);
    }

    function deleteAssessmentColumn(type, colIdx) {
        const cols = type === 'ww' ? activeGradeBreakdown.wwCols : (type === 'pt' ? activeGradeBreakdown.ptCols : activeGradeBreakdown.qaCols);
        if (!cols || !cols[colIdx]) return;

        if (cols.length <= 1) {
            alert('⚠️ At least one column is required for this grading component. You cannot delete the only remaining column.');
            return;
        }

        const col = cols[colIdx];
        const scoresKey = type === 'ww' ? 'wwScores' : (type === 'pt' ? 'ptScores' : 'qaScores');
        const weights = getActiveSubjectWeights();

        // Check if any student has an entered score for this column
        const hasScores = Object.values(activeGradeBreakdown.students).some(st => {
            const val = st[scoresKey] && st[scoresKey][colIdx];
            return val !== '' && val !== null && val !== undefined && !isNaN(val);
        });

        const confirmMsg = hasScores
            ? `Are you sure you want to delete "${col.label}"?\n\n⚠️ WARNING: Student scores have already been entered in this column. Deleting it will permanently remove all scores for this activity!`
            : `Are you sure you want to remove the column "${col.label}"?`;

        if (!confirm(confirmMsg)) return;

        // Remove column definition
        cols.splice(colIdx, 1);

        // Remove score at colIdx from each student
        Object.values(activeGradeBreakdown.students).forEach(st => {
            if (st[scoresKey] && st[scoresKey].length > colIdx) {
                st[scoresKey].splice(colIdx, 1);
            }
        });

        // Recalculate all students
        Object.keys(activeGradeBreakdown.students).forEach(stId => {
            recomputeStudentBreakdown(stId, weights);
        });

        // Re-render both component and summary tables
        renderComponentGradeTable(type, weights);
        renderSummaryGradeTable(weights);
    }

    // Modal Form Submit Listener
    const formAssessmentColumn = document.getElementById('formAssessmentColumn');
    if (formAssessmentColumn) {
        formAssessmentColumn.addEventListener('submit', (e) => {
            e.preventDefault();
            const type = document.getElementById('assessmentCompType').value;
            const mode = document.getElementById('assessmentColMode').value;
            const colIdx = parseInt(document.getElementById('assessmentColIndex').value, 10);
            const title = document.getElementById('assessmentTitleInput').value.trim();
            const maxScore = Math.max(1, parseFloat(document.getElementById('assessmentMaxInput').value) || 20);

            const cols = type === 'ww' ? activeGradeBreakdown.wwCols : (type === 'pt' ? activeGradeBreakdown.ptCols : activeGradeBreakdown.qaCols);
            const scoresKey = type === 'ww' ? 'wwScores' : (type === 'pt' ? 'ptScores' : 'qaScores');
            const weights = getActiveSubjectWeights();

            if (mode === 'add') {
                const newColId = `${type}_${Date.now()}`;
                cols.push({ id: newColId, label: title || `${type.toUpperCase()} ${cols.length + 1}`, max: maxScore });
                Object.values(activeGradeBreakdown.students).forEach(st => {
                    if (!st[scoresKey]) st[scoresKey] = [];
                    st[scoresKey].push('');
                });
            } else if (mode === 'edit' && colIdx >= 0 && cols[colIdx]) {
                cols[colIdx].label = title || cols[colIdx].label;
                cols[colIdx].max = maxScore;

                // Constraint: clamp any student scores that exceed the new max score
                Object.values(activeGradeBreakdown.students).forEach(st => {
                    if (st[scoresKey] && st[scoresKey][colIdx] !== '' && st[scoresKey][colIdx] !== null && st[scoresKey][colIdx] !== undefined) {
                        if (parseFloat(st[scoresKey][colIdx]) > maxScore) {
                            st[scoresKey][colIdx] = maxScore;
                        }
                    }
                });
            }

            // Recalculate all students
            Object.keys(activeGradeBreakdown.students).forEach(stId => {
                recomputeStudentBreakdown(stId, weights);
            });

            // Re-render
            renderComponentGradeTable(type, weights);
            renderSummaryGradeTable(weights);

            // Hide modal
            const modalEl = document.getElementById('modalAssessmentColumn');
            const bsModal = bootstrap.Modal.getInstance(modalEl);
            if (bsModal) bsModal.hide();
        });
    }

    // Dynamic Column Addition Listeners
    const btnAddWwColumn = document.getElementById('btnAddWwColumn');
    if (btnAddWwColumn) {
        btnAddWwColumn.addEventListener('click', () => {
            openAddAssessmentModal('ww');
        });
    }

    const btnAddPtColumn = document.getElementById('btnAddPtColumn');
    if (btnAddPtColumn) {
        btnAddPtColumn.addEventListener('click', () => {
            openAddAssessmentModal('pt');
        });
    }

    const btnAddQaColumn = document.getElementById('btnAddQaColumn');
    if (btnAddQaColumn) {
        btnAddQaColumn.addEventListener('click', () => {
            openAddAssessmentModal('qa');
        });
    }

    // Save All Grades Button
    if (btnSaveAllGradesNow) {
        btnSaveAllGradesNow.addEventListener('click', async () => {
            const sectionId = encodeSectionFilter ? encodeSectionFilter.value : currentSectionId;
            const subjectId = (encodeSubjectFilter && encodeSubjectFilter.value) ? encodeSubjectFilter.value : (currentSubjects[0] ? currentSubjects[0].id : 11);
            const term = encodeTermFilter ? encodeTermFilter.value : '1st';
            const students = Object.values(activeGradeBreakdown.students);

            if (!students.length) {
                alert('No students to save.');
                return;
            }

            btnSaveAllGradesNow.disabled = true;
            btnSaveAllGradesNow.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Saving All...';

            const gradesToSave = [];
            for (const st of students) {
                const quiz = st.wwWs !== '' && st.wwWs !== undefined ? Number(st.wwWs) : 0;
                const activity = st.ptWs !== '' && st.ptWs !== undefined ? Number(st.ptWs) : 0;
                const exam = st.qaWs !== '' && st.qaWs !== undefined ? Number(st.qaWs) : 0;
                const transmuted = st.transmuted !== '—' && !isNaN(Number(st.transmuted)) ? Number(st.transmuted) : (quiz + activity + exam);

                const hasScore = (st.wwScores && st.wwScores.some(v => v !== '' && v !== null && v !== undefined)) ||
                                 (st.ptScores && st.ptScores.some(v => v !== '' && v !== null && v !== undefined)) ||
                                 (st.qaScores && st.qaScores.some(v => v !== '' && v !== null && v !== undefined)) ||
                                 (st.wwWs !== '' && st.wwWs !== undefined) || (st.ptWs !== '' && st.ptWs !== undefined) || (st.qaWs !== '' && st.qaWs !== undefined);

                if (!hasScore) continue;

                gradesToSave.push({
                    studentId: st.studentId,
                    written_works: quiz,
                    performance_tasks: activity,
                    quarterly_assessment: exam,
                    average: transmuted,
                    raw_scores: {
                        wwCols: activeGradeBreakdown.wwCols,
                        ptCols: activeGradeBreakdown.ptCols,
                        qaCols: activeGradeBreakdown.qaCols,
                        scores: {
                            ww: st.wwScores || [],
                            pt: st.ptScores || [],
                            qa: st.qaScores || []
                        },
                        manual: {
                            ww: st.wwWsManual !== undefined ? st.wwWsManual : '',
                            pt: st.ptWsManual !== undefined ? st.ptWsManual : '',
                            qa: st.qaWsManual !== undefined ? st.qaWsManual : ''
                        }
                    }
                });
            }

            if (!gradesToSave.length) {
                btnSaveAllGradesNow.disabled = false;
                btnSaveAllGradesNow.innerHTML = '<i class="bi bi-floppy-fill"></i> Save All Grades';
                alert('No entered grades to save. Please type or import scores first.');
                return;
            }

            try {
                const res = await authedFetch('/api/classes/eclass-save', token, {
                    method: 'POST',
                    body: JSON.stringify({
                        sectionId,
                        subjectId,
                        term,
                        grades: gradesToSave
                    })
                });

                if (res.success) {
                    const savedCount = res.savedCount || gradesToSave.length;
                    alert(`✅ Successfully saved and synchronized grades for ${savedCount} student(s)!`);
                } else {
                    alert(`❌ Error: ${res.message || 'Could not save grades.'}`);
                }
            } catch (e) {
                console.error('Error saving all grades', e);
                alert('Failed to save grades. Please try again.');
            } finally {
                btnSaveAllGradesNow.disabled = false;
                btnSaveAllGradesNow.innerHTML = '<i class="bi bi-floppy-fill"></i> Save All Grades';
                loadGradeSheet();
                loadRoster(currentSectionId);
            }
        });
    }

    if (btnResetGrades) {
        btnResetGrades.addEventListener('click', () => {
            if (confirm("Reset current inputs to saved values?")) {
                loadGradeSheet();
            }
        });
    }

    // =========================================================================
    // 11. Navigation & Section Scrolling
    // =========================================================================
    if (btnGiveBadge) {
        btnGiveBadge.addEventListener('click', () => {
            const el = document.getElementById('giveBadgesSection');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    if (btnEncodeGrades) {
        btnEncodeGrades.addEventListener('click', () => {
            const el = document.getElementById('enterGradesSection');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // =========================================================================
    // 12. DepEd E-Class Record Dynamic Parser & Context Validation Modal
    // =========================================================================
    let pendingParsedData = null;
    const modalValidationEl = document.getElementById('modalECRValidation');
    let validationModalInstance = null;
    if (modalValidationEl && typeof bootstrap !== 'undefined') {
        validationModalInstance = new bootstrap.Modal(modalValidationEl);
    }

    const modalUploadEl = document.getElementById('modalUploadECR');
    let uploadModalInstance = null;
    if (modalUploadEl && typeof bootstrap !== 'undefined') {
        uploadModalInstance = new bootstrap.Modal(modalUploadEl);
    }

    function parseECRWorkbook(wb, fileName) {
        try {
            let gradeLevel = "11";
            let section = "Section";
            let strandTrack = "ACADEMIC";
            let subject = "Core Subject";
            let teacher = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : "Teacher";
            let schoolYear = "2026-2027";
            let term = "1st Term";
            let parsedStudents = [];

            // 1. Extract metadata from INPUT DATA sheet if available
            const inputSheet = wb.Sheets["INPUT DATA"];
            if (inputSheet) {
                if (inputSheet['F24'] && inputSheet['F24'].v) gradeLevel = String(inputSheet['F24'].v).trim();
                if (inputSheet['F25'] && inputSheet['F25'].v) section = String(inputSheet['F25'].v).trim();
                if (inputSheet['F23'] && inputSheet['F23'].v) strandTrack = String(inputSheet['F23'].v).trim();
                if (inputSheet['F26'] && inputSheet['F26'].v) subject = String(inputSheet['F26'].v).trim();
                if (inputSheet['F28'] && inputSheet['F28'].v) subject = String(inputSheet['F28'].v).trim();
                if (inputSheet['F22'] && inputSheet['F22'].v) teacher = String(inputSheet['F22'].v).trim();
                if (inputSheet['F16'] && inputSheet['F16'].v) schoolYear = String(inputSheet['F16'].v).trim();
            }

            // 2. Locate active term sheet
            const activeTermFilter = document.getElementById('encodeTermFilter');
            const termVal = activeTermFilter ? activeTermFilter.value : 't1';
            let termSheetCandidates = [];
            if (termVal === 't2' || termVal.includes('2')) {
                term = "2nd Term";
                termSheetCandidates = ['TERM 2', '2ND TERM', 'Quarter 2', '2ND QUARTER', 'TERM2', 'Q2'];
            } else if (termVal === 't3' || termVal.includes('3')) {
                term = "3rd Term";
                termSheetCandidates = ['TERM 3', '3RD TERM', 'Quarter 3', '3RD QUARTER', 'TERM3', 'Q3'];
            } else {
                term = "1st Term";
                termSheetCandidates = ['TERM 1', '1ST TERM', 'Quarter 1', '1ST QUARTER', 'TERM1', 'Q1'];
            }

            let termSheet = null;
            for (const name of termSheetCandidates) {
                if (wb.Sheets[name]) {
                    termSheet = wb.Sheets[name];
                    break;
                }
            }
            if (!termSheet) {
                termSheet = wb.Sheets['SUMMARY'] || wb.Sheets[wb.SheetNames.find(n => !n.includes('INSTRUCTION') && !n.includes('INPUT') && !n.includes('Helper'))] || wb.Sheets[wb.SheetNames[0]];
            }

            if (!termSheet || !termSheet['!ref']) {
                throw new Error("Unable to locate valid grading sheet in the workbook.");
            }

            // 3. Dynamic Column Locator (Scans header rows 1 to 25 across all columns)
            const range = XLSX.utils.decode_range(termSheet['!ref']);
            const maxHeaderRow = Math.min(range.e.r, 25);

            let wwStartCol = -1, ptStartCol = -1, qaStartCol = -1;
            let colInitial = -1, colTransmuted = -1, colLetter = -1;
            let colLearnerName = -1;
            let fileWwWeight = 20, filePtWeight = 50, fileQaWeight = 30;

            for (let r = range.s.r; r <= maxHeaderRow; r++) {
                for (let c = range.s.c; c <= range.e.c; c++) {
                    const cell = termSheet[XLSX.utils.encode_cell({ r, c })];
                    if (!cell || !cell.v) continue;
                    const text = String(cell.v).toUpperCase().trim();

                    if ((text.includes('LEARNER') || text.includes('STUDENT') || (text.includes('NAME') && !text.includes('SCHOOL'))) && colLearnerName === -1) {
                        colLearnerName = c;
                    }
                    if ((text.includes('WRITTEN') || text.includes('ORAL WORKS') || text === 'WW') && wwStartCol === -1) {
                        wwStartCol = c;
                        const m = text.match(/(\d{1,2})%/);
                        if (m) fileWwWeight = parseInt(m[1], 10);
                    }
                    if ((text.includes('PERFORMANCE') || text.includes('PRODUCT') || text === 'PT') && ptStartCol === -1) {
                        ptStartCol = c;
                        const m = text.match(/(\d{1,2})%/);
                        if (m) filePtWeight = parseInt(m[1], 10);
                    }
                    if ((text.includes('SUMMATIVE') || text.includes('QUARTERLY') || text.includes('TERM EXAM') || text.includes('EXAMINATION') || text === 'QA') && qaStartCol === -1) {
                        qaStartCol = c;
                        const m = text.match(/(\d{1,2})%/);
                        if (m) fileQaWeight = parseInt(m[1], 10);
                    }
                    if (text.includes('INITIAL') && colInitial === -1) {
                        colInitial = c;
                    }
                    if ((text.includes('TRANSMUTED') || text.includes('QUARTERLY GRADE') || text.includes('FINAL GRADE')) && colTransmuted === -1) {
                        colTransmuted = c;
                    }
                    if (text.includes('LETTER') && colLetter === -1) {
                        colLetter = c;
                    }
                }
            }

            // Defaults if not found dynamically
            if (colLearnerName === -1) colLearnerName = 1;
            if (wwStartCol === -1) wwStartCol = 5;
            if (ptStartCol === -1) ptStartCol = 13;
            if (qaStartCol === -1) qaStartCol = 19;
            if (colInitial === -1) colInitial = 25;
            if (colTransmuted === -1) colTransmuted = 26;
            if (colLetter === -1) colLetter = 27;

            function findSubColumn(startCol, endCol, label) {
                if (startCol === -1) return -1;
                const effectiveEnd = (endCol > startCol) ? endCol : (startCol + 15);
                for (let c = startCol; c <= effectiveEnd; c++) {
                    for (let r = range.s.r; r <= maxHeaderRow; r++) {
                        const cell = termSheet[XLSX.utils.encode_cell({ r, c })];
                        if (!cell || !cell.v) continue;
                        const t = String(cell.v).toUpperCase().trim();
                        if (t === label || t.startsWith(label + ' ') || t.startsWith(label + '(')) {
                            return c;
                        }
                    }
                }
                return -1;
            }

            let wwWsCol = findSubColumn(wwStartCol, ptStartCol - 1, 'WS');
            let ptWsCol = findSubColumn(ptStartCol, qaStartCol - 1, 'WS');
            let qaWsCol = findSubColumn(qaStartCol, colInitial - 1, 'WS');

            let wwPsCol = findSubColumn(wwStartCol, ptStartCol - 1, 'PS');
            let ptPsCol = findSubColumn(ptStartCol, qaStartCol - 1, 'PS');
            let qaPsCol = findSubColumn(qaStartCol, colInitial - 1, 'PS');

            if (wwWsCol === -1) wwWsCol = 12;
            if (ptWsCol === -1) ptWsCol = 18;
            if (qaWsCol === -1) qaWsCol = 24;

            const activeWeights = getActiveSubjectWeights();

            // Extract activity breakdown columns and HPS from rows 10 & 11
            const fileWwCols = [];
            const filePtCols = [];
            const fileQaCols = [];

            // Detect WW columns before Total
            const endWwCol = wwPsCol !== -1 ? (wwPsCol - 2) : (wwWsCol - 3);
            for (let c = wwStartCol; c <= endWwCol; c++) {
                const cell10 = termSheet[XLSX.utils.encode_cell({ r: 9, c })];
                const cell11 = termSheet[XLSX.utils.encode_cell({ r: 10, c })];
                const v10 = cell10 && cell10.v ? String(cell10.v).trim() : `${fileWwCols.length + 1}`;
                if (!v10.toUpperCase().includes('TOTAL') && !v10.toUpperCase().includes('PS') && !v10.toUpperCase().includes('WS')) {
                    const max = cell11 && cell11.v && !isNaN(Number(cell11.v)) ? Number(cell11.v) : 20;
                    fileWwCols.push({ col: c, id: `ww_${fileWwCols.length + 1}`, label: `WW ${v10}`, max });
                }
            }
            if (fileWwCols.length === 0) {
                for (let i = 0; i < 5; i++) {
                    const c = wwStartCol + i;
                    const cell11 = termSheet[XLSX.utils.encode_cell({ r: 10, c })];
                    const max = cell11 && cell11.v && !isNaN(Number(cell11.v)) ? Number(cell11.v) : 20;
                    fileWwCols.push({ col: c, id: `ww_${i + 1}`, label: `WW ${i + 1}`, max });
                }
            }

            // Detect PT columns before Total
            const endPtCol = ptPsCol !== -1 ? (ptPsCol - 2) : (ptWsCol - 3);
            for (let c = ptStartCol; c <= endPtCol; c++) {
                const cell10 = termSheet[XLSX.utils.encode_cell({ r: 9, c })];
                const cell11 = termSheet[XLSX.utils.encode_cell({ r: 10, c })];
                const v10 = cell10 && cell10.v ? String(cell10.v).trim() : `${filePtCols.length + 1}`;
                if (!v10.toUpperCase().includes('TOTAL') && !v10.toUpperCase().includes('PS') && !v10.toUpperCase().includes('WS')) {
                    const max = cell11 && cell11.v && !isNaN(Number(cell11.v)) ? Number(cell11.v) : 50;
                    filePtCols.push({ col: c, id: `pt_${filePtCols.length + 1}`, label: `PT ${v10}`, max });
                }
            }
            if (filePtCols.length === 0) {
                for (let i = 0; i < 3; i++) {
                    const c = ptStartCol + i;
                    const cell11 = termSheet[XLSX.utils.encode_cell({ r: 10, c })];
                    const max = cell11 && cell11.v && !isNaN(Number(cell11.v)) ? Number(cell11.v) : 50;
                    filePtCols.push({ col: c, id: `pt_${i + 1}`, label: `PT ${i + 1}`, max });
                }
            }

            // Detect QA columns (1st Summative, 2nd Summative, Term Exam)
            const endQaCol = qaPsCol !== -1 ? (qaPsCol - 2) : (qaWsCol - 3);
            for (let c = qaStartCol; c <= endQaCol; c++) {
                const cell10 = termSheet[XLSX.utils.encode_cell({ r: 9, c })];
                const cell11 = termSheet[XLSX.utils.encode_cell({ r: 10, c })];
                const v10 = cell10 && cell10.v ? String(cell10.v).trim() : '';
                if (v10 && !v10.toUpperCase().includes('TOTAL') && !v10.toUpperCase().includes('PS') && !v10.toUpperCase().includes('WS')) {
                    let label = v10;
                    if (v10.toUpperCase() === 'SA1') label = '1st Summative (SA1)';
                    else if (v10.toUpperCase() === 'SA2') label = '2nd Summative (SA2)';
                    else if (v10.toUpperCase() === 'TE') label = 'Term Exam (TE)';
                    const max = cell11 && cell11.v && !isNaN(Number(cell11.v)) ? Number(cell11.v) : (v10.toUpperCase() === 'TE' ? 50 : 25);
                    fileQaCols.push({ col: c, id: `qa_${fileQaCols.length + 1}`, label, max });
                }
            }
            if (fileQaCols.length === 0) {
                fileQaCols.push(
                    { col: qaStartCol, id: 'qa_1', label: '1st Summative (SA1)', max: 25 },
                    { col: qaStartCol + 1, id: 'qa_2', label: '2nd Summative (SA2)', max: 25 },
                    { col: qaStartCol + 2, id: 'qa_3', label: 'Term Exam (TE)', max: 50 }
                );
            }

            // 4. Extract student records
            const maleNames = [];
            const femaleNames = [];
            if (inputSheet) {
                for (let r = 11; r <= 60; r++) {
                    const m = inputSheet[`L${r}`];
                    if (m && m.v && String(m.v).trim() && String(m.v).trim() !== '0') {
                        maleNames.push({ no: r - 10, name: String(m.v).trim(), gender: 'M', row: 12 + (r - 10) });
                    }
                    const f = inputSheet[`O${r}`];
                    if (f && f.v && String(f.v).trim() && String(f.v).trim() !== '0') {
                        femaleNames.push({ no: r - 10, name: String(f.v).trim(), gender: 'F', row: 63 + (r - 10) });
                    }
                }
            }

            const rawRoster = [...maleNames, ...femaleNames];

            if (rawRoster.length > 0) {
                rawRoster.forEach((st, idx) => {
                    const rowNum = st.row;
                    
                    const transmutedCell = termSheet[XLSX.utils.encode_cell({ r: rowNum - 1, c: colTransmuted })] || termSheet[`${XLSX.utils.encode_col(colTransmuted)}${rowNum}`];
                    const letterCell = colLetter !== -1 ? (termSheet[XLSX.utils.encode_cell({ r: rowNum - 1, c: colLetter })] || termSheet[`${XLSX.utils.encode_col(colLetter)}${rowNum}`]) : null;
                    const wwWsCell = wwWsCol !== -1 ? (termSheet[XLSX.utils.encode_cell({ r: rowNum - 1, c: wwWsCol })] || termSheet[`${XLSX.utils.encode_col(wwWsCol)}${rowNum}`]) : null;
                    const ptWsCell = ptWsCol !== -1 ? (termSheet[XLSX.utils.encode_cell({ r: rowNum - 1, c: ptWsCol })] || termSheet[`${XLSX.utils.encode_col(ptWsCol)}${rowNum}`]) : null;
                    const qaWsCell = qaWsCol !== -1 ? (termSheet[XLSX.utils.encode_cell({ r: rowNum - 1, c: qaWsCol })] || termSheet[`${XLSX.utils.encode_col(qaWsCol)}${rowNum}`]) : null;

                    let ww = wwWsCell && wwWsCell.v !== undefined && wwWsCell.v !== '' ? parseFloat(wwWsCell.v) || 0 : 0;
                    let pt = ptWsCell && ptWsCell.v !== undefined && ptWsCell.v !== '' ? parseFloat(ptWsCell.v) || 0 : 0;
                    let qa = qaWsCell && qaWsCell.v !== undefined && qaWsCell.v !== '' ? parseFloat(qaWsCell.v) || 0 : 0;
                    let transmuted = transmutedCell && transmutedCell.v !== undefined && transmutedCell.v !== '' ? parseFloat(transmutedCell.v) || 0 : 0;

                    // Percentage score fallback if weighted score wasn't calculated in file
                    if (ww === 0 && wwPsCol !== -1) {
                        const psCell = termSheet[XLSX.utils.encode_cell({ r: rowNum - 1, c: wwPsCol })];
                        if (psCell && psCell.v) ww = ((parseFloat(psCell.v) || 0) / 100) * activeWeights.ww;
                    }
                    if (pt === 0 && ptPsCol !== -1) {
                        const psCell = termSheet[XLSX.utils.encode_cell({ r: rowNum - 1, c: ptPsCol })];
                        if (psCell && psCell.v) pt = ((parseFloat(psCell.v) || 0) / 100) * activeWeights.pt;
                    }
                    if (qa === 0 && qaPsCol !== -1) {
                        const psCell = termSheet[XLSX.utils.encode_cell({ r: rowNum - 1, c: qaPsCol })];
                        if (psCell && psCell.v) qa = ((parseFloat(psCell.v) || 0) / 100) * activeWeights.qa;
                    }

                    if (transmuted === 0 && (ww > 0 || pt > 0 || qa > 0)) {
                        transmuted = transmuteDepEdGrade(ww + pt + qa);
                    }

                    // Extract raw scores for activities
                    const rawWwScores = fileWwCols.map(colDef => {
                        const cell = termSheet[XLSX.utils.encode_cell({ r: rowNum - 1, c: colDef.col })];
                        return (cell && cell.v !== undefined && cell.v !== '' && !isNaN(cell.v)) ? Number(cell.v) : '';
                    });
                    const rawPtScores = filePtCols.map(colDef => {
                        const cell = termSheet[XLSX.utils.encode_cell({ r: rowNum - 1, c: colDef.col })];
                        return (cell && cell.v !== undefined && cell.v !== '' && !isNaN(cell.v)) ? Number(cell.v) : '';
                    });
                    const rawQaScores = fileQaCols.map(colDef => {
                        const cell = termSheet[XLSX.utils.encode_cell({ r: rowNum - 1, c: colDef.col })];
                        return (cell && cell.v !== undefined && cell.v !== '' && !isNaN(cell.v)) ? Number(cell.v) : '';
                    });

                    const descriptorObj = transmuted > 0 ? getDepEdDescriptor(transmuted) : { text: 'Pending', class: 'text-muted' };
                    const letterGrade = letterCell && letterCell.v ? String(letterCell.v).trim() : (transmuted > 0 ? getDepEdLetterGrade(transmuted) : '—');
                    const remarks = transmuted >= 75 ? "Passed" : (transmuted > 0 ? "Failed" : "Pending");

                    parsedStudents.push({
                        id: `2024-${12000 + idx + 1}`,
                        no: st.no,
                        name: st.name,
                        gender: st.gender,
                        ww: Math.round(ww * 100) / 100,
                        pt: Math.round(pt * 100) / 100,
                        qa: Math.round(qa * 100) / 100,
                        rawScores: { ww: rawWwScores, pt: rawPtScores, qa: rawQaScores },
                        grade: transmuted > 0 ? Math.round(transmuted) : 0,
                        letterGrade: letterGrade,
                        descriptor: descriptorObj.text,
                        remarks: remarks
                    });
                });
            }

            // Fallback: scan termSheet directly row by row (for general or custom sheet formats)
            if (parsedStudents.length === 0) {
                let count = 0;
                for (let r = 10; r <= range.e.r; r++) {
                    const nameCell = termSheet[XLSX.utils.encode_cell({ r, c: colLearnerName })] || termSheet['B' + (r + 1)] || termSheet['A' + (r + 1)];
                    if (!nameCell || !nameCell.v) continue;
                    const rawName = String(nameCell.v).trim();
                    if (!rawName || !isNaN(Number(rawName)) || rawName.toUpperCase().includes('MALE') || rawName.toUpperCase().includes('FEMALE') || rawName.toUpperCase().includes('TOTAL') || rawName.toUpperCase().includes('HIGHEST') || rawName.length < 3) continue;

                    count++;
                    const transmutedCell = termSheet[XLSX.utils.encode_cell({ r, c: colTransmuted })];
                    const wwWsCell = termSheet[XLSX.utils.encode_cell({ r, c: wwWsCol })];
                    const ptWsCell = termSheet[XLSX.utils.encode_cell({ r, c: ptWsCol })];
                    const qaWsCell = termSheet[XLSX.utils.encode_cell({ r, c: qaWsCol })];

                    let ww = wwWsCell && wwWsCell.v ? parseFloat(wwWsCell.v) || 0 : 0;
                    let pt = ptWsCell && ptWsCell.v ? parseFloat(ptWsCell.v) || 0 : 0;
                    let qa = qaWsCell && qaWsCell.v ? parseFloat(qaWsCell.v) || 0 : 0;
                    let transmuted = transmutedCell && transmutedCell.v ? parseFloat(transmutedCell.v) || 0 : 0;

                    if (transmuted === 0 && (ww > 0 || pt > 0 || qa > 0)) {
                        transmuted = transmuteDepEdGrade(ww + pt + qa);
                    }

                    const rawWwScores = fileWwCols.map(colDef => {
                        const cell = termSheet[XLSX.utils.encode_cell({ r, c: colDef.col })];
                        return (cell && cell.v !== undefined && cell.v !== '' && !isNaN(cell.v)) ? Number(cell.v) : '';
                    });
                    const rawPtScores = filePtCols.map(colDef => {
                        const cell = termSheet[XLSX.utils.encode_cell({ r, c: colDef.col })];
                        return (cell && cell.v !== undefined && cell.v !== '' && !isNaN(cell.v)) ? Number(cell.v) : '';
                    });
                    const rawQaScores = fileQaCols.map(colDef => {
                        const cell = termSheet[XLSX.utils.encode_cell({ r, c: colDef.col })];
                        return (cell && cell.v !== undefined && cell.v !== '' && !isNaN(cell.v)) ? Number(cell.v) : '';
                    });

                    const descriptorObj = transmuted > 0 ? getDepEdDescriptor(transmuted) : { text: 'Pending', class: 'text-muted' };

                    parsedStudents.push({
                        id: `2024-${12000 + count}`,
                        no: count,
                        name: rawName,
                        ww: Math.round(ww * 100) / 100,
                        pt: Math.round(pt * 100) / 100,
                        qa: Math.round(qa * 100) / 100,
                        rawScores: { ww: rawWwScores, pt: rawPtScores, qa: rawQaScores },
                        grade: transmuted > 0 ? Math.round(transmuted) : 0,
                        letterGrade: transmuted > 0 ? getDepEdLetterGrade(transmuted) : '—',
                        descriptor: descriptorObj.text,
                        remarks: transmuted >= 75 ? "Passed" : (transmuted > 0 ? "Failed" : "Pending")
                    });
                }
            }

            return {
                fileName: fileName || "Sample_Template.xlsm",
                gradeLevel, strandTrack, section, subject, teacher, schoolYear, term,
                fileWeights: { ww: fileWwWeight, pt: filePtWeight, qa: fileQaWeight },
                fileBreakdownCols: {
                    wwCols: fileWwCols.map(({ col, ...rest }) => rest),
                    ptCols: filePtCols.map(({ col, ...rest }) => rest),
                    qaCols: fileQaCols.map(({ col, ...rest }) => rest)
                },
                students: parsedStudents
            };
        } catch (e) {
            console.error("ECR Parse error:", e);
            return null;
        }
    }

    function presentValidationModal(data) {
        if (!data) return;
        pendingParsedData = data;

        const valGradeSection = document.getElementById('valGradeSection');
        const valStrandTrack = document.getElementById('valStrandTrack');
        const valTeacherName = document.getElementById('valTeacherName');
        const valSubjectArea = document.getElementById('valSubjectArea');
        const valSchoolYear = document.getElementById('valSchoolYear');
        const valLearnersCount = document.getElementById('valLearnersCount');
        const previewBody = document.getElementById('valPreviewTableBody');
        const validationStatusBadge = document.getElementById('validationStatusBadge');
        const contextValidationNotice = document.getElementById('contextValidationNotice');

        if (valGradeSection) valGradeSection.textContent = `Grade ${data.gradeLevel} - ${data.section}`;
        if (valStrandTrack) valStrandTrack.textContent = data.strandTrack;
        if (valTeacherName) valTeacherName.textContent = data.teacher;
        if (valSubjectArea) valSubjectArea.textContent = data.subject;
        if (valSchoolYear) valSchoolYear.textContent = `SY ${data.schoolYear} (${data.term})`;

        // Context Verification
        const selSecEl = document.getElementById('encodeSectionFilter');
        const selSubEl = document.getElementById('encodeSubjectFilter');
        const selSecText = selSecEl && selSecEl.selectedOptions[0] ? selSecEl.selectedOptions[0].text : '';
        const selSubText = selSubEl && selSubEl.selectedOptions[0] ? selSubEl.selectedOptions[0].text : '';

        const cleanFileSec = (data.section || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanSelSec = selSecText.toLowerCase().replace(/[^a-z0-9]/g, '');
        const secMatches = cleanFileSec && cleanSelSec && (cleanSelSec.includes(cleanFileSec) || cleanFileSec.includes(cleanSelSec));

        const cleanFileSub = (data.subject || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanSelSub = selSubText.toLowerCase().replace(/[^a-z0-9]/g, '');
        const subMatches = cleanFileSub && cleanSelSub && (cleanSelSub.includes(cleanFileSub) || cleanFileSub.includes(cleanSelSub));

        // Roster matching check
        let matchedCount = 0;
        if (currentRoster && currentRoster.length) {
            data.students.forEach(s => {
                const sTokens = s.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(t => t.length > 2);
                const matched = currentRoster.some(r => {
                    const rTokens = (r.name || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(t => t.length > 2);
                    return sTokens.some(tok => rTokens.includes(tok));
                });
                if (matched) matchedCount++;
            });
        }

        if (valLearnersCount) {
            valLearnersCount.innerHTML = `${data.students.length} Learners ${currentRoster && currentRoster.length ? `<span class="badge bg-light text-dark border ms-1">${matchedCount} in roster</span>` : ''}`;
        }

        if (validationStatusBadge) {
            if (secMatches && subMatches) {
                validationStatusBadge.innerHTML = '<span class="badge bg-success-subtle text-success border border-success-subtle py-1.5 px-3 rounded-pill fw-bold"><i class="bi bi-check-circle-fill me-1"></i> Exact Classroom Match</span>';
            } else {
                validationStatusBadge.innerHTML = '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle py-1.5 px-3 rounded-pill fw-bold"><i class="bi bi-exclamation-triangle-fill me-1"></i> Classroom Notice</span>';
            }
        }

        if (contextValidationNotice) {
            if (secMatches && subMatches) {
                contextValidationNotice.innerHTML = `
                    <div class="alert alert-success d-flex align-items-center gap-2.5 py-2.5 px-3 micro-text mb-3 rounded-2 shadow-xs">
                        <i class="bi bi-check2-circle fs-5 text-success flex-shrink-0"></i>
                        <div><strong>Ready to Sync:</strong> DepEd Excel record verified for <strong>${selSecText}</strong> • <strong>${selSubText}</strong>. All column coordinates and student scores have been validated.</div>
                    </div>`;
            } else {
                contextValidationNotice.innerHTML = `
                    <div class="alert alert-warning d-flex align-items-start gap-2.5 py-2.5 px-3 micro-text mb-3 rounded-2 shadow-xs">
                        <i class="bi bi-exclamation-triangle-fill fs-5 text-warning flex-shrink-0 mt-0.5"></i>
                        <div><strong>Classroom Parameter Notice:</strong> The file indicates Section <strong>"${data.section || '—'}"</strong> and Subject <strong>"${data.subject || '—'}"</strong>, while your active screen selection is <strong>"${selSecText || '—'}"</strong> (${selSubText || '—'}).<br>Confirming will map and synchronize these scores to the currently active class.</div>
                    </div>`;
            }
        }

        const activeWeights = getActiveSubjectWeights();

        if (previewBody) {
            previewBody.innerHTML = data.students.slice(0, 6).map((s, idx) => `
                <tr>
                    <td class="text-secondary tracking-sm">${idx + 1}</td>
                    <td class="fw-semibold text-dark">${s.name}</td>
                    <td class="text-center">${s.ww} <span class="micro-text text-muted">/${activeWeights.ww}</span></td>
                    <td class="text-center">${s.pt} <span class="micro-text text-muted">/${activeWeights.pt}</span></td>
                    <td class="text-center">${s.qa} <span class="micro-text text-muted">/${activeWeights.qa}</span></td>
                    <td class="text-center fw-bold ${s.grade >= 75 ? 'text-success' : 'text-danger'}">${s.grade} <span class="badge bg-light text-dark border ms-1">${s.letterGrade || ''}</span></td>
                    <td class="text-center"><span class="badge ${s.remarks === 'Passed' ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}">${s.remarks}</span></td>
                </tr>
            `).join('');
        }

        if (uploadModalInstance) uploadModalInstance.hide();
        if (validationModalInstance) validationModalInstance.show();
    }

    const dropzone = document.getElementById('ecrDropzone');
    const fileInput = document.getElementById('ecrFileInput');
    const btnBrowse = document.getElementById('btnBrowseFile');

    function processSelectedFile(file) {
        if (!file || typeof XLSX === 'undefined') return;
        const reader = new FileReader();
        reader.onload = function (e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const parsed = parseECRWorkbook(workbook, file.name);
            if (parsed) presentValidationModal(parsed);
            else alert("Could not extract student records from the selected file.");
        };
        reader.readAsArrayBuffer(file);
    }

    if (btnBrowse && fileInput) {
        btnBrowse.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
    }
    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-active'); });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-active'));
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('drag-active');
            if (e.dataTransfer.files.length) processSelectedFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) processSelectedFile(e.target.files[0]);
        });
    }

    // Load sample ECR button in upload modal
    const btnLoadSampleXlsm = document.getElementById('btnLoadSampleXlsm');
    if (btnLoadSampleXlsm) {
        btnLoadSampleXlsm.addEventListener('click', async () => {
            btnLoadSampleXlsm.disabled = true;
            btnLoadSampleXlsm.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Loading...';
            try {
                let resp = await fetch('/api/grades/template?format=xlsm');
                if (!resp.ok) {
                    resp = await fetch('ASSH 11 - 2-e-CLASS-RECORD.xlsm');
                }
                const buffer = await resp.arrayBuffer();
                const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
                const parsed = parseECRWorkbook(wb, 'ASSH 11 - 2-e-CLASS-RECORD.xlsm');
                if (parsed) {
                    presentValidationModal(parsed);
                } else {
                    alert('Could not parse sample file.');
                }
            } catch (err) {
                console.error('Failed to load sample xlsm:', err);
                alert('Could not load sample file. Please upload an ECR file manually.');
            } finally {
                btnLoadSampleXlsm.disabled = false;
                btnLoadSampleXlsm.innerHTML = '<i class="bi bi-lightning-charge-fill me-1"></i> Load ASSH 11 - 2 ECR Sample';
            }
        });
    }

    // Resilient Blank Template Download Handler (Static blob download with API fallback)
    const templateDownloadTargets = [
        { id: 'btnDownloadBlankTemplateMain', format: 'xlsm', filename: 'Sample_Template.xlsm' },
        { id: 'btnDownloadBlankTemplateModalXlsm', format: 'xlsm', filename: 'Sample_Template.xlsm' },
        { id: 'btnDownloadBlankTemplateModalXlsx', format: 'xlsx', filename: 'Sample_Template.xlsx' }
    ];

    templateDownloadTargets.forEach(({ id, format, filename }) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const originalHtml = btn.innerHTML;
            btn.classList.add('disabled');
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Downloading...';

            const candidates = [
                encodeURI(filename),
                `./${encodeURI(filename)}`,
                `../Teacher/${encodeURI(filename)}`,
                `/frontend/Teacher/${encodeURI(filename)}`,
                `/Teacher/${encodeURI(filename)}`
            ];

            let downloaded = false;
            for (const url of candidates) {
                try {
                    const resp = await fetch(url);
                    if (resp.ok) {
                        const blob = await resp.blob();
                        if (blob && blob.size > 1000) {
                            const blobUrl = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = blobUrl;
                            link.download = filename;
                            document.body.appendChild(link);
                            link.click();
                            setTimeout(() => {
                                document.body.removeChild(link);
                                URL.revokeObjectURL(blobUrl);
                            }, 1000);
                            downloaded = true;
                            break;
                        }
                    }
                } catch (err) {}
            }

            if (!downloaded && window.MENTORAE_CONFIG && window.MENTORAE_CONFIG.API_BASE_URL) {
                try {
                    const apiUrl = `${window.MENTORAE_CONFIG.API_BASE_URL}/api/grades/template?format=${format}`;
                    const resp = await fetch(apiUrl);
                    if (resp.ok) {
                        const blob = await resp.blob();
                        if (blob && blob.size > 1000) {
                            const blobUrl = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = blobUrl;
                            link.download = filename;
                            document.body.appendChild(link);
                            link.click();
                            setTimeout(() => {
                                document.body.removeChild(link);
                                URL.revokeObjectURL(blobUrl);
                            }, 1000);
                            downloaded = true;
                        }
                    }
                } catch (err) {}
            }

            if (!downloaded) {
                // Direct fallback link navigation
                const directLink = document.createElement('a');
                directLink.href = encodeURI(filename);
                directLink.download = filename;
                document.body.appendChild(directLink);
                directLink.click();
                setTimeout(() => document.body.removeChild(directLink), 500);
            }

            setTimeout(() => {
                btn.classList.remove('disabled');
                btn.innerHTML = originalHtml;
            }, 800);
        });
    });

    // Confirm & Apply ECR to Mentorae database
    const btnConfirmApplyECR = document.getElementById('btnConfirmApplyECR');
    if (btnConfirmApplyECR) {
        btnConfirmApplyECR.addEventListener('click', async () => {
            if (!pendingParsedData || !pendingParsedData.students || !pendingParsedData.students.length) {
                alert('No student records to apply.');
                return;
            }

            btnConfirmApplyECR.disabled = true;
            btnConfirmApplyECR.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Synchronizing...';

            try {
                const targetSubId = (encodeSubjectFilter && encodeSubjectFilter.value) ? encodeSubjectFilter.value : 1;
                const activeWeights = getActiveSubjectWeights();

                // Apply file columns to activeGradeBreakdown if present
                if (pendingParsedData.fileBreakdownCols) {
                    if (pendingParsedData.fileBreakdownCols.wwCols && pendingParsedData.fileBreakdownCols.wwCols.length) {
                        activeGradeBreakdown.wwCols = pendingParsedData.fileBreakdownCols.wwCols;
                    }
                    if (pendingParsedData.fileBreakdownCols.ptCols && pendingParsedData.fileBreakdownCols.ptCols.length) {
                        activeGradeBreakdown.ptCols = pendingParsedData.fileBreakdownCols.ptCols;
                    }
                    if (pendingParsedData.fileBreakdownCols.qaCols && pendingParsedData.fileBreakdownCols.qaCols.length) {
                        activeGradeBreakdown.qaCols = pendingParsedData.fileBreakdownCols.qaCols;
                    }
                }

                const gradesPayload = [];

                pendingParsedData.students.forEach(s => {
                    let matchedStudent = null;

                    if (currentRoster && currentRoster.length) {
                        const sTokens = s.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(t => t.length > 2);
                        matchedStudent = currentRoster.find(r => {
                            const rTokens = (r.name || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(t => t.length > 2);
                            return sTokens.some(tok => rTokens.includes(tok));
                        });
                    }

                    const targetStudentId = matchedStudent ? matchedStudent.id : s.id;
                    const studentName = matchedStudent ? matchedStudent.name : s.name;

                    const studentRaw = {
                        wwCols: activeGradeBreakdown.wwCols,
                        ptCols: activeGradeBreakdown.ptCols,
                        qaCols: activeGradeBreakdown.qaCols,
                        scores: {
                            ww: (s.rawScores && s.rawScores.ww) ? s.rawScores.ww : [],
                            pt: (s.rawScores && s.rawScores.pt) ? s.rawScores.pt : [],
                            qa: (s.rawScores && s.rawScores.qa) ? s.rawScores.qa : []
                        }
                    };

                    // Update memory state
                    if (!activeGradeBreakdown.students[targetStudentId]) {
                        activeGradeBreakdown.students[targetStudentId] = {
                            studentId: targetStudentId,
                            idNumber: matchedStudent ? (matchedStudent.idNumber || matchedStudent.id) : s.id,
                            name: studentName
                        };
                    }
                    const st = activeGradeBreakdown.students[targetStudentId];
                    st.wwScores = (s.rawScores && s.rawScores.ww) ? s.rawScores.ww : [];
                    st.ptScores = (s.rawScores && s.rawScores.pt) ? s.rawScores.pt : [];
                    st.qaScores = (s.rawScores && s.rawScores.qa) ? s.rawScores.qa : [];
                    st.wwWsManual = undefined;
                    st.ptWsManual = undefined;
                    st.qaWsManual = undefined;
                    recomputeStudentBreakdown(targetStudentId, activeWeights);

                    gradesPayload.push({
                        studentId: targetStudentId,
                        idNumber: matchedStudent ? (matchedStudent.idNumber || matchedStudent.id) : s.id,
                        name: studentName,
                        written_works: st.wwWs !== '' ? st.wwWs : s.ww,
                        performance_tasks: st.ptWs !== '' ? st.ptWs : s.pt,
                        quarterly_assessment: st.qaWs !== '' ? st.qaWs : s.qa,
                        average: st.transmuted !== '—' && !isNaN(Number(st.transmuted)) ? Number(st.transmuted) : (s.grade || (s.ww + s.pt + s.qa)),
                        letterGrade: s.letterGrade,
                        descriptor: st.descriptor,
                        remarks: st.remarks,
                        raw_scores: studentRaw
                    });
                });

                // Re-render all 4 tables with the populated data!
                renderAllGradeTables(activeWeights);

                // Persist to backend database
                if (token && currentSectionId) {
                    const termSelect = document.getElementById('encodeTermFilter');
                    const activeTermVal = termSelect ? termSelect.value : 't1';
                    const termLabel = activeTermVal === 't2' ? '2nd Term' : (activeTermVal === 't3' ? '3rd Term' : '1st Term');

                    const res = await authedFetch('/api/classes/eclass-save', token, {
                        method: 'POST',
                        body: JSON.stringify({
                            sectionId: currentSectionId,
                            subjectId: targetSubId,
                            term: termLabel,
                            grades: gradesPayload
                        })
                    });

                    if (res && res.success) {
                        console.log('Synchronized to backend:', res);
                    }
                }

                if (validationModalInstance) validationModalInstance.hide();
                alert(`✅ Successfully verified and applied ${gradesPayload.length} learner records from "${pendingParsedData.fileName}"!\n\n• DepEd Order 15 transmuted grades extracted & calculated.\n• Scores populated across all Summary, Written Works, Performance Tasks, and Exam tables.`);

                loadRoster(currentSectionId);
            } catch (err) {
                console.error('Error applying ECR data:', err);
                alert('An error occurred while saving grades. Please try again.');
            } finally {
                btnConfirmApplyECR.disabled = false;
                btnConfirmApplyECR.innerHTML = '<i class="bi bi-check2-circle fs-5"></i> Confirm & Synchronize to Mentorae';
            }
        });
    }

    // Google Sheets Online Sync
    const btnFetchGoogleSheets = document.getElementById('btnFetchGoogleSheets');
    const googleSheetsUrlInput = document.getElementById('googleSheetsUrlInput');
    if (btnFetchGoogleSheets && googleSheetsUrlInput) {
        btnFetchGoogleSheets.addEventListener('click', async () => {
            const url = googleSheetsUrlInput.value.trim();
            if (!url) {
                alert('Please paste a Google Sheets URL.');
                return;
            }

            const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (!match || !match[1]) {
                alert('Invalid Google Sheets URL. Please copy the link from your browser address bar.');
                return;
            }

            const sheetId = match[1];
            const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;

            btnFetchGoogleSheets.disabled = true;
            btnFetchGoogleSheets.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Fetching...';

            try {
                const response = await fetch(exportUrl);
                if (!response.ok) {
                    throw new Error(`Google Sheets returned HTTP ${response.status}. Ensure link sharing is set to "Anyone with the link can view".`);
                }
                const buffer = await response.arrayBuffer();
                const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
                const parsed = parseECRWorkbook(wb, 'Google_Sheets_e-CLASS-RECORD.xlsx');
                if (parsed && parsed.students && parsed.students.length > 0) {
                    presentValidationModal(parsed);
                } else {
                    alert('Could not find student grade records in this Google Sheet. Please verify the sheet format.');
                }
            } catch (err) {
                console.error('Google Sheets fetch error:', err);
                alert(`Could not fetch Google Sheet:\n${err.message}\n\nPlease verify that link sharing is set to "Anyone with the link can view".`);
            } finally {
                btnFetchGoogleSheets.disabled = false;
                btnFetchGoogleSheets.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i> Fetch & Sync';
            }
        });
    }

    // =========================================================================
    // Helper: HTML Escaping
    // =========================================================================
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // =========================================================================
    // Advisory Banner Updater
    // =========================================================================
    function updateAdvisoryBanner() {
        const advBanner = document.getElementById('advisoryBanner');
        if (!advBanner) return;
        const activeSec = mySections.find(s => String(s.id) === String(currentSectionId));
        if (activeSec && (activeSec.isAdvisory === 1 || activeSec.isAdvisory === true)) {
            advBanner.classList.remove('d-none');
            const txt = document.getElementById('advisoryBannerText');
            if (txt) {
                txt.textContent = `You are the Class Adviser for Grade ${activeSec.grade_level} - ${activeSec.strandCode || ''} (${activeSec.name}). You can verify student excuse letters and generate DepEd SF9 report cards.`;
            }
            const secName = document.getElementById('advisoryBannerSectionName');
            if (secName) {
                secName.textContent = `Grade ${activeSec.grade_level} - ${activeSec.strandCode || ''} (${activeSec.name})`;
            }
            if (typeof loadAdvisoryExcuseNotes === 'function') {
                loadAdvisoryExcuseNotes();
            }
        } else {
            advBanner.classList.add('d-none');
        }
    }

    // =========================================================================
    // Bulk & Single DepEd SF9-SHS Report Cards One-File PDF Generator
    // =========================================================================
    async function generateBulkReportCards(sectionId, singleStudentId = null) {
        if (!sectionId) {
            alert('Please select a section first.');
            return;
        }

        const triggerBtns = [
            document.getElementById('btnPrintAdvisoryReportCards'),
            document.getElementById('btnPrintAdvisoryReportCardsBar'),
            document.getElementById('btnAdvisoryBannerPrint')
        ].filter(Boolean);

        triggerBtns.forEach(btn => {
            btn.disabled = true;
            btn.dataset.origHtml = btn.innerHTML;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Preparing PDF...';
        });

        try {
            const res = await authedFetch(`/api/grades/section-report-cards?sectionId=${sectionId}`, token);
            if (!res.success) {
                alert(res.message || 'Could not load report card data.');
                return;
            }

            let cards = res.reportCards || [];
            if (singleStudentId) {
                cards = cards.filter(c => String(c.id) === String(singleStudentId));
            }

            if (!cards.length) {
                alert('No students found in this section to print report cards for.');
                return;
            }

            const sec = res.section;
            const schoolHeadName = (sec.schoolHead || 'JAENA N. DELA CERNA').toUpperCase();
            const adviserName = (sec.adviserName || 'NIÑO M. LUNA').toUpperCase();
            const schoolYear = sec.schoolYear || '2026-2027';
            const gradeLevel = sec.gradeLevel || '11';
            const sectionName = (sec.name || '').toUpperCase();
            const trackName = sec.track || 'Academic';

            const depedLogoSrc = (typeof DEPED_LOGO_B64 !== 'undefined' && DEPED_LOGO_B64) ? DEPED_LOGO_B64 : 'deped_seal.png';
            const tshsLogoSrc = (typeof TSHS_LOGO_B64 !== 'undefined' && TSHS_LOGO_B64) ? TSHS_LOGO_B64 : 'tshs_seal.jpg';

            // Compile the two-page A5 document for each student matching official card-sf9 of Talisay Senior High School
            const pagesHtml = cards.map((st, index) => {
                const studentName = st.formattedName || st.fullName || 'Student Name';
                const lrn = st.idNumber || '—';
                const age = st.age || 15;
                const sex = st.sex || '';

                // Core Subjects Rows
                let coreRowsHtml = '';
                const coreList = (st.coreSubjects && st.coreSubjects.length) ? st.coreSubjects : [];

                const hasEffCom = coreList.some(s => s.subjectName && s.subjectName.toLowerCase().includes('effective communication'));
                const hasMabKom = coreList.some(s => s.subjectName && s.subjectName.toLowerCase().includes('mabisang komunikasyon'));

                // Header group row for Effective Communication / Mabisang Komunikasyon
                coreRowsHtml += `
                    <tr class="grade-row-group">
                        <td class="td-learning-area group-title-cell" contenteditable="true">Effective Communication<br>/Mabisang Komunikasyon</td>
                        <td class="td-grade"></td>
                        <td class="td-grade"></td>
                        <td class="td-grade"></td>
                        <td class="td-units"></td>
                        <td class="td-final"></td>
                        <td class="td-remarks"></td>
                    </tr>
                `;

                if (!coreList.length) {
                    const defaultCore = [
                        { name: 'Effective Communication', isSub: true, t1: '' },
                        { name: 'Mabisang Komunikasyon', isSub: true, t1: '' },
                        { name: 'General Mathematics', isSub: false, t1: '' },
                        { name: 'General Science', isSub: false, t1: '' },
                        { name: 'Life and Career Skills', isSub: false, t1: '' },
                        { name: 'Pag-Aaral ng Kasaysayan at Lipunang Pilipino', isSub: false, t1: '', wrap: true }
                    ];
                    defaultCore.forEach(sub => {
                        coreRowsHtml += `
                            <tr class="grade-row">
                                <td class="td-learning-area ${sub.isSub ? 'sub-subject-indent font-italic' : ''}" contenteditable="true">${escapeHtml(sub.name)}</td>
                                <td class="td-grade text-center" contenteditable="true">${sub.t1}</td>
                                <td class="td-grade text-center" contenteditable="true"></td>
                                <td class="td-grade text-center" contenteditable="true"></td>
                                <td class="td-units text-center" contenteditable="true"></td>
                                <td class="td-final text-center" contenteditable="true"></td>
                                <td class="td-remarks text-center" contenteditable="true"></td>
                            </tr>
                        `;
                    });
                } else {
                    // Check if sub subjects exist
                    let effSub = coreList.find(s => s.subjectName.toLowerCase().includes('effective communication'));
                    let mabSub = coreList.find(s => s.subjectName.toLowerCase().includes('mabisang komunikasyon'));

                    if (effSub) {
                        coreRowsHtml += `
                            <tr class="grade-row">
                                <td class="td-learning-area sub-subject-indent font-italic" contenteditable="true">Effective Communication</td>
                                <td class="td-grade text-center" contenteditable="true">${effSub.t1 !== null && effSub.t1 !== undefined ? effSub.t1 : ''}</td>
                                <td class="td-grade text-center" contenteditable="true">${effSub.t2 !== null && effSub.t2 !== undefined ? effSub.t2 : ''}</td>
                                <td class="td-grade text-center" contenteditable="true">${effSub.t3 !== null && effSub.t3 !== undefined ? effSub.t3 : ''}</td>
                                <td class="td-units text-center" contenteditable="true">${effSub.units ? escapeHtml(effSub.units) : ''}</td>
                                <td class="td-final text-center" contenteditable="true">${effSub.finalGrade !== null && effSub.finalGrade !== undefined ? effSub.finalGrade : ''}</td>
                                <td class="td-remarks text-center" contenteditable="true">${escapeHtml(effSub.remarks || '')}</td>
                            </tr>
                        `;
                    } else {
                        coreRowsHtml += `
                            <tr class="grade-row">
                                <td class="td-learning-area sub-subject-indent font-italic" contenteditable="true">Effective Communication</td>
                                <td class="td-grade text-center" contenteditable="true"></td>
                                <td class="td-grade text-center" contenteditable="true"></td>
                                <td class="td-grade text-center" contenteditable="true"></td>
                                <td class="td-units text-center" contenteditable="true"></td>
                                <td class="td-final text-center" contenteditable="true"></td>
                                <td class="td-remarks text-center" contenteditable="true"></td>
                            </tr>
                        `;
                    }

                    if (mabSub) {
                        coreRowsHtml += `
                            <tr class="grade-row">
                                <td class="td-learning-area sub-subject-indent font-italic" contenteditable="true">Mabisang Komunikasyon</td>
                                <td class="td-grade text-center" contenteditable="true">${mabSub.t1 !== null && mabSub.t1 !== undefined ? mabSub.t1 : ''}</td>
                                <td class="td-grade text-center" contenteditable="true">${mabSub.t2 !== null && mabSub.t2 !== undefined ? mabSub.t2 : ''}</td>
                                <td class="td-grade text-center" contenteditable="true">${mabSub.t3 !== null && mabSub.t3 !== undefined ? mabSub.t3 : ''}</td>
                                <td class="td-units text-center" contenteditable="true">${mabSub.units ? escapeHtml(mabSub.units) : ''}</td>
                                <td class="td-final text-center" contenteditable="true">${mabSub.finalGrade !== null && mabSub.finalGrade !== undefined ? mabSub.finalGrade : ''}</td>
                                <td class="td-remarks text-center" contenteditable="true">${escapeHtml(mabSub.remarks || '')}</td>
                            </tr>
                        `;
                    } else {
                        coreRowsHtml += `
                            <tr class="grade-row">
                                <td class="td-learning-area sub-subject-indent font-italic" contenteditable="true">Mabisang Komunikasyon</td>
                                <td class="td-grade text-center" contenteditable="true"></td>
                                <td class="td-grade text-center" contenteditable="true"></td>
                                <td class="td-grade text-center" contenteditable="true"></td>
                                <td class="td-units text-center" contenteditable="true"></td>
                                <td class="td-final text-center" contenteditable="true"></td>
                                <td class="td-remarks text-center" contenteditable="true"></td>
                            </tr>
                        `;
                    }

                    // Remaining core subjects
                    coreList.forEach(sub => {
                        const nameLower = sub.subjectName.toLowerCase();
                        if (nameLower.includes('effective communication') || nameLower.includes('mabisang komunikasyon')) {
                            return; // already rendered
                        }
                        coreRowsHtml += `
                            <tr class="grade-row">
                                <td class="td-learning-area" contenteditable="true">${escapeHtml(sub.subjectName)}</td>
                                <td class="td-grade text-center" contenteditable="true">${sub.t1 !== null && sub.t1 !== undefined ? sub.t1 : ''}</td>
                                <td class="td-grade text-center" contenteditable="true">${sub.t2 !== null && sub.t2 !== undefined ? sub.t2 : ''}</td>
                                <td class="td-grade text-center" contenteditable="true">${sub.t3 !== null && sub.t3 !== undefined ? sub.t3 : ''}</td>
                                <td class="td-units text-center" contenteditable="true">${sub.units ? escapeHtml(sub.units) : ''}</td>
                                <td class="td-final text-center" contenteditable="true">${sub.finalGrade !== null && sub.finalGrade !== undefined ? sub.finalGrade : ''}</td>
                                <td class="td-remarks text-center" contenteditable="true">${escapeHtml(sub.remarks || '')}</td>
                            </tr>
                        `;
                    });
                }

                // Elective Subjects Rows
                let electiveRowsHtml = '';
                const electiveList = (st.electiveSubjects && st.electiveSubjects.length) ? st.electiveSubjects : [];
                if (!electiveList.length) {
                    const defaultElective = ['Biology 1'];
                    defaultElective.forEach(name => {
                        electiveRowsHtml += `
                            <tr class="grade-row">
                                <td class="td-learning-area" contenteditable="true">${escapeHtml(name)}</td>
                                <td class="td-grade text-center" contenteditable="true"></td>
                                <td class="td-grade text-center" contenteditable="true"></td>
                                <td class="td-grade text-center" contenteditable="true"></td>
                                <td class="td-units text-center" contenteditable="true"></td>
                                <td class="td-final text-center" contenteditable="true"></td>
                                <td class="td-remarks text-center" contenteditable="true"></td>
                            </tr>
                        `;
                    });
                } else {
                    electiveList.forEach(sub => {
                        electiveRowsHtml += `
                            <tr class="grade-row">
                                <td class="td-learning-area" contenteditable="true">${escapeHtml(sub.subjectName)}</td>
                                <td class="td-grade text-center" contenteditable="true">${sub.t1 !== null && sub.t1 !== undefined ? sub.t1 : ''}</td>
                                <td class="td-grade text-center" contenteditable="true">${sub.t2 !== null && sub.t2 !== undefined ? sub.t2 : ''}</td>
                                <td class="td-grade text-center" contenteditable="true">${sub.t3 !== null && sub.t3 !== undefined ? sub.t3 : ''}</td>
                                <td class="td-units text-center" contenteditable="true">${sub.units ? escapeHtml(sub.units) : ''}</td>
                                <td class="td-final text-center" contenteditable="true">${sub.finalGrade !== null && sub.finalGrade !== undefined ? sub.finalGrade : ''}</td>
                                <td class="td-remarks text-center" contenteditable="true">${escapeHtml(sub.remarks || '')}</td>
                            </tr>
                        `;
                    });
                }

                // General Average Row
                const genAvg = st.generalAverage || {};

                // Monthly Attendance Breakdown (Page 2)
                const attMonths = st.attendanceSummary?.months || [
                    { month: 'Jun', classDays: 0, present: 0, absent: 0 },
                    { month: 'Jul', classDays: 0, present: 0, absent: 0 },
                    { month: 'Aug', classDays: 20, present: 20, absent: 0 },
                    { month: 'Sep', classDays: 20, present: 20, absent: 0 },
                    { month: 'Oct', classDays: 20, present: 18, absent: 2 },
                    { month: 'Nov', classDays: 20, present: 20, absent: 0 },
                    { month: 'Dec', classDays: 18, present: 18, absent: 0 },
                    { month: 'Jan', classDays: 20, present: 20, absent: 0 },
                    { month: 'Feb', classDays: 18, present: 18, absent: 0 },
                    { month: 'Mar', classDays: 20, present: 20, absent: 0 },
                    { month: 'Apr', classDays: 5, present: 5, absent: 0 }
                ];
                const attTotal = st.attendanceSummary?.total || { classDays: 161, present: 159, absent: 2 };

                let attHeaderCells = '';
                let attDaysCells = '';
                let attPresentCells = '';
                let attAbsentCells = '';

                attMonths.forEach(m => {
                    attHeaderCells += `<th class="text-center font-bold th-att-month">${escapeHtml(m.month)}</th>`;
                    attDaysCells += `<td class="text-center td-att-cell" contenteditable="true">${m.classDays > 0 ? m.classDays : ''}</td>`;
                    attPresentCells += `<td class="text-center td-att-cell" contenteditable="true">${m.classDays > 0 ? m.present : ''}</td>`;
                    attAbsentCells += `<td class="text-center td-att-cell" contenteditable="true">${m.classDays > 0 ? m.absent : ''}</td>`;
                });

                attHeaderCells += `<th class="text-center font-bold th-att-total">Total</th>`;
                attDaysCells += `<td class="text-center font-bold td-att-cell" contenteditable="true">${attTotal.classDays || ''}</td>`;
                attPresentCells += `<td class="text-center font-bold td-att-cell" contenteditable="true">${attTotal.present || ''}</td>`;
                attAbsentCells += `<td class="text-center font-bold td-att-cell" contenteditable="true">${attTotal.absent || 0}</td>`;

                return `
                    <!-- ==================== STUDENT ${index + 1} PAGE 1: FRONT (A5) ==================== -->
                    <div class="sf9-a5-page sf9-page-1">
                        <!-- Top Header with Logos flanking the centered text block -->
                        <div class="sf9-header-container">
                            <div class="header-logo-wrap seal-left">
                                <img src="${depedLogoSrc}" alt="DepEd Seal" class="seal-img" />
                            </div>
                            <div class="header-center-text text-center">
                                <div class="txt-republic">Republic of the Philippines</div>
                                <div class="txt-header-spacer"></div>
                                <div class="txt-region font-bold">REGION IV - A (CALABARZON)</div>
                                <div class="txt-division font-bold">SCHOOLS DIVISION OF BATANGAS PROVINCE</div>
                                <div class="txt-district font-bold">TALISAY DISTRICT</div>
                                <div class="txt-muni font-bold">TALISAY, BATANGAS</div>
                                <div class="txt-school font-bold">TALISAY SENIOR HIGH SCHOOL</div>
                                <div class="txt-doc-title font-bold">LEARNER'S PERFORMANCE REPORT</div>
                                <div class="txt-sy">School Year <span contenteditable="true">${escapeHtml(schoolYear)}</span></div>
                            </div>
                            <div class="header-logo-wrap seal-right">
                                <img src="${tshsLogoSrc}" alt="TSHS Seal" class="seal-img" />
                            </div>
                        </div>

                        <!-- Learner Information Lines matching official format -->
                        <div class="learner-meta-table">
                            <div class="meta-row">
                                <div class="meta-item item-name">
                                    <span class="meta-lbl">Name:</span>
                                    <span class="meta-val underline-line font-bold" contenteditable="true">${escapeHtml(studentName)}</span>
                                </div>
                                <div class="meta-item item-age">
                                    <span class="meta-lbl">Age:</span>
                                    <span class="meta-val underline-line text-center font-bold" contenteditable="true">${escapeHtml(age)}</span>
                                </div>
                                <div class="meta-item item-sex">
                                    <span class="meta-lbl">Sex:</span>
                                    <span class="meta-val underline-line text-center font-bold" contenteditable="true">${escapeHtml(sex)}</span>
                                </div>
                            </div>
                            <div class="meta-row">
                                <div class="meta-item item-lrn">
                                    <span class="meta-lbl">LRN:</span>
                                    <span class="meta-val underline-line text-center font-bold" contenteditable="true">${escapeHtml(lrn)}</span>
                                </div>
                                <div class="meta-item item-grade">
                                    <span class="meta-lbl">Grade:</span>
                                    <span class="meta-val underline-line text-center font-bold" contenteditable="true">${escapeHtml(gradeLevel)}</span>
                                </div>
                                <div class="meta-item item-section">
                                    <span class="meta-lbl">Section:</span>
                                    <span class="meta-val underline-line text-center text-uppercase font-bold" contenteditable="true">${escapeHtml(sectionName)}</span>
                                </div>
                            </div>
                            <div class="meta-row">
                                <div class="meta-item item-track">
                                    <span class="meta-lbl">Track (SHS only):</span>
                                    <span class="meta-val underline-line font-bold" contenteditable="true">${escapeHtml(trackName)}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Dear Parents Note and Signatures -->
                        <div class="dear-parents-box">
                            <div class="dp-greeting">Dear Parents,</div>
                            <div class="dp-body">
                                <p class="dp-p">This Performance Report presents your child's progress and achievement in the different learning areas.</p>
                                <p class="dp-p">The school welcomes you to reach out should you wish to know more about your child's learning and performance.</p>
                            </div>
                            <div class="dp-signatures-grid">
                                <div class="sig-col sig-left">
                                    <div class="sig-name underline-line font-bold text-center" contenteditable="true">${escapeHtml(schoolHeadName)}</div>
                                    <div class="sig-title text-center">School Head</div>
                                </div>
                                <div class="sig-col sig-right">
                                    <div class="sig-name underline-line font-bold text-center" contenteditable="true">${escapeHtml(adviserName)}</div>
                                    <div class="sig-title text-center">Adviser</div>
                                </div>
                            </div>
                        </div>

                        <!-- Section Heading Outside Table -->
                        <div class="learning-progress-heading font-bold text-center">LEARNING PROGRESS AND ACHIEVEMENT</div>

                        <!-- Main Learning Progress and Achievement Table -->
                        <table class="sf9-main-grades-table">
                            <thead>
                                <tr class="tr-main-cols">
                                    <th rowspan="2" class="th-learning-areas text-center font-bold">Learning Areas</th>
                                    <th colspan="3" class="th-term text-center font-bold">TERM</th>
                                    <th rowspan="2" class="th-units text-center font-bold">Units</th>
                                    <th rowspan="2" class="th-final text-center font-bold">Final<br>Grade</th>
                                    <th rowspan="2" class="th-remarks text-center font-bold">Remarks</th>
                                </tr>
                                <tr class="tr-sub-terms">
                                    <th class="th-subterm text-center font-bold">T1</th>
                                    <th class="th-subterm text-center font-bold">T2</th>
                                    <th class="th-subterm text-center font-bold">T3</th>
                                </tr>
                            </thead>
                            <tbody>
                                <!-- Core Subjects Header Row -->
                                <tr class="category-header-row">
                                    <td colspan="7" class="category-title-cell font-bold font-italic">Core Subjects</td>
                                </tr>
                                ${coreRowsHtml}

                                <!-- Elective Subjects Header Row -->
                                <tr class="category-header-row">
                                    <td colspan="7" class="category-title-cell font-bold font-italic">Elective Subjects</td>
                                </tr>
                                ${electiveRowsHtml}

                                <!-- 2 Exact Blank Placeholder Rows as in official card -->
                                <tr class="grade-row empty-row">
                                    <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td>
                                </tr>
                                <tr class="grade-row empty-row">
                                    <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td>
                                </tr>

                                <!-- General Average Row matching official card format (Merged Columns B-H: Colspan 4) -->
                                <tr class="general-average-row">
                                    <td colspan="4" class="text-center genavg-label font-bold font-italic" contenteditable="true">General Average</td>
                                    <td class="td-units text-center" contenteditable="true"></td>
                                    <td class="td-final text-center font-bold font-italic" contenteditable="true">${genAvg.finalGrade !== null && genAvg.finalGrade !== undefined ? genAvg.finalGrade : ''}</td>
                                    <td class="td-remarks text-center font-bold" contenteditable="true">${escapeHtml(genAvg.remarks || '')}</td>
                                </tr>
                            </tbody>
                        </table>

                        <!-- Performance Descriptors Table (Page 1 Bottom, borderless) -->
                        <div class="sf9-descriptors-section">
                            <div class="desc-heading font-bold text-left">PERFORMANCE DESCRIPTORS</div>
                            <table class="desc-table">
                                <thead>
                                    <tr>
                                        <th class="desc-col-scale text-center font-bold">Grading Scale</th>
                                        <th class="desc-col-desc text-center font-bold">Descriptors</th>
                                        <th class="desc-col-rem text-center font-bold">Remarks</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr><td class="text-center">90-100</td><td class="text-center">Advancing</td><td class="text-center">Passed</td></tr>
                                    <tr><td class="text-center">80-89</td><td class="text-center">Benchmarking</td><td class="text-center">Passed</td></tr>
                                    <tr><td class="text-center">75-79</td><td class="text-center">Connecting</td><td class="text-center">Passed</td></tr>
                                    <tr><td class="text-center">65-74</td><td class="text-center">Developing</td><td class="text-center">Failed</td></tr>
                                    <tr><td class="text-center">0-64</td><td class="text-center">Emerging</td><td class="text-center">Failed</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- ==================== STUDENT ${index + 1} PAGE 2: BACK (A5) ==================== -->
                    <div class="sf9-a5-page sf9-page-2">
                        <!-- Monthly Attendance Record Table -->
                        <table class="sf9-attendance-table">
                            <thead>
                                <tr class="tr-att-header">
                                    <th class="th-month-label text-center font-bold">Month</th>
                                    ${attHeaderCells}
                                </tr>
                            </thead>
                            <tbody>
                                <tr class="tr-att-row">
                                    <td class="td-att-row-title text-center font-bold">No. of Class<br>Days</td>
                                    ${attDaysCells}
                                </tr>
                                <tr class="tr-att-row">
                                    <td class="td-att-row-title text-center font-bold">No. of Days<br>Present</td>
                                    ${attPresentCells}
                                </tr>
                                <tr class="tr-att-row">
                                    <td class="td-att-row-title text-center font-bold">No. of Days<br>Absent</td>
                                    ${attAbsentCells}
                                </tr>
                            </tbody>
                        </table>

                        <!-- Teacher's Comments / Remarks Box -->
                        <div class="sf9-comments-container">
                            <div class="box-title text-center font-bold">TEACHER'S COMMENTS / REMARKS</div>
                            <div class="comments-bordered-box">
                                <div class="comment-term-row term-1-row">
                                    <span class="comment-term-lbl font-bold">Term 1</span>
                                    <span class="comment-term-text" contenteditable="true">${escapeHtml(st.comments?.term1 || 'Needs more practice to improve understanding.')}</span>
                                </div>
                                <div class="comment-term-row term-2-row">
                                    <span class="comment-term-lbl font-bold">Term 2</span>
                                    <span class="comment-term-text" contenteditable="true">${escapeHtml(st.comments?.term2 || '')}</span>
                                </div>
                                <div class="comment-term-row term-3-row">
                                    <span class="comment-term-lbl font-bold">Term 3</span>
                                    <span class="comment-term-text" contenteditable="true">${escapeHtml(st.comments?.term3 || '')}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Parent's / Guardian's Signature Lines -->
                        <div class="sf9-signatures-box">
                            <div class="box-title text-center font-bold">PARENT/S GUARDIAN'S SIGNATURE</div>
                            <div class="parent-signatures-list">
                                <div class="sig-parent-row">
                                    <span class="sig-term-lbl font-bold">Term 1</span>
                                    <span class="sig-underline-line"></span>
                                </div>
                                <div class="sig-parent-row">
                                    <span class="sig-term-lbl font-bold">Term 2</span>
                                    <span class="sig-underline-line"></span>
                                </div>
                                <div class="sig-parent-row">
                                    <span class="sig-term-lbl font-bold">Term 3</span>
                                    <span class="sig-underline-line"></span>
                                </div>
                            </div>
                        </div>

                        <!-- Certificate of Transfer -->
                        <div class="sf9-certificate-box">
                            <div class="box-title text-center font-bold">CERTIFICATE OF TRANSFER</div>
                            <p class="cert-intro">
                                This is to certify that the above-named learner has satisfactorily completed the requirements for the grade level indicated.
                            </p>
                            <div class="cert-fields-grid">
                                <div class="cert-field-line">
                                    <span class="cert-lbl">Admitted to Grade:</span>
                                    <span class="cert-val underline-line" contenteditable="true" style="width: 70px; display: inline-block;"></span>
                                </div>
                                <div class="cert-field-line">
                                    <span class="cert-lbl">Eligible for Admission to Grade:</span>
                                    <span class="cert-val underline-line" contenteditable="true" style="width: 145px; display: inline-block;"></span>
                                </div>
                            </div>

                            <!-- Signatures inside Certificate of Transfer -->
                            <div class="cert-signatures-layout">
                                <div class="cert-sig-right">
                                    <div class="sig-name underline-line font-bold text-center" contenteditable="true">${escapeHtml(adviserName)}</div>
                                    <div class="sig-title text-center">Adviser</div>
                                </div>
                                <div class="cert-sig-left">
                                    <div class="approved-tag">Approved:</div>
                                    <div class="principal-sig-block">
                                        <div class="sig-name underline-line font-bold text-center" contenteditable="true">${escapeHtml(schoolHeadName)}</div>
                                        <div class="sig-title text-center">School Head</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Cancellation of Eligibility to Transfer -->
                        <div class="sf9-cancellation-box">
                            <div class="box-title text-center font-bold">CANCELLATION OF ELIGIBILITY TO TRANSFER</div>
                            <div class="cancellation-fields-row">
                                <div class="canc-field">
                                    <span class="canc-lbl">Admitted in:</span>
                                    <span class="canc-val underline-line" contenteditable="true" style="width: 175px; display: inline-block;"></span>
                                </div>
                                <div class="canc-field">
                                    <span class="canc-lbl">Date:</span>
                                    <span class="canc-val underline-line" contenteditable="true" style="width: 145px; display: inline-block;"></span>
                                </div>
                            </div>
                            <div class="cancellation-principal-center">
                                <div class="sig-name underline-line font-bold text-center" contenteditable="true">${escapeHtml(schoolHeadName)}</div>
                                <div class="sig-title text-center">School Head</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            const fullHtml = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>${cards.length === 1 ? `SF9 Report Card - ${escapeHtml(cards[0].fullName)}` : `Official SF9 Report Cards (A5 Batch) - ${escapeHtml(sec.name)}`}</title>
                    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" rel="stylesheet">
                    <style>
                        /* DepEd Standard A5 Portrait Format: 148mm x 210mm */
                        @page {
                            size: A5 portrait;
                            margin: 0;
                        }

                        * {
                            box-sizing: border-box;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }

                        body {
                            margin: 0;
                            padding: 0;
                            background-color: #475569;
                            font-family: "Bookman Old Style", Georgia, "Times New Roman", serif;
                            color: #000000;
                            font-size: 7.2pt;
                            line-height: 1.15;
                        }

                        /* Interactive Toolbar */
                        .no-print-toolbar {
                            position: sticky;
                            top: 0;
                            z-index: 9999;
                            background: #1e293b;
                            color: #ffffff;
                            padding: 10px 20px;
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                            font-size: 13px;
                        }

                        .no-print-toolbar button {
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        }

                        /* Official A5 Page Sheet - Clean White, NO Page Border */
                        .sf9-a5-page {
                            width: 148mm;
                            height: 210mm;
                            max-height: 210mm;
                            margin: 16px auto;
                            background: #ffffff;
                            border: none !important;
                            padding: 6mm 7.5mm 6mm 7.5mm;
                            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
                            box-sizing: border-box;
                            position: relative;
                            display: flex;
                            flex-direction: column;
                            justify-content: flex-start;
                            page-break-inside: avoid;
                            break-inside: avoid;
                            page-break-after: always;
                            break-after: page;
                            overflow: hidden;
                        }

                        .sf9-a5-page:last-child {
                            page-break-after: avoid !important;
                            break-after: avoid !important;
                        }

                        /* Typography */
                        .font-bold { font-weight: bold; }
                        .font-italic { font-style: italic; }
                        .text-center { text-align: center; }
                        .text-uppercase { text-transform: uppercase; }

                        .underline-line {
                            border-bottom: 1px solid #000000;
                            display: inline-block;
                            padding: 0 4px 0.5px 4px;
                        }

                        /* Interactive Inline Editing Highlighting */
                        [contenteditable="true"] {
                            outline: none;
                            transition: background-color 0.15s ease;
                        }
                        [contenteditable="true"]:hover {
                            background-color: #f0fdf4;
                            cursor: text;
                        }
                        [contenteditable="true"]:focus {
                            background-color: #dcfce7;
                            box-shadow: 0 0 0 1px #16a34a;
                        }

                        /* Header Layout matching official TSHS card */
                        .sf9-header-container {
                            display: flex;
                            align-items: flex-start;
                            justify-content: center;
                            gap: 10px;
                            margin: 0 auto 3px auto;
                        }

                        .header-logo-wrap {
                            width: 78px;
                            height: 78px;
                            min-width: 78px;
                            min-height: 78px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            flex-shrink: 0;
                            margin-top: 1px;
                        }

                        .seal-img {
                            width: 100%;
                            height: 100%;
                            object-fit: contain;
                            display: block;
                        }

                        .header-center-text {
                            flex: 0 1 auto;
                            text-align: center;
                            line-height: 1.18;
                            white-space: nowrap;
                        }

                        .txt-republic {
                            font-size: 8.5pt;
                            font-weight: normal;
                            letter-spacing: 0.1px;
                        }

                        .txt-header-spacer {
                            height: 12px;
                        }

                        .txt-region { font-size: 7.8pt; }
                        .txt-division { font-size: 7.8pt; }
                        .txt-district { font-size: 7.8pt; }
                        .txt-muni { font-size: 7.8pt; }
                        .txt-school { font-size: 8.8pt; margin-top: 2px; }
                        .txt-doc-title { font-size: 9.2pt; margin-top: 2px; }
                        .txt-sy { font-size: 8pt; margin-top: 1px; }

                        /* Learner Metadata Lines */
                        .learner-meta-table {
                            font-size: 7.2pt;
                            line-height: 1.25;
                            margin: 2px 0 3px 0;
                            width: 100%;
                        }

                        .meta-row {
                            display: flex;
                            align-items: baseline;
                            margin-bottom: 2px;
                            flex-wrap: nowrap !important;
                            width: 100%;
                        }

                        .meta-item {
                            display: flex;
                            align-items: baseline;
                            flex-shrink: 0;
                            white-space: nowrap;
                        }

                        .meta-lbl {
                            white-space: nowrap;
                            margin-right: 4px;
                            font-weight: normal;
                            flex-shrink: 0;
                        }

                        .meta-val {
                            min-height: 13px;
                            line-height: 13px;
                            white-space: nowrap;
                        }

                        /* Column 1: Name & LRN */
                        .item-name, .item-lrn {
                            width: 47%;
                            flex-shrink: 0;
                        }
                        .item-name .meta-val, .item-lrn .meta-val {
                            flex: 1;
                            min-width: 0;
                            overflow: hidden;
                            text-overflow: ellipsis;
                        }

                        /* Column 2: Age & Grade */
                        .item-age, .item-grade {
                            width: 17%;
                            margin-left: 8px;
                            flex-shrink: 0;
                        }
                        .item-age .meta-val, .item-grade .meta-val {
                            flex: 1;
                            min-width: 0;
                        }

                        /* Column 3: Sex & Section (Ensures Section never wraps onto another row) */
                        .item-sex, .item-section {
                            flex: 1;
                            margin-left: 8px;
                            min-width: 0;
                            overflow: hidden;
                        }
                        .item-sex .meta-val {
                            flex: 1;
                            min-width: 0;
                        }
                        .item-section .meta-val {
                            flex: 1;
                            min-width: 0;
                            font-size: 6.8pt;
                            letter-spacing: -0.1px;
                            white-space: nowrap;
                            overflow: hidden;
                            text-overflow: ellipsis;
                        }

                        /* Row 3: Track directly underneath */
                        .item-track {
                            width: 100%;
                            margin-top: 1px;
                        }
                        .item-track .meta-val {
                            width: 150px;
                            flex: none;
                            text-align: center;
                        }

                        /* Dear Parents Box */
                        .dear-parents-box {
                            font-size: 6.8pt;
                            line-height: 1.2;
                            margin-bottom: 2px;
                        }

                        .dp-greeting {
                            font-weight: normal;
                            margin-bottom: 1px;
                        }

                        .dp-p {
                            margin: 0;
                            text-indent: 20px;
                        }

                        .dp-signatures-grid {
                            display: flex;
                            justify-content: space-between;
                            margin-top: 8px;
                            margin-bottom: 2px;
                        }

                        .sig-col {
                            width: 175px;
                        }

                        .sig-col .sig-name {
                            min-height: 13px;
                            display: block;
                        }

                        .sig-col .sig-title {
                            font-size: 6.6pt;
                            margin-top: 1px;
                        }

                        /* Main Grades Table */
                        .learning-progress-heading {
                            font-size: 7.8pt;
                            letter-spacing: 0.3px;
                            margin: 8px 0 0 0;
                            padding: 0;
                            line-height: 1.05;
                        }

                        .sf9-main-grades-table {
                            width: 100%;
                            border-collapse: collapse;
                            font-size: 6.8pt;
                            line-height: 1.15;
                            border: 1px solid #000000;
                            table-layout: fixed;
                            margin-top: 0 !important;
                        }

                        .sf9-main-grades-table th,
                        .sf9-main-grades-table td {
                            border: 1px solid #000000;
                            padding: 2.8px 3px;
                            vertical-align: middle;
                        }

                        .th-learning-areas { width: 38%; }
                        .th-term { width: 27.2%; }
                        .th-subterm { width: 9.06%; }
                        .th-units { width: 9.3%; }
                        .th-final { width: 10.2%; }
                        .th-remarks { width: 15.3%; }

                        .td-grade, .td-units, .td-final, .td-remarks {
                            font-size: 6.8pt;
                        }

                        .td-learning-area {
                            text-align: left !important;
                            padding-left: 6px !important;
                            padding-right: 4px;
                            vertical-align: middle;
                        }

                        .category-header-row td {
                            background-color: #ffffff;
                            padding: 2.5px 4px 2.5px 6px !important;
                            text-align: left !important;
                            font-size: 7.2pt;
                            height: 20px;
                        }

                        .grade-row td, .grade-row-group td {
                            height: 20px;
                        }

                        .group-title-cell {
                            font-weight: normal;
                            text-align: left !important;
                            padding-left: 6px !important;
                        }

                        .sub-subject-indent {
                            padding-left: 6px !important;
                            text-align: left !important;
                        }

                        .empty-row td {
                            height: 20px;
                        }

                        .general-average-row td {
                            font-size: 7.2pt;
                            height: 21px;
                        }

                        .genavg-label {
                            text-align: center;
                        }

                        /* Performance Descriptors Section */
                        .sf9-descriptors-section {
                            font-size: 6.8pt;
                            line-height: 1.18;
                            margin-top: 2px;
                            width: 100%;
                        }

                        .desc-heading {
                            font-size: 7.2pt;
                            margin-bottom: 2px;
                            text-align: left !important;
                        }

                        .desc-table {
                            width: 88%;
                            margin-left: 11%;
                            border-collapse: collapse;
                        }

                        .desc-table th, .desc-table td {
                            border: none;
                            padding: 0.5px 4px;
                        }

                        .desc-col-scale { width: 33%; }
                        .desc-col-desc { width: 34%; }
                        .desc-col-rem { width: 33%; }

                        /* Page 2: Attendance Table */
                        .sf9-attendance-table {
                            width: 100%;
                            border-collapse: collapse;
                            font-size: 6.8pt;
                            line-height: 1.15;
                            border: 1px solid #000000;
                            table-layout: fixed;
                        }

                        .sf9-attendance-table th,
                        .sf9-attendance-table td {
                            border: 1px solid #000000;
                            padding: 1px 0.5px;
                            vertical-align: middle;
                        }

                        .tr-att-header th {
                            height: 16px;
                            font-size: 6.8pt;
                        }

                        .tr-att-row td {
                            height: 23px;
                            font-size: 6.8pt;
                        }

                        .th-month-label { width: 15.0%; }
                        .th-att-month { width: 6.55%; }
                        .th-att-total { width: 12.95%; }

                        .td-att-row-title {
                            font-size: 6.0pt;
                            line-height: 1.05;
                            padding: 1px 2px !important;
                        }

                        .sf9-page-2 {
                            justify-content: flex-start !important;
                        }

                        /* Comments Box */
                        .sf9-comments-container {
                            margin-top: 14px;
                        }

                        .box-title {
                            font-size: 7.2pt;
                            letter-spacing: 0.3px;
                            margin-bottom: 3px;
                        }

                        .comments-bordered-box {
                            border: 1px solid #000000;
                            font-size: 6.8pt;
                        }

                        .comment-term-row {
                            display: flex;
                            align-items: flex-start;
                            padding: 3px 6px;
                            line-height: 1.2;
                        }

                        .term-1-row {
                            min-height: 48px;
                            border-bottom: 1px solid #000000;
                        }

                        .term-2-row {
                            min-height: 36px;
                            border-bottom: 1px solid #000000;
                        }

                        .term-3-row {
                            min-height: 36px;
                        }

                        .comment-term-lbl {
                            width: 55px;
                            flex-shrink: 0;
                        }

                        .comment-term-text {
                            flex: 1;
                        }

                        /* Parent Signature Section */
                        .sf9-signatures-box {
                            margin-top: 12px;
                        }

                        .parent-signatures-list {
                            display: flex;
                            flex-direction: column;
                            gap: 4px;
                            align-items: center;
                            margin-top: 4px;
                        }

                        .sig-parent-row {
                            display: flex;
                            align-items: baseline;
                            width: 330px;
                        }

                        .sig-term-lbl {
                            width: 55px;
                            font-size: 6.8pt;
                        }

                        .sig-underline-line {
                            border-bottom: 1px solid #000000;
                            flex: 1;
                            height: 10px;
                        }

                        /* Certificate of Transfer */
                        .sf9-certificate-box {
                            margin-top: 14px;
                            font-size: 6.8pt;
                            line-height: 1.22;
                        }

                        .cert-intro {
                            margin: 3px 0 5px 0;
                            text-align: justify;
                        }

                        .cert-fields-grid {
                            margin-bottom: 6px;
                        }

                        .cert-field-line {
                            margin-bottom: 2px;
                        }

                        .cert-signatures-layout {
                            display: flex;
                            justify-content: space-between;
                            align-items: flex-start;
                            margin-top: 3px;
                        }

                        .cert-sig-left {
                            width: 175px;
                        }

                        .cert-sig-right {
                            width: 175px;
                            margin-left: auto;
                        }

                        .approved-tag {
                            font-size: 6.8pt;
                            margin-bottom: 2px;
                        }

                        .principal-sig-block {
                            margin-left: 12px;
                        }

                        .cert-signatures-layout .sig-name {
                            min-height: 13px;
                            display: block;
                        }

                        .cert-signatures-layout .sig-title {
                            font-size: 6.6pt;
                            margin-top: 1px;
                        }

                        /* Cancellation Box */
                        .sf9-cancellation-box {
                            margin-top: 16px;
                            font-size: 6.8pt;
                            line-height: 1.22;
                        }

                        .cancellation-fields-row {
                            display: flex;
                            justify-content: space-between;
                            margin-bottom: 6px;
                        }

                        .canc-field {
                            display: flex;
                            align-items: baseline;
                        }

                        .canc-lbl {
                            margin-right: 4px;
                        }

                        .cancellation-principal-center {
                            width: 175px;
                            margin: 8px 0 0 0;
                        }

                        .cancellation-principal-center .sig-name {
                            min-height: 13px;
                            display: block;
                        }

                        .cancellation-principal-center .sig-title {
                            font-size: 6.6pt;
                            margin-top: 1px;
                        }

                        /* Print Rules - Strictly 2 Pages Per Student, NO Borders, NO Spilling Over */
                        @media print {
                            html, body {
                                margin: 0 !important;
                                padding: 0 !important;
                                background-color: #ffffff !important;
                                width: 148mm !important;
                                height: auto !important;
                            }
                            .no-print-toolbar {
                                display: none !important;
                            }
                            .sf9-a5-page {
                                width: 148mm !important;
                                height: 210mm !important;
                                min-height: 210mm !important;
                                max-height: 210mm !important;
                                margin: 0 !important;
                                padding: 6mm 7.5mm 6mm 7.5mm !important;
                                border: none !important;
                                box-shadow: none !important;
                                box-sizing: border-box !important;
                                page-break-inside: avoid !important;
                                break-inside: avoid !important;
                                page-break-after: always !important;
                                break-after: page !important;
                                overflow: hidden !important;
                            }
                            .sf9-a5-page:last-child {
                                page-break-after: avoid !important;
                                break-after: avoid !important;
                            }
                            [contenteditable="true"] {
                                outline: none !important;
                                background-color: transparent !important;
                                box-shadow: none !important;
                            }
                        }
                    </style>
                </head>
                <body>
                    <!-- Interactive Teacher Print & Customization Toolbar -->
                    <div class="no-print-toolbar">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-weight: 700; font-size: 14px;">
                                <i class="bi bi-file-earmark-pdf-fill" style="color: #22c55e; margin-right: 6px;"></i>
                                Official SF9 Report Cards (A5 Batch)
                            </span>
                            <span style="background: rgba(255,255,255,0.15); padding: 3px 8px; border-radius: 4px; font-size: 11px;">
                                ${cards.length} Student(s) &bull; ${escapeHtml(sec.name)}
                            </span>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <span style="font-size: 11px; opacity: 0.85; margin-right: 10px;">
                                <i class="bi bi-pencil me-1"></i> All cells & text are directly editable before printing
                            </span>
                            <a href="Card_SF9.xlsx" download="Official_TSHS_Card_SF9.xlsx" style="background: #0284c7; color: #fff; text-decoration: none; padding: 6px 14px; border-radius: 6px; font-weight: 600; display: flex; align-items: center; gap: 6px; font-size: 13px;">
                                <i class="bi bi-file-earmark-excel"></i> Download Excel
                            </a>
                            <button type="button" onclick="window.print()" style="background: #16a34a; color: #fff; border: none; padding: 6px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                                <i class="bi bi-printer"></i> Print / Save as PDF (A5)
                            </button>
                            <button type="button" onclick="window.close()" style="background: rgba(255,255,255,0.2); color: #fff; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer;">
                                Close
                            </button>
                        </div>
                    </div>

                    <!-- Render All Student Pages -->
                    ${pagesHtml}

                    <script>
                        // Auto-fit long text inputs so they strictly never wrap or overflow
                        function fitTextToWidth(el) {
                            if (!el) return;
                            let currentSize = parseFloat(window.getComputedStyle(el).fontSize);
                            while (el.scrollWidth > el.clientWidth && currentSize > 5) {
                                currentSize -= 0.3;
                                el.style.fontSize = currentSize + 'px';
                            }
                        }
                        window.addEventListener('DOMContentLoaded', () => {
                            document.querySelectorAll('.meta-item .meta-val').forEach(fitTextToWidth);
                        });
                        document.addEventListener('input', (e) => {
                            if (e.target && e.target.classList && e.target.classList.contains('meta-val')) {
                                fitTextToWidth(e.target);
                            }
                        });
                    </script>
                </body>
                </html>
            `;

            const printWin = window.open('', '_blank');
            if (!printWin) {
                alert('Pop-up was blocked. Please allow pop-ups for this website to generate and print report cards.');
                return;
            }

            printWin.document.open();
            printWin.document.write(fullHtml);
            printWin.document.close();

        } catch (err) {
            console.error('generateBulkReportCards error:', err);
            alert('A network or server error occurred while preparing report cards: ' + (err.message || ''));
        } finally {
            triggerBtns.forEach(btn => {
                btn.disabled = false;
                if (btn.dataset.origHtml) btn.innerHTML = btn.dataset.origHtml;
            });
        }
    }

    // Attach Event Listeners for Bulk Print Buttons
    const btnPrintAdvisoryReportCards = document.getElementById('btnPrintAdvisoryReportCards');
    if (btnPrintAdvisoryReportCards) {
        btnPrintAdvisoryReportCards.addEventListener('click', () => generateBulkReportCards(currentSectionId));
    }

    const btnPrintAdvisoryReportCardsBar = document.getElementById('btnPrintAdvisoryReportCardsBar');
    if (btnPrintAdvisoryReportCardsBar) {
        btnPrintAdvisoryReportCardsBar.addEventListener('click', () => generateBulkReportCards(currentSectionId));
    }

    const btnAdvisoryBannerPrint = document.getElementById('btnAdvisoryBannerPrint');
    if (btnAdvisoryBannerPrint) {
        btnAdvisoryBannerPrint.addEventListener('click', () => generateBulkReportCards(currentSectionId));
    }


    // =========================================================================
    // 12.5 Advisory Excuse Letters Review & Verification
    // =========================================================================
    const advisoryExcuseModalEl = document.getElementById('advisoryExcuseModal');
    const advisoryExcuseModal = advisoryExcuseModalEl ? new bootstrap.Modal(advisoryExcuseModalEl) : null;
    const advisoryDeclineExcuseModalEl = document.getElementById('advisoryDeclineExcuseModal');
    const advisoryDeclineExcuseModal = advisoryDeclineExcuseModalEl ? new bootstrap.Modal(advisoryDeclineExcuseModalEl) : null;
    const advProofViewerModalEl = document.getElementById('advProofViewerModal');
    const advProofViewerModal = advProofViewerModalEl ? new bootstrap.Modal(advProofViewerModalEl) : null;
    const advProofViewerTitle = document.getElementById('advProofViewerTitle');
    const advProofViewerSubtitle = document.getElementById('advProofViewerSubtitle');
    const advProofViewerBody = document.getElementById('advProofViewerBody');
    const advProofViewerFileInfo = document.getElementById('advProofViewerFileInfo');
    const advProofViewerNewTabBtn = document.getElementById('advProofViewerNewTabBtn');
    const advProofViewerDownloadBtn = document.getElementById('advProofViewerDownloadBtn');

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    let currentViewerActiveBlobUrl = null;

    function getMimeTypeFromFilename(filename, fallback = 'application/octet-stream') {
        if (!filename || typeof filename !== 'string') return fallback;
        const ext = filename.split('.').pop().toLowerCase();
        const mimeMap = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'ppt': 'application/vnd.ms-powerpoint',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'txt': 'text/plain',
            'csv': 'text/csv',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
            'mp4': 'video/mp4',
            'webm': 'video/webm'
        };
        return mimeMap[ext] || fallback;
    }

    function dataURItoBlob(dataURI, fileName = 'document') {
        if (!dataURI) return new Blob();
        if (!dataURI.includes(',')) return new Blob([dataURI]);
        try {
            const byteString = atob(dataURI.split(',')[1]);
            const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            return new Blob([ab], { type: mimeString });
        } catch (e) {
            return new Blob([dataURI]);
        }
    }

    async function loadFileData(resolvedUrl, fileName = '') {
        if (!resolvedUrl) throw new Error('No valid file URL provided.');
        const ext = (fileName || '').split('.').pop().toLowerCase();
        const isMedia = ['mp4', 'webm', 'ogg', 'mp3', 'wav', 'm4a'].includes(ext);

        if (resolvedUrl.startsWith('data:')) {
            try {
                const res = await fetch(resolvedUrl);
                const blob = await res.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const blobUrl = URL.createObjectURL(blob);
                return { blob, arrayBuffer, blobUrl, mimeType: blob.type || getMimeTypeFromFilename(fileName) };
            } catch (fetchErr) {
                const b = dataURItoBlob(resolvedUrl, fileName);
                if (!b) throw new Error('Could not parse data URI.');
                const arrayBuffer = await b.arrayBuffer();
                const blobUrl = URL.createObjectURL(b);
                return { blob: b, arrayBuffer, blobUrl, mimeType: b.type || getMimeTypeFromFilename(fileName) };
            }
        }

        if (resolvedUrl.startsWith('blob:')) {
            try {
                const res = await fetch(resolvedUrl);
                const blob = await res.blob();
                const arrayBuffer = await blob.arrayBuffer();
                return { blob, arrayBuffer, blobUrl: resolvedUrl, mimeType: blob.type || getMimeTypeFromFilename(fileName) };
            } catch (e) {
                return { blob: null, arrayBuffer: null, blobUrl: resolvedUrl, mimeType: getMimeTypeFromFilename(fileName) };
            }
        }

        if (isMedia && /^https?:\/\//i.test(resolvedUrl)) {
            return {
                blob: null,
                arrayBuffer: null,
                blobUrl: resolvedUrl,
                mimeType: getMimeTypeFromFilename(fileName)
            };
        }

        const token = localStorage.getItem('mentorae_token');
        const headers = {};
        if (token && resolvedUrl.includes('/api/')) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
            const res = await fetch(resolvedUrl, { headers, signal: controller.signal });
            if (!res.ok) {
                let errMsg = `Failed to load file (${res.status} ${res.statusText})`;
                try {
                    const errJson = await res.json();
                    if (errJson && errJson.message) errMsg = errJson.message;
                } catch (e) { }
                throw new Error(errMsg);
            }
            const blob = await res.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const blobUrl = URL.createObjectURL(blob);
            return { blob, arrayBuffer, blobUrl, mimeType: blob.type || getMimeTypeFromFilename(fileName) };
        } catch (fetchErr) {
            if (fetchErr.name === 'AbortError') {
                throw new Error('Connection timed out. The file may be temporarily unreachable.');
            }
            throw fetchErr;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    function paginateDocxContainer(hostEl) {
        if (!hostEl) return;
        const sections = Array.from(hostEl.querySelectorAll('section.docx, .docx-wrapper > section, .docx-paper-sheet'));
        if (!sections.length) return;

        const TARGET_PAGE_HEIGHT = 1056; // Standard 8.5" x 11" Letter page height at 96 DPI
        const PAGE_PADDING_V = 136;
        const USABLE_HEIGHT = TARGET_PAGE_HEIGHT - PAGE_PADDING_V;

        sections.forEach(sec => {
            if (sec.classList.contains('docx-paginated-done')) return;

            if (sec.offsetHeight <= TARGET_PAGE_HEIGHT + 60) {
                if (!sec.querySelector('.docx-page-footer-badge')) {
                    const footer = document.createElement('div');
                    footer.className = 'docx-page-footer-badge';
                    footer.innerHTML = '<span class="docx-page-num-badge">Page 1 of 1</span>';
                    sec.appendChild(footer);
                }
                sec.classList.add('docx-paginated-done');
                return;
            }

            const rawChildren = Array.from(sec.children).filter(c => 
                c.tagName !== 'HEADER' && 
                c.tagName !== 'FOOTER' && 
                !c.classList.contains('docx-page-footer-badge')
            );
            if (rawChildren.length <= 1) return;

            const pages = [];
            let curPageChildren = [];
            let accumulatedH = 0;

            rawChildren.forEach(child => {
                const h = child.offsetHeight || 30;
                if (accumulatedH + h > USABLE_HEIGHT && curPageChildren.length > 0) {
                    pages.push(curPageChildren);
                    curPageChildren = [child];
                    accumulatedH = h;
                } else {
                    curPageChildren.push(child);
                    accumulatedH += h;
                }
            });
            if (curPageChildren.length > 0) {
                pages.push(curPageChildren);
            }

            if (pages.length <= 1) return;

            pages.forEach((pageChildren, pageIdx) => {
                const pageSec = document.createElement('section');
                pageSec.className = `${sec.className} docx-paginated-done`;
                if (sec.style.cssText) pageSec.style.cssText = sec.style.cssText;
                pageSec.style.minHeight = `${TARGET_PAGE_HEIGHT}px`;
                pageSec.style.marginBottom = '32px';
                pageSec.style.position = 'relative';

                pageChildren.forEach(c => pageSec.appendChild(c));

                const pageFooter = document.createElement('div');
                pageFooter.className = 'docx-page-footer-badge';
                pageFooter.innerHTML = `<span class="docx-page-num-badge">Page ${pageIdx + 1} of ${pages.length}</span>`;
                pageSec.appendChild(pageFooter);

                sec.parentNode.insertBefore(pageSec, sec);
            });
            sec.remove();
        });
    }

    async function openClassroomViewer(fileName, resolvedUrl, subtitle = 'Excuse Proof Document', meta = {}, returnModal = null) {
        const viewerEl = document.getElementById('classroomFileViewer');
        const nameEl = document.getElementById('classroomViewerFileName');
        const subEl = document.getElementById('classroomViewerSubtitle');
        const iconEl = document.getElementById('classroomViewerIcon');
        const stageEl = document.getElementById('classroomViewerStage');
        const downloadBtn = document.getElementById('classroomViewerDownloadBtn');
        const popoutBtn = document.getElementById('classroomViewerPopoutBtn');
        const printBtn = document.getElementById('classroomViewerPrintBtn');
        const modeSwitcherEl = document.getElementById('classroomViewerModeSwitcher');

        if (!viewerEl || !stageEl) return;

        // Revoke prior active blob URL
        if (currentViewerActiveBlobUrl && currentViewerActiveBlobUrl.startsWith('blob:')) {
            try { URL.revokeObjectURL(currentViewerActiveBlobUrl); } catch (e) { }
            currentViewerActiveBlobUrl = null;
        }

        viewerEl.classList.remove('d-none');
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        // Track caller modal to restore on close
        let returnModalInstance = null;
        if (returnModal && typeof bootstrap !== 'undefined') {
            returnModalInstance = bootstrap.Modal.getInstance(returnModal) || new bootstrap.Modal(returnModal);
            if (returnModalInstance) returnModalInstance.hide();
        }

        let handleViewerKeydown = null;
        const closeViewer = () => {
            if (handleViewerKeydown) {
                window.removeEventListener('keydown', handleViewerKeydown);
                handleViewerKeydown = null;
            }
            viewerEl.classList.add('d-none');
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
            stageEl.innerHTML = '';
            if (modeSwitcherEl) modeSwitcherEl.innerHTML = '';
            if (currentViewerActiveBlobUrl && currentViewerActiveBlobUrl.startsWith('blob:')) {
                try { URL.revokeObjectURL(currentViewerActiveBlobUrl); } catch (e) { }
                currentViewerActiveBlobUrl = null;
            }
            if (returnModalInstance) {
                returnModalInstance.show();
            }
        };

        const closeBtn = document.getElementById('classroomViewerCloseBtn');
        const backBtn = document.getElementById('classroomViewerBackBtn');
        if (closeBtn) closeBtn.onclick = closeViewer;
        if (backBtn) backBtn.onclick = closeViewer;

        handleViewerKeydown = (e) => {
            if (e.key === 'Escape' && !viewerEl.classList.contains('d-none')) {
                e.preventDefault();
                closeViewer();
            }
        };
        window.addEventListener('keydown', handleViewerKeydown);

        if (nameEl) nameEl.textContent = fileName || 'Document';
        if (subEl) subEl.textContent = subtitle || 'Excuse Proof Document';

        const ext = (fileName || '').split('.').pop().toLowerCase();
        let mime = (meta && meta.type) ? meta.type : getMimeTypeFromFilename(fileName, '');

        if (iconEl) {
            if (ext === 'pdf') {
                iconEl.className = 'bi bi-file-earmark-pdf fs-4 text-danger';
            } else if (ext === 'pptx' || ext === 'ppt') {
                iconEl.className = 'bi bi-file-earmark-slides fs-4 text-warning';
            } else if (ext === 'docx' || ext === 'doc') {
                iconEl.className = 'bi bi-file-earmark-word fs-4 text-primary';
            } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
                iconEl.className = 'bi bi-file-earmark-excel fs-4 text-success';
            } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
                iconEl.className = 'bi bi-file-earmark-image fs-4 text-info';
            } else {
                iconEl.className = 'bi bi-file-earmark-text fs-4 text-light';
            }
        }

        stageEl.innerHTML = `
            <div class="d-flex flex-column align-items-center justify-content-center w-100 h-100 text-white">
                <div class="spinner-border text-success mb-3" style="width: 3.2rem; height: 3.2rem;" role="status"></div>
                <p class="fs-5 fw-semibold mb-1">Loading Document Preview...</p>
                <p class="text-white-50 small">${escapeHtml(fileName || 'Please wait')}</p>
            </div>
        `;
        if (modeSwitcherEl) modeSwitcherEl.innerHTML = '';

        let fileData = null;
        try {
            fileData = await loadFileData(resolvedUrl, fileName);
            if (fileData.blobUrl && fileData.blobUrl.startsWith('blob:')) {
                currentViewerActiveBlobUrl = fileData.blobUrl;
            }
        } catch (err) {
            console.error('Error loading file data:', err);
            stageEl.innerHTML = `
                <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 520px;">
                    <i class="bi bi-file-earmark-x text-warning display-4 mb-3 d-block"></i>
                    <h4 class="fw-bold text-white mb-2">Preview Unavailable</h4>
                    <p class="text-white-50 mb-3">${escapeHtml(fileName || 'File')}</p>
                    <p class="text-secondary small mb-4">${escapeHtml(err.message || 'File could not be opened.')}</p>
                    <div class="d-flex justify-content-center gap-2">
                        <button type="button" class="btn btn-outline-light rounded-pill px-4 fw-semibold" id="closeMissingFileViewerBtn">
                            <i class="bi bi-arrow-left me-2"></i> Close Viewer
                        </button>
                        <a href="${resolvedUrl}&download=1" class="btn btn-success rounded-pill px-4 fw-semibold" download="${escapeHtml(fileName)}">
                            <i class="bi bi-download me-1"></i> Download Directly
                        </a>
                    </div>
                </div>
            `;
            document.getElementById('closeMissingFileViewerBtn')?.addEventListener('click', closeViewer);
            return;
        }

        const activeUrl = fileData?.blobUrl || resolvedUrl;

        // Configure Top Action Buttons
        if (downloadBtn) {
            downloadBtn.href = `${resolvedUrl}&download=1`;
            downloadBtn.setAttribute('download', fileName || 'proof_document');
        }
        if (popoutBtn) {
            popoutBtn.href = activeUrl;
            popoutBtn.target = '_blank';
        }
        if (printBtn) {
            printBtn.onclick = () => {
                const ifr = stageEl.querySelector('iframe');
                if (ifr && ifr.contentWindow) {
                    try {
                        ifr.contentWindow.print();
                        return;
                    } catch (e) { }
                }
                const printWindow = window.open(activeUrl);
                if (printWindow) {
                    printWindow.addEventListener('load', () => printWindow.print(), { once: true });
                } else {
                    window.print();
                }
            };
        }

        // 1. PDF RENDERING (Dual Mode: High-Fidelity Canvas + Native Browser Reader)
        if (ext === 'pdf' || mime.includes('pdf')) {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
            if (isMobile) {
                stageEl.innerHTML = `
                    <div class="d-flex flex-column align-items-center justify-content-center w-100 h-100 text-white p-4">
                        <div class="text-center p-4 bg-dark bg-opacity-75 rounded-4 border border-secondary shadow-lg" style="max-width: 440px; width: 100%;">
                            <i class="bi bi-file-earmark-pdf text-danger" style="font-size: 4.5rem;"></i>
                            <h5 class="fw-bold text-white mt-3 text-truncate mb-1">${escapeHtml(fileName)}</h5>
                            <p class="text-white-50 small mb-4">Tap below to view this PDF in full screen.</p>
                            <a href="${activeUrl}" target="_blank" class="btn btn-danger btn-lg rounded-pill px-4 fw-bold w-100 mb-2">
                                <i class="bi bi-box-arrow-up-right me-2"></i> Open PDF Fullscreen
                            </a>
                            <a href="${activeUrl}" download="${escapeHtml(fileName)}" class="btn btn-outline-light rounded-pill px-4 fw-semibold w-100 btn-sm">
                                <i class="bi bi-download me-1"></i> Save to Device
                            </a>
                        </div>
                    </div>
                `;
                return;
            }

            const renderNativeView = () => {
                if (modeSwitcherEl) {
                    modeSwitcherEl.innerHTML = `
                        <button type="button" class="btn btn-sm btn-outline-light rounded-pill px-2.5 py-0.5 border-0 fw-semibold fs-8" id="pdfSwitchCanvasBtn" title="Switch to Page Canvas View">
                            <i class="bi bi-file-earmark-text me-1"></i> Page Canvas View
                        </button>
                    `;
                    document.getElementById('pdfSwitchCanvasBtn')?.addEventListener('click', () => renderCanvasView());
                }
                stageEl.innerHTML = `
                    <object data="${activeUrl}" type="application/pdf" class="w-100 h-100 border-0" style="background: #525659;">
                        <iframe src="${activeUrl}" class="w-100 h-100 border-0" title="${escapeHtml(fileName)}" style="background: #525659;">
                            <div class="p-5 text-center text-white">
                                <p class="mb-3">Unable to display PDF inline.</p>
                                <a href="${activeUrl}" target="_blank" class="btn btn-danger rounded-pill px-4">Open PDF</a>
                            </div>
                        </iframe>
                    </object>
                `;
            };

            const renderCanvasView = async () => {
                if (!window.pdfjsLib || !fileData || !fileData.arrayBuffer) {
                    renderNativeView();
                    return;
                }

                stageEl.innerHTML = `
                    <div class="docx-viewer-wrapper" id="pdfViewerWrapper">
                        <div id="pdfPagesHost" class="d-flex flex-column align-items-center py-4 w-100">
                            <div class="spinner-border text-danger mb-2" role="status"></div>
                            <span class="text-white-50 small">Rendering PDF Pages...</span>
                        </div>
                    </div>
                `;

                const host = document.getElementById('pdfPagesHost');
                try {
                    if (window.pdfjsLib.GlobalWorkerOptions) {
                        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    }
                    const loadingTask = window.pdfjsLib.getDocument({ data: fileData.arrayBuffer });
                    const pdfDoc = await loadingTask.promise;

                    host.innerHTML = '';
                    let currentZoom = 1.0;

                    if (modeSwitcherEl) {
                        modeSwitcherEl.innerHTML = `
                            <button type="button" class="btn btn-sm btn-outline-light rounded-circle p-1 border-0" id="pdfZoomOutBtn" title="Zoom Out" style="width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;">
                                <i class="bi bi-dash"></i>
                            </button>
                            <span class="text-white-50 px-2 fw-semibold" id="pdfZoomVal" style="font-size: 0.75rem; min-width: 42px; text-align: center;">100%</span>
                            <button type="button" class="btn btn-sm btn-outline-light rounded-circle p-1 border-0" id="pdfZoomInBtn" title="Zoom In" style="width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;">
                                <i class="bi bi-plus"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill px-2 py-0.5 border-0 ms-1 fw-semibold fs-8" id="pdfFitBtn" title="Reset Zoom">
                                Reset
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-light rounded-pill px-2.5 py-0.5 border-0 ms-1.5 fw-semibold fs-8" id="pdfSwitchNativeBtn" title="Open with Native Browser PDF Reader">
                                <i class="bi bi-window me-1"></i> Native Reader
                            </button>
                        `;

                        const updatePdfZoom = (z) => {
                            currentZoom = Math.min(Math.max(0.5, Math.round(z * 100) / 100), 2.5);
                            const zoomValEl = document.getElementById('pdfZoomVal');
                            if (zoomValEl) zoomValEl.textContent = `${Math.round(currentZoom * 100)}%`;
                            host.querySelectorAll('.pdf-page-canvas').forEach(cv => {
                                cv.style.transform = `scale(${currentZoom})`;
                                cv.style.transformOrigin = 'top center';
                            });
                        };

                        document.getElementById('pdfZoomOutBtn')?.addEventListener('click', () => updatePdfZoom(currentZoom - 0.15));
                        document.getElementById('pdfZoomInBtn')?.addEventListener('click', () => updatePdfZoom(currentZoom + 0.15));
                        document.getElementById('pdfFitBtn')?.addEventListener('click', () => updatePdfZoom(1.0));
                        document.getElementById('pdfSwitchNativeBtn')?.addEventListener('click', () => renderNativeView());
                    }

                    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                        const page = await pdfDoc.getPage(pageNum);
                        const viewport = page.getViewport({ scale: 1.5 });

                        const pageCard = document.createElement('div');
                        pageCard.className = 'pdf-page-card mb-4 text-center';
                        pageCard.style.maxWidth = '100%';

                        const canvas = document.createElement('canvas');
                        canvas.className = 'pdf-page-canvas shadow-lg rounded-2';
                        canvas.style.maxWidth = '100%';
                        canvas.style.height = 'auto';
                        canvas.style.background = '#ffffff';
                        canvas.style.transition = 'transform 0.15s ease';

                        const context = canvas.getContext('2d');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;

                        await page.render({ canvasContext: context, viewport: viewport }).promise;

                        pageCard.appendChild(canvas);

                        if (pdfDoc.numPages > 1) {
                            const badge = document.createElement('div');
                            badge.className = 'text-center mt-2 text-white-50 small';
                            badge.textContent = `Page ${pageNum} of ${pdfDoc.numPages}`;
                            pageCard.appendChild(badge);
                        }

                        host.appendChild(pageCard);
                    }
                } catch (pdfErr) {
                    console.warn('PDF.js render notice, switching to native viewer:', pdfErr);
                    renderNativeView();
                }
            };

            await renderCanvasView();
            return;
        }

        // 2. WORD DOCUMENTS (.docx, .doc)
        if (ext === 'docx' || ext === 'doc') {
            stageEl.innerHTML = `
                <div class="docx-viewer-wrapper">
                    <div id="docxPreviewHost" class="docx-preview-host"></div>
                </div>
            `;
            const host = document.getElementById('docxPreviewHost');

            if (modeSwitcherEl) {
                modeSwitcherEl.innerHTML = `
                    <button type="button" class="btn btn-sm btn-outline-light rounded-circle p-1 border-0" id="docxZoomOutBtn" title="Zoom Out" style="width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;">
                        <i class="bi bi-dash"></i>
                    </button>
                    <span class="text-white-50 px-2 fw-semibold" id="docxZoomVal" style="font-size: 0.75rem; min-width: 42px; text-align: center;">100%</span>
                    <button type="button" class="btn btn-sm btn-outline-light rounded-circle p-1 border-0" id="docxZoomInBtn" title="Zoom In" style="width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;">
                        <i class="bi bi-plus"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill px-2 py-0.5 border-0 ms-1 fw-semibold fs-8" id="docxFitBtn" title="Reset Zoom">
                        Reset
                    </button>
                `;
                let currentZoom = 1.0;
                const updateZoom = (z) => {
                    currentZoom = Math.min(Math.max(0.5, Math.round(z * 100) / 100), 2.0);
                    const zoomValEl = document.getElementById('docxZoomVal');
                    if (zoomValEl) zoomValEl.textContent = `${Math.round(currentZoom * 100)}%`;
                    if (host) {
                        host.style.transform = `scale(${currentZoom})`;
                        host.style.transformOrigin = 'top center';
                    }
                };
                document.getElementById('docxZoomOutBtn')?.addEventListener('click', () => updateZoom(currentZoom - 0.15));
                document.getElementById('docxZoomInBtn')?.addEventListener('click', () => updateZoom(currentZoom + 0.15));
                document.getElementById('docxFitBtn')?.addEventListener('click', () => updateZoom(1.0));
            }

            if (ext === 'docx' && window.docx && typeof window.docx.renderAsync === 'function' && fileData.arrayBuffer) {
                try {
                    await window.docx.renderAsync(fileData.arrayBuffer, host, null, {
                        className: 'docx',
                        inWrapper: true,
                        ignoreWidth: false,
                        ignoreHeight: false,
                        ignoreFonts: false,
                        breakPages: true,
                        ignoreLastRenderedPageBreak: false,
                        useBase64URL: true,
                        renderHeaders: true,
                        renderFooters: true,
                        renderFootnotes: true,
                        renderEndnotes: true
                    });
                    paginateDocxContainer(host);
                    setTimeout(() => paginateDocxContainer(host), 60);
                    return;
                } catch (docxErr) {
                    console.warn('docx-preview notice, trying mammoth fallback:', docxErr);
                }
            }

            if (window.mammoth && fileData.arrayBuffer) {
                try {
                    const result = await window.mammoth.convertToHtml({ arrayBuffer: fileData.arrayBuffer });
                    host.innerHTML = `
                        <div class="docx-paper-sheet">
                            ${result.value || '<p class="text-muted fst-italic">Empty Document.</p>'}
                        </div>
                    `;
                    paginateDocxContainer(host);
                    setTimeout(() => paginateDocxContainer(host), 60);
                    return;
                } catch (mErr) {
                    console.warn('mammoth error:', mErr);
                }
            }

            stageEl.innerHTML = `
                <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 500px;">
                    <i class="bi bi-file-earmark-word text-primary" style="font-size: 5rem;"></i>
                    <h4 class="fw-bold text-white mt-3">${escapeHtml(fileName)}</h4>
                    <p class="text-white-50 mb-4">Click download below to view this document in Microsoft Word.</p>
                    <a href="${activeUrl}" download="${escapeHtml(fileName)}" class="btn btn-primary btn-lg rounded-pill px-5 fw-bold">
                        <i class="bi bi-download me-2"></i> Download Document
                    </a>
                </div>
            `;
            return;
        }

        // 3. IMAGES (PNG, JPG, WEBP, GIF, SVG)
        if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) || mime.startsWith('image/')) {
            stageEl.innerHTML = `
                <div class="d-flex align-items-center justify-content-center w-100 h-100 p-4" style="background-color: #0b0c0e;">
                    <img src="${activeUrl}" alt="${escapeHtml(fileName)}" class="img-fluid rounded shadow-lg" style="max-height: 90vh; max-width: 95vw; object-fit: contain;">
                </div>
            `;
            return;
        }

        // 4. SPREADSHEETS (.xlsx, .xls, .csv)
        if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
            if (window.XLSX && fileData.arrayBuffer) {
                try {
                    const wb = window.XLSX.read(fileData.arrayBuffer, { type: 'array' });
                    const sheetNames = wb.SheetNames || [];
                    if (sheetNames.length > 0) {
                        const renderSheet = (sIdx) => {
                            const ws = wb.Sheets[sheetNames[sIdx]];
                            const htmlTable = window.XLSX.utils.sheet_to_html(ws, { editable: false });
                            stageEl.innerHTML = `
                                <div class="spreadsheet-viewer-wrapper">
                                    <div class="spreadsheet-tabs-bar">
                                        <span class="fw-bold text-dark small me-2"><i class="bi bi-file-earmark-spreadsheet text-success me-1"></i>Sheets:</span>
                                        ${sheetNames.map((name, i) => `
                                            <button type="button" class="btn btn-sm ${i === sIdx ? 'btn-success text-white fw-bold' : 'btn-outline-secondary'} rounded-pill px-3 py-1 small sheet-tab-btn" data-sidx="${i}">
                                                <i class="bi bi-table me-1"></i>${escapeHtml(name)}
                                            </button>
                                        `).join('')}
                                    </div>
                                    <div class="spreadsheet-table-container">
                                        ${htmlTable}
                                    </div>
                                </div>
                            `;
                            stageEl.querySelectorAll('.sheet-tab-btn').forEach(btn => {
                                btn.addEventListener('click', () => {
                                    const nextIdx = parseInt(btn.getAttribute('data-sidx'), 10);
                                    renderSheet(nextIdx);
                                });
                            });
                        };
                        renderSheet(0);
                        return;
                    }
                } catch (e) {
                    console.warn('XLSX render error:', e);
                }
            }
        }

        // 5. GENERIC / FALLBACK PREVIEW
        stageEl.innerHTML = `
            <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 500px;">
                <i class="bi bi-file-earmark-text text-secondary" style="font-size: 5rem;"></i>
                <h4 class="fw-bold text-white mt-3">${escapeHtml(fileName)}</h4>
                <p class="text-white-50 mb-4">Click download below to save and open this attachment on your device.</p>
                <div class="d-flex justify-content-center gap-2">
                    <a href="${activeUrl}" download="${escapeHtml(fileName)}" class="btn btn-primary btn-lg rounded-pill px-4 fw-bold">
                        <i class="bi bi-download me-2"></i> Download File
                    </a>
                    <a href="${activeUrl}" target="_blank" class="btn btn-outline-light btn-lg rounded-pill px-4">
                        <i class="bi bi-box-arrow-up-right me-1"></i> Open in New Tab
                    </a>
                </div>
            </div>
        `;
    }

    const btnAdvisoryExcuseNotes = document.getElementById('btnAdvisoryExcuseNotes');
    const advisoryExcusePendingBadge = document.getElementById('advisoryExcusePendingBadge');
    const advTabPendingBadge = document.getElementById('advTabPendingBadge');
    const advTabApprovedBadge = document.getElementById('advTabApprovedBadge');
    const advTabRejectedBadge = document.getElementById('advTabRejectedBadge');
    const advTabAllBadge = document.getElementById('advTabAllBadge');
    const advisoryExcuseNotesContainer = document.getElementById('advisoryExcuseNotesContainer');
    const advExcuseModalSearch = document.getElementById('advExcuseModalSearch');
    const btnRefreshAdvExcuseNotes = document.getElementById('btnRefreshAdvExcuseNotes');
    const btnAdvConfirmDeclineExcuse = document.getElementById('btnAdvConfirmDeclineExcuse');
    const advDeclineRemarksInput = document.getElementById('advDeclineRemarksInput');
    const advDeclineNoteIdInput = document.getElementById('advDeclineNoteId');

    let advisoryExcuseNotes = [];
    let currentAdvExcuseStatusTab = 'pending';

    async function loadAdvisoryExcuseNotes() {
        try {
            const activeSec = mySections.find(s => String(s.id) === String(currentSectionId));
            const secParam = (activeSec && activeSec.id) ? `?sectionId=${activeSec.id}` : '';
            const res = await authedFetch(`/api/attendance/excuse-notes${secParam}`, token);

            if (res && res.success && Array.isArray(res.notes)) {
                advisoryExcuseNotes = res.notes;

                const summary = res.summary || {
                    total: res.notes.length,
                    pending: res.notes.filter(n => n.status === 'pending').length,
                    approved: res.notes.filter(n => n.status === 'approved').length,
                    rejected: res.notes.filter(n => n.status === 'rejected').length,
                };

                // Update advisory banner button badge
                if (advisoryExcusePendingBadge) {
                    if (summary.pending > 0) {
                        advisoryExcusePendingBadge.textContent = summary.pending > 9 ? '9+' : summary.pending;
                        advisoryExcusePendingBadge.classList.remove('d-none');
                    } else {
                        advisoryExcusePendingBadge.classList.add('d-none');
                    }
                }

                // Update modal tab badges
                if (advTabPendingBadge) advTabPendingBadge.textContent = summary.pending;
                if (advTabApprovedBadge) advTabApprovedBadge.textContent = summary.approved;
                if (advTabRejectedBadge) advTabRejectedBadge.textContent = summary.rejected;
                if (advTabAllBadge) advTabAllBadge.textContent = summary.total;

                renderAdvisoryExcuseNotesList();
            } else {
                if (advisoryExcuseNotesContainer) {
                    advisoryExcuseNotesContainer.innerHTML = '<div class="text-center py-4 text-muted">No excuse letters found.</div>';
                }
            }
        } catch (err) {
            console.error('loadAdvisoryExcuseNotes error:', err);
            if (advisoryExcuseNotesContainer) {
                advisoryExcuseNotesContainer.innerHTML = '<div class="text-center py-4 text-danger"><i class="bi bi-exclamation-triangle me-1"></i>Could not load excuse letters.</div>';
            }
        }
    }

    function renderAdvisoryExcuseNotesList() {
        if (!advisoryExcuseNotesContainer) return;

        const query = (advExcuseModalSearch ? advExcuseModalSearch.value : '').toLowerCase().trim();

        const filtered = advisoryExcuseNotes.filter(n => {
            const matchesTab = currentAdvExcuseStatusTab === 'all' || n.status === currentAdvExcuseStatusTab;
            const matchesQuery = !query ||
                (n.student_name && n.student_name.toLowerCase().includes(query)) ||
                (n.student_lrn && n.student_lrn.toLowerCase().includes(query)) ||
                (n.parent_name && n.parent_name.toLowerCase().includes(query)) ||
                (n.reason && n.reason.toLowerCase().includes(query)) ||
                (n.section_name && n.section_name.toLowerCase().includes(query));
            return matchesTab && matchesQuery;
        });

        if (!filtered.length) {
            let emptyMsg = 'No excuse letters found.';
            if (currentAdvExcuseStatusTab === 'pending') emptyMsg = 'No pending excuse letters waiting for review.';
            else if (currentAdvExcuseStatusTab === 'approved') emptyMsg = 'No approved excuse letters yet.';
            else if (currentAdvExcuseStatusTab === 'rejected') emptyMsg = 'No declined excuse letters.';

            advisoryExcuseNotesContainer.innerHTML = `
                <div class="text-center py-5 bg-white rounded-3 border">
                    <i class="bi bi-inbox fs-1 text-muted opacity-50 d-block mb-2"></i>
                    <h6 class="fw-bold text-dark m-0">${emptyMsg}</h6>
                    <p class="text-muted small m-0 mt-1">Submitted parent excuse letters for your advisory students will appear here.</p>
                </div>
            `;
            return;
        }

        advisoryExcuseNotesContainer.innerHTML = filtered.map(n => {
            let statusBadge = '';
            if (n.status === 'pending') {
                statusBadge = '<span class="excuse-status-badge excuse-status-pending"><i class="bi bi-hourglass-split me-1"></i>Pending Review</span>';
            } else if (n.status === 'approved') {
                statusBadge = '<span class="excuse-status-badge excuse-status-approved"><i class="bi bi-patch-check-fill me-1"></i>Certified &amp; Approved</span>';
            } else {
                statusBadge = '<span class="excuse-status-badge excuse-status-rejected"><i class="bi bi-x-circle-fill me-1"></i>Declined</span>';
            }

            // Reason Pill formatting
            let reasonIcon = 'bi-file-earmark-medical';
            const reasonLower = (n.reason || '').toLowerCase();
            if (reasonLower.includes('emergency') || reasonLower.includes('family')) reasonIcon = 'bi-shield-exclamation';
            else if (reasonLower.includes('activity') || reasonLower.includes('school')) reasonIcon = 'bi-trophy';
            else if (reasonLower.includes('weather') || reasonLower.includes('flood') || reasonLower.includes('transport')) reasonIcon = 'bi-cloud-rain';
            else if (reasonLower.includes('bereavement')) reasonIcon = 'bi-heartbreak';

            const reasonPill = `<span class="excuse-reason-pill"><i class="bi ${reasonIcon}"></i>${n.reason || 'Absence Excuse'}</span>`;

            // Formatted absence date
            let absDateStr = n.absence_date || '—';
            try {
                const [y, m, d] = n.absence_date.split('-').map(Number);
                const dObj = new Date(y, m - 1, d);
                absDateStr = dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
            } catch (_) {}

            // Filed on date
            const filedStr = n.created_at ? new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

            // Review Info block
            let reviewInfoHtml = '';
            if (n.status === 'approved') {
                const reviewedDate = n.reviewed_at ? new Date(n.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
                reviewInfoHtml = `
                    <div class="excuse-review-info mt-2.5 d-flex align-items-center justify-content-between flex-wrap gap-2">
                        <div>
                            <i class="bi bi-check-circle-fill me-1"></i> <strong>Certified &amp; Excused</strong> by ${n.reviewer_name || 'Class Adviser'} ${reviewedDate ? `on ${reviewedDate}` : ''}
                            ${n.review_remarks ? `<div class="mt-1 small text-dark opacity-85"><em>"${n.review_remarks}"</em></div>` : ''}
                        </div>
                    </div>
                `;
            } else if (n.status === 'rejected') {
                const reviewedDate = n.reviewed_at ? new Date(n.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
                reviewInfoHtml = `
                    <div class="excuse-review-info declined mt-2.5">
                        <div>
                            <i class="bi bi-x-circle-fill me-1"></i> <strong>Declined</strong> by ${n.reviewer_name || 'Class Adviser'} ${reviewedDate ? `on ${reviewedDate}` : ''}
                        </div>
                        ${n.review_remarks ? `<div class="mt-1 small fw-medium">Reason: "${n.review_remarks}"</div>` : ''}
                    </div>
                `;
            }

            // Action buttons (for pending items)
            let actionsHtml = '';
            if (n.status === 'pending') {
                actionsHtml = `
                    <div class="d-flex align-items-center gap-2 mt-3 pt-2 border-top justify-content-end flex-wrap">
                        <button type="button" class="btn btn-sm btn-outline-danger px-3 py-1.5 fw-semibold d-inline-flex align-items-center gap-1.5 btn-adv-decline-excuse" data-id="${n.id}" data-student="${n.student_name}">
                            <i class="bi bi-x-circle"></i> Decline
                        </button>
                        <button type="button" class="btn btn-sm btn-success px-4 py-1.5 fw-bold d-inline-flex align-items-center gap-1.5 shadow-sm btn-adv-certify-excuse" data-id="${n.id}" data-student="${n.student_name}">
                            <i class="bi bi-check2-circle fs-6"></i> Certify &amp; Approve
                        </button>
                    </div>
                `;
            }

            // Supporting Document / Proof File Section
            let proofSectionHtml = '';
            if (n.has_proof || n.proof_file_name) {
                const pType = (n.proof_file_type || '').toLowerCase();
                const pName = n.proof_file_name || 'proof-document';
                const isImg = pType.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(pName);
                const isPdf = pType.includes('pdf') || /\.pdf$/i.test(pName);
                const isDoc = pType.includes('word') || pType.includes('document') || /\.(doc|docx)$/i.test(pName);

                let docIcon = 'bi-file-earmark-text';
                let iconColor = 'text-primary';
                let typeBadge = 'DOCUMENT';
                if (isImg) { docIcon = 'bi-file-earmark-image-fill'; iconColor = 'text-info'; typeBadge = 'PHOTO / IMAGE'; }
                else if (isPdf) { docIcon = 'bi-file-earmark-pdf-fill'; iconColor = 'text-danger'; typeBadge = 'PDF DOCUMENT'; }
                else if (isDoc) { docIcon = 'bi-file-earmark-word-fill'; iconColor = 'text-primary'; typeBadge = 'WORD DOCUMENT'; }

                const sizeStr = n.proof_file_size ? `${(n.proof_file_size / 1024).toFixed(1)} KB` : '';
                const proofUrl = `${API_BASE}/api/attendance/excuse-notes/${n.id}/proof?token=${token}`;

                proofSectionHtml = `
                    <div class="mt-3 p-3 rounded-3 border bg-light d-flex align-items-center justify-content-between flex-wrap gap-2 excuse-proof-box">
                        <div class="d-flex align-items-center gap-2.5 min-w-0">
                            <div class="p-2 rounded-2 bg-white border ${iconColor} flex-shrink-0 d-flex align-items-center justify-content-center" style="width: 38px; height: 38px;">
                                <i class="bi ${docIcon} fs-4"></i>
                            </div>
                            <div class="min-w-0">
                                <div class="d-flex align-items-center gap-1.5 flex-wrap">
                                    <span class="badge bg-secondary-subtle text-secondary border fw-bold" style="font-size: 0.68rem;">${typeBadge}</span>
                                    <span class="fw-semibold text-dark text-sm text-truncate" style="max-width: 280px;" title="${escapeHtml(pName)}">${escapeHtml(pName)}</span>
                                </div>
                                <div class="micro-text text-muted mt-0.5">
                                    ${sizeStr ? `${sizeStr} &bull; ` : ''}Attached as Medical/Absence Proof
                                </div>
                            </div>
                        </div>
                        <div class="d-flex align-items-center gap-2 ms-auto me-1">
                            <button type="button" class="btn btn-sm btn-outline-success fw-bold rounded-pill px-3 py-1.5 d-inline-flex align-items-center gap-1 btn-adv-view-proof shadow-xs" data-id="${n.id}" data-name="${escapeHtml(pName)}" data-type="${pType}" data-student="${escapeHtml(n.student_name)}" data-url="${proofUrl}">
                                <i class="bi bi-eye-fill"></i> View Proof
                            </button>
                            <a href="${proofUrl}&download=1" class="btn btn-sm btn-outline-secondary rounded-pill px-2.5 py-1.5 ms-1" title="Download Proof File" download="${escapeHtml(pName)}">
                                <i class="bi bi-download"></i>
                            </a>
                        </div>
                    </div>
                `;
            } else {
                proofSectionHtml = `
                    <div class="mt-2 text-muted micro-text fst-italic">
                        <i class="bi bi-paperclip me-1"></i>No supporting document attached to this excuse note.
                    </div>
                `;
            }

            return `
                <div class="excuse-note-card p-3.5 p-md-4 shadow-sm bg-white" id="advExcuseCard_${n.id}">
                    <div class="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2 mb-2 pb-2 border-bottom">
                        <div class="d-flex align-items-center gap-2 flex-wrap">
                            <span class="badge bg-dark text-white px-2.5 py-1 rounded-2">
                                <i class="bi bi-calendar-event me-1 text-warning"></i> Date of Absence: <strong>${absDateStr}</strong>
                            </span>
                            ${reasonPill}
                            ${n.section_name ? `<span class="badge bg-light text-secondary border px-2 py-1"><i class="bi bi-people me-1"></i>${n.section_name}</span>` : ''}
                        </div>
                        <div>
                            ${statusBadge}
                        </div>
                    </div>

                    <div class="row g-3">
                        <div class="col-12 col-md-6">
                            <div class="d-flex align-items-start gap-2.5">
                                <div class="bg-light text-success rounded-circle p-2 d-flex align-items-center justify-content-center flex-shrink-0" style="width: 36px; height: 36px;">
                                    <i class="bi bi-person-fill fs-5"></i>
                                </div>
                                <div>
                                    <div class="fw-bold text-dark fs-6">${n.student_name}</div>
                                    <div class="small text-muted">LRN: <span class="font-monospace">${n.student_lrn || '—'}</span> &bull; Grade ${n.grade_level || n.section_grade || '11/12'}</div>
                                </div>
                            </div>
                        </div>

                        <div class="col-12 col-md-6">
                            <div class="d-flex align-items-start gap-2.5">
                                <div class="bg-light text-primary rounded-circle p-2 d-flex align-items-center justify-content-center flex-shrink-0" style="width: 36px; height: 36px;">
                                    <i class="bi bi-person-heart fs-5"></i>
                                </div>
                                <div>
                                    <div class="fw-bold text-dark fs-6">${n.parent_name || 'Parent / Guardian'}</div>
                                    <div class="small text-muted">
                                        ${n.parent_contact ? `<i class="bi bi-telephone me-1"></i>${n.parent_contact}` : ''}
                                        ${n.parent_email ? ` &bull; <i class="bi bi-envelope me-1"></i>${n.parent_email}` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Parent Explanation / Remarks -->
                    <div class="mt-3">
                        <label class="form-label small text-muted fw-semibold mb-1"><i class="bi bi-chat-quote-fill me-1 text-secondary"></i>Parent Explanation &amp; Remarks:</label>
                        <div class="excuse-remarks-box">
                            ${n.remarks ? n.remarks : '<span class="text-muted fst-italic">No additional remarks provided.</span>'}
                        </div>
                        <div class="text-end text-muted mt-1" style="font-size: 0.72rem;">
                            Submitted on: ${filedStr}
                        </div>
                    </div>

                    ${proofSectionHtml}
                    ${reviewInfoHtml}
                    ${actionsHtml}
                </div>
            `;
        }).join('');

        // Wire View Proof Buttons
        advisoryExcuseNotesContainer.querySelectorAll('.btn-adv-view-proof').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name') || 'Supporting Document';
                const type = (btn.getAttribute('data-type') || '').toLowerCase();
                const student = btn.getAttribute('data-student') || '';
                const url = btn.getAttribute('data-url');
                if (!id || !url) return;

                const subtitle = student ? `Excuse Proof Document • ${student}` : 'Excuse Proof Document';
                openClassroomViewer(name, url, subtitle, { id, name, type, student }, advisoryExcuseModalEl);
            });
        });

        // Wire Certify & Decline Buttons
        advisoryExcuseNotesContainer.querySelectorAll('.btn-adv-certify-excuse').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                if (!id) return;

                btn.disabled = true;
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Certifying...';

                try {
                    const res = await authedFetch(`/api/attendance/excuse-notes/${id}`, token, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: 'approved' })
                    });

                    if (res && res.success) {
                        await loadAdvisoryExcuseNotes();
                        if (typeof loadRoster === 'function') loadRoster();
                    } else {
                        alert(res.message || 'Could not certify excuse letter.');
                        btn.disabled = false;
                        btn.innerHTML = '<i class="bi bi-check2-circle fs-6"></i> Certify &amp; Approve';
                    }
                } catch (err) {
                    console.error('Certify excuse error:', err);
                    alert('An error occurred while certifying the excuse note.');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-check2-circle fs-6"></i> Certify &amp; Approve';
                }
            });
        });

        advisoryExcuseNotesContainer.querySelectorAll('.btn-adv-decline-excuse').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                if (!id) return;
                if (advDeclineNoteIdInput) advDeclineNoteIdInput.value = id;
                if (advDeclineRemarksInput) advDeclineRemarksInput.value = '';
                if (advisoryDeclineExcuseModal) advisoryDeclineExcuseModal.show();
            });
        });
    }

    // Modal tabs event wiring
    const advExcuseTabFilters = document.getElementById('advisoryExcuseTabFilters');
    if (advExcuseTabFilters) {
        advExcuseTabFilters.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                advExcuseTabFilters.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentAdvExcuseStatusTab = btn.getAttribute('data-status') || 'all';
                renderAdvisoryExcuseNotesList();
            });
        });
    }

    if (advExcuseModalSearch) {
        advExcuseModalSearch.addEventListener('input', renderAdvisoryExcuseNotesList);
    }

    if (btnRefreshAdvExcuseNotes) {
        btnRefreshAdvExcuseNotes.addEventListener('click', loadAdvisoryExcuseNotes);
    }

    if (btnAdvisoryExcuseNotes) {
        btnAdvisoryExcuseNotes.addEventListener('click', () => {
            if (advisoryExcuseModal) advisoryExcuseModal.show();
            loadAdvisoryExcuseNotes();
        });
    }

    if (btnAdvConfirmDeclineExcuse) {
        btnAdvConfirmDeclineExcuse.addEventListener('click', async () => {
            const id = advDeclineNoteIdInput ? advDeclineNoteIdInput.value : '';
            const remarks = advDeclineRemarksInput ? advDeclineRemarksInput.value.trim() : '';
            if (!id) return;

            btnAdvConfirmDeclineExcuse.disabled = true;
            btnAdvConfirmDeclineExcuse.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Declining...';

            try {
                const res = await authedFetch(`/api/attendance/excuse-notes/${id}`, token, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        status: 'rejected',
                        reviewRemarks: remarks
                    })
                });

                if (res && res.success) {
                    if (advisoryDeclineExcuseModal) advisoryDeclineExcuseModal.hide();
                    await loadAdvisoryExcuseNotes();
                } else {
                    alert(res.message || 'Could not decline excuse note.');
                }
            } catch (err) {
                console.error('Decline excuse error:', err);
                alert('An error occurred while declining the excuse note.');
            } finally {
                btnAdvConfirmDeclineExcuse.disabled = false;
                btnAdvConfirmDeclineExcuse.innerHTML = '<i class="bi bi-x-circle me-1"></i> Confirm Decline';
            }
        });
    }

    // =========================================================================
    // 13. Initial Bootstrapping
    // =========================================================================
    await Promise.all([
        loadSections(),
        loadBadgeCatalog()
    ]);
});

