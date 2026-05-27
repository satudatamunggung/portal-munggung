/* ── SCROLL REVEAL ── */
const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('visible');
    });
}, { threshold: 0.10 });
document.querySelectorAll('.reveal, .reveal-left').forEach(el => observer.observe(el));

/* ── LIVE CLOCK ── */
function updateClock() {
    const clockElement = document.getElementById('live-clock');
    const now = new Date();
    const options = {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    };
    const formatted = now.toLocaleString('id-ID', options);
    clockElement.innerText = formatted + " WIB";
}
setInterval(updateClock, 1000);
updateClock();

/* ── USER SESSION ── */
function checkUser() {
    const stored = localStorage.getItem('sip_session') || localStorage.getItem('sip_user');
    if (stored) {
        try {
            const u = JSON.parse(stored);
            const displayName = u.name || u.username || 'Pengguna';
            document.getElementById('user-name').textContent = displayName;
            document.getElementById('user-icon').textContent = u.role === 'superuser' ? '🛡️' : '👤';
            return u;
        } catch (e) { return null; }
    }
    document.getElementById('user-name').textContent = 'Guest';
    return null;
}
checkUser();

/* ── LOGOUT ── */
function logout() {
    if (confirm('Keluar dari sistem?')) {
        localStorage.removeItem('sip_session');
        localStorage.removeItem('sip_user');
        window.location.href = 'login.html';
    }
}

/* ── HEADER SHRINK ON SCROLL ── */
window.addEventListener('scroll', () => {
    const header = document.querySelector('.site-header');
    if (header) header.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

/* ── FLOATING PARTICLES ── */
function spawnParticles() {
    const container = document.getElementById('hero-particles-geo');
    if (!container) return;

    function createParticle() {
        const p = document.createElement('div');
        p.className = 'g-particle';
        const size = Math.random() * 5 + 2;
        const left = Math.random() * 100;
        const dur  = Math.random() * 14 + 8;
        const del  = Math.random() * 6;
        const gold = Math.random() < 0.5;
        p.style.cssText = `
            width:${size}px; height:${size}px; left:${left}%;
            bottom:-10px;
            background:${gold ? 'rgba(241,196,15,0.55)' : 'rgba(255,255,255,0.3)'};
            animation-duration:${dur}s; animation-delay:${del}s;
        `;
        container.appendChild(p);
        setTimeout(() => p.remove(), (dur + del) * 1000 + 500);
    }

    for (let i = 0; i < 16; i++) createParticle();
    setInterval(() => { for (let i = 0; i < 3; i++) createParticle(); }, 2500);
}

window.addEventListener('DOMContentLoaded', () => {
    spawnParticles();
});
