/* erp-shell.js — the ERP navigation shell for Store.html.
 * ---------------------------------------------------------------------------
 * Sidebar + top bar + dashboard, laid out to the `erp-kpi-dashboard-ui` skill
 * and seeded with the full module map from `sarv-erp-suite-blueprint`.
 *
 * TWO RULES THIS FILE OBEYS, because the brief was "features, functionality &
 * interface will be the same as it is":
 *
 *  1. It never reimplements a screen. A sidebar leaf that maps to something
 *     that already works does ONE thing: it clicks that module's original
 *     button on the old tile home, which is still in the DOM (hidden by
 *     erp-shell.css). So the Inward (NB) passkey, the Nature-of-Inward
 *     chooser, the per-role Tab Visibility checks and sarvNavigateFromHome's
 *     own locking all still run, unchanged, from the one code path they always
 *     ran from. Nothing here could make a form behave differently, because
 *     nothing here opens a form.
 *
 *  2. It never patches store-core.js. The two places it has to join in —
 *     "going Home" and "navigating out of Home" — are wrapped at the window
 *     level (both are function declarations, so internal callers resolve to
 *     the wrapper too). Delete this file and the two <link>/<script> tags and
 *     the app is byte-for-byte the app it was.
 *
 * Loaded LAST, after store-core.js, because it wraps functions that file
 * declares.
 */
(function () {
  'use strict';

  /* ══ ICONS ═══════════════════════════════════════════════════════════
     Line icons drawn as inline SVG. They take the text colour and size of
     wherever they sit (1em square), so the sidebar, the page heading and
     the Quick Nav rows can all share them. */
  const svg_ = d => '<svg class="erp-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  const I = {
    dash:     svg_('M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z'),
    partner:  svg_('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'),
    sales:    svg_('M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01'),
    purchase: svg_('M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM20 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6'),
    store:    svg_('M3 21V8l9-5 9 5v13M7 21v-8h10v8M7 17h10'),
    manuf:    svg_('M2 20h20M4 20V10l5 3v-3l5 3V6l6 3v11'),
    quality:  svg_('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4'),
    finance:  svg_('M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7M16 14h.01'),
    pm:       svg_('M9 2h6v4H9zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12h6M9 16h4'),
    support:  svg_('M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z'),
    trend:    svg_('M23 6l-9.5 9.5-5-5L1 18M17 6h6v6'),
    hr:       svg_('M3 4h18v16H3zM9 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5 16a4 4 0 0 1 8 0M15 9h4M15 13h4'),
    folder:   svg_('M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'),
    box:      svg_('M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8'),
    wrench:   svg_('M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'),
    file:     svg_('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8'),
    flask:    svg_('M9 3h6M10 3v6L4 20a1 1 0 0 0 1 1.5h14A1 1 0 0 0 20 20l-6-11V3'),
    target:   svg_('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'),
    clock:    svg_('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2'),
    sliders:  svg_('M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6'),
    menu:     svg_('M3 6h18M3 12h18M3 18h18'),
    search:   svg_('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35'),
    tasks:    svg_('M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'),
    bell:     svg_('M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0'),
    lock:     svg_('M5 11h14v10H5zM7 11V7a5 5 0 0 1 10 0v4')
  };

  /* ══ MODULE MAP ══════════════════════════════════════════════════════
     Straight from the blueprint, re-mapped to Sarv India's mink-blanket
     workflow. `go` is the data-go key of the original home button that opens
     an EXISTING screen; a leaf with no `go` is not built yet and shows the
     Coming Soon pane.

     Anything that is already live is deliberately filed under the blueprint
     module it belongs to rather than left in a "legacy" group — the point of
     the map is that the Purchase module is where PR and PO live, whatever
     order they happened to get built in. */
  const MODULES = [
    { key: 'DASH', icon: I.dash, label: 'Dashboard', dashboard: true },

    { key: 'PARTNER', icon: I.partner, label: 'Partner', children: [
      { label: 'Partner Dashboard' }, { label: 'Partner Registration' },
      { label: 'Customers' }, { label: 'Suppliers' },
      { label: 'Distributor Network' }, { label: 'Supplier Development' },
      { label: 'Vendor KYC & Audit' }, { label: 'Partners on Map' },
      { label: 'Partner Reports' }, { label: 'Partner Configs' } ] },

    { key: 'SALES', icon: I.sales, label: 'Sales', children: [
      /* Listed first because it is the only built screen in this module.
         Opens order-form.html inside the ERP (#orderFormPanel iframe), the
         same way Manufacturing › Lot Card Manager does, with the ERP login. */
      /* These two always open as their own app in a new browser tab, never in
         the ERP's iframe. `go` stays for the access check (HOME_ORDER_FORM /
         HOME_PACKING); `external` is the page that opens. */
      { label: 'Order Form', go: 'ORDER_FORM', external: 'order-form.html' },
      { label: 'Packing & Dispatch', go: 'PACKING', external: 'packing.html' },
      { label: 'Sales Dashboard' }, { label: 'RFQ' }, { label: 'Quotation' },
      { label: 'Quick SO' }, { label: 'Sale Order' }, { label: 'Sample / Trial SO' },
      { label: 'Sale JWO (Job Work Out)' }, { label: 'Production Request' },
      { label: 'Deliveries & Shipments' }, { label: 'Demand & Forecasts' },
      { label: 'Sales Reports' }, { label: 'Sales Configs' } ] },

    { key: 'PURCHASE', icon: I.purchase, label: 'Purchase', children: [
      { label: 'Purchase Dashboard' },
      { label: 'Purchase Requirement (PR)', go: 'PR' },
      /* PO Generation and the Follow-up Report are the same panel, opened in
         two modes (applyPoOnly): Generation shows Build PO + Generated POs,
         the report leaf shows the report alone. */
      { label: 'PO Generation', go: 'PO', poMode: 'build' },
      { label: 'PO Follow-up Report', go: 'PO', poMode: 'report', tab: 'PO_SUB_REPORT',
        words: 'follow up followup pr po inward tracking report status' },
      // Ordered vs received per PO line (store-core.js › openPoDetailsReport).
      // Moved here from Print History / Reports, with the same access row.
      { label: 'PO Details Report', action: 'openPoDetailsReport', access: 'HOME_REPORTS',
        words: 'po details ordered received pending report csv pdf' },
      { label: 'Approval App (Mobile)', go: 'APPROVAL_APP' },
      { label: 'RFQ / RFQ Bids' }, { label: 'Supplier Quotation' },
      { label: 'Quotation Comparison' }, { label: 'Annual Procurement' },
      { label: 'Service Receipt' }, { label: 'Purchase Reports' },
      { label: 'Purchase Configs' } ] },

    { key: 'WAREHOUSE', icon: I.store, label: 'Store', children: [
      // The Store Incharge's daily task list (store-mytasks.js).
      { label: 'My Day (Daily Tasks)', action: 'wfOpenMyDay', access: 'HOME_MYDAY',
        words: 'my day daily tasks today pending work checklist todo' },
      { label: 'Store Dashboard' },
      { label: 'Material Inward', go: 'IN' },
      { label: 'Inward (NB) — Non-Billable', go: 'IN_NB' },
      { label: 'Material Outward', go: 'OUT' },
      { label: 'Issue', go: 'ISSUE' },
      { label: 'Item Tracker', go: 'TRACKER' },
      { label: 'Repair Challans', go: 'REPAIR' },
      { label: 'Print History / Reports', go: 'REPORTS' },
      { label: 'Material Requests' }, { label: 'Gate Processes' },
      { label: 'Transfers' }, { label: 'JWO Challans' },
      { label: 'Supplier ASNs' }, { label: 'Traceability Reports' },
      { label: 'Store Configs' } ] },

    { key: 'MANUF', icon: I.manuf, label: 'Manufacturing', children: [
      { label: 'Shopfloor Dashboard' },
      { label: 'Design Master', go: 'PRODUCTION' },
      { label: 'Lot Card Manager', go: 'LOT_CARD' },
      { label: 'Printing Lot Card', go: 'PRINTING_LOT' },
      { label: 'Trims Manager', go: 'TRIMS' },
      { label: 'Manufacturing Order' }, { label: 'Work Order' },
      { label: 'MO Kanban' }, { label: 'WO Kanban' },
      { label: 'My Jobcards' }, { label: 'Multi Workorder Punching' },
      { label: 'Bulk Prod Entry' }, { label: 'Production Planning (PPC)' },
      { label: 'Unbuild Order' }, { label: 'Stock Movements' },
      { label: 'Production QC' }, { label: 'MO Reports' },
      { label: 'Manuf. Configs' } ] },

    { key: 'QUALITY', icon: I.quality, label: 'Quality', children: [
      { label: 'Quality Dashboard' }, { label: 'Quality Control' },
      { label: 'Direct QC' }, { label: 'Quality Certificate' },
      { label: 'Quality Audits' }, { label: 'Defect Logs' },
      { label: 'Non Conformance Reports' }, { label: 'Deviation Request' },
      { label: 'Quality Manuals' }, { label: 'Quality Reports' },
      { label: 'QC Configs' } ] },

    { key: 'FINANCE', icon: I.finance, label: 'Finance', children: [
      { label: 'Finance Dashboard' }, { label: 'Sale Invoices' },
      { label: 'Purchase Bills' }, { label: 'Credit Note' },
      { label: 'Debit Note' }, { label: 'Payment Requests' },
      { label: 'Payments' }, { label: 'Reconciliation' },
      { label: 'Compliances (GST)' }, { label: 'Finance Reports' },
      { label: 'Finance Configs' } ] },

    { key: 'PM', icon: I.pm, label: 'Project Management', children: [
      { label: 'Control Center' }, { label: 'Portfolio' }, { label: 'Programs' },
      { label: 'Projects' }, { label: 'RFI & WCC' }, { label: 'Task Management' },
      { label: 'Project Reports' }, { label: 'PM Configs' } ] },

    { key: 'SUPPORT', icon: I.support, label: 'Support', children: [
      /* Listed first because it is the only built screen in this module —
         everything below it is still a placeholder, and leafLive() greys
         those out. Opens complaint.html in its own tab, the same way
         Purchase › Approval App opens mobile.html. */
      { label: 'Complaint App', go: 'COMPLAINT_APP' },
      { label: 'Support Dashboard' }, { label: 'Helpdesk Ticket' },
      { label: 'Support Contract / Warranty' }, { label: 'Job Card Time Sheet' },
      { label: 'Timesheets' }, { label: 'RMA (Returns)' },
      { label: 'Support Warehouse' }, { label: 'Support Reports' },
      { label: 'Support Configs' } ] },

    { key: 'KAIZEN', icon: I.trend, label: 'Kaizen / 6 Sigma', children: [
      { label: 'Kaizen Report' }, { label: 'Pareto Chart' },
      { label: 'Published SOP' }, { label: 'PDCA' }, { label: 'Poka Yoke' },
      { label: 'RACI Matrix' }, { label: 'Process Chart' },
      { label: 'Time Study' }, { label: 'Cost-Benefit Analysis' },
      { label: 'RAID Log' } ] },

    { key: 'HR', icon: I.hr, label: 'HR Management', children: [
      { label: 'HR Dashboard' }, { label: 'Employee' }, { label: 'Attendance' },
      { label: 'Salary Calculation' }, { label: 'Payroll' }, { label: 'Leaves' },
      { label: 'Holiday' }, { label: 'Employee Contract' }, { label: 'Recruitment' },
      { label: 'Training' }, { label: 'Loans & Salary Advances' },
      { label: 'Transport' }, { label: 'HR Policies' },
      { label: 'HR Reports' }, { label: 'HR Config' } ] },

    /* Each Master Data sub-tab is its own leaf. There used to be a single
       leaf that opened the panel on its default (Item Master), and reaching
       the others meant hunting for the tab bar inside.
       Settings is deliberately NOT here: it opens only from Administration ›
       Admin Panel (see below). Dropdown Master is here because it is master
       DATA, not an admin panel. Its MD_DROPDOWN row is visible only to the
       Admin by default, so other roles never see this leaf. */
    { key: 'MASTERS', icon: I.folder, label: 'Masters', children: [
      { label: 'Item Master',     go: 'MASTER', sub: 'itemMasterSub',     tab: 'MD_ITEM' },
      { label: 'Supplier Master', go: 'MASTER', sub: 'supplierMasterSub', tab: 'MD_SUPPLIER' },
      { label: 'Employee Master', go: 'MASTER', sub: 'employeeMasterSub', tab: 'MD_EMPLOYEE' },
      { label: 'Machine List',    go: 'MASTER', sub: 'machineMasterSub',  tab: 'MD_MACHINE' },
      { label: 'Fabric Master',   go: 'MASTER', sub: 'fabricMasterSub',   tab: 'MD_FABRIC' },
      { label: 'Brand Master',    go: 'MASTER', sub: 'brandMasterSub',    tab: 'MD_BRAND' },
      { label: 'Buyer Master',    go: 'MASTER', sub: 'buyerMasterSub',    tab: 'MD_BUYER' },
      { label: 'Trims & Packing Rate', go: 'MASTER', sub: 'trimRateMasterSub', tab: 'MD_TRIM_RATE' },
      { label: 'Dropdown Master', go: 'MASTER', sub: 'dropdownMasterSub', tab: 'MD_DROPDOWN' },
      { label: 'Geography' }, { label: 'Finance Masters' },
      { label: 'General Masters' }, { label: 'HR Masters' },
      { label: 'Warehouse / Location' } ] },

    { key: 'PRODUCTS', icon: I.box, label: 'Products', children: [
      { label: 'Product / Item Master' }, { label: 'Categories' },
      { label: 'Size / GSM / Colour Variants' }, { label: 'Bill of Material' },
      { label: 'Price Lists' } ] },

    { key: 'ASSETS', icon: I.wrench, label: 'Assets', children: [
      { label: 'Machine Asset Register' }, { label: 'Maintenance Schedule' },
      { label: 'Maintenance Log' }, { label: 'Depreciation' } ] },

    { key: 'TENDER', icon: I.file, label: 'Tender Management', children: [
      { label: 'Tender List' }, { label: 'EMD Tracking' },
      { label: 'Bid Submission' }, { label: 'Tender Results' } ] },

    { key: 'NPD', icon: I.flask, label: 'NPD / R&D (PLM)', children: [
      { label: 'New Design Request' }, { label: 'Sample Approval' },
      { label: 'BOM Versions' }, { label: 'Costing Sheets' },
      { label: 'Printing Recipe' } ] },

    { key: 'KPIT', icon: I.target, label: 'KPIs & Targets', children: [
      { label: 'Department Targets' }, { label: 'Target vs Actual' },
      { label: 'KPI Campaigns' }, { label: 'KPI Submissions' } ] },

    { key: 'ACT', icon: I.clock, label: 'All Activities', children: [
      { label: 'Activity Timeline' }, { label: 'My Tasks' },
      { label: 'Scheduled Activities' } ] },

    /* The single entry point for Settings. Users & Roles, Feature Access,
       Tab Visibility and Change Passwords all live inside the Settings
       sub-tab, and people look for them under Administration, not in the
       list of masters. */
    { key: 'ADMIN', icon: I.sliders, label: 'Administration', children: [
      { label: 'Admin Panel / Users & Roles', go: 'MASTER', sub: 'settingsSub', tab: 'MD_SETTINGS' },
      { label: 'Company / Unit Settings' }, { label: 'Audit Log' },
      { label: 'Developer Settings' }, { label: 'API Keys & Webhooks' } ] },
  ];

  /* ══ small helpers ═══════════════════════════════════════════════════ */
  const byId_ = id => document.getElementById(id);
  const esc = v => (typeof escText === 'function') ? escText(v)
    : String(v == null ? '' : v).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

  /* Does this role get to see the screen behind a leaf? Same question, same
     answer, same function the old tile home used — so switching to the shell
     cannot quietly widen anyone's access. */
  function leafVisible(leaf) {
    // A leaf that runs a function rather than opening a screen carries its own
    // access row.
    if (leaf.action) {
      try { return typeof sarvTabVisible !== 'function' || !leaf.access || sarvTabVisible(leaf.access); }
      catch (e) { return true; }
    }
    if (!leaf.go) return true;                       // not built yet — harmless
    try {
      if (typeof sarvTabVisible !== 'function') return true;
      // The screen itself (Admin Panel › Tab Visibility › Home Page) …
      if (!sarvTabVisible('HOME_' + leaf.go)) return false;
      /* … and, where a leaf opens one particular sub-tab of that screen, that
         sub-tab's own row too (Master Data › Sub Tabs). So switching off
         "Machine List" for a role takes it out of the sidebar as well as out of
         the panel's tab strip — one switch, both places, and no new keys: these
         are the same MD_* rows the panel has always read. */
      if (leaf.tab && !sarvTabVisible(leaf.tab)) return false;
      return true;
    } catch (e) { return true; }
  }
  function moduleLeaves(mod) { return (mod.children || []).filter(leafVisible); }

  /* Is this MODULE listed in the sidebar for this role? Admin Panel ›
     Tab Visibility › "ERP Shell › Sidebar Modules", one ERP_<key> row per
     module (see SARV_TABS in store-core.js). A module with no row there is
     always shown, so adding a module to MODULES can never make it vanish by
     accident — it just cannot be switched off until its row exists. */
  function moduleVisible(mod) {
    try {
      if (typeof sarvTabVisible !== 'function') return true;
      return sarvTabVisible('ERP_' + mod.key);
    } catch (e) { return true; }
  }
  /* Modules this role may see at all. A non-dashboard module also has to have
     at least one leaf left after the HOME_* screen checks, or it would open as
     an empty submenu. */
  function visibleModules() {
    return MODULES.filter(m => moduleVisible(m) && (m.dashboard || moduleLeaves(m).length));
  }
  // A leaf only counts as live if its original button actually exists.
  function leafLive(leaf) {
    if (leaf.action) return typeof window[leaf.action] === 'function';
    return !!leaf.go && !!document.querySelector('#sarvHomeDashboard .sarv-home-row[data-go="' + leaf.go + '"]');
  }

  let openMenu = null;      // which module's submenu is expanded
  let current = 'DASH';     // selected module
  let currentLeaf = null;   // selected leaf label

  /* ══ MASTER DATA: SHOW ONLY THE TAB YOU CAME FROM ══════════════════
     The Master Data panel has several sub-tabs, and the sidebar has a
     separate leaf for each. Showing both at once gives two ways to navigate
     to the same thing, and the panel's own tab strip also broke the rule
     that Settings does not open from Masters.

     So the panel now shows only the tab of the leaf you came from. The top
     nav already works this way: after entering a section from Home,
     sarvLockNavToSection hides the links to the other sections.

     IMPORTANT: this code only HIDES, it never shows.
     store-core.js's sarvApplySubTabs_ first sets display according to Tab
     Visibility; this runs AFTER it and removes the remaining tabs. That is
     why it can never give a role an extra tab, not even by mistake. */
  let onlySub = null;       // null = no restriction, full strip

  /* The PO Generation panel, the same idea. Opened from "PO Generation" it
     shows Build PO + Generated POs; opened from "PO Follow-up Report" it shows
     the report alone, without the PO KPI cards, the sub-tab strip or the PO
     title. Again this only HIDES buttons store-core has already decided on. */
  let poOnly = null;        // 'build' | 'report' | null
  const PO_SUB_BTNS = { build: ['p_poSubPendingBtn', 'p_poSubListBtn'], report: ['p_poSubReportBtn'] };
  function applyPoOnly() {
    document.body.classList.toggle('erp-po-report-only', poOnly === 'report');
    const t = document.getElementById('p_poTitle'), st = document.getElementById('p_poSubtitle');
    if (t) {
      if (t.dataset.orig == null) t.dataset.orig = t.textContent;
      t.textContent = poOnly === 'report' ? 'PR → PO FOLLOW-UP REPORT' : t.dataset.orig;
    }
    if (st) {
      if (st.dataset.orig == null) st.dataset.orig = st.innerHTML;
      st.innerHTML = poOnly === 'report'
        ? 'From PR to PO to Inward: the full follow-up position of each PR on one line'
        : st.dataset.orig;
    }
    if (!poOnly) return;
    const keep = PO_SUB_BTNS[poOnly] || [];
    Object.keys(PO_SUB_BTNS).forEach(k => PO_SUB_BTNS[k].forEach(id => {
      if (keep.indexOf(id) >= 0) return;
      const b = document.getElementById(id); if (b) b.style.display = 'none';
    }));
  }
  function applyOnlySub() {
    applyPoOnly();
    if (!onlySub) return;   // nothing to show; this file only ever hides
    const mp = document.getElementById('masterDataPanel');
    if (!mp) return;
    mp.querySelectorAll('.master-sub-tab[data-subtab]').forEach(b => {
      if (b.dataset.subtab !== onlySub) b.style.display = 'none';
    });
  }
  /* Set or clear the restriction. When clearing, store-core's own pass is
     run again so the tab strip is rebuilt from the permissions. Restoring it
     here with display='' would also reveal tabs this role must not see. */
  function setOnlySub(sub) {
    onlySub = sub || null;
    if (!onlySub) poOnly = null;   // going Home clears both restrictions
    if (typeof sarvApplySubTabs_ === 'function') sarvApplySubTabs_();
  }

  /* ══ MARKUP ══════════════════════════════════════════════════════════ */
  function build() {
    const shell = document.createElement('div');
    shell.id = 'erpShell';
    shell.innerHTML =
      '<div class="erp-scrim" id="erpScrim"></div>' +
      '<aside class="erp-side">' +
        '<div class="erp-brand">' +
          '<span class="erp-brand-mark">S</span>' +
          '<span class="erp-brand-text"><b>SARV INDIA</b><small>Home Furnishing · ERP</small></span>' +
        '</div>' +
        '<div class="erp-search-wrap">' +
          '<input type="search" class="erp-search" id="erpSearch" placeholder="Search Menus" autocomplete="off">' +
        '</div>' +
        '<nav class="erp-nav" id="erpNav"></nav>' +
      '</aside>' +
      '<div class="erp-main">' +
        '<div class="erp-top">' +
          '<button type="button" class="erp-burger" id="erpBurger" title="Show or hide the sidebar">' + I.menu + '</button>' +
          '<span class="erp-unit" id="erpUnit">Sarv India · Unit-2</span>' +
          // The Quick Nav search sits here while the shell is open (qnPlace).
          '<span class="erp-top-spacer"></span>' +
          '<div class="erp-top-center" id="erpTopCenter"></div>' +
          '<span class="erp-top-spacer"></span>' +
          '<button type="button" class="erp-iconbtn" id="erpBtnTasks" title="Pending tasks">' + I.tasks + '</button>' +
          '<button type="button" class="erp-iconbtn" id="erpBtnHist" title="Print History / Reports">' + I.clock + '</button>' +
          '<button type="button" class="erp-iconbtn" id="erpBtnBell" title="Notifications">' + I.bell + '<span class="dot"></span></button>' +
          '<span class="erp-user" id="erpUser" title="Click to log out">' +
            '<span class="erp-avatar" id="erpAvatar">—</span>' +
            '<span class="erp-user-text" id="erpUserText">—</span>' +
          '</span>' +
        '</div>' +
        '<div class="erp-body" id="erpBody"></div>' +
        '<div class="erp-foot">© ' + new Date().getFullYear() + '. Product of Sarv India Home Furnishing.</div>' +
      '</div>';
    document.body.appendChild(shell);

    byId_('erpBurger').addEventListener('click', () => shell.classList.toggle('side-hidden'));
    // Scrim: in drawer mode it closes the drawer (you stay on the screen you
    // were on); in the full shell it just collapses the sidebar.
    byId_('erpScrim').addEventListener('click', () => {
      if (shell.classList.contains('drawer')) closeDrawer();
      else shell.classList.add('side-hidden');
    });
    byId_('erpSearch').addEventListener('input', renderNav);
    byId_('erpUser').addEventListener('click', () => {
      if (typeof sarvLogout === 'function') sarvLogout();
    });
    byId_('erpBtnHist').addEventListener('click', () => open('REPORTS'));
    // Tasks = My Day, for a role that has it; the Purchase menu otherwise.
    byId_('erpBtnTasks').addEventListener('click', () => {
      const canMyDay = typeof window.wfOpenMyDay === 'function' &&
        (typeof sarvTabVisible !== 'function' || sarvTabVisible('HOME_MYDAY'));
      if (canMyDay) window.wfOpenMyDay(); else select('PURCHASE');
    });
    byId_('erpBtnBell').addEventListener('click', () => { select('DASH'); });
    // Phones start with the menu closed so the dashboard is what you land on.
    if (window.innerWidth <= 860) shell.classList.add('side-hidden');

    /* ── Edge launcher ────────────────────────────────────────────────
       Whatever screen is open, this handle stays on the left edge. Before
       it, reaching another screen meant clicking Home and picking the new
       screen from there; now one click brings up the sidebar and you can go
       anywhere directly. */
    const l = document.createElement('button');
    l.id = 'erpLauncher';
    l.type = 'button';
    l.title = 'ERP menu: open any screen from here';
    l.setAttribute('aria-label', 'Open the ERP menu');
    l.innerHTML = '<span class="erp-l-ico">' + I.menu + '</span><span class="erp-l-txt">MENU</span>';
    l.addEventListener('click', openDrawer);
    document.body.appendChild(l);

    // Escape closes the drawer and you stay on the same screen.
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const s = byId_('erpShell');
      if (s && s.classList.contains('drawer')) { e.preventDefault(); closeDrawer(); }
    });
    return shell;
  }

  function setLauncher(on) {
    const b = byId_('erpLauncher');
    if (b) b.classList.toggle('on', !!on);
  }
  /* Brings the sidebar over the current screen. The screen is not left: it
     stays open behind, and the scrim, Escape or picking the same screen
     again takes you right back to it. */
  function openDrawer() {
    const s = byId_('erpShell'); if (!s) return;
    document.body.classList.add('erp-shell-open');
    s.classList.add('open', 'drawer');
    s.classList.remove('side-hidden');       // a drawer is by definition an open sidebar
    setLauncher(false);
    syncUser();
    renderNav();
  }
  function closeDrawer() {
    const s = byId_('erpShell'); if (!s) return;
    s.classList.remove('open', 'drawer');
    document.body.classList.remove('erp-shell-open');
    setLauncher(true);                       // the screen is back in front, and so is the handle
  }
  /* The Dashboard or a Coming Soon leaf was picked from the drawer. Both
     need the main column, which is hidden in drawer mode, so the drawer
     expands into the full shell. */
  function exitDrawer() {
    const s = byId_('erpShell'); if (!s) return;
    s.classList.remove('drawer');
    setLauncher(false);
  }

  /* ══ SIDEBAR ═════════════════════════════════════════════════════════ */
  function renderNav() {
    const nav = byId_('erpNav'); if (!nav) return;
    const term = String((byId_('erpSearch') || {}).value || '').trim().toLowerCase();
    let html = '', shown = 0;

    visibleModules().forEach(mod => {
      const leaves = moduleLeaves(mod);
      const hitMod = !term || mod.label.toLowerCase().indexOf(term) >= 0;
      const hitLeaves = term ? leaves.filter(l => l.label.toLowerCase().indexOf(term) >= 0) : leaves;
      if (term && !hitMod && !hitLeaves.length) return;
      // Searching the MODULE's own name ("quality") keeps all of its leaves —
      // narrowing to the leaves that also contain the word would open an empty
      // submenu, which reads as "this module has nothing in it".
      const listLeaves = (term && !hitMod) ? hitLeaves : leaves;
      shown++;
      const liveCount = leaves.filter(leafLive).length;
      const isOpen = (openMenu === mod.key) || (!!term && !!listLeaves.length);

      html += '<button type="button" class="erp-item' +
        (current === mod.key ? ' active' : '') + (isOpen ? ' open' : '') +
        '" data-mod="' + mod.key + '">' +
        '<span class="erp-ico">' + mod.icon + '</span>' +
        '<span class="erp-label">' + esc(mod.label) + '</span>' +
        (mod.dashboard ? '' :
          (liveCount ? '<span class="erp-live" title="' + liveCount + ' screen live">● ' + liveCount + '</span>'
                     : '<span class="erp-soon-dot">SOON</span>') +
          '<span class="erp-chev">▾</span>') +
        '</button>';

      if (mod.dashboard) return;
      html += '<div class="erp-sub' + (isOpen ? ' open' : '') + '" data-sub="' + mod.key + '">';
      listLeaves.forEach(leaf => {
        const live = leafLive(leaf);
        html += '<button type="button" class="erp-subitem' +
          (current === mod.key && currentLeaf === leaf.label ? ' active' : '') +
          '" data-mod="' + mod.key + '" data-leaf="' + esc(leaf.label) + '">' +
          '<span class="erp-label">' + esc(leaf.label) + '</span>' +
          (live ? '<span class="erp-live" title="This screen is live">●</span>' : '') +
          '</button>';
      });
      html += '</div>';
    });

    nav.innerHTML = shown ? html :
      '<div class="erp-nav-empty">No menu matches “' + esc(term) + '”.</div>';

    nav.querySelectorAll('.erp-item[data-mod]').forEach(b =>
      b.addEventListener('click', () => {
        const mod = MODULES.find(m => m.key === b.dataset.mod);
        if (mod && mod.dashboard) { openMenu = null; select('DASH'); return; }
        openMenu = (openMenu === b.dataset.mod) ? null : b.dataset.mod;   // accordion
        renderNav();
      }));
    nav.querySelectorAll('.erp-subitem[data-leaf]').forEach(b =>
      b.addEventListener('click', () => select(b.dataset.mod, b.dataset.leaf)));
  }

  /* ══ ROUTING ═════════════════════════════════════════════════════════ */
  function select(modKey, leafLabel) {
    const mod = MODULES.find(m => m.key === modKey); if (!mod) return;
    // Switched off in Tab Visibility while this screen was open — land the
    // user somewhere they are allowed instead of on a module that is gone.
    if (!moduleVisible(mod)) { landing(); return; }
    const leaf = leafLabel ? (mod.children || []).find(l => l.label === leafLabel) : null;

    // Its own app in a new tab (Order Form, Packing), never the ERP iframe.
    if (leaf && leaf.external && leafVisible(leaf)) { openExternal(leaf); return; }
    // A function, not a screen (PO Details Report opens as a popup).
    if (leaf && leaf.action && leafLive(leaf)) { runAction(leaf); return; }
    // A leaf that points at a screen that already exists: hand straight over
    // to that screen's own button. Nothing is reimplemented here.
    if (leaf && leafLive(leaf)) { open(leaf.go, leaf.sub, leaf.poMode); return; }

    /* From here on it is the Dashboard or a Coming Soon page, and both need
       the main column, which is hidden in drawer mode. So if we are in a
       drawer, it expands into the full shell. */
    exitDrawer();
    current = modKey; currentLeaf = leaf ? leaf.label : null;
    if (!mod.dashboard) openMenu = modKey;
    renderNav();
    if (mod.dashboard) renderDashboard(); else renderSoon(mod, leaf);
    const body = byId_('erpBody'); if (body) body.scrollTop = 0;
    if (window.innerWidth <= 860) { const s = byId_('erpShell'); if (s) s.classList.add('side-hidden'); }
  }

  /* Opens an existing module by clicking its ORIGINAL home button. The shell is
     NOT hidden here on purpose: Inward (NB) asks for its passkey and Inward /
     Outward ask for a Nature first, and either can be cancelled — hiding the
     shell up front would drop the user onto a bare app behind it. The shell is
     taken down by the sarvNavigateFromHome wrapper instead, which only runs
     once every gate has passed. */
  /* Order Form / Packing: a new browser tab on the standalone page. Same origin,
     so the page picks up the ERP login from localStorage (sso-gate.js) and
     needs no second login. */
  function openExternal(leaf) {
    let w = null;
    try { w = window.open(leaf.external, '_blank'); } catch (e) { w = null; }
    if (w) { try { w.opener = null; } catch (e) {} return; }
    if (typeof showToast === 'function') {
      showToast('The browser blocked the new tab. Allow pop-ups for this site, or open <a href="' +
        esc(leaf.external) + '" target="_blank" rel="noopener">' + esc(leaf.label) + '</a> here.', 'warn');
    }
  }
  /* After the PO screen opened: land on the sub-panel this leaf is for. The
     panel's own buttons are clicked, so each sub-panel loads its data exactly
     as when it is clicked by hand. */
  function openPoMode() {
    const fp = document.getElementById('fullPurchasePanel');
    if (!fp || fp.style.display === 'none') return;      // a gate stopped it
    applyOnlySub();
    const vis = id => { const b = document.getElementById(id); return b && b.style.display !== 'none' ? b : null; };
    const rep = document.getElementById('p_poReportPanel');
    const onReport = rep && rep.style.display !== 'none';
    if (poOnly === 'report') {
      const b = vis('p_poSubReportBtn'); if (b) b.click();
    } else if (onReport) {
      const b = vis('p_poSubPendingBtn') || vis('p_poSubListBtn'); if (b) b.click();
    }
    applyOnlySub();
  }
  function runAction(leaf) {
    try { window[leaf.action](); }
    catch (e) {
      console.warn('[ERP] ' + leaf.action + ' failed:', e.message || e);
      if (typeof showToast === 'function') showToast(leaf.label + ' could not open: ' + (e.message || e), 'error');
    }
  }

  function open(go, sub, poMode) {
    const btn = document.querySelector('#sarvHomeDashboard .sarv-home-row[data-go="' + go + '"]');
    if (!btn) {
      if (typeof showToast === 'function') showToast('This screen is not available in this build.', 'warn');
      return;
    }
    // Same reason as onlySub below: set BEFORE the click, so the panel's own
    // sarvEnsureVisibleSubTabs_ already sees the restricted strip.
    poOnly = (go === 'PO') ? (poMode || 'build') : null;
    /* The restriction is set BEFORE the click. Inside btn.click(),
       sarvNavigateFromHome runs its own sarvEnsureVisibleSubTabs_; if onlySub
       still held the old value at that point, it would switch to the old
       tab. Setting it first makes that same ensureVisible land on our tab
       (its rule: if the current tab's button is hidden, move to the first
       visible one). */
    onlySub = (go === 'MASTER') ? (sub || null) : null;
    btn.click();
    if (go === 'PO') { openPoMode(); return; }
    if (!sub || typeof switchMasterSubTab !== 'function') return;
    /* Switch the sub-tab only if the panel actually opened. If a gate
       (Inward NB passkey, Nature chooser) stopped in between, switching
       makes no sense. Master Data has no gate today, but we should not
       rely on that. */
    const mp = document.getElementById('masterDataPanel');
    if (mp && mp.style.display !== 'none') {
      switchMasterSubTab(sub);
      applyOnlySub();        // last step, after the switch
    }
  }

  /* Where the shell opens. Normally the Dashboard — but an Admin may switch
     ERP_DASH off for a role, so fall back to that role's first visible module
     rather than rendering a page they were not given. */
  function landing() {
    exitDrawer();     // the landing content goes in the main column
    const vis = visibleModules();
    if (!vis.length) {
      current = null; currentLeaf = null; openMenu = null;
      renderNav();
      byId_('erpBody').innerHTML =
        '<div class="erp-soon"><div class="big">' + I.lock + '</div>' +
        '<h2>No modules are enabled</h2>' +
        '<p>No sidebar module is switched ON for this role. Ask the Admin to enable ' +
        '<b>Master Data › Settings › Admin Panel › Tab Visibility</b> and turn ' +
        '“ERP Shell › Sidebar Modules” ON.</p></div>';
      return;
    }
    const dash = vis.find(m => m.dashboard);
    if (dash) select(dash.key);
    else select(vis[0].key, (moduleLeaves(vis[0])[0] || {}).label);
  }

  function show() {
    const s = byId_('erpShell'); if (!s) return;
    document.body.classList.add('erp-shell-open');
    s.classList.add('open');
    s.classList.remove('drawer');   // full shell, out of drawer mode
    setLauncher(false);             // the shell itself is in front; no handle needed
    syncUser();
    qnPlace();
    const mod = MODULES.find(m => m.key === current);
    // First open, or the module we were on is no longer allowed.
    if (!mod || !moduleVisible(mod)) { landing(); return; }
    renderNav();
    if (mod.dashboard) renderDashboard();
  }
  /* The shell goes down because a screen is opening, so the edge handle
     comes up. This is the only place that turns the launcher on, and it is
     the single path for all the live screens (the sarvNavigateFromHome /
     activatePanel wrappers), so no screen can end up without the handle. */
  function hide() {
    const s = byId_('erpShell'); if (!s) return;
    s.classList.remove('open', 'drawer');
    document.body.classList.remove('erp-shell-open');
    setLauncher(true);
    qnPlace();
  }

  function syncUser() {
    let label = '—';
    try {
      if (typeof sarvLoginLabel_ === 'function') label = sarvLoginLabel_() || '—';
    } catch (e) {}
    const t = byId_('erpUserText'); if (t) t.textContent = label;
    const a = byId_('erpAvatar');
    if (a) {
      const words = String(label).replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/).filter(Boolean);
      a.textContent = words.length ? words.slice(0, 2).map(w => w[0].toUpperCase()).join('') : '—';
    }
  }

  /* ══ COMING SOON ═════════════════════════════════════════════════════ */
  function renderSoon(mod, leaf) {
    const title = leaf ? leaf.label : mod.label;
    byId_('erpBody').innerHTML =
      '<div class="erp-crumb">Home / <b>' + esc(mod.label) + '</b>' +
        (leaf ? ' / ' + esc(leaf.label) : '') + '</div>' +
      '<div class="erp-pagehead"><h1>' + mod.icon + ' ' + esc(title) + '</h1>' +
        '<span class="sub">' + esc(mod.label) + ' module</span></div>' +
      '<div class="erp-soon">' +
        '<div class="big">' + mod.icon + '</div>' +
        '<div class="mod">' + esc(mod.label) + '</div>' +
        '<h2>' + esc(title) + '</h2>' +
        '<div class="tag">COMING SOON</div>' +
        '<p>This screen will arrive in a future update. Navigation and the module ' +
          'map are ready; the form, list and report are still being built.</p>' +
        (leaf && leaf.hint
          ? '<p style="color:#1d4ed8;font-weight:700;">For now: ' + esc(leaf.hint) + '</p>'
          : '') +
        '<button type="button" class="back" id="erpSoonBack">← Back to Dashboard</button>' +
      '</div>';
    const b = byId_('erpSoonBack'); if (b) b.addEventListener('click', () => select('DASH'));
  }

  /* ══ DASHBOARD ═══════════════════════════════════════════════════════
     Six gradient KPI tiles plus a quick-open grid of every screen that is
     live for this role.

     ON THE NUMBERS: every figure and every sparkline point below is read from
     the database. The skill asks for a week-over-week trend badge and a 7-day
     sparkline; rather than invent either (a made-up trend on a factory MIS is
     worse than no trend), each tile fetches only the last 14 days of its own
     date column — a small, bounded result — and the series and the WoW % are
     computed from that. A tile whose query fails says so and offers a retry;
     none of them ever renders a placeholder figure. */
  const TILES = [
    { key: 'pr_pending', title: 'Pending PRs', grad: 'g0',
      note: 'Trend: new PRs per day',
      count: sb => sb.from('purchase_requirements').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
      series: { table: 'purchase_requirements', col: 'request_date' } },

    /* Open = still expecting material. Written as a POSITIVE list rather than
       "not in (Received, Cancelled, Rejected, Closed (Short))": the excluded
       set contains "Closed (Short)", and hand-building a PostgREST
       not.in.("…") string around a value with its own parentheses is exactly
       the kind of quoting that silently matches nothing. .in() lets the client
       do the escaping. */
    { key: 'po_open', title: 'Open POs', grad: 'g1',
      note: 'Trend: new POs per day',
      count: sb => sb.from('purchase_orders').select('id', { count: 'exact', head: true })
        .in('status', ['Generated', 'GM/CEO Approved', 'MD Approved', 'Vendor Verified', 'Partially Received']),
      series: { table: 'purchase_orders', col: 'po_date' } },

    { key: 'inward', title: 'Inward (last 7 days)', grad: 'g2', wow: true,
      note: 'Receipts in the last 7 days',
      series: { table: 'inward_entries', col: 'created_at' } },

    { key: 'outward', title: 'Outward (last 7 days)', grad: 'g3', wow: true,
      note: 'Dispatches in the last 7 days',
      series: { table: 'outward_entries', col: 'created_at' } },

    { key: 'designs', title: 'Live Designs', grad: 'g4',
      note: 'Trend: new designs per day',
      count: sb => sb.from('design_master').select('id', { count: 'exact', head: true }).eq('status', 'LIVE'),
      series: { table: 'design_master', col: 'created_at' } },

    { key: 'pr_done', title: 'PR Completed', grad: 'g5',
      note: 'Material received in store',
      count: sb => sb.from('purchase_requirements').select('id', { count: 'exact', head: true }).eq('status', 'Completed'),
      series: { table: 'purchase_requirements', col: 'request_date' } },
  ];

  const dayKey = d => {
    const t = new Date(d);
    return isNaN(t) ? null :
      t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  };
  function lastNDays(n) {
    const out = [], now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      out.push(dayKey(d));
    }
    return out;
  }

  function sparkSvg(data) {
    const w = 200, h = 40;
    if (!data || data.length < 2) return '';
    const max = Math.max.apply(null, data), min = Math.min.apply(null, data);
    const at = i => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((data[i] - min) / ((max - min) || 1)) * h;
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    };
    let pts = '', dots = '';
    for (let i = 0; i < data.length; i++) {
      const p = at(i);
      pts += p[0] + ',' + p[1] + ' ';
      dots += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' +
        (i === data.length - 1 ? 3.6 : 2.2) + '" fill="currentColor"></circle>';
    }
    return '<svg class="kpi-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<polyline points="' + pts.trim() + '" fill="none" stroke="currentColor" stroke-width="2"' +
      'vector-effect="non-scaling-stroke"></polyline>' + dots + '</svg>';
  }

  function tileHtml(t, state) {
    if (state.loading) {
      return '<div class="kpi is-load"><div class="kpi-trend">…</div>' +
        '<div class="kpi-title">' + esc(t.title) + '</div>' +
        '<div class="kpi-value">—</div><div class="kpi-note">Loading…</div></div>';
    }
    if (state.error) {
      return '<div class="kpi is-err"><div class="kpi-title">' + esc(t.title) + '</div>' +
        '<div class="kpi-value">—</div>' +
        '<div class="kpi-note">' + esc(state.error) + '</div>' +
        '<button type="button" class="kpi-retry" data-retry="' + t.key + '">↻ Try again</button></div>';
    }
    const trend = (state.trend == null) ? '' :
      '(' + (state.trend >= 0 ? '+' : '') + state.trend.toFixed(1) + '% ' + (state.trend < 0 ? '↓' : '↑') + ')';
    return '<div class="kpi ' + t.grad + '">' +
      '<div class="kpi-trend">' + (trend || '&nbsp;') + '</div>' +
      '<div class="kpi-title">' + esc(t.title) + '</div>' +
      '<div class="kpi-value">' + esc(state.value) + '</div>' +
      '<div class="kpi-note">' + esc(t.note || '') + '</div>' +
      sparkSvg(state.spark) + '</div>';
  }

  const tileState = {};
  let lastTileLoad = 0;     // throttles the refetch on every return Home
  function paintTiles() {
    const wrap = byId_('erpTiles'); if (!wrap) return;
    wrap.innerHTML = TILES.map(t => tileHtml(t, tileState[t.key] || { loading: true })).join('');
    wrap.querySelectorAll('[data-retry]').forEach(b =>
      b.addEventListener('click', () => loadTile(TILES.find(x => x.key === b.dataset.retry))));
  }

  async function loadTile(t) {
    if (!t) return;
    tileState[t.key] = { loading: true };
    paintTiles();
    const ready = (typeof SB_READY !== 'undefined' && SB_READY && typeof SB !== 'undefined' && SB);
    if (!ready) { tileState[t.key] = { error: 'Supabase is not connected' }; paintTiles(); return; }
    try {
      // 14 days, so the last 7 can be compared with the 7 before them.
      const days = lastNDays(14);
      const since = days[0];
      const q = await SB.from(t.series.table).select(t.series.col + ',notes')
        .gte(t.series.col, since).limit(5000);
      let rows = q.error ? null : (q.data || []);
      // notes only exists on the store tables; retry without it if rejected.
      if (q.error && /notes|column/i.test(q.error.message || '')) {
        const q2 = await SB.from(t.series.table).select(t.series.col).gte(t.series.col, since).limit(5000);
        if (q2.error) throw q2.error;
        rows = q2.data || [];
      } else if (q.error) throw q.error;

      const per = {};
      days.forEach(d => { per[d] = 0; });
      rows.forEach(r => {
        // A cancelled store record is not a receipt — same rule the rest of
        // the app applies through isStoreRecordCancelled_.
        if (typeof isStoreRecordCancelled_ === 'function' && r.notes &&
            isStoreRecordCancelled_(r.notes)) return;
        const k = dayKey(r[t.series.col]);
        if (k && per[k] != null) per[k]++;
      });
      const series = days.map(d => per[d]);
      const last7 = series.slice(7), prev7 = series.slice(0, 7);
      const sum = a => a.reduce((x, y) => x + y, 0);

      let value, trend = null;
      if (t.count) {
        const c = await t.count(SB);
        if (c.error) throw c.error;
        value = c.count == null ? '—' : String(c.count);
      } else {
        value = String(sum(last7));
      }
      if (t.wow) {
        const p = sum(prev7);
        trend = p ? ((sum(last7) - p) / p) * 100 : (sum(last7) ? 100 : 0);
      }
      tileState[t.key] = { value: value, spark: last7, trend: trend };
    } catch (e) {
      const miss = /does not exist|schema cache|Could not find the table/i.test(e.message || '');
      tileState[t.key] = { error: miss ? 'Table not created yet' : (e.message || 'Query failed') };
      console.warn('[ERP] KPI ' + t.key + ' failed:', e.message || e);
    }
    paintTiles();
  }

  function renderDashboard() {
    // Every live screen this role may open, as a quick-open card — the old tile
    // home's job, kept so nothing became harder to reach than it was.
    const quick = [];
    visibleModules().forEach(mod => moduleLeaves(mod).forEach(leaf => {
      if (leafLive(leaf)) quick.push({ mod: mod, leaf: leaf });
    }));

    byId_('erpBody').innerHTML =
      '<div class="erp-crumb">Home / <b>Dashboard</b></div>' +
      '<div class="erp-pagehead"><h1>Production &amp; Store Dashboard</h1>' +
        '<span class="sub">Live figures from Supabase</span></div>' +
      '<div class="erp-tiles" id="erpTiles"></div>' +
      '<div class="erp-pagehead"><h1>Live screens</h1>' +
        '<span class="sub">' + quick.length + ' screens</span></div>' +
      '<div class="erp-quick" id="erpQuick"></div>';

    const qwrap = byId_('erpQuick');
    qwrap.innerHTML = quick.map((q, i) =>
      '<button type="button" data-q="' + i + '">' +
        '<span class="q-ico">' + q.mod.icon + '</span>' +
        '<span class="q-txt"><b>' + esc(q.leaf.label) + '</b><small>' + esc(q.mod.label) + '</small></span>' +
      '</button>').join('') ||
      '<div style="font-size:12px;color:#64748b;">No screens are live for this role.</div>';
    qwrap.querySelectorAll('[data-q]').forEach(b =>
      b.addEventListener('click', () => {
        const q = quick[+b.dataset.q];
        select(q.mod.key, q.leaf.label);
      }));

    paintTiles();
    /* Coming back Home re-renders the dashboard, and refetching six KPIs every
       single time would put the user on a slow connection through a round of
       spinners just for passing through. Refetched when the figures are over a
       minute old, painted from what is already in hand otherwise. */
    const now = Date.now();
    if (now - lastTileLoad > 60000) { lastTileLoad = now; TILES.forEach(loadTile); }
  }

  /* ══ QUICK NAV: top centre search, on every screen ═════════════════
     On any screen (Inward, PO, Master Data, Lot Card ...), a search box at
     the top centre: type "po", "inward" or "brand", press Enter, and that
     screen opens. Reaching another screen used to mean MENU → module →
     leaf; now two or three letters are enough.

     It follows the sidebar's rules, so it can never grant extra access: the
     list comes from visibleModules() / moduleLeaves() (Tab Visibility +
     ERP_* rows), and opening goes through select(), which for a live screen
     clicks its REAL home button (passkey, Nature chooser and so on all
     still apply). Coming Soon leaves are listed too, lower down and tagged
     "SOON".

     There is a single input that moves (qnPlace): in the middle of the
     shell's top bar while the shell is open, otherwise in the middle of
     whichever screen <header> is visible (Store or Purchase). One input
     means the typed text, focus and recent list can never get out of sync.

     Keyboard: Ctrl+K (⌘K on Mac) or "/" from anywhere, including from inside
     the Order Form / Packing / Lot Card iframes in the ERP. ↑ ↓ to choose,
     Enter to open, Esc to close. Focus on an empty box = recently opened. */
  const QN_RECENT_KEY = 'erp_qn_recent';
  // Words people type that are not in the label, like "grn", "indent", "vendor".
  const QN_WORDS = {
    IN: 'inward grn receipt material in maal aaya bill',
    IN_NB: 'inward nb non billable non-billable returnable',
    OUT: 'outward dispatch gate pass maal gaya',
    ISSUE: 'issue store issue material issue department',
    TRACKER: 'item tracker stock ledger balance',
    REPAIR: 'repair challan repair tracker',
    REPORTS: 'print history reports pdf',
    PR: 'pr purchase requirement indent requisition',
    PO: 'po purchase order generate build vendor',
    APPROVAL_APP: 'approval mobile approve sign',
    PRODUCTION: 'design master design catalogue sku shade',
    LOT_CARD: 'lot card manager lot',
    PRINTING_LOT: 'printing lot card print',
    TRIMS: 'trims packing material manager',
    ORDER_FORM: 'sales order form so booking',
    PACKING: 'packing dispatch slip',
    COMPLAINT_APP: 'complaint support ticket'
  };
  const QN_SUB_WORDS = {
    itemMasterSub: 'items item code slicer stock msv',
    supplierMasterSub: 'supplier vendor party',
    employeeMasterSub: 'employee staff',
    machineMasterSub: 'machine',
    fabricMasterSub: 'fabric quality',
    brandMasterSub: 'brand item code rates',
    buyerMasterSub: 'buyer agency party customer',
    trimRateMasterSub: 'trims rate packing rate',
    dropdownMasterSub: 'dropdown slicer list values',
    settingsSub: 'admin settings users roles tab visibility feature access password pin'
  };

  let qnWrap = null, qnInput = null, qnPanel = null, qnFloat = null;
  let qnItems = [], qnSel = 0;

  const qnKeyOf = e => e.mod.key + '|' + (e.leaf ? e.leaf.label : '');
  function qnRecent() {
    try { const a = JSON.parse(localStorage.getItem(QN_RECENT_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function qnPushRecent(k) {
    const a = qnRecent().filter(x => x !== k); a.unshift(k);
    try { localStorage.setItem(QN_RECENT_KEY, JSON.stringify(a.slice(0, 6))); } catch (e) {}
  }

  /* Rebuilt every time. Tab Visibility can change in between (an Admin's
     Save), and a stale list would leave a path open to a closed screen. */
  function qnIndex() {
    const out = [];
    visibleModules().forEach(mod => {
      if (mod.dashboard) {
        out.push({ mod, leaf: null, label: mod.label, live: true, words: 'home dashboard kpi' });
        return;
      }
      moduleLeaves(mod).forEach(leaf => out.push({
        mod, leaf, label: leaf.label, live: leafLive(leaf),
        words: (leaf.words || QN_WORDS[leaf.go] || '') + ' ' + (QN_SUB_WORDS[leaf.sub] || '')
      }));
    });
    return out;
  }

  /* Every word must match somewhere (AND). A 1-2 letter word only counts at
     the START of a word; otherwise "po" would also hit Re-po-rts and
     Sup-po-rt and bury PO Generation. A label match beats a module /
     keyword match; live and recently opened screens rank higher. */
  function qnScore(e, toks, recent) {
    const label = e.label.toLowerCase();
    const mod = e.mod.label.toLowerCase();
    const words = ' ' + (label + ' ' + mod + ' ' + e.words.toLowerCase()).replace(/[^a-z0-9]+/g, ' ') + ' ';
    const hay = label + ' ' + mod + ' ' + e.words.toLowerCase();
    const wl = ' ' + label.replace(/[^a-z0-9]+/g, ' ');
    let s = 0;
    for (const t of toks) {
      const atStart = words.indexOf(' ' + t) >= 0;
      if (t.length < 3 ? !atStart : hay.indexOf(t) < 0) return -1;
      // Start of any word in the label; the first word gets no extra weight,
      // so "inward" keeps Material Inward (first in the sidebar) above Inward (NB).
      if (wl.indexOf(' ' + t) >= 0) s += 20;
      else if (label.indexOf(t) >= 0) s += 12;
      else if ((' ' + mod).indexOf(' ' + t) >= 0) s += 8;
      else s += 5;
    }
    if (e.live) s += 25;
    const ri = recent.indexOf(qnKeyOf(e));
    if (ri >= 0) s += 8 - ri;
    return s;
  }

  // Bold the matched parts: split the raw text, then escape each piece.
  function qnMark(text, toks) {
    const ts = toks.filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!ts.length) return esc(text);
    const re = new RegExp('(' + ts.join('|') + ')', 'ig');
    return String(text).split(re).map((p, i) => i % 2 ? '<mark>' + esc(p) + '</mark>' : esc(p)).join('');
  }

  function qnRender() {
    if (!qnPanel) return;
    const q = qnInput.value.trim().toLowerCase();
    const toks = q.split(/\s+/).filter(Boolean);
    const all = qnIndex(), recent = qnRecent();
    let html = '';
    if (!toks.length) {
      const rec = recent.map(k => all.find(e => qnKeyOf(e) === k)).filter(Boolean).slice(0, 5);
      const live = all.filter(e => e.live && rec.indexOf(e) < 0);
      qnItems = rec.concat(live);
      if (rec.length) html += '<div class="erp-qn-head">Recently opened</div>' + rec.map((e, i) => qnRow(e, i, [])).join('');
      html += '<div class="erp-qn-head">● Live screens</div>' + live.map((e, i) => qnRow(e, rec.length + i, [])).join('');
    } else {
      qnItems = all.map(e => ({ e, s: qnScore(e, toks, recent) }))
        .filter(x => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 12)
        .map(x => x.e);
      html = qnItems.length
        ? qnItems.map((e, i) => qnRow(e, i, toks)).join('')
        : '<div class="erp-qn-empty">No screen matches “' + esc(q) + '”.<br>' +
          '<small>Try: inward, po, item master, brand, lot card…</small></div>';
    }
    if (qnSel >= qnItems.length) qnSel = 0;
    qnPanel.innerHTML = '<div class="erp-qn-list">' + html + '</div>' +
      '<div class="erp-qn-foot"><span><kbd>↑</kbd><kbd>↓</kbd> to choose</span>' +
      '<span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span></div>';
    qnHighlight();
  }
  function qnRow(e, i, toks) {
    return '<button type="button" class="erp-qn-row' + (e.live ? '' : ' soon') + '" data-i="' + i + '">' +
      '<span class="erp-qn-ico">' + e.mod.icon + '</span>' +
      '<span class="erp-qn-txt"><b>' + qnMark(e.label, toks) + '</b>' +
        (e.leaf ? '<small>' + qnMark(e.mod.label, toks) + '</small>' : '') + '</span>' +
      (e.live ? '<span class="erp-qn-tag live">● Open</span>' : '<span class="erp-qn-tag">SOON</span>') +
      '</button>';
  }
  function qnHighlight() {
    if (!qnPanel) return;
    qnPanel.querySelectorAll('.erp-qn-row').forEach(r => {
      const on = +r.dataset.i === qnSel;
      r.classList.toggle('sel', on);
      if (on) r.scrollIntoView({ block: 'nearest' });
    });
  }

  // Dropdown right under the input; fixed, because the header's overflow
  // would clip it. Full width on phones.
  function qnPosition() {
    if (!qnPanel || !qnInput) return;
    const r = qnInput.getBoundingClientRect();
    const vw = window.innerWidth;
    const w = Math.min(vw - 16, Math.max(r.width, 420));
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, vw - w - 8));
    qnPanel.style.left = left + 'px';
    qnPanel.style.top = (r.bottom + 6) + 'px';
    qnPanel.style.width = w + 'px';
    qnPanel.style.maxHeight = Math.max(160, window.innerHeight - r.bottom - 20) + 'px';
  }
  function qnOpenPanel() {
    if (!qnPanel) return;
    qnSel = 0;
    qnRender();
    qnPanel.style.display = 'flex';
    qnPosition();
    qnWrap.classList.add('focus');
  }
  function qnClosePanel() {
    if (qnPanel) qnPanel.style.display = 'none';
    if (qnWrap) qnWrap.classList.remove('focus');
  }

  function qnGo(e) {
    if (!e) return;
    qnPushRecent(qnKeyOf(e));
    qnInput.value = '';
    qnClosePanel();
    qnInput.blur();
    const s = byId_('erpShell');
    /* The Dashboard and Coming Soon pages are drawn in the shell's main
       column. If we are on a screen, go Home first (the same path as the
       Home button: Nature locks cleared, full-screen panel closed), then
       open the leaf. For a live screen, select() clicks its real button
       directly and the shell does not need to open. */
    if (!(e.leaf && leafLive(e.leaf)) && s && !s.classList.contains('open') &&
        typeof window.sarvGoHome === 'function') {
      window.sarvGoHome();
    }
    select(e.mod.key, e.leaf ? e.leaf.label : null);
    setTimeout(qnPlace, 0);
  }

  function qnFocus() {
    qnPlace();
    if (!qnAvailable()) return;
    try { window.focus(); } catch (e) {}
    qnInput.focus();
    qnInput.select();
  }
  function qnAvailable() {
    return !!(qnWrap && qnWrap.parentNode && qnWrap.offsetParent !== null);
  }
  const qnEditable = t => !!t && (t.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''));
  function qnKey(ev) {
    const k = ev.key;
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && (k === 'k' || k === 'K')) {
      if (!qnWrap) return;
      ev.preventDefault();
      qnFocus();
      return;
    }
    if (k === '/' && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !qnEditable(ev.target)) {
      if (!qnWrap) return;
      ev.preventDefault();
      qnFocus();
    }
  }

  function qnLoggedIn() {
    const gate = byId_('sarvLoginGate');
    if (!gate) return true;
    return getComputedStyle(gate).display === 'none';
  }
  /* Where the input should sit right now: the full shell (not the drawer)
     → its top bar; otherwise the screen header that is visible. If neither
     exists (a new panel without a header), a small floating box at the top
     centre, so search is never missing. Nowhere before login. */
  function qnHost() {
    if (!qnLoggedIn()) return null;
    const s = byId_('erpShell');
    if (s && s.classList.contains('open')) {
      return s.classList.contains('drawer') ? null : byId_('erpTopCenter');
    }
    const hs = ['#fullPurchasePanel > header', '#storeInterface > header'];
    for (const sel of hs) {
      const h = document.querySelector(sel);
      if (h && h.offsetParent !== null && h.getBoundingClientRect().height > 0) return h;
    }
    return qnFloat;
  }
  function qnPlace() {
    if (!qnWrap) return;
    // Never move it while the user is typing; moving it in the DOM drops focus.
    if (document.activeElement === qnInput) { qnPosition(); return; }
    const host = qnHost();
    document.querySelectorAll('header.erp-qn-host').forEach(h => { if (h !== host) h.classList.remove('erp-qn-host'); });
    if (qnFloat) qnFloat.style.display = (host === qnFloat) ? 'flex' : 'none';
    if (!host) {
      // The drawer is open (it has its own sidebar search) or nobody is logged in.
      if (qnWrap.parentNode) qnWrap.parentNode.removeChild(qnWrap);
      qnClosePanel();
      return;
    }
    if (qnWrap.parentNode !== host) {
      qnClosePanel();
      if (host.tagName === 'HEADER') {
        const h1 = host.querySelector(':scope > h1');
        if (h1) h1.insertAdjacentElement('afterend', qnWrap); else host.insertBefore(qnWrap, host.firstChild);
        host.classList.add('erp-qn-host');
      } else {
        host.appendChild(qnWrap);
      }
    }
    qnHookFrames();
  }
  /* Apps opened inside the ERP (Order Form, Packing, Lot Card, Printing Lot,
     Trims) are iframes; when focus is inside one, Ctrl+K never reaches the
     parent. On the same origin we add the same listener to their document;
     on another origin we quietly skip it. Once per new document. */
  function qnHookFrames() {
    document.querySelectorAll('iframe').forEach(f => {
      try {
        const d = f.contentDocument;
        if (d && !d.__erpQnHooked) { d.addEventListener('keydown', qnKey); d.__erpQnHooked = true; }
      } catch (e) {}
    });
  }

  function qnInit() {
    qnWrap = document.createElement('div');
    qnWrap.className = 'erp-qn';
    qnWrap.innerHTML =
      '<span class="erp-qn-mag">' + I.search + '</span>' +
      '<input type="text" class="erp-qn-in" id="erpQnInput" autocomplete="off" spellcheck="false" ' +
        'placeholder="Search screens… (inward, po, item master)" aria-label="ERP screen search">' +
      '<kbd class="erp-qn-kbd" title="From anywhere: Ctrl+K or /">Ctrl K</kbd>';
    qnInput = qnWrap.querySelector('input');
    if (/Mac|iPhone|iPad/.test(navigator.platform || '')) qnWrap.querySelector('kbd').textContent = '⌘K';

    qnPanel = document.createElement('div');
    qnPanel.id = 'erpQnPanel';
    qnPanel.setAttribute('role', 'listbox');
    document.body.appendChild(qnPanel);

    qnFloat = document.createElement('div');
    qnFloat.id = 'erpQnFloat';
    document.body.appendChild(qnFloat);

    qnInput.addEventListener('focus', qnOpenPanel);
    qnInput.addEventListener('input', () => { qnSel = 0; qnRender(); qnPosition(); });
    qnInput.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); if (qnItems.length) { qnSel = (qnSel + 1) % qnItems.length; qnHighlight(); } }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (qnItems.length) { qnSel = (qnSel - 1 + qnItems.length) % qnItems.length; qnHighlight(); } }
      else if (ev.key === 'Enter') { ev.preventDefault(); qnGo(qnItems[qnSel]); }
      else if (ev.key === 'Escape') {
        ev.preventDefault(); ev.stopPropagation();
        if (qnInput.value) { qnInput.value = ''; qnRender(); } else { qnClosePanel(); qnInput.blur(); }
      }
    });
    // Delay the blur slightly; otherwise the list closes before the click lands.
    qnInput.addEventListener('blur', () => setTimeout(() => {
      if (document.activeElement !== qnInput) { qnClosePanel(); qnPlace(); }
    }, 160));
    qnPanel.addEventListener('mousedown', ev => ev.preventDefault());   // keep focus in the input
    qnPanel.addEventListener('click', ev => {
      const row = ev.target.closest('.erp-qn-row');
      if (row) qnGo(qnItems[+row.dataset.i]);
    });
    qnPanel.addEventListener('mousemove', ev => {
      const row = ev.target.closest('.erp-qn-row');
      if (row && +row.dataset.i !== qnSel) { qnSel = +row.dataset.i; qnHighlight(); }
    });

    document.addEventListener('keydown', qnKey);
    /* There are so many ways to change screen (top nav links, Home buttons,
       links inside panels, login restore) that hooking each one would miss
       something. So: re-check the position one frame after every click, on
       resize, and on a light backstop interval. It is only a few
       querySelector calls and does nothing while the user is typing. */
    document.addEventListener('click', () => requestAnimationFrame(qnPlace), true);
    window.addEventListener('resize', () => { qnPlace(); qnPosition(); });
    window.addEventListener('scroll', () => { if (qnPanel.style.display === 'flex') qnPosition(); }, true);
    setInterval(qnPlace, 1200);
    qnPlace();
  }

  /* ══ JOINING IN ══════════════════════════════════════════════════════
     Two wrappers, no edits to store-core.js. Both targets are function
     DECLARATIONS there, so reassigning the window property also redirects the
     calls store-core.js makes to them internally (unlike a const/let, which
     could not be intercepted this way).

     Done on DOMContentLoaded, after store-core.js has evaluated and after its
     own DOMContentLoaded handler has restored any saved login — so the first
     sarvGoHome() of the session already lands on the shell. */
  document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('sarvHomeDashboard')) {
      console.warn('[ERP] #sarvHomeDashboard not found — shell not installed.');
      return;
    }
    build();
    qnInit();
    document.body.classList.add('erp-shell-on');   // hides the old tile home

    // Going Home now means the shell. The original still runs first: it clears
    // the Nature locks, closes a full-screen Admin Panel / Follow-Up report and
    // re-applies this role's nav visibility, and all of that still has to happen.
    if (typeof window.sarvGoHome === 'function') {
      const orig = window.sarvGoHome;
      window.sarvGoHome = function () {
        const r = orig.apply(this, arguments);
        // Back on Home, the Master Data tab strip is whole again; the next
        // leaf the user comes from sets its own restriction.
        setOnlySub(null);
        show();
        return r;
      };
    }
    /* Whenever the Master Data tab strip is rebuilt from permissions (login,
       Tab Visibility save, panel switch, sarvEnsureVisibleSubTabs_), the
       restriction is applied again right after. Otherwise an Admin's Save
       would reopen the whole strip. */
    if (typeof window.sarvApplySubTabs_ === 'function') {
      const orig = window.sarvApplySubTabs_;
      window.sarvApplySubTabs_ = function () {
        const r = orig.apply(this, arguments);
        try { applyOnlySub(); }
        catch (e) { console.warn('[ERP] sub-tab lock skipped:', e.message || e); }
        return r;
      };
    }
    // Navigating OUT of Home takes the shell down. Hooked here rather than at
    // the click, so a cancelled passkey or Nature chooser leaves the shell up.
    if (typeof window.sarvNavigateFromHome === 'function') {
      const orig = window.sarvNavigateFromHome;
      window.sarvNavigateFromHome = function () {
        hide();
        return orig.apply(this, arguments);
      };
    }
    /* The Tab Visibility save (and login) goes through sarvApplyAccess(), so
       the sidebar is redrawn from there. Switching a module ON or OFF in the
       Admin Panel and pressing Save updates the sidebar with no page reload.
       If the module the user was on has just been turned OFF, landing()
       moves them somewhere they are allowed. */
    if (typeof window.sarvApplyAccess === 'function') {
      const orig = window.sarvApplyAccess;
      window.sarvApplyAccess = function () {
        const r = orig.apply(this, arguments);
        try {
          const s = byId_('erpShell');
          if (s && s.classList.contains('open')) {
            const mod = MODULES.find(m => m.key === current);
            if (!mod || !moduleVisible(mod)) landing();
            else renderNav();
          } else {
            renderNav();
          }
        } catch (e) { console.warn('[ERP] sidebar refresh skipped:', e.message || e); }
        return r;
      };
    }
    // Reaching the app some other way (a direct activatePanel) must not leave
    // the shell sitting over it.
    if (typeof window.activatePanel === 'function') {
      const orig = window.activatePanel;
      window.activatePanel = function () {
        hide();
        return orig.apply(this, arguments);
      };
    }
    // If the login was already restored before this file ran, sarvGoHome has
    // been and gone — put the shell up now.
    const dash = document.getElementById('sarvHomeDashboard');
    const gate = document.getElementById('sarvLoginGate');
    const loggedIn = gate && gate.style.display === 'none';
    if (loggedIn && dash && dash.style.display !== 'none') show();

    window.erpShellShow = show;
    window.erpShellHide = hide;
    /* Open a sidebar leaf from other code, exactly as a click on it would —
       same access checks, same sub-tab restrictions. Used by My Day's "Go"
       buttons (store-mytasks.js). Returns false when the leaf is unknown or
       not visible to this role. */
    window.erpGoLeaf = function (modKey, leafLabel) {
      const mod = MODULES.find(m => m.key === modKey);
      const leaf = mod && (mod.children || []).find(l => l.label === leafLabel);
      if (!leaf || !moduleVisible(mod) || !leafVisible(leaf)) return false;
      if (typeof window.sarvGoHome === 'function') window.sarvGoHome();
      select(modKey, leafLabel);
      return true;
    };
  });
})();
