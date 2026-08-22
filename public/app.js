let firebaseInitialized = false;

function initFirebaseFromConfigString(configStr) {
  try {
    const cfg = JSON.parse(configStr);
    if (!firebase.apps.length) {
      firebase.initializeApp(cfg);
    }
    firebaseInitialized = true;
    // register auth state listener after initialization
    if (firebase && firebase.auth) {
      try {
        firebase.auth().onAuthStateChanged(async (user) => {
          updateUserStatus();
          if (user) {
            try {
              // upsert basic profile info on sign-in (do not claim username)
              const token = await user.getIdToken();
              const payload = {
                displayName: user.displayName || null,
                email: user.email || null,
                photoURL: user.photoURL || null,
              };
              await fetch('/users/me', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
            } catch (e) {
              console.warn('Could not upsert profile on sign-in:', e && e.message ? e.message : e);
            }
          }
        });
      } catch (e) { /* ignore */ }
    }
    updateUserStatus();
    return true;
  } catch (e) {
    alert('Invalid Firebase config JSON: ' + e.message);
    return false;
  }
}

async function ensureToken() {
  if (!firebaseInitialized) {
    throw new Error('Firebase not initialized');
  }
  const user = firebase.auth().currentUser;
  if (!user) throw new Error('Not signed in');
  return await user.getIdToken();
}

async function uploadImage(file) {
  const token = await ensureToken();
  const form = new FormData();
  form.append('image', file, file.name);

  const res = await fetch('/cloudinary/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return res.json();
}

async function createRequest(payload) {
  const token = await ensureToken();
  const res = await fetch('/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function loadRequests() {
  const token = await ensureToken();
  const res = await fetch('/requests', { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

async function completeRequest(id) {
  const token = await ensureToken();
  const res = await fetch(`/requests/${id}/complete`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

async function claimRequest(id) {
  const token = await ensureToken();
  const res = await fetch(`/requests/${id}/claim`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

function renderRequests(list) {
  const container = document.getElementById('requestsList');
  container.innerHTML = '';
  const uid = firebase && firebase.auth && firebase.auth().currentUser ? firebase.auth().currentUser.uid : null;
  list.forEach(r => {
    const el = document.createElement('div');
    el.style.border = '1px solid #ddd';
    el.style.padding = '8px';
    el.style.marginBottom = '6px';
    let actions = `<button data-id="${r.id}" class="viewBtn">View</button>`;
    if (r.status === 'completed') {
      actions += ' <em>Completed</em>';
    } else if (r.status === 'claimed') {
      if (r.claimer && uid && r.claimer === uid) {
        actions += ` <button data-id="${r.id}" class="completeBtn">Complete</button>`;
      } else {
        actions += ' <em>Claimed</em>';
      }
    } else {
      actions += ` <button data-id="${r.id}" class="claimBtn">Claim</button>`;
    }
    el.innerHTML = `<strong>${r.location || '(no location)'} [${r.amount || ''}]</strong> — importance:${r.importance} size:${r.size}<div style="margin-top:6px">${actions}</div>`;
    container.appendChild(el);
  });

  container.querySelectorAll('.viewBtn').forEach(b => b.addEventListener('click', async (ev) => {
    const id = ev.target.dataset.id;
    const r = list.find(x => x.id === id);
    const detail = document.getElementById('requestDetail');
    detail.textContent = JSON.stringify(r, null, 2);
  }));

  container.querySelectorAll('.completeBtn').forEach(b => b.addEventListener('click', async (ev) => {
    const id = ev.target.dataset.id;
    const out = document.getElementById('out');
    out.textContent = 'Completing...';
    try {
      const res = await completeRequest(id);
      out.textContent = JSON.stringify(res, null, 2);
      await refreshRequests();
    } catch (e) { out.textContent = 'Complete failed: ' + e.message; }
  }));

  container.querySelectorAll('.claimBtn').forEach(b => b.addEventListener('click', async (ev) => {
    const id = ev.target.dataset.id;
    const out = document.getElementById('out');
    out.textContent = 'Claiming...';
    try {
      const res = await claimRequest(id);
      out.textContent = JSON.stringify(res, null, 2);
      await refreshRequests();
    } catch (e) { out.textContent = 'Claim failed: ' + e.message; }
  }));
}

async function refreshRequests() {
  try {
    const list = await loadRequests();
    renderRequests(list.filter(r => r.status !== 'completed'));
  } catch (e) { console.error('Could not load requests', e); }
}

async function getProfile() {
  const token = await ensureToken();
  const res = await fetch('/users/me', { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

async function updateProfile(data) {
  const token = await ensureToken();
  const res = await fetch('/users/me', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  return res.json();
}

const toggleBtn = document.getElementById('toggleConfig');
if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    const box = document.getElementById('configBox');
    if (!box) return;
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
  });
}

const initBtn = document.getElementById('initFirebase');
if (initBtn) {
  initBtn.addEventListener('click', () => {
    const txt = document.getElementById('fbConfig').value.trim();
    if (!txt) return alert('Paste Firebase config JSON first');
    initFirebaseFromConfigString(txt);
  });
}

document.getElementById('googleSignIn').addEventListener('click', async () => {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await firebase.auth().signInWithPopup(provider);
    updateUserStatus();
  } catch (e) { alert('Sign in failed: ' + e.message); }
});

document.getElementById('emailSignUp').addEventListener('click', async () => {
  try {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) return alert('Provide email and password');
    await firebase.auth().createUserWithEmailAndPassword(email, password);
    updateUserStatus();
  } catch (e) { alert('Sign up failed: ' + e.message); }
});

document.getElementById('emailSignIn').addEventListener('click', async () => {
  try {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) return alert('Provide email and password');
    await firebase.auth().signInWithEmailAndPassword(email, password);
    updateUserStatus();
  } catch (e) { alert('Sign in failed: ' + e.message); }
});

document.getElementById('signOut').addEventListener('click', async () => {
  try { await firebase.auth().signOut(); updateUserStatus(); } catch (e) { console.error(e); }
});

async function doUpload() {
  const input = document.getElementById('image');
  const out = document.getElementById('out');
  if (!input.files.length) return alert('Choose an image file');
  out.textContent = 'Uploading...';
  try {
    const meta = await uploadImage(input.files[0]);
    out.textContent = JSON.stringify(meta, null, 2);
    window._lastImage = meta;
  } catch (e) {
    out.textContent = 'Upload failed: ' + e.message;
  }
}

async function doCreate() {
  const out = document.getElementById('out');
  const payload = {
    location: document.getElementById('location').value || null,
    size: document.getElementById('size').value || null,
    description: document.getElementById('description').value || null,
    importance: document.getElementById('importance').value || null,
    amount: document.getElementById('amount').value || null,
    image: window._lastImage || null,
  };
  out.textContent = 'Creating request...';
  try {
    const result = await createRequest(payload);
    out.textContent = JSON.stringify(result, null, 2);
  } catch (e) {
    out.textContent = 'Create failed: ' + e.message;
  }
}

document.getElementById('uploadBtn').addEventListener('click', doUpload);
document.getElementById('createBtn').addEventListener('click', doCreate);
document.getElementById('loadProfileBtn').addEventListener('click', async () => {
  const out = document.getElementById('out');
  out.textContent = 'Loading profile...';
  try {
    const data = await getProfile();
    document.getElementById('profileDisplayName').value = data.profile && data.profile.displayName ? data.profile.displayName : '';
    document.getElementById('profileUsername').value = data.profile && data.profile.username ? data.profile.username : '';
    document.getElementById('profileBio').value = data.profile && data.profile.bio ? data.profile.bio : '';
    out.textContent = 'Profile loaded';
    // show profile photo if present
    const img = document.getElementById('profilePhotoPreview');
    if (data.profile && data.profile.photo && data.profile.photo.url) {
      img.src = data.profile.photo.url;
      img.style.display = 'block';
    } else { img.style.display = 'none'; }
  } catch (e) { out.textContent = 'Load failed: ' + e.message; }
});

document.getElementById('updateProfileBtn').addEventListener('click', async () => {
  const out = document.getElementById('out');
  const payload = {
    displayName: document.getElementById('profileDisplayName').value || null,
    username: document.getElementById('profileUsername').value || null,
    bio: document.getElementById('profileBio').value || null,
  };
  out.textContent = 'Updating profile...';
  try {
    const r = await updateProfile(payload);
    out.textContent = JSON.stringify(r, null, 2);
  } catch (e) { out.textContent = 'Update failed: ' + e.message; }
});

document.getElementById('uploadProfilePhotoBtn').addEventListener('click', async () => {
  const input = document.getElementById('profilePhoto');
  const out = document.getElementById('out');
  if (!input.files.length) return alert('Choose an image file');
  out.textContent = 'Uploading profile photo...';
  try {
    const token = await ensureToken();
    const form = new FormData();
    form.append('image', input.files[0], input.files[0].name);
    const res = await fetch('/users/me/photo', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    const meta = await res.json();
    out.textContent = JSON.stringify(meta, null, 2);
    const img = document.getElementById('profilePhotoPreview');
    if (meta && meta.url) { img.src = meta.url; img.style.display = 'block'; }
  } catch (e) { out.textContent = 'Upload failed: ' + e.message; }
});

// refresh requests on load and when auth changes
loadClientConfigAuto();
setTimeout(() => refreshRequests(), 500);

function updateUserStatus() {
  const el = document.getElementById('userStatus');
  if (!firebaseInitialized) { el.textContent = 'Firebase not initialized'; return; }
  const u = firebase.auth().currentUser;
  if (!u) { el.textContent = 'Not signed in'; return; }
  el.textContent = `Signed in: ${u.uid}${u.email ? ' ('+u.email+')' : ''}`;
}

// auth state listener is registered after init to avoid no-app errors

// Auto-load client firebase config from public/firebase-config.json if present
async function loadClientConfigAuto() {
  try {
    const res = await fetch('/firebase-config.json');
    if (!res.ok) return;
    const cfg = await res.json();
    const txt = JSON.stringify(cfg, null, 2);
    const area = document.getElementById('fbConfig');
    if (area && !area.value.trim()) area.value = txt;
    // initialize automatically
    if (!firebaseInitialized) initFirebaseFromConfigString(txt);
  } catch (e) {
    // ignore
  }
}

loadClientConfigAuto();
