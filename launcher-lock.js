/* ════════════════════════════════════════════════════════════════════
   LAUNCHER: Lock screen + Screen Saver   (launcher.html, with launcher-lock.css)
   ────────────────────────────────────────────────────────────────────
   LOCK     Button under Logout, or Ctrl + Alt + L. Covers the launcher with an
            iOS style Lock screen; only the logged-in user's own PIN opens it.
            The PIN is CHECKED on the server (erp_lock_check, sql/LAUNCHER_LOCK_
            MIGRATION.sql; without it the check falls back to erp_app_login and
            the extra session is closed at once). The lock is kept in
            localStorage, so a reload does not open it; it disappears only when
            the PIN is right, or when the user logs out / the session is gone.
   SAVER    Button under Lock, or Ctrl + Shift + S. Two steps: after how many
            minutes of no activity, then which saver:
              1. Floating Sarv India logo with the real date and time
              2. My Pending Tasks, scrolling from the top to the bottom of the list
            The choice is kept per user (localStorage sarv_ss_v1:<user id>).
            Any key / click / touch / real mouse move wakes it. Optionally the
            Lock screen comes up with the saver.
            The task list is the Task Manager's own myPendingToday(): the
            launcher loads task_manager.html#pending-bridge in a hidden iframe
            that answers by postMessage, so the saver cannot disagree with the
            My Tasks page.
   Plain classic script; it only reads the launcher's own localStorage keys.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.self !== window.top) return;   // never inside the launcher's own hidden iframes

  var K_TOKEN = 'sarv_sso_token', K_USER = 'sarv_active_user', K_LOCK = 'sarv_launcher_locked', K_SS = 'sarv_ss_v1:';
  var RED_MOTION = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { }
    return null;
  }
  function me() { try { return JSON.parse(store(K_USER) || 'null') || {}; } catch (e) { return {}; } }
  function loggedIn() { var h = $('homeWrap'); return !!store(K_TOKEN) && !!h && h.style.display !== 'none'; }
  function sbc() { try { return SB; } catch (e) { return null; } }   // the launcher's supabase client (a top-level const of launcher.html)

  var IC = {
    lock: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/></svg>',
    lockBig: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/></svg>',
    saver: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="12.5" rx="2.5"/><path d="M9 20.5h6M12 17v3.5"/><path d="M15.5 8.5l-.5 1.5-1.5.5 1.5.5.5 1.5.5-1.5 1.5-.5-1.5-.5z" fill="currentColor" stroke="none"/></svg>',
    back: '<svg width="11" height="19" viewBox="0 0 11 19" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 1.5L2 9.5l7.5 8"/></svg>',
    tick: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>',
    del: '<svg width="28" height="22" viewBox="0 0 28 22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2h15a2 2 0 012 2v14a2 2 0 01-2 2H9L2 11z"/><path d="M14 7.5l7 7M21 7.5l-7 7"/></svg>',
    done: '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>'
  };

  /* ── small helpers ─────────────────────────────────────────────────── */
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  function clock(d) { var h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return { hm: h + ':' + pad2(d.getMinutes()), s: pad2(d.getSeconds()), ap: ap }; }
  function longDate(d) { try { return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return d.toDateString(); } }
  var toastT;
  function toast(msg) {
    var t = $('ls-toast');
    if (!t) { t = document.createElement('div'); t.id = 'ls-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('in'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('in'); }, 2800);
  }
  function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { } }

  /* ── sheets (the settings popups) ──────────────────────────────────── */
  var SHEET = null;
  function openSheet() {
    closeSheet(true);
    var scrim = document.createElement('div'); scrim.className = 'ls-scrim';
    var sh = document.createElement('div'); sh.className = 'ls-sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true');
    sh.innerHTML = '<div class="ls-grab"></div><div class="ls-body"></div>';
    document.body.appendChild(scrim); document.body.appendChild(sh);
    requestAnimationFrame(function () { requestAnimationFrame(function () { scrim.classList.add('in'); sh.classList.add('in'); }); });
    scrim.addEventListener('click', function () { closeSheet(); });
    // drag the grabber down to dismiss (phone)
    var g = sh.querySelector('.ls-grab'), y0 = null, dy = 0;
    g.addEventListener('pointerdown', function (e) { y0 = e.clientY; dy = 0; sh.style.transition = 'none'; try { g.setPointerCapture(e.pointerId); } catch (x) { } });
    g.addEventListener('pointermove', function (e) { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = 'translate(-50%,' + dy + 'px)'; });
    var end = function () { if (y0 == null) return; y0 = null; sh.style.transition = ''; sh.style.transform = ''; if (dy > 110) closeSheet(); };
    g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
    SHEET = { scrim: scrim, sh: sh, body: sh.querySelector('.ls-body') };
    return SHEET;
  }
  function closeSheet(now) {
    var s = SHEET; if (!s) return; SHEET = null;
    s.scrim.classList.remove('in'); s.sh.classList.remove('in');
    setTimeout(function () { s.scrim.remove(); s.sh.remove(); }, now ? 0 : 340);
  }

  /* ══ LOCK ══════════════════════════════════════════════════════════════ */
  var LOCKED = false, lockEl = null, pin = '', busy = false, waitUntil = 0, lockTick = null, autoT = null;
  /* Wrong PINs here add up with the login card's (same key as launcher-login.js): the n-th wrong try in a row = n minutes
     of waiting (at most 60), until a PIN is right. Kept per user on this device, so a reload does not clear it. */
  var K_FAIL = 'sarv_login_fail:', AUTO_MS = 600;
  function fget() { try { var x = JSON.parse(store(K_FAIL + (me().id || '')) || 'null'); return x && typeof x === 'object' ? x : { n: 0, until: 0 }; } catch (e) { return { n: 0, until: 0 }; } }
  function fset(x) { store(K_FAIL + (me().id || ''), x ? JSON.stringify(x) : null); }
  function fmtLeft(sec) { var m = Math.floor(sec / 60); return m + ':' + pad2(sec % 60); }

  function doLock() {
    if (!loggedIn() || LOCKED) return;
    closeSheet(true); stopSaver(true);
    store(K_LOCK, String(me().id || '1'));
    buildLock();
  }
  function buildLock() {
    if (lockEl) return;
    LOCKED = true; pin = ''; busy = false;
    var u = me(), nm = u.name || 'User';
    var el = document.createElement('div'); el.className = 'ls-lock'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Locked');
    var keys = '';
    var sub = ['', 'ABC', 'DEF', 'GHI', 'JKL', 'MNO', 'PQRS', 'TUV', 'WXYZ'];
    for (var i = 1; i <= 9; i++) keys += '<button class="ls-key" data-k="' + i + '" aria-label="' + i + '">' + i + '<small>' + sub[i - 1] + '</small></button>';
    keys += '<button class="ls-key txt" id="lsOut">Log out</button><button class="ls-key" data-k="0" aria-label="0">0<small></small></button><button class="ls-key txt" id="lsDel" aria-label="Delete" style="visibility:hidden">' + IC.del + '</button>';
    el.innerHTML = '<div class="ls-wall"><i></i><i></i><i></i></div><div class="ls-lw">'
      + '<div class="ls-lic">' + IC.lockBig + '</div><div class="ls-ltime" id="lsLTime"></div><div class="ls-ldate" id="lsLDate"></div>'
      + '<div class="ls-lwho"><div class="ls-lav">' + esc(nm.trim().charAt(0).toUpperCase() || '?') + '</div><div><b>' + esc(nm) + '</b><span>Locked · enter your PIN</span></div></div>'
      + '<div class="ls-dots" id="lsDots"></div><div class="ls-lerr" id="lsErr" aria-live="polite"></div>'
      + '<div class="ls-pad">' + keys + '</div></div>';
    document.body.appendChild(el); lockEl = el;
    var av = el.querySelector('.ls-lav'), mine = document.getElementById('avatar');
    if (mine && mine.querySelector('img')) av.innerHTML = '<img src="' + esc(mine.querySelector('img').src) + '" alt="" style="width:100%;height:100%;object-fit:cover">';
    el.addEventListener('click', function (e) {
      var k = e.target.closest('[data-k]'); if (k) return addDigit(k.getAttribute('data-k'));
      if (e.target.closest('#lsDel')) return delDigit();
      if (e.target.closest('#lsOut')) return logoutFromLock();
    });
    paintDots(); tickLock(); clearInterval(lockTick); lockTick = setInterval(function () { tickLock(); }, 1000);
    document.body.style.overflow = 'hidden';
  }
  function tickLock() {
    if (!lockEl) return;
    var d = new Date(), c = clock(d);
    $('lsLTime').textContent = c.hm; $('lsLDate').textContent = longDate(d);
    var until = fget().until || 0, left = Math.ceil((until - Date.now()) / 1000);
    if (left > 0) { waitUntil = until; setErr('Incorrect PIN. Try again in ' + fmtLeft(left)); setKeys(false); }
    else if (waitUntil) { waitUntil = 0; setErr(''); setKeys(true); pin = ''; paintDots(); }
    // the session ended behind the lock (logged out elsewhere, expired): nothing left to protect, let the login show
    if (!store(K_TOKEN)) removeLock(true);
  }
  function setKeys(on) { if (!lockEl) return; lockEl.querySelectorAll('.ls-key[data-k]').forEach(function (b) { b.disabled = !on; }); var g = $('lsGo'); if (g) g.disabled = !on; }
  function setErr(t) { var e = $('lsErr'); if (e) e.textContent = t || ''; }
  function paintDots(state) {
    var d = $('lsDots'); if (!d) return;
    var n = Math.max(4, pin.length), h = '';
    for (var i = 0; i < n; i++) h += '<i class="' + (i < pin.length ? 'f' : '') + '"></i>';
    d.innerHTML = h; d.className = 'ls-dots' + (state ? ' ' + state : '');
    var del = $('lsDel'); if (del) del.style.visibility = pin.length ? 'visible' : 'hidden';
    var go = $('lsGo'); if (go) go.classList.toggle('on', pin.length >= 4 && !busy);
  }
  // The PIN opens the lock by itself AUTO_MS after the last digit (4+ digits): a 4-digit PIN unlocks at once, a longer one is not
  // tried at 4 digits (that would count as a wrong try). Enter on a keyboard submits straight away.
  function armAuto() { clearTimeout(autoT); if (pin.length >= 4) autoT = setTimeout(trySubmit, AUTO_MS); }
  function addDigit(c) { if (busy || waitUntil > Date.now() || pin.length >= 8) return; pin += c; setErr(''); paintDots(); buzz(6); armAuto(); }
  function delDigit() { if (busy || !pin.length) return; pin = pin.slice(0, -1); paintDots(); buzz(4); armAuto(); }
  function trySubmit() { clearTimeout(autoT); if (!lockEl || busy || pin.length < 4 || waitUntil > Date.now()) return; submitPin(); }
  async function submitPin() {
    busy = true; var p = pin; paintDots('chk'); setErr('');
    var r = await checkPin(p);
    busy = false;
    if (r === 'ok') {
      fset(null); waitUntil = 0; pin = ''; paintDots();
      lockEl.classList.add('ok'); buzz(12);
      setTimeout(function () { removeLock(false); }, 520);
      return;
    }
    if (r === 'nosession') { toast('Your session has ended. Please log in again.'); removeLock(true); setTimeout(function () { location.reload(); }, 600); return; }
    pin = '';
    if (r === 'net') { paintDots(); setErr('No connection: the PIN could not be checked.'); return; }
    var n = (fget().n || 0) + 1, mins = Math.min(60, n);
    fset({ n: n, until: Date.now() + mins * 60000 }); waitUntil = Date.now() + mins * 60000;
    buzz([14, 50, 14]); paintDots('bad'); var d = $('lsDots'); if (d) { d.classList.add('shake'); }
    setKeys(false); tickLock();       // the timer starts: "Incorrect PIN. Try again in 1:00"
    setTimeout(function () { if (!busy && !pin.length) paintDots(); }, 650);
  }
  /* The PIN is only CHECKED, never used to log in again. */
  async function checkPin(p) {
    var tok = store(K_TOKEN), c = sbc(); if (!tok) return 'nosession'; if (!c) return 'net';
    try {
      var r = await c.rpc('erp_lock_check', { p_token: tok, p_pin: p });
      if (r.error) {
        var code = r.error.code || '', msg = String(r.error.message || '');
        if (code === 'PGRST202' || code === '42883' || /could not find the function|does not exist/i.test(msg)) return fallbackCheck(p);
        return 'net';
      }
      var d = r.data || {};
      if (d.success) return 'ok';
      return d.error === 'NO_SESSION' ? 'nosession' : 'wrong';
    } catch (e) { return 'net'; }
  }
  async function fallbackCheck(p) {   // migration not run yet: the login RPC is the PIN check; its extra session is closed at once
    var u = me(), c = sbc();
    try {
      var r = await c.rpc('erp_app_login', { p_user_id: String(u.id), p_pin: p, p_allowed_apps: Array.isArray(u.allowed_apps) ? u.allowed_apps : [] });
      if (r.error) return 'net';
      var d = r.data || {};
      if (d.success) { if (d.token) { try { await c.rpc('erp_app_logout', { p_token: d.token }); } catch (e) { } } return 'ok'; }
      if (d.error === 'PIN_INVALID') return 'wrong';
      if (d.error === 'USER_NOT_FOUND' || d.error === 'USER_INACTIVE') return 'nosession';
      return 'net';
    } catch (e) { return 'net'; }
  }
  function removeLock(noAnim) {
    store(K_LOCK, null); LOCKED = false; clearInterval(lockTick); lockTick = null; pin = ''; clearTimeout(autoT);
    var el = lockEl; lockEl = null; document.body.style.overflow = '';
    if (el) { if (noAnim) el.remove(); else { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 320); } }
    armIdle();
  }
  function logoutFromLock() {
    // The lock STAYS up: the launcher's own confirm decides. Cancelled = still locked; confirmed = the session is
    // removed and the reload shows the login (a lock flag without a session is dropped at boot).
    var b = $('outBtn'); if (b) b.click();
  }

  /* ══ SCREEN SAVER: settings ════════════════════════════════════════════ */
  var CFG = null, draft = { min: 5, style: 'logo', lock: false };
  function cfgLoad() { try { var c = JSON.parse(store(K_SS + (me().id || '')) || 'null'); return c && typeof c === 'object' ? c : null; } catch (e) { return null; } }
  function cfgSave(c) { store(K_SS + (me().id || ''), c ? JSON.stringify(c) : null); }
  function clampMin(v) { v = parseInt(v, 10); if (!isFinite(v)) v = 5; return Math.max(1, Math.min(120, v)); }

  function openSsSetup() {
    if (!loggedIn() || LOCKED) return;
    if (SHEET) { closeSheet(); return; }          // the shortcut opens and closes it
    if (SS) { wakeSaver(); return; }
    CFG = cfgLoad(); draft = { min: clampMin(CFG && CFG.min), style: (CFG && CFG.style) === 'tasks' ? 'tasks' : 'logo', lock: !!(CFG && CFG.lock) };
    openSheet(); stepMinutes();
  }
  function stepMinutes() {
    var b = SHEET.body, chips = [1, 2, 5, 10, 15, 30].map(function (m) { return '<button class="ls-chip" data-m="' + m + '">' + m + '</button>'; }).join('');
    b.innerHTML = '<div class="ls-title">Screen Saver</div><div class="ls-sub">Start the screen saver after this long without any activity.</div>'
      + '<div class="ls-stepper"><button class="ls-round" id="lsMinus" aria-label="Less">&minus;</button>'
      + '<label class="ls-num"><input id="lsMin" type="text" inputmode="numeric" maxlength="3" autocomplete="off" value="' + draft.min + '" aria-label="Minutes"><span>minutes</span></label>'
      + '<button class="ls-round" id="lsPlus" aria-label="More">+</button></div>'
      + '<div class="ls-chips">' + chips + '</div><div class="ls-hint">Shortcut: Ctrl + Shift + S</div>'
      + '<div class="ls-actions">' + (CFG && CFG.on ? '<button class="ls-btn red" id="lsOff">Turn Off</button>' : '<button class="ls-btn gray" id="lsCancel">Cancel</button>') + '<button class="ls-btn blue" id="lsSet">Set</button></div>';
    var inp = $('lsMin');
    var paint = function () { b.querySelectorAll('[data-m]').forEach(function (c) { c.classList.toggle('on', +c.getAttribute('data-m') === draft.min); }); };
    var put = function (v) { draft.min = clampMin(v); inp.value = draft.min; paint(); };
    paint();
    $('lsMinus').onclick = function () { put(draft.min - 1); buzz(4); };
    $('lsPlus').onclick = function () { put(draft.min + 1); buzz(4); };
    b.querySelectorAll('[data-m]').forEach(function (c) { c.onclick = function () { put(c.getAttribute('data-m')); buzz(4); }; });
    inp.oninput = function () { inp.value = inp.value.replace(/\D/g, '').slice(0, 3); var v = parseInt(inp.value, 10); if (v >= 1) { draft.min = Math.min(120, v); paint(); } };
    inp.onblur = function () { put(inp.value); };
    inp.onfocus = function () { try { inp.select(); } catch (e) { } };
    inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); put(inp.value); stepStyle(); } };
    var off = $('lsOff'), cn = $('lsCancel');
    if (off) off.onclick = function () { CFG.on = false; cfgSave(CFG); closeSheet(); setBtnState(); clearTimeout(idleT); idleT = null; toast('Screen saver is off'); };
    if (cn) cn.onclick = function () { closeSheet(); };
    $('lsSet').onclick = function () { put(inp.value); stepStyle(); };
  }
  function stepStyle() {
    var b = SHEET.body, logo = 'logo.png';
    b.innerHTML = '<div class="ls-nav"><button class="ls-back" id="lsBack">' + IC.back + '<span>Back</span></button></div>'
      + '<div class="ls-title">Choose Screen Saver</div><div class="ls-sub">Starts after ' + draft.min + ' minute' + (draft.min > 1 ? 's' : '') + ' of no activity.</div>'
      + '<div class="ls-cards">'
      + '<button class="ls-card" data-s="logo" role="radio"><span class="tick">' + IC.tick + '</span><div class="ls-thumb"><div class="lg"><img src="' + logo + '" alt=""></div><div class="dt">TUESDAY, 18 NOVEMBER</div><div class="tm">10:41</div></div><b>Floating Logo</b><small>The Sarv India logo drifts across the screen with today&rsquo;s date and the live time.</small></button>'
      + '<button class="ls-card" data-s="tasks" role="radio"><span class="tick">' + IC.tick + '</span><div class="ls-thumb tk"><i></i><i></i><i></i><i></i><i></i></div><b>My Pending Tasks</b><small>Your pending tasks scroll slowly from the top to the bottom of the list.</small></button></div>'
      + '<div class="ls-row"><div class="tx"><b>Lock when it starts</b><small>The PIN is asked to get back in.</small></div><button class="ls-sw" id="lsSw" role="switch" aria-label="Lock when it starts"></button></div>'
      + '<div class="ls-actions"><button class="ls-btn gray" id="lsPrev">Preview</button><button class="ls-btn blue" id="lsSave">Save</button></div>';
    var paint = function () {
      b.querySelectorAll('.ls-card').forEach(function (c) { var on = c.getAttribute('data-s') === draft.style; c.classList.toggle('on', on); c.setAttribute('aria-checked', on ? 'true' : 'false'); });
      var sw = $('lsSw'); sw.classList.toggle('on', draft.lock); sw.setAttribute('aria-checked', draft.lock ? 'true' : 'false');
    };
    paint();
    b.querySelectorAll('.ls-card').forEach(function (c) { c.onclick = function () { draft.style = c.getAttribute('data-s'); paint(); buzz(5); }; });
    $('lsSw').onclick = function () { draft.lock = !draft.lock; paint(); buzz(5); };
    $('lsBack').onclick = function () { stepMinutes(); };
    $('lsPrev').onclick = function () { closeSheet(); setTimeout(function () { startSaver(draft.style, true); }, 340); };
    $('lsSave').onclick = function () {
      CFG = { on: true, min: draft.min, style: draft.style, lock: draft.lock }; cfgSave(CFG); closeSheet(); setBtnState(); armIdle();
      toast('Screen saver starts after ' + draft.min + ' min of no activity');
    };
  }
  function setBtnState() {
    var b = $('ssBtn'); if (!b) return;
    var c = cfgLoad(), tag = b.querySelector('.ls-tag');
    if (c && c.on) { if (!tag) { tag = document.createElement('span'); tag.className = 'ls-tag'; b.appendChild(tag); } tag.textContent = clampMin(c.min) + 'm'; }
    else if (tag) tag.remove();
  }

  /* ══ SCREEN SAVER: idle timer + the saver itself ═══════════════════════ */
  var idleT = null, SS = null, lastPtr = { x: 0, y: 0 }, lastArm = 0;
  function armIdle() {
    clearTimeout(idleT); idleT = null;
    var c = cfgLoad(); CFG = c;
    if (!c || !c.on || SS || !loggedIn()) return;
    idleT = setTimeout(function () {
      idleT = null;
      if (!loggedIn() || SS) return;
      if (SHEET) { armIdle(); return; }             // a settings popup is open: the user is there
      startSaver(c.style, false);
      if (c.lock && !LOCKED) doLockQuiet();
    }, clampMin(c.min) * 60000);
  }
  function doLockQuiet() { if (!loggedIn() || LOCKED) return; store(K_LOCK, String(me().id || '1')); buildLock(); }
  function activity(e) {
    if (SS) {
      if (e.type === 'pointermove') { var dx = e.clientX - lastPtr.x, dy = e.clientY - lastPtr.y; if (dx * dx + dy * dy < 200) return; }   // a real move, not sensor jitter
      wakeSaver();
      if (e.type === 'keydown' || e.type === 'pointerdown') { e.stopPropagation(); if (e.cancelable) e.preventDefault(); }
      return;
    }
    if (e.type === 'pointermove') { lastPtr.x = e.clientX; lastPtr.y = e.clientY; }
    var now = Date.now(); if (now - lastArm < 800) return; lastArm = now; armIdle();
  }
  ['pointermove', 'pointerdown', 'keydown'].forEach(function (ev) { window.addEventListener(ev, activity, { capture: true }); });
  ['wheel', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, activity, { capture: true, passive: true }); });
  setInterval(function () { if (!idleT && !SS) armIdle(); }, 6000);   // picks up a fresh login / a changed setting

  var raf = 0, clockT = null, pendT = null, pendGen = 0;
  function startSaver(style, preview) {
    if (SS || !loggedIn() && !preview) return;
    closeSheet(true);
    var el = document.createElement('div'); el.className = 'ls-saver'; el.setAttribute('role', 'presentation');
    document.body.appendChild(el); SS = { el: el, style: style, base: { x: lastPtr.x, y: lastPtr.y } };
    document.body.style.overflow = 'hidden';
    if (style === 'tasks') buildTasks(el); else buildLogo(el);
  }
  function wakeSaver() { stopSaver(false); armIdle(); }
  function stopSaver(now) {
    if (!SS) return; var s = SS; SS = null;
    cancelAnimationFrame(raf); clearInterval(clockT); clearInterval(pendT); pendGen++;
    if (!LOCKED) document.body.style.overflow = '';
    if (now) s.el.remove(); else { s.el.classList.add('bye'); setTimeout(function () { s.el.remove(); }, 360); }
  }

  /* 1. Floating logo + date / time */
  function buildLogo(el) {
    el.innerHTML = '<div class="ls-orbs"><i></i><i></i><i></i></div>'
      + '<div class="ls-float" id="lsFloat"><div class="ls-lcard"><img src="logo.png" alt="Sarv India"></div><div class="ls-sdate" id="lsSDate"></div><div class="ls-stime" id="lsSTime"></div></div>'
      + '<div class="ls-hintw">Touch the screen or press any key to wake</div>';
    var f = $('lsFloat'), x = 0, y = 0, vx = 34, vy = 25, w = 0, h = 0, last = performance.now();
    var upd = function () {
      var d = new Date(), c = clock(d);
      $('lsSDate').textContent = longDate(d);
      $('lsSTime').innerHTML = c.hm + '<small>' + c.s + ' ' + c.ap + '</small>';
      var r = f.getBoundingClientRect(); w = r.width; h = r.height;
    };
    upd();
    clockT = setInterval(upd, 1000);
    x = Math.random() * Math.max(1, innerWidth - w); y = Math.random() * Math.max(1, innerHeight - h);
    if (Math.random() < .5) vx = -vx; if (Math.random() < .5) vy = -vy;
    if (RED_MOTION) { x = Math.max(0, (innerWidth - w) / 2); y = Math.max(0, (innerHeight - h) / 2); f.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)'; return; }
    var tick = function (t) {
      var dt = Math.min(.05, (t - last) / 1000); last = t;
      x += vx * dt; y += vy * dt;
      var mx = Math.max(0, innerWidth - w), my = Math.max(0, innerHeight - h);
      if (x < 0) { x = 0; vx = Math.abs(vx); } else if (x > mx) { x = mx; vx = -Math.abs(vx); }
      if (y < 0) { y = 0; vy = Math.abs(vy); } else if (y > my) { y = my; vy = -Math.abs(vy); }
      f.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  /* 2. My Pending Tasks, scrolling from the top of the list to the bottom */
  function buildTasks(el) {
    el.innerHTML = '<div class="ls-orbs"><i></i><i></i><i></i></div>'
      + '<div class="ls-thead"><div><h2>My Pending Tasks</h2><p id="lsTSub">Loading your tasks&hellip;</p></div><div class="ls-tclock"><b id="lsTTime"></b><span id="lsTDate"></span></div></div>'
      + '<div class="ls-twrap static" id="lsTWrap"><div class="ls-tmsg"><div class="ls-spin"></div><span>Loading your tasks&hellip;</span></div></div>'
      + '<div class="ls-hintw">Touch the screen or press any key to wake</div>';
    var upd = function () { var d = new Date(), c = clock(d); $('lsTTime').textContent = c.hm + ' ' + c.ap; $('lsTDate').textContent = longDate(d); };
    upd(); clockT = setInterval(upd, 1000);
    var gen = ++pendGen;
    var load = function () {
      loadPending().then(function (r) { if (!SS || gen !== pendGen) return; renderTasks(r); });
    };
    load();
    pendT = setInterval(load, 5 * 60000);   // fresh list every 5 minutes while the saver runs
  }
  function msg(wrap, big, title, text) {
    wrap.className = 'ls-twrap static';
    wrap.innerHTML = '<div class="ls-tmsg">' + (big ? '<div class="big">' + big + '</div>' : '') + '<b>' + esc(title) + '</b><span>' + esc(text) + '</span></div>';
  }
  function renderTasks(r) {
    var wrap = $('lsTWrap'), sub = $('lsTSub'); if (!wrap) return;
    if (!r.ok) { sub.textContent = 'Could not load'; msg(wrap, '', 'Tasks could not be loaded', 'Check the internet connection, and that My Tasks is switched on for your login. It is tried again every few minutes.'); return; }
    var items = r.items || [];
    if (!items.length) { sub.textContent = 'Nothing pending'; msg(wrap, IC.done, 'All caught up', 'You have no pending task right now.'); return; }
    var late = items.filter(function (i) { return i.state === 'overdue' || i.state === 'missed'; }).length;
    sub.textContent = items.length + ' pending' + (late ? ' · ' + late + ' delayed' : '');
    var rows = items.map(function (i) {
      var past = i.state === 'missed' || (i.ds && r.today && i.ds < r.today), over = i.state === 'overdue';
      var due = i.due ? new Date(i.due).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
      var meta = [i.kind, past && i.ds ? 'Planned ' + fmtDs(i.ds) : (due ? 'Due ' + due : '')].filter(Boolean).join(' · ');
      var cls = past ? 'old' : over ? 'late' : '';
      return '<div class="ls-trow"><span class="ls-tdot ' + cls + '"></span><div class="ls-tmain"><b>' + esc(i.d) + '</b>' + (meta ? '<span>' + esc(meta) + '</span>' : '') + '</div><span class="ls-tchip ' + cls + '">' + (past ? 'Delayed' : over ? 'Overdue' : 'Pending') + '</span></div>';
    }).join('');
    wrap.className = 'ls-twrap static';
    wrap.innerHTML = '<div class="ls-tlist" id="lsTList">' + rows + '</div>';
    var list = $('lsTList');
    // does it fit on the screen? then it just stays; if not, it scrolls from the top to the bottom, again and again
    if (RED_MOTION || list.scrollHeight + 190 <= wrap.clientHeight) return;
    wrap.classList.remove('static');
    list.insertAdjacentHTML('beforeend', rows);     // second copy: the loop has no gap
    list.style.animationDuration = Math.max(24, items.length * 5) + 's';
    list.classList.add('run');
  }
  function fmtDs(ds) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ds || ''); if (!m) return ds || ''; try { return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); } catch (e) { return ds; } }

  /* Asks the Task Manager (hidden iframe, task_manager.html#pending-bridge) for the user's pending list */
  function loadPending() {
    return new Promise(function (resolve) {
      // no pre-check of the user's app list: a session older than the My Tasks tile does not list it, yet the Task Manager's own gate lets the user in
      var f = document.createElement('iframe'), done = false, to;
      f.src = 'task_manager.html#pending-bridge'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
      f.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
      var fin = function (v) { if (done) return; done = true; clearTimeout(to); window.removeEventListener('message', on); setTimeout(function () { f.remove(); }, 60); resolve(v); };
      var on = function (e) { var d = e.data; if (e.source === f.contentWindow && d && d.sarvPending) fin({ ok: !!d.ok, error: d.error || '', items: d.items || [], today: d.today || '' }); };
      to = setTimeout(function () { fin({ ok: false, error: 'TIMEOUT', items: [] }); }, 40000);
      window.addEventListener('message', on); document.body.appendChild(f);
    });
  }

  /* ══ Wiring ════════════════════════════════════════════════════════════ */
  document.addEventListener('keydown', function (e) {
    if (SS) return;                       // any key only wakes the saver (see activity())
    var k = String(e.key || '').toLowerCase();
    if (LOCKED) {                         // physical keyboard on the Lock screen
      if (/^[0-9]$/.test(k)) { e.preventDefault(); addDigit(k); }
      else if (k === 'backspace') { e.preventDefault(); delDigit(); }
      else if (k === 'enter') { e.preventDefault(); trySubmit(); }
      else if (e.ctrlKey || e.altKey || e.metaKey) { /* browser shortcuts stay */ }
      return;
    }
    if (e.key === 'Escape' && SHEET) { closeSheet(); return; }
    if (e.ctrlKey && e.altKey && !e.shiftKey && (k === 'l' || e.code === 'KeyL')) { if (loggedIn()) { e.preventDefault(); doLock(); } return; }
    if (e.ctrlKey && e.shiftKey && !e.altKey && (k === 's' || e.code === 'KeyS')) { if (loggedIn()) { e.preventDefault(); openSsSetup(); } return; }
  }, true);

  function boot() {
    var lb = $('lockBtn'), sb = $('ssBtn');
    if (lb) lb.addEventListener('click', doLock);
    if (sb) sb.addEventListener('click', openSsSetup);
    setBtnState(); armIdle();
    // a lock set before a reload / restart stays on until the PIN is entered (only while a session exists)
    if (store(K_LOCK) && store(K_TOKEN)) buildLock();
    else if (store(K_LOCK)) store(K_LOCK, null);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  // the launcher logs a user out / in without a reload in places: refresh the small "5m" tag and the timer
  window.addEventListener('storage', function (e) { if (e.key === K_TOKEN && !e.newValue && LOCKED) removeLock(true); });
})();
