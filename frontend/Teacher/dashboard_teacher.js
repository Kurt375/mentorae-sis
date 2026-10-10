document.addEventListener('DOMContentLoaded', function () {
    const { token, user } = requireSession('../login.html');

    document.getElementById('teacherNameDisplay').textContent = user.full_name;

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
    }).catch(() => { });

    authedFetch('/api/auth/status-summary', token).then((data) => {
        if (!data.success) return;
        const termEl = document.getElementById('teacherTermDisplay');
        if (termEl) {
            termEl.textContent = [data.summary.semester, data.summary.schoolYear].filter(Boolean).join(' • ') || '—';
        }

        const advContainer = document.getElementById('teacherAdvisoryContainer');
        const advName = document.getElementById('teacherAdvisoryName');
        if (advContainer && advName) {
            if (data.summary.advisoryClass) {
                advName.textContent = data.summary.advisoryClass;
                advContainer.classList.remove('d-none');
            } else {
                advContainer.classList.add('d-none');
            }
        }

        if (data.summary.metrics) {
            const { totalStudents, classAverage, studentLabel } = data.summary.metrics;
            const studentsEl = document.getElementById('teacherTotalStudents');
            const studentsLabelEl = document.getElementById('teacherTotalStudentsLabel');
            const avgEl = document.getElementById('teacherClassAverage');
            if (studentsEl && totalStudents != null) studentsEl.textContent = totalStudents;
            if (studentsLabelEl) studentsLabelEl.textContent = studentLabel || 'Total Students Handled';
            if (avgEl && classAverage != null) avgEl.textContent = `${classAverage}%`;
        }

        if (Array.isArray(data.summary.recentActivity) && data.summary.recentActivity.length > 0) {
            const container = document.getElementById('teacherRecentActivityContainer');
            if (container) {
                container.innerHTML = '';
                data.summary.recentActivity.forEach((act) => {
                    const row = document.createElement('div');
                    row.className = 'activity-row-item p-3 border rounded-3 d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2';

                    let dotColor = 'bg-primary';
                    if (act.type === 'excuse_note') dotColor = 'bg-warning';
                    else if (act.type === 'scan') dotColor = 'bg-success';

                    const timeDisplay = act.date ? new Date(act.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Recent';
                    row.innerHTML = `
                        <div class="d-flex align-items-center gap-2">
                            <span class="status-indicator-dot ${dotColor}"></span>
                            <span class="text-dark fw-medium text-sm">${act.title} — <span class="text-muted">${act.description}</span></span>
                        </div>
                        <span class="text-muted micro-text tracking-sm">${timeDisplay}</span>
                    `;
                    container.appendChild(row);
                });
            }
        }
    }).catch(() => { });

    const liveDateElement = document.getElementById('liveDate');
    const liveTimeElement = document.getElementById('liveTime');

    function updateDateTime() {
        const now = new Date();
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        liveDateElement.textContent = now.toLocaleDateString('en-US', dateOptions);
        const timeOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true };
        liveTimeElement.textContent = now.toLocaleTimeString('en-US', timeOptions);
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    // 1. Announcements Quick Access Card Badge
    let cachedAnnouncements = [];
    async function loadAnnouncementsBadge() {
        const badge = document.getElementById('announcementsCardBadge');
        if (!badge) return;
        try {
            const data = await authedFetch('/api/announcements', token);
            if (data && data.success && Array.isArray(data.announcements)) {
                cachedAnnouncements = data.announcements;
                const unseenCount = typeof getUnseenAnnouncementsCount === 'function'
                    ? getUnseenAnnouncementsCount(data.announcements, user)
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
            badge.classList.add('d-none');
        }
    }

    const annLink = document.getElementById('announcementsCardLink');
    if (annLink) {
        annLink.addEventListener('click', () => {
            const badge = document.getElementById('announcementsCardBadge');
            if (badge) badge.classList.add('d-none');
            if (typeof markAnnouncementsAsSeen === 'function' && cachedAnnouncements.length > 0) {
                markAnnouncementsAsSeen(cachedAnnouncements, user);
            }
        });
    }

    loadAnnouncementsBadge();
    window.addEventListener('pageshow', loadAnnouncementsBadge);
    window.addEventListener('focus', loadAnnouncementsBadge);
    window.addEventListener('mentorae:announcements-seen', loadAnnouncementsBadge);

    // 2. Attendance Confirmation Quick Access Card Badge & Advisory Excuse Badge
    async function loadAttendanceConfirmationBadge() {
        const badge = document.getElementById('attendanceCardBadge');
        const advExcuseBadge = document.getElementById('teacherAdvisoryExcuseBadge');

        try {
            const data = await authedFetch('/api/attendance/teacher-pending-summary', token);
            if (data && data.success && typeof data.pendingCount === 'number') {
                const todayStr = data.scanDate || new Date().toISOString().slice(0, 10);
                const seenKey = `mentorae_teacher_seen_attendance_${user.id}_${todayStr}`;
                const lastSeen = parseInt(localStorage.getItem(seenKey) || '0', 10);
                const latestActivity = Number(data.latestActivityTimestamp || 0);

                // Badge only displays if there are unconfirmed items AND they occurred after teacher last viewed/confirmed
                if (badge) {
                    if (data.pendingCount > 0 && latestActivity > lastSeen) {
                        badge.textContent = data.pendingCount > 9 ? '9+' : String(data.pendingCount);
                        badge.classList.remove('d-none');
                    } else {
                        badge.classList.add('d-none');
                    }
                }

                // Advisory excuse badge
                if (advExcuseBadge) {
                    if (data.pendingExcuseCount > 0) {
                        advExcuseBadge.textContent = `${data.pendingExcuseCount} Pending Excuse`;
                        advExcuseBadge.classList.remove('d-none');
                    } else {
                        advExcuseBadge.classList.add('d-none');
                    }
                }
            } else {
                if (badge) badge.classList.add('d-none');
                if (advExcuseBadge) advExcuseBadge.classList.add('d-none');
            }
        } catch (e) {
            if (badge) badge.classList.add('d-none');
            if (advExcuseBadge) advExcuseBadge.classList.add('d-none');
        }
    }

    const attLink = document.getElementById('attendanceCardLink');
    if (attLink) {
        attLink.addEventListener('click', () => {
            const badge = document.getElementById('attendanceCardBadge');
            if (badge) badge.classList.add('d-none');
            const todayStr = new Date().toISOString().slice(0, 10);
            const seenKey = `mentorae_teacher_seen_attendance_${user.id}_${todayStr}`;
            localStorage.setItem(seenKey, String(Date.now()));
        });
    }

    loadAttendanceConfirmationBadge();
    window.addEventListener('pageshow', loadAttendanceConfirmationBadge);
    window.addEventListener('focus', loadAttendanceConfirmationBadge);
    window.addEventListener('mentorae:attendance-confirmed', loadAttendanceConfirmationBadge);
    setInterval(loadAttendanceConfirmationBadge, 15000);

    wireLogout('logoutBtn', '../login.html', token);
});
