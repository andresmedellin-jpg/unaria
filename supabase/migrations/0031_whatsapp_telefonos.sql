-- Qué depto(s) tiene un teléfono (para saber quién escribe por WhatsApp)
create or replace function app.unidades_de_telefono(p_org uuid, p_tel text)
returns table (unidad_id uuid, identificador text, nombre text, centro_id uuid) language sql stable security definer set search_path = app, public as $$
  select distinct on (u.id) u.id, u.identificador, x.nombre, u.centro_id from (
    select r.unidad_id, r.nombre, 1 o from residentes r where r.org_id = p_org and r.activo and app.tel10(r.telefono) = app.tel10(p_tel)
    union all
    select k.unidad_id, k.arrendatario, 2 from contratos k where k.org_id = p_org and k.activo and app.tel10(k.telefono) = app.tel10(p_tel)
  ) x join unidades u on u.id = x.unidad_id
  order by u.id, x.o
$$;
revoke all on function app.unidades_de_telefono from public, anon, authenticated;
grant execute on function app.unidades_de_telefono to service_role;

-- Reportes de área común: otros residentes que reportaron lo mismo (se les avisa al cerrar)
alter table app.solicitudes add column if not exists avisar_tambien text[] not null default '{}';
