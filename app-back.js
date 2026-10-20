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
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SSO_KEY  = 'sarv_sso_token';
  var LAUNCHER = 'launcher.html';
  var EL_ID    = 'sarvAppBack';

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
      'opacity:.80',
      'transition:opacity .16s, transform .12s, box-shadow .16s'
    ].join(';');

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
