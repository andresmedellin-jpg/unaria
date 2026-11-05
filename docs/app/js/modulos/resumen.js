// Resumen: una tarjeta por negocio (MARCA.negocios) con lo importante de hoy. Se pica la tarjeta y lleva a ese negocio.
// Lo que muestra cada tarjeta depende de lo que tiene el negocio: Mensajes/Eventos, Ventas (Loyverse) o "en preparación".
import { db, esc, fmt, hoyISO } from '../lib.js';
import { MARCA } from '../config.js';

const dinero = (n) => fmt(n).replace(/\.\d\d$/, '');
const ir = (id) => `${location.pathname}${location.search}#/${id}`;

export async function render(view) {
  estilos();
  document.getElementById('page-actions').innerHTML = '';
  const negocios = MARCA.negocios || [];
  view.innerHTML = '<div class="cargando">Cargando…</div>';
  const hoy = hoyISO(), mes = hoy.slice(0, 8) + '01';
  const tarjetas = await Promise.all(negocios.map((n) => tarjeta(n, hoy, mes).catch(() => ({ n, lineas: [] }))));
  const fecha = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  view.innerHTML = `
    <p class="rs-fecha">${esc(fecha.charAt(0).toUpperCase() + fecha.slice(1))}</p>
    <div class="rs-negocios">${tarjetas.map(({ n, lineas, aviso }) => `
      <a class="rs-neg" href="${ir(n.id + '-' + (n.modulos || [])[0])}" style="--c:${n.color || 'var(--primary)'}">
        <span class="rs-top">${(n.insignia || '').replace('class="neg-ico"', 'class="neg-ico" data-grande')}
          <span><b>${esc(n.nombre)}</b><small>${esc(n.giro || '')}</small></span><span class="rs-ir">Abrir ›</span></span>
        ${aviso ? `<span class="rs-aviso">${esc(aviso)}</span>` : ''}
        <span class="rs-datos">${lineas.map(([v, t, alerta]) => `<span class="${alerta ? 'al' : ''}"><b>${v}</b><small>${esc(t)}</small></span>`).join('')}</span>
      </a>`).join('')}</div>
    ${MARCA.demo ? '<p class="rs-nota">Demostración: todos los números son de ejemplo.</p>' : ''}`;
}

async function tarjeta(n, hoy, mes) {
  const m = n.modulos || [];
  if (m.includes('ventas')) {
    const { data: c } = await db().from('lv_cuentas').select('id, ultimo_sync').eq('empresa_id', n.empresa_id).maybeSingle();
    if (!c) return { n, aviso: n.notaLoyverse || 'Falta conectar Loyverse', lineas: [] };
    const { data: v } = await db().from('v_lv_ventas_dia').select('dia, venta, tickets').eq('cuenta_id', c.id).gte('dia', mes).lte('dia', hoy);
    const l = v || [], dHoy = l.filter((x) => x.dia === hoy);
    const vh = dHoy.reduce((s, x) => s + Number(x.venta || 0), 0), th = dHoy.reduce((s, x) => s + Number(x.tickets || 0), 0);
    const vm = l.reduce((s, x) => s + Number(x.venta || 0), 0), tm = l.reduce((s, x) => s + Number(x.tickets || 0), 0);
    return { n, lineas: [[dinero(vh), `vendido hoy · ${th} tickets`], [dinero(vm), 'vendido en el mes'], [tm ? dinero(vm / tm) : '—', 'ticket promedio del mes']] };
  }
  if (m.includes('bandeja') || m.includes('eventos')) {
    const en7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const [c, e] = await Promise.all([db().from('conversaciones').select('id, por_contestar, etiqueta, evento_id'), db().from('eventos').select('id, estado, fecha, monto')]);
    const cs = c.data || [], es = e.data || [];
    const porContestar = cs.filter((x) => x.por_contestar).length;
    const sinFicha = cs.filter((x) => x.etiqueta === 'evento' && !x.evento_id).length;
    const semana = es.filter((x) => ['apartado', 'confirmado'].includes(x.estado) && x.fecha >= hoy && x.fecha <= en7).length;
    const vendido = es.filter((x) => ['apartado', 'confirmado', 'realizado'].includes(x.estado) && (x.fecha || '') >= mes && (x.fecha || '') <= hoy.slice(0, 8) + '31').reduce((s, x) => s + Number(x.monto || 0), 0);
    return { n, lineas: [[porContestar, 'mensajes por contestar', porContestar > 0], [sinFicha + es.filter((x) => x.estado === 'solicitud').length, 'solicitudes de evento por cotizar', true], [semana, 'eventos esta semana'], [dinero(vendido), 'en eventos del mes']] };
  }
  return { n, aviso: n.pendiente || 'En preparación', lineas: [] };
}

function estilos() {
  if (document.getElementById('rs-estilos')) return;
  const s = document.createElement('style'); s.id = 'rs-estilos';
  s.textContent = `
  .rs-fecha { color:var(--text-2); margin:0 0 12px; font-size:14px; }
  .rs-negocios { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
  .rs-neg { display:grid; gap:12px; align-content:start; background:var(--surface); border:1px solid var(--border); border-top:4px solid var(--c); border-radius:12px; padding:16px 18px; color:var(--text); text-decoration:none; transition:box-shadow .15s; }
  .rs-neg:hover { box-shadow:0 6px 22px -12px rgba(0,0,0,.25); }
  .rs-top { display:flex; gap:12px; align-items:center; } .rs-top > span:nth-child(2) { flex:1; display:grid; } .rs-top b { font-size:17px; } .rs-top small { font-size:12.5px; }
  .rs-top .neg-ico[data-grande] { width:38px; height:38px; font-size:15px; border-radius:10px; }
  .rs-logo { height:30px; width:auto; }
  .rs-ir { font-size:13px; font-weight:600; color:var(--c); }
  .rs-datos { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
  .rs-datos > span { background:var(--surface-2); border-radius:8px; padding:9px 11px; display:grid; gap:1px; } .rs-datos b { font-size:20px; } .rs-datos small { font-size:12px; color:var(--text-2); }
  .rs-datos > span.al b { color:#B54708; }
  .rs-aviso { background:#FFFAEB; border:1px solid #F5C77E; color:#7A4B00; border-radius:8px; padding:9px 12px; font-size:13px; }
  .rs-nota { font-size:12px; color:var(--text-3); margin-top:14px; }
  @media (max-width:900px) { .rs-negocios { grid-template-columns:minmax(0,1fr); } }`;
  document.head.appendChild(s);
}
