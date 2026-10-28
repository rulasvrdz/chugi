-- Baseline del esquema de sellos-app (CHUG-10).
--
-- Reconstruido el 2026-10-28 a partir del catálogo de producción (solo lectura).
-- Equivale a las tres migraciones ya aplicadas en sellos-app:
--   20260807204143 initial_schema
--   20260808000234 tighten_function_permissions
--   20260808035003 fix_public_grant_on_rpc_functions
-- Reproduce el comportamiento actual tal cual, sin correcciones. Las diferencias con
-- docs/configuracion-base-datos.md están documentadas en ese archivo (sección 14).
--
-- Los permisos de tabla para anon, authenticated y service_role vienen de los
-- default privileges de Supabase (iguales en local y en producción); la protección
-- real es RLS.

-- Extensiones -----------------------------------------------------------------------
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_stat_statements with schema extensions;

-- Tipos enumerados ------------------------------------------------------------------
create type public.member_role as enum ('owner', 'manager', 'staff');
create type public.program_status as enum ('active', 'inactive');
create type public.redemption_status as enum ('pending', 'redeemed', 'expired');
create type public.tag_status as enum ('active', 'revoked');
create type public.visit_status as enum ('pending_sync', 'confirmed', 'rejected', 'duplicate');

-- Tablas ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  geofence_radius_m integer not null default 100,
  created_at timestamptz not null default now()
);

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'staff',
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (business_id, customer_id)
);

create table public.stamp_programs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  stamps_required integer not null check (stamps_required > 0),
  stamp_ttl_days integer not null check (stamp_ttl_days > 0),
  reward_description text not null,
  status public.program_status not null default 'active',
  created_at timestamptz not null default now()
);

create unique index one_active_program_per_business
  on public.stamp_programs (business_id)
  where (status = 'active'::public.program_status);

create table public.nfc_tags (
  id uuid primary key default gen_random_uuid(),
  uid text not null unique,
  business_id uuid not null references public.businesses (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  key_ref text not null,
  last_counter bigint not null default -1,
  status public.tag_status not null default 'active',
  created_at timestamptz not null default now()
);

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  stamp_program_id uuid not null references public.stamp_programs (id),
  code_hash text not null,
  status public.redemption_status not null default 'pending',
  redeemed_by uuid references auth.users (id),
  redeemed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  location_id uuid not null references public.locations (id),
  tag_id uuid not null references public.nfc_tags (id),
  stamp_program_id uuid not null references public.stamp_programs (id),
  sdm_counter bigint not null,
  status public.visit_status not null default 'pending_sync',
  captured_at timestamptz not null,
  synced_at timestamptz,
  lat double precision,
  lng double precision,
  expires_at timestamptz not null,
  redemption_id uuid references public.redemptions (id),
  created_at timestamptz not null default now(),
  unique (tag_id, sdm_counter)
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid references auth.users (id),
  action text not null,
  target_table text not null,
  target_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- RLS -------------------------------------------------------------------------------
-- nfc_tags y audit_log quedan sin políticas a propósito: deny-by-default,
-- solo service_role accede.
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.locations enable row level security;
alter table public.business_members enable row level security;
alter table public.enrollments enable row level security;
alter table public.stamp_programs enable row level security;
alter table public.nfc_tags enable row level security;
alter table public.redemptions enable row level security;
alter table public.visits enable row level security;
alter table public.audit_log enable row level security;

-- Funciones -------------------------------------------------------------------------
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$function$;

create or replace function public.is_member_of(p_business_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.business_members
    where business_id = p_business_id and user_id = auth.uid()
  );
$function$;

create or replace function public.is_manager_of(p_business_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.business_members
    where business_id = p_business_id
      and user_id = auth.uid()
      and role in ('owner', 'manager')
  );
$function$;

create or replace function public.request_redemption(p_enrollment_id uuid)
 returns table(redemption_id uuid, code text, expires_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_business_id uuid;
  v_customer_id uuid;
  v_program record;
  v_valid_count int;
  v_code text;
  v_redemption_id uuid;
  v_expires timestamptz;
begin
  select business_id, customer_id into v_business_id, v_customer_id
  from public.enrollments where id = p_enrollment_id;

  if v_customer_id is null then
    raise exception 'enrollment not found';
  end if;

  if v_customer_id <> auth.uid() then
    raise exception 'not authorized';
  end if;

  -- liberar reservas propias ya vencidas y no usadas
  update public.redemptions
    set status = 'expired'
    where enrollment_id = p_enrollment_id
      and status = 'pending'
      and expires_at < now();

  update public.visits
    set redemption_id = null
    where redemption_id in (
      select id from public.redemptions
      where enrollment_id = p_enrollment_id and status = 'expired'
    );

  select * into v_program from public.stamp_programs
    where business_id = v_business_id and status = 'active'
    limit 1;

  if v_program is null then
    raise exception 'no active stamp program';
  end if;

  select count(*) into v_valid_count
  from public.visits
  where enrollment_id = p_enrollment_id
    and status = 'confirmed'
    and redemption_id is null
    and expires_at > now();

  if v_valid_count < v_program.stamps_required then
    raise exception 'not enough stamps: % of %', v_valid_count, v_program.stamps_required;
  end if;

  v_code := encode(gen_random_bytes(6), 'base64');
  v_expires := now() + interval '5 minutes';

  insert into public.redemptions (business_id, enrollment_id, stamp_program_id, code_hash, status, expires_at)
  values (v_business_id, p_enrollment_id, v_program.id, crypt(v_code, gen_salt('bf')), 'pending', v_expires)
  returning id into v_redemption_id;

  update public.visits set redemption_id = v_redemption_id
  where id in (
    select id from public.visits
    where enrollment_id = p_enrollment_id
      and status = 'confirmed'
      and redemption_id is null
      and expires_at > now()
    order by expires_at asc
    limit v_program.stamps_required
    for update
  );

  return query select v_redemption_id, v_code, v_expires;
end;
$function$;

create or replace function public.confirm_redemption(p_redemption_id uuid, p_code text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_business_id uuid;
  v_status redemption_status;
  v_hash text;
  v_expires timestamptz;
begin
  select business_id, status, code_hash, expires_at
    into v_business_id, v_status, v_hash, v_expires
  from public.redemptions where id = p_redemption_id
  for update;

  if v_business_id is null then
    raise exception 'redemption not found';
  end if;

  if not is_member_of(v_business_id) then
    raise exception 'not authorized';
  end if;

  if v_status <> 'pending' then
    raise exception 'redemption not pending (status=%)', v_status;
  end if;

  if v_expires < now() then
    update public.redemptions set status = 'expired' where id = p_redemption_id;
    raise exception 'code expired';
  end if;

  if crypt(p_code, v_hash) <> v_hash then
    raise exception 'invalid code';
  end if;

  update public.redemptions
    set status = 'redeemed', redeemed_by = auth.uid(), redeemed_at = now()
    where id = p_redemption_id;

  return true;
end;
$function$;

-- Permisos de funciones -------------------------------------------------------------
-- Toda función nueva hereda EXECUTE para PUBLIC: se revoca de PUBLIC y de anon
-- (revocar solo de anon no tiene efecto).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

revoke execute on function public.is_member_of(uuid) from public, anon;
grant execute on function public.is_member_of(uuid) to authenticated, service_role;

revoke execute on function public.is_manager_of(uuid) from public, anon;
grant execute on function public.is_manager_of(uuid) to authenticated, service_role;

revoke execute on function public.request_redemption(uuid) from public, anon;
grant execute on function public.request_redemption(uuid) to authenticated, service_role;

revoke execute on function public.confirm_redemption(uuid, text) from public, anon;
grant execute on function public.confirm_redemption(uuid, text) to authenticated, service_role;

-- Trigger ---------------------------------------------------------------------------
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Políticas RLS ---------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid());

create policy businesses_select_enrolled_or_member on public.businesses
  for select using (
    is_member_of(id)
    or exists (
      select 1 from enrollments e
      where e.business_id = businesses.id and e.customer_id = auth.uid()
    )
  );
create policy businesses_update_managers on public.businesses
  for update using (is_manager_of(id));

create policy locations_select_enrolled_or_member on public.locations
  for select using (
    is_member_of(business_id)
    or exists (
      select 1 from enrollments e
      where e.business_id = locations.business_id and e.customer_id = auth.uid()
    )
  );
create policy locations_crud_managers on public.locations
  for all using (is_manager_of(business_id)) with check (is_manager_of(business_id));

create policy members_select_own_business on public.business_members
  for select using (is_member_of(business_id));
create policy members_crud_managers on public.business_members
  for all using (is_manager_of(business_id)) with check (is_manager_of(business_id));

create policy enrollments_select_own on public.enrollments
  for select using (customer_id = auth.uid() or is_member_of(business_id));
create policy enrollments_insert_own on public.enrollments
  for insert with check (customer_id = auth.uid());

create policy programs_select_active_or_member on public.stamp_programs
  for select using (status = 'active'::program_status or is_member_of(business_id));
create policy programs_crud_managers on public.stamp_programs
  for all using (is_manager_of(business_id)) with check (is_manager_of(business_id));

create policy redemptions_select_own_or_member on public.redemptions
  for select using (
    exists (
      select 1 from enrollments e
      where e.id = redemptions.enrollment_id and e.customer_id = auth.uid()
    )
    or is_member_of(business_id)
  );

create policy visits_select_own_or_member on public.visits
  for select using (
    exists (
      select 1 from enrollments e
      where e.id = visits.enrollment_id and e.customer_id = auth.uid()
    )
    or is_member_of(business_id)
  );
