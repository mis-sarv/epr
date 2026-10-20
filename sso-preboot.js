/* ════════════════════════════════════════════════════════════════════
   sso-preboot.js: stops the login screen from FLASHING when switching apps
   ────────────────────────────────────────────────────────────────────
   Problem:
     Every app's login overlay is visible in the markup FROM THE START, and
     JS hides it only once the server confirms the session
     (`erp_app_session` / `sales_whoami`). That is a network call, so when
     moving from the launcher to an app the login window flashed for a
     second or two even though the user was already logged in.

   Fix:
     Decide BEFORE the network, from localStorage, which is SYNCHRONOUS.
     This file runs first in `<head>`, without defer. If a token exists it
     adds a class to `<html>` and injects CSS that hides the login overlay
     right away, so the overlay is never painted, not even for one frame.

     It also shows a plain spinner splash so the half-built app (empty
     list, React screen not mounted yet) is not visible in between. When
     the app is ready it calls `sarvSsoPrebootDone()` and the splash goes.

   Two deliberate choices:

     * With NO token this file does nothing at all. A user who did not
       come from the launcher sees their own login screen immediately,
       exactly as before.

     * There is a hard 9 second timeout. If the app never manages to call
       `sarvSsoPrebootDone()` (network dropped, RPC stuck), the splash
       removes itself and the app's own login screen appears. Nobody is
       left staring at a spinner; asking for a login is better than a
       screen where nothing happens.

   Usage: in every app's `<head>`, BEFORE everything else:
       <script src="sso-preboot.js"></script>
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var KEY = 'sarv_sso_token';
  var CLS = 'sarv-sso-pending';
  var STYLE_ID = 'sarvSsoPrebootCss';

  // Nothing on the launcher: the login screen must show there.
  if (/(^|\/)launcher\.html$/i.test(location.pathname)) return;

  var tok = null;
  try { tok = localStorage.getItem(KEY); } catch (e) {}
  // No single login: show the app's own login immediately, as before.
  if (!tok) return;

  var root = document.documentElement;
  root.className += (root.className ? ' ' : '') + CLS;

  /* Login overlays to hide:
       #loginScreen  - mobile.html and order-form.html
       #loginOverlay - packing.html
       #sarvLoginGate - index.html (ERP)
     complaint.html builds its login in React and already holds itself
     back (ssoWait), so the splash alone is enough there. */
  var css =
      'html.' + CLS + ' #loginScreen,'
    + 'html.' + CLS + ' #loginOverlay,'
    + 'html.' + CLS + ' #sarvLoginGate{display:none !important;}'
    // Splash drawn with a pseudo-element on html, so we don't have to wait
    // for <body> (this file runs in head, where document.body doesn't exist yet).
    + 'html.' + CLS + '::before{content:"";position:fixed;inset:0;z-index:2147482000;'
    + 'background:#0b1220;}'
    + 'html.' + CLS + '::after{content:"";position:fixed;z-index:2147482001;'
    + 'left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;'
    + 'border-radius:50%;border:3px solid rgba(255,255,255,.16);border-top-color:#38bdf8;'
    + 'animation:sarvPrebootSpin .7s linear infinite;}'
    + '@keyframes sarvPrebootSpin{to{transform:rotate(360deg);}}'
    + '@media (prefers-reduced-motion:reduce){html.' + CLS + '::after{animation:none;}}';

  var st = document.createElement('style');
  st.id = STYLE_ID;
  st.appendChild(document.createTextNode(css));
  (document.head || root).appendChild(st);

  var done = false;
  function finish() {
    if (done) return;
    done = true;
    // Removed via the string so it also works on old browsers without classList.
    root.className = (' ' + root.className + ' ')
      .replace(' ' + CLS + ' ', ' ')
      .replace(/^\s+|\s+$/g, '');
    var el = document.getElementById(STYLE_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // The app calls this once it is ready.
  window.sarvSsoPrebootDone = finish;

  /* Backstop so it can never get stuck. If the app never calls this, the
     splash removes itself after 9 seconds and the app's own login shows. */
  setTimeout(finish, 9000);
})();
