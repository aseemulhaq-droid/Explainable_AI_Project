// frontend/js/settings.js
document.addEventListener('DOMContentLoaded', () => initSettings());

function initSettings() {
  const nameInput = document.getElementById('displayName');
  const avatarFile = document.getElementById('avatarFile');
  const avatarPreview = document.getElementById('avatarPreview');
  const saveBtn = document.getElementById('saveProfile');
  const resetBtn = document.getElementById('resetProfile');
  const saveMsg = document.getElementById('saveMsg');

  const updateProfile = (name, avatar) => {
    if (name) {
      sessionStorage.setItem('name', name);
      localStorage.setItem('profileName', name);
    }
    if (avatar) {
      sessionStorage.setItem('profileAvatarDataUrl', avatar);
      localStorage.setItem('profileAvatarDataUrl', avatar);
    }
    if (window.renderUserProfile) window.renderUserProfile();
  };

  // populate from storage/session
  const storedName = sessionStorage.getItem('name') || localStorage.getItem('profileName') || '';
  const storedAvatar = localStorage.getItem('profileAvatarDataUrl') || sessionStorage.getItem('profileAvatarDataUrl') || '';
  if (nameInput) nameInput.value = storedName;
  if (avatarPreview) {
    if (storedAvatar) {
      avatarPreview.innerHTML = `<img src="${storedAvatar}" style="width:96px;height:96px;border-radius:50%">`;
    } else {
      avatarPreview.textContent = (storedName && storedName.length>0) ? storedName[0].toUpperCase() : 'U';
    }
  }

  nameInput?.addEventListener('input', () => {
    updateProfile(nameInput.value.trim(), '');
  });

  avatarFile?.addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      updateProfile(nameInput?.value.trim() || '', dataUrl);
      if (avatarPreview) {
        avatarPreview.innerHTML = `<img src="${dataUrl}" style="width:96px;height:96px;border-radius:50%">`;
      }
    };
    reader.readAsDataURL(file);
  });

  saveBtn?.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const avatar = localStorage.getItem('profileAvatarDataUrl') || '';
    updateProfile(name, avatar);

    // attempt to call backend update endpoint if available
    try {
      const res = await authFetch('/update-profile', { method: 'POST', body: JSON.stringify({ name, avatar }) });
      if (res && res.success) {
        saveMsg.textContent = 'Saved to server';
      } else {
        saveMsg.textContent = 'Saved locally';
      }
    } catch (e) {
      saveMsg.textContent = 'Saved locally';
    }

    setTimeout(() => { saveMsg.textContent = ''; }, 2500);
  });

  resetBtn?.addEventListener('click', () => {
    localStorage.removeItem('profileAvatarDataUrl');
    localStorage.removeItem('profileName');
    sessionStorage.removeItem('profileAvatarDataUrl');
    sessionStorage.removeItem('name');
    nameInput.value = '';
    avatarPreview.textContent = 'U';
    updateProfile('', '');
    sessionStorage.removeItem('name');
    sessionStorage.removeItem('profileAvatarDataUrl');
    if (window.renderUserProfile) window.renderUserProfile();
  });
}
