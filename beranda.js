/* ── STATISTIK PENGUNJUNG ── */
function initVisitorStats() {
    const KEY_TOTAL      = 'sip_visits_total';
    const KEY_TODAY      = 'sip_visits_today';
    const KEY_DATE       = 'sip_visits_date';
    const KEY_ONLINE_ALL = 'sip_online_all'; // array heartbeat semua tab aktif
    const SESSION_START  = 'sip_session_start';

    // ── Baca role dari sesi yang sedang aktif ────
    function getCurrentRole() {
        try {
            const s = JSON.parse(localStorage.getItem('sip_session'));
            if (!s) return 'guest';
            return s.role || 'guest'; // 'superuser' | 'user' | 'guest'
        } catch { return 'guest'; }
    }

    // ── Catat kunjungan (semua role dihitung) ────
    const todayStr  = new Date().toLocaleDateString('id-ID');
    const savedDate = localStorage.getItem(KEY_DATE);

    let total = parseInt(localStorage.getItem(KEY_TOTAL) || '0');
    let today = parseInt(localStorage.getItem(KEY_TODAY) || '0');

    // Reset harian jika hari berganti
    if (savedDate !== todayStr) {
        today = 0;
        localStorage.setItem(KEY_DATE, todayStr);
    }

    // Hitung hanya sekali per tab (sessionStorage)
    if (!sessionStorage.getItem('sip_counted')) {
        total += 1;
        today += 1;
        localStorage.setItem(KEY_TOTAL, total);
        localStorage.setItem(KEY_TODAY, today);
        sessionStorage.setItem('sip_counted', '1');
    }

    // ── Waktu mulai sesi ─────────────────────────
    if (!sessionStorage.getItem(SESSION_START)) {
        sessionStorage.setItem(SESSION_START, Date.now());
    }

    // ── Tab ID unik ───────────────────────────────
    if (!sessionStorage.getItem('sip_tab_id')) {
        sessionStorage.setItem('sip_tab_id', 'tab_' + Math.random().toString(36).slice(2));
    }
    const tabId = sessionStorage.getItem('sip_tab_id');

    // ── Heartbeat: kirim role bersama timestamp ───
    // Setiap tab menyimpan { id, ts, role } — semua role ikut terhitung
    function heartbeat() {
        const now  = Date.now();
        const role = getCurrentRole();
        let all = [];
        try { all = JSON.parse(localStorage.getItem(KEY_ONLINE_ALL) || '[]'); } catch {}
        // Hapus entry tab ini + yang sudah expired (>30 detik)
        all = all.filter(e => e.id !== tabId && (now - e.ts) < 30000);
        all.push({ id: tabId, ts: now, role });
        localStorage.setItem(KEY_ONLINE_ALL, JSON.stringify(all));
    }

    // Hitung semua yang online (superuser + user + guest)
    function countOnline() {
        const now = Date.now();
        let all = [];
        try { all = JSON.parse(localStorage.getItem(KEY_ONLINE_ALL) || '[]'); } catch {}
        return all.filter(e => (now - e.ts) < 30000).length;
    }

    heartbeat();
    setInterval(heartbeat, 10000);

    // ── Render angka dengan animasi count-up ─────
    function animateCount(el, target, prefix = '', suffix = '') {
        const duration = 800;
        const start = Date.now();
        const from = parseInt(el.dataset.val || '0');
        if (from === target) return;
        el.dataset.val = target;
        const step = () => {
            const progress = Math.min((Date.now() - start) / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            el.textContent = prefix + Math.round(from + (target - from) * ease) + suffix;
            if (progress < 1) requestAnimationFrame(step);
        };
        el.classList.add('updated');
        setTimeout(() => el.classList.remove('updated'), 400);
        requestAnimationFrame(step);
    }

    function formatDuration(ms) {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        if (h > 0) return String(h).padStart(2,'0') + ':' + String(m%60).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
        return String(m).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
    }

    function updateStats() {
        const totalEl    = document.getElementById('stat-total');
        const todayEl    = document.getElementById('stat-today');
        const onlineNumEl = document.getElementById('stat-online-num');
        const durEl      = document.getElementById('stat-duration');

        if (totalEl)    animateCount(totalEl, parseInt(localStorage.getItem(KEY_TOTAL) || '0'));
        if (todayEl)    animateCount(todayEl, parseInt(localStorage.getItem(KEY_TODAY) || '0'));
        if (onlineNumEl) animateCount(onlineNumEl, countOnline());
        if (durEl) {
            const elapsed = Date.now() - parseInt(sessionStorage.getItem(SESSION_START) || Date.now());
            durEl.textContent = formatDuration(elapsed);
        }
    }

    updateStats();
    setInterval(updateStats, 1000);
}

/* ── JAM LIVE ── */
function updateClock() {
    const clockElement = document.getElementById('live-clock');
    const now = new Date();
    const options = {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    };
    let formatted = now.toLocaleDateString('id-ID', options);
    formatted = formatted.replace(',', '');
    clockElement.innerText = formatted + " WIB";
}
setInterval(updateClock, 1000);
updateClock();

/* ── STATUS LOGIN ── */
function loadUserWidget() {
    const stored = localStorage.getItem('sip_session') || localStorage.getItem('sip_user');
    const nameEl = document.getElementById('user-name');
    const iconEl = document.getElementById('user-icon');
    if (stored) {
        try {
            const sess = JSON.parse(stored);
            const displayName = sess.name || sess.username || 'Pengguna';
            const isSuper = sess.role === 'superuser';
            nameEl.textContent = displayName;
            iconEl.textContent = isSuper ? '🛡️' : '👤';
            return;
        } catch (e) {}
    }
    nameEl.textContent = 'Guest';
    iconEl.textContent = '👤';
}

/* ── LOGOUT ── */
function doLogout() {
    if (confirm('Keluar dari sistem?')) {
        localStorage.removeItem('sip_session');
        localStorage.removeItem('sip_user');
        window.location.href = 'login.html';
    }
}

/* ── FLOATING PARTICLES ── */
function spawnParticles() {
    const container = document.getElementById('hero-particles');
    if (!container) return;

    function createParticle() {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 5 + 2;         // 2–7px
        const left = Math.random() * 100;            // 0–100%
        const dur  = Math.random() * 12 + 8;         // 8–20s
        const del  = Math.random() * 6;              // 0–6s delay
        const hue  = Math.random() < 0.5 ? 'rgba(241,196,15,0.6)' : 'rgba(255,255,255,0.35)';
        p.style.cssText = `
            width:${size}px; height:${size}px;
            left:${left}%;
            bottom:-10px;
            background:${hue};
            animation-duration:${dur}s;
            animation-delay:${del}s;
        `;
        container.appendChild(p);
        // Remove after one cycle to avoid DOM bloat
        setTimeout(() => p.remove(), (dur + del) * 1000 + 500);
    }

    // Spawn a batch, then repeat
    for (let i = 0; i < 18; i++) createParticle();
    setInterval(() => {
        for (let i = 0; i < 4; i++) createParticle();
    }, 2200);
}

/* ── HEADER SHRINK ON SCROLL ── */
function initHeaderShrink() {
    const header = document.querySelector('.header-main');
    window.addEventListener('scroll', () => {
        header.classList.toggle('scrolled', window.scrollY > 60);
    }, { passive: true });
}

/* ── HIDE SCROLL HINT ON SCROLL ── */
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

/* ── INTERSECTION OBSERVER: member cards + section text ── */
function initRevealOnScroll() {
    const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                io.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    // Member cards — staggered delay
    document.querySelectorAll('.member-card').forEach((card, i) => {
        card.style.transitionDelay = `${i * 60}ms`;
        io.observe(card);
    });

    // Section text elements
    document.querySelectorAll('.made-with-badge, .made-with-title, .made-with-group, .made-with-divider')
        .forEach((el, i) => {
            el.style.transitionDelay = `${i * 100}ms`;
            io.observe(el);
        });

    // Tentang kami section
    document.querySelectorAll('.tentang-badge, .tentang-title, .tentang-subtitle, .tentang-divider')
        .forEach((el, i) => {
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

/* ── INIT ── */
window.addEventListener('DOMContentLoaded', () => {
    loadUserWidget();
    spawnParticles();
    initHeaderShrink();
    initScrollHintHide();
    initRevealOnScroll();
    initVisitorStats();
});
