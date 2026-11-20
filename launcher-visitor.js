/* ════════════════════════════════════════════════════════════════════
   LAUNCHER: Visitor Approvals   (launcher.html, with launcher-visitor.css)
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
   Plain classic script; it uses the launcher's own supabase client (SB) and the
   sheet / button / toast styles of launcher-lock.css.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.self !== window.top) return;

  var K_TOKEN = 'sarv_sso_token', K_LOCK = 'sarv_launcher_locked';
  var POLL_MS = 45000, AUTO_MS = 600;
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
  async function refresh() {
    if (busy || NOMIG || !loggedIn()) return;
    busy = true; spin(true);
    var r = await rpc('gate_vis_inbox');
    busy = false; spin(false);
    if (!r.ok) {
      if (r.error === 'NO_MIGRATION') { NOMIG = true; INBOX = null; paint(); }
      return;
    }
    INBOX = r.data;
    var n = (INBOX.pending || []).length;
    // a new visitor for me since the last look: a short buzz and a line on top
    if (lastN >= 0 && n > lastN) { buzz([30, 60, 30]); toast(n - lastN === 1 ? 'A visitor is waiting for your approval' : (n - lastN) + ' visitors are waiting for your approval'); }
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
    var sub = mine ? (mine === 1 ? '1 visitor at Gate-2 is waiting for you' : mine + ' visitors at Gate-2 are waiting for you') + ' · approve with your PIN'
      : oth ? oth + ' waiting for others (Admin)' : 'Nothing waiting · ' + rec + ' decided in the last 2 days';
    el.innerHTML = '<span class="tile">' + IC.gate + '</span>'
      + '<span class="body"><span class="t">Visitor Approvals</span><span class="s">' + esc(sub) + '</span></span>'
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
    var st = v.status, av = (String(v.name || '?').trim().charAt(0) || '?').toUpperCase();
    var chip = kind === 'recent'
      ? (st === 'APPROVED' ? '<span class="lv-chip ok">Approved</span>' : st === 'REJECTED' ? '<span class="lv-chip no">Rejected</span>' : '<span class="lv-chip gr">' + esc(st === 'CANCELLED' ? 'Went out' : st) + '</span>')
      : '<span class="lv-chip">' + esc(ago(v.requestedAt)) + '</span>';
    var line2 = kind === 'others' ? 'For ' + (v.host || '-') + (v.hostFound ? '' : ' (no ERP login)') + ' · ' + (v.purpose || '')
      : kind === 'recent' ? (v.decidedBy ? 'By ' + v.decidedBy + ' · ' : '') + when(v.decidedAt)
      : (v.purpose || '-') + ' · ' + when(v.inTime || v.requestedAt);
    return '<button class="lv-row" data-uid="' + esc(v.uid) + '">'
      + '<span class="lv-av' + (kind === 'recent' ? (st === 'APPROVED' ? '' : st === 'REJECTED' ? ' r' : ' g') : '') + '">' + esc(av) + '</span>'
      + '<span class="lv-tx"><b>' + esc(v.name || '-') + '</b><small>' + esc((v.mobile || '') + (v.vehicle && v.vehicle !== 'N/A' ? ' · ' + v.vehicle : '') + ' · ' + (v.entryId || '')) + '</small><small>' + esc(line2) + '</small></span>'
      + chip + '<span class="lv-chev">' + IC.chev + '</span></button>';
  }
  function renderList() {
    if (!SHEET || SHEET.kind !== 'list') return;
    var d = INBOX || { pending: [], others: [], recent: [] };
    var mine = d.pending || [], oth = d.others || [], rec = d.recent || [];
    var h = '<div class="lv-head"><div class="ls-title">Visitor Approvals</div><button class="lv-ref" title="Refresh" aria-label="Refresh">' + IC.ref + '</button></div>'
      + '<p class="ls-sub" style="text-align:left;margin:0 2px 4px">Visitors at Gate-2 who came to meet you. Open one, check the details and photos, then approve with your PIN.</p>';
    h += '<div class="lv-sec">Waiting for you · ' + mine.length + '</div>'
      + (mine.length ? '<div class="lv-group">' + mine.map(function (v) { return rowHtml(v, 'mine'); }).join('') + '</div>' : '<div class="lv-group"><div class="lv-empty">No visitor is waiting for you.</div></div>');
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
    var r = await rpc('gate_vis_detail', { p_uid: uid });
    if (!DET || DET.uid !== uid) return;
    if (!r.ok) {
      DET.err = r.error === 'NOT_FOUND' ? 'This visitor entry is no longer at the gate (deleted).' : r.error === 'NOT_ALLOWED' ? 'Only the person he came to meet (or the Admin) can open this.' : r.error === 'NET' ? 'No internet. Try again.' : 'Could not load: ' + (r.detail || r.error);
      DET.photos = {}; DET.canDecide = false; renderDetail(); return;
    }
    DET.row = r.data.row || DET.row; DET.photos = r.data.photos || {}; DET.canDecide = !!r.data.canDecide;
    renderDetail();
  }
  function photoTile(src, label, waiting) {
    if (src) return '<button class="lv-ph" data-src="1"><img src="' + esc(src) + '" alt="' + esc(label) + '"><span>' + esc(label) + '</span></button>';
    return '<div class="lv-ph wait">' + (waiting ? 'Loading photo...' : 'No ' + esc(label.toLowerCase())) + '</div>';
  }
  function renderDetail() {
    if (!SHEET || !DET) return;
    var v = DET.row || {}, p = DET.photos, keys = v.photoKeys || [];
    var hasVeh = (p && p.vehiclePhoto) || keys.indexOf('vehiclePhoto') >= 0;
    var h = '<div class="ls-nav"><button class="ls-back lv-back">' + IC.back + ' Visitors</button></div>'
      + '<div class="ls-title">' + esc(v.name || 'Visitor') + '</div>'
      + '<p class="ls-sub">' + esc(v.entryId || '') + (v.inTime ? ' · at the gate since ' + esc(when(v.inTime)) : '') + '</p>';
    h += '<div class="lv-photos' + (hasVeh ? '' : ' one') + '">' + photoTile(p && p.visitorPhoto, 'Visitor', !p) + (hasVeh ? photoTile(p && p.vehiclePhoto, 'Vehicle', !p) : '') + '</div>';
    var kv = function (k, val) { return val ? '<div class="lv-kv"><span>' + esc(k) + '</span><b>' + val + '</b></div>' : ''; };
    var mob = String(v.mobile || '').replace(/\D/g, '');
    h += '<div class="lv-sec">Details</div><div class="lv-group">'
      + kv('Mobile', mob ? '<a href="tel:+91' + esc(mob) + '">' + esc(v.mobile) + '</a>' : '')
      + kv('Vehicle', v.vehicle && v.vehicle !== 'N/A' ? esc(v.vehicle) : '')
      + kv('Whom to Meet', esc(v.host || '-') + (v.hostDept ? ' · ' + esc(v.hostDept) : ''))
      + kv('Purpose', esc(v.purpose || '-'))
      + kv('Gate Pass No', esc(v.entryId || ''))
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
      h += '<div class="lv-state wait">The visitor went out before a decision.</div>';
    } else if (v.status === 'PENDING' && v.mine === false && !(INBOX && INBOX.isAdmin)) {
      h += '<div class="lv-state wait">Waiting for ' + esc(v.host || '-') + '.</div>';
    }
    if (DET.canDecide && v.status === 'PENDING') {
      if (v.mine === false) h += '<div class="lv-state wait">This visitor came for <b>' + esc(v.host || '-') + '</b>' + (v.hostFound ? '' : ' (no ERP login)') + '. As Admin you approve on his behalf: your name and signature print on the pass.</div>';
      h += '<div class="lv-acts"><button class="ls-btn red lv-rej">Reject</button><button class="ls-btn green lv-apr"' + (DET.photos ? '' : ' disabled') + '>Approve</button></div>';
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
    [].forEach.call(SHEET.body.querySelectorAll('.lv-ph[data-src]'), function (b) { b.addEventListener('click', function () { zoom(b.querySelector('img').src); }); });
  }
  function backToList() { DET = null; if (SHEET) SHEET.kind = 'list'; renderList(); refresh(); }

  function zoom(src) {
    var z = document.createElement('div'); z.className = 'lv-zoom';
    z.innerHTML = '<img alt="">'; z.querySelector('img').src = src;
    document.body.appendChild(z);
    requestAnimationFrame(function () { z.classList.add('in'); });
    z.addEventListener('click', function () { z.classList.remove('in'); setTimeout(function () { z.remove(); }, 200); });
  }

  /* ── PIN step: Approve (PIN only) / Reject (reason + PIN) ───────────── */
  var autoT = null, sending = false;
  function askPin(act) {
    if (!SHEET || !DET) return;
    var v = DET.row || {}, rej = act === 'REJECT';
    SHEET.body.innerHTML = '<div class="ls-nav"><button class="ls-back lv-back">' + IC.back + ' ' + esc(v.name || 'Visitor') + '</button></div>'
      + '<div class="ls-title">' + (rej ? 'Reject visitor' : 'Approve visitor') + '</div>'
      + '<p class="ls-sub">' + (rej ? 'Write why ' + esc(v.name || 'the visitor') + ' is not allowed, then your PIN.' : 'Enter your PIN to let <b>' + esc(v.name || 'the visitor') + '</b> in. Your signature prints on his Digital Visitor Pass.') + '</p>'
      + (rej ? '<textarea class="lv-reason" placeholder="Reason (the gate sees it)" maxlength="300"></textarea>' : '')
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
      if (!rej && pin.value.length >= 4) autoT = setTimeout(function () { submit(act); }, AUTO_MS);
    });
    pin.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(autoT); submit(act); } });
    setTimeout(function () { (reason || pin).focus(); }, 280);
  }
  var ERR = {
    WRONG_PIN: 'Incorrect PIN', REASON_REQUIRED: 'Write the reason first', NOT_ALLOWED: 'Only the person he came to meet (or the Admin) can decide',
    NOT_FOUND: 'This visitor entry is no longer at the gate', NO_SESSION: 'Your session ended. Log in again.', NET: 'No internet. Try again.', NO_MIGRATION: 'The server needs GATE2_VISITOR_APPROVAL_MIGRATION.sql (Admin)'
  };
  async function submit(act) {
    if (sending || !SHEET || !DET) return;
    var q = function (s) { return SHEET.body.querySelector(s); };
    var pin = q('.lv-pin'), reason = q('.lv-reason'), err = q('.lv-err'), go = q('.lv-go');
    if (!pin) return;
    if (act === 'REJECT' && !(reason && reason.value.trim())) { err.textContent = ERR.REASON_REQUIRED; reason.focus(); return; }
    if (pin.value.length < 4) { err.textContent = 'Enter your PIN'; pin.focus(); return; }
    sending = true; go.disabled = true; go.textContent = act === 'REJECT' ? 'Rejecting...' : 'Approving...';
    var uid = DET.uid, name = (DET.row || {}).name || 'Visitor';
    var r = await rpc('gate_vis_decide', { p_uid: uid, p_action: act, p_pin: pin.value, p_remarks: reason ? reason.value.trim() : null });
    sending = false;
    if (!SHEET || !DET || DET.uid !== uid) return;
    if (!r.ok) {
      if (r.error === 'ALREADY_DONE') {
        var st = ((r.data || {}).visApproval || {}).status || '';
        toast(name + ': already ' + (st === 'CANCELLED' ? 'out of the gate' : st.toLowerCase() || 'decided'));
        backToList(); return;
      }
      go.disabled = false; go.textContent = act === 'REJECT' ? 'Reject' : 'Approve';
      err.textContent = ERR[r.error] || ('Not saved: ' + (r.detail || r.error));
      if (r.error === 'WRONG_PIN') { buzz([14, 50, 14]); pin.value = ''; pin.classList.remove('shake'); void pin.offsetWidth; pin.classList.add('shake'); pin.focus(); }
      return;
    }
    buzz(20);
    toast(act === 'REJECT' ? name + ' rejected. The gate sees it now.' : name + ' approved. The gate can print his pass now.');
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
