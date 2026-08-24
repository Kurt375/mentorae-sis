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
    const createUserForm = document.getElementById('createUserForm');
    const createUserPassword = document.getElementById('createUserPassword');

    // Program (4Ps / ARAL) only applies to students
    function syncProgramVisibility() {
        const isStudent = userRoleSelect.value === 'Student';
        userProgramWrap.style.display = isStudent ? '' : 'none';
        if (!isStudent) userProgramSelect.value = 'none';
    }
    syncProgramVisibility();
    userRoleSelect.addEventListener('change', syncProgramVisibility);

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
        loadUsers();
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
                        <button class="btn btn-link p-0 ${u.is_active ? 'text-danger' : 'text-success'} fs-5 action-link-btn" title="${u.is_active ? 'Deactivate' : 'Activate'}" data-id="${u.id}" data-active="${u.is_active}">
                            <i class="bi ${u.is_active ? 'bi-person-dash-fill' : 'bi-person-check-fill'}"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        }

        tbody.querySelectorAll('[data-id]').forEach(btn => {
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
    }

    document.getElementById('tableSearchField').addEventListener('input', () => loadUsers(1));
    document.getElementById('roleFilterDropdown').addEventListener('change', () => loadUsers(1));

    document.getElementById('btnDownloadTable').addEventListener('click', () => {
        window.open(`${window.MENTORAE_CONFIG.API_BASE_URL}/api/users/export?token=${encodeURIComponent(token)}`, '_blank');
    });

    wireLogout('logoutBtn', 'login.html', token);

    loadUsers();
});
