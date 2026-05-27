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
});
