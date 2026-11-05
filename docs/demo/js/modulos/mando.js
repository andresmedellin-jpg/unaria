// Centro de mando (Grupo A.M): lo que pasa HOY en todos los negocios de un vistazo, sin tablas ni pasteles.
// 1. Pulso: lo vendido hoy en el grupo (contador) y una curva por hora de cada negocio, apiladas.
// 2. Radar de Monterrey: sucursales, pedidos en camino (se mueven) y pedidos nuevos (laten).
// 3. "Requiere tu atención": lo urgente ordenado, cada cosa con su botón.
// 4. Mundos: una tarjeta por negocio con su propia mini-visual (riel de cocina, curva del día, pasos por hacer).
// 5. Cinta de eventos: los próximos 30 días, cada evento como un punto del tamaño de sus invitados.
// Lee: pedidos, conversaciones, eventos, menus (ubicaciones) y las vistas v_lv_* de Loyverse.
import { db, esc, hoyISO, estado } from '../lib.js';
import { MARCA } from '../config.js';

const dinero = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');
const corto = (n) => (Math.abs(n) >= 1000 ? '$' + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'k' : dinero(n));
const ir = (id) => `${location.pathname}${location.search}#/${id}`;
const minDe = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso)) / 6e4));
const NEG = () => MARCA.negocios || [];
const neg = (id) => NEG().find((n) => n.id === id) || {};
let raiz, timer;

export async function render(view) {
  raiz = view; estilos(); clearInterval(timer);
  document.getElementById('page-actions').innerHTML = '';
  view.innerHTML = '<div class="cargando">Conectando con los negocios…</div>';
  const D = await cargar();
  pintar(D);
  timer = setInterval(() => { if (!document.body.contains(raiz)) return clearInterval(timer); cargar().then((d) => { if (!document.querySelector('#modal-root .modal')) pintar(d, true); }); }, 60000);
}

// ---------- datos ----------
async function cargar() {
  const hoy = hoyISO(), d28 = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10);
  const ayer = new Date(); ayer.setHours(0, 0, 0, 0);
  const chb = NEG().find((n) => (n.modulos || []).includes('pedidos'));
  const lvs = NEG().filter((n) => (n.modulos || []).includes('ventas'));
  const [pe, co, ev, mn, cu] = await Promise.all([
    chb ? db().from('pedidos').select('*').gte('creado_en', ayer.toISOString()) : { data: [] },
    db().from('conversaciones').select('id, contacto, canal, etiqueta, por_contestar, evento_id, ultimo_en, extraccion'),
    db().from('eventos').select('*'),
    chb ? db().from('menus').select('datos').eq('empresa_id', chb.empresa_id).maybeSingle() : { data: null },
    db().from('lv_cuentas').select('id, empresa_id, ultimo_sync'),
  ]);
  const cuentas = cu.data || [];
  const loy = {};
  await Promise.all(lvs.map(async (n) => {
    const c = cuentas.find((x) => x.empresa_id === n.empresa_id);
    if (!c) { loy[n.id] = null; return; }
    const [h, v, p] = await Promise.all([
      db().from('v_lv_horas').select('dia, dow, hora, venta, tickets').eq('cuenta_id', c.id).gte('dia', d28).lte('dia', hoy),
      db().from('v_lv_ventas_dia').select('dia, venta, tickets').eq('cuenta_id', c.id).gte('dia', d28).lte('dia', hoy),
      db().from('v_lv_productos_dia').select('*').eq('cuenta_id', c.id).eq('dia', hoy),
    ]);
    loy[n.id] = { cuenta: c, horas: h.data || [], dias: v.data || [], productos: p.data || [] };
  }));
  const datosMenu = mn.data?.datos || {};
  const base = (window.MENU_CHILABIKE || {}).ubicaciones || {};
  const ubic = {}; (datosMenu.sucursales || Object.keys(base)).forEach((s) => { ubic[s] = { ...(base[s] || {}), ...((datosMenu.ubicaciones || {})[s] || {}) }; });
  const hoyD = new Date().toDateString();
  return { chb, pedidos: (pe.data || []).filter((p) => new Date(p.creado_en).toDateString() === hoyD), convs: co.data || [], eventos: ev.data || [], ubic, loy, hoy, eventosCfg: datosMenu.eventos || window.MENU_CHILABIKE?.eventos || {} };
}

// Venta por hora de hoy, por negocio (Loyverse por hora; Chilabike, los pedidos)
function curvas(D) {
  const series = [];
  NEG().forEach((n) => {
    const h = new Array(24).fill(0);
    if (n.id === D.chb?.id) D.pedidos.filter((p) => p.estado !== 'cancelado').forEach((p) => { h[new Date(p.creado_en).getHours()] += Number(p.total || 0); });
    else if (D.loy[n.id]) D.loy[n.id].horas.filter((x) => x.dia === D.hoy).forEach((x) => { h[x.hora] += Number(x.venta || 0); });
    else return;
    series.push({ n, h, total: h.reduce((a, b) => a + b, 0) });
  });
  return series;
}
// Promedio del mismo día de la semana (últimas 4 semanas) para los negocios con Loyverse, hasta esta hora
function promedioMismoDia(D) {
  const dow = ((new Date().getDay() + 6) % 7) + 1, ahora = new Date().getHours();
  let suma = 0, dias = 0;
  Object.values(D.loy).filter(Boolean).forEach((L) => {
    const fechas = [...new Set(L.horas.filter((x) => x.dow === dow && x.dia !== D.hoy).map((x) => x.dia))];
    dias = Math.max(dias, fechas.length);
    suma += L.horas.filter((x) => x.dow === dow && x.dia !== D.hoy && x.hora <= ahora).reduce((s, x) => s + Number(x.venta || 0), 0) / (fechas.length || 1);
  });
  return dias ? suma : null;
}

// ---------- pintar ----------
function pintar(D, refresco) {
  const S = curvas(D), total = S.reduce((s, x) => s + x.total, 0);
  const prom = promedioMismoDia(D);
  const loyHoy = Object.values(D.loy).filter(Boolean).reduce((s, L) => s + L.horas.filter((x) => x.dia === D.hoy).reduce((a, x) => a + Number(x.venta || 0), 0), 0);
  const delta = prom ? Math.round(((loyHoy - prom) / prom) * 100) : null;
  const h = new Date().getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const nombre = (estado.miembro?.nombre || '').split(' ')[0];
  const fecha = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const at = atencion(D);
  raiz.innerHTML = `
  <section class="mk-hero">
    <div class="mk-hoy">
      <p class="mk-eti">${esc(saludo)}, ${esc(nombre)} · ${esc(fecha)}</p>
      <h2 class="mk-total"><span data-cuenta="${Math.round(total)}">${refresco ? dinero(total) : '$0'}</span><small>vendido hoy en el grupo</small></h2>
      ${delta != null ? `<p class="mk-delta ${delta > 0 ? 'sube' : delta < 0 ? 'baja' : ''}">${delta > 0 ? '▲ ' + delta + '%' : delta < 0 ? '▼ ' + Math.abs(delta) + '%' : '= parejo'} <span>Loyverse vs. un ${esc(new Date().toLocaleDateString('es-MX', { weekday: 'long' }))} normal a esta hora</span></p>` : ''}
      <div class="mk-mezcla">${S.map((x) => `<i style="flex:${Math.max(x.total, total * 0.02)};background:${x.n.color}" title="${esc(x.n.nombre)}: ${dinero(x.total)}"></i>`).join('')}</div>
      <div class="mk-leyenda">${S.map((x) => `<span><i style="background:${x.n.color}"></i>${esc(x.n.nombre)} <b>${dinero(x.total)}</b></span>`).join('')}</div>
    </div>
    <div class="mk-pulso">${pulso(S)}</div>
  </section>
  <section class="mk-fila">
    <div class="mk-card mk-radar-c"><div class="mk-cab"><h3>Radar · Monterrey</h3><span class="mk-eti">${D.pedidos.filter((p) => p.estado === 'camino').length} en camino · ${Object.keys(D.ubic).length} sucursales</span></div>${radar(D)}</div>
    <div class="mk-card mk-at"><div class="mk-cab"><h3>Requiere tu atención</h3><span class="mk-eti">${at.length ? at.length + ' pendientes' : 'todo en orden'}</span></div>
      <div class="mk-at-lista">${at.length ? at.map((a, i) => `<a class="mk-a ${a.nivel}" href="${ir(a.ir)}" style="--c:${a.n.color};--d:${i * 60}ms"><span class="mk-a-ico">${a.n.insignia || ''}</span>
        <span class="mk-a-tx"><b>${a.t}</b><small>${a.d}</small></span><span class="mk-a-cta">${esc(a.cta)} →</span></a>`).join('') : '<p class="mk-vacio">Nada urgente. 🙌</p>'}</div></div>
  </section>
  <section class="mk-mundos">${NEG().map((n) => mundo(n, D)).join('')}</section>
  <section class="mk-card mk-cinta-c"><div class="mk-cab"><h3>Próximos 30 días · eventos</h3><span class="mk-eti">${cintaResumen(D)}</span></div>${cinta(D)}</section>
  ${MARCA.demo ? '<p class="mk-nota">Demostración: todos los números son de ejemplo. Se actualiza solo cada minuto.</p>' : ''}`;
  if (!refresco) contar();
}

function contar() {
  raiz.querySelectorAll('[data-cuenta]').forEach((el) => {
    const fin = Number(el.dataset.cuenta), t0 = performance.now(), dur = 1100;
    const paso = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = dinero(fin * e); if (k < 1) requestAnimationFrame(paso); };
    requestAnimationFrame(paso);
  });
}

// Curvas apiladas y acumuladas por hora, con brillo; la línea vertical es "ahora"
function pulso(S) {
  const W = 640, H = 230, h0 = 7, h1 = 23, ahora = new Date().getHours() + new Date().getMinutes() / 60;
  if (!S.length) return '<p class="mk-vacio">Sin ventas conectadas todavía.</p>';
  const acum = S.map((x) => { let a = 0; return x.h.map((v) => (a += v)); });
  const pila = acum.map((_, i) => acum[0].map((__, k) => acum.slice(0, i + 1).reduce((s, l) => s + l[k], 0)));
  const max = Math.max(...pila[pila.length - 1], 1) * 1.12;
  const X = (hr) => ((hr - h0) / (h1 - h0)) * W, Y = (v) => H - (v / max) * (H - 18);
  const hasta = Math.min(h1, Math.floor(ahora));
  const pts = (l) => { const p = []; for (let k = h0; k <= hasta; k++) p.push([X(k + 1 > ahora ? ahora : k + 1), Y(l[k])]); return [[X(h0), Y(0)], ...p]; };
  const linea = (P) => P.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const capas = pila.map((l, i) => {
    const P = pts(l), abajo = i ? pts(pila[i - 1]).reverse() : [[P[P.length - 1][0], H], [X(h0), H]];
    const c = S[i].n.color;
    return `<path d="${linea(P)} ${abajo.map((p) => 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')} Z" fill="url(#mk-g${i})"/>
      <path d="${linea(P)}" fill="none" stroke="${c}" stroke-width="2.4" filter="url(#mk-brillo)" vector-effect="non-scaling-stroke"/>
      <defs><linearGradient id="mk-g${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".55"/><stop offset="1" stop-color="${c}" stop-opacity=".04"/></linearGradient></defs>`;
  }).join('');
  const marcas = [8, 11, 14, 17, 20, 23].map((k) => `<text x="${X(k)}" y="${H + 16}" class="mk-eje">${k > 12 ? k - 12 + ' pm' : k === 12 ? '12 pm' : k + ' am'}</text><line x1="${X(k)}" x2="${X(k)}" y1="0" y2="${H}" class="mk-reja"/>`).join('');
  const xa = X(Math.min(h1, Math.max(h0, ahora))), ya = Y(pila[pila.length - 1][Math.min(23, Math.floor(ahora))] || 0);
  return `<div class="mk-cab"><h3>Pulso del día</h3><span class="mk-eti">venta acumulada por hora</span></div>
  <svg viewBox="0 0 ${W} ${H + 22}" class="mk-pulso-svg" role="img" aria-label="Venta acumulada de hoy por hora">
    <defs><filter id="mk-brillo" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    ${marcas}${capas}
    <line x1="${xa}" x2="${xa}" y1="0" y2="${H}" class="mk-ahora"/><circle cx="${xa}" cy="${ya}" r="5" class="mk-ahora-p"/><circle cx="${xa}" cy="${ya}" r="5" class="mk-ahora-o"/>
    <text x="${Math.min(W - 4, xa + 8)}" y="14" class="mk-eje mk-ahora-t" text-anchor="${xa > W - 60 ? 'end' : 'start'}">AHORA</text>
  </svg>`;
}

// ---------- radar ----------
const B = { w: -100.455, e: -100.235, s: 25.623, n: 25.748 };
const proy = (lat, lng, W, H) => [((lng - B.w) / (B.e - B.w)) * W, ((B.n - lat) / (B.n - B.s)) * H];
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
function destino(p, D) {
  const m = String(p.mapa || p.direccion || '').match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/); if (m) return [+m[1], +m[2]];
  const o = D.ubic[p.sucursal] || D.ubic[Object.keys(D.ubic)[hash(p.id) % Math.max(1, Object.keys(D.ubic).length)]] || { lat: 25.67, lng: -100.33 };
  const a = (hash(p.id + 'a') % 360) * Math.PI / 180, r = 0.012 + (hash(p.id + 'r') % 100) / 100 * 0.022;
  return [o.lat + Math.sin(a) * r, o.lng + Math.cos(a) * r * 1.1];
}
function origen(p, D) {
  if (p.sucursal && D.ubic[p.sucursal]?.lat) return [D.ubic[p.sucursal].lat, D.ubic[p.sucursal].lng];
  const [la, ln] = destino(p, D); let mejor = null, dm = 1e9;
  Object.entries(D.ubic).forEach(([k, u]) => { if (!u.lat) return; const d = (u.lat - la) ** 2 + (u.lng - ln) ** 2; if (d < dm) { dm = d; mejor = u; } });
  return mejor ? [mejor.lat, mejor.lng] : [la + 0.01, ln - 0.01];
}
function radar(D) {
  const W = 720, H = 430, c = D.chb ? D.chb.color : 'var(--primary)';
  const [cx, cy] = proy(25.6700, -100.3125, W, H);
  const kmPx = W / ((B.e - B.w) * 101);
  const anillos = [3, 6, 9, 12].map((k) => `<circle cx="${cx}" cy="${cy}" r="${k * kmPx}" class="mk-anillo"/><text x="${cx + k * kmPx * 0.707 + 4}" y="${cy - k * kmPx * 0.707}" class="mk-eje">${k} km</text>`).join('');
  const rio = [[25.672, -100.47], [25.669, -100.42], [25.665, -100.385], [25.663, -100.35], [25.666, -100.315], [25.671, -100.28], [25.676, -100.25], [25.681, -100.215]].map(([la, ln]) => proy(la, ln, W, H));
  const rioD = rio.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const cerro = proy(25.636, -100.262, W, H);
  const sucs = Object.entries(D.ubic).filter(([, u]) => u.lat).map(([k, u]) => {
    const [x, y] = proy(u.lat, u.lng, W, H), activos = D.pedidos.filter((p) => p.sucursal === k && ['nuevo', 'cocina'].includes(p.estado)).length;
    return `<g class="mk-suc" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><rect x="-5" y="-5" width="10" height="10" rx="2.5" fill="${c}" transform="rotate(45)"/>${activos ? `<circle r="9" class="mk-ping" stroke="${c}"/>` : ''}<text x="10" y="4" class="mk-suc-t">${esc(k)}${u.dias ? ' · dom' : ''}</text></g>`;
  }).join('');
  // Curandero (o cualquier negocio con sucursal propia) en Mitras, junto a Chilabike
  const cur = NEG().find((n) => n.id === 'curandero');
  const curP = cur && D.ubic.Mitras?.lat ? proy(D.ubic.Mitras.lat - 0.0035, D.ubic.Mitras.lng + 0.004, W, H) : null;
  const camino = D.pedidos.filter((p) => p.estado === 'camino').map((p, i) => {
    const [ola, oln] = origen(p, D), [dla, dln] = destino(p, D);
    const [x1, y1] = proy(ola, oln, W, H), [x2, y2] = proy(dla, dln, W, H);
    const mx = (x1 + x2) / 2 - (y2 - y1) * 0.25, my = (y1 + y2) / 2 + (x2 - x1) * 0.25, d = `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    return `<path d="${d}" class="mk-ruta" stroke="${c}"/><circle cx="${x2}" cy="${y2}" r="4" class="mk-dest" stroke="${c}"/>
      <circle r="4.5" class="mk-moto"><animateMotion dur="${5 + (i % 3)}s" repeatCount="indefinite" path="${d}"/></circle>
      <text x="${x2 + 8}" y="${y2 + 4}" class="mk-dest-t">#${esc(p.numero)} · ${minDe(p.creado_en)} min</text>`;
  }).join('');
  const nuevos = D.pedidos.filter((p) => p.estado === 'nuevo' && p.entrega !== 'recoger').map((p) => { const [la, ln] = destino(p, D), [x, y] = proy(la, ln, W, H);
    return `<circle cx="${x}" cy="${y}" r="3.5" fill="${c}"/><circle cx="${x}" cy="${y}" r="3.5" class="mk-nuevo" stroke="${c}"/>`; }).join('');
  return `<div class="mk-radar"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa de sucursales y pedidos en camino">
    <defs><radialGradient id="mk-barrido" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${cx} ${cy}) scale(${12.5 * kmPx})"><stop offset="0" stop-color="${c}" stop-opacity=".0"/><stop offset="1" stop-color="${c}" stop-opacity=".22"/></radialGradient>
      <linearGradient id="mk-cono" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c}" stop-opacity="0"/><stop offset="1" stop-color="${c}" stop-opacity=".16"/></linearGradient></defs>
    ${anillos}
    <path d="${rioD}" class="mk-rio"/><text x="${rio[1][0]}" y="${rio[1][1] + 16}" class="mk-eje">Río Santa Catarina</text>
    <path d="M${cerro[0] - 26} ${cerro[1] + 10} L${cerro[0] - 10} ${cerro[1] - 12} L${cerro[0]} ${cerro[1] - 2} L${cerro[0] + 10} ${cerro[1] - 16} L${cerro[0] + 28} ${cerro[1] + 10}" class="mk-cerro"/><text x="${cerro[0]}" y="${cerro[1] + 24}" class="mk-eje" text-anchor="middle">Cerro de la Silla</text>
    <g class="mk-giro" style="transform-origin:${cx}px ${cy}px"><path d="M${cx} ${cy} L${cx + 12.5 * kmPx} ${cy} A${12.5 * kmPx} ${12.5 * kmPx} 0 0 0 ${cx + 12.5 * kmPx * Math.cos(-0.7)} ${cy + 12.5 * kmPx * Math.sin(-0.7)} Z" fill="url(#mk-cono)"/></g>
    ${camino}${nuevos}${sucs}
    ${curP ? `<g transform="translate(${curP[0].toFixed(1)} ${curP[1].toFixed(1)})"><circle r="6" fill="${cur.color}" stroke="var(--halo, #0B0C0F)" stroke-width="2"/><text x="10" y="14" class="mk-suc-t" fill="var(--text-2)">Curandero</text></g>` : ''}
    <circle cx="${cx}" cy="${cy}" r="2.5" fill="var(--tinta-svg, #fff)" opacity=".6"/>
  </svg>
  <div class="mk-radar-ley"><span><i class="r" style="background:${c}"></i>Sucursal Chilabike</span><span><i class="m"></i>Pedido en camino</span><span><i class="n" style="border-color:${c}"></i>Pedido nuevo</span>${curP ? `<span><i class="c" style="background:${cur.color}"></i>Curandero</span>` : ''}</div></div>`;
}

// ---------- requiere tu atención ----------
function atencion(D) {
  const L = [], chb = D.chb ? neg(D.chb.id) : null;
  if (chb) {
    D.pedidos.filter((p) => ['nuevo', 'cocina', 'camino'].includes(p.estado) && minDe(p.creado_en) >= 25).sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en)).slice(0, 2).forEach((p) => {
      const m = minDe(p.creado_en);
      L.push({ n: chb, nivel: m >= 40 ? 'rojo' : 'ambar', peso: 100 + m, t: `Pedido #${esc(p.numero)} lleva ${m} min ${({ nuevo: 'sin entrar a cocina', cocina: 'en cocina', camino: 'en camino' })[p.estado]}`, d: `${esc(p.contacto || '')} · ${dinero(p.total)} · ${esc(p.entrega === 'recoger' ? 'recoge en ' + (p.sucursal || '') : p.direccion || '')}`, cta: 'Ver pedido', ir: `${chb.id}-pedidos?p=${p.id}` });
    });
    const pp = D.eventosCfg.precioPersona || 0;
    D.convs.filter((c) => c.por_contestar && c.etiqueta === 'evento').sort((a, b) => new Date(a.ultimo_en) - new Date(b.ultimo_en)).slice(0, 3).forEach((c) => {
      const x = c.extraccion || {}, monto = x.monto || (pp && x.personas ? x.personas * pp : 0), m = minDe(c.ultimo_en);
      L.push({ n: chb, nivel: m > 60 ? 'ambar' : '', peso: 60 + Math.min(39, m / 3) + monto / 2000, t: `${esc(c.contacto)} espera tu cotización`, d: `${esc(x.tipo || 'Evento')}${x.personas ? ' · ' + x.personas + ' personas' : ''}${monto ? ' · ' + dinero(monto) : ''} · hace ${m < 60 ? m + ' min' : Math.round(m / 60) + ' h'}`, cta: 'Contestar', ir: `${chb.id}-bandeja?c=${c.id}` });
    });
    const en7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    D.eventos.filter((e) => ['apartado', 'confirmado'].includes(e.estado) && e.fecha >= D.hoy && e.fecha <= en7 && Number(e.monto) > Number(e.anticipo)).slice(0, 2).forEach((e) => {
      L.push({ n: chb, nivel: '', peso: 50, t: `Falta cobrar ${dinero(e.monto - e.anticipo)} · ${esc(e.contacto || e.tipo)}`, d: `${esc(e.tipo)} el ${esc(new Date(e.fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric' }))} · ${e.personas} personas`, cta: 'Ver evento', ir: `${chb.id}-eventos?e=${e.id}` });
    });
  }
  NEG().forEach((n) => {
    const Lg = D.loy[n.id];
    if ((n.modulos || []).includes('ventas') && !Lg) L.push({ n, nivel: '', peso: 20, t: `${esc(n.nombre)}: falta conectar Loyverse`, d: esc(n.notaLoyverse || 'En cuanto se conecte, su venta aparece aquí'), cta: 'Ver', ir: `${n.id}-ventas` });
    if ((n.modulos || []).includes('preparacion')) L.push({ n, nivel: '', peso: 15, t: `${esc(n.nombre)}: ${esc(n.pendiente || 'en preparación')}`, d: esc((n.preparacion?.falta || []).join(' · ')), cta: 'Ver', ir: `${n.id}-preparacion` });
  });
  return L.sort((a, b) => b.peso - a.peso).slice(0, 6);
}

// ---------- mundos: una tarjeta por negocio ----------
function mundo(n, D) {
  const m = n.modulos || [], primero = `${n.id}-${m[0]}`;
  let cuerpo = '';
  if (m.includes('pedidos')) {
    const abiertos = D.pedidos.filter((p) => ['nuevo', 'cocina', 'camino'].includes(p.estado));
    const carril = (est, t) => { const l = abiertos.filter((p) => p.estado === est);
      return `<div class="mk-carril"><span>${t}</span><div>${l.map((p) => { const mm = minDe(p.creado_en); return `<i class="${mm >= 40 ? 'rojo' : mm >= 25 ? 'ambar' : ''}" title="#${p.numero} · ${mm} min"></i>`; }).join('') || '<em>—</em>'}</div><b>${l.length}</b></div>`; };
    const sinRes = D.convs.filter((c) => c.por_contestar).length;
    const mes = D.hoy.slice(0, 7), evMes = D.eventos.filter((e) => ['apartado', 'confirmado', 'realizado'].includes(e.estado) && (e.fecha || '').startsWith(mes)).reduce((s, e) => s + Number(e.monto || 0), 0);
    cuerpo = `<div class="mk-riel">${carril('nuevo', 'Nuevos')}${carril('cocina', 'Cocina')}${carril('camino', 'Camino')}</div>
      <div class="mk-mini"><span><b>${sinRes}</b>mensajes sin contestar</span><span><b>${corto(evMes)}</b>en eventos del mes</span><span><b>${D.pedidos.length}</b>pedidos hoy</span></div>`;
  } else if (m.includes('ventas') && D.loy[n.id]) {
    const L = D.loy[n.id], hh = new Array(24).fill(0), dow = ((new Date().getDay() + 6) % 7) + 1, pr = new Array(24).fill(0);
    L.horas.filter((x) => x.dia === D.hoy).forEach((x) => { hh[x.hora] += Number(x.venta || 0); });
    const fechas = new Set(L.horas.filter((x) => x.dow === dow && x.dia !== D.hoy).map((x) => x.dia));
    L.horas.filter((x) => x.dow === dow && x.dia !== D.hoy).forEach((x) => { pr[x.hora] += Number(x.venta || 0) / (fechas.size || 1); });
    const vh = hh.reduce((a, b) => a + b, 0), th = L.horas.filter((x) => x.dia === D.hoy).reduce((s, x) => s + Number(x.tickets || 0), 0);
    const top = [...L.productos].sort((a, b) => Number(b.venta || 0) - Number(a.venta || 0))[0];
    cuerpo = `${chispa(hh, pr, n.color)}
      <div class="mk-mini"><span><b>${dinero(vh)}</b>hoy · ${th} tickets</span><span><b>${th ? dinero(vh / th) : '—'}</b>ticket promedio</span><span><b>${esc(top?.nombre || '—')}</b>lo más vendido hoy</span></div>`;
  } else if (m.includes('ventas')) {
    cuerpo = pasos(['Contratar Loyverse', 'Dar de alta el menú', 'Conectar al sistema'], 0, n.notaLoyverse);
  } else if (m.includes('preparacion')) {
    const f = n.preparacion?.falta || [];
    cuerpo = pasos(f.length ? f : ['Por definir'], 0, n.preparacion?.texto);
  }
  return `<a class="mk-mundo" href="${ir(primero)}" style="--c:${n.color}">
    <span class="mk-m-top">${n.insignia}<span><b>${esc(n.nombre)}</b><small>${esc(n.giro || '')}</small></span><span class="mk-m-ir">→</span></span>${cuerpo}</a>`;
}
function chispa(hh, pr, c) {
  const W = 300, H = 70, h0 = 7, h1 = 19, max = Math.max(...hh, ...pr, 1) * 1.1;
  const X = (k) => ((k - h0) / (h1 - h0)) * W, Y = (v) => H - (v / max) * H;
  const ahora = new Date().getHours();
  const camino = (l, hasta) => { let d = ''; for (let k = h0; k <= hasta; k++) d += (k === h0 ? 'M' : 'L') + X(k).toFixed(1) + ' ' + Y(l[k]).toFixed(1); return d; };
  const hoyD = camino(hh, Math.min(h1, ahora));
  return `<svg viewBox="0 -4 ${W} ${H + 8}" class="mk-chispa" preserveAspectRatio="none" aria-hidden="true">
    <path d="${camino(pr, h1)}" fill="none" stroke="rgb(var(--k, 255 255 255) / .28)" stroke-width="1.4" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>
    <path d="${hoyD} L${X(Math.min(h1, ahora))} ${H} L${X(h0)} ${H} Z" fill="${c}" opacity=".22"/>
    <path d="${hoyD}" fill="none" stroke="${c}" stroke-width="2.2" vector-effect="non-scaling-stroke" style="filter:drop-shadow(0 0 6px ${c})"/>
  </svg><p class="mk-chispa-l"><i style="background:${c}"></i>hoy por hora <i class="pr"></i>un ${esc(new Date().toLocaleDateString('es-MX', { weekday: 'long' }))} normal</p>`;
}
function pasos(l, hechos, nota) {
  return `<ol class="mk-pasos">${l.map((t, i) => `<li class="${i < hechos ? 'ok' : i === hechos ? 'ya' : ''}"><i>${i < hechos ? '✓' : i + 1}</i>${esc(t)}</li>`).join('')}</ol>${nota ? `<p class="mk-m-nota">${esc(nota)}</p>` : ''}`;
}

// ---------- cinta de eventos ----------
const EST = { solicitud: '#FFB547', cotizado: '#5B9BFF', apartado: '#A98BFF', confirmado: '#3DDC97', realizado: '#7D8188' };
function cintaResumen(D) {
  const fin = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const l = D.eventos.filter((e) => e.fecha >= D.hoy && e.fecha <= fin && e.estado !== 'cancelado');
  return `${l.length} eventos · ${corto(l.reduce((s, e) => s + Number(e.monto || 0), 0))} · ${l.reduce((s, e) => s + Number(e.personas || 0), 0).toLocaleString('es-MX')} invitados`;
}
function cinta(D) {
  const dias = 30, inicio = new Date(D.hoy + 'T00:00:00');
  const fin = new Date(+inicio + dias * 864e5).toISOString().slice(0, 10);
  const l = D.eventos.filter((e) => e.fecha >= D.hoy && e.fecha <= fin && e.estado !== 'cancelado').sort((a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || '')));
  const pos = (f) => ((new Date(f + 'T12:00:00') - inicio) / 864e5 / dias) * 100;
  const maxP = Math.max(...l.map((e) => Number(e.personas || 0)), 50);
  const marcas = []; for (let k = 0; k <= dias; k += 1) { const d = new Date(+inicio + k * 864e5); marcas.push(`<span class="${d.getDay() === 6 || d.getDay() === 0 ? 'fin' : ''}${k === 0 ? ' hoy' : ''}" style="left:${(k / dias) * 100}%"></span>`); }
  const dias_ = []; for (let k = 0; k <= dias; k += 3) { const d = new Date(+inicio + k * 864e5); dias_.push(`<span style="left:${(k / dias) * 100}%">${k === 0 ? 'HOY' : d.getDate() + (d.getDate() <= 3 || k === 3 ? ' ' + d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '') : '')}</span>`); }
  const chb = D.chb ? D.chb.id : 'chilabike';
  let alterna = 0;
  return `<div class="mk-cinta-scroll"><div class="mk-cinta">
    <div class="mk-cinta-eje">${marcas.join('')}</div><div class="mk-cinta-dias">${dias_.join('')}</div>
    ${l.map((e) => { const s = 14 + Math.sqrt(Number(e.personas || 0) / maxP) * 30, arriba = (alterna++ % 2) === 0;
      return `<a class="mk-ev ${arriba ? 'arr' : 'aba'}" href="${ir(`${chb}-eventos?e=${e.id}`)}" style="left:${pos(e.fecha)}%;--s:${s.toFixed(0)}px;--e:${EST[e.estado] || '#999'}">
        <i></i><span><b>${esc(e.tipo)}</b>${esc(new Date(e.fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' }))} · ${e.personas || '?'} pers<br><em>${e.monto ? corto(e.monto) : 'sin cotizar'}</em></span></a>`; }).join('')}
  </div></div>
  <div class="mk-cinta-ley">${Object.entries(EST).filter(([k]) => k !== 'realizado').map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join('')}<span class="mk-eti">el tamaño es el número de invitados</span></div>`;
}

// ---------- estilos ----------
function estilos() {
  if (document.getElementById('mk-estilos')) return;
  const s = document.createElement('style'); s.id = 'mk-estilos';
  s.textContent = `
  .mk-eti { font:500 10.5px/1.3 var(--f-mono, monospace); letter-spacing:.12em; text-transform:uppercase; color:var(--text-3); margin:0; }
  .mk-card { background:var(--vidrio, var(--surface)); border:1px solid var(--border); border-radius:20px; box-shadow:var(--linea-luz, none); padding:18px 20px; min-width:0; position:relative; overflow:hidden; }
  .mk-cab { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:12px; } .mk-cab h3 { font-size:15px; font-weight:600; }
  .mk-vacio { color:var(--text-3); margin:8px 0; }
  .mk-nota { font-size:12px; color:var(--text-3); margin:4px 0 0; }

  .mk-hero { display:grid; grid-template-columns:minmax(0,5fr) minmax(0,7fr); gap:18px; }
  .mk-hoy { padding:22px 24px; border-radius:22px; border:1px solid var(--border); position:relative; overflow:hidden;
    background:radial-gradient(500px 240px at 0% 0%, color-mix(in srgb, var(--primary) 30%, transparent), transparent 70%), var(--vidrio, var(--surface)); box-shadow:var(--linea-luz, none); display:flex; flex-direction:column; gap:12px; }
  .mk-total { margin:6px 0 0; display:grid; gap:2px; font:700 clamp(44px,5.4vw,68px)/1 var(--f-display); letter-spacing:-.05em; font-variant-numeric:tabular-nums; }
  .mk-total small { font:500 13px/1.3 var(--f-texto); letter-spacing:0; color:var(--text-2); }
  .mk-delta { margin:0; font:700 14px var(--f-display); } .mk-delta span { font:400 12.5px var(--f-texto); color:var(--text-3); margin-left:4px; }
  .mk-delta { color:var(--text-2); } .mk-delta.sube { color:var(--t-verde, #3DDC97); } .mk-delta.baja { color:var(--t-rojo, #FF8A7E); }
  .mk-mezcla { display:flex; height:10px; border-radius:6px; overflow:hidden; gap:3px; margin-top:auto; } .mk-mezcla i { display:block; border-radius:3px; box-shadow:0 0 16px -2px currentColor; }
  .mk-leyenda { display:flex; flex-wrap:wrap; gap:6px 16px; font-size:12.5px; color:var(--text-2); } .mk-leyenda i { display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:6px; } .mk-leyenda b { color:var(--text); margin-left:4px; font-family:var(--f-display); }
  .mk-pulso { padding:18px 20px 12px; border-radius:22px; border:1px solid var(--border); background:var(--vidrio, var(--surface)); box-shadow:var(--linea-luz, none); min-width:0; }
  .mk-pulso-svg { width:100%; height:auto; display:block; overflow:visible; }
  .mk-eje { font:500 9.5px var(--f-mono, monospace); fill:var(--text-3); letter-spacing:.06em; }
  .mk-reja { stroke:rgb(var(--k, 255 255 255) / .05); }
  .mk-ahora { stroke:rgb(var(--k, 255 255 255) / .35); stroke-dasharray:2 4; } .mk-ahora-p { fill:var(--tinta-svg, #fff); } .mk-ahora-o { fill:none; stroke:var(--tinta-svg, #fff); animation:mk-onda 2s infinite; transform-box:fill-box; transform-origin:center; }
  .mk-ahora-t { fill:var(--text-2); }
  @keyframes mk-onda { from { transform:scale(1); opacity:.8; } to { transform:scale(3.4); opacity:0; } }

  .mk-fila { display:grid; grid-template-columns:minmax(0,7fr) minmax(0,5fr); gap:18px; }
  .mk-radar svg { width:100%; height:auto; display:block; }
  .mk-radar-c { background:radial-gradient(420px 300px at 45% 45%, color-mix(in srgb, var(--primary) 9%, transparent), transparent 70%), var(--radar, #0B0C10); }
  .mk-anillo { fill:none; stroke:rgb(var(--k, 255 255 255) / .07); stroke-dasharray:2 5; }
  .mk-rio { fill:none; stroke:var(--rio); stroke-width:3; stroke-linecap:round; }
  .mk-cerro { fill:none; stroke:rgb(var(--k, 255 255 255) / .18); stroke-width:1.4; stroke-linejoin:round; }
  .mk-giro { animation:mk-gira 6s linear infinite; } @keyframes mk-gira { to { transform:rotate(360deg); } }
  .mk-suc-t { font:600 10.5px var(--f-texto); fill:var(--text-2); paint-order:stroke; stroke:var(--radar, #0B0C10); stroke-width:3px; }
  .mk-ping { fill:none; stroke-width:1.5; animation:mk-onda 1.8s infinite; transform-box:fill-box; transform-origin:center; }
  .mk-ruta { fill:none; stroke-width:1.6; stroke-dasharray:4 5; opacity:.75; animation:mk-flujo 1s linear infinite; } @keyframes mk-flujo { to { stroke-dashoffset:-18; } }
  .mk-dest { fill:var(--radar, #0B0C10); stroke-width:2; } .mk-moto { fill:var(--tinta-svg, #fff); filter:drop-shadow(0 0 6px var(--tinta-svg, #fff)); }
  .mk-dest-t { font:500 9.5px var(--f-mono, monospace); fill:var(--tinta-svg, #fff); paint-order:stroke; stroke:var(--radar, #0B0C10); stroke-width:3px; }
  .mk-nuevo { fill:none; stroke-width:1.5; animation:mk-onda 1.4s infinite; transform-box:fill-box; transform-origin:center; }
  .mk-radar-ley { display:flex; flex-wrap:wrap; gap:6px 16px; font-size:12px; color:var(--text-3); margin-top:8px; } .mk-radar-ley i { display:inline-block; width:9px; height:9px; margin-right:6px; vertical-align:-1px; }
  .mk-radar-ley i.r { transform:rotate(45deg); border-radius:2px; } .mk-radar-ley i.m { border-radius:50%; background:var(--tinta-svg, #fff); } .mk-radar-ley i.n { border-radius:50%; border:1.5px solid; } .mk-radar-ley i.c { border-radius:50%; }

  .mk-at-lista { display:grid; gap:8px; }
  .mk-a { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:12px; padding:12px 14px; border-radius:14px; text-decoration:none; color:var(--text);
    background:rgb(var(--k, 255 255 255) / .03); border:1px solid rgb(var(--k, 255 255 255) / .06); position:relative; overflow:hidden; animation:mk-sube .45s both; animation-delay:var(--d); transition:background .15s, transform .15s; }
  .mk-a::before { content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--c); }
  .mk-a:hover { background:rgb(var(--k, 255 255 255) / .06); transform:translateX(2px); }
  .mk-a.ambar { background:linear-gradient(90deg, rgba(255,181,71,.1), rgb(var(--k, 255 255 255) / .02)); } .mk-a.ambar::before { background:#FFB547; box-shadow:0 0 12px #FFB547; }
  .mk-a.rojo { background:linear-gradient(90deg, rgba(255,90,78,.14), rgb(var(--k, 255 255 255) / .02)); } .mk-a.rojo::before { background:#FF5A4E; box-shadow:0 0 12px #FF5A4E; }
  .mk-a-ico .neg-ico { width:30px; height:30px; border-radius:9px; font-size:11px; }
  .mk-a-tx { display:grid; gap:2px; min-width:0; } .mk-a-tx b { font-size:14px; font-weight:600; } .mk-a-tx small { color:var(--text-3); font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .mk-a-cta { font:600 12.5px var(--f-texto); color:color-mix(in srgb, var(--c) 72%, var(--text)); white-space:nowrap; }
  @keyframes mk-sube { from { opacity:0; transform:translateY(6px); } }

  .mk-mundos { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; }
  .mk-mundo { display:flex; flex-direction:column; gap:14px; padding:16px 18px; border-radius:20px; text-decoration:none; color:var(--text); border:1px solid var(--border); position:relative; overflow:hidden;
    background:radial-gradient(260px 160px at 100% 0%, color-mix(in srgb, var(--c) 26%, transparent), transparent 70%), var(--vidrio, var(--surface)); box-shadow:var(--linea-luz, none); transition:transform .2s, border-color .2s; }
  .mk-mundo:hover { transform:translateY(-3px); border-color:color-mix(in srgb, var(--c) 55%, transparent); }
  .mk-m-top { display:flex; align-items:center; gap:10px; } .mk-m-top > span:nth-child(2) { flex:1; display:grid; } .mk-m-top b { font:700 17px/1.1 var(--f-display); letter-spacing:-.02em; } .mk-m-top small { font-size:12px; }
  .mk-m-top .neg-ico { width:36px; height:36px; border-radius:11px; font-size:13px; box-shadow:0 8px 20px -8px var(--c); }
  .mk-m-ir { color:var(--text-3); font-size:18px; transition:transform .2s; } .mk-mundo:hover .mk-m-ir { transform:translateX(3px); color:var(--text); }
  .mk-riel { display:grid; gap:7px; }
  .mk-carril { display:grid; grid-template-columns:58px 1fr 22px; align-items:center; gap:8px; font-size:12px; color:var(--text-3); }
  .mk-carril > div { display:flex; flex-wrap:wrap; gap:4px; min-height:14px; align-items:center; padding:4px 6px; border-radius:7px; background:rgb(var(--k, 255 255 255) / .035); }
  .mk-carril i { width:16px; height:8px; border-radius:3px; background:#3DDC97; box-shadow:0 0 8px -1px #3DDC97; } .mk-carril i.ambar { background:#FFB547; box-shadow:0 0 8px -1px #FFB547; } .mk-carril i.rojo { background:#FF5A4E; box-shadow:0 0 8px -1px #FF5A4E; animation:mk-parpadea 1.4s infinite; }
  .mk-carril em { font-style:normal; color:var(--text-3); font-size:11px; } .mk-carril b { color:var(--text); font-family:var(--f-display); text-align:right; }
  @keyframes mk-parpadea { 50% { opacity:.45; } }
  .mk-mini { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-top:auto; }
  .mk-mini span { display:grid; gap:2px; font-size:11px; color:var(--text-3); line-height:1.25; } .mk-mini b { font:700 17px/1.1 var(--f-display); color:var(--text); letter-spacing:-.02em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .mk-chispa { width:100%; height:70px; display:block; }
  .mk-chispa-l { margin:-6px 0 0; font-size:11px; color:var(--text-3); display:flex; align-items:center; gap:5px; } .mk-chispa-l i { width:10px; height:3px; border-radius:2px; display:inline-block; } .mk-chispa-l i.pr { background:none; border-top:1.5px dashed rgb(var(--k, 255 255 255) / .4); height:0; margin-left:8px; }
  .mk-pasos { list-style:none; margin:0; padding:0; display:grid; gap:8px; }
  .mk-pasos li { display:flex; gap:10px; align-items:flex-start; font-size:13px; color:var(--text-2); line-height:1.35; }
  .mk-pasos i { flex:none; width:20px; height:20px; border-radius:50%; display:grid; place-items:center; font:700 10.5px var(--f-display); font-style:normal; border:1px solid rgb(var(--k, 255 255 255) / .18); color:var(--text-3); }
  .mk-pasos li.ya i { border-color:var(--c); color:#fff; background:color-mix(in srgb, var(--c) 40%, transparent); box-shadow:0 0 12px -2px var(--c); } .mk-pasos li.ok i { background:#3DDC97; border-color:#3DDC97; color:#08130D; }
  .mk-m-nota { margin:auto 0 0; font-size:12px; color:var(--text-3); line-height:1.4; }

  .mk-cinta-scroll { overflow-x:auto; margin:0 -20px; padding:0 20px; scrollbar-width:thin; }
  .mk-cinta { position:relative; height:218px; min-width:820px; margin:0 40px 0 10px; }
  .mk-cinta-eje { position:absolute; left:0; right:0; top:50%; height:1px; background:linear-gradient(90deg, var(--primary), rgb(var(--k, 255 255 255) / .12) 18%, rgb(var(--k, 255 255 255) / .12)); }
  .mk-cinta-eje span { position:absolute; top:-3px; width:1px; height:7px; background:rgb(var(--k, 255 255 255) / .2); font:500 9.5px var(--f-mono, monospace); color:var(--text-3); }
  .mk-cinta-eje span.fin { background:rgb(var(--k, 255 255 255) / .4); } .mk-cinta-eje span.hoy { background:var(--primary); height:11px; top:-5px; color:var(--primary); }
  .mk-cinta-dias { position:absolute; left:0; right:0; bottom:0; height:14px; } .mk-cinta-dias span { position:absolute; transform:translateX(-50%); font:500 9.5px var(--f-mono, monospace); color:var(--text-3); white-space:nowrap; text-transform:uppercase; letter-spacing:.06em; }
  .mk-cinta-dias span:first-child { color:var(--primary); transform:none; }
  .mk-ev { position:absolute; top:50%; transform:translate(-50%,-50%); text-decoration:none; color:var(--text); z-index:1; }
  .mk-ev i { display:block; width:var(--s); height:var(--s); border-radius:50%; background:radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--e) 60%, white), var(--e)); box-shadow:0 0 0 3px var(--halo, #0E1014), 0 0 22px -2px var(--e); transition:transform .2s; }
  .mk-ev:hover i { transform:scale(1.15); } .mk-ev:hover { z-index:3; }
  .mk-ev span { position:absolute; left:50%; transform:translateX(-50%); width:120px; text-align:center; font-size:11px; line-height:1.3; color:var(--text-3); }
  .mk-ev span b { display:block; color:var(--text); font-size:12px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .mk-ev span em { font-style:normal; font:700 12px var(--f-display); color:color-mix(in srgb, var(--e) 75%, var(--text)); }
  .mk-ev.arr span { bottom:calc(100% + 8px); } .mk-ev.aba span { top:calc(100% + 8px); }
  .mk-cinta-ley { display:flex; flex-wrap:wrap; align-items:center; gap:6px 16px; font-size:12px; color:var(--text-3); text-transform:capitalize; } .mk-cinta-ley i { display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:6px; }
  .mk-cinta-ley .mk-eti { margin-left:auto; text-transform:uppercase; }

  @media (max-width:1180px) { .mk-mundos { grid-template-columns:repeat(2,minmax(0,1fr)); } .mk-hero, .mk-fila { grid-template-columns:minmax(0,1fr); } }
  @media (max-width:760px) {
    .mk-mundos { grid-template-columns:minmax(0,1fr); } .mk-hoy { padding:18px; } .mk-card, .mk-pulso { padding:14px; border-radius:18px; }
    .mk-cinta-scroll { margin:0 -14px; padding:0 14px; } .mk-a-cta { display:none; } .mk-a { grid-template-columns:auto 1fr; }
    .mk-suc-t { font-size:13px; } .mk-dest-t { font-size:12px; }
  }`;
  document.head.appendChild(s);
}
