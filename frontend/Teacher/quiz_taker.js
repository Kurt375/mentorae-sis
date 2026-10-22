document.addEventListener('DOMContentLoaded', () => {
    const SUBJECTS_STORAGE_KEY = 'mentorae-subjects-data';

    // DOM Elements
    const quizContainer = document.getElementById('quizContainer');
    const quizResults = document.getElementById('quizResults');
    const questionText = document.getElementById('questionText');
    const optionAInput = document.getElementById('optionA'); // Renamed to avoid conflict with container
    const optionBInput = document.getElementById('optionB'); // Renamed
    const optionCInput = document.getElementById('optionC'); // Renamed
    const optionDInput = document.getElementById('optionD'); // Renamed
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

    // NEW: Option containers for hiding/showing
    const optionAContainer = document.getElementById('optionAContainer');
    const optionBContainer = document.getElementById('optionBContainer');
    const optionCContainer = document.getElementById('optionCContainer');
    const optionDContainer = document.getElementById('optionDContainer');
    // Display Elements
    const subjectNameDisplay = document.getElementById('subjectNameDisplay');
    const topicTitleDisplay = document.getElementById('topicTitleDisplay');
    const topicDescriptionDisplay = document.getElementById('topicDescriptionDisplay');
    const pageSubtitle = document.getElementById('pageSubtitle');
    const quizSetTitle = document.getElementById('quizSetTitle');
    const percentageDisplay = document.getElementById('percentageDisplay');
    const teacherBestBadge = document.getElementById('teacherBestBadge');
    const teacherPastAttemptsTableBody = document.getElementById('teacherPastAttemptsTableBody');

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

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function resolveAnswerKey(rawAnswer, normalizedOptions) {
        if (rawAnswer === undefined || rawAnswer === null) return 'A';
        const rawStr = String(rawAnswer).trim();
        if (!rawStr) return 'A';

        // 1. Direct match with option text (case-insensitive)
        for (const [key, text] of Object.entries(normalizedOptions)) {
            if (text && text.toLowerCase() === rawStr.toLowerCase()) {
                return key;
            }
        }

        // 2. Direct match with option letter: A, B, C, D
        const upper = rawStr.toUpperCase();
        if (['A', 'B', 'C', 'D'].includes(upper)) {
            return upper;
        }

        // 3. Formatted like Option A, Choice B, (C), A., A: ...
        const prefixMatch = upper.match(/^(?:OPTION|CHOICE)?\s*[\(\[]?([A-D])[\)\]\.:]?/i);
        if (prefixMatch && prefixMatch[1]) {
            return prefixMatch[1].toUpperCase();
        }

        // 4. Zero-based or 1-based index
        if (/^[0-3]$/.test(rawStr)) {
            return ['A', 'B', 'C', 'D'][parseInt(rawStr, 10)] || 'A';
        }
        if (/^[1-4]$/.test(rawStr)) {
            return ['A', 'B', 'C', 'D'][parseInt(rawStr, 10) - 1] || 'A';
        }

        // 5. Partial text match
        for (const [key, text] of Object.entries(normalizedOptions)) {
            if (text && (text.toLowerCase().includes(rawStr.toLowerCase()) || rawStr.toLowerCase().includes(text.toLowerCase()))) {
                return key;
            }
        }

        return 'A';
    }

    async function loadData() {
        const storedSubjects = localStorage.getItem(SUBJECTS_STORAGE_KEY);
        allSubjects = storedSubjects ? JSON.parse(storedSubjects) : [];

        const urlParams = new URLSearchParams(window.location.search);
        const subjectName = decodeURIComponent(urlParams.get('subject') || '').trim();
        const topicName = decodeURIComponent(urlParams.get('topic') || '').trim();
        const source = urlParams.get('source');
        const sectionName = urlParams.get('section');

        currentSubjectName = subjectName;
        currentTopicName = topicName;
        currentSectionName = sectionName || '';

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
                console.error('Failed to load topic from database:', e);
            }
        }

        if (currentTopic) {
            questions = (currentTopic.quiz || []).map(q => {
                            let opts = q.options;
                            if (Array.isArray(opts)) {
                                opts = {
                                    A: (opts[0] != null ? String(opts[0]) : '').trim(),
                                    B: (opts[1] != null ? String(opts[1]) : '').trim(),
                                    C: (opts[2] != null ? String(opts[2]) : '').trim(),
                                    D: (opts[3] != null ? String(opts[3]) : '').trim()
                                };
                            } else if (opts && typeof opts === 'object') {
                                opts = {
                                    A: (opts.A != null ? String(opts.A) : (opts.a != null ? String(opts.a) : '')).trim(),
                                    B: (opts.B != null ? String(opts.B) : (opts.b != null ? String(opts.b) : '')).trim(),
                                    C: (opts.C != null ? String(opts.C) : (opts.c != null ? String(opts.c) : '')).trim(),
                                    D: (opts.D != null ? String(opts.D) : (opts.d != null ? String(opts.d) : '')).trim()
                                };
                            } else {
                                opts = { A: '', B: '', C: '', D: '' };
                            }
                            const resolvedAnswer = resolveAnswerKey(q.answer, opts);
                            return {
                                text: (q.text || q.question || '').trim(),
                                options: opts,
                                answer: resolvedAnswer,
                                rawAnswer: q.answer
                            };
                        }).filter(q => q.text !== '');

            userAnswers = new Array(questions.length).fill(null);
        } else {
            questions = [];
            userAnswers = [];
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
        loadTeacherAttempts(currentTopic?.title || currentTopicName, currentSubject?.name || currentSubjectName);
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

        if (q.options.C && q.options.C.trim() !== '') {
            if (labelC) labelC.textContent = q.options.C;
            if (optionCContainer) optionCContainer.style.display = 'block';
        } else {
            if (optionCContainer) optionCContainer.style.display = 'none';
        }
        if (q.options.D && q.options.D.trim() !== '') {
            if (labelD) labelD.textContent = q.options.D;
            if (optionDContainer) optionDContainer.style.display = 'block';
        } else {
            if (optionDContainer) optionDContainer.style.display = 'none';
        }

        // Reset label styles and remove any previous status badges
        document.querySelectorAll('.quiz-option-label').forEach(label => {
            label.classList.remove('selected', 'correct-answer', 'wrong-answer');
            label.style.removeProperty('border-color');
            label.style.removeProperty('background-color');
            label.style.removeProperty('color');
            label.style.removeProperty('box-shadow');
            label.style.removeProperty('opacity');
            const oldBadge = label.querySelector('.quiz-status-badge');
            if (oldBadge) oldBadge.remove();
        });

        const isAnswered = userAnswers[index] !== null && userAnswers[index] !== undefined;

        if (isAnswered) {
            // Restore evaluated state with clear red/green indicators
            const selectedKey = userAnswers[index];
            const correctKey = q.answer;
            const isCorrect = selectedKey === correctKey;

            document.querySelectorAll('input[name="quizOption"]').forEach(radio => {
                radio.disabled = true;
                const label = radio.nextElementSibling;
                if (radio.value === selectedKey) {
                    radio.checked = true;
                } else {
                    radio.checked = false;
                }

                if (label) {
                    if (radio.value === correctKey) {
                        label.classList.add('correct-answer');
                        label.style.setProperty('border-color', '#198754', 'important');
                        label.style.setProperty('background-color', '#dcfce7', 'important');
                        label.style.setProperty('color', '#166534', 'important');
                        label.style.setProperty('box-shadow', '0 0 0 3px rgba(25, 135, 84, 0.25)', 'important');
                        label.insertAdjacentHTML('beforeend', '<span class="quiz-status-badge badge bg-success ms-auto rounded-pill px-2.5 py-1 text-white fw-semibold small d-inline-flex align-items-center gap-1 flex-shrink-0"><i class="bi bi-check-circle-fill"></i> Correct Answer</span>');
                    } else if (radio.value === selectedKey) {
                        label.classList.add('wrong-answer');
                        label.style.setProperty('border-color', '#dc3545', 'important');
                        label.style.setProperty('background-color', '#fee2e2', 'important');
                        label.style.setProperty('color', '#991b1b', 'important');
                        label.style.setProperty('box-shadow', '0 0 0 3px rgba(220, 53, 69, 0.25)', 'important');
                        label.insertAdjacentHTML('beforeend', '<span class="quiz-status-badge badge bg-danger ms-auto rounded-pill px-2.5 py-1 text-white fw-semibold small d-inline-flex align-items-center gap-1 flex-shrink-0"><i class="bi bi-x-circle-fill"></i> Your Answer (Wrong)</span>');
                    } else {
                        label.style.setProperty('opacity', '0.55', 'important');
                    }
                }
            });

            if (feedback) {
                const correctText = q.options[correctKey] || q.rawAnswer || correctKey;
                feedback.innerHTML = isCorrect
                    ? `<div class="alert alert-success d-flex align-items-center gap-2 py-2.5 px-3 rounded-3 mb-0 border-0 shadow-sm" style="background-color: #dcfce7; color: #166534;"><i class="bi bi-check-circle-fill fs-5 text-success"></i><div><strong class="d-block">Correct!</strong><span class="small">Great job, your answer is correct.</span></div></div>`
                    : `<div class="alert alert-danger d-flex align-items-center gap-2 py-2.5 px-3 rounded-3 mb-0 border-0 shadow-sm" style="background-color: #fee2e2; color: #991b1b;"><i class="bi bi-x-circle-fill fs-5 text-danger"></i><div><strong class="d-block">Incorrect!</strong><span class="small">The correct answer is Option ${correctKey}: <strong>${escapeHtml(correctText)}</strong>.</span></div></div>`;
            }

            submitAnswerBtn.classList.add('d-none');
            nextQuestionBtn.classList.remove('d-none');
            if (index === questions.length - 1) {
                nextQuestionBtn.textContent = 'Finish Quiz';
            } else {
                nextQuestionBtn.innerHTML = 'Next <i class="bi bi-arrow-right ms-1"></i>';
            }
        } else {
            feedback.innerHTML = '';
            document.querySelectorAll('input[name="quizOption"]').forEach(radio => {
                radio.checked = false;
                radio.disabled = false;
            });

            submitAnswerBtn.classList.remove('d-none');
            nextQuestionBtn.classList.add('d-none');
        }

        currentQuestionIndexDisplay.textContent = index + 1;
        totalQuestionsDisplay.textContent = questions.length;
        prevQuestionBtn.disabled = index === 0;
        nextQuestionBtn.disabled = index === questions.length - 1 && !nextQuestionBtn.classList.contains('d-none') && !isAnswered;

        // Update progress bar
        if (quizProgress) {
            const answeredCount = userAnswers.filter(a => a !== null).length;
            const progressPercentage = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;
            quizProgress.style.width = `${progressPercentage}%`;
            quizProgress.setAttribute('aria-valuenow', progressPercentage);
        }
    }

    function handleSubmit() {
        const selectedOption = document.querySelector('input[name="quizOption"]:checked');
        if (!selectedOption) {
            feedback.innerHTML = '<div class="alert alert-warning py-2 px-3 rounded-3 mb-0 small fw-semibold"><i class="bi bi-exclamation-triangle-fill me-1"></i> Please select an answer before submitting.</div>';
            return;
        }

        const selectedKey = selectedOption.value;
        userAnswers[currentIndex] = selectedKey;
        const q = questions[currentIndex];
        const correctKey = q.answer;
        const isCorrect = selectedKey === correctKey;

        // Visual feedback on options
        document.querySelectorAll('input[name="quizOption"]').forEach(radio => {
            const label = radio.nextElementSibling;
            if (label) {
                label.classList.remove('selected');
                const oldBadge = label.querySelector('.quiz-status-badge');
                if (oldBadge) oldBadge.remove();

                if (radio.value === correctKey) {
                    label.classList.add('correct-answer');
                    label.style.setProperty('border-color', '#198754', 'important');
                    label.style.setProperty('background-color', '#dcfce7', 'important');
                    label.style.setProperty('color', '#166534', 'important');
                    label.style.setProperty('box-shadow', '0 0 0 3px rgba(25, 135, 84, 0.25)', 'important');
                    label.insertAdjacentHTML('beforeend', '<span class="quiz-status-badge badge bg-success ms-auto rounded-pill px-2.5 py-1 text-white fw-semibold small d-inline-flex align-items-center gap-1 flex-shrink-0"><i class="bi bi-check-circle-fill"></i> Correct Answer</span>');
                } else if (radio.value === selectedKey) {
                    label.classList.add('wrong-answer');
                    label.style.setProperty('border-color', '#dc3545', 'important');
                    label.style.setProperty('background-color', '#fee2e2', 'important');
                    label.style.setProperty('color', '#991b1b', 'important');
                    label.style.setProperty('box-shadow', '0 0 0 3px rgba(220, 53, 69, 0.25)', 'important');
                    label.insertAdjacentHTML('beforeend', '<span class="quiz-status-badge badge bg-danger ms-auto rounded-pill px-2.5 py-1 text-white fw-semibold small d-inline-flex align-items-center gap-1 flex-shrink-0"><i class="bi bi-x-circle-fill"></i> Your Answer (Wrong)</span>');
                } else {
                    label.style.setProperty('opacity', '0.55', 'important');
                }
            }
            radio.disabled = true;
        });

        if (feedback) {
            const correctText = q.options[correctKey] || q.rawAnswer || correctKey;
            feedback.innerHTML = isCorrect
                ? `<div class="alert alert-success d-flex align-items-center gap-2 py-2.5 px-3 rounded-3 mb-0 border-0 shadow-sm" style="background-color: #dcfce7; color: #166534;"><i class="bi bi-check-circle-fill fs-5 text-success"></i><div><strong class="d-block">Correct!</strong><span class="small">Great job, your answer is correct.</span></div></div>`
                : `<div class="alert alert-danger d-flex align-items-center gap-2 py-2.5 px-3 rounded-3 mb-0 border-0 shadow-sm" style="background-color: #fee2e2; color: #991b1b;"><i class="bi bi-x-circle-fill fs-5 text-danger"></i><div><strong class="d-block">Incorrect!</strong><span class="small">The correct answer is Option ${correctKey}: <strong>${escapeHtml(correctText)}</strong>.</span></div></div>`;
        }

        // Update progress bar after answering
        if (quizProgress) {
            const answeredCount = userAnswers.filter(a => a !== null).length;
            const progressPercentage = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;
            quizProgress.style.width = `${progressPercentage}%`;
            quizProgress.setAttribute('aria-valuenow', progressPercentage);
        }

        submitAnswerBtn.classList.add('d-none');
        nextQuestionBtn.classList.remove('d-none');

        if (currentIndex === questions.length - 1) {
            nextQuestionBtn.textContent = 'Finish Quiz';
        } else {
            nextQuestionBtn.innerHTML = 'Next <i class="bi bi-arrow-right ms-1"></i>';
        }
    }

    async function loadTeacherAttempts(topicTitle, subjectName) {
        if (!teacherPastAttemptsTableBody) return;
        const token = localStorage.getItem('mentorae_token');
        if (!token) return;

        try {
            const query = `/api/content/topic-quiz/my-attempts?topicTitle=${encodeURIComponent(topicTitle || '')}&subjectName=${encodeURIComponent(subjectName || '')}`;
            const data = await authedFetch(query, token);
            if (data && data.success && Array.isArray(data.attempts)) {
                renderTeacherAttempts(data.attempts);
            }
        } catch (err) {
            console.warn('Could not load teacher quiz test attempts:', err);
        }
    }

    function renderTeacherAttempts(attempts) {
        if (!teacherPastAttemptsTableBody) return;
        if (!attempts || attempts.length === 0) {
            teacherPastAttemptsTableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted py-3">No preview runs recorded yet. Complete this test to log your run.</td>
                </tr>
            `;
            if (teacherBestBadge) teacherBestBadge.textContent = 'Latest Test: --';
            return;
        }

        const latest = attempts[0];
        if (teacherBestBadge) {
            teacherBestBadge.textContent = `Latest Test: ${latest.score}/${latest.totalQuestions} (${Math.round(latest.percentage)}%)`;
        }

        const totalAttempts = attempts.length;
        teacherPastAttemptsTableBody.innerHTML = attempts.map((att, idx) => {
            const attemptNum = totalAttempts - idx;
            const dt = new Date(att.createdAt);
            const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

            return `
                <tr>
                    <td class="ps-3 fw-bold text-secondary">#${attemptNum}</td>
                    <td class="small text-muted">${dateStr} <span class="text-secondary opacity-75">(${timeStr})</span></td>
                    <td><span class="fw-bold text-dark">${att.score}</span> / <span class="text-muted">${att.totalQuestions}</span></td>
                    <td class="fw-semibold text-primary">${Math.round(att.percentage)}%</td>
                    <td><span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2.5 py-1 fw-semibold"><i class="bi bi-eye me-1"></i>Preview Run</span></td>
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

        // Populate review container
        if (reviewContainer) {
            reviewContainer.innerHTML = '';
            questions.forEach((q, index) => {
                            const userAnswer = userAnswers[index];
                            const isCorrect = userAnswer === q.answer;
                            const icon = isCorrect ? '<i class="bi bi-check-circle-fill text-success"></i>' : '<i class="bi bi-x-circle-fill text-danger"></i>';
                            const userAnswerText = (userAnswer && q.options[userAnswer]) ? q.options[userAnswer] : (userAnswer || 'Not answered');
                            const correctAnswerText = (q.answer && q.options[q.answer]) ? q.options[q.answer] : (q.rawAnswer || q.answer || 'N/A');
            
                            const reviewItem = document.createElement('div');
                            reviewItem.className = `review-item ${isCorrect ? 'correct' : 'incorrect'} shadow-sm`;
                            reviewItem.innerHTML = `
                                <div class="d-flex align-items-start justify-content-between gap-2 mb-2">
                                    <h6 class="fw-bold mb-0 text-dark">${index + 1}. ${escapeHtml(q.text)}</h6>
                                    <span class="flex-shrink-0">${icon}</span>
                                </div>
                                <div class="vstack gap-1 mt-2">
                                    <p class="small m-0">Your answer: <span class="fw-bold ${isCorrect ? 'text-success' : 'text-danger'}"><i class="bi ${isCorrect ? 'bi-check-lg' : 'bi-x-lg'} me-1"></i>${escapeHtml(userAnswerText)}</span></p>
                                    ${!isCorrect ? `<p class="small m-0">Correct answer: <span class="fw-bold text-success"><i class="bi bi-check-lg me-1"></i>${escapeHtml(correctAnswerText)}</span></p>` : ''}
                                </div>
                            `;
                            reviewContainer.appendChild(reviewItem);
                        });
        }

        // Persist teacher preview attempt to database
        const token = localStorage.getItem('mentorae_token');
        if (token) {
            const answersPayload = questions.map((q, index) => {
                            const uKey = userAnswers[index];
                            const uText = (uKey && q.options[uKey]) ? q.options[uKey] : (uKey || 'Not answered');
                            const cKey = q.answer;
                            const cText = (cKey && q.options[cKey]) ? q.options[cKey] : (q.rawAnswer || q.answer || 'N/A');
                            return {
                                question: q.text,
                                userAnswer: uText,
                                userAnswerKey: uKey || null,
                                correctAnswer: cText,
                                correctAnswerKey: cKey,
                                isCorrect: uKey === cKey
                            };
                        });

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
                        isPreview: true
                    })
                });
                await loadTeacherAttempts(currentTopic?.title || currentTopicName, currentSubject?.name || currentSubjectName);
            } catch (err) {
                console.error('Failed to record teacher preview attempt:', err);
            }
        }
    }

    function init() {
        loadData();

        // Instant visual feedback when clicking an option
        document.querySelectorAll('input[name="quizOption"]').forEach(radio => {
            radio.addEventListener('change', () => {
                document.querySelectorAll('.quiz-option-label').forEach(lbl => {
                    lbl.classList.remove('selected');
                    lbl.style.removeProperty('border-color');
                    lbl.style.removeProperty('background-color');
                    lbl.style.removeProperty('color');
                    lbl.style.removeProperty('box-shadow');
                    lbl.style.removeProperty('opacity');
                });
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