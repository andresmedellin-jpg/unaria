// Mensajes: WhatsApp, Instagram y Facebook en una sola bandeja. Cada conversación trae su canal, si vino de un anuncio
// (Meta manda de cuál cuando el anuncio lleva a un mensaje) y una etiqueta que pone la IA: evento, pedido u otro.
// Se contesta desde aquí (la IA sugiere la respuesta; la persona la revisa y la manda) o desde las apps de siempre.
// Una solicitud de evento se vuelve ficha del calendario con un clic ("Crear evento desde esta conversación").
// Tablas: conversaciones, mensajes, anuncios, eventos.
import { db, esc, toast } from '../lib.js';
import { V, CANALES, estilos, icoIA, hace, fichaEvento, tagEstado, fechaCorta, ir, paramHash } from './eventos-comun.js';

const ETIQ = { evento: 'Evento', pedido: 'Pedido a domicilio', otro: 'Otro' };
const st = { sel: null, filtro: 'todos', canal: '', sugerir: null };
let raiz, convs = [], msgs = [], anuncios = [], eventos = [];

export async function render(view) {
  raiz = view; estilos();
  document.getElementById('page-actions').innerHTML = V.chat ? `<a class="btn btn-ghost" href="${esc(V.chat)}" target="_blank" rel="noopener">Probar el menú por chat</a>` : '';
  st.sel = paramHash('c') || st.sel;
  await cargar();
}

async function cargar() {
  const [c, m, a, e] = await Promise.all([
    db().from('conversaciones').select('*').order('ultimo_en', { ascending: false }),
    db().from('mensajes').select('*').order('creado_en'),
    db().from('anuncios').select('*'),
    db().from('eventos').select('id, estado, fecha, tipo, personas, conversacion_id'),
  ]);
  if (c.error) { raiz.innerHTML = `<div class="vacio">No se pudieron cargar los mensajes: ${esc(c.error.message)}</div>`; return; }
  convs = c.data || []; msgs = m.data || []; anuncios = a.data || []; eventos = e.data || [];
  if (!st.sel && window.innerWidth > 900) st.sel = convs[0]?.id || null;
  pintar();
}
const anuncio = (id) => anuncios.find((a) => a.id === id);
const avatar = (c) => { const k = CANALES[c.canal] || CANALES.pagina; return `<span class="av" style="background:${k.c}">${k.ico}${c.por_contestar && !c.leida ? '<i></i>' : ''}</span>`; };

function pintar() {
  const hoy = new Date().toDateString();
  const deHoy = msgs.filter((m) => m.de === 'cliente' && new Date(m.creado_en).toDateString() === hoy).length;
  const porContestar = convs.filter((c) => c.por_contestar).length;
  const evs = convs.filter((c) => c.etiqueta === 'evento');
  const sinFicha = evs.filter((c) => !c.evento_id).length;
  const deAds = convs.filter((c) => c.anuncio_id).length;

  let lista = convs;
  if (st.filtro !== 'todos') lista = lista.filter((c) => (st.filtro === 'anuncio' ? c.anuncio_id : st.filtro === 'contestar' ? c.por_contestar : c.etiqueta === st.filtro));
  if (st.canal) lista = lista.filter((c) => c.canal === st.canal);
  const sel = convs.find((c) => c.id === st.sel);

  raiz.innerHTML = `
    <div class="chb-kpis">
      <div class="chb-kpi"><b>${deHoy}</b><span>Mensajes de clientes hoy</span></div>
      <div class="chb-kpi${porContestar ? ' alerta' : ''}"><b>${porContestar}</b><span>Conversaciones por contestar</span></div>
      <div class="chb-kpi${sinFicha ? ' alerta' : ''}"><b>${evs.length}</b><span>Piden evento · ${sinFicha} sin ficha</span></div>
      <div class="chb-kpi"><b>${deAds}</b><span>Llegaron de un anuncio</span></div>
    </div>
    <div class="chb-bandeja${sel ? ' con-sel' : ''}">
      <div class="chb-izq">
        <div class="chb-filtros">
          ${[['todos', 'Todas'], ['contestar', 'Por contestar'], ['evento', 'Eventos'], ['pedido', 'Pedidos'], ['anuncio', 'De anuncios'], ['otro', 'Otros']]
            .map(([k, t]) => `<button data-f="${k}" class="${st.filtro === k ? 'on' : ''}">${t}</button>`).join('')}
        </div>
        <div class="chb-filtros">
          ${['', 'whatsapp', 'instagram', 'facebook'].map((k) => `<button data-c="${k}" class="${st.canal === k ? 'on' : ''}">${k ? CANALES[k].ico + CANALES[k].t : 'Los 3 canales'}</button>`).join('')}
        </div>
        <div class="chb-lista">${lista.map(fila).join('') || '<div class="vacio">Nada con este filtro.</div>'}</div>
      </div>
      <div class="chb-chat">${sel ? chat(sel) : '<div class="vacio">Escoge una conversación.</div>'}</div>
    </div>
    <p class="chb-nota">${esc(V.dueno)} contesta los tres canales desde aquí o desde sus apps de siempre; todo queda en la misma conversación. La IA sugiere la respuesta, pero no manda nada sola.</p>`;

  raiz.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { st.filtro = b.dataset.f; pintar(); }));
  raiz.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { st.canal = b.dataset.c; pintar(); }));
  raiz.querySelectorAll('[data-conv]').forEach((b) => b.addEventListener('click', () => abrir(b.dataset.conv)));
  raiz.querySelector('.chb-volver')?.addEventListener('click', () => { st.sel = null; history.replaceState(null, '', ir('bandeja')); pintar(); });
  raiz.querySelector('#chb-crear')?.addEventListener('click', () => crearEvento(sel));
  raiz.querySelector('#chb-enviar')?.addEventListener('click', () => enviar(sel));
  raiz.querySelector('#chb-sugerir')?.addEventListener('click', () => { st.sugerir = sel.id; pintar(); raiz.querySelector('#chb-texto')?.focus(); });
  raiz.querySelector('#chb-texto')?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) enviar(sel); });
  raiz.querySelector('#chb-etiq')?.addEventListener('change', async (ev) => {
    const v = ev.target.value; await db().from('conversaciones').update({ etiqueta: v }).eq('id', sel.id); sel.etiqueta = v; toast('Etiqueta cambiada ✓'); pintar();
  });
  const hilo = raiz.querySelector('.chb-hilo'); if (hilo) hilo.scrollTop = hilo.scrollHeight;
}

function fila(c) {
  const ad = anuncio(c.anuncio_id), k = CANALES[c.canal] || CANALES.pagina;
  return `<button class="chb-conv${c.id === st.sel ? ' on' : ''}" data-conv="${c.id}">
    ${avatar(c)}
    <span style="min-width:0">
      <span class="top"><b>${esc(c.contacto)}</b><small>${esc(hace(c.ultimo_en))}</small></span>
      <span class="ult">${c.por_contestar ? '' : '<span style="color:var(--text-3)">Tú: </span>'}${esc(c.ultimo)}</span>
      <span class="tags"><span class="chb-et ${c.etiqueta}">${esc(ETIQ[c.etiqueta] || 'Otro')}</span>${ad ? `<span class="chb-ad">Anuncio · ${esc(ad.nombre)}</span>` : ''}<small style="font-size:11.5px">${esc(k.t)}</small></span>
    </span>
  </button>`;
}

function chat(c) {
  const ad = anuncio(c.anuncio_id), k = CANALES[c.canal] || CANALES.pagina;
  const hilo = msgs.filter((m) => m.conversacion_id === c.id);
  const ev = eventos.find((e) => e.id === c.evento_id || e.conversacion_id === c.id);
  return `
    <div class="chb-chat-head">
      <button class="btn btn-ghost btn-sm chb-volver">‹ Mensajes</button>
      <span class="av" style="background:${k.c}">${k.ico}</span>
      <span class="q"><b>${esc(c.contacto)}</b><small>${esc(k.t)}${c.telefono ? ' · ' + esc(String(c.telefono).replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3')) : ''}${ad ? ` · llegó del anuncio <b>${esc(ad.nombre)}</b> (${esc(ad.plataforma)})` : ''}</small></span>
      <label style="display:flex;gap:6px;align-items:center;font-size:12.5px;color:var(--text-2)">${icoIA}<select id="chb-etiq" style="height:30px">${Object.entries(ETIQ).map(([v, t]) => `<option value="${v}"${v === c.etiqueta ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>
    ${ev ? `<div class="chb-hecho"><span>✓ Ya está en el calendario: <b>${esc(ev.tipo)} · ${esc(ev.personas ?? '?')} personas · ${esc(fechaCorta(ev.fecha))}</b> ${tagEstado(ev.estado)}</span><a class="btn btn-ghost btn-sm" href="${ir('eventos', 'e=' + ev.id)}">Ver evento</a></div>`
      : c.etiqueta === 'evento' ? `<div class="chb-ia-caja" id="chb-ia-caja"><p><b>${icoIA} Esta conversación pide un evento</b>La IA puede llenar la ficha con lo que dice el chat: fecha, hora, personas, lugar y paquete.</p><button class="btn btn-primary" id="chb-crear">Crear evento desde esta conversación</button></div>` : ''}
    <div class="chb-hilo">${hilo.map((m) => `<div class="chb-b ${m.de}">${esc(m.texto)}<small>${m.de === 'javi' ? esc(V.dueno) + ' · ' : ''}${new Date(m.creado_en).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}</small></div>`).join('')}</div>
    ${responder(c)}`;
}

// Caja para contestar: sale por el mismo canal (WhatsApp con el número del negocio, DM de Instagram o Messenger).
// La IA deja escrita una respuesta sugerida; la persona la revisa, la cambia si quiere y la manda. Nada sale solo.
function responder(c) {
  const ultCliente = [...msgs].reverse().find((m) => m.conversacion_id === c.id && m.de === 'cliente');
  const horas = ultCliente ? (Date.now() - new Date(ultCliente.creado_en)) / 36e5 : 0;
  const fuera = horas > (c.canal === 'whatsapp' ? 24 : 168);
  const app = c.canal === 'whatsapp' ? 'WhatsApp' : c.canal === 'instagram' ? 'Instagram' : 'Messenger';
  const sugerida = c.por_contestar || st.sugerir === c.id ? (c.sugerida || '') : '';
  return `<div class="chb-resp">
    ${sugerida ? `<span class="chb-sug">${icoIA} Respuesta sugerida por la IA · revísala y cámbiala si quieres</span>` : ''}
    <textarea id="chb-texto" rows="3" placeholder="Escribe tu respuesta…">${esc(sugerida)}</textarea>
    <div class="chb-resp-pie">
      <small>${fuera ? (c.canal === 'whatsapp' ? 'Pasaron más de 24 h: WhatsApp solo deja mandar una plantilla aprobada.' : 'Pasaron más de 7 días: Meta ya no deja contestar este mensaje.')
        : `Sale por ${app}${c.canal === 'whatsapp' ? ' con el número del negocio y también aparece en tu app de WhatsApp Business' : ''}.`}</small>
      <span style="display:flex;gap:6px">${c.sugerida && !sugerida ? `<button class="btn btn-ghost btn-sm" id="chb-sugerir">${icoIA} Sugerir respuesta</button>` : ''}
      <button class="btn btn-primary" id="chb-enviar">Enviar</button></span>
    </div>
  </div>`;
}

async function enviar(c) {
  const caja = raiz.querySelector('#chb-texto'), texto = caja.value.trim();
  if (!texto) return toast('Escribe la respuesta', true);
  raiz.querySelector('#chb-enviar').disabled = true;
  const ahora = new Date().toISOString();
  const r = await db().from('mensajes').insert({ conversacion_id: c.id, de: 'javi', texto, creado_en: ahora, por: 'portal' }).select().single();
  if (r.error) { raiz.querySelector('#chb-enviar').disabled = false; return toast(r.error.message, true); }
  await db().from('conversaciones').update({ ultimo: texto, ultimo_en: ahora, por_contestar: false, leida: true, sugerida: null }).eq('id', c.id);
  toast(`Enviado por ${(CANALES[c.canal] || CANALES.pagina).t} ✓`);
  st.sugerir = null;
  await cargar();
}

async function abrir(id) {
  st.sel = id;
  history.replaceState(null, '', ir('bandeja', 'c=' + id));
  const c = convs.find((x) => x.id === id);
  if (c && !c.leida) { c.leida = true; db().from('conversaciones').update({ leida: true }).eq('id', id); }
  pintar();
}

// La IA lee la conversación y llena la ficha. En el demo la lectura ya viene hecha (c.extraccion);
// en el sistema real la hace Claude con el historial del chat.
async function crearEvento(c) {
  const caja = raiz.querySelector('#chb-ia-caja');
  caja.innerHTML = '<span class="chb-cargando-ia"><i></i>La IA está leyendo la conversación…</span>';
  await new Promise((r) => setTimeout(r, 1400));
  const x = c.extraccion || {};
  const ia = Object.keys(x).filter((k) => x[k] != null && x[k] !== '');
  const ad = anuncio(c.anuncio_id);
  const contacto = c.contacto.startsWith('@') ? c.contacto : c.contacto;
  fichaEvento({
    titulo: 'Nuevo evento desde la conversación',
    ia: [...ia, 'contacto', ...(c.telefono ? ['telefono'] : [])],
    evento: { ...x, contacto, telefono: c.telefono || null, canal: CANALES[c.canal]?.t || 'WhatsApp', anuncio_id: c.anuncio_id || null, anuncio: ad?.nombre, conversacion_id: c.id, estado: 'solicitud' },
    alGuardar: async (ev) => { await db().from('conversaciones').update({ evento_id: ev.id }).eq('id', c.id); await cargar(); },
  });
  pintar();
}
