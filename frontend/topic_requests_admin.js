document.addEventListener('DOMContentLoaded', () => {
    const { token } = requireSession('login.html');

    let topicRequests = [];
    let currentViewerActiveBlobUrl = null;

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

    function dataURItoBlob(dataURI, fileName = 'document') {
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

    function getMimeTypeFromFilename(filename, fallback = 'application/octet-stream') {
        if (!filename || typeof filename !== 'string') return fallback;
        const ext = filename.split('.').pop().toLowerCase();
        const mimeMap = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'ppt': 'application/vnd.ms-powerpoint',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'txt': 'text/plain',
            'csv': 'text/csv',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
            'mp4': 'video/mp4',
            'webm': 'video/webm',
            'ogg': 'video/ogg',
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'm4a': 'audio/mp4'
        };
        return mimeMap[ext] || fallback;
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
                if (!raw && fileObj.requestId !== undefined && fileObj.fileIndex !== undefined) {
                    raw = `/api/content/topic-requests/${fileObj.requestId}/files/${fileObj.fileIndex}/download`;
                } else if (!raw && fileObj.topicId !== undefined && fileObj.fileIndex !== undefined) {
                    raw = `/api/content/topic-requests/${fileObj.topicId}/files/${fileObj.fileIndex}/download`;
                } else if (!raw && fileObj.id) {
                    raw = `/api/resources/files/${fileObj.id}/download`;
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

        if (fileObj && typeof fileObj === 'object' && fileObj.name && fullUrl.includes('/api/content/') && !fullUrl.includes('name=')) {
            const separator = fullUrl.includes('?') ? '&' : '?';
            fullUrl = `${fullUrl}${separator}name=${encodeURIComponent(fileObj.name)}`;
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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        try {
            const res = await fetch(resolvedUrl, { headers, signal: controller.signal });
            if (!res.ok) {
                let errMsg = `Failed to load file (${res.status} ${res.statusText})`;
                try {
                    const errJson = await res.json();
                    if (errJson && errJson.message) errMsg = errJson.message;
                } catch (e) { }
                throw new Error(errMsg);
            }
            const blob = await res.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const blobUrl = URL.createObjectURL(blob);
            return { blob, arrayBuffer, blobUrl, mimeType: blob.type || getMimeTypeFromFilename(fileName) };
        } catch (fetchErr) {
            if (fetchErr.name === 'AbortError') {
                throw new Error('Server connection timed out. The file may be unavailable.');
            }
            throw fetchErr;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async function openClassroomViewer(fileName, dataUrl, topicTitle = '', targetFile = null, returnModal = null) {
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

        // Normalization if targetFile was passed as first argument
        if (typeof fileName === 'object' && fileName !== null) {
            targetFile = fileName;
            fileName = targetFile.name || 'Document';
            dataUrl = targetFile.dataUrl || targetFile.url || '';
        }

        // Revoke prior active blob URL
        if (currentViewerActiveBlobUrl && currentViewerActiveBlobUrl.startsWith('blob:')) {
            try { URL.revokeObjectURL(currentViewerActiveBlobUrl); } catch (e) { }
            currentViewerActiveBlobUrl = null;
        }

        viewerEl.classList.remove('d-none');
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        // Track caller modal to restore on close
        const reqFilesModalEl = document.getElementById('viewRequestFilesModal');
        let reqFilesModalInstance = null;
        if (reqFilesModalEl && typeof bootstrap !== 'undefined') {
            reqFilesModalInstance = bootstrap.Modal.getInstance(reqFilesModalEl) || new bootstrap.Modal(reqFilesModalEl);
            if (reqFilesModalInstance) reqFilesModalInstance.hide();
        }

        const closeViewer = () => {
            viewerEl.classList.add('d-none');
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
            stageEl.innerHTML = '';
            if (modeSwitcherEl) modeSwitcherEl.innerHTML = '';
            if (currentViewerActiveBlobUrl && currentViewerActiveBlobUrl.startsWith('blob:')) {
                try { URL.revokeObjectURL(currentViewerActiveBlobUrl); } catch (e) { }
                currentViewerActiveBlobUrl = null;
            }
            if (reqFilesModalInstance) {
                reqFilesModalInstance.show();
            }
        };

        const closeBtn = document.getElementById('classroomViewerCloseBtn');
        const backBtn = document.getElementById('classroomViewerBackBtn');
        if (closeBtn) closeBtn.onclick = closeViewer;
        if (backBtn) backBtn.onclick = closeViewer;

        // Escape key listener to close viewer
        const handleViewerKeydown = (e) => {
            if (e.key === 'Escape' && !viewerEl.classList.contains('d-none')) {
                e.preventDefault();
                window.removeEventListener('keydown', handleViewerKeydown);
                closeViewer();
            }
        };
        window.addEventListener('keydown', handleViewerKeydown);

        if (nameEl) nameEl.textContent = fileName || 'Document';
        if (subEl) subEl.textContent = `Topic Request • ${topicTitle || 'Attached Material'}`;

        const ext = (fileName || '').split('.').pop().toLowerCase();
        let mime = (targetFile && targetFile.type) ? targetFile.type : getMimeTypeFromFilename(fileName, '');

        if (iconEl) {
            if (ext === 'pdf') {
                iconEl.className = 'bi bi-file-earmark-pdf fs-4 text-danger';
            } else if (ext === 'pptx' || ext === 'ppt') {
                iconEl.className = 'bi bi-file-earmark-slides fs-4 text-warning';
            } else if (ext === 'docx' || ext === 'doc') {
                iconEl.className = 'bi bi-file-earmark-word fs-4 text-primary';
            } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
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
            const canTryPdf = ['pptx', 'ppt', 'docx', 'doc', 'pdf'].includes(ext);
            const hasAlternativeData = (targetFile && (targetFile.dataUrl || targetFile.pdfDataUrl || targetFile.pdfUrl)) || (dataUrl && dataUrl.startsWith('data:'));
            if (!canTryPdf || (!hasAlternativeData && !targetFile?.topicId && !targetFile?.requestId)) {
                console.error('Error loading file data:', err);
                stageEl.innerHTML = `
                    <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 520px;">
                        <i class="bi bi-file-earmark-x text-warning display-4 mb-3 d-block"></i>
                        <h4 class="fw-bold text-white mb-2">Preview Unavailable</h4>
                        <p class="text-white-50 mb-3">${escapeHtml(fileName || 'File')}</p>
                        <p class="text-secondary small mb-4">${escapeHtml(err.message || 'File content is not available in the database.')}</p>
                        <button type="button" class="btn btn-outline-light rounded-pill px-4 fw-semibold" id="closeMissingFileViewerBtn">
                            <i class="bi bi-arrow-left me-2"></i> Close Viewer
                        </button>
                    </div>
                `;
                document.getElementById('closeMissingFileViewerBtn')?.addEventListener('click', closeViewer);
                return;
            }
        }

        const activeUrl = fileData?.blobUrl || resolvedUrl;

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
        // 2. PPT / PPTX PRESENTATIONS (Google Classroom Style PDF Auto-View)
        // ==========================================
        if (ext === 'pptx' || ext === 'ppt') {
            if (modeSwitcherEl) modeSwitcherEl.innerHTML = '';

            stageEl.innerHTML = `
                <div class="d-flex flex-column align-items-center justify-content-center w-100 h-100 text-white p-4">
                    <div class="spinner-border text-primary mb-3" style="width: 3.5rem; height: 3.5rem;" role="status"></div>
                    <p class="fs-5 fw-bold mb-1">Converting Presentation to PDF...</p>
                    <p class="text-white-50 small mb-3" id="pptxConvertStatus">Preparing classroom PDF document for viewing</p>
                    <div class="progress w-50" style="height: 6px; background: rgba(255,255,255,0.15);">
                        <div class="progress-bar progress-bar-striped progress-bar-animated bg-primary" id="pptxConvertProgressBar" style="width: 25%;"></div>
                    </div>
                </div>
            `;

            const token = localStorage.getItem('mentorae_token');
            const apiBase = (window.MENTORAE_CONFIG?.API_BASE_URL || '').replace(/\/+$/, '');
            const targetReqId = targetFile?.requestId || targetFile?.topicId;

            let finalPdfBlobUrl = null;

            // Step 1: Check if already converted and available in memory
            if (targetFile?.pdfBlobUrl && typeof targetFile.pdfBlobUrl === 'string') {
                finalPdfBlobUrl = targetFile.pdfBlobUrl;
            } else if (targetFile?.pdfDataUrl && typeof targetFile.pdfDataUrl === 'string' && targetFile.pdfDataUrl.startsWith('data:application/pdf')) {
                try {
                    const blob = dataURItoBlob(targetFile.pdfDataUrl, `${fileName}.pdf`);
                    if (blob) {
                        finalPdfBlobUrl = URL.createObjectURL(blob);
                        targetFile.pdfBlobUrl = finalPdfBlobUrl;
                    }
                } catch (e) { }
            }

            // Step 2: Check if pre-converted PDF is available on the server
            if (!finalPdfBlobUrl && targetReqId !== undefined && targetFile?.fileIndex !== undefined) {
                try {
                    const srvPdfUrl = `${apiBase}/api/content/topic-requests/${targetReqId}/files/${targetFile.fileIndex}/download?asPdf=true`;
                    const srvController = new AbortController();
                    const srvTimeout = setTimeout(() => srvController.abort(), 4000);
                    const srvRes = await fetch(srvPdfUrl, {
                        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                        signal: srvController.signal
                    });
                    clearTimeout(srvTimeout);

                    if (srvRes.ok) {
                        const srvBuf = await srvRes.arrayBuffer();
                        if (srvBuf && srvBuf.byteLength >= 4) {
                            const header = String.fromCharCode(...new Uint8Array(srvBuf.slice(0, 4)));
                            if (header.startsWith('%PDF')) {
                                const blob = new Blob([srvBuf], { type: 'application/pdf' });
                                finalPdfBlobUrl = URL.createObjectURL(blob);
                                if (targetFile) targetFile.pdfBlobUrl = finalPdfBlobUrl;
                            }
                        }
                    }
                } catch (srvErr) {
                    console.log('Server pre-converted PDF not immediately available, converting client-side:', srvErr);
                }
            }

            // Step 3: Convert client-side via MentoraePptxToPdf if not yet converted
            if (!finalPdfBlobUrl && window.MentoraePptxToPdf) {
                try {
                    let pptxBuffer = fileData?.arrayBuffer;
                    if (!pptxBuffer && fileData?.blob) {
                        pptxBuffer = await fileData.blob.arrayBuffer();
                    }
                    if (!pptxBuffer && targetFile?.dataUrl && typeof targetFile.dataUrl === 'string' && targetFile.dataUrl.includes(',')) {
                        const b = dataURItoBlob(targetFile.dataUrl, fileName);
                        if (b) pptxBuffer = await b.arrayBuffer();
                    }
                    if (!pptxBuffer && resolvedUrl) {
                        const fetchRes = await fetch(resolvedUrl, {
                            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                        });
                        if (fetchRes.ok) {
                            pptxBuffer = await fetchRes.arrayBuffer();
                        }
                    }

                    if (pptxBuffer) {
                        const convertedDataUrl = await window.MentoraePptxToPdf.convert(pptxBuffer, (prog) => {
                            const pBar = document.getElementById('pptxConvertProgressBar');
                            const pStatus = document.getElementById('pptxConvertStatus');
                            if (pBar) pBar.style.width = `${prog.percent || 50}%`;
                            if (pStatus) pStatus.textContent = prog.message || 'Converting slides into PDF...';
                        });

                        if (convertedDataUrl && convertedDataUrl.startsWith('data:application/pdf')) {
                            const pdfBlob = dataURItoBlob(convertedDataUrl, `${fileName}.pdf`);
                            if (pdfBlob) {
                                finalPdfBlobUrl = URL.createObjectURL(pdfBlob);
                                if (targetFile) {
                                    targetFile.pdfDataUrl = convertedDataUrl;
                                    targetFile.pdfBlobUrl = finalPdfBlobUrl;
                                }
                            }
                        }
                    }
                } catch (convErr) {
                    console.error('Client PPTX to PDF conversion error:', convErr);
                }
            }

            // Step 4: Render genuine PDF in embedded frame
            if (finalPdfBlobUrl) {
                if (popoutBtn) popoutBtn.href = finalPdfBlobUrl;
                stageEl.innerHTML = `
                    <object data="${finalPdfBlobUrl}" type="application/pdf" class="w-100 h-100 border-0" style="background: #525659;">
                        <iframe src="${finalPdfBlobUrl}" class="w-100 h-100 border-0" title="${escapeHtml(fileName)}" style="background: #525659;">
                            <div class="p-5 text-center text-white">
                                <p class="mb-3">Unable to display PDF inline.</p>
                                <a href="${finalPdfBlobUrl}" target="_blank" class="btn btn-primary rounded-pill px-4">Open Converted PDF</a>
                            </div>
                        </iframe>
                    </object>
                `;
                return;
            }

            // Fallback: render interactive PPTX or fallback card
            renderPptxPresentation(fileData?.arrayBuffer, fileName, activeUrl);
            return;
        }

        async function openOnlineEmbed(viewerType) {
            const isDoc = ext === 'docx' || ext === 'doc';
            const officeTitle = isDoc ? 'Microsoft Word Online' : 'Microsoft Office Online';
            const googleTitle = isDoc ? 'Google Docs Viewer' : 'Google Slides Viewer';
            const backBtnLabel = isDoc ? 'Document View' : 'PDF View';

            if (modeSwitcherEl) {
                modeSwitcherEl.innerHTML = `
                    <button type="button" class="btn btn-sm btn-primary rounded-pill px-2.5 py-0.5 border-0 fw-semibold fs-8" id="modeBackSlidesTopBtn" title="Switch back to built-in viewer">
                        <i class="bi bi-${isDoc ? 'file-earmark-word' : 'file-earmark-pdf'} me-1"></i> Back to ${backBtnLabel}
                    </button>
                `;
                document.getElementById('modeBackSlidesTopBtn')?.addEventListener('click', () => {
                    openClassroomViewer(fileName, dataUrl, topicTitle, targetFile, reqFilesModalInstance);
                });
            }

            stageEl.innerHTML = `
                <div class="d-flex flex-column align-items-center justify-content-center w-100 h-100 text-white p-4">
                    <div class="spinner-border ${viewerType === 'office' ? 'text-info' : 'text-warning'} mb-3" style="width: 3rem; height: 3rem;" role="status"></div>
                    <p class="fs-5 fw-semibold mb-1">Connecting to ${viewerType === 'office' ? officeTitle : googleTitle}...</p>
                    <p class="text-white-50 small mb-3">Loading genuine ${isDoc ? 'document layout, shapes, and diagrams' : 'presentation layout and animations'}</p>
                    <button type="button" class="btn btn-sm btn-outline-light rounded-pill px-3" id="cancelOnlineEmbedBtn">
                        <i class="bi bi-arrow-left me-1"></i> Back to ${backBtnLabel}
                    </button>
                </div>
            `;
            document.getElementById('cancelOnlineEmbedBtn')?.addEventListener('click', () => {
                openClassroomViewer(fileName, dataUrl, topicTitle, targetFile, reqFilesModalInstance);
            });

            try {
                const token = localStorage.getItem('mentorae_token') || '';
                const apiBase = (window.MENTORAE_CONFIG?.API_BASE_URL || '').replace(/\/+$/, '');

                let payloadDataUrl = dataUrl;
                if (!payloadDataUrl || typeof payloadDataUrl !== 'string' || payloadDataUrl.startsWith('blob:') || !payloadDataUrl.includes('base64')) {
                    if (fileData && fileData.blob) {
                        payloadDataUrl = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.onerror = reject;
                            reader.readAsDataURL(fileData.blob);
                        });
                    } else if (fileData && fileData.arrayBuffer) {
                        const bytes = new Uint8Array(fileData.arrayBuffer);
                        let binary = '';
                        const len = bytes.byteLength;
                        for (let i = 0; i < len; i += 8192) {
                            binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, len)));
                        }
                        const mimeTypeForPayload = isDoc
                            ? (ext === 'doc' ? 'application/msword' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
                            : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
                        payloadDataUrl = `data:${mimeTypeForPayload};base64,${btoa(binary)}`;
                    }
                }

                const res = await fetch(`${apiBase}/api/content/public-preview-token`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({ fileName, dataUrl: payloadDataUrl })
                });
                const data = await res.json();
                if (data && data.success) {
                    const embedUrl = viewerType === 'office' ? data.officeViewerUrl : data.googleViewerUrl;
                    stageEl.innerHTML = `
                        <div class="w-100 h-100 position-relative d-flex flex-column">
                            <div class="d-flex align-items-center justify-content-between px-3 py-1.5 bg-dark border-bottom border-secondary" style="font-size: 0.8rem;">
                                <span class="text-white-50"><i class="bi bi-${viewerType === 'office' ? 'microsoft text-info' : 'google text-warning'} me-1.5"></i> Powered by ${viewerType === 'office' ? officeTitle : googleTitle}</span>
                                <div class="d-flex align-items-center gap-2">
                                    <a href="${embedUrl}" target="_blank" class="btn btn-xs btn-outline-info rounded-pill px-2.5 py-0.5" style="font-size: 0.75rem;">
                                        <i class="bi bi-box-arrow-up-right me-1"></i> Full Window
                                    </a>
                                    <button type="button" class="btn btn-xs btn-outline-light rounded-pill px-2.5 py-0.5" id="btnBackToBuiltinSlides" style="font-size: 0.75rem;">
                                        <i class="bi bi-${isDoc ? 'file-earmark-word' : 'file-earmark-pdf'} me-1"></i> Back to ${backBtnLabel}
                                    </button>
                                </div>
                            </div>
                            <iframe src="${embedUrl}" class="w-100 flex-grow-1 border-0" allowfullscreen title="${escapeHtml(fileName)}"></iframe>
                        </div>
                    `;
                    document.getElementById('btnBackToBuiltinSlides')?.addEventListener('click', () => {
                        openClassroomViewer(fileName, dataUrl, topicTitle, targetFile, reqFilesModalInstance);
                    });
                    return;
                }
                throw new Error(data?.message || 'Could not connect to online viewer.');
            } catch (err) {
                console.warn('Online embed error, falling back:', err);
                stageEl.innerHTML = `
                    <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 520px;">
                        <i class="bi bi-exclamation-circle text-warning fs-1 mb-3 d-block"></i>
                        <h5 class="fw-bold text-white mb-2">Could not connect to ${viewerType === 'office' ? 'Microsoft Office' : 'Google'} Viewer</h5>
                        <p class="text-white-50 small mb-4">${escapeHtml(err.message || 'Service is temporarily unreachable.')}</p>
                        <div class="d-flex justify-content-center gap-2">
                            <button type="button" class="btn btn-primary rounded-pill px-4" id="btnFallbackBuiltin">
                                <i class="bi bi-file-earmark-${isDoc ? 'word' : 'pdf'} me-1"></i> Open Built-in View
                            </button>
                            <a href="${activeUrl}" download="${escapeHtml(fileName)}" class="btn btn-outline-light rounded-pill px-4">
                                <i class="bi bi-download me-1"></i> Download File
                            </a>
                        </div>
                    </div>
                `;
                document.getElementById('btnFallbackBuiltin')?.addEventListener('click', () => {
                    openClassroomViewer(fileName, dataUrl, topicTitle, targetFile, reqFilesModalInstance);
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
                    if (!arrayBuffer || !window.JSZip) {
                        stageEl.innerHTML = `
                            <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 520px;">
                                <i class="bi bi-file-earmark-slides text-warning display-4 mb-3 d-block"></i>
                                <h4 class="fw-bold text-white mb-2">Presentation Preview</h4>
                                <p class="text-white-50 mb-3">${escapeHtml(presFileName || fileName || 'Presentation')}</p>
                                <p class="text-secondary small mb-4">Click below to download or view this presentation.</p>
                                <a href="${presUrl || activeUrl}" download="${escapeHtml(presFileName || fileName)}" class="btn btn-primary rounded-pill px-4 fw-semibold">
                                    <i class="bi bi-download me-1"></i> Download Presentation
                                </a>
                            </div>
                        `;
                        return;
                    }

                    const zip = await JSZip.loadAsync(arrayBuffer);
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

                    stageEl.innerHTML = `
                        <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 520px;">
                            <i class="bi bi-file-earmark-slides text-warning display-4 mb-3 d-block"></i>
                            <h4 class="fw-bold text-white mb-2">${escapeHtml(presFileName || fileName)}</h4>
                            <p class="text-white-50 mb-4">${slideKeys.length} Slide(s) in Presentation</p>
                            <div class="d-flex justify-content-center gap-2">
                                <button type="button" class="btn btn-outline-info rounded-pill px-4" id="pptxOfficeTopBtn">
                                    <i class="bi bi-microsoft me-1"></i> Office 365 View
                                </button>
                                <button type="button" class="btn btn-outline-warning rounded-pill px-4" id="pptxGoogleTopBtn">
                                    <i class="bi bi-google me-1"></i> Google Slides
                                </button>
                                <a href="${presUrl || activeUrl}" download="${escapeHtml(presFileName || fileName)}" class="btn btn-primary rounded-pill px-4">
                                    <i class="bi bi-download me-1"></i> Download
                                </a>
                            </div>
                        </div>
                    `;
                    document.getElementById('pptxOfficeTopBtn')?.addEventListener('click', () => openOnlineEmbed('office'));
                    document.getElementById('pptxGoogleTopBtn')?.addEventListener('click', () => openOnlineEmbed('google'));
                } catch (err) {
                    console.error('Error rendering PPTX:', err);
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

            function paginateDocxContainer(hostEl) {
                if (!hostEl) return;
                const sections = Array.from(hostEl.querySelectorAll('section.docx, .docx-wrapper > section, .docx-paper-sheet'));
                if (!sections.length) return;

                const TARGET_PAGE_HEIGHT = 1056; // Standard 8.5" x 11" Letter page height at 96 DPI
                const PAGE_PADDING_V = 136; // Top (64px) + bottom (64px) padding + margin allowance
                const USABLE_HEIGHT = TARGET_PAGE_HEIGHT - PAGE_PADDING_V; // ~920px

                sections.forEach(sec => {
                    if (sec.classList.contains('docx-paginated-done')) return;

                    if (sec.offsetHeight <= TARGET_PAGE_HEIGHT + 60) {
                        if (!sec.querySelector('.docx-page-footer-badge')) {
                            const footer = document.createElement('div');
                            footer.className = 'docx-page-footer-badge';
                            footer.innerHTML = '<span class="docx-page-num-badge">Page 1 of 1</span>';
                            sec.appendChild(footer);
                        }
                        sec.classList.add('docx-paginated-done');
                        return;
                    }

                    const rawChildren = Array.from(sec.children).filter(c =>
                        c.tagName !== 'HEADER' &&
                        c.tagName !== 'FOOTER' &&
                        !c.classList.contains('docx-page-footer-badge')
                    );
                    if (rawChildren.length <= 1) return;

                    const pages = [];
                    let curPageChildren = [];
                    let accumulatedH = 0;

                    rawChildren.forEach(child => {
                        const h = child.offsetHeight || 30;
                        if (accumulatedH + h > USABLE_HEIGHT && curPageChildren.length > 0) {
                            pages.push(curPageChildren);
                            curPageChildren = [child];
                            accumulatedH = h;
                        } else {
                            curPageChildren.push(child);
                            accumulatedH += h;
                        }
                    });
                    if (curPageChildren.length > 0) {
                        pages.push(curPageChildren);
                    }

                    if (pages.length <= 1) return;

                    const parent = sec.parentNode;
                    const totalPages = pages.length;

                    pages.forEach((pageChildren, pageIdx) => {
                        const pageSec = document.createElement('section');
                        pageSec.className = `${sec.className} docx-paginated-done`;
                        if (sec.style.cssText) pageSec.style.cssText = sec.style.cssText;
                        pageSec.style.minHeight = `${TARGET_PAGE_HEIGHT}px`;
                        pageSec.style.marginBottom = '32px';
                        pageSec.style.position = 'relative';

                        pageChildren.forEach(c => pageSec.appendChild(c));

                        const pageFooter = document.createElement('div');
                        pageFooter.className = 'docx-page-footer-badge';
                        pageFooter.innerHTML = `<span class="docx-page-num-badge">Page ${pageIdx + 1} of ${totalPages}</span>`;
                        pageSec.appendChild(pageFooter);

                        parent.insertBefore(pageSec, sec);
                    });

                    parent.removeChild(sec);
                });
            }

            async function postProcessDocxMediaAndShapes(arrayBuf, hostEl) {
                if (!arrayBuf || !hostEl || !window.JSZip) return;
                try {
                    const zip = await window.JSZip.loadAsync(arrayBuf);
                    const allFiles = Object.keys(zip.files);
                    const allMediaFiles = allFiles.filter(f => /^word\/media\/.+\.(png|jpe?g|gif|webp|svg)$/i.test(f));
                    const renderedImgs = Array.from(hostEl.querySelectorAll('img'));

                    let hasShapesOrSmartArt = false;
                    if (allFiles.some(f => /^word\/diagrams\//i.test(f))) {
                        hasShapesOrSmartArt = true;
                    }
                    const docXml = await zip.file('word/document.xml')?.async('string');
                    if (docXml && (docXml.includes('wps:wsp') || docXml.includes('wpg:wgp') || docXml.includes('v:shape') || docXml.includes('wpc:wpc') || docXml.includes('dgm:'))) {
                        hasShapesOrSmartArt = true;
                    }

                    const needsMediaRestoration = allMediaFiles.length > 0 && renderedImgs.length < allMediaFiles.length;

                    if (needsMediaRestoration) {
                        const renderedSrcs = renderedImgs.map(img => img.src || '');
                        const restoredMediaFiles = new Set();

                        const isFileAlreadyRendered = async (fileObj) => {
                            if (!fileObj) return true;
                            if (renderedImgs.length === 0) return false;
                            try {
                                const b64 = await fileObj.async('base64');
                                const sig = b64.slice(0, 48);
                                return renderedSrcs.some(src => src.includes(sig));
                            } catch (e) {
                                return false;
                            }
                        };

                        const relsStr = await zip.file('word/_rels/document.xml.rels')?.async('string');
                        const relMap = {};
                        if (relsStr) {
                            const relRegex = /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/gi;
                            let rm;
                            while ((rm = relRegex.exec(relsStr)) !== null) {
                                relMap[rm[1]] = rm[2].replace(/^\/?word\//i, '').replace(/^media\//i, 'media/');
                            }
                        }

                        const imagePlacements = [];
                        if (docXml) {
                            const pRegex = /<w:p(?: [^>]*)?>([\s\S]*?)<\/w:p>/gi;
                            let pm;
                            let pIdx = 0;
                            let lastText = '';

                            while ((pm = pRegex.exec(docXml)) !== null) {
                                const pContent = pm[1];
                                const tMatches = [...pContent.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/gi)];
                                const text = tMatches.map(m => m[1]).join('').trim();
                                if (text) {
                                    lastText = text;
                                }

                                const idMatches = [...pContent.matchAll(/(?:embed|id)="([^"]+)"/gi)];
                                for (const im of idMatches) {
                                    const rId = im[1];
                                    const target = relMap[rId];
                                    if (target && /^media\//i.test(target)) {
                                        imagePlacements.push({
                                            rId,
                                            mediaPath: 'word/' + target,
                                            fileName: target.split('/').pop(),
                                            pIndex: pIdx,
                                            precedingText: lastText
                                        });
                                    }
                                }
                                pIdx++;
                            }
                        }

                        const section = hostEl.querySelector('section.docx, .docx-paper-sheet') || hostEl;
                        const emptyDrawingContainers = Array.from(
                            hostEl.querySelectorAll('div[style*="inline-block"], div[style*="position: relative"], div[style*="width: 0px"], div[style*="height: 0px"]')
                        ).filter(el => !el.querySelector('img') && !el.querySelector('svg') && !el.querySelector('table') && !el.innerText.trim());

                        const domParas = Array.from(section.querySelectorAll('p, h1, h2, h3, h4, h5, h6'));

                        for (let i = 0; i < imagePlacements.length; i++) {
                            const placement = imagePlacements[i];
                            if (restoredMediaFiles.has(placement.fileName)) continue;

                            const file = zip.file(placement.mediaPath) || zip.file(new RegExp(placement.fileName + '$', 'i'))[0];
                            if (!file) continue;

                            if (await isFileAlreadyRendered(file)) {
                                restoredMediaFiles.add(placement.fileName);
                                continue;
                            }

                            const blob = await file.async('blob');
                            const blobUrl = URL.createObjectURL(blob);

                            const imgEl = document.createElement('img');
                            imgEl.src = blobUrl;
                            imgEl.alt = placement.fileName || 'Document Diagram';
                            imgEl.className = 'docx-restored-img img-fluid';
                            imgEl.style.maxWidth = '100%';
                            imgEl.style.height = 'auto';
                            imgEl.style.display = 'block';
                            imgEl.style.margin = '16px auto';
                            imgEl.style.objectFit = 'contain';

                            let placed = false;
                            if (emptyDrawingContainers.length > 0) {
                                const emptyBox = emptyDrawingContainers.shift();
                                emptyBox.style.width = 'auto';
                                emptyBox.style.height = 'auto';
                                emptyBox.style.minHeight = '60px';
                                emptyBox.style.display = 'block';
                                emptyBox.style.position = 'relative';
                                emptyBox.style.textAlign = 'center';
                                emptyBox.style.margin = '16px auto';
                                emptyBox.appendChild(imgEl);
                                placed = true;
                            }

                            if (!placed && placement.precedingText) {
                                const matchedEl = domParas.find(el => {
                                    const txt = el.innerText.trim();
                                    return txt && (txt === placement.precedingText || txt.includes(placement.precedingText) || placement.precedingText.includes(txt));
                                });
                                if (matchedEl && matchedEl.parentNode) {
                                    const pWrapper = document.createElement('div');
                                    pWrapper.className = 'docx-img-placement text-center my-3';
                                    pWrapper.appendChild(imgEl);
                                    matchedEl.parentNode.insertBefore(pWrapper, matchedEl.nextSibling);
                                    placed = true;
                                }
                            }

                            if (!placed && domParas[placement.pIndex]) {
                                const targetPara = domParas[placement.pIndex];
                                if (targetPara && targetPara.parentNode) {
                                    const pWrapper = document.createElement('div');
                                    pWrapper.className = 'docx-img-placement text-center my-3';
                                    pWrapper.appendChild(imgEl);
                                    targetPara.parentNode.insertBefore(pWrapper, targetPara);
                                    placed = true;
                                }
                            }

                            if (!placed) {
                                const pWrapper = document.createElement('div');
                                pWrapper.className = 'docx-img-placement text-center my-3';
                                pWrapper.appendChild(imgEl);
                                section.appendChild(pWrapper);
                            }

                            restoredMediaFiles.add(placement.fileName);
                            renderedSrcs.push(blobUrl);
                        }
                    }

                    const allImgs = Array.from(hostEl.querySelectorAll('img'));
                    await Promise.all(allImgs.map(img => img.decode ? img.decode().catch(() => { }) : Promise.resolve()));

                    if (hasShapesOrSmartArt) {
                        const firstSec = hostEl.querySelector('section.docx, .docx-paper-sheet') || hostEl;
                        if (!firstSec.querySelector('.docx-shape-notice')) {
                            const notice = document.createElement('div');
                            notice.className = 'docx-shape-notice alert alert-info py-2 px-3 mb-3 border-0 rounded-3 d-flex align-items-center justify-content-between gap-2 shadow-sm';
                            notice.style.fontSize = '0.8rem';
                            notice.innerHTML = `
                                <div class="d-flex align-items-center gap-2">
                                    <i class="bi bi-info-circle-fill text-info fs-6"></i>
                                    <span>This document contains native Word vector shapes/diagrams. Click <strong>Office 365</strong> above to view full shapes and animations.</span>
                                </div>
                                <button type="button" class="btn btn-xs btn-info text-white rounded-pill px-2.5 py-0.5 fw-semibold" id="noticeOpenOfficeBtn" style="font-size: 0.75rem; white-space: nowrap;">
                                    <i class="bi bi-microsoft me-1"></i> Open Office 365
                                </button>
                            `;
                            firstSec.insertBefore(notice, firstSec.firstChild);
                            notice.querySelector('#noticeOpenOfficeBtn')?.addEventListener('click', () => openOnlineEmbed('office'));
                        }
                    }
                } catch (zipErr) {
                    console.warn('Exact docx media placement notice:', zipErr);
                }
            }

            // Setup mode switcher with Zoom and Online engine controls
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
                    <div class="vr bg-secondary my-1 d-none d-sm-block"></div>
                    <button type="button" class="btn btn-sm btn-outline-info rounded-pill px-2.5 py-0.5 border-0 fw-semibold fs-8" id="docxOfficeOnlineBtn" title="View with Microsoft Word Online">
                        <i class="bi bi-microsoft me-1"></i> Office 365
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-warning rounded-pill px-2.5 py-0.5 border-0 fw-semibold fs-8" id="docxGoogleDocsBtn" title="View with Google Docs">
                        <i class="bi bi-google me-1"></i> Google Docs
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
                document.getElementById('docxOfficeOnlineBtn')?.addEventListener('click', () => openOnlineEmbed('office'));
                document.getElementById('docxGoogleDocsBtn')?.addEventListener('click', () => openOnlineEmbed('google'));
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
                    await postProcessDocxMediaAndShapes(fileData.arrayBuffer, host);
                    paginateDocxContainer(host);
                    setTimeout(() => paginateDocxContainer(host), 60);
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
                    await postProcessDocxMediaAndShapes(fileData.arrayBuffer, host);
                    paginateDocxContainer(host);
                    setTimeout(() => paginateDocxContainer(host), 60);
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
                <div class="media-viewer-stage d-flex align-items-center justify-content-center w-100 h-100 p-4">
                    <video controls autoplay playsinline class="rounded shadow-lg" style="max-height: 85vh; max-width: 90vw;" src="${activeUrl}">
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
                    <div class="audio-viewer-card text-center p-4 bg-dark bg-opacity-75 rounded-4 border border-secondary shadow-lg" style="max-width: 440px; width: 100%;">
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
                <div class="docx-paper-container p-4 overflow-auto w-100 h-100 d-flex justify-content-center">
                    <div class="docx-page-card font-monospace bg-white text-dark p-4 rounded shadow" style="white-space: pre-wrap; font-size: 0.95rem; max-width: 860px; width: 100%; min-height: 80vh;">
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

    function renderRequestFiles(files, containerId, topicTitle = '') {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        if (!files || files.length === 0) {
            container.innerHTML = '<p class="text-muted text-center py-3">No files attached to this request.</p>';
            return;
        }
        const list = document.createElement('div');
        list.className = 'list-group';
        files.forEach((file) => {
            const ext = (file.name || '').split('.').pop().toLowerCase();
            let iconClass = 'bi-file-earmark-text text-secondary';
            if (ext === 'pdf') iconClass = 'bi-file-earmark-pdf text-danger';
            else if (ext === 'docx' || ext === 'doc') iconClass = 'bi-file-earmark-word text-primary';
            else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') iconClass = 'bi-file-earmark-excel text-success';
            else if (ext === 'pptx' || ext === 'ppt') iconClass = 'bi-file-earmark-slides text-warning';
            else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) iconClass = 'bi-file-earmark-image text-info';
            else if (['mp4', 'webm', 'ogg'].includes(ext)) iconClass = 'bi-file-earmark-play text-danger';

            const item = document.createElement('div');
            item.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2 px-3';
            item.style.cursor = 'pointer';
            item.title = 'Click to view file';
            item.innerHTML = `
                <div class="d-flex align-items-center text-truncate me-2">
                    <i class="bi ${iconClass} me-2 fs-5 flex-shrink-0"></i>
                    <span class="text-truncate fw-medium text-dark">${escapeHtml(file.name)}</span>
                </div>
                <div class="d-flex align-items-center gap-2 flex-shrink-0">
                    ${file.size ? `<span class="badge bg-secondary rounded-pill">${(file.size / 1024).toFixed(1)} KB</span>` : ''}
                    <button type="button" class="btn btn-sm btn-outline-primary rounded-pill px-3 py-0.5 fw-semibold view-file-action-btn" title="View file">
                        <i class="bi bi-eye me-1"></i>View
                    </button>
                </div>
            `;
            item.addEventListener('click', (e) => {
                e.preventDefault();
                openClassroomViewer(file, topicTitle);
            });
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
    const processingRequests = new Set();

    async function handleApproveRequest(requestId, triggerBtn) {
        if (processingRequests.has(requestId)) return;
        processingRequests.add(requestId);

        const card = document.getElementById(`request-${requestId}`);
        const actionBtns = card ? card.querySelectorAll('button') : [];
        actionBtns.forEach(b => b.disabled = true);
        const origHtml = triggerBtn ? triggerBtn.innerHTML : 'Approve';
        if (triggerBtn) {
            triggerBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Approving...';
        }

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
        } finally {
            processingRequests.delete(requestId);
            actionBtns.forEach(b => b.disabled = false);
            if (triggerBtn) triggerBtn.innerHTML = origHtml;
            loadData();
        }
    }

    async function handleDenyRequest(requestId, triggerBtn) {
        if (processingRequests.has(requestId)) return;
        const reason = prompt('Please provide feedback or reason for not approving (optional):', 'Needs revision or additional learning materials.');
        if (reason === null) return; // User clicked Cancel

        processingRequests.add(requestId);
        const card = document.getElementById(`request-${requestId}`);
        const actionBtns = card ? card.querySelectorAll('button') : [];
        actionBtns.forEach(b => b.disabled = true);
        const origHtml = triggerBtn ? triggerBtn.innerHTML : 'Deny';
        if (triggerBtn) {
            triggerBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Processing...';
        }

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
        } finally {
            processingRequests.delete(requestId);
            actionBtns.forEach(b => b.disabled = false);
            if (triggerBtn) triggerBtn.innerHTML = origHtml;
            loadData();
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
            const topicTitle = request?.topicData?.title || request?.title || 'Topic Request';
            if (modalTitle && request) {
                modalTitle.textContent = `Attached Files: ${topicTitle}`;
            }
            renderRequestFiles(files, 'requestFilesContainer', topicTitle);
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
                handleApproveRequest(requestId, target);
            } else if (target.classList.contains('deny-request-btn')) {
                handleDenyRequest(requestId, target);
            }
        });
    }

    init();
});