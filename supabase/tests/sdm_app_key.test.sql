-- get_sdm_app_key (CHUG-14): la key 0 de los tags vive en Vault y solo la lee service_role.
begin;
select plan(7);

select throws_ok($$select public.get_sdm_app_key('t1')$$,
  'P0001', 'sdm app key not found', 'sin secreto en Vault lanza error');

select vault.create_secret('app-t1', 'sdm_app_master_t1');
select vault.create_secret('meta-t2', 'sdm_meta_t2');

select is(public.get_sdm_app_key('t1'), 'app-t1', 'devuelve la llave de la versión pedida');
select throws_ok($$select public.get_sdm_app_key('t2')$$,
  'P0001', 'sdm app key not found',
  'las llaves de metadatos no sirven como llave de aplicación');

select is((select array_agg(r order by r) from unnest(array['anon', 'authenticated', 'service_role']) r
           where has_function_privilege(r, 'public.get_sdm_app_key(text)', 'execute')),
  array['service_role'], 'solo service_role puede ejecutarla');

-- grantee 0 = PUBLIC
select is(
  (select count(*)
     from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.get_sdm_app_key(text)'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE')::int,
  0, 'PUBLIC no hereda EXECUTE');

set local role authenticated;
select throws_ok($$select public.get_sdm_app_key('t1')$$,
  '42501', null, 'authenticated no puede ejecutarla');

reset role;
set local role anon;
select throws_ok($$select public.get_sdm_app_key('t1')$$,
  '42501', null, 'anon no puede ejecutarla');

reset role;
select * from finish();
rollback;
