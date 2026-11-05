-- Delta 1 (CHUG-13): adapta el esquema al piloto web y pone las reglas antifraude en la base.
-- Ref: docs/PLAN.md §4.1 a §4.4.
--
-- Las tablas están vacías (docs/configuracion-base-datos.md §12), por eso se puede recrear
-- el enum y agregar columnas NOT NULL sin backfill. Si hubiera datos, los cambios de
-- tipo y los NOT NULL fallarían a propósito en lugar de adivinar valores.
--
-- Toda función nueva: SECURITY DEFINER, search_path fijo, revoke de PUBLIC/anon/authenticated
-- y grant explícito solo a service_role (docs/configuracion-base-datos.md §11).

-- Vault: las llaves SDM viven ahí. Idempotente (en Supabase ya está instalado).
create extension if not exists supabase_vault with schema vault;

-- 1. visit_status: confirmed | voided --------------------------------------------------
alter table public.visits alter column status drop default;
alter type public.visit_status rename to visit_status_old;
create type public.visit_status as enum ('confirmed', 'voided');
alter table public.visits
  alter column status type public.visit_status using status::text::public.visit_status;
alter table public.visits alter column status set default 'confirmed';
drop type public.visit_status_old;

-- 2. visits: sin offline ni GPS ---------------------------------------------------------
-- tag_id y sdm_counter son nulos juntos: los sellos por QR no tienen tag ni contador.
alter table public.visits
  drop column captured_at,
  drop column synced_at,
  drop column lat,
  drop column lng,
  alter column tag_id drop not null,
  alter column sdm_counter drop not null,
  add constraint visits_tag_counter_together check ((tag_id is null) = (sdm_counter is null));

-- 3. locations: sin geofence. lat/lng son del negocio, opcionales --------------------------
alter table public.locations
  drop column geofence_radius_m,
  alter column lat drop not null,
  alter column lng drop not null;

-- 4. profiles: una sola copia del teléfono (auth.users) y solo nombre de pila ----------------
alter table public.profiles drop column phone;
alter table public.profiles rename column full_name to first_name;
alter table public.profiles
  add column privacy_notice_version text,
  add column privacy_accepted_at timestamptz,
  add column last_activity_at timestamptz not null default now(),
  add column deletion_notice_sent_at timestamptz;

-- CREATE OR REPLACE conserva los permisos de handle_new_user.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, first_name)
  values (new.id, nullif(left(btrim(new.raw_user_meta_data->>'first_name'), 50), ''));
  return new;
end;
$function$;

-- 5. businesses: zona horaria, slug y branding ------------------------------------------------
alter table public.businesses
  add column timezone text not null default 'America/Mexico_City',
  add column slug text not null,
  add column brand_color text,
  add column logo_path text,
  add column google_review_url text,
  add constraint businesses_slug_key unique (slug),
  add constraint businesses_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add constraint businesses_brand_color_format check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  add constraint businesses_google_review_url_https check (google_review_url ~ '^https://');

-- Una zona inválida debe fallar al guardar el negocio, no al otorgar un sello.
-- `at time zone` lanza 22023 si la zona no existe.
create function public.validate_business_timezone()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform now() at time zone new.timezone;
  return new;
end;
$function$;

create trigger businesses_validate_timezone
  before insert or update of timezone on public.businesses
  for each row execute function public.validate_business_timezone();

-- 6. 1 sello por día, en la base --------------------------------------------------------------
alter table public.visits add column stamp_date date not null;

-- stamp_date siempre se recalcula en la zona del negocio, mande lo que mande quien inserta.
-- Se usa created_at (default now()) y no now() directo: es el mismo valor en producción y
-- permite probar el cambio de día con pgTAP. Solo service_role escribe visits.
create function public.set_visit_stamp_date()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_timezone text;
begin
  select b.timezone into v_timezone from public.businesses b where b.id = new.business_id;
  if v_timezone is null then
    raise exception 'business not found';
  end if;
  new.stamp_date := (new.created_at at time zone v_timezone)::date;
  return new;
end;
$function$;

create trigger visits_set_stamp_date
  before insert or update of created_at, business_id on public.visits
  for each row execute function public.set_visit_stamp_date();

-- enrollment = (cliente, negocio): 1 sello por cliente, por negocio, por día.
-- Un sello anulado (voided) deja de contar.
create unique index visits_one_per_day
  on public.visits (enrollment_id, stamp_date)
  where (status = 'confirmed'::public.visit_status);

-- 7. tap_claims: un tap validado, de un solo uso ---------------------------------------------
create table public.tap_claims (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('nfc', 'qr')),
  tag_id uuid references public.nfc_tags (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  sdm_counter bigint,
  qr_jti uuid unique,
  issued_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '10 minutes',
  consumed_at timestamptz,
  result text check (result in ('granted', 'already_today', 'expired')),
  visit_id uuid references public.visits (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint tap_claims_tag_counter_key unique (tag_id, sdm_counter),
  constraint tap_claims_nfc_fields check (
    source <> 'nfc' or (tag_id is not null and sdm_counter is not null and qr_jti is null)
  ),
  constraint tap_claims_qr_fields check (
    source <> 'qr' or (qr_jti is not null and tag_id is null and sdm_counter is null)
  ),
  constraint tap_claims_consumed_with_result check ((consumed_at is null) = (result is null))
);

create index tap_claims_business_id_idx on public.tap_claims (business_id);
create index tap_claims_location_id_idx on public.tap_claims (location_id);
create index tap_claims_issued_by_idx on public.tap_claims (issued_by);
create index tap_claims_visit_id_idx on public.tap_claims (visit_id);

-- Sin políticas a propósito (deny-by-default): solo service_role. Además se quitan los
-- permisos de tabla a anon y authenticated.
alter table public.tap_claims enable row level security;
revoke all on public.tap_claims from anon, authenticated;

-- 8. RPCs (solo service_role) -----------------------------------------------------------------

-- Anti-replay atómico: el UPDATE solo avanza si el contador es mayor. Devuelve null si la
-- URL ya se usó, el contador es menor, el tag no existe o está revocado.
create function public.create_tap_claim(p_tag_id uuid, p_counter bigint)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_business_id uuid;
  v_location_id uuid;
  v_claim_id uuid;
begin
  update public.nfc_tags t
    set last_counter = p_counter
    where t.id = p_tag_id and t.status = 'active' and t.last_counter < p_counter
    returning t.business_id, t.location_id into v_business_id, v_location_id;

  if not found then
    return null;
  end if;

  insert into public.tap_claims (source, tag_id, business_id, location_id, sdm_counter)
  values ('nfc', p_tag_id, v_business_id, v_location_id, p_counter)
  returning id into v_claim_id;

  return v_claim_id;
end;
$function$;

-- Claim del QR de respaldo. auth.uid() es nulo con service_role, por eso la membresía
-- de quien emite se revisa aquí. Devuelve null si el jti ya se usó.
create function public.create_qr_claim(
  p_business_id uuid, p_location_id uuid, p_jti uuid, p_issued_by uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_claim_id uuid;
begin
  if not exists (
    select 1 from public.locations l
    where l.id = p_location_id and l.business_id = p_business_id
  ) then
    raise exception 'location does not belong to business';
  end if;

  if not exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id and m.user_id = p_issued_by
  ) then
    raise exception 'issuer is not a member of the business';
  end if;

  begin
    insert into public.tap_claims (source, business_id, location_id, qr_jti, issued_by)
    values ('qr', p_business_id, p_location_id, p_jti, p_issued_by)
    returning id into v_claim_id;
  exception when unique_violation then
    return null;
  end;

  return v_claim_id;
end;
$function$;

-- Llaves SDM de una versión, desde Vault. Nombres: sdm_meta_<ref> y sdm_file_master_<ref>.
create function public.get_sdm_keys(p_key_ref text)
 returns table (meta_key text, file_master_key text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_meta text;
  v_file text;
begin
  select s.decrypted_secret into v_meta
    from vault.decrypted_secrets s where s.name = 'sdm_meta_' || p_key_ref;
  select s.decrypted_secret into v_file
    from vault.decrypted_secrets s where s.name = 'sdm_file_master_' || p_key_ref;

  if v_meta is null or v_file is null then
    raise exception 'sdm keys not found';
  end if;

  return query select v_meta, v_file;
end;
$function$;

-- Cobra un claim: crea el enrollment, inserta el sello y marca el claim, en una transacción.
-- Idempotente: un claim ya consumido devuelve su resultado sin tocar nada. Los nombres de
-- salida no coinciden con columnas de las tablas, para evitar referencias ambiguas (42702).
create function public.grant_stamp(p_claim_id uuid, p_user_id uuid)
 returns table (claim_result text, stamps_count integer, stamps_target integer, reward text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_claim public.tap_claims%rowtype;
  v_program public.stamp_programs%rowtype;
  v_enrollment_id uuid;
  v_visit_id uuid;
  v_result text;
  v_constraint text;
  v_count integer;
begin
  select * into v_claim from public.tap_claims c where c.id = p_claim_id for update;
  if not found then
    raise exception 'claim not found';
  end if;

  -- Sin programa activo no se consume el claim: el cliente puede reintentar.
  select * into v_program from public.stamp_programs sp
    where sp.business_id = v_claim.business_id and sp.status = 'active';
  if not found then
    raise exception 'no active stamp program';
  end if;

  if v_claim.consumed_at is not null then
    v_result := v_claim.result;
  elsif v_claim.expires_at < now() then
    v_result := 'expired';
    update public.tap_claims set consumed_at = now(), result = v_result where id = p_claim_id;
  else
    insert into public.enrollments (business_id, customer_id)
    values (v_claim.business_id, p_user_id)
    on conflict (business_id, customer_id) do nothing;

    select e.id into v_enrollment_id from public.enrollments e
      where e.business_id = v_claim.business_id and e.customer_id = p_user_id;

    begin
      insert into public.visits (
        business_id, enrollment_id, location_id, tag_id, stamp_program_id,
        sdm_counter, status, expires_at)
      values (
        v_claim.business_id, v_enrollment_id, v_claim.location_id, v_claim.tag_id,
        v_program.id, v_claim.sdm_counter, 'confirmed',
        now() + make_interval(days => v_program.stamp_ttl_days))
      returning id into v_visit_id;
      v_result := 'granted';
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      -- Solo el tope diario es "already_today"; cualquier otro choque es un error real.
      if v_constraint is distinct from 'visits_one_per_day' then
        raise;
      end if;
      v_result := 'already_today';
      v_visit_id := null;
    end;

    if v_result = 'granted' then
      update public.profiles set last_activity_at = now() where id = p_user_id;
    end if;

    update public.tap_claims
      set consumed_at = now(), result = v_result, visit_id = v_visit_id
      where id = p_claim_id;
  end if;

  select count(*)::integer into v_count
    from public.visits v
    join public.enrollments e on e.id = v.enrollment_id
    where e.business_id = v_claim.business_id
      and e.customer_id = p_user_id
      and v.status = 'confirmed'
      and v.redemption_id is null
      and v.expires_at > now();

  return query select v_result, v_count, v_program.stamps_required, v_program.reward_description;
end;
$function$;

-- 9. Permisos de funciones --------------------------------------------------------------------
revoke execute on function public.validate_business_timezone() from public, anon, authenticated;
grant execute on function public.validate_business_timezone() to service_role;

revoke execute on function public.set_visit_stamp_date() from public, anon, authenticated;
grant execute on function public.set_visit_stamp_date() to service_role;

revoke execute on function public.create_tap_claim(uuid, bigint) from public, anon, authenticated;
grant execute on function public.create_tap_claim(uuid, bigint) to service_role;

revoke execute on function public.create_qr_claim(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_qr_claim(uuid, uuid, uuid, uuid) to service_role;

revoke execute on function public.get_sdm_keys(text) from public, anon, authenticated;
grant execute on function public.get_sdm_keys(text) to service_role;

revoke execute on function public.grant_stamp(uuid, uuid) from public, anon, authenticated;
grant execute on function public.grant_stamp(uuid, uuid) to service_role;
