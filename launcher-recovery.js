/* ════════════════════════════════════════════════════════════════════
   LAUNCHER: Data Recovery   (launcher.html, uses launcher-lock.css's sheet / button styles)
   ────────────────────────────────────────────────────────────────────
   2026-11-28: the database was restored by mistake to the daily backup of 27-11 10:54 PM, so the whole
   working day of 28-11 is gone from the server. Much of it is still on the devices. This adds a
   "Data Recovery" button (bottom right, on the login card and on the home screen) that sends what THIS
   device kept for the ERP / apps to public.recovery_uploads (sql/RECOVERY_UPLOAD_MIGRATION.sql). Nothing
   goes into the real tables and nothing on the device is changed or deleted; the Admin moves the missing
   records later. Sending again is safe (one upload id per device, the server keeps each piece once).

   The launcher is the right place: it opens on every device at the same web address as the ERP (and
   inside the APK once the OTA bundle has this file), and it does not refresh the ERP list cache or the
   Gate registers, so their copies are still the ones from before the restore.

   What is sent (the same rules as recovery-upload-console.js, keep the two in step):
     - localStorage: every key except login tokens / PINs / passwords / sessions
     - IndexedDB gate1_idb / gate2_idb: only the entries changed after CUT (or still unsent)
     - IndexedDB sarv_list_cache: only Inward / Outward / PO / PR (+ lines) and stock counts, only copies read
       after CUT, and of their rows only those dated after CUT (rows with no date kept)
     - IndexedDB sarvPdfOutbox (ERP PDFs not uploaded yet), sarv_notepad / sarv_notepad_local
   Who may send: a valid ERP login on this device, else the Admin's recovery code (sessions made on 28-11
   were lost in the restore, so many devices need the code). The button goes away after RECOVERY_UNTIL.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.self !== window.top) return;

  var RECOVERY_UNTIL = Date.parse('2026-12-06T00:00:00+05:30');
  var CUT = Date.parse('2026-11-27T22:30:00+05:30');      // the restored backup is of 27-11 10:54 PM
  if (Date.now() > RECOVERY_UNTIL) return;

  var URL = 'https://jdlzgjgxxjkjejkhvdij.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkbHpnamd4eGpramVqa2h2ZGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODUwMDcsImV4cCI6MjEwNTY2MTAwN30.ow4i6e78i-dGoJJh2-N4FX6EQE7f2FRQDgCMJHpxAWk';
  var K_ID = 'sarv_recovery_upload_id', K_DEV = 'sarv_recovery_device', K_LAST = 'sarv_recovery_last';
  var SECRET = /token|pin|passw|secret|session/i;
  var PART = 900000, BATCH_CHARS = 1500000, BATCH_ROWS = 150;
  var LC_TXN = ['inward_entries', 'inward_lines', 'outward_entries', 'outward_lines', 'purchase_orders', 'purchase_order_lines',
                'purchase_requirements', 'purchase_requirement_lines', 'stock_counts'];
  var TIME_RE = /(time|Time|_at|At|date|Date)$/;         // created_at, updated_at, inTime, outTime, decidedAt, date …

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ls = function (k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  var lsSet = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
  var when = function (t) { var d = new Date(t); if (isNaN(d)) return ''; try { return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return d.toString(); } };
  var mb = function (n) { return (n / 1048576).toFixed(n > 10485760 ? 0 : 1) + ' MB'; };
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }

  /* ── reading the device (never makes a database, never changes one) ── */
  function blobUrl(b) { return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { res('[unreadable blob]'); }; fr.readAsDataURL(b); }); }
  async function plain(v, d) {
    if (d > 40 || v == null || typeof v !== 'object') return v;
    if (v instanceof Date) return v.toISOString();
    if (typeof Blob !== 'undefined' && v instanceof Blob) return { __blob: true, type: v.type, size: v.size, dataUrl: await blobUrl(v) };
    if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return { __bytes: true, dataUrl: await blobUrl(new Blob([v])) };
    if (Array.isArray(v)) { var a = []; for (var i = 0; i < v.length; i++) a.push(await plain(v[i], d + 1)); return a; }
    var o = {}; for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = await plain(v[k], d + 1); return o;
  }
  function newest(o) {
    if (!o || typeof o !== 'object') return 0;
    var t = 0;
    for (var k in o) if (TIME_RE.test(k) && typeof o[k] === 'string') { var x = Date.parse(o[k]); if (isFinite(x) && x > t) t = x; }
    return t;
  }
  function openExisting(name) {
    return new Promise(function (res) {
      var made = false, r;
      try { r = indexedDB.open(name); } catch (e) { return res(null); }
      r.onupgradeneeded = function () { made = true; try { r.transaction.abort(); } catch (e) {} };
      r.onsuccess = function () { if (made) { try { r.result.close(); } catch (e) {} res(null); } else res(r.result); };
      r.onerror = function () { res(null); }; r.onblocked = function () { res(null); };
    });
  }
  function readAll(db, st) {
    return new Promise(function (res) {
      try {
        var out = [], c = db.transaction(st, 'readonly').objectStore(st).openCursor();
        c.onsuccess = function () { var cur = c.result; if (!cur) return res(out); out.push({ key: cur.key, value: cur.value }); cur.continue(); };
        c.onerror = function () { res(out); };
      } catch (e) { res([]); }
    });
  }
  // → {pieces: [{store, key, text}], notes: [text]}
  async function collect(step) {
    var pieces = [], notes = [];
    var add = function (store, key, value) { var text = typeof value === 'string' ? value : JSON.stringify(value); if (text != null) pieces.push({ store: store, key: String(key), text: text }); };
    step('Reading this device…');
    var nLs = 0;
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k || SECRET.test(k) || k === K_ID || k === K_LAST) continue;
      add('localStorage', k, localStorage.getItem(k)); nLs++;
    }
    notes.push(nLs + ' saved settings / waiting entries');
    var gates = [['gate2_idb', 'Gate-2'], ['gate1_idb', 'Gate-1']];
    for (var g = 0; g < gates.length; g++) {
      var db = await openExisting(gates[g][0]); if (!db) continue;
      var sts = Array.from(db.objectStoreNames);
      for (var s = 0; s < sts.length; s++) {
        var recs = await readAll(db, sts[s]);
        for (var r = 0; r < recs.length; r++) {
          var v = await plain(recs[r].value, 0);
          if (v && Array.isArray(v.entries)) {
            var keep = v.entries.filter(function (e) { return newest(e) > CUT || e._dirty; });
            notes.push(gates[g][1] + ' register: ' + keep.length + ' of ' + v.entries.length + ' entries after 27-11 10:30 PM');
            if (keep.length) add(gates[g][0] + '/' + sts[s], JSON.stringify(recs[r].key), { at: v.at, entries: keep });
          } else add(gates[g][0] + '/' + sts[s], JSON.stringify(recs[r].key), v);
        }
      }
      db.close();
    }
    var lc = await openExisting('sarv_list_cache');
    if (lc) {
      var lsts = Array.from(lc.objectStoreNames), nRows = 0;
      for (var a = 0; a < lsts.length; a++) {
        var lrecs = await readAll(lc, lsts[a]);
        for (var b = 0; b < lrecs.length; b++) {
          var e = lrecs[b].value;
          if (!e || LC_TXN.indexOf(e.table) < 0 || !(Number(e.at) > CUT) || !Array.isArray(e.rows)) continue;
          var rows = e.rows.filter(function (x) { var t = newest(x); return !t || t > CUT; });
          if (rows.length) { nRows += rows.length; add('sarv_list_cache/' + lsts[a], JSON.stringify(lrecs[b].key), { table: e.table, cols: e.cols, at: e.at, rows: rows }); }
        }
      }
      lc.close();
      notes.push('ERP lists: ' + nRows + ' rows of Inward / Outward / PO / PR after 27-11 10:30 PM');
    }
    var more = [['sarvPdfOutbox', 'ERP PDFs not uploaded yet'], ['sarv_notepad', 'Notepad'], ['sarv_notepad_local', 'Notepad (standalone)']];
    for (var m = 0; m < more.length; m++) {
      var mdb = await openExisting(more[m][0]); if (!mdb) continue;
      var msts = Array.from(mdb.objectStoreNames), n = 0;
      for (var q = 0; q < msts.length; q++) {
        var mrecs = await readAll(mdb, msts[q]);
        for (var z = 0; z < mrecs.length; z++) { add(more[m][0] + '/' + msts[q], JSON.stringify(mrecs[z].key), await plain(mrecs[z].value, 0)); n++; }
      }
      mdb.close();
      if (n) notes.push(more[m][1] + ': ' + n);
    }
    return { pieces: pieces, notes: notes };
  }

  /* ── sending ── */
  function toBatches(pieces) {
    var rows = [];
    pieces.forEach(function (p) {
      var parts = Math.max(1, Math.ceil(p.text.length / PART));
      for (var i = 0; i < parts; i++) rows.push({ store: p.store, key: p.key, part: i + 1, parts: parts, value: p.text.slice(i * PART, (i + 1) * PART) });
    });
    var batches = [], cur = [], size = 0;
    rows.forEach(function (r) {
      if (cur.length && (size + r.value.length > BATCH_CHARS || cur.length >= BATCH_ROWS)) { batches.push(cur); cur = []; size = 0; }
      cur.push(r); size += r.value.length;
    });
    if (cur.length) batches.push(cur);
    return { rows: rows, batches: batches, chars: rows.reduce(function (s, r) { return s + r.value.length; }, 0) };
  }
  // → {ok, via, sent, fresh, failed, error, stop}
  async function send(batches, device, code, progress) {
    var token = ls('sarv_sso_token'), id = ls(K_ID);
    if (!id) { id = uuid(); lsSet(K_ID, id); }
    var out = { ok: true, via: '', sent: 0, fresh: 0, failed: 0, error: '', stop: '' };
    for (var b = 0; b < batches.length; b++) {
      var done = false, last = '';
      for (var t = 1; t <= 3 && !done; t++) {
        try {
          var res = await fetch(URL + '/rest/v1/rpc/recovery_upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON },
            body: JSON.stringify({ p_token: token, p_code: code || '', p_upload_id: id, p_device: device, p_rows: batches[b], p_agent: navigator.userAgent })
          });
          var d = await res.json().catch(function () { return null; });
          if (!res.ok) {
            if (d && (d.code === 'PGRST202' || d.code === '42883')) { out.ok = false; out.stop = 'NO_MIGRATION'; return out; }
            last = (d && (d.message || d.hint)) || ('HTTP ' + res.status);
          } else if (!d || d.success === false) {
            last = (d && (d.message || d.error)) || 'refused';
            if (d && (d.error === 'NOT_ALLOWED' || d.error === 'FULL')) { out.ok = false; out.stop = d.error; out.error = last; return out; }
          } else { done = true; out.via = d.via; out.sent += d.rows; out.fresh += d.new; }
        } catch (e) { last = e.message || String(e); }
        if (!done) await new Promise(function (r) { setTimeout(r, 1500 * t); });
      }
      if (!done) { out.failed += batches[b].length; out.error = last; }
      progress(b + 1, batches.length);
    }
    out.ok = !out.failed;
    return out;
  }

  /* ── look (theme from launcher-lock.css variables) ── */
  var css = document.createElement('style');
  css.textContent =
    '.rc-btn{position:fixed;right:max(14px,env(safe-area-inset-right));bottom:calc(14px + env(safe-area-inset-bottom));z-index:8000;display:flex;align-items:center;gap:7px;'
    + 'height:42px;padding:0 15px 0 12px;border-radius:21px;border:1px solid var(--ls-sep);background:var(--ls-bg);color:var(--ls-txt);font:600 14px var(--ls-font);'
    + 'box-shadow:0 6px 22px rgba(0,0,0,.28);cursor:pointer;transition:transform .2s var(--ls-spring)}'
    + '.rc-btn:active{transform:scale(.95)}.rc-btn svg{color:var(--ls-blue)}.rc-btn .dot{width:8px;height:8px;border-radius:50%;background:var(--ls-green)}'
    + '.rc-btn:focus-visible{outline:2px solid var(--ls-blue);outline-offset:2px}'
    + '.rc-lbl{display:block;font-size:13px;font-weight:600;color:var(--ls-txt2);margin:12px 2px 6px}'
    + '.rc-in{width:100%;box-sizing:border-box;height:46px;border-radius:12px;border:1px solid var(--ls-sep);background:var(--ls-bg2);color:var(--ls-txt);font:500 16px var(--ls-font);padding:0 14px;outline:0}'
    + '.rc-in:focus{border-color:var(--ls-blue)}'
    + '.rc-box{background:var(--ls-bg2);border-radius:14px;padding:11px 13px;font-size:13.5px;line-height:1.45;color:var(--ls-txt);margin-top:12px}'
    + '.rc-box.bad{color:var(--ls-red)}.rc-box.ok{color:var(--ls-green)}.rc-box ul{margin:6px 0 0;padding-left:18px}.rc-box li{margin:2px 0;color:var(--ls-txt2)}'
    + '.rc-bar{height:8px;border-radius:4px;background:var(--ls-fill2);overflow:hidden;margin-top:12px}.rc-bar i{display:block;height:100%;width:0;background:var(--ls-blue);transition:width .3s}'
    + '.rc-link{display:block;text-align:center;margin-top:12px;font-size:13px;color:var(--ls-blue);text-decoration:none}'
    + '@media (max-width:420px){.rc-btn .t{display:none}.rc-btn{padding:0 12px}}';
  document.head.appendChild(css);

  var ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3"/><path d="M17 15v6M14 18l3 3 3-3"/></svg>';

  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'rc-btn'; btn.id = 'rcBtn';
  btn.setAttribute('aria-label', 'Data Recovery: send this device\'s saved data to the server');
  btn.title = 'Data Recovery: send this device\'s saved data to the server';
  function paintBtn() {
    var last = null; try { last = JSON.parse(ls(K_LAST) || 'null'); } catch (e) {}
    btn.innerHTML = ICON + '<span class="t">Data Recovery</span>' + (last && last.ok ? '<span class="dot" title="Sent ' + esc(when(last.at)) + '"></span>' : '');
  }
  paintBtn();
  (document.body ? Promise.resolve() : new Promise(function (r) { document.addEventListener('DOMContentLoaded', r, { once: true }); }))
    .then(function () { document.body.appendChild(btn); });

  /* ── the sheet ── */
  var SH = null, BUSY = false, LAST_CODE = '';   // the code typed, kept for Send again (memory only, never stored)
  function openSheet() {
    closeSheet(true);
    var scrim = document.createElement('div'); scrim.className = 'ls-scrim';
    var sh = document.createElement('div'); sh.className = 'ls-sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-labelledby', 'rcTitle');
    sh.setAttribute('data-no-caps', '1');
    sh.innerHTML = '<div class="ls-grab"></div><div class="rc-body"></div>';
    document.body.appendChild(scrim); document.body.appendChild(sh);
    requestAnimationFrame(function () { requestAnimationFrame(function () { scrim.classList.add('in'); sh.classList.add('in'); }); });
    scrim.addEventListener('click', function () { if (!BUSY) closeSheet(); });
    SH = { scrim: scrim, sh: sh, body: sh.querySelector('.rc-body') };
  }
  function closeSheet(now) {
    var s = SH; if (!s) return; SH = null;
    s.scrim.classList.remove('in'); s.sh.classList.remove('in');
    setTimeout(function () { s.scrim.remove(); s.sh.remove(); }, now ? 0 : 340);
    btn.focus();
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && SH && !BUSY) closeSheet(); });

  function whoName() { var w = $('whoName'); var t = w && w.textContent ? w.textContent.trim() : ''; return t && t !== '—' ? t : ''; }
  function formView(msg, bad) {
    var hasTok = !!ls('sarv_sso_token');
    var last = null; try { last = JSON.parse(ls(K_LAST) || 'null'); } catch (e) {}
    SH.body.innerHTML = '<div class="ls-title" id="rcTitle">Data Recovery</div>'
      + '<p class="ls-sub">Sends what this device saved for the ERP and the apps after 27-11 10:30 PM to the server, so the Admin can put back the data lost in the restore. Nothing on this device is changed.</p>'
      + '<label class="rc-lbl" for="rcDev">Device / person</label>'
      + '<input class="rc-in" id="rcDev" autocomplete="off" placeholder="e.g. STORE-1 PC, GATE-2 PHONE" value="' + esc(ls(K_DEV) || whoName()) + '">'
      + '<label class="rc-lbl" for="rcCode">Recovery code' + (hasTok ? ' <span style="font-weight:500">(only if asked)</span>' : ' <span style="font-weight:500">(from the Admin)</span>') + '</label>'
      + '<input class="rc-in" id="rcCode" type="password" autocomplete="off" value="' + esc(LAST_CODE) + '" placeholder="' + (hasTok ? 'Not needed while you are logged in' : 'Ask the Admin for the code') + '">'
      + (msg ? '<div class="rc-box' + (bad ? ' bad' : '') + '" role="alert">' + esc(msg) + '</div>' : '')
      + (last ? '<div class="rc-box' + (last.ok ? ' ok' : '') + '">Last sent ' + esc(when(last.at)) + ' · ' + esc(last.sent) + ' pieces' + (last.ok ? '' : ' · ' + esc(last.failed) + ' not sent') + '</div>' : '')
      + '<div class="ls-actions"><button type="button" class="ls-btn gray" data-rc="close">Cancel</button><button type="button" class="ls-btn blue" data-rc="send">Send now</button></div>'
      + '<a class="rc-link" href="data-recovery.html">Or download a copy as a file</a>';
    var dev = $('rcDev'); setTimeout(function () { (dev.value ? $('rcCode') : dev).focus(); }, 60);
  }
  function progressView(text, done, total) {
    SH.body.innerHTML = '<div class="ls-title" id="rcTitle">Data Recovery</div>'
      + '<p class="ls-sub" aria-live="polite">' + esc(text) + '</p>'
      + '<div class="rc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + (total || 1) + '" aria-valuenow="' + (done || 0) + '"><i style="width:' + (total ? Math.round(100 * done / total) : 4) + '%"></i></div>'
      + '<p class="ls-hint">Keep this screen open until it finishes.</p>';
  }
  function doneView(r, notes, size) {
    var ok = r.ok;
    SH.body.innerHTML = '<div class="ls-title" id="rcTitle">' + (ok ? 'Sent' : 'Not everything was sent') + '</div>'
      + '<div class="rc-box ' + (ok ? 'ok' : 'bad') + '" role="status">' + (ok
        ? r.sent + ' pieces (' + esc(size) + ') reached the server' + (r.fresh < r.sent ? ', ' + (r.sent - r.fresh) + ' of them were already there' : '') + '. Thank you. The Admin puts back the lost entries.'
        : r.failed + ' pieces could not be sent: ' + esc(r.error || 'no answer') + '. Check the internet and press Send again; what reached the server is kept.') + '</div>'
      + (notes.length ? '<div class="rc-box">What was on this device<ul>' + notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>' : '')
      + '<div class="ls-actions">' + (ok ? '' : '<button type="button" class="ls-btn gray" data-rc="again">Send again</button>') + '<button type="button" class="ls-btn blue" data-rc="close">Done</button></div>';
  }

  async function run() {
    var device = ($('rcDev').value || '').trim(), code = ($('rcCode').value || '').trim();
    LAST_CODE = code;
    if (device.length < 2) { $('rcDev').focus(); return formView('Write the device or your name first, so the Admin knows where the data came from.', true); }
    lsSet(K_DEV, device);
    BUSY = true;
    try {
      progressView('Reading this device…', 0, 0);
      var c = await collect(function (t) { progressView(t, 0, 0); });
      if (!c.pieces.length) { BUSY = false; return formView('Nothing saved on this device for the ERP or the apps.', false); }
      var b = toBatches(c.pieces), size = mb(b.chars);
      progressView('Sending ' + size + '…', 0, b.batches.length);
      var r = await send(b.batches, device, code, function (d, t) { progressView('Sending ' + size + '… ' + d + ' of ' + t, d, t); });
      BUSY = false;
      if (r.stop === 'NO_MIGRATION') return formView('The server is not ready for recovery yet. Admin: run sql/RECOVERY_UPLOAD_MIGRATION.sql, then press Send again.', true);
      if (r.stop === 'NOT_ALLOWED') return formView('The login on this device is not valid any more. Enter the recovery code from the Admin and press Send again.', true);
      if (r.stop === 'FULL') return formView(r.error || 'The recovery table on the server is full. Ask the Admin.', true);
      lsSet(K_LAST, JSON.stringify({ at: Date.now(), ok: r.ok, sent: r.sent, failed: r.failed, via: r.via }));
      paintBtn();
      doneView(r, c.notes, size);
    } catch (e) {
      BUSY = false;
      formView('Stopped: ' + (e && e.message ? e.message : e) + '. Press Send again.', true);
    }
  }

  btn.addEventListener('click', function () { if (SH) return; openSheet(); formView(); });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-rc]'); if (!a || !SH || !SH.sh.contains(a)) return;
    var k = a.getAttribute('data-rc');
    if (k === 'close' && !BUSY) closeSheet();
    else if (k === 'send' && !BUSY) run();
    else if (k === 'again' && !BUSY) { formView(); run(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && SH && !BUSY && e.target && (e.target.id === 'rcDev' || e.target.id === 'rcCode')) { e.preventDefault(); run(); }
  });
})();
