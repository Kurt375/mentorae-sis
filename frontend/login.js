// Safely fetch API_BASE_URL with fallback
const API_BASE = (window.MENTORAE_CONFIG && window.MENTORAE_CONFIG.API_BASE_URL)
    ? window.MENTORAE_CONFIG.API_BASE_URL
    : "http://localhost:5000";

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('loginPassword');
    const toggleIcon = document.getElementById('toggleIcon');
    const submitScannerCodeBtn = document.getElementById('submitScannerCode');
    const scannerCodeInput = document.getElementById('scannerCode');
    const contactUsLink = document.getElementById('contactUsLink');
    const contactUsModalEl = document.getElementById('contactUsModal');
    const contactUsModal = contactUsModalEl ? new bootstrap.Modal(contactUsModalEl) : null;

    // Check URL parameters for alerts (e.g. ?reason=timeout, ?reason=maintenance)
    const urlParams = new URLSearchParams(window.location.search);
    const reason = urlParams.get('reason');
    const loginAlertBox = document.getElementById('loginAlertBox');
    const loginAlertMessage = document.getElementById('loginAlertMessage');

    if (reason && loginAlertBox && loginAlertMessage) {
        if (reason === 'timeout') {
            loginAlertMessage.textContent = 'Your session has expired due to inactivity. Please log in again to continue.';
            loginAlertBox.classList.remove('d-none');
            loginAlertBox.className = 'alert alert-warning alert-dismissible fade show mb-4';
        } else if (reason === 'maintenance') {
            loginAlertMessage.textContent = 'Mentorae SIS is currently undergoing scheduled system maintenance. Portal access is temporarily restricted to administrators.';
            loginAlertBox.classList.remove('d-none');
            loginAlertBox.className = 'alert alert-danger alert-dismissible fade show mb-4';
        } else if (reason === 'logout') {
            loginAlertMessage.textContent = 'You have been safely signed out of your account.';
            loginAlertBox.classList.remove('d-none');
            loginAlertBox.className = 'alert alert-info alert-dismissible fade show mb-4';
        }
    }

    function showLoginAlert(message, type = 'danger') {
        if (loginAlertBox && loginAlertMessage) {
            loginAlertMessage.textContent = message;
            loginAlertBox.className = `alert alert-${type} alert-dismissible fade show mb-4`;
            loginAlertBox.classList.remove('d-none');
            loginAlertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            alert(message);
        }
    }

    function hideLoginAlert() {
        if (loginAlertBox) {
            loginAlertBox.classList.add('d-none');
        }
    }

    if (contactUsLink && contactUsModal) {
        contactUsLink.addEventListener('click', (e) => {
            e.preventDefault();
            contactUsModal.show();
        });
    }

    // Redirect destinations by role, once logged in
    const destinations = {
        student: 'Student/dashboard_student.html',
        teacher: 'Teacher/dashboard_teacher.html',
        parent: 'Parent/dashboard_parent.html',
        admin: 'dashboard_admin.html',
        security: 'attendance_scanner_teacher.html',
    };

    // 1. Password Visibility Toggle Logic
    togglePasswordBtn.addEventListener('click', () => {
        const isPasswordType = passwordInput.getAttribute('type') === 'password';
        passwordInput.setAttribute('type', isPasswordType ? 'text' : 'password');
        if (isPasswordType) {
            toggleIcon.classList.remove('bi-eye-slash');
            toggleIcon.classList.add('bi-eye');
        } else {
            toggleIcon.classList.remove('bi-eye');
            toggleIcon.classList.add('bi-eye-slash');
        }
    });

    // Exponential backoff with Full Jitter: Sleep = rand(0, min(cap, base * 2^attempt))
    async function sleepWithJitter(attempt, baseDelay = 700, capDelay = 4000) {
        const exponential = Math.min(capDelay, baseDelay * Math.pow(2, attempt));
        const jittered = Math.floor(Math.random() * exponential);
        return new Promise((resolve) => setTimeout(resolve, jittered));
    }

    // 2. Resilient Login Request with Anti-Spam Guard & Jittered Auto-Retry
    let isLoginSubmitting = false;

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (isLoginSubmitting) return; // Prevent double/triple-click stampedes

        const identity = document.getElementById('loginEmail').value.trim();
        const password = passwordInput ? passwordInput.value : '';
        const isLocalEnv =
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname === '' ||
            window.location.protocol === 'file:' ||
            window.location.hostname.startsWith('192.168.') ||
            window.location.hostname.startsWith('10.') ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(window.location.hostname);

        let captchaResponse = (typeof grecaptcha !== 'undefined' && typeof grecaptcha.getResponse === 'function')
            ? grecaptcha.getResponse()
            : '';

        if (!identity || !password) {
            showLoginAlert('Please enter your email or ID number, and password.', 'warning');
            return;
        }

        if (!captchaResponse) {
            if (isLocalEnv) {
                captchaResponse = 'dev-bypass-token';
            } else {
                showLoginAlert('Please verify you are not a robot by completing the reCAPTCHA challenge.', 'warning');
                return;
            }
        }

        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalBtnHtml = submitBtn.innerHTML;

        const setButtonLoading = (loading, statusText = 'Signing in to Portal...') => {
            isLoginSubmitting = loading;
            submitBtn.disabled = loading;
            if (loading) {
                submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>${statusText}`;
            } else {
                submitBtn.innerHTML = originalBtnHtml;
            }
        };

        setButtonLoading(true);
        hideLoginAlert();

        const MAX_RETRIES = 2; // Auto-retry for transient 502/503/504 gateway or cold-start timeouts
        let attempt = 0;

        while (attempt <= MAX_RETRIES) {
            try {
                const res = await fetch(`${API_BASE}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identity, password, captchaToken: captchaResponse }),
                });

                // 1. Rate Limiting (429)
                if (res.status === 429) {
                    const retryHeader = res.headers.get('Retry-After');
                    const waitSec = retryHeader ? parseInt(retryHeader, 10) : 15;
                    showLoginAlert(`Traffic is currently high. Please wait ${waitSec} seconds before trying again.`, 'warning');
                    if (typeof grecaptcha !== 'undefined') grecaptcha.reset();
                    setButtonLoading(false);
                    return;
                }

                // 2. Account Lockout (423)
                if (res.status === 423) {
                    const data = await res.json().catch(() => ({}));
                    showLoginAlert(data.message || 'Account temporarily locked due to multiple failed attempts. Please try again in 15 minutes.', 'danger');
                    if (typeof grecaptcha !== 'undefined') grecaptcha.reset();
                    setButtonLoading(false);
                    return;
                }

                // 3. Transient Server Errors (502 / 503 / 504) -> Auto-retry with Jitter
                if ([502, 503, 504].includes(res.status) && attempt < MAX_RETRIES) {
                    attempt++;
                    setButtonLoading(true, `Server busy, retrying (${attempt}/${MAX_RETRIES})...`);
                    await sleepWithJitter(attempt);
                    continue;
                }

                const data = await res.json().catch(() => ({}));

                if (!res.ok || !data.success) {
                    showLoginAlert(data.message || 'Login failed. Please check your credentials.', 'danger');
                    if (typeof grecaptcha !== 'undefined') grecaptcha.reset();
                    setButtonLoading(false);
                    return;
                }

                // Successful authentication
                localStorage.setItem('mentorae_token', data.token);
                localStorage.setItem('mentorae_user', JSON.stringify(data.user));
                if (data.sessionTimeoutMinutes) {
                    localStorage.setItem('mentorae_session_timeout_minutes', String(data.sessionTimeoutMinutes));
                }

                if (data.user.mustChangePassword) {
                    showForcePasswordChange(data.token, () => {
                        window.location.href = destinations[data.user.role] || 'login.html';
                    });
                    return;
                }

                window.location.href = destinations[data.user.role] || 'login.html';
                return;
            } catch (err) {
                console.error('Fetch error during login:', err);
                if (attempt < MAX_RETRIES) {
                    attempt++;
                    setButtonLoading(true, `Connecting... (${attempt}/${MAX_RETRIES})`);
                    await sleepWithJitter(attempt);
                } else {
                    showLoginAlert('Unable to reach the authentication server. Please check your internet connection.', 'danger');
                    if (typeof grecaptcha !== 'undefined') grecaptcha.reset();
                    setButtonLoading(false);
                    return;
                }
            }
        }

        setButtonLoading(false);
    });

    // 3. Scanner Code Submission — verifies against the server and opens the scanner
    if (submitScannerCodeBtn && scannerCodeInput) {
        submitScannerCodeBtn.addEventListener('click', async () => {
            const code = scannerCodeInput.value.trim();
            if (!code) {
                alert('Please enter a code to proceed.');
                return;
            }

            try {
                const res = await fetch(`${API_BASE}/api/attendance/verify-scanner-key`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: code }),
                });
                const data = await res.json();

                if (!data.success) {
                    alert(data.message || 'Invalid scanner code.');
                    return;
                }

                localStorage.setItem('mentorae_token', data.token);
                localStorage.setItem('mentorae_user', JSON.stringify({ role: 'security' }));
                window.location.href = 'attendance_scanner_teacher.html';
            } catch (err) {
                console.error(err);
                alert('Could not reach the server. Please try again.');
            }
        });
    }

    // 3b. Forced first-login password change — shown when the account is still
    // on its auto-generated temporary password (see mustChangePassword above).
    const forcePasswordChangeModalEl = document.getElementById('forcePasswordChangeModal');
    const forcePasswordChangeModal = new bootstrap.Modal(forcePasswordChangeModalEl);
    const forcePasswordChangeForm = document.getElementById('forcePasswordChangeForm');

    function validatePasswordPolicy(password) {
        if (!password || typeof password !== 'string') {
            return 'Password is required.';
        }
        if (password.length < 8) {
            return 'Password must be at least 8 characters long.';
        }
        const missing = [];
        if (!/[A-Z]/.test(password)) missing.push('an uppercase letter (A-Z)');
        if (!/[a-z]/.test(password)) missing.push('a lowercase letter (a-z)');
        if (!/[0-9]/.test(password)) missing.push('a number (0-9)');
        if (!/[^A-Za-z0-9]/.test(password)) missing.push('a special character (e.g. !@#$%^&*)');

        if (missing.length > 0) {
            return `Password must include ${missing.join(', ')}.`;
        }
        return null;
    }

    function updatePasswordRequirementsUi(password, prefix) {
        const val = password || '';
        const checks = {
            Length: val.length >= 8,
            Upper: /[A-Z]/.test(val),
            Lower: /[a-z]/.test(val),
            Number: /[0-9]/.test(val),
            Special: /[^A-Za-z0-9]/.test(val),
        };

        for (const [key, passed] of Object.entries(checks)) {
            const el = document.getElementById(`${prefix}Req${key}`);
            if (el) {
                if (passed) {
                    el.className = 'text-success fw-semibold';
                    const icon = el.querySelector('i');
                    if (icon) icon.className = 'bi bi-check-circle-fill me-1.5 text-success';
                } else {
                    el.className = 'text-muted';
                    const icon = el.querySelector('i');
                    if (icon) icon.className = 'bi bi-circle me-1.5 text-muted';
                }
            }
        }
    }

    const fpcNewPasswordInput = document.getElementById('fpcNewPassword');
    if (fpcNewPasswordInput) {
        fpcNewPasswordInput.addEventListener('input', () => {
            clearInlineWarning(fpcNewPasswordInput);
            updatePasswordRequirementsUi(fpcNewPasswordInput.value, 'fpc');
        });
    }
    const fpcConfirmPasswordInput = document.getElementById('fpcConfirmPassword');
    if (fpcConfirmPasswordInput) {
        fpcConfirmPasswordInput.addEventListener('input', () => {
            clearInlineWarning(fpcConfirmPasswordInput);
        });
    }

    function showForcePasswordChange(authToken, onDone) {
        forcePasswordChangeForm.reset();
        updatePasswordRequirementsUi('', 'fpc');
        const fpcPersonalEmail = document.getElementById('fpcPersonalEmail');
        const fpcSkipEmail = document.getElementById('fpcSkipEmail');

        if (fpcSkipEmail && fpcPersonalEmail) {
            fpcSkipEmail.checked = false;
            fpcPersonalEmail.disabled = false;
            fpcSkipEmail.onchange = () => {
                if (fpcSkipEmail.checked) {
                    fpcPersonalEmail.value = '';
                    fpcPersonalEmail.disabled = true;
                } else {
                    fpcPersonalEmail.disabled = false;
                }
            };
        }

        forcePasswordChangeModal.show();

        forcePasswordChangeForm.onsubmit = async (e) => {
            e.preventDefault();
            const currentPassword = document.getElementById('fpcCurrentPassword').value;
            const newPassword = document.getElementById('fpcNewPassword').value;
            const confirmPassword = document.getElementById('fpcConfirmPassword').value;

            const currentPasswordEl = document.getElementById('fpcCurrentPassword');
            const newPasswordEl = document.getElementById('fpcNewPassword');
            const confirmPasswordEl = document.getElementById('fpcConfirmPassword');
            clearInlineWarning(newPasswordEl);
            clearInlineWarning(confirmPasswordEl);
            if (fpcPersonalEmail) clearInlineWarning(fpcPersonalEmail);

            const passwordError = validatePasswordPolicy(newPassword);
            if (passwordError) {
                showInlineWarning(newPasswordEl, passwordError);
                newPasswordEl.focus();
                return;
            }
            if (newPassword === currentPassword) {
                showInlineWarning(newPasswordEl, 'New password must be different from your current temporary password.');
                newPasswordEl.focus();
                return;
            }
            if (newPassword !== confirmPassword) {
                showInlineWarning(confirmPasswordEl, 'New password and confirmation do not match.');
                confirmPasswordEl.focus();
                return;
            }

            let personalEmail = null;
            if (fpcPersonalEmail && (!fpcSkipEmail || !fpcSkipEmail.checked)) {
                const emailVal = fpcPersonalEmail.value.trim();
                if (emailVal) {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(emailVal)) {
                        showInlineWarning(fpcPersonalEmail, 'Please enter a valid email address (e.g., yourname@gmail.com).');
                        fpcPersonalEmail.focus();
                        return;
                    }
                    personalEmail = emailVal;
                }
            }

            const submitBtn = forcePasswordChangeForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            try {
                const res = await fetch(`${API_BASE}/api/auth/change-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                    body: JSON.stringify({ currentPassword, newPassword, personalEmail }),
                });
                const data = await res.json();

                if (!data.success) {
                    alert(data.message || 'Could not update your password.');
                    return;
                }

                // Keep the stored session in sync so the prompt doesn't show again this session.
                const storedUser = JSON.parse(localStorage.getItem('mentorae_user') || 'null');
                if (storedUser) {
                    storedUser.mustChangePassword = false;
                    localStorage.setItem('mentorae_user', JSON.stringify(storedUser));
                }

                forcePasswordChangeModal.hide();
                onDone();
            } catch (err) {
                console.error(err);
                alert('Could not reach the server. Please try again.');
            } finally {
                submitBtn.disabled = false;
            }
        };
    }

    // 4. Forgot Password Modal — Multi-channel OTP and identity recovery
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const forgotPasswordModalEl = document.getElementById('forgotPasswordModal');
    const forgotPasswordModal = new bootstrap.Modal(forgotPasswordModalEl);

    const resetStep1 = document.getElementById('resetStep1');
    const resetStep2 = document.getElementById('resetStep2');
    const resetStepPhone = document.getElementById('resetStepPhone');
    const resetStepAdviser = document.getElementById('resetStepAdviser');
    const resetStep3 = document.getElementById('resetStep3');

    const sendCodeForm = document.getElementById('sendCodeForm');
    const verifyCodeForm = document.getElementById('verifyCodeForm');
    const verifyPhoneForm = document.getElementById('verifyPhoneForm');
    const resetPasswordForm = document.getElementById('resetPasswordForm');

    const resetIdentityInput = document.getElementById('resetIdentity');
    const userEmailForOtp = document.getElementById('userEmailForOtp');
    const otpCodeInput = document.getElementById('otpCode');
    const verifyPhoneInput = document.getElementById('verifyPhoneInput');
    const maskedPhoneDisplay = document.getElementById('maskedPhoneDisplay');
    const adviserHelpText = document.getElementById('adviserHelpText');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmNewPasswordInput = document.getElementById('confirmNewPassword');

    const resetStep1Alert = document.getElementById('resetStep1Alert');

    let currentIdentity = null;
    let resetToken = null; 
    let isResetSaving = false; 

    function showResetAlert(message) {
        if (resetStep1Alert) {
            resetStep1Alert.textContent = message;
            resetStep1Alert.classList.remove('d-none');
        }
        alert(message);
    }

    function hideResetAlert() {
        if (resetStep1Alert) {
            resetStep1Alert.classList.add('d-none');
            resetStep1Alert.textContent = '';
        }
    }

    function backToStep1() {
        hideResetAlert();
        if (resetStep1) resetStep1.classList.remove('d-none');
        if (resetStep2) resetStep2.classList.add('d-none');
        if (resetStepPhone) resetStepPhone.classList.add('d-none');
        if (resetStepAdviser) resetStepAdviser.classList.add('d-none');
        if (resetStep3) resetStep3.classList.add('d-none');
        if (verifyCodeForm) verifyCodeForm.reset();
        if (verifyPhoneForm) verifyPhoneForm.reset();
    }

    document.querySelectorAll('.btnBackToStep1').forEach(btn => {
        btn.addEventListener('click', backToStep1);
    });

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            backToStep1();
            forgotPasswordModal.show();
        });
    }

    // Step 1: Send verification code or verify account presence
    if (sendCodeForm) {
        sendCodeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideResetAlert();
            currentIdentity = resetIdentityInput ? resetIdentityInput.value.trim() : '';
            if (!currentIdentity) {
                showResetAlert('Please enter your email address or School ID / LRN.');
                if (resetIdentityInput) resetIdentityInput.focus();
                return;
            }

            // If input is an email, ensure it has a valid format
            if (currentIdentity.includes('@')) {
                const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailPattern.test(currentIdentity)) {
                    showResetAlert('Please enter a valid email address.');
                    if (resetIdentityInput) resetIdentityInput.focus();
                    return;
                }
            }

            const submitBtn = sendCodeForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            try {
                const res = await fetch(`${API_BASE}/api/auth/forgot-password/send-code`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identity: currentIdentity }),
                });
                const data = await res.json();

                if (!data.success) {
                    showResetAlert(data.message || 'This email address or ID is not registered in the system.');
                    if (resetIdentityInput) resetIdentityInput.focus();
                    return;
                }

                resetStep1.classList.add('d-none');

                if (data.method === 'email') {
                    if (userEmailForOtp) userEmailForOtp.textContent = data.maskedEmail || currentIdentity;
                    resetStep2.classList.remove('d-none');
                } else if (data.method === 'phone_verification') {
                    if (maskedPhoneDisplay) maskedPhoneDisplay.textContent = data.maskedPhone || '••••••••';
                    resetStepPhone.classList.remove('d-none');
                } else if (data.method === 'adviser_required') {
                    if (adviserHelpText) adviserHelpText.textContent = data.message;
                    resetStepAdviser.classList.remove('d-none');
                } else {
                    alert(data.message || 'Verification initiated.');
                }
            } catch (err) {
                console.error(err);
                showResetAlert('Could not reach the server. Please try again.');
            } finally {
                submitBtn.disabled = false;
            }
        });
    }

    // Step 2A: Verify OTP code
    if (verifyCodeForm) {
        verifyCodeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const enteredOtp = otpCodeInput.value.trim();
            if (!enteredOtp) {
                alert('Please enter the 6-digit verification code.');
                otpCodeInput.focus();
                return;
            }
            if (!/^\d{6}$/.test(enteredOtp)) {
                alert('Verification code must be exactly 6 digits (numbers only).');
                otpCodeInput.focus();
                return;
            }

            const submitBtn = verifyCodeForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            try {
                const res = await fetch(`${API_BASE}/api/auth/forgot-password/verify-code`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identity: currentIdentity, otp: enteredOtp }),
                });
                const data = await res.json();

                if (!data.success) {
                    alert(data.message || 'Invalid verification code. Please try again.');
                    return;
                }

                resetToken = data.resetToken;
                alert('Identity verified! Please set your new password.');
                resetStep2.classList.add('d-none');
                resetStep3.classList.remove('d-none');
                updatePasswordRequirementsUi(newPasswordInput ? newPasswordInput.value : '', 'reset');
            } catch (err) {
                console.error(err);
                alert('Could not reach the server. Please try again.');
            } finally {
                submitBtn.disabled = false;
            }
        });
    }

    // Step 2B: Verify Registered Phone (for accounts without real email)
    if (verifyPhoneForm) {
        verifyPhoneForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearInlineWarning(verifyPhoneInput);
            if (!phoneNumber) {
                showInlineWarning(verifyPhoneInput, 'Please enter your registered phone number.');
                verifyPhoneInput.focus();
                return;
            }
            if (!/^09\d{9}$/.test(phoneNumber)) {
                showInlineWarning(verifyPhoneInput, 'Must be an 11-digit number starting with 09 (e.g., 09123456789).');
                verifyPhoneInput.focus();
                return;
            }

            const submitBtn = verifyPhoneForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            try {
                const res = await fetch(`${API_BASE}/api/auth/forgot-password/verify-phone`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identity: currentIdentity, phoneNumber }),
                });
                const data = await res.json();

                if (!data.success) {
                    alert(data.message || 'Phone number does not match our records.');
                    return;
                }

                resetToken = data.resetToken;
                alert('Phone number verified! Please set your new password.');
                resetStepPhone.classList.add('d-none');
                resetStep3.classList.remove('d-none');
                updatePasswordRequirementsUi(newPasswordInput ? newPasswordInput.value : '', 'reset');
            } catch (err) {
                console.error(err);
                alert('Could not reach the server. Please try again.');
            } finally {
                submitBtn.disabled = false;
            }
        });
    }

    // Live input listeners for Step 3 reset password inputs
    if (newPasswordInput) {
        newPasswordInput.addEventListener('input', () => {
            clearInlineWarning(newPasswordInput);
            updatePasswordRequirementsUi(newPasswordInput.value, 'reset');
        });
    }
    if (confirmNewPasswordInput) {
        confirmNewPasswordInput.addEventListener('input', () => {
            clearInlineWarning(confirmNewPasswordInput);
        });
    }

    // Step 3: Reset the password
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword = newPasswordInput.value;
            const confirmNewPassword = confirmNewPasswordInput.value;

            clearInlineWarning(newPasswordInput);
            clearInlineWarning(confirmNewPasswordInput);

            const passwordError = validatePasswordPolicy(newPassword);
            if (passwordError) {
                showInlineWarning(newPasswordInput, passwordError);
                newPasswordInput.focus();
                return;
            }
            if (newPassword !== confirmNewPassword) {
                showInlineWarning(confirmNewPasswordInput, 'Passwords do not match.');
                confirmNewPasswordInput.focus();
                return;
            }

            const submitBtn = resetPasswordForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            try {
                const res = await fetch(`${API_BASE}/api/auth/forgot-password/reset`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ resetToken, newPassword }),
                });
                const data = await res.json();
                alert(data.message || 'Password successfully updated! You can now log in.');
                if (data.success) {
                    isResetSaving = true;
                    forgotPasswordModal.hide();
                }
            } catch (err) {
                console.error(err);
                alert('Could not reach the server. Please try again.');
            } finally {
                submitBtn.disabled = false;
            }
        });
    }

    // Reset modal to step 1 when it's hidden
    if (forgotPasswordModalEl) {
        forgotPasswordModalEl.addEventListener('hide.bs.modal', (event) => {
            if (isResetSaving) return;

            const isBeyondStep1 = (resetStep2 && !resetStep2.classList.contains('d-none')) ||
                (resetStepPhone && !resetStepPhone.classList.contains('d-none')) ||
                (resetStep3 && !resetStep3.classList.contains('d-none'));
            const hasTyped = resetIdentityInput && resetIdentityInput.value.trim() !== '';

            if (isBeyondStep1 && hasTyped) {
                const confirmCancel = confirm('Are you sure you want to cancel the password reset process? Any entered information will be discarded.');
                if (!confirmCancel) {
                    event.preventDefault();
                }
            }
        });

        forgotPasswordModalEl.addEventListener('hidden.bs.modal', () => {
            isResetSaving = false;
            backToStep1();
            if (sendCodeForm) sendCodeForm.reset();
            if (verifyCodeForm) verifyCodeForm.reset();
            if (verifyPhoneForm) verifyPhoneForm.reset();
            if (resetPasswordForm) resetPasswordForm.reset();
            currentIdentity = null;
            resetToken = null;
        });
    }

    // If running locally or offline and reCAPTCHA is not loaded, show helpful indicator
    setTimeout(() => {
        const captchaEl = document.querySelector('.g-recaptcha');
        const isLocal = ['localhost', '127.0.0.1', ''].includes(window.location.hostname) ||
            window.location.protocol === 'file:' ||
            window.location.hostname.startsWith('192.168.') ||
            window.location.hostname.startsWith('10.') ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(window.location.hostname);

        if (captchaEl && isLocal && (typeof grecaptcha === 'undefined' || !captchaEl.children.length)) {
            captchaEl.innerHTML = '<div style="font-size: 11px; color: #166534; background: #f0fdf4; border: 1px dashed #86efac; border-radius: 6px; padding: 6px 10px; margin-top: 6px; text-align: center;">✅ Local/Offline Mode: reCAPTCHA auto-bypassed for testing</div>';
        }
    }, 2000);
});