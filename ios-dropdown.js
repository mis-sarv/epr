/* ios-dropdown.js — one look for every dropdown list of the project (with ios-dropdown.css).
   The browser's own popups cannot be styled, so they are replaced by the Gate-2 search
   list card, opening with an iOS spring:
     1. <select>            a tap / click (or Space, Alt+Down, F4 on a focused one) opens the
                            list instead of the native picker: a popover under / over the box on
                            a PC or tablet, a bottom sheet on a phone (< 768 px; pull it down or
                            tap outside to close). A Search box is added above 8 options. The
                            chosen value is written through the element's own value setter and
                            'input' + 'change' are fired, so inline onchange="", addEventListener
                            and React / controlled boxes all see it exactly as a native pick.
     2. <input list="...">  the datalist suggestions show in the same card under the box while
                            typing (every word, any order); free typing stays allowed, as with a
                            datalist. ↑ / ↓ move, Enter takes the marked row, Esc closes. While
                            the box has focus its list attribute is parked in data-iosdd-list (so
                            the native popup never shows) and is put back on blur.
   Never touched: a disabled or read-only box, <select multiple> / size > 1, and anything inside
   [data-native-dd] or with data-native. Every row is built with textContent (no page text is
   read as HTML). Nothing here changes a page's layout; the page's own CSS stays as it is.
   Options are read when the list opens, so lists filled later by the page are always current.
   window.IOS_DROPDOWN = { selects:false } / { datalists:false } before this script switches a part
   off; window.IosDropdown.close() closes an open list.
   Per box: data-iosdd-search on a <select> = the Search box always (not only from 9 options);
   data-iosdd-cls="ok" on an <option> = that row gets the class (ok = green, warn = amber; ios-dropdown.css). Load it on every app page, after the
   page's own head scripts, with ios-dropdown.css. */
(function () {
    'use strict';
    if (window.IosDropdown) return;
    var CFG = Object.assign({ selects: true, datalists: true, searchFrom: 9, maxRows: 400 }, window.IOS_DROPDOWN || {});
    var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    var phone = function () { return window.innerWidth < 768; };
    var norm = function (s) { return String(s == null ? '' : s).toUpperCase().replace(/\s+/g, ' ').trim(); };
    var words = function (q) { return norm(q).split(' ').filter(Boolean); };
    var hit = function (hay, ws) { if (!ws.length) return true; var h = norm(hay); for (var i = 0; i < ws.length; i++) if (h.indexOf(ws[i]) < 0) return false; return true; };
    var NS = 'http://www.w3.org/2000/svg';

    function skip(el) {
        if (!el || el.disabled || el.readOnly) return true;
        if (el.hasAttribute('data-native') || (el.closest && el.closest('[data-native-dd]'))) return true;
        if (el.tagName === 'SELECT' && (el.multiple || (el.size && el.size > 1))) return true;
        return false;
    }
    // Write the value the way a user's pick does, so React's value tracker sees a change too.
    function setValue(el, v) {
        var proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        var d = Object.getOwnPropertyDescriptor(proto, 'value');
        if (d && d.set) d.set.call(el, v); else el.value = v;
        // __iosdlg: ios-dialog.js may repeat this pick (a confirm() in the page's change handler), like a user's own change
        var a = new Event('input', { bubbles: true }), c = new Event('change', { bubbles: true });
        a.__iosdlg = []; c.__iosdlg = [];
        el.dispatchEvent(a);
        el.dispatchEvent(c);
    }
    function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function check() {
        var s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ck');
        var p = document.createElementNS(NS, 'path'); p.setAttribute('d', 'M5 12.5l4.5 4.5L19 7.5'); p.setAttribute('fill', 'none');
        p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2.6'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
        s.appendChild(p); return s;
    }
    function titleOf(sel) {
        try { if (sel.labels && sel.labels[0]) { var t = sel.labels[0].textContent.replace(/\*/g, '').trim(); if (t) return t; } } catch (e) { }
        if (sel.getAttribute('aria-label')) return sel.getAttribute('aria-label');
        if (sel.title) return sel.title;
        var o = sel.options[0]; if (o && !o.value && o.textContent.trim()) return o.textContent.replace(/^[-\s]+|[-\s]+$/g, '').trim();
        return 'Choose';
    }

    var S = null;   // the open list: { kind, el, root, panel, list, search, items, rows, act, sheet, up }

    /* ── open / close ─────────────────────────────────────────────── */
    function build(kind, el, sheet) {
        var root = mk('div', 'iosdd-root'); root.setAttribute('data-no-ios-pop', ''); root.setAttribute('data-no-caps', '');
        // closed on its own click (not on touch-down), so the tap that closes it never lands on the page below
        if (sheet) { var bd = mk('div', 'iosdd-backdrop'); bd.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); close(); }); root.appendChild(bd); }
        var panel = mk('div', 'iosdd-panel ' + (sheet ? 'iosdd-sheet' : 'iosdd-pop'));
        panel.setAttribute('role', 'dialog');
        if (sheet) {
            panel.appendChild(mk('div', 'iosdd-grab'));
            var head = mk('div', 'iosdd-head'); head.appendChild(mk('span', '', kind === 'select' ? titleOf(el) : 'Choose'));
            var done = mk('button', 'iosdd-done', 'Done'); done.type = 'button'; done.addEventListener('click', function () { close(); });
            head.appendChild(done); panel.appendChild(head);
            dragToClose(panel, panel.firstChild, head);
        }
        var search = null;
        if (kind === 'select' && (el.options.length >= CFG.searchFrom || el.hasAttribute('data-iosdd-search'))) {
            var sw = mk('div', 'iosdd-search'); search = mk('input'); search.type = 'search'; search.placeholder = 'Search';
            search.setAttribute('autocomplete', 'off'); search.setAttribute('data-no-caps', '');
            sw.appendChild(search); panel.appendChild(sw);
        }
        var list = mk('div', 'iosdd-list'); list.setAttribute('role', 'listbox'); panel.appendChild(list);
        root.appendChild(panel);
        return { root: root, panel: panel, list: list, search: search };
    }
    function show(st) {
        S = st; document.body.appendChild(st.root);
        if (st.sheet) { st.prevOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden'; }
        else place();
        void st.root.offsetWidth;   // the start state is drawn before the spring runs
        requestAnimationFrame(function () { if (S === st) st.root.classList.add('in'); });
    }
    function close(instant) {
        var st = S; if (!st) return; S = null;
        if (st.mo) st.mo.disconnect();
        if (st.sheet) document.documentElement.style.overflow = st.prevOverflow || '';
        if (instant || reduce) { st.root.remove(); return; }
        st.root.classList.remove('in'); st.root.classList.add('out');
        setTimeout(function () { st.root.remove(); }, st.sheet ? 260 : 170);
    }
    // Popover: under its box when there is room (else over it), never past the screen edges.
    function place() {
        if (!S || S.sheet) return;
        var r = S.el.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
        if (r.bottom < 0 || r.top > vh || (!r.width && !r.height)) { close(true); return; }
        var p = S.panel, w = Math.min(Math.max(r.width, 220), vw - 16), left = Math.min(Math.max(8, r.left), vw - w - 8);
        var below = vh - r.bottom - 10, above = r.top - 10, want = Math.min(340, S.wantH || 340);
        var up = below < Math.min(220, want) && above > below;
        p.style.left = left + 'px'; p.style.width = w + 'px';
        if (up) { p.style.top = ''; p.style.bottom = (vh - r.top + 4) + 'px'; p.style.maxHeight = Math.max(120, Math.min(340, above)) + 'px'; }
        else { p.style.bottom = ''; p.style.top = (r.bottom + 4) + 'px'; p.style.maxHeight = Math.max(120, Math.min(340, below)) + 'px'; }
        p.classList.toggle('up', up);
    }
    function dragToClose(panel, grab, head) {
        var y0 = null, dy = 0;
        var down = function (e) { y0 = e.clientY; dy = 0; panel.style.transition = 'none'; try { e.target.setPointerCapture(e.pointerId); } catch (x) { } };
        var move = function (e) { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); panel.style.transform = 'translateY(' + dy + 'px)'; };
        var up = function () { if (y0 == null) return; y0 = null; panel.style.transition = ''; panel.style.transform = ''; if (dy > 80) close(); };
        [grab, head].forEach(function (h) { h.addEventListener('pointerdown', function (e) { if (e.target.closest('button')) return; down(e); }); h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up); });
    }

    /* ── rows ─────────────────────────────────────────────────────── */
    function selectItems(sel) {
        var out = [], g = null;
        Array.prototype.forEach.call(sel.querySelectorAll('option, optgroup'), function (n) {
            if (n.tagName === 'OPTGROUP') { g = n.label || ''; return; }
            if (n.hidden || n.style.display === 'none') return;
            var grp = n.parentNode && n.parentNode.tagName === 'OPTGROUP' ? (n.parentNode.label || '') : '';
            if (!grp) g = null;
            out.push({ value: n.value, text: n.label || n.textContent, group: grp, disabled: n.disabled || (n.parentNode && n.parentNode.disabled), selected: n.selected, ph: !n.value,
                       cls: String(n.getAttribute('data-iosdd-cls') || '').replace(/[^a-z0-9 -]/gi, '') });
        });
        return out;
    }
    function datalistItems(input) {
        var id = input.getAttribute('data-iosdd-list') || input.getAttribute('list'), dl = id && document.getElementById(id);
        if (!dl) return [];
        var seen = {};
        return Array.prototype.map.call(dl.options || dl.querySelectorAll('option'), function (o) {
            var v = o.value != null && o.value !== '' ? o.value : o.textContent, lab = (o.label && o.label !== v) ? o.label : (o.textContent && o.textContent !== v ? o.textContent : '');
            return { value: v, text: v, sub: lab, disabled: o.disabled };
        }).filter(function (x) { if (!x.value || seen[x.value]) return false; seen[x.value] = 1; return true; });
    }
    function render() {
        if (!S) return;
        var ws = words(S.kind === 'select' ? (S.search ? S.search.value : '') : S.el.value);
        var items = S.items.filter(function (it) { return hit(it.text + ' ' + (it.sub || '') + ' ' + (it.group || '') + (S.kind === 'select' ? '' : ' ' + it.value), ws); });
        // a datalist whose only match is exactly what is typed has nothing left to offer
        if (S.kind === 'datalist' && items.length === 1 && norm(items[0].value) === norm(S.el.value)) items = [];
        S.list.textContent = ''; S.rows = []; S.act = -1;
        if (!items.length) {
            if (S.kind === 'datalist') { if (S.root.parentNode) S.root.style.visibility = 'hidden'; return; }
            S.list.appendChild(mk('div', 'iosdd-empty', 'Nothing matches'));
        }
        S.root.style.visibility = '';
        var frag = document.createDocumentFragment(), lastGrp = null, shown = items.slice(0, CFG.maxRows);
        shown.forEach(function (it) {
            if (it.group && it.group !== lastGrp) { frag.appendChild(mk('div', 'iosdd-grp', it.group)); }
            lastGrp = it.group || null;
            var row = mk('div', 'iosdd-opt' + (it.selected ? ' sel' : '') + (it.disabled ? ' dis' : '') + (it.ph ? ' ph' : '') + (it.cls ? ' ' + it.cls : ''));
            row.setAttribute('role', 'option'); if (it.selected) row.setAttribute('aria-selected', 'true');
            row.appendChild(mk('span', 'v', it.text || ' '));
            if (it.sub) row.appendChild(mk('span', 's', it.sub));
            else if (it.selected) row.appendChild(check());
            if (!it.disabled) { row._it = it; S.rows.push(row); }
            frag.appendChild(row);
        });
        if (items.length > shown.length) frag.appendChild(mk('div', 'iosdd-more', (items.length - shown.length) + ' more · type to narrow down'));
        S.list.appendChild(frag);
        S.wantH = Math.min(340, (shown.length * 41) + (S.search ? 52 : 0) + 4);
        place();
    }
    function mark(i) {
        if (!S || !S.rows.length) return;
        if (S.act >= 0 && S.rows[S.act]) S.rows[S.act].classList.remove('act');
        S.act = Math.max(0, Math.min(S.rows.length - 1, i));
        var r = S.rows[S.act]; r.classList.add('act');
        try { r.scrollIntoView({ block: 'nearest' }); } catch (e) { }
    }
    function pick(it) {
        var st = S, el = st.el; close();
        if (!it) return;
        if (st.kind === 'select') { if (el.value !== it.value) setValue(el, it.value); }
        else setValue(el, it.value);
        try { el.focus({ preventScroll: true }); } catch (e) { }
    }

    /* ── 1. <select> ──────────────────────────────────────────────── */
    function openSelect(sel) {
        if (S && S.el === sel) { close(); return; }
        close(true);
        var sheet = phone(), b = build('select', sel, sheet);
        var st = { kind: 'select', el: sel, sheet: sheet, items: selectItems(sel), root: b.root, panel: b.panel, list: b.list, search: b.search };
        b.list.addEventListener('pointerdown', function (e) { var r = e.target.closest('.iosdd-opt'); if (r && r._it) e.preventDefault(); });
        b.list.addEventListener('click', function (e) { var r = e.target.closest('.iosdd-opt'); if (r && r._it) pick(r._it); });
        if (b.search) {
            b.search.addEventListener('input', render);
            b.search.addEventListener('keydown', function (e) {
                if (e.key === 'ArrowDown') { e.preventDefault(); mark(S.act + 1); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); mark(S.act - 1); }
                else if (e.key === 'Enter') { e.preventDefault(); var r = S.rows[S.act >= 0 ? S.act : 0]; if (r) pick(r._it); }
                else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); var el = S.el; close(); try { el.focus(); } catch (x) { } }
            });
        }
        show(st); render();
        var cur = st.rows.findIndex(function (r) { return r._it.selected; });
        if (cur >= 0) { st.act = -1; mark(cur); }
        /* A page that fills its options when the box is focused, or a moment later from the
           server, is followed: the open list is read again whenever the options change. */
        if (window.MutationObserver) {
            st.mo = new MutationObserver(function () { if (S === st) { st.items = selectItems(sel); render(); } });
            st.mo.observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'label', 'hidden'] });
        }
        if (b.search && !sheet) setTimeout(function () { try { b.search.focus({ preventScroll: true }); } catch (e) { } }, 30);
    }
    var tap = null;
    function eligibleSelect(t) { var s = t && t.closest && t.closest('select'); return s && !skip(s) ? s : null; }
    if (CFG.selects) {
        document.addEventListener('pointerdown', function (e) {
            var s = eligibleSelect(e.target); tap = null; if (!s || e.button > 0) return;
            if (e.pointerType === 'mouse' || e.pointerType === 'pen') { e.preventDefault(); try { s.focus({ preventScroll: true }); } catch (x) { } openSelect(s); }
            else tap = { s: s, x: e.clientX, y: e.clientY };
        }, true);
        // A finger: opened on the lift, and only for a tap (a scroll that starts on a box is not a tap)
        document.addEventListener('touchend', function (e) {
            if (!tap) return; var t = e.changedTouches && e.changedTouches[0], s = tap.s, ok = t && Math.abs(t.clientX - tap.x) < 10 && Math.abs(t.clientY - tap.y) < 10; tap = null;
            if (!ok || skip(s)) return;
            e.preventDefault(); try { s.focus({ preventScroll: true }); } catch (x) { } openSelect(s);
        }, { capture: true, passive: false });
        // the native picker is also tied to these: they must not reach it
        ['mousedown', 'click'].forEach(function (ev) { document.addEventListener(ev, function (e) { if (eligibleSelect(e.target)) e.preventDefault(); }, true); });
        document.addEventListener('keydown', function (e) {
            var s = e.target && e.target.tagName === 'SELECT' ? e.target : null; if (!s || skip(s)) return;
            // its list is open (no Search box, so the keys still land on the select)
            if (S && S.el === s) {
                if (e.key === 'ArrowDown') { e.preventDefault(); mark(S.act + 1); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); mark(S.act - 1); }
                else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); var r = S.rows[S.act]; if (r) pick(r._it); else close(); }
                else if (e.key === 'Escape') { e.preventDefault(); close(); }
                else if (e.key === 'Tab') close();
                return;
            }
            if (e.key === ' ' || e.key === 'F4' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp'))) { e.preventDefault(); openSelect(s); }
        }, true);
    }

    /* ── 2. <input list> (datalist) ───────────────────────────────── */
    function park(input) {
        if (input.hasAttribute('list')) { input.setAttribute('data-iosdd-list', input.getAttribute('list')); input.removeAttribute('list'); }
        if (!input.hasAttribute('autocomplete')) { input.setAttribute('autocomplete', 'off'); input.setAttribute('data-iosdd-ac', ''); }
    }
    function unpark(input) {
        // put it back unless the page took the list away meanwhile (e.g. it locked the box)
        if (input.hasAttribute('data-iosdd-list') && !input.hasAttribute('list') && !input.readOnly && !input.disabled) input.setAttribute('list', input.getAttribute('data-iosdd-list'));
        input.removeAttribute('data-iosdd-list');
        if (input.hasAttribute('data-iosdd-ac')) { input.removeAttribute('autocomplete'); input.removeAttribute('data-iosdd-ac'); }
    }
    function openDatalist(input) {
        if (S && S.el === input) { S.items = datalistItems(input); render(); return; }
        close(true);
        var items = datalistItems(input); if (!items.length) return;
        var b = build('datalist', input, false);
        var st = { kind: 'datalist', el: input, sheet: false, items: items, root: b.root, panel: b.panel, list: b.list, search: null };
        b.list.addEventListener('pointerdown', function (e) { var r = e.target.closest('.iosdd-opt'); if (r && r._it) { e.preventDefault(); pick(r._it); } });
        show(st); render();
        // a datalist filled from the server while the box is open shows its new rows at once
        var dl = document.getElementById(input.getAttribute('data-iosdd-list') || input.getAttribute('list') || '');
        if (dl && window.MutationObserver) {
            st.mo = new MutationObserver(function () { if (S === st) { st.items = datalistItems(input); render(); } });
            st.mo.observe(dl, { childList: true, subtree: true });
        }
    }
    function dlInput(t) { return t && t.tagName === 'INPUT' && (t.hasAttribute('list') || t.hasAttribute('data-iosdd-list')) && !skip(t) ? t : null; }
    if (CFG.datalists) {
        document.addEventListener('pointerdown', function (e) {
            var i = dlInput(e.target); if (!i) return; park(i);
            if (document.activeElement === i) openDatalist(i);   // a tap on a box that already has focus shows the list, like the native arrow
            else setTimeout(function () { if (document.activeElement === i) openDatalist(i); }, 0);
        }, true);
        document.addEventListener('focusin', function (e) { var i = dlInput(e.target); if (i) park(i); }, true);
        document.addEventListener('focusout', function (e) {
            var i = e.target; if (!i || i.tagName !== 'INPUT' || !i.hasAttribute('data-iosdd-list')) return;
            setTimeout(function () { if (document.activeElement !== i) { if (S && S.el === i) close(); unpark(i); } }, 120);
        }, true);
        document.addEventListener('input', function (e) { var i = dlInput(e.target); if (i && e.isTrusted) { park(i); openDatalist(i); } }, true);
        document.addEventListener('keydown', function (e) {
            var i = dlInput(e.target); if (!i) return;
            if (!S || S.el !== i) { if (e.key === 'ArrowDown' && !e.altKey) { park(i); openDatalist(i); if (S && S.el === i) { e.preventDefault(); mark(0); } } return; }
            if (e.key === 'ArrowDown') { e.preventDefault(); mark(S.act + 1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); mark(S.act - 1); }
            else if (e.key === 'Enter' && S.act >= 0 && S.rows[S.act]) { e.preventDefault(); e.stopPropagation(); pick(S.rows[S.act]._it); }
            else if (e.key === 'Escape') { e.preventDefault(); close(); }
            else if (e.key === 'Tab') close();
        }, true);
    }

    /* ── shared: outside tap, scroll, resize, Esc ─────────────────── */
    document.addEventListener('pointerdown', function (e) {
        if (!S) return;
        if (S.root.contains(e.target) || e.target === S.el || (S.el.contains && S.el.contains(e.target))) return;   // inside the list / its backdrop / its own box
        close();
    }, true);
    var raf = 0;
    var follow = function (e) { if (!S || S.sheet) return; if (e && e.target && e.target.nodeType === 1 && S.panel.contains(e.target)) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', function () { if (S && S.sheet !== phone()) close(true); else follow(); });
    window.addEventListener('pagehide', function () { close(true); });

    window.IosDropdown = { close: function () { close(); }, open: function (el) { if (el && el.tagName === 'SELECT' && !skip(el)) openSelect(el); else if (dlInput(el)) { park(el); openDatalist(el); } } };
})();
