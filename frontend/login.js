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
        const password = passwordInput.value;
        const captchaChecked = document.getElementById('captchaCheck').checked;

        if (!identity || !password) {
            alert('Please fill out all the input fields correctly.');
            return;
        }
        if (!captchaChecked) {
            alert('Please verify you are not a robot by checking the security box.');
            return;
        }

        const submitBtn = loginForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            // Note: credentials: 'include' removed to allow cross-origin requests from Netlify
            const res = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identity, password }),
            });
            const data = await res.json();

            if (!data.success) {
                alert(data.message || 'Login failed.');
                return;
            }

            localStorage.setItem('mentorae_token', data.token);
            localStorage.setItem('mentorae_user', JSON.stringify(data.user));
            window.location.href = destinations[data.user.role] || 'login.html';
        } catch (err) {
            console.error('Fetch error:', err);
            alert('Could not reach the server. Please try again.');
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
                    forgotPasswordModal.hide();
                }
            } catch (err) {
                console.error(err);
                alert('Could not reach the server. Please try again.');
            }
        });
    }

    // Reset modal to step 1 when it's hidden
    if (forgotPasswordModalEl) {
        forgotPasswordModalEl.addEventListener('hidden.bs.modal', () => {
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
});