-- ════════════════════════════════════════════════════════════════════════════
-- ORDER_FORM_MIGRATION.sql — Sales › Order Form (order-form.html)
-- ----------------------------------------------------------------------------
-- Replaces the Google Sheet + Apps Script backend of orderForm/OrderForm.html.
-- One table per old sheet tab, same columns in the same order:
--
--   Sheet tab          →  table
--   Order Log          →  sales_orders           (+ full_order jsonb = "Full Order JSON")
--   Product Details    →  sales_order_products
--   Trims & Packing    →  sales_order_trims
--   Dropdown Master    →  sales_dropdowns         (one row per key/value)
--   Standard Items     →  sales_standard_items
--   Emboss Designs     →  sales_emboss_designs
--   Users              →  sales_users             (password is bcrypt-hashed by a trigger)
--
-- Reads are open to the anon key (same as the rest of the ERP). Every WRITE goes
-- through a SECURITY DEFINER RPC that checks the logged-in Order Form user's
-- session token and role (same ROLE_PERMISSIONS matrix the form uses).
-- Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

-- ── USERS ───────────────────────────────────────────────────────────────────
create table if not exists public.sales_users (
  username   text primary key,
  password   text not null,
  role       text not null default 'viewer',
  active     boolean not null default true,
  signature  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.sales_users is
  'Order Form logins (was the "Users" sheet). Type a PLAIN password in the Table Editor — the trigger bcrypt-hashes it on save. role: admin / manager / executive / data_entry / viewer. signature = base64 PNG drawn on first login.';
create unique index if not exists sales_users_username_lower on public.sales_users (lower(username));

create or replace function public.sales_users_hash_pw()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.password is not null and new.password !~ '^\$2[abxy]\$\d\d\$' then
    new.password := extensions.crypt(new.password, extensions.gen_salt('bf'));
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists sales_users_hash_pw on public.sales_users;
create trigger sales_users_hash_pw before insert or update on public.sales_users
  for each row execute function public.sales_users_hash_pw();

create table if not exists public.sales_sessions (
  token      uuid primary key default gen_random_uuid(),
  username   text not null references public.sales_users(username) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'   -- slid forward by sales_whoami on every page load
);

-- normalizeRole() from code.gs — any spelling/casing → the exact client key
create or replace function public.sales_normalize_role(raw text)
returns text language sql immutable set search_path = pg_catalog, public as $$
  select coalesce((
    jsonb_build_object(
      'admin','admin','administrator','admin',
      'manager','manager','mgr','manager',
      'executive','executive','exec','executive','sales','executive',
      'data_entry','data_entry','data_entry_operator','data_entry','dataentry','data_entry','entry','data_entry','operator','data_entry',
      'viewer','viewer','view','viewer','readonly','viewer','read_only','viewer'
    ) ->> regexp_replace(lower(trim(coalesce(raw,''))), '[\s_-]+', '_', 'g')
  ), 'viewer');
$$;

-- ROLE_PERMISSIONS from the form
create or replace function public.sales_can_(p_role text, p_action text)
returns boolean language sql immutable set search_path = pg_catalog, public as $$
  select case p_role
    when 'admin'      then p_action in ('create','edit','status','view')
    when 'manager'    then p_action in ('create','edit','status','view')
    when 'executive'  then p_action in ('create','edit','view')
    when 'data_entry' then p_action in ('create','view')
    else p_action = 'view' end;
$$;

create or replace function public.sales_session_(p_token uuid, out o_username text, out o_role text)
language sql stable security definer set search_path = pg_catalog, public as $$
  select u.username, public.sales_normalize_role(u.role)
    from public.sales_sessions s join public.sales_users u on u.username = s.username
   where s.token = p_token and s.expires_at > now() and u.active;
$$;
revoke execute on function public.sales_session_(uuid) from public, anon, authenticated;

create or replace function public.sales_login(p_username text, p_password text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare u public.sales_users; tok uuid;
begin
  select * into u from public.sales_users where lower(username) = lower(trim(coalesce(p_username,'')));
  if not found or u.password <> extensions.crypt(coalesce(p_password,''), u.password) then
    return jsonb_build_object('success', false, 'error', 'Invalid username or password.');
  end if;
  if not u.active then
    return jsonb_build_object('success', false, 'error', 'Account disabled. Contact admin.');
  end if;
  delete from public.sales_sessions where expires_at < now();
  insert into public.sales_sessions(username) values (u.username) returning token into tok;
  return jsonb_build_object('success', true, 'username', u.username,
    'role', public.sales_normalize_role(u.role), 'token', tok);
end $$;

-- Page reload keeps the user signed in (until an explicit Logout): each call
-- slides the session 30 days forward.
create or replace function public.sales_whoami(p_token uuid)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare s record;
begin
  select * into s from public.sales_session_(p_token);
  if s.o_username is null then return jsonb_build_object('success', false); end if;
  update public.sales_sessions set expires_at = greatest(expires_at, now() + interval '30 days')
   where token = p_token;
  return jsonb_build_object('success', true, 'username', s.o_username, 'role', s.o_role);
end $$;

create or replace function public.sales_logout(p_token uuid)
returns void language sql security definer set search_path = pg_catalog, public as $$
  delete from public.sales_sessions where token = p_token;
$$;

create or replace function public.sales_get_signature(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare s record; sig text;
begin
  select * into s from public.sales_session_(p_token);
  if s.o_username is null then return jsonb_build_object('success', false, 'error', 'Session expired — please login again.'); end if;
  select signature into sig from public.sales_users where username = s.o_username;
  return jsonb_build_object('success', true, 'signatureData', coalesce(sig, ''));
end $$;

create or replace function public.sales_save_signature(p_token uuid, p_signature text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare s record;
begin
  select * into s from public.sales_session_(p_token);
  if s.o_username is null then return jsonb_build_object('success', false, 'error', 'Session expired — please login again.'); end if;
  update public.sales_users set signature = coalesce(p_signature, '') where username = s.o_username;
  return jsonb_build_object('success', true);
end $$;

-- ── ORDER LOG ───────────────────────────────────────────────────────────────
create table if not exists public.sales_orders (
  id              uuid primary key default gen_random_uuid(),
  saved_at        timestamptz not null default now(),
  order_no        text not null unique,
  order_date      text,
  sale_channel    text default 'Direct Sale',
  agency_name     text,
  agency_contact  text,
  agency_mobile   text,
  buyer_name      text not null,
  contact_person  text,
  mobile          text,
  address         text,
  gstin           text,
  payment_terms   text,
  delivery_terms  text,
  total_products  integer default 0,
  total_qty       numeric default 0,
  ex_gst          numeric default 0,
  gst             numeric default 0,
  grand_total     numeric default 0,
  pdf_url         text,
  status          text not null default 'Saved',
  transport_name  text,
  full_order      jsonb,
  out_of_haryana  boolean default false,
  pdf_path        text,
  pdf_file_name   text,
  created_by      text,
  updated_by      text,
  created_at      timestamptz not null default now()
);
comment on table public.sales_orders is 'Order Form › Order Log. full_order = the exact submitted payload (photos stripped) used by the Edit button.';
create index if not exists sales_orders_saved_at on public.sales_orders (saved_at desc);
create index if not exists sales_orders_buyer on public.sales_orders (buyer_name);

-- ── PRODUCT DETAILS ─────────────────────────────────────────────────────────
create table if not exists public.sales_order_products (
  id                   bigserial primary key,
  order_id             uuid not null references public.sales_orders(id) on delete cascade,
  saved_at             timestamptz not null default now(),
  order_no             text not null,
  buyer_name           text,
  line_no              integer,
  fabric_name          text,
  category             text,
  weight_kg            numeric,
  size                 text,
  dbsb                 text,
  ply                  text,
  sattan               text,
  moq                  text,
  emboss               text,
  design_details       text,
  no_of_packs          numeric,
  packing_pcs_per_pack numeric,
  qty_pcs              numeric,
  packing_type         text,
  price_per_kg         numeric,
  discount_pct         numeric,
  eff_price_per_kg     numeric,
  trims_per_pc         numeric,
  final_per_qty        numeric,
  total_ex_gst         numeric,
  total_incl_gst       numeric,
  total_weight_kg      numeric,
  fabric_cost          numeric,
  gst_pct              numeric,
  pack_charge          numeric,
  remarks              text,
  design_cost_comment  text,
  photo_link           text,
  label_tag_comment    text,
  emboss_photo_link    text,
  item_code            text
);
create index if not exists sales_order_products_order on public.sales_order_products (order_id);

-- ── TRIMS & PACKING ─────────────────────────────────────────────────────────
create table if not exists public.sales_order_trims (
  id                 bigserial primary key,
  order_id           uuid not null references public.sales_orders(id) on delete cascade,
  saved_at           timestamptz not null default now(),
  order_no           text not null,
  buyer_name         text,
  prod_no            integer,
  fabric             text,
  packing_type       text,
  label              text, tag text, bag text, bore text, inner_box text, outer_box text,
  label_pcs          numeric, tag_pcs numeric, bag_pcs numeric, bore_pcs numeric, inner_box_pcs numeric, outer_box_pcs numeric,
  label_rs           numeric, tag_rs numeric, bag_rs numeric, bore_rs numeric, inner_box_rs numeric, outer_box_rs numeric,
  total_trims_rs     numeric,
  pkg_charge_pcs     numeric,
  pkg_charge_cost_pc numeric,
  total_pkg_charge   numeric,
  label_disc         numeric, tag_disc numeric, bag_disc numeric, bore_disc numeric, inner_disc numeric, outer_disc numeric
);
create index if not exists sales_order_trims_order on public.sales_order_trims (order_id);

-- ── DROPDOWN MASTER ─────────────────────────────────────────────────────────
create table if not exists public.sales_dropdowns (
  id         bigserial primary key,
  key        text not null,
  value      text not null,
  created_at timestamptz not null default now(),
  unique (key, value)
);
comment on table public.sales_dropdowns is 'Order Form › Dropdown Master. key = buyerName / agencyName / fabricCode / category / size / dbsb / sattan / moq / deliveryTerms / paymentTerms / design. New values typed on the form are learned automatically.';

-- ── STANDARD ITEMS ──────────────────────────────────────────────────────────
create table if not exists public.sales_standard_items (
  item_code       text primary key,
  fabric_name     text,
  category        text,
  weight_kg       numeric default 0,
  size            text,
  dbsb            text default 'DB',
  ply             text default 'SP',
  sattan          text,
  moq             text,
  emboss          text default 'NO',
  price_per_kg    numeric default 0,
  packing_pcs     numeric default 0,
  label_price     numeric default 0,
  tag_price       numeric default 0,
  bag_price       numeric default 0,
  bore_price      numeric default 0,
  inner_box_price numeric default 0,
  outer_box_price numeric default 0,
  bale_price      numeric default 0,
  created_at      timestamptz not null default now()
);
comment on table public.sales_standard_items is 'Order Form › Standard Items. Selecting an Item Code auto-fills specs, price and trim costs. Brand-new codes are learned on submit; existing rows are never overwritten by an order.';
create unique index if not exists sales_standard_items_upper on public.sales_standard_items (upper(item_code));

-- ── EMBOSS DESIGNS ──────────────────────────────────────────────────────────
create table if not exists public.sales_emboss_designs (
  id          bigserial primary key,
  design_name text not null,
  image_url   text not null,
  image_path  text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
comment on table public.sales_emboss_designs is 'Order Form › Emboss Designs catalog. image_url should be a Supabase Storage public URL (bucket sales-orders) so it can be embedded in the PDF.';

-- ── RLS: read open (ERP convention), writes only through the RPCs below ─────
do $$
declare t text;
begin
  foreach t in array array['sales_orders','sales_order_products','sales_order_trims',
                           'sales_dropdowns','sales_standard_items','sales_emboss_designs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
  end loop;
end $$;
alter table public.sales_users    enable row level security;   -- no policies: RPC only
alter table public.sales_sessions enable row level security;   -- no policies: RPC only

-- ── NEXT ORDER NO — getNextOrderNo() from code.gs: SIHF/<year>-27/<max+1, 3 digits> ──
create or replace function public.sales_next_order_no()
returns text language sql stable security definer set search_path = pg_catalog, public as $$
  with seqs as (
    select nullif(substring(parts[array_length(parts,1)] from '^\d+'), '')::int as seq
      from (select string_to_array(trim(order_no), '/') as parts from public.sales_orders) x
     where array_length(parts,1) >= 3
  ), nxt as (select coalesce(max(seq), 0) + 1 as n from seqs)
  select 'SIHF/' || extract(year from (now() at time zone 'Asia/Kolkata'))::int || '-27' || '/' ||
         case when length(n::text) >= 3 then n::text else lpad(n::text, 3, '0') end
    from nxt;
$$;

-- ── SAVE ORDER — doPost(): delete old rows on Edit, then Order Log + Product
--    Details + Trims & Packing, all in ONE transaction ─────────────────────────
create or replace function public.sales_save_order(p_token uuid, p_order jsonb, p_products jsonb, p_trims jsonb, p_is_edit boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  s record; v_id uuid; v_now timestamptz := now();
  v_no text := trim(coalesce(p_order->>'order_no',''));
  o public.sales_orders;
begin
  select * into s from public.sales_session_(p_token);
  if s.o_username is null then
    return jsonb_build_object('success', false, 'code', 'AUTH', 'error', 'Session expired — please login again.');
  end if;
  if not public.sales_can_(s.o_role, case when p_is_edit then 'edit' else 'create' end) then
    return jsonb_build_object('success', false, 'error', 'Your role (' || s.o_role || ') does not have ' ||
      case when p_is_edit then 'Edit' else 'Submit' end || ' permission');
  end if;
  if v_no = '' or v_no in ('Loading...','OFFLINE') then
    return jsonb_build_object('success', false, 'error', 'Order No missing — reload the page.');
  end if;

  o := jsonb_populate_record(null::public.sales_orders, p_order);

  if p_is_edit then
    select id into v_id from public.sales_orders where order_no = v_no;
  elsif exists (select 1 from public.sales_orders where order_no = v_no) then
    return jsonb_build_object('success', false, 'code', 'DUPLICATE',
      'error', 'Order No ' || v_no || ' already exists', 'nextOrderNo', public.sales_next_order_no());
  end if;

  if v_id is null then
    insert into public.sales_orders (saved_at, order_no, order_date, sale_channel, agency_name, agency_contact,
      agency_mobile, buyer_name, contact_person, mobile, address, gstin, payment_terms, delivery_terms,
      total_products, total_qty, ex_gst, gst, grand_total, status, transport_name, full_order,
      out_of_haryana, created_by, updated_by)
    values (v_now, v_no, o.order_date, coalesce(nullif(o.sale_channel,''),'Direct Sale'), o.agency_name, o.agency_contact,
      o.agency_mobile, o.buyer_name, o.contact_person, o.mobile, o.address, o.gstin, o.payment_terms, o.delivery_terms,
      o.total_products, o.total_qty, o.ex_gst, o.gst, o.grand_total, 'Saved', o.transport_name, o.full_order,
      coalesce(o.out_of_haryana,false), s.o_username, s.o_username)
    returning id into v_id;
  else
    -- Edit = one version per Order No (old product/trim rows removed, status back to "Saved")
    update public.sales_orders set saved_at = v_now, order_date = o.order_date,
      sale_channel = coalesce(nullif(o.sale_channel,''),'Direct Sale'), agency_name = o.agency_name,
      agency_contact = o.agency_contact, agency_mobile = o.agency_mobile, buyer_name = o.buyer_name,
      contact_person = o.contact_person, mobile = o.mobile, address = o.address, gstin = o.gstin,
      payment_terms = o.payment_terms, delivery_terms = o.delivery_terms, total_products = o.total_products,
      total_qty = o.total_qty, ex_gst = o.ex_gst, gst = o.gst, grand_total = o.grand_total,
      pdf_url = null, pdf_path = null, pdf_file_name = null, status = 'Saved',
      transport_name = o.transport_name, full_order = o.full_order,
      out_of_haryana = coalesce(o.out_of_haryana,false), updated_by = s.o_username
    where id = v_id;
    delete from public.sales_order_products where order_id = v_id;
    delete from public.sales_order_trims    where order_id = v_id;
  end if;

  insert into public.sales_order_products (order_id, saved_at, order_no, buyer_name, line_no, fabric_name, category,
    weight_kg, size, dbsb, ply, sattan, moq, emboss, design_details, no_of_packs, packing_pcs_per_pack, qty_pcs,
    packing_type, price_per_kg, discount_pct, eff_price_per_kg, trims_per_pc, final_per_qty, total_ex_gst,
    total_incl_gst, total_weight_kg, fabric_cost, gst_pct, pack_charge, remarks, design_cost_comment, photo_link,
    label_tag_comment, emboss_photo_link, item_code)
  select v_id, v_now, v_no, o.buyer_name, x.line_no, x.fabric_name, x.category,
    x.weight_kg, x.size, x.dbsb, x.ply, x.sattan, x.moq, x.emboss, x.design_details, x.no_of_packs, x.packing_pcs_per_pack, x.qty_pcs,
    x.packing_type, x.price_per_kg, x.discount_pct, x.eff_price_per_kg, x.trims_per_pc, x.final_per_qty, x.total_ex_gst,
    x.total_incl_gst, x.total_weight_kg, x.fabric_cost, x.gst_pct, x.pack_charge, x.remarks, x.design_cost_comment, x.photo_link,
    x.label_tag_comment, x.emboss_photo_link, x.item_code
  from jsonb_populate_recordset(null::public.sales_order_products, coalesce(p_products,'[]'::jsonb)) x;

  insert into public.sales_order_trims (order_id, saved_at, order_no, buyer_name, prod_no, fabric, packing_type,
    label, tag, bag, bore, inner_box, outer_box,
    label_pcs, tag_pcs, bag_pcs, bore_pcs, inner_box_pcs, outer_box_pcs,
    label_rs, tag_rs, bag_rs, bore_rs, inner_box_rs, outer_box_rs,
    total_trims_rs, pkg_charge_pcs, pkg_charge_cost_pc, total_pkg_charge,
    label_disc, tag_disc, bag_disc, bore_disc, inner_disc, outer_disc)
  select v_id, v_now, v_no, o.buyer_name, x.prod_no, x.fabric, x.packing_type,
    x.label, x.tag, x.bag, x.bore, x.inner_box, x.outer_box,
    x.label_pcs, x.tag_pcs, x.bag_pcs, x.bore_pcs, x.inner_box_pcs, x.outer_box_pcs,
    x.label_rs, x.tag_rs, x.bag_rs, x.bore_rs, x.inner_box_rs, x.outer_box_rs,
    x.total_trims_rs, x.pkg_charge_pcs, x.pkg_charge_cost_pc, x.total_pkg_charge,
    x.label_disc, x.tag_disc, x.bag_disc, x.bore_disc, x.inner_disc, x.outer_disc
  from jsonb_populate_recordset(null::public.sales_order_trims, coalesce(p_trims,'[]'::jsonb)) x;

  return jsonb_build_object('success', true, 'id', v_id, 'orderNo', v_no, 'savedAt', v_now);
end $$;

-- writePdfLink()
create or replace function public.sales_set_order_pdf(p_token uuid, p_order_no text, p_url text, p_path text, p_file_name text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare s record; n int;
begin
  select * into s from public.sales_session_(p_token);
  if s.o_username is null then return jsonb_build_object('success', false, 'error', 'Session expired — please login again.'); end if;
  update public.sales_orders set pdf_url = p_url, pdf_path = p_path, pdf_file_name = p_file_name
   where order_no = p_order_no;
  get diagnostics n = row_count;
  return jsonb_build_object('success', n > 0);
end $$;

-- updateOrderStatusByRow()
create or replace function public.sales_update_status(p_token uuid, p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare s record; n int;
begin
  select * into s from public.sales_session_(p_token);
  if s.o_username is null then return jsonb_build_object('success', false, 'error', 'Session expired — please login again.'); end if;
  if not public.sales_can_(s.o_role, 'status') then
    return jsonb_build_object('success', false, 'error', 'Your role (' || s.o_role || ') does not have Status-change permission');
  end if;
  update public.sales_orders set status = p_status, updated_by = s.o_username where id = p_id;
  get diagnostics n = row_count;
  if n = 0 then
    return jsonb_build_object('success', false, 'error', 'Order row not found — it may have been deleted. Refresh Order History and try again.');
  end if;
  return jsonb_build_object('success', true);
end $$;

-- updateDropdowns() + updateStandardItems() — learn new values, never overwrite
create or replace function public.sales_learn_masters(p_token uuid, p_drops jsonb, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare s record; nd int; ni int;
begin
  select * into s from public.sales_session_(p_token);
  if s.o_username is null then return jsonb_build_object('success', false, 'error', 'Session expired'); end if;

  insert into public.sales_dropdowns (key, value)
  select distinct trim(d->>'key'), trim(d->>'value')
    from jsonb_array_elements(coalesce(p_drops,'[]'::jsonb)) d
   where coalesce(trim(d->>'key'),'') <> '' and coalesce(trim(d->>'value'),'') <> ''
  on conflict (key, value) do nothing;
  get diagnostics nd = row_count;

  insert into public.sales_standard_items (item_code, fabric_name, category, weight_kg, size, dbsb, ply, sattan, moq,
    emboss, price_per_kg, packing_pcs, label_price, tag_price, bag_price, bore_price, inner_box_price, outer_box_price, bale_price)
  select distinct on (upper(trim(x.item_code))) trim(x.item_code), x.fabric_name, x.category, x.weight_kg, x.size,
    x.dbsb, x.ply, x.sattan, x.moq, x.emboss, x.price_per_kg, x.packing_pcs, x.label_price, x.tag_price, x.bag_price,
    x.bore_price, x.inner_box_price, x.outer_box_price, x.bale_price
    from jsonb_populate_recordset(null::public.sales_standard_items, coalesce(p_items,'[]'::jsonb)) x
   where coalesce(trim(x.item_code),'') <> ''
     and not exists (select 1 from public.sales_standard_items si where upper(si.item_code) = upper(trim(x.item_code)))
  on conflict do nothing;
  get diagnostics ni = row_count;

  return jsonb_build_object('success', true, 'dropdownsAdded', nd, 'itemsAdded', ni);
end $$;

-- Emboss catalog — admin adds a design from the form
create or replace function public.sales_add_emboss_design(p_token uuid, p_name text, p_url text, p_path text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare s record; v_id bigint;
begin
  select * into s from public.sales_session_(p_token);
  if s.o_username is null then return jsonb_build_object('success', false, 'error', 'Session expired'); end if;
  if s.o_role <> 'admin' then return jsonb_build_object('success', false, 'error', 'Only admin can add catalog designs'); end if;
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_url),'') = '' then
    return jsonb_build_object('success', false, 'error', 'Design name and image are required');
  end if;
  insert into public.sales_emboss_designs (design_name, image_url, image_path) values (trim(p_name), p_url, p_path)
  returning id into v_id;
  return jsonb_build_object('success', true, 'id', v_id);
end $$;

-- ── STORAGE: product / emboss photos + order PDFs ───────────────────────────
insert into storage.buckets (id, name, public) values ('sales-orders', 'sales-orders', true)
on conflict (id) do nothing;
drop policy if exists sales_orders_files_read  on storage.objects;
drop policy if exists sales_orders_files_write on storage.objects;
drop policy if exists sales_orders_files_update on storage.objects;
create policy sales_orders_files_read  on storage.objects for select to anon, authenticated using (bucket_id = 'sales-orders');
create policy sales_orders_files_write on storage.objects for insert to anon, authenticated with check (bucket_id = 'sales-orders');
create policy sales_orders_files_update on storage.objects for update to anon, authenticated using (bucket_id = 'sales-orders') with check (bucket_id = 'sales-orders');

-- ── SEED: Dropdown Master defaults (same lists the form falls back to) ──────
insert into public.sales_dropdowns (key, value)
select k, v from (values
  ('dbsb','DB'),('dbsb','DP'),('dbsb','SB'),('dbsb','SS'),('dbsb','SC'),
  ('fabricCode','2900'),('fabricCode','3100'),('fabricCode','3500'),('fabricCode','4000'),
  ('category','SEMI CLOUDY'),('category','SUPER SOFT'),('category','MINK'),('category','DOUBLE LAYER'),
  ('category','SHERPA'),('category','POLAR FLEECE'),('category','CLOUDY'),
  ('size','210×230 CM'),('size','150×200 CM'),('size','200×220 CM'),('size','220×240 CM'),('size','60×90 CM (Baby)'),
  ('sattan','5" PREMIUM'),('sattan','4" STANDARD'),('sattan','3" BASIC'),
  ('moq','500 PCS/Colour'),('moq','1000 PCS/Colour'),('moq','2000 PCS/Colour'),
  ('deliveryTerms','1st Week of July 2026'),('deliveryTerms','2nd Week of July 2026'),
  ('deliveryTerms','August 2026'),('deliveryTerms','September 2026'),
  ('paymentTerms','30% Advance | Balance Before Dispatch'),('paymentTerms','50% Advance | Balance Before Dispatch'),
  ('paymentTerms','100% Advance'),('paymentTerms','Credit (Pre-approved)'),
  ('design','5 New Designs Single Matching Each Design'),('design','3 New Designs'),('design','Custom Design')
) d(k, v)
on conflict (key, value) do nothing;

-- ── SEED: first admin login (change the password in Table Editor → sales_users) ──
insert into public.sales_users (username, password, role, active)
values ('admin', 'SarvOrder@2026', 'admin', true)
on conflict (username) do nothing;
