// Negocio que apenas arranca en el sistema: qué se le va a poner y qué falta para empezar (MARCA.negocios[].preparacion).
import { esc } from '../lib.js';

export function render(view, mod) {
  document.getElementById('page-actions').innerHTML = '';
  const n = mod?.negocio || {}, p = n.preparacion || {};
  view.innerHTML = `<div class="migrando" style="max-width:620px;text-align:left">
    <div class="migrando-ico">${mod?.icono || ''}</div>
    <h2>${esc(p.titulo || `${n.nombre || 'Este negocio'} se está preparando`)}</h2>
    ${p.texto ? `<p>${esc(p.texto)}</p>` : ''}
    ${(p.va || []).length ? `<h3 style="margin:14px 0 6px;font-size:15px">Lo que va a tener</h3><ul>${p.va.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${(p.falta || []).length ? `<h3 style="margin:14px 0 6px;font-size:15px">Lo que falta para empezar</h3><ul>${p.falta.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  </div>`;
}
