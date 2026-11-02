-- Torre Arboretum, entrega A: caseta (paquetes, pases y accesos) y el canal de WhatsApp de la torre.
-- Base de Unaria (gimvgsjpeyvdretubrgc), esquema app.

-- 1) Quién recibe qué en cada depto
alter table app.residentes
  add column if not exists recibe_avisos boolean not null default true,   -- paquetes, visitas, reportes
  add column if not exists recibe_cobro boolean not null default false;   -- estado de cuenta

-- 2) Paquetes: estado del aviso al residente
alter table app.paquetes
  add column if not exists estado text not null default 'en_caseta',
  add column if not exists avisos int not null default 0,
  add column if not exists ultimo_aviso timestamptz,
  add column if not exists subio_depto boolean not null default false;    -- Rappi/comida que subió directo
alter table app.paquetes add constraint paquetes_estado_ck check (estado in ('en_caseta','avisado','sin_contacto','entregado'));
update app.paquetes set estado = 'entregado' where entregado_en is not null and estado <> 'entregado';

-- 3) Reglas de la torre (caseta y canal)
create table if not exists app.torre_reglas (
  centro_id uuid primary key references app.centros(id) on delete cascade,
  org_id uuid not null references app.organizaciones(id) on delete cascade,
  recordatorio_horas int not null default 24,        -- recordar al residente si no recoge su paquete
  dias_guarda int not null default 7,
  rappi_sube boolean not null default false,
  autoriza_sin_pase text not null default 'residente', -- quién autoriza una visita sin pase
  actualizado_en timestamptz not null default now()
);

-- 4) Pases de visita (invitado, delivery, proveedor, mudanza)
create table if not exists app.pases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizaciones(id) on delete cascade,
  centro_id uuid not null references app.centros(id) on delete cascade,
  unidad_id uuid references app.unidades(id) on delete set null,
  tipo text not null default 'invitado' check (tipo in ('invitado','delivery','proveedor','mudanza')),
  nombre text not null,
  placas text, vehiculo text,
  desde timestamptz not null default now(),
  hasta timestamptz not null default now() + interval '1 day',
  codigo text not null,
  estado text not null default 'activo' check (estado in ('activo','usado','cancelado')),
  llegada timestamptz,
  origen text not null default 'portal' check (origen in ('portal','whatsapp')),
  solicita text, telefono text, notas text,
  creado_por text,
  creado_en timestamptz not null default now()
);
create unique index if not exists pases_codigo_activo on app.pases (centro_id, codigo) where estado = 'activo';
create index if not exists pases_centro_hasta on app.pases (centro_id, hasta);

-- 5) Accesos: cada entrada a la torre (con pase o sin pase)
create table if not exists app.accesos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizaciones(id) on delete cascade,
  centro_id uuid not null references app.centros(id) on delete cascade,
  unidad_id uuid references app.unidades(id) on delete set null,
  pase_id uuid references app.pases(id) on delete set null,
  tipo text not null default 'invitado',
  nombre text not null,
  placas text,
  autorizacion text not null default 'pase' check (autorizacion in ('pase','pendiente','autorizada','rechazada','caseta')),
  respondio text,
  entrada timestamptz not null default now(),
  salida timestamptz,
  guardia text, foto_path text, notas text,
  creado_en timestamptz not null default now()
);
create index if not exists accesos_centro_entrada on app.accesos (centro_id, entrada desc);

-- 6) WhatsApp de la torre: la cuenta conectada (sin la llave; esa vive en los secretos de la función)
create table if not exists app.wa_cuentas (
  centro_id uuid primary key references app.centros(id) on delete cascade,
  org_id uuid not null references app.organizaciones(id) on delete cascade,
  phone_number_id text,          -- de Meta (WhatsApp Business Platform)
  numero text,                   -- el número visible, p. ej. 81 1234 5678
  activo boolean not null default false,
  asistente boolean not null default true,
  plantillas_aprobadas text[] not null default '{}',
  actualizado_en timestamptz not null default now()
);

-- 7) Todos los mensajes: los que salen (avisos) y los que entran (residentes). Nada se pierde en el chat.
create table if not exists app.wa_mensajes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references app.organizaciones(id) on delete cascade,
  centro_id uuid references app.centros(id) on delete cascade,
  unidad_id uuid references app.unidades(id) on delete set null,
  direccion text not null check (direccion in ('sale','entra')),
  telefono text not null,        -- 10 dígitos
  nombre text,
  plantilla text,                -- aviso con plantilla de Meta (fuera de la ventana de 24 h)
  variables jsonb,
  texto text,
  media_url text,
  botones jsonb,                 -- botones de respuesta rápida
  estado text not null default 'en_cola' check (estado in ('en_cola','enviado','entregado','leido','fallo','recibido','simulado')),
  wa_id text, error text,
  ref_tabla text, ref_id uuid,   -- el registro al que pertenece (paquete, pase, acceso, ticket…)
  creado_en timestamptz not null default now(),
  enviado_en timestamptz
);
create index if not exists wa_mensajes_tel on app.wa_mensajes (org_id, telefono, creado_en desc);
create index if not exists wa_mensajes_cola on app.wa_mensajes (estado) where estado = 'en_cola';
create index if not exists wa_mensajes_ref on app.wa_mensajes (ref_tabla, ref_id);

-- 8) Reportes (tickets) que llegan por chat: folio, prioridad y si se puede entrar
alter table app.solicitudes
  add column if not exists folio int,
  add column if not exists prioridad text not null default 'normal',
  add column if not exists area text not null default 'depto',
  add column if not exists puede_entrar text,
  add column if not exists calificacion text;

-- Permisos
alter table app.torre_reglas enable row level security;
alter table app.pases enable row level security;
alter table app.accesos enable row level security;
alter table app.wa_cuentas enable row level security;
alter table app.wa_mensajes enable row level security;

create policy torre_reglas_ver on app.torre_reglas for select using (app.es_miembro(org_id));
create policy torre_reglas_editar on app.torre_reglas for all using (app.tiene_rol(org_id, '{administracion}')) with check (app.tiene_rol(org_id, '{administracion}'));
create policy pases_ver on app.pases for select using (app.es_miembro(org_id));
create policy pases_crear on app.pases for insert with check (app.tiene_rol(org_id, '{administracion,cobranza,encargado,equipo}'));
create policy pases_editar on app.pases for update using (app.tiene_rol(org_id, '{administracion,cobranza,encargado,equipo}')) with check (app.tiene_rol(org_id, '{administracion,cobranza,encargado,equipo}'));
create policy accesos_ver on app.accesos for select using (app.es_miembro(org_id));
create policy accesos_crear on app.accesos for insert with check (app.tiene_rol(org_id, '{administracion,cobranza,encargado,equipo}'));
create policy accesos_editar on app.accesos for update using (app.tiene_rol(org_id, '{administracion,cobranza,encargado,equipo}')) with check (app.tiene_rol(org_id, '{administracion,cobranza,encargado,equipo}'));
create policy wa_cuentas_ver on app.wa_cuentas for select using (app.es_miembro(org_id));
create policy wa_cuentas_editar on app.wa_cuentas for all using (app.tiene_rol(org_id, '{administracion}')) with check (app.tiene_rol(org_id, '{administracion}'));
create policy wa_mensajes_ver on app.wa_mensajes for select using (app.tiene_rol(org_id, '{administracion,cobranza,encargado}'));
grant select, insert, update on app.torre_reglas, app.pases, app.accesos, app.wa_cuentas to authenticated;
grant select on app.wa_mensajes to authenticated;

-- Teléfono a 10 dígitos (México): "+52 1 81 1234 5678" → "8112345678"
create or replace function app.tel10(t text) returns text language sql immutable as
$$ select nullif(right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 10), '') $$;

-- A quién se le avisa en un depto: residentes con "recibe avisos"; si no hay, el teléfono del contrato
create or replace function app.contactos_aviso(p_unidad uuid, p_cobro boolean default false)
returns table (nombre text, telefono text) language sql stable security definer set search_path = app, public as $$
  with r as (
    select r.nombre, app.tel10(r.telefono) tel from residentes r
    where r.unidad_id = p_unidad and r.activo and app.tel10(r.telefono) is not null and length(app.tel10(r.telefono)) = 10
      and (case when p_cobro then r.recibe_cobro else r.recibe_avisos end)
  ), c as (
    select k.arrendatario nombre, app.tel10(k.telefono) tel from contratos k
    where k.unidad_id = p_unidad and k.activo and length(coalesce(app.tel10(k.telefono), '')) = 10
  )
  select distinct on (tel) nombre, tel from (select * from r union all select * from c where not exists (select 1 from r)) x
  where exists (select 1 from unidades u where u.id = p_unidad and app.es_miembro(u.org_id)) or auth.uid() is null
$$;

-- Deja en cola un aviso para todos los contactos del depto. Regresa cuántos quedaron en cola (0 = sin contacto).
create or replace function app.encolar_aviso(p_unidad uuid, p_plantilla text, p_variables jsonb, p_texto text,
  p_media text default null, p_ref_tabla text default null, p_ref_id uuid default null, p_botones jsonb default null)
returns int language plpgsql security definer set search_path = app, public as $$
declare u unidades; n int := 0; k record;
begin
  select * into u from unidades where id = p_unidad;
  if u.id is null then return 0; end if;
  if auth.uid() is not null and not app.tiene_rol(u.org_id, '{administracion,cobranza,encargado,equipo}') then raise exception 'Sin permiso'; end if;
  for k in select * from app.contactos_aviso(p_unidad) loop
    insert into wa_mensajes (org_id, centro_id, unidad_id, direccion, telefono, nombre, plantilla, variables, texto, media_url, botones, ref_tabla, ref_id)
    values (u.org_id, u.centro_id, u.id, 'sale', k.telefono, k.nombre, p_plantilla,
      coalesce(p_variables, '{}'::jsonb) || jsonb_build_object('nombre', split_part(coalesce(k.nombre, ''), ' ', 1)),
      replace(p_texto, '{nombre}', split_part(coalesce(k.nombre, ''), ' ', 1)), p_media, p_botones, p_ref_tabla, p_ref_id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Pase nuevo con código de 6 dígitos que no se repita entre los activos de la torre
create or replace function app.crear_pase(p_centro uuid, p_unidad uuid, p_tipo text, p_nombre text, p_placas text,
  p_vehiculo text, p_desde timestamptz, p_hasta timestamptz, p_origen text default 'portal', p_solicita text default null,
  p_telefono text default null, p_notas text default null)
returns app.pases language plpgsql security definer set search_path = app, public as $$
declare c centros; p pases; cod text; i int := 0;
begin
  select * into c from centros where id = p_centro;
  if c.id is null then raise exception 'Torre no encontrada'; end if;
  if auth.uid() is not null and not app.tiene_rol(c.org_id, '{administracion,cobranza,encargado,equipo}') then raise exception 'Sin permiso'; end if;
  if coalesce(trim(p_nombre), '') = '' then raise exception 'Falta el nombre de la visita'; end if;
  if p_hasta <= p_desde then raise exception 'El pase termina antes de empezar'; end if;
  loop
    cod := lpad((floor(random() * 1000000))::int::text, 6, '0'); i := i + 1;
    exit when not exists (select 1 from pases where centro_id = c.id and codigo = cod and estado = 'activo') or i > 20;
  end loop;
  insert into pases (org_id, centro_id, unidad_id, tipo, nombre, placas, vehiculo, desde, hasta, codigo, origen, solicita, telefono, notas, creado_por)
  values (c.org_id, c.id, p_unidad, coalesce(p_tipo, 'invitado'), trim(p_nombre), nullif(upper(trim(coalesce(p_placas, ''))), ''), nullif(trim(coalesce(p_vehiculo, '')), ''),
    p_desde, p_hasta, cod, p_origen, p_solicita, app.tel10(p_telefono), p_notas,
    coalesce((select nombre from miembros where user_id = auth.uid() limit 1), case when p_origen = 'whatsapp' then 'WhatsApp' else null end))
  returning * into p;
  return p;
end $$;

-- Caseta valida un pase (por código o por el QR "PASE:<código>"): marca la llegada, registra el acceso y avisa al depto
create or replace function app.validar_pase(p_centro uuid, p_codigo text, p_guardia text default null)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare c centros; p pases; u unidades; a uuid; cod text := regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g');
begin
  select * into c from centros where id = p_centro;
  if c.id is null or not app.tiene_rol(c.org_id, '{administracion,cobranza,encargado,equipo}') then raise exception 'Sin permiso'; end if;
  select * into p from pases where centro_id = c.id and codigo = cod and estado = 'activo' order by creado_en desc limit 1;
  if p.id is null then return jsonb_build_object('ok', false, 'motivo', 'No hay un pase activo con ese código'); end if;
  if now() < p.desde - interval '1 hour' then return jsonb_build_object('ok', false, 'motivo', 'El pase empieza ' || to_char(p.desde at time zone 'America/Monterrey', 'DD/MM HH24:MI'), 'pase', to_jsonb(p)); end if;
  if now() > p.hasta then
    update pases set estado = 'usado' where id = p.id;
    return jsonb_build_object('ok', false, 'motivo', 'El pase ya venció', 'pase', to_jsonb(p));
  end if;
  update pases set llegada = coalesce(llegada, now()), estado = case when tipo in ('delivery') then 'usado' else estado end where id = p.id returning * into p;
  insert into accesos (org_id, centro_id, unidad_id, pase_id, tipo, nombre, placas, autorizacion, guardia)
  values (c.org_id, c.id, p.unidad_id, p.id, p.tipo, p.nombre, p.placas, 'pase', coalesce(p_guardia, (select nombre from miembros where user_id = auth.uid() limit 1)))
  returning id into a;
  select * into u from unidades where id = p.unidad_id;
  if u.id is not null then
    perform app.encolar_aviso(u.id, 'visita_llego', jsonb_build_object('visita', p.nombre, 'hora', to_char(now() at time zone 'America/Monterrey', 'HH12:MI am')),
      '🚪 {nombre}, ' || p.nombre || ' llegó a caseta a las ' || to_char(now() at time zone 'America/Monterrey', 'HH12:MI am') || '.', null, 'accesos', a);
  end if;
  return jsonb_build_object('ok', true, 'pase', to_jsonb(p), 'unidad', u.identificador, 'acceso_id', a);
end $$;

-- Folio consecutivo de los reportes por torre
create or replace function app.solicitudes_folio() returns trigger language plpgsql as $$
begin
  if new.folio is null then
    perform pg_advisory_xact_lock(hashtext('folio:' || new.centro_id));
    select coalesce(max(folio), 0) + 1 into new.folio from app.solicitudes where centro_id = new.centro_id;
  end if;
  return new;
end $$;
create or replace trigger solicitudes_folio before insert on app.solicitudes for each row execute function app.solicitudes_folio();

revoke all on function app.encolar_aviso, app.crear_pase, app.validar_pase, app.contactos_aviso from public, anon;
grant execute on function app.encolar_aviso, app.crear_pase, app.validar_pase, app.contactos_aviso, app.tel10 to authenticated;
grant execute on function app.encolar_aviso, app.crear_pase, app.validar_pase, app.contactos_aviso, app.tel10 to service_role;
grant all on app.torre_reglas, app.pases, app.accesos, app.wa_cuentas, app.wa_mensajes to service_role;
