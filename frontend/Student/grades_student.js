document.addEventListener('DOMContentLoaded', () => {
    const { token } = requireSession('../login.html');

    function updateDateTime() {
        const now = new Date();
        document.getElementById('liveDate').textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        document.getElementById('liveTime').textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    // Same tiers as the backend's getRemarks(), so colors always match the label.
    function tierFor(average) {
        if (average >= 90) return { color: '#2e7d32', bg: 'bg-success-subtle', text: 'text-success' };
        if (average >= 85) return { color: '#1976d2', bg: 'bg-primary-subtle', text: 'text-primary' };
        if (average >= 80) return { color: '#0097a7', bg: 'bg-info-subtle', text: 'text-info' };
        if (average >= 75) return { color: '#f9a825', bg: 'bg-warning-subtle', text: 'text-warning' };
        return { color: '#d32f2f', bg: 'bg-danger-subtle', text: 'text-danger' };
    }

    function remarksFor(average) {
        if (average >= 90) return 'Outstanding';
        if (average >= 85) return 'Very Satisfactory';
        if (average >= 80) return 'Satisfactory';
        if (average >= 75) return 'Fairly Satisfactory';
        return 'Did Not Meet Expectations';
    }

    async function load() {
        const data = await authedFetch('/api/grades/mine', token);
        if (!data.success) return;

        // Overall summary
        const overallVal = document.getElementById('overallGradeVal');
        const overallBar = document.getElementById('overallProgressBar');
        const overallBadge = document.getElementById('overallRemarksBadge');
        const overallSubtitle = document.getElementById('overallSubtitle');

        if (data.overallGrade) {
            const avg = Number(data.overallGrade);
            const tier = tierFor(avg);
            overallVal.textContent = `${avg}%`;
            overallBar.style.width = `${avg}%`;
            overallBar.style.backgroundColor = tier.color;
            overallBadge.textContent = remarksFor(avg);
            overallBadge.className = `badge remarks-badge ${tier.bg} ${tier.text}`;
            overallSubtitle.textContent = `Averaged across ${data.grades.length} posted grade${data.grades.length === 1 ? '' : 's'}.`;
        } else {
            overallSubtitle.textContent = 'No grades posted yet.';
        }

        renderGrades(data.grades);
    }

    function renderGrades(grades) {
        const list = document.getElementById('gradesList');
        if (!grades.length) {
            list.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="bi bi-clipboard-data display-3 d-block mb-3 opacity-50"></i>
                    <h6>No grades posted yet</h6>
                    <p class="small">Check back once your teachers start encoding grades.</p>
                </div>`;
            return;
        }

        list.innerHTML = grades.map((g, i) => {
            const avg = Number(g.average);
            const tier = tierFor(avg);
            const quiz = Number(g.quiz_score), activity = Number(g.activity_score), exam = Number(g.exam_score);
            return `
            <div class="grade-card">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <h6 class="fw-bold mb-0">${g.subject}</h6>
                        <span class="text-muted small">${g.term}</span>
                    </div>
                    <div class="text-end">
                        <div class="fw-bold fs-5" style="color:${tier.color}">${avg}%</div>
                        <span class="badge remarks-badge ${tier.bg} ${tier.text}">${g.remarks}</span>
                    </div>
                </div>

                <div class="row g-3 mt-1">
                    <div class="col-4">
                        <div class="mini-bar-label"><span>Quiz</span><span>${quiz}/30</span></div>
                        <div class="mini-bar"><div class="mini-bar-fill" style="width:${(quiz / 30) * 100}%; background:#7c4dff;"></div></div>
                    </div>
                    <div class="col-4">
                        <div class="mini-bar-label"><span>Activity</span><span>${activity}/20</span></div>
                        <div class="mini-bar"><div class="mini-bar-fill" style="width:${(activity / 20) * 100}%; background:#26a69a;"></div></div>
                    </div>
                    <div class="col-4">
                        <div class="mini-bar-label"><span>Exam</span><span>${exam}/50</span></div>
                        <div class="mini-bar"><div class="mini-bar-fill" style="width:${(exam / 50) * 100}%; background:#ff7043;"></div></div>
                    </div>
                </div>

                <div class="goal-panel">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <label class="small fw-semibold m-0" for="goalSlider-${i}">
                            <i class="bi bi-bullseye"></i> What do I need for a target grade?
                        </label>
                        <span class="goal-slider-val" id="goalSliderVal-${i}">90%</span>
                    </div>
                    <input type="range" class="form-range goal-slider" id="goalSlider-${i}" min="60" max="100" step="1" value="90"
                           data-quiz="${quiz}" data-activity="${activity}">
                    <p class="small mb-0 mt-2" id="goalResult-${i}"></p>
                </div>
            </div>`;
        }).join('');

        // Wire each card's slider independently and run an initial calculation.
        list.querySelectorAll('.goal-slider').forEach((slider, i) => {
            slider.addEventListener('input', () => updateGoal(i));
            updateGoal(i);
        });
    }

    function updateGoal(i) {
        const slider = document.getElementById(`goalSlider-${i}`);
        const valEl = document.getElementById(`goalSliderVal-${i}`);
        const resultEl = document.getElementById(`goalResult-${i}`);
        const target = Number(slider.value);
        const quiz = Number(slider.dataset.quiz);
        const activity = Number(slider.dataset.activity);

        valEl.textContent = `${target}%`;

        const secured = quiz + activity; // out of 50, already locked in from quiz + activity
        const requiredExam = target - secured; // out of 50

        if (requiredExam <= 0) {
            resultEl.className = 'small mb-0 mt-2 text-success fw-semibold';
            resultEl.innerHTML = `<i class="bi bi-check-circle-fill"></i> You've already secured this grade from your quiz and activity scores alone.`;
        } else if (requiredExam <= 50) {
            const pct = Math.round((requiredExam / 50) * 100);
            resultEl.className = 'small mb-0 mt-2 text-dark';
            resultEl.innerHTML = `You need at least <strong>${requiredExam.toFixed(1)}/50</strong> (${pct}%) on the exam to reach <strong>${target}%</strong>.`;
        } else {
            const maxPossible = secured + 50;
            resultEl.className = 'small mb-0 mt-2 text-danger';
            resultEl.innerHTML = `Not possible this term — even a perfect exam score caps you at <strong>${maxPossible}%</strong>. Try a lower target.`;
        }
    }

    load();
});
