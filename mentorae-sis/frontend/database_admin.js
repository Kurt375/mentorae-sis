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

    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    const statButtons = {
        students: document.getElementById('btnStudents'),
        subjects: document.getElementById('btnSubjects'),
        strands: document.getElementById('btnStrands'),
    };

    async function renderTable(category) {
        Object.values(statButtons).forEach(btn => btn.classList.remove('highlighted-stat'));
        statButtons[category].classList.add('highlighted-stat');

        const data = await authedFetch(`/api/database/${category}`, token);
        if (!data.success) {
            tableBody.innerHTML = `<tr><td class="text-center text-muted py-4">${data.message}</td></tr>`;
            return;
        }

        tableHead.innerHTML = `<tr class="table-header-row text-white">${data.headers.map(h => `<th class="px-3 py-2.5">${h}</th>`).join('')}</tr>`;

        if (!data.records.length) {
            tableBody.innerHTML = `<tr><td colspan="${data.headers.length}" class="text-center text-muted py-4">No records yet.</td></tr>`;
            return;
        }

        tableBody.innerHTML = data.records.map(r => `
            <tr>
                <td class="px-3 py-2">${r.f1}</td>
                <td class="px-3 py-2">${r.f2}</td>
                <td class="px-3 py-2">${r.f3}</td>
                <td class="px-3 py-2">${r.f4}</td>
            </tr>
        `).join('');

        const countEl = { students: 'studentsCountVal', subjects: 'subjectsCountVal', strands: 'strandsCountVal' }[category];
        document.getElementById(countEl).textContent = data.records.length;
    }

    statButtons.students.addEventListener('click', () => renderTable('students'));
    statButtons.subjects.addEventListener('click', () => renderTable('subjects'));
    statButtons.strands.addEventListener('click', () => renderTable('strands'));

    async function loadAllCounts() {
        const [students, subjects, strands] = await Promise.all([
            authedFetch('/api/database/students', token),
            authedFetch('/api/database/subjects', token),
            authedFetch('/api/database/strands', token),
        ]);
        if (students.success) document.getElementById('studentsCountVal').textContent = students.records.length;
        if (subjects.success) document.getElementById('subjectsCountVal').textContent = subjects.records.length;
        if (strands.success) document.getElementById('strandsCountVal').textContent = strands.records.length;
    }

    loadAllCounts();
    renderTable('students');
});
