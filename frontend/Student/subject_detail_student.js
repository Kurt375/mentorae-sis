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
        document.body.style.overflow = 'hidden';

        const filesModal = getViewFilesModal();
        if (filesModal) filesModal.hide();

        const closeViewer = () => {
            viewerEl.classList.add('d-none');
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

    function openFilesModal(title, files, topic = null) {
        const modalTitle = document.getElementById('modalTopicTitle');
        const modalFilesList = document.getElementById('modalFilesList');
        if (modalTitle) modalTitle.textContent = title;
        if (modalFilesList) {
            modalFilesList.innerHTML = '';
            if (!files || files.length === 0) {
                modalFilesList.innerHTML = '<li class="list-group-item text-muted text-center py-3">No files available for this topic.</li>';
            } else {
                files.forEach((file, fIdx) => {
                    if (topic && topic.id && file.topicId === undefined) {
                        file.topicId = topic.id;
                        file.fileIndex = fIdx;
                    }
                    const li = document.createElement('li');
                    li.className = 'list-group-item d-flex justify-content-between align-items-center py-2.5 px-3';

                    const fileUrl = getResolvedFileUrl(file, '', title) || '#';

                    li.innerHTML = `
                        <div class="d-flex align-items-center gap-2 text-truncate me-2">
                            <i class="bi bi-file-earmark-text-fill text-primary fs-5"></i>
                            <div>
                                <span class="fw-semibold text-dark d-block text-truncate small">${escapeHtml(file.name || 'Attached File')}</span>
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
                    openFilesModal(t.title, t.files, t);
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
                    openFilesModal(r.title, r.files, r);
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