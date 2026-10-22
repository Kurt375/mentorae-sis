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

        // 3. Media streaming over HTTP
        if (isMedia && /^https?:\/\//i.test(resolvedUrl)) {
            return {
                blob: null,
                arrayBuffer: null,
                blobUrl: resolvedUrl,
                mimeType: getMimeTypeFromFilename(fileName)
            };
        }

        // 4. HTTP / HTTPS URL
        const tokenVal = localStorage.getItem('mentorae_token');
        const headers = {};
        if (tokenVal && resolvedUrl.includes('/api/')) {
            headers['Authorization'] = `Bearer ${tokenVal}`;
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
                throw new Error('Server connection timed out.');
            }
            throw fetchErr;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async function openClassroomViewer(file, topicTitle = '') {
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

        let fileName = (file && typeof file === 'object') ? (file.name || 'Document') : String(file || 'Document');
        let initialDataUrl = (file && typeof file === 'object') ? (file.dataUrl || file.url || '') : '';

        // Revoke prior active blob URL
        if (currentViewerActiveBlobUrl && currentViewerActiveBlobUrl.startsWith('blob:')) {
            try { URL.revokeObjectURL(currentViewerActiveBlobUrl); } catch (e) { }
            currentViewerActiveBlobUrl = null;
        }

        // Hide files modal safely
        const reqFilesModalEl = document.getElementById('viewRequestFilesModal');
        let reqFilesModalInstance = null;
        if (reqFilesModalEl && typeof bootstrap !== 'undefined') {
            reqFilesModalInstance = bootstrap.Modal.getInstance(reqFilesModalEl) || new bootstrap.Modal(reqFilesModalEl);
            if (reqFilesModalInstance) reqFilesModalInstance.hide();
        }

        viewerEl.classList.remove('d-none');
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

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
        let mime = (file && file.type) ? file.type : getMimeTypeFromFilename(fileName, '');

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

        let fileData = null;
        try {
            fileData = await loadFileData(initialDataUrl, fileName);
            if (fileData.blobUrl && fileData.blobUrl.startsWith('blob:')) {
                currentViewerActiveBlobUrl = fileData.blobUrl;
            }
        } catch (err) {
            console.error('Error loading file data:', err);
            stageEl.innerHTML = `
                <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 520px;">
                    <i class="bi bi-file-earmark-x text-warning display-4 mb-3 d-block"></i>
                    <h4 class="fw-bold text-white mb-2">Preview Unavailable</h4>
                    <p class="text-white-50 mb-3">${escapeHtml(fileName || 'File')}</p>
                    <p class="text-secondary small mb-4">${escapeHtml(err.message || 'File content is not available.')}</p>
                    <button type="button" class="btn btn-outline-light rounded-pill px-4 fw-semibold" id="closeMissingFileBtn">
                        <i class="bi bi-arrow-left me-2"></i> Close Viewer
                    </button>
                </div>
            `;
            document.getElementById('closeMissingFileBtn')?.addEventListener('click', closeViewer);
            return;
        }

        const activeUrl = fileData?.blobUrl || initialDataUrl;

        // Configure Top Action Buttons
        if (downloadBtn) {
            downloadBtn.href = activeUrl;
            downloadBtn.setAttribute('download', fileName || 'attached_file');
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

        // 1. PDF
        if (ext === 'pdf' || mime.includes('pdf')) {
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

        // 2. WORD DOCUMENTS (.docx, .doc)
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

                const TARGET_PAGE_HEIGHT = 1056;
                const PAGE_PADDING_V = 136;
                const USABLE_HEIGHT = TARGET_PAGE_HEIGHT - PAGE_PADDING_V;

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
                        c.tagName !== 'HEADER' && c.tagName !== 'FOOTER' && !c.classList.contains('docx-page-footer-badge')
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
                    if (curPageChildren.length > 0) pages.push(curPageChildren);
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
                    paginateDocxContainer(host);
                    setTimeout(() => paginateDocxContainer(host), 60);
                    return;
                } catch (docxErr) {
                    console.warn('docx-preview notice, trying mammoth fallback:', docxErr);
                }
            }

            if (window.mammoth && fileData.arrayBuffer) {
                try {
                    const result = await window.mammoth.convertToHtml({ arrayBuffer: fileData.arrayBuffer });
                    host.innerHTML = `
                        <div class="docx-paper-sheet">
                            ${result.value || '<p class="text-muted fst-italic">Empty Document.</p>'}
                        </div>
                    `;
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

        // 3. SPREADSHEETS (.xlsx, .xls, .csv)
        if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
            if (window.XLSX && fileData.arrayBuffer) {
                try {
                    const wb = window.XLSX.read(fileData.arrayBuffer, { type: 'array' });
                    const sheetNames = wb.SheetNames || [];
                    if (sheetNames.length > 0) {
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
                    }
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

        // 4. IMAGES
        if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) || mime.startsWith('image/')) {
            stageEl.innerHTML = `
                <div class="d-flex align-items-center justify-content-center w-100 h-100 p-4" style="background-color: #0b0c0e;">
                    <img src="${activeUrl}" alt="${escapeHtml(fileName)}" class="img-fluid rounded shadow-lg" style="max-height: 90vh; max-width: 95vw; object-fit: contain;">
                </div>
            `;
            return;
        }

        // 5. VIDEOS
        if (['mp4', 'webm', 'ogg'].includes(ext) || mime.startsWith('video/')) {
            stageEl.innerHTML = `
                <div class="media-viewer-stage d-flex align-items-center justify-content-center w-100 h-100 p-4">
                    <video controls autoplay playsinline class="rounded shadow-lg" style="max-height: 85vh; max-width: 90vw;" src="${activeUrl}">
                        <source src="${activeUrl}" type="${mime || 'video/mp4'}">
                        Your browser does not support video playback.
                    </video>
                </div>
            `;
            return;
        }

        // 6. AUDIO
        if (['mp3', 'wav', 'm4a'].includes(ext) || mime.startsWith('audio/')) {
            stageEl.innerHTML = `
                <div class="d-flex flex-column align-items-center justify-content-center w-100 h-100 text-white p-4">
                    <i class="bi bi-file-earmark-music text-primary mb-3" style="font-size: 5rem;"></i>
                    <h5 class="fw-bold mb-3">${escapeHtml(fileName)}</h5>
                    <audio controls autoplay class="w-50" src="${activeUrl}">
                        Your browser does not support audio playback.
                    </audio>
                </div>
            `;
            return;
        }

        // 7. TEXT / GENERIC FALLBACK
        if (ext === 'txt') {
            try {
                const textContent = await (fileData.blob ? fileData.blob.text() : '');
                stageEl.innerHTML = `
                    <div class="p-4 w-100 h-100 overflow-auto bg-dark text-light font-monospace" style="white-space: pre-wrap; font-size: 0.9rem;">
                        ${escapeHtml(textContent)}
                    </div>
                `;
                return;
            } catch (txtErr) {}
        }

        stageEl.innerHTML = `
            <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 500px;">
                <i class="bi bi-file-earmark-text text-secondary" style="font-size: 5rem;"></i>
                <h4 class="fw-bold text-white mt-3">${escapeHtml(fileName)}</h4>
                <p class="text-white-50 mb-4">Click download below to open this file on your device.</p>
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