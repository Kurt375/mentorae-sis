document.addEventListener('DOMContentLoaded', () => {
    const { token } = requireSession('login.html');

    let topicRequests = [];

    // --- Data Loading and Saving ---
    async function loadData() {
        try {
            const data = await authedFetch('/api/content/topic-requests?status=pending', token);
            if (data && data.success) {
                topicRequests = data.requests || [];
            } else {
                topicRequests = [];
            }
        } catch (e) {
            console.error('Failed to load topic requests from API:', e);
            topicRequests = [];
        }
        renderTopicRequests();
        highlightRequestFromUrl();
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function dataURItoBlob(dataURI) {
        if (!dataURI) return new Blob();
        if (!dataURI.includes(',')) return new Blob([dataURI]);
        const byteString = atob(dataURI.split(',')[1]);
        const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], { type: mimeString });
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
            const requestId = request.id;
            const topicData = request.topicData || {};
            const resourcesList = (topicData.resources || []).map(r => `<span class="badge bg-secondary">${r}</span>`).join(' ');
            const visibility = (topicData.visibleTo || []).length > 0 ? topicData.visibleTo.join(', ') : 'All Sections';

            const hasFiles = (topicData.files || []).length > 0;
            const hasQuiz = (topicData.quiz || []).length > 0;
            const hasFlashcards = (topicData.flashcards || []).length > 0;

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
            requestCard.id = `request-${requestId}`;

            const displayDate = request.requestedAt ? new Date(request.requestedAt).toLocaleDateString() : 'Recently';

            requestCard.innerHTML = `
                <div class="row g-3 align-items-center">
                    <div class="col-12 col-md-8">
                        <h6 class="fw-bold mb-1">${topicData.title || request.title} <span class="fw-normal text-muted small">for</span> ${request.subjectName}</h6>
                        <p class="text-muted small mb-2">${topicData.description || request.description || 'No description provided.'}</p>
                        <div class="d-flex flex-wrap gap-3 small">
                            <div><strong>Resources:</strong> ${resourcesList || '<span class="text-muted">None</span>'}</div>
                            <div><strong>Visible to:</strong> ${visibility}</div>
                        </div>
                        ${viewContentDropdown}
                    </div>
                    <div class="col-12 col-md-4 d-flex flex-column justify-content-center align-items-md-end">
                         <small class="text-muted fst-italic mb-2">Requested by ${request.requester} on ${displayDate}</small>
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
            if (file.dataUrl) {
                try {
                    const blob = dataURItoBlob(file.dataUrl);
                    fileUrl = URL.createObjectURL(blob);
                } catch (e) {
                    fileUrl = file.dataUrl;
                }
            }
            const item = document.createElement('a');
            item.href = fileUrl;
            item.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
            item.target = '_blank';
            item.download = file.name || 'document';
            item.innerHTML = `
                <div>
                    <i class="bi bi-file-earmark-text me-2"></i>
                    <span>${file.name}</span>
                </div>
                ${file.size ? `<span class="badge bg-secondary rounded-pill">${(file.size / 1024).toFixed(1)} KB</span>` : ''}
            `;
            list.appendChild(item);
        });
        container.appendChild(list);
    }

    function renderRequestQuiz(quiz, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        if (typeof quiz === 'string') {
            try { quiz = JSON.parse(quiz); } catch (e) { quiz = []; }
        }

        if (!Array.isArray(quiz) || quiz.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4 text-muted">
                    <i class="bi bi-question-circle fs-2 d-block mb-2 text-secondary"></i>
                    <p class="mb-0">No quiz questions attached to this topic request.</p>
                </div>`;
            return;
        }

        const listGroup = document.createElement('div');
        listGroup.className = 'd-flex flex-column gap-3';

        quiz.forEach((q, index) => {
            const card = document.createElement('div');
            card.className = 'card border rounded-3 p-3 bg-light shadow-sm';

            // Normalize options whether object { A: '...', B: '...' } or array ['...', '...']
            let optionsList = [];
            if (Array.isArray(q.options)) {
                optionsList = q.options.map((opt, idx) => {
                    const letter = ['A', 'B', 'C', 'D', 'E'][idx] || String(idx + 1);
                    const val = (typeof opt === 'object' && opt !== null) ? (opt.text || opt.value || '') : String(opt || '');
                    return { letter, text: val };
                });
            } else if (q.options && typeof q.options === 'object') {
                optionsList = Object.keys(q.options).map(key => ({
                    letter: key.toUpperCase(),
                    text: String(q.options[key] || '')
                }));
            }

            const rawAnswer = String(q.answer || '').trim();

            const optionsHtml = optionsList.map(opt => {
                const isCorrect = (
                    rawAnswer.toUpperCase() === opt.letter ||
                    rawAnswer.toUpperCase() === `OPTION ${opt.letter}` ||
                    (opt.text && rawAnswer.toLowerCase() === opt.text.trim().toLowerCase())
                );

                return `
                    <div class="p-2 rounded-2 mb-1.5 d-flex align-items-center justify-content-between ${isCorrect ? 'bg-success-subtle border border-success text-success fw-semibold' : 'bg-white border text-dark'}" style="font-size: 0.88rem;">
                        <div class="d-flex align-items-center text-truncate me-2">
                            <span class="badge ${isCorrect ? 'bg-success text-white' : 'bg-secondary-subtle text-secondary border'} me-2 px-2">${opt.letter}</span>
                            <span class="text-truncate">${escapeHtml(opt.text || '(empty)')}</span>
                        </div>
                        ${isCorrect ? '<span class="badge bg-success text-white flex-shrink-0"><i class="bi bi-check-circle me-1"></i>Correct Answer</span>' : ''}
                    </div>
                `;
            }).join('');

            const explanationHtml = q.explanation ? `
                <div class="mt-2 p-2 bg-white rounded border border-info-subtle small text-muted">
                    <strong class="text-info-emphasis"><i class="bi bi-info-circle me-1"></i>Explanation:</strong> ${escapeHtml(q.explanation)}
                </div>
            ` : '';

            card.innerHTML = `
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill">Question ${index + 1} of ${quiz.length}</span>
                    <span class="badge bg-success-subtle text-success border border-success-subtle">Key: ${escapeHtml(rawAnswer || 'A')}</span>
                </div>
                <h6 class="fw-bold text-dark mb-3">${escapeHtml(q.text || 'Untitled Question')}</h6>
                <div class="d-flex flex-column">
                    ${optionsHtml || '<p class="text-muted small mb-0">No options defined.</p>'}
                </div>
                ${explanationHtml}
            `;

            listGroup.appendChild(card);
        });

        container.appendChild(listGroup);
    }

    function renderRequestFlashcards(flashcards, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        if (typeof flashcards === 'string') {
            try { flashcards = JSON.parse(flashcards); } catch (e) { flashcards = []; }
        }

        if (!Array.isArray(flashcards) || flashcards.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4 text-muted">
                    <i class="bi bi-stack fs-2 d-block mb-2 text-secondary"></i>
                    <p class="mb-0">No flashcards attached to this topic request.</p>
                </div>`;
            return;
        }

        const listGroup = document.createElement('div');
        listGroup.className = 'd-flex flex-column gap-2';

        flashcards.forEach((card, index) => {
            const item = document.createElement('div');
            item.className = 'card border rounded-3 p-3 bg-light shadow-sm';
            const term = card.term || card.front || card.question || 'Untitled Term';
            const def = card.definition || card.back || card.answer || 'No definition provided.';
            const tag = card.tag || card.category || '';

            item.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle rounded-pill">Card ${index + 1} of ${flashcards.length}</span>
                    ${tag ? `<span class="badge bg-info-subtle text-info border border-info-subtle">${escapeHtml(tag)}</span>` : ''}
                </div>
                <h6 class="fw-bold text-dark mb-1">${escapeHtml(term)}</h6>
                <p class="mb-0 text-muted small">${escapeHtml(def)}</p>
            `;
            listGroup.appendChild(item);
        });

        container.appendChild(listGroup);
    }

    // --- Action Handlers ---
    async function handleApproveRequest(requestId) {
        try {
            const res = await authedFetch(`/api/content/topic-requests/${requestId}/review`, token, {
                method: 'POST',
                body: JSON.stringify({ approve: true })
            });
            if (res && res.success) {
                alert('Topic request has been approved and added to the subject topics.');
            } else {
                alert(res.message || 'Could not approve request.');
            }
        } catch (err) {
            console.error('Error approving request:', err);
            alert('Failed to connect to the server.');
        }
        loadData();
    }

    async function handleDenyRequest(requestId) {
        const reason = prompt('Please provide feedback or reason for not approving (optional):', 'Needs revision or additional learning materials.');
        if (reason === null) return; // User clicked Cancel
        try {
            const res = await authedFetch(`/api/content/topic-requests/${requestId}/review`, token, {
                method: 'POST',
                body: JSON.stringify({ approve: false, reason: reason })
            });
            if (res && res.success) {
                alert('Topic request was not approved. The teacher has been notified in their bell notification panel.');
            } else {
                alert(res.message || 'Could not process request.');
            }
        } catch (err) {
            console.error('Error denying request:', err);
            alert('Failed to connect to the server.');
        }
        loadData();
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

        // Load data from API
        loadData();

        // Modal event listeners to populate content
        document.getElementById('viewRequestFilesModal')?.addEventListener('show.bs.modal', event => {
            const button = event.relatedTarget;
            const requestId = button ? button.dataset.requestId : null;
            const request = topicRequests.find(r => String(r.id) === String(requestId));
            let files = (request && request.topicData) ? request.topicData.files : [];
            if (typeof files === 'string') {
                try { files = JSON.parse(files); } catch (e) { files = []; }
            }
            const modalTitle = document.getElementById('viewRequestFilesModalLabel');
            if (modalTitle && request) {
                modalTitle.textContent = `Attached Files: ${request.topicData?.title || request.title}`;
            }
            renderRequestFiles(files, 'requestFilesContainer');
        });

        document.getElementById('viewRequestQuizModal')?.addEventListener('show.bs.modal', event => {
            const button = event.relatedTarget;
            const requestId = button ? button.dataset.requestId : null;
            const request = topicRequests.find(r => String(r.id) === String(requestId));
            let quiz = (request && request.topicData) ? request.topicData.quiz : [];
            if (typeof quiz === 'string') {
                try { quiz = JSON.parse(quiz); } catch (e) { quiz = []; }
            }
            const modalTitle = document.getElementById('viewRequestQuizModalLabel');
            if (modalTitle && request) {
                modalTitle.textContent = `Quiz Questions: ${request.topicData?.title || request.title} (${quiz.length} Questions)`;
            }
            renderRequestQuiz(quiz, 'requestQuizContainer');
        });

        document.getElementById('viewRequestFlashcardsModal')?.addEventListener('show.bs.modal', event => {
            const button = event.relatedTarget;
            const requestId = button ? button.dataset.requestId : null;
            const request = topicRequests.find(r => String(r.id) === String(requestId));
            let flashcards = (request && request.topicData) ? request.topicData.flashcards : [];
            if (typeof flashcards === 'string') {
                try { flashcards = JSON.parse(flashcards); } catch (e) { flashcards = []; }
            }
            const modalTitle = document.getElementById('viewRequestFlashcardsModalLabel');
            if (modalTitle && request) {
                modalTitle.textContent = `Flashcards: ${request.topicData?.title || request.title} (${flashcards.length} Cards)`;
            }
            renderRequestFlashcards(flashcards, 'requestFlashcardsContainer');
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