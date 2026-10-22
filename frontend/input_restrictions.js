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

    // ---- INLINE WARNING COMPONENT ----
    function showInlineWarning(inputEl, message) {
        if (!inputEl) return;
        inputEl.classList.add('is-invalid');
        inputEl.classList.remove('is-valid');

        const inputId = inputEl.id || inputEl.name || '';
        let parent = inputEl.parentNode;
        let feedbackEl = null;

        if (parent && parent.classList.contains('input-group')) {
            parent = parent.parentNode;
            feedbackEl = parent ? parent.querySelector(`.mentorae-inline-warning[data-for="${inputId}"]`) : null;
        } else if (parent) {
            feedbackEl = parent.querySelector(`.mentorae-inline-warning[data-for="${inputId}"]`);
        }

        if (!feedbackEl) {
            feedbackEl = document.createElement('div');
            feedbackEl.className = 'invalid-feedback mentorae-inline-warning tiny-text';
            if (inputId) {
                feedbackEl.setAttribute('data-for', inputId);
            }
            const refNode = (inputEl.parentNode && inputEl.parentNode.classList.contains('input-group'))
                ? inputEl.parentNode
                : inputEl;
            if (refNode.nextSibling) {
                refNode.parentNode.insertBefore(feedbackEl, refNode.nextSibling);
            } else {
                refNode.parentNode.appendChild(feedbackEl);
            }
        }

        feedbackEl.innerHTML = `<i class="bi bi-exclamation-circle-fill me-1"></i>${message}`;
        feedbackEl.style.display = 'block';
    }

    function clearInlineWarning(inputEl) {
        if (!inputEl) return;
        inputEl.classList.remove('is-invalid');
        const inputId = inputEl.id || inputEl.name || '';
        let parent = inputEl.parentNode;
        let feedbackEl = null;

        if (parent && parent.classList.contains('input-group')) {
            feedbackEl = parent.parentNode ? parent.parentNode.querySelector(`.mentorae-inline-warning[data-for="${inputId}"]`) : null;
        } else if (parent) {
            feedbackEl = parent.querySelector(`.mentorae-inline-warning[data-for="${inputId}"]`);
        }

        if (feedbackEl) {
            feedbackEl.textContent = '';
            feedbackEl.style.display = 'none';
        }
    }

    // Live clear on input as user fixes their mistake
    document.addEventListener('input', (e) => {
        const target = e.target;
        if (!target || target.tagName !== 'INPUT') return;
        if (!target.classList.contains('is-invalid')) return;

        if (isPhoneField(target) && PATTERNS.validPhone.test(target.value.trim())) {
            clearInlineWarning(target);
        } else if (isLrnField(target) && PATTERNS.validLrn.test(target.value.trim())) {
            clearInlineWarning(target);
        } else if (isOtpField(target) && PATTERNS.validOtp.test(target.value.trim())) {
            clearInlineWarning(target);
        } else if (isNameField(target) && target.value.trim().length >= 2) {
            clearInlineWarning(target);
        }
    }, true);

    // Format & validate on blur (leaving the input field)
    document.addEventListener('blur', (e) => {
        const target = e.target;
        if (!target || target.tagName !== 'INPUT') return;

        if (isPhoneField(target) && target.value.trim()) {
            sanitizePhone(target);
            if (!PATTERNS.validPhone.test(target.value.trim())) {
                showInlineWarning(target, 'Must be an 11-digit number starting with 09 (e.g., 09123456789).');
            } else {
                clearInlineWarning(target);
            }
        } else if (isLrnField(target) && target.value.trim()) {
            sanitizeLrn(target);
            if (!PATTERNS.validLrn.test(target.value.trim())) {
                showInlineWarning(target, 'Student LRN must be exactly 12 digits (numbers only).');
            } else {
                clearInlineWarning(target);
            }
        } else if (isNameField(target) && target.value.trim()) {
            sanitizeName(target);
            if (!isMiddleInitialField(target) && target.value.trim().length < 2) {
                showInlineWarning(target, 'Must contain letters only (minimum 2 characters).');
            } else {
                clearInlineWarning(target);
            }
        } else if (isOtpField(target) && target.value.trim()) {
            sanitizeOtp(target);
            if (!PATTERNS.validOtp.test(target.value.trim())) {
                showInlineWarning(target, 'Verification code must be exactly 6 digits.');
            } else {
                clearInlineWarning(target);
            }
        } else if (isGradeField(target) && target.value.trim()) {
            sanitizeGrade(target);
            const val = parseFloat(target.value);
            const max = parseFloat(target.getAttribute('max') || '100');
            if (isNaN(val) || val < 0 || val > max) {
                showInlineWarning(target, `Grade must be between 0 and ${max}.`);
            } else {
                clearInlineWarning(target);
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

    // Universal inline warning style injection
    if (typeof document !== 'undefined') {
        const styleId = 'mentorae-validator-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .mentorae-inline-warning {
                    font-size: 0.78rem !important;
                    font-weight: 500 !important;
                    color: #dc3545 !important;
                    margin-top: 0.35rem !important;
                    line-height: 1.3 !important;
                    display: block !important;
                }
                .form-control.is-invalid, .form-input.is-invalid, .form-select.is-invalid, .custom-form-input.is-invalid {
                    border-color: #dc3545 !important;
                    box-shadow: 0 0 0 0.2rem rgba(220, 53, 69, 0.15) !important;
                }
                .form-control.is-valid, .form-input.is-valid, .form-select.is-valid, .custom-form-input.is-valid {
                    border-color: #198754 !important;
                }
            `;
            document.head.appendChild(style);
        }
    }

    // Export reusable validator object & functions for global use
    window.showInlineWarning = showInlineWarning;
    window.clearInlineWarning = clearInlineWarning;

    window.MentoraeValidators = {
        showWarning: showInlineWarning,
        clearWarning: clearInlineWarning,
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
