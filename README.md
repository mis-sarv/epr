# Sarv India — Store / Purchase / Production (file layout)

**Zaroori:** ye ab single-file app nahi hai. `Store.html` apne CSS aur JS ko
saath wali files se load karti hai, isi liye **poora folder saath rakhna /
bhejna hai**. Sirf `Store.html` kisi ko mail kar dene se wo khaali khulegi.
(Offline `file://` par chalti hai — classic `<script src>` ko CORS nahi rokta.)

## Files

| File | Kya hai |
|---|---|
| `Store.html` | Desktop app ka markup. ERP shell ka `<link>`/`<script>` sabse aakhir me. |
| `store.css` | Store ka poora stylesheet — pehle ke 5 inline `<style>` blocks, document order me. **Order load-bearing hai, reorder na karein.** |
| `store-core.js` | Store ka poora logic (Inward, Outward, Issue, PR, PO, Reports, Tracker, Master Data, Repair, PDF, roles). |
| `store-design-master.js` | Production › Design Master. `store-core.js` ke `SB` / `escText` / `fetchAllRows` padhta hai, isi liye uske **baad** load hona chahiye. |
| `store-nav-keys.js` | Dono tab bars ka keyboard navigation. |
| `erp-shell.css` | ERP navigation shell ka look (sidebar, topbar, KPI tiles). Sab `#erpShell` ke andar scoped. |
| `erp-shell.js` | ERP sidebar + dashboard + module map. **Sabse aakhir me load hota hai** — `sarvGoHome` / `sarvNavigateFromHome` / `activatePanel` ko wrap karta hai. |
| `mobile.html` | Mobile approval app ka markup. |
| `mobile.css` / `mobile-core.js` | Uska style aur logic. |
| `DESIGN_MASTER_MIGRATION.sql` | Design Master ke do table + storage policies. Supabase › SQL Editor me **ek baar** chalayein. |
| `_backup_before_erp_split/` | Split se pehle ki original single-file `Store.html` aur `mobile.html`. |

## Script load order — na badlein

```html
store-core.js  →  store-design-master.js  →  store-nav-keys.js  →  erp-shell.js
```

Teeno classic scripts ek hi global lexical scope share karte hain: baad wali
files pehli wali ke top-level `const` / `let` (`SB`, `SB_READY`, `escText`,
`fetchAllRows`, `sarvCurrentRole`…) seedha padhti hain. Isi liye:

- `type="module"` **na** lagayein — module ka apna scope hota hai, aur `file://`
  par CORS use block kar deta hai.
- `defer` **na** lagayein — order toot jayega.

## Sidebar me kaunsa module kisko dikhe

**Master Data › Settings › Admin Panel › Tab Visibility › 🏢 ERP Shell ›
Sidebar Modules** — har module ki ek row, har role ka ek column. Off karne par
wo module us role ke sidebar se poora hat jaata hai (Coming Soon wale bhi).

Do level hain, aur dono alag kaam karte hain:

| Level | Kahan | Kya karta hai |
|---|---|---|
| Module | `🏢 ERP Shell › Sidebar Modules` (`ERP_*`) | Sidebar ka button dikhe ya na dikhe |
| Screen | `🏠 Home Page` (`HOME_*`) | Us screen par haq hai ya nahi — sidebar ka leaf yahi padhta hai |

To module ON + screen OFF ka matlab: module dikhega, par us screen ka leaf
nahi. Aur `ERP_*` row sirf chhupati hai — screen ka asli pehra `HOME_*` hi hai,
isi liye sidebar se kisi ko extra access nahi mil sakta.

Default: sab modules sabko, `Administration` sirf Admin ko. Save dabate hi
sidebar redraw ho jaata hai (`sarvApplyAccess` se juda hai) — reload nahi
karna padta. Naya module `erp-shell.js` ke `MODULES` me jode to uski
`ERP_<key>` row `store-core.js` ke `SARV_TABS` me bhi jodein, warna wo hamesha
dikhta rahega.

## ERP shell hatana ho to

`Store.html` se do line hata dein — `<link rel="stylesheet" href="erp-shell.css">`
aur `<script src="erp-shell.js"></script>`. Purana tile wala Home screen wapas
aa jayega; baaki kuch nahi badlega, kyunki shell ne `store-core.js` me ek line
bhi nahi chhedi.
