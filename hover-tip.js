/* ════════════════════════════════════════════════════════════════════
   HOVER TIP — full text of any cut-off box or cell on mouse-over
   ────────────────────────────────────────────────────────────────────
   Loaded right after caps-input.js in every app page (launcher.html is left
   alone, it has nothing long to show). A long Item Name, party name,
   description etc. that does not fit its text box, dropdown or table cell
   is cut off, and could not be read without clicking in and scrolling.

   When the mouse rests on such a box / dropdown / cell, a small tooltip next
   to the pointer shows the full text. Nothing is wired per screen, so rows
   added later, pickers, reports, React (complaint, price list) and Tailwind
   pages (truncate classes) all get it.

   Why the page draws its own tooltip instead of setting title="":
     a LOCKED box (disabled — the PR form's Description / Category "Auto from
     Master", a locked PR's item rows, Admin-edit locks) shows no native
     tooltip in Chrome / Edge, and in several browsers gets no mouse events
     at all; only the "not allowed" cursor appeared. So a locked TEXT box lets
     the mouse through to its cell (pointer-events:none; it can neither be
     typed in nor clicked anyway), the cell gets the mouse, and the box under
     the pointer is found by its position. Same tooltip for every element,
     so it looks the same everywhere.

     • Only cut-off text gets a tooltip; text that fits shows none.
     • An unlocked element with its own title (help text) keeps its native
       tooltip; this one stays out of the way there.
     • Password / PIN boxes are skipped, so a typed PIN never shows.
     • Touch screens have no mouse-over, so on phones nothing changes.
   No globals: classic script, safe at any point in the page's script order.
   ════════════════════════════════════════════════════════════════════ */
(function(){
  if(window.__svHoverTip)return;
  window.__svHoverTip=true;

  var BOX='input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset])'
    +':not([type=file]):not([type=hidden]):not([type=password]):not([type=range]):not([type=color]),textarea,select';
  var LOCKED_TXT='input:disabled:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=file]),textarea:disabled,select:disabled';
  // Same idea as caps-input.js: a box named as a PIN / password / OTP / token keeps its text to itself.
  var SECRET=/(^|[^a-z])(pin|pins|password|passwd|pwd|passcode|otp|token|secret)([^a-z]|$)/i;

  /* Locked text boxes pass the mouse to their cell (see above). Only text-like
     boxes: a locked checkbox or button keeps swallowing its clicks as before. */
  try{
    var st=document.createElement('style');
    st.textContent=LOCKED_TXT+'{pointer-events:none}';
    (document.head||document.documentElement).appendChild(st);
  }catch(e){}

  function isSecret(el){
    var cls=typeof el.className==='string'?el.className:'';
    return SECRET.test([el.id,el.name,cls,el.getAttribute('autocomplete')||'',el.placeholder||''].join(' '));
  }
  function textOf(el){
    if(el.tagName==='SELECT'){var o=el.options[el.selectedIndex];return o?o.text:'';}
    if(el.matches(BOX))return el.value;
    return el.innerText;
  }
  var cv=null;
  // Cut off = the content is wider (or, for a textarea, taller) than the box shows.
  function cutOff(el){
    /* A dropdown never reports its text as overflowing (scrollWidth stays
       equal to its width), so the picked option's text is measured in the
       box's own font against the room left beside the arrow. */
    if(el.tagName==='SELECT'){
      var o=el.options[el.selectedIndex];if(!o)return false;
      var cs=getComputedStyle(el);
      cv=cv||document.createElement('canvas');var cx=cv.getContext('2d');
      cx.font=cs.fontStyle+' '+cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;
      var room=el.clientWidth-(parseFloat(cs.paddingLeft)||0)-(parseFloat(cs.paddingRight)||0)-18;
      return cx.measureText(o.text).width>room;
    }
    return el.scrollWidth>el.clientWidth+1||(el.tagName==='TEXTAREA'&&el.scrollHeight>el.clientHeight+1);
  }
  function ownText(el){
    for(var n=el.firstChild;n;n=n.nextSibling)if(n.nodeType===3&&n.nodeValue.trim())return true;
    return false;
  }
  // The locked box under the pointer, inside the element that got the mouse.
  function lockedAt(host,x,y){
    if(!host.querySelectorAll)return null;
    var bs=host.querySelectorAll(LOCKED_TXT);
    if(!bs.length||bs.length>60)return null;           // a whole panel is not a cell
    for(var i=0;i<bs.length;i++){
      var r=bs[i].getBoundingClientRect();
      if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return bs[i];
    }
    return null;
  }
  // What the pointer is on, and the full text to show for it ('' = nothing).
  function pick(t,x,y){
    var el=null;
    if(t.matches(BOX))el=t;
    else el=lockedAt(t,x,y);
    if(!el){
      if(ownText(t))el=t;
      /* Text often sits in a <strong> / <span> inside the part that clips it:
         check the element itself, then the cell, list item or truncated block
         it is in (not a cell holding a box: that is the box's business). */
      var box=t.closest('td,th,li,.truncate,[class*="ellipsis"]');
      if(el&&!cutOff(el))el=null;
      if(!el&&box&&!box.querySelector(BOX))el=box;
    }
    if(!el||el===document.body||el===document.documentElement)return null;
    if(el.matches(BOX)&&isSecret(el))return null;
    if(el.title&&!el.disabled)return null;               // its own native tooltip shows
    var s=String(textOf(el)||'').trim();
    return s&&cutOff(el)?{el:el,text:s}:null;
  }

  var tipEl=null,cur=null,timer=0,lx=0,ly=0;
  function tipBox(){
    if(tipEl&&tipEl.isConnected)return tipEl;
    tipEl=document.createElement('div');
    tipEl.setAttribute('role','tooltip');
    tipEl.style.cssText='position:fixed;z-index:2147483646;display:none;max-width:min(460px,calc(100vw - 24px));'
      +'padding:6px 9px;border-radius:6px;background:#0f172a;color:#f8fafc;font:600 12px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;'
      +'letter-spacing:normal;text-transform:none;white-space:pre-wrap;word-break:break-word;box-shadow:0 4px 14px rgba(15,23,42,.25);pointer-events:none;';
    document.body.appendChild(tipEl);
    return tipEl;
  }
  function place(){
    var b=tipBox(),w=b.offsetWidth,h=b.offsetHeight,vw=window.innerWidth,vh=window.innerHeight;
    var x=lx+12,y=ly+18;
    if(x+w>vw-8)x=Math.max(8,vw-8-w);
    if(y+h>vh-8)y=Math.max(8,ly-h-10);                   // no room below: above the pointer
    b.style.left=x+'px';b.style.top=y+'px';
  }
  function hide(){
    clearTimeout(timer);cur=null;
    if(tipEl)tipEl.style.display='none';
  }
  function show(p){
    var b=tipBox();
    b.textContent=p.text;b.style.display='block';place();
  }

  document.addEventListener('mousemove',function(e){
    lx=e.clientX;ly=e.clientY;
    var t=e.target;if(!t||t.nodeType!==1||!t.matches||!document.body)return;
    var p=pick(t,lx,ly);
    if(!p){hide();return;}
    if(cur&&cur.el===p.el&&cur.text===p.text){
      if(tipEl&&tipEl.style.display==='block')place();
      return;
    }
    hide();cur=p;
    // A short pause, so a tooltip does not flash under a mouse just passing over.
    timer=setTimeout(function(){if(cur===p)show(p);},350);
  },true);
  document.addEventListener('mouseout',function(e){if(!e.relatedTarget)hide();},true);
  ['mousedown','keydown','wheel','scroll','blur'].forEach(function(ev){
    (ev==='blur'?window:document).addEventListener(ev,hide,true);
  });
})();
