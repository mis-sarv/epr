/* fms-view.js — Task › FMS View (fms.html#view) and one record (fms.html#rec/<id>).

   The working side of the FMS, ported from Nexus 2.0 (ops.js › Tracker, Order
   timeline, step Done / Undo, My Tasks):
   * Tracker   one flow at a time; one row per record, Planned / Actual / Delay
               under every step, coloured by status (same grid as Nexus).
   * My steps  every open step whose doer is me, across all flows, earliest
               first, with Done right there.
   * Record    its fields, the step timeline with Done / Undo, priority
               (Normal / Urgent / On Hold / Cancelled), edit and delete.
   Rights (checked again by the server): HOME_FMS_VIEW to see and close one's
   own steps, FMS_ADD to punch a record, FMS_MANAGE to close / undo any step,
   change priority, edit or delete any record. Whoever punched a record may
   also edit its fields. */
'use strict';
const TRK_UI = { f: 'open', q: '', pid: null };

/* ---- who may close / undo ---- */
function canMarkStep(s) { return can('FMS_MANAGE') || (can('HOME_FMS_VIEW') && isMyDoer(s.doer)); }
function canUndoStep(r, sid) {
  if (can('FMS_MANAGE')) return true;
  const by = (r.done_by || {})[sid], at = (r.actuals || {})[sid];
  return !!(by && norm(by) === norm(ME.name) && at && Date.now() - new Date(at) < 5 * 60000);
}
const canEditRec = r => can('FMS_MANAGE') || (r.created_uid && r.created_uid === ME.uid);
function stepDoneBtn(r, s) {
  if (!canMarkStep(s)) return '';
  return '<button class="btn sm primary" data-act="step-done" data-r="' + esc(r.id) + '" data-s="' + esc(s.id) + '">Done</button>';
}
// The fields a record shows in lists: the first two typed-in ones (not dates, not priority).
function listFields(spec) { return (spec.fields || []).filter(f => f.source !== 'system' && f.source !== 'step' && f.key !== 'priority' && ['text', 'select', 'number'].includes(f.type)).slice(0, 2); }
const recLabel = spec => ((spec && spec.process && spec.process.instanceLabel) || 'Record');

/* ---------------- Tracker (FMS grid) ---------------- */
VIEWS.view = {
  render(param) {
    if (param) { const pr = Store.all('processes').find(p => p.code === param && p.active); if (pr) TRK_UI.pid = pr.id; }
    const recs = Store.all('records');
    const procs = Store.all('processes').filter(p => recs.some(o => o.process_id === p.id) || p.active).sort((a, b) => a.code === b.code ? b.version - a.version : (a.name || a.code) < (b.name || b.code) ? -1 : 1);
    if (!TRK_UI.pid || !procs.some(p => p.id === TRK_UI.pid)) TRK_UI.pid = (activeProcess() || procs[0] || {}).id;
    const proc = Store.get('processes', TRK_UI.pid);
    const mineN = allOpenSteps().filter(x => isMyDoer(x.step.doer)).length;
    let h = '<div class="toolbar">' + seg('f', [{ v: 'open', l: 'Open' }, { v: 'mine', l: 'My steps' + (mineN ? ' (' + mineN + ')' : '') }, { v: 'all', l: 'All' }], TRK_UI.f);
    if (TRK_UI.f === 'mine') { setMain(h + '<span class="grow"></span><button class="btn sm" data-act="refresh">Refresh</button></div>' + myStepsHtml()); onSeg(trkSeg); return; }
    if (!proc) { setMain(h + '</div><div class="panel empty">No flow is live yet.' + (can('HOME_FMS_BUILDER') ? ' Build one in <a href="#builder">FMS Builder</a> and Activate it.' : '') + '</div>'); onSeg(trkSeg); return; }
    const spec = specOf(proc); const q = norm(TRK_UI.q); const lf = listFields(spec);
    const rows = recs.filter(o => o.process_id === proc.id).sort((a, b) => b.created_at < a.created_at ? -1 : 1)
      .filter(o => (TRK_UI.f === 'all' || recState(o).open) && (!q || norm(o.rec_no + ' ' + Object.values(o.fields || {}).join(' ')).includes(q)));
    h += (procs.length > 1 ? '<select id="trkProc">' + procs.map(p => '<option value="' + esc(p.id) + '"' + (p.id === proc.id ? ' selected' : '') + '>' + esc((p.name || p.code) + ' v' + p.version + (p.active ? ' (live)' : '')) + '</option>').join('') + '</select>' : '<span class="muted small">' + esc(proc.name || proc.code) + ' v' + proc.version + '</span>') +
      '<input id="trkQ" placeholder="Filter…" value="' + esc(TRK_UI.q) + '"><span class="muted small">' + rows.length + ' ' + esc(recLabel(spec).toLowerCase()) + '(s)</span><span class="grow"></span>' +
      (TRK_UI.f === 'all' ? '<label class="small"><input type="checkbox" id="trkOld"' + (DB.all ? ' checked' : '') + '>Also closed more than 180 days ago</label>' : '') +
      '<button class="btn sm" data-act="trk-csv">Export CSV</button><button class="btn sm" data-act="refresh">Refresh</button>' +
      (can('FMS_ADD') && proc.active ? '<button class="btn primary" data-act="rec-new" data-code="' + esc(proc.code) + '">+ New ' + esc(recLabel(spec)) + '</button>' : '') + '</div>';
    const steps = FMSEngine.topoOrder(proc.spec).map(id => proc.spec.steps.find(s => s.id === id));
    h += '<div class="tbl-wrap trk-wrap"><table class="trk"><tr><th rowspan="2">' + esc(recLabel(spec)) + ' No</th>' + lf.map(f => '<th rowspan="2">' + esc(f.label) + '</th>').join('') + '<th rowspan="2">Now</th>' + steps.map(s => '<th colspan="3" class="c">' + esc(s.name) + '</th>').join('') + '</tr><tr>' + steps.map(() => '<th>Planned</th><th>Actual</th><th class="num">Delay</th>').join('') + '</tr>' +
      (rows.length ? rows.map(o => {
        const r = resolveRec(o); const st = recState(o); if (!r) return '';
        return '<tr class="click" data-act="go" data-v="rec" data-p="' + esc(o.id) + '"><td><b>' + esc(o.rec_no) + '</b></td>' + lf.map(f => '<td>' + esc((o.fields || {})[f.key] || '') + '</td>').join('') + '<td><span class="st ' + st.cls + '">' + esc(st.label) + '</span></td>' + steps.map(sd => {
          const s = r.steps[sd.id]; const c = 'cell c-' + stCls(s.status);
          if (s.status === 'N/A') return '<td class="' + c + '">N/A</td><td class="' + c + '"></td><td class="' + c + '"></td>';
          return '<td class="' + c + '">' + (s.planned ? fmtDT(s.planned) : '') + '</td><td class="' + c + '">' + (s.actual ? fmtDT(s.actual) : '') + '</td><td class="num ' + c + (s.delayMinutes ? ' late-txt' : '') + '">' + (s.delayMinutes ? fmtDelay(s.delayMinutes) : '') + '</td>';
        }).join('') + '</tr>';
      }).join('') : '<tr><td colspan="' + (steps.length * 3 + 2 + lf.length) + '" class="empty">No ' + esc(recLabel(spec).toLowerCase()) + 's</td></tr>') + '</table></div>';
    setMain(h);
    VIEWS.view.rows = rows; VIEWS.view.steps = steps; VIEWS.view.proc = proc;
    onSeg(trkSeg);
    const ps = $('#trkProc'); if (ps) ps.addEventListener('change', e => { TRK_UI.pid = e.target.value; VIEWS.view.render(); });
    const old = $('#trkOld'); if (old) old.addEventListener('change', async e => { DB.all = e.target.checked; busy(true, 'Loading…'); try { await loadAll(); } catch (er) { flash(esc(er.message), 'err'); } finally { busy(false); } VIEWS.view.render(); });
    $('#trkQ').addEventListener('input', e => { TRK_UI.q = e.target.value; clearTimeout(TRK_UI.t); TRK_UI.t = setTimeout(() => { VIEWS.view.render(); const i = $('#trkQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
  }
};
function trkSeg(e) { if (e.target.dataset.seg === 'f') { TRK_UI.f = e.detail; VIEWS.view.render(); } }
ACTIONS['trk-csv'] = () => {
  const V = VIEWS.view; if (!V.proc) return; const spec = specOf(V.proc); const lf = listFields(spec);
  const head = [recLabel(spec) + ' No'].concat(lf.map(f => f.label), ['Now'], ...V.steps.map(s => [s.name + ' Planned', s.name + ' Actual', s.name + ' Delay', s.name + ' Done By']));
  downloadCsv((V.proc.code || 'fms') + '-' + todayYmd() + '.csv', [head].concat(V.rows.map(o => {
    const r = resolveRec(o); const st = recState(o);
    return [o.rec_no].concat(lf.map(f => (o.fields || {})[f.key] || ''), [st.label], ...V.steps.map(sd => { const s = r.steps[sd.id]; return s.status === 'N/A' ? ['N/A', '', '', ''] : [fmtDT(s.planned), fmtDT(s.actual), fmtDelay(s.delayMinutes), (o.done_by || {})[sd.id] || '']; }));
  })));
};

/* ---------------- My steps: everything waiting on me ---------------- */
function myStepsHtml() {
  const mine = allOpenSteps().filter(x => isMyDoer(x.step.doer));
  return '<div class="tbl-wrap"><table><tr><th>FMS</th><th>No</th><th>Details</th><th>Step</th><th>What to do</th><th>Planned</th><th>Status</th><th class="num">Delay</th><th>Note</th><th></th></tr>' +
    (mine.length ? mine.map(x => {
      const lf = listFields(x.spec); const det = lf.map(f => (x.rec.fields || {})[f.key]).filter(Boolean).join(' / ');
      return '<tr><td>' + esc(x.spec.process.name || '') + '</td><td><a href="#rec/' + esc(x.rec.id) + '">' + esc(x.rec.rec_no) + '</a></td><td>' + esc(det) + '</td><td><b>' + esc(x.step.name) + '</b></td><td class="wrap small">' + esc((x.def && x.def.what) || '') + '</td><td class="nowrap">' + fmtDT(x.step.planned) + '</td><td>' + stHtml(x.step.status) + '</td><td class="num late-txt">' + fmtDelay(x.step.delayMinutes) + '</td><td><input data-note placeholder="optional"></td><td class="right">' + stepDoneBtn(x.rec, x.step) + '</td></tr>';
    }).join('') : '<tr><td colspan="10" class="empty">Nothing is waiting on you.</td></tr>') + '</table></div>';
}

/* ---------------- one record ---------------- */
VIEWS.rec = {
  render(id) {
    const o = Store.get('records', id);
    if (!o) { setMain('<div class="toolbar"><a class="btn" href="#view">← FMS View</a></div><div class="panel empty">Record not found. It may have been deleted, or it closed more than 180 days ago (FMS View › All › tick "Also closed …").</div>'); return; }
    const proc = Store.get('processes', o.process_id); const r = resolveRec(o); const st = recState(o); const spec = specOf(proc) || { fields: [] };
    const pf = spec.priority && spec.priority.field; const pfield = pf && (spec.fields || []).find(f => f.key === pf);
    let h = '<div class="toolbar"><a class="btn" href="#view/' + esc(proc ? proc.code : '') + '">←</a><h1 style="margin:0">' + esc(o.rec_no) + ' · ' + esc(proc ? proc.name || proc.code : '') + '</h1><span class="st ' + st.cls + '">' + esc(st.label) + '</span><span class="grow"></span>' +
      (canEditRec(o) ? '<button class="btn" data-act="rec-edit" data-r="' + esc(o.id) + '">Edit</button>' : '') +
      (can('FMS_MANAGE') ? '<button class="btn ghost danger" data-act="rec-del" data-r="' + esc(o.id) + '" data-confirm="Delete ' + esc(o.rec_no) + '?">Delete</button>' : '') +
      '<button class="btn" data-act="print">Print</button></div>';
    // where the record stands now: every open step (several can run side by side), most late first
    const openSteps = r && st.open ? r.order.map(sid => r.steps[sid]).filter(s => s.status === 'Pending' || s.status === 'Late').sort((a, b) => (b.status === 'Late') - (a.status === 'Late') || (b.delayMinutes || 0) - (a.delayMinutes || 0) || a.planned - b.planned) : [];
    if (openSteps.length) h += '<div class="panel ord-now"><b>Current status</b> · ' + openSteps.length + ' step(s) open<div class="ord-steps">' +
      openSteps.map(s => '<span class="ord-step ' + (s.status === 'Late' ? 'late' : '') + '"><b>' + esc(s.name) + '</b> · ' + esc(s.doer || '') + ' · ' + fmtDT(s.planned) + (s.status === 'Late' ? ' · <span class="late-txt">Late ' + fmtDelay(s.delayMinutes) + '</span>' : ' · <span class="pend-txt">Pending</span>') + '</span>').join('') + '</div></div>';
    // A completed record keeps its priority; a cancelled one can be brought back.
    if (pfield && canEditRec(o) && (!o.closed_at || st.label === 'Cancelled')) h += '<div class="toolbar noprint"><span class="muted small">Priority</span>' + seg('opri', [{ v: '', l: 'Normal' }].concat((pfield.options || []).filter(Boolean).map(x => ({ v: x, l: x === 'Cancelled' ? 'Cancel' : x }))), (o.fields || {})[pf] || '') + '</div>';
    h += '<div class="grid2"><div><div class="panel"><table class="kv">' + [['Time stamp', fmtDT(o.created_at)], ['Punched by', o.created_by], ['FMS flow', proc ? (proc.name || proc.code) + ' v' + proc.version : '—']]
      .concat((spec.fields || []).filter(f => f.source !== 'system').map(f => { const v = (o.fields || {})[f.key]; return [f.label, f.type === 'date' ? fmtD(v) : v]; }))
      .concat(o.closed_at ? [['Closed', fmtDT(o.closed_at)]] : [])
      .map(([k, v]) => '<tr><td class="muted" style="width:160px">' + esc(k) + '</td><td>' + esc(v == null ? '' : v) + '</td></tr>').join('') + '</table></div></div>';
    h += '<div><h2 style="margin-top:0">FMS timeline</h2>';
    if (!r) h += '<div class="panel">Flow not found for this record.</div>';
    else {
      h += '<div class="tbl-wrap"><table class="tl"><tr><th>Step</th><th>Doer</th><th>Done By</th><th>Note</th><th>Planned</th><th>Actual</th><th>Status</th><th class="num">Delay</th><th></th></tr>' +
        r.order.map(sid => {
          const s = r.steps[sid];
          if (s.status === 'N/A') return '<tr class="muted"><td>' + esc(s.name) + '</td><td></td><td></td><td></td><td></td><td></td><td>N/A</td><td></td><td></td></tr>';
          const open = s.status === 'Pending' || s.status === 'Late';
          const act = open ? stepDoneBtn(o, s) : (s.status === 'Done' && canUndoStep(o, sid) ? '<button class="btn sm ghost" data-act="undo-step" data-r="' + esc(o.id) + '" data-s="' + esc(sid) + '" data-confirm="Undo?">Undo</button>' : '');
          const note = (o.notes || {})[sid]; const by = (o.done_by || {})[sid];
          return '<tr class="' + (st.cur && st.cur.id === sid ? 'cur' : '') + '"><td>' + esc(s.name) + '</td><td>' + esc(s.doer || '') + '</td><td>' + esc(by || '') + '</td><td>' + (open && canMarkStep(s) ? '<input data-note placeholder="optional">' : esc(note || '')) + '</td><td class="nowrap">' + fmtDT(s.planned) + '</td><td class="nowrap">' + fmtDT(s.actual) + '</td><td>' + stHtml(s.status) + '</td><td class="num late-txt">' + fmtDelay(s.delayMinutes) + '</td><td class="right">' + act + '</td></tr>';
        }).join('') + '</table></div>';
    }
    h += '</div></div>';
    setMain(h);
    const sp = $('[data-seg="opri"]');
    if (sp) sp.addEventListener('segchange', e => { if (pf) recSaveFields(o, { [pf]: e.detail }, 'Priority: ' + (e.detail || 'Normal')); });
  }
};
ACTIONS['print'] = () => window.print();

/* ---- server calls for a record ---- */
async function recSaveFields(o, fields, okMsg) {
  busy(true, 'Saving…');
  try { const d = await rpc('fms_record_save', { p_id: o.id, p_code: o.process_code, p_fields: fields }); Store.put('records', d.record); flash(esc(o.rec_no) + ' — ' + esc(okMsg || 'saved.')); }
  catch (e) { flash(esc(e.message), 'err'); } finally { busy(false); route(); }
}
async function markStepDone(recId, stepId, note, capVal) {
  const o = Store.get('records', recId); if (!o) return;
  const r = resolveRec(o); const s = r && r.steps[stepId];
  if (!s || !(s.status === 'Pending' || s.status === 'Late')) { flash('This step is not open.', 'err'); return; }
  busy(true, 'Saving…');
  try {
    const d = await rpc('fms_step_done', { p_id: recId, p_step: stepId, p_doer: s.doer || '', p_note: note || null, p_cap: capVal == null ? null : String(capVal) });
    Store.put('records', d.record);
    flash(esc(s.name) + ' marked done for ' + esc(o.rec_no) + (s.delayMinutes ? ' (late ' + fmtDelay(s.delayMinutes) + ')' : '') + '. <a data-act="undo-step" data-r="' + esc(o.id) + '" data-s="' + esc(stepId) + '">Undo</a>');
  } catch (e) { flash(esc(e.message), 'err'); } finally { busy(false); route(); fmsAutoRun(); }
}
ACTIONS['step-done'] = el => {
  const tr = el.closest('tr'); const note = tr && tr.querySelector('input[data-note]'); const nv = note ? note.value.trim() : '';
  const o = Store.get('records', el.dataset.r); const r = o && resolveRec(o); const def = r && r.spec.steps.find(x => x.id === el.dataset.s);
  if (!def || !def.capture) { markStepDone(el.dataset.r, el.dataset.s, nv); return; }
  // The step asks for a value (e.g. a date that later steps run from): ask it before closing.
  const f = (r.spec.fields || []).find(x => x.key === def.capture.field) || { label: def.capture.field, type: 'date' };
  const old = $('#capDlg'); if (old) old.remove();
  const d = document.createElement('div'); d.id = 'capDlg'; d.className = 'dlg-back';
  d.innerHTML = '<div class="dlg"><div class="dlg-h">' + esc(o.rec_no) + ' · ' + esc(def.name) + '</div><table class="jckv"><tr><td class="k">' + esc(f.label) + ' *</td><td class="v">' + fieldInput(f, (o.fields || {})[def.capture.field], 'capVal') + '</td></tr></table>' +
    '<div class="dlg-f"><span id="capMsg" class="small late-txt"></span><span class="grow"></span><button class="btn" data-cap-x>Cancel</button><button class="btn primary" data-cap-ok>Done</button></div></div>';
  document.body.appendChild(d); $('#capVal').focus();
  d.addEventListener('click', ev => {
    if (ev.target.closest('[data-cap-x]')) { d.remove(); return; }
    if (!ev.target.closest('[data-cap-ok]')) return;
    const v = String($('#capVal').value || '').trim(); if (!v) { $('#capMsg').textContent = 'Enter ' + f.label + '.'; return; }
    d.remove(); markStepDone(el.dataset.r, el.dataset.s, nv, v);
  });
};
ACTIONS['undo-step'] = async el => {
  const o = Store.get('records', el.dataset.r); if (!o) return;
  if (!canUndoStep(o, el.dataset.s)) { flash('Undo needs FMS Manage (or your own Done within 5 minutes).', 'err'); return; }
  busy(true, 'Undoing…');
  try { const d = await rpc('fms_step_undo', { p_id: o.id, p_step: el.dataset.s }); Store.put('records', d.record); flash('Undone.'); }
  catch (e) { flash(esc(e.message), 'err'); } finally { busy(false); route(); }
};
ACTIONS['rec-del'] = async el => {
  const o = Store.get('records', el.dataset.r); if (!o) return; busy(true, 'Deleting…');
  try { await rpc('fms_record_delete', { p_id: o.id }); Store.del('records', o.id); flash(esc(o.rec_no) + ' deleted.'); go('view', o.process_code); }
  catch (e) { flash(esc(e.message), 'err'); } finally { busy(false); }
};

/* ---------------- punch / edit a record ---------------- */
// One input per field type; dates go through date-dmy.js (DD/MM/YYYY on screen, YYYY-MM-DD in .value).
function fieldInput(f, v, id) {
  const at = (id ? 'id="' + id + '" ' : '') + 'data-fk="' + esc(f.key) + '"';
  if (f.type === 'select') return '<select ' + at + '><option value=""></option>' + (f.options || []).filter(Boolean).map(x => '<option' + (String(v || '') === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>';
  if (f.type === 'date') return '<input type="date" ' + at + ' value="' + esc(v ? String(v).slice(0, 10) : '') + '">';
  if (f.type === 'datetime') return '<input type="datetime-local" ' + at + ' value="' + esc(v ? String(v).slice(0, 16) : '') + '">';
  if (f.type === 'number') return '<input type="number" step="any" ' + at + ' value="' + esc(v == null ? '' : v) + '">';
  return '<input ' + at + ' value="' + esc(v == null ? '' : v) + '">';
}
function recDialog(proc, o) {
  const spec = proc.spec; const pf = spec.priority && spec.priority.field;
  // Punch shows the fields typed in at the start; edit also shows the ones steps fill in.
  const flds = (spec.fields || []).filter(f => f.source !== 'system' && (o || f.source !== 'step') && (!o || f.key !== pf));
  const old = $('#recDlg'); if (old) old.remove();
  const d = document.createElement('div'); d.id = 'recDlg'; d.className = 'dlg-back';
  d.innerHTML = '<div class="dlg"><div class="dlg-h">' + (o ? 'Edit ' + esc(o.rec_no) : 'New ' + esc(recLabel(spec)) + ' · ' + esc(proc.name || proc.code)) + '</div><table class="jckv">' +
    flds.map(f => '<tr><td class="k">' + esc(f.label) + '</td><td class="v">' + fieldInput(f, o ? (o.fields || {})[f.key] : '') + '</td></tr>').join('') + '</table>' +
    '<div class="dlg-f"><span id="recMsg" class="small late-txt"></span><span class="grow"></span><button class="btn" data-rec-x>Cancel</button><button class="btn primary" data-rec-ok>' + (o ? 'Save' : 'Punch') + '</button></div></div>';
  document.body.appendChild(d); const first = $('[data-fk]', d); if (first) first.focus();
  d.addEventListener('click', async ev => {
    if (ev.target.closest('[data-rec-x]')) { d.remove(); return; }
    if (!ev.target.closest('[data-rec-ok]')) return;
    const fields = {}; $$('[data-fk]', d).forEach(i => { const v = String(i.value || '').trim(); if (v || o) fields[i.dataset.fk] = v; });
    if (!o && !Object.values(fields).some(Boolean)) { $('#recMsg').textContent = 'Fill at least one field.'; return; }
    d.remove(); busy(true, 'Saving…');
    try {
      const res = await rpc('fms_record_save', { p_id: o ? o.id : null, p_code: proc.code, p_fields: fields });
      Store.put('records', res.record);
      flash(o ? esc(o.rec_no) + ' saved.' : esc(res.record.rec_no) + ' punched. Its first steps are now with their doers.');
      if (!o) go('rec', res.record.id); else route();
    } catch (e) { flash(esc(e.message), 'err'); } finally { busy(false); fmsAutoRun(); }
  });
}
ACTIONS['rec-new'] = el => { if (!requirePerm('FMS_ADD')) return; const p = activeProcess(el.dataset.code); if (!p) { flash(esc(ERR_TEXT.NO_LIVE_FLOW), 'err'); return; } recDialog(p); };
ACTIONS['rec-edit'] = el => { const o = Store.get('records', el.dataset.r); const p = o && Store.get('processes', o.process_id); if (p) recDialog(p, o); };
