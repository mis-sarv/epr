/* ios-dialog.js — every alert(), confirm() and prompt() of the project as an iOS alert
   (with ios-dialog.css), plus IosDialog.alert / confirm / prompt / choose for new code.

   The browser's own boxes cannot be styled, and confirm() / prompt() STOP the code until
   they are answered, which a page-made box cannot do. So:
     • alert(msg)     shows the iOS alert and lets the code go on (nothing is waited for;
                      several in a row are shown one after the other).
     • confirm(msg) / prompt(msg, def) called while a user action is being handled (a
                      click / tap, a form Submit, a field change, a key such as Enter) answer
                      "Cancel" at once, show the iOS box, and on OK do that SAME action again
                      ("replay"): the same click on the same button, the same submit, the same
                      change with the field's value put back as it was. In that run the same
                      confirm() answers true (a prompt() the typed text), so the page code goes
                      through exactly as with the native box. Several boxes in one action are
                      asked one by one. This is right for code of the form
                          if (!confirm('Delete?')) return;   …do it…
                      which is how this project uses confirm(). A box whose Cancel DOES
                      something should use IosDialog.choose() (Task Manager's "update / new").
     • a confirm() / prompt() outside a user action (after an await, from a timer) keeps
       the browser's own box: there is nothing to replay.
   window.IOS_DIALOG = { native:true } before this script keeps the browser's boxes on a page.
   IosDialog.native.{alert,confirm,prompt} are the browser's own. Load it on every app page,
   in <head> (not defer), with ios-dialog.css. */
(function () {
    'use strict';
    if (window.IosDialog) return;
    var CFG = Object.assign({ native: false }, window.IOS_DIALOG || {});
    var NATIVE = { alert: window.alert.bind(window), confirm: window.confirm.bind(window), prompt: window.prompt.bind(window) };
    var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    var RED = /\b(delete|remove|cancel|discard|withdraw|reject|clear|erase|reset|purge|void|permanent|logout|log out|overwrite)/i;

    function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    // A message's first line becomes the title when there is more under it; a short one-liner is the title alone.
    function split(msg, title) {
        var m = String(msg == null ? '' : msg).replace(/\r\n/g, '\n').trim();
        if (title) return { title: title, msg: m };
        var i = m.indexOf('\n');
        if (i > 0 && i <= 90) return { title: m.slice(0, i).trim(), msg: m.slice(i + 1).replace(/^\n+/, '') };
        if (m.length <= 90) return { title: m, msg: '' };
        return { title: '', msg: m };
    }

    /* ── one dialog on screen at a time; the rest wait their turn ─────────── */
    var queue = [], open = null;
    function show(o) { return new Promise(function (res) { queue.push({ o: o, res: res }); next(); }); }
    function next() {
        if (open || !queue.length) return;
        if (!document.body) { document.addEventListener('DOMContentLoaded', next, { once: true }); return; }
        var job = queue.shift(), o = job.o;
        var t = split(o.msg, o.title);
        var root = mk('div', 'iosdlg-root'); root.setAttribute('role', 'alertdialog'); root.setAttribute('aria-modal', 'true');
        root.setAttribute('data-no-ios-pop', ''); root.setAttribute('data-no-caps', ''); root.setAttribute('data-native-dd', '');
        root.appendChild(mk('div', 'iosdlg-back'));
        var card = mk('div', 'iosdlg-card' + ((t.msg || '').length > 220 ? ' wide' : '')), body = mk('div', 'iosdlg-body');
        if (t.title) body.appendChild(mk('div', 'iosdlg-title', t.title));
        if (t.msg) body.appendChild(mk('div', 'iosdlg-msg' + (t.msg.split('\n').length > 6 ? ' left' : ''), t.msg));
        var input = null;
        if (o.kind === 'prompt') {
            input = mk('input', 'iosdlg-input'); input.type = o.inputType || 'text'; input.value = o.def == null ? '' : String(o.def);
            input.setAttribute('autocomplete', 'off'); if (o.placeholder) input.placeholder = o.placeholder;
            body.appendChild(input);
        }
        card.appendChild(body);
        // buttons: [{label, value, bold, red}] — two side by side, three or more stacked (iOS does the same)
        var btns = o.buttons, row = mk('div', 'iosdlg-btns' + (btns.length > 2 || btns.some(function (b) { return b.label.length > 14; }) ? ' col' : ''));
        var done = function (v) {
            if (!open) return; var st = open; open = null;
            document.removeEventListener('keydown', key, true);
            if (reduce) root.remove(); else { root.classList.remove('in'); root.classList.add('out'); setTimeout(function () { root.remove(); }, 210); }
            try { if (st.prevFocus && st.prevFocus.focus && document.contains(st.prevFocus)) st.prevFocus.focus({ preventScroll: true }); } catch (e) { }
            job.res(v);
            setTimeout(next, reduce ? 0 : 120);
        };
        var els = btns.map(function (b) {
            var el = mk('button', 'iosdlg-btn' + (b.bold ? ' bold' : '') + (b.red ? ' red' : ''), b.label); el.type = 'button';
            el.addEventListener('click', function () { done(o.kind === 'prompt' ? (b.value ? input.value : null) : b.value); });
            row.appendChild(el); return el;
        });
        card.appendChild(row); root.appendChild(card);
        // Enter = the bold (preferred) button, Esc = the cancel one
        var key = function (e) {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); var c = btns.findIndex(function (b) { return b.cancel; }); done(c >= 0 ? (o.kind === 'prompt' ? null : btns[c].value) : (o.kind === 'prompt' ? null : btns[0].value)); }
            else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); var k = btns.findIndex(function (b) { return b.bold; }); els[k >= 0 ? k : els.length - 1].click(); }
            else if (e.key === 'Tab') { e.preventDefault(); var f = [input].concat(els).filter(Boolean), i = f.indexOf(document.activeElement); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus(); }
        };
        open = { root: root, prevFocus: document.activeElement };
        document.addEventListener('keydown', key, true);
        document.body.appendChild(root);
        void root.offsetWidth;
        requestAnimationFrame(function () { root.classList.add('in'); });
        setTimeout(function () { try { (input || els[els.findIndex(function (b, i) { return btns[i].bold; })] || els[els.length - 1]).focus({ preventScroll: true }); if (input) input.select(); } catch (e) { } }, 40);
    }

    /* ── public API (Promise based, for new code) ─────────────────────────── */
    var API = {
        native: NATIVE,
        alert: function (msg, o) { o = o || {}; return show({ kind: 'alert', msg: msg, title: o.title, buttons: [{ label: o.ok || 'OK', value: true, bold: true, cancel: true }] }); },
        confirm: function (msg, o) {
            o = o || {}; var red = o.destructive != null ? !!o.destructive : RED.test(String(msg || ''));
            return show({ kind: 'confirm', msg: msg, title: o.title, buttons: [{ label: o.cancel || 'Cancel', value: false, cancel: true }, { label: o.ok || 'OK', value: true, bold: !red, red: red }] });
        },
        prompt: function (msg, def, o) {
            o = o || {};
            return show({ kind: 'prompt', msg: msg, def: def, title: o.title, placeholder: o.placeholder, inputType: o.type,
                buttons: [{ label: o.cancel || 'Cancel', value: false, cancel: true }, { label: o.ok || 'OK', value: true, bold: true }] });
        },
        // Several answers: buttons [{label, value, red, bold, cancel}] → the chosen value
        choose: function (msg, buttons, o) { o = o || {}; return show({ kind: 'choose', msg: msg, title: o.title, buttons: buttons }); }
    };
    window.IosDialog = API;
    if (CFG.native) return;

    /* ── the user action being handled right now (what a replay repeats) ──── */
    var CUR = null;
    var TYPES = ['click', 'dblclick', 'submit', 'change', 'keydown'];
    function snap(t) {
        if (!t || !t.tagName) return null;
        var tag = t.tagName;
        if (tag === 'INPUT' && (t.type === 'checkbox' || t.type === 'radio')) return { checked: t.checked };
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return { value: t.value };
        return null;
    }
    TYPES.forEach(function (type) {
        document.addEventListener(type, function (e) {
            if (!e.isTrusted && !e.__iosdlg) return;
            if (type === 'keydown' && e.key !== 'Enter') return;   // only Enter starts a save from the keyboard
            var c = { e: e, type: type, target: e.target, snap: snap(e.target), chain: e.__iosdlg || [] };
            CUR = c;
            setTimeout(function () { if (CUR === c) CUR = null; }, 0);
        }, true);
        // the action is over once the event has gone all the way up (a later await is not part of it)
        window.addEventListener(type, function (e) { if (CUR && CUR.e === e) CUR = null; }, false);
    });
    function replay(c, chain) {
        var t = c.target;
        if (!t || !t.isConnected) { API.alert('Please press it again.', { title: 'Not done yet' }); return; }
        var ev;
        if (c.type === 'click' || c.type === 'dblclick') {
            // a checkbox / radio already took the first click: put it back, so the replayed click sets it again
            if (c.snap && 'checked' in c.snap) t.checked = !c.snap.checked;
            ev = new MouseEvent(c.type, { bubbles: true, cancelable: true, view: window, detail: c.type === 'dblclick' ? 2 : 1,
                ctrlKey: c.e.ctrlKey, shiftKey: c.e.shiftKey, altKey: c.e.altKey, metaKey: c.e.metaKey, clientX: c.e.clientX, clientY: c.e.clientY });
        } else if (c.type === 'change') {
            if (c.snap) { if ('checked' in c.snap) t.checked = c.snap.checked; else t.value = c.snap.value; }
            ev = new Event('change', { bubbles: true, cancelable: true });
        } else if (c.type === 'submit') {
            ev = new Event('submit', { bubbles: true, cancelable: true });
        } else {
            ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: c.e.key, code: c.e.code, keyCode: c.e.keyCode,
                ctrlKey: c.e.ctrlKey, shiftKey: c.e.shiftKey, altKey: c.e.altKey, metaKey: c.e.metaKey });
        }
        ev.__iosdlg = chain;
        t.dispatchEvent(ev);
    }
    /* In a replay, the boxes already answered give their answer again (each once, in order). The
       same text first; else the next unused one of that kind (a message that shows the time or a
       count may read slightly differently the second time, the code path is the same). */
    function answered(chain, kind, msg) {
        var i;
        for (i = 0; i < chain.length; i++) if (!chain[i].used && chain[i].kind === kind && chain[i].msg === msg) { chain[i].used = true; return chain[i]; }
        for (i = 0; i < chain.length; i++) if (!chain[i].used && chain[i].kind === kind) { chain[i].used = true; return chain[i]; }
        return null;
    }
    function fresh(chain) { return chain.map(function (x) { return { kind: x.kind, msg: x.msg, value: x.value }; }); }

    window.alert = function (msg) { API.alert(msg == null ? '' : String(msg)); };
    window.confirm = function (msg) {
        msg = msg == null ? '' : String(msg);
        var c = CUR;
        if (c) { var a = answered(c.chain, 'confirm', msg); if (a) return true; }
        if (!c) return NATIVE.confirm(msg);
        CUR = null;   // one box per run: the code now takes its Cancel way and stops
        API.confirm(msg).then(function (ok) { if (ok) replay(c, fresh(c.chain).concat({ kind: 'confirm', msg: msg, value: true })); });
        return false;
    };
    window.prompt = function (msg, def) {
        msg = msg == null ? '' : String(msg);
        var c = CUR;
        if (c) { var a = answered(c.chain, 'prompt', msg); if (a) return a.value; }
        if (!c) return NATIVE.prompt(msg, def);
        CUR = null;
        API.prompt(msg, def).then(function (v) { if (v != null) replay(c, fresh(c.chain).concat({ kind: 'prompt', msg: msg, value: v })); });
        return null;
    };
})();
