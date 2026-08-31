document.addEventListener('DOMContentLoaded', () => {
    const SUBJECTS_STORAGE_KEY = 'mentorae-subjects-data';

    // DOM Elements
    const quizTitleEl = document.getElementById('quizTitle');
    const quizContainer = document.getElementById('quizContainer');
    const submitQuizBtn = document.getElementById('submitQuizBtn');
    const backBtn = document.getElementById('backBtn');
    
    // Results Modal Elements
    const resultsModal = new bootstrap.Modal(document.getElementById('resultsModal'));
    const finalScoreEl = document.getElementById('finalScore');
    const scorePercentageEl = document.getElementById('scorePercentage');
    const reviewContainer = document.getElementById('reviewContainer');
    const retakeQuizBtn = document.getElementById('retakeQuizBtn');

    let currentQuizQuestions = [];
    let subjectName, topicTitle;

    function loadSubjects() {
        const storedSubjects = localStorage.getItem(SUBJECTS_STORAGE_KEY);
        return storedSubjects ? JSON.parse(storedSubjects) : [];
    }

    function renderQuiz(questions) {
        quizContainer.innerHTML = '';
        if (!questions || questions.length === 0) {
            quizContainer.innerHTML = '<p class="text-center text-muted p-4">This quiz has no questions yet.</p>';
            submitQuizBtn.style.display = 'none';
            return;
        }

        const form = document.createElement('form');
        form.id = 'quizForm';

        questions.forEach((q, index) => {
            const questionBlock = document.createElement('div');
            questionBlock.className = 'mb-4 p-3 border rounded';
            questionBlock.id = `question-${index}`;

            const optionsHtml = Object.keys(q.options).map(key => `
                <div class="form-check">
                    <input class="form-check-input" type="radio" name="question${index}" id="q${index}option${key}" value="${key}" required>
                    <label class="form-check-label" for="q${index}option${key}">
                        ${q.options[key]}
                    </label>
                </div>
            `).join('');

            questionBlock.innerHTML = `
                <p class="fw-bold">${index + 1}. ${q.text}</p>
                ${optionsHtml}
            `;
            form.appendChild(questionBlock);
        });

        quizContainer.appendChild(form);
        submitQuizBtn.style.display = 'block';
    }

    function handleSubmitQuiz() {
        let score = 0;
        const userAnswers = [];

        currentQuizQuestions.forEach((q, index) => {
            const selectedOption = document.querySelector(`input[name="question${index}"]:checked`);
            const answer = selectedOption ? selectedOption.value : null;
            userAnswers.push(answer);
            if (answer === q.answer) {
                score++;
            }
        });

        displayResults(score, userAnswers);
    }

    function displayResults(score, userAnswers) {
        const totalQuestions = currentQuizQuestions.length;
        const percentage = totalQuestions > 0 ? ((score / totalQuestions) * 100).toFixed(0) : 0;

        finalScoreEl.textContent = `${score} / ${totalQuestions}`;
        scorePercentageEl.textContent = percentage;

        reviewContainer.innerHTML = '';
        currentQuizQuestions.forEach((q, index) => {
            const userAnswer = userAnswers[index];
            const isCorrect = userAnswer === q.answer;
            
            const resultClass = isCorrect ? 'border-success' : 'border-danger';
            const icon = isCorrect ? '<i class="bi bi-check-circle-fill text-success"></i>' : '<i class="bi bi-x-circle-fill text-danger"></i>';

            const optionsReviewHtml = Object.keys(q.options).map(key => {
                let labelClass = '';
                let indicator = '';
                if (key === q.answer) {
                    labelClass = 'text-success fw-bold'; // Correct answer
                    indicator = ' (Correct Answer)';
                }
                if (key === userAnswer && !isCorrect) {
                    labelClass = 'text-danger'; // User's wrong answer
                    indicator = ' (Your Answer)';
                }

                return `<li class="${labelClass}">${q.options[key]}${indicator}</li>`;
            }).join('');

            const reviewBlock = document.createElement('div');
            reviewBlock.className = `p-3 mb-3 border rounded ${resultClass}`;
            reviewBlock.innerHTML = `
                <h6 class="fw-bold">${index + 1}. ${q.text} ${icon}</h6>
                <ul>${optionsReviewHtml}</ul>
            `;
            reviewContainer.appendChild(reviewBlock);
        });

        resultsModal.show();
    }

    function init() {
        const urlParams = new URLSearchParams(window.location.search);
        subjectName = decodeURIComponent(urlParams.get('subject'));
        topicTitle = decodeURIComponent(urlParams.get('topic'));
        const sectionName = urlParams.get('section'); // Get section for back button

        quizTitleEl.textContent = `Quiz: ${topicTitle}`;
        backBtn.href = `subject_detail_teacher.html?subject=${encodeURIComponent(subjectName)}&section=${encodeURIComponent(sectionName || '')}`;

        const allSubjects = loadSubjects();
        const subject = allSubjects.find(s => s.name === subjectName);
        
        let topic = null;
        if (subject) {
            // A quiz can be part of a main topic or a recommendation
            const allContent = [...(subject.topics || []), ...(subject.recommendations || [])];
            topic = allContent.find(t => t.title === topicTitle);
        }

        if (topic && topic.quiz) {
            currentQuizQuestions = topic.quiz;
            renderQuiz(currentQuizQuestions);
        } else {
            quizContainer.innerHTML = '<div class="alert alert-warning text-center">Could not find the quiz data for this topic.</div>';
            submitQuizBtn.style.display = 'none';
        }

        submitQuizBtn.addEventListener('click', (e) => {
            const form = document.getElementById('quizForm');
            if (form.checkValidity()) {
                e.preventDefault();
                handleSubmitQuiz();
            } else {
                form.reportValidity();
            }
        });

        retakeQuizBtn.addEventListener('click', () => {
            resultsModal.hide();
            renderQuiz(currentQuizQuestions); // Re-render to reset selections
        });
    }

    init();
});