/* fms-core.js — Task › FMS (fms.html): helpers, server calls, data store, rules,
   flow validation, change list, router.

   Ported from Nexus 2.0 (core.js / history.js). What changed on the way in:
   * Data does not live in one browser store any more. It is read in one call
     (fms_data) and every change goes to a token-checked fms_* RPC
     (sql/FMS_MIGRATION.sql), which checks the right again on the server.
   * An "order" of Nexus is a "record" here: a row of fms_records punched into a
     flow. Its fields are the flow's own fields (Fields & JSON tab), so a flow
     can be built for any work (sampling, a new design, a complaint, a machine
     purchase …) without a code change.
   * The doers are the ERP's own users (app_users.user_name, in capitals).
   * Rights come from Admin Panel › Tab Visibility / Users › Apps:
     HOME_FMS_BUILDER, HOME_FMS_VIEW, FMS_ADD, FMS_MANAGE (see SARV_TABS).
   Classic script: fms-builder.js and fms-view.js read these globals directly. */
'use strict';

/* ================= helpers ================= */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
const norm = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
const nowIso = () => new Date().toISOString();
function ymdOf(d) { d = new Date(d); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
const todayYmd = () => ymdOf(new Date());
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtD(v) { if (!v) return ''; const d = new Date(v); if (isNaN(d)) return ''; return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); }
function fmtDT(v) { if (!v) return ''; const d = new Date(v); if (isNaN(d)) return ''; const p = n => String(n).padStart(2, '0'); return fmtD(d) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
function fmtDelay(min) {
  if (!min) return '';
  const day = calInfo().dayMinutes || 480;
  const d = Math.floor(min / day), h = Math.floor((min % day) / 60), m = min % 60;
  return ((d ? d + 'd ' : '') + (h ? h + 'h ' : '') + (!d && m ? m + 'm' : '')).trim() || '0m';
}
function stCls(s) { return String(s || '').replace(/[^A-Za-z]/g, ''); }
function stHtml(s) { return '<span class="st ' + stCls(s) + '">' + esc(s) + '</span>'; }
function seg(name, options, value, attrs) {
  return '<span class="seg" data-seg="' + esc(name) + '" ' + (attrs || '') + '>' + options.map(o => {
    const v = typeof o === 'object' ? o.v : o, l = typeof o === 'object' ? o.l : (o === '' ? 'None' : o);
    return '<button type="button" data-v="' + esc(v) + '" class="' + (String(v) === String(value == null ? '' : value) ? 'on' : '') + '">' + esc(l) + '</button>';
  }).join('') + '</span>';
}
let flashTimer;
function flash(msg, type) {
  const f = $('#flash'); if (!f) return;
  f.innerHTML = msg; f.className = type === 'err' ? 'err' : '';
  clearTimeout(flashTimer); flashTimer = setTimeout(() => f.classList.add('hidden'), type === 'err' ? 7000 : 4000);
}
function setMain(h) { $('#main').innerHTML = h; }
function downloadCsv(name, rows) {
  const cell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
/* In-page replacements for prompt() / confirm(). Chrome silently blocks those
   browser boxes inside a cross-origin iframe (the ERP opens this page in
   #fmsFrame, and over file:// every file is its own origin): prompt() just
   returns null, so "+ New FMS" did nothing at all. These work everywhere.
   askText resolves to the trimmed text, or null on Cancel; askYes to true / false. */
function askDlg_(title, bodyHtml, okLabel, focusSel, read) {
  return new Promise(res => {
    const old = $('#askDlg'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'askDlg'; d.className = 'dlg-back';
    d.innerHTML = '<div class="dlg ask-dlg"><div class="dlg-h">' + esc(title) + '</div>' + bodyHtml +
      '<div class="dlg-f"><span id="askMsg" class="small late-txt"></span><span class="grow"></span><button class="btn" data-ask-x>Cancel</button><button class="btn primary" data-ask-ok>' + esc(okLabel || 'OK') + '</button></div></div>';
    document.body.appendChild(d);
    const done = v => { d.remove(); document.removeEventListener('keydown', key, true); res(v); };
    const ok = () => { const v = read ? read(d) : true; if (v === undefined) return; done(v); };
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); done(read ? null : false); } else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); ok(); } };
    document.addEventListener('keydown', key, true);
    d.addEventListener('click', e => { if (e.target.closest('[data-ask-x]') || e.target === d) done(read ? null : false); else if (e.target.closest('[data-ask-ok]')) ok(); });
    const f = focusSel ? $(focusSel, d) : $('[data-ask-ok]', d); if (f) { f.focus(); if (f.select) f.select(); }
  });
}
function askText(title, label, def) {
  return askDlg_(title, '<label>' + esc(label) + '<input id="askIn" value="' + esc(def || '') + '" autocomplete="off"></label>', 'OK', '#askIn', d => {
    const v = $('#askIn', d).value.trim(); if (!v) { $('#askMsg', d).textContent = 'Enter ' + label.toLowerCase() + '.'; return undefined; } return v;
  });
}
function askYes(msg, okLabel) { return askDlg_('Please confirm', '<div style="white-space:pre-line">' + esc(msg) + '</div>', okLabel || 'Yes'); }

/* Busy cover while a save is on its way, so a second click can't send it twice. */
function busy(on, msg) {
  const b = $('#fmsBusy'); if (!b) return;
  b.classList.toggle('hidden', !on); if (msg) $('#fmsBusyMsg').textContent = msg;
}

/* ================= server ================= */
const SUPABASE_URL = 'https://jdlzgjgxxjkjejkhvdij.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkbHpnamd4eGpramVqa2h2ZGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODUwMDcsImV4cCI6MjEwNTY2MTAwN30.ow4i6e78i-dGoJJh2-N4FX6EQE7f2FRQDgCMJHpxAWk';
const SESSION_ERR = { NO_TOKEN: 1, NO_SESSION: 1, SESSION_REVOKED: 1, SESSION_EXPIRED: 1, USER_INACTIVE: 1 };
const ERR_TEXT = {
  NOT_ALLOWED: 'You do not have the right for this. Ask the Admin (Admin Panel › Tab Visibility, or Users › Apps).',
  ADMIN_ONLY: 'Only the Admin can delete a flow or a version.',
  NOT_FOUND: 'Not found. Somebody may have changed it; press Refresh.',
  BAD_SPEC: 'The flow is not complete (it needs process, fields[] and steps[]).',
  NO_LIVE_FLOW: 'This flow has no live version. Activate one in FMS Builder first.',
  LIVE_VERSION: 'The live version cannot be deleted.',
  HAS_RECORDS: 'Records run on it, so it cannot be deleted.',
  NO_STEP: 'This step is not in the flow any more. Press Refresh.',
  ALREADY_DONE: 'This step is already done (maybe from another screen). Press Refresh.',
  NOT_YOUR_STEP: 'Only the doer of this step (or someone with FMS Manage) can close it.',
  NEED_VALUE: 'Enter the value this step asks for.',
  NEXT_DONE: 'Cannot undo: a step after it is already done',
  NOT_LEVEL1: 'A new date can be given only while the ticket is at Level 1.',
  DATE_GIVEN: 'A new date was already given once for this ticket.',
  PAST_DATE: 'Pick a future date and time.',
  NEED_REASON: 'Give the reason.',
  NOT_OPEN: 'This ticket is already resolved. Press Refresh.',
  BAD_VALUE: 'The settings could not be read.'
};
async function rpc(fn, args) {
  let r;
  try {
    r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify(Object.assign({ p_token: SARV_GATE.token }, args || {}))
    });
  } catch (e) { throw new Error('Could not reach the server. Please check the internet connection.'); }
  const d = await r.json().catch(() => null);
  if (!r.ok) {
    const code = d && d.code;
    // Before sql/FMS_MIGRATION.sql is run the functions do not exist: say so plainly.
    if (code === 'PGRST202' || code === '42883' || code === '42P01') {
      // Name the file that adds this function (Task Tracker functions start with tt_).
      const file = /^tt_/.test(fn) ? 'sql/TASK_TRACKER_MIGRATION.sql' : /^tm_/.test(fn) ? 'TASK_MANAGER_MIGRATION.sql' : 'sql/FMS_MIGRATION.sql';
      const e = new Error((/^tt_/.test(fn) ? 'Task Tracker' : /^tm_/.test(fn) ? 'Task Manager' : 'FMS') + ' is not set up on the server yet. Admin: run ' + file + ' in the Supabase SQL Editor (it is safe to run again).');
      e.code = 'NOT_SET_UP'; throw e;
    }
    throw new Error((d && (d.message || d.hint)) || ('HTTP ' + r.status));
  }
  if (d && d.success === false) {
    const err = String(d.error || '');
    if (SESSION_ERR[err]) { location.replace('launcher.html?why=' + err); return new Promise(() => {}); }
    const e = new Error((ERR_TEXT[err] || err) + (d.steps ? ': ' + d.steps : '') + (d.count ? ' (' + d.count + ')' : ''));
    e.code = err; throw e;
  }
  return d;
}

/* ================= store =================
   Everything the page shows, as read by fms_data. Reads are synchronous (like
   Nexus' Store.all / Store.get) so the ported screens work unchanged; writes go
   to the server first and are then put back here from its answer. */
const DB = { processes: [], records: [], users: [], settings: {}, all: false, fmsErr: '', ttErr: '' };
let ME = null;
const Store = {
  all: col => DB[col] || [],
  get: (col, id) => (DB[col] || []).find(x => x.id === id) || null,
  // Every change also drops the Task Tracker's cached rows (fms-tasks.js), so its screens show it at once.
  put(col, row) { const a = DB[col]; const i = a.findIndex(x => x.id === row.id); if (i >= 0) a[i] = row; else a.unshift(row); RES_CACHE.clear(); if (typeof TT !== 'undefined') TT.rows = null; return row; },
  del(col, id) { DB[col] = DB[col].filter(x => x.id !== id); RES_CACHE.clear(); if (typeof TT !== 'undefined') TT.rows = null; }
};
/* Two independent sources, so one missing never blanks the other:
     fms_data  flows + records (sql/FMS_MIGRATION.sql; HOME_FMS_VIEW / _BUILDER)
     tt_data   Task Tracker: people, tickets, settings, its rights
               (sql/TASK_TRACKER_MIGRATION.sql; HOME_TASK_TRACKER …)
   ME = who I am + the rights of both. A source that is not set up yet or not
   allowed for this login just leaves its part empty (DB.fmsErr / DB.ttErr
   say why); only a login problem stops the page. */
async function loadAll() {
  const [f, t] = await Promise.allSettled([rpc('fms_data', { p_all: !!DB.all }), typeof ttLoad === 'function' ? ttLoad() : Promise.resolve(null)]);
  if (f.status === 'rejected' && t.status === 'rejected') throw f.reason;
  const fm = f.status === 'fulfilled' ? f.value : null;
  DB.fmsErr = fm ? '' : (f.reason && f.reason.message) || 'FMS not available';
  DB.ttErr = t.status === 'fulfilled' ? '' : (t.reason && t.reason.message) || 'Task Tracker not available';
  const tme = (t.status === 'fulfilled' && t.value && t.value.me) || null;
  ME = Object.assign({}, tme || {}, (fm && fm.me) || {});
  ME.perms = Object.assign({}, (tme && tme.perms) || {}, (fm && fm.me && fm.me.perms) || {});
  if (!ME.name) ME.name = String((SARV_GATE.user || {}).name || '').toUpperCase();
  ME.admin = !!((fm && fm.me && fm.me.admin) || (tme && tme.admin));
  DB.processes = fm ? fm.processes || [] : []; DB.records = fm ? fm.records || [] : [];
  DB.users = fm ? (fm.users || []).filter(Boolean).sort() : (typeof TT !== 'undefined' ? TT.people.map(p => p.name).sort() : []);
  DB.settings = fm ? fm.settings || {} : DB.settings || {}; RES_CACHE.clear();
}
const can = k => !!(ME && ME.perms && ME.perms[k]);
const isAdmin = () => !!(ME && ME.admin);
function requirePerm(k) { if (can(k)) return true; flash(esc(ERR_TEXT.NOT_ALLOWED), 'err'); return false; }
const isMyDoer = doer => !!(ME && doer && norm(doer) === norm(ME.name));

/* ================= FMS glue ================= */
const RES_CACHE = new Map();
function calendar() {
  const c = DB.settings.calendar || {};
  return Object.assign({ open: '09:30', close: '18:30', lunchStart: '13:30', lunchEnd: '14:00', weeklyOff: [0], halfDays: 'exact' }, c,
    { holidays: (DB.settings.holidays || []).map(h => h.date).filter(Boolean) });
}
function calInfo() { return FMSEngine.makeCalendar(calendar()); }
function activeProcess(code) { return Store.all('processes').find(p => p.active && (!code || p.code === code)) || null; }
function specOf(proc) { return proc ? Object.assign({}, proc.spec, { calendar: calendar() }) : null; }
// Doers that come from outside the flow's own fields. None in the Sarv ERP yet;
// kept as a list so one can be added later (e.g. the brand's merchant).
const FMS_SYS_FIELDS = [];
// Fields every flow keeps: the punch time (start of the flow) and the priority.
const CORE_FIELDS = ['created_at', 'priority'];
function recFields(r) { return Object.assign({}, r.fields || {}, { created_at: r.created_at, rec_no: r.rec_no }); }
function resolveRec(r) {
  const key = r.id + '|' + r.updated_at;
  if (RES_CACHE.has(key)) return RES_CACHE.get(key);
  const spec = specOf(Store.get('processes', r.process_id)); let res = null;
  if (spec) {
    try { res = FMSEngine.resolveInstance(spec, { fields: recFields(r), actuals: r.actuals || {} }, new Date()); res.spec = spec; }
    catch (e) { console.error(e); }
  }
  RES_CACHE.set(key, res); return res;
}
const recPriority = r => { const s = specOf(Store.get('processes', r.process_id)); const f = s && s.priority && s.priority.field; return f ? String((r.fields || {})[f] || '') : ''; };
// Record-level state for lists: the step it is on now, late first.
function recState(r) {
  const res = resolveRec(r);
  if (!res) return { label: 'No flow', cls: 'NA', open: true };
  if (res.priority.cancelled) return { label: 'Cancelled', cls: 'Cancelled', open: false };
  if (r.closed_at) return { label: 'Completed', cls: 'Done', open: false };
  if (res.priority.held) return { label: 'On Hold', cls: 'OnHold', open: true };
  const open = res.order.map(id => res.steps[id]).filter(s => s.status === 'Pending' || s.status === 'Late').sort((a, b) => a.planned - b.planned);
  const late = open.filter(s => s.status === 'Late'); const cur = late[0] || open[0];
  return { label: cur ? cur.name : 'Waiting', cls: late.length ? 'Late' : (cur ? 'Pending' : 'Waiting'), open: true, late: late.length, cur };
}
// Every open step of every open record, earliest first (My steps, counts).
function allOpenSteps() {
  const out = [];
  Store.all('records').forEach(r => {
    if (r.closed_at) return; const res = resolveRec(r); if (!res) return;
    res.order.forEach(id => { const s = res.steps[id]; if (s.status === 'Pending' || s.status === 'Late') out.push({ rec: r, step: s, def: res.spec.steps.find(x => x.id === id), spec: res.spec }); });
  });
  return out.sort((a, b) => a.step.planned - b.step.planned);
}
function fieldLabelOf(spec, key) { const f = ((spec && spec.fields) || []).find(x => x.key === key); return f ? f.label : key; }

/* ---- "Finishes by itself" rules ----
   Nexus closed steps from its own modules (BOM made, job card made, material
   received, dispatched). Those modules are not part of this ERP, so only the
   general rule is here. A new rule = one more entry: check(record, field)
   returns the time it happened, or null while it has not. The server must
   agree too (fms_step_done, p_auto), so add the same check there. */
const FMS_RULES = [
  { id: 'field_filled', label: 'A record field is filled', param: true,
    check: (r, f) => { const v = (r.fields || {})[f]; return v != null && String(v).trim() ? nowIso() : null; } }
];
let AUTO_BUSY = false;
async function fmsAutoRun() {
  if (AUTO_BUSY || !ME) return; AUTO_BUSY = true; let n = 0;
  try {
    for (const r of Store.all('records')) {
      if (r.closed_at) continue; const res = resolveRec(r); if (!res || res.priority.frozen) continue;
      for (const def of res.spec.steps) {
        if (!def.status || def.status.type !== 'auto') continue;
        const s = res.steps[def.id]; if (!s || !(s.status === 'Pending' || s.status === 'Late')) continue;
        const rule = FMS_RULES.find(x => x.id === def.status.rule); if (!rule || !rule.check(r, def.status.field)) continue;
        try { const d = await rpc('fms_step_done', { p_id: r.id, p_step: def.id, p_auto: true }); Store.put('records', d.record); n++; } catch (e) { console.warn('FMS auto', e.message); }
      }
    }
  } finally { AUTO_BUSY = false; }
  if (n) route();
}

/* ================= validation of a flow (Nexus validateSpec) ================= */
function validateSpec(spec) {
  const errors = [], warns = [];
  const ids = new Set(); const fieldKeys = new Set((spec.fields || []).map(f => f.key)); fieldKeys.add('created_at'); fieldKeys.add('rec_no'); FMS_SYS_FIELDS.forEach(f => fieldKeys.add(f.key));
  const tables = spec.doerTables || {};
  if (!spec.process || !spec.process.id) errors.push('process.id missing');
  if (!Array.isArray(spec.steps) || !spec.steps.length) errors.push('No steps');
  (spec.steps || []).forEach((s, i) => {
    const at = (s.name || s.id || 'step ' + (i + 1));
    if (!s.id) errors.push(at + ': id missing'); else if (ids.has(s.id)) errors.push(at + ': duplicate id "' + s.id + '"'); ids.add(s.id);
    if (!s.name) errors.push(at + ': name missing');
    if (!s.doer) warns.push(at + ': no doer — nobody will see this task');
    if (s.doer && s.doer.type === 'lookup') {
      if (!tables[s.doer.table]) errors.push(at + ': doer table "' + s.doer.table + '" not found');
      if (!fieldKeys.has(s.doer.by)) errors.push(at + ': doer lookup field "' + s.doer.by + '" is not a field');
    }
    if (s.doer && s.doer.type === 'field' && !fieldKeys.has(s.doer.field)) errors.push(at + ': doer field "' + s.doer.field + '" is not a field');
    if (s.capture && !fieldKeys.has(s.capture.field)) errors.push(at + ': asks for field "' + s.capture.field + '" which is not a field');
    if (s.status && s.status.type === 'auto') { const r = FMS_RULES.find(x => x.id === s.status.rule); if (!r) errors.push(at + ': auto-close rule missing'); else if (r.param && !fieldKeys.has(s.status.field)) errors.push(at + ': "Finishes by itself" — choose which record field (rule: ' + r.label + ')'); }
    const trig = Array.isArray(s.trigger) ? s.trigger : [s.trigger];
    if (!trig[0]) errors.push(at + ': trigger missing');
    trig.forEach((t, j) => {
      if (!t) return; const tat = t.tat || s.tat;
      if (t.type === 'afterStep' && !(spec.steps || []).some(x => x.id === t.step)) errors.push(at + ': trigger ' + (j + 1) + ' refers to unknown step "' + t.step + '"');
      if (t.type === 'afterStep' && t.step === s.id) errors.push(at + ': step cannot trigger itself');
      if (['beforeDate', 'afterDate', 'external'].includes(t.type) && !fieldKeys.has(t.field)) errors.push(at + ': trigger ' + (j + 1) + ' field "' + t.field + '" is not a field');
      if (['afterStep', 'instanceStart', 'beforeDate', 'afterDate'].includes(t.type) && !tat) errors.push(at + ': no TAT');
      if (j < trig.length - 1 && !t.when && !t.orNext) warns.push(at + ': trigger ' + (j + 1) + ' has no condition / fallback, so later triggers are never used');
    });
  });
  if (!errors.length) { try { FMSEngine.topoOrder(spec); } catch (e) { errors.push('Loop in the flow: ' + e.message); } }
  const walk = (c, at) => { if (!c) return; if (Array.isArray(c)) return c.forEach(x => walk(x, at)); if (c.all) return c.all.forEach(x => walk(x, at)); if (c.any) return c.any.forEach(x => walk(x, at)); if (c.not) return walk(c.not, at); if (c.field && !fieldKeys.has(c.field)) errors.push(at + ': condition uses unknown field "' + c.field + '"'); if ((c.in && !c.in.length) || (c.notIn && !c.notIn.length)) warns.push(at + ': condition on "' + c.field + '" has no values'); };
  (spec.steps || []).forEach(s => { walk(s.applies, s.name + ' (applies)'); (Array.isArray(s.trigger) ? s.trigger : [s.trigger]).forEach(t => t && walk(t.when, s.name + ' (trigger)')); if (s.doer && s.doer.rules) s.doer.rules.forEach(r => walk(r.when, s.name + ' (doer rule)')); });
  if (spec.process && spec.process.endStep && !ids.has(spec.process.endStep)) errors.push('End step "' + spec.process.endStep + '" is not a step');
  // A fixed doer must be an ERP user, or nobody will ever see the step in My steps.
  const doers = new Set(Store.all('users').map(norm));
  (spec.steps || []).forEach(s => { if (s.doer && (typeof s.doer === 'string' || s.doer.type === 'fixed')) { const n = typeof s.doer === 'string' ? s.doer : s.doer.name; if (n && !doers.has(norm(n))) warns.push(s.name + ': doer "' + n + '" is not an ERP user'); } });
  return { errors, warns };
}

/* ================= what changed between two flows (Nexus history.js) ================= */
function hxFieldLabel(sp, k) { const f = ((sp && sp.fields) || []).find(x => x.key === k) || FMS_SYS_FIELDS.find(x => x.key === k); return f ? f.label : (k || '—'); }
function hxStepName(sp, id) { const s = ((sp && sp.steps) || []).find(x => x.id === id); return s ? s.name : (id || '—'); }
function hxTat(t) { return t ? t.value + (t.unit === 'hours' ? ' h' : ' d') + (t.urgent != null && t.urgent !== '' ? ' (urgent ' + t.urgent + ')' : '') : '—'; }
function hxDoer(sp, d) {
  if (!d) return '—'; if (typeof d === 'string') return d;
  if (d.type === 'fixed') return d.name || '—';
  if (d.type === 'field') return hxFieldLabel(sp, d.field);
  if (d.type === 'lookup') return 'Doer table ' + d.table;
  return (d.rules || []).map(r => r.name + ' if ' + hxFieldLabel(sp, (r.when || {}).field) + ' = ' + ((r.when || {}).in || []).join('/')).concat(d.default ? ['else ' + d.default] : []).join('; ');
}
function hxCond(sp, c) {
  if (!c) return ''; if (c.all || c.any) return (c.all || c.any).map(x => hxCond(sp, x)).join(c.all ? ' and ' : ' or ');
  const f = hxFieldLabel(sp, c.field);
  if (c.in) return f + ' = ' + c.in.join('/'); if (c.notIn) return f + ' ≠ ' + c.notIn.join('/');
  if ('eq' in c) return f + ' = ' + c.eq; if ('ne' in c) return f + ' ≠ ' + c.ne; if ('empty' in c) return f + (c.empty ? ' empty' : ' filled');
  return JSON.stringify(c);
}
function hxTrig(sp, tr) {
  const one = t => {
    if (!t) return '—'; let s;
    if (t.type === 'instanceStart') s = 'Record punch';
    else if (t.type === 'afterStep') s = 'After ' + hxStepName(sp, t.step);
    else if (t.type === 'external') s = 'On ' + hxFieldLabel(sp, t.field);
    else if (t.type === 'beforeDate') s = 'Before ' + hxFieldLabel(sp, t.field);
    else if (t.type === 'afterDate') s = 'After ' + hxFieldLabel(sp, t.field);
    else s = t.type;
    return s + (t.when ? ' (if ' + hxCond(sp, t.when) + ')' : '') + (t.tat ? ' +' + hxTat(t.tat) : '');
  };
  return Array.isArray(tr) ? tr.map(one).join(' or ') : one(tr);
}
function hxStatus(sp, s) {
  if (!s.status || s.status.type !== 'auto') return 'Manual' + (s.capture ? ', asks ' + hxFieldLabel(sp, s.capture.field) : '');
  const r = FMS_RULES.find(x => x.id === s.status.rule);
  return 'Auto: ' + (r ? r.label : s.status.rule) + (s.status.field ? ' (' + hxFieldLabel(sp, s.status.field) + ')' : '');
}
function specDiff(a, b) {
  a = a || {}; b = b || {}; const rows = [];
  const add = (step, what, from, to) => rows.push({ step, what, from: from == null || from === '' ? '—' : String(from), to: to == null || to === '' ? '—' : String(to) });
  const pa = a.process || {}, pb = b.process || {};
  if ((pa.name || '') !== (pb.name || '')) add('FMS', 'Name', pa.name, pb.name);
  if ((pa.endStep || '') !== (pb.endStep || '')) add('FMS', 'Last step (End)', hxStepName(a, pa.endStep), hxStepName(b, pb.endStep));
  const sa = a.steps || [], sb = b.steps || []; const ia = new Map(sa.map((s, i) => [s.id, i])), ib = new Map(sb.map((s, i) => [s.id, i]));
  sa.forEach(s => { if (!ib.has(s.id)) add(s.name, 'Step removed', s.name, ''); });
  sb.forEach((s, i) => {
    if (!ia.has(s.id)) { add(s.name, 'Step added', '', 'Position ' + (i + 1) + ' · ' + hxDoer(b, s.doer) + ' · ' + hxTrig(b, s.trigger)); return; }
    const o = sa[ia.get(s.id)]; const nm = s.name || o.name;
    const cmp = (what, x, y) => { if (x !== y) add(nm, what, x, y); };
    cmp('Name', o.name || '', s.name || '');
    cmp('Doer', hxDoer(a, o.doer), hxDoer(b, s.doer));
    cmp('Starts', hxTrig(a, o.trigger), hxTrig(b, s.trigger));
    cmp('TAT', hxTat(o.tat), hxTat(s.tat));
    cmp('Closes', hxStatus(a, o), hxStatus(b, s));
    cmp('Only for', hxCond(a, o.applies) || 'All records', hxCond(b, s.applies) || 'All records');
    cmp('Work', o.what || '', s.what || '');
  });
  if (sa.length === sb.length && sa.every(s => ib.has(s.id))) sb.forEach((s, i) => { const j = ia.get(s.id); if (j !== i) add(s.name, 'Position', j + 1, i + 1); });
  const fa = new Map((a.fields || []).map(f => [f.key, f])), fb = new Map((b.fields || []).map(f => [f.key, f]));
  fa.forEach((f, k) => { if (!fb.has(k)) add('Fields', 'Field removed', f.label, ''); });
  fb.forEach((f, k) => { if (!fa.has(k)) add('Fields', 'Field added', '', f.label); else if (JSON.stringify(fa.get(k)) !== JSON.stringify(f)) add('Fields', f.label, JSON.stringify(fa.get(k)), JSON.stringify(f)); });
  const ta = a.doerTables || {}, tb = b.doerTables || {};
  new Set(Object.keys(ta).concat(Object.keys(tb))).forEach(t => {
    const x = ta[t], y = tb[t]; if (!x) { add('Doer table ' + t, 'Table added', '', Object.keys(y).length + ' rows'); return; } if (!y) { add('Doer table ' + t, 'Table removed', Object.keys(x).length + ' rows', ''); return; }
    new Set(Object.keys(x).concat(Object.keys(y))).forEach(k => { if ((x[k] || '') !== (y[k] || '')) add('Doer table ' + t, k, x[k], y[k]); });
  });
  if (JSON.stringify(a.priority || {}) !== JSON.stringify(b.priority || {})) add('FMS', 'Priority rules', JSON.stringify(a.priority || {}), JSON.stringify(b.priority || {}));
  return rows;
}
const specDiffText = rows => rows.map(r => r.step + ' · ' + r.what + ': ' + r.from + ' → ' + r.to).join('\n');
// Problems a save would cause: steps that would wait forever.
function specWarnings(sp) {
  const out = []; const steps = (sp && sp.steps) || []; const ids = new Set(steps.map(s => s.id));
  const asked = new Set(steps.filter(s => s.capture && s.capture.field).map(s => s.capture.field));
  steps.forEach(s => (Array.isArray(s.trigger) ? s.trigger : [s.trigger]).forEach(t => {
    if (!t) return;
    if (t.type === 'afterStep' && t.step && !ids.has(t.step)) out.push(s.name + ' waits for a step that no longer exists (' + t.step + ').');
    if (['external', 'beforeDate', 'afterDate'].includes(t.type) && t.field) {
      const f = ((sp.fields) || []).find(x => x.key === t.field);
      if (f && f.source === 'step' && !asked.has(t.field)) out.push(s.name + ' starts from ' + f.label + ', but no step asks for ' + f.label + ' — it will stay Waiting.');
    }
  }));
  return out;
}
// Confirm before saving a flow: every change and every problem, then Save.
function hxConfirm(title, rows, warns, onOk) {
  const old = $('#hxDlg'); if (old) old.remove();
  const d = document.createElement('div'); d.id = 'hxDlg'; d.className = 'dlg-back';
  d.innerHTML = '<div class="dlg hx-dlg"><div class="dlg-h">' + esc(title) + ' · ' + rows.length + ' change(s)</div>' +
    (warns.length ? '<ul class="val hx-warn">' + warns.map(w => '<li class="e">' + esc(w) + '</li>').join('') + '</ul>' : '') +
    (rows.length ? '<div class="tbl-wrap hx-wrap"><table class="hx-t"><tr><th>Step</th><th>Change</th><th>Before</th><th>After</th></tr>' +
      rows.map(r => '<tr><td>' + esc(r.step) + '</td><td>' + esc(r.what) + '</td><td class="hx-old">' + esc(r.from) + '</td><td class="hx-new">' + esc(r.to) + '</td></tr>').join('') + '</table></div>' : '') +
    '<div class="dlg-f"><span class="grow"></span><button class="btn" data-hx-x>Cancel</button><button class="btn primary" data-hx-ok>' + (warns.length ? 'Save anyway' : 'Save') + '</button></div></div>';
  document.body.appendChild(d);
  d.addEventListener('click', ev => { if (ev.target.closest('[data-hx-x]') || ev.target === d) { d.remove(); return; } if (ev.target.closest('[data-hx-ok]')) { d.remove(); onOk(); } });
}

/* ---- the flow a brand-new FMS starts with: one step and the fields most flows need ---- */
function starterSpec(name) {
  return {
    process: { id: 'new', name, startEvent: 'Record punched', instanceLabel: 'Record', endStep: 'step_1' },
    fields: [
      { key: 'created_at', label: 'Time Stamp', type: 'datetime', source: 'system' },
      { key: 'title', label: 'Title', type: 'text', source: 'form' },
      { key: 'party', label: 'Party', type: 'text', source: 'form' },
      { key: 'due_date', label: 'Due Date', type: 'date', source: 'form' },
      { key: 'priority', label: 'Priority', type: 'select', options: ['', 'Urgent', 'On Hold', 'Cancelled'], source: 'form' }
    ],
    priority: { field: 'priority', urgent: ['Urgent'], hold: ['On Hold'], cancel: ['Cancelled'] },
    doerTables: {},
    steps: [{ id: 'step_1', name: 'First step', doer: { type: 'fixed', name: '' }, trigger: { type: 'instanceStart' }, tat: { value: 1, unit: 'days' } }]
  };
}

/* ================= router =================
   fms.html#builder          FMS Builder
   fms.html#view             FMS View (all flows; #view/<code> opens one)
   fms.html#rec/<record id>  one record: its timeline, Done / Undo */
const VIEWS = {};
const ACTIONS = {};
let SEG_HANDLER = null;
function onSeg(fn) { SEG_HANDLER = fn; }
function curView() { const h = location.hash.replace(/^#\/?/, ''); const [v, ...rest] = h.split('/'); return { v: v || 'view', param: decodeURIComponent(rest.join('/')) }; }
function go(v, param) { location.hash = '#' + v + (param ? '/' + encodeURIComponent(param) : ''); }
// Each screen and the right that opens it (Task Tracker screens live in fms-tasks.js).
const VIEW_RIGHT = { builder: 'HOME_FMS_BUILDER', view: 'HOME_FMS_VIEW', rec: 'HOME_FMS_VIEW', tasks: 'HOME_TASK_TRACKER', esc: 'HOME_TT_ESCALATIONS', score: 'HOME_TT_SCORECARD', pva: 'HOME_TT_PLANACTUAL' };
const VIEW_TABS = [['builder', 'FMS Builder'], ['view', 'FMS View'], ['tasks', 'Task Tracker'], ['esc', 'Escalations'], ['score', 'Scorecard'], ['pva', 'Plan vs Actual']];
function renderTabs() {
  const { v } = curView(); const mine = allOpenSteps().filter(x => isMyDoer(x.step.doer));
  const late = mine.some(x => x.step.status === 'Late');
  const badge = { view: mine.length ? '<span class="cnt' + (late ? ' late' : '') + '" title="My open steps">' + mine.length + '</span>' : '' };
  if (typeof ttBadges === 'function') Object.assign(badge, ttBadges());
  $('#fmsTabs').innerHTML = VIEW_TABS.filter(([k]) => VIEWS[k] && can(VIEW_RIGHT[k]))
    .map(([k, l]) => '<a href="#' + k + '" class="' + (v === k || (k === 'view' && v === 'rec') ? 'on' : '') + '">' + l + (badge[k] || '') + '</a>').join('');
}
function route() {
  if (!ME) return;
  let { v, param } = curView();
  if (!VIEWS[v]) v = 'view';
  if (!can(VIEW_RIGHT[v])) v = (VIEW_TABS.find(([k]) => VIEWS[k] && can(VIEW_RIGHT[k])) || [''])[0];
  renderTabs();
  if (!v) { setMain('<div class="panel empty">You do not have access to these screens. Ask the Admin to switch them on for you (Admin Panel › Tab Visibility, or Users › Apps).' + (DB.fmsErr || DB.ttErr ? '<div class="small muted" style="margin-top:6px">' + esc([DB.fmsErr, DB.ttErr].filter(Boolean).join(' · ')) + '</div>' : '') + '</div>'); return; }
  try { VIEWS[v].render(param); } catch (e) { console.error(e); setMain('<div class="panel">Error: ' + esc(e.message) + '</div>'); }
}
window.addEventListener('hashchange', async () => {
  // Leaving the builder with unsaved work: ask first, and stay if the answer is no.
  if (typeof B !== 'undefined' && B.dirty && curView().v !== 'builder') {
    const to = location.hash;
    history.replaceState(null, '', '#builder');                // stay put while the question is open
    if (!(await askYes('The flow has unsaved changes. Leave and lose them?', 'Leave'))) return;
    B.dirty = false; B.draft = null;
    history.replaceState(null, '', to);
  }
  route();
});

/* ================= events ================= */
document.addEventListener('click', ev => {
  const segBtn = ev.target.closest('.seg button');
  if (segBtn && !segBtn.disabled) {
    const s = segBtn.parentElement; if (s.hasAttribute('data-locked')) return;
    $$('button', s).forEach(b => b.classList.toggle('on', b === segBtn));
    s.dispatchEvent(new CustomEvent('segchange', { bubbles: true, detail: segBtn.dataset.v }));
  }
  const el = ev.target.closest('[data-act]'); if (!el || el.disabled) return;
  if (el.dataset.confirm && !el.classList.contains('confirm')) {          // inline two-click confirm, no popup
    ev.preventDefault(); const old = el.textContent; el.classList.add('confirm'); el.textContent = el.dataset.confirm;
    setTimeout(() => { if (el.isConnected) { el.classList.remove('confirm'); el.textContent = old; } }, 3000); return;
  }
  const fn = ACTIONS[el.dataset.act]; if (fn) { ev.preventDefault(); fn(el, ev); }
});
document.addEventListener('segchange', e => { if (SEG_HANDLER && e.target.closest('#main') && !e.target.hasAttribute('data-own')) SEG_HANDLER(e); });
ACTIONS['go'] = el => go(el.dataset.v, el.dataset.p);
ACTIONS['refresh'] = async () => {
  if (typeof B !== 'undefined' && B.dirty) { flash('Save or discard the flow changes first.', 'err'); return; }
  busy(true, 'Loading…');
  try { await loadAll(); route(); flash('Refreshed.'); fmsAutoRun(); } catch (e) { flash(esc(e.message), 'err'); } finally { busy(false); }
};
ACTIONS['logout'] = async () => {
  if (!(await askYes('Do you want to Log out?\n\nYou will be logged out of all apps.', 'Log out'))) return;
  SARV_GATE.logout({ url: SUPABASE_URL, key: SUPABASE_ANON });
};
window.addEventListener('beforeunload', e => { if (typeof B !== 'undefined' && B.dirty) { e.preventDefault(); e.returnValue = ''; } });

/* ================= boot ================= */
(async function boot() {
  // Wait for the page's other scripts (fms-builder.js, fms-view.js, fms-tasks.js …): when the gate
  // answers at once, this would otherwise run before they have added their screens and loaders.
  if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
  // No app key: the server decides with each screen's right on every call.
  await SARV_GATE.boot({ url: SUPABASE_URL, key: SUPABASE_ANON, app: null, label: 'FMS' });
  $('#app').classList.remove('hidden');
  $('#who').textContent = (SARV_GATE.user || {}).name || '';
  // Inside the ERP the ERP has its own Log out; the page's own button is for the standalone tab.
  if (window.self !== window.top) $('#btnLogout').classList.add('hidden');
  try {
    await loadAll();
    route();
    fmsAutoRun();
  } catch (e) {
    setMain('<div class="panel setup"><b>FMS could not load.</b><div style="margin-top:6px">' + esc(e.message) + '</div></div>');
  } finally { if (window.sarvSsoPrebootDone) window.sarvSsoPrebootDone(); }
  // Back on the tab after a while: pick up other people's work (never over unsaved builder changes).
  let last = Date.now();
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || Date.now() - last < 60000 || (typeof B !== 'undefined' && B.dirty) || $('.dlg-back')) return;
    last = Date.now();
    try { await loadAll(); route(); fmsAutoRun(); } catch (e) { console.warn(e); }
  });
  setInterval(() => { if (curView().v !== 'builder') { RES_CACHE.clear(); fmsAutoRun(); } }, 60000);
})();
