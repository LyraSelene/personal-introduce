'use strict';
(() => {
  const opening=document.querySelector('.arrival');
  const plane=opening?.querySelector('img');
  if(!opening||!plane)return;
  let cleanup;
  function finish(){ opening.hidden=true; document.body.classList.add('arrival-skipped'); clearTimeout(cleanup); window.removeEventListener('scroll',onScroll); }
  function onScroll(){ if(window.scrollY>60)finish(); }
  plane.addEventListener('animationend',finish,{once:true});
  plane.addEventListener('error',finish,{once:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)finish();});
  window.addEventListener('scroll',onScroll,{passive:true});
  if(opening.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches||window.scrollY>60)finish(); else cleanup=setTimeout(finish,3200);
})();
