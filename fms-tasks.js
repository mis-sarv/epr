/* fms-tasks.js — Task › Task Tracker, Escalations, Scorecard, Plan vs Actual
   (fms.html#tasks / #esc / #score / #pva).

   Ported from Nexus 2.0 (tasks.js › Task Tracker / Escalations / Scorecard,
   track.js › Plan vs Actual); the screens, columns, statuses, escalation
   levels and the score formula are the same. What feeds them here is this
   ERP's own work, one row per task:
   * FMS        every step of every record (fms_records, the FMS engine)
   * Checklist  Task Manager's daily / weekly / monthly / yearly tasks, one row
                per day it falls on, and EA (delegated) tasks — read with Task
                Manager's own tm_load, so its rights (managers see everyone,
                others themselves + buddies) and its data are used as they are.
                When a task is due, when it was done and its points follow
                task_manager.html exactly (occursOn / deadlineOf / taskScore,
                ported below; keep them in step with that file).
   * Complaints machine + fabric complaints (complaint.html): Assign → Resolve
                (by the expected completion) → Close / feedback, from
                tt_complaints. Task Tracker › Complaints is the full register
                with every detail and the photos.
   Server: sql/TASK_TRACKER_MIGRATION.sql (tt_* RPCs, tt_escalations).
   Rights: HOME_TASK_TRACKER / HOME_TT_ESCALATIONS / HOME_TT_SCORECARD /
   HOME_TT_PLANACTUAL open the screens; TT_ALL shows everybody (else one's own
   tasks); TT_SETUP changes the settings.

   One person, one name: every doer is the ERP login name in capitals. Task
   Manager employees are matched by Emp Code, complaint hosts / raisers by their
   complaint profile (app_users.cmp_profile_id); the app's own name is the
   fallback. */
'use strict';
const TT = { people: [], settings: {}, esc: [], tm: null, tmErr: '', cmp: [], cmpErr: '', from: '', to: '', rows: null, at: 0 };
const ttAll = () => can('TT_ALL');
const ttAddDays = (n, base) => { const d = base ? new Date(base) : new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
const ttCfg = () => Object.assign({ escAfterDays: 1, l1: '', weights: { completion: 0.35, onTime: 0.35, volume: 0.15, consistency: 0.15 }, cmpAssignHours: 4, cmpResolveDays: 1, cmpCloseDays: 1 }, TT.settings || {});
const selOpts = (list, cur, all) => '<option value="">' + esc(all) + '</option>' + list.map(v => '<option' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>').join('');

/* ================= loading ================= */
// Called by loadAll (fms-core.js). People, settings and tickets, then the
// date range of Task Manager and complaints.
async function ttLoad() {
  const d = await rpc('tt_data');
  TT.people = d.people || []; TT.settings = d.settings || {}; TT.esc = d.escalations || [];
  ttIndex();
  if (!TT.from) { TT.from = ymdOf(ttAddDays(-62)); TT.to = ymdOf(ttAddDays(14)); }
  await ttLoadRange(TT.from, TT.to);
  return d;
}
// Task Manager (tm_load) and complaints (tt_complaints) for a date range.
// Each may fail on its own (no Task Manager app for this login, …): its rows
// are left out and the screen says why.
async function ttLoadRange(from, to) {
  const [tm, cm] = await Promise.allSettled([rpc('tm_load', { p_from: from, p_to: to }), rpc('tt_complaints', { p_from: from, p_to: to })]);
  if (tm.status === 'fulfilled') { TT.tm = ttTmPrep(tm.value); TT.tmErr = ''; }
  else { TT.tm = null; TT.tmErr = /NO_APP_ACCESS/.test(tm.reason && (tm.reason.code || tm.reason.message)) ? 'Task Manager tasks are not shown: this login has no Task Manager / My Tasks app.' : 'Task Manager: ' + ((tm.reason && tm.reason.message) || 'not available'); }
  if (cm.status === 'fulfilled') { TT.cmp = cm.value.rows || []; TT.cmpErr = ''; } else { TT.cmp = []; TT.cmpErr = 'Complaints: ' + ((cm.reason && cm.reason.message) || 'not available'); }
  TT.from = from; TT.to = to; TT.rows = null;
}
// A screen asks for dates outside what is loaded: load the wider range first.
async function ttEnsure(from, to) {
  if (from >= TT.from && to <= TT.to) return false;
  const f = from < TT.from ? from : TT.from, t = to > TT.to ? to : TT.to;
  if ((new Date(t) - new Date(f)) / 86400000 > 480) { flash('Pick at most about 16 months at a time.', 'err'); return false; }
  busy(true, 'Loading…'); try { await ttLoadRange(f, t); } catch (e) { flash(esc(e.message), 'err'); } finally { busy(false); }
  return true;
}
const TT_BY = { emp: new Map(), cmp: new Map(), name: new Map() };
function ttIndex() {
  TT_BY.emp.clear(); TT_BY.cmp.clear(); TT_BY.name.clear();
  TT.people.forEach(p => { TT_BY.name.set(norm(p.name), p); if (p.emp_code) TT_BY.emp.set(p.emp_code, p); if (p.cmp_profile_id) TT_BY.cmp.set(p.cmp_profile_id, p); });
}
const ttNameOfEmp = (code, fb) => { const p = code && TT_BY.emp.get(String(code).toUpperCase()); return p ? p.name : String(fb || code || '').toUpperCase(); };
const ttNameOfCmp = (id, fb) => { const p = id && TT_BY.cmp.get(id); return p ? p.name : String(fb || '').toUpperCase(); };
function ttDept(name, fb) { const p = TT_BY.name.get(norm(name)); return (p && p.department) || fb || ''; }

/* ================= Task Manager rules (ported from task_manager.html) ================= */
const TM_RULE_DEFAULT = { baseScore: 100, graceHours: 3, gracePenalty: 20, type: 'hour', penalty: 20, minPoints: null };
const TM_CATS = ['daily', 'weekly', 'monthly', 'yearly', 'ea'];
const TM_RECUR = { daily: 1, weekly: 1, monthly: 1, yearly: 1 };
function tmMergeRules(v) {
  const out = {};
  TM_CATS.forEach(c => {
    const s = (v && typeof v === 'object' && v[c]) || {};
    const r = Object.assign({}, TM_RULE_DEFAULT, c === 'ea' ? { postponePenalty: 10 } : {}, s);
    ['baseScore', 'graceHours', 'gracePenalty', 'penalty', 'postponePenalty'].forEach(k => { if (r[k] != null) r[k] = Math.max(0, Number(r[k]) || 0); });
    r.minPoints = (r.minPoints === null || r.minPoints === '' || r.minPoints === undefined || !isFinite(Number(r.minPoints))) ? null : Math.round(Number(r.minPoints));
    if (r.type !== 'day') r.type = 'hour';
    if (!r.baseScore) r.baseScore = 100;
    out[c] = r;
  });
  return out;
}
function tmParse12h(tm) { const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(tm || '').trim()); if (!m) return null; let h = parseInt(m[1], 10) % 12; if (m[3].toUpperCase() === 'PM') h += 12; return { h, m: parseInt(m[2], 10) }; }
function tmDateAt(ds, h, mi) { const [y, mo, d] = String(ds).split('-').map(Number); return new Date(y, mo - 1, d, h || 0, mi || 0, 0, 0); }
function tmRulesFor(t, ds) {
  const cat = t.frequency === 'self' ? 'daily' : (TM_CATS.includes(t.frequency) ? t.frequency : 'daily');
  const created = t.createdAt ? new Date(t.createdAt) : null; let at;
  if (TM_RECUR[t.frequency || 'daily']) { at = tmDateAt(ds); if (created && created > at) at = created; }
  else at = created || tmDateAt(t.assignedDate || ds);
  let v = null; for (const x of TT.tm.versions) { if (x.at <= at) v = x; else break; }
  return Object.assign({}, tmMergeRules(v ? v.value : null)[cat], { cat });
}
function tmDeadline(t, ds, rec) { const fu = rec && (rec.status === 'pending-reschedule' || rec.status === 'rescheduled-done') && rec.time; const p = tmParse12h(fu || t.time); return p ? tmDateAt(ds, p.h, p.m) : tmDateAt(ds, 23, 59); }
function tmDoneMoment(rec, ds) { if (rec.doneAt) return new Date(rec.doneAt); const p = tmParse12h(rec.legacyTime); const day = rec.completedDate || ds; if (p) return tmDateAt(day, p.h, p.m); return rec.updatedAt ? new Date(rec.updatedAt) : tmDateAt(day, 23, 59); }
function tmScoreAt(t, ds, rec, when) {
  const r = tmRulesFor(t, ds); const base = r.baseScore, gMs = r.graceHours * 3600000, unitMs = (r.type === 'day' ? 1440 : 60) * 60000;
  const dl = tmDeadline(t, ds, rec), graceEnd = new Date(dl.getTime() + gMs);
  const postpones = (t.frequency === 'ea' && t.isPostponed) ? Math.max(1, (t.postponeHistory || []).length - 1) : 0; const extra = postpones * (r.postponePenalty || 0);
  let phase, cut = 0, units = 0;
  if (when <= dl) phase = 'on-time'; else if (when <= graceEnd && gMs > 0) { phase = 'grace'; cut = r.gracePenalty; } else { phase = 'late'; cut = r.gracePenalty; units = Math.max(1, Math.ceil((when - graceEnd) / unitMs)); }
  const raw = base - cut - units * r.penalty - extra; const pts = r.minPoints != null && raw <= r.minPoints ? r.minPoints : raw;
  return { pts, base, phase, deadline: dl, extra };
}
// done / upcoming / overdue / missed / moved — as Task Manager shows it.
function tmTaskScore(t, ds, rec, now) {
  if (rec && rec.status === 'rescheduled') return { state: 'moved', pts: 0, base: 0 };
  if (rec && rec.checked) { const w = tmDoneMoment(rec, ds); return Object.assign({ state: 'done', doneAt: w }, tmScoreAt(t, ds, rec, w)); }
  const s = tmScoreAt(t, ds, rec, now);
  if (now <= s.deadline) return Object.assign({}, s, { state: 'upcoming' });
  return Object.assign({}, s, { state: ds < TT.tm.today ? 'missed' : 'overdue' });
}
// Does this task land on this day? (Task Manager's taskAppliesToDate + occursOn.)
// A monthly day saved as "08" is read as 8 here (and in task_manager.html).
function tmApplies(t, y, m, d) {
  const dStr = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  if (t.assignedDate && dStr < t.assignedDate) return false;
  const f = t.frequency || 'daily';
  if (f === 'daily') return true;
  if (f === 'weekly') return new Date(y, m - 1, d).getDay().toString() === String(t.freqValue);
  if (f === 'monthly') return d === parseInt(t.freqValue, 10);
  if (f === 'yearly' || f === 'ea' || f === 'self') {
    if (f === 'ea' && t.isPostponed && dStr >= t.originalTargetDate && dStr <= t.freqValue) return true;
    if (!t.freqValue) return false;
    const [ty, tm, td] = String(t.freqValue).split('-');
    if (ty.length === 4) return y === +ty && m === parseInt(tm, 10) && d === parseInt(td, 10);
    return m === +ty && d === parseInt(tm, 10);
  }
  return true;
}
function tmOccurs(t, ds, rec) {
  const [y, m, d] = ds.split('-').map(Number);
  const isR = rec && (rec.status === 'pending-reschedule' || rec.status === 'rescheduled-done' || rec.status === 'rescheduled');
  if (t.active === false && t.deactivatedAt && ds >= ymdOf(new Date(t.deactivatedAt))) return false;
  if (!(tmApplies(t, y, m, d) || isR)) return false;
  if (t.frequency === 'ea' && t.isPostponed && ds !== t.freqValue && !isR) return false;
  return true;
}
function tmFreqText(t) { const f = t.frequency || 'daily'; if (f === 'daily') return 'Daily'; if (f === 'weekly') return 'Weekly (' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][parseInt(t.freqValue, 10)] + ')'; if (f === 'monthly') return 'Monthly (' + t.freqValue + ')'; if (f === 'ea' && t.isPostponed) return 'EA (postponed to ' + t.freqValue + ')'; return f.toUpperCase() + ' (' + t.freqValue + ')'; }
function ttTmPrep(d) {
  return {
    today: d.today || todayYmd(), me: d.me || {}, buddies: d.buddies || [],
    versions: (d.scoreVersions || []).map(v => ({ at: new Date(v.effectiveAt), value: v.value || {} })).sort((a, b) => a.at - b.at),
    employees: d.employees || []
  };
}

/* ================= every task, one row each (Nexus allTasks) ================= */
// { key, src, kind, task, ref, party, doer, owner, dept, planned, actual, done, late, delay, status, by, team, act, tm, open() }
function ttTasks() {
  if (TT.rows && Date.now() - TT.at < 15000) return TT.rows;
  const now = new Date(); const cal = calInfo(); const out = [];
  const wm = (a, b) => { try { return cal.workMinutesBetween(a, b); } catch (e) { return Math.round((b - a) / 60000); } };
  const push = x => {
    x.doer = String(x.doer || '').toUpperCase(); x.owner = String(x.owner || x.doer || '').toUpperCase(); x.done = !!x.actual;
    x.dept = x.dept || ttDept(x.doer);
    x.delay = x.planned ? (x.actual ? (x.actual > x.planned ? wm(x.planned, x.actual) : 0) : (now > x.planned ? wm(x.planned, now) : 0)) : 0;
    x.late = x.delay > 0;
    x.status = x.done ? (x.late ? 'Done late' : 'Done on time') : !x.planned ? 'Waiting' : x.late ? 'Delayed' : ymdOf(x.planned) === todayYmd() ? 'Pending' : 'Upcoming';
    out.push(x);
  };
  // FMS steps
  Store.all('records').forEach(o => {
    const r = resolveRec(o); if (!r || r.priority.cancelled) return;
    const flow = (r.spec.process && r.spec.process.name) || o.process_code; const lf = listFields(r.spec);
    r.order.forEach(id => {
      const s = r.steps[id]; if (!s || !['Pending', 'Late', 'Done'].includes(s.status)) return;
      const by = (o.done_by || {})[id] || '';
      push({ key: 'fms|' + o.id + '|' + id, src: 'FMS', kind: 'fms', act: 'fms:' + o.process_code, actLabel: 'FMS · ' + flow, task: s.name, ref: o.rec_no, party: lf.map(f => (o.fields || {})[f.key]).filter(Boolean).join(' / '),
        doer: s.doer || (s.actual ? by : ''), owner: s.doer || '', by, planned: s.planned ? new Date(s.planned) : null, actual: s.actual ? new Date(s.actual) : null, link: '#rec/' + o.id });
    });
  });
  // Task Manager: checklist, EA, self — one row per day it falls on
  if (TT.tm) {
    const days = []; for (let d = new Date(TT.from + 'T00:00:00'); ymdOf(d) <= TT.to; d.setDate(d.getDate() + 1)) days.push(ymdOf(d));
    const buddyOf = (code, ds) => TT.tm.buddies.find(b => b.primaryEmpCode === code && ds >= b.startDate && ds <= b.endDate);
    TT.tm.employees.forEach(emp => {
      const owner = ttNameOfEmp(emp.empCode, emp.empName);
      (emp.tasks || []).forEach(t => {
        const f = t.frequency || 'daily'; const kind = f === 'ea' ? 'ea' : f === 'self' ? 'self' : 'check';
        days.forEach(ds => {
          const rec = (emp.records[ds] || {})[t.id];
          if (!tmOccurs(t, ds, rec)) return;
          const sc = tmTaskScore(t, ds, rec, now); if (sc.state === 'moved') return;
          // A buddy does the owner's work on those days; a personal (self) task stays with its owner.
          const bd = kind !== 'self' && buddyOf(emp.empCode, ds); const doer = bd ? ttNameOfEmp(bd.buddyEmpCode, bd.buddyEmpCode) : owner;
          push({ key: 'tm|' + emp.empCode + '|' + t.id + '|' + ds, src: kind === 'ea' ? 'Delegation (EA)' : kind === 'self' ? 'Self task' : 'Checklist', kind: 'tm', act: kind === 'ea' ? 'tm_ea' : kind === 'self' ? 'tm_self' : 'tm_check',
            task: t.desc, ref: tmFreqText(t), party: kind === 'ea' && t.plannedBy ? 'by ' + t.plannedBy : bd ? 'buddy for ' + owner : '', doer, owner, dept: ttDept(doer, emp.dept),
            by: rec && rec.checked ? (rec.doneBy || '') : '', planned: sc.deadline, actual: sc.state === 'done' ? sc.doneAt : null, self: kind === 'self',
            tm: { emp, t, ds, rec, sc } });
        });
      });
    });
  }
  // Complaints: Assign → Resolve → Close
  const C = ttCfg();
  TT.cmp.forEach(c => {
    const base = { kind: 'cmp', ref: c.complaint_no, party: c.what || '', cmp: c, src: c.kind === 'fabric' ? 'Complaint · Fabric' : 'Complaint · Machine' };
    const raised = c.created_at ? new Date(c.created_at) : null; if (!raised) return;
    const team = c.kind === 'fabric' ? 'FABRIC TRIAGE' : 'MAINTENANCE';
    push(Object.assign({}, base, { key: 'cmp|' + c.id + '|assign', act: 'cmp_assign', task: 'Assign complaint', doer: team, team: true, by: c.assigned_by_name || '',
      start: raised, planned: calInfo().addTat(raised, { value: C.cmpAssignHours, unit: 'hours' }), actual: c.assigned_at ? new Date(c.assigned_at) : (c.host_user_id ? new Date(c.updated_at) : null) }));
    if (c.host_user_id || c.host_name) {
      const st = c.assigned_at ? new Date(c.assigned_at) : raised; const host = ttNameOfCmp(c.host_user_id, c.host_name);
      push(Object.assign({}, base, { key: 'cmp|' + c.id + '|resolve', act: 'cmp_resolve', task: 'Resolve complaint', doer: host, dept: ttDept(host, c.department), by: c.completed_at ? host : '',
        start: st, planned: c.expected_completion ? new Date(c.expected_completion) : calInfo().addTat(st, { value: C.cmpResolveDays, unit: 'days' }), actual: c.completed_at ? new Date(c.completed_at) : null }));
    }
    if (c.completed_at) {
      const st = new Date(c.completed_at); const raiser = ttNameOfCmp(c.raised_by_user_id, c.raised_by_name || c.entered_by);
      push(Object.assign({}, base, { key: 'cmp|' + c.id + '|close', act: 'cmp_close', task: 'Feedback & close', doer: raiser, by: c.closed_at ? raiser : '',
        start: st, planned: calInfo().addTat(st, { value: C.cmpCloseDays, unit: 'days' }), actual: c.closed_at ? new Date(c.closed_at) : null }));
    }
  });
  const me = norm(ME.name);
  // Without TT_ALL: only one's own (as doer or owner). TT.allRows keeps every row for the detail cards
  // (a complaint's other stages), which the server has already limited to complaints I raised or host.
  TT.allRows = out;
  TT.rows = ttAll() ? out : out.filter(x => norm(x.doer) === me || norm(x.owner) === me);
  TT.at = Date.now();
  return TT.rows;
}
const ttRowCls = s => s === 'Done on time' ? 'Done' : s === 'Done late' ? 'Pending' : s === 'Delayed' ? 'Late' : s === 'Pending' ? 'Pending' : 'Waiting';
// Badges on the page tabs: my delayed tasks, my open tickets.
function ttBadges() {
  if (!TT.people.length) return {};
  const me = norm(ME.name); const b = {};
  try { const n = ttTasks().filter(x => !x.done && x.status === 'Delayed' && !x.self && norm(x.doer) === me).length; if (n) b.tasks = '<span class="cnt late" title="My delayed tasks">' + n + '</span>'; } catch (e) { }
  const e = TT.esc.filter(x => x.status === 'Open' && (ttAll() || norm(x.doer) === me || norm(x.l1) === me)).length; if (e) b.esc = '<span class="cnt late" title="Open escalations">' + e + '</span>';
  return b;
}
function ttNotes() { const n = [TT.tmErr, TT.cmpErr, DB.fmsErr ? 'FMS: ' + DB.fmsErr : ''].filter(Boolean); return n.length ? '<div class="panel setup small" style="margin-bottom:10px">' + n.map(esc).join('<br>') + '</div>' : ''; }
// The Open link / button of a row.
function ttOpenCell(x) {
  if (x.kind === 'fms') return '<a href="' + esc(x.link) + '">Open</a>';
  return '<a data-act="tt-open" data-k="' + esc(x.key) + '">Open</a>';
}
ACTIONS['tt-open'] = el => { const x = (ttTasks(), TT.allRows || []).find(r => r.key === el.dataset.k); if (!x) return; if (x.kind === 'cmp') ttCmpDetail(x.cmp); else if (x.kind === 'tm') ttTmDetail(x); };

/* ================= Task Tracker ================= */
const AT_UI = { tab: 'tasks', src: '', st: 'open', who: '', dept: '', from: '', to: '', q: '', cst: 'open', ck: '' };
VIEWS.tasks = {
  render(param) {
    if (param) { AT_UI.who = param.toUpperCase(); AT_UI.st = 'all'; AT_UI.tab = 'tasks'; }
    if (!AT_UI.from) { AT_UI.from = ymdOf(ttAddDays(-30)); AT_UI.to = ymdOf(ttAddDays(7)); }
    if (!TT.people.length) { setMain('<div class="panel setup">Task Tracker is not set up yet. ' + esc(DB.ttErr || '') + '</div>'); return; }
    const all = ttAll(); if (!all) AT_UI.who = ME.name;
    let h = '<div class="toolbar">' + seg('atTab', [{ v: 'tasks', l: 'All Tasks' }, { v: 'cmp', l: 'Complaints' }], AT_UI.tab) + '<span class="grow"></span><button class="btn sm" data-act="refresh">Refresh</button></div>' + ttNotes();
    if (AT_UI.tab === 'cmp') h += ttCmpListHtml();
    else {
      const f = new Date(AT_UI.from + 'T00:00:00'), t = new Date(AT_UI.to + 'T23:59:59'); const q = norm(AT_UI.q);
      const escBy = new Map(TT.esc.map(e => [e.key, e])); const base = ttTasks();
      const rows = base.filter(x => (!x.planned || (x.planned >= f && x.planned <= t)) && (!AT_UI.src || x.src === AT_UI.src) && (!AT_UI.who || norm(x.doer) === norm(AT_UI.who) || norm(x.owner) === norm(AT_UI.who)) && (!AT_UI.dept || x.dept === AT_UI.dept) &&
        (AT_UI.st === 'all' || (AT_UI.st === 'open' ? !x.done && x.status !== 'Upcoming' : AT_UI.st === 'delayed' ? x.status === 'Delayed' : AT_UI.st === 'upcoming' ? x.status === 'Upcoming' : AT_UI.st === 'late' ? x.late : x.done)) &&
        (!q || norm([x.task, x.ref, x.party, x.doer, x.src].join(' ')).includes(q))).sort((a, b) => (b.delay - a.delay) || ((a.planned || 0) - (b.planned || 0)));
      VIEWS.tasks.rows = rows;
      const srcs = Array.from(new Set(base.map(x => x.src))).sort(); const depts = Array.from(new Set(base.map(x => x.dept).filter(Boolean))).sort();
      const doers = Array.from(new Set(base.map(x => x.doer).filter(Boolean))).sort();
      h += '<div class="toolbar">' + seg('atSt', [{ v: 'open', l: 'Open' }, { v: 'delayed', l: 'Delayed' }, { v: 'upcoming', l: 'Upcoming' }, { v: 'done', l: 'Done' }, { v: 'late', l: 'Late' }, { v: 'all', l: 'All' }], AT_UI.st) +
        '<select id="atSrc">' + selOpts(srcs, AT_UI.src, 'All sources') + '</select>' + (all ? '<select id="atWho">' + selOpts(doers, AT_UI.who, 'All doers') + '</select><select id="atDept">' + selOpts(depts, AT_UI.dept, 'All departments') + '</select>' : '') +
        '<input id="atFrom" type="date" value="' + esc(AT_UI.from) + '"><input id="atTo" type="date" value="' + esc(AT_UI.to) + '"><input id="atQ" placeholder="Search…" value="' + esc(AT_UI.q) + '"><span class="muted small">' + rows.length + ' task(s)</span><span class="grow"></span><button class="btn sm" data-act="at-csv">Export CSV</button></div>';
      h += '<div class="tbl-wrap tt-wrap"><table><tr><th>Source</th><th>Task</th><th>Reference</th><th>Party</th><th>Doer</th><th>Department</th><th>Planned</th><th>Actual</th><th>Status</th><th class="num">Delay</th><th>Escalation</th><th></th></tr>' +
        (rows.length ? rows.slice(0, 1500).map(x => { const e = escBy.get(x.key);
          return '<tr><td>' + esc(x.src) + '</td><td class="wrap">' + esc(x.task) + '</td><td><b>' + esc(x.ref) + '</b></td><td>' + esc(x.party) + '</td><td>' + (x.doer ? esc(x.doer) : '<span class="late-txt">Not set</span>') + '</td><td>' + esc(x.dept) + '</td>' +
            '<td class="nowrap">' + (x.planned ? fmtDT(x.planned) : '') + '</td><td class="nowrap">' + (x.actual ? fmtDT(x.actual) : '') + '</td><td><span class="st ' + ttRowCls(x.status) + '">' + x.status + '</span></td>' +
            '<td class="num' + (x.delay ? ' late-txt' : '') + '">' + (x.delay ? fmtDelay(x.delay) : '') + '</td><td>' + (e ? '<a href="#esc">' + esc(e.esc_no) + ' · L' + e.level + (e.status === 'Open' ? '' : ' ✓') + '</a>' : '') + '</td><td>' + ttOpenCell(x) + '</td></tr>'; }).join('') +
          (rows.length > 1500 ? '<tr><td colspan="12" class="empty">First 1500 of ' + rows.length + ' shown. Narrow the dates or filters, or Export CSV for all.</td></tr>' : '')
          : '<tr><td colspan="12" class="empty">No tasks</td></tr>') + '</table></div>';
    }
    setMain(h);
    onSeg(e => { const s = e.target.dataset.seg; if (s === 'atTab') AT_UI.tab = e.detail; if (s === 'atSt') AT_UI.st = e.detail; if (s === 'cSt') AT_UI.cst = e.detail; if (s === 'cK') AT_UI.ck = e.detail; VIEWS.tasks.render(); });
    $$('#atSrc,#atWho,#atDept,#atFrom,#atTo').forEach(i => i.addEventListener('change', async e => {
      const k = { atSrc: 'src', atWho: 'who', atDept: 'dept', atFrom: 'from', atTo: 'to' }[e.target.id]; AT_UI[k] = e.target.value;
      if ((k === 'from' || k === 'to') && AT_UI.from && AT_UI.to) await ttEnsure(AT_UI.from, AT_UI.to);
      VIEWS.tasks.render();
    }));
    const qi = $('#atQ') || $('#cQ'); if (qi) qi.addEventListener('input', e => { AT_UI.q = e.target.value; clearTimeout(AT_UI.t); AT_UI.t = setTimeout(() => { VIEWS.tasks.render(); const i = $('#atQ') || $('#cQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); });
  }
};
ACTIONS['at-csv'] = () => downloadCsv('task-tracker-' + todayYmd() + '.csv', [['Source', 'Task', 'Reference', 'Party', 'Doer', 'Department', 'Planned', 'Actual', 'Status', 'Delay (min)', 'Done By']]
  .concat((VIEWS.tasks.rows || []).map(x => [x.src, x.task, x.ref, x.party, x.doer, x.dept, x.planned ? fmtDT(x.planned) : '', x.actual ? fmtDT(x.actual) : '', x.status, x.delay || 0, x.by || ''])));

/* ---------- Complaints register ---------- */
const CMP_ST = c => c.closed_at || c.status === 'Closed' ? 'Closed' : c.status || 'Pending';
const cmpCls = s => s === 'Closed' ? 'Done' : s === 'Completed' ? 'Pending' : s === 'In Progress' ? 'Pending' : 'Late';
function ttCmpListHtml() {
  const q = norm(AT_UI.q);
  const rows = TT.cmp.filter(c => (!AT_UI.ck || c.kind === AT_UI.ck) && (AT_UI.cst === 'all' || (AT_UI.cst === 'open' ? CMP_ST(c) !== 'Closed' : CMP_ST(c) === AT_UI.cst)) &&
    (!q || norm([c.complaint_no, c.what, c.machine_no, c.problem_desc, c.host_name, c.raised_by_name, c.entered_by, c.department, c.unit, c.lot_card_no].join(' ')).includes(q)));
  VIEWS.tasks.crows = rows;
  const late = c => !c.completed_at && c.expected_completion && new Date(c.expected_completion) < new Date();
  let h = '<div class="toolbar">' + seg('cSt', [{ v: 'open', l: 'Open' }, { v: 'Pending', l: 'Pending' }, { v: 'In Progress', l: 'In Progress' }, { v: 'Completed', l: 'Completed' }, { v: 'Closed', l: 'Closed' }, { v: 'all', l: 'All' }], AT_UI.cst) +
    seg('cK', [{ v: '', l: 'All' }, { v: 'machine', l: 'Machine' }, { v: 'fabric', l: 'Fabric' }], AT_UI.ck) + '<input id="cQ" placeholder="Search…" value="' + esc(AT_UI.q) + '"><span class="muted small">' + rows.length + ' complaint(s) · raised ' + fmtD(TT.from) + ' – ' + fmtD(TT.to) + ' + all open</span><span class="grow"></span><button class="btn sm" data-act="cmp-csv">Export CSV</button></div>';
  h += '<div class="tbl-wrap tt-wrap"><table><tr><th>Complaint No</th><th>Type</th><th>Raised</th><th>Raised By</th><th>Department</th><th>Unit</th><th>Machine / Process</th><th>Machine No / Lot</th><th>Problem</th><th>Complaint Type</th><th>Host</th><th>Assigned</th><th>Expected</th><th>Completed</th><th>Closed</th><th>Status</th><th class="num">Photos</th><th></th></tr>' +
    (rows.length ? rows.map(c => '<tr class="click" data-act="cmp-open" data-id="' + esc(c.id) + '"><td><b>' + esc(c.complaint_no || '') + '</b></td><td>' + (c.kind === 'fabric' ? 'Fabric' : 'Machine') + '</td><td class="nowrap">' + fmtDT(c.created_at) + '</td><td>' + esc(ttNameOfCmp(c.raised_by_user_id, c.raised_by_name || c.entered_by)) + '</td><td>' + esc(c.department || '') + '</td><td>' + esc(c.unit || '') + '</td>' +
      '<td>' + esc(c.what || '') + '</td><td>' + esc(c.machine_no || c.lot_card_no || '') + '</td><td class="wrap tt-desc">' + esc(c.problem_desc || '') + '</td><td>' + esc(c.complaint_type || '') + '</td><td>' + esc(c.host_name || '') + '</td>' +
      '<td class="nowrap">' + fmtDT(c.assigned_at) + '</td><td class="nowrap' + (late(c) ? ' late-txt' : '') + '">' + fmtDT(c.expected_completion) + '</td><td class="nowrap">' + fmtDT(c.completed_at) + '</td><td class="nowrap">' + fmtDT(c.closed_at) + '</td><td><span class="st ' + cmpCls(CMP_ST(c)) + '">' + esc(CMP_ST(c)) + '</span></td><td class="num">' + (c.photos || '') + '</td><td><a>Details</a></td></tr>').join('')
      : '<tr><td colspan="18" class="empty">No complaints</td></tr>') + '</table></div>';
  return h;
}
ACTIONS['cmp-open'] = el => { const c = TT.cmp.find(x => x.id === el.dataset.id); if (c) ttCmpDetail(c); };
ACTIONS['cmp-csv'] = () => downloadCsv('complaints-' + todayYmd() + '.csv', [['Complaint No', 'Type', 'Raised', 'Raised By', 'Department', 'Unit', 'Machine / Process', 'Machine No / Lot', 'Problem', 'Complaint Type', 'Host', 'Assigned', 'Expected', 'Completed', 'Completion Remarks', 'Closed', 'Feedback', 'Status']]
  .concat((VIEWS.tasks.crows || []).map(c => [c.complaint_no, c.kind, fmtDT(c.created_at), ttNameOfCmp(c.raised_by_user_id, c.raised_by_name || c.entered_by), c.department, c.unit, c.what, c.machine_no || c.lot_card_no, c.problem_desc, c.complaint_type, c.host_name, fmtDT(c.assigned_at), fmtDT(c.expected_completion), fmtDT(c.completed_at), c.completion_remarks, fmtDT(c.closed_at), c.feedback_remarks, CMP_ST(c)])));
// Everything about one complaint, its stages with plan / actual, then its photos.
function ttCmpDetail(c) {
  const kv = (k, v) => v == null || v === '' ? '' : '<tr><td class="k">' + esc(k) + '</td><td class="v">' + esc(v) + '</td></tr>';
  const rows = (ttTasks(), TT.allRows || []).filter(x => x.kind === 'cmp' && x.cmp.id === c.id);
  const old = $('#cmpDlg'); if (old) old.remove();
  const d = document.createElement('div'); d.id = 'cmpDlg'; d.className = 'dlg-back';
  d.innerHTML = '<div class="dlg tt-dlg"><div class="dlg-h">' + esc(c.complaint_no || '') + ' · ' + (c.kind === 'fabric' ? 'Fabric' : 'Machine') + ' complaint <span class="st ' + cmpCls(CMP_ST(c)) + '">' + esc(CMP_ST(c)) + '</span></div>' +
    '<div class="grid2"><table class="jckv">' + kv('Raised', fmtDT(c.created_at)) + kv('Problem date', fmtDT(c.problem_date)) + kv('Raised by', ttNameOfCmp(c.raised_by_user_id, c.raised_by_name || c.entered_by)) + kv('Entered by', c.entered_by) + kv('Department', c.department) + kv('Unit', c.unit) +
    kv(c.kind === 'fabric' ? 'Process' : 'Machine', c.what) + kv('Machine no', c.machine_no) + kv('Fabric quality', c.fabric_quality) + kv('Lot card no', c.lot_card_no) + kv('Complaint type', c.complaint_type) + kv('Problem', c.problem_desc) + kv('Remarks', c.remarks) + kv('Signature', c.signature ? c.signature + (c.signature_time ? ' · ' + fmtDT(c.signature_time) : '') : '') + '</table>' +
    '<table class="jckv">' + kv('Host (assigned to)', c.host_name) + kv('Assigned by', c.assigned_by_name) + kv('Assigned at', fmtDT(c.assigned_at)) + kv('Seen by host', fmtDT(c.seen_by_host_at)) + kv('Expected completion', fmtDT(c.expected_completion)) +
    kv('Completed', fmtDT(c.completed_at)) + kv('Completion remarks', c.completion_remarks) + kv('Closed', fmtDT(c.closed_at)) + kv('Feedback', c.feedback_at ? (c.feedback_resolved ? 'Resolved' : 'Not resolved') + (c.feedback_remarks ? ' — ' + c.feedback_remarks : '') + ' · ' + fmtDT(c.feedback_at) : '') + '</table></div>' +
    (rows.length ? '<h2>Plan vs actual</h2><div class="tbl-wrap"><table><tr><th>Stage</th><th>Doer</th><th>Planned</th><th>Actual</th><th>Status</th><th class="num">Delay</th></tr>' + rows.map(x => '<tr><td>' + esc(x.task) + '</td><td>' + esc(x.doer) + '</td><td class="nowrap">' + fmtDT(x.planned) + '</td><td class="nowrap">' + fmtDT(x.actual) + '</td><td><span class="st ' + ttRowCls(x.status) + '">' + x.status + '</span></td><td class="num late-txt">' + fmtDelay(x.delay) + '</td></tr>').join('') + '</table></div>' : '') +
    '<h2>Photos</h2><div id="cmpPh" class="tt-photos">' + (c.photos ? '<span class="muted small">Loading ' + c.photos + ' photo(s)…</span>' : '<span class="muted small">No photos</span>') + '</div>' +
    '<div class="dlg-f"><span class="grow"></span><a class="btn" href="complaint.html" target="_blank" rel="noopener">Open Complaint App</a><button class="btn primary" data-x>Close</button></div></div>';
  document.body.appendChild(d);
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-x]')) d.remove(); const im = e.target.closest('.tt-photos img'); if (im) window.open().document.write('<img src="' + im.src + '" style="max-width:100%">'); });
  rpc('tt_complaint_photos', { p_kind: c.kind, p_id: c.id }).then(r => {
    const box = $('#cmpPh', d); if (!box) return;
    const src = p => /^data:/.test(p.data || '') || /^https?:/.test(p.data || '') ? p.data : 'data:' + (p.mime || 'image/jpeg') + ';base64,' + (p.data || '');
    const list = (r.photos || []).map(p => '<figure><img src="' + esc(src(p)) + '" alt=""><figcaption>' + esc(p.type || '') + ' ' + fmtDT(p.at) + '</figcaption></figure>');
    if (r.signature_image) list.push('<figure><img src="' + esc(src({ data: r.signature_image, mime: 'image/png' })) + '" alt=""><figcaption>Signature</figcaption></figure>');
    box.innerHTML = list.length ? list.join('') : '<span class="muted small">No photos</span>';
  }).catch(e => { const box = $('#cmpPh', d); if (box) box.innerHTML = '<span class="late-txt small">' + esc(e.message) + '</span>'; });
}
// One Task Manager occurrence.
function ttTmDetail(x) {
  const { t, ds, rec, sc, emp } = x.tm; const kv = (k, v) => v == null || v === '' ? '' : '<tr><td class="k">' + esc(k) + '</td><td class="v">' + esc(v) + '</td></tr>';
  const pts = sc.state === 'upcoming' ? 'Worth ' + sc.pts + ' if done by ' + fmtDT(sc.deadline) : (sc.state === 'done' ? 'Gained ' : 'Worth now ') + sc.pts + ' of ' + sc.base + (sc.state === 'done' ? ' (' + ({ 'on-time': 'on time', grace: 'grace used', late: 'late' })[sc.phase] + ')' : '');
  askDlg_(x.src + ' · ' + emp.empName, '<table class="jckv">' + kv('Task', t.desc) + kv('Frequency', tmFreqText(t)) + kv('Day', fmtD(ds)) + kv('Target', fmtDT(sc.deadline)) + kv('Doer', x.doer) + kv('Employee', emp.empName + ' (' + emp.empCode + ')') +
    kv('Assigned by', t.plannedBy) + kv('Status', x.status) + kv('Done at', x.actual ? fmtDT(x.actual) : '') + kv('Done by', rec && rec.doneBy) + kv('Proof photo', rec && rec.hasProof ? 'Yes (open in Task Manager)' : '') + kv('Remarks', rec && rec.remarks) +
    kv('Follow-up', rec && rec.nextDate ? 'Moved to ' + rec.nextDate + (rec.nextTime ? ' ' + rec.nextTime : '') : '') + kv('Task Manager points', x.self ? 'Personal task, not scored' : pts) + '</table>' +
    '<div style="margin-top:8px"><a href="task_manager.html" target="_blank" rel="noopener">Open Task Manager</a></div>', 'Close');
}

/* ================= Escalations (Nexus) ================= */
// Level 1 owner: the setting, else the user whose designation is PC, else Level 2 (Admin).
const ttL2 = () => 'ADMIN';
function ttPc() { const c = ttCfg(); if (c.l1) return c.l1.toUpperCase(); const p = TT.people.find(x => /^PC$/i.test(String(x.designation || '').trim())); return p ? p.name : ''; }
function ttL1(doer) { const pc = ttPc(); return pc && norm(pc) !== norm(doer) ? pc : ttL2(); }
const ttAfter = () => Math.max(30, Math.round(num(ttCfg().escAfterDays) * (calInfo().dayMinutes || 480)));
const ttIsL2Owner = e => e.level === 2 && (isAdmin() || norm(e.l2) === norm(ME.name));
let TT_ESC_T = 0, TT_ESC_BUSY = false;
// Raise new tickets, resolve finished ones, move Level 1 → 2. Only on tasks this login can see.
async function ttEscRun(force) {
  if (TT_ESC_BUSY || !TT.people.length || (!force && Date.now() - TT_ESC_T < 60000)) return; TT_ESC_T = Date.now(); TT_ESC_BUSY = true;
  try {
    const after = ttAfter(); const cal = calInfo(); const now = new Date(); const items = [];
    const tasks = ttTasks(); const byKey = new Map(tasks.map(t => [t.key, t])); const have = new Set(TT.esc.map(e => e.key));
    const me = norm(ME.name);
    tasks.forEach(t => {
      if (t.done || !t.planned || t.team || t.self || !t.doer || t.delay <= after || have.has(t.key)) return;
      if (!ttAll() && norm(t.doer) !== me) return;
      if (now - t.planned > (t.kind === 'tm' && t.act === 'tm_check' ? 7 : 30) * 86400000) return;   // old misses are not raised again
      items.push({ op: 'raise', key: t.key, src: t.src, task: t.task, ref: t.ref, party: t.party, doer: t.doer, planned: t.planned.toISOString(), link: t.link || '', l1: ttL1(t.doer), l2: ttL2(), why: 'delayed ' + fmtDelay(t.delay) });
    });
    // A ticket's task is "known" when its source is loaded for that day.
    const known = e => { const k = e.key.split('|'); if (k[0] === 'fms') return !DB.fmsErr; if (k[0] === 'cmp') return !TT.cmpErr; if (k[0] === 'tm') return !!TT.tm && k[3] >= TT.from && k[3] <= TT.to; return false; };
    TT.esc.filter(e => e.status === 'Open' && (ttAll() || norm(e.doer) === me)).forEach(e => {
      const t = byKey.get(e.key);
      if (t && t.done) items.push({ op: 'resolve', key: e.key, at: t.actual.toISOString(), result: e.commit_at && t.actual <= new Date(e.commit_at) ? 'Done by new date' : 'Task done' });
      else if (!t && known(e) && (ttAll() || norm(e.doer) === me)) items.push({ op: 'resolve', key: e.key, result: 'Task closed' });
      else if (t && e.level === 1) {
        const due = e.commit_at ? new Date(e.commit_at) : null; let wmn = 0; try { wmn = cal.workMinutesBetween(new Date(e.raised_at), now); } catch (x) { }
        if ((due && now > due) || (!due && wmn > after)) items.push({ op: 'level2', key: e.key, why: due ? 'not done by new date ' + fmtDT(due) : 'no new date given in ' + ttCfg().escAfterDays + ' working day(s)' });
      }
    });
    if (!items.length) return;
    const r = await rpc('tt_esc_sync', { p_items: items });
    if (r.changed) { const d = await rpc('tt_data'); TT.esc = d.escalations || []; if (['tasks', 'esc', 'score'].includes(curView().v)) route(); else renderTabs(); }
  } catch (e) { console.warn('Escalations', e.message); } finally { TT_ESC_BUSY = false; }
}
setInterval(() => { if (ME && TT.people.length) ttEscRun(); }, 5 * 60000);
const ESC_UI = { f: 'open', tab: 'list' };
VIEWS.esc = {
  render() {
    if (!TT.people.length) { setMain('<div class="panel setup">Escalations are not set up yet. ' + esc(DB.ttErr || '') + '</div>'); return; }
    ttEscRun();
    const all = ttAll(); const me = norm(ME.name); const setup = can('TT_SETUP');
    let h = '<div class="toolbar">' + seg('escTab', [{ v: 'list', l: 'Escalations' }].concat(setup ? [{ v: 'setup', l: 'Setup' }] : []), ESC_UI.tab) + '<span class="grow"></span><button class="btn sm" data-act="refresh">Refresh</button></div>' + ttNotes();
    if (ESC_UI.tab === 'setup' && setup) h += ttEscSetupHtml();
    else {
      const list = TT.esc.filter(e => all || norm(e.doer) === me || norm(e.l1) === me || ttIsL2Owner(e)).sort((a, b) => (b.raised_at || '') < (a.raised_at || '') ? -1 : 1);
      const rows = list.filter(e => ESC_UI.f === 'all' || (ESC_UI.f === 'open' ? e.status === 'Open' : ESC_UI.f === 'l1' ? e.status === 'Open' && e.level === 1 : ESC_UI.f === 'l2' ? e.status === 'Open' && e.level === 2 : e.status === 'Resolved'));
      const n = f => list.filter(e => e.status === 'Open' && e.level === (f === 'l1' ? 1 : 2)).length;
      h += '<div class="toolbar">' + seg('escF', [{ v: 'open', l: 'Open' }, { v: 'l1', l: 'Level 1 · ' + n('l1') }, { v: 'l2', l: 'Level 2 · ' + n('l2') }, { v: 'done', l: 'Resolved' }, { v: 'all', l: 'All' }], ESC_UI.f) + '<span class="muted small">' + rows.length + ' ticket(s) · Level 1 after ' + esc(ttCfg().escAfterDays) + ' working day(s) of delay</span><span class="grow"></span><button class="btn sm" data-act="esc-csv">Export CSV</button></div>';
      VIEWS.esc.rows = rows;
      const now = new Date(); const cal = calInfo();
      h += '<div class="tbl-wrap tt-wrap"><table><tr><th>Ticket</th><th>Raised</th><th>Source</th><th>Task</th><th>Reference</th><th>Party</th><th>Doer</th><th>Planned</th><th class="num">Delay</th><th>Level</th><th>Level 1</th><th>New Date</th><th>Reason</th><th>Level 2</th><th>Status</th><th>Result</th><th></th></tr>' +
        (rows.length ? rows.map(e => {
          const end = e.resolved_at ? new Date(e.resolved_at) : now; let dl = 0; try { dl = cal.workMinutesBetween(new Date(e.planned), end); } catch (x) { }
          const canDate = e.status === 'Open' && e.level === 1 && !e.commit_at && (all || norm(e.doer) === me || norm(e.l1) === me || norm(e.l2) === me);
          const canRes = e.status === 'Open' && (setup || isAdmin() || ttIsL2Owner(e));
          const ref = e.link && e.link.charAt(0) === '#' ? '<a href="' + esc(e.link) + '">' + esc(e.ref) + '</a>' : esc(e.ref);
          return '<tr><td><b>' + esc(e.esc_no) + '</b></td><td class="nowrap">' + fmtDT(e.raised_at) + '</td><td>' + esc(e.src) + '</td><td class="wrap">' + esc(e.task) + '</td><td>' + ref + '</td><td>' + esc(e.party || '') + '</td><td>' + esc(e.doer) + '</td>' +
            '<td class="nowrap">' + fmtDT(e.planned) + '</td><td class="num late-txt">' + (dl ? fmtDelay(dl) : '') + '</td><td><span class="st ' + (e.status !== 'Open' ? 'Done' : e.level === 2 ? 'Late' : 'Pending') + '">L' + e.level + '</span></td><td>' + esc(e.l1 || '') + '</td>' +
            '<td class="nowrap">' + (e.commit_at ? fmtDT(e.commit_at) : '') + '</td><td class="wrap">' + esc(e.commit_why || '') + '</td><td>' + esc(e.l2 || '') + '</td><td>' + esc(e.status) + '</td><td class="wrap">' + esc(e.result || '') + (e.resolution ? ' — ' + esc(e.resolution) : '') + '</td>' +
            '<td class="nowrap">' + (canDate ? '<button class="btn sm" data-act="esc-date" data-id="' + esc(e.id) + '">New date</button> ' : '') + (canRes ? '<button class="btn sm primary" data-act="esc-resolve" data-id="' + esc(e.id) + '">Resolve</button> ' : '') + '<a class="small" data-act="esc-hist" data-id="' + esc(e.id) + '">Log</a></td></tr>';
        }).join('') : '<tr><td colspan="17" class="empty">No escalations</td></tr>') + '</table></div>';
    }
    setMain(h);
    onSeg(e => { const s = e.target.dataset.seg; if (s === 'escTab') ESC_UI.tab = e.detail; if (s === 'escF') ESC_UI.f = e.detail; VIEWS.esc.render(); });
  }
};
function ttEscPut(row) { const i = TT.esc.findIndex(x => x.id === row.id); if (i >= 0) TT.esc[i] = row; else TT.esc.unshift(row); }
ACTIONS['esc-date'] = async el => {
  const e = TT.esc.find(x => x.id === el.dataset.id); if (!e) return;
  const v = await askDlg_(e.esc_no + ' · New date', '<label>New date &amp; time<input id="escAt" type="datetime-local"></label><label style="margin-top:8px">Reason<textarea id="escWhy" rows="3"></textarea></label>', 'Save', '#escAt', d => {
    const at = $('#escAt', d).value, why = $('#escWhy', d).value.trim(); const dt = new Date(at);
    if (!at || isNaN(dt) || dt <= new Date()) { $('#askMsg', d).textContent = 'Pick a future date and time.'; return undefined; }
    if (!why) { $('#askMsg', d).textContent = 'Give the reason.'; return undefined; }
    return { at: dt.toISOString(), why };
  });
  if (!v) return; busy(true, 'Saving…');
  try { const r = await rpc('tt_esc_date', { p_id: e.id, p_at: v.at, p_why: v.why }); ttEscPut(r.escalation); flash(esc(e.esc_no) + ': new date saved.'); } catch (x) { flash(esc(x.message), 'err'); } finally { busy(false); route(); }
};
ACTIONS['esc-resolve'] = async el => {
  const e = TT.esc.find(x => x.id === el.dataset.id); if (!e) return;
  const why = await askDlg_(e.esc_no + ' · Resolve', '<label>Resolution<textarea id="escRes" rows="3"></textarea></label>', 'Resolve', '#escRes', d => { const w = $('#escRes', d).value.trim(); if (!w) { $('#askMsg', d).textContent = 'Write the resolution.'; return undefined; } return w; });
  if (!why) return; busy(true, 'Saving…');
  try { const r = await rpc('tt_esc_resolve', { p_id: e.id, p_why: why }); ttEscPut(r.escalation); flash(esc(e.esc_no) + ' resolved.'); } catch (x) { flash(esc(x.message), 'err'); } finally { busy(false); route(); }
};
ACTIONS['esc-hist'] = el => {
  const e = TT.esc.find(x => x.id === el.dataset.id); if (!e) return;
  askDlg_(e.esc_no + ' · ' + (e.task || ''), '<div class="tbl-wrap"><table><tr><th>When</th><th>By</th><th>What</th></tr>' + (e.history || []).map(x => '<tr><td class="nowrap">' + fmtDT(x.at) + '</td><td>' + esc(x.by) + '</td><td class="wrap">' + esc(x.what) + '</td></tr>').join('') + '</table></div>', 'Close');
};
ACTIONS['esc-csv'] = () => downloadCsv('escalations-' + todayYmd() + '.csv', [['Ticket', 'Raised', 'Source', 'Task', 'Reference', 'Party', 'Doer', 'Planned', 'Level', 'Level 1', 'New Date', 'Reason', 'Level 2', 'Status', 'Result', 'Resolution']]
  .concat((VIEWS.esc.rows || []).map(e => [e.esc_no, fmtDT(e.raised_at), e.src, e.task, e.ref, e.party, e.doer, fmtDT(e.planned), 'L' + e.level, e.l1, fmtDT(e.commit_at), e.commit_why, e.l2, e.status, e.result, e.resolution])));
function ttEscSetupHtml() {
  const c = ttCfg(); const pc = TT.people.find(x => /^PC$/i.test(String(x.designation || '').trim()));
  return '<div class="panel" style="max-width:760px"><table class="jckv">' +
    '<tr><td class="k">Level 1 after a delay of</td><td class="v"><select id="ttAfter">' + [0.5, 1, 2, 3].map(x => '<option value="' + x + '"' + (Math.abs(num(c.escAfterDays) - x) < 0.01 ? ' selected' : '') + '>' + x + ' working day' + (x > 1 ? 's' : '') + '</option>').join('') + '</select></td></tr>' +
    '<tr><td class="k">Level 1 owner</td><td class="v"><select id="ttL1"><option value="">PC (designation PC' + (pc ? ': ' + esc(pc.name) : ', nobody yet') + ')</option>' + TT.people.map(p => '<option' + (norm(c.l1) === norm(p.name) ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></td></tr>' +
    '<tr><td class="k">Level 2 owner</td><td class="v">Admin (' + esc(TT.people.filter(p => p.admin).map(p => p.name).join(', ')) + ')</td></tr>' +
    '<tr><td class="k">Level 2 when</td><td class="v">no new date within the same delay after Level 1, or the new date passes</td></tr></table>' +
    '<div class="toolbar" style="margin-top:10px"><span class="grow"></span><button class="btn primary" data-act="tt-esc-save">Save</button></div></div>';
}
async function ttSaveSettings(patch, msg) {
  if (!requirePerm('TT_SETUP')) return;
  const v = Object.assign({}, TT.settings || {}, patch); busy(true, 'Saving…');
  try { await rpc('tt_settings_save', { p_value: v }); TT.settings = v; TT.rows = null; flash(esc(msg || 'Saved.')); } catch (e) { flash(esc(e.message), 'err'); } finally { busy(false); route(); }
}
ACTIONS['tt-esc-save'] = () => ttSaveSettings({ escAfterDays: num($('#ttAfter').value) || 1, l1: $('#ttL1').value }, 'Escalation setup saved.');

/* ================= Scorecard (Nexus formula) ================= */
// score = −(100 − quality); quality = weighted Completion %, On-time %, Volume %, Consistency %. 0 is best.
// TM Points % = Task Manager's own points (gained / possible) for its checklist + EA, as its Score Card counts them.
function ttScoreRows(from, to) {
  const f = from ? new Date(from + 'T00:00:00') : null, tt = to ? new Date(to + 'T23:59:59') : null; const now = new Date();
  const rows = ttTasks().filter(t => t.planned && t.doer && !t.team && !t.self && (!f || t.planned >= f) && (!tt || t.planned <= tt) && (t.done || t.planned <= now));
  const m = {};
  rows.forEach(t => {
    const k = t.doer; const s = m[k] || (m[k] = { doer: k, dept: t.dept, total: 0, completed: 0, pending: 0, overdue: 0, onTime: 0, late: 0, monthly: {}, tmGain: 0, tmPoss: 0, src: {} });
    s.total++; s.src[t.kind] = (s.src[t.kind] || 0) + 1; if (!s.dept && t.dept) s.dept = t.dept;
    if (t.done) { s.completed++; t.late ? s.late++ : s.onTime++; const mk = ymdOf(t.planned).slice(0, 7); const x = s.monthly[mk] || (s.monthly[mk] = { ok: 0, n: 0 }); x.n++; if (!t.late) x.ok++; }
    else t.late ? s.overdue++ : s.pending++;
    if (t.tm && t.tm.sc.state !== 'upcoming') { s.tmGain += t.tm.sc.pts; s.tmPoss += t.tm.sc.base; }
  });
  const list = Object.values(m); const maxT = list.reduce((a, r) => Math.max(a, r.total), 0); const W = Object.assign({ completion: 0.35, onTime: 0.35, volume: 0.15, consistency: 0.15 }, ttCfg().weights || {});
  const ws = (num(W.completion) + num(W.onTime) + num(W.volume) + num(W.consistency)) || 1;
  list.forEach(r => {
    r.completionPct = r.total ? r.completed * 100 / r.total : 0;
    r.onTimePct = r.completed ? r.onTime * 100 / r.completed : 0;
    r.volumePct = maxT ? Math.min(100, r.total * 100 / maxT) : 0;
    const mon = Object.values(r.monthly).filter(x => x.n).map(x => x.ok * 100 / x.n);
    if (mon.length >= 2) { const avg = mon.reduce((a, b) => a + b, 0) / mon.length; r.consistencyPct = Math.max(0, 100 - Math.sqrt(mon.reduce((a, b) => a + (b - avg) * (b - avg), 0) / mon.length)); }
    else r.consistencyPct = r.onTimePct;
    r.quality = (num(W.completion) * r.completionPct + num(W.onTime) * r.onTimePct + num(W.volume) * r.volumePct + num(W.consistency) * r.consistencyPct) / ws;
    r.score = -Math.round((100 - r.quality) * 100) / 100;
    r.tmPct = r.tmPoss ? Math.round(r.tmGain * 100 / r.tmPoss) : null;
    r.esc1 = TT.esc.filter(e => norm(e.doer) === norm(r.doer)).length; r.esc2 = TT.esc.filter(e => norm(e.doer) === norm(r.doer) && e.level === 2).length;
  });
  return list.sort((a, b) => b.score - a.score);
}
const scoreCls = s => s == null ? '' : s >= -10 ? 'done-txt' : s >= -30 ? 'pend-txt' : 'late-txt';
const SC_UI = { from: '', to: '', dept: '' };
VIEWS.score = {
  render() {
    if (!TT.people.length) { setMain('<div class="panel setup">Scorecard is not set up yet. ' + esc(DB.ttErr || '') + '</div>'); return; }
    if (!SC_UI.from) { const d = new Date(); SC_UI.from = ymdOf(new Date(d.getFullYear(), d.getMonth(), 1)); SC_UI.to = todayYmd(); }
    const all = ttAll(); let rows = ttScoreRows(SC_UI.from, SC_UI.to); if (!all) rows = rows.filter(r => norm(r.doer) === norm(ME.name));
    const depts = Array.from(new Set(rows.map(r => r.dept).filter(Boolean))).sort(); if (SC_UI.dept) rows = rows.filter(r => r.dept === SC_UI.dept);
    const f1 = x => (Math.round(x * 10) / 10).toFixed(1); const W = Object.assign({ completion: 0.35, onTime: 0.35, volume: 0.15, consistency: 0.15 }, ttCfg().weights || {});
    let h = '<div class="toolbar"><input id="scFrom" type="date" value="' + esc(SC_UI.from) + '"><input id="scTo" type="date" value="' + esc(SC_UI.to) + '">' + (all ? '<select id="scDept">' + selOpts(depts, SC_UI.dept, 'All departments') + '</select>' : '') + '<span class="muted small">' + rows.length + ' employee(s)</span><span class="grow"></span>' +
      (can('TT_SETUP') ? '<button class="btn sm" data-act="sc-w">Weights</button>' : '') + '<button class="btn sm" data-act="sc-csv">Export CSV</button><button class="btn sm" data-act="refresh">Refresh</button></div>' + ttNotes();
    h += '<div class="tbl-wrap tt-wrap"><table><tr><th>#</th><th>Doer</th><th>Department</th><th class="num">Total</th><th class="num">FMS</th><th class="num">Task Mgr</th><th class="num">Complaints</th><th class="num">Done</th><th class="num">On Time</th><th class="num">Late</th><th class="num">Pending</th><th class="num">Overdue</th><th class="num">Compl %</th><th class="num">On-time %</th><th class="num">Volume</th><th class="num">Consistency</th><th class="num">Score</th><th class="num">TM Points %</th><th class="num">Escalations</th><th class="num">Level 2</th></tr>' +
      (rows.length ? rows.map((r, i) => '<tr class="click" data-act="sc-open" data-d="' + esc(r.doer) + '"><td class="muted">' + (i + 1) + '</td><td><b>' + esc(r.doer) + '</b></td><td>' + esc(r.dept) + '</td><td class="num">' + r.total + '</td><td class="num">' + (r.src.fms || '') + '</td><td class="num">' + (r.src.tm || '') + '</td><td class="num">' + (r.src.cmp || '') + '</td><td class="num">' + r.completed + '</td><td class="num">' + r.onTime + '</td><td class="num">' + r.late + '</td><td class="num">' + r.pending + '</td><td class="num' + (r.overdue ? ' late-txt' : '') + '">' + r.overdue + '</td>' +
        '<td class="num">' + f1(r.completionPct) + '</td><td class="num">' + f1(r.onTimePct) + '</td><td class="num">' + f1(r.volumePct) + '</td><td class="num">' + f1(r.consistencyPct) + '</td><td class="num"><b class="' + scoreCls(r.score) + '">' + r.score.toFixed(2) + '</b></td><td class="num">' + (r.tmPct == null ? '' : r.tmPct + '%') + '</td><td class="num">' + r.esc1 + '</td><td class="num' + (r.esc2 ? ' late-txt' : '') + '">' + r.esc2 + '</td></tr>').join('')
        : '<tr><td colspan="20" class="empty">No tasks in this period</td></tr>') + '</table></div>' +
      '<div class="muted small" style="margin-top:8px">Score = −(100 − quality); quality = Completion ' + W.completion + ', On-time ' + W.onTime + ', Volume ' + W.volume + ', Consistency ' + W.consistency + ' (weights). 0 is best. Counted: tasks planned in the period that are done or already due; self tasks and the team "assign" step of complaints are not counted.</div>';
    VIEWS.score.rows = rows;
    setMain(h);
    $$('#scFrom,#scTo,#scDept').forEach(i => i.addEventListener('change', async e => { const k = { scFrom: 'from', scTo: 'to', scDept: 'dept' }[e.target.id]; SC_UI[k] = e.target.value; if (k !== 'dept' && SC_UI.from && SC_UI.to) await ttEnsure(SC_UI.from, SC_UI.to); VIEWS.score.render(); }));
  }
};
ACTIONS['sc-open'] = el => { AT_UI.who = el.dataset.d; AT_UI.st = 'all'; AT_UI.from = SC_UI.from; AT_UI.to = SC_UI.to; AT_UI.tab = 'tasks'; go('tasks'); };
ACTIONS['sc-csv'] = () => downloadCsv('scorecard-' + todayYmd() + '.csv', [['Doer', 'Department', 'Total', 'FMS', 'Task Manager', 'Complaints', 'Done', 'On Time', 'Late', 'Pending', 'Overdue', 'Completion %', 'On-time %', 'Volume', 'Consistency', 'Score', 'TM Points %', 'Escalations', 'Level 2']]
  .concat((VIEWS.score.rows || []).map(r => [r.doer, r.dept, r.total, r.src.fms || 0, r.src.tm || 0, r.src.cmp || 0, r.completed, r.onTime, r.late, r.pending, r.overdue, r.completionPct.toFixed(1), r.onTimePct.toFixed(1), r.volumePct.toFixed(1), r.consistencyPct.toFixed(1), r.score.toFixed(2), r.tmPct == null ? '' : r.tmPct, r.esc1, r.esc2])));
ACTIONS['sc-w'] = async () => {
  const W = Object.assign({ completion: 0.35, onTime: 0.35, volume: 0.15, consistency: 0.15 }, ttCfg().weights || {});
  const f = (k, l) => '<label>' + l + '<input type="number" step="0.05" min="0" id="w_' + k + '" value="' + esc(W[k]) + '"></label>';
  const v = await askDlg_('Score weights', '<div class="row">' + f('completion', 'Completion') + f('onTime', 'On time') + f('volume', 'Volume') + f('consistency', 'Consistency') + '</div>', 'Save', '#w_completion', d => {
    const o = {}; ['completion', 'onTime', 'volume', 'consistency'].forEach(k => { o[k] = Math.max(0, num($('#w_' + k, d).value)); });
    if (!(o.completion + o.onTime + o.volume + o.consistency)) { $('#askMsg', d).textContent = 'At least one weight must be above 0.'; return undefined; } return o;
  });
  if (v) ttSaveSettings({ weights: v }, 'Score weights saved.');
};

/* ================= Plan vs Actual (Nexus track.js) =================
   Every activity of the current workflow, start → planned → actual. One entry
   per activity in PA_DEFS; a new one (e.g. a purchase step) is one more entry
   whose rows ttTasks() produces with that `act`. FMS flows add themselves. */
const PA_DEFS_BASE = [
  { k: 'cmp_assign', l: 'Complaint · Assign', grp: 'Maintenance / Fabric triage', start: 'Complaint raised', tat: () => ttCfg().cmpAssignHours + ' working hours', edit: 'cmpAssignHours', unit: 'hours' },
  { k: 'cmp_resolve', l: 'Complaint · Resolve', grp: 'Host (assigned person)', start: 'Assigned to the host', tat: () => 'Expected completion (else ' + ttCfg().cmpResolveDays + ' working day)', edit: 'cmpResolveDays', unit: 'days' },
  { k: 'cmp_close', l: 'Complaint · Feedback & close', grp: 'Who raised it', start: 'Host marked it completed', tat: () => ttCfg().cmpCloseDays + ' working day', edit: 'cmpCloseDays', unit: 'days' },
  { k: 'tm_check', l: 'Checklist (Task Manager)', grp: 'Employee', start: 'The day it falls on', tat: () => 'Target time of the task (Task Manager)' },
  { k: 'tm_ea', l: 'Delegation · EA (Task Manager)', grp: 'Employee', start: 'Assigned', tat: () => 'EA date + target time (Task Manager)' }
];
function paDefs() {
  const fl = Array.from(new Map(Store.all('processes').filter(p => p.active || Store.all('records').some(r => r.process_id === p.id)).map(p => [p.code, p])).values());
  return PA_DEFS_BASE.concat(fl.map(p => ({ k: 'fms:' + p.code, l: 'FMS · ' + (p.name || p.code), grp: 'Step doers', start: 'Per step (FMS Builder)', tat: () => 'Per step (FMS Builder)' })));
}
const paCls = s => s === 'Done on time' ? 'Done' : s === 'Done late' ? 'Pending' : s === 'Delayed' ? 'Late' : 'Waiting';
const PAX_UI = { tab: 'list', act: '', st: 'open', by: '', from: '', to: '' };
VIEWS.pva = {
  render() {
    if (!TT.people.length) { setMain('<div class="panel setup">Plan vs Actual is not set up yet. ' + esc(DB.ttErr || '') + '</div>'); return; }
    const U = PAX_UI; if (!U.from) { U.from = ymdOf(ttAddDays(-30)); U.to = todayYmd(); }
    const defs = paDefs(); const f = new Date(U.from + 'T00:00:00'), t = new Date(U.to + 'T23:59:59');
    const all = ttTasks().filter(r => r.act && r.act !== 'tm_self' && r.planned && r.planned >= f && r.planned <= t);
    let h = '<div class="tabs">' + [['list', 'Plan vs Actual'], ['sum', 'Summary'], ['tat', 'TAT']].map(([k, l]) => '<a data-act="pa-tab" data-t="' + k + '" class="' + (U.tab === k ? 'on' : '') + '">' + l + '</a>').join('') + '</div>' + ttNotes();
    const dates = '<input id="paFrom" type="date" value="' + esc(U.from) + '"><input id="paTo" type="date" value="' + esc(U.to) + '">';
    if (U.tab === 'list') {
      const people = Array.from(new Set(all.map(r => r.doer).filter(Boolean))).sort();
      const rows = all.filter(r => (!U.act || r.act === U.act) && (!U.by || r.doer === U.by) && (U.st === 'all' || (U.st === 'open' ? !r.done : U.st === 'late' ? r.late : r.done)))
        .sort((a, b) => (b.delay || 0) - (a.delay || 0));
      h += '<div class="toolbar"><select id="paAct"><option value="">All activities</option>' + defs.map(d => '<option value="' + esc(d.k) + '"' + (U.act === d.k ? ' selected' : '') + '>' + esc(d.l) + '</option>').join('') + '</select>' +
        '<select id="paSt">' + [['open', 'Open'], ['late', 'Late (open or done)'], ['done', 'Done'], ['all', 'All']].map(([v, l]) => '<option value="' + v + '"' + (U.st === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
        '<select id="paBy">' + selOpts(people, U.by, 'Everyone') + '</select>' + dates + '<span class="muted small">' + rows.length + ' record(s)</span><span class="grow"></span><button class="btn sm" data-act="pa-csv">Export CSV</button></div>';
      const lbl = k => (defs.find(d => d.k === k) || { l: k }).l;
      h += '<div class="tbl-wrap tt-wrap"><table><tr><th>Activity</th><th>Task</th><th>Reference</th><th>Party</th><th>Responsible</th><th>Start</th><th>Planned</th><th>Actual</th><th>Status</th><th class="num">Delay</th><th>Done By</th><th></th></tr>' +
        (rows.length ? rows.slice(0, 1500).map(r => '<tr><td>' + esc(lbl(r.act)) + '</td><td class="wrap">' + esc(r.task) + '</td><td><b>' + esc(r.ref) + '</b></td><td>' + esc(r.party) + '</td><td>' + esc(r.doer) + '</td><td class="nowrap">' + fmtDT(r.start) + '</td><td class="nowrap">' + fmtDT(r.planned) + '</td><td class="nowrap">' + (r.actual ? fmtDT(r.actual) : '') + '</td><td><span class="st ' + paCls(r.status) + '">' + r.status + '</span></td><td class="num' + (r.delay ? ' late-txt' : '') + '">' + (r.delay ? fmtDelay(r.delay) : '') + '</td><td>' + esc(r.by || '') + '</td><td>' + ttOpenCell(r) + '</td></tr>').join('') +
          (rows.length > 1500 ? '<tr><td colspan="12" class="empty">First 1500 of ' + rows.length + ' shown. Export CSV for all.</td></tr>' : '') : '<tr><td colspan="12" class="empty">Nothing here</td></tr>') + '</table></div>';
      VIEWS.pva.rows = rows; VIEWS.pva.lbl = lbl;
    } else if (U.tab === 'sum') {
      h += '<div class="toolbar">' + dates + '</div><div class="tbl-wrap"><table><tr><th>Activity</th><th>Responsible</th><th>TAT</th><th class="num">Open</th><th class="num">Late (open)</th><th class="num">Done</th><th class="num">Done on time</th><th class="num">On-time %</th><th class="num">Avg delay</th></tr>' +
        defs.map(d => {
          const rs = all.filter(r => r.act === d.k); const done = rs.filter(r => r.actual); const ok = done.filter(r => !r.delay); const late = rs.filter(r => !r.done && r.late);
          const avg = done.length ? done.reduce((a, r) => a + (r.delay || 0), 0) / done.length : 0;
          return '<tr><td>' + esc(d.l) + '</td><td>' + esc(d.grp) + '</td><td>' + esc(d.tat()) + '</td><td class="num">' + rs.filter(r => !r.done).length + '</td><td class="num' + (late.length ? ' late-txt' : '') + '">' + late.length + '</td><td class="num">' + done.length + '</td><td class="num">' + ok.length + '</td><td class="num">' + (done.length ? Math.round(ok.length * 100 / done.length) + '%' : '') + '</td><td class="num">' + (avg ? fmtDelay(Math.round(avg)) : '') + '</td></tr>';
        }).join('') + '</table></div>';
    } else {
      const edit = can('TT_SETUP'); const C = ttCfg();
      h += '<div class="tbl-wrap"><table><tr><th>Activity</th><th>Starts when</th><th>Responsible</th><th class="num">TAT</th><th>Unit</th></tr>' +
        defs.map(d => '<tr><td>' + esc(d.l) + '</td><td>' + esc(d.start) + '</td><td>' + esc(d.grp) + '</td>' + (d.edit ? '<td><input class="right" style="width:90px" type="number" min="0" step="any" data-pat="' + d.edit + '" value="' + esc(C[d.edit]) + '"' + (edit ? '' : ' disabled') + '></td><td>Working ' + d.unit + '</td>' : '<td colspan="2" class="muted">' + esc(d.tat()) + '</td>') + '</tr>').join('') + '</table></div>' +
        (edit ? '<div class="toolbar" style="margin-top:10px"><span class="grow"></span><button class="btn primary" data-act="pa-tat-save">Save TAT</button></div>' : '');
    }
    setMain(h);
    $$('#paAct,#paSt,#paBy,#paFrom,#paTo').forEach(i => i.addEventListener('change', async e => {
      const k = { paAct: 'act', paSt: 'st', paBy: 'by', paFrom: 'from', paTo: 'to' }[e.target.id]; U[k] = e.target.value;
      if ((k === 'from' || k === 'to') && U.from && U.to) await ttEnsure(U.from, U.to);
      VIEWS.pva.render();
    }));
  }
};
ACTIONS['pa-tab'] = el => { PAX_UI.tab = el.dataset.t; VIEWS.pva.render(); };
ACTIONS['pa-tat-save'] = () => { const p = {}; $$('[data-pat]').forEach(i => { p[i.dataset.pat] = Math.max(0, num(i.value)); }); ttSaveSettings(p, 'TAT saved. Planned times now follow it.'); };
ACTIONS['pa-csv'] = () => downloadCsv('plan-vs-actual-' + todayYmd() + '.csv', [['Activity', 'Task', 'Reference', 'Party', 'Responsible', 'Start', 'Planned', 'Actual', 'Status', 'Delay (min)', 'Done By']]
  .concat((VIEWS.pva.rows || []).map(r => [VIEWS.pva.lbl(r.act), r.task, r.ref, r.party, r.doer, fmtDT(r.start), fmtDT(r.planned), r.actual ? fmtDT(r.actual) : '', r.status, r.delay || 0, r.by || ''])));
