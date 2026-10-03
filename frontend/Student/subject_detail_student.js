document.addEventListener('DOMContentLoaded', () => {
    const session = (typeof requireSession === 'function')
        ? requireSession('../login.html')
        : { token: localStorage.getItem('mentorae_token'), user: JSON.parse(localStorage.getItem('mentorae_user') || '{}') };
    const token = session.token;
    const storedUser = session.user || {};

    const SUBJECTS_STORAGE_KEY = 'mentorae-subjects-data';

    // Dynamic Student Profile resolved from session
    const studentProfile = {
        gradeLevel: storedUser.grade_level ? Number(storedUser.grade_level) : 11,
        section: storedUser.section_name || storedUser.section || ""
    };

    function getTermLabel(subject) {
        if (!subject) return 'All Terms';
        if (subject.termLabel) return subject.termLabel;
        if (subject.term && typeof subject.term === 'string' && subject.term.toLowerCase().includes('term')) return subject.term;
        const q = subject.quarter != null ? Number(subject.quarter) : null;
        if (q === 0) return 'All Terms';
        if (q === 1) return '1st Term';
        if (q === 2) return '2nd Term';
        if (q === 3) return '3rd Term';
        return q ? `${q} Term` : 'All Terms';
    }

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
    const subjectTermDisplay = document.getElementById('subjectTermDisplay');
    const subjectMaterialsCountDisplay = document.getElementById('subjectMaterialsCountDisplay');
    const subjectStrandSectionDisplay = document.getElementById('subjectStrandSectionDisplay');
    const pageTitle = document.getElementById('pageTitle');
    const pageSubtitle = document.getElementById('pageSubtitle');
    const subjectTopicsTitle = document.getElementById('subjectTopicsTitle');

    // State Variables
    let decodedSubjectName;
    let decodedSectionName;
    let allSubjects = [];
    let currentSubject = null;
    let studentQuizSummaries = {};

    // --- Rendering Functions ---
    let currentTopicsData = [];
    let currentRecsData = [];

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
            const byteString = atob(parts[1]);
            let mimeString = parts[0].split(':')[1]?.split(';')[0];
            if (!mimeString || mimeString === 'application/octet-stream') {
                mimeString = getMimeTypeFromFilename(filename, mimeString);
            }
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            return new Blob([ab], { type: mimeString });
        } catch (e) {
            console.error('Error converting data URI to blob:', e);
            return null;
        }
    }

    function openClassroomViewer(fileName, dataUrl, topicTitle = '', targetFile = null) {
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

        viewerEl.classList.remove('d-none');
        document.body.style.overflow = 'hidden';

        const filesModal = getViewFilesModal();
        if (filesModal) filesModal.hide();

        const closeViewer = () => {
            viewerEl.classList.add('d-none');
            document.body.style.overflow = '';
            stageEl.innerHTML = '';
            if (modeSwitcherEl) modeSwitcherEl.innerHTML = '';
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
            } else {
                iconEl.className = 'bi bi-file-earmark-text fs-4 text-light';
            }
        }

        stageEl.innerHTML = '';
        if (modeSwitcherEl) modeSwitcherEl.innerHTML = '';

        let blobUrl = dataUrl;
        if (downloadBtn) {
            downloadBtn.href = dataUrl || '#';
            downloadBtn.setAttribute('download', fileName || 'lesson_file');
        }
        if (popoutBtn) {
            popoutBtn.href = dataUrl || '#';
        }

        if (dataUrl && dataUrl.startsWith('data:')) {
            fetch(dataUrl).then(r => r.blob()).then(b => {
                blobUrl = URL.createObjectURL(b);
                if (downloadBtn) downloadBtn.href = blobUrl;
                if (!targetFile?.pdfDataUrl && popoutBtn) popoutBtn.href = blobUrl;
            }).catch(() => {});
        }

        function setModeSwitcher(options) {
            if (!modeSwitcherEl) return;
            modeSwitcherEl.innerHTML = '';
            options.forEach(opt => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `viewer-mode-btn ${opt.active ? 'active' : ''}`;
                btn.innerHTML = `<i class="${opt.icon} me-1"></i> ${escapeHtml(opt.label)}`;
                btn.onclick = () => {
                    modeSwitcherEl.querySelectorAll('.viewer-mode-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    opt.action();
                };
                modeSwitcherEl.appendChild(btn);
            });
        }

        // ==========================================
        // 1. HIGH-DEFINITION PDF RENDERING (PDF.JS)
        // Works 100% on Phone (Safari/Chrome), InPrivate, & Desktop
        // ==========================================
        async function renderPdf(pdfData) {
            stageEl.innerHTML = `
                <div class="d-flex align-items-center justify-content-center w-100 h-100 text-white">
                    <div class="text-center">
                        <div class="spinner-border text-danger mb-3" style="width: 3rem; height: 3rem;" role="status"></div>
                        <p class="fs-5 fw-semibold mb-1">Rendering PDF Document...</p>
                        <p class="text-white-50 small">Loading authentic high-definition pages</p>
                    </div>
                </div>
            `;

            try {
                let pdfBytes;
                if (pdfData && pdfData.startsWith('data:')) {
                    const b64 = pdfData.split(',')[1];
                    const bin = atob(b64);
                    pdfBytes = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) {
                        pdfBytes[i] = bin.charCodeAt(i);
                    }
                } else if (pdfData) {
                    const res = await fetch(pdfData);
                    const ab = await res.arrayBuffer();
                    pdfBytes = new Uint8Array(ab);
                }

                if (!pdfBytes || pdfBytes.length === 0) throw new Error('Empty PDF data');
                if (!window.pdfjsLib) throw new Error('PDF.js not loaded');

                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

                const loadingTask = window.pdfjsLib.getDocument({ data: pdfBytes });
                const pdfDoc = await loadingTask.promise;
                const totalPages = pdfDoc.numPages;

                const isMobileScreen = window.innerWidth <= 768;
                let currentScale = isMobileScreen ? 1.0 : 1.25;
                let activePage = 1;

                stageEl.innerHTML = `
                    <div class="pdf-viewer-container d-flex flex-column w-100 h-100">
                        <div class="pdf-controls-bar d-flex justify-content-between align-items-center px-3 py-2 text-white">
                            <div class="d-flex align-items-center gap-2">
                                <button type="button" class="btn btn-sm btn-outline-light rounded-circle p-1 px-2" id="pdfPrevBtn" title="Previous Page">
                                    <i class="bi bi-chevron-left"></i>
                                </button>
                                <span class="small fw-semibold" id="pdfPageIndicator">Page 1 of ${totalPages}</span>
                                <button type="button" class="btn btn-sm btn-outline-light rounded-circle p-1 px-2" id="pdfNextBtn" title="Next Page">
                                    <i class="bi bi-chevron-right"></i>
                                </button>
                            </div>
                            <div class="d-flex align-items-center gap-2">
                                <button type="button" class="btn btn-sm btn-outline-light rounded-pill px-2.5 py-1" id="pdfZoomOutBtn" title="Zoom Out">
                                    <i class="bi bi-dash-lg"></i>
                                </button>
                                <span class="small fw-bold text-white-50 px-1" id="pdfZoomDisplay" style="min-width: 44px; text-align: center;">${Math.round(currentScale * 100)}%</span>
                                <button type="button" class="btn btn-sm btn-outline-light rounded-pill px-2.5 py-1" id="pdfZoomInBtn" title="Zoom In">
                                    <i class="bi bi-plus-lg"></i>
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-light rounded-pill px-3 py-1" id="pdfFitBtn" title="Fit Width">
                                    <i class="bi bi-arrows-expand me-1"></i> Fit
                                </button>
                            </div>
                        </div>
                        <div class="pdf-pages-viewport flex-grow-1 overflow-auto p-3 d-flex flex-column align-items-center gap-3" id="pdfPagesViewport"></div>
                    </div>
                `;

                const viewportEl = document.getElementById('pdfPagesViewport');
                const pageIndicatorEl = document.getElementById('pdfPageIndicator');
                const zoomDisplayEl = document.getElementById('pdfZoomDisplay');

                async function renderAllPages(scale) {
                    if (!viewportEl) return;
                    viewportEl.innerHTML = '';
                    const dpr = window.devicePixelRatio || 1;
                    const availWidth = Math.max(300, viewportEl.clientWidth - (isMobileScreen ? 16 : 48));

                    for (let num = 1; num <= totalPages; num++) {
                        const page = await pdfDoc.getPage(num);
                        const baseVp = page.getViewport({ scale: 1.0 });

                        let effectiveScale = scale;
                        if (isMobileScreen) {
                            effectiveScale = Math.min(scale, availWidth / baseVp.width);
                        }

                        const viewport = page.getViewport({ scale: effectiveScale * dpr });
                        const cssViewport = page.getViewport({ scale: effectiveScale });

                        const cardEl = document.createElement('div');
                        cardEl.className = 'pdf-page-card rounded-2 position-relative';
                        cardEl.dataset.pageNum = num;
                        cardEl.style.width = `${Math.round(cssViewport.width)}px`;
                        cardEl.style.height = `${Math.round(cssViewport.height)}px`;

                        const canvas = document.createElement('canvas');
                        canvas.width = viewport.width;
                        canvas.height = viewport.height;
                        canvas.style.width = `${Math.round(cssViewport.width)}px`;
                        canvas.style.height = `${Math.round(cssViewport.height)}px`;
                        canvas.style.display = 'block';

                        const ctx = canvas.getContext('2d');
                        cardEl.appendChild(canvas);
                        viewportEl.appendChild(cardEl);

                        await page.render({ canvasContext: ctx, viewport }).promise;
                    }
                }

                await renderAllPages(currentScale);

                viewportEl.addEventListener('scroll', () => {
                    const cards = viewportEl.querySelectorAll('.pdf-page-card');
                    const scrollTop = viewportEl.scrollTop + 100;
                    for (const c of cards) {
                        if (c.offsetTop <= scrollTop && (c.offsetTop + c.offsetHeight) > scrollTop) {
                            const p = parseInt(c.dataset.pageNum, 10);
                            if (p !== activePage) {
                                activePage = p;
                                if (pageIndicatorEl) pageIndicatorEl.textContent = `Page ${activePage} of ${totalPages}`;
                            }
                            break;
                        }
                    }
                });

                document.getElementById('pdfPrevBtn')?.addEventListener('click', () => {
                    if (activePage > 1) {
                        activePage--;
                        const targetCard = viewportEl.querySelector(`.pdf-page-card[data-page-num="${activePage}"]`);
                        if (targetCard) targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                });

                document.getElementById('pdfNextBtn')?.addEventListener('click', () => {
                    if (activePage < totalPages) {
                        activePage++;
                        const targetCard = viewportEl.querySelector(`.pdf-page-card[data-page-num="${activePage}"]`);
                        if (targetCard) targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                });

                document.getElementById('pdfZoomInBtn')?.addEventListener('click', async () => {
                    if (currentScale < 3.0) {
                        currentScale = Math.min(3.0, currentScale + 0.25);
                        if (zoomDisplayEl) zoomDisplayEl.textContent = `${Math.round(currentScale * 100)}%`;
                        await renderAllPages(currentScale);
                    }
                });

                document.getElementById('pdfZoomOutBtn')?.addEventListener('click', async () => {
                    if (currentScale > 0.5) {
                        currentScale = Math.max(0.5, currentScale - 0.25);
                        if (zoomDisplayEl) zoomDisplayEl.textContent = `${Math.round(currentScale * 100)}%`;
                        await renderAllPages(currentScale);
                    }
                });

                document.getElementById('pdfFitBtn')?.addEventListener('click', async () => {
                    const availWidth = Math.max(300, viewportEl.clientWidth - (isMobileScreen ? 16 : 48));
                    const firstPage = await pdfDoc.getPage(1);
                    const baseVp = firstPage.getViewport({ scale: 1.0 });
                    currentScale = Math.max(0.5, Math.min(2.5, availWidth / baseVp.width));
                    if (zoomDisplayEl) zoomDisplayEl.textContent = `${Math.round(currentScale * 100)}%`;
                    await renderAllPages(currentScale);
                });

                if (printBtn) {
                    printBtn.onclick = () => {
                        const printWin = window.open(blobUrl || dataUrl);
                        if (printWin) {
                            printWin.focus();
                            printWin.print();
                        }
                    };
                }

            } catch (err) {
                console.warn('PDF.js rendering fallback:', err);
                const embedUrl = blobUrl || pdfData;
                stageEl.innerHTML = `
                    <div class="w-100 h-100 position-relative">
                        <iframe src="${embedUrl}" class="w-100 h-100 border-0" title="${escapeHtml(fileName)}" style="background: #525659;"></iframe>
                        <div class="position-absolute bottom-0 start-50 translate-middle-x mb-4 bg-dark bg-opacity-90 px-4 py-2.5 rounded-pill border border-secondary shadow-lg d-flex align-items-center gap-3">
                            <span class="small text-white-50"><i class="bi bi-info-circle me-1"></i>If inline PDF is restricted:</span>
                            <a href="${embedUrl}" target="_blank" class="btn btn-sm btn-primary rounded-pill px-3 fw-bold">Open PDF in New Tab</a>
                        </div>
                    </div>
                `;
            }
        }

        // ==========================================
        // 2. ROUTE PDF FILES
        // ==========================================
        if (ext === 'pdf' || mime.includes('pdf')) {
            renderPdf(dataUrl);

            (async () => {
                try {
                    const token = localStorage.getItem('mentorae_token');
                    const pRes = await authedFetch('/api/content/public-preview-token', token, {
                        method: 'POST',
                        body: JSON.stringify({ fileName, dataUrl })
                    });
                    if (pRes && pRes.success && pRes.googleViewerUrl) {
                        if (popoutBtn) popoutBtn.href = pRes.publicUrl;
                        setModeSwitcher([
                            {
                                label: 'High-Def PDF',
                                icon: 'bi bi-file-earmark-pdf',
                                active: true,
                                action: () => renderPdf(dataUrl)
                            },
                            {
                                label: 'Google View',
                                icon: 'bi bi-google',
                                active: false,
                                action: () => {
                                    stageEl.innerHTML = `<iframe src="${pRes.googleViewerUrl}" class="w-100 h-100 border-0" allowfullscreen style="background: #525659;"></iframe>`;
                                }
                            }
                        ]);
                    }
                } catch (e) { }
            })();
            return;
        }

        // ==========================================
        // 3. PPT / PPTX & DOC / DOCX (Cloud Google Classroom + Office + Local Fallback)
        // ==========================================
        if (['pptx', 'ppt', 'docx', 'doc'].includes(ext)) {
            const isPpt = ext === 'pptx' || ext === 'ppt';
            stageEl.innerHTML = `
                <div class="d-flex align-items-center justify-content-center w-100 h-100 text-white">
                    <div class="text-center px-4" style="max-width: 520px;">
                        <div class="spinner-border ${isPpt ? 'text-warning' : 'text-primary'} mb-3" style="width: 3.5rem; height: 3.5rem;" role="status"></div>
                        <h5 class="fw-bold mb-1">Opening in Google Classroom View...</h5>
                        <p class="text-white-50 small mb-0">Connecting to authentic cloud document viewer</p>
                    </div>
                </div>
            `;

            (async () => {
                let previewInfo = null;
                const isLocal = (
                    window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1' ||
                    window.location.hostname === '' ||
                    window.location.protocol === 'file:'
                );

                try {
                    const token = localStorage.getItem('mentorae_token');
                    const pRes = await authedFetch('/api/content/public-preview-token', token, {
                        method: 'POST',
                        body: JSON.stringify({ fileName, dataUrl })
                    });
                    if (pRes && pRes.success) {
                        previewInfo = pRes;
                        if (popoutBtn) popoutBtn.href = pRes.publicUrl;
                    }
                } catch (tokErr) {
                    console.warn('Public preview token request failed:', tokErr);
                }

                function renderGoogleView() {
                    if (previewInfo && previewInfo.googleViewerUrl) {
                        stageEl.innerHTML = `
                            <iframe src="${previewInfo.googleViewerUrl}" class="w-100 h-100 border-0" allowfullscreen title="${escapeHtml(fileName)}" style="background: #202124;"></iframe>
                        `;
                    } else {
                        if (isPpt) renderPptxFallback();
                        else renderDocxFallback();
                    }
                }

                function renderOfficeView() {
                    if (previewInfo && previewInfo.officeViewerUrl) {
                        stageEl.innerHTML = `
                            <iframe src="${previewInfo.officeViewerUrl}" class="w-100 h-100 border-0" allowfullscreen title="${escapeHtml(fileName)}" style="background: #202124;"></iframe>
                        `;
                    } else {
                        if (isPpt) renderPptxFallback();
                        else renderDocxFallback();
                    }
                }

                if (!isLocal && previewInfo && previewInfo.googleViewerUrl) {
                    setModeSwitcher([
                        {
                            label: 'Google View',
                            icon: 'bi bi-google',
                            active: true,
                            action: renderGoogleView
                        },
                        {
                            label: 'Office View',
                            icon: 'bi bi-microsoft',
                            active: false,
                            action: renderOfficeView
                        },
                        {
                            label: isPpt ? 'Slide Deck' : 'Document Reader',
                            icon: isPpt ? 'bi bi-file-slides' : 'bi bi-file-text',
                            active: false,
                            action: () => {
                                if (isPpt) renderPptxFallback();
                                else renderDocxFallback();
                            }
                        }
                    ]);
                    renderGoogleView();
                } else {
                    if (previewInfo && previewInfo.googleViewerUrl) {
                        setModeSwitcher([
                            {
                                label: isPpt ? 'Slide Deck' : 'Document Reader',
                                icon: isPpt ? 'bi bi-file-slides' : 'bi bi-file-text',
                                active: true,
                                action: () => {
                                    if (isPpt) renderPptxFallback();
                                    else renderDocxFallback();
                                }
                            },
                            {
                                label: 'Google View',
                                icon: 'bi bi-google',
                                active: false,
                                action: renderGoogleView
                            },
                            {
                                label: 'Office View',
                                icon: 'bi bi-microsoft',
                                active: false,
                                action: renderOfficeView
                            }
                        ]);
                    }
                    if (isPpt) renderPptxFallback();
                    else renderDocxFallback();
                }
            })();
            return;
        }

        function renderPptxFallback() {
            stageEl.innerHTML = `
                <div class="d-flex align-items-center justify-content-center w-100 h-100 text-white">
                    <div class="text-center">
                        <div class="spinner-border text-warning mb-3" style="width: 3rem; height: 3rem;" role="status"></div>
                        <p class="fs-5 fw-semibold mb-1">Opening PowerPoint Presentation...</p>
                        <p class="text-white-50 small">Rendering visual layouts, graphics, and themes</p>
                    </div>
                </div>
            `;
            (async () => {
                try {
                    let arrayBuffer;
                    if (dataUrl && dataUrl.startsWith('data:')) {
                        const res = await fetch(dataUrl);
                        arrayBuffer = await res.arrayBuffer();
                    }
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
                                let mime = 'image/png';
                                const lower = path.toLowerCase();
                                if (lower.endsWith('.svg')) mime = 'image/svg+xml';
                                else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mime = 'image/jpeg';
                                else if (lower.endsWith('.gif')) mime = 'image/gif';
                                else if (lower.endsWith('.webp')) mime = 'image/webp';

                                const u8 = await zip.files[path].async('uint8array');
                                const mBlob = new Blob([u8], { type: mime });
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

                                            // Proportional scale relative to 960pt slide width
                                            const fontSizeCqw = ((szPt / 960) * 100).toFixed(3);

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
                                elementsHtml += `<div style="position: absolute; left: ${el.left.toFixed(2)}%; top: ${el.top.toFixed(2)}%; width: ${el.width.toFixed(2)}%; min-height: ${el.height.toFixed(2)}%; z-index: 3; box-sizing: border-box; padding: 2px 4px; overflow: hidden;">`;
                                el.paragraphs.forEach(p => {
                                    elementsHtml += `<div style="text-align: ${p.align}; margin-bottom: 2px; line-height: 1.25;">`;
                                    p.runs.forEach(r => {
                                        if (r.isBr) {
                                            elementsHtml += '<br>';
                                        } else {
                                            const styles = [
                                                `color: ${r.color};`,
                                                `font-family: ${r.fontFamily};`,
                                                `font-size: clamp(13px, ${r.fontSizeCqw}cqw, 48px);`,
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
                                    <div class="pptx-bottom-toolbar">
                                        <button type="button" class="btn btn-sm btn-dark rounded-circle p-2 d-flex align-items-center justify-content-center text-white" id="pptxPrevBtn" ${activeSlide === 0 ? 'disabled' : ''} title="Previous Slide (Left Arrow)">
                                            <i class="bi bi-chevron-left"></i>
                                        </button>
                                        <span class="fw-bold text-white small px-2">
                                            Slide ${activeSlide + 1} of ${slides.length}
                                        </span>
                                        <button type="button" class="btn btn-sm btn-dark rounded-circle p-2 d-flex align-items-center justify-content-center text-white" id="pptxNextBtn" ${activeSlide === slides.length - 1 ? 'disabled' : ''} title="Next Slide (Right Arrow)">
                                            <i class="bi bi-chevron-right"></i>
                                        </button>
                                        <div class="vr bg-secondary my-1"></div>
                                        <button type="button" class="btn btn-sm ${viewMode === 'visual' ? 'btn-primary' : 'btn-outline-light'} rounded-pill px-3 py-1 fs-8 fw-semibold" id="pptxToggleVisualBtn">
                                            <i class="bi bi-file-slides me-1"></i> Slide Design
                                        </button>
                                        <button type="button" class="btn btn-sm ${viewMode === 'outline' ? 'btn-primary' : 'btn-outline-light'} rounded-pill px-3 py-1 fs-8 fw-semibold" id="pptxToggleOutlineBtn">
                                            <i class="bi bi-list-columns-reverse me-1"></i> Content Outline
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;

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
                    }

                    renderPresentation();

                } catch (err) {
                    console.error('Error rendering PPTX presentation:', err);
                    stageEl.innerHTML = `
                        <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 500px;">
                            <i class="bi bi-file-earmark-slides text-warning" style="font-size: 5rem;"></i>
                            <h4 class="fw-bold text-white mt-3">${escapeHtml(fileName)}</h4>
                            <p class="text-white-50 mb-4">Click download below to view this presentation in Microsoft Office or Google Slides.</p>
                            <a href="${blobUrl}" download="${escapeHtml(fileName)}" class="btn btn-primary btn-lg rounded-pill px-5 fw-bold">
                                <i class="bi bi-download me-2"></i> Download Presentation
                            </a>
                        </div>
                    `;
                }
            })();
        }

        function renderDocxFallback() {
            stageEl.innerHTML = `
                <div class="d-flex align-items-center justify-content-center w-100 h-100 text-white">
                    <div class="text-center">
                        <div class="spinner-border text-primary mb-3" style="width: 3rem; height: 3rem;" role="status"></div>
                        <p class="fs-5 fw-semibold mb-1">Opening Word Document...</p>
                    </div>
                </div>
            `;
            (async () => {
                try {
                    let arrayBuffer;
                    if (dataUrl && dataUrl.startsWith('data:')) {
                        const res = await fetch(dataUrl);
                        arrayBuffer = await res.arrayBuffer();
                    }
                    if (!arrayBuffer) throw new Error('No array buffer');

                    const result = await mammoth.convertToHtml({ arrayBuffer });
                    stageEl.innerHTML = `
                        <div class="docx-paper-container">
                            <div class="docx-page-card">
                                ${result.value || '<p class="text-muted fst-italic">Empty Document.</p>'}
                            </div>
                        </div>
                    `;
                } catch (err) {
                    console.error('Error rendering DOCX:', err);
                    stageEl.innerHTML = `
                        <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 500px;">
                            <i class="bi bi-file-earmark-word text-primary" style="font-size: 5rem;"></i>
                            <h4 class="fw-bold text-white mt-3">${escapeHtml(fileName)}</h4>
                            <p class="text-white-50 mb-4">Click download below to view this Word document in Microsoft Word or Google Docs.</p>
                            <a href="${blobUrl || dataUrl}" download="${escapeHtml(fileName)}" class="btn btn-primary btn-lg rounded-pill px-5 fw-bold">
                                <i class="bi bi-download me-2"></i> Download Document
                            </a>
                        </div>
                    `;
                }
            })();
        }

        if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
            stageEl.innerHTML = `
                <div class="d-flex align-items-center justify-content-center w-100 h-100 p-4" style="background-color: #0b0c0e;">
                    <img src="${blobUrl || dataUrl}" alt="${escapeHtml(fileName)}" class="img-fluid rounded shadow-lg" style="max-height: 90vh; max-width: 95vw; object-fit: contain;">
                </div>
            `;
            return;
        }

        if (['mp4', 'webm', 'ogg'].includes(ext)) {
            stageEl.innerHTML = `
                <div class="d-flex align-items-center justify-content-center w-100 h-100 p-4" style="background-color: #000;">
                    <video controls autoplay class="rounded shadow-lg" style="max-width: 90vw; max-height: 85vh;">
                        <source src="${blobUrl || dataUrl}" type="${mime}">Your browser does not support video.
                    </video>
                </div>
            `;
            return;
        }

        if (['mp3', 'wav', 'ogg'].includes(ext)) {
            stageEl.innerHTML = `
                <div class="d-flex align-items-center justify-content-center w-100 h-100 text-white">
                    <div class="text-center p-5 bg-dark rounded-4 border border-secondary shadow-lg" style="max-width: 480px; width: 90%;">
                        <i class="bi bi-music-note-beamed text-primary fs-1 mb-3 d-block"></i>
                        <h5 class="fw-bold text-white mb-4">${escapeHtml(fileName)}</h5>
                        <audio controls autoplay class="w-100"><source src="${blobUrl || dataUrl}" type="${mime}">Your browser does not support audio.</audio>
                    </div>
                </div>
            `;
            return;
        }

        if (['txt', 'csv', 'json', 'log', 'md', 'html', 'js', 'css', 'xml'].includes(ext)) {
            let textContent = '';
            try {
                if (dataUrl && dataUrl.startsWith('data:')) {
                    textContent = atob(dataUrl.split(',')[1]);
                }
            } catch (e) {}

            stageEl.innerHTML = `
                <div class="docx-paper-container">
                    <div class="docx-paper-sheet font-monospace" style="white-space: pre-wrap; font-size: 0.95rem;">
                        ${escapeHtml(textContent || '')}
                    </div>
                </div>
            `;
            return;
        }

        // Generic safe fallback for other file formats
        stageEl.innerHTML = `
            <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 500px;">
                <i class="bi bi-file-earmark-text text-secondary" style="font-size: 5rem;"></i>
                <h4 class="fw-bold text-white mt-3">${escapeHtml(fileName)}</h4>
                <p class="text-white-50 mb-4">Click download below to access and open this file on your device.</p>
                <a href="${blobUrl || dataUrl}" download="${escapeHtml(fileName)}" class="btn btn-primary btn-lg rounded-pill px-5 fw-bold">
                    <i class="bi bi-download me-2"></i> Download File
                </a>
            </div>
        `;
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
                files.forEach((file, fIdx) => {
                    const li = document.createElement('li');
                    li.className = 'list-group-item d-flex justify-content-between align-items-center py-2.5 px-3';
                    
                    let fileUrl = '#';
                    if (file.dataUrl) {
                        if (file.dataUrl.startsWith('data:')) {
                            const blob = dataURItoBlob(file.dataUrl, file.name || '');
                            fileUrl = blob ? URL.createObjectURL(blob) : file.dataUrl;
                        } else {
                            fileUrl = file.dataUrl;
                        }
                    }

                    li.innerHTML = `
                        <div class="d-flex align-items-center gap-2 text-truncate me-2">
                            <i class="bi bi-file-earmark-text-fill text-primary fs-5"></i>
                            <div>                                 <span class="fw-semibold text-dark d-block text-truncate small">${escapeHtml(file.name || 'Attached File')}</span>
                                <div class="d-flex align-items-center gap-1.5">
                                    ${file.size ? `<span class="micro-text text-muted">${(file.size / 1024).toFixed(1)} KB</span>` : ''}
                                    ${file.pdfDataUrl ? '<span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2 py-0.5" style="font-size: 0.65rem;">HD Classroom View</span>' : ''}
                                </div>
                            </div>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <button type="button" class="btn btn-sm btn-primary fw-semibold rounded-pill px-3 py-1 text-nowrap btn-open-online-viewer" data-findex="${fIdx}">
                                <i class="bi bi-eye me-1"></i> Read Online
                            </button>
                            <a href="${fileUrl}" download="${escapeHtml(file.name || 'download')}" class="btn btn-sm btn-outline-success fw-semibold rounded-pill px-3 py-1 text-nowrap">
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
                            openClassroomViewer(targetFile.name, targetFile.dataUrl, title, targetFile);
                        }
                    });
                });
            }
        }
        const modalInstance = getViewFilesModal();
        if (modalInstance) modalInstance.show();
    }

    function renderTopics(topics) {
        topicsList.innerHTML = ''; 

        const topicsToDisplay = (topics || []).filter(topic => {
            const isPublic = !topic.visibleTo || topic.visibleTo.length === 0 || topic.visibleTo.includes('All Sections');
            if (isPublic) return true;
            if (!decodedSectionName || decodedSectionName === 'All Sections') return true;
            return Array.isArray(topic.visibleTo) && topic.visibleTo.includes(decodedSectionName);
        });

        currentTopicsData = topicsToDisplay;

        if (topicsToDisplay.length === 0) {
            topicsList.innerHTML = '<div class="col-12"><p class="text-muted text-center p-3">No topics available for this subject yet.</p></div>';
            return;
        }

        topicsToDisplay.forEach((topic, index) => {
            const col = document.createElement('div');
            col.className = 'col-12 col-md-6 d-flex';

            const topicCard = document.createElement('div');
            topicCard.className = 'card topic-item-card border p-3 shadow-sm rounded-4 bg-white w-100 d-flex flex-column justify-content-between';
            topicCard.style.borderColor = '#a3b899';

            // Only generate action buttons for materials that ACTUALLY exist
            let actionButtons = [];

            if (topic.files && topic.files.length > 0) {
                actionButtons.push(`
                    <button type="button" class="btn btn-sm btn-outline-primary fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-nowrap btn-open-topic-files" data-topic-index="${index}">
                        <i class="bi bi-file-earmark-text text-primary"></i> Files (${topic.files.length})
                    </button>
                `);
            }

            if (topic.flashcards && topic.flashcards.length > 0) {
                actionButtons.push(`
                    <a href="flashcard_viewer_student.html?subject=${encodeURIComponent(decodedSubjectName)}&topic=${encodeURIComponent(topic.title)}&section=${encodeURIComponent(decodedSectionName)}" class="btn btn-sm fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-nowrap text-decoration-none btn-chip-flashcard">
                        <i class="bi bi-stack"></i> Flashcards (${topic.flashcards.length})
                    </a>
                `);
            }

            if (topic.quiz && topic.quiz.length > 0) {
                const topicKey = (topic.title || '').trim().toLowerCase();
                const summary = studentQuizSummaries[topicKey];
                let scoreBadge = '';
                if (summary) {
                    const bestPct = summary.bestPercentage;
                    let badgeClass = 'bg-warning-subtle text-warning-emphasis border-warning-subtle';
                    let badgeIcon = 'bi-arrow-repeat';
                    if (bestPct >= 80) {
                        badgeClass = 'bg-success-subtle text-success border-success-subtle';
                        badgeIcon = 'bi-star-fill text-warning';
                    } else if (bestPct >= 60) {
                        badgeClass = 'bg-primary-subtle text-primary border-primary-subtle';
                        badgeIcon = 'bi-check2-circle';
                    }
                    scoreBadge = `<span class="badge ${badgeClass} border px-2.5 py-1 rounded-pill fw-semibold micro-text" title="Attempted ${summary.attemptsCount} time(s)"><i class="bi ${badgeIcon} me-1"></i>Best: ${summary.bestScore}/${summary.totalQuestions} (${Math.round(bestPct)}%)</span>`;
                }
                actionButtons.push(`
                    <div class="d-inline-flex align-items-center gap-1.5 flex-wrap">
                        <a href="quiz_taker_student.html?subject=${encodeURIComponent(decodedSubjectName)}&topic=${encodeURIComponent(topic.title)}&section=${encodeURIComponent(decodedSectionName)}" class="btn btn-sm btn-success fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-white text-nowrap text-decoration-none">
                            <i class="bi bi-question-circle"></i> Quiz (${topic.quiz.length} Qs)
                        </a>
                        ${scoreBadge}
                    </div>
                `);
            }

            const actionsHtml = actionButtons.length > 0
                ? `<div class="d-flex flex-wrap align-items-center gap-2 mt-3 pt-2 border-top">${actionButtons.join('')}</div>`
                : `<div class="mt-3 pt-2 border-top"><span class="badge bg-light text-muted border fw-normal micro-text px-2.5 py-1.5 rounded-pill"><i class="bi bi-info-circle me-1"></i> No study materials attached yet</span></div>`;

            topicCard.innerHTML = `
                <div class="d-flex align-items-start gap-3 flex-grow-1">
                    <div class="topic-icon-box bg-success-subtle text-success rounded-3 flex-shrink-0 p-2">
                        <i class="bi bi-journal-text fs-4"></i>
                    </div>
                    <div class="flex-grow-1">
                        <h3 class="fw-bold fs-6 text-dark m-0">${topic.title}</h3>
                        <p class="micro-text text-secondary m-0 mt-1">${topic.description}</p>
                        ${topic.createdAt ? `
                            <p class="micro-text text-muted m-0 mt-2"><i class="bi bi-clock-history me-1"></i>Created on ${new Date(topic.createdAt).toLocaleDateString()} ${topic.createdBy ? `by ${topic.createdBy}` : ''}</p>
                        ` : ''}
                    </div>
                </div>
                <div class="w-100">
                    ${actionsHtml}
                </div>
            `;
            col.appendChild(topicCard);
            topicsList.appendChild(col);
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
            recommendationsList.innerHTML = '<div class="col-12"><p class="text-muted text-center small py-3">No recommendations for this subject yet.</p></div>';
            return;
        }

        recommendations.forEach((rec, index) => {
            let actionButtons = [];

            if (rec.files && rec.files.length > 0) {
                actionButtons.push(`
                    <button type="button" class="btn btn-sm btn-outline-primary fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-nowrap btn-open-rec-files" data-rec-index="${index}">
                        <i class="bi bi-file-earmark-text text-primary"></i> Files (${rec.files.length})
                    </button>
                `);
            }

            if (rec.flashcards && rec.flashcards.length > 0) {
                actionButtons.push(`
                    <a href="flashcard_viewer_student.html?subject=${encodeURIComponent(decodedSubjectName)}&topic=${encodeURIComponent(rec.title)}&source=recommendation&section=${encodeURIComponent(decodedSectionName)}" class="btn btn-sm fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-nowrap text-decoration-none btn-chip-flashcard">
                        <i class="bi bi-stack"></i> Flashcards (${rec.flashcards.length})
                    </a>
                `);
            }

            if (rec.quiz && rec.quiz.length > 0) {
                const recKey = (rec.title || '').trim().toLowerCase();
                const summary = studentQuizSummaries[recKey];
                let scoreBadge = '';
                if (summary) {
                    const bestPct = summary.bestPercentage;
                    let badgeClass = 'bg-warning-subtle text-warning-emphasis border-warning-subtle';
                    let badgeIcon = 'bi-arrow-repeat';
                    if (bestPct >= 80) {
                        badgeClass = 'bg-success-subtle text-success border-success-subtle';
                        badgeIcon = 'bi-star-fill text-warning';
                    } else if (bestPct >= 60) {
                        badgeClass = 'bg-primary-subtle text-primary border-primary-subtle';
                        badgeIcon = 'bi-check2-circle';
                    }
                    scoreBadge = `<span class="badge ${badgeClass} border px-2.5 py-1 rounded-pill fw-semibold micro-text" title="Attempted ${summary.attemptsCount} time(s)"><i class="bi ${badgeIcon} me-1"></i>Best: ${summary.bestScore}/${summary.totalQuestions} (${Math.round(bestPct)}%)</span>`;
                }
                actionButtons.push(`
                    <div class="d-inline-flex align-items-center gap-1.5 flex-wrap">
                        <a href="quiz_taker_student.html?subject=${encodeURIComponent(decodedSubjectName)}&topic=${encodeURIComponent(rec.title)}&source=recommendation&section=${encodeURIComponent(decodedSectionName)}" class="btn btn-sm btn-success fw-semibold px-3 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 text-white text-nowrap text-decoration-none">
                            <i class="bi bi-question-circle"></i> Quiz (${rec.quiz.length} Qs)
                        </a>
                        ${scoreBadge}
                    </div>
                `);
            }

            const actionsHtml = actionButtons.length > 0
                ? `<div class="d-flex flex-wrap align-items-center gap-2 mt-3 pt-2 border-top">${actionButtons.join('')}</div>`
                : `<div class="mt-3 pt-2 border-top"><span class="badge bg-light text-muted border fw-normal micro-text px-2.5 py-1.5 rounded-pill"><i class="bi bi-info-circle me-1"></i> No study materials attached yet</span></div>`;

            const col = document.createElement('div');
            col.className = 'col-12 col-md-6 d-flex';

            const recCard = document.createElement('div');
            recCard.className = 'card topic-item-card border-0 shadow-sm overflow-hidden rounded-4 w-100 d-flex flex-column justify-content-between';
            recCard.innerHTML = `
                <div class="classroom-banner ${rec.color || 'bg-card-green'} p-3 text-white d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1 me-3">
                        <h3 class="fw-bold m-0 fs-5 text-white">${rec.title}</h3>
                    </div>
                </div>
                <div class="card-body p-3 bg-white d-flex flex-column flex-grow-1 justify-content-between">
                    <div>
                        <p class="small text-secondary m-0 card-desc-text">${rec.description}</p>
                        ${actionsHtml}
                    </div>
                    <div class="mt-3 border-top pt-2">
                        ${rec.comment ? `<p class="micro-text text-muted fst-italic m-0">Teacher Comment: ${rec.comment}</p>` : ''}
                        ${rec.createdAt ? `<p class="micro-text text-muted m-0 mt-1"><i class="bi bi-clock-history me-1"></i>Created on ${new Date(rec.createdAt).toLocaleDateString()}</p>` : ''}
                    </div>
                </div>
            `;
            col.appendChild(recCard);
            recommendationsList.appendChild(col);
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
        if (pageSubtitle) {
            pageSubtitle.textContent = (decodedSectionName && decodedSectionName !== 'All Sections')
                ? `Section: ${decodedSectionName}`
                : 'Senior High School Curriculum';
        }
        if (subjectTopicsTitle) subjectTopicsTitle.textContent = `Topics for ${decodedSubjectName}`;
        document.title = `Mentorae - ${decodedSubjectName} Details`;

        allSubjects = loadSubjects();
        currentSubject = allSubjects.find(s => s.name && s.name.trim().toLowerCase() === decodedSubjectName.trim().toLowerCase());

        function updateDisplay() {
            if (currentSubject) {
                const termText = getTermLabel(currentSubject);
                if (subjectNameDisplay) subjectNameDisplay.textContent = currentSubject.name || decodedSubjectName;
                if (subjectCodeDisplay) subjectCodeDisplay.textContent = currentSubject.code || 'N/A';
                if (subjectDescriptionDisplay) {
                    subjectDescriptionDisplay.textContent = currentSubject.description && currentSubject.description.trim()
                        ? currentSubject.description.trim()
                        : 'Explore learning resources, practice quizzes, and flashcards for this subject.';
                }
                if (subjectCategoryDisplay) subjectCategoryDisplay.textContent = currentSubject.category || currentSubject.classification || 'Core Subject';
                if (subjectGradeDisplay) subjectGradeDisplay.textContent = currentSubject.gradeLevel != null ? currentSubject.gradeLevel : (currentSubject.grade_level != null ? currentSubject.grade_level : 11);
                if (subjectTermDisplay) subjectTermDisplay.textContent = termText;
                if (subjectQuarterDisplay) subjectQuarterDisplay.textContent = termText;
                if (subjectStrandSectionDisplay) subjectStrandSectionDisplay.textContent = currentSubject.strandSection || currentSubject.strand_section || 'All Sections';

                const totalTopics = (currentSubject.topics?.length || 0) + (currentSubject.recommendations?.length || 0);
                if (subjectMaterialsCountDisplay) {
                    subjectMaterialsCountDisplay.textContent = `${totalTopics} ${totalTopics === 1 ? 'Topic' : 'Topics'}`;
                }

                renderTopics(currentSubject.topics);
                renderRecommendations(currentSubject.recommendations);
            }
        }

        if (currentSubject) {
            updateDisplay();
        } else {
            currentSubject = { name: decodedSubjectName, topics: [], recommendations: [] };
        }

        // Live sync subject details & topics from database
        syncSubjectAndTopicsFromDb();
    }

    async function syncSubjectAndTopicsFromDb() {
        try {
            const activeToken = token || localStorage.getItem('mentorae_token');
            if (!activeToken) return;

            // 1. Authoritative: Fetch live topics & study materials from content API first
            const data = await authedFetch(`/api/content/topics?subjectName=${encodeURIComponent(decodedSubjectName)}`, activeToken);
            if (data && data.success) {
                if (!currentSubject) {
                    currentSubject = { name: decodedSubjectName, topics: [], recommendations: [] };
                }
                currentSubject.topics = data.topics || [];
                currentSubject.recommendations = data.recommendations || [];
                const totalTopics = (currentSubject.topics?.length || 0) + (currentSubject.recommendations?.length || 0);
                if (subjectMaterialsCountDisplay) {
                    subjectMaterialsCountDisplay.textContent = `${totalTopics} ${totalTopics === 1 ? 'Topic' : 'Topics'}`;
                }

                // Load student quiz summary for this subject to display badges
                try {
                    const summaryRes = await authedFetch(`/api/content/topic-quiz/student-summary?subjectName=${encodeURIComponent(decodedSubjectName)}`, activeToken);
                    if (summaryRes && summaryRes.success) {
                        studentQuizSummaries = summaryRes.summaries || {};
                    }
                } catch (sumErr) {
                    console.warn('Could not load student quiz summaries:', sumErr);
                }

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
                        const sanitized = cachedSubjects.map(subj => ({
                            ...subj,
                            topics: (subj.topics || []).map(t => ({
                                ...t,
                                files: (t.files || []).map(f => ({ name: f.name, type: f.type, size: f.size }))
                            })),
                            recommendations: (subj.recommendations || []).map(r => ({
                                ...r,
                                files: (r.files || []).map(f => ({ name: f.name, type: f.type, size: f.size }))
                            }))
                        }));
                        localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(sanitized));
                    }
                } catch (cacheErr) {
                    console.warn('Could not cache student topics into localStorage:', cacheErr);
                }
            }

            // 2. Fetch subject metadata (without overwriting topics payload)
            try {
                const subjData = await authedFetch('/api/reference/subjects', activeToken);
                if (subjData && subjData.success && Array.isArray(subjData.subjects)) {
                    const found = subjData.subjects.find(s => s.name && s.name.trim().toLowerCase() === decodedSubjectName.trim().toLowerCase());
                    if (found) {
                        currentSubject.code = found.code || currentSubject.code;
                        currentSubject.description = found.description || currentSubject.description;
                        currentSubject.category = found.category || found.classification || currentSubject.category;
                        currentSubject.gradeLevel = found.gradeLevel != null ? found.gradeLevel : (found.grade_level != null ? found.grade_level : currentSubject.gradeLevel);
                        currentSubject.quarter = found.quarter != null ? found.quarter : currentSubject.quarter;
                        currentSubject.term = found.term || currentSubject.term;
                        currentSubject.strand = found.strand || currentSubject.strand;
                        currentSubject.strandSection = found.strandSection || found.strand_section || currentSubject.strandSection;

                        const termText = getTermLabel(currentSubject);
                        if (subjectNameDisplay) subjectNameDisplay.textContent = currentSubject.name || decodedSubjectName;
                        if (subjectCodeDisplay) subjectCodeDisplay.textContent = currentSubject.code || 'N/A';
                        if (subjectDescriptionDisplay) {
                            subjectDescriptionDisplay.textContent = currentSubject.description && currentSubject.description.trim()
                                ? currentSubject.description.trim()
                                : 'Explore learning resources, practice quizzes, and flashcards for this subject.';
                        }
                        if (subjectCategoryDisplay) subjectCategoryDisplay.textContent = currentSubject.category || currentSubject.classification || 'Core Subject';
                        if (subjectGradeDisplay) subjectGradeDisplay.textContent = currentSubject.gradeLevel != null ? currentSubject.gradeLevel : 11;
                        if (subjectTermDisplay) subjectTermDisplay.textContent = termText;
                        if (subjectQuarterDisplay) subjectQuarterDisplay.textContent = termText;
                        if (subjectStrandSectionDisplay) subjectStrandSectionDisplay.textContent = currentSubject.strandSection || 'All Sections';
                    }
                }
            } catch (metaErr) {
                console.warn('Could not refresh subject metadata:', metaErr);
            }
        } catch (e) {
            console.error('Failed to fetch student topics from DB:', e);
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