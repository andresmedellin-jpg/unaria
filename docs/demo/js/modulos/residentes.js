// Residentes (paquete inmobiliario): quién vive en cada unidad, sus autos y mascotas, a quién pertenece la unidad
// y cuándo vence cada contrato. Reemplaza el Excel de "base de datos de residentes" que llevan los edificios.
// La renta y los pagos siguen en Rentas; aquí está la gente.
import { MESES } from '../config.js';
import { db, todo, estado, tieneRol, fmtFecha, hoyISO, esc, toast, abrirModal, cerrarModal, normalizar } from '../lib.js';

const st = { tab: 'directorio', q: '', prop: '', estatus: '', mes: '' };
let raiz, unidades = [], contratos = [], residentes = [], vehiculos = [], mascotas = [];
const puedeEditar = () => tieneRol(['administracion', 'cobranza', 'encargado']);
const puedeBorrar = () => tieneRol(['administracion', 'cobranza']);

const DIAS_AVISO = 30;   // igual que su Excel: "Próximo a vencer" = vence en 30 días o menos
const ESTATUS = { vigente: ['Vigente', 'verde'], porvencer: ['Por vencer', 'ambar'], vencido: ['Vencido', 'rojo'], sinfecha: ['Sin fecha', 'gris'], libre: ['Disponible', 'gris'] };
const nombreCentro = (id) => estado.centros.find((c) => c.id === id)?.nombre || '';
const variosCentros = () => new Set(unidades.map((u) => u.centro_id)).size > 1;
const etiquetaU = (u) => (variosCentros() ? `${nombreCentro(u.centro_id)} · ` : '') + u.identificador;
const placaLimpia = (s) => String(s || '').toUpperCase().replace(/^PLACAS?\s*:?/, '').replace(/[^A-Z0-9]/g, '');
const telLimpio = (s) => String(s || '').replace(/\D/g, '');
const diasA = (iso) => Math.round((new Date(iso + 'T12:00:00') - new Date(hoyISO() + 'T12:00:00')) / 864e5);

// ---------- datos ----------
export async function render(view) {
  raiz = view;
  view.innerHTML = `
    <div class="sub-head">
      <div class="tabs" role="tablist">
        ${[['directorio', 'Directorio'], ['vehiculos', 'Vehículos'], ['vencimientos', 'Vencimientos']]
          .map(([id, t]) => `<button role="tab" data-tab="${id}">${t}</button>`).join('')}
      </div>
    </div>
    <div id="rs-cuerpo"><div class="cargando">Cargando…</div></div>`;
  view.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.tab; pintar(); }));
  await cargar();
}

async function cargar() {
  const [u, c, r, v, m] = await Promise.all([
    todo(() => db().from('unidades').select('id, centro_id, identificador, tipo, propietario, amueblado, notas, activo')),
    todo(() => db().from('contratos').select('id, unidad_id, centro_id, arrendatario, telefono, email, fecha_inicio, fecha_fin, monto, moneda, activo')),
    todo(() => db().from('residentes').select('id, unidad_id, nombre, telefono, email, es_titular, notas, activo').eq('activo', true)),
    todo(() => db().from('vehiculos').select('id, unidad_id, placas, color, modelo, notas, activo').eq('activo', true)),
    todo(() => db().from('mascotas').select('id, unidad_id, tipo, nombre, notas, activo').eq('activo', true)),
  ]);
  const err = u.error || c.error || r.error || v.error || m.error;
  if (err) { raiz.querySelector('#rs-cuerpo').innerHTML = `<div class="vacio">No se pudieron cargar los residentes.<br><small>${esc(err.message)}</small></div>`; return; }
  unidades = u.data.filter((x) => x.activo !== false)
    .sort((a, b) => nombreCentro(a.centro_id).localeCompare(nombreCentro(b.centro_id)) || a.identificador.localeCompare(b.identificador, 'es', { numeric: true }));
  contratos = c.data; residentes = r.data; vehiculos = v.data; mascotas = m.data;
  pintar();
}

// El contrato activo de una unidad (si hubiera dos, el que vence después)
const contratoDe = (u) => contratos.filter((k) => k.activo && k.unidad_id === u.id)
  .sort((a, b) => String(b.fecha_fin || '9999').localeCompare(String(a.fecha_fin || '9999')))[0] || null;
function estatusDe(k) {
  if (!k) return 'libre';
  if (!k.fecha_fin) return 'sinfecha';
  const d = diasA(k.fecha_fin);
  return d < 0 ? 'vencido' : d <= DIAS_AVISO ? 'porvencer' : 'vigente';
}
const badge = (e, k) => `<span class="badge ${ESTATUS[e][1]}">${ESTATUS[e][0]}${k?.fecha_fin ? ` · ${fmtFecha(k.fecha_fin)}` : ''}</span>`;
const de = (lista, u) => lista.filter((x) => x.unidad_id === u.id);

// Placas que aparecen en más de una unidad: casi siempre es un error de captura (o el mismo auto con dos departamentos)
function placasRepetidas() {
  const n = {};
  vehiculos.forEach((v) => { const p = placaLimpia(v.placas); if (p) (n[p] ||= new Set()).add(v.unidad_id); });
  return new Set(Object.entries(n).filter(([, s]) => s.size > 1).map(([p]) => p));
}

// Búsqueda: depto, arrendatario, residentes, teléfonos, correos, placas, autos, mascotas, propietario
function coincide(u, q) {
  if (!q) return true;
  const k = contratoDe(u), qn = normalizar(q), qp = placaLimpia(q), qt = telLimpio(q);
  const textos = [u.identificador, u.propietario, k?.arrendatario, k?.email,
    ...de(residentes, u).flatMap((r) => [r.nombre, r.email]), ...de(vehiculos, u).flatMap((v) => [v.modelo, v.color]),
    ...de(mascotas, u).flatMap((m) => [m.tipo, m.nombre])];
  if (textos.some((t) => normalizar(t).includes(qn))) return true;
  if (qp.length >= 3 && de(vehiculos, u).some((v) => placaLimpia(v.placas).includes(qp))) return true;
  if (qt.length >= 4 && [k?.telefono, ...de(residentes, u).map((r) => r.telefono)].some((t) => telLimpio(t).includes(qt))) return true;
  return false;
}

// ---------- pintar ----------
function pintar() {
  raiz.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === st.tab));
  const acc = document.getElementById('page-actions');
  acc.innerHTML = `<button class="btn btn-ghost" id="rs-excel">Descargar Excel</button>`;
  acc.querySelector('#rs-excel').addEventListener('click', exportar);
  const el = raiz.querySelector('#rs-cuerpo');
  ({ directorio: pintarDirectorio, vehiculos: pintarVehiculos, vencimientos: pintarVencimientos })[st.tab](el);
}

function buscador(ph) {
  return `<input type="search" id="rs-q" placeholder="${ph}" value="${esc(st.q)}" autocomplete="off" aria-label="Buscar">`;
}
function enlazarBuscador(el, repintar) {
  const i = el.querySelector('#rs-q');
  i.addEventListener('input', () => { st.q = i.value; repintar(); });
}

function pintarDirectorio(el) {
  const props = [...new Set(unidades.map((u) => u.propietario).filter(Boolean))].sort();
  const cuenta = (e) => unidades.filter((u) => estatusDe(contratoDe(u)) === e).length;
  const ocupadas = unidades.filter(contratoDe).length;
  el.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Ocupación</span><strong>${unidades.length ? Math.round(ocupadas / unidades.length * 100) : 0}%</strong><small>${ocupadas} de ${unidades.length} unidades</small></div>
      <div class="kpi"><span>Residentes</span><strong>${residentes.length}</strong><small>${vehiculos.length} vehículos · ${mascotas.length} mascota${mascotas.length === 1 ? '' : 's'}</small></div>
      <div class="kpi"><span>Por vencer</span><strong class="${cuenta('porvencer') ? 'neg' : ''}">${cuenta('porvencer')}</strong><small>contratos en ${DIAS_AVISO} días o menos</small></div>
      <div class="kpi"><span>Vencidos</span><strong class="${cuenta('vencido') ? 'neg' : ''}">${cuenta('vencido')}</strong><small>${cuenta('sinfecha') ? `${cuenta('sinfecha')} sin fecha de término` : 'contratos sin renovar'}</small></div>
    </div>
    <section class="panel">
      <div class="filtros rs-filtros">
        ${buscador('Busca depto, nombre, teléfono o placas')}
        ${props.length ? `<select id="rs-prop" aria-label="Propietario"><option value="">Todos los propietarios</option>${props.map((p) => `<option ${st.prop === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}<option value="-" ${st.prop === '-' ? 'selected' : ''}>Sin propietario</option></select>` : ''}
        <select id="rs-est" aria-label="Contrato"><option value="">Todos los contratos</option>
          ${Object.entries(ESTATUS).map(([k, [t]]) => `<option value="${k}" ${st.estatus === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <div id="rs-lista"></div>
    </section>`;
  const lista = () => {
    const filas = unidades.filter((u) => coincide(u, st.q)
      && (!st.prop || (st.prop === '-' ? !u.propietario : u.propietario === st.prop))
      && (!st.estatus || estatusDe(contratoDe(u)) === st.estatus));
    el.querySelector('#rs-lista').innerHTML = filas.length ? `<div class="tabla-wrap"><table class="tabla rs-tabla">
      <thead><tr><th>Unidad</th><th>Arrendatario</th>${props.length ? '<th>Propietario</th>' : ''}<th class="num">Residentes</th><th class="num">Autos</th><th>Contrato</th></tr></thead>
      <tbody>${filas.map((u) => { const k = contratoDe(u), rs = de(residentes, u), vs = de(vehiculos, u), ms = de(mascotas, u);
        return `<tr class="clic" data-u="${u.id}" tabindex="0">
          <td data-l="Unidad"><strong>${esc(etiquetaU(u))}</strong>${u.amueblado ? ' <span class="tag tag-suave">Amueblado</span>' : ''}${ms.length ? ` <span class="tag tag-suave" title="Mascotas">🐾 ${ms.length}</span>` : ''}</td>
          <td data-l="Arrendatario">${k ? esc(k.arrendatario) : '<span class="mut">Disponible</span>'}</td>
          ${props.length ? `<td class="mut" data-l="Propietario">${esc(u.propietario || '—')}</td>` : ''}
          <td class="num" data-l="Residentes">${rs.length || '<span class="mut">0</span>'}</td>
          <td class="num" data-l="Autos">${vs.length || '<span class="mut">0</span>'}</td>
          <td data-l="Contrato">${badge(estatusDe(k), k)}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="nota" style="margin-top:12px">${filas.length} de ${unidades.length} unidades. Toca una para ver y editar quién vive ahí.</p>`
      : `<div class="vacio">${unidades.length ? 'Nada coincide con la búsqueda.' : 'Todavía no hay unidades. Súbelas en Configuración → Importar datos.'}</div>`;
    el.querySelectorAll('[data-u]').forEach((t) => {
      const abrir = () => ficha(unidades.find((u) => u.id === t.dataset.u));
      t.addEventListener('click', abrir);
      t.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
    });
  };
  enlazarBuscador(el, lista);
  el.querySelector('#rs-prop')?.addEventListener('change', (e) => { st.prop = e.target.value; lista(); });
  el.querySelector('#rs-est').addEventListener('change', (e) => { st.estatus = e.target.value; lista(); });
  lista();
}

// Para la caseta: escribir parte de la placa y saber de qué depto es
function pintarVehiculos(el) {
  const rep = placasRepetidas();
  const sinPlaca = vehiculos.filter((v) => !placaLimpia(v.placas)).length;
  el.innerHTML = `
    <section class="panel">
      <div class="filtros rs-filtros">${buscador('Escribe la placa, el depto o el modelo')}</div>
      <p class="nota" style="margin:8px 0 0">${vehiculos.length} vehículos registrados${sinPlaca ? ` · <b>${sinPlaca} sin placas</b>` : ''}${rep.size ? ` · <b style="color:var(--neg)">${rep.size} placa${rep.size === 1 ? '' : 's'} en más de un depto</b>` : ''}.</p>
      <div id="rs-lista" style="margin-top:12px"></div>
    </section>`;
  const uDe = (v) => unidades.find((u) => u.id === v.unidad_id);
  const lista = () => {
    const qp = placaLimpia(st.q), qn = normalizar(st.q);
    const filas = vehiculos.filter((v) => { const u = uDe(v); if (!u) return false; if (!st.q) return true;
      return (qp.length >= 2 && placaLimpia(v.placas).includes(qp)) || normalizar(u.identificador).includes(qn)
        || normalizar(v.modelo).includes(qn) || normalizar(v.color).includes(qn); })
      .sort((a, b) => uDe(a).identificador.localeCompare(uDe(b).identificador, 'es', { numeric: true }));
    el.querySelector('#rs-lista').innerHTML = filas.length ? `<div class="tabla-wrap"><table class="tabla rs-tabla">
      <thead><tr><th>Placas</th><th>Unidad</th><th>Auto</th><th>Arrendatario</th></tr></thead>
      <tbody>${filas.map((v) => { const u = uDe(v), k = contratoDe(u), p = placaLimpia(v.placas);
        return `<tr class="clic" data-u="${u.id}" tabindex="0">
          <td data-l="Placas"><strong class="mono rs-placa">${p ? esc(p) : '<span class="mut">Sin placas</span>'}</strong>${p && rep.has(p) ? ' <span class="badge rojo">Repetida</span>' : ''}</td>
          <td data-l="Unidad"><strong>${esc(etiquetaU(u))}</strong></td>
          <td data-l="Auto">${esc([v.modelo, v.color].filter(Boolean).join(' · ') || '—')}</td>
          <td class="mut" data-l="Arrendatario">${esc(k?.arrendatario || '—')}</td></tr>`; }).join('')}</tbody></table></div>`
      : '<div class="vacio">Ningún vehículo coincide.</div>';
    el.querySelectorAll('[data-u]').forEach((t) => t.addEventListener('click', () => ficha(unidades.find((u) => u.id === t.dataset.u))));
  };
  enlazarBuscador(el, lista);
  lista();
}

// Como el tablero de su Excel: cuántos contratos vencen cada mes, y cuáles
function pintarVencimientos(el) {
  const con = unidades.map((u) => ({ u, k: contratoDe(u) })).filter((x) => x.k);
  const vencidos = con.filter((x) => estatusDe(x.k) === 'vencido').sort((a, b) => a.k.fecha_fin.localeCompare(b.k.fecha_fin));
  const sinFecha = con.filter((x) => !x.k.fecha_fin);
  const hoy = new Date(), meses = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1), clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    meses.push({ clave, titulo: `${MESES[d.getMonth()]} ${d.getFullYear()}`, l: con.filter((x) => x.k.fecha_fin?.slice(0, 7) === clave && diasA(x.k.fecha_fin) >= 0)
      .sort((a, b) => a.k.fecha_fin.localeCompare(b.k.fecha_fin)) });
  }
  const max = Math.max(1, ...meses.map((m) => m.l.length));
  const prox = (n) => con.filter((x) => x.k.fecha_fin && diasA(x.k.fecha_fin) >= 0 && diasA(x.k.fecha_fin) <= n).length;
  const fila = ({ u, k }) => `<tr class="clic" data-u="${u.id}" tabindex="0"><td data-l="Unidad"><strong>${esc(etiquetaU(u))}</strong></td>
    <td data-l="Arrendatario">${esc(k.arrendatario)}</td><td class="mut" data-l="Propietario">${esc(u.propietario || '—')}</td>
    <td data-l="Vence">${badge(estatusDe(k), k)}</td><td class="acciones">${contacto(k)}</td></tr>`;
  const tabla = (l) => `<div class="tabla-wrap"><table class="tabla rs-tabla"><thead><tr><th>Unidad</th><th>Arrendatario</th><th>Propietario</th><th>Vence</th><th></th></tr></thead><tbody>${l.map(fila).join('')}</tbody></table></div>`;
  el.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Vencidos</span><strong class="${vencidos.length ? 'neg' : ''}">${vencidos.length}</strong><small>sin renovar</small></div>
      <div class="kpi"><span>Próximos 30 días</span><strong>${prox(30)}</strong><small>hay que hablar ya</small></div>
      <div class="kpi"><span>Próximos 90 días</span><strong>${prox(90)}</strong><small>para planear la renovación</small></div>
      <div class="kpi"><span>Sin fecha</span><strong>${sinFecha.length}</strong><small>contratos sin fecha de término</small></div>
    </div>
    ${vencidos.length ? `<section class="panel"><div class="panel-head"><h3>Vencidos</h3></div>${tabla(vencidos)}</section>` : ''}
    <section class="panel"><div class="panel-head"><h3>Vencen en los próximos 12 meses</h3></div>
      <div class="barras rs-barras">${meses.map((m) => `<button type="button" class="rs-mes${st.mes === m.clave ? ' activo' : ''}" data-mes="${m.clave}" ${m.l.length ? '' : 'disabled'} aria-pressed="${st.mes === m.clave}">
        <span class="barra-nombre">${m.titulo}</span><span class="barra-pista"><span style="width:${m.l.length / max * 100}%"></span></span><span class="barra-monto">${m.l.length}</span></button>`).join('')}</div>
    </section>
    ${(() => { // la lista: el mes que tocó en la gráfica, o los próximos 90 días
      const m = meses.find((x) => x.clave === st.mes);
      const l = m ? m.l : con.filter((x) => x.k.fecha_fin && diasA(x.k.fecha_fin) >= 0 && diasA(x.k.fecha_fin) <= 90).sort((a, b) => a.k.fecha_fin.localeCompare(b.k.fecha_fin));
      return `<section class="panel" id="rs-lista-venc"><div class="panel-head"><h3>${m ? `Vencen en ${m.titulo}` : 'Vencen en los próximos 90 días'}</h3>
        <span class="sub-meta">${l.length} contrato${l.length === 1 ? '' : 's'}${m ? ' · <button class="link-btn" id="rs-mes-x">Ver próximos 90 días</button>' : ' · toca un mes para ver otro'}</span></div>
        ${l.length ? tabla(l) : '<div class="vacio">Ninguno.</div>'}</section>`; })()}
    ${sinFecha.length ? `<section class="panel"><div class="panel-head"><h3>Sin fecha de término</h3></div>${tabla(sinFecha)}</section>` : ''}`;
  el.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', () => { st.mes = st.mes === b.dataset.mes ? '' : b.dataset.mes; pintar();
    raiz.querySelector('#rs-lista-venc')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  el.querySelector('#rs-mes-x')?.addEventListener('click', () => { st.mes = ''; pintar(); });
  el.querySelectorAll('tr[data-u]').forEach((t) => t.addEventListener('click', (e) => { if (!e.target.closest('a')) ficha(unidades.find((u) => u.id === t.dataset.u)); }));
}

// Botones para llamar o escribir por WhatsApp
function contacto(x) {
  const t = telLimpio(x?.telefono);
  if (t.length < 10) return '';
  const wa = t.length === 10 ? '52' + t : t;
  return `<span class="rs-contacto"><a class="btn btn-sm btn-ghost" href="tel:${t}" aria-label="Llamar">Llamar</a><a class="btn btn-sm btn-wa" href="https://wa.me/${wa}" target="_blank" rel="noopener" aria-label="WhatsApp">WhatsApp</a></span>`;
}

// ---------- ficha de la unidad ----------
// Cada sección (residentes, vehículos, mascotas) se edita ahí mismo, sin abrir otra ventana.
const SECCIONES = {
  residentes: { titulo: 'Residentes', tabla: 'residentes', nuevo: 'Agregar residente',
    campos: [['nombre', 'Nombre', 'text', true], ['telefono', 'Teléfono', 'tel'], ['email', 'Correo', 'email'], ['es_titular', 'Es el arrendatario', 'check']],
    linea: (r) => `<strong>${esc(r.nombre)}</strong>${r.es_titular ? ' <span class="tag tag-ok">Arrendatario</span>' : ''}<br><small>${esc([r.telefono, r.email].filter(Boolean).join(' · ') || 'Sin contacto')}</small>`,
    extra: (r) => contacto(r) },
  vehiculos: { titulo: 'Vehículos', tabla: 'vehiculos', nuevo: 'Agregar vehículo',
    campos: [['placas', 'Placas', 'text'], ['modelo', 'Modelo', 'text'], ['color', 'Color', 'text'], ['notas', 'Notas', 'text']],
    linea: (v) => `<strong class="mono">${esc(placaLimpia(v.placas) || 'Sin placas')}</strong> <span class="mut">${esc([v.modelo, v.color].filter(Boolean).join(' · '))}</span>${v.notas ? `<br><small>${esc(v.notas)}</small>` : ''}` },
  mascotas: { titulo: 'Mascotas', tabla: 'mascotas', nuevo: 'Agregar mascota',
    campos: [['tipo', 'Tipo (perro, gato…)', 'text', true], ['nombre', 'Nombre', 'text'], ['notas', 'Notas', 'text']],
    linea: (m) => `<strong>${esc(m.tipo)}</strong>${m.nombre ? ` · ${esc(m.nombre)}` : ''}${m.notas ? `<br><small>${esc(m.notas)}</small>` : ''}` },
};
const listas = { residentes: () => residentes, vehiculos: () => vehiculos, mascotas: () => mascotas };

function ficha(u, editando = null) {
  if (!u) return;
  const k = contratoDe(u), e = estatusDe(k);
  const props = [...new Set(unidades.map((x) => x.propietario).filter(Boolean))].sort();
  const seccion = (clave) => {
    const s = SECCIONES[clave], l = de(listas[clave](), u);
    const form = (x) => `<form class="form rs-form" data-form="${clave}" data-id="${x?.id || ''}">
      <div class="form-2">${s.campos.map(([n, t, tipo, req]) => tipo === 'check'
        ? `<label class="opcion opcion-linea"><input type="checkbox" name="${n}" ${x?.[n] ? 'checked' : ''}> ${t}</label>`
        : `<label>${t}<input name="${n}" type="${tipo}" value="${esc(x?.[n] ?? '')}" ${req ? 'required' : ''} maxlength="120"></label>`).join('')}</div>
      <div class="rs-form-pie">${x && puedeBorrar() ? `<button type="button" class="btn btn-sm btn-peligro" data-borrar="${clave}:${x.id}">Quitar</button>` : ''}
        <button type="button" class="btn btn-sm btn-ghost" data-cancelar>Cancelar</button><button type="submit" class="btn btn-sm btn-primary">Guardar</button></div></form>`;
    return `<section class="rs-sec"><div class="rs-sec-head"><h3>${s.titulo} <small>${l.length}</small></h3>
        ${puedeEditar() && editando !== `${clave}:nuevo` ? `<button class="btn btn-sm btn-ghost" data-nuevo="${clave}">＋ ${s.nuevo}</button>` : ''}</div>
      ${l.map((x) => editando === `${clave}:${x.id}` ? form(x) : `<div class="rs-item"><div>${s.linea(x)}</div><div class="rs-item-acc">${s.extra?.(x) || ''}
        ${puedeEditar() ? `<button class="btn btn-sm btn-ghost" data-editar="${clave}:${x.id}">Editar</button>` : ''}</div></div>`).join('')
        || (editando === `${clave}:nuevo` ? '' : `<p class="mut rs-vacio">Sin ${s.titulo.toLowerCase()} registrados.</p>`)}
      ${editando === `${clave}:nuevo` ? form(null) : ''}</section>`;
  };
  const modal = abrirModal({
    titulo: etiquetaU(u), ancho: true,
    cuerpo: `<div class="rs-ficha">
      <div class="rs-contrato">
        <div><span class="mut">Arrendatario</span><strong>${k ? esc(k.arrendatario) : 'Disponible'}</strong>
          ${k ? `<small>${esc([k.telefono, k.email].filter(Boolean).join(' · ') || 'Sin teléfono ni correo')}</small>` : ''}</div>
        <div><span class="mut">Contrato</span>${badge(e, k)}${k?.fecha_inicio ? `<small>Desde ${fmtFecha(k.fecha_inicio)}</small>` : ''}</div>
        <div><span class="mut">Renta</span><strong>${k && Number(k.monto) ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: k.moneda === 'USD' ? 'USD' : 'MXN' }).format(k.monto) : '—'}</strong>
          <small>${k ? 'Se edita en Rentas → Contratos' : 'Hazle contrato en Rentas'}</small></div>
        ${k ? `<div class="rs-contrato-acc">${contacto(k)}</div>` : ''}
      </div>
      ${editando === 'unidad' ? `<form class="form rs-form" data-form="unidad"><div class="form-2">
          <label>Propietario<input name="propietario" list="rs-props" value="${esc(u.propietario || '')}" maxlength="80"><datalist id="rs-props">${props.map((p) => `<option value="${esc(p)}">`).join('')}</datalist></label>
          <label>Amueblado<select name="amueblado"><option value="">No se sabe</option><option value="si" ${u.amueblado === true ? 'selected' : ''}>Sí</option><option value="no" ${u.amueblado === false ? 'selected' : ''}>No</option></select></label>
          <label class="ancho">Observaciones<textarea name="notas" rows="2">${esc(u.notas || '')}</textarea></label></div>
          <div class="rs-form-pie"><button type="button" class="btn btn-sm btn-ghost" data-cancelar>Cancelar</button><button type="submit" class="btn btn-sm btn-primary">Guardar</button></div></form>`
      : `<div class="rs-unidad"><span><span class="mut">Propietario:</span> ${esc(u.propietario || '—')}</span><span><span class="mut">Amueblado:</span> ${u.amueblado == null ? '—' : u.amueblado ? 'Sí' : 'No'}</span>
          ${u.notas ? `<span class="rs-notas"><span class="mut">Observaciones:</span> ${esc(u.notas)}</span>` : ''}
          ${puedeEditar() ? '<button class="btn btn-sm btn-ghost" data-editar-unidad>Editar</button>' : ''}</div>`}
      ${seccion('residentes')}${seccion('vehiculos')}${seccion('mascotas')}
    </div>`,
  });
  const otra = (ed) => ficha(u, ed);
  modal.querySelectorAll('[data-nuevo]').forEach((b) => b.addEventListener('click', () => otra(`${b.dataset.nuevo}:nuevo`)));
  modal.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => otra(b.dataset.editar)));
  modal.querySelector('[data-editar-unidad]')?.addEventListener('click', () => otra('unidad'));
  modal.querySelectorAll('[data-cancelar]').forEach((b) => b.addEventListener('click', () => otra(null)));
  modal.querySelector('form')?.querySelector('input, select')?.focus();
  modal.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
    const [clave, id] = b.dataset.borrar.split(':');
    if (!confirmar(b)) return;
    const { error } = await db().from(SECCIONES[clave].tabla).update({ activo: false }).eq('id', id);
    if (error) return toast('No se pudo quitar: ' + error.message, true);
    const l = listas[clave](); l.splice(l.findIndex((x) => x.id === id), 1);
    toast('Listo ✓'); otra(null); repintarFondo();
  }));
  modal.querySelectorAll('form[data-form]').forEach((f) => f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try {
      if (f.dataset.form === 'unidad') {
        const datos = { propietario: f.propietario.value.trim() || null, amueblado: f.amueblado.value === '' ? null : f.amueblado.value === 'si', notas: f.notas.value.trim() || null };
        const { error } = await db().from('unidades').update(datos).eq('id', u.id);
        if (error) throw error;
        Object.assign(u, datos);
      } else {
        const clave = f.dataset.form, s = SECCIONES[clave], datos = {};
        for (const [n, , tipo, req] of s.campos) {
          datos[n] = tipo === 'check' ? f[n].checked : (f[n].value.trim() || null);
          if (req && !datos[n]) throw new Error(`Falta: ${s.campos.find((c) => c[0] === n)[1]}`);
        }
        if (clave === 'vehiculos') datos.placas = placaLimpia(datos.placas) || null;
        const id = f.dataset.id, l = listas[clave]();
        if (id) {
          const { error } = await db().from(s.tabla).update(datos).eq('id', id);
          if (error) throw error;
          Object.assign(l.find((x) => x.id === id), datos);
        } else {
          const { data, error } = await db().from(s.tabla).insert({ ...datos, unidad_id: u.id, org_id: estado.miembro.org_id }).select().single();
          if (error) throw error;
          l.push(data);
          if (clave === 'vehiculos' && datos.placas && placasRepetidas().has(datos.placas)) toast('Ojo: esa placa ya está registrada en otro depto', true);
        }
      }
      if (!document.querySelector('.toast.error.show')) toast('Guardado ✓');
      otra(null); repintarFondo();
    } catch (e) { btn.disabled = false; toast(e.message || 'No se pudo guardar', true); }
  }));
}
// Pide confirmación en el mismo botón (sin ventanas del navegador): primer toque arma, segundo quita
function confirmar(b) {
  if (b.dataset.armado) return true;
  b.dataset.armado = '1'; b.textContent = '¿Seguro? Toca otra vez';
  setTimeout(() => { if (b.isConnected) { delete b.dataset.armado; b.textContent = 'Quitar'; } }, 4000);
  return false;
}
const repintarFondo = () => { if (raiz?.isConnected) pintar(); };

// ---------- Excel ----------
const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
async function exportar() {
  try {
    if (!window.XLSX) await new Promise((ok, mal) => { const s = document.createElement('script'); s.src = XLSX_URL; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar Excel. Revisa tu internet.')); document.head.appendChild(s); });
    const X = window.XLSX, wb = X.utils.book_new();
    const uDe = (id) => unidades.find((u) => u.id === id);
    const hoja = (nombre, filas) => { const ws = X.utils.json_to_sheet(filas); ws['!cols'] = Object.keys(filas[0] || { a: 1 }).map((c) => ({ wch: Math.max(10, c.length + 2) })); X.utils.book_append_sheet(wb, ws, nombre); };
    hoja('Unidades', unidades.map((u) => { const k = contratoDe(u); return { Unidad: etiquetaU(u), Arrendatario: k?.arrendatario || '', Teléfono: k?.telefono || '', Correo: k?.email || '',
      Inicio: k?.fecha_inicio || '', Fin: k?.fecha_fin || '', Contrato: ESTATUS[estatusDe(k)][0], Propietario: u.propietario || '', Amueblado: u.amueblado == null ? '' : u.amueblado ? 'Sí' : 'No',
      Residentes: de(residentes, u).length, Vehículos: de(vehiculos, u).length, Mascotas: de(mascotas, u).length, Observaciones: u.notas || '' }; }));
    hoja('Residentes', residentes.filter((r) => uDe(r.unidad_id)).map((r) => ({ Unidad: etiquetaU(uDe(r.unidad_id)), Nombre: r.nombre, Teléfono: r.telefono || '', Correo: r.email || '', Arrendatario: r.es_titular ? 'Sí' : '' })));
    hoja('Vehículos', vehiculos.filter((v) => uDe(v.unidad_id)).map((v) => ({ Unidad: etiquetaU(uDe(v.unidad_id)), Placas: placaLimpia(v.placas), Modelo: v.modelo || '', Color: v.color || '', Notas: v.notas || '' })));
    hoja('Mascotas', mascotas.filter((m) => uDe(m.unidad_id)).map((m) => ({ Unidad: etiquetaU(uDe(m.unidad_id)), Tipo: m.tipo, Nombre: m.nombre || '', Notas: m.notas || '' })));
    X.writeFile(wb, `Residentes ${hoyISO()}.xlsx`);
  } catch (e) { toast(e.message, true); }
}
