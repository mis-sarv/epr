/* ════════════════════════════════════════════════════════════════════
   SARV INDIA — OFFLINE DATA CACHE + "Online / Sync Live" PILL
   ────────────────────────────────────────────────────────────────────
   Load this FIRST in <head> of every page (before supabase-js and
   sso-gate.js): supabase-js captures window.fetch when the client is
   created, so the wrapper must already be in place.

   What it does (APK only — on a normal browser it does nothing unless
   localStorage 'sarv_offline_web' = '1'):

   1. Every Supabase READ (GET /rest/v1/..., HEAD counts, and read-type
      RPCs) is fetched from the network first and its answer is saved in
      IndexedDB ('sarv_offline' / 'resp') with the time it was synced.
   2. If the network fails (or is too slow, > NET_WAIT ms, while a saved
      copy exists) the saved answer is returned instead, so the page keeps
      working with the data of the last sync.
   3. WRITES (POST/PATCH/DELETE to tables, save/delete/decide/... RPCs,
      logins, Edge Functions) are NEVER replayed from the cache: offline
      they fail exactly as before, so nothing is ever "saved" falsely.
   4. A small pill at the top shows  ● Online · Sync Live  or
      ● Offline · Last sync 10-11 3:28 PM. Pages inside ERP iframes report
      to the top window's pill instead of drawing their own.

   The app CODE itself (HTML/JS) is already inside the APK / OTA bundle,
   and the CDN libraries (supabase-js, Tailwind, React, fonts…) are
   cached by the native CdnCacheWebViewClient — so code + data both work
   offline.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__sarvNet) return; // loaded twice on one page

  var C = window.Capacitor;
  var isNative = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
  var webOptIn = false;
  try { webOptIn = localStorage.getItem('sarv_offline_web') === '1'; } catch (e) {}
  if (!isNative && !webOptIn) return;
  if (!window.fetch || !window.indexedDB) return;

  var SB_HOST = 'supabase.co';
  var NET_WAIT = 9000;               // ms before falling back to a saved copy
  var MAX_AGE = 45 * 24 * 3600e3;    // drop saved answers older than this
  var LS_LAST = 'sarv_last_sync';

  /* RPC names that CHANGE something (or must be live, like logins / PIN
     checks). These are never answered from the cache. Anything else that
     is an RPC is treated as a read. */
  var WRITE_RPC = /(save|delete|decide|done|undo|mark|^set_|_set_|_set$|patch|insert|update|create|login|logout|_ack|^ack|sync|claim|change|approve|reject|upload|import|lock|post_|grant|link|reset|signup|forgot|touch|activate|learn|add_|next_|verify|confirm|resolve|compute|_test|fetch_days|_done|_queue|send|register|notify|remind)/i;

  /* ── IndexedDB (tiny promise wrapper) ───────────────────────────────── */
  var dbP = null;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise(function (res, rej) {
      var r = indexedDB.open('sarv_offline', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('resp'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbP;
  }
  function idb(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction('resp', mode);
        var st = tx.objectStore('resp');
        var out = fn(st);
        tx.oncomplete = function () { res(out && 'result' in out ? out.result : undefined); };
        tx.onerror = function () { rej(tx.error); };
        tx.onabort = function () { rej(tx.error); };
      });
    });
  }
  function cacheGet(k) { return idb('readonly', function (s) { return s.get(k); }).catch(function () { return null; }); }
  function cachePut(k, v) { return idb('readwrite', function (s) { s.put(v, k); }).catch(function () {}); }
  function cacheClear() { return idb('readwrite', function (s) { s.clear(); }).catch(function () {}); }
  function cachePrune() {
    var cut = Date.now() - MAX_AGE;
    return idb('readwrite', function (s) {
      var c = s.openCursor();
      c.onsuccess = function () {
        var cur = c.result; if (!cur) return;
        if (!cur.value || cur.value.t < cut) cur.delete();
        cur.continue();
      };
    }).catch(function () {});
  }

  /* ── Request classification ─────────────────────────────────────────── */
  function hdr(h, name) {
    if (!h) return '';
    try {
      if (typeof h.get === 'function') return h.get(name) || '';
      if (Array.isArray(h)) { for (var i = 0; i < h.length; i++) if (String(h[i][0]).toLowerCase() === name) return h[i][1]; return ''; }
      for (var k in h) if (k.toLowerCase() === name) return h[k];
    } catch (e) {}
    return '';
  }

  // Returns a cache key for cacheable reads, or null for anything else.
  function readKey(url, method, body, headers) {
    var u;
    try { u = new URL(url, location.href); } catch (e) { return null; }
    if (u.hostname.indexOf(SB_HOST) < 0) return null;
    var p = u.pathname;
    var auth = hdr(headers, 'authorization');
    var who = auth ? String(auth).slice(-24) : '';        // separate per signed-in user
    var extra = '|' + hdr(headers, 'range') + '|' + hdr(headers, 'prefer') + '|' + hdr(headers, 'accept') + '|' + who;
    if (p.indexOf('/rest/v1/rpc/') === 0) {
      var fn = p.slice('/rest/v1/rpc/'.length);
      if (WRITE_RPC.test(fn)) return null;
      if (method === 'GET' || method === 'POST') return 'rpc|' + fn + '|' + u.search + '|' + (body || '') + extra;
      return null;
    }
    if (p.indexOf('/rest/v1/') === 0 && (method === 'GET' || method === 'HEAD'))
      return method + '|' + p + u.search + extra;
    return null;
  }
  function isLogout(url) { return /\/rpc\/(erp_app_logout|sales_logout)\b/.test(String(url)); }
  function isSupabase(url) { return String(url).indexOf(SB_HOST) >= 0; }

  /* ── Status (shared with the top window's pill) ─────────────────────── */
  var topNet = null;
  try { if (window.top !== window && window.top.__sarvNet) topNet = window.top.__sarvNet; } catch (e) {}

  var state = { online: navigator.onLine !== false, lastSync: 0, servedFrom: 0 };
  try { state.lastSync = +localStorage.getItem(LS_LAST) || 0; } catch (e) {}

  function report(kind, t) {
    if (topNet && topNet !== api) { try { topNet.report(kind, t); } catch (e) {} return; }
    if (kind === 'live') {
      state.online = true; state.servedFrom = 0; state.lastSync = t;
      try { localStorage.setItem(LS_LAST, String(t)); } catch (e) {}
    } else if (kind === 'cache') {
      state.online = false;
      if (!state.servedFrom || t < state.servedFrom) state.servedFrom = t;
    } else if (kind === 'down') {
      state.online = false;
    }
    render();
  }

  /* ── The fetch wrapper ──────────────────────────────────────────────── */
  var realFetch = window.fetch.bind(window);

  function fromCache(rec) {
    var h = new Headers(rec.h || {});
    h.set('x-sarv-offline', '1');
    h.set('x-sarv-synced-at', String(rec.t));
    var body = (rec.s === 204 || rec.s === 304 || rec.m === 'HEAD') ? null : rec.b;
    return new Response(body, { status: rec.s, statusText: 'OK (offline copy)', headers: h });
  }

  window.fetch = function (input, init) {
    init = init || {};
    var url = (typeof input === 'string') ? input : (input && input.url) || String(input);
    var method = String(init.method || (input && input.method) || 'GET').toUpperCase();
    var headers = init.headers || (input && input.headers);
    var body = (typeof init.body === 'string') ? init.body : '';
    var key = readKey(url, method, body, headers);

    if (isLogout(url)) cacheClear();      // next user must not see this one's saved data

    if (!key) {
      // Not cacheable: pass through, but still track online / offline.
      var p0 = realFetch(input, init);
      if (isSupabase(url)) {
        p0.then(function () { report('live', Date.now()); },
                function () { report('down'); });
      }
      return p0;
    }

    var saved = cacheGet(key);
    var net = realFetch(input, init).then(function (r) {
      // Save good answers only (an error answer must not replace good data).
      if (r.ok) {
        var c = r.clone();
        var h = {};
        c.headers.forEach(function (v, k) { h[k] = v; });
        c.text().then(function (txt) {
          cachePut(key, { t: Date.now(), s: c.status, h: h, b: txt, m: method });
        }).catch(function () {});
      }
      report('live', Date.now());
      return r;
    });

    return new Promise(function (resolve, reject) {
      var done = false;
      function useCache(err) {
        saved.then(function (rec) {
          if (done) return;
          if (rec) { done = true; report('cache', rec.t); resolve(fromCache(rec)); }
          else if (err) { done = true; report('down'); reject(err); }
        });
      }
      var timer = setTimeout(function () { useCache(null); }, NET_WAIT);
      net.then(function (r) {
        clearTimeout(timer);
        if (!done) { done = true; resolve(r); }
      }, function (err) {
        clearTimeout(timer);
        if (!done) useCache(err);
      });
    });
  };

  /* ── The pill ───────────────────────────────────────────────────────── */
  var pill = null, expandedUntil = 0, wantShow = !topNet;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmt(t) {
    if (!t) return 'never';
    var d = new Date(t), now = new Date();
    var h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    var time = h + ':' + pad(d.getMinutes()) + ' ' + ap;
    if (d.toDateString() === now.toDateString()) return 'today ' + time;
    return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + ' ' + time;
  }
  function render() {
    if (!wantShow || !document.body) return;
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'sarvNetPill';
      pill.setAttribute('data-no-caps', '1');
      pill.style.cssText =
        'position:fixed;left:50%;top:calc(4px + env(safe-area-inset-top));transform:translateX(-50%);' +
        'z-index:2147483000;display:flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;' +
        "font:600 11px/1.4 'Segoe UI',system-ui,sans-serif;white-space:nowrap;cursor:pointer;" +
        'box-shadow:0 4px 14px -4px rgba(0,0,0,.35);transition:background .2s,color .2s;-webkit-tap-highlight-color:transparent;';
      pill.addEventListener('click', function () { expandedUntil = Date.now() + 6000; render(); setTimeout(render, 6100); });
      document.body.appendChild(pill);
    }
    var live = state.online && !state.servedFrom;
    var full = Date.now() < expandedUntil;
    var dot = '<span style="width:7px;height:7px;border-radius:50%;background:' + (live ? '#22c55e' : '#f59e0b') +
      ';box-shadow:0 0 0 3px ' + (live ? 'rgba(34,197,94,.25)' : 'rgba(245,158,11,.25)') + ';"></span>';
    var txt;
    if (live) {
      txt = full ? 'Online · Sync Live · last sync ' + fmt(state.lastSync) : 'Online · Sync Live';
      pill.style.background = '#052e16'; pill.style.color = '#bbf7d0'; pill.style.border = '1px solid #166534';
    } else {
      var t = state.servedFrom || state.lastSync;
      txt = 'Offline · Last sync ' + fmt(t) + (full ? ' · showing saved data, changes need internet' : '');
      pill.style.background = '#451a03'; pill.style.color = '#fde68a'; pill.style.border = '1px solid #92400e';
    }
    pill.innerHTML = dot + '<span>' + txt + '</span>';
    pill.title = txt;
  }

  function onNetChange() {
    state.online = navigator.onLine !== false;
    if (state.online) state.servedFrom = 0; // will be confirmed by the next live answer
    render();
  }
  window.addEventListener('online', onNetChange);
  window.addEventListener('offline', onNetChange);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
  setTimeout(cachePrune, 15000);

  var api = window.__sarvNet = {
    report: report,
    state: function () { return { online: state.online, lastSync: state.lastSync, servedFrom: state.servedFrom }; },
    clear: cacheClear
  };
})();
