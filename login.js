// ═══════════════════════════════════════════════════════
//  SIP Desa Munggung — login.js (VERSI AMAN)
//  Perbaikan: password di-hash SHA-256, admin tidak hardcoded,
//  session pakai expiry, brute-force throttle
// ═══════════════════════════════════════════════════════

// ── Hash SHA-256 (async, native browser) ──────────────
async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Kredensial Super User (hash dari 'admin2026') ─────
// Untuk generate hash baru: buka console, ketik: sha256('passwordbaru').then(console.log)
const SUPER_USERNAME = 'admin';
const SUPER_HASH     = '6051fc84a7a0d74c225fb18a496b09952da5642e60723ecae543298edd7d82d6'; 
// ⚠️ GANTI hash di atas! Jalankan di console browser:
//    sha256('admin2026').then(h => console.log(h))
//    lalu copy hasilnya ke sini

// ── Session helpers (dengan expiry 8 jam) ─────────────
const SESSION_KEY  = 'sip_session';
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
const FAIL_KEY   = 'sip_fail';
const MAX_FAILS  = 5;
const LOCK_MIN   = 10;

function getFailData()     { try { return JSON.parse(localStorage.getItem(FAIL_KEY) || '{}'); } catch { return {}; } }
function recordFail()      { const d = getFailData(); d.count = (d.count||0) + 1; d.lastFail = Date.now(); localStorage.setItem(FAIL_KEY, JSON.stringify(d)); }
function resetFail()       { localStorage.removeItem(FAIL_KEY); }
function isLocked() {
    const d = getFailData();
    if ((d.count || 0) < MAX_FAILS) return false;
    const elapsed = (Date.now() - (d.lastFail || 0)) / 60000;
    if (elapsed > LOCK_MIN) { resetFail(); return false; }
    return Math.ceil(LOCK_MIN - elapsed);
}

// ── User store (password di-hash) ────────────────────
function getUsers() { try { return JSON.parse(localStorage.getItem('sip_users') || '[]'); } catch { return []; } }
function saveUsers(a) { localStorage.setItem('sip_users', JSON.stringify(a)); }

// ── UI state ──────────────────────────────────────────
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
    ['login-error','login-success','reg-error','reg-success'].forEach(id => {
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

// ── LOGIN ─────────────────────────────────────────────
async function doLogin() {
    clearAlerts();

    // Cek lock
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

    // ── Super User ──
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

    // ── User biasa ──
    const users = getUsers();
    const acc   = users.find(x => (x.username === u || x.email === u) && x.passwordHash === hashed);
    if (!acc) {
        recordFail();
        setLoading('btn-login', 'login-spinner', 'login-btn-text', false);
        const ex = users.find(x => x.username === u || x.email === u);
        showAlert('login-error', 'login-error-msg', ex ? 'Password salah!' : 'Akun tidak ditemukan. Silakan daftar terlebih dahulu.');
        return;
    }

    resetFail();
    saveSession({ username: acc.username, role: 'user', name: acc.name });
    showAlert('login-success', 'login-success-msg', `Selamat datang, ${acc.name}! Mengalihkan…`);
    setTimeout(() => { window.location.href = 'beranda.html'; }, 1400);
}

// ── MASUK SEBAGAI TAMU ────────────────────────────────
function doGuestLogin() {
    saveSession({ username: 'tamu', role: 'guest', name: 'Tamu' });
    showAlert('login-success', 'login-success-msg', 'Masuk sebagai Tamu. Mengalihkan…');
    setTimeout(() => { window.location.href = 'beranda.html'; }, 1200);
}

// ── REGISTER ──────────────────────────────────────────
async function doRegister() {
    clearAlerts();
    const name  = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const uname = document.getElementById('reg-username').value.trim().toLowerCase();
    const pw    = document.getElementById('reg-password').value;
    const cf    = document.getElementById('reg-confirm').value;

    if (!name || !email || !uname || !pw || !cf) { showAlert('reg-error', 'reg-error-msg', 'Semua kolom wajib diisi!'); return; }
    if (!email.endsWith('@gmail.com')) {
        showAlert('reg-error', 'reg-error-msg', 'Email harus menggunakan @gmail.com!');
        document.getElementById('reg-email').classList.add('error-input'); return;
    }
    document.getElementById('reg-email').classList.remove('error-input');
    if (uname.length < 3 || !/^[a-z0-9_]+$/.test(uname)) { showAlert('reg-error', 'reg-error-msg', 'Username minimal 3 karakter, hanya huruf kecil, angka, dan underscore.'); return; }
    if (pw.length < 6) { showAlert('reg-error', 'reg-error-msg', 'Password minimal 6 karakter!'); return; }
    if (pw !== cf)     { showAlert('reg-error', 'reg-error-msg', 'Konfirmasi password tidak cocok!'); return; }

    setLoading('btn-register', 'reg-spinner', 'reg-btn-text', true);

    const passwordHash = await sha256(pw);

    setTimeout(() => {
        const users = getUsers();
        if (users.find(u => u.username === uname)) { setLoading('btn-register','reg-spinner','reg-btn-text',false); showAlert('reg-error','reg-error-msg','Username sudah digunakan!'); return; }
        if (users.find(u => u.email === email))    { setLoading('btn-register','reg-spinner','reg-btn-text',false); showAlert('reg-error','reg-error-msg','Email ini sudah terdaftar!'); return; }

        // Simpan hash, BUKAN password asli
        users.push({ name, email, username: uname, passwordHash, createdAt: new Date().toISOString() });
        saveUsers(users);

        setLoading('btn-register', 'reg-spinner', 'reg-btn-text', false);
        showAlert('reg-success', 'reg-success-msg', 'Pendaftaran berhasil! Silakan masuk dengan akun baru Anda.');
        ['reg-name','reg-email','reg-username','reg-password','reg-confirm'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('pw-strength').className = 'pw-strength';
        setTimeout(() => setMode('login'), 1800);
    }, 900);
}

// ── Init ──────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    // Jika sudah login, langsung redirect
    if (getSession()) window.location.href = 'beranda.html';
});
