/**
 * ═══════════════════════════════════════════════════════
 *  SIP DESA MUNGGUNG — API Server (Node.js)
 *
 *  ⚡ Cara pakai:
 *     1. Taruh server.js di folder yang sama dengan peta2.html
 *     2. Buka terminal: node server.js
 *     3. Buka peta di VS Code Live Server (port 5500) seperti biasa
 *
 *  Server ini HANYA untuk API penyimpanan permanen (port 3001).
 *  VS Code Live Server tetap handle HTML/CSS/JS di port 5500.
 *
 *  Endpoint:
 *    GET    /api/katalog          — daftar layer tersimpan
 *    POST   /api/katalog          — simpan layer baru
 *    PATCH  /api/katalog/:name    — update warna/klasifikasi
 *    DELETE /api/katalog/:name    — hapus layer
 *    GET    /api/geojson/:name    — ambil file GeoJSON dari server
 * ═══════════════════════════════════════════════════════
 */

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

/* ── Konfigurasi ── */
const PORT      = 3001;
const DATA_DIR  = path.join(__dirname, 'data_katalog');
const META_FILE = path.join(DATA_DIR, '_meta.json');

/* ── SSE — daftar klien yang terhubung untuk push realtime ── */
const sseClients = new Set();

function broadcastSSE(eventName, data){
    const msg = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(res => {
        try{ res.write(msg); }
        catch(e){ sseClients.delete(res); }
    });
}

/* ── Buat folder data_katalog jika belum ada ── */
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('📁 Folder data_katalog dibuat.');
}

/* ── Baca / tulis metadata ── */
function readMeta() {
    try {
        if (fs.existsSync(META_FILE))
            return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
    } catch (e) {}
    return { layers: [] };
}
function writeMeta(meta) {
    fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf8');
}

/* ── CORS — izinkan Live Server (5500) akses API ── */
function setCORS(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/* ── Parse body JSON ── */
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch (e) { reject(new Error('JSON parse error')); }
        });
        req.on('error', reject);
    });
}

/* ════════════════════════════════════
   HTTP SERVER
════════════════════════════════════ */
const server = http.createServer(async (req, res) => {
    setCORS(res);

    /* Preflight CORS */
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const { pathname } = url.parse(req.url, true);

    /* ── GET /api/katalog ── */
    if (req.method === 'GET' && pathname === '/api/katalog') {
        const meta = readMeta();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, layers: meta.layers }));
        return;
    }


    /* ── GET /api/events — SSE stream untuk sinkronisasi realtime ── */
    if (req.method === 'GET' && pathname === '/api/events') {
        res.writeHead(200, {
            'Content-Type':  'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection':    'keep-alive',
            'Access-Control-Allow-Origin': '*',
        });
        res.write(':ok\n\n'); // handshake
        sseClients.add(res);
        console.log(`📡 SSE klien terhubung. Total: ${sseClients.size}`);

        // Heartbeat setiap 25 detik supaya koneksi tidak timeout
        const heartbeat = setInterval(() => {
            try{ res.write(':heartbeat\n\n'); }
            catch(e){ clearInterval(heartbeat); sseClients.delete(res); }
        }, 25000);

        req.on('close', () => {
            clearInterval(heartbeat);
            sseClients.delete(res);
            console.log(`📡 SSE klien putus. Sisa: ${sseClients.size}`);
        });
        return;
    }

    /* ── GET /api/geojson/:name ── */
    if (req.method === 'GET' && pathname.startsWith('/api/geojson/')) {
        const name = decodeURIComponent(pathname.replace('/api/geojson/', ''));
        const safeName = name.replace(/[^a-zA-Z0-9._\-]/g, '_');
        const filepath = path.join(DATA_DIR, safeName);
        if (!filepath.startsWith(DATA_DIR)) { res.writeHead(403); res.end(); return; }
        try {
            const data = fs.readFileSync(filepath);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data);
        } catch (e) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'File tidak ditemukan' }));
        }
        return;
    }

    /* ── POST /api/katalog — simpan layer baru ── */
    if (req.method === 'POST' && pathname === '/api/katalog') {
        try {
            const body = await parseBody(req);
            const { name, data, color, opacity, colorMap, classField, swatch, icon } = body;
            if (!name || !data) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'name dan data wajib diisi' }));
                return;
            }
            const safeName = name.replace(/[^a-zA-Z0-9._\-]/g, '_');
            const filepath = path.join(DATA_DIR, safeName);
            if (!filepath.startsWith(DATA_DIR)) { res.writeHead(403); res.end(); return; }

            fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');

            const meta = readMeta();
            meta.layers = meta.layers.filter(l => l.name !== safeName);
            meta.layers.push({
                name:        safeName,
                displayName: name.replace(/\.(geojson|json)$/i, ''),
                color:       color  || '#888888',
                opacity:     opacity !== undefined ? opacity : 35,
                colorMap:    colorMap  || null,
                classField:  classField || null,
                swatch:      swatch || `linear-gradient(135deg,${color||'#888'},${color||'#888'}88)`,
                icon:        icon   || '📂',
                savedAt:     new Date().toISOString()
            });
            writeMeta(meta);

            console.log(`✅  Layer disimpan: ${safeName}`);
            // Broadcast ke semua klien SSE
            const savedItem = meta.layers.find(l => l.name === safeName);
            if(savedItem) broadcastSSE('layer-added', savedItem);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, name: safeName }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: e.message }));
        }
        return;
    }

    /* ── PATCH /api/katalog/:name — update metadata ── */
    if (req.method === 'PATCH' && pathname.startsWith('/api/katalog/')) {
        const name     = decodeURIComponent(pathname.replace('/api/katalog/', ''));
        const safeName = name.replace(/[^a-zA-Z0-9._\-]/g, '_');
        try {
            const body = await parseBody(req);
            const meta = readMeta();
            const idx  = meta.layers.findIndex(l => l.name === safeName);
            if (idx === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Layer tidak ditemukan' }));
                return;
            }
            Object.assign(meta.layers[idx], body, { name: safeName });
            writeMeta(meta);
            console.log(`✏️   Layer diupdate: ${safeName}`);
            // Broadcast ke semua klien SSE
            broadcastSSE('layer-updated', { name: safeName, ...body });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: e.message }));
        }
        return;
    }

    /* ── DELETE /api/katalog/:name — hapus layer ── */
    if (req.method === 'DELETE' && pathname.startsWith('/api/katalog/')) {
        const name     = decodeURIComponent(pathname.replace('/api/katalog/', ''));
        const safeName = name.replace(/[^a-zA-Z0-9._\-]/g, '_');
        const filepath = path.join(DATA_DIR, safeName);
        if (!filepath.startsWith(DATA_DIR)) { res.writeHead(403); res.end(); return; }
        try {
            if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
            const meta = readMeta();
            meta.layers = meta.layers.filter(l => l.name !== safeName);
            writeMeta(meta);
            console.log(`🗑️   Layer dihapus: ${safeName}`);
            // Broadcast ke semua klien SSE
            broadcastSSE('layer-deleted', { name: safeName });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: e.message }));
        }
        return;
    }

    /* ── 404 untuk route lain ── */
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint tidak ditemukan' }));
});

server.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   SIP Desa Munggung — API Server Berjalan          ║');
    console.log(`║   API  → http://localhost:${PORT}                    ║`);
    console.log('║   Peta → buka di VS Code Live Server (:5500)       ║
║   SSE  → realtime multi-user aktif                  ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
    console.log(`📁 Data tersimpan di: ${DATA_DIR}`);
    console.log('🛑 Ctrl+C untuk stop\n');
});
