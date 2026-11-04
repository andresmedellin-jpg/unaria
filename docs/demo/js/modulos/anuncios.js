// Anuncios: lo que trajo cada campaña. Los anuncios de Meta que llevan a un mensaje (WhatsApp, Instagram o Messenger)
// marcan solos la conversación con el anuncio del que vino; los de Google y la página se miden con UTM.
// Cuenta: conversaciones → cotizados → apartados (anticipo) → vendido. Tablas: anuncios, conversaciones, eventos.
import { db, esc } from '../lib.js';
import { CANALES, VENDIDOS, estilos, dinero } from './eventos-comun.js';

export async function render(view) {
  estilos();
  document.getElementById('page-actions').innerHTML = '';
  const [a, c, e] = await Promise.all([db().from('anuncios').select('*'), db().from('conversaciones').select('id, anuncio_id, etiqueta'), db().from('eventos').select('*')]);
  if (a.error) { view.innerHTML = `<div class="vacio">No se pudieron cargar los anuncios: ${esc(a.error.message)}</div>`; return; }
  const ads = a.data || [], convs = c.data || [], evs = e.data || [];

  const datos = ads.map((ad) => {
    const conv = convs.filter((x) => x.anuncio_id === ad.id).length + Number(ad.previas || 0);   // previas: conversaciones de días anteriores
    const sol = evs.filter((x) => x.anuncio_id === ad.id);
    // contactos: conversaciones del anuncio + solicitudes que llegaron sin conversación (formulario)
    const contactos = conv + sol.filter((x) => !x.conversacion_id).length;
    const cotizados = sol.filter((x) => x.estado !== 'solicitud' && x.estado !== 'cancelado').length;
    const vend = sol.filter((x) => VENDIDOS.includes(x.estado));
    const vendido = vend.reduce((s, x) => s + Number(x.monto || 0), 0);
    return { ad, contactos, cotizados, apartados: vend.length, vendido };
  }).sort((x, y) => y.vendido - x.vendido);
  const tot = datos.reduce((s, d) => ({ inv: s.inv + Number(d.ad.inversion || 0), con: s.con + d.contactos, ap: s.ap + d.apartados, ven: s.ven + d.vendido }), { inv: 0, con: 0, ap: 0, ven: 0 });
  const sinAnuncio = evs.filter((x) => !x.anuncio_id && VENDIDOS.includes(x.estado)).reduce((s, x) => s + Number(x.monto || 0), 0);

  const plat = (p) => (p === 'Instagram' ? CANALES.instagram : p === 'Facebook' ? CANALES.facebook : CANALES.google);
  view.innerHTML = `
    <div class="chb-kpis">
      <div class="chb-kpi"><b>${dinero(tot.inv)}</b><span>Invertido en anuncios</span></div>
      <div class="chb-kpi"><b>${tot.con}</b><span>Personas que escribieron o cotizaron</span></div>
      <div class="chb-kpi"><b>${tot.ap}</b><span>Eventos apartados por anuncios</span></div>
      <div class="chb-kpi"><b>${tot.inv ? (tot.ven / tot.inv).toFixed(1) + '×' : '—'}</b><span>Vendido por cada peso invertido</span></div>
    </div>
    <div class="chb-ads">${datos.map((d) => {
      const k = plat(d.ad.plataforma), max = Math.max(1, d.contactos);
      const paso = (n, t) => `<div class="chb-paso"><b>${n}</b><span>${t}</span><i class="bar" style="width:${Math.round((typeof n === 'number' ? n : 0) / max * 100)}%"></i></div>`;
      return `<div class="chb-adc">
        <div class="top"><span class="av" style="background:${k.c}">${k.ico}</span>
          <span class="q"><b>${esc(d.ad.nombre)}</b><small>${esc(d.ad.plataforma)} → ${esc(d.ad.destino)} · desde el ${esc(new Date(d.ad.inicio + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }))}</small></span>
          <span class="chb-est" style="background:${d.ad.activo ? '#D1FADF' : '#F2F4F7'};color:${d.ad.activo ? '#067647' : '#475467'}">${d.ad.activo ? 'Activo' : 'Pausado'}</span></div>
        <div class="chb-emb">${paso(d.contactos, 'escribieron o cotizaron')}${paso(d.cotizados, 'se les mandó precio')}${paso(d.apartados, 'apartaron con anticipo')}<div class="chb-paso"><b>${dinero(d.vendido)}</b><span>vendido</span></div></div>
        <div class="pie"><span>Invertido <b>${dinero(d.ad.inversion)}</b></span><span>Por contacto <b>${d.contactos ? dinero(Math.round(d.ad.inversion / d.contactos)) : '—'}</b></span><span>Por evento apartado <b>${d.apartados ? dinero(Math.round(d.ad.inversion / d.apartados)) : '—'}</b></span><span>Retorno <b>${d.ad.inversion ? (d.vendido / d.ad.inversion).toFixed(1) + '×' : '—'}</b></span></div>
      </div>`;
    }).join('')}</div>
    <p class="chb-nota">Eventos vendidos sin anuncio (recomendación, clientes de siempre): ${dinero(sinAnuncio)}. Inversión y resultados de ejemplo. En el sistema real, lo invertido se lee de la cuenta de anuncios de Meta y de Google, y cada conversación trae de qué anuncio vino.</p>`;
}
