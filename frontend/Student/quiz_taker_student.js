document.addEventListener('DOMContentLoaded', () => {
    const SUBJECTS_STORAGE_KEY = 'mentorae-subjects-data';

    // DOM Elements
    const quizContainer = document.getElementById('quizContainer');
    const quizResults = document.getElementById('quizResults');
    const questionText = document.getElementById('questionText');
    const optionA = document.getElementById('optionA');
    const optionB = document.getElementById('optionB');
    const optionC = document.getElementById('optionC');
    const optionD = document.getElementById('optionD');
    const labelA = document.getElementById('labelA');
    const labelB = document.getElementById('labelB');
    const labelC = document.getElementById('labelC');
    const labelD = document.getElementById('labelD');
    const feedback = document.getElementById('feedback');
    const currentQuestionIndexDisplay = document.getElementById('currentQuestionIndex');
    const totalQuestionsDisplay = document.getElementById('totalQuestions');
    const prevQuestionBtn = document.getElementById('prevQuestionBtn');
    const nextQuestionBtn = document.getElementById('nextQuestionBtn');
    const submitAnswerBtn = document.getElementById('submitAnswerBtn');
    const retakeQuizBtn = document.getElementById('retakeQuizBtn');
    const finalScoreDisplay = document.getElementById('finalScore');
    const maxScoreDisplay = document.getElementById('maxScore');
    const correctAnswersCountDisplay = document.getElementById('correctAnswersCount');
    const quizProgress = document.getElementById('quizProgress');
    const reviewContainer = document.getElementById('reviewContainer');

    // Display Elements
    const backBtn = document.getElementById('backBtn');
    const pageSubtitle = document.getElementById('pageSubtitle');
    const quizSetTitle = document.getElementById('quizSetTitle');
    const subjectNameDisplay = document.getElementById('subjectNameDisplay');
    const topicTitleDisplay = document.getElementById('topicTitleDisplay');
    const topicDescriptionDisplay = document.getElementById('topicDescriptionDisplay');

    // State
    let allSubjects = [];
    let currentSubject = null;
    let currentTopic = null;
    let questions = [];
    let userAnswers = [];
    let score = 0;
    let currentIndex = 0;

    function loadData() {
        const storedSubjects = localStorage.getItem(SUBJECTS_STORAGE_KEY);
        allSubjects = storedSubjects ? JSON.parse(storedSubjects) : [];

        const urlParams = new URLSearchParams(window.location.search);
        const subjectName = decodeURIComponent(urlParams.get('subject') || '');
        const topicName = decodeURIComponent(urlParams.get('topic') || '');
        const source = urlParams.get('source');
        const sectionName = urlParams.get('section'); // Get section for back button

        currentSubject = allSubjects.find(s => s.name === subjectName);
        if (currentSubject) {
            if (source === 'recommendation') {
                currentTopic = (currentSubject.recommendations || []).find(t => t.title === topicName);
            } else {
                currentTopic = (currentSubject.topics || []).find(t => t.title === topicName);
            }

            if (currentTopic) {
                questions = currentTopic.quiz || [];
                userAnswers = new Array(questions.length).fill(null);
            }
        }

        // Set back button URL
        if (backBtn) {
            backBtn.href = `subject_detail_student.html?subject=${encodeURIComponent(subjectName)}&section=${encodeURIComponent(sectionName || '')}`;
        }

        // Update UI with details
        document.title = `Mentorae - Quiz: ${currentTopic?.title || 'Not Found'}`;
        if (pageSubtitle) pageSubtitle.textContent = `Topic: ${currentTopic?.title || 'N/A'}`;
        if (quizSetTitle) quizSetTitle.textContent = `Practice Quiz for ${currentTopic?.title || 'N/A'}`;
        if (subjectNameDisplay) subjectNameDisplay.textContent = currentSubject?.name || 'N/A';
        if (topicTitleDisplay) topicTitleDisplay.textContent = currentTopic?.title || 'N/A';
        if (topicDescriptionDisplay) topicDescriptionDisplay.textContent = currentTopic?.description || 'N/A';
    }

    function displayQuestion(index) {
        if (questions.length === 0) {
            quizContainer.innerHTML = '<p class="text-center text-muted">No questions available for this quiz.</p>';
            return;
        }

        const q = questions[index];
        questionText.textContent = `${index + 1}. ${q.text}`;
        labelA.textContent = q.options.A;
        labelB.textContent = q.options.B;

        const optionCContainer = document.getElementById('optionCContainer');
        const optionDContainer = document.getElementById('optionDContainer');

        if (q.options.C && q.options.C.trim() !== '') {
            labelC.textContent = q.options.C;
            if(optionCContainer) optionCContainer.style.display = 'block';
        } else {
            if(optionCContainer) optionCContainer.style.display = 'none';
        }
        if (q.options.D && q.options.D.trim() !== '') {
            labelD.textContent = q.options.D;
            if(optionDContainer) optionDContainer.style.display = 'block';
        } else {
            if(optionDContainer) optionDContainer.style.display = 'none';
        }

        // Reset state
        feedback.textContent = '';
        feedback.className = 'mt-3 fw-bold';
        document.querySelectorAll('input[name="quizOption"]').forEach(radio => {
            radio.checked = false;
            radio.disabled = false;
        });

        // Reset label styles
        document.querySelectorAll('.quiz-option-label').forEach(label => {
            label.classList.remove('correct-answer', 'wrong-answer');
        });
        
        if (userAnswers[index]) {
            document.querySelector(`input[value="${userAnswers[index]}"]`).checked = true;
        }

        submitAnswerBtn.classList.remove('d-none');
        nextQuestionBtn.classList.add('d-none');
        currentQuestionIndexDisplay.textContent = index + 1;
        totalQuestionsDisplay.textContent = questions.length;
        prevQuestionBtn.disabled = index === 0;
        nextQuestionBtn.disabled = index === questions.length - 1 && !nextQuestionBtn.classList.contains('d-none');

        const answeredCount = userAnswers.filter(a => a !== null).length;
        const progressPercentage = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;
        quizProgress.style.width = `${progressPercentage}%`;
        quizProgress.setAttribute('aria-valuenow', progressPercentage);
    }

    function handleSubmit() {
        const selectedOption = document.querySelector('input[name="quizOption"]:checked');
        if (!selectedOption) {
            feedback.textContent = 'Please select an answer.';
            feedback.className = 'mt-3 fw-bold incorrect';
            return;
        }

        userAnswers[currentIndex] = selectedOption.value;

        const answeredCount = userAnswers.filter(a => a !== null).length;
        const progressPercentage = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;
        quizProgress.style.width = `${progressPercentage}%`;
        quizProgress.setAttribute('aria-valuenow', progressPercentage);

        document.querySelectorAll('input[name="quizOption"]').forEach(radio => {
            const label = radio.nextElementSibling;
            if (radio.value === questions[currentIndex].answer) {
                label.classList.add('correct-answer');
            } else if (radio.checked) {
                label.classList.add('wrong-answer');
            }
            radio.disabled = true;
        });

        feedback.textContent = '';

        submitAnswerBtn.classList.add('d-none');
        nextQuestionBtn.classList.remove('d-none');

        if (currentIndex === questions.length - 1) {
            nextQuestionBtn.textContent = 'Finish Quiz';
        }
    }

    function showResults() {
        score = 0;
        for (let i = 0; i < questions.length; i++) {
            if (userAnswers[i] === questions[i].answer) {
                score++;
            }
        }
        quizContainer.classList.add('d-none');
        quizResults.classList.remove('d-none');
        finalScoreDisplay.textContent = score;
        maxScoreDisplay.textContent = questions.length;
        correctAnswersCountDisplay.textContent = score;

        if (reviewContainer) {
            reviewContainer.innerHTML = '';
            questions.forEach((q, index) => {
                const userAnswer = userAnswers[index];
                const isCorrect = userAnswer === q.answer;
                const icon = isCorrect ? '<i class="bi bi-check-circle-fill text-success"></i>' : '<i class="bi bi-x-circle-fill text-danger"></i>';

                const reviewItem = document.createElement('div');
                reviewItem.className = `review-item p-3 mb-2 rounded ${isCorrect ? 'bg-success-subtle' : 'bg-danger-subtle'}`;
                reviewItem.innerHTML = `
                    <p class="fw-bold mb-2">${index + 1}. ${q.text} ${icon}</p>
                    <p class="small m-0">Your answer: <span class="fw-bold ${isCorrect ? 'text-success' : 'text-danger'}">${userAnswer ? q.options[userAnswer] : 'Not answered'}</span></p>
                    ${!isCorrect ? `<p class="small m-0">Correct answer: <span class="fw-bold text-success">${q.options[q.answer]}</span></p>` : ''}
                `;
                reviewContainer.appendChild(reviewItem);
            });
        }
    }

    function init() {
        loadData();
        displayQuestion(currentIndex);

        submitAnswerBtn.addEventListener('click', handleSubmit);

        nextQuestionBtn.addEventListener('click', () => {
            if (currentIndex < questions.length - 1) {
                currentIndex++;
                displayQuestion(currentIndex);
            } else {
                showResults();
            }
        });

        prevQuestionBtn.addEventListener('click', () => {
            if (currentIndex > 0) {
                currentIndex--;
                displayQuestion(currentIndex);
            }
        });

        retakeQuizBtn.addEventListener('click', () => {
            currentIndex = 0;
            score = 0;
            userAnswers.fill(null);
            quizResults.classList.add('d-none');
            quizContainer.classList.remove('d-none');
            nextQuestionBtn.textContent = 'Next';
            displayQuestion(currentIndex);
            if (quizProgress) {
                quizProgress.style.width = `0%`;
                quizProgress.setAttribute('aria-valuenow', 0);
            }
        });

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
    }

    init();
});