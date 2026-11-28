/* upload-guard.js — the Admin's rules for EVERY file / photo upload box of the project
   (ERP › Admin Panel › Uploads, sql/UPLOAD_POLICY_MIGRATION.sql).

   Load it in every app page (after sso-gate.js; it needs nothing else). It never changes a page's own code:
     1. FINDS every <input type=file> (also ones drawn later, by a MutationObserver) and gives it a KEY:
          <page>#<data-up>  else  <page>#<id, digits as N>  else  <page>#<onchange function>  else  <page>#<label slug>
        A Camera box and a Gallery box of one purpose share a key (same data-up / same onchange function), so the
        Admin sees ONE row with two switches.
     2. REPORTS the boxes it has not reported lately (up_register, logged-in pages only), so a box added in a later
        update shows up in the Admin's list by itself the first time anyone opens that screen.
     3. APPLIES the rule of the key when the box is clicked (a user tap, a <label>, or the page's own input.click()):
          f = Upload from files / device storage, c = Camera upload, l = the camera must be the LIVE in-page camera.
        Only when the rule differs from what the box would do by itself does it step in:
          - way not allowed  → the allowed way is opened instead (a Gallery box opens the camera, or the reverse)
          - both allowed on a single box → a small sheet asks "Choose from files / Take photo"
          - live → the in-page camera (getUserMedia); the photo is stamped LIVE PHOTO · name · date time and handed to
            the page as if picked (DataTransfer + a change event), so every page's own handler just works.
        In a Camera + Gallery pair the button of a way that is switched off is hidden (when it is a <label>).
   A box with no rule yet (server not reached, migration not run) behaves exactly as before.
     4. PHOTO QUALITY % (2026-11-26, Admin Panel › Uploads › Photo quality; app_settings 'upload_quality' = {key: %},
        no % = the page's own). Every page shrinks a picked photo itself (a canvas of its own size, then a JPEG of its
        own quality). With a % set for the box, for a few seconds after its photo is picked (UPQ) the page's canvas
        is drawn bigger: at least that % of the photo's OWN pixels on each side (100 % = as taken, at most 4096 px),
        under the same coordinates the page uses (transform + the canvas keeps reporting the page's own width /
        height), and its JPEG quality is raised to at least 0.6 + 0.4 × % (100 % = 1.0). The live camera follows it
        too. A higher % = sharper but bigger files. */
(function () {
  'use strict';
  if (window.__sarvUpGuard) return;
  window.__sarvUpGuard = true;

  var SB_URL = 'https://jdlzgjgxxjkjejkhvdij.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkbHpnamd4eGpramVqa2h2ZGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODUwMDcsImV4cCI6MjEwNTY2MTAwN30.ow4i6e78i-dGoJJh2-N4FX6EQE7f2FRQDgCMJHpxAWk';
  var LS_POL = 'sarv_up_policy_v1', LS_SENT = 'sarv_up_sent_v1', RESEND_MS = 3 * 86400000;
  var PAGE = (function () { try { return decodeURIComponent(location.pathname.split('/').pop() || 'index.html').toLowerCase(); } catch (e) { return 'index.html'; } })();
  var PAGE_NAME = { 'index.html':'ERP', 'mobile.html':'Mobile approvals', 'my-requests.html':'Track My Store Request', 'task_manager.html':'Task Manager',
    'complaint.html':'Complaint', 'gate_2.html':'Gate-2', 'packing.html':'Packing', 'unloader.html':'Unloader Supervisor', 'issuer.html':'Issue Supervisor',
    'bill-check.html':'Bill Check', 'sop.html':'SOP', 'order-form.html':'Order Form', 'notepad.html':'My Notepad', 'launcher.html':'Launcher' };

  var POL = {};                                   // key -> {f, c, l}
  var QMAP = {}, LS_Q = 'sarv_up_quality_v1';     // key -> photo quality % (PHOTO QUALITY)
  try { var q0 = JSON.parse(localStorage.getItem(LS_Q) || 'null'); if (q0 && q0.map) QMAP = q0.map; } catch (e) {}
  try { var c0 = JSON.parse(localStorage.getItem(LS_POL) || 'null'); if (c0 && c0.rows) POL = c0.rows; } catch (e) {}
  var SENT = {};
  try { SENT = JSON.parse(localStorage.getItem(LS_SENT) || '{}') || {}; } catch (e) {}

  function token() { try { return localStorage.getItem('sarv_sso_token') || ''; } catch (e) { return ''; } }
  function rpc(fn, body) {
    return fetch(SB_URL + '/rest/v1/rpc/' + fn, { method:'POST', headers:{ 'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer ' + SB_KEY },
      body:JSON.stringify(body || {}) }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function loadQuality() {
    return fetch(SB_URL + '/rest/v1/app_settings?key=eq.upload_quality&select=value', { headers:{ apikey:SB_KEY, Authorization:'Bearer ' + SB_KEY } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!Array.isArray(d)) return;
        var v = d[0] && d[0].value; QMAP = (v && typeof v === 'object') ? v : {};
        try { localStorage.setItem(LS_Q, JSON.stringify({ at:Date.now(), map:QMAP })); } catch (e) {}
      }).catch(function () {});
  }
  function qualityOf(el) { var q = Number(QMAP[keyOf(el)]); return q >= 10 && q <= 100 ? q : 0; }
  function loadPolicy() {
    loadQuality();
    return rpc('up_policy_list', {}).then(function (d) {
      if (!d || !d.success || !d.rows) return;
      POL = d.rows;
      try { localStorage.setItem(LS_POL, JSON.stringify({ at:Date.now(), rows:POL })); } catch (e) {}
      applyAll();
    });
  }

  /* ── keys and labels ── */
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }
  function txt(el) { return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  function partOf(el) {
    var d = el.getAttribute('data-up'); if (d) return d;
    if (el.id) return el.id.replace(/\d+/g, 'N');
    var oc = String(el.getAttribute('onchange') || '').replace(/^\s*return\s+/, '');
    var m = /^\s*([A-Za-z_$][\w$]*)\s*\(/.exec(oc);
    if (m && !/^(this|event|window)$/.test(m[1])) return m[1];
    var lb = ownLabel(el);
    return slug(lb) || 'file';
  }
  function keyOf(el) { if (!el.__upKey) el.__upKey = PAGE + '#' + partOf(el); return el.__upKey; }
  function ownLabel(el) {
    var a = el.getAttribute('data-up-label') || el.getAttribute('aria-label') || el.getAttribute('title'); if (a) return a;
    var l = el.closest('label'); if (l) return txt(l);
    if (el.id) { try { var f = document.querySelector('label[for="' + el.id + '"]'); if (f) return txt(f); } catch (e) {} }
    return '';
  }
  // "ERP › <nearest heading> › <the box's own words>", so the Admin can tell the rows apart
  function labelOf(el) {
    var own = ownLabel(el), head = '', n = el;
    for (var i = 0; i < 8 && n && !head; i++) {
      n = n.parentElement; if (!n) break;
      var h = n.querySelector && n.querySelector('h1,h2,h3,h4,legend,.modal-title,.card-title,.ttl,.tt');
      if (h && txt(h) && txt(h).length < 70) head = txt(h);
    }
    var parts = [PAGE_NAME[PAGE] || PAGE.replace(/\.html$/, '')];
    if (head && head !== own) parts.push(head);
    if (own) parts.push(own.slice(0, 60));
    return parts.join(' › ').slice(0, 150);
  }
  function isImage(el) { var a = String(el.getAttribute('accept') || '').toLowerCase(); return !a || a.indexOf('image') >= 0; }
  function sameKey(k) { return Array.prototype.filter.call(document.querySelectorAll('input[type=file]'), function (x) { return keyOf(x) === k; }); }
  /* What the code itself offers for a key: any box without capture = files, any box with capture = camera. */
  function codeDefault(k) {
    var l = sameKey(k), f = false, c = false;
    l.forEach(function (x) { if (x.__upCap === undefined) x.__upCap = x.getAttribute('capture'); if (x.__upCap != null) c = true; else f = true; });
    return { f:f || !l.length, c:c, l:false };
  }
  function policyOf(el) { var k = keyOf(el), p = POL[k]; return p ? { f:!!p.f, c:!!p.c, l:!!p.l } : codeDefault(k); }

  /* ── seeing the boxes ── */
  var PENDING = {}, regT = 0;
  function scan() {
    var list = document.querySelectorAll('input[type=file]');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.__upSeen) continue;
      el.__upSeen = true;
      if (el.__upCap === undefined) el.__upCap = el.getAttribute('capture');
      var k = keyOf(el), p = PENDING[k] || (PENDING[k] = { key:k, page:PAGE, label:'', accept:'', multiple:false, image:false, file:false, camera:false });
      if (!p.label) p.label = labelOf(el);
      p.accept = p.accept || el.getAttribute('accept') || '';
      p.multiple = p.multiple || !!el.multiple;
      p.image = p.image || isImage(el);
      if (el.__upCap != null) p.camera = true; else p.file = true;
    }
    applyAll();
    clearTimeout(regT); regT = setTimeout(register, 1500);
  }
  function register() {
    var tok = token(); if (!tok) return;
    var now = Date.now(), out = [];
    Object.keys(PENDING).forEach(function (k) { if (!SENT[k] || now - SENT[k] > RESEND_MS || !POL[k]) out.push(PENDING[k]); });
    PENDING = {};
    if (!out.length) return;
    rpc('up_register', { p_token:tok, p_points:out.slice(0, 80) }).then(function (d) {
      if (!d || !d.success) return;
      out.forEach(function (p) { SENT[p.key] = now; });
      try { localStorage.setItem(LS_SENT, JSON.stringify(SENT)); } catch (e) {}
    });
  }
  /* The button that opens one box: a <label> around it (holding only this box), or a <label for="its id">. */
  function labelBtn(x) {
    var l = x.closest('label');
    if (l && l.querySelectorAll('input[type=file]').length === 1) return l;
    if (x.id) { try { return document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(x.id) : x.id) + '"]'); } catch (e) {} }
    return null;
  }
  /* In a Camera + Gallery pair, the <label> button of a way that is switched off is hidden (the other way stays). */
  function applyAll() {
    var all = document.querySelectorAll('input[type=file]'), byKey = {};
    Array.prototype.forEach.call(all, function (x) { (byKey[keyOf(x)] = byKey[keyOf(x)] || []).push(x); });
    Object.keys(byKey).forEach(function (k) {
      var l = byKey[k], P = POL[k];
      l.forEach(function (x) {
        if (x.__upCap === undefined) x.__upCap = x.getAttribute('capture');
        var lab = labelBtn(x), hide = false;
        if (P && l.length > 1 && lab) {
          var cam = x.__upCap != null, okC = P.c && isImage(x);
          hide = cam ? (!okC && P.f) : (!P.f && okC);
        }
        if (lab) {
          if (hide && !lab.hasAttribute('data-up-hidden')) { lab.setAttribute('data-up-hidden', lab.style.display || ''); lab.style.display = 'none'; }
          else if (!hide && lab.hasAttribute('data-up-hidden')) { lab.style.display = lab.getAttribute('data-up-hidden'); lab.removeAttribute('data-up-hidden'); }
        }
      });
    });
  }

  /* ── deciding a click ── */
  function decide(el) {
    var P = policyOf(el), img = isImage(el), cam = el.__upCap != null;
    var canF = P.f, canC = P.c && img;
    if (!canF && !canC) return { way:'block' };
    var pair = sameKey(keyOf(el)).length > 1;
    if (pair) {
      if (cam ? canC : canF) return cam && P.l ? { way:'live' } : null;      // its own way is allowed: as before (live replaces the camera app)
      return { way:canC ? (P.l ? 'live' : 'camera') : 'file' };
    }
    if (canF && canC) return { way:'ask', live:P.l };
    if (canC) return P.l ? { way:'live' } : (cam ? null : { way:'camera' });
    return cam ? { way:'file' } : null;
  }
  function openNative(el, cap) {
    if (cap) el.setAttribute('capture', cap); else el.removeAttribute('capture');
    el.__upPass = el.isConnected;                    // only a box in the page sends its click past the listener below
    try { NATIVE_CLICK.call(el); } catch (e) {}
    el.__upPass = false;
    setTimeout(function () { if (el.__upCap != null) el.setAttribute('capture', el.__upCap); else el.removeAttribute('capture'); }, 0);
  }
  function run(el, d) {
    if (d.way === 'block') return toast('Uploading here is switched off by the Admin.');
    if (d.way === 'file') return openNative(el, null);
    if (d.way === 'camera') return openNative(el, el.__upCap || 'environment');
    if (d.way === 'live') return openLive(el);
    // ask
    sheet([{ t:'Choose from files', f:function () { openNative(el, null); } },
           { t:d.live ? 'Take live photo' : 'Take photo', f:function () { if (d.live) openLive(el); else openNative(el, el.__upCap || 'environment'); } }]);
  }
  var NATIVE_CLICK = HTMLInputElement.prototype.click;
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'INPUT' || el.type !== 'file') return;
    if (el.__upPass) { el.__upPass = false; return; }
    if (!el.__upSeen) scan();
    var d = decide(el);
    if (!d) return;                                   // the box does what the rule wants by itself
    e.preventDefault();
    run(el, d);
  }, true);
  // A box clicked by code while not in the page (createElement + click) never reaches the listener above
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file' && !this.isConnected) {
      if (this.__upCap === undefined) this.__upCap = this.getAttribute('capture');
      var d = decide(this);
      if (d) return run(this, d);
    }
    return NATIVE_CLICK.call(this);
  };

  /* ── small UI: toast, sheet, live camera (own look, works on every page) ── */
  var CSS = '.upg-t{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 12px);transform:translate(-50%,-120px);transition:transform .45s cubic-bezier(.32,.72,0,1);z-index:2147483600;background:rgba(40,40,42,.95);color:#fff;border-radius:20px;padding:10px 16px;font:500 14px -apple-system,system-ui,sans-serif;max-width:92%}'
    + '.upg-t.in{transform:translate(-50%,0)}'
    + '.upg-s{position:fixed;inset:0;z-index:2147483500;background:rgba(0,0,0,.4);opacity:0;transition:opacity .25s}.upg-s.in{opacity:1}'
    + '.upg-s .g{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);width:min(calc(100% - 16px),420px);transform:translate(-50%,130%);transition:transform .4s cubic-bezier(.32,.72,0,1);display:flex;flex-direction:column;gap:8px}'
    + '.upg-s.in .g{transform:translate(-50%,0)}'
    + '.upg-s .b{background:rgba(246,246,246,.97);border-radius:14px;overflow:hidden}'
    + '.upg-s button{display:block;width:100%;height:56px;border:0;background:none;font:400 19px -apple-system,system-ui,sans-serif;color:#007aff;border-top:.5px solid rgba(60,60,67,.3);cursor:pointer}'
    + '.upg-s .b button:first-child{border-top:0}.upg-s .cx button{font-weight:600}'
    + '.upg-c{position:fixed;inset:0;z-index:2147483550;background:#000;display:flex;flex-direction:column;color:#fff;font:15px -apple-system,system-ui,sans-serif}'
    + '.upg-c .top{display:flex;align-items:center;justify-content:space-between;padding:calc(env(safe-area-inset-top,0px) + 8px) 12px 8px}'
    + '.upg-c .top button,.upg-c .row button.tx{border:0;background:none;color:#fff;font:17px -apple-system,system-ui,sans-serif;padding:8px;cursor:pointer}'
    + '.upg-c .top b{font-weight:600;font-size:13px;letter-spacing:.06em;background:#ffcc00;color:#000;border-radius:5px;padding:2px 7px}'
    + '.upg-c .vw{flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}'
    + '.upg-c video,.upg-c img.pv{max-width:100%;max-height:100%;object-fit:contain}'
    + '.upg-c .msg{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;gap:14px;color:rgba(255,255,255,.85)}'
    + '.upg-c .msg button{border:0;border-radius:12px;background:#fff;color:#000;font:600 16px -apple-system,system-ui,sans-serif;padding:12px 18px;cursor:pointer}'
    + '.upg-c .row{display:flex;align-items:center;justify-content:space-between;padding:16px 22px calc(env(safe-area-inset-bottom,0px) + 22px);min-height:110px}'
    + '.upg-c .shut{width:74px;height:74px;border-radius:50%;border:4px solid #fff;background:transparent;padding:4px;cursor:pointer}'
    + '.upg-c .shut i{display:block;width:100%;height:100%;border-radius:50%;background:#fff;transition:transform .1s}.upg-c .shut:active i{transform:scale(.88)}'
    + '.upg-c .cnt{min-width:64px;text-align:center;font-weight:600}.upg-c .side{min-width:64px;text-align:center}'
    + '.upg-c .flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .25s}';
  function css() { if (document.getElementById('upgCss')) return; var s = document.createElement('style'); s.id = 'upgCss'; s.textContent = CSS; (document.head || document.documentElement).appendChild(s); }
  var tT = 0;
  function toast(m) {
    css(); var t = document.getElementById('upgT');
    if (!t) { t = document.createElement('div'); t.id = 'upgT'; t.className = 'upg-t'; document.body.appendChild(t); }
    t.textContent = m; requestAnimationFrame(function () { t.classList.add('in'); });
    clearTimeout(tT); tT = setTimeout(function () { t.classList.remove('in'); }, 3200);
  }
  function sheet(items) {
    css();
    var s = document.createElement('div'); s.className = 'upg-s';
    s.innerHTML = '<div class="g"><div class="b">' + items.map(function (x, i) { return '<button type="button" data-i="' + i + '">' + x.t + '</button>'; }).join('')
      + '</div><div class="b cx"><button type="button" data-i="-1">Cancel</button></div></div>';
    document.body.appendChild(s); requestAnimationFrame(function () { s.classList.add('in'); });
    var close = function () { s.classList.remove('in'); setTimeout(function () { s.remove(); }, 350); };
    s.addEventListener('click', function (e) {
      var b = e.target.closest('[data-i]');
      if (!b) { if (e.target === s) close(); return; }
      var i = +b.getAttribute('data-i'); close();
      if (i >= 0) items[i].f();                       // still inside the tap, so the file picker is allowed to open
    });
  }
  function who() {
    try { if (window.SARV_GATE && SARV_GATE.user) return SARV_GATE.user.name || SARV_GATE.user.user_name || ''; } catch (e) {}
    try { if (typeof sarvCurrentUser !== 'undefined' && sarvCurrentUser) return sarvCurrentUser.name || sarvCurrentUser.user_name || ''; } catch (e) {}
    return '';
  }
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  function stampOf(d) { return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()); }

  /* The LIVE camera: a photo taken here and now, never one from the gallery. Stamped at the bottom with
     LIVE PHOTO · name · date time, then given to the box as a normal JPEG file. */
  function openLive(el) {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) || typeof DataTransfer === 'undefined') {
      toast('The live camera is not possible here: the camera opens instead.');
      return openNative(el, el.__upCap || 'environment');
    }
    css();
    var multi = !!el.multiple, shots = [], stream = null, facing = el.__upCap === 'user' ? 'user' : 'environment';
    var c = document.createElement('div'); c.className = 'upg-c';
    c.innerHTML = '<div class="top"><button type="button" data-a="x">Cancel</button><b>LIVE PHOTO</b><button type="button" data-a="flip">Flip</button></div>'
      + '<div class="vw"><video playsinline muted autoplay></video><div class="flash"></div><div class="msg" hidden></div></div>'
      + '<div class="row"><span class="side"></span><button type="button" class="shut" data-a="shot" aria-label="Take photo"><i></i></button><span class="cnt"></span></div>';
    document.body.appendChild(c);
    var v = c.querySelector('video'), msg = c.querySelector('.msg'), row = c.querySelector('.row'), flash = c.querySelector('.flash');
    var stop = function () { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; };
    // No history entry of its own: pages such as bill-check close their own layers on popstate. The phone's Back
    // goes to the page, and the camera closes with it.
    var close = function () { stop(); c.remove(); window.removeEventListener('popstate', close); };
    window.addEventListener('popstate', close);
    var start = function () {
      stop(); msg.hidden = true;
      var lq = qualityOf(el);
      navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:facing }, width:{ ideal:lq >= 80 ? 3840 : 1920 }, height:{ ideal:lq >= 80 ? 2160 : 1080 } }, audio:false })
        .then(function (s) { stream = s; v.srcObject = s; v.play().catch(function () {}); })
        .catch(function (e) {
          msg.hidden = false;
          msg.innerHTML = '<div>' + (e && e.name === 'NotAllowedError' ? 'Camera permission is off. Allow the camera for this app in the phone settings, then try again.' : 'The camera could not start.') + '</div>'
            + '<button type="button" data-a="retry">Try again</button><button type="button" data-a="app">Open the camera app</button>';
        });
    };
    var paintRow = function () {
      row.querySelector('.cnt').innerHTML = multi && shots.length ? '<button type="button" class="tx" data-a="done" style="font-weight:600;color:#ffcc00">Done (' + shots.length + ')</button>' : '';
    };
    var shoot = function () {
      if (!v.videoWidth) return;
      var lq = qualityOf(el), maxSide = lq ? Math.max(1920, Math.round(4096 * lq / 100)) : 1920;
      var k = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight)), W = Math.round(v.videoWidth * k), H = Math.round(v.videoHeight * k);
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      var g = cv.getContext('2d'); g.drawImage(v, 0, 0, W, H);
      var fs = Math.max(14, Math.round(W / 42)), band = Math.round(fs * 2), line = 'LIVE PHOTO · ' + (who() || 'User') + ' · ' + stampOf(new Date());
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, H - band, W, band);
      g.fillStyle = '#fff'; g.font = '600 ' + fs + 'px -apple-system,system-ui,sans-serif'; g.textBaseline = 'middle'; g.fillText(line, Math.round(fs * .7), H - band / 2);
      flash.style.opacity = '.85'; setTimeout(function () { flash.style.opacity = '0'; }, 120);
      try { navigator.vibrate && navigator.vibrate(15); } catch (e) {}
      cv.toBlob(function (b) {
        if (!b) return toast('That photo could not be made. Try again.');
        var n = new Date(), name = 'live_' + n.getFullYear() + p2(n.getMonth() + 1) + p2(n.getDate()) + '_' + p2(n.getHours()) + p2(n.getMinutes()) + p2(n.getSeconds()) + (shots.length ? '_' + (shots.length + 1) : '') + '.jpg';
        var f = new File([b], name, { type:'image/jpeg', lastModified:n.getTime() });
        if (multi) { shots.push(f); paintRow(); return; }
        // one photo: show it, Retake or Use Photo (as the iPhone camera does)
        shots = [f]; stop();
        var url = URL.createObjectURL(b);
        c.querySelector('.vw').insertAdjacentHTML('beforeend', '<img class="pv" src="' + url + '" alt="" style="position:absolute">');
        v.style.visibility = 'hidden';
        row.innerHTML = '<button type="button" class="tx" data-a="retake">Retake</button><span></span><button type="button" class="tx" data-a="done" style="font-weight:600;color:#ffcc00">Use Photo</button>';
      }, 'image/jpeg', qualityOf(el) ? Math.min(1, 0.6 + 0.4 * qualityOf(el) / 100) : .86);
    };
    var deliver = function () {
      if (!shots.length) return close();
      try {
        var dt = new DataTransfer(); (multi ? shots : shots.slice(0, 1)).forEach(function (f) { dt.items.add(f); });
        el.files = dt.files;
        el.dispatchEvent(new Event('input', { bubbles:true }));
        el.dispatchEvent(new Event('change', { bubbles:true }));
      } catch (e) { toast('The photo could not be attached here.'); }
      close();
    };
    c.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return;
      var a = b.getAttribute('data-a');
      if (a === 'x') close();
      if (a === 'flip') { facing = facing === 'user' ? 'environment' : 'user'; start(); }
      if (a === 'shot') shoot();
      if (a === 'done') deliver();
      if (a === 'retry') start();
      if (a === 'app') { close(); openNative(el, el.__upCap || 'environment'); }
      if (a === 'retake') {
        shots = []; var pv = c.querySelector('img.pv'); if (pv) pv.remove(); v.style.visibility = '';
        row.innerHTML = '<span class="side"></span><button type="button" class="shut" data-a="shot" aria-label="Take photo"><i></i></button><span class="cnt"></span>';
        start();
      }
    });
    start();
  }

  /* ── PHOTO QUALITY: the page's own photo shrink, kept to the Admin's % (see 4. above) ── */
  var UPQ = null;   // {q, until, n}: a photo of a box with a % was just picked
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'INPUT' || el.type !== 'file' || !el.files || !el.files.length) return;
    var q = qualityOf(el);
    UPQ = q ? { q:q, until:Date.now() + 9000, n:el.files.length + 2 } : null;
  }, true);
  function upqOn() { return UPQ && Date.now() < UPQ.until && UPQ.n > 0; }
  try {
    var CP = CanvasRenderingContext2D.prototype, HP = HTMLCanvasElement.prototype;
    var nDraw = CP.drawImage, nDataUrl = HP.toDataURL, nToBlob = HP.toBlob;
    var nW = Object.getOwnPropertyDescriptor(HP, 'width'), nH = Object.getOwnPropertyDescriptor(HP, 'height');
    var isId = function (ctx) { try { var m = ctx.getTransform(); return m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0; } catch (e) { return false; } };
    // the canvas drawn bigger, the page's coordinates kept: width / height keep their page values (logical size)
    var upsize = function (ctx, src, sw, sh, dw, dh) {
      var cv = ctx.canvas; if (!cv || cv.__upq) return;
      var q = UPQ.q / 100, k = Math.min(sw * q / dw, sh * q / dh);
      var big = Math.max(dw, dh) * k; if (big > 4096) k = 4096 / Math.max(dw, dh);
      if (!(k > 1.02)) return;
      var W = Math.round(dw * k), H = Math.round(dh * k);
      // what the page already painted (a white fill under a PNG), and the drawing state, carried over
      var keep = document.createElement('canvas'); nW.set.call(keep, nW.get.call(cv)); nH.set.call(keep, nH.get.call(cv));
      keep.getContext('2d').drawImage(cv, 0, 0);
      var st = {}; ['fillStyle', 'strokeStyle', 'globalAlpha', 'font', 'lineWidth', 'textAlign', 'textBaseline', 'imageSmoothingEnabled', 'imageSmoothingQuality', 'globalCompositeOperation']
        .forEach(function (p) { try { st[p] = ctx[p]; } catch (e) {} });
      nW.set.call(cv, W); nH.set.call(cv, H);
      Object.keys(st).forEach(function (p) { try { ctx[p] = st[p]; } catch (e) {} });
      ctx.imageSmoothingEnabled = true; try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}
      ctx.setTransform(k, 0, 0, k, 0, 0);
      nDraw.call(ctx, keep, 0, 0, dw, dh);
      cv.__upq = { q:UPQ.q, w:dw, h:dh };
      Object.defineProperty(cv, 'width', { configurable:true, get:function () { return dw; }, set:function (v) { delete cv.width; delete cv.height; delete cv.__upq; nW.set.call(cv, v); } });
      Object.defineProperty(cv, 'height', { configurable:true, get:function () { return dh; }, set:function (v) { delete cv.width; delete cv.height; delete cv.__upq; nH.set.call(cv, v); } });
      UPQ.n--;
    };
    CP.drawImage = function (src) {
      try {
        if (upqOn() && src && (src instanceof HTMLImageElement || (window.ImageBitmap && src instanceof ImageBitmap) || src instanceof HTMLCanvasElement) && isId(this)) {
          var a = arguments, cv = this.canvas, sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height, dx, dy, dw, dh;
          if (a.length === 5) { dx = a[1]; dy = a[2]; dw = a[3]; dh = a[4]; }
          else if (a.length === 9) { sw = a[3]; sh = a[4]; dx = a[5]; dy = a[6]; dw = a[7]; dh = a[8]; }
          // only the page's "the whole photo onto the whole canvas" draw
          if (dw && dh && Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(dw - nW.get.call(cv)) <= 1 && Math.abs(dh - nH.get.call(cv)) <= 1 && sw > dw * 1.02) upsize(this, src, sw, sh, dw, dh);
        }
      } catch (e) {}
      return nDraw.apply(this, arguments);
    };
    var qOf = function (cv, type, given) {
      var q = cv.__upq ? cv.__upq.q : (upqOn() ? UPQ.q : 0);
      if (!q || !/^image\/(jpeg|webp)$/i.test(String(type || ''))) return given;
      return Math.max(typeof given === 'number' ? given : 0.92, Math.min(1, 0.6 + 0.4 * q / 100));
    };
    HP.toDataURL = function (type, quality) { return nDataUrl.call(this, type, qOf(this, type, quality)); };
    HP.toBlob = function (cb, type, quality) { return nToBlob.call(this, cb, type, qOf(this, type, quality)); };
  } catch (e) {}

  /* ── start ── */
  var obsT = 0;
  function boot() {
    scan();
    try {
      new MutationObserver(function (ms) {
        for (var i = 0; i < ms.length; i++) if (ms[i].addedNodes.length) { clearTimeout(obsT); obsT = setTimeout(scan, 250); return; }
      }).observe(document.documentElement, { childList:true, subtree:true });
    } catch (e) {}
    loadPolicy();
    setInterval(loadPolicy, 10 * 60000);
    window.addEventListener('focus', function () { setTimeout(register, 500); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  // For the Admin Panel: re-read the rules at once after a save
  window.SARV_UPLOAD = { reload:loadPolicy, keyOf:keyOf, policyOf:policyOf, qualityOf:qualityOf };
})();
