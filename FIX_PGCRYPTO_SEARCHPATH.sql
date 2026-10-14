-- ════════════════════════════════════════════════════════════════════════
-- FIX_PGCRYPTO_SEARCHPATH.sql
-- "function gen_random_bytes(integer) does not exist" ka ilaaj
-- ════════════════════════════════════════════════════════════════════════
--
-- Kaise chalayein: Supabase › SQL Editor › ye poori file paste › RUN.
--   Koi PIN / setting bharni nahi hai. Dobara chalana bilkul surakshit hai.
--
-- ── Lakshan ─────────────────────────────────────────────────────────────
-- Login karte waqt (launcher.html / ERP / mobile) SAHI PIN par ye error:
--
--     function gen_random_bytes(integer) does not exist   [42883]
--
-- Galat PIN par ye error NAHI aata — isi liye ye kami itne din chhupi rahi.
--
-- ── Wajah ───────────────────────────────────────────────────────────────
-- `gen_random_bytes()` pgcrypto extension ka function hai, aur Supabase
-- me pgcrypto `extensions` schema me rehta hai — `public` me nahi.
--
-- `erp_app_login()` (aur aise hi kuch doosre function) ye likhkar banaye
-- gaye the:
--
--     set search_path = public
--
-- SECURITY DEFINER function me search_path baandhna SAHI aadat hai (warna
-- koi apna schema aage lagakar function ko dhoka de sakta hai). Galti sirf
-- itni thi ki us list me `extensions` chhoot gaya, jahan pgcrypto hai. Isi
-- liye login ke aakhri qadam par — jahan session token banta hai —
-- function "nahi mila" keh deta hai.
--
-- `verify_app_user_pin()` (jo pgcrypto ka `crypt()` use karta hai) chalta
-- rehta hai, kyunki uska search_path baandha hua nahi hai. Isi wajah se
-- "PIN to sahi hai, par login phir bhi nahi hota" jaisa ulajhan banta tha.
--
-- ── Ilaaj ───────────────────────────────────────────────────────────────
-- Function ka BODY nahi chhedte — sirf uska search_path theek karte hain
-- (`alter function ... set search_path`). Isi liye:
--   * kisi function ka logic nahi badalta (na token ka format, na PIN ka
--     tareeka) — risk na ke barabar hai;
--   * jinke source aapke paas nahi hain (jaise sales_erp_login) wo bhi
--     theek ho jaate hain;
--   * search_path baandha hua hi rehta hai, yani suraksha kam nahi hoti —
--     bas usme wo schema jud jaata hai jahan pgcrypto sach me hai.
--
-- Ye file khud dhoondhti hai ki pgcrypto kahan hai aur kaun-kaun se
-- function atke hue hain, isi liye aage kabhi extension kisi aur schema me
-- ho to bhi yahi file kaam karegi.
-- ════════════════════════════════════════════════════════════════════════

do $fix$
declare
  v_ext_schema  text;
  v_fn          record;
  v_new_path    text;
  v_fixed       int := 0;
  v_seen        int := 0;
begin
  -- ── 1. pgcrypto kahan hai? ──────────────────────────────────────────
  select n.nspname into v_ext_schema
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'gen_random_bytes'
   limit 1;

  if v_ext_schema is null then
    -- Extension hi install nahi hai. Supabase me `extensions` schema
    -- pehle se hota hai; wahi iski sahi jagah hai.
    if exists (select 1 from pg_namespace where nspname = 'extensions') then
      create extension if not exists pgcrypto with schema extensions;
      v_ext_schema := 'extensions';
    else
      create extension if not exists pgcrypto;
      select n.nspname into v_ext_schema
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.proname = 'gen_random_bytes' limit 1;
    end if;
    raise notice 'pgcrypto install kiya — schema: %', coalesce(v_ext_schema, '?');
  else
    raise notice 'pgcrypto mila — schema: %', v_ext_schema;
  end if;

  if v_ext_schema is null then
    raise exception 'pgcrypto install nahi ho saka — Dashboard › Database › Extensions me "pgcrypto" ON karein, phir ye file dobara chalayein';
  end if;

  -- ── 2. Kaun-kaun se function atke hue hain? ─────────────────────────
  -- Shart teen hain:
  --   a. function ka apna search_path set hai (proconfig me), aur
  --   b. us search_path me pgcrypto ka schema NAHI hai, aur
  --   c. function ke body me pgcrypto ka koi function use hua hai.
  -- Teeno sahi hon to hi haath lagate hain — baaki sab chhed-chhaad se
  -- bachte hain.
  for v_fn in
    select p.oid,
           n.nspname                                   as sch,
           p.proname                                   as fn,
           pg_get_function_identity_arguments(p.oid)   as args,
           (select c from unnest(p.proconfig) c
             where c like 'search\_path=%' limit 1)    as cfg
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proconfig is not null
       and exists (select 1 from unnest(p.proconfig) c where c like 'search\_path=%')
       and p.prosrc ~* '(gen_random_bytes|\mcrypt\M|\mdigest\M|\mhmac\M|gen_salt)'
     order by p.proname
  loop
    v_seen := v_seen + 1;

    -- Pehle se theek hai to chhodo.
    if v_fn.cfg ~ ('(^|[=,[:space:]])' || v_ext_schema || '([,[:space:]]|$)') then
      raise notice 'theek hai, chhoda: %.%(%)', v_fn.sch, v_fn.fn, v_fn.args;
      continue;
    end if;

    -- Purani list ke aage pgcrypto ka schema jod dete hain. Kram wahi
    -- rehta hai, isi liye naam ka koi takraav nahi banta.
    v_new_path := substring(v_fn.cfg from 'search_path=(.*)$') || ', ' || quote_ident(v_ext_schema);

    execute format('alter function %I.%I(%s) set search_path = %s',
                   v_fn.sch, v_fn.fn, v_fn.args, v_new_path);

    raise notice 'THEEK KIYA: %.%(%)  ->  search_path = %',
                 v_fn.sch, v_fn.fn, v_fn.args, v_new_path;
    v_fixed := v_fixed + 1;
  end loop;

  raise notice '════════════════════════════════════════════';
  raise notice 'Dekhe gaye: % function · Theek kiye: %', v_seen, v_fixed;
  if v_fixed = 0 and v_seen > 0 then
    raise notice 'Sab pehle se theek the — error ki wajah kuch aur ho sakti hai.';
  end if;
  raise notice '════════════════════════════════════════════';
end
$fix$;

-- ════════════════════════════════════════════════════════════════════════
-- 3. PostgREST ko bata dein (function badla hai)
-- ════════════════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════
-- 4. Check — ab token ban raha hai ya nahi
-- ════════════════════════════════════════════════════════════════════════
-- Ye koi login NAHI karta: galat user id par `erp_app_login()` PIN tak
-- pahunchne se pehle hi USER_NOT_FOUND lauta deta hai. To iska `true`
-- aana sirf itna batata hai ki function ab chal raha hai.
--
-- Asli jaanch: ab launcher.html par apne naam + sahi PIN se login karein.
select public.erp_app_login(
         '00000000-0000-0000-0000-000000000000'::uuid, 'x', array['HOME_ERP_APP']
       ) as should_say_user_not_found;

-- Aur ye batata hai ki ab har pgcrypto wala function kahan dekhta hai.
select p.proname                                 as function_name,
       pg_get_function_identity_arguments(p.oid) as args,
       (select c from unnest(p.proconfig) c
         where c like 'search\_path=%' limit 1)   as search_path
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosrc ~* '(gen_random_bytes|\mcrypt\M|\mdigest\M|\mhmac\M|gen_salt)'
 order by p.proname;
