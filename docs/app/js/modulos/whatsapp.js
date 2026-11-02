// WhatsApp de la torre: todas las conversaciones con residentes, ligadas a su depto y a lo que se registró
// (pases, reportes). Quien atiende (Carlos) contesta aquí cuando el asistente pasa la plática a una persona.
// "Probar como residente" usa el asistente de verdad sin pasar por Meta (los mensajes quedan marcados como prueba).
import { db, sb, estado, tieneRol, esc, toast, abrirModal, cerrarModal, normalizar } from '../lib.js';

const st = { tel: null, q: '', soloHumano: false };
let raiz, reloj, msgs = [], unidades = [], cuenta = null;

const hora = (d) => {
  const x = new Date(d), hoy = new Date().toDateString();
  return x.toDateString() === hoy ? x.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
    : x.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + ' ' + x.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
};
const telBonito = (t) => String(t || '').replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3');
const depto = (id) => unidades.find((u) => u.id === id)?.identificador || '';
const ESTADO = { en_cola: 'en cola', enviado: 'enviado', entregado: 'entregado ✓', leido: 'leído ✓✓', fallo: 'no salió', simulado: 'prueba' };

// Textos para dar de alta en Meta (WhatsApp Manager → Plantillas). Categoría: Utilidad. Idioma: Español (México).
const PLANTILLAS = [
  ['paquete_llego', 'Encabezado: imagen (foto del paquete)', '📦 Hola {{1}}, llegó un paquete de {{2}} para el {{3}}. Está en caseta desde las {{4}}.'],
  ['paquete_entregado', '', '✅ Paquete entregado a {{1}} a las {{2}}. Recibió: {{3}}.'],
  ['paquete_recordatorio', '', '📦 Hola {{1}}, tu paquete de {{2}} sigue en caseta desde {{3}}. Pasa por él cuando puedas.'],
  ['visita_llego', '', '🚪 {{1}}, {{2}} llegó a caseta a las {{3}}.'],
  ['visita_autorizar', 'Botones de respuesta rápida: "Sí, que pase" y "No"', 'Hola {{1}}, en caseta está {{2}} y quiere pasar al {{3}}. ¿Autorizas su entrada?'],
  ['reporte_estado', '', 'Hola {{1}}, tu reporte {{2}} cambió: {{3}}.'],
];

export async function render(view) {
  raiz = view; clearInterval(reloj);
  document.getElementById('page-actions').innerHTML = `<button class="btn btn-ghost" id="wa-plant"><span class="cs-largo">Plantillas para Meta</span><span class="cs-corto">Plantillas</span></button>
    ${tieneRol(['administracion']) ? '<button class="btn btn-primary" id="wa-probar"><span class="cs-largo">Probar como residente</span><span class="cs-corto">Probar</span></button>' : ''}`;
  document.getElementById('wa-plant').addEventListener('click', verPlantillas);
  document.getElementById('wa-probar')?.addEventListener('click', probar);
  view.innerHTML = '<div class="cargando">Cargando…</div>';
  await cargar();
  reloj = setInterval(() => { if (!document.body.contains(raiz)) return clearInterval(reloj); if (!document.querySelector('#modal-root .modal')) cargar(true); }, 20000);
}

async function cargar(callado = false) {
  const desde = new Date(Date.now() - 30 * 864e5).toISOString();
  const [m, u, c] = await Promise.all([
    db().from('wa_mensajes').select('*').gte('creado_en', desde).order('creado_en', { ascending: false }).limit(1000),
    db().from('unidades').select('id, identificador'),
    db().from('wa_cuentas').select('*').limit(1).maybeSingle(),
  ]);
  if (m.error) { if (!callado) raiz.innerHTML = `<div class="vacio">No se pudieron cargar los mensajes: ${esc(m.error.message)}</div>`; return; }
  msgs = m.data.reverse().sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en) || (a.direccion === 'entra' ? -1 : 1)); unidades = u.data || []; cuenta = c.data;
  pintar();
}

function conversaciones() {
  const por = new Map();
  for (const m of msgs) {
    const c = por.get(m.telefono) || { tel: m.telefono, nombre: '', unidad: null, ult: null, humano: false, prueba: false, n: 0 };
    c.nombre = m.nombre || c.nombre; c.unidad = m.unidad_id || c.unidad; c.ult = m; c.n++;
    if (m.direccion === 'entra') { c.humano = !!m.variables?.humano; c.prueba = !!m.variables?.simulado; }
    por.set(m.telefono, c);
  }
  return [...por.values()].sort((a, b) => (b.humano - a.humano) || new Date(b.ult.creado_en) - new Date(a.ult.creado_en));
}

function pintar() {
  const todas = conversaciones();
  const lista = todas.filter((c) => (!st.soloHumano || c.humano) && (!st.q || normalizar(`${c.nombre} ${c.tel} ${depto(c.unidad)}`).includes(normalizar(st.q))));
  const humanos = todas.filter((c) => c.humano).length;
  if (!st.tel && lista.length && window.innerWidth > 900) st.tel = lista[0].tel;
  const sel = todas.find((c) => c.tel === st.tel);
  raiz.innerHTML = `
    <div class="panel wa-estado ${cuenta?.activo ? 'ok' : ''}">${cuenta?.activo
      ? `<b>Conectado</b> · número de la torre ${esc(cuenta.numero || '')}. El asistente ${cuenta.asistente === false ? '<b>está apagado</b>: contestan personas' : 'contesta solo y te pasa lo que no puede resolver'}.`
      : `<b>WhatsApp de la torre aún no conectado.</b> Ya funciona todo lo de adentro (caseta, pases, avisos en cola y el asistente). Falta el número con Meta: ver "Plantillas para Meta". Mientras, prueba el asistente con "Probar como residente".`}</div>
    <div class="wa-grid ${sel ? 'con-sel' : ''}">
      <section class="panel wa-lista">
        <div class="filtros filtros-sm"><input type="search" id="wa-q" placeholder="Buscar nombre, depto o teléfono" value="${esc(st.q)}" aria-label="Buscar">
          <label class="opcion-linea"><input type="checkbox" id="wa-h" ${st.soloHumano ? 'checked' : ''}> Necesitan a una persona${humanos ? ` (${humanos})` : ''}</label></div>
        ${lista.length ? lista.map((c) => `<button class="wa-conv ${c.tel === st.tel ? 'on' : ''}" data-tel="${c.tel}">
            <span class="wa-conv-top"><b>${esc(c.nombre || telBonito(c.tel))}</b><small>${hora(c.ult.creado_en)}</small></span>
            <span class="wa-conv-sub">${c.unidad ? `<span class="wa-depto">${esc(depto(c.unidad))}</span>` : '<span class="tag tag-aviso">Sin depto</span>'}
              ${c.humano ? '<span class="tag tag-neg">Necesita a una persona</span>' : ''}${c.prueba ? '<span class="tag tag-suave">prueba</span>' : ''}
              <span class="wa-ult">${c.ult.direccion === 'sale' ? '↩ ' : ''}${esc(String(c.ult.texto || '').slice(0, 70))}</span></span></button>`).join('')
          : '<p class="mut cs-vacio">Todavía no hay conversaciones.</p>'}
      </section>
      <section class="panel wa-chat">${sel ? chat(sel) : '<p class="mut cs-vacio">Elige una conversación.</p>'}</section>
    </div>`;
  raiz.querySelector('#wa-q').addEventListener('change', (e) => { st.q = e.target.value; pintar(); });
  raiz.querySelector('#wa-h').addEventListener('change', (e) => { st.soloHumano = e.target.checked; pintar(); });
  raiz.querySelectorAll('[data-tel]').forEach((b) => b.addEventListener('click', () => { st.tel = b.dataset.tel; pintar(); }));
  raiz.querySelector('#wa-volver')?.addEventListener('click', () => { st.tel = null; pintar(); });
  const f = raiz.querySelector('#wa-resp');
  f?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = f.t.value.trim(); if (!texto) return;
    f.b.disabled = true;
    const { data, error } = await sb.functions.invoke('whatsapp', { body: { accion: 'responder', telefono: st.tel, texto } });
    f.b.disabled = false;
    if (error || data?.error) return toast('No se pudo: ' + (data?.error || error.message), true);
    toast(data.enviado ? 'Enviado ✓' : 'Guardado: sale cuando se conecte WhatsApp'); cargar();
  });
  const hilo = raiz.querySelector('.wa-hilo'); if (hilo) hilo.scrollTop = hilo.scrollHeight;
}

function chat(c) {
  const ms = msgs.filter((m) => m.telefono === c.tel);
  const motivo = [...ms].reverse().find((m) => m.direccion === 'entra' && m.variables?.humano)?.variables?.motivo;
  return `<div class="wa-chat-head"><button class="btn btn-sm btn-ghost wa-volver" id="wa-volver">←</button>
      <div><b>${esc(c.nombre || 'Sin nombre')}</b> <small class="mut">${telBonito(c.tel)}${c.unidad ? ' · ' + esc(depto(c.unidad)) : ' · número no registrado en ningún depto'}</small></div></div>
    ${motivo ? `<div class="wa-motivo">El asistente pide a una persona: ${esc(motivo)}</div>` : ''}
    <div class="wa-hilo">${ms.map((m) => `<div class="wa-b ${m.direccion}"><div class="wa-txt">${esc(m.texto || (m.plantilla ? 'Aviso: ' + m.plantilla : ''))}</div>
      ${m.variables?.hechos?.length ? `<div class="wa-hecho">${m.variables.hechos.map((h) => '✓ ' + esc(h)).join('<br>')}</div>` : ''}
      <small>${hora(m.creado_en)}${m.direccion === 'sale' ? ` · ${m.variables?.por ? esc(m.variables.por) : m.ref_tabla ? 'aviso automático' : 'asistente'} · ${ESTADO[m.estado] || m.estado}` : ''}${m.error ? ` · ${esc(m.error)}` : ''}</small></div>`).join('')}</div>
    ${c.prueba ? '<p class="nota">Conversación de prueba: no se mandó a nadie.</p>' : `<form id="wa-resp" class="wa-resp"><textarea name="t" rows="2" maxlength="1500" placeholder="Escribe tu respuesta…"></textarea><button name="b" class="btn btn-wa">Enviar</button></form>`}`;
}

function verPlantillas() {
  abrirModal({ titulo: 'Plantillas para dar de alta en Meta', ancho: true,
    cuerpo: `<p class="nota">En WhatsApp Manager → Plantillas de mensajes → Crear. Categoría <b>Utilidad</b>, idioma <b>Español (México)</b>, con el nombre exacto.
      Son los avisos que salen cuando el residente no ha escrito en las últimas 24 horas. Cuando Meta las apruebe, se marcan como aprobadas aquí.</p>
      <div class="wa-plant">${PLANTILLAS.map(([n, extra, t]) => `<div><b class="mono">${n}</b>${(cuenta?.plantillas_aprobadas || []).includes(n) ? ' <span class="tag tag-ok">Aprobada</span>' : ''}
        ${extra ? `<small class="mut">${esc(extra)}</small>` : ''}<pre>${esc(t)}</pre></div>`).join('')}</div>` });
}

// ---------- probar el asistente como si fueras un residente ----------
async function probar() {
  const { data: rs } = await db().from('residentes').select('unidad_id, nombre, telefono').eq('activo', true).not('telefono', 'is', null).limit(1000);
  const ops = (rs || []).map((r) => ({ ...r, tel: String(r.telefono).replace(/\D/g, '').slice(-10), d: depto(r.unidad_id) })).filter((r) => r.tel.length === 10 && r.d)
    .sort((a, b) => a.d.localeCompare(b.d, 'es', { numeric: true }));
  const modal = abrirModal({ titulo: 'Probar como residente', ancho: true,
    cuerpo: `<div class="form"><label>Escribir como<select id="pr-r">${ops.map((r) => `<option value="${r.tel}">${esc(r.d)} · ${esc(r.nombre)}</option>`).join('')}<option value="0000000000">Número no registrado</option></select></label>
      <div class="wa-hilo wa-prueba" id="pr-h"><p class="mut">Escribe como lo haría el residente, p. ej. "viene mi hermana Ana a las 7, trae carro" o "hay una fuga en el baño".
        Lo que pida se registra de verdad (pases, reportes): bórralo o cancélalo después si era solo prueba.</p></div>
      <form id="pr-f" class="wa-resp"><textarea name="t" rows="2" maxlength="1500" placeholder="Mensaje del residente…"></textarea><button name="b" class="btn btn-wa">Mandar</button></form></div>` });
  const h = modal.querySelector('#pr-h'), f = modal.querySelector('#pr-f');
  const burbuja = (dir, t) => { h.insertAdjacentHTML('beforeend', `<div class="wa-b ${dir}"><div class="wa-txt">${esc(t)}</div></div>`); h.scrollTop = h.scrollHeight; };
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = f.t.value.trim(); if (!texto) return;
    burbuja('entra', texto); f.t.value = ''; f.b.disabled = true;
    burbuja('sale', '…');
    const { data, error } = await sb.functions.invoke('whatsapp', { body: { accion: 'simular', telefono: modal.querySelector('#pr-r').value, texto } });
    h.lastElementChild.remove(); f.b.disabled = false;
    if (error || data?.error) return burbuja('sale', 'Error: ' + (data?.error || error.message));
    (data.respuestas || []).forEach((t) => burbuja('sale', t));
  });
  f.t.focus();
  // al cerrar, se ven las conversaciones de prueba en la lista
  const obs = new MutationObserver(() => { if (!document.body.contains(modal)) { obs.disconnect(); cargar(true); } });
  obs.observe(document.getElementById('modal-root'), { childList: true });
}

export const _ = { cerrarModal, estado };
