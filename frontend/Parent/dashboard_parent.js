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
    }).catch(() => { });

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
    const linkAchievements = document.getElementById('linkAchievements');
    const childrenSelectorContainer = document.getElementById('childrenSelectorContainer');
    const childSelectDropdown = document.getElementById('childSelectDropdown');
    const announcementsBadge = document.getElementById('announcementsBadge');

    const parentRiskStatusBadge = document.getElementById('parentRiskStatusBadge');
    const parentRecommendationsContainer = document.getElementById('parentRecommendationsContainer');

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
        if (linkAchievements) {
            linkAchievements.href = `achievements_parent.html?studentId=${child.id}`;
        }

        // Load Prescriptive Home Support Guidance for this child
        loadParentRecommendations(child.id);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async function loadParentRecommendations(childId) {
        if (!parentRecommendationsContainer) return;
        parentRecommendationsContainer.innerHTML = `
            <div class="text-center py-4 text-muted micro-text">
                <div class="spinner-border spinner-border-sm text-success me-1.5" role="status"></div>
                Analyzing academic indicators and generating home guidance...
            </div>
        `;

        try {
            const res = await authedFetch(`/api/parent/student/${childId}/recommendations`, token);
            if (!res || !res.success || !res.prescriptive) {
                parentRecommendationsContainer.innerHTML = `
                    <div class="text-center py-3 text-muted">
                        <i class="bi bi-shield-check text-success fs-3 d-block mb-1"></i>
                        <p class="micro-text m-0 fw-semibold text-dark">No active intervention guidance required.</p>
                        <span class="micro-text text-muted">Your child is actively progressing across their enrolled subjects.</span>
                    </div>
                `;
                if (parentRiskStatusBadge) parentRiskStatusBadge.textContent = 'Active Monitoring';
                return;
            }

            const { student, prescriptive } = res;
            if (parentRiskStatusBadge) {
                const tier = student.riskTier || 'Good Standing';
                parentRiskStatusBadge.textContent = tier;
                if (tier.includes('High')) {
                    parentRiskStatusBadge.className = 'badge bg-danger-subtle text-danger border border-danger-subtle micro-text fw-bold px-3 py-1.5 rounded-pill shadow-xs';
                    parentRiskStatusBadge.innerHTML = '<i class="bi bi-exclamation-octagon-fill me-1"></i> High Attention Needed';
                } else if (tier.includes('Medium')) {
                    parentRiskStatusBadge.className = 'badge bg-warning-subtle text-warning-emphasis border border-warning-subtle micro-text fw-bold px-3 py-1.5 rounded-pill shadow-xs';
                    parentRiskStatusBadge.innerHTML = '<i class="bi bi-exclamation-triangle-fill me-1"></i> Moderate Support Recommended';
                } else {
                    parentRiskStatusBadge.className = 'badge bg-success-subtle text-success border border-success-subtle micro-text fw-bold px-3 py-1.5 rounded-pill shadow-xs';
                    parentRiskStatusBadge.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Good Standing';
                }
            }

            const actions = prescriptive.homeActions || [];
            if (!actions.length) {
                parentRecommendationsContainer.innerHTML = `
                    <div class="text-center py-3 text-muted">
                        <i class="bi bi-stars text-success fs-3 d-block mb-1"></i>
                        <p class="micro-text m-0 fw-semibold text-dark">Your child is performing consistently well.</p>
                        <span class="micro-text text-muted">Encourage their positive study habits and celebrate their hard work!</span>
                    </div>
                `;
                return;
            }

            parentRecommendationsContainer.innerHTML = actions.map(act => {
                let iconClass = act.icon || 'bi-lightbulb-fill';
                let colorName = act.iconColor || 'success';
                // Handle legacy format "bi-alarm-fill text-warning" if passed
                if (iconClass.includes('text-')) {
                    const match = iconClass.match(/text-([a-z-]+)/);
                    if (match) colorName = match[1];
                    iconClass = iconClass.replace(/text-[a-z-]+/, '').trim();
                }

                const badgeHtml = act.badge
                    ? `<span class="badge home-action-metric-pill bg-${colorName}-subtle text-${colorName} border border-${colorName}-subtle">${escapeHtml(act.badge)}</span>`
                    : '';

                return `
                    <div class="home-action-card p-3 rounded-3 d-flex align-items-start gap-3 bg-white mb-2">
                        <div class="home-action-icon-box rounded-3 d-flex align-items-center justify-content-center flex-shrink-0 bg-${colorName}-subtle text-${colorName}">
                            <i class="bi ${iconClass} fs-5"></i>
                        </div>
                        <div class="flex-grow-1 min-w-0">
                            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-1">
                                <h6 class="home-action-title m-0">${escapeHtml(act.title)}</h6>
                                ${badgeHtml}
                            </div>
                            <p class="home-action-desc m-0">${escapeHtml(act.text)}</p>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            console.warn('Could not load parent recommendations:', err);
            if (parentRecommendationsContainer) {
                parentRecommendationsContainer.innerHTML = '<p class="text-muted micro-text m-0 py-2 text-center">Guidance recommendations could not be updated right now.</p>';
            }
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
    let cachedAnnouncements = [];
    async function loadAnnouncementsCount() {
        const badge = announcementsBadge || document.getElementById('announcementsBadge') || document.getElementById('announcementsCardBadge');
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
            // Non-critical, ignore error
        }
    }

    const annParentLink = document.querySelector('a[href*="announcements.html"]');
    if (annParentLink) {
        annParentLink.addEventListener('click', () => {
            const badge = announcementsBadge || document.getElementById('announcementsBadge') || document.getElementById('announcementsCardBadge');
            if (badge) badge.classList.add('d-none');
            if (typeof markAnnouncementsAsSeen === 'function' && cachedAnnouncements.length > 0) {
                markAnnouncementsAsSeen(cachedAnnouncements, user);
            }
        });
    }

    // Execute loaders
    await loadLinkedChildren();
    loadAnnouncementsCount();
    window.addEventListener('pageshow', loadAnnouncementsCount);
    window.addEventListener('focus', loadAnnouncementsCount);
    window.addEventListener('mentorae:announcements-seen', loadAnnouncementsCount);
});