/* ════════════════════════════════════════════════════════════════════
   sso-preboot.js — app switch karte waqt login screen ki JHALAK rokna
   ────────────────────────────────────────────────────────────────────
   Samasya:
     Har app ka login overlay markup me SHURU SE dikhta hai, aur JS use
     tab chhupata hai jab server se session confirm ho jaata hai
     (`erp_app_session` / `sales_whoami`). Wo ek network call hai — yani
     launcher se app par jaate waqt login window ek-do second ke liye
     jhalak jaati thi, jabki banda pehle se logged-in hai.

   Ilaaj:
     Faisla NETWORK se pehle, localStorage se — aur wo SYNCHRONOUS hai.
     Ye file `<head>` me, bina defer, sabse pehle chalti hai: token
     maujood hai to `<html>` par ek class lag jaati hi hai aur usi waqt
     CSS inject ho jaati hai jo login overlay ko chhupa deti hai. Yani
     wo overlay ek frame ke liye bhi paint nahi hota.

     Saath hi ek saada spinner splash bhi lagti hai, taaki beech ke us
     waqt me adhoora app (khaali list, bina mount hui React screen)
     na dikhe. App taiyar hone par khud `sarvSsoPrebootDone()` bulati
     hai aur splash hat jaati hai.

   Do baatein jaan-boojh kar:

     * Token NA ho to ye file kuch nahi karti — ek bhi line nahi. Jo
       banda launcher se nahi aaya uska apna login screen bilkul pehle
       jaisa turant dikhta hai.

     * 9 second ka hard timeout hai. Agar kisi wajah se app
       `sarvSsoPrebootDone()` na bula paaye (net gir gaya, RPC atak
       gaya), to splash khud hat jaati hai aur app ka apna login screen
       aa jaata hai. Banda kabhi spinner par atka nahi rehta — "kuch
       nahi ho raha" se behtar hai login maang lena.

   Jodna: har app ke `<head>` me, baaki sab se PEHLE —
       <script src="sso-preboot.js"></script>
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var KEY = 'sarv_sso_token';
  var CLS = 'sarv-sso-pending';
  var STYLE_ID = 'sarvSsoPrebootCss';

  // Launcher par kuch nahi — wahan login screen dikhna hi chahiye.
  if (/(^|\/)launcher\.html$/i.test(location.pathname)) return;

  var tok = null;
  try { tok = localStorage.getItem(KEY); } catch (e) {}
  // Single login nahi hai — app ka apna login turant dikhe, bilkul pehle jaisa.
  if (!tok) return;

  var root = document.documentElement;
  root.className += (root.className ? ' ' : '') + CLS;

  /* Jin apps ke login overlay ko chhupana hai:
       #loginScreen  — mobile.html aur order-form.html
       #loginOverlay — packing.html
       #sarvLoginGate — index.html (ERP)
     complaint.html ka login React se banta hai aur wo pehle se hi khud
     ko rok leta hai (ssoWait), isi liye wahan sirf splash kaafi hai. */
  var css =
      'html.' + CLS + ' #loginScreen,'
    + 'html.' + CLS + ' #loginOverlay,'
    + 'html.' + CLS + ' #sarvLoginGate{display:none !important;}'
    // Splash — html ke pseudo-element se, taaki <body> ka intezaar na karna pade
    // (ye file head me chalti hai, wahan document.body abhi hota hi nahi).
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
    // classList purane browser par bhi chale, isi liye string se hataya.
    root.className = (' ' + root.className + ' ')
      .replace(' ' + CLS + ' ', ' ')
      .replace(/^\s+|\s+$/g, '');
    var el = document.getElementById(STYLE_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // App taiyar hone par ise bulati hai.
  window.sarvSsoPrebootDone = finish;

  /* Backstop — kabhi atke nahi. App ne na bulaya to 9 second me splash
     khud hat jaati hai aur uska apna login screen dikh jaata hai. */
  setTimeout(finish, 9000);
})();
