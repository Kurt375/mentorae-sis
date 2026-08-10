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
    const initial = await authedFetch('/api/settings', token);
    if (initial.success) settings = initial.settings;

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
                    <input type="text" class="form-control custom-form-input w-100" id="cfgSchoolYear" value="${settings.school_year || ''}">
                </div>
                <div>
                    <label class="form-label text-dark fw-bold text-sm mb-1">Language</label>
                    <select class="form-select custom-form-select w-50" id="cfgLanguage">
                        <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
                        <option value="tl" ${settings.language === 'tl' ? 'selected' : ''}>Filipino</option>
                    </select>
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
                <div class="alert alert-secondary text-sm mb-0">
                    Automated backups aren't wired up in this build. Your database is hosted on
                    Railway's managed MySQL — use Railway's own Data tab or a MySQL client to
                    back up or restore data directly.
                </div>
            </div>
        `
    };

    const fieldsByTab = {
        general: () => ({
            school_name: document.getElementById('cfgSchoolName').value,
            school_year: document.getElementById('cfgSchoolYear').value,
            language: document.getElementById('cfgLanguage').value,
            maintenance_mode: document.getElementById('cfgMaintenance').checked ? '1' : '0',
        }),
        notifications: () => ({
            notify_email: document.getElementById('cfgNotifyEmail').checked ? '1' : '0',
            notify_sms: document.getElementById('cfgNotifySMS').checked ? '1' : '0',
            notify_push: document.getElementById('cfgNotifyPush').checked ? '1' : '0',
        }),
        security: () => ({
            require_2fa: document.getElementById('cfg2FA').checked ? '1' : '0',
            session_timeout_minutes: document.getElementById('cfgSessionTimeout').value,
        }),
        database: () => ({
            backup_frequency: document.getElementById('cfgBackupFreq').value,
        }),
    };

    let activeTab = 'general';

    function captureActiveTab() {
        if (fieldsByTab[activeTab]) {
            Object.assign(settings, fieldsByTab[activeTab]());
        }
    }

    function switchTab(targetKey) {
        captureActiveTab(); // save whatever the admin typed on the tab they're leaving
        activeTab = targetKey;
        contentPanel.innerHTML = templates[targetKey]();
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
        const data = await authedFetch('/api/settings', token, {
            method: 'PUT',
            body: JSON.stringify({ settings }),
        });
        alert(data.success ? 'Settings saved successfully.' : data.message);
    });

    switchTab('general');
});
