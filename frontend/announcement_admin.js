document.addEventListener('DOMContentLoaded', () => {
    const { token } = requireSession('login.html');

    const liveDateElement = document.getElementById('liveDate');
    const liveTimeElement = document.getElementById('liveTime');
    function updateDateTime() {
        const now = new Date();
        liveDateElement.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        liveTimeElement.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    const toggleFormBtn = document.getElementById('toggleFormBtn');
    const creationFormWrapper = document.getElementById('creationFormWrapper');
    const announcementForm = document.getElementById('announcementForm');
    const feed = document.getElementById('announcementsFeed');
    const deleteBtn = document.getElementById('deleteBtn');

    let selectedIds = new Set();
    let allAnnouncements = [];
    let filteredAnnouncements = [];

    // Search and Filter Toolbar Elements
    const announcementSearchInput = document.getElementById('announcementSearchInput');
    const btnAnnouncementSearchClear = document.getElementById('btnAnnouncementSearchClear');
    const announcementFilterType = document.getElementById('announcementFilterType');
    const announcementFilterAudience = document.getElementById('announcementFilterAudience');
    const announcementFilterDate = document.getElementById('announcementFilterDate');
    const btnAnnouncementResetFilters = document.getElementById('btnAnnouncementResetFilters');
    const announcementResultsCounter = document.getElementById('announcementResultsCounter');
    const announcementActiveFiltersBadges = document.getElementById('announcementActiveFiltersBadges');

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    toggleFormBtn.addEventListener('click', () => {
        creationFormWrapper.classList.toggle('d-none');
    });

    const typeClass = {
        event: 'bg-primary-subtle text-primary',
        academic: 'bg-success-subtle text-success',
        seminar: 'bg-warning-subtle text-warning',
    };

    function formatDate(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    function resetAnnouncementFilters() {
        if (announcementSearchInput) announcementSearchInput.value = '';
        if (announcementFilterType) announcementFilterType.value = 'all';
        if (announcementFilterAudience) announcementFilterAudience.value = 'all';
        if (announcementFilterDate) announcementFilterDate.value = 'all';
        applyAnnouncementFiltersAndRender();
    }

    function applyAnnouncementFiltersAndRender() {
        if (!feed) return;

        if (!allAnnouncements || allAnnouncements.length === 0) {
            filteredAnnouncements = [];
            selectedIds.clear();
            deleteBtn.disabled = true;
            if (announcementResultsCounter) announcementResultsCounter.textContent = 'Showing 0 announcements';
            if (announcementActiveFiltersBadges) announcementActiveFiltersBadges.innerHTML = '';
            feed.innerHTML = '<p class="text-muted text-center py-4">No announcements posted yet.</p>';
            return;
        }

        const search = (announcementSearchInput ? announcementSearchInput.value : '').trim().toLowerCase();
        const typeFilter = announcementFilterType ? announcementFilterType.value : 'all';
        const audienceFilter = announcementFilterAudience ? announcementFilterAudience.value : 'all';
        const dateFilter = announcementFilterDate ? announcementFilterDate.value : 'all';

        // Toggle search clear button
        if (btnAnnouncementSearchClear) {
            if (search.length > 0) {
                btnAnnouncementSearchClear.classList.remove('d-none');
            } else {
                btnAnnouncementSearchClear.classList.add('d-none');
            }
        }

        // Today reference for timeline filtering
        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();

        // Apply filters
        filteredAnnouncements = allAnnouncements.filter(a => {
            // 1. Type Filter
            if (typeFilter !== 'all') {
                const aType = (a.type || '').toLowerCase();
                if (aType !== typeFilter.toLowerCase()) return false;
            }

            // 2. Target Audience Filter
            if (audienceFilter !== 'all') {
                const aAud = (a.audience || '').toLowerCase();
                if (audienceFilter === 'all-users') {
                    if (aAud !== 'all' && aAud !== 'all users') return false;
                } else if (aAud !== audienceFilter.toLowerCase()) {
                    return false;
                }
            }

            // 3. Date Timeline Filter
            if (dateFilter !== 'all') {
                const eventDateStr = (a.event_date || '').slice(0, 10);
                if (dateFilter === 'upcoming') {
                    if (eventDateStr < todayStr) return false;
                } else if (dateFilter === 'past') {
                    if (eventDateStr >= todayStr) return false;
                } else if (dateFilter === 'this-month') {
                    if (!eventDateStr) return false;
                    const d = new Date(eventDateStr + 'T00:00:00');
                    if (d.getFullYear() !== currentYear || d.getMonth() !== currentMonth) return false;
                }
            }

            // 4. Real-time Search Match (Title, Description, Audience, Type)
            if (search) {
                const title = (a.title || '').toLowerCase();
                const desc = (a.description || '').toLowerCase();
                const aud = (a.audience || '').toLowerCase();
                const type = (a.type || '').toLowerCase();
                if (!title.includes(search) && !desc.includes(search) && !aud.includes(search) && !type.includes(search)) {
                    return false;
                }
            }

            return true;
        });

        // Update Results Counter
        const totalCount = allAnnouncements.length;
        const filteredCount = filteredAnnouncements.length;
        const hasActiveFilters = Boolean(search || typeFilter !== 'all' || audienceFilter !== 'all' || dateFilter !== 'all');

        if (announcementResultsCounter) {
            if (hasActiveFilters) {
                announcementResultsCounter.innerHTML = `Showing <strong>${filteredCount}</strong> of <strong>${totalCount}</strong> announcements <span class="badge bg-success-subtle text-success ms-1">Filtered</span>`;
            } else {
                announcementResultsCounter.innerHTML = `Showing all <strong>${totalCount}</strong> announcements`;
            }
        }

        // Update Active Filter Badges
        if (announcementActiveFiltersBadges) {
            const badges = [];
            if (search) {
                badges.push(`
                    <span class="announcement-active-chip">
                        Search: "${escapeHtml(search)}"
                        <i class="bi bi-x-circle-fill btn-remove-chip" data-filter="search"></i>
                    </span>
                `);
            }
            if (typeFilter !== 'all') {
                const typeLabels = { academic: 'Academic', seminar: 'Seminar', event: 'General Event' };
                badges.push(`
                    <span class="announcement-active-chip">
                        Type: ${typeLabels[typeFilter] || typeFilter}
                        <i class="bi bi-x-circle-fill btn-remove-chip" data-filter="type"></i>
                    </span>
                `);
            }
            if (audienceFilter !== 'all') {
                const audLabels = { 'all-users': 'All Users', student: 'Students', teacher: 'Teachers', parent: 'Parents' };
                badges.push(`
                    <span class="announcement-active-chip">
                        Audience: ${audLabels[audienceFilter] || audienceFilter}
                        <i class="bi bi-x-circle-fill btn-remove-chip" data-filter="audience"></i>
                    </span>
                `);
            }
            if (dateFilter !== 'all') {
                const dateLabels = { upcoming: 'Upcoming', past: 'Past', 'this-month': 'This Month' };
                badges.push(`
                    <span class="announcement-active-chip">
                        Timeline: ${dateLabels[dateFilter] || dateFilter}
                        <i class="bi bi-x-circle-fill btn-remove-chip" data-filter="date"></i>
                    </span>
                `);
            }
            announcementActiveFiltersBadges.innerHTML = badges.join('');

            announcementActiveFiltersBadges.querySelectorAll('.btn-remove-chip').forEach(btn => {
                btn.addEventListener('click', () => {
                    const f = btn.getAttribute('data-filter');
                    if (f === 'search' && announcementSearchInput) announcementSearchInput.value = '';
                    if (f === 'type' && announcementFilterType) announcementFilterType.value = 'all';
                    if (f === 'audience' && announcementFilterAudience) announcementFilterAudience.value = 'all';
                    if (f === 'date' && announcementFilterDate) announcementFilterDate.value = 'all';
                    applyAnnouncementFiltersAndRender();
                });
            });
        }

        // Render Empty Filter State
        if (filteredAnnouncements.length === 0) {
            feed.innerHTML = `
                <div class="card p-4 border-0 shadow-sm bg-white rounded-4 text-center text-muted">
                    <i class="bi bi-search fs-2 d-block mb-2 text-warning opacity-75"></i>
                    <p class="m-0 fw-semibold">No announcements match your search or filter criteria.</p>
                    <span class="micro-text text-muted">Try clearing your search term or adjusting the dropdown filters.</span>
                    <div class="mt-3">
                        <button type="button" class="btn btn-sm btn-outline-success rounded-pill px-3 fw-semibold" id="btnEmptyResetAnnouncements">
                            <i class="bi bi-arrow-counterclockwise me-1"></i> Reset Filters
                        </button>
                    </div>
                </div>
            `;

            const btnEmptyReset = document.getElementById('btnEmptyResetAnnouncements');
            if (btnEmptyReset) {
                btnEmptyReset.addEventListener('click', resetAnnouncementFilters);
            }
            return;
        }

        // Render Filtered Announcement Cards
        feed.innerHTML = '';
        for (const a of filteredAnnouncements) {
            const isChecked = selectedIds.has(String(a.id));
            const card = document.createElement('div');
            card.className = 'card border-0 shadow-sm p-3 announcement-card';
            card.innerHTML = `
                <div class="d-flex align-items-start gap-3">
                    <input type="checkbox" class="form-check-input mt-1 select-announcement" data-id="${a.id}" ${isChecked ? 'checked' : ''}>
                    <div class="flex-grow-1">
                        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
                            <h5 class="fw-bold m-0 text-dark">${escapeHtml(a.title)}</h5>
                            <div class="d-flex align-items-center gap-1">
                                <span class="badge ${typeClass[a.type] || 'bg-primary-subtle text-primary'}">${escapeHtml(a.type)}</span>
                                <span class="badge bg-light text-secondary border micro-text">${a.audience === 'all' ? 'All Users' : (a.audience ? a.audience.charAt(0).toUpperCase() + a.audience.slice(1) : 'All Users')}</span>
                            </div>
                        </div>
                        <p class="text-muted small mb-1 mt-1"><i class="bi bi-calendar-event me-1 text-success"></i> ${formatDate(a.event_date)}</p>
                        <p class="mb-0 text-secondary text-sm">${escapeHtml(a.description)}</p>
                    </div>
                </div>
            `;
            feed.appendChild(card);
        }

        // Re-bind Checkboxes to Selection Set
        feed.querySelectorAll('.select-announcement').forEach(cb => {
            cb.addEventListener('change', () => {
                const id = String(cb.dataset.id);
                if (cb.checked) selectedIds.add(id);
                else selectedIds.delete(id);
                deleteBtn.disabled = selectedIds.size === 0;
            });
        });
    }

    async function loadAnnouncements() {
        feed.innerHTML = `
            <div class="text-center py-4 text-muted small">
                <div class="spinner-border spinner-border-sm text-success me-2" role="status"></div>
                Loading announcements...
            </div>
        `;

        selectedIds.clear();
        deleteBtn.disabled = true;

        try {
            const data = await authedFetch('/api/announcements', token);
            if (!data.success || !Array.isArray(data.announcements)) {
                allAnnouncements = [];
                filteredAnnouncements = [];
                feed.innerHTML = '<p class="text-danger small py-4 text-center">Failed to load announcements.</p>';
                return;
            }

            allAnnouncements = data.announcements;

            // Mark announcements as seen because admin is viewing the page
            if (typeof markAnnouncementsAsSeen === 'function') {
                markAnnouncementsAsSeen(data.announcements);
            } else {
                const maxId = Math.max(...data.announcements.map(a => Number(a.id) || 0));
                if (maxId > 0) {
                    const u = JSON.parse(localStorage.getItem('mentorae_user') || '{}');
                    localStorage.setItem(`mentorae_seen_ann_id_${u.id || u.role || 'admin'}`, String(maxId));
                }
            }

            applyAnnouncementFiltersAndRender();
        } catch (err) {
            console.error('loadAnnouncements error:', err);
            allAnnouncements = [];
            filteredAnnouncements = [];
            feed.innerHTML = '<p class="text-danger small py-4 text-center">Error connecting to announcements server.</p>';
        }
    }

    // Attach Toolbar Event Listeners
    if (announcementSearchInput) {
        announcementSearchInput.addEventListener('input', applyAnnouncementFiltersAndRender);
    }
    if (btnAnnouncementSearchClear) {
        btnAnnouncementSearchClear.addEventListener('click', () => {
            if (announcementSearchInput) announcementSearchInput.value = '';
            applyAnnouncementFiltersAndRender();
        });
    }
    if (announcementFilterType) {
        announcementFilterType.addEventListener('change', applyAnnouncementFiltersAndRender);
    }
    if (announcementFilterAudience) {
        announcementFilterAudience.addEventListener('change', applyAnnouncementFiltersAndRender);
    }
    if (announcementFilterDate) {
        announcementFilterDate.addEventListener('change', applyAnnouncementFiltersAndRender);
    }
    if (btnAnnouncementResetFilters) {
        btnAnnouncementResetFilters.addEventListener('click', resetAnnouncementFilters);
    }

    let isPostingAnnouncement = false;
    announcementForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isPostingAnnouncement) return;

        const titleEl = document.getElementById('inputEvent');
        const dateEl = document.getElementById('inputDate');
        const descEl = document.getElementById('inputDesc');
        const title = titleEl ? titleEl.value.trim() : '';
        const eventDate = dateEl ? dateEl.value : '';
        const description = descEl ? descEl.value.trim() : '';
        const audience = document.getElementById('inputAudience') ? document.getElementById('inputAudience').value : 'all';

        if (titleEl) clearInlineWarning(titleEl);
        if (dateEl) clearInlineWarning(dateEl);
        if (descEl) clearInlineWarning(descEl);

        let hasError = false;
        if (!title) {
            showInlineWarning(titleEl, 'Announcement title is required.');
            if (!hasError && titleEl) titleEl.focus();
            hasError = true;
        }
        if (!eventDate) {
            showInlineWarning(dateEl, 'Please select an event date.');
            if (!hasError && dateEl) dateEl.focus();
            hasError = true;
        }
        if (!description) {
            showInlineWarning(descEl, 'Description cannot be empty.');
            if (!hasError && descEl) descEl.focus();
            hasError = true;
        }

        if (hasError) return;

        const submitBtn = announcementForm.querySelector('button[type="submit"]');
        if (submitBtn && submitBtn.disabled) return;

        isPostingAnnouncement = true;
        const origSubmitHtml = submitBtn ? submitBtn.innerHTML : 'Post Announcement';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Posting...';
        }

        try {
            const data = await authedFetch('/api/announcements', token, {
                method: 'POST',
                body: JSON.stringify({ title, eventDate, description, audience }),
            });

            if (!data.success) {
                alert(data.message);
                return;
            }
            announcementForm.reset();
            creationFormWrapper.classList.add('d-none');
            loadAnnouncements();
        } catch (err) {
            console.error('Error posting announcement:', err);
            alert('Could not post announcement. Please check your network connection.');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = origSubmitHtml;
            }
            isPostingAnnouncement = false;
        }
    });

    deleteBtn.addEventListener('click', async () => {
        if (!selectedIds.size || deleteBtn.disabled) return;
        if (!confirm(`Delete ${selectedIds.size} announcement(s)?`)) return;

        const origDeleteHtml = deleteBtn.innerHTML;
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Deleting...';

        try {
            const data = await authedFetch('/api/announcements/delete-batch', token, {
                method: 'POST',
                body: JSON.stringify({ ids: Array.from(selectedIds) }),
            });
            alert(data.message);
            loadAnnouncements();
        } catch (err) {
            console.error('Batch delete error:', err);
            alert('Failed to delete announcements.');
        } finally {
            deleteBtn.disabled = selectedIds.size === 0;
            deleteBtn.innerHTML = origDeleteHtml;
        }
    });

    loadAnnouncements();
});
