/* ════════════════════════════════════════════════════════════════════
   app-back.js: the floating "← Apps" button
   ────────────────────────────────────────────────────────────────────
   One small file, added to every app with a single `<script src>` line
   (ERP, Approvals, Complaint, Packing, Order Form). That way the button
   looks the same everywhere and its behaviour lives in one place, instead
   of five apps each growing their own back button.

   The button is deliberately hidden in three cases:

     1. The app is running inside an IFRAME. Packing, Order Form, Lot Card
        and Trims open inside the ERP in an iframe. "Back to Apps" there
        would load the whole launcher inside that frame, which is clearly
        wrong. (Comparing against window.top tells us.)

     2. There is no single-login session (`sarv_sso_token` is missing).
        That user did not come from the launcher, so sending them there
        would only show a login screen they never asked for.

     3. We are on launcher.html itself. There is nowhere to go back to.

   A session can appear later (for example after a name + PIN login on
   mobile.html), so the button does not check just once. It keeps checking
   quietly for a short while and shows up as soon as a session exists. A
   logout in another tab removes it again through the `storage` event.

   The style is intentionally dark: the other apps use light backgrounds,
   so it is easy to spot. z-index is 900, which keeps modals and overlays
   (1000+) above it; otherwise the button would sit on top of popups.

   DRAG TO MOVE. A fixed corner is bound to cover some app's own button
   on some screen size (a Save button, a FAB, a bottom nav), so the user
   can drag it out of the way with a finger or the mouse. On release it
   snaps to the nearer side edge, left or right, at the height where it
   was dropped, and stays inside the screen. The spot is remembered in
   this browser (one key for all apps, same origin), so it does not have
   to be moved again on every page. A press that moves less than a few
   pixels is still a plain tap and opens the launcher; a real drag never
   does. Until it is first moved it sits where it always did,
   bottom-right.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SSO_KEY  = 'sarv_sso_token';
  var LAUNCHER = 'launcher.html';
  var EL_ID    = 'sarvAppBack';
  var POS_KEY  = 'sarv_app_back_pos';   // {side:'left'|'right', top:0..1 of the screen height}
  var EDGE     = 16;                    // gap from the screen edge, px
  var DRAG_MIN = 6;                     // movement below this is a tap, not a drag

  // Inside an iframe: nothing to do (reason 1 above).
  try { if (window.self !== window.top) return; } catch (e) { return; }

  // On the launcher itself: nothing to do (reason 3).
  if (/(^|\/)launcher\.html$/i.test(location.pathname)) return;

  function hasSession() {
    try { return !!localStorage.getItem(SSO_KEY); } catch (e) { return false; }
  }

  function build() {
    if (document.getElementById(EL_ID)) return;
    if (!document.body) return;

    var a = document.createElement('a');
    a.id = EL_ID;
    a.href = LAUNCHER;
    a.setAttribute('aria-label', 'Back to the list of apps');
    a.title = 'All apps (you stay logged in)';
    a.style.cssText = [
      'position:fixed',
      // Safe area: keeps it clear of the home bar on notched phones.
      'bottom:calc(16px + env(safe-area-inset-bottom))',
      'right:calc(16px + env(safe-area-inset-right))',
      'z-index:900',
      'display:inline-flex',
      'align-items:center',
      'gap:7px',
      // Never below 40px; this is tapped with a finger.
      'min-height:40px',
      'padding:9px 15px 9px 13px',
      'border-radius:999px',
      'background:rgba(15,23,42,.90)',
      'color:#f1f5f9',
      'border:1px solid rgba(255,255,255,.16)',
      'box-shadow:0 8px 24px -6px rgba(0,0,0,.55)',
      'font:650 12.5px/1 "Segoe UI",system-ui,-apple-system,sans-serif',
      'letter-spacing:.02em',
      'text-decoration:none',
      '-webkit-backdrop-filter:blur(8px)',
      'backdrop-filter:blur(8px)',
      'cursor:pointer',
      // The page must not scroll under a finger that is dragging the button.
      'touch-action:none',
      '-webkit-user-select:none',
      'user-select:none',
      '-webkit-touch-callout:none',
      'opacity:.80',
      'transition:opacity .16s, transform .12s, box-shadow .16s'
    ].join(';');
    a.draggable = false;   // no native link drag-and-drop ghost on desktop

    a.innerHTML =
      '<span style="font-size:14px;line-height:1;">&#8592;</span>' +
      '<span>Apps</span>';

    a.addEventListener('mouseenter', function () {
      a.style.opacity = '1';
      a.style.transform = 'translateY(-2px)';
      a.style.boxShadow = '0 12px 28px -6px rgba(0,0,0,.65)';
    });
    a.addEventListener('mouseleave', function () {
      a.style.opacity = '.80';
      a.style.transform = 'none';
      a.style.boxShadow = '0 8px 24px -6px rgba(0,0,0,.55)';
    });
    // Keep the focus ring visible for keyboard users.
    a.addEventListener('focus', function () {
      a.style.opacity = '1';
      a.style.outline = '2.5px solid #38bdf8';
      a.style.outlineOffset = '3px';
    });
    a.addEventListener('blur', function () {
      a.style.opacity = '.80';
      a.style.outline = 'none';
    });

    document.body.appendChild(a);
    applyPos(a, loadPos());
    enableDrag(a);
  }

  /* ── Position: remembered side + height ─────────────────────────── */
  function loadPos() {
    try {
      var p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (p && (p.side === 'left' || p.side === 'right') && typeof p.top === 'number') return p;
    } catch (e) {}
    return null;
  }
  function savePos(p) {
    try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch (e) {}
  }
  // Keeps the button fully on screen, clear of the safe-area edges.
  function clampTop(px, h) {
    var max = window.innerHeight - h - EDGE;
    return Math.max(EDGE, Math.min(max, px));
  }
  function applyPos(a, p) {
    if (!p) return;   // never moved: stays on the default bottom-right
    var top = clampTop(p.top * window.innerHeight, a.offsetHeight || 40);
    a.style.bottom = 'auto';
    a.style.top = top + 'px';
    if (p.side === 'left') {
      a.style.right = 'auto';
      a.style.left = 'calc(' + EDGE + 'px + env(safe-area-inset-left))';
    } else {
      a.style.left = 'auto';
      a.style.right = 'calc(' + EDGE + 'px + env(safe-area-inset-right))';
    }
  }

  /* ── Drag: pointer events cover mouse, touch and pen alike ──────── */
  function enableDrag(a) {
    var drag = null;          // {id, dx, dy, x0, y0, moved}
    var swallowClick = false; // the click that ends a real drag must not navigate

    a.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      var r = a.getBoundingClientRect();
      drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top,
               x0: e.clientX, y0: e.clientY, moved: false };
    });

    a.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.abs(e.clientX - drag.x0) < DRAG_MIN && Math.abs(e.clientY - drag.y0) < DRAG_MIN) return;
        drag.moved = true;
        try { a.setPointerCapture(e.pointerId); } catch (err) {}
        a.style.transition = 'opacity .16s, box-shadow .16s';
        a.style.transform = 'none';
        a.style.opacity = '1';
      }
      e.preventDefault();
      var w = a.offsetWidth, h = a.offsetHeight;
      var x = Math.max(0, Math.min(window.innerWidth - w, e.clientX - drag.dx));
      var y = clampTop(e.clientY - drag.dy, h);
      a.style.right = 'auto'; a.style.bottom = 'auto';
      a.style.left = x + 'px'; a.style.top = y + 'px';
    });

    function end(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var d = drag; drag = null;
      if (!d.moved) return;   // a tap: let the click open the launcher
      swallowClick = true;
      setTimeout(function () { swallowClick = false; }, 400);
      var r = a.getBoundingClientRect();
      // Snap to whichever side edge the button's centre is nearer.
      var p = { side: (r.left + r.width / 2) < window.innerWidth / 2 ? 'left' : 'right',
                top: r.top / window.innerHeight };
      a.style.transition = 'opacity .16s, transform .12s, box-shadow .16s, left .18s, right .18s, top .18s';
      applyPos(a, p);
      savePos(p);
      a.style.opacity = '.80';
    }
    a.addEventListener('pointerup', end);
    a.addEventListener('pointercancel', end);

    a.addEventListener('click', function (e) {
      if (swallowClick) { e.preventDefault(); e.stopPropagation(); swallowClick = false; }
    }, true);
    // A finger held still to start a drag would otherwise open the browser's
    // "open link / copy link" menu on Android.
    a.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // Rotating a phone or resizing the window must not leave it off screen.
    window.addEventListener('resize', function () { applyPos(a, loadPos()); });
  }

  function remove() {
    var el = document.getElementById(EL_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function sync() {
    if (hasSession()) build();
    else remove();
  }

  function start() {
    sync();

    /* The session can appear a little later (name + PIN login on
       mobile.html), so we keep looking for a while and stop the timer once
       it is found. There is no reason to keep a timer running forever. */
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      sync();
      if (document.getElementById(EL_ID) || tries > 60) clearInterval(t);
    }, 2000);

    // Logged out in another tab: remove the button here as well.
    window.addEventListener('storage', function (e) {
      if (!e || e.key === SSO_KEY || e.key === null) sync();
    });
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start);
  else
    start();

  // An app can also call this itself (for example right after login).
  window.sarvAppBackSync = sync;
})();
