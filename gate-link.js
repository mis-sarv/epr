/* ════════════════════════════════════════════════════════════════════
   gate-link.js — the work BETWEEN Gate-1 (Unit-1) and Gate-2 (Unit-2)
   ────────────────────────────────────────────────────────────────────
   Loaded by BOTH gate_1.html and gate_2.html, after the page's own code
   (it reads the page's top-level names: GATE_ID / GATE_OTHER / GATE_UNIT /
   GATE_OTHER_UNIT, gateEntries, commitEntry, touchEntry, gateRpc, gateNextNo,
   gateTakeNo, genGateId, compressImageFile, photoOf, esc, showIosBanner,
   openPassModal, formatDateTimeShort, visRefreshUi, GATE_USER, GATE_OFFLINE).
   One file, so the two gates can never work differently here.

   Server: sql/GATE1_UNIT1_MIGRATION.sql
     gate_incoming(p_token, p_gate)   what the other gate sent here and this gate
                                      has not taken in yet (rows) + what this gate
                                      sent in 7 days and whether it was taken in (sent)
     gate_vehicle_inside(p_token, p_gate, p_vehicle)

   1. UNIT TRANSFER (the TRANSFER tile)
      Send   = the page's own Out From Store form in transfer mode
             (gateOpenTransferOut in the gate page, section 6): against a Store
             Gate Pass No. only, party / item / qty from that pass (so no Gate
             Pass Photo), Item Photo compulsory, Vehicle No / Driver / Remarks
             -> entry TRANSFER OUT (passNo = transferRef), status OUT,
             toGate = the other gate.
      Arriving  the other gate's TRANSFER OUT to here -> Receive: Inward No. of
             this gate's series, photo at arrival (compulsory) -> entry
             TRANSFER IN (linkUid = the sent one), status IN (the vehicle is
             inside; Mark Out later from its pass as usual).
      Sent   this gate's transfers with Received / Not received yet.
   2. VISITOR MOVING UNITS
      Existing Visitor › "To Unit-x": the visitor goes out here (moveTo) without
      the out photo; the other gate's Visitor menu shows "Arriving From" -> Take
      in: a visitor entry there, already inside, NO new approval (the approval of
      this unit stays on the original entry), linkUid = the original.
   3. VEHICLE CROSS-CHECK
      Every vehicle box: a vehicle still IN at the other gate gets a red note
      under the box ("still inside Unit-2: IN-0045 since ..."); a warning only,
      nothing is blocked (the other gate may simply not have marked it Out).
   Offline: nothing from the other gate can be read; the sheets say so, the
   rest of the gate works as before. Without the migration: the same, with a note.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.GateLink) return;
  var $ = function (id) { return document.getElementById(id); };
  var INC = { rows: [], sent: [], at: 0, busy: false, nomig: false, err: '' };
  var POLL_MS = 60000;
  var online = function () { return !!GATE_USER && !GATE_OFFLINE && navigator.onLine !== false; };
  var guard = function () { return (appSettings.guardName || '') + ' (' + (appSettings.shiftName || '') + ')'; };
  var fmt = function (iso) { try { return iso ? formatDateTimeShort(iso) : '-'; } catch (e) { return String(iso || '-'); } };

  /* ── server ───────────────────────────────────────────────────────── */
  async function loadIncoming(force) {
    if (INC.busy || !online()) { paintBadges(); return INC; }
    if (!force && Date.now() - INC.at < 15000) return INC;
    INC.busy = true;
    var r = await gateRpc('gate_incoming', { p_gate: GATE_ID });
    INC.busy = false; INC.at = Date.now();
    if (!r.ok) { INC.nomig = r.error === 'NO_MIGRATION'; INC.err = r.error; paintBadges(); return INC; }
    INC.nomig = false; INC.err = '';
    // a row this phone has just taken in (not synced yet) is not offered again
    var taken = {}; gateEntries.forEach(function (e) { if (e.linkUid) taken[e.linkUid] = 1; });
    INC.rows = (r.data.rows || []).filter(function (x) { return !taken[x.uid]; });
    INC.sent = r.data.sent || [];
    paintBadges();
    return INC;
  }
  function paintBadges() {
    var t = INC.rows.filter(function (x) { return x.kind === 'TRANSFER'; }).length, v = INC.rows.filter(function (x) { return x.kind === 'VISITOR'; }).length;
    var tb = $('glTransferBadge'), vb = $('glVisitorBadge');
    if (tb) { tb.textContent = t ? t + ' ARRIVING' : ''; tb.classList.toggle('hidden', !t); }
    if (vb) { vb.textContent = v; vb.classList.toggle('hidden', !v); }
    document.querySelectorAll('[data-gl-other-unit]').forEach(function (el) { el.textContent = GATE_OTHER_UNIT; });
    if (SHEET && SHEET.repaint) SHEET.repaint();
  }

  /* ── sheet (own overlay, same look as the gate's sheets) ──────────── */
  var SHEET = null;
  function openSheet(title, repaint) {
    closeSheet();
    var el = document.createElement('div');
    el.className = 'fixed inset-0 z-[60] flex items-end sm:items-center justify-center';
    el.innerHTML = '<div class="absolute inset-0 bg-black/40 backdrop-blur-sm" data-gl-x="1"></div>'
      + '<div class="bg-white rounded-t-[28px] sm:rounded-[28px] w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden relative z-10 shadow-2xl ios-sheet">'
      + '<div class="px-5 py-3.5 border-b border-gray-100 shrink-0 flex items-center justify-between gap-3">'
      + '<button type="button" data-gl-back="1" class="ios-btn hidden text-blue-600 text-sm font-semibold"><i class="fa-solid fa-chevron-left"></i> Back</button>'
      + '<h3 class="text-base font-bold text-gray-900 truncate" data-gl-title="1"></h3>'
      + '<button type="button" data-gl-x="1" class="ios-btn w-7 h-7 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs"><i class="fa-solid fa-xmark"></i></button></div>'
      + '<div class="p-5 overflow-y-auto space-y-3" data-gl-body="1"></div></div>';
    document.body.appendChild(el);
    SHEET = { el: el, body: el.querySelector('[data-gl-body]'), repaint: repaint || null, back: null };
    el.querySelector('[data-gl-title]').textContent = title;
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-gl-x]')) return closeSheet();
      if (e.target.closest('[data-gl-back]') && SHEET && SHEET.back) return SHEET.back();
    });
    return SHEET;
  }
  function setTitle(t, back) {
    if (!SHEET) return;
    SHEET.el.querySelector('[data-gl-title]').textContent = t;
    SHEET.back = back || null;
    SHEET.el.querySelector('[data-gl-back]').classList.toggle('hidden', !back);
  }
  function closeSheet() { if (SHEET) { SHEET.el.remove(); SHEET = null; } }
  var note = function (txt, tone) {
    var c = tone === 'bad' ? 'bg-red-50 border-red-200 text-red-700' : tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800';
    return '<p class="text-[11px] font-bold border rounded-xl px-3 py-2 ' + c + '">' + esc(txt) + '</p>';
  };
  function stateNote() {
    if (!online()) return note('No internet: what the other gate sent cannot be seen now. It shows when the net is back.');
    if (INC.nomig) return note('The server needs sql/GATE1_UNIT1_MIGRATION.sql (Admin: run it in the Supabase SQL Editor).', 'bad');
    if (INC.err) return note('Could not read the other gate: ' + INC.err, 'bad');
    return '';
  }
  // a photo of an entry of the OTHER gate (not on this phone): fetched once
  var PH = {};
  async function otherPhoto(uid, field) {
    if (PH[uid] === undefined) {
      PH[uid] = null;
      var r = await gateRpc('gate_entry_photos_get', { p_uid: uid });
      PH[uid] = r.ok ? (r.data.photos || {}) : {};
    }
    while (PH[uid] === null) await new Promise(function (ok) { setTimeout(ok, 120); });
    return (PH[uid] || {})[field] || null;
  }
  function photoInput(id, label, capture) {
    return '<div><label class="block text-[11px] font-bold text-gray-400 uppercase mb-1">' + esc(label) + ' *</label>'
      + '<label class="ios-btn flex items-center justify-center gap-2 p-3 bg-purple-50/70 border-2 border-dashed border-purple-200 rounded-2xl cursor-pointer text-center">'
      + '<i class="fa-solid fa-camera text-purple-600"></i><span data-gl-ph-lb="' + id + '" class="text-xs font-bold text-purple-800 truncate">Tap to capture</span>'
      + '<input type="file" data-up="gate-link-' + id + '" data-gl-ph="' + id + '" accept="image/*" capture="' + (capture || 'environment') + '" class="hidden"></label>'
      + '<img data-gl-ph-img="' + id + '" class="hidden mt-2 w-full h-28 object-cover rounded-xl border border-purple-200" alt=""></div>';
  }
  function wirePhotos(store) {
    SHEET.body.querySelectorAll('[data-gl-ph]').forEach(function (inp) {
      inp.addEventListener('change', async function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        var id = inp.getAttribute('data-gl-ph'), lb = SHEET.body.querySelector('[data-gl-ph-lb="' + id + '"]'), im = SHEET.body.querySelector('[data-gl-ph-img="' + id + '"]');
        lb.textContent = 'Compressing...';
        try { store[id] = await compressImageFile(f); lb.textContent = '✓ Photo ready'; im.src = store[id]; im.classList.remove('hidden'); }
        catch (e) { lb.textContent = 'Photo failed, try again'; }
      });
    });
  }
  var field = function (id, label, ph, extra) {
    return '<div><label class="block text-[11px] font-bold text-gray-400 uppercase mb-1">' + label + '</label>'
      + '<input type="text" id="' + id + '" ' + (extra || '') + ' placeholder="' + esc(ph || '') + '" autocomplete="off" class="w-full px-3.5 py-3 bg-gray-100/80 border border-gray-200/80 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white"></div>';
  };
  var btn = function (attr, label, cls) { return '<button type="button" ' + attr + ' class="ios-btn w-full ' + (cls || 'bg-purple-600 text-white') + ' font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 text-sm">' + label + '</button>'; };

  /* ── 1. UNIT TRANSFER ─────────────────────────────────────────────── */
  function openTransfer() {
    openSheet('Unit Transfer', function () { if (SHEET && SHEET.view === 'menu') transferMenu(); });
    transferMenu();
    loadIncoming(true);
  }
  function transferMenu() {
    if (!SHEET) return;
    SHEET.view = 'menu'; setTitle('Unit Transfer · ' + GATE_UNIT);
    var arr = INC.rows.filter(function (x) { return x.kind === 'TRANSFER'; });
    var sent = INC.sent.filter(function (x) { return x.kind === 'TRANSFER'; });
    var card = function (act, icon, color, t, s, n) {
      return '<button type="button" data-gl-go="' + act + '" class="ios-btn w-full flex items-center gap-3.5 p-4 bg-' + color + '-500/10 border border-' + color + '-500/20 rounded-[20px] text-left">'
        + '<div class="w-12 h-12 rounded-2xl bg-' + color + '-600 text-white flex items-center justify-center text-xl shrink-0"><i class="fa-solid ' + icon + '"></i></div>'
        + '<div class="min-w-0 flex-1"><span class="block text-[13px] font-extrabold text-' + color + '-800 uppercase tracking-wide">' + esc(t) + '</span>'
        + '<span class="block text-[11px] font-semibold text-' + color + '-700/80">' + esc(s) + '</span></div>'
        + (n ? '<span class="min-w-[24px] h-6 px-2 rounded-full bg-' + color + '-600 text-white text-[11px] font-extrabold flex items-center justify-center">' + n + '</span>' : '')
        + '<i class="fa-solid fa-chevron-right text-' + color + '-500 text-xs"></i></button>';
    };
    SHEET.body.innerHTML = stateNote()
      + card('send', 'fa-truck-arrow-right', 'purple', 'Send to ' + GATE_OTHER_UNIT, 'Against a Store Gate Pass No.: Outward No., item photo', 0)
      + card('arriving', 'fa-truck-ramp-box', 'emerald', 'Arriving from ' + GATE_OTHER_UNIT, arr.length ? arr.length + ' sent by ' + GATE_OTHER_NAME + ', not received yet' : 'Nothing on the way', arr.length)
      + card('sent', 'fa-list-check', 'blue', 'Sent (7 days)', sent.length ? sent.filter(function (x) { return x.receivedId; }).length + ' of ' + sent.length + ' received by ' + GATE_OTHER_NAME : 'Nothing sent', 0);
    SHEET.body.querySelectorAll('[data-gl-go]').forEach(function (b) {
      b.addEventListener('click', function () { var g = b.getAttribute('data-gl-go'); if (g === 'send') { closeSheet(); gateOpenTransferOut(); } else if (g === 'arriving') arrivingList('TRANSFER'); else sentList(); });
    });
  }
  function rowCard(x, act, label) {
    var d = x.data || {}, isV = x.kind === 'VISITOR';
    return '<div class="rounded-2xl border border-gray-200 bg-white p-3 space-y-2.5">'
      + '<div class="flex items-start gap-3"><div class="w-14 h-14 rounded-xl bg-gray-100 shrink-0 overflow-hidden" data-gl-thumb="' + esc(x.uid) + '" data-gl-field="' + (isV ? 'visitorPhoto' : 'itemPhoto') + '"></div>'
      + '<div class="min-w-0 flex-1"><div class="flex items-center justify-between gap-2"><span class="text-[13px] font-extrabold text-gray-900 truncate">' + esc(isV ? d.name : d.items || d.purpose) + '</span>'
      + '<span class="text-[9.5px] font-extrabold px-2 py-0.5 rounded-full uppercase bg-purple-100 text-purple-800">' + esc(d.id || '') + '</span></div>'
      + '<p class="text-[11px] font-semibold text-gray-500 truncate">' + esc(isV ? [d.mobile, d.vehicle && d.vehicle !== 'N/A' ? d.vehicle : ''].filter(Boolean).join(' · ') : [d.vehicle, d.qty ? 'Qty ' + d.qty : '', d.driver].filter(Boolean).join(' · ')) + '</p>'
      + '<p class="text-[11px] font-semibold text-gray-600 truncate">' + esc(isV ? 'Met: ' + (d.host || '-') + ' · ' + String(d.purpose || '').split('•')[0].trim() : (d.transferRef ? 'Ref ' + d.transferRef + ' · ' : '') + (d.remarks || '')) + '</p>'
      + '<p class="text-[11px] font-semibold text-gray-500">Sent ' + esc(fmt(d.outTime || x.updatedAt)) + ' by ' + esc(d.outGuard || d.guard || '-') + '</p></div></div>'
      + (act ? btn('data-gl-act="' + esc(x.uid) + '"', label, 'bg-emerald-600 text-white') : '') + '</div>';
  }
  function fillThumbs() {
    if (!SHEET) return;
    SHEET.body.querySelectorAll('[data-gl-thumb]').forEach(async function (box) {
      var src = await otherPhoto(box.getAttribute('data-gl-thumb'), box.getAttribute('data-gl-field'));
      if (src && box.isConnected) box.innerHTML = '<img src="' + src + '" class="w-full h-full object-cover" alt="">';
    });
  }
  function arrivingList(kind) {
    SHEET.view = 'arriving-' + kind;
    setTitle(kind === 'VISITOR' ? 'Visitors from ' + GATE_OTHER_UNIT : 'Arriving from ' + GATE_OTHER_UNIT, kind === 'VISITOR' ? null : transferMenu);
    SHEET.repaint = function () { if (SHEET && SHEET.view === 'arriving-' + kind) arrivingList(kind); };
    var rows = INC.rows.filter(function (x) { return x.kind === kind; });
    SHEET.body.innerHTML = stateNote()
      + (rows.length ? rows.map(function (x) { return rowCard(x, true, kind === 'VISITOR' ? '<i class="fa-solid fa-user-check"></i> Take In (already approved)' : '<i class="fa-solid fa-truck-ramp-box"></i> Receive'); }).join('')
        : '<p class="text-center text-xs font-semibold text-gray-400 py-10">' + (kind === 'VISITOR' ? 'No visitor is on the way from ' : 'Nothing is on the way from ') + esc(GATE_OTHER_UNIT) + '.</p>')
      + btn('data-gl-refresh="1"', '<i class="fa-solid fa-rotate"></i> Check again', 'bg-gray-100 text-gray-700');
    SHEET.body.querySelector('[data-gl-refresh]').addEventListener('click', function () { loadIncoming(true); });
    SHEET.body.querySelectorAll('[data-gl-act]').forEach(function (b) {
      b.addEventListener('click', function () { var x = INC.rows.find(function (r) { return r.uid === b.getAttribute('data-gl-act'); }); if (x) (kind === 'VISITOR' ? takeVisitor(x) : receiveForm(x)); });
    });
    fillThumbs();
  }
  function receiveForm(x) {
    var d = x.data || {};
    SHEET.view = 'receive'; setTitle('Receive ' + (d.id || ''), function () { arrivingList('TRANSFER'); });
    var ph = {};
    SHEET.body.innerHTML = rowCard(x, false)
      + '<div><label class="block text-[11px] font-bold text-gray-400 uppercase mb-1">Inward No <span class="normal-case text-emerald-600">· Auto</span></label>'
      + '<input id="glRcNo" readonly tabindex="-1" placeholder="Getting next no..." class="w-full px-3.5 py-3 bg-gray-100 border border-gray-200 rounded-xl text-sm font-mono font-bold text-gray-900 cursor-not-allowed"></div>'
      + photoInput('veh', 'Vehicle / Material Photo at Arrival')
      + field('glRcRemarks', 'Remarks', 'e.g. All 40 rolls received')
      + btn('data-gl-save="1"', '<i class="fa-solid fa-check"></i> Receive In at ' + esc(GATE_UNIT), 'bg-emerald-600 text-white');
    wirePhotos(ph);
    fillThumbs();
    gateNextNo('IN', false).then(function (r) { var b = $('glRcNo'); if (b) b.value = r.no; });
    var saving = false;
    SHEET.body.querySelector('[data-gl-save]').addEventListener('click', async function () {
      if (saving) return;
      if (!ph.veh) return showIosBanner('Take the photo at arrival', 'error');
      saving = true;
      var no; try { no = await gateTakeNo('IN', 'glRcNo'); } finally { saving = false; }
      if (!no) return showIosBanner('Could not make the Inward No. Check the internet and try again', 'error');
      var rem = $('glRcRemarks').value.trim(), now = new Date().toISOString();
      var e = {
        id: no, category: 'TRANSFER IN', fromGate: x.gate, linkUid: x.uid, linkId: d.id,
        name: 'From ' + GATE_OTHER_UNIT, mobile: d.driver || d.mobile || '-', vehicle: d.vehicle || 'N/A',
        host: 'Transfer from ' + GATE_OTHER_UNIT + ' | Out ' + (d.id || '-') + (d.transferRef ? ' | Ref: ' + d.transferRef : ''),
        purpose: (d.items || '') + (d.qty ? ' • Qty ' + d.qty : '') + ' • Received' + (rem ? ' • ' + rem : ''),
        items: d.items, qty: d.qty, transferRef: d.transferRef, remarks: rem,
        vehiclePhoto: ph.veh, guard: guard(), inTime: now, outTime: null, status: 'IN'
      };
      commitEntry(e);
      INC.rows = INC.rows.filter(function (r) { return r.uid !== x.uid; });
      paintBadges(); closeSheet();
      showIosBanner('Received ' + (d.id || '') + ' as ' + no + ' · the vehicle is inside; Mark Out from its pass when it leaves', 'success');
      try { openPassModal(e.id); } catch (er) {}
    });
  }
  function sentList() {
    SHEET.view = 'sent'; setTitle('Sent to ' + GATE_OTHER_UNIT + ' (7 days)', transferMenu);
    var rows = INC.sent;
    SHEET.body.innerHTML = stateNote() + (rows.length ? rows.map(function (s) {
      var ok = !!s.receivedId;
      return '<div class="flex items-center gap-3 rounded-2xl border ' + (ok ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50') + ' px-3 py-2.5">'
        + '<div class="min-w-0 flex-1"><p class="text-[13px] font-extrabold text-gray-900 truncate">' + esc(s.id) + ' · ' + esc(s.kind === 'VISITOR' ? 'Visitor ' + (s.name || '') : (s.vehicle || '')) + '</p>'
        + '<p class="text-[11px] font-semibold text-gray-500">Sent ' + esc(fmt(s.at)) + (ok ? ' · received as ' + esc(s.receivedId) + ' ' + esc(fmt(s.receivedAt)) + (s.receivedBy ? ' by ' + esc(s.receivedBy) : '') : '') + '</p></div>'
        + '<span class="text-[9.5px] font-extrabold px-2 py-0.5 rounded-full uppercase whitespace-nowrap ' + (ok ? 'bg-emerald-100 text-emerald-800">Received' : 'bg-amber-100 text-amber-800">On the way') + '</span></div>';
    }).join('') : '<p class="text-center text-xs font-semibold text-gray-400 py-10">Nothing sent in the last 7 days.</p>');
  }

  /* ── 2. VISITOR MOVING UNITS ──────────────────────────────────────── */
  async function moveVisitor(id) {
    var e = gateEntries.find(function (x) { return x.id === id; });
    if (!e || e.status !== 'IN') return;
    var ok = window.IosDialog && IosDialog.choose
      ? (await IosDialog.choose('Send ' + (e.name || 'the visitor') + ' to ' + GATE_OTHER_UNIT + '? The visitor goes out here and ' + GATE_OTHER_NAME + ' takes them in without a new approval.', [{ label: 'Send to ' + GATE_OTHER_UNIT, value: 1, bold: true }, { label: 'Cancel', cancel: true }])) === 1
      : window.confirm('Send ' + (e.name || 'the visitor') + ' to ' + GATE_OTHER_UNIT + '?');
    if (!ok) return;
    e.moveTo = GATE_OTHER;
    e.status = 'OUT';
    e.outTime = new Date().toISOString();
    e.outRemarks = 'Moved to ' + GATE_OTHER_UNIT;
    e.outGuard = guard();
    touchEntry(e);
    try { visRefreshUi(); } catch (x) {}
    showIosBanner((e.name || 'Visitor') + ' sent to ' + GATE_OTHER_UNIT + ': ' + GATE_OTHER_NAME + ' sees them under Arriving From', 'success');
  }
  function openIncoming(kind) {
    openSheet(kind === 'VISITOR' ? 'Visitors from ' + GATE_OTHER_UNIT : 'Arriving');
    arrivingList(kind);
    loadIncoming(true);
  }
  async function takeVisitor(x) {
    var d = x.data || {};
    var photo = await otherPhoto(x.uid, 'visitorPhoto');
    var now = new Date().toISOString();
    var e = {
      id: genGateId('VIS-'), category: 'VISITOR', name: d.name, mobile: d.mobile, vehicle: d.vehicle || 'N/A',
      host: d.host, hostUserId: d.hostUserId || null, hostEmpCode: d.hostEmpCode || null, hostDept: d.hostDept || null,
      purpose: String(d.purpose || '').split('•')[0].trim() + ' • Moved from ' + GATE_OTHER_UNIT + ' (' + (d.id || '') + ')',
      visitorPhoto: photo || null, guard: guard(), inTime: now, outTime: null, status: 'IN',
      // approved at the other unit: no new approval here; the original entry keeps it
      needApproval: false, movedFrom: x.gate, linkUid: x.uid, linkId: d.id
    };
    commitEntry(e);
    INC.rows = INC.rows.filter(function (r) { return r.uid !== x.uid; });
    paintBadges(); closeSheet();
    try { visRefreshUi(); } catch (er) {}
    showIosBanner((d.name || 'Visitor') + ' taken in as ' + e.id + ' (Existing Visitor)', 'success');
  }

  /* ── 3. VEHICLE CROSS-CHECK ───────────────────────────────────────── */
  var VC = {}, VC_MS = 30000;
  async function vehicleInside(v) {
    var k = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (k.length < 4 || !online()) return [];
    if (VC[k] && Date.now() - VC[k].at < VC_MS) return VC[k].rows;
    var r = await gateRpc('gate_vehicle_inside', { p_gate: GATE_ID, p_vehicle: v });
    var rows = r.ok ? (r.data.rows || []) : [];
    VC[k] = { at: Date.now(), rows: rows };
    return rows;
  }
  function watchVehicle(inputId) {
    var inp = $(inputId); if (!inp || inp.dataset.glWatch) return;
    inp.dataset.glWatch = '1';
    var t = 0;
    var run = async function () {
      var v = inp.value.trim(), rows = await vehicleInside(v);
      if (inp.value.trim() !== v) return;
      var w = $(inputId + '_glWarn');
      if (!w) { w = document.createElement('p'); w.id = inputId + '_glWarn'; w.className = 'hidden text-[10.5px] font-bold text-red-600 mt-1 leading-snug'; (inp.parentElement && inp.parentElement.classList.contains('relative') ? inp.parentElement : inp).insertAdjacentElement('afterend', w); }
      var x = rows[0];
      w.textContent = x ? 'Vehicle ' + v.toUpperCase() + ' is still INSIDE ' + GATE_OTHER_UNIT + ': ' + x.id + ' (' + String(x.category || '').toLowerCase() + ', since ' + fmt(x.inTime) + '). Ask ' + GATE_OTHER_NAME + ' to mark it Out.' : '';
      w.classList.toggle('hidden', !x);
      if (x && inp.dataset.glSaid !== v) { inp.dataset.glSaid = v; showIosBanner('Vehicle ' + v.toUpperCase() + ' is still inside ' + GATE_OTHER_UNIT + ' (' + x.id + ')', 'error'); }
    };
    var soon = function () { clearTimeout(t); t = setTimeout(run, 700); };
    inp.addEventListener('input', soon); inp.addEventListener('change', soon); inp.addEventListener('blur', soon);
  }
  ['inVehicle', 'vehicleNo', 'dkVehicleNo', 'hydraVehicleNo', 'outTrVehicle'].forEach(watchVehicle);

  /* ── start ────────────────────────────────────────────────────────── */
  paintBadges();
  setTimeout(function () { loadIncoming(true); }, 4000);
  setInterval(function () { if (document.visibilityState !== 'hidden') loadIncoming(true); }, POLL_MS);
  window.addEventListener('online', function () { setTimeout(function () { loadIncoming(true); }, 1500); });

  window.GateLink = { openTransfer: openTransfer, openIncoming: openIncoming, moveVisitor: moveVisitor, watchVehicle: watchVehicle, refresh: function () { return loadIncoming(true); } };
})();
