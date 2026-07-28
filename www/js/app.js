// app.js — Lógica de la aplicación Supervisor de Líneas
'use strict';

const CHECKLIST_ITEMS = [
  'Fugas visibles de crudo',
  'Corrosión externa visible',
  'Estado de bridas y uniones',
  'Señalización y derecho de vía',
  'Erosión / socavación del terreno',
  'Vegetación invasiva sobre la línea',
  'Estado de soportes y anclajes',
  'Presencia de terceros / intervención'
];

let state = {
  tramos: [],
  inspecciones: [],
  eventos: [],
  facilidadFiltro: 'todas',
  historialFiltro: 'todos',
  map: null,
  mapLayers: [],
  editingTramoId: null,
  pendingFotosInsp: [],
  pendingFotosEv: [],
  gpsTramo: null,
  gpsEv: null,
  tracking: { watchId: null, active: false, points: [], startTs: null, nativeWatcherId: null },
  liveLocation: { watchId: null, marker: null, accuracyCircle: null },
  wakeLock: null,
};

// ---------------- Recorrido GPS (tracking) ----------------
function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function routeDistanceKm(points) {
  if (!points || points.length < 2) return 0;
  let m = 0;
  for (let i = 1; i < points.length; i++) m += haversineMeters(points[i - 1], points[i]);
  return m / 1000;
}
function updateTrackStats() {
  const el = $('#trackStats');
  const pts = state.tracking.points;
  if (state.tracking.active) {
    const km = routeDistanceKm(pts).toFixed(2);
    const mins = state.tracking.startTs ? Math.round((Date.now() - state.tracking.startTs) / 60000) : 0;
    el.textContent = `● Grabando… ${pts.length} puntos · ${km} km · ${mins} min`;
    el.classList.add('recording');
  } else if (pts.length >= 2) {
    const km = routeDistanceKm(pts).toFixed(2);
    el.textContent = `Recorrido guardado: ${pts.length} puntos · ${km} km`;
    el.classList.remove('recording');
  } else {
    el.textContent = 'Sin recorrido grabado';
    el.classList.remove('recording');
  }
}
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    state.wakeLock = await navigator.wakeLock.request('screen');
    state.wakeLock.addEventListener('release', () => { state.wakeLock = null; });
  } catch (e) { /* el navegador puede negarlo, seguimos sin bloquear la app */ }
}
async function releaseWakeLock() {
  if (state.wakeLock) { try { await state.wakeLock.release(); } catch (e) {} state.wakeLock = null; }
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && state.tracking.active && !state.wakeLock) {
    await requestWakeLock();
  }
});

function isNativeBG() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
    && window.Capacitor.Plugins && window.Capacitor.Plugins.BackgroundGeolocation);
}

function startBrowserWatch() {
  if (!navigator.geolocation) { toast('GPS no disponible en este dispositivo'); return; }
  state.tracking.watchId = navigator.geolocation.watchPosition(
    (pos) => {
      state.tracking.points.push({ lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() });
      updateTrackStats();
    },
    (err) => toast('GPS: ' + err.message),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
  );
}

async function startTracking() {
  state.tracking.points = [];
  state.tracking.active = true;
  state.tracking.startTs = Date.now();
  $('#btnIniciarRecorrido').style.display = 'none';
  $('#btnDetenerRecorrido').style.display = '';

  if (isNativeBG()) {
    toast('Grabando recorrido en segundo plano');
    try {
      const watcherId = await window.Capacitor.Plugins.BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: 'Grabando el recorrido del tramo. Toca para volver a la app.',
          backgroundTitle: 'Supervisor de Líneas — rastreo activo',
          requestPermissions: true,
          stale: false,
          distanceFilter: 3,
        },
        (location, error) => {
          if (error) { toast('GPS: ' + error.message); return; }
          if (location) {
            state.tracking.points.push({ lat: location.latitude, lng: location.longitude, ts: location.time || Date.now() });
            updateTrackStats();
          }
        }
      );
      state.tracking.nativeWatcherId = watcherId;
    } catch (e) {
      toast('No se pudo iniciar el rastreo nativo, uso el GPS del navegador');
      startBrowserWatch();
      requestWakeLock();
    }
  } else {
    toast('Grabando recorrido — no cierres la app');
    startBrowserWatch();
    requestWakeLock();
  }
  updateTrackStats();
}
async function stopTracking() {
  if (state.tracking.nativeWatcherId) {
    try { await window.Capacitor.Plugins.BackgroundGeolocation.removeWatcher({ id: state.tracking.nativeWatcherId }); } catch (e) {}
    state.tracking.nativeWatcherId = null;
  }
  if (state.tracking.watchId != null) navigator.geolocation.clearWatch(state.tracking.watchId);
  state.tracking.watchId = null;
  state.tracking.active = false;
  releaseWakeLock();
  $('#btnIniciarRecorrido').style.display = '';
  $('#btnDetenerRecorrido').style.display = 'none';
  updateTrackStats();
  if (state.tracking.points.length >= 2) toast('Recorrido detenido y listo para guardar');
}
$('#btnIniciarRecorrido').addEventListener('click', startTracking);
$('#btnDetenerRecorrido').addEventListener('click', stopTracking);

// ---------------- Utilidades ----------------
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove('show'), 2200);
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}
function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function compressImage(dataUrl, maxDim = 900, quality = 0.6) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) { height *= maxDim / width; width = maxDim; }
      else if (height > maxDim) { width *= maxDim / height; height = maxDim; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}

// ---------------- Navegación ----------------
function showView(name) {
  $all('.view').forEach(v => v.classList.remove('active'));
  $('#view-' + name).classList.add('active');
  $all('.bottomnav button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'mapa') { setTimeout(initMapIfNeeded, 50); startLiveLocation(); }
  else { stopLiveLocation(); }
}
$all('.bottomnav button').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));

function openSheet(id) { $('#' + id).classList.add('active'); }
function closeSheet(id) { $('#' + id).classList.remove('active'); }
$all('.sheet-close').forEach(b => b.addEventListener('click', () => {
  const ov = b.closest('.sheet-overlay');
  if (ov.id === 'sheetTramo' && state.tracking.active) stopTracking();
  ov.classList.remove('active');
}));
$all('.sheet-overlay').forEach(ov => ov.addEventListener('click', (e) => {
  if (e.target === ov) {
    if (ov.id === 'sheetTramo' && state.tracking.active) stopTracking();
    ov.classList.remove('active');
  }
}));
$all('[data-open]').forEach(b => b.addEventListener('click', () => {
  closeSheet('sheetElegir');
  openSheet(b.dataset.open);
}));
$('#btnFab').addEventListener('click', () => openSheet('sheetElegir'));

// ---------------- Carga inicial ----------------
async function reloadAll() {
  state.tramos = await DB.getAll('tramos');
  state.inspecciones = await DB.getAll('inspecciones');
  state.eventos = await DB.getAll('eventos');
  renderInicio();
  renderTramos();
  renderHistorial();
  populateTramoSelects();
  if (state.map) renderMapMarkers();
}

// ---------------- Estado de tramo (para strip / badges) ----------------
function tramoEstado(tramoId) {
  const eventosAbiertos = state.eventos.filter(e => e.tramoId === tramoId && e.estado === 'abierto');
  if (eventosAbiertos.length) return 'fuga';
  const insp = state.inspecciones.filter(i => i.tramoId === tramoId).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!insp) return 'sin-dato';
  return insp.resultado === 'obs' ? 'obs' : 'ok';
}

// ---------------- INICIO ----------------
function renderInicio() {
  $('#kpiTramos').textContent = state.tramos.length;
  $('#kpiAbiertos').textContent = state.eventos.filter(e => e.estado === 'abierto').length;
  const now = new Date();
  const mesActual = state.inspecciones.filter(i => {
    const d = new Date(i.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  $('#kpiInspMes').textContent = mesActual;

  const strip = $('#pipelineStrip');
  strip.innerHTML = '';
  if (!state.tramos.length) {
    strip.innerHTML = '<div style="color:var(--text-faint);font-size:12px;padding:4px 0;">Agrega tramos para ver su estado aquí</div>';
  } else {
    state.tramos.forEach(t => {
      const seg = document.createElement('div');
      seg.className = 'seg ' + tramoEstado(t.id);
      seg.title = t.codigo;
      strip.appendChild(seg);
    });
  }

  const feed = $('#actividadReciente');
  const items = [
    ...state.inspecciones.map(i => ({ tipo: 'insp', ts: i.createdAt, data: i })),
    ...state.eventos.map(e => ({ tipo: 'ev', ts: e.createdAt, data: e })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 8);

  if (!items.length) {
    feed.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>Sin actividad registrada todavía.</p><p>Usa el botón + para tu primera inspección o reporte.</p></div>`;
    return;
  }
  feed.innerHTML = items.map(it => {
    const t = state.tramos.find(x => x.id === it.data.tramoId);
    const tramoLabel = t ? t.codigo : '—';
    if (it.tipo === 'insp') {
      return `<div class="card"><div class="card-row">
        <div><div class="card-title">Inspección · <span class="mono">${tramoLabel}</span></div>
        <div class="card-meta">${fmtDate(it.data.createdAt)} · ${it.data.inspector || 'Sin nombre'}</div></div>
        <span class="badge ${it.data.resultado}">${it.data.resultado === 'obs' ? 'Observación' : 'OK'}</span>
      </div></div>`;
    } else {
      return `<div class="card"><div class="card-row">
        <div><div class="card-title">${it.data.tipo} · <span class="mono">${tramoLabel}</span></div>
        <div class="card-meta">${fmtDate(it.data.createdAt)}</div></div>
        <span class="badge ${it.data.estado}">${it.data.estado}</span>
      </div></div>`;
    }
  }).join('');
}

// ---------------- TRAMOS ----------------
function renderFacilidadFiltro() {
  const facs = ['todas', ...new Set(state.tramos.map(t => t.facilidad))];
  $('#filtroFacilidad').innerHTML = facs.map(f =>
    `<button class="filter-chip ${state.facilidadFiltro === f ? 'active' : ''}" data-fac="${f}">${f === 'todas' ? 'Todas' : f}</button>`
  ).join('');
  $all('#filtroFacilidad [data-fac]').forEach(b => b.addEventListener('click', () => {
    state.facilidadFiltro = b.dataset.fac;
    renderTramos();
  }));
}

function renderTramos() {
  renderFacilidadFiltro();
  const list = $('#listaTramos');
  let items = state.tramos;
  if (state.facilidadFiltro !== 'todas') items = items.filter(t => t.facilidad === state.facilidadFiltro);
  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><div class="icon">📍</div><p>No hay tramos registrados.</p><p>Toca + y crea el primer tramo de línea.</p></div>`;
    return;
  }
  list.innerHTML = items.map(t => {
    const est = tramoEstado(t.id);
    const label = { ok: 'OK', obs: 'Observación', fuga: 'Evento abierto', 'sin-dato': 'Sin inspección' }[est];
    return `<div class="card" data-tramo-card="${t.id}">
      <div class="card-row">
        <div>
          <div class="card-title">${t.codigo} <span style="color:var(--text-faint);font-weight:400;">· ${t.tipo}</span></div>
          <div class="card-meta">${t.nombre || ''}</div>
          <div class="card-meta"><span class="mono">${t.facilidad}</span>${t.diametro ? ' · Ø' + t.diametro + '"' : ''}${t.ruta && t.ruta.length >= 2 ? ' · 🛤️ ' + routeDistanceKm(t.ruta).toFixed(2) + ' km' : (t.lat ? ' · GPS ✓' : '')}</div>
        </div>
        <span class="badge ${est}">${label}</span>
      </div>
    </div>`;
  }).join('');
  $all('[data-tramo-card]').forEach(c => c.addEventListener('click', () => showTramoDetalle(c.dataset.tramoCard)));
}

function populateTramoSelects() {
  const opts = state.tramos.map(t => `<option value="${t.id}">${t.codigo} — ${t.nombre || t.tipo}</option>`).join('');
  const placeholder = '<option value="">Selecciona un tramo…</option>';
  $('#inspTramo').innerHTML = placeholder + opts;
  $('#evTramo').innerHTML = placeholder + opts;
}

function showTramoDetalle(id) {
  const t = state.tramos.find(x => x.id === id);
  if (!t) return;
  const inspecciones = state.inspecciones.filter(i => i.tramoId === id).sort((a, b) => b.createdAt - a.createdAt);
  const eventos = state.eventos.filter(e => e.tramoId === id).sort((a, b) => b.createdAt - a.createdAt);
  $('#tramoDetalleContenido').innerHTML = `
    <div class="sheet-header"><h2>${t.codigo}</h2><button class="sheet-close" onclick="closeSheet('sheetTramoDetalle')">✕</button></div>
    <div class="card-meta" style="margin-bottom:12px;">${t.nombre || ''} · ${t.tipo} · ${t.facilidad}${t.diametro ? ' · Ø' + t.diametro + '"' : ''}</div>
    ${t.lat ? `<div class="gps-row" style="margin-bottom:8px;"><span>${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}</span></div>` : ''}
    ${t.ruta && t.ruta.length >= 2 ? `<div class="gps-row" style="margin-bottom:12px;"><span>🛤️ Recorrido grabado: ${t.ruta.length} puntos · ${routeDistanceKm(t.ruta).toFixed(2)} km</span></div>` : ''}
    ${t.notas ? `<div class="card" style="margin-bottom:14px;">${t.notas}</div>` : ''}
    <div class="section-heading"><h2>Inspecciones (${inspecciones.length})</h2></div>
    ${inspecciones.slice(0, 5).map(i => `<div class="card"><div class="card-row"><div class="card-meta">${fmtDate(i.createdAt)} · ${i.inspector || ''}</div><span class="badge ${i.resultado}">${i.resultado === 'obs' ? 'Observación' : 'OK'}</span></div></div>`).join('') || '<div class="card-meta">Sin registros.</div>'}
    <div class="section-heading"><h2>Eventos (${eventos.length})</h2></div>
    ${eventos.slice(0, 5).map(e => `<div class="card" data-ev-link="${e.id}"><div class="card-row"><div><div class="card-title">${e.tipo}</div><div class="card-meta">${fmtDate(e.createdAt)}</div></div><span class="badge ${e.estado}">${e.estado}</span></div></div>`).join('') || '<div class="card-meta">Sin registros.</div>'}
    <button class="btn block" style="margin-top:16px;" onclick="editarTramo('${t.id}')">✎ Editar / re-grabar recorrido</button>
    <button class="btn danger block" style="margin-top:10px;" onclick="deleteTramo('${t.id}')">Eliminar tramo</button>
  `;
  $all('#tramoDetalleContenido [data-ev-link]').forEach(c => c.addEventListener('click', () => {
    closeSheet('sheetTramoDetalle');
    showEventoDetalle(c.dataset.evLink);
  }));
  openSheet('sheetTramoDetalle');
}
window.closeSheet = closeSheet;
window.deleteTramo = async function (id) {
  if (!confirm('¿Eliminar este tramo? Las inspecciones y eventos asociados no se borrarán.')) return;
  await DB.remove('tramos', id);
  closeSheet('sheetTramoDetalle');
  toast('Tramo eliminado');
  await reloadAll();
};

// ---------------- Formulario TRAMO ----------------
function stopTrackingIfActive() {
  if (state.tracking.active) stopTracking();
}

function resetTramoForm() {
  state.editingTramoId = null;
  state.gpsTramo = null;
  stopTrackingIfActive();
  state.tracking.points = [];
  $('#tramoFormTitulo').textContent = 'Nuevo tramo';
  $('#tramoCodigo').value = '';
  $('#tramoNombre').value = '';
  $('#tramoTipo').value = 'troncal';
  $('#tramoFacilidad').value = 'CPF-1';
  $('#tramoDiametro').value = '';
  $('#tramoNotas').value = '';
  $('#tramoGpsLabel').textContent = 'Sin capturar';
  updateTrackStats();
}
$('[data-open="sheetTramo"]').addEventListener('click', resetTramoForm);

window.editarTramo = function (id) {
  const t = state.tramos.find(x => x.id === id);
  if (!t) return;
  closeSheet('sheetTramoDetalle');
  state.editingTramoId = t.id;
  state.gpsTramo = (t.lat != null) ? { lat: t.lat, lng: t.lng } : null;
  stopTrackingIfActive();
  state.tracking.points = Array.isArray(t.ruta) ? t.ruta.slice() : [];
  $('#tramoFormTitulo').textContent = 'Editar tramo';
  $('#tramoCodigo').value = t.codigo || '';
  $('#tramoNombre').value = t.nombre || '';
  $('#tramoTipo').value = t.tipo || 'troncal';
  $('#tramoFacilidad').value = t.facilidad || 'CPF-1';
  $('#tramoDiametro').value = t.diametro || '';
  $('#tramoNotas').value = t.notas || '';
  $('#tramoGpsLabel').textContent = t.lat != null ? `${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}` : 'Sin capturar';
  updateTrackStats();
  openSheet('sheetTramo');
};

$('#btnCapturarGpsTramo').addEventListener('click', () => capturarGps((lat, lng) => {
  state.gpsTramo = { lat, lng };
  $('#tramoGpsLabel').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}));

function capturarGps(cb) {
  if (!navigator.geolocation) { toast('GPS no disponible en este dispositivo'); return; }
  toast('Obteniendo ubicación…');
  navigator.geolocation.getCurrentPosition(
    (pos) => { cb(pos.coords.latitude, pos.coords.longitude); toast('Ubicación capturada'); },
    (err) => toast('No se pudo obtener GPS: ' + err.message),
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

$('#btnGuardarTramo').addEventListener('click', async () => {
  const codigo = $('#tramoCodigo').value.trim();
  if (!codigo) { toast('El código del tramo es obligatorio'); return; }
  const obj = {
    id: state.editingTramoId || DB.uid(),
    codigo,
    nombre: $('#tramoNombre').value.trim(),
    tipo: $('#tramoTipo').value,
    facilidad: $('#tramoFacilidad').value,
    diametro: $('#tramoDiametro').value ? parseFloat($('#tramoDiametro').value) : null,
    notas: $('#tramoNotas').value.trim(),
    lat: state.gpsTramo ? state.gpsTramo.lat : null,
    lng: state.gpsTramo ? state.gpsTramo.lng : null,
    ruta: state.tracking.points.length >= 2 ? state.tracking.points.slice() : null,
    createdAt: Date.now(),
  };
  // Si no se capturó un punto único pero sí hay recorrido, usamos el primer punto del recorrido.
  if (obj.lat == null && obj.ruta && obj.ruta.length) {
    obj.lat = obj.ruta[0].lat;
    obj.lng = obj.ruta[0].lng;
  }
  stopTrackingIfActive();
  await DB.put('tramos', obj);
  closeSheet('sheetTramo');
  toast('Tramo guardado');
  await reloadAll();
});

// ---------------- Formulario INSPECCIÓN ----------------
function buildChecklist() {
  const wrap = $('#inspChecklist');
  wrap.innerHTML = CHECKLIST_ITEMS.map((label, idx) => `
    <div class="checklist-item">
      <div class="item-label">${label}</div>
      <div class="seg-toggle" data-idx="${idx}">
        <button type="button" class="sel-ok selected" data-val="ok">OK</button>
        <button type="button" class="sel-obs" data-val="obs">Obs.</button>
        <button type="button" class="sel-na" data-val="na">N/A</button>
      </div>
    </div>
  `).join('');
  $all('#inspChecklist .seg-toggle').forEach(group => {
    group.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  });
}
buildChecklist();

$('[data-open="sheetInspeccion"]').addEventListener('click', () => {
  $('#inspFecha').value = todayISO();
  $('#inspInspector').value = '';
  $('#inspObs').value = '';
  state.pendingFotosInsp = [];
  renderFotoStrip('inspFotos', state.pendingFotosInsp, 'inspFotoInput');
  buildChecklist();
});

function renderFotoStrip(containerId, arr, inputId) {
  const strip = $('#' + containerId);
  const addBtn = strip.querySelector('.photo-add') || document.createElement('label');
  strip.innerHTML = arr.map((src, i) =>
    `<img class="photo-thumb" src="${src}" data-remove="${i}">`
  ).join('') + `<label class="photo-add">＋<input type="file" accept="image/*" capture="environment" id="${inputId}" style="display:none;"></label>`;
  $('#' + inputId).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const raw = await fileToBase64(file);
    const compressed = await compressImage(raw);
    arr.push(compressed);
    renderFotoStrip(containerId, arr, inputId);
  });
  strip.querySelectorAll('[data-remove]').forEach(img => img.addEventListener('click', () => {
    arr.splice(parseInt(img.dataset.remove), 1);
    renderFotoStrip(containerId, arr, inputId);
  }));
}

$('#btnGuardarInspeccion').addEventListener('click', async () => {
  const tramoId = $('#inspTramo').value;
  if (!tramoId) { toast('Selecciona un tramo'); return; }
  const checklist = [];
  let hasObs = false;
  $all('#inspChecklist .seg-toggle').forEach((group, idx) => {
    const sel = group.querySelector('.selected').dataset.val;
    if (sel === 'obs') hasObs = true;
    checklist.push({ item: CHECKLIST_ITEMS[idx], estado: sel });
  });
  const obj = {
    id: DB.uid(),
    tramoId,
    inspector: $('#inspInspector').value.trim(),
    fecha: $('#inspFecha').value || todayISO(),
    checklist,
    resultado: hasObs ? 'obs' : 'ok',
    fotos: state.pendingFotosInsp.slice(),
    observaciones: $('#inspObs').value.trim(),
    createdAt: Date.now(),
  };
  await DB.put('inspecciones', obj);
  closeSheet('sheetInspeccion');
  toast('Inspección guardada');
  await reloadAll();
});

// ---------------- Formulario EVENTO ----------------
$('[data-open="sheetEvento"]').addEventListener('click', () => {
  $('#evDescripcion').value = '';
  state.gpsEv = null;
  $('#evGpsLabel').textContent = 'Sin capturar';
  state.pendingFotosEv = [];
  renderFotoStrip('evFotos', state.pendingFotosEv, 'evFotoInput');
});

$('#btnCapturarGpsEv').addEventListener('click', () => capturarGps((lat, lng) => {
  state.gpsEv = { lat, lng };
  $('#evGpsLabel').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}));

$('#btnGuardarEvento').addEventListener('click', async () => {
  const tramoId = $('#evTramo').value;
  if (!tramoId) { toast('Selecciona un tramo'); return; }
  const obj = {
    id: DB.uid(),
    tramoId,
    tipo: $('#evTipo').value,
    severidad: $('#evSeveridad').value,
    lat: state.gpsEv ? state.gpsEv.lat : null,
    lng: state.gpsEv ? state.gpsEv.lng : null,
    descripcion: $('#evDescripcion').value.trim(),
    fotos: state.pendingFotosEv.slice(),
    estado: 'abierto',
    seguimiento: [],
    createdAt: Date.now(),
    closedAt: null,
  };
  await DB.put('eventos', obj);
  closeSheet('sheetEvento');
  toast('Reporte guardado');
  await reloadAll();
});

function showEventoDetalle(id) {
  const e = state.eventos.find(x => x.id === id);
  if (!e) return;
  const t = state.tramos.find(x => x.id === e.tramoId);
  $('#eventoDetalleContenido').innerHTML = `
    <div class="sheet-header"><h2>${e.tipo}</h2><button class="sheet-close" onclick="closeSheet('sheetEventoDetalle')">✕</button></div>
    <div class="card-row" style="margin-bottom:10px;">
      <span class="badge ${e.severidad}">${e.severidad}</span>
      <span class="badge ${e.estado}">${e.estado}</span>
    </div>
    <div class="card-meta">Tramo: <span class="mono">${t ? t.codigo : '—'}</span> · ${fmtDate(e.createdAt)}</div>
    ${e.lat ? `<div class="gps-row" style="margin:10px 0;"><span>${e.lat.toFixed(5)}, ${e.lng.toFixed(5)}</span></div>` : ''}
    <div class="card" style="margin:10px 0;">${e.descripcion || 'Sin descripción.'}</div>
    ${e.fotos && e.fotos.length ? `<div class="photo-strip">${e.fotos.map(f => `<img class="photo-thumb" src="${f}">`).join('')}</div>` : ''}
    <div class="section-heading"><h2>Seguimiento</h2></div>
    <div id="seguimientoLista">${(e.seguimiento || []).map(s => `<div class="card"><div class="card-meta">${fmtDate(s.fecha)}</div>${s.comentario}</div>`).join('') || '<div class="card-meta">Sin comentarios de seguimiento.</div>'}</div>
    <textarea id="nuevoSeguimiento" rows="2" placeholder="Agregar comentario de seguimiento..." style="margin-top:10px;"></textarea>
    <button class="btn ghost block" style="margin-top:8px;" onclick="agregarSeguimiento('${e.id}')">Agregar comentario</button>
    ${e.estado === 'abierto'
      ? `<button class="btn primary block" style="margin-top:10px;" onclick="cerrarEvento('${e.id}')">Marcar como resuelto</button>`
      : `<div class="card-meta" style="margin-top:10px;">Cerrado el ${fmtDate(e.closedAt)}</div>`}
  `;
  openSheet('sheetEventoDetalle');
}
window.showEventoDetalle = showEventoDetalle;
window.agregarSeguimiento = async function (id) {
  const txt = $('#nuevoSeguimiento').value.trim();
  if (!txt) return;
  const e = await DB.getOne('eventos', id);
  e.seguimiento = e.seguimiento || [];
  e.seguimiento.push({ fecha: Date.now(), comentario: txt });
  await DB.put('eventos', e);
  toast('Comentario agregado');
  await reloadAll();
  showEventoDetalle(id);
};
window.cerrarEvento = async function (id) {
  const e = await DB.getOne('eventos', id);
  e.estado = 'cerrado';
  e.closedAt = Date.now();
  await DB.put('eventos', e);
  toast('Evento marcado como resuelto');
  await reloadAll();
  showEventoDetalle(id);
};

// ---------------- MAPA ----------------
function startLiveLocation() {
  if (!navigator.geolocation) { toast('GPS no disponible en este dispositivo'); return; }
  if (state.liveLocation.watchId != null) return; // ya activo
  state.liveLocation.watchId = navigator.geolocation.watchPosition(
    (pos) => updateLiveMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
    (err) => { /* silencioso: el mapa sigue funcionando sin el punto en vivo */ },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
  );
}
function stopLiveLocation() {
  if (state.liveLocation.watchId != null) navigator.geolocation.clearWatch(state.liveLocation.watchId);
  state.liveLocation.watchId = null;
  if (state.liveLocation.marker) { state.map && state.map.removeLayer(state.liveLocation.marker); state.liveLocation.marker = null; }
  if (state.liveLocation.accuracyCircle) { state.map && state.map.removeLayer(state.liveLocation.accuracyCircle); state.liveLocation.accuracyCircle = null; }
}
function updateLiveMarker(lat, lng, accuracy) {
  if (!state.map) return;
  if (!state.liveLocation.marker) {
    const icon = L.divIcon({
      className: '',
      html: '<div class="live-marker"><div class="pulse"></div><div class="dot">🚶</div></div>',
      iconSize: [26, 26], iconAnchor: [13, 13],
    });
    state.liveLocation.marker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(state.map);
    state.liveLocation.accuracyCircle = L.circle([lat, lng], { radius: accuracy || 15, color: '#5B8AA6', weight: 1, fillOpacity: 0.08 }).addTo(state.map);
  } else {
    state.liveLocation.marker.setLatLng([lat, lng]);
    state.liveLocation.accuracyCircle.setLatLng([lat, lng]).setRadius(accuracy || 15);
  }
}

function initMapIfNeeded() {
  if (state.map) { state.map.invalidateSize(); renderMapMarkers(); return; }
  state.map = L.map('map').setView([4.15, -72.6], 9); // Meta, Colombia aprox.
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(state.map);
  renderMapMarkers();
  navigator.geolocation && navigator.geolocation.getCurrentPosition(
    (pos) => { state.map.setView([pos.coords.latitude, pos.coords.longitude], 13); updateLiveMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy); },
    () => {}
  );
}

function renderMapMarkers() {
  if (!state.map) return;
  state.mapLayers.forEach(l => state.map.removeLayer(l));
  state.mapLayers = [];
  state.tramos.forEach(t => {
    if (t.ruta && t.ruta.length >= 2) {
      const line = L.polyline(t.ruta.map(p => [p.lat, p.lng]), { color: '#5B8AA6', weight: 4, opacity: 0.85 })
        .addTo(state.map).bindPopup(`<b>${t.codigo}</b><br>${t.tipo} · ${t.facilidad} · ${routeDistanceKm(t.ruta).toFixed(2)} km`);
      state.mapLayers.push(line);
    } else if (t.lat != null) {
      const m = L.circleMarker([t.lat, t.lng], { radius: 7, color: '#5B8AA6', fillColor: '#5B8AA6', fillOpacity: 0.85, weight: 2 })
        .addTo(state.map).bindPopup(`<b>${t.codigo}</b><br>${t.tipo} · ${t.facilidad}`);
      state.mapLayers.push(m);
    }
  });
  state.eventos.forEach(e => {
    if (e.lat == null) return;
    const color = e.estado === 'abierto' ? '#D64545' : '#5C666F';
    const m = L.circleMarker([e.lat, e.lng], { radius: 8, color, fillColor: color, fillOpacity: 0.9, weight: 2 })
      .addTo(state.map).bindPopup(`<b>${e.tipo}</b><br>${e.severidad} · ${e.estado}`);
    m.on('click', () => showEventoDetalle(e.id));
    state.mapLayers.push(m);
  });
}

// ---------------- HISTORIAL ----------------
$all('[data-hfilter]').forEach(b => b.addEventListener('click', () => {
  $all('[data-hfilter]').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  state.historialFiltro = b.dataset.hfilter;
  renderHistorial();
}));

function renderHistorial() {
  let items = [
    ...state.inspecciones.map(i => ({ tipo: 'insp', ts: i.createdAt, data: i })),
    ...state.eventos.map(e => ({ tipo: 'ev', ts: e.createdAt, data: e })),
  ];
  if (state.historialFiltro === 'inspecciones') items = items.filter(i => i.tipo === 'insp');
  if (state.historialFiltro === 'eventos') items = items.filter(i => i.tipo === 'ev');
  items.sort((a, b) => b.ts - a.ts);

  const list = $('#listaHistorial');
  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><div class="icon">🗂️</div><p>Aún no hay historial que mostrar.</p></div>`;
    return;
  }
  list.innerHTML = items.map(it => {
    const t = state.tramos.find(x => x.id === it.data.tramoId);
    const tramoLabel = t ? t.codigo : '—';
    if (it.tipo === 'insp') {
      return `<div class="card" data-hi="${it.data.id}"><div class="card-row">
        <div><div class="card-title">Inspección · <span class="mono">${tramoLabel}</span></div>
        <div class="card-meta">${fmtDate(it.data.createdAt)} · ${it.data.inspector || 'Sin nombre'}</div></div>
        <span class="badge ${it.data.resultado}">${it.data.resultado === 'obs' ? 'Observación' : 'OK'}</span>
      </div></div>`;
    } else {
      return `<div class="card" data-he="${it.data.id}"><div class="card-row">
        <div><div class="card-title">${it.data.tipo} · <span class="mono">${tramoLabel}</span></div>
        <div class="card-meta">${fmtDate(it.data.createdAt)}</div></div>
        <span class="badge ${it.data.estado}">${it.data.estado}</span>
      </div></div>`;
    }
  }).join('');
  $all('[data-he]').forEach(c => c.addEventListener('click', () => showEventoDetalle(c.dataset.he)));
}

$('#btnExportar').addEventListener('click', () => {
  const rows = [['tipo', 'tramo', 'fecha', 'resultado_estado', 'severidad', 'inspector', 'descripcion_observaciones', 'lat', 'lng']];
  state.inspecciones.forEach(i => {
    const t = state.tramos.find(x => x.id === i.tramoId);
    rows.push(['inspeccion', t ? t.codigo : '', fmtDate(i.createdAt), i.resultado, '', i.inspector || '', (i.observaciones || '').replace(/\n/g, ' '), '', '']);
  });
  state.eventos.forEach(e => {
    const t = state.tramos.find(x => x.id === e.tramoId);
    rows.push(['evento', t ? t.codigo : '', fmtDate(e.createdAt), e.estado, e.severidad, '', (e.descripcion || '').replace(/\n/g, ' '), e.lat || '', e.lng || '']);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `historial_lineas_${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV exportado');
});

// ---------------- Service worker & estado de conexión ----------------
function updateConnStatus() {
  const online = navigator.onLine;
  $('#connLabel').textContent = online ? 'Conectado' : 'Sin conexión';
  $('#connStatus').classList.toggle('offline', !online);
}
window.addEventListener('online', updateConnStatus);
window.addEventListener('offline', updateConnStatus);
updateConnStatus();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ---------------- Arranque ----------------
reloadAll();
