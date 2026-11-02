/* catalog-presets.js — Starter Templates for Catalog Maker (catalog_maker.html).

   Twenty ready-made catalogs, one per collection idea (Royal, Cozy, Nature,
   Modern). Each is a normal catalog: a cover, three product pages, the photo
   album and the back cover, with its own colours, fonts, texts and SAMPLE
   pictures. Open one from "Starter Templates", change anything, and save it as
   usual; or press "Save all 20 to Server" once to create every one of them as
   an ordinary server template that anyone with the right can edit later.

   The sample pictures are not files: each is painted here on a canvas
   (damask, velvet, plaid, florals, leaves, mandala …) in the collection's own
   colours and turned into a JPEG data URL, the same kind of picture an upload
   makes. So the PDF export works as with any uploaded photo, and replacing a
   sample with a real photo is the normal "Replace Picture" on that page.

   Loaded after catalog_maker.html's own script: it uses that page's globals
   (defaultPages, ALBUM_DEFAULT, BACK_DEFAULT, ensureAlbum, rpc, cloud, …) only
   when a button is pressed, never while loading. */
(function () {
    'use strict';

    // Fonts must be values offered by the page's Global Font Style dropdowns.
    const F = {
        cinzel: "'Cinzel', serif", play: "'Playfair Display', serif",
        mont: "'Montserrat', sans-serif", pop: "'Poppins', sans-serif", inter: "'Inter', sans-serif"
    };

    /* One row per collection. c = colours: bg / accent / text / boxBg / boxText
       for the product pages and album, cover box colours, the three wave
       colours (cover and back cover), and dark presets' own back cover colours.
       art = sample picture style + its three colours. tex = optional faint
       texture on the product pages. */
    const PRESETS = [
        // ── Luxury & Premium (Royal Vibe) ─────────────────────────────────
        { key: 'royal-loom', group: 'Luxury & Premium', name: 'The Royal Loom', hindi: 'द रॉयल लूम', use: 'Regal, premium collection',
          sub: 'A regal collection woven for grand homes: rich colours, royal motifs and lasting warmth.',
          font: [F.cinzel, F.inter], spec: ['Double Bed', 'Double Ply', '5.0 KG'],
          c: { bg: '#fbf7ef', accent: '#5b1a18', text: '#6b4f3a', boxBg: '#fffaf0', boxText: '#5b1a18', coverBox: '#5b1a18', coverBoxText: '#f3d9a4', waves: ['#f1e4c8', '#c9a96e', '#5b1a18'] },
          art: ['damask', ['#6d1f1c', '#c9a96e', '#3d0f0e']], tex: ['damask', ['#fbf7ef', '#e8d9b5', '#d9c49a']],
          designs: [['MAHARAJA', 'MAROON', 'Deep maroon with a gold damask weave, made for a palace bedroom.'],
                    ['RANI', 'GOLD', 'Royal gold motifs on a warm base, rich and soft to the touch.'],
                    ['SHAHI', 'CRIMSON', 'Crimson and gold in a classic court pattern, heavy and warm.']] },
        { key: 'velvet-whispers', group: 'Luxury & Premium', name: 'Velvet Whispers', hindi: 'वेलवेट विस्पर्स', use: 'Velvety, ultra-soft blankets',
          sub: 'Velvet-soft blankets with a gentle sheen, made to feel like a whisper on the skin.',
          font: [F.play, F.inter], spec: ['Double Bed', 'Double Ply', '4.5 KG'],
          c: { bg: '#faf6fb', accent: '#4a1d4f', text: '#6b5470', boxBg: '#ffffff', boxText: '#4a1d4f', coverBox: '#4a1d4f', coverBoxText: '#f5e6f7', waves: ['#ece0ef', '#b48cbf', '#4a1d4f'] },
          art: ['velvet', ['#5b2a63', '#8e4f99', '#2e1033']],
          designs: [['PLUM', 'VELVET', 'A deep plum with a soft velvet sheen that changes with the light.'],
                    ['MAUVE', 'MIST', 'Muted mauve tones, plush and light for every season.'],
                    ['AMETHYST', 'GLOW', 'A rich purple glow with a smooth, cosy velvet hand.']] },
        { key: 'imperial-threads', group: 'Luxury & Premium', name: 'Imperial Threads', hindi: 'इंपीरियल थ्रेड्स', use: 'High-quality ethnic designs',
          sub: 'Ethnic paisleys and heritage motifs, woven in imperial emerald, gold and ruby.',
          font: [F.cinzel, F.inter], spec: ['Double Bed', 'Double Ply', '4.8 KG'],
          c: { bg: '#f7faf6', accent: '#0f4a3c', text: '#4d5f57', boxBg: '#ffffff', boxText: '#0f4a3c', coverBox: '#0f4a3c', coverBoxText: '#f0d78c', waves: ['#e2eee6', '#b7975a', '#0f4a3c'] },
          art: ['paisley', ['#0f4a3c', '#c9a24f', '#7a1f2b']],
          designs: [['PAISLEY', 'EMERALD', 'Gold paisleys on emerald, a heritage design for festive homes.'],
                    ['MUGHAL', 'JAAL', 'An intricate Mughal-style jaal with ruby and gold accents.'],
                    ['KASHIDA', 'ROYAL', 'Embroidery-inspired motifs in rich, lasting colours.']] },
        { key: 'silk-symphony', group: 'Luxury & Premium', name: 'Silk & Symphony', hindi: 'सिल्क एंड सिंफनी', use: 'Silk / satin finish premium sheets',
          sub: 'A smooth satin finish that flows like silk: graceful, cool and quietly luxurious.',
          font: [F.play, F.inter], spec: ['Double Bed', 'Single Ply', '2.5 KG'],
          c: { bg: '#fbfaf8', accent: '#3d3a4b', text: '#6d6559', boxBg: '#ffffff', boxText: '#3d3a4b', coverBox: '#3d3a4b', coverBoxText: '#efe6d6', waves: ['#efe9e1', '#cbbfae', '#7d6f5e'] },
          art: ['silk', ['#e8dccb', '#bfae93', '#fff8ee']],
          designs: [['CHAMPAGNE', 'SATIN', 'A champagne satin finish with a soft, flowing shine.'],
                    ['PEARL', 'SILK', 'Pearl tones and a cool silky hand for summer nights.'],
                    ['IVORY', 'SHEEN', 'Classic ivory with a gentle sheen, elegant and easy.']] },
        { key: 'majestic-nights', group: 'Luxury & Premium', name: 'Majestic Nights', hindi: 'मैजेस्टिक नाइट्स', use: 'Dark, bold colour palettes',
          sub: 'Bold midnight colours with touches of gold, for bedrooms that love drama.',
          font: [F.cinzel, F.inter], spec: ['Double Bed', 'Double Ply', '5.0 KG'],
          c: { bg: '#11152a', accent: '#e2c275', text: '#c8cbe0', boxBg: '#1c2140', boxText: '#e2c275', coverBox: '#11152a', coverBoxText: '#e2c275', mainTitle: '#11152a', waves: ['#e3e5ee', '#7c84a8', '#11152a'],
               backBg: '#11152a', backWaves: ['#1c2140', '#2a3160', '#3a4380'] },
          art: ['damask', ['#0d1226', '#e2c275', '#1f2a52']],
          designs: [['MIDNIGHT', 'NAVY', 'Deep midnight navy with a gold damask glow.'],
                    ['ONYX', 'GOLD', 'Rich black-blue with royal gold, bold and warm.'],
                    ['NOCTURNE', 'BLUE', 'A dark, dramatic blue for a modern master bedroom.']] },

        // ── Cozy & Comfort (Winter & Snug Vibe) ───────────────────────────
        { key: 'cloud-nine', group: 'Cozy & Comfort', name: 'Cloud Nine Comfort', hindi: 'क्लाउड नाइन कम्फर्ट', use: 'Ultra-light, soft fleece blankets',
          sub: 'Feather-light fleece that feels like sleeping on a cloud.',
          font: [F.pop, F.pop], spec: ['Double Bed', 'Single Ply', '2.2 KG'],
          c: { bg: '#f7fbff', accent: '#2f5d8a', text: '#5a7086', boxBg: '#ffffff', boxText: '#2f5d8a', coverBox: '#2f5d8a', coverBoxText: '#ffffff', waves: ['#e6f0fa', '#a9c7e6', '#2f5d8a'] },
          art: ['clouds', ['#cfe3f5', '#ffffff', '#9fbfe0']],
          designs: [['SKY', 'FLEECE', 'Airy sky-blue fleece, light enough for every night.'],
                    ['FEATHER', 'WHITE', 'Soft white clouds on a gentle blue, cosy and calm.'],
                    ['DREAMY', 'BLUE', 'A dreamy blue fleece that stays soft wash after wash.']] },
        { key: 'cozy-cocoon', group: 'Cozy & Comfort', name: 'Cozy Cocoon', hindi: 'कोज़ी कोकून', use: 'Heavy winter quilts and blankets',
          sub: 'Heavy, hugging warmth for the coldest nights: wrap up and stay in.',
          font: [F.play, F.inter], spec: ['Double Bed', 'Three Ply', '6.5 KG'],
          c: { bg: '#fbf6f0', accent: '#6b4226', text: '#7a6250', boxBg: '#ffffff', boxText: '#6b4226', coverBox: '#6b4226', coverBoxText: '#f6e7d4', waves: ['#f1e3d3', '#c9a27e', '#6b4226'] },
          art: ['knit', ['#8a5a3b', '#c9a27e', '#5b3720']],
          designs: [['CABLE', 'KNIT', 'A chunky cable-knit look in warm cocoa, heavy and snug.'],
                    ['HEARTH', 'BROWN', 'Fireside browns with a deep, plush hand.'],
                    ['TOFFEE', 'WARM', 'Toffee tones and extra weight for real winter.']] },
        { key: 'winter-warmth', group: 'Cozy & Comfort', name: 'Winter Warmth', hindi: 'विंटर वार्मथ', use: 'Winter special collection',
          sub: 'Classic winter plaids in berry red and forest green: the season, wrapped up.',
          font: [F.mont, F.inter], spec: ['Double Bed', 'Double Ply', '5.5 KG'],
          c: { bg: '#fbf8f6', accent: '#8b1e2d', text: '#6a5552', boxBg: '#ffffff', boxText: '#8b1e2d', coverBox: '#8b1e2d', coverBoxText: '#ffffff', waves: ['#f3e1e1', '#c97b7b', '#1f4d3a'] },
          art: ['check', ['#8b1e2d', '#1f4d3a', '#f2e6d0']],
          designs: [['HIGHLAND', 'PLAID', 'A berry-and-forest plaid, the classic winter favourite.'],
                    ['ALPINE', 'CHECK', 'Bold checks and a thick, warm weave.'],
                    ['FIRESIDE', 'RED', 'Rich red tartan for long, cold evenings.']] },
        { key: 'slumber-soft', group: 'Cozy & Comfort', name: 'Slumber Soft', hindi: 'स्लम्बर सॉफ्ट', use: 'Everyday comfortable cotton sheets',
          sub: 'Soft, breathable cotton for everyday sleep: simple, fresh and easy to love.',
          font: [F.pop, F.inter], spec: ['Double Bed', 'Single Ply', '1.8 KG'],
          c: { bg: '#fafafc', accent: '#5a5f7a', text: '#6d7184', boxBg: '#ffffff', boxText: '#5a5f7a', coverBox: '#5a5f7a', coverBoxText: '#ffffff', waves: ['#ecedf3', '#b9bccf', '#5a5f7a'] },
          art: ['stripes', ['#dfe2ee', '#b9bccf', '#ffffff']],
          designs: [['LAVENDER', 'STRIPE', 'Fine lavender stripes on breathable cotton.'],
                    ['MORNING', 'GREY', 'Calm grey tones for a fresh, neat bed every day.'],
                    ['COTTON', 'CLOUD', 'Soft-washed cotton with an easy, relaxed feel.']] },
        { key: 'snug-haven', group: 'Cozy & Comfort', name: 'Snug Haven', hindi: 'स्नग हेवन', use: 'Calm, cosy designs for the home',
          sub: 'Calm sage and oatmeal textures that turn any room into a quiet haven.',
          font: [F.mont, F.inter], spec: ['Double Bed', 'Double Ply', '4.0 KG'],
          c: { bg: '#f8f8f3', accent: '#4f6b58', text: '#66705f', boxBg: '#ffffff', boxText: '#4f6b58', coverBox: '#4f6b58', coverBoxText: '#ffffff', waves: ['#e9ece2', '#aebca5', '#4f6b58'] },
          art: ['waffle', ['#c8d1bf', '#e9ece2', '#8fa287']],
          designs: [['SAGE', 'WAFFLE', 'A soft sage waffle texture, calm and comforting.'],
                    ['OATMEAL', 'CALM', 'Warm oatmeal tones for a peaceful bedroom.'],
                    ['MEADOW', 'HUSH', 'Quiet greens and a gentle, cosy hand.']] },

        // ── Nature & Floral (Earthy & Botanical Vibe) ─────────────────────
        { key: 'earthy-elegance', group: 'Nature & Floral', name: 'Earthy Elegance', hindi: 'अर्थी एलिगेंस', use: 'Neutral & pastel: brown, beige, olive',
          sub: 'Neutral beige, olive and brown in natural linen textures: understated and elegant.',
          font: [F.play, F.inter], spec: ['Double Bed', 'Double Ply', '4.2 KG'],
          c: { bg: '#faf7f1', accent: '#5c4a32', text: '#76674f', boxBg: '#ffffff', boxText: '#5c4a32', coverBox: '#5c4a32', coverBoxText: '#f3ead9', waves: ['#ece3d3', '#b8a37f', '#6b6b3a'] },
          art: ['linen', ['#cdb894', '#a68b5b', '#6b6b3a']], tex: ['linen', ['#faf7f1', '#e9dfcc', '#d8c9ad']],
          designs: [['SAND', 'BEIGE', 'Sand-beige linen texture with a soft natural look.'],
                    ['OLIVE', 'GROVE', 'Muted olive and earth tones, simple and refined.'],
                    ['MOCHA', 'EARTH', 'Warm mocha neutrals that suit every room.']] },
        { key: 'botanical-bliss', group: 'Nature & Floral', name: 'Botanical Bliss', hindi: 'बोटैनिकल ब्लिस', use: 'Leaves and big floral prints',
          sub: 'Big leaves and lush botanicals that bring the garden into the bedroom.',
          font: [F.play, F.inter], spec: ['Double Bed', 'Double Ply', '4.5 KG'],
          c: { bg: '#f6faf5', accent: '#2f5d3a', text: '#55705a', boxBg: '#ffffff', boxText: '#2f5d3a', coverBox: '#2f5d3a', coverBoxText: '#ffffff', waves: ['#e1efe0', '#97c19a', '#2f5d3a'] },
          art: ['leaves', ['#e8f2e1', '#6fa36f', '#2f5d3a']],
          designs: [['MONSTERA', 'GREEN', 'Bold tropical leaves in fresh greens.'],
                    ['FERN', 'GARDEN', 'Layered ferns and foliage, cool and calm.'],
                    ['PALM', 'BREEZE', 'Breezy palm leaves on a light, airy base.']] },
        { key: 'spring-awakenings', group: 'Nature & Floral', name: 'Spring Awakenings', hindi: 'स्प्रिंग अवेकनिंग्स', use: 'Bright, fresh floral designs',
          sub: 'Bright, happy florals that wake the room up like the first day of spring.',
          font: [F.pop, F.pop], spec: ['Double Bed', 'Single Ply', '3.0 KG'],
          c: { bg: '#fffafc', accent: '#c2366b', text: '#7d5566', boxBg: '#ffffff', boxText: '#c2366b', coverBox: '#c2366b', coverBoxText: '#ffffff', waves: ['#fde4ee', '#f7a8c4', '#c2366b'] },
          art: ['floral', ['#fff3f7', '#f472a5', '#fbbf24']],
          designs: [['BLOSSOM', 'PINK', 'Pink blossoms and sunny centres on a soft base.'],
                    ['TULIP', 'FIELD', 'A cheerful field of spring flowers.'],
                    ['DAISY', 'DREAM', 'Fresh daisies scattered over a light background.']] },
        { key: 'nature-trail', group: 'Nature & Floral', name: 'The Nature Trail', hindi: 'द नेचर ट्रेल', use: 'Natural colours and organic fabric',
          sub: 'Terracotta, moss and clay: natural colours on organic, earth-friendly fabric.',
          font: [F.mont, F.inter], spec: ['Double Bed', 'Single Ply', '3.2 KG'],
          c: { bg: '#faf6f0', accent: '#7a4b2a', text: '#6f6150', boxBg: '#ffffff', boxText: '#7a4b2a', coverBox: '#55633a', coverBoxText: '#ffffff', waves: ['#efe2d2', '#b88a5c', '#55633a'] },
          art: ['leaves', ['#efe2d2', '#b88a5c', '#55633a']],
          designs: [['TERRACOTTA', 'TRAIL', 'Clay and terracotta leaves on natural cotton.'],
                    ['MOSS', 'FOREST', 'Moss greens and bark browns, calm and organic.'],
                    ['CLAY', 'PATH', 'Warm earthy tones with a soft, natural feel.']] },
        { key: 'midnight-meadow', group: 'Nature & Floral', name: 'Midnight Meadow', hindi: 'मिडनाइट मीडो', use: 'Floral prints on dark backgrounds',
          sub: 'Moody florals blooming on deep, dark grounds: romantic and striking.',
          font: [F.play, F.inter], spec: ['Double Bed', 'Double Ply', '4.6 KG'],
          c: { bg: '#151d1a', accent: '#e6b8c4', text: '#c9d3cc', boxBg: '#1f2a25', boxText: '#e6b8c4', coverBox: '#151d1a', coverBoxText: '#e6b8c4', mainTitle: '#151d1a', waves: ['#e4e9e6', '#7f948a', '#151d1a'],
               backBg: '#151d1a', backWaves: ['#1f2a25', '#2c3b34', '#3c4f46'] },
          art: ['floral', ['#121a17', '#d98aa1', '#e9d27a']],
          designs: [['MIDNIGHT', 'ROSE', 'Dusky roses blooming on a deep green-black ground.'],
                    ['MOONLIT', 'BLOOM', 'Soft pink blooms under a midnight sky.'],
                    ['DARK', 'GARDEN', 'A moody garden of florals, rich and romantic.']] },

        // ── Modern & Festive (Contemporary & Celebration Vibe) ────────────
        { key: 'urban-zen', group: 'Modern & Festive', name: 'Urban Zen', hindi: 'अर्बन ज़ेन', use: 'Modern, minimalist, geometric prints',
          sub: 'Clean lines and calm geometry for the modern, minimal home.',
          font: [F.mont, F.inter], spec: ['Double Bed', 'Single Ply', '3.0 KG'],
          c: { bg: '#fafafa', accent: '#1f2937', text: '#4b5563', boxBg: '#ffffff', boxText: '#1f2937', coverBox: '#1f2937', coverBoxText: '#ffffff', waves: ['#ececec', '#bdbdbd', '#1f2937'] },
          art: ['geo', ['#e5e7eb', '#9ca3af', '#1f2937']],
          designs: [['MONO', 'GEOMETRY', 'Crisp monochrome triangles, modern and minimal.'],
                    ['SLATE', 'GRID', 'A quiet grid in slate and stone.'],
                    ['ZEN', 'LINES', 'Calm lines and soft greys for a clean look.']] },
        { key: 'festive-aura', group: 'Modern & Festive', name: 'Festive Aura', hindi: 'फेस्टिव ऑरा', use: 'Diwali and festival gifting',
          sub: 'Glowing festive colours and mandala motifs, made for Diwali gifting.',
          font: [F.cinzel, F.pop], spec: ['Double Bed', 'Double Ply', '4.5 KG'],
          c: { bg: '#fffaf3', accent: '#b4235a', text: '#7a5a52', boxBg: '#ffffff', boxText: '#b4235a', coverBox: '#b4235a', coverBoxText: '#fde9c8', waves: ['#fde9c8', '#f5b041', '#b4235a'] },
          art: ['mandala', ['#b4235a', '#f5b041', '#7c2d12']],
          designs: [['DIYA', 'GLOW', 'Warm diya-glow colours with a festive mandala.'],
                    ['RANGOLI', 'BRIGHT', 'Rangoli-inspired circles in marigold and magenta.'],
                    ['UTSAV', 'GOLD', 'A celebration of gold and colour, ready to gift.']] },
        { key: 'shagun', group: 'Modern & Festive', name: 'The Shagun Collection', hindi: 'द शगुन कलेक्शन', use: 'Wedding trousseau & bridal bedding',
          sub: 'Bridal reds and gold, made for the wedding trousseau and a new beginning.',
          font: [F.cinzel, F.inter], spec: ['Double Bed', 'Double Ply', '5.2 KG'],
          c: { bg: '#fffaf5', accent: '#9b111e', text: '#76504a', boxBg: '#ffffff', boxText: '#9b111e', coverBox: '#9b111e', coverBoxText: '#f6d58e', waves: ['#f9e3d4', '#d4a24c', '#9b111e'] },
          art: ['mandala', ['#9b111e', '#d4a24c', '#5c0a12']], tex: ['damask', ['#fffaf5', '#f3e2c9', '#e8cfa6']],
          designs: [['DULHAN', 'RED', 'Bridal red with a gold mandala, the trousseau classic.'],
                    ['SHAGUN', 'GOLD', 'Auspicious gold motifs on rich red.'],
                    ['VIVAH', 'MAROON', 'Deep maroon and gold for the wedding bed.']] },
        { key: 'dream-weavers', group: 'Modern & Festive', name: 'Dream Weavers', hindi: 'ड्रीम वीवर्स', use: 'Fancy, colourful kids & teens',
          sub: 'Fun, colourful prints for kids and teens: stars, clouds and happy dreams.',
          font: [F.pop, F.pop], spec: ['Single Bed', 'Single Ply', '2.0 KG'],
          c: { bg: '#fbfaff', accent: '#4c3fa3', text: '#625b8a', boxBg: '#ffffff', boxText: '#4c3fa3', coverBox: '#4c3fa3', coverBoxText: '#ffffff', waves: ['#e8e5ff', '#a99cf0', '#4c3fa3'] },
          art: ['kids', ['#a5d8ff', '#ffd43b', '#ff8787']],
          designs: [['STARRY', 'NIGHT', 'Bright stars and moons for little dreamers.'],
                    ['RAINBOW', 'FUN', 'Playful colours that make bedtime fun.'],
                    ['CANDY', 'CLOUDS', 'Soft clouds and candy colours for teens.']] },
        { key: 'everyday-luxury', group: 'Modern & Festive', name: 'Everyday Luxury', hindi: 'एवरीडे लग्ज़री', use: 'Budget-friendly, premium-looking daily use',
          sub: 'A premium look at an everyday price: smart checks in navy and blush.',
          font: [F.mont, F.inter], spec: ['Double Bed', 'Single Ply', '3.0 KG'],
          c: { bg: '#fbf9f7', accent: '#24324a', text: '#5d6474', boxBg: '#ffffff', boxText: '#24324a', coverBox: '#24324a', coverBoxText: '#f0e6e2', waves: ['#f0e6e2', '#c9a8a0', '#24324a'] },
          art: ['check', ['#24324a', '#c9a8a0', '#f0e6e2']],
          designs: [['NAVY', 'CHECK', 'Smart navy checks that look premium every day.'],
                    ['BLUSH', 'CLASSIC', 'Soft blush tones in a neat, classic weave.'],
                    ['URBAN', 'DAILY', 'Easy-care daily comfort with a luxury look.']] }
    ];

    // ── Sample picture painter ────────────────────────────────────────────
    function rng(seed) {   // small seeded random, so a design's picture is the same every time
        let a = seed >>> 0;
        return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    function rgba(hex, a) {
        const h = String(hex).replace('#', '');
        return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
    }
    function petals(x, cx, cy, n, len, wid, rot, fill) {
        x.save(); x.translate(cx, cy); x.rotate(rot || 0); x.fillStyle = fill;
        for (let i = 0; i < n; i++) { x.rotate(Math.PI * 2 / n); x.beginPath(); x.ellipse(0, -len / 2, wid, len / 2, 0, 0, Math.PI * 2); x.fill(); }
        x.restore();
    }
    function leaf(x, cx, cy, len, rot, fill, vein) {
        x.save(); x.translate(cx, cy); x.rotate(rot);
        x.fillStyle = fill; x.beginPath(); x.moveTo(0, -len / 2);
        x.quadraticCurveTo(len * 0.38, 0, 0, len / 2); x.quadraticCurveTo(-len * 0.38, 0, 0, -len / 2); x.fill();
        if (vein) { x.strokeStyle = vein; x.lineWidth = Math.max(1, len / 40); x.beginPath(); x.moveTo(0, -len / 2); x.lineTo(0, len / 2); x.stroke(); }
        x.restore();
    }
    const PAINT = {
        damask(x, W, H, c, r) {
            const s = 150;
            for (let y = -s; y < H + s; y += s) for (let i = -s; i < W + s; i += s) {
                const ox = (Math.round(y / s) % 2) * s / 2;
                petals(x, i + ox, y, 8, s * 0.42, s * 0.07, 0, rgba(c[1], 0.55));
                petals(x, i + ox, y, 4, s * 0.62, s * 0.05, Math.PI / 4, rgba(c[1], 0.35));
                x.fillStyle = rgba(c[2], 0.85); x.beginPath(); x.arc(i + ox, y, s * 0.07, 0, 7); x.fill();
                x.strokeStyle = rgba(c[1], 0.3); x.lineWidth = 2; x.beginPath(); x.arc(i + ox, y, s * 0.36, 0, 7); x.stroke();
            }
        },
        velvet(x, W, H, c, r) {
            for (let k = 0; k < 9; k++) {
                const gx = r() * W, gy = r() * H, rad = 180 + r() * 320, g = x.createRadialGradient(gx, gy, 0, gx, gy, rad);
                g.addColorStop(0, rgba(k % 2 ? c[1] : c[2], 0.55)); g.addColorStop(1, rgba(c[0], 0));
                x.fillStyle = g; x.fillRect(0, 0, W, H);
            }
            for (let k = 0; k < 5; k++) {
                const yy = r() * H, g = x.createLinearGradient(0, yy - 80, 0, yy + 80);
                g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(255,255,255,0)');
                x.save(); x.translate(W / 2, H / 2); x.rotate(-0.35); x.translate(-W / 2, -H / 2); x.fillStyle = g; x.fillRect(-W, yy - 80, W * 3, 160); x.restore();
            }
        },
        paisley(x, W, H, c, r) {
            const s = 170;
            for (let y = -s; y < H + s; y += s) for (let i = -s; i < W + s; i += s) {
                const ox = (Math.round(y / s) % 2) * s / 2, cx = i + ox, cy = y;
                x.save(); x.translate(cx, cy); x.rotate(((i + y) % 3) * 0.6 - 0.6);
                x.fillStyle = rgba(c[1], 0.75); x.beginPath(); x.moveTo(0, -s * 0.34);
                x.bezierCurveTo(s * 0.32, -s * 0.2, s * 0.28, s * 0.3, 0, s * 0.3); x.bezierCurveTo(-s * 0.3, s * 0.3, -s * 0.26, -s * 0.02, 0, -s * 0.34); x.fill();
                x.fillStyle = rgba(c[2], 0.85); x.beginPath(); x.ellipse(0, s * 0.08, s * 0.12, s * 0.15, 0, 0, 7); x.fill();
                x.fillStyle = rgba(c[1], 0.9); for (let d = 0; d < 6; d++) { x.beginPath(); x.arc(Math.cos(d) * s * 0.06, s * 0.08 + Math.sin(d) * s * 0.08, 3, 0, 7); x.fill(); }
                x.restore();
            }
        },
        silk(x, W, H, c, r) {
            const g = x.createLinearGradient(0, 0, W, H);
            g.addColorStop(0, c[0]); g.addColorStop(0.45, c[2]); g.addColorStop(0.7, c[1]); g.addColorStop(1, c[0]);
            x.fillStyle = g; x.fillRect(0, 0, W, H);
            for (let k = 0; k < 14; k++) {
                x.strokeStyle = k % 3 ? 'rgba(255,255,255,0.22)' : rgba(c[1], 0.25); x.lineWidth = 6 + r() * 26;
                x.beginPath(); const y0 = r() * H;
                x.moveTo(-50, y0); x.bezierCurveTo(W * 0.3, y0 - 160 + r() * 320, W * 0.7, y0 - 160 + r() * 320, W + 50, y0 + r() * 120 - 60); x.stroke();
            }
        },
        clouds(x, W, H, c, r) {
            const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, c[2]); g.addColorStop(1, c[0]);
            x.fillStyle = g; x.fillRect(0, 0, W, H);
            for (let k = 0; k < 14; k++) {
                const cx = r() * W, cy = r() * H, s = 40 + r() * 70;
                for (let b = 0; b < 5; b++) {
                    const bx = cx + (b - 2) * s * 0.55, by = cy + Math.sin(b * 1.7) * s * 0.25, gg = x.createRadialGradient(bx, by, 0, bx, by, s);
                    gg.addColorStop(0, 'rgba(255,255,255,0.85)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
                    x.fillStyle = gg; x.beginPath(); x.arc(bx, by, s, 0, 7); x.fill();
                }
            }
        },
        knit(x, W, H, c, r) {
            const cw = 70, rh = 26;
            for (let col = 0; col * cw < W + cw; col++) {
                const cx = col * cw;
                x.fillStyle = rgba(c[2], 0.35); x.fillRect(cx + cw - 6, 0, 6, H);
                for (let y = -rh; y < H + rh; y += rh) {
                    x.strokeStyle = rgba(c[1], 0.8); x.lineWidth = 7; x.lineCap = 'round';
                    x.beginPath(); x.moveTo(cx + 10, y); x.lineTo(cx + cw / 2 - 3, y + rh * 0.9); x.stroke();
                    x.beginPath(); x.moveTo(cx + cw - 16, y); x.lineTo(cx + cw / 2 - 3, y + rh * 0.9); x.stroke();
                    x.strokeStyle = rgba(c[2], 0.35); x.lineWidth = 2;
                    x.beginPath(); x.moveTo(cx + 12, y + 4); x.lineTo(cx + cw / 2 - 3, y + rh * 0.9 + 4); x.stroke();
                }
            }
        },
        check(x, W, H, c, r) {
            x.fillStyle = c[2]; x.fillRect(0, 0, W, H);
            const s = 120;
            for (let i = 0; i < W + s; i += s) { x.fillStyle = rgba(c[0], 0.55); x.fillRect(i, 0, s * 0.45, H); x.fillStyle = rgba(c[1], 0.5); x.fillRect(i + s * 0.62, 0, s * 0.12, H); }
            for (let j = 0; j < H + s; j += s) { x.fillStyle = rgba(c[0], 0.5); x.fillRect(0, j, W, s * 0.45); x.fillStyle = rgba(c[1], 0.45); x.fillRect(0, j + s * 0.62, W, s * 0.12); }
            x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 2;
            for (let i = 0; i < W + s; i += s) { x.beginPath(); x.moveTo(i + s * 0.85, 0); x.lineTo(i + s * 0.85, H); x.stroke(); }
            for (let j = 0; j < H + s; j += s) { x.beginPath(); x.moveTo(0, j + s * 0.85); x.lineTo(W, j + s * 0.85); x.stroke(); }
        },
        stripes(x, W, H, c, r) {
            let y = 0, k = 0;
            while (y < H) { const h = 10 + r() * 46; x.fillStyle = [c[0], c[1], c[2], c[0]][k % 4]; x.fillRect(0, y, W, h); y += h; k++; }
            x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 1.5;
            for (let yy = 0; yy < H; yy += 9) { x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke(); }
        },
        waffle(x, W, H, c, r) {
            const s = 46;
            for (let j = 0; j < H; j += s) for (let i = 0; i < W; i += s) {
                x.fillStyle = rgba(c[2], 0.55); x.fillRect(i, j, s, s);
                const g = x.createLinearGradient(i, j, i + s, j + s); g.addColorStop(0, rgba(c[1], 0.95)); g.addColorStop(1, rgba(c[0], 0.95));
                x.fillStyle = g; x.fillRect(i + 6, j + 6, s - 12, s - 12);
            }
        },
        linen(x, W, H, c, r) {
            for (let k = 0; k < 2600; k++) {
                const horiz = k % 2, p = r() * (horiz ? H : W);
                x.strokeStyle = rgba(k % 3 ? c[1] : c[2], 0.06 + r() * 0.12); x.lineWidth = 1 + r() * 1.5;
                x.beginPath(); if (horiz) { x.moveTo(0, p); x.lineTo(W, p + r() * 6 - 3); } else { x.moveTo(p, 0); x.lineTo(p + r() * 6 - 3, H); } x.stroke();
            }
        },
        leaves(x, W, H, c, r) {
            for (let k = 0; k < 34; k++) {
                const len = 110 + r() * 170;
                leaf(x, r() * W, r() * H, len, r() * Math.PI * 2, rgba(k % 3 ? c[2] : c[1], 0.78), rgba(c[0], 0.5));
            }
        },
        floral(x, W, H, c, r) {
            for (let k = 0; k < 16; k++) leaf(x, r() * W, r() * H, 70 + r() * 70, r() * 7, rgba('#4f7a4f', c[0] < '#555555' ? 0.55 : 0.4), null);
            for (let k = 0; k < 22; k++) {
                const cx = r() * W, cy = r() * H, s = 28 + r() * 46;
                petals(x, cx, cy, 5 + (k % 2), s, s * 0.32, r() * 2, rgba(c[1], 0.9));
                petals(x, cx, cy, 5 + (k % 2), s * 0.6, s * 0.2, r() * 2, 'rgba(255,255,255,0.35)');
                x.fillStyle = c[2]; x.beginPath(); x.arc(cx, cy, s * 0.18, 0, 7); x.fill();
            }
        },
        geo(x, W, H, c, r) {
            const s = 110, hgt = s * 0.866;
            for (let j = 0, row = 0; j < H + hgt; j += hgt, row++) for (let i = -s; i < W + s; i += s / 2) {
                const up = ((i / (s / 2)) + row) % 2 === 0, ox = (row % 2) * s / 2;
                x.beginPath();
                if (up) { x.moveTo(i + ox, j + hgt); x.lineTo(i + ox + s / 2, j); x.lineTo(i + ox + s, j + hgt); }
                else { x.moveTo(i + ox, j); x.lineTo(i + ox + s, j); x.lineTo(i + ox + s / 2, j + hgt); }
                x.closePath();
                const v = r(); x.fillStyle = v < 0.18 ? c[2] : v < 0.5 ? c[1] : c[0]; x.fill();
                x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 2; x.stroke();
            }
        },
        mandala(x, W, H, c, r) {
            x.fillStyle = c[0]; x.fillRect(0, 0, W, H);
            const centers = [[W * 0.5, H * 0.5, Math.min(W, H) * 0.46], [0, 0, 160], [W, 0, 160], [0, H, 160], [W, H, 160]];
            centers.forEach(([cx, cy, R]) => {
                for (let ring = 6; ring >= 1; ring--) {
                    const rr = R * ring / 6;
                    petals(x, cx, cy, 8 + ring * 4, rr * 0.5, rr * 0.07, ring * 0.3, rgba(ring % 2 ? c[1] : c[2], 0.85));
                    x.strokeStyle = rgba(c[1], 0.7); x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, rr * 0.55, 0, 7); x.stroke();
                }
                x.fillStyle = c[1]; x.beginPath(); x.arc(cx, cy, R * 0.06, 0, 7); x.fill();
            });
        },
        kids(x, W, H, c, r) {
            x.fillStyle = '#fbfaff'; x.fillRect(0, 0, W, H);
            const cols = c.concat(['#b197fc', '#69db7c']);
            for (let k = 0; k < 40; k++) {
                const cx = r() * W, cy = r() * H, s = 16 + r() * 30, col = cols[k % cols.length];
                x.fillStyle = col; x.beginPath();
                if (k % 3 === 0) { for (let p = 0; p < 10; p++) { const a = p * Math.PI / 5 - Math.PI / 2, rad = p % 2 ? s * 0.45 : s; x.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); } x.closePath(); }
                else if (k % 3 === 1) { x.arc(cx, cy, s * 0.6, 0, 7); }
                else { x.arc(cx - s * 0.4, cy, s * 0.45, 0, 7); x.arc(cx, cy - s * 0.2, s * 0.55, 0, 7); x.arc(cx + s * 0.45, cy, s * 0.45, 0, 7); }
                x.fill();
            }
        }
    };
    // A picture of a folded blanket: the pattern, a fine weave, a soft fold highlight and shadow.
    function paint(kind, c, seed, W, H, plain) {
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const x = cv.getContext('2d'), r = rng(seed * 9973 + kind.length * 131);
        x.fillStyle = c[0]; x.fillRect(0, 0, W, H);
        (PAINT[kind] || PAINT.linen)(x, W, H, c, r);
        for (let k = 0; k < (plain ? 400 : 1600); k++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; x.fillRect(r() * W, r() * H, 2, 2); }
        if (!plain) {
            const g = x.createLinearGradient(0, 0, W, H);
            g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.38, 'rgba(255,255,255,0.18)'); g.addColorStop(0.5, 'rgba(0,0,0,0.10)');
            g.addColorStop(0.62, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.18)');
            x.fillStyle = g; x.fillRect(0, 0, W, H);
            const v = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
            v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.22)');
            x.fillStyle = v; x.fillRect(0, 0, W, H);
        }
        return cv.toDataURL('image/jpeg', 0.74);
    }

    // ── A preset → catalog pages ──────────────────────────────────────────
    const clone = o => JSON.parse(JSON.stringify(o));
    function hash(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
    function titleLines(name) {   // "The Royal Loom" → "THE ROYAL\nLOOM"; two lines, as even as the words allow
        const w = name.toUpperCase().replace(/&/g, '&').split(/\s+/);
        if (w.length < 2) return w.join(' ');
        let best = 1, bestDiff = 1e9;
        for (let i = 1; i < w.length; i++) { const d = Math.abs(w.slice(0, i).join(' ').length - w.slice(i).join(' ').length); if (d < bestDiff) { bestDiff = d; best = i; } }
        return w.slice(0, best).join(' ') + '\n' + w.slice(best).join(' ');
    }
    function buildPreset(p) {
        const seed = hash(p.key), C = p.c, up = p.name.toUpperCase();
        const tex = p.tex ? { bgTexture: paint(p.tex[0], p.tex[1], seed + 99, 320, 320, true), bgTextureMode: 'tile', bgTextureTile: '45', bgTextureOpacity: '30' } : {};

        const cover = clone(defaultPages[0]);
        Object.assign(cover, {
            logoText: '', logoWidth: '150',
            mainTitle: titleLines(p.name), mainTitleColor: C.mainTitle || C.accent, mainTitleSize: '58',
            subTitle: p.sub, subTitleColor: C.mainTitle ? '#4b5563' : C.text,
            boxText: '2026\n2027', boxColor: C.coverBox, boxTextColor: C.coverBoxText,
            specShow: 'Y', specSize: p.spec[0], specPly: p.spec[1], specWeight: p.spec[2],
            preparedByLabel: 'Collection:', preparedBy: p.name,
            preparedByColor: C.mainTitle || C.accent, contactColor: '#4b5563',
            image: paint(p.art[0], p.art[1], seed, 900, 900),
            waveColor1: C.waves[0], waveColor2: C.waves[1], waveColor3: C.waves[2]
        });
        delete cover.phone;   // no mobile number is printed on the cover

        /* Each design a different colourway of the collection's pattern, so the
           three sample pages (and the album) do not look alike: design 1 in the
           main colours, 2 and 3 with ground and motif swapped. Patterns whose
           ground has a meaning of its own (sky, kids, dark florals) keep it. */
        const SWAP = ['damask', 'paisley', 'check', 'mandala', 'geo', 'leaves', 'velvet', 'knit', 'waffle', 'stripes', 'linen', 'silk'];
        const way = i => { const c = p.art[1]; if (SWAP.indexOf(p.art[0]) < 0 || i === 0) return c; return i === 1 ? [c[2], c[1], c[0]] : [c[1], c[0], c[2]]; };
        const products = p.designs.map((d, i) => Object.assign({
            id: generateId(), pageType: 'product',
            brandText: up, footerText: up + ' COLLECTION',
            title1: d[0], title2: d[1], description: d[2],
            size: p.spec[0], ply: p.spec[1], weight: String(parseFloat(p.spec[2]) || ''),
            pageNum: String(i + 1).padStart(2, '0'),
            image: paint(p.art[0], way(i), seed + (i + 1) * 17, 1000, 800),
            bgColor: C.bg, accentColor: C.accent, textColor: C.text, boxBgColor: C.boxBg, boxTextColor: C.boxText
        }, tex));

        const album = Object.assign(clone(ALBUM_DEFAULT), {
            albumEyebrow: 'PHOTO ALBUM', albumTitle: 'THE COLLECTION',
            albumSub: p.name + ': every design at a glance.', albumFooter: up,
            bgColor: C.bg, accentColor: C.accent, textColor: C.text
        }, tex);

        const back = Object.assign(clone(BACK_DEFAULT), {
            backSub: 'for choosing ' + p.name,
            bgColor: C.backBg || '#ffffff', accentColor: C.backBg ? C.accent : C.coverBox, textColor: C.backBg ? C.text : '#4b5563',
            waveColor1: (C.backWaves || C.waves)[0], waveColor2: (C.backWaves || C.waves)[1], waveColor3: (C.backWaves || C.waves)[2]
        });

        return { pages: ensureAlbum([cover].concat(products, [album, back])), settings: { headingFont: p.font[0], bodyFont: p.font[1] } };
    }

    // ── Gallery modal ─────────────────────────────────────────────────────
    const thumbs = {};
    function ensureModal() {
        let m = document.getElementById('preset-modal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'preset-modal';
        m.className = 'hidden fixed inset-0 bg-black bg-opacity-40 z-40 flex items-center justify-center';
        m.innerHTML =
            '<div class="bg-white rounded-lg shadow-xl w-full max-w-5xl mx-4 flex flex-col" style="max-height: 88vh;">'
          + '<div class="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-200">'
          +   '<h3 class="text-base font-bold text-gray-800"><i class="fas fa-swatchbook text-indigo-600"></i> Starter Templates <span class="text-xs font-semibold text-gray-400">(' + PRESETS.length + ' collections with sample pictures)</span></h3>'
          +   '<div class="flex items-center gap-2">'
          +     '<button id="preset-save-all" class="bg-indigo-600 text-white rounded px-3 py-1.5 text-xs font-semibold hover:bg-indigo-700" title="Create every starter as a template on the server (ones already there by name are skipped)"><i class="fas fa-cloud-upload-alt"></i> Save all ' + PRESETS.length + ' to Server</button>'
          +     '<button id="preset-close" class="text-gray-500 hover:text-gray-800 text-sm font-semibold px-2">&#10005; Close</button>'
          +   '</div>'
          + '</div>'
          + '<div id="preset-status" class="hidden px-5 py-2 text-xs font-semibold bg-indigo-50 text-indigo-800 border-b border-indigo-100"></div>'
          + '<div id="preset-grid" class="flex-1 overflow-y-auto px-5 py-4"></div>'
          + '</div>';
        document.body.appendChild(m);
        m.addEventListener('click', e => { if (e.target === m) closePresetGallery(); });
        m.querySelector('#preset-close').onclick = closePresetGallery;
        m.querySelector('#preset-save-all').onclick = saveAllPresets;
        m.querySelector('#preset-grid').addEventListener('click', e => {
            const b = e.target.closest('[data-preset]'); if (b) usePreset(b.dataset.preset);
        });
        return m;
    }
    function renderGrid() {
        const groups = [];
        PRESETS.forEach(p => { if (groups.indexOf(p.group) < 0) groups.push(p.group); });
        const esc = window.esc || (s => String(s));
        document.getElementById('preset-grid').innerHTML = groups.map(g =>
            '<div class="text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mt-2 mb-2">' + esc(g) + '</div>'
          + '<div class="grid gap-3 mb-4" style="grid-template-columns: repeat(auto-fill, minmax(175px, 1fr));">'
          + PRESETS.filter(p => p.group === g).map(p => {
                if (!thumbs[p.key]) thumbs[p.key] = paint(p.art[0], p.art[1], hash(p.key), 360, 220);
                return '<div class="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition flex flex-col">'
                     + '<div style="height: 96px; background: url(\'' + thumbs[p.key] + '\') center / cover; position: relative;">'
                     +   '<div style="position:absolute;left:0;right:0;bottom:0;padding:6px 8px;background:' + p.c.coverBox + ';color:' + p.c.coverBoxText + ';font-size:12px;font-weight:700;letter-spacing:.04em;font-family:' + p.font[0] + ';">' + esc(p.name) + '</div>'
                     + '</div>'
                     + '<div class="p-2.5 flex-1 flex flex-col gap-1">'
                     +   '<div class="text-[11px] text-gray-500">' + esc(p.hindi) + '</div>'
                     +   '<div class="text-[11px] text-gray-700 leading-snug flex-1">' + esc(p.use) + '</div>'
                     +   '<div class="flex gap-1 my-1">' + [p.c.accent, p.c.coverBox, p.c.waves[1], p.c.bg].map(x => '<span style="width:14px;height:14px;border-radius:3px;border:1px solid #e5e7eb;background:' + x + '"></span>').join('') + '</div>'
                     +   '<button data-preset="' + p.key + '" class="mt-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-2 py-1 text-xs font-semibold hover:bg-indigo-100"><i class="fas fa-pen"></i> Open &amp; Edit</button>'
                     + '</div></div>';
            }).join('')
          + '</div>').join('');
    }
    function status(t) { const s = document.getElementById('preset-status'); if (!s) return; s.textContent = t || ''; s.classList.toggle('hidden', !t); }

    function openPresetGallery() { const m = ensureModal(); renderGrid(); status(''); m.classList.remove('hidden'); }
    function closePresetGallery() { const m = document.getElementById('preset-modal'); if (m) m.classList.add('hidden'); }

    // Opens a starter in the editor as a NEW, unsaved template named after the collection.
    async function usePreset(key) {
        const p = PRESETS.find(x => x.key === key); if (!p) return;
        if (!(await okToDiscard('Open the "' + p.name + '" starter'))) return;
        status('Preparing "' + p.name + '" …');
        await new Promise(r => setTimeout(r, 20));   // let the message paint before the pictures are drawn
        const t = buildPreset(p);
        catalogData = t.pages;
        globalSettings = Object.assign({}, globalSettings, t.settings);
        localStorage.setItem('touchwood_settings', JSON.stringify(globalSettings));
        document.getElementById('setting-heading-font').value = globalSettings.headingFont;
        document.getElementById('setting-body-font').value = globalSettings.bodyFont;
        cloud = { id: null, name: p.name, version: null, updatedBy: '', updatedAt: '' };
        dirty = true;   // not on the server yet
        currentPageId = catalogData[0].id;
        renderSidebar();
        loadPageIntoEditor(currentPageId);
        paintCloudBar();
        await saveDataLocally(true);
        status('');
        closePresetGallery();
    }

    // Creates every starter on the server. A name already taken there is skipped, never overwritten.
    async function saveAllPresets() {
        const ok = await cmDialog({ msg: 'Create all ' + PRESETS.length + ' starter catalogs as templates on the server?\n\nA template that already exists with the same name is left as it is (skipped). Anyone with the right can edit them later from Templates.',
            buttons: [{ label: 'Cancel', value: null }, { label: 'Create all', value: true, primary: true }] });
        if (ok !== true) return;
        const btn = document.getElementById('preset-save-all'); btn.disabled = true;
        let made = 0, skipped = [], failed = [];
        for (let i = 0; i < PRESETS.length; i++) {
            const p = PRESETS[i];
            status('Saving ' + (i + 1) + ' of ' + PRESETS.length + ': ' + p.name + ' …');
            await new Promise(r => setTimeout(r, 20));
            try {
                const t = buildPreset(p);
                await rpc('cat_save', { p_tpl: { id: null, name: p.name, pages: t.pages, settings: t.settings, version: null } });
                made++;
            } catch (e) {
                if (e.code === 'NAME_TAKEN') skipped.push(p.name);
                else { failed.push(p.name + ': ' + e.message); if (/not set up on the server|NOT_ALLOWED|right/i.test(e.message)) break; }
            }
        }
        btn.disabled = false;
        status('');
        showModal('Starter templates on the server:\n\n' + made + ' created'
            + (skipped.length ? '\n' + skipped.length + ' already there (skipped): ' + skipped.join(', ') : '')
            + (failed.length ? '\n\nNot saved:\n' + failed.join('\n') : '')
            + '\n\nOpen them from Templates to edit.');
    }

    window.openPresetGallery = openPresetGallery;
    window.closePresetGallery = closePresetGallery;
    // For a quick check from the console / tests: the list and the page builder.
    window.SARV_CATALOG_PRESETS = PRESETS;
    window.sarvBuildCatalogPreset = key => buildPreset(PRESETS.find(p => p.key === key));
})();
