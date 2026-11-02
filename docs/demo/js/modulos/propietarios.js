// Reporte mensual a cada propietario: cómo le fue a sus unidades en el mes (ocupación, rentas cobradas y pendientes,
// servicios, contratos por vencer) y su liquidación (lo cobrado menos la comisión de administración).
// Se descarga en PDF / se imprime, o se le manda el resumen por WhatsApp.
// Las unidades se ligan al propietario por su nombre (unidades.propietario); sus datos de contacto y comisión van en "propietarios".
import { MESES, MARCA } from '../config.js';
import { db, todo, estado, tieneRol, fmt, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal } from '../lib.js';
import { cobroServicios } from '../servicios-calc.js';

const hoy0 = new Date();
const st = { ym: `${hoy0.getFullYear()}-${String(hoy0.getMonth() + 1).padStart(2, '0')}`, prop: '' };
let raiz, unidades = [], contratos = [], pagos = [], props = [], srv = {};
const per = (ym) => ym + '-01';
const mesTxt = (ym) => `${MESES[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const sumarMes = (ym, k) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const nombreCentro = (id) => estado.centros.find((c) => c.id === id)?.nombre || '';
const variosCentros = () => new Set(unidades.map((u) => u.centro_id)).size > 1;
const etiquetaU = (u) => (variosCentros() ? `${nombreCentro(u.centro_id)} · ` : '') + u.identificador;
const SIN = '(Sin propietario)';

export async function render(view) {
  raiz = view;
  view.innerHTML = '<div class="cargando">Cargando…</div>';
  await cargar();
}

async function cargar() {
  const desde = per(sumarMes(st.ym, -6));
  const [u, c, p, pr, m, l, r, t] = await Promise.all([
    todo(() => db().from('unidades').select('id, centro_id, identificador, tipo, propietario, activo')),
    todo(() => db().from('contratos').select('id, unidad_id, centro_id, arrendatario, telefono, monto, moneda, dia_pago, fecha_inicio, fecha_fin, activo')),
    todo(() => db().from('pagos').select('id, contrato_id, unidad_id, concepto, periodo, monto, moneda').in('concepto', ['renta', 'servicios']).gte('periodo', desde).lte('periodo', per(st.ym))),
    db().from('propietarios').select('*').eq('activo', true),
    todo(() => db().from('medidores').select('id, centro_id, unidad_id, servicio, lectura_inicial').eq('activo', true)),
    todo(() => db().from('lecturas').select('id, medidor_id, periodo, lectura').gte('periodo', desde).lte('periodo', per(st.ym))),
    db().from('recibos_servicio').select('*').eq('periodo', per(st.ym)),
    db().from('tarifas_servicio').select('*'),
  ]);
  const err = u.error || c.error || p.error || pr.error;
  if (err) { raiz.innerHTML = `<div class="vacio">No se pudo cargar el reporte.<br><small>${esc(err.message)}</small></div>`; return; }
  unidades = u.data.filter((x) => x.activo !== false); contratos = c.data; pagos = p.data; props = pr.data || [];
  srv = m.error ? {} : cobroServicios({ medidores: m.data, lecturas: l.data || [], recibos: r.data || [], tarifas: t.data || [] }, per(st.ym));
  const nombres = listaProps();
  if (!nombres.includes(st.prop)) st.prop = nombres[0] || '';
  pintar();
}

function listaProps() {
  const n = [...new Set([...unidades.map((u) => u.propietario || SIN), ...props.map((p) => p.nombre)])];
  return n.sort((a, b) => (a === SIN) - (b === SIN) || a.localeCompare(b));
}
const fichaProp = (n) => props.find((p) => p.nombre === n) || { nombre: n, comision_pct: 0 };

// ---------- números de un propietario en el mes ----------
const contratoDe = (u) => contratos.filter((k) => k.activo && k.unidad_id === u.id)
  .sort((a, b) => String(b.fecha_fin || '9999').localeCompare(String(a.fecha_fin || '9999')))[0] || null;
const pagadoRenta = (k, ym) => pagos.filter((p) => p.concepto === 'renta' && p.contrato_id === k.id && p.periodo === per(ym)).reduce((a, p) => a + Number(p.monto), 0);
function estadoRenta(k, ym) {
  if (!k || !Number(k.monto)) return 'sinm';
  const pag = pagadoRenta(k, ym);
  if (pag >= Number(k.monto) - 1) return 'pagado';
  if (pag > 0) return 'parcial';
  const hoy = new Date(), venc = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, k.dia_pago || 1);
  return venc < hoy ? 'atrasado' : 'pendiente';
}
// Meses atrasados de renta en los últimos 6: desde que empezó el contrato y desde que se registran rentas en el sistema
// (los meses de antes de usar el sistema no tienen pagos capturados y no cuentan como deuda)
const primerMes = () => pagos.filter((p) => p.concepto === 'renta').reduce((a, p) => (p.periodo < a ? p.periodo : a), per(st.ym)).slice(0, 7);
function mesesDebe(k) {
  if (!k || !Number(k.monto)) return { n: 0, monto: 0 };
  let n = 0, monto = 0;
  const desde = primerMes();
  for (let i = 0; i < 6; i++) {
    const ym = sumarMes(st.ym, -i);
    if ((k.fecha_inicio && ym < k.fecha_inicio.slice(0, 7)) || ym < desde) break;
    const e = estadoRenta(k, ym);
    if (e === 'atrasado' || e === 'parcial') { n++; monto += Number(k.monto) - pagadoRenta(k, ym); }
  }
  return { n, monto };
}
const ETQ = { pagado: ['Pagada', 'verde'], parcial: ['Abonada', 'ambar'], atrasado: ['Atrasada', 'rojo'], pendiente: ['Por cobrar', 'gris'], sinm: ['Sin renta capturada', 'gris'], libre: ['Disponible', 'gris'] };

function reporte(nombre, ym = st.ym) {
  const us = unidades.filter((u) => (u.propietario || SIN) === nombre).sort((a, b) => etiquetaU(a).localeCompare(etiquetaU(b), 'es', { numeric: true }));
  const filas = us.map((u) => {
    const k = contratoDe(u), e = k ? estadoRenta(k, ym) : 'libre', pag = k ? pagadoRenta(k, ym) : 0, d = mesesDebe(k);
    const s = srv[u.id]?.total || 0, sPag = pagos.filter((p) => p.concepto === 'servicios' && p.unidad_id === u.id && p.periodo === per(ym)).reduce((a, p) => a + Number(p.monto), 0);
    const dias = k?.fecha_fin ? Math.round((new Date(k.fecha_fin + 'T12:00:00') - new Date()) / 864e5) : null;
    return { u, k, e, renta: Number(k?.monto || 0), pag, debe: d, s, sPag, dias };
  });
  const ocup = filas.filter((f) => f.k).length;
  const esperado = filas.reduce((a, f) => a + (f.k && f.k.moneda !== 'USD' ? f.renta : 0), 0);
  const cobrado = filas.reduce((a, f) => a + (f.k?.moneda !== 'USD' ? f.pag : 0), 0);
  const pct = Number(fichaProp(nombre).comision_pct || 0);
  const comision = Math.round(cobrado * pct) / 100;
  return { nombre, filas, ocup, total: us.length, esperado, cobrado, pendiente: Math.max(0, esperado - cobrado), pct, comision, entregar: cobrado - comision,
    servicios: filas.reduce((a, f) => a + f.s, 0), serviciosPag: filas.reduce((a, f) => a + f.sPag, 0),
    adeudo: filas.reduce((a, f) => a + f.debe.monto, 0), sinRenta: filas.filter((f) => f.k && !f.renta).length,
    vencen: filas.filter((f) => f.k && f.dias != null && f.dias <= 90).sort((a, b) => a.dias - b.dias) };
}

// ---------- pantalla ----------
function pintar() {
  const nombres = listaProps();
  const acc = document.getElementById('page-actions');
  acc.innerHTML = nombres.length ? `<button class="btn btn-ghost" id="pp-pdf">Descargar PDF</button><button class="btn btn-wa" id="pp-wa">WhatsApp</button>` : '';
  if (!nombres.length) { raiz.innerHTML = '<div class="vacio">Todavía no hay propietarios. Ponle propietario a las unidades en Residentes (ficha del depto → Editar).</div>'; return; }
  const R = reporte(st.prop), F = fichaProp(st.prop);
  raiz.innerHTML = `
    <div class="sub-head">
      <div class="pills">${nombres.map((n) => `<button class="pill ${n === st.prop ? 'activa' : ''}" data-prop="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <div class="nav-mes"><button class="icon-btn" data-nav="-1" aria-label="Mes anterior">‹</button><strong>${mesTxt(st.ym)}</strong><button class="icon-btn" data-nav="1" aria-label="Mes siguiente">›</button></div>
    </div>
    <section class="panel pp-prop">
      <div><span class="mut">Propietario</span><strong>${esc(R.nombre)}</strong>
        <small>${esc([F.contacto, F.telefono, F.email].filter(Boolean).join(' · ') || 'Sin datos de contacto')}${R.pct ? ` · comisión de administración ${R.pct} %` : ''}</small></div>
      ${tieneRol(['administracion']) && R.nombre !== SIN ? '<button class="btn btn-sm btn-ghost" id="pp-editar">Datos y comisión</button>' : ''}
    </section>
    <div class="kpis">
      <div class="kpi"><span>Ocupación</span><strong>${R.total ? Math.round(R.ocup / R.total * 100) : 0}%</strong><small>${R.ocup} de ${R.total} unidades rentadas</small></div>
      <div class="kpi"><span>Renta cobrada</span><strong class="pos">${fmt(R.cobrado)}</strong><small>de ${fmt(R.esperado)} del mes</small></div>
      <div class="kpi"><span>Pendiente</span><strong class="${R.pendiente ? 'neg' : ''}">${fmt(R.pendiente)}</strong><small>${R.adeudo > R.pendiente ? `${fmt(R.adeudo)} contando meses anteriores` : 'de este mes'}</small></div>
      <div class="kpi"><span>A entregar</span><strong>${fmt(R.entregar)}</strong><small>${R.pct ? `cobrado − ${R.pct} % de comisión (${fmt(R.comision)})` : 'lo cobrado en el mes'}</small></div>
    </div>
    ${R.sinRenta ? `<div class="panel rs-aviso"><b>${R.sinRenta} contrato${R.sinRenta === 1 ? '' : 's'} sin renta capturada.</b> El reporte sale completo cuando se capturen en Rentas → Contratos.</div>` : ''}
    <section class="panel"><div class="panel-head"><h3>Sus unidades en ${mesTxt(st.ym).toLowerCase()}</h3></div>
      <div class="tabla-wrap"><table class="tabla rs-tabla pp-tabla"><thead><tr><th>Unidad</th><th>Inquilino</th><th class="num">Renta</th><th class="num">Cobrado</th><th>Renta del mes</th><th class="num">Luz, gas y agua</th><th>Contrato</th></tr></thead>
      <tbody>${R.filas.map((f) => `<tr><td data-l="Unidad"><strong>${esc(etiquetaU(f.u))}</strong></td>
        <td data-l="Inquilino">${f.k ? esc(f.k.arrendatario) : '<span class="mut">Disponible</span>'}</td>
        <td class="num" data-l="Renta">${f.renta ? fmt(f.renta) : '—'}</td><td class="num" data-l="Cobrado">${f.pag ? fmt(f.pag) : '—'}</td>
        <td data-l="Renta del mes"><span class="badge ${ETQ[f.e][1]}">${ETQ[f.e][0]}</span>${f.debe.n > 1 ? ` <small>${f.debe.n} meses</small>` : ''}</td>
        <td class="num" data-l="Servicios">${f.s ? `${fmt(f.s)}${f.sPag >= f.s - 0.5 ? ' <small>pagado</small>' : ''}` : '—'}</td>
        <td data-l="Contrato">${f.k?.fecha_fin ? `<span class="${f.dias < 0 ? 'neg' : f.dias <= 30 ? 'neg' : ''}">${f.dias < 0 ? 'Vencido' : 'Vence'} ${fmtFecha(f.k.fecha_fin)}</span>` : f.k ? '<span class="mut">Sin fecha</span>' : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td></td><td class="num">${fmt(R.esperado)}</td><td class="num">${fmt(R.cobrado)}</td><td></td><td class="num">${R.servicios ? fmt(R.servicios) : '—'}</td><td></td></tr></tfoot></table></div>
    </section>
    ${R.vencen.length ? `<section class="panel"><div class="panel-head"><h3>Contratos por renovar (próximos 90 días)</h3></div>
      <p class="nota">${R.vencen.map((f) => `<b>${esc(etiquetaU(f.u))}</b> ${esc(f.k.arrendatario)} · ${f.dias < 0 ? 'venció' : 'vence'} ${fmtFecha(f.k.fecha_fin)}`).join('<br>')}</p></section>` : ''}
    <section class="panel"><div class="panel-head"><h3>Liquidación de ${mesTxt(st.ym).toLowerCase()}</h3></div>
      <dl class="lec-dl pp-liq"><dt>Rentas cobradas</dt><dd>${fmt(R.cobrado)}</dd>
        <dt>Comisión de administración${R.pct ? ` (${R.pct} %)` : ''}</dt><dd>− ${fmt(R.comision)}</dd>
        <dt><b>A entregar al propietario</b></dt><dd><b>${fmt(R.entregar)}</b></dd></dl>
      <p class="nota" style="margin-top:8px">Luz, gas y agua no entran en la liquidación: lo que pagan los inquilinos cubre el recibo de la compañía que paga el edificio. ${R.servicios ? `Este mes se les cargaron ${fmt(R.servicios)} y han pagado ${fmt(R.serviciosPag)}.` : ''}</p>
    </section>`;
  raiz.querySelectorAll('[data-prop]').forEach((b) => b.addEventListener('click', () => { st.prop = b.dataset.prop; pintar(); }));
  raiz.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => { st.ym = sumarMes(st.ym, +b.dataset.nav); raiz.innerHTML = '<div class="cargando">Cargando…</div>'; cargar(); }));
  raiz.querySelector('#pp-editar')?.addEventListener('click', () => editar(F));
  acc.querySelector('#pp-pdf').addEventListener('click', () => imprimir(R));
  acc.querySelector('#pp-wa').addEventListener('click', () => whatsapp(R, F));
}

function editar(F) {
  const modal = abrirModal({
    titulo: `Propietario · ${F.nombre}`,
    cuerpo: `<form class="form" id="pf" novalidate>
      <label>Persona de contacto<input name="contacto" maxlength="80" value="${esc(F.contacto || '')}"></label>
      <div class="form-2"><label>Teléfono<input name="telefono" maxlength="30" value="${esc(F.telefono || '')}"></label>
        <label>Correo<input type="email" name="email" maxlength="120" value="${esc(F.email || '')}"></label></div>
      <label>Comisión de administración (%)<input type="number" name="pct" min="0" max="100" step="0.01" value="${Number(F.comision_pct || 0)}"></label>
      <p class="nota">La comisión se descuenta de las rentas cobradas en la liquidación de cada mes.</p></form>`,
    pie: `<button class="btn btn-ghost" id="pf-no">Cancelar</button><button class="btn btn-primary" id="pf-si">Guardar</button>`,
  });
  const f = modal.querySelector('#pf');
  modal.querySelector('#pf-no').addEventListener('click', cerrarModal);
  modal.querySelector('#pf-si').addEventListener('click', async () => {
    const pct = Number(f.pct.value) || 0;
    if (pct < 0 || pct > 100) return toast('La comisión va de 0 a 100 %', true);
    const fila = { org_id: estado.miembro.org_id, nombre: F.nombre, contacto: f.contacto.value.trim() || null, telefono: f.telefono.value.trim() || null,
      email: f.email.value.trim() || null, comision_pct: pct, activo: true };
    const { error } = await db().from('propietarios').upsert(fila, { onConflict: 'org_id,nombre' });
    if (error) return toast('No se pudo guardar: ' + error.message, true);
    cerrarModal(); toast('Guardado ✓'); cargar();
  });
}

function whatsapp(R, F) {
  const txt = `Hola${F.contacto ? ' ' + F.contacto.split(' ')[0] : ''}, te compartimos el resumen de ${mesTxt(st.ym).toLowerCase()} de tus unidades:\n\n`
    + `• Ocupación: ${R.ocup} de ${R.total} rentadas\n• Rentas cobradas: ${fmt(R.cobrado)} de ${fmt(R.esperado)}\n• Pendiente: ${fmt(R.pendiente)}\n`
    + (R.pct ? `• Comisión de administración (${R.pct} %): ${fmt(R.comision)}\n` : '')
    + `*A entregar: ${fmt(R.entregar)}*\n` + (R.vencen.length ? `\nContratos por renovar en 90 días: ${R.vencen.map((f) => f.u.identificador).join(', ')}\n` : '')
    + '\nTe mandamos el reporte completo en PDF.';
  const t = String(F.telefono || '').replace(/\D/g, ''), tel = t.length === 10 ? '52' + t : t;
  window.open(tel ? `https://wa.me/${tel}?text=${encodeURIComponent(txt)}` : `https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
}

// Reporte en una ventana aparte, tamaño carta, listo para guardar como PDF o imprimir
function imprimir(R) {
  const w = window.open('', '_blank');
  if (!w) return toast('Permite ventanas emergentes para ver el reporte', true);
  const empresa = MARCA.reciboEmpresa || MARCA.nombre || '';
  const color = MARCA.color || '#141414';
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte ${esc(R.nombre)} ${mesTxt(st.ym)}</title>
<style>@page{size:letter;margin:14mm} *{box-sizing:border-box} body{font:12px/1.45 Arial,Helvetica,sans-serif;color:#141414;margin:0}
.barra{position:sticky;top:0;background:#141414;color:#fff;padding:10px;text-align:center}.barra button{font:700 14px Arial;padding:8px 14px;border:0;border-radius:4px;cursor:pointer}
.c{max-width:780px;margin:0 auto;padding:24px}
.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid ${color};padding-bottom:10px;margin-bottom:16px}
.head h1{font-size:20px;margin:0}.head .e{font-weight:700;color:${color};font-size:14px}
.k{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}.k div{border:1px solid #ddd;border-radius:4px;padding:8px}.k span{display:block;font-size:10px;color:#666;text-transform:uppercase}.k b{font-size:16px}
table{width:100%;border-collapse:collapse;margin-bottom:14px}th{text-align:left;font-size:10px;text-transform:uppercase;color:#555;border-bottom:2px solid #141414;padding:5px 4px}td{border-bottom:1px solid #e5e5e5;padding:5px 4px}
.n{text-align:right;font-variant-numeric:tabular-nums}tfoot td{font-weight:700;border:0}h2{font-size:13px;margin:16px 0 6px}
.liq{width:320px;margin-left:auto}.liq td{border:0}.liq tr:last-child td{border-top:2px solid #141414;font-weight:700;font-size:14px}.nota{color:#555;font-size:11px}
@media print{.barra{display:none}.c{padding:0}}</style></head><body>
<div class="barra"><button onclick="print()">Guardar PDF / Imprimir</button></div>
<div class="c"><div class="head"><div><div class="e">${esc(empresa)}</div><h1>Reporte al propietario · ${mesTxt(st.ym)}</h1></div><div><b>${esc(R.nombre)}</b><br><span class="nota">Generado el ${fmtFecha(hoyISO())}</span></div></div>
<div class="k"><div><span>Ocupación</span><b>${R.total ? Math.round(R.ocup / R.total * 100) : 0}%</b><br>${R.ocup} de ${R.total}</div><div><span>Renta cobrada</span><b>${fmt(R.cobrado)}</b><br>de ${fmt(R.esperado)}</div>
<div><span>Pendiente</span><b>${fmt(R.pendiente)}</b></div><div><span>A entregar</span><b>${fmt(R.entregar)}</b></div></div>
<table><thead><tr><th>Unidad</th><th>Inquilino</th><th class="n">Renta</th><th class="n">Cobrado</th><th>Estado</th><th class="n">Servicios</th><th>Contrato</th></tr></thead><tbody>
${R.filas.map((f) => `<tr><td><b>${esc(etiquetaU(f.u))}</b></td><td>${f.k ? esc(f.k.arrendatario) : 'Disponible'}</td><td class="n">${f.renta ? fmt(f.renta) : '—'}</td><td class="n">${f.pag ? fmt(f.pag) : '—'}</td>
<td>${ETQ[f.e][0]}${f.debe.n > 1 ? ` (${f.debe.n} meses)` : ''}</td><td class="n">${f.s ? fmt(f.s) : '—'}</td><td>${f.k?.fecha_fin ? fmtFecha(f.k.fecha_fin) : ''}</td></tr>`).join('')}</tbody>
<tfoot><tr><td>Total</td><td></td><td class="n">${fmt(R.esperado)}</td><td class="n">${fmt(R.cobrado)}</td><td></td><td class="n">${R.servicios ? fmt(R.servicios) : '—'}</td><td></td></tr></tfoot></table>
${R.vencen.length ? `<h2>Contratos por renovar (próximos 90 días)</h2><p>${R.vencen.map((f) => `${esc(etiquetaU(f.u))} · ${esc(f.k.arrendatario)} · ${fmtFecha(f.k.fecha_fin)}`).join('<br>')}</p>` : ''}
<h2>Liquidación</h2><table class="liq"><tr><td>Rentas cobradas</td><td class="n">${fmt(R.cobrado)}</td></tr><tr><td>Comisión de administración${R.pct ? ` (${R.pct} %)` : ''}</td><td class="n">− ${fmt(R.comision)}</td></tr><tr><td>A entregar</td><td class="n">${fmt(R.entregar)}</td></tr></table>
<p class="nota">Luz, gas y agua se cobran a cada inquilino según su medidor y cubren el recibo del edificio; no forman parte de la liquidación.</p></div></body></html>`);
  w.document.close();
}
