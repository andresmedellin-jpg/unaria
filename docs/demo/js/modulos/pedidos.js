// Pedidos: lo que llega del menú interactivo (WhatsApp, Instagram, Messenger o la página) en un tablero por estado:
// Nuevo → En cocina → En camino → Entregado. Cada cambio le avisa al cliente por su mismo canal.
// El tiempo de cada pedido se pinta en verde, amarillo o rojo para saber cuál va atrasado. Tabla: pedidos.
import { db, esc, toast, abrirModal, cerrarModal, fmt } from '../lib.js';
import { CANALES, ir, paramHash, estilos as estilosChb } from './eventos-comun.js';

const ESTADOS = {
  nuevo:     { t: 'Nuevo', c: '#B54708', bg: '#FEF0C7', sig: 'cocina', boton: 'Pasar a cocina', aviso: 'Recibimos tu pedido #{n}. Ya entra a cocina 🍳' },
  cocina:    { t: 'En cocina', c: '#1D4ED8', bg: '#DBEAFE', sig: 'camino', boton: 'Salió a entregar', botonRecoger: 'Ya está listo', aviso: '🛵 Tu pedido #{n} ya va en camino.', avisoRecoger: '✅ Tu pedido #{n} ya está listo para recoger en {s}.' },
  camino:    { t: 'En camino', c: '#7C3AED', bg: '#EDE9FE', sig: 'entregado', boton: 'Entregado', aviso: '¡Buen provecho! 😋 ¿Cómo estuvo tu pedido?' },
  entregado: { t: 'Entregado', c: '#067647', bg: '#D1FADF' },
  cancelado: { t: 'Cancelado', c: '#98A2B3', bg: '#F2F4F7' },
};
const COLS = ['nuevo', 'cocina', 'camino', 'entregado'];
const dinero = (n) => fmt(n).replace(/\.00$/, '');
let raiz, mod, pedidos = [], reloj, ubic = {};

export async function render(view, m) {
  raiz = view; mod = m || mod; estilos(); clearInterval(reloj);
  document.getElementById('page-actions').innerHTML = '';
  await cargar();
  const abrir = paramHash('p'); if (abrir) { const p = pedidos.find((x) => x.id === abrir); if (p) ver(p); }
  reloj = setInterval(() => { if (!document.body.contains(raiz)) return clearInterval(reloj); if (!document.querySelector('#modal-root .modal')) pintar(); }, 30000);
}
async function cargar() {
  const desde = new Date(); desde.setHours(0, 0, 0, 0); desde.setDate(desde.getDate() - 1);
  let q = db().from('pedidos').select('*').gte('creado_en', desde.toISOString()).order('creado_en', { ascending: false });
  if (mod?.negocio?.empresa_id) q = q.eq('empresa_id', mod.negocio.empresa_id);
  const r = await q;
  if (r.error) { raiz.innerHTML = `<div class="vacio">No se pudieron cargar los pedidos: ${esc(r.error.message)}</div>`; return; }
  pedidos = r.data || [];
  // Ubicación de cada sucursal (Menú → Sucursales) para mandarla cuando el pedido es para recoger
  if (mod?.negocio?.empresa_id) { const mn = await db().from('menus').select('datos').eq('empresa_id', mod.negocio.empresa_id).maybeSingle(); ubic = mn.data?.datos?.ubicaciones || {}; }
  pintar();
}
const min = (p) => Math.max(0, Math.round((Date.now() - new Date(p.creado_en)) / 6e4));
const reloj_ = (p) => { const m = min(p); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
const semaforo = (p) => (['entregado', 'cancelado'].includes(p.estado) ? '' : min(p) >= 40 ? 'rojo' : min(p) >= 25 ? 'amarillo' : 'verde');

function pintar() {
  const hoy = new Date().toDateString();
  const deHoy = pedidos.filter((p) => new Date(p.creado_en).toDateString() === hoy && p.estado !== 'cancelado');
  const venta = deHoy.reduce((s, p) => s + Number(p.total || 0), 0);
  const abiertos = pedidos.filter((p) => ['nuevo', 'cocina', 'camino'].includes(p.estado));
  const tarde = abiertos.filter((p) => min(p) >= 40).length;
  raiz.innerHTML = `
    <div class="chb-kpis">
      <div class="chb-kpi"><b>${deHoy.length}</b><span>Pedidos de hoy</span></div>
      <div class="chb-kpi"><b>${dinero(venta)}</b><span>Vendido hoy por chat</span></div>
      <div class="chb-kpi"><b>${deHoy.length ? dinero(Math.round(venta / deHoy.length)) : '—'}</b><span>Ticket promedio</span></div>
      <div class="chb-kpi${tarde ? ' alerta' : ''}"><b>${abiertos.length}</b><span>Abiertos${tarde ? ` · ${tarde} atrasados` : ''}</span></div>
    </div>
    <div class="pd-cols">${COLS.map((k) => {
      const l = pedidos.filter((p) => p.estado === k && (k !== 'entregado' || new Date(p.creado_en).toDateString() === hoy)).sort((a, b) => (k === 'entregado' ? new Date(b.creado_en) - new Date(a.creado_en) : new Date(a.creado_en) - new Date(b.creado_en)));
      return `<div class="pd-col"><h4><span class="chb-est" style="color:${ESTADOS[k].c};background:${ESTADOS[k].bg}">${ESTADOS[k].t}</span><small>${l.length}</small></h4>
        ${l.map(tarjeta).join('') || '<p class="pd-vacio">Nada aquí</p>'}</div>`;
    }).join('')}</div>
    <p class="chb-nota">Los pedidos llegan del menú interactivo de WhatsApp, Instagram, Messenger y la página. Al pasar un pedido de columna, al cliente le llega su aviso por el mismo canal. Verde = a tiempo, amarillo = 25 min o más, rojo = 40 min o más.</p>`;
  raiz.querySelectorAll('[data-ped]').forEach((b) => b.addEventListener('click', (e) => { if (e.target.closest('[data-avanza]')) return; ver(pedidos.find((p) => p.id === b.dataset.ped)); }));
  raiz.querySelectorAll('[data-avanza]').forEach((b) => b.addEventListener('click', () => avanzar(pedidos.find((p) => p.id === b.dataset.avanza))));
}
function tarjeta(p) {
  const k = CANALES[p.canal] || CANALES.pagina, e = ESTADOS[p.estado], sem = semaforo(p);
  const boton = e.sig ? (p.estado === 'cocina' && p.entrega === 'recoger' ? e.botonRecoger : e.boton) : '';
  return `<div class="pd-card ${sem}" data-ped="${p.id}" role="button" tabindex="0">
    <div class="pd-top"><b>#${esc(p.numero)}</b><span class="pd-canal" style="color:${k.c}" title="${esc(k.t)}">${k.ico}</span><span class="pd-t ${sem}">${esc(reloj_(p))}</span></div>
    <div class="pd-quien">${esc(p.contacto || 'Cliente')}</div>
    <div class="pd-items">${(p.items || []).map((i) => `<div><b>${esc(i.cantidad)}×</b> ${esc(i.resumen || i.producto)}</div>`).join('')}</div>
    <div class="pd-pie"><span>${p.entrega === 'domicilio' ? '🛵 ' + esc((p.direccion || '').split(',')[0]) : '🏪 ' + esc(p.sucursal || '')}</span><b>${dinero(p.total)}</b></div>
    <div class="pd-pago">${p.pago === 'Efectivo' ? `💵 Efectivo${p.cambio && p.cambio !== 'Exacto' ? ` · paga con ${esc(p.cambio)}` : ''}` : `🏦 ${esc(p.pago || '')}${p.pagado ? ' · pagado ✓' : ' · esperando comprobante'}`}</div>
    ${boton ? `<button class="btn btn-primary btn-sm pd-btn" data-avanza="${p.id}">${esc(boton)}</button>` : ''}
  </div>`;
}
async function avanzar(p) {
  const e = ESTADOS[p.estado]; if (!e.sig) return;
  const cambios = [...(p.cambios || []), { estado: e.sig, en: new Date().toISOString() }];
  const r = await db().from('pedidos').update({ estado: e.sig, cambios }).eq('id', p.id).select().single();
  if (r.error) return toast(r.error.message, true);
  const aviso = (p.estado === 'cocina' && p.entrega === 'recoger' ? e.avisoRecoger : e.aviso || '').replace('{n}', p.numero).replace('{s}', p.sucursal || 'la sucursal') + (p.estado === 'cocina' && p.entrega === 'recoger' && ubic[p.sucursal]?.mapa ? ' 📍 ' + ubic[p.sucursal].mapa : '');
  toast(aviso ? `Se le avisó a ${p.contacto || 'el cliente'} por ${(CANALES[p.canal] || CANALES.pagina).t}: “${aviso}”` : 'Listo ✓');
  await cargar();
}
function ver(p) {
  if (!p) return;
  const k = CANALES[p.canal] || CANALES.pagina, e = ESTADOS[p.estado];
  const m = abrirModal({
    titulo: `Pedido #${p.numero} · ${p.contacto || ''}`,
    cuerpo: `<div class="pd-det">
      <p class="nota"><span class="chb-est" style="color:${e.c};background:${e.bg}">${e.t}</span> · llegó por <b>${esc(k.t)}</b> hace ${esc(reloj_(p))}${p.telefono ? ` · ${esc(String(p.telefono).replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3'))}` : ''}</p>
      <table class="tabla"><tbody>${(p.items || []).map((i) => `<tr><td><b>${esc(i.cantidad)} × ${esc(i.producto)}</b><br><small>${esc(i.resumen || '')}</small></td><td class="num">${dinero(i.total)}</td></tr>`).join('')}
        ${Number(p.envio) ? `<tr><td>Envío</td><td class="num">${dinero(p.envio)}</td></tr>` : ''}<tr><td><b>Total</b></td><td class="num"><b>${dinero(p.total)}</b></td></tr></tbody></table>
      <p class="nota">${p.entrega === 'domicilio' ? `🛵 <b>A domicilio:</b> ${esc(p.direccion || '')}` : `🏪 <b>Pasa por él a</b> ${esc(p.sucursal || '')}`}<br>${p.pago === 'Efectivo' ? `💵 Efectivo${p.cambio ? ` (paga con ${esc(p.cambio)})` : ''}` : `🏦 ${esc(p.pago || '')}${p.pagado ? ' · pagado ✓' : ' · esperando comprobante'}`}</p>
      ${p.notas ? `<p class="nota">📝 ${esc(p.notas)}</p>` : ''}</div>`,
    pie: `${p.conversacion_id ? `<a class="btn btn-ghost" href="${ir('bandeja', 'c=' + p.conversacion_id)}">Ver conversación</a>` : ''}
      ${p.pago === 'Transferencia' && !p.pagado ? '<button class="btn btn-ghost" id="pd-pagado">Marcar pagado</button>' : ''}
      ${!['entregado', 'cancelado'].includes(p.estado) ? '<button class="btn btn-ghost" id="pd-cancelar">Cancelar</button>' : ''}
      ${e.sig ? `<button class="btn btn-primary" id="pd-sig">${esc(p.estado === 'cocina' && p.entrega === 'recoger' ? e.botonRecoger : e.boton)}</button>` : ''}`,
  });
  m.querySelector('#pd-sig')?.addEventListener('click', () => { cerrarModal(); avanzar(p); });
  m.querySelector('#pd-pagado')?.addEventListener('click', async () => { await db().from('pedidos').update({ pagado: true }).eq('id', p.id); cerrarModal(); toast('Pago registrado ✓'); cargar(); });
  m.querySelector('#pd-cancelar')?.addEventListener('click', async () => { if (!confirm('¿Cancelar este pedido?')) return; await db().from('pedidos').update({ estado: 'cancelado' }).eq('id', p.id); cerrarModal(); toast('Pedido cancelado'); cargar(); });
}
function estilos() {
  estilosChb();
  if (document.getElementById('pd-estilos')) return;
  const s = document.createElement('style'); s.id = 'pd-estilos';
  s.textContent = `
  .pd-cols { display:grid; grid-template-columns:repeat(4,minmax(240px,1fr)); gap:10px; overflow-x:auto; padding-bottom:6px; }
  .pd-col { background:var(--surface-2); border-radius:10px; padding:8px; display:flex; flex-direction:column; gap:8px; min-width:0; }
  .pd-col h4 { margin:2px; display:flex; justify-content:space-between; align-items:center; font-size:13px; }
  .pd-vacio { color:var(--text-3); font-size:12.5px; margin:4px; }
  .pd-card { background:var(--surface); border:1px solid var(--border); border-left:4px solid #D0D5DD; border-radius:9px; padding:10px 11px; display:grid; gap:5px; cursor:pointer; font-size:13px; }
  .pd-card:hover { box-shadow:0 3px 12px -6px rgba(0,0,0,.25); }
  .pd-card.verde { border-left-color:#12B76A; } .pd-card.amarillo { border-left-color:#F79009; } .pd-card.rojo { border-left-color:#F04438; }
  .pd-top { display:flex; align-items:center; gap:6px; } .pd-top b { font-size:15px; } .pd-canal { display:inline-flex; }
  .pd-t { margin-left:auto; font-size:12px; font-weight:700; border-radius:999px; padding:2px 8px; background:var(--surface-2); color:var(--text-2); }
  .pd-t.amarillo { background:#FEF0C7; color:#B54708; } .pd-t.rojo { background:#FEE4E2; color:#B42318; } .pd-t.verde { background:#ECFDF3; color:#067647; }
  .pd-quien { font-weight:600; } .pd-items { color:var(--text-2); display:grid; gap:2px; } .pd-items b { color:var(--text); }
  .pd-pie { display:flex; justify-content:space-between; gap:8px; } .pd-pie span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-2); } .pd-pie b { font-size:14px; }
  .pd-pago { font-size:12px; color:var(--text-3); } .pd-btn { width:100%; margin-top:2px; }
  .pd-det .tabla small { color:var(--text-3); }
  @media (max-width:900px) { .pd-cols { grid-template-columns:repeat(4,minmax(78vw,1fr)); scroll-snap-type:x mandatory; } .pd-col { scroll-snap-align:start; } }`;
  document.head.appendChild(s);
}
