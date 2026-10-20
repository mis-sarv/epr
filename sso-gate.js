/* ════════════════════════════════════════════════════════════════════════
   sso-gate.js: the ONE entry point for every app
   ════════════════════════════════════════════════════════════════════════

   Each app used to have its own login:
     packing.html   → its own username + password (packing.profiles)
     complaint.html → its own Supabase Auth login + signup (cmp_profiles)
     order-form.html→ its own name + PIN (sales_login / sales_users)

   Three logins, three user lists, three answers to "who is this?". That is
   where all the confusion came from: a person had access ON in the ERP but
   no account in the app, or nobody remembered the app's password, or the
   same person sat in two lists under two names.

   Now there is ONE way in: `launcher.html`. Each app only asks "is there an
   ERP session, and does it have access to this app?" and nothing more. With
   no session the app does NOT show a login of its own; it sends the user
   straight to the launcher. Logout always goes back to the launcher too:
   one login, one place to log out.

   This file never builds a login form. The only screen it shows explains
   the REASON (and whose job it is to fix: the user's or the Admin's),
   because there is no other way in from here.

   ── Usage ───────────────────────────────────────────────────────────────
     <script src="sso-preboot.js"></script>   <!-- first, to stop the flash -->
     <script src="sso-gate.js"></script>

     const u = await SARV_GATE.boot({
       url: SUPABASE_URL, key: SUPABASE_ANON_KEY,
       app: 'HOME_PACKING', label: 'Packing & Dispatch',
       client: supabaseClient,        // only needed with needAuth
       needAuth: true,                // Complaint / Packing: yes
       accountKey: 'pk_profile_id'    // the user must have an account in that app
     });

   `boot()` resolves only when the user may really enter. In every other
   case it redirects to the launcher or shows the reason screen, and its
   promise NEVER resolves, so the caller never has to handle a failure.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SSO_KEY  = 'sarv_sso_token';
  var LAUNCHER = 'launcher.html';

  /* App-local session keys. These must be cleared on logout and whenever the
     gate refuses entry; otherwise an old localStorage session could bypass
     the gate (this is exactly what used to happen in packing.html). */
  var LOCAL_KEYS = ['erpPackingAppSession', 'sihf_sb_token', 'sihf_erp_sso_msg'];

  /* Reason → message. Anything the user can fix is addressed to the user;
     anything that is the Admin's job says so plainly. "Something went
     wrong" helps nobody. */
  var WHY = {
    NO_TOKEN:        'You did not come from the Apps page. Please log in there.',
    NO_SESSION:      'Your ERP session was not found on the server. Please log in again.',
    SESSION_REVOKED: 'This session has ended. Only one login is allowed at a time, so logging in somewhere else (another phone or desktop) closes this one.',
    SESSION_EXPIRED: 'Your session has expired. Please log in again.',
    USER_INACTIVE:   'Your account is inactive. Please contact the Admin.',
    NO_APP_ACCESS:   'This app is turned off for your login. Ask the Admin to switch it <b>ON</b> under <i>Master Data › Settings › Admin Panel › Users › Apps</i>.',
    NO_APP_ACCOUNT:  'No account exists for you in this app yet. Admin: open <i>Users</i>, edit this user, set this app to <b>ON</b> (not auto) under <i>Apps</i> and Save. The account is created automatically.',
    NO_AUTH_USER:    'Your Supabase Auth account was not found. Admin: under <i>Users › Apps</i>, switch this app OFF, Save, then switch it ON again.',
    AUTH_ACCOUNT_TAKEN: 'There are two ERP entries under your name and the account is linked to the other one. Admin: merge them with <code>sql/MERGE_DUPLICATE_USERS.sql</code>.',
    FN_MISSING:      'The SSO Edge Function (<code>erp-sso</code>) is not deployed on the server. Admin: <code>supabase functions deploy erp-sso</code>',
    FN_FAIL:         'The SSO Edge Function returned an error. Please show this screen to the Admin.',
    OTP_FAIL:        'The login token was rejected. Please try once more.',
    PROFILE_READ:    'Your profile could not be read (no auth session was created). Please show this screen to the Admin.',
    RPC_HTTP:        'The server is not responding (<code>erp_app_session</code>). Admin: check the migration and the schema cache.',
    NET:             'Could not reach the server. Please check the internet connection or firewall.',
    UNKNOWN:         'Could not sign you in.'
  };

  /* When the only fix is "log in again", a reason screen adds nothing, so we
     go straight to the launcher. The other reasons (access, account, setup)
     get a screen, because going to the launcher would only repeat them. */
  var SEND_TO_LAUNCHER = {
    NO_TOKEN: 1, NO_SESSION: 1, SESSION_REVOKED: 1, SESSION_EXPIRED: 1
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[<>&]/g, function (c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c];
    });
  }

  function prebootDone() {
    if (window.sarvSsoPrebootDone) window.sarvSsoPrebootDone();
  }

  function clearLocal() {
    try { LOCAL_KEYS.forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
  }

  function tokenGet() {
    try { return localStorage.getItem(SSO_KEY) || ''; } catch (e) { return ''; }
  }

  /* `replace` on purpose (not `href`): pressing Back must not return the
     user to the app that just sent them away. */
  function goLauncher(why) {
    clearLocal();
    try { localStorage.removeItem(SSO_KEY); } catch (e) {}
    prebootDone();
    location.replace(LAUNCHER + (why ? '?why=' + encodeURIComponent(why) : ''));
  }

  var shown = false;
  function panel(appLabel, why, detail, opts) {
    if (shown) return;
    shown = true;
    clearLocal();
    prebootDone();
    opts = opts || {};
    var d = document.createElement('div');
    d.id = 'sarvGatePanel';
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0f172a;color:#fff;'
      + 'display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;'
      + "font-family:'Segoe UI',system-ui,-apple-system,sans-serif;";
    d.innerHTML = '<div style="max-width:460px;">'
      + '<div style="font-size:46px;line-height:1;margin-bottom:14px;">' + (opts.icon || '') + '</div>'
      + '<h2 style="margin:0 0 8px;font-size:18px;font-weight:800;">' + esc(appLabel) + '</h2>'
      + '<p style="margin:0 0 16px;font-size:13px;line-height:1.7;color:#cbd5e1;">'
      + (WHY[why] || WHY.UNKNOWN) + '</p>'
      + '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">'
      + '<button type="button" id="sarvGateBack" style="background:#0ea5e9;border:none;color:#fff;'
      + 'border-radius:8px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">'
      + '&larr; Back to Apps</button>'
      + '<button type="button" id="sarvGateRetry" style="background:transparent;border:1px solid #475569;'
      + 'color:#cbd5e1;border-radius:8px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">'
      + 'Try again</button></div>'
      + '<p style="margin:16px 0 0;font-size:10.5px;color:#64748b;line-height:1.6;">wajah: '
      + esc(why) + (detail ? ' — ' + esc(detail) : '') + '</p>'
      + '</div>';
    (document.body || document.documentElement).appendChild(d);
    var b = document.getElementById('sarvGateBack');
    if (b) b.onclick = function () { location.replace(LAUNCHER); };
    var r = document.getElementById('sarvGateRetry');
    if (r) r.onclick = function () { location.reload(); };
  }

  /* When entry is not allowed: show the screen (or go to the launcher) and
     return a promise that never settles. The calling app's remaining code
     then never runs: no half boot, no flash of a login screen. */
  function stop(appLabel, why, detail) {
    if (SEND_TO_LAUNCHER[why]) goLauncher(why);
    else panel(appLabel, why, detail);
    return new Promise(function () {});
  }

  async function postRpc(url, key, fn, body) {
    var r = await fetch(url + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': 'Bearer ' + key },
      body: JSON.stringify(body)
    });
    var d = await r.json().catch(function () { return null; });
    return { ok: r.ok, status: r.status, data: d };
  }

  /* An app can still stop on a condition of its own AFTER the gate (for
     example the Packing profile row is not visible, or the Order Form
     session was not created). That screen must look exactly like the
     gate's, because there is no other way in from there either, and a
     login form would only mislead. So it is defined here once, not in
     three places. */
  function halt(title, bodyHtml, detail) {
    if (shown) return;
    shown = true;
    clearLocal();
    prebootDone();
    var d = document.createElement('div');
    d.id = 'sarvGatePanel';
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0f172a;color:#fff;'
      + 'display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;'
      + "font-family:'Segoe UI',system-ui,-apple-system,sans-serif;";
    d.innerHTML = '<div style="max-width:460px;">'
      + '<div style="font-size:46px;line-height:1;margin-bottom:14px;"></div>'
      + '<h2 style="margin:0 0 8px;font-size:18px;font-weight:800;">' + esc(title) + '</h2>'
      + '<p style="margin:0 0 16px;font-size:13px;line-height:1.7;color:#cbd5e1;">' + (bodyHtml || '') + '</p>'
      + '<button type="button" id="sarvHaltBack" style="background:#0ea5e9;border:none;color:#fff;'
      + 'border-radius:8px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">'
      + '&larr; Back to Apps</button>'
      + '<p style="margin:16px 0 0;font-size:10.5px;color:#64748b;">wajah: ' + esc(detail || '') + '</p>'
      + '</div>';
    (document.body || document.documentElement).appendChild(d);
    var b = document.getElementById('sarvHaltBack');
    if (b) b.onclick = function () { location.replace(LAUNCHER); };
  }

  var GATE = {
    /* For an app to stop on its own condition: the halt() above. */
    halt: halt,

    /* For the ERP (index.html) and mobile.html: only this check.
       Both already have their own role / PIN gate and their whole
       permission model depends on it, so that machinery was left alone.
       The only change is that nobody SEES that gate any more: without a
       token the page redirects to the launcher before it opens.

       Deliberately synchronous with no network call. It runs in `<head>`,
       so the decision is made before a single pixel is painted. Whether
       the session is actually valid is checked by each app's own
       `erp_app_session` call, which already exists; this check only
       removes the login window. */
    requireSession: function () {
      if (!tokenGet()) {
        try { location.replace(LAUNCHER + '?why=NO_TOKEN'); } catch (e) {}
        return false;
      }
      return true;
    },

    /* Filled in after boot(). Apps can read these directly instead of
       keeping a user record of their own. */
    user: null,
    token: '',
    app: '',

    /* Which apps this user may open: the same list the launcher wrote on
       the session at login. Apps do not need to understand the whole
       permission matrix. */
    can: function (appKey) {
      var a = (this.user && this.user.allowed_apps) || [];
      return a.indexOf(appKey) >= 0;
    },

    roles: function () {
      var u = this.user || {};
      var r = (u.roles && u.roles.length) ? u.roles : [u.primary_role];
      return r.filter(Boolean);
    },

    hasRole: function (role) { return this.roles().indexOf(role) >= 0; },

    async boot(o) {
      var label = o.label || 'Ye app';
      this.app = o.app;

      var tok = tokenGet();
      if (!tok) return stop(label, 'NO_TOKEN');
      this.token = tok;

      // ── 1. ERP ka darwaza ────────────────────────────────────────────
      var res;
      try {
        res = await postRpc(o.url, o.key, 'erp_app_session', { p_token: tok, p_app: o.app });
      } catch (e) {
        return stop(label, 'NET', (e && e.message) || '');
      }
      if (!res.ok || !res.data)
        return stop(label, 'RPC_HTTP', (res.data && (res.data.message || res.data.hint)) || ('HTTP ' + res.status));

      var d = res.data;
      if (!d.success) {
        if (d.error === 'NO_APP_ACCESS') return stop(label, 'NO_APP_ACCESS');
        return stop(label, WHY[d.error] ? d.error : 'UNKNOWN', d.error || '');
      }
      var u = d.user || null;
      if (!u) return stop(label, 'UNKNOWN', 'no user in the response');
      this.user = u;

      // ── 2. The account in this app ───────────────────────────────────
      // Complaint / Packing data is keyed on auth.uid(), so the user must
      // have an account there. Order Form does not need one.
      if (o.accountKey && !u[o.accountKey]) return stop(label, 'NO_APP_ACCOUNT');

      // ── 3. The real auth session (no password) ───────────────────────
      if (o.needAuth) {
        var why = await this.signIn(o, u);
        if (why !== true) return stop(label, why.why, why.detail);
      }

      /* On success the splash is NOT removed here. The app calls
         `sarvSsoPrebootDone()` itself once it is really ready to show.
         Removing it here flashes a blank page for a moment, which looks
         exactly like the flash the splash exists to prevent. (Every
         failure path does remove it: goLauncher, panel and halt.) */
      return u;
    },

    /* A real Supabase Auth session from the ERP session: the `erp-sso`
       Edge Function returns a one-time magic-link token and the full
       session is built from it. No password, and not a single RLS policy
       or trigger in those apps had to change. */
    async signIn(o, u) {
      var want = u[o.accountKey] || u.id;
      try {
        var cur = (await o.client.auth.getSession()).data.session;
        if (cur && cur.user && cur.user.id === want) return true;
        // Shared factory phone / dispatch desk — pichhle bande ka session band.
        if (cur) { try { await o.client.auth.signOut(); } catch (e) {} }

        var r = await fetch(o.url + '/functions/v1/erp-sso', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': o.key, 'Authorization': 'Bearer ' + o.key },
          body: JSON.stringify({ token: this.token, app: o.app })
        });
        var fd = await r.json().catch(function () { return null; });
        if (!r.ok || !fd || !fd.success) {
          var w = (fd && fd.error) || (r.status === 404 ? 'FN_MISSING' : 'FN_FAIL');
          if (!WHY[w]) w = 'FN_FAIL';
          return { why: w, detail: (fd && (fd.message || fd.detail || fd.error)) || ('HTTP ' + r.status) };
        }
        /* Try both types. A wrong type does not use up the token, so the
           second attempt is still fully valid. (Depending on the
           supabase-js version, the magic-link hash expects either
           'magiclink' or 'email'.) */
        var v = await o.client.auth.verifyOtp({ token_hash: fd.token_hash, type: 'magiclink' });
        if (v.error) v = await o.client.auth.verifyOtp({ token_hash: fd.token_hash, type: 'email' });
        if (v.error) return { why: 'OTP_FAIL', detail: v.error.message };
        return true;
      } catch (e) {
        return { why: 'NET', detail: (e && e.message) || '' };
      }
    },

    /* One logout, the same in every app: end the ERP session on the
       server, end the auth session, clear the app's local traces, and go
       to the launcher. */
    async logout(o) {
      o = o || {};
      var tok = tokenGet();
      var url = o.url || window.SUPABASE_URL;
      var key = o.key || window.SUPABASE_ANON_KEY;
      var cl  = o.client || null;
      try { if (cl && cl.auth) await cl.auth.signOut(); } catch (e) {}
      if (tok && url && key) {
        try { await postRpc(url, key, 'erp_app_logout', { p_token: tok }); } catch (e) {}
      }
      clearLocal();
      try { localStorage.removeItem(SSO_KEY); } catch (e) {}
      location.replace(LAUNCHER + '?bye=1');
    }
  };

  window.SARV_GATE = GATE;
})();
