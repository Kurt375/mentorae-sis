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

    // Official Talisay Senior High School Program Events & Breaks
    const FIXED_SCHOOL_EVENTS = [
        {
            type: 'routine',
            startMin: 6 * 60 + 30, // 06:30 AM
            endMin: 7 * 60,        // 07:00 AM
            startStr: '06:30',
            endStr: '07:00'
        },
        {
            type: 'health_break',
            name: 'HEALTH BREAK',
            subtitle: '20 mins',
            icon: 'bi-cup-hot-fill',
            startMin: 9 * 60,      // 09:00 AM
            endMin: 9 * 60 + 20,   // 09:20 AM
            startStr: '09:00',
            endStr: '09:20'
        },
        {
            type: 'lunch_break',
            name: 'LUNCH BREAK',
            subtitle: '40 mins',
            icon: 'bi-egg-fried',
            startMin: 11 * 60 + 20, // 11:20 AM
            endMin: 12 * 60,        // 12:00 PM
            startStr: '11:20',
            endStr: '12:00'
        }
    ];

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

            // Extract all unique start and end boundaries (classes + fixed school routines)
            const timePointsSet = new Set();
            for (const s of schedules) {
                timePointsSet.add(toMinutes(s.startTime));
                timePointsSet.add(toMinutes(s.endTime));
            }
            for (const evt of FIXED_SCHOOL_EVENTS) {
                timePointsSet.add(evt.startMin);
                timePointsSet.add(evt.endMin);
            }
            const sortedPoints = Array.from(timePointsSet).sort((a, b) => a - b);

            // Construct atomic intervals that have a fixed event or at least one scheduled class
            const intervals = [];
            for (let i = 0; i < sortedPoints.length - 1; i++) {
                const startMin = sortedPoints[i];
                const endMin = sortedPoints[i + 1];
                const fixedEvt = FIXED_SCHOOL_EVENTS.find(e => e.startMin === startMin && e.endMin === endMin);
                const hasClass = schedules.some(s => toMinutes(s.startTime) <= startMin && toMinutes(s.endTime) >= endMin);

                if (fixedEvt || hasClass) {
                    intervals.push({
                        startMin,
                        endMin,
                        startStr: toTimeStr(startMin),
                        endStr: toTimeStr(endMin),
                        fixedEvt: fixedEvt || null,
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

                // 1. Check for Fixed Break / Routine Row
                if (interval.fixedEvt) {
                    if (interval.fixedEvt.type === 'routine') {
                        tr.className = 'routine-row';
                        tr.innerHTML = `
                            <td class="time-slot">
                                <div class="time-range-wrap">
                                    <span class="time-val">${formatTime(interval.startStr)}</span>
                                    <span class="time-hyphen">–</span>
                                    <span class="time-val">${formatTime(interval.endStr)}</span>
                                </div>
                            </td>
                            <td class="p-1 align-middle">
                                <div class="class-entry routine-flag">
                                    <div class="subject"><i class="bi bi-flag-fill me-1 text-primary"></i>Flag Ceremony</div>
                                    <div class="section">School Assembly</div>
                                </div>
                            </td>
                            <td colspan="4" class="p-1 align-middle">
                                <div class="class-entry routine-management">
                                    <div class="subject text-secondary"><i class="bi bi-clipboard-check me-1"></i>Ground Improvement &amp; Classroom Management</div>
                                    <div class="section">Tuesday – Friday Faculty Routine</div>
                                </div>
                            </td>
                        `;
                        tbody.appendChild(tr);
                        continue;
                    }

                    if (interval.fixedEvt.type === 'health_break') {
                        tr.className = 'break-row break-row-health';
                        tr.innerHTML = `
                            <td class="time-slot">
                                <div class="time-range-wrap">
                                    <span class="time-val">${formatTime(interval.startStr)}</span>
                                    <span class="time-hyphen">–</span>
                                    <span class="time-val">${formatTime(interval.endStr)}</span>
                                </div>
                            </td>
                            <td colspan="5" class="break-cell break-cell-health text-center align-middle">
                                <div class="d-inline-flex align-items-center justify-content-center gap-2">
                                    <i class="bi bi-cup-hot-fill text-warning"></i>
                                    <strong class="tracking-wide">HEALTH BREAK</strong>
                                    <span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill px-2 py-0.5 micro-text">20 mins</span>
                                </div>
                            </td>
                        `;
                        tbody.appendChild(tr);
                        continue;
                    }

                    if (interval.fixedEvt.type === 'lunch_break') {
                        tr.className = 'break-row break-row-lunch';
                        tr.innerHTML = `
                            <td class="time-slot">
                                <div class="time-range-wrap">
                                    <span class="time-val">${formatTime(interval.startStr)}</span>
                                    <span class="time-hyphen">–</span>
                                    <span class="time-val">${formatTime(interval.endStr)}</span>
                                </div>
                            </td>
                            <td colspan="5" class="break-cell break-cell-lunch text-center align-middle">
                                <div class="d-inline-flex align-items-center justify-content-center gap-2">
                                    <i class="bi bi-egg-fried text-success"></i>
                                    <strong class="tracking-wide">LUNCH BREAK</strong>
                                    <span class="badge bg-success-subtle text-success-emphasis border border-success-subtle rounded-pill px-2 py-0.5 micro-text">40 mins</span>
                                </div>
                            </td>
                        `;
                        tbody.appendChild(tr);
                        continue;
                    }
                }

                // 2. Standard Academic Class Interval Row
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
                            // Only span through academic intervals that don't cross a fixed event
                            if (intervals[j].fixedEvt) break;
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
