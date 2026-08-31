document.addEventListener('DOMContentLoaded', () => {
    const SUBJECTS_STORAGE_KEY = 'mentorae-subjects-data';

    // Mock Student Profile (for filtering topics by section)
    // In a real app, this would come from a user profile API call.
    const studentProfile = {
        gradeLevel: 11,
        section: "SIGMA TECHNOCRATS" // Or "All Sections" if enrolled in a common subject
    };

    function loadSubjects() {
        const storedSubjects = localStorage.getItem(SUBJECTS_STORAGE_KEY);
        if (!storedSubjects) {
            console.warn("Subject data not found in localStorage. Please visit the admin page to initialize data.");
            return [];
        }
        return JSON.parse(storedSubjects);
    }

    // DOM Elements
    const topicsList = document.getElementById('topicsList');
    const recommendationsList = document.getElementById('recommendationsList');
    
    // Display Elements
    const subjectNameDisplay = document.getElementById('subjectNameDisplay');
    const subjectCodeDisplay = document.getElementById('subjectCodeDisplay');
    const subjectDescriptionDisplay = document.getElementById('subjectDescriptionDisplay');
    const subjectCategoryDisplay = document.getElementById('subjectCategoryDisplay');
    const subjectGradeDisplay = document.getElementById('subjectGradeDisplay');
    const subjectQuarterDisplay = document.getElementById('subjectQuarterDisplay');
    const subjectStrandSectionDisplay = document.getElementById('subjectStrandSectionDisplay');
    const pageTitle = document.getElementById('pageTitle');
    const pageSubtitle = document.getElementById('pageSubtitle');
    const subjectTopicsTitle = document.getElementById('subjectTopicsTitle');

    // State Variables
    let decodedSubjectName;
    let decodedSectionName;
    let allSubjects = [];
    let currentSubject = null;

    // --- Rendering Functions ---
    let currentTopicsData = [];
    let currentRecsData = [];

    const viewFilesModalEl = document.getElementById('viewFilesModal');
    let viewFilesModalInstance = null;
    if (viewFilesModalEl && typeof bootstrap !== 'undefined') {
        viewFilesModalInstance = new bootstrap.Modal(viewFilesModalEl);
    }

    function openFilesModal(title, files) {
        const modalTitle = document.getElementById('modalTopicTitle');
        const modalFilesList = document.getElementById('modalFilesList');
        if (modalTitle) modalTitle.textContent = title;
        if (modalFilesList) {
            modalFilesList.innerHTML = '';
            if (!files || files.length === 0) {
                modalFilesList.innerHTML = '<li class="list-group-item text-muted text-center py-3">No files available for this topic.</li>';
            } else {
                files.forEach((file) => {
                    const li = document.createElement('li');
                    li.className = 'list-group-item d-flex justify-content-between align-items-center py-2.5 px-3';
                    
                    let href = '#';
                    let downloadAttr = '';
                    if (file.dataUrl) {
                        href = file.dataUrl;
                        downloadAttr = `download="${file.name || 'document'}"`;
                    }

                    li.innerHTML = `
                        <div class="d-flex align-items-center gap-2 text-truncate me-2">
                            <i class="bi bi-file-earmark-text-fill text-primary fs-5"></i>
                            <div>
                                <span class="fw-semibold text-dark d-block text-truncate small">${file.name || 'Attached File'}</span>
                                ${file.size ? `<span class="micro-text text-muted">${(file.size / 1024).toFixed(1)} KB</span>` : ''}
                            </div>
                        </div>
                        <a href="${href}" ${downloadAttr} target="_blank" class="btn btn-sm btn-outline-success fw-semibold rounded-pill px-3 py-1 text-nowrap">
                            <i class="bi bi-download me-1"></i> Open / Download
                        </a>
                    `;
                    modalFilesList.appendChild(li);
                });
            }
        }
        if (viewFilesModalInstance) viewFilesModalInstance.show();
    }

    function renderTopics(topics) {
        topicsList.innerHTML = ''; 

        const topicsToDisplay = (topics || []).filter(topic => {
            const isPublic = !topic.visibleTo || topic.visibleTo.length === 0;
            return isPublic || (topic.visibleTo && topic.visibleTo.includes(decodedSectionName));
        });

        currentTopicsData = topicsToDisplay;

        if (topicsToDisplay.length === 0) {
            topicsList.innerHTML = '<p class="text-muted text-center p-3">No topics available for this subject yet.</p>';
            return;
        }

        topicsToDisplay.forEach((topic, index) => {
            const topicCard = document.createElement('div');
            topicCard.className = 'card topic-item-card border p-3 shadow-sm rounded-4 bg-white mb-3';
            topicCard.style.borderColor = '#a3b899';

            // Only generate action buttons for materials that ACTUALLY exist
            let actionButtons = [];

            if (topic.flashcards && topic.flashcards.length > 0) {
                actionButtons.push(`
                    <a href="flashcard_viewer_student.html?subject=${encodeURIComponent(decodedSubjectName)}&topic=${encodeURIComponent(topic.title)}&section=${encodeURIComponent(decodedSectionName)}" class="btn btn-sm btn-outline-success fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-nowrap">
                        <i class="bi bi-stack"></i> Study Flashcards (${topic.flashcards.length})
                    </a>
                `);
            }

            if (topic.quiz && topic.quiz.length > 0) {
                actionButtons.push(`
                    <a href="quiz_taker_student.html?subject=${encodeURIComponent(decodedSubjectName)}&topic=${encodeURIComponent(topic.title)}&section=${encodeURIComponent(decodedSectionName)}" class="btn btn-sm btn-success fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-white text-nowrap">
                        <i class="bi bi-question-circle"></i> Take Practice Quiz (${topic.quiz.length} Qs)
                    </a>
                `);
            }

            if (topic.files && topic.files.length > 0) {
                actionButtons.push(`
                    <button type="button" class="btn btn-sm btn-outline-primary fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-nowrap btn-open-topic-files" data-topic-index="${index}">
                        <i class="bi bi-file-earmark-arrow-down"></i> View Files (${topic.files.length})
                    </button>
                `);
            }

            const actionsHtml = actionButtons.length > 0
                ? `<div class="d-flex flex-wrap align-items-center gap-2 mt-3">${actionButtons.join('')}</div>`
                : `<div class="mt-3"><span class="badge bg-light text-muted border fw-normal micro-text px-2.5 py-1 rounded-pill"><i class="bi bi-info-circle me-1"></i> No study materials attached yet</span></div>`;

            topicCard.innerHTML = `
                <div class="d-flex align-items-start gap-3">
                    <div class="topic-icon-box bg-success-subtle text-success rounded-3 flex-shrink-0 p-2">
                        <i class="bi bi-journal-text fs-4"></i>
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
                        </div>
                        ${actionsHtml}
                    </div>
                </div>
            `;
            topicsList.appendChild(topicCard);
        });

        // Wire topic file button clicks
        topicsList.querySelectorAll('.btn-open-topic-files').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.getAttribute('data-topic-index'), 10);
                const t = currentTopicsData[idx];
                if (t) {
                    openFilesModal(t.title, t.files);
                }
            });
        });
    }

    function renderRecommendations(recommendations) {
        recommendationsList.innerHTML = '';
        currentRecsData = recommendations || [];

        if (!recommendations || recommendations.length === 0) {
            recommendationsList.innerHTML = '<p class="text-muted text-center small">No recommendations for this subject yet.</p>';
            return;
        }

        recommendations.forEach((rec, index) => {
            let actionButtons = [];

            if (rec.flashcards && rec.flashcards.length > 0) {
                actionButtons.push(`
                    <a href="flashcard_viewer_student.html?subject=${encodeURIComponent(decodedSubjectName)}&topic=${encodeURIComponent(rec.title)}&source=recommendation&section=${encodeURIComponent(decodedSectionName)}" class="btn btn-sm btn-outline-success fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-nowrap">
                        <i class="bi bi-stack"></i> Study Flashcards (${rec.flashcards.length})
                    </a>
                `);
            }

            if (rec.quiz && rec.quiz.length > 0) {
                actionButtons.push(`
                    <a href="quiz_taker_student.html?subject=${encodeURIComponent(decodedSubjectName)}&topic=${encodeURIComponent(rec.title)}&source=recommendation&section=${encodeURIComponent(decodedSectionName)}" class="btn btn-sm btn-success fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-white text-nowrap">
                        <i class="bi bi-question-circle"></i> Take Practice Quiz (${rec.quiz.length} Qs)
                    </a>
                `);
            }

            if (rec.files && rec.files.length > 0) {
                actionButtons.push(`
                    <button type="button" class="btn btn-sm btn-outline-primary fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-nowrap btn-open-rec-files" data-rec-index="${index}">
                        <i class="bi bi-file-earmark-arrow-down"></i> View Files (${rec.files.length})
                    </button>
                `);
            }

            const actionsHtml = actionButtons.length > 0
                ? `<div class="d-flex flex-wrap align-items-center gap-2 mt-3">${actionButtons.join('')}</div>`
                : `<div class="mt-3"><span class="badge bg-light text-muted border fw-normal micro-text px-2.5 py-1 rounded-pill"><i class="bi bi-info-circle me-1"></i> No study materials attached yet</span></div>`;

            const recCard = document.createElement('div');
            recCard.className = 'card topic-item-card border-0 shadow-sm overflow-hidden mb-3 rounded-4';
            recCard.innerHTML = `
                <div class="classroom-banner ${rec.color || 'bg-card-green'} p-3 text-white d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1 me-3">
                        <h3 class="fw-bold m-0 fs-5 text-white">${rec.title}</h3>
                    </div>
                </div>
                <div class="card-body p-3 bg-white d-flex flex-column">
                    <p class="small text-secondary m-0 card-desc-text flex-grow-1">${rec.description}</p>
                    ${actionsHtml}
                    <div class="mt-3 border-top pt-2">
                        ${rec.comment ? `<p class="micro-text text-muted fst-italic m-0">Teacher Comment: ${rec.comment}</p>` : ''}
                        ${rec.createdAt ? `<p class="micro-text text-muted m-0 mt-1"><i class="bi bi-clock-history me-1"></i>Created on ${new Date(rec.createdAt).toLocaleDateString()}</p>` : ''}
                    </div>
                </div>
            `;
            recommendationsList.appendChild(recCard);
        });

        // Wire recommendation file button clicks
        recommendationsList.querySelectorAll('.btn-open-rec-files').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.getAttribute('data-rec-index'), 10);
                const r = currentRecsData[idx];
                if (r) {
                    openFilesModal(r.title, r.files);
                }
            });
        });
    }

    function setSubjectDetails() {
        const urlParams = new URLSearchParams(window.location.search);
        const subjectName = urlParams.get('subject');
        const sectionName = urlParams.get('section'); // Get section from URL

        decodedSubjectName = subjectName ? decodeURIComponent(subjectName) : "Subject";
        decodedSectionName = sectionName ? decodeURIComponent(sectionName) : studentProfile.section; // Use studentProfile.section as fallback

        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            // Always go back to the student learning resources page
            backBtn.href = 'learning_resources_student.html';
        }

        // Update header
        if (pageTitle) pageTitle.textContent = decodedSubjectName;
        if (pageSubtitle) pageSubtitle.textContent = `Section: ${decodedSectionName}`;
        if (subjectTopicsTitle) subjectTopicsTitle.textContent = `Topics for ${decodedSubjectName}`;
        document.title = `Mentorae - ${decodedSubjectName} Details`;

        allSubjects = loadSubjects();
        currentSubject = allSubjects.find(s => s.name === decodedSubjectName);

        if (currentSubject) {
            // Display subject details
            if (subjectNameDisplay) subjectNameDisplay.textContent = currentSubject.name;
            if (subjectCodeDisplay) subjectCodeDisplay.textContent = currentSubject.code;
            if (subjectDescriptionDisplay) subjectDescriptionDisplay.textContent = currentSubject.description;
            if (subjectCategoryDisplay) subjectCategoryDisplay.textContent = currentSubject.category;
            if (subjectGradeDisplay) subjectGradeDisplay.textContent = currentSubject.gradeLevel;
            if (subjectQuarterDisplay) subjectQuarterDisplay.textContent = currentSubject.quarter;
            if (subjectStrandSectionDisplay) subjectStrandSectionDisplay.textContent = currentSubject.strandSection;

            renderTopics(currentSubject.topics);
            renderRecommendations(currentSubject.recommendations);
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

    // --- Initial Page Load ---
    setSubjectDetails();
    updateDateTime();
    setInterval(updateDateTime, 1000);
});