-- CHUG-14: llave maestra de aplicación (key 0) de los tags NTAG 424 DNA, en Vault.
-- Ref: docs/PLAN.md §4.2.
--
-- K_meta y K_file_master (get_sdm_keys) las lee /t en cada tap. La key 0 permite
-- reconfigurar el tag, así que vive en un secreto aparte (sdm_app_master_<ref>) que solo
-- lee el script de programación: si se filtra lo que usa /t, nadie puede reprogramar tags.
--
-- SECURITY DEFINER, search_path fijo y EXECUTE solo para service_role
-- (docs/configuracion-base-datos.md §11).

create function public.get_sdm_app_key(p_key_ref text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_key text;
begin
  select s.decrypted_secret into v_key
    from vault.decrypted_secrets s where s.name = 'sdm_app_master_' || p_key_ref;

  if v_key is null then
    raise exception 'sdm app key not found';
  end if;

  return v_key;
end;
$function$;

revoke execute on function public.get_sdm_app_key(text) from public, anon, authenticated;
grant execute on function public.get_sdm_app_key(text) to service_role;
