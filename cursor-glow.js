/* cursor-glow.js — soft yellow spotlight that follows the mouse, on every app.
 *
 * One small self-contained file, loaded LAST on each page (just before
 * </body>, after app-back.js in index.html). It declares no globals except the
 * SARV_CURSOR_GLOW switch, so it can't clash with the classic scripts that
 * share the ERP's global scope, and loading it last leaves their order alone.
 *
 * How it behaves:
 *   - one fixed <div> with a radial gradient, moved with transform inside
 *     requestAnimationFrame (no layout work per mouse move);
 *   - pointer-events:none, so it never takes a click, hover or text selection;
 *   - mouse / pen only: on phones and tablets (no hover, coarse pointer) it
 *     does nothing, so mobile.html / unloader.html stay as they are;
 *   - hidden while the mouse is over an iframe (the ERP's Order Form, Lot Card,
 *     FMS... pages draw their own glow inside the frame) or outside the window;
 *   - never printed, and html2pdf / html2canvas skip it
 *     (data-html2canvas-ignore), so no PDF picks up a yellow blob.
 *
 * Switch off for one browser: localStorage.setItem('sarv_cursor_glow','off')
 * (back on: removeItem). A page can opt out with window.SARV_CURSOR_GLOW=false
 * set before this file loads. */
(function () {
  'use strict';
  if (window.SARV_CURSOR_GLOW === false) return;
  try { if (localStorage.getItem('sarv_cursor_glow') === 'off') return; } catch (e) {}
  // Mouse / pen devices only; a finger has no cursor to follow.
  if (window.matchMedia && !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (document.getElementById('sarvCursorGlow')) return;   // loaded twice on one page

  /* A small spotlight with a clear edge: the yellow fill fades out from the
     centre, and a thin dark-yellow ring (#B8860B, dark goldenrod) marks the
     circumference so the circle reads crisply on white and on dark headers
     alike. The ring is an inner border (box-sizing) so SIZE stays the real
     outer diameter and the centre stays exactly on the cursor tip. */
  var SIZE = 84;    // px, outer diameter of the spotlight (ring included)
  var RING = 2;     // px, ring width

  var css = document.createElement('style');
  css.textContent =
    '#sarvCursorGlow{position:fixed;left:0;top:0;width:' + SIZE + 'px;height:' + SIZE + 'px;box-sizing:border-box;' +
      'margin:-' + (SIZE / 2) + 'px 0 0 -' + (SIZE / 2) + 'px;border-radius:50%;pointer-events:none;' +
      'z-index:2147483000;opacity:0;will-change:transform;' +
      'border:' + RING + 'px solid rgba(184,134,11,.9);' +
      // a hairline of soft shadow either side of the ring keeps it legible on any background
      'box-shadow:0 0 0 1px rgba(255,255,255,.35),0 0 6px rgba(184,134,11,.35),inset 0 0 6px rgba(184,134,11,.25);' +
      'background:radial-gradient(circle,rgba(255,221,0,.30) 0%,rgba(255,210,0,.18) 45%,rgba(255,200,0,.08) 75%,rgba(255,200,0,.02) 100%);' +
      'transition:opacity .2s ease}' +
    '#sarvCursorGlow.on{opacity:1}' +
    // pressed: the ring tightens a little, a quiet click feedback
    '#sarvCursorGlow.down{border-color:rgba(161,98,7,1);background:radial-gradient(circle,rgba(255,214,0,.40) 0%,rgba(255,200,0,.20) 60%,rgba(255,200,0,.04) 100%)}' +
    '@media print{#sarvCursorGlow{display:none!important}}';

  var glow = document.createElement('div');
  glow.id = 'sarvCursorGlow';
  glow.setAttribute('aria-hidden', 'true');
  glow.setAttribute('data-html2canvas-ignore', 'true');

  var x = 0, y = 0, scale = 1, queued = false;
  function paint() {
    queued = false;
    glow.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) scale(' + scale + ')';
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(paint); } }
  function show(on) { glow.classList.toggle('on', on); }

  function mount() {
    (document.head || document.documentElement).appendChild(css);
    document.body.appendChild(glow);

    document.addEventListener('mousemove', function (e) {
      x = e.clientX; y = e.clientY;
      // Over an iframe the frame's own page shows the glow; this one would
      // otherwise sit frozen at the frame's edge.
      show(!(e.target && e.target.tagName === 'IFRAME'));
      queue();
    }, { passive: true });
    // Press feedback: the circle tightens to 85% and darkens while a button is held.
    document.addEventListener('mousedown', function () { scale = 0.85; glow.classList.add('down'); queue(); }, { passive: true });
    document.addEventListener('mouseup', function () { scale = 1; glow.classList.remove('down'); queue(); }, { passive: true });
    document.addEventListener('mouseout', function (e) {
      var to = e.relatedTarget;
      if (!to || to.tagName === 'IFRAME') show(false);   // left the window, or into a frame
    }, { passive: true });
    window.addEventListener('blur', function () { show(false); });
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
