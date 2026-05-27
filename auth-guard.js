// ═══════════════════════════════════════════════════════
//  auth-guard.js — Pasang di SEMUA halaman selain login.html
//  Letakkan <script src="auth-guard.js"></script>
//  sebagai script PERTAMA sebelum script lain
// ═══════════════════════════════════════════════════════

(function () {
    const SESSION_KEY = 'sip_session';

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

    const session = getSession();

    // Tidak ada session → redirect ke login
    if (!session) {
        window.location.replace('login.html');
    }

    // Expose ke halaman lain
    window.sipSession = session;

    // Fungsi logout global
    window.doLogout = function () {
        localStorage.removeItem(SESSION_KEY);
        window.location.replace('login.html');
    };

    // Isi nama user di header (jika ada elemen #user-name)
    document.addEventListener('DOMContentLoaded', () => {
        const nameEl = document.getElementById('user-name');
        const iconEl = document.getElementById('user-icon');
        if (nameEl && session) {
            nameEl.textContent = session.name || session.username;
            if (iconEl) iconEl.textContent = session.role === 'superuser' ? '🛡️' : '👤';
        }
    });
})();
