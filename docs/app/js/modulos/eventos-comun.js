// Lo que comparten Mensajes (bandeja), Eventos y Anuncios: estados, canales, la ficha del evento y los estilos.
import { db, esc, toast, abrirModal, cerrarModal, fmt } from '../lib.js';
import { MARCA } from '../config.js';

export const V = Object.assign({
  negocio: 'el negocio', dueno: 'el dueño', pagina: '',
  sucursales: [], tipos: ['Cumpleaños', 'Boda o XV', 'Empresarial', 'Reunión', 'Otro'], paquetes: ['Básico', 'Completo'],
}, MARCA.chilabike || MARCA.eventos || {});

export const ESTADOS = {
  solicitud:  { t: 'Solicitud',  c: '#B54708', bg: '#FEF0C7', sigue: ['cotizado', 'cancelado'], ayuda: 'Llegó y falta mandarle precio' },
  cotizado:   { t: 'Cotizado',   c: '#1D4ED8', bg: '#DBEAFE', sigue: ['apartado', 'cancelado'], ayuda: 'Ya tiene precio, falta el anticipo' },
  apartado:   { t: 'Apartado',   c: '#7C3AED', bg: '#EDE9FE', sigue: ['confirmado', 'cancelado'], ayuda: 'Pagó anticipo: la fecha es suya' },
  confirmado: { t: 'Confirmado', c: '#067647', bg: '#D1FADF', sigue: ['realizado', 'cancelado'], ayuda: 'Todo listo para el día' },
  realizado:  { t: 'Realizado',  c: '#475467', bg: '#EAECF0', sigue: [], ayuda: 'Ya pasó' },
  cancelado:  { t: 'Cancelado',  c: '#98A2B3', bg: '#F2F4F7', sigue: ['solicitud'], ayuda: 'No se hizo' },
};
export const ORDEN = ['solicitud', 'cotizado', 'apartado', 'confirmado', 'realizado', 'cancelado'];
export const VENDIDOS = ['apartado', 'confirmado', 'realizado'];

const ico = (d, extra = '') => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const CANALES = {
  whatsapp:  { t: 'WhatsApp',  c: '#1F8F55', ico: ico('<path d="M20 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.2A8.5 8.5 0 1 1 20 11.5z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5"/>') },
  instagram: { t: 'Instagram', c: '#C13584', ico: ico('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17 7v.01"/>') },
  facebook:  { t: 'Facebook',  c: '#1877F2', ico: ico('<path d="M14.5 8.5H17V5h-2.5A3.5 3.5 0 0 0 11 8.5V11H8.5v3.5H11V21h3.5v-6.5H17l.5-3.5h-3V8.8c0-.2.1-.3.3-.3z"/>') },
  pagina:    { t: 'Página',    c: '#C9500C', ico: ico('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5v.01M10 6.5v.01"/>') },
  google:    { t: 'Google',    c: '#4A4A4A', ico: ico('<path d="M20 12.2c0-.6 0-1.1-.1-1.7H12v3.3h4.5a4 4 0 0 1-1.7 2.6v2.1h2.8c1.6-1.5 2.4-3.7 2.4-6.3z"/><path d="M12 21c2.3 0 4.2-.8 5.6-2.1l-2.8-2.1c-.8.5-1.7.8-2.8.8-2.2 0-4-1.5-4.7-3.4H4.4v2.2A9 9 0 0 0 12 21z"/>') },
};
export const canalDe = (txt) => CANALES[String(txt || '').toLowerCase().replace('á', 'a')] || CANALES.pagina;
export const icoIA = ico('<path d="M10 3.5l1.6 4.4a3 3 0 0 0 1.8 1.8l4.4 1.6-4.4 1.6a3 3 0 0 0-1.8 1.8L10 19.1l-1.6-4.4a3 3 0 0 0-1.8-1.8L2.2 11.3l4.4-1.6a3 3 0 0 0 1.8-1.8z"/><path d="M18.5 2.5v4M16.5 4.5h4"/>');

export const tagEstado = (e) => { const s = ESTADOS[e] || ESTADOS.solicitud; return `<span class="chb-est" style="color:${s.c};background:${s.bg}">${s.t}</span>`; };
export const fechaLarga = (f) => { if (!f) return 'Sin fecha'; const t = new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); };
export const fechaCorta = (f) => f ? new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Sin fecha';
export const horaBonita = (h) => { if (!h) return ''; const [H, M] = h.split(':').map(Number); const d = new Date(); d.setHours(H, M); return d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }); };
export const telBonito = (t) => String(t || '').replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3');
export const hace = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 6e4);
  if (m < 1) return 'ahora'; if (m < 60) return `hace ${m} min`; const h = Math.round(m / 60); if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24); return d === 1 ? 'ayer' : `hace ${d} días`;
};
// Liga a otro módulo del mismo negocio (con MARCA.negocios los ids llevan el negocio: chilabike-eventos)
const prefijo = () => (location.hash.match(/^#\/([a-z0-9]+-)(?:bandeja|eventos|anuncios)\b/) || [])[1] || '';
export const ir = (id, q = '') => `${location.pathname}${location.search}#/${prefijo()}${id}${q ? '?' + q : ''}`;
export const paramHash = (k) => new URLSearchParams(location.hash.split('?')[1] || '').get(k);

// ---------- ficha del evento (nuevo, desde una conversación o para editar) ----------
// ia: lista de campos que llenó la IA (se marcan para que Javi los revise)
export function fichaEvento({ evento = {}, ia = [], titulo, alGuardar }) {
  const e = { estado: 'solicitud', ...evento };
  const marca = (k) => ia.includes(k) ? ' class="chb-ia"' : '';
  const op = (l, v) => l.map((x) => `<option${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('');
  const m = abrirModal({
    titulo: titulo || (e.id ? 'Evento' : 'Nuevo evento'), ancho: true,
    cuerpo: `<form class="form chb-ficha" id="chb-f">
      ${ia.length ? `<p class="chb-ia-nota">${icoIA} La IA llenó los campos marcados con lo que dice la conversación. Revísalos antes de guardar.</p>` : ''}
      <div class="form-3">
        <label${marca('tipo')}>Tipo<select name="tipo">${op(V.tipos, e.tipo)}</select></label>
        <label${marca('fecha')}>Fecha<input type="date" name="fecha" value="${esc(e.fecha || '')}"></label>
        <label${marca('hora')}>Hora<input type="time" name="hora" value="${esc(e.hora || '')}"></label>
      </div>
      <div class="form-3">
        <label${marca('personas')}>Personas<input type="number" name="personas" min="1" value="${esc(e.personas ?? '')}"></label>
        <label${marca('paquete')}>Paquete<select name="paquete"><option value="">Por definir</option>${op(V.paquetes, e.paquete)}</select></label>
        <label${marca('sucursal')}>Sucursal que surte<select name="sucursal"><option value="">Por definir</option>${op(V.sucursales, e.sucursal)}</select></label>
      </div>
      <label${marca('direccion')}>Lugar o dirección<input type="text" name="direccion" value="${esc(e.direccion || '')}"></label>
      <div class="form-2">
        <label${marca('contacto')}>Contacto<input type="text" name="contacto" value="${esc(e.contacto || '')}"></label>
        <label${marca('telefono')}>Teléfono<input type="tel" name="telefono" value="${esc(telBonito(e.telefono || ''))}"></label>
      </div>
      <div class="form-3">
        <label>Monto total<input type="number" name="monto" min="0" step="100" value="${esc(e.monto ?? '')}" placeholder="$"></label>
        <label>Anticipo recibido<input type="number" name="anticipo" min="0" step="100" value="${esc(e.anticipo || '')}" placeholder="$"></label>
        <label>Estado<select name="estado">${ORDEN.map((k) => `<option value="${k}"${k === e.estado ? ' selected' : ''}>${ESTADOS[k].t}</option>`).join('')}</select></label>
      </div>
      <label${marca('notas')}>Notas<textarea name="notas" rows="3">${esc(e.notas || '')}</textarea></label>
      ${e.canal ? `<p class="chb-origen">Llegó por <b>${esc(canalDe(e.canal).t)}</b>${e.anuncio ? ` · anuncio <b>${esc(e.anuncio)}</b>` : ''}${e.utm && Object.keys(e.utm).length ? ` · ${esc(Object.entries(e.utm).map(([k, v]) => `${k}=${v}`).join(' · '))}` : ''}</p>` : ''}
    </form>`,
    pie: `<button class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary" id="chb-guardar">${e.id ? 'Guardar cambios' : 'Crear evento'}</button>`,
  });
  m.querySelector('[data-cerrar]')?.addEventListener('click', cerrarModal);
  m.querySelector('#chb-guardar').addEventListener('click', async (ev) => {
    const f = new FormData(m.querySelector('#chb-f')), v = {};
    f.forEach((x, k) => { v[k] = String(x).trim() || null; });
    ['personas', 'monto', 'anticipo'].forEach((k) => { v[k] = v[k] == null ? (k === 'anticipo' ? 0 : null) : Number(v[k]); });
    v.telefono = v.telefono ? v.telefono.replace(/\D/g, '').slice(-10) : null;
    if (!v.fecha) return toast('Pon la fecha del evento', true);
    ev.currentTarget.disabled = true;
    const base = { ...e }; delete base.anuncio; delete base.nuevo;
    const fila = { ...base, ...v };
    const r = e.id ? await db().from('eventos').update(v).eq('id', e.id).select().single()
      : await db().from('eventos').insert(fila).select().single();
    if (r.error) { ev.currentTarget.disabled = false; return toast(r.error.message, true); }
    cerrarModal();
    toast(e.id ? 'Evento actualizado ✓' : 'Evento creado y agregado al calendario ✓');
    alGuardar?.(r.data);
  });
  return m;
}

export const cambiarEstado = async (evento, nuevo) => {
  const r = await db().from('eventos').update({ estado: nuevo }).eq('id', evento.id).select().single();
  if (r.error) { toast(r.error.message, true); return null; }
  toast(`${ESTADOS[nuevo].t} ✓`);
  return r.data;
};

export const dinero = (n) => (n == null || n === '' ? '—' : fmt(n).replace('.00', ''));

// ---------- estilos de los tres módulos ----------
export function estilos() {
  if (document.getElementById('chb-estilos')) return;
  const s = document.createElement('style');
  s.id = 'chb-estilos';
  s.textContent = `
  .chb-est { display:inline-flex; align-items:center; border-radius:999px; padding:2px 9px; font-size:12px; font-weight:700; white-space:nowrap; }
  .chb-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-bottom:14px; }
  .chb-kpi { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:12px 14px; display:grid; gap:2px; }
  .chb-kpi b { font-size:24px; line-height:1.15; letter-spacing:-.01em; }
  .chb-kpi span { font-size:12.5px; color:var(--text-2); }
  .chb-kpi.alerta { border-color:#F5C77E; background:#FFFAEB; }
  .chb-aviso { display:flex; gap:14px; align-items:flex-start; background:#FFFAEB; border:1px solid #F5C77E; border-radius:10px; padding:12px 14px; margin-bottom:14px; }
  .chb-aviso .wa { flex:1; min-width:0; display:grid; gap:8px; }
  .chb-wa-b { background:#fff; border-radius:3px 10px 10px 10px; padding:9px 11px; font-size:13.5px; white-space:pre-line; box-shadow:0 1px 1px rgba(0,0,0,.08); max-width:420px; }
  .chb-barra { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between; margin-bottom:12px; }
  .chb-seg { display:inline-flex; background:var(--surface-2); border:1px solid var(--border); border-radius:9px; padding:3px; gap:2px; }
  .chb-seg button { font:inherit; font-size:13px; font-weight:600; border:0; background:transparent; color:var(--text-2); padding:6px 12px; border-radius:7px; cursor:pointer; }
  .chb-seg button.on { background:var(--surface); color:var(--text); box-shadow:0 1px 2px rgba(0,0,0,.08); }
  .chb-mesnav { display:flex; align-items:center; gap:8px; } .chb-mesnav b { font-size:16px; min-width:150px; text-align:center; }
  .chb-cal { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); border:1px solid var(--border); border-radius:10px; overflow:hidden; background:var(--surface); }
  .chb-cal .dn { font-size:11.5px; font-weight:700; color:var(--text-3); text-transform:uppercase; padding:8px; border-bottom:1px solid var(--border); background:var(--surface-2); }
  .chb-cal .d { min-height:104px; padding:6px; border-right:1px solid var(--border); border-bottom:1px solid var(--border); display:flex; flex-direction:column; gap:4px; min-width:0; }
  .chb-cal .d:nth-child(7n) { border-right:0; }
  .chb-cal .d.fuera { background:#FBFBFA; } .chb-cal .d.fuera .num { color:#C8C8C8; }
  .chb-cal .d.hoy .num { background:var(--primary); color:#fff; }
  .chb-cal .num { font-size:12px; font-weight:700; width:22px; height:22px; border-radius:50%; display:grid; place-items:center; color:var(--text-2); }
  .chb-ev { display:block; width:100%; text-align:left; font:inherit; font-size:12px; line-height:1.25; border:0; border-left:3px solid; border-radius:5px; padding:4px 6px; cursor:pointer; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
  .chb-ev.cancelado { text-decoration:line-through; opacity:.7; }
  .chb-ev.nuevo { box-shadow:0 0 0 2px #F79009; }
  .chb-sem { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:8px; }
  .chb-sem .col { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:8px; min-height:220px; display:flex; flex-direction:column; gap:6px; min-width:0; }
  .chb-sem .col h4 { margin:0 0 4px; font-size:12.5px; color:var(--text-2); text-transform:capitalize; } .chb-sem .col.hoy h4 { color:var(--primary); }
  .chb-card { text-align:left; font:inherit; background:var(--surface); border:1px solid var(--border); border-left:4px solid; border-radius:8px; padding:9px 10px; cursor:pointer; display:grid; gap:3px; min-width:0; }
  .chb-card:hover { box-shadow:0 2px 10px -4px rgba(0,0,0,.18); }
  .chb-card b { font-size:13.5px; overflow:hidden; text-overflow:ellipsis; } .chb-card small { font-size:12px; color:var(--text-2); }
  .chb-cols { display:grid; grid-template-columns:repeat(5,minmax(220px,1fr)); gap:10px; overflow-x:auto; padding-bottom:6px; }
  .chb-colest { background:var(--surface-2); border-radius:10px; padding:8px; display:flex; flex-direction:column; gap:8px; min-width:0; }
  .chb-colest h4 { margin:2px 2px 2px; font-size:13px; display:flex; justify-content:space-between; align-items:center; gap:6px; }
  .chb-colest .ay { font-size:11.5px; color:var(--text-3); margin:-4px 2px 2px; }
  .chb-ficha label.chb-ia input, .chb-ficha label.chb-ia select, .chb-ficha label.chb-ia textarea { background:#F5F0FF; border-color:#B9A6F5; }
  .chb-ficha label.chb-ia { position:relative; }
  .chb-ficha label.chb-ia::after { content:"IA"; position:absolute; top:0; right:0; font-size:10px; font-weight:800; color:#6D28D9; letter-spacing:.06em; }
  .chb-ia-nota { display:flex; gap:8px; align-items:center; background:#F5F0FF; color:#5B21B6; border-radius:8px; padding:9px 12px; font-size:13px; font-weight:600; margin:0; }
  .chb-origen { font-size:12.5px; color:var(--text-2); margin:0; }
  .chb-det { display:grid; gap:12px; }
  .chb-det dl { display:grid; grid-template-columns:130px minmax(0,1fr); gap:6px 12px; margin:0; font-size:14px; } .chb-det dt { color:var(--text-3); } .chb-det dd { margin:0; font-weight:600; }
  .chb-det .acc { display:flex; flex-wrap:wrap; gap:8px; }
  /* bandeja */
  .chb-bandeja { display:grid; grid-template-columns:minmax(290px,380px) minmax(0,1fr); gap:14px; align-items:start; }
  .chb-lista { display:grid; gap:6px; max-height:calc(100vh - 250px); overflow:auto; padding-right:2px; }
  .chb-filtros { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
  .chb-filtros button { font:inherit; font-size:12.5px; font-weight:600; border:1px solid var(--border); background:var(--surface); color:var(--text-2); border-radius:999px; padding:5px 11px; cursor:pointer; display:inline-flex; gap:5px; align-items:center; }
  .chb-filtros button.on { background:var(--text); color:#fff; border-color:var(--text); }
  .chb-conv { display:grid; grid-template-columns:36px minmax(0,1fr); gap:10px; text-align:left; font:inherit; color:var(--text); background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:10px 12px; cursor:pointer; }
  .chb-conv.on { border-color:var(--primary); box-shadow:inset 0 0 0 1px var(--primary); }
  .chb-conv .av { width:36px; height:36px; border-radius:50%; display:grid; place-items:center; color:#fff; position:relative; }
  .chb-conv .av i { position:absolute; right:-2px; bottom:-2px; width:12px; height:12px; border-radius:50%; background:#F04438; border:2px solid #fff; }
  .chb-conv > span { min-width:0; display:block; } .chb-conv .top { display:flex; justify-content:space-between; gap:8px; } .chb-conv .top b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .chb-conv .top small { white-space:nowrap; }
  .chb-conv .ult { display:block; font-size:13px; color:var(--text-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .chb-conv .tags { display:flex; flex-wrap:wrap; gap:5px; margin-top:4px; }
  .chb-et { display:inline-flex; gap:4px; align-items:center; border-radius:999px; padding:1px 8px; font-size:11.5px; font-weight:700; }
  .chb-et.evento { background:#FDEBDD; color:#A8430A; } .chb-et.pedido { background:#E0F2FE; color:#075985; } .chb-et.otro { background:#F2F4F7; color:#475467; }
  .chb-ad { display:inline-flex; gap:4px; align-items:center; border-radius:999px; padding:1px 8px; font-size:11.5px; font-weight:700; background:#EEF4FF; color:#3538CD; }
  .chb-chat { background:var(--surface); border:1px solid var(--border); border-radius:12px; display:flex; flex-direction:column; min-width:0; overflow:hidden; }
  .chb-chat-head { display:flex; gap:12px; align-items:center; padding:12px 14px; border-bottom:1px solid var(--border); flex-wrap:wrap; }
  .chb-chat-head .av { width:40px; height:40px; border-radius:50%; display:grid; place-items:center; color:#fff; flex:none; }
  .chb-chat-head .q { flex:1; min-width:0; display:grid; gap:3px; } .chb-chat-head .q b { font-size:15px; }
  .chb-ia-caja { margin:12px 14px 0; border:1px solid #D9CCFB; background:linear-gradient(135deg,#F8F5FF,#FFF7F0); border-radius:10px; padding:12px 14px; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  .chb-ia-caja p { margin:0; flex:1; min-width:200px; font-size:13.5px; color:#3F2A78; } .chb-ia-caja p b { display:block; font-size:14px; }
  .chb-hecho { margin:12px 14px 0; background:#ECFDF3; border:1px solid #ABEFC6; color:#05603A; border-radius:10px; padding:10px 14px; font-size:13.5px; display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap; }
  .chb-hilo { display:flex; flex-direction:column; gap:8px; padding:14px; background:#F4F1EC; margin:12px 14px; border-radius:10px; max-height:calc(100vh - 520px); min-height:200px; overflow:auto; }
  .chb-b { max-width:78%; padding:8px 11px; border-radius:3px 12px 12px 12px; background:#fff; box-shadow:0 1px 1px rgba(0,0,0,.07); align-self:flex-start; font-size:14px; white-space:pre-wrap; overflow-wrap:anywhere; }
  .chb-b.javi { align-self:flex-end; border-radius:12px 3px 12px 12px; background:#FFE4D1; }
  .chb-b small { display:block; color:#8A8178; font-size:11px; margin-top:3px; }
  .chb-resp { margin:0 14px 14px; display:grid; gap:8px; }
  .chb-resp textarea { width:100%; font:inherit; font-size:14px; border:1px solid var(--border); border-radius:10px; padding:10px 12px; resize:vertical; min-height:76px; background:#fff; }
  .chb-resp textarea:focus { outline:none; border-color:var(--primary); box-shadow:0 0 0 3px var(--primary-soft); }
  .chb-sug { display:inline-flex; gap:6px; align-items:center; font-size:12.5px; font-weight:600; color:#5B21B6; }
  .chb-sug + textarea { background:#FBF9FF; border-color:#D9CCFB; }
  .chb-resp-pie { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; } .chb-resp-pie small { font-size:12px; flex:1; min-width:200px; }
  .chb-escucha { margin:0 14px 14px; display:flex; gap:10px; align-items:center; background:var(--surface-2); border:1px dashed #D0D5DD; border-radius:10px; padding:10px 12px; font-size:13px; color:var(--text-2); }
  .chb-cargando-ia { display:flex; gap:10px; align-items:center; color:#5B21B6; font-weight:600; font-size:14px; }
  .chb-cargando-ia i { width:18px; height:18px; border-radius:50%; border:2.5px solid #D9CCFB; border-top-color:#6D28D9; animation:chbgira .8s linear infinite; }
  @keyframes chbgira { to { transform:rotate(360deg); } }
  .chb-volver { display:none; }
  /* anuncios */
  .chb-ads { display:grid; gap:12px; }
  .chb-adc { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:14px 16px; display:grid; gap:12px; }
  .chb-adc .top { display:flex; gap:12px; align-items:center; flex-wrap:wrap; } .chb-adc .top .av { width:38px; height:38px; border-radius:10px; display:grid; place-items:center; color:#fff; flex:none; }
  .chb-adc .top .q { flex:1; min-width:180px; } .chb-adc .top .q b { font-size:15px; display:block; } .chb-adc .top .q small { font-size:12.5px; }
  .chb-emb { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
  .chb-paso { background:var(--surface-2); border-radius:8px; padding:9px 10px; display:grid; gap:2px; position:relative; overflow:hidden; }
  .chb-paso b { font-size:20px; } .chb-paso span { font-size:12px; color:var(--text-2); }
  .chb-paso .bar { position:absolute; left:0; bottom:0; height:3px; background:var(--primary); }
  .chb-adc .pie { display:flex; flex-wrap:wrap; gap:6px 18px; font-size:13px; color:var(--text-2); } .chb-adc .pie b { color:var(--text); }
  .chb-nota { font-size:12.5px; color:var(--text-3); margin:12px 0 0; }
  @media (max-width: 900px) {
    .chb-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; } .chb-kpi { padding:9px 11px; } .chb-kpi b { font-size:19px; } .chb-kpi span { font-size:12px; }
    .chb-filtros { flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; margin-left:-2px; padding:0 2px 2px; } .chb-filtros button { flex:none; }
    .chb-aviso { flex-wrap:wrap; }
    .chb-bandeja { grid-template-columns:minmax(0,1fr); }
    .chb-bandeja.con-sel .chb-izq { display:none; } .chb-bandeja:not(.con-sel) .chb-chat { display:none; }
    .chb-volver { display:inline-flex; }
    .chb-lista { max-height:none; }
    .chb-hilo { max-height:none; }
    .chb-cal .d { min-height:64px; padding:3px; } .chb-ev { font-size:0; height:8px; padding:0; border-left-width:0; border-radius:4px; }
    .chb-sem { grid-template-columns:minmax(0,1fr); } .chb-sem .col { min-height:0; }
    .chb-emb { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .chb-det dl { grid-template-columns:110px minmax(0,1fr); }
  }`;
  document.head.appendChild(s);
}
