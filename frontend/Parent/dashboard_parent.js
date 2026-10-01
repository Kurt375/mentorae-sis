document.addEventListener('DOMContentLoaded', async () => {
    // 1. Session Guard & Role Check
    const { token, user } = requireSession('../login.html');
    if (user && user.role !== 'parent' && user.role !== 'admin') {
        window.location.href = '../login.html';
        return;
    }

    // 2. Display Parent / Guardian Identity
    const parentNameEl = document.getElementById('parentNameDisplay');
    if (parentNameEl) {
        parentNameEl.textContent = user.full_name || 'Parent / Guardian';
    }

    authedFetch('/api/auth/profile', token).then((data) => {
        if (data.success && data.profile && data.profile.profilePictureUrl) {
            const img = document.getElementById('dashboardAvatarImg');
            const icon = document.getElementById('dashboardAvatarIcon');
            if (img && icon) {
                img.src = data.profile.profilePictureUrl;
                img.classList.remove('d-none');
                icon.classList.add('d-none');
            }
        }
    }).catch(() => {});

    // 3. Wire Logout Action
    wireLogout('logoutBtn', '../login.html', token);

    // 4. Initialize Role-Aware Notification Bell Widget
    if (typeof initNotificationBell === 'function') {
        try {
            initNotificationBell('notifBellBtn', token, 'parent');
        } catch (e) {
            console.error('Failed to initialize notifications widget:', e);
        }
    }

    // 5. Live Real-Time Clock Sync
    const dateEl = document.getElementById('liveDate');
    const timeEl = document.getElementById('liveTime');

    function updateClock() {
        const now = new Date();
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', dateOptions);

        if (timeEl) {
            timeEl.textContent = now.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
        }
    }
    updateClock();
    setInterval(updateClock, 1000);

    // 6. DOM References for Monitored Student Card & Stats
    const childNameEl = document.getElementById('childProfileName');
    const childMetaEl = document.getElementById('childProfileMeta');
    const childStatusBadge = document.getElementById('childStatusBadge');
    const childStatusDot = document.getElementById('childStatusDot');
    const childStatusText = document.getElementById('childStatusText');

    const overallGradeEl = document.getElementById('overallGradeVal');
    const attendanceRateEl = document.getElementById('attendanceRateVal');
    const academicProgressEl = document.getElementById('academicProgressVal');

    const linkAttendance = document.getElementById('linkAttendance');
    const linkGradePerformance = document.getElementById('linkGradePerformance');
    const childrenSelectorContainer = document.getElementById('childrenSelectorContainer');
    const childSelectDropdown = document.getElementById('childSelectDropdown');
    const announcementsBadge = document.getElementById('announcementsBadge');

    let childrenList = [];
    let currentChildIndex = 0;

    function renderChildData(child) {
        if (!child) {
            if (childNameEl) childNameEl.textContent = 'No Linked Student';
            if (childMetaEl) childMetaEl.textContent = 'Contact the school administration to link your student account.';
            if (childStatusBadge) {
                childStatusBadge.className = 'badge badge-status-empty fw-bold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5';
            }
            if (childStatusDot) childStatusDot.className = 'status-dot-mini dot-empty';
            if (childStatusText) childStatusText.textContent = 'No record';

            if (overallGradeEl) overallGradeEl.textContent = '—';
            if (attendanceRateEl) attendanceRateEl.textContent = '—';
            if (academicProgressEl) {
                academicProgressEl.textContent = '—';
                academicProgressEl.className = 'fw-bold m-0 fs-3 text-secondary';
            }

            if (linkAttendance) linkAttendance.href = 'attendance_parent.html';
            if (linkGradePerformance) linkGradePerformance.href = 'grade_performance_parent.html';
            const childProfileLink = document.getElementById('childProfileLink');
            if (childProfileLink) childProfileLink.href = '#';
            return;
        }

        // Child Profile Name & Meta Details
        if (childNameEl) childNameEl.textContent = child.name || 'Student';
        const idInfo = child.idNumber ? ` | ID: ${child.idNumber}` : '';
        if (childMetaEl) childMetaEl.textContent = `${child.section || 'Senior High School'}${idInfo}`;

        // Attendance Today Status Badge with High Contrast
        const status = (child.lastStatus || '').toLowerCase();
        if (childStatusBadge && childStatusDot && childStatusText) {
            if (status === 'present') {
                childStatusBadge.className = 'badge badge-status-present fw-bold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5';
                childStatusDot.className = 'status-dot-mini dot-present';
                childStatusText.textContent = 'Present Today';
            } else if (status === 'late') {
                childStatusBadge.className = 'badge badge-status-late fw-bold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5';
                childStatusDot.className = 'status-dot-mini dot-late';
                childStatusText.textContent = 'Late Today';
            } else if (status === 'absent') {
                childStatusBadge.className = 'badge badge-status-absent fw-bold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5';
                childStatusDot.className = 'status-dot-mini dot-absent';
                childStatusText.textContent = 'Absent Today';
            } else {
                childStatusBadge.className = 'badge badge-status-empty fw-bold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5';
                childStatusDot.className = 'status-dot-mini dot-empty';
                childStatusText.textContent = 'No record yet';
            }
        }

        // Overall Grade
        const grade = child.overallGrade;
        if (overallGradeEl) {
            overallGradeEl.textContent = (grade !== null && grade !== undefined && grade !== '') ? `${grade}%` : '—';
        }

        // Attendance Rate
        const attendance = child.attendanceRate;
        if (attendanceRateEl) {
            attendanceRateEl.textContent = (attendance !== null && attendance !== undefined && attendance !== '') ? `${attendance}%` : '—';
        }

        // Academic Progress Label & Color
        let progressLabel = '—';
        let progressColorClass = 'text-purple';
        if (grade !== null && grade !== undefined && grade !== '') {
            const numGrade = Number(grade);
            if (numGrade >= 90) {
                progressLabel = 'Excellent';
                progressColorClass = 'text-success';
            } else if (numGrade >= 80) {
                progressLabel = 'Good';
                progressColorClass = 'text-primary';
            } else if (numGrade >= 75) {
                progressLabel = 'Fair';
                progressColorClass = 'text-warning';
            } else {
                progressLabel = 'Needs Attention';
                progressColorClass = 'text-danger';
            }
        }
        if (academicProgressEl) {
            academicProgressEl.textContent = progressLabel;
            academicProgressEl.className = `fw-bold m-0 fs-3 ${progressColorClass}`;
        }

        // Dynamic Quick Access Links for the Active Child
        const childProfileLink = document.getElementById('childProfileLink');
        if (childProfileLink) {
            childProfileLink.href = `grade_performance_parent.html?studentId=${child.id}`;
        }
        if (linkAttendance) {
            linkAttendance.href = `attendance_parent.html?studentId=${child.id}`;
        }
        if (linkGradePerformance) {
            linkGradePerformance.href = `grade_performance_parent.html?studentId=${child.id}`;
        }
    }

    // 7. Load Linked Children from Backend API
    async function loadLinkedChildren() {
        try {
            const data = await authedFetch('/api/parent/children', token);
            if (!data || !data.success || !Array.isArray(data.children) || data.children.length === 0) {
                renderChildData(null);
                return;
            }

            childrenList = data.children;

            // Multi-child switcher dropdown
            if (childrenList.length > 1 && childrenSelectorContainer && childSelectDropdown) {
                childrenSelectorContainer.classList.remove('d-none');
                childSelectDropdown.innerHTML = childrenList.map((c, idx) =>
                    `<option value="${idx}">Student: ${c.name}</option>`
                ).join('');

                childSelectDropdown.addEventListener('change', (e) => {
                    currentChildIndex = parseInt(e.target.value, 10) || 0;
                    renderChildData(childrenList[currentChildIndex]);
                });
            }

            renderChildData(childrenList[0]);
        } catch (err) {
            console.error('Error fetching parent children:', err);
            renderChildData(null);
        }
    }

    // 8. Load Active Announcements Count for Quick Access Badge
    async function loadAnnouncementsCount() {
        const badge = announcementsBadge || document.getElementById('announcementsBadge') || document.getElementById('announcementsCardBadge');
        if (!badge) return;
        try {
            const data = await authedFetch('/api/announcements', token);
            if (data && data.success && Array.isArray(data.announcements)) {
                const unseenCount = typeof getUnseenAnnouncementsCount === 'function'
                    ? getUnseenAnnouncementsCount(data.announcements)
                    : 0;
                if (unseenCount > 0) {
                    badge.textContent = unseenCount > 9 ? '9+' : String(unseenCount);
                    badge.classList.remove('d-none');
                } else {
                    badge.classList.add('d-none');
                }
            } else {
                badge.classList.add('d-none');
            }
        } catch (e) {
            // Non-critical, ignore error
        }
    }

    // Execute loaders
    await loadLinkedChildren();
    loadAnnouncementsCount();
    window.addEventListener('pageshow', loadAnnouncementsCount);
    window.addEventListener('focus', loadAnnouncementsCount);
});