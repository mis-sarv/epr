/* store-design-master.js — extracted from Store.html (was the inline
   <script> block at line 22514).
   Loaded as a CLASSIC script, in this order, un-deferred: these blocks
   share one global lexical scope and later ones read const/let declared
   by earlier ones. Do not add type="module" or defer. */
/* ============================================================================
   PRODUCTION › DESIGN MASTER
   ----------------------------------------------------------------------------
   V18 ka offline (localStorage) design manager, ab Supabase par:

     design_master      — ek row per DESIGN NO
     design_matchings   — us design ke shades, har ek ke photo ka path
     bucket sarv-pdfs   — design-images/<DESIGN NO>/<stamp>-<rand>.jpg

   Photo ka SACH `image_path` hai, `image_url` nahi. Har jagah src banane ke
   liye dmImgSrc() path se public URL banata hai — isi liye project ka domain
   badal jaane par bhi purani photos load hoti rehti hain, aur design number
   se uska poora folder seedha mil jaata hai (aage design-no-wise image
   updates isi par banenge — dmDesignImages() / dmDesignFolder() dekhein).

   Table banane ke liye: DESIGN_MASTER_MIGRATION.sql (isi folder me) ko
   Supabase › SQL Editor me ek baar chalayein.
============================================================================ */
(function(){
  'use strict';

  const DM_BUCKET = 'sarv-pdfs';
  const DM_FOLDER = 'design-images';

  /* V18 ki shade list — matching naam isi se chune jaate hain. */
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
  let dmCatalogue = [];         // pichhli baar generate kiya hua selection
  const dmImgCache = new Map(); // url → Promise<{dataUrl,w,h,fmt}|null>

  /* ── chhote helpers ─────────────────────────────────────────────────── */
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
  /* Feature Access matrix (Admin Panel) — login se pehle ya function na hone
     par rok nahi lagti, baaki jagah wahi niyam jo poori app par hai. */
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
    setSync('Supabase setup baaki hai', 'err');
    toast('Supabase connect nahi hai — Design Master save / load nahi hoga.', 'error');
    return false;
  }

  /* ── Storage: path hi sach hai ───────────────────────────────────────── */
  /* DESIGN NO ko folder-safe banata hai. "4004/104" jaisa naam slash ke
     kaaran nested folder bana deta tha, isi liye har aisa character '-' ho
     jaata hai — ek design = ek folder. */
  function pathSafe(v){
    return up(v).replace(/[^A-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'NA';
  }
  function dmPublicUrl(path){
    if (!path) return '';
    try { const r = SB.storage.from(DM_BUCKET).getPublicUrl(path); return (r && r.data && r.data.publicUrl) || ''; }
    catch (e) { return ''; }
  }
  /* Kisi bhi matching row ka <img src>. image_path se banta hai; sirf tab
     image_url par girta hai jab path hi na ho. */
  function dmImgSrc(m){
    if (!m) return '';
    return (m.image_path ? dmPublicUrl(m.image_path) : '') || m.image_url || '';
  }

  /* Upload se pehle resize: 1500px lambi side, JPEG 85% — screen aur A4 PDF
     dono ke liye kaafi, aur 6 MB ka phone photo ~250 KB ho jaata hai. */
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
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);   // PNG transparency JPEG me kaali na pade
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

  /* Purani file hata dena — replace ke baad bucket me kachra na bache. Fail
     hone par chup rehta hai: row ka naya path pehle hi save ho chuka hai. */
  async function removeStored(path){
    if (!path) return;
    try { await SB.storage.from(DM_BUCKET).remove([path]); }
    catch (e) { console.warn('[DM] purani image delete nahi hui:', path, e.message || e); }
  }

  /* ── image → dataURL (jsPDF ke liye): ek baar fetch, phir cache ────── */
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
      // MASTER sabse pehle, phir sort_order, phir id — catalogue isi kram par chalta hai.
      index.forEach(d => d.matchings.sort((a, b) =>
        (a.matching_type === 'MASTER' ? 0 : 1) - (b.matching_type === 'MASTER' ? 0 : 1) ||
        (num(a.sort_order) - num(b.sort_order)) || (a.id - b.id)));
      // Nayi entry sabse upar (V18 ki tarah).
      return (masters || []).slice().sort((a, b) =>
        String(b.created_at || '').localeCompare(String(a.created_at || '')) || (b.id - a.id));
    })();
    try {
      dmDesigns = await dmLoadPromise;
      dmLoaded = true;
      setSync('✓ ' + dmDesigns.length + ' designs', 'ok');
      renderAll();
      if (force) toast('Design Master refresh ho gaya — ' + dmDesigns.length + ' designs.', 'success');
    } catch (e) {
      console.error('[DM] load fail:', e);
      setSync('Load fail', 'err');
      const missing = /does not exist|schema cache|Could not find the table/i.test(e.message || '');
      toast(missing
        ? 'design_master table nahi mila — pehle DESIGN_MASTER_MIGRATION.sql Supabase SQL Editor me chalayein.'
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

  /* ── Ek column ka dropdown kya offer karega ──────────────────────────
     Business ke fixed defaults + jo bhi value database me pehle se maujood
     hai. Ek hi function, taaki native <datalist> aur Bulk grid ka picker
     kabhi alag-alag list na dikhayein. dmDesigns se banta hai, jo DB ka
     in-memory mirror hai — to abhi save hui value turant agli row ke dropdown
     me aa jaati hai. */
  function dmValues(kind){
    const uniq = key => [...new Set(dmDesigns.map(d => d[key]).filter(Boolean))].sort();
    const merge = (base, key) =>
      [...new Set(base.concat(dmDesigns.map(d => d[key]).filter(Boolean)))];
    switch (kind) {
      case 'party':   return uniq('party_name');
      case 'brand':   return uniq('brand_name');
      case 'unit':    return merge(['UNIT 1', 'UNIT 2'], 'design_unit');
      case 'bed':     return merge(['DOUBLE BED', 'SINGLE BED'], 'bed_size');
      case 'quality': return merge(['MINK', 'SUPER CLOUDY'], 'blanket_quality');
      case 'type':    return merge(['FLORAL', 'GEOMETRICAL', 'ABSTRACT', 'LEAVES'], 'design_type');
      case 'frame':   return merge(['MS ROUND FRAME', 'MS SQUARE FRAME'], 'frame_type');
      case 'mono':    return ['NO', 'YES'];
      // V18 ki shade list + jo shade naam already kisi design par chadhe hain.
      case 'shade':   return [...new Set(DM_SHADES.concat(
        dmDesigns.reduce((a, d) => a.concat((d.matchings || []).map(m => m.matching_name)), [])
          .filter(Boolean)))];
      default:        return [];
    }
  }

  function renderDatalists(){
    const live = dmDesigns.filter(d => d.status === 'LIVE');
    fillList('dmShadeList', dmValues('shade'));
    fillList('dmPartyList', dmValues('party'));
    fillList('dmBrandList', dmValues('brand'));
    fillList('dmUnitList', dmValues('unit'));
    fillList('dmBedSizeList', dmValues('bed'));
    fillList('dmQualityList', dmValues('quality'));
    fillList('dmTypeList', dmValues('type'));
    fillList('dmFrameTypeList', dmValues('frame'));
    const ld = q('dmLiveDesignList');
    if (ld) ld.innerHTML = live.map(d =>
      '<option value="' + esc(d.design_no) + '">' + esc(d.design_no) + ' — ' +
      esc(d.party_name || '') + ' (' + esc(d.brand_name || '') + ')</option>').join('');
  }

  /* ══ BULK GRID KA DROPDOWN PICKER ════════════════════════════════════
     Bulk ke input boxes par pehle sirf native <datalist> tha. Native datalist
     tabhi khulta hai jab aap type karna shuru karein (aur kuch browsers me
     sirf us chhoti arrow par), isi liye jo party / brand / shade database me
     pehle se the wo practically dikhte hi nahi the — log wahi naam dobara
     type karte the, aur ek typo se doosri party ban jaati thi.

     Ye asli dropdown hai: focus par bhi khulta hai aur click par bhi, us
     column ki database values dikhata hai, type karte hi filter hota hai, aur
     click / ↑↓ / Enter se chunta hai.

     <input> hi rehta hai, <select> nahi banta — purane data ki bulk sheet me
     aisi party ya shade bhi aa sakti hai jo database me abhi nahi hai, aur
     select use refuse kar deta. Isi liye close() par type kiya hua text mitata
     NAHI (makeSearchableSelect wahan sync() karke mita deta hai, kyunki uske
     peeche ek select hota hai).

     Panel ke liye store.css ka wahi .ss-list / .ss-opt reuse kiya hai jo
     makeSearchableSelect use karta hai — app me dropdown ek hi tarah ka dikhe. */
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
    /* Native <datalist> hata dete hain. Warna Chrome apna datalist popup bhi
       kholta hai aur ye panel bhi — do dropdown ek hi box par, ek doosre ke
       upar. Values dono jagah wahi hain (dmValues), to kuch khota nahi. */
    inp.removeAttribute('list');
    const list = dmPickList_();
    let open = false, hl = 0, shown = [];

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
    const render = () => {
      const term = String(inp.value || '').trim().toLowerCase();
      const all = dmValues(kind);
      shown = term ? all.filter(v => String(v).toLowerCase().indexOf(term) >= 0) : all;
      hl = Math.min(hl, Math.max(0, shown.length - 1));
      list.innerHTML = shown.length
        ? shown.map((v, i) => '<div class="ss-opt' + (i === hl ? ' hl' : '') +
            '" data-i="' + i + '">' + esc(v) + '</div>').join('')
        // Free text allowed, so an empty list is not an error — it is said as
        // "this will be a new value", which is the thing worth knowing.
        : '<div class="ss-empty">' + (term ? 'Database me nahi hai — nayi value banegi' : 'Abhi koi value nahi') + '</div>';
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
      list.onmousedown = e => e.preventDefault();      // focus box me hi rahe
      list.onclick = e => {
        const d = e.target.closest('.ss-opt');
        if (d) pick(shown[+d.dataset.i]);
      };
      hl = 0;
      list.hidden = false;
      render();
      document.addEventListener('pointerdown', outside, true);
      addEventListener('scroll', place, true);
      addEventListener('resize', place);
    };

    inp.addEventListener('focus', openList);
    inp.addEventListener('click', openList);
    inp.addEventListener('input', () => { if (!open) openList(); hl = 0; render(); });
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
    ['b-party', 'party'], ['b-brand', 'brand'], ['b-unit', 'unit'], ['b-bed', 'bed'],
    ['b-type', 'type'], ['b-mono', 'mono'], ['b-quality', 'quality'],
    ['b-frame', 'frame'], ['b-matching', 'shade'],
  ];

  function thumbHtml(src, alt){
    if (!src) return '<div class="dm-thumb-none">—</div>';
    return '<img class="dm-thumb" loading="lazy" src="' + esc(src) + '" alt="' + esc(alt || '') +
           '" onclick="dmShowLightbox(this.src,this.alt)" onerror="dmImgFail(this)">';
  }
  const monoCell = v => (v === 'YES')
    ? '<span class="dm-badge dm-badge-mono">YES</span>'
    : '<span class="dm-muted">NO</span>';

  function renderLive(){
    const box = q('dmLiveSearch');
    const term = up(box ? box.value : '');
    const all = dmDesigns.filter(d => d.status === 'LIVE');
    const rows = !term ? all : all.filter(d =>
      [d.design_no, d.party_name, d.brand_name, d.design_type, d.design_unit, d.blanket_quality]
        .concat((d.matchings || []).map(m => m.matching_name))
        .some(v => up(v).indexOf(term) >= 0));

    const lc = q('dmLiveCount');    if (lc) lc.textContent = all.length;
    const dc = q('dmDiscardCount'); if (dc) dc.textContent = dmDesigns.filter(d => d.status === 'DISCARDED').length;
    const sh = q('dmLiveShown');    if (sh) sh.textContent = term ? (rows.length + ' / ' + all.length + ' dikh rahe hain') : '';

    const tb = q('dmLiveTableBody'); if (!tb) return;
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="14" class="dm-empty-row">' +
        (all.length ? 'Is khoj se koi design nahi mila.' : 'Koi Live Design nahi hai — “Create New” se shuru karein.') +
        '</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(d => {
      const m = masterOf(d);
      return '<tr>' +
        '<td><button type="button" class="dm-btn dm-btn-primary dm-btn-xs" onclick="dmOpenEditModal(' + d.id + ')">✏️ Edit</button> ' +
            '<button type="button" class="dm-btn dm-btn-danger dm-btn-xs" title="Discard" onclick="dmSetStatus(' + d.id + ',\'DISCARDED\')">🗑️</button></td>' +
        '<td>' + thumbHtml(dmImgSrc(m), d.design_no) + '</td>' +
        '<td><strong>' + esc(d.design_no) + '</strong></td>' +
        '<td>' + monoCell(d.monopoly) + '</td>' +
        '<td><span class="dm-badge dm-badge-type">' + esc(d.design_type || 'N/A') + '</span></td>' +
        '<td>' + esc(d.party_name || '') + '</td>' +
        '<td>' + esc(d.brand_name || '') + '</td>' +
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
      tb.innerHTML = '<tr><td colspan="11" class="dm-empty-row">Koi discarded design nahi hai.</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(d =>
      '<tr>' +
        '<td><button type="button" class="dm-btn dm-btn-success dm-btn-xs" onclick="dmSetStatus(' + d.id + ',\'LIVE\')">♻️ Restore</button></td>' +
        '<td>' + thumbHtml(dmImgSrc(masterOf(d)), d.design_no) + '</td>' +
        '<td><strong>' + esc(d.design_no) + '</strong></td>' +
        '<td>' + monoCell(d.monopoly) + '</td>' +
        '<td><span class="dm-badge dm-badge-type">' + esc(d.design_type || 'N/A') + '</span></td>' +
        '<td>' + esc(d.party_name || '') + '</td>' +
        '<td>' + esc(d.brand_name || '') + '</td>' +
        '<td>' + esc(d.design_unit || '') + '</td>' +
        '<td>' + esc(d.bed_size || '') + '</td>' +
        '<td>' + esc(d.discarded_at ? new Date(d.discarded_at).toLocaleDateString('en-GB') : '—') + '</td>' +
        '<td><span class="dm-badge dm-badge-discarded">DISCARDED</span></td>' +
      '</tr>').join('');
  }

  /* ════════════════════════════════════════════════════════════════════
     CREATE NEW
  ════════════════════════════════════════════════════════════════════ */
  const EMPTY_NEW = '<span style="font-size:2rem;">🖼️</span><span>[ Passport Size Preview ]</span>' +
                    '<small>Photo dekh kar left side me details fill karein</small>';
  const EMPTY_MTC = '<span style="font-size:2rem;">🖼️</span><span>[ Passport Size Preview ]</span>';

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
    if (!designNo) { toast('DESIGN NO zaroori hai.', 'error'); return; }

    await loadDesigns();
    if (findByNo(designNo)) {
      toast('Design No ' + designNo + ' pehle se hai — “Add Matching” use karein.', 'warn');
      return;
    }

    const file = (q('dmInitialImage').files || [])[0] || null;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving…'; }
    setSync('Saving…', 'busy');
    try {
      const ins = await SB.from('design_master').insert({
        design_no:       designNo,
        party_name:      q('dmPartyName').value.trim(),
        brand_name:      q('dmBrandName').value.trim(),
        design_unit:     q('dmDesignUnit').value.trim(),
        bed_size:        q('dmBedSize').value.trim(),
        design_type:     q('dmDesignType').value.trim() || 'N/A',
        monopoly:        up(q('dmMonopoly').value) === 'YES' ? 'YES' : 'NO',
        blanket_quality: q('dmBlanketQuality').value.trim(),
        frame_type:      q('dmFrameType').value.trim(),
        large_frame:     num(q('dmLargeFrame').value),
        medium_frame:    num(q('dmMediumFrame').value),
        small_frame:     num(q('dmSmallFrame').value),
        status:          'LIVE',
        created_by:      whoAmI()
      }).select().single();
      if (ins.error) throw ins.error;
      const design = ins.data;

      /* Photo pehle design banne ke BAAD upload hoti hai — duplicate Design
         No par insert ruk jaata hai aur bucket me anaath file nahi padti.
         Upload fail hua to design bach jaata hai, photo Edit se lag jaati hai. */
      let img = { path: null, url: null };
      if (file) {
        try { img = await uploadDesignImage(designNo, file); }
        catch (e) { toast('Photo upload fail — design save ho gaya, photo Edit se lagayein.', 'warn'); }
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
      toast('Design ' + designNo + ' save ho gaya.', 'success');
      showPane('dmLivePane');
    } catch (e) {
      console.error('[DM] save fail:', e);
      setSync('Save fail', 'err');
      toast(/duplicate key|unique/i.test(e.message || '')
        ? 'Design No ' + designNo + ' database me pehle se hai.'
        : 'Save fail: ' + (e.message || e), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '💾 Save New Design'; }
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
    info.innerHTML = '<b>' + esc(d.design_no) + '</b> me abhi ' + (d.matchings || []).length + ' matching hain: ' +
      (d.matchings || []).map(m => '<span class="dm-badge ' +
        (m.matching_type === 'MASTER' ? 'dm-badge-master' : 'dm-badge-slave') + '">' +
        esc(m.matching_name) + '</span>').join(' ');
  }

  async function addMatching(ev){
    ev.preventDefault();
    if (!sbReady() || !guard('DESIGN_SAVE')) return;
    await loadDesigns();
    const d = findByNo(q('dmSelectDesign').value);
    if (!d || d.status !== 'LIVE') { toast('Sahi LIVE Design No chunein.', 'error'); return; }

    const name = q('dmNewMatchingName').value.trim();
    if (!name) { toast('Matching name zaroori hai.', 'error'); return; }
    if ((d.matchings || []).some(m => up(m.matching_name) === up(name))) {
      toast('“' + name + '” is design me pehle se hai.', 'warn');
      return;
    }

    const wantMaster = up(q('dmNewMatchingType').value) === 'MASTER';
    const file = (q('dmNewMatchingImage').files || [])[0] || null;
    const btn = ev.target.querySelector('button[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Adding…'; }
    setSync('Saving…', 'busy');
    try {
      let img = { path: null, url: null };
      if (file) {
        try { img = await uploadDesignImage(d.design_no, file); }
        catch (e) { toast('Photo upload fail — matching bina photo add ho rahi hai.', 'warn'); }
      }
      /* MASTER ek hi ho sakta hai (partial unique index) — isi liye pehle
         baakiyon ko SLAVE karna padta hai, tabhi naya MASTER ban sakta hai. */
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
      toast('Matching “' + name + '” add ho gayi.', 'success');
    } catch (e) {
      console.error('[DM] matching fail:', e);
      setSync('Save fail', 'err');
      toast('Matching add fail: ' + (e.message || e), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '➕ Add Matching'; }
    }
  }

  /* ════════════════════════════════════════════════════════════════════
     BULK UPLOAD (purana data — ek saath kai photos)
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
      // File ka naam hi Design No ban jaata hai — extension hata kar, upper-case.
      const guess = file.name.replace(/\.[^/.]+$/, '').toUpperCase();
      const tr = document.createElement('tr');
      tr.id = rowId;
      tr.innerHTML =
        '<td><img src="' + previewUrl + '" class="dm-thumb" style="width:58px;height:58px;" alt=""></td>' +
        '<td><input type="text" class="dm-bulk-in b-design" value="' + esc(guess) + '" oninput="this.value=this.value.toUpperCase()" placeholder="Design No" style="font-weight:800;color:#2563eb;"></td>' +
        '<td><div class="dm-bulk-col">' +
          '<input type="text" class="dm-bulk-in b-party" list="dmPartyList" placeholder="Party">' +
          '<input type="text" class="dm-bulk-in b-brand" list="dmBrandList" placeholder="Brand"></div></td>' +
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
            'title="Sirf isi photo ki row save karein — baaki rows jaisi hain waisi rahengi">💾 Save</button>' +
          '<button type="button" class="dm-btn dm-btn-danger dm-btn-xs" ' +
            'onclick="dmRemoveBulkRow(\'' + rowId + '\')">❌ Remove</button>' +
        '</div></td>';
      tb.appendChild(tr);
      // Database me jo values pehle se hain, unka dropdown har input par.
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

  /* Ek row ke zaroori inputs. Khaali string = row theek hai. */
  function validateBulkRow(tr){
    const g = bulkGet(tr);
    const no = up(g('.b-design'));
    if (!no || !g('.b-party') || !g('.b-brand') || !g('.b-matching')) {
      return 'Row “' + (no || '—') + '”: Design No, Party, Brand aur Matching — ye chaar zaroori hain.';
    }
    return '';
  }
  // Is row ka Design No screen par kisi doosri row me bhi pada hai?
  function bulkDupOnScreen(tr){
    const no = up((tr.querySelector('.b-design') || {}).value);
    if (!no) return false;
    return Array.from(document.querySelectorAll('#dmBulkTableBody tr'))
      .some(o => o !== tr && up((o.querySelector('.b-design') || {}).value) === no);
  }
  function bulkMark(tr, txt, color, title){
    const s = tr.querySelector('.b-state');
    if (!s) return;
    s.textContent = txt; s.style.color = color; s.title = title || '';
  }

  /* ══ EK BULK ROW KA SAVE ═════════════════════════════════════════════
     Row ka apna 💾 Save aur neeche ka "Save All Designs" — dono yahin se
     guzarte hain, isi liye dono ka natija hamesha ek jaisa hota hai. Ek row
     se ek design + uski MASTER matching + photo banti hai.

     Lauta ta hai: 'saved' | 'skipped' | 'failed'. Validation isme NAHI hai —
     wo caller karta hai, kyunki Save All poori list pehle jaanchta hai (aadha
     save ho jaana sabse buri soorat hai) aur single Save sirf apni row. */
  async function saveBulkRow(tr){
    const g = bulkGet(tr);
    const no = up(g('.b-design'));
    if (findByNo(no)) { bulkMark(tr, '⚠ pehle se hai', '#b45309'); return 'skipped'; }
    try {
      const ins = await SB.from('design_master').insert({
        design_no: no,
        party_name: g('.b-party'), brand_name: g('.b-brand'),
        design_unit: g('.b-unit'), bed_size: g('.b-bed'),
        design_type: g('.b-type') || 'N/A',
        monopoly: up(g('.b-mono')) === 'YES' ? 'YES' : 'NO',
        blanket_quality: g('.b-quality'), frame_type: g('.b-frame'),
        large_frame: num(g('.b-large')), medium_frame: num(g('.b-medium')), small_frame: num(g('.b-small')),
        status: 'LIVE', created_by: whoAmI()
      }).select().single();
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

  /* Row ka apna 💾 Save — sirf isi photo ki row jaati hai, baaki rows jaisi
     hain waisi rehti hain. Isi liye kuch log poori sheet bharne ke bajaye ek
     photo ki entry pakki karke aage badhna chahte hain. */
  async function saveOneBulkRow(rowId){
    if (!sbReady() || !guard('DESIGN_SAVE')) return;
    const tr = q(rowId); if (!tr) return;
    const err = validateBulkRow(tr);
    if (err) { tr.scrollIntoView({ block: 'center' }); toast(err, 'error'); return; }
    if (bulkDupOnScreen(tr)) {
      tr.scrollIntoView({ block: 'center' });
      toast('Ye Design No niche / upar kisi aur row me bhi hai — pehle wo theek karein.', 'error');
      return;
    }
    const btn = tr.querySelector('.b-save');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ …'; }
    setSync('Saving…', 'busy');
    await loadDesigns();
    const r = await saveBulkRow(tr);
    if (btn) { btn.disabled = false; btn.innerHTML = '💾 Save'; }
    renderAll();
    setSync('✓ ' + dmDesigns.length + ' designs', r === 'failed' ? 'err' : 'ok');
    if (r === 'saved') {
      const no = up((tr.querySelector('.b-design') || {}).value);
      toast('Design ' + no + ' save ho gaya.', 'success');
      removeBulkRow(tr.id);     // sirf yahi row hatti hai
    } else if (r === 'skipped') {
      toast('Ye Design No database me pehle se hai — save nahi hua.', 'warn');
    } else {
      toast('Save fail — Action column ke “✗ fail” par hover karke wajah dekhein.', 'error');
    }
  }

  async function saveAllBulk(){
    if (!sbReady() || !guard('DESIGN_SAVE')) return;
    const trs = Array.from(document.querySelectorAll('#dmBulkTableBody tr'));
    if (!trs.length) { toast('Koi row nahi hai.', 'warn'); return; }
    await loadDesigns();

    /* Pehle poori list jaanch lo — aadha save hona sabse buri soorat hai. */
    const seen = new Set();
    for (const tr of trs) {
      const err = validateBulkRow(tr);
      if (err) { tr.scrollIntoView({ block: 'center' }); toast(err, 'error'); return; }
      const no = up((tr.querySelector('.b-design') || {}).value);
      if (seen.has(no)) {
        tr.scrollIntoView({ block: 'center' });
        toast('Design No ' + no + ' is list me do baar hai.', 'error');
        return;
      }
      seen.add(no);
    }

    const btn = document.querySelector('#dmBulkTableContainer .dm-table-foot .dm-btn');
    if (btn) btn.disabled = true;
    let done = 0, skipped = 0, failed = 0;
    for (let i = 0; i < trs.length; i++) {
      if (btn) btn.textContent = '⏳ ' + (i + 1) + ' / ' + trs.length + '…';
      setSync('Saving ' + (i + 1) + '/' + trs.length + '…', 'busy');
      const r = await saveBulkRow(trs[i]);
      if (r === 'saved') done++; else if (r === 'skipped') skipped++; else failed++;
    }
    if (btn) { btn.disabled = false; btn.innerHTML = '✅ Save All Designs'; }
    renderAll();
    setSync('✓ ' + dmDesigns.length + ' designs', failed ? 'err' : 'ok');

    /* Jo row sach me save ho gayi, sirf wahi hat jaati hai — skip / fail wali
       screen par rehti hai taaki galti theek karke dobara save ho sake. */
    Array.from(document.querySelectorAll('#dmBulkTableBody tr')).forEach(tr => {
      const st = tr.querySelector('.b-state');
      if (st && st.textContent.indexOf('✓') === 0) removeBulkRow(tr.id);
    });

    let msg = 'Bulk upload: ' + done + ' save';
    if (skipped) msg += ', ' + skipped + ' skip (pehle se maujood)';
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
    if (!confirm('Design ' + d.design_no + ' ko ' + (status === 'LIVE' ? 'RESTORE' : 'DISCARD') + ' karna hai?')) return;
    setSync('Saving…', 'busy');
    try {
      const patch = { status: status, discarded_at: status === 'DISCARDED' ? new Date().toISOString() : null };
      const r = await SB.from('design_master').update(patch).eq('id', id);
      if (r.error) throw r.error;
      Object.assign(d, patch);
      renderAll();
      setSync('✓ ' + dmDesigns.length + ' designs', 'ok');
      toast('Design ' + d.design_no + ' ' + status + ' ho gaya.', 'success');
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
    calcEditTotal();
    renderEditMatchings(d);
    q('dmEditModal').classList.add('open');
  }
  function closeEditModal(){ q('dmEditModal').classList.remove('open'); }

  function renderEditMatchings(d){
    const box = q('dmEditMatchingsList'); if (!box) return;
    if (!(d.matchings || []).length) {
      box.innerHTML = '<p class="dm-hint">Koi matching nahi — “Add Matching” tab se jodein.</p>';
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
          '<label class="dm-repl">' + (src ? '🔁 Replace Photo' : '📷 Add Photo') +
            '<input type="file" accept="image/*" hidden onchange="dmReplacePhoto(' + d.id + ',' + m.id + ',this)"></label>' +
          '<button type="button" class="dm-btn dm-btn-danger dm-btn-xs" title="Matching hatayein" onclick="dmDeleteMatching(' + d.id + ',' + m.id + ')">❌</button>' +
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
      toast('Master matching badal gayi.', 'success');
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
      toast('Photo update ho gaya.', 'success');
    } catch (e) {
      setSync('Upload fail', 'err');
      toast('Photo update fail: ' + (e.message || e), 'error');
    }
  }

  async function deleteMatching(designId, matchingId){
    if (!sbReady() || !guard('DESIGN_DISCARD')) return;
    const d = dmDesigns.find(x => x.id === designId); if (!d) return;
    const m = d.matchings.find(x => x.id === matchingId); if (!m) return;
    if (d.matchings.length === 1) { toast('Aakhiri matching nahi hat sakti — design discard karein.', 'warn'); return; }
    if (!confirm('Matching “' + m.matching_name + '” hata dein? Uski photo bhi delete hogi.')) return;
    setSync('Saving…', 'busy');
    try {
      const r = await SB.from('design_matchings').delete().eq('id', matchingId);
      if (r.error) throw r.error;
      await removeStored(m.image_path);
      d.matchings = d.matchings.filter(x => x.id !== matchingId);
      // Master hata diya to pehli bachi hui matching naya master ban jaati hai.
      if (m.matching_type === 'MASTER' && d.matchings.length) {
        const nm = d.matchings[0];
        const pro = await SB.from('design_matchings').update({ matching_type: 'MASTER' }).eq('id', nm.id);
        if (!pro.error) nm.matching_type = 'MASTER';
      }
      renderEditMatchings(d); renderLive(); renderDiscarded();
      setSync('✓ ' + dmDesigns.length + ' designs', 'ok');
      toast('Matching hat gayi.', 'success');
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
    if (!newNo) { toast('DESIGN NO khaali nahi ho sakta.', 'error'); return; }
    if (dmDesigns.some(x => x.id !== id && up(x.design_no) === newNo)) {
      toast('Design No ' + newNo + ' kisi aur design ka hai.', 'error');
      return;
    }
    const patch = {
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
      brand_name:      q('dmEditBrandName').value.trim()
    };
    setSync('Saving…', 'busy');
    try {
      const r = await SB.from('design_master').update(patch).eq('id', id);
      if (r.error) throw r.error;
      /* Design No badla to matchings ka design_no bhi saath chalna chahiye —
         catalogue aur image folder dono isi naam se chalte hain. Purani
         photos apne purane folder me padi rehti hain; unka path row me hai,
         to wo load hoti rehti hain. Nayi photo naye folder me jaayegi. */
      if (up(d.design_no) !== newNo) {
        const rm = await SB.from('design_matchings').update({ design_no: newNo }).eq('design_id', id);
        if (!rm.error) d.matchings.forEach(m => { m.design_no = newNo; });
      }
      Object.assign(d, patch);
      renderAll();
      setSync('✓ ' + dmDesigns.length + ' designs', 'ok');
      closeEditModal();
      toast('Design ' + newNo + ' update ho gaya.', 'success');
    } catch (e) {
      setSync('Save fail', 'err');
      toast('Update fail: ' + (e.message || e), 'error');
    }
  }

  /* ════════════════════════════════════════════════════════════════════
     CATALOGUE — filters, on-screen preview, asli PDF
  ════════════════════════════════════════════════════════════════════ */
  /* Filter box dobara banta hai to jo tick pehle se lage the wo bache rahen;
     nayi value hamesha ticked aati hai (default "sab chuna hua"). */
  function fillFilterBox(boxId, name, values){
    const box = q(boxId); if (!box) return;
    const prev = new Map(Array.from(box.querySelectorAll('input')).map(i => [i.value, i.checked]));
    box.innerHTML = values.length
      ? values.map(v => '<label><input type="checkbox" name="' + name + '" value="' + esc(v) + '"' +
          (prev.has(v) ? (prev.get(v) ? ' checked' : '') : ' checked') + '> ' + esc(v) + '</label>').join('')
      : '<span class="dm-empty">No data</span>';
  }

  function renderCatalogueFilters(){
    const live = dmDesigns.filter(d => d.status === 'LIVE');
    const uniq = key => [...new Set(live.map(d => d[key]).filter(Boolean))].sort();
    fillFilterBox('dmUnitFilterBox', 'dmUnitFilter', uniq('design_unit'));
    fillFilterBox('dmQualityFilterBox', 'dmQualityFilter', uniq('blanket_quality'));
    fillFilterBox('dmPartyFilterBox', 'dmPartyFilter', uniq('party_name'));
    fillFilterBox('dmBrandFilterBox', 'dmBrandFilter', uniq('brand_name'));
    fillFilterBox('dmTypeFilterBox', 'dmTypeFilter', uniq('design_type'));
    fillFilterBox('dmMonopolyFilterBox', 'dmMonopolyFilter', [...new Set(live.map(d => d.monopoly || 'NO'))].sort());
    fillFilterBox('dmFramesFilterBox', 'dmFramesFilter',
      [...new Set(live.map(d => String(totalFrames(d))))].sort((a, b) => parseInt(a, 10) - parseInt(b, 10)));
  }

  function toggleFilter(name, checkAll){
    document.querySelectorAll('input[name="' + name + '"]').forEach(cb => { cb.checked = checkAll; });
  }
  function pickedFilter(name){
    return Array.from(document.querySelectorAll('input[name="' + name + '"]:checked')).map(cb => cb.value);
  }

  /* Khaali filter = us column par koi rok nahi (V18 jaisa hi niyam). */
  function selectedDesigns(){
    const u  = pickedFilter('dmUnitFilter'),     ql = pickedFilter('dmQualityFilter'),
          p  = pickedFilter('dmPartyFilter'),    b  = pickedFilter('dmBrandFilter'),
          t  = pickedFilter('dmTypeFilter'),     f  = pickedFilter('dmFramesFilter'),
          mo = pickedFilter('dmMonopolyFilter');
    const nosBox = q('dmCatDesignNos');
    const nos = String(nosBox ? nosBox.value : '').split(/[,\s]+/).map(up).filter(Boolean);
    return dmDesigns.filter(d =>
      d.status === 'LIVE' &&
      (!nos.length || nos.indexOf(up(d.design_no)) >= 0) &&
      (!u.length  || u.indexOf(d.design_unit) >= 0) &&
      (!ql.length || ql.indexOf(d.blanket_quality) >= 0) &&
      (!p.length  || p.indexOf(d.party_name) >= 0) &&
      (!b.length  || b.indexOf(d.brand_name) >= 0) &&
      (!t.length  || t.indexOf(d.design_type) >= 0) &&
      (!f.length  || f.indexOf(String(totalFrames(d))) >= 0) &&
      (!mo.length || mo.indexOf(d.monopoly || 'NO') >= 0));
  }

  function catStatus(msg){ const el = q('dmCatStatus'); if (el) el.textContent = msg || ''; }

  function generatePreview(){
    const area = q('dmCataloguePrintArea'); if (!area) return [];
    dmCatalogue = selectedDesigns();
    if (!dmCatalogue.length) {
      area.innerHTML = '<div class="dm-cat-page" style="min-height:auto;padding:36px;text-align:center;">' +
                       '<h3>Is filter se koi design nahi mila.</h3></div>';
      catStatus('');
      return [];
    }
    area.innerHTML = dmCatalogue.map(d => {
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
                '<th>MONOPOLY</th><td><strong style="color:' + (d.monopoly === 'YES' ? '#dc2626' : 'inherit') + ';">' +
                esc(d.monopoly || 'NO') + '</strong></td></tr>' +
            '<tr><th>PARTY / BRAND</th><td><strong>' + esc(d.party_name || '') + '</strong> (' + esc(d.brand_name || '') + ')</td>' +
                '<th>DESIGN TYPE</th><td><strong style="color:#2563eb;">' + esc(d.design_type || 'N/A') + '</strong></td></tr>' +
            '<tr><th>UNIT / BED</th><td>' + esc(d.design_unit || '') + ' (' + esc(d.bed_size || '') + ')</td>' +
                '<th>QUALITY</th><td>' + esc((m && m.blanket_quality) || d.blanket_quality || '') + '</td></tr>' +
            '<tr><th>FRAMES (L/M/S)</th><td>L: ' + num(d.large_frame) + ' | M: ' + num(d.medium_frame) +
                ' | S: ' + num(d.small_frame) + '</td>' +
                '<th>TOTAL FRAMES</th><td><strong style="font-size:12pt;">' + totalFrames(d) + '</strong></td></tr>' +
            '<tr><th>TOTAL MATCHINGS</th><td colspan="3">' + (d.matchings || []).length + ' shades</td></tr>' +
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
    const pages = dmCatalogue.reduce((n, d) => {
      const m = masterOf(d);
      return n + 1 + Math.ceil((d.matchings || []).filter(x => !m || x.id !== m.id).length / 8);
    }, 0);
    catStatus(dmCatalogue.length + ' designs · ~' + pages + ' pages');
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
  /* Image ko box ke andar uske asli anupaat me, beech me rakhta hai. */
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
      toast('jsPDF load nahi hua — page reload karein.', 'error');
      return null;
    }
    /* PDF hamesha ABHI ke filters par banti hai — preview dobara render karke
       list uthai jaati hai, taaki screen par jo dikh raha hai wahi PDF me jaaye
       (filter badal kar seedha Download dabane par purana selection na nikle). */
    const list = generatePreview();
    if (!list.length) { toast('Is filter se koi design nahi mila.', 'warn'); return null; }

    /* Saari photos pehle utaar lo (cache ke saath) — PDF banne ke beech me
       network ka intezaar nahi, aur ek hi photo do jagah ho to ek baar hi
       download hoti hai. */
    const urls = [];
    list.forEach(d => (d.matchings || []).forEach(m => { const s = dmImgSrc(m); if (s && urls.indexOf(s) < 0) urls.push(s); }));
    const loaded = new Map();
    for (let i = 0; i < urls.length; i++) {
      catStatus('Photos load ho rahi hain (' + (i + 1) + '/' + urls.length + ')…');
      loaded.set(urls[i], await imgData(urls[i]));
    }
    catStatus('PDF ban rahi hai…');

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
          ['DESIGN NO', String(d.design_no || ''), 'MONOPOLY', String(d.monopoly || 'NO')],
          ['PARTY / BRAND', (d.party_name || '') + ' (' + (d.brand_name || '') + ')', 'DESIGN TYPE', String(d.design_type || 'N/A')],
          ['UNIT / BED', (d.design_unit || '') + ' (' + (d.bed_size || '') + ')', 'QUALITY', String((m && m.blanket_quality) || d.blanket_quality || '')],
          ['FRAME TYPE', String(d.frame_type || ''), 'TOTAL FRAMES', String(totalFrames(d))],
          ['FRAMES L / M / S', num(d.large_frame) + ' / ' + num(d.medium_frame) + ' / ' + num(d.small_frame),
           'TOTAL MATCHINGS', String((d.matchings || []).length)]
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
    doc.save(pdfFileName());
    toast('Catalogue PDF download ho gayi.', 'success');
  }
  async function openPdf(){
    const doc = await buildCataloguePdf(); if (!doc) return;
    const win = window.open(doc.output('bloburl'), '_blank');
    if (!win) toast('Popup block ho gaya — “Download PDF” use karein.', 'warn');
  }

  /* ── JSON backup (V18 ka ⬇️ Download Backup) ───────────────────────── */
  function exportBackup(){
    if (!dmDesigns.length) { toast('Backup ke liye data nahi hai.', 'warn'); return; }
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
    toast('Backup download ho gaya.', 'success');
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
  /* Photo load na ho (net gaya, file hat gayi) to table ka layout na tute. */
  function imgFail(el){
    const box = document.createElement('div');
    box.className = 'dm-thumb-none';
    box.textContent = '!';
    box.title = 'Photo load nahi hui';
    el.replaceWith(box);
  }

  /* ── andar ke tabs ──────────────────────────────────────────────────── */
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

    let searchTimer = null;
    q('dmLiveSearch').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderLive, 140);
    });

    q('dmEditModal').addEventListener('click', e => { if (e.target.id === 'dmEditModal') closeEditModal(); });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (q('dmLightbox').classList.contains('open')) closeLightbox();
      else if (q('dmEditModal').classList.contains('open')) closeEditModal();
    });

    renderDatalists();
    const ready = (typeof SB_READY !== 'undefined' && SB_READY);
    setSync(ready ? 'Ready — Production kholte hi load hoga' : 'Supabase setup baaki hai', ready ? '' : 'err');
  });

  /* ── Production panel / sub-tab, bahar se bulane ke liye ──────────── */
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
  // activatePanel('productionPanel') data yahan se mangwata hai.
  window.dmEnsureLoaded = () => loadDesigns();

  /* HTML ke inline onclick / onchange ke liye zaroori handles. */
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
  window.dmGenerateCataloguePreview = generatePreview;
  window.dmDownloadCataloguePdf     = downloadPdf;
  window.dmOpenCataloguePdf         = openPdf;
  window.dmShowLightbox             = showLightbox;
  window.dmCloseLightbox            = closeLightbox;
  window.dmImgFail                  = imgFail;

  /* Aage design-no-wise image updates ke liye do seedhe raste: ek design
     number do, uske saare photos (path + URL) mil jaate hain; ya us design
     ka bucket folder mil jaata hai. */
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
