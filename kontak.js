/* ── JAM LIVE ── */
function updateClock() {
    const now = new Date();
    const hariArr = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const bulanArr = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const jam = String(now.getHours()).padStart(2, '0');
    const mnt = String(now.getMinutes()).padStart(2, '0');
    const dtk = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('live-clock').textContent =
        `${hariArr[now.getDay()]} ${now.getDate()} ${bulanArr[now.getMonth()]} ${now.getFullYear()} pukul ${jam}.${mnt}.${dtk} WIB`;
}
setInterval(updateClock, 1000);
updateClock();

/* ── USER ── */
function checkUser() {
    const stored = localStorage.getItem('sip_session') || localStorage.getItem('sip_user');
    if (stored) {
        try {
            const u = JSON.parse(stored);
            document.getElementById('user-name').textContent = u.name || u.username || 'Pengguna';
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

/* ── HEADER SHRINK ── */
window.addEventListener('scroll', () => {
    const header = document.querySelector('.header-main');
    if (header) header.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

/* ── CARD REVEAL ON SCROLL ── */
window.addEventListener('DOMContentLoaded', () => {
    const io = new IntersectionObserver((entries) => {
        entries.forEach((entry, idx) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }, idx * 120);
                io.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.info-card').forEach(el => {
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        el.style.opacity = '0';
        el.style.transform = 'translateY(24px)';
        io.observe(el);
    });
});
