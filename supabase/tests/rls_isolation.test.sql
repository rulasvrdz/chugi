-- Aislamiento de RLS: las 4 pruebas de docs/configuracion-base-datos.md §10
-- más casos negativos. Datos sintéticos; todo se revierte con rollback.
begin;
select plan(28);

-- Datos -------------------------------------------------------------------------------
-- ids fijos: usuarios 1x, negocios 2x, resto 3x
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000011', 'cliente_a@test.invalid'),
  ('00000000-0000-0000-0000-000000000012', 'cliente_b@test.invalid'),
  ('00000000-0000-0000-0000-000000000013', 'staff_x@test.invalid'),
  ('00000000-0000-0000-0000-000000000014', 'manager_x@test.invalid'),
  ('00000000-0000-0000-0000-000000000015', 'staff_y@test.invalid');

insert into public.businesses (id, name) values
  ('00000000-0000-0000-0000-000000000021', 'Negocio X'),
  ('00000000-0000-0000-0000-000000000022', 'Negocio Y');

insert into public.business_members (business_id, user_id, role) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000013', 'staff'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000014', 'manager'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000015', 'staff');

insert into public.locations (id, business_id, name, lat, lng) values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000021', 'Sucursal X', 19.43, -99.13);

insert into public.nfc_tags (id, uid, business_id, location_id, key_ref) values
  ('00000000-0000-0000-0000-000000000032', '04AABBCCDDEE80', '00000000-0000-0000-0000-000000000021',
   '00000000-0000-0000-0000-000000000031', 'test-key');

insert into public.stamp_programs (id, business_id, stamps_required, stamp_ttl_days, reward_description) values
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000021', 5, 90, 'Café gratis');

insert into public.enrollments (id, business_id, customer_id) values
  ('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000021',
   '00000000-0000-0000-0000-000000000011');

insert into public.visits (business_id, enrollment_id, location_id, tag_id, stamp_program_id,
                           sdm_counter, status, captured_at, expires_at) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000034',
   '00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000032',
   '00000000-0000-0000-0000-000000000033', 1, 'confirmed', now(), now() + interval '90 days');

insert into public.audit_log (action, target_table) values ('test', 'visits');

-- 1. Cliente ajeno al negocio X (cliente_b) ------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', true);

select is((select count(*) from public.visits)::int, 0, '1. cliente ajeno: 0 visits');
select is((select count(*) from public.enrollments)::int, 0, '1. cliente ajeno: 0 enrollments');
select is((select count(*) from public.nfc_tags)::int, 0, '1. cliente ajeno: 0 nfc_tags');
select is((select count(*) from public.businesses)::int, 0, '1. cliente ajeno: 0 businesses');

-- 2. Cliente dueño de la visita (cliente_a) ------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);

select is((select count(*) from public.visits)::int, 1, '2. cliente dueño: ve su visit');
select is((select count(*) from public.enrollments)::int, 1, '2. cliente dueño: ve su enrollment');
select is((select count(*) from public.nfc_tags)::int, 0, '2. cliente dueño: 0 nfc_tags');

-- 4. INSERT directo en visits por el cliente (visits solo la escribe service_role) --
select throws_ok(
  $$insert into public.visits (business_id, enrollment_id, location_id, tag_id, stamp_program_id,
                               sdm_counter, status, captured_at, expires_at)
    values ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000034',
            '00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000032',
            '00000000-0000-0000-0000-000000000033', 99, 'confirmed', now(), now() + interval '90 days')$$,
  '42501', null, '4. cliente: INSERT directo en visits rechazado por RLS');

-- 3. Staff del negocio X (staff_x) ----------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000013', true);

select is((select count(*) from public.visits)::int, 1, '3. staff del negocio: ve visits del negocio');
select is((select count(*) from public.enrollments)::int, 1, '3. staff del negocio: ve enrollments del negocio');
select is((select count(*) from public.nfc_tags)::int, 0, '3. staff del negocio: 0 nfc_tags');
select is((select count(*) from public.audit_log)::int, 0, 'staff: 0 audit_log');

-- Negativos: staff con rol staff no administra el negocio ----------------------------
select is_empty(
  $$update public.stamp_programs set stamps_required = 1 returning id$$,
  'staff no puede editar stamp_programs');
select throws_ok(
  $$insert into public.business_members (business_id, user_id, role)
    values ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000012', 'owner')$$,
  '42501', null, 'staff no puede agregar miembros');

-- Manager del negocio X: sí puede editar el programa ---------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000014', true);
select isnt_empty(
  $$update public.stamp_programs set reward_description = 'Postre gratis' returning id$$,
  'manager sí puede editar stamp_programs');

-- Staff de otro negocio (staff_y): no ve datos del negocio X --------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000015', true);

select is((select count(*) from public.visits)::int, 0, 'staff de otro negocio: 0 visits');
select is((select count(*) from public.enrollments)::int, 0, 'staff de otro negocio: 0 enrollments');
select is((select count(*) from public.businesses)::int, 1, 'staff de otro negocio: solo ve su negocio');

-- anon (sin sesión) ------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

-- Las políticas de estas tablas llaman is_member_of(), que anon no puede ejecutar:
-- el acceso se niega con un error de permiso (42501) en lugar de devolver 0 filas.
select throws_ok($$select count(*) from public.visits$$, '42501', null, 'anon: visits negado');
select throws_ok($$select count(*) from public.enrollments$$, '42501', null, 'anon: enrollments negado');
select throws_ok($$select count(*) from public.businesses$$, '42501', null, 'anon: businesses negado');
select throws_ok($$select count(*) from public.redemptions$$, '42501', null, 'anon: redemptions negado');
select throws_ok($$select count(*) from public.business_members$$, '42501', null, 'anon: business_members negado');
select throws_ok($$select count(*) from public.locations$$, '42501', null, 'anon: locations negado');
-- Sin política que llame is_member_of: 0 filas
select is((select count(*) from public.nfc_tags)::int, 0, 'anon: 0 nfc_tags (sin políticas)');
select is((select count(*) from public.audit_log)::int, 0, 'anon: 0 audit_log (sin políticas)');
select is((select count(*) from public.profiles)::int, 0, 'anon: 0 profiles');
select throws_ok($$select count(*) from public.stamp_programs$$, '42501', null, 'anon: stamp_programs negado');

reset role;
select * from finish();
rollback;
