/* Chat de Unaria — burbuja que se pone en cualquier página con una línea:
   <script src="https://unaria.mx/chat-widget.js" defer
     data-api="https://unaria.mx/api/chat"
     data-titulo="¿Por dónde empiezo?" data-subtitulo="Cuéntanos de tu negocio"
     data-saludo="Hola. ¿Qué es lo que más tiempo le quita a tu negocio?"
     data-opciones="Capturo lo mismo en varios lados|No sé cuánto vendo|Todo en Excel y WhatsApp"
     data-color="#BF4D17" data-logo="https://cliente.com/logo.png" data-aviso="https://unaria.mx/aviso-de-privacidad"
     data-whatsapp="8112345678" data-agenda="https://..." data-correo="hola@unaria.mx"
     data-contenedor="#lugar"   (opcional: además de la burbuja, se muestra dentro de ese elemento)
     data-flotante="no"         (opcional: sin burbuja)></script>
   Colores: la página puede definir --uc-acento, --uc-fondo, --uc-superficie, --uc-texto, --uc-gris, --uc-linea,
   --uc-tinta, --uc-sobre-tinta, --uc-sobre-acento y --uc-fuente; si no, se usan los de abajo. */
(function () {
  if (window.UnariaChat) return;
  const yo = document.currentScript || document.querySelector('script[src*="chat-widget.js"]');
  const d = (yo && yo.dataset) || {};
  const C = {
    api: d.api || (yo ? new URL('api/chat', yo.src).href : '/api/chat'),
    titulo: d.titulo || '¿Por dónde empiezo?',
    subtitulo: d.subtitulo || 'Cuéntanos de tu negocio',
    saludo: d.saludo || 'Hola. ¿En qué te podemos ayudar?',
    opciones: (d.opciones || '').split('|').map(s => s.trim()).filter(Boolean),
    color: d.color || '',
    logo: /^(https?:\/\/|\/)/.test(d.logo || '') ? d.logo : '',
    aviso: d.aviso || '',
    whatsapp: /^\d{10}$/.test(d.whatsapp || '') ? d.whatsapp : '',
    agenda: /^https:\/\//.test(d.agenda || '') ? d.agenda : '',
    correo: d.correo || '',
    contenedor: d.contenedor || '',
    flotante: d.flotante !== 'no',
    boton: d.boton || d.titulo || '¿Por dónde empiezo?'
  };
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CLAVE = 'unaria-chat:' + C.api;
  const q = new URLSearchParams(location.search);
  const UTM = {}; ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'gclid', 'fbclid'].forEach(k => { if (q.get(k)) UTM[k] = q.get(k).slice(0, 200); });

  // Estado (se recuerda mientras la pestaña siga abierta)
  let S = null;
  try { S = JSON.parse(sessionStorage.getItem(CLAVE) || 'null'); } catch (_) {}
  if (!S || !Array.isArray(S.mensajes)) S = { id: nuevoId(), mensajes: [{ role: 'assistant', content: C.saludo }], opciones: C.opciones, completo: false, resumen: '', utm: UTM };
  if (Object.keys(UTM).length) S.utm = UTM;
  function guardar() { try { sessionStorage.setItem(CLAVE, JSON.stringify(S)); } catch (_) {} }
  function nuevoId() { try { return crypto.randomUUID(); } catch (_) { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); } }

  const CSS = `
:host { all: initial; display: block; font-family: var(--uc-fuente, inherit); color: var(--uc-texto, #2A2C2F);
  --a: var(--uc-acento, ${C.color || '#BF4D17'}); --sa: var(--uc-sobre-acento, #FFFFFF); --sup: var(--uc-superficie, #FFFFFF);
  --fon: var(--uc-fondo, #F7F6F4); --tin: var(--uc-tinta, #121314); --st: var(--uc-sobre-tinta, #F7F6F4);
  --gri: var(--uc-gris, #62666C); --lin: var(--uc-linea, #E2E1DE); --tex: var(--uc-texto, #2A2C2F); }
* { box-sizing: border-box; }
.caja { background: var(--sup); border: 1px solid var(--lin); border-radius: 12px; display: flex; flex-direction: column; overflow: hidden;
  height: 540px; box-shadow: 0 24px 60px -32px rgba(18,19,20,.35); font: 400 16px/1.45 var(--uc-fuente, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif); color: var(--tex); }
.cab { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--lin); }
.ava { width: 38px; height: 38px; border-radius: 8px; background: #121314; display: grid; place-items: center; flex: none; }
.ava svg { width: 20px; height: 20px; }
.cab b { display: block; font-weight: 600; font-size: 1rem; color: var(--tin); }
.cab small { display: block; font-size: .84rem; color: var(--gri); }
.cerrar { margin-left: auto; width: 40px; height: 40px; border-radius: 8px; border: 1px solid var(--lin); background: transparent; color: var(--tin); font-size: 1.3rem; cursor: pointer; }
.log { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; overscroll-behavior: contain; }
.log > :first-child { margin-top: auto; }
.m { max-width: 86%; padding: 10px 14px; border-radius: 12px; font-size: .97rem; line-height: 1.45; overflow-wrap: anywhere; white-space: pre-line; }
.m.b { align-self: flex-start; background: var(--fon); border: 1px solid var(--lin); border-bottom-left-radius: 4px; }
.m.u { align-self: flex-end; background: var(--tin); color: var(--st); border-bottom-right-radius: 4px; }
.m a { color: var(--a); font-weight: 600; }
.esc { display: inline-flex; gap: 4px; } .esc i { width: 6px; height: 6px; border-radius: 50%; background: var(--gri); opacity: .4; animation: p 1s infinite; }
.esc i:nth-child(2) { animation-delay: .15s; } .esc i:nth-child(3) { animation-delay: .3s; }
@keyframes p { 50% { opacity: 1; } }
.ops { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 16px 12px; } .ops:empty { display: none; }
.op { font-family: inherit; font-weight: 500; font-size: .9rem; line-height: 1.25; color: var(--tin); background: transparent; border: 1.5px solid var(--tin); border-radius: 999px; padding: 9px 14px; cursor: pointer; text-align: left; text-decoration: none; }
.op:hover { background: color-mix(in srgb, var(--a) 12%, transparent); }
.op.f { background: var(--a); border-color: var(--a); color: var(--sa); }
form { display: flex; gap: 8px; padding: 12px 16px 8px; border-top: 1px solid var(--lin); margin: 0; }
input { flex: 1; min-width: 0; border: 1px solid var(--lin); background: var(--fon); color: var(--tin); border-radius: 8px; padding: 11px 12px; font: inherit; font-size: 1rem; }
input:focus { outline: none; border-color: var(--a); }
button.env { border: 0; border-radius: 8px; background: var(--tin); color: var(--st); font-family: inherit; font-weight: 600; font-size: .95rem; padding: 0 16px; cursor: pointer; }
button.env:disabled { opacity: .5; cursor: default; }
.nota { padding: 0 16px 10px; font-size: .78rem; color: var(--gri); } .nota a { color: var(--gri); }
:focus-visible { outline: 2px solid var(--a); outline-offset: 2px; }
.oculta { position: absolute; left: -9999px; }
@media (prefers-reduced-motion: reduce) { .esc i { animation: none; } }`;
  const LOGO = '<svg viewBox="0 0 120 120" aria-hidden="true"><g fill="#F7F6F4"><rect x="0" y="0" width="36" height="36" rx="4"/><rect x="0" y="42" width="36" height="36" rx="4"/><rect x="0" y="84" width="36" height="36" rx="4"/><rect x="84" y="0" width="36" height="36" rx="4"/><rect x="84" y="42" width="36" height="36" rx="4"/><rect x="84" y="84" width="36" height="36" rx="4"/></g><rect x="42" y="84" width="36" height="36" rx="4" fill="#E9682C"/></svg>';

  // Elemento del chat (uno solo: vive en la página o en la ventana flotante)
  const host = document.createElement('div');
  host.setAttribute('data-unaria-chat', '');
  const raiz = host.attachShadow({ mode: 'open' });
  raiz.innerHTML = `<style>${CSS}</style>
    <div class="caja" role="region" aria-label="${esc(C.titulo)}">
      <div class="cab"><span class="ava">${C.logo ? `<img src="${esc(C.logo)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px">` : LOGO}</span><div><b>${esc(C.titulo)}</b><small>${esc(C.subtitulo)}</small></div>
        <button class="cerrar" type="button" aria-label="Cerrar" hidden>×</button></div>
      <div class="log" aria-live="polite"></div>
      <div class="ops"></div>
      <form autocomplete="off"><label class="oculta" for="t">Tu mensaje</label>
        <input id="t" maxlength="1000" placeholder="Escribe cualquier pregunta…"><button class="env" type="submit">Enviar</button></form>
      ${C.aviso ? `<p class="nota">Cuidamos tus datos: <a href="${esc(C.aviso)}" target="_blank" rel="noopener">aviso de privacidad</a></p>` : ''}
    </div>`;
  const $ = s => raiz.querySelector(s);
  const log = $('.log'), ops = $('.ops'), form = $('form'), entrada = $('#t'), enviar = $('.env'), cerrarB = $('.cerrar');

  function esc(t) { return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function enlaces(t) { return esc(t).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, u => `<a href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\//, '')}</a>`); }
  function sinOpciones(t) { return String(t).replace(/\n?\s*OPCIONES:.*$/i, '').trim(); }
  function bajar() { log.scrollTop = log.scrollHeight; }
  function burbuja(rol, texto) {
    const m = document.createElement('div'); m.className = 'm ' + (rol === 'user' ? 'u' : 'b');
    if (rol === 'user') m.textContent = texto; else m.innerHTML = enlaces(sinOpciones(texto));
    log.appendChild(m); bajar(); return m;
  }
  function pintarOpciones() {
    ops.innerHTML = '';
    if (S.completo) return cierre();
    (S.opciones || []).forEach(t => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'op'; b.textContent = t;
      b.addEventListener('click', () => mandar(t)); ops.appendChild(b);
    });
    bajar();
  }
  function cierre(fallo) {
    ops.innerHTML = '';
    const txt = 'Hola, platiqué con el asistente de ' + location.hostname + '.' + (S.resumen ? '\n' + S.resumen : '');
    if (C.whatsapp) {
      const a = document.createElement('a'); a.className = 'op f'; a.textContent = 'Seguir por WhatsApp';
      a.href = 'https://wa.me/52' + C.whatsapp + '?text=' + encodeURIComponent(txt); a.target = '_blank'; a.rel = 'noopener';
      a.addEventListener('click', () => medir('whatsapp')); ops.appendChild(a);
    }
    if (C.agenda) {
      const a = document.createElement('a'); a.className = 'op'; a.textContent = 'Agenda una llamada de 30 min';
      a.href = C.agenda; a.target = '_blank'; a.rel = 'noopener'; a.addEventListener('click', () => medir('agendar')); ops.appendChild(a);
    }
    if (fallo && !C.whatsapp && !C.agenda && C.correo) {
      const a = document.createElement('a'); a.className = 'op f'; a.textContent = 'Escríbenos: ' + C.correo; a.href = 'mailto:' + C.correo; ops.appendChild(a);
    }
    bajar();
  }
  function medir(evento, extra) {
    try { window.dispatchEvent(new CustomEvent('unaria-chat', { detail: Object.assign({ evento }, extra) })); } catch (_) {}
    try { if (window.gtag) gtag('event', evento, extra || {}); } catch (_) {}
    try { if (window.fbq) fbq('track', { generate_lead: 'Lead', whatsapp: 'Contact', agendar: 'Schedule' }[evento] || 'ViewContent'); } catch (_) {}
  }

  let ocupado = false, empezo = S.mensajes.some(m => m.role === 'user');
  async function mandar(texto) {
    texto = String(texto || '').trim().slice(0, 1000);
    if (!texto || ocupado) return;
    if (!empezo) { empezo = true; medir('chat_iniciado'); }
    ocupado = true; enviar.disabled = true; ops.innerHTML = '';
    S.mensajes.push({ role: 'user', content: texto }); burbuja('user', texto); guardar();
    const ind = document.createElement('div'); ind.className = 'm b'; ind.innerHTML = '<span class="esc" aria-label="Escribiendo"><i></i><i></i><i></i></span>';
    log.appendChild(ind); bajar();
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 30000);
      const r = await fetch(C.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
        body: JSON.stringify({ id: S.id, mensajes: S.mensajes.slice(-40), pagina: location.href.slice(0, 300), utm: S.utm || {} }) });
      clearTimeout(to);
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      ind.remove();
      const t = (j.texto || '') + (j.opciones && j.opciones.length ? '\nOPCIONES: ' + j.opciones.join(' | ') : '');
      S.mensajes.push({ role: 'assistant', content: t }); burbuja('assistant', t);
      S.opciones = j.opciones || [];
      if (j.completo && !S.completo) { S.completo = true; S.resumen = j.resumen || ''; medir('generate_lead', { method: 'chat' }); }
      guardar(); pintarOpciones();
    } catch (_) {
      ind.remove();
      burbuja('assistant', 'No pude conectarme en este momento.' + (C.whatsapp ? ' Escríbenos por WhatsApp y te atendemos ahí.' : C.correo ? ' Escríbenos a ' + C.correo + '.' : ' Intenta de nuevo en un momento.'));
      S.mensajes.pop(); guardar(); cierre(true);
    } finally { ocupado = false; enviar.disabled = false; }
  }
  form.addEventListener('submit', e => { e.preventDefault(); const t = entrada.value; entrada.value = ''; mandar(t); });

  // Pintar lo que ya había (si recargó la página)
  S.mensajes.forEach(m => burbuja(m.role, m.content));
  pintarOpciones();

  // Dónde vive: en la página (contenedor) y/o en una ventana flotante
  const lugar = C.contenedor ? document.querySelector(C.contenedor) : null;
  const estilo = document.createElement('style');
  estilo.textContent = `
[data-unaria-flotante]{position:fixed;z-index:2147483000;right:calc(18px + env(safe-area-inset-right,0px));bottom:calc(18px + env(safe-area-inset-bottom,0px));
  display:inline-flex;align-items:center;gap:10px;min-height:52px;padding:0 20px;border-radius:999px;border:0;cursor:pointer;
  background:var(--uc-acento,${C.color || '#BF4D17'});color:var(--uc-sobre-acento,#fff);font:600 1rem var(--uc-fuente,system-ui,-apple-system,'Segoe UI',Arial,sans-serif);
  box-shadow:0 12px 30px -10px rgba(18,19,20,.45);transition:opacity .2s ease,transform .2s ease}
[data-unaria-flotante].oculto{opacity:0;transform:translateY(12px);pointer-events:none}
[data-unaria-flotante] svg{width:20px;height:20px}
[data-unaria-panel]{position:fixed;z-index:2147483001;right:calc(18px + env(safe-area-inset-right,0px));bottom:calc(18px + env(safe-area-inset-bottom,0px));width:min(420px,calc(100vw - 36px))}
@media (max-width:560px){[data-unaria-panel]{left:0;right:0;bottom:0;width:auto;padding-bottom:env(safe-area-inset-bottom,0px)}}`;
  document.head.appendChild(estilo);
  const panel = document.createElement('div'); panel.setAttribute('data-unaria-panel', ''); panel.hidden = true;
  const flot = document.createElement('button'); flot.type = 'button'; flot.setAttribute('data-unaria-flotante', '');
  flot.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>';
  flot.appendChild(document.createTextNode(C.boton));
  document.body.append(panel);
  if (C.flotante) document.body.append(flot);

  let enPanel = false, visible = false;
  const caja = $('.caja');
  function alto() {
    if (!enPanel) { caja.style.height = ''; return; }
    caja.style.height = innerWidth <= 560 ? `calc(${innerHeight}px - 72px - env(safe-area-inset-top, 0px))` : `min(620px, calc(${innerHeight}px - 120px))`;
  }
  function abrir() {
    if (lugar && visible && !enPanel) {
      lugar.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      setTimeout(() => entrada.focus({ preventScroll: true }), reduce ? 0 : 450); return;
    }
    if (enPanel) return;
    if (lugar) { lugar.style.minHeight = caja.offsetHeight + 'px'; panel.appendChild(host); }
    panel.hidden = false; cerrarB.hidden = false; enPanel = true; alto(); flotante();
    bajar(); entrada.focus({ preventScroll: true });
  }
  function cerrar() {
    if (!enPanel) return;
    if (lugar) { lugar.appendChild(host); lugar.style.minHeight = ''; }
    panel.hidden = true; cerrarB.hidden = true; enPanel = false; alto(); flotante(); bajar();
  }
  function flotante() { flot.classList.toggle('oculto', enPanel || !!(lugar && visible)); }
  flot.addEventListener('click', abrir);
  cerrarB.addEventListener('click', cerrar);
  addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
  addEventListener('resize', alto);
  if (lugar) {
    lugar.appendChild(host);
    if ('IntersectionObserver' in window) new IntersectionObserver(([en]) => { visible = en.isIntersecting; flotante(); }, { threshold: 0.15 }).observe(lugar);
  } else {
    panel.appendChild(host); // sin contenedor: solo vive en la ventana flotante
  }
  flotante();

  window.UnariaChat = { abrir: () => abrir(), cerrar: () => cerrar(), mandar };
})();
