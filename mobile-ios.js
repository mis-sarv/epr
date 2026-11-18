/* mobile-ios.js — the behaviour half of the iOS layer of mobile.html (the look is mobile-ios.css).
   It only ENHANCES what mobile-core.js draws: it never changes the data or the flow, so if this file
   fails to load the app still works, just without the motion.

     1. icons             inline SVG line icons on the stage tabs and header buttons (no emoji, no icon font to download)
     2. sliding pill      a thumb that slides under the active stage tab and sub-tab (spring easing)
     3. sheets            every .modal-overlay springs in AND out (mobile-core sets style.display; the close is
                          delayed 240 ms so the animation can play), swipe the sheet down by its top to close
     4. pull to refresh   pull the list down at the top = the "Live" refresh button
     5. list entrance     cards fade up when a tab / section changes, not on every live refresh; the browser skips
                          drawing off-screen cards (content-visibility in the CSS), so long lists scroll fast
     6. lazy PDF libraries jsPDF + autotable + pdf-lib (~0.9 MB) are no longer loaded before the first screen:
                          they load a moment after it, or at once when a PDF is first needed (mobLoadPdfLibs)
     7. haptics           a light tick on tab taps where the device allows it
     8. lazy data         skeleton while loading; the next chunk of the open tab loads when the list end is near
   Devices: phone / tablet / desktop are handled by the CSS media queries; here only the sliders are re-placed
   on resize / rotation, and the swipe-to-close is phone-only (tablet and desktop get centred dialogs). */
(function () {
    'use strict';
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
    var isPhone = function () { return window.innerWidth < 768; };

    /* ── 1. icons (24x24, stroke = currentColor) ───────────────────────── */
    var P = {
        VI:       '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V4h9l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
        POGEN:    '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M13 11v6M10 14h6"/>',
        OPENPO:   '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7"/>',
        MD:       '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
        SENT:     '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
        STORE:    '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
        RECV:     '<path d="M3 13l3-8h12l3 8"/><path d="M3 13v6h18v-6M3 13h5l1 2h6l1-2h5"/>',
        FOLLOWUP: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
        search:   '<circle cx="11" cy="11" r="6.5"/><path d="M21 21l-4.6-4.6"/>',
        plus:     '<path d="M12 5v14M5 12h14"/>',
        user:     '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'
    };
    var svg = function (k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + P[k] + '</svg>'; };
    var ico = function (k) { return '<span class="ios-ico">' + svg(k) + '</span>'; };

    function injectIcons() {
        $$('.stage-tab[data-tab]').forEach(function (t) {
            var e = $('.st-ico', t), k = t.getAttribute('data-tab');
            if (e && P[k] && !e.firstChild) e.innerHTML = svg(k);
        });
        [['#searchToggle', 'search'], ['#newPrBtn', 'plus'], ['#roleBadge', 'user']].forEach(function (x) {
            var el = $(x[0]);
            if (el && !el.querySelector('.ios-ico')) el.insertAdjacentHTML('afterbegin', ico(x[1]));
        });
    }

    /* ── 2. sliding pill / thumb ───────────────────────────────────────── */
    function Slider(container, activeSel, cls) {
        var el = null, raf = 0, first = true;
        function ensure() {
            if (!el || el.parentNode !== container) {
                el = document.createElement('span'); el.className = cls; el.setAttribute('aria-hidden', 'true');
                container.insertBefore(el, container.firstChild);
            }
            return el;
        }
        function place() {
            raf = 0;
            var a = container.querySelector(activeSel), p = ensure();
            if (!a || !a.offsetWidth) { p.classList.remove('on'); return; }
            if (first) { p.style.transition = 'none'; }
            p.style.width = a.offsetWidth + 'px';
            p.style.transform = 'translateX(' + a.offsetLeft + 'px)';
            p.classList.add('on');
            if (first) { void p.offsetWidth; p.style.transition = ''; first = false; }
            if (container.scrollWidth > container.clientWidth + 2 && a.scrollIntoView)
                a.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
        }
        function schedule() { if (!raf) raf = requestAnimationFrame(place); }
        new MutationObserver(function (m) {
            // our own pill being inserted must not trigger another placement
            if (m.every(function (r) { return r.type === 'childList' && [].concat([].slice.call(r.addedNodes), [].slice.call(r.removedNodes)).every(function (n) { return n === el; }); })) return;
            schedule();
        }).observe(container, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true });
        if (window.ResizeObserver) new ResizeObserver(schedule).observe(container);
        window.addEventListener('resize', schedule); window.addEventListener('orientationchange', schedule);
        window.addEventListener('load', schedule);
        schedule();
        return { place: schedule };
    }
    function initSliders() {
        var st = $('#stageTabs'); if (st) Slider(st, '.stage-tab.active', 'ios-pill');
        ['#viewSeg', '#storeTypeSeg'].forEach(function (s) { var c = $(s); if (c) Slider(c, 'button.active', 'ios-thumb'); });
    }

    /* ── 3. sheets: spring in (CSS), spring out (here), swipe down to close ── */
    var dispDesc = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'display');
    var CLOSE_MS = 240;
    function wrapOverlay(ov) {
        if (ov.__ios || !dispDesc || !dispDesc.set) return;
        ov.__ios = true;
        var logical = ov.style.display, timer = 0;
        Object.defineProperty(ov.style, 'display', {
            configurable: true,
            get: function () { return logical; },
            set: function (v) {
                logical = v;
                if (timer) { clearTimeout(timer); timer = 0; }
                ov.classList.remove('ios-closing');
                var real = dispDesc.get.call(ov.style);
                if (v === 'none' && real && real !== 'none' && !reduce) {
                    ov.classList.add('ios-closing');
                    timer = setTimeout(function () { timer = 0; ov.classList.remove('ios-closing'); dispDesc.set.call(ov.style, 'none'); }, CLOSE_MS);
                    return;
                }
                if (v !== 'none') { var c = ov.querySelector('.modal-content'); if (c) { c.style.animation = ''; c.style.transform = ''; c.style.removeProperty('--ios-dy'); } }
                dispDesc.set.call(ov.style, v);
            }
        });
    }
    function initSheets() {
        $$('.modal-overlay').forEach(wrapOverlay);
        // tapping the dimmed area outside a dialog closes it (tablet / desktop); a sheet on a phone keeps its own X
        document.addEventListener('mousedown', function (e) {
            var ov = e.target.classList && e.target.classList.contains('modal-overlay') ? e.target : null;
            if (!ov || isPhone() || ov.id === 'loginScreen') return;
            var b = $('.close-btn', ov); if (b) b.click();
        });

        var drag = null;
        document.addEventListener('touchstart', function (e) {
            if (!isPhone() || e.touches.length !== 1) return;
            var c = e.target.closest && e.target.closest('.modal-content'); if (!c || !$('.close-btn', c)) return;
            var onTitle = e.target.closest('.modal-title'), r = c.getBoundingClientRect();
            if (!onTitle && e.touches[0].clientY - r.top > 28) return;   // only the title row or the grabber
            drag = { c: c, y: e.touches[0].clientY, t: Date.now(), dy: 0 };
            c.style.animation = 'none'; c.style.transition = 'none';
        }, { passive: true });
        document.addEventListener('touchmove', function (e) {
            if (!drag) return;
            drag.dy = Math.max(0, e.touches[0].clientY - drag.y);
            drag.c.style.transform = 'translateY(' + drag.dy + 'px)';
        }, { passive: true });
        function endDrag() {
            if (!drag) return;
            var d = drag, v = d.dy / Math.max(1, Date.now() - d.t); drag = null;
            if (d.dy > 120 || (d.dy > 40 && v > 0.5)) {
                d.c.style.transition = ''; d.c.style.setProperty('--ios-dy', d.dy + 'px'); d.c.style.transform = ''; d.c.style.animation = '';
                var b = $('.close-btn', d.c); if (b) b.click();
            } else {
                d.c.style.transition = 'transform 0.38s cubic-bezier(0.32,0.72,0,1)'; d.c.style.transform = 'translateY(0)';
                setTimeout(function () { d.c.style.transition = ''; }, 400);
            }
        }
        document.addEventListener('touchend', endDrag, { passive: true });
        document.addEventListener('touchcancel', endDrag, { passive: true });
    }

    /* ── 4. pull to refresh ───────────────────────────────────────────── */
    function initPullToRefresh() {
        var list = $('#list'); if (!list || !('ontouchstart' in window)) return;
        var ptr = document.createElement('div'); ptr.className = 'ios-ptr'; ptr.innerHTML = '<span class="ios-spin"></span><span class="ios-ptr-t">Pull to refresh</span>';
        list.parentNode.insertBefore(ptr, list);
        var st = null, busy = false;
        function setH(h) { ptr.style.top = list.offsetTop + 'px'; ptr.style.height = h + 'px'; }
        list.addEventListener('touchstart', function (e) { st = (list.scrollTop <= 0 && !busy && e.touches.length === 1) ? e.touches[0].clientY : null; }, { passive: true });
        list.addEventListener('touchmove', function (e) {
            if (st === null) return;
            var dy = (e.touches[0].clientY - st) * 0.5;
            if (dy <= 0 || list.scrollTop > 0) { setH(0); return; }
            if (e.cancelable) e.preventDefault();
            setH(Math.min(dy, 70));
            $('.ios-ptr-t', ptr).textContent = dy >= 56 ? 'Release to refresh' : 'Pull to refresh';
        }, { passive: false });
        list.addEventListener('touchend', function () {
            if (st === null) return;
            var h = ptr.offsetHeight; st = null;
            ptr.style.transition = 'height 0.3s cubic-bezier(0.32,0.72,0,1)';
            if (h >= 52) {
                busy = true; ptr.classList.add('go'); setH(48); $('.ios-ptr-t', ptr).textContent = 'Refreshing...';
                var b = $('#liveStatus'); if (b) b.click();
                setTimeout(function () { setH(0); ptr.classList.remove('go'); busy = false; }, 1100);
            } else setH(0);
            setTimeout(function () { ptr.style.transition = ''; }, 320);
        }, { passive: true });
    }

    /* ── 5. list entrance (only when the tab / section changed) ────────── */
    function initListMotion() {
        var list = $('#list'); if (!list || !window.IntersectionObserver || reduce) return;
        var lastKey = null, io = new IntersectionObserver(function (es) {
            es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('ios-in'); io.unobserve(e.target); } });
        }, { root: list, rootMargin: '0px 0px 80px 0px' });
        function key() {
            var t = $('#stageTabs .stage-tab.active'), v = $('#viewSeg button.active'), s = $('#storeTypeSeg button.active');
            return [t && t.getAttribute('data-tab'), v && v.textContent, s && s.textContent].join('|');
        }
        new MutationObserver(function (muts) {
            var cards = [];
            muts.forEach(function (m) { [].forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1 && n.classList.contains('card')) cards.push(n); }); });
            if (!cards.length) return;
            var k = key(), animate = k !== lastKey; lastKey = k;
            if (!animate) return;   // a live refresh repaints the same list: no replay
            cards.forEach(function (c, i) {
                if (i >= 14) return;   // the long tail needs no entrance: it is drawn lazily by the browser
                c.classList.add('ios-pre'); c.style.setProperty('--ios-d', Math.min(i, 8) * 30 + 'ms');
                io.observe(c);
            });
        }).observe(list, { childList: true });
    }

    /* ── 6. lazy PDF libraries ────────────────────────────────────────── */
    var LIBS = [
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'
    ];
    var libP = null;
    function loadScript(src) {
        return new Promise(function (res, rej) {
            var s = document.createElement('script'); s.src = src; s.async = false;
            s.onload = res; s.onerror = function () { rej(new Error('Could not load ' + src + ' (check the internet connection)')); };
            document.head.appendChild(s);
        });
    }
    window.mobLoadPdfLibs = function () {
        if (window.jspdf && window.jspdf.jsPDF && window.PDFLib) return Promise.resolve();
        if (!libP) libP = Promise.all([loadScript(LIBS[0]).then(function () { return loadScript(LIBS[1]); }), loadScript(LIBS[2])])
            .then(function () { }, function (e) { libP = null; throw e; });
        return libP;
    };
    function prefetchLibs() {
        var c = navigator.connection;
        if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;   // spare a slow / metered connection: load on first use
        var go = function () { window.mobLoadPdfLibs().catch(function () { }); };
        if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 6000 }); else setTimeout(go, 3000);
    }

    /* ── 7. haptics ───────────────────────────────────────────────────── */
    function initHaptics() {
        if (!navigator.vibrate) return;
        document.addEventListener('click', function (e) {
            if (e.target.closest && e.target.closest('.stage-tab, .seg button')) navigator.vibrate(6);
        }, { passive: true });
    }


    /* ── 8. lazy data: skeleton on the first load, more rows when the bottom is reached ──────────
       mobile-core.js reads the lists a chunk at a time (window.mobData). Here: a shimmering skeleton
       replaces the plain "Loading..." text, and a sentinel at the end of the list asks for the next
       chunk of the open tab as soon as it comes near the screen (IntersectionObserver, 400px early,
       so the rows are there before the thumb reaches them). It re-appears after every repaint while
       older rows exist, so a short list keeps filling until the screen is full or nothing is left. */
    function initLazyMore() {
        var list = $('#list'); if (!list) return;
        var sent = null, io = null, loading = false;
        function mk() {
            sent = document.createElement('div'); sent.className = 'ios-more'; sent.setAttribute('aria-hidden', 'true');
            sent.innerHTML = '<span class="ios-spin"></span><span>Loading more...</span>';
            return sent;
        }
        function ensure() {
            var md = window.mobData; if (!md) return;
            var has = md.hasMore();
            if (!has) { if (sent && sent.parentNode) sent.parentNode.removeChild(sent); if (io) io.disconnect(); return; }
            if (!sent) mk();
            if (list.lastElementChild !== sent) {
                list.appendChild(sent);
                if (io) { io.disconnect(); io.observe(sent); }
            }
            sent.classList.toggle('busy', loading);
        }
        if (window.IntersectionObserver) {
            io = new IntersectionObserver(function (es) {
                es.forEach(function (e) {
                    if (!e.isIntersecting || loading || !window.mobData || !window.mobData.hasMore()) return;
                    loading = true; ensure();
                    Promise.resolve(window.mobData.loadMore()).catch(function () { }).then(function () { loading = false; ensure(); });
                });
            }, { root: list, rootMargin: '0px 0px 400px 0px' });
        }
        // skeleton while the first load runs
        function skeleton() {
            var only = list.children.length === 1 && list.firstElementChild;
            if (only && only.classList.contains('empty-msg') && /^Loading/i.test(only.textContent || '')) {
                var h = ''; for (var i = 0; i < 5; i++) h += '<div class="ios-skel"><i></i><i></i><i></i></div>';
                list.innerHTML = h; return true;
            }
            return false;
        }
        new MutationObserver(function () { if (!skeleton()) ensure(); }).observe(list, { childList: true });
        window.addEventListener('mob:data', function (e) { loading = !!(e.detail && e.detail.loading); ensure(); });
    }

    function init() {
        try { injectIcons(); initSliders(); initSheets(); initPullToRefresh(); initListMotion(); initLazyMore(); initHaptics(); }
        catch (e) { console.warn('[mobile-ios] enhancement skipped:', e); }
        window.addEventListener('load', function () { setTimeout(prefetchLibs, 2500); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
