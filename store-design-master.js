/* store-design-master.js — extracted from Store.html (was the inline
   <script> block at line 22514).
   Loaded as a CLASSIC script, in this order, un-deferred: these blocks
   share one global lexical scope and later ones read const/let declared
   by earlier ones. Do not add type="module" or defer. */
/* ============================================================================
   PRODUCTION › DESIGN MASTER
   ----------------------------------------------------------------------------
   The V18 offline (localStorage) design manager, now on Supabase:

     design_master      - one row per DESIGN NO
     design_matchings   - that design's shades, each with the path of its photo
     bucket sarv-pdfs   - design-images/<DESIGN NO>/<stamp>-<rand>.jpg

   The SOURCE OF TRUTH for a photo is `image_path`, not `image_url`. Wherever
   a src is needed, dmImgSrc() builds the public URL from the path, so old
   photos keep loading even if the project domain changes, and a design
   number leads straight to its whole folder (future design-wise image
   updates will build on this; see dmDesignImages() / dmDesignFolder()).

   To create the tables: run DESIGN_MASTER_MIGRATION.sql (in this folder)
   once in Supabase › SQL Editor.
============================================================================ */
(function(){
  'use strict';

  const DM_BUCKET = 'sarv-pdfs';
  const DM_FOLDER = 'design-images';

  /* The V18 shade list; matching names are chosen from it. */
  const DM_SHADES = [
    "5001 - PEACOCK GREEN","5002 - COFFEE","5003 - BURGUNDY","5004 - DARK PISTA",
    "5005 - MEHENDI","5006 - OLIVE","5007 - BRIGHT CREAM","5008 - SKY GREY",
    "5009 - DARK MOUSE","5010 - IVORY","5011 - LIGHT PISTA","5012 - BISCUIT",
    "5013 - SLATE GREY","5014 - LIGHT MOUSE","5015 - LIGHT CAMEL","5016 - DARK CAMEL",
    "5017 - LIGHT GREY","5018 - ARMY GREEN","5019 - MEDIUM GREY","5020 - PEACOCK BLUE",
    "5021 - ARMY BLUE","5022 - LIGHT PURPLE","5023 - DUSTY ROSE","5024 - ROSE GOLD",
    "5025 - DARK PURPLE","5026 - RUST","5027 - DULL MARRON","5028 - GOLD",
    "5029 - LIGHT BURGUNDY","5030 - BURGUNDY","4001 - ARMY GREEN","4002 - ARMY BLUE",
    "4003 - WINE","4004/104 - LIGHT BURGUNDY","4005 - LIGHT PINK","4006 - CREAM",
    "4007 - PEACOCK BLUE","4008/112 - COFFEE - 4008/112","4009 - DARK PURPLE",
    "4010 - DARK PEACOCK BLUE","4011/118 - BRIGHT PURPLE","4012/109 - GOLD",
    "4013/103 - MARRON","4014/106 - RUST","4015/102 - RED","4016/124 - NAVY",
    "4017 - MENENDI","4018 - GREY","4019 - Z BLACK","4020 - LIGHT PURPLE",
    "4021 - DULL PISTA","4022 - CAMEL","4023 - TURQUISE GREEN","4024 - DARK GREY",
    "4025 - PURPULISH GREY","4026 - DARK PISTA","4027 - PEACOCK GREEN","4028 - LIGHT PISTA",
    "4029 - GEENISH GREY","4030 - RANI","4031 - FOREST GREEN","4032 - DARK LEVENDER",
    "4033 - DARK MOUSE"
  ];

  /* ── state ──────────────────────────────────────────────────────────── */
  let dmDesigns = [];           // [{…design_master row, matchings:[row,…]}]
  let dmLoaded = false;
  let dmLoadPromise = null;
  let dmBulkRows = [];          // [{rowId, file, previewUrl}]
  let dmCatalogue = [];         // the selection generated last time
  const dmImgCache = new Map(); // url → Promise<{dataUrl,w,h,fmt}|null>
  /* Whether the design_master.design_sku_no column exists, i.e. whether
     DESIGN_SKU_MIGRATION.sql has been run. null = not known yet. The screen
     works the same before the migration: the SKU boxes are shown, but that one
     column is left out of inserts / updates; otherwise the whole save would
     fail (Postgres rejects the entire row for an unknown column). It is first
     found out on load, from whether the first row of dmDesigns has the key. */
  let dmHasSku = null;
  /* Same idea for the PSD columns (psd_path / psd_name / psd_size), i.e.
     whether DESIGN_PSD_MIGRATION.sql has been run. null = not known yet. */
  let dmHasPsd = null;
  /* Same idea for design_matchings.matching_sku_no (the SKU No of ONE
     matching / shade), i.e. whether DESIGN_MATCHING_SKU_MIGRATION.sql has
     been run. null = not known yet. */
  let dmHasMSku = null;

  /* ── small helpers ─────────────────────────────────────────────────── */
  const q = id => document.getElementById(id);
  const esc = v => (typeof escText === 'function') ? escText(v)
      : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const up = v => String(v == null ? '' : v).trim().toUpperCase();
  const num = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };
  const toast = (m, t) => (typeof showToast === 'function') ? showToast(m, t || 'success') : console.log('[DM]', m);
  const totalFrames = d => num(d.large_frame) + num(d.medium_frame) + num(d.small_frame);
  const masterOf = d => (d.matchings || []).find(m => m.matching_type === 'MASTER') || (d.matchings || [])[0] || null;

  function whoAmI(){
    try {
      if (typeof sarvCurrentUser !== 'undefined' && sarvCurrentUser && sarvCurrentUser.name) return sarvCurrentUser.name;
      if (typeof sarvCurrentRole !== 'undefined' && sarvCurrentRole) {
        return (typeof SARV_ROLE_LABEL !== 'undefined' && SARV_ROLE_LABEL[sarvCurrentRole]) || sarvCurrentRole;
      }
    } catch (e) {}
    return '';
  }
  /* Feature Access matrix (Admin Panel). Before login, or if the function is
     missing, nothing is blocked; otherwise the same rules as the rest of the app. */
  function can(key){
    try { return (typeof sarvCan !== 'function') || !sarvCurrentRole || sarvCan(key); }
    catch (e) { return true; }
  }
  function guard(key){
    if (can(key)) return true;
    if (typeof sarvDeny === 'function') sarvDeny(key);
    return false;
  }
  function setSync(text, kind){
    const el = q('dmSyncStatus'); if (!el) return;
    el.textContent = text;
    el.className = 'dm-sync' + (kind ? ' ' + kind : '');
  }
  function sbReady(){
    if (typeof SB_READY !== 'undefined' && SB_READY && typeof SB !== 'undefined' && SB) return true;
    setSync('Supabase setup pending', 'err');
    toast('Supabase is not connected. Design Master cannot save or load.', 'error');
    return false;
  }

  /* ── Storage: the path is the source of truth ───────────────────────── */
  /* Makes a DESIGN NO safe as a folder name. A name like "4004/104" used to
     create nested folders because of the slash, so every such character
     becomes '-': one design = one folder. */
  function pathSafe(v){
    return up(v).replace(/[^A-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'NA';
  }
  function dmPublicUrl(path){
    if (!path) return '';
    try { const r = SB.storage.from(DM_BUCKET).getPublicUrl(path); return (r && r.data && r.data.publicUrl) || ''; }
    catch (e) { return ''; }
  }
  /* The <img src> for any matching row. Built from image_path; falls back to
     image_url only when there is no path. */
  function dmImgSrc(m){
    if (!m) return '';
    return (m.image_path ? dmPublicUrl(m.image_path) : '') || m.image_url || '';
  }

  /* Resize before upload: 1500px on the long side, JPEG 85%. Enough for both
     screen and A4 PDF, and a 6 MB phone photo becomes about 250 KB. */
  function compressImage(file, maxSide, quality){
    maxSide = maxSide || 1500; quality = quality || 0.85;
    return new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);   // so PNG transparency doesn't turn black in the JPEG
          ctx.drawImage(img, 0, 0, w, h);
          c.toBlob(b => { URL.revokeObjectURL(url); resolve(b || file); }, 'image/jpeg', quality);
        } catch (e) { URL.revokeObjectURL(url); resolve(file); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  // opt = { folder, maxSide, quality }: Add Photoshoot uses its own folder and a larger size.
  async function uploadDesignImage(designNo, file, opt){
    opt = opt || {};
    const blob = await compressImage(file, opt.maxSide, opt.quality);
    const path = (opt.folder || DM_FOLDER) + '/' + pathSafe(designNo) + '/' +
                 Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
    const res = await SB.storage.from(DM_BUCKET).upload(path, blob, {
      upsert: true, contentType: 'image/jpeg', cacheControl: '31536000'
    });
    if (res.error) throw res.error;
    return { path: path, url: dmPublicUrl(path) };
  }

  /* Remove the old file so no junk is left in the bucket after a replace. A
     failure is ignored: the row's new path has already been saved. */
  async function removeStored(path){
    if (!path) return;
    try { await SB.storage.from(DM_BUCKET).remove([path]); }
    catch (e) { console.warn('[DM] could not delete the old image:', path, e.message || e); }
  }

  /* ── PSD (Photoshop source file) ─────────────────────────────────────
     One .psd per design, in the same public bucket but its own folder:
     design-psd/<DESIGN NO>/<stamp>-<file name>.psd. Uploaded exactly as it
     is (no compression, unlike the photos), so the download is the original
     file. Required on Create New; optional on Edit, because old designs have
     no PSD and that must not block editing the rest of the record. */
  const DM_PSD_FOLDER = 'design-psd';
  const isPsd = f => !!f && /\.psd$/i.test(f.name || '');
  const fmtSize = b => {
    const n = Number(b) || 0;
    return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  };
  async function uploadDesignPsd(designNo, file){
    const base = String(file.name || 'design.psd').replace(/\.psd$/i, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'design';
    const path = DM_PSD_FOLDER + '/' + pathSafe(designNo) + '/' + Date.now() + '-' + base + '.psd';
    const res = await SB.storage.from(DM_BUCKET).upload(path, file, {
      upsert: true, contentType: 'image/vnd.adobe.photoshop', cacheControl: '31536000'
    });
    if (res.error) throw res.error;
    return { psd_path: path, psd_name: file.name || (base + '.psd'), psd_size: file.size || null };
  }
  /* Download link: the `download` option makes Storage send the file as an
     attachment under its original name, so the browser saves it straight
     away instead of trying to open a 200 MB PSD. */
  function dmPsdUrl(d){
    if (!d || !d.psd_path) return '';
    try {
      const r = SB.storage.from(DM_BUCKET).getPublicUrl(d.psd_path, { download: d.psd_name || (pathSafe(d.design_no) + '.psd') });
      return (r && r.data && r.data.publicUrl) || '';
    } catch (e) { return ''; }
  }
  /* Download PSD asks WHERE to save first (the system Save As window, i.e.
     the file manager) and then writes the file straight into that place.

     Why not a plain link: store-core.js has a global click handler that
     treats every link into the sarv-pdfs bucket as a stored PDF and opens it
     in a new "Preparing PDF…" tab, which is what used to happen here. A link
     WITH a `download` attribute is left alone by that handler, so the
     fallback below (browsers without the Save As API, e.g. Firefox / phones)
     always sets one.

     showSaveFilePicker() must be called inside the click itself (before any
     await), else the browser refuses it as not coming from the user. The
     file is streamed into the chosen file chunk by chunk, so even a 200 MB
     PSD is never held in memory whole, and the progress shows in the sync
     badge. */
  const dmPsdBusy = new Set();
  async function downloadPsd(id){
    const d = dmDesigns.find(x => x.id === id);
    const url = dmPsdUrl(d);
    if (!url) { toast('No PSD file on design ' + (d ? d.design_no : '') + '. Add it via Edit.', 'warn'); return; }
    if (dmPsdBusy.has(id)) { toast('This PSD is already being saved.', 'warn'); return; }
    let name = String(d.psd_name || (pathSafe(d.design_no) + '.psd'));
    if (!/\.psd$/i.test(name)) name += '.psd';

    let handle = null;
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: 'Photoshop file (.psd)', accept: { 'image/vnd.adobe.photoshop': ['.psd'] } }]
        });
      } catch (e) {
        if (e && e.name === 'AbortError') return;   // the user closed the Save As window
        console.warn('[DM] Save As window not available, plain download instead:', e.message || e);
        handle = null;
      }
    }
    if (!handle) { psdPlainDownload(url, name); return; }

    dmPsdBusy.add(id);
    let w = null;
    try {
      setSync('Saving PSD…', 'busy');
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
      const total = Number(res.headers.get('content-length')) || Number(d.psd_size) || 0;
      w = await handle.createWritable();
      const reader = res.body.getReader();
      let got = 0, shown = -1;
      for (;;) {
        const step = await reader.read();
        if (step.done) break;
        await w.write(step.value);
        got += step.value.length;
        const pct = total ? Math.min(99, Math.floor(got * 100 / total)) : -1;
        if (pct !== shown) { shown = pct; setSync('Saving PSD ' + (pct >= 0 ? pct + '%' : fmtSize(got)), 'busy'); }
      }
      await w.close(); w = null;
      setSync('✓ PSD saved', 'ok');
      toast('PSD of ' + d.design_no + ' saved as ' + (handle.name || name) + ' (' + fmtSize(got) + ').', 'success');
    } catch (e) {
      console.error('[DM] PSD save fail:', e);
      if (w) { try { await w.abort(); } catch (_) {} }
      // Don't leave an empty / half file behind where the user chose to save.
      try { if (typeof handle.remove === 'function') await handle.remove(); } catch (_) {}
      setSync('PSD save fail', 'err');
      toast('Could not save the PSD there (' + (e.message || e) + '). Downloading it normally instead.', 'warn');
      psdPlainDownload(url, name);
    } finally {
      dmPsdBusy.delete(id);
    }
  }
  // The `download` attribute keeps store-core's stored-PDF click handler away
  // (see above); the ?download= in the URL makes Storage send it as a file.
  function psdPlainDownload(url, name){
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  // Before the migration the PSD keys are dropped, like skuPatch.
  function psdPatch(p){ return (dmHasPsd === false || !p) ? {} : p; }
  let dmPsdWarned = false;
  function dmPsdNotice(){
    if (dmHasPsd !== false || dmPsdWarned) return;
    dmPsdWarned = true;
    toast('The PSD file will not be linked to the design. Run DESIGN_PSD_MIGRATION.sql in the Supabase SQL Editor first.', 'warn');
  }
  // Shows the chosen file's name / size under a PSD button.
  function psdPicked(input, labelId){
    const el = q(labelId); if (!el) return;
    const f = (input.files || [])[0];
    if (!f) { el.textContent = el.getAttribute('data-empty') || ''; el.classList.remove('bad'); return; }
    el.textContent = f.name + ' · ' + fmtSize(f.size) + (isPsd(f) ? '' : '  (not a .psd file)');
    el.classList.toggle('bad', !isPsd(f));
  }

  /* ── image → dataURL (for jsPDF): fetched once, then cached ────────── */
  function imgData(url){
    if (!url) return Promise.resolve(null);
    if (dmImgCache.has(url)) return dmImgCache.get(url);
    const p = (async () => {
      try {
        const r = await fetch(url, { cache: 'force-cache' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const blob = await r.blob();
        const dataUrl = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.onerror = () => rej(fr.error);
          fr.readAsDataURL(blob);
        });
        const size = await new Promise(res => {
          const i = new Image();
          i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
          i.onerror = () => res(null);
          i.src = dataUrl;
        });
        return {
          dataUrl: dataUrl,
          w: size ? size.w : 1,
          h: size ? size.h : 1,
          fmt: /^data:image\/png/i.test(dataUrl) ? 'PNG' : 'JPEG'
        };
      } catch (e) {
        console.warn('[DM] image load fail:', url, e.message || e);
        return null;
      }
    })();
    dmImgCache.set(url, p);
    return p;
  }

  /* ════════════════════════════════════════════════════════════════════
     LOAD
  ════════════════════════════════════════════════════════════════════ */
  async function loadDesigns(force){
    if (!sbReady()) return [];
    if (dmLoadPromise) return dmLoadPromise;
    if (dmLoaded && !force) return dmDesigns;
    setSync('Loading…', 'busy');
    dmLoadPromise = (async () => {
      const [masters, matchings] = await Promise.all([
        fetchAllRows('design_master', '*', 'design_no'),
        fetchAllRows('design_matchings', '*', 'id')
      ]);
      const index = new Map();
      (masters || []).forEach(d => { d.matchings = []; index.set(d.id, d); });
      (matchings || []).forEach(m => { const d = index.get(m.design_id); if (d) d.matchings.push(m); });
      // MASTER first, then sort_order, then id; the catalogue follows this order.
      index.forEach(d => d.matchings.sort((a, b) =>
        (a.matching_type === 'MASTER' ? 0 : 1) - (b.matching_type === 'MASTER' ? 0 : 1) ||
        (num(a.sort_order) - num(b.sort_order)) || (a.id - b.id)));
      // Newest entry at the top (as in V18).
      return (masters || []).slice().sort((a, b) =>
        String(b.created_at || '').localeCompare(String(a.created_at || '')) || (b.id - a.id));
    })();
    try {
      dmDesigns = await dmLoadPromise;
      dmLoaded = true;
      /* `select *` returns the columns that REALLY exist in the table, so
         whether the first row has the key is the answer. With no designs at
         all it stays null and is found out on the first save (skuPatch
         handles both cases). */
      if (dmDesigns.length) dmHasSku = Object.prototype.hasOwnProperty.call(dmDesigns[0], 'design_sku_no');
      if (dmDesigns.length) dmHasPsd = Object.prototype.hasOwnProperty.call(dmDesigns[0], 'psd_path');
      const anyM = (dmDesigns.find(d => (d.matchings || []).length) || { matchings: [] }).matchings[0];
      if (anyM) dmHasMSku = Object.prototype.hasOwnProperty.call(anyM, 'matching_sku_no');
      setSync('✓ ' + dmDesigns.length + ' designs', 'ok');
      dmSkuNotice();
      dmPsdNotice();
      dmMSkuNotice();
      renderAll();
      if (force) toast('Design Master refreshed: ' + dmDesigns.length + ' designs.', 'success');
    } catch (e) {
      console.error('[DM] load fail:', e);
      setSync('Load fail', 'err');
      const missing = /does not exist|schema cache|Could not find the table/i.test(e.message || '');
      toast(missing
        ? 'design_master table not found. Run DESIGN_MASTER_MIGRATION.sql in the Supabase SQL Editor first.'
        : 'Design Master load fail: ' + (e.message || e), 'error');
    } finally {
      dmLoadPromise = null;
    }
    return dmDesigns;
  }

  function findByNo(no){
    const n = up(no);
    return dmDesigns.find(d => up(d.design_no) === n) || null;
  }
  /* ── DESIGN SKU NO ───────────────────────────────────────────────────
     The Design No identifies the design; the SKU No is how it is sold and
     stocked. Two different things, so two different columns.

     skuPatch() is the one place that decides whether this column goes into
     an insert / update. Before the migration the key is dropped; otherwise
     Postgres would reject the whole row and the design would not save. All
     three save paths (Create New, Bulk row, Edit) go through it, so all
     three behave the same way. */
  function skuPatch(v){
    if (dmHasSku === false) return {};
    return { design_sku_no: up(v) || null };
  }
  // If the migration has not been run, this is said plainly once; otherwise a
  // filled-in SKU box would silently fail to save.
  let dmSkuWarned = false;
  function dmSkuNotice(){
    if (dmHasSku !== false || dmSkuWarned) return;
    dmSkuWarned = true;
    toast('The Design SKU No will not be saved. Run DESIGN_SKU_MIGRATION.sql in the Supabase SQL Editor first.', 'warn');
  }
  /* Is this SKU already on ANOTHER design? Not a block, just a question: it
     catches typos, but deliberately putting one SKU on two designs is still
     possible (no UNIQUE constraint in the database; the reason is written in
     DESIGN_SKU_MIGRATION.sql). `exceptId` skips the design currently being
     edited. */
  function skuClash(v, exceptId){
    const s = up(v); if (!s) return null;
    return dmDesigns.find(d => d.id !== exceptId && up(d.design_sku_no) === s) || null;
  }
  function skuOkToSave(v, exceptId){
    const hit = skuClash(v, exceptId);
    if (!hit) return true;
    return confirm('SKU No ' + up(v) + ' is already on design ' + hit.design_no + '.\n\n'
      + 'Save anyway?');
  }
  /* Every design_master write goes through here (Create New, Bulk row, Edit).
     Reason: Postgres rejects the WHOLE row for an unknown column, and on an
     empty database there was no row to look at during load, so dmHasSku
     stays null. In that case the first save finds out by itself: on a column
     error design_sku_no is removed and the request is sent again (it is also
     removed from the payload, so the caller's local mirror doesn't keep a
     value that never reached the database), and every later save follows
     that decision. */
  async function dmWriteDesign(run, payload){
    let r = await run(payload);
    if (r.error && /design_sku_no/i.test(r.error.message || '') && ('design_sku_no' in payload)) {
      dmHasSku = false; dmSkuWarned = false; dmSkuNotice();
      delete payload.design_sku_no;
      r = await run(payload);
    }
    // The PSD columns the same way (DESIGN_PSD_MIGRATION.sql not run yet).
    if (r.error && /psd_(path|name|size)/i.test(r.error.message || '') && ('psd_path' in payload)) {
      dmHasPsd = false; dmPsdWarned = false; dmPsdNotice();
      delete payload.psd_path; delete payload.psd_name; delete payload.psd_size;
      r = await run(payload);
    }
    return r;
  }

  /* ── MATCHING SKU NO ─────────────────────────────────────────────────
     Each matching (shade) of a design can carry its own SKU No: that is
     what is actually packed and dispatched (Matching SKU tab / Dispatch
     Order PDF). Optional, nullable, not UNIQUE, same as the design SKU; a
     duplicate is only asked about. Before DESIGN_MATCHING_SKU_MIGRATION.sql
     the key is dropped from writes (Postgres would reject the whole row),
     and the app says so once. */
  function mskuPatch(v){
    if (dmHasMSku === false) return {};
    return { matching_sku_no: up(v) || null };
  }
  let dmMSkuWarned = false;
  function dmMSkuNotice(){
    if (dmHasMSku !== false || dmMSkuWarned) return;
    dmMSkuWarned = true;
    toast('The Matching SKU No will not be saved. Run DESIGN_MATCHING_SKU_MIGRATION.sql in the Supabase SQL Editor first.', 'warn');
  }
  // The matching (on any design) that already has this SKU, except `exceptId`.
  function mskuClash(v, exceptId){
    const s = up(v); if (!s) return null;
    for (const d of dmDesigns) {
      const m = (d.matchings || []).find(x => x.id !== exceptId && up(x.matching_sku_no) === s);
      if (m) return { d: d, m: m };
    }
    return null;
  }
  // Every design_matchings insert / update that carries the SKU goes through
  // here: on an empty database the column could not be checked during load,
  // so the first write finds out by itself (as dmWriteDesign does).
  async function dmWriteMatching(run, payload){
    let r = await run(payload);
    if (r.error && /matching_sku_no/i.test(r.error.message || '') && ('matching_sku_no' in payload)) {
      dmHasMSku = false; dmMSkuWarned = false; dmMSkuNotice();
      delete payload.matching_sku_no;
      // A SKU-only update has nothing left to send; the caller sees dmHasMSku === false.
      if (!Object.keys(payload).length) return { data: null, error: null };
      r = await run(payload);
    }
    return r;
  }

  /* ════════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════════ */
  function renderAll(){
    renderDatalists();
    renderLive();
    renderDiscarded();
    renderCatalogueFilters();
    const ms = q('dmMatchingSkuPane');
    if (ms && ms.classList.contains('active')) msRender();
  }

  function fillList(id, values){
    const el = q(id); if (!el) return;
    el.innerHTML = values.map(v => '<option value="' + esc(v) + '"></option>').join('');
  }

  /* ── Where the fixed lists come from ─────────────────────────────────
     These lists used to be hardcoded here. They now live in Master Data ›
     Dropdown Master (table sales_dropdowns), where the Admin adds, edits and
     removes them from the frontend. store-core.js's sarvDropdownList()
     returns that list; if the key has no rows, the fallback below is used,
     so before the migration, or with Supabase down, Design Master works
     exactly as it did. */
  const DM_DD_KEY = {
    unit:'erp_designUnit', bed:'erp_designBedSize', quality:'erp_designQuality',
    type:'erp_designType', frame:'erp_designFrameType', mono:'erp_designMonopoly',
    supplier:'erp_designSupplier', shade:'erp_designShade'
  };
  const DM_DD_FALLBACK = {
    unit:['UNIT 1', 'UNIT 2'], bed:['DOUBLE BED', 'SINGLE BED'],
    quality:['MINK', 'SUPER CLOUDY'], type:['FLORAL', 'GEOMETRICAL', 'ABSTRACT', 'LEAVES'],
    frame:['MS ROUND FRAME', 'MS SQUARE FRAME'], mono:['NO', 'YES'],
    supplier:[], shade:DM_SHADES
  };
  function dmFixed(kind){
    const key = DM_DD_KEY[kind];
    if (key) {
      try {
        const l = (typeof sarvDropdownList === 'function') ? sarvDropdownList(key) : null;
        if (l && l.length) return l.slice();
      } catch (e) {}
    }
    return (DM_DD_FALLBACK[kind] || []).slice();
  }

  /* ── What a column's dropdown offers ─────────────────────────────────
     Dropdown Master's fixed list + every value already in the database. One
     function, so the native <datalist> and the Bulk grid's picker can never
     show different lists. It is built from dmDesigns, the in-memory mirror
     of the DB, so a value saved just now appears straight away in the next
     row's dropdown. */
  function dmValues(kind){
    const uniq = key => [...new Set(dmDesigns.map(d => d[key]).filter(Boolean))].sort();
    const merge = (col) =>
      [...new Set(dmFixed(kind).concat(dmDesigns.map(d => d[col]).filter(Boolean)))];
    switch (kind) {
      case 'party':   return uniq('party_name');
      case 'brand':   return uniq('brand_name');
      // SKUs have no fixed list; only those already in the database are
      // suggested, so the same SKU is never written two different ways.
      case 'sku':     return uniq('design_sku_no');
      case 'supplier':return merge('supplier_name');
      case 'unit':    return merge('design_unit');
      case 'bed':     return merge('bed_size');
      case 'quality': return merge('blanket_quality');
      case 'type':    return merge('design_type');
      case 'frame':   return merge('frame_type');
      case 'mono':    return dmFixed('mono');
      // Shade list + shade names already used on some design.
      case 'shade':   return [...new Set(dmFixed('shade').concat(
        dmDesigns.reduce((a, d) => a.concat((d.matchings || []).map(m => m.matching_name)), [])
          .filter(Boolean)))];
      /* Add Photoshoot: the full matching list, the same as Add Matching's
         (shade list + every matching name on any design), so one photo can be
         tagged with any matching. The chosen design's own matchings come
         first, as they are the usual pick. Same name in another case is
         listed once. */
      case 'psmatch': {
        const d = findByNo((q('dmPsDesign') || {}).value);
        const own = d ? (d.matchings || []).map(m => m.matching_name).filter(Boolean) : [];
        const seen = new Set();
        return own.concat(dmValues('shade')).filter(v => { const k = up(v); if (seen.has(k)) return false; seen.add(k); return true; });
      }
      default:        return [];
    }
  }

  function renderDatalists(){
    const live = dmDesigns.filter(d => d.status === 'LIVE');
    fillList('dmShadeList', dmValues('shade'));
    fillList('dmSkuList', dmValues('sku'));
    fillList('dmPartyList', dmValues('party'));
    fillList('dmBrandList', dmValues('brand'));
    fillList('dmSupplierList', dmValues('supplier'));
    fillList('dmUnitList', dmValues('unit'));
    fillList('dmBedSizeList', dmValues('bed'));
    fillList('dmQualityList', dmValues('quality'));
    fillList('dmTypeList', dmValues('type'));
    fillList('dmFrameTypeList', dmValues('frame'));
    fillList('dmMonopolyList', dmValues('mono'));
    const ld = q('dmLiveDesignList');
    if (ld) ld.innerHTML = live.map(d =>
      '<option value="' + esc(d.design_no) + '">' + esc(d.design_no) + ' — ' +
      esc(d.party_name || '') + ' (' + esc(d.brand_name || '') + ')</option>').join('');
  }

  /* ══ DROPDOWN PICKER FOR THE BULK GRID ══════════════════════════════
     The Bulk input boxes used to have only a native <datalist>. A native
     datalist opens only once you start typing (and in some browsers only via
     a tiny arrow), so parties / brands / shades already in the database were
     practically invisible. People typed the same name again, and one typo
     created a new party.

     This is a real dropdown: it opens on focus and on click, shows that
     column's database values, filters as you type, and picks with click /
     ↑↓ / Enter.

     It stays an <input>, not a <select>: an old-data bulk sheet can contain
     a party or shade that isn't in the database yet, and a select would
     refuse it. So close() does NOT clear the typed text
     (makeSearchableSelect does, via sync(), because it has a select behind it).

     The panel reuses store.css's .ss-list / .ss-opt, the same as
     makeSearchableSelect, so dropdowns look the same across the app. */
  const dmPickList_ = (() => {
    let el = null;
    return () => {
      if (!el) {
        el = document.createElement('div');
        el.className = 'ss-list';
        el.hidden = true;
        document.body.appendChild(el);
      }
      return el;
    };
  })();

  function attachPicker(inp, kind){
    if (!inp || inp.dataset.dmPick) return;
    inp.dataset.dmPick = '1';
    inp.setAttribute('autocomplete', 'off');
    /* Remove the native <datalist>. Otherwise Chrome opens its own datalist
       popup as well as this panel: two dropdowns on one box, one on top of
       the other. The values are the same in both (dmValues), so nothing is lost. */
    inp.removeAttribute('list');
    const list = dmPickList_();
    /* `typed` = whether the user has typed anything since it opened. Even if
       the box already has a value ("UNIT 1", "MINK"), the FULL list shows on
       open; otherwise a value added in Dropdown Master would never be seen
       (the native datalist made exactly this mistake). Typing then filters
       the list by that text. */
    let open = false, hl = 0, shown = [], typed = false;

    const place = () => {
      const r = inp.getBoundingClientRect();
      const w = Math.min(Math.max(r.width, 200), innerWidth - 8);
      list.style.width = w + 'px';
      list.style.left = Math.max(4, Math.min(r.left, innerWidth - w - 4)) + 'px';
      const below = innerHeight - r.bottom;
      list.style.top = (below < 200 && r.top > below)
        ? Math.max(4, r.top - 2 - Math.min(list.scrollHeight, 240)) + 'px'
        : (r.bottom + 2) + 'px';
    };
    const render = (snap) => {
      const term = typed ? String(inp.value || '').trim().toLowerCase() : '';
      const all = dmValues(kind);
      shown = term ? all.filter(v => sarvSearchMatch(v, term)) : all;
      // Highlight the value that is in the box when it opens.
      if (snap) {
        const cur = String(inp.value || '').trim().toUpperCase();
        const at = cur ? shown.findIndex(v => String(v).toUpperCase() === cur) : -1;
        if (at >= 0) hl = at;
      }
      hl = Math.min(hl, Math.max(0, shown.length - 1));
      list.innerHTML = shown.length
        ? shown.map((v, i) => '<div class="ss-opt' + (i === hl ? ' hl' : '') +
            '" data-i="' + i + '">' + esc(v) + '</div>').join('')
        // Free text allowed, so an empty list is not an error — it is said as
        // "this will be a new value", which is the thing worth knowing.
        : '<div class="ss-empty">' + (term ? 'Not in the database; a new value will be created' : 'No values yet') + '</div>';
      place();
      const h = list.querySelector('.ss-opt.hl');
      if (h) h.scrollIntoView({ block: 'nearest' });
    };
    const close = () => {
      if (!open) return;
      open = false; list.hidden = true;
      document.removeEventListener('pointerdown', outside, true);
      removeEventListener('scroll', place, true);
      removeEventListener('resize', place);
    };
    const pick = v => {
      inp.value = v;
      // Fired so the row's own listeners (and anything delegated on the table)
      // see the change exactly as if it had been typed.
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    };
    const outside = e => { if (e.target !== inp && !list.contains(e.target)) close(); };
    const openList = () => {
      if (open || inp.disabled || inp.readOnly) return;
      open = true;
      list.onmousedown = e => e.preventDefault();      // keep focus in the box
      list.onclick = e => {
        const d = e.target.closest('.ss-opt');
        if (d) pick(shown[+d.dataset.i]);
      };
      hl = 0; typed = false;
      list.hidden = false;
      render(true);
      document.addEventListener('pointerdown', outside, true);
      addEventListener('scroll', place, true);
      addEventListener('resize', place);
    };

    inp.addEventListener('focus', openList);
    inp.addEventListener('click', openList);
    inp.addEventListener('input', () => { if (!open) openList(); typed = true; hl = 0; render(); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!open) return openList();
        if (shown.length) { hl = (hl + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; render(); }
      } else if (e.key === 'Enter') {
        // Enter picks the highlighted value, but only while the list is open —
        // otherwise it must not swallow the key on a free-text box.
        if (open && shown.length) { e.preventDefault(); pick(shown[hl]); }
      } else if (e.key === 'Escape') {
        if (open) { e.preventDefault(); close(); }
      } else if (e.key === 'Tab') close();
    });
  }
  // Which bulk column reads which list.
  const DM_BULK_PICKERS = [
    ['b-sku', 'sku'],
    ['b-party', 'party'], ['b-brand', 'brand'], ['b-supplier', 'supplier'],
    ['b-unit', 'unit'], ['b-bed', 'bed'],
    ['b-type', 'type'], ['b-mono', 'mono'], ['b-quality', 'quality'],
    ['b-frame', 'frame'], ['b-matching', 'shade'],
  ];
  /* The Create New, Add Matching and Edit popup boxes get the same real
     dropdown, so a value added in Dropdown Master appears in their lists. */
  const DM_FORM_PICKERS = [
    // SKUs have no fixed list; the picker shows only SKUs already in the
    // database, so the same SKU is never written two ways. A new SKU can
    // still be typed freely (it stays an <input>).
    ['dmDesignSkuNo', 'sku'], ['dmEditDesignSkuNo', 'sku'],
    ['dmDesignUnit', 'unit'], ['dmBedSize', 'bed'], ['dmBlanketQuality', 'quality'],
    ['dmDesignType', 'type'], ['dmMonopoly', 'mono'], ['dmFrameType', 'frame'],
    ['dmPartyName', 'party'], ['dmBrandName', 'brand'], ['dmSupplierName', 'supplier'],
    ['dmInitialMatchingName', 'shade'],
    ['dmMatchingBlanketQuality', 'quality'],
    ['dmEditDesignUnit', 'unit'], ['dmEditBedSize', 'bed'], ['dmEditBlanketQuality', 'quality'],
    ['dmEditDesignType', 'type'], ['dmEditMonopoly', 'mono'], ['dmEditFrameType', 'frame'],
    ['dmEditPartyName', 'party'], ['dmEditBrandName', 'brand'], ['dmEditSupplierName', 'supplier'],
  ];

  function thumbHtml(src, alt){
    if (!src) return '<div class="dm-thumb-none">—</div>';
    return '<img class="dm-thumb" loading="lazy" src="' + esc(src) + '" alt="' + esc(alt || '') +
           '" onclick="dmShowLightbox(this.src,this.alt)" onerror="dmImgFail(this)">';
  }
  const monoCell = v => (v === 'YES')
    ? '<span class="dm-badge dm-badge-mono">YES</span>'
    : '<span class="dm-muted">NO</span>';

  /* ══ LIVE TAB: MULTI-SELECT FILTER ON EVERY COLUMN ═════════════════
     Exactly like the Item Master: a ▾ button on each column header that opens
     a panel with that column's values as checkboxes (each with a count), a
     search box, Select All / Clear, and Apply / Remove Filter / Cancel. A row
     shows if it has ANY of the values ticked in a column (OR); different
     columns combine with AND.

     The filters are DEPENDENT: a column's panel shows only the values left
     after ALL the other filters (and the search above) are applied. A value
     that is ticked but no longer in any remaining row stays in the list,
     greyed out; otherwise it could never be unticked.

     The panel works on a draft; the table doesn't change until Apply, so
     Cancel really cancels. Active filters appear as chips under the toolbar,
     each with its own ✖, plus a "Clear All". */
  const DM_LIVE_COLS = [
    { id:'no',     ph:'Design No',       get:d => d.design_no },
    { id:'sku',    ph:'Design SKU No',   get:d => d.design_sku_no || '' },
    { id:'mono',   ph:'Monopoly',        get:d => d.monopoly || 'NO' },
    { id:'type',   ph:'Type',            get:d => d.design_type || '' },
    { id:'party',  ph:'Party',           get:d => d.party_name || '' },
    { id:'brand',  ph:'Brand',           get:d => d.brand_name || '' },
    { id:'supp',   ph:'Supplier',        get:d => d.supplier_name || '' },
    { id:'unit',   ph:'Unit',            get:d => d.design_unit || '' },
    { id:'bed',    ph:'Bed Size',        get:d => d.bed_size || '' },
    { id:'qual',   ph:'Quality',         get:d => d.blanket_quality || '' },
    { id:'frames', ph:'Total Frames',    get:d => String(totalFrames(d)) },
    { id:'mcount', ph:'Shades',          get:d => String((d.matchings || []).length) },
    { id:'master', ph:'Master Matching', get:d => { const m = masterOf(d); return m ? m.matching_name : ''; } },
  ];
  const DM_LF_BLANK = '(Blank)';
  /* Active filters: {colId: Set<value>}. No key for a column = no
     restriction on it. Empty Set = nothing ticked = no rows (the same rule
     as the Item Master). */
  let dmLiveFilters = {};
  let dmLfCol = null, dmLfDraft = null;  // the open panel and its draft state

  const dmLfColDef = id => DM_LIVE_COLS.find(c => c.id === id) || null;
  // A single function produces the value; the option list, the row test and
  // the chips all read it, so they never disagree about "" vs "(Blank)".
  const dmLfKey = (c, d) => String(c.get(d) == null ? '' : c.get(d)).trim() || DM_LF_BLANK;
  const dmLfSort = (a, b) => {
    if (a === DM_LF_BLANK) return 1;
    if (b === DM_LF_BLANK) return -1;
    return String(a).localeCompare(String(b), undefined, { numeric:true, sensitivity:'base' });
  };
  const dmLiveTerm = () => { const b = q('dmLiveSearch'); return up(b ? b.value : ''); };

  // The global search box: same behaviour as before, separate from the filters.
  // Google-style: every word must be found somewhere in the design (store-core.js sarvSearchMatch).
  function dmLiveSearchPass(d, term){
    if (!term) return true;
    return sarvSearchMatch([d.design_no, d.design_sku_no, d.party_name, d.brand_name, d.supplier_name,
            d.design_type, d.design_unit, d.bed_size, d.blanket_quality]
      .concat((d.matchings || []).map(m => m.matching_name)), term);
  }
  /* Whether a design passes all the column filters. The `skip` column is left
     out; that is how the column's own options are worked out. */
  function dmLiveColsPass(d, skip){
    return DM_LIVE_COLS.every(c => {
      if (c.id === skip) return true;
      const f = dmLiveFilters[c.id];
      return !f || f.has(dmLfKey(c, d));
    });
  }
  /* A column's value list: what remains after the OTHER filters + search,
     with a count for each value. */
  function dmLfOptions(colId){
    const c = dmLfColDef(colId); if (!c) return [];
    const term = dmLiveTerm(), counts = new Map();
    dmDesigns.forEach(d => {
      if (d.status !== 'LIVE' || !dmLiveSearchPass(d, term) || !dmLiveColsPass(d, colId)) return;
      const k = dmLfKey(c, d);
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    return [...counts.entries()].map(([value, count]) => ({ value, count }))
      .sort((a, b) => dmLfSort(a.value, b.value));
  }

  function dmLfPanelEl(){
    let p = q('dmLfPanel');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'dmLfPanel';
    // On <body>, not in the <th>: the table is in its own scroll box, which would clip the panel.
    document.body.appendChild(p);
    p.addEventListener('click', e => e.stopPropagation());
    return p;
  }
  function dmLfPlace(anchor){
    const p = q('dmLfPanel'); if (!p) return;
    const r = anchor ? anchor.getBoundingClientRect() : { left:120, top:100, bottom:120 };
    const w = p.offsetWidth || 268, h = p.offsetHeight || 320;
    const left = Math.min(Math.max(8, r.left - 10), Math.max(8, innerWidth - w - 8));
    let top = r.bottom + 4;
    if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 4);
    p.style.left = left + 'px'; p.style.top = top + 'px';
    p.style.visibility = 'visible';
  }

  function dmLiveOpenFilter(ev, colId){
    // Otherwise the click reaches the document and closes the panel immediately.
    if (ev) { ev.stopPropagation(); ev.preventDefault(); }
    const c = dmLfColDef(colId); if (!c) return;
    if (dmLfCol === colId) { dmLfClose(); return; }   // same button again = close
    dmLfCol = colId;
    const cur = dmLiveFilters[colId];
    dmLfDraft = {
      values: cur ? new Set(cur) : null,   // null = sab tick
      search: '',
      options: dmLfOptions(colId),
      anchor: (ev && ev.currentTarget) || q('dmLF-' + colId)
    };
    dmLfRender();
  }

  function dmLfRender(){
    const colId = dmLfCol; if (!colId) return;
    const c = dmLfColDef(colId), p = dmLfPanelEl();
    const opts = dmLfDraft.options || [];
    const present = new Set(opts.map(o => o.value));
    const extra = dmLfDraft.values
      ? [...dmLfDraft.values].filter(v => !present.has(v)).sort(dmLfSort).map(v => ({ value:v, count:0, gone:true }))
      : [];
    const all = opts.concat(extra);
    const term = dmLfDraft.search || '';
    const shown = term ? all.filter(o => sarvSearchMatch(o.value, term)) : all;
    const ticked = v => dmLfDraft.values ? dmLfDraft.values.has(v) : true;
    const LIMIT = 400;
    const clipped = shown.length > LIMIT ? shown.slice(0, LIMIT) : shown;
    const rowsHtml = clipped.length
      ? clipped.map(o =>
          '<label class="imf-opt' + (o.gone ? ' gone' : '') + '">' +
          '<input type="checkbox" data-v="' + esc(o.value) + '"' + (ticked(o.value) ? ' checked' : '') + '>' +
          '<span class="t" title="' + esc(o.value) + '">' + esc(o.value) + '</span>' +
          '<span class="n">' + (o.gone ? '0' : o.count) + '</span></label>').join('')
      : '<div style="color:#94a3b8;padding:6px 2px;">' +
          (term ? 'No values match this search.' : 'No values left in this column after the other filters.') + '</div>';
    const clipNote = shown.length > LIMIT
      ? '<div style="color:#b45309;font-size:10px;padding:4px 2px 0;">Showing the first ' + LIMIT + ' values (of ' +
        shown.length + '). Use the search above to narrow it down.</div>'
      : '';
    p.innerHTML =
      '<div class="imf-head">' + esc(c.ph) +
        '<div class="imf-sub">' + opts.length + ' value(s) &middot; based on the other filters</div></div>' +
      '<div class="imf-body">' +
        '<input type="text" id="dmLfSearch" placeholder="Search values..." value="' + esc(dmLfDraft.search || '') + '">' +
        '<div style="display:flex;justify-content:space-between;margin-top:6px;">' +
          '<button type="button" class="imf-mini" id="dmLfAll">Select All</button>' +
          '<button type="button" class="imf-mini" id="dmLfNone" style="color:#b91c1c;">Clear</button></div>' +
        '<div class="imf-list" id="dmLfList">' + rowsHtml + '</div>' + clipNote +
      '</div>' +
      '<div class="imf-foot">' +
        '<button type="button" class="imf-btn imf-apply" id="dmLfApply">&#10004; Apply</button>' +
        '<button type="button" class="imf-btn imf-remove" id="dmLfRemove">&#10006; Remove Filter</button>' +
        '<button type="button" class="imf-btn imf-cancel" id="dmLfCancel">Cancel</button>' +
      '</div>';
    p.style.visibility = 'hidden';
    p.style.display = 'block';

    // A tick only changes the draft. On the first tick, null ("all") becomes a
    // real Set; otherwise the first untick would clear everything else too.
    q('dmLfList').addEventListener('change', e => {
      const cb = e.target.closest('input[type=checkbox]'); if (!cb) return;
      if (!dmLfDraft.values) dmLfDraft.values = new Set(all.map(o => o.value));
      if (cb.checked) dmLfDraft.values.add(cb.dataset.v); else dmLfDraft.values.delete(cb.dataset.v);
    });
    const s = q('dmLfSearch');
    s.addEventListener('input', () => {
      dmLfDraft.search = s.value;
      const at = s.selectionStart;
      dmLfRender();
      const s2 = q('dmLfSearch'); if (s2) { s2.focus(); try { s2.setSelectionRange(at, at); } catch (e) {} }
    });
    // Select All / Clear act ONLY on the visible values; that is how you pick
    // just a few values after narrowing with search (as in Excel).
    q('dmLfAll').addEventListener('click', () => {
      if (!dmLfDraft.values) dmLfDraft.values = new Set(all.map(o => o.value));
      clipped.forEach(o => dmLfDraft.values.add(o.value));
      if (!term && dmLfDraft.values.size >= all.length) dmLfDraft.values = null;
      dmLfRender();
    });
    q('dmLfNone').addEventListener('click', () => {
      if (!dmLfDraft.values) dmLfDraft.values = new Set(all.map(o => o.value));
      clipped.forEach(o => dmLfDraft.values.delete(o.value));
      dmLfRender();
    });
    q('dmLfApply').addEventListener('click', dmLfApply);
    q('dmLfRemove').addEventListener('click', () => dmLiveRemoveFilter(colId));
    q('dmLfCancel').addEventListener('click', dmLfClose);
    dmLfPlace(dmLfDraft.anchor);
  }

  function dmLfApply(){
    const colId = dmLfCol; if (!colId) return;
    let values = dmLfDraft ? dmLfDraft.values : null;
    // Everything ticked = no filter; stored that way so the badge never misleads.
    if (values) {
      const opts = (dmLfDraft.options || []).map(o => o.value);
      if (opts.length && values.size === opts.length && opts.every(v => values.has(v))) values = null;
    }
    if (values == null) { dmLiveRemoveFilter(colId); return; }
    if (!values.size && typeof showToast === 'function')
      showToast('No value is ticked in this column; filtering like this will leave the list empty', 'warn');
    dmLiveFilters[colId] = new Set(values);
    dmLfClose();
    renderLive();
  }
  function dmLiveRemoveFilter(colId){
    delete dmLiveFilters[colId];
    if (dmLfCol === colId) dmLfClose();
    renderLive();
  }
  function dmLfClose(){
    const p = q('dmLfPanel'); if (p) p.style.display = 'none';
    dmLfCol = null; dmLfDraft = null;
  }
  // A click outside, Escape, resize or a table scroll all close the panel
  // (except scrolling the panel's own list).
  document.addEventListener('click', () => { if (dmLfCol) dmLfClose(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && dmLfCol) dmLfClose(); });
  addEventListener('resize', () => { if (dmLfCol) dmLfClose(); });
  document.addEventListener('scroll', e => {
    if (!dmLfCol) return;
    const p = q('dmLfPanel'), t = e.target;
    if (p && t && t.nodeType === 1 && p.contains(t)) return;
    dmLfClose();
  }, true);

  function dmLfSummary(colId){
    const v = [...(dmLiveFilters[colId] || [])];
    return v.length === 0 ? 'none' : v.length <= 2 ? v.join(', ') : (v.length + ' selected');
  }
  // Header badges + chip bar rebuilt on every render, so they show exactly what is applied.
  function dmLfIndicators(){
    DM_LIVE_COLS.forEach(c => {
      const b = q('dmLF-' + c.id); if (!b) return;
      const on = !!dmLiveFilters[c.id];
      b.classList.toggle('on', on);
      b.innerHTML = on ? '&#9776;' : '&#9662;';
      b.title = on ? (c.ph + ' filter: ' + dmLfSummary(c.id) + '. Click to change or remove') : ('Filter ' + c.ph);
    });
    const bar = q('dmLfChips'); if (!bar) return;
    const cols = DM_LIVE_COLS.filter(c => dmLiveFilters[c.id]);
    if (!cols.length) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
    bar.style.display = 'flex';
    bar.innerHTML = '<span style="font-size:10px;font-weight:800;color:#475569;">FILTERS:</span>' +
      cols.map(c => '<span class="imf-chip">' + esc(c.ph) + ': ' + esc(dmLfSummary(c.id)) +
        '<button type="button" onclick="dmLiveRemoveFilter(\'' + c.id + '\')" title="Remove this column\'s filter">&#10006;</button></span>').join('') +
      '<button type="button" onclick="dmClearLiveFilters()" style="background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;' +
      'border-radius:12px;padding:3px 10px;font-size:10px;font-weight:800;cursor:pointer;">&#10006; Clear All Filters (' + cols.length + ')</button>';
  }

  function dmClearLiveFilters(){
    dmLiveFilters = {};
    dmLfClose();
    const s = q('dmLiveSearch'); if (s) s.value = '';
    renderLive();
  }

  function renderLive(){
    const term = dmLiveTerm();
    const all = dmDesigns.filter(d => d.status === 'LIVE');
    const rows = all.filter(d => dmLiveSearchPass(d, term) && dmLiveColsPass(d, null));
    const activeCols = DM_LIVE_COLS.filter(c => dmLiveFilters[c.id]).length;

    const lc = q('dmLiveCount');    if (lc) lc.textContent = all.length;
    const dc = q('dmDiscardCount'); if (dc) dc.textContent = dmDesigns.filter(d => d.status === 'DISCARDED').length;
    const sh = q('dmLiveShown');
    if (sh) sh.textContent = (term || activeCols)
      ? (rows.length + ' / ' + all.length + ' shown' + (activeCols ? ' · ' + activeCols + ' column filter(s)' : ''))
      : '';
    const cb = q('dmLiveClearBtn');
    if (cb) cb.style.display = (term || activeCols) ? '' : 'none';

    dmLfIndicators();

    const tb = q('dmLiveTableBody'); if (!tb) return;
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="17" class="dm-empty-row">' +
        (all.length ? 'No design matches this search / filter.' : 'No Live Designs yet. Start with “Create New”.') +
        '</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(d => {
      const m = masterOf(d);
      return '<tr>' +
        '<td><button type="button" class="dm-btn dm-btn-primary dm-btn-xs" onclick="dmOpenEditModal(' + d.id + ')">Edit</button> ' +
            '<button type="button" class="dm-btn dm-btn-danger dm-btn-xs" title="Discard" onclick="dmSetStatus(' + d.id + ',\'DISCARDED\')">Discard</button></td>' +
        '<td>' + thumbHtml(dmImgSrc(m), d.design_no) + '</td>' +
        '<td><strong>' + esc(d.design_no) + '</strong></td>' +
        '<td>' + (d.design_sku_no ? '<strong style="color:#7c3aed;">' + esc(d.design_sku_no) + '</strong>'
                                  : '<span class="dm-muted">—</span>') + '</td>' +
        '<td>' + monoCell(d.monopoly) + '</td>' +
        '<td><span class="dm-badge dm-badge-type">' + esc(d.design_type || 'N/A') + '</span></td>' +
        '<td>' + esc(d.party_name || '') + '</td>' +
        '<td>' + esc(d.brand_name || '') + '</td>' +
        '<td>' + (d.supplier_name ? esc(d.supplier_name) : '<span class="dm-muted">—</span>') + '</td>' +
        '<td>' + esc(d.design_unit || '') + '</td>' +
        '<td>' + esc(d.bed_size || '') + '</td>' +
        '<td>' + esc(d.blanket_quality || '') + '</td>' +
        '<td>' + num(d.large_frame) + ' / ' + num(d.medium_frame) + ' / ' + num(d.small_frame) +
            ' <strong style="color:#2563eb;">[' + totalFrames(d) + ']</strong></td>' +
        '<td><span class="dm-badge dm-badge-count">' + (d.matchings || []).length + ' Shades</span></td>' +
        '<td><span class="dm-badge dm-badge-master">' + esc(m ? m.matching_name : 'N/A') + '</span></td>' +
        '<td><span class="dm-badge dm-badge-live">LIVE</span></td>' +
        '<td>' + (d.psd_path
          ? '<button type="button" class="dm-btn dm-btn-success dm-btn-xs" title="' + esc((d.psd_name || '') + (d.psd_size ? ' · ' + fmtSize(d.psd_size) : '')) +
            '" onclick="dmDownloadPsd(' + d.id + ')">Download PSD</button>'
          : '<span class="dm-muted" title="No PSD yet. Add it via Edit.">No PSD</span>') + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderDiscarded(){
    const tb = q('dmDiscardedTableBody'); if (!tb) return;
    const rows = dmDesigns.filter(d => d.status === 'DISCARDED');
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="13" class="dm-empty-row">No discarded designs.</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(d =>
      '<tr>' +
        '<td><button type="button" class="dm-btn dm-btn-success dm-btn-xs" onclick="dmSetStatus(' + d.id + ',\'LIVE\')">Restore</button></td>' +
        '<td>' + thumbHtml(dmImgSrc(masterOf(d)), d.design_no) + '</td>' +
        '<td><strong>' + esc(d.design_no) + '</strong></td>' +
        '<td>' + (d.design_sku_no ? esc(d.design_sku_no) : '<span class="dm-muted">—</span>') + '</td>' +
        '<td>' + monoCell(d.monopoly) + '</td>' +
        '<td><span class="dm-badge dm-badge-type">' + esc(d.design_type || 'N/A') + '</span></td>' +
        '<td>' + esc(d.party_name || '') + '</td>' +
        '<td>' + esc(d.brand_name || '') + '</td>' +
        '<td>' + (d.supplier_name ? esc(d.supplier_name) : '<span class="dm-muted">—</span>') + '</td>' +
        '<td>' + esc(d.design_unit || '') + '</td>' +
        '<td>' + esc(d.bed_size || '') + '</td>' +
        '<td>' + esc(d.discarded_at ? new Date(d.discarded_at).toLocaleDateString('en-GB') : '—') + '</td>' +
        '<td><span class="dm-badge dm-badge-discarded">DISCARDED</span></td>' +
      '</tr>').join('');
  }

  /* ════════════════════════════════════════════════════════════════════
     CREATE NEW
  ════════════════════════════════════════════════════════════════════ */
  const EMPTY_NEW = '<span style="font-size:2rem;"></span><span>[ Passport Size Preview ]</span>' +
                    '<small>Fill in the details on the left while looking at the photo</small>';

  function previewInto(boxId, file, emptyHtml){
    const box = q(boxId); if (!box) return;
    if (!file) { box.innerHTML = emptyHtml; return; }
    const url = URL.createObjectURL(file);
    box.innerHTML = '';
    const img = document.createElement('img');
    img.alt = 'Preview';
    img.onload = () => setTimeout(() => URL.revokeObjectURL(url), 1000);
    img.src = url;
    box.appendChild(img);
  }

  function calcNewTotal(){
    const t = q('dmTotalFrames'); if (!t) return;
    t.value = num(q('dmLargeFrame').value) + num(q('dmMediumFrame').value) + num(q('dmSmallFrame').value);
  }
  function calcEditTotal(){
    const t = q('dmEditTotalFrames'); if (!t) return;
    t.value = num(q('dmEditLargeFrame').value) + num(q('dmEditMediumFrame').value) + num(q('dmEditSmallFrame').value);
  }

  async function saveNewDesign(ev){
    ev.preventDefault();
    if (!sbReady() || !guard('DESIGN_SAVE')) return;
    const btn = ev.target.querySelector('button[type=submit]');
    const designNo = up(q('dmDesignNo').value);
    if (!designNo) { toast('DESIGN NO is required.', 'error'); return; }
    /* The SKU No is REQUIRED on Create New. The box also has `required`, but
       that is only the browser's form check; the real check is here, so an
       empty SKU can't get in by any other route. */
    const skuNo = up(q('dmDesignSkuNo').value);
    if (!skuNo) {
      q('dmDesignSkuNo').focus();
      toast('DESIGN SKU NO is required.', 'error');
      return;
    }

    await loadDesigns();
    if (findByNo(designNo)) {
      toast('Design No ' + designNo + ' already exists. Use “Add Matching”.', 'warn');
      return;
    }
    /* The PSD is REQUIRED on Create New, and it must really be a .psd (the
       file box's `accept` is only a hint; any file can still be picked). */
    const psdFile = (q('dmNewPsd').files || [])[0] || null;
    if (!psdFile) { toast('PSD FILE is required. Select the design’s Photoshop (.psd) file.', 'error'); return; }
    if (!isPsd(psdFile)) { toast('“' + psdFile.name + '” is not a .psd file. Select the Photoshop (.psd) file.', 'error'); return; }
    // Same SKU on another design? Not a block, just a question (skuOkToSave).
    if (!skuOkToSave(skuNo, null)) { q('dmDesignSkuNo').focus(); return; }
    dmSkuNotice();
    dmPsdNotice();

    const file = (q('dmInitialImage').files || [])[0] || null;
    if (btn) { btn.disabled = true; btn.textContent = 'Uploading PSD (' + fmtSize(psdFile.size) + ')…'; }
    setSync('Uploading PSD…', 'busy');
    /* Unlike the photo, the PSD goes up BEFORE the insert: it is required,
       so a design must not be created if its PSD cannot be stored. The
       duplicate Design No is already checked above; if the insert still
       fails, the uploaded file is removed again in the catch. */
    let psd = null;
    try {
      psd = await uploadDesignPsd(designNo, psdFile);
    } catch (e) {
      console.error('[DM] psd upload fail:', e);
      setSync('Upload fail', 'err');
      toast('PSD upload failed, the design was not saved: ' + (e.message || e) +
        (/size|large|413/i.test(e.message || '') ? ' (the file is larger than the Supabase upload limit)' : ''), 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = 'Save New Design'; }
      return;
    }
    if (btn) btn.textContent = 'Saving…';
    setSync('Saving…', 'busy');
    let designSaved = false;
    try {
      const ins = await dmWriteDesign(p => SB.from('design_master').insert(p).select().single(), Object.assign(skuPatch(skuNo), psdPatch(psd), {
        design_no:       designNo,
        party_name:      q('dmPartyName').value.trim(),
        brand_name:      q('dmBrandName').value.trim(),
        design_unit:     q('dmDesignUnit').value.trim(),
        bed_size:        q('dmBedSize').value.trim(),
        design_type:     q('dmDesignType').value.trim() || 'N/A',
        monopoly:        up(q('dmMonopoly').value) === 'YES' ? 'YES' : 'NO',
        blanket_quality: q('dmBlanketQuality').value.trim(),
        supplier_name:   q('dmSupplierName').value.trim() || null,
        frame_type:      q('dmFrameType').value.trim(),
        large_frame:     num(q('dmLargeFrame').value),
        medium_frame:    num(q('dmMediumFrame').value),
        small_frame:     num(q('dmSmallFrame').value),
        status:          'LIVE',
        created_by:      whoAmI()
      }));
      if (ins.error) throw ins.error;
      const design = ins.data;
      designSaved = true;

      /* The photo is uploaded AFTER the design is created, so a duplicate
         Design No stops the insert and leaves no orphan file in the bucket.
         If the upload fails the design is still saved; add the photo via Edit. */
      let img = { path: null, url: null };
      if (file) {
        try { img = await uploadDesignImage(designNo, file); }
        catch (e) { toast('Photo upload failed. The design was saved; add the photo via Edit.', 'warn'); }
      }

      const mIns = await SB.from('design_matchings').insert({
        design_id:       design.id,
        design_no:       designNo,
        matching_name:   q('dmInitialMatchingName').value.trim(),
        blanket_quality: q('dmBlanketQuality').value.trim(),
        matching_type:   up(q('dmInitialMatchingType').value) === 'SLAVE' ? 'SLAVE' : 'MASTER',
        image_path:      img.path,
        image_url:       img.url,
        sort_order:      0,
        created_by:      whoAmI()
      }).select().single();
      if (mIns.error) throw mIns.error;

      design.matchings = [mIns.data];
      dmDesigns.unshift(design);
      renderAll();
      setSync('✓ ' + dmDesigns.length + ' designs', 'ok');

      q('dmNewDesignForm').reset();
      q('dmDesignUnit').value = 'UNIT 1';
      q('dmBedSize').value = 'DOUBLE BED';
      q('dmBlanketQuality').value = 'MINK';
      q('dmMonopoly').value = 'NO';
      q('dmInitialMatchingType').value = 'MASTER';
      q('dmFrameType').value = 'MS ROUND FRAME';
      q('dmTotalFrames').value = '0';
      q('dmNewDesignPreview').innerHTML = EMPTY_NEW;
      psdPicked(q('dmNewPsd'), 'dmNewPsdName');
      toast('Design ' + designNo + ' saved.', 'success');
      showPane('dmLivePane');
    } catch (e) {
      console.error('[DM] save fail:', e);
      // The design row never got made, so its PSD would be junk in the bucket.
      if (!designSaved && psd) await removeStored(psd.psd_path);
      setSync('Save fail', 'err');
      toast(/duplicate key|unique/i.test(e.message || '')
        ? 'Design No ' + designNo + ' already exists in the database.'
        : 'Save fail: ' + (e.message || e), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = 'Save New Design'; }
    }
  }

  /* ════════════════════════════════════════════════════════════════════
     ADD MATCHING
  ════════════════════════════════════════════════════════════════════ */
  function populateMatchingInfo(){
    const d = findByNo(q('dmSelectDesign').value);
    const pb = q('dmMatchingPartyBrand');
    const live = d && d.status === 'LIVE';
    if (pb) pb.value = live ? ((d.party_name || '') + ' | ' + (d.brand_name || '') + ' (' + (d.bed_size || '') + ')') : '';
    renderSavedMatchings(live ? d : null);
    const info = q('dmMatchingExisting'); if (!info) return;
    if (!live) { info.innerHTML = ''; return; }
    if (d.blanket_quality) q('dmMatchingBlanketQuality').value = d.blanket_quality;
    info.innerHTML = '<b>' + esc(d.design_no) + '</b> currently has ' + (d.matchings || []).length + ' matching(s): ' +
      (d.matchings || []).map(m => '<span class="dm-badge ' +
        (m.matching_type === 'MASTER' ? 'dm-badge-master' : 'dm-badge-slave') + '">' +
        esc(m.matching_name) + '</span>').join(' ');
  }

  /* Left column, under the form: the selected design's photos that are already
     saved (MASTER first, then the rest in their order), each as a small
     passport-size card. So while adding a new matching the user can see what
     the design already has and doesn't upload the same shade twice. A click
     opens the photo full screen in the same lightbox the Live tab uses. */
  // boxId: Add Matching's box by default; Add Photoshoot shows the same view in its own box.
  function renderSavedMatchings(d, boxId){
    const list = d ? (d.matchings || []).slice()
      .sort((a, b) => (a.matching_type === 'MASTER' ? 0 : 1) - (b.matching_type === 'MASTER' ? 0 : 1)) : [];
    renderSavedCards(boxId || 'dmMatchingSaved', d, list, 'matching(s)', 'No matching saved on this design yet.',
      m => (m.matching_sku_no ? '<div class="dm-saved-sku">SKU ' + esc(m.matching_sku_no) + '</div>' : '') +
           '<span class="dm-badge ' + (m.matching_type === 'MASTER' ? 'dm-badge-master' : 'dm-badge-slave') + '">' +
           esc(m.matching_type || '') + '</span>');
  }
  /* One passport-card grid for both "Saved" boxes (Add Matching and Add
     Photoshoot), so they look and behave the same. `extra(row)` adds the
     line under the name (the MASTER/SLAVE tag, or a remove button). */
  function renderSavedCards(boxId, d, list, noun, emptyMsg, extra){
    const box = q(boxId); if (!box) return;
    if (!d) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = '';
    box.innerHTML = '<div class="dm-saved-head">Saved: ' + esc(d.design_no) + ' · ' + list.length + ' ' + noun + '</div>' +
      (list.length ? '<div class="dm-saved-grid">' + list.map(m => {
        const src = dmImgSrc(m);
        const cap = d.design_no + ' · ' + (m.matching_name || '') + (m.matching_type ? ' (' + m.matching_type + ')' : '');
        return '<div class="dm-saved-card">' +
          (src
            ? '<img loading="lazy" src="' + esc(src) + '" alt="' + esc(cap) + '" title="Click for full screen"' +
              ' onclick="dmShowLightbox(this.src,this.alt)" onerror="dmImgFail(this)">'
            : '<div class="dm-saved-nophoto">No photo</div>') +
          '<div class="dm-saved-name">' + esc(m.matching_name || '') + '</div>' +
          (extra ? extra(m) : '') +
        '</div>';
      }).join('') + '</div>'
      : '<p class="dm-hint">' + esc(emptyMsg) + '</p>');
  }

  /* ══ BATCH: MANY PHOTOS AT ONCE ══════════════════════════════════════
     Add Matching and Add Photoshoot both work the same way: pick many photos
     in one go, each becomes a passport card under "New … to Save" with its
     own Matching Name box (the same real dropdown as everywhere else), and
     one "Save All" button saves them one by one.

       • A card that saves is removed from the list; a card that fails stays
         with the reason on it, so only the failures need another try.
       • Everything is checked BEFORE the first upload (empty name, duplicate,
         two MASTERs …), because a half-saved batch is the worst outcome.

     The rows live in DM_BATCH[key].rows; the typed values are read from the
     card's inputs at save time. */
  const DM_BATCH = {
    // Matching: name from the shade list, its own Matching SKU No, plus MASTER / SLAVE.
    mtc: { list: 'dmMtcBatch', sum: 'dmMtcSum', save: 'dmMtcSaveBtn', kind: 'shade', withType: true, withSku: true,
           noun: 'matching', empty: 'Select photos on the right (many at once), or add a matching without a photo.' },
    // Photoshoot: any matching name from the full list, this design's first (dmValues 'psmatch').
    ps:  { list: 'dmPsBatch',  sum: 'dmPsSum',  save: 'dmPsSaveBtn',  kind: 'psmatch', withType: false,
           noun: 'photo', empty: 'Select photoshoot photos on the right (many at once).' }
  };
  Object.keys(DM_BATCH).forEach(k => { DM_BATCH[k].rows = []; });
  let dmBatchSeq = 0;

  function batchAddFiles(key, input){
    const files = Array.from(input.files || []).filter(f => /^image\//i.test(f.type || '') || /\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(f.name || ''));
    const skipped = (input.files || []).length - files.length;
    input.value = '';
    files.forEach(f => batchAddRow(key, f));
    if (skipped) toast(skipped + ' file(s) skipped: not a photo.', 'warn');
  }
  function batchAddBlank(key){ batchAddRow(key, null); }

  function batchAddRow(key, file){
    const b = DM_BATCH[key];
    const box = q(b.list); if (!box) return;
    const rid = 'dmBt_' + key + '_' + (++dmBatchSeq);
    const url = file ? URL.createObjectURL(file) : '';
    b.rows.push({ rid: rid, file: file, url: url });
    const empty = box.querySelector('.dm-batch-empty'); if (empty) empty.remove();
    const card = document.createElement('div');
    card.className = 'dm-batch-card';
    card.id = rid;
    card.innerHTML =
      (url
        ? '<img src="' + url + '" alt="' + esc(file.name || '') + '" title="' + esc(file.name || '') + ' · click for full screen" onclick="dmShowLightbox(this.src,this.alt)">'
        : '<div class="dm-saved-nophoto">No photo</div>') +
      '<input type="text" class="dm-bulk-in bt-name" placeholder="Matching Name…">' +
      (b.withSku
        ? '<input type="text" class="dm-bulk-in bt-sku" placeholder="Matching SKU No…" title="SKU No of this matching (optional)" autocomplete="off">'
        : '') +
      (b.withType
        ? '<select class="dm-bulk-in bt-type"><option value="SLAVE">SLAVE</option><option value="MASTER">MASTER</option></select>'
        : '') +
      '<div class="dm-batch-foot"><span class="bt-state"></span>' +
        '<button type="button" class="dm-btn dm-btn-danger dm-btn-xs" title="Remove from this list" onclick="dmBatchRemove(\'' + key + '\',\'' + rid + '\')">✕</button></div>';
    box.appendChild(card);
    attachPicker(card.querySelector('.bt-name'), b.kind);
    batchSum(key);
  }

  function batchRemove(key, rid){
    const b = DM_BATCH[key];
    const r = b.rows.find(x => x.rid === rid);
    if (r && r.url) URL.revokeObjectURL(r.url);
    b.rows = b.rows.filter(x => x.rid !== rid);
    const el = q(rid); if (el) el.remove();
    batchSum(key);
  }

  function batchSum(key){
    const b = DM_BATCH[key];
    const box = q(b.list);
    if (box && !b.rows.length) box.innerHTML = '<p class="dm-hint dm-batch-empty">' + esc(b.empty) + '</p>';
    const s = q(b.sum);
    if (s) {
      const withPhoto = b.rows.filter(r => r.file).length;
      const noPhoto = b.rows.length - withPhoto;
      s.textContent = b.rows.length
        ? (b.rows.length + ' ' + b.noun + '(s) ready' + (noPhoto ? ' · ' + noPhoto + ' without photo' : ''))
        : 'Nothing selected yet';
    }
    const sv = q(b.save); if (sv) sv.disabled = !b.rows.length;
  }

  function batchMark(rid, txt, bad){
    const el = q(rid); if (!el) return;
    const s = el.querySelector('.bt-state');
    if (s) { s.textContent = txt || ''; s.title = txt || ''; }
    el.classList.toggle('bad', !!bad);
  }
  const batchVal = (rid, sel) => { const el = q(rid) && q(rid).querySelector(sel); return el ? el.value.trim() : ''; };

  /* Save All on Add Matching. */
  async function mtcSaveAll(){
    if (!sbReady() || !guard('DESIGN_SAVE')) return;
    await loadDesigns();
    const d = findByNo(q('dmSelectDesign').value);
    if (!d || d.status !== 'LIVE') { q('dmSelectDesign').focus(); toast('Please choose a valid LIVE Design No first.', 'error'); return; }
    const b = DM_BATCH.mtc;
    if (!b.rows.length) { toast('Select the matching photos first.', 'error'); return; }
    const quality = q('dmMatchingBlanketQuality').value.trim();
    if (!quality) { q('dmMatchingBlanketQuality').focus(); toast('BLANKET QUALITY is required.', 'error'); return; }

    // Check everything first: the batch either starts clean or not at all.
    const items = b.rows.map(r => ({ r: r, name: batchVal(r.rid, '.bt-name'), sku: up(batchVal(r.rid, '.bt-sku')), master: batchVal(r.rid, '.bt-type') === 'MASTER' }));
    const have = new Set((d.matchings || []).map(m => up(m.matching_name)));
    const seen = new Set(), seenSku = new Set();
    let err = '';
    items.forEach(it => {
      let e = '';
      if (!it.name) e = 'Matching name required';
      else if (have.has(up(it.name))) e = 'Already on this design';
      else if (seen.has(up(it.name))) e = 'Same name twice in this list';
      else if (it.sku && seenSku.has(it.sku)) e = 'Same SKU No twice in this list';
      seen.add(up(it.name));
      if (it.sku) seenSku.add(it.sku);
      batchMark(it.r.rid, e, !!e);
      if (e && !err) err = (it.name ? '“' + it.name + '”: ' : '') + e + '.';
    });
    if (items.filter(it => it.master).length > 1) err = err || 'Only one matching can be MASTER.';
    if (err) { toast(err, 'error'); return; }
    // A SKU already on another matching: asked once for the whole list, not blocked.
    const clashes = items.map(it => ({ it: it, hit: mskuClash(it.sku, null) })).filter(x => x.hit);
    if (clashes.length && !confirm('These Matching SKU Nos are already used:\n\n' +
        clashes.map(x => x.it.sku + '  →  ' + x.hit.d.design_no + ' · ' + (x.hit.m.matching_name || '')).join('\n') +
        '\n\nSave anyway?')) return;
    if (dmHasMSku === false && items.some(it => it.sku)) { dmMSkuWarned = false; dmMSkuNotice(); }

    const btn = q(b.save);
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    setSync('Saving…', 'busy');
    let ok = 0, fail = 0;
    try {
      /* There can be only one MASTER (partial unique index), so the others
         must be made SLAVE first before a new MASTER can be created. */
      if (items.some(it => it.master)) {
        const dem = await SB.from('design_matchings').update({ matching_type: 'SLAVE' })
          .eq('design_id', d.id).eq('matching_type', 'MASTER');
        if (dem.error) throw dem.error;
        (d.matchings || []).forEach(m => { m.matching_type = 'SLAVE'; });
      }
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (btn) btn.textContent = 'Saving ' + (i + 1) + ' / ' + items.length + '…';
        batchMark(it.r.rid, 'saving…', false);
        try {
          /* If the photo can't go up, this card is NOT saved without it (the
             single-photo form used to do that); it stays in the list so it
             can simply be tried again. */
          let img = { path: null, url: null };
          if (it.r.file) img = await uploadDesignImage(d.design_no, it.r.file);
          const ins = await dmWriteMatching(p => SB.from('design_matchings').insert(p).select().single(), Object.assign({
            design_id:       d.id,
            design_no:       d.design_no,
            matching_name:   it.name,
            blanket_quality: quality,
            matching_type:   it.master ? 'MASTER' : 'SLAVE',
            image_path:      img.path,
            image_url:       img.url,
            sort_order:      (d.matchings || []).length,
            created_by:      whoAmI()
          }, mskuPatch(it.sku)));
          if (ins.error) { await removeStored(img.path); throw ins.error; }
          d.matchings = (d.matchings || []).concat([ins.data]);
          batchRemove('mtc', it.r.rid);
          ok++;
        } catch (e) {
          console.error('[DM] matching fail:', it.name, e);
          batchMark(it.r.rid, '✗ ' + (e.message || e), true);
          fail++;
        }
      }
    } catch (e) {
      console.error('[DM] matching fail:', e);
      toast('Matching add fail: ' + (e.message || e), 'error');
    } finally {
      if (btn) btn.textContent = 'Save All Matchings';
      batchSum('mtc');
      renderAll();
      populateMatchingInfo();   // the design stays selected; its Saved list now shows the new ones
      setSync(fail ? 'Some failed' : '✓ ' + dmDesigns.length + ' designs', fail ? 'err' : 'ok');
      if (ok || fail) toast(ok + ' matching(s) added to ' + d.design_no + (fail ? ', ' + fail + ' failed (still in the list)' : '') + '.', fail ? 'warn' : 'success');
    }
  }

  /* ════════════════════════════════════════════════════════════════════
     ADD PHOTOSHOOT
     Photoshoot photos per design, in their own table design_photoshoots
     (DESIGN_PHOTOSHOOT_MIGRATION.sql) and their own folder
     design-photoshoot/<DESIGN NO>/. Each photo is tagged with one of the
     design's existing matchings. Loaded only when this tab is used, since
     no other screen needs them.
  ════════════════════════════════════════════════════════════════════ */
  const DM_PS_FOLDER = 'design-photoshoot';
  let dmPsByDesign = new Map();   // design_id → [rows]
  let dmPsLoaded = false;
  let dmPsLoading = null;
  let dmPsMissing = false;        // true = table not there (migration not run)

  async function loadPhotoshoots(force){
    if (!sbReady()) return;
    if (dmPsLoading) return dmPsLoading;
    if (dmPsLoaded && !force) return;
    dmPsLoading = (async () => {
      try {
        const rows = await fetchAllRows('design_photoshoots', '*', 'id');
        const map = new Map();
        (rows || []).forEach(r => {
          if (!map.has(r.design_id)) map.set(r.design_id, []);
          map.get(r.design_id).push(r);
        });
        dmPsByDesign = map; dmPsLoaded = true; dmPsMissing = false;
      } catch (e) {
        dmPsMissing = /does not exist|schema cache|Could not find the table/i.test(e.message || '');
        console.warn('[DM] photoshoot load fail:', e.message || e);
        toast(dmPsMissing
          ? 'Photoshoot table not found. Run DESIGN_PHOTOSHOOT_MIGRATION.sql in the Supabase SQL Editor first.'
          : 'Photoshoot load fail: ' + (e.message || e), dmPsMissing ? 'warn' : 'error');
      } finally { dmPsLoading = null; }
    })();
    return dmPsLoading;
  }
  const psOf = d => (d && dmPsByDesign.get(d.id)) || [];

  async function populatePsInfo(){
    const d = findByNo(q('dmPsDesign').value);
    const live = d && d.status === 'LIVE';
    const pb = q('dmPsPartyBrand');
    if (pb) pb.value = live ? ((d.party_name || '') + ' | ' + (d.brand_name || '') + ' (' + (d.bed_size || '') + ')') : '';
    const info = q('dmPsExisting');
    if (!live) { if (info) info.innerHTML = ''; renderSavedMatchings(null, 'dmPsMatchSaved'); renderSavedPhotoshoots(null); return; }
    renderSavedMatchings(d, 'dmPsMatchSaved');
    await loadPhotoshoots();
    // The box may have changed while loading; draw only for what is in it now.
    if (findByNo(q('dmPsDesign').value) !== d) return;
    if (info) info.innerHTML = '<b>' + esc(d.design_no) + '</b>’s ' +
      (d.matchings || []).length + ' matching(s): ' +
      (d.matchings || []).map(m => '<span class="dm-badge ' +
        (m.matching_type === 'MASTER' ? 'dm-badge-master' : 'dm-badge-slave') + '">' + esc(m.matching_name) + '</span>').join(' ') +
      '<br><span class="dm-muted">Each photo’s Matching Name dropdown shows these first, then every other matching name (the full list, as on Add Matching).</span>';
    renderSavedPhotoshoots(d);
  }

  // Saved photoshoot photos, grouped by matching (in the design's matching order).
  function renderSavedPhotoshoots(d){
    if (!d) { renderSavedCards('dmPsSaved', null); return; }
    const order = (d.matchings || []).map(m => up(m.matching_name));
    const rank = n => { const i = order.indexOf(up(n)); return i < 0 ? 999 : i; };
    const list = psOf(d).slice().sort((a, b) => rank(a.matching_name) - rank(b.matching_name) || a.id - b.id);
    renderSavedCards('dmPsSaved', d, list, 'photoshoot photo(s)',
      dmPsMissing ? 'Photoshoot table not found. Run DESIGN_PHOTOSHOOT_MIGRATION.sql first.' : 'No photoshoot photo saved on this design yet.',
      p => '<button type="button" class="dm-btn dm-btn-danger dm-btn-xs" title="Delete this photo" onclick="dmPsDelete(' + d.id + ',' + p.id + ')">✕ Remove</button>');
  }

  async function psSaveAll(){
    if (!sbReady() || !guard('DESIGN_SAVE')) return;
    await loadDesigns();
    const d = findByNo(q('dmPsDesign').value);
    if (!d || d.status !== 'LIVE') { q('dmPsDesign').focus(); toast('Please choose a valid LIVE Design No first.', 'error'); return; }
    await loadPhotoshoots();
    if (dmPsMissing) { toast('Run DESIGN_PHOTOSHOOT_MIGRATION.sql in the Supabase SQL Editor first.', 'error'); return; }
    const b = DM_BATCH.ps;
    if (!b.rows.length) { toast('Select the photoshoot photos first.', 'error'); return; }

    /* Any matching name may be used (the dropdown has the full list). A name
       found in that list is saved with the list's exact spelling, so the same
       shade is never stored two ways; a new name is saved as typed. */
    const byName = new Map(dmValues('psmatch').map(v => [up(v), v]));
    const items = b.rows.map(r => { const typed = batchVal(r.rid, '.bt-name'); return { r: r, typed: typed, name: byName.get(up(typed)) || up(typed) }; });
    let err = '';
    items.forEach(it => {
      const e = !it.typed ? 'Matching name required' : '';
      batchMark(it.r.rid, e, !!e);
      if (e && !err) err = e + '.';
    });
    if (err) { toast(err, 'error'); return; }

    const btn = q(b.save);
    if (btn) btn.disabled = true;
    setSync('Saving…', 'busy');
    let ok = 0, fail = 0;
    const list = psOf(d).slice();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (btn) btn.textContent = 'Uploading ' + (i + 1) + ' / ' + items.length + '…';
      batchMark(it.r.rid, 'uploading…', false);
      let img = null;
      try {
        // Photoshoot photos are kept sharper than the matching swatches.
        img = await uploadDesignImage(d.design_no, it.r.file, { folder: DM_PS_FOLDER, maxSide: 2400, quality: 0.9 });
        const ins = await SB.from('design_photoshoots').insert({
          design_id:     d.id,
          design_no:     d.design_no,
          matching_name: it.name,
          image_path:    img.path,
          image_url:     img.url,
          sort_order:    list.length,
          created_by:    whoAmI()
        }).select().single();
        if (ins.error) throw ins.error;
        list.push(ins.data);
        dmPsByDesign.set(d.id, list);
        batchRemove('ps', it.r.rid);
        ok++;
      } catch (e) {
        console.error('[DM] photoshoot fail:', it.name, e);
        if (img) await removeStored(img.path);
        batchMark(it.r.rid, '✗ ' + (e.message || e), true);
        fail++;
      }
    }
    if (btn) btn.textContent = 'Save All Photos';
    batchSum('ps');
    renderSavedPhotoshoots(d);
    setSync(fail ? 'Some failed' : '✓ ' + dmDesigns.length + ' designs', fail ? 'err' : 'ok');
    toast(ok + ' photoshoot photo(s) added to ' + d.design_no + (fail ? ', ' + fail + ' failed (still in the list)' : '') + '.', fail ? 'warn' : 'success');
  }

  async function psDelete(designId, psId){
    if (!sbReady() || !guard('DESIGN_DISCARD')) return;
    const d = dmDesigns.find(x => x.id === designId); if (!d) return;
    const p = psOf(d).find(x => x.id === psId); if (!p) return;
    if (!confirm('Remove this photoshoot photo (' + (p.matching_name || '') + ') from ' + d.design_no + '?')) return;
    setSync('Saving…', 'busy');
    try {
      const r = await SB.from('design_photoshoots').delete().eq('id', psId);
      if (r.error) throw r.error;
      await removeStored(p.image_path);
      dmPsByDesign.set(d.id, psOf(d).filter(x => x.id !== psId));
      renderSavedPhotoshoots(d);
      setSync('✓ ' + dmDesigns.length + ' designs', 'ok');
      toast('Photoshoot photo removed.', 'success');
    } catch (e) {
      setSync('Save fail', 'err');
      toast('Photo delete fail: ' + (e.message || e), 'error');
    }
  }

  /* ════════════════════════════════════════════════════════════════════
     BULK UPLOAD (old data: many photos at once)
  ════════════════════════════════════════════════════════════════════ */
  function bulkAddFiles(ev){
    const files = Array.from(ev.target.files || []);
    ev.target.value = '';
    if (!files.length) return;
    q('dmBulkTableContainer').style.display = 'block';
    const tb = q('dmBulkTableBody');
    files.forEach((file, i) => {
      const rowId = 'dmBulk_' + Date.now() + '_' + i;
      const previewUrl = URL.createObjectURL(file);
      dmBulkRows.push({ rowId: rowId, file: file, previewUrl: previewUrl });
      // The file name becomes the Design No: extension removed, upper-case.
      const guess = file.name.replace(/\.[^/.]+$/, '').toUpperCase();
      const tr = document.createElement('tr');
      tr.id = rowId;
      tr.innerHTML =
        '<td><img src="' + previewUrl + '" class="dm-thumb" style="width:58px;height:58px;" alt=""></td>' +
        /* Design No with the SKU No under it, in one column: both identify the
           same design, and keeping them together keeps your eye in one place
           while filling in. SKU is OPTIONAL here: bulk is for loading old
           sheets where SKUs are often unknown, and requiring them would block
           the whole load. Anything missed can be added later via Edit. */
        '<td><div class="dm-bulk-col">' +
          '<input type="text" class="dm-bulk-in b-design" value="' + esc(guess) + '" oninput="this.value=this.value.toUpperCase()" placeholder="Design No" style="font-weight:800;color:#2563eb;">' +
          '<input type="text" class="dm-bulk-in b-sku" list="dmSkuList" oninput="this.value=this.value.toUpperCase()" placeholder="SKU No (optional)" style="font-weight:700;color:#7c3aed;"></div></td>' +
        '<td><div class="dm-bulk-col">' +
          '<input type="text" class="dm-bulk-in b-party" list="dmPartyList" placeholder="Party">' +
          '<input type="text" class="dm-bulk-in b-brand" list="dmBrandList" placeholder="Brand">' +
          '<input type="text" class="dm-bulk-in b-supplier" list="dmSupplierList" placeholder="Supplier (optional)"></div></td>' +
        '<td><div class="dm-bulk-col">' +
          '<input type="text" class="dm-bulk-in b-unit" list="dmUnitList" value="UNIT 1" placeholder="Unit">' +
          '<input type="text" class="dm-bulk-in b-bed" list="dmBedSizeList" value="DOUBLE BED" placeholder="Bed Size">' +
          '<input type="text" class="dm-bulk-in b-type" list="dmTypeList" placeholder="Design Type">' +
          '<input type="text" class="dm-bulk-in b-mono" list="dmMonopolyList" value="NO" placeholder="Monopoly"></div></td>' +
        '<td><div class="dm-bulk-col">' +
          '<input type="text" class="dm-bulk-in b-quality" list="dmQualityList" value="MINK" placeholder="Quality">' +
          '<input type="text" class="dm-bulk-in b-frame" list="dmFrameTypeList" value="MS ROUND FRAME" placeholder="Frame Type"></div></td>' +
        '<td><input type="text" class="dm-bulk-in b-matching" list="dmShadeList" placeholder="Search Shade…"></td>' +
        '<td><div class="dm-bulk-col dm-bulk-frames">' +
          '<div class="dm-bulk-row"><span style="width:14px;font-weight:800;" title="117 X 119">L:</span><input type="number" class="dm-bulk-in dm-bulk-sm b-large" value="0" min="0"></div>' +
          '<div class="dm-bulk-row"><span style="width:14px;font-weight:800;" title="85 X 119">M:</span><input type="number" class="dm-bulk-in dm-bulk-sm b-medium" value="0" min="0"></div>' +
          '<div class="dm-bulk-row"><span style="width:14px;font-weight:800;" title="60 X 119">S:</span><input type="number" class="dm-bulk-in dm-bulk-sm b-small" value="0" min="0"></div>' +
          '<div class="dm-bulk-total">Total: <span class="b-total">0</span></div></div></td>' +
        '<td><div class="dm-bulk-act">' +
          '<span class="b-state"></span>' +
          '<button type="button" class="dm-btn dm-btn-success dm-btn-xs b-save" ' +
            'onclick="dmSaveBulkRow(\'' + rowId + '\')" ' +
            'title="Save only this photo\'s row; the other rows stay as they are">Save</button>' +
          '<button type="button" class="dm-btn dm-btn-danger dm-btn-xs" ' +
            'onclick="dmRemoveBulkRow(\'' + rowId + '\')">Remove</button>' +
        '</div></td>';
      tb.appendChild(tr);
      // A dropdown of the values already in the database, on every input.
      DM_BULK_PICKERS.forEach(p => attachPicker(tr.querySelector('.' + p[0]), p[1]));
      tr.addEventListener('input', e => {
        if (!e.target.matches('.b-large,.b-medium,.b-small')) return;
        tr.querySelector('.b-total').textContent =
          num(tr.querySelector('.b-large').value) + num(tr.querySelector('.b-medium').value) + num(tr.querySelector('.b-small').value);
      });
    });
  }

  function removeBulkRow(rowId){
    const tr = q(rowId); if (tr) tr.remove();
    const hit = dmBulkRows.find(r => r.rowId === rowId);
    if (hit) URL.revokeObjectURL(hit.previewUrl);
    dmBulkRows = dmBulkRows.filter(r => r.rowId !== rowId);
    if (!dmBulkRows.length) q('dmBulkTableContainer').style.display = 'none';
  }

  const bulkGet = tr => sel => { const el = tr.querySelector(sel); return el ? el.value.trim() : ''; };

  /* Required inputs of a row. Empty string = the row is fine. */
  function validateBulkRow(tr){
    const g = bulkGet(tr);
    const no = up(g('.b-design'));
    if (!no || !g('.b-party') || !g('.b-brand') || !g('.b-matching')) {
      return 'Row “' + (no || '—') + '”: Design No, Party, Brand and Matching are all required.';
    }
    return '';
  }
  // Is this row's Design No also in another row on screen?
  function bulkDupOnScreen(tr){
    const no = up((tr.querySelector('.b-design') || {}).value);
    if (!no) return false;
    return Array.from(document.querySelectorAll('#dmBulkTableBody tr'))
      .some(o => o !== tr && up((o.querySelector('.b-design') || {}).value) === no);
  }
  /* Is this row's SKU used anywhere else? Not a block, only a warning; the
     same SKU can be on two sheets on purpose. Returns where it was found
     ("design 5002" or "another row in this sheet"), otherwise ''. */
  function bulkSkuClash(tr){
    const s = up((tr.querySelector('.b-sku') || {}).value);
    if (!s) return '';
    const onScreen = Array.from(document.querySelectorAll('#dmBulkTableBody tr'))
      .some(o => o !== tr && up((o.querySelector('.b-sku') || {}).value) === s);
    if (onScreen) return 'another row in this sheet';
    const hit = skuClash(s, null);
    return hit ? ('design ' + hit.design_no) : '';
  }
  function bulkMark(tr, txt, color, title){
    const s = tr.querySelector('.b-state');
    if (!s) return;
    s.textContent = txt; s.style.color = color; s.title = title || '';
  }

  /* ══ SAVING ONE BULK ROW ═════════════════════════════════════════════
     The row's own Save and the "Save All Designs" button below both go
     through here, so both always give the same result. One row creates one
     design + its MASTER matching + photo.

     Returns 'saved' | 'skipped' | 'failed'. Validation is NOT done here; the
     caller does it, because Save All checks the whole list first (a half-done
     save is the worst outcome) while a single Save checks only its own row. */
  async function saveBulkRow(tr){
    const g = bulkGet(tr);
    const no = up(g('.b-design'));
    if (findByNo(no)) { bulkMark(tr, 'already exists', '#b45309'); return 'skipped'; }
    try {
      const ins = await dmWriteDesign(p => SB.from('design_master').insert(p).select().single(), Object.assign(skuPatch(g('.b-sku')), {
        design_no: no,
        party_name: g('.b-party'), brand_name: g('.b-brand'),
        supplier_name: g('.b-supplier') || null,
        design_unit: g('.b-unit'), bed_size: g('.b-bed'),
        design_type: g('.b-type') || 'N/A',
        monopoly: up(g('.b-mono')) === 'YES' ? 'YES' : 'NO',
        blanket_quality: g('.b-quality'), frame_type: g('.b-frame'),
        large_frame: num(g('.b-large')), medium_frame: num(g('.b-medium')), small_frame: num(g('.b-small')),
        status: 'LIVE', created_by: whoAmI()
      }));
      if (ins.error) throw ins.error;

      let img = { path: null, url: null };
      const hit = dmBulkRows.find(r => r.rowId === tr.id);
      if (hit && hit.file) {
        try { img = await uploadDesignImage(no, hit.file); }
        catch (e) { console.warn('[DM] bulk photo fail', no, e.message || e); }
      }
      const mIns = await SB.from('design_matchings').insert({
        design_id: ins.data.id, design_no: no,
        matching_name: g('.b-matching'), blanket_quality: g('.b-quality'),
        matching_type: 'MASTER', image_path: img.path, image_url: img.url,
        sort_order: 0, created_by: whoAmI()
      }).select().single();
      if (mIns.error) throw mIns.error;

      ins.data.matchings = [mIns.data];
      dmDesigns.unshift(ins.data);
      bulkMark(tr, img.path ? '✓ saved' : '✓ saved (no photo)', '#166534');
      return 'saved';
    } catch (e) {
      console.error('[DM] bulk row fail', no, e);
      bulkMark(tr, '✗ fail', '#991b1b', e.message || String(e));
      return 'failed';
    }
  }

  /* The row's own Save: only this photo's row goes; the other rows stay as
     they are. Some people prefer to confirm one photo's entry at a time
     instead of filling the whole sheet. */
  async function saveOneBulkRow(rowId){
    if (!sbReady() || !guard('DESIGN_SAVE')) return;
    const tr = q(rowId); if (!tr) return;
    const err = validateBulkRow(tr);
    if (err) { tr.scrollIntoView({ block: 'center' }); toast(err, 'error'); return; }
    if (bulkDupOnScreen(tr)) {
      tr.scrollIntoView({ block: 'center' });
      toast('This Design No is also in another row above or below. Fix that first.', 'error');
      return;
    }
    // SKU used elsewhere? Not a block; a question, as on Create New.
    const clash = bulkSkuClash(tr);
    if (clash) {
      tr.scrollIntoView({ block: 'center' });
      if (!confirm('SKU No ' + up((tr.querySelector('.b-sku') || {}).value) + ' is already on ' + clash + '.\n\nSave anyway?')) return;
    }
    dmSkuNotice();
    const btn = tr.querySelector('.b-save');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    setSync('Saving…', 'busy');
    await loadDesigns();
    const r = await saveBulkRow(tr);
    if (btn) { btn.disabled = false; btn.innerHTML = 'Save'; }
    renderAll();
    setSync('✓ ' + dmDesigns.length + ' designs', r === 'failed' ? 'err' : 'ok');
    if (r === 'saved') {
      const no = up((tr.querySelector('.b-design') || {}).value);
      toast('Design ' + no + ' saved.', 'success');
      removeBulkRow(tr.id);     // only this row is removed
    } else if (r === 'skipped') {
      toast('This Design No already exists in the database; not saved.', 'warn');
    } else {
      toast('Save failed. Hover over “✗ fail” in the Action column to see why.', 'error');
    }
  }

  async function saveAllBulk(){
    if (!sbReady() || !guard('DESIGN_SAVE')) return;
    const trs = Array.from(document.querySelectorAll('#dmBulkTableBody tr'));
    if (!trs.length) { toast('There are no rows.', 'warn'); return; }
    await loadDesigns();

    /* Check the whole list first; a half-done save is the worst outcome. */
    const seen = new Set();
    for (const tr of trs) {
      const err = validateBulkRow(tr);
      if (err) { tr.scrollIntoView({ block: 'center' }); toast(err, 'error'); return; }
      const no = up((tr.querySelector('.b-design') || {}).value);
      if (seen.has(no)) {
        tr.scrollIntoView({ block: 'center' });
        toast('Design No ' + no + ' appears twice in this list.', 'error');
        return;
      }
      seen.add(no);
    }
    /* The SKU check is SEPARATE from the Design No check and only asks: the
       same SKU can be in two places. Clashes across the whole list are
       counted and asked about once; 40 confirm boxes for a 40-photo sheet
       would help nobody. */
    const clashes = [];
    for (const tr of trs) {
      const where = bulkSkuClash(tr);
      if (where) clashes.push(up((tr.querySelector('.b-sku') || {}).value) + ' → ' + where);
    }
    if (clashes.length && !confirm(clashes.length + ' SKU No(s) already exist elsewhere:\n\n'
        + clashes.slice(0, 10).join('\n') + (clashes.length > 10 ? '\n…' : '')
        + '\n\nSave all anyway?')) return;
    dmSkuNotice();

    const btn = document.querySelector('#dmBulkTableContainer .dm-table-foot .dm-btn');
    if (btn) btn.disabled = true;
    let done = 0, skipped = 0, failed = 0;
    for (let i = 0; i < trs.length; i++) {
      if (btn) btn.textContent = '' + (i + 1) + ' / ' + trs.length + '…';
      setSync('Saving ' + (i + 1) + '/' + trs.length + '…', 'busy');
      const r = await saveBulkRow(trs[i]);
      if (r === 'saved') done++; else if (r === 'skipped') skipped++; else failed++;
    }
    if (btn) { btn.disabled = false; btn.innerHTML = 'Save All Designs'; }
    renderAll();
    setSync('✓ ' + dmDesigns.length + ' designs', failed ? 'err' : 'ok');

    /* Only the rows that really saved are removed; skipped / failed rows stay
       on screen so they can be fixed and saved again. */
    Array.from(document.querySelectorAll('#dmBulkTableBody tr')).forEach(tr => {
      const st = tr.querySelector('.b-state');
      if (st && st.textContent.indexOf('✓') === 0) removeBulkRow(tr.id);
    });

    let msg = 'Bulk upload: ' + done + ' save';
    if (skipped) msg += ', ' + skipped + ' skipped (already exist)';
    if (failed) msg += ', ' + failed + ' fail';
    toast(msg + '.', failed ? 'warn' : 'success');
    if (done && !failed && !skipped) showPane('dmLivePane');
  }

  /* ════════════════════════════════════════════════════════════════════
     STATUS / EDIT
  ════════════════════════════════════════════════════════════════════ */
  async function setStatus(id, status){
    if (!sbReady() || !guard('DESIGN_DISCARD')) return;
    const d = dmDesigns.find(x => x.id === id); if (!d) return;
    if (!confirm((status === 'LIVE' ? 'RESTORE' : 'DISCARD') + ' design ' + d.design_no + '?')) return;
    setSync('Saving…', 'busy');
    try {
      const patch = { status: status, discarded_at: status === 'DISCARDED' ? new Date().toISOString() : null };
      const r = await SB.from('design_master').update(patch).eq('id', id);
      if (r.error) throw r.error;
      Object.assign(d, patch);
      renderAll();
      setSync('✓ ' + dmDesigns.length + ' designs', 'ok');
      toast('Design ' + d.design_no + ': ' + status + '.', 'success');
    } catch (e) {
      setSync('Save fail', 'err');
      toast('Status change fail: ' + (e.message || e), 'error');
    }
  }

  function openEditModal(id){
    if (!guard('DESIGN_SAVE')) return;
    const d = dmDesigns.find(x => x.id === id); if (!d) return;
    q('dmEditDesignId').value       = d.id;
    q('dmEditDesignNo').value       = d.design_no || '';
    q('dmEditDesignSkuNo').value    = d.design_sku_no || '';
    q('dmEditDesignUnit').value     = d.design_unit || '';
    q('dmEditBedSize').value        = d.bed_size || '';
    q('dmEditBlanketQuality').value = d.blanket_quality || '';
    q('dmEditDesignType').value     = d.design_type || 'N/A';
    q('dmEditMonopoly').value       = d.monopoly || 'NO';
    q('dmEditFrameType').value      = d.frame_type || '';
    q('dmEditLargeFrame').value     = num(d.large_frame);
    q('dmEditMediumFrame').value    = num(d.medium_frame);
    q('dmEditSmallFrame').value     = num(d.small_frame);
    q('dmEditPartyName').value      = d.party_name || '';
    q('dmEditBrandName').value      = d.brand_name || '';
    q('dmEditSupplierName').value   = d.supplier_name || '';
    calcEditTotal();
    renderEditPsd(d);
    renderEditMatchings(d);
    q('dmEditModal').classList.add('open');
  }
  function closeEditModal(){ q('dmEditModal').classList.remove('open'); }

  /* Edit popup › PSD: the current file (with Download) and a box to pick a
     new one. A picked file is uploaded only on "Update & Save", along with the
     design's own fields, and then replaces the old one. */
  function renderEditPsd(d){
    const inp = q('dmEditPsd'); if (inp) inp.value = '';
    const cur = q('dmEditPsdCurrent');
    if (cur) cur.innerHTML = d.psd_path
      ? 'Current: <b>' + esc(d.psd_name || 'design.psd') + '</b>' + (d.psd_size ? ' · ' + fmtSize(d.psd_size) : '') +
        ' <button type="button" class="dm-btn dm-btn-success dm-btn-xs" onclick="dmDownloadPsd(' + d.id + ')">Download PSD</button>'
      : '<span class="dm-muted">No PSD on this design yet.</span>';
    psdPicked(inp || {}, 'dmEditPsdName');
    const lbl = q('dmEditPsdBtnText'); if (lbl) lbl.textContent = d.psd_path ? 'Replace PSD File' : 'Select PSD File';
  }

  function renderEditMatchings(d){
    const box = q('dmEditMatchingsList'); if (!box) return;
    if (!(d.matchings || []).length) {
      box.innerHTML = '<p class="dm-hint">No matchings. Add one from the “Add Matching” tab.</p>';
      return;
    }
    box.innerHTML = d.matchings.map(m => {
      const src = dmImgSrc(m);
      return '<div class="dm-mrow">' +
        '<div class="dm-mrow-left">' + thumbHtml(src, m.matching_name) +
          '<div><b>' + esc(m.matching_name) + '</b>' +
          '<div style="font-size:10.5px;color:#64748b;">' + esc(m.blanket_quality || d.blanket_quality || '') + '</div>' +
          '<input type="text" class="dm-msku-in" value="' + esc(m.matching_sku_no || '') + '" placeholder="Matching SKU No" autocomplete="off"' +
            ' title="SKU No of this matching. Saved when you leave the box." onchange="dmSetMatchingSku(' + d.id + ',' + m.id + ',this)"></div>' +
        '</div>' +
        '<div class="dm-mrow-right">' +
          '<label><input type="radio" name="dmMasterPick" value="' + m.id + '"' +
            (m.matching_type === 'MASTER' ? ' checked' : '') +
            ' onchange="dmMakeMaster(' + d.id + ',' + m.id + ')"> Master</label>' +
          '<span class="dm-badge ' + (m.matching_type === 'MASTER' ? 'dm-badge-master' : 'dm-badge-slave') + '">' + m.matching_type + '</span>' +
          '<label class="dm-repl">' + (src ? 'Replace Photo' : 'Add Photo') +
            '<input type="file" accept="image/*" hidden onchange="dmReplacePhoto(' + d.id + ',' + m.id + ',this)"></label>' +
          '<button type="button" class="dm-btn dm-btn-danger dm-btn-xs" title="Remove matching" onclick="dmDeleteMatching(' + d.id + ',' + m.id + ')">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // Edit popup › a matching's SKU box: saved on its own as soon as it changes.
  async function setMatchingSku(designId, matchingId, input){
    const d = dmDesigns.find(x => x.id === designId); if (!d) return;
    const m = (d.matchings || []).find(x => x.id === matchingId); if (!m) return;
    const v = up(input.value), old = m.matching_sku_no || '';
    input.value = v;
    if (v === up(old)) return;
    if (!sbReady() || !guard('DESIGN_SAVE')) { input.value = old; return; }
    if (dmHasMSku === false) { dmMSkuWarned = false; dmMSkuNotice(); input.value = old; return; }
    const hit = mskuClash(v, matchingId);
    if (hit && !confirm('Matching SKU No ' + v + ' is already on ' + hit.d.design_no + ' · ' + (hit.m.matching_name || '') + '.\n\nSave anyway?')) { input.value = old; return; }
    input.disabled = true;
    setSync('Saving…', 'busy');
    try {
      const r = await dmWriteMatching(p => SB.from('design_matchings').update(p).eq('id', matchingId), mskuPatch(v));
      if (r.error) throw r.error;
      if (dmHasMSku === false) { input.value = old; return; }   // found out just now: nothing was saved
      m.matching_sku_no = v || null;
      setSync('✓ ' + dmDesigns.length + ' designs', 'ok');
      toast('Matching SKU No ' + (v ? 'set to ' + v : 'removed') + ' on ' + d.design_no + ' · ' + (m.matching_name || '') + '.', 'success');
      if (q('dmMatchingSkuPane') && q('dmMatchingSkuPane').classList.contains('active')) msRender();
    } catch (e) {
      console.error('[DM] matching SKU fail:', e);
      input.value = old;
      setSync('Save fail', 'err');
      toast('Matching SKU save fail: ' + (e.message || e), 'error');
    } finally {
      input.disabled = false;
    }
  }

  async function makeMaster(designId, matchingId){
    if (!sbReady() || !guard('DESIGN_SAVE')) return;
    const d = dmDesigns.find(x => x.id === designId); if (!d) return;
    setSync('Saving…', 'busy');
    try {
      const dem = await SB.from('design_matchings').update({ matching_type: 'SLAVE' })
        .eq('design_id', designId).eq('matching_type', 'MASTER');
      if (dem.error) throw dem.error;
      const pro = await SB.from('design_matchings').update({ matching_type: 'MASTER' }).eq('id', matchingId);
      if (pro.error) throw pro.error;
      d.matchings.forEach(m => { m.matching_type = (m.id === matchingId) ? 'MASTER' : 'SLAVE'; });
      renderEditMatchings(d); renderLive(); renderDiscarded();
      setSync('✓ ' + dmDesigns.length + ' designs', 'ok');
      toast('Master matching changed.', 'success');
    } catch (e) {
      setSync('Save fail', 'err');
      toast('Master change fail: ' + (e.message || e), 'error');
      renderEditMatchings(d);
    }
  }

  async function replacePhoto(designId, matchingId, input){
    const file = (input.files || [])[0];
    input.value = '';
    if (!file || !sbReady() || !guard('DESIGN_SAVE')) return;
    const d = dmDesigns.find(x => x.id === designId); if (!d) return;
    const m = d.matchings.find(x => x.id === matchingId); if (!m) return;
    setSync('Uploading…', 'busy');
    try {
      const old = m.image_path;
      const img = await uploadDesignImage(d.design_no, file);
      const r = await SB.from('design_matchings')
        .update({ image_path: img.path, image_url: img.url }).eq('id', matchingId);
      if (r.error) throw r.error;
      m.image_path = img.path; m.image_url = img.url;
      dmImgCache.delete(dmPublicUrl(old));
      await removeStored(old);
      renderEditMatchings(d); renderLive(); renderDiscarded();
      setSync('✓ ' + dmDesigns.length + ' designs', 'ok');
      toast('Photo updated.', 'success');
    } catch (e) {
      setSync('Upload fail', 'err');
      toast('Photo update fail: ' + (e.message || e), 'error');
    }
  }

  async function deleteMatching(designId, matchingId){
    if (!sbReady() || !guard('DESIGN_DISCARD')) return;
    const d = dmDesigns.find(x => x.id === designId); if (!d) return;
    const m = d.matchings.find(x => x.id === matchingId); if (!m) return;
    if (d.matchings.length === 1) { toast('The last matching cannot be removed; discard the design instead.', 'warn'); return; }
    if (!confirm('Remove matching “' + m.matching_name + '”? Its photo will be deleted too.')) return;
    setSync('Saving…', 'busy');
    try {
      const r = await SB.from('design_matchings').delete().eq('id', matchingId);
      if (r.error) throw r.error;
      await removeStored(m.image_path);
      d.matchings = d.matchings.filter(x => x.id !== matchingId);
      // If the master was removed, the first remaining matching becomes the new master.
      if (m.matching_type === 'MASTER' && d.matchings.length) {
        const nm = d.matchings[0];
        const pro = await SB.from('design_matchings').update({ matching_type: 'MASTER' }).eq('id', nm.id);
        if (!pro.error) nm.matching_type = 'MASTER';
      }
      renderEditMatchings(d); renderLive(); renderDiscarded();
      setSync('✓ ' + dmDesigns.length + ' designs', 'ok');
      toast('Matching removed.', 'success');
    } catch (e) {
      setSync('Save fail', 'err');
      toast('Matching delete fail: ' + (e.message || e), 'error');
    }
  }

  async function updateDesign(ev){
    ev.preventDefault();
    if (!sbReady() || !guard('DESIGN_SAVE')) return;
    const id = parseInt(q('dmEditDesignId').value, 10);
    const d = dmDesigns.find(x => x.id === id); if (!d) return;
    const newNo = up(q('dmEditDesignNo').value);
    if (!newNo) { toast('DESIGN NO cannot be empty.', 'error'); return; }
    if (dmDesigns.some(x => x.id !== id && up(x.design_no) === newNo)) {
      toast('Design No ' + newNo + ' belongs to another design.', 'error');
      return;
    }
    /* SKU is optional on Edit (if an old design's SKU is unknown, the record
       couldn't be opened at all), but a filled-in SKU that is on another design
       is asked about: the same rule as on Create New. */
    const newSku = up(q('dmEditDesignSkuNo').value);
    if (!skuOkToSave(newSku, id)) { q('dmEditDesignSkuNo').focus(); return; }
    dmSkuNotice();
    const psdFile = (q('dmEditPsd').files || [])[0] || null;
    if (psdFile && !isPsd(psdFile)) { toast('“' + psdFile.name + '” is not a .psd file. Select the Photoshop (.psd) file.', 'error'); return; }
    if (psdFile) dmPsdNotice();
    const btn = ev.target.querySelector('button[type=submit]');
    /* New PSD first: if the upload fails, nothing about the design changes and
       the user can simply try again. The old file is removed only after the
       row points at the new one. */
    let psd = null;
    if (psdFile) {
      if (btn) { btn.disabled = true; btn.textContent = 'Uploading PSD (' + fmtSize(psdFile.size) + ')…'; }
      setSync('Uploading PSD…', 'busy');
      try { psd = await uploadDesignPsd(newNo, psdFile); }
      catch (e) {
        setSync('Upload fail', 'err');
        toast('PSD upload failed, nothing was changed: ' + (e.message || e), 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = 'Update &amp; Save'; }
        return;
      }
    }
    const oldPsd = d.psd_path || null;
    const patch = Object.assign(skuPatch(newSku), psdPatch(psd), {
      design_no:       newNo,
      design_unit:     q('dmEditDesignUnit').value.trim(),
      bed_size:        q('dmEditBedSize').value.trim(),
      blanket_quality: q('dmEditBlanketQuality').value.trim(),
      design_type:     q('dmEditDesignType').value.trim() || 'N/A',
      monopoly:        up(q('dmEditMonopoly').value) === 'YES' ? 'YES' : 'NO',
      frame_type:      q('dmEditFrameType').value.trim(),
      large_frame:     num(q('dmEditLargeFrame').value),
      medium_frame:    num(q('dmEditMediumFrame').value),
      small_frame:     num(q('dmEditSmallFrame').value),
      party_name:      q('dmEditPartyName').value.trim(),
      brand_name:      q('dmEditBrandName').value.trim(),
      supplier_name:   q('dmEditSupplierName').value.trim() || null
    });
    setSync('Saving…', 'busy');
    try {
      const r = await dmWriteDesign(p => SB.from('design_master').update(p).eq('id', id), patch);
      if (r.error) throw r.error;
      /* If the Design No changed, the matchings' design_no must follow, since
         both the catalogue and the image folder use this name. Old photos stay
         in their old folder; their path is in the row, so they keep loading.
         New photos go to the new folder. */
      if (up(d.design_no) !== newNo) {
        const rm = await SB.from('design_matchings').update({ design_no: newNo }).eq('design_id', id);
        if (!rm.error) d.matchings.forEach(m => { m.design_no = newNo; });
        // Photoshoot rows follow too; a failure (e.g. table not made yet) is ignored.
        try {
          const rp = await SB.from('design_photoshoots').update({ design_no: newNo }).eq('design_id', id);
          if (!rp.error) psOf(d).forEach(p => { p.design_no = newNo; });
        } catch (e) {}
      }
      Object.assign(d, patch);
      if (psd && patch.psd_path && oldPsd && oldPsd !== patch.psd_path) await removeStored(oldPsd);
      renderAll();
      setSync('✓ ' + dmDesigns.length + ' designs', 'ok');
      closeEditModal();
      toast('Design ' + newNo + ' updated.', 'success');
    } catch (e) {
      setSync('Save fail', 'err');
      toast('Update fail: ' + (e.message || e), 'error');
      // The row still points at the old PSD, so the new upload is junk.
      if (psd) await removeStored(psd.psd_path);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = 'Update &amp; Save'; }
    }
  }

  /* ════════════════════════════════════════════════════════════════════
     CATALOGUE — filters, on-screen preview, asli PDF
  ════════════════════════════════════════════════════════════════════ */
  /* ══ DEPENDENT (CASCADING) FILTERS ═══════════════════════════════════
     All the filters depend on each other. Unticking a value automatically
     removes, from the other columns, the options that no longer occur in the
     remaining designs, so the screen only ever shows choices that actually
     lead somewhere.

     Two things are kept separate, which is what lets this settle in a single
     pass with no loop:

       * The TICK record: in dmCatState, for every value, always. A tick on a
         value hidden by a cross-filter is kept here too, so loosening another
         filter brings it back in its previous state.
       * WHAT SHOWS: worked out afresh on every render: that column's values
         that remain after ALL the other filters (+ the Design No box).

     Only ticks restrict, visibility does not, so there is no "A narrowed B,
     so A narrowed further" loop.

     The old rule still holds: if no tick is left, the column has no
     restriction. An empty value (e.g. a design with no supplier written)
     is now its own option, so that design isn't silently filtered out. */
  const DM_CAT_BLANK = '— blank —';
  const DM_CAT_FILTERS = [
    { name:'dmUnitFilter',     box:'dmUnitFilterBox',     count:'dmUnitFilterCount',     get:d => d.design_unit },
    { name:'dmBedFilter',      box:'dmBedFilterBox',      count:'dmBedFilterCount',      get:d => d.bed_size },
    { name:'dmQualityFilter',  box:'dmQualityFilterBox',  count:'dmQualityFilterCount',  get:d => d.blanket_quality },
    { name:'dmPartyFilter',    box:'dmPartyFilterBox',    count:'dmPartyFilterCount',    get:d => d.party_name },
    { name:'dmBrandFilter',    box:'dmBrandFilterBox',    count:'dmBrandFilterCount',    get:d => d.brand_name },
    { name:'dmSupplierFilter', box:'dmSupplierFilterBox', count:'dmSupplierFilterCount', get:d => d.supplier_name },
    { name:'dmTypeFilter',     box:'dmTypeFilterBox',     count:'dmTypeFilterCount',     get:d => d.design_type },
    { name:'dmFramesFilter',   box:'dmFramesFilterBox',   count:'dmFramesFilterCount',   get:d => String(totalFrames(d)) },
    { name:'dmMonopolyFilter', box:'dmMonopolyFilterBox', count:'dmMonopolyFilterCount', get:d => d.monopoly || 'NO' },
    /* SKU has its own multi-select, next to the Design No text box. They are
       different things: names are typed in the Design No box, SKUs are ticked
       from the list here, and the two combine with AND. */
    { name:'dmSkuFilter',      box:'dmSkuFilterBox',      count:'dmSkuFilterCount',      get:d => d.design_sku_no },
  ];
  const dmCatState = {};   // {filterName: {value: false}}; only unticks are remembered

  const dmCatVal = (f, d) => String(f.get(d) == null ? '' : f.get(d)).trim() || DM_CAT_BLANK;
  // A new / first-seen value is always ticked (default "all selected").
  const dmCatChecked = (name, v) => !(dmCatState[name] && dmCatState[name][v] === false);
  const dmCatSort = (a, b) => String(a).localeCompare(String(b), undefined, { numeric:true, sensitivity:'base' });

  /* Design No box. Earlier every number had to match exactly, so the preview
     stayed empty until the full number was typed. Now the number still being
     typed (the last one, with no comma / space after it yet) matches as
     "contains", so the PDFs narrow down letter by letter; numbers already
     closed with a comma / space stay exact, so "101, 205" never pulls in 1010. */
  function dmCatNos(){
    const b = q('dmCatDesignNos');
    const raw = String(b ? b.value : '');
    const parts = raw.split(/[,\s]+/).map(up);
    const typing = /[,\s]$/.test(raw) ? '' : (parts.pop() || '');
    return { exact: parts.filter(Boolean), partial: typing };
  }
  /* The full working for one render: live designs, each filter's domain and
     its ticked values. Built once and reused for every design; otherwise each
     filter's domain would be rebuilt for every design. */
  function dmCatCtx(){
    const live = dmDesigns.filter(d => d.status === 'LIVE');
    const picked = {};
    DM_CAT_FILTERS.forEach(f => {
      const dom = [...new Set(live.map(d => dmCatVal(f, d)))].sort(dmCatSort);
      const on = dom.filter(v => dmCatChecked(f.name, v));
      /* No tick at all in a column = no design passes that column. (Earlier,
         "no tick" was treated as "anything goes", so after Clear the other
         filters stayed full.) Now Clear empties all the other filters, and
         ticking again brings them back. */
      picked[f.name] = { dom: dom, set: new Set(on) };
    });
    return { live: live, picked: picked, nos: dmCatNos() };
  }
  // Everything except the `skipName` column is applied; that is how the
  // column's own options are worked out.
  function dmCatPass(ctx, d, skipName){
    const nos = ctx.nos;
    if (nos.exact.length || nos.partial) {
      const no = up(d.design_no);
      if (nos.exact.indexOf(no) < 0 && !(nos.partial && no.indexOf(nos.partial) >= 0)) return false;
    }
    return DM_CAT_FILTERS.every(f => {
      if (f.name === skipName) return true;
      return ctx.picked[f.name].set.has(dmCatVal(f, d));
    });
  }

  function renderCatalogueFilters(){
    const ctx = dmCatCtx();
    DM_CAT_FILTERS.forEach(f => {
      const avail = [...new Set(ctx.live.filter(d => dmCatPass(ctx, d, f.name)).map(d => dmCatVal(f, d)))].sort(dmCatSort);
      const box = q(f.box);
      if (box) box.innerHTML = avail.length
        ? avail.map(v => '<label><input type="checkbox" name="' + f.name + '" value="' + esc(v) + '"' +
            (dmCatChecked(f.name, v) ? ' checked' : '') + '> ' + esc(v) + '</label>').join('')
        : '<span class="dm-empty">Nothing left here after the other filters</span>';
      const c = q(f.count);
      if (c) {
        const on = avail.filter(v => dmCatChecked(f.name, v)).length;
        c.textContent = avail.length ? (on + '/' + avail.length) : '0';
        c.className = 'dm-fcount' + (avail.length && on < avail.length ? ' on' : '');
      }
    });
    const mc = q('dmCatMatchCount');
    if (mc) {
      const n = ctx.live.filter(d => dmCatPass(ctx, d, null)).length;
      mc.textContent = n + ' / ' + ctx.live.length + ' designs match this filter';
    }
    /* The preview below changes along with the filters; no button needed.
       This one call covers every path (checkbox, All / Clear, Reset All,
       Design No box, opening the tab, Dropdown Master refresh), because they
       all end in this function. */
    dmCatSchedulePreview();
  }

  /* ══ AUTO-PREVIEW ════════════════════════════════════════════════════
     The preview builds as soon as a filter changes, but rebuilding the whole
     catalogue on every tick isn't cheap: one cover page per design + one page
     per 8 shades, with their photos. So two things:

       • DEBOUNCE: when ticking quickly, the intermediate renders are dropped
         and only the last one runs.
       • AUTO LIMIT: the auto-preview shows only the first DM_CAT_AUTO_MAX
         designs and notes how many remain. "Generate Full Preview" runs
         without that limit. The PDF is NOT affected by the limit:
         buildCataloguePdf always uses the full list (generatePreview keeps
         the full selection in dmCatalogue even when limited). */
  const DM_CAT_AUTO_MAX = 40;
  let dmCatPreviewTimer = null;
  function dmCatSchedulePreview(){
    const pane = q('dmCataloguePane');
    // If the tab isn't open there is no point building anything; rendering the
    // whole catalogue on every save while working on the Live tab is wasted effort.
    if (!pane || !pane.classList.contains('active')) return;
    clearTimeout(dmCatPreviewTimer);
    dmCatPreviewTimer = setTimeout(() => {
      try { generatePreview({ max: DM_CAT_AUTO_MAX }); }
      catch (e) { console.warn('[DM] auto preview skipped:', e.message || e); }
    }, 220);
  }

  function dmCatFilterChanged(cb){
    const st = dmCatState[cb.name] || (dmCatState[cb.name] = {});
    if (cb.checked) delete st[cb.value]; else st[cb.value] = false;
    renderCatalogueFilters();
  }
  /* "All" clears that column's whole record, so options currently hidden by a
     cross-filter are ticked again as well; otherwise a hidden untick would
     quietly keep restricting even after "All". */
  function toggleFilter(name, checkAll){
    const f = DM_CAT_FILTERS.find(x => x.name === name); if (!f) return;
    const st = dmCatState[name] = {};
    if (!checkAll) {
      dmDesigns.filter(d => d.status === 'LIVE')
        .forEach(d => { st[dmCatVal(f, d)] = false; });
    }
    renderCatalogueFilters();
  }
  function resetCatalogueFilters(){
    Object.keys(dmCatState).forEach(k => { delete dmCatState[k]; });
    const nos = q('dmCatDesignNos'); if (nos) nos.value = '';
    renderCatalogueFilters();
  }

  function selectedDesigns(){
    const ctx = dmCatCtx();
    return ctx.live.filter(d => dmCatPass(ctx, d, null));
  }

  function catStatus(msg){ const el = q('dmCatStatus'); if (el) el.textContent = msg || ''; }

  /* opts.max = how many designs to render on screen (the auto-preview limit).
     dmCatalogue always receives and returns the FULL selection, so the PDF is
     completely unaffected by this limit. */
  function generatePreview(opts){
    const area = q('dmCataloguePrintArea'); if (!area) return [];
    dmCatalogue = selectedDesigns();
    if (!dmCatalogue.length) {
      area.innerHTML = '<div class="dm-cat-page" style="min-height:auto;padding:36px;text-align:center;">' +
                       '<h3>No design matches this filter.</h3></div>';
      catStatus('');
      return [];
    }
    const max = (opts && opts.max) || 0;
    const shown = (max && dmCatalogue.length > max) ? dmCatalogue.slice(0, max) : dmCatalogue;
    const hidden = dmCatalogue.length - shown.length;
    area.innerHTML = (hidden
      ? '<div class="dm-cat-more">Showing the first <b>' + shown.length + '</b> designs below. '
        + 'This filter has <b>' + dmCatalogue.length + '</b>; to see the remaining <b>' + hidden + '</b>, '
        + 'press <b>Generate Full Preview</b>. <br>'
        + '<b>The PDF is not affected by this limit</b>: Download / Open always covers all ' + dmCatalogue.length + ' designs.</div>'
      : '') + shown.map(d => {
      const m = masterOf(d), src = dmImgSrc(m);
      const slaves = (d.matchings || []).filter(x => !m || x.id !== m.id);
      let html =
        '<div class="dm-cat-page">' +
          '<div class="dm-cat-head"><h1>Sarv India Home Furnishing</h1><p>PREMIUM COLLECTION</p></div>' +
          (src ? '<img class="dm-cat-cover" loading="lazy" src="' + esc(src) + '" alt="">'
               : '<div class="dm-cat-cover-none">[ NO IMAGE ]</div>') +
          '<h2 style="text-align:center;margin:12px 0 0;font-size:15pt;">' +
            esc(m ? m.matching_name : '—') + ' (MASTER)</h2>' +
          '<table class="dm-cat-specs">' +
            '<tr><th>DESIGN NO</th><td><strong>' + esc(d.design_no) + '</strong></td>' +
                '<th>SKU NO</th><td><strong>' + esc(d.design_sku_no || '—') + '</strong></td></tr>' +
            '<tr><th>MONOPOLY</th><td><strong style="color:' + (d.monopoly === 'YES' ? '#dc2626' : 'inherit') + ';">' +
                esc(d.monopoly || 'NO') + '</strong></td>' +
                '<th>FRAME TYPE</th><td>' + esc(d.frame_type || '—') + '</td></tr>' +
            '<tr><th>PARTY / BRAND</th><td><strong>' + esc(d.party_name || '') + '</strong> (' + esc(d.brand_name || '') + ')</td>' +
                '<th>DESIGN TYPE</th><td><strong style="color:#2563eb;">' + esc(d.design_type || 'N/A') + '</strong></td></tr>' +
            '<tr><th>UNIT / BED</th><td>' + esc(d.design_unit || '') + ' (' + esc(d.bed_size || '') + ')</td>' +
                '<th>QUALITY</th><td>' + esc((m && m.blanket_quality) || d.blanket_quality || '') + '</td></tr>' +
            '<tr><th>FRAMES (L/M/S)</th><td>L: ' + num(d.large_frame) + ' | M: ' + num(d.medium_frame) +
                ' | S: ' + num(d.small_frame) + '</td>' +
                '<th>TOTAL FRAMES</th><td><strong style="font-size:12pt;">' + totalFrames(d) + '</strong></td></tr>' +
            '<tr><th>SUPPLIER</th><td>' + esc(d.supplier_name || '—') + '</td>' +
                '<th>TOTAL MATCHINGS</th><td>' + (d.matchings || []).length + ' shades</td></tr>' +
          '</table>' +
          '<div class="dm-cat-foot"><span>Design #' + esc(d.design_no) + '</span><span>Cover Page</span></div>' +
        '</div>';
      for (let pg = 0; pg < Math.ceil(slaves.length / 8); pg++) {
        const cards = slaves.slice(pg * 8, pg * 8 + 8).map(sm => {
          const s = dmImgSrc(sm);
          return '<div class="dm-cat-card">' +
            (s ? '<img loading="lazy" src="' + esc(s) + '" alt="">' : '<div class="dm-cat-none">[No Image]</div>') +
            '<div class="t">' + esc(sm.matching_name) + '</div>' +
            '<div class="s">Quality: ' + esc(sm.blanket_quality || d.blanket_quality || '') + '</div></div>';
        }).join('');
        html += '<div class="dm-cat-page"><div class="dm-cat-head"><h1>Sarv India</h1><p>DESIGN: ' +
                esc(d.design_no) + ' | MATCHINGS</p></div>' +
                '<div class="dm-cat-grid">' + cards + '</div>' +
                '<div class="dm-cat-foot"><span>Design #' + esc(d.design_no) + '</span><span>Page ' + (pg + 2) + '</span></div></div>';
      }
      return html;
    }).join('');
    // Page count of the FULL selection, which is what goes into the PDF, not
    // the designs shown on screen.
    const pages = dmCatalogue.reduce((n, d) => {
      const m = masterOf(d);
      return n + 1 + Math.ceil((d.matchings || []).filter(x => !m || x.id !== m.id).length / 8);
    }, 0);
    catStatus(dmCatalogue.length + ' designs · ~' + pages + ' pages'
      + (hidden ? ' · preview me ' + shown.length : ''));
    return dmCatalogue;
  }

  /* ── jsPDF se asli PDF file (A4 portrait) ───────────────────────────── */
  const A4 = { w: 210, h: 297, mx: 12, top: 12, bot: 14 };

  function pdfHeader(doc, title, sub){
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(15, 23, 42);
    doc.text(title, A4.w / 2, A4.top + 7, { align: 'center' });
    doc.setFontSize(8.5); doc.setTextColor(71, 85, 105);
    doc.text(sub, A4.w / 2, A4.top + 13, { align: 'center' });
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.6); doc.line(A4.mx, A4.top + 16.5, A4.w - A4.mx, A4.top + 16.5);
    doc.setLineWidth(0.2); doc.line(A4.mx, A4.top + 17.7, A4.w - A4.mx, A4.top + 17.7);
    doc.setTextColor(0, 0, 0);
  }
  function pdfFooter(doc, left, right){
    const y = A4.h - A4.bot + 4;
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2);
    doc.line(A4.mx, y - 4, A4.w - A4.mx, y - 4);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
    doc.text(String(left), A4.mx, y);
    doc.text(String(right), A4.w - A4.mx, y, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
  /* Centres the image inside the box at its original aspect ratio. */
  function pdfImage(doc, img, x, y, w, h){
    doc.setDrawColor(203, 213, 225); doc.setFillColor(248, 250, 252);
    doc.rect(x, y, w, h, 'FD');
    if (!img) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(148, 163, 184);
      doc.text('[ NO IMAGE ]', x + w / 2, y + h / 2, { align: 'center', baseline: 'middle' });
      doc.setTextColor(0, 0, 0);
      return;
    }
    const s = Math.min(w / img.w, h / img.h);
    const iw = img.w * s, ih = img.h * s;
    try { doc.addImage(img.dataUrl, img.fmt, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); }
    catch (e) { console.warn('[DM] addImage fail:', e.message || e); }
  }

  async function buildCataloguePdf(){
    if (typeof jspdfNativeReady_ === 'function' ? !jspdfNativeReady_() : !(window.jspdf && window.jspdf.jsPDF)) {
      toast('jsPDF did not load. Please reload the page.', 'error');
      return null;
    }
    /* The PDF is always built from the CURRENT filters: the preview is
       re-rendered and the list taken from it, so the PDF has exactly what is
       on screen (changing a filter and pressing Download won't use an old selection). */
    const list = generatePreview();
    if (!list.length) { toast('No design matches this filter.', 'warn'); return null; }

    /* Fetch all the photos first (with caching), so there is no network wait
       in the middle of building the PDF, and a photo used twice is downloaded
       only once. */
    const urls = [];
    list.forEach(d => (d.matchings || []).forEach(m => { const s = dmImgSrc(m); if (s && urls.indexOf(s) < 0) urls.push(s); }));
    const loaded = new Map();
    for (let i = 0; i < urls.length; i++) {
      catStatus('Loading photos (' + (i + 1) + '/' + urls.length + ')…');
      loaded.set(urls[i], await imgData(urls[i]));
    }
    catStatus('Building the PDF…');

    const jsPDF = window.jspdf.jsPDF;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const stamp = new Date().toLocaleString('en-GB');
    let first = true;

    list.forEach(d => {
      const m = masterOf(d);
      const slaves = (d.matchings || []).filter(x => !m || x.id !== m.id);

      // ── cover page ──
      if (!first) doc.addPage();
      first = false;
      pdfHeader(doc, 'SARV INDIA HOME FURNISHING', 'PREMIUM COLLECTION');
      pdfImage(doc, m ? loaded.get(dmImgSrc(m)) : null, A4.mx, A4.top + 22, A4.w - 2 * A4.mx, 108);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      doc.text(((m && m.matching_name) || '—') + '   (MASTER)', A4.w / 2, A4.top + 139, { align: 'center' });

      doc.autoTable({
        startY: A4.top + 146,
        margin: { left: A4.mx, right: A4.mx },
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.4, lineColor: [203, 213, 225], lineWidth: 0.2, textColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 42, fillColor: [248, 250, 252], fontStyle: 'bold', textColor: [51, 65, 85] },
          1: { cellWidth: 51 },
          2: { cellWidth: 42, fillColor: [248, 250, 252], fontStyle: 'bold', textColor: [51, 65, 85] },
          3: { cellWidth: 51 }
        },
        body: [
          ['DESIGN NO', String(d.design_no || ''), 'SKU NO', String(d.design_sku_no || '-')],
          ['MONOPOLY', String(d.monopoly || 'NO'), 'DESIGN TYPE', String(d.design_type || 'N/A')],
          ['PARTY / BRAND', (d.party_name || '') + ' (' + (d.brand_name || '') + ')', 'BED SIZE', String(d.bed_size || '-')],
          // Bed Size already has its own row (above), so only Unit here;
          // printing the same thing in two places adds nothing.
          ['DESIGN UNIT', String(d.design_unit || '-'), 'QUALITY', String((m && m.blanket_quality) || d.blanket_quality || '')],
          ['FRAME TYPE', String(d.frame_type || ''), 'TOTAL FRAMES', String(totalFrames(d))],
          ['FRAMES L / M / S', num(d.large_frame) + ' / ' + num(d.medium_frame) + ' / ' + num(d.small_frame),
           'TOTAL MATCHINGS', String((d.matchings || []).length)],
          // Plain characters such as '-' and '·' only: beyond that, the WinAnsi
          // set of jsPDF's standard helvetica can't be relied on.
          ['SUPPLIER', String(d.supplier_name || '-'), '', '']
        ]
      });
      pdfFooter(doc, 'Design #' + (d.design_no || ''), 'Cover Page  ·  ' + stamp);

      // ── matching pages: 2 × 4 grid ──
      const perPage = 8, cols = 2, rows = 4, gap = 5, gridTop = A4.top + 22;
      const cardW = (A4.w - 2 * A4.mx - gap) / cols;
      const cardH = (A4.h - A4.bot - gridTop - gap * (rows - 1)) / rows;
      for (let pg = 0; pg < Math.ceil(slaves.length / perPage); pg++) {
        doc.addPage();
        pdfHeader(doc, 'SARV INDIA', 'DESIGN: ' + (d.design_no || '') + '   |   MATCHINGS');
        slaves.slice(pg * perPage, pg * perPage + perPage).forEach((sm, i) => {
          const x = A4.mx + (i % cols) * (cardW + gap);
          const y = gridTop + Math.floor(i / cols) * (cardH + gap);
          doc.setDrawColor(203, 213, 225); doc.setFillColor(255, 255, 255);
          doc.roundedRect(x, y, cardW, cardH, 1.6, 1.6, 'FD');
          pdfImage(doc, loaded.get(dmImgSrc(sm)), x + 2.5, y + 2.5, cardW - 5, cardH - 16);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6); doc.setTextColor(30, 41, 59);
          doc.text(String(sm.matching_name || ''), x + cardW / 2, y + cardH - 9.5, { align: 'center', maxWidth: cardW - 5 });
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2); doc.setTextColor(100, 116, 139);
          doc.text('Quality: ' + String(sm.blanket_quality || d.blanket_quality || ''),
                   x + cardW / 2, y + cardH - 4.5, { align: 'center', maxWidth: cardW - 5 });
          doc.setTextColor(0, 0, 0);
        });
        pdfFooter(doc, 'Design #' + (d.design_no || ''), 'Matchings Page ' + (pg + 1) + '  ·  ' + stamp);
      }
    });

    catStatus(list.length + ' designs · ' + doc.getNumberOfPages() + ' pages');
    return doc;
  }

  function pdfFileName(){
    const base = (dmCatalogue.length === 1) ? ('Design_' + pathSafe(dmCatalogue[0].design_no)) : 'Sarv_Catalogue';
    return base + '_' + new Date().toISOString().slice(0, 10) + '.pdf';
  }
  async function downloadPdf(){
    const doc = await buildCataloguePdf(); if (!doc) return;
    // Through downloadBlob (store-core.js) rather than doc.save(), so the
    // ERP's download stamp (user + time footer) is applied like everywhere else.
    downloadBlob(doc.output('blob'), pdfFileName());
    toast('Catalogue PDF downloaded.', 'success');
  }
  async function openPdf(){
    const doc = await buildCataloguePdf(); if (!doc) return;
    const win = window.open(doc.output('bloburl'), '_blank');
    if (!win) toast('The popup was blocked. Use “Download PDF” instead.', 'warn');
  }

  /* ════════════════════════════════════════════════════════════════════
     ONLINE CATALOGUE — the saved photoshoots as a customer presentation
     ----------------------------------------------------------------------
     A landscape, slide-like PDF meant to be sent to customers (WhatsApp /
     email) as a catalogue-cum-quotation:

       1. Cover        company, catalogue title, "prepared for", contact,
                       one big photoshoot photo
       2. Index        "The Collection": a card per design; tapping a card
                       jumps to that design's page (PDF internal links)
       3. One page per design: ALL its photoshoot photos fitted on that one
                       page (the layout adapts to the count and the photos'
                       shape), its specs, its shades as small swatches, and
                       the rate box, which opens WhatsApp / mail with the
                       design number already written
       4. Quotation    summary table (rates if printed) + terms
       5. Thank-you    contact buttons (WhatsApp, call, email, website),
                       factory address, GSTIN

     Deliberately NOT printed: party, brand, supplier, frames (internal /
     another customer's information). MONOPOLY designs are left out unless
     ticked, since they are made exclusively for one party.

     The on-screen preview IS the generated PDF (in a frame), so what is
     seen is exactly what is sent, links included. jsPDF's standard
     helvetica only covers WinAnsi, so "Rs." is used, not the rupee sign.
  ════════════════════════════════════════════════════════════════════ */
  const OC = { w: 297, h: 210, m: 12 };
  const OC_C = {
    navy: [10, 58, 94], ink: [30, 41, 59], muted: [100, 116, 139], gold: [176, 137, 74],
    paper: [246, 244, 239], soft: [203, 213, 225], light: [203, 213, 225], white: [255, 255, 255]
  };
  // Settings that are the same for every catalogue a person sends; kept in
  // this browser only (a convenience, so they needn't be typed every time).
  const OC_KEEP = ['dmOcTitle', 'dmOcPerson', 'dmOcPhone', 'dmOcEmail', 'dmOcWebsite', 'dmOcRateUnit', 'dmOcMoq', 'dmOcTerms'];
  const OC_STORE = 'dm_oc_settings_v1';
  const OC_TERMS = [
    'All rates are exclusive of GST; GST extra as applicable.',
    'Rates are valid for 15 days from the date of this catalogue.',
    'Colours may vary slightly from the photographs.',
    'Delivery schedule as confirmed at the time of order.'
  ].join('\n');
  const OC_AUTO_MAX = 8;          // auto-preview only up to this many designs
  const ocRates = {};             // design id → rate typed in the list
  const ocCropCache = new Map();  // url|aspect|size → Promise<img>
  let ocTimer = null, ocBusy = false, ocAgain = false, ocUrl = '';

  const ocV = id => { const el = q(id); return el ? String(el.value || '').trim() : ''; };
  const ocStatus = t => { const el = q('dmOcStatus'); if (el) el.textContent = t || ''; };
  const ocMoney = v => 'Rs. ' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const ocCo = () => (typeof SARV_COMPANY !== 'undefined' && SARV_COMPANY) ? SARV_COMPANY : {
    fullName: 'SARV INDIA HOME FURNISHING', tagline: 'Manufacturers of all kinds of blankets',
    address: 'Panipat, Haryana', gstin: '', juris: 'Subject to Panipat Jurisdiction'
  };

  function ocInit(){
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(OC_STORE) || '{}') || {}; } catch (e) { saved = {}; }
    const def = {
      dmOcTitle: 'Premium Blanket Collection', dmOcRateUnit: 'per piece', dmOcTerms: OC_TERMS,
      dmOcWebsite: (typeof SARV_WEBSITE_URL !== 'undefined' ? SARV_WEBSITE_URL : 'https://www.sarvindia.com').replace(/^https?:\/\//, '')
    };
    OC_KEEP.forEach(id => { const el = q(id); if (el) el.value = (saved[id] != null ? saved[id] : (def[id] || '')); });
    const keep = () => {
      const o = {}; OC_KEEP.forEach(id => { o[id] = q(id) ? q(id).value : ''; });
      try { localStorage.setItem(OC_STORE, JSON.stringify(o)); } catch (e) {}
    };
    OC_KEEP.concat(['dmOcCustomer']).forEach(id => { const el = q(id); if (el) el.addEventListener('input', () => { keep(); ocSchedule(); }); });
    q('dmOcShowRate').addEventListener('change', ocSchedule);
    // Filter ticks: the rows keep re-rendering, so the listener sits on the grid.
    q('dmOcFilterGrid').addEventListener('change', e => {
      const cb = e.target.closest('input[type=checkbox]');
      if (!cb || !cb.name) return;
      const st = ocCatState[cb.name] || (ocCatState[cb.name] = {});
      if (cb.checked) delete st[cb.value]; else st[cb.value] = false;
      ocRender();
    });
    let t = null;
    q('dmOcNoSearch').addEventListener('input', () => { clearTimeout(t); t = setTimeout(ocRenderFilters, 150); });
    q('dmOcList').addEventListener('input', e => {
      const r = e.target.closest('.oc-rate'); if (!r) return;
      ocRates[+r.dataset.id] = r.value; ocSchedule();
    });
  }

  /* ══ DEPENDENT MULTI-SELECT FILTERS (same engine as the Catalogue PDF) ═
     Its own tick state (ocCatState), so the two tabs never disturb each
     other, but the same rules: a column's options are what is left after ALL
     the other columns; only unticks are remembered, so a value that comes
     back returns ticked. Design No is a column like the others, so its list
     shrinks / grows with every other filter. The design pool is only LIVE
     designs that have photoshoot photos. MONOPOLY = YES starts unticked: a
     monopoly design is made for one party and must not reach other
     customers by accident. */
  const OC_FILTERS = [
    { name:'ocUnitF',     box:'dmOcUnitBox',     count:'dmOcUnitCount',     get:d => d.design_unit },
    { name:'ocBedF',      box:'dmOcBedBox',      count:'dmOcBedCount',      get:d => d.bed_size },
    { name:'ocQualityF',  box:'dmOcQualityBox',  count:'dmOcQualityCount',  get:d => d.blanket_quality },
    { name:'ocPartyF',    box:'dmOcPartyBox',    count:'dmOcPartyCount',    get:d => d.party_name },
    { name:'ocBrandF',    box:'dmOcBrandBox',    count:'dmOcBrandCount',    get:d => d.brand_name },
    { name:'ocSupplierF', box:'dmOcSupplierBox', count:'dmOcSupplierCount', get:d => d.supplier_name },
    { name:'ocTypeF',     box:'dmOcTypeBox',     count:'dmOcTypeCount',     get:d => d.design_type },
    { name:'ocFramesF',   box:'dmOcFramesBox',   count:'dmOcFramesCount',   get:d => String(totalFrames(d)) },
    { name:'ocMonoF',     box:'dmOcMonoBox',     count:'dmOcMonoCount',     get:d => d.monopoly || 'NO' },
    { name:'ocSkuF',      box:'dmOcSkuBox',      count:'dmOcSkuCount',      get:d => d.design_sku_no },
    { name:'ocNoF',       box:'dmOcNoBox',       count:'dmOcNoCount',       get:d => d.design_no },
  ];
  const ocDefaultState = () => ({ ocMonoF: { YES: false } });
  let ocCatState = ocDefaultState();
  const ocChecked = (name, v) => !(ocCatState[name] && ocCatState[name][v] === false);

  // Only designs that can be shown: LIVE and with at least one photoshoot photo.
  const ocCandidates = () => dmDesigns.filter(d => d.status === 'LIVE' && psOf(d).length);
  function ocCtx(){
    const live = ocCandidates();
    const picked = {};
    OC_FILTERS.forEach(f => {
      picked[f.name] = new Set([...new Set(live.map(d => dmCatVal(f, d)))].filter(v => ocChecked(f.name, v)));
    });
    return { live: live, picked: picked };
  }
  const ocPass = (ctx, d, skip) => OC_FILTERS.every(f => f.name === skip || ctx.picked[f.name].has(dmCatVal(f, d)));
  function ocFiltered(){
    const ctx = ocCtx();
    return ctx.live.filter(d => ocPass(ctx, d, null)).sort((a, b) => dmCatSort(a.design_no, b.design_no));
  }
  const ocSelected = ocFiltered;

  function ocRenderFilters(){
    const ctx = ocCtx();
    const search = up(ocV('dmOcNoSearch'));
    OC_FILTERS.forEach(f => {
      const avail = [...new Set(ctx.live.filter(d => ocPass(ctx, d, f.name)).map(d => dmCatVal(f, d)))].sort(dmCatSort);
      // The Design No search only narrows what is shown; ticks stay as they are.
      const shown = (f.name === 'ocNoF' && search) ? avail.filter(v => sarvSearchMatch(v, search)) : avail;
      const box = q(f.box);
      if (box) box.innerHTML = shown.length
        ? shown.map(v => '<label><input type="checkbox" name="' + f.name + '" value="' + esc(v) + '"' +
            (ocChecked(f.name, v) ? ' checked' : '') + '> ' + esc(v) + '</label>').join('')
        : '<span class="dm-empty">' + (avail.length ? 'No design no matches this search' : 'Nothing left here after the other filters') + '</span>';
      const c = q(f.count);
      if (c) {
        const on = avail.filter(v => ocChecked(f.name, v)).length;
        c.textContent = avail.length ? (on + '/' + avail.length) : '0';
        c.className = 'dm-fcount' + (avail.length && on < avail.length ? ' on' : '');
      }
    });
    const mc = q('dmOcMatchCount');
    if (mc) mc.textContent = ctx.live.filter(d => ocPass(ctx, d, null)).length + ' / ' + ctx.live.length + ' designs with photoshoots match this filter';
  }
  /* All / Clear: the whole column record, so values hidden by a cross-filter
     follow too (same as the Catalogue PDF tab). */
  function ocToggle(name, all){
    const f = OC_FILTERS.find(x => x.name === name); if (!f) return;
    const st = ocCatState[name] = {};
    if (!all) ocCandidates().forEach(d => { st[dmCatVal(f, d)] = false; });
    ocRender();
  }
  function ocResetFilters(){
    ocCatState = ocDefaultState();
    const s = q('dmOcNoSearch'); if (s) s.value = '';
    ocRender();
  }

  function ocRender(){
    ocRenderFilters();
    const cands = ocCandidates();
    const list = ocFiltered();
    const tb = q('dmOcList');
    if (tb) tb.innerHTML = list.length ? list.map((d, i) =>
      '<tr><td>' + (i + 1) + '</td>' +
      '<td><strong>' + esc(d.design_no) + '</strong>' + (d.monopoly === 'YES' ? ' <span class="dm-badge dm-badge-mono">MONOPOLY</span>' : '') + '</td>' +
      '<td>' + esc(d.design_sku_no || '—') + '</td>' +
      '<td>' + esc(d.blanket_quality || '') + '</td>' +
      '<td>' + esc(d.bed_size || '') + '</td>' +
      '<td>' + (d.matchings || []).length + '</td>' +
      '<td>' + psOf(d).length + '</td>' +
      '<td><input type="number" min="0" step="0.01" class="dm-bulk-in oc-rate" data-id="' + d.id + '" value="' + esc(ocRates[d.id] || '') + '" placeholder="optional"></td></tr>'
    ).join('')
      : '<tr><td colspan="8" class="dm-empty-row">' + (dmPsMissing
          ? 'Photoshoot table not found. Run DESIGN_PHOTOSHOOT_MIGRATION.sql first.'
          : (cands.length ? 'No design matches these filters.' : 'No design has photoshoot photos yet. Add them from the Add Photoshoot tab.')) + '</td></tr>';
    ocSchedule();
  }

  /* Small selections preview by themselves (debounced); a big one waits for
     the button, since every preview loads and places every photo. */
  function ocSchedule(){
    const pane = q('dmOnlineCatPane');
    if (!pane || !pane.classList.contains('active')) return;
    clearTimeout(ocTimer);
    const n = ocSelected().length;
    if (!n) { ocShow(''); ocStatus('No design selected.'); return; }
    if (n > OC_AUTO_MAX) { ocStatus(n + ' designs selected · press Full Preview to see the PDF'); return; }
    ocTimer = setTimeout(() => ocPreview(false), 900);
  }
  function ocShow(url){
    const box = q('dmOcPreview'); if (!box) return;
    if (ocUrl) { try { URL.revokeObjectURL(ocUrl); } catch (e) {} }
    ocUrl = url || '';
    box.innerHTML = url ? '<iframe class="dm-oc-frame" title="Online Catalogue preview" src="' + url + '#view=FitH"></iframe>' : '';
  }
  async function ocPreview(){
    if (ocBusy) { ocAgain = true; return; }
    ocBusy = true;
    try {
      const doc = await ocBuild();
      if (doc) ocShow(doc.output('bloburl'));
    } catch (e) {
      console.error('[DM] online catalogue fail:', e);
      ocStatus('Preview failed: ' + (e.message || e));
    } finally {
      ocBusy = false;
      if (ocAgain) { ocAgain = false; ocPreview(); }
    }
  }

  /* Cover-crops a photo to the box's shape (so every tile is filled edge to
     edge, like a slide), and downsizes it for the PDF. A photo whose shape is
     very different from the box is NOT cropped (that would cut the blanket);
     it is only resized and later placed whole (`contain`). */
  function ocCrop(url, img, aspect, maxSide){
    if (!img) return Promise.resolve(null);
    const key = url + '|' + aspect.toFixed(3) + '|' + maxSide;
    if (ocCropCache.has(key)) return ocCropCache.get(key);
    const p = new Promise(resolve => {
      const ia = img.w / img.h;
      const contain = Math.abs(Math.log(ia / aspect)) > Math.log(1.6);
      let sw = img.w, sh = img.h;
      if (!contain) { if (ia > aspect) sw = img.h * aspect; else sh = img.w / aspect; }
      const sc = Math.min(1, maxSide / Math.max(sw, sh));
      const tw = Math.max(1, Math.round(sw * sc)), th = Math.max(1, Math.round(sh * sc));
      const el = new Image();
      el.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = tw; c.height = th;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th);
          ctx.drawImage(el, (img.w - sw) / 2, (img.h - sh) / 2, sw, sh, 0, 0, tw, th);
          resolve({ dataUrl: c.toDataURL('image/jpeg', 0.86), w: tw, h: th, fmt: 'JPEG', contain: contain });
        } catch (e) { resolve(Object.assign({ contain: true }, img)); }
      };
      el.onerror = () => resolve(null);
      el.src = img.dataUrl;
    });
    ocCropCache.set(key, p);
    return p;
  }
  // Places a photo filling the box; a missing photo becomes a quiet placeholder.
  async function ocImg(doc, url, img, x, y, w, h, maxSide){
    const r = await ocCrop(url, img, w / h, maxSide || 1400);
    if (!r) {
      doc.setFillColor.apply(doc, OC_C.paper); doc.rect(x, y, w, h, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor.apply(doc, OC_C.muted);
      doc.text('PHOTO', x + w / 2, y + h / 2, { align: 'center', baseline: 'middle' });
      return;
    }
    try {
      if (!r.contain) { doc.addImage(r.dataUrl, r.fmt, x, y, w, h); return; }
      doc.setFillColor.apply(doc, OC_C.paper); doc.rect(x, y, w, h, 'F');
      const s = Math.min(w / r.w, h / r.h), iw = r.w * s, ih = r.h * s;
      doc.addImage(r.dataUrl, r.fmt, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
    } catch (e) { console.warn('[DM] oc addImage fail:', e.message || e); }
  }

  /* Where each photo goes on a design page. 1 photo = the whole area;
     2 = side by side; 3–5 = one large "hero" photo + the rest beside it;
     more = the column count that gives each photo the largest size for the
     photos' own shape (`aspect` = width / height). A short last row is
     centred. Same function for every page, so all pages feel alike. */
  function ocLayout(n, box, aspect, gap){
    if (n <= 0) return [];
    if (n === 1) return [box];
    if (n >= 3 && n <= 5) {
      const hw = (box.w - gap) * (aspect >= 1.2 ? 0.5 : 0.48);
      const hero = { x: box.x, y: box.y, w: hw, h: box.h };
      const rest = ocGrid(n - 1, { x: box.x + hw + gap, y: box.y, w: box.w - hw - gap, h: box.h }, aspect, gap);
      return [hero].concat(rest);
    }
    return ocGrid(n, box, aspect, gap);
  }
  function ocGrid(n, box, aspect, gap){
    let best = null;
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      const cw = (box.w - gap * (c - 1)) / c, ch = (box.h - gap * (r - 1)) / r;
      if (cw <= 0 || ch <= 0) continue;
      // Size of the photo kept whole in the cell; crop then only trims a little.
      const fw = Math.min(cw, ch * aspect);
      const score = fw * (fw / aspect) * n - (c * r - n) * 0.15 * cw * ch;
      if (!best || score > best.score) best = { c: c, r: r, cw: cw, ch: ch, score: score };
    }
    const out = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / best.c), col = i % best.c;
      const inRow = Math.min(best.c, n - row * best.c);
      const off = (best.c - inRow) * (best.cw + gap) / 2;
      out.push({ x: box.x + off + col * (best.cw + gap), y: box.y + row * (best.ch + gap), w: best.cw, h: best.ch });
    }
    return out;
  }

  /* The Customer & Contact boxes were taken off the screen on request, so
     every value here falls back to the company default when its box is not
     on the page (title, website from SARV_WEBSITE_URL, "per piece", the
     standard terms). Putting a box back with the same id brings its value
     back into the PDF without any other change. */
  function ocSettings(){
    const site = q('dmOcWebsite') ? ocV('dmOcWebsite')
      : (typeof SARV_WEBSITE_URL !== 'undefined' ? SARV_WEBSITE_URL : 'https://www.sarvindia.com').replace(/^https?:\/\//, '');
    const phone = ocV('dmOcPhone');
    let digits = phone.replace(/\D/g, '');
    if (digits.length === 10) digits = '91' + digits;
    return {
      title: ocV('dmOcTitle') || 'Premium Blanket Collection',
      customer: ocV('dmOcCustomer'), person: ocV('dmOcPerson'),
      phone: phone, wa: digits.length >= 11 ? digits : '', email: ocV('dmOcEmail'),
      site: site, siteUrl: site ? (/^https?:\/\//i.test(site) ? site : 'https://' + site) : '',
      unit: ocV('dmOcRateUnit') || 'per piece', moq: ocV('dmOcMoq'),
      terms: (q('dmOcTerms') ? ocV('dmOcTerms') : OC_TERMS).split(/\n+/).map(s => s.trim()).filter(Boolean),
      showRate: !!(q('dmOcShowRate') && q('dmOcShowRate').checked),
      date: new Date().toLocaleDateString('en-GB'),
      month: new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    };
  }
  const ocRate = (d, s) => {
    const v = parseFloat(ocRates[d.id]);
    return (s.showRate && Number.isFinite(v) && v > 0) ? v : null;
  };
  // The enquiry link: WhatsApp with the design already named, else mail.
  function ocEnquire(s, d){
    const msg = 'Hello Sarv India, I am interested in ' + (d ? 'design ' + d.design_no : 'your ' + s.title) +
                (s.customer ? ' (' + s.customer + ')' : '') + '. Please share details.';
    if (s.wa) return 'https://wa.me/' + s.wa + '?text=' + encodeURIComponent(msg);
    if (s.email) return 'mailto:' + s.email + '?subject=' + encodeURIComponent('Enquiry: ' + (d ? 'Design ' + d.design_no : s.title)) + '&body=' + encodeURIComponent(msg);
    return s.siteUrl || '';
  }
  // A design's photoshoot photos, in its matching order (MASTER first).
  function ocPhotos(d){
    const order = (d.matchings || []).map(m => up(m.matching_name));
    const rank = n => { const i = order.indexOf(up(n)); return i < 0 ? 999 : i; };
    return psOf(d).slice().sort((a, b) => rank(a.matching_name) - rank(b.matching_name) || a.id - b.id)
      .map(p => ({ p: p, url: dmImgSrc(p) })).filter(x => x.url);
  }
  function ocLogo(doc, x, y, w){
    try { if (typeof SARV_LOGO_DATA_URL !== 'undefined') doc.addImage(SARV_LOGO_DATA_URL, 'PNG', x, y, w, w * 161 / 320); }
    catch (e) {}
  }
  const ocFill = (doc, c) => doc.setFillColor(c[0], c[1], c[2]);
  const ocInk = (doc, c) => doc.setTextColor(c[0], c[1], c[2]);
  const ocDraw = (doc, c) => doc.setDrawColor(c[0], c[1], c[2]);

  // Header of the inner pages: logo + company on the left, page title on the right.
  function ocHead(doc, title, sub){
    const co = ocCo();
    ocLogo(doc, OC.m, 7.5, 22);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); ocInk(doc, OC_C.navy);
    doc.text(String(co.fullName || 'SARV INDIA HOME FURNISHING'), OC.m + 25, 12.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); ocInk(doc, OC_C.muted);
    doc.text('Manufacturers of all kinds of blankets  ·  Panipat, Haryana', OC.m + 25, 17);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); ocInk(doc, OC_C.navy);
    doc.text(String(title), OC.w - OC.m, 13, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); ocInk(doc, OC_C.gold);
    doc.text(String(sub || ''), OC.w - OC.m, 18.5, { align: 'right' });
    ocDraw(doc, OC_C.gold); doc.setLineWidth(0.5); doc.line(OC.m, 23, OC.w - OC.m, 23);
  }
  function ocFoot(doc, pageNo, total, s, backTo){
    ocDraw(doc, OC_C.soft); doc.setLineWidth(0.2); doc.line(OC.m, 200.5, OC.w - OC.m, 200.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); ocInk(doc, OC_C.muted);
    const left = 'Sarv India Home Furnishing' + (s.site ? '  ·  ' + s.site : '');
    doc.text(left, OC.m, 205.5);
    if (s.siteUrl) doc.link(OC.m, 202, doc.getTextWidth(left), 5, { url: s.siteUrl });
    doc.text('Page ' + pageNo + ' / ' + total, OC.w - OC.m, 205.5, { align: 'right' });
    if (backTo) {
      doc.setFont('helvetica', 'bold'); ocInk(doc, OC_C.gold);
      const t = 'Back to the collection';
      doc.text(t, OC.w / 2, 205.5, { align: 'center' });
      const tw = doc.getTextWidth(t);
      doc.link(OC.w / 2 - tw / 2, 202, tw, 5, { pageNumber: backTo });
    }
  }

  async function ocCover(doc, s, hero){
    const co = ocCo();
    ocFill(doc, OC_C.navy); doc.rect(0, 0, 118, OC.h, 'F');
    ocFill(doc, OC_C.gold); doc.rect(118, 0, 1.6, OC.h, 'F');
    await ocImg(doc, hero && hero.url, hero && hero.img, 119.6, 0, OC.w - 119.6, OC.h, 1800);
    ocFill(doc, OC_C.white); doc.roundedRect(14, 16, 50, 27, 2, 2, 'F');
    ocLogo(doc, 17, 18.5, 44);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(30); ocInk(doc, OC_C.white);
    doc.text('SARV INDIA', 14, 80);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(13);
    doc.text('HOME FURNISHING', 14, 89, { charSpace: 1.2 });
    ocDraw(doc, OC_C.gold); doc.setLineWidth(0.8); doc.line(14, 95, 60, 95);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); ocInk(doc, OC_C.white);
    const tl = doc.splitTextToSize(s.title, 92).slice(0, 3);
    doc.text(tl, 14, 106, { lineHeightFactor: 1.25 });
    let y = 106 + tl.length * 7;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); ocInk(doc, OC_C.light);
    doc.text('Collection  ·  ' + s.month, 14, y + 1);
    if (s.customer) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); ocInk(doc, OC_C.gold);
      doc.text('PREPARED FOR', 14, 140, { charSpace: 0.6 });
      doc.setFontSize(13); ocInk(doc, OC_C.white);
      doc.text(doc.splitTextToSize(s.customer, 92).slice(0, 2), 14, 147);
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); ocInk(doc, OC_C.white);
    y = 168;
    const line = (t, url) => {
      doc.text(t, 14, y);
      if (url) doc.link(14, y - 3.5, doc.getTextWidth(t), 5, { url: url });
      y += 5.2;
    };
    if (s.person) line(s.person);
    if (s.phone) line('Phone / WhatsApp: ' + s.phone, s.wa ? 'https://wa.me/' + s.wa : 'tel:' + s.phone.replace(/\s+/g, ''));
    if (s.email) line(s.email, 'mailto:' + s.email);
    if (s.site) line(s.site, s.siteUrl);
    doc.setFontSize(6.8); ocInk(doc, OC_C.light);
    doc.text(doc.splitTextToSize(String(co.address || ''), 96).slice(0, 2), 14, 196);
  }

  async function ocIndex(doc, s, items, pageOf, total, list){
    ocHead(doc, 'THE COLLECTION', s.title + '  ·  ' + total + ' designs');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); ocInk(doc, OC_C.muted);
    doc.text('Tap any design to open its page.', OC.m, 29);
    const cols = 4, gap = 6, x0 = OC.m, y0 = 33;
    const cw = (OC.w - 2 * OC.m - gap * (cols - 1)) / cols, ch = (196 - y0 - gap) / 2;
    for (let i = 0; i < items.length; i++) {
      const it = items[i], d = it.d;
      const x = x0 + (i % cols) * (cw + gap), y = y0 + Math.floor(i / cols) * (ch + gap);
      ocDraw(doc, OC_C.soft); ocFill(doc, OC_C.white); doc.setLineWidth(0.25);
      doc.roundedRect(x, y, cw, ch, 1.5, 1.5, 'FD');
      await ocImg(doc, it.cover && it.cover.url, it.cover && it.cover.img, x + 2.5, y + 2.5, cw - 5, ch - 17, 700);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); ocInk(doc, OC_C.navy);
      doc.text('Design ' + d.design_no, x + 3, y + ch - 8.5, { maxWidth: cw - 26 });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); ocInk(doc, OC_C.muted);
      doc.text((d.matchings || []).length + ' shades  ·  ' + (d.blanket_quality || ''), x + 3, y + ch - 4, { maxWidth: cw - 6 });
      const rate = ocRate(d, s);
      if (rate) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); ocInk(doc, OC_C.gold);
        doc.text(ocMoney(rate), x + cw - 3, y + ch - 8.5, { align: 'right' });
      }
      doc.link(x, y, cw, ch, { pageNumber: pageOf(list.indexOf(d)) });
    }
  }

  async function ocDesign(doc, s, d, photos, swatches){
    ocHead(doc, 'DESIGN ' + d.design_no, s.title);
    const x = OC.m, w = 72;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); ocInk(doc, OC_C.gold);
    doc.text('DESIGN NO', x, 31, { charSpace: 0.6 });
    doc.setFontSize(22); ocInk(doc, OC_C.navy);
    doc.text(String(d.design_no), x, 40.5, { maxWidth: w });
    if (d.monopoly === 'YES') {
      ocFill(doc, OC_C.gold); doc.roundedRect(x + w - 19, 34.5, 19, 5.5, 1, 1, 'F');
      doc.setFontSize(6.5); ocInk(doc, OC_C.white); doc.text('EXCLUSIVE', x + w - 9.5, 38.2, { align: 'center' });
    }
    if (d.design_sku_no) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); ocInk(doc, OC_C.muted);
      doc.text('SKU  ' + d.design_sku_no, x, 46);
    }
    let y = 53;
    [['QUALITY', d.blanket_quality], ['BED SIZE', d.bed_size], ['DESIGN TYPE', d.design_type && d.design_type !== 'N/A' ? d.design_type : '']]
      .filter(r => r[1]).forEach(r => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); ocInk(doc, OC_C.muted);
        doc.text(r[0], x, y, { charSpace: 0.4 });
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); ocInk(doc, OC_C.ink);
        doc.text(String(r[1]), x, y + 5, { maxWidth: w });
        y += 11.5;
      });
    ocDraw(doc, OC_C.soft); doc.setLineWidth(0.2); doc.line(x, y - 2, x + w, y - 2);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); ocInk(doc, OC_C.gold);
    doc.text('AVAILABLE SHADES (' + (d.matchings || []).length + ')', x, y + 4, { charSpace: 0.4 });

    // Shade swatches: 2 per row, as many rows as fit above the rate box.
    const rateTop = 168, sy = y + 7, rowH = 11;
    const fit = Math.max(0, Math.floor((rateTop - 4 - sy) / rowH)) * 2;
    const all = d.matchings || [];
    const show = all.length > fit ? all.slice(0, Math.max(0, fit - 1)) : all;
    for (let i = 0; i < show.length; i++) {
      const m = show[i], sw = swatches.get(m.id);
      const cx = x + (i % 2) * 37, cy = sy + Math.floor(i / 2) * rowH;
      await ocImg(doc, sw && sw.url, sw && sw.img, cx, cy, 9, 9, 240);
      ocDraw(doc, OC_C.soft); doc.setLineWidth(0.2); doc.rect(cx, cy, 9, 9, 'S');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); ocInk(doc, OC_C.ink);
      const nm = doc.splitTextToSize(String(m.matching_name || ''), 26).slice(0, 2);
      doc.text(nm, cx + 11, cy + (nm.length > 1 ? 3.4 : 5.4), { lineHeightFactor: 1.15 });
    }
    if (all.length > show.length) {
      const i = show.length, cx = x + (i % 2) * 37, cy = sy + Math.floor(i / 2) * rowH;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); ocInk(doc, OC_C.navy);
      doc.text('+' + (all.length - show.length) + ' more shades', cx, cy + 5.4);
    }

    // Rate / enquiry box; the whole box opens WhatsApp (or mail).
    const rate = ocRate(d, s), link = ocEnquire(s, d);
    ocFill(doc, OC_C.navy); doc.roundedRect(x, rateTop, w, 27, 2, 2, 'F');
    ocFill(doc, OC_C.gold); doc.rect(x, rateTop + 5, 1.2, 17, 'F');
    if (rate) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); ocInk(doc, OC_C.light);
      doc.text('OFFER PRICE', x + 5, rateTop + 6.5, { charSpace: 0.5 });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(17); ocInk(doc, OC_C.white);
      doc.text(ocMoney(rate), x + 5, rateTop + 15.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); ocInk(doc, OC_C.light);
      doc.text(s.unit + (link ? '  ·  tap to order' : ''), x + 5, rateTop + 22);
    } else {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); ocInk(doc, OC_C.white);
      doc.text('Ask for the best price', x + 5, rateTop + 11.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); ocInk(doc, OC_C.light);
      doc.text(link ? (s.wa ? 'Tap to enquire on WhatsApp' : s.email ? 'Tap to enquire by email' : 'Tap to visit ' + (s.site || 'our website'))
                    : (s.phone || 'Contact us for rates'), x + 5, rateTop + 18.5);
    }
    if (link) doc.link(x, rateTop, w, 27, { url: link });

    // All the design's photoshoot photos on this one page.
    const box = { x: 90, y: 29, w: OC.w - OC.m - 90, h: 196 - 29 };
    const aspects = photos.filter(p => p.img).map(p => p.img.w / p.img.h).sort((a, b) => a - b);
    const aspect = aspects.length ? aspects[Math.floor(aspects.length / 2)] : 0.8;
    const rects = ocLayout(photos.length, box, aspect, photos.length > 8 ? 3 : 4);
    for (let i = 0; i < photos.length; i++) {
      const ph = photos[i], r = rects[i];
      await ocImg(doc, ph.url, ph.img, r.x, r.y, r.w, r.h, photos.length > 6 ? 1000 : 1500);
      if (r.h >= 32 && r.w >= 28 && ph.p.matching_name) {
        ocFill(doc, OC_C.white); doc.rect(r.x, r.y + r.h - 6, r.w, 6, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); ocInk(doc, OC_C.ink);
        doc.text(String(ph.p.matching_name), r.x + r.w / 2, r.y + r.h - 1.9, { align: 'center', maxWidth: r.w - 4 });
      }
    }
  }

  function ocQuote(doc, s, list, kinds){
    const anyRate = list.some(d => ocRate(d, s));
    const title = anyRate ? 'QUOTATION' : 'COLLECTION SUMMARY';
    const sub = s.title + '  ·  ' + s.date;
    doc.addPage(); kinds[doc.getNumberOfPages()] = 'quote';
    ocHead(doc, title, sub);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); ocInk(doc, OC_C.ink);
    if (s.customer) { doc.setFont('helvetica', 'bold'); doc.text('Prepared for: ' + s.customer, OC.m, 30); }
    doc.setFont('helvetica', 'normal'); ocInk(doc, OC_C.muted);
    doc.text('Date: ' + s.date + (s.moq ? '      Minimum order: ' + s.moq : ''), OC.m, 35);
    const head = ['#', 'DESIGN NO', 'SKU NO', 'QUALITY', 'BED SIZE', 'DESIGN TYPE', 'SHADES', 'PHOTOS'];
    if (anyRate) head.push('RATE (' + s.unit.toUpperCase() + ')');
    doc.autoTable({
      startY: 39,
      margin: { left: OC.m, right: OC.m, top: 28, bottom: 14 },
      theme: 'grid',
      head: [head],
      body: list.map((d, i) => {
        const r = [String(i + 1), String(d.design_no), String(d.design_sku_no || '-'), String(d.blanket_quality || '-'),
          String(d.bed_size || '-'), String(d.design_type && d.design_type !== 'N/A' ? d.design_type : '-'),
          String((d.matchings || []).length), String(psOf(d).length)];
        if (anyRate) { const v = ocRate(d, s); r.push(v ? ocMoney(v) : 'On request'); }
        return r;
      }),
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.2, lineColor: OC_C.soft, lineWidth: 0.2, textColor: OC_C.ink },
      headStyles: { fillColor: OC_C.navy, textColor: OC_C.white, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [249, 248, 245] },
      columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { fontStyle: 'bold' }, 6: { halign: 'center' }, 7: { halign: 'center' },
                      8: { halign: 'right', fontStyle: 'bold' } },
      didDrawPage: () => {
        const p = doc.getNumberOfPages();
        if (!kinds[p]) { kinds[p] = 'quote'; ocHead(doc, title, sub); }
      }
    });
    let y = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 60) + 9;
    if (!s.terms.length) return;
    const lines = s.terms.map(t => doc.splitTextToSize('-  ' + t, OC.w - 2 * OC.m));
    const need = 7 + lines.reduce((n, l) => n + l.length * 4.2, 0);
    if (y + need > 196) { doc.addPage(); kinds[doc.getNumberOfPages()] = 'quote'; ocHead(doc, title, sub); y = 31; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); ocInk(doc, OC_C.gold);
    doc.text('TERMS & CONDITIONS', OC.m, y, { charSpace: 0.5 });
    y += 5.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); ocInk(doc, OC_C.ink);
    lines.forEach(l => { doc.text(l, OC.m, y); y += l.length * 4.2; });
  }

  async function ocContact(doc, s, side){
    const co = ocCo();
    ocFill(doc, OC_C.navy); doc.rect(0, 0, OC.w, OC.h, 'F');
    await ocImg(doc, side && side.url, side && side.img, 205, 0, OC.w - 205, OC.h, 1400);
    ocFill(doc, OC_C.gold); doc.rect(203.4, 0, 1.6, OC.h, 'F');
    ocFill(doc, OC_C.white); doc.roundedRect(24, 22, 50, 27, 2, 2, 'F');
    ocLogo(doc, 27, 24.5, 44);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(34); ocInk(doc, OC_C.white);
    doc.text('Thank you', 24, 76);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(12); ocInk(doc, OC_C.light);
    doc.text('Let us make your next bestselling blanket range together.', 24, 86, { maxWidth: 170 });

    // Contact buttons: real links, so the customer can act from the PDF itself.
    const btns = [];
    if (s.wa) btns.push(['WhatsApp us', ocEnquire(s, null), true]);
    if (s.phone) btns.push(['Call ' + s.phone, 'tel:' + s.phone.replace(/\s+/g, ''), !s.wa]);
    if (s.email) btns.push(['Email us', 'mailto:' + s.email + '?subject=' + encodeURIComponent('Enquiry: ' + s.title), false]);
    if (s.siteUrl) btns.push(['Visit website', s.siteUrl, !s.wa && !s.phone]);
    let bx = 24;
    btns.slice(0, 4).forEach(b => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      const bw = Math.max(34, doc.getTextWidth(b[0]) + 12);
      if (b[2]) { ocFill(doc, OC_C.gold); doc.roundedRect(bx, 100, bw, 12, 2, 2, 'F'); ocInk(doc, OC_C.white); }
      else { ocDraw(doc, OC_C.white); doc.setLineWidth(0.4); doc.roundedRect(bx, 100, bw, 12, 2, 2, 'S'); ocInk(doc, OC_C.white); }
      doc.text(b[0], bx + bw / 2, 107.6, { align: 'center' });
      doc.link(bx, 100, bw, 12, { url: b[1] });
      bx += bw + 5;
    });

    let y = 128;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); ocInk(doc, OC_C.white);
    [s.person, s.phone && ('Phone / WhatsApp: ' + s.phone), s.email, s.site].filter(Boolean).forEach(t => { doc.text(t, 24, y); y += 5.6; });
    y = Math.max(y + 6, 160);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); ocInk(doc, OC_C.gold);
    doc.text('FACTORY', 24, y, { charSpace: 0.6 });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); ocInk(doc, OC_C.white);
    const ad = doc.splitTextToSize(String(co.fullName || '') + ', ' + String(co.address || ''), 170);
    doc.text(ad, 24, y + 5.5);
    y += 5.5 + ad.length * 4.4;
    doc.setFontSize(7.5); ocInk(doc, OC_C.light);
    doc.text([co.gstin ? 'GSTIN: ' + co.gstin : '', co.juris || ''].filter(Boolean).join('   ·   '), 24, y + 1.5);
  }

  async function ocBuild(){
    if (typeof jspdfNativeReady_ === 'function' ? !jspdfNativeReady_() : !(window.jspdf && window.jspdf.jsPDF)) {
      toast('jsPDF did not load. Please reload the page.', 'error');
      return null;
    }
    await loadPhotoshoots();
    const list = ocSelected();
    if (!list.length) { ocStatus('No design selected.'); return null; }
    const s = ocSettings();

    // Load every photo first (cached), so building the PDF has no network waits.
    const photosOf = new Map(), swatches = new Map();
    const jobs = [];
    list.forEach(d => {
      const ph = ocPhotos(d); photosOf.set(d.id, ph);
      ph.forEach(x => jobs.push(x));
      (d.matchings || []).forEach(m => { const u = dmImgSrc(m); if (u) { const x = { url: u }; swatches.set(m.id, x); jobs.push(x); } });
    });
    for (let i = 0; i < jobs.length; i++) {
      if (i % 4 === 0) ocStatus('Loading photos (' + (i + 1) + '/' + jobs.length + ')…');
      jobs[i].img = await imgData(jobs[i].url);
    }
    ocStatus('Building the catalogue…');

    const jsPDF = window.jspdf.jsPDF;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
    doc.setProperties({ title: 'Sarv India Home Furnishing - ' + s.title, author: 'Sarv India Home Furnishing', subject: s.customer ? 'Prepared for ' + s.customer : s.title });
    const kinds = {};
    const per = 8, idxPages = Math.ceil(list.length / per);
    const designPage = i => 1 + idxPages + i + 1;
    const firstPhoto = d => (photosOf.get(d.id) || [])[0] || null;

    kinds[1] = 'cover';
    await ocCover(doc, s, firstPhoto(list[0]));
    for (let p = 0; p < idxPages; p++) {
      doc.addPage(); kinds[doc.getNumberOfPages()] = 'index';
      const items = list.slice(p * per, p * per + per).map(d => ({ d: d, cover: firstPhoto(d) }));
      await ocIndex(doc, s, items, designPage, list.length, list);
    }
    for (let i = 0; i < list.length; i++) {
      ocStatus('Building the catalogue (' + (i + 1) + '/' + list.length + ')…');
      doc.addPage(); kinds[doc.getNumberOfPages()] = 'design';
      await ocDesign(doc, s, list[i], photosOf.get(list[i].id) || [], swatches);
    }
    ocQuote(doc, s, list, kinds);
    doc.addPage(); kinds[doc.getNumberOfPages()] = 'contact';
    const side = list.length > 1 ? firstPhoto(list[1]) : ((photosOf.get(list[0].id) || [])[1] || firstPhoto(list[0]));
    await ocContact(doc, s, side);

    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      const k = kinds[p] || 'quote';
      if (k === 'cover' || k === 'contact') continue;
      doc.setPage(p);
      ocFoot(doc, p, total, s, k === 'design' ? 2 : null);
    }
    doc.setPage(total);
    ocStatus(list.length + ' designs · ' + total + ' pages');
    return doc;
  }

  function ocFileName(){
    const c = ocV('dmOcCustomer').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return 'Sarv_India_Catalogue' + (c ? '_' + c : '') + '_' + new Date().toISOString().slice(0, 10) + '.pdf';
  }
  async function ocDownload(){
    const doc = await ocBuild(); if (!doc) { if (!ocSelected().length) toast('Select at least one design.', 'warn'); return; }
    downloadBlob(doc.output('blob'), ocFileName());
    toast('Online Catalogue PDF downloaded.', 'success');
  }
  async function ocOpen(){
    const doc = await ocBuild(); if (!doc) { if (!ocSelected().length) toast('Select at least one design.', 'warn'); return; }
    const win = window.open(doc.output('bloburl'), '_blank');
    if (!win) toast('The popup was blocked. Use “Download PDF” instead.', 'warn');
  }

  /* ── JSON backup (V18 ka Download Backup) ───────────────────────── */
  function exportBackup(){
    if (!dmDesigns.length) { toast('There is no data to back up.', 'warn'); return; }
    const payload = {
      exported_at: new Date().toISOString(),
      exported_by: whoAmI(),
      count: dmDesigns.length,
      bucket: DM_BUCKET,
      image_folder: DM_FOLDER,
      designs: dmDesigns.map(d => Object.assign({}, d, {
        matchings: (d.matchings || []).map(m => Object.assign({}, m, { image_url: dmImgSrc(m) }))
      }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Sarv_Design_Master_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Backup downloaded.', 'success');
  }

  /* ── lightbox / image fallback ──────────────────────────────────────── */
  function showLightbox(src, cap){
    if (!src) return;
    q('dmLightboxImg').src = src;
    q('dmLightboxCap').textContent = cap || '';
    q('dmLightbox').classList.add('open');
  }
  function closeLightbox(){
    q('dmLightbox').classList.remove('open');
    q('dmLightboxImg').removeAttribute('src');
  }
  /* If a photo fails to load (network down, file removed), the table layout must not break. */
  function imgFail(el){
    const box = document.createElement('div');
    box.className = 'dm-thumb-none';
    box.textContent = '!';
    box.title = 'The photo did not load';
    el.replaceWith(box);
  }

  /* ════════════════════════════════════════════════════════════════════
     MATCHING SKU — every matching photo with its SKU No and a Quantity box,
     printed as a DISPATCH ORDER PDF
     ----------------------------------------------------------------------
       • One row per matching of the LIVE designs: photo, Matching SKU No
         (design no · matching name under it) and a Quantity box.
       • Search (sarvSearchMatch over design no / SKUs / matching / party /
         brand / quality) and the Party / Brand / Quality / Design No
         dropdowns only narrow what is SHOWN. Each dropdown lists only what
         is left after the other filters.
       • The order is every matching with a Quantity above 0, whatever the
         current filter, so narrowing the list to type the next design's
         quantities never drops the ones already typed. "Show: Only with
         Quantity" lists exactly what will be printed.
       • Quantities and the Dispatch Date & Time are kept in this browser
         (a draft, so a reload does not lose them) until Clear Quantities.
     Nothing here is written to the database.
  ════════════════════════════════════════════════════════════════════ */
  const MS_STORE = 'dm_ms_order_v1';
  const MS_MAX_ROWS = 400;        // rows drawn at once; the search narrows the rest
  const MS_FILTERS = [
    { id: 'dmMsParty',   label: 'All parties',   get: r => r.d.party_name },
    { id: 'dmMsBrand',   label: 'All brands',    get: r => r.d.brand_name },
    { id: 'dmMsQuality', label: 'All qualities', get: r => r.m.blanket_quality || r.d.blanket_quality },
    { id: 'dmMsDesign',  label: 'All designs',   get: r => r.d.design_no }
  ];
  let msQty = {};                 // matching id → quantity (whole number > 0)
  const msThumbCache = new Map();  // url → Promise<img|null>, small JPEG for the PDF
  let msWired = false;

  function msLoadDraft(){
    try {
      const o = JSON.parse(localStorage.getItem(MS_STORE) || '{}') || {};
      msQty = (o.qty && typeof o.qty === 'object') ? o.qty : {};
      const at = q('dmMsDispatchAt');
      if (at && o.at && !at.value) at.value = o.at;
    } catch (e) { msQty = {}; }
  }
  function msSaveDraft(){
    try { localStorage.setItem(MS_STORE, JSON.stringify({ qty: msQty, at: q('dmMsDispatchAt') ? q('dmMsDispatchAt').value : '' })); } catch (e) {}
  }
  const msQ = id => { const n = parseInt(msQty[id], 10); return Number.isFinite(n) && n > 0 ? n : 0; };
  const msVal = (f, r) => up(f.get(r));

  // LIVE designs in design-no order; inside a design, the matchings' own order (MASTER first).
  function msPool(){
    const out = [];
    dmDesigns.filter(d => d.status === 'LIVE').slice()
      .sort((a, b) => dmCatSort(a.design_no, b.design_no))
      .forEach(d => (d.matchings || []).forEach(m => out.push({ d: d, m: m })));
    return out;
  }
  function msPass(r, skipId, term, show){
    if (show === 'sku' && !r.m.matching_sku_no) return false;
    if (show === 'nosku' && r.m.matching_sku_no) return false;
    if (show === 'qty' && !msQ(r.m.id)) return false;
    for (const f of MS_FILTERS) {
      if (f.id === skipId) continue;
      const s = msSelOf(f.id);
      if (s && !s.has(msVal(f, r))) return false;
    }
    if (term && typeof sarvSearchMatch === 'function') {
      return sarvSearchMatch([r.d.design_no, r.d.design_sku_no, r.m.matching_name, r.m.matching_sku_no,
        r.d.party_name, r.d.brand_name, r.m.blanket_quality || r.d.blanket_quality], term);
    }
    return true;
  }
  /* ── Party / Brand / Quality / Design No: searchable multi-select ──────
     Each is a button that opens a panel (the same look as the Live tab's ▾
     filters, #dmMsfPanel shares their CSS): a search box, then every value
     with its count and a tick box. Unlike the Live tab, ticks are what is
     CHOSEN and apply at once: nothing ticked = all, tick two parties = only
     those two. The list holds only what the other filters (and the search
     / Show) leave, so the dropdowns narrow each other. A ticked value that
     the other filters have since removed is still listed (greyed, count 0),
     or it could never be unticked. */
  const msSel = {};               // filter id → Set of chosen values (missing / empty = all)
  let msDd = null;                // the open panel: { id, search, anchor, shown }
  let msDdQuietUntil = 0;         // scrolls before this time come from our own redraw
  const msSelOf = id => (msSel[id] && msSel[id].size) ? msSel[id] : null;
  const msCurTerm = () => q('dmMsSearch') ? q('dmMsSearch').value.trim() : '';
  const msCurShow = () => q('dmMsShow') ? q('dmMsShow').value : '';

  // Button labels: "All parties" / the one value / "3 selected"; green when filtering.
  function msRenderFilters(){
    MS_FILTERS.forEach(f => {
      const b = q(f.id); if (!b) return;
      const s = msSelOf(f.id), vals = s ? [...s].sort(dmCatSort) : [];
      const txt = !vals.length ? f.label : vals.length === 1 ? vals[0] : vals.length + ' selected';
      b.innerHTML = '<span class="t">' + esc(txt) + '</span><span class="c">&#9662;</span>';
      b.classList.toggle('on', !!vals.length);
      b.title = vals.length ? vals.join(', ') : f.label;
    });
  }
  function msDdOptions(id){
    const f = MS_FILTERS.find(x => x.id === id); if (!f) return [];
    const term = msCurTerm(), show = msCurShow(), counts = new Map();
    msPool().forEach(r => {
      if (!msPass(r, id, term, show)) return;
      const v = msVal(f, r); if (!v) return;
      counts.set(v, (counts.get(v) || 0) + 1);
    });
    const out = [...counts.entries()].map(([value, count]) => ({ value: value, count: count }));
    const s = msSelOf(id);
    if (s) s.forEach(v => { if (!counts.has(v)) out.push({ value: v, count: 0, gone: true }); });
    return out.sort((a, b) => dmCatSort(a.value, b.value));
  }
  function msDdPanel(){
    let p = q('dmMsfPanel');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'dmMsfPanel';
    // On <body>: the toolbar / sheet would clip it.
    document.body.appendChild(p);
    p.addEventListener('click', e => e.stopPropagation());
    return p;
  }
  function msDdOpen(ev, id){
    if (ev) { ev.stopPropagation(); ev.preventDefault(); }
    if (msDd && msDd.id === id) { msDdClose(); return; }   // same button again = close
    if (typeof dmLfClose === 'function') dmLfClose();
    msDd = { id: id, search: '', anchor: (ev && ev.currentTarget) || q(id), shown: [] };
    const f = MS_FILTERS.find(x => x.id === id);
    const p = msDdPanel();
    p.innerHTML =
      '<div class="imf-head">' + esc(f.label.replace(/^All /, '').toUpperCase()) +
        '<div class="imf-sub" id="dmMsfSub"></div></div>' +
      '<div class="imf-body">' +
        '<input type="text" id="dmMsfSearch" placeholder="Search..." autocomplete="off" data-no-caps>' +
        '<div style="display:flex;justify-content:space-between;margin-top:6px;">' +
          '<button type="button" class="imf-mini" id="dmMsfAll" title="Tick every value shown below">Select All Shown</button>' +
          '<button type="button" class="imf-mini" id="dmMsfNone" style="color:#b91c1c;" title="Untick everything (= all)">Clear</button></div>' +
        '<div class="imf-list" id="dmMsfList"></div>' +
      '</div>' +
      '<div class="imf-foot">' +
        '<button type="button" class="imf-btn imf-apply" id="dmMsfDone">&#10004; Done</button>' +
        '<button type="button" class="imf-btn imf-remove" id="dmMsfRemove">&#10006; Clear Filter</button>' +
      '</div>';
    p.style.visibility = 'hidden';
    p.style.display = 'block';
    const s = q('dmMsfSearch');
    s.addEventListener('input', () => { if (msDd) { msDd.search = s.value; msDdList(); } });
    // Enter with exactly one value left ticks it: type a few letters + Enter.
    s.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !msDd) return;
      e.preventDefault();
      if (msDd.shown.length === 1) msDdTick(msDd.shown[0].value, true);
    });
    q('dmMsfList').addEventListener('change', e => {
      const cb = e.target.closest('input[type=checkbox]'); if (cb) msDdTick(cb.dataset.v, cb.checked);
    });
    q('dmMsfAll').addEventListener('click', () => {
      const set = msSel[id] || (msSel[id] = new Set());
      msDd.shown.forEach(o => set.add(o.value));
      msDdRefresh(); msDdList();
    });
    const clear = () => { delete msSel[id]; msDdRefresh(); msDdList(); };
    q('dmMsfNone').addEventListener('click', clear);
    q('dmMsfRemove').addEventListener('click', () => { clear(); msDdClose(); });
    q('dmMsfDone').addEventListener('click', msDdClose);
    msDdList();
    msDdPlace();
    try { s.focus(); } catch (e) {}
  }
  const msDdRefresh = () => { msDdQuietUntil = Date.now() + 400; msRender(); };
  function msDdTick(v, on){
    if (!msDd) return;
    const set = msSel[msDd.id] || (msSel[msDd.id] = new Set());
    if (on) set.add(v); else set.delete(v);
    msDdRefresh();  // the table and the other buttons follow at once
    msDdList();
  }
  // Only the list is redrawn while typing, so the search box keeps its focus.
  function msDdList(){
    if (!msDd) return;
    const box = q('dmMsfList'); if (!box) return;
    const opts = msDdOptions(msDd.id), term = msDd.search.trim();
    const s = msSelOf(msDd.id);
    const shown = term ? opts.filter(o => sarvSearchMatch(o.value, term)) : opts;
    const LIMIT = 400;
    msDd.shown = shown.slice(0, LIMIT);
    box.innerHTML = msDd.shown.length
      ? msDd.shown.map(o =>
          '<label class="imf-opt' + (o.gone ? ' gone' : '') + '">' +
          '<input type="checkbox" data-v="' + esc(o.value) + '"' + (s && s.has(o.value) ? ' checked' : '') + '>' +
          '<span class="t" title="' + esc(o.value) + '">' + esc(o.value) + '</span>' +
          '<span class="n">' + o.count + '</span></label>').join('') +
        (shown.length > LIMIT ? '<div style="color:#b45309;font-size:10px;padding:4px 2px 0;">Showing the first ' + LIMIT +
          ' of ' + shown.length + '. Type in the search to narrow it down.</div>' : '')
      : '<div style="color:#94a3b8;padding:6px 2px;">' + (term ? 'Nothing matches this search.' : 'Nothing left here after the other filters.') + '</div>';
    const sub = q('dmMsfSub');
    if (sub) sub.textContent = (s ? s.size + ' ticked' : 'Nothing ticked = all') + ' · ' + opts.filter(o => !o.gone).length + ' value(s)';
  }
  function msDdPlace(){
    const p = q('dmMsfPanel'); if (!p || !msDd) return;
    const a = msDd.anchor && document.body.contains(msDd.anchor) ? msDd.anchor : q(msDd.id);
    const r = a ? a.getBoundingClientRect() : { left: 120, top: 100, bottom: 120 };
    const w = p.offsetWidth || 268, h = p.offsetHeight || 340;
    const left = Math.min(Math.max(8, r.left), Math.max(8, innerWidth - w - 8));
    let top = r.bottom + 4;
    if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 4);
    p.style.left = left + 'px'; p.style.top = top + 'px';
    p.style.visibility = 'visible';
  }
  function msDdClose(){
    const p = q('dmMsfPanel'); if (p) p.style.display = 'none';
    msDd = null;
  }
  // Outside click, Escape, resize or a page scroll close it (scrolling its own list does not).
  document.addEventListener('click', () => { if (msDd) msDdClose(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && msDd) msDdClose(); });
  addEventListener('resize', () => { if (msDd) msDdClose(); });
  document.addEventListener('scroll', e => {
    if (!msDd) return;
    // A tick redraws the table; if the list gets shorter the page scrolls by
    // itself, and that must not shut the panel in the middle of choosing.
    if (Date.now() < msDdQuietUntil) { msDdPlace(); return; }
    const p = q('dmMsfPanel'), t = e.target;
    if (p && t && t.nodeType === 1 && p.contains(t)) return;
    msDdClose();
  }, true);

  function msRender(){
    const tb = q('dmMsList'); if (!tb) return;
    const term = q('dmMsSearch') ? q('dmMsSearch').value.trim() : '';
    const show = q('dmMsShow') ? q('dmMsShow').value : '';
    const pool = msPool();
    msRenderFilters();
    const list = pool.filter(r => msPass(r, null, term, show));
    const shown = list.slice(0, MS_MAX_ROWS);
    tb.innerHTML = shown.length ? shown.map((r, i) => {
      const src = dmImgSrc(r.m), qv = msQ(r.m.id);
      const cap = r.d.design_no + ' · ' + (r.m.matching_name || '');
      // The same six columns as the PDF's item table (msBuild), the Qty being the box.
      return '<tr class="' + (qv ? 'has-qty' : '') + '">' +
        '<td class="dm-ms-no">' + (i + 1) + '</td>' +
        '<td class="dm-ms-photo-td">' + (src
          ? '<img class="dm-ms-photo" loading="lazy" src="' + esc(src) + '" alt="' + esc(cap) + '" title="Click for full screen" onclick="dmShowLightbox(this.src,this.alt)" onerror="dmImgFail(this)">'
          : '<div class="dm-ms-photo dm-ms-nophoto">No photo</div>') + '</td>' +
        '<td class="dm-ms-dno">' + esc(r.d.design_no) + '</td>' +
        '<td class="dm-ms-mname">' + esc(r.m.matching_name || '') +
          (r.m.matching_type === 'MASTER' ? ' <span class="dm-badge dm-badge-master">MASTER</span>' : '') +
          '<div class="dm-ms-sub2">' + esc([r.m.blanket_quality || r.d.blanket_quality, r.d.party_name, r.d.brand_name].filter(Boolean).join(' · ')) + '</div>' +
        '</td>' +
        '<td class="dm-ms-skutd">' + (r.m.matching_sku_no
            ? '<span class="dm-ms-sku">' + esc(r.m.matching_sku_no) + '</span>'
            : '<span class="dm-ms-sku none" title="Add it in Edit (Live tab) on this design, or on Add Matching">- (no SKU)</span>') + '</td>' +
        '<td class="dm-ms-qty-td"><input type="number" class="dm-ms-qty" data-mid="' + r.m.id + '" min="0" step="1" inputmode="numeric" placeholder="0" value="' + (qv || '') + '"></td>' +
      '</tr>';
    }).join('')
      : '<tr><td colspan="6" class="dm-empty-row">' + (pool.length
          ? (show === 'qty' ? 'No quantity entered yet.' : 'No matching fits this search / filter.')
          : 'No LIVE design has matchings yet.') + '</td></tr>';
    const more = q('dmMsMore');
    if (more) more.textContent = list.length > shown.length
      ? 'Showing the first ' + shown.length + ' of ' + list.length + ' matchings. Search or filter to see the rest.' : '';
    msSummary(list.length, pool.length);
  }
  function msSummary(nShown, nPool){
    const el = q('dmMsCount'); if (!el) return;
    let items = 0, pcs = 0;
    Object.keys(msQty).forEach(k => { const n = msQ(k); if (n) { items++; pcs += n; } });
    if (nShown != null) el.dataset.shown = nShown + ' / ' + nPool + ' matchings shown';
    el.innerHTML = esc(el.dataset.shown || '') + ' &nbsp;·&nbsp; <b>In order: ' + items + ' item(s), ' + pcs + ' pcs</b>';
    // The sheet's own totals, as the PDF prints them (the whole order, not just this filter).
    const set = (id, v) => { const x = q(id); if (x) x.textContent = v; };
    set('dmMsItems', String(items));
    set('dmMsPcs', pcs + ' pcs');
    set('dmMsTotQty', String(pcs));
    const at = q('dmMsDispatchAt');
    set('dmMsFootL', 'Dispatch Order' + (at && at.value ? '  ·  ' + msFmtAt(at.value) : ''));
  }
  // Letterhead + Prepared By on the on-screen sheet, the same source as the PDF.
  function msFillSheet(){
    const co = (typeof SARV_COMPANY !== 'undefined' && SARV_COMPANY) ? SARV_COMPANY : null;
    const set = (id, v) => { const x = q(id); if (x) x.textContent = v; };
    if (co) {
      set('dmMsCo', co.fullName || '');
      set('dmMsAddr', co.address || '');
      set('dmMsGstin', co.gstin ? 'GSTIN: ' + co.gstin : '');
    }
    set('dmMsBy', whoAmI() || '-');
  }
  function msClearFilters(){
    MS_FILTERS.forEach(f => { delete msSel[f.id]; });
    msDdClose();
    if (q('dmMsSearch')) q('dmMsSearch').value = '';
    if (q('dmMsShow')) q('dmMsShow').value = '';
    msRender();
  }
  function msClearQty(){
    const n = Object.keys(msQty).filter(k => msQ(k)).length;
    if (!n) { toast('No quantity entered.', 'warn'); return; }
    if (!confirm('Clear the quantity of all ' + n + ' item(s) in this Dispatch Order?')) return;
    msQty = {}; msSaveDraft(); msRender();
  }
  // Now, as the value of a datetime-local box (local time, to the minute).
  function msNowLocal(){
    const t = new Date(), p = n => String(n).padStart(2, '0');
    return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate()) + 'T' + p(t.getHours()) + ':' + p(t.getMinutes());
  }
  // 'YYYY-MM-DDTHH:MM' → 'DD/MM/YYYY hh:mm AM'
  function msFmtAt(v){
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || ''); if (!m) return String(v || '');
    const h = +m[4], h12 = (h % 12) || 12;
    return m[3] + '/' + m[2] + '/' + m[1] + ' ' + String(h12).padStart(2, '0') + ':' + m[5] + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  function msWire(){
    if (msWired) return; msWired = true;
    msLoadDraft();
    const tb = q('dmMsList');
    tb.addEventListener('input', e => {
      const inp = e.target.closest('.dm-ms-qty'); if (!inp) return;
      const n = parseInt(inp.value, 10);
      if (Number.isFinite(n) && n > 0) msQty[inp.dataset.mid] = n; else delete msQty[inp.dataset.mid];
      const tr = inp.closest('tr'); if (tr) tr.classList.toggle('has-qty', msQ(inp.dataset.mid) > 0);
      msSaveDraft(); msSummary();
    });
    // Enter jumps to the next Quantity box, so a long order is typed without the mouse.
    tb.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !e.target.classList.contains('dm-ms-qty')) return;
      e.preventDefault();
      const all = Array.from(tb.querySelectorAll('.dm-ms-qty'));
      const nx = all[all.indexOf(e.target) + 1];
      if (nx) { nx.focus(); nx.select(); }
    });
    let t = null;
    q('dmMsSearch').addEventListener('input', () => { clearTimeout(t); t = setTimeout(msRender, 160); });
    q('dmMsShow').addEventListener('change', msRender);
    q('dmMsDispatchAt').addEventListener('change', () => { msSaveDraft(); msSummary(); });
  }
  function msOpen(){
    msWire();
    msFillSheet();
    const at = q('dmMsDispatchAt');
    if (at && !at.value) { at.value = msNowLocal(); msSaveDraft(); }
    msRender();
  }

  // A small JPEG of the photo for the PDF: a 1500px photo per row would make the file huge.
  function msThumb(url){
    if (!url) return Promise.resolve(null);
    if (msThumbCache.has(url)) return msThumbCache.get(url);
    const p = imgData(url).then(img => !img ? null : new Promise(res => {
      const el = new Image();
      el.onload = () => {
        try {
          const sc = Math.min(1, 320 / Math.max(el.naturalWidth, el.naturalHeight));
          const w = Math.max(1, Math.round(el.naturalWidth * sc)), h = Math.max(1, Math.round(el.naturalHeight * sc));
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(el, 0, 0, w, h);
          res({ dataUrl: c.toDataURL('image/jpeg', 0.85), w: w, h: h, fmt: 'JPEG' });
        } catch (e) { res(img); }
      };
      el.onerror = () => res(img);
      el.src = img.dataUrl;
    }));
    msThumbCache.set(url, p);
    return p;
  }
  const msStatus = t => { const el = q('dmMsStatus'); if (el) el.textContent = t || ''; };

  async function msBuild(){
    if (typeof jspdfNativeReady_ === 'function' ? !jspdfNativeReady_() : !(window.jspdf && window.jspdf.jsPDF)) {
      toast('jsPDF did not load. Please reload the page.', 'error');
      return null;
    }
    const atEl = q('dmMsDispatchAt');
    const at = atEl ? atEl.value : '';
    if (!at) { if (atEl) atEl.focus(); toast('DISPATCH DATE & TIME is required.', 'error'); return null; }
    // Every matching with a quantity, in the on-screen order (whatever the filter).
    const rows = [];
    dmDesigns.slice().sort((a, b) => dmCatSort(a.design_no, b.design_no))
      .forEach(d => (d.matchings || []).forEach(m => { const n = msQ(m.id); if (n) rows.push({ d: d, m: m, qty: n }); }));
    if (!rows.length) { toast('Enter a Quantity against at least one matching.', 'error'); return null; }
    const noSku = rows.filter(r => !r.m.matching_sku_no).length;
    if (noSku && !confirm(noSku + ' item(s) in this order have no Matching SKU No (printed as "-").\n\nMake the PDF anyway?')) return null;

    const thumbs = [];
    for (let i = 0; i < rows.length; i++) {
      msStatus('Loading photos (' + (i + 1) + '/' + rows.length + ')…');
      thumbs.push(await msThumb(dmImgSrc(rows[i].m)));
    }
    msStatus('Building the PDF…');

    const jsPDF = window.jspdf.jsPDF;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const co = (typeof SARV_COMPANY !== 'undefined' && SARV_COMPANY) ? SARV_COMPANY : { fullName: 'SARV INDIA HOME FURNISHING', address: '', gstin: '' };
    const W = A4.w, M = A4.mx, total = rows.reduce((s, r) => s + r.qty, 0);
    const atTxt = msFmtAt(at), by = whoAmI() || '-';
    const t = new Date(), p2 = n => String(n).padStart(2, '0');
    const printed = msFmtAt(t.getFullYear() + '-' + p2(t.getMonth() + 1) + '-' + p2(t.getDate()) + 'T' + p2(t.getHours()) + ':' + p2(t.getMinutes()));

    // ── letterhead ──
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(15, 23, 42);
    doc.text(String(co.fullName || ''), W / 2, 17, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(71, 85, 105);
    const addr = doc.splitTextToSize(String(co.address || ''), W - 2 * M - 20);
    doc.text(addr, W / 2, 22, { align: 'center' });
    let y = 22 + addr.length * 3.2;
    if (co.gstin) { doc.text('GSTIN: ' + co.gstin, W / 2, y, { align: 'center' }); y += 3.2; }
    doc.setDrawColor(15, 23, 42); doc.setLineWidth(0.6); doc.line(M, y + 1, W - M, y + 1);
    // ── title band ──
    y += 4;
    doc.setFillColor(15, 23, 42); doc.rect(M, y, W - 2 * M, 10, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(255, 255, 255);
    doc.text('DISPATCH ORDER', W / 2, y + 6.8, { align: 'center' });
    y += 10;
    // ── order details ──
    doc.autoTable({
      startY: y + 3,
      margin: { left: M, right: M },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2, lineColor: [203, 213, 225], lineWidth: 0.2, textColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 38, fillColor: [248, 250, 252], fontStyle: 'bold', textColor: [51, 65, 85] },
        1: { cellWidth: 55, fontStyle: 'bold' },
        2: { cellWidth: 38, fillColor: [248, 250, 252], fontStyle: 'bold', textColor: [51, 65, 85] },
        3: { cellWidth: 'auto', fontStyle: 'bold' }
      },
      body: [
        ['DISPATCH DATE & TIME', atTxt, 'PREPARED BY', String(by)],
        ['TOTAL ITEMS', String(rows.length), 'TOTAL QUANTITY', total + ' pcs']
      ]
    });

    // ── items: one row per matching, its photo in the second column ──
    const IMG_H = 24;
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 4,
      margin: { left: M, right: M, top: 14, bottom: 18 },
      theme: 'grid',
      showHead: 'everyPage',
      showFoot: 'lastPage',
      rowPageBreak: 'avoid',
      head: [['S.NO', 'PHOTO', 'DESIGN NO', 'MATCHING NAME', 'MATCHING SKU NO', 'QTY']],
      body: rows.map((r, i) => [String(i + 1), '', String(r.d.design_no || ''), String(r.m.matching_name || ''),
        String(r.m.matching_sku_no || '-'), String(r.qty)]),
      foot: [[{ content: 'TOTAL QUANTITY', colSpan: 5, styles: { halign: 'right' } }, String(total)]],
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, lineColor: [203, 213, 225], lineWidth: 0.2, textColor: [30, 41, 59], valign: 'middle' },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, halign: 'center' },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 10, halign: 'center' },
      bodyStyles: { minCellHeight: IMG_H + 2 },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 24 },
        2: { cellWidth: 32, fontStyle: 'bold' },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 42, fontStyle: 'bold', fontSize: 10, textColor: [15, 23, 42] },
        5: { cellWidth: 18, halign: 'center', fontStyle: 'bold', fontSize: 11 }
      },
      didDrawCell: data => {
        if (data.section !== 'body' || data.column.index !== 1) return;
        const c = data.cell;
        pdfImage(doc, thumbs[data.row.index], c.x + 1.2, c.y + 1.2, c.width - 2.4, c.height - 2.4);
      }
    });

    // ── signatures, on the last page (a new page if there is no room) ──
    let sy = doc.lastAutoTable.finalY + 22;
    if (sy > A4.h - 26) { doc.addPage(); sy = 40; }
    const sw = (W - 2 * M - 20) / 3;
    ['PREPARED BY', 'CHECKED BY', 'RECEIVED BY'].forEach((lbl, i) => {
      const x = M + i * (sw + 10);
      doc.setDrawColor(100, 116, 139); doc.setLineWidth(0.3); doc.line(x, sy, x + sw, sy);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
      doc.text(lbl, x + sw / 2, sy + 4.5, { align: 'center' });
    });

    // ── footer on every page ──
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      pdfFooter(doc, 'Dispatch Order  ·  ' + atTxt + '  ·  Printed ' + printed, 'Page ' + i + ' of ' + n);
    }
    msStatus(rows.length + ' item(s) · ' + total + ' pcs · ' + n + ' page(s)');
    return { doc: doc, at: at };
  }
  const msFileName = at => 'Dispatch_Order_' + String(at || '').replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}).*$/, '$3-$2-$1_$4$5') + '.pdf';
  async function msDownload(){
    try {
      const r = await msBuild(); if (!r) return;
      // Through downloadBlob (store-core.js), so the ERP's download stamp is applied like everywhere else.
      downloadBlob(r.doc.output('blob'), msFileName(r.at));
      toast('Dispatch Order PDF downloaded.', 'success');
    } catch (e) {
      console.error('[DM] dispatch order fail:', e);
      msStatus('PDF failed: ' + (e.message || e));
      toast('Dispatch Order PDF failed: ' + (e.message || e), 'error');
    }
  }
  async function msOpenPdf(){
    try {
      const r = await msBuild(); if (!r) return;
      const win = window.open(r.doc.output('bloburl'), '_blank');
      if (!win) toast('The popup was blocked. Use “Download PDF” instead.', 'warn');
    } catch (e) {
      console.error('[DM] dispatch order fail:', e);
      msStatus('PDF failed: ' + (e.message || e));
      toast('Dispatch Order PDF failed: ' + (e.message || e), 'error');
    }
  }

  /* ── inner tabs ─────────────────────────────────────────────────────── */
  function showPane(paneId){
    const root = q('designMasterProdSub'); if (!root) return;
    root.querySelectorAll('.dm-pane').forEach(p => p.classList.toggle('active', p.id === paneId));
    root.querySelectorAll('.dm-tab').forEach(b => b.classList.toggle('active', b.dataset.dmtab === paneId));
    if (paneId === 'dmCataloguePane') renderCatalogueFilters();
    if (paneId === 'dmAddPhotoshootPane') loadPhotoshoots().then(populatePsInfo);
    if (paneId === 'dmOnlineCatPane') { ocStatus('Loading photoshoots…'); loadPhotoshoots().then(() => { ocStatus(''); ocRender(); }); }
    if (paneId === 'dmMatchingSkuPane') loadDesigns().then(msOpen);
  }

  /* ════════════════════════════════════════════════════════════════════
     WIRING
  ════════════════════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', () => {
    const root = q('designMasterProdSub');
    if (!root) return;

    root.querySelectorAll('.dm-tab').forEach(b =>
      b.addEventListener('click', () => showPane(b.dataset.dmtab)));

    q('dmNewDesignForm').addEventListener('submit', saveNewDesign);
    q('dmEditDesignForm').addEventListener('submit', updateDesign);

    ['dmLargeFrame', 'dmMediumFrame', 'dmSmallFrame'].forEach(id => q(id).addEventListener('input', calcNewTotal));
    ['dmEditLargeFrame', 'dmEditMediumFrame', 'dmEditSmallFrame'].forEach(id => q(id).addEventListener('input', calcEditTotal));

    q('dmInitialImage').addEventListener('change', e =>
      previewInto('dmNewDesignPreview', (e.target.files || [])[0], EMPTY_NEW));
    q('dmMtcFiles').addEventListener('change', e => batchAddFiles('mtc', e.target));
    q('dmPsFiles').addEventListener('change', e => batchAddFiles('ps', e.target));
    batchSum('mtc'); batchSum('ps');
    ocInit();
    q('dmPsDesign').addEventListener('input', e => {
      e.target.value = e.target.value.toUpperCase();
      populatePsInfo();
    });

    q('dmNewPsd').addEventListener('change', e => psdPicked(e.target, 'dmNewPsdName'));
    q('dmEditPsd').addEventListener('change', e => psdPicked(e.target, 'dmEditPsdName'));

    q('dmSelectDesign').addEventListener('input', e => {
      e.target.value = e.target.value.toUpperCase();
      populateMatchingInfo();
    });

    q('dmBulkImageInput').addEventListener('change', bulkAddFiles);
    DM_FORM_PICKERS.forEach(p => attachPicker(q(p[0]), p[1]));

    let searchTimer = null;
    q('dmLiveSearch').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderLive, 140);
    });

    /* Catalogue dependent filters: when any tick changes, all the boxes are
       rebuilt, so meaningless options disappear immediately. The checkbox rows
       keep re-rendering, so the listener sits on the grid. */
    const catGrid = q('dmCatFilterGrid');
    if (catGrid) catGrid.addEventListener('change', e => {
      const cb = e.target.closest('input[type=checkbox]');
      if (cb && cb.name) dmCatFilterChanged(cb);
    });
    let catTimer = null;
    q('dmCatDesignNos').addEventListener('input', () => {
      clearTimeout(catTimer);
      catTimer = setTimeout(renderCatalogueFilters, 180);
    });

    q('dmEditModal').addEventListener('click', e => { if (e.target.id === 'dmEditModal') closeEditModal(); });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (q('dmLightbox').classList.contains('open')) closeLightbox();
      else if (q('dmEditModal').classList.contains('open')) closeEditModal();
    });

    renderDatalists();
    const ready = (typeof SB_READY !== 'undefined' && SB_READY);
    setSync(ready ? 'Ready. Loads when Production opens' : 'Supabase setup pending', ready ? '' : 'err');
  });

  /* ── Production panel / sub-tab, for calling from outside ──────────── */
  window.switchProductionSubTab = function(id){
    const panel = q('productionPanel'); if (!panel) return;
    panel.querySelectorAll('[id$="ProdSub"]').forEach(x => { x.style.display = 'none'; });
    const el = q(id); if (el) el.style.display = 'block';
    panel.querySelectorAll('.prod-sub-tab').forEach(btn => {
      const on = btn.dataset.prodsub === id;
      btn.style.fontWeight   = on ? '700' : '600';
      btn.style.background   = on ? '#eff6ff' : '#f8fafc';
      btn.style.color        = on ? '#0369a1' : '#64748b';
      btn.style.borderBottom = on ? '2px solid #0284c7' : 'none';
    });
    if (id === 'designMasterProdSub') loadDesigns();
  };
  // activatePanel('productionPanel') requests the data from here.
  window.dmEnsureLoaded = () => loadDesigns();

  /* ── Two-way link with Dropdown Master ───────────────────────────────
     Master Data › Dropdown Master (store-core.js) is the home of this
     screen's fixed lists. On save it calls dmRefreshDropdowns() here, so the
     new value shows up immediately in every picker and <datalist> with no
     reload.

     The shade list's default lives here (DM_SHADES, the 65 shades from V18):
     store-core reads it as the default for `erp_designShade`, so the same 65
     names don't have to be written in two places. */
  window.dmShadeDefaults   = DM_SHADES.slice();
  window.dmRefreshDropdowns = function(){
    renderDatalists();
    // The catalogue filter boxes are built on these values too.
    if (q('dmCataloguePane') && q('dmCataloguePane').classList.contains('active')) renderCatalogueFilters();
  };

  /* Handles needed by the inline onclick / onchange in the HTML. */
  window.dmReload                   = force => {
    // Photoshoots reload too (lazily: next time the tab or a design needs them).
    if (force !== false) dmPsLoaded = false;
    return loadDesigns(force !== false);
  };
  window.dmBatchAddBlank            = batchAddBlank;
  window.dmBatchRemove              = batchRemove;
  window.dmMtcSaveAll               = mtcSaveAll;
  window.dmPsSaveAll                = psSaveAll;
  window.dmPsDelete                 = psDelete;
  window.dmOcPreview                = ocPreview;
  window.dmOcDownload               = ocDownload;
  window.dmOcOpen                   = ocOpen;
  window.dmOcToggle                 = ocToggle;
  window.dmOcResetFilters           = ocResetFilters;
  window.dmExportBackup             = exportBackup;
  window.dmSetStatus                = setStatus;
  window.dmOpenEditModal            = openEditModal;
  window.dmCloseEditModal           = closeEditModal;
  window.dmMakeMaster               = makeMaster;
  window.dmReplacePhoto             = replacePhoto;
  window.dmDeleteMatching           = deleteMatching;
  window.dmRemoveBulkRow            = removeBulkRow;
  window.dmSaveBulkRow              = saveOneBulkRow;
  window.dmSaveAllBulk              = saveAllBulk;
  window.dmToggleFilter             = toggleFilter;
  window.dmResetCatalogueFilters    = resetCatalogueFilters;
  window.dmClearLiveFilters         = dmClearLiveFilters;
  window.dmLiveOpenFilter           = dmLiveOpenFilter;
  window.dmLiveRemoveFilter         = dmLiveRemoveFilter;
  window.dmGenerateCataloguePreview = generatePreview;
  window.dmDownloadCataloguePdf     = downloadPdf;
  window.dmOpenCataloguePdf         = openPdf;
  window.dmShowLightbox             = showLightbox;
  window.dmCloseLightbox            = closeLightbox;
  window.dmImgFail                  = imgFail;
  window.dmDownloadPsd              = downloadPsd;
  window.dmSetMatchingSku           = setMatchingSku;
  window.dmMsClearFilters           = msClearFilters;
  window.dmMsDdOpen                 = msDdOpen;
  window.dmMsClearQty               = msClearQty;
  window.dmMsDownload               = msDownload;
  window.dmMsOpenPdf                = msOpenPdf;
  window.dmMsNow                    = () => { const at = q('dmMsDispatchAt'); if (at) { at.value = msNowLocal(); msSaveDraft(); msSummary(); } };

  /* Two direct routes for future design-wise image updates: give a design
     number and get all its photos (path + URL), or get that design's bucket
     folder. */
  window.dmDesignImages = async function(designNo){
    await loadDesigns();
    const d = findByNo(designNo);
    if (!d) return [];
    return (d.matchings || []).map(m => ({
      matching_id: m.id, matching_name: m.matching_name, type: m.matching_type,
      path: m.image_path, url: dmImgSrc(m)
    }));
  };
  window.dmDesignFolder = designNo => DM_FOLDER + '/' + pathSafe(designNo) + '/';
})();
