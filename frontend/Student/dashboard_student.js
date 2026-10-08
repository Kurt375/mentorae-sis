document.addEventListener('DOMContentLoaded', () => {

    const { token, user } = requireSession('../login.html');

    // 1. Live Real-time Clock Sync Element bindings
    const dateEl = document.getElementById('liveDate');
    const timeEl = document.getElementById('liveTime');

    function updateClock() {
        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = now.toLocaleDateString('en-US', options);
        timeEl.textContent = now.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        });
    }
    updateClock();
    setInterval(updateClock, 1000);

    // 2. Populate profile banner with the real logged-in student
    document.getElementById('studentNameDisplay').textContent = user.full_name;
    authedFetch('/api/auth/profile', token).then((data) => {
        if (data.success && data.profile) {
            if (data.profile.section) {
                document.getElementById('studentSectionDisplay').textContent = data.profile.section;
            }
            if (data.profile.profilePictureUrl) {
                const img = document.getElementById('dashboardAvatarImg');
                const icon = document.getElementById('dashboardAvatarIcon');
                if (img && icon) {
                    img.src = data.profile.profilePictureUrl;
                    img.classList.remove('d-none');
                    icon.classList.add('d-none');
                }
            }
        }
    }).catch(() => {});

    // 2b. Semester/year/strand/present-status summary
    authedFetch('/api/auth/status-summary', token).then((data) => {
        if (!data.success) return;
        const { presentStatus } = data.summary;
        const statusLabels = { present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused', out: 'Checked Out' };
        const statusDots = { present: 'bg-success', out: 'bg-success', late: 'bg-warning', absent: 'bg-danger', excused: 'bg-danger' };
        const statusEl = document.getElementById('studentStatusDisplay');
        const dotEl = statusEl?.previousElementSibling;
        if (statusEl) statusEl.textContent = statusLabels[presentStatus] || 'Absent';
        if (dotEl) dotEl.className = `status-dot-mini me-1 ${statusDots[presentStatus] || 'bg-danger'}`;

        const termEl = document.getElementById('studentTermDisplay');
        if (termEl) {
            termEl.textContent = [data.summary.semester, data.summary.schoolYear].filter(Boolean).join(' • ') || '—';
        }

        // Live Overview Metrics
        if (data.summary.metrics) {
            const { overallGrade, attendanceRate, badgePoints, badgeCount } = data.summary.metrics;
            const gradeEl = document.getElementById('metricOverallGrade');
            const attEl = document.getElementById('metricAttendanceRate');
            const ptsEl = document.getElementById('metricPointsEarned');
            const badgeEl = document.getElementById('metricBadgesCount');

            if (gradeEl && overallGrade != null) gradeEl.textContent = `${overallGrade}%`;
            if (attEl && attendanceRate != null) attEl.textContent = `${attendanceRate}%`;
            if (ptsEl && badgePoints != null) ptsEl.textContent = badgePoints;
            if (badgeEl && badgeCount != null) badgeEl.textContent = badgeCount;
        }

        // Live Recent Activity
        if (Array.isArray(data.summary.recentActivity) && data.summary.recentActivity.length > 0) {
            const listEl = document.getElementById('studentRecentActivityList');
            if (listEl) {
                listEl.innerHTML = '';
                data.summary.recentActivity.forEach((act, idx) => {
                    const isLast = idx === data.summary.recentActivity.length - 1;
                    const li = document.createElement('li');
                    li.className = `timeline-stream-item d-flex align-items-start gap-3 ${isLast ? 'pt-3' : 'pb-3 border-bottom-dashed'}`;
                    
                    let dotColor = 'bg-success';
                    if (act.type === 'attendance') dotColor = 'bg-primary';
                    else if (act.type === 'badge') dotColor = 'bg-warning';
                    else if (act.type === 'excuse') dotColor = 'bg-info';

                    let timeDisplay = act.date ? new Date(act.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Recent';
                    li.innerHTML = `
                        <div class="activity-marker-dot ${dotColor} mt-1.5 flex-shrink-0"></div>
                        <div class="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center w-100 gap-1">
                            <p class="m-0 text-sm text-dark">${act.title} - <span class="text-muted">${act.description}</span></p>
                            <span class="micro-text text-muted">${timeDisplay}</span>
                        </div>
                    `;
                    listEl.appendChild(li);
                });
            }
        }
    }).catch(() => {});

    // 2c. Load Active Announcements Count for Quick Access Badge
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

    const annCardLink = document.querySelector('a[href*="announcements.html"]');
    if (annCardLink) {
        annCardLink.addEventListener('click', () => {
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

    // 3. Logout — now actually logs out
    wireLogout('logoutBtn', '../login.html', token);

    // 4. Show QR Code modal — quick access right from the dashboard, no navigation needed
    const qrModal = document.getElementById('qrModalHome');
    const qrContainer = document.getElementById('qrCodeContainerHome');
    const btnShowQr = document.getElementById('btnShowQrHome');
    const btnCloseQr = document.getElementById('btnCloseQrHome');
    let qrRendered = false;

    async function renderQrCode() {
        if (qrRendered) return;
        try {
            const data = await authedFetch('/api/attendance/my-qr', token);
            if (!data.success) {
                qrContainer.innerHTML = `<p class="text-danger small m-0">${data.message}</p>`;
                return;
            }
            new QRCode(qrContainer, {
                text: data.qrText, // the student's own unique ID number
                width: 200,
                height: 200,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
            qrRendered = true;
        } catch (err) {
            console.error(err);
            qrContainer.innerHTML = '<p class="text-danger small m-0">Could not load your QR code.</p>';
        }
    }

    btnShowQr.addEventListener('click', () => {
        qrModal.classList.remove('d-none');
        renderQrCode();
    });
    btnCloseQr.addEventListener('click', () => qrModal.classList.add('d-none'));
    qrModal.addEventListener('click', (e) => {
        if (e.target === qrModal) qrModal.classList.add('d-none');
    });
});
