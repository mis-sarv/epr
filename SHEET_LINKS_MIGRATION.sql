-- ════════════════════════════════════════════════════════════════════
--  SHEET_LINKS_MIGRATION.sql : per-user storage for "google sheet links.html"
--  ────────────────────────────────────────────────────────────────────
--  Before this, every user shared ONE list kept in a Google Apps Script
--  sheet, so anyone's edit changed everybody's buttons. Now each ERP user
--  has their own list, one row per user in `public.sheet_links`.
--
--  The table is NOT readable or writable directly (RLS on, no policies,
--  grants revoked). The page only goes through the two functions below,
--  and both resolve the user from the launcher's session token via
--  `erp_app_session()`. So a user can only ever read or write their own
--  row, and only while their session is valid and the app
--  (HOME_SHEET_LINKS) is allowed for them; the client never says
--  "I am user X".
--
--  Needs UNIFIED_USERS_MIGRATION.sql (erp_app_session). Safe to re-run.
--  Run in the Supabase SQL Editor.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.sheet_links (
  user_id    text primary key,          -- app_users.id (as text, like the session)
  user_name  text,                      -- only to make the table readable for the Admin
  data       jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.sheet_links enable row level security;
revoke all on public.sheet_links from anon, authenticated;

-- ── Read my list ─────────────────────────────────────────────────────
create or replace function public.sheet_links_get(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s   jsonb;
  uid text;
  r   public.sheet_links%rowtype;
begin
  s := to_jsonb(public.erp_app_session(p_token => p_token, p_app => 'HOME_SHEET_LINKS'));
  if coalesce((s->>'success')::boolean, false) is not true then
    return jsonb_build_object('success', false, 'error', coalesce(s->>'error', 'NO_SESSION'));
  end if;
  uid := s->'user'->>'id';
  if uid is null then
    return jsonb_build_object('success', false, 'error', 'NO_SESSION');
  end if;

  select * into r from public.sheet_links where user_id = uid;
  if not found then
    -- `exists:false` lets the page offer the one-time import of the old shared list.
    return jsonb_build_object('success', true, 'exists', false, 'data', '[]'::jsonb);
  end if;
  return jsonb_build_object('success', true, 'exists', true,
                            'data', r.data, 'updated_at', r.updated_at);
end $$;

-- ── Save my list (the whole list; it is small) ───────────────────────
create or replace function public.sheet_links_save(p_token text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s   jsonb;
  uid text;
  ts  timestamptz := now();
begin
  s := to_jsonb(public.erp_app_session(p_token => p_token, p_app => 'HOME_SHEET_LINKS'));
  if coalesce((s->>'success')::boolean, false) is not true then
    return jsonb_build_object('success', false, 'error', coalesce(s->>'error', 'NO_SESSION'));
  end if;
  uid := s->'user'->>'id';
  if uid is null then
    return jsonb_build_object('success', false, 'error', 'NO_SESSION');
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'array' then
    return jsonb_build_object('success', false, 'error', 'BAD_DATA');
  end if;
  -- A few hundred links is a few KB; 512 KB is a guard against junk, not a real limit.
  if octet_length(p_data::text) > 524288 then
    return jsonb_build_object('success', false, 'error', 'TOO_BIG');
  end if;

  insert into public.sheet_links (user_id, user_name, data, updated_at)
  values (uid, s->'user'->>'name', p_data, ts)
  on conflict (user_id) do update
     set data = excluded.data,
         user_name = excluded.user_name,
         updated_at = excluded.updated_at;

  return jsonb_build_object('success', true, 'updated_at', ts);
end $$;

revoke all on function public.sheet_links_get(text)        from public;
revoke all on function public.sheet_links_save(text, jsonb) from public;
grant execute on function public.sheet_links_get(text)        to anon, authenticated;
grant execute on function public.sheet_links_save(text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
