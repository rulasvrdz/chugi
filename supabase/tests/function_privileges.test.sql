-- Permisos de ejecución de las funciones de public y RLS activo en todas las tablas.
begin;
select plan(13);

select is(has_function_privilege('anon', 'public.handle_new_user()', 'execute'), false,
  'anon no ejecuta handle_new_user');
select is(has_function_privilege('anon', 'public.is_member_of(uuid)', 'execute'), false,
  'anon no ejecuta is_member_of');
select is(has_function_privilege('anon', 'public.is_manager_of(uuid)', 'execute'), false,
  'anon no ejecuta is_manager_of');
select is(has_function_privilege('anon', 'public.request_redemption(uuid)', 'execute'), false,
  'anon no ejecuta request_redemption');
select is(has_function_privilege('anon', 'public.confirm_redemption(uuid, text)', 'execute'), false,
  'anon no ejecuta confirm_redemption');

-- grantee 0 = PUBLIC: ninguna función de public hereda EXECUTE de PUBLIC
select is(
  (select count(*)
     from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.pronamespace = 'public'::regnamespace
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE')::int,
  0, 'ninguna función de public es ejecutable por PUBLIC');

select is(has_function_privilege('authenticated', 'public.is_member_of(uuid)', 'execute'), true,
  'authenticated ejecuta is_member_of (lo necesitan las políticas)');
select is(has_function_privilege('authenticated', 'public.is_manager_of(uuid)', 'execute'), true,
  'authenticated ejecuta is_manager_of');
select is(has_function_privilege('authenticated', 'public.request_redemption(uuid)', 'execute'), true,
  'authenticated ejecuta request_redemption');
select is(has_function_privilege('authenticated', 'public.confirm_redemption(uuid, text)', 'execute'), true,
  'authenticated ejecuta confirm_redemption');
select is(has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'), false,
  'authenticated no ejecuta handle_new_user (es un trigger)');
select is(has_function_privilege('service_role', 'public.handle_new_user()', 'execute'), true,
  'service_role ejecuta handle_new_user');

select is_empty(
  $$select tablename from pg_tables where schemaname = 'public' and not rowsecurity$$,
  'todas las tablas de public tienen RLS activo');

select * from finish();
rollback;
