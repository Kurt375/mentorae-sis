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

            if (gradeEl) {
                gradeEl.textContent = (overallGrade !== null && overallGrade !== undefined && overallGrade !== '')
                    ? `${overallGrade}%`
                    : '0%';
            }
            if (attEl) {
                attEl.textContent = (attendanceRate !== null && attendanceRate !== undefined && attendanceRate !== '')
                    ? `${attendanceRate}%`
                    : '0%';
            }
            if (ptsEl) ptsEl.textContent = badgePoints != null ? badgePoints : 0;
            if (badgeEl) badgeEl.textContent = badgeCount != null ? badgeCount : 0;
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
                    badge.textContent = String(unseenCount);
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

    // 5. Load Recommended Lessons Panel
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async function loadRecommendations(termParam = null) {
        const container = document.getElementById('studentRecommendationsList');
        const termBadge = document.getElementById('recCurrentTermBadge');
        const termSelect = document.getElementById('recTermFilterSelect');
        if (!container) return;

        try {
            const selectedTerm = termParam || (termSelect ? termSelect.value : 'current');
            const queryUrl = selectedTerm && selectedTerm !== 'current'
                ? `/api/content/my-recommendations?term=${encodeURIComponent(selectedTerm)}`
                : '/api/content/my-recommendations';

            const data = await authedFetch(queryUrl, token);
            const activeTermLabel = data.selectedTerm && data.selectedTerm !== 'all' ? data.selectedTerm : (data.activeTerm || 'Active Term');
            if (termBadge) {
                termBadge.textContent = selectedTerm === 'all' ? 'All Terms' : activeTermLabel;
            }

            if (!data.success || !Array.isArray(data.recommendations) || data.recommendations.length === 0) {
                container.innerHTML = `
                    <div class="col-12">
                        <div class="card border-0 p-4 shadow-sm bg-white rounded-3 text-center text-muted">
                            <i class="bi bi-check-circle-fill fs-3 text-success d-block mb-2"></i>
                            <h5 class="fw-bold text-dark m-0 fs-6">No pending recommendations for ${escapeHtml(activeTermLabel)}</h5>
                            <span class="micro-text text-muted mt-1 d-block">You're all caught up! Keep up the great work in your classes.</span>
                        </div>
                    </div>
                `;
                return;
            }

            container.innerHTML = data.recommendations.slice(0, 4).map(rec => {
                const subjectParam = encodeURIComponent(rec.subjectName || '');
                const topicParam = encodeURIComponent(rec.title || '');
                
                const fileDoneIcon = rec.filesViewed ? '<i class="bi bi-check-circle-fill text-success ms-1"></i>' : '';
                const fileBtn = rec.hasFiles
                    ? `<a href="subject_detail_student.html?subject=${subjectParam}&topic=${topicParam}&action=file" class="btn btn-sm ${rec.filesViewed ? 'btn-outline-success fw-semibold' : 'btn-outline-secondary'} rounded-pill px-3 py-1 text-nowrap d-inline-flex align-items-center gap-1">
                        <i class="bi bi-file-earmark-text"></i> File ${fileDoneIcon}
                       </a>`
                    : '';

                const quizDoneIcon = rec.quizCompleted ? `<i class="bi bi-check-circle-fill text-white ms-1"></i>${rec.quizPercentage !== null ? ` <span class="badge bg-white text-success rounded-pill px-1.5 py-0.5 ms-0.5" style="font-size: 0.68rem;">${rec.quizPercentage}%</span>` : ''}` : '';
                const quizBtn = rec.hasQuiz
                    ? `<a href="quiz_taker_student.html?subject=${subjectParam}&topic=${topicParam}&source=recommendation" class="btn btn-sm ${rec.quizCompleted ? 'btn-success text-white fw-semibold' : 'btn-outline-success'} rounded-pill px-3 py-1 text-nowrap d-inline-flex align-items-center gap-1">
                        <i class="bi bi-question-circle"></i> Quiz ${quizDoneIcon}
                       </a>`
                    : '';

                const flashcardDoneIcon = rec.flashcardsCompleted ? '<i class="bi bi-check-circle-fill text-success ms-1"></i>' : '';
                const flashcardBtn = rec.hasFlashcards
                    ? `<a href="flashcard_viewer_student.html?subject=${subjectParam}&topic=${topicParam}&source=recommendation" class="btn btn-sm ${rec.flashcardsCompleted ? 'btn-chip-flashcard border-success fw-semibold' : 'btn-chip-flashcard'} rounded-pill px-3 py-1 text-nowrap d-inline-flex align-items-center gap-1">
                        <i class="bi bi-stack"></i> Flashcards ${flashcardDoneIcon}
                       </a>`
                    : '';

                const statusBadge = rec.isCompleted
                    ? `<span class="badge bg-success text-white rounded-pill text-xs px-2.5 py-1 d-inline-flex align-items-center gap-1"><i class="bi bi-patch-check-fill"></i> Completed</span>`
                    : (rec.isDirectAssignment
                        ? '<span class="badge bg-warning-subtle text-warning-emphasis rounded-pill text-xs px-2 py-0.5"><i class="bi bi-pin-angle-fill me-1"></i>Assigned</span>'
                        : '<span class="badge bg-primary-subtle text-primary rounded-pill text-xs px-2 py-0.5">Recommended</span>');

                const cardBorder = rec.isCompleted
                    ? 'border-left: 4px solid #198754 !important; background: #fbfdfa !important;'
                    : 'border-left: 4px solid #0a5c2c !important;';

                return `
                    <div class="col-12 col-md-6">
                        <div class="card border-0 shadow-sm p-3 bg-white rounded-3 h-100 d-flex flex-column justify-content-between position-relative" style="${cardBorder}">
                            <div>
                                <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                                    <span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill text-xs px-2.5 py-1">
                                        <i class="bi bi-book-half me-1"></i>${escapeHtml(rec.subjectName || 'Lesson')}
                                    </span>
                                    <div class="d-flex align-items-center gap-1.5">
                                        ${rec.term ? `<span class="badge bg-light text-secondary border rounded-pill micro-text px-2 py-0.5">${escapeHtml(rec.term)}</span>` : ''}
                                        ${statusBadge}
                                    </div>
                                </div>
                                <h5 class="fw-bold fs-6 text-dark mb-1">
                                    <a href="subject_detail_student.html?subject=${subjectParam}&topic=${topicParam}" class="text-decoration-none text-dark hover-green">
                                        ${escapeHtml(rec.title)}
                                    </a>
                                </h5>
                                <p class="micro-text text-muted mb-2 line-clamp-2">
                                    ${escapeHtml(rec.description || 'Lesson materials assigned to reinforce learning concepts.')}
                                </p>
                                ${rec.comment ? `<div class="p-2 rounded bg-light border micro-text text-secondary mb-3"><i class="bi bi-chat-quote-fill me-1 text-success"></i><strong>Teacher Note:</strong> ${escapeHtml(rec.comment)}</div>` : ''}
                            </div>
                            <div class="d-flex flex-wrap gap-2 pt-2 border-top">
                                ${fileBtn}
                                ${quizBtn}
                                ${flashcardBtn}
                                <a href="subject_detail_student.html?subject=${subjectParam}&topic=${topicParam}" class="btn btn-sm btn-outline-secondary rounded-pill px-2.5 py-1 ms-auto" title="View Full Topic">
                                    <i class="bi bi-box-arrow-up-right"></i>
                                </a>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            console.error('loadRecommendations error:', err);
            container.innerHTML = '<div class="col-12 text-center text-muted small py-3">Could not load recommendations.</div>';
        }
    }

    const recTermSelect = document.getElementById('recTermFilterSelect');
    if (recTermSelect) {
        recTermSelect.addEventListener('change', () => {
            loadRecommendations(recTermSelect.value);
        });
    }

    loadRecommendations();
});
