// Caseta: la pantalla del guardia (pensada para una tablet). Paquetes y deliveries con aviso por WhatsApp al
// residente, visitas con pase (el residente lo pide por chat) o sin pase (se le pregunta al depto), y la bitácora.
// Tablas: paquetes, pases, accesos (0030). Avisos: app.encolar_aviso → wa_mensajes → función "whatsapp".
import { db, sb, estado, esc, toast, abrirModal, cerrarModal, normalizar, comprimirImagen, subirArchivo, verFoto } from '../lib.js';

const PAQUETERIAS = ['Amazon', 'Mercado Libre', 'DHL', 'FedEx', 'Estafeta', 'Rappi / comida', 'Otra'];
const TIPOS = { invitado: 'Invitado', delivery: 'Delivery', proveedor: 'Proveedor', mudanza: 'Mudanza' };
const st = { centro: null };
let raiz, reloj, C = { unidades: [], contratos: [], residentes: [], paquetes: [], pases: [], accesos: [], cuenta: null, reglas: null };

const hora = (d) => new Date(d).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
const cuando = (d) => {
  const x = new Date(d), hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dias = Math.floor((hoy - new Date(x).setHours(0, 0, 0, 0)) / 864e5);
  return dias <= 0 ? hora(d) : dias === 1 ? 'Ayer ' + hora(d) : x.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + ' ' + hora(d);
};
const inicioHoy = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const finHoy = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };
const uDe = (id) => C.unidades.find((u) => u.id === id);
const depto = (id) => uDe(id)?.identificador || '—';
const ocupante = (id) => C.contratos.find((c) => c.unidad_id === id)?.arrendatario || C.residentes.find((r) => r.unidad_id === id)?.nombre || '';
const conectado = () => !!C.cuenta?.activo;
// Teléfonos del depto (para cuando WhatsApp aún no está conectado o para llamar)
const telefonos = (id) => [...new Set([...C.residentes.filter((r) => r.unidad_id === id && r.telefono), ...C.contratos.filter((c) => c.unidad_id === id && c.telefono)]
  .map((x) => String(x.telefono).replace(/\D/g, '').slice(-10)).filter((t) => t.length === 10))];
const waLink = (tel, txt) => `https://wa.me/52${tel}?text=${encodeURIComponent(txt)}`;

export async function render(view) {
  raiz = view;
  clearInterval(reloj);
  const centros = estado.centros.filter((c) => c.activo !== false);
  if (!centros.length) { view.innerHTML = '<div class="vacio">No hay edificios dados de alta.</div>'; return; }
  if (!centros.some((c) => c.id === st.centro)) st.centro = (centros.find((c) => c.tipo === 'torre' || c.tipo === 'residencial') || centros[0]).id;
  document.getElementById('page-actions').innerHTML = `
    <button class="btn btn-ghost" id="cs-pase"><span class="cs-largo">Validar pase</span><span class="cs-corto">Pase</span></button>
    <button class="btn btn-ghost" id="cs-visita">＋ Visita</button>
    <button class="btn btn-primary" id="cs-paquete">＋ Paquete</button>`;
  document.getElementById('cs-paquete').addEventListener('click', nuevoPaquete);
  document.getElementById('cs-visita').addEventListener('click', nuevaVisita);
  document.getElementById('cs-pase').addEventListener('click', () => validarPase());
  view.innerHTML = `${centros.length > 1 ? `<div class="sub-head"><div class="filtros"><select id="cs-centro" aria-label="Edificio">${centros.map((c) => `<option value="${c.id}" ${c.id === st.centro ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div></div>` : ''}
    <div id="cs-cuerpo"><div class="cargando">Cargando…</div></div>`;
  view.querySelector('#cs-centro')?.addEventListener('change', (e) => { st.centro = e.target.value; cargar(); });
  await cargar();
  procesarCola();
  // Se actualiza sola: respuestas de los residentes, pases nuevos que piden por chat, recordatorios
  let vueltas = 0;
  reloj = setInterval(() => {
    if (!document.body.contains(raiz)) return clearInterval(reloj);
    if (document.querySelector('#modal-root .modal')) return;
    cargar(true); if (++vueltas % 10 === 0) procesarCola();
  }, 30000);
}

async function cargar(callado = false) {
  const desde = inicioHoy().toISOString();
  const [u, k, r, p, ps, ac, cu, rg] = await Promise.all([
    db().from('unidades').select('id, identificador').eq('centro_id', st.centro),
    db().from('contratos').select('unidad_id, arrendatario, telefono').eq('centro_id', st.centro).eq('activo', true),
    db().from('residentes').select('unidad_id, nombre, telefono, recibe_avisos').eq('activo', true),
    db().from('paquetes').select('*').eq('centro_id', st.centro).or(`entregado_en.is.null,entregado_en.gte.${desde}`).order('recibido_en', { ascending: false }),
    db().from('pases').select('*').eq('centro_id', st.centro).neq('estado', 'cancelado').lte('desde', finHoy().toISOString()).gte('hasta', desde).order('desde'),
    db().from('accesos').select('*').eq('centro_id', st.centro).or(`entrada.gte.${desde},autorizacion.eq.pendiente`).order('entrada', { ascending: false }),
    db().from('wa_cuentas').select('centro_id, activo, numero').eq('centro_id', st.centro).maybeSingle(),
    db().from('torre_reglas').select('*').eq('centro_id', st.centro).maybeSingle(),
  ]);
  const err = u.error || p.error || ps.error || ac.error;
  if (err) { if (!callado) raiz.querySelector('#cs-cuerpo').innerHTML = `<div class="vacio">No se pudo cargar: ${esc(err.message)}</div>`; return; }
  const ids = new Set(u.data.map((x) => x.id));
  C = { unidades: u.data.sort((a, b) => a.identificador.localeCompare(b.identificador, 'es', { numeric: true })), contratos: k.data || [],
    residentes: (r.data || []).filter((x) => ids.has(x.unidad_id)), paquetes: p.data, pases: ps.data, accesos: ac.data, cuenta: cu.data, reglas: rg.data };
  pintar();
}

function procesarCola() { sb.functions.invoke('whatsapp', { body: { accion: 'procesar' } }).catch(() => {}); }

function pintar() {
  const el = raiz.querySelector('#cs-cuerpo');
  const enCaseta = C.paquetes.filter((p) => !p.entregado_en);
  const pendientes = C.accesos.filter((a) => a.autorizacion === 'pendiente');
  const ahora = Date.now();
  const esperadas = C.pases.filter((p) => !(p.estado === 'usado' && !p.llegada));
  el.innerHTML = `
    ${conectado() ? '' : `<div class="panel cs-aviso"><b>El WhatsApp de la torre todavía no está conectado.</b> Los avisos quedan guardados y salen solos en cuanto se conecte.
      Mientras, si el depto tiene WhatsApp, te sale un botón verde para avisarle tú.</div>`}
    ${pendientes.length ? `<section class="panel cs-urgente"><div class="panel-head"><h3>Esperando que el depto autorice · ${pendientes.length}</h3></div>
      ${pendientes.map((a) => filaPendiente(a)).join('')}</section>` : ''}
    <div class="cs-grid">
      <section class="panel"><div class="panel-head"><h3>Paquetes en caseta · ${enCaseta.length}</h3></div>
        ${enCaseta.length ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Depto</th><th>Paquetería</th><th>Llegó</th><th>Aviso</th><th></th></tr></thead><tbody>
          ${enCaseta.map((p) => `<tr><td data-l="Depto"><b>${esc(depto(p.unidad_id))}</b><br><small>${esc(ocupante(p.unidad_id))}</small></td>
            <td data-l="Paquetería">${esc(p.paqueteria || '—')}${p.descripcion ? `<br><small>${esc(p.descripcion)}</small>` : ''}${p.foto_path ? ` <button class="icon-btn" data-foto="${esc(p.foto_path)}" aria-label="Ver foto">📷</button>` : ''}</td>
            <td data-l="Llegó">${cuando(p.recibido_en)}</td>
            <td data-l="Aviso">${chipPaquete(p)}</td>
            <td data-l="" class="nowrap">${botonAviso(p)}<button class="btn btn-sm btn-primary" data-entregar="${p.id}">Entregar</button></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="mut cs-vacio">No hay paquetes esperando.</p>'}
      </section>
      <section class="panel"><div class="panel-head"><h3>Visitas esperadas hoy · ${esperadas.length}</h3></div>
        ${esperadas.length ? esperadas.map((p) => {
          const entro = p.llegada, vence = new Date(p.hasta).getTime() < ahora;
          return `<div class="cs-visita${entro ? ' entro' : ''}"><div><b>${esc(p.nombre)}</b> <small class="mut">${TIPOS[p.tipo] || p.tipo}</small>
              <div><span class="cs-depto">${esc(depto(p.unidad_id))}</span>${p.placas ? ` · <span class="mono">${esc(p.placas)}</span>` : ''}${p.vehiculo ? ` ${esc(p.vehiculo)}` : ''}</div>
              <small class="mut">${hora(p.desde)} a ${new Date(p.hasta).toDateString() === new Date().toDateString() ? hora(p.hasta) : 'mañana ' + hora(p.hasta)} · ${p.origen === 'whatsapp' ? 'pidió por WhatsApp' : 'pase de la administración'}</small></div>
            <div class="cs-visita-acc">${entro ? `<span class="tag tag-ok">Entró ${hora(entro)}</span>` : vence ? '<span class="tag tag-suave">Venció</span>'
              : `<span class="tag tag-azul">Pase activo</span><button class="btn btn-sm btn-primary" data-llego="${esc(p.codigo)}">Llegó</button>`}</div></div>`; }).join('')
          : '<p class="mut cs-vacio">Nadie ha pedido pase para hoy. Los residentes los piden por WhatsApp.</p>'}
      </section>
    </div>
    <section class="panel"><div class="panel-head"><h3>Bitácora de hoy</h3></div>${bitacora()}</section>`;
  el.querySelectorAll('[data-foto]').forEach((b) => b.addEventListener('click', () => verFoto(b.dataset.foto)));
  el.querySelectorAll('[data-entregar]').forEach((b) => b.addEventListener('click', () => entregar(C.paquetes.find((p) => p.id === b.dataset.entregar))));
  el.querySelectorAll('[data-reavisar]').forEach((b) => b.addEventListener('click', () => reavisar(C.paquetes.find((p) => p.id === b.dataset.reavisar))));
  el.querySelectorAll('[data-llego]').forEach((b) => b.addEventListener('click', () => validarPase(b.dataset.llego)));
  el.querySelectorAll('[data-autoriza]').forEach((b) => b.addEventListener('click', () => resolverVisita(b.dataset.autoriza, b.dataset.v)));
  el.querySelectorAll('[data-salio]').forEach((b) => b.addEventListener('click', async () => {
    const { error } = await db().from('accesos').update({ salida: new Date().toISOString() }).eq('id', b.dataset.salio);
    if (error) return toast(error.message, true);
    toast('Salida registrada'); cargar();
  }));
}

function chipPaquete(p) {
  if (p.estado === 'sin_contacto') return '<span class="tag tag-aviso">Sin contacto</span>';
  if (p.estado === 'avisado') return `<span class="tag tag-ok">Avisado${p.avisos > 1 ? ` ${p.avisos} veces` : ''}</span>`;
  return '<span class="tag tag-suave">Sin avisar</span>';
}
function botonAviso(p) {
  const tels = telefonos(p.unidad_id);
  if (!conectado() && tels.length) return `<a class="btn btn-sm btn-wa" target="_blank" rel="noopener" href="${waLink(tels[0], `📦 Hola, llegó un paquete de ${p.paqueteria || 'paquetería'} para el ${depto(p.unidad_id)}. Está en caseta desde las ${hora(p.recibido_en)}.`)}">Avisar</a>`;
  if (conectado() && p.estado !== 'sin_contacto') return `<button class="btn btn-sm btn-ghost" data-reavisar="${p.id}">Recordar</button>`;
  return '';
}
function filaPendiente(a) {
  const tels = telefonos(a.unidad_id);
  return `<div class="cs-visita"><div><b>${esc(a.nombre)}</b> <small class="mut">${TIPOS[a.tipo] || a.tipo}${a.placas ? ' · ' + esc(a.placas) : ''}</small>
      <div>quiere pasar al <span class="cs-depto">${esc(depto(a.unidad_id))}</span> <small class="mut">desde las ${hora(a.entrada)}</small></div>
      <small class="mut">${conectado() && tels.length ? 'Le preguntamos por WhatsApp; la respuesta aparece aquí sola.' : tels.length ? `Llama al depto: ${tels.map((t) => `<a href="tel:${t}">${t.replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3')}</a>`).join(' · ')}` : 'El depto no tiene teléfono registrado.'}</small></div>
    <div class="cs-visita-acc"><button class="btn btn-sm btn-ghost" data-autoriza="${a.id}" data-v="rechazada">No pasa</button><button class="btn btn-sm btn-primary" data-autoriza="${a.id}" data-v="caseta">Autorizado, pasa</button></div></div>`;
}
function bitacora() {
  const ev = [];
  C.paquetes.forEach((p) => {
    if (new Date(p.recibido_en) >= inicioHoy()) ev.push({ t: p.recibido_en, txt: `📦 Llegó paquete de <b>${esc(p.paqueteria || '—')}</b> para ${esc(depto(p.unidad_id))}`, quien: p.recibido_por, foto: p.foto_path });
    if (p.entregado_en) ev.push({ t: p.entregado_en, txt: `✅ Paquete de ${esc(p.paqueteria || '—')} entregado a <b>${esc(p.entregado_a || '')}</b> (${esc(depto(p.unidad_id))})`, quien: p.entregado_por });
  });
  C.accesos.filter((a) => new Date(a.entrada) >= inicioHoy()).forEach((a) => {
    const como = { pase: 'con pase', autorizada: 'autorizó el depto por WhatsApp', caseta: 'autorizado por teléfono', rechazada: 'NO autorizado', pendiente: 'esperando autorización' }[a.autorizacion];
    ev.push({ t: a.entrada, txt: `🚪 <b>${esc(a.nombre)}</b> → ${esc(depto(a.unidad_id))} · ${como}${a.respondio ? ` (${esc(a.respondio)})` : ''}${a.placas ? ` · ${esc(a.placas)}` : ''}`, quien: a.guardia,
      salida: a.autorizacion !== 'rechazada' && a.autorizacion !== 'pendiente' ? (a.salida ? `salió ${hora(a.salida)}` : a.id) : null, foto: a.foto_path });
  });
  ev.sort((a, b) => new Date(b.t) - new Date(a.t));
  if (!ev.length) return '<p class="mut cs-vacio">Todavía no hay movimientos hoy.</p>';
  return `<div class="cs-bitacora">${ev.map((e) => `<div class="cs-ev"><span class="cs-hora">${hora(e.t)}</span><span>${e.txt}${e.quien ? ` <small class="mut">· ${esc(e.quien)}</small>` : ''}</span>
    <span class="cs-ev-acc">${e.foto ? `<button class="icon-btn" data-foto="${esc(e.foto)}" aria-label="Ver foto">📷</button>` : ''}${e.salida ? (e.salida.startsWith('salió') ? `<small class="mut">${e.salida}</small>` : `<button class="btn btn-sm btn-ghost" data-salio="${e.salida}">Salió</button>`) : ''}</span></div>`).join('')}</div>`;
}

// ---------- elegir depto (escribiendo "405" sale D405) ----------
function campoDepto(id) {
  return `<label>¿Para qué depto?<input id="${id}" class="cs-buscar" inputmode="numeric" autocomplete="off" placeholder="Escribe el número, p. ej. 405" required>
    <div class="cs-opciones" id="${id}-op"></div><input type="hidden" id="${id}-v"></label>`;
}
function activarDepto(modal, id, alElegir) {
  const q = modal.querySelector('#' + id), op = modal.querySelector(`#${id}-op`), v = modal.querySelector(`#${id}-v`);
  const pinta = () => {
    const t = normalizar(q.value).replace(/\s/g, ''), dig = t.replace(/\D/g, '');
    const l = !t ? [] : C.unidades.filter((u) => normalizar(u.identificador).includes(t) || (dig && u.identificador.replace(/\D/g, '').startsWith(dig))
      || normalizar(ocupante(u.id)).includes(normalizar(q.value))).slice(0, 6);
    op.innerHTML = l.map((u) => `<button type="button" class="${v.value === u.id ? 'on' : ''}" data-u="${u.id}"><b>${esc(u.identificador)}</b> <small>${esc(ocupante(u.id))}</small></button>`).join('');
    op.querySelectorAll('[data-u]').forEach((b) => b.addEventListener('click', () => { v.value = b.dataset.u; q.value = depto(b.dataset.u); pinta(); alElegir?.(b.dataset.u); }));
    if (l.length === 1 && dig && l[0].identificador.replace(/\D/g, '') === dig && v.value !== l[0].id) { v.value = l[0].id; pinta(); alElegir?.(l[0].id); }
  };
  q.addEventListener('input', () => { v.value = ''; pinta(); });
  return () => v.value;
}
function chips(nombre, opciones, valor) {
  return `<div class="cs-chips" data-chips="${nombre}">${opciones.map(([k, t]) => `<button type="button" data-k="${esc(k)}" class="${k === valor ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>`;
}
function activarChips(modal, nombre, cambio) {
  const c = modal.querySelector(`[data-chips="${nombre}"]`); let val = c.querySelector('.on')?.dataset.k || '';
  c.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { val = b.dataset.k; c.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); cambio?.(val); }));
  return () => val;
}

// ---------- paquetes ----------
function nuevoPaquete() {
  const modal = abrirModal({
    titulo: 'Registrar paquete',
    cuerpo: `<form class="form" id="np" novalidate>
      <label class="cs-foto" id="np-foto-l"><span id="np-foto-t">📷 Tomar foto del paquete</span><input type="file" id="np-foto" accept="image/*" capture="environment" hidden></label>
      ${campoDepto('np-d')}
      <label>Paquetería${chips('paq', PAQUETERIAS.map((x) => [x, x]), 'Amazon')}</label>
      <label class="opcion-linea" id="np-subio-l" hidden><input type="checkbox" id="np-subio"> Subió directo al depto (no se queda en caseta)</label>
      <label>Nota <small>(opcional)</small><input id="np-desc" maxlength="80" placeholder="Caja grande, sobre…"></label></form>`,
    pie: `<button class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary" id="np-si">Guardar y avisar</button>`,
  });
  modal.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
  const fotoIn = modal.querySelector('#np-foto');
  fotoIn.addEventListener('change', () => {
    const f = fotoIn.files[0]; if (!f) return;
    modal.querySelector('#np-foto-l').classList.add('lista');
    modal.querySelector('#np-foto-t').innerHTML = `<img src="${URL.createObjectURL(f)}" alt="">`;
  });
  const unidad = activarDepto(modal, 'np-d');
  const paq = activarChips(modal, 'paq', (v) => { modal.querySelector('#np-subio-l').hidden = v !== 'Rappi / comida'; modal.querySelector('#np-subio').checked = !!C.reglas?.rappi_sube && v === 'Rappi / comida'; });
  modal.querySelector('#np-si').addEventListener('click', async (ev) => {
    const u = unidad(); if (!u) return toast('Elige el depto', true);
    const b = ev.currentTarget; b.disabled = true; b.textContent = 'Guardando…';
    try {
      const foto = fotoIn.files[0] ? await subirArchivo(await comprimirImagen(fotoIn.files[0], 1200, 0.7), 'paquetes') : null;
      const subio = modal.querySelector('#np-subio').checked, paqueteria = paq();
      const ahora = new Date().toISOString();
      const { data, error } = await db().from('paquetes').insert({ org_id: estado.miembro.org_id, centro_id: st.centro, unidad_id: u, paqueteria,
        descripcion: modal.querySelector('#np-desc').value.trim() || null, foto_path: foto, recibido_por: estado.miembro.nombre, recibido_en: ahora,
        ...(subio ? { estado: 'entregado', entregado_en: ahora, entregado_a: 'Subió al depto', entregado_por: estado.miembro.nombre, subio_depto: true } : {}) }).select().single();
      if (error) throw error;
      let n = 0;
      if (!subio) {
        const r = await db().rpc('encolar_aviso', { p_unidad: u, p_plantilla: 'paquete_llego', p_variables: { paqueteria, unidad: depto(u), hora: hora(ahora) },
          p_texto: `📦 Hola {nombre}, llegó un paquete de ${paqueteria} para el ${depto(u)}. Está en caseta desde las ${hora(ahora)}.`,
          p_media: foto && /^https?:/.test(foto) ? foto : null, p_ref_tabla: 'paquetes', p_ref_id: data.id, p_botones: null });
        n = r.data || 0;
        await db().from('paquetes').update({ estado: n ? 'avisado' : 'sin_contacto', avisos: n ? 1 : 0, ultimo_aviso: n ? ahora : null }).eq('id', data.id);
        procesarCola();
      }
      cerrarModal();
      toast(subio ? 'Registrado: subió al depto ✓' : n ? (conectado() ? 'Guardado y avisado por WhatsApp ✓' : 'Guardado ✓ El aviso sale cuando se conecte WhatsApp') : 'Guardado ✓ Ese depto no tiene WhatsApp registrado');
      cargar();
    } catch (e) { b.disabled = false; b.textContent = 'Guardar y avisar'; toast('No se pudo guardar: ' + e.message, true); }
  });
}

function entregar(p) {
  const nombres = [...new Set([...C.residentes.filter((r) => r.unidad_id === p.unidad_id).map((r) => r.nombre), ...C.contratos.filter((c) => c.unidad_id === p.unidad_id).map((c) => c.arrendatario)])].filter(Boolean);
  const modal = abrirModal({
    titulo: `Entregar paquete · ${depto(p.unidad_id)}`,
    cuerpo: `<form class="form" id="ep" novalidate>
      ${nombres.length ? `<div class="cs-chips">${nombres.map((n) => `<button type="button" data-n="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
      <label>¿A quién se le entregó?<input id="ep-a" maxlength="80" placeholder="Nombre de quien lo recoge"></label></form>`,
    pie: `<button class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary" id="ep-si">Entregado</button>`,
  });
  modal.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
  const a = modal.querySelector('#ep-a');
  modal.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => { a.value = b.dataset.n; modal.querySelectorAll('[data-n]').forEach((x) => x.classList.toggle('on', x === b)); }));
  modal.querySelector('#ep-si').addEventListener('click', async (ev) => {
    const quien = a.value.trim(); if (!quien) return toast('Escribe quién lo recogió', true);
    ev.currentTarget.disabled = true;
    const ahora = new Date().toISOString();
    const { error } = await db().from('paquetes').update({ estado: 'entregado', entregado_en: ahora, entregado_a: quien, entregado_por: estado.miembro.nombre }).eq('id', p.id);
    if (error) { ev.currentTarget.disabled = false; return toast(error.message, true); }
    if (p.estado === 'avisado') {
      await db().rpc('encolar_aviso', { p_unidad: p.unidad_id, p_plantilla: 'paquete_entregado', p_variables: { recibio: quien, hora: hora(ahora), guardia: estado.miembro.nombre },
        p_texto: `✅ Paquete entregado a ${quien} a las ${hora(ahora)}. Recibió: ${estado.miembro.nombre}.`, p_media: null, p_ref_tabla: 'paquetes', p_ref_id: p.id, p_botones: null });
      procesarCola();
    }
    cerrarModal(); toast('Entregado ✓'); cargar();
  });
}

async function reavisar(p) {
  const r = await db().rpc('encolar_aviso', { p_unidad: p.unidad_id, p_plantilla: 'paquete_recordatorio',
    p_variables: { paqueteria: p.paqueteria || 'paquetería', desde: cuando(p.recibido_en) },
    p_texto: `📦 Hola {nombre}, tu paquete de ${p.paqueteria || 'paquetería'} sigue en caseta desde ${cuando(p.recibido_en)}. Pasa por él cuando puedas.`,
    p_media: null, p_ref_tabla: 'paquetes', p_ref_id: p.id, p_botones: null });
  if (r.error) return toast(r.error.message, true);
  await db().from('paquetes').update({ avisos: (p.avisos || 0) + 1, ultimo_aviso: new Date().toISOString() }).eq('id', p.id);
  procesarCola(); toast('Recordatorio enviado'); cargar();
}

// ---------- visitas ----------
function nuevaVisita() {
  const modal = abrirModal({
    titulo: 'Registrar visita sin pase',
    cuerpo: `<form class="form" id="nv" novalidate>
      ${campoDepto('nv-d')}
      <label>Tipo${chips('tipo', Object.entries(TIPOS), 'invitado')}</label>
      <div class="form-2"><label>Nombre de la visita<input id="nv-n" maxlength="80" required></label>
        <label>Placas <small>(si trae carro)</small><input id="nv-p" maxlength="12" autocapitalize="characters"></label></div>
      <p class="nota" id="nv-nota">Le preguntamos al depto por WhatsApp si la deja pasar.</p></form>`,
    pie: `<button class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary" id="nv-si">Preguntar al depto</button>`,
  });
  modal.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
  const nota = modal.querySelector('#nv-nota');
  const unidad = activarDepto(modal, 'nv-d', (u) => {
    const tels = telefonos(u);
    nota.innerHTML = !tels.length ? 'Este depto no tiene teléfono registrado: confírmalo por interfón.'
      : conectado() ? 'Le preguntamos al depto por WhatsApp si la deja pasar; la respuesta aparece en caseta.'
      : `WhatsApp aún no está conectado: llama al depto (${tels.map((t) => `<a href="tel:${t}">${t}</a>`).join(', ')}) y marca lo que te diga.`;
  });
  const tipo = activarChips(modal, 'tipo');
  modal.querySelector('#nv-si').addEventListener('click', async (ev) => {
    const u = unidad(), nombre = modal.querySelector('#nv-n').value.trim();
    if (!u) return toast('Elige el depto', true);
    if (!nombre) return toast('Escribe el nombre de la visita', true);
    ev.currentTarget.disabled = true;
    const { data, error } = await db().from('accesos').insert({ org_id: estado.miembro.org_id, centro_id: st.centro, unidad_id: u, tipo: tipo(), nombre,
      placas: modal.querySelector('#nv-p').value.trim().toUpperCase() || null, autorizacion: 'pendiente', entrada: new Date().toISOString(), guardia: estado.miembro.nombre }).select().single();
    if (error) { ev.currentTarget.disabled = false; return toast(error.message, true); }
    await db().rpc('encolar_aviso', { p_unidad: u, p_plantilla: 'visita_autorizar', p_variables: { visita: nombre, unidad: depto(u) },
      p_texto: `Hola {nombre}, en caseta está ${nombre} y quiere pasar al ${depto(u)}. ¿Autorizas su entrada?`, p_media: null, p_ref_tabla: 'accesos', p_ref_id: data.id,
      p_botones: [{ id: `acceso:${data.id}:si`, titulo: 'Sí, que pase' }, { id: `acceso:${data.id}:no`, titulo: 'No' }] });
    procesarCola(); cerrarModal(); toast('Registrada. Esperando al depto'); cargar();
  });
}

async function resolverVisita(id, v) {
  const { error } = await db().from('accesos').update({ autorizacion: v, respondio: v === 'caseta' ? 'Por teléfono / interfón' : 'Caseta' }).eq('id', id);
  if (error) return toast(error.message, true);
  toast(v === 'rechazada' ? 'No pasa' : 'Puede pasar ✓'); cargar();
}

// ---------- validar pase (código de 6 dígitos o QR) ----------
function validarPase(codigo = '') {
  const modal = abrirModal({
    titulo: 'Validar pase',
    cuerpo: `<form class="form" id="vp" novalidate>
      <label>Código del pase<input id="vp-c" class="cs-codigo" inputmode="numeric" maxlength="6" autocomplete="off" value="${esc(codigo)}" placeholder="000000"></label>
      <div id="vp-r"></div></form>`,
    pie: `<button class="btn btn-ghost" data-cerrar>Cerrar</button><button class="btn btn-primary" id="vp-si">Validar</button>`,
  });
  modal.querySelector('[data-cerrar]').addEventListener('click', cerrarModal);
  const c = modal.querySelector('#vp-c'), out = modal.querySelector('#vp-r');
  const validar = async () => {
    const cod = c.value.replace(/\D/g, '');
    if (cod.length !== 6) return toast('El código tiene 6 números', true);
    const { data, error } = await db().rpc('validar_pase', { p_centro: st.centro, p_codigo: cod, p_guardia: estado.miembro.nombre });
    if (error) return toast(error.message, true);
    if (!data.ok) { out.innerHTML = `<div class="cs-res no"><b>✕ ${esc(data.motivo)}</b>${data.pase ? `<div>${esc(data.pase.nombre)} · ${esc(depto(data.pase.unidad_id))}</div>` : ''}</div>`; return; }
    const p = data.pase;
    out.innerHTML = `<div class="cs-res si"><b>✓ Pase válido: puede pasar</b><div class="cs-res-n">${esc(p.nombre)} → ${esc(data.unidad || '')}</div>
      <div>${TIPOS[p.tipo] || ''}${p.placas ? ` · <span class="mono">${esc(p.placas)}</span>` : ''}${p.vehiculo ? ' ' + esc(p.vehiculo) : ''}</div>
      <small>${conectado() ? 'Ya le avisamos al depto que llegó.' : 'Quedó en la bitácora.'}</small></div>`;
    c.value = ''; procesarCola(); cargar(true);
  };
  modal.querySelector('#vp-si').addEventListener('click', validar);
  c.addEventListener('input', () => { if (c.value.replace(/\D/g, '').length === 6) validar(); });
  if (codigo) validar();
}

export const _prueba = { telefonos, cuando };
