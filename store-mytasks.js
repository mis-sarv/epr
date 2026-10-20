/* store-mytasks.js — My Day: the Store Incharge's daily task list.
 *
 * One screen, one step per task. Every step shows
 *   • a COUNT read from ERP data (nobody types it),
 *   • a short GUIDE: why the task matters and how to do it,
 *   • the first rows that are still open,
 *   • a button that opens the exact screen (with the filter already set),
 *   • Recheck, which recounts after the work is done.
 * A task is DONE only when its count reaches 0. It cannot be ticked by hand;
 * it can only be skipped, with a written reason. The last step closes the day.
 *
 * What is recorded: per (day, user, task) the count at the first check, the
 * count now, done / skipped (+ reason), done late or on time, and whether the
 * day was closed (table daily_task_log, DAILY_TASKS_MIGRATION.sql). Until that
 * migration runs, the same record is kept in this browser only.
 *
 * Opens: Store › My Day (Daily Tasks) in the sidebar, the Tasks button in the
 * top bar, and by itself once a day after login for a role that has
 * HOME_MYDAY (Admin Panel › Tab Visibility; default Store In-Charge + Admin)
 * until that day is closed.
 *
 * Classic script, loaded after store-core.js (reads its globals: SB, SB_READY,
 * escText, fetchAllRows, today, sarvItemMasterRows, sarvPendingRequirements,
 * sarvPoFollowupGroups …) and before erp-shell.js. Everything here is prefixed
 * wf / #wfDay.
 */
(function () {
  'use strict';

  const N_STOCK_PER_DAY = 10;          // items in the daily physical count
  const INFORM_DAYS = 30;              // receipts older than this are not today's work
  const OLDPR_DAYS = 5;                // a PR this old with no PO needs a reminder
  const UNSENT_DAYS = 3;               // entry PDFs from the last N days

  const $ = id => document.getElementById(id);
  const esc = v => (typeof escText === 'function' ? escText(v) : String(v == null ? '' : v)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])));
  const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
  const q2 = v => { const n = Number(v); if (!isFinite(n)) return '—'; return Number.isInteger(n) ? String(n) : n.toFixed(2); };
  const isoToday = () => (typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10));
  const dmy = v => { const s = String(v || '').slice(0, 10); const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? m[3] + '/' + m[2] + '/' + m[1] : (v ? String(v) : '—'); };
  const daysAgoIso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const toast = (m, k) => { if (typeof showToast === 'function') showToast(m, k); };
  const can = key => { try { return typeof sarvTabVisible !== 'function' || sarvTabVisible(key); } catch (e) { return true; } };

  function userInfo() {
    const u = (typeof sarvCurrentUser !== 'undefined' && sarvCurrentUser) || null;
    const role = (typeof sarvCurrentRole !== 'undefined' && sarvCurrentRole) || '';
    const name = (u && u.name) || (typeof SARV_ROLE_LABEL !== 'undefined' && SARV_ROLE_LABEL[role]) || role || 'User';
    return { key: String((u && u.id) || (u && u.name) || role || 'user'), name, role };
  }

  /* ══ RECORD: local first, Supabase when the table exists ══════════════ */
  let dbMissing = false;
  const localKey = (date, user) => 'sarv_wf_' + date + '_' + user;
  function readLocal(date, user) {
    try { return JSON.parse(localStorage.getItem(localKey(date, user)) || 'null') || { tasks: {} }; }
    catch (e) { return { tasks: {} }; }
  }
  function writeLocal(date, user, log) { try { localStorage.setItem(localKey(date, user), JSON.stringify(log)); } catch (e) {} }
  const missingTable = e => /does not exist|schema cache|relation|Could not find the table/i.test((e && e.message) || '');

  async function dbLoad(date, user) {
    if (dbMissing || typeof SB_READY === 'undefined' || !SB_READY) return null;
    try {
      const r = await SB.from('daily_task_log').select('*').eq('log_date', date).eq('user_key', user);
      if (r.error) throw r.error;
      return r.data || [];
    } catch (e) {
      if (missingTable(e)) dbMissing = true; else console.warn('[MyDay] log read skipped:', e.message || e);
      return null;
    }
  }
  async function dbSave(rows) {
    if (dbMissing || !rows.length || typeof SB_READY === 'undefined' || !SB_READY) return false;
    try {
      const r = await SB.from('daily_task_log').upsert(rows, { onConflict: 'log_date,user_key,task_key' });
      if (r.error) throw r.error;
      return true;
    } catch (e) {
      if (missingTable(e)) dbMissing = true; else console.warn('[MyDay] log save skipped:', e.message || e);
      return false;
    }
  }

  /* ══ SHARED DATA LOADS (once per open) ═══════════════════════════════ */
  let shared = {};
  function once(key, fn) { if (!shared[key]) shared[key] = fn().catch(e => { delete shared[key]; throw e; }); return shared[key]; }
  const loadItems = () => once('items', async () => {
    if (typeof loadItemMaster !== 'function') throw new Error('Item Master is not available');
    await loadItemMaster();
    if (typeof sarvImPipePromise !== 'undefined' && sarvImPipePromise) { try { await sarvImPipePromise; } catch (e) {} }
    return sarvItemMasterRows || [];
  });
  const loadPending = () => once('pending', async () => {
    if (typeof refreshPendingRequirements !== 'function') throw new Error('PR list is not available');
    await refreshPendingRequirements();
    return sarvPendingRequirements || [];
  });
  const loadFollowup = () => once('followup', async () => {
    if (typeof refreshPoFollowupReport !== 'function') throw new Error('Follow-up report is not available');
    await refreshPoFollowupReport();
    return sarvPoFollowupGroups || [];
  });

  /* ══ NAVIGATION ══════════════════════════════════════════════════════ */
  function go(modKey, leaf, after) {
    closeDay();
    const ok = typeof window.erpGoLeaf === 'function' && window.erpGoLeaf(modKey, leaf);
    if (!ok) { toast('Your role cannot open ' + leaf, 'warn'); return; }
    if (after) setTimeout(() => { try { after(); } catch (e) { console.warn('[MyDay] after-go step skipped:', e.message || e); } }, 400);
  }

  /* ══ TASKS ═══════════════════════════════════════════════════════════
     load() → { count, rows, note, extra } ; count null = cannot be counted
     (setup missing). rows: [{ cells:[html…], act:{label, fn, kind} }]. */
  const TASKS = [
    {
      key: 'MSV', title: 'Below-MSV items: raise PRs', due: '11:00', access: 'HOME_PR',
      guide: [
        'These items are below their Minimum Stock Value and the shortfall is not yet covered by an open PR or PO.',
        'Tick the items, press <b>Raise PR for ticked items</b>. The PR form opens filled: qty = Std Order Qty (or the shortfall, whichever is more), Purchaser from the Category.',
        'Fill <b>Requested By</b>, <b>Required By</b>, Priority and the Machine, then Submit.',
        'Come back here and press Recheck. Items now on a PR drop off the list.'
      ],
      head: ['', 'Code', 'Item', 'Balance / MSV', 'On PR / PO', 'Short'],
      async load() {
        const rows = await loadItems();
        const pipeKnown = typeof sarvImPipe !== 'undefined' && sarvImPipe && !(typeof sarvImPipeErr !== 'undefined' && sarvImPipeErr);
        const list = rows.filter(r => typeof isBelowMsv_ === 'function' && isBelowMsv_(r)).map(r => {
          const msv = itemMsv_(r.it), cover = num(r.pipe), shortBy = msv - num(r.bal);
          return { r, msv, cover, open: shortBy - cover };
        }).filter(x => x.open > 0.0001).sort((a, b) => b.open - a.open);
        return {
          count: list.length,
          note: pipeKnown ? '' : 'Open PR / PO quantities could not be loaded, so items already on a PR may be listed too.',
          rows: list.map(x => {
            const it = x.r.it, uom = esc(it.uom || 'PCS');
            return {
              id: String(it.id), pick: true, data: x,
              cells: [esc(it.item_code || ''), '<b>' + esc(it.name || '') + '</b>',
                q2(x.r.bal) + ' / ' + q2(x.msv) + ' ' + uom, x.cover ? q2(x.cover) : '—',
                '<b style="color:#b91c1c;">' + q2(x.open) + ' ' + uom + '</b>']
            };
          })
        };
      },
      actions: [
        { label: 'Raise PR for ticked items', primary: true, fn: (st, picked) => raisePr(picked) },
        { label: 'Open Item Master (Below MSV)', fn: () => go('MASTERS', 'Item Master', () => {
            const f = $('itemMasterMsvFilter'); if (f) { f.value = 'BELOW'; if (typeof renderItemMasterTable === 'function') renderItemMasterTable(); }
          }) }
      ]
    },
    {
      key: 'INFORM', title: 'Tell requesters their material has arrived', due: '17:00', access: 'HOME_PO',
      guide: [
        'Material has come in (Inward) against these PRs, but the requester has not been told yet.',
        'Call / message the requester, then open the PR in the <b>PO Follow-up Report</b> and tick <b>Inform to Requester</b> for that Inward (it asks for your PIN).',
        'One tick per receipt: a PR received in three lots needs three ticks.',
        'Receipts older than ' + INFORM_DAYS + ' days are not counted here.'
      ],
      head: ['PR No.', 'Requested by', 'Inward', 'Received on', ''],
      async load() {
        const groups = await loadFollowup();
        const since = daysAgoIso(INFORM_DAYS);
        const out = []; let older = 0;
        groups.forEach(g => {
          const st = String((g.req && g.req.status) || '');
          if (st === 'Cancelled') return;
          (g.allInwards || []).forEach(i => {
            if (poFollowupInformState_(g.req, i.document_no)) return;
            const d = String(i.receiving_date || i.created_at || '').slice(0, 10);
            if (d && d < since) { older++; return; }
            out.push({ g, i, d });
          });
        });
        out.sort((a, b) => String(a.d).localeCompare(String(b.d)));
        return {
          count: out.length,
          note: older ? older + ' older receipt(s) are also not ticked (not counted).' : '',
          rows: out.map(x => ({
            id: x.g.req.req_no + '|' + x.i.document_no,
            cells: ['<b>' + esc(x.g.req.req_no || '') + '</b>', esc(x.g.req.requested_by || '—'),
              esc(x.i.document_no || ''), dmy(x.d)],
            act: { label: 'Open', fn: () => go('PURCHASE', 'PO Follow-up Report', () => {
              const s = $('p_poRepSearch'); if (s) s.value = x.g.req.req_no || '';
              if (typeof renderPoFollowupReport === 'function') renderPoFollowupReport();
            }) }
          }))
        };
      }
    },
    {
      key: 'REJECTED', title: 'Fix Rejected / Hold PRs', due: '11:00', access: 'HOME_PR',
      guide: [
        'The Purchaser (or an approver) sent these PRs back for a correction.',
        'Read the reason, press <b>Edit PR</b>, correct it and Submit. Saving sends it back to <b>Pending</b>.',
        'If the PR is no longer needed, ask the Purchaser to cancel it; a cancelled PR leaves this list too.'
      ],
      head: ['PR No.', 'Status', 'Date', 'Requested by', 'Reason', ''],
      async load() {
        const lines = await loadPending();
        const byReq = new Map();
        lines.forEach(x => {
          const st = String((x.req && x.req.status) || '');
          if (st !== 'Rejected' && st !== 'Hold') return;
          if (!byReq.has(x.req.id)) byReq.set(x.req.id, x);
        });
        const reason = req => {
          const s = req.pdf_snapshot || {}, a = req.approvals || {};
          const pick = o => o && (o.remarks || o.reason || o.note || o.comment);
          return pick(s.hold) || pick(a.hold) || pick(a.rejection) || pick(s.rejection) || pick(a.gmCeo) || pick(a.md) || '';
        };
        const list = [...byReq.values()];
        return {
          count: list.length,
          rows: list.map(x => ({
            id: String(x.req.id),
            cells: ['<b>' + esc(x.req.req_no || '') + '</b>',
              '<span class="wf-chip ' + (x.req.status === 'Rejected' ? 'wf-chip-red' : 'wf-chip-amber') + '">' + esc(x.req.status) + '</span>',
              dmy(x.req.request_date), esc(x.req.requested_by || '—'), esc(reason(x.req) || '—')],
            act: { label: 'Edit PR', fn: () => {
              if (typeof canEditPr_ === 'function' && !canEditPr_(x.req)) { toast('Your login cannot edit this PR', 'warn'); return; }
              go('PURCHASE', 'Purchase Requirement (PR)', () => populateRequirementEditor(x));
            } }
          }))
        };
      }
    },
    {
      key: 'OLDPR', title: 'PRs waiting ' + OLDPR_DAYS + '+ days for a PO: remind the Purchaser', due: '12:00', access: 'HOME_PO',
      guide: [
        'These PRs are approved or pending but no PO has been made for ' + OLDPR_DAYS + ' days or more.',
        'Call / message the Purchaser named on the PR and ask for the PO date.',
        'Press <b>Mark reminded</b> on each PR once you have spoken to them. It is recorded with the time.'
      ],
      head: ['PR No.', 'Date', 'Days', 'Purchaser', 'Status', ''],
      async load(st) {
        const lines = await loadPending();
        const now = Date.now(), byReq = new Map();
        lines.forEach(x => {
          const s = String((x.req && x.req.status) || 'Pending');
          if (x.completed || num(x.inPo) > 0 || ['Rejected', 'Hold', 'Cancelled', 'Completed'].includes(s) || !x.req.request_date) return;
          const days = Math.floor((now - new Date(x.req.request_date).getTime()) / 86400000);
          if (days < OLDPR_DAYS) return;
          if (!byReq.has(x.req.id)) byReq.set(x.req.id, { x, days });
        });
        const reminded = (st.log.detail && st.log.detail.reminded) || {};
        const list = [...byReq.values()].sort((a, b) => b.days - a.days);
        return {
          count: list.filter(o => !reminded[o.x.req.req_no]).length,
          rows: list.map(o => {
            const no = o.x.req.req_no, done = reminded[no];
            return {
              id: String(o.x.req.id), muted: !!done,
              cells: ['<b>' + esc(no || '') + '</b>', dmy(o.x.req.request_date), '<b>' + o.days + '</b>',
                esc(o.x.req.purchaser_name || '—'), esc(o.x.req.status || 'Pending')],
              act: done ? { label: 'Reminded ' + esc(done), disabled: true }
                : { label: 'Mark reminded', fn: () => markReminded(st, no) }
            };
          })
        };
      }
    },
    {
      key: 'UNSENT', title: 'Send entry PDFs on WhatsApp', due: '17:00', access: 'HOME_REPORTS',
      guide: [
        'Inward / Outward / Issue entries of the last ' + UNSENT_DAYS + ' days whose PDF has not been sent on WhatsApp from this computer. They cannot be printed until they are sent.',
        'Press <b>Open</b>: Print History opens on that entry. Open its PDF and press <b>Send on WhatsApp</b>.',
        '"Sent" is remembered on the computer it was sent from, so do this from the Store computer.'
      ],
      head: ['Entry No.', 'Type', 'Party', 'Saved on', ''],
      async load() {
        if (typeof isStoreEntrySent_ !== 'function') throw new Error('Print History is not available');
        const since = daysAgoIso(UNSENT_DAYS) + 'T00:00:00';
        const filt = q => q.gte('created_at', since);
        const [inw, outw] = await Promise.all([
          fetchAllRows('inward_entries', 'id,document_no,entry_type,supplier_name,notes,created_at', 'id', filt).catch(() => []),
          fetchAllRows('outward_entries', 'id,document_no,entry_type,party_name,notes,created_at', 'id', filt).catch(() => [])
        ]);
        const cancelled = n => typeof isStoreRecordCancelled_ === 'function' && isStoreRecordCancelled_(n);
        const list = inw.map(e => ({ e, party: e.supplier_name, type: e.entry_type || 'INWARD' }))
          .concat(outw.map(e => ({ e, party: e.party_name, type: e.entry_type || 'OUTWARD' })))
          .filter(o => o.e.document_no && !cancelled(o.e.notes) && !isStoreEntrySent_(o.e.document_no))
          .sort((a, b) => String(a.e.created_at).localeCompare(String(b.e.created_at)));
        return {
          count: list.length,
          rows: list.map(o => ({
            id: o.e.document_no,
            cells: ['<b>' + esc(o.e.document_no) + '</b>', esc(o.type), esc(o.party || '—'), dmy(o.e.created_at)],
            act: { label: 'Open', fn: () => go('WAREHOUSE', 'Print History / Reports', () => {
              const sq = $('searchQuery'); if (sq) sq.value = o.e.document_no;
              ['filterDateFrom', 'filterDateTo'].forEach(id => { const d = $(id); if (d) d.value = ''; });
              if (typeof loadReports === 'function') loadReports();
            }) }
          }))
        };
      }
    },
    {
      key: 'STOCK', title: 'Physical stock count (' + N_STOCK_PER_DAY + ' items)', due: '16:00', access: 'HOME_MASTER',
      guide: [
        'Count these ' + N_STOCK_PER_DAY + ' items on the rack and type the quantity you actually find.',
        'The list rotates so every item is counted in turn: items never counted come first, then the ones counted longest ago.',
        'A difference is not an error to hide: type what you count. The MD reviews the differences; nothing here changes stock.',
        'Press <b>Save</b> on each row (or <b>Save all</b>). The task is done when every item on today\'s list is saved.'
      ],
      head: ['Code', 'Item', 'UOM', 'ERP qty', 'Physical qty', 'Difference', ''],
      stock: true,
      async load(st) {
        const rows = await loadItems();
        let counts;
        try {
          counts = await fetchAllRows('stock_counts', 'item_id,count_date,physical_qty,system_qty,diff_qty,counted_by', 'id', q => q.gte('count_date', daysAgoIso(400)));
        } catch (e) {
          if (missingTable(e)) return { count: null, setup: true, rows: [], note: 'Run DAILY_TASKS_MIGRATION.sql in Supabase to start the daily stock count.' };
          throw e;
        }
        const todayIso = isoToday();
        const last = {}, todays = {};
        counts.forEach(c => {
          const k = String(c.item_id);
          if (c.count_date === todayIso) todays[k] = c;
          if (!last[k] || c.count_date > last[k]) last[k] = c.count_date;
        });
        // Today's list stays the same all day: kept in the day's log.
        let ids = (st.log.detail && Array.isArray(st.log.detail.stockList)) ? st.log.detail.stockList.slice() : [];
        const byId = new Map(rows.map(r => [String(r.it.id), r]));
        ids = ids.filter(id => byId.has(id));
        Object.keys(todays).forEach(id => { if (byId.has(id) && ids.indexOf(id) < 0) ids.push(id); });
        if (ids.length < N_STOCK_PER_DAY) {
          const pool = rows.filter(r => ids.indexOf(String(r.it.id)) < 0)
            .sort((a, b) => String(last[String(a.it.id)] || '').localeCompare(String(last[String(b.it.id)] || ''))
              || String(a.it.item_code || '').localeCompare(String(b.it.item_code || ''), undefined, { numeric: true }));
          pool.slice(0, N_STOCK_PER_DAY - ids.length).forEach(r => ids.push(String(r.it.id)));
        }
        if (JSON.stringify(ids) !== JSON.stringify((st.log.detail || {}).stockList || [])) {
          st.log.detail = Object.assign({}, st.log.detail, { stockList: ids });
          saveTaskLog(st);
        }
        const open = ids.filter(id => !todays[id]).length;
        return {
          count: open,
          rows: ids.map(id => {
            const r = byId.get(id), it = r.it, c = todays[id];
            return { id, stockRow: true, it, sys: num(r.bal), counted: c || null, lastCount: last[id] && last[id] !== todayIso ? last[id] : '' };
          })
        };
      },
      actions: [{ label: 'Save all', primary: true, fn: st => saveStockAll(st) }]
    }
  ];

  /* ══ STATE ═══════════════════════════════════════════════════════════ */
  let day = null;          // { date, user, log:{tasks, closed}, states:[...], cur }
  const dueMinutes = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : 24 * 60; };
  const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

  function visibleTasks() { return TASKS.filter(t => !t.access || can(t.access)); }

  function taskStatus(st) {
    const l = st.log;
    if (st.result && st.result.setup) return 'setup';
    if (l.status === 'done') return 'done';
    if (l.status === 'skipped') return 'skipped';
    if (st.loading && st.result == null) return 'loading';
    if (st.error) return 'error';
    return nowMinutes() > dueMinutes(st.task.due) ? 'late' : 'pending';
  }
  const STATUS_LABEL = { done: 'Done', skipped: 'Skipped', loading: 'Checking…', error: 'Could not check', late: 'Late', pending: 'Pending', setup: 'Setup needed' };

  function saveTaskLog(st) {
    const l = st.log;
    day.log.tasks[st.task.key] = l;
    writeLocal(day.date, day.user.key, day.log);
    dbSave([{
      log_date: day.date, user_key: day.user.key, user_name: day.user.name, role: day.user.role,
      task_key: st.task.key, status: l.status || 'pending',
      count_start: l.countStart == null ? null : l.countStart, count_now: l.countNow == null ? null : l.countNow,
      skip_reason: l.skipReason || null, detail: l.detail || {}, due_time: st.task.due,
      done_at: l.doneAt || null, done_late: !!l.doneLate,
      closed: !!day.log.closed, closed_at: day.log.closedAt || null, updated_at: new Date().toISOString()
    }]).then(() => paintDbNote());
  }

  async function runTask(st) {
    st.loading = true; st.error = ''; paint();
    try {
      const res = await st.task.load(st);
      st.result = res;
      const l = st.log;
      if (res.count != null) {
        if (l.countStart == null) l.countStart = res.count;
        l.countNow = res.count;
        if (res.count === 0 && l.status !== 'done') {
          l.status = 'done'; l.doneAt = new Date().toISOString();
          l.doneLate = nowMinutes() > dueMinutes(st.task.due);
          l.skipReason = '';
        } else if (res.count > 0 && l.status === 'done') {
          l.status = 'pending'; l.doneAt = null; l.doneLate = false;   // new work came in after it was done
        }
        saveTaskLog(st);
      }
      // Rows picked by default (Below-MSV): all of them.
      st.picked = new Set((res.rows || []).filter(r => r.pick).map(r => r.id));
    } catch (e) {
      st.error = (e && e.message) || String(e);
      console.warn('[MyDay] ' + st.task.key + ' check failed:', st.error);
    }
    st.loading = false;
    paint();
  }

  async function openMyDay(startKey) {
    if (!can('HOME_MYDAY')) { toast('My Day is not switched on for your role (Admin Panel › Tab Visibility)', 'warn'); return; }
    build();
    shared = {};
    const date = isoToday(), user = userInfo();
    const log = readLocal(date, user.key);
    log.tasks = log.tasks || {};
    day = { date, user, log, cur: 0, states: [] };
    const rows = await dbLoad(date, user.key);
    if (rows && rows.length) {
      rows.forEach(r => {
        const l = log.tasks[r.task_key] = log.tasks[r.task_key] || {};
        // The database wins for status; local keeps anything it has that the DB does not.
        Object.assign(l, {
          status: r.status, countStart: r.count_start, countNow: r.count_now, skipReason: r.skip_reason || '',
          detail: Object.assign({}, l.detail || {}, r.detail || {}), doneAt: r.done_at, doneLate: !!r.done_late
        });
        if (r.closed) { log.closed = true; log.closedAt = r.closed_at; }
      });
    }
    day.states = visibleTasks().map(t => ({ task: t, log: Object.assign({ status: 'pending', detail: {} }, log.tasks[t.key] || {}), result: null, loading: true, error: '', picked: new Set(), skipping: false }));
    if (startKey) { const i = day.states.findIndex(s => s.task.key === startKey); if (i >= 0) day.cur = i; }
    $('wfDay').classList.add('open');
    document.body.classList.add('wf-open');
    paint();
    paintDbNote();
    // Shared loads first, so two tasks that read the same data wait on one fetch.
    day.states.forEach(st => runTask(st));
  }
  function closeDay() {
    const el = $('wfDay'); if (el) el.classList.remove('open');
    document.body.classList.remove('wf-open');
    updateBadge();
  }

  /* ══ ACTIONS ═════════════════════════════════════════════════════════ */
  async function raisePr(picked) {
    if (!can('HOME_PR')) { toast('Your role cannot create a Purchase Requirement', 'warn'); return; }
    if (!picked.length) { toast('Tick at least one item', 'warn'); return; }
    const list = picked.map(row => {
      const x = row.data, it = x.r.it, soq = typeof itemStdOrderQty_ === 'function' ? itemStdOrderQty_(it) : null;
      const need = Math.ceil(x.open * 100) / 100;
      return { it, qty: soq != null && soq >= need ? soq : need,
        remark: 'Below MSV: balance ' + q2(x.r.bal) + ', MSV ' + q2(x.msv) + (x.cover ? ', already on PR/PO ' + q2(x.cover) : '') };
    });
    closeDay();
    if (typeof sarvFillPrFromItems_ !== 'function') { toast('PR form is not available', 'error'); return; }
    if (await sarvFillPrFromItems_(list)) {
      toast('Filled ' + list.length + ' below-MSV item(s) into the New PR form. Choose <b>Requested By</b> and <b>Required By</b>, then Submit. Open My Day again and press Recheck.');
    }
  }
  function markReminded(st, prNo) {
    const t = new Date();
    const stamp = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
    st.log.detail = Object.assign({}, st.log.detail);
    st.log.detail.reminded = Object.assign({}, st.log.detail.reminded, { [prNo]: stamp });
    saveTaskLog(st);
    runTask(st);
  }
  function skipTask(st, reason) {
    reason = String(reason || '').trim();
    if (reason.length < 5) { toast('Write a short reason (at least 5 letters) to skip this task', 'warn'); return false; }
    Object.assign(st.log, { status: 'skipped', skipReason: reason, doneAt: null, doneLate: false });
    st.skipping = false;
    saveTaskLog(st);
    paint();
    return true;
  }
  function unskipTask(st) {
    Object.assign(st.log, { status: 'pending', skipReason: '' });
    saveTaskLog(st);
    runTask(st);
  }

  /* ── stock count ── */
  const stockMissing = e => missingTable(e);
  async function saveStockRows(st, ids) {
    const res = st.result; if (!res || !res.rows) return;
    const recs = [];
    let bad = 0;
    ids.forEach(id => {
      const row = res.rows.find(r => r.id === id); if (!row) return;
      const inp = document.querySelector('#wfDay input[data-stock="' + CSS.escape(id) + '"]');
      const rem = document.querySelector('#wfDay input[data-stock-rem="' + CSS.escape(id) + '"]');
      if (!inp) return;
      const raw = String(inp.value).trim();
      if (raw === '') return;
      const v = Number(raw);
      if (!isFinite(v) || v < 0) { bad++; inp.classList.add('wf-bad'); return; }
      recs.push({ count_date: day.date, item_id: id, item_code: row.it.item_code || null, item_name: row.it.name || null, uom: row.it.uom || null,
        system_qty: row.sys, physical_qty: v, diff_qty: Math.round((v - row.sys) * 1000) / 1000,
        remarks: rem && rem.value.trim() ? rem.value.trim() : null, counted_by: day.user.name, updated_at: new Date().toISOString() });
    });
    if (bad) toast(bad + ' quantity box(es) are not a valid number', 'warn');
    if (!recs.length) { if (!bad) toast('Type the physical quantity first', 'warn'); return; }
    try {
      const r = await SB.from('stock_counts').upsert(recs, { onConflict: 'count_date,item_id' });
      if (r.error) throw r.error;
      toast('Saved ' + recs.length + ' stock count(s)');
    } catch (e) {
      toast(stockMissing(e) ? 'Run DAILY_TASKS_MIGRATION.sql in Supabase first' : 'Could not save: ' + (e.message || e), 'error');
      return;
    }
    runTask(st);
  }
  function saveStockAll(st) {
    const ids = (st.result && st.result.rows || []).filter(r => !r.counted).map(r => r.id);
    saveStockRows(st, ids);
  }

  /* ══ RENDER ══════════════════════════════════════════════════════════ */
  function build() {
    if ($('wfDay')) return;
    const el = document.createElement('div');
    el.id = 'wfDay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'My Day');
    el.innerHTML =
      '<div class="wf-top">' +
        '<div class="wf-top-title"><b>My Day</b><span id="wfDate"></span></div>' +
        '<div class="wf-progress"><div class="wf-bar"><i id="wfBar"></i></div><span id="wfProg"></span></div>' +
        '<button type="button" class="wf-btn" id="wfRefreshAll" title="Check every task again">Recheck all</button>' +
        '<button type="button" class="wf-x" id="wfClose" title="Close (Esc)">&#10005;</button>' +
      '</div>' +
      '<div class="wf-db" id="wfDbNote"></div>' +
      '<div class="wf-body"><nav class="wf-rail" id="wfRail"></nav><main class="wf-main" id="wfMain"></main></div>';
    document.body.appendChild(el);
    $('wfClose').addEventListener('click', closeDay);
    $('wfRefreshAll').addEventListener('click', () => { shared = {}; day.states.forEach(runTask); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && $('wfDay').classList.contains('open') && !document.querySelector('#sarvDmyCal[style*="block"]')) closeDay();
    });
    el.addEventListener('click', onClick);
    // Stock count: show the difference as the quantity is typed.
    el.addEventListener('input', e => {
      const inp = e.target.closest('input[data-stock]'); if (!inp) return;
      inp.classList.remove('wf-bad');
      const cell = el.querySelector('[data-stock-diff="' + CSS.escape(inp.dataset.stock) + '"]'); if (!cell) return;
      const raw = String(inp.value).trim(), v = Number(raw), sys = Number(inp.dataset.sys);
      if (raw === '' || !isFinite(v)) { cell.innerHTML = ''; return; }
      const d = Math.round((v - sys) * 1000) / 1000;
      cell.innerHTML = d === 0 ? '<span class="wf-ok">Matches</span>' : '<b class="' + (d < 0 ? 'wf-neg' : 'wf-pos') + '">' + (d > 0 ? '+' : '') + q2(d) + '</b>';
    });
    // Enter in a quantity box saves that row.
    el.addEventListener('keydown', e => {
      const inp = e.target.closest('input[data-stock],input[data-stock-rem]'); if (!inp || e.key !== 'Enter' || !day) return;
      e.preventDefault();
      saveStockRows(day.states[day.cur], [inp.dataset.stock || inp.dataset.stockRem]);
    });
  }

  function onClick(e) {
    const b = e.target.closest('[data-wf]'); if (!b || !day) return;
    const kind = b.dataset.wf, st = day.states[day.cur];
    if (kind === 'step') { day.cur = +b.dataset.i; paint(); $('wfMain').scrollTop = 0; return; }
    if (kind === 'prev') { if (day.cur > 0) { day.cur--; paint(); } return; }
    if (kind === 'next') { if (day.cur < day.states.length) { day.cur++; paint(); } return; }
    if (kind === 'recheck') { shared = {}; runTask(st); return; }
    if (kind === 'skip') { st.skipping = true; paint(); const t = $('wfSkipReason'); if (t) t.focus(); return; }
    if (kind === 'skip-cancel') { st.skipping = false; paint(); return; }
    if (kind === 'skip-save') { skipTask(st, ($('wfSkipReason') || {}).value); return; }
    if (kind === 'unskip') { unskipTask(st); return; }
    if (kind === 'act') {
      const a = (st.task.actions || [])[+b.dataset.a]; if (!a) return;
      const picked = (st.result && st.result.rows || []).filter(r => st.picked.has(r.id));
      a.fn(st, picked); return;
    }
    if (kind === 'row') {
      const row = st.result && st.result.rows && st.result.rows[+b.dataset.r];
      if (row && row.act && row.act.fn && !row.act.disabled) row.act.fn(); return;
    }
    if (kind === 'pick') {
      const id = b.dataset.id; if (b.checked) st.picked.add(id); else st.picked.delete(id); paintCount(); return;
    }
    if (kind === 'pick-all') {
      (st.result.rows || []).forEach(r => { if (b.checked) st.picked.add(r.id); else st.picked.delete(r.id); });
      paint(); return;
    }
    if (kind === 'stock-save') { saveStockRows(st, [b.dataset.id]); return; }
    if (kind === 'close-day') { closeTheDay(); return; }
    if (kind === 'reopen-day') { day.log.closed = false; day.log.closedAt = null; day.states.forEach(saveTaskLog); paint(); return; }
  }
  function paintCount() {
    const st = day.states[day.cur], el = $('wfPickCount');
    if (el && st) el.textContent = st.picked.size;
  }

  function paint() {
    if (!day || !$('wfDay')) return;
    const states = day.states;
    const dt = new Date();
    $('wfDate').textContent = ' · ' + dt.toLocaleDateString('en-GB', { weekday: 'long' }) + ' ' + dmy(day.date) + ' · ' + day.user.name;
    const finished = states.filter(s => ['done', 'skipped'].includes(taskStatus(s))).length;
    $('wfProg').textContent = finished + ' of ' + states.length + ' done' + (day.log.closed ? ' · day closed' : '');
    $('wfBar').style.width = (states.length ? Math.round(finished * 100 / states.length) : 0) + '%';

    // Rail
    let rail = states.map((s, i) => {
      const status = taskStatus(s), c = s.result && s.result.count;
      return '<button type="button" class="wf-step' + (i === day.cur ? ' on' : '') + ' st-' + status + '" data-wf="step" data-i="' + i + '">' +
        '<span class="wf-step-n">' + (status === 'done' ? '&#10003;' : (i + 1)) + '</span>' +
        '<span class="wf-step-t">' + esc(s.task.title) + '<small>' + STATUS_LABEL[status] +
        (c != null && status !== 'done' ? ' · ' + c + ' open' : '') + ' · by ' + s.task.due + '</small></span></button>';
    }).join('');
    rail += '<button type="button" class="wf-step' + (day.cur === states.length ? ' on' : '') + (day.log.closed ? ' st-done' : '') + '" data-wf="step" data-i="' + states.length + '">' +
      '<span class="wf-step-n">' + (day.log.closed ? '&#10003;' : (states.length + 1)) + '</span><span class="wf-step-t">Close the day<small>' + (day.log.closed ? 'Closed' : 'Summary and sign-off') + '</small></span></button>';
    $('wfRail').innerHTML = rail;

    $('wfMain').innerHTML = day.cur >= states.length ? summaryHtml() : stepHtml(states[day.cur], day.cur);
    updateBadge();
  }

  function stepHtml(st, i) {
    const t = st.task, status = taskStatus(st), res = st.result || {}, rows = res.rows || [];
    const count = res.count;
    let h = '<div class="wf-card">' +
      '<div class="wf-card-head"><div><div class="wf-kicker">Step ' + (i + 1) + ' of ' + (day.states.length + 1) + '</div>' +
      '<h2>' + esc(t.title) + '</h2></div>' +
      '<span class="wf-chip st-' + status + '">' + STATUS_LABEL[status] + '</span><span class="wf-chip">Due ' + t.due + '</span></div>';
    // Count
    h += '<div class="wf-count"><b>' + (st.loading && count == null ? '…' : (count == null ? '—' : count)) + '</b><span>' +
      (count === 0 ? 'Nothing open. This task is done for today.' : count == null ? (res.setup ? 'Setup needed' : 'open') : 'open item' + (count === 1 ? '' : 's')) +
      (st.log.countStart != null && st.log.countStart !== count ? ' · ' + st.log.countStart + ' at the first check today' : '') + '</span></div>';
    if (st.error) h += '<div class="wf-note wf-note-err">Could not check: ' + esc(st.error) + '</div>';
    if (res.note) h += '<div class="wf-note">' + esc(res.note) + '</div>';
    if (status === 'skipped') h += '<div class="wf-note wf-note-skip">Skipped today: ' + esc(st.log.skipReason || '') + ' <button type="button" class="wf-link" data-wf="unskip">Undo skip</button></div>';
    // Guide
    h += '<details class="wf-guide"' + (count ? ' open' : '') + '><summary>How to do it</summary><ol>' + t.guide.map(g => '<li>' + g + '</li>').join('') + '</ol></details>';
    // Actions
    const acts = (t.actions || []).map((a, k) => '<button type="button" class="wf-btn' + (a.primary ? ' wf-pri' : '') + '" data-wf="act" data-a="' + k + '"' +
      (a.primary && t.key === 'MSV' && !rows.length ? ' disabled' : '') + '>' + esc(a.label) +
      (a.primary && t.key === 'MSV' ? ' (<span id="wfPickCount">' + st.picked.size + '</span>)' : '') + '</button>').join('');
    h += '<div class="wf-acts">' + acts + '<button type="button" class="wf-btn" data-wf="recheck">Recheck</button>' +
      (status !== 'done' && status !== 'skipped' && !res.setup ? '<button type="button" class="wf-btn wf-ghost" data-wf="skip">Skip today…</button>' : '') + '</div>';
    if (st.skipping) {
      h += '<div class="wf-skip"><label>Why is this task being skipped today? (saved with your name)</label>' +
        '<textarea id="wfSkipReason" rows="2" placeholder="e.g. Purchaser on leave, will do tomorrow"></textarea>' +
        '<div><button type="button" class="wf-btn wf-pri" data-wf="skip-save">Save reason and skip</button>' +
        '<button type="button" class="wf-btn" data-wf="skip-cancel">Cancel</button></div></div>';
    }
    // Rows
    if (rows.length) {
      const MAX = 60, show = rows.slice(0, MAX);
      h += '<div class="wf-table-wrap"><table class="wf-table"><thead><tr>' +
        (t.key === 'MSV' ? '<th><input type="checkbox" data-wf="pick-all"' + (st.picked.size === rows.length ? ' checked' : '') + ' title="Tick / untick all"></th>' : '') +
        t.head.filter((x, k) => !(t.key === 'MSV' && k === 0)).map(x => '<th>' + esc(x) + '</th>').join('') + '</tr></thead><tbody>';
      show.forEach((r, k) => {
        if (r.stockRow) { h += stockRowHtml(r); return; }
        h += '<tr' + (r.muted ? ' class="wf-muted"' : '') + '>' +
          (r.pick ? '<td><input type="checkbox" data-wf="pick" data-id="' + esc(r.id) + '"' + (st.picked.has(r.id) ? ' checked' : '') + '></td>' : '') +
          r.cells.map(c => '<td>' + c + '</td>').join('') +
          (r.act ? '<td class="wf-td-act"><button type="button" class="wf-btn wf-sm' + (r.act.disabled ? ' wf-done' : '') + '" data-wf="row" data-r="' + k + '"' + (r.act.disabled ? ' disabled' : '') + '>' + r.act.label + '</button></td>' : (t.key === 'MSV' ? '' : '<td></td>')) +
          '</tr>';
      });
      h += '</tbody></table></div>';
      if (rows.length > MAX) h += '<div class="wf-more">+ ' + (rows.length - MAX) + ' more. Use the screen\'s own list for the rest.</div>';
    }
    h += '</div>';
    h += '<div class="wf-nav"><button type="button" class="wf-btn" data-wf="prev"' + (i === 0 ? ' disabled' : '') + '>&#8249; Previous</button>' +
      '<button type="button" class="wf-btn wf-pri" data-wf="next">Next &#8250;</button></div>';
    return h;
  }

  function stockRowHtml(r) {
    const id = esc(r.id), it = r.it, c = r.counted;
    const diff = c ? num(c.physical_qty) - num(c.system_qty) : null;
    const dTxt = diff == null ? '' : (diff === 0 ? '<span class="wf-ok">Matches</span>' : '<b class="' + (diff < 0 ? 'wf-neg' : 'wf-pos') + '">' + (diff > 0 ? '+' : '') + q2(diff) + '</b>');
    return '<tr' + (c ? ' class="wf-muted"' : '') + '><td>' + esc(it.item_code || '') + '</td><td><b>' + esc(it.name || '') + '</b>' +
      (r.lastCount ? '<small class="wf-sub">Last counted ' + dmy(r.lastCount) + '</small>' : '<small class="wf-sub">Never counted</small>') + '</td>' +
      '<td>' + esc(it.uom || 'PCS') + '</td><td>' + q2(r.sys) + '</td>' +
      '<td>' + (c ? '<b>' + q2(c.physical_qty) + '</b>'
        : '<input type="number" min="0" step="any" class="wf-in" data-stock="' + id + '" data-sys="' + r.sys + '" placeholder="Qty">' +
          '<input type="text" class="wf-in wf-rem" data-stock-rem="' + id + '" placeholder="Remark (optional)">') + '</td>' +
      '<td data-stock-diff="' + id + '">' + dTxt + '</td>' +
      '<td class="wf-td-act">' + (c ? '<span class="wf-ok">Saved</span>' : '<button type="button" class="wf-btn wf-sm" data-wf="stock-save" data-id="' + id + '">Save</button>') + '</td></tr>';
  }

  function summaryHtml() {
    const states = day.states;
    const open = states.filter(s => !['done', 'skipped', 'setup'].includes(taskStatus(s)));
    let h = '<div class="wf-card"><div class="wf-card-head"><div><div class="wf-kicker">Step ' + (states.length + 1) + ' of ' + (states.length + 1) + '</div>' +
      '<h2>Close the day</h2></div>' + (day.log.closed ? '<span class="wf-chip st-done">Closed ' + esc(fmtTime(day.log.closedAt)) + '</span>' : '') + '</div>';
    h += '<table class="wf-table wf-sum"><thead><tr><th>Task</th><th>Due</th><th>At first check</th><th>Open now</th><th>Status</th><th>Note</th></tr></thead><tbody>' +
      states.map(s => {
        const st = taskStatus(s), l = s.log;
        return '<tr><td><b>' + esc(s.task.title) + '</b></td><td>' + s.task.due + '</td><td>' + (l.countStart == null ? '—' : l.countStart) + '</td>' +
          '<td>' + (l.countNow == null ? '—' : l.countNow) + '</td><td><span class="wf-chip st-' + st + '">' + STATUS_LABEL[st] +
          (st === 'done' && l.doneLate ? ' (late)' : '') + '</span></td><td>' + esc(l.skipReason || (l.doneAt ? 'Done ' + fmtTime(l.doneAt) : '')) + '</td></tr>';
      }).join('') + '</tbody></table>';
    if (day.log.closed) {
      h += '<div class="wf-note">The day is closed and recorded. New work that comes in later shows up again here.</div>' +
        '<div class="wf-acts"><button type="button" class="wf-btn" data-wf="reopen-day">Reopen the day</button></div>';
    } else if (open.length) {
      h += '<div class="wf-note wf-note-err">' + open.length + ' task(s) are still open. Finish them, or skip them with a reason, to close the day.</div>';
    } else {
      h += '<div class="wf-note">Everything is done or skipped with a reason. Close the day to record it.</div>' +
        '<div class="wf-acts"><button type="button" class="wf-btn wf-pri" data-wf="close-day">Close my day</button></div>';
    }
    h += '</div><div class="wf-nav"><button type="button" class="wf-btn" data-wf="prev">&#8249; Previous</button><span></span></div>';
    return h;
  }
  function fmtTime(iso) { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

  function closeTheDay() {
    const open = day.states.filter(s => !['done', 'skipped', 'setup'].includes(taskStatus(s)));
    if (open.length) { toast('Finish or skip the open tasks first', 'warn'); return; }
    day.log.closed = true; day.log.closedAt = new Date().toISOString();
    day.states.forEach(saveTaskLog);
    paint();
    toast('Day closed and recorded. Thank you.');
  }

  function paintDbNote() {
    const el = $('wfDbNote'); if (!el) return;
    el.style.display = dbMissing ? 'block' : 'none';
    el.textContent = dbMissing ? 'History is kept on this computer only. Run DAILY_TASKS_MIGRATION.sql in Supabase so the record is saved for the MD.' : '';
  }

  // Open-task count on the top bar's Tasks button.
  function updateBadge() {
    const btn = $('erpBtnTasks'); if (!btn || !day) return;
    const open = day.states.filter(s => !['done', 'skipped', 'setup'].includes(taskStatus(s))).length;
    let b = btn.querySelector('.wf-badge');
    if (!b) { b = document.createElement('span'); b.className = 'wf-badge'; btn.appendChild(b); }
    b.textContent = open; b.style.display = open ? '' : 'none';
    btn.title = open ? 'My Day: ' + open + ' task(s) open' : 'My Day: all done';
  }

  /* ══ AUTO-OPEN once a day after login ════════════════════════════════ */
  function autoOpen() {
    try {
      if (!can('HOME_MYDAY')) return;
      const gate = $('sarvLoginGate');
      if (gate && gate.style.display !== 'none') return;
      if (!(typeof sarvCurrentRole !== 'undefined' && sarvCurrentRole)) return;
      const u = userInfo(), date = isoToday();
      const flag = 'sarv_wf_auto_' + date + '_' + u.key;
      if (localStorage.getItem(flag)) return;
      if (readLocal(date, u.key).closed) return;
      localStorage.setItem(flag, '1');
      openMyDay();
    } catch (e) { console.warn('[MyDay] auto-open skipped:', e.message || e); }
  }
  // After erp-shell.js has wrapped sarvGoHome (it does so on DOMContentLoaded),
  // so a login landing on Home opens My Day on top of the shell.
  window.addEventListener('load', () => {
    if (typeof window.sarvGoHome === 'function') {
      const orig = window.sarvGoHome;
      window.sarvGoHome = function () {
        const r = orig.apply(this, arguments);
        setTimeout(autoOpen, 600);
        return r;
      };
    }
    setTimeout(autoOpen, 1200);
  });

  window.wfOpenMyDay = openMyDay;
  window.wfCloseMyDay = closeDay;
  window.SARV_WF = { TASKS, get day() { return day; }, run: runTask };
})();
