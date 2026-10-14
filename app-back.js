/* ════════════════════════════════════════════════════════════════════
   app-back.js — "← Apps" wapas jaane wala button
   ────────────────────────────────────────────────────────────────────
   Ek hi chhoti file, jo har app me ek `<script src>` line se jud jaati
   hai (ERP, Approvals, Complaint, Packing, Order Form). Isi liye button
   har app me EK JAISA dikhta hai aur uska behaviour ek hi jagah likha
   hai — paanch apps me paanch tarah ke back button nahi bante.

   Teen soorat me ye button JAAN-BOOJH KAR nahi dikhta:

     1. App kisi IFRAME ke andar khuli ho. Packing, Order Form, Lot Card
        aur Trims ERP ke andar iframe me khulte hain — wahan "wapas
        Apps par" ka matlab poora ERP hi iframe me khol dena hota, jo
        bilkul galat lagta. (window.top se farak pata chal jaata hai.)

     2. Single-login ka session na ho (`sarv_sso_token` nahi hai). Aisa
        banda launcher se nahi aaya — wo app ke apne login se andar hai.
        Use launcher par bhejna matlab ek aur login screen dikhana, jo
        usne maanga hi nahi.

     3. Khud launcher.html par. Wahan se wapas kahan jaana hai.

   Session baad me ban sakta hai (jaise mobile.html par naam + PIN se
   login karne par), isi liye button ek hi baar nahi dekhta — thodi der
   tak chup-chaap dobara check karta rehta hai, aur jab session mil
   jaata hai to aa jaata hai. Doosre tab me logout ho to `storage`
   event par hat bhi jaata hai.

   Style jaan-boojh kar gehra (dark) hai: baaki apps halke background
   wale hain, to ispar nazar turant pad jaati hai. z-index 900 rakha hai
   — yani modal / overlay (1000+) iske OOPAR aate hain, warna ye button
   popup ke saamne chipka dikhta.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SSO_KEY  = 'sarv_sso_token';
  var LAUNCHER = 'launcher.html';
  var EL_ID    = 'sarvAppBack';

  // Iframe ke andar — kuch nahi karna (upar wajah #1).
  try { if (window.self !== window.top) return; } catch (e) { return; }

  // Khud launcher par — kuch nahi karna (wajah #3).
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
    a.setAttribute('aria-label', 'Wapas apps ki list par jayein');
    a.title = 'Saare apps — wapas (login waisa hi rahega)';
    a.style.cssText = [
      'position:fixed',
      // Safe-area: iPhone / notch wale phone par home-bar ke neeche na chhupe.
      'bottom:calc(16px + env(safe-area-inset-bottom))',
      'right:calc(16px + env(safe-area-inset-right))',
      'z-index:900',
      'display:inline-flex',
      'align-items:center',
      'gap:7px',
      // 40px se kam nahi — ye ungli se dabaya jaata hai.
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
    // Keyboard se aane par bhi saaf dikhe.
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

    /* Session thodi der baad bhi ban sakta hai (mobile.html par naam +
       PIN se login). Isi liye kuch der tak dobara dekhte rehte hain, aur
       mil jaane par timer band — hamesha chalne wala timer rakhne ki
       koi wajah nahi. */
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      sync();
      if (document.getElementById(EL_ID) || tries > 60) clearInterval(t);
    }, 2000);

    // Doosre tab me logout hua to yahan se button hat jaana chahiye.
    window.addEventListener('storage', function (e) {
      if (!e || e.key === SSO_KEY || e.key === null) sync();
    });
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start);
  else
    start();

  // App chahe to khud bula sakti hai (jaise login ke turant baad).
  window.sarvAppBackSync = sync;
})();
