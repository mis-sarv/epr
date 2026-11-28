/* ════════════════════════════════════════════════════════════════════
   RECOVERY UPLOAD — paste into the browser console of a user's device
   ────────────────────────────────────────────────────────────────────
   Sends what this device kept for the ERP / apps to the database table public.recovery_uploads
   (sql/RECOVERY_UPLOAD_MIGRATION.sql must have been run). NOTHING is written into the real ERP tables
   and nothing on the device is changed or deleted; the Admin moves the missing records later.

   HOW:
     1. On the device, open  https://mis-sarv.github.io/epr/data-recovery.html  (the same web address the
        ERP is used from; that page loads no app code, so nothing on the device is refreshed first).
        Do NOT open the ERP / apps before this.
     2. F12 › Console. Chrome may ask to type  allow pasting  first.
     3. Change DEVICE (and CODE if the Admin gave one) in the first lines below, paste the whole
        script, press Enter. It prints what it sends and a summary at the end. Running it again is safe.

   What is sent:
     - localStorage: every key except login tokens / PINs / passwords
     - IndexedDB gate1_idb / gate2_idb (Gate registers): only the entries changed after CUT
     - IndexedDB sarv_list_cache (ERP lists): only Inward / Outward / PO / PR (+ lines) and stock counts,
       only copies read after CUT, and of their rows only those dated after CUT (rows with no date kept)
     - IndexedDB sarvPdfOutbox (ERP PDFs not uploaded yet), sarv_notepad / sarv_notepad_local
     - IndexedDB sarv_offline (APK copy of every read) only with INCLUDE_APK_CACHE = true (big)
   A value bigger than 900 000 characters goes in parts; blobs (PDFs / photos) as data URLs.
   ════════════════════════════════════════════════════════════════════ */
(async () => {
  'use strict';
  // ▼▼▼ CHANGE THESE ▼▼▼
  const DEVICE = 'CHANGE-ME device / person name';       // e.g. 'STORE-1 PC', 'GATE-2 PHONE', 'RAMESH LAPTOP'
  const CODE = '';                                       // the recovery code from the Admin (needed when the login here is no longer valid)
  const CUT = '2026-11-27T22:30:00+05:30';               // send what changed after this (the restored backup is of 27-11 10:54 PM)
  const INCLUDE_APK_CACHE = false;
  // ▲▲▲

  const URL = 'https://jdlzgjgxxjkjejkhvdij.supabase.co';
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkbHpnamd4eGpramVqa2h2ZGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODUwMDcsImV4cCI6MjEwNTY2MTAwN30.ow4i6e78i-dGoJJh2-N4FX6EQE7f2FRQDgCMJHpxAWk';
  const SECRET = /token|pin|passw|secret|session/i;
  const PART = 900000, BATCH_CHARS = 1500000, BATCH_ROWS = 150;
  const LC_TXN = ['inward_entries', 'inward_lines', 'outward_entries', 'outward_lines', 'purchase_orders', 'purchase_order_lines',
                  'purchase_requirements', 'purchase_requirement_lines', 'stock_counts'];
  const cut = Date.parse(CUT);
  const log = (...a) => console.log('%c[recovery]', 'color:#0a84ff;font-weight:700', ...a);
  if (/CHANGE-ME/.test(DEVICE)) return log('Set DEVICE in the first lines of the script first (who / which device).');

  let token = ''; try { token = localStorage.getItem('sarv_sso_token') || ''; } catch (e) {}
  let uploadId = ''; try { uploadId = localStorage.getItem('sarv_recovery_upload_id') || ''; } catch (e) {}
  if (!uploadId) { uploadId = crypto.randomUUID(); try { localStorage.setItem('sarv_recovery_upload_id', uploadId); } catch (e) {} }

  // ── helpers ──
  const blobUrl = b => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res('[unreadable blob]'); fr.readAsDataURL(b); });
  async function plain(v, d) {
    if (d > 40 || v == null || typeof v !== 'object') return v;
    if (v instanceof Date) return v.toISOString();
    if (typeof Blob !== 'undefined' && v instanceof Blob) return { __blob: true, type: v.type, size: v.size, dataUrl: await blobUrl(v) };
    if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return { __bytes: true, dataUrl: await blobUrl(new Blob([v])) };
    if (Array.isArray(v)) { const a = []; for (const x of v) a.push(await plain(x, d + 1)); return a; }
    const o = {}; for (const k of Object.keys(v)) o[k] = await plain(v[k], d + 1); return o;
  }
  // the newest time of a row / entry, from its own date fields (0 = none)
  const TIME_RE = /(time|Time|_at|At|date|Date)$/;   // created_at, updated_at, inTime, outTime, decidedAt, date …
  function newest(o) {
    if (!o || typeof o !== 'object') return 0;
    let t = 0;
    for (const k of Object.keys(o)) if (TIME_RE.test(k) && typeof o[k] === 'string') { const x = Date.parse(o[k]); if (isFinite(x) && x > t) t = x; }
    return t;
  }
  function openExisting(name) {   // never makes a new database
    return new Promise(res => {
      let made = false, r;
      try { r = indexedDB.open(name); } catch (e) { return res(null); }
      r.onupgradeneeded = () => { made = true; try { r.transaction.abort(); } catch (e) {} };
      r.onsuccess = () => { if (made) { try { r.result.close(); } catch (e) {} res(null); } else res(r.result); };
      r.onerror = () => res(null); r.onblocked = () => res(null);
    });
  }
  function readAll(db, st) {
    return new Promise(res => {
      try {
        const out = [], c = db.transaction(st, 'readonly').objectStore(st).openCursor();
        c.onsuccess = () => { const cur = c.result; if (!cur) return res(out); out.push({ key: cur.key, value: cur.value }); cur.continue(); };
        c.onerror = () => res(out);
      } catch (e) { res([]); }
    });
  }

  // ── collect ──
  const pieces = [];   // {store, key, text}
  const add = (store, key, value) => { const text = typeof value === 'string' ? value : JSON.stringify(value); if (text != null) pieces.push({ store, key: String(key), text }); };

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || SECRET.test(k) || k === 'sarv_recovery_upload_id') continue;
    add('localStorage', k, localStorage.getItem(k));
  }

  for (const name of ['gate2_idb', 'gate1_idb']) {
    const db = await openExisting(name); if (!db) continue;
    for (const st of Array.from(db.objectStoreNames)) {
      for (const r of await readAll(db, st)) {
        const v = await plain(r.value, 0);
        if (v && Array.isArray(v.entries)) {
          const keep = v.entries.filter(e => newest(e) > cut || e._dirty);
          log(name, '›', st, ': ' + keep.length + ' of ' + v.entries.length + ' entries changed after the time');
          if (keep.length) add(name + '/' + st, JSON.stringify(r.key), { at: v.at, entries: keep });
        } else add(name + '/' + st, JSON.stringify(r.key), v);
      }
    }
    db.close();
  }

  {
    const db = await openExisting('sarv_list_cache');
    if (db) {
      for (const st of Array.from(db.objectStoreNames)) {
        for (const r of await readAll(db, st)) {
          const e = r.value;
          if (!e || LC_TXN.indexOf(e.table) < 0 || !(Number(e.at) > cut) || !Array.isArray(e.rows)) continue;
          const rows = e.rows.filter(x => { const t = newest(x); return !t || t > cut; });
          log('sarv_list_cache ›', e.table, ': ' + rows.length + ' of ' + e.rows.length + ' rows (read ' + new Date(e.at).toLocaleString() + ')');
          if (rows.length) add('sarv_list_cache/' + st, JSON.stringify(r.key), { table: e.table, cols: e.cols, at: e.at, rows });
        }
      }
      db.close();
    }
  }

  for (const name of ['sarvPdfOutbox', 'sarv_notepad', 'sarv_notepad_local'].concat(INCLUDE_APK_CACHE ? ['sarv_offline'] : [])) {
    const db = await openExisting(name); if (!db) continue;
    for (const st of Array.from(db.objectStoreNames)) {
      const recs = await readAll(db, st);
      if (recs.length) log(name, '›', st, ': ' + recs.length + ' records');
      for (const r of recs) add(name + '/' + st, JSON.stringify(r.key), await plain(r.value, 0));
    }
    db.close();
  }

  // ── cut into parts and batches ──
  const rows = [];
  for (const p of pieces) {
    const parts = Math.max(1, Math.ceil(p.text.length / PART));
    for (let i = 0; i < parts; i++) rows.push({ store: p.store, key: p.key, part: i + 1, parts, value: p.text.slice(i * PART, (i + 1) * PART) });
  }
  const total = rows.reduce((s, r) => s + r.value.length, 0);
  log(pieces.length + ' pieces, ' + rows.length + ' rows, ' + (total / 1048576).toFixed(1) + ' MB to send as upload ' + uploadId);
  if (!rows.length) return log('Nothing to send from this device.');

  const batches = []; let cur = [], size = 0;
  for (const r of rows) {
    if (cur.length && (size + r.value.length > BATCH_CHARS || cur.length >= BATCH_ROWS)) { batches.push(cur); cur = []; size = 0; }
    cur.push(r); size += r.value.length;
  }
  if (cur.length) batches.push(cur);

  // ── send (one batch at a time; a failed batch is tried 3 times) ──
  let sent = 0, fresh = 0, failed = 0, via = '';
  for (let b = 0; b < batches.length; b++) {
    let ok = false, last = '';
    for (let tryNo = 1; tryNo <= 3 && !ok; tryNo++) {
      try {
        const res = await fetch(URL + '/rest/v1/rpc/recovery_upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON },
          body: JSON.stringify({ p_token: token, p_code: CODE, p_upload_id: uploadId, p_device: DEVICE, p_rows: batches[b], p_agent: navigator.userAgent })
        });
        const d = await res.json().catch(() => null);
        if (!res.ok) { last = (d && (d.message || d.hint)) || ('HTTP ' + res.status); if (d && d.code === 'PGRST202') { log('The server has no recovery_upload: the Admin must run sql/RECOVERY_UPLOAD_MIGRATION.sql first.'); return; } continue; }
        if (!d || d.success === false) {
          last = (d && (d.message || d.error)) || 'refused';
          if (d && (d.error === 'NOT_ALLOWED' || d.error === 'FULL')) { log('STOPPED: ' + last + (d.error === 'NOT_ALLOWED' ? ' Put the Admin\'s recovery code in CODE and run again.' : '')); return; }
          continue;
        }
        ok = true; via = d.via; sent += d.rows; fresh += d.new;
      } catch (e) { last = e.message || String(e); await new Promise(r => setTimeout(r, 1500 * tryNo)); }
    }
    if (!ok) { failed += batches[b].length; log('Batch ' + (b + 1) + ' not sent: ' + last); }
    else log('Batch ' + (b + 1) + ' / ' + batches.length + ' sent');
  }
  log('DONE · device "' + DEVICE + '" · upload ' + uploadId + ' · via ' + (via || '-') + ' · ' + sent + ' rows sent (' + fresh + ' new)'
    + (failed ? ' · ' + failed + ' rows NOT sent: run the script again' : ' · nothing left'));
})();
