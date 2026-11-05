// Tema "Mando" (Grupo A.M). Lo carga app.js cuando MARCA.tema = 'mando' (los estilos van en css/tema-mando.css).
// - Monograma A.M arriba del riel y glifos propios (duotono) para Mando, Configuración y las pestañas de cada negocio.
// - Barra de arriba: insignia + nombre del negocio + giro, píldora "EN VIVO" con la hora y buscador ⌘K.
// - Buscador ⌘K: brinca a cualquier negocio o pestaña, hace acciones rápidas y encuentra clientes por nombre.
import { db, esc } from './lib.js';
import { MARCA, MODULOS } from './config.js';

const g = (cuerpo) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${cuerpo}</svg>`;
const F = 'fill="currentColor" stroke="none" opacity=".22"';
export const GLIFOS = {
  mando: g(`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18.4 5.6"/><path d="M12 3a9 9 0 0 1 6.4 2.6L12 12z" ${F}/><circle cx="15.5" cy="9" r="1.2" fill="currentColor" stroke="none"/>`),
  bandeja: g(`<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h8A2.5 2.5 0 0 1 17 6.5v5a2.5 2.5 0 0 1-2.5 2.5H9l-4 3v-3.2A2.5 2.5 0 0 1 4 11.5z" ${F}/><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h8A2.5 2.5 0 0 1 17 6.5v5a2.5 2.5 0 0 1-2.5 2.5H9l-4 3v-3.2A2.5 2.5 0 0 1 4 11.5z"/><path d="M19.5 9.5A1.5 1.5 0 0 1 21 11v5.5a1.5 1.5 0 0 1-1 1.4V20l-2.6-2H12"/>`),
  pedidos: g(`<path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" ${F}/><path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>`),
  eventos: g(`<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17" /><path d="M8 3v4M16 3v4"/><path d="M3.5 10h17v7a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3z" ${F}/><path d="m12 12.6.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" fill="currentColor" stroke="none"/>`),
  menu: g(`<path d="M3.5 11h17a8.5 8.5 0 0 1-17 0z" ${F}/><path d="M3.5 11h17a8.5 8.5 0 0 1-17 0z"/><path d="M9 7.5c0-1.4 1.2-1.4 1.2-2.8M13 7.5c0-1.4 1.2-1.4 1.2-2.8"/><path d="M8.5 19.5h7"/>`),
  anuncios: g(`<path d="M4 10v4a1.5 1.5 0 0 0 1.5 1.5H7l7 4V4.5l-7 4H5.5A1.5 1.5 0 0 0 4 10z" ${F}/><path d="M4 10v4a1.5 1.5 0 0 0 1.5 1.5H7l7 4V4.5l-7 4H5.5A1.5 1.5 0 0 0 4 10z"/><path d="M17.5 9a4 4 0 0 1 0 6M19.8 6.5a7.5 7.5 0 0 1 0 11"/>`),
  ventas: g(`<path d="M3 19h18" /><path d="M3 15.5 8 11l3.5 3L20 6" /><path d="M3 15.5 8 11l3.5 3L20 6v13H3z" ${F}/><circle cx="20" cy="6" r="1.6" fill="currentColor" stroke="none"/>`),
  preparacion: g(`<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 12h7V3.5M10.5 12v8.5M14 7.5h3.5M14 16h3.5v-4.5" /><path d="M3.5 3.5h7V12h-7z" ${F}/>`),
  usuarios: g(`<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2" fill="currentColor" stroke="none"/><circle cx="10" cy="17" r="2.2" fill="currentColor" stroke="none"/>`),
  buscar: g('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  ir: g('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  persona: g(`<circle cx="12" cy="8.5" r="3.5" ${F}/><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>`),
};

const negocioDe = (mod) => mod?.negocio || null;
let reloj;

export function iniciar() {
  // Monograma del grupo arriba del riel
  const brand = document.querySelector('.sidebar .brand');
  if (brand) brand.innerHTML = `<a class="am-mono" href="${location.pathname}${location.search}#/mando" aria-label="${esc(MARCA.nombre)}"><b>A.M</b><span>GRUPO</span></a>`;
  // Glifos del riel para lo que no es un negocio (Mando, Configuración)
  const glifoNav = () => document.querySelectorAll('#nav a, #nav-abajo a, #barra-movil a').forEach((a) => {
    const id = (a.dataset.subs || a.dataset.mod || '').split(' ')[0];
    const ico = a.querySelector('.nav-ico'); if (!ico || ico.querySelector('.neg-ico')) return;
    if (GLIFOS[id]) ico.innerHTML = GLIFOS[id];
  });
  glifoNav();
  // Barra de arriba: EN VIVO + ⌘K
  const top = document.querySelector('.topbar');
  if (top && !top.querySelector('.vivo')) {
    const acc = document.getElementById('page-actions');
    const v = document.createElement('span'); v.className = 'vivo'; v.innerHTML = '<i></i>EN VIVO<span class="vivo-hora"></span>';
    const k = document.createElement('button'); k.type = 'button'; k.className = 'buscar-k'; k.innerHTML = `${GLIFOS.buscar.replace('<svg', '<svg width="15" height="15"')}<span>Buscar o ir a…</span><kbd>⌘K</kbd>`;
    k.addEventListener('click', abrirBuscador);
    top.insertBefore(v, acc); top.insertBefore(k, acc);
    const hora = () => { v.querySelector('.vivo-hora').textContent = ' · ' + new Date().toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }); };
    hora(); clearInterval(reloj); reloj = setInterval(hora, 15000);
  }
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrirBuscador(); } });
  document.addEventListener('unaria:navegar', (e) => decorar(e.detail.mod));
  // La primera pantalla ya se pintó antes de que cargara el tema
  const id = location.hash.replace(/^#\/?/, '').split('?')[0];
  decorar(MODULOS.find((m) => m.id === id));
}

// Título con la insignia del negocio y su giro; glifos en las pestañas
function decorar(mod) {
  const h = document.getElementById('page-title'); if (!h || !mod) return;
  const n = negocioDe(mod);
  const titulo = n ? n.nombre : mod.titulo;
  const sub = n ? (n.giro || '') : mod.id === 'mando' ? `${MARCA.nombre} · ${(MARCA.negocios || []).length} negocios` : MARCA.nombre;
  h.innerHTML = `${n ? `<span class="top-insignia">${n.insignia}</span>` : ''}<span class="top-tit">${esc(titulo)}<span class="top-sub">${esc(sub)}</span></span>`;
  requestAnimationFrame(() => document.querySelectorAll('.sub-modulos [data-base]').forEach((a) => { const i = a.querySelector('.tab-ico'); if (i && GLIFOS[a.dataset.base]) i.innerHTML = GLIFOS[a.dataset.base]; }));
}

// ---------- buscador ⌘K ----------
let contactos = null;
const ir = (id) => { location.hash = '#/' + id; };
function opciones() {
  const ops = [{ grupo: 'Ir a', ico: GLIFOS.mando, t: 'Centro de mando', d: 'todo el grupo', ir: 'mando' }];
  (MARCA.negocios || []).forEach((n) => (n.modulos || []).forEach((m, k) => {
    const base = MODULOS.find((x) => x.id === n.id + '-' + m); if (!base) return;
    ops.push({ grupo: 'Ir a', ico: k === 0 ? n.insignia : (GLIFOS[m] || ''), t: k === 0 ? n.nombre : `${n.nombre} · ${base.titulo}`, d: k === 0 ? (n.giro || '') : '', ir: base.id });
  }));
  const tiene = (id) => MODULOS.some((m) => m.id === id);
  if (tiene('chilabike-pedidos')) ops.push({ grupo: 'Acciones', ico: GLIFOS.pedidos, t: 'Pedidos que van tarde', d: 'Chilabike', ir: 'chilabike-pedidos' });
  if (tiene('chilabike-bandeja')) ops.push({ grupo: 'Acciones', ico: GLIFOS.bandeja, t: 'Mensajes por contestar', d: 'Chilabike', ir: 'chilabike-bandeja' });
  if (tiene('chilabike-eventos')) ops.push({ grupo: 'Acciones', ico: GLIFOS.eventos, t: 'Cotizar un evento nuevo', d: 'Chilabike', ir: 'chilabike-eventos', luego: () => setTimeout(() => document.querySelector('#page-actions .btn-primary')?.click(), 500) });
  if (tiene('chilabike-menu')) ops.push({ grupo: 'Acciones', ico: GLIFOS.menu, t: 'Marcar algo agotado hoy', d: 'Chilabike · Menú', ir: 'chilabike-menu' });
  if (tiene('curandero-ventas')) ops.push({ grupo: 'Acciones', ico: GLIFOS.ventas, t: '¿Cómo va Curandero hoy?', d: 'Loyverse', ir: 'curandero-ventas' });
  return ops;
}
async function cargarContactos() {
  if (contactos) return contactos;
  try {
    const [c, e] = await Promise.all([db().from('conversaciones').select('id, contacto, canal, etiqueta'), db().from('eventos').select('id, contacto, tipo, fecha')]);
    contactos = [...(c.data || []).map((x) => ({ grupo: 'Clientes', ico: GLIFOS.persona, t: x.contacto, d: `${x.canal} · ${x.etiqueta || ''}`, ir: `chilabike-bandeja?c=${x.id}` })),
      ...(e.data || []).filter((x) => x.contacto).map((x) => ({ grupo: 'Eventos', ico: GLIFOS.eventos, t: x.contacto, d: `${x.tipo} · ${x.fecha || ''}`, ir: `chilabike-eventos?e=${x.id}` }))];
  } catch (er) { contactos = []; }
  return contactos;
}
function abrirBuscador() {
  if (document.querySelector('.mk-back')) return;
  const back = document.createElement('div'); back.className = 'mk-back';
  back.innerHTML = `<div class="mk" role="dialog" aria-label="Buscar"><div class="mk-in">${GLIFOS.buscar.replace('<svg', '<svg width="20" height="20"')}<input placeholder="Busca un negocio, una pantalla o un cliente…" aria-label="Buscar"></div>
    <div class="mk-lista"></div><div class="mk-pie"><span>↑↓ moverse</span><span>↵ abrir</span><span>esc cerrar</span></div></div>`;
  document.body.appendChild(back);
  const inp = back.querySelector('input'), lista = back.querySelector('.mk-lista');
  let res = [], sel = 0;
  const cerrar = () => back.remove();
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const pintar = async () => {
    const q = norm(inp.value.trim()), base = opciones();
    const extra = q.length >= 2 ? await cargarContactos() : [];
    res = [...base, ...extra].filter((o) => !q || norm(o.t + ' ' + o.d).includes(q)).slice(0, 14);
    sel = Math.min(sel, Math.max(0, res.length - 1));
    let grupo = '';
    lista.innerHTML = res.length ? res.map((o, i) => `${o.grupo !== grupo ? `<div class="mk-grupo">${esc((grupo = o.grupo))}</div>` : ''}<button class="mk-op${i === sel ? ' on' : ''}" data-i="${i}"><span class="mk-ico">${o.ico}</span>${esc(o.t)}<small>${esc(o.d)}</small></button>`).join('')
      : '<div class="mk-vacio">Nada con eso. Prueba con el nombre de un negocio o de un cliente.</div>';
    lista.querySelectorAll('[data-i]').forEach((b) => { b.addEventListener('click', () => elegir(res[+b.dataset.i])); b.addEventListener('mousemove', () => { if (sel !== +b.dataset.i) { sel = +b.dataset.i; marcar(); } }); });
  };
  const marcar = () => lista.querySelectorAll('[data-i]').forEach((b) => b.classList.toggle('on', +b.dataset.i === sel));
  const elegir = (o) => { if (!o) return; cerrar(); ir(o.ir); o.luego?.(); };
  inp.addEventListener('input', () => { sel = 0; pintar(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrar();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + res.length) % Math.max(1, res.length); marcar(); lista.querySelector('.mk-op.on')?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter') elegir(res[sel]);
  });
  back.addEventListener('click', (e) => { if (e.target === back) cerrar(); });
  pintar(); setTimeout(() => inp.focus(), 10);
}
