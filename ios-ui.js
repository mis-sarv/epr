/* ios-ui.js — the shared behaviour half of the iOS layer (look: ios-ui.css). Optional: a page works without it.
   Loaded on every external app page. Each part is small, independent and can be switched off per page with
       window.IOS_UI = { overlays: false, lazyImages: false, prefetch: false, haptics: false }   (before this script)

     1. lazy images       every http(s) <img> gets loading="lazy" decoding="async" (also those added later); eager again
                          while printing, and never inside [data-no-lazy] (PDF / canvas capture areas)
     2. overlays          a modal / dialog that APPEARS (added by React, or un-hidden by a class) fades in and its box pops
                          in with a spring; on a phone a box stuck to the bottom edge slides up as a sheet
     3. prefetch          a link to another page of the app is fetched the moment a finger / pointer lands on it, so the
                          page opens from cache (instant.page idea); the launcher also warms its apps while idle
     4. haptics           a light tick on elements marked [data-ios-tap] (Android; iOS web has no haptics)
     5. IosUI API         slider(container, activeSelector)      sliding thumb under the active tab
                          pullToRefresh(scrollEl, fn)            pull down at the top = fn()
                          skeleton(el, n)                        shimmering placeholder cards
                          cardsIn(parentEl)                      children fade up one after another (first screen only)
                          idle(fn)                               run when the browser is idle (requestIdleCallback)
                          prefetch(href)                         fetch another page of the app into the cache now
                          lazyList(parentEl, renderFn, items, n) draw a long list n at a time as the end is scrolled to
   Nothing here reads or changes data. */
(function () {
    'use strict';
    var CFG = Object.assign({ overlays: true, lazyImages: true, prefetch: true, haptics: true }, window.IOS_UI || {});
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var idle = function (fn, t) { if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: t || 3000 }); else setTimeout(fn, 400); };

    /* ── 1. lazy images ──────────────────────────────────────────────── */
    function lazyImg(img) {
        if (!img || img.__ios) return; img.__ios = 1;
        var src = img.getAttribute('src') || '';
        if (!/^https?:|^\/|^\.\.?\//.test(src) || img.closest('[data-no-lazy]')) return;   // data:, blob: and capture areas stay as they are
        if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
        if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
    }
    function allImages(root) { if (root.tagName === 'IMG') lazyImg(root); else if (root.querySelectorAll) [].forEach.call(root.querySelectorAll('img'), lazyImg); }
    window.addEventListener('beforeprint', function () { [].forEach.call(document.images, function (i) { if (i.loading === 'lazy') i.loading = 'eager'; }); });

    /* ── 2. overlays that appear ─────────────────────────────────────── */
    var OVERLAY = '.fixed.inset-0, [class*="fixed"][class*="inset-0"], .modal-overlay, .modal-backdrop, [role="dialog"]';
    var shown = new WeakMap();
    function isVisible(el) { return !!(el.getClientRects && el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden'; }
    function popOverlay(ov) {
        if (reduce || ov.closest('[data-no-ios-pop]') || ov.hasAttribute('data-no-ios-pop')) return;
        if (!isVisible(ov)) { shown.set(ov, false); return; }
        if (shown.get(ov)) return;
        shown.set(ov, true);
        // only real overlays: they cover (nearly) the whole viewport
        var r = ov.getBoundingClientRect();
        if (r.width < innerWidth * 0.8 || r.height < innerHeight * 0.8) return;
        var box = null, kids = ov.children;
        for (var i = 0; i < kids.length; i++) { if (kids[i].nodeType === 1 && /DIV|FORM|SECTION|ASIDE/.test(kids[i].tagName) && isVisible(kids[i])) { var b = kids[i].getBoundingClientRect(); if (b.width > 120 && b.height > 60) { box = kids[i]; break; } } }
        ov.classList.remove('ios-overlay-in'); void ov.offsetWidth; ov.classList.add('ios-overlay-in');
        if (box && !/scale-9|opacity-0/.test(box.className || '')) {   // a box that already animates itself (Tailwind scale / opacity classes) is left alone
            var br = box.getBoundingClientRect(), sheet = innerWidth < 768 && br.bottom >= innerHeight - 2 && br.top > innerHeight * 0.12;
            var cls = sheet ? 'ios-sheet-in' : 'ios-pop-in';
            box.classList.remove('ios-sheet-in', 'ios-pop-in'); void box.offsetWidth; box.classList.add(cls);
        }
    }
    function scanOverlays(node) {
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches(OVERLAY)) popOverlay(node);
        if (node.querySelectorAll && node.children.length < 400) [].forEach.call(node.querySelectorAll(OVERLAY), popOverlay);
    }

    /* ── 3. prefetch ─────────────────────────────────────────────────── */
    var fetched = {};
    function prefetch(href) {
        if (!href || fetched[href]) return;
        try {
            var u = new URL(href, location.href);
            if (u.origin !== location.origin || u.href === location.href.split('#')[0] || /\.(zip|apk|pdf|png|jpe?g)$/i.test(u.pathname)) return;
            fetched[href] = 1;
            var l = document.createElement('link'); l.rel = 'prefetch'; l.href = u.href; l.as = 'document';
            document.head.appendChild(l);
        } catch (e) { }
    }
    function initPrefetch() {
        var on = function (e) { var a = e.target.closest && e.target.closest('a[href]'); if (a && !a.target && a.getAttribute('href').charAt(0) !== '#') prefetch(a.href); };
        document.addEventListener('touchstart', on, { passive: true });
        document.addEventListener('mouseover', function (e) { var a = e.target.closest && e.target.closest('a[href]'); if (a) { clearTimeout(a.__pf); a.__pf = setTimeout(function () { on(e); }, 120); } }, { passive: true });
    }

    /* ── 4. haptics ──────────────────────────────────────────────────── */
    function initHaptics() {
        if (!navigator.vibrate) return;
        document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-ios-tap]')) navigator.vibrate(6); }, { passive: true });
    }

    /* ── API ─────────────────────────────────────────────────────────── */
    var API = {
        idle: idle,
        prefetch: prefetch,
        // a sliding thumb under the active tab of a row of tabs (the container must be position: relative)
        slider: function (container, activeSel, opts) {
            if (!container || container.__iosSlider) return container && container.__iosSlider; opts = opts || {};
            var thumb = document.createElement('span'); thumb.className = 'ios-thumb' + (opts.cls ? ' ' + opts.cls : '');
            if (opts.style) thumb.style.cssText += opts.style;
            if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
            container.insertBefore(thumb, container.firstChild);
            var raf = 0, first = true;
            function place() {
                raf = 0; var a = container.querySelector(activeSel);
                if (!a || !a.offsetWidth) { thumb.classList.remove('on'); return; }
                if (first) thumb.style.transition = 'none';
                thumb.style.width = a.offsetWidth + 'px'; thumb.style.height = a.offsetHeight + 'px';
                thumb.style.top = a.offsetTop + 'px'; thumb.style.transform = 'translateX(' + a.offsetLeft + 'px)';
                thumb.classList.add('on');
                if (first) { void thumb.offsetWidth; thumb.style.transition = ''; first = false; }
                if (container.scrollWidth > container.clientWidth + 2 && a.scrollIntoView) a.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
            }
            var schedule = function () { if (!raf) raf = requestAnimationFrame(place); };
            new MutationObserver(function (m) { if (m.every(function (r) { return r.type === 'childList' && [].concat([].slice.call(r.addedNodes), [].slice.call(r.removedNodes)).every(function (n) { return n === thumb; }); })) return; if (!thumb.parentNode) container.insertBefore(thumb, container.firstChild); schedule(); })
                .observe(container, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true });
            if (window.ResizeObserver) new ResizeObserver(schedule).observe(container);
            window.addEventListener('resize', schedule); window.addEventListener('load', schedule);
            schedule(); container.__iosSlider = { place: schedule }; return container.__iosSlider;
        },
        // pull down at the top of a scrolling element = fn(); fn may return a promise
        pullToRefresh: function (el, fn) {
            if (!el || !('ontouchstart' in window) || el.__iosPtr) return; el.__iosPtr = 1;
            var host = el.parentNode; if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
            var ptr = document.createElement('div'); ptr.className = 'ios-ptr'; ptr.innerHTML = '<span class="ios-spin"></span><span>Pull to refresh</span>'; host.insertBefore(ptr, el);
            var y0 = null, busy = false, txt = ptr.lastChild;
            var setH = function (h) { ptr.style.top = el.offsetTop + 'px'; ptr.style.height = h + 'px'; };
            el.addEventListener('touchstart', function (e) { y0 = (el.scrollTop <= 0 && !busy && e.touches.length === 1) ? e.touches[0].clientY : null; }, { passive: true });
            el.addEventListener('touchmove', function (e) {
                if (y0 === null) return; var dy = (e.touches[0].clientY - y0) * 0.5;
                if (dy <= 0 || el.scrollTop > 0) { setH(0); return; }
                if (e.cancelable) e.preventDefault(); setH(Math.min(dy, 70)); txt.textContent = dy >= 56 ? 'Release to refresh' : 'Pull to refresh';
            }, { passive: false });
            el.addEventListener('touchend', function () {
                if (y0 === null) return; var h = ptr.offsetHeight; y0 = null; ptr.style.transition = 'height .3s cubic-bezier(.32,.72,0,1)';
                if (h >= 52) { busy = true; ptr.classList.add('go'); setH(46); txt.textContent = 'Refreshing...';
                    Promise.resolve().then(fn).catch(function () { }).then(function () { setTimeout(function () { setH(0); ptr.classList.remove('go'); busy = false; }, 350); }); }
                else setH(0);
                setTimeout(function () { ptr.style.transition = ''; }, 320);
            }, { passive: true });
        },
        skeleton: function (el, n) { var h = ''; for (var i = 0; i < (n || 4); i++) h += '<div class="ios-skel"><i></i><i></i><i></i></div>'; el.innerHTML = h; },
        // children rise one after another (only the first ~12; the rest are drawn lazily by the browser)
        cardsIn: function (parent, max) {
            if (reduce || !parent) return; var kids = parent.children, n = Math.min(kids.length, max || 12);
            for (var i = 0; i < n; i++) { kids[i].style.setProperty('--ios-d', Math.min(i, 8) * 30 + 'ms'); kids[i].classList.add('ios-rise-in'); }
        },
        // draw a long list n at a time: the next batch when the end marker comes near the screen
        lazyList: function (parent, renderFn, items, n, root) {
            n = n || 30; var i = 0, mark = document.createElement('div'); mark.style.cssText = 'height:1px;grid-column:1/-1';
            function more() { var end = Math.min(items.length, i + n), html = ''; for (; i < end; i++) html += renderFn(items[i], i); mark.insertAdjacentHTML('beforebegin', html); if (i >= items.length) { io && io.disconnect(); mark.remove(); } }
            var io = window.IntersectionObserver ? new IntersectionObserver(function (es) { if (es[0].isIntersecting) more(); }, { root: root || null, rootMargin: '0px 0px 500px 0px' }) : null;
            parent.appendChild(mark); more(); if (io && i < items.length) io.observe(mark); else while (i < items.length) more();
        }
    };
    window.IosUI = API;

    function init() {
        try {
            if (CFG.lazyImages) {
                allImages(document.documentElement);
                new MutationObserver(function (ms) { ms.forEach(function (m) { [].forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) allImages(n); }); }); })
                    .observe(document.documentElement, { childList: true, subtree: true });
            }
            if (CFG.overlays && !reduce) {
                new MutationObserver(function (ms) {
                    ms.forEach(function (m) {
                        if (m.type === 'childList') [].forEach.call(m.addedNodes, scanOverlays);
                        else if (m.type === 'attributes' && m.target.nodeType === 1 && m.target.matches && m.target.matches(OVERLAY)) popOverlay(m.target);
                    });
                }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
            }
            if (CFG.prefetch) initPrefetch();
            if (CFG.haptics) initHaptics();
        } catch (e) { console.warn('[ios-ui] skipped:', e); }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
