document.addEventListener('DOMContentLoaded', async () => {
    const { token } = requireSession('login.html');

    function updateDateTime() {
        const liveDateElement = document.getElementById('liveDate');
        const liveTimeElement = document.getElementById('liveTime');
        if (!liveDateElement || !liveTimeElement) return;
        const now = new Date();
        liveDateElement.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        liveTimeElement.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    const contentPanel = document.getElementById('settingsContentPanel');
    const tabButtons = document.querySelectorAll('#settingsTabs .nav-link');
    const btnSaveAll = document.getElementById('btnSaveAll');

    // Loaded from the server, kept in sync as the admin edits any tab
    let settings = {};
    try {
        const initial = await authedFetch('/api/settings', token);
        if (initial && initial.success) settings = initial.settings || {};
    } catch (err) {
        console.error('Failed to load system settings from server:', err);
    }

    function bool(v) { return v === '1' || v === 1 || v === true; }

    const templates = {
        general: () => `
            <div class="d-flex align-items-center gap-2 mb-4">
                <i class="bi bi-globe panel-header-icon text-danger"></i>
                <h2 class="h5 fw-bold m-0 text-dark">General Settings</h2>
            </div>
            <div class="d-flex flex-column gap-3">
                <div>
                    <label class="form-label text-dark fw-bold text-sm mb-1">School Name</label>
                    <input type="text" class="form-control custom-form-input w-100" id="cfgSchoolName" value="${settings.school_name || ''}">
                </div>
                <div>
                    <label class="form-label text-dark fw-bold text-sm mb-1">Current School Year</label>
                    <input type="text" class="form-control custom-form-input w-100" id="cfgSchoolYear" value="${settings.school_year || '2026 - 2027'}">
                </div>
                <div>
                    <label class="form-label text-dark fw-bold text-sm mb-1">Current Academic Term</label>
                    <select class="form-select custom-form-select w-50" id="cfgCurrentTerm">
                        <option value="1st Term" ${(settings.current_semester === '1st Term' || !settings.current_semester) ? 'selected' : ''}>1st Term</option>
                        <option value="2nd Term" ${settings.current_semester === '2nd Term' ? 'selected' : ''}>2nd Term</option>
                        <option value="3rd Term" ${settings.current_semester === '3rd Term' ? 'selected' : ''}>3rd Term</option>
                    </select>
                </div>
                <div>
                    <label class="form-label text-dark fw-bold text-sm mb-1">Language</label>
                    <select class="form-select custom-form-select w-50" id="cfgLanguage">
                        <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
                        <option value="tl" ${settings.language === 'tl' ? 'selected' : ''}>Filipino</option>
                    </select>
                </div>
                <div class="row g-2">
                    <div class="col-md-7">
                        <label class="form-label text-dark fw-bold text-sm mb-1">School Principal / Head</label>
                        <input type="text" class="form-control custom-form-input w-100" id="cfgSchoolPrincipal" value="${settings.school_principal || ''}" placeholder="e.g. MARIA L. SANTOS, PhD">
                    </div>
                    <div class="col-md-5">
                        <label class="form-label text-dark fw-bold text-sm mb-1">Principal Title / Designation</label>
                        <input type="text" class="form-control custom-form-input w-100" id="cfgSchoolPrincipalTitle" value="${settings.school_principal_title || 'Principal II'}" placeholder="e.g. Principal II">
                    </div>
                </div>
                <div class="maintenance-block p-3 mt-2 d-flex align-items-start gap-3">
                    <input type="checkbox" class="form-check-input custom-checkbox mt-1" id="cfgMaintenance" ${bool(settings.maintenance_mode) ? 'checked' : ''}>
                    <div>
                        <label for="cfgMaintenance" class="form-label text-dark fw-bold text-sm m-0 clickable">Maintenance Mode</label>
                        <p class="text-muted text-sm m-0 opacity-75">Enable this to restrict system access for maintenance</p>
                    </div>
                </div>
            </div>
        `,
        notifications: () => `
            <div class="d-flex align-items-center gap-2 mb-4">
                <i class="bi bi-bell-fill panel-header-icon text-danger"></i>
                <h2 class="h5 fw-bold m-0 text-dark">Notification</h2>
            </div>
            <div class="d-flex flex-column gap-3">
                <div class="notification-row-item p-3 d-flex align-items-center justify-content-between border">
                    <div class="d-flex align-items-center gap-3">
                        <i class="bi bi-envelope-fill text-secondary fs-5"></i>
                        <div>
                            <h3 class="fs-6 fw-bold text-dark m-0">Email Notifications</h3>
                            <span class="text-muted text-sm">Send notifications via email</span>
                        </div>
                    </div>
                    <input type="checkbox" class="form-check-input custom-checkbox" id="cfgNotifyEmail" ${bool(settings.notify_email) ? 'checked' : ''}>
                </div>
                <div class="notification-row-item p-3 d-flex align-items-center justify-content-between border">
                    <div class="d-flex align-items-center gap-3">
                        <i class="bi bi-bell text-secondary fs-5"></i>
                        <div>
                            <h3 class="fs-6 fw-bold text-dark m-0">SMS Notifications</h3>
                            <span class="text-muted text-sm">Send notifications via SMS</span>
                        </div>
                    </div>
                    <input type="checkbox" class="form-check-input custom-checkbox" id="cfgNotifySMS" ${bool(settings.notify_sms) ? 'checked' : ''}>
                </div>
                <div class="notification-row-item p-3 d-flex align-items-center justify-content-between border">
                    <div class="d-flex align-items-center gap-3">
                        <i class="bi bi-bell-fill text-secondary fs-5"></i>
                        <div>
                            <h3 class="fs-6 fw-bold text-dark m-0">Push Notifications</h3>
                            <span class="text-muted text-sm">Send browser push notifications</span>
                        </div>
                    </div>
                    <input type="checkbox" class="form-check-input custom-checkbox" id="cfgNotifyPush" ${bool(settings.notify_push) ? 'checked' : ''}>
                </div>
            </div>
        `,
        security: () => `
            <div class="d-flex align-items-center gap-2 mb-4">
                <i class="bi bi-lock-fill panel-header-icon text-danger"></i>
                <h2 class="h5 fw-bold m-0 text-dark">Security</h2>
            </div>
            <div class="d-flex flex-column gap-4">
                <div class="notification-row-item p-3 d-flex align-items-center justify-content-between border">
                    <div class="d-flex align-items-center gap-3">
                        <i class="bi bi-shield-lock text-secondary fs-5"></i>
                        <div>
                            <h3 class="fs-6 fw-bold text-dark m-0">Two-Factor Authentication</h3>
                            <span class="text-muted text-sm">Require 2FA for all users</span>
                        </div>
                    </div>
                    <input type="checkbox" class="form-check-input custom-checkbox" id="cfg2FA" ${bool(settings.require_2fa) ? 'checked' : ''}>
                </div>
                <div>
                    <label class="form-label text-dark fw-bold text-sm mb-1">Session Timeout (minutes)</label>
                    <input type="number" class="form-control custom-form-input w-100" id="cfgSessionTimeout" value="${settings.session_timeout_minutes || 30}">
                </div>
            </div>
        `,
        database: () => `
            <div class="d-flex align-items-center gap-2 mb-4">
                <i class="bi bi-database-fill panel-header-icon text-danger"></i>
                <h2 class="h5 fw-bold m-0 text-dark">Database & Backup</h2>
            </div>
            <div class="d-flex flex-column gap-4">
                <div>
                    <label class="form-label text-dark fw-bold text-sm mb-1">Backup Frequency</label>
                    <select class="form-select custom-form-select w-100" id="cfgBackupFreq">
                        <option value="daily" ${settings.backup_frequency === 'daily' ? 'selected' : ''}>Daily</option>
                        <option value="weekly" ${settings.backup_frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
                        <option value="monthly" ${settings.backup_frequency === 'monthly' ? 'selected' : ''}>Monthly</option>
                    </select>
                </div>
                <div class="notification-row-item p-3 d-flex align-items-center justify-content-between border">
                    <div class="d-flex align-items-center gap-3">
                        <i class="bi bi-cloud-download text-secondary fs-5"></i>
                        <div>
                            <h3 class="fs-6 fw-bold text-dark m-0">Backup Now</h3>
                            <span class="text-muted text-sm">Downloads a .sql file with all current data.</span>
                        </div>
                    </div>
                    <button type="button" class="btn btn-outline-primary btn-sm" id="btnBackupNow">
                        <i class="bi bi-download"></i> Backup Now
                    </button>
                </div>
                <div class="notification-row-item p-3 d-flex align-items-center justify-content-between border">
                    <div class="d-flex align-items-center gap-3">
                        <i class="bi bi-cloud-upload text-danger fs-5"></i>
                        <div>
                            <h3 class="fs-6 fw-bold text-dark m-0">Restore Backup</h3>
                            <span class="text-muted text-sm">Replaces ALL current data with a previous backup file.</span>
                        </div>
                    </div>
                    <button type="button" class="btn btn-outline-danger btn-sm" id="btnRestoreBackup">
                        <i class="bi bi-upload"></i> Restore Backup
                    </button>
                    <input type="file" id="restoreFileInput" accept=".sql" class="d-none">
                </div>
                <div class="notification-row-item p-3 d-flex align-items-center justify-content-between border rounded bg-light">
                    <div class="d-flex align-items-center gap-3">
                        <i class="bi bi-table text-success fs-5"></i>
                        <div>
                            <h3 class="fs-6 fw-bold text-dark m-0">Database Records &amp; Log Archiving</h3>
                            <span class="text-muted text-sm">Browse students, subjects, clusters, and archive/clean login logs.</span>
                        </div>
                    </div>
                    <a href="database_admin.html" class="btn btn-success btn-sm fw-semibold">
                        <i class="bi bi-box-arrow-up-right me-1"></i> Open Database Records
                    </a>
                </div>
                <div id="restoreStatusMsg" class="text-sm"></div>
                <div class="alert alert-warning text-sm mb-0">
                    <strong>Restoring overwrites all current data</strong> with the contents of the backup
                    file and cannot be undone. Only .sql files downloaded from this system's own
                    "Backup Now" button can be restored.
                </div>
            </div>
        `
    };

    const fieldsByTab = {
        general: () => {
            const elSchool = document.getElementById('cfgSchoolName');
            const elYear = document.getElementById('cfgSchoolYear');
            const elTerm = document.getElementById('cfgCurrentTerm');
            const elLang = document.getElementById('cfgLanguage');
            const elMaint = document.getElementById('cfgMaintenance');
            const elPrincipal = document.getElementById('cfgSchoolPrincipal');
            const elPrincipalTitle = document.getElementById('cfgSchoolPrincipalTitle');
            if (!elSchool) return {};
            return {
                school_name: elSchool.value,
                school_year: elYear ? elYear.value : '',
                current_semester: elTerm ? elTerm.value : '1st Term',
                current_quarter: elTerm ? elTerm.value : '1st Term',
                language: elLang ? elLang.value : 'en',
                school_principal: elPrincipal ? elPrincipal.value.trim() : (settings.school_principal || ''),
                school_principal_title: elPrincipalTitle ? elPrincipalTitle.value.trim() : (settings.school_principal_title || 'Principal II'),
                maintenance_mode: elMaint && elMaint.checked ? '1' : '0',
            };
        },
        notifications: () => {
            const elEmail = document.getElementById('cfgNotifyEmail');
            const elSms = document.getElementById('cfgNotifySMS');
            const elPush = document.getElementById('cfgNotifyPush');
            if (!elEmail) return {};
            return {
                notify_email: elEmail.checked ? '1' : '0',
                notify_sms: elSms && elSms.checked ? '1' : '0',
                notify_push: elPush && elPush.checked ? '1' : '0',
            };
        },
        security: () => {
            const el2FA = document.getElementById('cfg2FA');
            const elTimeout = document.getElementById('cfgSessionTimeout');
            if (!el2FA && !elTimeout) return {};
            return {
                require_2fa: el2FA && el2FA.checked ? '1' : '0',
                session_timeout_minutes: elTimeout ? elTimeout.value : 30,
            };
        },
        database: () => {
            const elBackup = document.getElementById('cfgBackupFreq');
            if (!elBackup) return {};
            return {
                backup_frequency: elBackup.value,
            };
        },
    };

    let activeTab = 'general';

    function captureActiveTab() {
        if (!contentPanel || !contentPanel.children.length) return;
        try {
            if (fieldsByTab[activeTab]) {
                const captured = fieldsByTab[activeTab]();
                Object.assign(settings, captured);
            }
        } catch (err) {
            console.warn('Could not capture active tab fields:', err);
        }
    }

    function wireDatabaseTabButtons() {
        const btnBackupNow = document.getElementById('btnBackupNow');
        const btnRestoreBackup = document.getElementById('btnRestoreBackup');
        const restoreFileInput = document.getElementById('restoreFileInput');
        const restoreStatusMsg = document.getElementById('restoreStatusMsg');
        if (!btnBackupNow) return; // not on the database tab

        btnBackupNow.addEventListener('click', () => {
            window.open(`${API_BASE}/api/database/backup?token=${encodeURIComponent(token)}`, '_blank');
        });

        btnRestoreBackup.addEventListener('click', () => restoreFileInput.click());

        restoreFileInput.addEventListener('change', async () => {
            const file = restoreFileInput.files[0];
            if (!file) return;

            // Reject invalid backup file formats immediately
            if (!file.name.toLowerCase().endsWith('.sql')) {
                alert('Invalid backup file. Only .sql files produced by this system\'s own Backup Now button can be restored.');
                restoreFileInput.value = '';
                return;
            }

            const sure = confirm(
                `This will PERMANENTLY REPLACE all current data with the contents of "${file.name}".\n\n` +
                'This cannot be undone. Are you absolutely sure you want to restore this backup?'
            );
            restoreFileInput.value = '';
            if (!sure) return;

            btnRestoreBackup.disabled = true;
            btnBackupNow.disabled = true;

            const CHUNK_SIZE = 1.5 * 1024 * 1024; // 1.5 MB slices to easily fit within Vercel's 4.5 MB request limit
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

            restoreStatusMsg.className = 'text-sm text-dark mt-2';
            restoreStatusMsg.innerHTML = `
                <div class="card p-3 border shadow-sm bg-white rounded">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <strong class="text-sm text-primary" id="restoreStepText">Starting full restore...</strong>
                        <span class="text-xs fw-bold text-muted" id="restorePercentText">0%</span>
                    </div>
                    <div class="progress mb-2" style="height: 14px;">
                        <div id="restoreProgressBar" class="progress-bar progress-bar-striped progress-bar-animated bg-primary" role="progressbar" style="width: 0%"></div>
                    </div>
                    <div class="text-xs text-muted" id="restoreDetailText">Preparing file (${(file.size / (1024 * 1024)).toFixed(1)} MB)...</div>
                </div>
            `;

            try {
                const progressBar = document.getElementById('restoreProgressBar');
                const percentText = document.getElementById('restorePercentText');
                const stepText = document.getElementById('restoreStepText');
                const detailText = document.getElementById('restoreDetailText');

                if (stepText) stepText.textContent = 'Reading & verifying backup file...';
                if (detailText) detailText.textContent = `Analyzing ${(file.size / (1024 * 1024)).toFixed(1)} MB SQL file...`;

                const rawText = await file.text();
                if (!rawText.startsWith('-- MENTORAE_BACKUP_V1')) {
                    throw new Error('This file was not recognized as a Mentorae backup. Only .sql files produced by this system\'s own Backup Now button can be restored.');
                }

                if (stepText) stepText.textContent = 'Parsing database statements...';
                const rawLines = rawText.split(/\r?\n/);
                const statements = [];
                let buffer = '';

                for (const rawLine of rawLines) {
                    const line = rawLine.trim();
                    if (!line || line.startsWith('--')) continue;
                    buffer += (buffer ? ' ' : '') + line;
                    if (line.endsWith(';')) {
                        statements.push(buffer);
                        buffer = '';
                    }
                }
                if (buffer.trim()) {
                    let b = buffer.trim();
                    if (!b.endsWith(';')) b += ';';
                    statements.push(b);
                }

                // Batch statements by count and byte size (up to 150 stmts or 1.5MB per batch)
                // to stay well within Vercel's 4.5MB request limit and execute in <1s per batch.
                const batches = [];
                let curBatch = [];
                let curBytes = 0;
                const MAX_BYTES = 1.5 * 1024 * 1024;
                const MAX_STMTS = 150;

                for (const s of statements) {
                    if ((curBatch.length >= MAX_STMTS || curBytes + s.length > MAX_BYTES) && curBatch.length > 0) {
                        batches.push(curBatch);
                        curBatch = [];
                        curBytes = 0;
                    }
                    curBatch.push(s);
                    curBytes += s.length;
                }
                if (curBatch.length > 0) batches.push(curBatch);

                // 1. Initialize restore session
                const startRes = await fetch(`${API_BASE}/api/database/restore/start?token=${encodeURIComponent(token)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ confirm: 'RESTORE' }),
                });
                const startData = await startRes.json();
                if (!startData.success) {
                    throw new Error(startData.message || 'Could not initialize database restore.');
                }

                // 2. Stream and execute batches sequentially
                let processedStmts = 0;
                for (let b = 0; b < batches.length; b++) {
                    const batch = batches[b];
                    processedStmts += batch.length;
                    const pct = Math.round(((b + 1) / batches.length) * 96);

                    if (progressBar) progressBar.style.width = `${pct}%`;
                    if (percentText) percentText.textContent = `${pct}%`;
                    if (stepText) stepText.textContent = `Restoring records & files... (Batch ${b + 1} of ${batches.length})`;
                    if (detailText) detailText.textContent = `Applied ${processedStmts} of ${statements.length} statements (${pct}%)...`;

                    const batchRes = await fetch(`${API_BASE}/api/database/restore/batch?token=${encodeURIComponent(token)}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ statements: batch }),
                    });
                    if (!batchRes.ok) {
                        throw new Error(`Batch ${b + 1} failed (HTTP ${batchRes.status})`);
                    }
                    const batchData = await batchRes.json();
                    if (!batchData.success) {
                        throw new Error(batchData.message || `Batch ${b + 1} failed.`);
                    }
                }

                // 3. Finalize restore
                if (stepText) stepText.textContent = 'Finalizing database consistency...';
                if (detailText) detailText.textContent = 'Enabling constraints and verifying tables...';
                if (progressBar) progressBar.style.width = '98%';

                const finishRes = await fetch(`${API_BASE}/api/database/restore/finish?token=${encodeURIComponent(token)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ confirm: 'RESTORE' }),
                });
                const finishData = await finishRes.json();
                if (!finishData.success) {
                    throw new Error(finishData.message || 'Could not finalize restore.');
                }

                if (progressBar) {
                    progressBar.style.width = '100%';
                    progressBar.classList.remove('bg-warning');
                    progressBar.classList.add('bg-success');
                    progressBar.classList.remove('progress-bar-animated');
                }
                if (percentText) percentText.textContent = '100%';
                if (stepText) stepText.textContent = '✅ Full Restore Complete!';
                if (detailText) detailText.textContent = `Successfully restored all ${statements.length} database records and lesson files!`;

                alert('✅ ' + (finishData.message || 'Full database restored successfully!'));
            } catch (err) {
                const msg = err.message || 'Restore process failed.';
                if (progressBar) {
                    progressBar.classList.remove('bg-primary', 'bg-warning');
                    progressBar.classList.add('bg-danger');
                    progressBar.classList.remove('progress-bar-animated');
                }
                restoreStatusMsg.className = 'text-sm text-danger mt-2';
                restoreStatusMsg.innerHTML = `<div class="alert alert-danger mb-0 py-2"><strong>Restore failed:</strong> ${msg}</div>`;
                await new Promise((r) => setTimeout(r, 50));
                alert(`Restore failed: ${msg}`);
            } finally {
                btnRestoreBackup.disabled = false;
                btnBackupNow.disabled = false;
            }
        });
    }

    function switchTab(targetKey) {
        if (!templates[targetKey]) return;
        captureActiveTab(); // save whatever the admin typed on the tab they're leaving
        activeTab = targetKey;
        contentPanel.innerHTML = templates[targetKey]();
        wireDatabaseTabButtons();
        tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-target') === targetKey);
        });
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            switchTab(e.currentTarget.getAttribute('data-target'));
        });
    });

    btnSaveAll.addEventListener('click', async () => {
        captureActiveTab();

        const timeoutEl = document.getElementById('cfgSessionTimeout');
        if (timeoutEl) clearInlineWarning(timeoutEl);
        const yearEl = document.getElementById('cfgSchoolYear');
        if (yearEl) clearInlineWarning(yearEl);

        // Validation: Session timeout must be a positive whole number
        if (settings.session_timeout_minutes !== undefined && settings.session_timeout_minutes !== null && settings.session_timeout_minutes !== '') {
            const raw = String(settings.session_timeout_minutes).trim();
            const num = Number(raw);
            if (!/^\d+$/.test(raw) || isNaN(num) || num <= 0) {
                if (activeTab !== 'security') switchTab('security');
                const tEl = document.getElementById('cfgSessionTimeout');
                showInlineWarning(tEl, 'Session timeout must be a positive number of minutes (e.g., 30).');
                if (tEl) tEl.focus();
                return;
            }
        }

        // Validation: School Year format
        if (settings.school_year !== undefined && settings.school_year !== null && settings.school_year !== '') {
            const syRaw = String(settings.school_year).trim();
            if (!/^\d{4}\s*-\s*\d{4}$/.test(syRaw)) {
                if (activeTab !== 'general') switchTab('general');
                const syEl = document.getElementById('cfgSchoolYear');
                showInlineWarning(syEl, 'Please follow the format YYYY - YYYY (e.g., 2026 - 2027).');
                if (syEl) syEl.focus();
                return;
            }
        }

        const data = await authedFetch('/api/settings', token, {
            method: 'PUT',
            body: JSON.stringify({ settings }),
        });
        if (data && data.success) {
            if (settings.session_timeout_minutes) {
                localStorage.setItem('mentorae_session_timeout_minutes', String(settings.session_timeout_minutes));
            }
            alert('Settings saved successfully.');
        } else {
            alert((data && data.message) || 'Could not save settings.');
        }
    });

    switchTab('general');
});
