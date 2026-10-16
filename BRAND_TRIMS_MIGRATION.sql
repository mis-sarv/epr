-- ============================================================================
--  BRAND_TRIMS_MIGRATION.sql
--  Brand Master me 7 naye MATERIAL (YES / NO) column
-- ============================================================================
--
--  KYUN:
--  Order Form ke "Bags & Trims" table me ab har brand ki apni material list
--  dikhti hai — wahi rows jo Brand Master me us ITEM CODE par YES hain.
--
--  Brand Master me 9 material pehle se the (MICRO LABEL, SMALL LABEL,
--  BIG LABEL, TAG 1, TAG 2, TAG 3, DORI, INSERT CARD, BARCODE STICKER), par
--  Order Form ke 6 purane fixed row (Label / Tag / Bag / Bore / Inner Box /
--  Outer Box) aur FOAM ka koi YES/NO column nahi tha — wo 6 Brand Master me
--  sirf RATE ke roop me the (label_price, bore_price ...), "lagta hai ya
--  nahi" ka jawab kahin nahi tha. Ye migration wahi 7 column jodti hai.
--
--  KAHAN PADHE JAATE HAIN:
--    order-form.html → OF_MATERIALS (har row ka `bm` key)
--    store-core.js   → SARV_BR_FIELDS (ERP ka Brand Master form + table)
--
--  DHYAN — ye chalane se PEHLE: Order Form ka naya code khaali column ko
--  "NO" maanta hai (yahi tay kiya gaya tha), to jab tak ye SQL nahi chalti,
--  Bags & Trims me sirf "Bora Packing Charge" row dikhegi aur table ek note
--  ke saath batayegi ki material list Brand Master se aati hai. SQL chalane
--  ke baad bhi har brand par ye field BHARNE padenge (default khaali = NO) —
--  ERP › Master Data › 🏷️ Brand Master se, ya CSV import se.
--
--  Supabase › SQL Editor me EK BAAR chalayein. Dobara chalana bilkul
--  surakshit hai (ADD COLUMN IF NOT EXISTS).
-- ============================================================================

begin;

-- ── 1. Saat naye column ─────────────────────────────────────────────────────
-- `text` rakha gaya hai, boolean nahi: baaki saare material column (dori,
-- insert_card, micro_label ...) bhi text hain aur 'YES' / 'NO' / 'NA' teen
-- value lete hain (erp_fbmYesNo dropdown). Boolean me 'NA' ka koi jagah nahi
-- hoti, aur dono tarah ke column ek hi table me rakhna CSV import aur form ko
-- do niyam par chalane par majboor kar deta.
-- Default NULL = "bhara nahi gaya" — Order Form ise NO ki tarah padhta hai.

alter table public.brand_master add column if not exists label      text;
alter table public.brand_master add column if not exists tag        text;
alter table public.brand_master add column if not exists bag        text;
alter table public.brand_master add column if not exists bore       text;
alter table public.brand_master add column if not exists inner_box  text;
alter table public.brand_master add column if not exists outer_box  text;
alter table public.brand_master add column if not exists foam       text;

-- ── 2. Column comments ─────────────────────────────────────────────────────
-- Ye comment database ke andar hi rehte hain, isi liye jo banda 6 mahine baad
-- table dekhega use pata chalega ki `bore` aur `bore_price` do alag sawaal
-- hain: ek "lagta hai ya nahi", doosra "kitne ka".

comment on column public.brand_master.label     is 'Order Form > Bags & Trims > Label row. YES/NO/NA. Rate alag column me: label_price.';
comment on column public.brand_master.tag       is 'Order Form > Bags & Trims > Tag row. YES/NO/NA. Rate: tag_price. TAG 1 / 2 / 3 isse alag column hain.';
comment on column public.brand_master.bag       is 'Order Form > Bags & Trims > Bag row. YES/NO/NA. Rate: bag_price.';
comment on column public.brand_master.bore      is 'Order Form > Bags & Trims > Bore row. YES/NO/NA. Rate: bore_price (Pack Type Bale ho to bale_price).';
comment on column public.brand_master.inner_box is 'Order Form > Bags & Trims > Inner Box row. YES/NO/NA. Rate: inner_box_price.';
comment on column public.brand_master.outer_box is 'Order Form > Bags & Trims > Outer Box row. YES/NO/NA. Rate: outer_box_price.';
comment on column public.brand_master.foam      is 'Order Form > Bags & Trims > FOAM row. YES/NO/NA. Iska koi rate column nahi — cost order me bhari jaati hai.';

commit;

-- ============================================================================
--  3. (OPTIONAL) Purane brands par ek baar ki seeding
-- ----------------------------------------------------------------------------
--  Neeche ki queries COMMENTED hain — jaan-boojh kar. Ye "andaaza" lagati
--  hain, aur andaaze se bhara master wo cheez hai jo baad me kisi order par
--  galat trim bhej deti hai. Pehle do-chaar brand par haath se bhar kar
--  dekhein; theek lage to hi ye chalayein.
--
--  A) Jis brand ka RATE bhara hua hai (0 se zyada), uspar wo material YES —
--     "rate kisi ne daala tha" ka matlab aksar "ye lagta hai" hi hota hai.
--
--  update public.brand_master set label     = 'YES' where label     is null and coalesce(label_price,0)     > 0;
--  update public.brand_master set tag       = 'YES' where tag       is null and coalesce(tag_price,0)       > 0;
--  update public.brand_master set bag       = 'YES' where bag       is null and coalesce(bag_price,0)       > 0;
--  update public.brand_master set bore      = 'YES' where bore      is null and coalesce(bore_price,0)      > 0;
--  update public.brand_master set inner_box = 'YES' where inner_box is null and coalesce(inner_box_price,0) > 0;
--  update public.brand_master set outer_box = 'YES' where outer_box is null and coalesce(outer_box_price,0) > 0;
--
--  B) Packing type se Bore / Bag / Inner / Outer —
--     master/slave packing type wahi container batate hain.
--
--  update public.brand_master set bore      = 'YES' where bore      is null and upper(coalesce(master_pack_type,'')) = 'BORA';
--  update public.brand_master set outer_box = 'YES' where outer_box is null and upper(coalesce(master_pack_type,'')) = 'OUTER BOX';
--  update public.brand_master set bag       = 'YES' where bag       is null and upper(coalesce(slave_pack_type,''))  = 'BAG';
--  update public.brand_master set inner_box = 'YES' where inner_box is null and upper(coalesce(slave_pack_type,''))  = 'INNER BOX';
--
--  C) Jo abhi bhi khaali hain unhe saaf 'NO' kar dena (khaali aur NO ka
--     matlab app me ek hi hai, par report / filter me farq dikhta hai).
--
--  update public.brand_master
--     set label     = coalesce(label,'NO'),
--         tag       = coalesce(tag,'NO'),
--         bag       = coalesce(bag,'NO'),
--         bore      = coalesce(bore,'NO'),
--         inner_box = coalesce(inner_box,'NO'),
--         outer_box = coalesce(outer_box,'NO'),
--         foam      = coalesce(foam,'NO')
--   where label is null or tag is null or bag is null or bore is null
--      or inner_box is null or outer_box is null or foam is null;
-- ============================================================================

-- ── 4. Jaanch — chalane ke baad ye chalayein ───────────────────────────────
-- Saaton column aa gaye?
--
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'brand_master'
--      and column_name in ('label','tag','bag','bore','inner_box','outer_box','foam')
--    order by column_name;
--
-- Kis brand par kitne material YES hain (Order Form me utni rows dikhengi,
-- Bora Packing Charge ke alawa):
--
--   select item_code,
--          (select count(*) from (values
--             (label),(tag),(bag),(bore),(inner_box),(outer_box),(foam),
--             (micro_label),(small_label),(big_label),
--             (tag_1),(tag_2),(tag_3),(dori),(insert_card),(barcode_sticker)
--           ) as v(x) where upper(coalesce(x,'')) = 'YES') as yes_materials
--     from public.brand_master
--    where is_active is distinct from false
--    order by yes_materials, item_code;
