/* ════════════ NOT FOUND NOTICE ════════════
   Baca query string ?notfound=1&label=...
   yang dikirim oleh dokumen.php saat file PDF belum ada
   ═══════════════════════════════════════════ */
function checkNotFound() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('notfound') === '1') {
        const label = decodeURIComponent(params.get('label') || 'Dokumen ini');
        const box   = document.getElementById('notice-box');
        const msg   = document.getElementById('notice-msg');
        if (box && msg) {
            msg.innerHTML = `File <strong>${label}</strong> belum tersedia di server.
                Pastikan file PDF sudah diunggah ke folder <code>assets/dokumen/</code>.
                Hubungi administrator untuk informasi lebih lanjut.`;
            box.classList.add('show');
        }
    }
}

/* ════════════ JAM LIVE ════════════ */
function updateClock() {
    const now   = new Date();
    const hari  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli',
                   'Agustus','September','Oktober','November','Desember'];
    document.getElementById('live-clock').textContent =
        `${hari[now.getDay()]} ${now.getDate()} ${bulan[now.getMonth()]} ${now.getFullYear()} pukul ` +
        `${String(now.getHours()).padStart(2,'0')}.${String(now.getMinutes()).padStart(2,'0')}.${String(now.getSeconds()).padStart(2,'0')} WIB`;
}
setInterval(updateClock, 1000);
updateClock();

/* ════════════ SESSION ════════════ */
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
        } catch(e) {}
    }
    nameEl.textContent = 'Guest';
    iconEl.textContent = '👤';
}

function doLogout() {
    if (confirm('Keluar dari sistem?')) {
        localStorage.removeItem('sip_session');
        localStorage.removeItem('sip_user');
        window.location.href = 'login.html';
    }
}

/* ════════════ INIT ════════════ */
loadUserWidget();
checkNotFound();
