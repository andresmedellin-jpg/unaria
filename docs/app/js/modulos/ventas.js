// Ventas (Loyverse): lo que se vende en el punto de venta del cliente, sincronizado a su base cada 10 minutos
// y al instante cuando Loyverse avisa (función supabase/functions/loyverse; tablas y vistas en 0032_loyverse.sql).
// Periodo y sucursal arriba; venta neta, tickets, ticket promedio y clientes contra el periodo anterior;
// venta por día, por sucursal, por forma de pago y por hora; productos, categorías, clientes, inventario y tickets.
import { db, sb, esc, toast, abrirModal, cerrarModal, fmt, hoyISO, tieneRol } from '../lib.js';
import { MARCA } from '../config.js';

const st = { periodo: 'd30', tienda: '', vistaProd: 'venta' };
let raiz, mod = null, cuenta = null, tiendas = [], articulos = [], categorias = [];
// Con varios negocios (MARCA.negocios), cada uno tiene su propia cuenta de Loyverse: todo se filtra por cuenta_id
const porCuenta = (q) => (cuenta ? q.eq('cuenta_id', cuenta.id) : q);

const PERIODOS = { hoy: 'Hoy', d7: '7 días', d30: '30 días', mes: 'Este mes', mesant: 'Mes pasado', d90: '3 meses', anio: 'Este año' };
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const sumar = (f, k) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + k); return iso(d); };
const dias = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5) + 1;
const dinero = (n) => fmt(n).replace(/\.\d\d$/, '');
const pct = (a, b) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : null);
const flecha = (p) => p == null ? '<small>sin comparación</small>' : `<small class="${p >= 0 ? 'vt-sube' : 'vt-baja'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}% vs anterior</small>`;

function rango() {
  const hoy = hoyISO(), d = new Date(hoy + 'T12:00:00');
  let a, b = hoy;
  if (st.periodo === 'hoy') a = hoy;
  else if (st.periodo === 'mes') a = hoy.slice(0, 8) + '01';
  else if (st.periodo === 'mesant') { const x = new Date(d.getFullYear(), d.getMonth() - 1, 1, 12); a = iso(x); b = iso(new Date(d.getFullYear(), d.getMonth(), 0, 12)); }
  else if (st.periodo === 'anio') a = hoy.slice(0, 4) + '-01-01';
  else a = sumar(hoy, -Number(st.periodo.slice(1)) + 1);
  const n = dias(a, b);
  return { a, b, pa: sumar(a, -n), pb: sumar(a, -1), n };
}

export async function render(view, m) {
  raiz = view; mod = m || mod; estilos();
  const empresa = mod?.negocio?.empresa_id || null;
  let qc = db().from('lv_cuentas').select('*');
  qc = empresa ? qc.eq('empresa_id', empresa) : qc.limit(1);
  const c = await qc.maybeSingle();
  cuenta = c.data;
  if (!cuenta) { tiendas = []; acciones(); return sinConexion(); }
  const [t, ar, ca] = await Promise.all([
    porCuenta(db().from('lv_tiendas').select('id, nombre, direccion')),
    porCuenta(db().from('lv_articulos').select('id, nombre, categoria_id, controla_inventario, borrado')),
    porCuenta(db().from('lv_categorias').select('id, nombre, color')),
  ]);
  tiendas = t.data || []; articulos = ar.data || []; categorias = ca.data || [];
  acciones();
  await pintar();
}

function acciones() {
  const pa = document.getElementById('page-actions');
  if (!cuenta) { pa.innerHTML = ''; return; }
  const cuando = cuenta.ultimo_sync ? hace(cuenta.ultimo_sync) : 'todavía no';
  const est = cuenta.estado === 'importando' ? `<span class="vt-estado imp">Trayendo historial…</span>` : cuenta.ultimo_error ? `<span class="vt-estado err" title="${esc(cuenta.ultimo_error)}">Error al sincronizar</span>`
    : `<span class="vt-estado ok">Loyverse al día · ${esc(cuando)}</span>`;
  pa.innerHTML = `${est}${tieneRol(['administracion']) ? '<button class="btn btn-ghost" id="vt-sync">Sincronizar</button>' : ''}`;
  pa.querySelector('#vt-sync')?.addEventListener('click', sincronizar);
}
const hace = (x) => { const m = Math.round((Date.now() - new Date(x)) / 6e4); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`; };

async function sincronizar() {
  const b = document.getElementById('vt-sync'); if (b) { b.disabled = true; b.textContent = 'Sincronizando…'; }
  const { data, error } = await sb.functions.invoke('loyverse', { body: { accion: 'sincronizar', cuenta_id: cuenta?.id } });
  if (error || data?.error) toast('No se pudo sincronizar: ' + (data?.error || error.message), true);
  else toast(data?.tickets ? `Listo: ${data.tickets} tickets nuevos o cambiados ✓` : 'Todo al día ✓');
  await render(raiz);
}

function sinConexion() {
  raiz.innerHTML = `<div class="vt-conectar">
    <h2>Conecta Loyverse${mod?.negocio ? ' de ' + esc(mod.negocio.nombre) : ''}</h2>
    ${mod?.negocio?.notaLoyverse ? `<p class="vt-aviso">${esc(mod.negocio.notaLoyverse)}</p>` : ''}
    <p>Las ventas, productos, clientes e inventario de tu punto de venta se copian aquí y se actualizan solas cada 10 minutos. Loyverse sigue funcionando igual.</p>
    <ol><li>Entra a <b>loyverse.com</b> → Back Office → <b>Integraciones → Tokens de acceso</b>.</li><li>Dale a <b>+ Agregar token</b>, ponle "Unaria" y sin fecha de vencimiento.</li><li>Copia el token y pégalo aquí.</li></ol>
    ${tieneRol(['administracion']) ? `<form class="form" id="vt-f"><label>Token de acceso<input type="password" id="vt-token" autocomplete="off" required></label>
      <label>Traer historial desde <small>vacío = desde que abrieron la cuenta</small><input type="date" id="vt-desde"></label>
      <button class="btn btn-primary" type="submit">Conectar</button></form>` : '<p class="nota">Pídele a administración que lo conecte.</p>'}
  </div>`;
  raiz.querySelector('#vt-f')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Conectando…';
    const { data, error } = await sb.functions.invoke('loyverse', { body: { accion: 'conectar', empresa_id: mod?.negocio?.empresa_id || null, token: raiz.querySelector('#vt-token').value.trim(), historial_desde: raiz.querySelector('#vt-desde').value || null } });
    if (error || data?.error) { btn.disabled = false; btn.textContent = 'Conectar'; return toast(data?.error || error.message, true); }
    toast(`Conectado a ${data.negocio}. Estamos trayendo el historial ✓`);
    render(raiz);
  });
}

async function pintar() {
  const r = rango();
  raiz.innerHTML = '<div class="cargando">Cargando…</div>';
  const filtroT = (q) => porCuenta(st.tienda ? q.eq('tienda_id', st.tienda) : q);
  const [vd, vdp, pr, pg, hr, tk, cl] = await Promise.all([
    filtroT(db().from('v_lv_ventas_dia').select('*').gte('dia', r.a).lte('dia', r.b)),
    filtroT(db().from('v_lv_ventas_dia').select('*').gte('dia', r.pa).lte('dia', r.pb)),
    filtroT(db().from('v_lv_productos_dia').select('*').gte('dia', r.a).lte('dia', r.b)),
    filtroT(db().from('v_lv_pagos_dia').select('*').gte('dia', r.a).lte('dia', r.b)),
    filtroT(db().from('v_lv_horas').select('*').gte('dia', r.a).lte('dia', r.b)),
    filtroT(db().from('lv_tickets').select('numero, tipo, fecha, tienda_id, cliente_id, empleado_id, total, cancelado_en, opcion_consumo').gte('dia', r.a).lte('dia', r.b)).order('fecha', { ascending: false }).limit(40),
    porCuenta(db().from('lv_clientes').select('id, nombre, telefono, visitas, total_gastado, ultima_visita, puntos')).order('total_gastado', { ascending: false }).limit(8),
  ]);
  const err = [vd, pr, pg, hr].find((x) => x.error);
  if (err) { raiz.innerHTML = `<div class="vacio">No se pudieron cargar las ventas: ${esc(err.error.message)}</div>`; return; }
  const V = vd.data || [], VP = vdp.data || [];
  const venta = V.reduce((s, x) => s + Number(x.venta || 0), 0), ventaP = VP.reduce((s, x) => s + Number(x.venta || 0), 0);
  const tickets = V.reduce((s, x) => s + Number(x.tickets || 0), 0), ticketsP = VP.reduce((s, x) => s + Number(x.tickets || 0), 0);
  const prom = tickets ? venta / tickets : 0, promP = ticketsP ? ventaP / ticketsP : 0;
  const propinas = V.reduce((s, x) => s + Number(x.propinas || 0), 0);
  const conCliente = (tk.data || []).filter((t) => t.cliente_id).length;

  raiz.innerHTML = `
    <div class="vt-barra">
      <div class="vt-seg">${Object.entries(PERIODOS).map(([k, t]) => `<button data-p="${k}" class="${st.periodo === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      ${tiendas.length > 1 ? `<select id="vt-tienda"><option value="">Todas las sucursales</option>${tiendas.map((t) => `<option value="${esc(t.id)}"${t.id === st.tienda ? ' selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select>` : ''}
    </div>
    <p class="vt-rango">${esc(fechaC(r.a))}${r.a !== r.b ? ' – ' + esc(fechaC(r.b)) : ''} · comparado con ${esc(fechaC(r.pa))}${r.pa !== r.pb ? ' – ' + esc(fechaC(r.pb)) : ''}</p>
    <div class="vt-kpis">
      <div class="vt-kpi"><span>Venta neta</span><b>${dinero(venta)}</b>${flecha(pct(venta, ventaP))}</div>
      <div class="vt-kpi"><span>Tickets</span><b>${tickets.toLocaleString('es-MX')}</b>${flecha(pct(tickets, ticketsP))}</div>
      <div class="vt-kpi"><span>Ticket promedio</span><b>${dinero(prom)}</b>${flecha(pct(prom, promP))}</div>
      <div class="vt-kpi"><span>Propinas</span><b>${dinero(propinas)}</b><small>${tickets ? Math.round((conCliente / Math.min(40, tickets)) * 100) : 0}% de los últimos tickets con cliente registrado</small></div>
    </div>
    <div class="vt-panel"><h3>Venta por día</h3>${graficaDias(V, r)}</div>
    <div class="vt-grid">
      <div class="vt-panel"><h3>Productos <span class="vt-mini">${[['venta', 'por venta'], ['cantidad', 'por piezas'], ['margen', 'por margen']].map(([k, t]) => `<button data-o="${k}" class="${st.vistaProd === k ? 'on' : ''}">${t}</button>`).join('')}</span></h3>${productos(pr.data || [])}</div>
      <div class="vt-col">
        <div class="vt-panel"><h3>Formas de pago</h3>${barras(agrupar(pg.data || [], 'forma', 'monto'), venta)}</div>
        ${tiendas.length > 1 && !st.tienda ? `<div class="vt-panel"><h3>Por sucursal</h3>${barras(agrupar(V, 'tienda_id', 'venta').map((x) => ({ ...x, k: tiendas.find((t) => t.id === x.k)?.nombre || 'Sin sucursal' })), venta)}</div>` : ''}
        <div class="vt-panel"><h3>Por categoría</h3>${barras(porCategoria(pr.data || []), venta)}</div>
      </div>
    </div>
    <div class="vt-panel"><h3>¿A qué hora se vende? <small>promedio por día, ${esc(PERIODOS[st.periodo].toLowerCase())}</small></h3>${horas(hr.data || [], r)}</div>
    <div class="vt-grid">
      <div class="vt-panel"><h3>Últimos tickets</h3>${listaTickets(tk.data || [])}</div>
      <div class="vt-col">
        <div class="vt-panel"><h3>Mejores clientes <small>de siempre</small></h3>${clientes(cl.data || [])}</div>
        <div class="vt-panel" id="vt-inv"><h3>Inventario por acabarse</h3><div class="cargando">…</div></div>
      </div>
    </div>
    <p class="vt-nota">Venta neta = ventas menos devoluciones, con impuestos y sin propina. Datos de Loyverse${cuenta.negocio ? ' (' + esc(cuenta.negocio) + ')' : ''}.${MARCA.demo ? ' En el demo, todos los números son de ejemplo.' : ''}</p>`;

  raiz.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { st.periodo = b.dataset.p; pintar(); }));
  raiz.querySelector('#vt-tienda')?.addEventListener('change', (e) => { st.tienda = e.target.value; pintar(); });
  raiz.querySelectorAll('[data-o]').forEach((b) => b.addEventListener('click', () => { st.vistaProd = b.dataset.o; pintar(); }));
  raiz.querySelectorAll('[data-tk]').forEach((b) => b.addEventListener('click', () => verTicket(b.dataset.tk)));
  inventario();
}

const fechaC = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
function agrupar(l, k, v) {
  const m = new Map(); l.forEach((x) => m.set(x[k], (m.get(x[k]) || 0) + Number(x[v] || 0)));
  return [...m.entries()].map(([k2, v2]) => ({ k: k2, v: v2 })).sort((a, b) => b.v - a.v);
}
function barras(l, total) {
  if (!l.length) return '<p class="vt-vacio">Sin datos en este periodo.</p>';
  const max = Math.max(...l.map((x) => x.v), 1);
  return `<div class="vt-barras">${l.slice(0, 8).map((x) => `<div class="vt-b"><span class="n">${esc(x.k || 'Otro')}</span><span class="p"><i style="width:${Math.max(2, (x.v / max) * 100)}%"></i></span><span class="v">${dinero(x.v)}<small>${total ? Math.round((x.v / total) * 100) : 0}%</small></span></div>`).join('')}</div>`;
}
function porCategoria(pr) {
  const cat = new Map(articulos.map((a) => [a.id, a.categoria_id]));
  const nom = new Map(categorias.map((c) => [c.id, c.nombre]));
  return agrupar(pr.map((p) => ({ k: nom.get(cat.get(p.articulo_id)) || 'Sin categoría', v: p.venta })), 'k', 'v');
}
function productos(pr) {
  const m = new Map();
  pr.forEach((p) => { const k = p.articulo_id || p.nombre; const x = m.get(k) || { nombre: p.nombre, cantidad: 0, venta: 0, costo: 0 };
    x.cantidad += Number(p.cantidad || 0); x.venta += Number(p.venta || 0); x.costo += Number(p.costo || 0); m.set(k, x); });
  let l = [...m.values()].map((x) => ({ ...x, margen: x.costo ? x.venta - x.costo : null }));
  l.sort((a, b) => (st.vistaProd === 'margen' ? (b.margen ?? -1e12) - (a.margen ?? -1e12) : b[st.vistaProd] - a[st.vistaProd]));
  if (!l.length) return '<p class="vt-vacio">Sin ventas en este periodo.</p>';
  const tieneCosto = l.some((x) => x.costo);
  return `<div class="tabla-wrap"><table class="tabla vt-tabla"><thead><tr><th>Producto</th><th class="num">Piezas</th><th class="num">Venta</th>${tieneCosto ? '<th class="num">Margen</th>' : ''}</tr></thead><tbody>
    ${l.slice(0, 12).map((x) => `<tr><td>${esc(x.nombre)}</td><td class="num">${Math.round(x.cantidad).toLocaleString('es-MX')}</td><td class="num">${dinero(x.venta)}</td>${tieneCosto ? `<td class="num">${x.margen == null ? '—' : `${dinero(x.margen)} <small>${x.venta ? Math.round((x.margen / x.venta) * 100) : 0}%</small>`}</td>` : ''}</tr>`).join('')}
  </tbody></table></div>${tieneCosto ? '' : '<p class="vt-nota">Para ver el margen, captura el costo de cada artículo en Loyverse.</p>'}`;
}

function graficaDias(V, r) {
  const por = new Map(); V.forEach((x) => por.set(x.dia, (por.get(x.dia) || 0) + Number(x.venta || 0)));
  const ds = []; for (let k = 0; k < r.n; k++) ds.push(sumar(r.a, k));
  if (r.n === 1) return `<p class="vt-vacio">Venta de hoy: <b>${dinero(por.get(r.a) || 0)}</b>. Para ver la gráfica, escoge un periodo más largo.</p>`;
  const max = Math.max(...ds.map((d) => por.get(d) || 0), 1), W = 1000, H = 200, bw = W / ds.length;
  const prom = ds.reduce((s, d) => s + (por.get(d) || 0), 0) / ds.length;
  if (document.body.classList.contains('tema-mando')) return curvaDias(ds, por, max, prom);
  const marcas = ds.map((d, i) => ({ d, i })).filter(({ d, i }) => ds.length <= 14 || new Date(d + 'T12:00:00').getDate() === 1 || i % Math.ceil(ds.length / 8) === 0);
  return `<div class="vt-graf"><svg viewBox="0 0 ${W} ${H + 24}" preserveAspectRatio="none" role="img" aria-label="Venta por día">
    ${ds.map((d, i) => { const v = por.get(d) || 0, h = (v / max) * H, dom = new Date(d + 'T12:00:00').getDay() === 0;
      return `<rect x="${i * bw + bw * 0.12}" y="${H - h}" width="${bw * 0.76}" height="${Math.max(h, v ? 1.5 : 0)}" rx="2" fill="${dom ? 'var(--text-3)' : 'var(--primary)'}" opacity="${dom ? .5 : .88}"><title>${fechaC(d)}: ${dinero(v)}</title></rect>`; }).join('')}
    <line x1="0" x2="${W}" y1="${H - (prom / max) * H}" y2="${H - (prom / max) * H}" stroke="var(--text-2)" stroke-dasharray="6 6" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
  </svg><div class="vt-ejes">${marcas.map(({ d, i }) => `<span style="left:${((i + 0.5) / ds.length) * 100}%">${fechaC(d)}</span>`).join('')}</div>
  <p class="vt-leyenda"><i></i> venta del día · <b>- - -</b> promedio ${dinero(prom)} por día</p></div>`;
}

// Tema Mando: la venta por día como curva luminosa (en lugar de barras), con el promedio y el mejor día marcados
function curvaDias(ds, por, max, prom) {
  const W = 1000, H = 210, n = ds.length, X = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * W), Y = (v) => H - (v / (max * 1.1)) * H;
  const P = ds.map((d, i) => [X(i), Y(por.get(d) || 0)]);
  let d = `M${P[0][0]} ${P[0][1]}`;
  for (let i = 1; i < P.length; i++) { const [x0, y0] = P[i - 1], [x1, y1] = P[i], c = (x1 - x0) / 2; d += ` C${x0 + c} ${y0} ${x1 - c} ${y1} ${x1} ${y1}`; }
  const mejor = ds.reduce((b, x, i) => ((por.get(x) || 0) > (por.get(ds[b]) || 0) ? i : b), 0);
  const marcas = ds.map((x, i) => ({ x, i })).filter(({ x, i }) => n <= 14 || new Date(x + 'T12:00:00').getDate() === 1 || i % Math.ceil(n / 8) === 0);
  return `<div class="vt-graf"><svg viewBox="0 -14 ${W} ${H + 24}" preserveAspectRatio="none" role="img" aria-label="Venta por día" style="overflow:visible">
    <defs><linearGradient id="vt-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--primary)" stop-opacity=".5"/><stop offset="1" stop-color="var(--primary)" stop-opacity="0"/></linearGradient></defs>
    <path d="${d} L${W} ${H} L0 ${H} Z" fill="url(#vt-area)"/>
    <line x1="0" x2="${W}" y1="${Y(prom)}" y2="${Y(prom)}" stroke="rgb(var(--k, 0 0 0) / .35)" stroke-dasharray="4 6" vector-effect="non-scaling-stroke"/>
    <path d="${d}" fill="none" stroke="color-mix(in srgb, var(--primary) 80%, var(--text))" stroke-width="2.5" vector-effect="non-scaling-stroke" style="filter:drop-shadow(0 0 8px var(--primary))"/>
    ${P.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="9" fill="transparent"><title>${fechaC(ds[i])}: ${dinero(por.get(ds[i]) || 0)}</title></circle>`).join('')}
  </svg><span class="vt-mejor" style="left:${(X(mejor) / W) * 100}%;top:${((P[mejor][1] + 14) / (H + 24) * 200).toFixed(1)}px"><i></i>${fechaC(ds[mejor])} · ${dinero(por.get(ds[mejor]) || 0)}</span>
  <div class="vt-ejes">${marcas.map(({ x, i }) => `<span style="left:${(X(i) / W) * 100}%">${fechaC(x)}</span>`).join('')}</div>
  <p class="vt-leyenda"><i></i> venta del día · <b>- - -</b> promedio ${dinero(prom)} por día · el punto es el mejor día</p></div>`;
}

function horas(H, r) {
  if (!H.length) return '<p class="vt-vacio">Sin datos.</p>';
  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const hs = [...new Set(H.map((x) => x.hora))].sort((a, b) => a - b);
  const desde = Math.min(...hs), hasta = Math.max(...hs);
  const cuantos = {}; for (let k = 0; k < r.n; k++) { const dw = ((new Date(sumar(r.a, k) + 'T12:00:00').getDay() + 6) % 7) + 1; cuantos[dw] = (cuantos[dw] || 0) + 1; }
  const m = {}; H.forEach((x) => { const k = x.dow + '-' + x.hora; m[k] = (m[k] || 0) + Number(x.venta || 0); });
  Object.keys(m).forEach((k) => { m[k] /= cuantos[k.split('-')[0]] || 1; });
  const max = Math.max(...Object.values(m), 1);
  let html = `<div class="vt-calor" style="grid-template-columns:44px repeat(${hasta - desde + 1},minmax(0,1fr))"><span></span>`;
  for (let h = desde; h <= hasta; h++) html += `<span class="hh">${h}</span>`;
  for (let d = 1; d <= 7; d++) {
    html += `<span class="dd">${DIAS[d - 1]}</span>`;
    for (let h = desde; h <= hasta; h++) { const v = m[d + '-' + h] || 0; html += `<i style="background:${v ? `color-mix(in srgb, var(--primary) ${Math.round(12 + (v / max) * 88)}%, var(--hm-base, white))` : 'var(--surface-2)'}" title="${DIAS[d - 1]} ${h}:00 · ${dinero(v)} en promedio"></i>`; }
  }
  return html + '</div><p class="vt-leyenda">Más oscuro = más venta. Sirve para acomodar turnos y saber cuándo conviene una promoción.</p>';
}

function listaTickets(l) {
  if (!l.length) return '<p class="vt-vacio">Sin tickets.</p>';
  return `<div class="vt-tks">${l.slice(0, 12).map((t) => `<button class="vt-tk" data-tk="${esc(t.numero)}"><span><b>#${esc(t.numero)}</b> <small>${esc(new Date(t.fecha).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))}</small></span>
    <span>${t.cancelado_en ? '<small class="vt-baja">Cancelado</small> ' : t.tipo === 'REFUND' ? '<small class="vt-baja">Devolución</small> ' : ''}<b>${dinero(t.tipo === 'REFUND' ? -t.total : t.total)}</b></span></button>`).join('')}</div>`;
}
async function verTicket(numero) {
  const [t, l, p] = await Promise.all([
    porCuenta(db().from('lv_tickets').select('*').eq('numero', numero)).maybeSingle(),
    porCuenta(db().from('lv_lineas').select('*').eq('numero', numero)).order('n'),
    porCuenta(db().from('lv_pagos').select('*').eq('numero', numero)).order('n'),
  ]);
  const x = t.data; if (!x) return;
  const [cl, em] = await Promise.all([
    x.cliente_id ? porCuenta(db().from('lv_clientes').select('nombre, telefono, visitas').eq('id', x.cliente_id)).maybeSingle() : { data: null },
    x.empleado_id ? porCuenta(db().from('lv_empleados').select('nombre').eq('id', x.empleado_id)).maybeSingle() : { data: null },
  ]);
  abrirModal({
    titulo: `Ticket #${x.numero}`,
    cuerpo: `<p class="nota">${esc(new Date(x.fecha).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' }))} · ${esc(tiendas.find((s) => s.id === x.tienda_id)?.nombre || '')}${em.data ? ' · atendió ' + esc(em.data.nombre) : ''}${x.opcion_consumo ? ' · ' + esc(x.opcion_consumo) : ''}</p>
      ${cl.data ? `<p class="nota">Cliente: <b>${esc(cl.data.nombre || '')}</b>${cl.data.visitas ? ` · ${cl.data.visitas} visitas` : ''}</p>` : ''}
      <table class="tabla"><tbody>${(l.data || []).map((i) => `<tr><td>${esc(Number(i.cantidad))} × ${esc(i.nombre)}${i.variante ? ` <small>${esc(i.variante)}</small>` : ''}${(i.modificadores || []).length ? `<br><small>${esc(i.modificadores.map((m) => m.option || m.name).join(', '))}</small>` : ''}</td><td class="num">${dinero(i.total)}</td></tr>`).join('')}
        ${Number(x.descuento) ? `<tr><td>Descuento</td><td class="num">−${dinero(x.descuento)}</td></tr>` : ''}
        <tr><td><b>Total</b></td><td class="num"><b>${dinero(x.total)}</b></td></tr>
        ${Number(x.propina) ? `<tr><td>Propina</td><td class="num">${dinero(x.propina)}</td></tr>` : ''}
        ${(p.data || []).map((y) => `<tr><td><small>Pagó con ${esc(y.nombre || y.tipo)}</small></td><td class="num"><small>${dinero(y.monto)}</small></td></tr>`).join('')}</tbody></table>
      ${x.cancelado_en ? '<p class="nota vt-baja">Este ticket se canceló.</p>' : ''}`,
    pie: '<button class="btn btn-ghost" data-cerrar>Cerrar</button>',
  }).querySelector('[data-cerrar]')?.addEventListener('click', cerrarModal);
}

function clientes(l) {
  if (!l.length) return '<p class="vt-vacio">Cuando registren clientes en Loyverse, aquí aparecen.</p>';
  return `<div class="vt-cls">${l.map((c) => `<div class="vt-cl"><span><b>${esc(c.nombre || 'Sin nombre')}</b><small>${esc(c.visitas || 0)} visitas${c.ultima_visita ? ' · última ' + esc(hace(c.ultima_visita)) : ''}</small></span><b>${dinero(c.total_gastado)}</b></div>`).join('')}</div>`;
}

async function inventario() {
  const caja = raiz.querySelector('#vt-inv'); if (!caja) return;
  const conInv = new Set(articulos.filter((a) => a.controla_inventario && !a.borrado).map((a) => a.id));
  if (!conInv.size) { caja.innerHTML = '<h3>Inventario por acabarse</h3><p class="vt-vacio">Ningún artículo lleva inventario en Loyverse.</p>'; return; }
  const [iv, va] = await Promise.all([porCuenta(db().from('lv_inventario').select('*')).lte('existencia', 10), porCuenta(db().from('lv_variantes').select('id, articulo_id, nombre'))]);
  const vmap = new Map((va.data || []).map((v) => [v.id, v]));
  const l = (iv.data || []).filter((x) => conInv.has(vmap.get(x.variante_id)?.articulo_id) && (!st.tienda || x.tienda_id === st.tienda)).sort((a, b) => a.existencia - b.existencia).slice(0, 8);
  caja.innerHTML = `<h3>Inventario por acabarse</h3>${l.length ? `<div class="vt-cls">${l.map((x) => { const v = vmap.get(x.variante_id), a = articulos.find((y) => y.id === v?.articulo_id);
    return `<div class="vt-cl"><span><b>${esc(a?.nombre || '')}${v?.nombre ? ' · ' + esc(v.nombre) : ''}</b><small>${esc(tiendas.find((t) => t.id === x.tienda_id)?.nombre || '')}</small></span><b class="${x.existencia <= 3 ? 'vt-baja' : ''}">${esc(Number(x.existencia))}</b></div>`; }).join('')}</div>` : '<p class="vt-vacio">Nada por acabarse (10 o menos).</p>'}`;
}

function estilos() {
  if (document.getElementById('vt-estilos')) return;
  const s = document.createElement('style'); s.id = 'vt-estilos';
  s.textContent = `
  .vt-graf { position:relative; } .vt-mejor { position:absolute; transform:translate(-50%,calc(-100% - 12px)); font:600 11.5px var(--f-texto); white-space:nowrap; background:rgba(0,0,0,.55); color:#fff; border:1px solid rgba(255,255,255,.15); padding:3px 8px; border-radius:999px; pointer-events:none; }
  .vt-mejor i { position:absolute; left:50%; bottom:-16.5px; width:9px; height:9px; margin-left:-4.5px; border-radius:50%; background:#fff; box-shadow:0 0 10px var(--primary); }
  .vt-estado { font-size:12.5px; font-weight:600; border-radius:999px; padding:5px 11px; white-space:nowrap; }
  .vt-estado.ok { background:#ECFDF3; color:#067647; } .vt-estado.imp { background:#FEF0C7; color:#B54708; } .vt-estado.err { background:#FEE4E2; color:#B42318; }
  .vt-barra { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between; }
  .vt-seg { display:inline-flex; flex-wrap:wrap; background:var(--surface-2); border:1px solid var(--border); border-radius:9px; padding:3px; gap:2px; }
  .vt-seg button, .vt-mini button { font:inherit; font-size:13px; font-weight:600; border:0; background:transparent; color:var(--text-2); padding:6px 11px; border-radius:7px; cursor:pointer; }
  .vt-seg button.on { background:var(--surface); color:var(--text); box-shadow:0 1px 2px rgba(0,0,0,.08); }
  .vt-barra select { height:36px; border:1px solid var(--border); border-radius:8px; padding:0 10px; font:inherit; background:var(--surface); }
  .vt-rango { font-size:12.5px; color:var(--text-3); margin:8px 0 12px; }
  .vt-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-bottom:12px; }
  .vt-kpi { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:12px 14px; display:grid; gap:2px; }
  .vt-kpi span { font-size:12.5px; color:var(--text-2); } .vt-kpi b { font-size:24px; letter-spacing:-.01em; } .vt-kpi small { font-size:12px; }
  .vt-sube { color:#067647 !important; } .vt-baja { color:#B42318 !important; }
  .vt-panel { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:14px 16px; margin-bottom:12px; min-width:0; }
  .vt-panel h3 { font-size:14.5px; margin:0 0 10px; display:flex; gap:8px; align-items:center; justify-content:space-between; flex-wrap:wrap; } .vt-panel h3 small { font-size:12px; font-weight:400; }
  .vt-mini { display:inline-flex; gap:2px; } .vt-mini button { font-size:12px; padding:4px 8px; } .vt-mini button.on { background:var(--primary-soft); color:var(--primary); }
  .vt-grid { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(0,1fr); gap:12px; align-items:start; } .vt-grid .vt-panel { margin-bottom:0; } .vt-col { display:grid; gap:12px; }
  .vt-grid + .vt-panel, .vt-grid + .vt-grid { margin-top:12px; }
  .vt-graf { position:relative; } .vt-graf svg { width:100%; height:200px; display:block; }
  .vt-ejes { position:relative; height:18px; } .vt-ejes span { position:absolute; transform:translateX(-50%); font-size:11px; color:var(--text-3); white-space:nowrap; }
  .vt-leyenda { font-size:12px; color:var(--text-3); margin:6px 0 0; } .vt-leyenda i { display:inline-block; width:10px; height:10px; border-radius:2px; background:var(--primary); vertical-align:-1px; }
  .vt-barras { display:grid; gap:8px; }
  .vt-b { display:grid; grid-template-columns:minmax(80px,140px) minmax(0,1fr) auto; gap:10px; align-items:center; font-size:13px; }
  .vt-b .n { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .vt-b .p { height:10px; background:var(--surface-2); border-radius:5px; overflow:hidden; } .vt-b .p i { display:block; height:100%; background:var(--primary); border-radius:5px; }
  .vt-b .v { font-weight:700; white-space:nowrap; } .vt-b .v small { margin-left:6px; }
  .vt-tabla td, .vt-tabla th { font-size:13px; } .vt-tabla small { color:var(--text-3); }
  .vt-calor { display:grid; gap:3px; align-items:center; } .vt-calor i { display:block; height:22px; border-radius:4px; } .vt-calor .hh { font-size:10.5px; color:var(--text-3); text-align:center; } .vt-calor .dd { font-size:12px; color:var(--text-2); }
  .vt-tks, .vt-cls { display:grid; gap:4px; }
  .vt-tk, .vt-cl { display:flex; justify-content:space-between; gap:10px; align-items:center; text-align:left; font:inherit; font-size:13px; background:transparent; border:0; border-bottom:1px solid var(--border); padding:7px 2px; color:var(--text); }
  .vt-tk { cursor:pointer; } .vt-tk:hover { background:var(--surface-2); }
  .vt-cl span { display:grid; } .vt-cl small, .vt-tk small { color:var(--text-3); font-size:12px; }
  .vt-vacio { color:var(--text-3); font-size:13px; margin:4px 0; } .vt-nota { font-size:12px; color:var(--text-3); margin:8px 0 0; }
  .vt-conectar { max-width:560px; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:22px 24px; display:grid; gap:10px; }
  .vt-aviso { background:#FFFAEB; border:1px solid #F5C77E; border-radius:8px; padding:9px 12px; color:#7A4B00 !important; }
  .vt-conectar h2 { font-size:20px; } .vt-conectar p, .vt-conectar ol { margin:0; color:var(--text-2); font-size:14px; } .vt-conectar ol { padding-left:20px; display:grid; gap:4px; }
  @media (max-width:900px) { #vt-sync { display:none; } .vt-estado { font-size:11px; padding:4px 9px; } .vt-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); } .vt-kpi b { font-size:20px; } .vt-grid { grid-template-columns:minmax(0,1fr); }
    .vt-seg { flex-wrap:nowrap; overflow-x:auto; max-width:100%; } .vt-seg button { flex:none; } .vt-calor i { height:16px; } .vt-calor .hh { font-size:9px; } }`;
  document.head.appendChild(s);
}
