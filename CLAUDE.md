# CLAUDE.md

Sarv India (mink blanket manufacturer) ERP: a set of static HTML/JS apps on a shared Supabase backend
(`https://jdlzgjgxxjkjejkhvdij.supabase.co`). No build step, no package manager, no tests. Files open
directly in the browser (also over `file://`) or are served as static files from one origin.

`README.md` is the detailed feature/setup reference. Read the relevant section before
changing a feature. Note: the README and older comments say `Store.html`; that file is now `index.html`.

## Apps (one HTML file each)

| File | What it is | Notes |
|---|---|---|
| `launcher.html` | Login page (name/emp_code + PIN) and app picker | The **only** login screen. Creates the shared session via `erp_app_login()` |
| `index.html` | Desktop ERP: Store / Purchase / Production / Master Data / Admin Panel | Markup only; logic in `store-core.js` etc. |
| `mobile.html` | Mobile approvals app (PR/PO approvals, PO follow-up) | `mobile.css` + `mobile-core.js`. FIELD BOY PRs (Purchaser "FIELD BOY" or any Purchaser user ticked "Field Boy" in Users & Roles: `app_users.is_field_boy`, `sql/FIELD_BOY_PERSONS_MIGRATION.sql`; server test `fb_is_field_boy_`, pages read `fb_field_boy_names()`: ERP `prIsFieldBoy_` / `sarvLoadFieldBoys_`, mobile `isFieldBoy` / `loadFieldBoys`): item photo → Send for Approval → requester approves in `my-requests.html` → Store entry → requester confirms receipt (purple cards, 5-step line there; the Field Boy's own Confirm moves it to Done on mobile); Store receives approved items only and such a PR can't be edited (`sql/FIELD_BOY_APPROVAL_MIGRATION.sql`, `fb_patch` / `mr_fb_decide`, state in `pdf_snapshot.fieldChecklist` v2, guarded by triggers). An item with no photo can still be deleted on its own from PO Generation › Pending Items (`fbLineDeletable_` / `sarvFbDeleteLine_` → `fb_delete_line`, `sql/FB_DELETE_LINE_MIGRATION.sql`, right EDIT PR, reason in the checklist history). Note: `pdf_snapshot.items` is in ENTRY order, not line-id order, so match a snapshot entry by item name + qty, never by position |
| `my-requests.html` | Track My Store Request: the user's own PRs (by Emp Code) PR → PO → receipt, Confirm receipt, Field Boy item approval, plus **New PR** (header) and **Edit PR** (card / detail) | Launcher app `HOME_MY_REQUESTS` (on for all). Data only via token-checked `mr_*` RPCs. New / Edit PR: `sql/MY_REQUESTS_PR_MIGRATION.sql` (`mr_pr_masters`, `mr_pr_save` with own PIN; Requested By always from the session; edit rule `mr_pr_edit_why_`: own PR, Pending / Rejected / Hold, no live PO, nothing received, no vendor quotes yet unless on Hold; a Rejected / Hold edit goes back to Pending like the ERP's Edit PR; edit log in `pdf_snapshot.requesterEdits`). No PDF is built there; mobile rebuilds it from `pdf_snapshot` at the Purchaser's step. Unsent new PR kept in localStorage `mr_pr_draft:<emp code>`. Field Boy PR: the requester can change the qty of / delete ONE item that is not APPROVED, even when the PR is FB-locked (`sql/MR_FB_ITEM_EDIT_MIGRATION.sql`, `mr_fb_item_change`, own PIN, reason for a delete, not the last item, history ev `QTY` / `DELETED`; a SENT item whose qty changes goes back to the Field Boy as PHOTO) |
| `order-form.html` | Sales › Order Form | Iframe inside ERP (`#orderFormFrame`) or standalone |
| `packing.html` | Sales › Packing & Dispatch | Iframe in ERP or standalone; uses Supabase Auth via SSO |
| `complaint.html` | Complaint system (React 18 UMD + Babel standalone + Tailwind) | Uses Supabase Auth via SSO; `sw.js` is its push-notification service worker |
| `lot-card-manager.html` | Manufacturing › Lot Card Manager | Iframe; separate page because Tailwind would reset ERP styles |
| `printing-lot.html` | Manufacturing › Printing Lot Card | Iframe; also `printing-lot.html#production` for shop floor |
| `trims-manager.html` | Manufacturing › Trims & Packing Material Manager | Iframe |
| `dispatch_report_interface.html` | Dispatch Report (date range, party / product / slip-wise, matrix, analytics, CSV; Tailwind + Chart.js) | Launcher app `HOME_DISPATCH_REPORT` (default Admin/MD/GM/Accountant, set in both `SARV_TABS` and launcher `defRoles`). Data comes from the OLD packing project `hghomygvryyihezvmrjj` via anon RPC `dispatch_report_rows` (`sql/DISPATCH_REPORT_RPC.sql`); amount rules live in its `RULES` block |
| `hr-payroll.html` | HR & Payroll (employees, read-only attendance filled by the machine-data import plus a Machine data view/edit screen behind `HR_MACHINE_EDIT` (`HR_MACHINE_EDIT_MIGRATION.sql`), advances/loans, PF/ESI, salary sheet, payslips, CSV import with sample sheets, Export CSV + PDF; Chart.js, jsPDF/autotable) | Launcher app `HOME_HR_PAYROLL` (default Admin/MD/GM/Accountant, in both `SARV_TABS` and launcher `defRoles`); ERP › HR Management leaves open it by `#hash`. Tables `hr_*` have RLS with no policies; all access via token-checked `hr_*` RPCs, rights `HR_*` (`hr_perms_` in `HR_PAYROLL_MIGRATION.sql`; keep its defaults in sync). Salary is computed server-side in `hr_compute_` (SALARY SHEET formulas) |
| `unloader.html` | Unloader Supervisor (mobile, uses `mobile.css`): verifies every NEW Inward before the ERP can save it — item photos + own PIN to approve, reason to reject | Launcher app `HOME_UNLOADER` (default Admin only, in both `SARV_TABS` and launcher `defRoles`). Server side `UNLOADER_APPROVAL_MIGRATION.sql` (`inward_unload_approvals`, `inward_unload_photos`, `ul_*` RPCs; approver details copied from `app_users`). ERP gate `ensureUnloaderApproval_` in `store-core.js`, keyed by `inwardApprovalSignature_` like the MD Inward Approval; the store picks ONE supervisor on Submit (`ulChooseSupervisor_`; only they see / decide it, `assigned_to_uid`, `UNLOADER_ASSIGN_MIGRATION.sql`); runs in parallel with the MD gate (supervisor confirms unloaded qty on every new Inward; MD still approves excess qty / weight / rate / extra item; Final Submit needs both); approved requests appear as drafts (`_src:'UL'`) in the PO Number list; `unload_info` on `inward_entries` prints on the Inward PDF and the photos go into the Original Invoice PDF |
| `Yarn-Unloading.html` | Yarn Unloading (box-wise weights, offline-first localStorage + cloud mirror `yarn_unloading_drafts`, PDF / CSV, Cloud Reports) | Launcher app `HOME_YARN_UNLOADING`, OFF for everyone by default (`def:[]` in `SARV_TABS`, `defRoles:[]` in launcher). SSO via `sso-gate.js` (no own password any more); inner rights `YU_ENTRY` / `YU_CLOUD` computed in the page (`YU_DEFAULTS`, keep in sync with `SARV_TABS`); last login cached 7 days for offline use |
| `sop.html` | SOPs: `sop.html` = My SOPs (swipeable step cards with pictures, tick points, "I have read and understood"); `sop.html#master` = SOP Master (create / edit steps + photos, assign by designation and / or user, who-read report, and an "Assign to users" tab: users × SOPs / sub-SOPs table with filters and bulk assign). Each step is a sub-SOP (`SOP-001.3`) assignable per user via `steps[].users`, keyed by the step's fixed `steps[].sid`; such a user sees only those steps | My SOPs is the launcher's first tile, shown only when something is assigned (`sop_my_count`; no app key, gate booted with `app: null`). Master opens from ERP › Masters › SOP Master (iframe `#sopFrame`, key `HOME_SOP_MASTER`, default Admin/MD/GM, lock Admin). Server side `sql/SOP_MASTER_MIGRATION.sql` (`sop_master`, `sop_acks`, token-checked `sop_*` RPCs; `sop_can_manage_` default must match the `SARV_TABS` row). Designation = `app_users.designation`, else the Employee Master's by Emp Code |
| `fms.html` | FMS from Nexus 2.0: `fms.html#builder` = FMS Builder (steps, doer, start, TAT, flow chart, simulate, doer tables, fields & JSON, versions, office calendar, history), `fms.html#view` = FMS View (tracker grid per flow, My steps, punch a record, record timeline with Done / Undo). Files `fms-engine.js` (Nexus `engine.js`, keep unchanged) → `fms-core.js` → `fms-builder.js` → `fms-view.js`, `fms.css` | Sidebar module **Task** (`ERP_TASK`) in `erp-shell.js`, leaves `FMS_BUILDER` / `FMS_VIEW` → one iframe `#fmsFrame` (`#fmsPanel`), the leaf sets the `#hash`. Server `sql/FMS_MIGRATION.sql` (`fms_*` tables, RLS no policies, token-checked `fms_*` RPCs). Rights `HOME_FMS_BUILDER`, `HOME_FMS_VIEW`, `FMS_ADD`, `FMS_MANAGE` (`fms_perm_default_` must match `SARV_TABS`). Gate booted with `app: null`. ERP data links (`sql/FMS_DATA_LINK_MIGRATION.sql`): ERP events in `fms_sources` (built-in PR / PO / Inward ones + custom from Builder › ERP Events, any non-secret table, `fms_src_blocked_`); a step `status {auto, rule:'erp_data', source, keyField}` and a flow `process.autoStart {source, field, from}` are run by the SERVER (`fms_auto_sync_`, pg_cron 'fms-auto-sync' every 5 min + `fms_sync_now` from the page), never decided in the browser; the step's actual = the event's own time. Builder: step sentence (`stepSentence`), Test button, template "Purchase" (`purchaseTemplate`). Task Manager › My Tasks shows the user's due manual FMS steps ("FMS steps for you", `fmsMineLoad` via `fms_my_open` + fms-engine.js, Done → `fms_step_done`). Same page also has the Nexus Task Tracker / Escalations / Scorecard / Plan vs Actual (`#tasks` / `#esc` / `#score` / `#pva`, `fms-tasks.js`, leaves `TASK_TRACKER` / `TT_ESCALATIONS` / `TT_SCORECARD` / `TT_PLANACTUAL`): rows from FMS steps, Task Manager via its own `tm_load` (its `occursOn` / `taskScore` ported; keep in step with `task_manager.html`) and complaints via `tt_complaints`; server `sql/TASK_TRACKER_MIGRATION.sql`, rights `HOME_TASK_TRACKER`, `HOME_TT_*`, `TT_ALL`, `TT_SETUP` (`tt_perm_default_` must match `SARV_TABS`) |
| `catalog_maker.html` | Catalog Maker (cover + product pages, live preview, PDF export page-by-page via html2pdf; Tailwind) | ERP › Masters › Catalog Templates (iframe `#catalogFrame`, key `HOME_CATALOG_MAKER`, default Admin/MD/GM, lock Admin). SSO via `sso-gate.js` (`app: null`). Templates on the server: `sql/CATALOG_TEMPLATES_MIGRATION.sql` (`catalog_templates`, RLS no policies, token-checked `cat_*` RPCs; `cat_can_manage_` default must match `SARV_TABS`); save with the opened `version`, else `CONFLICT`; `cat_list` / `cat_get` need only a session, save / delete need the right. `catalog_maker.html#render` = no editor, a hidden-iframe PDF renderer driven by `postMessage` from Design Master › Online Catalogue › Choose Template (`ocBuildTemplate` in `store-design-master.js`: template + selected designs' photoshoot photos as data URLs → PDF blob). Browser draft in localforage (`touchwood_catalog` + `_meta`). Cover waves are an `<img>` (SVG → PNG for the PDF), photos are CSS backgrounds (html2canvas has no `object-fit`); cover picture shapes (`page.coverShapes`) are SVG clip paths, turned into PNGs for the PDF (html2canvas ignores clip-path) |
| `price_list_generator.html` | Sales › Price List (React 18 UMD + Babel + Tailwind; categories / products / terms, themes, logo + background, one-page A4 PDF via html2canvas + jsPDF) | ERP iframe `#priceListFrame` (`#priceListPanel`), key `HOME_PRICE_LIST` (default Admin/MD/GM, lock Admin). SSO via `sso-gate.js` (`app: null`); `data-no-caps` (customer-facing). Saved DATE-WISE: `sql/PRICE_LIST_MIGRATION.sql` (`price_lists`, one row per `wef_date`, RLS no policies, token-checked `pl_*` RPCs; `pl_ctx_` allows `HOME_PRICE_LIST` in the session's `allowed_apps` or Admin). Old browser-only lists (`sihf_price_lists_db`) can be uploaded from Saved Lists |
| `emission-live.html` | Stack Emission (Live), TWO units, one view each, side by side on half the screen each (stacked on narrow screens; Unit 1 teal, Unit 2 violet, `UNITS` in the page; the old top switch is hidden); both history reports load at the start with Detail = 2-hourly average by default: boiler stack PM / NOx / SO2 from the Access Surveykshan portal (Unit 1 industry `63fdec8a42c7fc4f253681e8`, logger M00601; Unit 2 industry `68e63600e13fce98d6e998e7`, logger M00817, named "Diamond India Pvt Ltd" on the portal): live tiles vs working range / legal limit, history report with Above / Below filter + CSV, alerts (Tailwind) | Launcher app `HOME_EMISSION_LIVE` (default Admin/MD/GM, in both `SARV_TABS` and launcher `defRoles`); ERP › Quality leaf (`external`). The portal's data endpoints are public with open CORS, so live data is fetched from the browser; no portal password is stored for either unit. Unit 2 sends PM live as "SPM": read as PM (`PARAM_ALIAS`, `emission_param_`). Saved minute-wise by `sql/EMISSION_MIGRATION.sql` (pg_cron every 10 min for the whole day + `http` extension, plus `emission_watch_` every 15 seconds for the last 10 minutes only (`emission_sync_span_`; the window must start on a whole minute, the portal's steps start at the asked time); `emission_units` (unit → industry, loggers refreshed each sync), `emission_readings` / `emission_latest` / `emission_sync_log`, `emission_bands` per unit + param, `emission_alerts`; RLS no policies; token-checked RPCs `emission_status` / `emission_rows` / `emission_alerts_list` / `emission_alert_ack` / `emission_band_save` take `p_unit` ('U1' / 'U2'), `emission_sync_now` syncs all; `emission_backfill_(from, to)` by hand). Without the migration each view falls back to the portal (31 days) |
| `task_manager.html` | Task Manager (employee checklists, EA, buddy, score card; Tailwind) | Launcher app `HOME_TASK_MANAGER`; SSO via `sso-gate.js`; inner buttons = `TM_*` rows in `SARV_TABS`, enforced server-side by `tm_perms_` (`TASK_MANAGER_MIGRATION.sql`; keep its defaults in sync). Leave / Holiday / Emergency days (`tm_day_offs`, `sql/TM_DAY_OFF_MIGRATION.sql`, `dayOffOf`, right `TM_DAY_OFF`) make that person's day score-neutral inside `taskScore` (state `off`; `fms-tasks.js` skips those rows too); any new score code must go through `taskScore` / `dayScore` so it stays neutral. Live Photo tasks (`tm_tasks.live_photo`, `sql/TM_LIVE_PHOTO_MIGRATION.sql`): ordinary daily tasks (`t.live`, one per timing) completed only through the in-page camera + live location (`openLiveCam` → `tm_mark_live`; `tm_mark_done` refuses them with LIVE_ONLY), own task / today only; location in `tm_task_records.geo_*` (`rec.geo`); timings are per employee, set in Add New Task List (Live Photo rows on top, `addLiveRow`, last one cannot be removed); compulsory switch in `tm_settings` 'live_photo' (Score Master card, also lists who has no timing), enforced by `tm_save_employee` (LIVE_REQUIRED), nothing is auto-created; monthly log `openLiveLog`. Needs https for camera / location. Score Master also holds the Stack Emission alert automation card (`emAuto*`, `EMA`): ONE rule per emission unit (used for above and below alike), EA tasks to chosen employees and / or a machine complaint raised as a chosen `cmp_profiles` user; rules in `tm_settings` 'emission_auto' (not a score version), run by the server (`sql/EMISSION_AUTOMATION_MIGRATION.sql`: `emission_auto_run_` from a statement trigger on `emission_alerts` (so right after each 15-second watch check) + pg_cron 'emission-auto' every minute as backstop, `emission_auto_log` keyed like `emission_alerts`, cooldown, only alerts after `savedAt`; complaint insert sets `request.jwt.claim.sub` for the one insert because the cmp triggers read `auth.uid()`; RPCs `tm_emission_auto_get` / `_save` / `_run_now`, right `TM_SCORE_MASTER`) |

ERP iframes in `index.html` (~line 2057) use `data-src` and are loaded lazily.

## Desktop ERP script order — do not change

```
index.html <head>: date-dmy.js → caps-input.js → sso-preboot.js → sso-gate.js → store.css → erp-shell.css → store-mytasks.css
end of <body>:     store-core.js → store-design-master.js → store-nav-keys.js → store-mytasks.js → erp-shell.js → app-back.js
```

- These are **classic scripts sharing one global lexical scope**: later files read top-level `const`/`let`
  from `store-core.js` directly (`SB`, `SB_READY`, `escText`, `fetchAllRows`, `sarvCurrentRole`, …).
- Never add `type="module"` or `defer` (breaks shared scope, `file://` CORS, and ordering).
- `erp-shell.js` must load after `store-core.js`: it wraps `sarvGoHome` / `sarvNavigateFromHome` /
  `activatePanel` at window level and never patches `store-core.js`. Sidebar leaves just click the
  original (hidden) home-tile buttons by their `data-go` key. Removing `erp-shell.css` + `erp-shell.js`
  restores the old tile home.
- `store.css` rule order is load-bearing; don't reorder.

## Key files / entry points

- `store-core.js` (~1.4 MB, the bulk of the ERP): Inward, Outward, Issue, PR, PO, Reports, Tracker, Master Data,
  Repair, PDF, roles/access, Admin Panel. Useful anchors:
  - Supabase client: `SUPABASE_URL` / `SB_READY` / `SB` near the top (URL/key are lightly obfuscated via `sbDecode_`)
  - `activatePanel()`, `sarvGoHome()`, `sarvNavigateFromHome(target)` — navigation
  - `SARV_TABS` — Tab Visibility keys (`HOME_*`, `ERP_*`, `M_*`, `MD_*`, …); `sarvCan(key)` (Feature Access),
    `sarvTabVisible(key)`, `sarvApplyAccess()`, `isAdmin()`
  - `SARV_DROPDOWNS` — fixed dropdown definitions backed by `sales_dropdowns` table. Key `erp_storeChecklist`
    holds the Store In / Out PDF checklists (one JSON row each, own builder; STORE CHECKLISTS section)
  - `SARV_FAB_FIELDS` / `SARV_BR_FIELDS` — Fabric/Brand Master field lists (drive table, form, CSV, revisions)
  - `fetchAllRows(table, cols, orderCol, filterFn)` — paginated Supabase read
  - **Two stores** (`sql/STORE1_MIGRATION.sql`): `inward_entries` / `outward_entries` and their lines carry
    `store` ('STORE 1' / 'STORE 2', default STORE 2 = all data from before; a trigger copies the header's
    store onto each line). `sarvStore` = the store the Store screens work in, set by the sidebar leaf
    (`store` on every leaf of the Store 1 / Store 2 modules, `storeLeaves()` in `erp-shell.js`). New entries
    are saved with it, doc numbers use `SARV_STORES` series (SIHF-I/…, NB/1/… vs SIHF-II/…, NB/2/…), and
    store-scoped reads go through `sarvStoreQ(q)` (lists, Item Tracker, Consumption, Repair, Reports,
    Outward stock check, Item Stock = Item Master in `sarvItemMasterStore` mode, My Day). Deliberately
    COMBINED: PO received qty / status, PR received, duplicate-bill check, Follow-up report, PR form Balance
    Stock. Store Transfer (`sarvOpenStoreTransfer`) = Outward from one + Inward NB into the other. Items and
    Suppliers are common. Any new Store-table read must decide: per store (`sarvStoreQ`) or combined.
  - **PR / PO per store** (`sql/PRPO_STORE_MIGRATION.sql`): `app_users.store` (set in Admin Panel › Users via
    `admin_set_user_store`); a new PR takes the raising user's store (`sarvUserStore_`, mobile `prmUserStore_`);
    a PO takes its first PR's store by trigger (`linked_req_nos`). The Inward PO / PR pickers show a store its own
    PRs / POs plus any with an item whose category is ticked for it in Administration › PR-PO Master
    (`category_purchasers.store1/store2`, `sarvOpenPrpoMaster`, `prpoVisibleIn_`). The same master's MD-1 / MD-2 ticks
    (`category_purchasers.md1/md2`, `sql/PRPO_MD_MIGRATION.sql`) split the mobile approval app between the two MDs
    (users with Emp Code MD-1 / MD-2): `mdScope_` in `mobile-core.js` keeps a PR / PO with any item of a category ticked
    for that MD or for neither (shared); no ticks anywhere, other Emp Codes or a failed lookup = everything. One PO series for both;
    PR / PO PDFs print UNIT-1 / UNIT-2 from the record's store (`sarvPdfUnit_`, mobile `pdfUnit_`).
- `store-design-master.js`: Production › Design Master. All ids/classes/functions prefixed `dm`.
- `erp-shell.js` also owns browser history (`NAV`: one `#/module/leaf` address per screen, Back / Forward
  replays the leaf through `select()`, reload reopens it) and the open-screens tab strip (`TABS`, `#erpTabs`,
  `body.erp-tabs-on` with `--erp-tabs-h` in `erp-shell.css`): one tab per real panel, switching re-shows the
  panel via `activatePanel` without gates, per-user list in localStorage `erp_tabs_v1:<user id>`. A new
  full-height rule must subtract `var(--erp-tabs-h)`.
- `erp-shell.js`: sidebar, dashboard and `MODULES` map. A leaf with `go` opens an existing screen; without
  `go` it shows "Coming Soon". New module → add to `MODULES` **and** add its `ERP_<key>` row to `SARV_TABS`.
  Other leaf options: `external` (opens that page in a new tab; used by Order Form / Packing), `action` +
  `access` (calls a global function, e.g. Purchase › PO Details Report → `openPoDetailsReport`), `poMode`
  (`build` / `report`: PO Generation vs the report-only Follow-up view, see `applyPoOnly`), `words` (Quick Nav).
- `store-mytasks.js`: My Day, the Store Incharge's daily task list (`TASKS` array: count from ERP data, guide,
  go-to-screen, done only at count 0, skip needs a reason). Log in `daily_task_log`, stock counts in
  `stock_counts` (`DAILY_TASKS_MIGRATION.sql`); falls back to localStorage. Access row `HOME_MYDAY`.
- `mobile-core.js` (~590 KB): mobile approvals logic (`STAGE_TABS`, PO follow-up, etc.).

## Auth / single sign-on

- One user table: `public.app_users` (`role` = primary role used for signatures/audit; `roles text[]` = access
  union). In code: `sarvCurrentRole` (primary), `sarvCurrentRoles`, `sarvRoles_()`.
- `launcher.html` → `erp_app_login()` creates an `app_sessions` token stored in localStorage
  (`sarv_sso_token`); every app reads it.
- `sso-preboot.js` (first in `<head>`): if a token exists, hides login overlays and shows a splash
  synchronously; each app must call `sarvSsoPrebootDone()` on every path (9 s backstop).
- `sso-gate.js`: `SARV_GATE.boot({url, key, app, label, client, needAuth, accountKey})` checks session,
  app access and app account; it resolves only on success, otherwise redirects to the launcher or shows a
  reason screen (`WHY` codes like `NO_APP_ACCOUNT`, `SESSION_REVOKED`). No app has its own login form —
  don't add one.
- Complaint/Packing need a real Supabase Auth session, minted by the `erp-sso` Edge Function
  (`supabase/functions/erp-sso/`, not in this folder) via magic-link OTP.
- `app-back.js`: floating "← Apps" button, auto-hidden inside ERP iframes, on the launcher, or without a session.
- Access precedence: per-user `app_access` override (ON/OFF; the Users › Apps form has no "auto" any more, a missing key still falls through) → role-wise Tab Visibility matrix → code default. New users start with `SARV_NEW_USER_OFF` apps OFF (`NEW_USER_APP_DEFAULTS_MIGRATION.sql` for signups).

## Database changes

SQL migrations (`*_MIGRATION.sql`, `CHECK_*.sql`, `FIX_*.sql`) and `supabase/` are **not in this folder**;
the README lists them and their required run order. They're run manually in the Supabase SQL Editor and are
written to be idempotent. Code typically degrades gracefully when a migration hasn't run (banner/console
warning rather than failure) — preserve that pattern. Some features intentionally store data in existing
jsonb columns to avoid migrations (e.g. PO follow-ups in `purchase_orders.approvals.followups`, append-only).

## Conventions

- Plain vanilla JS with inline `onclick` handlers and global functions; ERP helpers are prefixed `sarv…`
  (private ones end in `_`), feature-local prefixes (`dm`, `fbm_`) avoid id/class collisions.
- Comments and user-facing strings are in plain Indian English (they were translated from Hinglish; a copy
  of the pre-translation files is in `_backup_before_english/`). Comments explain *why*, often at length;
  keep that density. Deliberate exceptions: the Devanagari `hindi=` labels in `complaint.html` (bilingual by
  design), the Hinglish search synonyms in `erp-shell.js` `QN_WORDS` (search data), and the `hisaab` data
  keys in `trims-manager.html`.
- No emojis in the UI. Icons are inline SVG line icons (`I.*` in `erp-shell.js`, inline `<svg>` in
  `launcher.html`); small table actions use text labels or plain glyphs (✎ ✕ ✓ ↻ ☰ ▾). Prefer flat fills,
  thin borders and light shadows over gradients and glows.
- Always escape user data with `escText()` when building HTML strings.
- Every search box / filter in the desktop ERP uses `sarvSearchMatch(hayStringOrArray, typedText)` (top of
  `store-core.js`): Google-style, every keyword anywhere in any order, `"phrase"`, `-exclude`, `a OR b` / `a|b`,
  punctuation ignored inside a word. Use it for new search boxes instead of `.includes(q)`; `sarvSearchTerms(q)`
  gives the words to highlight.
- `caps-input.js` (every app page except `launcher.html`, right after `date-dmy.js`) shows and saves all typed
  text in CAPITALS. It skips password/email/url/number/date inputs, `data-dmy` boxes, read-only boxes and any
  box named as a PIN/password/OTP/token/email/mail/url field; mark a container `data-no-caps` to opt out.
  Keep name/item lookups case-insensitive (`ilike` / lower-cased compare) so capitals never create duplicates.
- Dates: every app loads `date-dmy.js` first, which turns `<input type="date">` into a DD/MM/YYYY text box
  (`data-dmy="1"`) whose `.value` still reads/writes `YYYY-MM-DD`. Select date boxes with
  `input[type=date],input[data-dmy]`. Use `today()` (local date), never `toISOString().slice(0,10)` for "today".
- External libs come from CDNs (supabase-js v2, html2pdf, jsPDF/autotable, pdf-lib, Tailwind in standalone pages).
- Keep the whole folder together; pages depend on sibling files.
