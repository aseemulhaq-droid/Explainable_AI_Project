// frontend/js/auth.js — real API auth flows (login, register, forgot-password)

document.addEventListener('DOMContentLoaded', () => {
    initLogin();
    initRegister();
    initForgotPassword();
});

// wire up password toggle and role selector UI
document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('togglePassword');
    if (toggle) {
        toggle.addEventListener('click', () => {
            const pwd = document.getElementById('password');
            if (!pwd) return;
            pwd.type = pwd.type === 'password' ? 'text' : 'password';
        });
    }

    const roleBtns = document.querySelectorAll('.role-btn');
    roleBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            roleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const role = btn.getAttribute('data-role');
            const input = document.getElementById('selectedRole');
            if (input) input.value = role;
        });
    });
});

/* ── Login ─────────────────────────────────────────────────────────────── */

function initLogin() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAuthAlerts();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const btn = document.getElementById('loginBtn');

        btn.disabled = true;
        btn.textContent = 'Logging in...';

            try {
            const res = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, requested_role: (document.getElementById('selectedRole')?.value || 'doctor').toString().toLowerCase() })
            });

            let data;
            try {
                data = await res.json();
            } catch {
                showAuthError('Unexpected response from server.');
                return;
            }

            if (res.status === 401) {
                showAuthError(data.error || 'Invalid email or password.');
                return;
            }

            if (!res.ok || !data.success) {
                showAuthError(data.error || 'Login failed. Please try again.');
                return;
            }

            sessionStorage.setItem('token', data.token);
            // normalize role to lowercase for consistent checks across the app
            const serverRole = data.role ? String(data.role).toLowerCase() : (document.getElementById('selectedRole')?.value || 'doctor');
            sessionStorage.setItem('role', serverRole);
            sessionStorage.setItem('name', data.name);
            if (data.user_id != null) {
                sessionStorage.setItem('user_id', String(data.user_id));
            }

                // Prefer server-provided role, fall back to selectedRole from UI.
                const role = String(data.role || document.getElementById('selectedRole')?.value || 'doctor').toLowerCase();
            if (role === 'admin') {
                window.location.href = 'dashboard-admin.html';
            } else if (role === 'researcher') {
                window.location.href = 'dashboard-researcher.html';
            } else {
                window.location.href = 'dashboard-doctor.html';
            }
        } catch {
            showAuthError(`Network error — is the backend server running at ${API_BASE_URL}?`);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Log In';
        }
    });
}

/* ── Register ──────────────────────────────────────────────────────────── */

function initRegister() {
    const registerFormStep1 = document.getElementById('registerFormStep1');
    const registerFormStep2 = document.getElementById('registerFormStep2');
    const resendLink = document.getElementById('resendOtpLink');

    if (registerFormStep1) {
        registerFormStep1.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearAuthAlerts();

            const payload = getRegisterPayload();
            if (!payload) return;

            await requestRegisterOtp(payload, 'registerStep1Btn', 'Create Account');
        });
    }

    if (registerFormStep2) {
        registerFormStep2.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearAuthAlerts();

            const email = sessionStorage.getItem('pending_email');
            const otp = document.getElementById('otp').value.trim();

            if (!email) {
                showAuthError('Session expired. Please fill in the registration form again.');
                showRegisterStep1();
                return;
            }

            if (!/^\d{6}$/.test(otp)) {
                showAuthError('Please enter a valid 6-digit verification code.');
                return;
            }

            const btn = document.getElementById('registerStep2Btn');
            btn.disabled = true;
            btn.textContent = 'Verifying...';

            try {
                const res = await fetch(`${API_BASE_URL}/register/verify-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, otp })
                });
                const data = await res.json();

                if (res.ok && data.success) {
                    sessionStorage.removeItem('pending_email');
                    sessionStorage.removeItem('pending_registration');
                    showAuthSuccess('Registration successful! Redirecting to login...');
                    setTimeout(() => { window.location.href = 'login.html'; }, 1500);
                    return;
                }

                showAuthError(data.error || 'Invalid or expired verification code.');
            } catch {
                showAuthError('Network error connecting to server.');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Verify Code';
            }
        });
    }

    if (resendLink) {
        resendLink.addEventListener('click', async (e) => {
            e.preventDefault();
            clearAuthAlerts();

            const saved = sessionStorage.getItem('pending_registration');
            if (!saved) {
                showAuthError('No registration in progress. Please go back and fill in the form.');
                return;
            }

            let payload;
            try {
                payload = JSON.parse(saved);
            } catch {
                showAuthError('Session expired. Please fill in the registration form again.');
                showRegisterStep1();
                return;
            }

            resendLink.textContent = 'Sending...';
            resendLink.style.pointerEvents = 'none';

            const ok = await requestRegisterOtp(payload, null, null, true);
            if (ok) {
                showAuthSuccess('A new verification code has been sent.');
            }

            resendLink.textContent = 'Resend code';
            resendLink.style.pointerEvents = '';
        });
    }
}

function getRegisterPayload() {
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirm_password = document.getElementById('confirm_password').value;
    const role = document.getElementById('role').value;
    const institution = document.getElementById('institution').value.trim();

    if (password !== confirm_password) {
        showAuthError('Passwords do not match.');
        return null;
    }

    if (password.length < 8) {
        showAuthError('Password must be at least 8 characters.');
        return null;
    }

    return { name, email, password, role, institution };
}

async function requestRegisterOtp(payload, btnId, btnLabel, isResend = false) {
    const btn = btnId ? document.getElementById(btnId) : null;
    if (btn) {
        btn.disabled = true;
        btn.textContent = isResend ? 'Resending...' : 'Requesting Code...';
    }

    try {
        const res = await fetch(`${API_BASE_URL}/register/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok && data.success) {
            sessionStorage.setItem('pending_email', payload.email);
            sessionStorage.setItem('pending_registration', JSON.stringify(payload));
            showRegisterStep2(payload.email);
            if (!isResend) {
                showAuthSuccess(data.message || 'Verification code sent. Check your email.');
            }
            return true;
        }

        showAuthError(data.error || 'Registration failed.');
        return false;
    } catch {
        showAuthError('Network error connecting to server.');
        return false;
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = btnLabel;
        }
    }
}

function showRegisterStep1() {
    document.getElementById('step1')?.classList.remove('hidden');
    document.getElementById('step2')?.classList.add('hidden');
}

function showRegisterStep2(email) {
    document.getElementById('step1')?.classList.add('hidden');
    document.getElementById('step2')?.classList.remove('hidden');
    const emailHint = document.getElementById('otpEmailHint');
    if (emailHint) emailHint.textContent = email;
    document.getElementById('otp')?.focus();
}

/* ── Forgot Password ───────────────────────────────────────────────────── */

function initForgotPassword() {
    const forgotFormStep1 = document.getElementById('forgotFormStep1');
    const forgotFormStep2 = document.getElementById('forgotFormStep2');
    const resendResetLink = document.getElementById('resendResetLink');

    if (forgotFormStep1) {
        forgotFormStep1.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearAuthAlerts();

            const email = document.getElementById('forgotEmail').value.trim();
            const btn = document.getElementById('forgotStep1Btn');

            btn.disabled = true;
            btn.textContent = 'Sending Code...';

            try {
                const res = await fetch(`${API_BASE_URL}/forgot-password/request-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await res.json();

                if (res.ok && data.success) {
                    sessionStorage.setItem('forgot_email', email);
                    showAuthSuccess(
                        data.message ||
                        'If an account with that email exists, a reset code has been sent.'
                    );
                    document.getElementById('forgotStep1')?.classList.add('hidden');
                    document.getElementById('forgotStep2')?.classList.remove('hidden');
                    document.getElementById('forgotOtp')?.focus();
                } else {
                    showAuthError(data.error || 'Failed to request reset code.');
                }
            } catch {
                showAuthError('Network error connecting to server.');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Send Reset Code';
            }
        });
    }

    if (forgotFormStep2) {
        forgotFormStep2.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearAuthAlerts();

            const email = sessionStorage.getItem('forgot_email');
            const otp = document.getElementById('forgotOtp').value.trim();
            const new_password = document.getElementById('newPassword').value;
            const confirm_password = document.getElementById('confirmNewPassword').value;

            if (!email) {
                showAuthError('Session expired. Please enter your email again.');
                document.getElementById('forgotStep2')?.classList.add('hidden');
                document.getElementById('forgotStep1')?.classList.remove('hidden');
                return;
            }

            if (!/^\d{6}$/.test(otp)) {
                showAuthError('Please enter a valid 6-digit reset code.');
                return;
            }

            if (new_password !== confirm_password) {
                showAuthError('New passwords do not match.');
                return;
            }

            if (new_password.length < 8) {
                showAuthError('Password must be at least 8 characters.');
                return;
            }

            const btn = document.getElementById('forgotStep2Btn');
            btn.disabled = true;
            btn.textContent = 'Resetting...';

            try {
                const res = await fetch(`${API_BASE_URL}/forgot-password/reset`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, otp, new_password })
                });
                const data = await res.json();

                if (res.ok && data.success) {
                    sessionStorage.removeItem('forgot_email');
                    showAuthSuccess('Password reset successful! Redirecting to login...');
                    setTimeout(() => { window.location.href = 'login.html'; }, 1500);
                    return;
                }

                showAuthError(data.error || 'Reset failed. Check your code and try again.');
            } catch {
                showAuthError('Network error connecting to server.');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Reset Password';
            }
        });
    }

    if (resendResetLink) {
        resendResetLink.addEventListener('click', async (e) => {
            e.preventDefault();
            clearAuthAlerts();

            const email = sessionStorage.getItem('forgot_email');
            if (!email) {
                showAuthError('Please enter your email first.');
                document.getElementById('forgotStep2')?.classList.add('hidden');
                document.getElementById('forgotStep1')?.classList.remove('hidden');
                return;
            }

            resendResetLink.textContent = 'Sending...';
            resendResetLink.style.pointerEvents = 'none';

            try {
                const res = await fetch(`${API_BASE_URL}/forgot-password/request-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await res.json();

                if (res.ok && data.success) {
                    showAuthSuccess(data.message || 'A new reset code has been sent.');
                } else {
                    showAuthError(data.error || 'Failed to resend code.');
                }
            } catch {
                showAuthError('Network error connecting to server.');
            } finally {
                resendResetLink.textContent = 'Resend code';
                resendResetLink.style.pointerEvents = '';
            }
        });
    }
}
