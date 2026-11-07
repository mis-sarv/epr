/* ════════════════════════════════════════════════════════════════════
   SARV INDIA — PUSH NOTIFICATIONS (FCM) + RING
   ────────────────────────────────────────────────────────────────────
   Runs inside the Android APK (Capacitor). It:
     1. Creates a notification channel "sarv_ring" that uses our custom
        ring sound (android/app/src/main/res/raw/ring.wav), so background
        notifications RING even when the app is closed.
     2. Asks permission, registers with FCM, and saves the device token to
        Supabase (push_tokens) against the logged-in user.
     3. When a push arrives while the app is OPEN (foreground), Android does
        NOT ring on its own, so we play the ring here and show a small
        in-app banner.

   Nothing happens on a plain desktop browser (guarded by isNative): FCM is
   an Android/Play-Services feature, not a browser one.

   Load this on launcher.html, index.html and mobile.html — on whichever is
   open when a push lands, the foreground ring plays.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var C = window.Capacitor;
  var isNative = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
  if (!isNative) return; // browsers can't use native FCM

  var Push = (C.Plugins && C.Plugins.PushNotifications) || null;
  if (!Push) return;

  var CHANNEL = 'sarv_ring';
  var SUPABASE_URL = 'https://jdlzgjgxxjkjejkhvdij.supabase.co';
  var SUPABASE_ANON =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkbHpnamd4eGpramVqa2h2ZGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODUwMDcsImV4cCI6MjEwNTY2MTAwN30.ow4i6e78i-dGoJJh2-N4FX6EQE7f2FRQDgCMJHpxAWk';

  // The launcher saves the session under this key; every app reads it.
  function sessionToken() {
    try { return localStorage.getItem('sarv_sso_token') || ''; } catch (e) { return ''; }
  }

  // Minimal REST call to an RPC (no supabase-js dependency, so this file
  // works on any page). Returns a promise.
  function rpc(fn, body) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON,
        'Authorization': 'Bearer ' + SUPABASE_ANON
      },
      body: JSON.stringify(body || {})
    });
  }

  /* ── Foreground ring + banner ───────────────────────────────────────── */
  var audio = null;
  function playRing() {
    try {
      if (!audio) { audio = new Audio('ring.wav'); audio.preload = 'auto'; }
      audio.currentTime = 0;
      var p = audio.play();
      if (p && p.catch) p.catch(function () {}); // ignore autoplay blocks
    } catch (e) {}
  }

  function banner(title, body) {
    try {
      var d = document.createElement('div');
      d.setAttribute('data-no-caps', '1');
      d.style.cssText =
        'position:fixed;left:50%;top:calc(12px + env(safe-area-inset-top));transform:translateX(-50%);' +
        'z-index:100000;max-width:92vw;background:#111827;color:#f8fafc;border:1px solid rgba(255,255,255,.18);' +
        'border-radius:12px;padding:11px 14px;box-shadow:0 12px 34px -8px rgba(0,0,0,.6);' +
        "font-family:'Segoe UI',system-ui,sans-serif;cursor:pointer;";
      d.innerHTML =
        '<div style="font-size:13px;font-weight:800;margin-bottom:2px;">' + esc(title || 'SARV ERP') + '</div>' +
        '<div style="font-size:12px;color:#cbd5e1;">' + esc(body || '') + '</div>';
      d.addEventListener('click', function () { d.remove(); });
      document.body.appendChild(d);
      setTimeout(function () { if (d.parentNode) d.remove(); }, 7000);
    } catch (e) {}
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[<>&]/g, function (c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c];
    });
  }

  /* ── Registration flow ──────────────────────────────────────────────── */
  function start() {
    // 1. The channel that gives background notifications our ring sound.
    try {
      Push.createChannel({
        id: CHANNEL,
        name: 'SARV Alerts',
        description: 'Important ERP alerts',
        importance: 5,            // IMPORTANCE_HIGH → heads-up + sound
        visibility: 1,
        sound: 'ring',            // res/raw/ring.wav (no extension)
        vibration: true,
        lights: true
      });
    } catch (e) {}

    // 2. Permission → register.
    Push.requestPermissions().then(function (res) {
      if (res && res.receive === 'granted') {
        Push.register();
      } else if (window.console) {
        console.warn('[SARV push] permission not granted:', res && res.receive);
      }
    }).catch(function (e) { if (window.console) console.error('[SARV push] perm', e); });

    // 3. Got the FCM token → save it for this user.
    Push.addListener('registration', function (t) {
      var token = t && t.value;
      if (!token) return;
      var sess = sessionToken();
      if (!sess) {
        // Not logged in yet; remember and save once the session exists.
        try { localStorage.setItem('sarv_pending_fcm', token); } catch (e) {}
        return;
      }
      rpc('push_token_save', { p_session: sess, p_fcm: token, p_platform: 'android' })
        .then(function (r) { if (window.console) console.log('[SARV push] token saved', r.status); })
        .catch(function (e) { if (window.console) console.error('[SARV push] save', e); });
    });

    Push.addListener('registrationError', function (e) {
      if (window.console) console.error('[SARV push] registrationError', e);
    });

    // 4. Foreground push → ring + banner (Android stays silent otherwise).
    Push.addListener('pushNotificationReceived', function (n) {
      playRing();
      banner(n && n.title, n && n.body);
    });

    // 5. User tapped a notification → bring the relevant screen up. The
    //    server can send data.url; default to the launcher.
    Push.addListener('pushNotificationActionPerformed', function (a) {
      var url = a && a.notification && a.notification.data && a.notification.data.url;
      if (url) { try { location.href = url; } catch (e) {} }
    });
  }

  // If a token arrived before login, flush it once a session appears.
  function flushPending() {
    var sess = sessionToken();
    var pend = null;
    try { pend = localStorage.getItem('sarv_pending_fcm'); } catch (e) {}
    if (sess && pend) {
      rpc('push_token_save', { p_session: sess, p_fcm: pend, p_platform: 'android' })
        .then(function () { try { localStorage.removeItem('sarv_pending_fcm'); } catch (e) {} })
        .catch(function () {});
    }
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', function () { start(); flushPending(); });
  else { start(); flushPending(); }

  // Re-try the pending save a few seconds in (covers the login-then-register race).
  setTimeout(flushPending, 4000);
  setTimeout(flushPending, 12000);
})();
