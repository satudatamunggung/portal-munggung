/* DATA dari tabel BPS */
const desaData = [
    {nama:'Tulas',       persen:5.86, kepadatan:2029.98, rasio:101.96},
    {nama:'Bulusan',     persen:5.35, kepadatan:1836.00, rasio:96.00},
    {nama:'Tumpukan',    persen:6.10, kepadatan:1371.86, rasio:96.41},
    {nama:'Soka',        persen:2.43, kepadatan:1087.67, rasio:98.70},
    {nama:'Karangjoho',  persen:5.71, kepadatan:1180.17, rasio:95.63},
    {nama:'Ringinputih', persen:7.33, kepadatan:1187.98, rasio:95.93},
    {nama:'Tambak',      persen:4.11, kepadatan:1137.28, rasio:101.79},
    {nama:'Karangdowo',  persen:5.37, kepadatan:1553.81, rasio:98.24},
    {nama:'Munggung',    persen:6.57, kepadatan:2209.95, rasio:99.86},
    {nama:'Sentono',     persen:4.55, kepadatan:1616.12, rasio:100.40},
    {nama:'Ngolodono',   persen:7.25, kepadatan:1967.35, rasio:100.57},
    {nama:'Pugeran',     persen:4.81, kepadatan:1378.18, rasio:102.01},
    {nama:'Demangan',    persen:6.86, kepadatan:1116.42, rasio:99.87},
    {nama:'Babadan',     persen:4.04, kepadatan:1045.08, rasio:94.31},
    {nama:'Tegalampel',  persen:3.06, kepadatan:1496.92, rasio:96.78},
    {nama:'Karangtalun', persen:3.73, kepadatan:1002.05, rasio:98.55},
    {nama:'Karangwungu', persen:5.71, kepadatan:1483.73, rasio:94.95},
    {nama:'Kupang',      persen:6.68, kepadatan:1785.35, rasio:95.86},
    {nama:'Bakungan',    persen:4.48, kepadatan:1378.98, rasio:98.99},
];

const totalPenduduk = 43284;
desaData.forEach(d => { d.penduduk = Math.round(d.persen / 100 * totalPenduduk); });

/* TABEL */
const tbody = document.getElementById('tabel-desa');
desaData.forEach((d, i) => {
    tbody.innerHTML += `<tr>
        <td>${i + 1}</td>
        <td><strong>${d.nama}</strong></td>
        <td>${d.persen.toFixed(2)}</td>
        <td>${d.kepadatan.toLocaleString('id-ID', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
        <td>${d.rasio.toFixed(2)}</td>
    </tr>`;
});
tbody.innerHTML += `<tr style="font-weight:700;background:#eef5fa;">
    <td colspan="2" style="font-family:'Montserrat',sans-serif;color:var(--navy);">Kecamatan Karangdowo</td>
    <td style="font-family:'Montserrat',sans-serif;color:var(--navy);">100</td>
    <td style="font-family:'Montserrat',sans-serif;color:var(--navy);">1.423,29</td>
    <td style="font-family:'Montserrat',sans-serif;color:var(--navy);">98,20</td>
</tr>`;

/* CHART PENDUDUK PER DESA */
new Chart(document.getElementById('chartDesa'), {
    type: 'bar',
    data: {
        labels: desaData.map(d => d.nama),
        datasets: [{
            label: 'Penduduk',
            data: desaData.map(d => d.penduduk),
            backgroundColor: 'rgba(26,77,110,0.75)',
            borderColor: '#1a4d6e', borderWidth: 1, borderRadius: 6
        }]
    },
    options: {
        responsive: true, plugins: {legend: {display: false}},
        scales: {
            x: {ticks: {font: {family:'Inter', size:9}, maxRotation:45}},
            y: {ticks: {font: {family:'Inter', size:10}}}
        }
    }
});

/* CHART GENDER */
new Chart(document.getElementById('chartGender'), {
    type: 'doughnut',
    data: {
        labels: ['Laki-laki', 'Perempuan'],
        datasets: [{
            data: [21580, 21704],
            backgroundColor: ['#1a4d6e', '#f1c40f'],
            borderWidth: 0, hoverOffset: 8
        }]
    },
    options: {
        responsive: true, cutout: '68%',
        plugins: {legend: {position:'bottom', labels: {font: {family:'Inter', size:12}}}}
    }
});

/* CHART USIA */
new Chart(document.getElementById('chartUsia'), {
    type: 'bar',
    data: {
        labels: ['0-4','5-9','10-14','15-19','20-24','25-29','30-34','35-39','40-44','45-49','50-54','55-59','60+'],
        datasets: [
            {label:'Laki-laki',   data:[1458,1622,1682,1765,1703,1858,2002,2064,1888,1775,1601,1314,1848], backgroundColor:'rgba(26,77,110,0.75)', borderRadius:4},
            {label:'Perempuan',   data:[1416,1580,1642,1735,1776,1930,2074,2114,1918,1796,1642,1354,1727], backgroundColor:'rgba(241,196,15,0.8)',  borderRadius:4}
        ]
    },
    options: {
        responsive: true, indexAxis: 'y',
        plugins: {legend: {position:'bottom', labels: {font: {family:'Inter', size:11}}}},
        scales: {x: {stacked: false}, y: {ticks: {font: {family:'Inter', size:9}}}}
    }
});

/* CHART TREN */
new Chart(document.getElementById('chartTren'), {
    type: 'line',
    data: {
        labels: ['2019','2020','2021','2022','2023','2024','2025'],
        datasets: [{
            label: 'Jumlah Penduduk',
            data: [39800, 40100, 40600, 41200, 41780, 42156, 43284],
            borderColor: '#1a4d6e', backgroundColor: 'rgba(26,77,110,0.08)',
            borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#1a4d6e',
            tension: 0.4, fill: true
        }]
    },
    options: {
        responsive: true,
        plugins: {legend: {position:'bottom', labels: {font: {family:'Inter', size:11}}}},
        scales: {y: {ticks: {font: {family:'Inter', size:10}}}}
    }
});

/* ── JAM ── */
function updateClock() {
    const now = new Date();
    const hariArr  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const bulanArr = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const jam = String(now.getHours()).padStart(2, '0');
    const mnt = String(now.getMinutes()).padStart(2, '0');
    const dtk = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('live-clock').textContent =
        `${hariArr[now.getDay()]} ${now.getDate()} ${bulanArr[now.getMonth()]} ${now.getFullYear()} ${jam}.${mnt}.${dtk} WIB`;
}
setInterval(updateClock, 1000);
updateClock();

/* ── USER PILL ── */
function checkUser() {
    const stored = localStorage.getItem('sip_session') || localStorage.getItem('sip_user');
    if (stored) {
        try {
            const u = JSON.parse(stored);
            document.getElementById('user-name').textContent = u.name || u.username || 'Pengguna';
            document.getElementById('user-icon').textContent = u.role === 'superuser' ? '🛡️' : '👤';
            return u;
        } catch(e) { return null; }
    }
    document.getElementById('user-name').textContent = 'Guest';
    return null;
}
checkUser();

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

/* ── STAT CARD COUNTER ANIMATION ── */
function animateCounters() {
    const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const target = parseFloat(el.dataset.target);
                const isInt = Number.isInteger(target);
                let current = 0;
                const step = target / 60;
                const timer = setInterval(() => {
                    current += step;
                    if (current >= target) { current = target; clearInterval(timer); }
                    el.textContent = isInt
                        ? Math.floor(current).toLocaleString('id-ID')
                        : current.toFixed(0).toLocaleString('id-ID');
                }, 16);
                io.unobserve(el);
            }
        });
    }, { threshold: 0.5 });

    document.querySelectorAll('.stat-val[data-target]').forEach(el => io.observe(el));
}

/* ── CARD REVEAL ── */
function initReveal() {
    const io = new IntersectionObserver((entries) => {
        entries.forEach((entry, idx) => {
            if (entry.isIntersecting) {
                setTimeout(() => entry.target.style.opacity = '1', idx * 80);
                entry.target.style.transform = 'translateY(0)';
                io.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    document.querySelectorAll('.card, .stat-card').forEach(el => {
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        el.style.opacity = '0';
        el.style.transform = 'translateY(18px)';
        io.observe(el);
    });
}

window.addEventListener('DOMContentLoaded', () => {
    initReveal();
});
