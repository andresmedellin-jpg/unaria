-- Loyverse → Unaria: todo lo que vive en el punto de venta del cliente, copiado a su base para verlo y cruzarlo
-- con el resto del sistema (Curandero primero; Lattico cuando contrate Loyverse).
-- La función "loyverse" (supabase/functions/loyverse) llena estas tablas: catálogo, clientes, empleados, tickets
-- con sus líneas y pagos, e inventario. Los ids son los de Loyverse (texto) y van por organización.
-- El token de Loyverse NO es legible desde el navegador: vive en app.lv_tokens, sin permisos más que para el servidor.

-- ---------- cuenta ----------
-- Una cuenta por negocio: un dueño con varios negocios (p. ej. Curandero y Lattico) tiene una cuenta de Loyverse por cada uno,
-- todas dentro de la misma organización; las ventas nunca se revuelven porque todo va por cuenta_id.
create table if not exists app.lv_cuentas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizaciones(id) on delete cascade,
  empresa_id uuid references app.empresas(id) on delete set null,   -- el negocio del sistema al que pertenecen las ventas
  merchant_id text unique,                                              -- id del negocio en Loyverse (para los avisos)
  aviso_clave text not null default replace(gen_random_uuid()::text, '-', ''),  -- va en la dirección del aviso (webhook) que se da de alta en Loyverse
  negocio text,                                                         -- nombre del negocio en Loyverse
  moneda text default 'MXN',
  activo boolean not null default true,
  estado text not null default 'nuevo',            -- nuevo · importando · al_dia · error
  historial_desde date,                            -- desde cuándo se trajo el historial
  importado_hasta timestamptz,                     -- hasta dónde va la importación del historial (por lotes)
  ultimo_sync timestamptz,                         -- última sincronización completa
  ultimo_error text,
  resumen jsonb not null default '{}',             -- cuántos tickets, artículos, clientes… se trajeron
  creado_en timestamptz not null default now()
);
create unique index if not exists lv_cuentas_empresa on app.lv_cuentas (org_id, empresa_id);
create table if not exists app.lv_tokens (
  cuenta_id uuid primary key references app.lv_cuentas(id) on delete cascade,
  token text not null,
  creado_en timestamptz not null default now()
);

-- ---------- catálogo ----------
create table if not exists app.lv_tiendas (
  org_id uuid not null, cuenta_id uuid not null references app.lv_cuentas(id) on delete cascade, id text not null,
  nombre text, direccion text, telefono text, centro_id uuid references app.centros(id) on delete set null,
  actualizado timestamptz, datos jsonb not null default '{}', primary key (cuenta_id, id));
create table if not exists app.lv_categorias (
  org_id uuid not null, cuenta_id uuid not null references app.lv_cuentas(id) on delete cascade, id text not null,
  nombre text, color text, borrado boolean not null default false, datos jsonb not null default '{}', primary key (cuenta_id, id));
create table if not exists app.lv_articulos (
  org_id uuid not null, cuenta_id uuid not null references app.lv_cuentas(id) on delete cascade, id text not null,
  nombre text, categoria_id text, descripcion text, controla_inventario boolean, es_compuesto boolean,
  forma text, color text, imagen text, borrado boolean not null default false, actualizado timestamptz,
  datos jsonb not null default '{}', primary key (cuenta_id, id));
-- Cada artículo tiene una o más variantes (tamaño, sabor…); el precio y el costo van por variante
create table if not exists app.lv_variantes (
  org_id uuid not null, cuenta_id uuid not null references app.lv_cuentas(id) on delete cascade, id text not null,
  articulo_id text not null, nombre text, sku text, codigo_barras text, precio numeric, costo numeric,
  precios_tienda jsonb not null default '[]', borrado boolean not null default false, primary key (cuenta_id, id));
create table if not exists app.lv_tipos_pago (
  org_id uuid not null, cuenta_id uuid not null references app.lv_cuentas(id) on delete cascade, id text not null,
  nombre text, tipo text, borrado boolean not null default false, primary key (cuenta_id, id));
create table if not exists app.lv_empleados (
  org_id uuid not null, cuenta_id uuid not null references app.lv_cuentas(id) on delete cascade, id text not null,
  nombre text, email text, telefono text, tiendas text[] not null default '{}', borrado boolean not null default false,
  empleado_id uuid references app.empleados(id) on delete set null,   -- liga con Personal del sistema, si existe
  primary key (cuenta_id, id));
create table if not exists app.lv_clientes (
  org_id uuid not null, cuenta_id uuid not null references app.lv_cuentas(id) on delete cascade, id text not null,
  nombre text, email text, telefono text, codigo text, nota text, puntos numeric, visitas integer, total_gastado numeric,
  primera_visita timestamptz, ultima_visita timestamptz, ciudad text, actualizado timestamptz,
  datos jsonb not null default '{}', primary key (cuenta_id, id));

-- ---------- ventas ----------
create table if not exists app.lv_tickets (
  org_id uuid not null, cuenta_id uuid not null references app.lv_cuentas(id) on delete cascade,
  numero text not null,                             -- receipt_number (único por negocio)
  tipo text not null default 'SALE',                -- SALE · REFUND
  devolucion_de text,                               -- en una devolución, el ticket original
  fecha timestamptz not null,                       -- receipt_date
  dia date not null,                                -- fecha en hora de Monterrey (para agrupar)
  tienda_id text, empleado_id text, cliente_id text, dispositivo_id text,
  opcion_consumo text,                              -- comer aquí, para llevar, a domicilio…
  total numeric not null default 0,                 -- total_money (con impuestos, sin propina)
  impuestos numeric not null default 0, descuento numeric not null default 0, propina numeric not null default 0,
  puntos_ganados numeric, puntos_usados numeric,
  cancelado_en timestamptz, nota text, fuente text, actualizado timestamptz,
  datos jsonb not null default '{}',
  primary key (cuenta_id, numero));
create index if not exists lv_tickets_dia on app.lv_tickets (cuenta_id, dia);
create index if not exists lv_tickets_cliente on app.lv_tickets (cuenta_id, cliente_id);
create table if not exists app.lv_lineas (
  org_id uuid not null, cuenta_id uuid not null, numero text not null, n integer not null,
  articulo_id text, variante_id text, nombre text, variante text, sku text,
  cantidad numeric not null default 0, precio numeric, total numeric not null default 0, bruto numeric,
  costo numeric, costo_total numeric, descuento numeric not null default 0,
  modificadores jsonb not null default '[]', nota text,
  primary key (cuenta_id, numero, n),
  foreign key (cuenta_id, numero) references app.lv_tickets (cuenta_id, numero) on delete cascade);
create index if not exists lv_lineas_articulo on app.lv_lineas (cuenta_id, articulo_id);
create table if not exists app.lv_pagos (
  org_id uuid not null, cuenta_id uuid not null, numero text not null, n integer not null,
  tipo_pago_id text, nombre text, tipo text, monto numeric not null default 0, pagado_en timestamptz,
  primary key (cuenta_id, numero, n),
  foreign key (cuenta_id, numero) references app.lv_tickets (cuenta_id, numero) on delete cascade);

-- ---------- inventario ----------
create table if not exists app.lv_inventario (
  org_id uuid not null, cuenta_id uuid not null references app.lv_cuentas(id) on delete cascade,
  variante_id text not null, tienda_id text not null, existencia numeric, actualizado timestamptz,
  primary key (cuenta_id, variante_id, tienda_id));

-- ---------- vistas para el tablero (respetan los permisos de quien consulta) ----------
-- Venta neta = ventas − devoluciones, sin tickets cancelados
create or replace view app.v_lv_ventas_dia with (security_invoker = true) as
  select t.org_id, t.cuenta_id, t.dia, t.tienda_id,
    count(*) filter (where t.tipo = 'SALE') as tickets,
    sum(case when t.tipo = 'REFUND' then -t.total else t.total end) as venta,
    sum(case when t.tipo = 'REFUND' then -t.impuestos else t.impuestos end) as impuestos,
    sum(t.descuento) as descuentos, sum(t.propina) as propinas,
    count(distinct t.cliente_id) filter (where t.cliente_id is not null) as clientes
  from app.lv_tickets t where t.cancelado_en is null
  group by t.org_id, t.cuenta_id, t.dia, t.tienda_id;

create or replace view app.v_lv_productos_dia with (security_invoker = true) as
  select l.org_id, l.cuenta_id, t.dia, t.tienda_id, l.articulo_id, l.variante_id,
    max(l.nombre) as nombre, max(l.variante) as variante,
    sum(case when t.tipo = 'REFUND' then -l.cantidad else l.cantidad end) as cantidad,
    sum(case when t.tipo = 'REFUND' then -l.total else l.total end) as venta,
    sum(case when t.tipo = 'REFUND' then -coalesce(l.costo_total, 0) else coalesce(l.costo_total, 0) end) as costo
  from app.lv_lineas l join app.lv_tickets t on t.cuenta_id = l.cuenta_id and t.numero = l.numero
  where t.cancelado_en is null
  group by l.org_id, l.cuenta_id, t.dia, t.tienda_id, l.articulo_id, l.variante_id;

create or replace view app.v_lv_pagos_dia with (security_invoker = true) as
  select p.org_id, p.cuenta_id, t.dia, t.tienda_id, coalesce(p.nombre, p.tipo) as forma, p.tipo,
    sum(case when t.tipo = 'REFUND' then -p.monto else p.monto end) as monto, count(*) as pagos
  from app.lv_pagos p join app.lv_tickets t on t.cuenta_id = p.cuenta_id and t.numero = p.numero
  where t.cancelado_en is null
  group by p.org_id, p.cuenta_id, t.dia, t.tienda_id, coalesce(p.nombre, p.tipo), p.tipo;

-- Ventas por hora y día de la semana (para saber cuándo se llena)
create or replace view app.v_lv_horas with (security_invoker = true) as
  select t.org_id, t.cuenta_id, t.tienda_id, t.dia,
    extract(isodow from t.fecha at time zone 'America/Monterrey')::int as dow,
    extract(hour from t.fecha at time zone 'America/Monterrey')::int as hora,
    count(*) filter (where t.tipo = 'SALE') as tickets,
    sum(case when t.tipo = 'REFUND' then -t.total else t.total end) as venta
  from app.lv_tickets t where t.cancelado_en is null
  group by 1, 2, 3, 4, 5, 6;

-- ---------- permisos ----------
alter table app.lv_cuentas enable row level security;
alter table app.lv_tokens enable row level security;        -- sin políticas: solo el servidor (service_role) la lee
alter table app.lv_tiendas enable row level security;
alter table app.lv_categorias enable row level security;
alter table app.lv_articulos enable row level security;
alter table app.lv_variantes enable row level security;
alter table app.lv_tipos_pago enable row level security;
alter table app.lv_empleados enable row level security;
alter table app.lv_clientes enable row level security;
alter table app.lv_tickets enable row level security;
alter table app.lv_lineas enable row level security;
alter table app.lv_pagos enable row level security;
alter table app.lv_inventario enable row level security;

do $$ declare t text; begin
  foreach t in array array['lv_cuentas','lv_tiendas','lv_categorias','lv_articulos','lv_variantes','lv_tipos_pago',
                           'lv_empleados','lv_clientes','lv_tickets','lv_lineas','lv_pagos','lv_inventario'] loop
    execute format('drop policy if exists %1$s_ver on app.%1$s', t);
    -- Ventas, clientes y costos: dueño y administración (como Prospectos y Reporte mensual)
    execute format('create policy %1$s_ver on app.%1$s for select using (app.tiene_rol(org_id, ''{administracion}''))', t);
  end loop;
end $$;
-- Ligar tiendas con sucursales y empleados con Personal: administración
drop policy if exists lv_tiendas_ligar on app.lv_tiendas;
create policy lv_tiendas_ligar on app.lv_tiendas for update using (app.tiene_rol(org_id, '{administracion}')) with check (app.tiene_rol(org_id, '{administracion}'));
drop policy if exists lv_empleados_ligar on app.lv_empleados;
create policy lv_empleados_ligar on app.lv_empleados for update using (app.tiene_rol(org_id, '{administracion}')) with check (app.tiene_rol(org_id, '{administracion}'));

grant select on app.lv_cuentas, app.lv_tiendas, app.lv_categorias, app.lv_articulos, app.lv_variantes, app.lv_tipos_pago,
  app.lv_empleados, app.lv_clientes, app.lv_tickets, app.lv_lineas, app.lv_pagos, app.lv_inventario,
  app.v_lv_ventas_dia, app.v_lv_productos_dia, app.v_lv_pagos_dia, app.v_lv_horas to authenticated;
grant update (centro_id) on app.lv_tiendas to authenticated;
grant update (empleado_id) on app.lv_empleados to authenticated;
revoke all on app.lv_tokens from anon, authenticated;

-- ---------- sincronización automática ----------
-- Cada 10 minutos el servidor trae lo nuevo de todas las cuentas activas (además, Loyverse avisa al instante
-- cuando hay un ticket nuevo). Requiere las extensiones pg_cron y pg_net. Se programa una sola vez, con la llave
-- del servidor guardada en Vault con el nombre 'service_role_key':
--
-- select cron.schedule('loyverse-cada-10-min', '*/10 * * * *', $c$
--   select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/loyverse',
--     headers := jsonb_build_object('Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
--     body := '{"accion":"sincronizar"}'::jsonb)
-- $c$);
