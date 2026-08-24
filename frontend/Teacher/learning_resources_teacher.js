document.addEventListener('DOMContentLoaded', () => {
    const { token } = requireSession('../login.html');

    const sectionSelect = document.getElementById('sectionSelect');
    const subjectSelect = document.getElementById('subjectSelect');
    const filterSection = document.getElementById('filterSection');
    const modulesList = document.getElementById('modulesList');
    const uploadForm = document.getElementById('uploadForm');
    const uploadBtn = document.getElementById('uploadBtn');
    const replaceFileInput = document.getElementById('replaceFileInput');

    function formatSection(s) {
        return `${s.strandCode} ${s.grade_level} - ${s.name}`;
    }
    function formatSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    function fileIcon(mime) {
        if (mime === 'application/pdf') return 'bi-file-earmark-pdf text-danger';
        if (mime.includes('word')) return 'bi-file-earmark-word text-primary';
        if (mime.includes('presentation') || mime.includes('powerpoint')) return 'bi-file-earmark-slides text-warning';
        if (mime.includes('sheet') || mime.includes('excel')) return 'bi-file-earmark-spreadsheet text-success';
        if (mime.startsWith('image/')) return 'bi-file-earmark-image text-info';
        return 'bi-file-earmark-text text-secondary';
    }

    // --- Section / Subject dropdowns ---
    async function loadSections() {
        const data = await authedFetch('/api/classes/my-sections', token);
        if (!data.success || !data.sections.length) {
            sectionSelect.innerHTML = '<option value="">No sections assigned</option>';
            filterSection.innerHTML = '<option value="">No sections assigned</option>';
            return;
        }
        const options = data.sections.map(s => `<option value="${s.id}">${formatSection(s)}</option>`).join('');
        sectionSelect.innerHTML = options;
        filterSection.innerHTML = '<option value="">All sections</option>' + options;
        await loadSubjects(sectionSelect.value);
        loadModules();
    }

    async function loadSubjects(sectionId) {
        if (!sectionId) {
            subjectSelect.innerHTML = '<option value="">Select a section first…</option>';
            return;
        }
        const data = await authedFetch(`/api/classes/my-subjects?sectionId=${sectionId}`, token);
        if (!data.success || !data.subjects.length) {
            subjectSelect.innerHTML = '<option value="">No subjects for this section</option>';
            return;
        }
        subjectSelect.innerHTML = data.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }

    sectionSelect.addEventListener('change', () => loadSubjects(sectionSelect.value));
    filterSection.addEventListener('change', loadModules);

    // --- Upload new module ---
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const files = document.getElementById('filesInput').files;
        if (!files.length) return;

        const formData = new FormData();
        formData.append('title', document.getElementById('titleInput').value.trim());
        formData.append('description', document.getElementById('descriptionInput').value.trim());
        formData.append('subjectId', subjectSelect.value);
        formData.append('sectionId', sectionSelect.value);
        formData.append('quarter', document.getElementById('quarterSelect').value);
        for (const f of files) formData.append('files', f);

        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Posting…';
        try {
            const res = await fetch(`${window.MENTORAE_CONFIG.API_BASE_URL}/api/resources`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }, // no Content-Type — browser sets the multipart boundary
                body: formData,
            });
            const data = await res.json();
            if (!data.success) {
                alert(data.message);
                return;
            }
            uploadForm.reset();
            loadModules();
        } catch (err) {
            console.error(err);
            alert('Could not reach the server.');
        } finally {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = '<i class="bi bi-cloud-upload"></i> Post Material';
        }
    });

    // --- List / render modules ---
    async function loadModules() {
        const sectionId = filterSection.value;
        const url = sectionId ? `/api/resources/mine?sectionId=${sectionId}` : '/api/resources/mine';
        const data = await authedFetch(url, token);
        if (!data.success) {
            modulesList.innerHTML = `<p class="text-danger small">${data.message}</p>`;
            return;
        }
        renderModules(data.modules);
    }

    function renderModules(modules) {
        if (!modules.length) {
            modulesList.innerHTML = '<p class="text-muted small">No materials posted yet.</p>';
            return;
        }
        modulesList.innerHTML = modules.map(m => `
            <div class="module-card">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h6 class="fw-bold mb-1">${m.title}</h6>
                        <p class="text-muted small mb-1">${m.subjectName} • ${m.sectionName ? formatSection({ strandCode: m.strandCode, grade_level: m.grade_level, name: m.sectionName }) : 'All sections'} • ${m.quarter}</p>
                        ${m.description ? `<p class="small mb-2">${m.description}</p>` : ''}
                    </div>
                    <button class="btn btn-sm btn-outline-danger delete-module-btn" data-id="${m.id}" title="Delete module">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
                <div class="mt-2">
                    ${m.files.map(f => `
                        <div class="file-row d-flex justify-content-between align-items-center">
                            <div class="d-flex align-items-center gap-2">
                                <i class="bi ${fileIcon(f.mime_type)} fs-5"></i>
                                <div>
                                    <div class="small fw-semibold">${f.original_name}</div>
                                    <div class="text-muted" style="font-size: 0.75rem;">${formatSize(f.file_size)} • v${f.version} • updated ${new Date(f.updated_at).toLocaleDateString()}</div>
                                </div>
                            </div>
                            <div class="d-flex gap-2">
                                <a class="btn btn-sm btn-outline-secondary" href="${window.MENTORAE_CONFIG.API_BASE_URL}/api/resources/files/${f.id}/download?token=${token}" target="_blank">
                                    <i class="bi bi-download"></i>
                                </a>
                                <button class="btn btn-sm btn-outline-primary update-file-btn" data-file-id="${f.id}">
                                    Update
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');

        modulesList.querySelectorAll('.update-file-btn').forEach(btn => {
            btn.addEventListener('click', () => promptReplaceFile(btn.dataset.fileId));
        });
        modulesList.querySelectorAll('.delete-module-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteModule(btn.dataset.id));
        });
    }

    // --- Update (replace) an existing lesson file ---
    let activeFileId = null;
    function promptReplaceFile(fileId) {
        activeFileId = fileId;
        replaceFileInput.value = '';
        replaceFileInput.click();
    }
    replaceFileInput.addEventListener('change', async () => {
        const file = replaceFileInput.files[0];
        if (!file || !activeFileId) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`${window.MENTORAE_CONFIG.API_BASE_URL}/api/resources/files/${activeFileId}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });
            const data = await res.json();
            if (!data.success) {
                alert(data.message);
                return;
            }
            loadModules();
        } catch (err) {
            console.error(err);
            alert('Could not reach the server.');
        }
    });

    async function deleteModule(moduleId) {
        if (!confirm('Delete this module and all its files? This cannot be undone.')) return;
        const data = await authedFetch(`/api/resources/${moduleId}`, token, { method: 'DELETE' });
        if (!data.success) {
            alert(data.message);
            return;
        }
        loadModules();
    }

    loadSections();
});
