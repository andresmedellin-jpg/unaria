// Eventos: cada solicitud (de la página, de un mensaje de WhatsApp, Instagram o Facebook, o capturada a mano) es una ficha
// en el calendario. Estados de un toque: solicitud → cotizado → apartado (anticipo) → confirmado → realizado (+ cancelado).
// Vistas: mes, semana y por estado. Tabla: eventos (y anuncios, para saber de cuál vino).
import { db, esc, toast, abrirModal, cerrarModal, hoyISO } from '../lib.js';
import { V, ESTADOS, ORDEN, VENDIDOS, estilos, tagEstado, fechaLarga, fechaCorta, horaBonita, telBonito, canalDe, fichaEvento, cambiarEstado, dinero, ir, paramHash } from './eventos-comun.js';

const st = { vista: 'mes', ref: hoyISO().slice(0, 7) + '-01', semana: hoyISO() };
let raiz, eventos = [], anuncios = [];

export async function render(view) {
  raiz = view; estilos();
  document.getElementById('page-actions').innerHTML = `${V.pagina ? `<a class="btn btn-ghost" href="${esc(V.pagina)}" target="_blank" rel="noopener">Página de eventos</a>` : ''}
    <button class="btn btn-primary" id="chb-nuevo">+ Evento</button>`;
  document.getElementById('chb-nuevo').addEventListener('click', () => fichaEvento({ evento: { fecha: hoyISO() }, alGuardar: () => cargar() }));
  await cargar();
  const abrir = paramHash('e');
  if (abrir) { const e = eventos.find((x) => x.id === abrir); if (e) { if (e.fecha) st.ref = e.fecha.slice(0, 7) + '-01'; pintar(); verEvento(e); } }
}

async function cargar() {
  const [e, a] = await Promise.all([db().from('eventos').select('*').order('fecha'), db().from('anuncios').select('*')]);
  if (e.error) { raiz.innerHTML = `<div class="vacio">No se pudieron cargar los eventos: ${esc(e.error.message)}</div>`; return; }
  eventos = e.data || []; anuncios = a.data || [];
  pintar();
}
const anuncio = (id) => anuncios.find((a) => a.id === id);

function pintar() {
  const hoy = hoyISO(), mes = hoy.slice(0, 7);
  const en30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const porAtender = eventos.filter((e) => e.estado === 'solicitud');
  const nuevos = eventos.filter((e) => e.nuevo);
  const proximos = eventos.filter((e) => ['apartado', 'confirmado'].includes(e.estado) && e.fecha >= hoy && e.fecha <= en30);
  const vendidoMes = eventos.filter((e) => VENDIDOS.includes(e.estado) && (e.fecha || '').slice(0, 7) === mes).reduce((s, e) => s + Number(e.monto || 0), 0);
  const porCobrar = eventos.filter((e) => ['apartado', 'confirmado'].includes(e.estado)).reduce((s, e) => s + Math.max(0, Number(e.monto || 0) - Number(e.anticipo || 0)), 0);

  raiz.innerHTML = `
    ${nuevos.length ? avisoNuevos(nuevos) : ''}
    <div class="chb-kpis">
      <div class="chb-kpi${porAtender.length ? ' alerta' : ''}"><b>${porAtender.length}</b><span>Solicitudes por cotizar</span></div>
      <div class="chb-kpi"><b>${proximos.length}</b><span>Eventos apartados en 30 días</span></div>
      <div class="chb-kpi"><b>${dinero(vendidoMes)}</b><span>Vendido para este mes</span></div>
      <div class="chb-kpi"><b>${dinero(porCobrar)}</b><span>Falta por cobrar (después del anticipo)</span></div>
    </div>
    <div class="chb-barra">
      <div class="chb-seg" role="tablist">${[['mes', 'Mes'], ['semana', 'Semana'], ['estado', 'Por estado']].map(([k, t]) => `<button data-v="${k}" class="${st.vista === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      ${st.vista === 'estado' ? '' : `<div class="chb-mesnav"><button class="btn btn-ghost btn-sm" data-mov="-1" aria-label="Anterior">‹</button><b>${titulo()}</b><button class="btn btn-ghost btn-sm" data-mov="1" aria-label="Siguiente">›</button><button class="btn btn-ghost btn-sm" data-mov="0">Hoy</button></div>`}
    </div>
    <div id="chb-vista"></div>
    <p class="chb-nota">${ORDEN.slice(0, 5).map((k) => `${tagEstado(k)} ${esc(ESTADOS[k].ayuda.toLowerCase())}`).join(' &nbsp; ')}</p>`;

  raiz.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { st.vista = b.dataset.v; pintar(); }));
  raiz.querySelectorAll('[data-mov]').forEach((b) => b.addEventListener('click', () => mover(Number(b.dataset.mov))));
  raiz.querySelector('#chb-ver-nuevo')?.addEventListener('click', () => verEvento(nuevos[nuevos.length - 1]));
  const caja = raiz.querySelector('#chb-vista');
  caja.innerHTML = st.vista === 'mes' ? vistaMes() : st.vista === 'semana' ? vistaSemana() : vistaEstado();
  caja.querySelectorAll('[data-ev]').forEach((b) => b.addEventListener('click', () => verEvento(eventos.find((e) => e.id === b.dataset.ev))));
}

// Aviso de lo que llegó por la página (en el demo: lo que se mandó desde el formulario en este navegador)
function avisoNuevos(nuevos) {
  const e = nuevos[nuevos.length - 1];
  return `<div class="chb-aviso">
    <div class="wa">
      <b>${nuevos.length === 1 ? 'Llegó una solicitud nueva desde la página' : `Llegaron ${nuevos.length} solicitudes nuevas desde la página`}</b>
      <span style="font-size:13px;color:var(--text-2)">Así le avisó el sistema a ${esc(V.dueno)} por WhatsApp:</span>
      <div class="chb-wa-b">🎉 Nueva solicitud de evento
${esc(e.tipo || 'Evento')} · ${esc(e.personas ?? '?')} personas
${esc(fechaLarga(e.fecha))}${e.hora ? ', ' + esc(horaBonita(e.hora)) : ''}
📍 ${esc(e.direccion || '—')}
👤 ${esc(e.contacto || '')} · ${esc(telBonito(e.telefono))}
Vino de: ${esc(canalDe(e.canal).t)}</div>
    </div>
    <button class="btn btn-primary btn-sm" id="chb-ver-nuevo">Abrir ficha</button>
  </div>`;
}

function titulo() {
  if (st.vista === 'semana') {
    const l = lunes(st.semana), d = new Date(l + 'T12:00:00'), f = new Date(d); f.setDate(f.getDate() + 6);
    return `${d.getDate()} – ${f.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`;
  }
  const t = new Date(st.ref + 'T12:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function mover(k) {
  if (st.vista === 'semana') { st.semana = k === 0 ? hoyISO() : sumar(st.semana, 7 * k); }
  else if (k === 0) st.ref = hoyISO().slice(0, 7) + '-01';
  else { const d = new Date(st.ref + 'T12:00:00'); d.setMonth(d.getMonth() + k); st.ref = iso(d).slice(0, 7) + '-01'; }
  pintar();
}
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const sumar = (f, k) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + k); return iso(d); };
const lunes = (f) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const chip = (e) => { const s = ESTADOS[e.estado] || ESTADOS.solicitud;
  return `<button class="chb-ev ${e.estado}${e.nuevo ? ' nuevo' : ''}" data-ev="${e.id}" style="background:${s.bg};border-color:${s.c};color:${s.c}" title="${esc(`${e.tipo} · ${e.personas || '?'} personas · ${e.contacto || ''}`)}">${esc(horaBonita(e.hora))} ${esc(e.tipo || 'Evento')} · ${esc(e.personas ?? '?')}</button>`; };
const tarjeta = (e, conFecha = false) => { const s = ESTADOS[e.estado] || ESTADOS.solicitud;
  return `<button class="chb-card" data-ev="${e.id}" style="border-left-color:${s.c}">
    <b>${esc(e.tipo || 'Evento')} · ${esc(e.personas ?? '?')} personas</b>
    <small>${conFecha ? esc(fechaCorta(e.fecha)) + ' · ' : ''}${esc(horaBonita(e.hora) || 'sin hora')}</small>
    <small>${esc(e.contacto || '—')}</small>
    <span style="display:flex;gap:5px;flex-wrap:wrap;margin-top:2px">${tagEstado(e.estado)}${e.nuevo ? '<span class="chb-est" style="background:#FEF0C7;color:#B54708">Nuevo</span>' : ''}</span>
  </button>`; };

function vistaMes() {
  const ini = new Date(st.ref + 'T12:00:00'), mes = ini.getMonth();
  const primero = lunes(st.ref), hoy = hoyISO();
  let html = DIAS.map((d) => `<div class="dn">${d}</div>`).join('');
  for (let k = 0; k < 42; k++) {
    const f = sumar(primero, k), d = new Date(f + 'T12:00:00');
    if (k === 35 && d.getMonth() !== mes) break;
    const del = eventos.filter((e) => e.fecha === f).sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
    html += `<div class="d${d.getMonth() !== mes ? ' fuera' : ''}${f === hoy ? ' hoy' : ''}"><span class="num">${d.getDate()}</span>${del.slice(0, 3).map(chip).join('')}${del.length > 3 ? `<small>+${del.length - 3} más</small>` : ''}</div>`;
  }
  return `<div class="chb-cal">${html}</div>`;
}

function vistaSemana() {
  const l = lunes(st.semana), hoy = hoyISO();
  return `<div class="chb-sem">${DIAS.map((_, k) => {
    const f = sumar(l, k), del = eventos.filter((e) => e.fecha === f).sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
    return `<div class="col${f === hoy ? ' hoy' : ''}"><h4>${esc(fechaCorta(f))}</h4>${del.map((e) => tarjeta(e)).join('') || '<small style="color:var(--text-3)">—</small>'}</div>`;
  }).join('')}</div>`;
}

function vistaEstado() {
  const hoy = hoyISO();
  return `<div class="chb-cols">${ORDEN.slice(0, 5).map((k) => {
    let l = eventos.filter((e) => e.estado === k);
    l = k === 'realizado' ? l.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 8) : l.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    const total = l.reduce((s, e) => s + Number(e.monto || 0), 0);
    return `<div class="chb-colest"><h4>${tagEstado(k)}<small>${l.length}${total ? ' · ' + dinero(total) : ''}</small></h4><p class="ay">${esc(ESTADOS[k].ayuda)}</p>
      ${l.map((e) => tarjeta(e, true)).join('') || '<small style="color:var(--text-3);padding:4px">Nada aquí</small>'}</div>`;
  }).join('')}</div>${eventos.some((e) => e.estado === 'cancelado') ? `<p class="chb-nota">Cancelados: ${eventos.filter((e) => e.estado === 'cancelado').length}</p>` : ''}`;
}

// ---------- ficha ----------
function verEvento(e) {
  if (!e) return;
  const s = ESTADOS[e.estado] || ESTADOS.solicitud, ad = anuncio(e.anuncio_id);
  const falta = Math.max(0, Number(e.monto || 0) - Number(e.anticipo || 0));
  const fila = (t, v) => v ? `<dt>${t}</dt><dd>${v}</dd>` : '';
  const m = abrirModal({
    titulo: `${e.tipo || 'Evento'} · ${e.contacto || ''}`, ancho: true,
    cuerpo: `<div class="chb-det">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${tagEstado(e.estado)}<small>${esc(s.ayuda)}</small></div>
      <dl>
        ${fila('Fecha', esc(fechaLarga(e.fecha)) + (e.hora ? ' · ' + esc(horaBonita(e.hora)) : ''))}
        ${fila('Lugar', esc(e.direccion || '—'))}
        ${fila('Personas', esc(e.personas ?? '—'))}
        ${fila(V.etiquetaPaquete || 'Paquete', esc(e.paquete || 'Por definir'))}
        ${e.traslado != null ? fila('Traslado y montaje', dinero(e.traslado)) : ''}${e.ubicacion ? fila('Ubicación', `<a href="${esc(e.ubicacion)}" target="_blank" rel="noopener">Ver en el mapa ↗</a>`) : ''}
        ${fila('Sucursal', esc(e.sucursal || 'Por definir'))}
        ${fila('Contacto', esc(e.contacto || '—') + (e.telefono ? ` · ${esc(telBonito(e.telefono))}` : ''))}
        ${fila('Monto', dinero(e.monto))}
        ${fila('Anticipo', e.anticipo ? `${dinero(e.anticipo)}${falta ? ` · faltan ${dinero(falta)}` : ' · pagado completo'}` : 'Sin anticipo')}
        ${fila('Llegó por', `${esc(canalDe(e.canal).t)}${ad ? ` · anuncio “${esc(ad.nombre)}”` : ''}`)}
        ${e.utm && Object.keys(e.utm).length ? fila('UTM', `<span class="mono" style="font-size:12px">${esc(Object.entries(e.utm).map(([k, v]) => `${k}=${v}`).join(' · '))}</span>`) : ''}
        ${fila('Notas', esc(e.notas || ''))}
      </dl>
      ${s.sigue.length ? `<div class="acc">${s.sigue.map((k) => `<button class="btn ${k === 'cancelado' ? 'btn-ghost' : 'btn-primary'}" data-pasa="${k}">${k === 'cancelado' ? 'Cancelar evento' : k === 'solicitud' ? 'Reactivar' : 'Marcar ' + ESTADOS[k].t.toLowerCase()}</button>`).join('')}</div>` : ''}
    </div>`,
    pie: `${e.conversacion_id ? `<a class="btn btn-ghost" href="${ir('bandeja', 'c=' + e.conversacion_id)}">Ver conversación</a>` : ''}
      ${e.telefono ? `<a class="btn btn-ghost" href="https://wa.me/52${esc(e.telefono)}" target="_blank" rel="noopener" data-demo-wa>WhatsApp</a>` : ''}
      <button class="btn btn-ghost" id="chb-editar">Editar</button>`,
  });
  m.querySelectorAll('[data-pasa]').forEach((b) => b.addEventListener('click', async () => {
    const nuevo = b.dataset.pasa;
    if (nuevo === 'apartado' && !Number(e.anticipo)) { cerrarModal(); return fichaEvento({ evento: { ...e, estado: 'apartado' }, titulo: 'Registrar anticipo', alGuardar: () => cargar() }); }
    if (nuevo === 'cotizado' && !Number(e.monto)) { cerrarModal(); return fichaEvento({ evento: { ...e, estado: 'cotizado' }, titulo: '¿En cuánto se cotizó?', alGuardar: () => cargar() }); }
    b.disabled = true; const r = await cambiarEstado(e, nuevo); if (!r) return; cerrarModal(); await cargar();
  }));
  m.querySelector('[data-demo-wa]')?.addEventListener('click', (ev) => { ev.preventDefault(); toast('En el sistema real abre el chat con el cliente en WhatsApp.'); });
  m.querySelector('#chb-editar').addEventListener('click', () => { cerrarModal(); fichaEvento({ evento: e, alGuardar: () => cargar() }); });
  if (e.nuevo) { e.nuevo = false; db().from('eventos').update({ nuevo: false }).eq('id', e.id); }
}
