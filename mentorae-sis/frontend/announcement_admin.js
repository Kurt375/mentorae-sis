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

    async function loadAnnouncements() {
        const data = await authedFetch('/api/announcements', token);
        feed.innerHTML = '';
        selectedIds.clear();
        deleteBtn.disabled = true;

        if (!data.success || !data.announcements.length) {
            feed.innerHTML = '<p class="text-muted text-center py-4">No announcements posted yet.</p>';
            return;
        }

        for (const a of data.announcements) {
            const card = document.createElement('div');
            card.className = 'card border-0 shadow-sm p-3 announcement-card';
            card.innerHTML = `
                <div class="d-flex align-items-start gap-3">
                    <input type="checkbox" class="form-check-input mt-1 select-announcement" data-id="${a.id}">
                    <div class="flex-grow-1">
                        <div class="d-flex justify-content-between align-items-start">
                            <h5 class="fw-bold m-0">${a.title}</h5>
                            <span class="badge ${typeClass[a.type] || ''}">${a.type}</span>
                        </div>
                        <p class="text-muted small mb-1"><i class="bi bi-calendar-event"></i> ${formatDate(a.event_date)}</p>
                        <p class="mb-0">${a.description}</p>
                    </div>
                </div>
            `;
            feed.appendChild(card);
        }

        feed.querySelectorAll('.select-announcement').forEach(cb => {
            cb.addEventListener('change', () => {
                if (cb.checked) selectedIds.add(cb.dataset.id);
                else selectedIds.delete(cb.dataset.id);
                deleteBtn.disabled = selectedIds.size === 0;
            });
        });
    }

    announcementForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('inputEvent').value.trim();
        const eventDate = document.getElementById('inputDate').value;
        const description = document.getElementById('inputDesc').value.trim();

        if (!title || !eventDate || !description) {
            alert('Please fill in all fields.');
            return;
        }

        const data = await authedFetch('/api/announcements', token, {
            method: 'POST',
            body: JSON.stringify({ title, eventDate, description }),
        });

        if (!data.success) {
            alert(data.message);
            return;
        }
        announcementForm.reset();
        creationFormWrapper.classList.add('d-none');
        loadAnnouncements();
    });

    deleteBtn.addEventListener('click', async () => {
        if (!selectedIds.size) return;
        if (!confirm(`Delete ${selectedIds.size} announcement(s)?`)) return;
        const data = await authedFetch('/api/announcements/delete-batch', token, {
            method: 'POST',
            body: JSON.stringify({ ids: Array.from(selectedIds) }),
        });
        alert(data.message);
        loadAnnouncements();
    });

    loadAnnouncements();
});
