document.addEventListener('DOMContentLoaded', () => {
    const { token } = requireSession('../login.html');

    const liveDateElement = document.getElementById('liveDate');
    const liveTimeElement = document.getElementById('liveTime');
    function updateDateTime() {
        const now = new Date();
        liveDateElement.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        liveTimeElement.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    function formatTime(t) {
        const [h, m] = t.split(':');
        const date = new Date();
        date.setHours(Number(h), Number(m));
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }

    async function load() {
        const data = await authedFetch('/api/schedules/mine', token);
        const tbody = document.getElementById('schedule-body');
        tbody.innerHTML = '';

        if (!data.success || !data.schedule.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No schedule assigned yet.</td></tr>';
            return;
        }

        // Group by unique time block (start-end), one row per block
        const blocks = {};
        for (const s of data.schedule) {
            const key = `${s.startTime}-${s.endTime}`;
            if (!blocks[key]) blocks[key] = { startTime: s.startTime, endTime: s.endTime, days: {} };
            blocks[key].days[s.day] = s;
        }

        const sortedBlocks = Object.values(blocks).sort((a, b) => a.startTime.localeCompare(b.startTime));

        for (const block of sortedBlocks) {
            const tr = document.createElement('tr');
            let cells = `<td class="fw-semibold small">${formatTime(block.startTime)} - ${formatTime(block.endTime)}</td>`;
            for (const day of days) {
                const entry = block.days[day];
                cells += entry
                    ? `<td class="small"><div class="fw-semibold">${entry.subject}</div><div class="text-muted micro-text">${entry.strand} - ${entry.section}</div></td>`
                    : `<td class="text-muted micro-text">—</td>`;
            }
            tr.innerHTML = cells;
            tbody.appendChild(tr);
        }
    }

    document.getElementById('btnPrintSchedule')?.addEventListener('click', () => window.print());

    load();
});
