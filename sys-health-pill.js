/* ════════════════════════════════════════════════════════════════════
   SYSTEM HEALTH PILL (2026-11-27) — loaded by index.html (ERP) and launcher.html
   ────────────────────────────────────────────────────────────────────
   For an ADMIN login only: a small pill at the bottom left that keeps showing the database server's state
   (Memory %, Connections, and anything over its limit) so a coming freeze is seen before the apps stop.
   It reads public.sys_health(p_token, false) (sql/SYSTEM_HEALTH_MIGRATION.sql: the server decides who is an
   Admin; any other login gets NOT_ADMIN once, and the pill is never asked for again in that tab's session).
   Green = within the limits, amber = near one (80 %), red = over one. A tap opens the figures with
   "Open System Health" (ERP › Admin Panel › System Health, store-core.js sarvOpenSystemHealth) and a link to
   the Supabase Reports. Read every 60 s while the page is on screen; nothing inside an iframe.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__sarvHlPill || window.top !== window) return;
  window.__sarvHlPill = true;
  var URL_ = 'https://jdlzgjgxxjkjejkhvdij.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkbHpnamd4eGpramVqa2h2ZGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODUwMDcsImV4cCI6MjEwNTY2MTAwN30.ow4i6e78i-dGoJJh2-N4FX6EQE7f2FRQDgCMJHpxAWk';
  var EVERY = 60000, K_NO = 'sarv_hl_notadmin', el = null, pop = null, last = null, timer = null;
  var tok = function () { try { return localStorage.getItem('sarv_sso_token') || ''; } catch (e) { return ''; } };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function notAdmin(t) { try { return sessionStorage.getItem(K_NO) === t; } catch (e) { return false; } }

  function css() {
    if (document.getElementById('hlPillCss')) return;
    var s = document.createElement('style'); s.id = 'hlPillCss';
    s.textContent = '#hlPill{position:fixed;left:12px;bottom:12px;z-index:9000;display:flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;'
      + 'font:700 11.5px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;cursor:pointer;border:1px solid #bbf7d0;background:#f0fdf4;color:#166534;box-shadow:0 2px 8px rgba(15,23,42,.12);max-width:calc(100vw - 24px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
      + '#hlPill.warn{border-color:#fcd34d;background:#fffbeb;color:#92400e;}#hlPill.bad{border-color:#fca5a5;background:#fef2f2;color:#991b1b;}'
      + '#hlPill i{width:8px;height:8px;border-radius:50%;background:currentColor;flex:0 0 8px;}'
      + '#hlPop{position:fixed;left:12px;bottom:48px;z-index:9001;width:min(330px,calc(100vw - 24px));background:#fff;border:1px solid #e2e8f0;border-radius:12px;'
      + 'box-shadow:0 12px 32px rgba(15,23,42,.22);padding:12px;font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;}'
      + '#hlPop h4{margin:0 0 8px;font-size:13.5px;}#hlPop .r{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f1f5f9;font-size:12.5px;}'
      + '#hlPop .r b.bad{color:#b91c1c;}#hlPop .r b.warn{color:#b45309;}#hlPop .f{margin:6px 0;padding:6px 8px;border-radius:8px;background:#fef2f2;color:#991b1b;font-weight:700;font-size:12px;}'
      + '#hlPop .a{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;}#hlPop .a a,#hlPop .a button{flex:1;text-align:center;padding:7px 8px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;font-weight:700;font-size:12px;cursor:pointer;text-decoration:none;}'
      + '#hlPop .a .p{background:#1e3a8a;border-color:#1e3a8a;color:#fff;}'
      + '@media print{#hlPill,#hlPop{display:none!important;}}';
    document.head.appendChild(s);
  }
  // state of one figure against its limit: '' / warn (80 % of it) / bad
  function st(v, lim) { if (v == null || !lim) return ''; return v >= lim ? 'bad' : v >= lim * 0.8 ? 'warn' : ''; }
  function paint(d) {
    var f = d.fig || {}, L = d.limits || {}, flags = d.flags || [];
    var level = flags.length ? 'bad' : [st(f.memPct, L.mem), st(f.cpuPct, L.cpu), st(f.diskPct, L.disk), st(f.connPct, L.conns), st(f.swapPct, L.swap)]
      .indexOf('warn') >= 0 ? 'warn' : '';
    if (!el) { el = document.createElement('div'); el.id = 'hlPill'; el.setAttribute('role', 'button'); el.tabIndex = 0; el.addEventListener('click', toggle); document.body.appendChild(el); }
    el.className = level;
    var txt = flags.length ? flags[0].txt + (flags.length > 1 ? ' +' + (flags.length - 1) : '')
      : 'System OK · Mem ' + (f.memPct != null ? Math.round(f.memPct) + '%' : '—') + ' · Conn ' + (f.conns || 0) + '/' + (f.maxConn || '—');
    el.innerHTML = '<i></i><span>' + esc(txt) + '</span>';
    el.title = 'Database server status (Admin only). Tap for details.';
    if (pop) fillPop();
  }
  function row(l, v, s) { return '<div class="r"><span>' + esc(l) + '</span><b class="' + (s || '') + '">' + esc(v) + '</b></div>'; }
  function fillPop() {
    var d = last || {}, f = d.fig || {}, L = d.limits || {}, p = function (v) { return v == null ? '—' : (Math.round(v * 10) / 10) + '%'; };
    pop.innerHTML = '<h4>Database server</h4>'
      + (d.flags || []).map(function (x) { return '<div class="f">' + esc(x.txt) + '</div>'; }).join('')
      + row('Memory', p(f.memPct), st(f.memPct, L.mem)) + row('CPU', p(f.cpuPct), st(f.cpuPct, L.cpu))
      + row('Disk full', p(f.diskPct), st(f.diskPct, L.disk)) + row('Disk busy', p(f.ioPct), st(f.ioPct, L.io))
      + row('Connections', (f.conns || 0) + ' / ' + (f.maxConn || '—'), st(f.connPct, L.conns))
      + row('Longest query', (f.longestSec || 0) + ' s', st(f.longestSec, L.longSec))
      + row('Figures of', f.at ? new Date(f.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—')
      + '<div class="a">' + (window.sarvOpenSystemHealth ? '<button type="button" class="p" data-hl="open">Open System Health</button>' : '')
      + '<a href="https://supabase.com/dashboard/project/jdlzgjgxxjkjejkhvdij/reports/database" target="_blank" rel="noopener">Supabase Reports ↗</a></div>';
    var b = pop.querySelector('[data-hl="open"]');
    if (b) b.addEventListener('click', function () { close(); window.sarvOpenSystemHealth(); });
  }
  function toggle() { if (pop) return close(); pop = document.createElement('div'); pop.id = 'hlPop'; document.body.appendChild(pop); fillPop(); setTimeout(function () { document.addEventListener('click', outside, true); }, 0); }
  function close() { if (pop) { pop.remove(); pop = null; } document.removeEventListener('click', outside, true); }
  function outside(e) { if (pop && !pop.contains(e.target) && e.target !== el && !(el && el.contains(e.target))) close(); }
  function stop(t) { clearInterval(timer); timer = null; if (el) { el.remove(); el = null; } close(); try { if (t) sessionStorage.setItem(K_NO, t); } catch (e) {} }

  function read() {
    var t = tok();
    if (!t || notAdmin(t)) return stop();
    if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
    fetch(URL_ + '/rest/v1/rpc/sys_health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON },
      body: JSON.stringify({ p_token: t, p_full: false })
    }).then(function (r) { return r.ok ? r.json() : (r.status === 404 ? { success: false, error: 'NO_MIGRATION' } : null); })
      .then(function (d) {
        if (!d) return;   // a passing network / server error: keep the last state, try again next minute
        if (d.success === false) {
          // not an Admin (or no server function yet): this tab never asks again; a session error: stop quietly
          if (d.error === 'NOT_ADMIN' || d.error === 'NO_MIGRATION') stop(t); else stop();
          return;
        }
        last = d; css(); paint(d);
      }).catch(function () { /* offline / server down: the pill keeps its last colour */ if (el) el.title = 'Could not reach the server just now'; });
  }
  function start() {
    setTimeout(read, 4000);
    timer = setInterval(read, EVERY);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') read(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
