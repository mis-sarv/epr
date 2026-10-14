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
| `ORDER_FORM_USERS_MIGRATION.sql` | Order Form ke users ERP ki `app_users` me (ek hi user table): `app_users.sales_role`, `sales_users` mirror + trigger, ERP login se Order Form session (`sales_erp_login`). **Ek baar** chalayein. |
| `printing-lot.html` | Manufacturing › 🖨️ Printing Lot Card (purani "Design Print Manager Pro" + code.gs). `#printingLotPanel` iframe me khulta hai; shop floor par seedha `printing-lot.html#production` bhi. |
| `PRINTING_LOT_MIGRATION.sql` | Printing Lot ke `prl_*` tables, RPCs, views, bucket `printing-lot` + seed (sections, colors, satin codes). **Ek baar** chalayein (APPROVAL_CHAIN_MIGRATION ke baad). |
| `FABRIC_BRAND_MASTER_MIGRATION.sql` | `fabric_master` + `brand_master` + `buyer_master` + `agency_master` + `master_revisions` (REV archive), unique index, triggers, RLS aur do rollup view. Master Data › 🧵 Fabric Master / 🏷️ Brand Master / 🏢 Buyer Master (+ Agency table) ke liye. **Ek baar** chalayein, phir Fabric & Brand screen par 🌱 **Seed Excel Data**. Dobara chalana bhi surakshit hai. Neeche dekhein. |
| `fabric & brand master/SARV INDIA LOT SOFTWARE DATA.xlsx` | Dono master ka source — `FABRIC MASTER` (31 row × 42 column) aur `BRAND MASTER` (65 row × 23 column) sheets. Seed button ki rows isi se nikali hui hain. |
| `UNIFIED_USERS_MIGRATION.sql` | Ek user / kai role (`app_users.roles[]`), per-user app access (`app_users.app_access`), aur saare apps ka ek session (`app_sessions` + `erp_app_login` / `erp_app_session` / `erp_app_logout`). **ADMIN_PANEL_MIGRATION.sql ke baad** ek baar chalayein. Dobara chalana surakshit. Neeche dekhein. |
| `launcher.html` | **Login ke baad ka pehla page.** Naam + PIN, aur phir sirf wahi app buttons jinka access hai (ERP / Approvals / Complaint / Packing / Order Form). Ek hi session banata hai jo saare apps chalate hain. Neeche dekhein. |
| `app-back.js` | Har app me ek hi `<script src>` line — neeche daayein kone me floating **← Apps** button. Khud tay karta hai ki dikhna hai ya nahi: ERP ke iframe ke andar nahi, aur single-login session na ho to nahi (tab banda launcher se aaya hi nahi). z-index 900, isi liye modal iske oopar aate hain. |
| `SINGLE_LOGIN_MIGRATION.sql` | Complaint (`cmp_profiles`) aur Packing (`packing.profiles`) ke users ERP ki `app_users` me merge, har naye user ka PIN (+ verify), naye role `CMP_USER` / `PK_USER`, aur `erp_sso_profile()`. Upar `v_admin_pin` bharna hai. **UNIFIED_USERS_MIGRATION.sql ke baad** ek baar. Dobara chalana surakshit. Neeche dekhein. |
| `FIX_PGCRYPTO_SEARCHPATH.sql` | Ek purani kami ka ilaaj: `erp_app_login()` ka `search_path = public` tha, par `gen_random_bytes()` (pgcrypto) `extensions` schema me rehta hai — isi liye **sahi PIN** par login `function gen_random_bytes(integer) does not exist [42883]` se girta tha. Sirf search_path theek karti hai, function ka body nahi chhedti. Dobara chalana surakshit. |
| `supabase/functions/erp-sso/index.ts` | Edge Function — ERP ke session token se Complaint / Packing ka **asli** Supabase Auth session banata hai (bina password, bina unki RLS chhede). `supabase functions deploy erp-sso`. |
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

## 🧵 Fabric Master & 🏷️ Brand Master

**Master Data › 🧵 Fabric Master** aur **🏷️ Brand Master** —
`SARV INDIA LOT SOFTWARE DATA.xlsx` ki do sheets ka ERP version.

Setup ek hi baar: `FABRIC_BRAND_MASTER_MIGRATION.sql` chalayein, phir dono
screen par 🌱 **Seed Excel Data** dabayein (jo row pehle se hai wo chhoot
jaati hai, to dobara dabane se duplicate nahi bante).

**Ek array, paanch kaam.** Har master ka field list (`store-core.js` ka
`SARV_FAB_FIELDS` / `SARV_BR_FIELDS`) akela hi chalata hai — table ka head
aur rows, New/Edit/Revise ka form, CSV import ka header match, CSV export
ke headers, aur revision ka "kya badla". Naya column jodna = us array me
**ek line** jodna; HTML me kuch nahi badalna padta. Column 42 hain, isi liye
table horizontally scroll karta hai, pehle do column sticky-left rehte hain
aur upar ke **Columns** chips se group on/off hote hain (browser me yaad
rehta hai).

**Revision control — yahi "Revise 1, 2, 3 …" hai.** Do kaam jaan-boojh kar
alag hain:

| | Kya karta hai | REV | Kaaran |
|---|---|---|---|
| ✏️ **Edit** | galti sudharna | **wahi rehta** | nahi chahiye |
| 🔁 **Revise** | soch-samajh kar naya version | **+1** | **zaroori** |

Dono soorat me badlav se **pehle** ka poora snapshot `master_revisions` me
chala jaata hai, us REV number ke saath jo wo tab tha. Isi liye purana lot
card / PR jis REV par bana tha wo REV aaj bhi padhi ja sakti hai, aur 🕘
**History** se kisi bhi purani REV par wapas (restore) bhi ja sakte hain —
restore khud ek nayi REV banta hai, kuch mitta nahi. `master_revisions` na
mile to screen chalti rehti hai, bas archive skip hota hai (console
warning) — master ka apna write kabhi isliye fail nahi hota.

**Dono master jude hain.** Brand ka `FABRIC NAME` Fabric Master ki row ko
point karta hai:

* Brand form ka Fabric dropdown **live** `fabric_master` se bharta hai, aur
  fabric chunne par quality/weights hint me aa jaate hain — khaali
  `BLANKET WEIGHT` bed-size + ply dekhkar khud bhar jaata hai.
* Fabric row par uske brands ki chips — click karne par Brand Master us
  fabric par filter hokar khulta hai (aur ulta bhi).
* Jis brand ka fabric master me nahi hai uski chip **laal** hai aur toolbar
  me "⚠️ N unlinked" pill aata hai. Excel me aise do pehle se hain (2.25
  `RUBRU BLUELILLY DB` aur 3.3 `PARI DB SP`) — galti chhupti nahi, par kaam
  bhi nahi rukta (isi wajah se FK nahi lagayi).
* Jis fabric par brands hain wo **delete nahi hota** — 🚫 Inactive hamesha
  milta hai, aur usse link tootta nahi.

**Access.** Admin Panel › **Feature Access** me per master chaar row —
`FABRIC_NEW / EDIT / REVISE / DELETE` aur waise hi `BRAND_*` — plus dono par
lagne wale `MASTER_REV_HISTORY`, `MASTER_REV_RESTORE`, `MASTER_ACTIVATE`,
`MASTER_IMPORT`, `MASTER_EXPORT`. **Tab Visibility** me `MD_FABRIC` /
`MD_BRAND` poori screen chhupate hain, aur `MD_FABRIC_YARN` /
`MD_BRAND_PACKING` / `MD_REV_COLUMN` sirf unn **column groups** ko — yani
yarn planning ya packing/trims ka data role-wise chhupaya ja sakta hai bina
screen band karne ke (form me bhi wahi group gayab ho jaata hai, aur save par
us group ke field chhede nahi jaate).

**Sattan ke do column.** `SATTAN SIZE` (4 / 5 / 6 INCH SATTAN / NA) aur
`SATTAN TYPE` (STANDARD / PREMIUM) — dono Specification group me, dono ka
apna filter. Pehle ye ek hi column tha jisme `5 INCH SATTAN-NORMAL` jaisi
mili-juli value aa jaati thi; ab size aur grade alag hain, to "saare PREMIUM
brands" filter se mil jaate hain. Database column ka naam `sattan` hi hai
(rename nahi kiya, purana data waise hi padha jaata rahe) — screen par uska
label `SATTAN SIZE` hai, aur CSV import purane `SATTAN` header ko bhi
pehchaanta hai.

**Packing 1 aur Packing 2.** Packing ka poora set (master required/type +
slave required/type) **do baar** hai, kyunki ek hi brand do tarah se pack ho
sakta hai — jaise MONARCH: bag packing aur gift box packing. Packing 1 =
asli / default tareeka (Excel ke wahi chaar column, wahi headers, purani
sheet seedha import hoti rehti hai). Packing 2 optional hai, isi liye table
me uske column **chips default OFF** hain — form me hamesha dikhta hai, aur
chip dabaakar table me bhi aa jaata hai.

Dono screen ke saare dropdowns (unit, quality, size, bed size, ply, sattan
size, sattan type, packing type, YES/NO) **Dropdown Master** se aate hain —
`erp_fabric*` / `erp_brand*` / `erp_fbmYesNo` keys, jinke default seedha
Excel ki data validation lists se liye gaye hain. List badalni ho to SQL
nahi, wahi screen. Dhyan: us key ki ek bhi row `sales_dropdowns` me pehle se
hai to code ka default poora ignore hota hai — yani list wahin se badlegi.

**Naya column aaye to:** `SARV_FAB_FIELDS` / `SARV_BR_FIELDS` me ek line,
aur `FABRIC_BRAND_MASTER_MIGRATION.sql` ke "Jinhone ye file PEHLE chala li
thi" block me ek `alter table … add column if not exists` line. Wo file
dobara chalana hamesha surakshit hai.

### `sales_standard_items` + `brand_master` = ek table

Pehle **ek hi item code DO jagah** maintain hota tha: Brand Master me
(fabric, category, weight, size, bed size, ply, sattan, moq, emboss) aur
Order Form ki apni `sales_standard_items` me (wahi nau + rates). Dono me
alag-alag data chala jaata tha.

Ab Brand Master hi ek ghar hai. `sales_standard_items` ke **nau rate /
packing column** usme aa gaye hain — naya group **💰 Order Form Rates &
Packing**: `PRICE PER KG`, `PACKING PCS`, aur `LABEL / TAG / BAG / BORE /
INNER BOX / OUTER BOX / BALE PRICE`. (Paisa hai, isi liye apni Tab
Visibility row `MD_BRAND_RATES` — default sirf Admin / MD / GM / Accountant
— aur table me chip default OFF.)

**Order Form ab item code ke against Brand Master se padhti hai.** Dono ki
bhasha alag hai, isi liye tarjuma `order-form.html` ke `bmToItem()` me — ek
hi jagah:

| `brand_master` | Order Form | Note |
|---|---|---|
| `bed_size` DOUBLE BED | `dbsb` DB | combo (free text) |
| `blanket_ply` SINGLE PLY | `ply` SP | **`<select>`** — value hu-ba-hu milni chahiye |
| `sattan` 5 INCH SATTAN + `sattan_type` PREMIUM | `sattan` 5" PREMIUM | sattan ka split isi kaam aaya |
| `size` 205*230 CM | `size` 205×230 CM | separator badalta hai |
| `emboss` YES/NO/NA | `emboss` | **`<select>`** |

`ply` aur `emboss` `<select>` hain — unme list se baahar ki value chup-chaap
set hi nahi hoti, isi liye inka map pakka hona zaroori tha. Baaki sab combo
(free text) hain.

**Transition surakshit hai — purana data kahin nahi jaata:**

* SQL ka section **2b** `sales_standard_items` ka data ek baar `brand_master`
  me copy karta hai. Jo item code dono me hai, wahan **brand_master jeetta
  hai** — sirf uske *khaali* column bharte hain. Jo sirf purani table me
  hai, uski nayi row banti hai (dbsb/ply/sattan ka ulta tarjuma karke).
  Purani table ko **chheda nahi jaata, delete bhi nahi**.
* Order Form me `sales_standard_items` **neeche base** rehti hai aur Brand
  Master uske upar **field-by-field** overlay hota hai — sirf wahan jahan
  Brand Master me kuch bhara ho. Poori row se replace *nahi*: migration ke
  beech ki haalat me ek item Brand Master me ho sakta hai (Excel seed se) par
  uske rate khaali — poori row chadha dete to us item ka purana price gayab
  ho jaata aur order **galat rate** par ban jaata.
* Sab theek chalne ki tasalli ho jaane par `sales_standard_items` aap khud
  drop kar sakte hain.

Do baat jaan lein:

* `sales_standard_items.fabric_name` (jaise `2900`) Brand Master ke
  `fabric_name` (1.5 – 6, Fabric Master ka code) se **alag vocabulary** hai,
  isi liye merge usko copy **nahi** karta — nayi rows me wo khaali rehta hai
  aur "⚠️ N unlinked" pill unhe pakad kar dikha deta hai. Wahan sahi fabric
  chun lein.
* `moq` purani table me `500 PCS/Colour` jaisi text ho sakti hai (Order Form
  use `String()` se padhti thi). Merge ka `sarv_to_num()` helper har number
  me se pehla number nikaal leta hai, isi liye text→numeric ka cast poora
  merge nahi girata.

## 🏢 Buyer Master (+ 🤝 Agency table) — party list ka ek hi ghar

**Master Data › 🏢 Buyer Master.** Is EK screen par DO table hain:

| Table | Columns |
|---|---|
| `buyer_master` | `PARTY NAME` (unique, uppercase), `OWNER NAME`, `CONTACT NO`, `ADDRESS`, `GSTIN`, `PARTY STAFF NAME`, `PARTY STAFF CONTACT NO.`, NOTES |
| `agency_master` | `AGENCY NAME` (unique, uppercase), `AGENCY CONTACT PERSON`, `AGENCY MOBILE NO.`, NOTES |

Agency ki apni sub-tab nahi — uski poori table Buyer Master ke neeche
baithti hai (➕ **New Agency** button wahin), kyunki agency aur party
saath-saath maintain hoti hain aur Order Form me bhi ye do box ek doosre ke
neeche hain. Agency ko buyer ka *column* banane ke bajay **alag table** isi
liye rakhi: ek agency ke neeche kai parties hoti hain, to agency ka contact
badalne par har party ki row chhedni padti — galti ki jad.

Dono tables wahi engine chalati hai jo Fabric / Brand Master chalati hai, to
Edit / Revise (REV +1) / History / Restore / Active-Inactive / CSV
import-export sab mil jaate hain. Excel me in dono ki sheet nahi thi, isi
liye 🌱 Seed button nahi hai — list ➕ **New** ya 📥 **Import CSV** se banti
hai.

**Dropdown kahan jaate hain.** Dono jagah ye **jodta** hai, kisi ko hataata
nahi:

| Screen | Field | Pehle kahan se aata tha | Ab |
|---|---|---|---|
| Sales › Order Form | Buyer / Company Name | sirf purane `sales_orders` ke naam | + `buyer_master` |
| Sales › Order Form | Agency Name | sirf purane `sales_orders` ke naam | + `agency_master` |
| Packing & Dispatch | naye slip ka Party Name | sirf jin parties ka PENDING order tha | + `buyer_master` |

Order Form me chunne par details khud bhar jaati hain:

* party → **OWNER NAME** = Contact Person, **CONTACT NO** = Mobile No.,
  **ADDRESS** = Address, **GSTIN** = GSTIN (aur GSTIN se state /
  CGST-SGST-vs-IGST wahan khud pakda jaata hai).
* agency → **CONTACT PERSON** = Agency Contact Person, **MOBILE NO.** =
  Agency Mobile No.

Jis party / agency ka koi purana order hai uski details **order history se**
aati hain (wo pichhli baar ka asli billing data hai) — master sirf unko
bharta hai jinka abhi tak koi order nahi bana. Khaali value kabhi kisi bhari
hui field ko mitati nahi. `transport_name` master me nahi hai, kyunki wo har
order ka apna hota hai. Inactive row kisi bhi dropdown me nahi aati, par
purane order / slip me uska naam likha rehta hai.

Admin Panel › **Tab Visibility** me `MD_BUYER` poori screen, `MD_AGENCY`
sirf neeche ka Agency dabba, aur `MD_BUYER_BILLING` sirf Address + GSTIN
columns (form me bhi) chhupata hai.

**Jo filters orders par lagte hain, unhe jaan-boojh kar nahi chheda:**
Packing ka "Select a Party to see pending orders" (`getUniqueParties`) aur
Pending-list ka party filter (`getPendingFilterOptions`) — ye *maujood
orders* par filter hain, to inme bina order wali master parties daalne se
filter kharab hota, behtar nahi.

**Migration na chali ho to kuch nahi tootta.** Dono files `buyer_master` ko
alag, apne catch me padhti hain — `order-form.html` ka `fetchBuyerMaster()`
error nigal kar khaali list deta hai (warna uska `Promise.all` girta aur
poora form "Database connection failed" me chala jaata), aur `packing.html`
query ka `error` padhta hi nahi, `data` null aa jaata hai. Dono soorat me
screens bilkul pehle jaisi chalti hain.

CSV export ke headers **Excel ke wahi headers** hain, isi liye file Excel me
kholkar, badalkar, 📥 **Import CSV** se wapas aa sakti hai (natural key par
match — fabric: `FABRIC NAME + UNIT`, brand: `ITEM CODE`; nayi row insert,
purani update, aur har update ka snapshot history me).

## 🧾 Sales › Order Form — ERP ke andar, ERP ka login

`order-form.html` ab naye tab me nahi, ERP ke `#orderFormPanel` iframe me
khulta hai (Lot Card Manager jaisa). User sirf ek jagah banta hai:

| Kya | Kahan |
|---|---|
| User, PIN, signature | Admin Panel › Users & Roles (`app_users`) |
| Order Form me kya kar sakta hai | Usi popup ka **Order Form Role** (`app_users.sales_role`): Admin / Manager / Executive / Data Entry / Viewer. Khaali = access nahi |
| Shared role-PIN login (bina naam) | `sales_erp_role_map`: ADMIN → admin, MD → admin, GM → manager |

- ERP login karte hi Order Form ka session ban jaata hai — andar dobara login nahi.
- `order-form.html` alag se kholein (phone) to ERP wala **naam + PIN**; shared
  PIN wale naam ki jagah `ADMIN` / `MD` / `GM`.
- `sales_users` ab sirf mirror hai (trigger bharta hai) — use seedha edit na
  karein. Purane Order Form users migration me `app_users` me jud jaate hain
  (naya user "View Only" ERP role ke saath); jab tak Admin unka PIN set na kare,
  purana password chalta hai.
- Order Form signature: ERP me user ka sign ho to wahi Order Form PDF par.

## 📦 Sales › Packing & Dispatch (packing.html)

Purani Packing App (`PACKING/PACKING.html`, Supabase project
`hghomygvryyihezvmrjj`) ki ERP copy. Interface, offline queue, PDF (Original +
Full Copy) — sab hu-ba-hu; farak sirf itna ki data ERP project ke **`packing`
schema** me hai (wahi table / RPC naam). Purani app aur purana project **bilkul
nahi badle** — backup ki tarah chalte rehte hain.

Setup (ERP project › SQL Editor, `PACKING/` folder se, isi kram me):

| Step | File | Kya |
|---|---|---|
| 1 | `PACKING_1_SCHEMA_CLONE.sql` | Purane project se poora schema (tables, keys, indexes, views, RPCs, triggers, RLS, grants) `packing` me clone. Upar connection string daalein. |
| — | Dashboard | ERP project › Settings › API › **Exposed schemas** me `packing` jodein. |
| 2 | `PACKING_2_DATA_TRANSFER.sql` | Saara data + login users + sequences copy. Dobara chalana safe (upsert) — cut-over ke din aakhri baar. |
| 3 | `PACKING_3_ERP_ENHANCEMENTS.sql` | Audit trail, ERP PDF index, business views. |

- Login: wahi username / password jo purani app me (auth users copy hote hain).
- Purani PDFs ke link purane project ke bucket par hain aur wahin se khulte hain;
  nayi PDFs ERP ke `packing-slips` bucket me.
- Cut-over: dono apps ek saath chalengi to Slip / Order number takrayenge —
  aakhri copy ke baad sab ERP wali app par.
- Views (`packing.v_dispatch_daily`, `v_party_dispatch_monthly`,
  `v_quality_dispatch_monthly`, `v_order_pending_aging`, `v_slip_pipeline`,
  `v_weight_variance`, `v_vehicle_utilisation`) dashboard / reports ke liye.

## 🖨️ Printing Lot Card (Manufacturing)

Purani Google-Sheet wali app ki jagah. Setup: `PRINTING_LOT_MIGRATION.sql` ek
baar chalayein — bas.

| Purana (Sheet / Drive / IndexedDB) | Ab |
|---|---|
| Production Log sheet | `prl_lots` (+ view `v_prl_production_log`, wahi columns) |
| designs[] me base64 photo | `prl_lot_designs.image_path` → bucket `printing-lot/images/<lot id>/…` (har photo alag file) |
| Production Tracking sheet | `prl_production_entries` (ek row per lot + section, `data` jsonb) + `prl_production_log` (har save ka itihaas) + view `v_prl_production_tracking` |
| User Master (plain password) | ERP login + Feature Access `PRL_*`; department masters ke liye `prl_operators` (naam + PIN hash) |
| Drive `ROOT/PARTY/LOT_PARTY.pdf` | `printing-lot/pdfs/PARTY/LOT_PARTY.pdf` + `pdf_documents` (variant `PRINTING_LOT`) |
| DRAFT-LOT sheet | Saved lot par 5 sec baad auto-save + browser me local backup |

- **Kaun kya kar sakta hai:** Admin Panel › Feature Access › 🖨️ Printing Lot
  Card (`PRL_EDIT`, `PRL_DELETE`, `PRL_PROD_ALL`, `PRL_MASTER`). Default:
  Admin + MD edit; baaki view-only.
- **Department masters** (Raschel, Stenter, Printing…): Printing Lot › Masters ›
  Department Operators me Admin banata hai (Admin PIN se). Wo Production tab
  me *Department Login* karke sirf apne sections bharte hain.
- **Lists:** Unit / Category / Bed Size / Ply / Satin Quality / Stenter Times →
  Dropdown Master (`erp_designUnit`, `erp_prl*`). Blanket colors aur satin
  codes → Printing Lot › Masters. Production ke fields → table `prl_sections`
  (`fields` jsonb) — naya field wahan jodein, code nahi badalna.
- Ek save me poora card (`prl_save_lot` RPC, ek transaction). Do log ek saath
  badlein to doosre ko `VERSION_CONFLICT` milta hai — kisi ka kaam chupchaap
  nahi mitta.

## 👤 Ek user, kai role, ek login

Setup: `UNIFIED_USERS_MIGRATION.sql` (ADMIN_PANEL_MIGRATION ke baad).

### Multi-role — access ka JOD, sign primary se

`app_users` par ab do cheezein hain, aur ye farq poore design ki jaan hai:

| | Kitne | Kis kaam ka |
|---|---|---|
| `role` (purana column) | **ek** | **PRIMARY role.** "Kisne kiya" — PR/PO par sign, audit stamp, PDF par naam, role badge. |
| `roles text[]` (naya) | **kai** | **Sirf ACCESS.** Union: kisi feature par ek bhi role YES kahe to mil jaata hai. |

Rajesh "Store Incharge + Accountant" ho to use dono ka kaam milta hai, par
sign hamesha uske primary role se jaata hai — "kis role se sign hua" ka
jawab kabhi dhundhla nahi hota. Aur kyunki purana `role` column waisa hi
hai, app ka ek bhi purana `sarvCurrentRole` padhne wala hissa nahi tootta.

Code me: `sarvCurrentRole` = primary, `sarvCurrentRoles` = sab,
`sarvRoles_()` = access ke liye list. `sarvCan()` aur `sarvTabVisible()`
isi par union lagate hain; `isAdmin()` bhi (ADMIN_PIN kisi bhi role me ho).

### Login ab naam se

Login screen par pehle Role chunna padta tha. Ab **naam** — uske saare
role apne aap lag jaate hain, aur naam type karte waqt niche uske role
dikh bhi jaate hain. Purana **"Role PIN se login"** link neeche maujood
hai: jinka naam Admin Panel › Users me nahi hai, aur jahan ye migration
abhi chali hi nahi, wahan wahi chalta hai (us soorat me access sirf usi
ek role ka). Isi liye ye badlaav **kisi ko bahar nahi karta**.

### Per-user app access — tri-state

Admin Panel › Users › **📱 Apps** me har app par teen haal:

| | Matlab |
|---|---|
| **auto** (default) | role-wise Tab Visibility jo kahe wahi |
| **ON** | zaroor dikhao, role kuch bhi kahe |
| **OFF** | zaroor chhupao, role kuch bhi kahe |

Kram: `user override → role-wise matrix → code ka default`. "auto" default
isi liye rakha ki role-wise matrix ka matlab bacha rahe — Admin ko sirf us
ek bande par haath lagana padta hai jiska case alag hai (pehle ek banda
chhupane ke liye naya role banana padta tha). Keys wahi hain jo Tab
Visibility me hain (`HOME_*`), to koi nayi vocabulary nahi.

Users table me `+N role` aur `📱 N` pills se turant dikh jaata hai ki kis
user par kya haath se set hai — warna "iska button kyun nahi dikh raha"
dhoondhne me waqt jaata hai.

### Ek login, saare apps

ERP login par `erp_app_login()` ek **session token** banata hai
(`app_sessions`), jo localStorage me jaata hai — saare apps ek hi origin
par hain, to wo use padh lete hain. Us session row par `allowed_apps` bhi
likha jaata hai: "is user ko kaun-kaun se app khul sakte hain", jo faisla
ERP ki JS karti hai (role matrix + per-user override). Isi liye external
apps ko permission ka poora matrix samajhne ki zaroorat nahi.

| App | Aaj kya hota hai |
|---|---|
| **launcher.html** | **Sabka pehla page** — naam + PIN, phir sirf apne app ke buttons |
| ERP | PIN login (naam se), ya launcher se bina dobara PIN |
| Order Form | **poora SSO** — pehle se (sales_erp_login), bina login khulta hai |
| Approval App (mobile) | **poora SSO** — role ERP se, PIN nahi; apna naam + PIN bhi chalta hai |
| Complaint App | **poora SSO** — `erp-sso` Edge Function asli auth session banata hai |
| Packing & Dispatch | **poora SSO** — wahi |

Logout par token server par revoke hota hai, aur reload par
`sarvRefreshSsoSession_()` session se taaza roles / app_access le aata hai
— Admin ne beech me access badla ho ya user band kar diya ho to wo turant
lagta hai. Net / RPC fail ho to kuch nahi badalta (offline me app khulni
chahiye).

### Single login — poora ho gaya

Setup, isi kram me:

| Step | Kya |
|---|---|
| 1 | `SINGLE_LOGIN_MIGRATION.sql` — upar `v_admin_pin` me apna Admin PIN daalein, phir Supabase › SQL Editor me chalayein. **Ek baar** (dobara chalana surakshit). Iska section 0b pgcrypto ka `search_path` bhi theek kar deta hai; alag se karna ho to `FIX_PGCRYPTO_SEARCHPATH.sql`. |
| 2 | Aakhir me jo table dikhti hai (`sarv_user_merge_report`) usme har naye user ka **naam + PIN** hai. Wo list nikaal lein / baant dein, phir usi file ke section 9 ka `drop table` chala dein (usme plain PIN hain). |
| 3 | `supabase/functions/erp-sso/` deploy karein — `supabase functions deploy erp-sso`, ya Dashboard › Edge Functions › naam `erp-sso` › file paste. |

### Aana-jaana — launcher aur "← Apps"

`launcher.html` hi sabka **pehla page** hai: naam + PIN, aur phir sirf wahi
app buttons jinka access hai. Har app ka apna rang hai (ERP neela, Approvals
baingani, Complaint narangi, Packing hara, Order Form gulaabi) — banda rang se
pehchan leta hai, padhne se pehle. Dark aur light dono mode chalte hain
(system setting se), aur `prefers-reduced-motion` par animation poori band.

Wapas aane ke liye har app me neeche daayein kone me floating **← Apps**
button hai — ek hi file se (`app-back.js`), isi liye paanch apps me paanch
tarah ke back button nahi bante. Wo khud tay karta hai ki dikhna chahiye ya
nahi:

| Soorat | Button |
|---|---|
| App ERP ke **iframe** me khuli hai (Packing, Order Form, Lot Card, Trims) | **nahi** — wahan "wapas" ka matlab poora ERP iframe me khol dena hota |
| Single-login session **nahi** hai | **nahi** — banda launcher se aaya hi nahi, use ek aur login screen dikhana galat hai |
| Khud `launcher.html` par | **nahi** — wapas kahan jaana hai |
| Baaki sab | **haan** |

Back button se **logout nahi hota** — session waisa hi rehta hai, isi liye
launcher par pahunchte hi doosra app bina PIN khulta hai. Logout ab bhi ek hi
jagah se hai (launcher ka Logout, ya app ka apna logout jo wahin bhej deta
hai).

**Ek user table.** `cmp_profiles` (Complaint, 57 user) aur `packing.profiles`
(Packing, 6 user) ke log ab ERP ki usi `app_users` table me hain. Purane rows
**mitte nahi** — `app_users.cmp_profile_id` / `pk_profile_id` se jude rehte
hain, isi liye us bande ka purana kaam (assign ki gayi tasks, uska signature,
banaye hue slip) poora bacha rehta hai. Un apps ka apna role bhi wahin se
aata hai (`cmp_profiles.role` / `packing.profiles.role`) — ERP sirf "kaun
hai" batata hai, "kya kar sakta hai" us app ka apna setup hi tay karta hai.

**Ek PIN.** Naye users ka ERP PIN migration banati hai (Complaint walon ka
unke mobile ke aakhri 4 digit). PIN kahan/kaise store hota hai, migration ye
jaanti nahi — wo aapke maujooda `admin_save_user()` se set hota hai aur phir
`verify_app_user_pin()` se **check** bhi hota hai, isi liye "PIN set hua par
chalta nahi" chup-chaap nahi ho sakta (report me ⚠️ likha aata hai).

**Password kaise hata.** Complaint App ka data Supabase Auth par chalta hai —
`cmp_tasks` / `cmp_notice_board` ke trigger `auth.uid()` maangte hain ("Sirf
Admin task assign kar sakta hai."). Do raaste the: un policies/triggers ko
anon-model par laana, ya ERP ke session se us bande ka **asli** auth session
bana dena. Doosra chuna gaya — usme **ek bhi policy chhedni nahi padti**,
`auth.uid()` sach me set hota hai, isi liye har purana trigger, RLS aur
`created_by` bilkul waisa hi kaam karta hai. Wo kaam `erp-sso` Edge Function
karta hai: ERP token check karke ek one-time magic-link token deta hai, aur
app `verifyOtp()` se apna session bana leta hai. `service_role` key sirf
function me rehti hai, kisi page me nahi — aur koi password kahin store nahi
hota.

Isi badlaav se Packing ki do purani kharabi bhi theek ho gayi: SSO login par
`auth.getUser()` khaali hota tha, isi liye **signature save** par TypeError
aata tha aur PDF par sign lagta hi nahi tha.

**Naye role.** `CMP_USER` / `PK_USER` — un logon ke liye jinka kaam sirf apne
app me hai. Unse ERP ke saare buttons **do tah** se band hain: per-user
`app_access`, aur role-wise Tab Visibility (migration dono likhti hai). Ek
nayi key bhi hai — `HOME_ERP_APP`, yani launcher par "ERP" ka button.

**Jiska us app me account hi nahi hai**, uske login par us app ka button ab
**chhup** jaata hai (pehle button dikhta tha aur dabane par us app ki apni
login screen aa jaati thi). Migration ye report me `APP_HIDDEN` likh deti
hai. Admin us bande ka account bana kar jodd lagaye, phir Users › 📱 Apps me
wapas auto / ON kar de.

**Jo haath se karna padega:** jin naamon par shak tha (ek hi naam ke do ERP
user, ya `SATINDER_GHALYAN` vs `SATINDER JI` jaise) unhe migration **jodti
nahi** — galat bande se jodna uska purana kaam doosre ke naam kar deta.
Report me wo `NEEDS_MANUAL_LINK` me aate hain; unhe Admin Panel › Users ›
**🔗 Link external accounts** se jodein.

Dhyan: Complaint App ka apna `admin-users` Edge Function admin ke
**access_token** par chalta hai, isi liye ERP Admin Panel usse seedha
user bana nahi sakta — naya Complaint user abhi bhi us app ki signup /
admin screen se banta hai (uske baad migration dobara chalakar ya haath
se jodd lagayein).

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
