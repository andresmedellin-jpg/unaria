// WhatsApp de la torre (Meta Cloud API) + el asistente que atiende a los residentes.
// Los residentes no instalan nada: escriben al número de la torre. Lo que piden se vuelve un registro (pase, reporte…)
// y cada mensaje queda en app.wa_mensajes ligado a su depto.
//
// Secretos (Supabase → Edge Functions → Secrets):
//   WA_TOKEN            token permanente del usuario del sistema en Meta Business (envío de mensajes)
//   WA_APP_SECRET       secreto de la app de Meta (para comprobar que el aviso viene de Meta)
//   WA_VERIFY_TOKEN     palabra que se pone al dar de alta el webhook en Meta
//   ANTHROPIC_API_KEY   el asistente (cuenta de Unaria)
//   WA_MODELO           opcional, por omisión claude-sonnet-5-5
// Qué número es de qué torre: tabla app.wa_cuentas (phone_number_id → centro).
//
// Llamadas:
//   GET  ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…    alta del webhook en Meta
//   POST de Meta (object = whatsapp_business_account)               mensajes y estados de entrega
//   POST {accion:'procesar'}  con sesión del portal                  manda lo que está en cola + recordatorios de paquetes
//   POST {accion:'simular', telefono, texto} con sesión (administración)   prueba el asistente sin pasar por Meta
import { createClient } from "jsr:@supabase/supabase-js@2";

const env = (k: string) => Deno.env.get(k) ?? "";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const GRAPH = "https://graph.facebook.com/v21.0";
const ZONA = "America/Monterrey";

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false }, db: { schema: "app" },
});

const tel10 = (t: string) => String(t || "").replace(/\D/g, "").slice(-10);
const hora = (d = new Date()) => d.toLocaleTimeString("es-MX", { timeZone: ZONA, hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s/g, " ");

// Plantillas que hay que aprobar en Meta (categoría utility). El orden de las claves = {{1}}, {{2}}…
export const PLANTILLAS: Record<string, { claves: string[]; imagen?: boolean; botones?: string[] }> = {
  paquete_llego:        { claves: ["nombre", "paqueteria", "unidad", "hora"], imagen: true },
  paquete_entregado:    { claves: ["recibio", "hora", "guardia"] },
  paquete_recordatorio: { claves: ["nombre", "paqueteria", "desde"] },
  visita_llego:         { claves: ["nombre", "visita", "hora"] },
  visita_autorizar:     { claves: ["nombre", "visita", "unidad"], botones: ["Sí, que pase", "No"] },
  reporte_estado:       { claves: ["nombre", "folio", "estado"] },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);

  // Alta del webhook en Meta
  if (req.method === "GET") {
    if (url.searchParams.get("hub.mode") === "subscribe") {
      return url.searchParams.get("hub.verify_token") === env("WA_VERIFY_TOKEN") && env("WA_VERIFY_TOKEN")
        ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 })
        : new Response("no", { status: 403 });
    }
    return json({ listo: true, meta: !!env("WA_TOKEN"), asistente: !!env("ANTHROPIC_API_KEY") });
  }
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const crudo = await req.text();
  let body: any; try { body = JSON.parse(crudo); } catch { return json({ error: "Solicitud inválida" }, 400); }

  // ---- Aviso de Meta ----
  if (body?.object === "whatsapp_business_account") {
    if (env("WA_APP_SECRET") && !(await firmaValida(crudo, req.headers.get("x-hub-signature-256") ?? ""))) return new Response("firma", { status: 401 });
    const trabajo = atenderMeta(body).catch((e) => console.error("meta", e));
    // Meta quiere respuesta rápida: el asistente sigue trabajando después de contestar
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(trabajo);
    return new Response("ok", { status: 200 });
  }

  // ---- Llamadas del portal (con sesión) ----
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: quien } = await db.auth.getUser(token);
  if (!quien?.user) return json({ error: "Sesión no válida" }, 401);
  const { data: yo } = await db.from("miembros").select("org_id, rol, roles, nombre").eq("user_id", quien.user.id).eq("activo", true).maybeSingle();
  if (!yo) return json({ error: "Usuario inactivo" }, 403);

  if (body.accion === "procesar") return json(await procesar(yo.org_id));

  if (body.accion === "simular") {
    const roles = [yo.rol, ...(yo.roles ?? [])];
    if (!roles.some((r: string) => ["dueno", "socio", "administracion"].includes(r))) return json({ error: "Solo administración puede probar el asistente" }, 403);
    const tel = tel10(body.telefono), texto = String(body.texto ?? "").trim().slice(0, 1500);
    if (tel.length !== 10 || !texto) return json({ error: "Falta el teléfono (10 dígitos) o el mensaje" }, 400);
    const { data: cuenta } = await db.from("wa_cuentas").select("*").eq("org_id", yo.org_id).limit(1).maybeSingle();
    const centro = cuenta?.centro_id ?? body.centro_id;
    if (!centro) return json({ error: "Falta la torre" }, 400);
    const respuestas = await conversar({ org: yo.org_id, centro, tel, waFrom: "52" + tel, nombrePerfil: "", tipo: "text", texto, simulado: true });
    return json({ respuestas });
  }
  // Una persona de la administración le contesta a un residente desde el portal
  if (body.accion === "responder") {
    const roles = [yo.rol, ...(yo.roles ?? [])];
    if (!roles.some((r: string) => ["dueno", "socio", "administracion", "cobranza", "encargado"].includes(r))) return json({ error: "Sin permiso" }, 403);
    const tel = tel10(body.telefono), texto = String(body.texto ?? "").trim().slice(0, 1500);
    if (tel.length !== 10 || !texto) return json({ error: "Falta el teléfono o el mensaje" }, 400);
    const { data: ult } = await db.from("wa_mensajes").select("centro_id, unidad_id, nombre, variables").eq("org_id", yo.org_id).eq("telefono", tel)
      .order("creado_en", { ascending: false }).limit(1).maybeSingle();
    const { data: cuenta } = ult?.centro_id ? await db.from("wa_cuentas").select("*").eq("centro_id", ult.centro_id).maybeSingle() : { data: null };
    const { data: msg, error } = await db.from("wa_mensajes").insert({ org_id: yo.org_id, centro_id: ult?.centro_id ?? null, unidad_id: ult?.unidad_id ?? null,
      direccion: "sale", telefono: tel, nombre: ult?.nombre ?? null, texto, estado: "en_cola", variables: { por: yo.nombre, wa_to: ult?.variables?.wa_from } }).select("*").single();
    if (error) return json({ error: error.message }, 400);
    // ya lo atendió una persona: se quita la marca de "necesita a una persona"
    const { data: marcados } = await db.from("wa_mensajes").select("id, variables").eq("org_id", yo.org_id).eq("telefono", tel).eq("direccion", "entra").eq("variables->>humano", "true");
    for (const m of marcados ?? []) await db.from("wa_mensajes").update({ variables: { ...m.variables, humano: false, atendio: yo.nombre } }).eq("id", m.id);
    const ok = await enviar(msg, cuenta);
    return json({ ok: true, enviado: ok });
  }
  return json({ error: "Acción desconocida" }, 400);
});

// ================= Meta → nosotros =================
async function firmaValida(crudo: string, firma: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(env("WA_APP_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(crudo)));
  const hex = "sha256=" + [...s].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.length === firma.length && hex === firma;
}

// deno-lint-ignore no-explicit-any
async function atenderMeta(body: any) {
  for (const e of body.entry ?? []) for (const ch of e.changes ?? []) {
    const v = ch.value ?? {};
    const pnid = v.metadata?.phone_number_id;
    const { data: cuenta } = await db.from("wa_cuentas").select("*").eq("phone_number_id", pnid).maybeSingle();
    if (!cuenta) { console.warn("número sin torre", pnid); continue; }

    // Estados de lo que mandamos (enviado, entregado, leído, falló)
    for (const s of v.statuses ?? []) {
      const estado = ({ sent: "enviado", delivered: "entregado", read: "leido", failed: "fallo" } as Record<string, string>)[s.status];
      if (estado) await db.from("wa_mensajes").update({ estado, error: s.errors?.[0]?.title ?? null }).eq("wa_id", s.id);
    }
    // Mensajes de residentes
    for (const m of v.messages ?? []) {
      const perfil = (v.contacts ?? []).find((c: any) => c.wa_id === m.from)?.profile?.name ?? "";
      let texto = "", boton = "";
      if (m.type === "text") texto = m.text?.body ?? "";
      else if (m.type === "interactive") { boton = m.interactive?.button_reply?.id ?? ""; texto = m.interactive?.button_reply?.title ?? ""; }
      else if (m.type === "button") { boton = m.button?.payload ?? ""; texto = m.button?.text ?? ""; }
      else if (m.type === "image") texto = (m.image?.caption ?? "") + " [mandó una foto]";
      else if (m.type === "audio") texto = "[mandó un audio]";
      else texto = `[mandó ${m.type}]`;
      await conversar({ org: cuenta.org_id, centro: cuenta.centro_id, tel: tel10(m.from), waFrom: m.from, nombrePerfil: perfil, tipo: m.type,
        texto, boton, mediaId: m.image?.id ?? m.audio?.id, waId: m.id, cuenta });
    }
  }
}

// ================= La conversación =================
type Entrada = { org: string; centro: string; tel: string; waFrom: string; nombrePerfil: string; tipo: string; texto: string;
  boton?: string; mediaId?: string; waId?: string; simulado?: boolean; cuenta?: any };

async function conversar(x: Entrada): Promise<string[]> {
  const { data: deptos } = await db.rpc("unidades_de_telefono", { p_org: x.org, p_tel: x.tel });
  const mios = (deptos ?? []).filter((d: any) => d.centro_id === x.centro);
  const unidad = mios.length === 1 ? mios[0] : null;
  const nombre = mios[0]?.nombre || x.nombrePerfil || "";
  await db.from("wa_mensajes").insert({ org_id: x.org, centro_id: x.centro, unidad_id: unidad?.unidad_id ?? null, direccion: "entra", telefono: x.tel,
    nombre, texto: x.texto, estado: "recibido", wa_id: x.waId ?? null, variables: { wa_from: x.waFrom, tipo: x.tipo, media_id: x.mediaId ?? null, simulado: !!x.simulado } });

  const salidas: string[] = [];
  const responder = async (texto: string, ref?: { tabla: string; id: string }, hechos?: string[]) => {
    texto = texto.replace(/\*\*(.+?)\*\*/g, "*$1*"); // WhatsApp: negritas con un asterisco
    salidas.push(texto);
    const { data: msg } = await db.from("wa_mensajes").insert({ org_id: x.org, centro_id: x.centro, unidad_id: unidad?.unidad_id ?? null, direccion: "sale",
      telefono: x.tel, nombre, texto, estado: x.simulado ? "simulado" : "en_cola", ref_tabla: ref?.tabla ?? null, ref_id: ref?.id ?? null,
      variables: { wa_to: x.waFrom, ...(hechos?.length ? { hechos } : {}) } }).select("*").single();
    if (!x.simulado && msg) await enviar(msg, x.cuenta ?? (await cuentaDe(x.centro)), true);
  };

  // Respuesta con botón: autorizar una visita sin pase  (id = "acceso:<uuid>:si|no")
  const b = /^acceso:([0-9a-f-]{36}):(si|no)$/.exec(x.boton ?? "");
  if (b) {
    const si = b[2] === "si";
    const { data: a } = await db.from("accesos").update({ autorizacion: si ? "autorizada" : "rechazada", respondio: nombre || x.tel })
      .eq("id", b[1]).eq("autorizacion", "pendiente").select("nombre").maybeSingle();
    await responder(a ? (si ? `Listo, le avisamos a caseta que ${a.nombre} puede pasar.` : `Entendido, caseta no dejará pasar a ${a.nombre}.`)
      : "Esa visita ya se atendió en caseta.");
    return salidas;
  }
  // Calificación de un reporte  (id = "califica:<uuid>:bien|regular|mal")
  const c = /^califica:([0-9a-f-]{36}):(bien|regular|mal)$/.exec(x.boton ?? "");
  if (c) {
    await db.from("solicitudes").update({ calificacion: c[2], ...(c[2] === "mal" ? { estado: "abierta" } : {}) }).eq("id", c[1]);
    await responder(c[2] === "mal" ? "Gracias por avisarnos. Reabrimos tu reporte y lo revisa la administración." : "¡Gracias por calificar!");
    return salidas;
  }

  const cuenta = x.cuenta ?? (await cuentaDe(x.centro));
  if (cuenta && cuenta.asistente === false && !x.simulado) return salidas; // lo atiende una persona desde el portal
  if (!env("ANTHROPIC_API_KEY")) { await responder("Recibimos tu mensaje. En un momento te contesta la administración."); return salidas; }

  try {
    const hechos: string[] = [];
    const r = await agente(x, mios, nombre, hechos);
    if (r) await responder(r, undefined, hechos);
  } catch (e) {
    console.error("agente", e);
    await responder("Recibimos tu mensaje. En un momento te contesta la administración.");
  }
  return salidas;
}

async function cuentaDe(centro: string) {
  const { data } = await db.from("wa_cuentas").select("*").eq("centro_id", centro).maybeSingle();
  return data;
}

// ================= El asistente =================
const REGLAS = `Eres el asistente de WhatsApp de la torre de departamentos {TORRE}. Atiendes a residentes e inquilinos.
Hoy es {HOY} (hora de Monterrey).
Quien escribe: {QUIEN}

LO QUE PUEDES HACER (con tus herramientas):
1. Pases de visita: invitados, delivery/Rappi, proveedores, mudanzas. Necesitas: nombre de la visita, si trae carro (y placas),
   y el horario. Si no dicen hora, el pase es desde ahora y por 24 horas. "En la noche" = 6 pm a 12 am; "mañana" = el día siguiente;
   si se queda a dormir, hasta las 12 pm del día siguiente.
   Delivery/Rappi: con el nombre de la app basta (p. ej. "Rappi") y dura 2 horas. Cuando lo crees, dale el código de 6 dígitos
   y dile que se lo reenvíe a su visita para mostrarlo en caseta.
2. Reportes de mantenimiento, quejas y sugerencias. Clasifica la categoría; si es de su depto o de un área común (elevador, pasillos,
   estacionamiento, alberca, gimnasio, lobby); y la prioridad: URGENTE si hay fuga activa, elevador detenido, sin luz, humo o
   riesgo; alta si impide usar algo importante; normal; baja si es estético. Para fallas DENTRO del depto pregunta antes si se
   puede entrar sin el residente (Sí / solo con el residente). Antes de crear uno de área común revisa si ya está reportado:
   si sí, súmalo a ese reporte. Al crear, dale el folio (#0187).
3. Decirle si tiene paquetes esperándolo en caseta.

CÓMO RESPONDES
- Español de México, cálido y muy breve: como un buen conserje por WhatsApp. 1 a 3 renglones. Un emoji como mucho.
- Pide solo el dato que falta, de uno en uno. No repitas lo que ya dijo.
- No inventes: si no lo sabes o no puedes hacerlo (cobranza, pagos, rentas, temas legales, algo que no está aquí), dile que lo
  pasas a la administración y usa pasar_a_humano. También si está molesto, si insiste o si es una emergencia (en una emergencia
  real dile además que llame al 911).
- Si su número no está registrado, pídele su número de depto y su nombre, y pásalo a la administración: sin depto registrado no
  puedes crear pases.
- Nunca des datos de otros residentes ni de otros deptos.
- Lo que aparece como "(Ya hecho en el sistema: …)" ya quedó registrado: no lo vuelvas a crear ni digas que falló.
- Es WhatsApp: sin markdown. Para resaltar usa *un asterisco* (p. ej. el código *123456*).`;

const HERRAMIENTAS = [
  { name: "crear_pase", description: "Crea un pase de visita para caseta. Regresa el código de 6 dígitos.",
    input_schema: { type: "object", properties: {
      unidad: { type: "string", description: "Depto de quien invita, p. ej. D405" },
      tipo: { type: "string", enum: ["invitado", "delivery", "proveedor", "mudanza"] },
      nombre: { type: "string", description: "Nombre de la visita o de la app (Rappi, DiDi…)" },
      placas: { type: "string", description: "Placas si viene en carro" }, vehiculo: { type: "string", description: "Color y modelo, opcional" },
      desde: { type: "string", description: "Inicio, ISO 8601 con zona -06:00" }, hasta: { type: "string", description: "Fin, ISO 8601 con zona -06:00" } },
      required: ["unidad", "tipo", "nombre", "desde", "hasta"] } },
  { name: "reportes_abiertos_area_comun", description: "Reportes abiertos de áreas comunes de los últimos 3 días, para no duplicar.",
    input_schema: { type: "object", properties: {} } },
  { name: "crear_reporte", description: "Crea un reporte de mantenimiento, queja o sugerencia. Regresa el folio.",
    input_schema: { type: "object", properties: {
      unidad: { type: "string", description: "Depto de quien reporta" },
      descripcion: { type: "string", description: "Qué pasa, en una o dos frases claras" },
      categoria: { type: "string", enum: ["plomeria", "electrico", "elevador", "aire", "cerrajeria", "limpieza", "areas_comunes", "queja", "sugerencia", "otro"] },
      area: { type: "string", enum: ["depto", "comun"] },
      prioridad: { type: "string", enum: ["urgente", "alta", "normal", "baja"] },
      puede_entrar: { type: "string", enum: ["si", "solo_con_residente", "no_aplica"] } },
      required: ["descripcion", "categoria", "area", "prioridad", "puede_entrar"] } },
  { name: "sumarse_a_reporte", description: "Suma a este residente a un reporte de área común que ya existe (se le avisará al cerrarlo).",
    input_schema: { type: "object", properties: { folio: { type: "integer" } }, required: ["folio"] } },
  { name: "paquetes_en_caseta", description: "Paquetes de sus deptos que siguen en caseta.", input_schema: { type: "object", properties: {} } },
  { name: "pasar_a_humano", description: "Pasa la conversación a la administración (Carlos) o a caseta.",
    input_schema: { type: "object", properties: { motivo: { type: "string" }, a: { type: "string", enum: ["administracion", "caseta"] } }, required: ["motivo"] } },
];

// deno-lint-ignore no-explicit-any
async function agente(x: Entrada, mios: any[], nombre: string, hechos: string[]): Promise<string> {
  const { data: torre } = await db.from("centros").select("nombre").eq("id", x.centro).single();
  const hoy = new Date().toLocaleString("es-MX", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });
  const quien = mios.length ? `${nombre || "residente"} · ${mios.map((d) => d.identificador).join(", ")} · tel ${x.tel}` : `número ${x.tel} NO registrado en ningún depto${x.nombrePerfil ? ` (su perfil dice "${x.nombrePerfil}")` : ""}`;
  const sistema = REGLAS.replace("{TORRE}", torre?.nombre ?? "").replace("{HOY}", hoy).replace("{QUIEN}", quien);

  // Plática reciente con este número (48 h)
  const desde = new Date(Date.now() - 48 * 3600e3).toISOString();
  const { data: hist } = await db.from("wa_mensajes").select("direccion, texto, plantilla, variables, creado_en").eq("org_id", x.org).eq("telefono", x.tel)
    .gte("creado_en", desde).order("creado_en", { ascending: false }).limit(24);
  const mensajes: { role: string; content: any }[] = [];
  for (const m of (hist ?? []).reverse()) {
    const role = m.direccion === "entra" ? "user" : "assistant";
    // Lo que ya se hizo en vueltas anteriores (pases, reportes) va como nota para que no se repita
    const t = (String(m.texto ?? "").trim() + (m.variables?.hechos?.length ? `\n(Ya hecho en el sistema: ${m.variables.hechos.join("; ")})` : "")).trim(); if (!t) continue;
    if (!mensajes.length && role === "assistant") { mensajes.push({ role: "user", content: "(aviso previo de la torre)" }); }
    const ult = mensajes[mensajes.length - 1];
    if (ult && ult.role === role) ult.content += "\n" + t; else mensajes.push({ role, content: t });
  }
  if (!mensajes.length || mensajes[mensajes.length - 1].role !== "user") mensajes.push({ role: "user", content: x.texto });

  const unidadDe = (txt?: string) => {
    if (mios.length === 1) return mios[0];
    const d = String(txt ?? "").replace(/\D/g, "");
    return mios.find((u) => u.identificador.replace(/\D/g, "") === d) ?? null;
  };

  for (let vuelta = 0; vuelta < 6; vuelta++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: env("WA_MODELO") || "claude-sonnet-5-5", max_tokens: 700, system: sistema, tools: HERRAMIENTAS, messages: mensajes }),
    });
    if (!r.ok) throw new Error("anthropic " + r.status + " " + (await r.text()).slice(0, 300));
    const j = await r.json();
    mensajes.push({ role: "assistant", content: j.content });
    const usos = (j.content ?? []).filter((c: any) => c.type === "tool_use");
    if (!usos.length || j.stop_reason !== "tool_use") return (j.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();

    const resultados = [];
    for (const u of usos) {
      let res: unknown;
      try { res = await herramienta(u.name, u.input ?? {}, x, mios, nombre, unidadDe); } catch (e) { res = { error: String((e as Error).message ?? e) }; }
      // deno-lint-ignore no-explicit-any
      const o = res as any;
      if (o?.ok && u.name === "crear_pase") hechos.push(`pase ${o.codigo} para ${u.input.nombre} (${o.unidad}), ${o.valido}`);
      if (o?.ok && u.name === "crear_reporte") hechos.push(`reporte ${o.folio}: ${u.input.descripcion}`);
      if (o?.ok && u.name === "sumarse_a_reporte") hechos.push(`sumado al reporte ${o.folio}`);
      if (o?.ok && u.name === "pasar_a_humano") hechos.push(`pasado a la administración: ${u.input.motivo}`);
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(res) });
    }
    mensajes.push({ role: "user", content: resultados });
  }
  return "Recibimos tu mensaje. En un momento te contesta la administración.";
}

// deno-lint-ignore no-explicit-any
async function herramienta(nombreH: string, i: any, x: Entrada, mios: any[], nombre: string, unidadDe: (t?: string) => any): Promise<unknown> {
  if (nombreH === "crear_pase") {
    const u = unidadDe(i.unidad);
    if (!u) return { error: mios.length ? "Ese depto no es de este residente. Sus deptos: " + mios.map((d) => d.identificador).join(", ") : "Número no registrado: no se puede crear el pase" };
    const { data, error } = await db.rpc("crear_pase", { p_centro: x.centro, p_unidad: u.unidad_id, p_tipo: i.tipo, p_nombre: i.nombre, p_placas: i.placas ?? null,
      p_vehiculo: i.vehiculo ?? null, p_desde: i.desde, p_hasta: i.hasta, p_origen: "whatsapp", p_solicita: nombre || null, p_telefono: x.tel, p_notas: null });
    if (error) return { error: error.message };
    const f = (d: string) => new Date(d).toLocaleString("es-MX", { timeZone: ZONA, weekday: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    return { ok: true, codigo: data.codigo, unidad: u.identificador, valido: `${f(data.desde)} a ${f(data.hasta)}` };
  }
  if (nombreH === "reportes_abiertos_area_comun") {
    const { data } = await db.from("solicitudes").select("folio, descripcion, categoria, estado, creado_en").eq("centro_id", x.centro).eq("area", "comun")
      .neq("estado", "resuelta").gte("creado_en", new Date(Date.now() - 72 * 3600e3).toISOString()).order("creado_en", { ascending: false }).limit(15);
    return { reportes: data ?? [] };
  }
  if (nombreH === "crear_reporte") {
    const u = i.area === "depto" ? unidadDe(i.unidad) : (unidadDe(i.unidad) ?? mios[0] ?? null);
    if (i.area === "depto" && !u) return { error: mios.length ? "¿De cuál depto? " + mios.map((d) => d.identificador).join(", ") : "Número no registrado: pásalo a la administración" };
    const { data: o } = await db.from("centros").select("org_id").eq("id", x.centro).single();
    const { data, error } = await db.from("solicitudes").insert({ org_id: o!.org_id, centro_id: x.centro, unidad_id: u?.unidad_id ?? null,
      unidad_txt: i.area === "comun" ? "Área común" : u?.identificador, reporta: nombre || null, telefono: x.tel, descripcion: i.descripcion,
      categoria: i.categoria, area: i.area, prioridad: i.prioridad, puede_entrar: i.puede_entrar === "no_aplica" ? null : i.puede_entrar,
      origen: "whatsapp", registrado_por: "WhatsApp" }).select("id, folio").single();
    if (error) return { error: error.message };
    return { ok: true, folio: "#" + String(data.folio).padStart(4, "0"), para: ["queja", "sugerencia"].includes(i.categoria) ? "administración" : "mantenimiento" };
  }
  if (nombreH === "sumarse_a_reporte") {
    const { data: s } = await db.from("solicitudes").select("id, folio, avisar_tambien").eq("centro_id", x.centro).eq("folio", i.folio).maybeSingle();
    if (!s) return { error: "No existe ese folio" };
    await db.from("solicitudes").update({ avisar_tambien: [...new Set([...(s.avisar_tambien ?? []), x.tel])] }).eq("id", s.id);
    return { ok: true, folio: "#" + String(s.folio).padStart(4, "0") };
  }
  if (nombreH === "paquetes_en_caseta") {
    if (!mios.length) return { paquetes: [], nota: "número no registrado" };
    const { data } = await db.from("paquetes").select("paqueteria, descripcion, recibido_en, unidad_id").in("unidad_id", mios.map((d) => d.unidad_id)).is("entregado_en", null);
    return { paquetes: (data ?? []).map((p) => ({ paqueteria: p.paqueteria, desde: new Date(p.recibido_en).toLocaleString("es-MX", { timeZone: ZONA }) })) };
  }
  if (nombreH === "pasar_a_humano") {
    // Queda marcado en su último mensaje: el portal lo muestra en "Necesitan a una persona"
    const { data: ult } = await db.from("wa_mensajes").select("id, variables").eq("org_id", x.org)
      .eq("telefono", x.tel).eq("direccion", "entra").order("creado_en", { ascending: false }).limit(1).maybeSingle();
    if (ult) await db.from("wa_mensajes").update({ variables: { ...(ult.variables ?? {}), humano: true, motivo: i.motivo, a: i.a ?? "administracion" } }).eq("id", ult.id);
    return { ok: true };
  }
  return { error: "Herramienta desconocida" };
}

// ================= Nosotros → Meta =================
// Dentro de la ventana de 24 h (el residente escribió hace poco) se manda texto libre; fuera, la plantilla aprobada.
// deno-lint-ignore no-explicit-any
async function enviar(m: any, cuenta: any, ventanaAbierta?: boolean): Promise<boolean> {
  if (!cuenta?.activo || !cuenta.phone_number_id || !env("WA_TOKEN")) return false;
  const para = m.variables?.wa_to ?? (await waDe(m.org_id, m.telefono)) ?? "52" + m.telefono;
  if (ventanaAbierta === undefined) {
    const { count } = await db.from("wa_mensajes").select("id", { count: "exact", head: true }).eq("org_id", m.org_id).eq("telefono", m.telefono)
      .eq("direccion", "entra").gte("creado_en", new Date(Date.now() - 23.5 * 3600e3).toISOString());
    ventanaAbierta = (count ?? 0) > 0;
  }
  // deno-lint-ignore no-explicit-any
  let carga: any;
  const botones = Array.isArray(m.botones) ? m.botones : null;
  if (ventanaAbierta || !m.plantilla) {
    if (!ventanaAbierta && !m.plantilla) { await marcar(m.id, "fallo", "Fuera de la ventana de 24 h y sin plantilla"); return false; }
    if (botones?.length) carga = { type: "interactive", interactive: { type: "button", body: { text: m.texto },
      ...(m.media_url ? { header: { type: "image", image: { link: m.media_url } } } : {}),
      action: { buttons: botones.slice(0, 3).map((b: any) => ({ type: "reply", reply: { id: b.id, title: String(b.titulo).slice(0, 20) } })) } } };
    else if (m.media_url) carga = { type: "image", image: { link: m.media_url, caption: m.texto } };
    else carga = { type: "text", text: { body: m.texto, preview_url: false } };
  } else {
    const p = PLANTILLAS[m.plantilla];
    if (!p) { await marcar(m.id, "fallo", "Plantilla desconocida: " + m.plantilla); return false; }
    if (!(cuenta.plantillas_aprobadas ?? []).includes(m.plantilla)) { await marcar(m.id, "fallo", "Plantilla aún no aprobada por Meta: " + m.plantilla); return false; }
    const comps: unknown[] = [];
    if (p.imagen && m.media_url) comps.push({ type: "header", parameters: [{ type: "image", image: { link: m.media_url } }] });
    comps.push({ type: "body", parameters: p.claves.map((k) => ({ type: "text", text: String(m.variables?.[k] ?? "-").slice(0, 200) || "-" })) });
    if (botones?.length) botones.slice(0, 3).forEach((b: any, i: number) => comps.push({ type: "button", sub_type: "quick_reply", index: String(i), parameters: [{ type: "payload", payload: b.id }] }));
    carga = { type: "template", template: { name: m.plantilla, language: { code: "es_MX" }, components: comps } };
  }
  const r = await fetch(`${GRAPH}/${cuenta.phone_number_id}/messages`, {
    method: "POST", headers: { Authorization: "Bearer " + env("WA_TOKEN"), "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: para, ...carga }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { await marcar(m.id, "fallo", j?.error?.message ?? "HTTP " + r.status); return false; }
  await db.from("wa_mensajes").update({ estado: "enviado", wa_id: j.messages?.[0]?.id ?? null, enviado_en: new Date().toISOString(), error: null }).eq("id", m.id);
  return true;
}
const marcar = (id: string, estado: string, error: string) => db.from("wa_mensajes").update({ estado, error }).eq("id", id);
async function waDe(org: string, tel: string) {
  const { data } = await db.from("wa_mensajes").select("variables").eq("org_id", org).eq("telefono", tel).eq("direccion", "entra")
    .order("creado_en", { ascending: false }).limit(1).maybeSingle();
  return data?.variables?.wa_from ?? null;
}

// Manda lo que está en cola y pone en cola los recordatorios de paquetes que no se han recogido
async function procesar(org: string) {
  const { data: cuentas } = await db.from("wa_cuentas").select("*").eq("org_id", org);
  const activas = (cuentas ?? []).filter((c) => c.activo && c.phone_number_id) ;
  const conectado = activas.length > 0 && !!env("WA_TOKEN");
  let enviados = 0, fallidos = 0, recordatorios = 0;
  if (conectado) {
    for (const c of activas) {
      const { data: reglas } = await db.from("torre_reglas").select("recordatorio_horas").eq("centro_id", c.centro_id).maybeSingle();
      const horas = reglas?.recordatorio_horas ?? 24;
      const { data: viejos } = await db.from("paquetes").select("id, unidad_id, paqueteria, recibido_en, avisos").eq("centro_id", c.centro_id)
        .eq("estado", "avisado").is("entregado_en", null).lt("ultimo_aviso", new Date(Date.now() - horas * 3600e3).toISOString()).lt("avisos", 3).limit(30);
      for (const p of viejos ?? []) {
        const desde = new Date(p.recibido_en).toLocaleString("es-MX", { timeZone: ZONA, weekday: "long", hour: "numeric", minute: "2-digit" });
        await db.rpc("encolar_aviso", { p_unidad: p.unidad_id, p_plantilla: "paquete_recordatorio", p_variables: { paqueteria: p.paqueteria ?? "paquetería", desde },
          p_texto: `📦 Hola {nombre}, tu paquete de ${p.paqueteria ?? "paquetería"} sigue en caseta desde el ${desde}. Pasa por él cuando puedas.`,
          p_media: null, p_ref_tabla: "paquetes", p_ref_id: p.id, p_botones: null });
        await db.from("paquetes").update({ avisos: (p.avisos ?? 0) + 1, ultimo_aviso: new Date().toISOString() }).eq("id", p.id);
        recordatorios++;
      }
      const { data: cola } = await db.from("wa_mensajes").select("*").eq("centro_id", c.centro_id).eq("estado", "en_cola").order("creado_en").limit(60);
      for (const m of cola ?? []) (await enviar(m, c)) ? enviados++ : fallidos++;
    }
  }
  const { count } = await db.from("wa_mensajes").select("id", { count: "exact", head: true }).eq("org_id", org).eq("estado", "en_cola");
  return { conectado, enviados, fallidos, recordatorios, en_cola: count ?? 0 };
}
