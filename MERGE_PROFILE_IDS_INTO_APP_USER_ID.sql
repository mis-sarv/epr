-- ════════════════════════════════════════════════════════════════════════
-- MERGE_PROFILE_IDS_INTO_APP_USER_ID.sql
-- `cmp_profile_id` + `pk_profile_id` → ek hi id: `app_users.id`
-- ════════════════════════════════════════════════════════════════════════
--
-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  ✅ YE FILE CHAL CHUKI HAI — dobara chalane ki zaroorat nahi        ║
-- ║                                                                      ║
-- ║  Live DB par verify kiya gaya:                                       ║
-- ║     cmp_profile_id / pk_profile_id  → hat gaye                      ║
-- ║     app_users.id                    → wahi auth.users.id            ║
-- ║     56/56 Complaint users ki id auth me maujood                     ║
-- ║     14 cmp_* FK                     → app_users(id) par             ║
-- ║     PIN orphan 0 · session orphan 0 (kisi ka PIN/login nahi toota)  ║
-- ║                                                                      ║
-- ║  Dobara chalane par section 2 ka check khud rok dega (mapping me    ║
-- ║  columns hi nahi milenge).                                           ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- Kaise chalayein: Supabase › SQL Editor › poori file paste › RUN.
--   Koi PIN bharni nahi hai. Ek hi transaction me chalti hai — beech me
--   kuch galat hua to kuch bhi apply nahi hota.
--
-- ZAROORI: ye file MERGE_CMP_PROFILES_INTO_APP_USERS.sql ke BAAD ki
--   haalat maan kar likhi gayi hai, yani:
--     * `public.cmp_profiles` ab TABLE nahi, VIEW hai (app_users se)
--     * Complaint ke 13 FK `auth.users(id)` par hain
--     * app_users par cmp_username / cmp_role / cmp_host_types /
--       cmp_last_online_at maujood hain
--   (Pehli koshish isi wajah se ruki thi: view `cmp_profile_id` par tiki
--    hai, isi liye column drop nahi hota tha. Ab view pehle hataai jaati
--    hai aur aakhir me nayi id par dobara banti hai.)
--
-- ── Do baatein jo jaanch se nikli ──────────────────────────────────────
--
--   1. `app_users.id` par KOI foreign key nahi hai. Isi liye use badalna
--      mumkin hai — bas uske "soft reference" theek karne hain.
--
--   2. PIN ka hash `sha256(pin)` hai — usme user ka id NAHI hai. Id sirf
--      `role_pins.role` ki KEY me hai (`USER::<id>`). Isi liye key badal
--      dene se PIN WAISE HI chalte rehte hain:
--      **kisi ko naya PIN baantna nahi padega**, aur live session bhi
--      bache rehte hain (unka token wahi rehta hai).
--
-- ── Nayi id kaise chuni jaati hai ──────────────────────────────────────
--
--      new_id = coalesce(cmp_profile_id, pk_profile_id, id)
--
--   | kitne | haal                        | nayi id                  |
--   |-------|-----------------------------|--------------------------|
--   | 56    | Complaint ka auth account   | wahi auth uid            |
--   |  3    | sirf Packing ka account     | wahi auth uid            |
--   |  8    | koi auth account nahi       | id waisi hi rehti hai    |
--
--   Takraav mumkin nahi: dono set alag hain (0 row me dono id barabar
--   thin) aur dono apne-aap me unique hain. Section 2 ise CHECK karta hai
--   aur takraav mile to ruk jaata hai.
--
-- ── MANJEET aur RAHUL ─────────────────────────────────────────────────
--   In dono ke DO auth account hain:
--     MANJEET : manjeet@sarvindia.com (Complaint) · mis@sarvindia.com (Packing)
--     RAHUL   : rahul@sarvindia.com   (Complaint) · sarvsale03@gmail.com (Packing)
--   Aapke faisle ke mutabiq **Complaint wala account** bachta hai. Inke
--   `packing.profiles.id` ko nayi id par le aate hain, taaki Packing bhi
--   usi ek pehchaan se chale.
--   Nateeja: ye dono Packing me apne PURANE email+password se login nahi
--   kar payenge — par launcher ke single login se Packing khulta rahega.
--
-- ── API ka shape NAHI badla ───────────────────────────────────────────
--   `erp_app_login` / `erp_app_session` / `erp_sso_profile` ab bhi
--   `cmp_profile_id` aur `pk_profile_id` lautate hain — bas dono ki value
--   ab `app_users.id` hoti hai (aur null jab us app me account na ho).
--   Isi liye launcher.html, complaint.html, packing.html aur erp-sso Edge
--   Function me ek line badalne ki zaroorat NAHI padi.
-- ════════════════════════════════════════════════════════════════════════

set search_path = public, extensions, pg_catalog;

-- ════════════════════════════════════════════════════════════════════════
-- 1. Archive — kuch bhi chhedne se pehle
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public._archive_app_users_preid    as select * from public.app_users;
create table if not exists public._archive_role_pins_preid    as select * from public.role_pins;
create table if not exists public._archive_app_sessions_preid as select * from public.app_sessions;
create table if not exists public._archive_sales_users_preid  as select * from public.sales_users;
create table if not exists public._archive_pk_profiles_preid  as select * from packing.profiles;

-- ════════════════════════════════════════════════════════════════════════
-- 2. Mapping banao aur JAANCH karo
-- ════════════════════════════════════════════════════════════════════════
drop table if exists public._merge_id_map;
create table public._merge_id_map as
  select id as old_id,
         coalesce(cmp_profile_id, pk_profile_id, id) as new_id,
         (cmp_profile_id is not null) as had_cmp,
         (pk_profile_id  is not null) as had_pk,
         (cmp_profile_id is not null and pk_profile_id is not null) as was_dual,
         pk_profile_id as old_pk_id,
         user_name
    from public.app_users;

do $chk$
declare v_dup int; v_miss int; v_cmpu int; v_cmpl int;
begin
  select count(*) into v_dup from (
    select new_id from public._merge_id_map group by 1 having count(*) > 1) z;
  if v_dup > 0 then
    raise exception 'RUK GAYE: % nayi id do baar aa rahi hai — merge safe nahi', v_dup;
  end if;

  select count(*) into v_miss
    from public._merge_id_map m
   where (m.had_cmp or m.had_pk)
     and not exists (select 1 from auth.users a where a.id = m.new_id);
  if v_miss > 0 then
    raise exception 'RUK GAYE: % nayi id auth.users me nahi mili', v_miss;
  end if;

  /* Nayi view ka filter `cmp_username is not null` hoga (kyunki
     cmp_profile_id column hi nahi bachega). Isi liye pehle pakka karte
     hain ki jiske paas cmp link hai uska cmp_username bhara hua hai —
     warna wo banda Complaint App se gayab ho jaata. */
  select count(*) into v_cmpl from public.app_users where cmp_profile_id is not null;
  select count(*) into v_cmpu from public.app_users
   where cmp_profile_id is not null and coalesce(btrim(cmp_username),'') = '';
  if v_cmpu > 0 then
    raise exception 'RUK GAYE: % complaint users ka cmp_username khaali hai — view unhe chhod degi. Pehle wo bharein.', v_cmpu;
  end if;

  /* Section 8 ke unique index pehle hi jaanch lete hain — warna wahan
     raw "duplicate key" error aata hai jisse wajah saaf nahi hoti. */
  select count(*) into v_dup from (
    select contact_no from public.app_users
     where cmp_profile_id is not null and coalesce(btrim(contact_no),'') <> ''
     group by 1 having count(*) > 1) z;
  if v_dup > 0 then
    raise exception 'RUK GAYE: % mobile no. do complaint users par hai — pehle unhe theek karein (cmp_profiles me mobile unique tha)', v_dup;
  end if;

  select count(*) into v_dup from (
    select cmp_username from public.app_users
     where cmp_username is not null group by 1 having count(*) > 1) z;
  if v_dup > 0 then
    raise exception 'RUK GAYE: % cmp_username do baar hai', v_dup;
  end if;

  raise notice 'Mapping theek — % rows (complaint users: %)',
    (select count(*) from public._merge_id_map), v_cmpl;
  raise notice 'Badlenge: %  ·  waise hi rahenge: %',
    (select count(*) from public._merge_id_map where old_id <> new_id),
    (select count(*) from public._merge_id_map where old_id  = new_id);
end
$chk$;

-- ════════════════════════════════════════════════════════════════════════
-- 3. `cmp_profiles` VIEW hatao — wo cmp_profile_id par tiki hai
-- ════════════════════════════════════════════════════════════════════════
-- Section 9 me nayi id par dobara ban jaayegi. View me data nahi hota,
-- isi liye isse kuch khoata nahi.
drop view if exists public.cmp_profiles;

-- ════════════════════════════════════════════════════════════════════════
-- 4. Dual-account walon ka packing profile nayi id par
-- ════════════════════════════════════════════════════════════════════════
-- `packing.profiles.id` auth.users(id) par FK hai, aur nayi id (Complaint
-- ka auth uid) auth.users me maujood hai — isi liye ye update valid hai.
update packing.profiles p
   set id = m.new_id
  from public._merge_id_map m
 where m.was_dual and p.id = m.old_pk_id and m.old_pk_id <> m.new_id;

-- ════════════════════════════════════════════════════════════════════════
-- 5. Soft references — PIN ki KEY, sessions, resets, Order Form mirror
-- ════════════════════════════════════════════════════════════════════════
-- PIN: sirf key badalti hai, `pin_hash` ko haath nahi lagta → PIN chalta
-- rehta hai. Recipe `USER::%s` hai (app_settings.pin_write_recipe).
update public.role_pins rp
   set role = 'USER::' || m.new_id::text
  from public._merge_id_map m
 where rp.role = 'USER::' || m.old_id::text
   and m.old_id <> m.new_id;

update public.app_sessions s
   set user_id = m.new_id
  from public._merge_id_map m
 where s.user_id = m.old_id and m.old_id <> m.new_id;

update public.app_pin_resets r
   set user_id = m.new_id
  from public._merge_id_map m
 where r.user_id = m.old_id and m.old_id <> m.new_id;

-- sales_users.app_user_id text hai. 'ROLE:ADMIN_PIN' / 'ROLE:USER_MD_PIN'
-- jaise shared-role rows ko chhedte NAHI — wo kisi app_users row ke nahi.
update public.sales_users su
   set app_user_id = m.new_id::text
  from public._merge_id_map m
 where su.app_user_id = m.old_id::text and m.old_id <> m.new_id;

-- ════════════════════════════════════════════════════════════════════════
-- 6. Asli kaam — app_users.id
-- ════════════════════════════════════════════════════════════════════════
update public.app_users u
   set id = m.new_id
  from public._merge_id_map m
 where u.id = m.old_id and m.old_id <> m.new_id;

-- ════════════════════════════════════════════════════════════════════════
-- 7. Do column khatam — ek id hi bachi
-- ════════════════════════════════════════════════════════════════════════
-- Dhyan: `app_users_cmp_mobile_key` aur `app_users_cmp_profile_id_key`
-- in columns par tike the, isi liye wo apne aap gir jaate hain. Mobile
-- wala index section 8 me naye predicate ke saath dobara banta hai.
alter table public.app_users drop column if exists cmp_profile_id;
alter table public.app_users drop column if exists pk_profile_id;

comment on column public.app_users.id is
  'EK hi pehchaan: ERP ka user id AUR (jahan account hai) uska auth.users.id. Pehle cmp_profile_id / pk_profile_id alag the — dekhein MERGE_PROFILE_IDS_INTO_APP_USER_ID.sql';

-- ════════════════════════════════════════════════════════════════════════
-- 8. Unique index dobara — ab `cmp_username` ke sahare
-- ════════════════════════════════════════════════════════════════════════
-- Naam me 'mobile' / 'username' jaan-boojh kar hai: Complaint ka signup
-- flow sqlerrm me yahi dhoondh kar MOBILE_TAKEN / NAME_TAKEN batata hai.
create unique index if not exists app_users_cmp_username_key
  on public.app_users (cmp_username) where cmp_username is not null;

drop index if exists public.app_users_cmp_mobile_key;
create unique index app_users_cmp_mobile_key
  on public.app_users (contact_no) where cmp_username is not null;

-- ════════════════════════════════════════════════════════════════════════
-- 9. `cmp_profiles` VIEW dobara — ab seedha `id` par
-- ════════════════════════════════════════════════════════════════════════
-- Column ke naam, kram aur matlab bilkul wahi, isi liye wo 12 cmp_*
-- function aur complaint.html bina badle chalte rehte hain. Farq sirf
-- itna: `id` ab app_users.id hai (= auth uid), aur "ye banda Complaint
-- ka user hai" ka nishaan `cmp_username` hai.
create view public.cmp_profiles as
  select id                 as id,
         user_name          as name,
         contact_no         as mobile,
         department         as department,
         designation        as designation,
         dob                as dob,
         cmp_username       as username,
         cmp_role           as role,
         cmp_host_types     as host_types,
         is_active          as is_active,
         created_at         as created_at,
         updated_at         as updated_at,
         cmp_last_online_at as last_online_at
    from public.app_users
   where cmp_username is not null;

comment on view public.cmp_profiles is
  'VIEW, table nahi — asli data public.app_users me hai, aur id = app_users.id = auth.users.id. Dekhein MERGE_PROFILE_IDS_INTO_APP_USER_ID.sql';

grant select on public.cmp_profiles to anon, authenticated;
grant update (last_online_at) on public.cmp_profiles to anon, authenticated;
grant select, insert, update, delete on public.cmp_profiles to service_role;

-- ════════════════════════════════════════════════════════════════════════
-- 10. Complaint ke FK ab app_users(id) par
-- ════════════════════════════════════════════════════════════════════════
-- Pichhli migration ne 13 FK ko `auth.users(id)` par kiya tha; isme
-- `cmp_push_subscriptions_user_id_fkey` bhi jud jaata hai (wo shuru se
-- auth.users par tha) — kul **14**. Ab app_users.id bhi wahi uid hai, to
-- inhe app_users par le aate hain, aur isse ek asli faayda milta hai:
-- jis bande ki Complaint me tasks/complaints hain, uski app_users row
-- galti se delete nahi ho sakti (pehle wo ho gayi thi, aur us bande ka
-- naam Complaint App me gayab ho gaya tha).
-- DATA badalna nahi padta — un columns me pehle se wahi uid hai, aur
-- jaanch me 0 orphan mile.
do $fk$
declare r record; v_act text; n int := 0;
begin
  for r in
    select con.conname, src.relname as tbl, con.confdeltype,
           (select string_agg(quote_ident(a.attname), ',' order by k.ord)
              from unnest(con.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as cols
      from pg_constraint con
      join pg_class src on src.oid = con.conrelid
      join pg_namespace sn on sn.oid = src.relnamespace
      join pg_class tgt on tgt.oid = con.confrelid
      join pg_namespace tn on tn.oid = tgt.relnamespace
     where con.contype = 'f'
       and sn.nspname = 'public' and src.relname like 'cmp\_%'
       and tn.nspname = 'auth'   and tgt.relname = 'users'
  loop
    v_act := case r.confdeltype when 'c' then ' on delete cascade'
               when 'n' then ' on delete set null' when 'd' then ' on delete set default'
               when 'r' then ' on delete restrict' else '' end;
    execute format('alter table public.%I drop constraint %I', r.tbl, r.conname);
    execute format('alter table public.%I add constraint %I foreign key (%s) references public.app_users(id)%s',
                   r.tbl, r.conname, r.cols, v_act);
    n := n + 1;
  end loop;
  raise notice '% cmp_* FK ab app_users(id) par', n;
end
$fk$;

-- ════════════════════════════════════════════════════════════════════════
-- 11. Naya auth user banne par row app_users me, USI id se
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.cmp_handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $fn$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text; v_host_types text[];
begin
  if not (m ? 'name') then return new; end if;

  -- Self-signup is always a plain User; only an admin-created account may
  -- carry a role or host types, and those come from the admin-users
  -- function, never from anything the browser can set for itself.
  if (m->>'self_signup') = 'true' then
    v_role := 'User'; v_host_types := '{}';
  else
    v_role := coalesce(m->>'role', 'User');
    v_host_types := coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(coalesce(m->'host_types','[]'::jsonb))), '{}');
  end if;

  begin
    /* Ek hi row, usi id se — koi alag "profile" table nahi bachi, aur
       koi link column bharna nahi padta. */
    insert into public.app_users
      (id, user_name, contact_no, department, designation, dob,
       cmp_username, cmp_role, cmp_host_types,
       role, roles, app_access, is_active)
    values (new.id, upper(btrim(m->>'name')),
      regexp_replace(coalesce(m->>'mobile',''), '\D', '', 'g'),
      coalesce(m->>'department','—'), coalesce(m->>'designation','—'),
      coalesce((m->>'dob')::date,'1900-01-01'::date),
      public.cmp_make_username(m->>'name'), v_role, v_host_types,
      'CMP_USER', array['CMP_USER'],
      jsonb_build_object('HOME_COMPLAINT_APP', true,
        'HOME_ERP_APP', false, 'HOME_APPROVAL_APP', false,
        'HOME_PACKING', false, 'HOME_ORDER_FORM', false),
      true)
    /* ON CONFLICT ke andar target table ko SIRF uske naam se likha ja
       sakta hai — `public.app_users.x` syntax error deta hai. */
    on conflict (id) do update
       set cmp_username   = coalesce(app_users.cmp_username,   excluded.cmp_username),
           cmp_role       = coalesce(app_users.cmp_role,       excluded.cmp_role),
           cmp_host_types = coalesce(app_users.cmp_host_types, excluded.cmp_host_types);
  exception
    -- These two messages are matched by name in the client and in the
    -- admin-users function, because GoTrue buries a trigger exception
    -- inside a generic 500 and the real reason never reaches the browser.
    when unique_violation then
      if sqlerrm ilike '%mobile%' then
        raise exception 'MOBILE_TAKEN: Yeh mobile number pehle se registered hai.' using errcode = '23505';
      elsif sqlerrm ilike '%username%' then
        raise exception 'NAME_TAKEN: Yeh naam pehle se registered hai. Thoda alag naam likhein (e.g. middle name bhi).' using errcode = '23505';
      else raise; end if;
  end;

  return new;
end;
$fn$;

-- ════════════════════════════════════════════════════════════════════════
-- 12. RPC ka jawab waisa hi — apps badalne na padein
-- ════════════════════════════════════════════════════════════════════════
-- `cmp_profile_id` / `pk_profile_id` ab COLUMN nahi hain, par JSON me
-- wahi naam bache hain: value = app_users.id jab us app me account ho,
-- warna null.
create or replace function public.erp_app_session(p_token text, p_app text default null)
returns jsonb language plpgsql security definer set search_path = public
as $fn$
declare s public.app_sessions; u public.app_users;
begin
  if coalesce(p_token,'') = '' then
    return jsonb_build_object('success', false, 'error', 'NO_TOKEN');
  end if;
  select * into s from public.app_sessions where token = p_token;
  if not found then return jsonb_build_object('success', false, 'error', 'NO_SESSION'); end if;
  if s.revoked then return jsonb_build_object('success', false, 'error', 'SESSION_REVOKED'); end if;
  if s.expires_at <= now() then return jsonb_build_object('success', false, 'error', 'SESSION_EXPIRED'); end if;

  select * into u from public.app_users where id = s.user_id;
  if not found or not coalesce(u.is_active, true) then
    update public.app_sessions set revoked = true where token = p_token;
    return jsonb_build_object('success', false, 'error', 'USER_INACTIVE');
  end if;

  if p_app is not null and not (p_app = any(s.allowed_apps)) then
    return jsonb_build_object('success', false, 'error', 'NO_APP_ACCESS',
      'user', jsonb_build_object('name', u.user_name));
  end if;

  update public.app_sessions set last_seen_at = now() where token = p_token;

  return jsonb_build_object('success', true,
    'user', jsonb_build_object(
      'id', u.id, 'name', u.user_name, 'primary_role', u.role,
      'roles', to_jsonb(coalesce(u.roles, array[u.role])),
      'emp_code', u.emp_code, 'contact_no', u.contact_no,
      'app_access', coalesce(u.app_access, '{}'::jsonb),
      -- Ek hi id, par app-wise null jab us app me account na ho.
      'cmp_profile_id', case when u.cmp_username is not null then u.id end,
      'pk_profile_id',  (select u.id from packing.profiles p where p.id = u.id),
      'allowed_apps', to_jsonb(s.allowed_apps)));
end
$fn$;

create or replace function public.erp_sso_profile(p_token text, p_app text)
returns jsonb language plpgsql security definer set search_path = public
as $fn$
declare s public.app_sessions; u public.app_users;
begin
  if coalesce(p_token,'') = '' then
    return jsonb_build_object('success', false, 'error', 'NO_TOKEN');
  end if;
  select * into s from public.app_sessions where token = p_token;
  if not found then return jsonb_build_object('success', false, 'error', 'NO_SESSION'); end if;
  if s.revoked then return jsonb_build_object('success', false, 'error', 'SESSION_REVOKED'); end if;
  if s.expires_at <= now() then return jsonb_build_object('success', false, 'error', 'SESSION_EXPIRED'); end if;

  select * into u from public.app_users where id = s.user_id;
  if not found or not coalesce(u.is_active, true) then
    update public.app_sessions set revoked = true where token = p_token;
    return jsonb_build_object('success', false, 'error', 'USER_INACTIVE');
  end if;
  if coalesce(p_app,'') <> '' and not (p_app = any (coalesce(s.allowed_apps, '{}'))) then
    return jsonb_build_object('success', false, 'error', 'NO_APP_ACCESS', 'name', u.user_name);
  end if;

  update public.app_sessions set last_seen_at = now() where token = p_token;

  return jsonb_build_object('success', true,
    'user_id', u.id, 'name', u.user_name, 'primary_role', u.role,
    'cmp_profile_id', case when u.cmp_username is not null then u.id end,
    'pk_profile_id',  (select u.id from packing.profiles p where p.id = u.id));
end
$fn$;

revoke all on function public.erp_sso_profile(text, text) from public, anon, authenticated;
grant execute on function public.erp_sso_profile(text, text) to service_role;

create or replace function public.erp_app_login(
  p_user_id uuid, p_pin text, p_allowed_apps text[] default '{}')
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $fn$
declare u public.app_users; v_ok boolean := false; v_token text;
begin
  select * into u from public.app_users where id = p_user_id;
  if not found then return jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND'); end if;
  if not coalesce(u.is_active, true) then
    return jsonb_build_object('success', false, 'error', 'USER_INACTIVE');
  end if;

  begin
    execute 'select public.verify_app_user_pin($1::uuid, $2)' into v_ok using p_user_id::text, p_pin;
  exception when others then
    begin
      execute 'select public.verify_app_user_pin($1::text, $2)' into v_ok using p_user_id::text, p_pin;
    exception when others then
      return jsonb_build_object('success', false, 'error', 'PIN_CHECK_UNAVAILABLE');
    end;
  end;
  if not coalesce(v_ok, false) then
    return jsonb_build_object('success', false, 'error', 'PIN_INVALID');
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  update public.app_sessions set revoked = true where user_id = p_user_id and not revoked;
  insert into public.app_sessions (token, user_id, allowed_apps, roles, primary_role)
  values (v_token, p_user_id, coalesce(p_allowed_apps,'{}'),
          coalesce(u.roles, array[u.role]), u.role);

  return jsonb_build_object('success', true, 'token', v_token,
    'user', jsonb_build_object(
      'id', u.id, 'name', u.user_name, 'primary_role', u.role,
      'roles', to_jsonb(coalesce(u.roles, array[u.role])),
      'emp_code', u.emp_code, 'contact_no', u.contact_no,
      'app_access', coalesce(u.app_access, '{}'::jsonb),
      'cmp_profile_id', case when u.cmp_username is not null then u.id end,
      'pk_profile_id',  (select u.id from packing.profiles p where p.id = u.id),
      'allowed_apps', to_jsonb(coalesce(p_allowed_apps,'{}'))));
end
$fn$;

-- ════════════════════════════════════════════════════════════════════════
-- 13. Admin access de → user ko DIRECT login mile
-- ════════════════════════════════════════════════════════════════════════
-- Ab id ek hi hai, isi liye "access dena" bahut saada ho gaya:
--   Complaint → app_users par `cmp_username` + `cmp_role` bhar do (isi se
--               wo banda `cmp_profiles` view me aa jaata hai)
--   Packing   → packing.profiles me usi id se row
-- Koi alag user record nahi banta, koi link column nahi bharna padta.
--
-- Jis user ka auth.users me account HI nahi hai, uske liye account Edge
-- Function banata hai (service_role SQL se nahi milta). Ye RPC aise user
-- par `AUTH_USER_MISSING` lautata hai — Edge Function usi jawab par
-- account banata hai, `erp_relink_user_id()` se id jodta hai, aur dobara
-- is RPC ko bulata hai.
create or replace function public.admin_grant_app_access(
  p_admin_pin text, p_user_id uuid, p_app_key text, p_on boolean default true)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $fn$
declare u public.app_users; v_has_auth boolean;
begin
  if not coalesce(public.verify_role_pin('ADMIN_PIN', p_admin_pin), false) then
    return jsonb_build_object('success', false, 'error', 'ADMIN_PIN_INVALID');
  end if;
  select * into u from public.app_users where id = p_user_id;
  if not found then return jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND'); end if;

  update public.app_users
     set app_access = coalesce(app_access,'{}'::jsonb) || jsonb_build_object(p_app_key, p_on),
         updated_at = now()
   where id = p_user_id;

  if not p_on then
    -- Access hata → us app ka button chalu session se bhi turant hat jaata hai.
    update public.app_sessions set allowed_apps = array_remove(allowed_apps, p_app_key)
     where user_id = p_user_id and not revoked;
    if p_app_key = 'HOME_PACKING' then
      update packing.profiles set active = false where id = p_user_id;
    end if;
    return jsonb_build_object('success', true, 'app', p_app_key, 'on', false);
  end if;

  select exists (select 1 from auth.users a where a.id = p_user_id) into v_has_auth;

  if p_app_key in ('HOME_COMPLAINT_APP','HOME_PACKING') and not v_has_auth then
    return jsonb_build_object('success', false, 'error', 'AUTH_USER_MISSING',
      'need', 'auth_account', 'name', u.user_name, 'user_id', u.id);
  end if;

  if p_app_key = 'HOME_COMPLAINT_APP' and u.cmp_username is null then
    update public.app_users
       set cmp_username   = public.cmp_make_username(u.user_name),
           cmp_role       = coalesce(cmp_role, 'User'),
           cmp_host_types = coalesce(cmp_host_types, '{}'::text[]),
           contact_no     = coalesce(nullif(regexp_replace(coalesce(contact_no,''), '\D','','g'),''), '0000000000'),
           department     = coalesce(nullif(department,''), '—'),
           designation    = coalesce(nullif(designation,''), '—'),
           dob            = coalesce(dob, '1900-01-01'::date)
     where id = p_user_id;
  end if;

  if p_app_key = 'HOME_PACKING' then
    insert into packing.profiles (id, username, full_name, role, active)
    values (p_user_id, coalesce(nullif(u.emp_code,''), u.user_name), u.user_name, 'DATA_ENTRY', true)
    on conflict (id) do update set active = true;
  end if;

  -- Chalu session par bhi turant — user ko dobara login nahi karna padta.
  update public.app_sessions
     set allowed_apps = (select array_agg(distinct x)
                           from unnest(allowed_apps || array[p_app_key]) x)
   where user_id = p_user_id and not revoked;

  return jsonb_build_object('success', true, 'app', p_app_key, 'on', true,
                            'had_auth_account', v_has_auth);
end
$fn$;

grant execute on function public.admin_grant_app_access(text, uuid, text, boolean) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 14. Id ko naye auth account par le jaana (ek hi jagah ka kaam)
-- ════════════════════════════════════════════════════════════════════════
-- Supabase ka Admin API naye auth user ka id KHUD chunta hai (hum de nahi
-- sakte). "Ek hi id" ka niyam bachane ke liye account banane ke baad
-- app_users.id ko usi naye auth id par le aana padta hai.
--
-- Wahi kaam jo section 5-6 ne poori table par kiya, ab ek user par:
--   PIN ki key · sessions · pin resets · Order Form mirror · id
-- Ek hi jagah likha hai, isi liye "ek jagah badla, doosri reh gayi"
-- jaisa farq ban hi nahi sakta.
create or replace function public.erp_relink_user_id(
  p_admin_pin text, p_old_id uuid, p_new_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $fn$
begin
  if not coalesce(public.verify_role_pin('ADMIN_PIN', p_admin_pin), false) then
    return jsonb_build_object('success', false, 'error', 'ADMIN_PIN_INVALID');
  end if;
  if p_old_id = p_new_id then
    return jsonb_build_object('success', true, 'changed', false);
  end if;
  if not exists (select 1 from public.app_users where id = p_old_id) then
    return jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  end if;
  if exists (select 1 from public.app_users where id = p_new_id) then
    return jsonb_build_object('success', false, 'error', 'NEW_ID_TAKEN');
  end if;
  if not exists (select 1 from auth.users where id = p_new_id) then
    return jsonb_build_object('success', false, 'error', 'NEW_ID_NOT_AN_AUTH_USER');
  end if;

  -- PIN: sirf key badalti hai, hash waisa hi → PIN chalta rehta hai.
  update public.role_pins set role = 'USER::' || p_new_id::text
   where role = 'USER::' || p_old_id::text;
  update public.app_sessions   set user_id = p_new_id where user_id = p_old_id;
  update public.app_pin_resets set user_id = p_new_id where user_id = p_old_id;
  update public.sales_users    set app_user_id = p_new_id::text
   where app_user_id = p_old_id::text;
  update public.app_users      set id = p_new_id where id = p_old_id;

  return jsonb_build_object('success', true, 'changed', true,
                            'old_id', p_old_id, 'new_id', p_new_id);
end
$fn$;

grant execute on function public.erp_relink_user_id(text, uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════
-- 15. Verify
-- ════════════════════════════════════════════════════════════════════════
select 'app_users' as what, count(*)::text as n from public.app_users
union all select 'cmp_profiles view rows (56 hone chahiye)', count(*)::text from public.cmp_profiles
union all select 'id = auth uid (Complaint)', count(*)::text
  from public.app_users u join auth.users a on a.id = u.id where u.cmp_username is not null
union all select 'id = auth uid (Packing)', count(*)::text
  from public.app_users u join packing.profiles p on p.id = u.id
union all select 'PIN keys mapped', count(*)::text
  from public.role_pins rp
 where exists (select 1 from public.app_users u where rp.role = 'USER::'||u.id::text)
union all select 'PIN keys ORPHAN (0 hona chahiye)', count(*)::text
  from public.role_pins rp
 where rp.role like 'USER::%'
   and not exists (select 1 from public.app_users u where rp.role = 'USER::'||u.id::text)
union all select 'sessions ORPHAN (0 hona chahiye)', count(*)::text
  from public.app_sessions s
 where not exists (select 1 from public.app_users u where u.id = s.user_id)
union all select 'columns gone (0 hona chahiye)', count(*)::text
  from information_schema.columns
 where table_schema='public' and table_name='app_users'
   and column_name in ('cmp_profile_id','pk_profile_id');

-- ════════════════════════════════════════════════════════════════════════
-- 16. ROLLBACK
-- ════════════════════════════════════════════════════════════════════════
-- Mapping `_merge_id_map` me bachi hui hai:
--
--   drop view if exists public.cmp_profiles;
--   alter table public.app_users add column cmp_profile_id uuid;
--   alter table public.app_users add column pk_profile_id  uuid;
--   update public.app_users u set id = m.old_id,
--          cmp_profile_id = case when m.had_cmp then m.new_id end,
--          pk_profile_id  = case when m.had_pk  then m.old_pk_id end
--     from public._merge_id_map m where u.id = m.new_id;
--   update public.role_pins rp set role = 'USER::'||m.old_id::text
--     from public._merge_id_map m where rp.role = 'USER::'||m.new_id::text;
--   update public.app_sessions s set user_id = m.old_id
--     from public._merge_id_map m where s.user_id = m.new_id;
--   update packing.profiles p set id = m.old_pk_id
--     from public._merge_id_map m where m.was_dual and p.id = m.new_id;
--   -- phir cmp_profiles view ko cmp_profile_id par dobara banayein
--   -- (MERGE_CMP_PROFILES_INTO_APP_USERS.sql ka section 8) aur
--   -- cmp_* FK wapas auth.users(id) par.
--   notify pgrst, 'reload schema';
--
-- Sab theek chale to kuch hafte baad:
--   drop table public._archive_app_users_preid, public._archive_role_pins_preid,
--              public._archive_app_sessions_preid, public._archive_sales_users_preid,
--              public._archive_pk_profiles_preid, public._merge_id_map;
