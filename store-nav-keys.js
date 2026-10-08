/* store-nav-keys.js — extracted from Store.html (was the inline
   <script> block at line 23807).
   Loaded as a CLASSIC script, in this order, un-deferred: these blocks
   share one global lexical scope and later ones read const/let declared
   by earlier ones. Do not add type="module" or defer. */
/* Keyboard-friendly navigation for the two tab bars. */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-link[data-target], #fullPurchasePanel .nav-link[data-tab]').forEach(link => {
    link.setAttribute('role', 'tab');
    link.setAttribute('tabindex', '0');
    link.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        link.click();
      }
    });
  });
});
