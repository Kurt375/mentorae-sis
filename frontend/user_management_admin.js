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
    const studentGradeLevelSelect = document.getElementById('studentGradeLevelSelect');
    const studentStrandSelect = document.getElementById('studentStrandSelect');
    const userSectionSelect = document.getElementById('userSectionSelect');
    const studentStatusSelect = document.getElementById('studentStatusSelect');
    const studentParentFullName = document.getElementById('studentParentFullName');
    const studentParentContactNumber = document.getElementById('studentParentContactNumber');
    const parentChildrenNames = document.getElementById('parentChildrenNames');
    const userAdviserSectionSelect = document.getElementById('userAdviserSectionSelect');
    const teacherSubjects = document.getElementById('teacherSubjects');
    const createUserForm = document.getElementById('createUserForm');
    const createUserPassword = document.getElementById('createUserPassword');

    const activeRoleBadge = document.getElementById('activeRoleBadge');
    const activeRoleDescription = document.getElementById('activeRoleDescription');
    const roleCopy = {
        Student: { badge: 'Student Account', desc: 'Fill out student details and academic information below.' },
        Parent: { badge: 'Parent Account', desc: "Fill out parent details and child information below." },
        Teacher: { badge: 'Teacher Account', desc: 'Fill out teacher details, advisory section, and subjects handled.' },
        Admin: { badge: 'Admin Account', desc: 'Fill out administrative user details and credentials.' },
    };

    // Each role shows a different subset of the extra fields, plus a badge describing it.
    function syncRoleFieldVisibility() {
        const role = userRoleSelect.value;
        const isStudent = role === 'Student';
        const isParent = role === 'Parent';
        const isTeacher = role === 'Teacher';

        const copy = roleCopy[role] || roleCopy.Student;
        activeRoleBadge.textContent = copy.badge;
        activeRoleDescription.textContent = copy.desc;

        document.getElementById('studentRoleFields').classList.toggle('d-none', !isStudent);
        document.getElementById('parentRoleFields').classList.toggle('d-none', !isParent);
        document.getElementById('teacherRoleFields').classList.toggle('d-none', !isTeacher);
        document.getElementById('adminRoleFields').classList.toggle('d-none', !(role === 'Admin'));

        const idFieldLabel = document.getElementById('idFieldLabel');
        const generatedIdInput = document.getElementById('generatedId');
        const btnTriggerId = document.getElementById('btnTriggerId');
        const idFieldHelpText = document.getElementById('idFieldHelpText');

        if (isStudent) {
            if (idFieldLabel) idFieldLabel.innerHTML = 'Learner Reference Number (LRN) <span class="text-danger">*</span>';
            if (generatedIdInput) {
                generatedIdInput.readOnly = false;
                generatedIdInput.placeholder = 'Enter 12-digit Student LRN...';
                generatedIdInput.classList.add('rounded-end');
                if (/^\d{2}-\d{5}$/.test(generatedIdInput.value)) {
                    generatedIdInput.value = '';
                }
            }
            if (btnTriggerId) btnTriggerId.classList.add('d-none');
            if (idFieldHelpText) {
                idFieldHelpText.textContent = "Enter student's official 12-digit DepEd LRN.";
                idFieldHelpText.classList.remove('d-none');
            }
        } else {
            if (idFieldLabel) idFieldLabel.innerHTML = 'Generated ID <span class="text-danger">*</span>';
            if (generatedIdInput) {
                generatedIdInput.readOnly = true;
                generatedIdInput.placeholder = 'Generate ID...';
                generatedIdInput.classList.remove('rounded-end');
            }
            if (btnTriggerId) btnTriggerId.classList.remove('d-none');
            if (idFieldHelpText) {
                idFieldHelpText.classList.add('d-none');
            }
        }

        if (!isStudent) {
            studentGradeLevelSelect.value = '';
            studentStrandSelect.value = '';
            userSectionSelect.value = '';
            studentStatusSelect.value = 'none';
            studentParentFullName.value = '';
            if (studentParentContactNumber) studentParentContactNumber.value = '';
            updateParentLinkBadge();
        }
        if (!isParent) parentChildrenNames.value = '';
        if (!isTeacher) {
            userAdviserSectionSelect.value = '';
            teacherSubjects.value = '';
        }
    }
    syncRoleFieldVisibility();
    userRoleSelect.addEventListener('change', syncRoleFieldVisibility);

    // Dynamic badge indicating if typed parent name matches an existing parent or will be auto-created
    function updateParentLinkBadge() {
        const statusWrap = document.getElementById('parentLinkStatusWrap');
        if (!statusWrap) return;
        const nameVal = studentParentFullName ? studentParentFullName.value.trim().toLowerCase() : '';
        if (!nameVal) {
            statusWrap.innerHTML = '<div class="form-text micro-text text-muted" id="parentLinkHelpText">Type parent name. If already registered, it links them; if new, a Parent account will be automatically created.</div>';
            return;
        }

        const matchedParent = parentsCache.find(p => {
            const pFull = `${p.first_name} ${p.last_name}`.trim().toLowerCase();
            const pFullWithMi = `${p.first_name} ${p.middle_initial || ''} ${p.last_name}`.trim().toLowerCase().replace(/\s+/g, ' ');
            return pFull === nameVal || pFullWithMi === nameVal;
        });

        if (matchedParent) {
            statusWrap.innerHTML = `
                <div class="d-inline-flex align-items-center gap-1.5 px-2 py-1 rounded-2 bg-success-subtle text-success border border-success-subtle micro-text fw-semibold">
                    <i class="bi bi-link-45deg fs-6"></i> Existing registered parent: ${matchedParent.first_name} ${matchedParent.last_name} (${matchedParent.id_number}) — will link without creating duplicate
                </div>`;
            if (studentParentContactNumber && !studentParentContactNumber.value.trim() && matchedParent.contact_number) {
                studentParentContactNumber.value = matchedParent.contact_number;
            }
        } else {
            statusWrap.innerHTML = `
                <div class="d-inline-flex align-items-center gap-1.5 px-2 py-1 rounded-2 bg-primary-subtle text-primary border border-primary-subtle micro-text fw-semibold">
                    <i class="bi bi-person-plus-fill"></i> New parent — a Parent Portal account will be automatically created & linked
                </div>`;
        }
    }

    if (studentParentFullName) {
        studentParentFullName.addEventListener('input', updateParentLinkBadge);
        studentParentFullName.addEventListener('change', updateParentLinkBadge);
    }

    // --- Sections & Strands (used across Create form, Assign Section modal, Link Parent filters, and Manager card) ---
    let sectionsCache = [];
    let strandsCache = [];

    function sectionOptionsHtml(list) {
        return list.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }

    function sectionsMatching(strandId, gradeLevel) {
        return sectionsCache.filter(s =>
            (!strandId || String(s.strand_id) === String(strandId)) &&
            (!gradeLevel || String(s.grade_level) === String(gradeLevel))
        );
    }

    function strandsMatchingGrade(gradeLevel) {
        if (!gradeLevel) return strandsCache;
        const validStrandIds = new Set(
            sectionsCache.filter(s => String(s.grade_level) === String(gradeLevel)).map(s => String(s.strand_id))
        );
        return strandsCache.filter(st => validStrandIds.has(String(st.id)));
    }

    function refreshStudentStrands() {
        const gradeLevel = studentGradeLevelSelect.value;
        const currentStrand = studentStrandSelect.value;
        const matchingStrands = strandsMatchingGrade(gradeLevel);
        const strandOptions = matchingStrands.map(s => `<option value="${s.id}">${s.code} - ${s.title}</option>`).join('');
        studentStrandSelect.innerHTML = `<option value="" disabled selected>— Select Strand —</option>${strandOptions}`;
        if (currentStrand && matchingStrands.some(s => String(s.id) === String(currentStrand))) {
            studentStrandSelect.value = currentStrand;
        } else {
            studentStrandSelect.value = '';
        }
        refreshStudentSections();
    }

    function refreshStudentSections() {
        const strandId = studentStrandSelect.value;
        const gradeLevel = studentGradeLevelSelect.value;
        const matching = sectionsMatching(strandId, gradeLevel);
        userSectionSelect.innerHTML = `<option value="">— No section yet —</option>${sectionOptionsHtml(matching)}`;
    }
    studentGradeLevelSelect.addEventListener('change', refreshStudentStrands);
    studentStrandSelect.addEventListener('change', () => {
        if (studentStrandSelect.value && !studentGradeLevelSelect.value) {
            const strandSections = sectionsCache.filter(s => String(s.strand_id) === String(studentStrandSelect.value));
            const uniqueGrades = [...new Set(strandSections.map(s => s.grade_level))];
            if (uniqueGrades.length === 1) {
                studentGradeLevelSelect.value = String(uniqueGrades[0]);
                refreshStudentStrands();
                return;
            }
        }
        refreshStudentSections();
    });

    let subjectsCache = [];

    async function loadReferenceData() {
        const [strandsData, sectionsData, subjectsData] = await Promise.all([
            authedFetch('/api/reference/strands', token),
            authedFetch('/api/reference/sections', token),
            authedFetch('/api/reference/subjects', token),
        ]);
        if (strandsData.success) {
            strandsCache = strandsData.strands;
            const strandOptions = strandsCache.map(s => `<option value="${s.id}">${s.code} - ${s.title}</option>`).join('');
            document.getElementById('manageStrandFilter').innerHTML = `<option value="">All strands</option>${strandOptions}`;
            studentStrandSelect.innerHTML = `<option value="" disabled selected>— Select Strand —</option>${strandOptions}`;
        }
        if (sectionsData.success) {
            sectionsCache = sectionsData.sections;
            const allOptions = sectionOptionsHtml(sectionsCache);
            refreshStudentSections();
            document.getElementById('assignSectionSelect').innerHTML = `<option value="">— No section —</option>${allOptions}`;
            const linkStudentSecEl = document.getElementById('linkStudentSectionFilter');
            if (linkStudentSecEl) linkStudentSecEl.innerHTML = `<option value="">Any section</option>${allOptions}`;
            document.getElementById('manageSectionFilter').innerHTML = `<option value="">All sections</option>${allOptions}`;
            document.getElementById('manageAssignSectionSelect').innerHTML = `<option value="">— No section —</option>${allOptions}`;
            userAdviserSectionSelect.innerHTML = `<option value="">— Not an adviser —</option>${allOptions}`;
            document.getElementById('editAdviserSectionSelect').innerHTML = `<option value="">— Not an adviser —</option>${allOptions}`;
            refreshPromoteSectionOptions();
        }
        if (subjectsData.success) {
            subjectsCache = subjectsData.subjects;
            const subjectOptions = subjectsCache.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
            document.getElementById('editSubjectsHandledSelect').innerHTML = subjectOptions;

            // Real-time autocomplete for the teacher "Subjects Handled" text field
            const suggestionsEl = document.getElementById('subjectSuggestionsDropdown');

            function getSelectedSubjects() {
                if (!teacherSubjects) return [];
                return teacherSubjects.value
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean);
            }

            function getCurrentToken() {
                if (!teacherSubjects) return '';
                const val = teacherSubjects.value;
                const lastCommaIdx = val.lastIndexOf(',');
                if (lastCommaIdx === -1) return val.trim();
                return val.slice(lastCommaIdx + 1).trim();
            }

            function escapeHtml(str) {
                return (str || '').replace(/[&<>'"]/g, tag => ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    "'": '&#39;',
                    '"': '&quot;'
                }[tag] || tag));
            }

            function highlightMatch(text, query) {
                if (!query) return escapeHtml(text);
                const safeQuery = query.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
                const regex = new RegExp(`(${safeQuery})`, 'gi');
                return escapeHtml(text).replace(regex, '<span class="match-highlight">$1</span>');
            }

            function addSubjectToInput(subjName) {
                const currentVal = teacherSubjects.value || '';
                const parts = currentVal.split(',').map(s => s.trim()).filter(Boolean);
                const currentToken = getCurrentToken().toLowerCase();

                // If the user was typing a partial match for this subject as the last token, replace that token
                if (parts.length > 0 && currentToken.length > 0) {
                    const lastPart = parts[parts.length - 1].toLowerCase();
                    if (subjName.toLowerCase().startsWith(lastPart) || lastPart === currentToken) {
                        parts[parts.length - 1] = subjName;
                    } else if (!parts.some(p => p.toLowerCase() === subjName.toLowerCase())) {
                        parts.push(subjName);
                    }
                } else {
                    if (!parts.some(p => p.toLowerCase() === subjName.toLowerCase())) {
                        parts.push(subjName);
                    }
                }

                teacherSubjects.value = parts.join(', ') + ', ';
                hideSuggestions();
                teacherSubjects.focus();
            }

            let activeSuggestionIndex = -1;

            function hideSuggestions() {
                if (!suggestionsEl) return;
                suggestionsEl.classList.add('d-none');
                suggestionsEl.innerHTML = '';
                activeSuggestionIndex = -1;
            }

            function showSuggestions(query) {
                if (!suggestionsEl || !subjectsCache.length) return;
                const q = (query || '').trim().toLowerCase();
                if (!q) {
                    hideSuggestions();
                    return;
                }

                const selected = getSelectedSubjects().map(s => s.toLowerCase());
                const matches = subjectsCache.filter(s => 
                    (s.name.toLowerCase().includes(q) || (s.code || '').toLowerCase().includes(q)) &&
                    !selected.includes(s.name.toLowerCase())
                ).slice(0, 8);

                if (!matches.length) {
                    suggestionsEl.innerHTML = `
                        <div class="p-2.5 text-muted micro-text text-center">
                            <i class="bi bi-search me-1"></i> No matching subjects found for "<strong>${escapeHtml(query)}</strong>"
                        </div>`;
                    suggestionsEl.classList.remove('d-none');
                    activeSuggestionIndex = -1;
                    return;
                }

                activeSuggestionIndex = 0;
                suggestionsEl.innerHTML = matches.map((s, idx) => `
                    <div class="autocomplete-item ${idx === 0 ? 'active' : ''}" data-name="${escapeHtml(s.name)}" data-idx="${idx}">
                        <div>
                            <span class="text-dark fw-medium">${highlightMatch(s.name, query)}</span>
                            ${s.code ? `<span class="micro-text text-muted ms-1">(${escapeHtml(s.code)})</span>` : ''}
                        </div>
                        <span class="badge bg-light text-success border border-success-subtle micro-text">${escapeHtml(s.strand || 'Core')}</span>
                    </div>
                `).join('');

                suggestionsEl.classList.remove('d-none');

                suggestionsEl.querySelectorAll('.autocomplete-item').forEach(item => {
                    item.addEventListener('mousedown', (e) => {
                        e.preventDefault(); // prevent blur before click registers
                        addSubjectToInput(item.dataset.name);
                    });
                });
            }

            // Bind input and keyboard events
            if (teacherSubjects) {
                teacherSubjects.addEventListener('input', () => {
                    const currentToken = getCurrentToken();
                    showSuggestions(currentToken);
                });

                teacherSubjects.addEventListener('keydown', (e) => {
                    if (suggestionsEl && !suggestionsEl.classList.contains('d-none')) {
                        const items = suggestionsEl.querySelectorAll('.autocomplete-item');
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            if (items.length) {
                                activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
                                items.forEach((it, i) => it.classList.toggle('active', i === activeSuggestionIndex));
                                items[activeSuggestionIndex].scrollIntoView({ block: 'nearest' });
                            }
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            if (items.length) {
                                activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
                                items.forEach((it, i) => it.classList.toggle('active', i === activeSuggestionIndex));
                                items[activeSuggestionIndex].scrollIntoView({ block: 'nearest' });
                            }
                        } else if (e.key === 'Enter' || e.key === 'Tab') {
                            if (activeSuggestionIndex >= 0 && items[activeSuggestionIndex]) {
                                e.preventDefault();
                                addSubjectToInput(items[activeSuggestionIndex].dataset.name);
                            }
                        } else if (e.key === 'Escape') {
                            hideSuggestions();
                        }
                    }
                });

                teacherSubjects.addEventListener('blur', () => {
                    setTimeout(hideSuggestions, 200);
                });

                teacherSubjects.addEventListener('focus', () => {
                    const currentToken = getCurrentToken();
                    if (currentToken) showSuggestions(currentToken);
                });
            }

            window.hideTeacherSubjectSuggestions = hideSuggestions;
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
        if (userRoleSelect.value === 'Student') return;
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

        if (!generatedId.value.trim()) {
            if (userRoleSelect.value === 'Student') {
                alert('Please enter the student\'s LRN (Learner Reference Number).');
            } else {
                alert('Please generate an ID before creating the user.');
            }
            generatedId.focus();
            return;
        }

        if (!generatedEmail.value) {
            alert('Please generate an Email before creating the user.');
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
            program: userRoleSelect.value === 'Student' ? studentStatusSelect.value : 'none',
        };
        if (manualPassword) payload.password = manualPassword;
        if (userRoleSelect.value === 'Student') {
            if (userSectionSelect.value) payload.sectionId = userSectionSelect.value;
            if (studentParentFullName.value.trim()) payload.parentName = studentParentFullName.value.trim();
            if (studentParentContactNumber && studentParentContactNumber.value.trim()) {
                payload.parentContactNumber = studentParentContactNumber.value.trim();
            }
        }
        if (userRoleSelect.value === 'Parent' && parentChildrenNames.value.trim()) {
            payload.childrenNames = parentChildrenNames.value.trim();
        }
        if (userRoleSelect.value === 'Teacher') {
            if (userAdviserSectionSelect.value) payload.adviserSectionId = userAdviserSectionSelect.value;
            const typedNames = teacherSubjects.value.trim()
                ? teacherSubjects.value.split(',').map(s => s.trim()).filter(Boolean)
                : [];
            const matchedIds = typedNames
                .map(name => {
                    const match = subjectsCache.find(s => s.name.toLowerCase() === name.toLowerCase());
                    return match ? match.id : null;
                })
                .filter(Boolean);
            const unmatched = typedNames.filter(name => !subjectsCache.some(s => s.name.toLowerCase() === name.toLowerCase()));
            if (unmatched.length) {
                alert(`These subjects don't match anything on file and were skipped: ${unmatched.join(', ')}. Use the Quick Add tags or check spelling.`);
            }
            if (matchedIds.length) payload.subjectIds = matchedIds;
        }

        const data = await authedFetch('/api/users', token, {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        if (!data.success) {
            alert(data.message);
            return;
        }

        let alertMsg = `✅ ${data.message}`;
        if (data.parentLinkMessage) {
            alertMsg += `\n\n🔗 ${data.parentLinkMessage}`;
        }
        if (data.tempPassword) {
            alertMsg += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 STUDENT LOGIN CREDENTIALS:\n• ID / LRN: ${payload.idNumber}\n• Email: ${payload.email}\n• Temp Password: ${data.tempPassword}`;
        }
        if (data.createdParent) {
            alertMsg += `\n\n👨‍👩‍👧 NEW PARENT LOGIN CREDENTIALS:\n• Parent Name: ${data.createdParent.name}\n• Parent ID: ${data.createdParent.idNumber}\n• Email: ${data.createdParent.email}\n• Temp Password: ${data.createdParent.tempPassword}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nPlease share these credentials securely with the student and parent.`;
        } else if (!data.tempPassword && !data.createdParent) {
            alertMsg += `\n\nThe password you set has been saved for this account.`;
        }
        alert(alertMsg);

        createUserForm.reset();
        generatedId.value = '';
        generatedEmail.value = '';
        userSectionSelect.value = '';
        userAdviserSectionSelect.value = '';
        teacherSubjects.value = '';
        if (studentParentContactNumber) studentParentContactNumber.value = '';
        updateParentLinkBadge();
        if (window.hideTeacherSubjectSuggestions) window.hideTeacherSubjectSuggestions();
        syncRoleFieldVisibility();
        loadUsers();
        if (userRoleSelect.value === 'Parent' || userRoleSelect.value === 'Student') {
            loadParentOptions();
            updateStudentSuggestions();
            loadParentLinks();
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

    async function loadOverview() {
        try {
            const data = await authedFetch('/api/users/overview', token);
            if (!data.success) return;
            const totalEl = document.getElementById('overviewTotalUsers');
            const studentsEl = document.getElementById('overviewTotalStudents');
            const teachersEl = document.getElementById('overviewTotalTeachers');
            const parentsEl = document.getElementById('overviewTotalParents');
            const staffEl = document.getElementById('overviewTotalStaff');

            if (totalEl) totalEl.textContent = Number(data.total || 0).toLocaleString();
            if (studentsEl) studentsEl.textContent = Number(data.students || 0).toLocaleString();
            if (teachersEl) teachersEl.textContent = Number(data.teachers || 0).toLocaleString();
            if (parentsEl) parentsEl.textContent = Number(data.parents || 0).toLocaleString();
            if (staffEl) staffEl.textContent = Number(data.staff || 0).toLocaleString();
        } catch (err) {
            console.error('loadOverview error:', err);
        }
    }

    async function loadUsers(page = 1) {
        currentPage = page;
        loadOverview();
        const role = document.getElementById('roleFilterDropdown').value;
        const search = document.getElementById('tableSearchField').value.trim();
        const params = new URLSearchParams({ page, limit: 25 });
        if (role && role !== 'All') params.set('role', role);
        if (search) params.set('search', search);

        const data = await authedFetch(`/api/users?${params}`, token);
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '';

        if (!data.success || !data.users.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No users found.</td></tr>';
            return;
        }

        for (const u of data.users) {
            const name = `${u.first_name} ${u.middle_initial ? u.middle_initial + ' ' : ''}${u.last_name}`;
            const roleLabel = u.role.charAt(0).toUpperCase() + u.role.slice(1);
            const dateAdded = new Date(u.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
            const avatarHtml = u.profile_picture_url
                ? `<img src="${u.profile_picture_url}" class="rounded-circle me-2 object-fit-cover shadow-sm border" style="width:28px;height:28px;min-width:28px;" alt="Avatar">`
                : `<span class="rounded-circle bg-light border d-inline-flex align-items-center justify-content-center me-2 text-muted shadow-sm" style="width:28px;height:28px;min-width:28px;font-size:12px;"><i class="bi bi-person-fill"></i></span>`;

            let roleCellHtml = `<span class="badge badge-role ${roleBadgeClass[u.role] || 'bg-secondary text-white'}">${roleLabel}</span>`;
            if (u.role === 'teacher') {
                if (u.advisoryClass) {
                    roleCellHtml += `
                        <div class="mt-1">
                            <span class="badge bg-success-subtle text-success border border-success-subtle d-inline-flex align-items-center gap-1 text-truncate" style="max-width: 220px; font-size: 0.72rem;" title="Advisory Class: ${u.advisoryClass}">
                                <i class="bi bi-shield-check"></i> Adv: ${u.advisoryClass}
                            </span>
                        </div>`;
                } else {
                    roleCellHtml += `
                        <div class="mt-1">
                            <span class="badge bg-light text-muted border text-truncate" style="font-size: 0.7rem;" title="No Advisory Class Assigned">
                                No Advisory
                            </span>
                        </div>`;
                }
            } else if (u.role === 'student') {
                if (u.studentSection) {
                    roleCellHtml += `
                        <div class="mt-1">
                            <span class="badge bg-primary-subtle text-primary border border-primary-subtle d-inline-flex align-items-center gap-1 text-truncate" style="max-width: 220px; font-size: 0.72rem;" title="Enrolled Section: ${u.studentSection}">
                                <i class="bi bi-people-fill"></i> Sec: ${u.studentSection}
                            </span>
                        </div>`;
                } else {
                    roleCellHtml += `
                        <div class="mt-1">
                            <span class="badge bg-warning-subtle text-warning border border-warning-subtle text-truncate" style="font-size: 0.7rem;" title="No Section Assigned">
                                <i class="bi bi-exclamation-circle me-0.5"></i> Unassigned
                            </span>
                        </div>`;
                }
            }

            const tr = document.createElement('tr');
            tr.dataset.role = roleLabel;
            tr.innerHTML = `
                <td class="px-3 py-2 fw-medium">
                    <div class="d-flex align-items-center">
                        ${avatarHtml}
                        <button type="button" class="btn btn-link p-0 text-dark fw-semibold text-decoration-none edit-user-btn" data-id="${u.id}" title="Click to view and edit profile details">${name}</button>
                    </div>
                </td>
                <td class="px-3 py-2 text-nowrap">
                    <span class="badge bg-light text-dark border font-monospace px-2 py-1">${u.id_number || '—'}</span>
                </td>
                <td class="px-3 py-2 text-muted"><i class="bi bi-envelope me-1 text-secondary"></i> ${u.email}</td>
                <td class="px-3 py-2 text-secondary">${u.contact_number || '—'}</td>
                <td class="px-3 py-2">${roleCellHtml}</td>
                <td class="px-3 py-2 text-nowrap">
                    ${u.temp_password ? `
                    <div class="d-inline-flex align-items-center gap-1">
                        <span class="badge bg-warning-subtle text-dark border border-warning font-monospace px-2 py-1" title="Initial Generated Password">
                            <i class="bi bi-key-fill text-warning me-1"></i>${u.temp_password}
                        </span>
                        <button type="button" class="btn btn-link p-0 text-secondary copy-pw-btn" data-pw="${u.temp_password}" title="Copy password">
                            <i class="bi bi-clipboard"></i>
                        </button>
                    </div>` : `
                    <span class="badge bg-light text-secondary border px-2 py-1" title="Password changed and protected for privacy">
                        <i class="bi bi-shield-lock-fill text-success me-1"></i>•••••••• <small class="text-muted">(Private)</small>
                    </span>`}
                </td>
                <td class="px-3 py-2"><span class="badge ${u.is_active ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'} px-2 py-1">${u.is_active ? 'Active' : 'Inactive'}</span></td>
                <td class="px-3 py-2 text-secondary text-nowrap">${dateAdded}</td>
                <td class="px-3 py-2 text-center">
                    <div class="d-inline-flex gap-2 align-items-center">
                        ${u.role === 'student' ? `
                        <button class="btn btn-link p-0 text-primary fs-5 assign-section-btn" title="Assign Section" data-id="${u.id}">
                            <i class="bi bi-diagram-3-fill"></i>
                        </button>` : ''}
                        <button class="btn btn-link p-0 text-warning fs-5 reset-default-pw-btn" title="Reset to Default Password (${u.id_number})" data-id="${u.id}" data-name="${name}" data-idnumber="${u.id_number}">
                            <i class="bi bi-arrow-counterclockwise"></i>
                        </button>
                        <button class="btn btn-link p-0 text-secondary fs-5 edit-user-btn" title="Edit" data-id="${u.id}">
                            <i class="bi bi-pencil-fill"></i>
                        </button>
                        <button class="btn btn-link p-0 ${u.is_active ? 'text-danger' : 'text-success'} fs-5 action-link-btn" title="${u.is_active ? 'Deactivate' : 'Activate'}" data-id="${u.id}" data-active="${u.is_active}">
                            <i class="bi ${u.is_active ? 'bi-person-dash-fill' : 'bi-person-check-fill'}"></i>
                        </button>
                        <button class="btn btn-link p-0 text-warning fs-5 archive-user-btn" title="Archive" data-id="${u.id}" data-name="${name}">
                            <i class="bi bi-archive-fill"></i>
                        </button>
                        <button class="btn btn-link p-0 text-danger fs-5 delete-user-btn" title="Delete" data-id="${u.id}" data-name="${name}">
                            <i class="bi bi-trash-fill"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        }

        // --- Copy Generated Password ---
        tbody.querySelectorAll('.copy-pw-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const pw = btn.dataset.pw;
                if (!pw) return;
                try {
                    await navigator.clipboard.writeText(pw);
                    const icon = btn.querySelector('i');
                    if (icon) {
                        icon.className = 'bi bi-check2 text-success';
                        setTimeout(() => { icon.className = 'bi bi-clipboard'; }, 1500);
                    }
                } catch {
                    prompt('Generated Password:', pw);
                }
            });
        });

        // --- Reset to Default Password ---
        tbody.querySelectorAll('.reset-default-pw-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const userId = btn.dataset.id;
                const userName = btn.dataset.name;
                const idNumber = btn.dataset.idnumber;
                if (!confirm(`Reset password for ${userName} back to default generated password (${idNumber})?\n\nThe user will be required to change it upon their next login.`)) {
                    return;
                }
                const result = await authedFetch(`/api/users/${userId}/reset-default-password`, token, { method: 'POST' });
                if (result.success) {
                    alert(result.message || `Password reset to ${idNumber} successfully!`);
                    loadUsers(currentPage);
                } else {
                    alert(result.message || 'Failed to reset password.');
                }
            });
        });

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

        // --- Archive (hides from the directory but keeps all history) ---
        tbody.querySelectorAll('.archive-user-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm(`Archive ${btn.dataset.name}? This deactivates their login and hides them from the directory, but keeps all their records (grades, attendance, etc). You can restore this from the database view if needed.`)) return;
                const result = await authedFetch(`/api/users/${btn.dataset.id}`, token, {
                    method: 'PATCH',
                    body: JSON.stringify({ archived: true }),
                });
                if (result.success) loadUsers(currentPage);
                else alert(result.message);
            });
        });

        // --- Delete (permanent — cascades to related records) ---
        tbody.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const step1 = confirm(`Permanently delete ${btn.dataset.name}? This also deletes ALL of their related records (schedules, grades, attendance, quiz attempts, etc). This CANNOT be undone.\n\nIf you just want to remove them from view but keep their history, use Archive instead.`);
                if (!step1) return;
                const step2 = prompt(`Type DELETE to confirm permanently deleting ${btn.dataset.name}.`);
                if (step2 !== 'DELETE') return;
                const result = await authedFetch(`/api/users/${btn.dataset.id}`, token, { method: 'DELETE' });
                if (result.success) loadUsers(currentPage);
                else alert(result.message);
            });
        });

        // --- Edit ---
        tbody.querySelectorAll('.edit-user-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const alertEl = document.getElementById('editUserAlert');
                if (alertEl) {
                    alertEl.classList.add('d-none');
                    alertEl.textContent = '';
                }

                const result = await authedFetch(`/api/users/${btn.dataset.id}`, token);
                if (!result.success) { alert(result.message); return; }
                const u = result.user;
                document.getElementById('editUserId').value = u.id;
                document.getElementById('editUserRoleLabel').textContent = u.role.charAt(0).toUpperCase() + u.role.slice(1);
                document.getElementById('editFirstName').value = u.first_name || '';
                document.getElementById('editMiddleInitial').value = u.middle_initial || '';
                document.getElementById('editLastName').value = u.last_name || '';
                document.getElementById('editContactNumber').value = u.contact_number || '';
                document.getElementById('editEmail').value = u.email || '';
                const editIdInput = document.getElementById('editIdNumber');
                if (editIdInput) editIdInput.value = u.id_number || '';
                const editLrnLabel = document.getElementById('editLrnLabel');
                if (editLrnLabel) {
                    editLrnLabel.innerHTML = u.role === 'student'
                        ? 'Learner Reference Number (LRN) <span class="text-danger">*</span>'
                        : 'ID Number <span class="text-danger">*</span>';
                }

                const isStudent = u.role === 'student';
                const isParent = u.role === 'parent';
                const isTeacher = u.role === 'teacher';

                // Profile photo update function is strictly available for Student accounts only
                const avatarWrap = document.getElementById('editUserAvatarWrap');
                if (avatarWrap) {
                    avatarWrap.classList.toggle('d-none', !isStudent);
                }

                if (isStudent) {
                    const avatarImg = document.getElementById('editUserAvatarImg');
                    if (avatarImg) {
                        avatarImg.src = u.profile_picture_url || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'%3E%3Crect width='72' height='72' fill='%23e9ecef'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='28' fill='%236c757d'%3E👤%3C/text%3E%3C/svg%3E";
                    }
                    const fullNameLabel = document.getElementById('editUserFullNameLabel');
                    if (fullNameLabel) {
                        fullNameLabel.textContent = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Student Profile';
                    }
                    const photoNotice = document.getElementById('editUserPhotoNotice');
                    if (photoNotice) {
                        photoNotice.textContent = 'Official School 2x2 ID Photo (Managed by Teachers & Administrators)';
                    }
                }

                document.getElementById('editProgramWrap').classList.toggle('d-none', !isStudent);
                document.getElementById('editParentNameWrap').classList.toggle('d-none', !isStudent);
                document.getElementById('editChildrenNamesWrap').classList.toggle('d-none', !isParent);
                document.getElementById('editAdviserSectionWrap').classList.toggle('d-none', !isTeacher);
                document.getElementById('editSubjectsHandledWrap').classList.toggle('d-none', !isTeacher);

                document.getElementById('editProgramSelect').value = u.program || 'none';
                document.getElementById('editParentName').value = u.parent_name || '';
                document.getElementById('editChildrenNames').value = u.children_names || '';
                document.getElementById('editAdviserSectionSelect').value = u.adviserSectionId || '';
                const subjSelect = document.getElementById('editSubjectsHandledSelect');
                Array.from(subjSelect.options).forEach(o => { o.selected = (u.subjectIds || []).map(String).includes(o.value); });

                showEditUserModal();
                originalUserEditSnapshot = {
                    firstName: document.getElementById('editFirstName')?.value || '',
                    middleInitial: document.getElementById('editMiddleInitial')?.value || '',
                    lastName: document.getElementById('editLastName')?.value || '',
                    contactNumber: document.getElementById('editContactNumber')?.value || '',
                    email: document.getElementById('editEmail')?.value || '',
                    idNumber: document.getElementById('editIdNumber')?.value || '',
                    program: document.getElementById('editProgramSelect')?.value || '',
                    parentName: document.getElementById('editParentName')?.value || '',
                    childrenNames: document.getElementById('editChildrenNames')?.value || '',
                    adviserSection: document.getElementById('editAdviserSectionSelect')?.value || '',
                    subjectsHandled: Array.from(document.getElementById('editSubjectsHandledSelect')?.selectedOptions || []).map(o => o.value).sort().join(',')
                };
            });
        });

        // --- Assign/Reassign Section (students only) ---
        tbody.querySelectorAll('.assign-section-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('assignSectionUserId').value = btn.dataset.id;
                document.getElementById('assignSectionSelect').value = '';
                showAssignSectionModal();
            });
        });
    }

    // --- Modal Helpers & Singleton Event Handlers ---
    let originalUserEditSnapshot = null;
    let isSavingUserEdit = false;

    function hasUnsavedUserEditChanges() {
        if (!originalUserEditSnapshot) return false;
        const currentSnapshot = {
            firstName: document.getElementById('editFirstName')?.value || '',
            middleInitial: document.getElementById('editMiddleInitial')?.value || '',
            lastName: document.getElementById('editLastName')?.value || '',
            contactNumber: document.getElementById('editContactNumber')?.value || '',
            email: document.getElementById('editEmail')?.value || '',
            idNumber: document.getElementById('editIdNumber')?.value || '',
            program: document.getElementById('editProgramSelect')?.value || '',
            parentName: document.getElementById('editParentName')?.value || '',
            childrenNames: document.getElementById('editChildrenNames')?.value || '',
            adviserSection: document.getElementById('editAdviserSectionSelect')?.value || '',
            subjectsHandled: Array.from(document.getElementById('editSubjectsHandledSelect')?.selectedOptions || []).map(o => o.value).sort().join(',')
        };
        return JSON.stringify(currentSnapshot) !== JSON.stringify(originalUserEditSnapshot);
    }

    const editUserModalEl = document.getElementById('editUserModal');
    if (editUserModalEl) {
        editUserModalEl.addEventListener('hide.bs.modal', (event) => {
            if (isSavingUserEdit) return;
            if (hasUnsavedUserEditChanges()) {
                const confirmDiscard = confirm('You have unsaved changes to this account. Are you sure you want to discard them and close?');
                if (!confirmDiscard) {
                    event.preventDefault();
                }
            }
        });
        editUserModalEl.addEventListener('hidden.bs.modal', () => {
            isSavingUserEdit = false;
            originalUserEditSnapshot = null;
        });
    }

    let isBulkImportRunning = false;
    const bulkImportModalEl = document.getElementById('bulkImportModal');
    if (bulkImportModalEl) {
        bulkImportModalEl.addEventListener('hide.bs.modal', (event) => {
            if (isBulkImportRunning) {
                const confirmDiscard = confirm('Bulk import is currently creating accounts. If you close now, account creation will continue in the background, but you will miss downloading the generated temporary passwords!\n\nAre you sure you want to close?');
                if (!confirmDiscard) {
                    event.preventDefault();
                    return;
                }
            }
            const fileInput = document.getElementById('bulkImportFileInput');
            if (fileInput && fileInput.files && fileInput.files.length > 0) {
                const confirmDiscard = confirm('A file is currently selected for bulk import. Are you sure you want to close?');
                if (!confirmDiscard) {
                    event.preventDefault();
                }
            }
        });
    }

    function showEditUserModal() {
        if (!editUserModalEl) return;
        const modal = bootstrap.Modal.getOrCreateInstance(editUserModalEl);
        modal.show();
    }
    function hideEditUserModal() {
        if (!editUserModalEl) return;
        const modal = bootstrap.Modal.getInstance(editUserModalEl) || bootstrap.Modal.getOrCreateInstance(editUserModalEl);
        if (modal) modal.hide();
        setTimeout(() => {
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('overflow');
            document.body.style.removeProperty('padding-right');
        }, 350);
    }

    const assignSectionModalEl = document.getElementById('assignSectionModal');
    function showAssignSectionModal() {
        if (!assignSectionModalEl) return;
        const modal = bootstrap.Modal.getOrCreateInstance(assignSectionModalEl);
        modal.show();
    }
    function hideAssignSectionModal() {
        if (!assignSectionModalEl) return;
        const modal = bootstrap.Modal.getInstance(assignSectionModalEl) || bootstrap.Modal.getOrCreateInstance(assignSectionModalEl);
        if (modal) modal.hide();
        setTimeout(() => {
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('overflow');
            document.body.style.removeProperty('padding-right');
        }, 350);
    }

    // Assign Section Save
    const btnSaveSection = document.getElementById('btnSaveSection');
    if (btnSaveSection) {
        btnSaveSection.addEventListener('click', async () => {
            const userId = document.getElementById('assignSectionUserId').value;
            const sectionId = document.getElementById('assignSectionSelect').value || null;
            const originalText = btnSaveSection.innerHTML;
            btnSaveSection.disabled = true;
            btnSaveSection.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Saving...';

            try {
                const result = await authedFetch(`/api/users/${userId}`, token, {
                    method: 'PATCH',
                    body: JSON.stringify({ sectionId }),
                });
                if (result.success) {
                    hideAssignSectionModal();
                    loadUsers(currentPage);
                } else {
                    alert(result.message || 'Could not assign section.');
                }
            } catch (err) {
                console.error('Save section error:', err);
                alert('An error occurred while saving the section assignment.');
            } finally {
                btnSaveSection.disabled = false;
                btnSaveSection.innerHTML = originalText;
            }
        });
    }

    // Edit User Save Changes
    const btnSaveEditUser = document.getElementById('btnSaveEditUser');
    if (btnSaveEditUser) {
        btnSaveEditUser.addEventListener('click', async () => {
            const userId = document.getElementById('editUserId').value;
            if (!userId) return;

            const alertEl = document.getElementById('editUserAlert');
            if (alertEl) {
                alertEl.classList.add('d-none');
                alertEl.textContent = '';
            }

            const firstNameVal = document.getElementById('editFirstName').value.trim();
            const lastNameVal = document.getElementById('editLastName').value.trim();
            const emailVal = document.getElementById('editEmail').value.trim();
            const contactVal = document.getElementById('editContactNumber').value.trim();
            const miVal = document.getElementById('editMiddleInitial').value.trim();

            if (!firstNameVal) {
                if (alertEl) {
                    alertEl.textContent = 'First Name is required.';
                    alertEl.classList.remove('d-none');
                }
                document.getElementById('editFirstName').focus();
                return;
            }
            if (!lastNameVal) {
                if (alertEl) {
                    alertEl.textContent = 'Last Name is required.';
                    alertEl.classList.remove('d-none');
                }
                document.getElementById('editLastName').focus();
                return;
            }
            if (!emailVal) {
                if (alertEl) {
                    alertEl.textContent = 'Email is required.';
                    alertEl.classList.remove('d-none');
                }
                document.getElementById('editEmail').focus();
                return;
            }

            const roleLabel = document.getElementById('editUserRoleLabel').textContent.toLowerCase();
            const editIdInput = document.getElementById('editIdNumber');
            const idNumberVal = editIdInput ? editIdInput.value.trim() : '';

            if (!idNumberVal) {
                if (alertEl) {
                    alertEl.textContent = (roleLabel === 'student' ? 'Student LRN' : 'ID Number') + ' is required.';
                    alertEl.classList.remove('d-none');
                }
                if (editIdInput) editIdInput.focus();
                return;
            }

            const payload = {
                firstName: firstNameVal,
                middleInitial: miVal,
                lastName: lastNameVal,
                contactNumber: contactVal,
                email: emailVal,
                idNumber: idNumberVal,
            };
            if (roleLabel === 'student') {
                payload.program = document.getElementById('editProgramSelect').value;
                payload.parentName = document.getElementById('editParentName').value.trim();
            } else if (roleLabel === 'parent') {
                payload.childrenNames = document.getElementById('editChildrenNames').value.trim();
            } else if (roleLabel === 'teacher') {
                payload.adviserSectionId = document.getElementById('editAdviserSectionSelect').value || null;
                payload.subjectIds = Array.from(document.getElementById('editSubjectsHandledSelect').selectedOptions).map(o => o.value);
            }

            const originalText = btnSaveEditUser.innerHTML;
            btnSaveEditUser.disabled = true;
            btnSaveEditUser.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Saving...';

            try {
                const result = await authedFetch(`/api/users/${userId}`, token, {
                    method: 'PATCH',
                    body: JSON.stringify(payload),
                });

                if (result.success) {
                    isSavingUserEdit = true;
                    hideEditUserModal();
                    loadUsers(currentPage);
                    if (roleLabel === 'parent' || roleLabel === 'student') {
                        loadParentOptions();
                        loadStudentOptionsForLinking();
                        loadManageStudents();
                    }
                } else {
                    if (alertEl) {
                        alertEl.textContent = result.message || 'Could not update user.';
                        alertEl.classList.remove('d-none');
                    } else {
                        alert(result.message || 'Could not update user.');
                    }
                }
            } catch (err) {
                console.error('Save edit user error:', err);
                if (alertEl) {
                    alertEl.textContent = 'A network or server error occurred. Please try again.';
                    alertEl.classList.remove('d-none');
                } else {
                    alert('An error occurred while updating the user.');
                }
            } finally {
                btnSaveEditUser.disabled = false;
                btnSaveEditUser.innerHTML = originalText;
            }
        });
    }

    // Reset to Default Password from Edit Modal
    const btnModalResetPassword = document.getElementById('btnModalResetPassword');
    if (btnModalResetPassword) {
        btnModalResetPassword.addEventListener('click', async () => {
            const userId = document.getElementById('editUserId').value;
            const firstName = document.getElementById('editFirstName').value.trim();
            const lastName = document.getElementById('editLastName').value.trim();
            const userName = `${firstName} ${lastName}`.trim() || 'this user';
            const editIdInput = document.getElementById('editIdNumber');
            const idNumber = editIdInput ? editIdInput.value.trim() : '';

            if (!userId) return;
            if (!confirm(`Reset password for ${userName} back to default generated password (${idNumber})?\n\nThe user will be required to change it upon their next login.`)) {
                return;
            }

            const result = await authedFetch(`/api/users/${userId}/reset-default-password`, token, { method: 'POST' });
            if (result.success) {
                alert(result.message || 'Password reset to default successfully.');
                isSavingUserEdit = true;
                hideEditUserModal();
                loadUsers(currentPage);
            } else {
                alert(result.message || 'Failed to reset password.');
            }
        });
    }

    // Student ID Photo Upload/Change (Strictly Student Only)
    const btnEditUserChangePhoto = document.getElementById('btnEditUserChangePhoto');
    const editUserPhotoInput = document.getElementById('editUserPhotoInput');
    if (btnEditUserChangePhoto && editUserPhotoInput) {
        btnEditUserChangePhoto.addEventListener('click', () => editUserPhotoInput.click());
        editUserPhotoInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const userId = document.getElementById('editUserId').value;
            const roleLabel = document.getElementById('editUserRoleLabel').textContent.toLowerCase();
            if (!userId || roleLabel !== 'student') {
                alert('Only student profile photos can be updated in admin user management.');
                editUserPhotoInput.value = '';
                return;
            }
            if (typeof openAvatarCropper === 'function') {
                openAvatarCropper({
                    file,
                    uploadEndpoint: `/api/users/${userId}`,
                    token,
                    onSuccess: (savedUrl) => {
                        const avatarImg = document.getElementById('editUserAvatarImg');
                        if (avatarImg) avatarImg.src = savedUrl;
                        loadUsers(currentPage);
                    }
                });
            }
            editUserPhotoInput.value = '';
        });
    }

    // --- Parent-Student Connections & Datalists ---
    let parentsCache = [];

    async function loadParentOptions() {
        const data = await authedFetch('/api/users?role=Parent&limit=1000', token);
        if (data.success) {
            parentsCache = data.users;
            updateParentSuggestions(parentsCache);
            updateParentLinkBadge();
        }
    }

    // --- Autocomplete datalists for the Create Account form (Student → Parent Full Name, Parent → Child's Name) ---
    function updateParentSuggestions(list) {
        const datalist = document.getElementById('parentSuggestionsList');
        if (!datalist) return;
        datalist.innerHTML = list.map(p => {
            const name = `${p.first_name} ${p.middle_initial ? p.middle_initial + ' ' : ''}${p.last_name}`;
            return `<option value="${name}">${p.email}</option>`;
        }).join('');
    }

    async function updateStudentSuggestions() {
        const datalist = document.getElementById('studentSuggestionsList');
        if (!datalist) return;
        const data = await authedFetch('/api/users/students?limit=1000&enrollmentStatus=all', token);
        if (data.success && data.students) {
            datalist.innerHTML = data.students.map(s => {
                const name = `${s.firstName} ${s.middleInitial ? s.middleInitial + ' ' : ''}${s.lastName}`;
                return `<option value="${name}">${s.idNumber ? 'ID: ' + s.idNumber : ''}</option>`;
            }).join('');
        }
    }

    async function loadParentLinks() {
        const data = await authedFetch('/api/users/parent-links', token);
        const tbody = document.getElementById('parentLinksTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!data.success || !data.links.length) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-3">No parent-student links yet.</td></tr>';
            return;
        }
        for (const link of data.links) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-3">${link.parentName} <span class="text-muted">(${link.parentEmail})</span></td>
                <td class="px-3">${link.studentName} <span class="text-muted">(${link.studentIdNumber})</span></td>
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

    loadParentOptions();
    updateStudentSuggestions();
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

    function refreshManageStrands() {
        const gradeLevel = manageGradeFilter.value;
        const currentStrand = manageStrandFilter.value;
        const matchingStrands = strandsMatchingGrade(gradeLevel);
        const strandOptions = matchingStrands.map(s => `<option value="${s.id}">${s.code} - ${s.title}</option>`).join('');
        manageStrandFilter.innerHTML = `<option value="">All strands</option>${strandOptions}`;
        if (currentStrand && matchingStrands.some(s => String(s.id) === String(currentStrand))) {
            manageStrandFilter.value = currentStrand;
        } else {
            manageStrandFilter.value = '';
        }
        const matching = sectionsMatching(manageStrandFilter.value, manageGradeFilter.value);
        manageSectionFilter.innerHTML = `<option value="">All sections</option>${sectionOptionsHtml(matching)}`;
    }

    manageStrandFilter.addEventListener('change', () => {
        if (manageStrandFilter.value && !manageGradeFilter.value) {
            const strandSections = sectionsCache.filter(s => String(s.strand_id) === String(manageStrandFilter.value));
            const uniqueGrades = [...new Set(strandSections.map(s => s.grade_level))];
            if (uniqueGrades.length === 1) {
                manageGradeFilter.value = String(uniqueGrades[0]);
                refreshManageStrands();
            }
        }
        const matching = sectionsMatching(manageStrandFilter.value, manageGradeFilter.value);
        manageSectionFilter.innerHTML = `<option value="">All sections</option>${sectionOptionsHtml(matching)}`;
        refreshPromoteSectionOptions();
        loadManageStudents();
    });
    manageGradeFilter.addEventListener('change', () => {
        refreshManageStrands();
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
        const apiBase = (window.MENTORAE_CONFIG && window.MENTORAE_CONFIG.API_BASE_URL) || window.API_BASE || 'http://localhost:5000';
        window.open(`${apiBase}/api/users/bulk-import/template?token=${encodeURIComponent(token)}`, '_blank');
    });

    const btnRunBulkImport = document.getElementById('btnRunBulkImport');
    btnRunBulkImport.addEventListener('click', async () => {
        const fileInput = document.getElementById('bulkImportFileInput');
        const modeSelect = document.getElementById('bulkImportModeSelect');
        const progressEl = document.getElementById('bulkImportProgress');
        const badgesEl = document.getElementById('bulkImportSummaryBadges');
        const resultsEl = document.getElementById('bulkImportResults');
        const credsEl = document.getElementById('bulkImportCredentials');
        const file = fileInput.files[0];
        if (!file) {
            alert('Please select an Excel or CSV file first.');
            return;
        }

        const mode = modeSelect ? modeSelect.value : 'all';

        isBulkImportRunning = true;
        btnRunBulkImport.disabled = true;
        btnRunBulkImport.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Importing Accounts...';

        progressEl.innerHTML = `
            <div class="card border border-success-subtle shadow-xs rounded-3 p-3 bg-white mb-2" id="bulkImportProgressCard">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="text-xs fw-bold text-uppercase d-flex align-items-center gap-2" id="bulkImportStageHeader">
                        <span class="spinner-border spinner-border-sm text-success" id="bulkImportBarSpinner" role="status" style="width: 14px; height: 14px;"></span>
                        <span id="bulkImportStageTitle" class="text-dark">Uploading spreadsheet...</span>
                    </span>
                    <span class="text-xs fw-bold text-success" id="bulkImportPercent">15%</span>
                </div>
                <div class="progress" style="height: 10px; border-radius: 6px; background-color: #e9ecef;">
                    <div class="progress-bar progress-bar-striped progress-bar-animated bg-success"
                         id="bulkImportProgressBar"
                         role="progressbar"
                         style="width: 15%; transition: width 0.3s ease;"
                         aria-valuenow="15" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
                <div class="d-flex justify-content-between align-items-center mt-2 text-xs text-muted">
                    <span id="bulkImportStageDetail">Reading workbook and verifying sheets...</span>
                    <span id="bulkImportTimeNotice" class="text-muted"><i class="bi bi-shield-lock me-1"></i>Please keep modal open</span>
                </div>
            </div>
        `;
        if (badgesEl) badgesEl.innerHTML = '';
        resultsEl.innerHTML = '';
        credsEl.innerHTML = '';

        function setProgressBar(percent, title, detail, isError = false) {
            const bar = document.getElementById('bulkImportProgressBar');
            const pctEl = document.getElementById('bulkImportPercent');
            const titleEl = document.getElementById('bulkImportStageTitle');
            const detailEl = document.getElementById('bulkImportStageDetail');
            const spinner = document.getElementById('bulkImportBarSpinner');
            if (bar) {
                bar.style.width = `${percent}%`;
                bar.setAttribute('aria-valuenow', percent);
                if (isError) {
                    bar.classList.remove('bg-success', 'progress-bar-striped', 'progress-bar-animated');
                    bar.classList.add('bg-danger');
                } else if (percent >= 100) {
                    bar.classList.remove('progress-bar-striped', 'progress-bar-animated');
                    bar.classList.add('bg-success');
                }
            }
            if (pctEl) {
                pctEl.textContent = `${percent}%`;
                pctEl.className = isError ? 'text-xs fw-bold text-danger' : (percent >= 100 ? 'text-xs fw-bold text-success' : 'text-xs fw-bold text-primary');
            }
            if (titleEl) {
                titleEl.textContent = title;
                titleEl.className = isError ? 'text-danger fw-bold' : (percent >= 100 ? 'text-success fw-bold' : 'text-dark fw-bold');
            }
            if (detailEl) {
                detailEl.textContent = detail;
                detailEl.className = isError ? 'text-danger small' : 'text-muted';
            }
            if (spinner) {
                if (isError) {
                    spinner.outerHTML = '<i class="bi bi-exclamation-triangle-fill text-danger fs-6" id="bulkImportBarSpinner"></i>';
                } else if (percent >= 100) {
                    spinner.outerHTML = '<i class="bi bi-check-circle-fill text-success fs-6" id="bulkImportBarSpinner"></i>';
                }
            }
        }

        let currentPct = 15;
        const progressInterval = setInterval(() => {
            if (currentPct < 35) {
                currentPct += 5;
                setProgressBar(currentPct, 'Validating Rows & Checking Sections...', 'Checking sections, strands, and duplicate ID numbers...');
            } else if (currentPct < 68) {
                currentPct += 3;
                setProgressBar(currentPct, 'Creating Accounts & Credentials...', 'Generating emails, hashing passwords, and linking parents...');
            } else if (currentPct < 90) {
                currentPct += 1;
                setProgressBar(currentPct, 'Finalizing Database Records...', 'Creating notifications and generating credentials download...');
            }
        }, 220);

        const formData = new FormData();
        formData.append('importFile', file);
        formData.append('mode', mode);

        try {
            const apiBase = (window.MENTORAE_CONFIG && window.MENTORAE_CONFIG.API_BASE_URL) || window.API_BASE || 'http://localhost:5000';
            const url = `${apiBase}/api/users/bulk-import?mode=${encodeURIComponent(mode)}&token=${encodeURIComponent(token)}`;

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: formData,
            });

            let data;
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                data = await res.json();
            } else {
                const text = await res.text();
                throw new Error(`Server returned status ${res.status}: ${text.slice(0, 150) || res.statusText}`);
            }

            if (!res.ok || !data.success) {
                clearInterval(progressInterval);
                setProgressBar(100, 'Import Failed', data?.message || `Import failed with status ${res.status}.`, true);
                return;
            }

            clearInterval(progressInterval);
            setProgressBar(100, 'Import Complete!', data.message || 'All accounts processed successfully.');

            // Summary Badges
            if (data.summary && badgesEl) {
                const s = data.summary;
                badgesEl.innerHTML = `
                    <span class="badge bg-success-subtle text-success border border-success-subtle px-2.5 py-1.5 rounded-2">
                        <i class="bi bi-mortarboard-fill me-1"></i> ${s.studentsCreated} Student(s)
                    </span>
                    ${s.studentsSkipped > 0 ? `
                    <span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2.5 py-1.5 rounded-2">
                        <i class="bi bi-arrow-repeat me-1"></i> ${s.studentsSkipped} Already Existed (Skipped)
                    </span>` : ''}
                    <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-2.5 py-1.5 rounded-2">
                        <i class="bi bi-people-fill me-1"></i> ${s.parentsLinked} Parent(s) Linked (${s.parentsCreated} New)
                    </span>
                    <span class="badge bg-info-subtle text-info-emphasis border border-info-subtle px-2.5 py-1.5 rounded-2">
                        <i class="bi bi-person-badge-fill me-1"></i> ${s.teachersCreated} Teacher(s)
                    </span>
                    ${s.totalErrors > 0 ? `
                    <span class="badge bg-danger-subtle text-danger border border-danger-subtle px-2.5 py-1.5 rounded-2">
                        <i class="bi bi-x-circle-fill me-1"></i> ${s.totalErrors} Error(s)
                    </span>` : ''}
                `;
            }

            // Results Log
            resultsEl.innerHTML = data.results.map(r => {
                const isCreated = r.status === 'created';
                const isSkipped = r.status === 'skipped';
                const roleIcon = r.type === 'teacher' ? 'bi-person-badge' : 'bi-mortarboard';
                const rowBg = isCreated ? 'bg-light-subtle' : (isSkipped ? 'bg-warning-subtle' : 'bg-danger-subtle');
                const statusColor = isCreated ? 'text-success' : (isSkipped ? 'text-warning-emphasis fw-medium' : 'text-danger fw-semibold');
                return `
                    <div class="d-flex justify-content-between align-items-center border-bottom py-1.5 px-2 text-sm ${rowBg}">
                        <span class="fw-semibold text-dark">
                            <i class="bi ${roleIcon} me-1 text-muted"></i>
                            Row ${r.row}: ${escapeHtml(r.name)}
                        </span>
                        <span class="${statusColor} small">
                            ${escapeHtml(r.message)}
                        </span>
                    </div>
                `;
            }).join('');

            // Credentials Download
            const allCreds = data.credentials || [];
            if (allCreds.length > 0) {
                const csvRows = ['Role,Name,ID Number,Email,Temporary Password'];
                allCreds.forEach(c => csvRows.push(`"${c.role || 'User'}","${c.name}",${c.idNumber},${c.email},${c.tempPassword}`));
                const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                credsEl.innerHTML = `
                    <div class="alert alert-success d-flex align-items-start gap-2 text-sm mb-0 rounded-3 shadow-xs">
                        <i class="bi bi-key-fill fs-5 text-success mt-0.5"></i>
                        <div>
                            <strong>${allCreds.length} Temporary Password(s) Generated!</strong>
                            <p class="mb-2 text-muted small">
                                Download this credentials list now so you can distribute them to students, parents, and teachers. For security, temporary passwords will not be displayed again.
                            </p>
                            <a href="${url}" download="mentorae-new-user-credentials.csv" class="btn btn-sm btn-success fw-bold d-inline-flex align-items-center gap-1.5 text-white">
                                <i class="bi bi-file-earmark-arrow-down"></i> Download Credentials (.csv)
                            </a>
                        </div>
                    </div>
                `;
            }

            fileInput.value = '';
            loadOverview();
            loadUsers();
            if (typeof loadManageStudents === 'function') {
                loadManageStudents();
            }
        } catch (err) {
            clearInterval(progressInterval);
            console.error('bulk import error:', err);
            const msg = (err && err.message) ? err.message : 'Could not reach the server.';
            setProgressBar(100, 'Import Error', msg, true);
        } finally {
            clearInterval(progressInterval);
            isBulkImportRunning = false;
            btnRunBulkImport.disabled = false;
            btnRunBulkImport.innerHTML = '<i class="bi bi-upload"></i> Start Bulk Import';
        }
    });

    wireLogout('logoutBtn', 'login.html', token);

    loadOverview();
    loadUsers();
});
