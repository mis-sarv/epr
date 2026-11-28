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

/* ═══ SYNC SPEED (2026-11-27, after the 27-11 database freeze) ═══
   How often each app re-reads its data, set by the Admin per app in ERP › Admin Panel › System Health › App sync
   speed (app_settings 'sync_intervals' = {key: seconds}; store-core.js SARV_SYNC_APPS lists the keys). Every timer that
   used a fixed 5 s asks  sarvSyncMs('<key>', <its old default in ms>)  when the page starts: the Admin's seconds
   (2 … 3600) when set, else that default, so nothing changes until the Admin sets a value. The list is kept on the
   device (localStorage sarv_sync_cfg_v1) and read again in the background when older than 10 minutes, so a change
   reaches every page the next time it is opened. app_settings is readable before login. */
(function () {
  'use strict';
  if (window.sarvSyncMs) return;
  var K = 'sarv_sync_cfg_v1', HOST = 'jdlzgjgxxjkjejkhvdij.supabase.co', cfg = {}, at = 0;
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkbHpnamd4eGpramVqa2h2ZGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODUwMDcsImV4cCI6MjEwNTY2MTAwN30.ow4i6e78i-dGoJJh2-N4FX6EQE7f2FRQDgCMJHpxAWk';
  try { var c = JSON.parse(localStorage.getItem(K) || 'null'); if (c && typeof c.cfg === 'object') { cfg = c.cfg || {}; at = Number(c.at) || 0; } } catch (e) {}
  window.sarvSyncMs = function (key, defMs) {
    var s = Number(cfg && cfg[key]);
    return (isFinite(s) && s >= 2 && s <= 3600) ? Math.round(s * 1000) : defMs;
  };
  if (Date.now() - at > 600000 && window.fetch) {
    setTimeout(function () {
      window.fetch('https://' + HOST + '/rest/v1/app_settings?key=eq.sync_intervals&select=value', { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (rows) {
          if (!Array.isArray(rows)) return;
          var v = rows[0] && rows[0].value;
          cfg = (v && typeof v === 'object') ? v : {};
          try { localStorage.setItem(K, JSON.stringify({ at: Date.now(), cfg: cfg })); } catch (e) {}
        }).catch(function () {});
    }, 3000);
  }
})();

/* ═══ ERP LOGIN ON EVERY TABLE REQUEST (SECURITY PHASE 2, 2026-11-26) ═══
   Every page (browser AND APK) sends the user's ERP session token as the header x-sarv-token on its
   Supabase table requests (/rest/v1/…), so the database can let only a logged-in ERP user read / write
   the tables (RLS: public.sarv_req_ok_(), sql/SECURITY_PHASE2_MIGRATION.sql) instead of anyone holding
   the public anon key. Installed BEFORE supabase-js captures fetch and before the offline cache below.
   Safe start: the header is only sent once a probe request with it has gone through on this device
   (localStorage sarv_hdr_ok '1', probed again once a day); a server / network that refuses the header
   ('0') keeps the requests exactly as before. RPCs carry the token in their body already; the header
   just rides along. Never sent to any other host. */
(function () {
  'use strict';
  if (window.__sarvTokHdr || !window.fetch) return;
  window.__sarvTokHdr = true;
  var HOST = 'jdlzgjgxxjkjejkhvdij.supabase.co', HDR = 'x-sarv-token', K_OK = 'sarv_hdr_ok', K_AT = 'sarv_hdr_at';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkbHpnamd4eGpramVqa2h2ZGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODUwMDcsImV4cCI6MjEwNTY2MTAwN30.ow4i6e78i-dGoJJh2-N4FX6EQE7f2FRQDgCMJHpxAWk';
  var orig = window.fetch.bind(window);
  var ls = function (k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  var lsSet = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
  function want(url) { return typeof url === 'string' && url.indexOf(HOST) >= 0 && url.indexOf('/rest/v1/') >= 0; }
  /* Storage (uploads / overwrites / deletes / private files, SECURITY PHASE 3): the same header on /storage/v1/,
     never on a public file link (/object/public/: a plain download needs nothing). Its own flag sarv_hdr_st_ok,
     probed the same way (the storage API answers its own CORS). */
  var K_SOK = 'sarv_hdr_st_ok', K_SAT = 'sarv_hdr_st_at';
  function wantSt(url) { return typeof url === 'string' && url.indexOf(HOST) >= 0 && url.indexOf('/storage/v1/') >= 0 && url.indexOf('/object/public/') < 0; }
  if (ls(K_SOK) !== '1' || Date.now() - Number(ls(K_SAT) || 0) > 86400000) {
    var tokS = ls('sarv_sso_token');
    if (tokS) {
      var su = 'https://' + HOST + '/storage/v1/bucket/sarv-pdfs', sh = { apikey: ANON, Authorization: 'Bearer ' + ANON };
      orig(su, { headers: Object.assign({ 'x-sarv-token': tokS }, sh) })
        .then(function () { lsSet(K_SOK, '1'); lsSet(K_SAT, String(Date.now())); })   // any answer = the header passed CORS
        .catch(function () {
          orig(su, { headers: sh }).then(function () { lsSet(K_SOK, '0'); lsSet(K_SAT, String(Date.now())); }).catch(function () {});
        });
    }
  }
  /* One probe a day per device: does the API take the header? The header is sent unless a probe said NO
     ('0'): since Phase 2 the tables answer only with it, so a new device must send it from its very first
     request (the API's CORS was checked to allow it). A probe that fails is tried once more WITHOUT the
     header: only "with fails, without works" (= the header itself is refused) writes '0'; both failing
     = simply offline, nothing is written. */
  if (ls(K_OK) !== '1' || Date.now() - Number(ls(K_AT) || 0) > 86400000) {
    var tok0 = ls('sarv_sso_token');
    if (tok0) {
      var pu = 'https://' + HOST + '/rest/v1/app_settings?select=key&limit=1', ph = { apikey: ANON, Authorization: 'Bearer ' + ANON };
      orig(pu, { headers: Object.assign({ 'x-sarv-token': tok0 }, ph) })
        .then(function (r) { lsSet(K_OK, r.ok ? '1' : '0'); lsSet(K_AT, String(Date.now())); })
        .catch(function () {
          orig(pu, { headers: ph }).then(function (r) { if (r.ok) { lsSet(K_OK, '0'); lsSet(K_AT, String(Date.now())); } }).catch(function () {});
        });
    }
  }
  /* Console test for Security Phase 3: type  sarvStorageTest()  in F12 › Console of any ERP page.
     Uploads one tiny text file to the private test bucket 'sarv-hdr-test' (sql/SECURITY_PHASE3_PRECHECK.sql)
     A) with the real token (should pass) and B) with a wrong one (should be refused), and shows both. */
  window.sarvStorageTest = function () {
    var base = 'https://' + HOST + '/storage/v1/object/sarv-hdr-test/', tok = ls('sarv_sso_token');
    var go = function (name, t) {
      return orig(base + name + '_' + Date.now() + '.txt', { method: 'POST', body: 'ok',
        headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'text/plain', 'x-sarv-token': t } })
        .then(function (r) { return r.text().then(function (x) { return r.status + ' ' + x; }); })
        .catch(function (e) { return 'NETWORK / CORS ERROR: ' + (e && e.message); });
    };
    if (!tok) { console.log('Not logged in: open this page after the launcher login.'); return 'no token'; }
    return go('a', tok).then(function (a) {
      return go('b', 'wrong-token').then(function (b) {
        var msg = 'A (real token): ' + a + '\nB (wrong token): ' + b + '\nstorage flag: ' + ls(K_SOK);
        console.log(msg); try { alert(msg); } catch (e) {}
        return msg;
      });
    });
  };
  window.fetch = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var tok = ls('sarv_sso_token');
      if (tok && ((ls(K_OK) !== '0' && want(url)) || (ls(K_SOK) === '1' && wantSt(url)))) {
        var h = new Headers((init && init.headers) || (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined));
        if (!h.has(HDR)) h.set(HDR, tok);
        init = Object.assign({}, init || {}, { headers: h });
      }
    } catch (e) {}
    return orig(input, init);
  };
})();

/* ═══ PRIVATE FILES (SECURITY PHASE 5, 2026-11-26) ═══
   The file buckets sarv-pdfs / packing-slips / sales-orders / printing-lot become PRIVATE
   (sql/SECURITY_PHASE5_FILES_PRIVATE.sql). Every link saved in the database still reads
   https://<project>/storage/v1/object/public/<bucket>/<path>; this block turns such a link, wherever a page
   uses it, into a SIGNED link (storage /object/sign, asked with the ERP login token x-sarv-token, which the
   sarv_st_* storage rules accept) so no page had to change:
     fetch()                pdf.js previews, PDF / photo downloads, html2canvas, pdf-lib  → signed (1 h)
     <img> / <iframe> / <embed> / <object> / <source> src, inline style url(...)  → rewritten (MutationObserver,
                            and the <img>.src property for images made in code)
     window.open(link)      → opened signed (a blank tab first on a PC, so the popup is still allowed)
     a click on <a href>    → opened signed (only when the page did not handle the click itself)
     WhatsApp links (wa.me / api.whatsapp.com) in window.open / a click, navigator.share text / url,
     navigator.clipboard.writeText → every file link inside gets a 30-DAY signed link (sent to vendors /
                            buyers, who have no login)
   Links are signed in batches (one request per bucket every ~25 ms) and kept until 2 minutes before they
   expire. No login token / a refused signing = the original link is used (it still works while the bucket is
   public, so this block can run before the switch). Console check: sarvFilesTest(). */
(function () {
  'use strict';
  if (window.__sarvFiles || !window.fetch) return;
  window.__sarvFiles = true;
  var HOST = 'jdlzgjgxxjkjejkhvdij.supabase.co', BASE = 'https://' + HOST + '/storage/v1';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkbHpnamd4eGpramVqa2h2ZGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODUwMDcsImV4cCI6MjEwNTY2MTAwN30.ow4i6e78i-dGoJJh2-N4FX6EQE7f2FRQDgCMJHpxAWk';
  var PRIV = { 'sarv-pdfs': 1, 'packing-slips': 1, 'sales-orders': 1, 'printing-lot': 1 };
  var VIEW_SEC = 3600, LINK_SEC = 86400, SHARE_SEC = 30 * 86400;
  var fetch0 = window.fetch.bind(window);
  var ls = function (k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  var native = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());

  var RE1 = /^https?:\/\/jdlzgjgxxjkjejkhvdij\.supabase\.co\/storage\/v1\/object\/public\/([^\/?#]+)\/([^?#]+)/;
  var reAll = function () { return /https?:\/\/jdlzgjgxxjkjejkhvdij\.supabase\.co\/storage\/v1\/object\/(?:public\/[^\s"'<>)]+|sign\/[^\s"'<>)?]+\?token=[^\s"'<>)&]+)/g; };
  var RE_SIGNED = /^https?:\/\/jdlzgjgxxjkjejkhvdij\.supabase\.co\/storage\/v1\/object\/sign\/([^\/?#]+)\/([^?#]+)\?token=/;
  function parse(u) {
    if (u && typeof u !== 'string') u = String(u);
    var m = u ? RE1.exec(u) : null;
    if (!m || !PRIV[m[1]]) return null;
    var p; try { p = decodeURIComponent(m[2]); } catch (e) { p = m[2]; }
    return { bucket: m[1], path: p, raw: u };
  }
  // for a link that LEAVES the ERP: a public link, or one already signed for a short time (an <a> of a page)
  function parseShare(u) {
    var r = parse(u); if (r) return r;
    var m = u ? RE_SIGNED.exec(String(u)) : null;
    if (!m || !PRIV[m[1]]) return null;
    var p; try { p = decodeURIComponent(m[2]); } catch (e) { p = m[2]; }
    return { bucket: m[1], path: p, raw: String(u) };
  }

  // ── signing, in batches ──
  var CACHE = {}, Q = {};
  function sign(info, sec) {
    var key = info.bucket + '|' + sec + '|' + info.path, c = CACHE[key];
    if (c && c.until > Date.now()) return Promise.resolve(c.url);
    return new Promise(function (res) {
      var qk = info.bucket + '|' + sec, q = Q[qk] || (Q[qk] = { paths: {}, raw: {}, t: 0 });
      (q.paths[info.path] = q.paths[info.path] || []).push(res);
      q.raw[info.path] = info.raw;
      if (!q.t) q.t = setTimeout(function () { flush(qk, info.bucket, sec); }, 25);
    });
  }
  function flush(qk, bucket, sec) {
    var q = Q[qk]; delete Q[qk];
    var paths = Object.keys(q.paths);
    var done = function (map) {
      paths.forEach(function (p) {
        var u = map[p] || q.raw[p];   // not signed = the original link
        if (map[p]) CACHE[bucket + '|' + sec + '|' + p] = { url: u, until: Date.now() + (sec - 120) * 1000 };
        q.paths[p].forEach(function (r) { r(u); });
      });
    };
    var tok = ls('sarv_sso_token');
    if (!tok) return done({});
    fetch0(BASE + '/object/sign/' + bucket, {
      method: 'POST', body: JSON.stringify({ expiresIn: sec, paths: paths }),
      headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json', 'x-sarv-token': tok }
    }).then(function (r) { return r.ok ? r.json() : []; })
      .then(function (arr) {
        var map = {};
        (Array.isArray(arr) ? arr : []).forEach(function (x) { if (x && x.signedURL && !x.error && x.path) map[x.path] = encodeURI(BASE + x.signedURL); });
        done(map);
      })
      .catch(function () { done({}); });
  }
  // every file link inside a text / an (encoded) WhatsApp link → its signed link
  function signText(s, sec) {
    s = String(s == null ? '' : s);
    var dec; try { dec = decodeURIComponent(s); } catch (e) { dec = s; }
    var found = [];
    (dec.match(reAll()) || []).concat(s.match(reAll()) || []).forEach(function (u) { if (parseShare(u) && found.indexOf(u) < 0) found.push(u); });
    if (!found.length) return Promise.resolve(s);
    return Promise.all(found.map(function (u) { return sign(parseShare(u), sec); })).then(function (sg) {
      var out = s;
      found.forEach(function (u, i) { out = out.split(encodeURIComponent(u)).join(encodeURIComponent(sg[i])).split(u).join(sg[i]); });
      return out;
    });
  }
  function hasFile(s) {
    s = String(s || ''); var dec; try { dec = decodeURIComponent(s); } catch (e) { dec = s; }
    return (dec.match(reAll()) || []).some(function (u) { return !!parseShare(u); });
  }
  var isWa = function (s) { return /^(https?:)?\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//i.test(String(s || '')) || /^whatsapp:/i.test(String(s || '')); };

  // ── fetch ──
  var fetchPrev = window.fetch;
  window.fetch = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : (typeof URL !== 'undefined' && input instanceof URL) ? String(input) : '';
      var m = url && (!init || !init.method || /^GET$/i.test(init.method)) ? parse(url) : null;
      if (m) return sign(m, VIEW_SEC).then(function (su) { return fetchPrev(su, init); });
    } catch (e) {}
    return fetchPrev(input, init);
  };

  // ── window.open ──
  var open0 = window.open;
  window.open = function (url, name, feat) {
    var s = url == null ? '' : String(url), m = parse(s), wa = isWa(s) && hasFile(s);
    if (!m && !wa) return open0.apply(window, arguments);
    var job = m ? sign(m, VIEW_SEC) : signText(s, SHARE_SEC);
    if (native) { job.then(function (u) { open0.call(window, u, name, feat); }); return null; }
    var w = open0.call(window, 'about:blank', name || '_blank', feat);
    job.then(function (u) {
      if (w && !w.closed) { try { w.location.replace(u); } catch (e) { try { w.location = u; } catch (e2) {} } }
      else open0.call(window, u, name, feat);
    });
    return w;
  };

  /* ── <a href> ──
     Pages build their PDF links as <a href="…public…" target="_blank" onclick="event.stopPropagation()">, so a click
     never reaches a listener on the page. So every such link gets its SIGNED href as soon as it appears (fix() below:
     24 h; a WhatsApp link: 30 days), and a click / middle-click / "open in new tab" simply follows it. Only a click in
     the moment before the signing came back is caught here, in the CAPTURE phase (it runs before the link's own
     onclick), and opened signed. A page left open is re-signed when it comes back to the screen after 20 h. */
  document.addEventListener('click', function (e) {
    if (e.button !== 0) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '', m = parse(href), wa = isWa(href) && hasFile(href) && !a.hasAttribute('data-sarv-at');
    if (!m && !wa) return;
    e.preventDefault();
    var tgt = String(a.getAttribute('target') || '').toLowerCase();
    if (wa || tgt === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey || a.hasAttribute('download')) window.open(href, '_blank');
    else sign(m, VIEW_SEC).then(function (u) { location.href = u; });
  }, true);
  function fixA(el) {
    var v = el.getAttribute('href') || '';
    if (v && v === el.getAttribute('data-sarv-out')) return;   // the signed href this block set itself
    var m = parse(v), wa = !m && isWa(v) && hasFile(v);
    if (!m && !wa) return;
    el.removeAttribute('data-sarv-at');
    el.setAttribute('data-sarv-href', v);
    (m ? sign(m, LINK_SEC) : signText(v, SHARE_SEC)).then(function (u) {
      if (el.getAttribute('href') === v && u !== v) {
        el.setAttribute('data-sarv-out', u); el.setAttribute('data-sarv-at', String(Date.now())); el.setAttribute('href', u);
      }
    });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    var old = document.querySelectorAll('a[data-sarv-at]'), now = Date.now();
    for (var i = 0; i < old.length; i++) {
      var a = old[i];
      if (now - Number(a.getAttribute('data-sarv-at') || 0) > 20 * 3600e3 && a.getAttribute('data-sarv-href')) {
        a.removeAttribute('data-sarv-at'); a.removeAttribute('data-sarv-out'); a.setAttribute('href', a.getAttribute('data-sarv-href'));   // fix() signs it again
      }
    }
  });

  // ── navigator.share / clipboard: links leave the ERP → 30-day links ──
  if (navigator.share) {
    var share0 = navigator.share.bind(navigator);
    navigator.share = function (data) {
      if (!data || !(hasFile(data.text) || hasFile(data.url))) return share0(data);
      return Promise.all([data.text ? signText(data.text, SHARE_SEC) : null, data.url ? signText(data.url, SHARE_SEC) : null])
        .then(function (r) { var d = Object.assign({}, data); if (r[0] != null) d.text = r[0]; if (r[1] != null) d.url = r[1]; return share0(d); });
    };
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    var clip0 = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = function (t) { return hasFile(t) ? signText(t, SHARE_SEC).then(clip0) : clip0(t); };
  }

  // ── <img> / <iframe> / … src and inline style url(...) ──
  var ATTR = { IMG: 'src', IFRAME: 'src', EMBED: 'src', SOURCE: 'src', VIDEO: 'src', AUDIO: 'src', OBJECT: 'data' };
  function fix(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.tagName === 'A') fixA(el);
    var a = ATTR[el.tagName];
    if (a) {
      var v = el.getAttribute(a), m = parse(v);
      if (m) sign(m, VIEW_SEC).then(function (u) { if (el.getAttribute(a) === v && u !== v) el.setAttribute(a, u); });
    }
    var st = el.getAttribute('style');
    if (st && st.indexOf('/object/public/') >= 0 && hasFile(st)) signText(st, VIEW_SEC).then(function (ns) { if (el.getAttribute('style') === st && ns !== st) el.setAttribute('style', ns); });
  }
  function fixTree(n) {
    if (!n || n.nodeType !== 1) return;
    fix(n);
    if (n.querySelectorAll) { var l = n.querySelectorAll('img,iframe,embed,source,video,audio,object,a[href],[style*="/object/public/"]'); for (var i = 0; i < l.length; i++) fix(l[i]); }
  }
  function startObs() {
    fixTree(document.documentElement);
    try {
      new MutationObserver(function (ms) {
        for (var i = 0; i < ms.length; i++) {
          var r = ms[i];
          if (r.type === 'attributes') fix(r.target);
          else for (var j = 0; j < r.addedNodes.length; j++) fixTree(r.addedNodes[j]);
        }
      }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data', 'style', 'href'] });
    } catch (e) {}
  }
  if (document.documentElement) startObs(); else document.addEventListener('DOMContentLoaded', startObs);
  // images made in code: img.src = link (new Image(), canvas / PDF builders)
  try {
    var d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (d && d.set && d.get) Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true, enumerable: d.enumerable,
      get: function () { return d.get.call(this); },
      set: function (v) {
        var m = parse(v), el = this;
        if (!m) return d.set.call(el, v);
        sign(m, VIEW_SEC).then(function (u) { d.set.call(el, u); });
      }
    });
  } catch (e) {}

  /* Console check: sarvFilesTest()  signs the newest file of sarv-pdfs and opens nothing; shows whether
     signing works for this login (needs SECURITY_PHASE3_MIGRATION.sql). */
  window.sarvFilesTest = function (link) {
    var t0 = Date.now();
    var go = function (u) {
      var m = parse(u);
      if (!m) { console.log('Not a file link of a private bucket: ' + u); return Promise.resolve('n/a'); }
      return sign(m, 60).then(function (su) {
        var ok = su !== u;
        return fetch0(su, { method: 'GET', headers: { Range: 'bytes=0-15' } }).then(function (r) {
          var msg = (ok ? 'SIGNED' : 'NOT signed (original link)') + ' in ' + (Date.now() - t0) + ' ms · download: HTTP ' + r.status + '\n' + su.slice(0, 160) + '…';
          console.log(msg); try { alert(msg); } catch (e) {}
          return msg;
        });
      });
    };
    if (link) return go(link);
    var img = document.querySelector('[data-sarv-test]');
    return go(img ? img.getAttribute('data-sarv-test') : BASE + '/object/public/sarv-pdfs/' + (prompt('A sarv-pdfs file path (e.g. inward/…/…_SINGLE.pdf), or give the whole link to sarvFilesTest(link):') || ''));
  };
})();

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
  var WRITE_RPC = /(save|delete|decide|done|undo|mark|^set_|_set_|_set$|patch|insert|update|create|login|logout|_ack|^ack|sync|claim|change|approve|reject|upload|import|lock|post_|grant|link|reset|signup|forgot|touch|activate|learn|add_|next_|verify|confirm|resolve|compute|_test|fetch_days|_done|_queue|send|register|notify|remind|cancel|release)/i;

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

/* ═══ APP SWITCH (2026-11-28) ═══
   ERP › Admin Panel › App Switch turns a whole app OFF / ON (app_settings 'app_off' = {KEY: {off, at, by, reason,
   jobs}}, written by app_switch_set in sql/APP_SWITCH_MIGRATION.sql with the Admin PIN; that RPC also pauses the
   app's server jobs and takes it out of the login app list). While an app is OFF, its page here:
     - sends NOTHING to this Supabase project: every fetch (tables, RPCs, storage, Edge Functions) is answered on the
       device with 503 {code:'APP_OFF'}, so its timers, lists and live re-reads cost the database nothing; a Realtime
       socket is refused (and one already open is closed);
     - shows a full-screen "switched off" card over the page (Back to Apps; inside an ERP iframe just the card);
     - comes back by itself when the Admin switches it ON (the page is reloaded once).
   An entry with  rpc  also stops those RPCs on EVERY page (Live Assist's la_* presence runs from every app page).
   The list is read at once when a page opens (tiny request, kept in localStorage sarv_app_off_v1 so the decision
   is made before the page's first request) and again every 60 s while the page is on screen.
   Installed LAST in this file, so it sees each request before every other wrapper (the APK cache too).
   APPS = the one registry: store-core.js (Admin Panel list) and launcher.html (tiles) read it via window.sarvAppSwitch.
   A new app page = one entry here (its launcher key, else an APP_ key of its own). launcher.html / index.html are
   never switched off (they host the switch). */
(function () {
  'use strict';
  if (window.sarvAppSwitch) return;
  var HOST = 'jdlzgjgxxjkjejkhvdij.supabase.co', K = 'sarv_app_off_v1', POLL = 60000;
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkbHpnamd4eGpramVqa2h2ZGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODUwMDcsImV4cCI6MjEwNTY2MTAwN30.ow4i6e78i-dGoJJh2-N4FX6EQE7f2FRQDgCMJHpxAWk';
  // [key, label, page (file, lower case, + optional #hash), rpc names it owns on every page]
  var APPS = [
    ['HOME_APPROVAL_APP', 'Mobile Approvals (PR / PO)', 'mobile.html'],
    ['HOME_COMPLAINT_APP', 'Complaints', 'complaint.html'],
    ['HOME_PACKING', 'Packing & Dispatch', 'packing.html'],
    ['HOME_ORDER_FORM', 'Order Form', 'order-form.html'],
    ['HOME_SHEET_LINKS', 'Google Sheet Links', 'google sheet links.html'],
    ['HOME_TASK_MANAGER', 'Task Manager', 'task_manager.html'],
    ['HOME_MY_REQUESTS', 'Track My Store Request', 'my-requests.html'],
    ['HOME_DISPATCH_REPORT', 'Dispatch Report', 'dispatch_report_interface.html'],
    ['HOME_HR_PAYROLL', 'HR & Payroll', 'hr-payroll.html'],
    ['HOME_UNLOADER', 'Unloader Supervisor', 'unloader.html'],
    ['HOME_ISSUER', 'Issue Supervisor', 'issuer.html'],
    ['HOME_ISSUE_BILL_CHECK', 'Issue Bill Check', 'bill-check.html#issue'],
    ['HOME_BILL_CHECK', 'Bill Check', 'bill-check.html'],
    ['HOME_YARN_UNLOADING', 'Yarn Unloading', 'yarn-unloading.html'],
    ['HOME_GATE1', 'Gate-1 (Unit-1)', 'gate_1.html'],
    ['HOME_GATE2', 'Gate-2 (Unit-2)', 'gate_2.html'],
    ['HOME_CATALOG_MAKER', 'Catalog Maker', 'catalog_maker.html'],
    ['HOME_EMISSION_LIVE', 'Stack Emission (Live)', 'emission-live.html'],
    ['HOME_SOLAR_LIVE', 'Solar Plant (Live)', 'solar-live.html'],
    ['HOME_AMAZON_BARCODE', 'Amazon Barcode', 'barcode.html'],
    ['HOME_WASTE_SALE', 'Waste Sale Entry', 'wasteentry.html'],
    ['HOME_FMS_TRACKING', 'FMS Tracking', 'fms-tracking.html'],
    ['HOME_PRICE_LIST', 'Price List', 'price_list_generator.html'],
    ['HOME_SOP_MASTER', 'SOP Master', 'sop.html#master'],
    ['APP_MY_SOPS', 'My SOPs', 'sop.html'],
    ['APP_NOTEPAD', 'My Notepad', 'notepad.html'],
    ['APP_LEAVE', 'Leave Approval', 'ios_leave_approval.html'],
    ['APP_LIVE_ASSIST', 'Live Assist (and its presence on every page)', 'live-assist.html', /^la_/],
    ['APP_FMS', 'FMS Builder / View / Task Tracker', 'fms.html'],
    ['APP_LOT_CARD', 'Lot Card Manager', 'lot-card-manager.html'],
    ['APP_PRINTING_LOT', 'Printing Lot Card', 'printing-lot.html'],
    ['APP_TRIMS', 'Trims & Packing Material', 'trims-manager.html']
  ].map(function (a) { var p = a[2].split('#'); return { key: a[0], label: a[1], page: a[2], file: p[0], hash: p[1] || '', rpc: a[3] || null }; });

  var cfg = {}, at = 0;
  try { var c0 = JSON.parse(localStorage.getItem(K) || 'null'); if (c0 && typeof c0.cfg === 'object' && c0.cfg) { cfg = c0.cfg; at = +c0.at || 0; } } catch (e) {}
  var offOf = function (k) { var v = cfg && cfg[k]; return v && v.off ? v : null; };

  // which registered app a URL / this page is: a #hash entry first (bill-check.html#issue before bill-check.html)
  function appOf(href) {
    var u; try { u = new URL(href, location.href); } catch (e) { return null; }
    var f = ''; try { f = decodeURIComponent(u.pathname.split('/').pop() || '').toLowerCase(); } catch (e) { f = String(u.pathname.split('/').pop() || '').toLowerCase(); }
    var h = String(u.hash || '').replace(/^#/, '').toLowerCase(), best = null;
    APPS.forEach(function (a) {
      if (a.file !== f) return;
      if (a.hash) { if (h.indexOf(a.hash) === 0) best = a; }
      else if (!best) best = a;
    });
    return best;
  }
  var PAGE = appOf(location.href);
  window.addEventListener('hashchange', function () { var p = appOf(location.href); if (p !== PAGE) { PAGE = p; apply(); } });

  // null = let it go; else the app whose switch stops it
  function stopper(url) {
    url = String(url || '');
    if (url.indexOf(HOST) < 0) return null;
    if (url.indexOf('/rest/v1/app_settings') >= 0 && url.indexOf('app_off') >= 0) return null;   // the switch's own read
    if (PAGE && offOf(PAGE.key)) return PAGE;
    var m = /\/rest\/v1\/rpc\/([A-Za-z0-9_]+)/.exec(url);
    if (m) for (var i = 0; i < APPS.length; i++) if (APPS[i].rpc && APPS[i].rpc.test(m[1]) && offOf(APPS[i].key)) return APPS[i];
    return null;
  }
  function refused(a) {
    var msg = a.label + ' is switched off by the Admin (ERP › Admin Panel › App Switch).';
    return new Response(JSON.stringify({ code: 'APP_OFF', message: msg, hint: msg, details: a.key, success: false, error: 'APP_OFF' }),
      { status: 503, statusText: 'App switched off', headers: { 'Content-Type': 'application/json', 'x-sarv-app-off': a.key } });
  }

  // ── fetch ──
  var inner = window.fetch ? window.fetch.bind(window) : null;
  if (inner) {
    window.fetch = function (input, init) {
      try {
        var a = stopper(typeof input === 'string' ? input : (input && input.url) || String(input));
        if (a) return Promise.resolve(refused(a));
      } catch (e) {}
      return inner(input, init);
    };
  }
  // ── XMLHttpRequest (a few libraries still use it) ──
  if (window.XMLHttpRequest) {
    var xo = XMLHttpRequest.prototype.open, xs = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__sarvUrl = u; return xo.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      if (stopper(this.__sarvUrl)) { var x = this; setTimeout(function () { try { x.abort(); } catch (e) {} }, 0); return; }
      return xs.apply(this, arguments);
    };
  }
  // ── Realtime: no new socket while off, the open ones closed when it goes off ──
  var OWS = window.WebSocket, socks = [];
  if (OWS) {
    var W = function (url, prot) {
      if (String(url || '').indexOf(HOST) >= 0 && PAGE && offOf(PAGE.key)) {
        var fake = { url: String(url), readyState: 3, protocol: '', extensions: '', bufferedAmount: 0, binaryType: 'blob',
          send: function () {}, close: function () {}, addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return false; },
          onopen: null, onclose: null, onerror: null, onmessage: null, CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 };
        setTimeout(function () { try { if (fake.onclose) fake.onclose({ code: 1000, reason: 'APP_OFF', wasClean: true }); } catch (e) {} }, 0);
        return fake;
      }
      var s = prot === undefined ? new OWS(url) : new OWS(url, prot);
      if (String(url).indexOf(HOST) >= 0) { socks.push(s); if (socks.length > 20) socks = socks.filter(function (x) { return x.readyState < 2; }); }
      return s;
    };
    W.prototype = OWS.prototype; W.CONNECTING = 0; W.OPEN = 1; W.CLOSING = 2; W.CLOSED = 3;
    window.WebSocket = W;
  }

  // ── the card over a switched-off page ──
  var card = null, shown = '';
  var escH = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); };
  function when(t) { var d = new Date(t); if (isNaN(d)) return ''; try { return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return d.toString(); } }
  function paintCard() {
    var a = PAGE, v = a && offOf(a.key);
    if (!v) { if (card) { card.remove(); card = null; } return; }
    if (!document.body) { document.addEventListener('DOMContentLoaded', paintCard, { once: true }); return; }
    if (card && !card.isConnected) { card = null; shown = ''; }   // the page rebuilt its body: put it back
    var sig = a.key + '|' + (v.at || '') + '|' + (v.reason || '');
    if (card && shown === sig) return;
    shown = sig;
    if (!card) {
      card = document.createElement('div');
      card.id = 'sarvAppOff'; card.setAttribute('data-no-caps', '1'); card.setAttribute('role', 'alertdialog'); card.setAttribute('aria-modal', 'true');
      card.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:16px;'
        + 'background:rgba(15,23,42,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);font:14px/1.45 -apple-system,"Segoe UI",system-ui,sans-serif;';
      // nothing under it can be clicked or typed into
      ['click', 'keydown', 'touchstart', 'submit'].forEach(function (ev) { card.addEventListener(ev, function (e) { if (!e.target.closest('[data-sarv-ok]')) e.stopPropagation(); }, true); });
      document.body.appendChild(card);
      try { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); } catch (e) {}   // no typing into a box under it
    }
    var top = window.top === window;
    card.innerHTML = '<div style="max-width:420px;width:100%;background:#fff;color:#0f172a;border-radius:16px;padding:22px 20px;box-shadow:0 20px 60px rgba(0,0,0,.35);text-align:center;">'
      + '<div style="width:52px;height:52px;margin:0 auto 10px;border-radius:50%;background:#fee2e2;color:#b91c1c;display:flex;align-items:center;justify-content:center;">'
      + '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v8"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/></svg></div>'
      + '<div style="font-weight:800;font-size:18px;margin-bottom:4px;">' + escH(a.label) + ' is switched off</div>'
      + '<div style="color:#475569;">The Admin has switched this app off for now. Nothing is read from or saved to the server while it is off.</div>'
      + (v.reason ? '<div style="margin-top:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;color:#334155;"><b>Reason:</b> ' + escH(v.reason) + '</div>' : '')
      + '<div style="margin-top:8px;font-size:12px;color:#94a3b8;">' + escH([v.by ? 'By ' + v.by : '', when(v.at)].filter(Boolean).join(' · ')) + '</div>'
      + '<div style="margin-top:6px;font-size:12px;color:#94a3b8;">It opens again by itself as soon as it is switched on.</div>'
      + (top ? '<a data-sarv-ok="1" href="launcher.html" style="display:inline-block;margin-top:14px;background:#0a84ff;color:#fff;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:10px;">Back to Apps</a>' : '')
      + '</div>';
  }
  function closeSocks() { socks.forEach(function (s) { try { if (s.readyState < 2) s.close(1000, 'APP_OFF'); } catch (e) {} }); socks = []; }

  var listeners = [], wasOff = !!(PAGE && offOf(PAGE.key));
  function apply() {
    var off = !!(PAGE && offOf(PAGE.key));
    if (off) closeSocks();
    paintCard();
    // switched back ON while this page was stopped: start it cleanly (its timers gave up meanwhile)
    if (wasOff && !off && PAGE) { wasOff = false; try { location.reload(); } catch (e) {} return; }
    wasOff = off;
    listeners.forEach(function (fn) { try { fn(cfg); } catch (e) {} });
  }

  var busy = false;
  function refresh() {
    if (busy || !inner) return Promise.resolve(cfg);
    busy = true;
    return inner('https://' + HOST + '/rest/v1/app_settings?key=eq.app_off&select=value', { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) {
        if (!Array.isArray(rows)) return cfg;               // an error answer never changes the switch
        var v = rows[0] && rows[0].value;
        var next = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
        var changed = JSON.stringify(next) !== JSON.stringify(cfg);
        cfg = next; at = Date.now();
        try { localStorage.setItem(K, JSON.stringify({ at: at, cfg: cfg })); } catch (e) {}
        if (changed) apply();
        return cfg;
      })
      .catch(function () { return cfg; })
      .then(function (x) { busy = false; return x; });
  }
  // another tab of this browser switched it (the Admin's own ERP tab): follow at once
  window.addEventListener('storage', function (e) {
    if (e.key !== K) return;
    try { var c = JSON.parse(e.newValue || 'null'); if (c && typeof c.cfg === 'object') { cfg = c.cfg || {}; at = +c.at || 0; apply(); } } catch (x) {}
  });

  window.sarvAppSwitch = {
    apps: APPS.map(function (a) { return { key: a.key, label: a.label, page: a.page }; }),
    page: function () { return PAGE ? PAGE.key : ''; },
    appOf: function (href) { var a = appOf(href); return a ? a.key : ''; },
    isOff: function (k) { return !!offOf(k); },
    entry: function (k) { return offOf(k); },
    cfg: function () { return cfg; },
    // the Admin Panel sets it right after a save, so this browser follows without waiting for the next read
    set: function (next) {
      cfg = (next && typeof next === 'object') ? next : {}; at = Date.now();
      try { localStorage.setItem(K, JSON.stringify({ at: at, cfg: cfg })); } catch (e) {}
      apply();
    },
    refresh: refresh,
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
  };

  if (wasOff) paintCard();
  refresh();
  setInterval(function () { if (document.visibilityState === 'visible') refresh(); }, POLL);
  setInterval(function () { if (PAGE && offOf(PAGE.key)) paintCard(); }, 3000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && Date.now() - at > 15000) refresh(); });
})();
