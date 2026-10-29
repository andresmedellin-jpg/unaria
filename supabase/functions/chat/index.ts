// Servidor del chat de Unaria como función de Supabase (https://<proyecto>.supabase.co/functions/v1/chat).
// Igual para todos los clientes; lo de cada cliente vive en config.ts.
// Secretos (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY  obligatorio: llave de Anthropic del cliente (con tope de gasto mensual)
//   RESEND_API_KEY, AVISO_PARA, AVISO_DE  opcionales: aviso por correo cuando un prospecto queda completo
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo.
import CONFIG from './config.ts';

const LIM = { mensajes: 40, porMensaje: 1500, total: 30000, vueltas: 4 };
const env = (k: string) => Deno.env.get(k) || '';

function cors(req: Request): Record<string, string> {
  const origen = req.headers.get('Origin') || '';
  const ok = (CONFIG.origenes || []).includes(origen) || /^http:\/\/localhost(:\d+)?$/.test(origen);
  return ok ? { 'Access-Control-Allow-Origin': origen, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, apikey, authorization, x-client-info', 'Vary': 'Origin' } : {};
}
function json(cuerpo: unknown, estado: number, extra: Record<string, string>) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra } });
}

Deno.serve(async (req: Request) => {
  const h = cors(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  // GET: la página pregunta si el chat ya está listo (tiene llave de Anthropic) antes de mostrarlo
  if (req.method === 'GET') return json({ listo: !!env('ANTHROPIC_API_KEY') }, 200, { ...h, 'Cache-Control': 'no-store' });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405, h);
  if (!h['Access-Control-Allow-Origin'] && req.headers.get('Origin')) return json({ error: 'Origen no permitido' }, 403, h);
  if (!env('ANTHROPIC_API_KEY')) return json({ error: 'Chat sin configurar' }, 503, h);

  let b: any; try { b = await req.json(); } catch (_) { return json({ error: 'Solicitud inválida' }, 400, h); }
  const id = String(b.id || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return json({ error: 'Conversación inválida' }, 400, h);

  const crudos = Array.isArray(b.mensajes) ? b.mensajes.slice(-LIM.mensajes) : [];
  const mensajes: { role: string; content: string }[] = []; let total = 0;
  for (const m of crudos) {
    const role = m && m.role === 'assistant' ? 'assistant' : 'user';
    const content = String((m && m.content) || '').slice(0, LIM.porMensaje).trim();
    if (!content) continue;
    total += content.length;
    if (mensajes.length && mensajes[mensajes.length - 1].role === role) mensajes[mensajes.length - 1].content += '\n' + content;
    else mensajes.push({ role, content });
  }
  // El saludo de la página (primer mensaje del asistente) se le pasa a Claude como contexto
  let saludo = '';
  while (mensajes.length && mensajes[0].role !== 'user') saludo += (saludo ? '\n' : '') + mensajes.shift()!.content;
  if (!mensajes.length || mensajes[mensajes.length - 1].role !== 'user') return json({ error: 'Falta el mensaje' }, 400, h);
  if (total > LIM.total) return json({ texto: 'La plática ya va muy larga. Para seguir, escríbenos por WhatsApp y con gusto te atendemos.', opciones: [], completo: false }, 200, h);

  const herramientas: any[] = [{
    name: 'registrar_datos',
    description: 'Guarda en el sistema la información que el visitante ha dado. Solo incluye los campos nuevos o corregidos.',
    input_schema: { type: 'object', properties: CONFIG.campos }
  }];
  if (CONFIG.calculadora) herramientas.push({
    name: 'calcular_costo',
    description: 'Calcula cuánto le cuesta a la empresa copiar datos a mano: horas a la semana de todo el equipo por el sueldo mensual de quien captura. Devuelve el costo al mes y al año en pesos.',
    input_schema: { type: 'object', required: ['horas_semana', 'sueldo_mensual'], properties: {
      horas_semana: { type: 'number', description: 'Horas a la semana. Si dio un rango, usa el punto medio (menos de 5 = 3.5, más de 20 = 25).' },
      sueldo_mensual: { type: 'number', description: 'Sueldo mensual en pesos. Si dio un rango, usa el punto medio; si no quiso decir, usa 15000.' } } }
  });

  const datos: Record<string, unknown> = {};
  const conv: any[] = mensajes.map(m => ({ role: m.role, content: m.content }));
  const system = CONFIG.prompt + (saludo ? '\n\nTu primer mensaje en la página (ya lo vio la persona): "' + saludo.slice(0, 400) + '"' : '');
  let texto = '';
  try {
    for (let vuelta = 0; vuelta < LIM.vueltas; vuelta++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: CONFIG.modelo, max_tokens: CONFIG.maxTokens || 400, system, tools: herramientas, messages: conv })
      });
      if (!r.ok) { console.error('anthropic', r.status, await r.text()); return json({ error: 'Sin respuesta' }, 502, h); }
      const j = await r.json();
      const bloques = j.content || [];
      texto = bloques.filter((x: any) => x.type === 'text').map((x: any) => x.text).join('\n').trim();
      const usos = bloques.filter((x: any) => x.type === 'tool_use');
      if (j.stop_reason !== 'tool_use' || !usos.length) break;
      conv.push({ role: 'assistant', content: bloques });
      conv.push({ role: 'user', content: usos.map((u: any) => ({ type: 'tool_result', tool_use_id: u.id, content: ejecutar(u, datos) })) });
    }
  } catch (e) { console.error('chat', e); return json({ error: 'Sin respuesta' }, 502, h); }

  // Botones de respuesta rápida: última línea "OPCIONES: a | b | c"
  let opciones: string[] = [];
  const m = texto.match(/\n?\s*OPCIONES:\s*(.+)\s*$/i);
  if (m) { opciones = m[1].split('|').map(s => s.trim()).filter(Boolean).slice(0, 5); texto = texto.slice(0, m.index).trim(); }
  if (!texto) texto = 'Perdón, ¿me lo repites?';

  // Guardar en la base: los datos nuevos y la plática completa
  const historial = (saludo ? [{ role: 'assistant', content: saludo }] : []).concat(mensajes,
    [{ role: 'assistant', content: texto + (opciones.length ? '\nOPCIONES: ' + opciones.join(' | ') : '') }]);
  const hay = Object.keys(datos).length > 0;
  let completo = false, todo: any = datos;
  const res = await guardar({
    externo_id: 'chat:' + id, empresa_destino: CONFIG.empresaDestino, solo_actualizar: !hay,
    datos: hay ? datos : undefined, conversacion: historial.slice(-40),
    pagina: String(b.pagina || '').slice(0, 300), utm: typeof b.utm === 'object' && b.utm ? b.utm : {}
  });
  if (res && res.nuevo_completo) { completo = true; todo = res.datos || datos; await avisar(todo, id); }

  return json({ texto, opciones, completo, resumen: completo ? (todo.resumen || '') : undefined }, 200, h);
});

function ejecutar(uso: any, datos: Record<string, unknown>): string {
  const i = uso.input || {};
  if (uso.name === 'registrar_datos') {
    for (const [k, v] of Object.entries(i)) if (k in CONFIG.campos && v !== null && v !== '') datos[k] = typeof v === 'string' ? v.slice(0, 600) : v;
    return 'Guardado.';
  }
  if (uso.name === 'calcular_costo') {
    const horas = Math.max(0, Math.min(Number(i.horas_semana) || 0, 200));
    const sueldo = Math.max(0, Math.min(Number(i.sueldo_mensual) || 15000, 500000));
    const mensual = Math.round(horas * 4.33 * (sueldo / (48 * 4.33)) / 100) * 100;
    datos.costo_mensual = mensual;
    const f = (n: number) => '$' + n.toLocaleString('es-MX');
    return JSON.stringify({ mensual: f(mensual), anual: f(mensual * 12) });
  }
  return 'Herramienta desconocida.';
}

async function guardar(p: Record<string, unknown>): Promise<any> {
  try {
    const llave = env('SUPABASE_SERVICE_ROLE_KEY');
    const r = await fetch(env('SUPABASE_URL') + '/rest/v1/rpc/guardar_chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: llave, Authorization: 'Bearer ' + llave, 'Content-Profile': 'app' },
      body: JSON.stringify({ p })
    });
    if (!r.ok) { console.error('guardar', r.status, await r.text()); return null; }
    return await r.json();
  } catch (e) { console.error('guardar', e); return null; }
}

async function avisar(d: any, id: string) {
  if (!env('RESEND_API_KEY') || !env('AVISO_PARA')) return;
  const linea = (t: string, v: unknown) => v ? t + ': ' + v + '\n' : '';
  const cuerpo = (d.resumen ? d.resumen + '\n\n' : '') +
    linea('Nombre', d.nombre) + linea('Empresa', d.empresa) + linea('Puesto', d.puesto) +
    linea('WhatsApp', d.telefono) + linea('Correo', d.email) + linea('Ciudad', d.ciudad) +
    linea('Puntaje', d.puntaje) + linea('Costo estimado al mes', d.costo_mensual ? '$' + Number(d.costo_mensual).toLocaleString('es-MX') : '') +
    '\nConversación: chat:' + id;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env('RESEND_API_KEY') },
      body: JSON.stringify({ from: env('AVISO_DE') || CONFIG.negocio + ' <onboarding@resend.dev>', to: env('AVISO_PARA').split(',').map(s => s.trim()),
        subject: (CONFIG.avisoAsunto || 'Nuevo prospecto') + (d.puntaje != null ? ' · ' + d.puntaje + ' pts' : ''), text: cuerpo })
    });
  } catch (_) { /* el aviso no debe tumbar el chat */ }
}
