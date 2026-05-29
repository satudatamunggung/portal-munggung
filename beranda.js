// ═══════════════════════════════════════════════════════
//  SIP Desa Munggung — beranda.js
//  Statistik pengunjung REALTIME via Firebase RTDB
// ═══════════════════════════════════════════════════════

// ── Konfigurasi Firebase (sama dengan peta2.js & login.js) ──
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
        if (typeof firebase === 'undefined') return false;
        if (firebase.apps && firebase.apps.length > 0) {
            _fbApp = firebase.apps[0];
        } else {
            _fbApp = firebase.initializeApp(FIREBASE_CONFIG);
        }
        _fbDB = firebase.database();
        return true;
    } catch (e) {
        console.error('Firebase init error:', e);
        return false;
    }
}

// ══════════════════════════════════════════════════════
//  STATISTIK PENGUNJUNG — REALTIME FIREBASE
// ══════════════════════════════════════════════════════
function initVisitorStats() {
    if (!_fbDB) {
        console.warn('Firebase tidak tersedia, statistik tidak akan realtime.');
        _fallbackLocalStats();
        return;
    }

    const SESSION_START = 'sip_session_start';

    // ── Tab ID unik per page load ──────────────────
    // Selalu generate baru agar setiap tab/halaman punya presence node sendiri.
    // Tidak pakai sessionStorage supaya tab duplikat (Ctrl+T) tetap dapat ID berbeda.
    const tabId = 'tab_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem('sip_tab_id', tabId);

    // ── Waktu mulai sesi ───────────────────────────
    if (!sessionStorage.getItem(SESSION_START)) {
        sessionStorage.setItem(SESSION_START, Date.now());
    }

    // ── Helper: ambil tanggal hari ini (WIB UTC+7) ────────────
    function getTodayStr() {
        const now = new Date();
        // Gunakan offset WIB agar reset tepat tengah malam lokal
        const wib = new Date(now.getTime() + (7 * 60 * 60 * 1000));
        return wib.toISOString().slice(0, 10); // "2026-05-30"
    }

    // ── Listener harian — disimpan agar bisa di-off saat ganti hari ──
    let _dailyListenerRef = null;
    let _activeTodayStr   = null;

    function attachDailyListener(dateStr) {
        // Lepas listener lama jika ada
        if (_dailyListenerRef) {
            _dailyListenerRef.off('value');
        }
        _activeTodayStr  = dateStr;
        _dailyListenerRef = _fbDB.ref(`stats/daily/${dateStr}`);
        _dailyListenerRef.on('value', snap => {
            _animateCount(document.getElementById('stat-today'), snap.val() || 0);
        });
    }

    // ── Presence + pencatatan kunjungan ───────────
    // Keduanya digabung: kunjungan dicatat saat presence berhasil konek ke Firebase.
    // Ini menghindari konflik dengan sip_counted yang mungkin sudah di-set script.js.
    const presenceRef = _fbDB.ref(`stats/presence/${tabId}`);
    const connectedRef = _fbDB.ref('.info/connected');

    connectedRef.on('value', snap => {
        if (!snap.val()) return;

        // Tulis data presence, hapus otomatis saat disconnect
        presenceRef.onDisconnect().remove();
        presenceRef.set({
            ts: firebase.database.ServerValue.TIMESTAMP,
            role: _getCurrentRole()
        });

        // ── Catat kunjungan (1x per tab, pakai key unik per tabId) ──
        // Menggunakan key unik agar tidak bentrok dengan sip_counted dari script.js
        const countKey = `sip_visit_counted_${tabId}`;
        if (!sessionStorage.getItem(countKey)) {
            sessionStorage.setItem(countKey, '1');

            const todayStr = getTodayStr();
            sessionStorage.setItem('sip_counted_date', todayStr);

            // Total kunjungan — increment atomic
            _fbDB.ref('stats/total').transaction(val => (val || 0) + 1);

            // Kunjungan hari ini — increment atomic, simpan per tanggal
            _fbDB.ref(`stats/daily/${todayStr}`).transaction(val => (val || 0) + 1);
        }
    });

    // ── Listener realtime: update UI langsung saat data berubah ──

    // Total pengunjung
    _fbDB.ref('stats/total').on('value', snap => {
        _animateCount(document.getElementById('stat-total'), snap.val() || 0);
    });

    // Hari ini — pasang listener untuk tanggal sekarang
    attachDailyListener(getTodayStr());

    // Sedang online — hitung jumlah presence aktif
    _fbDB.ref('stats/presence').on('value', snap => {
        const count = snap.exists() ? Object.keys(snap.val()).length : 0;
        _animateCount(document.getElementById('stat-online-num'), count);
    });

    // ── Durasi sesi (lokal, update tiap detik) ────
    setInterval(() => {
        const durEl = document.getElementById('stat-duration');
        if (!durEl) return;
        const elapsed = Date.now() - parseInt(sessionStorage.getItem(SESSION_START) || Date.now());
        durEl.textContent = _formatDuration(elapsed);
    }, 1000);

    // ── Deteksi pergantian hari tengah malam ──────
    // Cek setiap menit; jika tanggal berubah, pindahkan listener ke hari baru
    setInterval(() => {
        const newDate = getTodayStr();
        if (newDate === _activeTodayStr) return;

        console.log(`[SIP] Hari berganti → ${newDate}, memperbarui statistik harian.`);

        // Pindahkan listener ke tanggal baru (otomatis reset ke 0 jika belum ada data)
        attachDailyListener(newDate);

        // Catat kunjungan untuk hari baru (1x per tab per hari)
        const countedDate = sessionStorage.getItem('sip_counted_date');
        if (countedDate !== newDate) {
            sessionStorage.setItem('sip_counted_date', newDate);
            // Reset countKey agar tab ini terhitung di hari baru
            sessionStorage.removeItem(`sip_visit_counted_${tabId}`);
            _fbDB.ref('stats/total').transaction(val => (val || 0) + 1);
            _fbDB.ref(`stats/daily/${newDate}`).transaction(val => (val || 0) + 1);
        }
    }, 60000); // cek tiap 60 detik

    // ── Refresh presence tiap 45 detik ─────────────
    // Memperbarui timestamp agar cleanup tidak salah hapus tab yang masih aktif
    setInterval(() => {
        presenceRef.set({
            ts: firebase.database.ServerValue.TIMESTAMP,
            role: _getCurrentRole()
        });
    }, 45000);

    // ── Bersihkan presence lama (>120 detik) tiap 60 detik ──
    // Threshold 120 detik = 2x interval refresh, aman untuk tab aktif
    setInterval(() => {
        _fbDB.ref('stats/presence').once('value', snap => {
            if (!snap.exists()) return;
            const now = Date.now();
            snap.forEach(child => {
                const data = child.val();
                if (data && data.ts && (now - data.ts) > 120000) {
                    child.ref.remove();
                }
            });
        });
    }, 60000);
}

// ── Fallback jika Firebase tidak tersedia ─────────────
function _fallbackLocalStats() {
    const KEY_TOTAL = 'sip_visits_total';
    const KEY_TODAY = 'sip_visits_today';
    const KEY_DATE  = 'sip_visits_date';
    const SESSION_START = 'sip_session_start';
    const todayStr = new Date().toLocaleDateString('id-ID');

    if (!sessionStorage.getItem(SESSION_START)) {
        sessionStorage.setItem(SESSION_START, Date.now());
    }

    let total = parseInt(localStorage.getItem(KEY_TOTAL) || '0');
    let today = parseInt(localStorage.getItem(KEY_TODAY) || '0');

    if (localStorage.getItem(KEY_DATE) !== todayStr) {
        today = 0;
        localStorage.setItem(KEY_DATE, todayStr);
    }
    if (!sessionStorage.getItem('sip_counted')) {
        total++; today++;
        localStorage.setItem(KEY_TOTAL, total);
        localStorage.setItem(KEY_TODAY, today);
        sessionStorage.setItem('sip_counted', '1');
    }

    _animateCount(document.getElementById('stat-total'), total);
    _animateCount(document.getElementById('stat-today'), today);
    _animateCount(document.getElementById('stat-online-num'), 1);

    setInterval(() => {
        const durEl = document.getElementById('stat-duration');
        if (!durEl) return;
        const elapsed = Date.now() - parseInt(sessionStorage.getItem(SESSION_START) || Date.now());
        durEl.textContent = _formatDuration(elapsed);
    }, 1000);
}

// ── Helper: role sesi aktif ────────────────────────────
function _getCurrentRole() {
    try {
        const s = JSON.parse(localStorage.getItem('sip_session'));
        return s ? (s.role || 'guest') : 'guest';
    } catch { return 'guest'; }
}

// ── Helper: animasi count-up ──────────────────────────
function _animateCount(el, target) {
    if (!el) return;
    const from = parseInt(el.dataset.val || '0');
    if (from === target) return;
    el.dataset.val = target;
    const duration = 600;
    const start = Date.now();
    const step = () => {
        const progress = Math.min((Date.now() - start) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(from + (target - from) * ease);
        if (progress < 1) requestAnimationFrame(step);
    };
    el.classList.add('updated');
    setTimeout(() => el.classList.remove('updated'), 400);
    requestAnimationFrame(step);
}

// ── Helper: format durasi ─────────────────────────────
function _formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${String(h).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}

// ══════════════════════════════════════════════════════
//  JAM LIVE
// ══════════════════════════════════════════════════════
function updateClock() {
    const clockElement = document.getElementById('live-clock');
    if (!clockElement) return;
    const now = new Date();
    const options = {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    };
    let formatted = now.toLocaleDateString('id-ID', options).replace(',', '');
    clockElement.innerText = formatted + " WIB";
}
setInterval(updateClock, 1000);
updateClock();

// ══════════════════════════════════════════════════════
//  STATUS LOGIN
// ══════════════════════════════════════════════════════
function loadUserWidget() {
    const stored = localStorage.getItem('sip_session') || localStorage.getItem('sip_user');
    const nameEl = document.getElementById('user-name');
    const iconEl = document.getElementById('user-icon');
    if (stored) {
        try {
            const sess = JSON.parse(stored);
            nameEl.textContent = sess.name || sess.username || 'Pengguna';
            iconEl.textContent = sess.role === 'superuser' ? '🛡️' : '👤';
            return;
        } catch (e) {}
    }
    nameEl.textContent = 'Guest';
    iconEl.textContent = '👤';
}

// ══════════════════════════════════════════════════════
//  LOGOUT
// ══════════════════════════════════════════════════════
function doLogout() {
    if (confirm('Keluar dari sistem?')) {
        // Hapus presence dulu sebelum logout
        if (_fbDB) {
            const tabId = sessionStorage.getItem('sip_tab_id');
            if (tabId) _fbDB.ref(`stats/presence/${tabId}`).remove();
        }
        localStorage.removeItem('sip_session');
        localStorage.removeItem('sip_user');
        window.location.href = 'login.html';
    }
}

// ══════════════════════════════════════════════════════
//  FLOATING PARTICLES
// ══════════════════════════════════════════════════════
function spawnParticles() {
    const container = document.getElementById('hero-particles');
    if (!container) return;
    function createParticle() {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 5 + 2;
        const left = Math.random() * 100;
        const dur  = Math.random() * 12 + 8;
        const del  = Math.random() * 6;
        const hue  = Math.random() < 0.5 ? 'rgba(241,196,15,0.6)' : 'rgba(255,255,255,0.35)';
        p.style.cssText = `width:${size}px;height:${size}px;left:${left}%;bottom:-10px;background:${hue};animation-duration:${dur}s;animation-delay:${del}s;`;
        container.appendChild(p);
        setTimeout(() => p.remove(), (dur + del) * 1000 + 500);
    }
    for (let i = 0; i < 18; i++) createParticle();
    setInterval(() => { for (let i = 0; i < 4; i++) createParticle(); }, 2200);
}

// ══════════════════════════════════════════════════════
//  HEADER SHRINK ON SCROLL
// ══════════════════════════════════════════════════════
function initHeaderShrink() {
    const header = document.querySelector('.header-main');
    if (!header) return;
    window.addEventListener('scroll', () => {
        header.classList.toggle('scrolled', window.scrollY > 60);
    }, { passive: true });
}

// ══════════════════════════════════════════════════════
//  HIDE SCROLL HINT
// ══════════════════════════════════════════════════════
function initScrollHintHide() {
    const hint = document.querySelector('.scroll-hint');
    if (!hint) return;
    window.addEventListener('scroll', () => {
        if (window.scrollY > 80) {
            hint.style.opacity = '0';
            hint.style.pointerEvents = 'none';
        }
    }, { passive: true, once: true });
}

// ══════════════════════════════════════════════════════
//  INTERSECTION OBSERVER — reveal on scroll
// ══════════════════════════════════════════════════════
function initRevealOnScroll() {
    const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                io.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    document.querySelectorAll('.member-card').forEach((card, i) => {
        card.style.transitionDelay = `${i * 60}ms`;
        io.observe(card);
    });
    document.querySelectorAll('.made-with-badge,.made-with-title,.made-with-group,.made-with-divider').forEach((el, i) => {
        el.style.transitionDelay = `${i * 100}ms`;
        io.observe(el);
    });
    document.querySelectorAll('.tentang-badge,.tentang-title,.tentang-subtitle,.tentang-divider').forEach((el, i) => {
        el.style.transitionDelay = `${i * 80}ms`;
        io.observe(el);
    });
    document.querySelectorAll('.foto-item-landscape').forEach((el, i) => {
        el.style.transitionDelay = `${i * 120}ms`;
        io.observe(el);
    });
    document.querySelectorAll('.foto-item-portrait').forEach((el, i) => {
        el.style.transitionDelay = `${i * 100}ms`;
        io.observe(el);
    });
}

// ══════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
    _initFirebase();
    loadUserWidget();
    spawnParticles();
    initHeaderShrink();
    initScrollHintHide();
    initRevealOnScroll();
    initVisitorStats();
});
