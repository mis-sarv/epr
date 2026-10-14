-- ════════════════════════════════════════════════════════════════════════
-- SINGLE_LOGIN_MIGRATION.sql
-- SARV INDIA ERP — ek user table, ek PIN, ek login, saare apps
-- ════════════════════════════════════════════════════════════════════════
--
-- Kaise chalayein:
--   1. Neeche `v_admin_pin` me apna ADMIN PIN daalein (wahi jo Admin Panel
--      me user save karte waqt poochha jaata hai).
--   2. Supabase › SQL Editor › naya query › ye poori file paste › RUN.
--   3. Aakhir me jo table dikhegi (`sarv_user_merge_report`) usme HAR naye
--      user ka naam + uska GENERATED PIN hai. Wo list nikaal lein / chhaap
--      lein, phir section 9 ka DROP chala dein.
--
--   UNIFIED_USERS_MIGRATION.sql ke BAAD chalayein. Dobara chalana
--   surakshit hai (idempotent) — jo pehle se juda hai use dobara nahi
--   chhedti, aur jiska PIN pehle se set hai uska PIN NAHI badalti.
--
-- Kya karti hai:
--
--   1. MERGE — Complaint App (`cmp_profiles`, 57 user) aur Packing &
--      Dispatch (`packing.profiles`, 6 user) ke users ERP ki EK HI
--      `app_users` table me aa jaate hain. Purane rows MITTE NAHI —
--      `app_users.cmp_profile_id` / `pk_profile_id` se jude rehte hain,
--      isi liye us bande ka purana kaam (assign ki gayi tasks, uska
--      signature, banaye hue slip) poora bacha rehta hai.
--
--   2. EK PIN — har naye user ka ERP PIN ban jaata hai (Complaint walon
--      ka unke mobile ke AAKHRI 4 DIGIT, Packing walon ka username se
--      bana 4-digit). PIN kahan/kaise store hota hai ye file JAANTI NAHI
--      — wo aapke maujooda `admin_save_user()` se hi set hota hai, aur
--      set karne ke baad `verify_app_user_pin()` se CHECK bhi kiya jaata
--      hai. Isi liye PIN hashing ka tareeka badalne par bhi ye file
--      chalti rahegi, aur "PIN set hua par chalta nahi" chup-chaap nahi
--      ho sakta.
--
--   3. ACCESS — naye users ko sirf UNKE app ka access milta hai
--      (Complaint wale ko sirf Complaint App, Packing wale ko sirf
--      Packing). Shop-floor ke 50+ logon ko ERP ke buttons NAHI dikhte.
--      Do tah se: per-user `app_access` + naye role `CMP_USER` / `PK_USER`
--      ka role-wise Tab Visibility.
--
--   4. Jis ERP user ka Complaint / Packing account NAHI hai, uske login
--      par us app ka button CHHUP jaata hai (pehle button dikhta tha aur
--      click karne par us app ki apni login screen aa jaati thi). Ye
--      report me saaf likha jaata hai.
--
-- Jo ye file NAHI karti: kisi ka purana login band nahi karti. Complaint
--   App aur Packing apne username/password se bhi chalte rehte hain, to
--   migration ke baad bhi koi bahar nahi hota.
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ════════════════════════════════════════════════════════════════════════
-- 0. Naam ko ek jaisa karne wala helper
-- ════════════════════════════════════════════════════════════════════════
-- "SATINDER_GHALYAN", "satinder ghalyan", "Satinder  Ghalyan" — teeno ek
-- hi naam hain. Underscore ko space maana jaata hai, kai space ek, aur
-- sab UPPER. Isi se tay hota hai ki Complaint / Packing ka banda ERP me
-- pehle se maujood hai ya naya hai.
create or replace function public.sarv_norm_name(p_name text)
returns text
language sql
immutable
as $fn$
  select nullif(btrim(upper(regexp_replace(
           regexp_replace(coalesce(p_name, ''), '[_\.]+', ' ', 'g'),
           '\s+', ' ', 'g'))), '')
$fn$;

comment on function public.sarv_norm_name(text) is
  'Naam ko match karne layak banata hai — underscore/dot = space, kai space ek, sab UPPER.';

-- ════════════════════════════════════════════════════════════════════════
-- 0b. pgcrypto ka search_path — login ki ek purani kami
-- ════════════════════════════════════════════════════════════════════════
-- `erp_app_login()` session token banane ke liye pgcrypto ka
-- `gen_random_bytes()` use karta hai, par wo `set search_path = public`
-- ke saath bana tha — aur Supabase me pgcrypto `extensions` schema me
-- rehta hai. Nateeja: SAHI PIN par login ke aakhri qadam par
--
--     function gen_random_bytes(integer) does not exist   [42883]
--
-- Galat PIN par ye kabhi nahi dikhta (function PIN check par hi ruk jaata
-- hai), isi liye ye kami lambe waqt tak chhupi rehti hai.
--
-- Yahan function ka BODY nahi chhedte — sirf search_path me wo schema jod
-- dete hain jahan pgcrypto sach me hai. Isi liye kisi function ka logic
-- nahi badalta, aur jinke source paas nahi hain (sales_erp_login) wo bhi
-- theek ho jaate hain.
--
-- Yahi kaam alag se `FIX_PGCRYPTO_SEARCHPATH.sql` bhi karti hai (zyada
-- tafseel + check ke saath), agar sirf yahi theek karna ho.
do $pgc$
declare
  v_ext_schema text;
  v_fn         record;
  v_new_path   text;
  v_fixed      int := 0;
begin
  select n.nspname into v_ext_schema
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'gen_random_bytes' limit 1;

  if v_ext_schema is null then
    if exists (select 1 from pg_namespace where nspname = 'extensions') then
      create extension if not exists pgcrypto with schema extensions;
      v_ext_schema := 'extensions';
    else
      create extension if not exists pgcrypto;
      select n.nspname into v_ext_schema
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.proname = 'gen_random_bytes' limit 1;
    end if;
  end if;
  if v_ext_schema is null then
    raise warning 'pgcrypto nahi mila — Dashboard › Database › Extensions me ON karein';
    return;
  end if;

  for v_fn in
    select n.nspname as sch, p.proname as fn,
           pg_get_function_identity_arguments(p.oid) as args,
           (select c from unnest(p.proconfig) c where c like 'search\_path=%' limit 1) as cfg
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proconfig is not null
       and exists (select 1 from unnest(p.proconfig) c where c like 'search\_path=%')
       and p.prosrc ~* '(gen_random_bytes|\mcrypt\M|\mdigest\M|\mhmac\M|gen_salt)'
  loop
    if v_fn.cfg ~ ('(^|[=,[:space:]])' || v_ext_schema || '([,[:space:]]|$)') then
      continue;                                      -- pehle se theek
    end if;
    v_new_path := substring(v_fn.cfg from 'search_path=(.*)$') || ', ' || quote_ident(v_ext_schema);
    execute format('alter function %I.%I(%s) set search_path = %s',
                   v_fn.sch, v_fn.fn, v_fn.args, v_new_path);
    raise notice 'search_path theek kiya: %.%(%) -> %', v_fn.sch, v_fn.fn, v_fn.args, v_new_path;
    v_fixed := v_fixed + 1;
  end loop;

  raise notice 'pgcrypto schema = % · % function theek kiye', v_ext_schema, v_fixed;
end
$pgc$;

-- ════════════════════════════════════════════════════════════════════════
-- 1. Report table — kaun juda, kaun bana, kiska PIN kya hai
-- ════════════════════════════════════════════════════════════════════════
-- Jaan-boojh kar ek TABLE, sirf `raise notice` nahi: 60+ user ki list
-- notices me scroll karke padhna aur PIN baantna mushkil hai. Section 9
-- isse DROP karne ko kehti hai, kyunki isme plain PIN hote hain.
drop table if exists public.sarv_user_merge_report;
create table public.sarv_user_merge_report (
  sr          serial primary key,
  source_app  text,          -- COMPLAINT / PACKING / ERP
  action      text,          -- CREATED / LINKED / ALREADY_LINKED / NEEDS_MANUAL_LINK / APP_HIDDEN
  user_name   text,
  erp_role    text,
  app_pin     text,          -- sirf CREATED par — naya PIN
  note        text
);
revoke all on public.sarv_user_merge_report from anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 2. Poora merge — ek hi transaction
-- ════════════════════════════════════════════════════════════════════════
do $mig$
declare
  -- ─────────────────────────────────────────────────────────────────────
  -- YAHAN APNA ADMIN PIN DAALEIN
  -- ─────────────────────────────────────────────────────────────────────
  v_admin_pin  text := 'PASTE_ADMIN_PIN_HERE';
  -- ─────────────────────────────────────────────────────────────────────

  r            record;
  au_id        uuid;
  v_norm       text;
  v_name       text;
  v_pin        text;
  v_cnt        int;
  v_ok         boolean;
  v_created    int := 0;
  v_linked     int := 0;
  v_manual     int := 0;

  -- Saare app / module keys. Naye users par inhe saaf `false` likha jaata
  -- hai, warna SARV_TABS ke `def:'ALL'` ki wajah se shop-floor ka banda bhi
  -- poora ERP dekh leta. Ye list store-core.js ke SARV_TABS se hai.
  v_all_keys   text[] := array[
    'HOME_ERP_APP','HOME_APPROVAL_APP','HOME_COMPLAINT_APP','HOME_PACKING','HOME_ORDER_FORM',
    'HOME_PR','HOME_PO','HOME_IN','HOME_IN_NB','HOME_OUT','HOME_ISSUE','HOME_REPORTS',
    'HOME_TRACKER','HOME_MASTER','HOME_REPAIR','HOME_PRODUCTION','HOME_LOT_CARD',
    'HOME_PRINTING_LOT','HOME_TRIMS',
    'ERP_DASH','ERP_PARTNER','ERP_SALES','ERP_PURCHASE','ERP_WAREHOUSE','ERP_MANUF',
    'ERP_QUALITY','ERP_FINANCE','ERP_PM','ERP_SUPPORT','ERP_KAIZEN','ERP_HR','ERP_MASTERS',
    'ERP_PRODUCTS','ERP_ASSETS','ERP_TENDER','ERP_NPD','ERP_KPIT','ERP_ACT','ERP_ADMIN'
  ];
  v_access     jsonb;
  k            text;
begin
  -- ── 2.0 Zaroori cheezein maujood hain? ──────────────────────────────
  if to_regclass('public.app_users') is null then
    raise exception 'app_users table nahi hai — pehle ADMIN_PANEL_MIGRATION.sql chalayein';
  end if;
  if to_regclass('public.app_sessions') is null then
    raise exception 'app_sessions table nahi hai — pehle UNIFIED_USERS_MIGRATION.sql chalayein';
  end if;
  if not exists (select 1 from pg_proc where proname = 'admin_save_user'
                   and pronamespace = 'public'::regnamespace) then
    raise exception 'admin_save_user() nahi hai — pehle ADMIN_PANEL_MIGRATION.sql chalayein';
  end if;

  -- ── 2.1 Admin PIN pehle hi check — aadha kaam karke rukne se bachne ke liye
  if v_admin_pin = 'PASTE_ADMIN_PIN_HERE' or btrim(coalesce(v_admin_pin,'')) = '' then
    raise exception 'Pehle is file me `v_admin_pin` me apna Admin PIN daalein (line ~95)';
  end if;
  begin
    v_ok := public.verify_role_pin('ADMIN_PIN', v_admin_pin);
  exception when others then
    v_ok := null;   -- function ka naam/signature alag — neeche admin_save_user khud bata dega
  end;
  if v_ok is false then
    raise exception 'Admin PIN galat hai (ADMIN_PIN). Sahi PIN daalkar dobara chalayein.';
  end if;

  -- ════════════════════════════════════════════════════════════════════
  -- 2.2 COMPLAINT APP ke users  (cmp_profiles → app_users)
  -- ════════════════════════════════════════════════════════════════════
  if to_regclass('public.cmp_profiles') is null then
    raise notice 'cmp_profiles nahi mili — Complaint merge skip';
  else
    for r in
      select p.id, p.name, p.username, p.mobile, p.role, p.department, p.is_active
        from public.cmp_profiles p
       where public.sarv_norm_name(p.name) is not null
       order by p.name
    loop
      v_norm := public.sarv_norm_name(r.name);

      -- Pehle se juda hua hai?
      select u.id into au_id
        from public.app_users u
       where u.cmp_profile_id = r.id
       limit 1;
      if au_id is not null then
        insert into public.sarv_user_merge_report (source_app, action, user_name, note)
        values ('COMPLAINT', 'ALREADY_LINKED', r.name, 'pehle se juda — kuch nahi badla');
        continue;
      end if;

      -- Naam se maujooda ERP user dhoondhein. Ek se zyada mile to HAATH SE
      -- jodna chahiye — galat bande se jodna uska purana kaam doosre ke
      -- naam kar dega, isi liye yahan chhod dete hain.
      select count(*) into v_cnt
        from public.app_users u
       where public.sarv_norm_name(u.user_name) = v_norm;

      if v_cnt > 1 then
        insert into public.sarv_user_merge_report (source_app, action, user_name, note)
        values ('COMPLAINT', 'NEEDS_MANUAL_LINK', r.name,
                'is naam ke ' || v_cnt || ' ERP user hain — Admin Panel › Users › 🔗 se haath se jodein');
        v_manual := v_manual + 1;
        continue;
      end if;

      if v_cnt = 1 then
        -- Maujooda ERP user — sirf jodd lagti hai. Uska role / access /
        -- PIN bilkul nahi chhedte: wo pehle se ERP chala raha hai.
        select u.id into au_id
          from public.app_users u
         where public.sarv_norm_name(u.user_name) = v_norm;

        update public.app_users
           set cmp_profile_id = r.id,
               app_access     = coalesce(app_access, '{}'::jsonb)
                                  || jsonb_build_object('HOME_COMPLAINT_APP', true)
         where id = au_id;

        insert into public.sarv_user_merge_report (source_app, action, user_name, erp_role, note)
        select 'COMPLAINT', 'LINKED', u.user_name, u.role,
               'maujooda ERP user se juda — Complaint App ON, PIN waisa hi'
          from public.app_users u where u.id = au_id;
        v_linked := v_linked + 1;
        continue;
      end if;

      -- ── Naya user ──────────────────────────────────────────────────
      -- PIN = mobile ke aakhri 4 digit. Mobile na ho to id se bana
      -- deterministic 4-digit (dobara chalane par wahi aayega).
      v_pin := regexp_replace(coalesce(r.mobile, ''), '\D', '', 'g');
      if length(v_pin) >= 4 then
        v_pin := right(v_pin, 4);
      else
        v_pin := lpad((abs(('x' || substr(md5(r.id::text), 1, 8))::bit(32)::bigint) % 9000 + 1000)::text, 4, '0');
      end if;

      v_name := v_norm;
      -- user_name takraye to department se alag karein.
      if exists (select 1 from public.app_users u where public.sarv_norm_name(u.user_name) = v_name) then
        v_name := v_name || ' (' || upper(coalesce(r.department, 'CMP')) || ')';
      end if;

      /* Jaan-boojh kar pehle 'VIEW_PIN' role se banate hain: admin_save_user()
         apne role list ko check kar sakta hai aur 'CMP_USER' use anjaan
         lagega. Role / roles / access turant neeche UPDATE kar dete hain. */
      begin
        perform public.admin_save_user(
          p_id         => null::uuid,
          p_user_name  => v_name,
          p_role       => 'VIEW_PIN',
          p_emp_code   => null::text,
          p_contact_no => nullif(regexp_replace(coalesce(r.mobile,''), '\D', '', 'g'), ''),
          p_is_active  => coalesce(r.is_active, true),
          p_new_pin    => v_pin,
          p_signature  => null::text,
          p_admin_pin  => v_admin_pin
        );
      exception when others then
        insert into public.sarv_user_merge_report (source_app, action, user_name, note)
        values ('COMPLAINT', 'NEEDS_MANUAL_LINK', r.name,
                'admin_save_user fail: ' || sqlerrm);
        v_manual := v_manual + 1;
        continue;
      end;

      select u.id into au_id
        from public.app_users u
       where public.sarv_norm_name(u.user_name) = public.sarv_norm_name(v_name)
       limit 1;
      if au_id is null then
        insert into public.sarv_user_merge_report (source_app, action, user_name, note)
        values ('COMPLAINT', 'NEEDS_MANUAL_LINK', r.name, 'user bana par wapas mila nahi — haath se dekhein');
        v_manual := v_manual + 1;
        continue;
      end if;

      -- Sirf Complaint App ka access, baaki sab saaf band.
      v_access := jsonb_build_object('HOME_COMPLAINT_APP', true);
      foreach k in array v_all_keys loop
        if k <> 'HOME_COMPLAINT_APP' then
          v_access := v_access || jsonb_build_object(k, false);
        end if;
      end loop;

      update public.app_users
         set role           = 'CMP_USER',
             roles          = array['CMP_USER'],
             app_access     = v_access,
             cmp_profile_id = r.id,
             is_active      = coalesce(r.is_active, true)
       where id = au_id;

      -- PIN sach me chalta hai? (set karna aur chalna do alag baatein hain)
      v_ok := null;
      begin
        execute 'select public.verify_app_user_pin($1::uuid, $2)' into v_ok using au_id, v_pin;
      exception when others then
        begin
          execute 'select public.verify_app_user_pin($1::text, $2)' into v_ok using au_id::text, v_pin;
        exception when others then
          v_ok := null;
        end;
      end;

      insert into public.sarv_user_merge_report (source_app, action, user_name, erp_role, app_pin, note)
      values ('COMPLAINT', 'CREATED', v_name, 'CMP_USER', v_pin,
              case when v_ok is true  then 'naya user — PIN check ho gaya'
                   when v_ok is false then '⚠️ PIN set hua par verify FALSE — Admin Panel se PIN dobara set karein'
                   else '⚠️ PIN verify nahi ho saka (verify_app_user_pin nahi mila)' end
              || case when coalesce(r.is_active, true) then '' else ' · Complaint me inactive tha' end);
      v_created := v_created + 1;
    end loop;
  end if;

  -- ════════════════════════════════════════════════════════════════════
  -- 2.3 PACKING ke users  (packing.profiles → app_users)
  -- ════════════════════════════════════════════════════════════════════
  if to_regclass('packing.profiles') is null then
    raise notice 'packing.profiles nahi mili — Packing merge skip';
  else
    for r in
      -- Ek hi naam ke do packing account ho sakte hain (jaise Manjeet:
      -- ADMIN aur MD). Role ki ehmiyat ke hisaab se sabse ooncha chunte
      -- hain, taaki jodd har baar wahi bane — aur report me likh dete hain.
      select p.id, p.username, p.full_name, p.role, p.active,
             row_number() over (
               partition by public.sarv_norm_name(p.full_name)
               order by case upper(coalesce(p.role,''))
                          when 'ADMIN' then 1 when 'MD' then 2
                          when 'PACKING_INCHARGE' then 3 when 'DATA_ENTRY' then 4
                          else 9 end, p.username) as pick
        from packing.profiles p
       where public.sarv_norm_name(p.full_name) is not null
       order by p.full_name
    loop
      v_norm := public.sarv_norm_name(r.full_name);

      select u.id into au_id from public.app_users u where u.pk_profile_id = r.id limit 1;
      if au_id is not null then
        insert into public.sarv_user_merge_report (source_app, action, user_name, note)
        values ('PACKING', 'ALREADY_LINKED', r.full_name, 'pehle se juda — kuch nahi badla');
        continue;
      end if;

      -- Ek naam ke kai packing account — sirf sabse ooncha role juda.
      if r.pick > 1 then
        insert into public.sarv_user_merge_report (source_app, action, user_name, note)
        values ('PACKING', 'NEEDS_MANUAL_LINK', r.full_name,
                'isi naam ka doosra Packing account (' || coalesce(r.username,'?') || ' / ' ||
                coalesce(r.role,'?') || ') — chahiye to Admin Panel se haath se jodein');
        v_manual := v_manual + 1;
        continue;
      end if;

      select count(*) into v_cnt
        from public.app_users u
       where public.sarv_norm_name(u.user_name) = v_norm;

      if v_cnt > 1 then
        insert into public.sarv_user_merge_report (source_app, action, user_name, note)
        values ('PACKING', 'NEEDS_MANUAL_LINK', r.full_name,
                'is naam ke ' || v_cnt || ' ERP user hain — haath se jodein');
        v_manual := v_manual + 1;
        continue;
      end if;

      if v_cnt = 1 then
        select u.id into au_id
          from public.app_users u
         where public.sarv_norm_name(u.user_name) = v_norm;

        update public.app_users
           set pk_profile_id = r.id,
               app_access    = coalesce(app_access, '{}'::jsonb)
                                 || jsonb_build_object('HOME_PACKING', true)
         where id = au_id;

        insert into public.sarv_user_merge_report (source_app, action, user_name, erp_role, note)
        select 'PACKING', 'LINKED', u.user_name, u.role,
               'maujooda ERP user se juda (' || coalesce(r.role,'?') || ') — Packing ON, PIN waisa hi'
          from public.app_users u where u.id = au_id;
        v_linked := v_linked + 1;
        continue;
      end if;

      -- ── Naya user ──────────────────────────────────────────────────
      v_pin  := lpad((abs(('x' || substr(md5(r.id::text), 1, 8))::bit(32)::bigint) % 9000 + 1000)::text, 4, '0');
      v_name := v_norm;
      if exists (select 1 from public.app_users u where public.sarv_norm_name(u.user_name) = v_name) then
        v_name := v_name || ' (PACKING)';
      end if;

      begin
        perform public.admin_save_user(
          p_id         => null::uuid,
          p_user_name  => v_name,
          p_role       => 'VIEW_PIN',
          p_emp_code   => null::text,
          p_contact_no => null::text,
          p_is_active  => coalesce(r.active, true),
          p_new_pin    => v_pin,
          p_signature  => null::text,
          p_admin_pin  => v_admin_pin
        );
      exception when others then
        insert into public.sarv_user_merge_report (source_app, action, user_name, note)
        values ('PACKING', 'NEEDS_MANUAL_LINK', r.full_name, 'admin_save_user fail: ' || sqlerrm);
        v_manual := v_manual + 1;
        continue;
      end;

      select u.id into au_id
        from public.app_users u
       where public.sarv_norm_name(u.user_name) = public.sarv_norm_name(v_name)
       limit 1;
      if au_id is null then
        insert into public.sarv_user_merge_report (source_app, action, user_name, note)
        values ('PACKING', 'NEEDS_MANUAL_LINK', r.full_name, 'user bana par wapas mila nahi');
        v_manual := v_manual + 1;
        continue;
      end if;

      v_access := jsonb_build_object('HOME_PACKING', true);
      foreach k in array v_all_keys loop
        if k <> 'HOME_PACKING' then
          v_access := v_access || jsonb_build_object(k, false);
        end if;
      end loop;

      update public.app_users
         set role          = 'PK_USER',
             roles         = array['PK_USER'],
             app_access    = v_access,
             pk_profile_id = r.id,
             is_active     = coalesce(r.active, true)
       where id = au_id;

      v_ok := null;
      begin
        execute 'select public.verify_app_user_pin($1::uuid, $2)' into v_ok using au_id, v_pin;
      exception when others then
        begin
          execute 'select public.verify_app_user_pin($1::text, $2)' into v_ok using au_id::text, v_pin;
        exception when others then
          v_ok := null;
        end;
      end;

      insert into public.sarv_user_merge_report (source_app, action, user_name, erp_role, app_pin, note)
      values ('PACKING', 'CREATED', v_name, 'PK_USER', v_pin,
              'Packing role ' || coalesce(r.role,'?') ||
              case when v_ok is true  then ' · PIN check ho gaya'
                   when v_ok is false then ' · ⚠️ PIN verify FALSE — Admin Panel se dobara set karein'
                   else ' · ⚠️ PIN verify nahi ho saka' end);
      v_created := v_created + 1;
    end loop;
  end if;

  -- ════════════════════════════════════════════════════════════════════
  -- 2.4 Jiska us app me account HI NAHI hai — uska button chhupa dein
  -- ════════════════════════════════════════════════════════════════════
  -- Pehle button dikhta tha aur dabane par us app ki apni login screen
  -- aa jaati thi ("access hai par andar jaa nahi sakte"). Ab button hi
  -- nahi dikhega. Admin jab us bande ka account bana kar jodd lagayega,
  -- tab Users › 📱 Apps me ise wapas auto / ON kar sakta hai.
  for r in
    select u.id, u.user_name, u.role, u.cmp_profile_id, u.pk_profile_id
      from public.app_users u
     where coalesce(u.role,'') not in ('CMP_USER','PK_USER')
       and (u.cmp_profile_id is null or u.pk_profile_id is null)
     order by u.user_name
  loop
    v_access := coalesce((select app_access from public.app_users where id = r.id), '{}'::jsonb);
    if r.cmp_profile_id is null and (v_access -> 'HOME_COMPLAINT_APP') is null then
      v_access := v_access || jsonb_build_object('HOME_COMPLAINT_APP', false);
      insert into public.sarv_user_merge_report (source_app, action, user_name, erp_role, note)
      values ('ERP', 'APP_HIDDEN', r.user_name, r.role,
              'Complaint App ka account nahi — button chhupa diya');
    end if;
    if r.pk_profile_id is null and (v_access -> 'HOME_PACKING') is null then
      v_access := v_access || jsonb_build_object('HOME_PACKING', false);
      insert into public.sarv_user_merge_report (source_app, action, user_name, erp_role, note)
      values ('ERP', 'APP_HIDDEN', r.user_name, r.role,
              'Packing ka account nahi — button chhupa diya');
    end if;
    update public.app_users set app_access = v_access where id = r.id;
  end loop;

  raise notice '════════════════════════════════════════════';
  raise notice 'MERGE poora: % naye user bane, % maujooda user se jude, % haath se karne hain',
               v_created, v_linked, v_manual;
  raise notice 'PIN ki list:  select * from public.sarv_user_merge_report order by sr;';
  raise notice '════════════════════════════════════════════';
end
$mig$;

-- ════════════════════════════════════════════════════════════════════════
-- 3. Naye role — role-wise Tab Visibility
-- ════════════════════════════════════════════════════════════════════════
-- Doosri tah. Upar har naye USER par app_access likha gaya; yahan ROLE par
-- likhte hain, taaki aage se jo bhi user CMP_USER / PK_USER banega use
-- apne aap sirf apna app mile — Admin ko har naye bande par haath nahi
-- lagana padega.
do $tv$
declare
  v_tv       jsonb;
  v_keys     text[] := array[
    'HOME_ERP_APP','HOME_APPROVAL_APP','HOME_COMPLAINT_APP','HOME_PACKING','HOME_ORDER_FORM',
    'HOME_PR','HOME_PO','HOME_IN','HOME_IN_NB','HOME_OUT','HOME_ISSUE','HOME_REPORTS',
    'HOME_TRACKER','HOME_MASTER','HOME_REPAIR','HOME_PRODUCTION','HOME_LOT_CARD',
    'HOME_PRINTING_LOT','HOME_TRIMS',
    'ERP_DASH','ERP_PARTNER','ERP_SALES','ERP_PURCHASE','ERP_WAREHOUSE','ERP_MANUF',
    'ERP_QUALITY','ERP_FINANCE','ERP_PM','ERP_SUPPORT','ERP_KAIZEN','ERP_HR','ERP_MASTERS',
    'ERP_PRODUCTS','ERP_ASSETS','ERP_TENDER','ERP_NPD','ERP_KPIT','ERP_ACT','ERP_ADMIN'
  ];
  k          text;
begin
  if to_regclass('public.app_settings') is null then
    raise notice 'app_settings nahi hai — Tab Visibility skip';
    return;
  end if;

  select value into v_tv from public.app_settings where key = 'tab_visibility';
  v_tv := coalesce(v_tv, '{}'::jsonb);

  foreach k in array v_keys loop
    v_tv := jsonb_set(
      v_tv,
      array[k],
      coalesce(v_tv -> k, '{}'::jsonb)
        || jsonb_build_object(
             'CMP_USER', (k = 'HOME_COMPLAINT_APP'),
             'PK_USER',  (k = 'HOME_PACKING')),
      true);
  end loop;

  insert into public.app_settings (key, value)
  values ('tab_visibility', v_tv)
  on conflict (key) do update set value = excluded.value;

  raise notice 'tab_visibility: CMP_USER aur PK_USER ke rows likh diye';
end
$tv$;

-- ════════════════════════════════════════════════════════════════════════
-- 4. erp_app_session() — ek app ka naam de kar poochhna
-- ════════════════════════════════════════════════════════════════════════
-- UNIFIED_USERS_MIGRATION ne ye function `p_app` ke saath banaya tha.
-- Agar kisi wajah se purana (bina p_app) version chal raha ho to Complaint
-- aur Packing ka gate kabhi "NO_APP_ACCESS" nahi keh paayega. Yahan sirf
-- CHECK karte hain aur saaf bata dete hain — function dobara nahi likhte,
-- taaki aapke chalte hue version par koi asar na pade.
do $chk$
begin
  if not exists (
    select 1 from pg_proc p
     where p.proname = 'erp_app_session'
       and p.pronamespace = 'public'::regnamespace
       and pg_get_function_identity_arguments(p.oid) like '%text, text%'
  ) then
    raise warning 'erp_app_session() me `p_app` parameter nahi hai — pehle UNIFIED_USERS_MIGRATION.sql dobara chalayein, warna app-wise rok kaam nahi karegi';
  end if;
end
$chk$;

-- ════════════════════════════════════════════════════════════════════════
-- 5. erp_sso_profile() — Edge Function isi se pehchaan leta hai
-- ════════════════════════════════════════════════════════════════════════
-- Complaint App ka DATA Supabase Auth par chalta hai (`cmp_*` tables ke
-- trigger / RLS `auth.uid()` maangte hain). Isi liye wahan "password
-- hatana" ka matlab RLS todna NAHI hai — balki ERP ke session se us bande
-- ka ASLI auth session bana dena hai. Wo kaam Edge Function `erp-sso`
-- karta hai (service_role key server par rehti hai, browser me kabhi
-- nahi), aur pehchaan ke liye yahi function poochhta hai.
--
-- Ye `erp_app_session()` se alag kyun: wo session ka poora haal lautata
-- hai aur anon bhi bula sakta hai. Ye sirf utna lautata hai jitna auth
-- session banane ke liye chahiye, aur SIRF service_role bula sakta hai —
-- isi liye browser se koi kisi ka profile id nahi nikaal sakta.
create or replace function public.erp_sso_profile(
  p_token text,
  p_app   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  s public.app_sessions;
  u public.app_users;
begin
  if coalesce(p_token, '') = '' then
    return jsonb_build_object('success', false, 'error', 'NO_TOKEN');
  end if;

  select * into s from public.app_sessions where token = p_token;
  if not found then
    return jsonb_build_object('success', false, 'error', 'NO_SESSION');
  end if;
  if s.revoked then
    return jsonb_build_object('success', false, 'error', 'SESSION_REVOKED');
  end if;
  if s.expires_at <= now() then
    return jsonb_build_object('success', false, 'error', 'SESSION_EXPIRED');
  end if;

  select * into u from public.app_users where id = s.user_id;
  if not found or not coalesce(u.is_active, true) then
    update public.app_sessions set revoked = true where token = p_token;
    return jsonb_build_object('success', false, 'error', 'USER_INACTIVE');
  end if;

  -- App ka access us session par likha hua hai (ERP ne login ke waqt tay
  -- kiya). Yahan dobara check — token chura kar doosre app me ghusne ka
  -- raasta band rehta hai.
  if coalesce(p_app, '') <> '' and not (p_app = any (coalesce(s.allowed_apps, '{}'))) then
    return jsonb_build_object('success', false, 'error', 'NO_APP_ACCESS',
                              'name', u.user_name);
  end if;

  update public.app_sessions set last_seen_at = now() where token = p_token;

  return jsonb_build_object(
    'success',        true,
    'user_id',        u.id,
    'name',           u.user_name,
    'primary_role',   u.role,
    'cmp_profile_id', u.cmp_profile_id,
    'pk_profile_id',  u.pk_profile_id
  );
end
$fn$;

-- Sirf server (Edge Function). Browser ke anon / authenticated ko nahi.
revoke all on function public.erp_sso_profile(text, text) from public, anon, authenticated;
grant execute on function public.erp_sso_profile(text, text) to service_role;

comment on function public.erp_sso_profile(text, text) is
  'Edge Function erp-sso ke liye: ERP session token se us user ka linked auth profile id. Sirf service_role.';

-- ════════════════════════════════════════════════════════════════════════
-- 6. Launcher ko user ki list chahiye — naam ka dropdown
-- ════════════════════════════════════════════════════════════════════════
-- launcher.html login se PEHLE naam ka dropdown bharta hai, to use
-- `app_users` padhni padti hai. UNIFIED migration ka section 1b column-wise
-- SELECT grant deta hai — isi liye `select=*` ab bhi mana hai (signature
-- bahar nahi jaati) par naam / role / app_access padhe ja sakte hain.
-- Yahan sirf ye pakka karte hain ki wo grant maujood hai.
do $g$
declare v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'app_users'
     and column_name not in ('signature','pin_hash','pin','password','password_hash','sig');
  if v_cols is null then
    raise notice 'app_users ke column nahi mile — grant skip';
    return;
  end if;
  execute format('grant select (%s) on public.app_users to anon, authenticated', v_cols);

  if exists (select 1 from pg_class where oid = 'public.app_users'::regclass and relrowsecurity)
     and not exists (select 1 from pg_policies
                      where schemaname='public' and tablename='app_users'
                        and policyname='app_users_read') then
    create policy app_users_read on public.app_users
      for select to anon, authenticated using (true);
  end if;
  raise notice 'app_users: SELECT grant taaza kar diya';
end
$g$;

-- app_settings bhi launcher padhta hai (role-wise Tab Visibility).
do $g2$
begin
  if to_regclass('public.app_settings') is null then return; end if;
  grant select on public.app_settings to anon, authenticated;
  if exists (select 1 from pg_class where oid = 'public.app_settings'::regclass and relrowsecurity)
     and not exists (select 1 from pg_policies
                      where schemaname='public' and tablename='app_settings'
                        and policyname='app_settings_read') then
    create policy app_settings_read on public.app_settings
      for select to anon, authenticated using (true);
  end if;
  raise notice 'app_settings: SELECT grant taaza kar diya';
end
$g2$;

-- ════════════════════════════════════════════════════════════════════════
-- 6b. CHUNNA HAI: ek bande ke do device (phone + desktop) ek saath?
-- ════════════════════════════════════════════════════════════════════════
-- UNIFIED_USERS_MIGRATION ka `erp_app_login()` jaan-boojh kar EK user ka
-- EK hi live session rakhta hai — naya login purane ko revoke kar deta
-- hai, taaki kahin chhoot gaya token baad me kaam na kare.
--
-- Ek device par ye bilkul theek hai: us device ke saare apps ek hi token
-- se chalte hain (sab ek origin par hain). Par DO device par nahi —
-- desktop par ERP khola to phone ka Approval App "Session khatam ho gaya"
-- dikha dega, aur ulta bhi wahi.
--
-- Aapke kaam ka tareeka hi yahi hai (phone par approvals, desktop par
-- ERP), isi liye niche wala block chalane layak hai: ye purane session
-- revoke karna BAND kar deta hai, aur uski jagah ek saaf hadd rakhta hai
-- — per user zyada se zyada 5 live session, usse purane apne aap revoke.
--
-- Chahiye to `/*` aur `*/` hata kar is block ko chala dein. Na chalayein
-- to sab pehle jaisa chalta rahega (ek device ek waqt par).
/*
create or replace function public.erp_app_login(
  p_user_id      uuid,
  p_pin          text,
  p_allowed_apps text[] default '{}'
)
returns jsonb
language plpgsql
security definer
-- `extensions` zaroori hai: gen_random_bytes() pgcrypto ka hai aur Supabase
-- me wo wahin rehta hai. Sirf `public` likhne par SAHI PIN par login
-- "function gen_random_bytes(integer) does not exist" se girta hai —
-- dekhein section 0b / FIX_PGCRYPTO_SEARCHPATH.sql.
set search_path = public, extensions
as $$
declare
  u       public.app_users;
  v_ok    boolean := false;
  v_token text;
begin
  select * into u from public.app_users where id = p_user_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  end if;
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

  -- Purane session ab revoke NAHI hote — bas 5 se zyada nahi rehte.
  -- Isi liye phone aur desktop saath chal sakte hain, aur phir bhi koi
  -- token hamesha ke liye khula nahi rehta.
  update public.app_sessions
     set revoked = true
   where user_id = p_user_id
     and not revoked
     and token not in (
       select token from public.app_sessions
        where user_id = p_user_id and not revoked
        order by last_seen_at desc
        limit 4);

  insert into public.app_sessions (token, user_id, allowed_apps, roles, primary_role)
  values (v_token, p_user_id, coalesce(p_allowed_apps, '{}'),
          coalesce(u.roles, array[u.role]), u.role);

  return jsonb_build_object(
    'success', true,
    'token',   v_token,
    'user',    jsonb_build_object(
      'id',             u.id,
      'name',           u.user_name,
      'primary_role',   u.role,
      'roles',          to_jsonb(coalesce(u.roles, array[u.role])),
      'emp_code',       u.emp_code,
      'contact_no',     u.contact_no,
      'app_access',     coalesce(u.app_access, '{}'::jsonb),
      'cmp_profile_id', u.cmp_profile_id,
      'pk_profile_id',  u.pk_profile_id,
      'allowed_apps',   to_jsonb(coalesce(p_allowed_apps, '{}'))
    )
  );
end
$$;
*/

-- ════════════════════════════════════════════════════════════════════════
-- 7. Report — YAHI dekhna hai
-- ════════════════════════════════════════════════════════════════════════
select sr, source_app, action, user_name, erp_role, app_pin, note
  from public.sarv_user_merge_report
 order by case action when 'CREATED' then 1 when 'LINKED' then 2
                      when 'NEEDS_MANUAL_LINK' then 3 when 'APP_HIDDEN' then 4
                      else 5 end,
          user_name;

-- ════════════════════════════════════════════════════════════════════════
-- 8. Ginti
-- ════════════════════════════════════════════════════════════════════════
select action, count(*) as kitne
  from public.sarv_user_merge_report
 group by action
 order by kitne desc;

-- ════════════════════════════════════════════════════════════════════════
-- 9. PIN baant chuke? Ye chala dein
-- ════════════════════════════════════════════════════════════════════════
-- Is table me PLAIN PIN hain. List nikaal lene / baant dene ke baad ise
-- rakhna nahi chahiye:
--
--     drop table public.sarv_user_merge_report;
--
-- (Baad me koi bhi user ka PIN Admin Panel › Users se badla ja sakta hai —
--  is table ki dobara zaroorat nahi padegi.)
