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
    const studentAttendanceUrl = isSubdir ? 'attendance_student.html' : 'Student/attendance_student.html';
    const teacherAttendanceUrl = isSubdir ? 'attendance_confirmation.html' : 'Teacher/attendance_confirmation.html';
    const topicRequestsUrl = isSubdir ? '../topic_requests_admin.html' : 'topic_requests_admin.html';

    // Inject floating toast styles if not already present
    if (!document.getElementById('mentorae-toast-styles')) {
        const style = document.createElement('style');
        style.id = 'mentorae-toast-styles';
        style.textContent = `
            #mentoraeToastContainer {
                position: fixed;
                top: 24px;
                right: 24px;
                z-index: 1099;
                display: flex;
                flex-direction: column;
                gap: 12px;
                pointer-events: none;
                max-width: 380px;
                width: calc(100vw - 36px);
            }
            .mentorae-toast-card {
                background: #ffffff;
                border-radius: 12px;
                box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16), 0 2px 6px rgba(0, 0, 0, 0.06);
                border: 1px solid rgba(0, 0, 0, 0.08);
                border-left: 5px solid #198754;
                pointer-events: auto;
                overflow: hidden;
                cursor: pointer;
                animation: mentoraeToastSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                transition: transform 0.2s ease, opacity 0.3s ease, box-shadow 0.2s ease;
            }
            .mentorae-toast-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 16px 36px rgba(0, 0, 0, 0.22);
            }
            .mentorae-toast-card.dismissing {
                animation: mentoraeToastSlideOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            @keyframes mentoraeToastSlideIn {
                from { transform: translateX(115%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes mentoraeToastSlideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(115%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    // Inject Notification Center Modal styles
    if (!document.getElementById('mentorae-notif-modal-styles')) {
        const modalStyle = document.createElement('style');
        modalStyle.id = 'mentorae-notif-modal-styles';
        modalStyle.textContent = `
            .notif-modal-card {
                transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.2s ease;
                border-radius: 12px;
            }
            .notif-modal-card:hover {
                transform: translateY(-1px);
                box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
            }
            .btn-expand-notifications {
                transition: all 0.2s ease;
                border-color: #cbd5e1;
                color: #64748b;
            }
            .btn-expand-notifications:hover {
                background-color: #f1f5f9;
                color: #0f172a;
                border-color: #94a3b8;
                transform: scale(1.08);
            }
            #modalNotifList::-webkit-scrollbar {
                width: 6px;
            }
            #modalNotifList::-webkit-scrollbar-track {
                background: #f8fafc;
                border-radius: 4px;
            }
            #modalNotifList::-webkit-scrollbar-thumb {
                background: #cbd5e1;
                border-radius: 4px;
            }
            #modalNotifList::-webkit-scrollbar-thumb:hover {
                background: #94a3b8;
            }
        `;
        document.head.appendChild(modalStyle);
    }

    // Inject Notification Center Modal into body if not already present
    let modalEl = document.getElementById('mentoraeNotificationsModal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.className = 'modal fade';
        modalEl.id = 'mentoraeNotificationsModal';
        modalEl.tabIndex = -1;
        modalEl.setAttribute('aria-labelledby', 'mentoraeNotificationsModalLabel');
        modalEl.setAttribute('aria-hidden', 'true');
        modalEl.style.zIndex = '1095';
        modalEl.innerHTML = `
            <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
                <div class="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                    <div class="modal-header bg-dark text-white py-3 px-4 border-0">
                        <div class="d-flex align-items-center gap-3">
                            <div class="rounded-circle bg-success text-white d-flex align-items-center justify-content-center flex-shrink-0 shadow-sm" style="width: 42px; height: 42px;">
                                <i class="bi bi-bell-fill fs-5 text-white"></i>
                            </div>
                            <div class="ms-1">
                                <div class="d-flex align-items-center gap-2">
                                    <h5 class="modal-title fw-bold fs-6 m-0 text-white" id="mentoraeNotificationsModalLabel">Notification Center</h5>
                                    <span class="badge bg-danger rounded-pill px-2 py-0.5 micro-text" id="modalNotifUnreadBadge" style="display: none;">0 New</span>
                                </div>
                                <span class="micro-text text-white-50" id="modalNotifSubtitle">Comprehensive alert logs and school updates</span>
                            </div>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <button type="button" class="btn btn-sm btn-outline-light rounded-pill px-3 micro-text fw-semibold d-inline-flex align-items-center gap-1 shadow-2xs" id="modalMarkAllReadBtn">
                                <i class="bi bi-check2-all"></i> Mark all as read
                            </button>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                    </div>

                    <div class="p-3 bg-light border-bottom">
                        <div class="row g-2 align-items-center">
                            <div class="col-12 col-md-7">
                                <div class="nav nav-pills nav-fill bg-white p-1 rounded-pill border shadow-2xs" id="modalNotifTabs" role="tablist">
                                    <button class="nav-link active py-1 px-3 rounded-pill micro-text fw-bold text-dark" data-filter="all" type="button">All (<span id="modalTabCountAll">0</span>)</button>
                                    <button class="nav-link py-1 px-3 rounded-pill micro-text fw-semibold text-secondary" data-filter="attendance" type="button">Attendance (<span id="modalTabCountAttendance">0</span>)</button>
                                    <button class="nav-link py-1 px-3 rounded-pill micro-text fw-semibold text-secondary" data-filter="announcement" type="button">Announcements (<span id="modalTabCountAnnouncements">0</span>)</button>
                                    <button class="nav-link py-1 px-3 rounded-pill micro-text fw-semibold text-secondary" data-filter="other" id="modalTabOther" type="button">Other (<span id="modalTabCountOther">0</span>)</button>
                                </div>
                            </div>
                            <div class="col-12 col-md-5">
                                <div class="input-group input-group-sm shadow-2xs rounded-pill">
                                    <span class="input-group-text bg-white border-end-0 text-muted rounded-start-pill ps-3">
                                        <i class="bi bi-search"></i>
                                    </span>
                                    <input type="text" class="form-control form-control-sm bg-white border-start-0 rounded-end-pill pe-3" id="modalNotifSearchInput" placeholder="Search notifications...">
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="modal-body p-3 bg-light" style="min-height: 360px; max-height: 520px; overflow-y: auto;" id="modalNotifList">
                    </div>

                    <div class="modal-footer bg-white py-2.5 px-4 d-flex justify-content-between border-top">
                        <div class="d-flex align-items-center gap-2 micro-text text-muted" id="modalNotifFooterLinks">
                            <i class="bi bi-shield-check text-success"></i> Mentorae Student Information System
                        </div>
                        <button type="button" class="btn btn-sm btn-secondary rounded-pill px-4 fw-semibold" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);
    }


    let toastContainer = document.getElementById('mentoraeToastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'mentoraeToastContainer';
        document.body.appendChild(toastContainer);
    }

    // Tracking shown toast IDs to prevent re-alerting the same notification
    let shownToastIds = new Set();
    try {
        const stored = sessionStorage.getItem('mentorae_shown_toasts');
        if (stored) {
            shownToastIds = new Set(JSON.parse(stored));
        }
    } catch (e) {}

    let isInitialLoad = true;

    function playNotificationChime() {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            const ctx = new AudioContextClass();
            if (ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
            }
            const now = ctx.currentTime;
            
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(659.25, now); // E5
            gain1.gain.setValueAtTime(0.08, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.22);

            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(880, now + 0.12); // A5
            gain2.gain.setValueAtTime(0.08, now + 0.12);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.40);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.12);
            osc2.stop(now + 0.40);
        } catch (e) {}
    }

    function showNotificationToast(item) {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = 'mentorae-toast-card';

        const isAttendance = (item.type || '').includes('attendance') || (item.title || '').toLowerCase().includes('attendance');
        const isIntervention = (item.type || '') === 'intervention_assigned' || (item.type || '').includes('intervention') || (item.title || '').toLowerCase().includes('intervention') || (item.title || '').toLowerCase().includes('lesson assigned');
        const isLate = (item.type || '').includes('late');
        const isOut = (item.type || '').includes('out');
        const isEarly = (item.type || '').includes('early') || (item.type || '').includes('excused');
        const isAbsent = (item.type || '').includes('absent');

        let borderColor = '#198754';
        let icon = 'bi-calendar-check-fill text-success';
        let badgeClass = 'bg-success-subtle text-success border-success-subtle';
        let badgeText = 'Attendance';

        if (isIntervention) {
            borderColor = '#0a5c2c';
            icon = 'bi-journal-check text-success';
            badgeClass = 'bg-success-subtle text-success border-success-subtle';
            badgeText = 'Intervention Lesson';
        } else if (isLate) {
            borderColor = '#ffc107';
            icon = 'bi-clock-history text-warning';
            badgeClass = 'bg-warning-subtle text-warning-emphasis border-warning-subtle';
            badgeText = 'Late (Past 7:00 AM)';
        } else if (isAbsent) {
            borderColor = '#dc3545';
            icon = 'bi-x-circle-fill text-danger';
            badgeClass = 'bg-danger-subtle text-danger border-danger-subtle';
            badgeText = 'Absent';
        } else if (isEarly) {
            borderColor = '#fd7e14';
            icon = 'bi-shield-exclamation text-warning';
            badgeClass = 'bg-warning-subtle text-dark border-warning-subtle';
            badgeText = 'Early Departure';
        } else if (isOut) {
            borderColor = '#0dcaf0';
            icon = 'bi-box-arrow-right text-info';
            badgeClass = 'bg-info-subtle text-info border-info-subtle';
            badgeText = 'Checked Out';
        }

        toast.style.borderLeftColor = borderColor;
        toast.innerHTML = `
            <div class="p-3 pb-2 d-flex align-items-start justify-content-between gap-2">
                <div class="d-flex align-items-center gap-2">
                    <div class="p-1 rounded-circle bg-light d-flex align-items-center justify-content-center" style="width: 28px; height: 28px;">
                        <i class="bi ${icon} fs-6"></i>
                    </div>
                    <div>
                        <div class="fw-bold text-dark small leading-tight">${item.title || 'Attendance Update'}</div>
                        <span class="badge ${badgeClass} border micro-text">${badgeText}</span>
                    </div>
                </div>
                <button type="button" class="btn-close micro-text p-1 text-muted" aria-label="Close"></button>
            </div>
            <div class="px-3 pb-2.5 small text-secondary">
                ${item.message}
            </div>
            <div class="px-3 py-1 bg-light border-top d-flex justify-content-between align-items-center micro-text text-muted">
                <span><i class="bi bi-clock me-1"></i>Just now</span>
                <span class="fw-semibold text-primary">Click to view &rarr;</span>
            </div>
        `;

        function dismiss() {
            if (toast.classList.contains('dismissing')) return;
            toast.classList.add('dismissing');
            setTimeout(() => toast.remove(), 300);
        }

        toast.querySelector('.btn-close').addEventListener('click', (e) => {
            e.stopPropagation();
            dismiss();
        });

        toast.addEventListener('click', () => {
            dismiss();
            if (userRole === 'student' && isIntervention) {
                window.location.href = 'dashboard_student.html#my-recommendations';
                return;
            }
            if (panel.classList.contains('d-none')) {
                positionPanel();
                panel.classList.remove('d-none');
            }
        });

        toastContainer.appendChild(toast);
        playNotificationChime();

        setTimeout(() => {
            if (toast.parentNode) dismiss();
        }, 7000);
    }

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

    
    let currentUnifiedList = [];
    let activeModalFilter = 'all';
    let modalSearchQuery = '';

    function openNotificationCenterModal() {
        panel.classList.add('d-none');
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
            modalInstance.show();
        } else {
            modalEl.classList.add('show');
            modalEl.style.display = 'block';
        }

        const unreadBadge = document.getElementById('modalNotifUnreadBadge');
        if (unreadBadge) {
            unreadBadge.textContent = `${totalUnreadCount} New`;
            unreadBadge.style.display = totalUnreadCount > 0 ? 'inline-block' : 'none';
        }

        renderModalNotifications();
    }

    function renderModalNotifications() {
        const listEl = document.getElementById('modalNotifList');
        if (!listEl) return;

        const countAll = document.getElementById('modalTabCountAll');
        const countAtt = document.getElementById('modalTabCountAttendance');
        const countAnn = document.getElementById('modalTabCountAnnouncements');
        const countOth = document.getElementById('modalTabCountOther');

        if (countAll) countAll.textContent = String(currentUnifiedList.length);
        if (countAtt) countAtt.textContent = String(currentUnifiedList.filter(i => i.category === 'attendance').length);
        if (countAnn) countAnn.textContent = String(currentUnifiedList.filter(i => i.category === 'announcement').length);
        if (countOth) countOth.textContent = String(currentUnifiedList.filter(i => i.category === 'other').length);

        const q = String(modalSearchQuery || '').trim().toLowerCase();
        let filtered = currentUnifiedList;

        if (activeModalFilter !== 'all') {
            filtered = filtered.filter(i => i.category === activeModalFilter);
        }

        if (q) {
            filtered = filtered.filter(i => {
                const title = (i.title || '').toLowerCase();
                const msg = (i.message || '').toLowerCase();
                const type = (i.badgeLabel || '').toLowerCase();
                return title.includes(q) || msg.includes(q) || type.includes(q);
            });
        }

        if (!filtered.length) {
            listEl.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <i class="bi bi-bell-slash fs-2 d-block mb-2 text-secondary opacity-50"></i>
                    <p class="m-0 text-sm fw-semibold">No notifications found</p>
                    <p class="m-0 micro-text text-muted">Try switching tabs or searching with another keyword.</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = filtered.map(item => {
            const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : 'Recently';

            return `
                <div class="notif-modal-card p-3 mb-2.5 border bg-white shadow-2xs position-relative ${!item.is_read ? 'border-success-subtle' : ''}" style="${!item.is_read ? 'background-color: #f7fdf9 !important;' : ''}">
                    <div class="d-flex align-items-start justify-content-between gap-3">
                        <div class="d-flex align-items-start gap-3 flex-grow-1">
                            <div class="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 shadow-2xs" 
                                 style="width: 44px; height: 44px; background: ${item.iconBg}; color: ${item.iconColor}; font-size: 1.25rem;">
                                <i class="bi ${item.iconClass}"></i>
                            </div>
                            <div class="flex-grow-1">
                                <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-1">
                                    <div class="d-flex align-items-center gap-2">
                                        <span class="badge ${item.badgeClass} micro-text fw-bold">${item.badgeLabel}</span>
                                        ${!item.is_read ? '<span class="badge bg-danger rounded-pill micro-text px-1.5 py-0.5">NEW</span>' : ''}
                                    </div>
                                    <span class="micro-text text-muted"><i class="bi bi-clock me-1"></i>${dateStr} (${timeAgo(item.created_at)})</span>
                                </div>
                                <h6 class="fw-bold text-dark mb-1 fs-6">${item.title}</h6>
                                <p class="text-secondary small mb-2" style="white-space: pre-line;">${item.message}</p>
                                ${item.actionUrl ? `
                                    <a href="${item.actionUrl}" class="btn btn-sm btn-outline-success rounded-pill px-3 py-1 micro-text fw-bold text-decoration-none d-inline-flex align-items-center gap-1 modal-notif-action-btn" data-id="${item.id}">
                                        ${item.actionLabel}
                                    </a>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Wire modal action clicks
        listEl.querySelectorAll('.modal-notif-action-btn').forEach(a => {
            a.addEventListener('click', async () => {
                const id = a.dataset.id;
                if (id && !String(id).startsWith('topic_') && !String(id).startsWith('ann_')) {
                    try {
                        await authedFetch(`/api/notifications/${id}/read`, token, { method: 'PATCH' });
                    } catch (err) {}
                }
            });
        });
    }

    let totalUnreadCount = 0;

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

        // Retrieve last seen announcement ID across all synchronized keys
        let lastSeenId = typeof getMaxSeenAnnId === 'function' 
            ? getMaxSeenAnnId() 
            : 0;
        if (lastSeenId === 0) {
            const seenStorageKey = typeof getSeenAnnKey === 'function' 
                ? getSeenAnnKey() 
                : `mentorae_seen_ann_id_${userRole || 'user'}`;
            lastSeenId = parseInt(localStorage.getItem(seenStorageKey) || '0', 10);
            if (lastSeenId === 0 && userRole) {
                lastSeenId = parseInt(localStorage.getItem(`mentorae_seen_ann_id_${userRole}`) || '0', 10);
            }
        }
        const unseenAnnouncements = allAnnouncements.filter(a => Number(a.id) > lastSeenId);
        const unseenAnnCount = unseenAnnouncements.length;

        // Keep any Announcement Quick Access Card badges on the active dashboard in sync
        const annCardBadge = document.getElementById('announcementsCardBadge') || document.getElementById('announcementsBadge');
        if (annCardBadge) {
            annCardBadge.textContent = String(unseenAnnCount);
            annCardBadge.classList.toggle('d-none', unseenAnnCount === 0);
        }

        // Deduplicate in-memory notifications and filter out redundant admin topic request notices
        const seenNotifKeys = new Set();
        const filteredApiNotifications = [];
        for (const n of apiNotifications) {
            // For admin: topic requests are already rendered in dedicated section 1, avoid duplicate card in section 2
            if (userRole === 'admin' && n.type === 'topic_request') {
                continue;
            }
            const dateStr = n.created_at ? n.created_at.slice(0, 10) : '';
            const dedupeKey = `${n.type || ''}|${n.title || ''}|${n.message || ''}|${n.related_student_id || ''}|${dateStr}`;
            if (!seenNotifKeys.has(dedupeKey)) {
                seenNotifKeys.add(dedupeKey);
                filteredApiNotifications.push(n);
            }
        }

        const effectiveApiUnread = filteredApiNotifications.filter(n => !n.is_read).length;
        const totalUnread = effectiveApiUnread + pendingTopicRequests.length + unseenAnnCount;
        totalUnreadCount = totalUnread;

        // Build unified list for Modal
        const unified = [];
        if (userRole === 'admin' && pendingTopicRequests.length > 0) {
            pendingTopicRequests.forEach(req => {
                const title = req.topicData ? req.topicData.title : 'New Topic Request';
                const subject = req.subjectName || 'Subject';
                const requester = req.requester || 'Teacher';
                const reqId = req.id || req.requestedAt || '';
                unified.push({
                    id: `topic_${reqId}`,
                    category: 'other',
                    type: 'topic_request',
                    badgeLabel: 'Topic Request',
                    badgeClass: 'bg-success-subtle text-success border border-success-subtle',
                    iconClass: 'bi-journal-arrow-up',
                    iconBg: '#d5ebd5',
                    iconColor: '#1f6e1f',
                    title: `Topic Request: ${title}`,
                    message: `Teacher ${requester} submitted a new topic request for subject: ${subject}.`,
                    created_at: req.requestedAt || new Date().toISOString(),
                    is_read: false,
                    actionUrl: `${topicRequestsUrl}?highlightRequest=${encodeURIComponent(reqId)}`,
                    actionLabel: 'Review & Confirm Topic →'
                });
            });
        }

        filteredApiNotifications.forEach(n => {
            const isAttendance = (n.type || '').includes('attendance') || (n.title || '').toLowerCase().includes('attendance');
            const isTopicApproved = n.type === 'topic_approved';
            const isTopicRejected = n.type === 'topic_rejected';
            const isIntervention = (n.type || '').includes('intervention') || (n.title || '').toLowerCase().includes('intervention') || (n.title || '').toLowerCase().includes('lesson assigned');
            const isBadge = (n.type || '').includes('badge');

            let category = 'other';
            let badgeLabel = n.type ? n.type.replace('_', ' ') : 'Notice';
            let badgeClass = 'bg-primary-subtle text-primary border-primary-subtle';
            let iconClass = 'bi-bell-fill';
            let iconBg = '#e2f0d9';
            let iconColor = '#2b7536';
            let actionUrl = '';
            let actionLabel = '';

            if (isAttendance) {
                category = 'attendance';
                badgeLabel = 'Attendance';
                badgeClass = 'bg-success-subtle text-success border border-success-subtle';
                iconClass = 'bi-calendar-check-fill';
                iconBg = '#d5ebd5';
                iconColor = '#1f6e1f';
                if (userRole === 'parent') {
                    actionUrl = parentAttendanceUrl;
                    actionLabel = "View Child's Attendance →";
                } else if (userRole === 'student') {
                    actionUrl = studentAttendanceUrl;
                    actionLabel = "View My Attendance →";
                } else if (userRole === 'teacher') {
                    actionUrl = teacherAttendanceUrl;
                    actionLabel = "Open Attendance Confirmation →";
                }
            } else if (isIntervention) {
                category = 'other';
                badgeLabel = 'Intervention Lesson';
                badgeClass = 'bg-success-subtle text-success border border-success-subtle';
                iconClass = 'bi-journal-check';
                iconBg = '#d5ebd5';
                iconColor = '#1f6e1f';
                actionUrl = 'dashboard_student.html#my-recommendations';
                actionLabel = "View Assigned Lesson →";
            } else if (isTopicApproved) {
                category = 'other';
                badgeLabel = 'Topic Approved';
                badgeClass = 'bg-success-subtle text-success border border-success-subtle';
                iconClass = 'bi-check-circle-fill';
                iconBg = '#d5ebd5';
                iconColor = '#1f6e1f';
            } else if (isTopicRejected) {
                category = 'other';
                badgeLabel = 'Not Approved';
                badgeClass = 'bg-danger-subtle text-danger border border-danger-subtle';
                iconClass = 'bi-x-circle-fill';
                iconBg = '#ffe5e5';
                iconColor = '#dc3545';
            } else if (isBadge) {
                category = 'other';
                badgeLabel = 'Merit Badge';
                badgeClass = 'bg-warning-subtle text-warning-emphasis border border-warning-subtle';
                iconClass = 'bi-award-fill';
                iconBg = '#fef2cb';
                iconColor = '#b27a00';
            }

            unified.push({
                id: n.id,
                category,
                type: n.type,
                badgeLabel,
                badgeClass,
                iconClass,
                iconBg,
                iconColor,
                title: n.title,
                message: n.message,
                created_at: n.created_at,
                is_read: !!n.is_read,
                actionUrl,
                actionLabel
            });
        });

        allAnnouncements.forEach(a => {
            const isNew = Number(a.id) > lastSeenId;
            unified.push({
                id: `ann_${a.id}`,
                category: 'announcement',
                type: 'announcement',
                badgeLabel: a.type || 'Announcement',
                badgeClass: 'bg-warning-subtle text-dark border border-warning-subtle',
                iconClass: 'bi-megaphone-fill',
                iconBg: '#fff2cc',
                iconColor: '#b27a00',
                title: a.title,
                message: a.description,
                created_at: a.created_at || a.event_date || new Date().toISOString(),
                is_read: !isNew,
                actionUrl: announcementsUrl,
                actionLabel: 'Read Announcement →'
            });
        });

        unified.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        currentUnifiedList = unified;

        // If modal is currently open, re-render it live
        const modalObj = document.getElementById('mentoraeNotificationsModal');
        if (modalObj && modalObj.classList.contains('show')) {
            renderModalNotifications();
        }

        // Trigger Floating Pop-up Toast for new unread notifications
        const unreadList = filteredApiNotifications.filter(n => !n.is_read);
        if (isInitialLoad) {
            const nowMs = Date.now();
            for (const n of unreadList) {
                const notifAgeMs = n.created_at ? (nowMs - new Date(n.created_at).getTime()) : 999999;
                if (!shownToastIds.has(String(n.id))) {
                    if (notifAgeMs < 120000) { // within last 2 minutes
                        showNotificationToast(n);
                    }
                    shownToastIds.add(String(n.id));
                }
            }
            isInitialLoad = false;
        } else {
            for (const n of unreadList) {
                if (!shownToastIds.has(String(n.id))) {
                    showNotificationToast(n);
                    shownToastIds.add(String(n.id));
                }
            }
        }
        try {
            sessionStorage.setItem('mentorae_shown_toasts', JSON.stringify(Array.from(shownToastIds).slice(-100)));
        } catch (e) {}

        badge.textContent = String(totalUnread);
        badge.classList.toggle('d-none', totalUnread === 0);

        // Update topic requests badge on admin dashboard card if it exists
        const cardBadge = document.getElementById('topicRequestsCardBadge');
        if (cardBadge) {
            cardBadge.textContent = pendingTopicRequests.length;
            cardBadge.classList.toggle('d-none', pendingTopicRequests.length === 0);
        }

        const recentAnnouncements = allAnnouncements.slice(0, 4);
        const hasContent = pendingTopicRequests.length > 0 || filteredApiNotifications.length > 0 || recentAnnouncements.length > 0;

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
                    <button type="button" class="btn btn-sm btn-outline-secondary rounded-circle d-inline-flex align-items-center justify-content-center shadow-2xs btn-expand-notifications" title="Open Full Notification Center" style="width: 26px; height: 26px; padding: 0;">
                        <i class="bi bi-arrows-angle-expand" style="font-size: 0.72rem;"></i>
                    </button>
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
                <div class="d-flex align-items-center gap-2">
                    ${(effectiveApiUnread > 0 || unseenAnnCount > 0) ? `<button class="btn btn-link btn-sm p-0 micro-text text-decoration-none text-muted" id="markAllReadBtn" title="Mark all as read"><i class="bi bi-check2-all"></i> Mark read</button>` : ''}
                    <button type="button" class="btn btn-sm btn-outline-secondary rounded-circle d-inline-flex align-items-center justify-content-center shadow-2xs btn-expand-notifications" title="Open Full Notification Center" style="width: 26px; height: 26px; padding: 0;">
                        <i class="bi bi-arrows-angle-expand" style="font-size: 0.72rem;"></i>
                    </button>
                </div>
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
        if (filteredApiNotifications.length > 0) {
            panelHtml += filteredApiNotifications.map(n => {
                const isAttendance = (n.type || '').includes('attendance') || (n.title || '').toLowerCase().includes('attendance');
                const isTopicApproved = n.type === 'topic_approved';
                const isTopicRejected = n.type === 'topic_rejected';
                const isIntervention = n.type === 'intervention_assigned' || (n.type || '').includes('intervention') || (n.title || '').toLowerCase().includes('intervention') || (n.title || '').toLowerCase().includes('lesson assigned');

                let iconClass = 'bi-bell-fill text-primary';
                let badgeClass = 'bg-primary-subtle text-primary border-primary-subtle';
                let badgeLabel = n.type ? n.type.replace('_', ' ') : 'Notice';
                let bgClass = n.is_read ? 'bg-white' : '#fff8e6';

                if (isAttendance) {
                    iconClass = 'bi-calendar-check-fill text-success';
                    badgeClass = 'bg-success-subtle text-success border-success-subtle';
                    badgeLabel = 'Attendance';
                    bgClass = n.is_read ? 'bg-white' : '#f0fbf4';
                } else if (isIntervention) {
                    iconClass = 'bi-journal-check text-success';
                    badgeClass = 'bg-success-subtle text-success border-success-subtle';
                    badgeLabel = 'Intervention Lesson';
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
                                ` : userRole === 'student' && isAttendance ? `
                                    <div class="mt-1.5">
                                        <a href="${studentAttendanceUrl}" class="micro-text fw-semibold text-success text-decoration-none d-inline-flex align-items-center gap-1">
                                            View My Attendance &rarr;
                                        </a>
                                    </div>
                                ` : userRole === 'student' && isIntervention ? `
                                    <div class="mt-1.5">
                                        <a href="dashboard_student.html#my-recommendations" class="micro-text fw-semibold text-success text-decoration-none d-inline-flex align-items-center gap-1">
                                            View Assigned Lesson &rarr;
                                        </a>
                                    </div>
                                ` : userRole === 'teacher' && isAttendance ? `
                                    <div class="mt-1.5">
                                        <a href="${teacherAttendanceUrl}" class="micro-text fw-semibold text-success text-decoration-none d-inline-flex align-items-center gap-1">
                                            Open Attendance Confirmation &rarr;
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
                    <a href="${announcementsUrl}" class="text-decoration-none text-success micro-text fw-bold notif-ann-link">View All (${allAnnouncements.length}) &rarr;</a>
                </div>
            `;
            panelHtml += recentAnnouncements.map(a => {
                const isNew = Number(a.id) > lastSeenId;
                return `
                    <div class="p-3 border-bottom notif-announcement-item notif-ann-link" style="cursor:pointer; background:${isNew ? '#fff9e6' : '#fffdf8'};" data-ann-url="${announcementsUrl}">
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
                    <a href="${announcementsUrl}" class="small text-decoration-none text-warning fw-bold notif-ann-link"><i class="bi bi-megaphone me-1"></i>Manage Announcements</a>
                </div>
            `;
        } else if (userRole === 'parent') {
            panelHtml += `
                <div class="p-2.5 d-flex justify-content-around bg-light border-top" style="border-radius: 0 0 12px 12px;">
                    <a href="${parentAttendanceUrl}" class="small text-decoration-none text-success fw-semibold"><i class="bi bi-calendar-check me-1"></i>Attendance</a>
                    <a href="${announcementsUrl}" class="small text-decoration-none text-primary fw-semibold notif-ann-link"><i class="bi bi-megaphone me-1"></i>Announcements</a>
                </div>
            `;
        } else if (userRole === 'teacher') {
            panelHtml += `
                <div class="p-2.5 d-flex justify-content-around bg-light border-top" style="border-radius: 0 0 12px 12px;">
                    <a href="${teacherAttendanceUrl}" class="small text-decoration-none text-success fw-semibold"><i class="bi bi-calendar-check me-1"></i>Confirm Attendance</a>
                    <a href="${announcementsUrl}" class="small text-decoration-none text-primary fw-semibold notif-ann-link"><i class="bi bi-megaphone me-1"></i>Announcements</a>
                </div>
            `;
        } else if (userRole === 'student') {
            panelHtml += `
                <div class="p-2.5 d-flex justify-content-around bg-light border-top" style="border-radius: 0 0 12px 12px;">
                    <a href="${studentAttendanceUrl}" class="small text-decoration-none text-success fw-semibold"><i class="bi bi-calendar-check me-1"></i>My Attendance</a>
                    <a href="${announcementsUrl}" class="small text-decoration-none text-primary fw-semibold notif-ann-link"><i class="bi bi-megaphone me-1"></i>Announcements</a>
                </div>
            `;
        } else {
            panelHtml += `
                <div class="p-2.5 text-center bg-light border-top" style="border-radius: 0 0 12px 12px;">
                    <a href="${announcementsUrl}" class="small text-decoration-none text-success fw-bold notif-ann-link">View all Announcements &rarr;</a>
                </div>
            `;
        }

        panelHtml += `
            <div class="py-2 px-3 bg-white border-top text-center" style="border-radius: 0 0 12px 12px;">
                <button type="button" class="btn btn-link btn-sm p-0 micro-text text-success fw-bold text-decoration-none d-inline-flex align-items-center gap-1 btn-expand-notifications">
                    <i class="bi bi-arrows-fullscreen"></i> Open Notification Center (Full View) &rarr;
                </button>
            </div>
        `;
        panel.innerHTML = panelHtml;

        // Wire expand buttons to open the Notification Center Modal
        panel.querySelectorAll('.btn-expand-notifications').forEach(b => {
            b.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openNotificationCenterModal();
            });
        });

        // Wire announcement item clicks to mark seen before navigating
        panel.querySelectorAll('.notif-ann-link').forEach(item => {
            item.addEventListener('click', (e) => {
                if (typeof markAnnouncementsAsSeen === 'function') {
                    markAnnouncementsAsSeen(latestAnnouncementList.length ? latestAnnouncementList : allAnnouncements);
                }
                const dest = item.dataset.annUrl;
                if (dest) {
                    e.preventDefault();
                    window.location.href = dest;
                }
            });
        });

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
                    markAnnouncementsAsSeen(latestAnnouncementList.length ? latestAnnouncementList : allAnnouncements);
                }
                if (token) {
                    try {
                        await authedFetch('/api/notifications/read-all', token, { method: 'PATCH' });
                        currentApiUnread = 0;
                    } catch (err) {
                        console.error('Error marking all read:', err);
                    }
                }
                const annCardBadge = document.getElementById('announcementsCardBadge') || document.getElementById('announcementsBadge');
                if (annCardBadge) {
                    annCardBadge.textContent = '0';
                    annCardBadge.classList.add('d-none');
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
            if (latestAnnouncementList && latestAnnouncementList.length > 0) {
                if (typeof markAnnouncementsAsSeen === 'function') {
                    markAnnouncementsAsSeen(latestAnnouncementList);
                }
            } else if (token) {
                authedFetch('/api/announcements', token).then((annData) => {
                    if (annData && annData.success && Array.isArray(annData.announcements)) {
                        latestAnnouncementList = annData.announcements;
                        if (typeof markAnnouncementsAsSeen === 'function') {
                            markAnnouncementsAsSeen(latestAnnouncementList);
                        }
                    }
                }).catch(() => {});
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
            badge.textContent = String(pendingCount);
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

    window.addEventListener('mentorae:announcements-seen', () => {
        refresh();
    });

    window.addEventListener('pageshow', refresh);
    window.addEventListener('focus', refresh);

    refresh();
    
    const modalTabsContainer = document.getElementById('modalNotifTabs');
    if (modalTabsContainer) {
        modalTabsContainer.querySelectorAll('button').forEach(tabBtn => {
            tabBtn.addEventListener('click', (e) => {
                e.preventDefault();
                modalTabsContainer.querySelectorAll('button').forEach(b => {
                    b.classList.remove('active', 'text-dark', 'fw-bold');
                    b.classList.add('text-secondary', 'fw-semibold');
                });
                tabBtn.classList.add('active', 'text-dark', 'fw-bold');
                tabBtn.classList.remove('text-secondary', 'fw-semibold');
                activeModalFilter = tabBtn.dataset.filter || 'all';
                renderModalNotifications();
            });
        });
    }

    const modalSearchInp = document.getElementById('modalNotifSearchInput');
    if (modalSearchInp) {
        modalSearchInp.addEventListener('input', (e) => {
            modalSearchQuery = e.target.value;
            renderModalNotifications();
        });
    }

    const modalMarkAllReadBtn = document.getElementById('modalMarkAllReadBtn');
    if (modalMarkAllReadBtn) {
        modalMarkAllReadBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (typeof markAnnouncementsAsSeen === 'function') {
                markAnnouncementsAsSeen(latestAnnouncementList.length ? latestAnnouncementList : allAnnouncements);
            }
            if (token) {
                try {
                    await authedFetch('/api/notifications/read-all', token, { method: 'PATCH' });
                    currentApiUnread = 0;
                } catch (err) {
                    console.error('Error marking all read:', err);
                }
            }
            currentUnifiedList.forEach(item => item.is_read = true);
            totalUnreadCount = 0;
            const unreadBadge = document.getElementById('modalNotifUnreadBadge');
            if (unreadBadge) unreadBadge.style.display = 'none';
            renderModalNotifications();
            await refresh();
        });
    }

    setInterval(refresh, 10000);
}
