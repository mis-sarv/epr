# Sarv India — Store / Purchase / Production (file layout)

**Zaroori:** ye ab single-file app nahi hai. `Store.html` apne CSS aur JS ko
saath wali files se load karti hai, isi liye **poora folder saath rakhna /
bhejna hai**. Sirf `Store.html` kisi ko mail kar dene se wo khaali khulegi.
(Offline `file://` par chalti hai — classic `<script src>` ko CORS nahi rokta.)

## Files

| File | Kya hai |
|---|---|
| `Store.html` | Desktop app ka markup. ERP shell ka `<link>`/`<script>` sabse aakhir me. |
| `store.css` | Store ka poora stylesheet — pehle ke 5 inline `<style>` blocks, document order me. **Order load-bearing hai, reorder na karein.** |
| `store-core.js` | Store ka poora logic (Inward, Outward, Issue, PR, PO, Reports, Tracker, Master Data, Repair, PDF, roles). |
| `store-design-master.js` | Production › Design Master. `store-core.js` ke `SB` / `escText` / `fetchAllRows` padhta hai, isi liye uske **baad** load hona chahiye. |
| `store-nav-keys.js` | Dono tab bars ka keyboard navigation. |
| `erp-shell.css` | ERP navigation shell ka look (sidebar, topbar, KPI tiles). Sab `#erpShell` ke andar scoped. |
| `erp-shell.js` | ERP sidebar + dashboard + module map. **Sabse aakhir me load hota hai** — `sarvGoHome` / `sarvNavigateFromHome` / `activatePanel` ko wrap karta hai. |
| `mobile.html` | Mobile approval app ka markup. |
| `mobile.css` / `mobile-core.js` | Uska style aur logic. |
| `DESIGN_MASTER_MIGRATION.sql` | Design Master ke do table + storage policies. Supabase › SQL Editor me **ek baar** chalayein. |
| `DROPDOWN_MASTER_MIGRATION.sql` | `sales_dropdowns` table + unique index + RLS. Master Data › 🔽 Dropdown Master ke liye. **Ek baar** chalayein. |
| `DESIGN_SUPPLIER_MIGRATION.sql` | `design_master.supplier_name` column. Design Master ke Supplier Name field ke liye. **Ek baar** chalayein. |
| `PURCHASE_TRACKING_VIEW.sql` | `v_purchase_tracking` view — PR → PO → Receiving → Requester ki flat tracking sheet (item lines nahi, sirf totals). Neeche dekhein. |
| `_backup_before_erp_split/` | Split se pehle ki original single-file `Store.html` aur `mobile.html`. |

## Script load order — na badlein

```html
store-core.js  →  store-design-master.js  →  store-nav-keys.js  →  erp-shell.js
```

Teeno classic scripts ek hi global lexical scope share karte hain: baad wali
files pehli wali ke top-level `const` / `let` (`SB`, `SB_READY`, `escText`,
`fetchAllRows`, `sarvCurrentRole`…) seedha padhti hain. Isi liye:

- `type="module"` **na** lagayein — module ka apna scope hota hai, aur `file://`
  par CORS use block kar deta hai.
- `defer` **na** lagayein — order toot jayega.

## `v_purchase_tracking` — PR se Receiving tak ek hi sheet

Database-side view (`PURCHASE_TRACKING_VIEW.sql`). Ek row = **(PR, PO,
Receiving)**, teeno LEFT — to jis PR par PO nahi bana wo bhi dikhti hai, aur
jis PO par maal nahi aaya wo bhi. **Item lines nahi** hain, sirf totals
(`pr_item_count`, `po_pr_ordered_qty`, `rcv_total_value` …), taaki grain na
toote.

Link app ke Purchase › Follow-Up Report ka theek wahi hai:

| Jodd | Kahan se |
|---|---|
| PR → PO | `purchase_order_lines.req_no` (exact). `linked_req_nos` **sirf** us PO par jiski ek bhi line nahi — `trk_pr_po_link` batata hai kaun sa raasta laga |
| PO → Receipt | `inward_entries.po_number` (comma se judi list) |
| PR → Receipt | `inward_entries.req_no`, sirf us receipt par jo kisi PO se nahi juda |

Kaam ke columns: `trk_stage` (kahan tak pahuncha), `trk_waiting_on` (kiska
intezaar), `trk_days_*` (aging), `trk_pr_*` (PR-level roll-up, har row par
repeat — `select distinct` se PR-wise summary), aur `*_signed` / `*_by` /
`*_at` har approval stage ke.

Do baatein jaan lein:

- **Cancelled receipt** ki row banti hai (`rcv_is_cancelled = true`) par wo
  kisi roll-up me nahi ginti. App jaisa behaviour chahiye to
  `where not rcv_is_cancelled`.
- **Naya column** kisi table me jude to view badalni nahi padti —
  `pr_row` / `po_row` / `rcv_row` jsonb me poori row hai:
  `select pr_row ->> 'naya_column' from v_purchase_tracking`.

Jin columns ka matlab galat samajha ja sakta hai (`pr_gmceo_as`,
`po_md_approved`, `trk_pr_received_value` …) unka `comment on column`
database ke andar hi likha hai.

## Fixed dropdowns ki values kahan se aati hain

**Master Data › 🔽 Dropdown Master.** App ke saare fixed dropdowns ki values ek
hi table me hain — `sales_dropdowns (key, value)`, wahi table jo Sales › Order
Form bhi padhti hai. Isi liye ERP ke apne keys `erp_` se shuru hote hain aur
Order Form ke purane generic keys (`category`, `size`, `moq`, `design` …) jaise
the waise hi hain; dono ek doosre ko overwrite nahi karte.

Do niyam — aur inhi ki wajah se migration chalane se app ka behaviour **bilkul
nahi badalta**:

| Table me us key ki rows | Kya chalta hai |
|---|---|
| ek bhi row hai | **wahi list** — code ka default poora ignore |
| koi row nahi | code ka default (jo pehle hardcoded tha) |

Add / edit / remove / kram badalna sirf **Admin** login se, sirf is screen se
(koi SQL nahi). Pehli value add karte hi us key ke baaki defaults bhi apne aap
table me aa jaate hain, warna list ek-value ki reh jaati.

Naya dropdown jodna ho to `store-core.js` ke `SARV_DROPDOWNS` me ek entry
jodein: `key`, `label`, `def` (aaj ka hardcoded default) aur jo `selects` /
`datalists` use list se bharni hain. Jahan option ka value aur screen-text alag
hain (jaise Inward ka `Repaired` → "Return"), wahan `labels` map use karein —
database me value hi jaati hai.

Design Master ke pickers isi se feed hote hain (`store-design-master.js` ka
`dmFixed()` / `DM_DD_KEY`), aur Home page ka Nature chooser bhi
(`sarvNatureOpts_`) — to list ek hi jagah badalti hai.

## Sidebar me kaunsa module kisko dikhe

**Master Data › Settings › Admin Panel › Tab Visibility › 🏢 ERP Shell ›
Sidebar Modules** — har module ki ek row, har role ka ek column. Off karne par
wo module us role ke sidebar se poora hat jaata hai (Coming Soon wale bhi).

Do level hain, aur dono alag kaam karte hain:

| Level | Kahan | Kya karta hai |
|---|---|---|
| Module | `🏢 ERP Shell › Sidebar Modules` (`ERP_*`) | Sidebar ka button dikhe ya na dikhe |
| Screen | `🏠 Home Page` (`HOME_*`) | Us screen par haq hai ya nahi — sidebar ka leaf yahi padhta hai |

To module ON + screen OFF ka matlab: module dikhega, par us screen ka leaf
nahi. Aur `ERP_*` row sirf chhupati hai — screen ka asli pehra `HOME_*` hi hai,
isi liye sidebar se kisi ko extra access nahi mil sakta.

Default: sab modules sabko, `Administration` sirf Admin ko. Save dabate hi
sidebar redraw ho jaata hai (`sarvApplyAccess` se juda hai) — reload nahi
karna padta. Naya module `erp-shell.js` ke `MODULES` me jode to uski
`ERP_<key>` row `store-core.js` ke `SARV_TABS` me bhi jodein, warna wo hamesha
dikhta rahega.

## ERP shell hatana ho to

`Store.html` se do line hata dein — `<link rel="stylesheet" href="erp-shell.css">`
aur `<script src="erp-shell.js"></script>`. Purana tile wala Home screen wapas
aa jayega; baaki kuch nahi badlega, kyunki shell ne `store-core.js` me ek line
bhi nahi chhedi.
