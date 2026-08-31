document.addEventListener('DOMContentLoaded', () => {
    const { token } = requireSession('login.html');

    const liveDateElement = document.getElementById('liveDate');
    const liveTimeElement = document.getElementById('liveTime');
    function updateDateTime() {
        const now = new Date();
        liveDateElement.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        liveTimeElement.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    const firstName = document.getElementById('firstName');
    const lastName = document.getElementById('lastName');
    const middleInitial = document.getElementById('middleInitial');
    const contactNumber = document.getElementById('contactNumber');
    const generatedId = document.getElementById('generatedId');
    const generatedEmail = document.getElementById('generatedEmail');
    const userRoleSelect = document.getElementById('userRoleSelect');
    const userProgramSelect = document.getElementById('userProgramSelect');
    const userProgramWrap = document.getElementById('userProgramWrap');
    const userSectionSelect = document.getElementById('userSectionSelect');
    const userSectionWrap = document.getElementById('userSectionWrap');
    const createUserForm = document.getElementById('createUserForm');
    const createUserPassword = document.getElementById('createUserPassword');

    // Program (4Ps / ARAL) and Section only apply to students
    function syncProgramVisibility() {
        const isStudent = userRoleSelect.value === 'Student';
        userProgramWrap.style.display = isStudent ? '' : 'none';
        userSectionWrap.style.display = isStudent ? '' : 'none';
        if (!isStudent) {
            userProgramSelect.value = 'none';
            userSectionSelect.value = '';
        }
    }
    syncProgramVisibility();
    userRoleSelect.addEventListener('change', syncProgramVisibility);

    // --- Sections & Strands (used across Create form, Assign Section modal, Link Parent filters, and Manager card) ---
    let sectionsCache = [];
    let strandsCache = [];

    function sectionOptionsHtml(list) {
        return list.map(s => `<option value="${s.id}">${s.strandCode} - Grade ${s.grade_level} - ${s.name}</option>`).join('');
    }

    function sectionsMatching(strandId, gradeLevel) {
        return sectionsCache.filter(s =>
            (!strandId || String(s.strand_id) === String(strandId)) &&
            (!gradeLevel || String(s.grade_level) === String(gradeLevel))
        );
    }

    async function loadReferenceData() {
        const [strandsData, sectionsData] = await Promise.all([
            authedFetch('/api/reference/strands', token),
            authedFetch('/api/reference/sections', token),
        ]);
        if (strandsData.success) {
            strandsCache = strandsData.strands;
            const strandOptions = strandsCache.map(s => `<option value="${s.id}">${s.code} - ${s.title}</option>`).join('');
            document.getElementById('manageStrandFilter').innerHTML = `<option value="">All strands</option>${strandOptions}`;
        }
        if (sectionsData.success) {
            sectionsCache = sectionsData.sections;
            const allOptions = sectionOptionsHtml(sectionsCache);
            userSectionSelect.innerHTML = `<option value="">— No section yet —</option>${allOptions}`;
            document.getElementById('assignSectionSelect').innerHTML = `<option value="">— No section —</option>${allOptions}`;
            document.getElementById('linkStudentSectionFilter').innerHTML = `<option value="">Any section</option>${allOptions}`;
            document.getElementById('manageSectionFilter').innerHTML = `<option value="">All sections</option>${allOptions}`;
            document.getElementById('manageAssignSectionSelect').innerHTML = `<option value="">— No section —</option>${allOptions}`;
            refreshPromoteSectionOptions();
        }
    }

    function refreshPromoteSectionOptions() {
        const strandId = document.getElementById('manageStrandFilter').value;
        const grade12Sections = sectionsMatching(strandId, '12');
        document.getElementById('managePromoteSectionSelect').innerHTML =
            `<option value="">— Choose a Grade 12 section —</option>${sectionOptionsHtml(grade12Sections)}`;
    }

    loadReferenceData();

    // --- Show/Hide password ---
    document.getElementById('btnTogglePassword').addEventListener('click', (e) => {
        const isHidden = createUserPassword.type === 'password';
        createUserPassword.type = isHidden ? 'text' : 'password';
        e.currentTarget.querySelector('i').className = isHidden ? 'bi bi-eye-slash' : 'bi bi-eye';
    });

    // --- Generate a random password into the field ---
    document.getElementById('btnGeneratePassword').addEventListener('click', () => {
        const bytes = new Uint8Array(9);
        crypto.getRandomValues(bytes);
        const generated = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 12);
        createUserPassword.value = generated;
        createUserPassword.type = 'text';
        document.getElementById('btnTogglePassword').querySelector('i').className = 'bi bi-eye-slash';
    });

    // --- Generate ID ---
    document.getElementById('btnTriggerId').addEventListener('click', async () => {
        const data = await authedFetch(`/api/users/generate-id?role=${userRoleSelect.value}`, token);
        if (data.success) generatedId.value = data.idNumber;
    });

    // --- Generate Email ---
    document.getElementById('btnTriggerEmail').addEventListener('click', async () => {
        if (!firstName.value.trim() || !lastName.value.trim()) {
            alert('Please enter first and last name first.');
            return;
        }
        const params = new URLSearchParams({
            firstName: firstName.value.trim(),
            lastName: lastName.value.trim(),
            role: userRoleSelect.value,
        });
        const data = await authedFetch(`/api/users/generate-email?${params}`, token);
        if (data.success) generatedEmail.value = data.email;
    });

    // --- Generate Scanner Key ---
    document.getElementById('btnGenerateKey').addEventListener('click', async () => {
        const data = await authedFetch('/api/users/generate-scanner-key', token, { method: 'POST' });
        if (data.success) {
            document.getElementById('generatedKeyField').value = data.key;
        } else {
            alert(data.message);
        }
    });

    // --- Create User ---
    createUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!generatedId.value || !generatedEmail.value) {
            alert('Please generate an ID and Email before creating the user.');
            return;
        }

        const manualPassword = createUserPassword.value;
        if (manualPassword && manualPassword.length < 8) {
            alert('Password must be at least 8 characters, or left blank to auto-generate one.');
            return;
        }

        const payload = {
            firstName: firstName.value.trim(),
            middleInitial: middleInitial.value.trim(),
            lastName: lastName.value.trim(),
            contactNumber: contactNumber.value.trim(),
            idNumber: generatedId.value,
            email: generatedEmail.value,
            role: userRoleSelect.value,
            program: userRoleSelect.value === 'Student' ? userProgramSelect.value : 'none',
        };
        if (manualPassword) payload.password = manualPassword;
        if (userRoleSelect.value === 'Student' && userSectionSelect.value) {
            payload.sectionId = userSectionSelect.value;
        }

        const data = await authedFetch('/api/users', token, {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        if (!data.success) {
            alert(data.message);
            return;
        }

        if (data.tempPassword) {
            alert(`${data.message}\n\nTemporary password (share this with the user securely):\n${data.tempPassword}`);
        } else {
            alert(`${data.message}\n\nThe password you set has been saved for this account.`);
        }
        createUserForm.reset();
        generatedId.value = '';
        generatedEmail.value = '';
        userSectionSelect.value = '';
        syncProgramVisibility();
        loadUsers();
        if (userRoleSelect.value === 'Parent' || userRoleSelect.value === 'Student') {
            loadParentOptions();
            loadStudentOptionsForLinking();
            loadManageStudents();
        }
    });

    // --- Users table ---
    const roleBadgeClass = {
        student: 'bg-student text-white',
        teacher: 'bg-teacher text-white',
        parent: 'bg-parent text-dark',
        admin: 'bg-admin text-white',
        security: 'bg-secondary text-white',
    };

    let currentPage = 1;

    async function loadUsers(page = 1) {
        currentPage = page;
        const role = document.getElementById('roleFilterDropdown').value;
        const search = document.getElementById('tableSearchField').value.trim();
        const params = new URLSearchParams({ page, limit: 25 });
        if (role && role !== 'All') params.set('role', role);
        if (search) params.set('search', search);

        const data = await authedFetch(`/api/users?${params}`, token);
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '';

        if (!data.success || !data.users.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No users found.</td></tr>';
            return;
        }

        for (const u of data.users) {
            const name = `${u.first_name} ${u.middle_initial ? u.middle_initial + ' ' : ''}${u.last_name}`;
            const roleLabel = u.role.charAt(0).toUpperCase() + u.role.slice(1);
            const dateAdded = new Date(u.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
            const tr = document.createElement('tr');
            tr.dataset.role = roleLabel;
            tr.innerHTML = `
                <td class="px-3 py-2 fw-medium">${name}</td>
                <td class="px-3 py-2 text-muted"><i class="bi bi-envelope me-1 text-secondary"></i> ${u.email}</td>
                <td class="px-3 py-2 text-secondary">${u.contact_number || '—'}</td>
                <td class="px-3 py-2"><span class="badge badge-role ${roleBadgeClass[u.role] || 'bg-secondary text-white'}">${roleLabel}</span></td>
                <td class="px-3 py-2"><span class="badge ${u.is_active ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'} px-2 py-1">${u.is_active ? 'Active' : 'Inactive'}</span></td>
                <td class="px-3 py-2 text-secondary">${dateAdded}</td>
                <td class="px-3 py-2 text-center">
                    <div class="d-inline-flex gap-2">
                        ${u.role === 'student' ? `
                        <button class="btn btn-link p-0 text-primary fs-5 assign-section-btn" title="Assign Section" data-id="${u.id}">
                            <i class="bi bi-diagram-3-fill"></i>
                        </button>` : ''}
                        <button class="btn btn-link p-0 ${u.is_active ? 'text-danger' : 'text-success'} fs-5 action-link-btn" title="${u.is_active ? 'Deactivate' : 'Activate'}" data-id="${u.id}" data-active="${u.is_active}">
                            <i class="bi ${u.is_active ? 'bi-person-dash-fill' : 'bi-person-check-fill'}"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        }

        tbody.querySelectorAll('.action-link-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const isActive = btn.dataset.active === '1' || btn.dataset.active === 'true';
                const confirmMsg = isActive ? 'Deactivate this user?' : 'Reactivate this user?';
                if (!confirm(confirmMsg)) return;
                const result = await authedFetch(`/api/users/${btn.dataset.id}`, token, {
                    method: 'PATCH',
                    body: JSON.stringify({ isActive: !isActive }),
                });
                if (result.success) loadUsers(currentPage);
            });
        });

        // --- Assign/Reassign Section (students only) ---
        const assignSectionModalEl = document.getElementById('assignSectionModal');
        const assignSectionModal = new bootstrap.Modal(assignSectionModalEl);
        tbody.querySelectorAll('.assign-section-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('assignSectionUserId').value = btn.dataset.id;
                document.getElementById('assignSectionSelect').value = '';
                assignSectionModal.show();
            });
        });

        document.getElementById('btnSaveSection').onclick = async () => {
            const userId = document.getElementById('assignSectionUserId').value;
            const sectionId = document.getElementById('assignSectionSelect').value || null;
            const result = await authedFetch(`/api/users/${userId}`, token, {
                method: 'PATCH',
                body: JSON.stringify({ sectionId }),
            });
            if (result.success) {
                assignSectionModal.hide();
                loadUsers(currentPage);
            } else {
                alert(result.message);
            }
        };
    }

    // --- Link Parent to Student (with search/filtering) ---
    const linkParentSelect = document.getElementById('linkParentSelect');
    const linkStudentSelect = document.getElementById('linkStudentSelect');
    const linkParentForm = document.getElementById('linkParentForm');
    const linkParentSearch = document.getElementById('linkParentSearch');
    const linkStudentSearch = document.getElementById('linkStudentSearch');
    const linkStudentGradeFilter = document.getElementById('linkStudentGradeFilter');
    const linkStudentSectionFilter = document.getElementById('linkStudentSectionFilter');

    let parentsCache = [];

    async function loadParentOptions() {
        const data = await authedFetch('/api/users?role=Parent&limit=1000', token);
        if (data.success) {
            parentsCache = data.users;
            renderParentOptions(parentsCache);
        }
    }

    function renderParentOptions(list) {
        linkParentSelect.innerHTML = list.length
            ? list.map(p => `<option value="${p.id}">${p.first_name} ${p.last_name} (${p.email})</option>`).join('')
            : '<option value="" disabled>No matches</option>';
    }

    linkParentSearch.addEventListener('input', () => {
        const q = linkParentSearch.value.trim().toLowerCase();
        const filtered = !q ? parentsCache : parentsCache.filter(p =>
            `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(q)
        );
        renderParentOptions(filtered);
    });

    async function loadStudentOptionsForLinking() {
        const params = new URLSearchParams();
        if (linkStudentGradeFilter.value) params.set('gradeLevel', linkStudentGradeFilter.value);
        if (linkStudentSectionFilter.value) params.set('sectionId', linkStudentSectionFilter.value);
        if (linkStudentSearch.value.trim()) params.set('search', linkStudentSearch.value.trim());

        const data = await authedFetch(`/api/users/students?${params}`, token);
        linkStudentSelect.innerHTML = (data.success && data.students.length)
            ? data.students.map(s => `<option value="${s.id}">${s.firstName} ${s.lastName} — ${s.idNumber}${s.sectionName ? ` (${s.strandCode} G${s.gradeLevel} ${s.sectionName})` : ' (no section)'}</option>`).join('')
            : '<option value="" disabled>No matches</option>';
    }

    linkStudentGradeFilter.addEventListener('change', () => {
        // Narrow the section filter to the chosen grade level
        const matching = sectionsMatching('', linkStudentGradeFilter.value);
        linkStudentSectionFilter.innerHTML = `<option value="">Any section</option>${sectionOptionsHtml(matching)}`;
        loadStudentOptionsForLinking();
    });
    linkStudentSectionFilter.addEventListener('change', loadStudentOptionsForLinking);
    let linkSearchTimer;
    linkStudentSearch.addEventListener('input', () => {
        clearTimeout(linkSearchTimer);
        linkSearchTimer = setTimeout(loadStudentOptionsForLinking, 300);
    });

    async function loadParentLinks() {
        const data = await authedFetch('/api/users/parent-links', token);
        const tbody = document.getElementById('parentLinksTableBody');
        tbody.innerHTML = '';
        if (!data.success || !data.links.length) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-3">No parent-student links yet.</td></tr>';
            return;
        }
        for (const link of data.links) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${link.parentName} <span class="text-muted">(${link.parentEmail})</span></td>
                <td>${link.studentName} <span class="text-muted">(${link.studentIdNumber})</span></td>
                <td class="text-center">
                    <button class="btn btn-link p-0 text-danger fs-5 unlink-btn" title="Remove link" data-id="${link.id}">
                        <i class="bi bi-x-circle-fill"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        }
        tbody.querySelectorAll('.unlink-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Remove this parent-student link?')) return;
                const result = await authedFetch(`/api/users/parent-links/${btn.dataset.id}`, token, { method: 'DELETE' });
                if (result.success) loadParentLinks();
            });
        });
    }

    linkParentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const parentId = linkParentSelect.value;
        const studentId = linkStudentSelect.value;
        if (!parentId || !studentId) return;

        const result = await authedFetch('/api/users/parent-links', token, {
            method: 'POST',
            body: JSON.stringify({ parentId, studentId }),
        });
        if (result.success) {
            linkParentForm.reset();
            loadParentLinks();
        } else {
            alert(result.message);
        }
    });

    loadParentOptions();
    loadStudentOptionsForLinking();
    loadParentLinks();

    // --- Section, Promotion & Graduation Manager ---
    const manageStrandFilter = document.getElementById('manageStrandFilter');
    const manageGradeFilter = document.getElementById('manageGradeFilter');
    const manageSectionFilter = document.getElementById('manageSectionFilter');
    const manageStatusFilter = document.getElementById('manageStatusFilter');
    const manageSearch = document.getElementById('manageSearch');
    const manageSelectAll = document.getElementById('manageSelectAll');
    const manageSelectedCount = document.getElementById('manageSelectedCount');
    const manageStudentsTableBody = document.getElementById('manageStudentsTableBody');

    function updateManageSelectedCount() {
        manageSelectedCount.textContent = manageStudentsTableBody.querySelectorAll('.manage-row-check:checked').length;
    }

    async function loadManageStudents() {
        const params = new URLSearchParams();
        if (manageStrandFilter.value) params.set('strandId', manageStrandFilter.value);
        if (manageGradeFilter.value) params.set('gradeLevel', manageGradeFilter.value);
        if (manageSectionFilter.value) params.set('sectionId', manageSectionFilter.value);
        if (manageStatusFilter.value) params.set('enrollmentStatus', manageStatusFilter.value);
        if (manageSearch.value.trim()) params.set('search', manageSearch.value.trim());

        const data = await authedFetch(`/api/users/students?${params}`, token);
        manageStudentsTableBody.innerHTML = '';
        manageSelectAll.checked = false;

        if (!data.success || !data.students.length) {
            manageStudentsTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">No students match these filters.</td></tr>';
            updateManageSelectedCount();
            return;
        }

        for (const s of data.students) {
            const name = `${s.firstName} ${s.middleInitial ? s.middleInitial + ' ' : ''}${s.lastName}`;
            const sectionInfo = s.sectionName ? `${s.strandCode} - Grade ${s.gradeLevel} - ${s.sectionName}` : '— No section —';
            const statusBadge = s.enrollmentStatus === 'graduated'
                ? '<span class="badge bg-secondary">Graduated</span>'
                : s.enrollmentStatus === 'dropped'
                    ? '<span class="badge bg-danger-subtle text-danger">Dropped</span>'
                    : '<span class="badge bg-success-subtle text-success">Enrolled</span>';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="checkbox" class="manage-row-check" value="${s.id}"></td>
                <td>${name}</td>
                <td>${s.idNumber}</td>
                <td>${sectionInfo}</td>
                <td>${statusBadge}</td>
            `;
            manageStudentsTableBody.appendChild(tr);
        }

        manageStudentsTableBody.querySelectorAll('.manage-row-check').forEach(cb => {
            cb.addEventListener('change', updateManageSelectedCount);
        });
        updateManageSelectedCount();
    }

    function getManageSelectedIds() {
        return Array.from(manageStudentsTableBody.querySelectorAll('.manage-row-check:checked')).map(cb => cb.value);
    }

    manageSelectAll.addEventListener('change', () => {
        manageStudentsTableBody.querySelectorAll('.manage-row-check').forEach(cb => { cb.checked = manageSelectAll.checked; });
        updateManageSelectedCount();
    });

    manageStrandFilter.addEventListener('change', () => {
        // Narrow section filter to the chosen strand (+ grade, if also set)
        const matching = sectionsMatching(manageStrandFilter.value, manageGradeFilter.value);
        manageSectionFilter.innerHTML = `<option value="">All sections</option>${sectionOptionsHtml(matching)}`;
        refreshPromoteSectionOptions();
        loadManageStudents();
    });
    manageGradeFilter.addEventListener('change', () => {
        const matching = sectionsMatching(manageStrandFilter.value, manageGradeFilter.value);
        manageSectionFilter.innerHTML = `<option value="">All sections</option>${sectionOptionsHtml(matching)}`;
        loadManageStudents();
    });
    manageSectionFilter.addEventListener('change', loadManageStudents);
    manageStatusFilter.addEventListener('change', loadManageStudents);
    let manageSearchTimer;
    manageSearch.addEventListener('input', () => {
        clearTimeout(manageSearchTimer);
        manageSearchTimer = setTimeout(loadManageStudents, 300);
    });

    document.getElementById('btnBulkAssignSection').addEventListener('click', async () => {
        const studentIds = getManageSelectedIds();
        if (!studentIds.length) { alert('Select at least one student.'); return; }
        const sectionId = document.getElementById('manageAssignSectionSelect').value || null;
        if (!confirm(`Assign ${studentIds.length} student(s) to the selected section?`)) return;
        const result = await authedFetch('/api/users/bulk-assign-section', token, {
            method: 'POST',
            body: JSON.stringify({ studentIds, sectionId }),
        });
        alert(result.message);
        if (result.success) { loadManageStudents(); loadUsers(currentPage); }
    });

    document.getElementById('btnPromote').addEventListener('click', async () => {
        const studentIds = getManageSelectedIds();
        const targetSectionId = document.getElementById('managePromoteSectionSelect').value;
        if (!studentIds.length) { alert('Select at least one student.'); return; }
        if (!targetSectionId) { alert('Choose a Grade 12 target section.'); return; }
        if (!confirm(`Promote ${studentIds.length} student(s) to the selected Grade 12 section?`)) return;
        const result = await authedFetch('/api/users/promote', token, {
            method: 'POST',
            body: JSON.stringify({ studentIds, targetSectionId }),
        });
        alert(result.message);
        if (result.success) { loadManageStudents(); loadUsers(currentPage); }
    });

    document.getElementById('btnGraduate').addEventListener('click', async () => {
        const studentIds = getManageSelectedIds();
        if (!studentIds.length) { alert('Select at least one student.'); return; }
        if (!confirm(`Mark ${studentIds.length} student(s) as graduated? This also deactivates their login.`)) return;
        const result = await authedFetch('/api/users/graduate', token, {
            method: 'POST',
            body: JSON.stringify({ studentIds }),
        });
        alert(result.message);
        if (result.success) { loadManageStudents(); loadUsers(currentPage); }
    });

    document.getElementById('btnUndoGraduate').addEventListener('click', async () => {
        const studentIds = getManageSelectedIds();
        if (!studentIds.length) { alert('Select at least one graduated student to restore.'); return; }
        if (!confirm(`Restore ${studentIds.length} student(s) to enrolled and reactivate their login?`)) return;
        const result = await authedFetch('/api/users/undo-graduate', token, {
            method: 'POST',
            body: JSON.stringify({ studentIds }),
        });
        alert(result.message);
        if (result.success) { loadManageStudents(); loadUsers(currentPage); }
    });

    loadManageStudents();

    document.getElementById('tableSearchField').addEventListener('input', () => loadUsers(1));
    document.getElementById('roleFilterDropdown').addEventListener('change', () => loadUsers(1));

    document.getElementById('btnDownloadTable').addEventListener('click', () => {
        window.open(`${window.MENTORAE_CONFIG.API_BASE_URL}/api/users/export?token=${encodeURIComponent(token)}`, '_blank');
    });

    document.getElementById('btnDownloadTemplate').addEventListener('click', (e) => {
        e.preventDefault();
        window.open(`${window.MENTORAE_CONFIG.API_BASE_URL}/api/users/bulk-import/template?token=${encodeURIComponent(token)}`, '_blank');
    });

    document.getElementById('btnRunBulkImport').addEventListener('click', async () => {
        const fileInput = document.getElementById('bulkImportFileInput');
        const progressEl = document.getElementById('bulkImportProgress');
        const resultsEl = document.getElementById('bulkImportResults');
        const credsEl = document.getElementById('bulkImportCredentials');
        const file = fileInput.files[0];
        if (!file) {
            alert('Choose a file first.');
            return;
        }

        progressEl.textContent = 'Importing… this can take a moment for large files.';
        resultsEl.innerHTML = '';
        credsEl.innerHTML = '';

        const formData = new FormData();
        formData.append('importFile', file);

        try {
            const res = await fetch(`${window.MENTORAE_CONFIG.API_BASE_URL}/api/users/bulk-import?token=${encodeURIComponent(token)}`, {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();

            if (!data.success) {
                progressEl.innerHTML = `<span class="text-danger">${data.message}</span>`;
                return;
            }

            progressEl.innerHTML = `<strong>${data.message}</strong>`;

            resultsEl.innerHTML = data.results.map(r => `
                <div class="d-flex justify-content-between align-items-center border-bottom py-1 text-sm">
                    <span>Row ${r.row}: ${r.name}</span>
                    <span class="${r.status === 'created' ? 'text-success' : 'text-danger'}">${r.message}</span>
                </div>
            `).join('');

            if (data.credentials.length) {
                const csvRows = ['Name,ID Number,Email,Temporary Password'];
                data.credentials.forEach(c => csvRows.push(`"${c.name}",${c.idNumber},${c.email},${c.tempPassword}`));
                const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                credsEl.innerHTML = `
                    <div class="alert alert-success text-sm mb-0">
                        ${data.credentials.length} temporary password(s) generated.
                        <a href="${url}" download="new-student-credentials.csv" class="fw-bold">Download the credentials list</a>
                        to share with the new students — this can't be shown again after you close this window.
                    </div>
                `;
            }

            fileInput.value = '';
            loadUsers();
            loadManageStudents();
        } catch (err) {
            progressEl.innerHTML = '<span class="text-danger">Import failed: could not reach the server.</span>';
        }
    });

    wireLogout('logoutBtn', 'login.html', token);

    loadUsers();
});
