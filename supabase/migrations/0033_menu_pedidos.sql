-- Menú interactivo y pedidos (Chilabike primero; sirve para cualquier negocio de comida del sistema).
-- app.menus: el menú que se captura en el portal (Negocio → Menú) y que arma el menú de WhatsApp, Instagram y Messenger.
--   datos = { producto: {nombre, detalle, precio, incluye}, pasos: [{id, titulo, ayuda, tipo: una|varias, obligatorio,
--   estilo: salsa|tarjeta|chips, junto, predeterminado, opciones: [{id, nombre, desc, precio, emoji, color, disponible, visible}]}],
--   envio, pagos: [...], sucursales: [...], eventos: {tipos, precioPersona} }  (forma: docs/demo/chilabike/menu-ejemplo.js)
-- app.pedidos: lo que llega del menú o del chat; estados nuevo → cocina → camino → entregado (o cancelado).
create table if not exists app.menus (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizaciones(id) on delete cascade,
  empresa_id uuid not null references app.empresas(id) on delete cascade,
  datos jsonb not null default '{}',
  publicado_en timestamptz not null default now(),
  publicado_por text,
  unique (empresa_id)
);
create table if not exists app.pedidos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizaciones(id) on delete cascade,
  empresa_id uuid not null references app.empresas(id) on delete cascade,
  numero integer not null,
  canal text not null default 'whatsapp',          -- whatsapp · instagram · facebook · pagina · mostrador
  conversacion_id uuid,                              -- la plática de la que salió (bandeja)
  contacto text, telefono text,
  items jsonb not null default '[]',                 -- [{cantidad, producto, precio_unit, total, elecciones: {paso: [opciones]}, resumen}]
  entrega text not null default 'domicilio',         -- domicilio · recoger
  direccion text, sucursal text,
  pago text, cambio text, pagado boolean not null default false, comprobante text,
  subtotal numeric not null default 0, envio numeric not null default 0, total numeric not null default 0,
  estado text not null default 'nuevo' check (estado in ('nuevo','cocina','camino','entregado','cancelado')),
  notas text,
  creado_en timestamptz not null default now(),
  cambios jsonb not null default '[]',               -- [{estado, en, por}] para medir tiempos
  unique (empresa_id, numero)
);
create index if not exists pedidos_dia on app.pedidos (empresa_id, creado_en desc);

-- Número de pedido consecutivo por negocio
create or replace function app.pedido_numero() returns trigger language plpgsql as $$
begin
  if new.numero is null or new.numero = 0 then
    select coalesce(max(numero), 100) + 1 into new.numero from app.pedidos where empresa_id = new.empresa_id;
  end if;
  return new;
end $$;
drop trigger if exists pedidos_numero on app.pedidos;
create trigger pedidos_numero before insert on app.pedidos for each row execute function app.pedido_numero();

alter table app.menus enable row level security;
alter table app.pedidos enable row level security;
drop policy if exists menus_ver on app.menus;
create policy menus_ver on app.menus for select using (app.es_miembro(org_id));
drop policy if exists menus_editar on app.menus;
create policy menus_editar on app.menus for all using (app.tiene_rol(org_id, '{administracion}')) with check (app.tiene_rol(org_id, '{administracion}'));
drop policy if exists pedidos_ver on app.pedidos;
create policy pedidos_ver on app.pedidos for select using (app.es_miembro(org_id));
drop policy if exists pedidos_editar on app.pedidos;
create policy pedidos_editar on app.pedidos for update using (app.tiene_rol(org_id, '{administracion,encargado,operacion}')) with check (app.tiene_rol(org_id, '{administracion,encargado,operacion}'));
drop policy if exists pedidos_crear on app.pedidos;
create policy pedidos_crear on app.pedidos for insert with check (app.tiene_rol(org_id, '{administracion,encargado,operacion}'));
grant select, insert, update on app.menus, app.pedidos to authenticated;
-- El menú público (lo que ve el cliente) y los pedidos que llegan del menú pasan por una función del servidor
-- (service_role), que valida precios contra app.menus: el navegador del cliente nunca escribe directo.
