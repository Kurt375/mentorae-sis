document.addEventListener('DOMContentLoaded', () => {
    const { token } = requireSession('../login.html');

    const modulesList = document.getElementById('modulesList');
    const quarterFilter = document.getElementById('quarterFilter');

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
    // A file counts as "recently updated" if it was touched after it was first uploaded
    // (more than a minute apart, to ignore the initial insert's own timestamps).
    function wasRecentlyUpdated(f) {
        return f.version > 1 && (new Date() - new Date(f.updated_at)) < 1000 * 60 * 60 * 24 * 7; // within the last week
    }

    async function loadModules() {
        const url = quarterFilter.value ? `/api/resources?quarter=${encodeURIComponent(quarterFilter.value)}` : '/api/resources';
        const data = await authedFetch(url, token);
        if (!data.success) {
            modulesList.innerHTML = `<p class="text-danger small">${data.message}</p>`;
            return;
        }
        renderModules(data.modules);
    }

    function renderModules(modules) {
        if (!modules.length) {
            modulesList.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="bi bi-book display-3 d-block mb-3 opacity-50"></i>
                    <h5>No materials yet</h5>
                    <p class="small">Your teachers haven't posted any study materials for this quarter.</p>
                </div>`;
            return;
        }
        modulesList.innerHTML = modules.map(m => `
            <div class="module-card">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h6 class="fw-bold mb-1">${m.title}</h6>
                        <p class="text-muted small mb-1">${m.subjectName} • ${m.teacherFirst} ${m.teacherLast} • ${m.quarter}</p>
                        ${m.description ? `<p class="small mb-2">${m.description}</p>` : ''}
                    </div>
                </div>
                <div class="mt-2">
                    ${m.files.map(f => `
                        <div class="file-row d-flex justify-content-between align-items-center">
                            <div class="d-flex align-items-center gap-2">
                                <i class="bi ${fileIcon(f.mime_type)} fs-5"></i>
                                <div>
                                    <div class="small fw-semibold">
                                        ${f.original_name}
                                        ${wasRecentlyUpdated(f) ? '<span class="badge bg-warning-subtle text-warning ms-1">Updated</span>' : ''}
                                    </div>
                                    <div class="text-muted" style="font-size: 0.75rem;">${formatSize(f.file_size)}</div>
                                </div>
                            </div>
                            <a class="btn btn-sm btn-outline-success" href="${window.MENTORAE_CONFIG.API_BASE_URL}/api/resources/files/${f.id}/download?token=${token}" target="_blank">
                                <i class="bi bi-download"></i> Download
                            </a>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }

    quarterFilter.addEventListener('change', loadModules);
    loadModules();
});
