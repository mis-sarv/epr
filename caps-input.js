/* ════════════════════════════════════════════════════════════════════
   CAPS INPUT — everything typed into the ERP is in CAPITAL letters
   ────────────────────────────────────────────────────────────────────
   Loaded right after date-dmy.js in every app page EXCEPT launcher.html
   (the login page is deliberately left alone). Two things happen to every
   text box and textarea that qualifies:
     1. it SHOWS in capitals (CSS text-transform, class .sv-caps), including
        values the page fills in itself;
     2. what is TYPED / pasted / picked from a list is turned into capitals
        in the box's real value, so that is what gets saved.

   Left exactly as they are (never upper-cased):
     • password, email, url, number, date, time, file, checkbox, radio,
       hidden, colour and range inputs — only text / search / tel / untyped
       inputs and textareas qualify;
     • the DD/MM/YYYY date boxes (data-dmy) and read-only boxes;
     • any box whose id / name / class / placeholder / autocomplete names it
       as a PIN, password, OTP, token, secret, email, mail or URL field —
       a PIN or Edit Password typed in capitals would stop matching;
     • anything inside an element marked data-no-caps (opt-out for later).

   Login is not affected: launcher.html does not load this file, and it
   matches user names / emp codes upper-cased and logs in by user id + PIN.
   Name / item lookups across the ERP are case-insensitive (ilike, or both
   sides lower-cased), so a name typed in capitals still finds an existing
   lower-case record instead of creating a duplicate.

   React pages (complaint.html): the value is written through the native
   prototype setter in the capture phase, BEFORE React reads the event, so
   React's onChange receives the capitalised text and its state stays in step.
   ════════════════════════════════════════════════════════════════════ */
(function(){
  if(window.__svCapsInput)return;
  window.__svCapsInput=true;

  var OK_TYPES={text:1,search:1,tel:1,'':1};
  // Whole words only, so "Gate Pass No." is still capitalised while
  // "userPin" / "edit_password" / "vendorMail" are not.
  var SKIP_WORDS={pin:1,pins:1,password:1,passwd:1,pwd:1,passcode:1,otp:1,token:1,secret:1,
    email:1,mail:1,url:1,website:1};

  function words(s){
    return String(s||'')
      .replace(/([a-z0-9])([A-Z])/g,'$1 $2')       // camelCase → camel Case
      .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  }
  function qualifies(el){
    if(!el||el.nodeType!==1)return false;
    var tag=el.tagName;
    if(tag==='INPUT'){
      var t=String(el.getAttribute('type')||'').toLowerCase();
      if(!OK_TYPES[t])return false;
    }else if(tag!=='TEXTAREA')return false;
    if(el.readOnly||el.hasAttribute('data-dmy'))return false;
    if(el.closest&&el.closest('[data-no-caps]'))return false;
    var ident=[el.id,el.getAttribute('name'),el.className,el.getAttribute('placeholder'),
      el.getAttribute('autocomplete'),el.getAttribute('aria-label')].join(' ');
    var ws=words(ident);
    for(var i=0;i<ws.length;i++)if(SKIP_WORDS[ws[i]])return false;
    return true;
  }

  // Display: capitals on screen; placeholders keep their own case.
  function addStyle(){
    if(document.getElementById('svCapsStyle'))return;
    var st=document.createElement('style');st.id='svCapsStyle';
    st.textContent='.sv-caps{text-transform:uppercase}'
      +'.sv-caps::placeholder{text-transform:none}'
      +'.sv-caps::-webkit-input-placeholder{text-transform:none}';
    (document.head||document.documentElement).appendChild(st);
  }
  function tag(el){
    if(qualifies(el)){if(!el.classList.contains('sv-caps'))el.classList.add('sv-caps');}
    else if(el.classList&&el.classList.contains('sv-caps'))el.classList.remove('sv-caps');
  }
  function scan(root){
    if(!root||!root.querySelectorAll)return;
    if(root.matches&&root.matches('input,textarea'))tag(root);
    var list=root.querySelectorAll('input,textarea');
    for(var i=0;i<list.length;i++)tag(list[i]);
  }

  // Saving: the real value, through the prototype setter (see React note).
  var inSet=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  var taSet=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
  function upperValue(el){
    var v=el.value,u=v.toUpperCase();
    if(u===v)return;
    var s=null,e=null;
    try{s=el.selectionStart;e=el.selectionEnd;}catch(_){}
    (el.tagName==='TEXTAREA'?taSet:inSet).call(el,u);
    // Upper-casing can change length (e.g. "ß" → "SS"); clamp the caret.
    if(s!=null){try{var n=u.length;el.setSelectionRange(Math.min(s,n),Math.min(e,n));}catch(_){}}
  }
  var composing=false;
  document.addEventListener('compositionstart',function(){composing=true;},true);
  document.addEventListener('compositionend',function(ev){
    composing=false;
    var el=ev.target;if(qualifies(el)){tag(el);upperValue(el);}
  },true);
  // Capture phase on document: runs before any page / React handler sees it.
  document.addEventListener('input',function(ev){
    if(composing||ev.isComposing)return;
    var el=ev.target;
    if(!qualifies(el))return;
    tag(el);upperValue(el);
  },true);
  // A box that changes type / attributes later is re-judged when focused.
  document.addEventListener('focusin',function(ev){var el=ev.target;if(el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA'))tag(el);},true);

  function start(){
    addStyle();scan(document.body);
    try{
      new MutationObserver(function(muts){
        for(var i=0;i<muts.length;i++){
          var a=muts[i].addedNodes;
          for(var j=0;j<a.length;j++)if(a[j].nodeType===1)scan(a[j]);
        }
      }).observe(document.body,{childList:true,subtree:true});
    }catch(_){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);
  else start();
})();
