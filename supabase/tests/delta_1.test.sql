-- Delta 1 (CHUG-13): esquema nuevo, 1 sello por día, tap_claims, RPCs y permisos.
-- Datos sintéticos; todo se revierte con rollback.
-- ids fijos: usuarios 1x, negocios 2x, resto 3x, claims 4x, visitas 5x
begin;
select plan(71);

-- Datos -------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000011', 'cliente_a@test.invalid'),
  ('00000000-0000-0000-0000-000000000012', 'cliente_b@test.invalid'),
  ('00000000-0000-0000-0000-000000000013', 'staff_x@test.invalid'),
  ('00000000-0000-0000-0000-000000000014', 'cliente_c@test.invalid'),
  ('00000000-0000-0000-0000-000000000015', 'staff_y@test.invalid');

insert into public.businesses (id, name, slug) values
  ('00000000-0000-0000-0000-000000000021', 'Negocio X', 'negocio-x'),
  ('00000000-0000-0000-0000-000000000022', 'Negocio Y', 'negocio-y');

insert into public.business_members (business_id, user_id, role) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000013', 'staff'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000015', 'staff');

-- lat/lng ya son opcionales
insert into public.locations (id, business_id, name) values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000021', 'Sucursal X'),
  ('00000000-0000-0000-0000-000000000036', '00000000-0000-0000-0000-000000000022', 'Sucursal Y');

insert into public.nfc_tags (id, uid, business_id, location_id, key_ref, status) values
  ('00000000-0000-0000-0000-000000000032', '04AABBCCDDEE80', '00000000-0000-0000-0000-000000000021',
   '00000000-0000-0000-0000-000000000031', 'v1', 'active'),
  ('00000000-0000-0000-0000-000000000037', '04AABBCCDDEE81', '00000000-0000-0000-0000-000000000021',
   '00000000-0000-0000-0000-000000000031', 'v1', 'revoked');

-- Solo el negocio X tiene programa activo
insert into public.stamp_programs (id, business_id, stamps_required, stamp_ttl_days, reward_description) values
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000021', 3, 90, 'Café gratis');

insert into public.enrollments (id, business_id, customer_id) values
  ('00000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000021',
   '00000000-0000-0000-0000-000000000014');

-- Claims para grant_stamp: 41 y 42 vigentes, 43 vencido, 44 QR de X, 45 QR de Y (sin programa)
insert into public.tap_claims (id, source, tag_id, business_id, location_id, sdm_counter, expires_at) values
  ('00000000-0000-0000-0000-000000000041', 'nfc', '00000000-0000-0000-0000-000000000032',
   '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000031', 100, now() + interval '10 minutes'),
  ('00000000-0000-0000-0000-000000000042', 'nfc', '00000000-0000-0000-0000-000000000032',
   '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000031', 101, now() + interval '10 minutes'),
  ('00000000-0000-0000-0000-000000000043', 'nfc', '00000000-0000-0000-0000-000000000032',
   '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000031', 102, now() - interval '1 minute');
insert into public.tap_claims (id, source, business_id, location_id, qr_jti, issued_by) values
  ('00000000-0000-0000-0000-000000000044', 'qr', '00000000-0000-0000-0000-000000000021',
   '00000000-0000-0000-0000-000000000031', 'aaaaaaaa-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000013'),
  ('00000000-0000-0000-0000-000000000045', 'qr', '00000000-0000-0000-0000-000000000022',
   '00000000-0000-0000-0000-000000000036', 'aaaaaaaa-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000015');

-- Esquema -----------------------------------------------------------------------------
select has_column('public', 'visits', 'stamp_date', 'visits.stamp_date existe');
select hasnt_column('public', 'visits', 'captured_at', 'visits.captured_at eliminada');
select hasnt_column('public', 'visits', 'synced_at', 'visits.synced_at eliminada');
select hasnt_column('public', 'visits', 'lat', 'visits.lat eliminada');
select hasnt_column('public', 'visits', 'lng', 'visits.lng eliminada');
select hasnt_column('public', 'locations', 'geofence_radius_m', 'locations.geofence_radius_m eliminada');
select hasnt_column('public', 'profiles', 'phone', 'profiles.phone eliminada');
select has_column('public', 'profiles', 'first_name', 'profiles.first_name existe');
select hasnt_column('public', 'profiles', 'full_name', 'profiles.full_name renombrada');
select enum_has_labels('public', 'visit_status', array['confirmed', 'voided'], 'visit_status = confirmed, voided');
select col_is_null('public', 'visits', 'tag_id', 'visits.tag_id es nullable');
select has_table('public', 'tap_claims', 'tap_claims existe');

select throws_ok(
  $$insert into public.businesses (name, slug) values ('Z', 'Bad Slug')$$,
  '23514', null, 'slug con mayúsculas o espacios rechazado');
select throws_ok(
  $$insert into public.businesses (name, slug, timezone) values ('Z', 'zona-mala', 'Mars/Olympus')$$,
  '22023', null, 'zona horaria inválida rechazada al guardar el negocio');
select throws_ok(
  $$insert into public.businesses (name, slug, brand_color) values ('Z', 'color-malo', 'red')$$,
  '23514', null, 'brand_color debe ser #rrggbb');
select throws_ok(
  $$insert into public.tap_claims (source, tag_id, business_id, location_id)
    values ('nfc', '00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000021',
            '00000000-0000-0000-0000-000000000031')$$,
  '23514', null, 'claim nfc sin contador rechazado');
select throws_ok(
  $$insert into public.tap_claims (source, tag_id, business_id, location_id, qr_jti)
    values ('qr', '00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000021',
            '00000000-0000-0000-0000-000000000031', 'aaaaaaaa-0000-0000-0000-0000000000f1')$$,
  '23514', null, 'claim qr con tag rechazado');

-- handle_new_user: nombre de pila desde la metadata, recortado; sin metadata queda nulo
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000016', 'cliente_d@test.invalid', '{"first_name": "  Ana "}');
select is((select first_name from public.profiles where id = '00000000-0000-0000-0000-000000000016'),
  'Ana', 'handle_new_user guarda first_name recortado');
select is((select first_name from public.profiles where id = '00000000-0000-0000-0000-000000000011'),
  null::text, 'sin metadata, first_name queda nulo');

-- create_tap_claim: anti-replay atómico ---------------------------------------------------
select isnt(public.create_tap_claim('00000000-0000-0000-0000-000000000032', 5), null::uuid,
  'create_tap_claim: contador nuevo crea el claim');
select is(public.create_tap_claim('00000000-0000-0000-0000-000000000032', 5), null::uuid,
  'create_tap_claim: el mismo contador (replay) devuelve null');
select is(public.create_tap_claim('00000000-0000-0000-0000-000000000032', 4), null::uuid,
  'create_tap_claim: un contador menor devuelve null');
select isnt(public.create_tap_claim('00000000-0000-0000-0000-000000000032', 6), null::uuid,
  'create_tap_claim: un contador mayor crea otro claim');
select is((select last_counter from public.nfc_tags where id = '00000000-0000-0000-0000-000000000032'),
  6::bigint, 'last_counter avanzó a 6');
select is(public.create_tap_claim('00000000-0000-0000-0000-000000000037', 1), null::uuid,
  'create_tap_claim: un tag revocado devuelve null');
select is((select count(*) from public.tap_claims
           where tag_id = '00000000-0000-0000-0000-000000000032' and sdm_counter in (5, 6))::int,
  2, 'solo quedaron los claims de los contadores 5 y 6');

-- create_qr_claim ---------------------------------------------------------------------------
select isnt(public.create_qr_claim('00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000031', 'aaaaaaaa-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000013'), null::uuid, 'create_qr_claim: staff del negocio emite el claim');
select is(public.create_qr_claim('00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000031', 'aaaaaaaa-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000013'), null::uuid, 'create_qr_claim: jti repetido devuelve null');
select throws_ok(
  $$select public.create_qr_claim('00000000-0000-0000-0000-000000000021',
      '00000000-0000-0000-0000-000000000031', 'aaaaaaaa-0000-0000-0000-000000000009',
      '00000000-0000-0000-0000-000000000012')$$,
  'P0001', 'issuer is not a member of the business', 'create_qr_claim: quien no es miembro no emite');
select throws_ok(
  $$select public.create_qr_claim('00000000-0000-0000-0000-000000000021',
      '00000000-0000-0000-0000-000000000036', 'aaaaaaaa-0000-0000-0000-000000000009',
      '00000000-0000-0000-0000-000000000013')$$,
  'P0001', 'location does not belong to business', 'create_qr_claim: sucursal de otro negocio rechazada');
select is((select count(*) from public.tap_claims where qr_jti = 'aaaaaaaa-0000-0000-0000-000000000001')::int,
  1, 'el jti quedó una sola vez');

-- get_sdm_keys ------------------------------------------------------------------------------
select throws_ok($$select * from public.get_sdm_keys('v1')$$,
  'P0001', 'sdm keys not found', 'get_sdm_keys: sin secretos en Vault lanza error');
select vault.create_secret('meta-v1', 'sdm_meta_v1');
select vault.create_secret('file-v1', 'sdm_file_master_v1');
select vault.create_secret('meta-v2', 'sdm_meta_v2');
select is((select meta_key from public.get_sdm_keys('v1')), 'meta-v1', 'get_sdm_keys: llave de metadatos');
select is((select file_master_key from public.get_sdm_keys('v1')), 'file-v1', 'get_sdm_keys: llave maestra de archivo');
select throws_ok($$select * from public.get_sdm_keys('v2')$$,
  'P0001', 'sdm keys not found', 'get_sdm_keys: con una sola de las dos llaves lanza error');

-- grant_stamp -------------------------------------------------------------------------------
select results_eq(
  $$select * from public.grant_stamp('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000011')$$,
  $$values ('granted'::text, 1, 3, 'Café gratis'::text)$$,
  'grant_stamp: primer sello del día = granted');
select results_eq(
  $$select * from public.grant_stamp('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000011')$$,
  $$values ('already_today'::text, 1, 3, 'Café gratis'::text)$$,
  'grant_stamp: segundo claim el mismo día = already_today');
select is((select count(*) from public.visits v join public.enrollments e on e.id = v.enrollment_id
           where e.customer_id = '00000000-0000-0000-0000-000000000011')::int,
  1, 'dos claims el mismo día dejan una sola visita');
select is((select result from public.tap_claims where id = '00000000-0000-0000-0000-000000000042'),
  'already_today', 'el claim rechazado queda consumido con already_today');
select isnt((select visit_id from public.tap_claims where id = '00000000-0000-0000-0000-000000000041'),
  null::uuid, 'el claim otorgado queda ligado a su visita');
select results_eq(
  $$select * from public.grant_stamp('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000011')$$,
  $$values ('granted'::text, 1, 3, 'Café gratis'::text)$$,
  'grant_stamp: reintentar un claim consumido devuelve el mismo resultado');
select is((select count(*) from public.visits v join public.enrollments e on e.id = v.enrollment_id
           where e.customer_id = '00000000-0000-0000-0000-000000000011')::int,
  1, 'reintentar un claim consumido no crea otra visita');
select results_eq(
  $$select * from public.grant_stamp('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000011')$$,
  $$values ('expired'::text, 1, 3, 'Café gratis'::text)$$,
  'grant_stamp: claim vencido = expired');
select is((select result from public.tap_claims where id = '00000000-0000-0000-0000-000000000043'),
  'expired', 'el claim vencido queda consumido con expired');
select throws_ok(
  $$select * from public.grant_stamp('00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-000000000011')$$,
  'P0001', 'claim not found', 'grant_stamp: claim inexistente lanza error');
select throws_ok(
  $$select * from public.grant_stamp('00000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000011')$$,
  'P0001', 'no active stamp program', 'grant_stamp: sin programa activo lanza error');
select is((select consumed_at from public.tap_claims where id = '00000000-0000-0000-0000-000000000045'),
  null::timestamptz, 'sin programa activo el claim no se consume');
update public.profiles set last_activity_at = now() - interval '30 days'
  where id = '00000000-0000-0000-0000-000000000012';
select results_eq(
  $$select * from public.grant_stamp('00000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000012')$$,
  $$values ('granted'::text, 1, 3, 'Café gratis'::text)$$,
  'grant_stamp: sello por QR = granted');
select is((select v.tag_id from public.visits v join public.enrollments e on e.id = v.enrollment_id
           where e.customer_id = '00000000-0000-0000-0000-000000000012'),
  null::uuid, 'el sello por QR no tiene tag');
select ok((select last_activity_at > now() - interval '1 day' from public.profiles
           where id = '00000000-0000-0000-0000-000000000012'),
  'un sello otorgado actualiza last_activity_at');

-- 1 sello por día en la zona del negocio (America/Mexico_City = UTC-6 en noviembre) -----------
select lives_ok(
  $$insert into public.visits (id, business_id, enrollment_id, location_id, stamp_program_id, expires_at, created_at)
    values ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000021',
            '00000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000031',
            '00000000-0000-0000-0000-000000000033', '2027-01-01', '2026-11-03 23:59:00-06')$$,
  '23:59 CDMX: primer sello');
select lives_ok(
  $$insert into public.visits (id, business_id, enrollment_id, location_id, stamp_program_id, expires_at, created_at)
    values ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000021',
            '00000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000031',
            '00000000-0000-0000-0000-000000000033', '2027-01-01', '2026-11-04 00:01:00-06')$$,
  '00:01 CDMX: segundo sello, otro día');
select is((select array_agg(stamp_date order by stamp_date) from public.visits
           where enrollment_id = '00000000-0000-0000-0000-000000000035'),
  array['2026-11-03', '2026-11-04']::date[], '23:59 y 00:01 de CDMX caen en días distintos');
select throws_ok(
  $$insert into public.visits (business_id, enrollment_id, location_id, stamp_program_id, expires_at, created_at)
    values ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000035',
            '00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000033',
            '2027-01-01', '2026-11-04 12:00:00-06')$$,
  '23505', null, 'un segundo sello el mismo día es rechazado');
select throws_ok(
  $$insert into public.visits (business_id, enrollment_id, location_id, stamp_program_id, expires_at, created_at)
    values ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000035',
            '00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000033',
            '2027-01-01', '2026-11-04 05:30:00+00')$$,
  '23505', null, '05:30 UTC es 23:30 del día anterior en CDMX: el día se mide en la zona del negocio');
select lives_ok(
  $$update public.visits set status = 'voided' where id = '00000000-0000-0000-0000-000000000051'$$,
  'el gerente puede anular un sello');
select lives_ok(
  $$insert into public.visits (business_id, enrollment_id, location_id, stamp_program_id, expires_at, created_at)
    values ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000035',
            '00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000033',
            '2027-01-01', '2026-11-03 12:00:00-06')$$,
  'un sello anulado deja de contar para el tope diario');
select lives_ok(
  $$insert into public.visits (id, business_id, enrollment_id, location_id, stamp_program_id, expires_at, created_at, stamp_date)
    values ('00000000-0000-0000-0000-000000000058', '00000000-0000-0000-0000-000000000021',
            '00000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000031',
            '00000000-0000-0000-0000-000000000033', '2027-01-01', '2026-11-10 12:00:00-06', '2000-01-01')$$,
  'insertar mandando un stamp_date propio no falla');
select is((select stamp_date from public.visits where id = '00000000-0000-0000-0000-000000000058'),
  '2026-11-10'::date, 'el trigger sobrescribe el stamp_date que manda quien inserta');
select throws_ok(
  $$insert into public.visits (business_id, enrollment_id, location_id, tag_id, stamp_program_id, expires_at, created_at)
    values ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000035',
            '00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000032',
            '00000000-0000-0000-0000-000000000033', '2027-01-01', '2026-12-01 12:00:00-06')$$,
  '23514', null, 'tag_id y sdm_counter van juntos');

-- Permisos: solo service_role ejecuta las RPCs y los triggers --------------------------------
select is((select array_agg(r order by r) from unnest(array['anon', 'authenticated', 'service_role']) r
           where has_function_privilege(r, 'public.create_tap_claim(uuid, bigint)', 'execute')),
  array['service_role'], 'create_tap_claim: solo service_role');
select is((select array_agg(r order by r) from unnest(array['anon', 'authenticated', 'service_role']) r
           where has_function_privilege(r, 'public.create_qr_claim(uuid, uuid, uuid, uuid)', 'execute')),
  array['service_role'], 'create_qr_claim: solo service_role');
select is((select array_agg(r order by r) from unnest(array['anon', 'authenticated', 'service_role']) r
           where has_function_privilege(r, 'public.get_sdm_keys(text)', 'execute')),
  array['service_role'], 'get_sdm_keys: solo service_role');
select is((select array_agg(r order by r) from unnest(array['anon', 'authenticated', 'service_role']) r
           where has_function_privilege(r, 'public.grant_stamp(uuid, uuid)', 'execute')),
  array['service_role'], 'grant_stamp: solo service_role');
select is((select array_agg(r order by r) from unnest(array['anon', 'authenticated', 'service_role']) r
           where has_function_privilege(r, 'public.validate_business_timezone()', 'execute')),
  array['service_role'], 'validate_business_timezone: solo service_role');
select is((select array_agg(r order by r) from unnest(array['anon', 'authenticated', 'service_role']) r
           where has_function_privilege(r, 'public.set_visit_stamp_date()', 'execute')),
  array['service_role'], 'set_visit_stamp_date: solo service_role');

-- Casos negativos con sesión real ------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
select throws_ok(
  $$select public.create_tap_claim('00000000-0000-0000-0000-000000000032', 999)$$,
  '42501', null, 'authenticated no puede ejecutar create_tap_claim');
select throws_ok($$select count(*) from public.tap_claims$$,
  '42501', null, 'authenticated no puede leer tap_claims');
select throws_ok(
  $$insert into public.tap_claims (source, business_id, location_id, qr_jti)
    values ('qr', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000031',
            'aaaaaaaa-0000-0000-0000-0000000000f2')$$,
  '42501', null, 'authenticated no puede insertar en tap_claims');
select throws_ok(
  $$select * from public.grant_stamp('00000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000011')$$,
  '42501', null, 'authenticated no puede ejecutar grant_stamp');

reset role;
set local role anon;
select throws_ok($$select * from public.get_sdm_keys('v1')$$,
  '42501', null, 'anon no puede ejecutar get_sdm_keys');

reset role;
select * from finish();
rollback;
