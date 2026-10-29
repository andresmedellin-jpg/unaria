import { MODULOS_ACTIVOS as MODULOS, MARCA, CLIENTE } from './config.js';
import { sb, db, estado, esc, toast, abrirModal, cerrarModal, tieneRol } from './lib.js';
import { iniciarAsistente, quitarAsistente } from './asistente.js';

const vistas = {
  inicio: () => import('./modulos/inicio.js'),
  gastos: () => import('./modulos/gastos.js'),
  usuarios: () => import('./modulos/usuarios.js'),
  cobranza: () => import('./modulos/cobranza.js'),
  rentas: () => import('./modulos/rentas.js'),
  personal: () => import('./modulos/personal.js'),
  reportes: () => import('./modulos/reportes.js'),
  obras: () => import('./modulos/obras.js'),
  patrimonio: () => import('./modulos/patrimonio.js'),
  inventario: () => import('./modulos/inventario.js'),
  cotizaciones: () => import('./modulos/cotizaciones.js'),
  prospectos: () => import('./modulos/prospectos.js'),
  lecturas: () => import('./modulos/lecturas.js'),
  importar: () => import('./modulos/importar.js'),
};

// ================= MARCA =================
(function aplicarMarca() {
  document.title = MARCA.nombre;
  if (MARCA.color) {
    const r = document.documentElement.style;
    r.setProperty('--primary', MARCA.color);
    r.setProperty('--primary-2', MARCA.color2 || MARCA.color);
    if (MARCA.colorSuave) r.setProperty('--primary-soft', MARCA.colorSuave);
  }
  if (MARCA.isotipo) {
    // Marca con isotipo (Unaria y clientes con logo en SVG): ícono + nombre en la letra de la marca
    const nombre = esc(MARCA.marca.join(' '));
    document.querySelector('.sidebar .brand').innerHTML = `<span class="brand-iso" aria-hidden="true">${MARCA.isotipo}</span><span class="brand-nombre">${nombre}</span>`;
    document.querySelector('.login-logos').innerHTML = `<span class="login-iso" aria-hidden="true">${MARCA.isotipo}</span>
      <strong class="login-marca">${nombre}</strong>${MARCA.lema ? `<span class="login-lema">${esc(MARCA.lema)}</span>` : ''}`;
  } else document.querySelector('.sidebar .brand').innerHTML = MARCA.marca.map(esc).join(' <span class="brand-sep">/</span> ');
  if (!MARCA.isotipo) document.querySelector('.login-logos').innerHTML = MARCA.logos.length ? MARCA.logos.map((l) =>
    `<picture><img src="${l.src}" alt="${esc(l.alt)}" class="${l.clase || ''}"></picture>`).join('<span class="login-logos-sep" aria-hidden="true"></span>')
    : `<strong class="login-nombre">${esc(MARCA.marca.join(' / '))}</strong>`;   // cliente sin logo todavía: su nombre
  if (MARCA.demo) {
    const b = document.createElement('div');
    b.className = 'demo-banda';
    b.innerHTML = `<b>Demostración</b><span class="demo-txt"> · datos de ejemplo; lo que captures se borra al recargar</span> <button type="button" id="demo-reiniciar">Reiniciar</button>`;
    document.body.prepend(b);
    document.body.classList.add('con-demo');
    b.querySelector('#demo-reiniciar').addEventListener('click', () => location.reload());
  }
})();
const pendiente = () => import('./modulos/pendiente.js');

const $ = (id) => document.getElementById(id);

// ================= ACCESO =================
// Usuarios sin correo propio reciben uno interno con este dominio (nunca recibe mensajes)
const DOMINIO_INTERNO = MARCA.dominioUsuarios || '@usuarios.medco.mx';

// El usuario puede escribir su nombre de usuario o, si tiene, su correo
async function correoDe(usuario) {
  if (usuario.includes('@')) return usuario;
  const { data, error } = await db().rpc('correo_para_login', { p_usuario: usuario });
  if (error) throw new Error('No se pudo conectar. Intenta de nuevo en un momento.');
  return data;
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = $('login-user').value.trim();
  const password = $('login-pass').value;
  if (!usuario || !password) return mensajeLogin('Escribe tu usuario y contraseña.');
  // Usuario de demostración: abre la plataforma completa con números inventados (no toca la base real)
  if (!CLIENTE && usuario.toLowerCase() === 'demo' && password === 'medco2026') { location.href = location.pathname + '?demo=medco#/inicio'; return; }
  $('login-btn').disabled = true;
  mensajeLogin('');
  try {
    const email = await correoDe(usuario);
    const { error } = email
      ? await sb.auth.signInWithPassword({ email, password })
      : { error: { message: 'Invalid login credentials' } };
    if (error) mensajeLogin(error.message === 'Invalid login credentials' ? 'Usuario o contraseña incorrectos.' : error.message);
  } catch (err) {
    mensajeLogin(err.message);
  } finally {
    $('login-btn').disabled = false;
  }
});

$('login-olvide').addEventListener('click', async () => {
  const usuario = $('login-user').value.trim();
  if (!usuario) return mensajeLogin('Escribe tu usuario y vuelve a darle a "¿Olvidaste tu contraseña?".');
  try {
    const email = await correoDe(usuario);
    if (email && !email.endsWith(DOMINIO_INTERNO)) {
      await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    }
    // Mismo mensaje exista o no el usuario, para no revelar quién tiene cuenta
    mensajeLogin('Si tu usuario tiene correo, te llegó un enlace para cambiar la contraseña. Si no tienes correo, pídele al administrador que te la cambie.');
  } catch (err) {
    mensajeLogin(err.message);
  }
});

// Pide una contraseña nueva. obligatoria = primera entrada con la contraseña temporal
function pedirNuevaPassword({ obligatoria = false } = {}) {
  const modal = abrirModal({
    titulo: obligatoria ? 'Crea tu contraseña' : 'Nueva contraseña',
    bloqueado: obligatoria,
    cuerpo: `<form class="form" id="np-form">
        ${obligatoria ? '<p class="nota">Estás entrando con una contraseña temporal. Elige una tuya que solo tú sepas.</p>' : ''}
        <label>Contraseña nueva<input type="password" id="np-1" minlength="6" autocomplete="new-password" required></label>
        <label>Repítela<input type="password" id="np-2" minlength="6" autocomplete="new-password" required></label>
        <small>Mínimo 6 caracteres.</small></form>`,
    pie: `<button class="btn btn-primary" id="np-guardar">Guardar</button>`,
  });
  modal.querySelector('#np-guardar').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const a = modal.querySelector('#np-1').value, b = modal.querySelector('#np-2').value;
    if (a.length < 6) return toast('La contraseña debe tener al menos 6 caracteres', true);
    if (a !== b) return toast('Las contraseñas no coinciden', true);
    btn.disabled = true;
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) {
      btn.disabled = false;
      return toast(error.message.includes('different') ? 'Debe ser distinta a la temporal' : error.message, true);
    }
    await db().rpc('marcar_password_cambiado');
    if (estado.miembro) estado.miembro.debe_cambiar_password = false;
    cerrarModal();
    toast('Contraseña guardada ✓');
  });
}

// Al abrir el enlace de "olvidé mi contraseña", pedir la nueva
sb.auth.onAuthStateChange((evento) => {
  if (evento === 'PASSWORD_RECOVERY') setTimeout(() => pedirNuevaPassword(), 0);
});

$('logout').addEventListener('click', () => sb.auth.signOut());
$('menu-btn').addEventListener('click', () => $('sidebar').classList.toggle('open'));

function mensajeLogin(t) { $('login-msg').textContent = t; }

sb.auth.onAuthStateChange((_evento, sesion) => {
  // Se difiere para no llamar a la base dentro del callback de auth
  setTimeout(() => (sesion ? entrar(sesion.user) : salir()), 0);
});

function salir() {
  estado.user = estado.miembro = null;
  quitarAsistente();
  $('shell').hidden = true;
  $('login').hidden = false;
}

let entrando = null;
async function entrar(user) {
  if (estado.user?.id === user.id && estado.miembro) return;
  if (entrando) return entrando;
  entrando = (async () => {
    estado.user = user;
    const { data: miembro, error } = await db().from('miembros')
      .select('org_id, nombre, rol, roles, empresas, debe_cambiar_password').eq('user_id', user.id).eq('activo', true).maybeSingle();

    if (error || !miembro) {
      $('login').hidden = false; $('shell').hidden = true;
      mensajeLogin(error
        ? 'No se pudo conectar con la base: ' + error.message
        : 'Tu usuario todavía no tiene acceso a la plataforma. Pídele al administrador que te dé de alta.');
      return;
    }
    estado.miembro = miembro;

    const [emp, cen] = await Promise.all([
      db().from('empresas').select('id, nombre, nombre_corto, color').eq('activo', true).order('nombre_corto'),
      db().from('centros').select('id, nombre, tipo, empresa_id, en_gastos').eq('activo', true).order('nombre'),
    ]);
    estado.empresas = emp.data || [];
    estado.centros = cen.data || [];

    const etiquetas = [miembro.rol, ...(miembro.roles || [])].map(rolLegible);
    $('user-box').innerHTML = `<span class="user-avatar" aria-hidden="true">${esc((miembro.nombre || '?').trim().charAt(0).toUpperCase())}</span>
      <span class="user-txt"><strong>${esc(miembro.nombre)}</strong><span>${esc([...new Set(etiquetas)].join(' · '))}</span></span>`;
    pintarNav();
    avisoProspectos();
    $('login').hidden = true;
    $('shell').hidden = false;
    navegar();
    iniciarAsistente();
    if (miembro.debe_cambiar_password) pedirNuevaPassword({ obligatoria: true });
  })().finally(() => (entrando = null));
  return entrando;
}

const rolLegible = (r) => ({ dueno: 'Dueño', socio: 'Socio', administracion: 'Administración', cobranza: 'Cobranza',
  operacion: 'Gastos', encargado: 'Encargado', lectura: 'Solo lectura' }[r] || r);

// ================= NAVEGACIÓN =================
const modulosDelUsuario = () => MODULOS.filter((m) => tieneRol(m.roles));

// Menú. Por omisión, todos los módulos por grupo. Con MARCA.menu, un menú corto: cada opción es un módulo
// ({ id }) o un grupo de módulos que se muestran como pestañas ({ titulo, modulos: [...] }); MARCA.ajustes va abajo,
// junto al nombre, como "Configuración". En el celular, las primeras opciones van en una barra abajo.
const ICONO_AJUSTES = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
const ICONO_MAS = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
let entradas = [];   // opciones del menú corto: { clave, titulo, icono, subs: [módulos que puede ver] }

function entradasMenu() {
  const mios = modulosDelUsuario();
  const de = (ids) => ids.map((id) => mios.find((m) => m.id === id)).filter(Boolean);
  const armar = (e, i) => {
    const subs = e.id ? de([e.id]) : de(e.modulos || []);
    if (!subs.length) return null;
    const unico = subs.length === 1 && !e.siempreGrupo;
    return { clave: e.id || 'g' + i, titulo: unico && !e.id ? subs[0].titulo : (e.titulo || subs[0].titulo), corto: e.corto,
      icono: e.icono ? (mios.find((m) => m.id === e.icono)?.icono || subs[0].icono) : subs[0].icono, subs, abajo: !!e.abajo };
  };
  const lista = MARCA.menu.map(armar).filter(Boolean);
  const aj = armar({ titulo: 'Configuración', modulos: MARCA.ajustes || [], siempreGrupo: true }, 'aj');
  if (aj) { aj.icono = ICONO_AJUSTES; aj.abajo = true; lista.push(aj); }
  return lista;
}

function pintarNav() {
  const mios = modulosDelUsuario();
  if (MARCA.menu) {
    entradas = entradasMenu();
    const liga = (e) => `<a href="#/${e.subs[0].id}" data-mod="${e.subs[0].id}" data-subs="${e.subs.map((m) => m.id).join(' ')}">
        <span class="nav-ico">${e.icono}</span>${esc(e.titulo)}</a>`;
    $('nav').innerHTML = `<div class="nav-grupo">${entradas.filter((e) => !e.abajo).map(liga).join('')}</div>`;
    let abajo = document.getElementById('nav-abajo');
    if (!abajo) { abajo = document.createElement('nav'); abajo.id = 'nav-abajo'; abajo.className = 'nav nav-abajo'; abajo.setAttribute('aria-label', 'Configuración');
      document.querySelector('.sidebar-foot').before(abajo); }
    abajo.innerHTML = entradas.filter((e) => e.abajo).map(liga).join('');
    // Barra de abajo en el celular: hasta 4 opciones + "Más" (abre el menú completo)
    let barra = document.getElementById('barra-movil');
    if (!barra) { barra = document.createElement('nav'); barra.id = 'barra-movil'; barra.className = 'barra-movil'; barra.setAttribute('aria-label', 'Menú rápido');
      document.body.appendChild(barra); document.body.classList.add('con-barra'); }
    const principales = entradas.filter((e) => !e.abajo);
    const enBarra = principales.length <= 5 ? principales : principales.slice(0, 4);
    barra.innerHTML = enBarra.map((e) => `<a href="#/${e.subs[0].id}" data-subs="${e.subs.map((m) => m.id).join(' ')}"><span class="nav-ico">${e.icono}</span><span>${esc(e.corto || e.titulo)}</span></a>`).join('')
      + (principales.length > 5 || entradas.some((e) => e.abajo) ? `<button type="button" id="barra-mas"><span class="nav-ico">${ICONO_MAS}</span><span>Más</span></button>` : '');
    barra.querySelector('#barra-mas')?.addEventListener('click', () => $('sidebar').classList.toggle('open'));
    return;
  }
  const grupos = [...new Set(mios.map((m) => m.grupo))];
  $('nav').innerHTML = grupos.map((g) => `
    <div class="nav-grupo">
      ${grupos.length > 1 ? `<span class="nav-titulo">${esc(g)}</span>` : ''}
      ${mios.filter((m) => m.grupo === g).map((m) => `
        <a href="#/${m.id}" data-mod="${m.id}">
          <span class="nav-ico">${m.icono}</span>${esc(m.titulo)}
          ${m.listo ? '' : '<span class="nav-tag">pronto</span>'}
        </a>`).join('')}
    </div>`).join('');
}

// Contador en el menú de prospectos que llevan más de una hora sin respuesta (se revisa cada 5 minutos)
async function avisoProspectos() {
  const a = document.querySelector('#nav a[data-mod="prospectos"]') || [...document.querySelectorAll('#nav a[data-subs]')].find((x) => x.dataset.subs.split(' ').includes('prospectos'));
  if (!a) return;
  try {
    const desde = new Date(Date.now() - 3600e3).toISOString();
    const { count, error } = await db().from('prospectos').select('id', { count: 'exact', head: true })
      .eq('estado', 'nuevo').is('primera_respuesta', null).lt('creado_en', desde);
    if (error) return;
    a.querySelector('.nav-badge')?.remove();
    if (count) a.insertAdjacentHTML('beforeend', `<span class="nav-badge" title="Sin contestar hace más de 1 hora">${count}</span>`);
  } catch (e) { /* sin aviso si no hay conexión */ }
}
setInterval(() => { if (estado.miembro) avisoProspectos(); }, 5 * 60e3);

window.addEventListener('hashchange', navegar);

async function navegar() {
  if (!estado.miembro) return;
  const mios = modulosDelUsuario();
  let id = location.hash.replace(/^#\/?/, '').split('?')[0];
  let mod = mios.find((m) => m.id === id);
  if (!mod) {
    mod = mios.find((m) => m.listo) || mios[0];
    if (!mod) {
      $('page-title').textContent = 'Sin módulos';
      $('view').innerHTML = '<div class="vacio">Tu usuario todavía no tiene módulos asignados. Pídele al administrador que te dé acceso.</div>';
      return;
    }
    history.replaceState(null, '', '#/' + mod.id);
  }
  const enMenu = (a) => a.dataset.subs ? a.dataset.subs.split(' ').includes(mod.id) : a.dataset.mod === mod.id;
  document.querySelectorAll('#nav a, #nav-abajo a, #barra-movil a').forEach((a) => a.classList.toggle('active', enMenu(a)));
  $('sidebar').classList.remove('open');
  // En el menú corto, los módulos de un mismo grupo se muestran como pestañas arriba de la pantalla
  const grupo = MARCA.menu ? entradas.find((e) => e.subs.length > 1 && e.subs.some((m) => m.id === mod.id)) : null;
  $('page-title').textContent = grupo ? grupo.titulo : mod.titulo;
  $('page-actions').innerHTML = '';
  // Cada vez que se abre un módulo se le da una caja nueva. Si una carga anterior sigue en camino
  // (doble clic, cambio rápido de pantalla, sesión que se renueva), termina en su caja vieja y no estorba.
  const mio = ++turno;
  const view = $('view');
  const caja = document.createElement('div');
  caja.className = 'vista';
  caja.innerHTML = '<div class="cargando">Cargando…</div>';
  if (grupo) {
    const pest = document.createElement('div');
    pest.className = 'sub-modulos';
    pest.innerHTML = `<div class="tabs" role="tablist">${grupo.subs.map((m) => `<a role="tab" href="#/${m.id}" aria-selected="${m.id === mod.id}">${esc(m.titulo)}</a>`).join('')}</div>`;
    view.replaceChildren(pest, caja);
  } else view.replaceChildren(caja);
  try {
    const m = await (vistas[mod.vista || mod.id] || pendiente)();
    if (mio !== turno) return;
    await m.render(caja, mod);
  } catch (e) {
    console.error(e);
    if (mio === turno) caja.innerHTML = `<div class="vacio">No se pudo cargar el módulo.<br><small>${esc(e.message)}</small></div>`;
  }
  if (mio === turno) view.focus({ preventScroll: true });
}
let turno = 0;

// Arranque: si no hay sesión, mostrar acceso
sb.auth.getSession().then(({ data }) => { if (!data.session) salir(); });
window.addEventListener('unhandledrejection', (e) => toast(e.reason?.message || 'Error inesperado', true));
