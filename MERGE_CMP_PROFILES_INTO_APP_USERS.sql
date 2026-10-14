-- ════════════════════════════════════════════════════════════════════════
-- MERGE_CMP_PROFILES_INTO_APP_USERS.sql
-- `cmp_profiles` TABLE hatakar uske saare column `app_users` me
-- ════════════════════════════════════════════════════════════════════════
--
-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  ⛔  YE FILE CHAL CHUKI HAI — DOBARA MAT CHALAYEIN                  ║
-- ║                                                                      ║
-- ║  Iske baad MERGE_PROFILE_IDS_INTO_APP_USER_ID.sql bhi chal gayi,    ║
-- ║  jisne `cmp_profile_id` aur `pk_profile_id` column HATA diye. Ye    ║
-- ║  file unhi columns par likhi hai, isi liye ab chalane par yahi      ║
-- ║  error aata hai:                                                     ║
-- ║                                                                      ║
-- ║     column "cmp_profile_id" of relation "app_users" does not exist  ║
-- ║                                                                      ║
-- ║  Ye KHARABI NAHI hai — kaam pehle se poora ho chuka hai. Aaj ki     ║
-- ║  sahi haalat:                                                        ║
-- ║     cmp_profiles  = VIEW (app_users se, 56 rows)                    ║
-- ║     app_users.id  = wahi auth.users.id (ek hi pehchaan)             ║
-- ║     14 cmp_* FK   = app_users(id) par                               ║
-- ║                                                                      ║
-- ║  Ye file sirf ITIHAAS ke liye rakhi hai (rollback section 9 me).    ║
-- ║  Niche ka block ise galti se chalne se rokta hai.                   ║
-- ╚══════════════════════════════════════════════════════════════════════╝
do $guard$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='app_users'
                    and column_name='cmp_profile_id') then
    raise exception
      'RUK GAYE: ye file pehle hi chal chuki hai aur ab purani pad gayi hai (cmp_profile_id column hata diya gaya). Kuch chalane ki zaroorat nahi — cmp_profiles ab VIEW hai aur app_users.id hi ek pehchaan hai.';
  end if;
end
$guard$;
--
-- Ye file LIVE database par chalayi gayi thi aur verify bhi hui thi.
-- Rollback section 9 me hai.
--
-- ── Pehle poori jaanch ki gayi ──────────────────────────────────────────
--   `cmp_profiles` par 13 FOREIGN KEY tike hue hain aur 12 FUNCTION use
--   padhte hain. Isi liye use seedha `drop` karna Complaint App ko poora
--   band kar deta — 250 machine complaints, 347 tab-seen, 38 reminders,
--   6 notice aur 4 tasks sab unhi pointers par chalte hain.
--
--   Isi liye raasta ye hai:
--
--     1. Data `app_users` me aa jaata hai (yani column ek hi table me).
--     2. 13 FK `auth.users(id)` par chale jaate hain. `cmp_profiles.id`
--        hamesha auth user ka id hi tha (use `cmp_handle_new_auth_user`
--        trigger bharta hai), isi liye integrity GHATTI NAHI — balki ab
--        wo asli pehchaan ke source par tiki hai.
--     3. `cmp_profiles` naam ki ek VIEW bachti hai, jo `app_users` se
--        banti hai. Isi wajah se wo 12 function (`cmp_is_admin`,
--        `cmp_my_role`, `cmp_tasks_stamp_new`, `cmp_nb_stamp_owner` …)
--        aur complaint.html ke ~8 query bina ek line badle chalte rehte
--        hain. VIEW me data nahi hota — asli jagah sirf `app_users` hai,
--        yani "do jagah same user" ka masla khatm.
--
--   Ek hi function badla gaya: `cmp_handle_new_auth_user` (wo `insert into
--   cmp_profiles` karta tha). Uska `on conflict (id)` view par kaam nahi
--   karta, isi liye wo ab seedha `app_users` me likhta hai.
--
-- ── Jo saath me theek hua ───────────────────────────────────────────────
--   Ek cmp_profile ("Ankur", 25cb30e1…) kisi app_users row se juda nahi
--   tha, kyunki uska ERP user Admin Panel se delete ho gaya tha. Uski
--   Complaint tasks orphan padi thin. Section 3 aise har profile ke liye
--   `app_users` row bana deti hai, isi liye Complaint App me koi naam
--   gayab nahi hota.
-- ════════════════════════════════════════════════════════════════════════

set search_path = public, extensions, pg_catalog;

-- ════════════════════════════════════════════════════════════════════════
-- 1. Archive — kuch bhi chhedne se pehle poori copy
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public._archive_cmp_profiles as
  select * from public.cmp_profiles;

-- ════════════════════════════════════════════════════════════════════════
-- 2. app_users par cmp ke wo column jinka koi jodidaar nahi tha
-- ════════════════════════════════════════════════════════════════════════
-- name / mobile / department / designation / dob / is_active / created_at /
-- updated_at pehle se hain (user_name / contact_no se map hote hain).
-- Baaki chaar naye:
alter table public.app_users add column if not exists cmp_username       text;
alter table public.app_users add column if not exists cmp_role           text;
alter table public.app_users add column if not exists cmp_host_types     text[];
alter table public.app_users add column if not exists cmp_last_online_at timestamptz;

-- Default wahi jo cmp_profiles par tha, taaki view ke through insert karne
-- par behaviour na badle.
alter table public.app_users alter column cmp_role       set default 'User';
alter table public.app_users alter column cmp_host_types set default '{}'::text[];
/* `role` (ERP role) NOT NULL hai par uska koi default nahi tha. View ke
   through insert me `role` bheja hi nahi ja sakta (wo view me nahi hai),
   isi liye default zaroori hai — warna naya Complaint user banate waqt
   NOT NULL violation aata. */
alter table public.app_users alter column role set default 'CMP_USER';

comment on column public.app_users.cmp_username is
  'Complaint App ka login username (cmp_make_username se bana). Pehle cmp_profiles.username.';
comment on column public.app_users.cmp_role is
  'Complaint App ka apna role — Admin / User / Host / Maintenance / Production Manager. ERP role ALAG hai (app_users.role).';

-- ════════════════════════════════════════════════════════════════════════
-- 3. Jis cmp_profile ka app_users me record nahi, uska bana dein
-- ════════════════════════════════════════════════════════════════════════
-- Warna wo banda view me nahi aata aur Complaint App me uska naam gayab
-- ho jaata (uski purani tasks / complaints ke pointer bane rehte hain).
insert into public.app_users
  (user_name, role, roles, app_access, contact_no, designation, department,
   dob, is_active, cmp_profile_id, cmp_username, cmp_role, cmp_host_types,
   cmp_last_online_at, created_at)
select upper(btrim(c.name)),
       'CMP_USER', array['CMP_USER'],
       jsonb_build_object('HOME_COMPLAINT_APP', true,
         'HOME_ERP_APP', false, 'HOME_APPROVAL_APP', false,
         'HOME_PACKING', false, 'HOME_ORDER_FORM', false),
       c.mobile, c.designation, c.department, c.dob, c.is_active,
       c.id, c.username, c.role, c.host_types, c.last_online_at, c.created_at
  from public.cmp_profiles c
 where not exists (select 1 from public.app_users u where u.cmp_profile_id = c.id);

-- ════════════════════════════════════════════════════════════════════════
-- 4. Data copy — app_users MASTER hai
-- ════════════════════════════════════════════════════════════════════════
-- cmp ke apne column hamesha cmp se. Jo column dono me hain (naam, mobile,
-- dept, desig, dob) wo app_users me khaali hon to hi bharte hain — kyunki
-- ERP ka record hi master maana gaya hai.
update public.app_users u
   set cmp_username       = c.username,
       cmp_role           = c.role,
       cmp_host_types     = c.host_types,
       cmp_last_online_at = c.last_online_at,
       contact_no  = coalesce(nullif(btrim(u.contact_no),''),  c.mobile),
       designation = coalesce(nullif(btrim(u.designation),''), c.designation),
       department  = coalesce(nullif(btrim(u.department),''),  c.department),
       dob         = coalesce(u.dob, c.dob)
  from public.cmp_profiles c
 where c.id = u.cmp_profile_id;

-- ════════════════════════════════════════════════════════════════════════
-- 5. Unique constraints — wahi jo cmp_profiles par thin
-- ════════════════════════════════════════════════════════════════════════
-- FK isi par jaayenge nahi, par view ke through insert par wahi "pehle se
-- registered hai" wali rok chahiye. Index ke NAAM me 'mobile' / 'username'
-- jaan-boojh kar hai: `cmp_handle_new_auth_user` sqlerrm me yahi dhoondh
-- kar MOBILE_TAKEN / NAME_TAKEN batata hai.
create unique index if not exists app_users_cmp_profile_id_key
  on public.app_users (cmp_profile_id) where cmp_profile_id is not null;

create unique index if not exists app_users_cmp_username_key
  on public.app_users (cmp_username) where cmp_username is not null;

/* Mobile ki uniqueness SIRF complaint users par — poori app_users par
   lagana galat hota: ek hi insaan ke ERP aur Complaint record ka contact
   no. wahi hota hai (jaise ANKUR JI aur Ankur dono 9817754023). */
create unique index if not exists app_users_cmp_mobile_key
  on public.app_users (contact_no) where cmp_profile_id is not null;

-- ════════════════════════════════════════════════════════════════════════
-- 6. 13 FK ko auth.users(id) par le jayein — ON DELETE waisa hi
-- ════════════════════════════════════════════════════════════════════════
-- Haath se likhne ki jagah maujooda constraints padh kar banate hain,
-- taaki kisi ka ON DELETE (CASCADE / SET NULL / NO ACTION) galti se na
-- badal jaaye.
do $fk$
declare r record; v_act text; n int := 0;
begin
  for r in
    select con.conname, src.relname as tbl,
           (select string_agg(quote_ident(a.attname), ',' order by k.ord)
              from unnest(con.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as cols,
           con.confdeltype
      from pg_constraint con
      join pg_class src on src.oid = con.conrelid
      join pg_class tgt on tgt.oid = con.confrelid
     where con.contype = 'f' and tgt.relname = 'cmp_profiles'
  loop
    v_act := case r.confdeltype
               when 'c' then ' on delete cascade'
               when 'n' then ' on delete set null'
               when 'd' then ' on delete set default'
               when 'r' then ' on delete restrict'
               else '' end;
    execute format('alter table public.%I drop constraint %I', r.tbl, r.conname);
    execute format('alter table public.%I add constraint %I foreign key (%s) references auth.users(id)%s',
                   r.tbl, r.conname, r.cols, v_act);
    raise notice 'FK % (%.%) -> auth.users(id)%', r.conname, r.tbl, r.cols, v_act;
    n := n + 1;
  end loop;
  raise notice '% FK auth.users par chale gaye', n;
end
$fk$;

-- ════════════════════════════════════════════════════════════════════════
-- 7. Naya auth user banne par row ab app_users me
-- ════════════════════════════════════════════════════════════════════════
-- Pehle ye `insert into cmp_profiles ... on conflict (id)` karta tha. VIEW
-- par ON CONFLICT nahi chalta (uska koi unique index nahi hota), isi liye
-- ab seedha `app_users` me likhta hai. Baaki tarkeeb hu-ba-hu wahi —
-- self-signup hamesha plain 'User', aur wahi do error naam jo client aur
-- admin-users function match karte hain.
create or replace function public.cmp_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text;
  v_host_types text[];
begin
  if not (m ? 'name') then return new; end if;

  -- Self-signup is always a plain User; only an admin-created account may
  -- carry a role or host types, and those come from the admin-users
  -- function, never from anything the browser can set for itself.
  if (m->>'self_signup') = 'true' then
    v_role := 'User';
    v_host_types := '{}';
  else
    v_role := coalesce(m->>'role', 'User');
    v_host_types := coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(coalesce(m->'host_types','[]'::jsonb))),
      '{}'
    );
  end if;

  begin
    insert into public.app_users
      (cmp_profile_id, user_name, contact_no, department, designation, dob,
       cmp_username, cmp_role, cmp_host_types,
       role, roles, app_access, is_active)
    values (
      new.id,
      upper(btrim(m->>'name')),
      regexp_replace(coalesce(m->>'mobile',''), '\D', '', 'g'),
      coalesce(m->>'department', '—'),
      coalesce(m->>'designation', '—'),
      coalesce((m->>'dob')::date, '1900-01-01'::date),
      public.cmp_make_username(m->>'name'),
      v_role,
      v_host_types,
      -- ERP ki taraf naya banda sirf Complaint App ka user hota hai.
      'CMP_USER', array['CMP_USER'],
      jsonb_build_object('HOME_COMPLAINT_APP', true,
        'HOME_ERP_APP', false, 'HOME_APPROVAL_APP', false,
        'HOME_PACKING', false, 'HOME_ORDER_FORM', false),
      true
    )
    on conflict (cmp_profile_id) where cmp_profile_id is not null do nothing;
  exception
    -- These two messages are matched by name in the client and in the
    -- admin-users function, because GoTrue buries a trigger exception
    -- inside a generic 500 and the real reason never reaches the browser.
    when unique_violation then
      if sqlerrm ilike '%mobile%' then
        raise exception 'MOBILE_TAKEN: Yeh mobile number pehle se registered hai.' using errcode = '23505';
      elsif sqlerrm ilike '%username%' then
        raise exception 'NAME_TAKEN: Yeh naam pehle se registered hai. Thoda alag naam likhein (e.g. middle name bhi).' using errcode = '23505';
      else
        raise;
      end if;
  end;

  return new;
end;
$fn$;

-- ════════════════════════════════════════════════════════════════════════
-- 8. TABLE hatao → usi naam ki VIEW
-- ════════════════════════════════════════════════════════════════════════
-- Column ka naam, kram aur matlab bilkul wahi — isi liye 12 function aur
-- complaint.html bina badle chalte hain.
drop table public.cmp_profiles cascade;

create view public.cmp_profiles as
  select cmp_profile_id     as id,
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
   where cmp_profile_id is not null;

comment on view public.cmp_profiles is
  'VIEW, table nahi — asli data public.app_users me hai. Purane 12 cmp_* function aur complaint.html isi se padhte hain, isi liye unme kuch badalna nahi pada. Dekhein MERGE_CMP_PROFILES_INTO_APP_USERS.sql';

/* Grants pehle se kam rakhe hain: browser ko padhna milta hai aur sirf
   `last_online_at` likhna (wahi heartbeat complaint.html bhejta hai).
   Pehle poori cmp_profiles row anon update kar sakta tha — ab nahi.
   Naye user banane / role badalne ka kaam `admin-users` Edge Function
   service_role se karta hai, isi liye use poora haq hai. */
grant select on public.cmp_profiles to anon, authenticated;
grant update (last_online_at) on public.cmp_profiles to anon, authenticated;
grant select, insert, update, delete on public.cmp_profiles to service_role;

-- ════════════════════════════════════════════════════════════════════════
-- 9. ROLLBACK (zarurat padne par)
-- ════════════════════════════════════════════════════════════════════════
-- drop view public.cmp_profiles;
-- create table public.cmp_profiles as select * from public._archive_cmp_profiles;
-- alter table public.cmp_profiles add primary key (id);
-- alter table public.cmp_profiles add constraint cmp_profiles_mobile_key unique (mobile);
-- alter table public.cmp_profiles add constraint cmp_profiles_username_key unique (username);
-- -- phir 13 FK wapas cmp_profiles(id) par, aur cmp_handle_new_auth_user ka
-- -- purana body (archive ke saath _archive_cmp_handle_fn me rakha hai).
-- notify pgrst, 'reload schema';
--
-- Sab theek chale to kuch hafte baad:
--   drop table public._archive_cmp_profiles;
