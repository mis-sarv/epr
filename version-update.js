/* ════════════════════════════════════════════════════════════════════
   SARV INDIA — APP VERSION / OTA UPDATE
   ────────────────────────────────────────────────────────────────────
   The apps are packed into an Android APK with Capacitor. The native
   shell is a thin wrapper; the real app is these www files. This file
   lets a user update those files OVER THE AIR from Supabase, WITHOUT
   reinstalling the APK.

   How it works
   ------------
   • Supabase Storage holds two things in the PUBLIC bucket `app-updates`:
        version.json          { "version":"1.0.1", "notes":"…", "url":"…zip" }
        bundle-<version>.zip   a zip of this whole www folder
   • The plugin `@capgo/capacitor-updater` downloads that zip into the
     app's private storage and loads the WebView from it instead of the
     copy frozen inside the APK. On the next launch the new files run.

   The admin pushes an update by uploading a new zip + bumping version.json
   (see push-update.bat and UPDATE-GUIDE below). The user taps the button
   this file draws on the launcher.

   Why notifyAppReady() runs on every load
   ----------------------------------------
   capacitor-updater has a safety net: after it switches to a new bundle it
   waits for notifyAppReady(). If the new bundle is broken and never calls
   it, the plugin rolls back to the previous working bundle. So EVERY page
   that can be the first screen after an update must call it — here that is
   launcher.html and index.html (both load this file).
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // The public Storage folder where updates live. Same Supabase project as
  // the rest of the ERP (SARV-STORE). The /object/public/ path needs no key
  // because the bucket is public-read.
  var UPDATE_BASE =
    'https://jdlzgjgxxjkjejkhvdij.supabase.co/storage/v1/object/public/app-updates';

  // Are we inside the native Android app (not a desktop browser)?
  var isNative = !!(window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === 'function' &&
    window.Capacitor.isNativePlatform());

  // The capacitor-updater plugin, exposed by the native bridge. Null on web.
  var Updater =
    (window.Capacitor && window.Capacitor.Plugins &&
      window.Capacitor.Plugins.CapacitorUpdater) || null;

  /* ── Safety net ─────────────────────────────────────────────────────
     Confirm the running bundle so the plugin never rolls it back. Harmless
     on the built-in bundle and on the web (guarded by isNative). */
  if (isNative && Updater && typeof Updater.notifyAppReady === 'function') {
    try { Updater.notifyAppReady(); } catch (e) { /* non-fatal */ }
  }

  // Draw the button only on the launcher; other pages just confirm readiness
  // above. (You can force it on any page with window.SARV_UPDATER_UI = true.)
  var showUI = window.SARV_UPDATER_UI === true || /launcher/i.test(location.pathname);
  if (!showUI) return;

  /* ── Small helpers ──────────────────────────────────────────────────── */
  // Fetch JSON with cache busting; the browser/WebView must never hand back a
  // stale version.json or the update check would compare wrong numbers.
  function fetchJson(url) {
    return fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(),
      { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  // Compare two "1.2.3" strings. Returns 1 if a>b, -1 if a<b, 0 if equal.
  // Missing parts count as 0 ("1.2" === "1.2.0").
  function cmpVer(a, b) {
    var pa = String(a || '0').split('.').map(Number);
    var pb = String(b || '0').split('.').map(Number);
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var x = pa[i] || 0, y = pb[i] || 0;
      if (x > y) return 1;
      if (x < y) return -1;
    }
    return 0;
  }

  var ST_IDLE = 0, ST_BUSY = 1;
  var state = ST_IDLE;
  var localVer = '—';

  /* ── UI: one small pill at the bottom of the launcher ─────────────── */
  var style = document.createElement('style');
  style.textContent =
    '#sarvUpd{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));' +
    'transform:translateX(-50%);z-index:99998;display:flex;align-items:center;gap:10px;' +
    'background:rgba(15,23,42,.92);border:1px solid rgba(255,255,255,.16);' +
    'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
    'border-radius:999px;padding:7px 8px 7px 14px;box-shadow:0 10px 30px -8px rgba(0,0,0,.6);' +
    "font-family:'Segoe UI',system-ui,-apple-system,sans-serif;max-width:92vw;}" +
    '#sarvUpd .v{font-size:11.5px;font-weight:700;color:#9fb0c7;white-space:nowrap;letter-spacing:.02em;}' +
    '#sarvUpd .msg{font-size:11.5px;color:#eef2f8;white-space:nowrap;overflow:hidden;' +
    'text-overflow:ellipsis;max-width:46vw;}' +
    '#sarvUpd button{border:none;border-radius:999px;background:#2563eb;color:#fff;' +
    'font:700 12px/1 inherit;padding:9px 14px;min-height:34px;cursor:pointer;white-space:nowrap;}' +
    '#sarvUpd button:hover{background:#1d4ed8;}' +
    '#sarvUpd button:disabled{opacity:.6;cursor:default;}' +
    '#sarvUpd.ok button{background:#16a34a;}' +
    // On the launcher the pill sits in the page flow under the app list, so
    // it scrolls with the page instead of covering the last tiles.
    '#sarvUpd.inflow{position:static;left:auto;bottom:auto;transform:none;' +
    'width:fit-content;margin:22px auto 0;}';
  document.head.appendChild(style);

  var bar = document.createElement('div');
  bar.id = 'sarvUpd';
  bar.setAttribute('data-no-caps', '1'); // never force these labels to CAPS
  bar.innerHTML =
    '<span class="v" id="sarvUpdVer"></span>' +
    '<span class="msg" id="sarvUpdMsg"></span>' +
    '<button type="button" id="sarvUpdBtn">Check for Update</button>';

  function mount() {
    // Launcher: put it at the end of the main column (.wrap). Any other page
    // that asks for the UI keeps the fixed pill at the bottom.
    var host = /launcher/i.test(location.pathname) && document.querySelector('body > .wrap');
    if (host) { bar.classList.add('inflow'); host.appendChild(bar); }
    else document.body.appendChild(bar);
    document.getElementById('sarvUpdBtn').addEventListener('click', check);
    // Show the version we are running, read from the ACTIVE bundle's own
    // version.json (after an OTA update this file is the new one).
    fetchJson('version.json').then(function (j) {
      localVer = (j && j.version) || '1.0.0';
    }).catch(function () {
      localVer = '1.0.0';
    }).then(function () {
      document.getElementById('sarvUpdVer').textContent = 'SARV ERP v' + localVer;
    });
  }

  function setMsg(m) { document.getElementById('sarvUpdMsg').textContent = m || ''; }
  function setBtn(label, disabled) {
    var b = document.getElementById('sarvUpdBtn');
    b.textContent = label; b.disabled = !!disabled;
  }

  /* ── The check / update flow ────────────────────────────────────────── */
  function check() {
    if (state === ST_BUSY) return;
    state = ST_BUSY;
    bar.classList.remove('ok');
    setBtn('Checking…', true);
    setMsg('');

    // What is installed right now (active bundle's version.json).
    fetchJson('version.json').then(function (loc) {
      localVer = (loc && loc.version) || localVer;
      // What is the latest on the server.
      return fetchJson(UPDATE_BASE + '/version.json').then(function (rem) {
        if (!rem || !rem.version) throw new Error('version.json has no version');
        if (cmpVer(rem.version, localVer) <= 0) {
          // Already current.
          bar.classList.add('ok');
          setMsg('v' + localVer);
          setBtn('Up to date ✓', false);
          state = ST_IDLE;
          return;
        }
        // A newer version exists.
        return applyUpdate(rem);
      });
    }).catch(function (e) {
      setMsg(netMsg(e));
      setBtn('Try again', false);
      state = ST_IDLE;
    });
  }

  function netMsg(e) {
    var m = (e && e.message) || String(e);
    if (/failed to fetch|networkerror|load failed|HTTP 0/i.test(m))
      return 'No internet / server not reachable';
    if (/HTTP 404/i.test(m)) return 'No update file on server yet';
    return 'Update check failed';
  }

  function applyUpdate(rem) {
    var zipUrl = rem.url || (UPDATE_BASE + '/bundle-' + rem.version + '.zip');

    // On the plain web there is no bundle to swap — the page already loads
    // from the host, so a reload gets the newest files.
    if (!isNative || !Updater) {
      setMsg('Updating to v' + rem.version + '…');
      setBtn('Updating…', true);
      setTimeout(function () { location.reload(); }, 600);
      return;
    }

    // Native: download the zip, make it the active bundle, reload into it.
    // capacitor-updater v8 REQUIRES a checksum (SHA-256 of the zip); without it
    // download() throws "Checksum required". push-update.bat writes it into
    // version.json as "checksum".
    setMsg('Downloading v' + rem.version + '…');
    setBtn('Downloading…', true);
    var dlOpts = { url: zipUrl, version: rem.version };
    if (rem.checksum) dlOpts.checksum = rem.checksum;
    return Updater.download(dlOpts)
      .then(function (bundle) {
        setMsg('Installing…');
        return Updater.set(bundle).then(function () {
          // set() reloads the WebView on most versions; reload() is a
          // belt-and-braces fallback for the ones where it does not.
          if (typeof Updater.reload === 'function') { try { Updater.reload(); } catch (e) {} }
        });
      })
      .catch(function (e) {
        // Show the real reason so a failure is debuggable without a phone log.
        var m = (e && (e.message || e.errorMessage)) || String(e);
        setMsg('Update failed: ' + String(m).slice(0, 80));
        setBtn('Try again', false);
        state = ST_IDLE;
        if (window.console) console.error('[SARV update]', e);
      });
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', mount);
  else
    mount();
})();
