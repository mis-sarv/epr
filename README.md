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
| `DESIGN_SKU_MIGRATION.sql` | **`design_master.design_sku_no` column** — Design No ke saath uska SKU No. Create New me Design No ke theek baad (**zaroori**), Live tab me apna column + ▾ filter, Bulk Upload grid me Design No ke neeche (optional), aur Catalogue PDF ke filters + PDF ki spec table me. **Ek baar** chalayein (dobara chalana surakshit). Column nullable hai aur uspar UNIQUE nahi — app khud duplicate SKU par poochti hai; hamesha-unique chahiye to file me commented unique index hai. Migration se pehle bhi screen chalti hai, bas SKU save nahi hota aur app ek baar ye keh deti hai. Neeche dekhein. |
| `ORDER_FORM_USERS_MIGRATION.sql` | Order Form ke users ERP ki `app_users` me (ek hi user table): `app_users.sales_role`, `sales_users` mirror + trigger, ERP login se Order Form session (`sales_erp_login`). **Ek baar** chalayein. |
| `printing-lot.html` | Manufacturing › 🖨️ Printing Lot Card (purani "Design Print Manager Pro" + code.gs). `#printingLotPanel` iframe me khulta hai; shop floor par seedha `printing-lot.html#production` bhi. |
| `PRINTING_LOT_MIGRATION.sql` | Printing Lot ke `prl_*` tables, RPCs, views, bucket `printing-lot` + seed (sections, colors, satin codes). **Ek baar** chalayein (APPROVAL_CHAIN_MIGRATION ke baad). |
| `FABRIC_BRAND_MASTER_MIGRATION.sql` | `fabric_master` + `brand_master` + `buyer_master` + `agency_master` + `master_revisions` (REV archive), unique index, triggers, RLS aur do rollup view. Master Data › 🧵 Fabric Master / 🏷️ Brand Master / 🏢 Buyer Master (+ Agency table) ke liye. **Ek baar** chalayein, phir Fabric & Brand screen par 🌱 **Seed Excel Data**. Dobara chalana bhi surakshit hai. Neeche dekhein. |
| `fabric & brand master/SARV INDIA LOT SOFTWARE DATA.xlsx` | Dono master ka source — `FABRIC MASTER` (31 row × 42 column) aur `BRAND MASTER` (65 row × 23 column) sheets. Seed button ki rows isi se nikali hui hain. |
| `UNIFIED_USERS_MIGRATION.sql` | Ek user / kai role (`app_users.roles[]`), per-user app access (`app_users.app_access`), aur saare apps ka ek session (`app_sessions` + `erp_app_login` / `erp_app_session` / `erp_app_logout`). **ADMIN_PANEL_MIGRATION.sql ke baad** ek baar chalayein. Dobara chalana surakshit. Neeche dekhein. |
| `launcher.html` | **Login ke baad ka pehla page.** Naam + PIN, aur phir sirf wahi app buttons jinka access hai (ERP / Approvals / Complaint / Packing / Order Form). Ek hi session banata hai jo saare apps chalate hain. Neeche dekhein. |
| `app-back.js` | Har app me ek hi `<script src>` line — neeche daayein kone me floating **← Apps** button. Khud tay karta hai ki dikhna hai ya nahi: ERP ke iframe ke andar nahi, aur single-login session na ho to nahi (tab banda launcher se aaya hi nahi). z-index 900, isi liye modal iske oopar aate hain. |
| `sso-preboot.js` | Har app ke `<head>` me sabse pehle. App switch karte waqt login window ki **jhalak** rokta hai: token localStorage me ho (synchronous) to login overlay paint hi nahi hota aur ek spinner splash lag jaati hai; app taiyar hone par khud `sarvSsoPrebootDone()` bulati hai. Token na ho to ye file kuch nahi karti. 9 sec ka backstop — koi spinner par atkta nahi. |
| `SINGLE_LOGIN_MIGRATION.sql` | Complaint (`cmp_profiles`) aur Packing (`packing.profiles`) ke users ERP ki `app_users` me merge, har naye user ka PIN (+ verify), naye role `CMP_USER` / `PK_USER`, aur `erp_sso_profile()`. Upar `v_admin_pin` bharna hai. **UNIFIED_USERS_MIGRATION.sql ke baad** ek baar. Dobara chalana surakshit. Neeche dekhein. |
| `FIX_PGCRYPTO_SEARCHPATH.sql` | **Login par `function gen_random_bytes(integer) does not exist [42883]`** aaye to ye chalayein. Wajah: `gen_random_bytes()` pgcrypto ka hai aur Supabase me `extensions` schema me rehta hai, par `erp_app_login()` ke `search_path` me wo schema chhoot gaya hai (purani SQL file se bana function database me waisa hi pada rehta hai — file update hone se DB nahi badalta). **Sahi PIN** par hi dikhta hai, galat PIN par nahi. Sirf search_path theek karti hai (`alter function`), body nahi chhedti. Aakhir me ek `sarv_pgcrypto_report` table deti hai — usme **"5. ASLI JAANCH"** lakeer wahi `gen_random_bytes(32)` sach me chalakar dikhati hai. Dobara chalana surakshit. |
| `sso-gate.js` | **Saare apps ka EK hi darwaza.** Har app ke `<head>` me `sso-preboot.js` ke baad. Ek jagah par: ERP ka session jaanchna, app ka access jaanchna, us app ka account jaanchna, `erp-sso` se asli auth session banana, aur fail hone par wajah wali screen dikhana (ya launcher par bhej dena). `SARV_GATE.boot()` sirf andar jaane layak hone par resolve hota hai; `logout()` har app me ek jaisa hai; `requireSession()` ERP / mobile ke liye sirf "token na ho to launcher" wali sync rok hai. **Kisi app me koi login form nahi bachta.** |
| `ONE_USER_TABLE.sql` | **Sirf `public.app_users` bachti hai** — `packing.profiles` aur `sales_users` bhi VIEW ban jaate hain (naam, column aur matlab wahi, isi liye dono apps ka code / trigger / RLS bina badle chalte hain). `cmp_profiles` pehle se VIEW hai. **Do qadam:** pehla sirf report deta hai (column, RLS, FK, trigger, aur har wo function jo in tables ko padhta ya likhta hai); `v_do_it := true` karne par asli kaam, archive ke saath. Nayi views par `security_invoker = true` — warna view owner ke haq se chalti aur `app_users` ki RLS beech me aati hi nahi. Purani `CONSOLIDATE_USER_TABLES.sql` ki jagah (wo ab chalti nahi). |
| `MERGE_DUPLICATE_USERS.sql` | **Ek hi bande ki do `app_users` rows** (jaise "PARKASH" aur "PARKASH JI", dono emp_code 1460) — ek me milati hai, doosri hatati hai. Auth account ki id ek hi row par ho sakti hai, isi liye duplicate rehte hue Complaint / Packing ka access diya hi nahi ja sakta (`AUTH_ACCOUNT_TAKEN`). `erp_merge_duplicate_user()` roles / app access / Order Form role KEEP row par le aata hai, PIN · sessions · resets · Order Form mirror aur **har** `app_users(id)` wale FK ki rows bhi (list `pg_constraint` se nikalti hai), phir duplicate row delete. Ek transaction — kuch atka to poora palat jaata hai. Pehle chalane par sirf report deti hai; merge aap section 3 se chalate hain. ⚠️ Palta nahi ja sakta. |
| `CHECK_ORDER_FORM_SESSION.sql` | `CHECK_ORDER_FORM_SETUP` "sab maujood hai" kahe par **phir bhi Order Form na khule** to ye. Kuch badalti nahi. Teen cheezein dekhti hai: (1) `anon` ko har `sales_*` RPC par EXECUTE hai ya nahi — na ho to *"permission denied for function sales_whoami"*, jo purane app me "setup pending" bana kar dikhta tha; (2) `sales_sessions` me session ban rahe hain ya nahi (khaali = launcher ka `sales_erp_login()` token hi nahi bana raha); (3) `sales_users` mirror bhara hai ya nahi. Aakhir me ek commented `grant execute` block — sirf tab chalayein jab section A me rok dikhe. |
| `BRAND_TRIMS_MIGRATION.sql` | **Brand Master me 7 naye MATERIAL (YES/NO) column** — `label`, `tag`, `bag`, `bore`, `inner_box`, `outer_box`, `foam`. Order Form ke **Bags & Trims** ka material list inhi se banta hai. **Ek baar** chalayein (dobara chalana surakshit — `add column if not exists`). **Jab tak ye nahi chalti, Bags & Trims me sirf "Bora Packing Charge" row dikhegi** (khaali column = NO), aur table khud wajah likh deti hai. Neeche dekhein. |
| `CHECK_ORDER_FORM_SETUP.sql` | **order-form.html par "Database setup pending"** aaye to ye. Kuch badalti nahi. Order Form ko jo 11 RPC aur 3 table chahiye (`sales_whoami`, `sales_save_order`, `sales_orders` …) un sab ko naam **aur argument** se jaanchti hai — PostgREST naam+argument se function dhoondhta hai, isi liye sahi naam par galat argument bhi "function not found" deta hai. Aakhir me faisla: sab maujood hai / module hi nahi hai / itni cheezein missing hain. **Dhyan:** `ORDER_FORM_MIGRATION.sql` is project tree me kahin nahi hai — isi liye app ka purana message ek band gali tha. |
| `FIX_PROFILE_ID_COLUMNS.sql` | **`CHECK_PACKING_SSO` me `erp_app_session() = PURANA`** aaye to ye. Haalat ye hai ki `MERGE_PROFILE_IDS...` poori chali nahi, isi liye `app_users.pk_profile_id` / `cmp_profile_id` columns zinda par **khaali** hain — aur teen RPC (`erp_app_session`, `erp_app_login`, `erp_sso_profile`) usi khaali column ko padhte hain, `packing.profiles` ko nahi. Nateeja: tables me sab theek, par app har user par `NO_APP_ACCOUNT`. Ye file column backfill karti hai aur `admin_grant_app_access()` me do line jodti hai taaki aage ke users par bhi bhare. Kisi RPC ka body nahi badalta, id nahi badalti, FK nahi chhedta. MERGE baad me chalani ho to ye uske raaste me nahi aati. |
| `FIX_APP_ACCOUNT_PROVISION.sql` | **Admin Panel me Save karte waqt "⚠️ Complaint App / Packing ka account nahi bana"** aaye to ye chalayein. Do RPC banati hai: `erp_auth_id_by_email()` (sirf server) aur `erp_link_existing_auth_account()` — jo us bande ka **maujooda** auth account (jo doosri id par pada hai) dhoondh kar `app_users.id` usi par le aata hai, naya banaye bina. Aakhir me report: kis user ka auth account usi id par hai, kis ka doosri id par, aur kis ka hai hi nahi. Kuch maujooda function/table badalti nahi. |
| `CHECK_PACKING_SSO.sql` | **"packing.html me direct login nahi ho raha"** — kiska aur kyun. Kuch badalti nahi, sirf dekhti hai. Launcher par Packing ka button lagbhag sabko dikhta hai (access ka default `true` hai), par **direct** login ke liye us bande ka Packing ka account bhi chahiye: `auth.users` + `packing.profiles` me usi id se row. Dono Admin Panel › Users › Apps me "Packing & Dispatch" ON karne par khud banti hain. Ye file har user ka verdict deti hai (`DIRECT LOGIN OK` / `AUTH ACCOUNT NAHI` / `PACKING ACCOUNT NAHI` / `PROFILE INACTIVE`) aur saath me setup ke checks. |
| `USER_SELF_SERVICE_MIGRATION.sql` | **Signup · Forgot PIN · emp_code login.** `app_users` par `dob` / `photo` / `designation` / `department`, emp_code backfill (`employees` se naam-match), aur RPCs `erp_signup` / `erp_forgot_pin_request` / `erp_reset_pin` / `admin_get_user_signature`. PIN kahan likha jaata hai ye GUESS nahi karti — probe user se pata karti hai. Upar `v_admin_pin` bharna hai. **SINGLE_LOGIN ke baad** ek baar. Neeche dekhein. |
| `CONSOLIDATE_USER_TABLES.sql` | ⚠️ `cmp_profiles` / `packing.profiles` / `sales_users` hata kar `app_users` ko ek hi user store banati hai — par unhi naamon ki **VIEW** chhod jaati hai (app_users se), isi liye dono apps ke trigger / RLS / code bina badle chalte rehte hain. **Pehli baar chalane par sirf plan chhapti hai (dry run)**; `v_do_it := true` karne par kaam karti hai. Archive khud banati hai. |
| `supabase/functions/erp-sso/index.ts` | Edge Function — ERP ke session token se Complaint / Packing ka **asli** Supabase Auth session banata hai (bina password, bina unki RLS chhede). `supabase functions deploy erp-sso`. |
| `PURCHASE_TRACKING_VIEW.sql` | `v_purchase_tracking` view — PR → PO → Receiving → Requester ki flat tracking sheet (item lines nahi, sirf totals). Neeche dekhein. |
| `TRIMS_MANAGER_V2_MIGRATION.sql` | **Trims Manager: Manual Order + PR No.** Teen cheezein: (1) `mfg_trims_sheets` par `order_manual` · `party_name` · `brand_name` · `designs` — Order No haath se likhne par Party / Brand / Design list sheet khud rakhti hai; (2) `mfg_trims_lines` par `pr_no` · `po_manual` · `target_date_manual` — user **PR** chunta hai, PO us PR ke against bante hi `purchase_order_lines.req_no` se khud mil jaata hai; (3) `outward_lines.lot_no` — aage ek ISSUE me kai lot ke liye. Saath me `mfg_save_trims_sheet()` RPC dobara banti hai (purani drop hoti hai). **`TRIMS_MANAGER_MIGRATION.sql` ke baad** ek baar; dobara chalana surakshit. Jab tak na chale, Trims Manager screen par sab chalta hai par PR No / Party / Brand / Design **save nahi hote** — sheet khud laal banner me ye likh deti hai. Neeche dekhein. |
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

## 📞 PO Follow-up — vendor se revised delivery date

PO vendor ko chala gaya, delivery date aa gayi, maal nahi aaya. Ab tak iska
koi record kahin nahi tha — phone par baat hoti thi aur baat wahin reh jaati
thi. Ab wo baat likhi jaati hai.

**Likhna kahan:** `mobile.html` › **📞 PO Follow-up** tab (PO Sender ka).
**Padhna kahan:** `index.html` › PO Generation › **📋 Follow-Up Report** ka
naya column **Delivery Revise & Remarks**, theek `PO Sent to Vendor` ke baad.

### Kaunse PO is tab me aate hain

Teeno shart saath me:

1. **Vendor ko bhej diya gaya** ho (`purchase_orders.party_sent_at`, ya
   browser-local fallback — wahi `isPoSentMobile`). Jo PO vendor ke paas
   pahuncha hi nahi, us par vendor se date poochne ka matlab nahi.
2. Status **MD Approved** / **Vendor Verified** (legacy, MD ke baad hi aata
   tha) / **Partially Received**.
3. Maal **poora nahi aaya** — ye `poReceiptBucket` se tay hota hai, jo lines
   load hone par **item-wise** dekhta hai. Isi liye wo PO bhi list me rehta
   hai jiske header totals "Received" keh rahe hon par ek line short ho.

Do section hain, aur ye stage ki jodi **nahi** hai — dono me wahi PO hain:

| Section | Matlab |
|---|---|
| **Follow-up Due** | ek bhi follow-up nahi hua, **ya** di hui revised date nikal gayi |
| **Date Awaited** | follow-up ho chuka aur vendor ki di hui date abhi aage ki hai |

Tab ka badge **Follow-up Due** ka count hai. Sabse oopar wo PO jiski date
sabse zyada nikal gayi hai.

### Modal me 📦 Item Details — PO wise

PO kholne par wahi **per-item** table dikhti hai jo PO Receipts me hai
(`openRecvModal`) — `Sr · Item Name · Ordered · Received · Pending · UOM ·
Status` — neeche TOTAL row aur wahi verdict jo PO ko uske section me rakhta
hai. Helpers dono tab me **ek hi** hain (`poLineTally_` / `recvLineState_` /
`RECV_LINE_STATE`); do tab ek hi figure do tarike se nikalein to wahi se
dono me farq aana shuru hota hai.

Do baatein PO Receipts se alag hain, jaan-boojh kar:

- **Jo item short hain wo sabse oopar** aate hain (uske andar PO ki apni line
  order barkarar). Baat karte waqt list oopar se niche padhi jaati hai — 20
  line ke PO me jo 2 baaki hain, wo 18 poore hue items ke beech dabi nahi
  rehni chahiye. Short lines halki amber tint me hain.
- Table ke neeche ek line saaf likhti hai **kya maangna hai** — "Vendor se in
  3 item ki baat karein — kul 40 qty baaki hai (1 item par abhi kuch bhi nahi
  aaya)". Yahi wo vaakya hai jo Sender screen se padhkar phone par bol deta
  hai.

Header par bhi `Ordered / Received`, `Items Complete`, `Excess Received` aur
`Inward Entries` aa gaye — taaki jo qty kal aa chuki hai wo dobara na maangi
jaye.

Lines list ke saath hi load ho jaati hain (`attachPoLinesToPos_`, PO Sender
bhi ab usme shaamil hai), to modal aam taur par bina extra query khulta hai;
sirf wo lookup fail / skip hua ho to modal apne aap ek baar fetch karta hai.
`_lines` ka convention wahi hai: `null` = load nahi hui (table kehti hai
"load nahi ho paayin"), `[]` = load hui aur khali hai ("is PO me koi line
nahi") — dono ko ek jaisa dikhana sabse galat hota, kyunki `[]` ka matlab
"kuch order hi nahi hua" padh liya jaata.

### Data kahan baithta hai — koi migration nahi

`purchase_orders.approvals` ke andar, `followups` **array** me:

```json
{ "seq": 2, "revisedDate": "2026-11-05", "prevDate": "2026-10-20",
  "remarks": "yarn nahi aaya, 5 din me dispatch", "by": "PO Sender",
  "role": "PO Sender", "at": "16/10/2026 15:40",
  "atIso": "2026-10-16T10:10:00.000Z", "poNo": "PO/U-2/793" }
```

`approvals` hi **ek matra** jsonb column hai jo `purchase_orders` par hai (us
table par `pdf_snapshot` nahi hota), aur `rejectPO` pehle se isi me ek
non-stage key (`rejection`) rakhta hai. Is column ko koi **iterate nahi**
karta — dono app aur dono PDF renderer apni stage key **naam se** padhte hain
(`approvals.gmCeo` / `.md` / `.store` / `.rejection`), isliye ek extra key un
sabke liye inert hai. **Isi liye is feature ke liye koi `.sql` chalane ki
zaroorat nahi.**

### Do niyam jo jaan lein

- **Append-only.** Entry na edit hoti hai na delete. Jo date vendor ne di aur
  nikal gayi — wahi to is record ka asli kaam hai; use mitana matlab saboot
  mitana. Nayi baat = nayi entry.
- **PO ki asli `delivery_date` nahi badalti**, aur PO ki PDF dobara nahi
  banti. Vendor ke haath me jo document hai wo wahi rehta hai. Report me
  `Delivery Date of PO` = jo tay hua tha, naya column = uske baad kya hua.
  Nayi date pichli di hui date se **peeche** nahi daali ja sakti (pehli entry
  par aaj se peeche nahi) — wo revision nahi, typo hoti hai.

Save karte waqt row **dobara padhi** jaati hai aur nayi entry usi taaza array
par judti hai — do phone ek hi PO chase kar rahe hon to ek doosre ki entry
mitti nahi (read-modify-write ka race).

### Report me

Cell par latest date, kitne din late / baaki, remark ki shuruat, aur
**🕘 History (n)** link — click par us PO ki saari entries (date, remark,
kisne kab ki, pichli date kya thi). Report me kuch **type nahi hota**: jisne
vendor se baat ki wahi phone par likhta hai, warna sach do jagah ho jaata hai
— wahi niyam jo `Bill Checked by GM / MD` columns par hai.

Column filter latest date par chalta hai, search remark ke andar bhi dhoondhti
hai (`transport` likhne par wo saare PO mil jaate hain), aur CSV me char
column jaate hain: `Follow-ups`, `Revised Date (latest)`,
`Latest Follow-up Remarks`, aur poori `Follow-up History` ek cell me.

### Access

| Jagah | Key | Default |
|---|---|---|
| Admin Panel › **Feature Access** | `PO_FOLLOWUP` | sirf **PO Sender** + Admin |
| Admin Panel › **Tab Visibility** | `M_FOLLOWUP` | `ALL` |
| | `M_FOLLOWUP_pending` / `M_FOLLOWUP_done` | `ALL` |

Tab dono jagah se pass hona chahiye, isi liye default me wo sirf PO Sender ko
dikhta hai (wahi tareeka `M_SENT` ka hai). Kisi aur role ko dena ho to
Feature Access ki `PO_FOLLOWUP` row par tick lagayein — par **likhne** ka haq
phir bhi PO Sender ka rehta hai (`STAGE_TABS.FOLLOWUP.actor`), baaki ko
history read-only dikhti hai.

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

### ★ Buyer aur Item Code — sirf saved list me se, auto-fill LOCKED

Order Form me do field par ab wahi niyam hai jo **Store Inward ke "Item Name ★"**
par hai (`store-core.js` → `lockToMasterList` + `addNewRow` ka row template):

| Field | List kahan se | Uske saath locked |
|---|---|---|
| **Buyer / Company Name ★** | saved buyers (`buyer_master` + purane orders) | Mobile No. · Contact Person · Address · GSTIN |
| **Item Code ★** (per product) | `brand_master` | poora **Specifications** block: Fabric, Category, Weight, Size, DB/SB, Ply, Sattan Type, Sattan Size, MOQ |

Kaise chalta hai — Store Inward jaisa hi:

- Naam wala field **blur** par jaanchta hai. List me na mile to khud khaali ho
  jaata hai, toast wajah batata hai, aur uske bharose wali saari value bhi saaf
  ho jaati hai (adhoori value locked field me baithi rehna sabse khatarnak hai).
- Locked field **readonly** (ya `<select>` ho to `disabled`) hote hain, grey
  background aur "Master se locked hai" wale title ke saath.
- **Submit se pehle dobara jaanch** hoti hai. Blur wali jaanch har soorat me
  nahi chalti (browser autofill, back button se bhari value, ya field ko focus
  hi na mila ho), aur yahi wo aakhri jagah hai jiske aage galat value
  **database** me chali jaati — jahan se use nikalna sabse mushkil hai.

**Locked specs input box me nahi, ek PATTI me dikhti hain.** Jo value badli hi
nahi ja sakti uske liye poora input box rakhna sirf jagah khaata tha — nau box
lagbhag teen qatar le lete the, aur har box sirf ek aisi value dikhata tha jise
chhua bhi nahi ja sakta. Ab wahi nau value `.spec-view` ki chipon wali patti me
hai (ek-do qatar), aur Specifications ka poora hissa aadhe se kam jagah leta hai:

```
┌────────────────────────────────────────────────────────────────┐
│ FABRIC 2.2   CATEGORY MINK   WEIGHT 2.20 KG   SIZE 205×230 CM  │
│ DB/SB DB   PLY SP   SATTAN PREMIUM · 5 INCH SATTAN   MOQ 1000  │
└────────────────────────────────────────────────────────────────┘
```

Asli `<input>` **gayab nahi hue** — unka `.fg` chhup jaata hai
(`ofApplySpecLock_`), input DOM me rehta hai. `getProd`, `collectPayload`,
`learnMasters`, dono PDF renderer aur `applyProductToCard` sab unhi ko
padhte-likhte hain, isi liye is badlaav se **data ka raasta bilkul nahi
badla** — aur patti unhi inputs se padhti hai, to alag se kuch sync karne ki
zaroorat nahi padti (ek sach, do jagah nahi).

Jo field **lock nahi** hai wo patti me nahi, apne asli input ke roop me dikhta
hai — GREY/WHITE FABRIC ka **GSM** (haath se bharta hai), **Emboss**, aur wo
soorat jab Brand Master load hi na hua ho (tab patti khaali rehti hai aur
`.spec-view:empty` use chhupa deta hai, saare purane box wapas dikhte hain).
Sattan ke do field **ek chip** me jude hain — dono ka matlab saath me hi banta
hai. Khaali spec dhundhle **"—"** ke saath dikhti hai, chhupti nahi: patti ka
har baar ek jaisa dikhna padhne me aasan hai, aur khaali spec apne aap me khabar
hai (Brand Master me wo bhari hi nahi gayi).

Teen cheezein jaan-boojh kar **BAAHAR** rakhi gayi hain:

- **Pricing & Delivery** (price, discount, GST, qty, packs) — ye har order ka
  apna sauda hai, brand ki pehchaan nahi. Lock karne ka matlab hota ki rate
  badalne ke liye Brand Master kholna pade.
- **Emboss** — ye order ka faisla hai: ek hi brand ka ek order emboss ke saath
  aur doosra bina ja sakta hai. Lock karte to 🎨 Emboss Design Photos section
  haath se kabhi khulta hi nahi.
- **Transport Name** aur **Agency** — transport order-dar-order badalta hai
  (master me rehta bhi nahi), aur agency sirf ek naam + do contact hai jispar
  koi billing ya tax value nahi tangi.

Char cheezein jo chup-chaap tod sakti thin, aur unka ilaaj:

1. **Locked combo list se badla ja sakta tha.** `readonly` input bhi focus leta
   hai, aur dropdown khulne par `selectCombo()` seedha `inp.value=val` likh deta
   hai — `readOnly` ki parwah kiye bina. Ab `openCombo` / `filterCombo` locked
   field par khulte hi nahi (`comboLocked_`), to ye raasta ek hi jagah band hai.
2. **Khaali master = form thap.** Net kharab / Supabase band / `fetchDrops`
   fail — teeno me `STANDARD_ITEMS` khaali rehta hai. Us waqt lock lagta to
   Item Code chuna na ja sakta (list khaali) **aur** specs bhari na ja sakti
   (locked). Isi liye **khaali list ka matlab "load nahi hua" hai, "value galat
   hai" nahi** — jaanch aur lock dono tab hi lagte hain jab list me kuch HO,
   aur masters aate hi `ofRelockAll_()` lock laga deta hai.
3. **Purana order kholne par uska item code mar chuka ho.** Brand delete ya
   Inactive ho gaya to code `STANDARD_ITEMS` me nahi milta, aur us field ko
   chhoo kar nikalne par blur wali jaanch use khaali kar deti — sirf dekhne ke
   liye khola gaya purana order bigad jaata. Ab `applyProductToCard` saved
   order ki apni values se us code ki entry bana deta hai (jhooth nahi — isi
   code par, inhi specs ke saath wo order bana tha). `DROPS.itemCode` me ye
   NAHI jaata, to naye order me mara hua code offer bhi nahi hota.
4. **Party badalne par purana address locked reh jaata.** `selectCombo` ka
   `setF` pehle `if(e&&v)` tha — khaali value set hi nahi karta tha. Yani jis
   party ka address khaali hai, uspar **pichhli party ka** address box me baitha
   rehta, aur ab field locked hone se use hataana bhi mumkin nahi hota —
   wahi galat address PDF ke bill-to par chhap jaata. Ab khaali value ka matlab
   "khaali karo" hai.

### 💰 Pricing & Delivery — 4 column × 2 qatar, aur No. of Bora ab AUTO

```
Packing Type   Quantity (Pcs)       Price (Rs/KG)   Discount %
No. of Bora    Packing (pcs/pack)   Weight          GST %
```

Kram **jodiyon me** padha jaata hai, qatar me nahi: Quantity (Pcs) ke theek
neeche Packing (pcs/pack) hai, aur un dono se **No. of Bora** banta hai — jo
input hain wo ek saath, aur jo nikalta hai wo unke pehle column me.

**Hisaab ULAT gaya hai:**

| | Pehle | Ab |
|---|---|---|
| Input | No. of Bora + pcs/pack | **Quantity (Pcs)** + pcs/pack |
| Nikalta hai | Quantity = packs × pcs/pack | **No. of Bora = Quantity ÷ pcs/pack** |

Pehle Quantity (Pcs) — jo order ka asli aankda hai aur jispar buyer se baat
hoti hai — **khud type hi nahi ki ja sakti thi**; use paane ke liye ulta hisaab
lagana padta tha. No. of Bora ab readonly + grey hai (wahi roop jo Weight par
hai).

Teen baatein jaan lein:

- **CEIL, exact bhaag nahi.** Bora ek poori cheez hai: 1000 pcs, 48 per bora =
  20.83 — par 20 bora me 960 pcs hi jaate hain, baaki 40 ke liye **21vaan** bora
  lagta hai. Isi liye upar wala poora number liya jaata hai, aur field ke neeche
  ki lakeer asli bhaag bhi dikha deti hai (`1000 ÷ 48 = 20.83 → 21 (aakhri
  adhoora)`), amber me, taaki pata rahe ki aakhri bora poora nahi bharta.
- **Weight ab `Qty × per-pc weight` hai**, `packs × pcs/pack × wt` nahi. Pehle
  wala chalta tha kyunki tab qty KHUD `packs × pcs/pack` hoti thi (dono
  barabar). Ab packs upar-ka-poora number hai, to `packs × pcs/pack` qty se
  **zyada** ho sakta hai — 1000 pcs par 21 × 48 = 1008 — aur wahi 8 pcs ka
  extra weight bill me chala jaata. Label bhi badal kar **(Qty×Wt)** kar diya
  gaya hai.
- **pcs/pack 0 ho to No. of Bora CHHUA hi nahi jaata.** 0 se bhaag dena
  `Infinity` deta, aur purana order kholne par uski saved packs value bhi mit
  jaati. Isi wajah se `applyProductToCard` me `calcPackQty` **nahi** chalaya
  jaata — saved `packs` jaisa hai waisa rehta hai (purane order me qty = packs ×
  pcs/pack thi, to ulta hisaab wahi number deta, par wo `calcTotalWeight` bhi
  chala deta aur haath se adjust kiya hua `totalWeight` mit jaata). Sirf dekhne
  ke liye khola gaya order badalna nahi chahiye.

### 🎒 Bags & Trims — material list Brand Master se

> **Setup:** pehle `BRAND_TRIMS_MIGRATION.sql` chalayein, phir har brand par
> material YES/NO bharein. Warna table me sirf Bora Packing Charge row rahegi.

Pehle ye table har brand par ek jaisa tha: chhe fixed row (Label / Tag / Bag /
Bore / Inner Box / Outer Box) **hamesha**, aur baaki material "Add Row" se
haath se. Natija — jis brand par Bora nahi lagta uspar bhi Bore ka row baitha
rehta, aur jis par Dori lagti thi wo yaad rakhne par depend karti.

Ab list **Brand Master** tay karti hai: jis material par us **Item Code** ke
saamne **YES** likha hai, usi ka row banta hai. Manual **Add Row hata diya
gaya** — do raaste rakhne ka matlab hota ki master kabhi poora sach na bane.

**16 material** ho sakte hain (`OF_MATERIALS`):

| | Material | brand_master column |
|---|---|---|
| **fixed** (6) | Label · Tag · Bag · Bore · Inner Box · Outer Box | `label` · `tag` · `bag` · `bore` · `inner_box` · `outer_box` **← naye** |
| **extra** (10) | Micro / Small / Big Label · Tag 1 / 2 / 3 · Dori · Insert Card · Barcode Sticker | pehle se maujood 9 |
| | Foam | `foam` **← naya** |

**🟡 "Bora Packing Charge" row HAMESHA dikhti hai** — wo material nahi, packing
ki mazdoori hai, aur har order par lagti hai.

Do tarah ke row ka farq **DB tak jaata hai**:

- **fixed:true** — in chhe ke apne column `sales_trims_log` me hain
  (`label_pcs`, `bore_rs`, `inner_box_disc` …) aur PDF ke packing table ka
  **12-column do-tier header** inhi par bana hai. Row **chhup** sakti hai, par
  uski jagah DB me rehti hai (0 ke saath) — warna wo table aur wo header dono
  todne padte.
- **fixed:false** — baaki material. `full_order` JSON ke `extraTrims` me jaate
  hain aur PDF ki apni **ADDITIONAL PACKING MATERIALS** table me chhapte hain.

Paisa kahan judta hai, wo **nahi badla**: extras ka cost fixed trims ke saath
hi `trimsCostPerPc` / `trimsCostTotal` me judta hai (`getProd` +
`trimsCostTotalFor`), to order ka total, GST, bill summary aur dono PDF is
badlaav se achhoote hain. Sirf ye badla ki **rows kaun tay karta hai**.

Chaar baatein jo chup-chaap galat ja sakti thin:

1. **Chhupti row ZERO bhi hoti hai.** Sirf `display:none` karna sabse mehnga
   bug banata: Bore par SIHF + 500 pcs bhara ho, phir aisa Item Code chuna
   jaye jispar Bore NO hai — row gayab, par `getProd` use DOM se padhta rehta
   aur us **chhupi row ka paisa order ke total me jud kar PDF tak** chala
   jaata. Isi liye chhupate waqt `supp='na'` karke `onSupp()` chalaya jaata
   hai, jo teeno input zero aur disable kar deta hai.
2. **Pack Type badalne par bhi list dobara jaanchi jaati hai.**
   `onPackTypeChange` saare fixed trims ko `'na'` karke Label ko (aur Bora par
   Bore ko) `'foc'` kar deta hai — **chhupi rows par bhi**. Us `foc` ka paisa 0
   hota hai, par wo PDF ke packing table me us material ke saamne "FOC" chhaap
   deta, jo us brand par lagta hi nahi. Ab render dobara chalta hai aur chhupi
   rows wapas `'na'` par aa jaati hain. Jo pehle se bhara hai wo **preset
   bankar wapas aata hai**, to Pack Type badalne se typed pcs / cost udti nahi.
   (Item Code badalne par jaan-boojh kar aisa **nahi** hota — wahan brand hi
   doosra hai, to pichhle brand ki cost carry karna galat hota.)
3. **Purana order kholne par saved row dikhti hai, aaj ki list chahe kuch
   kahe.** Brand ki list baad me badal sakti hai (kisi ne Bore ko NO kar
   diya); tab purana order kholne par wo row chhup jaati **aur** zero ho
   jaati — yani sirf dekhne ke liye khola gaya order dobara save karte hi apna
   Bore ka paisa kho deta. `applyProductToCard` `keepFixed` + `extraPresets`
   bhejta hai, to **jo bhara tha wo dikhta hai** — wo material bhi jo aaj ki
   list me hi nahi hai (purane order me haath se joda gaya tha).
4. **Khaali table toota hua lagta hai.** Ek bhi material row na bache to table
   khud wajah likhti hai — teen me se ek: Item Code chuna nahi, is brand par
   sab NO hai, ya `BRAND_TRIMS_MIGRATION.sql` abhi chali nahi (ye teesri baat
   amber me likhi aati hai).

**`tag` aur `tag_1` DO alag column hain** — dono YES hon to dono rows banengi.
Order Form ka purana "Tag" row aur Excel ka "TAG 1" ek hi cheez hain ya nahi,
ye brand-dar-brand badalta hai, isi liye jodd nahi kiya gaya. Jo na chahiye
use **NO** rakhein.

### ➕ Add New Brand Item — Brand Master ke saare 45 column

Item Code sirf list me se chunna hai, to naya brand banane ka raasta isi form
me hona zaroori tha — warna ek naye SKU ka order lene ke liye ERP kholna padta
aur Order Form beech me chhodna padta.

Button Item Code ke sirhane hai. Popup me **saare 45 column**, wahi kram aur
wahi grouping jo ERP › Master Data › 🏷️ Brand Master ke form me hai:

| Group | Column |
|---|---|
| 🏷️ Identity | Item Code **★** · Fabric Name **★** · Category **★** · Blanket Weight |
| 📐 Specifications | Size · Bed Size · Blanket Ply · Sattan Size · Sattan Type · MOQ · Emboss · Notes |
| 💰 Rates | Price/KG · Packing Pcs · Label · Tag · Bag · Bore · Inner Box · Outer Box · Bale |
| 📦 Packing 1 | Master Req / Type · Slave Req / Type |
| 📦 Packing 2 | wahi chaar, `_2` (khaali chhoda ja sakta hai) |
| 🏷️ Materials / Trims | Label · Tag · Bag · Bore · Inner Box · Outer Box · Foam · Micro / Small / Big Label · Tag 1 / 2 / 3 · Dori · Insert Card · Barcode Sticker — **inhi ke YES par Bags & Trims ki rows banti hain** |

- Zaroori sirf **teen**: Item Code, Fabric Name, Category — bilkul jaisa ERP me
  `req:1` hai.
- Form **JS se banta hai** (`BR_FORM_FIELDS` → `brBuildForm_()`), markup me
  nahi: 45 field ka hand-written HTML ek jagah column jodne par doosri jagah
  bhoolne ki poori guarantee hai. **Wo table ERP ke `SARV_BR_FIELDS` ki copy
  hai — ek jagah column jude to yahan bhi jodna hai.**
- Dropdown values **ERP ke `erp_*` keys** se aati hain (`erp_brandCategory`,
  `erp_brandSattan`, `erp_fbmYesNo` …). Wo usi `sales_dropdowns` table me hain
  jisme Order Form ke apne dropdown hain, aur `fetchDrops` table ki saari keys
  `DROPS` me daal deta hai — to seedha mil jaate hain. `BR_DD_FALLBACK` sirf
  fallback hai aur jaan-boojh kar store-core ke `def` arrays ki hu-ba-hu copy
  hai; dono me farq aane par Brand Master me bhari value Order Form me match
  nahi karegi.
- **Fabric Name** suggestion-list hai (hard lock nahi) — `fabric_master` se
  bhari jaati hai, par us table ke na milne par naya brand banana ruk jaata,
  jo is button ke hone ka matlab khatam kar deta.
- Save hote hi brand **Item Code list me aa jaata hai aur usi product card me
  chun bhi liya jaata hai** — `onItemCodeSelect()` saari specs bhar kar lock
  bhi laga deta hai. `bmToItem()` se wahi tarjuma hota hai jo `fetchDrops`
  karta hai (DOUBLE BED → DB, SINGLE PLY → SP waghairah).
- Khaali number **0 nahi, `null`** jaata hai — 0 ka matlab yahan "set nahi hai"
  hai aur Order Form use skip karta hai, par `null` hi us column ka asli
  default hai (ERP ka form bhi wahi likhta hai).
- Baaki sab wahi jo Buyer / Agency par hai (neeche dekhein): seedha
  `brand_master` insert, best-effort `master_revisions` archive, duplicate
  check master par, Viewer ko band, **koi migration nahi**.

### ➕ Add New Buyer / ➕ Add New Agency — entry form se hi

Buyer Details section me do button hain, apne-apne field ke sirhane:
**Buyer / Company Name** par `➕ Add New Buyer`, **Agency Name** par
`➕ Add New Agency`. Dono popup me us master ke **saare column** hote hain,
wahi kram jo ERP › Master Data › 🏢 Buyer Master ke form me hai:

| Add New Buyer (`buyer_master`) | Add New Agency (`agency_master`) |
|---|---|
| **Party / Company Name** * | **Agency Name** * |
| Owner Name → Order Form ka *Contact Person* | Agency Contact Person |
| Contact No. → Order Form ka *Mobile No.* | Agency Mobile No. |
| Address → PDF ke bill-to par | Notes |
| GSTIN → state + CGST/SGST vs IGST | |
| Party Staff Name | |
| Party Staff Contact No. | |
| Notes | |

Sirf naam (`*`) zaroori hai. Pehle nayi party ka naam seedha combo me type kar
diya jaata tha — order ban jaata, par us party ka **address aur GSTIN kahin
master me nahi jaate**, to agle order par wo dono dobara haath se type hote
(aur GSTIN me ek digit idhar-udhar ho jaati). Ab yahan se wahi row banti hai
jo ERP ka form banata hai.

Kaam karne ka tareeka:

- **Wahi table, wahi shape.** `buyer_master` / `agency_master` me seedha
  insert, `is_active:true, rev_no:1, created_by, updated_by` ke saath —
  bilkul jaisa `store-core.js` ka `sarvFbmSaveForm()` karta hai. Us screen par
  bhi **yahi anon key** chalti hai, isi liye RLS yahan bhi wahi raasta deta
  hai aur alag RPC banane ki zaroorat nahi padi (banayi bhi nahi ja sakti
  thi — Order Form ki migration SQL is tree me nahi hai). **Koi migration
  nahi.**
- **Combo me jo naam type ho chuka hai wahi popup me aage bhar jaata hai** —
  "add new" aksar tab dabaya jaata hai jab naam type karke list me mila na ho.
- Save hote hi party **dropdown me aa jaati hai aur chun bhi li jaati hai**,
  aur uske saath Contact Person / Mobile / Address / GSTIN bhi bhar jaate hain
  (GSTIN se *Out of Haryana* checkbox bhi khud lagta hai). Poora `fetchDrops`
  dobara nahi chalaya jaata — wo user ka adha bhara form chhed deta.
- **Duplicate check sirf MASTER par** (`BUYER_MASTER_ROWS` /
  `AGENCY_MASTER_ROWS`), `BUYER_DETAILS` par nahi. Wo doosri cheez purane
  orders + master **milakar** banti hai; us par check karte to jis party ka
  order pehle se hai par master me row nahi, wo "pehle se hai" keh kar rok di
  jaati — jabki usi ko master me daalna sabse zaroori kaam hai. Check
  case aur extra space ignore karta hai, aur Inactive row mile to wo bhi
  batata hai (use ERP se wapas Active karna hota hai).
- `master_revisions` ka archive **best-effort** hai, bilkul jaise ERP me hai:
  wo table na ho to warning console me jaati hai aur party phir bhi save hoti
  hai. Ek history row na banne se party ka save rok dena ulta nuksan hai.
- **Viewer** role ko dono button disabled milte hain (`applyRoleRestrictions`
  `.wrap` ke saare button band kar deta hai), aur `openNewBuyer` /
  `saveNewBuyer` dono me `canDo('create')` ki apni jaanch bhi hai.
- Popup **backdrop click ya Esc se band nahi hota** — buyer form me aath field
  tak bhari hoti hain, aur ek galat click se wo sab chala jaana sabse bura
  nateeja hai. Band karne ka ek hi raasta: **Cancel**. Enter se save hota hai,
  par sirf single-line field par (Address textarea me Enter ka matlab nayi
  line hai). Wahi niyam mobile app ki New PR sheet par bhi hai.

Agar RLS ne kabhi write roka, to popup me seedha wahi likha aata hai
("…permission nahi hai — ERP › Master Data › 🏢 Buyer Master se add karein"),
chup-chaap fail nahi hota.

### Sattan — Type aur Size, do alag dropdown

Item Specifications me Sattan ab **ek** combo nahi, **do** dropdown hai:

| Order Form | Brand Master column | Values |
|---|---|---|
| **Sattan Type** | `sattan_type` | STANDARD · PREMIUM · NA |
| **Sattan Size** | `sattan` | 4 / 5 / 6 INCH SATTAN · NA |

Pehle ek hi field me `5" PREMIUM` jaisi **joint** value likhi jaati thi, jabki
Brand Master me ye shuru se do column hain — isi liye Item Code chunne par
banayi hui joint string kabhi wapas match nahi hoti thi. Ab dono dropdown ki
values **Brand Master ki hi vocabulary** me hain, to **Item Code select karte
hi dono apne aap chun jaate hain**.

Do baatein jaan lein:

- **`sattan` naam ka ek hidden field** ab bhi form me hai, jisme dono ka jodd
  (`5" PREMIUM`) likha rehta hai. `getProd`, `learnMasters`,
  `sales_product_details` ka `sattan` column aur **dono PDF renderer** usi ko
  padhte hain — isi liye **koi migration nahi** chali aur PDF ka "Sattan"
  column bilkul pehle jaisa chhapta hai.
- **Purane order** me sirf joint value thi. `setSattan()` use todkar dono
  dropdown bhar deta hai (`sattanSplit_`), to Edit par Sattan khaali nahi
  milta aur dobara save karne par udta bhi nahi.

Brand Master me koi nayi value aa jaye (jaise `7 INCH SATTAN`) to
`ensureOpt_()` use dropdown me khud jod deta hai — `<select>` me value list se
hu-ba-hu milni chahiye, warna wo **chup-chaap** set hi nahi hoti, aur yahi is
app ki purani chot thi. Dono ki apni rows **ERP › Dropdown Master** me hain
(`sattanType` / `sattanSize`); purani `sattan` row record ke liye chhodi gayi hai.

### Bags & Trims — "➕ Add Row" wale extra materials

Upar ke **chhe trim** (Label / Tag / Bag / Bore / Inner / Outer) fixed hain —
unke apne column `sales_trims_log` me hain aur PDF ka packing table unke
do-tier header par bana hai. Par asli packing me in chhe ke alawa bhi cheezein
lagti hain, aur wo order-dar-order badalti hain. Isi liye wo list ab **Add Row**
se chalti hai:

**Material** dropdown — MICRO LABEL · SMALL LABEL · BIG LABEL · TAG 2 · TAG 3 ·
DORI · INSERT CARD · BARCODE STICKER · FOAM — aur uske against wahi chaar input
jo baaki trims par hain: **Supplied By · No. of Pcs · Cost/Pc (₹) · Discount%**.
Niyam bhi wahi: paisa tabhi bharta hai jab Supplied By = **SIHF Supplied**,
warna teeno input band aur 0.

Paisa kahan judta hai — **ek hi jagah**: `getProd` me extras `trimsCostPerPc` /
`trimsCostTotal` me fixed trims ke SAATH jud jaate hain, aur
`trimsCostTotalFor()` (jo save aur PDF dono chalate hain) me bhi. Isi se
product ka exGST, GST, Final Price/Pc, bill summary, PDF ka Trims Cost column
aur Grand Total **sab apne aap** sahi ho jaate hain — har jagah alag se jodna
padta to ek jagah chhoot jaana tay tha.

Save kahan hota hai:

| Kya | Kahan | Migration? |
|---|---|---|
| Poori detail (material, supplier, pcs, cost, disc) | `sales_orders.full_order` → `products[].extraTrims` | **nahi** |
| Paisa | `sales_trims_log.total_trims_rs` (fixed trims ke saath joda hua) | **nahi** |

`sales_save_order` RPC ki SQL is project tree me **nahi** hai, to ye pakka
nahi kiya ja sakta ki wo koi anjaan key chup-chaap chhod degi ya error degi —
aur ek galat guess poora save tod deta. Isi liye us RPC ko **koi nayi key nahi**
bheji jaati: paisa maujooda column me jaata hai, aur detail `full_order` me,
jahan se Edit button order wapas kholta hai (`applyProductToCard` rows ko
waise hi dobara bana deta hai — supplier, pcs, cost, discount aur
enable/disable haalat sab saved jaisi).

PDF me inki **apni table** hai — packing table ke theek neeche,
**ADDITIONAL PACKING MATERIALS**. Usi grouped table me nahi ghusaya gaya kyunki
wo chhe fixed trims ke do-tier header par bana hai. Jis order me ek bhi extra
row na ho, wahan ye table (heading ke saath) **poori chhup** jaati hai.

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

## 🎨 Production › Design Master — Design SKU No aur Catalogue

Setup: `DESIGN_MASTER_MIGRATION.sql`, `DESIGN_SUPPLIER_MIGRATION.sql`, phir
**`DESIGN_SKU_MIGRATION.sql`**.

### Design SKU No — Design No se alag cheez

**Design No** design ki pehchaan hai; **SKU No** use bechne / stock karne ki.
Isi liye do alag column (`design_master.design_no`, `design_master.design_sku_no`),
aur SKU No har jagah Design No ke theek baad baithta hai:

| Kahan | Kaisa |
|---|---|
| **Create New** › 1. Design Specifications | Design No ke baad, **bharna zaroori** |
| **Live** tab | Design No ke baad apna column, apna ▾ multi-select filter, aur upar wale search me bhi aata hai |
| **Bulk Upload** grid | Design No ke neeche apna box — **optional**, kyunki purane data ke saare SKU pata nahi hote; jo chhoot jaaye wo Live › ✏️ Edit se lag jaata hai |
| **Catalogue PDF** filters | apna multi-select (Design No ka text box alag hai; dono AND se lagte hain) |
| **Catalogue PDF** | cover page ki spec table me `DESIGN NO` ke saath `SKU NO` |
| ✏️ **Edit** popup | optional — purane design ka SKU na pata ho to record kholna band nahi hona chahiye |

**Duplicate SKU par rok nahi, sawaal hai:** "SKU No X pehle se design Y par hai —
phir bhi save karna hai?" Typo pakda jaata hai, par jaan-boojh kar ek SKU do
design par rakhna bhi mumkin rehta hai. Database par `UNIQUE` isi liye nahi
lagaya; hamesha-unique chahiye to `DESIGN_SKU_MIGRATION.sql` me commented unique
index hai (pehle duplicate hata lein — file me query likhi hai).

Migration se **pehle** bhi screen poori chalti hai: SKU ke boxes dikhte hain, bas
us ek column ko save se chhod diya jaata hai (`skuPatch`) aur app ek baar saaf
keh deti hai ki `DESIGN_SKU_MIGRATION.sql` chalani hai. Khaali database par pehla
save khud pata kar leta hai (`dmWriteDesign` ek baar bina SKU dobara bhejta hai),
isi liye kabhi "column does not exist" wala poora save fail nahi hota.

### Catalogue PDF — Bed Size / SKU filters, aur preview apne aap

- Filters me **BED SIZE** aur **DESIGN SKU NO** bhi aa gaye. Baaki filters ki
  tarah ye bhi **dependent** hain — ek tick hatate hi doosre columns me se
  bemaani options gayab ho jaate hain.
- **Neeche ki preview filter chunte hi apne aap ban jaati hai** — "Generate
  Preview" dabane ki zaroorat nahi (`renderCatalogueFilters` → `dmCatSchedulePreview`,
  220 ms ka debounce, aur sirf jab Catalogue tab khuli ho).
- Bahut bade selection par auto-preview sirf pehle **40** designs render karti
  hai (`DM_CAT_AUTO_MAX`) aur amber line me likh deti hai kitne bache — warna
  ek tick par sau-sau page ka DOM banta aur tick karna hi atak jaata.
  **⚡ Generate Full Preview** us hadd ke bina chalta hai, aur **PDF par is hadd
  ka koi asar nahi** — Download / Open hamesha poore selection ki banti hai.

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

### 🏠 Order Form Home — MTO / MTS → Lot Card

`order-form.html` ab seedha form nahi, **Home** se khulta hai:

1. **Make to Order** / **Make to Stock** — dono ki apni series:
   `MTO-SIHF/2026-27/0001`, `MTS-SIHF/2026-27/0001` (FY Apr–Mar IST; 1 April
   ko khud 0001). Type ka koi column nahi — **Order No ka prefix hi type hai**
   (`ofTypeOf`). Number client par banta hai (`ofNextOrderNo`, ERP ke
   `nextNo()` jaisa); DUPLICATE par isi series ka agla. Purane bina-prefix
   number (`SIHF/2026-27/001`) MTO me, "OLD NO" tag ke saath.
   `sales_next_order_no()` ab sirf connection check hai. **Koi migration nahi.**
2. Har type me: **New Order** · **Existing Quotation** (Saved + Sent to
   Party + anjaan status) · **Confirmed** · **Hold** · **Cancel** · **Close**
   (`OF_BUCKETS`). Bottom bar me 🏠 se wapas Home.
3. Confirmed / Hold / Closed order ke card par **🏭 Lot Cards** box — har
   PRODUCT ka apna lot. **🧾 Generate Lot Card** (sirf Confirmed) Printing Lot
   kholta hai: header order se bhara (party, brand = item code, fabric,
   category, bed size, ply, weight, size, satin quality, emboss, qty, packing),
   design / remarks / label-tag worker notes me, LOT NO = sabse bada numeric +1
   (sujhaav), aur order ki saari photos **pehle se chuni** (picker me hata
   sakte hain; photo lot ke apne bucket me copy hoti hai). Lot ban chuka ho to
   **📍 Track LOT …** (status · sections done) → Production tab.
4. Jodd: `prl_lots.order_no` + `prl_lots.extra.src_order_line` (aur
   `src_order_no / src_order_type / src_item_code`). Hand-off localStorage key
   `sarv_prl_handoff` (v:1, 15 min) — shape `ofGenerateLot()` me, padhne wala
   `prlRunHandoff_()`. ERP ke andar `sarvNavigateFromHome('PRINTING_LOT')`,
   bahar naya tab.

⚠️ Server ka niyam pehle jaisa: Confirmed order **Edit + Submit** karne par
status wapas **Saved** ho jaata hai (`sales_save_order`) — order Existing
Quotation me chala jaata hai; bane hue lot juḍe rehte hain.

## 🧵 Trims & Packing Material Manager (Manufacturing)

`trims-manager.html` — ERP › Manufacturing › Trims Manager. Ek Sales Order ke
kaun-kaun se trims / packing material chahiye, kis lot ke liye kitne, PR kis par
bani, PO kab aaya, maal kitna aaya aur kitna lot ko issue hua — sab ek sheet par.

Setup: `TRIMS_MANAGER_MIGRATION.sql`, phir **`TRIMS_MANAGER_V2_MIGRATION.sql`**.

### ORDER NO · LOT NO — list se, ya haath se

| | Kahan se |
|---|---|
| **ORDER NO** dropdown | saved Sales Orders (`sales_orders`) — Order Qty, Buyer, Order Date sab wahan se |
| **ORDER NO** ✎ Manual | khud likha hua. Order Form me iska koi record nahi, isliye sheet khud poochti hai |
| **LOT NO** list se | saved Lot Cards (`mfg_lot_cards`) — Lot Req Qty lot card se bharti hai |
| **LOT NO** haath se | jo Lot Card me nahi hai. Confirm maangti hai; Lot Req Qty manual |

**Manual Order ya manual Lot = MANUAL sheet**, aur phir amber bar aati hai:
**Party Name · Brand Name · Design 1 · Design 2 · ➕ ADD More Designs**
(Design 3, 4, 5 … ki koi hadd nahi). Teeno **zaroori** hain — inke bina Save nahi
hota, kyunki poore ERP me inka doosra koi ghar nahi, aur PDF / CSV / Saved Sheets
register teeno chhapte hain. Saved Sales Order par ye bar dikhti hi nahi.

### NEW PR — sheet se hi PR ban jaati hai

**Lot Req Qty** ke theek baad ek **NEW PR** tick column (Item Master ke NEW PR
column jaisa), aur upar toolbar me **📝 Generate New PR (n)**. Tick karke dabane
par ERP ka **Purchase › New Entry** form khul jaata hai, usi me wo saare item
bhar jaate hain:

| | |
|---|---|
| PR qty | **Final PO Qty** = Lot Req × (1 + Wastage%) — kharidna yahi hai, Lot Req nahi |
| Item ka Description / Make / Category / UOM | **Item Master se**, trims sheet se nahi (jo master kehta hai wahi PR par chhape) |
| PR line ka remark | `Trims: Order <no> · Lot <no> · <item> · Wastage x%` — Purchaser ko bina Trims Manager kholne pata ho ye kis order ka hai |
| Purchaser Name | item ki Category se (`category_purchasers`), jaise haath se bhari row par |
| Required By · Machine | **khaali** — ye do user hi bharta hai, phir Submit |

Tick **tabhi** hota hai jab row par **Store Standard Name** (Item Master item)
ho aur **Final PO Qty > 0** — PR us `item_id` par bandhti hai, aur inke bina
bandhne ko kuch nahi hota. Checkbox ka tooltip wajah likh deta hai. Supplier
**BUYER / FOC** wali row tick ho sakti hai, par bhejne se pehle poocha jaata hai
(wo maal hum kharidte nahi).

**PR Submit hote hi uska number WAPAS sheet ke PR NO. column me aa jaata hai** —
unhi rows par jinse wo bani thi — aur wahi link PO No / Target Date / Qty
Received chalu kar deta hai. Sheet apne aap save nahi hoti: amber banner
"PR xyz … abhi save nahi hui" Save dabane tak baitha rehta hai.

Code kahan hai: PR ka form ERP ke page par hai aur Trims Manager uske iframe
me, isi liye trims sheet sirf poochti aur bhejti hai —
`store-core.js › sarvGenerateNewPrFromTrims` form bharta hai,
`sarvTrimsPrNotify_` save hone par wapas khabar deta hai, aur trims sheet ka
`window.trimsPrSaved` PR No rows par lagata hai. Item Master se bani PR aur
isse bani PR ek hi do helpers se guzarti hain (`sarvPrFillRequester_`,
`sarvPrWireMachineCopy_`), to dono bilkul ek jaisi bharti hain.
**Access:** `HOME_PR` — jo PR ka form khol sakta hai, wahi yahan se PR bana
sakta hai (Item Master wala Admin-only `MD_ITEM_NEWPR` jaan-boojh kar nahi,
kyonki trims sheet bharne wala merchandiser hi PR raise karta hai).

### PR NO. → PO NO. — user PR chunta hai, PO khud aata hai

Pehle PO No. haath se chunna padta tha, matlab PO banne ka intezaar karke sheet
dobara kholna. Ab:

1. **PR NO.** column me dropdown — `purchase_requirements` ki list. Jis item ki
   PR hai wo upar apne heading me (`✓ Is item ki PR`), baaki neeche. (Ya upar
   wale **NEW PR** se wo apne aap lag jaata hai.)
2. Purchase us PR ke against PO banata hai → **PO NO.** column me wo PO apne aap
   aa jaata hai (hari cell, neeche vendor ka naam). Jod `purchase_order_lines.req_no`
   hai — sheet me kuch dobara likhna nahi padta.
3. **Target Date** us PO ki `delivery_date` se khud bhar jaati hai (ek PR par kai
   PO ho to **sabse pehli** date — wahi chalani hai).
4. **Qty Received** us PO ke against uss item ka inward. PO ke bina seedha PR par
   book hui receipt (FIELD BOY wali "without PO") bhi isme gini jaati hai, aur do
   baar nahi — dono ka hisaab alag rakha jaata hai.

PO abhi na bana ho to cell amber me **⏳ PO pending** kehti hai (summary me bhi
"PR → PO Pending" ginti). **✎** se PO haath se pin kar sakte hain (purane order
ke liye jinki line par `req_no` nahi hai), **↺** se phir auto par.

### Lot Issue · Pending Issue

- **Lot N Issue** — Store ki ISSUE entry se uss lot ke against uss item ki qty,
  aur **neeche har issue ki date**. Hover par issue document no + har issue ki qty.
- **Pending Issue = Qty Received − Total Lot Issue** — jo maal store me aa gaya
  par abhi lot ko nahi diya. Neeche chhoti line Lot Req se kami/zyada batati hai
  (`Req short 120` / `Req pura` / `OVER issued`), taaki wo item bhi dikh jaaye jo
  kam hai **kyunki aaya hi nahi**.

### Store Issue — saved Lot se poori item list

`index.html` › Outward Desk › Entry Type **ISSUE** › **LOT No.**:
**📋 Saved Lot** button me wahi lot aate hain jinki Trims sheet saved hai. Ek
click par:

- us lot ki poori **required item list** rows me bhar jaati hai (Item Master se
  Description / Category / UOM), Qty me **pending** qty;
- har item ke neeche **sub-row** — `LOT: 1001 · Required Qty · Pending Issue ·
  Issued Qty · Excess Issue` — bilkul usi tarah jaise PO ke against Inward me PO
  ki sub-row aati hai (dono ek hi `docStripParts_` se bani hain);
- **Issue PDF** me wahi sub-row chhapti hai, aur header me Trims Order No ·
  Party · Brand · Design.

Lot box me koi aur batch no. likhein to kuch nahi badalta — jaisa pehle tha.
⚠️ **Machine Name & No. ISSUE par har row par zaroori rehta hai**, lot se bhari
rows par bhi: lot batata hai *kaun sa maal* nikla, machine batati hai *kahan gaya*.

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

| App | Apna login window | Pehchaan kahan se |
|---|---|---|
| **launcher.html** | **haan — sirf yahan** | naam + PIN → `erp_app_login()` |
| ERP (index.html) | nahi | launcher ka session (token na ho to seedha launcher) |
| Approval App (mobile) | nahi | wahi |
| Order Form | nahi | launcher ka session + `sales_erp_login` ka token |
| Complaint App | nahi | launcher ka session + `erp-sso` ka auth session |
| Packing & Dispatch | nahi | wahi |

**Ek darwaza — ab sach me ek.** Pehle har app ka apna login tha: Packing ka
username + password (`packing.profiles`), Complaint ka Supabase Auth login +
signup (`cmp_profiles`), Order Form ka naam + PIN (`sales_login`). Teen login,
teen user list, teen jagah "kaun hai" ka jawab — aur wahi saari ulajhan isi
se banti thi (ERP me access ON par bhi app ka account na hona, app ka password
kisi ko yaad na hona, ek hi aadmi do list me do naam se baithna).

Ab wo teeno login **hata diye gaye hain**, aur unke saath
`sb.auth.signInWithPassword()` / `signUp()` / `sales_login` wale raaste bhi.
Sab kuch `sso-gate.js` se hota hai, aur wo koi login form nahi dikhata — jo
screen dikhti hai wo sirf **wajah** batati hai aur "← Apps par wapas" deti
hai, kyunki wahan se andar jaane ka koi doosra raasta hi nahi hai.

Logout bhi har app me ek hi hai: ERP ka session server par revoke, auth
session band, app ke local nishaan saaf, aur `launcher.html?bye=1` — jahan
"Logout ho gaya" likha aa jaata hai. Session beech me khatam ho jaaye to wahi
raasta, `?why=SESSION_REVOKED` jaisi wajah ke saath.

> ⚠️ **Ek shart jo pehle narmi se chhup jaati thi.** Complaint aur Packing ka
> data Supabase Auth par chalta hai, aur wo auth session sirf `erp-sso` banata
> hai. Pehle wo fail hone par app apna password maang leti thi; **ab koi
> fallback nahi hai** — us user ke liye app khulegi hi nahi (wajah screen par
> likhi aayegi). Isi liye ye badlaav live karne se pehle do cheezein pakki
> honi chahiye: `erp-sso` ka naya version **deploy** ho, aur Complaint /
> Packing wale har user ka account bana ho (`sql/CHECK_PACKING_SSO.sql` ki
> report me sab `DIRECT LOGIN OK`).

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

### Packing / Complaint ka direct login — ek shart

Launcher par **Packing ka button lagbhag sabko dikhta hai**: access ka
default `true` hai (`launcher.html › appAllowed` — per-user ya role-wise rok
na ho to app khuli maani jaati hai). Par *direct* login (bina us app ka apna
password) ke liye access kaafi nahi — us bande ka **us app ka account** bhi
hona chahiye:

| App | Kya hona chahiye |
|---|---|
| Packing | `auth.users` me row (usi id se) **+** `packing.profiles` me row, `active = true` |
| Complaint | `auth.users` me row (usi id se) **+** `app_users.cmp_username` bhara hua |

Dono cheezein **Admin Panel › Users › Apps** me us app ka switch **ON** karne
par khud banti hain — `admin_grant_app_access()` us app ki row banata hai, aur
auth account `erp-sso` Edge Function (`action: "provision"`). Switch ka
tri-state yahan maayne rakhta hai: **`auto` se account nahi banta**, kyunki
`auto` ka matlab "role-wise matrix jo kahe" hai. Jiska switch `auto` /  OFF
hai, uske liye `erp_app_session()` ka `pk_profile_id` / `cmp_profile_id`
**null** aata hai — app andar le jaane ki jagah apna purana
username/password maang leti hai.

> **Ye pehle tootta tha.** Admin Panel ka Apps switch sirf `app_access` ka
> jsonb likhta tha (`admin_set_user_app_access`) — `admin_grant_app_access()`
> aur Edge Function ka provision raasta maujood the, par **unhe koi bulata hi
> nahi tha**. Isi liye Admin switch ON karta tha, toast "save ho gaya" kehta
> tha, aur user ke saamne phir bhi `NO_APP_ACCOUNT` aata tha. Ab wo switch
> dono kaam karta hai, aur Apps list me un dono apps par "ON = account bhi
> banega" likha rehta hai.

#### Auth account — teen haalat

`admin_grant_app_access()` `AUTH_USER_MISSING` kehta hai, jiska matlab sirf
itna hai ki **is id par** auth account nahi hai. Aage teen raaste hain:

| Haalat | Kya hota hai | Deploy chahiye? |
|---|---|---|
| Account usi id par hai | kuch nahi — seedha grant | nahi |
| Account hai, par **doosri id** par | `erp_link_existing_auth_account()` use dhoondh kar `app_users.id` usi par le aata hai (`erp_relink_user_id` — PIN key, sessions, resets, Order Form mirror sab ek saath), phir grant | nahi, sirf `FIX_APP_ACCOUNT_PROVISION.sql` |
| Account hai hi nahi | `erp-sso` ka `provision` naya banata hai (`service_role` sirf wahan hota hai) | **haan** |

Doosri haalat sabse aam hai, aur pehle wahi tooti thi: provision seedha naya
account banane jaata tha aur GoTrue *"A user with this email address has
already been registered"* de deta tha.

Ek chauthi haalat bhi hai, aur wo **access ka masla hi nahi** hai: `app_users`
me us bande ki **do rows** hon (jaise "PARKASH" aur "PARKASH JI", dono
emp_code 1460), aur auth account doosri row par baitha ho. Ek id do rows par
nahi ho sakti, isi liye `erp_link_existing_auth_account()` saaf mana karta hai
(`AUTH_ACCOUNT_TAKEN`) — chup-chaap jod dena do logon ki pehchaan mila dene
jaisa hota. Ilaaj `sql/MERGE_DUPLICATE_USERS.sql` hai: duplicate row ko KEEP
row me milao, phir access do.

Teesri haalat bhi tooti thi — *"Database error creating new user"*. Wajah:
Edge Function `user_metadata.name` bhejta tha, aur us par `auth.users` ka
trigger `cmp_handle_new_auth_user()` chal padta hai (wo sirf `name` hone par
chalta hai) aur `app_users` me us bande ki **doosri** row banane ki koshish
karta hai — naye auth id par, naam se bana `cmp_username` aur wahi
`contact_no` le kar. Dono par unique index hai
(`app_users_cmp_username_key` / `app_users_cmp_mobile_key`), to takraav pakka,
aur trigger ka exception GoTrue ke andar dab kar wahi generic message ban
jaata hai. Aur insert chal bhi jaata to agla qadam girta:
`erp_relink_user_id()` `NEW_ID_TAKEN` kehta hai jab nayi id par row maujood
ho — aur row wahi trigger abhi banakar aaya hota. Yani ye raasta kisi bhi
**maujooda** ERP user par chal hi nahi sakta tha.

Ab Edge Function `name` bhejta hi nahi (trigger beech me aata hi nahi; naam
app_users me pehle se hai aur `cmp_username` `admin_grant_app_access()` khud
bharta hai) aur naye account ka `id` khud deta hai — isi liye relink ki
zaroorat hi nahi padti. Puraane GoTrue par `id` ignore ho jaaye to fallback
relink hai, aur wo ab surakshit hai.

Pehle ye haalat **chup-chaap** hoti thi (wajah sirf browser console me).
Ab `packing.html` login box par ek naranji note likh deta hai — wajah ka
code (`NO_APP_ACCOUNT`, `NO_AUTH_USER`, `PROFILE_READ`, `PROFILE_HIDDEN`,
`FN_MISSING`, `SESSION_REVOKED` …) aur uska ilaaj, dono. Poori list server
se dekhni ho to `sql/CHECK_PACKING_SSO.sql` chalayein: wo har user ka verdict
deti hai.

> Dhyan: ek waqt par **ek hi** live session chalta hai (`erp_app_login()`
> purane token revoke kar deta hai). Isi liye desktop par login karne ke baad
> phone wala session `SESSION_REVOKED` deta hai — ab wo note me saaf likha
> aata hai. Dono saath chahiye to `SINGLE_LOGIN_MIGRATION.sql` ke section 6b
> wala block (5 live session) chala dein.

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


### Signup · Forgot PIN · emp_code se login

Setup: `USER_SELF_SERVICE_MIGRATION.sql` (upar `v_admin_pin` bharein,
`SINGLE_LOGIN_MIGRATION.sql` ke baad).

**Login username = Employee Code.** Purane users par `emp_code` khaali tha;
migration use `employees.person_name` se naam-match karke bharti hai — par
**sirf jab wo naam employees me ek hi baar ho**, kyunki galat code daal dena
ek bande ko doosre ke account par bitha deta. Jinka nahi mila wo report me
aate hain aur filhaal **apne naam se bhi** login kar sakte hain, isi liye koi
bahar nahi hota. Admin unka emp_code bhar de, bas.


**Ek emp_code par do account — ye galti nahi hai.** Aapke data me do aise
jode hain, aur dono ek hi insaan ke do account hain (alag role ke liye,
same contact no.):

| emp_code | Accounts |
|---|---|
| `1001` | SATINDER JI (Purchaser) + SATINDER GHALYAN (Admin) |
| `1532` | ANKUR JI (Purchaser) + ANKUR (GM) |

Inhe merge karna ya kisi ek ka emp_code khaali karna **galat hota**: wo
"… JI" naam `purchase_requirements.purchaser_name` par likhe hue hain (23 aur
5 PR par) aur mobile app usi naam se us Purchaser ki list chhanta hai. Isi
liye `emp_code` par **unique index jaan-boojh kar nahi** lagaya — ambiguity
login par sambhali jaati hai: launcher "Aapka kaun sa account?" poochh leta
hai aur banda chun leta hai. Naya duplicate ban bhi nahi sakta, kyunki
`erp_signup()` us code par pehle se account hone par mana kar deta hai.

Forgot PIN aise case me emp_code + DOB + contact **teeno** par match karta
hai; phir bhi do account bache to wo `MULTIPLE_ACCOUNTS` kehkar ruk jaata hai
— andaza lagakar galat bande ka PIN badal dena sabse bura nateeja hota.

**Signup** (`🆕 Naya Account`) — banda apna Employee Code daalta hai, uska
naam / designation / department `employees` se apne aap bhar jaate hain aur
**read-only** rehte hain (company record hi sach hai). Badal sakta hai sirf
contact no. Uske baad DOB, PIN, ✍️ signature (draw pad) aur 📷 profile photo
— **saare field zaroori hain**. Photo client par 256×256 JPEG me simat kar
data-URL ban jaati hai, bilkul jaise signature pehle se hai (alag storage
bucket aur uski policies ki zaroorat nahi padti).

Role **server par** `CMP_USER` set hota hai — client jo bheje wo padha hi
nahi jaata, isi liye is page se koi apne aap ko Admin nahi bana sakta. Naye
user ko sirf Complaint App ka access milta hai; baaki Admin deta hai.

**Forgot PIN** (`🔓 PIN bhool gaye?`) — Emp Code + DOB + Contact No. teeno
server par match hon to 10 minute ka reset token milta hai, phir banda apna
naya PIN set kar leta hai. Naya PIN lagte hi uske saare khule session band ho
jaate hain.

> **Suraksha ki saaf baat:** in teen factor me `emp_code` aur `contact_no`
> dono `app_users` me anon ko padhne milte hain (Admin Panel ki list unhi par
> chalti hai), isi liye asli raaz sirf **DOB** hai. Migration DOB ko
> jaan-boojh kar anon ke liye **band** kar deti hai (grant ki deny-list me,
> signature / PIN ki tarah) aur 5 galat koshish / ghanta / emp_code ki hadd
> lagati hai. Phir bhi ye bank-grade nahi hai — zyada sakhti chahiye to OTP
> (SMS) ya "Admin approve kare tab reset" jodna behtar rahega.

**PIN kahan likha jaata hai — ye file guess nahi karti.** PIN
`role_pins(role, pin_hash)` me hai, par uska key-format aur hashing is
project me kahin likha nahi (`ADMIN_PANEL_MIGRATION.sql` ki file hi maujood
nahi hai). Isi liye migration ek **probe user** banati hai, dekhti hai ki
aapka maujooda `admin_save_user()` kaun sa key aur kaun sa hash likhta hai,
aur wahi tareeka `app_settings.pin_write_recipe` me likh deti hai. Signup /
Reset usi recipe se PIN likhte hain aur likhne ke baad
`verify_app_user_pin()` se **check** bhi karte hain — PIN verify na ho to
account hi nahi banta (adhoora account chhodne se behtar).

**Admin Panel › Users › Update User** me signature pad ke neeche ab
**✍️ Use pre saved Sign** button hai. Zaroorat ye thi: Admin extra role dene
ke liye window kholta hai aur pad khaali dikhta hai — lagta hai sign gum ho
gaya. Ye button Admin PIN se us user ka saved sign pad par le aata hai
(`admin_get_user_signature()`; `get_user_signature()` user ka **apna** PIN
maangta hai, jo Admin ke paas nahi hota — isi liye alag RPC).

### Login window ki jhalak — kyun aati thi, ab kyun nahi

Har app ka login overlay markup me **shuru se** dikhta tha, aur JS use tab
chhupata tha jab server se session confirm ho jaata (`erp_app_session` /
`sales_whoami`). Wo ek network call hai — yani launcher se app par jaate waqt
login window ek-do second ke liye **jhalak** jaati thi, jabki banda pehle se
logged-in hai.

`sso-preboot.js` isi liye hai. Wo har app ke `<head>` me **sabse pehle**, bina
`defer`, chalti hai aur faisla **localStorage se** leti hai — jo synchronous
hai, network ke intezaar ke bina:

| Token hai? | Kya hota hai |
|---|---|
| **haan** | `<html>` par class lagti hai aur usi waqt CSS inject hoti hai jo `#loginScreen` / `#loginOverlay` / `#sarvLoginGate` ko chhupa deti hai — overlay **ek frame ke liye bhi paint nahi hota**. Saath me ek spinner splash, taaki beech me adhoora app (khaali list, bina mount hui React screen) na dikhe. |
| **nahi** | Ye file **kuch nahi karti**. Jo banda launcher se nahi aaya, uska apna login screen bilkul pehle jaisa turant dikhta hai. |

Splash tab hatti hai jab app khud `sarvSsoPrebootDone()` bulati hai — yani jab
wo kuch dikhane layak ho jaati hai (ya asli screen, ya apna login). Har app me
wo call **har raaste par** lagi hai (success, fail, aur `finally`), aur upar se
9 second ka backstop bhi hai: kisi wajah se call na ho (net gir gaya, RPC atak
gaya) to splash khud hat jaati hai aur login screen aa jaata hai. **Koi
spinner par atka nahi rehta** — "kuch nahi ho raha" se behtar hai login maang
lena.

Splash ka rang launcher jaisa gehra hai, isi liye launcher se app me jaana ek
hi screen ka hissa lagta hai, do alag page ki tarah nahi.

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
