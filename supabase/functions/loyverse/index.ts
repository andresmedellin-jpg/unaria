// Loyverse → Unaria. Copia a la base del cliente todo lo de su punto de venta: tiendas, categorías, artículos y
// variantes, formas de pago, empleados, clientes, tickets (con líneas y pagos) e inventario.
// Tablas: supabase/migrations/0032_loyverse.sql. Se publica SIN verificación JWT (Loyverse manda avisos sin sesión);
// cada llamada se valida aquí.
//
// Llamadas:
//   POST {accion:'conectar', token, empresa_id, historial_desde?}  con sesión (administración)   valida el token, guarda la cuenta de ese negocio, da de alta el aviso
//   POST {accion:'sincronizar', cuenta_id?}             con sesión (administración)   trae lo nuevo (de una cuenta o de todas las de la organización)
//   POST {accion:'estado'}                               con sesión                     cómo va la sincronización
//   POST {accion:'sincronizar'}                          con la llave del servidor     todas las cuentas activas (cron cada 10 min)
//   POST ?aviso=<aviso_clave>  (Loyverse: receipts.update, items.update…)              trae lo nuevo de esa cuenta
//
// Primero se trae el historial por meses (desde historial_desde); como la función tiene tiempo límite, si no
// alcanza, guarda hasta dónde llegó y la siguiente vuelta sigue. Ya al día, cada vuelta trae lo que cambió desde
// la última (tickets nuevos, cancelados y devoluciones; artículos, clientes e inventario).
import { createClient } from "jsr:@supabase/supabase-js@2";

const env = (k: string) => Deno.env.get(k) ?? "";
const API = "https://api.loyverse.com/v1.0";
const ZONA = "America/Monterrey";
const LIMITE_MS = 110_000;          // tiempo de trabajo por llamada (la función se corta a los ~150 s)
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false }, db: { schema: "app" },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const url = new URL(req.url);
  let body: any = {}; try { body = await req.json(); } catch { /* aviso sin cuerpo */ }

  // ---- Aviso de Loyverse: solo dispara la sincronización (no se confía en lo que trae) ----
  const clave = url.searchParams.get("aviso");
  if (clave) {
    const { data: c } = await db.from("lv_cuentas").select("id").eq("aviso_clave", clave).eq("activo", true).maybeSingle();
    if (!c) return new Response("ok", { status: 200 });
    const trabajo = sincronizar(c.id).catch((e) => console.error("aviso", e));
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(trabajo);
    return new Response("ok", { status: 200 });
  }

  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  // ---- Cron: todas las cuentas activas ----
  if (bearer && bearer === env("SUPABASE_SERVICE_ROLE_KEY")) {
    const { data: cuentas } = await db.from("lv_cuentas").select("id").eq("activo", true);
    const inicio = Date.now(), res: Record<string, unknown> = {};
    for (const c of cuentas ?? []) {
      if (Date.now() - inicio > LIMITE_MS) break;
      res[c.id] = await sincronizar(c.id, inicio).catch((e) => ({ error: String(e?.message ?? e) }));
    }
    return json({ ok: true, cuentas: res });
  }

  // ---- Portal (con sesión) ----
  const { data: quien } = await db.auth.getUser(bearer);
  if (!quien?.user) return json({ error: "Sesión no válida" }, 401);
  const { data: yo } = await db.from("miembros").select("org_id, rol, roles").eq("user_id", quien.user.id).eq("activo", true).maybeSingle();
  if (!yo) return json({ error: "Usuario inactivo" }, 403);
  const admin = [yo.rol, ...(yo.roles ?? [])].some((r: string) => ["dueno", "socio", "administracion"].includes(r));

  if (body.accion === "estado") {
    const { data } = await db.from("lv_cuentas").select("id, empresa_id, negocio, estado, historial_desde, importado_hasta, ultimo_sync, ultimo_error, resumen, activo").eq("org_id", yo.org_id);
    return json({ cuentas: data });
  }
  if (!admin) return json({ error: "Solo administración" }, 403);

  if (body.accion === "conectar") {
    const token = String(body.token ?? "").trim();
    if (token.length < 20) return json({ error: "Pega el token completo de Loyverse" }, 400);
    let negocio: any;
    try { negocio = await lv(token, "/merchant"); } catch (e) { return json({ error: "Loyverse no aceptó el token: " + (e as Error).message }, 400); }
    const desde = /^\d{4}-\d\d-\d\d$/.test(body.historial_desde ?? "") ? body.historial_desde : null;
    // A qué negocio (empresa) del sistema pertenece: cada negocio tiene su propia cuenta de Loyverse
    const empresa = body.empresa_id ?? null;
    if (empresa) {
      const { data: e } = await db.from("empresas").select("id").eq("id", empresa).eq("org_id", yo.org_id).maybeSingle();
      if (!e) return json({ error: "Ese negocio no es de tu cuenta" }, 400);
    }
    const { data: ya } = await db.from("lv_cuentas").select("id, org_id, empresa_id").eq("merchant_id", negocio.id).maybeSingle();
    if (ya && (ya.org_id !== yo.org_id || (ya.empresa_id ?? null) !== empresa)) return json({ error: "Ese negocio de Loyverse ya está conectado a otro negocio del sistema" }, 400);
    let q = db.from("lv_cuentas").select("id").eq("org_id", yo.org_id);
    q = empresa ? q.eq("empresa_id", empresa) : q.is("empresa_id", null);
    const { data: previa } = await q.maybeSingle();
    const fila = { org_id: yo.org_id, empresa_id: empresa, merchant_id: negocio.id, negocio: negocio.business_name, moneda: negocio.currency?.code ?? "MXN",
      activo: true, estado: "importando", historial_desde: desde ?? (negocio.created_at ? String(negocio.created_at).slice(0, 10) : null),
      importado_hasta: null, ultimo_error: null };
    const { data: cuenta, error } = previa
      ? await db.from("lv_cuentas").update(fila).eq("id", previa.id).select("*").single()
      : await db.from("lv_cuentas").insert(fila).select("*").single();
    if (error) return json({ error: error.message }, 400);
    await db.from("lv_tokens").upsert({ cuenta_id: cuenta.id, token });
    await darDeAltaAvisos(token, cuenta.aviso_clave, url).catch((e) => console.warn("avisos", e));
    const trabajo = sincronizar(cuenta.id).catch((e) => console.error("primera", e));
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(trabajo);
    return json({ ok: true, negocio: negocio.business_name });
  }

  if (body.accion === "sincronizar") {
    let q = db.from("lv_cuentas").select("id").eq("org_id", yo.org_id).eq("activo", true);
    if (body.cuenta_id) q = q.eq("id", body.cuenta_id);
    const { data: cuentas } = await q;
    const inicio = Date.now(), res: Record<string, unknown> = {};
    for (const c of cuentas ?? []) res[c.id] = await sincronizar(c.id, inicio);
    const uno = body.cuenta_id ? res[body.cuenta_id] : null;
    return json(uno ?? { ok: true, cuentas: res });
  }
  return json({ error: "Acción desconocida" }, 400);
});

// ---------- API de Loyverse ----------
async function lv(token: string, ruta: string, params: Record<string, string> = {}): Promise<any> {
  const q = new URLSearchParams(params).toString();
  for (let intento = 0; intento < 4; intento++) {
    const r = await fetch(`${API}${ruta}${q ? "?" + q : ""}`, { headers: { Authorization: "Bearer " + token } });
    if (r.status === 429 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 1500 * (intento + 1))); continue; }
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
  throw new Error("Loyverse no respondió (demasiadas solicitudes)");
}
// Todas las páginas de una lista (con tope de tiempo)
async function todas(token: string, ruta: string, llave: string, params: Record<string, string>, fin: number, cada?: (l: any[]) => Promise<void>) {
  let cursor: string | undefined, total = 0, completo = true;
  do {
    if (Date.now() > fin) { completo = false; break; }
    const r = await lv(token, ruta, { limit: "250", ...params, ...(cursor ? { cursor } : {}) });
    const lista = r[llave] ?? [];
    total += lista.length;
    if (cada && lista.length) await cada(lista);
    cursor = r.cursor;
  } while (cursor);
  return { total, completo };
}

async function darDeAltaAvisos(token: string, clave: string, url: URL) {
  const destino = `${env("SUPABASE_URL")}/functions/v1/loyverse?aviso=${clave}`;
  const { webhooks = [] } = await lv(token, "/webhooks").catch(() => ({ webhooks: [] }));
  for (const tipo of ["receipts.update", "items.update", "customers.update", "inventory_levels.update"]) {
    if (webhooks.some((w: any) => w.type === tipo && w.url === destino)) continue;
    await fetch(`${API}/webhooks`, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ url: destino, type: tipo, status: "ENABLED" }) }).catch(() => null);
  }
  void url;
}

// ---------- sincronización de una cuenta ----------
const enCurso = new Set<string>();
async function sincronizar(cid: string, inicio = Date.now()) {
  if (enCurso.has(cid)) return { ok: true, ocupado: true };
  enCurso.add(cid);
  let org = "";
  const fin = inicio + LIMITE_MS, arranque = new Date().toISOString();
  try {
    const [{ data: cuenta }, { data: tk }] = await Promise.all([
      db.from("lv_cuentas").select("*").eq("id", cid).maybeSingle(),
      db.from("lv_tokens").select("token").eq("cuenta_id", cid).maybeSingle(),
    ]);
    if (!cuenta || !tk) return { error: "Sin cuenta de Loyverse" };
    org = cuenta.org_id;
    const base = { org_id: org, cuenta_id: cid };
    const token = tk.token;
    // Desde cuándo traer cambios (con 15 minutos de margen)
    const desde = cuenta.ultimo_sync ? new Date(new Date(cuenta.ultimo_sync).getTime() - 15 * 60e3).toISOString() : null;
    const cambios = desde ? { updated_at_min: desde } : {};
    const r: Record<string, number> = {};

    // Catálogo (rápido)
    const { stores = [] } = await lv(token, "/stores");
    await sube("lv_tiendas", stores.map((s: any) => ({ ...base, id: s.id, nombre: s.name, direccion: [s.address, s.city].filter(Boolean).join(", ") || null,
      telefono: s.phone_number ?? null, actualizado: s.updated_at ?? null, datos: s })), "cuenta_id,id", ["centro_id"]);
    r.tiendas = stores.length;
    r.categorias = (await todas(token, "/categories", "categories", { show_deleted: "true" }, fin, (l) =>
      sube("lv_categorias", l.map((c: any) => ({ ...base, id: c.id, nombre: c.name, color: c.color ?? null, borrado: !!c.deleted_at, datos: c })), "cuenta_id,id"))).total;
    const { payment_types = [] } = await lv(token, "/payment_types", { show_deleted: "true" });
    await sube("lv_tipos_pago", payment_types.map((p: any) => ({ ...base, id: p.id, nombre: p.name, tipo: p.type, borrado: !!p.deleted_at })), "cuenta_id,id");
    r.empleados = (await todas(token, "/employees", "employees", { show_deleted: "true" }, fin, (l) =>
      sube("lv_empleados", l.map((e: any) => ({ ...base, id: e.id, nombre: e.name, email: e.email ?? null, telefono: e.phone_number ?? null,
        tiendas: e.stores ?? [], borrado: !!e.deleted_at })), "cuenta_id,id", ["empleado_id"]))).total;
    r.articulos = (await todas(token, "/items", "items", { show_deleted: "true", ...cambios }, fin, async (l) => {
      await sube("lv_articulos", l.map((i: any) => ({ ...base, id: i.id, nombre: i.item_name, categoria_id: i.category_id ?? null, descripcion: i.description ?? null,
        controla_inventario: !!i.track_stock, es_compuesto: !!i.is_composite, forma: i.form ?? null, color: i.color ?? null, imagen: i.image_url ?? null,
        borrado: !!i.deleted_at, actualizado: i.updated_at ?? null, datos: { ...i, variants: undefined } })), "cuenta_id,id");
      await sube("lv_variantes", l.flatMap((i: any) => (i.variants ?? []).map((v: any) => ({ ...base, id: v.variant_id, articulo_id: i.id,
        nombre: [v.option1_value, v.option2_value, v.option3_value].filter(Boolean).join(" / ") || null, sku: v.sku ?? null, codigo_barras: v.barcode ?? null,
        precio: v.default_price ?? null, costo: v.cost ?? null, precios_tienda: v.stores ?? [], borrado: !!(v.deleted_at || i.deleted_at) }))), "cuenta_id,id");
    })).total;
    r.clientes = (await todas(token, "/customers", "customers", { ...cambios }, fin, (l) =>
      sube("lv_clientes", l.map((c: any) => ({ ...base, id: c.id, nombre: c.name ?? null, email: c.email ?? null, telefono: c.phone_number ?? null,
        codigo: c.customer_code ?? null, nota: c.note ?? null, puntos: c.total_points ?? null, visitas: c.total_visits ?? null, total_gastado: c.total_spent ?? null,
        primera_visita: c.first_visit ?? null, ultima_visita: c.last_visit ?? null, ciudad: c.city ?? null, actualizado: c.updated_at ?? null, datos: c })), "cuenta_id,id"))).total;
    r.inventario = (await todas(token, "/inventory", "inventory_levels", { ...cambios }, fin, (l) =>
      sube("lv_inventario", l.map((x: any) => ({ ...base, variante_id: x.variant_id, tienda_id: x.store_id, existencia: x.in_stock ?? null, actualizado: x.updated_at ?? null })),
        "cuenta_id,variante_id,tienda_id"))).total;

    // Tickets
    let tickets = 0, completo = true;
    if (cuenta.estado !== "al_dia") {
      // Historial por meses, desde historial_desde hasta hoy
      let desdeMes = cuenta.importado_hasta ? new Date(cuenta.importado_hasta) : new Date((cuenta.historial_desde ?? "2020-01-01") + "T00:00:00-06:00");
      while (desdeMes < new Date()) {
        if (Date.now() > fin) { completo = false; break; }
        const hasta = new Date(desdeMes); hasta.setUTCMonth(hasta.getUTCMonth() + 1);
        const tope = hasta > new Date() ? new Date() : hasta;
        const x = await todas(token, "/receipts", "receipts", { created_at_min: desdeMes.toISOString(), created_at_max: tope.toISOString() }, fin, (l) => guardarTickets(base, l));
        tickets += x.total;
        if (!x.completo) { completo = false; break; }           // el mes se repite completo en la siguiente vuelta (es idempotente)
        desdeMes = tope;
        await db.from("lv_cuentas").update({ importado_hasta: tope.toISOString() }).eq("id", cid);
      }
      if (completo) await db.from("lv_cuentas").update({ estado: "al_dia" }).eq("id", cid);
    } else {
      const x = await todas(token, "/receipts", "receipts", { updated_at_min: desde ?? new Date(Date.now() - 864e5).toISOString() }, fin, (l) => guardarTickets(base, l));
      tickets = x.total; completo = x.completo;
    }
    r.tickets = tickets;

    const { count: totalTickets } = await db.from("lv_tickets").select("numero", { count: "exact", head: true }).eq("cuenta_id", cid);
    await db.from("lv_cuentas").update({
      ...(completo ? { ultimo_sync: arranque } : {}), ultimo_error: null,
      resumen: { ...(cuenta.resumen ?? {}), ultima_vuelta: r, tickets_total: totalTickets ?? null, al: new Date().toISOString() },
    }).eq("id", cid);
    return { ok: true, completo, ...r };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 500);
    await db.from("lv_cuentas").update({ ultimo_error: msg, ...(msg.startsWith("401") ? { estado: "error" } : {}) }).eq("id", cid);
    return { error: msg };
  } finally { enCurso.delete(cid); }
}

// Guarda en lotes. "conservar": columnas que se ligan a mano en el portal y no se deben borrar al actualizar.
async function sube(tabla: string, filas: any[], conflicto: string, conservar: string[] = []) {
  for (let i = 0; i < filas.length; i += 500) {
    const lote = filas.slice(i, i + 500).map((f) => { const g = { ...f }; conservar.forEach((k) => delete g[k]); return g; });
    const { error } = await db.from(tabla).upsert(lote, { onConflict: conflicto });
    if (error) throw new Error(`${tabla}: ${error.message}`);
  }
}

const diaLocal = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const n = (x: unknown) => (x == null || x === "" ? 0 : Number(x));

async function guardarTickets(base: { org_id: string; cuenta_id: string }, lista: any[]) {
  const tickets = lista.map((t: any) => ({
    ...base, numero: t.receipt_number, tipo: t.receipt_type ?? "SALE", devolucion_de: t.refund_for ?? null,
    fecha: t.receipt_date ?? t.created_at, dia: diaLocal(t.receipt_date ?? t.created_at),
    tienda_id: t.store_id ?? null, empleado_id: t.employee_id ?? null, cliente_id: t.customer_id ?? null, dispositivo_id: t.pos_device_id ?? null,
    opcion_consumo: t.dining_option ?? null, total: n(t.total_money), impuestos: n(t.total_tax), descuento: n(t.total_discount), propina: n(t.tip),
    puntos_ganados: t.points_earned ?? null, puntos_usados: t.points_deducted ?? null, cancelado_en: t.cancelled_at ?? null,
    nota: t.note ?? null, fuente: t.source ?? null, actualizado: t.updated_at ?? null,
    datos: { order: t.order ?? null, total_discounts: t.total_discounts ?? [], total_taxes: t.total_taxes ?? [], surcharge: t.surcharge ?? null },
  }));
  await sube("lv_tickets", tickets, "cuenta_id,numero");
  const numeros = tickets.map((t) => t.numero);
  // Las líneas y pagos de cada ticket se reemplazan completas (un ticket editado o cancelado trae todo otra vez)
  for (let i = 0; i < numeros.length; i += 200) {
    const parte = numeros.slice(i, i + 200);
    await db.from("lv_lineas").delete().eq("cuenta_id", base.cuenta_id).in("numero", parte);
    await db.from("lv_pagos").delete().eq("cuenta_id", base.cuenta_id).in("numero", parte);
  }
  await sube("lv_lineas", lista.flatMap((t: any) => (t.line_items ?? []).map((l: any, k: number) => ({
    ...base, numero: t.receipt_number, n: k + 1, articulo_id: l.item_id ?? null, variante_id: l.variant_id ?? null,
    nombre: l.item_name ?? null, variante: l.variant_name ?? null, sku: l.sku ?? null, cantidad: n(l.quantity), precio: l.price ?? null,
    total: n(l.total_money), bruto: l.gross_total_money ?? null, costo: l.cost ?? null, costo_total: l.cost_total ?? null, descuento: n(l.total_discount),
    modificadores: l.line_modifiers ?? [], nota: l.line_note ?? null,
  }))), "cuenta_id,numero,n");
  await sube("lv_pagos", lista.flatMap((t: any) => (t.payments ?? []).map((p: any, k: number) => ({
    ...base, numero: t.receipt_number, n: k + 1, tipo_pago_id: p.payment_type_id ?? null, nombre: p.name ?? null, tipo: p.type ?? null,
    monto: n(p.money_amount), pagado_en: p.paid_at ?? null,
  }))), "cuenta_id,numero,n");
}
