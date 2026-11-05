// Menú: lo que vende el negocio y cómo se arma el menú interactivo de WhatsApp, Instagram y Messenger.
// Producto base con su precio; pasos (salsa, picor, proteína, toppings, bebida… los que quieran) con sus opciones,
// precio extra y "agotado hoy"; envío, formas de pago y sucursales. Al guardar, el menú del cliente cambia al instante.
// Tabla: menus (un documento por negocio; la forma está en docs/demo/chilabike/menu-ejemplo.js).
import { db, esc, toast, estado } from '../lib.js';
import { MARCA } from '../config.js';

let raiz, mod, fila = null, M = null, sucio = false;
const copia = (o) => JSON.parse(JSON.stringify(o));
const nid = (t) => String(t || 'op').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'op' + Date.now();
const ESTILOS = { salsa: 'Tarjetas grandes de color', tarjeta: 'Tarjetas con ícono', chips: 'Botones chicos' };

export async function render(view, m) {
  raiz = view; mod = m || mod; estilos();
  const empresa = mod?.negocio?.empresa_id;
  const r = await db().from('menus').select('*').eq('empresa_id', empresa).maybeSingle();
  fila = r.data; M = copia(fila?.datos || window.MENU_CHILABIKE || { negocio: mod?.negocio?.nombre || '', producto: { nombre: '', precio: 0 }, pasos: [], envio: 0, pagos: ['Efectivo', 'Transferencia'], sucursales: [], eventos: { tipos: [] } });
  if (!M.eventos?.horarios && window.MENU_CHILABIKE?.eventos) M.eventos = { ...copia(window.MENU_CHILABIKE.eventos), ...(M.eventos || {}), horarios: copia(window.MENU_CHILABIKE.eventos.horarios), incluye: copia(window.MENU_CHILABIKE.eventos.incluye) };
  if (window.MENU_CHILABIKE) { M.ubicaciones ||= copia(window.MENU_CHILABIKE.ubicaciones || {}); if (M.eventos && !M.eventos.zonas) M.eventos.zonas = copia(window.MENU_CHILABIKE.eventos.zonas || []); }
  sucio = false; acciones(); pintar();
}

function acciones() {
  const urlMenu = (MARCA.chilabike?.chat || '').replace(/chat\/?$/, 'arma/');
  document.getElementById('page-actions').innerHTML = `${urlMenu ? `<a class="btn btn-ghost" href="${esc(urlMenu)}" target="_blank" rel="noopener">Ver como cliente</a>` : ''}
    <button class="btn btn-primary" id="mn-guardar"${sucio ? '' : ' disabled'}>${sucio ? 'Guardar y publicar' : 'Publicado ✓'}</button>`;
  document.getElementById('mn-guardar').addEventListener('click', guardar);
}
function cambio() { sucio = true; acciones(); }

function pintar() {
  const agotados = M.pasos.flatMap((p) => p.opciones.filter((o) => o.disponible === false).map((o) => ({ p, o })));
  raiz.innerHTML = `
    <div class="mn-hoy"><b>Hoy no hay:</b> ${agotados.length ? agotados.map(({ p, o }) => `<button class="mn-ag" data-reponer="${p.id}|${o.id}">${esc(o.nombre)} ✕</button>`).join('') : '<span>todo disponible</span>'}
      <small>Toca "Agotado" en cualquier opción y desaparece del menú de los clientes hasta que la vuelvas a poner.</small></div>
    <div class="mn-grid">
      <div class="mn-panel">
        <h3>Lo que se vende</h3>
        <div class="form-3"><label>Producto<input data-f="producto.nombre" value="${esc(M.producto.nombre)}"></label><label>Tamaño<input data-f="producto.detalle" value="${esc(M.producto.detalle || '')}"></label><label>Precio base<input type="number" min="0" data-f="producto.precio" data-num value="${esc(M.producto.precio)}"></label></div>
        <label>Ya incluye<input data-f="producto.incluye" value="${esc(M.producto.incluye || '')}"></label>
      </div>
      <div class="mn-panel">
        <h3>Entrega y pago</h3>
        <div class="form-2"><label>Envío a domicilio<input type="number" min="0" data-f="envio" data-num value="${esc(M.envio)}"></label></div>
        <div class="mn-chips"><span>Formas de pago</span>${['Efectivo', 'Transferencia', 'Tarjeta'].map((x) => `<button class="mn-chip${M.pagos.includes(x) ? ' on' : ''}" data-pago="${x}">${x}</button>`).join('')}</div>
        <div class="mn-sub" style="margin-top:6px">Sucursales <small>el link de Maps se le manda al cliente cuando pasa por su pedido o pregunta dónde están</small></div>
        <table class="tabla mn-ops mn-sucs"><thead><tr><th style="width:150px">Sucursal</th><th>Link de Maps</th><th style="width:120px">Nota</th><th style="width:36px"></th></tr></thead><tbody>
        ${M.sucursales.map((x, i) => { const u = (M.ubicaciones ||= {})[x] || {}; return `<tr data-suc="${i}"><td><input data-sf="nombre" value="${esc(x)}"></td><td><input data-sf="mapa" value="${esc(u.mapa || '')}" placeholder="https://maps.app.goo.gl/…"></td>
          <td><input data-sf="nota" value="${esc(u.nota || '')}" placeholder="Ej. solo domingos"></td><td><button class="mn-x" data-quitar-suc="${i}" aria-label="Quitar">✕</button></td></tr>`; }).join('')}
        </tbody></table><button class="link-btn" data-nueva-suc>+ Sucursal</button>
      </div>
    </div>
    ${eventos()}
    <h3 class="mn-tit">Cómo se arma <small>cada paso es una pregunta del menú, en este orden</small></h3>
    <div class="mn-pasos">${M.pasos.map(paso).join('')}</div>
    <button class="btn btn-ghost" id="mn-nuevo-paso">+ Agregar un paso</button>
    ${M.ejemplo ? '<p class="mn-nota">Este es el menú de ejemplo. Captura el real y dale "Guardar y publicar".</p>' : ''}`;
  enlazar();
}

// Eventos: así se cotiza (precio por persona, mínimo de órdenes según el horario, lo que incluye, anticipo)
function eventos() {
  const E = M.eventos ||= { tipos: [] }; E.horarios ||= []; E.incluye ||= [];
  return `<div class="mn-panel mn-ev">
    <h3>Eventos: así se cotiza <small>lo usa el menú de "Cotizar evento" y la ficha de cada evento</small></h3>
    <div class="form-3">
      <label>Precio por persona <small>vacío = se cotiza a mano</small><input type="number" min="0" data-f="eventos.precioPersona" data-num value="${esc(E.precioPersona ?? '')}"></label>
      <label>Anticipo para apartar (%)<input type="number" min="0" max="100" data-f="eventos.anticipo" data-num value="${esc(E.anticipo ?? '')}"></label>
      <label class="mn-check" style="align-self:end;padding-bottom:10px"><input type="checkbox" data-f="eventos.pideFactura"${E.pideFactura ? ' checked' : ''}> Preguntar si requiere factura</label>
    </div>
    <div class="mn-ev-grid">
      <div><div class="mn-sub">Mínimo de órdenes por horario</div>
        <table class="tabla mn-ops"><thead><tr><th>Horario</th><th style="width:96px">Desde</th><th style="width:88px">Mínimo</th><th style="width:36px"></th></tr></thead><tbody>
        ${E.horarios.map((h, k) => `<tr><td><input data-f="eventos.horarios.${k}.nombre" value="${esc(h.nombre)}"></td><td><input type="time" data-f="eventos.horarios.${k}.desde" value="${esc(h.desde)}"></td>
          <td><input type="number" min="0" data-f="eventos.horarios.${k}.minimo" data-num value="${esc(h.minimo ?? '')}"></td><td><button class="mn-x" data-quitar-ev="horarios|${k}" aria-label="Quitar">✕</button></td></tr>`).join('')}
        </tbody></table><button class="link-btn" data-nuevo-ev="horarios">+ Agregar horario</button></div>
      <div><div class="mn-sub">El servicio incluye</div>
        <table class="tabla mn-ops"><thead><tr><th style="width:44px">Ícono</th><th style="width:130px">Qué</th><th>Detalle</th><th style="width:36px"></th></tr></thead><tbody>
        ${E.incluye.map((x, k) => `<tr><td><input class="mn-emoji" data-f="eventos.incluye.${k}.emoji" value="${esc(x.emoji || '')}" maxlength="4"></td><td><input data-f="eventos.incluye.${k}.t" value="${esc(x.t)}"></td>
          <td><input data-f="eventos.incluye.${k}.d" value="${esc(x.d || '')}"></td><td><button class="mn-x" data-quitar-ev="incluye|${k}" aria-label="Quitar">✕</button></td></tr>`).join('')}
        </tbody></table><button class="link-btn" data-nuevo-ev="incluye">+ Agregar</button></div>
    </div>
    <div><div class="mn-sub">Traslado y montaje aproximado por zona <small>se confirma viendo la ubicación</small></div>
      <table class="tabla mn-ops"><thead><tr><th>Zona</th><th>Ejemplo</th><th style="width:100px">Desde</th><th style="width:100px">Hasta</th><th style="width:36px"></th></tr></thead><tbody>
      ${(E.zonas ||= []).map((z, k) => `<tr><td><input data-f="eventos.zonas.${k}.nombre" value="${esc(z.nombre)}"></td><td><input data-f="eventos.zonas.${k}.detalle" value="${esc(z.detalle || '')}"></td>
        <td><input type="number" min="0" data-f="eventos.zonas.${k}.min" data-num value="${esc(z.min ?? '')}"></td><td><input type="number" min="0" data-f="eventos.zonas.${k}.max" data-num value="${esc(z.max ?? '')}"></td>
        <td><button class="mn-x" data-quitar-ev="zonas|${k}" aria-label="Quitar">✕</button></td></tr>`).join('')}
      </tbody></table><button class="link-btn" data-nuevo-ev="zonas">+ Agregar zona</button></div>
    <div class="form-2"><label>Traslado y montaje (nota)<input data-f="eventos.traslado" value="${esc(E.traslado || '')}"></label><label>Condiciones del precio<input data-f="eventos.condiciones" value="${esc(E.condiciones || '')}"></label></div>
  </div>`;
}

function paso(p, i) {
  return `<div class="mn-paso" data-paso="${i}">
    <div class="mn-paso-top">
      <span class="mn-n">${i + 1}</span>
      <input class="mn-titulo" data-pf="titulo" value="${esc(p.titulo)}" aria-label="Pregunta">
      <select data-pf="tipo"><option value="una"${p.tipo === 'una' ? ' selected' : ''}>Escoge una</option><option value="varias"${p.tipo === 'varias' ? ' selected' : ''}>Las que quiera</option></select>
      <select data-pf="estilo">${Object.entries(ESTILOS).map(([k, t]) => `<option value="${k}"${p.estilo === k ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <label class="mn-check"><input type="checkbox" data-pf="obligatorio"${p.obligatorio ? ' checked' : ''}> Obligatorio</label>
      <span class="mn-mover"><button data-mover="-1" aria-label="Subir">↑</button><button data-mover="1" aria-label="Bajar">↓</button><button data-borrar-paso aria-label="Quitar paso">🗑</button></span>
    </div>
    <input class="mn-ayuda" data-pf="ayuda" value="${esc(p.ayuda || '')}" placeholder="Texto de ayuda (opcional)">
    <table class="tabla mn-ops"><thead><tr><th style="width:44px">Ícono</th><th>Opción</th><th style="width:110px">Precio extra</th><th style="width:150px">Hoy</th><th style="width:36px"></th></tr></thead><tbody>
      ${p.opciones.map((o, k) => `<tr data-op="${k}" class="${o.disponible === false ? 'mn-agotada' : ''}">
        <td><input class="mn-emoji" data-of="emoji" value="${esc(o.emoji || '')}" maxlength="4" placeholder="—"></td>
        <td><input data-of="nombre" value="${esc(o.nombre)}">${p.estilo === 'salsa' ? `<input class="mn-desc" data-of="desc" value="${esc(o.desc || '')}" placeholder="Descripción corta">` : ''}</td>
        <td><input type="number" min="0" data-of="precio" data-num value="${esc(o.precio || 0)}"></td>
        <td><button class="mn-disp${o.disponible === false ? ' no' : ''}" data-disp>${o.disponible === false ? 'Agotado' : 'Hay'}</button></td>
        <td><button class="mn-x" data-borrar-op aria-label="Quitar">✕</button></td></tr>`).join('')}
    </tbody></table>
    <button class="link-btn" data-nueva-op>+ Agregar opción</button>
  </div>`;
}

function set(obj, ruta, v) { const k = ruta.split('.'); let o = obj; k.slice(0, -1).forEach((x) => { o[x] ||= {}; o = o[x]; }); o[k[k.length - 1]] = v; }
function enlazar() {
  const val = (el) => (el.type === 'checkbox' ? el.checked : el.dataset.num !== undefined ? (el.value === '' ? null : Number(el.value)) : el.value);
  raiz.querySelectorAll('[data-f]').forEach((el) => el.addEventListener('input', () => { set(M, el.dataset.f, val(el)); cambio(); }));
  raiz.querySelectorAll('[data-pago]').forEach((b) => b.addEventListener('click', () => { const x = b.dataset.pago, i = M.pagos.indexOf(x); if (i >= 0) M.pagos.splice(i, 1); else M.pagos.push(x); cambio(); pintar(); }));
  raiz.querySelectorAll('[data-quitar-suc]').forEach((b) => b.addEventListener('click', () => { M.sucursales.splice(Number(b.dataset.quitarSuc), 1); cambio(); pintar(); }));
  raiz.querySelector('[data-nueva-suc]')?.addEventListener('click', () => { const n = prompt('Nombre de la sucursal'); if (n) { M.sucursales.push(n.trim()); cambio(); pintar(); } });
  raiz.querySelectorAll('tr[data-suc]').forEach((tr) => {
    const i = Number(tr.dataset.suc);
    tr.querySelectorAll('[data-sf]').forEach((el) => el.addEventListener(el.dataset.sf === 'nombre' ? 'change' : 'input', () => {
      const nom = M.sucursales[i], u = (M.ubicaciones[nom] ||= {});
      if (el.dataset.sf === 'nombre') { const nuevo = el.value.trim(); if (!nuevo || nuevo === nom) return; M.sucursales[i] = nuevo; M.ubicaciones[nuevo] = u; delete M.ubicaciones[nom]; }
      else if (el.dataset.sf === 'nota') { u.nota = el.value; if (/doming/i.test(el.value)) u.dias = [0]; else if (/s[aá]bado/i.test(el.value)) u.dias = [6]; else delete u.dias; }
      else u[el.dataset.sf] = el.value.trim();
      cambio(); }));
  });
  raiz.querySelectorAll('[data-reponer]').forEach((b) => b.addEventListener('click', () => { const [pid, oid] = b.dataset.reponer.split('|'); const o = M.pasos.find((p) => p.id === pid)?.opciones.find((x) => x.id === oid); if (o) { o.disponible = true; cambio(); pintar(); } }));
  raiz.querySelectorAll('[data-paso]').forEach((caja) => {
    const p = M.pasos[Number(caja.dataset.paso)], i = Number(caja.dataset.paso);
    caja.querySelectorAll('[data-pf]').forEach((el) => el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', () => { p[el.dataset.pf] = val(el); cambio(); if (el.tagName === 'SELECT') pintar(); }));
    caja.querySelectorAll('[data-op]').forEach((tr) => {
      const o = p.opciones[Number(tr.dataset.op)];
      tr.querySelectorAll('[data-of]').forEach((el) => el.addEventListener('input', () => { o[el.dataset.of] = val(el); cambio(); }));
      tr.querySelector('[data-disp]').addEventListener('click', () => { o.disponible = o.disponible === false; cambio(); pintar(); });
      tr.querySelector('[data-borrar-op]').addEventListener('click', () => { p.opciones.splice(Number(tr.dataset.op), 1); cambio(); pintar(); });
    });
    caja.querySelector('[data-nueva-op]').addEventListener('click', () => { p.opciones.push({ id: 'op' + Date.now().toString(36), nombre: 'Nueva opción', precio: 0, disponible: true }); cambio(); pintar(); });
    caja.querySelectorAll('[data-mover]').forEach((b) => b.addEventListener('click', () => { const j = i + Number(b.dataset.mover); if (j < 0 || j >= M.pasos.length) return; [M.pasos[i], M.pasos[j]] = [M.pasos[j], M.pasos[i]]; cambio(); pintar(); }));
    caja.querySelector('[data-borrar-paso]').addEventListener('click', () => { if (confirm(`¿Quitar el paso "${p.titulo}"?`)) { M.pasos.splice(i, 1); cambio(); pintar(); } });
  });
  raiz.querySelectorAll('[data-quitar-ev]').forEach((b) => b.addEventListener('click', () => { const [l, k] = b.dataset.quitarEv.split('|'); M.eventos[l].splice(Number(k), 1); cambio(); pintar(); }));
  raiz.querySelectorAll('[data-nuevo-ev]').forEach((b) => b.addEventListener('click', () => { const l = b.dataset.nuevoEv;
    M.eventos[l].push(l === 'horarios' ? { id: 'h' + Date.now().toString(36), nombre: 'Nuevo horario', desde: '12:00', minimo: 30 } : l === 'zonas' ? { id: 'z' + Date.now().toString(36), nombre: 'Nueva zona', min: 0, max: 0 } : { emoji: '✓', t: '', d: '' }); cambio(); pintar(); }));
  raiz.querySelector('#mn-nuevo-paso').addEventListener('click', () => { M.pasos.push({ id: nid('paso-' + Date.now().toString(36)), titulo: 'Nueva pregunta', tipo: 'varias', obligatorio: false, estilo: 'chips', opciones: [] }); cambio(); pintar(); });
}

async function guardar() {
  const b = document.getElementById('mn-guardar'); b.disabled = true;
  M.pasos.forEach((p) => { p.opciones.forEach((o) => { if (!o.id || o.id.startsWith('op')) o.id = nid(o.nombre) + (p.opciones.filter((x) => nid(x.nombre) === nid(o.nombre)).length > 1 ? '-' + Math.random().toString(36).slice(2, 5) : ''); }); });
  const datos = { ...M }; delete datos.ejemplo;
  const r = fila
    ? await db().from('menus').update({ datos, publicado_en: new Date().toISOString(), publicado_por: estado.miembro?.nombre }).eq('id', fila.id).select().single()
    : await db().from('menus').insert({ org_id: estado.miembro?.org_id, empresa_id: mod?.negocio?.empresa_id, datos, publicado_por: estado.miembro?.nombre }).select().single();
  if (r.error) { b.disabled = false; return toast(r.error.message, true); }
  fila = r.data; M = copia(datos); sucio = false;
  if (MARCA.demo) { try { localStorage.setItem('chilabike-demo-menu', JSON.stringify(datos)); } catch (e) { /* sin almacenamiento */ } }
  toast('Menú publicado: ya lo ven así tus clientes ✓');
  acciones(); pintar();
}

function estilos() {
  if (document.getElementById('mn-estilos')) return;
  const s = document.createElement('style'); s.id = 'mn-estilos';
  s.textContent = `
  .mn-ev { margin-bottom:14px; display:grid; gap:12px; } .mn-ev .mn-check { display:flex; flex-direction:row; align-items:center; gap:8px; } .mn-ev .mn-check input { width:18px; height:18px; flex:none; } .mn-ev h3 small { font-weight:400; color:var(--text-3); font-size:12.5px; margin-left:6px; }
  .mn-sub small { font-weight:400; color:var(--text-3); margin-left:4px; } .mn-sucs { margin-bottom:4px; }
  .mn-ev-grid { display:grid; grid-template-columns:1fr 1.3fr; gap:16px; } .mn-sub { font-weight:700; font-size:13px; margin-bottom:6px; }
  @media (max-width:900px) { .mn-ev-grid { grid-template-columns:1fr; } }
  .mn-hoy { display:flex; flex-wrap:wrap; gap:8px; align-items:center; background:#FFFAEB; border:1px solid #F5C77E; border-radius:10px; padding:10px 14px; margin-bottom:14px; font-size:13.5px; }
  .mn-hoy small { flex-basis:100%; color:var(--text-3); font-size:12px; }
  .mn-ag { font:inherit; font-size:12.5px; font-weight:700; border:0; background:#FEE4E2; color:#B42318; border-radius:999px; padding:4px 10px; cursor:pointer; }
  .mn-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:12px; margin-bottom:16px; }
  .mn-panel { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:14px 16px; display:grid; gap:10px; align-content:start; }
  .mn-panel h3, .mn-tit { font-size:14.5px; margin:0; } .mn-tit { margin:6px 0 10px; } .mn-tit small { font-weight:400; margin-left:6px; }
  .mn-panel label { display:grid; gap:4px; font-size:12.5px; font-weight:600; color:var(--text-2); } .mn-panel label small { font-weight:400; }
  .mn-panel input, .mn-paso input, .mn-paso select { font:inherit; font-size:13.5px; border:1px solid var(--border); border-radius:7px; padding:7px 9px; background:#fff; width:100%; min-width:0; }
  .mn-chips { display:flex; flex-wrap:wrap; gap:6px; align-items:center; } .mn-chips > span { font-size:12.5px; font-weight:600; color:var(--text-2); width:100%; }
  .mn-chip { font:inherit; font-size:12.5px; font-weight:600; border:1px solid var(--border); background:#fff; color:var(--text-2); border-radius:999px; padding:5px 11px; cursor:pointer; }
  .mn-chip.on { background:var(--primary-soft); border-color:var(--primary); color:var(--primary); }
  .mn-pasos { display:grid; gap:12px; margin-bottom:12px; }
  .mn-paso { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:12px 14px; display:grid; gap:8px; }
  .mn-paso-top { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .mn-n { width:26px; height:26px; border-radius:50%; background:var(--primary); color:#fff; display:grid; place-items:center; font-weight:800; font-size:13px; flex:none; }
  .mn-titulo { flex:1 1 200px; font-weight:700 !important; font-size:15px !important; }
  .mn-paso-top select { width:auto; } .mn-check { display:flex; gap:5px; align-items:center; font-size:12.5px; white-space:nowrap; } .mn-check input { width:auto; }
  .mn-mover { display:flex; gap:4px; margin-left:auto; } .mn-mover button, .mn-x { border:1px solid var(--border); background:#fff; border-radius:6px; width:30px; height:30px; cursor:pointer; }
  .mn-ayuda { color:var(--text-2); }
  .mn-ops td { vertical-align:top; padding:5px 6px !important; } .mn-ops input { padding:6px 8px; } .mn-emoji { text-align:center; } .mn-desc { margin-top:4px; font-size:12.5px !important; }
  .mn-disp { font:inherit; font-size:12.5px; font-weight:700; border:0; border-radius:999px; padding:6px 12px; background:#ECFDF3; color:#067647; cursor:pointer; width:100%; }
  .mn-disp.no { background:#FEE4E2; color:#B42318; } .mn-agotada input { opacity:.55; }
  .mn-nota { font-size:12.5px; color:var(--text-3); margin-top:12px; }
  @media (max-width:900px) { .mn-grid { grid-template-columns:minmax(0,1fr); } .mn-ops th:nth-child(1), .mn-ops td:nth-child(1) { display:none; } .mn-paso-top select { flex:1; } }`;
  document.head.appendChild(s);
}
