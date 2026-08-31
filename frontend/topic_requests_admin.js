document.addEventListener('DOMContentLoaded', () => {
    const SUBJECTS_STORAGE_KEY = 'mentorae-subjects-data';
    const TOPIC_REQUESTS_STORAGE_KEY = 'mentorae-topic-requests';

    let subjects = [];
    let topicRequests = [];

    // --- Data Loading and Saving ---
    function loadData() {
        const storedSubjects = localStorage.getItem(SUBJECTS_STORAGE_KEY);
        subjects = storedSubjects ? JSON.parse(storedSubjects) : [];

        const storedRequests = localStorage.getItem(TOPIC_REQUESTS_STORAGE_KEY);
        topicRequests = storedRequests ? JSON.parse(storedRequests) : [];
    }

    function saveSubjects() {
        localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(subjects));
    }

    function saveTopicRequests() {
        localStorage.setItem(TOPIC_REQUESTS_STORAGE_KEY, JSON.stringify(topicRequests));
    }

    function dataURItoBlob(dataURI) {
        // convert base64 to raw binary data held in a string
        var byteString = atob(dataURI.split(',')[1]);
        // separate out the mime component
        var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
        // write the bytes of the string to an ArrayBuffer
        var ab = new ArrayBuffer(byteString.length);
        var ia = new Uint8Array(ab);
        for (var i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], {type: mimeString});
    }
    // --- UI Rendering ---
    function renderTopicRequests() {
        const container = document.getElementById('topicRequestsContainer');
        if (!container) return;

        container.innerHTML = '';
        const pendingRequests = topicRequests.filter(r => r.status === 'pending');

        if (pendingRequests.length === 0) {
            container.innerHTML = `
                <div class="card p-4 text-center border-dashed">
                    <i class="bi bi-check2-circle fs-1 text-success"></i>
                    <h5 class="mt-3">All Caught Up!</h5>
                    <p class="text-muted">There are no pending topic requests to review.</p>
                </div>`;
            return;
        }

        pendingRequests.forEach((request) => {
            const requestId = request.requestedAt;
            const topicData = request.topicData;
            const resourcesList = topicData.resources.map(r => `<span class="badge bg-secondary">${r}</span>`).join(' ');
            const visibility = topicData.visibleTo.length > 0 ? topicData.visibleTo.join(', ') : 'All Sections';

            const hasFiles = topicData.resources.includes('File');
            const hasQuiz = topicData.resources.includes('Practice Quiz');
            const hasFlashcards = topicData.resources.includes('Flashcards');

            let viewContentDropdown = '';
            if (hasFiles || hasQuiz || hasFlashcards) {
                viewContentDropdown = `
                    <div class="mt-3">
                        <div class="dropdown">
                            <button class="btn btn-sm btn-outline-primary dropdown-toggle" type="button" id="viewContentDropdown-${requestId}" data-bs-toggle="dropdown" aria-expanded="false">
                                <i class="bi bi-eye me-1"></i> Review Content
                            </button>
                            <ul class="dropdown-menu" aria-labelledby="viewContentDropdown-${requestId}">
                                ${hasFiles ? `<li><button class="dropdown-item" type="button" data-bs-toggle="modal" data-bs-target="#viewRequestFilesModal" data-request-id="${requestId}">View Files (${topicData.files.length})</button></li>` : ''}
                                ${hasQuiz ? `<li><button class="dropdown-item" type="button" data-bs-toggle="modal" data-bs-target="#viewRequestQuizModal" data-request-id="${requestId}">View Quiz (${topicData.quiz.length})</button></li>` : ''}
                                ${hasFlashcards ? `<li><button class="dropdown-item" type="button" data-bs-toggle="modal" data-bs-target="#viewRequestFlashcardsModal" data-request-id="${requestId}">View Flashcards (${topicData.flashcards.length})</button></li>` : ''}
                            </ul>
                        </div>
                    </div>
                `;
            }

            const requestCard = document.createElement('div');
            requestCard.className = 'card p-3 shadow-sm';
            requestCard.id = `request-${requestId}`; // Add ID for highlighting

            requestCard.innerHTML = `
                <div class="row g-3 align-items-center">
                    <div class="col-12 col-md-8">
                        <h6 class="fw-bold mb-1">${topicData.title} <span class="fw-normal text-muted small">for</span> ${request.subjectName}</h6>
                        <p class="text-muted small mb-2">${topicData.description}</p>
                        <div class="d-flex flex-wrap gap-3 small">
                            <div><strong>Resources:</strong> ${resourcesList}</div>
                            <div><strong>Visible to:</strong> ${visibility}</div>
                        </div>
                        ${viewContentDropdown}
                    </div>
                    <div class="col-12 col-md-4 d-flex flex-column justify-content-center align-items-md-end">
                         <small class="text-muted fst-italic mb-2">Requested by ${request.requester} on ${new Date(requestId).toLocaleDateString()}</small>
                        <div class="d-flex gap-2">
                            <button class="btn btn-sm btn-success approve-request-btn" data-id="${requestId}"><i class="bi bi-check-lg me-1"></i>Approve</button>
                            <button class="btn btn-sm btn-danger deny-request-btn" data-id="${requestId}"><i class="bi bi-x-lg me-1"></i>Deny</button>
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(requestCard);
        });
    }

    function renderRequestFiles(files, containerId) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        if (!files || files.length === 0) {
            container.innerHTML = '<p class="text-muted">No files attached to this request.</p>';
            return;
        }
        const list = document.createElement('div');
        list.className = 'list-group';
        files.forEach(file => {
            let fileUrl = '#';
            try {
                const blob = dataURItoBlob(file.dataUrl);
                fileUrl = URL.createObjectURL(blob);
            } catch (e) {
                console.error(`Failed to create Blob URL for ${file.name}:`, e);
            }
            const item = document.createElement('a');
            item.href = fileUrl;
            item.target = '_blank';
            item.rel = 'noopener noreferrer';
            item.className = 'list-group-item list-group-item-action';
            item.innerHTML = `<i class="bi bi-file-earmark-text me-2"></i> ${file.name} <small class="text-muted ms-2">(${(file.size / 1024).toFixed(2)} KB)</small>`;
            list.appendChild(item);
        });
        container.appendChild(list);
    }

    function renderRequestQuiz(quiz, containerId) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        if (!quiz || quiz.length === 0) {
            container.innerHTML = '<p class="text-muted">No quiz questions in this request.</p>';
            return;
        }
        const list = document.createElement('div');
        list.className = 'd-flex flex-column gap-3';
        quiz.forEach((q, index) => {
            const optionsHtml = Object.entries(q.options).map(([key, value]) => {
                if (!value) return '';
                const isCorrect = key === q.answer;
                return `<li class="list-group-item ${isCorrect ? 'list-group-item-success' : ''}">${key}. ${value}</li>`;
            }).join('');
            const item = document.createElement('div');
            item.className = 'card';
            item.innerHTML = `
                <div class="card-header fw-bold">Question ${index + 1}</div>
                <div class="card-body">
                    <p class="card-text">${q.text}</p>
                    <ul class="list-group">${optionsHtml}</ul>
                </div>`;
            list.appendChild(item);
        });
        container.appendChild(list);
    }

    function renderRequestFlashcards(flashcards, containerId) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        if (!flashcards || flashcards.length === 0) {
            container.innerHTML = '<p class="text-muted">No flashcards in this request.</p>';
            return;
        }
        const list = document.createElement('div');
        list.className = 'list-group';
        flashcards.forEach(card => {
            const item = document.createElement('div');
            item.className = 'list-group-item';
            item.innerHTML = `<h6 class="mb-1">${card.term}</h6><p class="mb-0 text-muted">${card.definition}</p>`;
            list.appendChild(item);
        });
        container.appendChild(list);
    }

    // --- Action Handlers ---
    function handleApproveRequest(requestId) {
        const requestIndex = topicRequests.findIndex(r => r.requestedAt === requestId);
        if (requestIndex === -1) return;

        const request = topicRequests[requestIndex];
        const subject = subjects.find(s => s.name === request.subjectName);
        if (!subject) {
            alert(`Error: Subject "${request.subjectName}" not found. Cannot approve request.`);
            return;
        }

        if (!subject.topics) subject.topics = [];
        subject.topics.push(request.topicData);
        saveSubjects();

        topicRequests.splice(requestIndex, 1);
        saveTopicRequests();

        alert(`Topic "${request.topicData.title}" has been approved and added to ${subject.name}.`);
        renderTopicRequests();
    }

    function handleDenyRequest(requestId) {
        const requestIndex = topicRequests.findIndex(r => r.requestedAt === requestId);
        if (requestIndex === -1) return;

        const request = topicRequests[requestIndex];
        if (confirm(`Are you sure you want to deny the request for "${request.topicData.title}"?`)) {
            topicRequests.splice(requestIndex, 1);
            saveTopicRequests();
            renderTopicRequests();
        }
    }

    function highlightRequestFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const highlightRequestId = urlParams.get('highlightRequest');

        if (highlightRequestId) {
            const requestCard = document.getElementById(`request-${highlightRequestId}`);
            if (requestCard) {
                requestCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                requestCard.classList.add('highlight-request');
                setTimeout(() => {
                    requestCard.classList.remove('highlight-request');
                }, 3000);
            }
            // Clean up URL
            history.replaceState(null, '', window.location.pathname);
        }
    }

    // --- Initial Setup ---
    function init() {
        // Live Clock
        const liveDateElement = document.getElementById('liveDate');
        const liveTimeElement = document.getElementById('liveTime');
        function updateDateTime() {
            if (!liveDateElement || !liveTimeElement) return;
            const now = new Date();
            liveDateElement.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            liveTimeElement.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
        }
        updateDateTime();
        setInterval(updateDateTime, 1000);

        // Load data and render
        loadData();
        renderTopicRequests();
        highlightRequestFromUrl();

        // Modal event listeners to populate content
        document.getElementById('viewRequestFilesModal').addEventListener('show.bs.modal', event => {
            const button = event.relatedTarget;
            const requestId = button.dataset.requestId;
            const request = topicRequests.find(r => r.requestedAt === requestId);
            if (request) renderRequestFiles(request.topicData.files, 'requestFilesContainer');
        });

        document.getElementById('viewRequestQuizModal').addEventListener('show.bs.modal', event => {
            const button = event.relatedTarget;
            const requestId = button.dataset.requestId;
            const request = topicRequests.find(r => r.requestedAt === requestId);
            if (request) renderRequestQuiz(request.topicData.quiz, 'requestQuizContainer');
        });

        document.getElementById('viewRequestFlashcardsModal').addEventListener('show.bs.modal', event => {
            const button = event.relatedTarget;
            const requestId = button.dataset.requestId;
            const request = topicRequests.find(r => r.requestedAt === requestId);
            if (request) renderRequestFlashcards(request.topicData.flashcards, 'requestFlashcardsContainer');
        });

        // Event Delegation for Approve/Deny buttons
        const container = document.getElementById('topicRequestsContainer');
        container.addEventListener('click', e => {
            const target = e.target.closest('button');
            if (!target) return;

            const requestId = target.dataset.id;
            if (target.classList.contains('approve-request-btn')) {
                handleApproveRequest(requestId);
            } else if (target.classList.contains('deny-request-btn')) {
                handleDenyRequest(requestId);
            }
        });
    }

    init();
});