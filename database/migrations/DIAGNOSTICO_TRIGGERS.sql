-- DIAGNOSTICO (solo lectura, no modifica nada)
-- 1. Triggers sobre auth.users: a que funcion llaman al registrarse alguien
select tgname as trigger_name,
       pg_get_triggerdef(oid) as definicion
from pg_trigger
where tgrelid = 'auth.users'::regclass and not tgisinternal;

-- 2. Versiones de handle_new_user y provision_workshop que existen.
--    tiene_registro_017 = true significa que es la version nueva.
select p.oid::regprocedure as firma,
       (pg_get_functiondef(p.oid) like '%workshop_registration%') as tiene_registro_017,
       (pg_get_functiondef(p.oid) like '%bootstrap_workshop%') as llama_bootstrap
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('handle_new_user', 'provision_workshop');