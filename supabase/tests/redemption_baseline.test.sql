-- Comportamiento ACTUAL (baseline) de las RPC de canje, con dos defectos conocidos
-- (ver docs/configuracion-base-datos.md §14):
--   1. request_redemption: RETURNS TABLE(..., expires_at) choca con la columna expires_at de
--      las consultas internas y falla con 42702 (referencia ambigua) tras autorizar.
--   2. request_redemption y confirm_redemption llaman gen_random_bytes, crypt y gen_salt sin
--      calificar, pero pgcrypto vive en el esquema extensions y las funciones fijan
--      search_path = public: fallan con 42883 (function does not exist).
-- Al corregirlas (CHUG-13/CHUG-19), las pruebas marcadas como "defecto conocido" deben
-- convertirse en pruebas del camino feliz.
begin;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000011', 'cliente_a@test.invalid'),
  ('00000000-0000-0000-0000-000000000012', 'cliente_b@test.invalid'),
  ('00000000-0000-0000-0000-000000000013', 'staff_x@test.invalid');

insert into public.businesses (id, name) values ('00000000-0000-0000-0000-000000000021', 'Negocio X');
insert into public.business_members (business_id, user_id, role) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000013', 'staff');
insert into public.locations (id, business_id, name, lat, lng) values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000021', 'Sucursal X', 19.43, -99.13);
insert into public.nfc_tags (id, uid, business_id, location_id, key_ref) values
  ('00000000-0000-0000-0000-000000000032', '04AABBCCDDEE80', '00000000-0000-0000-0000-000000000021',
   '00000000-0000-0000-0000-000000000031', 'test-key');
insert into public.stamp_programs (id, business_id, stamps_required, stamp_ttl_days, reward_description) values
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000021', 2, 90, 'Café gratis');
insert into public.enrollments (id, business_id, customer_id) values
  ('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000021',
   '00000000-0000-0000-0000-000000000011');

-- Una visita confirmada: no alcanza para el premio (se requieren 2)
insert into public.visits (business_id, enrollment_id, location_id, tag_id, stamp_program_id,
                           sdm_counter, status, captured_at, expires_at) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000034',
   '00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000032',
   '00000000-0000-0000-0000-000000000033', 1, 'confirmed', now(), now() + interval '90 days');

set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', true);
select throws_ok(
  $$select * from public.request_redemption('00000000-0000-0000-0000-000000000034')$$,
  'P0001', 'not authorized', 'request_redemption: otro cliente no puede pedir el canje');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
select throws_ok(
  $$select * from public.request_redemption('00000000-0000-0000-0000-000000000034')$$,
  '42702', null, 'defecto conocido: request_redemption falla con referencia ambigua a expires_at');

reset role;
-- Segunda visita: con sellos suficientes el resultado es el mismo defecto (42702).
insert into public.visits (business_id, enrollment_id, location_id, tag_id, stamp_program_id,
                           sdm_counter, status, captured_at, expires_at) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000034',
   '00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000032',
   '00000000-0000-0000-0000-000000000033', 2, 'confirmed', now(), now() + interval '90 days');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
select throws_ok(
  $$select * from public.request_redemption('00000000-0000-0000-0000-000000000034')$$,
  '42702', null, 'defecto conocido: con sellos suficientes también falla (42702, antes de llegar a pgcrypto)');

-- confirm_redemption: canje pendiente con hash generado con las funciones calificadas
reset role;
insert into public.redemptions (id, business_id, enrollment_id, stamp_program_id, code_hash, expires_at) values
  ('00000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000021',
   '00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000033',
   extensions.crypt('ABC123', extensions.gen_salt('bf')), now() + interval '5 minutes');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', true);
select throws_ok(
  $$select public.confirm_redemption('00000000-0000-0000-0000-000000000035', 'ABC123')$$,
  'P0001', 'not authorized', 'confirm_redemption: quien no es del negocio no puede confirmar');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000013', true);
select throws_ok(
  $$select public.confirm_redemption('00000000-0000-0000-0000-000000000035', 'ABC123')$$,
  '42883', null, 'defecto conocido: confirm_redemption falla en crypt() por el mismo search_path');

reset role;
select * from finish();
rollback;
