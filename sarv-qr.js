/* ════════════════════════════════════════════════════════════════════
   sarv-qr.js — one QR code for every printed document the gate scans
   ────────────────────────────────────────────────────────────────────
   Printed (40 mm x 40 mm):
     - packing.html  Packing Slip, Original + Duplicate Copy, under Prepared By
     - store-core.js Inward / Inward NB Supplier Copy and Outward Receiver
                     Copy (Store 1 and Store 2), top-left corner
   Read by gate_2.html › Scan QR, which opens the matching gate step with the
   data filled in (gateScan* there).

   What a code holds: "SARV:" + a short JSON object (SarvQR.encode):
     t    PKS = packing slip, IN = store inward (also NB), OUT = store outward
     no   the document number (slip no / inward no / outward no)
     st   STORE 1 / STORE 2      et  entry type (INWARD NB ...)
     p    party / supplier       d   date YYYY-MM-DD
     veh  vehicle (tempo no)     inv invoice no   po / pr  references
     it   first item (+ n more)  q   total qty    wt  total weight   pk packs
   Keep it short: every key is printed into the code. A gate pass QR of
   gate_2.html itself is "ID|CATEGORY|VEHICLE|STATUS" and is read by parse too.

   The encoder (qrcode-generator) and the decoder (jsQR, only where the
   phone has no BarcodeDetector) come from a CDN on first use: ready() /
   decoderReady() load them and say whether they are there. A page that
   cannot load them simply prints no QR (the document is not held up).
   Plain classic script, no dependencies; window.SarvQR only.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.SarvQR) return;

  var GEN_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
  var DEC_SRC = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
  var PREFIX = 'SARV:';
  var loading = {};

  var failedAt = {};
  function load(src, test) {
    if (test()) return Promise.resolve(true);
    if (loading[src]) return loading[src];
    // offline, or it failed a minute ago: answer at once, so a PDF is never held up again and again
    if (navigator.onLine === false || (failedAt[src] && Date.now() - failedAt[src] < 60000)) return Promise.resolve(false);
    loading[src] = new Promise(function (res) {
      var done = false, fin = function () { if (done) return; done = true; if (!test()) { delete loading[src]; failedAt[src] = Date.now(); } res(test()); };
      var s = document.createElement('script');
      s.src = src; s.async = true; s.onload = fin; s.onerror = fin;
      (document.head || document.documentElement).appendChild(s);
      setTimeout(fin, 12000);   // a CDN that never answers must not hold a PDF up
    });
    return loading[src];
  }
  var hasGen = function () { return typeof window.qrcode === 'function'; };
  var hasDec = function () { return typeof window.jsQR === 'function'; };

  // The module grid of a text (error correction M: still reads with a crease or a stamp on it), or null
  function matrix(text) {
    if (!hasGen() || !text) return null;
    try {
      if (window.qrcode.stringToBytesFuncs && window.qrcode.stringToBytesFuncs['UTF-8']) window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
      var q = window.qrcode(0, 'M');
      q.addData(String(text));
      q.make();
      var n = q.getModuleCount();
      return { n: n, dark: function (r, c) { return q.isDark(r, c); } };
    } catch (e) { return null; }
  }

  /* Into a jsPDF page as vector squares (sharp at any zoom / print). size = the whole square
     in the doc's unit, white quiet zone of 2 modules inside it. Dark runs of one row are one rect. */
  function drawPdf(doc, text, x, y, size) {
    var m = matrix(text); if (!m || !doc) return false;
    var q = 2, cell = size / (m.n + q * 2);
    doc.setFillColor(255, 255, 255); doc.rect(x, y, size, size, 'F');
    doc.setFillColor(0, 0, 0);
    for (var r = 0; r < m.n; r++) {
      var c = 0;
      while (c < m.n) {
        if (!m.dark(r, c)) { c++; continue; }
        var c0 = c; while (c < m.n && m.dark(r, c)) c++;
        // a hair wider / taller, so no white seam shows between neighbouring squares
        doc.rect(x + (c0 + q) * cell, y + (r + q) * cell, (c - c0) * cell + 0.02, cell + 0.02, 'F');
      }
    }
    return true;
  }

  // A PNG data URL (for an HTML page turned into a PDF), px = side in pixels
  function dataUrl(text, px) {
    var m = matrix(text); if (!m) return '';
    var q = 2, side = Math.max(64, px || 480), cell = side / (m.n + q * 2);
    var cv = document.createElement('canvas'); cv.width = cv.height = side;
    var g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, side, side); g.fillStyle = '#000';
    for (var r = 0; r < m.n; r++) for (var c = 0; c < m.n; c++) {
      if (m.dark(r, c)) g.fillRect(Math.floor((c + q) * cell), Math.floor((r + q) * cell), Math.ceil(cell), Math.ceil(cell));
    }
    try { return cv.toDataURL('image/png'); } catch (e) { return ''; }
  }

  // Short JSON: empty values left out, long texts cut, '|' never needed
  function encode(obj) {
    var o = {};
    Object.keys(obj || {}).forEach(function (k) {
      var v = obj[k];
      if (v == null || v === '' || v === '-') return;
      if (typeof v === 'number') { if (isFinite(v)) o[k] = Math.round(v * 1000) / 1000; return; }
      v = String(v).replace(/\s+/g, ' ').trim();
      if (v) o[k] = v.length > 70 ? v.slice(0, 70) : v;
    });
    o.v = 1;
    return PREFIX + JSON.stringify(o);
  }

  /* Any scanned text -> what it is:
       {t:'PKS'|'IN'|'OUT', no, ...}  a SARV document code
       {t:'GATE', id, cat, veh, status} a Gate-2 pass (its own QR)
       {t:'TEXT', text}               anything else (typed numbers too) */
  function parse(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    if (s.indexOf(PREFIX) === 0) {
      try { var o = JSON.parse(s.slice(PREFIX.length)); if (o && o.t) return o; } catch (e) { }
    }
    var p = s.split('|');
    if (p.length >= 4 && /^[A-Z]{2,4}-[A-Z0-9-]+$/i.test(p[0].trim())) return { t: 'GATE', id: p[0].trim(), cat: p[1].trim(), veh: p[2].trim(), status: p[3].trim() };
    return { t: 'TEXT', text: s };
  }

  // One video frame / picture -> text or '' (BarcodeDetector where the phone has it, else jsQR)
  var BD = null;
  function detector() {
    if (BD !== null) return BD;
    try { BD = ('BarcodeDetector' in window) ? new window.BarcodeDetector({ formats: ['qr_code'] }) : false; } catch (e) { BD = false; }
    return BD;
  }
  async function decode(source, canvas) {
    var bd = detector();
    if (bd) {
      try { var r = await bd.detect(source); if (r && r.length && r[0].rawValue) return r[0].rawValue; return ''; }
      catch (e) { BD = false; }   // some WebViews list it but cannot run it: jsQR from now on
    }
    if (!hasDec()) return '';
    var w = source.videoWidth || source.naturalWidth || source.width, h = source.videoHeight || source.naturalHeight || source.height;
    if (!w || !h) return '';
    var k = Math.min(1, 900 / Math.max(w, h));   // a smaller frame decodes much faster and still reads a 40 mm code
    var cv = canvas || document.createElement('canvas');
    cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    var g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(source, 0, 0, cv.width, cv.height);
    var img = g.getImageData(0, 0, cv.width, cv.height);
    var res = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    return res && res.data ? res.data : '';
  }

  window.SarvQR = {
    PREFIX: PREFIX,
    ready: function () { return load(GEN_SRC, hasGen); },
    // jsQR is always fetched too: a BarcodeDetector that fails on its first frame falls back to it
    decoderReady: function () { var p = load(DEC_SRC, hasDec); return detector() ? Promise.resolve(true) : p; },
    matrix: matrix, drawPdf: drawPdf, dataUrl: dataUrl, encode: encode, parse: parse, decode: decode
  };
})();
