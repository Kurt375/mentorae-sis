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

    // 2. Real login request
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const identity = document.getElementById('loginEmail').value.trim();
        const password = passwordInput ? passwordInput.value : '';
        const isLocalEnv =
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname === '' ||
            window.location.protocol === 'file:' ||
            window.location.hostname.startsWith('192.168.') ||
            window.location.hostname.startsWith('10.');

        let captchaResponse = (typeof grecaptcha !== 'undefined' && typeof grecaptcha.getResponse === 'function')
            ? grecaptcha.getResponse()
            : '';

        if (!identity || !password) {
            alert('Please fill out all the input fields correctly.');
            return;
        }

        if (!captchaResponse) {
            if (isLocalEnv) {
                captchaResponse = 'dev-bypass-token';
            } else {
                alert('Please verify you are not a robot by completing the reCAPTCHA challenge.');
                return;
            }
        }

        const submitBtn = loginForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            // Note: credentials: 'include' removed to allow cross-origin requests from Netlify
            const res = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identity, password, captchaToken: captchaResponse }),
            });
            const data = await res.json();

            if (!data.success) {
                alert(data.message || 'Login failed.');
                if (typeof grecaptcha !== 'undefined') grecaptcha.reset();
                return;
            }

            localStorage.setItem('mentorae_token', data.token);
            localStorage.setItem('mentorae_user', JSON.stringify(data.user));

            if (data.user.mustChangePassword) {
                // Don't navigate away yet -- force the password change first.
                showForcePasswordChange(data.token, () => {
                    window.location.href = destinations[data.user.role] || 'login.html';
                });
                return;
            }

            window.location.href = destinations[data.user.role] || 'login.html';
        } catch (err) {
            console.error('Fetch error:', err);
            alert('Could not reach the server. Please try again.');
            if (typeof grecaptcha !== 'undefined') grecaptcha.reset();
        } finally {
            submitBtn.disabled = false;
        }
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

    function showForcePasswordChange(authToken, onDone) {
        forcePasswordChangeForm.reset();
        forcePasswordChangeModal.show();

        forcePasswordChangeForm.onsubmit = async (e) => {
            e.preventDefault();
            const currentPassword = document.getElementById('fpcCurrentPassword').value;
            const newPassword = document.getElementById('fpcNewPassword').value;
            const confirmPassword = document.getElementById('fpcConfirmPassword').value;

            if (newPassword.length < 8) {
                alert('New password must be at least 8 characters.');
                return;
            }
            if (newPassword !== confirmPassword) {
                alert('New password and confirmation do not match.');
                return;
            }

            const submitBtn = forcePasswordChangeForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            try {
                const res = await fetch(`${API_BASE}/api/auth/change-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                    body: JSON.stringify({ currentPassword, newPassword }),
                });
                const data = await res.json();

                if (!data.success) {
                    alert(data.message || 'Could not change your password.');
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

    // 4. Forgot Password Modal — real OTP flow
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const forgotPasswordModalEl = document.getElementById('forgotPasswordModal');
    const forgotPasswordModal = new bootstrap.Modal(forgotPasswordModalEl);

    const resetStep1 = document.getElementById('resetStep1');
    const resetStep2 = document.getElementById('resetStep2');
    const resetStep3 = document.getElementById('resetStep3');

    const sendCodeForm = document.getElementById('sendCodeForm');
    const verifyCodeForm = document.getElementById('verifyCodeForm');
    const resetPasswordForm = document.getElementById('resetPasswordForm');

    const userEmailForOtp = document.getElementById('userEmailForOtp');
    const resetEmailInput = document.getElementById('resetEmail');
    const otpCodeInput = document.getElementById('otpCode');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmNewPasswordInput = document.getElementById('confirmNewPassword');

    let userEmail = null;
    let resetToken = null; 
    let isResetSaving = false; 

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            forgotPasswordModal.show();
        });
    }

    // Step 1: Send verification code
    if (sendCodeForm) {
        sendCodeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            userEmail = resetEmailInput.value.trim();
            if (!userEmail || !userEmail.includes('@')) {
                alert('Please enter a valid email address.');
                return;
            }

            try {
                const res = await fetch(`${API_BASE}/api/auth/forgot-password/send-code`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: userEmail }),
                });
                const data = await res.json();
                alert(data.message);
                if (data.success) {
                    userEmailForOtp.textContent = userEmail;
                    resetStep1.classList.add('d-none');
                    resetStep2.classList.remove('d-none');
                }
            } catch (err) {
                console.error(err);
                alert('Could not reach the server. Please try again.');
            }
        });
    }

    // Step 2: Verify OTP code
    if (verifyCodeForm) {
        verifyCodeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const enteredOtp = otpCodeInput.value.trim();

            try {
                const res = await fetch(`${API_BASE}/api/auth/forgot-password/verify-code`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: userEmail, otp: enteredOtp }),
                });
                const data = await res.json();

                if (!data.success) {
                    alert(data.message || 'Invalid verification code. Please try again.');
                    return;
                }

                resetToken = data.resetToken;
                alert('Verification successful!');
                resetStep2.classList.add('d-none');
                resetStep3.classList.remove('d-none');
            } catch (err) {
                console.error(err);
                alert('Could not reach the server. Please try again.');
            }
        });
    }

    // Step 3: Reset the password
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword = newPasswordInput.value;
            const confirmNewPassword = confirmNewPasswordInput.value;

            if (!newPassword || newPassword.length < 6) {
                alert('Password must be at least 6 characters long.');
                return;
            }
            if (newPassword !== confirmNewPassword) {
                alert('Passwords do not match.');
                return;
            }

            try {
                const res = await fetch(`${API_BASE}/api/auth/forgot-password/reset`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ resetToken, newPassword }),
                });
                const data = await res.json();
                alert(data.message);
                if (data.success) {
                    isResetSaving = true;
                    forgotPasswordModal.hide();
                }
            } catch (err) {
                console.error(err);
                alert('Could not reach the server. Please try again.');
            }
        });
    }

    // Reset modal to step 1 when it's hidden, and warn if canceling active progress
    if (forgotPasswordModalEl) {
        forgotPasswordModalEl.addEventListener('hide.bs.modal', (event) => {
            if (isResetSaving) return;

            const isBeyondStep1 = (resetStep2 && !resetStep2.classList.contains('d-none')) || (resetStep3 && !resetStep3.classList.contains('d-none'));
            const hasTypedEmail = resetEmailInput && resetEmailInput.value.trim() !== '';

            if (isBeyondStep1 || hasTypedEmail) {
                const confirmCancel = confirm('Are you sure you want to cancel the password reset process? Any entered information will be discarded.');
                if (!confirmCancel) {
                    event.preventDefault();
                }
            }
        });

        forgotPasswordModalEl.addEventListener('hidden.bs.modal', () => {
            isResetSaving = false;
            resetStep1.classList.remove('d-none');
            resetStep2.classList.add('d-none');
            resetStep3.classList.add('d-none');
            sendCodeForm.reset();
            verifyCodeForm.reset();
            resetPasswordForm.reset();
            userEmail = null;
            resetToken = null;
        });
    }

    // If running locally or offline and reCAPTCHA is not loaded, show helpful indicator
    setTimeout(() => {
        const captchaEl = document.querySelector('.g-recaptcha');
        const isLocal = ['localhost', '127.0.0.1', ''].includes(window.location.hostname) ||
            window.location.protocol === 'file:' ||
            window.location.hostname.startsWith('192.168.') ||
            window.location.hostname.startsWith('10.');

        if (captchaEl && isLocal && (typeof grecaptcha === 'undefined' || !captchaEl.children.length)) {
            captchaEl.innerHTML = '<div style="font-size: 11px; color: #166534; background: #f0fdf4; border: 1px dashed #86efac; border-radius: 6px; padding: 6px 10px; margin-top: 6px; text-align: center;">✅ Local/Offline Mode: reCAPTCHA auto-bypassed for testing</div>';
        }
    }, 2000);
});