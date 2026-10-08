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
    const addTopicModalEl = document.getElementById('addTopicModal');
    const addTopicModal = addTopicModalEl ? new bootstrap.Modal(addTopicModalEl) : null;
    const addTopicForm = document.getElementById('addTopicForm');
    let isSavingTopicTeacher = false;

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
    let currentTeacherTopics = [];
    let currentTeacherRecs = [];

    const viewFilesModalEl = document.getElementById('viewFilesModal');
    let viewFilesModalInstance = null;
    function getViewFilesModal() {
        if (!viewFilesModalInstance && viewFilesModalEl && typeof bootstrap !== 'undefined') {
            viewFilesModalInstance = new bootstrap.Modal(viewFilesModalEl);
        }
        return viewFilesModalInstance;
    }

    const onlineDocViewerModalEl = document.getElementById('onlineDocViewerModal');
    let onlineDocViewerModalInstance = null;
    function getOnlineDocViewerModal() {
        if (!onlineDocViewerModalInstance && onlineDocViewerModalEl && typeof bootstrap !== 'undefined') {
            onlineDocViewerModalInstance = new bootstrap.Modal(onlineDocViewerModalEl);
        }
        return onlineDocViewerModalInstance;
    }

    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function getMimeTypeFromFilename(filename, fallbackMime) {
        if (!filename) return fallbackMime || 'application/octet-stream';
        const ext = filename.split('.').pop().toLowerCase();
        const mimeMap = {
            'pdf': 'application/pdf',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
            'txt': 'text/plain',
            'md': 'text/plain',
            'html': 'text/html',
            'htm': 'text/html',
            'json': 'application/json',
            'csv': 'text/plain',
            'mp4': 'video/mp4',
            'webm': 'video/webm',
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'doc': 'application/msword',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'ppt': 'application/vnd.ms-powerpoint',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'xls': 'application/vnd.ms-excel'
        };
        return mimeMap[ext] || fallbackMime || 'application/octet-stream';
    }

    function dataURItoBlob(dataURI, filename = '') {
        if (!dataURI || !dataURI.includes(',')) return null;
        try {
            const parts = dataURI.split(',');
            let mimeString = parts[0].split(':')[1]?.split(';')[0];
            if (!mimeString || mimeString === 'application/octet-stream') {
                mimeString = getMimeTypeFromFilename(filename, mimeString);
            }
            const byteString = atob(parts[1]);
            const len = byteString.length;
            const u8 = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                u8[i] = byteString.charCodeAt(i);
            }
            return new Blob([u8], { type: mimeString });
        } catch (e) {
            console.warn('Manual base64 decode notice:', e);
            return null;
        }
    }

    function getResolvedFileUrl(fileObj, fallbackUrl = '', topicTitle = '') {
        let raw = '';
        const token = localStorage.getItem('mentorae_token') || '';
        const apiBase = (window.MENTORAE_CONFIG?.API_BASE_URL || '').replace(/\/+$/, '');

        if (fileObj) {
            if (typeof fileObj === 'string') {
                raw = fileObj;
            } else {
                raw = fileObj.dataUrl || fileObj.url || fileObj.file_path || fileObj.filePath || fileObj.path || fileObj.pdfDataUrl || '';
                if (!raw && fileObj.topicId !== undefined && fileObj.fileIndex !== undefined) {
                    raw = `/api/content/topics/${fileObj.topicId}/files/${fileObj.fileIndex}/download`;
                } else if (!raw && fileObj.id) {
                    raw = `/api/resources/files/${fileObj.id}/download`;
                } else if (!raw && fileObj.name && decodedSubjectName) {
                    raw = `/api/content/topics/file-by-name?subjectName=${encodeURIComponent(decodedSubjectName)}&topicTitle=${encodeURIComponent(topicTitle || '')}&fileName=${encodeURIComponent(fileObj.name)}`;
                }
            }
        }
        if (!raw) raw = fallbackUrl || '';
        if (!raw) return '';

        if (raw.startsWith('data:') || raw.startsWith('blob:')) {
            return raw;
        }

        let fullUrl = raw;
        if (!/^https?:\/\//i.test(fullUrl)) {
            const cleanPath = fullUrl.startsWith('/') ? fullUrl : `/${fullUrl}`;
            fullUrl = `${apiBase}${cleanPath}`;
        }

        if (token && fullUrl.includes('/api/') && !fullUrl.includes('token=')) {
            const separator = fullUrl.includes('?') ? '&' : '?';
            fullUrl = `${fullUrl}${separator}token=${encodeURIComponent(token)}`;
        }

        return fullUrl;
    }

    async function loadFileData(resolvedUrl, fileName = '') {
        if (!resolvedUrl) throw new Error('No valid file URL provided.');

        const ext = (fileName || '').split('.').pop().toLowerCase();
        const isMedia = ['mp4', 'webm', 'ogg', 'mp3', 'wav', 'm4a'].includes(ext);

        // 1. Data URL (Base64)
        if (resolvedUrl.startsWith('data:')) {
            try {
                const res = await fetch(resolvedUrl);
                const blob = await res.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const blobUrl = URL.createObjectURL(blob);
                return { blob, arrayBuffer, blobUrl, mimeType: blob.type || getMimeTypeFromFilename(fileName) };
            } catch (fetchErr) {
                const b = dataURItoBlob(resolvedUrl, fileName);
                if (!b) throw new Error('Could not parse data URI.');
                const arrayBuffer = await b.arrayBuffer();
                const blobUrl = URL.createObjectURL(b);
                return { blob: b, arrayBuffer, blobUrl, mimeType: b.type || getMimeTypeFromFilename(fileName) };
            }
        }

        // 2. Blob URL
        if (resolvedUrl.startsWith('blob:')) {
            try {
                const res = await fetch(resolvedUrl);
                const blob = await res.blob();
                const arrayBuffer = await blob.arrayBuffer();
                return { blob, arrayBuffer, blobUrl: resolvedUrl, mimeType: blob.type || getMimeTypeFromFilename(fileName) };
            } catch (e) {
                return { blob: null, arrayBuffer: null, blobUrl: resolvedUrl, mimeType: getMimeTypeFromFilename(fileName) };
            }
        }

        // 3. Media streaming over HTTP: native HTML5 video/audio handles range streaming directly
        if (isMedia && /^https?:\/\//i.test(resolvedUrl)) {
            return {
                blob: null,
                arrayBuffer: null,
                blobUrl: resolvedUrl,
                mimeType: getMimeTypeFromFilename(fileName)
            };
        }

        // 4. HTTP / HTTPS URL (PDF, DOCX, XLSX, etc.)
        const token = localStorage.getItem('mentorae_token');
        const headers = {};
        if (token && resolvedUrl.includes('/api/')) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(resolvedUrl, { headers });
        if (!res.ok) {
            throw new Error(`Failed to load file (${res.status} ${res.statusText})`);
        }
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const blobUrl = URL.createObjectURL(blob);
        return { blob, arrayBuffer, blobUrl, mimeType: blob.type || getMimeTypeFromFilename(fileName) };
    }

    let currentViewerActiveBlobUrl = null;

    async function openClassroomViewer(fileName, dataUrl, topicTitle = '', targetFile = null) {
        const viewerEl = document.getElementById('classroomFileViewer');
        const nameEl = document.getElementById('classroomViewerFileName');
        const subEl = document.getElementById('classroomViewerSubtitle');
        const iconEl = document.getElementById('classroomViewerIcon');
        const stageEl = document.getElementById('classroomViewerStage');
        const downloadBtn = document.getElementById('classroomViewerDownloadBtn');
        const popoutBtn = document.getElementById('classroomViewerPopoutBtn');
        const printBtn = document.getElementById('classroomViewerPrintBtn');
        const modeSwitcherEl = document.getElementById('classroomViewerModeSwitcher');

        if (!viewerEl || !stageEl) return;

        // Revoke prior active blob URL
        if (currentViewerActiveBlobUrl && currentViewerActiveBlobUrl.startsWith('blob:')) {
            try { URL.revokeObjectURL(currentViewerActiveBlobUrl); } catch (e) {}
            currentViewerActiveBlobUrl = null;
        }

        viewerEl.classList.remove('d-none');
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        const filesModal = getViewFilesModal();
        if (filesModal) filesModal.hide();

        const closeViewer = () => {
            viewerEl.classList.add('d-none');
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
            stageEl.innerHTML = '';
            if (modeSwitcherEl) modeSwitcherEl.innerHTML = '';
            if (currentViewerActiveBlobUrl && currentViewerActiveBlobUrl.startsWith('blob:')) {
                try { URL.revokeObjectURL(currentViewerActiveBlobUrl); } catch (e) {}
                currentViewerActiveBlobUrl = null;
            }
            if (filesModal) filesModal.show();
        };

        const closeBtn = document.getElementById('classroomViewerCloseBtn');
        const backBtn = document.getElementById('classroomViewerBackBtn');
        if (closeBtn) closeBtn.onclick = closeViewer;
        if (backBtn) backBtn.onclick = closeViewer;

        if (nameEl) nameEl.textContent = fileName || 'Document';
        if (subEl) subEl.textContent = `${decodedSubjectName || 'Subject'} • ${topicTitle || 'Learning Materials'}`;

        const ext = (fileName || '').split('.').pop().toLowerCase();
        let mime = getMimeTypeFromFilename(fileName, '');

        if (iconEl) {
            if (ext === 'pdf') {
                iconEl.className = 'bi bi-file-earmark-pdf fs-4 text-danger';
            } else if (ext === 'pptx' || ext === 'ppt') {
                iconEl.className = 'bi bi-file-earmark-slides fs-4 text-warning';
            } else if (ext === 'docx' || ext === 'doc') {
                iconEl.className = 'bi bi-file-earmark-word fs-4 text-primary';
            } else if (ext === 'xlsx' || ext === 'xls') {
                iconEl.className = 'bi bi-file-earmark-excel fs-4 text-success';
            } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
                iconEl.className = 'bi bi-file-earmark-image fs-4 text-info';
            } else if (['mp4', 'webm', 'ogg'].includes(ext)) {
                iconEl.className = 'bi bi-file-earmark-play fs-4 text-danger';
            } else if (['mp3', 'wav', 'm4a'].includes(ext)) {
                iconEl.className = 'bi bi-file-earmark-music fs-4 text-primary';
            } else {
                iconEl.className = 'bi bi-file-earmark-text fs-4 text-light';
            }
        }

        stageEl.innerHTML = `
            <div class="d-flex flex-column align-items-center justify-content-center w-100 h-100 text-white">
                <div class="spinner-border text-primary mb-3" style="width: 3.2rem; height: 3.2rem;" role="status"></div>
                <p class="fs-5 fw-semibold mb-1">Loading Document Preview...</p>
                <p class="text-white-50 small">${escapeHtml(fileName || 'Please wait')}</p>
            </div>
        `;
        if (modeSwitcherEl) modeSwitcherEl.innerHTML = '';

        const resolvedUrl = getResolvedFileUrl(targetFile, dataUrl, topicTitle);
        let fileData = null;

        try {
            fileData = await loadFileData(resolvedUrl, fileName);
            if (fileData.blobUrl && fileData.blobUrl.startsWith('blob:')) {
                currentViewerActiveBlobUrl = fileData.blobUrl;
            }
        } catch (err) {
            console.error('Error loading file data:', err);
            stageEl.innerHTML = `
                <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 520px;">
                    <i class="bi bi-exclamation-triangle-fill text-warning fs-1 mb-3 d-block"></i>
                    <h4 class="fw-bold text-white mb-2">Unable to load preview</h4>
                    <p class="text-white-50 mb-4">${escapeHtml(err.message || 'The file could not be read.')}</p>
                    <a href="${resolvedUrl || '#'}" download="${escapeHtml(fileName || 'file')}" class="btn btn-primary rounded-pill px-4 fw-bold">
                        <i class="bi bi-download me-2"></i> Download File Instead
                    </a>
                </div>
            `;
            return;
        }

        const activeUrl = fileData.blobUrl || resolvedUrl;

        // Configure Top Action Buttons
        if (downloadBtn) {
            downloadBtn.href = activeUrl;
            downloadBtn.setAttribute('download', fileName || 'lesson_file');
        }
        if (popoutBtn) {
            popoutBtn.href = activeUrl;
            popoutBtn.target = '_blank';
        }
        if (printBtn) {
            printBtn.onclick = () => {
                const ifr = stageEl.querySelector('iframe');
                if (ifr && ifr.contentWindow) {
                    try {
                        ifr.contentWindow.print();
                        return;
                    } catch (e) { }
                }
                const printWindow = window.open(activeUrl);
                if (printWindow) {
                    printWindow.addEventListener('load', () => printWindow.print(), { once: true });
                } else {
                    window.print();
                }
            };
        }

        // ==========================================
        // 1. PDF RENDERING (Native Frame with Blob URL)
        // ==========================================
        if (ext === 'pdf' || mime.includes('pdf')) {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
            if (isMobile) {
                stageEl.innerHTML = `
                    <div class="d-flex flex-column align-items-center justify-content-center w-100 h-100 text-white p-4">
                        <div class="text-center p-4 bg-dark bg-opacity-75 rounded-4 border border-secondary shadow-lg" style="max-width: 440px; width: 100%;">
                            <i class="bi bi-file-earmark-pdf text-danger" style="font-size: 4.5rem;"></i>
                            <h5 class="fw-bold text-white mt-3 text-truncate mb-1">${escapeHtml(fileName)}</h5>
                            <p class="text-white-50 small mb-4">Tap below to view this PDF in full screen.</p>
                            <a href="${activeUrl}" target="_blank" class="btn btn-danger btn-lg rounded-pill px-4 fw-bold w-100 mb-2">
                                <i class="bi bi-box-arrow-up-right me-2"></i> Open PDF Fullscreen
                            </a>
                            <a href="${activeUrl}" download="${escapeHtml(fileName)}" class="btn btn-outline-light rounded-pill px-4 fw-semibold w-100 btn-sm">
                                <i class="bi bi-download me-1"></i> Save to Device
                            </a>
                        </div>
                    </div>
                `;
                return;
            }

            stageEl.innerHTML = `
                <object data="${activeUrl}" type="application/pdf" class="w-100 h-100 border-0" style="background: #525659;">
                    <iframe src="${activeUrl}" class="w-100 h-100 border-0" title="${escapeHtml(fileName)}" style="background: #525659;">
                        <div class="p-5 text-center text-white">
                            <p class="mb-3">Unable to display PDF inline.</p>
                            <a href="${activeUrl}" target="_blank" class="btn btn-danger rounded-pill px-4">Open PDF</a>
                        </div>
                    </iframe>
                </object>
            `;
            return;
        }

        // ==========================================
        // 2. PPT / PPTX PRESENTATIONS
        // ==========================================
        if (ext === 'pptx' || ext === 'ppt') {
            if (targetFile && targetFile.pdfDataUrl) {
                const pdfRes = getResolvedFileUrl(targetFile.pdfDataUrl);
                try {
                    const pdfData = await loadFileData(pdfRes, `${fileName}.pdf`);
                    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
                    if (!isMobile) {
                        stageEl.innerHTML = `
                            <object data="${pdfData.blobUrl}" type="application/pdf" class="w-100 h-100 border-0" style="background: #525659;">
                                <iframe src="${pdfData.blobUrl}" class="w-100 h-100 border-0" title="${escapeHtml(fileName)}"></iframe>
                            </object>
                        `;
                        return;
                    }
                } catch (e) {
                    console.warn('Could not load converted presentation PDF, using slide renderer:', e);
                }
            }
            renderPptxPresentation(fileData ? fileData.arrayBuffer : null, fileName, activeUrl);
            return;
        }

        async function openOnlineEmbed(viewerType) {
            if (modeSwitcherEl) {
                modeSwitcherEl.innerHTML = `
                    <button type="button" class="btn btn-sm btn-primary rounded-pill px-2.5 py-0.5 border-0 fw-semibold fs-8" id="modeBackSlidesTopBtn" title="Switch back to built-in slide viewer">
                        <i class="bi bi-file-slides me-1"></i> Fast Slide View
                    </button>
                `;
                document.getElementById('modeBackSlidesTopBtn')?.addEventListener('click', () => {
                    renderPptxPresentation(fileData ? fileData.arrayBuffer : null, fileName, activeUrl);
                });
            }

            stageEl.innerHTML = `
                <div class="d-flex flex-column align-items-center justify-content-center w-100 h-100 text-white p-4">
                    <div class="spinner-border ${viewerType === 'office' ? 'text-info' : 'text-warning'} mb-3" style="width: 3rem; height: 3rem;" role="status"></div>
                    <p class="fs-5 fw-semibold mb-1">Connecting to ${viewerType === 'office' ? 'Microsoft Office Online' : 'Google Slides'}...</p>
                    <p class="text-white-50 small mb-3">Loading genuine presentation layout and animations</p>
                    <button type="button" class="btn btn-sm btn-outline-light rounded-pill px-3" id="cancelOnlineEmbedBtn">
                        <i class="bi bi-arrow-left me-1"></i> Back to Built-in Slides
                    </button>
                </div>
            `;
            document.getElementById('cancelOnlineEmbedBtn')?.addEventListener('click', () => {
                renderPptxPresentation(fileData ? fileData.arrayBuffer : null, fileName, activeUrl);
            });

            try {
                const token = localStorage.getItem('mentorae_token') || '';
                const apiBase = (window.MENTORAE_CONFIG?.API_BASE_URL || '').replace(/\/+$/, '');
                const res = await fetch(`${apiBase}/api/content/public-preview-token`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({ fileName, dataUrl: activeUrl })
                });
                const data = await res.json();
                if (data && data.success) {
                    const embedUrl = viewerType === 'office' ? data.officeViewerUrl : data.googleViewerUrl;
                    stageEl.innerHTML = `
                        <div class="w-100 h-100 position-relative d-flex flex-column">
                            <div class="d-flex align-items-center justify-content-between px-3 py-1.5 bg-dark border-bottom border-secondary" style="font-size: 0.8rem;">
                                <span class="text-white-50"><i class="bi bi-${viewerType === 'office' ? 'microsoft text-info' : 'google text-warning'} me-1.5"></i> Powered by ${viewerType === 'office' ? 'Microsoft Office Online' : 'Google Slides Viewer'}</span>
                                <div class="d-flex align-items-center gap-2">
                                    <button type="button" class="btn btn-xs btn-outline-light rounded-pill px-2.5 py-0.5" id="btnBackToBuiltinSlides" style="font-size: 0.75rem;">
                                        <i class="bi bi-file-slides me-1"></i> Switch to Fast Slide View
                                    </button>
                                </div>
                            </div>
                            <iframe src="${embedUrl}" class="w-100 flex-grow-1 border-0" allowfullscreen title="${escapeHtml(fileName)}"></iframe>
                        </div>
                    `;
                    document.getElementById('btnBackToBuiltinSlides')?.addEventListener('click', () => {
                        renderPptxPresentation(fileData ? fileData.arrayBuffer : null, fileName, activeUrl);
                    });
                    return;
                }
                throw new Error(data?.message || 'Could not connect to online viewer.');
            } catch (err) {
                console.warn('Online embed error, falling back to built-in renderer:', err);
                stageEl.innerHTML = `
                    <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 520px;">
                        <i class="bi bi-exclamation-circle text-warning fs-1 mb-3 d-block"></i>
                        <h5 class="fw-bold text-white mb-2">Could not connect to ${viewerType === 'office' ? 'Microsoft Office' : 'Google'} Viewer</h5>
                        <p class="text-white-50 small mb-4">${escapeHtml(err.message || 'Service is temporarily unreachable.')}</p>
                        <div class="d-flex justify-content-center gap-2">
                            <button type="button" class="btn btn-primary rounded-pill px-4" id="btnFallbackBuiltin">
                                <i class="bi bi-file-slides me-1"></i> Open Fast Slide View
                            </button>
                            <a href="${activeUrl}" download="${escapeHtml(fileName)}" class="btn btn-outline-light rounded-pill px-4">
                                <i class="bi bi-download me-1"></i> Download Original .pptx
                            </a>
                        </div>
                    </div>
                `;
                document.getElementById('btnFallbackBuiltin')?.addEventListener('click', () => {
                    renderPptxPresentation(fileData ? fileData.arrayBuffer : null, fileName, activeUrl);
                });
            }
        }

        function renderPptxPresentation(pptxBuffer, presFileName, presUrl) {
            stageEl.innerHTML = `
                <div class="d-flex align-items-center justify-content-center w-100 h-100 text-white">
                    <div class="text-center">
                        <div class="spinner-border text-warning mb-3" style="width: 3rem; height: 3rem;" role="status"></div>
                        <p class="fs-5 fw-semibold mb-1">Opening PowerPoint Presentation...</p>
                        <p class="text-white-50 small">Rendering visual layouts, graphics, and themes</p>
                    </div>
                </div>
            `;
            setTimeout(async () => {
                try {
                    const arrayBuffer = pptxBuffer || (fileData ? fileData.arrayBuffer : null);
                    if (!arrayBuffer) throw new Error('No array buffer');

                    const zip = await JSZip.loadAsync(arrayBuffer);

                    // 1. Determine slide dimensions (standard 16:9 widescreen EMU: 9144000 x 5142857)
                    let slideWidth = 9144000;
                    let slideHeight = 5142857;
                    try {
                        const presFile = zip.files['ppt/presentation.xml'];
                        if (presFile) {
                            const presXml = await presFile.async('string');
                            const cxMatch = presXml.match(/cx="(\d+)"/i);
                            const cyMatch = presXml.match(/cy="(\d+)"/i);
                            if (cxMatch && cyMatch) {
                                const parsedW = parseInt(cxMatch[1], 10);
                                const parsedH = parseInt(cyMatch[1], 10);
                                if (parsedW > 0 && parsedH > 0) {
                                    slideWidth = parsedW;
                                    slideHeight = parsedH;
                                }
                            }
                        }
                    } catch (e) { }

                    function isHexDark(hex) {
                        if (!hex || typeof hex !== 'string') return false;
                        const clean = hex.replace('#', '');
                        if (clean.length !== 6) return false;
                        const r = parseInt(clean.substr(0, 2), 16);
                        const g = parseInt(clean.substr(2, 2), 16);
                        const b = parseInt(clean.substr(4, 2), 16);
                        return (r * 299 + g * 587 + b * 114) / 1000 < 128;
                    }

                    // 2. Extract all media blobs with correct MIME types
                    const mediaBlobs = {};
                    for (const path of Object.keys(zip.files)) {
                        if (path.startsWith('ppt/media/')) {
                            try {
                                let mType = 'image/png';
                                const lower = path.toLowerCase();
                                if (lower.endsWith('.svg')) mType = 'image/svg+xml';
                                else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mType = 'image/jpeg';
                                else if (lower.endsWith('.gif')) mType = 'image/gif';
                                else if (lower.endsWith('.webp')) mType = 'image/webp';

                                const u8 = await zip.files[path].async('uint8array');
                                const mBlob = new Blob([u8], { type: mType });
                                const url = URL.createObjectURL(mBlob);
                                const cleanKey = path.replace(/^ppt\//, '');
                                mediaBlobs[cleanKey] = url;
                                mediaBlobs[path] = url;
                                mediaBlobs[cleanKey.replace(/^media\//, '')] = url;
                            } catch (e) { }
                        }
                    }

                    // 3. Find slide XML files in natural numerical order
                    const slideKeys = Object.keys(zip.files)
                        .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
                        .sort((a, b) => {
                            const numA = parseInt(a.match(/\d+/)[0], 10);
                            const numB = parseInt(b.match(/\d+/)[0], 10);
                            return numA - numB;
                        });

                    if (slideKeys.length === 0) {
                        stageEl.innerHTML = `<div class="p-5 text-center text-white-50">No slides found in presentation.</div>`;
                        return;
                    }

                    const slides = [];

                    for (let i = 0; i < slideKeys.length; i++) {
                        const slideKey = slideKeys[i];
                        const slideNum = i + 1;
                        const xmlText = await zip.files[slideKey].async('string');

                        // Relationships
                        const relsPath = slideKey.replace('ppt/slides/', 'ppt/slides/_rels/').concat('.rels');
                        const relsMap = {};
                        if (zip.files[relsPath]) {
                            try {
                                const relsText = await zip.files[relsPath].async('string');
                                const relRegex = /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/g;
                                let rMatch;
                                while ((rMatch = relRegex.exec(relsText)) !== null) {
                                    const cleanTarget = rMatch[2].replace(/^\.\.\//, '');
                                    relsMap[rMatch[1]] = mediaBlobs[cleanTarget] || mediaBlobs[cleanTarget.replace(/^media\//, '')];
                                }
                            } catch (e) { }
                        }

                        // Background color: clean white #FFFFFF by default
                        let bgColor = '#FFFFFF';
                        let bgImage = null;
                        const bgMatch = xmlText.match(/<p:bg>[\s\S]*?<a:srgbClr\s+val="([A-Fa-f0-9]{6})"/);
                        if (bgMatch) {
                            bgColor = '#' + bgMatch[1];
                        }
                        const bgBlipMatch = xmlText.match(/<p:bg>[\s\S]*?r:embed="([^"]+)"/);
                        if (bgBlipMatch && relsMap[bgBlipMatch[1]]) {
                            bgImage = relsMap[bgBlipMatch[1]];
                        }

                        const slideIsDark = isHexDark(bgColor);
                        const defaultTextColor = slideIsDark ? '#FFFFFF' : '#1E293B';

                        // Parse all shape and picture elements with group transformation
                        const elements = [];
                        let slideTitle = `Slide ${slideNum}`;
                        let titleFound = false;

                        function parseShapesFromXml(xmlStr) {
                            const results = [];
                            const grpMatches = xmlStr.match(/<p:grpSp[\s\S]*?<\/p:grpSp>/g) || [];
                            grpMatches.forEach(grpNode => {
                                const grpOffMatch = grpNode.match(/<p:grpSpPr>[\s\S]*?<a:xfrm[\s\S]*?<a:off[^>]+x="([^"]+)"[^>]+y="([^"]+)"/);
                                const grpExtMatch = grpNode.match(/<p:grpSpPr>[\s\S]*?<a:xfrm[\s\S]*?<a:ext[^>]+cx="([^"]+)"[^>]+cy="([^"]+)"/);
                                const grpChOffMatch = grpNode.match(/<p:grpSpPr>[\s\S]*?<a:xfrm[\s\S]*?<a:chOff[^>]+x="([^"]+)"[^>]+y="([^"]+)"/);
                                const grpChExtMatch = grpNode.match(/<p:grpSpPr>[\s\S]*?<a:xfrm[\s\S]*?<a:chExt[^>]+cx="([^"]+)"[^>]+cy="([^"]+)"/);

                                let grpInfo = null;
                                if (grpOffMatch && grpExtMatch) {
                                    const gx = parseInt(grpOffMatch[1], 10);
                                    const gy = parseInt(grpOffMatch[2], 10);
                                    const gw = parseInt(grpExtMatch[1], 10);
                                    const gh = parseInt(grpExtMatch[2], 10);
                                    const chX = grpChOffMatch ? parseInt(grpChOffMatch[1], 10) : 0;
                                    const chY = grpChOffMatch ? parseInt(grpChOffMatch[2], 10) : 0;
                                    const chW = (grpChExtMatch && parseInt(grpChExtMatch[1], 10) > 0) ? parseInt(grpChExtMatch[1], 10) : gw;
                                    const chH = (grpChExtMatch && parseInt(grpChExtMatch[2], 10) > 0) ? parseInt(grpChExtMatch[2], 10) : gh;

                                    if (gw > 0 && gh > 0) {
                                        grpInfo = { gx, gy, gw, gh, chX, chY, chW, chH };
                                    }
                                }

                                const innerSp = grpNode.match(/<p:sp[\s\S]*?<\/p:sp>/g) || [];
                                const innerPic = grpNode.match(/<p:pic[\s\S]*?<\/p:pic>/g) || [];
                                [...innerSp, ...innerPic].forEach(childNode => {
                                    results.push({ node: childNode, group: grpInfo });
                                });
                            });

                            const strippedXml = xmlStr.replace(/<p:grpSp[\s\S]*?<\/p:grpSp>/g, '');
                            const rootSp = strippedXml.match(/<p:sp[\s\S]*?<\/p:sp>/g) || [];
                            const rootPic = strippedXml.match(/<p:pic[\s\S]*?<\/p:pic>/g) || [];
                            [...rootSp, ...rootPic].forEach(rootNode => {
                                results.push({ node: rootNode, group: null });
                            });

                            return results;
                        }

                        const allItems = parseShapesFromXml(xmlText);

                        allItems.forEach(({ node, group }) => {
                            const xMatch = node.match(/<a:off[^>]+x="([^"]+)"[^>]+y="([^"]+)"/);
                            const extMatch = node.match(/<a:ext[^>]+cx="([^"]+)"[^>]+cy="([^"]+)"/);
                            if (!xMatch || !extMatch) return;

                            let childX = parseInt(xMatch[1], 10);
                            let childY = parseInt(xMatch[2], 10);
                            let childW = parseInt(extMatch[1], 10);
                            let childH = parseInt(extMatch[2], 10);

                            if (childW <= 0 || childH <= 0) return;

                            let finalX = childX;
                            let finalY = childY;
                            let finalW = childW;
                            let finalH = childH;

                            if (group) {
                                finalX = group.gx + ((childX - group.chX) * group.gw / group.chW);
                                finalY = group.gy + ((childY - group.chY) * group.gh / group.chH);
                                finalW = childW * group.gw / group.chW;
                                finalH = childH * group.gh / group.chH;
                            }

                            const left = Math.max(-10, Math.min(110, (finalX / slideWidth) * 100));
                            const top = Math.max(-10, Math.min(110, (finalY / slideHeight) * 100));
                            const width = Math.max(0.2, Math.min(110, (finalW / slideWidth) * 100));
                            const height = Math.max(0.2, Math.min(110, (finalH / slideHeight) * 100));

                            // Image fill (blip or svgBlip)
                            const blipMatch = node.match(/r:embed="([^"]+)"/);
                            const imgUrl = blipMatch ? relsMap[blipMatch[1]] : null;

                            if (imgUrl) {
                                elements.push({
                                    type: 'image',
                                    url: imgUrl,
                                    left, top, width, height
                                });
                            }

                            // Check shape background strictly inside <p:spPr>
                            let shapeBg = null;
                            const spPrMatch = node.match(/<p:spPr[\s\S]*?<\/p:spPr>/);
                            if (spPrMatch) {
                                const spPr = spPrMatch[0];
                                if (!spPr.includes('<a:noFill')) {
                                    const solidMatch = spPr.match(/<a:solidFill>[\s\S]*?<a:srgbClr\s+val="([A-Fa-f0-9]{6})"/);
                                    if (solidMatch) {
                                        shapeBg = '#' + solidMatch[1];
                                    }
                                }
                            }

                            // Text paragraphs
                            const pMatches = node.match(/<a:p[\s\S]*?<\/a:p>/g) || [];
                            const paragraphs = [];

                            pMatches.forEach(pNode => {
                                let align = 'left';
                                if (pNode.includes('algn="ctr"')) align = 'center';
                                else if (pNode.includes('algn="r"')) align = 'right';
                                else if (pNode.includes('algn="just"')) align = 'justify';

                                const rMatches = pNode.match(/<a:r[\s\S]*?<\/a:r>|<a:br\/>/g) || [];
                                const runs = [];

                                rMatches.forEach(rNode => {
                                    if (rNode === '<a:br/>') {
                                        runs.push({ text: '\n', isBr: true });
                                    } else {
                                        const tMatch = rNode.match(/<a:t>([\s\S]*?)<\/a:t>/);
                                        if (tMatch) {
                                            const rawText = tMatch[1];
                                            const isBold = rNode.includes('b="1"') || rNode.includes('typeface="Roboto Bold"');
                                            const isItalic = rNode.includes('i="1"');
                                            const isUnderline = rNode.includes('u="sng"');
                                            const szMatch = rNode.match(/sz="(\d+)"/);
                                            const szPt = szMatch ? parseInt(szMatch[1], 10) / 100 : 16;

                                            // Typography & Typefaces
                                            const fontMatch = rNode.match(/typeface="([^"]+)"/);
                                            let fontFamily = "'Roboto', -apple-system, BlinkMacSystemFont, sans-serif";
                                            let textTransform = '';
                                            let letterSpacing = 'normal';

                                            if (fontMatch) {
                                                const fn = fontMatch[1];
                                                if (fn === 'Anton') {
                                                    fontFamily = "'Anton', 'Impact', sans-serif";
                                                    textTransform = 'text-transform: uppercase;';
                                                    letterSpacing = 'letter-spacing: 0.5px;';
                                                } else if (fn === 'Courier New') {
                                                    fontFamily = "'Courier New', Courier, monospace";
                                                } else if (fn === 'Arial') {
                                                    fontFamily = "Arial, Helvetica, sans-serif";
                                                } else if (fn.includes('Montserrat')) {
                                                    fontFamily = "'Montserrat', sans-serif";
                                                }
                                            }

                                            const clrMatch = rNode.match(/<a:srgbClr\s+val="([A-Fa-f0-9]{6})"/);
                                            let color = defaultTextColor;
                                            if (clrMatch) {
                                                color = '#' + clrMatch[1];
                                            } else if (rNode.includes('val="tx1"') || rNode.includes('val="dk1"')) {
                                                color = slideIsDark ? '#FFFFFF' : '#0F172A';
                                            } else if (rNode.includes('val="bg1"') || rNode.includes('val="lt1"')) {
                                                color = slideIsDark ? '#CBD5E1' : '#FFFFFF';
                                            }

                                            // Proportional scale relative to slide width in points (EMU / 12700)
                                            const slideWidthPt = (slideWidth && slideWidth > 100000) ? (slideWidth / 12700) : 720;
                                            const fontSizeCqw = ((szPt / slideWidthPt) * 100).toFixed(3);

                                            runs.push({
                                                text: rawText,
                                                isBold,
                                                isItalic,
                                                isUnderline,
                                                color,
                                                fontSizeCqw,
                                                fontFamily,
                                                textTransform,
                                                letterSpacing
                                            });
                                        }
                                    }
                                });

                                if (runs.length > 0) {
                                    const fullPText = runs.map(r => r.text).join('').trim();
                                    if (!titleFound && fullPText.length > 0) {
                                        slideTitle = fullPText;
                                        titleFound = true;
                                    }
                                    paragraphs.push({ align, runs });
                                }
                            });

                            if (paragraphs.length > 0) {
                                elements.push({
                                    type: 'textbox',
                                    paragraphs,
                                    left, top, width, height
                                });
                            } else if (shapeBg) {
                                elements.push({
                                    type: 'shape',
                                    shapeBg,
                                    left, top, width, height
                                });
                            }
                        });

                        slides.push({
                            slideNumber: slideNum,
                            title: slideTitle,
                            bgColor,
                            bgImage,
                            aspectRatio: (slideWidth / slideHeight) || (16 / 9),
                            elements
                        });
                    }

                    let activeSlide = 0;
                    let viewMode = 'visual'; // 'visual' or 'outline'

                    function buildSlideCanvasHtml(sl) {
                        const bgStyle = sl.bgImage
                            ? `background: url('${sl.bgImage}') center/cover no-repeat;`
                            : `background-color: ${sl.bgColor};`;

                        let elementsHtml = '';
                        sl.elements.forEach(el => {
                            if (el.type === 'image') {
                                elementsHtml += `
                                    <div style="position: absolute; left: ${el.left.toFixed(2)}%; top: ${el.top.toFixed(2)}%; width: ${el.width.toFixed(2)}%; height: ${el.height.toFixed(2)}%; z-index: 2; pointer-events: none;">
                                        <img src="${el.url}" alt="graphic" style="width: 100%; height: 100%; object-fit: contain;">
                                    </div>
                                `;
                            } else if (el.type === 'shape') {
                                elementsHtml += `
                                    <div style="position: absolute; left: ${el.left.toFixed(2)}%; top: ${el.top.toFixed(2)}%; width: ${el.width.toFixed(2)}%; height: ${el.height.toFixed(2)}%; background-color: ${el.shapeBg}; border-radius: 6px; z-index: 1;"></div>
                                `;
                            } else if (el.type === 'textbox') {
                                elementsHtml += `<div style="position: absolute; left: ${el.left.toFixed(2)}%; top: ${el.top.toFixed(2)}%; width: ${el.width.toFixed(2)}%; min-height: ${el.height.toFixed(2)}%; z-index: 3; box-sizing: border-box; padding: 2px 4px; overflow: hidden; word-break: break-word;">`;
                                el.paragraphs.forEach(p => {
                                    elementsHtml += `<div style="text-align: ${p.align}; margin-bottom: 2px; line-height: 1.15;">`;
                                    p.runs.forEach(r => {
                                        if (r.isBr) {
                                            elementsHtml += '<br>';
                                        } else {
                                            const styles = [
                                                `color: ${r.color};`,
                                                `font-family: ${r.fontFamily};`,
                                                `font-size: clamp(8px, ${r.fontSizeCqw}cqw, 54px);`,
                                                r.isBold ? 'font-weight: 700;' : 'font-weight: 400;',
                                                r.isItalic ? 'font-style: italic;' : '',
                                                r.isUnderline ? 'text-decoration: underline;' : '',
                                                r.textTransform || '',
                                                r.letterSpacing ? `letter-spacing: ${r.letterSpacing};` : ''
                                            ].filter(Boolean).join(' ');

                                            elementsHtml += `<span style="${styles}">${escapeHtml(r.text)}</span>`;
                                        }
                                    });
                                    elementsHtml += `</div>`;
                                });
                                elementsHtml += `</div>`;
                            }
                        });

                        return `
                            <div class="pptx-slide-canvas-box" style="container-type: inline-size; aspect-ratio: ${sl.aspectRatio}; ${bgStyle}">
                                ${elementsHtml}
                            </div>
                        `;
                    }

                    function buildOutlineHtml() {
                        return `
                            <div class="w-100 p-4 bg-dark bg-opacity-75 rounded-3 border border-secondary text-white overflow-y-auto" style="max-width: 960px; max-height: 80vh;">
                                <div class="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom border-secondary">
                                    <h4 class="fw-bold text-white mb-0"><i class="bi bi-list-columns-reverse text-warning me-2"></i> Presentation Content Outline</h4>
                                    <span class="badge bg-primary fs-7">${slides.length} Slides</span>
                                </div>
                                <div class="d-flex flex-column gap-4">
                                    ${slides.map(sl => {
                            const textBlocks = [];
                            sl.elements.forEach(el => {
                                if (el.paragraphs) {
                                    el.paragraphs.forEach(p => {
                                        const txt = p.runs.map(r => r.text).join('').trim();
                                        if (txt) textBlocks.push(txt);
                                    });
                                }
                            });
                            return `
                                            <div class="p-3 bg-black bg-opacity-40 rounded-3 border border-secondary">
                                                <div class="d-flex align-items-center gap-2 mb-2">
                                                    <span class="badge bg-warning text-dark fw-bold">Slide ${sl.slideNumber}</span>
                                                    <span class="fw-bold text-light">${escapeHtml(sl.title)}</span>
                                                </div>
                                                <div class="ps-3 border-start border-warning border-2 ms-1 mt-2 d-flex flex-column gap-1">
                                                    ${textBlocks.map(tb => `<div class="text-white-75 small lh-base">${escapeHtml(tb)}</div>`).join('')}
                                                </div>
                                            </div>
                                        `;
                        }).join('')}
                                </div>
                            </div>
                        `;
                    }

                    function renderPresentation() {
                        const s = slides[activeSlide];
                        stageEl.innerHTML = `
                            <div class="pptx-viewer-container">
                                <!-- Left Sidebar Slide Thumbnails -->
                                <div class="pptx-sidebar">
                                    <div class="small fw-bold text-white-50 px-2 py-1 text-uppercase tracking-wider">
                                        Slides (${slides.length})
                                    </div>
                                    ${slides.map((sl, sIdx) => `
                                        <div class="pptx-thumbnail ${sIdx === activeSlide && viewMode === 'visual' ? 'active' : ''}" data-sidx="${sIdx}">
                                            <div class="d-flex justify-content-between align-items-center mb-1">
                                                <span class="badge bg-secondary bg-opacity-50 text-white">${sl.slideNumber}</span>
                                            </div>
                                            <div class="small fw-bold text-truncate text-white">${escapeHtml(sl.title)}</div>
                                            <div class="micro-text text-white-50 text-truncate mt-1">${sl.elements.length} visual asset(s)</div>
                                        </div>
                                    `).join('')}
                                </div>

                                <!-- Main Slide Stage -->
                                <div class="pptx-main-slide-stage">
                                    <div class="w-100 d-flex justify-content-center align-items-center flex-grow-1">
                                        ${viewMode === 'visual' ? buildSlideCanvasHtml(s) : buildOutlineHtml()}
                                    </div>

                                    <!-- Bottom Navigation Bar -->
                                    <div class="pptx-bottom-toolbar flex-wrap gap-1.5 py-1.5">
                                        <button type="button" class="btn btn-sm btn-dark rounded-circle p-2 d-flex align-items-center justify-content-center text-white" id="pptxPrevBtn" ${activeSlide === 0 ? 'disabled' : ''} title="Previous Slide (Left Arrow)">
                                            <i class="bi bi-chevron-left"></i>
                                        </button>
                                        <span class="fw-bold text-white small px-2">
                                            Slide ${activeSlide + 1} of ${slides.length}
                                        </span>
                                        <button type="button" class="btn btn-sm btn-dark rounded-circle p-2 d-flex align-items-center justify-content-center text-white" id="pptxNextBtn" ${activeSlide === slides.length - 1 ? 'disabled' : ''} title="Next Slide (Right Arrow)">
                                            <i class="bi bi-chevron-right"></i>
                                        </button>
                                        <div class="vr bg-secondary my-1 d-none d-sm-block"></div>
                                        <button type="button" class="btn btn-sm ${viewMode === 'visual' ? 'btn-primary' : 'btn-outline-light'} rounded-pill px-3 py-1 fs-8 fw-semibold" id="pptxToggleVisualBtn">
                                            <i class="bi bi-file-slides me-1"></i> Slide Design
                                        </button>
                                        <button type="button" class="btn btn-sm ${viewMode === 'outline' ? 'btn-primary' : 'btn-outline-light'} rounded-pill px-3 py-1 fs-8 fw-semibold" id="pptxToggleOutlineBtn">
                                            <i class="bi bi-list-columns-reverse me-1"></i> Content Outline
                                        </button>
                                        <div class="vr bg-secondary my-1 d-none d-sm-block"></div>
                                        <button type="button" class="btn btn-sm btn-outline-info rounded-pill px-3 py-1 fs-8 fw-semibold" id="pptxOfficeOnlineBtn" title="View with official Microsoft Office PowerPoint engine">
                                            <i class="bi bi-microsoft me-1"></i> Office 365 View
                                        </button>
                                        <button type="button" class="btn btn-sm btn-outline-warning rounded-pill px-3 py-1 fs-8 fw-semibold" id="pptxGoogleSlidesBtn" title="View with Google Docs / Slides">
                                            <i class="bi bi-google me-1"></i> Google Slides
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;

                        if (modeSwitcherEl) {
                            modeSwitcherEl.innerHTML = `
                                <button type="button" class="btn btn-sm btn-outline-info rounded-pill px-2.5 py-0.5 border-0 fw-semibold fs-8" id="modeOfficeTopBtn" title="View with Microsoft Office Online">
                                    <i class="bi bi-microsoft me-1"></i> Office 365
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-warning rounded-pill px-2.5 py-0.5 border-0 fw-semibold fs-8" id="modeGoogleTopBtn" title="View with Google Docs">
                                    <i class="bi bi-google me-1"></i> Google Slides
                                </button>
                            `;
                            document.getElementById('modeOfficeTopBtn')?.addEventListener('click', () => openOnlineEmbed('office'));
                            document.getElementById('modeGoogleTopBtn')?.addEventListener('click', () => openOnlineEmbed('google'));
                        }

                        stageEl.querySelectorAll('.pptx-thumbnail').forEach(th => {
                            th.addEventListener('click', () => {
                                activeSlide = parseInt(th.dataset.sidx, 10);
                                viewMode = 'visual';
                                renderPresentation();
                            });
                        });

                        document.getElementById('pptxPrevBtn')?.addEventListener('click', () => {
                            if (activeSlide > 0) {
                                activeSlide--;
                                renderPresentation();
                            }
                        });
                        document.getElementById('pptxNextBtn')?.addEventListener('click', () => {
                            if (activeSlide < slides.length - 1) {
                                activeSlide++;
                                renderPresentation();
                            }
                        });
                        document.getElementById('pptxToggleVisualBtn')?.addEventListener('click', () => {
                            viewMode = 'visual';
                            renderPresentation();
                        });
                        document.getElementById('pptxToggleOutlineBtn')?.addEventListener('click', () => {
                            viewMode = 'outline';
                            renderPresentation();
                        });
                        document.getElementById('pptxOfficeOnlineBtn')?.addEventListener('click', () => {
                            openOnlineEmbed('office');
                        });
                        document.getElementById('pptxGoogleSlidesBtn')?.addEventListener('click', () => {
                            openOnlineEmbed('google');
                        });
                    }

                    renderPresentation();

                } catch (err) {
                    console.error('Error rendering PPTX presentation:', err);
                    stageEl.innerHTML = `
                        <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 500px;">
                            <i class="bi bi-file-earmark-slides text-warning" style="font-size: 5rem;"></i>
                            <h4 class="fw-bold text-white mt-3">${escapeHtml(fileName)}</h4>
                            <p class="text-white-50 mb-4">Click download below to view this presentation in Microsoft Office or Google Slides.</p>
                            <a href="${presUrl || activeUrl}" download="${escapeHtml(presFileName || fileName)}" class="btn btn-primary btn-lg rounded-pill px-5 fw-bold">
                                <i class="bi bi-download me-2"></i> Download Presentation
                            </a>
                        </div>
                    `;
                }
            }, 30);
        }

        // ==========================================
        // 3. WORD DOCUMENTS (.docx, .doc)
        // ==========================================
        if (ext === 'docx' || ext === 'doc') {
            stageEl.innerHTML = `
                <div class="docx-viewer-wrapper">
                    <div id="docxPreviewHost" class="docx-preview-host"></div>
                </div>
            `;
            const host = document.getElementById('docxPreviewHost');

            // Setup mode switcher with Zoom and Page controls
            if (modeSwitcherEl) {
                modeSwitcherEl.innerHTML = `
                    <button type="button" class="btn btn-sm btn-dark text-white rounded-pill px-2.5 py-0.5 border-0" id="docxZoomOutBtn" title="Zoom out">
                        <i class="bi bi-zoom-out"></i>
                    </button>
                    <span class="micro-text text-white-50 px-1 fw-semibold" id="docxZoomVal">100%</span>
                    <button type="button" class="btn btn-sm btn-dark text-white rounded-pill px-2.5 py-0.5 border-0" id="docxZoomInBtn" title="Zoom in">
                        <i class="bi bi-zoom-in"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-light rounded-pill px-2.5 py-0.5 ms-1 border-opacity-50" id="docxFitBtn" title="Reset zoom">
                        Fit
                    </button>
                `;
                let currentZoom = 1.0;
                const updateZoom = (z) => {
                    currentZoom = Math.min(Math.max(0.5, Math.round(z * 100) / 100), 2.0);
                    const zoomValEl = document.getElementById('docxZoomVal');
                    if (zoomValEl) zoomValEl.textContent = `${Math.round(currentZoom * 100)}%`;
                    if (host) {
                        host.style.transform = `scale(${currentZoom})`;
                        host.style.transformOrigin = 'top center';
                    }
                };
                document.getElementById('docxZoomOutBtn')?.addEventListener('click', () => updateZoom(currentZoom - 0.15));
                document.getElementById('docxZoomInBtn')?.addEventListener('click', () => updateZoom(currentZoom + 0.15));
                document.getElementById('docxFitBtn')?.addEventListener('click', () => updateZoom(1.0));
            }

            // High-fidelity Word document rendering with authentic physical page layout
            if (ext === 'docx' && window.docx && typeof window.docx.renderAsync === 'function' && fileData.arrayBuffer) {
                try {
                    await window.docx.renderAsync(fileData.arrayBuffer, host, null, {
                        className: 'docx',
                        inWrapper: true,
                        ignoreWidth: false,
                        ignoreHeight: false,
                        ignoreFonts: false,
                        breakPages: true,
                        ignoreLastRenderedPageBreak: false,
                        useBase64URL: true,
                        renderHeaders: true,
                        renderFooters: true,
                        renderFootnotes: true,
                        renderEndnotes: true
                    });
                    return;
                } catch (docxErr) {
                    console.warn('docx-preview notice, trying mammoth fallback:', docxErr);
                }
            }

            // Fallback to Mammoth if docx-preview is unavailable or encounters unsupported syntax
            if (window.mammoth && fileData.arrayBuffer) {
                try {
                    const result = await window.mammoth.convertToHtml({ arrayBuffer: fileData.arrayBuffer });
                    host.innerHTML = `
                        <div class="docx-paper-sheet">
                            ${result.value || '<p class="text-muted fst-italic">Empty Document.</p>'}
                        </div>
                    `;
                    return;
                } catch (mErr) {
                    console.warn('mammoth error:', mErr);
                }
            }

            stageEl.innerHTML = `
                <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 500px;">
                    <i class="bi bi-file-earmark-word text-primary" style="font-size: 5rem;"></i>
                    <h4 class="fw-bold text-white mt-3">${escapeHtml(fileName)}</h4>
                    <p class="text-white-50 mb-4">Click download below to view this document in Microsoft Word.</p>
                    <a href="${activeUrl}" download="${escapeHtml(fileName)}" class="btn btn-primary btn-lg rounded-pill px-5 fw-bold">
                        <i class="bi bi-download me-2"></i> Download Document
                    </a>
                </div>
            `;
            return;
        }

        // ==========================================
        // 4. SPREADSHEETS (.xlsx, .xls, .csv)
        // ==========================================
        if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
            if (window.XLSX && fileData.arrayBuffer) {
                try {
                    const wb = window.XLSX.read(fileData.arrayBuffer, { type: 'array' });
                    const sheetNames = wb.SheetNames || [];
                    if (sheetNames.length === 0) throw new Error('No sheets found in workbook.');

                    function renderSheetView(sIdx) {
                        const sName = sheetNames[sIdx];
                        const ws = wb.Sheets[sName];
                        const htmlTable = window.XLSX.utils.sheet_to_html(ws, { editable: false });

                        stageEl.innerHTML = `
                            <div class="spreadsheet-viewer-wrapper">
                                <div class="spreadsheet-tabs-bar">
                                    <span class="fw-bold text-dark small me-2"><i class="bi bi-file-earmark-spreadsheet text-success me-1"></i>Sheets:</span>
                                    ${sheetNames.map((name, i) => `
                                        <button type="button" class="btn btn-sm ${i === sIdx ? 'btn-success text-white fw-bold' : 'btn-outline-secondary'} rounded-pill px-3 py-1 small sheet-tab-btn" data-sidx="${i}">
                                            <i class="bi bi-table me-1"></i>${escapeHtml(name)}
                                        </button>
                                    `).join('')}
                                </div>
                                <div class="spreadsheet-content-stage">
                                    ${htmlTable}
                                </div>
                            </div>
                        `;

                        stageEl.querySelectorAll('.sheet-tab-btn').forEach(btn => {
                            btn.addEventListener('click', () => {
                                const idx = parseInt(btn.dataset.sidx, 10);
                                renderSheetView(idx);
                            });
                        });
                    }

                    renderSheetView(0);
                    return;
                } catch (xlsxErr) {
                    console.error('SheetJS parse error:', xlsxErr);
                }
            }

            stageEl.innerHTML = `
                <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 500px;">
                    <i class="bi bi-file-earmark-excel text-success" style="font-size: 5rem;"></i>
                    <h4 class="fw-bold text-white mt-3">${escapeHtml(fileName)}</h4>
                    <p class="text-white-50 mb-4">Click download below to access and open this spreadsheet.</p>
                    <a href="${activeUrl}" download="${escapeHtml(fileName)}" class="btn btn-primary btn-lg rounded-pill px-5 fw-bold">
                        <i class="bi bi-download me-2"></i> Download File
                    </a>
                </div>
            `;
            return;
        }

        // ==========================================
        // 5. IMAGES (PNG, JPG, SVG, WEBP, GIF)
        // ==========================================
        if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) || mime.startsWith('image/')) {
            stageEl.innerHTML = `
                <div class="d-flex align-items-center justify-content-center w-100 h-100 p-4" style="background-color: #0b0c0e;">
                    <img src="${activeUrl}" alt="${escapeHtml(fileName)}" class="img-fluid rounded shadow-lg" style="max-height: 90vh; max-width: 95vw; object-fit: contain;">
                </div>
            `;
            return;
        }

        // ==========================================
        // 6. VIDEO (MP4, WEBM, OGG)
        // ==========================================
        if (['mp4', 'webm', 'ogg'].includes(ext) || mime.startsWith('video/')) {
            stageEl.innerHTML = `
                <div class="media-viewer-stage">
                    <video controls autoplay playsinline class="rounded shadow-lg" src="${activeUrl}">
                        <source src="${activeUrl}" type="${mime || 'video/mp4'}">
                        Your browser does not support video playback.
                    </video>
                </div>
            `;
            const vid = stageEl.querySelector('video');
            if (vid) {
                vid.play().catch(e => console.log('Autoplay requires user interaction:', e));
            }
            return;
        }

        // ==========================================
        // 7. AUDIO (MP3, WAV, OGG, M4A)
        // ==========================================
        if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext) || mime.startsWith('audio/')) {
            stageEl.innerHTML = `
                <div class="d-flex align-items-center justify-content-center w-100 h-100 text-white p-4">
                    <div class="audio-viewer-card">
                        <i class="bi bi-music-note-beamed text-primary fs-1 mb-3 d-block"></i>
                        <h5 class="fw-bold text-white mb-2 text-truncate">${escapeHtml(fileName)}</h5>
                        <p class="text-white-50 small mb-4">${escapeHtml(topicTitle || 'Audio Playback')}</p>
                        <audio controls autoplay class="w-100" src="${activeUrl}">
                            <source src="${activeUrl}" type="${mime || 'audio/mpeg'}">
                            Your browser does not support audio playback.
                        </audio>
                    </div>
                </div>
            `;
            const aud = stageEl.querySelector('audio');
            if (aud) {
                aud.play().catch(e => console.log('Autoplay deferred:', e));
            }
            return;
        }

        // ==========================================
        // 8. TEXT & CODE (TXT, JSON, LOG, MD, HTML, JS, CSS, XML)
        // ==========================================
        if (['txt', 'json', 'log', 'md', 'html', 'js', 'css', 'xml'].includes(ext) || mime.startsWith('text/')) {
            let textContent = '';
            try {
                if (fileData.blob) {
                    textContent = await fileData.blob.text();
                } else if (fileData.arrayBuffer) {
                    textContent = new TextDecoder().decode(fileData.arrayBuffer);
                }
            } catch (e) { }

            stageEl.innerHTML = `
                <div class="docx-paper-container">
                    <div class="docx-page-card font-monospace" style="white-space: pre-wrap; font-size: 0.95rem; color: #1e293b;">
                        ${escapeHtml(textContent || 'Empty file.')}
                    </div>
                </div>
            `;
            return;
        }

        // ==========================================
        // 9. GENERIC DOWNLOAD FALLBACK
        // ==========================================
        stageEl.innerHTML = `
            <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 500px;">
                <i class="bi bi-file-earmark-text text-secondary" style="font-size: 5rem;"></i>
                <h4 class="fw-bold text-white mt-3">${escapeHtml(fileName)}</h4>
                <p class="text-white-50 mb-4">Click download below to access and open this file on your device.</p>
                <a href="${activeUrl}" download="${escapeHtml(fileName)}" class="btn btn-primary btn-lg rounded-pill px-5 fw-bold">
                    <i class="bi bi-download me-2"></i> Download File
                </a>
            </div>
        `;
    }

    function getFileIcon(fileName = '') {
        const ext = (fileName.split('.').pop() || '').toLowerCase();
        if (ext === 'pdf') {
            return '<i class="bi bi-file-earmark-pdf-fill text-danger fs-3"></i>';
        } else if (['doc', 'docx'].includes(ext)) {
            return '<i class="bi bi-file-earmark-word-fill text-primary fs-3"></i>';
        } else if (['xls', 'xlsx', 'csv'].includes(ext)) {
            return '<i class="bi bi-file-earmark-excel-fill text-success fs-3"></i>';
        } else if (['ppt', 'pptx'].includes(ext)) {
            return '<i class="bi bi-file-earmark-ppt-fill text-warning fs-3"></i>';
        } else if (['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'].includes(ext)) {
            return '<i class="bi bi-file-earmark-play-fill text-info fs-3"></i>';
        } else if (['mp3', 'wav', 'm4a'].includes(ext)) {
            return '<i class="bi bi-file-earmark-music-fill text-secondary fs-3"></i>';
        } else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
            return '<i class="bi bi-file-earmark-image-fill text-success fs-3"></i>';
        }
        return '<i class="bi bi-file-earmark-text-fill text-primary fs-3"></i>';
    }

    function openFilesModal(title, files, topic = null) {
        const modalTitle = document.getElementById('modalTopicTitle');
        const modalFilesList = document.getElementById('modalFilesList');
        if (modalTitle) modalTitle.textContent = title;
        if (modalFilesList) {
            modalFilesList.innerHTML = '';
            modalFilesList.scrollTop = 0;
            if (!files || files.length === 0) {
                modalFilesList.innerHTML = '<li class="list-group-item text-muted text-center py-4">No files available for this topic.</li>';
            } else {
                files.forEach((file, fIdx) => {
                    if (topic && topic.id && file.topicId === undefined) {
                        file.topicId = topic.id;
                        file.fileIndex = fIdx;
                    }
                    const li = document.createElement('li');
                    li.className = 'list-group-item d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 py-3 px-3.5';

                    const fileUrl = getResolvedFileUrl(file, '', title) || '#';
                    const iconHtml = getFileIcon(file.name || '');

                    li.innerHTML = `
                        <div class="d-flex align-items-center gap-3 flex-grow-1 min-w-0">
                            <div class="flex-shrink-0 d-flex align-items-center justify-content-center" style="width: 38px; height: 38px;">
                                ${iconHtml}
                            </div>
                            <div class="flex-grow-1 min-w-0">
                                <span class="fw-semibold text-dark d-block text-break fs-6 file-title-text" title="${escapeHtml(file.name || 'Attached File')}">${escapeHtml(file.name || 'Attached File')}</span>
                                <div class="d-flex align-items-center gap-2 mt-1">
                                    ${file.size ? `<span class="micro-text text-muted">${(file.size / 1024).toFixed(1)} KB</span>` : ''}
                                    ${file.pdfDataUrl ? '<span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2 py-0.5" style="font-size: 0.65rem;">HD Classroom View</span>' : ''}
                                </div>
                            </div>
                        </div>
                        <div class="d-flex align-items-center gap-2 flex-shrink-0 ms-auto ms-sm-0">
                            <button type="button" class="btn btn-sm btn-primary fw-semibold rounded-pill px-3 py-1.5 text-nowrap btn-open-online-viewer" data-findex="${fIdx}">
                                <i class="bi bi-eye me-1"></i> Read Online
                            </button>
                            <a href="${fileUrl}" download="${escapeHtml(file.name || 'download')}" class="btn btn-sm btn-outline-success fw-semibold rounded-pill px-3 py-1.5 text-nowrap">
                                <i class="bi bi-download me-1"></i> Download
                            </a>
                        </div>
                    `;
                    modalFilesList.appendChild(li);
                });

                modalFilesList.querySelectorAll('.btn-open-online-viewer').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const idx = parseInt(btn.dataset.findex, 10);
                        const targetFile = files[idx];
                        if (targetFile) {
                            if (topic && topic.id && targetFile.topicId === undefined) {
                                targetFile.topicId = topic.id;
                                targetFile.fileIndex = idx;
                            }
                            const resolved = getResolvedFileUrl(targetFile, '', title);
                            openClassroomViewer(targetFile.name, resolved, title, targetFile);
                        }
                    });
                });
            }
        }
        const modalInstance = getViewFilesModal();
        if (modalInstance) modalInstance.show();
    }

    // --- Rendering Functions ---
    function renderTopics(topics) {
        let btnAddItemCol = document.getElementById('btnAddItemCol');
        if (!btnAddItemCol && btnAddItem) {
            btnAddItemCol = document.createElement('div');
            btnAddItemCol.className = 'col-12 col-md-6 d-flex';
            btnAddItemCol.id = 'btnAddItemCol';
            btnAddItemCol.appendChild(btnAddItem);
        }
        if (btnAddItemCol) btnAddItemCol.remove();
        topicsList.innerHTML = '';

        const topicsToDisplay = (topics || []).filter(topic => {
            const isPublic = !topic.visibleTo || topic.visibleTo.length === 0;
            if (currentSectionContext) {
                return isPublic || topic.visibleTo.includes(currentSectionContext);
            }
            return isPublic;
        });

        currentTeacherTopics = topicsToDisplay;

        if (topicsToDisplay.length > 0) {
            topicsToDisplay.forEach((topic, index) => {
                const col = document.createElement('div');
                col.className = 'col-12 col-md-6 d-flex';

                const topicCard = document.createElement('div');
                topicCard.className = 'card topic-item-card border p-3 shadow-sm rounded-4 bg-white w-100 d-flex flex-column justify-content-between';
                topicCard.style.borderColor = '#a3b899';

                // Study / View Action buttons with integrated counts
                let actionButtons = [];
                if (topic.files && topic.files.length > 0) {
                    actionButtons.push(`<button type="button" class="btn btn-sm btn-outline-primary fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-nowrap btn-open-topic-files" data-topic-index="${index}"><i class="bi bi-file-earmark-text text-primary"></i> Files (${topic.files.length})</button>`);
                }
                if (topic.flashcards && topic.flashcards.length > 0) {
                    actionButtons.push(`<a href="flashcards_viewer.html?subject=${encodeURIComponent(decodedSubjectName)}&topic=${encodeURIComponent(topic.title)}&section=${encodeURIComponent(currentSectionContext || '')}" class="btn btn-sm fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-nowrap text-decoration-none btn-chip-flashcard"><i class="bi bi-stack"></i> Flashcards (${topic.flashcards.length})</a>`);
                }
                if (topic.quiz && topic.quiz.length > 0) {
                    actionButtons.push(`<a href="quiz_taker.html?subject=${encodeURIComponent(decodedSubjectName)}&topic=${encodeURIComponent(topic.title)}&section=${encodeURIComponent(currentSectionContext || '')}" class="btn btn-sm btn-success fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-nowrap text-white text-decoration-none" title="Preview practice quiz as teacher"><i class="bi bi-question-circle"></i> Quiz (${topic.quiz.length} Qs)</a>`);
                    actionButtons.push(`<button type="button" class="btn btn-sm btn-outline-success fw-semibold px-2.5 py-1.5 rounded-pill d-inline-flex align-items-center gap-1 text-nowrap btn-view-quiz-results" data-topic-title="${escapeHtml(topic.title)}" data-topic-id="${topic.id || ''}" title="View Student Practice Quiz Results & Analytics"><i class="bi bi-bar-chart-fill"></i> Results</button>`);
                }
                // Quick Bulk Add Content Button
                actionButtons.push(`<button type="button" class="btn btn-sm btn-outline-success fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-nowrap btn-quick-append-content" data-topic-id="${topic.id || ''}" data-topic-index="${index}" data-topic-title="${escapeHtml(topic.title)}"><i class="bi bi-plus-circle"></i> Add Content</button>`);

                let materialsHtml = '';
                if (actionButtons.length > 0) {
                    materialsHtml += `<div class="d-flex flex-wrap align-items-center gap-2 mt-3 pt-2 border-top">${actionButtons.join('')}</div>`;
                } else {
                    materialsHtml += `<div class="mt-3 pt-2 border-top"><span class="badge bg-light text-muted border fw-normal micro-text px-2.5 py-1.5 rounded-pill"><i class="bi bi-info-circle me-1"></i> No study materials attached yet</span></div>`;
                }

                topicCard.innerHTML = `
                    <div class="d-flex align-items-start gap-3 flex-grow-1" style="min-width: 0;">
                        <div class="topic-icon-box bg-primary-subtle text-primary rounded-3 flex-shrink-0 p-2">
                            <i class="bi bi-file-earmark-text-fill fs-4"></i>
                        </div>
                        <div class="flex-grow-1" style="min-width: 0;">
                            <h3 class="fw-bold fs-6 text-dark text-break m-0">${topic.title}</h3>
                            <p class="micro-text text-secondary text-break m-0 mt-1">${topic.description}</p>
                            ${topic.createdAt ? `
                                <p class="micro-text text-muted text-break m-0 mt-2"><i class="bi bi-clock-history me-1"></i>Created on ${new Date(topic.createdAt).toLocaleDateString()} ${topic.createdBy ? `by ${topic.createdBy}` : ''}</p>
                            ` : ''}
                        </div>
                    </div>
                    <div class="w-100">
                        ${materialsHtml}
                    </div>
                `;
                col.appendChild(topicCard);
                topicsList.appendChild(col);
            });
        }

        if (btnAddItemCol) {
            topicsList.appendChild(btnAddItemCol);
        } else if (btnAddItem) {
            const addCol = document.createElement('div');
            addCol.className = 'col-12 col-md-6 d-flex';
            addCol.id = 'btnAddItemCol';
            addCol.appendChild(btnAddItem);
            topicsList.appendChild(addCol);
        }
    }

    function renderRecommendations(recommendations) {
        recommendationsList.innerHTML = '';
        currentTeacherRecs = recommendations || [];
        if (!recommendations || recommendations.length === 0) {
            recommendationsList.innerHTML = '<div class="col-12"><p class="text-muted text-center small py-3">No recommendations have been added for this subject yet.</p></div>';
            return;
        }
        recommendations.forEach((rec, recIndex) => {

            // Study / View Action buttons with integrated counts
            let actionButtons = [];
            if (rec.files && rec.files.length > 0) {
                actionButtons.push(`<button type="button" class="btn btn-sm btn-outline-primary fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-nowrap btn-open-rec-files" data-rec-index="${recIndex}"><i class="bi bi-file-earmark-text text-primary"></i> Files (${rec.files.length})</button>`);
            }
            if (rec.flashcards && rec.flashcards.length > 0) {
                actionButtons.push(`<a href="flashcards_viewer.html?subject=${encodeURIComponent(decodedSubjectName)}&topic=${encodeURIComponent(rec.title)}&source=recommendation&section=${encodeURIComponent(currentSectionContext || '')}" class="btn btn-sm fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-nowrap text-decoration-none btn-chip-flashcard"><i class="bi bi-stack"></i> Flashcards (${rec.flashcards.length})</a>`);
            }
            if (rec.quiz && rec.quiz.length > 0) {
                actionButtons.push(`<a href="quiz_taker.html?subject=${encodeURIComponent(decodedSubjectName)}&topic=${encodeURIComponent(rec.title)}&source=recommendation&section=${encodeURIComponent(currentSectionContext || '')}" class="btn btn-sm btn-success fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-nowrap text-white text-decoration-none" title="Preview practice quiz as teacher"><i class="bi bi-question-circle"></i> Quiz (${rec.quiz.length} Qs)</a>`);
                actionButtons.push(`<button type="button" class="btn btn-sm btn-outline-success fw-semibold px-2.5 py-1.5 rounded-pill d-inline-flex align-items-center gap-1 text-nowrap btn-view-quiz-results" data-topic-title="${escapeHtml(rec.title)}" data-topic-id="${rec.id || ''}" title="View Student Practice Quiz Results & Analytics"><i class="bi bi-bar-chart-fill"></i> Results</button>`);
            }
            // Quick Bulk Add Content Button
            actionButtons.push(`<button type="button" class="btn btn-sm btn-outline-success fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-nowrap quick-append-rec-btn" data-rec-index="${recIndex}" data-rec-id="${rec.id || ''}" data-rec-title="${escapeHtml(rec.title)}"><i class="bi bi-plus-circle"></i> Add Content</button>`);

            let materialsHtml = '';
            if (actionButtons.length > 0) {
                materialsHtml += `<div class="d-flex flex-wrap align-items-center gap-2 mt-3 pt-2 border-top">${actionButtons.join('')}</div>`;
            } else {
                materialsHtml += `<div class="mt-3 pt-2 border-top"><span class="badge bg-light text-muted border fw-normal micro-text px-2.5 py-1.5 rounded-pill"><i class="bi bi-info-circle me-1"></i> No study materials attached yet</span></div>`;
            }

            const col = document.createElement('div');
            col.className = 'col-12 col-md-6 d-flex';

            const recCard = document.createElement('div');
            recCard.className = 'card topic-item-card border-0 shadow-sm overflow-hidden rounded-4 w-100 d-flex flex-column justify-content-between';
            recCard.innerHTML = `
                <div class="classroom-banner ${rec.color} p-3 text-white d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1 me-3" style="min-width: 0;">
                        <h3 class="fw-bold m-0 fs-5 text-white text-break">${rec.title}</h3>
                    </div>
                    <div class="dropdown">
                        <button class="btn btn-link text-white p-0" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-three-dots-vertical fs-5"></i></button>
                        <ul class="dropdown-menu dropdown-menu-end">
                            <li><button class="dropdown-item edit-rec-btn" type="button" data-rec-index="${recIndex}">Edit</button></li>
                            <li><button class="dropdown-item delete-rec-btn" type="button" data-rec-index="${recIndex}">Delete</button></li>
                        </ul>
                    </div>
                </div>
                <div class="card-body p-3 bg-white d-flex flex-column flex-grow-1 justify-content-between" style="min-width: 0;">
                    <div style="min-width: 0;">
                        <p class="small text-secondary m-0 card-desc-text text-break">${rec.description}</p>
                        ${materialsHtml}
                    </div>
                    <div class="mt-3 border-top pt-2">
                        <p class="micro-text text-muted fst-italic m-0">Comment: ${rec.comment}</p>
                        ${rec.createdAt ? `<p class="micro-text text-muted m-0 mt-1"><i class="bi bi-clock-history me-1"></i>Created on ${new Date(rec.createdAt).toLocaleDateString()}</p>` : ''}
                    </div>
                </div>
            `;
            col.appendChild(recCard);
            recommendationsList.appendChild(col);
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
            // Initialize basic subject container if not in localStorage
            currentSubject = { name: decodedSubjectName, topics: [], recommendations: [] };
            if (btnAddItem) btnAddItem.classList.remove('d-none');
        }

        // Fetch live topics & recommendations from the database
        fetchTopicsFromDb();
    }

    async function fetchTopicsFromDb() {
        try {
            const token = localStorage.getItem('mentorae_token');
            if (!token) return;
            const data = await authedFetch(`/api/content/topics?subjectName=${encodeURIComponent(decodedSubjectName)}`, token);
            if (data && data.success) {
                if (!currentSubject) {
                    currentSubject = { name: decodedSubjectName, topics: [], recommendations: [] };
                }
                currentSubject.topics = data.topics || [];
                currentSubject.recommendations = data.recommendations || [];
                renderTopics(currentSubject.topics);
                renderRecommendations(currentSubject.recommendations);

                // Safely synchronize into localStorage for other viewer pages
                try {
                    const stored = localStorage.getItem(SUBJECTS_STORAGE_KEY);
                    let cachedSubjects = stored ? JSON.parse(stored) : [];
                    const sIdx = cachedSubjects.findIndex(s => s.name && s.name.trim().toLowerCase() === decodedSubjectName.trim().toLowerCase());
                    if (sIdx !== -1) {
                        cachedSubjects[sIdx].topics = currentSubject.topics;
                        cachedSubjects[sIdx].recommendations = currentSubject.recommendations;
                    } else {
                        cachedSubjects.push(currentSubject);
                    }
                    try {
                        localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(cachedSubjects));
                    } catch (quotaErr) {
                        // If quota exceeded, strip large file dataUrl strings for local storage cache, but retain file URLs & topic info
                        const sanitized = cachedSubjects.map(subj => ({
                            ...subj,
                            topics: (subj.topics || []).map(t => ({
                                ...t,
                                files: (t.files || []).map((f, fIdx) => ({
                                    name: f.name,
                                    type: f.type,
                                    size: f.size,
                                    topicId: f.topicId || t.id,
                                    fileIndex: f.fileIndex !== undefined ? f.fileIndex : fIdx,
                                    url: f.url || (t.id ? `/api/content/topics/${t.id}/files/${fIdx}/download` : undefined)
                                }))
                            })),
                            recommendations: (subj.recommendations || []).map(r => ({
                                ...r,
                                files: (r.files || []).map((f, fIdx) => ({
                                    name: f.name,
                                    type: f.type,
                                    size: f.size,
                                    topicId: f.topicId || r.id,
                                    fileIndex: f.fileIndex !== undefined ? f.fileIndex : fIdx,
                                    url: f.url || (r.id ? `/api/content/topics/${r.id}/files/${fIdx}/download` : undefined)
                                }))
                            }))
                        }));
                        localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(sanitized));
                    }
                } catch (cacheErr) {
                    console.warn('Could not cache topics into localStorage:', cacheErr);
                }
            }
        } catch (e) {
            console.error('Failed to fetch topics from DB:', e);
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

        const openFileBtn = target.closest('.btn-open-topic-files');
        if (openFileBtn) {
            const topicIndex = parseInt(openFileBtn.dataset.topicIndex, 10);
            const topic = currentTeacherTopics[topicIndex] || (currentSubject && currentSubject.topics ? currentSubject.topics[topicIndex] : null);
            if (topic) {
                openFilesModal(topic.title, topic.files, topic);
            }
            return;
        }

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
            updateRequestContentButtons();
            addTopicModal.show();
        }
    });

    recommendationsList.addEventListener('click', (e) => {
        const target = e.target;

        const openRecFileBtn = target.closest('.btn-open-rec-files');
        if (openRecFileBtn) {
            const recIndex = parseInt(openRecFileBtn.dataset.recIndex, 10);
            const rec = currentTeacherRecs[recIndex] || (currentSubject && currentSubject.recommendations ? currentSubject.recommendations[recIndex] : null);
            if (rec) {
                openFilesModal(rec.title, rec.files, rec);
            }
            return;
        }

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
                updateRequestContentButtons();
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

    addTopicForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentSubject) {
            alert("Error: Cannot save because the subject data is not loaded.");
            return;
        }

        const selectedResources = Array.from(document.querySelectorAll('input[name="resourceType"]:checked')).map(cb => cb.value);
        const recIndex = document.getElementById('recommendationId') ? document.getElementById('recommendationId').value : (document.getElementById('topicIndex') ? document.getElementById('topicIndex').value : '');
        const isEditingRec = recIndex !== '';
        const isCreatingNew = !isEditingRec;
        const destination = itemDestination.value;

        // Content validation is required when editing recommendation or creating new item.
        const needsContentValidation = isEditingRec || isCreatingNew;

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

        const token = localStorage.getItem('mentorae_token');

        if (isEditingRec) {
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
                const contentPayload = {
                    resources: selectedResources,
                    files: newTopicRequestContent.files,
                    quiz: newTopicRequestContent.quiz,
                    flashcards: newTopicRequestContent.flashcards
                };

                try {
                    const res = await authedFetch('/api/content/topics', token, {
                        method: 'POST',
                        body: JSON.stringify({
                            subjectName: decodedSubjectName,
                            title: document.getElementById('topicTitle').value,
                            description: document.getElementById('topicDescription').value,
                            comment: document.getElementById('topicComment').value,
                            isRecommendation: true,
                            color: 'bg-card-purple',
                            contentPayload: contentPayload
                        })
                    });
                    if (res && res.success) {
                        alert('Your recommendation has been saved successfully.');
                        await fetchTopicsFromDb();
                    } else {
                        alert(res.message || 'Failed to save recommendation.');
                    }
                } catch (err) {
                    console.error('Error saving recommendation:', err);
                    alert('Could not save recommendation to server.');
                }
            } else {
                const visibilityContainer = document.getElementById('topicVisibilityContainer');
                let selectedSections = Array.from(visibilityContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
                const contentPayload = {
                    resources: selectedResources,
                    visibleTo: selectedSections,
                    files: newTopicRequestContent.files,
                    quiz: newTopicRequestContent.quiz,
                    flashcards: newTopicRequestContent.flashcards
                };

                try {
                    const res = await authedFetch('/api/content/topic-requests', token, {
                        method: 'POST',
                        body: JSON.stringify({
                            subjectName: decodedSubjectName,
                            title: document.getElementById('topicTitle').value,
                            description: document.getElementById('topicDescription').value,
                            contentPayload: contentPayload
                        })
                    });
                    if (res && res.success) {
                        alert('Your request to add a new main topic has been sent to the administrator for review.');
                    } else {
                        alert(res.message || 'Failed to submit topic request.');
                    }
                } catch (err) {
                    console.error('Error submitting topic request:', err);
                    alert('Could not submit request to server.');
                }
            }
        }
        isSavingTopicTeacher = true;
        if (addTopicModal) addTopicModal.hide();
    });

    function hasUnsavedTeacherTopicChanges() {
        const title = (document.getElementById('topicTitle')?.value || '').trim();
        const desc = (document.getElementById('topicDescription')?.value || '').trim();
        const comment = (document.getElementById('topicComment')?.value || '').trim();
        const isFile = !!document.getElementById('resourceFile')?.checked;
        const isQuiz = !!document.getElementById('resourceQuiz')?.checked;
        const isFlashcards = !!document.getElementById('resourceFlashcards')?.checked;
        const hasRequestContent = (newTopicRequestContent?.files?.length > 0) || (newTopicRequestContent?.quiz?.length > 0) || (newTopicRequestContent?.flashcards?.length > 0);
        return title !== '' || desc !== '' || comment !== '' || isFile || isQuiz || isFlashcards || hasRequestContent;
    }

    if (addTopicModalEl) {
        addTopicModalEl.addEventListener('hide.bs.modal', (event) => {
            if (isSavingTopicTeacher) return;
            if (hasUnsavedTeacherTopicChanges()) {
                const confirmDiscard = confirm('You have unsaved changes on this topic. Are you sure you want to discard them and close?');
                if (!confirmDiscard) {
                    event.preventDefault();
                }
            }
        });

        addTopicModalEl.addEventListener('hidden.bs.modal', () => {
            isSavingTopicTeacher = false;
        });
    }

    // --- Content Management Modals ---
    const requestContentFileModalEl = document.getElementById('requestContentFileModal');
    const requestContentQuizModalEl = document.getElementById('requestContentQuizModal');
    const requestContentFlashcardModalEl = document.getElementById('requestContentFlashcardModal');

    const requestContentFileModal = requestContentFileModalEl ? new bootstrap.Modal(requestContentFileModalEl) : null;
    const requestContentQuizModal = requestContentQuizModalEl ? new bootstrap.Modal(requestContentQuizModalEl) : null;
    const requestContentFlashcardModal = requestContentFlashcardModalEl ? new bootstrap.Modal(requestContentFlashcardModalEl) : null;

    addTopicForm.addEventListener('click', e => {
        const manageBtn = e.target.closest('.manage-request-content-btn');
        if (manageBtn) {
            const type = manageBtn.dataset.type;
            if (type === 'file') {
                renderRequestFiles();
                if (requestContentFileModal) requestContentFileModal.show();
            } else if (type === 'quiz') {
                renderRequestQuiz();
                if (requestContentQuizModal) requestContentQuizModal.show();
            } else if (type === 'flashcards') {
                renderRequestFlashcards();
                if (requestContentFlashcardModal) requestContentFlashcardModal.show();
            }
        }
    });

    function renderRequestFiles() {
        const container = document.getElementById('requestFilesContainer');
        container.innerHTML = (newTopicRequestContent.files.length === 0)
            ? '<p class="text-muted text-center">No files added yet.</p>'
            : `<div class="list-group">${newTopicRequestContent.files.map((file, index) => `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <div class="d-flex align-items-center text-truncate me-2">
                        <i class="bi bi-file-earmark-text me-2 text-primary"></i>
                        <span class="text-truncate">${escapeHtml(file.name)}</span>
                        ${file.pdfDataUrl ? '<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill ms-2 micro-text"><i class="bi bi-check-circle me-1"></i>HD Ready</span>' : ''}
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-danger delete-request-file" data-index="${index}"><i class="bi bi-trash"></i></button>
                </div>`).join('')}</div>`;
    }

    document.getElementById('requestFileUploadForm').addEventListener('submit', async e => {
        e.preventDefault();
        const fileInput = document.getElementById('requestFileInput');
        if (fileInput.files.length === 0) return;
        const file = fileInput.files[0];
        const ext = (file.name || '').split('.').pop().toLowerCase();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Adding...';
        }
        try {
            const dataUrl = await readFileAsDataURL(file);
            const fileItem = { name: file.name, size: file.size, dataUrl };
            newTopicRequestContent.files.push(fileItem);
            renderRequestFiles();
            fileInput.value = '';

            // Pre-convert Office documents in background for zero-latency classroom viewing
            if (['pptx', 'ppt', 'docx', 'doc'].includes(ext)) {
                const token = localStorage.getItem('mentorae_token');
                if (token) {
                    authedFetch('/api/content/convert-document', token, {
                        method: 'POST',
                        body: JSON.stringify({ fileName: file.name, dataUrl })
                    }).then(res => {
                        if (res && res.success && res.pdfDataUrl) {
                            fileItem.pdfDataUrl = res.pdfDataUrl;
                            fileItem.convertedToPdf = true;
                            renderRequestFiles();
                        }
                    }).catch(err => console.warn('Background conversion notice:', err));
                }
            }
        } catch (error) {
            alert('Error reading file.');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Add File';
            }
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
        const badge = document.getElementById('currentQuizBadge');
        if (badge) {
            badge.textContent = `${newTopicRequestContent.quiz.length} question${newTopicRequestContent.quiz.length === 1 ? '' : 's'}`;
        }
        container.innerHTML = (newTopicRequestContent.quiz.length === 0)
            ? '<p class="text-muted text-center py-2">No questions added yet.</p>'
            : `<div class="list-group">${newTopicRequestContent.quiz.map((q, index) => {
                const opts = q.options || {};
                return `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <div class="me-2 text-truncate">
                        <span class="fw-semibold">${index + 1}. ${escapeHtml(q.text || '')}</span>
                        <div class="micro-text text-muted">
                            <span class="badge ${q.answer === 'A' ? 'bg-success text-white' : 'bg-light text-dark border'} me-1">A: ${escapeHtml(opts.A || '')}</span>
                            <span class="badge ${q.answer === 'B' ? 'bg-success text-white' : 'bg-light text-dark border'} me-1">B: ${escapeHtml(opts.B || '')}</span>
                            ${opts.C ? `<span class="badge ${q.answer === 'C' ? 'bg-success text-white' : 'bg-light text-dark border'} me-1">C: ${escapeHtml(opts.C || '')}</span>` : ''}
                            ${opts.D ? `<span class="badge ${q.answer === 'D' ? 'bg-success text-white' : 'bg-light text-dark border'} me-1">D: ${escapeHtml(opts.D || '')}</span>` : ''}
                            <span class="text-success fw-bold ms-1">(Ans: ${q.answer || 'A'})</span>
                        </div>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-danger delete-request-quiz flex-shrink-0" data-index="${index}"><i class="bi bi-trash"></i></button>
                </div>`;
            }).join('')}</div>`;
    }

    document.getElementById('requestQuizForm').addEventListener('submit', e => {
        e.preventDefault();
        newTopicRequestContent.quiz.push({
            id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            text: document.getElementById('requestQuizQuestionText').value.trim(),
            options: {
                A: document.getElementById('requestQuizOptionA').value.trim(),
                B: document.getElementById('requestQuizOptionB').value.trim(),
                C: document.getElementById('requestQuizOptionC').value.trim(),
                D: document.getElementById('requestQuizOptionD').value.trim(),
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
        const badge = document.getElementById('currentDeckBadge');
        if (badge) {
            badge.textContent = `${newTopicRequestContent.flashcards.length} card${newTopicRequestContent.flashcards.length === 1 ? '' : 's'}`;
        }
        container.innerHTML = (newTopicRequestContent.flashcards.length === 0)
            ? '<p class="text-muted text-center py-2">No cards added yet.</p>'
            : `<div class="list-group">${newTopicRequestContent.flashcards.map((card, index) => `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <div class="me-2 text-truncate">
                        <h6 class="mb-0 text-dark fw-semibold text-truncate">${escapeHtml(card.term || '')}</h6>
                        <small class="text-muted d-block text-truncate">${escapeHtml(card.definition || '')}</small>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-danger delete-request-flashcard flex-shrink-0" data-index="${index}"><i class="bi bi-trash"></i></button>
                </div>`).join('')}</div>`;
    }

    document.getElementById('requestFlashcardForm').addEventListener('submit', e => {
        e.preventDefault();
        newTopicRequestContent.flashcards.push({
            id: `fc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            term: document.getElementById('requestFlashcardTerm').value.trim(),
            definition: document.getElementById('requestFlashcardDefinition').value.trim(),
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

    // =========================================================================
    // BULK PARSING & SPREADSHEET IMPORT UTILITIES
    // =========================================================================

    /** Parses multi-line raw text into flashcards array */
    function parseBulkFlashcards(rawText, delimiterMode = 'auto') {
        if (!rawText || !rawText.trim()) return [];
        const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        const cards = [];

        lines.forEach(line => {
            let term = '';
            let definition = '';

            if (delimiterMode === 'tab' || (delimiterMode === 'auto' && line.includes('\t'))) {
                const parts = line.split('\t');
                term = (parts[0] || '').trim();
                definition = parts.slice(1).join('\t').trim();
            } else if (delimiterMode === 'dash' || (delimiterMode === 'auto' && line.includes(' - '))) {
                const parts = line.split(' - ');
                term = (parts[0] || '').trim();
                definition = parts.slice(1).join(' - ').trim();
            } else if (delimiterMode === 'pipe' || (delimiterMode === 'auto' && line.includes('|'))) {
                const parts = line.split('|');
                term = (parts[0] || '').trim();
                definition = parts.slice(1).join('|').trim();
            } else if (delimiterMode === 'colon' || (delimiterMode === 'auto' && line.includes(':'))) {
                const idx = line.indexOf(':');
                term = line.substring(0, idx).trim();
                definition = line.substring(idx + 1).trim();
            } else if (line.includes('-')) {
                const idx = line.indexOf('-');
                term = line.substring(0, idx).trim();
                definition = line.substring(idx + 1).trim();
            } else {
                term = line.trim();
                definition = '';
            }

            if (term || definition) {
                cards.push({
                    id: `fc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                    term: term || 'Untitled Term',
                    definition: definition || 'No definition provided.'
                });
            }
        });

        return cards;
    }

    /** Parses multi-line raw text into multiple-choice quiz questions */
    function parseBulkQuiz(rawText) {
        if (!rawText || !rawText.trim()) return [];
        const questions = [];

        // Check if input is tabular (contains tabs or pipes on most lines)
        const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);
        const tabLines = lines.filter(l => l.includes('\t') || (l.split('|').length >= 5));

        if (tabLines.length > 0 && tabLines.length >= lines.length * 0.5) {
            // Tabular format: Question \t Option A \t Option B \t Option C \t Option D \t Answer
            lines.forEach(line => {
                const delimiter = line.includes('\t') ? '\t' : '|';
                const parts = line.split(delimiter).map(p => p.trim());
                if (parts.length >= 3) {
                    const text = parts[0].replace(/^\d+[\.\)]\s*/, '').trim();
                    const optA = parts[1] || '';
                    const optB = parts[2] || '';
                    const optC = parts[3] || '';
                    const optD = parts[4] || '';
                    let ans = (parts[5] || parts[parts.length - 1] || 'A').toUpperCase().replace(/[^A-D]/g, '');
                    if (!['A', 'B', 'C', 'D'].includes(ans)) ans = 'A';

                    if (text) {
                        questions.push({
                            id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                            text,
                            options: { A: optA, B: optB, C: optC, D: optD },
                            answer: ans
                        });
                    }
                }
            });
            return questions;
        }

        // Block-based format:
        // 1. Question text
        // A. Option A
        // B. Option B
        // C. Option C
        // D. Option D
        // Answer: B
        const blockRegex = /(?:^|\n\s*\n|\n(?=(?:\d+[\.\)]|Question\s*\d+[:\.])))/i;
        const rawBlocks = rawText.split(blockRegex).map(b => b.trim()).filter(b => b.length > 0);

        rawBlocks.forEach(block => {
            const blockLines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            if (blockLines.length === 0) return;

            let questionLines = [];
            let optA = '', optB = '', optC = '', optD = '';
            let answer = 'A';
            let collectingQuestion = true;

            blockLines.forEach(line => {
                const optMatch = line.match(/^([A-Da-d])[\.\)\:\-]\s*(.*)$/);
                const ansMatch = line.match(/^(?:Answer|Correct|Key|Ans)[\s:=-]+([A-Da-d])/i);

                if (ansMatch) {
                    answer = ansMatch[1].toUpperCase();
                    collectingQuestion = false;
                } else if (optMatch) {
                    collectingQuestion = false;
                    const letter = optMatch[1].toUpperCase();
                    const val = optMatch[2].trim();
                    if (letter === 'A') optA = val;
                    else if (letter === 'B') optB = val;
                    else if (letter === 'C') optC = val;
                    else if (letter === 'D') optD = val;
                } else if (collectingQuestion) {
                    questionLines.push(line);
                }
            });

            let fullQuestion = questionLines.join(' ').replace(/^\d+[\.\)]\s*/, '').trim();
            if (fullQuestion && (optA || optB)) {
                questions.push({
                    id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                    text: fullQuestion,
                    options: { A: optA, B: optB, C: optC, D: optD },
                    answer: ['A', 'B', 'C', 'D'].includes(answer) ? answer : 'A'
                });
            }
        });

        return questions;
    }

    /** Reads spreadsheet file (xlsx, xls, csv) using SheetJS */
    function readSpreadsheetRows(file) {
        return new Promise((resolve, reject) => {
            if (!file) return reject(new Error('No file selected.'));
            if (typeof XLSX === 'undefined') {
                return reject(new Error('Spreadsheet parser (SheetJS) is not loaded.'));
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                    resolve(rows);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    }

    /** Parses spreadsheet rows into flashcards */
    function parseFlashcardsFromSheetRows(rows) {
        if (!rows || rows.length === 0) return [];
        let startIndex = 0;
        const firstRow = rows[0].map(c => String(c).toLowerCase().trim());
        if (firstRow.some(cell => cell.includes('term') || cell.includes('word') || cell.includes('concept') || cell.includes('front'))) {
            startIndex = 1;
        }

        const cards = [];
        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            const term = String(row[0] || '').trim();
            const def = String(row[1] || '').trim();
            if (term || def) {
                cards.push({
                    id: `fc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                    term: term || 'Untitled Term',
                    definition: def || 'No definition provided.'
                });
            }
        }
        return cards;
    }

    /** Parses spreadsheet rows into quiz questions */
    function parseQuizFromSheetRows(rows) {
        if (!rows || rows.length === 0) return [];
        let startIndex = 0;
        const firstRow = rows[0].map(c => String(c).toLowerCase().trim());
        if (firstRow.some(cell => cell.includes('question') || cell.includes('prompt'))) {
            startIndex = 1;
        }

        const questions = [];
        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            const text = String(row[0] || '').trim();
            const optA = String(row[1] || '').trim();
            const optB = String(row[2] || '').trim();
            const optC = String(row[3] || '').trim();
            const optD = String(row[4] || '').trim();
            let ans = String(row[5] || 'A').toUpperCase().replace(/[^A-D]/g, '');
            if (!['A', 'B', 'C', 'D'].includes(ans)) ans = 'A';

            if (text && (optA || optB)) {
                questions.push({
                    id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                    text,
                    options: { A: optA, B: optB, C: optC, D: optD },
                    answer: ans
                });
            }
        }
        return questions;
    }

    /** Client-side fallback generator for starter templates using SheetJS */
    function generateClientSideTemplate(type, defaultFilename) {
        if (typeof XLSX === 'undefined') {
            alert('Spreadsheet generator is not ready. Please check your internet connection.');
            return;
        }

        const wb = XLSX.utils.book_new();

        if (type === 'flashcards') {
            const fcData = [
                {
                    "Term": "Photosynthesis",
                    "Definition": "The biological process by which green plants transform light energy into chemical energy.",
                    "Category / Tag (Optional)": "Biology"
                },
                {
                    "Term": "Mitochondria",
                    "Definition": "Membrane-bound cell organelles that generate most of the chemical energy needed to power the cell (ATP).",
                    "Category / Tag (Optional)": "Cell Biology"
                },
                {
                    "Term": "Newton's First Law",
                    "Definition": "An object at rest stays at rest, and an object in motion continues in motion with the same speed and direction unless acted upon by an external force.",
                    "Category / Tag (Optional)": "Physics"
                },
                {
                    "Term": "Osmosis",
                    "Definition": "The spontaneous net movement of solvent molecules through a selectively permeable membrane into a region of higher solute concentration.",
                    "Category / Tag (Optional)": "Chemistry"
                }
            ];
            const ws = XLSX.utils.json_to_sheet(fcData);
            ws['!cols'] = [{ wch: 25 }, { wch: 60 }, { wch: 25 }];
            XLSX.utils.book_append_sheet(wb, ws, 'Flashcards');
        } else {
            const quizData = [
                {
                    "Question": "What is the SI unit of force?",
                    "Option A": "Joule",
                    "Option B": "Newton",
                    "Option C": "Watt",
                    "Option D": "Pascal",
                    "Correct Answer (A/B/C/D)": "B",
                    "Explanation / Note (Optional)": "Newton (N) is defined as 1 kg·m/s²"
                },
                {
                    "Question": "What is the acceleration due to gravity on Earth?",
                    "Option A": "9.8 m/s²",
                    "Option B": "8.9 m/s²",
                    "Option C": "10.5 m/s²",
                    "Option D": "12.0 m/s²",
                    "Correct Answer (A/B/C/D)": "A",
                    "Explanation / Note (Optional)": "Standard Earth gravity is approx 9.80665 m/s²"
                },
                {
                    "Question": "Which law states that for every action there is an equal and opposite reaction?",
                    "Option A": "Newton's 1st Law",
                    "Option B": "Newton's 2nd Law",
                    "Option C": "Newton's 3rd Law",
                    "Option D": "Law of Conservation of Energy",
                    "Correct Answer (A/B/C/D)": "C",
                    "Explanation / Note (Optional)": "Third Law of Motion"
                },
                {
                    "Question": "Which organelle is considered the powerhouse of the cell?",
                    "Option A": "Nucleus",
                    "Option B": "Mitochondria",
                    "Option C": "Ribosome",
                    "Option D": "Endoplasmic Reticulum",
                    "Correct Answer (A/B/C/D)": "B",
                    "Explanation / Note (Optional)": "Produces ATP through cellular respiration"
                }
            ];
            const ws = XLSX.utils.json_to_sheet(quizData);
            ws['!cols'] = [{ wch: 45 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 26 }, { wch: 35 }];
            XLSX.utils.book_append_sheet(wb, ws, 'Practice Quiz');
        }

        XLSX.writeFile(wb, defaultFilename);
    }

    /** Helper to download official starter templates with Blob & Client-side fallback */
    async function downloadStarterTemplate(type) {
        const apiBase = (window.MENTORAE_CONFIG && window.MENTORAE_CONFIG.API_BASE_URL)
            ? window.MENTORAE_CONFIG.API_BASE_URL
            : (window.API_BASE || 'http://localhost:5000');
        const endpoint = `${apiBase}/api/content/templates/${type === 'flashcards' ? 'flashcards' : 'quiz'}`;
        const defaultFilename = type === 'flashcards' ? 'Mentorae_Flashcards_Template.xlsx' : 'Mentorae_Practice_Quiz_Template.xlsx';

        // Find active button for visual loading feedback
        const btn = (type === 'flashcards')
            ? (document.getElementById('downloadFcTemplateBtn') || document.getElementById('qaDownloadTemplateBtn'))
            : (document.getElementById('downloadQuizTemplateBtn') || document.getElementById('qaDownloadTemplateBtn'));

        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Downloading...';
        }

        try {
            const res = await fetch(endpoint);
            if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const downloadLink = document.createElement('a');
            downloadLink.href = blobUrl;
            downloadLink.download = defaultFilename;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            setTimeout(() => {
                downloadLink.remove();
                window.URL.revokeObjectURL(blobUrl);
            }, 1000);
        } catch (err) {
            console.warn('Backend download failed or unavailable, using in-browser template generator:', err);
            generateClientSideTemplate(type, defaultFilename);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
        }
    }

    // =========================================================================
    // FLASHCARDS BULK PASTE & SPREADSHEET TAB HANDLERS
    // =========================================================================
    let bulkFcParsedCache = [];
    let fileFcParsedCache = [];

    const bulkFcTextarea = document.getElementById('bulkFcTextarea');
    const bulkFcDelimiter = document.getElementById('bulkFcDelimiter');
    const bulkFcCountBadge = document.getElementById('bulkFcCountBadge');
    const bulkFcPreviewContainer = document.getElementById('bulkFcPreviewContainer');
    const addBulkFcBtn = document.getElementById('addBulkFcBtn');
    const clearBulkFcBtn = document.getElementById('clearBulkFcBtn');

    function updateBulkFcPreview() {
        const raw = bulkFcTextarea ? bulkFcTextarea.value : '';
        const delim = bulkFcDelimiter ? bulkFcDelimiter.value : 'auto';
        bulkFcParsedCache = parseBulkFlashcards(raw, delim);

        if (bulkFcCountBadge) {
            bulkFcCountBadge.textContent = `${bulkFcParsedCache.length} card${bulkFcParsedCache.length === 1 ? '' : 's'} detected`;
            bulkFcCountBadge.className = bulkFcParsedCache.length > 0
                ? 'badge bg-success-subtle text-success border border-success-subtle rounded-pill'
                : 'badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill';
        }

        if (addBulkFcBtn) {
            addBulkFcBtn.disabled = bulkFcParsedCache.length === 0;
            addBulkFcBtn.innerHTML = `<i class="bi bi-plus-circle me-1"></i> Add ${bulkFcParsedCache.length > 0 ? bulkFcParsedCache.length : 'All'} Cards to Deck`;
        }

        if (bulkFcPreviewContainer) {
            if (bulkFcParsedCache.length === 0) {
                bulkFcPreviewContainer.innerHTML = '<span class="text-muted fst-italic">Paste or type above to see cards here...</span>';
            } else {
                bulkFcPreviewContainer.innerHTML = `<ol class="mb-0 ps-3">${bulkFcParsedCache.map(c => `
                    <li class="py-0.5">
                        <strong class="text-dark">${escapeHtml(c.term)}</strong> &mdash; <span class="text-muted">${escapeHtml(c.definition)}</span>
                    </li>
                `).join('')}</ol>`;
            }
        }
    }

    if (bulkFcTextarea) bulkFcTextarea.addEventListener('input', updateBulkFcPreview);
    if (bulkFcDelimiter) bulkFcDelimiter.addEventListener('change', updateBulkFcPreview);
    if (clearBulkFcBtn) {
        clearBulkFcBtn.addEventListener('click', () => {
            if (bulkFcTextarea) bulkFcTextarea.value = '';
            updateBulkFcPreview();
        });
    }

    if (addBulkFcBtn) {
        addBulkFcBtn.addEventListener('click', () => {
            if (bulkFcParsedCache.length === 0) return;
            newTopicRequestContent.flashcards.push(...bulkFcParsedCache);
            renderRequestFlashcards();
            const addedCount = bulkFcParsedCache.length;
            if (bulkFcTextarea) bulkFcTextarea.value = '';
            updateBulkFcPreview();

            // Switch to manual tab to see deck
            const manualTab = document.getElementById('fc-manual-tab');
            if (manualTab) bootstrap.Tab.getOrCreateInstance(manualTab).show();
            alert(`Added ${addedCount} flashcard(s) to deck.`);
        });
    }

    // Flashcards Spreadsheet Import Tab
    const downloadFcTemplateBtn = document.getElementById('downloadFcTemplateBtn');
    if (downloadFcTemplateBtn) {
        downloadFcTemplateBtn.addEventListener('click', () => downloadStarterTemplate('flashcards'));
    }

    const fcFileInput = document.getElementById('fcFileInput');
    const fcFilePreviewSection = document.getElementById('fcFilePreviewSection');
    const fcFilePreviewTbody = document.getElementById('fcFilePreviewTbody');
    const fileFcCountBadge = document.getElementById('fileFcCountBadge');
    const importFileFcBtn = document.getElementById('importFileFcBtn');
    const clearFileFcBtn = document.getElementById('clearFileFcBtn');

    if (fcFileInput) {
        fcFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const rows = await readSpreadsheetRows(file);
                fileFcParsedCache = parseFlashcardsFromSheetRows(rows);

                if (fileFcCountBadge) fileFcCountBadge.textContent = `${fileFcParsedCache.length} cards loaded`;
                if (fcFilePreviewTbody) {
                    fcFilePreviewTbody.innerHTML = fileFcParsedCache.slice(0, 50).map((c, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td class="fw-semibold text-truncate" style="max-width: 150px;">${escapeHtml(c.term)}</td>
                            <td class="text-truncate" style="max-width: 300px;">${escapeHtml(c.definition)}</td>
                        </tr>
                    `).join('');
                }
                if (fcFilePreviewSection) fcFilePreviewSection.classList.remove('d-none');
                if (importFileFcBtn) {
                    importFileFcBtn.disabled = fileFcParsedCache.length === 0;
                    importFileFcBtn.innerHTML = `<i class="bi bi-file-earmark-arrow-down me-1"></i> Import ${fileFcParsedCache.length} Cards to Deck`;
                }
            } catch (err) {
                console.error('Error parsing flashcards file:', err);
                alert('Could not read the spreadsheet file. Please ensure it is a valid .xlsx or .csv file.');
            }
        });
    }

    if (clearFileFcBtn) {
        clearFileFcBtn.addEventListener('click', () => {
            if (fcFileInput) fcFileInput.value = '';
            fileFcParsedCache = [];
            if (fcFilePreviewSection) fcFilePreviewSection.classList.add('d-none');
            if (importFileFcBtn) {
                importFileFcBtn.disabled = true;
                importFileFcBtn.innerHTML = '<i class="bi bi-file-earmark-arrow-down me-1"></i> Import Cards to Deck';
            }
        });
    }

    if (importFileFcBtn) {
        importFileFcBtn.addEventListener('click', () => {
            if (fileFcParsedCache.length === 0) return;
            newTopicRequestContent.flashcards.push(...fileFcParsedCache);
            renderRequestFlashcards();
            const addedCount = fileFcParsedCache.length;
            if (clearFileFcBtn) clearFileFcBtn.click();
            const manualTab = document.getElementById('fc-manual-tab');
            if (manualTab) bootstrap.Tab.getOrCreateInstance(manualTab).show();
            alert(`Successfully imported ${addedCount} card(s) from spreadsheet.`);
        });
    }

    // =========================================================================
    // QUIZ BULK PASTE & SPREADSHEET TAB HANDLERS
    // =========================================================================
    let bulkQuizParsedCache = [];
    let fileQuizParsedCache = [];

    const bulkQuizTextarea = document.getElementById('bulkQuizTextarea');
    const bulkQuizCountBadge = document.getElementById('bulkQuizCountBadge');
    const bulkQuizPreviewContainer = document.getElementById('bulkQuizPreviewContainer');
    const addBulkQuizBtn = document.getElementById('addBulkQuizBtn');
    const clearBulkQuizBtn = document.getElementById('clearBulkQuizBtn');
    const insertSampleQuizBtn = document.getElementById('insertSampleQuizBtn');

    function updateBulkQuizPreview() {
        const raw = bulkQuizTextarea ? bulkQuizTextarea.value : '';
        bulkQuizParsedCache = parseBulkQuiz(raw);

        if (bulkQuizCountBadge) {
            bulkQuizCountBadge.textContent = `${bulkQuizParsedCache.length} question${bulkQuizParsedCache.length === 1 ? '' : 's'} detected`;
            bulkQuizCountBadge.className = bulkQuizParsedCache.length > 0
                ? 'badge bg-success-subtle text-success border border-success-subtle rounded-pill'
                : 'badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill';
        }

        if (addBulkQuizBtn) {
            addBulkQuizBtn.disabled = bulkQuizParsedCache.length === 0;
            addBulkQuizBtn.innerHTML = `<i class="bi bi-plus-circle me-1"></i> Add ${bulkQuizParsedCache.length > 0 ? bulkQuizParsedCache.length : 'All'} Questions to Quiz`;
        }

        if (bulkQuizPreviewContainer) {
            if (bulkQuizParsedCache.length === 0) {
                bulkQuizPreviewContainer.innerHTML = '<span class="text-muted fst-italic">Paste or type questions above to see them parsed live...</span>';
            } else {
                bulkQuizPreviewContainer.innerHTML = `<ol class="mb-0 ps-3">${bulkQuizParsedCache.map(q => `
                    <li class="py-1">
                        <strong class="text-dark">${escapeHtml(q.text)}</strong>
                        <div class="micro-text text-muted mt-0.5">
                            <span class="me-2 ${q.answer === 'A' ? 'fw-bold text-success' : ''}">A: ${escapeHtml(q.options.A)}</span>
                            <span class="me-2 ${q.answer === 'B' ? 'fw-bold text-success' : ''}">B: ${escapeHtml(q.options.B)}</span>
                            ${q.options.C ? `<span class="me-2 ${q.answer === 'C' ? 'fw-bold text-success' : ''}">C: ${escapeHtml(q.options.C)}</span>` : ''}
                            ${q.options.D ? `<span class="me-2 ${q.answer === 'D' ? 'fw-bold text-success' : ''}">D: ${escapeHtml(q.options.D)}</span>` : ''}
                            <span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill ms-1">Ans: ${q.answer}</span>
                        </div>
                    </li>
                `).join('')}</ol>`;
            }
        }
    }

    if (bulkQuizTextarea) bulkQuizTextarea.addEventListener('input', updateBulkQuizPreview);
    if (clearBulkQuizBtn) {
        clearBulkQuizBtn.addEventListener('click', () => {
            if (bulkQuizTextarea) bulkQuizTextarea.value = '';
            updateBulkQuizPreview();
        });
    }

    if (insertSampleQuizBtn) {
        insertSampleQuizBtn.addEventListener('click', () => {
            if (bulkQuizTextarea) {
                bulkQuizTextarea.value = `1. What is the SI unit of force?\nA. Joule\nB. Newton\nC. Watt\nD. Pascal\nAnswer: B\n\n2. What is the acceleration due to gravity on Earth?\nA. 9.8 m/s^2\nB. 8.9 m/s^2\nC. 10.5 m/s^2\nD. 12.0 m/s^2\nAnswer: A\n\n3. Which law states that for every action there is an equal and opposite reaction?\nA. Newton's 1st Law\nB. Newton's 2nd Law\nC. Newton's 3rd Law\nD. Law of Conservation of Energy\nAnswer: C`;
                updateBulkQuizPreview();
            }
        });
    }

    if (addBulkQuizBtn) {
        addBulkQuizBtn.addEventListener('click', () => {
            if (bulkQuizParsedCache.length === 0) return;
            newTopicRequestContent.quiz.push(...bulkQuizParsedCache);
            renderRequestQuiz();
            const addedCount = bulkQuizParsedCache.length;
            if (bulkQuizTextarea) bulkQuizTextarea.value = '';
            updateBulkQuizPreview();

            // Switch to single tab to view questions
            const manualTab = document.getElementById('quiz-manual-tab');
            if (manualTab) bootstrap.Tab.getOrCreateInstance(manualTab).show();
            alert(`Added ${addedCount} practice question(s) to quiz.`);
        });
    }

    // Quiz Spreadsheet Import Tab
    const downloadQuizTemplateBtn = document.getElementById('downloadQuizTemplateBtn');
    if (downloadQuizTemplateBtn) {
        downloadQuizTemplateBtn.addEventListener('click', () => downloadStarterTemplate('quiz'));
    }

    const quizFileInput = document.getElementById('quizFileInput');
    const quizFilePreviewSection = document.getElementById('quizFilePreviewSection');
    const quizFilePreviewTbody = document.getElementById('quizFilePreviewTbody');
    const fileQuizCountBadge = document.getElementById('fileQuizCountBadge');
    const importFileQuizBtn = document.getElementById('importFileQuizBtn');
    const clearFileQuizBtn = document.getElementById('clearFileQuizBtn');

    if (quizFileInput) {
        quizFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const rows = await readSpreadsheetRows(file);
                fileQuizParsedCache = parseQuizFromSheetRows(rows);

                if (fileQuizCountBadge) fileQuizCountBadge.textContent = `${fileQuizParsedCache.length} questions loaded`;
                if (quizFilePreviewTbody) {
                    quizFilePreviewTbody.innerHTML = fileQuizParsedCache.slice(0, 50).map((q, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td class="text-truncate" style="max-width: 180px;">${escapeHtml(q.text)}</td>
                            <td class="text-truncate" style="max-width: 90px;">${escapeHtml(q.options.A)}</td>
                            <td class="text-truncate" style="max-width: 90px;">${escapeHtml(q.options.B)}</td>
                            <td class="text-truncate" style="max-width: 90px;">${escapeHtml(q.options.C)}</td>
                            <td class="text-truncate" style="max-width: 90px;">${escapeHtml(q.options.D)}</td>
                            <td><span class="badge bg-success-subtle text-success">${q.answer}</span></td>
                        </tr>
                    `).join('');
                }
                if (quizFilePreviewSection) quizFilePreviewSection.classList.remove('d-none');
                if (importFileQuizBtn) {
                    importFileQuizBtn.disabled = fileQuizParsedCache.length === 0;
                    importFileQuizBtn.innerHTML = `<i class="bi bi-file-earmark-arrow-down me-1"></i> Import ${fileQuizParsedCache.length} Questions to Quiz`;
                }
            } catch (err) {
                console.error('Error parsing quiz file:', err);
                alert('Could not read the spreadsheet file. Please ensure it is a valid .xlsx or .csv file.');
            }
        });
    }

    if (clearFileQuizBtn) {
        clearFileQuizBtn.addEventListener('click', () => {
            if (quizFileInput) quizFileInput.value = '';
            fileQuizParsedCache = [];
            if (quizFilePreviewSection) quizFilePreviewSection.classList.add('d-none');
            if (importFileQuizBtn) {
                importFileQuizBtn.disabled = true;
                importFileQuizBtn.innerHTML = '<i class="bi bi-file-earmark-arrow-down me-1"></i> Import Questions to Quiz';
            }
        });
    }

    if (importFileQuizBtn) {
        importFileQuizBtn.addEventListener('click', () => {
            if (fileQuizParsedCache.length === 0) return;
            newTopicRequestContent.quiz.push(...fileQuizParsedCache);
            renderRequestQuiz();
            const addedCount = fileQuizParsedCache.length;
            if (clearFileQuizBtn) clearFileQuizBtn.click();
            const manualTab = document.getElementById('quiz-manual-tab');
            if (manualTab) bootstrap.Tab.getOrCreateInstance(manualTab).show();
            alert(`Successfully imported ${addedCount} practice question(s) from spreadsheet.`);
        });
    }

    // =========================================================================
    // CONTENT MANAGEMENT MODAL SAFEGUARDS & "DONE" CONFIRMATION HANDLERS
    // =========================================================================
    let quizSessionSnapshot = null;
    let isQuizDoneConfirmed = false;

    let flashcardSessionSnapshot = null;
    let isFlashcardDoneConfirmed = false;

    let filesSessionSnapshot = null;
    let isFilesDoneConfirmed = false;

    /** Updates button count indicators on the Add Topic / Recommendation modal */
    function updateRequestContentButtons() {
        const fileBtn = document.querySelector('.manage-request-content-btn[data-type="file"]');
        if (fileBtn) {
            const count = newTopicRequestContent?.files?.length || 0;
            fileBtn.innerHTML = count > 0
                ? `<i class="bi bi-folder2-open me-1"></i> Manage Files <span class="badge bg-secondary ms-1">${count}</span>`
                : `<i class="bi bi-folder2-open me-1"></i> Manage Files`;
        }

        const quizBtn = document.querySelector('.manage-request-content-btn[data-type="quiz"]');
        if (quizBtn) {
            const count = newTopicRequestContent?.quiz?.length || 0;
            quizBtn.innerHTML = count > 0
                ? `<i class="bi bi-question-circle me-1"></i> Manage Quiz <span class="badge bg-success ms-1">${count}</span>`
                : `<i class="bi bi-question-circle me-1"></i> Manage Quiz`;
        }

        const fcBtn = document.querySelector('.manage-request-content-btn[data-type="flashcards"]');
        if (fcBtn) {
            const count = newTopicRequestContent?.flashcards?.length || 0;
            fcBtn.innerHTML = count > 0
                ? `<i class="bi bi-stack me-1"></i> Manage Flashcards <span class="badge bg-primary ms-1">${count}</span>`
                : `<i class="bi bi-stack me-1"></i> Manage Flashcards`;
        }
    }

    /** Change detection for Practice Quiz modal */
    function hasQuizModalChanges() {
        const currentQuiz = newTopicRequestContent?.quiz || [];
        const snapshot = quizSessionSnapshot || [];
        if (currentQuiz.length !== snapshot.length) return true;
        if (JSON.stringify(currentQuiz) !== JSON.stringify(snapshot)) return true;

        const qText = (document.getElementById('requestQuizQuestionText')?.value || '').trim();
        const optA = (document.getElementById('requestQuizOptionA')?.value || '').trim();
        const optB = (document.getElementById('requestQuizOptionB')?.value || '').trim();
        const optC = (document.getElementById('requestQuizOptionC')?.value || '').trim();
        const optD = (document.getElementById('requestQuizOptionD')?.value || '').trim();
        if (qText || optA || optB || optC || optD) return true;

        const bulkText = (bulkQuizTextarea?.value || '').trim();
        if (bulkText || (bulkQuizParsedCache && bulkQuizParsedCache.length > 0)) return true;

        if ((quizFileInput?.files && quizFileInput.files.length > 0) || (fileQuizParsedCache && fileQuizParsedCache.length > 0)) return true;

        return false;
    }

    /** Change detection for Flashcards modal */
    function hasFlashcardModalChanges() {
        const currentFc = newTopicRequestContent?.flashcards || [];
        const snapshot = flashcardSessionSnapshot || [];
        if (currentFc.length !== snapshot.length) return true;
        if (JSON.stringify(currentFc) !== JSON.stringify(snapshot)) return true;

        const term = (document.getElementById('requestFlashcardTerm')?.value || '').trim();
        const def = (document.getElementById('requestFlashcardDefinition')?.value || '').trim();
        if (term || def) return true;

        const bulkText = (bulkFcTextarea?.value || '').trim();
        if (bulkText || (bulkFcParsedCache && bulkFcParsedCache.length > 0)) return true;

        if ((fcFileInput?.files && fcFileInput.files.length > 0) || (fileFcParsedCache && fileFcParsedCache.length > 0)) return true;

        return false;
    }

    /** Change detection for Files modal */
    function hasFilesModalChanges() {
        const currentFiles = newTopicRequestContent?.files || [];
        const snapshot = filesSessionSnapshot || [];
        if (currentFiles.length !== snapshot.length) return true;
        if (JSON.stringify(currentFiles) !== JSON.stringify(snapshot)) return true;

        if (document.getElementById('requestFileInput')?.files?.length > 0) return true;

        return false;
    }

    // Modal life-cycle event listeners for Practice Quiz
    if (requestContentQuizModalEl) {
        requestContentQuizModalEl.addEventListener('show.bs.modal', () => {
            isQuizDoneConfirmed = false;
            quizSessionSnapshot = JSON.parse(JSON.stringify(newTopicRequestContent?.quiz || []));
        });

        requestContentQuizModalEl.addEventListener('hide.bs.modal', (event) => {
            if (isQuizDoneConfirmed) return;
            if (hasQuizModalChanges()) {
                const confirmDiscard = confirm(
                    'You have unsaved changes in your practice quiz that have not been finalized with the Done button.\n\nAre you sure you want to discard your changes and close?'
                );
                if (!confirmDiscard) {
                    event.preventDefault();
                    return;
                }
                // Revert back to snapshot if user confirmed discard
                if (quizSessionSnapshot) {
                    newTopicRequestContent.quiz = JSON.parse(JSON.stringify(quizSessionSnapshot));
                }
                document.getElementById('requestQuizForm')?.reset();
                if (clearBulkQuizBtn) clearBulkQuizBtn.click();
                if (clearFileQuizBtn) clearFileQuizBtn.click();
                renderRequestQuiz();
                updateRequestContentButtons();
            }
        });

        requestContentQuizModalEl.addEventListener('hidden.bs.modal', () => {
            isQuizDoneConfirmed = false;
            quizSessionSnapshot = null;
        });
    }

    // Modal life-cycle event listeners for Flashcards
    if (requestContentFlashcardModalEl) {
        requestContentFlashcardModalEl.addEventListener('show.bs.modal', () => {
            isFlashcardDoneConfirmed = false;
            flashcardSessionSnapshot = JSON.parse(JSON.stringify(newTopicRequestContent?.flashcards || []));
        });

        requestContentFlashcardModalEl.addEventListener('hide.bs.modal', (event) => {
            if (isFlashcardDoneConfirmed) return;
            if (hasFlashcardModalChanges()) {
                const confirmDiscard = confirm(
                    'You have unsaved changes in your flashcards that have not been finalized with the Done button.\n\nAre you sure you want to discard your changes and close?'
                );
                if (!confirmDiscard) {
                    event.preventDefault();
                    return;
                }
                // Revert back to snapshot if user confirmed discard
                if (flashcardSessionSnapshot) {
                    newTopicRequestContent.flashcards = JSON.parse(JSON.stringify(flashcardSessionSnapshot));
                }
                document.getElementById('requestFlashcardForm')?.reset();
                if (clearBulkFcBtn) clearBulkFcBtn.click();
                if (clearFileFcBtn) clearFileFcBtn.click();
                renderRequestFlashcards();
                updateRequestContentButtons();
            }
        });

        requestContentFlashcardModalEl.addEventListener('hidden.bs.modal', () => {
            isFlashcardDoneConfirmed = false;
            flashcardSessionSnapshot = null;
        });
    }

    // Modal life-cycle event listeners for Files
    if (requestContentFileModalEl) {
        requestContentFileModalEl.addEventListener('show.bs.modal', () => {
            isFilesDoneConfirmed = false;
            filesSessionSnapshot = JSON.parse(JSON.stringify(newTopicRequestContent?.files || []));
        });

        requestContentFileModalEl.addEventListener('hide.bs.modal', (event) => {
            if (isFilesDoneConfirmed) return;
            if (hasFilesModalChanges()) {
                const confirmDiscard = confirm(
                    'You have unsaved changes in your uploaded files that have not been finalized with the Done button.\n\nAre you sure you want to discard your changes and close?'
                );
                if (!confirmDiscard) {
                    event.preventDefault();
                    return;
                }
                // Revert back to snapshot if user confirmed discard
                if (filesSessionSnapshot) {
                    newTopicRequestContent.files = JSON.parse(JSON.stringify(filesSessionSnapshot));
                }
                document.getElementById('requestFileUploadForm')?.reset();
                renderRequestFiles();
                updateRequestContentButtons();
            }
        });

        requestContentFileModalEl.addEventListener('hidden.bs.modal', () => {
            isFilesDoneConfirmed = false;
            filesSessionSnapshot = null;
        });
    }

    // Done button handlers
    const quizDoneBtn = document.getElementById('quizDoneBtn');
    if (quizDoneBtn) {
        quizDoneBtn.addEventListener('click', () => {
            // Check for unadded single question draft
            const qText = (document.getElementById('requestQuizQuestionText')?.value || '').trim();
            const optA = (document.getElementById('requestQuizOptionA')?.value || '').trim();
            const optB = (document.getElementById('requestQuizOptionB')?.value || '').trim();
            const optC = (document.getElementById('requestQuizOptionC')?.value || '').trim();
            const optD = (document.getElementById('requestQuizOptionD')?.value || '').trim();
            const ans = document.getElementById('requestQuizCorrectAnswer')?.value || 'A';

            if (qText) {
                if (optA && optB) {
                    const wantToAdd = confirm('You entered a question in the form that has not been added to the list. Would you like to add it before finishing?');
                    if (wantToAdd) {
                        newTopicRequestContent.quiz.push({
                            id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                            text: qText,
                            options: { A: optA, B: optB, C: optC, D: optD },
                            answer: ans
                        });
                        renderRequestQuiz();
                        document.getElementById('requestQuizForm')?.reset();
                    } else {
                        document.getElementById('requestQuizForm')?.reset();
                    }
                } else {
                    const discardDraft = confirm('The question currently typed in the form is incomplete (Option A and B are required). Discard this draft and continue?');
                    if (!discardDraft) return;
                    document.getElementById('requestQuizForm')?.reset();
                }
            }

            // Check for unimported bulk paste
            if (bulkQuizParsedCache && bulkQuizParsedCache.length > 0) {
                const wantBulk = confirm(`You have ${bulkQuizParsedCache.length} parsed question(s) in Bulk Paste. Would you like to add them to your quiz before finishing?`);
                if (wantBulk) {
                    newTopicRequestContent.quiz.push(...bulkQuizParsedCache);
                    renderRequestQuiz();
                    if (clearBulkQuizBtn) clearBulkQuizBtn.click();
                }
            }

            // Check for unimported spreadsheet file
            if (fileQuizParsedCache && fileQuizParsedCache.length > 0) {
                const wantFile = confirm(`You have ${fileQuizParsedCache.length} parsed question(s) from your spreadsheet. Would you like to add them to your quiz before finishing?`);
                if (wantFile) {
                    newTopicRequestContent.quiz.push(...fileQuizParsedCache);
                    renderRequestQuiz();
                    if (clearFileQuizBtn) clearFileQuizBtn.click();
                }
            }

            isQuizDoneConfirmed = true;
            updateRequestContentButtons();
            if (requestContentQuizModal) requestContentQuizModal.hide();
        });
    }

    const flashcardDoneBtn = document.getElementById('flashcardDoneBtn');
    if (flashcardDoneBtn) {
        flashcardDoneBtn.addEventListener('click', () => {
            // Check for unadded single card draft
            const term = (document.getElementById('requestFlashcardTerm')?.value || '').trim();
            const def = (document.getElementById('requestFlashcardDefinition')?.value || '').trim();

            if (term || def) {
                const wantToAdd = confirm('You entered a flashcard in the form that has not been added to the deck. Would you like to add it before finishing?');
                if (wantToAdd) {
                    newTopicRequestContent.flashcards.push({
                        id: `fc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        term: term || 'Untitled Term',
                        definition: def || 'No definition provided.'
                    });
                    renderRequestFlashcards();
                    document.getElementById('requestFlashcardForm')?.reset();
                } else {
                    document.getElementById('requestFlashcardForm')?.reset();
                }
            }

            // Check for unimported bulk paste
            if (bulkFcParsedCache && bulkFcParsedCache.length > 0) {
                const wantBulk = confirm(`You have ${bulkFcParsedCache.length} parsed card(s) in Bulk Paste. Would you like to add them to your deck before finishing?`);
                if (wantBulk) {
                    newTopicRequestContent.flashcards.push(...bulkFcParsedCache);
                    renderRequestFlashcards();
                    if (clearBulkFcBtn) clearBulkFcBtn.click();
                }
            }

            // Check for unimported spreadsheet file
            if (fileFcParsedCache && fileFcParsedCache.length > 0) {
                const wantFile = confirm(`You have ${fileFcParsedCache.length} parsed card(s) from your spreadsheet. Would you like to add them to your deck before finishing?`);
                if (wantFile) {
                    newTopicRequestContent.flashcards.push(...fileFcParsedCache);
                    renderRequestFlashcards();
                    if (clearFileFcBtn) clearFileFcBtn.click();
                }
            }

            isFlashcardDoneConfirmed = true;
            updateRequestContentButtons();
            if (requestContentFlashcardModal) requestContentFlashcardModal.hide();
        });
    }

    const filesDoneBtn = document.getElementById('filesDoneBtn');
    if (filesDoneBtn) {
        filesDoneBtn.addEventListener('click', () => {
            isFilesDoneConfirmed = true;
            updateRequestContentButtons();
            if (requestContentFileModal) requestContentFileModal.hide();
        });
    }

    // =========================================================================
    // QUICK APPEND CONTENT TO EXISTING TOPIC MODAL HANDLERS
    // =========================================================================
    const quickAppendModalEl = document.getElementById('quickAppendModal');
    const quickAppendModal = quickAppendModalEl ? new bootstrap.Modal(quickAppendModalEl) : null;
    const quickAppendTopicTitle = document.getElementById('quickAppendTopicTitle');
    const quickAppendTopicId = document.getElementById('quickAppendTopicId');
    const quickAppendTopicType = document.getElementById('quickAppendTopicType');
    const quickAppendRecIndex = document.getElementById('quickAppendRecIndex');

    const qaPasteTextarea = document.getElementById('qaPasteTextarea');
    const qaParsedBadge = document.getElementById('qaParsedBadge');
    const qaPreviewContainer = document.getElementById('qaPreviewContainer');
    const qaPasteHint = document.getElementById('qaPasteHint');
    const qaDelimiterContainer = document.getElementById('qaDelimiterContainer');
    const qaFcDelimiter = document.getElementById('qaFcDelimiter');
    const qaSubmitBtn = document.getElementById('qaSubmitBtn');
    const qaClearPasteBtn = document.getElementById('qaClearPasteBtn');

    const qaDownloadTemplateBtn = document.getElementById('qaDownloadTemplateBtn');
    const qaFileInput = document.getElementById('qaFileInput');
    const qaFilePreviewSection = document.getElementById('qaFilePreviewSection');
    const qaFilePreviewTbody = document.getElementById('qaFilePreviewTbody');
    const qaFileParsedBadge = document.getElementById('qaFileParsedBadge');
    const qaClearFileBtn = document.getElementById('qaClearFileBtn');

    let qaParsedItemsCache = [];
    let qaFileItemsCache = [];
    let currentQaActiveTab = 'paste'; // 'paste' or 'file'

    function getSelectedQaContentType() {
        const checked = document.querySelector('input[name="quickAppendContentType"]:checked');
        return checked ? checked.value : 'flashcards';
    }

    function syncQaModalUiForContentType() {
        const type = getSelectedQaContentType();
        if (type === 'flashcards') {
            if (qaPasteHint) qaPasteHint.textContent = 'Paste cards one per line (Term - Definition).';
            if (qaDelimiterContainer) qaDelimiterContainer.classList.remove('d-none');
            if (qaPasteTextarea) {
                qaPasteTextarea.placeholder = "Photosynthesis - The process of producing nutrients using sunlight\nMitochondria - Powerhouse of the cell producing ATP\nKinematics - Study of motion without forces";
            }
            if (qaDownloadTemplateBtn) qaDownloadTemplateBtn.textContent = 'Download Flashcards Template (.xlsx)';
        } else {
            if (qaPasteHint) qaPasteHint.textContent = 'Supports numbered questions (A. B. C. D. Answer: X) or tab-separated columns.';
            if (qaDelimiterContainer) qaDelimiterContainer.classList.add('d-none');
            if (qaPasteTextarea) {
                qaPasteTextarea.placeholder = "1. What is the SI unit of force?\nA. Joule\nB. Newton\nC. Watt\nD. Pascal\nAnswer: B";
            }
            if (qaDownloadTemplateBtn) qaDownloadTemplateBtn.textContent = 'Download Practice Quiz Template (.xlsx)';
        }
        updateQaPastePreview();
    }

    function updateQaPastePreview() {
        const type = getSelectedQaContentType();
        const raw = qaPasteTextarea ? qaPasteTextarea.value : '';
        const delim = qaFcDelimiter ? qaFcDelimiter.value : 'auto';

        if (type === 'flashcards') {
            qaParsedItemsCache = parseBulkFlashcards(raw, delim);
        } else {
            qaParsedItemsCache = parseBulkQuiz(raw);
        }

        const count = qaParsedItemsCache.length;
        if (qaParsedBadge) {
            qaParsedBadge.textContent = `${count} ${type === 'flashcards' ? 'card' : 'question'}${count === 1 ? '' : 's'} detected`;
            qaParsedBadge.className = count > 0
                ? 'badge bg-success-subtle text-success border border-success-subtle rounded-pill'
                : 'badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill';
        }

        if (qaPreviewContainer) {
            if (count === 0) {
                qaPreviewContainer.innerHTML = '<span class="text-muted fst-italic">Parsed preview will display here...</span>';
            } else if (type === 'flashcards') {
                qaPreviewContainer.innerHTML = `<ol class="mb-0 ps-3">${qaParsedItemsCache.map(c => `
                    <li class="py-0.5"><strong>${escapeHtml(c.term)}</strong> &mdash; <span class="text-muted">${escapeHtml(c.definition)}</span></li>
                `).join('')}</ol>`;
            } else {
                qaPreviewContainer.innerHTML = `<ol class="mb-0 ps-3">${qaParsedItemsCache.map(q => `
                    <li class="py-0.5"><strong>${escapeHtml(q.text)}</strong> <span class="badge bg-success-subtle text-success ms-1">Ans: ${q.answer}</span></li>
                `).join('')}</ol>`;
            }
        }

        syncQaSubmitButtonState();
    }

    function syncQaSubmitButtonState() {
        if (!qaSubmitBtn) return;
        const count = currentQaActiveTab === 'paste' ? qaParsedItemsCache.length : qaFileItemsCache.length;
        const type = getSelectedQaContentType();
        qaSubmitBtn.disabled = count === 0;
        qaSubmitBtn.innerHTML = `<i class="bi bi-plus-circle me-1"></i> Append ${count > 0 ? count : ''} ${type === 'flashcards' ? 'Card' : 'Question'}${count === 1 ? '' : 's'} to Topic`;
    }

    document.querySelectorAll('input[name="quickAppendContentType"]').forEach(radio => {
        radio.addEventListener('change', () => {
            syncQaModalUiForContentType();
            // Also reset file parsing if file is loaded
            if (qaFileInput && qaFileInput.files.length > 0) {
                qaFileInput.dispatchEvent(new Event('change'));
            }
        });
    });

    if (qaPasteTextarea) qaPasteTextarea.addEventListener('input', updateQaPastePreview);
    if (qaFcDelimiter) qaFcDelimiter.addEventListener('change', updateQaPastePreview);
    if (qaClearPasteBtn) {
        qaClearPasteBtn.addEventListener('click', () => {
            if (qaPasteTextarea) qaPasteTextarea.value = '';
            updateQaPastePreview();
        });
    }

    if (qaDownloadTemplateBtn) {
        qaDownloadTemplateBtn.addEventListener('click', () => {
            downloadStarterTemplate(getSelectedQaContentType());
        });
    }

    const qaTabs = document.getElementById('quickAppendTabs');
    if (qaTabs) {
        qaTabs.addEventListener('shown.bs.tab', (e) => {
            if (e.target.id === 'qa-file-tab') {
                currentQaActiveTab = 'file';
            } else {
                currentQaActiveTab = 'paste';
            }
            syncQaSubmitButtonState();
        });
    }

    if (qaFileInput) {
        qaFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const type = getSelectedQaContentType();
            try {
                const rows = await readSpreadsheetRows(file);
                qaFileItemsCache = (type === 'flashcards') ? parseFlashcardsFromSheetRows(rows) : parseQuizFromSheetRows(rows);

                if (qaFileParsedBadge) qaFileParsedBadge.textContent = `${qaFileItemsCache.length} items parsed`;
                if (qaFilePreviewTbody) {
                    if (type === 'flashcards') {
                        qaFilePreviewTbody.innerHTML = qaFileItemsCache.slice(0, 30).map((c, i) => `
                            <tr>
                                <td style="width: 30px;">${i + 1}</td>
                                <td class="fw-semibold text-truncate" style="max-width: 140px;">${escapeHtml(c.term)}</td>
                                <td class="text-truncate">${escapeHtml(c.definition)}</td>
                            </tr>
                        `).join('');
                    } else {
                        qaFilePreviewTbody.innerHTML = qaFileItemsCache.slice(0, 30).map((q, i) => `
                            <tr>
                                <td style="width: 30px;">${i + 1}</td>
                                <td class="text-truncate" style="max-width: 200px;">${escapeHtml(q.text)}</td>
                                <td style="width: 50px;"><span class="badge bg-success-subtle text-success">${q.answer}</span></td>
                            </tr>
                        `).join('');
                    }
                }
                if (qaFilePreviewSection) qaFilePreviewSection.classList.remove('d-none');
                syncQaSubmitButtonState();
            } catch (err) {
                console.error('Error in Quick Append file parsing:', err);
                alert('Failed to parse spreadsheet. Please ensure it is a valid .xlsx or .csv file.');
            }
        });
    }

    if (qaClearFileBtn) {
        qaClearFileBtn.addEventListener('click', () => {
            if (qaFileInput) qaFileInput.value = '';
            qaFileItemsCache = [];
            if (qaFilePreviewSection) qaFilePreviewSection.classList.add('d-none');
            syncQaSubmitButtonState();
        });
    }

    // Trigger opening Quick Append modal from topic cards
    document.addEventListener('click', (e) => {
        const appendTopicBtn = e.target.closest('.btn-quick-append-content');
        if (appendTopicBtn) {
            const topicId = appendTopicBtn.dataset.topicId || '';
            const topicIndex = appendTopicBtn.dataset.topicIndex;
            const topicTitle = appendTopicBtn.dataset.topicTitle || 'Topic';

            if (quickAppendTopicTitle) quickAppendTopicTitle.textContent = topicTitle;
            if (quickAppendTopicId) quickAppendTopicId.value = topicId;
            if (quickAppendTopicType) quickAppendTopicType.value = 'topic';
            if (quickAppendRecIndex) quickAppendRecIndex.value = topicIndex || '';

            // Reset modal state
            if (qaPasteTextarea) qaPasteTextarea.value = '';
            if (qaClearFileBtn) qaClearFileBtn.click();
            syncQaModalUiForContentType();

            if (quickAppendModal) quickAppendModal.show();
            return;
        }

        const appendRecBtn = e.target.closest('.quick-append-rec-btn');
        if (appendRecBtn) {
            const recIndex = appendRecBtn.dataset.recIndex;
            const recId = appendRecBtn.dataset.recId || '';
            const recTitle = appendRecBtn.dataset.recTitle || 'Teacher Recommendation';

            if (quickAppendTopicTitle) quickAppendTopicTitle.textContent = recTitle;
            if (quickAppendTopicId) quickAppendTopicId.value = recId;
            if (quickAppendTopicType) quickAppendTopicType.value = 'recommendation';
            if (quickAppendRecIndex) quickAppendRecIndex.value = recIndex;

            // Reset modal state
            if (qaPasteTextarea) qaPasteTextarea.value = '';
            if (qaClearFileBtn) qaClearFileBtn.click();
            syncQaModalUiForContentType();

            if (quickAppendModal) quickAppendModal.show();
            return;
        }
    });

    // Handle Quick Append Submit Action
    if (qaSubmitBtn) {
        qaSubmitBtn.addEventListener('click', async () => {
            const itemsToAppend = currentQaActiveTab === 'paste' ? qaParsedItemsCache : qaFileItemsCache;
            if (itemsToAppend.length === 0) return;

            const type = getSelectedQaContentType();
            const topicId = quickAppendTopicId ? quickAppendTopicId.value : '';
            const topicType = quickAppendTopicType ? quickAppendTopicType.value : 'topic';
            const recIdx = quickAppendRecIndex ? parseInt(quickAppendRecIndex.value, 10) : -1;
            const token = localStorage.getItem('mentorae_token');

            qaSubmitBtn.disabled = true;
            qaSubmitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Appending...';

            try {
                // If this is a server-persisted topic with an ID
                if (topicId) {
                    const payload = (type === 'flashcards')
                        ? { flashcards: itemsToAppend }
                        : { quiz: itemsToAppend };

                    const res = await authedFetch(`/api/content/topics/${topicId}/append-content`, token, {
                        method: 'POST',
                        body: JSON.stringify(payload)
                    });

                    if (res && res.success) {
                        alert(res.message || `Successfully appended ${itemsToAppend.length} items.`);
                        await fetchTopicsFromDb();
                        isQuickAppendSubmitted = true;
                        if (quickAppendModal) quickAppendModal.hide();
                    } else {
                        alert(res.message || 'Failed to append content to topic.');
                    }
                } else if (topicType === 'recommendation' && recIdx >= 0 && currentSubject && currentSubject.recommendations) {
                    // Update in local subject recommendation object
                    const targetRec = currentSubject.recommendations[recIdx];
                    if (targetRec) {
                        if (type === 'flashcards') {
                            targetRec.flashcards = [...(targetRec.flashcards || []), ...itemsToAppend];
                            if (!targetRec.resources) targetRec.resources = [];
                            if (!targetRec.resources.includes('Flashcards')) targetRec.resources.push('Flashcards');
                        } else {
                            targetRec.quiz = [...(targetRec.quiz || []), ...itemsToAppend];
                            if (!targetRec.resources) targetRec.resources = [];
                            if (!targetRec.resources.includes('Practice Quiz')) targetRec.resources.push('Practice Quiz');
                        }
                        saveSubjects(allSubjects);
                        renderRecommendations(currentSubject.recommendations);
                        alert(`Successfully added ${itemsToAppend.length} items to recommendation.`);
                        isQuickAppendSubmitted = true;
                        if (quickAppendModal) quickAppendModal.hide();
                    }
                } else {
                    alert('Topic identifier not found. Please refresh the page and try again.');
                }
            } catch (err) {
                console.error('Error appending content to topic:', err);
                alert('Could not append content to topic. Please check your network connection.');
            } finally {
                qaSubmitBtn.disabled = false;
                syncQaSubmitButtonState();
            }
        });
    }

    let isQuickAppendSubmitted = false;
    if (quickAppendModalEl) {
        quickAppendModalEl.addEventListener('hide.bs.modal', (event) => {
            if (isQuickAppendSubmitted) return;
            const hasText = (qaPasteTextarea?.value || '').trim().length > 0;
            const hasFile = (qaFileInput?.files?.length || 0) > 0;
            const hasParsed = (qaParsedItemsCache?.length || 0) > 0 || (qaFileItemsCache?.length || 0) > 0;
            if (hasText || hasFile || hasParsed) {
                const confirmDiscard = confirm('You have unsaved content in this window. Are you sure you want to discard it and close?');
                if (!confirmDiscard) {
                    event.preventDefault();
                    return;
                }
                if (qaPasteTextarea) qaPasteTextarea.value = '';
                if (qaClearFileBtn) qaClearFileBtn.click();
            }
        });

        quickAppendModalEl.addEventListener('hidden.bs.modal', () => {
            isQuickAppendSubmitted = false;
        });
    }

    // ==========================================
    // PRACTICE QUIZ RESULTS & ANALYTICS MODAL
    // ==========================================
    let currentQuizResultsData = null;
    let quizResultsModalInstance = null;

    function initClassQuizResultsModal() {
        const modalEl = document.getElementById('classQuizResultsModal');
        if (!modalEl) return;
        quizResultsModalInstance = new bootstrap.Modal(modalEl);

        const searchInput = document.getElementById('quizStudentSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                filterAndRenderQuizStudents(searchInput.value.trim().toLowerCase());
            });
        }
    }

    async function openClassQuizResults(topicTitle, topicId) {
        const modalEl = document.getElementById('classQuizResultsModal');
        if (!modalEl) return;
        if (!quizResultsModalInstance) {
            quizResultsModalInstance = new bootstrap.Modal(modalEl);
        }

        const subheader = document.getElementById('classQuizResultsSubheader');
        if (subheader) {
            subheader.textContent = `Topic: "${topicTitle}" • Subject: ${decodedSubjectName}${currentSectionContext ? ' • Section: ' + currentSectionContext : ''}`;
        }

        const tbody = document.getElementById('classQuizStudentsTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm text-success me-2" role="status"></div>Loading student quiz results...</td></tr>';
        }

        // Reset stats
        document.getElementById('quizStatStudentsCount').textContent = '0';
        document.getElementById('quizStatAvgPercentage').textContent = '0%';
        document.getElementById('quizStatPassRate').textContent = '0%';
        document.getElementById('quizStatHighestScore').textContent = '0';
        document.getElementById('quizStudentCountDisplay').textContent = 'Showing 0 students';

        quizResultsModalInstance.show();

        const token = localStorage.getItem('mentorae_token');
        if (!token) return;

        try {
            let url = `/api/content/topic-quiz/class-results?subjectName=${encodeURIComponent(decodedSubjectName)}&topicTitle=${encodeURIComponent(topicTitle)}`;
            if (currentSectionContext && currentSectionContext !== 'all') {
                url += `&sectionName=${encodeURIComponent(currentSectionContext)}`;
            }

            const data = await authedFetch(url, token);
            if (data && data.success) {
                currentQuizResultsData = data;
                // Render stats
                document.getElementById('quizStatStudentsCount').textContent = data.stats.totalStudents || 0;
                document.getElementById('quizStatAvgPercentage').textContent = `${data.stats.averagePercentage || 0}%`;
                document.getElementById('quizStatPassRate').textContent = `${data.stats.passRate || 0}%`;
                document.getElementById('quizStatHighestScore').textContent = `${data.stats.highestScore || 0} / ${data.stats.totalQuestions || 0}`;

                filterAndRenderQuizStudents('');
            } else {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">${escapeHtml(data?.message || 'Failed to load results.')}</td></tr>`;
            }
        } catch (err) {
            console.error('Error fetching class quiz results:', err);
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4">Failed to load quiz results from server.</td></tr>';
            }
        }
    }

    function filterAndRenderQuizStudents(query) {
        const tbody = document.getElementById('classQuizStudentsTableBody');
        const countDisplay = document.getElementById('quizStudentCountDisplay');
        if (!tbody || !currentQuizResultsData) return;

        let list = currentQuizResultsData.students || [];
        if (query) {
            list = list.filter(s =>
                (s.name && s.name.toLowerCase().includes(query)) ||
                (s.lrn && s.lrn.toLowerCase().includes(query)) ||
                (s.sectionName && s.sectionName.toLowerCase().includes(query))
            );
        }

        if (countDisplay) {
            countDisplay.textContent = `Showing ${list.length} student${list.length === 1 ? '' : 's'}`;
        }

        if (list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted py-4">
                        <i class="bi bi-person-x fs-2 d-block mb-1 opacity-50"></i>
                        ${query ? 'No matching students found.' : 'No students in this section have taken this practice quiz yet.'}
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = list.map(s => {
            const dt = s.lastTakenAt ? new Date(s.lastTakenAt) : null;
            const dateStr = dt ? `${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` : 'N/A';

            let statusBadge = '';
            if (s.bestPercentage >= 80) {
                statusBadge = '<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2.5 py-1 fw-semibold"><i class="bi bi-star-fill me-1"></i>Mastered</span>';
            } else if (s.bestPercentage >= 60) {
                statusBadge = '<span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2.5 py-1 fw-semibold"><i class="bi bi-check-circle me-1"></i>Passed</span>';
            } else {
                statusBadge = '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill px-2.5 py-1 fw-semibold"><i class="bi bi-arrow-repeat me-1"></i>Needs Practice</span>';
            }

            const initials = (s.name || 'S')
                .split(' ')
                .map(n => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();

            return `
                <tr>
                    <td class="ps-3">
                        <div class="d-flex align-items-center gap-2">
                            <div class="rounded-circle bg-success text-white d-flex align-items-center justify-content-center fw-bold flex-shrink-0" style="width: 32px; height: 32px; font-size: 0.8rem;">
                                ${initials}
                            </div>
                            <div>
                                <span class="fw-semibold text-dark d-block">${escapeHtml(s.name)}</span>
                                <span class="micro-text text-muted">${escapeHtml(s.email || '')}</span>
                            </div>
                        </div>
                    </td>
                    <td class="font-monospace small text-secondary">${escapeHtml(s.lrn || 'N/A')}</td>
                    <td class="small text-dark">${escapeHtml(s.sectionName || 'N/A')}</td>
                    <td><span class="badge bg-light text-dark border rounded-pill px-2.5 py-1">${s.attemptsCount} attempt${s.attemptsCount === 1 ? '' : 's'}</span></td>
                    <td>
                        <span class="fw-bold text-dark">${s.bestScore}</span> / <span class="text-muted">${s.totalQuestions}</span>
                        <span class="small ms-1 fw-semibold ${s.bestPercentage >= 60 ? 'text-success' : 'text-danger'}">(${Math.round(s.bestPercentage)}%)</span>
                    </td>
                    <td class="small text-muted">${dateStr}</td>
                    <td class="text-end pe-3">${statusBadge}</td>
                </tr>
            `;
        }).join('');
    }

    // Delegate click for Results button
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-view-quiz-results');
        if (btn) {
            const topicTitle = btn.getAttribute('data-topic-title');
            const topicId = btn.getAttribute('data-topic-id');
            openClassQuizResults(topicTitle, topicId);
        }
    });

    initClassQuizResultsModal();

    // --- Initial Page Load ---
    setSubjectDetails();
    updateDateTime();
    setInterval(updateDateTime, 1000);
});