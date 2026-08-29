document.addEventListener('DOMContentLoaded', initAdminDashboard);

async function initAdminDashboard() {
    if (sessionStorage.getItem('role')?.toLowerCase() !== 'admin') {
        window.location.href = 'login.html';
        return;
    }
    const [stats, users, logins, history] = await Promise.all([
        adminFetch('/admin/stats'),
        adminFetch('/admin/users'),
        adminFetch('/admin/login-history'),
        adminFetch('/history')
    ]);
    if (!stats.success || !users.success || !logins.success || !history.success) {
        showAdminError('Unable to load administrator data.');
        return;
    }
    setText('adminTotalUsers', stats.total_users);
    setText('adminActiveDoctors', stats.active_doctors);
    setText('adminTotalDiagnoses', stats.total_diagnoses);
    setText('adminDetectedRate', `${stats.detected_rate}% detected rate`);
    setText('adminPending', stats.pending_approvals);
    renderUsers(users.users || []);
    renderLoginHistory(logins.events || []);
    renderRecentActivity(history.records || []);
    document.getElementById('roleFilter')?.addEventListener('change', () => renderUsers(users.users || []));
    document.getElementById('adminSearch')?.addEventListener('input', () => renderUsers(users.users || []));
    document.getElementById('reviewAccounts')?.addEventListener('click', () => document.querySelector('.admin-management')?.scrollIntoView({ behavior: 'smooth' }));
    document.getElementById('viewLogins')?.addEventListener('click', () => document.getElementById('loginHistoryPanel')?.scrollIntoView({ behavior: 'smooth' }));
}

async function adminFetch(endpoint, options = {}) {
    const token = sessionStorage.getItem('token');
    const apiUrls = [API_BASE_URL, 'http://localhost:8082', 'http://localhost:8081'];
    let lastError = 'Unable to connect to the backend.';
    for (const baseUrl of apiUrls) {
        try {
            const response = await fetch(`${baseUrl}${endpoint}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
            const result = await response.json();
            if (result && (result.success || response.status === 401 || response.status === 403)) return result;
            lastError = result?.error || `Request failed (${response.status}).`;
        } catch (error) {
            lastError = error.message;
        }
    }
    return { success: false, error: lastError };
}

function renderUsers(users) {
    const filter = document.getElementById('roleFilter')?.value || 'all';
    const query = (document.getElementById('adminSearch')?.value || '').toLowerCase();
    const body = document.querySelector('#managedUsersTable tbody');
    const filtered = users.filter(user => (filter === 'all' || user.role === filter) && `${user.name} ${user.email} ${user.institution || ''}`.toLowerCase().includes(query));
    body.innerHTML = filtered.length ? filtered.map(user => `<tr><td><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></td><td><span class="role-pill ${user.role}">${user.role}</span></td><td>${escapeHtml(user.institution || '—')}</td><td>${escapeHtml(user.created_at || '—')}</td><td><span class="status-pill ${user.account_status}">${user.account_status}</span></td><td><select class="status-select" data-user-id="${user.user_id}"><option value="approved" ${user.account_status === 'approved' ? 'selected' : ''}>Approve</option><option value="suspended" ${user.account_status === 'suspended' ? 'selected' : ''}>Suspend</option><option value="revoked" ${user.account_status === 'revoked' ? 'selected' : ''}>Revoke</option></select></td></tr>`).join('') : '<tr><td colspan="6">No matching accounts.</td></tr>';
    body.querySelectorAll('.status-select').forEach(select => select.addEventListener('change', async event => { const result = await adminFetch('/admin/users/status', { method: 'POST', body: JSON.stringify({ user_id: event.target.dataset.userId, status: event.target.value }) }); if (!result.success) { showAdminError(result.error); return; } const user = users.find(item => String(item.user_id) === String(event.target.dataset.userId)); if (user) user.account_status = event.target.value; renderUsers(users); }));
}

function renderLoginHistory(events) {
    const body = document.querySelector('#loginHistoryTable tbody');
    body.innerHTML = events.length ? events.map(event => `<tr><td><strong>${escapeHtml(event.name || 'Unknown user')}</strong></td><td>${escapeHtml(event.email)}</td><td><span class="role-pill ${event.role || ''}">${escapeHtml(event.role || '—')}</span></td><td><span class="status-pill ${event.successful ? 'approved' : 'revoked'}">${event.successful ? 'Successful' : 'Failed'}</span></td><td>${escapeHtml(event.ip_address || '—')}</td><td>${escapeHtml(event.logged_at || '—')}</td></tr>`).join('') : '<tr><td colspan="6">No login events recorded.</td></tr>';
}

function renderRecentActivity(records) {
    const body = document.getElementById('adminRecent');
    body.innerHTML = records.slice(0, 5).map(record => `<div class="admin-activity"><div class="admin-mini-avatar">${escapeHtml((record.patient_name || 'P').slice(0, 2).toUpperCase())}</div><div><strong>${escapeHtml(record.patient_name || 'Patient')}</strong><small>${escapeHtml(record.disease || 'Diagnosis')} · ${escapeHtml(record.date || '')}</small></div><span class="status-pill ${record.result === 'DETECTED' ? 'revoked' : 'approved'}">${escapeHtml(record.result || '—')}</span></div>`).join('') || '<p class="text-secondary">No diagnoses recorded.</p>';
}

function setText(id, value) { const element = document.getElementById(id); if (element) element.textContent = value ?? '—'; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
function showAdminError(message) {
    if (message.toLowerCase().includes('session') || message.toLowerCase().includes('unauthorized')) {
        sessionStorage.clear();
        window.location.href = 'login.html';
        return;
    }
    const existing = document.getElementById('adminError');
    if (existing) existing.textContent = message;
    else alert(message);
}