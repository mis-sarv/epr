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
| `mobile.html` | Mobile approvals app (PR/PO approvals, PO follow-up) | `mobile.css` + `mobile-core.js` |
| `order-form.html` | Sales › Order Form | Iframe inside ERP (`#orderFormFrame`) or standalone |
| `packing.html` | Sales › Packing & Dispatch | Iframe in ERP or standalone; uses Supabase Auth via SSO |
| `complaint.html` | Complaint system (React 18 UMD + Babel standalone + Tailwind) | Uses Supabase Auth via SSO; `sw.js` is its push-notification service worker |
| `lot-card-manager.html` | Manufacturing › Lot Card Manager | Iframe; separate page because Tailwind would reset ERP styles |
| `printing-lot.html` | Manufacturing › Printing Lot Card | Iframe; also `printing-lot.html#production` for shop floor |
| `trims-manager.html` | Manufacturing › Trims & Packing Material Manager | Iframe |
| `dispatch_report_interface.html` | Dispatch Report (date range, party / product / slip-wise, matrix, analytics, CSV; Tailwind + Chart.js) | Launcher app `HOME_DISPATCH_REPORT` (default Admin/MD/GM/Accountant, set in both `SARV_TABS` and launcher `defRoles`). Data comes from the OLD packing project `hghomygvryyihezvmrjj` via anon RPC `dispatch_report_rows` (`sql/DISPATCH_REPORT_RPC.sql`); amount rules live in its `RULES` block |
| `task_manager.html` | Task Manager (employee checklists, EA, buddy, score card; Tailwind) | Launcher app `HOME_TASK_MANAGER`; SSO via `sso-gate.js`; inner buttons = `TM_*` rows in `SARV_TABS`, enforced server-side by `tm_perms_` (`TASK_MANAGER_MIGRATION.sql`; keep its defaults in sync) |

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
  - `SARV_DROPDOWNS` — fixed dropdown definitions backed by `sales_dropdowns` table
  - `SARV_FAB_FIELDS` / `SARV_BR_FIELDS` — Fabric/Brand Master field lists (drive table, form, CSV, revisions)
  - `fetchAllRows(table, cols, orderCol, filterFn)` — paginated Supabase read
- `store-design-master.js`: Production › Design Master. All ids/classes/functions prefixed `dm`.
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
- Access precedence: per-user `app_access` override (auto/ON/OFF) → role-wise Tab Visibility matrix → code default.

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
- `caps-input.js` (every app page except `launcher.html`, right after `date-dmy.js`) shows and saves all typed
  text in CAPITALS. It skips password/email/url/number/date inputs, `data-dmy` boxes, read-only boxes and any
  box named as a PIN/password/OTP/token/email/mail/url field; mark a container `data-no-caps` to opt out.
  Keep name/item lookups case-insensitive (`ilike` / lower-cased compare) so capitals never create duplicates.
- Dates: every app loads `date-dmy.js` first, which turns `<input type="date">` into a DD/MM/YYYY text box
  (`data-dmy="1"`) whose `.value` still reads/writes `YYYY-MM-DD`. Select date boxes with
  `input[type=date],input[data-dmy]`. Use `today()` (local date), never `toISOString().slice(0,10)` for "today".
- External libs come from CDNs (supabase-js v2, html2pdf, jsPDF/autotable, pdf-lib, Tailwind in standalone pages).
- Keep the whole folder together; pages depend on sibling files.
