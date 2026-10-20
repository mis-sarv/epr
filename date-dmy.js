/* date-dmy.js — every date box in every app reads and writes DD/MM/YYYY.
 *
 * Why: <input type="date"> is drawn by the browser in the computer's own
 * locale, so the same screen showed 10/21/2026 on one PC and 21/10/2026 on the
 * next. There is no attribute that fixes the display format, so this file turns
 * each date box into a text box that shows DD/MM/YYYY, while the element's
 * `.value` keeps speaking YYYY-MM-DD, exactly like a native date input. No code
 * that saves, filters or compares dates has to change.
 *
 * What the user gets:
 *   • slashes are typed for them (2110 → 21/10/)
 *   • after DD/MM the CURRENT YEAR is filled in and selected, so Tab accepts it
 *     and typing replaces it
 *   • the calendar icon on the right (or Alt+Down / F4) opens a DD/MM/YYYY
 *     calendar with month and year dropdowns, Today and Clear
 *   • 21-10-26, 21.10.2026 and 2026-10-21 are all understood on paste / blur
 *   • an impossible date (31/02) or one outside min / max gets a red border
 *
 * How the element keeps working for the rest of the code:
 *   • `.value` / `.valueAsDate` are redefined on the element itself: reading
 *     gives 'YYYY-MM-DD' ('' while the date is incomplete or invalid, as a
 *     native date input would), writing accepts 'YYYY-MM-DD' (or a DD/MM/YYYY
 *     string) and displays DD/MM/YYYY.
 *   • the element stays the same node: id, classes, inline styles, listeners,
 *     focus(), readOnly / disabled and min / max attributes all still apply.
 *   • it carries data-dmy="1", so code / CSS that used input[type=date] should
 *     also match input[data-dmy].
 *   • inputs added later (innerHTML, React) are converted as they appear.
 * datetime-local boxes are left alone (they carry a time as well).
 *
 * Loaded in <head> of every app, before the page's own scripts.
 */
(function () {
  'use strict';
  if (window.SARV_DMY) return;

  const NATIVE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const nGet = el => NATIVE.get.call(el);
  const nSet = (el, v) => NATIVE.set.call(el, v);
  const pad = n => String(n).padStart(2, '0');
  const thisYear = () => new Date().getFullYear();

  function validYmd(y, m, d) {
    if (!(y >= 1000 && y <= 9999 && m >= 1 && m <= 12 && d >= 1)) return false;
    return d <= new Date(y, m, 0).getDate();
  }
  // Anything a person might type or a program might set → 'YYYY-MM-DD' or ''.
  function toIso(v) {
    if (v == null) return '';
    if (v instanceof Date) return isNaN(v) ? '' : v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    const s = String(v).trim();
    if (!s) return '';
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);                 // ISO (also with a time after it)
    if (m) { const y = +m[1], mo = +m[2], d = +m[3]; return validYmd(y, mo, d) ? y + '-' + pad(mo) + '-' + pad(d) : ''; }
    m = /^(\d{1,2})[\/.\-\s](\d{1,2})[\/.\-\s](\d{2}|\d{4})$/.exec(s);   // D/M/Y
    if (m) {
      let y = +m[3]; if (m[3].length === 2) y += 2000;
      const mo = +m[2], d = +m[1];
      return validYmd(y, mo, d) ? y + '-' + pad(mo) + '-' + pad(d) : '';
    }
    m = /^(\d{2})(\d{2})(\d{4})$/.exec(s);                             // DDMMYYYY
    if (m) { const y = +m[3], mo = +m[2], d = +m[1]; return validYmd(y, mo, d) ? y + '-' + pad(mo) + '-' + pad(d) : ''; }
    return '';
  }
  const isoToDmy = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };

  /* ── look ─────────────────────────────────────────────────────────── */
  const ICON = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2'/%3E%3Cpath d='M16 2v4M8 2v4M3 10h18'/%3E%3C/svg%3E\")";
  function addCss() {
    if (document.getElementById('sarvDmyCss')) return;
    const st = document.createElement('style');
    st.id = 'sarvDmyCss';
    st.textContent =
      'input[data-dmy]{background-image:' + ICON + ' !important;background-repeat:no-repeat !important;' +
      'background-position:right 7px center !important;background-size:15px 15px !important;padding-right:28px !important;' +
      'font-variant-numeric:tabular-nums;}' +
      'input[data-dmy][readonly],input[data-dmy]:disabled{background-image:none !important;padding-right:8px !important;}' +
      'input[data-dmy].dmy-bad{border-color:#dc2626 !important;box-shadow:0 0 0 2px rgba(220,38,38,.15) !important;}' +
      /* the calendar popup — all values set here so no page stylesheet can bend it */
      '#sarvDmyCal{position:fixed;z-index:2147483646;display:none;width:264px;box-sizing:border-box;background:#fff;color:#0f172a;' +
        'border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 12px 32px rgba(15,23,42,.22);padding:10px;' +
        'font:13px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;text-transform:none;letter-spacing:0;}' +
      '#sarvDmyCal *{box-sizing:border-box;font:inherit;text-transform:none;letter-spacing:0;}' +
      '#sarvDmyCal .dc-head{display:flex;align-items:center;gap:4px;margin-bottom:8px;}' +
      '#sarvDmyCal .dc-nav{width:28px;height:28px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:6px;cursor:pointer;color:#334155;font-size:15px;line-height:1;padding:0;}' +
      '#sarvDmyCal .dc-nav:hover{background:#e2e8f0;}' +
      '#sarvDmyCal select{flex:1;height:28px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;color:#0f172a;padding:0 4px;cursor:pointer;min-width:0;}' +
      '#sarvDmyCal .dc-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}' +
      '#sarvDmyCal .dc-wd{text-align:center;font-size:10.5px;font-weight:600;color:#64748b;padding:3px 0;}' +
      '#sarvDmyCal .dc-day{height:30px;border:0;border-radius:6px;background:transparent;color:#0f172a;cursor:pointer;padding:0;font-variant-numeric:tabular-nums;}' +
      '#sarvDmyCal .dc-day:hover{background:#eff6ff;}' +
      '#sarvDmyCal .dc-day.dc-out{color:#cbd5e1;}' +
      '#sarvDmyCal .dc-day.dc-today{box-shadow:inset 0 0 0 1px #2563eb;font-weight:700;}' +
      '#sarvDmyCal .dc-day.dc-sel{background:#2563eb;color:#fff;font-weight:700;}' +
      '#sarvDmyCal .dc-day:disabled{color:#d4d4d8;background:transparent;cursor:not-allowed;text-decoration:line-through;}' +
      '#sarvDmyCal .dc-foot{display:flex;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9;}' +
      '#sarvDmyCal .dc-btn{flex:1;height:28px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc;color:#334155;cursor:pointer;font-size:12px;font-weight:600;}' +
      '#sarvDmyCal .dc-btn:hover{background:#e2e8f0;}' +
      '#sarvDmyCal .dc-btn.dc-pri{background:#2563eb;border-color:#2563eb;color:#fff;}' +
      '#sarvDmyCal .dc-note{font-size:10.5px;color:#64748b;margin-top:6px;text-align:center;}';
    (document.head || document.documentElement).appendChild(st);
  }

  /* ── the calendar popup ──────────────────────────────────────────────
     Our own, not the browser's: the browser's picker can only be opened from
     a hidden field with showPicker(), which some browsers refuse or do not
     have, and it shows the date in the computer's own format again. This one
     opens every time, reads DD/MM/YYYY, and has month and year dropdowns so
     any date, years back or ahead, is two clicks away. Days outside the box's
     min / max (e.g. Required By cannot be in the past) are greyed out. */
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  let cal = null, calFor = null, calY = 0, calM = 0;
  const ymd = (y, m, d) => y + '-' + pad(m + 1) + '-' + pad(d);
  const todayIso = () => { const t = new Date(); return ymd(t.getFullYear(), t.getMonth(), t.getDate()); };
  function getCal() {
    if (cal) return cal;
    cal = document.createElement('div');
    cal.id = 'sarvDmyCal';
    cal.setAttribute('role', 'dialog');
    cal.setAttribute('aria-label', 'Choose a date');
    cal.innerHTML =
      '<div class="dc-head">' +
        '<button type="button" class="dc-nav" data-nav="-1" title="Previous month">&#8249;</button>' +
        '<select class="dc-m" aria-label="Month"></select>' +
        '<select class="dc-y" aria-label="Year"></select>' +
        '<button type="button" class="dc-nav" data-nav="1" title="Next month">&#8250;</button>' +
      '</div>' +
      '<div class="dc-grid"></div>' +
      '<div class="dc-foot">' +
        '<button type="button" class="dc-btn dc-pri" data-act="today">Today</button>' +
        '<button type="button" class="dc-btn" data-act="clear">Clear</button>' +
        '<button type="button" class="dc-btn" data-act="close">Close</button>' +
      '</div>' +
      '<div class="dc-note"></div>';
    cal.querySelector('.dc-m').innerHTML = MONTHS.map((m, i) => '<option value="' + i + '">' + m + '</option>').join('');
    // Keep focus in the text box while the calendar is used with the mouse.
    cal.addEventListener('mousedown', e => { if (e.target.tagName !== 'SELECT') e.preventDefault(); });
    cal.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t || !calFor) return;
      if (t.dataset.nav) { calM += +t.dataset.nav; if (calM < 0) { calM = 11; calY--; } if (calM > 11) { calM = 0; calY++; } drawCal(); return; }
      if (t.dataset.day) { pick(t.dataset.day); return; }
      if (t.dataset.act === 'today') { const ti = todayIso(); if (inRange(ti)) pick(ti); else { calY = +ti.slice(0, 4); calM = +ti.slice(5, 7) - 1; drawCal(); } return; }
      if (t.dataset.act === 'clear') { calFor.value = ''; fire(calFor); validate(calFor); closeCal(true); return; }
      if (t.dataset.act === 'close') closeCal(true);
    });
    cal.querySelector('.dc-m').addEventListener('change', e => { calM = +e.target.value; drawCal(); });
    cal.querySelector('.dc-y').addEventListener('change', e => { calY = +e.target.value; drawCal(); });
    cal.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeCal(true); } });
    document.addEventListener('mousedown', e => {
      if (cal.style.display !== 'block') return;
      if (cal.contains(e.target) || e.target === calFor) return;
      closeCal(false);
    }, true);
    // Re-placed, not closed: on a phone the on-screen keyboard resizes the window.
    window.addEventListener('resize', () => { if (cal.style.display === 'block') placeCal(); });
    document.addEventListener('scroll', e => { if (cal.style.display === 'block' && !cal.contains(e.target)) placeCal(); }, true);
    (document.body || document.documentElement).appendChild(cal);
    return cal;
  }
  function inRange(iso) {
    if (!calFor) return true;
    const mn = calFor.getAttribute('min'), mx = calFor.getAttribute('max');
    return !((mn && iso < mn) || (mx && iso > mx));
  }
  function pick(iso) {
    const el = calFor; if (!el) return;
    el.value = iso;
    fire(el);
    validate(el);
    closeCal(true);
  }
  function drawCal() {
    const c = getCal();
    // Year list: wide enough for any business date, and always including the
    // year on screen and the box's own min / max years.
    const ty = new Date().getFullYear();
    let y0 = Math.min(ty - 60, calY - 5), y1 = Math.max(ty + 20, calY + 5);
    const mn = calFor && calFor.getAttribute('min'), mx = calFor && calFor.getAttribute('max');
    if (mn) y0 = Math.min(y0, +mn.slice(0, 4)); if (mx) y1 = Math.max(y1, +mx.slice(0, 4));
    const ys = c.querySelector('.dc-y');
    if (ys.dataset.range !== y0 + '-' + y1) {
      let h = ''; for (let y = y1; y >= y0; y--) h += '<option value="' + y + '">' + y + '</option>';
      ys.innerHTML = h; ys.dataset.range = y0 + '-' + y1;
    }
    ys.value = String(calY);
    c.querySelector('.dc-m').value = String(calM);
    const sel = calFor ? calFor.value : '', tIso = todayIso();
    const first = new Date(calY, calM, 1).getDay();          // 0 = Sunday
    const dim = new Date(calY, calM + 1, 0).getDate();
    const prevDim = new Date(calY, calM, 0).getDate();
    let h = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => '<div class="dc-wd">' + d + '</div>').join('');
    for (let i = 0; i < 42; i++) {
      let y = calY, m = calM, d = i - first + 1, out = false;
      if (d < 1) { m--; d += prevDim; out = true; if (m < 0) { m = 11; y--; } }
      else if (d > dim) { m++; d -= dim; out = true; if (m > 11) { m = 0; y++; } }
      const iso = ymd(y, m, d);
      const cls = 'dc-day' + (out ? ' dc-out' : '') + (iso === tIso ? ' dc-today' : '') + (iso === sel ? ' dc-sel' : '');
      h += '<button type="button" class="' + cls + '" data-day="' + iso + '"' + (inRange(iso) ? '' : ' disabled') +
        ' title="' + pad(d) + '/' + pad(m + 1) + '/' + y + '">' + d + '</button>';
    }
    c.querySelector('.dc-grid').innerHTML = h;
    const note = c.querySelector('.dc-note');
    note.textContent = (mn || mx) ? 'Allowed: ' + (mn ? 'from ' + isoToDmy(mn) : '') + (mn && mx ? ' ' : '') + (mx ? 'up to ' + isoToDmy(mx) : '') : '';
    note.style.display = note.textContent ? '' : 'none';
  }
  function placeCal() {
    if (!cal || !calFor) return;
    const r = calFor.getBoundingClientRect(), w = cal.offsetWidth || 264, h = cal.offsetHeight || 330;
    let left = Math.min(Math.max(6, r.right - w), window.innerWidth - w - 6);
    if (r.left + w <= window.innerWidth - 6) left = Math.max(6, r.left);
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 6 && r.top - h - 4 >= 6) top = r.top - h - 4;   // flip above
    cal.style.left = left + 'px';
    cal.style.top = Math.max(6, top) + 'px';
  }
  function openPicker(el) {
    if (el.readOnly || el.disabled) return;
    getCal();
    calFor = el;
    // Open on the box's date; empty → today; today outside min/max → the min / max month.
    let base = el.value || todayIso();
    if (!el.value) {
      const mn = el.getAttribute('min'), mx = el.getAttribute('max');
      if (mn && base < mn) base = mn; else if (mx && base > mx) base = mx;
    }
    calY = +base.slice(0, 4); calM = +base.slice(5, 7) - 1;
    drawCal();
    cal.style.display = 'block';
    placeCal();
  }
  function closeCal(refocus) {
    if (!cal || cal.style.display !== 'block') return;
    cal.style.display = 'none';
    const el = calFor; calFor = null;
    if (refocus && el) { try { el.focus(); } catch (e) {} }
  }

  function fire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // Red border + a tooltip for an impossible date or one outside min / max.
  function validate(el) {
    const text = nGet(el).trim();
    let msg = '';
    if (text) {
      const iso = toIso(text);
      if (!iso) msg = 'Enter a valid date as DD/MM/YYYY';
      else {
        const mn = el.getAttribute('min'), mx = el.getAttribute('max');
        if (mn && iso < mn) msg = 'Date cannot be before ' + isoToDmy(mn);
        else if (mx && iso > mx) msg = 'Date cannot be after ' + isoToDmy(mx);
      }
    }
    el.classList.toggle('dmy-bad', !!msg);
    try { el.setCustomValidity(msg); } catch (e) {}
    if (msg) el.title = msg;
    else if (el.dataset.dmyTitle != null) el.title = el.dataset.dmyTitle;
  }

  /* ── typing: DD/MM/YYYY mask, year auto-filled after DD/MM ─────────── */
  function onInput(e) {
    const el = e.currentTarget;
    if (el.readOnly || el.disabled || el._dmyQuiet) return;
    if (calOpenFor(el)) closeCal(false);                 // typing takes over from the calendar
    const raw = nGet(el);
    const deleting = /^delete/.test(e.inputType || '');
    // A pasted / auto-filled whole date in any shape: normalise it straight away.
    if (!deleting && /[-.]|^\d{4}-/.test(raw)) {
      const iso = toIso(raw);
      if (iso) { nSet(el, isoToDmy(iso)); validate(el); return; }
    }
    if (deleting) { el.classList.remove('dmy-bad'); return; }
    const dg = raw.replace(/\D/g, '').slice(0, 8);
    let out = dg.slice(0, 2);
    if (dg.length >= 2) out += '/' + dg.slice(2, 4);
    if (dg.length >= 4) out += '/' + dg.slice(4, 8);
    let selYear = false;
    if (dg.length === 4) { out = dg.slice(0, 2) + '/' + dg.slice(2, 4) + '/' + thisYear(); selYear = true; }
    if (out !== raw) nSet(el, out);
    if (selYear) { try { el.setSelectionRange(6, 10); } catch (x) {} }
    else { try { el.setSelectionRange(out.length, out.length); } catch (x) {} }
    el.classList.remove('dmy-bad');
  }
  function onBlur(e) {
    const el = e.currentTarget;
    // Tab / click elsewhere closes the calendar; moving into the calendar itself
    // (its month / year dropdowns) does not.
    if (calOpenFor(el)) setTimeout(() => {
      if (calOpenFor(el) && document.activeElement !== el && !cal.contains(document.activeElement)) closeCal(false);
    }, 0);
    if (el.readOnly || el.disabled) return;
    const raw = nGet(el).trim();
    if (!raw) { validate(el); return; }
    // DD/MM with no year (or a half-typed year) gets this year.
    const m = /^(\d{1,2})\/(\d{1,2})\/?(\d{0,3})$/.exec(raw);
    let iso = m ? toIso(m[1] + '/' + m[2] + '/' + thisYear()) : toIso(raw);
    if (iso) {
      const shown = isoToDmy(iso);
      if (shown !== raw) { nSet(el, shown); fire(el); }
    }
    validate(el);
  }
  const calOpenFor = el => !!cal && cal.style.display === 'block' && calFor === el;
  function onKey(e) {
    const el = e.currentTarget;
    if (e.key === 'Escape' && calOpenFor(el)) { e.preventDefault(); e.stopPropagation(); closeCal(true); return; }
    // Alt+Down / F4 opens the calendar, as on a native date box.
    if ((e.altKey && e.key === 'ArrowDown') || e.key === 'F4') { e.preventDefault(); openPicker(el); }
  }
  function onClick(e) {
    const el = e.currentTarget;
    if (el.readOnly || el.disabled) return;
    const r = el.getBoundingClientRect();
    if (e.clientX < r.right - 30) return;               // the calendar icon only
    if (calOpenFor(el)) closeCal(true); else openPicker(el);
  }

  /* ── convert one native date input ──────────────────────────────── */
  function convert(el) {
    if (!el || el._dmy || el.type !== 'date') return;
    el._dmy = true;
    const iso = nGet(el);              // a native date input's value is already ISO
    el.type = 'text';
    el.setAttribute('data-dmy', '1');
    el.setAttribute('inputmode', 'numeric');
    el.setAttribute('autocomplete', 'off');
    if (!el.getAttribute('placeholder')) el.setAttribute('placeholder', 'DD/MM/YYYY');
    el.maxLength = 10;
    if (!el.title) el.title = 'DD/MM/YYYY';
    el.dataset.dmyTitle = el.title;          // restored once a red-border message clears
    nSet(el, isoToDmy(iso));
    Object.defineProperty(el, 'value', {
      configurable: true,
      get() { return toIso(nGet(this)); },
      set(v) {
        const s = v == null ? '' : String(v);
        nSet(this, s ? isoToDmy(toIso(s)) : '');
        this.classList.remove('dmy-bad');
        try { this.setCustomValidity(''); } catch (e) {}
      }
    });
    Object.defineProperty(el, 'valueAsDate', {
      configurable: true,
      get() { const i = toIso(nGet(this)); if (!i) return null; const p = i.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); },
      set(d) {
        // The LOCAL calendar day. A native date input reads the Date in UTC, so
        // packing.html's `valueAsDate = new Date()` showed YESTERDAY between
        // midnight and 05:30 IST. A Date at UTC midnight (what the getter
        // returns) still maps back to its own day.
        if (!d || isNaN(d)) { this.value = ''; return; }
        const utcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
        this.value = utcMidnight
          ? d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate())
          : d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      }
    });
    el.addEventListener('input', onInput, true);      // capture: tidy the text before the page's own handlers read it
    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onKey);
    el.addEventListener('click', onClick);
  }
  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.tagName === 'INPUT') { if (root.type === 'date') convert(root); return; }
    if (root.firstElementChild) root.querySelectorAll('input[type="date"]').forEach(convert);
  }

  addCss();
  scan(document.documentElement);
  new MutationObserver(list => {
    for (const rec of list) {
      if (rec.type === 'attributes') { if (rec.target.tagName === 'INPUT') scan(rec.target); continue; }
      rec.addedNodes.forEach(scan);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['type'] });
  document.addEventListener('DOMContentLoaded', () => { addCss(); scan(document.body); });

  window.SARV_DMY = { toIso, toDmy: v => isoToDmy(toIso(v)), convert, scan };
})();
