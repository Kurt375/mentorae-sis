/**
 * MENTORAE SIS - Universal Internationalization (i18n) Engine
 * Supports user-personalized language preferences: English ('en') and Filipino ('tl').
 */

(function (window) {
    'use strict';

    const STORAGE_KEY = 'mentorae_language';

    const TRANSLATIONS = {
        en: {
            // Navigation & Header
            nav_dashboard: 'Dashboard',
            nav_grades: 'Academic Performance',
            nav_grades_short: 'Grades',
            nav_subjects: 'Learning Resources',
            nav_subjects_short: 'Subjects',
            nav_attendance: 'Attendance Record',
            nav_attendance_short: 'Attendance',
            nav_schedules: 'Class Schedule',
            nav_schedules_short: 'Schedules',
            nav_announcements: 'Announcements',
            nav_profile: 'My Profile',
            nav_settings: 'Account Settings',
            nav_logout: 'Log Out',
            nav_switch_child: 'Switch Student',
            nav_admin_settings: 'System Settings',
            nav_user_management: 'User Management',
            nav_database: 'Database & Logs',

            // Profile Fields
            profile_title: 'Personal Profile',
            profile_subtitle: 'Manage your personal details, contact information, and preferences',
            profile_pref_lang: 'Preferred Language',
            profile_pref_lang_desc: 'Select your preferred language for your portal interface and dashboard.',
            profile_lang_en: 'English (US)',
            profile_lang_tl: 'Filipino (Tagalog)',
            profile_full_name: 'Full Name',
            profile_id_number: 'School ID / LRN',
            profile_role: 'Account Role',
            profile_email: 'Institutional Email',
            profile_personal_email: 'Personal Email',
            profile_contact_no: 'Contact Number',
            profile_address: 'Home Address',
            profile_save_btn: 'Save Changes',
            profile_saved_success: 'Profile settings updated successfully!',

            // Common Actions
            btn_save: 'Save',
            btn_cancel: 'Cancel',
            btn_close: 'Close',
            btn_filter: 'Filter',
            btn_search: 'Search',
            btn_view: 'View',
            btn_view_details: 'View Details',
            btn_back: 'Back',
            btn_edit: 'Edit',
            btn_delete: 'Delete',
            btn_download: 'Download',
            btn_print: 'Print',
            btn_refresh: 'Refresh',

            // Status & Academic Badges
            status_passed: 'Passed',
            status_failed: 'Failed',
            status_remediation: 'Needs Remediation',
            status_pending: 'Pending',
            status_in_progress: 'In Progress',
            status_completed: 'Completed',
            status_enrolled: 'Enrolled',
            status_present: 'Present',
            status_late: 'Late',
            status_absent: 'Absent',
            status_excused: 'Excused',

            // Dashboard Widgets & Cards
            dash_gwa: 'General Weighted Average (GWA)',
            dash_attendance_rate: 'Attendance Rate',
            dash_total_subjects: 'Enrolled Subjects',
            dash_rank: 'Class Rank',
            dash_quarter_progress: 'Quarterly Academic Progress',
            dash_recent_announcements: 'Recent Announcements',
            dash_upcoming_classes: 'Today\'s Classes',
            dash_no_announcements: 'No recent announcements.',
            dash_no_classes: 'No classes scheduled for today.',
            dash_view_all: 'View All',
            dash_welcome_back: 'Welcome back',
            dash_academic_year: 'Academic Year',
            dash_term: 'Academic Term',

            // Placeholders
            ph_search: 'Search...',
            ph_enter_address: 'Enter current residential address',
            ph_enter_phone: 'e.g. 09123456789',
            ph_enter_email: 'e.g. name@example.com'
        },
        tl: {
            // Navigation & Header
            nav_dashboard: 'Talaan ng Gawain',
            nav_grades: 'Akademikong Perpormans',
            nav_grades_short: 'Mga Grado',
            nav_subjects: 'Kagamitan sa Pag-aaral',
            nav_subjects_short: 'Mga Asignatura',
            nav_attendance: 'Talaan ng Pagpasok',
            nav_attendance_short: 'Attendance',
            nav_schedules: 'Iskedyul ng Klase',
            nav_schedules_short: 'Iskedyul',
            nav_announcements: 'Mga Anunsyo',
            nav_profile: 'Aking Profile',
            nav_settings: 'Mga Setting ng Account',
            nav_logout: 'Mag-logout',
            nav_switch_child: 'Pumili ng Mag-aaral',
            nav_admin_settings: 'Mga Setting ng Sistema',
            nav_user_management: 'Pamamahala ng Gumagamit',
            nav_database: 'Database at Talaan',

            // Profile Fields
            profile_title: 'Personal na Profile',
            profile_subtitle: 'Pamahalaan ang iyong personal na impormasyon, numero, at mga kagustuhan',
            profile_pref_lang: 'Nais na Wika (Preferred Language)',
            profile_pref_lang_desc: 'Piliin ang nais na wika para sa iyong portal at dashboard.',
            profile_lang_en: 'Ingles (English)',
            profile_lang_tl: 'Filipino (Tagalog)',
            profile_full_name: 'Buong Pangalan',
            profile_id_number: 'School ID / LRN',
            profile_role: 'Tungkulin sa Account',
            profile_email: 'Opisyal na Email',
            profile_personal_email: 'Personal na Email',
            profile_contact_no: 'Numero ng Telepono',
            profile_address: 'Tirahan / Address',
            profile_save_btn: 'I-save ang mga Pagbabago',
            profile_saved_success: 'Matagumpay na na-update ang mga setting ng profile!',

            // Common Actions
            btn_save: 'I-save',
            btn_cancel: 'Kanselahin',
            btn_close: 'Isara',
            btn_filter: 'Salain',
            btn_search: 'Maghanap',
            btn_view: 'Tingnan',
            btn_view_details: 'Tingnan ang Detalye',
            btn_back: 'Bumalik',
            btn_edit: 'I-edit',
            btn_delete: 'Tanggalin',
            btn_download: 'I-download',
            btn_print: 'I-print',
            btn_refresh: 'I-refresh',

            // Status & Academic Badges
            status_passed: 'Pasado',
            status_failed: 'Bagsak',
            status_remediation: 'Kailangan ng Remediation',
            status_pending: 'Nakabinbin',
            status_in_progress: 'Kasalukuyang Ginagawa',
            status_completed: 'Tapos Na',
            status_enrolled: 'Naka-enroll',
            status_present: 'Pumasok',
            status_late: 'Nahuli',
            status_absent: 'Lumiban',
            status_excused: 'May Paumanhin',

            // Dashboard Widgets & Cards
            dash_gwa: 'Pangkalahatang Grado (GWA)',
            dash_attendance_rate: 'Bahagdan ng Pagpasok',
            dash_total_subjects: 'Naka-enroll na Asignatura',
            dash_rank: 'Ranggo sa Klase',
            dash_quarter_progress: 'Pagsulong sa Bawat Markahan',
            dash_recent_announcements: 'Mga Pinakabagong Anunsyo',
            dash_upcoming_classes: 'Mga Klase Ngayong Araw',
            dash_no_announcements: 'Walang mga anunsyo sa kasalukuyan.',
            dash_no_classes: 'Walang naka-iskedyul na klase ngayong araw.',
            dash_view_all: 'Tingnan Lahat',
            dash_welcome_back: 'Maligayang pagbabalik',
            dash_academic_year: 'Taong Panuruan',
            dash_term: 'Kasalukuyang Markahan',

            // Placeholders
            ph_search: 'Maghanap...',
            ph_enter_address: 'Ilagay ang kasalukuyang tirahan',
            ph_enter_phone: 'hal. 09123456789',
            ph_enter_email: 'hal. pangalan@example.com'
        }
    };

    function getSavedLanguage() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === 'tl' || stored === 'en') return stored;
            // Also check session user if exists
            const rawSession = localStorage.getItem('mentorae_user');
            if (rawSession) {
                const user = JSON.parse(rawSession);
                if (user && (user.preferred_language === 'tl' || user.preferred_language === 'en')) {
                    localStorage.setItem(STORAGE_KEY, user.preferred_language);
                    return user.preferred_language;
                }
            }
        } catch (e) {
            console.warn('i18n: error reading language preference:', e);
        }
        return 'en';
    }

    let currentLang = getSavedLanguage();

    function translateText(key, fallback) {
        if (!key) return fallback || '';
        const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
        return dict[key] || (TRANSLATIONS.en && TRANSLATIONS.en[key]) || fallback || key;
    }

    function applyTranslations(root = document) {
        if (!root) return;
        document.documentElement.lang = currentLang;

        // 1. Text elements with data-i18n
        const elements = root.querySelectorAll('[data-i18n]');
        elements.forEach((el) => {
            const key = el.getAttribute('data-i18n');
            const translation = translateText(key);
            if (translation) {
                // Preserve icons inside the element if present
                const icon = el.querySelector('i');
                if (icon) {
                    const iconClone = icon.cloneNode(true);
                    el.textContent = ' ';
                    el.prepend(iconClone);
                    el.appendChild(document.createTextNode(' ' + translation));
                } else {
                    el.textContent = translation;
                }
            }
        });

        // 2. Placeholders with data-i18n-placeholder
        const placeholderElements = root.querySelectorAll('[data-i18n-placeholder]');
        placeholderElements.forEach((el) => {
            const key = el.getAttribute('data-i18n-placeholder');
            const translation = translateText(key);
            if (translation) {
                el.setAttribute('placeholder', translation);
            }
        });

        // 3. Title tooltips with data-i18n-title
        const titleElements = root.querySelectorAll('[data-i18n-title]');
        titleElements.forEach((el) => {
            const key = el.getAttribute('data-i18n-title');
            const translation = translateText(key);
            if (translation) {
                el.setAttribute('title', translation);
            }
        });
    }

    async function setLanguage(lang, syncBackend = true) {
        if (lang !== 'en' && lang !== 'tl') lang = 'en';
        currentLang = lang;
        try {
            localStorage.setItem(STORAGE_KEY, lang);
            const rawSession = localStorage.getItem('mentorae_user');
            if (rawSession) {
                const user = JSON.parse(rawSession);
                user.preferred_language = lang;
                localStorage.setItem('mentorae_user', JSON.stringify(user));
            }
        } catch (e) {
            console.warn('i18n: error saving language to localStorage:', e);
        }

        applyTranslations();

        window.dispatchEvent(new CustomEvent('mentorae:languageChanged', {
            detail: { language: lang }
        }));

        if (syncBackend) {
            try {
                const token = (typeof getToken === 'function')
                    ? getToken()
                    : (localStorage.getItem('mentorae_token') || sessionStorage.getItem('mentorae_token'));

                if (token && typeof authedFetch === 'function') {
                    await authedFetch('/api/auth/profile', token, {
                        method: 'PATCH',
                        body: JSON.stringify({ preferredLanguage: lang })
                    });
                }
            } catch (err) {
                console.warn('i18n: background language sync notice:', err);
            }
        }
    }

    // Auto-sync initial language from backend profile if token exists
    async function syncFromProfile() {
        try {
            const token = (typeof getToken === 'function')
                ? getToken()
                : (localStorage.getItem('mentorae_token') || sessionStorage.getItem('mentorae_token'));

            if (!token || typeof authedFetch !== 'function') return;

            const res = await authedFetch('/api/auth/profile', token);
            if (res && res.success && res.profile && res.profile.preferredLanguage) {
                const remoteLang = res.profile.preferredLanguage;
                if (remoteLang !== currentLang) {
                    setLanguage(remoteLang, false);
                }
            }
        } catch (e) {
            // Non-blocking background sync
        }
    }

    // Public API
    window.i18n = {
        getLanguage: () => currentLang,
        setLanguage: setLanguage,
        t: translateText,
        applyTranslations: applyTranslations,
        syncFromProfile: syncFromProfile,
        supportedLanguages: [
            { code: 'en', label: 'English (US)' },
            { code: 'tl', label: 'Filipino (Tagalog)' }
        ]
    };

    // Auto-translate on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            applyTranslations();
            syncFromProfile();
        });
    } else {
        applyTranslations();
        syncFromProfile();
    }

})(window);
