/* ════════════════════════════════════════════════════════════════════
   LAUNCHER: Visitor Approvals   (launcher.html, with launcher-visitor.css)
   Also the Gate-2 Hydra / JCB entries: same table, same steps; a row's 'category'
   ('HYDRA / JCB') only changes the words and the photo shown (isHyd); so does a
   Sample & Other inward ('SAMPLE / OTHER', isSmp: bill + item photos, person, type).
   And a gate Inward of material ('INWARD', isInw: bill + item (+ vehicle) photos, PO / PR, Entry Against,
   Store Ref; approved -> the gate allows the unloading, and only then the ERP Inward can book it). Tile and list
   read 'Gate Approvals' (both gates; each row has its Gate-1 / Gate-2 chip).
   ────────────────────────────────────────────────────────────────────
   Gate-2 lets a visitor in only after the person he comes to meet ("Whom to
   Meet", an ERP user) approves him. That person does it HERE:
     - a "Visitor Approvals" tile on the home grid, first, with the number of
       visitors waiting for him (shown only when there is something: waiting,
       or decided in the last 2 days, or, for an Admin, waiting for others);
     - the list -> one visitor with every detail and the gate's photos ->
       Approve with his OWN PIN, or Reject with a reason (and PIN);
     - on approve the server copies his saved ERP signature onto the visitor's
       entry, so it prints on the Digital Visitor Pass at the gate.
   Everything is decided on the server (sql/GATE2_VISITOR_APPROVAL_MIGRATION.sql:
   gate_vis_inbox / gate_vis_detail / gate_vis_decide): only the host himself, or
   an Admin on his behalf, may decide, and the PIN is checked there. Without the
   migration there is simply no tile.
   The list is read again every 45 s while the launcher is open and visible, so a
   new visitor shows up (with a short buzz) without a reload.
   UNLOADER (sql/GATE_INWARD_UNLOADER_MIGRATION.sql): approving a gate INWARD also picks ONE Unloader user
   (a login with the Unloader Supervisor app; gate_ul_unloaders), sent together with the PIN
   (gate_vis_decide_ul, one transaction; the last pick is remembered on this device). That Unloader uploads
   the Photos / Original Invoice in unloader.html › Gate Inward, and the ERP Inward picks them up from the
   Gate Entry No. The approver (or an Admin) can move it to another Unloader until the photos are in
   (gate_ul_change). Without the migration an Inward is approved as before (gate_vis_decide).
   Plain classic script; it uses the launcher's own supabase client (SB) and the
   sheet / button / toast styles of launcher-lock.css.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.self !== window.top) return;

  var K_TOKEN = 'sarv_sso_token', K_LOCK = 'sarv_launcher_locked';
  var POLL_MS = (window.sarvSyncMs ? sarvSyncMs('launcher_approvals', 5000) : 5000), AUTO_MS = 600;   // approvals list: SYNC SPEED, default 5 s (only while the launcher is on screen)
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function tok() { try { return localStorage.getItem(K_TOKEN) || ''; } catch (e) { return ''; } }
  function locked() { try { return !!localStorage.getItem(K_LOCK); } catch (e) { return false; } }
  function loggedIn() { var h = $('homeWrap'); return !!tok() && !!h && h.style.display !== 'none'; }
  function sbc() { try { return SB; } catch (e) { return null; } }   // the launcher's supabase client (a top-level const of launcher.html)
  function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { } }
  var toastT;
  function toast(msg) {
    var t = $('ls-toast');
    if (!t) { t = document.createElement('div'); t.id = 'ls-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('in'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('in'); }, 3000);
  }
  function when(iso) {
    if (!iso) return '-';
    var d = new Date(iso); if (isNaN(d)) return String(iso);
    try { return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return d.toString(); }
  }
  var isHyd = function (v) { return !!v && v.category === 'HYDRA / JCB'; };
  var isSmp = function (v) { return !!v && v.category === 'SAMPLE / OTHER'; };
  // a gate Inward of material (Gate › Inward › New Inward Entry, approval like a Hydra): bill + item photos, PO / PR
  var isInw = function (v) { return !!v && v.category === 'INWARD'; };
  // (2026-11-25) a Sample / Other entry follows the Inward workflow: Unloader + Unloading type at Approve, Assign / Change later
  var withUnloader = function (v) { return isInw(v) || isSmp(v); };
  // a gate Dispatch Packing Slip whose Net Wt needs approval (GATE_DISPATCH_APPROVAL_MIGRATION.sql): vehicle photo, Net / Gross / Tare in purpose
  var isDsp = function (v) { return !!v && v.category === 'DISPATCH PACKING'; };
  var inwRef = function (v) { return v.refNo ? (v.refType || 'Ref') + ': ' + v.refNo : ''; };
  var smpType = function (v) { return v.returnType === 'RETURNABLE' ? 'Returnable' : 'Non-Returnable'; };
  // EARLY OUT (sql/GATE_INWARD_EARLY_OUT_MIGRATION.sql): an Inward vehicle unloaded but its Store entry not booked yet;
  // the gate asked ONE Purchaser to let it go out (gate_out_inbox / gate_out_detail / gate_out_decide). Its rows are
  // merged into the same lists with uid 'eo:<request id>' and _eo: true.
  var isEo = function (v) { return !!v && !!v._eo; };
  var EO_NOMIG = false;
  function eoRows(list) { return (list || []).map(function (x) { return Object.assign({}, x, { _eo: true, eoId: x.id, entryUid: x.uid, uid: 'eo:' + x.id }); }); }
  function eoMerge(base, eo) {
    if (!eo) return base;
    var by = function (k) { return function (a, b) { return String(a[k] || '').localeCompare(String(b[k] || '')); }; };
    return Object.assign({}, base, {
      pending: (base.pending || []).concat(eoRows(eo.pending)).sort(by('requestedAt')),
      others: (base.others || []).concat(eoRows(eo.others)).sort(by('requestedAt')),
      recent: (base.recent || []).concat(eoRows(eo.recent)).sort(function (a, b) { return by('decidedAt')(b, a); })
    });
  }
  function ago(iso) {
    var m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (!isFinite(m)) return '';
    return m < 1 ? 'now' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
  }

  var IC = {
    gate: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 11l2 2 4-4"/></svg>',
    chev: '<svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg>',
    back: '<svg width="11" height="19" viewBox="0 0 11 19" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 1.5L2 9.5l7.5 8"/></svg>',
    ref: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/></svg>'
  };

  /* ── server ─────────────────────────────────────────────────────────── */
  async function rpc(fn, args) {
    var sb = sbc(); if (!sb) return { ok: false, error: 'NET' };
    try {
      var r = await sb.rpc(fn, Object.assign({ p_token: tok() }, args || {}));
      if (r.error) {
        var c = r.error.code || '';
        if (c === 'PGRST202' || c === '42883') return { ok: false, error: 'NO_MIGRATION' };
        return { ok: false, error: 'RPC', detail: r.error.message || '' };
      }
      var d = r.data || {};
      if (d.success === false) return { ok: false, error: d.error || 'UNKNOWN', data: d };
      return { ok: true, data: d };
    } catch (e) { return { ok: false, error: 'NET' }; }
  }

  var INBOX = null, NOMIG = false, busy = false, lastN = -1, timer = null;

  /* ── Unloader users (for an Inward's approval) ─────────────────────── */
  var K_LAST_UL = 'sarv_gate_last_unloader';
  var UNL = null, UL_NOMIG = false, unlBusy = null;
  function loadUnloaders(force) {
    if (UL_NOMIG) return Promise.resolve(null);
    if (UNL && !force) return Promise.resolve(UNL);
    if (unlBusy) return unlBusy;
    unlBusy = rpc('gate_ul_unloaders').then(function (r) {
      unlBusy = null;
      if (!r.ok) { if (r.error === 'NO_MIGRATION') UL_NOMIG = true; return null; }
      UNL = r.data.unloaders || []; return UNL;
    });
    return unlBusy;
  }
  /* <select> of the Unloader users; pre = the one to show chosen (Change Unloader: the entry's current one). Never
     filled by itself (2026-11-27): no last pick, not the only one either; the approver chooses it every time. The old
     remembered pick (K_LAST_UL) is dropped. */
  try { localStorage.removeItem(K_LAST_UL); } catch (e) { }
  function unloaderSelect(pre) {
    var list = UNL || [];
    var sel = String(pre || '');
    if (!list.some(function (u) { return String(u.id) === sel; })) sel = '';
    return '<select class="lv-sel lv-unl" aria-label="Unloader"><option value="">Choose the Unloader…</option>'
      + list.map(function (u) {
        var sub = [u.empCode, u.desig, u.dept].filter(Boolean).join(' · ');
        return '<option value="' + esc(u.id) + '"' + (String(u.id) === sel ? ' selected' : '') + '>' + esc(u.name) + (sub ? ' — ' + esc(sub) : '') + '</option>';
      }).join('') + '</select>';
  }
  /* UNLOADING TYPE (sql/GATE_INWARD_UL_PAYABLE_MIGRATION.sql): FOC = free, the usual workflow; PAYABLE = the Unloader
     is paid: after the Store books the Inward, ERP › Inward NB lists the unloading under the Unloader's name for its
     bill. Chosen with the Unloader (compulsory), changed later with Change Unloader (gate_ul_set_charge). */
  var CHG = { FOC: 'FOC (free)', PAYABLE: 'Payable' };
  function chargeSelect(pre) {
    var v = CHG[pre] ? pre : '';
    return '<select class="lv-sel lv-chg" aria-label="Unloading type"><option value="">Unloading type: choose…</option>'
      + Object.keys(CHG).map(function (k) { return '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + esc(CHG[k]) + '</option>'; }).join('') + '</select>';
  }
  function unloaderLine(ul) {
    if (!ul) return '';
    var chg = ul.chargeType ? ' · Unloading ' + esc(CHG[ul.chargeType] || ul.chargeType) : '';
    return (ul.status === 'DONE'
      ? esc(ul.doneBy || ul.to || '-') + ' · ' + esc(ul.photoCount || 0) + ' photo(s) uploaded · ' + esc(when(ul.doneAt))
      : esc(ul.to || '-') + (ul.toEmp ? ' (' + esc(ul.toEmp) + ')' : '') + ' · photos not uploaded yet') + chg;
  }
  async function refresh() {
    if (busy || NOMIG || !loggedIn()) return;
    busy = true; spin(true);
    var r = await rpc('gate_vis_inbox');
    var ro = EO_NOMIG || !r.ok ? null : await rpc('gate_out_inbox');
    if (ro && !ro.ok && ro.error === 'NO_MIGRATION') EO_NOMIG = true;
    busy = false; spin(false);
    if (!r.ok) {
      if (r.error === 'NO_MIGRATION') { NOMIG = true; INBOX = null; paint(); }
      return;
    }
    INBOX = eoMerge(r.data, ro && ro.ok ? ro.data : null);
    var n = (INBOX.pending || []).length;
    // a new visitor for me since the last look: a short buzz and a line on top
    if (lastN >= 0 && n > lastN) { buzz([30, 60, 30]); toast(n - lastN === 1 ? 'A gate entry is waiting for your approval' : (n - lastN) + ' gate entries are waiting for your approval'); }
    var fresh = lastN >= 0 && n > lastN;
    lastN = n;
    paint(fresh);
    if (SHEET && SHEET.kind === 'list') renderList();
  }
  function spin(on) { var b = document.querySelector('.lv-ref'); if (b) b.classList.toggle('spin', !!on); }

  /* ── the tile (first in the grid) ───────────────────────────────────── */
  function paint(fresh) {
    var grid = $('appGrid'), old = $('visTile');
    if (old) old.remove();
    if (!grid || !INBOX || !loggedIn()) return;
    var mine = (INBOX.pending || []).length, oth = (INBOX.others || []).length, rec = (INBOX.recent || []).length;
    if (!mine && !oth && !rec) return;
    var el = document.createElement('a');
    el.id = 'visTile';
    el.className = 'app lv-tile' + (fresh ? ' lv-new' : '');
    el.setAttribute('role', 'button'); el.tabIndex = 0;
    el.style.setProperty('--a', '#10b981');
    var sub = mine ? (mine === 1 ? '1 gate entry (visitor / inward / Hydra) is waiting for you' : mine + ' gate entries (visitor / inward / Hydra) are waiting for you') + ' · approve with your PIN'
      : oth ? oth + ' waiting for others (Admin)' : 'Nothing waiting · ' + rec + ' decided in the last 2 days';
    el.innerHTML = '<span class="tile">' + IC.gate + '</span>'
      + '<span class="body"><span class="t">Gate Approvals</span><span class="s">' + esc(sub) + '</span></span>'
      + '<span class="cnt ' + (mine ? 'wait' : oth ? 'wait' : 'none') + '">' + (mine || oth || '✓') + '</span>'
      + '<span class="go">→</span>';
    el.addEventListener('click', function (e) { e.preventDefault(); openList(); });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openList(); } });
    grid.insertBefore(el, grid.firstChild);
    var head = $('appsHead'), none = $('noApps');
    if (head) head.style.display = 'block';
    if (none) none.style.display = 'none';
  }
  // My SOPs / My Notepad are put in front later (their own calls): keep this tile first, it is the one waiting for the user
  (function keepFirst() {
    var grid = $('appGrid'); if (!grid || !window.MutationObserver) return;
    new MutationObserver(function () {
      var t = $('visTile');
      if (t && grid.firstChild !== t) grid.insertBefore(t, grid.firstChild);
    }).observe(grid, { childList: true });
  })();

  /* ── sheets ─────────────────────────────────────────────────────────── */
  var SHEET = null;
  function openSheet(kind) {
    closeSheet(true);
    var scrim = document.createElement('div'); scrim.className = 'ls-scrim';
    var sh = document.createElement('div'); sh.className = 'ls-sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true');
    sh.innerHTML = '<div class="ls-grab"></div><div class="lv-body"></div>';
    document.body.appendChild(scrim); document.body.appendChild(sh);
    requestAnimationFrame(function () { requestAnimationFrame(function () { scrim.classList.add('in'); sh.classList.add('in'); }); });
    scrim.addEventListener('click', function () { closeSheet(); });
    var g = sh.querySelector('.ls-grab'), y0 = null, dy = 0;
    g.addEventListener('pointerdown', function (e) { y0 = e.clientY; dy = 0; sh.style.transition = 'none'; try { g.setPointerCapture(e.pointerId); } catch (x) { } });
    g.addEventListener('pointermove', function (e) { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = 'translate(-50%,' + dy + 'px)'; });
    var end = function () { if (y0 == null) return; y0 = null; sh.style.transition = ''; sh.style.transform = ''; if (dy > 110) closeSheet(); };
    g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
    SHEET = { kind: kind, scrim: scrim, sh: sh, body: sh.querySelector('.lv-body') };
    return SHEET;
  }
  function closeSheet(now) {
    var s = SHEET; if (!s) return; SHEET = null;
    s.scrim.classList.remove('in'); s.sh.classList.remove('in');
    setTimeout(function () { s.scrim.remove(); s.sh.remove(); }, now ? 0 : 340);
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && SHEET) closeSheet(); });

  /* ── the list ───────────────────────────────────────────────────────── */
  function openList() {
    if (locked()) return;
    if (!SHEET || SHEET.kind !== 'list') openSheet('list');
    renderList();
    refresh();
  }
  function rowHtml(v, kind) {
    var st = v.status, av = isHyd(v) ? 'H' : isSmp(v) ? 'S' : isInw(v) ? 'I' : isDsp(v) ? 'D' : (String(v.name || '?').trim().charAt(0) || '?').toUpperCase();
    var chip = kind === 'recent'
      ? (st === 'APPROVED' ? '<span class="lv-chip ok">Approved</span>' : st === 'REJECTED' ? '<span class="lv-chip no">Rejected</span>' : '<span class="lv-chip gr">' + esc(st === 'CANCELLED' ? 'Went out' : st) + '</span>')
      : '<span class="lv-chip">' + esc(ago(v.requestedAt)) + '</span>';
    if (isHyd(v)) chip = '<span class="lv-chip gr">Hydra</span>' + chip;
    if (isSmp(v)) chip = '<span class="lv-chip gr">Sample</span>' + chip;
    if (isInw(v)) chip = '<span class="lv-chip gr">Inward</span>' + chip;
    if (isDsp(v)) chip = '<span class="lv-chip gr">Dispatch</span>' + chip;
    if (isEo(v)) { chip = '<span class="lv-chip gr">Early Out</span>' + chip; av = 'O'; }
    // which gate (GATE1_UNIT1_MIGRATION.sql): Gate-1 = Unit-1, Gate-2 = Unit-2
    if (v.gate) chip = '<span class="lv-chip gr">' + (v.gate === 'G1' ? 'Gate-1' : 'Gate-2') + '</span>' + chip;
    var line2 = isEo(v) && kind !== 'recent' ? (kind === 'others' ? 'For ' + (v.approver || '-') + ' · ' : '') + 'Store entry pending · asked by ' + (v.requestedBy || 'gate') + ' · ' + when(v.requestedAt)
      : kind === 'others' ? 'For ' + (v.host || '-') + (v.hostFound ? '' : ' (no ERP login)') + ' · ' + (v.purpose || '')
      : kind === 'recent' ? (v.decidedBy ? 'By ' + v.decidedBy + ' · ' : '') + when(v.decidedAt)
      : (v.purpose || '-') + ' · ' + when(v.inTime || v.requestedAt);
    return '<button class="lv-row" data-uid="' + esc(v.uid) + '">'
      + '<span class="lv-av' + (kind === 'recent' ? (st === 'APPROVED' ? '' : st === 'REJECTED' ? ' r' : ' g') : '') + '">' + esc(av) + '</span>'
      // the chips (Gate-x · kind · status / time) sit in one small line UNDER the details, so the details keep the
      // row's whole width (three chips beside them squeezed the text column to nothing on a phone)
      + '<span class="lv-tx"><b>' + esc(v.name || '-') + '</b><small>' + esc((isSmp(v) ? (v.person || '-') + ' · ' + smpType(v) + ' · ' : '') + (isInw(v) || isEo(v) ? inwRef(v) || 'Inward' : (v.mobile || '')) + (v.vehicle && v.vehicle !== 'N/A' ? ' · ' + v.vehicle : '') + ' · ' + (v.entryId || '')) + '</small><small class="l2">' + esc(line2) + '</small>'
      + '<span class="lv-chips">' + chip + '</span></span>'
      + '<span class="lv-chev">' + IC.chev + '</span></button>';
  }
  function renderList() {
    if (!SHEET || SHEET.kind !== 'list') return;
    var d = INBOX || { pending: [], others: [], recent: [] };
    var mine = d.pending || [], oth = d.others || [], rec = d.recent || [];
    var h = '<div class="lv-head"><div class="ls-title">Gate Approvals</div><button class="lv-ref" title="Refresh" aria-label="Refresh">' + IC.ref + '</button></div>'
      + '<p class="ls-sub" style="text-align:left;margin:0 2px 4px">Visitors at the gate who came to meet you, and Inward material, Hydra / JCB and Sample / Other entries you approve. Open one, check the details and photos, then approve with your PIN.</p>';
    h += '<div class="lv-sec">Waiting for you · ' + mine.length + '</div>'
      + (mine.length ? '<div class="lv-group">' + mine.map(function (v) { return rowHtml(v, 'mine'); }).join('') + '</div>' : '<div class="lv-group"><div class="lv-empty">Nothing is waiting for you.</div></div>');
    if (d.isAdmin && oth.length) h += '<div class="lv-sec">Waiting for others (Admin) · ' + oth.length + '</div><div class="lv-group">' + oth.map(function (v) { return rowHtml(v, 'others'); }).join('') + '</div>';
    if (rec.length) h += '<div class="lv-sec">Decided in the last 2 days</div><div class="lv-group">' + rec.map(function (v) { return rowHtml(v, 'recent'); }).join('') + '</div>';
    h += '<div class="lv-acts"><button class="ls-btn gray lv-close">Close</button></div>';
    SHEET.body.innerHTML = h;
    SHEET.body.querySelector('.lv-ref').addEventListener('click', refresh);
    SHEET.body.querySelector('.lv-close').addEventListener('click', function () { closeSheet(); });
    [].forEach.call(SHEET.body.querySelectorAll('.lv-row'), function (b) { b.addEventListener('click', function () { openDetail(b.getAttribute('data-uid')); }); });
    spin(busy);
  }

  /* ── one visitor ────────────────────────────────────────────────────── */
  var DET = null;   // { uid, row, photos, canDecide }
  async function openDetail(uid) {
    if (!SHEET) openSheet('detail');
    SHEET.kind = 'detail';
    var cached = [].concat((INBOX || {}).pending || [], (INBOX || {}).others || [], (INBOX || {}).recent || []).filter(function (v) { return v.uid === uid; })[0];
    DET = { uid: uid, row: cached || { uid: uid }, photos: null, canDecide: cached ? cached.status === 'PENDING' : false };
    renderDetail();
    var r = cached && isEo(cached) ? await rpc('gate_out_detail', { p_id: cached.eoId }) : await rpc('gate_vis_detail', { p_uid: uid });
    if (!DET || DET.uid !== uid) return;
    if (!r.ok) {
      DET.err = r.error === 'NOT_FOUND' ? 'This visitor entry is no longer at the gate (deleted).' : r.error === 'NOT_ALLOWED' ? 'Only the person he came to meet (or the Admin) can open this.' : r.error === 'NET' ? 'No internet. Try again.' : 'Could not load: ' + (r.detail || r.error);
      DET.photos = {}; DET.canDecide = false; renderDetail(); return;
    }
    DET.row = r.data.row ? (isEo(DET.row) ? eoRows([r.data.row])[0] : r.data.row) : DET.row; DET.photos = r.data.photos || {}; DET.canDecide = !!r.data.canDecide;
    renderDetail();
  }
  function photoTile(src, label, waiting) {
    if (src) return '<button class="lv-ph" data-src="1"><img src="' + esc(src) + '" alt="' + esc(label) + '"><span>' + esc(label) + '</span></button>';
    return '<div class="lv-ph wait">' + (waiting ? 'Loading photo...' : 'No ' + esc(label.toLowerCase())) + '</div>';
  }
  // one Early Out request: vehicle photo at Out + the inward's bill / item photos, where it stands, Approve / Reject
  function renderEoDetail() {
    var v = DET.row || {}, p = DET.photos, ul = v.unloader, st = v.store || {};
    var kv = function (k, val) { return val ? '<div class="lv-kv"><span>' + esc(k) + '</span><b>' + val + '</b></div>' : ''; };
    var mineRow = (INBOX && INBOX.pending || []).some(function (x) { return x.uid === v.uid; });
    var h = '<div class="ls-nav"><button class="ls-back lv-back">' + IC.back + ' Approvals</button></div>'
      + '<div class="ls-title">' + esc(v.name || 'Inward vehicle') + '</div>'
      + '<p class="ls-sub">' + (v.gate ? (v.gate === 'G1' ? 'Gate-1 (Unit-1) · ' : 'Gate-2 (Unit-2) · ') : '') + 'Early Out · Store entry pending · ' + esc(v.entryId || '') + '</p>'
      + '<div class="lv-photos">' + photoTile(p && p.outPhoto, 'Vehicle at Out', !p) + photoTile(p && p.billPhoto, 'Bill', !p) + photoTile(p && p.itemPhoto, 'Item', !p) + '</div>'
      + '<div class="lv-sec">Details</div><div class="lv-group">'
      + kv('Supplier', esc(v.name || '-'))
      + kv(v.refType || 'PO / PR', esc(v.refNo || ''))
      + kv('Entry Against', esc(v.inwardType || ''))
      + kv('Vehicle', v.vehicle && v.vehicle !== 'N/A' ? esc(v.vehicle) : '')
      + kv('Inward No', esc(v.entryId || ''))
      + kv('Gate In', esc(when(v.inTime)) + (v.guard ? ' · ' + esc(v.guard) : ''))
      + kv('Gate Approval', v.approval && v.approval.by ? esc(v.approval.by) + ' · ' + esc(when(v.approval.at)) : '')
      + (ul ? kv('Unloader', unloaderLine(ul)) : '')
      + kv('Store Entry', st.booked ? 'Booked: ' + esc(st.no || '-') + ' · ' + esc(when(st.at)) : st.pending ? 'No. ' + esc(st.pending.no || '-') + ' taken, not final yet' : 'Not booked yet')
      + kv('Asked by', esc(v.requestedBy || '-') + ' · ' + esc(when(v.requestedAt)))
      + kv('Purchaser', esc(v.approver || '-'))
      + '</div>';
    if (DET.err) h += '<div class="lv-state no">' + esc(DET.err) + '</div>';
    if (v.status === 'APPROVED') h += '<div class="lv-state ok"><b>Approved</b> by ' + esc(v.decidedBy || '-') + ' · ' + esc(when(v.decidedAt)) + (v.via === 'ADMIN' ? ' (Admin)' : '') + '. The gate can let the vehicle out.</div>';
    else if (v.status === 'REJECTED') h += '<div class="lv-state no"><b>Rejected</b> by ' + esc(v.decidedBy || '-') + ' · ' + esc(when(v.decidedAt)) + (v.remarks ? '<br>' + esc(v.remarks) : '') + '</div>';
    if (st.booked && v.status === 'PENDING') h += '<div class="lv-state ok">The Store has booked this Inward now, so the gate can let it out without this approval.</div>';
    if (DET.canDecide && v.status === 'PENDING') {
      if (!mineRow && INBOX && INBOX.isAdmin) h += '<div class="lv-state wait">This request is for <b>' + esc(v.approver || '-') + '</b>. As Admin you decide on his behalf.</div>';
      h += '<div class="lv-acts"><button class="ls-btn red lv-rej">Reject</button><button class="ls-btn green lv-apr"' + (DET.photos ? '' : ' disabled') + '>Approve</button></div>';
    } else h += '<div class="lv-acts"><button class="ls-btn gray lv-back2">Back</button></div>';
    SHEET.body.innerHTML = h;
    SHEET.sh.scrollTop = 0;
    var q = function (s) { return SHEET.body.querySelector(s); };
    q('.lv-back').addEventListener('click', backToList);
    if (q('.lv-back2')) q('.lv-back2').addEventListener('click', backToList);
    if (q('.lv-apr')) q('.lv-apr').addEventListener('click', function () { askPin('APPROVE'); });
    if (q('.lv-rej')) q('.lv-rej').addEventListener('click', function () { askPin('REJECT'); });
    [].forEach.call(SHEET.body.querySelectorAll('.lv-ph[data-src]'), function (b) { b.addEventListener('click', function () { zoom(b.querySelector('img').src); }); });
  }
  function renderDetail() {
    if (!SHEET || !DET) return;
    if (isEo(DET.row)) { renderEoDetail(); return; }
    var v = DET.row || {}, p = DET.photos, keys = v.photoKeys || [];
    var hyd = isHyd(v), smp = isSmp(v), inw = isInw(v), dsp = isDsp(v);
    var hasVeh = !hyd && !smp && ((p && p.vehiclePhoto) || keys.indexOf('vehiclePhoto') >= 0);
    var h = '<div class="ls-nav"><button class="ls-back lv-back">' + IC.back + ' Approvals</button></div>'
      + '<div class="ls-title">' + esc(v.name || (hyd ? 'Hydra / JCB' : 'Visitor')) + '</div>'
      + '<p class="ls-sub">' + (v.gate ? (v.gate === 'G1' ? 'Gate-1 (Unit-1) · ' : 'Gate-2 (Unit-2) · ') : '') + (hyd ? 'Hydra / JCB · ' : smp ? 'Sample / Other · ' + smpType(v) + ' · Inward ' : inw ? 'Inward material · ' : dsp ? 'Dispatch Packing Slip · ' : '') + esc(v.entryId || '') + (v.inTime ? ' · at the gate since ' + esc(when(v.inTime)) : '') + '</p>';
    var hasDk = dsp && ((p && p.billPhoto) || keys.indexOf('billPhoto') >= 0);   // the Dharam Kanta Photo of a Dispatch slip
    h += dsp ? '<div class="lv-photos' + (hasDk ? '' : ' one') + '">' + photoTile(p && p.vehiclePhoto, 'Loaded vehicle', !p) + (hasDk ? photoTile(p && p.billPhoto, 'Dharam Kanta', !p) : '') + '</div>'
      : inw ? '<div class="lv-photos">' + photoTile(p && p.billPhoto, 'Bill', !p) + photoTile(p && p.itemPhoto, 'Item', !p) + (hasVeh ? photoTile(p && p.vehiclePhoto, 'Vehicle', !p) : '') + '</div>'
      : smp ? '<div class="lv-photos">' + photoTile(p && p.billPhoto, 'Bill', !p) + photoTile(p && p.itemPhoto, 'Item', !p) + '</div>'
      : '<div class="lv-photos' + (hasVeh ? '' : ' one') + '">' + (hyd ? photoTile(p && p.inwardPhoto, 'Hydra / JCB', !p) : photoTile(p && p.visitorPhoto, 'Visitor', !p)) + (hasVeh ? photoTile(p && p.vehiclePhoto, 'Vehicle', !p) : '') + '</div>';
    var kv = function (k, val) { return val ? '<div class="lv-kv"><span>' + esc(k) + '</span><b>' + val + '</b></div>' : ''; };
    var mob = String(v.mobile || '').replace(/\D/g, '');
    h += '<div class="lv-sec">Details</div><div class="lv-group">'
      + (hyd || smp || inw ? kv('Supplier', esc(v.name || '-')) : '')
      + (inw ? kv(v.refType || 'PO / PR', esc(v.refNo || '-')) + kv('Entry Against', esc(v.inwardType || '')) + kv('Store Ref', esc(v.storeRef || '')) : '')
      + (smp ? kv('Person', esc(v.person || '-')) + kv('Entry Type', esc(smpType(v))) : '')
      + (dsp ? kv('Weight', esc(v.purpose || '-')) + kv('Outward', esc(String(v.mobile || '').replace(/^Outward:s*/, ''))) : '')
      + (hyd || inw || dsp ? '' : kv('Mobile', mob ? '<a href="tel:+91' + esc(mob) + '">' + esc(v.mobile) + '</a>' : ''))
      + kv('Vehicle', v.vehicle && v.vehicle !== 'N/A' ? esc(v.vehicle) : '')
      + kv(hyd || smp || inw || dsp ? 'Approver' : 'Whom to Meet', esc(v.host || '-') + (v.hostDept ? ' · ' + esc(v.hostDept) : ''))
      + (inw || dsp ? '' : kv(hyd ? 'Work' : smp ? 'Item' : 'Purpose', esc(v.purpose || '-')))
      + (inw && v.unloader ? kv('Unloader', unloaderLine(v.unloader)) : '')
      + kv(inw ? 'Inward No' : dsp ? 'Packing Slip No' : 'Gate Pass No', esc(v.entryId || ''))
      + kv('Entry Time', esc(when(v.inTime)))
      + kv('Guard', esc(v.guard || ''))
      + '</div>';
    if (DET.err) h += '<div class="lv-state no">' + esc(DET.err) + '</div>';
    if (v.status === 'APPROVED') {
      h += '<div class="lv-state ok"><b>Approved</b> by ' + esc(v.decidedBy || '-') + ' · ' + esc(when(v.decidedAt)) + (v.via === 'ADMIN' ? ' (Admin)' : '')
        + (p && p.hostSign ? '<img src="' + esc(p.hostSign) + '" alt="Signature">' : (p && keys.indexOf('hostSign') < 0 ? '<br><small>No signature saved on the ERP account, so only the name prints on the pass.</small>' : '')) + '</div>';
    } else if (v.status === 'REJECTED') {
      h += '<div class="lv-state no"><b>Rejected</b> by ' + esc(v.decidedBy || '-') + ' · ' + esc(when(v.decidedAt)) + (v.remarks ? '<br>' + esc(v.remarks) : '') + '</div>';
    } else if (v.status === 'CANCELLED') {
      h += '<div class="lv-state wait">' + (hyd ? 'The Hydra / JCB' : smp ? 'The item' : inw ? 'The vehicle' : 'The visitor') + ' went out before a decision.</div>';
    } else if (v.status === 'PENDING' && v.mine === false && !(INBOX && INBOX.isAdmin)) {
      h += '<div class="lv-state wait">Waiting for ' + esc(v.host || '-') + '.</div>';
    }
    if (DET.canDecide && v.status === 'PENDING') {
      if (v.mine === false) h += '<div class="lv-state wait">' + (hyd ? 'This Hydra / JCB is for' : smp ? 'This Sample / Other entry is for' : inw ? 'This inward is for' : 'This visitor came for') + ' <b>' + esc(v.host || '-') + '</b>' + (v.hostFound ? '' : ' (no ERP login)') + '. As Admin you approve on his behalf: your name and signature print on the pass.</div>';
      h += '<div class="lv-acts"><button class="ls-btn red lv-rej">Reject</button><button class="ls-btn green lv-apr"' + (DET.photos ? '' : ' disabled') + '>Approve</button></div>';
    } else if (withUnloader(v) && v.status === 'APPROVED' && (!v.unloader || v.unloader.status === 'ASSIGNED') && (v.mine !== false || (INBOX && INBOX.isAdmin))) {
      // the Unloader is away / busy: move it to another one until the photos are uploaded. Approved WITHOUT one
      // (before GATE_INWARD_UNLOADER_MIGRATION.sql): assign one now, the ERP books the Inward only after the
      // Unloader is done (gate_ul_change, sql/GATE_INWARD_UL_LATE_MIGRATION.sql)
      if (!v.unloader) h += '<div class="lv-state wait">No Unloader is assigned to this ' + (smp ? 'Sample / Other entry' : 'Inward') + '. The Store can book it only after an Unloader uploads its Photos / Original Invoice.</div>';
      h += '<div class="lv-acts"><button class="ls-btn gray lv-back2">Back</button><button class="ls-btn blue lv-chul">' + (v.unloader ? 'Change Unloader' : 'Assign Unloader') + '</button></div>';
    } else {
      h += '<div class="lv-acts"><button class="ls-btn gray lv-back2">Back</button></div>';
    }
    SHEET.body.innerHTML = h;
    SHEET.sh.scrollTop = 0;
    var q = function (s) { return SHEET.body.querySelector(s); };
    q('.lv-back').addEventListener('click', backToList);
    if (q('.lv-back2')) q('.lv-back2').addEventListener('click', backToList);
    if (q('.lv-apr')) q('.lv-apr').addEventListener('click', function () { askPin('APPROVE'); });
    if (q('.lv-rej')) q('.lv-rej').addEventListener('click', function () { askPin('REJECT'); });
    if (q('.lv-chul')) q('.lv-chul').addEventListener('click', changeUnloader);
    [].forEach.call(SHEET.body.querySelectorAll('.lv-ph[data-src]'), function (b) { b.addEventListener('click', function () { zoom(b.querySelector('img').src); }); });
    if (inw && v.status === 'PENDING') loadUnloaders();   // ready for the Approve step
  }

  /* ── Change Unloader (approved Inward, photos not uploaded yet) ─────── */
  async function changeUnloader() {
    if (!SHEET || !DET) return;
    var v = DET.row || {}, cur = (v.unloader || {}).toId, isNew = !v.unloader;
    SHEET.body.innerHTML = '<div class="ls-nav"><button class="ls-back lv-back">' + IC.back + ' ' + esc(v.name || 'Inward') + '</button></div>'
      + '<div class="ls-title">' + (isNew ? 'Assign Unloader' : 'Change Unloader') + '</div>'
      + '<p class="ls-sub">' + (isNew ? 'No Unloader yet.' : 'Now with <b>' + esc((v.unloader || {}).to || '-') + '</b>.') + ' The ' + (isNew ? '' : 'new ') + 'Unloader uploads the Photos / Original Invoice of ' + esc(v.entryId || '') + '.</p>'
      + '<div class="lv-unlbox"><p class="lv-unlmsg">Loading the Unloader users…</p></div>'
      + '<div class="lv-sec">Unloading · FOC (free) or Payable to the Unloader</div>' + chargeSelect((v.unloader || {}).chargeType || '')
      + '<div class="lv-err" aria-live="polite"></div>'
      + '<div class="lv-acts"><button class="ls-btn gray lv-cancel">Cancel</button><button class="ls-btn green lv-go" disabled>Save</button></div>';
    var q = function (s) { return SHEET.body.querySelector(s); };
    var back = function () { renderDetail(); };
    q('.lv-back').addEventListener('click', back); q('.lv-cancel').addEventListener('click', back);
    var list = await loadUnloaders(true);
    if (!SHEET || !DET) return;
    var box = q('.lv-unlbox'), go = q('.lv-go'), err = q('.lv-err');
    if (!list || !list.length) { box.innerHTML = '<p class="lv-unlmsg">' + (UL_NOMIG ? 'The server needs GATE_INWARD_UNLOADER_MIGRATION.sql (Admin).' : 'No login has the Unloader Supervisor app. Admin: switch it on for the Unloaders.') + '</p>'; return; }
    box.innerHTML = unloaderSelect(cur);
    go.disabled = false;
    go.addEventListener('click', async function () {
      var to = box.querySelector('.lv-unl').value, chg = (q('.lv-chg') || {}).value || '';
      if (!to) { err.textContent = 'Choose the Unloader'; return; }
      if (!chg) { err.textContent = ERR.CHARGE_REQUIRED; return; }
      go.disabled = true; go.textContent = 'Saving...';
      var r = await rpc('gate_ul_change', { p_uid: DET.uid, p_unloader: to });
      if (!SHEET || !DET) return;
      if (!r.ok) {
        go.disabled = false; go.textContent = 'Save';
        err.textContent = isNew && r.error === 'NOT_FOUND' ? 'The server needs GATE_INWARD_UL_LATE_MIGRATION.sql (Admin) to assign an Unloader after the approval.' : (ERR[r.error] || ('Not saved: ' + (r.detail || r.error)));
        return;
      }
      DET.row.unloader = r.data.unloader || DET.row.unloader;
      // the Unloading type, when it differs (an older server answers NO_MIGRATION: said, the Unloader is saved)
      if ((DET.row.unloader || {}).chargeType !== chg) {
        var c = await rpc('gate_ul_set_charge', { p_uid: DET.uid, p_charge: chg });
        if (!SHEET || !DET) return;
        if (c.ok) DET.row.unloader = c.data.unloader || DET.row.unloader;
        else toast(c.error === 'NO_MIGRATION' ? 'Unloader saved. The Unloading type needs GATE_INWARD_UL_PAYABLE_MIGRATION.sql (Admin).' : 'Unloader saved, Unloading type not changed: ' + (ERR[c.error] || c.error));
      }
      toast((isNew ? 'Unloader assigned: ' : 'Unloader changed to ') + ((DET.row.unloader || {}).to || '-'));
      renderDetail();
    });
  }
  function backToList() { DET = null; if (SHEET) SHEET.kind = 'list'; renderList(); refresh(); }

  // Full-screen photo: a red Close button top right (a tap anywhere else or Esc closes too). Esc is caught on the
  // way down, so it closes only the photo and not the sheet under it.
  function zoom(src) {
    var z = document.createElement('div'); z.className = 'lv-zoom';
    z.setAttribute('role', 'dialog'); z.setAttribute('aria-modal', 'true'); z.setAttribute('aria-label', 'Photo');
    z.innerHTML = '<button type="button" class="lv-zoom-x" aria-label="Close photo" title="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button><img alt="">';
    z.querySelector('img').src = src;
    document.body.appendChild(z);
    requestAnimationFrame(function () { z.classList.add('in'); });
    var shut = false;
    function close() {
      if (shut) return; shut = true;
      window.removeEventListener('keydown', key, true);
      z.classList.remove('in'); setTimeout(function () { z.remove(); }, 200);
    }
    function key(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }
    window.addEventListener('keydown', key, true);
    z.addEventListener('click', close);
    z.querySelector('.lv-zoom-x').focus();
  }

  /* ── PIN step: Approve (PIN only) / Reject (reason + PIN) ───────────── */
  var autoT = null, sending = false;
  function askPin(act) {
    if (!SHEET || !DET) return;
    var v = DET.row || {}, rej = act === 'REJECT';
    // an Inward is approved together with the Unloader who will upload its Photos / Original Invoice
    var withUl = !rej && withUnloader(v) && !UL_NOMIG;
    SHEET.body.innerHTML = '<div class="ls-nav"><button class="ls-back lv-back">' + IC.back + ' ' + esc(v.name || 'Visitor') + '</button></div>'
      + '<div class="ls-title">' + (rej ? 'Reject ' : 'Approve ') + (isEo(v) ? 'Early Out' : isHyd(v) ? 'Hydra / JCB' : isSmp(v) ? 'Sample / Other' : isInw(v) ? 'inward material' : isDsp(v) ? 'dispatch slip' : 'visitor') + '</div>'
      + '<p class="ls-sub">' + (isEo(v) ? (rej ? 'Write why the vehicle of ' + esc(v.name || '-') + ' must wait, then your PIN.' : 'Enter your PIN to let the vehicle of <b>' + esc(v.name || '-') + '</b> (' + esc(v.vehicle || '-') + ') go out before its Store entry.') :
      rej ? 'Write why ' + esc(v.name || 'the visitor') + ' is not allowed, then your PIN.' : 'Enter your PIN to let <b>' + esc(v.name || 'the visitor') + '</b> in. Your signature prints on ' + (isHyd(v) ? 'the Hydra / JCB pass' : isSmp(v) ? 'the Sample / Other inward pass' : isInw(v) ? 'the inward gate pass' : isDsp(v) ? 'the dispatch gate pass' : 'his Digital Visitor Pass') + '.') + '</p>'
      + (rej ? '<textarea class="lv-reason" placeholder="Reason (the gate sees it)" maxlength="300"></textarea>' : '')
      // both compulsory (red *), both empty every time: chosen by hand on each approval
      + (withUl ? '<div class="lv-sec">Choose the Unloader <span style="color:#ef4444;">*</span> · uploads the Photos / Original Invoice</div><div class="lv-unlbox"><p class="lv-unlmsg">Loading the Unloader users…</p></div>'
        + '<div class="lv-chgbox" style="display:none"><div class="lv-sec">Unloading Type <span style="color:#ef4444;">*</span> · FOC (free) or Payable to the Unloader</div>' + chargeSelect('') + '</div>' : '')
      + '<div class="lv-pinbox"><input class="lv-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="PIN" aria-label="Your PIN" name="lv-approve-pin"></div>'
      + '<div class="lv-err" aria-live="polite"></div>'
      + '<div class="lv-acts"><button class="ls-btn gray lv-cancel">Cancel</button><button class="ls-btn ' + (rej ? 'red' : 'green') + ' lv-go">' + (rej ? 'Reject' : 'Approve') + '</button></div>';
    var q = function (s) { return SHEET.body.querySelector(s); };
    var pin = q('.lv-pin'), reason = q('.lv-reason');
    var back = function () { clearTimeout(autoT); renderDetail(); };
    q('.lv-back').addEventListener('click', back); q('.lv-cancel').addEventListener('click', back);
    q('.lv-go').addEventListener('click', function () { submit(act); });
    pin.addEventListener('input', function () {
      pin.value = pin.value.replace(/\D/g, '').slice(0, 8);
      q('.lv-err').textContent = '';
      // approve sends itself AUTO_MS after the last digit once 4+ are typed (a longer PIN is not tried at 4); a reject waits for the button
      clearTimeout(autoT);
      // with an Unloader box: only once one is chosen (else submit would just complain)
      var ulOk = !withUl || !q('.lv-unl') || (!!q('.lv-unl').value && !!(q('.lv-chg') || {}).value);
      if (!rej && ulOk && pin.value.length >= 4) autoT = setTimeout(function () { submit(act); }, AUTO_MS);
    });
    pin.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(autoT); submit(act); } });
    setTimeout(function () { (reason || pin).focus(); }, 280);
    if (withUl) {
      loadUnloaders().then(function (list) {
        var box = SHEET && SHEET.body.querySelector('.lv-unlbox');
        if (!box) return;
        if (!list) { box.innerHTML = UL_NOMIG ? '' : '<p class="lv-unlmsg">The Unloader users could not be read. Check the internet and open Approve again.</p>'; return; }
        // nobody to assign: approved without one (the ERP then sends it to the Unloader Supervisor on Submit, as before)
        if (!list.length) { box.dataset.skip = '1'; box.innerHTML = '<p class="lv-unlmsg">No login has the Unloader Supervisor app, so this is approved without an Unloader. Admin: switch it on (Admin Panel › Users › Apps) for the Unloaders.</p>'; return; }
        box.innerHTML = unloaderSelect('');
        box.querySelector('.lv-unl').addEventListener('change', function () { var e = q('.lv-err'); if (e) e.textContent = ''; if (q('.lv-chg') && !q('.lv-chg').value) q('.lv-chg').focus(); else pin.focus(); });
        var cb = q('.lv-chgbox'); if (cb) cb.style.display = '';
        if (q('.lv-chg')) q('.lv-chg').addEventListener('change', function () { var e = q('.lv-err'); if (e) e.textContent = ''; pin.focus(); });
      });
    }
  }
  var ERR = {
    WRONG_PIN: 'Incorrect PIN', REASON_REQUIRED: 'Write the reason first', NOT_ALLOWED: 'Only the person he came to meet (or the Admin) can decide',
    NOT_FOUND: 'This visitor entry is no longer at the gate', NO_SESSION: 'Your session ended. Log in again.', NET: 'No internet. Try again.', NO_MIGRATION: 'The server needs GATE2_VISITOR_APPROVAL_MIGRATION.sql (Admin)',
    UNLOADER_REQUIRED: 'Choose the Unloader first', NOT_UNLOADER: 'That login has no Unloader Supervisor app any more. Choose another Unloader.',
    ALREADY_UPLOADED: 'The Unloader has already uploaded the photos, so it cannot be moved now.',
    CHARGE_REQUIRED: 'Choose the Unloading type: FOC or Payable', BAD_CHARGE: 'Choose the Unloading type: FOC or Payable',
    UL_BILL_BOOKED: 'The Store has already booked the unloading bill, so the type cannot be changed now.'
  };
  async function submit(act) {
    if (sending || !SHEET || !DET) return;
    var q = function (s) { return SHEET.body.querySelector(s); };
    var pin = q('.lv-pin'), reason = q('.lv-reason'), err = q('.lv-err'), go = q('.lv-go');
    if (!pin) return;
    if (act === 'REJECT' && !(reason && reason.value.trim())) { err.textContent = ERR.REASON_REQUIRED; reason.focus(); return; }
    // an Inward's Unloader (the box is there while the server has the Unloader migration)
    var ulSel = q('.lv-unl'), ulBox = q('.lv-unlbox'), unl = ulSel ? ulSel.value : '', chgSel = q('.lv-chg'), chg = chgSel ? chgSel.value : '';
    var needUl = act === 'APPROVE' && ulBox && !ulBox.dataset.skip && !UL_NOMIG;
    if (needUl && !unl) { err.textContent = ulSel ? ERR.UNLOADER_REQUIRED : 'Wait for the Unloader list (or open Approve again)'; if (ulSel) ulSel.focus(); return; }
    if ((needUl || unl) && !chg) { err.textContent = ERR.CHARGE_REQUIRED; if (chgSel) chgSel.focus(); return; }
    if (pin.value.length < 4) { err.textContent = 'Enter your PIN'; pin.focus(); return; }
    sending = true; go.disabled = true; go.textContent = act === 'REJECT' ? 'Rejecting...' : 'Approving...';
    var uid = DET.uid, name = (DET.row || {}).name || 'Visitor';
    var args = { p_uid: uid, p_action: act, p_pin: pin.value, p_remarks: reason ? reason.value.trim() : null };
    var eo = isEo(DET.row);
    var r = eo ? await rpc('gate_out_decide', { p_id: DET.row.eoId, p_action: act, p_pin: pin.value, p_remarks: args.p_remarks })
      : unl ? await rpc('gate_vis_decide_ul', Object.assign({ p_unloader: unl, p_charge: chg || 'FOC' }, args)) : await rpc('gate_vis_decide', args);
    // a server without the Unloading type (GATE_INWARD_UL_PAYABLE_MIGRATION.sql): the Unloader alone, as before (FOC)
    var chgLost = false;
    if (unl && !r.ok && r.error === 'NO_MIGRATION') { r = await rpc('gate_vis_decide_ul', Object.assign({ p_unloader: unl }, args)); chgLost = r.ok && chg === 'PAYABLE'; }
    // the server has no Unloader step yet: approve as before (said in the toast)
    if (unl && !r.ok && r.error === 'NO_MIGRATION') { UL_NOMIG = true; unl = ''; r = await rpc('gate_vis_decide', args); }
    sending = false;
    if (!SHEET || !DET || DET.uid !== uid) return;
    if (!r.ok) {
      if (r.error === 'ALREADY_DONE') {
        var st = ((r.data || {}).visApproval || (r.data || {}).out || {}).status || '';
        toast(name + ': already ' + (st === 'CANCELLED' ? 'out of the gate' : st.toLowerCase() || 'decided'));
        backToList(); return;
      }
      go.disabled = false; go.textContent = act === 'REJECT' ? 'Reject' : 'Approve';
      err.textContent = ERR[r.error] || ('Not saved: ' + (r.detail || r.error));
      if (r.error === 'WRONG_PIN') { buzz([14, 50, 14]); pin.value = ''; pin.classList.remove('shake'); void pin.offsetWidth; pin.classList.add('shake'); pin.focus(); }
      return;
    }
    buzz(20);
    var ulName = unl ? (((r.data || {}).unloader || {}).to || '') : '';
    if (chgLost) toast('Approved as FOC: the server needs GATE_INWARD_UL_PAYABLE_MIGRATION.sql (Admin) for Payable unloading.');
    else if (eo) toast(act === 'REJECT' ? name + ': Early Out rejected. The gate sees it now.' : name + ': Early Out approved. The gate can let the vehicle out now.');
    else toast(act === 'REJECT' ? name + ' rejected. The gate sees it now.' : name + ' approved. The gate ' + (isHyd(DET && DET.row) ? 'can start the work now.' : isSmp(DET && DET.row) ? 'can allow the unloading now.' : isInw(DET && DET.row) ? 'can allow the unloading now' + (ulName ? '; ' + ulName + ' uploads the photos' + (chg === 'PAYABLE' ? ' (Unloading Payable).' : '.') : '.') : isDsp(DET && DET.row) ? 'can let the vehicle out after Done.' : 'can print his pass now.'));
    backToList();
  }

  /* ── when to read the list ──────────────────────────────────────────── */
  // called by launcher.html's renderHome after it redraws the grid (the tile goes with the old grid)
  window.visApprovalTile = function () { paint(false); refresh(); start(); };
  function start() {
    if (timer) return;
    timer = setInterval(function () { if (document.visibilityState !== 'hidden') refresh(); }, POLL_MS);
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh(); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) refresh(); });
  // the home screen may already be drawn when this file arrives
  if (loggedIn()) window.visApprovalTile();
})();
