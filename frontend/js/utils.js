// frontend/js/utils.js

const API_BASE_URL = localStorage.getItem('apiBaseUrl') || 'http://localhost:8081';

/**
 * Enhanced fetch wrapper that attaches Bearer token and handles 401s.
 */
async function authFetch(endpoint, options = {}) {
    const token = sessionStorage.getItem('token');
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        ...options,
        headers
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        
        if (response.status === 401) {
            // Session expired or invalid token
            sessionStorage.clear();
            window.location.href = 'login.html';
            return { success: false, error: 'Session expired. Please log in again.' };
        }
        
        const data = await response.json();
        return data;
    } catch (err) {
        console.error('Fetch error:', err);
        return { success: false, error: 'Network error occurred.' };
    }
}

/**
 * Validates range-based inputs. Highlights invalid fields.
 */
function validateForm(formElement) {
    let isValid = true;
    const inputs = formElement.querySelectorAll('input[type="number"]');
    
    inputs.forEach(input => {
        if (input.value === '') {
            input.style.borderColor = 'var(--accent-red)';
            isValid = false;
        } else {
            input.style.borderColor = 'rgba(255,255,255,0.1)';
        }
    });
    
    return isValid;
}

function showAuthError(message) {
    clearAuthSuccess();
    const errorAlert = document.getElementById('errorAlert');
    if (errorAlert) {
        errorAlert.textContent = message;
        errorAlert.classList.remove('hidden');
    } else {
        alert(message);
    }
}

function showAuthSuccess(message) {
    clearAuthError();
    const successAlert = document.getElementById('successAlert');
    if (successAlert) {
        successAlert.textContent = message;
        successAlert.classList.remove('hidden');
    }
}

function clearAuthError() {
    const errorAlert = document.getElementById('errorAlert');
    if (errorAlert) {
        errorAlert.classList.add('hidden');
        errorAlert.textContent = '';
    }
}

function clearAuthSuccess() {
    const successAlert = document.getElementById('successAlert');
    if (successAlert) {
        successAlert.classList.add('hidden');
        successAlert.textContent = '';
    }
}

function clearAuthAlerts() {
    clearAuthError();
    clearAuthSuccess();
}

function requireAuth() {
    if (!sessionStorage.getItem('token')) {
        window.location.href = 'login.html';
    }
}

function logout() {
    authFetch('/logout', { method: 'POST' }).then(() => {
        sessionStorage.clear();
        window.location.href = 'login.html';
    });
}

// Highlight active nav link in sidebar based on current location
function highlightActiveNav() {
    try {
        const links = document.querySelectorAll('.nav-links a');
        if (!links || links.length === 0) return;
        const current = window.location.pathname.split('/').pop();
        links.forEach(a => {
            try {
                const href = a.getAttribute('href') || '';
                const hrefFile = href.split('/').pop();
                if (hrefFile === current || (current === '' && (hrefFile === 'index.html' || hrefFile === 'dashboard-doctor.html'))) {
                    a.classList.add('active');
                } else {
                    a.classList.remove('active');
                }
            } catch (e) {}
        });
    } catch (e) { }
}

// Normalize sidebar navs: merge duplicate nav-links in the same aside
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadIncludes();
    } catch (e) { /* ignore */ }
    normalizeSidebars();
    configureSidebarForRole();
    highlightActiveNav();
    renderUserProfile();
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
});

async function loadIncludes() {
    try {
        const els = Array.from(document.querySelectorAll('[data-include]'));
        await Promise.all(els.map(async (el) => {
            const url = el.getAttribute('data-include');
            if (!url) return;
            try {
                const res = await fetch(url);
                if (!res.ok) return;
                const html = await res.text();
                el.innerHTML = html;
            } catch (e) { console.warn('include fetch failed', url, e); }
        }));
    } catch (e) { console.warn('loadIncludes failed', e); }
}

function normalizeSidebars() {
    try {
        const asides = document.querySelectorAll('aside');
        asides.forEach(aside => {
            const navs = Array.from(aside.querySelectorAll('.nav-links'));
            if (navs.length <= 1) return;
            // collect unique links by href text
            const seen = new Map();
            navs.forEach(nav => {
                Array.from(nav.querySelectorAll('a')).forEach(a => {
                    const href = a.getAttribute('href') || '';
                    const text = (a.textContent || '').trim();
                    const key = href + '||' + text;
                    if (!seen.has(key)) seen.set(key, a.cloneNode(true));
                });
            });
            // create a single merged nav-links
            const merged = document.createElement('nav');
            merged.className = 'nav-links';
            merged.style.flexDirection = 'column';
            merged.style.gap = '12px';
            merged.style.marginTop = '12px';
            seen.forEach(a => merged.appendChild(a));
            // remove old navs and insert merged at the position of the first nav
            const firstNav = navs[0];
            firstNav.parentNode.insertBefore(merged, firstNav);
            navs.forEach(n => n.remove());
        });
        // after merge, re-run highlight to ensure only one active item exists
        highlightActiveNav();
    } catch (e) { console.warn('normalizeSidebars failed', e); }
}


function configureSidebarForRole() {
    const role = (sessionStorage.getItem('role') || 'doctor').toLowerCase();
    document.querySelectorAll('.nav-item[data-role]').forEach(link => {
        const roles = link.dataset.role.split(/\s+/);
        if (!roles.includes(role)) {
            link.classList.add('hidden');
        } else {
            link.classList.remove('hidden');
        }
    });
}
// Render user avatar and name in any sidebar elements
function renderUserProfile() {
    try {
        const name = sessionStorage.getItem('name') || localStorage.getItem('profileName') || 'User';
        const avatar = sessionStorage.getItem('profileAvatarDataUrl') || localStorage.getItem('profileAvatarDataUrl') || '';
        // main header name
        const userNameEls = document.querySelectorAll('#userName, #sidebarUserName');
        userNameEls.forEach(el => { el.textContent = name; });

        const avatarEls = document.querySelectorAll('#sidebarAvatar, #avatarPreview');
        avatarEls.forEach(el => {
            if (avatar && avatar.length > 20) {
                el.innerHTML = `<img src="${avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover">`;
            } else {
                el.textContent = name && name.length>0 ? name[0].toUpperCase() : 'U';
            }
        });

        const roleEls = document.querySelectorAll('#sidebarUserRole');
        roleEls.forEach(el => {
            const raw = sessionStorage.getItem('role') || 'doctor';
            const role = raw.toString().toLowerCase();
            el.textContent = role.charAt(0).toUpperCase() + role.slice(1);
        });
    } catch (e) { console.warn('renderUserProfile failed', e); }
}

document.addEventListener('DOMContentLoaded', () => { renderUserProfile(); });

// expose for other scripts
window.renderUserProfile = renderUserProfile;
