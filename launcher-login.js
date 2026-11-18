/* ════════════════════════════════════════════════════════════════════
   LAUNCHER LOGIN helpers   (launcher.html, with launcher-login.css)
   ────────────────────────────────────────────────────────────────────
   1. The cursor is in the Employee Code box whenever the login card shows.
   2. A complete Employee Code (typed, or chosen from the dropdown) moves the
      cursor to the PIN box. Typed codes wait while a LONGER code / name could
      still be typed (1386 vs 13860); a dropdown choice or Tab / blur does not.
   3. PIN of 4+ digits: Login runs by itself 0.6 s after the LAST key, so a
      4-digit PIN logs in at once and a 6-digit one is not tried at 4 digits
      (that would count as a wrong try).
   4. Wrong PIN: an alert popup; OK clears the PIN and puts the cursor back in
      it. Waiting time per account, on this device: 1st wrong try 1 minute,
      2nd 2 minutes, 3rd 3 minutes ... (n minutes, at most 60), until a login
      succeeds. Kept in localStorage sarv_login_fail:<user id>. It is a
      deterrent on this browser only: the PIN itself is checked on the server.
   5. A Help button (top right of the login card): "Contact to Mr. Manjeet -
      7496968446 ..." with a green Call button (tel: link: the dialer opens
      with the number typed in).
   launcher.html's doLogin calls LoginGuard.blocked / wrong / ok; nothing else
   of the login code is changed. Plain classic script; does nothing in an iframe.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.self !== window.top) return;

  var HELP_NAME = 'Mr. Manjeet', HELP_NO = '7496968446', HELP_TEL = 'tel:+91' + HELP_NO, HELP_FROM = 9, HELP_TO = 19;   // 9:00 am to 7:00 pm
  var MAX_MIN = 60, AUTO_MS = 600, K_FAIL = 'sarv_login_fail:';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } return null; }
  var users = function () { try { return USERS || []; } catch (e) { return []; } };           // the launcher's own lists (top-level let / const)
  var find = function (v) { try { return findUsers(v); } catch (e) { return []; } };

  var IC = {
    help: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.2"/><path d="M9.4 9.3a2.7 2.7 0 015.2.9c0 1.8-2.6 2.3-2.6 3.9M12 17.4v.2"/></svg>',
    bang: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 6v7.5M12 18v.4"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/></svg>'
  };

  /* ── iOS style alert ───────────────────────────────────────────────── */
  var ALERT = null;
  function alertBox(o) {            // {icon:'err'|'help', title, html, extra(html), ok, onOk}
    closeAlert(true);
    var sc = document.createElement('div'); sc.className = 'lg-scrim';
    sc.innerHTML = '<div class="lg-alert" role="alertdialog" aria-modal="true" aria-label="' + esc(o.title) + '"><div class="tx"><div class="ic ' + (o.icon || 'err') + '">' + (o.icon === 'help' ? IC.help : IC.bang) + '</div>'
      + '<b>' + esc(o.title) + '</b><p>' + o.html + '</p>' + (o.extra || '') + '</div><div class="bt"><button type="button" data-ok="1">' + esc(o.ok || 'OK') + '</button></div></div>';
    document.body.appendChild(sc);
    requestAnimationFrame(function () { requestAnimationFrame(function () { sc.classList.add('in'); }); });
    var done = false;
    var close = function () {
      if (done) return; done = true; ALERT = null; sc.classList.remove('in');
      document.removeEventListener('keydown', key, true);
      setTimeout(function () { sc.remove(); if (o.onOk) o.onOk(); }, 240);
    };
    var key = function (e) { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(); } };
    sc.addEventListener('click', function (e) { if (e.target.closest('[data-ok]') || e.target === sc) close(); });
    document.addEventListener('keydown', key, true);
    ALERT = { close: close, el: sc };
    var b = sc.querySelector('[data-ok]'); if (b) setTimeout(function () { try { b.focus(); } catch (e) { } }, 60);
  }
  function closeAlert(silent) { if (ALERT) { var a = ALERT; ALERT = null; if (silent) { a.el.remove(); } else a.close(); } }

  /* ── Help ──────────────────────────────────────────────────────────── */
  function supportOpen() { var h = new Date().getHours(); return h >= HELP_FROM && h < HELP_TO; }
  function openHelp() {
    var open = supportOpen();
    alertBox({
      icon: 'help', title: 'Need help?',
      html: 'Contact to <strong>' + esc(HELP_NAME) + ' - ' + esc(HELP_NO) + '</strong> if any issue or problem only between <strong>9:00 am to 7:00 pm</strong>',
      extra: '<a class="lg-call" href="' + HELP_TEL + '" aria-label="Call ' + esc(HELP_NAME) + ' on ' + esc(HELP_NO) + '">' + IC.phone + '<span>Call ' + HELP_NO.slice(0, 5) + ' ' + HELP_NO.slice(5) + '</span></a>'
        + '<div class="lg-open ' + (open ? 'on' : 'off') + '">' + (open ? 'Support is available now' : 'Outside support hours now (9:00 am to 7:00 pm)') + '</div>',
      ok: 'Close'
    });
  }

  /* ── Wrong-PIN wait (per account, this device) ─────────────────────── */
  function fkey(u) { return K_FAIL + String(u && u.id != null ? u.id : ''); }
  function fget(u) { try { var x = JSON.parse(store(fkey(u)) || 'null'); return x && typeof x === 'object' ? x : { n: 0, until: 0 }; } catch (e) { return { n: 0, until: 0 }; } }
  function fset(u, x) { store(fkey(u), x ? JSON.stringify(x) : null); }
  function leftMs(u) { return Math.max(0, (fget(u).until || 0) - Date.now()); }
  function fmtLeft(ms) { var s = Math.ceil(ms / 1000), m = Math.floor(s / 60); return m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function curUser() { var l = find(($('nameBox') || {}).value); if (l.length === 1) return l[0]; if (l.length > 1) { try { return l.find(function (x) { return String(x.id) === pickedId; }) || null; } catch (e) { return null; } } return null; }

  var tick = null;
  function paintWait() {
    var w = $('lgWait'), pin = $('pinBox'), go = $('goBtn'); if (!w || !pin) return;
    var u = curUser(), ms = u ? leftMs(u) : 0;
    if (ms > 0) {
      w.textContent = 'Too many wrong PIN tries. You can try again in ' + fmtLeft(ms) + '.'; w.classList.add('on');
      pin.readOnly = true; pin.classList.add('lg-locked'); if (go) go.disabled = true;
      if (!tick) tick = setInterval(paintWait, 1000);
    } else {
      var was = pin.readOnly;
      w.classList.remove('on'); pin.readOnly = false; pin.classList.remove('lg-locked'); if (go && go.textContent === 'Login') go.disabled = false;
      if (tick) { clearInterval(tick); tick = null; }
      if (was && u && !ALERT) { try { pin.focus(); } catch (e) { } }   // the wait is over: back to the PIN box
    }
  }

  window.LoginGuard = {
    // doLogin asks first: a locked account is not tried at all
    blocked: function (u) { var ms = leftMs(u); if (ms > 0) { paintWait(); alertBox({ icon: 'err', title: 'Please wait', html: 'Too many wrong PIN tries. Try again in <strong>' + fmtLeft(ms) + '</strong> minutes.', onOk: function () { paintWait(); } }); return true; } return false; },
    // a wrong PIN: n-th wrong try in a row = n minutes
    wrong: function (u) {
      var x = fget(u), n = (x.n || 0) + 1, mins = Math.min(MAX_MIN, n);
      fset(u, { n: n, until: Date.now() + mins * 60000 });
      alertBox({
        icon: 'err', title: 'Incorrect PIN',
        html: 'The PIN you entered is wrong. You can try again after <strong>' + mins + ' minute' + (mins > 1 ? 's' : '') + '</strong>.' + (n > 1 ? '<br>Wrong tries in a row: ' + n : '') + '<br>Forgotten it? Use <strong>Forgot PIN?</strong>',
        onOk: function () { var p = $('pinBox'); if (p) { p.value = ''; } paintWait(); if (p && !p.readOnly) { try { p.focus(); } catch (e) { } } else if (p) { try { p.focus(); } catch (e) { } } }
      });
    },
    ok: function (u) { fset(u, null); }
  };

  /* ── Cursor movement ───────────────────────────────────────────────── */
  function focusStart() {
    var n = $('nameBox'), p = $('pinBox'); if (!n || !p) return;
    var u = curUser();
    try { (n.value && u ? p : n).focus(); } catch (e) { }
  }
  function loginShown() { var c = $('loginCard'); return !!c && c.style.display !== 'none' && c.style.display !== ''; }

  var autoT = null;
  function maybeToPin(force) {
    var n = $('nameBox'), p = $('pinBox'); if (!n || !p) return;
    var v = n.value.trim().toUpperCase(); if (!v) return;
    var list = find(v); if (list.length !== 1) return;          // none: nothing to do; two accounts: the user picks, and the pick moves the cursor
    if (!force) {                                               // typing: wait while a longer code / name could still follow
      var longer = users().some(function (u) {
        return [String(u.emp_code || ''), String(u.user_name || '')].some(function (s) { s = s.trim().toUpperCase(); return s.length > v.length && s.indexOf(v) === 0; });
      });
      if (longer) return;
    }
    try { p.focus(); } catch (e) { }
  }

  function wire() {
    var n = $('nameBox'), p = $('pinBox'), card = $('loginCard'); if (!n || !p || !card) return;
    // Help button + wait note
    var hb = document.createElement('button'); hb.type = 'button'; hb.className = 'lg-help'; hb.id = 'lgHelp'; hb.setAttribute('aria-label', 'Help'); hb.title = 'Help'; hb.innerHTML = IC.help;
    hb.addEventListener('click', openHelp); card.insertBefore(hb, card.firstChild);
    var wait = document.createElement('div'); wait.id = 'lgWait'; wait.className = 'lg-wait'; wait.setAttribute('role', 'status');
    var pc = p.closest('.fg'); if (pc) pc.appendChild(wait);

    // 1. cursor in the Employee Code box whenever the login card appears
    new MutationObserver(function () { if (loginShown()) setTimeout(focusStart, 30); }).observe(card, { attributes: true, attributeFilter: ['style'] });
    if (loginShown()) setTimeout(focusStart, 30);

    // 2. a complete code moves on to the PIN
    n.addEventListener('input', function (e) {
      paintWait();
      var picked = e && e.inputType === 'insertReplacementText';          // chosen from the dropdown list
      maybeToPin(picked);
    });
    n.addEventListener('change', function () { paintWait(); maybeToPin(true); });   // dropdown choice committed / Tab
    var pl = $('pickList'); if (pl) pl.addEventListener('click', function () { setTimeout(paintWait, 0); });

    // 3. the PIN logs in by itself
    p.addEventListener('input', function () {
      clearTimeout(autoT);
      if (p.readOnly || p.value.length < 4 || !curUser()) return;
      autoT = setTimeout(function () {
        var go = $('goBtn');
        if (go && !go.disabled && p.value.length >= 4 && !ALERT) go.click();
      }, AUTO_MS);
    });
    p.addEventListener('keydown', function (e) { if (e.key === 'Enter') clearTimeout(autoT); });
    paintWait();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
