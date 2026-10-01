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
    const percentageDisplay = document.getElementById('percentageDisplay');
    const headerBestBadge = document.getElementById('headerBestBadge');
    const headerBestScoreText = document.getElementById('headerBestScoreText');
    const studentBestScoreBadge = document.getElementById('studentBestScoreBadge');
    const pastAttemptsTableBody = document.getElementById('pastAttemptsTableBody');

    // State
    let allSubjects = [];
    let currentSubject = null;
    let currentTopic = null;
    let questions = [];
    let userAnswers = [];
    let score = 0;
    let currentIndex = 0;
    let currentSubjectName = '';
    let currentTopicName = '';
    let currentSectionName = '';

    async function loadData() {
        const storedSubjects = localStorage.getItem(SUBJECTS_STORAGE_KEY);
        allSubjects = storedSubjects ? JSON.parse(storedSubjects) : [];

        const urlParams = new URLSearchParams(window.location.search);
        const subjectName = decodeURIComponent(urlParams.get('subject') || '').trim();
        const topicName = decodeURIComponent(urlParams.get('topic') || '').trim();
        const source = urlParams.get('source');
        const sectionName = urlParams.get('section'); // Get section for back button

        currentSubjectName = subjectName;
        currentTopicName = topicName;
        currentSectionName = sectionName;

        currentSubject = allSubjects.find(s => s.name && s.name.trim().toLowerCase() === subjectName.toLowerCase());
        if (currentSubject) {
            const list = source === 'recommendation' ? (currentSubject.recommendations || []) : (currentSubject.topics || []);
            currentTopic = list.find(t => t.title && t.title.trim().toLowerCase() === topicName.toLowerCase());
        }

        // Always attempt live fetch if token is available OR if currentTopic has no questions
        const token = localStorage.getItem('mentorae_token');
        if (token && subjectName) {
            try {
                const data = await authedFetch(`/api/content/topics?subjectName=${encodeURIComponent(subjectName)}`, token);
                if (data && data.success) {
                    const list = source === 'recommendation' ? (data.recommendations || []) : (data.topics || []);
                    const matchedTopic = list.find(t => t.title && t.title.trim().toLowerCase() === topicName.toLowerCase()) ||
                                         (data.topics || []).find(t => t.title && t.title.trim().toLowerCase() === topicName.toLowerCase()) ||
                                         (data.recommendations || []).find(t => t.title && t.title.trim().toLowerCase() === topicName.toLowerCase());
                    if (matchedTopic) {
                        currentTopic = matchedTopic;
                        if (!currentSubject) {
                            currentSubject = { name: subjectName, topics: data.topics || [], recommendations: data.recommendations || [] };
                            allSubjects.push(currentSubject);
                        } else {
                            if (source === 'recommendation') {
                                currentSubject.recommendations = data.recommendations || [];
                            } else {
                                currentSubject.topics = data.topics || [];
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Failed to load quiz from DB:', e);
            }
        }

        if (currentTopic) {
            questions = (currentTopic.quiz || []).map(q => {
                let opts = q.options;
                if (Array.isArray(opts)) {
                    opts = {
                        A: opts[0] || '',
                        B: opts[1] || '',
                        C: opts[2] || '',
                        D: opts[3] || ''
                    };
                } else if (!opts || typeof opts !== 'object') {
                    opts = { A: '', B: '', C: '', D: '' };
                }
                return {
                    text: (q.text || q.question || '').trim(),
                    options: {
                        A: opts.A || '',
                        B: opts.B || '',
                        C: opts.C || '',
                        D: opts.D || ''
                    },
                    answer: q.answer || 'A'
                };
            }).filter(q => q.text !== '');

            userAnswers = new Array(questions.length).fill(null);
        } else {
            questions = [];
            userAnswers = [];
        }

        // Set back button URL
        if (backBtn) {
            backBtn.href = `subject_detail_student.html?subject=${encodeURIComponent(subjectName)}&section=${encodeURIComponent(sectionName || '')}`;
        }

        // Update UI with details
        document.title = `Mentorae - Quiz: ${currentTopic?.title || topicName || 'Not Found'}`;
        if (pageSubtitle) pageSubtitle.textContent = `Topic: ${currentTopic?.title || topicName || 'N/A'}`;
        if (quizSetTitle) quizSetTitle.textContent = `Practice Quiz for ${currentTopic?.title || topicName || 'N/A'}`;
        if (subjectNameDisplay) subjectNameDisplay.textContent = currentSubject?.name || subjectName || 'N/A';
        if (topicTitleDisplay) topicTitleDisplay.textContent = currentTopic?.title || topicName || 'N/A';
        if (topicDescriptionDisplay) {
            const desc = (currentTopic?.description || '').trim();
            topicDescriptionDisplay.textContent = desc && desc !== 'N/A' ? desc : 'No description provided for this topic.';
        }

        displayQuestion(currentIndex);
        loadPastAttempts(currentTopic?.title || currentTopicName, currentSubject?.name || currentSubjectName);
    }

    function displayQuestion(index) {
        if (questions.length === 0) {
            quizContainer.innerHTML = `
                <div class="card shadow-sm border-0 text-center p-5">
                    <div class="card-body">
                        <i class="bi bi-question-circle text-muted fs-1 mb-3 d-block"></i>
                        <h4 class="h5 fw-bold text-dark">No Questions Available</h4>
                        <p class="text-muted mb-4">There are no practice questions attached to this topic yet.</p>
                        <button class="btn btn-outline-secondary px-4 py-2 rounded-pill" onclick="window.history.back(); return false;">
                            <i class="bi bi-arrow-left me-1"></i> Go Back
                        </button>
                    </div>
                </div>
            `;
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
            label.classList.remove('selected', 'correct-answer', 'wrong-answer');
        });
        
        if (userAnswers[index]) {
            const answeredRadio = document.querySelector(`input[name="quizOption"][value="${userAnswers[index]}"]`);
            if (answeredRadio) {
                answeredRadio.checked = true;
                if (answeredRadio.nextElementSibling) {
                    answeredRadio.nextElementSibling.classList.add('selected');
                }
            }
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
            if (label) {
                label.classList.remove('selected');
                if (radio.value === questions[currentIndex].answer) {
                    label.classList.add('correct-answer');
                } else if (radio.checked) {
                    label.classList.add('wrong-answer');
                }
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

    async function loadPastAttempts(topicTitle, subjectName) {
        if (!pastAttemptsTableBody) return;
        const token = localStorage.getItem('mentorae_token');
        if (!token) return;

        try {
            const query = `/api/content/topic-quiz/my-attempts?topicTitle=${encodeURIComponent(topicTitle || '')}&subjectName=${encodeURIComponent(subjectName || '')}`;
            const data = await authedFetch(query, token);
            if (data && data.success && Array.isArray(data.attempts)) {
                renderPastAttempts(data.attempts);
            }
        } catch (err) {
            console.warn('Could not load past quiz attempts:', err);
        }
    }

    function renderPastAttempts(attempts) {
        if (!pastAttemptsTableBody) return;
        if (!attempts || attempts.length === 0) {
            pastAttemptsTableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted py-3">No previous attempts recorded yet. Complete the quiz to record your practice score!</td>
                </tr>
            `;
            if (studentBestScoreBadge) studentBestScoreBadge.textContent = 'Best: --';
            if (headerBestBadge) headerBestBadge.classList.add('d-none');
            return;
        }

        // Find best attempt
        let best = attempts[0];
        attempts.forEach(a => {
            if (a.percentage > best.percentage || (a.percentage === best.percentage && a.score > best.score)) {
                best = a;
            }
        });

        const bestText = `${best.score}/${best.totalQuestions} (${Math.round(best.percentage)}%)`;
        if (studentBestScoreBadge) studentBestScoreBadge.textContent = `Best: ${bestText}`;
        if (headerBestBadge && headerBestScoreText) {
            headerBestScoreText.textContent = bestText;
            headerBestBadge.classList.remove('d-none');
        }

        const totalAttempts = attempts.length;
        pastAttemptsTableBody.innerHTML = attempts.map((att, idx) => {
            const attemptNum = totalAttempts - idx;
            const dt = new Date(att.createdAt);
            const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

            let badgeHtml = '';
            if (att.percentage >= 80) {
                badgeHtml = '<span class="badge bg-success text-white rounded-pill px-2.5 py-1 fw-semibold"><i class="bi bi-star-fill me-1"></i>Mastered</span>';
            } else if (att.percentage >= 60) {
                badgeHtml = '<span class="badge bg-primary text-white rounded-pill px-2.5 py-1 fw-semibold"><i class="bi bi-check-circle me-1"></i>Passed</span>';
            } else {
                badgeHtml = '<span class="badge bg-warning text-dark rounded-pill px-2.5 py-1 fw-semibold"><i class="bi bi-arrow-repeat me-1"></i>Needs Practice</span>';
            }

            return `
                <tr>
                    <td class="ps-3 fw-bold text-secondary">#${attemptNum}</td>
                    <td class="small text-muted">${dateStr} <span class="text-secondary opacity-75">(${timeStr})</span></td>
                    <td><span class="fw-bold text-dark">${att.score}</span> / <span class="text-muted">${att.totalQuestions}</span></td>
                    <td class="fw-semibold ${att.percentage >= 60 ? 'text-success' : 'text-danger'}">${Math.round(att.percentage)}%</td>
                    <td>${badgeHtml}</td>
                </tr>
            `;
        }).join('');
    }

    async function showResults() {
        score = 0;
        for (let i = 0; i < questions.length; i++) {
            if (userAnswers[i] === questions[i].answer) {
                score++;
            }
        }
        const total = questions.length;
        const pct = total > 0 ? Math.round(((score / total) * 100) * 100) / 100 : 0;

        quizContainer.classList.add('d-none');
        quizResults.classList.remove('d-none');
        finalScoreDisplay.textContent = score;
        maxScoreDisplay.textContent = total;
        correctAnswersCountDisplay.textContent = score;
        if (percentageDisplay) {
            percentageDisplay.textContent = `${Math.round(pct)}%`;
        }

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

        // Persist attempt to database
        const token = localStorage.getItem('mentorae_token');
        if (token) {
            const answersPayload = questions.map((q, index) => ({
                question: q.text,
                userAnswer: userAnswers[index] ? q.options[userAnswers[index]] : 'Not answered',
                userAnswerKey: userAnswers[index] || null,
                correctAnswer: q.options[q.answer] || q.answer,
                correctAnswerKey: q.answer,
                isCorrect: userAnswers[index] === q.answer
            }));

            try {
                await authedFetch('/api/content/topic-quiz/attempt', token, {
                    method: 'POST',
                    body: JSON.stringify({
                        topicId: currentTopic?.id || null,
                        topicTitle: currentTopic?.title || currentTopicName,
                        subjectName: currentSubject?.name || currentSubjectName,
                        sectionName: currentSectionName || '',
                        score: score,
                        totalQuestions: total,
                        answers: answersPayload,
                        isPreview: false
                    })
                });
                await loadPastAttempts(currentTopic?.title || currentTopicName, currentSubject?.name || currentSubjectName);
            } catch (err) {
                console.error('Failed to record practice quiz attempt:', err);
            }
        }
    }

    function init() {
        loadData();

        // Instant visual feedback when clicking an option
        document.querySelectorAll('input[name="quizOption"]').forEach(radio => {
            radio.addEventListener('change', () => {
                document.querySelectorAll('.quiz-option-label').forEach(lbl => lbl.classList.remove('selected'));
                if (radio.checked) {
                    const lbl = radio.nextElementSibling;
                    if (lbl) lbl.classList.add('selected');
                }
            });
        });

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