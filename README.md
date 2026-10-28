# Sarv India: Store / Purchase / Production (file layout)

**Important:** this is no longer a single-file app. `Store.html` loads its CSS
and JS from the files next to it, so **keep and send the whole folder
together**. Mailing just `Store.html` to someone gives them an empty page.
(It works offline over `file://`, because CORS does not block classic
`<script src>` tags.)

## Files

| File | What it is |
|---|---|
| `Store.html` | Markup of the desktop app. The ERP shell's `<link>`/`<script>` come last. |
| `store.css` | The whole Store stylesheet: the 5 former inline `<style>` blocks, in document order. **The order is load-bearing; do not reorder.** |
| `store-core.js` | All Store logic (Inward, Outward, Issue, PR, PO, Reports, Tracker, Master Data, Repair, PDF, roles). |
| `store-design-master.js` | Production › Design Master. It reads `SB` / `escText` / `fetchAllRows` from `store-core.js`, so it must load **after** it. |
| `store-nav-keys.js` | Keyboard navigation for both tab bars. |
| `erp-shell.css` | Look of the ERP navigation shell (sidebar, top bar, KPI tiles). Everything is scoped inside `#erpShell`. |
| `erp-shell.js` | ERP sidebar + dashboard + module map. **Loads last**, because it wraps `sarvGoHome` / `sarvNavigateFromHome` / `activatePanel`. |
| `mobile.html` | Markup of the mobile approval app. |
| `mobile.css` / `mobile-core.js` | Its style and logic. |
| `DESIGN_MASTER_MIGRATION.sql` | Design Master's two tables + storage policies. Run it **once** in Supabase › SQL Editor. |
| `DROPDOWN_MASTER_MIGRATION.sql` | `sales_dropdowns` table + unique index + RLS, for Master Data › Dropdown Master. Run **once**. |
| `DESIGN_SUPPLIER_MIGRATION.sql` | `design_master.supplier_name` column, for Design Master's Supplier Name field. Run **once**. |
| `DESIGN_SKU_MIGRATION.sql` | **`design_master.design_sku_no` column**: the SKU No. that goes with a Design No. In Create New it sits right after Design No (**required**); the Live tab has its own column + ▾ filter; in the Bulk Upload grid it is under Design No (optional); it also appears in the Catalogue PDF filters and the PDF spec table. Run **once** (safe to re-run). The column is nullable and not UNIQUE; the app itself asks about a duplicate SKU. If you want it always unique, the file has a commented unique index. Before the migration the screen still works, the SKU just isn't saved and the app says so once. See below. |
| `ORDER_FORM_USERS_MIGRATION.sql` | Order Form users move into the ERP's `app_users` (a single user table): `app_users.sales_role`, a `sales_users` mirror + trigger, and an Order Form session from the ERP login (`sales_erp_login`). Run **once**. |
| `printing-lot.html` | Manufacturing › Printing Lot Card (the old "Design Print Manager Pro" + code.gs). Opens in the `#printingLotPanel` iframe; on the shop floor you can also open `printing-lot.html#production` directly. |
| `PRINTING_LOT_MIGRATION.sql` | Printing Lot's `prl_*` tables, RPCs, views, the `printing-lot` bucket + seed data (sections, colors, satin codes). Run **once** (after APPROVAL_CHAIN_MIGRATION). |
| `FABRIC_BRAND_MASTER_MIGRATION.sql` | `fabric_master` + `brand_master` + `buyer_master` + `agency_master` + `master_revisions` (REV archive), unique indexes, triggers, RLS and two roll-up views. For Master Data › Fabric Master / Brand Master / Buyer Master (+ Agency table). Run **once**, then press **Seed Excel Data** on the Fabric & Brand screen. Safe to re-run. See below. |
| `fabric & brand master/SARV INDIA LOT SOFTWARE DATA.xlsx` | Source of both masters: the `FABRIC MASTER` (31 rows × 42 columns) and `BRAND MASTER` (65 rows × 23 columns) sheets. The Seed button's rows were taken from here. |
| `UNIFIED_USERS_MIGRATION.sql` | One user / many roles (`app_users.roles[]`), per-user app access (`app_users.app_access`), and one session for all apps (`app_sessions` + `erp_app_login` / `erp_app_session` / `erp_app_logout`). Run once, **after ADMIN_PANEL_MIGRATION.sql**. Safe to re-run. See below. |
| `launcher.html` | **The first page after login.** Name + PIN, then only the app buttons the user has access to (ERP / Approvals / Complaint / Packing / Order Form). It creates one session that every app uses. See below. |
| `app-back.js` | One `<script src>` line in every app: the floating **← Apps** button in the bottom-right corner. It decides on its own whether to show: not inside the ERP iframe, and not without a single-login session (then the user never came from the launcher). z-index 900, so modals sit above it. |
| `sso-preboot.js` | First thing in every app's `<head>`. Stops the login window from **flashing** while switching apps: if a token is in localStorage (synchronous), the login overlay never paints and a spinner splash shows instead; the app calls `sarvSsoPrebootDone()` itself once it is ready. With no token, this file does nothing. A 9-second backstop means nobody gets stuck on the spinner. |
| `SINGLE_LOGIN_MIGRATION.sql` | Merges Complaint (`cmp_profiles`) and Packing (`packing.profiles`) users into the ERP's `app_users`, gives every new user a PIN (+ verify), adds the new roles `CMP_USER` / `PK_USER`, and `erp_sso_profile()`. Fill in `v_admin_pin` at the top. Run once, **after UNIFIED_USERS_MIGRATION.sql**. Safe to re-run. See below. |
| `FIX_PGCRYPTO_SEARCHPATH.sql` | Run this if login shows **`function gen_random_bytes(integer) does not exist [42883]`**. Cause: `gen_random_bytes()` belongs to pgcrypto, which lives in the `extensions` schema on Supabase, but that schema is missing from `erp_app_login()`'s `search_path` (a function created from an old SQL file stays that way in the database; updating the file does not change the DB). It only shows on the **correct PIN**, never on a wrong one. The file only fixes the search_path (`alter function`) and leaves the body alone. At the end it returns a `sarv_pgcrypto_report` table whose **"5. REAL CHECK"** row actually runs `gen_random_bytes(32)` and shows the result. Safe to re-run. |
| `sso-gate.js` | **The single entry gate for every app.** Sits in each app's `<head>` after `sso-preboot.js`. In one place it checks the ERP session, the app access and the user's account for that app, creates a real auth session through `erp-sso`, and on failure shows a screen with the reason (or sends the user to the launcher). `SARV_GATE.boot()` resolves only when the user is allowed in; `logout()` is the same in every app; `requireSession()` is just the synchronous "no token, go to the launcher" check for the ERP / mobile. **No app keeps its own login form.** |
| `ONE_USER_TABLE.sql` | **Only `public.app_users` remains.** `packing.profiles` and `sales_users` also become VIEWs (same names, columns and meaning, so both apps' code / triggers / RLS keep working unchanged). `cmp_profiles` is already a VIEW. **Two steps:** the first run only reports (columns, RLS, FKs, triggers, and every function that reads or writes these tables); `v_do_it := true` does the real work, with an archive. The new views use `security_invoker = true`; otherwise a view runs with its owner's rights and the RLS on `app_users` never applies. Replaces the old `CONSOLIDATE_USER_TABLES.sql` (which no longer runs). |
| `MERGE_DUPLICATE_USERS.sql` | **Two `app_users` rows for the same person** (e.g. "PARKASH" and "PARKASH JI", both emp_code 1460): merges them into one and removes the other. An auth account id can sit on only one row, so while the duplicate exists you cannot give Complaint / Packing access (`AUTH_ACCOUNT_TAKEN`). `erp_merge_duplicate_user()` moves roles / app access / Order Form role onto the KEEP row, along with the PIN, sessions, resets, the Order Form mirror, and the rows of **every** FK on `app_users(id)` (the list comes from `pg_constraint`), then deletes the duplicate row. One transaction: if anything fails, everything rolls back. The first run only reports; you run the merge from section 3. Cannot be undone. |
| `CHECK_ORDER_FORM_SESSION.sql` | For when `CHECK_ORDER_FORM_SETUP` says "everything is present" but the **Order Form still won't open**. Changes nothing. It checks three things: (1) whether `anon` has EXECUTE on every `sales_*` RPC (without it you get *"permission denied for function sales_whoami"*, which the old app showed as "setup pending"); (2) whether sessions are being created in `sales_sessions` (empty = the launcher's `sales_erp_login()` isn't creating a token); (3) whether the `sales_users` mirror is filled. At the end there is a commented `grant execute` block; run it only when section A shows a block. |
| `BRAND_TRIMS_MIGRATION.sql` | **7 new MATERIAL (YES/NO) columns in Brand Master**: `label`, `tag`, `bag`, `bore`, `inner_box`, `outer_box`, `foam`. The Order Form's **Bags & Trims** material list is built from these. Run **once** (safe to re-run: `add column if not exists`). **Until it runs, Bags & Trims shows only the "Bora Packing Charge" row** (an empty column = NO), and the table states the reason itself. See below. |
| `CHECK_ORDER_FORM_SETUP.sql` | For when **order-form.html says "Database setup pending"**. Changes nothing. It checks the 11 RPCs and 3 tables the Order Form needs (`sales_whoami`, `sales_save_order`, `sales_orders` …) by name **and arguments**; PostgREST finds a function by name + arguments, so the right name with the wrong arguments also says "function not found". At the end it gives a verdict: everything is present / the module is missing / these items are missing. **Note:** `ORDER_FORM_MIGRATION.sql` is nowhere in this project tree, which is why the app's old message was a dead end. |
| `FIX_PROFILE_ID_COLUMNS.sql` | For when **`CHECK_PACKING_SSO` shows `erp_app_session() = OLD`**. The situation: `MERGE_PROFILE_IDS...` did not finish, so the `app_users.pk_profile_id` / `cmp_profile_id` columns exist but are **empty**, and three RPCs (`erp_app_session`, `erp_app_login`, `erp_sso_profile`) read that empty column, not `packing.profiles`. Result: the tables are fine, but the app says `NO_APP_ACCOUNT` for every user. This file backfills the columns and adds two lines to `admin_grant_app_access()` so future users get them filled too. It doesn't change any RPC body, any id, or any FK. If you need to run the MERGE later, this file doesn't get in its way. |
| `FIX_APP_ACCOUNT_PROVISION.sql` | Run this if saving in the Admin Panel says **"Complaint App / Packing account was not created"**. It creates two RPCs: `erp_auth_id_by_email()` (server only) and `erp_link_existing_auth_account()`, which finds that person's **existing** auth account (sitting on another id) and moves `app_users.id` onto it, without creating a new one. At the end it reports which users have their auth account on the same id, which on another id, and which have none. It doesn't change any existing function or table. |
| `CHECK_PACKING_SSO.sql` | **"Direct login isn't working in packing.html"**: for whom, and why. Changes nothing, only looks. Almost everyone sees the Packing button on the launcher (access defaults to `true`), but a **direct** login also needs that person's Packing account: a row with the same id in `auth.users` + `packing.profiles`. Both are created automatically when "Packing & Dispatch" is switched ON in Admin Panel › Users › Apps. This file gives a verdict per user (`DIRECT LOGIN OK` / `NO AUTH ACCOUNT` / `NO PACKING ACCOUNT` / `PROFILE INACTIVE`) along with setup checks. |
| `USER_SELF_SERVICE_MIGRATION.sql` | **Signup · Forgot PIN · emp_code login.** Adds `dob` / `photo` / `designation` / `department` to `app_users`, backfills emp_code (name match against `employees`), and the RPCs `erp_signup` / `erp_forgot_pin_request` / `erp_reset_pin` / `admin_get_user_signature`. It doesn't GUESS where the PIN is stored; it finds out from a probe user. Fill in `v_admin_pin` at the top. Run once, **after SINGLE_LOGIN**. See below. |
| `CONSOLIDATE_USER_TABLES.sql` | Removes `cmp_profiles` / `packing.profiles` / `sales_users` and makes `app_users` the only user store, but leaves **VIEWs** with the same names (built on app_users), so both apps' triggers / RLS / code keep running unchanged. **The first run only prints the plan (dry run)**; it does the work with `v_do_it := true`. It creates its own archive. |
| `supabase/functions/erp-sso/index.ts` | Edge Function: creates a **real** Supabase Auth session for Complaint / Packing from the ERP session token (no password, and their RLS is left alone). `supabase functions deploy erp-sso`. |
| `PURCHASE_TRACKING_VIEW.sql` | The `v_purchase_tracking` view: a flat tracking sheet of PR → PO → Receiving → Requester (totals only, no item lines). See below. |
| `TRIMS_MANAGER_V2_MIGRATION.sql` | **Trims Manager: Manual Order + PR No.** Three things: (1) `order_manual` · `party_name` · `brand_name` · `designs` on `mfg_trims_sheets`: when the Order No is typed by hand, the sheet keeps its own Party / Brand / Design list; (2) `pr_no` · `po_manual` · `target_date_manual` on `mfg_trims_lines`: the user picks a **PR**, and once a PO is made against that PR it is found automatically through `purchase_order_lines.req_no`; (3) `outward_lines.lot_no`, for one ISSUE covering several lots later on. The `mfg_save_trims_sheet()` RPC is also recreated (the old one is dropped). Run once, **after `TRIMS_MANAGER_MIGRATION.sql`**; safe to re-run. Until it runs, everything on the Trims Manager screen works, but PR No / Party / Brand / Design are **not saved**, and the sheet says so in a red banner. See below. |
| `_backup_before_erp_split/` | The original single-file `Store.html` and `mobile.html` from before the split. |

## Script load order: do not change

```html
store-core.js  →  store-design-master.js  →  store-nav-keys.js  →  erp-shell.js
```

These classic scripts share one global lexical scope: the later files read
the earlier ones' top-level `const` / `let` (`SB`, `SB_READY`, `escText`,
`fetchAllRows`, `sarvCurrentRole`…) directly. So:

- Do **not** add `type="module"`. A module gets its own scope, and over
  `file://` CORS blocks it.
- Do **not** add `defer`. The order would break.

## `v_purchase_tracking`: one sheet from PR to Receiving

A database-side view (`PURCHASE_TRACKING_VIEW.sql`). One row = **(PR, PO,
Receiving)**, all three LEFT joined, so a PR with no PO still shows, and so
does a PO whose material never arrived. There are **no item lines**, only
totals (`pr_item_count`, `po_pr_ordered_qty`, `rcv_total_value` …), so the
grain stays intact.

The links are exactly the ones the app's Purchase › Follow-Up Report uses:

| Link | From |
|---|---|
| PR → PO | `purchase_order_lines.req_no` (exact). `linked_req_nos` is used **only** for a PO that has no lines at all; `trk_pr_po_link` says which route was taken |
| PO → Receipt | `inward_entries.po_number` (comma-separated list) |
| PR → Receipt | `inward_entries.req_no`, only for a receipt not tied to any PO |

Useful columns: `trk_stage` (how far it got), `trk_waiting_on` (who it is
waiting on), `trk_days_*` (aging), `trk_pr_*` (PR-level roll-up, repeated on
every row; use `select distinct` for a PR-wise summary), and `*_signed` /
`*_by` / `*_at` for each approval stage.

Two things to know:

- A **cancelled receipt** still gets a row (`rcv_is_cancelled = true`) but it
  isn't counted in any roll-up. For the app's behaviour, use
  `where not rcv_is_cancelled`.
- When a **new column** is added to a table, the view doesn't need to change:
  the full row is in the `pr_row` / `po_row` / `rcv_row` jsonb:
  `select pr_row ->> 'new_column' from v_purchase_tracking`.

Columns that are easy to misread (`pr_gmceo_as`, `po_md_approved`,
`trk_pr_received_value` …) have a `comment on column` written inside the
database.

## PO Follow-up: revised delivery date from the vendor

The PO went to the vendor, the delivery date came and went, and the material
didn't arrive. Until now there was no record of this anywhere: the call
happened on the phone and stayed there. Now it gets written down.

**Where to write it:** `mobile.html` › **PO Follow-up** tab (the PO Sender's).
**Where to read it:** `index.html` › PO Generation › **Follow-Up Report**, in
the new **Delivery Revise & Remarks** column, right after `PO Sent to Vendor`.

### Which POs show up in this tab

All three conditions together:

1. It **has been sent to the vendor** (`purchase_orders.party_sent_at`, or the
   browser-local fallback; the same `isPoSentMobile`). There's no point asking
   the vendor for a date on a PO that never reached them.
2. Status is **MD Approved** / **Vendor Verified** (legacy, it only ever came
   after MD) / **Partially Received**.
3. The material has **not fully arrived**. `poReceiptBucket` decides this,
   and once the lines load it looks **item-wise**. That's why a PO stays in
   the list when its header totals say "Received" but one line is short.

There are two sections, and they are **not** a pair of stages; both hold the
same kind of PO:

| Section | Meaning |
|---|---|
| **Follow-up Due** | no follow-up yet, **or** the revised date given has passed |
| **Date Awaited** | a follow-up was done and the vendor's date is still ahead |

The tab badge is the **Follow-up Due** count. The PO whose date passed the
longest ago is at the top.

### Item Details in the modal, PO-wise

Opening a PO shows the same **per-item** table as PO Receipts
(`openRecvModal`): `Sr · Item Name · Ordered · Received · Pending · UOM ·
Status`, with a TOTAL row below and the same verdict that puts the PO in its
section. The helpers are **shared** by both tabs (`poLineTally_` /
`recvLineState_` / `RECV_LINE_STATE`); if two tabs work out the same figure
in two different ways, that is exactly where they start to disagree.

Two things differ from PO Receipts, on purpose:

- **Short items come first** (within them, the PO's own line order is kept).
  During a call the list is read top to bottom; on a 20-line PO, the 2 lines
  still pending shouldn't be buried among the 18 complete ones. Short lines
  have a light amber tint.
- A line under the table says plainly **what to ask for**: "Talk to the
  vendor about these 3 items; 40 qty pending in total (nothing has arrived
  yet on 1 item)". That is the sentence the Sender reads off the screen on
  the phone.

The header also shows `Ordered / Received`, `Items Complete`, `Excess Received`
and `Inward Entries`, so nobody asks again for qty that arrived yesterday.

The lines load along with the list (`attachPoLinesToPos_`, which now includes
the PO Sender too), so the modal usually opens without an extra query; only
when that lookup failed or was skipped does the modal fetch once on its own.
The `_lines` convention is the same: `null` = not loaded (the table says
"could not be loaded"), `[]` = loaded and empty ("this PO has no lines").
Showing both the same way would be the worst option, because `[]` would be
read as "nothing was ordered".

### Where the data lives: no migration

Inside `purchase_orders.approvals`, in a `followups` **array**:

```json
{ "seq": 2, "revisedDate": "2026-11-05", "prevDate": "2026-10-20",
  "remarks": "yarn not received, dispatch in 5 days", "by": "PO Sender",
  "role": "PO Sender", "at": "16/10/2026 15:40",
  "atIso": "2026-10-16T10:10:00.000Z", "poNo": "PO/U-2/793" }
```

`approvals` is the **only** jsonb column on `purchase_orders` (that table has
no `pdf_snapshot`), and `rejectPO` already keeps a non-stage key
(`rejection`) in it. Nothing **iterates** over this column: both apps and both
PDF renderers read their stage key **by name** (`approvals.gmCeo` / `.md` /
`.store` / `.rejection`), so one extra key is inert for all of them. **That is
why this feature needs no `.sql` to be run.**

### Two rules to know

- **Append-only.** An entry is never edited or deleted. A date the vendor gave
  that then passed is the whole point of this record; erasing it means
  erasing the evidence. New information = a new entry.
- **The PO's real `delivery_date` does not change**, and the PO's PDF is not
  regenerated. The document in the vendor's hands stays as it is. In the
  report, `Delivery Date of PO` = what was agreed, and the new column = what
  happened after. A new date cannot be **earlier** than the previous date
  given (on the first entry, not earlier than today); that would be a typo,
  not a revision.

On save the row is **read again** and the new entry is added to that fresh
array, so if two phones are chasing the same PO, neither wipes out the other's
entry (the read-modify-write race).

### In the report

The cell shows the latest date, how many days late / left, the start of the
remark, and a **History (n)** link; clicking it shows every entry for that PO
(date, remark, who made it and when, what the previous date was). Nothing is
**typed in the report**: the person who spoke to the vendor writes it on the
phone, otherwise the truth ends up in two places. Same rule as the
`Bill Checked by GM / MD` columns.

The column filter works on the latest date, search also looks inside the
remark (typing `transport` finds all those POs), and the CSV gets four
columns: `Follow-ups`, `Revised Date (latest)`, `Latest Follow-up Remarks`,
and the full `Follow-up History` in one cell.

### Access

| Where | Key | Default |
|---|---|---|
| Admin Panel › **Feature Access** | `PO_FOLLOWUP` | only **PO Sender** + Admin |
| Admin Panel › **Tab Visibility** | `M_FOLLOWUP` | `ALL` |
| | `M_FOLLOWUP_pending` / `M_FOLLOWUP_done` | `ALL` |

The tab has to pass both, which is why by default only the PO Sender sees it
(the same way as `M_SENT`). To give it to another role, tick the
`PO_FOLLOWUP` row in Feature Access; the right to **write** still stays with
the PO Sender (`STAGE_TABS.FOLLOWUP.actor`), and everyone else sees the
history read-only.

## Where the fixed dropdown values come from

**Master Data › Dropdown Master.** The values of every fixed dropdown in the
app are in one table, `sales_dropdowns (key, value)`, the same table Sales ›
Order Form reads. That's why the ERP's own keys start with `erp_`, and the
Order Form's old generic keys (`category`, `size`, `moq`, `design` …) are
left as they were; neither overwrites the other.

Two rules, and because of them running the migration **does not change** the
app's behaviour at all:

| Rows for that key in the table | What is used |
|---|---|
| at least one row | **that list**; the code default is ignored completely |
| no rows | the code default (what used to be hardcoded) |

Adding / editing / removing / reordering is done only with an **Admin**
login, only from this screen (no SQL). Adding the first value for a key also
copies that key's other defaults into the table, otherwise the list would be
left with a single value.

To add a new dropdown, add an entry to `SARV_DROPDOWNS` in `store-core.js`:
`key`, `label`, `def` (today's hardcoded default) and the `selects` /
`datalists` to fill from that list. Where an option's value and its screen
text differ (like Inward's `Repaired` → "Return"), use the `labels` map; the
value is what goes into the database.

Design Master's pickers are fed from this (`dmFixed()` / `DM_DD_KEY` in
`store-design-master.js`), and so is the Home page's Nature chooser
(`sarvNatureOpts_`), so a list changes in one place only.

## Fabric Master & Brand Master

**Master Data › Fabric Master** and **Brand Master**: the ERP version of the
two sheets in `SARV INDIA LOT SOFTWARE DATA.xlsx`.

One-time setup: run `FABRIC_BRAND_MASTER_MIGRATION.sql`, then press **Seed
Excel Data** on both screens (rows that already exist are skipped, so pressing
it again does not create duplicates).

**One array, five jobs.** Each master's field list (`SARV_FAB_FIELDS` /
`SARV_BR_FIELDS` in `store-core.js`) drives all of these on its own: the
table head and rows, the New/Edit/Revise form, the CSV import header match,
the CSV export headers, and the revision's "what changed". Adding a column =
adding **one line** to that array; nothing in the HTML needs to change. There
are 42 columns, so the table scrolls horizontally, the first two columns stay
sticky on the left, and the **Columns** chips at the top turn groups on/off
(remembered in the browser).

**Revision control: this is "Revise 1, 2, 3 …".** Two actions are kept
separate on purpose:

| | What it does | REV | Reason |
|---|---|---|---|
| **Edit** | fixes a mistake | **stays the same** | not needed |
| **Revise** | a deliberate new version | **+1** | **required** |

In both cases a full snapshot from **before** the change goes into
`master_revisions`, with the REV number it had at the time. So the REV an old
lot card / PR was made on can still be read today, and from **History** you
can go back (restore) to any old REV; a restore itself creates a new REV, and
nothing is erased. If `master_revisions` is missing, the screen keeps
working and only the archive is skipped (console warning); the master's own
write never fails because of it.

**The two masters are linked.** A brand's `FABRIC NAME` points to a row in
Fabric Master:

* The Fabric dropdown on the Brand form fills **live** from `fabric_master`,
  and picking a fabric puts its quality/weights in the hint; an empty
  `BLANKET WEIGHT` fills itself from the bed size + ply.
* A fabric row shows chips for its brands; clicking one opens Brand Master
  filtered on that fabric (and the other way round).
* A brand whose fabric is not in the master gets a **red** chip, and the
  toolbar shows an "N unlinked" pill. The Excel already has two of these
  (2.25 `RUBRU BLUELILLY DB` and 3.3 `PARI DB SP`). The mistake doesn't hide,
  but work
  isn't held up either (which is why no FK was added).
* A fabric that has brands on it **cannot be deleted**. Inactive is always
  available, and it doesn't break the link.

**Access.** Admin Panel › **Feature Access** has four rows per master:
`FABRIC_NEW / EDIT / REVISE / DELETE` and the same for `BRAND_*`, plus
`MASTER_REV_HISTORY`, `MASTER_REV_RESTORE`, `MASTER_ACTIVATE`,
`MASTER_IMPORT`, `MASTER_EXPORT`, which apply to both. In **Tab Visibility**,
`MD_FABRIC` / `MD_BRAND` hide the whole screen, and `MD_FABRIC_YARN` /
`MD_BRAND_PACKING` / `MD_REV_COLUMN` hide only those **column groups**. So yarn
planning or packing/trims data can be hidden per role without closing the
screen (the same group also disappears from the form, and on save that
group's fields are left untouched).

**Two Sattan columns.** `SATTAN SIZE` (4 / 5 / 6 INCH SATTAN / NA) and
`SATTAN TYPE` (STANDARD / PREMIUM), both in the Specification group, each with
its own filter. It used to be a single column that ended up with mixed values
like `5 INCH SATTAN-NORMAL`; now size and grade are separate, so "all PREMIUM
brands" is one filter away. The database column is still called `sattan` (not
renamed, so old data keeps being read the same way); on screen its label is
`SATTAN SIZE`, and the CSV import also recognises the old `SATTAN` header.

**Packing 1 and Packing 2.** The full packing set (master required/type +
slave required/type) appears **twice**, because one brand can be packed two
ways, like MONARCH: bag packing and gift box packing. Packing 1 = the real /
default way (the same four Excel columns, same headers, so the old sheet still
imports directly). Packing 2 is optional, which is why its table column
**chips are OFF by default**; it always shows in the form, and pressing the
chip brings it into the table too.

All dropdowns on both screens (unit, quality, size, bed size, ply, sattan
size, sattan type, packing type, YES/NO) come from **Dropdown Master**:
`erp_fabric*` / `erp_brand*` / `erp_fbmYesNo` keys, whose defaults were taken
straight from the Excel data validation lists. To change a list, use that
screen, not SQL. Note: if a key already has even one row in `sales_dropdowns`,
the code default is ignored completely, so the list only changes from there.

**When a new column comes:** one line in `SARV_FAB_FIELDS` / `SARV_BR_FIELDS`,
and one `alter table … add column if not exists` line in the "for those who
ran this file EARLIER" block of `FABRIC_BRAND_MASTER_MIGRATION.sql`. Re-running
that file is always safe.

### `sales_standard_items` + `brand_master` = one table

Previously **one item code was maintained in TWO places**: in Brand Master
(fabric, category, weight, size, bed size, ply, sattan, moq, emboss) and in the
Order Form's own `sales_standard_items` (the same nine + rates). The two
drifted apart.

Now Brand Master is the single home. The **nine rate / packing columns** of
`sales_standard_items` moved into it as a new group, **Order Form Rates &
Packing**: `PRICE PER KG`, `PACKING PCS`, and `LABEL / TAG / BAG / BORE /
INNER BOX / OUTER BOX / BALE PRICE`. (It's money, so it has its own Tab
Visibility row `MD_BRAND_RATES`, by default only Admin / MD / GM / Accountant,
and its table chip is OFF by default.)

**The Order Form now reads from Brand Master against the item code.** The two
use different vocabularies, so the translation lives in one place,
`bmToItem()` in `order-form.html`:

| `brand_master` | Order Form | Note |
|---|---|---|
| `bed_size` DOUBLE BED | `dbsb` DB | combo (free text) |
| `blanket_ply` SINGLE PLY | `ply` SP | **`<select>`**: the value must match exactly |
| `sattan` 5 INCH SATTAN + `sattan_type` PREMIUM | `sattan` 5" PREMIUM | this is where the sattan split paid off |
| `size` 205*230 CM | `size` 205×230 CM | the separator changes |
| `emboss` YES/NO/NA | `emboss` | **`<select>`** |

`ply` and `emboss` are `<select>`s: a value outside the list silently doesn't
get set, which is why their mapping had to be exact. Everything else is a
combo (free text).

**The transition is safe; no old data is lost:**

* Section **2b** of the SQL copies `sales_standard_items` data into
  `brand_master` once. Where an item code exists in both, **brand_master
  wins** and only its *empty* columns are filled. An item that exists only in
  the old table gets a new row (with dbsb/ply/sattan translated back). The old
  table is **not touched, and not deleted**.
* In the Order Form, `sales_standard_items` stays **underneath as the base**
  and Brand Master is overlaid on it **field by field**, only where Brand
  Master has something filled in. *Not* a whole-row replace: midway through
  the migration an item can be in Brand Master (from the Excel seed) with
  empty rates; overlaying the whole row would have wiped that item's old price
  and the order would go out at the **wrong rate**.
* Once you're satisfied everything works, you can drop `sales_standard_items`
  yourself.

Two things to know:

* `sales_standard_items.fabric_name` (like `2900`) is a **different
  vocabulary** from Brand Master's `fabric_name` (1.5 to 6, the Fabric Master
  code), so the merge does **not** copy it. It stays empty in new rows and the
  "N unlinked" pill catches them and shows them. Pick the right fabric there.
* `moq` in the old table can be text like `500 PCS/Colour` (the Order Form read
  it with `String()`). The merge's `sarv_to_num()` helper pulls the first
  number out of each value, so a text→numeric cast doesn't bring the whole
  merge down.

## Buyer Master (+ Agency table): one home for the party list

**Master Data › Buyer Master.** This ONE screen has TWO tables:

| Table | Columns |
|---|---|
| `buyer_master` | `PARTY NAME` (unique, uppercase), `OWNER NAME`, `CONTACT NO`, `ADDRESS`, `GSTIN`, `PARTY STAFF NAME`, `PARTY STAFF CONTACT NO.`, NOTES |
| `agency_master` | `AGENCY NAME` (unique, uppercase), `AGENCY CONTACT PERSON`, `AGENCY MOBILE NO.`, NOTES |

Agency has no sub-tab of its own: its whole table sits below Buyer Master (the
**New Agency** button is there), because agencies and parties are maintained
side by side and in the Order Form these two boxes sit one under the other.
Agency is a **separate table** rather than a *column* on buyer for this
reason: one agency has many parties, so changing an agency's contact would
mean editing every party's row, which is where mistakes come from.

Both tables run on the same engine as Fabric / Brand Master, so you get Edit /
Revise (REV +1) / History / Restore / Active-Inactive / CSV import-export. The
Excel had no sheet for either, so there is no Seed button; the list is built
with **New** or **Import CSV**.

**Where the dropdowns go.** In both places this **adds**, it removes nothing:

| Screen | Field | Where it used to come from | Now |
|---|---|---|---|
| Sales › Order Form | Buyer / Company Name | only names from old `sales_orders` | + `buyer_master` |
| Sales › Order Form | Agency Name | only names from old `sales_orders` | + `agency_master` |
| Packing & Dispatch | Party Name on a new slip | only parties with a PENDING order | + `buyer_master` |

Picking one in the Order Form fills in the details:

* party → **OWNER NAME** = Contact Person, **CONTACT NO** = Mobile No.,
  **ADDRESS** = Address, **GSTIN** = GSTIN (and from the GSTIN the state /
  CGST-SGST vs IGST is worked out there automatically).
* agency → **CONTACT PERSON** = Agency Contact Person, **MOBILE NO.** =
  Agency Mobile No.

For a party / agency with an older order, the details come **from the order
history** (that is the real billing data from last time); the master only
fills in those that have no order yet. An empty value never clears a filled
field. `transport_name` is not in the master, because it belongs to each
order. An inactive row doesn't appear in any dropdown, but its name stays
written on old orders / slips.

In Admin Panel › **Tab Visibility**, `MD_BUYER` hides the whole screen,
`MD_AGENCY` only the Agency box below, and `MD_BUYER_BILLING` only the
Address + GSTIN columns (in the form too).

**Filters that work on orders were deliberately left alone:** Packing's
"Select a Party to see pending orders" (`getUniqueParties`) and the
Pending-list party filter (`getPendingFilterOptions`). These filter *existing
orders*, so adding master parties with no orders would make the filter worse,
not better.

**Nothing breaks if the migration hasn't run.** Both files read `buyer_master`
separately, in their own catch: `order-form.html`'s `fetchBuyerMaster()`
swallows the error and returns an empty list (otherwise its `Promise.all`
would fail and the whole form would land on "Database connection failed"), and
`packing.html` doesn't read the query `error` at all, `data` just comes back
null. Either way the screens work exactly as before.

The CSV export headers are **the same headers as the Excel**, so a file can be
opened in Excel, changed, and brought back with **Import CSV** (matched on the
natural key: fabric `FABRIC NAME + UNIT`, brand `ITEM CODE`; new rows are
inserted, existing ones updated, and every update's snapshot goes into
history).

## Sales › Order Form: inside the ERP, with the ERP login

`order-form.html` no longer opens in a new tab; it opens in the ERP's
`#orderFormPanel` iframe (like Lot Card Manager). A user is created in one
place only:

| What | Where |
|---|---|
| User, PIN, signature | Admin Panel › Users & Roles (`app_users`) |
| What they can do in the Order Form | The **Order Form Role** in the same popup (`app_users.sales_role`): Admin / Manager / Executive / Data Entry / Viewer. Empty = no access |
| Shared role-PIN login (no name) | `sales_erp_role_map`: ADMIN → admin, MD → admin, GM → manager |

- Logging into the ERP creates the Order Form session too; no second login inside.
- If you open `order-form.html` on its own (phone), use the ERP **name + PIN**;
  for a shared PIN, use `ADMIN` / `MD` / `GM` in place of the name.
- `sales_users` is now only a mirror (filled by a trigger); don't edit it
  directly. Old Order Form users are added to `app_users` by the migration (as
  new users with the "View Only" ERP role); until the Admin sets their PIN,
  their old password works.
- Order Form signature: if the user has a signature in the ERP, that one goes
  on the Order Form PDF.

### ★ Buyer and Item Code: only from the saved list, auto-fill LOCKED

Two Order Form fields now follow the same rule as **Store Inward's "Item Name
★"** (`store-core.js` → `lockToMasterList` + the row template in `addNewRow`):

| Field | List from | Locked with it |
|---|---|---|
| **Buyer / Company Name ★** | saved buyers (`buyer_master` + old orders) | Mobile No. · Contact Person · Address · GSTIN |
| **Item Code ★** (per product) | `brand_master` | the whole **Specifications** block: Fabric, Category, Weight, Size, DB/SB, Ply, Sattan Type, Sattan Size, MOQ |

How it works, the same as Store Inward:

- The name field checks on **blur**. If the value isn't in the list, it
  clears itself, a toast says why, and every value that depended on it is
  cleared too (a half-valid value sitting in a locked field is the most
  dangerous case).
- Locked fields are **readonly** (or `disabled` for a `<select>`), with a grey
  background and a "Locked from the master" title.
- **There is a second check before Submit.** The blur check doesn't run in
  every case (browser autofill, a value restored by the back button, or a field
  that never got focus), and Submit is the last place before a wrong value goes
  into the **database**, where it is hardest to get out.

**Locked specs show in a STRIP, not in input boxes.** Keeping a full input box
for a value that cannot be changed only took up space: nine boxes took about
three rows, and each box showed one value nobody could touch. Now the same
nine values sit in a `.spec-view` strip of chips (one or two rows), and the
whole Specifications part takes less than half the space:

```
┌────────────────────────────────────────────────────────────────┐
│ FABRIC 2.2   CATEGORY MINK   WEIGHT 2.20 KG   SIZE 205×230 CM  │
│ DB/SB DB   PLY SP   SATTAN PREMIUM · 5 INCH SATTAN   MOQ 1000  │
└────────────────────────────────────────────────────────────────┘
```

The real `<input>`s **have not gone**: their `.fg` is hidden
(`ofApplySpecLock_`), and the input stays in the DOM. `getProd`,
`collectPayload`, `learnMasters`, both PDF renderers and `applyProductToCard`
all read and write those inputs, so this change **did not alter the data path
at all**. The strip reads from the same inputs, so nothing needs syncing
separately (one source of truth, not two).

A field that **isn't locked** isn't in the strip; it shows as its real input:
the **GSM** for GREY/WHITE FABRIC (filled by hand), **Emboss**, and the case
where Brand Master hasn't loaded at all (then the strip is empty,
`.spec-view:empty` hides it, and all the old boxes show again). The two Sattan
fields are joined in **one chip**, since they only make sense together. An
empty spec shows a faint **"—"** rather than hiding: a strip that always looks
the same is easier to read, and an empty spec is information in itself (it was
never filled in Brand Master).

Three things were deliberately kept **OUTSIDE** it:

- **Pricing & Delivery** (price, discount, GST, qty, packs): each order's own
  deal, not part of the brand's identity. Locking them would mean opening
  Brand Master to change a rate.
- **Emboss**: an order decision. One order of a brand can go with emboss and
  another without. Locking it would mean the Emboss Design Photos section
  could never open by hand.
- **Transport Name** and **Agency**: transport changes order to order (it
  isn't even in the master), and an agency is just a name + two contacts with
  no billing or tax value attached.

Four things that could have broken silently, and their fixes:

1. **A locked combo could be changed from the list.** A `readonly` input still
   takes focus, and when the dropdown opened `selectCombo()` wrote
   `inp.value=val` directly, ignoring `readOnly`. Now `openCombo` /
   `filterCombo` don't open on a locked field at all (`comboLocked_`), so that
   route is closed in one place.
2. **Empty master = form stuck.** Bad network / Supabase down / `fetchDrops`
   failing all leave `STANDARD_ITEMS` empty. If the lock applied then, no Item
   Code could be picked (empty list) **and** no specs could be filled (locked).
   So **an empty list means "not loaded", not "wrong value"**: both the check
   and the lock only apply when the list HAS something, and as soon as the
   masters arrive `ofRelockAll_()` applies the lock.
3. **Opening an old order whose item code has died.** If a brand was deleted
   or made Inactive, its code isn't in `STANDARD_ITEMS`, and touching and
   leaving that field made the blur check clear it, which damaged an old order
   opened only to look at. Now `applyProductToCard` creates an entry for that
   code from the saved order's own values (not a lie: the order was made on
   this code, with these specs). It does NOT go into `DROPS.itemCode`, so a
   dead code isn't offered on a new order.
4. **Changing the party left the old address locked in.** `selectCombo`'s
   `setF` used to be `if(e&&v)`, which never set an empty value. So for a
   party with no address, the **previous party's** address stayed in the box,
   and now that the field is locked it couldn't even be removed; that wrong
   address would print in the PDF's bill-to. Now an empty value means "clear
   it".

### Pricing & Delivery: 4 columns × 2 rows, and No. of Bora is now AUTO

```
Packing Type   Quantity (Pcs)       Price (Rs/KG)   Discount %
No. of Bora    Packing (pcs/pack)   Weight          GST %
```

Read the order **in pairs**, not by row: right under Quantity (Pcs) is
Packing (pcs/pack), and those two give **No. of Bora**. The inputs sit
together, and the result sits in the column before them.

**The calculation has been REVERSED:**

| | Before | Now |
|---|---|---|
| Input | No. of Bora + pcs/pack | **Quantity (Pcs)** + pcs/pack |
| Result | Quantity = packs × pcs/pack | **No. of Bora = Quantity ÷ pcs/pack** |

Before, Quantity (Pcs), which is the real figure of the order and the one
discussed with the buyer, **could not be typed at all**; you had to work
backwards to get it. No. of Bora is now readonly + grey (the same look as
Weight).

Three things to know:

- **CEIL, not exact division.** A bora is a whole thing: 1000 pcs at 48 per
  bora = 20.83, but 20 bora hold only 960 pcs, and the remaining 40 need a
  **21st** bora. So the next whole number is taken, and the line under the
  field also shows the real division (`1000 ÷ 48 = 20.83 → 21 (last one
  partial)`), in amber, so it's clear the last bora isn't full.
- **Weight is now `Qty × per-pc weight`**, not `packs × pcs/pack × wt`. The
  old way worked because qty itself WAS `packs × pcs/pack` (the two were
  equal). Now packs is rounded up, so `packs × pcs/pack` can be **more** than
  qty (1000 pcs gives 21 × 48 = 1008), and those 8 extra pcs of weight would go
  into the bill. The label was also changed to **(Qty×Wt)**.
- **If pcs/pack is 0, No. of Bora is NOT TOUCHED.** Dividing by 0 gives
  `Infinity`, and opening an old order would also wipe its saved packs value.
  For the same reason `calcPackQty` is **not** run in `applyProductToCard`:
  the saved `packs` stays as it is (on an old order qty = packs × pcs/pack, so
  reversing gives the same number, but that also runs `calcTotalWeight`
  and a hand-adjusted `totalWeight` would be wiped). An order opened only to
  look at should not change.

### Bags & Trims: the material list comes from Brand Master

> **Setup:** first run `BRAND_TRIMS_MIGRATION.sql`, then fill in material
> YES/NO on every brand. Otherwise the table will only have the Bora Packing
> Charge row.

This table used to be the same for every brand: six fixed rows (Label / Tag /
Bag / Bore / Inner Box / Outer Box) **always**, and any other material added by
hand with "Add Row". The result: a brand that never uses a Bora still had a
Bore row, and a brand that uses Dori depended on someone remembering it.

Now **Brand Master** decides the list: a row is created only for materials
marked **YES** against that **Item Code**. The manual **Add Row was removed**;
keeping two routes would mean the master never becomes the full truth.

There can be **16 materials** (`OF_MATERIALS`):

| | Material | brand_master column |
|---|---|---|
| **fixed** (6) | Label · Tag · Bag · Bore · Inner Box · Outer Box | `label` · `tag` · `bag` · `bore` · `inner_box` · `outer_box` **← new** |
| **extra** (10) | Micro / Small / Big Label · Tag 1 / 2 / 3 · Dori · Insert Card · Barcode Sticker | the 9 that already existed |
| | Foam | `foam` **← new** |

**The "Bora Packing Charge" row ALWAYS shows.** It isn't a material, it's the
packing labour charge, and it applies to every order.

The difference between the two kinds of row **goes all the way to the DB**:

- **fixed:true**: these six have their own columns in `sales_trims_log`
  (`label_pcs`, `bore_rs`, `inner_box_disc` …), and the PDF packing table's
  **12-column two-tier header** is built on them. A row can be **hidden**, but
  its place stays in the DB (with 0); otherwise both that table and that header
  would have to be broken.
- **fixed:false**: the other materials. They go into `extraTrims` in the
  `full_order` JSON and print in the PDF's own **ADDITIONAL PACKING MATERIALS**
  table.

Where the money is added **did not change**: extras' cost is added to
`trimsCostPerPc` / `trimsCostTotal` along with the fixed trims (`getProd` +
`trimsCostTotalFor`), so the order total, GST, bill summary and both PDFs are
untouched by this change. The only change is **who decides the rows**.

Four things that could silently go wrong:

1. **A hidden row is also ZEROED.** Only setting `display:none` would make the
   most expensive bug: SIHF + 500 pcs filled on Bore, then an Item Code picked
   where Bore is NO. The row disappears, but `getProd` keeps reading it from the
   DOM and the **hidden row's money is added to the order total, all the way to
   the PDF**. So hiding sets `supp='na'` and runs `onSupp()`, which zeroes and
   disables all three inputs.
2. **Changing Pack Type re-checks the list too.** `onPackTypeChange` sets every
   fixed trim to `'na'` and Label (and Bore, for Bora) to `'foc'`, **hidden
   rows included**. That `foc` costs 0, but it would print "FOC" against that
   material in the PDF's packing table even though the brand doesn't use it.
   Now the render runs again and hidden rows go back to `'na'`. Whatever was
   already filled **comes back as a preset**, so changing Pack Type doesn't
   wipe typed pcs / cost. (Changing the Item Code deliberately does **not** do
   this: there the brand itself is different, so carrying the previous brand's
   cost would be wrong.)
3. **Opening an old order shows its saved rows, whatever today's list says.**
   A brand's list can change later (someone set Bore to NO); opening an old
   order would then hide that row **and** zero it, so an order opened just to
   look at would lose its Bore money the moment it was saved again.
   `applyProductToCard` passes `keepFixed` + `extraPresets`, so **what was
   filled is shown**, including a material that isn't on today's list at all
   (added by hand on the old order).
4. **An empty table looks broken.** If no material row is left, the table
   states the reason itself, one of three: no Item Code picked, everything is
   NO for this brand, or `BRAND_TRIMS_MIGRATION.sql` hasn't run yet (this third
   one shows in amber).

**`tag` and `tag_1` are TWO separate columns.** If both are YES, both rows are
created. Whether the Order Form's old "Tag" row and the Excel's "TAG 1" are the
same thing varies brand by brand, so they weren't merged. Set the one you don't
want to **NO**.

### Add New Brand Item: all 45 Brand Master columns

The Item Code can only be picked from the list, so the way to create a new
brand had to be in this form; otherwise taking an order for a new SKU would mean
opening the ERP and leaving the Order Form halfway.

The button sits at the head of Item Code. The popup has **all 45 columns**, in
the same order and grouping as the form in ERP › Master Data › Brand Master:

| Group | Columns |
|---|---|
| Identity | Item Code **★** · Fabric Name **★** · Category **★** · Blanket Weight |
| Specifications | Size · Bed Size · Blanket Ply · Sattan Size · Sattan Type · MOQ · Emboss · Notes |
| Rates | Price/KG · Packing Pcs · Label · Tag · Bag · Bore · Inner Box · Outer Box · Bale |
| Packing 1 | Master Req / Type · Slave Req / Type |
| Packing 2 | the same four, `_2` (can be left empty) |
| Materials / Trims | Label · Tag · Bag · Bore · Inner Box · Outer Box · Foam · Micro / Small / Big Label · Tag 1 / 2 / 3 · Dori · Insert Card · Barcode Sticker. **The Bags & Trims rows are built from these YES values** |

- Only **three** are required: Item Code, Fabric Name, Category, exactly as
  `req:1` in the ERP.
- The form is **built by JS** (`BR_FORM_FIELDS` → `brBuildForm_()`), not in
  markup: hand-written HTML for 45 fields is a guarantee that a column added in
  one place gets forgotten in the other. **That table is a copy of the ERP's
  `SARV_BR_FIELDS`; when a column is added there, add it here too.**
- Dropdown values come from the **ERP's `erp_*` keys** (`erp_brandCategory`,
  `erp_brandSattan`, `erp_fbmYesNo` …). They are in the same `sales_dropdowns`
  table as the Order Form's own dropdowns, and `fetchDrops` puts every key of
  that table into `DROPS`, so they are available directly. `BR_DD_FALLBACK` is
  only a fallback and is deliberately an exact copy of store-core's `def`
  arrays; if the two drift apart, a value filled in Brand Master won't match in
  the Order Form.
- **Fabric Name** is a suggestion list (not a hard lock): it is filled from
  `fabric_master`, but if that table were missing, creating a new brand would be
  blocked, which defeats the point of this button.
- On save the brand **appears in the Item Code list and is also picked in that
  same product card**: `onItemCodeSelect()` fills all the specs and applies the
  lock. `bmToItem()` does the same translation as `fetchDrops` (DOUBLE BED → DB,
  SINGLE PLY → SP, and so on).
- An empty number goes as **`null`, not 0**: 0 means "not set" here and the
  Order Form skips it, but `null` is that column's real default (the ERP form
  writes the same).
- Everything else is the same as Buyer / Agency (see below): a direct
  `brand_master` insert, a best-effort `master_revisions` archive, the duplicate
  check on the master, closed for Viewer, **no migration**.

### Add New Buyer / Add New Agency: straight from the entry form

The Buyer Details section has two buttons, each at the head of its field:
`Add New Buyer` on **Buyer / Company Name**, and `Add New Agency` on **Agency
Name**. Each popup has **all the columns** of that master, in the same order as
the form in ERP › Master Data › Buyer Master:

| Add New Buyer (`buyer_master`) | Add New Agency (`agency_master`) |
|---|---|
| **Party / Company Name** * | **Agency Name** * |
| Owner Name → the Order Form's *Contact Person* | Agency Contact Person |
| Contact No. → the Order Form's *Mobile No.* | Agency Mobile No. |
| Address → on the PDF's bill-to | Notes |
| GSTIN → state + CGST/SGST vs IGST | |
| Party Staff Name | |
| Party Staff Contact No. | |
| Notes | |

Only the name (`*`) is required. Before, a new party's name was simply typed
into the combo: the order was made, but the party's **address and GSTIN never
went into the master**, so on the next order both were typed by hand again (and
a GSTIN digit would slip). Now this creates the same row the ERP form creates.

How it works:

- **Same table, same shape.** A direct insert into `buyer_master` /
  `agency_master`, with `is_active:true, rev_no:1, created_by, updated_by`,
  exactly as `sarvFbmSaveForm()` in `store-core.js` does. That screen runs on
  **the same anon key**, so RLS allows the same route here and no separate RPC
  was needed (nor could one be made: the Order Form's migration SQL isn't in
  this tree). **No migration.**
- **Whatever name is already typed in the combo is carried into the popup.**
  "Add new" is usually pressed after typing a name and not finding it in the
  list.
- On save the party **appears in the dropdown and is also picked**, and Contact
  Person / Mobile / Address / GSTIN are filled with it (the GSTIN also ticks the
  *Out of Haryana* checkbox on its own). The full `fetchDrops` is not re-run;
  that would disturb the user's half-filled form.
- **The duplicate check runs only on the MASTER** (`BUYER_MASTER_ROWS` /
  `AGENCY_MASTER_ROWS`), not on `BUYER_DETAILS`. That one is built from old
  orders + the master **combined**; checking against it would block a party
  that already has an order but no master row as "already exists", when putting
  exactly that party into the master is the most important job. The check
  ignores case and extra spaces, and if it finds an Inactive row it says so too
  (that has to be made Active again from the ERP).
- The `master_revisions` archive is **best-effort**, just as in the ERP: if that
  table is missing, a warning goes to the console and the party is still saved.
  Blocking a party's save because one history row couldn't be written would do
  more harm than good.
- The **Viewer** role gets both buttons disabled (`applyRoleRestrictions`
  disables every button in `.wrap`), and `openNewBuyer` / `saveNewBuyer` both
  have their own `canDo('create')` check as well.
- The popup **does not close on a backdrop click or Esc**: the buyer form can
  have up to eight fields filled, and losing all of that to one wrong click is
  the worst outcome. There is one way to close it: **Cancel**. Enter saves, but
  only from a single-line field (in the Address textarea Enter means a new
  line). The mobile app's New PR sheet follows the same rule.

If RLS ever blocks a write, the popup says so plainly ("…no permission; add it
from ERP › Master Data › Buyer Master") instead of failing silently.

### Sattan: Type and Size, two separate dropdowns

In Item Specifications, Sattan is now **two** dropdowns, not **one** combo:

| Order Form | Brand Master column | Values |
|---|---|---|
| **Sattan Type** | `sattan_type` | STANDARD · PREMIUM · NA |
| **Sattan Size** | `sattan` | 4 / 5 / 6 INCH SATTAN · NA |

Before, a **joint** value like `5" PREMIUM` was written into one field, while
Brand Master has had two columns from the start, so a joint string built when
picking an Item Code never matched back. Now both dropdowns' values use **Brand
Master's own vocabulary**, so **picking an Item Code selects both on its own**.

Two things to know:

- **A hidden field named `sattan`** is still in the form, holding the two
  joined (`5" PREMIUM`). `getProd`, `learnMasters`, the `sattan` column of
  `sales_product_details` and **both PDF renderers** read it, which is why **no
  migration** was needed and the PDF's "Sattan" column prints exactly as
  before.
- An **old order** had only the joint value. `setSattan()` splits it and fills
  both dropdowns (`sattanSplit_`), so Sattan isn't empty on Edit and isn't lost
  when saved again.

If a new value appears in Brand Master (like `7 INCH SATTAN`), `ensureOpt_()`
adds it to the dropdown itself: in a `<select>` the value must match the list
exactly or it **silently** doesn't get set, and that was this app's old wound.
Both have their own rows in **ERP › Dropdown Master** (`sattanType` /
`sattanSize`); the old `sattan` row is kept for the record.

### Bags & Trims: extra materials from "Add Row"

The **six trims** at the top (Label / Tag / Bag / Bore / Inner / Outer) are
fixed: they have their own columns in `sales_trims_log` and the PDF packing
table is built on their two-tier header. But real packing uses other things
too, and those change from order to order. That list now runs on **Add Row**:

The **Material** dropdown (MICRO LABEL · SMALL LABEL · BIG LABEL · TAG 2 · TAG 3 ·
DORI · INSERT CARD · BARCODE STICKER · FOAM), with the same four inputs as the
other trims: **Supplied By · No. of Pcs · Cost/Pc (₹) · Discount%**. The same
rule too: money is only filled when Supplied By = **SIHF Supplied**, otherwise
the three inputs are disabled and 0.

Where the money is added, **in one place**: in `getProd` the extras are added
into `trimsCostPerPc` / `trimsCostTotal` ALONG WITH the fixed trims, and also in
`trimsCostTotalFor()` (which both save and the PDF run). That makes the
product's exGST, GST, Final Price/Pc, bill summary, the PDF's Trims Cost column
and the Grand Total all come out right **on their own**; adding it separately
in each place would guarantee one place gets missed.

Where it is saved:

| What | Where | Migration? |
|---|---|---|
| Full detail (material, supplier, pcs, cost, disc) | `sales_orders.full_order` → `products[].extraTrims` | **no** |
| Money | `sales_trims_log.total_trims_rs` (added to the fixed trims) | **no** |

The SQL of the `sales_save_order` RPC is **not** in this project tree, so there
is no way to be sure whether it silently drops an unknown key or throws an
error, and a wrong guess would break every save. So **no new key** is sent to
that RPC: the money goes into an existing column, and the detail goes into
`full_order`, from where the Edit button reopens the order (`applyProductToCard`
rebuilds the rows exactly: supplier, pcs, cost, discount and the
enabled/disabled state all as saved).

In the PDF they have **their own table**, right under the packing table:
**ADDITIONAL PACKING MATERIALS**. They weren't pushed into the grouped table
because that is built on the six fixed trims' two-tier header. An order with no
extra rows hides this table (heading included) **completely**.

## Sales › Packing & Dispatch (packing.html)

The ERP copy of the old Packing App (`PACKING/PACKING.html`, Supabase project
`hghomygvryyihezvmrjj`). Interface, offline queue, PDF (Original + Full Copy):
all exactly the same. The only difference is that the data lives in the ERP
project's **`packing` schema** (same table / RPC names). The old app and the old
project are **not changed at all**; they keep running as a backup.

Setup (ERP project › SQL Editor, from the `PACKING/` folder, in this order):

| Step | File | What |
|---|---|---|
| 1 | `PACKING_1_SCHEMA_CLONE.sql` | Clones the whole schema from the old project (tables, keys, indexes, views, RPCs, triggers, RLS, grants) into `packing`. Put the connection string at the top. |
| — | Dashboard | ERP project › Settings › API › add `packing` to **Exposed schemas**. |
| 2 | `PACKING_2_DATA_TRANSFER.sql` | Copies all data + login users + sequences. Safe to re-run (upsert); run it one last time on cut-over day. |
| 3 | `PACKING_3_ERP_ENHANCEMENTS.sql` | Audit trail, ERP PDF index, business views. |

- Login: the same username / password as the old app (auth users are copied).
- Links to old PDFs point to the old project's bucket and open from there; new
  PDFs go into the ERP's `packing-slips` bucket.
- Cut-over: if both apps run at the same time, Slip / Order numbers will clash.
  After the last copy, everyone moves to the ERP app.
- Views (`packing.v_dispatch_daily`, `v_party_dispatch_monthly`,
  `v_quality_dispatch_monthly`, `v_order_pending_aging`, `v_slip_pipeline`,
  `v_weight_variance`, `v_vehicle_utilisation`) are for dashboards / reports.

## Production › Design Master: Design SKU No and Catalogue

Setup: `DESIGN_MASTER_MIGRATION.sql`, `DESIGN_SUPPLIER_MIGRATION.sql`, then
**`DESIGN_SKU_MIGRATION.sql`**.

### Design SKU No: not the same thing as Design No

The **Design No** identifies the design; the **SKU No** is for selling / stocking
it. Hence two separate columns (`design_master.design_no`,
`design_master.design_sku_no`), and the SKU No sits right after the Design No
everywhere:

| Where | How |
|---|---|
| **Create New** › 1. Design Specifications | after Design No, **required** |
| **Live** tab | its own column after Design No, its own ▾ multi-select filter, and it is included in the search at the top |
| **Bulk Upload** grid | its own box under Design No, **optional**, because the SKUs of all old data aren't known; anything missed can be added from Live › Edit |
| **Catalogue PDF** filters | its own multi-select (separate from the Design No text box; both apply with AND) |
| **Catalogue PDF** | `SKU NO` next to `DESIGN NO` in the cover page spec table |
| **Edit** popup | optional: not knowing an old design's SKU shouldn't block opening the record |

**A duplicate SKU is a question, not a block:** "SKU No X is already on design Y.
Save anyway?" A typo gets caught, but putting one SKU on two designs on purpose
stays possible. That's why the database has no `UNIQUE`; if you want it always
unique, `DESIGN_SKU_MIGRATION.sql` has a commented unique index (remove the
duplicates first; the query is in the file).

Even **before** the migration the screen works fully: the SKU boxes show, that
one column is just left out of the save (`skuPatch`), and the app says once,
plainly, that `DESIGN_SKU_MIGRATION.sql` needs to be run. On an empty database
the first save works this out itself (`dmWriteDesign` resends once without the
SKU), so a whole save never fails on "column does not exist".

### Add Matching / Add Photoshoot: many photos at once

Setup for Add Photoshoot: **`DESIGN_PHOTOSHOOT_MIGRATION.sql`** (table
`design_photoshoots`; photos in `sarv-pdfs` under `design-photoshoot/<DESIGN NO>/`,
2400px JPEG, sharper than the 1500px matching swatches).

Both tabs work the same way: choose the Design No, click **Select Photos
(multiple)**, and every photo becomes a passport card with its own **Matching
Name** dropdown; **Save All** saves them one by one.

| | Add Matching | Add Photoshoot |
|---|---|---|
| Matching Name list | shade list (Dropdown Master) + names already used | only the chosen design's own matchings; a new shade is added from Add Matching first |
| Per photo | Matching Name + MASTER / SLAVE | Matching Name |
| Common | Blanket Quality | — |
| Extra | "+ Matching without Photo" | saved photos can be removed (✕ Remove, needs `DESIGN_DISCARD`) |

Everything is checked before the first upload (empty name, name already on the
design, same name twice, more than one MASTER). A card that saves leaves the
list; a failed one stays with the reason, so only the failures need another
try. The design stays selected after saving, and its Saved list on the left
shows the new photos (click any photo for full screen).

### Online Catalogue (customer presentation of the photoshoots)

Tab **Online Catalogue**: a landscape, slide-style PDF to send to customers,
built only from LIVE designs that have photoshoot photos. Pages: cover (big
photo, company, title) → **The Collection** index (tap a card to jump to the
design) → **one page per design** with ALL its photoshoot photos fitted on
that page (1 = full, 2 = side by side, 3-5 = hero + rest, more = best grid),
its specs, shade swatches and a rate / enquiry box → **Quotation** (or
Collection Summary when no rate is typed) with terms → **Thank you** page with
the factory address and GSTIN. Every inner page has "Back to the collection".

- Designs are chosen with the **same dependent multi-select filters as the
  Catalogue PDF tab** (Unit, Bed Size, Quality, Party, Brand, Supplier, Type,
  Total Frames, Monopoly, SKU) plus a **Design No tick list** that shows only the
  numbers left after the other filters (with a search box that narrows the
  list shown). Own tick state (`ocCatState`), so the two tabs don't affect each
  other. Below: the selected designs with an optional rate each; "Print rates"
  on/off.
- **Never printed:** party, brand, supplier, frames (they only filter).
  **MONOPOLY = YES starts unticked** (also after Reset), so monopoly designs
  go in only when deliberately ticked.
- The preview below the buttons is the real PDF; up to 8 designs it rebuilds
  by itself, beyond that press **Full Preview**.
- Contact details are company defaults (title "Premium Blanket Collection",
  website from `SARV_WEBSITE_URL`, standard terms, "per piece"); the
  Customer & Contact boxes were removed on request. `ocSettings()` still
  reads those boxes if they are put back with the same ids.

### PSD file (Photoshop source) per design

Setup: **`DESIGN_PSD_MIGRATION.sql`** (adds `psd_path`, `psd_name`, `psd_size` to
`design_master`). The file goes to the `sarv-pdfs` bucket under
`design-psd/<DESIGN NO>/`, uploaded as-is (no compression).

| Where | How |
|---|---|
| **Create New** › right column | "Select PSD File", **required**, must be a `.psd`; it is uploaded before the design row is made, so a design is never created without its PSD |
| **Edit** popup | current file with Download, plus "Replace PSD File"; **optional**, because old designs have no PSD; the new file is uploaded on Update & Save and the old one is deleted |
| **Live** tab | last column: **Download PSD** per design (saved under its original name), or "No PSD" |

Before the migration the screen still works: the PSD columns are left out of the
save (`psdPatch`) and the app says once that the migration needs to be run. A
very large PSD can be refused by the project's global Storage upload limit
(Supabase › Storage › Settings); the error says so and the design is not saved.

### Catalogue PDF: Bed Size / SKU filters, and the preview builds itself

- The filters now include **BED SIZE** and **DESIGN SKU NO** too. Like the other
  filters they are **dependent**: removing one tick makes meaningless options
  disappear from the other columns.
- **The preview below builds itself as soon as a filter is picked**; there's no
  need to press "Generate Preview" (`renderCatalogueFilters` →
  `dmCatSchedulePreview`, a 220 ms debounce, and only while the Catalogue tab is
  open).
- On a very large selection, the auto-preview renders only the first **40**
  designs (`DM_CAT_AUTO_MAX`) and says in an amber line how many are left;
  otherwise one tick would build hundreds of pages of DOM and the tick itself
  would hang. **Generate Full Preview** runs without that limit, and **the limit
  has no effect on the PDF**: Download / Open always cover the full selection.

## Printing Lot Card (Manufacturing)

Replaces the old Google Sheet based app. Setup: run `PRINTING_LOT_MIGRATION.sql`
once, and that's it.

| Old (Sheet / Drive / IndexedDB) | Now |
|---|---|
| Production Log sheet | `prl_lots` (+ view `v_prl_production_log`, same columns) |
| base64 photos in designs[] | `prl_lot_designs.image_path` → bucket `printing-lot/images/<lot id>/…` (one file per photo) |
| Production Tracking sheet | `prl_production_entries` (one row per lot + section, `data` jsonb) + `prl_production_log` (history of every save) + view `v_prl_production_tracking` |
| User Master (plain password) | ERP login + Feature Access `PRL_*`; `prl_operators` (name + PIN hash) for department masters |
| Drive `ROOT/PARTY/LOT_PARTY.pdf` | `printing-lot/pdfs/PARTY/LOT_PARTY.pdf` + `pdf_documents` (variant `PRINTING_LOT`) |
| DRAFT-LOT sheet | Auto-save 5 sec after a change on a saved lot + a local backup in the browser |

- **Who can do what:** Admin Panel › Feature Access › Printing Lot Card
  (`PRL_EDIT`, `PRL_DELETE`, `PRL_PROD_ALL`, `PRL_MASTER`). Default: Admin + MD
  edit; everyone else view-only.
- **Department masters** (Raschel, Stenter, Printing…): the Admin creates them in
  Printing Lot › Masters › Department Operators (with the Admin PIN). They use
  *Department Login* in the Production tab and fill only their own sections.
- **Lists:** Unit / Category / Bed Size / Ply / Satin Quality / Stenter Times →
  Dropdown Master (`erp_designUnit`, `erp_prl*`). Blanket colors and satin codes →
  Printing Lot › Masters. Production fields → the `prl_sections` table (`fields`
  jsonb); add a new field there, no code change needed.
- One save writes the whole card (`prl_save_lot` RPC, one transaction). If two
  people change it at the same time, the second gets `VERSION_CONFLICT`; nobody's
  work is silently overwritten.

### Order Form Home: MTO / MTS → Lot Card

`order-form.html` no longer opens straight on the form; it opens on **Home**:

1. **Make to Order** / **Make to Stock**, each with its own series:
   `MTO-SIHF/2026-27/0001`, `MTS-SIHF/2026-27/0001` (FY Apr–Mar IST; resets to
   0001 on 1 April by itself). There is no type column: **the Order No prefix is
   the type** (`ofTypeOf`). The number is made on the client (`ofNextOrderNo`,
   like the ERP's `nextNo()`); on a DUPLICATE it takes the next one in the same
   series. Old numbers without a prefix (`SIHF/2026-27/001`) go under MTO, with
   an "OLD NO" tag. `sales_next_order_no()` is now only a connection check. **No
   migration.**
2. Each type has: **New Order** · **Existing Quotation** (Saved + Sent to Party
   + unknown status) · **Confirmed** · **Hold** · **Cancel** · **Close**
   (`OF_BUCKETS`). The Home button in the bottom bar goes back to Home.
3. A Confirmed / Hold / Closed order's card has a **Lot Cards** box, with one lot
   per PRODUCT. **Generate Lot Card** (Confirmed only) opens Printing Lot: the
   header is filled from the order (party, brand = item code, fabric, category,
   bed size, ply, weight, size, satin quality, emboss, qty, packing), design /
   remarks / label-tag go into the worker notes, LOT NO = the highest numeric + 1
   (a suggestion), and all of the order's photos are **pre-selected** (they can
   be removed in the picker; each photo is copied into the lot's own bucket).
   Once a lot exists, **Track LOT …** (status · sections done) → Production tab.
4. Links: `prl_lots.order_no` + `prl_lots.extra.src_order_line` (and
   `src_order_no / src_order_type / src_item_code`). The hand-off localStorage key
   is `sarv_prl_handoff` (v:1, 15 min); its shape is in `ofGenerateLot()`, the
   reader is `prlRunHandoff_()`. Inside the ERP it uses
   `sarvNavigateFromHome('PRINTING_LOT')`; outside, a new tab.

Note, the server rule is unchanged: **Edit + Submit** on a Confirmed order sets
its status back to **Saved** (`sales_save_order`), so the order moves to Existing
Quotation; lots already made stay linked.

## Trims & Packing Material Manager (Manufacturing)

`trims-manager.html`: ERP › Manufacturing › Trims Manager. For one Sales Order:
which trims / packing materials are needed, how many for which lot, which PR
they're on, when the PO came, how much material arrived and how much was issued
to the lot, all on one sheet.

Setup: `TRIMS_MANAGER_MIGRATION.sql`, then **`TRIMS_MANAGER_V2_MIGRATION.sql`**.

### ORDER NO · LOT NO: from the list, or typed by hand

| | From |
|---|---|
| **ORDER NO** dropdown | saved Sales Orders (`sales_orders`); Order Qty, Buyer, Order Date all come from there |
| **ORDER NO** ✎ Manual | typed by hand. The Order Form has no record of it, so the sheet asks for the details itself |
| **LOT NO** from the list | saved Lot Cards (`mfg_lot_cards`); Lot Req Qty is filled from the lot card |
| **LOT NO** by hand | one that isn't in Lot Card. Asks for confirmation; Lot Req Qty is manual |

**A manual Order or manual Lot = a MANUAL sheet**, and an amber bar appears:
**Party Name · Brand Name · Design 1 · Design 2 · ADD More Designs** (no limit
on Design 3, 4, 5 …). All three are **required**; Save doesn't work without them,
because they have no other home anywhere in the ERP, and the PDF / CSV / Saved
Sheets register all print them. On a saved Sales Order the bar doesn't show at
all.

### NEW PR: a PR straight from the sheet

Right after **Lot Req Qty** there is a **NEW PR** tick column (like Item
Master's NEW PR column), and **Generate New PR (n)** in the toolbar. Tick and
press it, and the ERP's **Purchase › New Entry** form opens with all those items
filled in:

| | |
|---|---|
| PR qty | **Final PO Qty** = Lot Req × (1 + Wastage%): this is what has to be bought, not Lot Req |
| Item Description / Make / Category / UOM | **from Item Master**, not from the trims sheet (the PR prints what the master says) |
| PR line remark | `Trims: Order <no> · Lot <no> · <item> · Wastage x%`, so the Purchaser knows which order it belongs to without opening Trims Manager |
| Purchaser Name | from the item's Category (`category_purchasers`), as on a hand-filled row |
| Required By · Machine | **empty**: the user fills these two, then Submits |

A row can be ticked **only** when it has a **Store Standard Name** (an Item
Master item) and **Final PO Qty > 0**: the PR is tied to that `item_id`, and
without these there is nothing to tie it to. The checkbox tooltip gives the
reason. A row whose supplier is **BUYER / FOC** can be ticked, but it asks before
sending (we don't buy that material).

**Once the PR is submitted, its number comes BACK into the sheet's PR NO. column**,
on the rows it was made from, and that link starts PO No / Target Date / Qty
Received. The sheet doesn't save itself: an amber banner "PR xyz … not saved yet"
stays until Save is pressed.

Where the code is: the PR form is on the ERP page and Trims Manager is in its
iframe, so the trims sheet only asks and sends:
`store-core.js › sarvGenerateNewPrFromTrims` fills the form,
`sarvTrimsPrNotify_` reports back on save, and the trims sheet's
`window.trimsPrSaved` puts the PR No on the rows. A PR made from Item Master and
one made from here go through the same two helpers (`sarvPrFillRequester_`,
`sarvPrWireMachineCopy_`), so both are filled exactly the same way.
**Access:** `HOME_PR`: whoever can open the PR form can make a PR from here (the
Admin-only `MD_ITEM_NEWPR` from Item Master is deliberately not used, because the
merchandiser who fills the trims sheet is the one who raises the PR).

### PR NO. → PO NO.: the user picks the PR, the PO comes on its own

Before, the PO No. had to be picked by hand, which meant waiting for the PO and
then opening the sheet again. Now:

1. The **PR NO.** column has a dropdown listing `purchase_requirements`. PRs for
   that item are at the top under their own heading (`✓ PRs for this item`), the
   rest below. (Or it is set automatically by **NEW PR** above.)
2. Purchase makes a PO against that PR → the PO appears in the **PO NO.** column
   on its own (green cell, vendor name below). The link is
   `purchase_order_lines.req_no`; nothing has to be retyped in the sheet.
3. **Target Date** fills itself from that PO's `delivery_date` (if one PR has
   several POs, the **earliest** date, since that's the one to chase).
4. **Qty Received** is that item's inward against that PO. A receipt booked
   straight against the PR without a PO (the FIELD BOY "without PO" kind) is
   counted too, and not twice: the two are tallied separately.

If the PO isn't made yet the cell says **PO pending** in amber (and the summary
counts "PR → PO Pending"). With **✎** you can pin a PO by hand (for old orders
whose line has no `req_no`), and **↺** puts it back to auto.

### Lot Issue · Pending Issue

- **Lot N Issue**: the qty of that item issued against that lot through the
  Store's ISSUE entry, with **the date of each issue below**. Hovering shows the
  issue document no + the qty of each issue.
- **Pending Issue = Qty Received − Total Lot Issue**: material that reached the
  store but hasn't been given to the lot yet. A small line below shows the
  shortfall/excess against Lot Req (`Req short 120` / `Req met` / `OVER issued`),
  so an item that is short **because it never arrived** also shows up.

### Store Issue: the full item list from a saved Lot

`index.html` › Outward Desk › Entry Type **ISSUE** › **LOT No.**: the **Saved
Lot** button lists the lots whose Trims sheet is saved. One click:

- fills the rows with that lot's full **required item list** (Description /
  Category / UOM from Item Master), with the **pending** qty in Qty;
- puts a **sub-row** under each item (`LOT: 1001 · Required Qty · Pending Issue ·
  Issued Qty · Excess Issue`), exactly like the PO sub-row on an Inward against a
  PO (both are built by the same `docStripParts_`);
- prints the same sub-row in the **Issue PDF**, with Trims Order No · Party ·
  Brand · Design in the header.

Typing some other batch no. in the Lot box changes nothing; it works as before.
Note: **Machine Name & No. is still required on every ISSUE row**, including rows
filled from a lot: the lot says *which material* went out, the machine says
*where it went*.

## One user, many roles, one login

Setup: `UNIFIED_USERS_MIGRATION.sql` (after ADMIN_PANEL_MIGRATION).

### Multi-role: access is the UNION, signature from the primary

`app_users` now has two things, and this difference is the heart of the whole
design:

| | How many | What for |
|---|---|---|
| `role` (old column) | **one** | **PRIMARY role.** "Who did it": signature on PR/PO, audit stamp, name on PDF, role badge. |
| `roles text[]` (new) | **many** | **ACCESS only.** Union: if any one role says YES to a feature, the user gets it. |

If Rajesh is "Store Incharge + Accountant", he gets the work of both, but the
signature always goes from his primary role, so "which role signed this" never
gets blurry. And since the old `role` column is unchanged, none of the app's old
code that reads `sarvCurrentRole` breaks.

In code: `sarvCurrentRole` = primary, `sarvCurrentRoles` = all,
`sarvRoles_()` = the list for access. `sarvCan()` and `sarvTabVisible()` apply
the union on it; so does `isAdmin()` (ADMIN_PIN in any role).

### Login by name now

The login screen used to ask for a Role. Now it asks for the **name**: all of
that user's roles apply automatically, and their roles show below while the
name is being typed. The old **"Login with Role PIN"** link is still at the
bottom: it is what works for people whose name isn't in Admin Panel › Users, and
where this migration hasn't run yet (in that case access is for that one role
only). So this change **locks nobody out**.

### Per-user app access: tri-state

In Admin Panel › Users › **Apps**, each app has three states:

| | Meaning |
|---|---|
| **auto** (default) | whatever the role-wise Tab Visibility says |
| **ON** | always show, whatever the role says |
| **OFF** | always hide, whatever the role says |

Order: `user override → role-wise matrix → code default`. "auto" is the default
so the role-wise matrix keeps its meaning: the Admin only has to touch the one
person whose case is different (before, hiding one person meant creating a new
role). The keys are the same as in Tab Visibility (`HOME_*`), so there's no new
vocabulary.

The `+N role` and `N` app pills in the Users table show at a glance what has
been set by hand on which user; otherwise "why can't this person see the
button" takes time to track down.

### One login, every app

On ERP login, `erp_app_login()` creates a **session token** (`app_sessions`),
which goes into localStorage; all the apps are on one origin, so they can read
it. The session row also records `allowed_apps`: "which apps this user may
open", decided by the ERP's JS (role matrix + per-user override). So external
apps don't need to understand the full permission matrix.

| App | Own login window | Identity from |
|---|---|---|
| **launcher.html** | **yes, only here** | name + PIN → `erp_app_login()` |
| ERP (index.html) | no | the launcher's session (no token = straight to the launcher) |
| Approval App (mobile) | no | same |
| Order Form | no | the launcher's session + the `sales_erp_login` token |
| Complaint App | no | the launcher's session + the `erp-sso` auth session |
| Packing & Dispatch | no | same |

**One door, and now truly one.** Every app used to have its own login: Packing's
username + password (`packing.profiles`), Complaint's Supabase Auth login +
signup (`cmp_profiles`), the Order Form's name + PIN (`sales_login`). Three
logins, three user lists, three places answering "who is this", and that is
where all the confusion came from (no app account even with access ON in the
ERP, nobody remembering the app password, one person sitting in two lists under
two names).

Those three logins **have now been removed**, along with the
`sb.auth.signInWithPassword()` / `signUp()` / `sales_login` routes. Everything
goes through `sso-gate.js`, and it shows no login form: the screen that appears
only gives the **reason** and offers "← Back to Apps", because there is no other
way in from there.

Logout is the same in every app: the ERP session is revoked on the server, the
auth session is closed, the app's local traces are cleared, and it goes to
`launcher.html?bye=1`, which shows "Logged out". If the session ends midway, the
same route is taken, with a reason like `?why=SESSION_REVOKED`.

> **A condition that used to be quietly hidden.** Complaint and Packing data
> run on Supabase Auth, and only `erp-sso` creates that auth session. Before,
> when it failed the app would ask for its own password; **now there is no
> fallback**: the app won't open for that user at all (the reason shows on
> screen). So two things must be in place before this change goes live: the new
> version of `erp-sso` is **deployed**, and every Complaint / Packing user has an
> account (`DIRECT LOGIN OK` for everyone in the `sql/CHECK_PACKING_SSO.sql`
> report).

On logout the token is revoked on the server, and on reload
`sarvRefreshSsoSession_()` fetches fresh roles / app_access from the session, so
if the Admin changed access midway or disabled the user, it takes effect at
once. If the network / RPC fails, nothing changes (the app should still open
offline).

### Single login: done

Setup, in this order:

| Step | What |
|---|---|
| 1 | `SINGLE_LOGIN_MIGRATION.sql`: put your Admin PIN in `v_admin_pin` at the top, then run it in Supabase › SQL Editor. **Once** (safe to re-run). Its section 0b also fixes pgcrypto's `search_path`; to do that separately, use `FIX_PGCRYPTO_SEARCHPATH.sql`. |
| 2 | The table shown at the end (`sarv_user_merge_report`) has every new user's **name + PIN**. Take that list out / hand it over, then run the `drop table` in section 9 of the same file (it holds plain PINs). |
| 3 | Deploy `supabase/functions/erp-sso/`: `supabase functions deploy erp-sso`, or Dashboard › Edge Functions › name `erp-sso` › paste the file. |

### Direct login to Packing / Complaint: one condition

On the launcher, **almost everyone sees the Packing button**: access defaults to
`true` (`launcher.html › appAllowed`: unless a per-user or role-wise block
applies, the app counts as open). But for a *direct* login (without that app's
own password), access isn't enough; the person also needs **an account in that
app**:

| App | What must exist |
|---|---|
| Packing | a row in `auth.users` (with the same id) **+** a row in `packing.profiles`, `active = true` |
| Complaint | a row in `auth.users` (with the same id) **+** `app_users.cmp_username` filled |

Both are created automatically when that app's switch is turned **ON** in
**Admin Panel › Users › Apps**: `admin_grant_app_access()` creates the app's row,
and the `erp-sso` Edge Function creates the auth account (`action: "provision"`).
The switch's tri-state matters here: **`auto` does not create an account**,
because `auto` means "whatever the role-wise matrix says". For anyone whose
switch is `auto` / OFF, `erp_app_session()` returns a **null**
`pk_profile_id` / `cmp_profile_id`, and the app asks for its old
username/password instead of letting them in.

> **This used to be broken.** The Admin Panel's Apps switch only wrote the
> `app_access` jsonb (`admin_set_user_app_access`). `admin_grant_app_access()`
> and the Edge Function's provision route existed, but **nothing called them**.
> So the Admin turned the switch ON, the toast said "saved", and the user still
> got `NO_APP_ACCOUNT`. Now that switch does both jobs, and the Apps list says
> "ON = an account will be created too" on those two apps.

#### Auth account: three cases

`admin_grant_app_access()` says `AUTH_USER_MISSING`, which only means there is
no auth account **on this id**. From there, three routes:

| Case | What happens | Deploy needed? |
|---|---|---|
| The account is on the same id | nothing, straight to the grant | no |
| The account exists, but on **another id** | `erp_link_existing_auth_account()` finds it and moves `app_users.id` onto it (`erp_relink_user_id`: PIN key, sessions, resets, Order Form mirror all together), then grants | no, only `FIX_APP_ACCOUNT_PROVISION.sql` |
| There is no account at all | `erp-sso`'s `provision` creates a new one (`service_role` exists only there) | **yes** |

The second case is the most common, and it was the one that broke first:
provision went straight to creating a new account and GoTrue answered *"A user
with this email address has already been registered"*.

There is a fourth case too, and it **isn't an access problem at all**: the person
has **two rows** in `app_users` (like "PARKASH" and "PARKASH JI", both emp_code
1460), and the auth account sits on the other row. One id can't be on two rows,
so `erp_link_existing_auth_account()` refuses plainly (`AUTH_ACCOUNT_TAKEN`);
linking it quietly would be like merging two people's identities. The fix is
`sql/MERGE_DUPLICATE_USERS.sql`: merge the duplicate row into the KEEP row, then
grant access.

The third case was broken too, with *"Database error creating new user"*. The
cause: the Edge Function sent `user_metadata.name`, which fires the
`auth.users` trigger `cmp_handle_new_auth_user()` (it only runs when `name` is
present), and that tries to create a **second** row for the person in
`app_users`, on the new auth id, with a `cmp_username` made from the name and
the same `contact_no`. Both have unique indexes
(`app_users_cmp_username_key` / `app_users_cmp_mobile_key`), so a clash was
certain, and the trigger's exception got swallowed inside GoTrue and turned into
that generic message. And even if the insert had worked, the next step would
fail: `erp_relink_user_id()` says `NEW_ID_TAKEN` when a row already exists on the
new id, and that trigger had just created one. So this route could never work for
any **existing** ERP user.

Now the Edge Function doesn't send `name` at all (the trigger never gets
involved; the name is already in app_users and `admin_grant_app_access()` fills
`cmp_username` itself), and it sets the new account's `id` itself, so no relink
is needed. If an older GoTrue ignores the `id`, the fallback is a relink, and
that is now safe.

This case used to happen **silently** (the reason was only in the browser
console). Now `packing.html` writes an orange note on the login box with both the
reason code (`NO_APP_ACCOUNT`, `NO_AUTH_USER`, `PROFILE_READ`, `PROFILE_HIDDEN`,
`FN_MISSING`, `SESSION_REVOKED` …) and its fix. For the full list from the
server, run `sql/CHECK_PACKING_SSO.sql`: it gives a verdict for every user.

> Note: only **one** live session runs at a time (`erp_app_login()` revokes old
> tokens). So after logging in on the desktop, the phone session gives
> `SESSION_REVOKED`; the note now says so plainly. If you need both at once, run
> the block in section 6b of `SINGLE_LOGIN_MIGRATION.sql` (5 live sessions).

### Moving around: the launcher and "← Apps"

`launcher.html` is everyone's **first page**: name + PIN, then only the app
buttons the user has access to. Each app has its own colour (ERP blue, Approvals
purple, Complaint orange, Packing green, Order Form pink), so people recognise
it by colour before reading. Dark and light modes both work (from the system
setting), and with `prefers-reduced-motion` all animation is off.

To come back, every app has a floating **← Apps** button in the bottom-right
corner, from a single file (`app-back.js`), so five apps don't end up with five
different back buttons. It decides by itself whether to show:

| Situation | Button |
|---|---|
| The app is open inside the ERP **iframe** (Packing, Order Form, Lot Card, Trims) | **no**: "back" there would open the whole ERP inside the iframe |
| There is **no** single-login session | **no**: the user didn't come from the launcher, and showing them another login screen would be wrong |
| On `launcher.html` itself | **no**: there's nowhere to go back to |
| Everything else | **yes** |

The back button **does not log out**: the session stays, so on reaching the
launcher another app opens without a PIN. Logout is still in one place (the
launcher's Logout, or an app's own logout, which goes there).


### Signup · Forgot PIN · login with emp_code

Setup: `USER_SELF_SERVICE_MIGRATION.sql` (fill in `v_admin_pin` at the top; run
after `SINGLE_LOGIN_MIGRATION.sql`).

**Login username = Employee Code.** Old users had an empty `emp_code`; the
migration fills it by matching names against `employees.person_name`, but **only
when that name appears exactly once in employees**, because a wrong code would
put one person into someone else's account. Those not matched appear in the
report and can **also log in with their name** for now, so nobody is locked out.
The Admin just needs to fill in their emp_code.


**Two accounts on one emp_code is not a mistake.** Your data has two such pairs,
and in both cases it's the same person with two accounts (for different roles,
same contact no.):

| emp_code | Accounts |
|---|---|
| `1001` | SATINDER JI (Purchaser) + SATINDER GHALYAN (Admin) |
| `1532` | ANKUR JI (Purchaser) + ANKUR (GM) |

Merging them, or clearing one emp_code, **would be wrong**: those "… JI" names
are written on `purchase_requirements.purchaser_name` (on 23 and 5 PRs), and the
mobile app filters that Purchaser's list by that name. That's why a **unique
index on `emp_code` was deliberately not added**; the ambiguity is handled at
login: the launcher asks "Which account?" and the person picks one. A new
duplicate can't be created either, because `erp_signup()` refuses when an account
already exists on that code.

In such a case Forgot PIN matches on emp_code + DOB + contact, **all three**; if
two accounts still remain, it stops with `MULTIPLE_ACCOUNTS`. Guessing and
changing the wrong person's PIN would be the worst outcome.

**Signup** (`New Account`): the person enters their Employee Code, their name /
designation / department fill in from `employees` and stay **read-only** (the
company record is the truth). Only the contact no. can be changed. After that,
DOB, PIN, signature (draw pad) and profile photo; **every field is required**.
The photo is shrunk on the client to a 256×256 JPEG and becomes a data-URL, the
same way the signature already works (no separate storage bucket or policies
needed).

The role is set **on the server** to `CMP_USER`; whatever the client sends is
not read at all, so nobody can make themselves Admin from this page. A new user
gets Complaint App access only; the Admin gives the rest.

**Forgot PIN** (`Forgot PIN?`): if Emp Code + DOB + Contact No. all match on the
server, a 10-minute reset token is issued, and the person sets a new PIN. As soon
as the new PIN is in place, all of their open sessions are closed.

> **Being straight about security:** of these three factors, `emp_code` and
> `contact_no` are both readable by anon in `app_users` (the Admin Panel list
> runs on them), so the only real secret is the **DOB**. The migration
> deliberately **closes** DOB to anon (in the grant deny-list, like signature /
> PIN) and adds a limit of 5 wrong attempts / hour / emp_code. Even so, this is
> not bank-grade; for more strictness, adding an OTP (SMS) or "reset only after
> Admin approval" would be better.

**This file doesn't guess where the PIN is stored.** The PIN is in
`role_pins(role, pin_hash)`, but its key format and hashing aren't written down
anywhere in this project (the `ADMIN_PANEL_MIGRATION.sql` file itself doesn't
exist). So the migration creates a **probe user**, watches which key and which
hash your existing `admin_save_user()` writes, and records that method in
`app_settings.pin_write_recipe`. Signup / Reset write the PIN with that recipe
and then **check** it with `verify_app_user_pin()`; if the PIN doesn't verify,
the account isn't created at all (better than leaving a half-made account).

**Admin Panel › Users › Update User** now has a **Use pre saved Sign** button
under the signature pad. The need: the Admin opens the window to add an extra
role and the pad looks empty, as if the signature had been lost. This button
brings the user's saved signature onto the pad with the Admin PIN
(`admin_get_user_signature()`; `get_user_signature()` asks for the user's **own**
PIN, which the Admin doesn't have, hence a separate RPC).

### The login window flash: why it happened, why it doesn't now

Each app's login overlay was visible in the markup **from the start**, and JS
hid it once the server confirmed the session (`erp_app_session` /
`sales_whoami`). That is a network call, so when going from the launcher to an
app the login window would **flash** for a second or two, even though the user
was already logged in.

That's what `sso-preboot.js` is for. It runs **first** in every app's `<head>`,
without `defer`, and decides **from localStorage**, which is synchronous, with no
wait on the network:

| Token present? | What happens |
|---|---|
| **yes** | A class goes on `<html>` and CSS is injected right then that hides `#loginScreen` / `#loginOverlay` / `#sarvLoginGate`, so the overlay **doesn't paint for even one frame**. A spinner splash shows too, so a half-built app (empty list, an unmounted React screen) doesn't show in between. |
| **no** | This file **does nothing**. Someone who didn't come from the launcher sees their own login screen straight away, exactly as before. |

The splash goes away when the app itself calls `sarvSsoPrebootDone()`, that is,
once it has something worth showing (either the real screen or its own login).
Every app makes that call **on every path** (success, failure, and `finally`),
and on top of that there's a 9-second backstop: if the call never happens for
some reason (network dropped, RPC stuck), the splash removes itself and the login
screen appears. **Nobody stays stuck on the spinner**; asking for a login is
better than "nothing is happening".

The splash uses the launcher's dark colour, so going from the launcher into an
app feels like one screen, not two separate pages.

**One user table.** The people in `cmp_profiles` (Complaint, 57 users) and
`packing.profiles` (Packing, 6 users) are now in the ERP's same `app_users`
table. The old rows are **not erased**: they stay linked through
`app_users.cmp_profile_id` / `pk_profile_id`, so that person's past work
(assigned tasks, their signature, slips they made) stays intact. Those apps' own
roles also still come from there (`cmp_profiles.role` / `packing.profiles.role`):
the ERP only says "who this is", and the app's own setup decides "what they can
do".

**One PIN.** The migration creates the ERP PIN for new users (for Complaint users,
the last 4 digits of their mobile). The migration doesn't know where/how a PIN is
stored: it is set through your existing `admin_save_user()` and then **checked**
with `verify_app_user_pin()`, so "PIN set but doesn't work" can't happen silently
(the report shows a warning).

**How the password went away.** Complaint App data runs on Supabase Auth: the
`cmp_notice_board` triggers (and, before the Tasks system was removed on
27/10/2026, `cmp_tasks`: "Only the Admin can assign tasks.") require
`auth.uid()`. There were two options: move those policies/triggers onto
the anon model, or create a **real** auth session for the person from the ERP
session. The second was chosen: it **doesn't touch a single policy**,
`auth.uid()` is really set, so every old trigger, RLS rule and `created_by` works
exactly as before. The `erp-sso` Edge Function does that job: it checks the ERP
token and returns a one-time magic-link token, and the app creates its session
with `verifyOtp()`. The `service_role` key lives only in the function, not in any
page, and no password is stored anywhere.

The same change also fixed two old Packing faults: on SSO login `auth.getUser()`
was empty, so **saving the signature** threw a TypeError and the signature never
made it onto the PDF.

**New roles.** `CMP_USER` / `PK_USER`, for people whose work is only in their own
app. All ERP buttons are closed to them in **two layers**: per-user
`app_access`, and role-wise Tab Visibility (the migration writes both). There's
one new key too: `HOME_ERP_APP`, the "ERP" button on the launcher.

**For someone with no account in an app**, that app's button is now **hidden**
at login (before, the button showed and pressing it brought up that app's own
login screen). The migration marks this as `APP_HIDDEN` in the report. The Admin
should create the person's account and link it, then set Users › Apps back to
auto / ON.

**What has to be done by hand:** names in doubt (two ERP users with the same
name, or pairs like `SATINDER_GHALYAN` vs `SATINDER JI`) are **not linked** by the
migration; linking the wrong person would put their past work under someone
else's name. They appear under `NEEDS_MANUAL_LINK` in the report; link them from
Admin Panel › Users › **Link external accounts**.

Note: the Complaint App's own `admin-users` Edge Function runs on the admin's
**access_token**, so the ERP Admin Panel can't create users through it directly.
A new Complaint user is still created from that app's signup / admin screen
(then run the migration again or link them by hand).

## Which sidebar module each role sees

**Master Data › Settings › Admin Panel › Tab Visibility › ERP Shell › Sidebar
Modules**: one row per module, one column per role. Turning one off removes that
module from that role's sidebar completely (Coming Soon ones included).

There are two levels, and they do different jobs:

| Level | Where | What it does |
|---|---|---|
| Module | `ERP Shell › Sidebar Modules` (`ERP_*`) | Whether the sidebar button shows |
| Screen | `Home Page` (`HOME_*`) | Whether the user has rights to that screen; the sidebar leaf reads this |

So module ON + screen OFF means: the module shows, but not that screen's leaf. And
an `ERP_*` row only hides; the real guard on a screen is `HOME_*`, so nobody can
gain extra access through the sidebar.

Default: every module for everyone, `Administration` only for the Admin. Pressing
Save redraws the sidebar (it's tied to `sarvApplyAccess`); no reload needed. When
you add a new module to `MODULES` in `erp-shell.js`, also add its `ERP_<key>` row
to `SARV_TABS` in `store-core.js`, otherwise it will always show.

## Removing the ERP shell

Remove two lines from `Store.html`: `<link rel="stylesheet" href="erp-shell.css">`
and `<script src="erp-shell.js"></script>`. The old tile Home screen comes back;
nothing else changes, because the shell didn't touch a single line of
`store-core.js`.

## Item Master: Pending PR / PO column

Master Data › Item Master has a **Pending PR / PO** column: for each item, the
qty still to come into the store. Click a figure for a popup listing every open
PR and PO behind it, with dates, vendor / requester, qty, what is done, what is
pending, the due date (red when a PO's delivery date has passed) and an **Open
PDF** link.

| Part | Rule |
|---|---|
| PO | `ordered_qty − received_qty` on POs that are not Received / Closed (Short) / Cancelled / Rejected |
| PR | requested qty on open PRs (not Completed / Cancelled / Rejected / Closed) that is not on a live PO yet and has not come in "without PO" |

The figure's colour says where the qty sits: **green** = on PO only, **orange**
= on PR only, **purple** = both (hover for the exact split).

A qty is counted once, never on both sides: a PR line's qty that is already on a
PO counts on the PO side, using the same `req_no|item name` key as the Pending
Items table. The lookup (`imLoadPipeline_` in `store-core.js`) runs after the
table is drawn, so the column shows "…" for a moment; sort, filter, the Columns
popup and the CSV / PDF export all include it. No migration.

## Purchase sidebar: PO Follow-up Report, PO Details Report; Sales apps in a new tab

- **Purchase › PO Follow-up Report** opens the PR → PO → Inward Follow-Up Report on
  its own: no PO KPI cards, no Build PO / Generated POs tabs. **Purchase › PO
  Generation** shows Build PO + Generated POs only. Both are the same panel in two
  modes (`applyPoOnly` in `erp-shell.js`), and both still obey Tab Visibility
  (`HOME_PO`, and `PO_SUB_REPORT` for the report).
- **Purchase › PO Details Report** (ordered vs received per PO line, CSV / PDF) moved
  here from the Print History / Reports toolbar. Same function (`openPoDetailsReport`),
  same access row (`HOME_REPORTS`).
- **Sales › Order Form** and **Sales › Packing & Dispatch** in the sidebar always open
  the standalone page in a new browser tab, not the ERP iframe. The ERP login carries
  over (same origin, `sso-gate.js`). If the browser blocks the tab, a toast gives a link.

## Dates: always DD/MM/YYYY

`date-dmy.js` is loaded first in every app's `<head>`. It turns every
`<input type="date">` (including ones added later, and React ones in Complaint) into
a DD/MM/YYYY text box, whatever the computer's own date format is. Slashes are typed
for you, and after DD/MM the current year fills in (selected, so typing replaces it).
The calendar icon, Alt+Down or F4 opens the normal date picker. An impossible date or
one outside `min` / `max` gets a red border.

For code nothing changes: the element's `.value` still reads and writes
`YYYY-MM-DD` ('' while incomplete), and `.valueAsDate` works. The box is now
`type="text"` with `data-dmy="1"`, so select it with `input[type=date],input[data-dmy]`.
`datetime-local` boxes are not converted. `today()` in `store-core.js` now returns the
local date (it used UTC, which gave yesterday's date before 05:30 IST).

## My Day: the Store Incharge's daily task list

`store-mytasks.js` + `store-mytasks.css`. Opens from **Store › My Day (Daily Tasks)**, the
**Tasks** button in the top bar (with an open-task count on it), and by itself once a day
after login until that day is closed. Who sees it: Admin Panel › Tab Visibility ›
`HOME_MYDAY` (default Store In-Charge + Admin).

One step per task. Each step shows a count read from ERP data, a short guide, the open
rows, a button that opens the exact screen with the filter set, and **Recheck**. A task is
**done only when its count reaches 0**; it cannot be ticked by hand, only skipped with a
written reason. The last step, **Close the day**, is allowed once every task is done or
skipped.

| Task | Counted from | Done when | Due |
|---|---|---|---|
| Below-MSV items: raise PRs | Item Master balance < MSV, minus open PR / PO qty (Pending PR / PO column) | every shortfall is on a PR / PO. **Raise PR for ticked items** fills the PR form (qty = Std Order Qty or the shortfall, whichever is more) | 11:00 |
| Tell requesters material has arrived | PO Follow-up Report: receipts of the last 30 days without "Inform to Requester" | every receipt is ticked | 17:00 |
| Fix Rejected / Hold PRs | PRs in Rejected / Hold, with the reason | each is resubmitted (back to Pending) or cancelled | 11:00 |
| PRs waiting 5+ days for a PO | open PR lines with no PO, 5+ days old | each PR is marked "reminded" today | 12:00 |
| Send entry PDFs on WhatsApp | Inward / Outward / Issue of the last 3 days not sent from this computer | all sent | 17:00 |
| Physical stock count | 10 items a day, rotating (never counted first, then the oldest count) | all 10 saved. Recording only: nothing changes stock; the MD reviews differences | 16:00 |

**Setup:** run `DAILY_TASKS_MIGRATION.sql` once (tables `daily_task_log` and `stock_counts`).
Until then everything works except the stock count, and the day's record is kept in the
browser only (a yellow line says so). The constants at the top of `store-mytasks.js` set the
stock-count size and the day windows; each task's `due` sets its deadline.

## HR & Payroll (hr-payroll.html)

Replaces the "MONTHLY ATTENDANCE UNIT-2" Google workbook. Opens from the launcher tile
**HR & Payroll** (`HOME_HR_PAYROLL`, default Admin / MD / GM / Accountant) or from
ERP › HR Management (each leaf opens the app on its screen, e.g. `hr-payroll.html#attendance`).
The header has an **ERP** button back to `index.html` (shown only with ERP access).

| Workbook tab | Screen | Table(s) |
|---|---|---|
| EMPLOYEE MASTER | Employees | `hr_employees`, `hr_salary_structures` (duty hours + salary, effective from a month) |
| MACHINE DATA | Attendance (read-only month view; filled by Import › Attendance: machine data). Its **Machine data** button (right `HR_MACHINE_EDIT`, default Admin only) lists the imported rows and lets a day be corrected / added / removed with a reason (source `EDIT`, audit-logged) | `hr_attendance` (one row per employee per day) |
| EMP. EXP | Advances & Deductions, Loans | `hr_transactions`, `hr_loans` (EMIs post as `LOAN_EMI`) |
| ON ROLL-&lt;Month&gt;-26 | PF / ESI / LWF | `hr_statutory` |
| SALARY SHEET | Salary Sheet, payslips, register | `hr_payroll_runs`, `hr_payroll_lines` |

**The calculation runs on the server** (`hr_compute_` in `HR_PAYROLL_MIGRATION.sql`), column
by column as in the SALARY SHEET (K … AI; the formulas are listed in the SQL and under
"How each column is calculated" on the Salary Sheet screen). Differences from the sheet,
on purpose: salary is effective-dated instead of one Hour/Salary pair per month; salary-class
behaviour is the `hr_salary_classes` table; the days basis, weekly-off rule and cash rounding
are settings; the hard-coded `-26`, `1-JUN-2026` and range mismatches are gone; `INCENTIVE` /
`ARREAR` entries add to X (0 when unused). A **locked** month freezes its attendance,
transactions, PF/ESI and sheet. Net Cash Paid (AI) is typed per row and survives a recompute.

**Security:** every `hr_*` table has RLS on with **no** policy, so the anon key reads nothing.
The page only calls `hr_*` RPCs, which take the launcher session token and check the
`HR_*` right (Admin Panel › Tab Visibility › HR & Payroll › Rights, or per user under
Users › Apps). Defaults live in two places that must match: `SARV_TABS` in `store-core.js`
and `hr_perm_default_()` in the SQL.

**Setup:** run `HR_PAYROLL_MIGRATION.sql` once in the SQL Editor (idempotent). It also copies
the ERP `employees` list (code, name, department, designation) into `hr_employees` as a head
start. Until it is run the page shows a setup screen. Users who logged in before the tile
existed get it on their next launcher visit (or log out and in). Then run
`HR_MACHINE_EDIT_MIGRATION.sql` (idempotent) for the Machine data screen: it adds
`HR_MACHINE_EDIT` to `hr_perms_` / `hr_perm_default_` and the RPCs `hr_machine_data_list` /
`hr_machine_data_save`. Until then the button stays hidden.

**First month from the sheet:** Import › Employee Master (map DUTY HOUR / SALARY to the month's
Hour / Salary columns) → Attendance: machine data (the only way attendance is entered) → EMP. EXP (re-import is safe,
duplicates are skipped) → ON ROLL (defaults to columns G / AC / AD / AE / AG, header row 2) →
Salary Sheet › Compute. Check one FIXED, one MONTHLY and one CLASS 2 employee against the old
sheet before going live.

**Attendance is import-only.** The Attendance screen shows the month but cannot be edited.
Hours come only from the biometric machine export (Import › Attendance: machine data);
`hr_save_attendance` refuses any other source (`ATTENDANCE_IMPORT_ONLY`). To correct a day,
fix it in the machine export and import again: the same employee + date is overwritten.

**Export:** every list (Employees, Attendance, Advances, PF / ESI, Salary Sheet) has
Export CSV (raw values, for Excel) and Export PDF (A4 landscape, company name, filters in
the title, totals row, page numbers; jsPDF + autotable, the same builds as the ERP).

**Employee fields (added):** LWF ID (on the form where Class was), Emp - Casual / On Roll
(`ON ROLL` / `CASUAL`), Emp - Type (`COMPANY` / `CONTRACTOR`), Shift from / to (HH:MM), City,
State. They are columns of `hr_employees` with checks on the two dropdowns; the Employee Master
import reads `LWF ID`, `EMP-CASWAL/ON ROLL`, `EMP-TYPE`, `SHIFT FROM`, `SHIFT TO`, `CITY`, `STATE`
(times as 08:00 / 8 PM; CASWAL is read as CASUAL). `emp_class` is no longer on the form or
in the import but stays in the table for the class rules: give CLASS 2 rules with
Salary Class = CLASS 2.

## Unloader Supervisor: every new Inward verified at unloading (unloader.html)

Every **new** Inward submitted in the ERP now goes to the Unloader Supervisor before it can be
saved. Admin edits of an already saved record are not sent again.

1. **ERP › Inward › Submit Inward.** The entry goes to the supervisor as request `UL-00001`
   (`inward_unload_approvals`, Pending). Nothing is saved yet, and the invoice photo is not
   needed at this step.
2. **unloader.html** (launcher tile **Unloader Supervisor**, looks like the Approvals app). The
   supervisor sees the items with their Qty / Weight and the PO / PR pending figures (no rates),
   takes item photos (at least 1, up to 10, compressed on the phone) and approves with their
   **own login PIN**. Reject needs a reason. 5 wrong PINs in 15 minutes lock them out for a while.
3. **ERP › Final Submit.** If the form is still open, press Submit again with the same values.
   If it was closed, the approved entry is in the **PO Number list** under "APPROVED — DRAFT
   SAVED" (badge **UNLOADER**); **Load into form** fills it in with the approved figures locked.
   Entries still waiting are listed above it ("WAITING AT UNLOADER SUPERVISOR"). The invoice
   photo is required here, as before.

On save the approval is retired (`used_on`) and the supervisor's **Name, Emp Code, Mobile No.,
Designation, time and request no.** are stored on the record (`inward_entries.unload_info`).
The Inward PDF prints them under Party State (rows "Unloaded By", "Unloader Mob.",
"Unload Verified"), and the supervisor's photos are added to the **Original Invoice PDF** after
the invoice pages.

**Rules:** the approval is keyed by the same signature as the MD Inward Approval (supplier,
invoice, PO / PR, every row's item / qty / weight / rate), so changing a figure after approval
asks again. Sending a corrected entry for the same invoice cancels the older pending request.
**Two approvals, in parallel:** the supervisor confirms the unloaded Qty / Weight (every new
Inward); the **MD** still approves anything beyond the PO / PR (excess qty / weight, a changed
rate, an extra item), as before. One Submit sends both requests; the entry can be saved (Final
Submit) only when both have approved. Either approved draft can be loaded; the MD card shows
"UNLOADER ✓" once the supervisor has approved too. Other workflow is unchanged.

**Access:** app key `HOME_UNLOADER`, **Admin only by default**. Turn it ON for the supervisor(s)
under Admin Panel › Tab Visibility (role-wise) or Users › Apps (per user); they must log in
again once. Their user profile needs **Emp Code and Contact No.** (both are printed on the PDF);
approval is refused without them. The server checks the session, the app access and the PIN on
every call and takes the approver's details from `app_users`, so the page cannot fake them.

**Setup:** run `UNLOADER_APPROVAL_MIGRATION.sql` once in the SQL Editor (safe to re-run). Until
it runs, Inward saves exactly as before and the ERP shows a one-time warning naming the file.
Then run `UNLOADER_ASSIGN_MIGRATION.sql` (after it, also safe to re-run).

**Choosing the supervisor:** on Submit the ERP lists every active login that gets the Unloader
Supervisor app (same rule as the launcher: user override → role Tab Visibility → default), with
Emp Code / designation / mobile and a search box when the list is long. The store picks one; the
last choice is remembered on that PC. Only that supervisor sees the request in the app and only
they can approve / reject it (`ul_list` / `ul_decide` check `assigned_to_uid` on the server,
`NOT_ASSIGNED` otherwise). Pressing Submit again while it waits offers **Move** to a different
supervisor (same request, no duplicate). A rejected entry pre-selects the person who rejected it.
The ERP "WAITING AT UNLOADER SUPERVISOR" list shows `→ name`. Requests raised before the
migration have no supervisor and stay visible to all. Without `UNLOADER_ASSIGN_MIGRATION.sql`
the request still goes to every supervisor and the ERP warns once.

## Store In / Out PDF Checklists (Dropdown Master)

**Master Data › Dropdown Master › Store — Inward / Outward › "Store In / Out PDF Checklist"**
(Admin only). **+ New Checklist** opens a builder:

| Field | Meaning |
|---|---|
| Name | Heading printed above the lines (optional) |
| In / Out | Inward, Outward / Issue, or both |
| Entry Type | Tick INWARD / INWARD NB / OUTWARD / ISSUE to limit it; none ticked = every type of that direction |
| For | **All items** (every matching entry), **Item Category** (tick categories; exact match), **Item Description** or **Item Name** (one text per line; the item matches if it *contains* it). A live count shows how many Item Master items match |
| Lines | One checklist point per line (max 40), each printed with an empty tick-box |
| Active | Untick to pause a checklist without deleting it |

When a Store entry is submitted, **every** active checklist that matches its direction, Entry
Type and at least one of its items is printed on the entry's PDF, in a "CHECKLIST" box above the
signatures, with the items it applies to. It appears on both copies (Account / Supplier or
Receiver), in both layouts, in the HTML fallback and in the pre-submit preview. On the
landscape (two copies side by side) PDF a very long list is shortened with a note; the TWO PAGE
PDF always carries it in full and continues on a new page if needed. Checklists are matched from
the Master as it is when the PDF is built (an Admin edit regenerates with the current list).

**Storage:** no new table or migration. Each checklist is one `sales_dropdowns` row under key
`erp_storeChecklist`, the value a JSON object `{v:1, name, dir, types, by, match, lines, on}`.
Order (▲ ▼), Admin-only writes and loading are the Dropdown Master's own. A field added later is
read with a default, and a row that cannot be read is listed (to delete) and never printed.
Logic: `store-core.js` › STORE CHECKLISTS (`sarvStoreChecklistsFor_`, `drawStoreChecklistNative_`,
`storeChecklistHtml_`, builder `sarvChkMainHtml_`).

## Task Manager: PC Follow-up and EA Follow-ups

**PC Follow-up** (task_manager.html). Each pending task's date starts on **today** and its
**time starts empty**, so a time is always chosen on purpose. A remark is always needed, and a
time is needed when the date is today (it must be later than the current hour).
**Daily tasks never change date:** on a past day, or before their target time today, they show
locked with the reason. Once missed today they can only get a **later time today**; the task
stays on today's sheet and is scored against the new time. Other tasks can still be moved to a
later date, as before ("All to next day" skips daily tasks).
Server side: run `TM_PC_FOLLOWUP_SAMEDAY_MIGRATION.sql` (after `TASK_MANAGER_MIGRATION.sql`;
safe to re-run). It lets `tm_follow_up` take the same day (today only, time required) and refuses
a date change for a daily task from PC Follow-up (`DAILY_SAME_DAY`). MD Oversight is unchanged.
Until it is run, a same-day save is refused by the server with "Please choose a valid date".

**EA Delegation › Active EA Follow-ups** has two sections: **1. Follow-up** (EA tasks due today
or earlier and not done, oldest first, marked Overdue / Due today) and **2. All Delegated Tasks
Pending** (every EA task not done, upcoming ones included, by due date).

## Yarn Unloading (Yarn-Unloading.html)

Box-wise yarn weights at the godown (New Entry, Saved Draft, Download Report, Cloud Reports; data in
`yarn_unloading_drafts`, PDFs in bucket `sarv-pdfs/yarn-unloading/`). The entry screen, drafts,
PDF / CSV and the offline-first local storage work exactly as before.

**Login:** only from the launcher (ERP single sign-on, app key `HOME_YARN_UNLOADING`). The old
per-phone master password and the Cloud Reports password 1700 are gone. Clearing / deleting an
unsaved draft now asks for the user's own login PIN (checked on the server; with no net, a plain
confirmation). The dashboard shows the user's name and a Log out button ("Do you want Log out?").

**Access:** the launcher tile is **OFF for everyone by default** (Admin included). Switch it ON
under Admin Panel › Tab Visibility › Home Page (role-wise) or Users › Apps (per user). The buttons
inside are rights in the same two places:

| Key | Button | Default |
|---|---|---|
| `YU_ENTRY` | New Entry / Saved Draft / Download Report | everyone who has the app |
| `YU_CLOUD` | Cloud Reports (was password 1700) | Admin |

A user with only `YU_CLOUD` goes straight to Cloud Reports. The page works these out itself
(`YU_DEFAULTS` in the page must match the `YU_*` rows of `SARV_TABS`). The yarn table itself is
still open to the anon key as before, so these are screen rights, not database rights.

**Offline:** the godown often has no net. A phone that opened the app online keeps working offline
for 7 days with the last login and rights (yellow note on the dashboard); logout or a new login
ends that.

## Admin Panel › Users › Apps: only ON / OFF

The per-user Apps list (apps and inner buttons) has only **ON** and **OFF**; "auto" was removed.
A key the user has no value for yet shows "not set" and starts at what the role gives today, so
opening and saving changes nobody's access. On Save every key becomes the user's own value
(untouched keys take what the saved roles give); after that, role-wise Tab Visibility changes no
longer move that user. Complaint / Packing accounts are created or deactivated only for keys the
Admin actually set or changed.

**New users:** the full **Task Manager** tile, **Yarn Unloading** and **Sheet Links** start OFF for
every new login (`SARV_NEW_USER_OFF`); **My Tasks** stays ON. For launcher self-signups the server does the same:
run `sql/NEW_USER_APP_DEFAULTS_MIGRATION.sql` once (trigger on `app_users` insert; existing users
are not touched; safe to re-run). **`NEW_USER_SHEET_LINKS_OFF_MIGRATION.sql`** also writes these three
apps as OFF directly inside `erp_signup` (its key list had no `HOME_SHEET_LINKS`, so every signup
fell through to Sheet Links' default of ALL). It changes only that list; existing users are untouched.
