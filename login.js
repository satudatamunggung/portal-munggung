// ═══════════════════════════════════════════════════════
//  SIP Desa Munggung — login.js (FIREBASE REALTIME DB)
//  Akun tersimpan di Firebase → bisa login dari HP/PC mana saja
// ═══════════════════════════════════════════════════════

// ── Konfigurasi Firebase (sama dengan peta2.js) ────────
const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyBxgTeHMufBFLETnMXN-aKmWcNzW8_4okQ",
    authDomain:        "portalmunggung.firebaseapp.com",
    databaseURL:       "https://portalmunggung-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId:         "portalmunggung",
    storageBucket:     "portalmunggung.firebasestorage.app",
    messagingSenderId: "310551148504",
    appId:             "1:310551148504:web:46cb0e036fdf95324be4ad",
    measurementId:     "G-R9W5ETBQKX"
};

// ── Inisialisasi Firebase ──────────────────────────────
let _fbApp = null, _fbDB = null;

function _initFirebase() {
    if (_fbApp) return true;
    try {
        if (typeof firebase === 'undefined') {
            console.error('Firebase SDK belum dimuat. Pastikan script Firebase ada di login.html');
            return false;
        }
        // Cegah duplikat init jika sudah ada app lain (misal dari peta2.js)
        if (firebase.apps && firebase.apps.length > 0) {
            _fbApp = firebase.apps[0];
        } else {
            _fbApp = firebase.initializeApp(FIREBASE_CONFIG);
        }
        _fbDB = firebase.database();
        console.log('🔥 Firebase login terhubung.');
        return true;
    } catch (e) {
        console.error('Firebase init error:', e);
        return false;
    }
}

// ── Hash SHA-256 (async, native browser) ──────────────
async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Kredensial Super User ──────────────────────────────
// Hash dari 'admin2026' — ganti jika ingin password berbeda
// Cara generate: buka console browser, ketik: sha256('passwordbaru').then(console.log)
const SUPER_USERNAME = 'admin';
const SUPER_HASH     = '6051fc84a7a0d74c225fb18a496b09952da5642e60723ecae543298edd7d82d6';

// ── Session helpers (expiry 8 jam) ────────────────────
const SESSION_KEY   = 'sip_session';
const SESSION_HOURS = 8;

function saveSession(data) {
    const payload = {
        ...data,
        loginTime : new Date().toISOString(),
        expiresAt : new Date(Date.now() + SESSION_HOURS * 3600000).toISOString()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

function getSession() {
    try {
        const s = JSON.parse(localStorage.getItem(SESSION_KEY));
        if (!s) return null;
        if (new Date() > new Date(s.expiresAt)) {
            localStorage.removeItem(SESSION_KEY);
            return null;
        }
        return s;
    } catch { return null; }
}

// ── Brute-force throttle ──────────────────────────────
const FAIL_KEY  = 'sip_fail';
const MAX_FAILS = 5;
const LOCK_MIN  = 10;

function getFailData()  { try { return JSON.parse(localStorage.getItem(FAIL_KEY) || '{}'); } catch { return {}; } }
function recordFail()   { const d = getFailData(); d.count = (d.count || 0) + 1; d.lastFail = Date.now(); localStorage.setItem(FAIL_KEY, JSON.stringify(d)); }
function resetFail()    { localStorage.removeItem(FAIL_KEY); }
function isLocked() {
    const d = getFailData();
    if ((d.count || 0) < MAX_FAILS) return false;
    const elapsed = (Date.now() - (d.lastFail || 0)) / 60000;
    if (elapsed > LOCK_MIN) { resetFail(); return false; }
    return Math.ceil(LOCK_MIN - elapsed);
}

// ══════════════════════════════════════════════════════
//  FIREBASE USER HELPERS
// ══════════════════════════════════════════════════════

// Cari user berdasarkan username ATAU email di Firebase
async function findUserInFirebase(identifier) {
    if (!_fbDB) return null;
    try {
        // Cari by username
        const byUsername = await _fbDB.ref('sip_users').orderByChild('username').equalTo(identifier).once('value');
        if (byUsername.exists()) {
            const data = byUsername.val();
            const key = Object.keys(data)[0];
            return { _key: key, ...data[key] };
        }
        // Cari by email
        const byEmail = await _fbDB.ref('sip_users').orderByChild('email').equalTo(identifier).once('value');
        if (byEmail.exists()) {
            const data = byEmail.val();
            const key = Object.keys(data)[0];
            return { _key: key, ...data[key] };
        }
        return null;
    } catch (e) {
        console.error('findUser error:', e);
        return null;
    }
}

// Cek apakah username sudah dipakai
async function isUsernameTaken(username) {
    if (!_fbDB) return false;
    const snap = await _fbDB.ref('sip_users').orderByChild('username').equalTo(username).once('value');
    return snap.exists();
}

// Cek apakah email sudah dipakai
async function isEmailTaken(email) {
    if (!_fbDB) return false;
    const snap = await _fbDB.ref('sip_users').orderByChild('email').equalTo(email).once('value');
    return snap.exists();
}

// Simpan user baru ke Firebase
async function saveUserToFirebase(userData) {
    if (!_fbDB) return false;
    try {
        await _fbDB.ref('sip_users').push(userData);
        return true;
    } catch (e) {
        console.error('saveUser error:', e);
        return false;
    }
}

// ══════════════════════════════════════════════════════
//  UI STATE
// ══════════════════════════════════════════════════════
let currentRole = 'user', currentMode = 'login';

function setMode(m) {
    currentMode = m;
    document.getElementById('panel-login').style.display    = m === 'login'    ? '' : 'none';
    document.getElementById('panel-register').style.display = m === 'register' ? '' : 'none';
    document.getElementById('mode-login').classList.toggle('active',    m === 'login');
    document.getElementById('mode-register').classList.toggle('active', m === 'register');
    clearAlerts();
}

function switchRole(r) {
    currentRole = r;
    const ru = document.getElementById('role-user'), rs = document.getElementById('role-super'),
          sb = document.getElementById('su-badge'),  bl = document.getElementById('btn-login');
    clearAlerts();
    if (r === 'superuser') {
        ru.classList.remove('active'); rs.classList.add('active', 'super-active');
        sb.classList.add('show'); bl.className = 'btn-submit super-btn';
    } else {
        rs.classList.remove('active', 'super-active'); ru.classList.add('active');
        sb.classList.remove('show'); bl.className = 'btn-submit user-btn';
    }
}

function togglePw(id, btn) {
    const i = document.getElementById(id);
    i.type = i.type === 'password' ? 'text' : 'password';
    btn.textContent = i.type === 'password' ? '👁️' : '🙈';
}

function checkStrength(v) {
    const el = document.getElementById('pw-strength'); el.className = 'pw-strength';
    if (!v) return;
    if (v.length < 4) { el.classList.add('weak'); return; }
    const s = v.length >= 8 && /[A-Z]/.test(v) && /[0-9]/.test(v), m = v.length >= 6;
    el.classList.add(s ? 'strong' : m ? 'medium' : 'weak');
}

function clearAlerts() {
    ['login-error', 'login-success', 'reg-error', 'reg-success'].forEach(id => {
        const e = document.getElementById(id); if (e) e.style.display = 'none';
    });
}

function showAlert(id, msgId, msg) {
    clearAlerts();
    const el = document.getElementById(id);
    document.getElementById(msgId).textContent = msg;
    el.style.display = 'flex'; el.style.animation = 'none';
    requestAnimationFrame(() => { el.style.animation = 'shake 0.4s ease'; });
}

function setLoading(btnId, spId, txtId, on) {
    document.getElementById(btnId).disabled = on;
    document.getElementById(spId).style.display  = on ? 'block' : 'none';
    document.getElementById(txtId).style.display = on ? 'none'  : '';
}

// ══════════════════════════════════════════════════════
//  LOGIN
// ══════════════════════════════════════════════════════
async function doLogin() {
    clearAlerts();

    const lockMin = isLocked();
    if (lockMin) {
        showAlert('login-error', 'login-error-msg', `Terlalu banyak percobaan gagal. Coba lagi dalam ${lockMin} menit.`);
        return;
    }

    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value;
    if (!u || !p) { showAlert('login-error', 'login-error-msg', 'Username/email dan password wajib diisi!'); return; }

    setLoading('btn-login', 'login-spinner', 'login-btn-text', true);

    const hashed = await sha256(p);

    // ── Super User (tetap lokal, tidak perlu Firebase) ──
    if (currentRole === 'superuser') {
        if ((u === SUPER_USERNAME || u === 'admin') && hashed === SUPER_HASH) {
            resetFail();
            saveSession({ username: 'admin', role: 'superuser' });
            showAlert('login-success', 'login-success-msg', 'Login Administrator berhasil! Mengalihkan…');
            setTimeout(() => { window.location.href = 'beranda.html'; }, 1400);
        } else {
            recordFail();
            setLoading('btn-login', 'login-spinner', 'login-btn-text', false);
            showAlert('login-error', 'login-error-msg', 'Kredensial Administrator salah!');
        }
        return;
    }

    // ── User biasa — cek di Firebase ──
    if (!_fbDB) {
        setLoading('btn-login', 'login-spinner', 'login-btn-text', false);
        showAlert('login-error', 'login-error-msg', 'Koneksi ke database gagal. Periksa koneksi internet Anda.');
        return;
    }

    try {
        const acc = await findUserInFirebase(u.toLowerCase());

        if (!acc) {
            recordFail();
            setLoading('btn-login', 'login-spinner', 'login-btn-text', false);
            showAlert('login-error', 'login-error-msg', 'Akun tidak ditemukan. Silakan daftar terlebih dahulu.');
            return;
        }

        if (acc.passwordHash !== hashed) {
            recordFail();
            setLoading('btn-login', 'login-spinner', 'login-btn-text', false);
            showAlert('login-error', 'login-error-msg', 'Password salah!');
            return;
        }

        resetFail();
        saveSession({ username: acc.username, role: 'user', name: acc.name });
        showAlert('login-success', 'login-success-msg', `Selamat datang, ${acc.name}! Mengalihkan…`);
        setTimeout(() => { window.location.href = 'beranda.html'; }, 1400);

    } catch (e) {
        setLoading('btn-login', 'login-spinner', 'login-btn-text', false);
        showAlert('login-error', 'login-error-msg', 'Terjadi kesalahan. Periksa koneksi internet Anda.');
        console.error('Login error:', e);
    }
}

// ── MASUK SEBAGAI TAMU ────────────────────────────────
function doGuestLogin() {
    saveSession({ username: 'tamu', role: 'guest', name: 'Tamu' });
    showAlert('login-success', 'login-success-msg', 'Masuk sebagai Tamu. Mengalihkan…');
    setTimeout(() => { window.location.href = 'beranda.html'; }, 1200);
}

// ══════════════════════════════════════════════════════
//  REGISTER
// ══════════════════════════════════════════════════════
async function doRegister() {
    clearAlerts();
    const name  = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const uname = document.getElementById('reg-username').value.trim().toLowerCase();
    const pw    = document.getElementById('reg-password').value;
    const cf    = document.getElementById('reg-confirm').value;

    // Validasi lokal dulu (cepat, tanpa internet)
    if (!name || !email || !uname || !pw || !cf) {
        showAlert('reg-error', 'reg-error-msg', 'Semua kolom wajib diisi!'); return;
    }
    if (!email.endsWith('@gmail.com')) {
        showAlert('reg-error', 'reg-error-msg', 'Email harus menggunakan @gmail.com!');
        document.getElementById('reg-email').classList.add('error-input'); return;
    }
    document.getElementById('reg-email').classList.remove('error-input');
    if (uname.length < 3 || !/^[a-z0-9_]+$/.test(uname)) {
        showAlert('reg-error', 'reg-error-msg', 'Username minimal 3 karakter, hanya huruf kecil, angka, dan underscore.'); return;
    }
    if (pw.length < 6) { showAlert('reg-error', 'reg-error-msg', 'Password minimal 6 karakter!'); return; }
    if (pw !== cf)     { showAlert('reg-error', 'reg-error-msg', 'Konfirmasi password tidak cocok!'); return; }

    if (!_fbDB) {
        showAlert('reg-error', 'reg-error-msg', 'Koneksi ke database gagal. Periksa koneksi internet Anda.');
        return;
    }

    setLoading('btn-register', 'reg-spinner', 'reg-btn-text', true);

    try {
        // Cek duplikat username & email di Firebase
        const [usernameTaken, emailTaken] = await Promise.all([
            isUsernameTaken(uname),
            isEmailTaken(email)
        ]);

        if (usernameTaken) {
            setLoading('btn-register', 'reg-spinner', 'reg-btn-text', false);
            showAlert('reg-error', 'reg-error-msg', 'Username sudah digunakan! Pilih username lain.');
            return;
        }
        if (emailTaken) {
            setLoading('btn-register', 'reg-spinner', 'reg-btn-text', false);
            showAlert('reg-error', 'reg-error-msg', 'Email ini sudah terdaftar!');
            return;
        }

        const passwordHash = await sha256(pw);

        const ok = await saveUserToFirebase({
            name,
            email,
            username: uname,
            passwordHash,
            createdAt: new Date().toISOString()
        });

        if (!ok) throw new Error('Gagal simpan ke Firebase');

        setLoading('btn-register', 'reg-spinner', 'reg-btn-text', false);
        showAlert('reg-success', 'reg-success-msg', 'Pendaftaran berhasil! Sekarang Anda bisa login dari perangkat mana saja.');
        ['reg-name', 'reg-email', 'reg-username', 'reg-password', 'reg-confirm'].forEach(id => {
            document.getElementById(id).value = '';
        });
        document.getElementById('pw-strength').className = 'pw-strength';
        setTimeout(() => setMode('login'), 1800);

    } catch (e) {
        setLoading('btn-register', 'reg-spinner', 'reg-btn-text', false);
        showAlert('reg-error', 'reg-error-msg', 'Terjadi kesalahan saat mendaftar. Coba lagi.');
        console.error('Register error:', e);
    }
}

// ══════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
    // Inisialisasi Firebase
    _initFirebase();

    // Jika sudah login & session masih valid, langsung redirect
    if (getSession()) window.location.href = 'beranda.html';
});
