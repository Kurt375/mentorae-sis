document.addEventListener('DOMContentLoaded', () => {
    const { token, user } = requireSession('../login.html');

    // Live date/time
    const liveDateElement = document.getElementById('liveDate');
    const liveTimeElement = document.getElementById('liveTime');
    function updateDateTime() {
        const now = new Date();
        liveDateElement.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        liveTimeElement.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    let mySections = [];
    let currentRoster = [];
    let badgeCatalog = [];
    let selectedBadgeIds = new Set();

    const sectionFilter = document.getElementById('filterSection');
    const gradeSectionSelect = document.getElementById('gradeSectionSelect');
    const gradeSubjectSelect = document.getElementById('gradeSubjectSelect');
    const gradeTermSelect = document.getElementById('gradeTermSelect');
    const searchBar = document.getElementById('searchBar');
    const rosterBody = document.getElementById('studentRosterBody');
    const studentSelectBadge = document.getElementById('studentSelectBadge');
    const badgesGrid = document.getElementById('badgesSelectionGrid');
    const activityTimeline = document.getElementById('activityTimeline');

    // --- Load teacher's sections into both dropdowns ---
    async function loadSections() {
        const data = await authedFetch('/api/classes/my-sections', token);
        if (!data.success || !data.sections.length) {
            sectionFilter.innerHTML = '<option>No sections assigned</option>';
            gradeSectionSelect.innerHTML = '<option>No sections assigned</option>';
            return;
        }
        mySections = data.sections;
        const optionsHtml = data.sections.map(s => `<option value="${s.id}">${s.strandCode} ${s.grade_level} - ${s.name}</option>`).join('');
        sectionFilter.innerHTML = optionsHtml;
        gradeSectionSelect.innerHTML = optionsHtml;
        loadRoster(sectionFilter.value);
        loadLeaderboard(sectionFilter.value);
    }

    // --- Section leaderboard (badge points ranking) ---
    const leaderboardList = document.getElementById('sectionLeaderboardList');
    async function loadLeaderboard(sectionId) {
        if (!sectionId) {
            leaderboardList.innerHTML = '<p class="text-muted small">Select a section to see rankings.</p>';
            return;
        }
        const data = await authedFetch(`/api/badges/leaderboard?scope=section&sectionId=${sectionId}&limit=5`, token);
        if (!data.success || !data.leaderboard.length) {
            leaderboardList.innerHTML = '<p class="text-muted small">No badge points yet for this section.</p>';
            return;
        }
        leaderboardList.innerHTML = data.leaderboard.map(r => `
            <div class="d-flex justify-content-between align-items-center py-1.5 ${r.rank < data.leaderboard.length ? 'border-bottom' : ''}">
                <span class="small"><strong>#${r.rank}</strong> ${r.name}</span>
                <span class="small fw-semibold text-success">${r.points} pts</span>
            </div>
        `).join('');
    }

    // --- Load subjects for the grade encoding subject dropdown ---
    async function loadSubjects() {
        const data = await authedFetch('/api/reference/subjects', token);
        if (data.success) {
            gradeSubjectSelect.innerHTML = data.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        }
    }

    // --- Student roster table ---
    async function loadRoster(sectionId) {
        if (!sectionId) return;
        const data = await authedFetch(`/api/classes/roster?sectionId=${sectionId}`, token);
        currentRoster = data.success ? data.roster : [];
        renderRoster(currentRoster);
        populateStudentBadgeSelect(currentRoster);
    }

    const statusBadgeClass = {
        present: 'bg-success-subtle text-success',
        late: 'bg-warning-subtle text-warning',
        excused: 'bg-info-subtle text-info',
        absent: 'bg-danger-subtle text-danger',
    };

    function renderRoster(roster) {
        rosterBody.innerHTML = '';
        if (!roster.length) {
            rosterBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No students in this section yet.</td></tr>';
            return;
        }
        for (const s of roster) {
            const tr = document.createElement('tr');
            const label = s.status.charAt(0).toUpperCase() + s.status.slice(1);
            tr.innerHTML = `
                <td class="px-4 py-3">${s.idNumber}</td>
                <td class="px-4 py-3">${s.name}</td>
                <td class="px-4 py-3 text-center">${s.grade ?? '—'}</td>
                <td class="px-4 py-3 text-center">${s.attendance}</td>
                <td class="px-4 py-3 text-center"><span class="badge ${statusBadgeClass[s.status] || ''}">${label}</span></td>
            `;
            rosterBody.appendChild(tr);
        }
    }

    searchBar.addEventListener('input', () => {
        const term = searchBar.value.toLowerCase();
        renderRoster(currentRoster.filter(s => s.name.toLowerCase().includes(term) || s.idNumber.toLowerCase().includes(term)));
    });
    sectionFilter.addEventListener('change', (e) => {
        loadRoster(e.target.value);
        loadLeaderboard(e.target.value);
    });

    // --- Give Badge section ---
    const giveBadgesSection = document.getElementById('giveBadgesSection');
    const enterGradesSection = document.getElementById('enterGradesSection');
    giveBadgesSection.style.display = 'none';
    enterGradesSection.style.display = 'none';

    document.getElementById('btnGiveBadge').addEventListener('click', () => {
        giveBadgesSection.style.display = 'flex';
        enterGradesSection.style.display = 'none';
        giveBadgesSection.scrollIntoView({ behavior: 'smooth' });
    });
    document.getElementById('btnEncodeGrades').addEventListener('click', () => {
        enterGradesSection.style.display = 'block';
        giveBadgesSection.style.display = 'none';
        loadGradeSheet();
        enterGradesSection.scrollIntoView({ behavior: 'smooth' });
    });
    document.getElementById('btnCancelAction').addEventListener('click', () => {
        giveBadgesSection.style.display = 'none';
    });

    function populateStudentBadgeSelect(roster) {
        studentSelectBadge.innerHTML = roster.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }

    async function loadBadgeCatalog() {
        const data = await authedFetch('/api/badges/catalog', token);
        badgeCatalog = data.success ? data.badges : [];
        badgesGrid.innerHTML = '';
        for (const b of badgeCatalog) {
            const col = document.createElement('div');
            col.className = 'col';
            col.innerHTML = `
                <div class="badge-select-tile border rounded-3 p-2 text-center" data-id="${b.id}" style="cursor:pointer; background:${b.bg || '#f5f5f5'}; color:${b.color || '#333'};">
                    <div class="fs-4">${b.icon ? `<i class="bi ${b.icon}"></i>` : (b.symbol || '★')}</div>
                    <div class="micro-text fw-semibold mt-1">${b.name}</div>
                </div>
            `;
            badgesGrid.appendChild(col);
        }
        badgesGrid.querySelectorAll('.badge-select-tile').forEach(tile => {
            tile.addEventListener('click', () => {
                const id = tile.dataset.id;
                if (selectedBadgeIds.has(id)) {
                    selectedBadgeIds.delete(id);
                    tile.style.outline = 'none';
                } else {
                    selectedBadgeIds.add(id);
                    tile.style.outline = '3px solid #0a5c2c';
                }
            });
        });
    }

    document.getElementById('btnAwardBadges').addEventListener('click', async () => {
        const studentId = studentSelectBadge.value;
        if (!studentId || !selectedBadgeIds.size) {
            alert('Select a student and at least one badge.');
            return;
        }
        const data = await authedFetch('/api/badges/award', token, {
            method: 'POST',
            body: JSON.stringify({ studentId, badgeIds: Array.from(selectedBadgeIds) }),
        });
        alert(data.message);
        if (data.success) {
            selectedBadgeIds.clear();
            badgesGrid.querySelectorAll('.badge-select-tile').forEach(t => t.style.outline = 'none');
            loadActivity(studentId);
        }
    });

    async function loadActivity(studentId) {
        const data = await authedFetch(`/api/badges/student/${studentId}`, token);
        if (!data.success) return;
        activityTimeline.innerHTML = '';
        if (!data.activity.length) {
            activityTimeline.innerHTML = '<p class="text-muted small">No recent activity.</p>';
            return;
        }
        for (const item of data.activity) {
            const div = document.createElement('div');
            div.className = 'timeline-item d-flex gap-3 align-items-start position-relative';
            div.innerHTML = `
                <div class="badge-icon-status flex-shrink-0 bg-success text-white rounded-circle d-flex align-items-center justify-content-center">
                    <i class="bi bi-star-fill micro-text"></i>
                </div>
                <div>
                    <p class="m-0 text-sm text-dark">${item.description}</p>
                    <span class="micro-text text-muted">${new Date(item.created_at).toLocaleDateString()}</span>
                </div>
            `;
            activityTimeline.appendChild(div);
        }
    }
    studentSelectBadge.addEventListener('change', (e) => loadActivity(e.target.value));

    // --- Enter Grades ---
    async function loadGradeSheet() {
        const sectionId = gradeSectionSelect.value;
        const subjectId = gradeSubjectSelect.value;
        const term = gradeTermSelect.value;
        if (!sectionId || !subjectId) return;

        const data = await authedFetch(`/api/grades/roster?sectionId=${sectionId}&subjectId=${subjectId}&term=${encodeURIComponent(term)}`, token);
        const tbody = document.getElementById('gradeEncodingEntriesBody');
        tbody.innerHTML = '';
        if (!data.success || !data.roster.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No students in this section.</td></tr>';
            return;
        }
        for (const s of data.roster) {
            const tr = document.createElement('tr');
            tr.dataset.studentId = s.studentId;
            tr.innerHTML = `
                <td class="px-3 py-2 text-start">${s.idNumber}</td>
                <td class="px-3 py-2 text-start">${s.name}</td>
                <td class="px-2 py-2"><input type="number" class="form-control form-control-sm quiz-input" min="0" max="30" value="${s.quiz ?? ''}"></td>
                <td class="px-2 py-2"><input type="number" class="form-control form-control-sm activity-input" min="0" max="20" value="${s.activity ?? ''}"></td>
                <td class="px-2 py-2"><input type="number" class="form-control form-control-sm exam-input" min="0" max="50" value="${s.exam ?? ''}"></td>
                <td class="px-2 py-2 text-center average-cell fw-bold">${s.average ?? '—'}</td>
                <td class="px-3 py-2 remarks-cell">${s.remarks ?? ''}</td>
                <td class="px-3 py-2 text-center"><i class="bi bi-check-circle text-muted"></i></td>
            `;
            tbody.appendChild(tr);

            const recompute = () => {
                const q = Number(tr.querySelector('.quiz-input').value) || 0;
                const a = Number(tr.querySelector('.activity-input').value) || 0;
                const e = Number(tr.querySelector('.exam-input').value) || 0;
                const avg = q + a + e;
                tr.querySelector('.average-cell').textContent = avg;
            };
            tr.querySelectorAll('input').forEach(inp => inp.addEventListener('input', recompute));
        }
    }

    gradeSectionSelect.addEventListener('change', loadGradeSheet);
    gradeSubjectSelect.addEventListener('change', loadGradeSheet);
    gradeTermSelect.addEventListener('change', loadGradeSheet);

    document.getElementById('btnSaveGrades').addEventListener('click', async () => {
        const sectionId = gradeSectionSelect.value;
        const subjectId = gradeSubjectSelect.value;
        const term = gradeTermSelect.value;
        const rows = document.querySelectorAll('#gradeEncodingEntriesBody tr[data-student-id]');

        if (!rows.length) {
            alert('Nothing to save.');
            return;
        }

        let saved = 0;
        for (const row of rows) {
            const studentId = row.dataset.studentId;
            const quiz = row.querySelector('.quiz-input').value;
            const activity = row.querySelector('.activity-input').value;
            const exam = row.querySelector('.exam-input').value;
            if (quiz === '' && activity === '' && exam === '') continue;

            const data = await authedFetch('/api/grades', token, {
                method: 'POST',
                body: JSON.stringify({ studentId, subjectId, sectionId, term, quiz, activity, exam }),
            });
            if (data.success) saved++;
        }
        alert(`Saved grades for ${saved} student(s).`);
        loadGradeSheet();
    });

    wireLogout('logoutBtn', '../login.html', token);

    loadSections();
    loadSubjects();
    loadBadgeCatalog();
});
