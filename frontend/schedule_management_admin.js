document.addEventListener('DOMContentLoaded', () => {
    const { token } = requireSession('login.html');

    function updateDateTime() {
        const liveDateElement = document.getElementById('liveDate');
        const liveTimeElement = document.getElementById('liveTime');
        if (!liveDateElement || !liveTimeElement) return;
        const now = new Date();
        liveDateElement.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        liveTimeElement.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    const teacherSelect = document.getElementById('teacherSelect');
    const subjectSelect = document.getElementById('subjectSelect');
    const strandSelect = document.getElementById('strandSelect');
    const sectionSelect = document.getElementById('sectionSelect');
    const daySelect = document.getElementById('daySelect');
    const startTime = document.getElementById('startTime');
    const endTime = document.getElementById('endTime');
    const startTimeError = document.getElementById('startTimeError');
    const endTimeError = document.getElementById('endTimeError');
    const form = document.getElementById('createScheduleForm');
    const searchInput = document.getElementById('scheduleSearch');
    const tbody = document.getElementById('scheduleTableBody');

    let allSections = [];
    let allSchedules = [];

    // --- Populate dropdowns ---
    async function loadTeachers() {
        const data = await authedFetch('/api/users?role=teacher&limit=200', token);
        if (data.success) {
            teacherSelect.innerHTML = data.users.map(t =>
                `<option value="${t.id}">${t.first_name} ${t.last_name}</option>`
            ).join('');
        }
    }

    async function loadSubjects() {
        const data = await authedFetch('/api/reference/subjects', token);
        if (data.success) {
            subjectSelect.innerHTML = data.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        }
    }

    async function loadStrands() {
        const data = await authedFetch('/api/reference/strands', token);
        if (data.success) {
            strandSelect.innerHTML = data.strands.map(s => `<option value="${s.id}">${s.code}</option>`).join('');
            loadSections();
        }
    }

    async function loadSections() {
        const data = await authedFetch(`/api/reference/sections?strandId=${strandSelect.value}`, token);
        if (data.success) {
            allSections = data.sections;
            sectionSelect.innerHTML = data.sections.map(s => `<option value="${s.id}">Grade ${s.grade_level} - ${s.name}</option>`).join('');
        }
    }
    strandSelect.addEventListener('change', loadSections);

    // --- Time validation (real, not the crashing original) ---
    function validateTimeInputs() {
        startTimeError.textContent = '';
        endTimeError.textContent = '';
        let valid = true;

        const SCHOOL_OPEN = '07:00';
        const SCHOOL_CLOSE = '15:30';

        if (!startTime.value || !endTime.value) return false;

        if (startTime.value < SCHOOL_OPEN) {
            startTimeError.textContent = 'Cannot start before 7:00 AM.';
            valid = false;
        }
        if (endTime.value > SCHOOL_CLOSE) {
            endTimeError.textContent = 'Cannot end after 3:30 PM.';
            valid = false;
        }
        if (startTime.value >= endTime.value) {
            endTimeError.textContent = 'End time must be after start time.';
            valid = false;
        } else {
            const toMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
            const duration = toMinutes(endTime.value) - toMinutes(startTime.value);
            if (duration < 30) {
                endTimeError.textContent = 'Duration must be at least 30 minutes.';
                valid = false;
            } else if (duration > 120) {
                endTimeError.textContent = 'Duration cannot exceed 2 hours.';
                valid = false;
            }
        }
        return valid;
    }
    startTime.addEventListener('change', validateTimeInputs);
    endTime.addEventListener('change', validateTimeInputs);

    // --- Create schedule ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!validateTimeInputs()) {
            return; // errors already shown inline — this is the fixed version of the original crash
        }

        const days = daySelect.value === 'All Weekdays'
            ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
            : [daySelect.value];

        const data = await authedFetch('/api/schedules', token, {
            method: 'POST',
            body: JSON.stringify({
                teacherId: teacherSelect.value,
                subjectId: subjectSelect.value,
                sectionId: sectionSelect.value,
                days,
                startTime: startTime.value,
                endTime: endTime.value,
            }),
        });

        if (!data.success) {
            alert(data.message);
            return;
        }
        alert(data.message);
        form.reset();
        loadSchedules();
    });

    // --- Master schedule table ---
    async function loadSchedules() {
        const data = await authedFetch('/api/schedules', token);
        allSchedules = data.success ? data.schedules : [];
        renderSchedules(allSchedules);
    }

    function formatTime(t) {
        const [h, m] = t.split(':');
        const d = new Date();
        d.setHours(Number(h), Number(m));
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }

    function renderSchedules(schedules) {
        tbody.innerHTML = '';
        if (!schedules.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No schedules created yet.</td></tr>';
            return;
        }
        for (const s of schedules) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-3 py-2">${s.teacher}</td>
                <td class="px-3 py-2">${s.subject}</td>
                <td class="px-3 py-2">${s.strand} - ${s.section}</td>
                <td class="px-3 py-2">${s.day}</td>
                <td class="px-3 py-2">${formatTime(s.startTime)} - ${formatTime(s.endTime)}</td>
                <td class="px-3 py-2 text-center">
                    <button class="btn btn-link p-0 text-danger fs-5" title="Delete" data-id="${s.id}"><i class="bi bi-trash3-fill"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        }
        tbody.querySelectorAll('[data-id]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this schedule entry?')) return;
                const data = await authedFetch(`/api/schedules/${btn.dataset.id}`, token, { method: 'DELETE' });
                if (data.success) loadSchedules();
            });
        });
    }

    searchInput.addEventListener('input', () => {
        const term = searchInput.value.toLowerCase();
        renderSchedules(allSchedules.filter(s =>
            s.teacher.toLowerCase().includes(term) ||
            s.subject.toLowerCase().includes(term) ||
            s.section.toLowerCase().includes(term) ||
            s.day.toLowerCase().includes(term)
        ));
    });

    loadTeachers();
    loadSubjects();
    loadStrands();
    loadSchedules();
});
