/**
 * Role-aware notifications bell widget:
 * - Admin: Reviews & approves Teacher Topic Requests, admin announcements, and system alerts.
 * - Parent: Views Child's Attendance updates and School Announcements.
 * - Teacher / Student: Views relevant announcements and notifications.
 * Include after session.js / config.js.
 */
function initNotificationBell(buttonId, token, explicitRole = null) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;

    const TOPIC_REQUESTS_STORAGE_KEY = 'mentorae-topic-requests';

    let userRole = explicitRole;
    if (!userRole) {
        try {
            const storedUser = localStorage.getItem('mentorae_user');
            if (storedUser) {
                const parsed = JSON.parse(storedUser);
                userRole = parsed ? (parsed.role || '').toLowerCase() : null;
            }
        } catch (e) {
            console.error('Error parsing session user:', e);
        }
    }
    // Fallback: detect role from current URL path if not found in localStorage
    if (!userRole) {
        const path = window.location.pathname.toLowerCase();
        if (path.includes('admin')) userRole = 'admin';
        else if (path.includes('parent')) userRole = 'parent';
        else if (path.includes('teacher')) userRole = 'teacher';
        else if (path.includes('student')) userRole = 'student';
    }

    const isSubdir = window.location.pathname.includes('/Parent/') || 
                     window.location.pathname.includes('/Teacher/') || 
                     window.location.pathname.includes('/Student/');
    const announcementsUrl = userRole === 'admin'
        ? (isSubdir ? '../announcement_admin.html' : 'announcement_admin.html')
        : (isSubdir ? '../announcements.html' : 'announcements.html');
    const parentAttendanceUrl = isSubdir ? 'attendance_parent.html' : 'Parent/attendance_parent.html';
    const topicRequestsUrl = isSubdir ? '../topic_requests_admin.html' : 'topic_requests_admin.html';

    let badge = btn.querySelector('.notif-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'notif-badge position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger d-none';
        badge.style.fontSize = '0.65rem';
        btn.appendChild(badge);
    }

    const panel = document.createElement('div');
    panel.className = 'card shadow-lg border-0 position-absolute d-none';
    panel.style.cssText = 'width: 340px; max-height: 480px; overflow-y: auto; z-index: 1050; border-radius: 12px;';
    document.body.appendChild(panel);

    function positionPanel() {
        const rect = btn.getBoundingClientRect();
        const panelWidth = Math.min(340, window.innerWidth - 24);
        
        // Position vertically: just below the button with an 8px offset
        const top = rect.bottom + window.scrollY + 8;
        
        // Position horizontally: right-aligned with the button, clamped to screen bounds
        let left = rect.right + window.scrollX - panelWidth;
        if (left < 12) {
            left = 12;
        }
        if (left + panelWidth > window.innerWidth - 12) {
            left = window.innerWidth - 12 - panelWidth;
        }

        panel.style.top = `${top}px`;
        panel.style.left = `${left}px`;
        panel.style.right = 'auto';
        panel.style.width = `${panelWidth}px`;
    }

    function timeAgo(dateStr) {
        if (!dateStr) return 'recently';
        const diffMin = Math.round((Date.now() - new Date(dateStr)) / 60000);
        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffMin < 1440) return `${Math.round(diffMin / 60)}h ago`;
        return `${Math.round(diffMin / 1440)}d ago`;
    }

    function getPendingTopicRequests() {
        // ONLY the Admin is authorized to review & approve topic requests
        if (userRole !== 'admin') return [];
        try {
            const raw = localStorage.getItem(TOPIC_REQUESTS_STORAGE_KEY);
            const requests = raw ? JSON.parse(raw) : [];
            return requests.filter(r => r.status === 'pending');
        } catch (e) {
            console.error('Error reading topic requests:', e);
            return [];
        }
    }

    let latestAnnouncementList = [];
    let currentApiUnread = 0;
    let currentPendingTopicRequests = [];

    async function refresh() {
        let apiNotifications = [];
        let apiUnread = 0;
        let allAnnouncements = [];
        let pendingTopicRequests = [];

        if (token) {
            try {
                const data = await authedFetch('/api/notifications', token);
                if (data && data.success) {
                    apiNotifications = data.notifications || [];
                    apiUnread = data.unread || 0;
                }
            } catch (e) {
                // Ignore network errors gracefully
            }

            // For Admin: fetch real-time pending topic requests from the database
            if (userRole === 'admin') {
                try {
                    const reqData = await authedFetch('/api/content/topic-requests?status=pending', token);
                    if (reqData && reqData.success) {
                        pendingTopicRequests = reqData.requests || [];
                    }
                } catch (e) {
                    pendingTopicRequests = getPendingTopicRequests();
                }
            }

            // Fetch announcements for ALL roles (Admin, Teacher, Student, Parent)
            try {
                const annData = await authedFetch('/api/announcements', token);
                if (annData && annData.success && Array.isArray(annData.announcements)) {
                    allAnnouncements = annData.announcements;
                    latestAnnouncementList = allAnnouncements;
                }
            } catch (e) {
                // Ignore network errors gracefully
            }
        }

        currentApiUnread = apiUnread;
        currentPendingTopicRequests = pendingTopicRequests;

        // Retrieve last seen announcement ID for the current user in refresh scope
        const seenStorageKey = typeof getSeenAnnKey === 'function' 
            ? getSeenAnnKey() 
            : `mentorae_seen_ann_id_${userRole || 'user'}`;
        let lastSeenId = parseInt(localStorage.getItem(seenStorageKey) || '0', 10);
        if (lastSeenId === 0 && userRole) {
            lastSeenId = parseInt(localStorage.getItem(`mentorae_seen_ann_id_${userRole}`) || '0', 10);
        }
        const unseenAnnouncements = allAnnouncements.filter(a => Number(a.id) > lastSeenId);
        const unseenAnnCount = unseenAnnouncements.length;

        // Keep any Announcement Quick Access Card badges on the active dashboard in sync
        const annCardBadge = document.getElementById('announcementsCardBadge') || document.getElementById('announcementsBadge');
        if (annCardBadge) {
            annCardBadge.textContent = unseenAnnCount > 9 ? '9+' : String(unseenAnnCount);
            annCardBadge.classList.toggle('d-none', unseenAnnCount === 0);
        }

        const totalUnread = apiUnread + pendingTopicRequests.length + unseenAnnCount;

        badge.textContent = totalUnread > 9 ? '9+' : String(totalUnread);
        badge.classList.toggle('d-none', totalUnread === 0);

        // Update topic requests badge on admin dashboard card if it exists
        const cardBadge = document.getElementById('topicRequestsCardBadge');
        if (cardBadge) {
            cardBadge.textContent = pendingTopicRequests.length;
            cardBadge.classList.toggle('d-none', pendingTopicRequests.length === 0);
        }

        const recentAnnouncements = allAnnouncements.slice(0, 4);
        const hasContent = pendingTopicRequests.length > 0 || apiNotifications.length > 0 || recentAnnouncements.length > 0;

        if (!hasContent) {
            let emptyText = 'No notifications yet.';
            if (userRole === 'parent') {
                emptyText = 'No attendance alerts or school announcements right now.';
            } else if (userRole === 'admin') {
                emptyText = 'No pending topic requests or notifications.';
            }
            panel.innerHTML = `
                <div class="p-3 border-bottom d-flex justify-content-between align-items-center bg-light" style="border-radius: 12px 12px 0 0;">
                    <h6 class="m-0 fw-bold text-dark"><i class="bi bi-bell-fill text-success me-2"></i>Notifications</h6>
                </div>
                <div class="p-4 text-center text-muted small">
                    <i class="bi bi-bell-slash fs-3 d-block mb-2 text-secondary opacity-50"></i>
                    ${emptyText}
                </div>
            `;
            return;
        }

        let panelHtml = `
            <div class="p-3 border-bottom d-flex justify-content-between align-items-center bg-light" style="border-radius: 12px 12px 0 0;">
                <div class="d-flex align-items-center gap-2">
                    <h6 class="m-0 fw-bold text-dark"><i class="bi bi-bell-fill text-success me-1"></i>Notifications</h6>
                    ${totalUnread > 0 ? `<span class="badge bg-danger rounded-pill">${totalUnread} New</span>` : ''}
                </div>
                ${apiUnread > 0 ? `<button class="btn btn-link btn-sm p-0 micro-text text-decoration-none text-muted" id="markAllReadBtn"><i class="bi bi-check2-all me-1"></i>Mark all read</button>` : ''}
            </div>
            <div class="notif-list-container">
        `;

        // 1. ADMIN ONLY: Render pending teacher topic requests
        if (userRole === 'admin' && pendingTopicRequests.length > 0) {
            panelHtml += pendingTopicRequests.map(req => {
                const title = req.topicData ? req.topicData.title : 'New Topic';
                const subject = req.subjectName || 'Subject';
                const requester = req.requester || 'Teacher';
                const reqId = req.id || req.requestedAt || '';
                return `
                    <div class="p-3 border-bottom notif-topic-item" style="cursor:pointer; background:#f0f9f5;" data-req-id="${reqId}">
                        <div class="d-flex align-items-start gap-2">
                            <div class="bg-success text-white rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style="width:28px; height:28px; font-size:12px;">
                                <i class="bi bi-journal-arrow-up"></i>
                            </div>
                            <div class="flex-grow-1">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <span class="badge bg-success-subtle text-success border border-success-subtle micro-text fw-bold">Topic Request</span>
                                    <span class="text-muted micro-text">${timeAgo(req.requestedAt)}</span>
                                </div>
                                <div class="fw-bold small text-dark">${title}</div>
                                <div class="text-secondary micro-text mt-0.5">Subject: <strong class="text-dark">${subject}</strong></div>
                                <div class="text-muted micro-text">Teacher: <em>${requester}</em></div>
                                <div class="mt-2">
                                    <a href="${topicRequestsUrl}?highlightRequest=${encodeURIComponent(reqId)}" class="btn btn-sm btn-success py-0.5 px-2.5 micro-text fw-bold text-white rounded-pill text-decoration-none d-inline-flex align-items-center gap-1">
                                        <i class="bi bi-check-circle"></i> Review &amp; Confirm
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 2. Render In-App Notifications (Attendance for parents, status notices, etc.)
        if (apiNotifications.length > 0) {
            panelHtml += apiNotifications.map(n => {
                const isAttendance = (n.type || '').includes('attendance') || (n.title || '').toLowerCase().includes('attendance');
                const isTopicApproved = n.type === 'topic_approved';
                const isTopicRejected = n.type === 'topic_rejected';

                let iconClass = 'bi-bell-fill text-primary';
                let badgeClass = 'bg-primary-subtle text-primary border-primary-subtle';
                let badgeLabel = n.type ? n.type.replace('_', ' ') : 'Notice';
                let bgClass = n.is_read ? 'bg-white' : '#fff8e6';

                if (isAttendance) {
                    iconClass = 'bi-calendar-check-fill text-success';
                    badgeClass = 'bg-success-subtle text-success border-success-subtle';
                    badgeLabel = 'Attendance';
                    bgClass = n.is_read ? 'bg-white' : '#f0fbf4';
                } else if (isTopicApproved) {
                    iconClass = 'bi-check-circle-fill text-success';
                    badgeClass = 'bg-success-subtle text-success border-success-subtle';
                    badgeLabel = 'Topic Approved';
                    bgClass = n.is_read ? 'bg-white' : '#f0fbf4';
                } else if (isTopicRejected) {
                    iconClass = 'bi-x-circle-fill text-danger';
                    badgeClass = 'bg-danger-subtle text-danger border-danger-subtle';
                    badgeLabel = 'Not Approved';
                    bgClass = n.is_read ? 'bg-white' : '#fff5f5';
                }

                return `
                    <div class="p-3 border-bottom notif-row" data-id="${n.id}" data-type="${n.type || ''}" style="cursor:pointer; background:${bgClass};">
                        <div class="d-flex align-items-start gap-2">
                            <div class="p-1.5 rounded-circle flex-shrink-0 bg-light">
                                <i class="bi ${iconClass} fs-6"></i>
                            </div>
                            <div class="flex-grow-1">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <span class="badge ${badgeClass} border micro-text">${badgeLabel}</span>
                                    <span class="text-muted micro-text">${timeAgo(n.created_at)}</span>
                                </div>
                                <div class="fw-semibold small text-dark">${n.title}</div>
                                <div class="text-muted small mt-0.5">${n.message}</div>
                                ${userRole === 'parent' && isAttendance ? `
                                    <div class="mt-1.5">
                                        <a href="${parentAttendanceUrl}" class="micro-text fw-semibold text-success text-decoration-none d-inline-flex align-items-center gap-1">
                                            View Child's Attendance &rarr;
                                        </a>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 3. For All Users: Render School Announcements
        if (recentAnnouncements.length > 0) {
            panelHtml += `
                <div class="px-3 py-2 bg-light border-bottom micro-text fw-bold text-muted text-uppercase d-flex justify-content-between align-items-center">
                    <span><i class="bi bi-megaphone-fill text-warning me-1"></i> School Announcements</span>
                    <a href="${announcementsUrl}" class="text-decoration-none text-success micro-text fw-bold">View All (${allAnnouncements.length}) &rarr;</a>
                </div>
            `;
            panelHtml += recentAnnouncements.map(a => {
                const isNew = Number(a.id) > lastSeenId;
                return `
                    <div class="p-3 border-bottom notif-announcement-item" style="cursor:pointer; background:${isNew ? '#fff9e6' : '#fffdf8'};" onclick="window.location.href='${announcementsUrl}'">
                        <div class="d-flex align-items-start gap-2">
                            <div class="bg-warning-subtle text-warning-emphasis p-1.5 rounded-circle flex-shrink-0">
                                <i class="bi bi-megaphone-fill fs-6"></i>
                            </div>
                            <div class="flex-grow-1">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <div class="d-flex align-items-center gap-1.5">
                                        <span class="badge bg-warning-subtle text-dark border border-warning-subtle micro-text">${a.type || 'Announcement'}</span>
                                        ${isNew ? '<span class="badge bg-danger rounded-pill micro-text px-1.5 py-0.5">NEW</span>' : ''}
                                    </div>
                                    <span class="text-muted micro-text">${timeAgo(a.created_at)}</span>
                                </div>
                                <div class="fw-bold small text-dark">${a.title}</div>
                                <div class="text-muted small text-truncate" style="max-width: 230px;">${a.description}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        panelHtml += `</div>`;

        // Footer links customized by role
        if (userRole === 'admin') {
            panelHtml += `
                <div class="p-2.5 d-flex justify-content-around bg-light border-top" style="border-radius: 0 0 12px 12px;">
                    <a href="${topicRequestsUrl}" class="small text-decoration-none text-success fw-bold"><i class="bi bi-inbox me-1"></i>Topic Requests</a>
                    <a href="${announcementsUrl}" class="small text-decoration-none text-warning fw-bold"><i class="bi bi-megaphone me-1"></i>Manage Announcements</a>
                </div>
            `;
        } else if (userRole === 'parent') {
            panelHtml += `
                <div class="p-2.5 d-flex justify-content-around bg-light border-top" style="border-radius: 0 0 12px 12px;">
                    <a href="${parentAttendanceUrl}" class="small text-decoration-none text-success fw-semibold"><i class="bi bi-calendar-check me-1"></i>Attendance</a>
                    <a href="${announcementsUrl}" class="small text-decoration-none text-primary fw-semibold"><i class="bi bi-megaphone me-1"></i>Announcements</a>
                </div>
            `;
        } else {
            panelHtml += `
                <div class="p-2.5 text-center bg-light border-top" style="border-radius: 0 0 12px 12px;">
                    <a href="${announcementsUrl}" class="small text-decoration-none text-success fw-bold">View all Announcements &rarr;</a>
                </div>
            `;
        }

        panel.innerHTML = panelHtml;

        // Wire API row clicks to mark single notification as read
        panel.querySelectorAll('.notif-row').forEach(row => {
            row.addEventListener('click', async () => {
                await authedFetch(`/api/notifications/${row.dataset.id}/read`, token, { method: 'PATCH' });
                refresh();
            });
        });

        // Wire "Mark all read" button
        const markAllBtn = panel.querySelector('#markAllReadBtn');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (typeof markAnnouncementsAsSeen === 'function') {
                    markAnnouncementsAsSeen(latestAnnouncementList);
                } else if (latestAnnouncementList && latestAnnouncementList.length > 0) {
                    const maxId = Math.max(...latestAnnouncementList.map(a => Number(a.id) || 0));
                    if (maxId > 0) {
                        const key = typeof getSeenAnnKey === 'function' ? getSeenAnnKey() : `mentorae_seen_ann_id_${userRole || 'user'}`;
                        localStorage.setItem(key, String(maxId));
                    }
                }
                if (token) {
                    try {
                        await authedFetch('/api/notifications/read-all', token, { method: 'PATCH' });
                        currentApiUnread = 0;
                    } catch (err) {
                        console.error('Error marking all read:', err);
                    }
                }
                await refresh();
            });
        }

        // Wire Topic Request clicks for Admin
        panel.querySelectorAll('.notif-topic-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('a')) return;
                const reqId = item.dataset.reqId;
                window.location.href = `${topicRequestsUrl}?highlightRequest=${encodeURIComponent(reqId)}`;
            });
        });
    }

    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const isHidden = panel.classList.contains('d-none');
        if (isHidden) {
            positionPanel();
            panel.classList.remove('d-none');

            // Mark unseen announcements as seen when opening the notification panel
            if (typeof markAnnouncementsAsSeen === 'function') {
                markAnnouncementsAsSeen(latestAnnouncementList);
            } else if (latestAnnouncementList && latestAnnouncementList.length > 0) {
                const maxId = Math.max(...latestAnnouncementList.map(a => Number(a.id) || 0));
                if (maxId > 0) {
                    const key = typeof getSeenAnnKey === 'function' ? getSeenAnnKey() : `mentorae_seen_ann_id_${userRole || 'user'}`;
                    localStorage.setItem(key, String(maxId));
                }
            }

            // Immediately mark in-app notifications as read on backend
            if (token && currentApiUnread > 0) {
                try {
                    await authedFetch('/api/notifications/read-all', token, { method: 'PATCH' });
                    currentApiUnread = 0;
                } catch (err) {
                    console.error('Error marking notifications as read on panel open:', err);
                }
            }

            // Clear or update bell badge and dashboard announcement card badge immediately
            const annCardBadge = document.getElementById('announcementsCardBadge') || document.getElementById('announcementsBadge');
            if (annCardBadge) {
                annCardBadge.textContent = '0';
                annCardBadge.classList.add('d-none');
            }
            const pendingCount = (userRole === 'admin') ? currentPendingTopicRequests.length : 0;
            badge.textContent = pendingCount > 9 ? '9+' : String(pendingCount);
            badge.classList.toggle('d-none', pendingCount === 0);

            await refresh();
        } else {
            panel.classList.add('d-none');
        }
    });

    document.addEventListener('click', (e) => {
        if (!panel.contains(e.target) && e.target !== btn) {
            panel.classList.add('d-none');
        }
    });

    window.addEventListener('resize', () => {
        if (!panel.classList.contains('d-none')) {
            positionPanel();
        }
    });

    window.addEventListener('scroll', () => {
        if (!panel.classList.contains('d-none')) {
            positionPanel();
        }
    }, { passive: true });

    window.addEventListener('storage', (e) => {
        if (e.key === TOPIC_REQUESTS_STORAGE_KEY && userRole === 'admin') {
            refresh();
        } else if (e.key && e.key.startsWith('mentorae_seen_ann_id')) {
            refresh();
        }
    });

    window.addEventListener('pageshow', refresh);
    window.addEventListener('focus', refresh);

    refresh();
    setInterval(refresh, 10000);
}
