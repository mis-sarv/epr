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
   2. PEOPLE MOVING UNITS (visitors and employees, Visitor menu › Go to / Arriving From)
      Visitor menu › "Go to Unit-x" (openGoTo: every visitor inside here, Send, and
      the ones sent in 7 days with Received / On the way) or Existing Visitor ›
      "To Unit-x": the visitor goes out here (moveTo) without
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
  var POLL_MS = (window.sarvSyncMs ? sarvSyncMs('gate_link', 5000) : 5000);   // what the other gate sent: SYNC SPEED, default 5 s
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
    var t = INC.rows.filter(function (x) { return x.kind === 'TRANSFER'; }).length, v = INC.rows.filter(function (x) { return x.kind === 'VISITOR' || x.kind === 'EMPLOYEE'; }).length;
    var tb = $('glTransferBadge'), vb = $('glVisitorBadge');
    if (tb) { tb.textContent = t ? t + ' ARRIVING' : ''; tb.classList.toggle('hidden', !t); }
    if (vb) { vb.textContent = v; vb.classList.toggle('hidden', !v); }
    var gb = $('glGoBadge'), gi = gateEntries.filter(function (e) { return isVisInside(e) || (e.category === 'EMPLOYEE' && e.status === 'IN'); }).length;
    if (gb) { gb.textContent = gi; gb.classList.toggle('hidden', !gi); }
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
    var d = x.data || {}, isE = x.kind === 'EMPLOYEE', isV = x.kind === 'VISITOR' || isE;
    var line2 = isE ? [d.empCode, d.dept, d.vehicle && d.vehicle !== 'N/A' ? d.vehicle : ''] : isV ? [d.mobile, d.vehicle && d.vehicle !== 'N/A' ? d.vehicle : ''] : [d.vehicle, d.qty ? 'Qty ' + d.qty : '', d.driver];
    var line3 = isE ? 'Work: ' + String(d.purpose || '-').split('•')[0].trim() : isV ? 'Met: ' + (d.host || '-') + ' · ' + String(d.purpose || '').split('•')[0].trim() : (d.transferRef ? 'Ref ' + d.transferRef + ' · ' : '') + (d.remarks || '');
    return '<div class="rounded-2xl border border-gray-200 bg-white p-3 space-y-2.5">'
      + '<div class="flex items-start gap-3"><div class="w-14 h-14 rounded-xl bg-gray-100 shrink-0 overflow-hidden" data-gl-thumb="' + esc(x.uid) + '" data-gl-field="' + (isV ? 'visitorPhoto' : 'itemPhoto') + '"></div>'
      + '<div class="min-w-0 flex-1"><div class="flex items-center justify-between gap-2"><span class="text-[13px] font-extrabold text-gray-900 truncate">' + esc(isV ? d.name : d.items || d.purpose) + '</span>'
      + '<span class="text-[9.5px] font-extrabold px-2 py-0.5 rounded-full uppercase ' + (isE ? 'bg-sky-100 text-sky-800' : 'bg-purple-100 text-purple-800') + '">' + esc(d.id || '') + '</span></div>'
      + '<p class="text-[11px] font-semibold text-gray-500 truncate">' + esc(line2.filter(Boolean).join(' · ')) + '</p>'
      + '<p class="text-[11px] font-semibold text-gray-600 truncate">' + esc(line3) + '</p>'
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
    var people = kind === 'VISITOR' || kind === 'EMPLOYEE';
    SHEET.view = 'arriving-' + kind;
    setTitle(people ? 'Arriving from ' + GATE_OTHER_UNIT : 'Arriving from ' + GATE_OTHER_UNIT, people ? null : transferMenu);
    SHEET.repaint = function () { if (SHEET && SHEET.view === 'arriving-' + kind) arrivingList(kind); };
    var rows = INC.rows.filter(function (x) { return x.kind === kind; });
    var cnt = function (k) { return INC.rows.filter(function (x) { return x.kind === k; }).length; };
    var label = kind === 'VISITOR' ? '<i class="fa-solid fa-user-check"></i> Take In (already approved)'
      : kind === 'EMPLOYEE' ? '<i class="fa-solid fa-id-badge"></i> Take In' : '<i class="fa-solid fa-truck-ramp-box"></i> Receive';
    SHEET.body.innerHTML = (people ? whoTabs(kind, { VISITOR: cnt('VISITOR'), EMPLOYEE: cnt('EMPLOYEE') }) : '') + stateNote()
      + (rows.length ? rows.map(function (x) { return rowCard(x, true, label); }).join('')
        : '<p class="text-center text-xs font-semibold text-gray-400 py-10">' + (kind === 'VISITOR' ? 'No visitor is on the way from ' : kind === 'EMPLOYEE' ? 'No employee is on the way from ' : 'Nothing is on the way from ') + esc(GATE_OTHER_UNIT) + '.</p>')
      + btn('data-gl-refresh="1"', '<i class="fa-solid fa-rotate"></i> Check again', 'bg-gray-100 text-gray-700');
    if (people) wireTabs(function (k) { arrivingList(k); });
    SHEET.body.querySelector('[data-gl-refresh]').addEventListener('click', function () { loadIncoming(true); });
    SHEET.body.querySelectorAll('[data-gl-act]').forEach(function (b) {
      b.addEventListener('click', function () { var x = INC.rows.find(function (r) { return r.uid === b.getAttribute('data-gl-act'); }); if (x) (kind === 'VISITOR' ? takeVisitor(x) : kind === 'EMPLOYEE' ? takeEmployee(x) : receiveForm(x)); });
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

  /* ── 2. PEOPLE MOVING UNITS (visitors and employees) ───────────────
     Visitor menu › Go to <other unit> and › Arriving From <other unit>, each with a Visitors / Employees switch.
     VISITOR   a visitor inside here (isVisInside) is sent; the other gate takes them in without a new approval.
     EMPLOYEE  an employee (Employee Master, gate_masters.hosts) goes to the other unit: photo, work, vehicle ->
               entry EMPLOYEE, status OUT, moveTo = the other gate; there "Take In" makes an EMPLOYEE entry, IN,
               linkUid = the sent one. An employee taken in here is listed under Go to › Employees with
               "Back to <other unit>" (the same move again) and "Out" (left the premises). gate_incoming kind EMPLOYEE. */
  var isEmpIn = function (e) { return !!e && e.category === 'EMPLOYEE' && e.status === 'IN'; };
  function whoTabs(cur, counts) {
    return '<div class="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl">' + ['VISITOR', 'EMPLOYEE'].map(function (k) {
      return '<button type="button" data-gl-who="' + k + '" class="ios-btn py-1.5 rounded-lg text-xs font-bold ' + (k === cur ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500') + '">'
        + (k === 'VISITOR' ? 'Visitors' : 'Employees') + (counts[k] ? ' (' + counts[k] + ')' : '') + '</button>';
    }).join('') + '</div>';
  }
  function wireTabs(fn) {
    SHEET.body.querySelectorAll('[data-gl-who]').forEach(function (b) {
      b.addEventListener('click', function () { SHEET.who = b.getAttribute('data-gl-who'); fn(SHEET.who); });
    });
  }
  async function ask(msg, yes) {
    return window.IosDialog && IosDialog.choose
      ? (await IosDialog.choose(msg, [{ label: yes, value: 1, bold: true }, { label: 'Cancel', cancel: true }])) === 1
      : window.confirm(msg);
  }
  function afterMove() {
    try { visRefreshUi(); } catch (x) {}
    paintBadges();
    if (SHEET && SHEET.view === 'goto') goToList();
    loadIncoming(true);
  }
  // out here, on the way to the other unit (a visitor, or an employee already inside here)
  function moveOut(e) {
    e.moveTo = GATE_OTHER;
    e.status = 'OUT';
    e.outTime = new Date().toISOString();
    e.outRemarks = 'Moved to ' + GATE_OTHER_UNIT;
    e.outGuard = guard();
    touchEntry(e);
  }
  async function moveVisitor(id) {
    var e = gateEntries.find(function (x) { return x.id === id; });
    if (!e || e.status !== 'IN') return;
    if (!(await ask('Send ' + (e.name || 'the visitor') + ' to ' + GATE_OTHER_UNIT + '? The visitor goes out here and ' + GATE_OTHER_NAME + ' takes them in without a new approval.', 'Send to ' + GATE_OTHER_UNIT))) return;
    moveOut(e);
    showIosBanner((e.name || 'Visitor') + ' sent to ' + GATE_OTHER_UNIT + ': ' + GATE_OTHER_NAME + ' sees them under Arriving From', 'success');
    afterMove();
  }
  async function moveEmployee(id) {
    var e = gateEntries.find(function (x) { return x.id === id; });
    if (!isEmpIn(e)) return;
    if (!(await ask('Send ' + (e.name || 'the employee') + ' back to ' + GATE_OTHER_UNIT + '?', 'Send to ' + GATE_OTHER_UNIT))) return;
    moveOut(e);
    showIosBanner((e.name || 'Employee') + ' sent to ' + GATE_OTHER_UNIT + ': ' + GATE_OTHER_NAME + ' sees them under Arriving From › Employees', 'success');
    afterMove();
  }
  async function employeeOut(id) {
    var e = gateEntries.find(function (x) { return x.id === id; });
    if (!isEmpIn(e)) return;
    if (!(await ask('Mark ' + (e.name || 'the employee') + ' OUT of ' + GATE_UNIT + ' (left the premises, not going to ' + GATE_OTHER_UNIT + ')?', 'Mark Out'))) return;
    e.status = 'OUT';
    e.outTime = new Date().toISOString();
    e.outRemarks = 'Out from ' + GATE_NAME;
    e.outGuard = guard();
    touchEntry(e);
    showIosBanner((e.name || 'Employee') + ' marked out of ' + GATE_UNIT, 'success');
    afterMove();
  }
  function openGoTo(who) {
    openSheet('Go to ' + GATE_OTHER_UNIT, function () { if (SHEET && SHEET.view === 'goto') goToList(true); });
    SHEET.who = who || 'VISITOR';
    goToList();
    loadIncoming(true);
  }
  function sentRows(kind, none) {
    var sent = INC.sent.filter(function (x) { return x.kind === kind; });
    return '<p class="text-[11px] font-bold text-gray-400 uppercase pt-2">Sent to ' + esc(GATE_OTHER_UNIT) + ' · 7 days</p>'
      + (online() ? '' : note('No internet: whether ' + GATE_OTHER_NAME + ' took them in shows when the net is back.'))
      + (sent.length ? sent.map(function (s) {
          var ok = !!s.receivedId;
          return '<div class="flex items-center gap-3 rounded-2xl border ' + (ok ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50') + ' px-3 py-2.5">'
            + '<div class="min-w-0 flex-1"><p class="text-[13px] font-extrabold text-gray-900 truncate">' + esc(s.name || '-') + ' <span class="text-[10px] font-bold text-gray-400">' + esc(s.id) + '</span></p>'
            + '<p class="text-[11px] font-semibold text-gray-500">Sent ' + esc(fmt(s.at)) + (ok ? ' · in at ' + esc(GATE_OTHER_UNIT) + ' as ' + esc(s.receivedId) + ' ' + esc(fmt(s.receivedAt)) : '') + '</p></div>'
            + '<span class="text-[9.5px] font-extrabold px-2 py-0.5 rounded-full uppercase whitespace-nowrap ' + (ok ? 'bg-emerald-100 text-emerald-800">Reached' : 'bg-amber-100 text-amber-800">On the way') + '</span></div>';
        }).join('') : '<p class="text-center text-xs font-semibold text-gray-400 py-4">' + none + '</p>');
  }
  // soft = a repaint (poll / badge): the Employees form keeps what was typed, only its lists are drawn again
  function goToList(soft) {
    if (!SHEET) return;
    SHEET.view = 'goto'; setTitle('Go to ' + GATE_OTHER_UNIT);
    if (SHEET.who === 'EMPLOYEE') return goToEmployees(soft);
    var q = (SHEET.q || '').trim().toUpperCase().split(/\s+/).filter(Boolean);
    var hit = function (e) { var t = [e.id, e.name, e.mobile, e.vehicle, e.host].join(' ').toUpperCase(); return q.every(function (w) { return t.indexOf(w) >= 0; }); };
    var all = gateEntries.filter(isVisInside), inside = all.filter(hit).sort(function (a, b) { return new Date(b.inTime) - new Date(a.inTime); });
    var row = function (e) {
      var ph = photoOf(e, 'visitorPhoto');
      return '<div class="rounded-2xl border border-gray-200 bg-white p-3 flex items-center gap-3">'
        + '<div class="w-12 h-12 rounded-xl bg-gray-100 shrink-0 overflow-hidden">' + (ph ? '<img src="' + ph + '" class="w-full h-full object-cover" alt="">' : '') + '</div>'
        + '<div class="min-w-0 flex-1"><p class="text-[13px] font-extrabold text-gray-900 truncate">' + esc(e.name || '-') + ' <span class="text-[10px] font-bold text-gray-400">' + esc(e.id) + '</span></p>'
        + '<p class="text-[11px] font-semibold text-gray-500 truncate">' + esc([e.mobile, e.vehicle && e.vehicle !== 'N/A' ? e.vehicle : ''].filter(Boolean).join(' · ')) + '</p>'
        + '<p class="text-[11px] font-semibold text-gray-600 truncate">Met: ' + esc(e.host || '-') + ' · in ' + esc(fmt(e.inTime)) + '</p></div>'
        + '<button type="button" data-gl-move="' + esc(e.id) + '" class="ios-btn shrink-0 px-3 py-2 rounded-xl bg-purple-600 text-white text-[11px] font-extrabold flex items-center gap-1"><i class="fa-solid fa-person-walking-arrow-right"></i> Send</button></div>';
    };
    SHEET.body.innerHTML = whoTabs('VISITOR', { VISITOR: all.length, EMPLOYEE: gateEntries.filter(isEmpIn).length })
      + '<input type="text" data-gl-q="1" placeholder="Search name / mobile / pass no..." autocomplete="off" class="w-full px-3.5 py-2.5 bg-gray-100/80 border border-gray-200/80 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white">'
      + '<p class="text-[11px] font-bold text-gray-400 uppercase">Inside ' + esc(GATE_UNIT) + ' · ' + inside.length + '</p>'
      + (inside.length ? inside.map(row).join('') : '<p class="text-center text-xs font-semibold text-gray-400 py-6">' + (q.length ? 'No visitor inside matches.' : 'No visitor is inside ' + esc(GATE_UNIT) + ' now.') + '</p>')
      + sentRows('VISITOR', 'No visitor sent in the last 7 days.');
    wireTabs(function () { goToList(); });
    var qi = SHEET.body.querySelector('[data-gl-q]');
    qi.value = SHEET.q || '';
    qi.addEventListener('input', function () { SHEET.q = qi.value; var at = qi.selectionStart; goToList(); var n = SHEET && SHEET.body.querySelector('[data-gl-q]'); if (n) { n.focus(); try { n.setSelectionRange(at, at); } catch (x) {} } });
    SHEET.body.querySelectorAll('[data-gl-move]').forEach(function (b) {
      b.addEventListener('click', function () { moveVisitor(b.getAttribute('data-gl-move')); });
    });
  }
  // The Employee Master (gate_masters.hosts), else the ERP users of Whom to Meet
  function empOptions() {
    var list = ((typeof GATE_MASTERS === 'object' && GATE_MASTERS && GATE_MASTERS.hosts) || []).map(function (h) { return { name: h.name, emp: h.empCode || '', dept: h.dept || '', desig: h.desig || '' }; });
    if (!list.length) { try { list = visHostOptions().map(function (o) { return { name: o.value, emp: o.emp || '', dept: o.dept || '', desig: '' }; }); } catch (e) {} }
    return list.filter(function (h) { return h.name; });
  }
  function goToEmployees(soft) {
    var body = SHEET.body;
    if (!(soft && body.querySelector('[data-gl-empform]'))) {
      var ph = SHEET.empPh = {};
      SHEET.emp = null;
      body.innerHTML = whoTabs('EMPLOYEE', { VISITOR: gateEntries.filter(isVisInside).length, EMPLOYEE: gateEntries.filter(isEmpIn).length })
        + '<div data-gl-empform="1" class="rounded-2xl border border-sky-200 bg-sky-50/40 p-3 space-y-3">'
        + '<p class="text-[11px] font-bold text-sky-700 uppercase">Send an employee to ' + esc(GATE_OTHER_UNIT) + '</p>'
        + '<div><label class="block text-[11px] font-bold text-gray-400 uppercase mb-1">Employee *</label>'
        + '<div data-gl-empchip="1" class="hidden items-center justify-between gap-2 px-3.5 py-2.5 bg-white border border-sky-300 rounded-xl"></div>'
        + '<div data-gl-empbox="1"><div class="relative">'
        + '<input type="text" data-gl-empq="1" placeholder="Tap to choose from the Employee Master..." autocomplete="off" class="w-full pl-3.5 pr-11 py-3 bg-gray-100/80 border border-gray-200/80 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white">'
        + '<button type="button" data-gl-emptgl="1" aria-label="Show the employee list" class="ios-btn absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg text-sky-700 flex items-center justify-center"><i class="fa-solid fa-chevron-down text-xs"></i></button></div>'
        + '<div data-gl-emplist="1" class="mt-1 max-h-64 overflow-y-auto rounded-xl border border-sky-200 bg-white shadow-sm hidden"></div></div></div>'
        + field('glEmpWork', 'Work / Purpose', 'e.g. Machine repair, meeting, stock check')
        + field('glEmpVehicle', 'Vehicle No', 'Blank = on foot', 'list="gateVehicleList" style="text-transform:uppercase"')
        + photoInput('emp', 'Employee Photo')
        + btn('data-gl-empsend="1"', '<i class="fa-solid fa-person-walking-arrow-right"></i> Send to ' + esc(GATE_OTHER_UNIT), 'bg-sky-600 text-white')
        + '</div><div data-gl-emplists="1" class="space-y-3"></div>';
      wireTabs(function () { goToList(); });
      wirePhotos(ph);
      watchVehicle('glEmpVehicle');
      var qi = body.querySelector('[data-gl-empq]'), lst = body.querySelector('[data-gl-emplist]'), chip = body.querySelector('[data-gl-empchip]');
      /* Employee dropdown: tapping the box (or ▾) opens the WHOLE Employee Master, A-Z, with the count; typing narrows
         it (every word over name / Emp Code / designation / department); a tap on a row chooses it; a tap outside, Esc
         or ▾ again closes it. The list is read when it opens, so lists that arrive later (masters refresh) are used. */
      var opts = [];
      var loadOpts = function () {
        if (!opts.length) opts = empOptions().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
        return opts;
      };
      var open = false;
      var hide = function () { open = false; lst.classList.add('hidden'); };
      var pick = function (o) {
        SHEET.emp = o; hide();
        chip.innerHTML = '<span class="min-w-0"><span class="block text-[13px] font-extrabold text-gray-900 truncate">' + esc(o.name) + '</span><span class="block text-[11px] font-semibold text-gray-500 truncate">' + esc([o.emp, o.desig, o.dept].filter(Boolean).join(' · ')) + '</span></span>'
          + '<button type="button" data-gl-empclear="1" class="ios-btn text-[11px] font-bold text-sky-700 shrink-0">Change</button>';
        chip.classList.remove('hidden'); chip.classList.add('flex'); empBox.classList.add('hidden');
        chip.querySelector('[data-gl-empclear]').addEventListener('click', function () {
          SHEET.emp = null; chip.classList.add('hidden'); chip.classList.remove('flex'); empBox.classList.remove('hidden'); qi.value = ''; qi.focus(); draw();
        });
      };
      var draw = function () {
        var all = loadOpts(), w = qi.value.trim().toUpperCase().split(/\s+/).filter(Boolean);
        var hits = w.length ? all.filter(function (o) { var t = [o.name, o.emp, o.dept, o.desig].join(' ').toUpperCase(); return w.every(function (x) { return t.indexOf(x) >= 0; }); }) : all;
        var head = '<div class="sticky top-0 z-10 px-3 py-1.5 bg-sky-50 border-b border-sky-100 text-[10.5px] font-bold text-sky-800">'
          + (w.length ? hits.length + ' of ' + all.length + ' employees' : all.length + ' employees · type to narrow') + '</div>';
        lst.innerHTML = all.length ? head + (hits.length ? hits.slice(0, 400).map(function (o) {
          return '<button type="button" data-gl-emppick="' + all.indexOf(o) + '" class="w-full text-left px-3 py-2 border-b border-gray-100 last:border-0 hover:bg-sky-50 active:bg-sky-100">'
            + '<span class="block text-[13px] font-bold text-gray-900">' + esc(o.name) + (o.emp ? ' <span class="text-[10px] font-bold text-gray-400">' + esc(o.emp) + '</span>' : '') + '</span>'
            + '<span class="block text-[11px] font-semibold text-gray-500">' + esc([o.desig, o.dept].filter(Boolean).join(' · ') || '-') + '</span></button>';
        }).join('') : '<p class="px-3 py-3 text-xs font-semibold text-gray-400">No employee matches "' + esc(qi.value.trim()) + '".</p>')
          : '<p class="px-3 py-3 text-xs font-semibold text-gray-400">The Employee Master list is not on this phone yet. Refresh the lists with the button at the top while online, then open this again.</p>';
        open = true; lst.classList.remove('hidden');
        lst.querySelectorAll('[data-gl-emppick]').forEach(function (b) {
          b.addEventListener('click', function () { pick(all[+b.getAttribute('data-gl-emppick')]); });
        });
      };
      var empBox = body.querySelector('[data-gl-empbox]');
      qi.addEventListener('focus', draw);
      qi.addEventListener('click', function () { if (!open) draw(); });
      qi.addEventListener('input', draw);
      qi.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') hide();
        else if (ev.key === 'Enter') { ev.preventDefault(); var first = lst.querySelector('[data-gl-emppick]'); if (open && first) first.click(); }
      });
      body.querySelector('[data-gl-emptgl]').addEventListener('click', function () { if (open) hide(); else { draw(); qi.focus(); } });
      // a tap outside the box closes the list (the listener goes away with the sheet)
      var outside = function (ev) {
        if (!empBox.isConnected) return document.removeEventListener('pointerdown', outside, true);
        if (open && !empBox.contains(ev.target)) hide();
      };
      document.addEventListener('pointerdown', outside, true);
      var saving = false;
      body.querySelector('[data-gl-empsend]').addEventListener('click', async function () {
        if (saving) return;
        var o = SHEET.emp;
        if (!o) return showIosBanner('Choose the employee', 'error');
        if (!ph.emp) return showIosBanner('Take the employee photo', 'error');
        // already inside here (came from the other unit): that entry goes back instead of a new one
        var inHere = gateEntries.find(function (e) { return isEmpIn(e) && (o.emp ? e.empCode === o.emp : normKey(e.name) === normKey(o.name)); });
        var work = $('glEmpWork').value.trim(), veh = $('glEmpVehicle').value.trim().toUpperCase();
        if (inHere) {
          if (work) inHere.purpose = work;
          if (veh) inHere.vehicle = veh;
          inHere.visitorPhoto = ph.emp;
          moveOut(inHere);
          showIosBanner(o.name + ' (inside here as ' + inHere.id + ') sent to ' + GATE_OTHER_UNIT, 'success');
          return afterMove();
        }
        saving = true;
        var now = new Date().toISOString();
        var e = {
          id: genGateId('EMP-'), category: 'EMPLOYEE', name: o.name, empCode: o.emp || '', dept: o.dept || '', desig: o.desig || '',
          mobile: o.emp || '-', vehicle: veh || 'N/A',
          host: 'Going to ' + GATE_OTHER_UNIT + (o.dept ? ' | ' + o.dept : ''),
          purpose: work || 'Official work',
          visitorPhoto: ph.emp, guard: guard(), inTime: now, outTime: now, status: 'OUT',
          moveTo: GATE_OTHER, outRemarks: 'Moved to ' + GATE_OTHER_UNIT, outGuard: guard()
        };
        commitEntry(e);
        saving = false;
        showIosBanner(o.name + ' sent to ' + GATE_OTHER_UNIT + ' (' + e.id + '): ' + GATE_OTHER_NAME + ' sees them under Arriving From › Employees', 'success');
        goToEmployees(false);
        afterMove();
      });
    }
    // lists: employees inside here (came from the other unit) + sent in 7 days
    var ins = gateEntries.filter(isEmpIn).sort(function (a, b) { return new Date(b.inTime) - new Date(a.inTime); });
    var box = body.querySelector('[data-gl-emplists]');
    box.innerHTML = '<p class="text-[11px] font-bold text-gray-400 uppercase pt-1">Employees inside ' + esc(GATE_UNIT) + ' (from ' + esc(GATE_OTHER_UNIT) + ') · ' + ins.length + '</p>'
      + (ins.length ? ins.map(function (e) {
          var p = photoOf(e, 'visitorPhoto');
          return '<div class="rounded-2xl border border-gray-200 bg-white p-3 space-y-2"><div class="flex items-center gap-3">'
            + '<div class="w-12 h-12 rounded-xl bg-gray-100 shrink-0 overflow-hidden">' + (p ? '<img src="' + p + '" class="w-full h-full object-cover" alt="">' : '') + '</div>'
            + '<div class="min-w-0 flex-1"><p class="text-[13px] font-extrabold text-gray-900 truncate">' + esc(e.name || '-') + ' <span class="text-[10px] font-bold text-gray-400">' + esc(e.id) + '</span></p>'
            + '<p class="text-[11px] font-semibold text-gray-500 truncate">' + esc([e.empCode, e.dept, e.vehicle && e.vehicle !== 'N/A' ? e.vehicle : ''].filter(Boolean).join(' · ')) + '</p>'
            + '<p class="text-[11px] font-semibold text-gray-600 truncate">' + esc(String(e.purpose || '').split('•')[0].trim()) + ' · in ' + esc(fmt(e.inTime)) + '</p></div></div>'
            + '<div class="flex gap-2"><button type="button" data-gl-empback="' + esc(e.id) + '" class="ios-btn flex-1 py-2 rounded-xl bg-sky-600 text-white text-[11px] font-extrabold"><i class="fa-solid fa-person-walking-arrow-right"></i> Back to ' + esc(GATE_OTHER_UNIT) + '</button>'
            + '<button type="button" data-gl-empout="' + esc(e.id) + '" class="ios-btn flex-1 py-2 rounded-xl bg-gray-100 text-gray-700 text-[11px] font-extrabold"><i class="fa-solid fa-right-from-bracket"></i> Out</button></div></div>';
        }).join('') : '<p class="text-center text-xs font-semibold text-gray-400 py-4">No employee from ' + esc(GATE_OTHER_UNIT) + ' is inside now.</p>')
      + sentRows('EMPLOYEE', 'No employee sent in the last 7 days.');
    box.querySelectorAll('[data-gl-empback]').forEach(function (b) { b.addEventListener('click', function () { moveEmployee(b.getAttribute('data-gl-empback')); }); });
    box.querySelectorAll('[data-gl-empout]').forEach(function (b) { b.addEventListener('click', function () { employeeOut(b.getAttribute('data-gl-empout')); }); });
  }
  function openIncoming(kind) {
    openSheet('Arriving from ' + GATE_OTHER_UNIT);
    if (kind === 'VISITOR' && !INC.rows.some(function (x) { return x.kind === 'VISITOR'; }) && INC.rows.some(function (x) { return x.kind === 'EMPLOYEE'; })) kind = 'EMPLOYEE';
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
  async function takeEmployee(x) {
    var d = x.data || {};
    var photo = await otherPhoto(x.uid, 'visitorPhoto');
    var now = new Date().toISOString();
    var e = {
      id: genGateId('EMP-'), category: 'EMPLOYEE', name: d.name, empCode: d.empCode || '', dept: d.dept || '', desig: d.desig || '',
      mobile: d.mobile || d.empCode || '-', vehicle: d.vehicle || 'N/A',
      host: 'From ' + GATE_OTHER_UNIT + ' | Out ' + (d.id || '-') + (d.dept ? ' | ' + d.dept : ''),
      purpose: String(d.purpose || 'Official work').split('•')[0].trim() + ' • Came from ' + GATE_OTHER_UNIT + ' (' + (d.id || '') + ')',
      visitorPhoto: photo || null, guard: guard(), inTime: now, outTime: null, status: 'IN',
      movedFrom: x.gate, linkUid: x.uid, linkId: d.id
    };
    commitEntry(e);
    INC.rows = INC.rows.filter(function (r) { return r.uid !== x.uid; });
    paintBadges(); closeSheet();
    try { visRefreshUi(); } catch (er) {}
    showIosBanner((d.name || 'Employee') + ' taken in as ' + e.id + ': Go to › Employees has Back / Out for them', 'success');
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
  ['inVehicle', 'vehicleNo', 'dkVehicleNo', 'hydraVehicleNo', 'outTrVehicle'].forEach(watchVehicle);   // + glEmpVehicle when its form opens

  /* ── start ────────────────────────────────────────────────────────── */
  paintBadges();
  setTimeout(function () { loadIncoming(true); }, 4000);
  setInterval(function () { if (document.visibilityState !== 'hidden') loadIncoming(true); }, POLL_MS);
  window.addEventListener('online', function () { setTimeout(function () { loadIncoming(true); }, 1500); });

  window.GateLink = { openTransfer: openTransfer, openIncoming: openIncoming, openGoTo: openGoTo, moveVisitor: moveVisitor, watchVehicle: watchVehicle, refresh: function () { return loadIncoming(true); } };
})();
