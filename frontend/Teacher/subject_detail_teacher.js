document.addEventListener('DOMContentLoaded', () => {
    const SUBJECTS_STORAGE_KEY = 'mentorae-subjects-data';
    const TOPIC_REQUESTS_STORAGE_KEY = 'mentorae-topic-requests';

    // In a real app, this would come from a user profile API call.
    const teacherAssignedClasses = [
        { subjectName: "Physics 1", section: "SIGMA TECHNOCRATS", students: 38 },
        { subjectName: "Finite Mathematics 1", section: "ENGINEERING", students: 42 },
        { subjectName: "Creative Writing", section: "CRIMINOLOGY 1", students: 28 },
        { subjectName: "General Mathematics", section: "All Sections", students: 180 }
    ];

    function loadSubjects() {
        const storedSubjects = localStorage.getItem(SUBJECTS_STORAGE_KEY);
        if (!storedSubjects) {
            console.warn("Subject data not found in localStorage. Please visit the admin page to initialize data.");
            return [];
        }
        return JSON.parse(storedSubjects);
    }

    function saveSubjects(subjectsToSave) {
        localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(subjectsToSave));
    }

    function readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    // DOM Elements
    const topicsList = document.getElementById('topicsList');
    const recommendationsList = document.getElementById('recommendationsList');
    const btnAddItem = document.getElementById('btnAddItem');
    const addTopicModal = new bootstrap.Modal(document.getElementById('addTopicModal'));
    const addTopicForm = document.getElementById('addTopicForm');
    
    const itemDestination = document.getElementById('itemDestination');
    const destinationContainer = document.getElementById('destinationContainer');
    const topicCommentContainer = document.getElementById('topicCommentContainer');
    const topicVisibilityContainer = document.getElementById('topicVisibilityContainer');
    const saveItemBtn = document.getElementById('saveItemBtn');

    // State Variables
    let decodedSubjectName;
    let allSubjects = [];
    let currentSubject = null;
    let currentSectionContext = null;
    let teacherSectionsForSubject = [];
    let newTopicRequestContent = { files: [], quiz: [], flashcards: [] };

    // --- Rendering Functions ---
    function renderTopics(topics) {
        if (btnAddItem) btnAddItem.remove();
        topicsList.innerHTML = ''; 

        const topicsToDisplay = (topics || []).filter(topic => {
            const isPublic = !topic.visibleTo || topic.visibleTo.length === 0;
            if (currentSectionContext) {
                return isPublic || topic.visibleTo.includes(currentSectionContext);
            }
            return isPublic;
        });

        if (topicsToDisplay.length > 0) {
            topicsToDisplay.forEach((topic) => {
                const originalIndex = (currentSubject.topics || []).findIndex(t => t === topic);
                const topicCard = document.createElement('div');
                topicCard.className = 'card topic-item-card border p-3 shadow-sm rounded-4 bg-white mb-3';
                topicCard.style.borderColor = '#a3b899';

                const resourceButtons = (topic.resources || []).map(res => {
                    let page = '';
                    let count = '';
                    if (res === 'File') {
                        page = 'file_viewer_teacher.html';
                        if (topic.files && topic.files.length > 0) count = ` (${topic.files.length})`;
                    } else if (res === 'Practice Quiz') {
                        page = 'practice_quiz_teacher.html';
                        if (topic.quiz && topic.quiz.length > 0) count = ` (${topic.quiz.length})`;
                    } else if (res === 'Flashcards') {
                        page = 'flashcards_teacher.html';
                        if (topic.flashcards && topic.flashcards.length > 0) count = ` (${topic.flashcards.length})`;
                    }
                    return `<a href="${page}?subject=${encodeURIComponent(decodedSubjectName)}&topic=${encodeURIComponent(topic.title)}&section=${encodeURIComponent(currentSectionContext || '')}" class="btn btn-sm btn-resource px-4 py-1.5 fw-bold text-white text-decoration-none rounded-pill">${res}${count}</a>`;
                }).join('');

                let studyButtons = '';
                if ((topic.flashcards || []).length > 0) {
                    studyButtons += `<a href="flashcards_viewer.html?subject=${encodeURIComponent(decodedSubjectName)}&topic=${encodeURIComponent(topic.title)}&section=${encodeURIComponent(currentSectionContext || '')}" class="btn btn-sm btn-study-action px-3 py-1.5 fw-bold text-white text-decoration-none rounded-pill"><i class="bi bi-stack me-1"></i> View Cards</a>`;
                }
                if ((topic.quiz || []).length > 0) {
                    studyButtons += `<a href="quiz_taker.html?subject=${encodeURIComponent(decodedSubjectName)}&topic=${encodeURIComponent(topic.title)}&section=${encodeURIComponent(currentSectionContext || '')}" class="btn btn-sm btn-study-action px-3 py-1.5 fw-bold text-white text-decoration-none rounded-pill"><i class="bi bi-question-circle me-1"></i> Take Quiz</a>`;
                }

                topicCard.innerHTML = `
                    <div class="d-flex align-items-start gap-3">
                        <div class="topic-icon-box bg-primary-subtle text-primary rounded-3 flex-shrink-0 p-2">
                            <i class="bi bi-file-earmark-text-fill fs-4"></i>
                        </div>
                        <div class="flex-grow-1">
                            <div class="d-flex justify-content-between align-items-start">
                                <div>
                                    <h3 class="fw-bold fs-6 text-dark m-0">${topic.title}</h3>
                                    <p class="micro-text text-secondary m-0 mt-1">${topic.description}</p>
                                    ${topic.createdAt ? `
                                        <p class="micro-text text-muted m-0 mt-2"><i class="bi bi-clock-history me-1"></i>Created on ${new Date(topic.createdAt).toLocaleDateString()} ${topic.createdBy ? `by ${topic.createdBy}` : ''}</p>
                                    ` : ''}
                                </div>
                                ${topic.createdBy === 'teacher' || !topic.createdBy ? `
                                <div class="dropdown">
                                    <button class="btn btn-link text-secondary p-0" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                                        <i class="bi bi-three-dots-vertical fs-5"></i>
                                    </button>
                                    <ul class="dropdown-menu dropdown-menu-end">
                                        <li><button class="dropdown-item edit-topic-btn" type="button" data-topic-index="${originalIndex}">Edit</button></li>
                                        <li><button class="dropdown-item delete-topic-btn" type="button" data-topic-index="${originalIndex}">Delete</button></li>
                                    </ul>
                                </div>
                                ` : ''}
                            </div>
                            <div class="d-flex flex-wrap gap-2 mt-3">
                                ${resourceButtons}
                            </div>
                            ${studyButtons ? `
                            <hr class="my-3">
                            <div class="d-flex flex-wrap gap-2">
                                ${studyButtons}
                            </div>
                            ` : ''}
                        </div>
                    </div>
                `;
                topicsList.appendChild(topicCard);
            });
        }
        
        if (btnAddItem) {
            topicsList.appendChild(btnAddItem);
        }
    }

    function renderRecommendations(recommendations) {
        recommendationsList.innerHTML = '';
        if (!recommendations || recommendations.length === 0) {
            recommendationsList.innerHTML = '<p class="text-muted text-center small">No recommendations have been added for this subject yet.</p>';
            return;
        }
        recommendations.forEach(rec => {
            let studyButtons = '';
            if ((rec.flashcards || []).length > 0) {
                studyButtons += `<a href="flashcards_viewer.html?subject=${encodeURIComponent(decodedSubjectName)}&topic=${encodeURIComponent(rec.title)}&source=recommendation&section=${encodeURIComponent(currentSectionContext || '')}" class="btn btn-sm btn-study-action px-3 py-1.5 fw-bold text-white text-decoration-none rounded-pill"><i class="bi bi-stack me-1"></i> View Cards</a>`;
            }
            if ((rec.quiz || []).length > 0) {
                studyButtons += `<a href="quiz_taker.html?subject=${encodeURIComponent(decodedSubjectName)}&topic=${encodeURIComponent(rec.title)}&source=recommendation&section=${encodeURIComponent(currentSectionContext || '')}" class="btn btn-sm btn-study-action px-3 py-1.5 fw-bold text-white text-decoration-none rounded-pill"><i class="bi bi-question-circle me-1"></i> Take Quiz</a>`;
            }

            const recCard = document.createElement('div');
            recCard.className = 'card topic-item-card border-0 shadow-sm overflow-hidden';
            recCard.innerHTML = `
                <div class="classroom-banner ${rec.color} p-3 text-white d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1 me-3">
                        <h3 class="fw-bold m-0 fs-5 text-white">${rec.title}</h3>
                    </div>
                    <div class="dropdown">
                        <button class="btn btn-link text-white p-0" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-three-dots-vertical fs-5"></i></button>
                        <ul class="dropdown-menu dropdown-menu-end">
                            <li><button class="dropdown-item edit-rec-btn" type="button" data-rec-index="${recommendations.indexOf(rec)}">Edit</button></li>
                            <li><button class="dropdown-item delete-rec-btn" type="button" data-rec-index="${recommendations.indexOf(rec)}">Delete</button></li>
                        </ul>
                    </div>
                </div>
                <div class="card-body p-3 bg-white d-flex flex-column">
                    <p class="small text-secondary m-0 card-desc-text flex-grow-1">${rec.description}</p>
                    ${studyButtons ? `
                    <div class="d-flex flex-wrap gap-2 mt-3">
                        ${studyButtons}
                    </div>
                    ` : ''}
                    <div class="mt-3 border-top pt-2">
                        <p class="micro-text text-muted fst-italic m-0">Comment: ${rec.comment}</p>
                        ${rec.createdAt ? `<p class="micro-text text-muted m-0 mt-1"><i class="bi bi-clock-history me-1"></i>Created on ${new Date(rec.createdAt).toLocaleDateString()}</p>` : ''}
                    </div>
                </div>
            `;
            recommendationsList.appendChild(recCard);
        });
    }

    function populateVisibilityOptions(topicBeingEdited = null) {
        const container = document.getElementById('topicVisibilityContainer');
        if (!container) return;

        if (teacherSectionsForSubject.length <= 1) {
            container.innerHTML = '';
            container.classList.add('d-none');
            return;
        }

        container.classList.remove('d-none');
        const existingVisibility = topicBeingEdited ? topicBeingEdited.visibleTo || [] : [];

        const checkboxesHtml = teacherSectionsForSubject.map(section => `
            <div class="form-check">
                <input class="form-check-input" type="checkbox" value="${section}" id="section-vis-${section.replace(/\s+/g, '-')}" ${existingVisibility.includes(section) ? 'checked' : ''}>
                <label class="form-check-label" for="section-vis-${section.replace(/\s+/g, '-')}">
                    ${section}
                </label>
            </div>
        `).join('');

        container.innerHTML = `
            <hr>
            <p class="fw-bold mb-2">Topic Visibility</p>
            <p class="micro-text text-muted mb-2">Select sections that can see this topic. If none are selected, it will be visible to all.</p>
            ${checkboxesHtml}
        `;
    }

    function setSubjectDetails() {
        const urlParams = new URLSearchParams(window.location.search);
        const subjectName = urlParams.get('subject');
        const sectionName = urlParams.get('section');
        const fromPage = urlParams.get('from');

        decodedSubjectName = subjectName ? decodeURIComponent(subjectName) : "Subject";
        currentSectionContext = sectionName ? decodeURIComponent(sectionName) : null;
        
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            if (fromPage === 'analytics') {
                backBtn.href = 'analytics_teacher.html';
            } else {
                backBtn.href = 'learning_resources_teacher.html';
            }
        }

        let pageTitle = `Mentorae - ${decodedSubjectName} Topics`;
        if (currentSectionContext) {
            pageTitle += ` (${currentSectionContext})`;
        }
        document.title = pageTitle;

        document.querySelector('.navbar-brand').textContent = decodedSubjectName;
        let sectionTitle = `Topics under ${decodedSubjectName}`;
        if (currentSectionContext) {
            sectionTitle += ` for ${currentSectionContext}`;
        }
        document.querySelector('h2.h5').textContent = sectionTitle;

        allSubjects = loadSubjects();
        currentSubject = allSubjects.find(s => s.name === decodedSubjectName);
        if (currentSubject) {
            teacherSectionsForSubject = teacherAssignedClasses
                .filter(c => c.subjectName === decodedSubjectName)
                .map(c => c.section);

            renderTopics(currentSubject.topics);
            renderRecommendations(currentSubject.recommendations);
            if (btnAddItem) btnAddItem.classList.remove('d-none');
        } else {
            const errorMessage = `
                <div class="alert alert-danger text-center" role="alert">
                    <h4 class="alert-heading">Subject Not Found!</h4>
                    <p>The data for "<strong>${decodedSubjectName}</strong>" could not be found. It may have been deleted or the link is incorrect.</p>
                    <hr>
                    <p class="mb-0">Please return to the Learning Resources page and select a valid subject.</p>
                </div>
            `;
            topicsList.innerHTML = errorMessage;
            recommendationsList.innerHTML = '';
            if (btnAddItem) btnAddItem.classList.add('d-none');
        }
    }

    function updateDateTime() {
        const liveDateElement = document.getElementById('liveDate');
        const liveTimeElement = document.getElementById('liveTime');
        if (!liveDateElement || !liveTimeElement) return;

        const now = new Date();
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        liveDateElement.textContent = now.toLocaleDateString('en-US', dateOptions);
        const timeOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true };
        liveTimeElement.textContent = now.toLocaleTimeString('en-US', timeOptions);
    }

    // --- Event Handlers ---
    topicsList.addEventListener('click', (e) => {
        const target = e.target;

        if (target.closest('#btnAddItem')) {
            addTopicForm.reset();
            document.getElementById('topicId').value = '';
            document.getElementById('recommendationId').value = '';
            document.getElementById('addTopicModalLabel').textContent = 'Add Content';
            saveItemBtn.textContent = 'Submit';
            
            destinationContainer.classList.remove('d-none');
            itemDestination.value = 'recommendation';
            
            itemDestination.dispatchEvent(new Event('change'));

            newTopicRequestContent = { files: [], quiz: [], flashcards: [] };
            addTopicModal.show();
        }

        if (target.classList.contains('edit-topic-btn')) {
            const topicIndex = target.dataset.topicIndex;
            const topic = currentSubject.topics[topicIndex];
            if (topic) {
                addTopicForm.reset();
                document.getElementById('addTopicModalLabel').textContent = 'Edit Topic';
                saveItemBtn.textContent = 'Save Topic';
                document.getElementById('recommendationId').value = '';
                document.getElementById('topicId').value = topicIndex;
                document.getElementById('topicTitle').value = topic.title;
                document.getElementById('topicDescription').value = topic.description;

                document.getElementById('resourceFile').checked = (topic.resources || []).includes('File');
                document.getElementById('resourceQuiz').checked = (topic.resources || []).includes('Practice Quiz');
                document.getElementById('resourceFlashcards').checked = (topic.resources || []).includes('Flashcards');

                destinationContainer.classList.add('d-none');
                topicCommentContainer.classList.add('d-none');
                topicCommentContainer.querySelector('input').required = false;

                populateVisibilityOptions(topic);
                topicVisibilityContainer.classList.remove('d-none');

                document.querySelectorAll('.resource-checkbox').forEach(checkbox => {
                    const managerId = checkbox.dataset.contentManager;
                    const managerEl = document.getElementById(managerId);
                    if (managerEl) {
                        managerEl.classList.toggle('d-none', !checkbox.checked);
                    }
                });

                newTopicRequestContent = {
                    files: [...(topic.files || [])],
                    quiz: [...(topic.quiz || [])],
                    flashcards: [...(topic.flashcards || [])]
                };
                addTopicModal.show();
            }
        }

        if (target.classList.contains('delete-topic-btn')) {
            const topicIndex = target.dataset.topicIndex;
            if (confirm('Are you sure you want to delete this topic?')) {
                currentSubject.topics.splice(topicIndex, 1);
                saveSubjects(allSubjects);
                renderTopics(currentSubject.topics);
            }
        }
    });

    recommendationsList.addEventListener('click', (e) => {
        const target = e.target;
        const recIndex = target.dataset.recIndex;

        if (target.classList.contains('delete-rec-btn')) {
            if (confirm('Are you sure you want to delete this recommendation?')) {
                currentSubject.recommendations.splice(recIndex, 1);
                saveSubjects(allSubjects);
                renderRecommendations(currentSubject.recommendations);
            }
        }

        if (target.classList.contains('edit-rec-btn')) {
            const recommendation = currentSubject.recommendations[recIndex];
            if (recommendation) {
                addTopicForm.reset();
                document.getElementById('addTopicModalLabel').textContent = 'Edit Recommendation';
                saveItemBtn.textContent = 'Save Recommendation';
                
                document.getElementById('topicId').value = '';
                document.getElementById('recommendationId').value = recIndex;

                document.getElementById('topicTitle').value = recommendation.title;
                document.getElementById('topicDescription').value = recommendation.description;
                document.getElementById('topicComment').value = recommendation.comment || '';

                document.getElementById('resourceFile').checked = (recommendation.resources || []).includes('File');
                document.getElementById('resourceQuiz').checked = (recommendation.resources || []).includes('Practice Quiz');
                document.getElementById('resourceFlashcards').checked = (recommendation.resources || []).includes('Flashcards');

                destinationContainer.classList.add('d-none');
                topicCommentContainer.classList.remove('d-none');
                topicCommentContainer.querySelector('input').required = true;
                topicVisibilityContainer.classList.add('d-none');
                newTopicRequestContent = {
                    files: [...(recommendation.files || [])],
                    quiz: [...(recommendation.quiz || [])],
                    flashcards: [...(recommendation.flashcards || [])]
                };
                addTopicModal.show();
            }
        }
    });

    itemDestination.addEventListener('change', () => {
        if (itemDestination.value === 'recommendation') {
            topicCommentContainer.classList.remove('d-none');
            topicCommentContainer.querySelector('input').required = true;
            topicVisibilityContainer.classList.add('d-none');
        } else { // 'request'
            topicCommentContainer.classList.add('d-none');
            topicCommentContainer.querySelector('input').required = false;
            topicVisibilityContainer.classList.remove('d-none');
            populateVisibilityOptions();
        }
        // Always update content manager visibility based on the current checkbox states
        document.querySelectorAll('.resource-checkbox').forEach(checkbox => {
            const managerId = checkbox.dataset.contentManager;
            const managerEl = document.getElementById(managerId);
            if (managerEl) {
                managerEl.classList.toggle('d-none', !checkbox.checked);
            }
        });
    });

    addTopicForm.addEventListener('change', e => {
        // This should run for any resource checkbox change within the form
        if (e.target.classList.contains('resource-checkbox')) {
            const managerId = e.target.dataset.contentManager;
            const managerEl = document.getElementById(managerId);
            if (managerEl) {
                managerEl.classList.toggle('d-none', !e.target.checked);
            }
        }
    });

    addTopicForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!currentSubject) {
            alert("Error: Cannot save because the subject data is not loaded.");
            return;
        }

        const topicIndex = document.getElementById('topicId').value;
        const recIndex = document.getElementById('recommendationId').value;
        const selectedResources = [];
        if (document.getElementById('resourceFile').checked) selectedResources.push('File');
        if (document.getElementById('resourceQuiz').checked) selectedResources.push('Practice Quiz');
        if (document.getElementById('resourceFlashcards').checked) selectedResources.push('Flashcards');

        const isEditingTopic = topicIndex !== '';
        const isEditingRec = recIndex !== '';
        const isCreatingNew = !isEditingTopic && !isEditingRec;
        const destination = itemDestination.value;

        // Content validation is required when editing or creating any item (topic or recommendation).
        const needsContentValidation = isEditingTopic || isEditingRec || isCreatingNew;

        if (needsContentValidation) {
            if (selectedResources.includes('File') && newTopicRequestContent.files.length === 0) {
                return alert('Please upload a file for the "File" resource before submitting.');
            }
            if (selectedResources.includes('Practice Quiz') && newTopicRequestContent.quiz.length === 0) {
                return alert('Please add at least one question for the "Practice Quiz" resource before submitting.');
            }
            if (selectedResources.includes('Flashcards') && newTopicRequestContent.flashcards.length === 0) {
                return alert('Please add at least one card for the "Flashcards" resource before submitting.');
            }
        }

        if (isEditingTopic) {
            const visibilityContainer = document.getElementById('topicVisibilityContainer');
            let selectedSections = Array.from(visibilityContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);

            const updatedTopicData = {
                title: document.getElementById('topicTitle').value,
                description: document.getElementById('topicDescription').value,
                resources: selectedResources,
                visibleTo: selectedSections
            };

            const oldTopic = currentSubject.topics[topicIndex];
            currentSubject.topics[topicIndex] = {
                ...oldTopic,
                ...updatedTopicData,
                files: newTopicRequestContent.files,
                quiz: newTopicRequestContent.quiz,
                flashcards: newTopicRequestContent.flashcards
            };
            saveSubjects(allSubjects);
            renderTopics(currentSubject.topics);
        } else if (isEditingRec) {
            const updatedRecData = {
                title: document.getElementById('topicTitle').value,
                description: document.getElementById('topicDescription').value,
                comment: document.getElementById('topicComment').value,
                resources: selectedResources
            };
            currentSubject.recommendations[recIndex] = {
                ...currentSubject.recommendations[recIndex],
                ...updatedRecData,
                files: newTopicRequestContent.files,
                quiz: newTopicRequestContent.quiz,
                flashcards: newTopicRequestContent.flashcards
            };
            saveSubjects(allSubjects);
            renderRecommendations(currentSubject.recommendations);
        } else {
            if (destination === 'recommendation') {
                const newRecommendationData = {
                    title: document.getElementById('topicTitle').value,
                    description: document.getElementById('topicDescription').value,
                    comment: document.getElementById('topicComment').value,
                    resources: selectedResources,
                    color: 'bg-card-purple',
                    createdAt: new Date().toISOString()
                };
                if (!currentSubject.recommendations) currentSubject.recommendations = [];
                currentSubject.recommendations.push(newRecommendationData);
                saveSubjects(allSubjects);
                renderRecommendations(currentSubject.recommendations);
                alert('Your recommendation has been saved successfully.');
            } else {
                const visibilityContainer = document.getElementById('topicVisibilityContainer');
                let selectedSections = Array.from(visibilityContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
                const newTopicRequest = {
                    subjectName: decodedSubjectName,
                    requester: "Maria Santos",
                    status: "pending",
                    requestedAt: new Date().toISOString(),
                    topicData: {
                        title: document.getElementById('topicTitle').value,
                        description: document.getElementById('topicDescription').value,
                        resources: selectedResources,
                        visibleTo: selectedSections,
                        files: newTopicRequestContent.files,
                        quiz: newTopicRequestContent.quiz,
                        flashcards: newTopicRequestContent.flashcards,
                        createdAt: new Date().toISOString(),
                        createdBy: 'teacher' // Mark as teacher-created
                    }
                };
                const allRequests = JSON.parse(localStorage.getItem(TOPIC_REQUESTS_STORAGE_KEY) || '[]');
                allRequests.unshift(newTopicRequest);
                localStorage.setItem(TOPIC_REQUESTS_STORAGE_KEY, JSON.stringify(allRequests));
                alert('Your request to add a new main topic has been sent to the administrator for review.');
            }
        }
        addTopicModal.hide();
    });

    // --- Content Management Modals ---
    const requestContentFileModal = new bootstrap.Modal(document.getElementById('requestContentFileModal'));
    const requestContentQuizModal = new bootstrap.Modal(document.getElementById('requestContentQuizModal'));
    const requestContentFlashcardModal = new bootstrap.Modal(document.getElementById('requestContentFlashcardModal'));

    addTopicForm.addEventListener('click', e => {
        if (e.target.classList.contains('manage-request-content-btn')) {
            const type = e.target.dataset.type;
            if (type === 'file') {
                renderRequestFiles();
                requestContentFileModal.show();
            } else if (type === 'quiz') {
                renderRequestQuiz();
                requestContentQuizModal.show();
            } else if (type === 'flashcards') {
                renderRequestFlashcards();
                requestContentFlashcardModal.show();
            }
        }
    });

    function renderRequestFiles() {
        const container = document.getElementById('requestFilesContainer');
        container.innerHTML = (newTopicRequestContent.files.length === 0)
            ? '<p class="text-muted text-center">No files added yet.</p>'
            : `<div class="list-group">${newTopicRequestContent.files.map((file, index) => `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <span><i class="bi bi-file-earmark-text me-2"></i>${file.name}</span>
                    <button type="button" class="btn btn-sm btn-outline-danger delete-request-file" data-index="${index}"><i class="bi bi-trash"></i></button>
                </div>`).join('')}</div>`;
    }

    document.getElementById('requestFileUploadForm').addEventListener('submit', async e => {
        e.preventDefault();
        const fileInput = document.getElementById('requestFileInput');
        if (fileInput.files.length === 0) return;
        const file = fileInput.files[0];
        try {
            const dataUrl = await readFileAsDataURL(file);
            newTopicRequestContent.files.push({ name: file.name, size: file.size, dataUrl });
            renderRequestFiles();
            fileInput.value = '';
        } catch (error) {
            alert('Error reading file.');
        }
    });

    document.getElementById('requestFilesContainer').addEventListener('click', e => {
        if (e.target.closest('.delete-request-file')) {
            const index = e.target.closest('.delete-request-file').dataset.index;
            newTopicRequestContent.files.splice(index, 1);
            renderRequestFiles();
        }
    });

    function renderRequestQuiz() {
        const container = document.getElementById('requestQuizContainer');
        container.innerHTML = (newTopicRequestContent.quiz.length === 0)
            ? '<p class="text-muted text-center">No questions added yet.</p>'
            : `<div class="list-group">${newTopicRequestContent.quiz.map((q, index) => `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <span>${index + 1}. ${q.text}</span>
                    <button type="button" class="btn btn-sm btn-outline-danger delete-request-quiz" data-index="${index}"><i class="bi bi-trash"></i></button>
                </div>`).join('')}</div>`;
    }

    document.getElementById('requestQuizForm').addEventListener('submit', e => {
        e.preventDefault();
        newTopicRequestContent.quiz.push({
            text: document.getElementById('requestQuizQuestionText').value,
            options: {
                A: document.getElementById('requestQuizOptionA').value,
                B: document.getElementById('requestQuizOptionB').value,
                C: document.getElementById('requestQuizOptionC').value,
                D: document.getElementById('requestQuizOptionD').value,
            },
            answer: document.getElementById('requestQuizCorrectAnswer').value
        });
        renderRequestQuiz();
        e.target.reset();
    });

    document.getElementById('requestQuizContainer').addEventListener('click', e => {
        if (e.target.closest('.delete-request-quiz')) {
            const index = e.target.closest('.delete-request-quiz').dataset.index;
            newTopicRequestContent.quiz.splice(index, 1);
            renderRequestQuiz();
        }
    });

    function renderRequestFlashcards() {
        const container = document.getElementById('requestFlashcardsContainer');
        container.innerHTML = (newTopicRequestContent.flashcards.length === 0)
            ? '<p class="text-muted text-center">No cards added yet.</p>'
            : `<div class="list-group">${newTopicRequestContent.flashcards.map((card, index) => `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="mb-0">${card.term}</h6>
                        <small class="text-muted">${card.definition}</small>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-danger delete-request-flashcard" data-index="${index}"><i class="bi bi-trash"></i></button>
                </div>`).join('')}</div>`;
    }

    document.getElementById('requestFlashcardForm').addEventListener('submit', e => {
        e.preventDefault();
        newTopicRequestContent.flashcards.push({
            term: document.getElementById('requestFlashcardTerm').value,
            definition: document.getElementById('requestFlashcardDefinition').value,
        });
        renderRequestFlashcards();
        e.target.reset();
    });

    document.getElementById('requestFlashcardsContainer').addEventListener('click', e => {
        if (e.target.closest('.delete-request-flashcard')) {
            const index = e.target.closest('.delete-request-flashcard').dataset.index;
            newTopicRequestContent.flashcards.splice(index, 1);
            renderRequestFlashcards();
        }
    });

    // --- Initial Page Load ---
    setSubjectDetails();
    updateDateTime();
    setInterval(updateDateTime, 1000);
});