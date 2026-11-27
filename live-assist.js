/* ════════════════════════════════════════════════════════════════════════════
   live-assist.js — Admin Live Assist, the USER side (loaded by every app page, after upload-guard.js)
   ────────────────────────────────────────────────────────────────────────────
   Server: sql/LIVE_ASSIST_MIGRATION.sql (la_* RPCs). The Admin's viewer: live-assist.html.

   What it does on every ERP page (top window only, never inside an ERP iframe, never on live-assist.html):
     1. PRESENCE: la_touch every LA_POLL_MS (5 s on screen, 15 s while the page is hidden) says "this tab is
        open on this page". One browser tab = one tab id (sessionStorage, so it stays while the user moves from
        page to page in that tab; a copied tab gets its own id, see tabId()).
     2. CONSENT: when the Admin asks to see this tab, la_touch returns the request and a box asks the user:
        Allow / Deny (la_decide). Nothing is sent before Allow. Not answered in 2 minutes = expired (server).
     3. LIVE: after Allow the page is streamed as rrweb DOM events (rrweb@1.1.3 from jsDelivr, loaded only now)
        over Supabase Realtime broadcast on the session's random channel (supabase-js 2.45.4, its own client,
        no login on it). Batches every LA_FLUSH_MS, gzip (CompressionStream) + base64 when the browser has it,
        cut into LA_CHUNK pieces. The Admin's "hello" restarts the recording = a fresh full snapshot.
        PIN / password / OTP boxes are BLOCKED (class rr-block: the Admin sees an empty box and none of the
        typing, checked again at typing time); this script's own boxes are blocked too.
        While live a red bar stays on the screen: "Admin <name> is viewing your screen" + Stop (la_cancel).
        Moving to another page in the same tab carries on by itself (la_touch returns the live session).
     4. POINT / HIGHLIGHT from the Admin: a pulsing dot at the point, a red frame around the element there
        (followed while it moves / scrolls, for LA_HL_MS), a drawn box, a message bubble with OK, Clear.
   Inside an ERP iframe only the PIN blocking runs (the top window's recording includes same-origin iframes).
   Without the migration la_touch fails quietly and nothing is shown.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';
    if (window.__sarvLiveAssist) return;
    window.__sarvLiveAssist = true;

    var LA_URL  = 'https://jdlzgjgxxjkjejkhvdij.supabase.co';
    var LA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkbHpnamd4eGpramVqa2h2ZGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODUwMDcsImV4cCI6MjEwNTY2MTAwN30.ow4i6e78i-dGoJJh2-N4FX6EQE7f2FRQDgCMJHpxAWk';
    var LIB_RRWEB = 'https://cdn.jsdelivr.net/npm/rrweb@1.1.3/dist/rrweb.min.js';
    var LIB_SB    = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4';
    // SYNC SPEED (Admin Panel › System Health): presence of every open tab, the biggest steady load; default 5 s (hidden tab x3)
    var LA_POLL_MS = (window.sarvSyncMs ? sarvSyncMs('live_assist', 5000) : 5000), LA_POLL_HIDDEN_MS = Math.max(15000, LA_POLL_MS * 3), LA_FLUSH_MS = 250, LA_CHUNK = 90000, LA_HL_MS = 12000;

    // ── PIN / password boxes never reach the Admin (every page, iframes too) ──
    var PIN_RE = /(^|[^a-z])(pin|pins|pwd|otp|passcode)([^a-z]|$)|passw|secret/i;
    function isSecretBox(el) {
        if (!el || el.tagName !== 'INPUT') return false;
        var t = String(el.type || '').toLowerCase();
        if (t === 'password') return true;
        var words = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.getAttribute('autocomplete'), el.getAttribute('data-pin')]
            .filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g, '$1 $2');
        return PIN_RE.test(words) || el.hasAttribute('data-pin');
    }
    function maskEl(el) { if (isSecretBox(el) && !el.classList.contains('rr-block')) el.classList.add('rr-block'); }
    function maskTree(n) {
        if (!n || n.nodeType !== 1) return;
        if (n.tagName === 'INPUT') maskEl(n);
        else if (n.querySelectorAll) { var l = n.querySelectorAll('input'); for (var i = 0; i < l.length; i++) maskEl(l[i]); }
    }
    document.addEventListener('focusin', function (e) { maskEl(e.target); }, true);
    function startMask() {
        maskTree(document.documentElement);
        try {
            new MutationObserver(function (ms) {
                for (var i = 0; i < ms.length; i++) {
                    var m = ms[i];
                    if (m.type === 'attributes') maskEl(m.target);
                    else for (var j = 0; j < m.addedNodes.length; j++) maskTree(m.addedNodes[j]);
                }
            }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['type', 'name', 'placeholder'] });
        } catch (e) {}
    }
    if (document.documentElement) startMask(); else document.addEventListener('DOMContentLoaded', startMask);

    var inFrame = false;
    try { inFrame = window.top !== window; } catch (e) { inFrame = true; }
    if (inFrame || /live-assist\.html$/i.test(location.pathname)) return;   // the Admin's own viewer is never streamed

    function token() { try { return localStorage.getItem('sarv_sso_token') || ''; } catch (e) { return ''; } }
    function rnd() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

    /* One id per browser TAB. sessionStorage keeps it from page to page in the tab; a tab opened as a copy gets
       the same sessionStorage, so every page also beats a small map in localStorage and takes a new id when
       another page that is still alive already holds this one. */
    var NONCE = rnd();
    function tabId() {
        var id = '';
        try { id = sessionStorage.getItem('sarv_la_tab') || ''; } catch (e) {}
        var map = {};
        try { map = JSON.parse(localStorage.getItem('sarv_la_tabs') || '{}') || {}; } catch (e) {}
        var now = Date.now();
        Object.keys(map).forEach(function (k) { if (!map[k] || now - map[k].t > 15000) delete map[k]; });
        // a page leaving the tab takes its entry out (pagehide below), so a live entry here = a copied tab
        if (!id || (map[id] && map[id].n !== NONCE && now - map[id].t < 8000)) id = 'T' + rnd();
        try { sessionStorage.setItem('sarv_la_tab', id); } catch (e) {}
        map[id] = { n: NONCE, t: now };
        try { localStorage.setItem('sarv_la_tabs', JSON.stringify(map)); } catch (e) {}
        return id;
    }
    var TAB = tabId();
    setInterval(function () {
        try {
            var map = JSON.parse(localStorage.getItem('sarv_la_tabs') || '{}') || {};
            map[TAB] = { n: NONCE, t: Date.now() };
            localStorage.setItem('sarv_la_tabs', JSON.stringify(map));
        } catch (e) {}
    }, 4000);
    window.addEventListener('pagehide', function () {
        try {
            var map = JSON.parse(localStorage.getItem('sarv_la_tabs') || '{}') || {};
            if (map[TAB] && map[TAB].n === NONCE) { delete map[TAB]; localStorage.setItem('sarv_la_tabs', JSON.stringify(map)); }
        } catch (e) {}
    });

    function device() {
        var w = window.innerWidth || 0;
        return (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? (w < 768 ? 'Phone' : 'Tablet') : 'PC') + ' ' + w + 'x' + (window.innerHeight || 0);
    }
    function pageName() { return (location.pathname.split('/').pop() || 'index.html') + (location.hash ? location.hash.slice(0, 40) : ''); }

    function rpc(fn, args) {
        // la_* write RPCs say touch / decide / cancel in their names, so offline-sync.js never replays them
        return fetch(LA_URL + '/rest/v1/rpc/' + fn, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: LA_ANON, Authorization: 'Bearer ' + LA_ANON },
            body: JSON.stringify(args)
        }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    }

    function loadScript(src, test) {
        if (test()) return Promise.resolve();
        return new Promise(function (ok, bad) {
            var s = document.createElement('script');
            s.src = src; s.async = true;
            s.onload = function () { test() ? ok() : bad(new Error('not loaded: ' + src)); };
            s.onerror = function () { bad(new Error('not loaded: ' + src)); };
            document.head.appendChild(s);
        });
    }

    // ── own UI: one 0x0 fixed host, BLOCKED in the recording (the Admin's view never shows it) ──
    var HOST = null;
    function host() {
        if (HOST && HOST.isConnected) return HOST;
        HOST = document.createElement('div');
        HOST.id = 'la-host';
        HOST.className = 'rr-block';
        HOST.setAttribute('data-no-caps', '');
        HOST.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:visible;z-index:2147483646;';
        if (!document.getElementById('la-css')) {
            var st = document.createElement('style');
            st.id = 'la-css';
            st.textContent =
                '#la-host *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}' +
                '#la-host .la-scrim{position:fixed;inset:0;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center;padding:16px;}' +
                '#la-host .la-card{background:#fff;color:#111;border-radius:16px;max-width:380px;width:100%;padding:18px 18px 14px;box-shadow:0 18px 50px rgba(0,0,0,.3);}' +
                '#la-host .la-card h3{margin:0 0 8px;font-size:17px;font-weight:800;}' +
                '#la-host .la-card p{margin:0 0 8px;font-size:13.5px;line-height:1.45;color:#333;}' +
                '#la-host .la-card .la-note{background:#f2f2f7;border-radius:10px;padding:8px 10px;font-size:13px;color:#111;}' +
                '#la-host .la-card small{display:block;font-size:11.5px;color:#6b7280;margin-top:6px;}' +
                '#la-host .la-row{display:flex;gap:8px;margin-top:14px;}' +
                '#la-host .la-btn{flex:1;border:0;border-radius:11px;padding:11px 12px;font-size:14px;font-weight:800;cursor:pointer;}' +
                '#la-host .la-yes{background:#0a84ff;color:#fff;}#la-host .la-no{background:#e9e9ee;color:#111;}' +
                '#la-host .la-bar{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);display:flex;align-items:center;gap:10px;' +
                'background:#d70015;color:#fff;border-radius:999px;padding:7px 8px 7px 14px;font-size:12.5px;font-weight:700;box-shadow:0 6px 20px rgba(0,0,0,.28);max-width:calc(100vw - 24px);}' +
                '#la-host .la-bar .la-dot{width:9px;height:9px;border-radius:50%;background:#fff;animation:laBlink 1.2s infinite;flex:0 0 auto;}' +
                '#la-host .la-bar span.t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
                '#la-host .la-bar button{border:0;border-radius:999px;background:#fff;color:#d70015;font-weight:800;font-size:12px;padding:6px 12px;cursor:pointer;flex:0 0 auto;}' +
                '@keyframes laBlink{50%{opacity:.25}}' +
                '#la-host .la-ping{position:fixed;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:rgba(255,59,48,.9);box-shadow:0 0 0 3px #fff;pointer-events:none;}' +
                '#la-host .la-ping::after{content:"";position:absolute;inset:-6px;border-radius:50%;border:3px solid rgba(255,59,48,.8);animation:laRing 1.1s ease-out infinite;}' +
                '@keyframes laRing{from{transform:scale(.6);opacity:1}to{transform:scale(2.6);opacity:0}}' +
                '#la-host .la-hl{position:fixed;border:3px solid #ff3b30;border-radius:8px;box-shadow:0 0 0 4px rgba(255,59,48,.25),0 0 18px rgba(255,59,48,.55);pointer-events:none;transition:all .12s;}' +
                '#la-host .la-box{position:fixed;border:3px dashed #ff9500;background:rgba(255,149,0,.12);border-radius:6px;pointer-events:none;}' +
                '#la-host .la-tag{position:fixed;background:#ff3b30;color:#fff;font-size:11px;font-weight:800;padding:2px 7px;border-radius:6px;pointer-events:none;white-space:nowrap;}' +
                '#la-host .la-msg{position:fixed;left:50%;top:14px;transform:translateX(-50%);width:min(420px,calc(100vw - 24px));background:#111;color:#fff;border-radius:14px;' +
                'padding:12px 14px;box-shadow:0 12px 34px rgba(0,0,0,.35);font-size:14px;line-height:1.4;}' +
                '#la-host .la-msg b{display:block;font-size:11.5px;color:#ffb4ae;margin-bottom:3px;}' +
                '#la-host .la-msg button{margin-top:9px;border:0;border-radius:9px;background:#fff;color:#111;font-weight:800;padding:6px 14px;cursor:pointer;}';
            document.head.appendChild(st);
        }
        (document.body || document.documentElement).appendChild(HOST);
        return HOST;
    }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    // ── state ──
    var LA = { ended: {}, asked: {}, ask: null, live: null, sb: null, ch: null, stop: null, q: [], timer: null, seq: 0, chain: Promise.resolve(), starting: false };

    // ── 2. consent ──
    function showAsk(ask) {
        if (LA.asked[ask.id]) return;
        LA.asked[ask.id] = 1; LA.ask = ask;
        var h = host(), box = document.createElement('div');
        box.className = 'la-scrim'; box.id = 'la-ask';
        box.innerHTML = '<div class="la-card" role="dialog" aria-modal="true">' +
            '<h3>Screen view request</h3>' +
            '<p><b>' + esc(ask.admin || 'Admin') + '</b> (Admin) aapki is ERP screen ko live dekhna chahte hain, taaki help kar sakein. Woh screen par point / highlight bhi kar sakte hain.</p>' +
            (ask.note ? '<div class="la-note">' + esc(ask.note) + '</div>' : '') +
            '<small>Sirf ye ERP page dikhega (PIN / password nahi). Aap kabhi bhi Stop daba kar band kar sakte hain.</small>' +
            '<div class="la-row"><button type="button" class="la-btn la-no">Deny</button><button type="button" class="la-btn la-yes">Allow</button></div></div>';
        h.appendChild(box);
        var answer = function (allow) {
            box.remove(); LA.ask = null;
            rpc('la_decide', { p_token: token(), p_id: ask.id, p_tab: TAB, p_allow: allow }).then(function (d) {
                if (allow && d && d.success && d.channel) startLive({ id: ask.id, admin: d.admin || ask.admin, channel: d.channel });
                else if (allow && d && d.error === 'NOT_PENDING') toast('The request has ended (' + (d.status || '') + ').');
            });
        };
        box.querySelector('.la-yes').onclick = function () { answer(true); };
        box.querySelector('.la-no').onclick = function () { answer(false); };
        try { if (navigator.vibrate) navigator.vibrate([120, 80, 120]); } catch (e) {}
    }
    function dropAsk() { var b = document.getElementById('la-ask'); if (b) b.remove(); LA.ask = null; }
    function toast(t) {
        var h = host(), m = document.createElement('div');
        m.className = 'la-msg'; m.innerHTML = esc(t);
        h.appendChild(m); setTimeout(function () { m.remove(); }, 4000);
    }

    // ── 3. live stream ──
    function paintBar() {
        var h = host(), bar = document.getElementById('la-bar');
        if (!LA.live) { if (bar) bar.remove(); return; }
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'la-bar'; bar.className = 'la-bar';
            h.appendChild(bar);
        }
        bar.innerHTML = '<span class="la-dot"></span><span class="t">' + esc(LA.live.admin || 'Admin') + ' (Admin) is viewing your screen</span><button type="button">Stop</button>';
        bar.querySelector('button').onclick = function () {
            var id = LA.live && LA.live.id;
            if (id) LA.ended[id] = 1;
            send('end', { by: 'user' });
            stopLive();
            if (id) rpc('la_cancel', { p_token: token(), p_id: id, p_reason: 'Stopped by the user' });
        };
    }
    function send(event, payload) {
        if (!LA.ch) return Promise.resolve();
        var ch = LA.ch;
        LA.chain = LA.chain.then(function () { return ch.send({ type: 'broadcast', event: event, payload: payload }); }).catch(function () {});
        return LA.chain;
    }
    function b64(buf) {
        var b = new Uint8Array(buf), s = '', step = 0x8000;
        for (var i = 0; i < b.length; i += step) s += String.fromCharCode.apply(null, b.subarray(i, i + step));
        return btoa(s);
    }
    function pack(str) {
        if (str.length < 2000 || typeof CompressionStream === 'undefined') return Promise.resolve({ z: 0, d: str });
        try {
            var cs = new CompressionStream('gzip');
            return new Response(new Blob([str]).stream().pipeThrough(cs)).arrayBuffer()
                .then(function (buf) { return { z: 1, d: b64(buf) }; })
                .catch(function () { return { z: 0, d: str }; });
        } catch (e) { return Promise.resolve({ z: 0, d: str }); }
    }
    function flush() {
        LA.timer = null;
        if (!LA.q.length || !LA.ch) return;
        var evs = LA.q.splice(0), str;
        try { str = JSON.stringify(evs); } catch (e) { return; }
        var b = ++LA.seq;
        LA.chain = LA.chain.then(function () {
            return pack(str).then(function (p) {
                var n = Math.max(1, Math.ceil(p.d.length / LA_CHUNK)), go = Promise.resolve();
                for (var i = 0; i < n; i++) (function (i) {
                    go = go.then(function () {
                        return LA.ch && LA.ch.send({ type: 'broadcast', event: 'ev', payload: { b: b, i: i, n: n, z: p.z, d: p.d.slice(i * LA_CHUNK, (i + 1) * LA_CHUNK) } });
                    });
                })(i);
                return go;
            });
        }).catch(function () {});
    }
    function emit(e) {
        LA.q.push(e);
        if (!LA.timer) LA.timer = setTimeout(flush, LA_FLUSH_MS);
    }
    function recStart() {
        if (LA.stop) { try { LA.stop(); } catch (e) {} LA.stop = null; }
        LA.q = [];
        maskTree(document.documentElement);
        try {
            LA.stop = window.rrweb.record({
                emit: emit,
                blockClass: 'rr-block',
                maskInputOptions: { password: true },
                sampling: { mousemove: 100, scroll: 150, input: 'last' },
                slimDOMOptions: true,
                recordCanvas: false,
                collectFonts: false
            });
        } catch (e) { console.warn('[Live Assist] record failed', e); }
        send('ack', { page: pageName(), title: document.title, dev: device() });
    }
    function startLive(live) {
        if (LA.ended[live.id]) return;
        if (LA.live && LA.live.id === live.id && LA.ch) return;
        if (LA.starting) return;
        stopLive(true);
        LA.live = live; LA.starting = true;
        paintBar();
        Promise.all([
            loadScript(LIB_RRWEB, function () { return !!(window.rrweb && window.rrweb.record); }),
            loadScript(LIB_SB, function () { return !!(window.supabase && window.supabase.createClient); })
        ]).then(function () {
            if (!LA.live || LA.live.id !== live.id) return;
            if (!LA.sb) LA.sb = window.supabase.createClient(LA_URL, LA_ANON, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'sarv-la-auth' } });
            var ch = LA.sb.channel(live.channel, { config: { broadcast: { self: false, ack: false } } });
            ch.on('broadcast', { event: 'hello' }, function () { recStart(); })
              .on('broadcast', { event: 'point' }, function (m) { drawPoint(m.payload || {}); })
              .on('broadcast', { event: 'box' }, function (m) { drawBox(m.payload || {}); })
              .on('broadcast', { event: 'msg' }, function (m) { drawMsg(m.payload || {}); })
              .on('broadcast', { event: 'clear' }, function () { clearInk(); })
              .on('broadcast', { event: 'end' }, function () {
                  // closed on the server too (the Admin's page may have gone before its own la_cancel), so the next la_touch does not start it again
                  LA.ended[live.id] = 1;
                  rpc('la_cancel', { p_token: token(), p_id: live.id, p_reason: 'Ended by the Admin' });
                  stopLive(); toast('The Admin has ended the screen view.');
              });
            ch.subscribe(function (status) {
                if (status === 'SUBSCRIBED') { LA.ch = ch; recStart(); }
            });
            LA.chRaw = ch;
        }).catch(function (e) {
            console.warn('[Live Assist] could not start', e);
        }).then(function () { LA.starting = false; });
    }
    function stopLive(quiet) {
        if (LA.stop) { try { LA.stop(); } catch (e) {} LA.stop = null; }
        if (LA.timer) { clearTimeout(LA.timer); LA.timer = null; }
        LA.q = [];
        var ch = LA.chRaw;
        LA.ch = null; LA.chRaw = null;
        if (ch && LA.sb) { try { LA.sb.removeChannel(ch); } catch (e) {} }
        LA.live = null;
        clearInk();
        if (!quiet) paintBar(); else { var bar = document.getElementById('la-bar'); if (bar) bar.remove(); }
    }

    // ── 4. point / highlight / box / message ──
    var INK = [];
    function ink(el, ms) {
        host().appendChild(el); INK.push(el);
        if (ms) setTimeout(function () { el.remove(); INK = INK.filter(function (x) { return x !== el; }); }, ms);
        return el;
    }
    function clearInk() { INK.forEach(function (el) { el.remove(); }); INK = []; }
    function nodeById(id) {
        var r = window.rrweb, m = r && (r.mirror || (r.record && r.record.mirror));
        try {
            if (m && m.getNode) return m.getNode(id) || null;
            if (m && m.map) return m.map[id] || null;
        } catch (e) {}
        return null;
    }
    // An element's box on THIS screen (an element inside an ERP iframe adds the iframe's place)
    function rectOf(el) {
        var r = el.getBoundingClientRect(), x = r.left, y = r.top;
        try {
            var w = el.ownerDocument && el.ownerDocument.defaultView;
            while (w && w !== window && w.frameElement) {
                var fr = w.frameElement.getBoundingClientRect();
                x += fr.left; y += fr.top; w = w.parent;
            }
        } catch (e) {}
        return { left: x, top: y, width: r.width, height: r.height };
    }
    function drawPoint(p) {
        clearInk();
        var x = Number(p.x) || 0, y = Number(p.y) || 0;
        var el = p.id ? nodeById(p.id) : null;
        if (el && el.nodeType === 1 && el.getBoundingClientRect) {
            var hl = ink(document.createElement('div'), LA_HL_MS);
            hl.className = 'la-hl';
            var tag = ink(document.createElement('div'), LA_HL_MS);
            tag.className = 'la-tag'; tag.textContent = (p.label || 'Admin') + (p.msg ? ': ' + p.msg : '');
            var t0 = Date.now();
            (function follow() {
                if (!hl.isConnected) return;
                var r = rectOf(el);
                hl.style.left = (r.left - 4) + 'px'; hl.style.top = (r.top - 4) + 'px';
                hl.style.width = (r.width + 8) + 'px'; hl.style.height = (r.height + 8) + 'px';
                tag.style.left = Math.max(4, r.left - 4) + 'px'; tag.style.top = Math.max(4, r.top - 26) + 'px';
                if (Date.now() - t0 < LA_HL_MS) requestAnimationFrame(follow);
            })();
            var r0 = rectOf(el);
            if (r0.top > window.innerHeight || r0.top + r0.height < 0) { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }
        }
        var dot = ink(document.createElement('div'), 6000);
        dot.className = 'la-ping'; dot.style.left = x + 'px'; dot.style.top = y + 'px';
        try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {}
    }
    function drawBox(p) {
        var b = ink(document.createElement('div'), 20000);
        b.className = 'la-box';
        b.style.left = (Number(p.x) || 0) + 'px'; b.style.top = (Number(p.y) || 0) + 'px';
        b.style.width = Math.max(6, Number(p.w) || 0) + 'px'; b.style.height = Math.max(6, Number(p.h) || 0) + 'px';
        if (p.msg) {
            var tag = ink(document.createElement('div'), 20000);
            tag.className = 'la-tag'; tag.textContent = p.msg;
            tag.style.left = (Number(p.x) || 0) + 'px'; tag.style.top = Math.max(4, (Number(p.y) || 0) - 24) + 'px';
        }
    }
    function drawMsg(p) {
        var old = document.getElementById('la-msgbox'); if (old) old.remove();
        var m = document.createElement('div');
        m.className = 'la-msg'; m.id = 'la-msgbox';
        m.innerHTML = '<b>' + esc((LA.live && LA.live.admin) || 'Admin') + ' (Admin)</b>' + esc(p.text || '') + '<br><button type="button">OK</button>';
        host().appendChild(m);
        m.querySelector('button').onclick = function () { m.remove(); send('msgok', { at: Date.now() }); };
        setTimeout(function () { if (m.isConnected) m.remove(); }, 45000);
        try { if (navigator.vibrate) navigator.vibrate([80, 60, 80]); } catch (e) {}
    }

    // ── 1. presence + polling ──
    var busy = false, lastPoll = 0;
    function poll() {
        if (busy) return;
        var tok = token();
        if (!tok) { if (LA.live) stopLive(); return; }
        var visible = document.visibilityState !== 'hidden';
        if (!visible && Date.now() - lastPoll < LA_POLL_HIDDEN_MS && !LA.live) return;
        busy = true; lastPoll = Date.now();
        rpc('la_touch', { p_token: tok, p_tab: TAB, p_page: pageName(), p_title: String(document.title || '').slice(0, 200), p_visible: visible, p_device: device() })
            .then(function (d) {
                if (!d || d.success === false) return;
                if (d.ask && !LA.live) showAsk(d.ask);
                else if (!d.ask && LA.ask) dropAsk();
                if (d.live && d.live.channel) startLive(d.live);
                else if (!d.live && LA.live && !LA.starting) { stopLive(); toast('The screen view has ended.'); }
            })
            .then(function () { busy = false; }, function () { busy = false; });
    }
    setTimeout(poll, 1500);
    setInterval(poll, LA_POLL_MS);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') poll(); });
    window.addEventListener('resize', function () { if (LA.ch) send('ack', { page: pageName(), title: document.title, dev: device() }); });
})();
