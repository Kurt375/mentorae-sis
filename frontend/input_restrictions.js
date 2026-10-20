/**
 * MENTORAE SIS - Universal Input Restriction & Validation Engine
 * 
 * Enforces strict, real-time input rules across all portal forms:
 * 1. Philippine Mobile Numbers: Exactly 11 digits starting with '09' (strictly numbers only).
 * 2. Student LRN / ID: Exactly 12 digits (DepEd standard, strictly numbers only).
 * 3. Names (First, Middle, Last, Parent): Letters, spaces, hyphens, apostrophes, and periods only.
 * 4. Verification / OTP Codes: Exactly 6 digits (strictly numbers only).
 * 5. Grades & Scores: Numeric only between 0 and 100 with up to 2 decimal places.
 */

(function () {
    'use strict';

    // ---- REGEX RULES ----
    const PATTERNS = {
        nameChar: /^[a-zA-ZñÑáéíóúÁÉÍÓÚ\s.\-']$/,
        nameClean: /[^a-zA-ZñÑáéíóúÁÉÍÓÚ\s.\-']/g,
        digitsOnly: /\D/g,
        validPhone: /^09\d{9}$/,
        validLrn: /^\d{12}$/,
        validOtp: /^\d{6}$/,
        validName: /^[a-zA-ZñÑáéíóúÁÉÍÓÚ\s.\-']{2,60}$/,
    };

    // ---- ELEMENT MATCHER HELPERS ----
    function isPhoneField(el) {
        if (!el || el.tagName !== 'INPUT') return false;
        if (el.dataset.restrict === 'none') return false;
        if (el.dataset.restrict === 'phone') return true;
        const id = (el.id || '').toLowerCase();
        if (id.includes('reset') || id.includes('login') || id.includes('search')) return false;
        if (el.type === 'tel') return true;
        const name = (el.name || '').toLowerCase();
        return (
            id.includes('contact') || id.includes('phone') ||
            name.includes('contact') || name.includes('phone')
        );
    }

    function isLrnField(el) {
        if (!el || el.tagName !== 'INPUT') return false;
        if (el.dataset.restrict === 'none') return false;
        if (el.dataset.restrict === 'lrn') return true;
        const id = (el.id || '').toLowerCase();
        // Never restrict password reset, login, search, or identity fields as LRN
        if (id.includes('reset') || id.includes('login') || id.includes('identity') || id.includes('email') || id.includes('search')) {
            return false;
        }
        // Check if student role is active for generatedId or editIdNumber
        if (id === 'generatedid') {
            const roleSelect = document.getElementById('userRoleSelect');
            return !roleSelect || roleSelect.value === 'Student';
        }
        if (id === 'editidnumber') {
            const roleLabel = document.getElementById('editUserRoleLabel');
            return roleLabel && roleLabel.textContent.trim().toLowerCase() === 'student';
        }
        return (id.includes('lrn') || (el.placeholder && el.placeholder.toLowerCase().includes('lrn'))) &&
               !id.includes('identity') && !id.includes('email') && !id.includes('reset');
    }

    function isNameField(el) {
        if (!el || el.tagName !== 'INPUT') return false;
        if (el.dataset.restrict === 'none') return false;
        if (el.dataset.restrict === 'name') return true;
        const id = (el.id || '').toLowerCase();
        const name = (el.name || '').toLowerCase();
        return (
            id === 'firstname' || id === 'lastname' || id === 'middleinitial' ||
            id === 'editfirstname' || id === 'editlastname' || id === 'editmiddleinitial' ||
            id === 'studentparentfullname' || id === 'editparentname' ||
            name === 'firstname' || name === 'lastname' ||
            (id.includes('name') && !id.includes('section') && !id.includes('strand') && !id.includes('subject') && !id.includes('child'))
        );
    }

    function isMiddleInitialField(el) {
        if (!el || el.tagName !== 'INPUT') return false;
        if (el.dataset.restrict === 'none') return false;
        if (el.dataset.restrict === 'mi') return true;
        const id = (el.id || '').toLowerCase();
        return id.includes('middleinitial') || id === 'mi';
    }

    function isOtpField(el) {
        if (!el || el.tagName !== 'INPUT') return false;
        if (el.dataset.restrict === 'none') return false;
        if (el.dataset.restrict === 'otp') return true;
        const id = (el.id || '').toLowerCase();
        return id.includes('otp') || id === 'verificationcode' || (el.placeholder && el.placeholder.toLowerCase().includes('6-digit'));
    }

    function isGradeField(el) {
        if (!el || el.tagName !== 'INPUT') return false;
        if (el.dataset.restrict === 'none') return false;
        if (el.dataset.restrict === 'grade' || el.dataset.restrict === 'score') return true;
        return (
            el.classList.contains('grade-input-cell') ||
            el.classList.contains('sub-activity-input') ||
            el.classList.contains('hps-input') ||
            el.classList.contains('quiz-grade') ||
            el.classList.contains('activity-grade') ||
            el.classList.contains('exam-grade')
        );
    }

    // ---- REAL-TIME SANITIZERS ----
    function sanitizePhone(el) {
        const raw = el.value.replace(PATTERNS.digitsOnly, '');
        const cleaned = raw.slice(0, 11);
        if (el.value !== cleaned) el.value = cleaned;
        el.setAttribute('maxlength', '11');
        el.setAttribute('inputmode', 'numeric');
    }

    function sanitizeLrn(el) {
        const raw = el.value.replace(PATTERNS.digitsOnly, '');
        const cleaned = raw.slice(0, 12);
        if (el.value !== cleaned) el.value = cleaned;
        el.setAttribute('maxlength', '12');
        el.setAttribute('inputmode', 'numeric');
    }

    function sanitizeName(el) {
        const isMi = isMiddleInitialField(el);
        const maxLen = isMi ? 3 : 50;
        let cleaned = el.value.replace(PATTERNS.nameClean, '');
        // collapse consecutive spaces
        cleaned = cleaned.replace(/\s{2,}/g, ' ');
        if (isMi) {
            cleaned = cleaned.slice(0, maxLen).toUpperCase();
        } else {
            cleaned = cleaned.slice(0, maxLen);
        }
        if (el.value !== cleaned) el.value = cleaned;
        el.setAttribute('maxlength', String(maxLen));
    }

    function sanitizeOtp(el) {
        const raw = el.value.replace(PATTERNS.digitsOnly, '');
        const cleaned = raw.slice(0, 6);
        if (el.value !== cleaned) el.value = cleaned;
        el.setAttribute('maxlength', '6');
        el.setAttribute('inputmode', 'numeric');
    }

    function sanitizeGrade(el) {
        let val = el.value;
        if (val === '') return;

        // Allow typing negative or extra decimals momentarily, but strip non-numeric/non-decimal
        val = val.replace(/[^0-9.]/g, '');
        // Ensure at most one decimal point
        const parts = val.split('.');
        if (parts.length > 2) {
            val = parts[0] + '.' + parts.slice(1).join('');
        }
        // Limit to 2 decimal places
        if (parts.length === 2 && parts[1].length > 2) {
            val = parts[0] + '.' + parts[1].slice(0, 2);
        }

        const max = parseFloat(el.getAttribute('max') || '100');
        const num = parseFloat(val);
        if (!isNaN(num)) {
            if (num > max) val = String(max);
            if (num < 0) val = '0';
        }

        if (el.value !== val) el.value = val;
    }

    // ---- GLOBAL EVENT DELEGATION (Works for existing & dynamically injected elements) ----
    document.addEventListener('input', (e) => {
        const target = e.target;
        if (!target || target.tagName !== 'INPUT') return;

        if (isPhoneField(target)) {
            sanitizePhone(target);
        } else if (isLrnField(target)) {
            sanitizeLrn(target);
        } else if (isNameField(target)) {
            sanitizeName(target);
        } else if (isOtpField(target)) {
            sanitizeOtp(target);
        } else if (isGradeField(target)) {
            sanitizeGrade(target);
        }
    }, true);

    // Block invalid keystrokes before they appear
    document.addEventListener('keydown', (e) => {
        const target = e.target;
        if (!target || target.tagName !== 'INPUT') return;

        // Allow navigation/control keys: Backspace, Delete, Arrow keys, Tab, Enter, Ctrl+A/C/V/X
        if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Tab' || e.key === 'Enter' ||
            e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
            e.ctrlKey || e.metaKey || e.altKey) {
            return;
        }

        // 1. Phone & OTP & LRN: block non-numeric keys
        if (isPhoneField(target) || isOtpField(target) || isLrnField(target)) {
            if (e.key.length === 1 && !/^\d$/.test(e.key)) {
                e.preventDefault();
            }
        }

        // 2. Names: block digits and symbols
        if (isNameField(target)) {
            if (e.key.length === 1 && !PATTERNS.nameChar.test(e.key)) {
                e.preventDefault();
            }
        }

        // 3. Grades: block non-numeric except a single decimal point
        if (isGradeField(target)) {
            if (e.key === '.') {
                if (target.value.includes('.')) e.preventDefault();
            } else if (e.key.length === 1 && !/^\d$/.test(e.key)) {
                e.preventDefault();
            }
        }
    }, true);

    // Format & validate on blur (leaving the input field)
    document.addEventListener('blur', (e) => {
        const target = e.target;
        if (!target || target.tagName !== 'INPUT') return;

        if (isPhoneField(target) && target.value.trim()) {
            sanitizePhone(target);
            if (!PATTERNS.validPhone.test(target.value.trim())) {
                target.classList.add('is-invalid');
                target.setAttribute('title', 'Must be an 11-digit number starting with 09 (e.g., 09123456789)');
            } else {
                target.classList.remove('is-invalid');
                target.removeAttribute('title');
            }
        } else if (isLrnField(target) && target.value.trim()) {
            sanitizeLrn(target);
            if (!PATTERNS.validLrn.test(target.value.trim())) {
                target.classList.add('is-invalid');
                target.setAttribute('title', 'Student LRN must be exactly 12 digits (numeric only)');
            } else {
                target.classList.remove('is-invalid');
                target.removeAttribute('title');
            }
        } else if (isNameField(target) && target.value.trim()) {
            sanitizeName(target);
            target.classList.remove('is-invalid');
        } else if (isOtpField(target) && target.value.trim()) {
            sanitizeOtp(target);
            if (!PATTERNS.validOtp.test(target.value.trim())) {
                target.classList.add('is-invalid');
            } else {
                target.classList.remove('is-invalid');
            }
        } else if (isGradeField(target) && target.value.trim()) {
            sanitizeGrade(target);
            const val = parseFloat(target.value);
            const max = parseFloat(target.getAttribute('max') || '100');
            if (isNaN(val) || val < 0 || val > max) {
                target.classList.add('is-invalid');
            } else {
                target.classList.remove('is-invalid');
            }
        }
    }, true);

    // Initial setup on DOM ready
    function setupExistingInputs() {
        document.querySelectorAll('input').forEach(input => {
            if (isPhoneField(input)) {
                input.setAttribute('maxlength', '11');
                input.setAttribute('inputmode', 'numeric');
                if (!input.placeholder || input.placeholder.includes('...')) {
                    input.placeholder = 'e.g., 09123456789';
                }
            } else if (isLrnField(input)) {
                input.setAttribute('maxlength', '12');
                input.setAttribute('inputmode', 'numeric');
                input.placeholder = '12-digit DepEd LRN';
            } else if (isOtpField(input)) {
                input.setAttribute('maxlength', '6');
                input.setAttribute('inputmode', 'numeric');
                input.placeholder = '6-digit code';
            } else if (isMiddleInitialField(input)) {
                input.setAttribute('maxlength', '3');
            } else if (isGradeField(input)) {
                input.setAttribute('inputmode', 'decimal');
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupExistingInputs);
    } else {
        setupExistingInputs();
    }

    // Export reusable validator object for form submit guards
    window.MentoraeValidators = {
        isValidPhone: (val) => PATTERNS.validPhone.test((val || '').trim()),
        isValidLrn: (val) => PATTERNS.validLrn.test((val || '').trim()),
        isValidOtp: (val) => PATTERNS.validOtp.test((val || '').trim()),
        isValidName: (val) => PATTERNS.validName.test((val || '').trim()),
        isValidGrade: (val, max = 100) => {
            const num = parseFloat(val);
            return !isNaN(num) && num >= 0 && num <= max;
        },
        cleanPhone: (val) => (val || '').replace(PATTERNS.digitsOnly, '').slice(0, 11),
        cleanLrn: (val) => (val || '').replace(PATTERNS.digitsOnly, '').slice(0, 12),
        cleanName: (val) => (val || '').replace(PATTERNS.nameClean, '').replace(/\s{2,}/g, ' ').trim(),
        cleanOtp: (val) => (val || '').replace(PATTERNS.digitsOnly, '').slice(0, 6),
    };
})();
