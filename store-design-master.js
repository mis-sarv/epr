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

  async function uploadDesignImage(designNo, file){
    const blob = await compressImage(file);
    const path = DM_FOLDER + '/' + pathSafe(designNo) + '/' +
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
      setSync('✓ ' + dmDesigns.length + ' designs', 'ok');
      dmSkuNotice();
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
      shown = term ? all.filter(v => String(v).toLowerCase().indexOf(term) >= 0) : all;
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
    ['dmNewMatchingName', 'shade'], ['dmMatchingBlanketQuality', 'quality'],
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
  function dmLiveSearchPass(d, term){
    if (!term) return true;
    return [d.design_no, d.design_sku_no, d.party_name, d.brand_name, d.supplier_name,
            d.design_type, d.design_unit, d.bed_size, d.blanket_quality]
      .concat((d.matchings || []).map(m => m.matching_name))
      .some(v => up(v).indexOf(term) >= 0);
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
    const term = (dmLfDraft.search || '').toLowerCase();
    const shown = term ? all.filter(o => o.value.toLowerCase().indexOf(term) >= 0) : all;
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
      tb.innerHTML = '<tr><td colspan="16" class="dm-empty-row">' +
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
  const EMPTY_MTC = '<span style="font-size:2rem;"></span><span>[ Passport Size Preview ]</span>';

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
    // Same SKU on another design? Not a block, just a question (skuOkToSave).
    if (!skuOkToSave(skuNo, null)) { q('dmDesignSkuNo').focus(); return; }
    dmSkuNotice();

    const file = (q('dmInitialImage').files || [])[0] || null;
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    setSync('Saving…', 'busy');
    try {
      const ins = await dmWriteDesign(p => SB.from('design_master').insert(p).select().single(), Object.assign(skuPatch(skuNo), {
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
      toast('Design ' + designNo + ' saved.', 'success');
      showPane('dmLivePane');
    } catch (e) {
      console.error('[DM] save fail:', e);
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
    const info = q('dmMatchingExisting'); if (!info) return;
    if (!live) { info.innerHTML = ''; return; }
    if (d.blanket_quality) q('dmMatchingBlanketQuality').value = d.blanket_quality;
    info.innerHTML = '<b>' + esc(d.design_no) + '</b> currently has ' + (d.matchings || []).length + ' matching(s): ' +
      (d.matchings || []).map(m => '<span class="dm-badge ' +
        (m.matching_type === 'MASTER' ? 'dm-badge-master' : 'dm-badge-slave') + '">' +
        esc(m.matching_name) + '</span>').join(' ');
  }

  async function addMatching(ev){
    ev.preventDefault();
    if (!sbReady() || !guard('DESIGN_SAVE')) return;
    await loadDesigns();
    const d = findByNo(q('dmSelectDesign').value);
    if (!d || d.status !== 'LIVE') { toast('Please choose a valid LIVE Design No.', 'error'); return; }

    const name = q('dmNewMatchingName').value.trim();
    if (!name) { toast('Matching name is required.', 'error'); return; }
    if ((d.matchings || []).some(m => up(m.matching_name) === up(name))) {
      toast('“' + name + '” already exists on this design.', 'warn');
      return;
    }

    const wantMaster = up(q('dmNewMatchingType').value) === 'MASTER';
    const file = (q('dmNewMatchingImage').files || [])[0] || null;
    const btn = ev.target.querySelector('button[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
    setSync('Saving…', 'busy');
    try {
      let img = { path: null, url: null };
      if (file) {
        try { img = await uploadDesignImage(d.design_no, file); }
        catch (e) { toast('Photo upload failed. The matching is being added without a photo.', 'warn'); }
      }
      /* There can be only one MASTER (partial unique index), so the others
         must be made SLAVE first before a new MASTER can be created. */
      if (wantMaster) {
        const dem = await SB.from('design_matchings').update({ matching_type: 'SLAVE' })
          .eq('design_id', d.id).eq('matching_type', 'MASTER');
        if (dem.error) throw dem.error;
        (d.matchings || []).forEach(m => { m.matching_type = 'SLAVE'; });
      }
      const ins = await SB.from('design_matchings').insert({
        design_id:       d.id,
        design_no:       d.design_no,
        matching_name:   name,
        blanket_quality: q('dmMatchingBlanketQuality').value.trim(),
        matching_type:   wantMaster ? 'MASTER' : 'SLAVE',
        image_path:      img.path,
        image_url:       img.url,
        sort_order:      (d.matchings || []).length,
        created_by:      whoAmI()
      }).select().single();
      if (ins.error) throw ins.error;

      d.matchings = (d.matchings || []).concat([ins.data]);
      renderAll();
      setSync('✓ ' + dmDesigns.length + ' designs', 'ok');
      q('dmAddMatchingForm').reset();
      q('dmNewMatchingType').value = 'SLAVE';
      q('dmMatchingBlanketQuality').value = 'MINK';
      q('dmMatchingPreview').innerHTML = EMPTY_MTC;
      q('dmMatchingExisting').innerHTML = '';
      toast('Matching “' + name + '” added.', 'success');
    } catch (e) {
      console.error('[DM] matching fail:', e);
      setSync('Save fail', 'err');
      toast('Matching add fail: ' + (e.message || e), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = 'Add Matching'; }
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
    renderEditMatchings(d);
    q('dmEditModal').classList.add('open');
  }
  function closeEditModal(){ q('dmEditModal').classList.remove('open'); }

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
          '<div style="font-size:10.5px;color:#64748b;">' + esc(m.blanket_quality || d.blanket_quality || '') + '</div></div>' +
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
    const patch = Object.assign(skuPatch(newSku), {
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
      }
      Object.assign(d, patch);
      renderAll();
      setSync('✓ ' + dmDesigns.length + ' designs', 'ok');
      closeEditModal();
      toast('Design ' + newNo + ' updated.', 'success');
    } catch (e) {
      setSync('Save fail', 'err');
      toast('Update fail: ' + (e.message || e), 'error');
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

  function dmCatNos(){
    const b = q('dmCatDesignNos');
    return String(b ? b.value : '').split(/[,\s]+/).map(up).filter(Boolean);
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
    if (ctx.nos.length && ctx.nos.indexOf(up(d.design_no)) < 0) return false;
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

  /* ── inner tabs ─────────────────────────────────────────────────────── */
  function showPane(paneId){
    const root = q('designMasterProdSub'); if (!root) return;
    root.querySelectorAll('.dm-pane').forEach(p => p.classList.toggle('active', p.id === paneId));
    root.querySelectorAll('.dm-tab').forEach(b => b.classList.toggle('active', b.dataset.dmtab === paneId));
    if (paneId === 'dmCataloguePane') renderCatalogueFilters();
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
    q('dmAddMatchingForm').addEventListener('submit', addMatching);
    q('dmEditDesignForm').addEventListener('submit', updateDesign);

    ['dmLargeFrame', 'dmMediumFrame', 'dmSmallFrame'].forEach(id => q(id).addEventListener('input', calcNewTotal));
    ['dmEditLargeFrame', 'dmEditMediumFrame', 'dmEditSmallFrame'].forEach(id => q(id).addEventListener('input', calcEditTotal));

    q('dmInitialImage').addEventListener('change', e =>
      previewInto('dmNewDesignPreview', (e.target.files || [])[0], EMPTY_NEW));
    q('dmNewMatchingImage').addEventListener('change', e =>
      previewInto('dmMatchingPreview', (e.target.files || [])[0], EMPTY_MTC));

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
  window.dmReload                   = force => loadDesigns(force !== false);
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
