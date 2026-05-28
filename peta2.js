/* ════════════════════════════════════
   PETA2.JS — SIP Desa Munggung
════════════════════════════════════ */

/* ════════════════════════════════════
   DATA STORE — menyimpan GeoJSON aktual
════════════════════════════════════ */
let geojsonData = {
    admin: null,
    bidang: null,
    lahan: null
};

// Peta file path ke key
const GEOJSON_FILES = {
    admin:  'Admin_Karangdowo.geojson',
    bidang: 'Bidang_Tanah_Munggung.geojson',
    lahan:  'PL_Munggung.geojson'
};

/* ════════════════════════════════════
   INISIALISASI MAP
════════════════════════════════════ */
const map = L.map('map', {
    center: [-7.708586, 110.727661],
    zoom: 14,
    zoomControl: false,
    scrollWheelZoom: false,
    wheelDebounceTime: 150,
    wheelPxPerZoomLevel: 120
});

L.control.zoom({ position:'bottomright' }).addTo(map);

/* ── Custom scroll zoom: maksimal 1 level per event ── */
(function(){
    let _zoomTimeout = null;
    let _zoomLocked  = false;

    map.getContainer().addEventListener('wheel', function(e){
        e.preventDefault();
        if(_zoomLocked) return;

        _zoomLocked = true;
        const delta = e.deltaY < 0 ? 1 : -1;
        const currentZoom = map.getZoom();
        const targetZoom  = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), currentZoom + delta));

        // Zoom ke posisi kursor
        const containerPoint = map.mouseEventToContainerPoint(e);
        const latlng = map.containerPointToLatLng(containerPoint);
        map.setZoomAround(latlng, targetZoom, { animate: true });

        clearTimeout(_zoomTimeout);
        _zoomTimeout = setTimeout(function(){ _zoomLocked = false; }, 300);
    }, { passive: false });
})();

/* BASE MAPS */
const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© OpenStreetMap contributors', maxZoom:20
}).addTo(map);

const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution:'© Esri', maxZoom:20 }
);

const topoLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    { attribution:'© Esri, HERE, Garmin, Intermap, USGS, FAO, EPA, NPS', maxZoom:20 }
);

/* Drawn layers */
const drawnItems = new L.FeatureGroup().addTo(map);

/* Leaflet Draw tools */
const drawControl = new L.Control.Draw({
    position: 'topright',
    edit:{ featureGroup: drawnItems },
    draw:{
        polygon:{ shapeOptions:{ color:'#1a4d6e', fillOpacity:0.1 }},
        polyline:{ shapeOptions:{ color:'#e74c3c' }},
        rectangle:{ shapeOptions:{ color:'#27ae60', fillOpacity:0.1 }},
        circle:{ shapeOptions:{ color:'#8e44ad' }},
        marker:true,
        circlemarker:false
    }
});
map.addControl(drawControl);

/* Helper: buat GeoJSON dari drawn layer */
function drawnLayerToFC(layer, type){
    let geometry;
    if(type === 'polyline'){
        const lls = layer.getLatLngs();
        geometry = { type:'LineString', coordinates: lls.map(ll=>[ll.lng, ll.lat]) };
    } else if(type === 'polygon' || type === 'rectangle'){
        const lls = layer.getLatLngs()[0];
        const coords = lls.map(ll=>[ll.lng, ll.lat]);
        coords.push(coords[0]);
        geometry = { type:'Polygon', coordinates:[coords] };
    } else if(type === 'circle'){
        // Aproksimasi lingkaran sebagai polygon 64 titik
        const center = layer.getLatLng();
        const r = layer.getRadius();
        const pts = [];
        for(let i=0;i<64;i++){
            const angle = (i/64)*2*Math.PI;
            const dx = r * Math.cos(angle) / (111320 * Math.cos(center.lat * Math.PI/180));
            const dy = r * Math.sin(angle) / 110540;
            pts.push([center.lng + dx, center.lat + dy]);
        }
        pts.push(pts[0]);
        geometry = { type:'Polygon', coordinates:[pts] };
    } else if(type === 'marker'){
        const ll = layer.getLatLng();
        geometry = { type:'Point', coordinates:[ll.lng, ll.lat] };
    } else {
        geometry = null;
    }
    return { type:'FeatureCollection', features:[{ type:'Feature', geometry, properties:{ type } }] };
}

map.on(L.Draw.Event.CREATED, function(e){
    const layer = e.layer;
    const type  = e.layerType;
    drawnItems.addLayer(layer);

    // ID unik untuk setiap drawn layer agar download bisa diidentifikasi
    const drawId = 'draw_' + Date.now();
    layer._drawId   = drawId;
    layer._drawType = type;

    if(type === 'polyline'){
        const latlngs = layer.getLatLngs();
        let total = 0;
        for(let i=0;i<latlngs.length-1;i++) total += latlngs[i].distanceTo(latlngs[i+1]);
        const totalKm = (total/1000).toFixed(4);
        const content = `
        <div class="measure-popup-wrap">
            <div class="measure-popup-header">📏 Hasil Pengukuran Jarak</div>
            <div class="measure-popup-body">
                <div class="measure-stat-row">
                    <span class="measure-stat-key">JARAK TOTAL</span>
                    <span class="measure-stat-val highlight">${total.toFixed(2)} m</span>
                </div>
                <div class="measure-stat-row">
                    <span class="measure-stat-key">DALAM KM</span>
                    <span class="measure-stat-val">${totalKm} km</span>
                </div>
                <div class="measure-stat-row">
                    <span class="measure-stat-key">TITIK SIMPUL</span>
                    <span class="measure-stat-val">${latlngs.length} titik</span>
                </div>
            </div>
            <div class="measure-dl-label">⬇ Unduh Gambar</div>
            <div class="measure-dl-row">
                <button class="measure-dl-btn measure-dl-geojson" onclick="downloadDrawnLayer('${drawId}','geojson')">📄 GeoJSON</button>
                <button class="measure-dl-btn measure-dl-csv" onclick="downloadDrawnLayer('${drawId}','csv')">📊 CSV</button>
                <button class="measure-dl-btn measure-dl-del" onclick="deleteDrawnLayer('${drawId}')">🗑️ Hapus</button>
            </div>
        </div>`;
        layer.bindPopup(L.popup({ maxWidth:300, className:'measure-popup' }).setContent(content));
        layer.openPopup(latlngs[latlngs.length-1]);
        measureActive = false;
        _activeMeasureHandler = null;
        document.getElementById('tool-measure').classList.remove('active');
    }
    else if(type === 'polygon' || type === 'rectangle'){
        const coords = layer.getLatLngs()[0].map(ll=>[ll.lng, ll.lat]);
        coords.push(coords[0]);
        const poly = turf.polygon([coords]);
        const areaM2 = turf.area(poly);
        const areaHa = (areaM2/10000).toFixed(4);
        const keliling = coords.slice(0,-1).reduce((tot, c, i, arr) => {
            const next = arr[(i+1)%arr.length];
            return tot + L.latLng(c[1],c[0]).distanceTo(L.latLng(next[1],next[0]));
        }, 0);
        const typeLabel = type === 'rectangle' ? '⬛ Persegi Panjang' : '🔷 Poligon';
        const content = `
        <div class="measure-popup-wrap">
            <div class="measure-popup-header">📐 Hasil Pengukuran Luas — ${typeLabel}</div>
            <div class="measure-popup-body">
                <div class="measure-stat-row">
                    <span class="measure-stat-key">LUAS AREA</span>
                    <span class="measure-stat-val highlight">${areaM2.toFixed(2)} m²</span>
                </div>
                <div class="measure-stat-row">
                    <span class="measure-stat-key">DALAM HEKTAR</span>
                    <span class="measure-stat-val">${areaHa} Ha</span>
                </div>
                <div class="measure-stat-row">
                    <span class="measure-stat-key">KELILING</span>
                    <span class="measure-stat-val">${keliling.toFixed(2)} m</span>
                </div>
                <div class="measure-stat-row">
                    <span class="measure-stat-key">JUMLAH TITIK</span>
                    <span class="measure-stat-val">${coords.length - 1} titik</span>
                </div>
            </div>
            <div class="measure-dl-label">⬇ Unduh Gambar</div>
            <div class="measure-dl-row">
                <button class="measure-dl-btn measure-dl-geojson" onclick="downloadDrawnLayer('${drawId}','geojson')">📄 GeoJSON</button>
                <button class="measure-dl-btn measure-dl-csv" onclick="downloadDrawnLayer('${drawId}','csv')">📊 CSV</button>
                <button class="measure-dl-btn measure-dl-del" onclick="deleteDrawnLayer('${drawId}')">🗑️ Hapus</button>
            </div>
        </div>`;
        layer.bindPopup(L.popup({ maxWidth:320, className:'measure-popup' }).setContent(content));
        layer.openPopup(layer.getBounds().getCenter());
    }
    else if(type === 'circle'){
        const radius = layer.getRadius();
        const areaM2 = Math.PI * radius * radius;
        const areaHa = (areaM2/10000).toFixed(4);
        const content = `
        <div class="measure-popup-wrap">
            <div class="measure-popup-header">⭕ Hasil Pengukuran Lingkaran</div>
            <div class="measure-popup-body">
                <div class="measure-stat-row">
                    <span class="measure-stat-key">RADIUS</span>
                    <span class="measure-stat-val highlight">${radius.toFixed(2)} m</span>
                </div>
                <div class="measure-stat-row">
                    <span class="measure-stat-key">LUAS AREA</span>
                    <span class="measure-stat-val">${areaM2.toFixed(2)} m²</span>
                </div>
                <div class="measure-stat-row">
                    <span class="measure-stat-key">DALAM HEKTAR</span>
                    <span class="measure-stat-val">${areaHa} Ha</span>
                </div>
                <div class="measure-stat-row">
                    <span class="measure-stat-key">KELILING</span>
                    <span class="measure-stat-val">${(2*Math.PI*radius).toFixed(2)} m</span>
                </div>
            </div>
            <div class="measure-dl-label">⬇ Unduh Gambar</div>
            <div class="measure-dl-row">
                <button class="measure-dl-btn measure-dl-geojson" onclick="downloadDrawnLayer('${drawId}','geojson')">📄 GeoJSON</button>
                <button class="measure-dl-btn measure-dl-csv" onclick="downloadDrawnLayer('${drawId}','csv')">📊 CSV</button>
                <button class="measure-dl-btn measure-dl-del" onclick="deleteDrawnLayer('${drawId}')">🗑️ Hapus</button>
            </div>
        </div>`;
        layer.bindPopup(L.popup({ maxWidth:300, className:'measure-popup' }).setContent(content));
        layer.openPopup(layer.getLatLng());
    }
    else if(type === 'marker'){
        const ll = layer.getLatLng();
        const content = `
        <div class="measure-popup-wrap">
            <div class="measure-popup-header">📍 Koordinat Titik</div>
            <div class="measure-popup-body">
                <div class="measure-stat-row">
                    <span class="measure-stat-key">LATITUDE</span>
                    <span class="measure-stat-val highlight">${ll.lat.toFixed(7)}°</span>
                </div>
                <div class="measure-stat-row">
                    <span class="measure-stat-key">LONGITUDE</span>
                    <span class="measure-stat-val highlight">${ll.lng.toFixed(7)}°</span>
                </div>
                <div class="measure-stat-row">
                    <span class="measure-stat-key">CRS</span>
                    <span class="measure-stat-val">EPSG:4326 WGS 84</span>
                </div>
            </div>
            <div class="measure-dl-label">⬇ Unduh Titik</div>
            <div class="measure-dl-row">
                <button class="measure-dl-btn measure-dl-geojson" onclick="downloadDrawnLayer('${drawId}','geojson')">📄 GeoJSON</button>
                <button class="measure-dl-btn measure-dl-csv" onclick="downloadDrawnLayer('${drawId}','csv')">📊 CSV</button>
                <button class="measure-dl-btn measure-dl-del" onclick="deleteDrawnLayer('${drawId}')">🗑️ Hapus</button>
            </div>
        </div>`;
        layer.bindPopup(L.popup({ maxWidth:280, className:'measure-popup' }).setContent(content));
        layer.openPopup(ll);
    }
});

/* Download drawn layer berdasarkan drawId */
function downloadDrawnLayer(drawId, format){
    let targetLayer = null;
    drawnItems.eachLayer(l => { if(l._drawId === drawId) targetLayer = l; });
    if(!targetLayer){ alert('Layer gambar tidak ditemukan'); return; }
    const fc = drawnLayerToFC(targetLayer, targetLayer._drawType);
    const fname = `gambar_${targetLayer._drawType}_${drawId.replace('draw_','')}`;
    if(format === 'geojson') downloadAsGeoJSON(fc, fname);
    else if(format === 'csv') downloadAsCSV(fc, fname);
}

/* Hapus drawn layer berdasarkan drawId */
function deleteDrawnLayer(drawId){
    let targetLayer = null;
    drawnItems.eachLayer(l => { if(l._drawId === drawId) targetLayer = l; });
    if(!targetLayer) return;
    map.closePopup();
    drawnItems.removeLayer(targetLayer);
}

/* ════════════════════════════════════
   LEAFLET LAYERS — GeoJSON
════════════════════════════════════ */
let leafletLayers = {
    admin:  null,
    bidang: null,
    lahan:  null
};

let currentOpacity = 0.9;
/* ── State filter aktif untuk bidang tanah ── */
let activeFilter = { luasMin:null, luasMax:null, hak:'', zona:'' };

/* Helper: terapkan filter aktif ke semua layer bidang */
function applyFilterToLayer(){
    if(!leafletLayers.bidang) return;
    const hasFilter = activeFilter.luasMin!==null || activeFilter.luasMax!==null
                      || activeFilter.hak || activeFilter.zona;
    leafletLayers.bidang.eachLayer(l => {
        if(!l.feature) return;
        const p = l.feature.properties;
        if(!hasFilter){
            // Reset ke tampilan normal
            l.setStyle({ opacity:1, fillOpacity:currentOpacity,
                fillColor:getBidangColor(p.STATUS), color:'#333333', weight:0.6 });
            if(l._path) l._path.style.pointerEvents = '';
            return;
        }
        let match = true;
        if(activeFilter.luasMin!==null && (p.LUAS||0) < activeFilter.luasMin) match = false;
        if(activeFilter.luasMax!==null && (p.LUAS||0) > activeFilter.luasMax) match = false;
        if(activeFilter.hak  && p.STATUS !== activeFilter.hak)  match = false;
        if(activeFilter.zona && p.ZONA   !== activeFilter.zona) match = false;

        if(match){
            l.setStyle({ opacity:1, fillOpacity:currentOpacity,
                fillColor:getBidangColor(p.STATUS), color:'#333333', weight:0.6 });
            if(l._path) l._path.style.pointerEvents = '';
        } else {
            l.setStyle({ opacity:0, fillOpacity:0 });
            if(l._path) l._path.style.pointerEvents = 'none';
        }
    });
}

/* Helper: terapkan gaya filter ke satu layer (dipanggil setelah mouseout) */
function _applyCurrentFilterStyle(layer){
    if(!layer.feature) return;
    const hasFilter = activeFilter.luasMin!==null || activeFilter.luasMax!==null
                      || activeFilter.hak || activeFilter.zona;
    if(!hasFilter) return;
    const p = layer.feature.properties;
    let match = true;
    if(activeFilter.luasMin!==null && (p.LUAS||0) < activeFilter.luasMin) match = false;
    if(activeFilter.luasMax!==null && (p.LUAS||0) > activeFilter.luasMax) match = false;
    if(activeFilter.hak  && p.STATUS !== activeFilter.hak)  match = false;
    if(activeFilter.zona && p.ZONA   !== activeFilter.zona) match = false;
    if(!match){
        layer.setStyle({ opacity:0, fillOpacity:0 });
        if(layer._path) layer._path.style.pointerEvents='none';
    }
}


/* ── Warna STATUS bidang tanah ── */
function getBidangColor(status){
    const map = {
        'Hak Milik':          '#ffea00',
        'Hak Guna Bangunan':  '#00c853',
        'Hak Pakai':          '#2979ff',
        'Hak Wakaf':          '#ff6d00',
        'Kosong':             '#bdbdbd'
    };
    return map[status] || '#bdbdbd';
}

/* ── Warna JENIS penggunaan lahan ── */
function getLahanColor(jenis){
    const map = {
        'Saluran Air':                      '#4da6ff',
        'Bangunan Hunian':                  '#f06292',
        'Bangunan Kesehatan':               '#ef5350',
        'Bangunan Pendidikan':              '#00bcd4',
        'Bangunan Perdagangan dan Jasa':    '#f1c40f',
        'Bangunan Peribadatan':             '#ab47bc',
        'Bangunan Perkantoran':             '#29b6f6',
        'Jalan':                            '#90a4ae',
        'Lapangan Tidak Diperkeras':        '#c8e6c9',
        'Pekarangan':                       '#795548',
        'Pemakaman':                        '#7b1fa2',
        'Permukaan/Lapangan Diperkeras':    '#ff9800',
        'Sawah':                            '#43a047',
        'Tegalan/Ladang':                   '#a8d5a2'
    };
    return map[jenis] || '#aaaaaa';
}

/* ── Warna per desa administrasi ── */
const DESA_COLORS = {
    'Babadan':     { fill:'#e74c3c', border:'#c0392b' },
    'Bakungan':    { fill:'#e67e22', border:'#ca6f1e' },
    'Bulusan':     { fill:'#f1c40f', border:'#d4ac0d' },
    'Demangan':    { fill:'#2ecc71', border:'#27ae60' },
    'Karangdowo':  { fill:'#1abc9c', border:'#17a589' },
    'Karangjoho':  { fill:'#3498db', border:'#2980b9' },
    'Karangtalun': { fill:'#9b59b6', border:'#8e44ad' },
    'Karangwungu': { fill:'#e91e63', border:'#c2185b' },
    'Kupang':      { fill:'#00bcd4', border:'#0097a7' },
    'Munggung':    { fill:'#ff5722', border:'#e64a19' },
    'Ngolodono':   { fill:'#8bc34a', border:'#689f38' },
    'Pugeran':     { fill:'#607d8b', border:'#455a64' },
    'Ringinputih': { fill:'#795548', border:'#5d4037' },
    'Sentono':     { fill:'#f06292', border:'#e91e63' },
    'Soka':        { fill:'#aed581', border:'#8bc34a' },
    'Tambak':      { fill:'#4dd0e1', border:'#00bcd4' },
    'Tegalampel':  { fill:'#7986cb', border:'#3f51b5' },
    'Tulas':       { fill:'#a1887f', border:'#795548' },
    'Tumpukan':    { fill:'#ffd54f', border:'#ffa000' },
};

/* ── Buat layer GeoJSON Administrasi ── */
function buildAdminLayer(data){
    return L.geoJSON(data, {
        style: function(feature){
            const desa = feature.properties.DESA || '';
            const c = DESA_COLORS[desa] || { fill:'#f6c667', border:'#c97d11' };
            return {
                color: c.border,
                weight: 2.5,
                fillColor: c.fill,
                fillOpacity: currentOpacity * 0.55,
                opacity: 1
            };
        },
        onEachFeature: function(feature, layer){
            const p = feature.properties;
            const desa  = p.DESA       || '-';
            const kec   = p.KECAMATAN  || '-';
            const kab   = p.KABUPATEN  || '-';
            const prov  = p.PROVINSI   || '-';
            const luasHa  = p.luas != null ? Number(p.luas) : null;
            const luasKm2 = luasHa != null ? luasHa / 100 : null;
            const luas    = luasHa != null
                ? luasHa.toLocaleString('id-ID', {maximumFractionDigits:3}) + ' Ha <span style="color:#888;font-size:11px;">(' + luasKm2.toLocaleString('id-ID', {minimumFractionDigits:4, maximumFractionDigits:4}) + ' km²)</span>'
                : '-';
            const c = DESA_COLORS[desa] || { fill:'#f6c667', border:'#c97d11' };
            layer.bindPopup(`
                <div class="popup-header" style="background:linear-gradient(135deg,${c.border},${c.fill});color:${desa==='Bulusan'||desa==='Tumpukan'?'#1a2a3a':'white'};">🏘️ Batas Administrasi</div>
                <div class="popup-body">
                    <table class="popup-tbl">
                        <tr><td>Desa</td><td><strong>${desa}</strong></td></tr>
                        <tr><td>Kecamatan</td><td>${kec}</td></tr>
                        <tr><td>Kabupaten</td><td>${kab}</td></tr>
                        <tr><td>Provinsi</td><td>${prov}</td></tr>
                        <tr><td>Luas Desa</td><td>${luas}</td></tr>
                    </table>
                </div>
                <div class="popup-dl-label">⬇ Unduh Data Desa ${desa}</div>
                <div class="popup-dl-row">
                    <button class="popup-dl-btn popup-dl-geojson" onclick="exportFeatureAdminFormat('${desa}','geojson')">📄 GeoJSON</button>
                    <button class="popup-dl-btn popup-dl-csv" onclick="exportFeatureAdminFormat('${desa}','csv')">📊 CSV</button>
                </div>`, { maxWidth:400, minWidth:320 });

            layer.on('mouseover', function(e){
                layer.setStyle({ fillOpacity: 0.8, weight:3.5 });
            });
            layer.on('mouseout', function(e){
                leafletLayers.admin && leafletLayers.admin.resetStyle(layer);
            });
        }
    });
}

/* ── Buat layer GeoJSON Bidang Tanah ── */
function buildBidangLayer(data){
    return L.geoJSON(data, {
        style: function(feature){
            return {
                color: '#333333',
                weight: 0.6,
                fillColor: getBidangColor(feature.properties.STATUS),
                fillOpacity: currentOpacity,
                opacity: 1
            };
        },
        onEachFeature: function(feature, layer){
            const p    = feature.properties;
            const nop  = p.D_NOP  || '-';
            const stat = p.STATUS || '-';
            const zona = p.ZONA   || '-';
            const luas = p.LUAS != null ? Number(p.LUAS).toLocaleString('id-ID', {maximumFractionDigits:2}) + ' m\u00b2' : '-';
            const badgeMap={
                'Hak Milik':'badge-hm','Hak Guna Bangunan':'badge-hgb',
                'Hak Pakai':'badge-hak-pakai','Hak Wakaf':'badge-wakaf','Kosong':'badge-kosong'
            };

            layer.bindPopup(`
                <div class="popup-header">\ud83d\udccd Bidang Tanah</div>
                <div class="popup-body">
                    <table class="popup-tbl">
                        <tr><td>NOP</td><td><strong>${nop}</strong></td></tr>
                        <tr><td>Status Hak</td><td><span class="result-badge ${badgeMap[stat]||'badge-kosong'}" style="font-size:11px;">${stat}</span></td></tr>
                        <tr><td>Zona</td><td>${zona}</td></tr>
                        <tr><td>Luas</td><td><strong>${luas}</strong></td></tr>
                    </table>
                </div>
                <div class="popup-dl-label">⬇ Unduh Persil ${nop}</div>
                <div class="popup-dl-row">
                    <button class="popup-dl-btn popup-dl-geojson" onclick="exportPersilFormat('${nop}','geojson')">📄 GeoJSON</button>
                    <button class="popup-dl-btn popup-dl-csv" onclick="exportPersilFormat('${nop}','csv')">📊 CSV</button>
                </div>`, { maxWidth:420, minWidth:340 });

            layer.on('mouseover', function(){
                layer.setStyle({
                    weight: 3.5,
                    color: '#ff1744',
                    fillColor: '#ff1744',
                    fillOpacity: 0.52,
                    opacity: 1
                });
                layer.bringToFront();
            });
            layer.on('mouseout', function(){
                if(leafletLayers.bidang) leafletLayers.bidang.resetStyle(layer);
                _applyCurrentFilterStyle(layer);
            });
        }
    });
}

/* ── Buat layer GeoJSON Penggunaan Lahan ── */
function buildLahanLayer(data){
    return L.geoJSON(data, {
        style: function(feature){
            return {
                color: '#555555',
                weight: 0.5,
                fillColor: getLahanColor(feature.properties.JENIS),
                fillOpacity: currentOpacity,
                opacity: 1
            };
        },
        onEachFeature: function(feature, layer){
            const p    = feature.properties;
            const tema = p.TEMA       || '-';
            const jenis= p.JENIS      || '-';
            const bang = p.JENIS_BANG || '-';
            const luas = p.Luas != null ? Number(p.Luas).toLocaleString('id-ID', {maximumFractionDigits:2}) + ' m²' : '-';

            layer.bindPopup(`
                <div class="popup-header">🌿 Penggunaan Lahan</div>
                <div class="popup-body">
                    <table class="popup-tbl">
                        <tr><td>Tema</td><td>${tema}</td></tr>
                        <tr><td>Jenis</td><td><strong>${jenis}</strong></td></tr>
                        <tr><td>Jenis Bangunan</td><td>${bang}</td></tr>
                        <tr><td>Luas</td><td>${luas}</td></tr>
                    </table>
                </div>
                <div class="popup-dl-label">⬇ Unduh Lahan — ${jenis}</div>
                <div class="popup-dl-row">
                    <button class="popup-dl-btn popup-dl-geojson" onclick="exportLahanByJenis('${jenis.replace(/'/g,"\\'")}','geojson')">📄 GeoJSON</button>
                    <button class="popup-dl-btn popup-dl-csv" onclick="exportLahanByJenis('${jenis.replace(/'/g,"\\'")}','csv')">📊 CSV</button>
                </div>`, { maxWidth:400, minWidth:320 });

            // Simpan ref feature ke layer agar bisa diakses dari tombol
            layer._lahanFeatureProps = { tema, jenis, luas };

            layer.on('mouseover', function(){
                layer.setStyle({
                    weight: 3,
                    color: '#ff6f00',
                    fillColor: '#ffea00',
                    fillOpacity: 0.75,
                    opacity: 1
                });
                layer.bringToFront();
            });
            layer.on('mouseout', function(){
                leafletLayers.lahan && leafletLayers.lahan.resetStyle(layer);
            });
        }
    });
}

/* ════════════════════════════════════
   LOAD SEMUA DATA GEOJSON — lazy load per layer
════════════════════════════════════ */
async function loadAllGeoJSON(){
    // Hanya preload jika sudah ada checkbox yang aktif,
    // atau langsung selesai — data diload saat layer di-toggle
    const loading    = document.getElementById('loading-overlay');
    loading.style.display = 'none'; // langsung hide, load dilakukan per layer
    console.log('Siap. Data akan diload saat layer diaktifkan.');
}

/* ════════════════════════════════════
   CEK PERAN USER
════════════════════════════════════ */
function checkUser(){
    const stored = localStorage.getItem('sip_session') || localStorage.getItem('sip_user');
    if(stored){
        try{
            const u = JSON.parse(stored);
            const displayName = u.name || u.username || 'Pengguna';
            document.getElementById('user-name').textContent = displayName;
            document.getElementById('user-icon').textContent = u.role==='superuser'?'🛡️':'👤';
            if(u.role==='superuser'){
                // Upload section ditampilkan di dalam modal katalog
                const uploadSec = document.getElementById('katalog-upload-section');
                if(uploadSec) uploadSec.style.display = 'block';
            }
            return u;
        }catch(e){ return null; }
    }
    document.getElementById('user-name').textContent = 'Guest';
    return null;
}
checkUser();

function logout(){
    if(confirm('Keluar dari sistem?')){
        localStorage.removeItem('sip_session');
        localStorage.removeItem('sip_user');
        window.location.href='login.html';
    }
}

/* ════════════════════════════════════
   LAYER TOGGLE
════════════════════════════════════ */
async function toggleLayer(name, chk){
    if(chk.checked){
        if(!geojsonData[name]){
            const loading    = document.getElementById('loading-overlay');
            const loadingTxt = document.getElementById('loading-text');
            loading.style.display = 'flex';
            loadingTxt.textContent = `Memuat ${GEOJSON_FILES[name]}…`;
            try{
                const res = await fetch(GEOJSON_FILES[name]);
                if(!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                geojsonData[name] = data;
                console.log(`✅ ${GEOJSON_FILES[name]} berhasil dimuat:`, data.features ? data.features.length + ' fitur' : 'OK');
            } catch(err){
                loading.style.display = 'none';
                console.error(`Gagal memuat ${GEOJSON_FILES[name]}:`, err);
                const info = document.getElementById('layer-load-info');
                if(info){
                    info.textContent = `⚠️ File ${GEOJSON_FILES[name]} tidak ditemukan. Pastikan file ada di folder yang sama dengan peta2.html`;
                    info.style.display = 'block';
                    setTimeout(()=>{ info.style.display='none'; }, 6000);
                }
                chk.checked = false;
                updateLegend();
                return;
            }
            loading.style.display = 'none';
        }

        // Rebuild layer jika belum ada atau data berubah
        if(!leafletLayers[name]){
            if(name === 'admin')  leafletLayers.admin  = buildAdminLayer(geojsonData.admin);
            if(name === 'bidang') leafletLayers.bidang = buildBidangLayer(geojsonData.bidang);
            if(name === 'lahan')  leafletLayers.lahan  = buildLahanLayer(geojsonData.lahan);
        }

        const zOrders = { lahan:300, bidang:400, admin:500 };
        if(leafletLayers[name]){
            leafletLayers[name].addTo(map);
            // Atur urutan tampil menggunakan bringToFront/bringToBack
            if(name === 'admin') leafletLayers[name].bringToFront();
            else if(name === 'bidang'){
                leafletLayers[name].bringToFront();
                if(leafletLayers.admin && map.hasLayer(leafletLayers.admin)) leafletLayers.admin.bringToFront();
            } else if(name === 'lahan'){
                leafletLayers[name].bringToBack();
            }
            // Terapkan filter aktif jika ada
            if(name === 'bidang' && (activeFilter.hak || activeFilter.zona || activeFilter.luasMin !== null || activeFilter.luasMax !== null)){
                applyFilterToLayer();
            }
        }
    } else {
        if(leafletLayers[name]) map.removeLayer(leafletLayers[name]);
    }
    updateLegend();
    renderActiveOverlayList();
}

/* ════════════════════════════════════
   KATALOG DATA — modal tengah
════════════════════════════════════ */
const CATALOG_CHK = { bidang:'chk-bidang', lahan:'chk-lahan', admin:'chk-admin' };

const CATALOG_META = {
    bidang: { name:'Bidang Tanah',       file:'Bidang_Tanah_Munggung.geojson',  swatch:'linear-gradient(135deg,#ffea00,#f6c667)', icon:'🟨' },
    lahan:  { name:'Penggunaan Lahan',   file:'PL_Munggung.geojson',            swatch:'linear-gradient(135deg,#43a047,#a8d5a2)', icon:'🟩' },
};

/* State: dataset yang masih tersedia di katalog (belum dihapus admin) */
const SIP_KATALOG_KEY = 'sip_katalog_state_v1';

function _saveKatalogState(){
    try{
        // Hanya simpan state built-in (bidang/lahan/admin) yang di-hapus
        const state = {
            bidang: katalogAvailable.bidang !== false,
            lahan:  katalogAvailable.lahan  !== false,
            admin:  katalogAvailable.admin  !== false
        };
        localStorage.setItem(SIP_KATALOG_KEY, JSON.stringify(state));
    } catch(e){}
}

function _loadKatalogState(){
    try{
        const raw = localStorage.getItem(SIP_KATALOG_KEY);
        if(!raw) return;
        const state = JSON.parse(raw);
        if(state.bidang === false) katalogAvailable.bidang = false;
        if(state.lahan  === false) katalogAvailable.lahan  = false;
        if(state.admin  === false) katalogAvailable.admin  = false;
    } catch(e){}
}

let katalogAvailable = { bidang:true, lahan:true, admin:true };
_loadKatalogState(); // pulihkan state hapus built-in layer saat load

function openKatalogModal(){
    renderKatalogModal();
    document.getElementById('katalog-modal').style.display = 'block';
}

function closeKatalogModal(){
    document.getElementById('katalog-modal').style.display = 'none';
}

function renderKatalogModal(){
    const list = document.getElementById('katalog-modal-list');
    const isSuperuser = _isCurrentUserSuperuser();
    const keys = Object.keys(katalogAvailable).filter(k => katalogAvailable[k]);

    if(!keys.length){
        list.innerHTML = `<div style="text-align:center;padding:32px 16px;color:#7a90a4;font-family:'Inter',sans-serif;font-size:13px;">
            <div style="font-size:32px;margin-bottom:10px;">📭</div>
            Tidak ada dataset tersedia di katalog.
        </div>`;
        return;
    }

    list.innerHTML = keys.map(k => {
        const m   = CATALOG_META[k];
        if(!m) return '';
        const isUploaded = m.isUploaded;

        // Untuk layer upload: cek apakah benar-benar aktif di peta
        let aktif = false;
        if(isUploaded){
            aktif = !!(m.uploadedLayerName && uploadedLayerRegistry[m.uploadedLayerName] && map.hasLayer(uploadedLayerRegistry[m.uploadedLayerName]));
        } else {
            const chk = document.getElementById(CATALOG_CHK[k]);
            aktif = chk && chk.checked;
        }

        const badgeClass = aktif ? 'kat-badge-aktif' : 'kat-badge-off';
        const badgeLabel = aktif ? '● Aktif di Peta' : '○ Belum Ditambahkan';
        const layerBtnClass = aktif ? 'kat-action-btn kat-btn-layer-on' : 'kat-action-btn';
        const layerBtnIcon  = aktif ? '👁️' : '＋';
        const layerBtnLabel = aktif ? 'Hapus Layer' : 'Tambah ke Layer';

        const hapusBtn = isSuperuser ? `
            <button class="kat-action-btn kat-btn-hapus" onclick="katalogHapusData('${k}')" title="Hapus dari katalog (permanen)">
                <span class="kat-act-icon">🗑️</span>Hapus Data
            </button>` : '';

        // Tombol Simpan (hanya admin, hanya untuk uploaded layer)
        const savePermBtn = (isSuperuser && isUploaded) ? `
            <button class="kat-action-btn kat-btn-save-perm" onclick="saveLayerToServer('${k}')" title="Simpan layer ke server (multi-user)">
                <span class="kat-act-icon">💾</span>Simpan
            </button>` : '';

        // Tombol Edit Klasifikasi & Warna (hanya admin, hanya uploaded layer)
        const editStyleBtn = (isSuperuser && isUploaded) ? `
            <button class="kat-action-btn kat-btn-edit-style" onclick="openEditStyleModal('${k}')" title="Ubah klasifikasi & warna">
                <span class="kat-act-icon">🎨</span>Edit Klasifikasi
            </button>` : '';

        // Download: tersedia untuk semua layer (built-in & uploaded), semua user
        const downloadBtn = isUploaded
            ? `<button class="kat-action-btn" onclick="showDownloadModal(_uploadedLayerData['${m.uploadedLayerName.replace(/'/g,"\\'")}'], '${m.name.replace(/'/g,"\\'")}')">
                <span class="kat-act-icon">⬇️</span>Download Data
            </button>`
            : `<button class="kat-action-btn" onclick="downloadLayerDirect('${k}')">
                <span class="kat-act-icon">⬇️</span>Download Data
            </button>`;

        return `
        <div class="kat-card" id="kat-card-${k}">
            <div class="kat-card-head">
                <div class="kat-card-swatch" style="background:${m.swatch};">${m.icon}</div>
                <div class="kat-card-info">
                    <div class="kat-card-name">${m.name}</div>
                    <div class="kat-card-file">${m.file}</div>
                </div>
                <span class="kat-card-badge ${badgeClass}" id="kat-badge-${k}">${badgeLabel}</span>
            </div>
            <div class="kat-card-actions">
                <button class="${layerBtnClass}" id="kat-layer-btn-${k}" onclick="katalogToggleLayer('${k}')">
                    <span class="kat-act-icon" id="kat-layer-icon-${k}">${layerBtnIcon}</span>
                    <span id="kat-layer-label-${k}">${layerBtnLabel}</span>
                </button>
                ${downloadBtn}
                ${editStyleBtn}
                ${savePermBtn}
                ${hapusBtn}
            </div>
        </div>`;
    }).join('');
}

function katalogToggleLayer(key){
    const m = CATALOG_META[key];
    if(!m) return;

    // Untuk layer upload: toggle dari/ke peta
    if(m.isUploaded && m.uploadedLayerName){
        const name  = m.uploadedLayerName;
        const layer = uploadedLayerRegistry[name];

        if(layer && map.hasLayer(layer)){
            // Layer aktif di peta → hapus dari peta saja (bukan dari katalog)
            map.removeLayer(layer);
            delete uploadedLayerRegistry[name];
            _uploadedLayerVisibility[name] = false;
            _saveUploadedLayers();
        } else {
            // Layer belum/sudah diremove dari peta → tambahkan kembali dari data lokal
            const data = _uploadedLayerData[name];
            if(!data){ _showToast('⚠️ Data layer tidak tersedia, upload ulang file.', 'error'); return; }

            const col        = _uploadedLayerBaseColor[name] || '#888888';
            const op         = (_uploadedLayerOpacity[name] !== undefined ? _uploadedLayerOpacity[name] : 35) / 100;
            const colorMap   = _uploadedLayerColorMap[name] || null;
            const classField = (_uploadedLayerClassField && _uploadedLayerClassField[name]) || null;

            const newLayer = L.geoJSON(data, {
                style: function(feat){
                    // Style per-fitur: pakai colorMap jika sudah ada klasifikasi
                    if(colorMap && classField && feat.properties){
                        const val = String(feat.properties[classField] ?? '(kosong)');
                        const fc  = colorMap[val] || col;
                        return { color: fc, weight: 1.5, fillColor: fc, fillOpacity: op, opacity: 1 };
                    }
                    return { color: col, weight: 2, fillColor: col, fillOpacity: op, opacity: 1 };
                },
                onEachFeature: function(feat, lyr){
                    _bindUploadedPopup(lyr, feat, name);
                    lyr.on('mouseover', function(){
                        lyr.setStyle({ weight:3.5, color:'#ff1744', fillColor:'#ff1744', fillOpacity:0.6, opacity:1 });
                        lyr.bringToFront();
                    });
                    lyr.on('mouseout', function(){
                        _restoreFeatureStyle(lyr, name);
                    });
                }
            }).addTo(map);

            uploadedLayerRegistry[name]    = newLayer;
            _uploadedLayerVisibility[name] = true;
            _saveUploadedLayers();
        }
        renderActiveOverlayList();
        renderUploadedLayerList();
        updateLegend();
        _refreshKatCard(key);
        return;
    }

    const chk = document.getElementById(CATALOG_CHK[key]);
    if(!chk) return;
    chk.checked = !chk.checked;
    toggleLayer(key, chk);
    updateCatalogBtn(key);
    renderActiveOverlayList();
    /* Update badge & tombol di modal tanpa re-render seluruh modal */
    _refreshKatCard(key);
}

function _refreshKatCard(key){
    const m = CATALOG_META[key];
    let aktif = false;
    if(m && m.isUploaded){
        aktif = !!(m.uploadedLayerName && uploadedLayerRegistry[m.uploadedLayerName] && map.hasLayer(uploadedLayerRegistry[m.uploadedLayerName]));
    } else {
        const chk = document.getElementById(CATALOG_CHK[key]);
        aktif = chk && chk.checked;
    }
    const badge = document.getElementById('kat-badge-' + key);
    const btn   = document.getElementById('kat-layer-btn-' + key);
    const icon  = document.getElementById('kat-layer-icon-' + key);
    const lbl   = document.getElementById('kat-layer-label-' + key);
    if(badge){ badge.className = 'kat-card-badge ' + (aktif ? 'kat-badge-aktif' : 'kat-badge-off'); badge.textContent = aktif ? '● Aktif di Peta' : '○ Belum Ditambahkan'; }
    if(btn)  { btn.className = aktif ? 'kat-action-btn kat-btn-layer-on' : 'kat-action-btn'; }
    if(icon) { icon.textContent = aktif ? '👁️' : '＋'; }
    if(lbl)  { lbl.textContent  = aktif ? 'Hapus Layer' : 'Tambah ke Layer'; }
}

function katalogHapusData(key){
    const m = CATALOG_META[key];
    const isUploaded = m.isUploaded;
    const pesanHapus = isUploaded
        ? `Hapus "${m.name}" dari katalog data?\n\n⚠️ Data ini akan dihapus permanen dari katalog dan peta. Untuk menampilkan kembali, Admin harus upload ulang file tersebut.`
        : `Hapus "${m.name}" dari katalog data?\n\n⚠️ Data ini akan dihapus permanen dari katalog. Untuk menampilkan kembali, Admin harus upload ulang file tersebut.`;
    if(!confirm(pesanHapus)) return;

    /* Matikan layer jika aktif */
    if(isUploaded && m.uploadedLayerName){
        // Hapus dari uploadedLayerRegistry juga
        if(uploadedLayerRegistry[m.uploadedLayerName]){
            map.removeLayer(uploadedLayerRegistry[m.uploadedLayerName]);
            delete uploadedLayerRegistry[m.uploadedLayerName];
        }
        delete _uploadedLayerVisibility[m.uploadedLayerName];
    } else {
        const chk = document.getElementById(CATALOG_CHK[key]);
        if(chk && chk.checked){ chk.checked = false; toggleLayer(key, chk); }
    }

    /* Tandai tidak tersedia */
    katalogAvailable[key] = false;
    if(isUploaded){
        // Bersihkan semua data upload untuk layer ini
        const uname = m.uploadedLayerName;
        if(uname){
            delete _uploadedLayerData[uname];
            delete _uploadedLayerColorMap[uname];
            delete _uploadedLayerOpacity[uname];
            delete _uploadedLayerBaseColor[uname];
            delete _uploadedLayerVisibility[uname];
            // Hapus juga dari server (jika tersimpan)
            deleteLayerFromServer(uname);
        }
        delete CATALOG_META[key];
        _saveUploadedLayers(); // simpan perubahan (layer terhapus tidak akan ada di array)
    } else {
        _saveKatalogState(); // simpan status hapus built-in layer
    }
    updateCatalogBtn(key);
    renderActiveOverlayList();

    /* Hapus kartu dari modal secara realtime */
    const card = document.getElementById('kat-card-' + key);
    if(card){
        card.style.transition = 'all 0.25s';
        card.style.opacity = '0'; card.style.transform = 'scale(0.95)';
        setTimeout(() => { card.remove(); _checkKatalogEmpty(); }, 260);
    }
}

function _checkKatalogEmpty(){
    const list = document.getElementById('katalog-modal-list');
    if(list && !list.querySelector('.kat-card')){
        list.innerHTML = `<div style="text-align:center;padding:32px 16px;color:#7a90a4;font-family:'Inter',sans-serif;font-size:13px;">
            <div style="font-size:32px;margin-bottom:10px;">📭</div>
            Tidak ada dataset tersedia di katalog.
        </div>`;
    }
}

function _isCurrentUserSuperuser(){
    try{
        const stored = localStorage.getItem('sip_session') || localStorage.getItem('sip_user');
        if(stored){ const u = JSON.parse(stored); return u.role === 'superuser'; }
    }catch(e){}
    return false;
}

function updateCatalogBtn(key){
    /* Tombol lama di HTML sudah tidak ada, tapi fungsi ini masih dipanggil
       dari beberapa tempat — biarkan kosong / sync saja */
    const chk = document.getElementById(CATALOG_CHK[key]);
    const btn = document.getElementById('cat-btn-' + key);
    if(!chk || !btn) return;
    if(chk.checked){ btn.textContent='−'; btn.title='Hapus dari Peta'; btn.classList.add('cat-btn-active'); }
    else            { btn.textContent='＋'; btn.title='Tambah ke Peta';  btn.classList.remove('cat-btn-active'); }
}

/* Render daftar overlay aktif di bawah tombol katalog */
function renderActiveOverlayList(){
    const el = document.getElementById('active-overlay-list');
    if(!el) return;
    const activeKeys = ['bidang','lahan','admin'].filter(k => {
        const chk = document.getElementById(CATALOG_CHK[k]);
        return chk && chk.checked;
    });
    // Hanya tampilkan uploaded layer yang benar-benar aktif di peta
    const uploadedKeys = Object.keys(uploadedLayerRegistry).filter(name =>
        uploadedLayerRegistry[name] && map.hasLayer(uploadedLayerRegistry[name])
    );

    if(!activeKeys.length && !uploadedKeys.length){ el.innerHTML = ''; return; }

    const catalogItems = activeKeys.map(k => {
        const m = CATALOG_META[k];
        const isVisible = _layerVisibility[k] !== false;
        return `
        <div class="active-overlay-item" id="overlay-item-${k}">
            <div class="overlay-swatch" style="background:${m.swatch};"></div>
            <span class="overlay-name">${m.name}</span>
            <button class="overlay-eye-btn" onclick="toggleLayerVisibility('${k}')" title="${isVisible ? 'Sembunyikan layer' : 'Tampilkan layer'}" style="opacity:${isVisible?'1':'0.45'}">
                ${isVisible ? '👁️' : '🙈'}
            </button>
            <span class="overlay-remove-hint" onclick="removeActiveOverlay('${k}')" title="Hapus dari peta">✕</span>
        </div>`;
    }).join('');

    const uploadItems = uploadedKeys.map(name => {
        const isVisible = _uploadedLayerVisibility[name] !== false;
        const cleanName = _cleanLayerName(name);
        const shortName = cleanName.length > 24 ? cleanName.substring(0, 22) + '…' : cleanName;
        const safeId = CSS.escape(name);
        const safeName = name.replace(/'/g,"\\'");
        return `
        <div class="active-overlay-item" id="overlay-item-up-${safeId}">
            <div class="overlay-swatch" style="background:linear-gradient(135deg,#a78bfa,#7c3aed);"></div>
            <span class="overlay-name">${shortName}</span>
            <button class="overlay-eye-btn" onclick="toggleUploadedLayerVisibility('${safeName}')" title="${isVisible ? 'Sembunyikan' : 'Tampilkan'}" style="opacity:${isVisible?'1':'0.45'}">
                ${isVisible ? '👁️' : '🙈'}
            </button>
            <span class="overlay-remove-hint" onclick="removeUploadedLayer('${safeName}');" title="Hapus dari peta">✕</span>
        </div>`;
    }).join('');

    el.innerHTML = catalogItems + uploadItems;
}

function removeActiveOverlay(key){
    const chk = document.getElementById(CATALOG_CHK[key]);
    if(!chk) return;
    chk.checked = false;
    toggleLayer(key, chk);
    updateCatalogBtn(key);
    renderActiveOverlayList();
    _refreshKatCard(key);
}

/* Toggle visibilitas layer katalog (mata) */
function toggleLayerVisibility(key){
    const isCurrentlyVisible = _layerVisibility[key] !== false;
    _layerVisibility[key] = !isCurrentlyVisible;
    const layer = leafletLayers[key];
    if(layer){
        if(_layerVisibility[key]){
            layer.eachLayer(l => { if(l._path) l._path.style.display = ''; });
        } else {
            layer.eachLayer(l => { if(l._path) l._path.style.display = 'none'; });
        }
    }
    renderActiveOverlayList();
}

/* Toggle visibilitas layer upload (mata) — sembunyikan/tampilkan via CSS,
   layer tetap terdaftar di peta agar tidak hilang dari overlay list */
function toggleUploadedLayerVisibility(name){
    const isCurrentlyVisible = _uploadedLayerVisibility[name] !== false;
    _uploadedLayerVisibility[name] = !isCurrentlyVisible;
    const layer = uploadedLayerRegistry[name];
    if(layer){
        if(_uploadedLayerVisibility[name]){
            layer.eachLayer(l => { if(l._path) l._path.style.display = ''; });
        } else {
            layer.eachLayer(l => { if(l._path) l._path.style.display = 'none'; });
        }
    }
    renderActiveOverlayList();
    updateLegend();
}

/* Sinkron badge modal saat layer di-toggle dari luar */
['bidang','lahan','admin'].forEach(key => {
    document.addEventListener('DOMContentLoaded', () => {
        const chk = document.getElementById(CATALOG_CHK[key]);
        if(chk) chk.addEventListener('change', () => {
            updateCatalogBtn(key);
            renderActiveOverlayList();
            _refreshKatCard(key);
        });
    });
});

function switchBasemap(type){
    map.removeLayer(osmLayer);
    map.removeLayer(satelliteLayer);
    map.removeLayer(topoLayer);
    if(type==='osm')  map.addLayer(osmLayer);
    else if(type==='sat')  map.addLayer(satelliteLayer);
    else if(type==='topo') map.addLayer(topoLayer);
}

function setOverlayOpacity(val){
    document.getElementById('opacity-label').textContent = val + '%';
    currentOpacity = val / 100;
    ['admin','bidang','lahan'].forEach(name => {
        if(leafletLayers[name]){
            leafletLayers[name].eachLayer(l => {
                if(l.setStyle){
                    if(name === 'admin')  l.setStyle({ fillOpacity: currentOpacity * 0.45 });
                    else                   l.setStyle({ fillOpacity: currentOpacity });
                }
            });
        }
    });
    // Terapkan juga ke semua uploaded layers
    Object.keys(uploadedLayerRegistry).forEach(name => {
        const layer = uploadedLayerRegistry[name];
        if(layer){
            layer.eachLayer(l => {
                if(l.setStyle) l.setStyle({ fillOpacity: currentOpacity });
            });
        }
        _uploadedLayerOpacity[name] = Number(val);
    });
    _saveUploadedLayers();
}

function updateLegend(){
    const bidangOn = document.getElementById('chk-bidang').checked;
    const lahanOn  = document.getElementById('chk-lahan').checked;
    const adminOn  = document.getElementById('chk-admin').checked;
    document.getElementById('legend-bidang').style.display = bidangOn ? 'block' : 'none';
    document.getElementById('legend-lahan').style.display  = lahanOn  ? 'block' : 'none';
    document.getElementById('legend-admin').style.display  = adminOn  ? 'block' : 'none';
    const hasUploadedLegend = renderUploadedLayerLegends();
    document.getElementById('legend-empty').style.display  = (!bidangOn && !lahanOn && !adminOn && !hasUploadedLegend) ? 'block' : 'none';
}

/* Render legenda otomatis untuk setiap uploaded layer yang aktif
   — Menggunakan classField & colorMap yang sudah di-set via Edit Klasifikasi */
function renderUploadedLayerLegends(){
    const container = document.getElementById('legend-uploaded-layers');
    if(!container) return false;
    // Hanya tampilkan legenda untuk layer yang aktif di peta DAN sedang visible
    const activeKeys = Object.keys(uploadedLayerRegistry).filter(name =>
        uploadedLayerRegistry[name] &&
        map.hasLayer(uploadedLayerRegistry[name]) &&
        _uploadedLayerVisibility[name] !== false
    );
    if(!activeKeys.length){ container.innerHTML=''; return false; }

    const palette = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c',
                     '#e67e22','#34495e','#e91e63','#00bcd4','#ff5722','#8bc34a'];
    const skipKeys = new Set(['id','fid','gid','objectid','shape_area','shape_leng','ogc_fid']);
    const labelKey = { 'Jenis_Tana':'Jenis Tanah','Jenis_Tanah':'Jenis Tanah' };

    container.innerHTML = activeKeys.map(name => {
        const layerData = _uploadedLayerData[name];
        if(!layerData) return '';
        const features = layerData.features || [];
        if(!features.length) return '';

        // ── Prioritas: pakai classField yang sudah di-set lewat Edit Klasifikasi ──
        // classField tersimpan di _uploadedLayerClassField[name] (diisi saat applyEditStyle)
        const allKeys = Object.keys(features[0].properties || {});
        let catKey = _uploadedLayerClassField && _uploadedLayerClassField[name]
            ? _uploadedLayerClassField[name]
            : allKeys.find(k =>
                !skipKeys.has(k.toLowerCase()) &&
                !k.toLowerCase().includes('luas') &&
                !k.toLowerCase().includes('area') &&
                typeof features[0].properties[k] === 'string'
              ) || allKeys[0];

        if(!catKey) return '';

        // Kumpulkan nilai unik dari field yang aktif
        const uniqueVals = [...new Set(
            features.map(f => String(f.properties[catKey] ?? '(kosong)')).filter(Boolean)
        )].sort();

        // Buat / pakai colorMap yang sudah ada
        if(!_uploadedLayerColorMap[name]){
            _uploadedLayerColorMap[name] = {};
            uniqueVals.forEach((v,i) => { _uploadedLayerColorMap[name][v] = palette[i % palette.length]; });
        }
        const colorMap = _uploadedLayerColorMap[name];

        const displayKey = labelKey[catKey] || catKey;
        const layerShortName = _cleanLayerName(name);
        // Legenda > 6 item: 2 kolom; ≤ 6: 1 kolom
        const gridClass = uniqueVals.length > 6 ? 'legend-grid' : 'legend-grid one-col';

        return `
        <div class="legend-section" id="legend-upload-${CSS.escape(name)}" style="margin-top:10px;">
            <div class="legend-title" style="display:flex;align-items:center;gap:6px;">
                <span>📂 ${layerShortName}</span>
            </div>
            <div style="font-size:10px;color:#7a90a4;margin-bottom:5px;font-family:'Inter',sans-serif;">
                Berdasarkan: <strong>${displayKey}</strong>
            </div>
            <div class="${gridClass}" style="margin-bottom:6px;">
                ${uniqueVals.slice(0,20).map(v => `
                <div class="legend-item">
                    <div class="legend-dot" style="background:${colorMap[v] || '#888'};border:1px solid rgba(0,0,0,0.15);flex-shrink:0;"></div>
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${v}">${v}</span>
                </div>`).join('')}
                ${uniqueVals.length > 20 ? `<div style="font-size:10px;color:#7a90a4;font-style:italic;grid-column:1/-1;">+${uniqueVals.length-20} lainnya...</div>` : ''}
            </div>
        </div>`;
    }).join('');

    return activeKeys.length > 0;
}

function setUploadedLayerOpacity(name, val){
    _uploadedLayerOpacity[name] = Number(val);
    const lbl = document.getElementById('opacity-label-up-' + CSS.escape(name));
    if(lbl) lbl.textContent = val + '%';
    const layer = uploadedLayerRegistry[name];
    if(layer){
        layer.eachLayer(l => {
            if(l.setStyle) l.setStyle({ fillOpacity: Number(val)/100 });
        });
    }
    _saveUploadedLayers();
}

/* ════════════════════════════════════
   TOOL: UKUR
════════════════════════════════════ */
let measureActive = false;
let _activeMeasureHandler = null;

function setTool(t){
    if(t === 'measure'){
        if(measureActive){
            measureActive = false;
            document.getElementById('tool-measure').classList.remove('active');
            // Batalkan drawing yang sedang aktif
            if(_activeMeasureHandler){
                try{ _activeMeasureHandler.disable(); } catch(e){}
                _activeMeasureHandler = null;
            }
            // Paksa reset cursor & state Leaflet Draw
            map.fire('draw:canceled');
        } else {
            measureActive = true;
            document.getElementById('tool-measure').classList.add('active');
            _activeMeasureHandler = new L.Draw.Polyline(map, drawControl.options.draw.polyline);
            _activeMeasureHandler.enable();
        }
    }
}

/* ════════════════════════════════════
   KOORDINAT & ZOOM DISPLAY
════════════════════════════════════ */
map.on('mousemove', function(e){
    document.getElementById('coordinate-box').innerHTML =
        `Lat: ${e.latlng.lat.toFixed(6)} | Lng: ${e.latlng.lng.toFixed(6)} | Zoom: ${map.getZoom()} | CRS: EPSG:4326`;
});
map.on('zoomend', function(){
    document.getElementById('coordinate-box').innerHTML = `Zoom: ${map.getZoom()} | CRS: EPSG:4326`;
});

/* ════════════════════════════════════
   CARI DESA — dinamis dari data admin
════════════════════════════════════ */
async function cariDesa(){
    const keyword = document.getElementById('search-desa').value.trim().toLowerCase();
    const el = document.getElementById('search-result');
    if(!keyword){ el.textContent=''; return; }

    // Jika data admin belum dimuat, fetch dulu tanpa perlu aktifkan layer
    if(!geojsonData.admin){
        el.innerHTML = '<span style="color:#7a90a4;">⏳ Memuat data lokasi…</span>';
        try{
            const res = await fetch(GEOJSON_FILES.admin);
            if(!res.ok) throw new Error(`HTTP ${res.status}`);
            geojsonData.admin = await res.json();
        } catch(err){
            el.innerHTML = '<span style="color:#e74c3c;">❌ Gagal memuat data lokasi.</span>';
            return;
        }
    }

    const feats = geojsonData.admin.features;

    // Prioritas 1: exact match DESA
    const exactDesa = feats.filter(f =>
        (f.properties.DESA||'').toLowerCase() === keyword
    );
    // Prioritas 2: partial match DESA (nama desa mengandung keyword)
    const partialDesa = feats.filter(f =>
        (f.properties.DESA||'').toLowerCase().includes(keyword) &&
        (f.properties.DESA||'').toLowerCase() !== keyword
    );

    // Prioritas 3: match KECAMATAN — dijadikan SATU entry per kecamatan unik
    // (bukan semua desa dalam kecamatan itu)
    const kecNames = [...new Set(
        feats
            .filter(f => (f.properties.KECAMATAN||'').toLowerCase().includes(keyword)
                && !exactDesa.includes(f) && !partialDesa.includes(f))
            .map(f => f.properties.KECAMATAN)
    )];

    // Prioritas 4: match KABUPATEN — satu entry per kabupaten unik
    const kabNames = [...new Set(
        feats
            .filter(f => (f.properties.KABUPATEN||'').toLowerCase().includes(keyword)
                && !exactDesa.includes(f) && !partialDesa.includes(f)
                && !kecNames.includes(f.properties.KECAMATAN))
            .map(f => f.properties.KABUPATEN)
    )];

    // Bangun daftar hasil: desa individual + kecamatan sebagai grup + kabupaten sebagai grup
    const resultItems = []; // { label, feats, type }

    exactDesa.forEach(f => resultItems.push({
        label: `Desa ${f.properties.DESA}`,
        feats: [f], type: 'desa'
    }));
    partialDesa.forEach(f => resultItems.push({
        label: `Desa ${f.properties.DESA}`,
        feats: [f], type: 'desa'
    }));
    kecNames.forEach(kec => {
        const kecFeats = feats.filter(f => f.properties.KECAMATAN === kec);
        // Hapus "Kecamatan " di awal jika ada agar tidak dobel
        const kecLabel = kec.replace(/^kecamatan\s+/i, '');
        resultItems.push({ label: `Kec. ${kecLabel}`, feats: kecFeats, type: 'kecamatan' });
    });
    kabNames.forEach(kab => {
        const kabFeats = feats.filter(f => f.properties.KABUPATEN === kab);
        const kabLabel = kab.replace(/^kabupaten\s+/i, '').replace(/^kota\s+/i, 'Kota ');
        resultItems.push({ label: `Kab. ${kabLabel}`, feats: kabFeats, type: 'kabupaten' });
    });

    if(!resultItems.length){
        el.innerHTML = '<span style="color:#e74c3c;">⚠️ Lokasi tidak ditemukan</span>';
        return;
    }

    // Kalau hanya 1 hasil — langsung zoom
    if(resultItems.length === 1){
        const r = resultItems[0];
        const group = L.geoJSON({ type:'FeatureCollection', features: r.feats });
        const bounds = group.getBounds();
        if(bounds.isValid()) map.fitBounds(bounds, { padding:[60,60], maxZoom:16 });
        const p = r.feats[0].properties;
        const info = r.type === 'desa'
            ? `<strong>${p.DESA}</strong> — Kec. ${p.KECAMATAN.replace(/^kecamatan\s+/i,'')}`
            : r.label;
        el.innerHTML = `<span style="color:#27ae60;">✅ ${info}</span>`;
        return;
    }

    // Beberapa hasil — tampilkan daftar pilihan
    window._cariDesaResults = resultItems;
    const items = resultItems.map((r, i) => `
        <div onclick="zoomToDesa(${i})" style="
            cursor:pointer;padding:5px 8px;border-radius:7px;font-size:11px;
            background:#f0f8ff;border:1px solid #d0e8f8;color:#1a4d6e;
            transition:background 0.15s;"
            onmouseover="this.style.background='#d0e8f8'"
            onmouseout="this.style.background='#f0f8ff'">
            📍 ${r.label}
        </div>`).join('');

    el.innerHTML = `
        <div style="color:#7a90a4;font-size:11px;margin-bottom:5px;">
            Ditemukan ${resultItems.length} lokasi — pilih salah satu:
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">${items}</div>`;
}

function zoomToDesa(idx){
    const r = window._cariDesaResults && window._cariDesaResults[idx];
    if(!r) return;
    const group = L.geoJSON({ type:'FeatureCollection', features: r.feats });
    const bounds = group.getBounds();
    if(bounds.isValid()) map.fitBounds(bounds, { padding:[60,60], maxZoom:16 });
    const p = r.feats[0].properties;
    const info = r.type === 'desa'
        ? `<strong>${p.DESA}</strong> — Kec. ${p.KECAMATAN.replace(/^kecamatan\s+/i,'')}`
        : r.label;
    document.getElementById('search-result').innerHTML =
        `<span style="color:#27ae60;">✅ ${info}</span>`;
}

/* ════════════════════════════════════
   QUERY / FILTER — dari data aktual
════════════════════════════════════ */
function toggleQueryPanel(){
    const p = document.getElementById('query-panel');
    const isHidden = p.style.display === 'none' || p.style.display === '';
    p.style.display = isHidden ? 'flex' : 'none';
    if(isHidden){
        document.getElementById('solver-panel').style.display='none';
    }
}

function runQuery(){
    const luasMin = document.getElementById('f-luas-min').value;
    const luasMax = document.getElementById('f-luas-max').value;
    const hak     = document.getElementById('f-hak').value;
    const zona    = document.getElementById('f-zona').value;
    const status  = document.getElementById('query-status');

    if(!geojsonData.bidang){
        status.innerHTML = '<span style="color:#e74c3c;">⚠️ Data Bidang Tanah belum dimuat. Aktifkan layer terlebih dahulu.</span>';
        return;
    }

    const mn = luasMin !== '' ? Number(luasMin) : null;
    const mx = luasMax !== '' ? Number(luasMax) : null;

    const ZONA_EXCLUDE = ['Zona Badan Jalan','Zona Badan Air'];

    const results = geojsonData.bidang.features.filter(f => {
        const p = f.properties;
        if(ZONA_EXCLUDE.includes(p.ZONA)) return false;
        if(mn !== null && (p.LUAS||0) < mn) return false;
        if(mx !== null && (p.LUAS||0) > mx) return false;
        if(hak  && p.STATUS !== hak)  return false;
        if(zona && p.ZONA   !== zona)  return false;
        return true;
    }).map(f => ({
        noHak: f.properties.D_NOP   || '-',
        nib:   f.properties.D_NOP   || '-',
        luas:  f.properties.LUAS    || 0,
        hak:   f.properties.STATUS  || '-',
        zona:  f.properties.ZONA    || '-'
    }));

    let desc = [];
    if(mn !== null) desc.push(`Luas ≥ ${mn} m²`);
    if(mx !== null) desc.push(`Luas ≤ ${mx} m²`);
    if(hak)  desc.push(`Status: ${hak}`);
    if(zona) desc.push(`Zona: ${zona}`);
    status.innerHTML = `<b>Filter:</b> ${desc.join(', ')||'(semua data)'}`;

    showResults(results);
    status.innerHTML += `<br><span style="color:#27ae60;">✅ ${results.length} persil ditemukan.</span>`;

    // Simpan state filter aktif
    activeFilter = { luasMin: mn, luasMax: mx, hak: hak, zona: zona };

    if(leafletLayers.bidang && document.getElementById('chk-bidang').checked){
        applyFilterToLayer();
    }
}

function showResults(results){
    const el = document.getElementById('result-list');
    if(!results.length){
        el.innerHTML='<div style="font-size:12px;color:#7a90a4;padding:4px;">Tidak ada data yang sesuai kriteria</div>';
        return;
    }
    const shown = results; // Tampilkan semua
    const badgeMap={
        'Hak Milik':'badge-hm',
        'Hak Guna Bangunan':'badge-hgb',
        'Hak Pakai':'badge-hak-pakai',
        'Hak Wakaf':'badge-wakaf',
        'Kosong':'badge-kosong'
    };

    const headerHtml = `
        <div style="display:flex;justify-content:space-between;align-items:center;
            padding:7px 10px;background:linear-gradient(135deg,rgba(26,77,110,0.08),rgba(36,91,125,0.08));
            border-radius:9px;margin-bottom:8px;border:1px solid rgba(26,77,110,0.12);">
            <span style="font-size:11px;font-weight:700;color:var(--blue);font-family:'Montserrat',sans-serif;">
                📋 ${results.length} persil ditemukan
            </span>
        </div>`;

    el.innerHTML = headerHtml + shown.map((r,i)=>`
        <div class="result-item" onclick="zoomToPersil('${r.noHak}')" title="Klik untuk menuju persil di peta"
             style="cursor:pointer;position:relative;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <strong>${r.noHak}</strong>
                <span style="font-size:10px;background:rgba(26,77,110,0.08);color:var(--blue);
                    padding:2px 7px;border-radius:10px;font-family:'Montserrat',sans-serif;font-weight:700;">
                    #${i+1}
                </span>
            </div>
            <div class="result-meta">NOP: ${r.nib}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px;">
                <span class="result-badge ${badgeMap[r.hak]||'badge-kosong'}">${r.hak}</span>
                <span style="font-size:11px;color:#7a90a4;">${Number(r.luas).toLocaleString('id-ID')} m²</span>
            </div>
            <div style="font-size:10px;color:#aaa;margin-top:3px;">${r.zona}</div>
            <div style="position:absolute;right:10px;bottom:10px;font-size:10px;color:var(--blue2);opacity:0.6;">📍 Menuju →</div>
        </div>`).join('');
}

/* Zoom ke persil berdasarkan NOP */
function zoomToPersil(nop){
    if(!geojsonData.bidang){ alert('Aktifkan layer Bidang Tanah terlebih dahulu.'); return; }

    const feat = geojsonData.bidang.features.find(f => f.properties.D_NOP === nop);
    if(!feat){ alert('Persil tidak ditemukan di data.'); return; }

    const chk = document.getElementById('chk-bidang');
    if(!chk.checked){
        chk.checked = true;
        toggleLayer('bidang', chk);
    }

    const coords = feat.geometry.coordinates;
    const allPts = [];
    function collectPts(c){
        if(typeof c[0] === 'number'){ allPts.push(L.latLng(c[1], c[0])); return; }
        c.forEach(collectPts);
    }
    collectPts(coords);

    if(allPts.length){
        const bounds = L.latLngBounds(allPts);
        map.fitBounds(bounds, { padding:[80,80], maxZoom:19 });

        setTimeout(()=>{
            if(leafletLayers.bidang){
                leafletLayers.bidang.eachLayer(l => {
                    if(l.feature && l.feature.properties.D_NOP === nop){
                        l.openPopup();
                        // Highlight mencolok: kuning terang transparan + border merah
                        l.setStyle({ weight:4, color:'#ff1744', fillColor:'#ffff00', fillOpacity:0.65 });
                        l.bringToFront();
                        setTimeout(()=>{
                            if(leafletLayers.bidang) leafletLayers.bidang.resetStyle(l);
                            _applyCurrentFilterStyle(l);
                        }, 3500);
                    }
                });
            }
        }, 600);
    }
}

function clearResults(){
    document.getElementById('result-list').innerHTML='<div style="font-size:12px;color:#7a90a4;padding:4px;">Belum ada hasil</div>';
    if(leafletLayers.bidang){
        leafletLayers.bidang.eachLayer(l => {
            if(l.feature) leafletLayers.bidang.resetStyle(l);
        });
    }
}

function resetFilter(){
    ['f-luas-min','f-luas-max'].forEach(id=>document.getElementById(id).value='');
    ['f-hak','f-zona'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('query-status').innerHTML='';
    activeFilter = { luasMin:null, luasMax:null, hak:'', zona:'' };
    // reset semua layer bidang ke tampilan normal
    applyFilterToLayer();
    clearResults();
}

/* ════════════════════════════════════
   PENCARI TANAH / SOLVER — data aktual
════════════════════════════════════ */
function toggleSolverPanel(){
    const p = document.getElementById('solver-panel');
    p.style.display = p.style.display==='none' ? 'block' : 'none';
    if(p.style.display==='block'){
        document.getElementById('query-panel').style.display='none';
    }
}

function runSolver(){
    const luas   = Number(document.getElementById('s-luas').value);
    const tol    = 20;
    const tujuan = document.getElementById('s-tujuan').value;
    const hak    = document.getElementById('s-hak').value;
    const jalanPref = document.getElementById('s-jalan').value; // 'semua'|'ya'|'tidak'
    const el     = document.getElementById('solver-result');

    if(!luas){ alert('Masukkan kebutuhan luas terlebih dahulu'); return; }
    if(!geojsonData.bidang){
        el.innerHTML = '<div style="color:#e74c3c;font-size:12px;margin-top:10px;">⚠️ Aktifkan layer Bidang Tanah terlebih dahulu.</div>';
        return;
    }

    const luasMin = luas * (1 - tol/100);
    const luasMax = luas * (1 + tol/100);

    const ZONA_EXCLUDE = ['Zona Badan Jalan','Zona Badan Air'];

    // Kumpulkan NOP persil yang bersebelahan dengan Zona Badan Jalan
    // Cara: cek apakah ada fitur Zona Badan Jalan yang batas-batasnya overlap/touch
    // Pendekatan praktis: gunakan bounding box kedekatan (threshold ~0.0003 derajat ≈ 30m)
    let nopDekatJalan = null;
    if(jalanPref !== 'semua' && geojsonData.bidang){
        const THRESHOLD = 0.0003; // ~30 meter dalam derajat
        const jalanFeatures = geojsonData.bidang.features.filter(f =>
            f.properties.ZONA === 'Zona Badan Jalan'
        );
        // Buat bbox gabungan semua fitur jalan (diperlebar threshold)
        const jalanBoxes = jalanFeatures.map(f => {
            const coords = [];
            function collectC(c){ if(typeof c[0]==='number') coords.push(c); else c.forEach(collectC); }
            collectC(f.geometry.coordinates);
            const lngs = coords.map(c=>c[0]), lats = coords.map(c=>c[1]);
            return {
                minLng: Math.min(...lngs) - THRESHOLD,
                maxLng: Math.max(...lngs) + THRESHOLD,
                minLat: Math.min(...lats) - THRESHOLD,
                maxLat: Math.max(...lats) + THRESHOLD
            };
        });

        // Fungsi: apakah bbox persil overlap dengan salah satu bbox jalan
        function persilDekatJalan(feat){
            const coords = [];
            function collectC(c){ if(typeof c[0]==='number') coords.push(c); else c.forEach(collectC); }
            collectC(feat.geometry.coordinates);
            const lngs = coords.map(c=>c[0]), lats = coords.map(c=>c[1]);
            const pMinLng = Math.min(...lngs), pMaxLng = Math.max(...lngs);
            const pMinLat = Math.min(...lats), pMaxLat = Math.max(...lats);
            return jalanBoxes.some(b =>
                pMinLng <= b.maxLng && pMaxLng >= b.minLng &&
                pMinLat <= b.maxLat && pMaxLat >= b.minLat
            );
        }

        nopDekatJalan = new Set(
            geojsonData.bidang.features
                .filter(f => !ZONA_EXCLUDE.includes(f.properties.ZONA) && persilDekatJalan(f))
                .map(f => f.properties.D_NOP)
        );
    }

    const results = geojsonData.bidang.features.filter(f => {
        const p = f.properties;
        if(ZONA_EXCLUDE.includes(p.ZONA)) return false;
        if((p.LUAS||0) < luasMin || (p.LUAS||0) > luasMax) return false;
        if(hak && p.STATUS !== hak) return false;
        if(jalanPref === 'ya'    && nopDekatJalan && !nopDekatJalan.has(p.D_NOP)) return false;
        if(jalanPref === 'tidak' && nopDekatJalan &&  nopDekatJalan.has(p.D_NOP)) return false;
        return true;
    }).map(f => ({
        noHak: f.properties.D_NOP  || '-',
        nib:   f.properties.D_NOP  || '-',
        luas:  f.properties.LUAS   || 0,
        hak:   f.properties.STATUS || '-',
        zona:  f.properties.ZONA   || '-',
        dekatJalan: nopDekatJalan ? nopDekatJalan.has(f.properties.D_NOP) : null
    }));

    // ── Terapkan filter ke peta: sembunyikan yang tidak cocok ──
    activeFilter = { luasMin: luasMin, luasMax: luasMax, hak: hak, zona: '' };
    if(leafletLayers.bidang && document.getElementById('chk-bidang').checked){
        applyFilterToLayer();
    } else if(geojsonData.bidang && !document.getElementById('chk-bidang').checked){
        // Aktifkan layer otomatis agar hasil terlihat
        const chk = document.getElementById('chk-bidang');
        chk.checked = true;
        toggleLayer('bidang', chk).then(() => applyFilterToLayer());
    }

    const rekZona = {
        'Rumah Tinggal':'Zona Perumahan',
        'Pertanian':'Zona Pertanian',
        'Komersial':'Zona Perdagangan dan Jasa',
        'Fasilitas Umum':'Zona Sarana Pelayanan Umum'
    };
    const badgeMap={
        'Hak Milik':'badge-hm','Hak Guna Bangunan':'badge-hgb',
        'Hak Pakai':'badge-hak-pakai','Hak Wakaf':'badge-wakaf','Kosong':'badge-kosong'
    };
    const maxShow = results.length; // Tampilkan semua
    const shown = results;

    el.innerHTML = `
        <div class="analisis-result">
            <h4>📊 Hasil Analisis Kesesuaian</h4>
            <div class="analisis-row"><span class="analisis-key">Luas Dicari</span><span class="analisis-val">${luas.toLocaleString('id-ID')} m² (±${tol}%)</span></div>
            <div class="analisis-row"><span class="analisis-key">Rentang Luas</span><span class="analisis-val">${luasMin.toFixed(0)}–${luasMax.toFixed(0)} m²</span></div>
            <div class="analisis-row"><span class="analisis-key">Tujuan</span><span class="analisis-val">${tujuan}</span></div>
            <div class="analisis-row"><span class="analisis-key">Zona Rekomendasi</span><span class="analisis-val">${rekZona[tujuan]||'-'}</span></div>
            <div class="analisis-row"><span class="analisis-key">Status Hak</span><span class="analisis-val">${hak||'Semua'}</span></div>
            <div class="analisis-row"><span class="analisis-key">Kedekatan Jalan</span><span class="analisis-val">${jalanPref==='ya'?'🛣️ Dekat Jalan':jalanPref==='tidak'?'🌾 Jauh dari Jalan':'🔀 Semua'}</span></div>
            <div class="match-count">${results.length}<span>persil cocok ditemukan</span></div>
        </div>
        ${results.length > 0 ? `
        <div style="margin-top:10px;">
            <div style="font-size:11px;font-weight:700;color:var(--blue);font-family:'Montserrat',sans-serif;letter-spacing:0.5px;margin-bottom:6px;">
                PERSIL COCOK (${results.length} ditemukan)
            </div>
            <div style="max-height:300px;overflow-y:auto;border-radius:10px;border:1px solid #eaf0f5;scrollbar-width:thick;">
                ${shown.map(r=>`
                <div class="result-item" style="margin-bottom:0;border-radius:0;border-bottom:1px solid #f0f4f8;cursor:pointer;" onclick="zoomToPersil('${r.noHak}')">
                    <strong>${r.noHak}</strong>
                    <div class="result-meta">NOP: ${r.nib}</div>
                    <div style="display:flex;justify-content:space-between;margin-top:4px;">
                        <span class="result-badge ${badgeMap[r.hak]||'badge-kosong'}">${r.hak}</span>
                        <span style="font-size:11px;color:#7a90a4;">${Number(r.luas).toLocaleString('id-ID')} m²</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:3px;">
                        <span style="font-size:10px;color:#aaa;">${r.zona}</span>
                        ${r.dekatJalan !== null ? `<span style="font-size:10px;color:${r.dekatJalan?'#27ae60':'#7a90a4'};font-weight:600;">${r.dekatJalan?'🛣️ Dekat Jalan':'🌾 Jauh Jalan'}</span>` : ''}
                    </div>
                </div>`).join('')}
            </div>
        </div>` : ''}`;
    showResults(results);
}

function resetSolver(){
    document.getElementById('s-luas').value='';
    document.getElementById('s-hak').value='';
    document.getElementById('s-jalan').value='semua';
    document.getElementById('solver-result').innerHTML='';
    // Reset filter peta dan hasil pencarian
    activeFilter = { luasMin:null, luasMax:null, hak:'', zona:'' };
    applyFilterToLayer();
    clearResults();
}

/* ════════════════════════════════════
   CRS PANEL
════════════════════════════════════ */
function toggleCrsPanel(){
    const p = document.getElementById('crs-panel');
    p.style.display = p.style.display==='none'?'block':'none';
}

/* ════════════════════════════════════
   PANEL CARD TOGGLE
════════════════════════════════════ */
function toggleCard(id){
    const el  = document.getElementById(id);
    const tog = document.getElementById('tog-'+id);
    if(el.style.display==='none'){ el.style.display='block'; if(tog) tog.textContent='▴'; }
    else { el.style.display='none'; if(tog) tog.textContent='▾'; }
    updateStickyHeaders();
}

/* ════════════════════════════════════
   STICKY HEADER — anti tumpang tindih
   Hitung top tiap header berdasarkan
   header-header sticky di atasnya
════════════════════════════════════ */
function updateStickyHeaders(){
    const panel = document.getElementById('side-panel');
    if(!panel) return;
    const scrollTop = panel.scrollTop;
    const headers   = panel.querySelectorAll('.panel-card .panel-header');
    let stackedHeight = 0;

    headers.forEach(hdr => {
        const card   = hdr.closest('.panel-card');
        const body   = card.querySelector('.panel-body');
        const isClosed = !body || body.style.display === 'none';

        // Pojok oval
        hdr.classList.toggle('header-closed', isClosed);

        // Offset card dari top panel (termasuk scroll)
        const cardOffsetTop = card.offsetTop - scrollTop;

        if(cardOffsetTop <= stackedHeight){
            // Card sudah di atas viewport — header sedang sticky
            hdr.style.top  = stackedHeight + 'px';
            hdr.style.zIndex = 20 + stackedHeight; // lebih atas = z lebih tinggi
            stackedHeight += hdr.offsetHeight;
        } else {
            // Card masih di bawah — header belum sticky
            hdr.style.top    = '0px';
            hdr.style.zIndex = '10';
        }
    });
}

// Pasang listener scroll di side-panel setelah DOM siap
document.addEventListener('DOMContentLoaded', function(){
    const panel = document.getElementById('side-panel');
    if(panel){
        panel.addEventListener('scroll', updateStickyHeaders, { passive: true });
        updateStickyHeaders();
    }
});
// Juga update setelah 600ms (setelah animasi fadeLeft selesai)
setTimeout(updateStickyHeaders, 700);

/* ════════════════════════════════════
   FIREBASE CONFIG — Cloud realtime multi-user
   Ganti nilai di bawah dengan config project Firebase Anda.
   Cara buat:
     1. Buka https://console.firebase.google.com
     2. Buat project baru (gratis)
     3. Tambah Web App → salin firebaseConfig
     4. Di Realtime Database → Rules → set read/write "true" untuk dev
     5. Di Storage → Rules → set read/write "true" untuk dev
════════════════════════════════════ */
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

/* ── Inisialisasi Firebase (dipanggil sekali saat load) ── */
let _fbApp = null, _fbDB = null;
function _isFirebaseConfigured(){
    const k = FIREBASE_CONFIG.apiKey || '';
    // Deteksi placeholder: kosong, atau dimulai "GANTI_", atau terpotong (mis. "AIzaSy...")
    if(!k || k === 'GANTI_API_KEY' || k.endsWith('...') || k.length < 20) return false;
    if(!FIREBASE_CONFIG.databaseURL || FIREBASE_CONFIG.databaseURL.includes('undefined')) return false;
    return true;
}

function _initFirebase(){
    if(_fbApp) return true;
    if(!_isFirebaseConfigured()){
        console.warn('⚠️  Firebase belum dikonfigurasi. Buka peta2.js dan isi FIREBASE_CONFIG dengan nilai asli dari Firebase Console.');
        _showFirebaseNotConfiguredBanner();
        return false;
    }
    try{
        if(typeof firebase === 'undefined'){ console.warn('Firebase SDK belum dimuat.'); return false; }
        _fbApp = firebase.initializeApp(FIREBASE_CONFIG);
        _fbDB  = firebase.database();
        console.log('🔥 Firebase terhubung.');
        return true;
    }catch(e){ console.error('Firebase init error:', e); return false; }
}

function _showFirebaseNotConfiguredBanner(){
    const el = document.getElementById('firebase-config-banner');
    if(el) el.style.display = 'flex';
}
function _hideFirebaseNotConfiguredBanner(){
    const el = document.getElementById('firebase-config-banner');
    if(el) el.style.display = 'none';
}

/* ════════════════════════════════════
   UPLOAD — SUPERUSER: tambah layer dari file
════════════════════════════════════ */
let pendingFiles  = [];
let uploadedLayerRegistry = {};
let _layerVisibility = {};         // untuk layer katalog
let _uploadedLayerVisibility = {}; // untuk layer upload
let _uploadedLayerData = {};       // raw GeoJSON per layer upload
let _uploadedLayerColorMap = {};   // color map per kategori per layer
let _uploadedLayerOpacity = {};    // opacity per layer (0-100)
let _uploadedLayerBaseColor = {};  // warna dasar per layer
let _uploadedLayerClassField = {};  // field klasifikasi aktif per layer

/* ════════════════════════════════════
   PERSISTENSI UPLOAD — localStorage
════════════════════════════════════ */
const SIP_STORAGE_KEY = 'sip_uploaded_layers_v2';

/* Helper: ubah nama file mentah → nama tampil yang bersih
   Contoh: "Admin_Karangdowo.geojson" → "Admin Karangdowo"
           "PL_Munggung.geojson"      → "PL Munggung"
           "Bidang_Tanah_Munggung"    → "Bidang Tanah Munggung"
           "JENIS TANAH MUNGGUNG GEOJSON" → "Jenis Tanah Munggung" */
function _cleanLayerName(raw){
    return raw
        .replace(/\.(geojson|json|kml|shp)$/i, '')  // hapus ekstensi di akhir
        .replace(/[_\-]+/g, ' ')                     // ganti _ dan - dengan spasi
        .replace(/\bgeojson\b|\bjson\b|\bkml\b|\bshp\b/gi, '') // hapus kata geojson/json/kml jika masih ada
        .replace(/\s{2,}/g, ' ')                     // hapus spasi ganda
        .trim();
}

function _saveUploadedLayers(){
    try{
        // Hanya simpan ke localStorage untuk superuser — user biasa tidak punya layer lokal
        const currentUser = JSON.parse(localStorage.getItem('sip_session') || localStorage.getItem('sip_user') || '{}');
        if(currentUser.role !== 'superuser') return;

        const toSave = Object.keys(_uploadedLayerData).map(name => ({
            name,
            data:       _uploadedLayerData[name],
            color:      _uploadedLayerBaseColor[name] || '#888',
            opacity:    _uploadedLayerOpacity[name] !== undefined ? _uploadedLayerOpacity[name] : 35,
            colorMap:   _uploadedLayerColorMap[name] || null,
            classField: (_uploadedLayerClassField && _uploadedLayerClassField[name]) || null,
            visible:    false  // selalu false saat load ulang — user harus tambah manual
        }));
        localStorage.setItem(SIP_STORAGE_KEY, JSON.stringify(toSave));
    } catch(e){ console.warn('Gagal menyimpan layer:', e); }
}

function _loadUploadedLayers(){
    try{
        // Layer di localStorage hanya milik admin (superuser) — layer belum disimpan ke server
        // tidak boleh bocor ke user biasa/tamu. User lain mendapat layer via Firebase (loadLayersFromServer).
        const currentUser = JSON.parse(localStorage.getItem('sip_session') || localStorage.getItem('sip_user') || '{}');
        if(currentUser.role !== 'superuser') return;

        const raw = localStorage.getItem(SIP_STORAGE_KEY);
        if(!raw) return;
        const saved = JSON.parse(raw);
        if(!Array.isArray(saved) || !saved.length) return;

        const randomColor = () => '#' + Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0');

        saved.forEach(item => {
            const { name, data, color, opacity, colorMap, classField, visible } = item;
            if(!name || !data) return;

            if(uploadedLayerRegistry[name]) map.removeLayer(uploadedLayerRegistry[name]);

            // Restore classField DULU sebelum layer dibuat, agar style function bisa memakainya
            if(classField){
                if(!_uploadedLayerClassField) _uploadedLayerClassField = {};
                _uploadedLayerClassField[name] = classField;
            }

            const newLayer = L.geoJSON(data, {
                style: function(feat){
                    if(colorMap && classField && feat.properties){
                        const val = String(feat.properties[classField] ?? '(kosong)');
                        const fc  = colorMap[val] || color;
                        return { color: fc, weight: 1.5, fillColor: fc, fillOpacity: (opacity||35)/100, opacity: 1 };
                    }
                    return { color: color, weight: 2, fillColor: color, fillOpacity: (opacity||35)/100, opacity: 1 };
                },
                onEachFeature: function(feat, lyr){
                    _bindUploadedPopup(lyr, feat, name);
                    lyr.on('mouseover', function(){
                        lyr.setStyle({ weight:3.5, color:'#ff1744', fillColor:'#ff1744', fillOpacity:0.6, opacity:1 });
                        lyr.bringToFront();
                    });
                    lyr.on('mouseout', function(){
                        _restoreFeatureStyle(lyr, name);
                    });
                }
            });

            uploadedLayerRegistry[name]        = newLayer;
            _uploadedLayerVisibility[name]     = false;
            _uploadedLayerData[name]           = data;
            _uploadedLayerBaseColor[name]      = color;
            _uploadedLayerOpacity[name]        = opacity !== undefined ? opacity : 35;
            if(colorMap) _uploadedLayerColorMap[name] = colorMap;
            else delete _uploadedLayerColorMap[name];
            // classField sudah di-restore sebelum layer dibuat (atas), tapi pastikan tidak hilang
            if(classField){
                if(!_uploadedLayerClassField) _uploadedLayerClassField = {};
                _uploadedLayerClassField[name] = classField;
            }

            // Masukkan kembali ke CATALOG_META
            const layerKey = 'upload_' + name.replace(/[^a-zA-Z0-9]/g,'_');
            if(!CATALOG_META[layerKey]){
                CATALOG_META[layerKey] = {
                    name: _cleanLayerName(name),
                    file: name,
                    swatch: `linear-gradient(135deg,${color},${color}88)`,
                    icon: '📂',
                    isUploaded: true,
                    uploadedLayerName: name
                };
                katalogAvailable[layerKey] = true;
            }
        });

        renderUploadedLayerList();
        renderActiveOverlayList();
        updateLegend();
        // Sinkronkan opacity semua loaded layers ke slider global
        const sliderVal = document.getElementById('opacity-overlay');
        if(sliderVal){
            const globalOpacity = Number(sliderVal.value) / 100;
            Object.keys(uploadedLayerRegistry).forEach(name => {
                const layer = uploadedLayerRegistry[name];
                if(layer) layer.eachLayer(l => { if(l.setStyle) l.setStyle({ fillOpacity: globalOpacity }); });
                _uploadedLayerOpacity[name] = Number(sliderVal.value);
            });
        }
        console.log(`✅ ${saved.length} uploaded layer(s) dipulihkan dari storage.`);
    } catch(e){ console.warn('Gagal memulihkan layer:', e); }
}

/* Helper: kembalikan style fitur ke warna klasifikasi setelah mouseout.
   resetStyle() mengembalikan ke style dasar L.geoJSON — bukan ke colorMap.
   Fungsi ini harus dipanggil di mouseout sebagai ganti resetStyle. */
function _restoreFeatureStyle(lyr, name){
    const colorMap   = _uploadedLayerColorMap[name];
    const classField = _uploadedLayerClassField && _uploadedLayerClassField[name];
    const baseColor  = _uploadedLayerBaseColor[name] || '#888';
    const op         = (_uploadedLayerOpacity[name] !== undefined ? _uploadedLayerOpacity[name] : 35) / 100;

    if(colorMap && classField && lyr.feature){
        const val = String(lyr.feature.properties[classField] ?? '(kosong)');
        const col = colorMap[val] || baseColor;
        lyr.setStyle({ fillColor: col, color: col, fillOpacity: op, weight: 1.5, opacity: 1 });
    } else {
        // Tidak ada klasifikasi — kembalikan ke warna dasar
        lyr.setStyle({ fillColor: baseColor, color: baseColor, fillOpacity: op, weight: 2, opacity: 1 });
    }
}

/* Helper: bind popup untuk layer upload */
function _bindUploadedPopup(lyr, feat, layerName){
    const props = feat.properties;
    if(props){
        const rows = Object.entries(props).map(([k,v]) => {
            // Bersihkan nama kolom: ganti _ dengan spasi, trim
            const label = k.replace(/_/g, ' ').trim();
            let val = v ?? '-';
            const isLuas = k.toLowerCase().includes('luas') || k.toLowerCase() === 'area';
            if(isLuas && val !== '-' && !isNaN(Number(val))){
                const haVal = Number(val);
                const km2 = (haVal / 100).toLocaleString('id-ID', {minimumFractionDigits:4, maximumFractionDigits:4});
                val = `${haVal.toLocaleString('id-ID', {maximumFractionDigits:3})} Ha <span style="color:#7a90a4;font-size:10px;">(${km2} km²)</span>`;
            }
            return `<tr><td>${label}</td><td>${val}</td></tr>`;
        }).join('');
        const cleanName = _cleanLayerName(layerName);
        lyr.bindPopup(`
            <div class="popup-header">📂 ${cleanName}</div>
            <div class="popup-body"><table class="popup-tbl">${rows}</table></div>
            <div class="popup-dl-label">⬇ Unduh Layer</div>
            <div class="popup-dl-row">
                <button class="popup-dl-btn popup-dl-geojson" onclick="downloadUploadedLayer('${layerName.replace(/'/g,"\\'")}','geojson')">📄 GeoJSON</button>
                <button class="popup-dl-btn popup-dl-csv" onclick="downloadUploadedLayer('${layerName.replace(/'/g,"\\'")}','csv')">📊 CSV</button>
            </div>`,
            { maxWidth:420 });
    }
}

function handleFileUpload(input){
    const files = Array.from(input.files);
    files.forEach(f=>{ if(!pendingFiles.find(x=>x.name===f.name)) pendingFiles.push(f); });
    renderPendingFileList();
    input.value = '';
}

function handleDrop(e){
    e.preventDefault();
    Array.from(e.dataTransfer.files).forEach(f=>pendingFiles.push(f));
    renderPendingFileList();
}

function renderPendingFileList(){
    document.getElementById('file-list').innerHTML = pendingFiles.map((f,i)=>`
        <div class="upload-file-item">
            <span>📄 ${f.name}</span>
            <button onclick="removePendingFile(${i})" style="border:none;background:none;color:#e74c3c;cursor:pointer;font-size:14px;">✕</button>
        </div>`).join('');
}

function removePendingFile(i){ pendingFiles.splice(i,1); renderPendingFileList(); }

/* Tambahkan file ke peta sebagai layer baru + katalog (permanen sesi) */
function addFilesToMap(){
    const user = JSON.parse(localStorage.getItem('sip_session') || localStorage.getItem('sip_user') || '{}');
    if(user.role !== 'superuser'){ alert('Hanya Super User yang dapat menambahkan layer!'); return; }
    if(!pendingFiles.length){ alert('Pilih file GeoJSON terlebih dahulu!'); return; }

    const randomColor = () => '#' + Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0');

    pendingFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e){
            try{
                const data = JSON.parse(e.target.result);
                const color = randomColor();
                const layerName = file.name;

                if(uploadedLayerRegistry[layerName]){
                    map.removeLayer(uploadedLayerRegistry[layerName]);
                    delete uploadedLayerRegistry[layerName];
                }

                const newLayer = L.geoJSON(data, {
                    style: { color: color, weight: 2, fillColor: color, fillOpacity: 0.35 },
                    onEachFeature: function(feat, lyr){
                        _bindUploadedPopup(lyr, feat, layerName);
                        lyr.on('mouseover', function(){
                            lyr.setStyle({ weight:3.5, color:'#ff1744', fillColor:'#ff1744', fillOpacity:0.6, opacity:1 });
                            lyr.bringToFront();
                        });
                        lyr.on('mouseout', function(){
                            _restoreFeatureStyle(lyr, layerName);
                        });
                    }
                });

                uploadedLayerRegistry[layerName] = newLayer;
                _uploadedLayerVisibility[layerName] = false;
                _uploadedLayerData[layerName] = data;
                _uploadedLayerBaseColor[layerName] = color;
                _uploadedLayerOpacity[layerName] = 35;
                delete _uploadedLayerColorMap[layerName];

                // Tambah ke CATALOG_META sebagai entry baru
                const layerKey = 'upload_' + layerName.replace(/[^a-zA-Z0-9]/g,'_');
                if(!CATALOG_META[layerKey]){
                    CATALOG_META[layerKey] = {
                        name: _cleanLayerName(layerName),
                        file: layerName,
                        swatch: `linear-gradient(135deg,${color},${color}88)`,
                        icon: '📂',
                        isUploaded: true,
                        uploadedLayerName: layerName
                    };
                    katalogAvailable[layerKey] = true;
                    const modal = document.getElementById('katalog-modal');
                    if(modal && modal.style.display !== 'none') renderKatalogModal();
                }

                try {
                    const bounds = newLayer.getBounds();
                    if(bounds && bounds.isValid()){
                        map.fitBounds(bounds, { padding:[60, 60], maxZoom:18 });
                    }
                } catch(er){ console.warn('fitBounds error:', er); }

                _saveUploadedLayers();
                renderUploadedLayerList();
                renderActiveOverlayList();
                updateLegend();
            } catch(err){
                alert(`Gagal membaca file ${file.name}: ${err.message}`);
            }
        };
        reader.readAsText(file);
    });

    pendingFiles = [];
    renderPendingFileList();
}

/* Render daftar layer yang sudah ditambahkan */
function renderUploadedLayerList(){
    // Bagian "LAYER AKTIF" dihapus dari tampilan
    const el = document.getElementById('uploaded-layer-list');
    if(el) el.innerHTML = '';
}

/* Hapus layer tertentu dari PETA saja (tidak hapus dari katalog).
   Dipanggil dari tombol ✕ di overlay list — user biasa boleh melakukan ini. */
function removeUploadedLayer(name){
    if(uploadedLayerRegistry[name]){
        map.removeLayer(uploadedLayerRegistry[name]);
        // Hanya hapus referensi layer-nya dari registry & set visibility = false,
        // tapi JANGAN hapus dari CATALOG_META / katalogAvailable
        // agar layer tetap muncul di katalog dan bisa ditambahkan kembali.
        delete uploadedLayerRegistry[name];
        _uploadedLayerVisibility[name] = false;
        _saveUploadedLayers();
        renderUploadedLayerList();
        renderActiveOverlayList();
        updateLegend();
        // Refresh badge kartu di modal katalog jika sedang terbuka
        const layerKey = 'upload_' + name.replace(/[^a-zA-Z0-9]/g,'_');
        _refreshKatCard(layerKey);
    }
}

/* Hapus semua layer upload */
function clearAllUploadedLayers(){
    Object.keys(uploadedLayerRegistry).forEach(name => {
        map.removeLayer(uploadedLayerRegistry[name]);
        const layerKey = 'upload_' + name.replace(/[^a-zA-Z0-9]/g,'_');
        delete CATALOG_META[layerKey];
        delete katalogAvailable[layerKey];
    });
    uploadedLayerRegistry = {};
    _uploadedLayerData = {};
    _uploadedLayerColorMap = {};
    _uploadedLayerOpacity = {};
    _uploadedLayerBaseColor = {};
    _uploadedLayerVisibility = {};
    pendingFiles = [];
    localStorage.removeItem(SIP_STORAGE_KEY);
    renderPendingFileList();
    renderUploadedLayerList();
    renderActiveOverlayList();
    updateLegend();
}

/* Download uploaded layer (GeoJSON atau CSV) */
function downloadUploadedLayer(name, format){
    const data = _uploadedLayerData[name];
    if(!data){ alert('Data layer tidak ditemukan'); return; }
    const fc = (data.type === 'FeatureCollection') ? data : { type:'FeatureCollection', features: data.features || [data] };
    const fname = name.replace(/\.(geojson|json|kml)$/i,'');
    if(format === 'geojson') downloadAsGeoJSON(fc, fname);
    else if(format === 'csv') downloadAsCSV(fc, fname);
}

/* ════════════════════════════════════
   DOWNLOAD DATA — export multi-format (legacy, masih dipakai modal)
════════════════════════════════════ */
function downloadData(){
    const layerVal = document.getElementById('dl-layer') ? document.getElementById('dl-layer').value : 'bidang';
    downloadLayerDirect(layerVal);
}

/* ════════════════════════════════════
   KONVERSI GEOJSON → CSV
════════════════════════════════════ */
function geojsonToCSV(featureCollection){
    const feats = featureCollection.features || [featureCollection];
    if(!feats.length) return '';

    /* 1. Kumpulkan kolom properti dalam urutan deterministik */
    const propColsOrdered = [];
    const propColsSet     = new Set();
    feats.forEach(f => {
        Object.keys(f.properties || {}).forEach(k => {
            if(!propColsSet.has(k)){ propColsOrdered.push(k); propColsSet.add(k); }
        });
    });

    /* 2. Kolom geometri selalu di akhir */
    const geoColsOrdered = ['longitude_centroid', 'latitude_centroid', 'geometry_type', 'geometry_wkt'];
    const allCols = [...propColsOrdered, ...geoColsOrdered];

    /* 3. Helper: escape nilai CSV
       Angka float (mengandung titik desimal) selalu di-quote agar Excel
       Indonesia tidak salah baca titik sebagai pemisah ribuan. */
    function escVal(v){
        if(v === null || v === undefined) return '';
        const s = String(v);
        // Angka float: ada titik di antara digit → quote agar locale-safe
        if(/^-?\d+\.\d+$/.test(s)) return '"' + s + '"';
        return (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r'))
            ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    /* 4. Helper: ekstrak info geometri per fitur */
    function getGeoInfo(geom){
        if(!geom || !geom.coordinates) return { lng:'', lat:'', type:'', wkt:'' };
        const gtype  = geom.type || '';
        const coords = geom.coordinates;
        const pts = [];
        function flatPts(c){ if(typeof c[0]==='number'){ pts.push(c); } else { c.forEach(flatPts); } }
        flatPts(coords);
        const lng = pts.length ? (pts.reduce((s,c)=>s+c[0],0)/pts.length).toFixed(7) : '';
        const lat = pts.length ? (pts.reduce((s,c)=>s+c[1],0)/pts.length).toFixed(7) : '';
        const EXCEL_CELL_LIMIT = 32000; // Batas aman sel Excel (max 32767)
        let wkt = '';
        try{
            if(gtype === 'Point'){
                wkt = 'POINT(' + coords[0] + ' ' + coords[1] + ')';
            } else if(gtype === 'MultiPoint'){
                wkt = 'MULTIPOINT(' + coords.map(c=>'('+c[0]+' '+c[1]+')').join(', ') + ')';
            } else if(gtype === 'LineString'){
                wkt = 'LINESTRING(' + coords.map(c=>c[0]+' '+c[1]).join(', ') + ')';
            } else if(gtype === 'MultiLineString'){
                wkt = 'MULTILINESTRING(' + coords.map(ring=>'('+ring.map(c=>c[0]+' '+c[1]).join(', ')+')').join(', ') + ')';
            } else if(gtype === 'Polygon'){
                wkt = 'POLYGON(' + coords.map(ring=>'('+ring.map(c=>c[0]+' '+c[1]).join(', ')+')').join(', ') + ')';
            } else if(gtype === 'MultiPolygon'){
                wkt = 'MULTIPOLYGON(' + coords.map(poly=>'('+poly.map(ring=>'('+ring.map(c=>c[0]+' '+c[1]).join(', ')+')').join(', ')+')').join(', ') + ')';
            } else {
                wkt = gtype.toUpperCase() + '(...)';
            }
            // Jika WKT melebihi batas sel Excel, ganti dengan centroid point
            // agar baris CSV tidak pecah jadi dua baris di Excel
            if(wkt.length > EXCEL_CELL_LIMIT){
                wkt = 'POINT(' + lng + ' ' + lat + ') [geometri terlalu panjang, gunakan file GeoJSON]';
            }
        } catch(e){ wkt = ''; }
        return { lng, lat, type: gtype, wkt };
    }

    /* 5. Header */
    const header = allCols.map(escVal).join(',');

    /* 6. Baris data */
    const rows = feats.map(f => {
        const p   = f.properties || {};
        const geo = getGeoInfo(f.geometry);
        return allCols.map(col => {
            if(col === 'longitude_centroid') return geo.lng ? '"' + geo.lng + '"' : '';
            if(col === 'latitude_centroid')  return geo.lat ? '"' + geo.lat + '"' : '';
            if(col === 'geometry_type')      return geo.type;
            if(col === 'geometry_wkt')       return escVal(geo.wkt);
            return escVal(p[col] ?? '');
        }).join(',');
    });

    return header + '\n' + rows.join('\n');
}

/* ════════════════════════════════════
   DOWNLOAD HELPER
════════════════════════════════════ */
function triggerDownload(blob, filename){
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
}

function downloadAsGeoJSON(data, filename){
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    triggerDownload(blob, filename + '.geojson');
}

function downloadAsCSV(data, filename){
    const csv  = geojsonToCSV(data);
    // BOM dikirim sebagai Uint8Array terpisah agar Excel baca delimiter koma dengan benar
    const bom  = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csv], { type:'text/csv;charset=utf-8;' });
    triggerDownload(blob, filename + '.csv');
}

/* Shapefile: buat ZIP berisi .shp/.dbf/.shx/.prj sederhana menggunakan shpwrite jika tersedia,
   fallback ke GeoJSON jika library tidak ada */
async function downloadAsShapefile(data, filename){
    // coba load shpwrite dari CDN secara dinamis
    if(typeof shpwrite === 'undefined'){
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://unpkg.com/@mapbox/shp-write@0.4.3/shpwrite.js';
            s.onload  = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        }).catch(()=>{});
    }
    if(typeof shpwrite !== 'undefined'){
        try {
            const options = { folder: filename, types:{ polygon:'polygon', polyline:'polyline', point:'point' } };
            const content = shpwrite.zip(data, options);
            const blob    = new Blob([content], { type:'application/zip' });
            triggerDownload(blob, filename + '.zip');
            return;
        } catch(e){ console.warn('shpwrite gagal, fallback ke GeoJSON:', e); }
    }
    // fallback
    alert('Library Shapefile tidak tersedia. Mengunduh sebagai GeoJSON sebagai gantinya.');
    downloadAsGeoJSON(data, filename);
}

/* ════════════════════════════════════
   MODAL PILIH FORMAT UNDUH
════════════════════════════════════ */
let _dlModalData    = null;
let _dlModalName    = '';

function showDownloadModal(data, filename){
    _dlModalData = data;
    _dlModalName = filename;
    // buat modal jika belum ada
    let modal = document.getElementById('dl-format-modal');
    if(!modal){
        modal = document.createElement('div');
        modal.id = 'dl-format-modal';
        modal.innerHTML = `
        <div id="dl-format-backdrop" onclick="closeDownloadModal()" style="
            position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9998;backdrop-filter:blur(3px);"></div>
        <div id="dl-format-box" style="
            position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;
            background:#fff;border-radius:20px;padding:28px 32px;
            box-shadow:0 20px 60px rgba(0,0,0,0.3);min-width:320px;
            font-family:'Inter',sans-serif;">
            <div style="font-family:'Montserrat',sans-serif;font-size:16px;font-weight:700;color:#12344b;margin-bottom:6px;">
                ⬇ Unduh Data
            </div>
            <div id="dl-modal-fname" style="font-size:12px;color:#7a90a4;margin-bottom:20px;"></div>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <button onclick="execDownload('geojson')" style="
                    background:linear-gradient(135deg,#1a4d6e,#245b7d);color:white;
                    border:none;border-radius:12px;padding:12px 18px;font-size:13px;font-weight:600;
                    cursor:pointer;display:flex;align-items:center;gap:10px;font-family:'Montserrat',sans-serif;
                    transition:0.2s;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                    <span style="font-size:20px;">📄</span>
                    <div style="text-align:left;"><div>GeoJSON</div><div style="font-size:10px;opacity:0.75;font-weight:400;">Format standar GIS · .geojson</div></div>
                </button>
                <button onclick="execDownload('csv')" style="
                    background:linear-gradient(135deg,#27ae60,#2ecc71);color:white;
                    border:none;border-radius:12px;padding:12px 18px;font-size:13px;font-weight:600;
                    cursor:pointer;display:flex;align-items:center;gap:10px;font-family:'Montserrat',sans-serif;
                    transition:0.2s;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                    <span style="font-size:20px;">📊</span>
                    <div style="text-align:left;"><div>CSV (Spreadsheet)</div><div style="font-size:10px;opacity:0.75;font-weight:400;">Excel / Google Sheets · .csv</div></div>
                </button>
            </div>
            <button onclick="closeDownloadModal()" class="dl-modal-batal">
                ✕ Batal
            </button>
        </div>`;
        document.body.appendChild(modal);
    }
    // Tampilkan nama file di modal
    document.getElementById('dl-modal-fname').textContent = '📁 ' + filename;
    modal.style.display = 'block';
}

function closeDownloadModal(){
    const modal = document.getElementById('dl-format-modal');
    if(modal) modal.style.display = 'none';
}

function execDownload(format){
    closeDownloadModal();
    if(!_dlModalData) return;
    if(format === 'geojson') downloadAsGeoJSON(_dlModalData, _dlModalName);
    else if(format === 'csv') downloadAsCSV(_dlModalData, _dlModalName);
    else if(format === 'shp') downloadAsShapefile(_dlModalData, _dlModalName);
}

/* ════════════════════════════════════
   EXPORT PERSIL (popup per fitur) — dengan format langsung
════════════════════════════════════ */
function exportPersil(nop){
    if(!geojsonData.bidang){ alert('Data belum dimuat'); return; }
    const feat = geojsonData.bidang.features.find(f => f.properties.D_NOP === nop);
    if(!feat){ alert('Persil tidak ditemukan'); return; }
    const fc = { type:'FeatureCollection', features:[feat] };
    showDownloadModal(fc, `persil_${nop}`);
}

/* Export persil dengan format tertentu langsung */
function exportPersilFormat(nop, format){
    if(!geojsonData.bidang){ alert('Data belum dimuat'); return; }
    const feat = geojsonData.bidang.features.find(f => f.properties.D_NOP === nop);
    if(!feat){ alert('Persil tidak ditemukan'); return; }
    const fc = { type:'FeatureCollection', features:[feat] };
    const fname = `persil_${nop}`;
    if(format==='geojson') downloadAsGeoJSON(fc, fname);
    else if(format==='csv') downloadAsCSV(fc, fname);
    else if(format==='shp') downloadAsShapefile(fc, fname);
}

/* Export Admin dengan format tertentu langsung */
function exportFeatureAdminFormat(desaName, format){
    if(!geojsonData.admin){ alert('Data belum dimuat'); return; }
    const feats = geojsonData.admin.features.filter(f =>
        (f.properties.DESA||'').toLowerCase() === desaName.toLowerCase()
    );
    if(!feats.length){ alert('Data desa tidak ditemukan'); return; }
    const fc = { type:'FeatureCollection', features: feats };
    const fname = `Admin_${desaName}`;
    if(format==='geojson') downloadAsGeoJSON(fc, fname);
    else if(format==='csv') downloadAsCSV(fc, fname);
    else if(format==='shp') downloadAsShapefile(fc, fname);
}

/* Export Lahan berdasarkan jenis dengan format tertentu */
function exportLahanByJenis(jenis, format){
    if(!geojsonData.lahan){ alert('Data belum dimuat'); return; }
    const feats = geojsonData.lahan.features.filter(f => f.properties.JENIS === jenis);
    if(!feats.length){
        // fallback unduh semua
        const fc = geojsonData.lahan;
        const fname = 'Penggunaan_Lahan_Munggung';
        if(format==='geojson') downloadAsGeoJSON(fc, fname);
        else if(format==='csv') downloadAsCSV(fc, fname);
        else if(format==='shp') downloadAsShapefile(fc, fname);
        return;
    }
    const fc = { type:'FeatureCollection', features: feats };
    const fname = `Lahan_${jenis.replace(/[^a-zA-Z0-9_]/g,'_')}`;
    if(format==='geojson') downloadAsGeoJSON(fc, fname);
    else if(format==='csv') downloadAsCSV(fc, fname);
    else if(format==='shp') downloadAsShapefile(fc, fname);
}

/* Export lahan dari popup (legacy fallback) */
function exportFeatureLahan(btn){
    if(!geojsonData.lahan){ alert('Data belum dimuat'); return; }
    showDownloadModal(geojsonData.lahan, 'Penggunaan_Lahan_Munggung');
}

/* Export per desa (legacy) */
function exportFeatureAdmin(desaName){
    if(!geojsonData.admin){ alert('Data belum dimuat'); return; }
    const feats = geojsonData.admin.features.filter(f =>
        (f.properties.DESA||'').toLowerCase() === desaName.toLowerCase()
    );
    if(!feats.length){ alert('Data desa tidak ditemukan'); return; }
    const fc = { type:'FeatureCollection', features: feats };
    showDownloadModal(fc, `Admin_${desaName}`);
}

/* Download layer dari panel kiri (3 tombol baru) */
/* Helper: bersihkan FeatureCollection admin — hanya fitur yang punya DESA valid */
function _filterAdminFeats(data){
    if(!data || !data.features) return data;
    const filtered = data.features.filter(f => {
        const desa = (f.properties && f.properties.DESA) || '';
        return desa.trim() !== '';
    });
    return { type:'FeatureCollection', features: filtered };
}

function downloadLayerDirect(layerKey){
    const data = geojsonData[layerKey];
    const names = { bidang:'Bidang_Tanah_Munggung', lahan:'Penggunaan_Lahan_Munggung', admin:'Administrasi_Karangdowo' };
    if(!data){
        // Coba load dulu
        const loading    = document.getElementById('loading-overlay');
        const loadingTxt = document.getElementById('loading-text');
        loading.style.display = 'flex';
        loadingTxt.textContent = `Memuat ${GEOJSON_FILES[layerKey]}…`;
        fetch(GEOJSON_FILES[layerKey])
            .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
            .then(d=>{
                geojsonData[layerKey] = d;
                loading.style.display = 'none';
                const exportData = layerKey === 'admin' ? _filterAdminFeats(d) : d;
                showDownloadModal(exportData, names[layerKey]);
            })
            .catch(()=>{
                loading.style.display = 'none';
                alert('Gagal memuat data. Pastikan file GeoJSON tersedia di server.');
            });
        return;
    }
    const exportData = layerKey === 'admin' ? _filterAdminFeats(data) : data;
    showDownloadModal(exportData, names[layerKey]);
}

/* ════════════════════════════════════════════════════════
   SIMPAN LAYER KE SERVER — realtime multi-user
   Dipanggil tombol "💾 Simpan" di katalog (Admin)
════════════════════════════════════════════════════════ */

/* Helper: kompres koordinat GeoJSON (kurangi desimal & hapus property kosong)
   agar payload ke Firebase lebih kecil → upload jauh lebih cepat. */
function _compressGeojson(data){
    if(!data || !data.features) return data;
    const PREC = 6; // 6 desimal = akurasi ~0.1 meter, cukup untuk GIS desa
    function roundCoord(c){
        if(typeof c[0] === 'number') return [+c[0].toFixed(PREC), +c[1].toFixed(PREC)];
        return c.map(roundCoord);
    }
    const features = data.features.map(f => {
        // Bulatkan koordinat
        let geom = f.geometry;
        if(geom && geom.coordinates){
            geom = Object.assign({}, geom, { coordinates: roundCoord(geom.coordinates) });
        }
        // Hapus property yang null/undefined/string kosong untuk kurangi ukuran
        const props = {};
        Object.entries(f.properties || {}).forEach(([k,v]) => {
            if(v !== null && v !== undefined && v !== '') props[k] = v;
        });
        return { type:'Feature', geometry: geom, properties: props };
    });
    return { type:'FeatureCollection', features };
}

async function saveLayerToServer(catalogKey){
    const m = CATALOG_META[catalogKey];
    if(!m || !m.isUploaded || !m.uploadedLayerName){
        alert('Layer tidak valid untuk disimpan.'); return;
    }
    // Cek Firebase — jika belum dikonfigurasi, simpan ke localStorage saja
    const firebaseReady = _initFirebase();
    if(!firebaseReady){
        // Simpan hanya ke localStorage (mode offline) — data tetap ada untuk sesi ini
        const name2 = m.uploadedLayerName;
        _saveUploadedLayers();
        m.fromServer = false;
        const btn2 = document.querySelector(`#kat-card-${catalogKey} .kat-btn-save-perm`);
        if(btn2){ btn2.innerHTML = '<span class="kat-act-icon">💾</span>Tersimpan Lokal'; btn2.style.background='#e67e22'; btn2.style.color='white'; btn2.disabled = false; }
        _showToast('⚠️ Firebase belum dikonfigurasi — layer disimpan lokal saja (tidak tersedia ke user lain). Isi FIREBASE_CONFIG dengan API key asli untuk fitur multi-user.', 'error');
        return;
    }

    const name     = m.uploadedLayerName;
    const rawData  = _uploadedLayerData[name];
    const color    = _uploadedLayerBaseColor[name] || '#888888';
    const opacity  = _uploadedLayerOpacity[name] !== undefined ? _uploadedLayerOpacity[name] : 35;
    const colorMap = _uploadedLayerColorMap[name] || null;

    // Pakai classField yang sudah di-set user lewat Edit Klasifikasi (jika ada),
    // fallback ke auto-detect hanya jika belum pernah diatur
    let classField = (_uploadedLayerClassField && _uploadedLayerClassField[name]) || null;
    if(!classField && rawData && rawData.features && rawData.features.length){
        const skipKeys = new Set(['id','fid','gid','objectid','shape_area','shape_leng','ogc_fid']);
        const allKeys  = Object.keys(rawData.features[0].properties || {});
        classField = allKeys.find(k =>
            !skipKeys.has(k.toLowerCase()) &&
            !k.toLowerCase().includes('luas') &&
            !k.toLowerCase().includes('area') &&
            typeof rawData.features[0].properties[k] === 'string'
        ) || allKeys[0] || null;
    }

    const btn = document.querySelector(`#kat-card-${catalogKey} .kat-btn-save-perm`);
    if(btn){ btn.innerHTML = '<span class="kat-act-icon">⏳</span>Menyimpan...'; btn.disabled = true; }

    try{
        const safeName = name.replace(/[^a-zA-Z0-9_-]/g,'_');

        // Kompres GeoJSON sebelum dikirim ke Firebase
        const data = _compressGeojson(rawData);
        const approxKB = Math.round(JSON.stringify(data).length / 1024);
        console.log(`💾 Menyimpan layer "${name}": ${(data.features||[]).length} fitur, ~${approxKB} KB`);

        const record = {
            name:        safeName,
            displayName: _cleanLayerName(m.name || name),
            color,
            opacity,
            colorMap:    colorMap || null,
            classField:  classField || null,
            swatch:      m.swatch || `linear-gradient(135deg,${color},${color}88)`,
            icon:        m.icon || '📂',
            geojson:     data,
            savedAt:     Date.now()
        };

        // Beri timeout 15 detik — jika Firebase tidak respond (mis. Rules tertutup),
        // langsung fallback ke localStorage dan tampilkan pesan actionable
        const savePromise = _fbDB.ref(`katalog/${safeName}`).set(record);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT')), 15000)
        );
        await Promise.race([savePromise, timeoutPromise]);

        _showToast('✅ Layer berhasil disimpan & tersedia untuk semua pengguna!', 'success');
        m.fromServer = true;
        if(btn){ btn.innerHTML = '<span class="kat-act-icon">✅</span>Tersimpan'; btn.style.background='#27ae60'; btn.style.color='white'; }
    } catch(e){
        console.error('Firebase save error:', e);
        // Fallback: simpan ke localStorage agar data tidak hilang
        _saveUploadedLayers();

        let pesanError = '❌ Gagal simpan ke server. Layer disimpan lokal.';
        if(e.message === 'TIMEOUT'){
            pesanError = '⏱️ Timeout — kemungkinan Firebase Rules belum dibuka. Buka Firebase Console → Realtime Database → Rules → ubah "write": false menjadi "write": true. Layer disimpan lokal.';
        } else if(e.message && e.message.toLowerCase().includes('permission')){
            pesanError = '🔒 Permission denied — buka Firebase Console → Realtime Database → Rules → ubah "write": false menjadi "write": true. Layer disimpan lokal.';
        }
        alert(pesanError);
        if(btn){ btn.innerHTML = '<span class="kat-act-icon">💾</span>Simpan'; btn.disabled = false; }
    }
}

/* ════════════════════════════════════════════════════════
   LOAD LAYER DARI FIREBASE — dipanggil saat halaman dibuka
════════════════════════════════════════════════════════ */
async function loadLayersFromServer(){
    if(!_initFirebase()) return;
    try{
        const snap = await _fbDB.ref('katalog').once('value');
        const katalogObj = snap.val();
        if(!katalogObj) return;

        const items = Object.values(katalogObj);
        const randomColor = () => '#' + Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0');
        let newCount = 0;

        for(const item of items){
            const { name, displayName, color, opacity, colorMap, classField, swatch, icon, geojson } = item;
            if(!name || !geojson) continue;
            if(uploadedLayerRegistry[name]) continue;

            try{
                const data = geojson; // langsung dari Realtime DB, tidak perlu fetch URL

                const col = color || randomColor();
                const op  = opacity !== undefined ? opacity : 35;

                const newLayer = L.geoJSON(data, {
                    style: function(feat){
                        if(colorMap && classField && feat.properties){
                            const val = String(feat.properties[classField] ?? '(kosong)');
                            const fc  = colorMap[val] || col;
                            return { color: fc, weight: 1.5, fillColor: fc, fillOpacity: op/100, opacity: 1 };
                        }
                        return { color: col, weight: 2, fillColor: col, fillOpacity: op/100, opacity: 1 };
                    },
                    onEachFeature: function(feat, lyr){
                        _bindUploadedPopup(lyr, feat, name);
                        lyr.on('mouseover', function(){
                            lyr.setStyle({ weight:3.5, color:'#ff1744', fillColor:'#ff1744', fillOpacity:0.6, opacity:1 });
                            lyr.bringToFront();
                        });
                        lyr.on('mouseout', function(){
                            _restoreFeatureStyle(lyr, name);
                        });
                    }
                })

                uploadedLayerRegistry[name]       = newLayer;
                _uploadedLayerVisibility[name]     = false;
                _uploadedLayerData[name]           = data;
                _uploadedLayerBaseColor[name]      = col;
                _uploadedLayerOpacity[name]        = op;
                if(colorMap) _uploadedLayerColorMap[name] = colorMap;

                const layerKey = 'upload_' + name.replace(/[^a-zA-Z0-9]/g,'_');
                if(!CATALOG_META[layerKey]){
                    CATALOG_META[layerKey] = {
                        name:             _cleanLayerName(displayName || name),
                        file:             name,
                        swatch:           swatch || `linear-gradient(135deg,${col},${col}88)`,
                        icon:             icon || '📂',
                        isUploaded:       true,
                        uploadedLayerName: name,
                        fromServer:       true
                    };
                    katalogAvailable[layerKey] = true;
                }

                if(colorMap && classField){
                    _uploadedLayerColorMap[name] = colorMap;
                    if(!_uploadedLayerClassField) _uploadedLayerClassField = {};
                    _uploadedLayerClassField[name] = classField;
                    _reapplyLayerClassStyle(name, classField);
                }
                newCount++;
            } catch(e){ console.warn('Gagal load layer firebase:', name, e.message); }
        }

        if(newCount > 0){
            renderUploadedLayerList();
            renderActiveOverlayList();
            updateLegend();
            console.log(`✅ ${newCount} layer dari Firebase berhasil dimuat.`);
        }
    } catch(e){
        console.log('ℹ️  Firebase tidak tersedia, mode offline (localStorage only).');
    }
}

/* ════════════════════════════════════════════════════════
   HAPUS LAYER DARI FIREBASE (saat admin hapus data)
════════════════════════════════════════════════════════ */
async function deleteLayerFromServer(name){
    if(!_initFirebase()) return;
    try{
        const safeName = name.replace(/[^a-zA-Z0-9_-]/g,'_');
        await _fbDB.ref(`katalog/${safeName}`).remove();
    } catch(e){ console.warn('Gagal hapus dari Firebase:', e.message); }
}

/* ════════════════════════════════════════════════════════
   UPDATE METADATA LAYER DI FIREBASE (setelah ubah warna/klasifikasi)
════════════════════════════════════════════════════════ */
async function patchLayerOnServer(name, patchData){
    if(!_initFirebase()) return;
    try{
        const safeName = name.replace(/[^a-zA-Z0-9_-]/g,'_');
        await _fbDB.ref(`katalog/${safeName}`).update(patchData);
    } catch(e){ console.warn('Gagal update Firebase:', e.message); }
}


/* ════════════════════════════════════════════════════════
   FIREBASE REALTIME LISTENER — pengganti SSE
   Semua browser otomatis refresh layer saat admin simpan/hapus
════════════════════════════════════════════════════════ */
let _sseConnection = null;  // dipakai sebagai flag (Firebase listener ref)
let _sseRetryCount = 0;

function startSSE(){
    if(_sseConnection) return;
    if(!_initFirebase()){
        const ind = document.getElementById('sse-status');
        if(ind){ ind.className=''; ind.innerHTML='<span class="sse-dot"></span>Offline'; ind.title='Firebase belum dikonfigurasi'; }
        return;
    }

    const ref = _fbDB.ref('katalog');
    _sseConnection = ref;

    const ind = document.getElementById('sse-status');
    if(ind){ ind.className='connected'; ind.innerHTML='<span class="sse-dot"></span>Realtime'; ind.title='Terhubung Firebase'; }
    _hideFirebaseNotConfiguredBanner();

    // Pakai .on('value') — lebih sederhana, tidak ada masalah eventType,
    // dan otomatis trigger setiap kali data berubah (tambah/hapus/update)
    let _firstLoad = true;
    ref.on('value', function(snap){
        const katalogObj = snap.val() || {};
        const serverNames = new Set(Object.values(katalogObj).map(v => v && v.name).filter(Boolean));

        // --- Hapus layer yang sudah tidak ada di server ---
        Object.keys(uploadedLayerRegistry).forEach(name => {
            // Hanya hapus layer yang fromServer (bukan layer lokal user)
            const lk = 'upload_' + name.replace(/[^a-zA-Z0-9]/g,'_');
            if(CATALOG_META[lk] && CATALOG_META[lk].fromServer && !serverNames.has(name)){
                map.removeLayer(uploadedLayerRegistry[name]);
                delete uploadedLayerRegistry[name];
                delete _uploadedLayerData[name];
                delete _uploadedLayerColorMap[name];
                delete _uploadedLayerOpacity[name];
                delete _uploadedLayerBaseColor[name];
                delete _uploadedLayerVisibility[name];
                if(_uploadedLayerClassField) delete _uploadedLayerClassField[name];
                delete CATALOG_META[lk];
                delete katalogAvailable[lk];
                if(!_firstLoad) _showToast(`ℹ️ Layer "${name}" telah dihapus admin`, 'info');
            }
        });

        // --- Tambah / update layer dari server ---
        Object.values(katalogObj).forEach(item => {
            if(!item || !item.name || !item.geojson) return;
            const { name, colorMap, classField } = item;

            if(uploadedLayerRegistry[name]){
                // Layer sudah ada — hanya update colorMap/classField jika berubah
                if(colorMap && classField){
                    _uploadedLayerColorMap[name] = colorMap;
                    if(!_uploadedLayerClassField) _uploadedLayerClassField = {};
                    _uploadedLayerClassField[name] = classField;
                    _reapplyLayerClassStyle(name, classField);
                }
            } else {
                // Layer baru — muat ke peta
                _loadSingleLayerFromServer(item);
                if(!_firstLoad) _showToast(`✅ Layer "${item.displayName||name}" ditambahkan admin`, 'success');
            }
        });

        renderActiveOverlayList();
        updateLegend();
        _firstLoad = false;

    }, function(err){
        // Error callback (permission denied dll)
        console.error('Firebase listener error:', err.message);
        const ind2 = document.getElementById('sse-status');
        if(ind2){ ind2.className=''; ind2.innerHTML='<span class="sse-dot"></span>Offline'; ind2.title='Firebase error: ' + err.message; }
        if(err.message && err.message.toLowerCase().includes('permission')){
            console.warn('🔒 Buka Firebase Console → Realtime Database → Rules → set read:true');
        }
    });
}

/* Load satu layer dari Firebase (dipanggil saat listener child_added) */
async function _loadSingleLayerFromServer(item){
    const { name, displayName, color, opacity, colorMap, classField, swatch, icon, geojson } = item;
    if(!name || uploadedLayerRegistry[name]) return;
    if(!geojson){ console.warn('geojson tidak ada untuk', name); return; }
    try{
        const data = geojson; // langsung dari Realtime DB
        const col = color || '#888888';
        const op  = opacity !== undefined ? opacity : 35;
        const newLayer = L.geoJSON(data, {
            style: function(feat){
                if(colorMap && classField && feat.properties){
                    const val = String(feat.properties[classField] ?? '(kosong)');
                    const fc  = colorMap[val] || col;
                    return { color: fc, weight: 1.5, fillColor: fc, fillOpacity: op/100, opacity: 1 };
                }
                return { color: col, weight: 2, fillColor: col, fillOpacity: op/100, opacity: 1 };
            },
            onEachFeature: function(feat, lyr){
                _bindUploadedPopup(lyr, feat, name);
                lyr.on('mouseover', function(){
                    lyr.setStyle({ weight:3.5, color:'#ff1744', fillColor:'#ff1744', fillOpacity:0.6, opacity:1 });
                    lyr.bringToFront();
                });
                lyr.on('mouseout', function(){
                    _restoreFeatureStyle(lyr, name);
                });
            }
        })
        uploadedLayerRegistry[name]   = newLayer;
        _uploadedLayerVisibility[name]= false;
        _uploadedLayerData[name]      = data;
        _uploadedLayerBaseColor[name] = col;
        _uploadedLayerOpacity[name]   = op;
        if(colorMap){ _uploadedLayerColorMap[name] = colorMap; }
        if(classField){
            if(!_uploadedLayerClassField) _uploadedLayerClassField = {};
            _uploadedLayerClassField[name] = classField;
            _reapplyLayerClassStyle(name, classField);
        }
        const layerKey = 'upload_' + name.replace(/[^a-zA-Z0-9]/g,'_');
        if(!CATALOG_META[layerKey]){
            CATALOG_META[layerKey] = {
                name:              _cleanLayerName(displayName || name),
                file:              name,
                swatch:            swatch || `linear-gradient(135deg,${col},${col}88)`,
                icon:              icon || '📂',
                isUploaded:        true,
                uploadedLayerName: name,
                fromServer:        true
            };
            katalogAvailable[layerKey] = true;
        }
        renderUploadedLayerList();
        renderActiveOverlayList();
        updateLegend();
        _showToast(`✅ Layer baru "${displayName||name}" ditambahkan admin`, 'success');
    } catch(e){ console.warn('Gagal load layer Firebase:', name, e.message); }
}

/* ════════════════════════════════════════════════════════
   MODAL EDIT KLASIFIKASI & WARNA
   Admin bisa:
   1. Pilih field untuk klasifikasi warna
   2. Edit warna per nilai klasifikasi
════════════════════════════════════════════════════════ */
let _editStyleTarget = null; // { catalogKey, layerName }

function openEditStyleModal(catalogKey){
    const m = CATALOG_META[catalogKey];
    if(!m || !m.uploadedLayerName) return;
    const name = m.uploadedLayerName;
    const data = _uploadedLayerData[name];
    if(!data || !data.features || !data.features.length){
        alert('Data layer belum tersedia.'); return;
    }

    _editStyleTarget = { catalogKey, layerName: name };

    // Kumpulkan semua field
    const allKeys = Object.keys(data.features[0].properties || {});
    const skipKeys = new Set(['id','fid','gid','objectid','shape_area','shape_leng','ogc_fid']);

    // Field yang sudah dipilih (dari colorMap atau default)
    const currentField = _editStyleCurrentField(name, allKeys, skipKeys);

    // Buat modal jika belum ada
    let modal = document.getElementById('edit-style-modal');
    if(!modal){
        modal = document.createElement('div');
        modal.id = 'edit-style-modal';
        modal.style.cssText = `
            position:fixed;inset:0;z-index:10500;display:flex;align-items:center;justify-content:center;`;
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
    <div onclick="closeEditStyleModal()" style="position:absolute;inset:0;background:rgba(12,30,50,0.65);backdrop-filter:blur(5px);"></div>
    <div id="edit-style-box" style="
        position:relative;z-index:1;background:#fff;border-radius:20px;width:520px;max-height:85vh;
        overflow:hidden;display:flex;flex-direction:column;
        box-shadow:0 24px 64px rgba(0,0,0,0.3);font-family:'Inter',sans-serif;">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#1a4d6e,#245b7d);color:white;padding:18px 24px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;">
            <div>
                <div style="font-family:'Montserrat',sans-serif;font-size:15px;font-weight:700;">🎨 Edit Klasifikasi & Warna</div>
                <div style="font-size:11px;opacity:0.75;margin-top:2px;">${_cleanLayerName(name)}</div>
            </div>
            <button onclick="closeEditStyleModal()" class="katalog-modal-close">✕</button>
        </div>

        <!-- Pilih Field Klasifikasi -->
        <div style="padding:18px 24px 0;flex-shrink:0;">
            <label style="font-size:12px;font-weight:700;color:#1a4d6e;font-family:'Montserrat',sans-serif;letter-spacing:0.5px;">FIELD KLASIFIKASI</label>
            <select id="es-field-select" onchange="onEditStyleFieldChange()" style="
                width:100%;margin-top:6px;padding:10px 12px;border:1.5px solid #dce8f0;border-radius:10px;
                font-size:13px;font-family:'Inter',sans-serif;color:#1a4d6e;background:#f8fbfd;outline:none;cursor:pointer;">
                ${allKeys.filter(k=>!skipKeys.has(k.toLowerCase())).map(k =>
                    `<option value="${k}" ${k===currentField?'selected':''}>${k}</option>`
                ).join('')}
            </select>
        </div>

        <!-- Daftar warna per nilai -->
        <div id="es-color-list" style="flex:1;overflow-y:auto;padding:12px 24px 8px;">
            <!-- diisi oleh renderEditStyleColors() -->
        </div>

        <!-- Footer actions -->
        <div style="padding:14px 24px;border-top:1px solid #eaf0f5;display:flex;gap:10px;flex-shrink:0;">
            <button onclick="applyEditStyle()" style="
                flex:2;background:linear-gradient(135deg,#1a4d6e,#245b7d);color:white;
                border:none;border-radius:12px;padding:11px;font-size:13px;font-weight:700;
                cursor:pointer;font-family:'Montserrat',sans-serif;transition:0.2s;"
                onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                ✅ Terapkan Perubahan
            </button>
            <button onclick="closeEditStyleModal()" style="
                flex:1;background:#f0f4f8;color:#7a90a4;border:none;border-radius:12px;
                padding:11px;font-size:13px;cursor:pointer;font-family:'Inter',sans-serif;">
                Batal
            </button>
        </div>
    </div>`;

    modal.style.display = 'flex';
    renderEditStyleColors();
}

function _editStyleCurrentField(name, allKeys, skipKeys){
    // Cek apakah colorMap sudah ada
    const cm = _uploadedLayerColorMap[name];
    if(cm){
        const data = _uploadedLayerData[name];
        if(data && data.features && data.features.length){
            // Cari field yang value-nya cocok dengan key di colorMap
            const cmKeys = Object.keys(cm);
            for(const k of allKeys){
                const sampleVal = data.features[0].properties[k];
                if(cmKeys.includes(String(sampleVal))) return k;
            }
        }
    }
    // Default: field string pertama yang bukan skip
    return allKeys.find(k =>
        !skipKeys.has(k.toLowerCase()) &&
        !k.toLowerCase().includes('luas') &&
        !k.toLowerCase().includes('area')
    ) || allKeys[0] || '';
}

function onEditStyleFieldChange(){
    renderEditStyleColors();
}

function renderEditStyleColors(){
    if(!_editStyleTarget) return;
    const { layerName } = _editStyleTarget;
    const data = _uploadedLayerData[layerName];
    if(!data || !data.features) return;

    const fieldSel = document.getElementById('es-field-select');
    if(!fieldSel) return;
    const field = fieldSel.value;

    // Kumpulkan nilai unik
    const uniqueVals = [...new Set(data.features.map(f =>
        String(f.properties[field] ?? '(kosong)')
    ))].sort();

    // Palette default
    const palette = ['#ffea00','#00c853','#2979ff','#ff6d00','#e91e63',
                     '#00bcd4','#8bc34a','#9c27b0','#f06292','#ff5722',
                     '#795548','#607d8b','#e74c3c','#3498db','#2ecc71'];

    // Ambil colorMap yang ada atau buat baru
    const existingMap = _uploadedLayerColorMap[layerName] || {};
    const newMap = {};
    uniqueVals.forEach((v, i) => {
        newMap[v] = existingMap[v] || palette[i % palette.length];
    });

    const list = document.getElementById('es-color-list');
    if(!list) return;

    list.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:#7a90a4;letter-spacing:1px;font-family:'Montserrat',sans-serif;margin-bottom:8px;">
        WARNA PER NILAI (${uniqueVals.length} kategori)
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;">
    ${uniqueVals.map(v => `
        <div style="display:flex;align-items:center;gap:10px;padding:7px 10px;background:#f8fbfd;border-radius:10px;border:1px solid #eaf0f5;">
            <input type="color" value="${newMap[v]}" data-val="${v}"
                onchange="_updateEditStylePreview(this)"
                style="width:36px;height:36px;border:none;border-radius:8px;cursor:pointer;padding:2px;background:transparent;">
            <span style="font-size:12px;color:#1a4d6e;font-weight:500;flex:1;">${v}</span>
            <div id="es-preview-${_escapeId(v)}" style="
                width:80px;height:14px;border-radius:4px;
                background:${newMap[v]};border:1px solid rgba(0,0,0,0.1);"></div>
        </div>`).join('')}
    </div>`;
}

function _escapeId(val){
    return btoa(unescape(encodeURIComponent(String(val)))).replace(/[^a-zA-Z0-9]/g,'');
}

function _updateEditStylePreview(input){
    const val  = input.getAttribute('data-val');
    const prev = document.getElementById('es-preview-' + _escapeId(val));
    if(prev) prev.style.background = input.value;
}

function applyEditStyle(){
    if(!_editStyleTarget) return;
    const { catalogKey, layerName } = _editStyleTarget;

    const fieldSel = document.getElementById('es-field-select');
    if(!fieldSel) return;
    const field = fieldSel.value;

    // Kumpulkan semua nilai warna dari input
    const colorInputs = document.querySelectorAll('#es-color-list input[type="color"]');
    const newMap = {};
    colorInputs.forEach(inp => {
        newMap[inp.getAttribute('data-val')] = inp.value;
    });

    // Simpan ke state
    _uploadedLayerColorMap[layerName] = newMap;
    if(!_uploadedLayerClassField) _uploadedLayerClassField = {};
    _uploadedLayerClassField[layerName] = field; // ingat field aktif untuk legenda

    // Terapkan warna ke layer di peta
    _reapplyLayerClassStyle(layerName, field);

    // Update legenda
    updateLegend();
    _saveUploadedLayers();

    // Sync ke server jika sudah tersimpan
    const m = CATALOG_META[catalogKey];
    if(m && m.fromServer){
        patchLayerOnServer(layerName, { colorMap: newMap, classField: field });
    }

    _showToast('🎨 Klasifikasi warna berhasil diterapkan!', 'success');
    closeEditStyleModal();
}

/* Terapkan ulang warna klasifikasi ke layer di peta */
function _reapplyLayerClassStyle(layerName, classField){
    const layer    = uploadedLayerRegistry[layerName];
    const colorMap = _uploadedLayerColorMap[layerName];
    const op       = (_uploadedLayerOpacity[layerName] !== undefined ? _uploadedLayerOpacity[layerName] : 35) / 100;
    if(!layer || !colorMap || !classField) return;

    layer.eachLayer(l => {
        if(!l.feature) return;
        const val = String(l.feature.properties[classField] ?? '(kosong)');
        const col = colorMap[val] || _uploadedLayerBaseColor[layerName] || '#888';
        l.setStyle({ fillColor: col, color: col, fillOpacity: op, weight:1.5 });
    });
}

function closeEditStyleModal(){
    const modal = document.getElementById('edit-style-modal');
    if(modal) modal.style.display = 'none';
    _editStyleTarget = null;
}

/* ════════════════════════════════════════════════════════
   TOAST NOTIFICATION
════════════════════════════════════════════════════════ */
function _showToast(msg, type='info'){
    let toast = document.getElementById('sip-toast');
    if(!toast){
        toast = document.createElement('div');
        toast.id = 'sip-toast';
        toast.style.cssText = `
            position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(30px);
            z-index:99999;padding:12px 22px;border-radius:14px;font-family:'Inter',sans-serif;
            font-size:13px;font-weight:500;max-width:420px;text-align:center;
            box-shadow:0 8px 32px rgba(0,0,0,0.2);opacity:0;
            transition:all 0.3s cubic-bezier(.34,1.56,.64,1);pointer-events:none;`;
        document.body.appendChild(toast);
    }
    const colors = {
        success: { bg:'#1a4d6e', color:'white' },
        error:   { bg:'#c0392b', color:'white' },
        info:    { bg:'#245b7d', color:'white' }
    };
    const c = colors[type] || colors.info;
    toast.style.background = c.bg;
    toast.style.color = c.color;
    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(30px)';
    }, 4000);
}

/* ════════════════════════════════════
   JAM LIVE
════════════════════════════════════ */
function updateClock(){
    const now = new Date();
    const hariArr  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const bulanArr = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const hari = hariArr[now.getDay()];
    const tgl  = now.getDate();
    const bln  = bulanArr[now.getMonth()];
    const thn  = now.getFullYear();
    const jam  = String(now.getHours()).padStart(2,'0');
    const mnt  = String(now.getMinutes()).padStart(2,'0');
    const dtk  = String(now.getSeconds()).padStart(2,'0');
    document.getElementById('live-clock').textContent =
        `${hari} ${tgl} ${bln} ${thn} pukul ${jam}.${mnt}.${dtk} WIB`;
}
setInterval(updateClock, 1000);
updateClock();

/* ════════════════════════════════════
   INISIALISASI — muat data saat halaman terbuka
════════════════════════════════════ */
loadAllGeoJSON().then(() => {
    console.log('Siap. Data tersedia:', Object.keys(geojsonData).filter(k=>geojsonData[k]!==null));
    // Pulihkan uploaded layers dari localStorage
    _loadUploadedLayers();
    // Muat layer yang disimpan admin di server (realtime untuk semua user)
    loadLayersFromServer();
    // Mulai koneksi SSE untuk sinkronisasi realtime multi-user
    startSSE();
});

/* ════════════════════════════════════
   LABEL TOOLTIP DRAW TOOLBAR (Bahasa Indonesia)
════════════════════════════════════ */
// Override title draw toolbar setelah Leaflet Draw render
setTimeout(function(){
    const titleMap = {
        'Draw a polyline':          'Gambar Garis / Ukur Jarak',
        'Draw a polygon':           'Gambar Poligon / Ukur Luas',
        'Draw a rectangle':         'Gambar Persegi / Ukur Luas',
        'Draw a circle':            'Gambar Lingkaran / Ukur Luas',
        'Draw a marker':            'Tandai Titik / Lihat Koordinat',
        'Draw a circlemarker':      'Tandai Titik Lingkaran',
        'Edit layers':              'Edit Gambar',
        'Delete layers':            'Hapus Gambar',
        'Cancel editing, discards all changes': 'Batal Edit',
        'Save changes':             'Simpan Perubahan',
        'Click and drag to draw rectangle.': 'Klik & seret untuk gambar',
    };
    document.querySelectorAll('.leaflet-draw a[title]').forEach(el => {
        const orig = el.getAttribute('title');
        if(titleMap[orig]) el.setAttribute('title', titleMap[orig]);
    });
    // Tambah label teks di bawah setiap ikon draw
    document.querySelectorAll('.leaflet-draw-toolbar a').forEach(el => {
        const t = el.getAttribute('title') || '';
        if(t && !el.querySelector('.draw-label')){
            const lbl = document.createElement('span');
            lbl.className = 'draw-label';
            lbl.textContent = t.split('/')[0].trim().replace('Gambar ','').replace('Tandai ','').replace('Hapus ','Hapus').replace('Edit ','Edit');
            el.appendChild(lbl);
        }
    });
}, 500);

/* ── HINT SCROLL: tampil jika konten side-panel overflow, hilang jika sudah discroll habis ── */
(function(){
    const sp = document.getElementById('side-panel');
    const hint = document.getElementById('side-panel-hint');
    if(!sp || !hint) return;

    function checkHint(){
        const scrollable = sp.scrollHeight > sp.clientHeight + 10;
        const atBottom   = sp.scrollTop + sp.clientHeight >= sp.scrollHeight - 20;
        hint.style.opacity = (scrollable && !atBottom) ? '1' : '0';
    }

    sp.addEventListener('scroll', checkHint, { passive:true });
    // Cek ulang saat window resize atau saat panel card di-toggle
    window.addEventListener('resize', checkHint);
    document.addEventListener('click', function(e){
        if(e.target.closest('.panel-header')) setTimeout(checkHint, 320);
    });
    // Cek pertama kali setelah layout selesai
    setTimeout(checkHint, 800);
})();
