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
    { key: 'DASH', icon: '📊', label: 'Dashboard', dashboard: true },

    { key: 'PARTNER', icon: '🤝', label: 'Partner', children: [
      { label: 'Partner Dashboard' }, { label: 'Partner Registration' },
      { label: 'Customers' }, { label: 'Suppliers' },
      { label: 'Distributor Network' }, { label: 'Supplier Development' },
      { label: 'Vendor KYC & Audit' }, { label: 'Partners on Map' },
      { label: 'Partner Reports' }, { label: 'Partner Configs' } ] },

    { key: 'SALES', icon: '🛍️', label: 'Sales', children: [
      /* Listed first because it is the only built screen in this module.
         Opens order-form.html in its own tab, the same way Support ›
         Complaint App opens complaint.html. */
      { label: 'Order Form', go: 'ORDER_FORM' },
      { label: 'Sales Dashboard' }, { label: 'RFQ' }, { label: 'Quotation' },
      { label: 'Quick SO' }, { label: 'Sale Order' }, { label: 'Sample / Trial SO' },
      { label: 'Sale JWO (Job Work Out)' }, { label: 'Production Request' },
      { label: 'Deliveries & Shipments' }, { label: 'Demand & Forecasts' },
      { label: 'Sales Reports' }, { label: 'Sales Configs' } ] },

    { key: 'PURCHASE', icon: '🛒', label: 'Purchase', children: [
      { label: 'Purchase Dashboard' },
      { label: 'Purchase Requirement (PR)', go: 'PR' },
      { label: 'PO Generation', go: 'PO' },
      { label: 'Approval App (Mobile)', go: 'APPROVAL_APP' },
      { label: 'RFQ / RFQ Bids' }, { label: 'Supplier Quotation' },
      { label: 'Quotation Comparison' }, { label: 'Annual Procurement' },
      { label: 'Service Receipt' }, { label: 'Purchase Reports' },
      { label: 'Purchase Configs' } ] },

    { key: 'WAREHOUSE', icon: '🏬', label: 'Warehouse', children: [
      { label: 'Warehouse Dashboard' },
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
      { label: 'Warehouse Configs' } ] },

    { key: 'MANUF', icon: '🏭', label: 'Manufacturing', children: [
      { label: 'Shopfloor Dashboard' },
      { label: 'Design Master', go: 'PRODUCTION' },
      { label: 'Lot Card Manager', go: 'LOT_CARD' },
      { label: 'Trims Manager', go: 'TRIMS' },
      { label: 'Manufacturing Order' }, { label: 'Work Order' },
      { label: 'MO Kanban' }, { label: 'WO Kanban' },
      { label: 'My Jobcards' }, { label: 'Multi Workorder Punching' },
      { label: 'Bulk Prod Entry' }, { label: 'Production Planning (PPC)' },
      { label: 'Unbuild Order' }, { label: 'Stock Movements' },
      { label: 'Production QC' }, { label: 'MO Reports' },
      { label: 'Manuf. Configs' } ] },

    { key: 'QUALITY', icon: '🔬', label: 'Quality', children: [
      { label: 'Quality Dashboard' }, { label: 'Quality Control' },
      { label: 'Direct QC' }, { label: 'Quality Certificate' },
      { label: 'Quality Audits' }, { label: 'Defect Logs' },
      { label: 'Non Conformance Reports' }, { label: 'Deviation Request' },
      { label: 'Quality Manuals' }, { label: 'Quality Reports' },
      { label: 'QC Configs' } ] },

    { key: 'FINANCE', icon: '💰', label: 'Finance', children: [
      { label: 'Finance Dashboard' }, { label: 'Sale Invoices' },
      { label: 'Purchase Bills' }, { label: 'Credit Note' },
      { label: 'Debit Note' }, { label: 'Payment Requests' },
      { label: 'Payments' }, { label: 'Reconciliation' },
      { label: 'Compliances (GST)' }, { label: 'Finance Reports' },
      { label: 'Finance Configs' } ] },

    { key: 'PM', icon: '📋', label: 'Project Management', children: [
      { label: 'Control Center' }, { label: 'Portfolio' }, { label: 'Programs' },
      { label: 'Projects' }, { label: 'RFI & WCC' }, { label: 'Task Management' },
      { label: 'Project Reports' }, { label: 'PM Configs' } ] },

    { key: 'SUPPORT', icon: '🎧', label: 'Support', children: [
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

    { key: 'KAIZEN', icon: '📈', label: 'Kaizen / 6 Sigma', children: [
      { label: 'Kaizen Report' }, { label: 'Pareto Chart' },
      { label: 'Published SOP' }, { label: 'PDCA' }, { label: 'Poka Yoke' },
      { label: 'RACI Matrix' }, { label: 'Process Chart' },
      { label: 'Time Study' }, { label: 'Cost-Benefit Analysis' },
      { label: 'RAID Log' } ] },

    { key: 'HR', icon: '👥', label: 'HR Management', children: [
      { label: 'HR Dashboard' }, { label: 'Employee' }, { label: 'Attendance' },
      { label: 'Salary Calculation' }, { label: 'Payroll' }, { label: 'Leaves' },
      { label: 'Holiday' }, { label: 'Employee Contract' }, { label: 'Recruitment' },
      { label: 'Training' }, { label: 'Loans & Salary Advances' },
      { label: 'Transport' }, { label: 'HR Policies' },
      { label: 'HR Reports' }, { label: 'HR Config' } ] },

    /* Master Data ke chaar sub-tab ab chaar alag leaves hain — pehle ek hi
       leaf tha jo panel ko uske default (Item Master) par kholta tha, aur
       baaki teen tak pahunchne ke liye andar ka tab bar dhoondhna padta tha.
       Settings jaan-boojh kar yahan NAHI hai: wo sirf Administration ›
       Admin Panel se khulta hai (neeche dekhein). */
    { key: 'MASTERS', icon: '🗂️', label: 'Masters', children: [
      { label: 'Item Master',     go: 'MASTER', sub: 'itemMasterSub',     tab: 'MD_ITEM' },
      { label: 'Supplier Master', go: 'MASTER', sub: 'supplierMasterSub', tab: 'MD_SUPPLIER' },
      { label: 'Employee Master', go: 'MASTER', sub: 'employeeMasterSub', tab: 'MD_EMPLOYEE' },
      { label: 'Machine List',    go: 'MASTER', sub: 'machineMasterSub',  tab: 'MD_MACHINE' },
      { label: 'Geography' }, { label: 'Finance Masters' },
      { label: 'General Masters' }, { label: 'HR Masters' },
      { label: 'UOM & Categories' }, { label: 'Warehouse / Location' } ] },

    { key: 'PRODUCTS', icon: '📦', label: 'Products', children: [
      { label: 'Product / Item Master' }, { label: 'Categories' },
      { label: 'Size / GSM / Colour Variants' }, { label: 'Bill of Material' },
      { label: 'Price Lists' } ] },

    { key: 'ASSETS', icon: '🛠️', label: 'Assets', children: [
      { label: 'Machine Asset Register' }, { label: 'Maintenance Schedule' },
      { label: 'Maintenance Log' }, { label: 'Depreciation' } ] },

    { key: 'TENDER', icon: '📜', label: 'Tender Management', children: [
      { label: 'Tender List' }, { label: 'EMD Tracking' },
      { label: 'Bid Submission' }, { label: 'Tender Results' } ] },

    { key: 'NPD', icon: '🧪', label: 'NPD / R&D (PLM)', children: [
      { label: 'New Design Request' }, { label: 'Sample Approval' },
      { label: 'BOM Versions' }, { label: 'Costing Sheets' },
      { label: 'Printing Recipe' } ] },

    { key: 'KPIT', icon: '🎯', label: 'KPIs & Targets', children: [
      { label: 'Department Targets' }, { label: 'Target vs Actual' },
      { label: 'KPI Campaigns' }, { label: 'KPI Submissions' } ] },

    { key: 'ACT', icon: '🕑', label: 'All Activities', children: [
      { label: 'Activity Timeline' }, { label: 'My Tasks' },
      { label: 'Scheduled Activities' } ] },

    /* Settings ka ek hi darwaza, aur wo yahan hai. Users & Roles, Feature
       Access, Tab Visibility aur Change Passwords sab Settings sub-tab ke
       andar hain, aur wo cheezein Masters ki list me nahi, Administration me
       hi dhoondi jaati hain. */
    { key: 'ADMIN', icon: '⚙️', label: 'Administration', children: [
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
    if (!leaf.go) return true;                       // not built yet — harmless
    try {
      if (typeof sarvTabVisible !== 'function') return true;
      // The screen itself (Admin Panel › Tab Visibility › 🏠 Home Page) …
      if (!sarvTabVisible('HOME_' + leaf.go)) return false;
      /* … and, where a leaf opens one particular sub-tab of that screen, that
         sub-tab's own row too (🗂️ Master Data › Sub Tabs). So switching off
         "Machine List" for a role takes it out of the sidebar as well as out of
         the panel's tab strip — one switch, both places, and no new keys: these
         are the same MD_* rows the panel has always read. */
      if (leaf.tab && !sarvTabVisible(leaf.tab)) return false;
      return true;
    } catch (e) { return true; }
  }
  function moduleLeaves(mod) { return (mod.children || []).filter(leafVisible); }

  /* Is this MODULE listed in the sidebar for this role? Admin Panel ›
     Tab Visibility › "🏢 ERP Shell › Sidebar Modules", one ERP_<key> row per
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
    return !!leaf.go && !!document.querySelector('#sarvHomeDashboard .sarv-home-row[data-go="' + leaf.go + '"]');
  }

  let openMenu = null;      // which module's submenu is expanded
  let current = 'DASH';     // selected module
  let currentLeaf = null;   // selected leaf label

  /* ══ MASTER DATA: PANEL ME SIRF WAHI TAB JISSE AAP AAYE ══════════════
     Master Data panel ke paanch sub-tab hain, aur sidebar me unke paanch
     alag leaves. Dono ek saath dikhna do navigation ek hi cheez ke liye hai —
     aur isi liye Settings "Masters se nahi khulta" ka niyam bhi panel ke apne
     tab strip se toot jaata tha.

     To ab jo leaf se aaye, panel me sirf wahi tab dikhta hai. Yahi niyam top
     nav par pehle se hai: Home se kisi section me ghusne ke baad
     sarvLockNavToSection baaki sections ke links chhupa deta hai.

     EK ZAROORI BAAT: ye code sirf CHHUPATA hai, kabhi dikhata nahi.
     store-core.js ka sarvApplySubTabs_ pehle Tab Visibility ke hisaab se
     display set karta hai, uske BAAD ye chalta hai aur baaki tabs ko hata
     deta hai. Isi liye ye kisi role ko koi tab extra nahi de sakta — galti se
     bhi nahi. */
  let onlySub = null;       // null = koi rok nahi, poora strip
  function applyOnlySub() {
    if (!onlySub) return;   // kuch dikhana nahi — sirf chhupana is file ka kaam hai
    const mp = document.getElementById('masterDataPanel');
    if (!mp) return;
    mp.querySelectorAll('.master-sub-tab[data-subtab]').forEach(b => {
      if (b.dataset.subtab !== onlySub) b.style.display = 'none';
    });
  }
  /* Rok lagana / hatana. Hatate waqt store-core ka apna pass dobara chalaya
     jaata hai, taaki tab strip permissions ke hisaab se wapas bane — yahan se
     display='' karke khud "restore" karna wo tab bhi khol dega jo is role ko
     nahi dikhna chahiye. */
  function setOnlySub(sub) {
    onlySub = sub || null;
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
          '<span class="erp-brand-mark">🧵</span>' +
          '<span class="erp-brand-text"><b>SARV INDIA</b><small>Home Furnishing · ERP</small></span>' +
        '</div>' +
        '<div class="erp-search-wrap">' +
          '<input type="search" class="erp-search" id="erpSearch" placeholder="🔍 Search Menus" autocomplete="off">' +
        '</div>' +
        '<nav class="erp-nav" id="erpNav"></nav>' +
      '</aside>' +
      '<div class="erp-main">' +
        '<div class="erp-top">' +
          '<button type="button" class="erp-burger" id="erpBurger" title="Sidebar chhupayein / dikhayein">☰</button>' +
          '<span class="erp-unit" id="erpUnit">Sarv India · Unit-2</span>' +
          '<span class="erp-top-spacer"></span>' +
          '<button type="button" class="erp-iconbtn" id="erpBtnTasks" title="Pending kaam">☑</button>' +
          '<button type="button" class="erp-iconbtn" id="erpBtnHist" title="Print History / Reports">🕑</button>' +
          '<button type="button" class="erp-iconbtn" id="erpBtnBell" title="Notifications">🔔<span class="dot"></span></button>' +
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
    // Scrim: drawer mode me use band karta hai (aap jis screen par the, wahin
    // reh jaate hain); poore shell me wo sirf sidebar sameta deta hai.
    byId_('erpScrim').addEventListener('click', () => {
      if (shell.classList.contains('drawer')) closeDrawer();
      else shell.classList.add('side-hidden');
    });
    byId_('erpSearch').addEventListener('input', renderNav);
    byId_('erpUser').addEventListener('click', () => {
      if (typeof sarvLogout === 'function') sarvLogout();
    });
    byId_('erpBtnHist').addEventListener('click', () => open('REPORTS'));
    byId_('erpBtnTasks').addEventListener('click', () => { select('PURCHASE'); });
    byId_('erpBtnBell').addEventListener('click', () => { select('DASH'); });
    // Phones start with the menu closed so the dashboard is what you land on.
    if (window.innerWidth <= 860) shell.classList.add('side-hidden');

    /* ── Edge launcher ────────────────────────────────────────────────
       Koi bhi screen khuli ho, baayein kinare par ye handle rehta hai. Isse
       pehle doosri screen par jaane ke liye "🏠 Home" dabana padta tha, phir
       wahan se nayi screen chunni padti thi — ab ek click me sidebar aa jaata
       hai aur seedha kahin bhi jaa sakte hain. */
    const l = document.createElement('button');
    l.id = 'erpLauncher';
    l.type = 'button';
    l.title = 'ERP menu — yahan se seedha koi bhi screen kholein';
    l.setAttribute('aria-label', 'ERP menu kholein');
    l.innerHTML = '<span class="erp-l-ico">☰</span><span class="erp-l-txt">MENU</span>';
    l.addEventListener('click', openDrawer);
    document.body.appendChild(l);

    // Escape: drawer band, aur aap usi screen par rehte hain.
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
  /* Sidebar ko chalu screen ke upar le aata hai. Screen chhuti nahi — peeche
     waisi hi khuli rehti hai, aur scrim / Escape / wahi screen dobara chunne
     par aap wahin wapas aa jaate hain. */
  function openDrawer() {
    const s = byId_('erpShell'); if (!s) return;
    document.body.classList.add('erp-shell-open');
    s.classList.add('open', 'drawer');
    s.classList.remove('side-hidden');       // drawer ka matlab hi khula sidebar
    setLauncher(false);
    syncUser();
    renderNav();
  }
  function closeDrawer() {
    const s = byId_('erpShell'); if (!s) return;
    s.classList.remove('open', 'drawer');
    document.body.classList.remove('erp-shell-open');
    setLauncher(true);                       // screen wapas saamne, handle wapas
  }
  /* Drawer se Dashboard ya koi Coming Soon leaf chuna gaya — unke liye main
     column chahiye, jo drawer mode me chhupa hota hai. To drawer poore shell
     me khul jaata hai. */
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
          (live ? '<span class="erp-live" title="Ye screen abhi chalu hai">●</span>' : '') +
          '</button>';
      });
      html += '</div>';
    });

    nav.innerHTML = shown ? html :
      '<div class="erp-nav-empty">“' + esc(term) + '” se koi menu nahi mila.</div>';

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

    // A leaf that points at a screen that already exists: hand straight over
    // to that screen's own button. Nothing is reimplemented here.
    if (leaf && leafLive(leaf)) { open(leaf.go, leaf.sub); return; }

    /* Yahan se aage Dashboard ya Coming Soon banta hai, aur dono ko main
       column chahiye — jo drawer mode me chhupa hota hai. To drawer ho to
       poore shell me khul jaata hai. */
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
  function open(go, sub) {
    const btn = document.querySelector('#sarvHomeDashboard .sarv-home-row[data-go="' + go + '"]');
    if (!btn) {
      if (typeof showToast === 'function') showToast('Ye screen is build me nahi mili.', 'warn');
      return;
    }
    /* Rok click se PEHLE lagti hai. btn.click() ke andar hi
       sarvNavigateFromHome apna sarvEnsureVisibleSubTabs_ chala deta hai; agar
       onlySub tab tak purani value par hota, wo purane tab par switch kar
       deta. Pehle set karne se wahi ensureVisible khud hamare tab par aa
       jaata hai (uska niyam: current tab ka button chhupa ho to pehle visible
       par chale jao). */
    onlySub = (go === 'MASTER') ? (sub || null) : null;
    btn.click();
    if (!sub || typeof switchMasterSubTab !== 'function') return;
    /* Panel khula hai tabhi sub-tab badalte hain: koi gate (Inward NB ka
       passkey, Nature chooser) beech me ruk gaya ho to badalne ka matlab nahi
       — Master Data par aaj koi gate nahi hai, par ye maan kar chalna galat
       hoga. */
    const mp = document.getElementById('masterDataPanel');
    if (mp && mp.style.display !== 'none') {
      switchMasterSubTab(sub);
      applyOnlySub();        // aakhri baat, switch ke baad
    }
  }

  /* Where the shell opens. Normally the Dashboard — but an Admin may switch
     ERP_DASH off for a role, so fall back to that role's first visible module
     rather than rendering a page they were not given. */
  function landing() {
    exitDrawer();     // landing ka content main column me jaata hai
    const vis = visibleModules();
    if (!vis.length) {
      current = null; currentLeaf = null; openMenu = null;
      renderNav();
      byId_('erpBody').innerHTML =
        '<div class="erp-soon"><div class="big">🔒</div>' +
        '<h2>Koi module khula nahi hai</h2>' +
        '<p>Is role ke liye sidebar ka koi module ON nahi hai. Admin se ' +
        '<b>Master Data › Settings › Admin Panel › Tab Visibility</b> me ' +
        '“🏢 ERP Shell › Sidebar Modules” ON karwayein.</p></div>';
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
    s.classList.remove('drawer');   // poora shell — drawer mode se bahar
    setLauncher(false);             // shell khud saamne hai, handle ki zaroorat nahi
    syncUser();
    const mod = MODULES.find(m => m.key === current);
    // First open, or the module we were on is no longer allowed.
    if (!mod || !moduleVisible(mod)) { landing(); return; }
    renderNav();
    if (mod.dashboard) renderDashboard();
  }
  /* Shell neeche ja raha hai kyonki ek screen khul rahi hai — to kinare ka
     handle aa jaata hai. Ye hi wo ek jagah hai jahan se launcher chalu hota
     hai, aur yahi 17 live screens ka ek hi raasta hai (sarvNavigateFromHome /
     activatePanel wrappers), to kisi screen par handle chhoot nahi sakta. */
  function hide() {
    const s = byId_('erpShell'); if (!s) return;
    s.classList.remove('open', 'drawer');
    document.body.classList.remove('erp-shell-open');
    setLauncher(true);
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
        '<div class="tag">🚧 COMING SOON</div>' +
        '<p>Is screen ka interface agli update me aayega. Navigation aur module ' +
          'map taiyaar hai — andar ka form, list aur report abhi banna baaki hai.</p>' +
        (leaf && leaf.hint
          ? '<p style="color:#1d4ed8;font-weight:700;">Abhi ke liye: ' + esc(leaf.hint) + '</p>'
          : '') +
        '<button type="button" class="back" id="erpSoonBack">← Dashboard par wapas</button>' +
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
      note: 'spark: roz nayi PR',
      count: sb => sb.from('purchase_requirements').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
      series: { table: 'purchase_requirements', col: 'request_date' } },

    /* Open = still expecting material. Written as a POSITIVE list rather than
       "not in (Received, Cancelled, Rejected, Closed (Short))": the excluded
       set contains "Closed (Short)", and hand-building a PostgREST
       not.in.("…") string around a value with its own parentheses is exactly
       the kind of quoting that silently matches nothing. .in() lets the client
       do the escaping. */
    { key: 'po_open', title: 'Open POs', grad: 'g1',
      note: 'spark: roz naye PO',
      count: sb => sb.from('purchase_orders').select('id', { count: 'exact', head: true })
        .in('status', ['Generated', 'GM/CEO Approved', 'MD Approved', 'Vendor Verified', 'Partially Received']),
      series: { table: 'purchase_orders', col: 'po_date' } },

    { key: 'inward', title: 'Inward — 7 din', grad: 'g2', wow: true,
      note: 'pichhle 7 din ke receipts',
      series: { table: 'inward_entries', col: 'created_at' } },

    { key: 'outward', title: 'Outward — 7 din', grad: 'g3', wow: true,
      note: 'pichhle 7 din ke dispatch',
      series: { table: 'outward_entries', col: 'created_at' } },

    { key: 'designs', title: 'Live Designs', grad: 'g4',
      note: 'spark: roz naye design',
      count: sb => sb.from('design_master').select('id', { count: 'exact', head: true }).eq('status', 'LIVE'),
      series: { table: 'design_master', col: 'created_at' } },

    { key: 'pr_done', title: 'PR Completed', grad: 'g5',
      note: 'maal store me aa gaya',
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
        (i === data.length - 1 ? 3.6 : 2.2) + '" fill="#fff"></circle>';
    }
    return '<svg class="kpi-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<polyline points="' + pts.trim() + '" fill="none" stroke="#fff" stroke-width="2" ' +
      'vector-effect="non-scaling-stroke"></polyline>' + dots + '</svg>';
  }

  function tileHtml(t, state) {
    if (state.loading) {
      return '<div class="kpi is-load"><div class="kpi-trend">…</div>' +
        '<div class="kpi-title">' + esc(t.title) + '</div>' +
        '<div class="kpi-value">—</div><div class="kpi-note">load ho raha hai…</div></div>';
    }
    if (state.error) {
      return '<div class="kpi is-err"><div class="kpi-title">' + esc(t.title) + '</div>' +
        '<div class="kpi-value">—</div>' +
        '<div class="kpi-note">' + esc(state.error) + '</div>' +
        '<button type="button" class="kpi-retry" data-retry="' + t.key + '">↻ Dobara koshish</button></div>';
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
    if (!ready) { tileState[t.key] = { error: 'Supabase connect nahi hai' }; paintTiles(); return; }
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
      tileState[t.key] = { error: miss ? 'Table abhi nahi bani' : (e.message || 'Query fail') };
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
      '<div class="erp-pagehead"><h1>📊 Production &amp; Store Dashboard</h1>' +
        '<span class="sub">live figures — Supabase se</span></div>' +
      '<div class="erp-tiles" id="erpTiles"></div>' +
      '<div class="erp-pagehead"><h1>⚡ Jo screens abhi chalu hain</h1>' +
        '<span class="sub">' + quick.length + ' screens</span></div>' +
      '<div class="erp-quick" id="erpQuick"></div>';

    const qwrap = byId_('erpQuick');
    qwrap.innerHTML = quick.map((q, i) =>
      '<button type="button" data-q="' + i + '">' +
        '<span class="q-ico">' + q.mod.icon + '</span>' +
        '<span class="q-txt"><b>' + esc(q.leaf.label) + '</b><small>' + esc(q.mod.label) + '</small></span>' +
      '</button>').join('') ||
      '<div style="font-size:12px;color:#64748b;">Is role ke liye koi screen chalu nahi hai.</div>';
    qwrap.querySelectorAll('[data-q]').forEach(b =>
      b.addEventListener('click', () => {
        const l = quick[+b.dataset.q].leaf;
        open(l.go, l.sub);
      }));

    paintTiles();
    /* Coming back Home re-renders the dashboard, and refetching six KPIs every
       single time would put the user on a slow connection through a round of
       spinners just for passing through. Refetched when the figures are over a
       minute old, painted from what is already in hand otherwise. */
    const now = Date.now();
    if (now - lastTileLoad > 60000) { lastTileLoad = now; TILES.forEach(loadTile); }
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
    document.body.classList.add('erp-shell-on');   // hides the old tile home

    // Going Home now means the shell. The original still runs first: it clears
    // the Nature locks, closes a full-screen Admin Panel / Follow-Up report and
    // re-applies this role's nav visibility, and all of that still has to happen.
    if (typeof window.sarvGoHome === 'function') {
      const orig = window.sarvGoHome;
      window.sarvGoHome = function () {
        const r = orig.apply(this, arguments);
        // Home par aate hi Master Data ka tab strip wapas poora — agli baar
        // kisi aur leaf se aane par usi ki rok lagegi.
        setOnlySub(null);
        show();
        return r;
      };
    }
    /* Master Data ka tab strip jab bhi permissions ke hisaab se dobara banta
       hai (login, Tab Visibility ka save, panel switch, sarvEnsureVisibleSubTabs_)
       — uske turant baad rok dobara lagti hai. Warna Admin ka Save poora
       strip wapas khol deta. */
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
    /* Tab Visibility ka save (aur login) sarvApplyAccess() se guzarta hai — to
       sidebar wahin se redraw hota hai. Matlab Admin Panel me module ON / OFF
       karke Save dabate hi sidebar badal jaata hai, page reload ki zaroorat
       nahi. Agar jis module par user khada tha wo OFF ho gaya, landing() usey
       allowed jagah par le aata hai. */
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
  });
})();
