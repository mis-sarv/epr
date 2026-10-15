/* ════════════════════════════════════════════════════════════════════════
   sso-gate.js — SAARE apps ka EK hi darwaza
   ════════════════════════════════════════════════════════════════════════

   Pehle har app ka apna login tha:
     packing.html   → apna username + password (packing.profiles)
     complaint.html → Supabase Auth ka apna login + signup (cmp_profiles)
     order-form.html→ apna naam + PIN (sales_login / sales_users)

   Teen login, teen user list, teen jagah "kaun hai" ka jawab — aur isi
   se wo poori ulajhan banti thi: ek bande ka ERP me access ON hota, par
   us app me account na hota; ya app ka password kisi ko yaad na hota; ya
   ek hi aadmi do list me do naam se baith jaata.

   Ab EK hi darwaza hai: `launcher.html`. Har app sirf utna poochhti hai —
   "ERP ka session hai? is app ka access hai?" — aur bas. Session na ho to
   app apna login NAHI dikhati; seedha launcher par bhej deti hai. Isi
   liye logout bhi hamesha launcher par le jaata hai: ek login tha, to
   logout bhi ek hi jagah se.

   Ye file koi login screen nahi banati. Jo screen ye dikhati hai wo sirf
   WAJAH batati hai (aur kiska kaam hai — user ka ya Admin ka), kyunki
   yahan se andar jaane ka koi doosra raasta hi nahi hai.

   ── Istemaal ───────────────────────────────────────────────────────────
     <script src="sso-preboot.js"></script>   <!-- pehle, jhalak rokne ko -->
     <script src="sso-gate.js"></script>

     const u = await SARV_GATE.boot({
       url: SUPABASE_URL, key: SUPABASE_ANON_KEY,
       app: 'HOME_PACKING', label: 'Packing & Dispatch',
       client: supabaseClient,        // sirf needAuth ke liye
       needAuth: true,                // Complaint / Packing: haan
       accountKey: 'pk_profile_id'    // us app ka account hona zaroori hai
     });

   `boot()` sirf tab resolve hota hai jab sach me andar jaane layak ho.
   Baaki har soorat me wo khud launcher par bhej deta hai ya wajah wali
   screen dikha deta hai — aur uska promise kabhi resolve NAHI hota, isi
   liye call karne wale ko "fail" sambhalna hi nahi padta.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SSO_KEY  = 'sarv_sso_token';
  var LAUNCHER = 'launcher.html';

  /* App-local session keys. Logout par aur gate band hone par inhe mitana
     zaroori hai: warna app ka purana localStorage session darwaze ko
     bypass kar sakta hai (pehle packing.html me theek yahi hota tha). */
  var LOCAL_KEYS = ['erpPackingAppSession', 'sihf_sb_token', 'sihf_erp_sso_msg'];

  /* Wajah → kya likhna hai. Jo baat user khud theek kar sake wo user ko,
     aur jo Admin ka kaam hai wo saaf Admin ke naam likhte hain — "kuch
     galat ho gaya" se kisi ka kaam nahi banta. */
  var WHY = {
    NO_TOKEN:        'Aap Apps page se nahi aaye. Wahin se login karein.',
    NO_SESSION:      'ERP ka session server par nahi mila — dobara login karein.',
    SESSION_REVOKED: 'Ye session band ho gaya. Ek waqt par ek hi login chalta hai, isi liye kahin aur (doosre phone / desktop par) login karne se ye wala band ho jaata hai.',
    SESSION_EXPIRED: 'Session purana ho gaya — dobara login karein.',
    USER_INACTIVE:   'Aapka account band hai — Admin se kehein.',
    NO_APP_ACCESS:   'Aapke login par ye app band hai. Admin se kehein — <i>Master Data › Settings › Admin Panel › Users › Apps</i> me ise <b>ON</b> karna hoga.',
    NO_APP_ACCOUNT:  'Is app ka account aapke naam par bana hi nahi hai. Admin: <i>Users</i> › aapko edit karke <i>Apps</i> me is app ko <b>ON</b> (auto nahi) karke Save karein — account khud ban jaayega.',
    NO_AUTH_USER:    'Aapka Supabase Auth account nahi mila. Admin: <i>Users › Apps</i> me ise OFF karke, Save karke, dobara ON karein.',
    AUTH_ACCOUNT_TAKEN: 'Aapke naam ki do ERP entries hain aur account doosri par juda hai. Admin: <code>sql/MERGE_DUPLICATE_USERS.sql</code> se dono ko milayein.',
    FN_MISSING:      'SSO ka Edge Function (<code>erp-sso</code>) server par nahi hai. Admin: <code>supabase functions deploy erp-sso</code>',
    FN_FAIL:         'SSO ka Edge Function error de raha hai — Admin ko ye screen dikhayein.',
    OTP_FAIL:        'Login token reject ho gaya — ek baar dobara koshish karein.',
    PROFILE_READ:    'Aapki profile padhi nahi ja saki (auth session nahi bana) — Admin ko ye screen dikhayein.',
    RPC_HTTP:        'Server ka darwaza (<code>erp_app_session</code>) jawab nahi de raha — Admin: migration / schema cache check karwayein.',
    NET:             'Server tak pahunch nahi hui — internet / firewall check karein.',
    UNKNOWN:         'Andar nahi ja sake.'
  };

  /* Jin wajahon ka ilaaj sirf "dobara login" hai, un par screen dikhane
     ka koi faayda nahi — seedha launcher bhej dete hain. Baaki (access /
     account / setup wali) par screen dikhti hai, kyunki launcher par
     jaakar bhi wahi dobara hoga. */
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

  /* `replace` jaan-boojh kar (`href` nahi): Back dabane par banda us app
     par wapas nahi aata jahan se use bheja gaya tha. */
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
      + '<div style="font-size:46px;line-height:1;margin-bottom:14px;">' + (opts.icon || '&#128274;') + '</div>'
      + '<h2 style="margin:0 0 8px;font-size:18px;font-weight:800;">' + esc(appLabel) + '</h2>'
      + '<p style="margin:0 0 16px;font-size:13px;line-height:1.7;color:#cbd5e1;">'
      + (WHY[why] || WHY.UNKNOWN) + '</p>'
      + '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">'
      + '<button type="button" id="sarvGateBack" style="background:#0ea5e9;border:none;color:#fff;'
      + 'border-radius:8px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">'
      + '&larr; Apps par wapas</button>'
      + '<button type="button" id="sarvGateRetry" style="background:transparent;border:1px solid #475569;'
      + 'color:#cbd5e1;border-radius:8px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">'
      + 'Dobara koshish</button></div>'
      + '<p style="margin:16px 0 0;font-size:10.5px;color:#64748b;line-height:1.6;">wajah: '
      + esc(why) + (detail ? ' — ' + esc(detail) : '') + '</p>'
      + '</div>';
    (document.body || document.documentElement).appendChild(d);
    var b = document.getElementById('sarvGateBack');
    if (b) b.onclick = function () { location.replace(LAUNCHER); };
    var r = document.getElementById('sarvGateRetry');
    if (r) r.onclick = function () { location.reload(); };
  }

  /* Jab andar jaane layak na ho: screen dikhao (ya launcher bhejo) aur
     phir ek aisa promise lauta do jo kabhi poora nahi hota. Isse call
     karne wali app ka aage ka code chalta hi nahi — na aadha boot, na
     "login screen" ki jhalak. */
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

  /* Gate ke BAAD bhi koi app apni ek shart par ruk sakti hai (jaise
     Packing ki profile row na dikhe, ya Order Form ka session na bana
     ho). Us soorat me screen bilkul waisi hi honi chahiye jaisi gate ki
     — kyunki wahan se bhi andar jaane ka koi doosra raasta nahi hai, aur
     login form dikhana sirf dhoka hota. Isi liye wo screen yahan ek hi
     jagah likhi hai, teen jagah nahi. */
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
      + '<div style="font-size:46px;line-height:1;margin-bottom:14px;">&#128274;</div>'
      + '<h2 style="margin:0 0 8px;font-size:18px;font-weight:800;">' + esc(title) + '</h2>'
      + '<p style="margin:0 0 16px;font-size:13px;line-height:1.7;color:#cbd5e1;">' + (bodyHtml || '') + '</p>'
      + '<button type="button" id="sarvHaltBack" style="background:#0ea5e9;border:none;color:#fff;'
      + 'border-radius:8px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">'
      + '&larr; Apps par wapas</button>'
      + '<p style="margin:16px 0 0;font-size:10.5px;color:#64748b;">wajah: ' + esc(detail || '') + '</p>'
      + '</div>';
    (document.body || document.documentElement).appendChild(d);
    var b = document.getElementById('sarvHaltBack');
    if (b) b.onclick = function () { location.replace(LAUNCHER); };
  }

  var GATE = {
    /* App apni shart par ruk jaane ke liye — upar wali halt() hi. */
    halt: halt,

    /* ERP (index.html) aur mobile.html ke liye — sirf itni rok.
       Un dono ke paas apna role/PIN wala gate pehle se hai aur usi par
       unka poora permission model tika hai, isi liye wo machinery chhedi
       nahi gayi. Bas ab wo gate kisi ko DIKHTA nahi: token na ho to
       page khulne se pehle hi launcher par bhej dete hain.

       Ye jaan-boojh kar synchronous hai aur koi network call nahi karta:
       `<head>` me chalta hai, isi liye ek bhi pixel paint hone se pehle
       faisla ho jaata hai. Session sach me chalta hai ya nahi — wo in
       dono apps ka apna `erp_app_session` check batata hai, jo pehle se
       maujood hai; ye rok sirf "login window" hatane ke liye hai. */
    requireSession: function () {
      if (!tokenGet()) {
        try { location.replace(LAUNCHER + '?why=NO_TOKEN'); } catch (e) {}
        return false;
      }
      return true;
    },

    /* boot() ke baad ye bhar jaate hain — app inhe seedha padh sakti hai,
       apna koi user record rakhne ki zaroorat nahi. */
    user: null,
    token: '',
    app: '',

    /* Is user ko kaun-kaun si app milti hai — wahi list jo launcher ne
       login ke waqt session par likhi thi. App ko permission ka poora
       matrix samajhne ki zaroorat nahi. */
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
      if (!u) return stop(label, 'UNKNOWN', 'jawab me user nahi aaya');
      this.user = u;

      // ── 2. Us app ka account ─────────────────────────────────────────
      // Complaint / Packing ka data auth.uid() par chalta hai, isi liye
      // unka account hona zaroori hai. Order Form ko iski zaroorat nahi.
      if (o.accountKey && !u[o.accountKey]) return stop(label, 'NO_APP_ACCOUNT');

      // ── 3. Asli auth session (bina password) ─────────────────────────
      if (o.needAuth) {
        var why = await this.signIn(o, u);
        if (why !== true) return stop(label, why.why, why.detail);
      }

      /* Kaamyaabi par splash yahan se NAHI hatate — app jab sach me
         dikhne layak ho tab wo khud `sarvSsoPrebootDone()` bulati hai.
         Yahan hata dein to ek pal ko khaali page jhalakta hai, jo theek
         usi jhalak jaisa dikhta hai jise rokne ke liye splash banayi
         gayi thi. (Har fail wale raaste par splash zaroor hatti hai —
         goLauncher / panel / halt teeno me.) */
      return u;
    },

    /* ERP ke session se asli Supabase Auth session — `erp-sso` Edge
       Function ek one-time magic-link token deta hai, aur usse poora
       session ban jaata hai. Bina password, aur un apps ki ek bhi RLS
       policy ya trigger chhede bina. */
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
        /* Dono type try karte hain — galat type par token kharch nahi
           hota, isi liye doosri koshish poori tarah valid rehti hai.
           (supabase-js ke version ke hisaab se magiclink ka hash
           'magiclink' ya 'email' maangta hai.) */
        var v = await o.client.auth.verifyOtp({ token_hash: fd.token_hash, type: 'magiclink' });
        if (v.error) v = await o.client.auth.verifyOtp({ token_hash: fd.token_hash, type: 'email' });
        if (v.error) return { why: 'OTP_FAIL', detail: v.error.message };
        return true;
      } catch (e) {
        return { why: 'NET', detail: (e && e.message) || '' };
      }
    },

    /* Ek hi logout — har app me wahi. ERP ka session server par band,
       auth session band, app ke local nishaan saaf, aur launcher par. */
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
