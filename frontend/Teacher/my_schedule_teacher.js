document.addEventListener('DOMContentLoaded', () => {
    const { token, user } = requireSession('../login.html');

    const liveDateElement = document.getElementById('liveDate');
    const liveTimeElement = document.getElementById('liveTime');
    function updateDateTime() {
        const now = new Date();
        if (liveDateElement) liveDateElement.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        if (liveTimeElement) liveTimeElement.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    // Populate Print Metadata
    const storedUser = user || JSON.parse(localStorage.getItem('mentorae_user') || '{}');
    const teacherName = (storedUser.firstName || storedUser.first_name)
        ? `${storedUser.firstName || storedUser.first_name} ${storedUser.lastName || storedUser.last_name}`
        : 'Teacher';
    const teacherNameEl = document.getElementById('printTeacherName');
    const teacherSigEl = document.getElementById('printTeacherSig');
    if (teacherNameEl) teacherNameEl.textContent = teacherName;
    if (teacherSigEl) teacherSigEl.textContent = teacherName;

    const printDateEl = document.getElementById('printDate');
    if (printDateEl) {
        printDateEl.textContent = new Date().toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    }

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    function toMinutes(t) {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return h * 60 + (m || 0);
    }

    function toTimeStr(mins) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    function formatTime(t) {
        if (!t) return '';
        const [h, m] = t.split(':');
        const date = new Date();
        date.setHours(Number(h), Number(m));
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }

    async function load() {
        const tbody = document.getElementById('schedule-body');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm me-2"></span>Loading schedule...</td></tr>';

        try {
            const data = await authedFetch('/api/schedules/mine', token);
            tbody.innerHTML = '';

            if (!data.success || !data.schedule || !data.schedule.length) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No schedule assigned yet.</td></tr>';
                return;
            }

            const schedules = data.schedule;

            // Populate Quarter/Term name in header
            const terms = Array.from(new Set(schedules.map(s => s.quarter).filter(Boolean)));
            const termEl = document.getElementById('printTermName');
            if (termEl) {
                termEl.textContent = terms.length === 1 ? terms[0] : (terms.length > 1 ? terms.join(', ') : 'All Terms');
            }

            // Extract all unique start and end boundaries
            const timePointsSet = new Set();
            for (const s of schedules) {
                timePointsSet.add(toMinutes(s.startTime));
                timePointsSet.add(toMinutes(s.endTime));
            }
            const sortedPoints = Array.from(timePointsSet).sort((a, b) => a - b);

            // Construct atomic intervals that have at least one scheduled class
            const intervals = [];
            for (let i = 0; i < sortedPoints.length - 1; i++) {
                const startMin = sortedPoints[i];
                const endMin = sortedPoints[i + 1];
                const hasClass = schedules.some(s => toMinutes(s.startTime) <= startMin && toMinutes(s.endTime) >= endMin);
                if (hasClass) {
                    intervals.push({
                        startMin,
                        endMin,
                        startStr: toTimeStr(startMin),
                        endStr: toTimeStr(endMin),
                    });
                }
            }

            if (!intervals.length) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No valid schedule intervals found.</td></tr>';
                return;
            }

            // Track spans across rows for each day to cleanly apply rowspan
            const coveredUntil = {};
            days.forEach(d => { coveredUntil[d] = 0; });

            for (let idx = 0; idx < intervals.length; idx++) {
                const interval = intervals[idx];
                const tr = document.createElement('tr');

                // Time Slot column with responsive non-overlapping layout
                const timeCell = document.createElement('td');
                timeCell.className = 'time-slot';
                timeCell.innerHTML = `
                    <div class="time-range-wrap">
                        <span class="time-val">${formatTime(interval.startStr)}</span>
                        <span class="time-hyphen">–</span>
                        <span class="time-val">${formatTime(interval.endStr)}</span>
                    </div>
                `;
                tr.appendChild(timeCell);

                // Day columns with rowspan synchronization
                for (const day of days) {
                    if (coveredUntil[day] > interval.startMin) {
                        // Cell is covered by an ongoing rowspan from an earlier interval
                        continue;
                    }

                    // Look for schedule starting at this interval
                    const entry = schedules.find(s => s.day === day && toMinutes(s.startTime) === interval.startMin);

                    if (entry) {
                        let span = 0;
                        const entryEndMin = toMinutes(entry.endTime);
                        for (let j = idx; j < intervals.length; j++) {
                            if (intervals[j].endMin <= entryEndMin) {
                                span++;
                            } else {
                                break;
                            }
                        }
                        span = Math.max(1, span);
                        coveredUntil[day] = entryEndMin;

                        const td = document.createElement('td');
                        if (span > 1) td.rowSpan = span;
                        td.className = 'p-1 align-middle';
                        td.innerHTML = `
                            <div class="class-entry">
                                <div class="subject">${entry.subject}</div>
                                <div class="section">${entry.strand} - ${entry.section}</div>
                            </div>
                        `;
                        tr.appendChild(td);
                    } else {
                        // Free time slot: render balanced slot placeholder so row heights remain stable
                        const td = document.createElement('td');
                        td.className = 'text-muted micro-text align-middle';
                        td.textContent = '—';
                        tr.appendChild(td);
                    }
                }

                tbody.appendChild(tr);
            }
        } catch (err) {
            console.error('Error loading schedule:', err);
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-4">Failed to load schedule. Please try again later.</td></tr>';
        }
    }

    document.getElementById('btnPrintSchedule')?.addEventListener('click', () => window.print());

    load();
});
