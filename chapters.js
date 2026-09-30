'use strict';
(() => {
  const main=document.getElementById('main');
  const definitions=[['home','首页'],['about','关于我'],['feelings','心情'],['journal','心事'],['letter','给你的信'],['messages','来信']];
  if(!main||definitions.some(([id])=>!document.getElementById(id)))return;
  const icons={
    about:'<rect x="5" y="3" width="15" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5M3 19h13"/>',
    feelings:'<circle cx="12" cy="12" r="9"/><path d="M8 14q4 5 8 0M8 9h.01M16 9h.01"/>',
    journal:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
    letter:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
    messages:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/>'
  };
  const nav=document.createElement('nav');nav.className='chapter-nav';nav.setAttribute('aria-label','章节导航');
  const pages=definitions.map(([id,label])=>{
    const section=document.getElementById(id),page=document.createElement('div');
    page.className='chapter-page';page.dataset.chapter=id;page.tabIndex=-1;
    page.setAttribute('role','region');page.setAttribute('aria-label',label);
    section.before(page);page.append(section);
    const link=document.createElement('a');link.href='#'+id;link.title=label;link.setAttribute('aria-label',label);
    link.innerHTML=id==='home'?'<img src="assets/profile-portrait.jpg" alt="">':'<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[id]+'</svg>';
    const caption=document.createElement('span');caption.className='chapter-label';caption.textContent=label;link.append(caption);nav.append(link);
    return page;
  });
  const ticker=document.querySelector('.ticker');if(ticker)pages[0].append(ticker);
  const homeCards=document.querySelector('.home-cards');if(homeCards)pages[0].append(homeCards);
  const recent=document.querySelector('.recent-updates'),recentSlot=document.querySelector('#home-recent-slot');
  if(recent&&recentSlot){recentSlot.replaceChildren(recent);recent.classList.add('recent-updates-compact');}
  const closing=document.querySelector('.closing'),footer=document.querySelector('.footer');
  if(closing)pages[5].append(closing);if(footer)pages[5].append(footer);
  document.body.append(nav);
  const hint=document.querySelector('.hero-bottom>a');
  if(hint) {hint.href='#about';hint.lastChild.textContent='向右翻，慢慢认识我';}
  const back=document.querySelector('.closing>a');if(back){back.textContent='⌂';back.setAttribute('aria-label','回到首页');}
  let current=-1, animations=[];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function stopMotion(){if(reduced.matches||document.body.classList.contains('motion-paused')){animations.forEach(a=>a.cancel());animations=[];}}
  reduced.addEventListener('change',stopMotion);
  new MutationObserver(stopMotion).observe(document.body,{attributes:true,attributeFilter:['class']});
  function show(index,{history=false,focus=false}={}) {
    if(index<0||index>=pages.length||index===current)return;
    const previous=current;current=index;
    animations.forEach(a=>a.cancel());animations=[];
    const movedFocus=pages.some(page=>page.contains(document.activeElement));
    pages.forEach((page,i)=>{page.hidden=i!==index;page.inert=i!==index;});
    document.documentElement.dataset.chapter=definitions[index][0];
    [...nav.children].forEach((link,i)=>{if(i===index)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    if(history){const url=new URL(location.href);url.searchParams.delete('journal');url.hash=definitions[index][0];window.history.pushState(null,'',url);}
    if(previous!==-1) {
      const opening=document.querySelector('.arrival');if(opening)opening.hidden=true;
      const direction=index>previous?1:-1;
      if(pages[index].animate&&!reduced.matches&&!document.body.classList.contains('motion-paused')) {
        animations.push(pages[index].animate([{transform:`translateX(${direction*70}px)`,opacity:.25},{transform:'translateX(0)',opacity:1}],{duration:380,easing:'cubic-bezier(.2,.7,.2,1)'}));
      }
    }
    if(focus||movedFocus)pages[index].focus({preventScroll:true});
    document.dispatchEvent(new CustomEvent('chapterchange',{detail:{id:definitions[index][0]}}));
  }
  function fromHash(){const i=definitions.findIndex(([id])=>'#'+id===location.hash);show(i<0?0:i);}
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href^="#"]');if(!link||event.defaultPrevented||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button>0)return;
    const index=definitions.findIndex(([id])=>'#'+id===link.hash);
    if(index!==-1){event.preventDefault();show(index,{history:true,focus:!nav.contains(link)});}
    else if(link.hash==='#main'){event.preventDefault();pages[current].focus({preventScroll:true});}
  });
  window.addEventListener('hashchange',fromHash);window.addEventListener('popstate',fromHash);
  const interactive=target=>target.closest('input,textarea,select,button,a,[contenteditable="true"],dialog');
  document.addEventListener('keydown',event=>{
    if(document.querySelector('dialog[open]')||event.altKey||event.metaKey||event.ctrlKey||event.shiftKey)return;
    const inNav=nav.contains(event.target);
    if(!inNav&&(!main.contains(event.target)||interactive(event.target)))return;
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const index=event.key==='Home'?0:event.key==='End'?pages.length-1:current+(event.key==='ArrowRight'?1:-1);
    show(index,{history:true,focus:!inNav});if(inNav)nav.children[current].focus();
  });
  let touch;
  main.addEventListener('touchstart',event=>{touch=event.touches.length===1&&!interactive(event.target)?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null;},{passive:true});
  main.addEventListener('touchend',event=>{
    if(!touch||!event.changedTouches.length)return;
    const dx=event.changedTouches[0].clientX-touch.x,dy=event.changedTouches[0].clientY-touch.y;touch=null;
    if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.8)show(current+(dx<0?1:-1),{history:true});
  },{passive:true});
  main.addEventListener('touchcancel',()=>{touch=null;},{passive:true});
  pages[0].addEventListener('scroll',()=>{if(pages[0].scrollTop>60){const opening=document.querySelector('.arrival');if(opening)opening.hidden=true;}},{passive:true});
  document.documentElement.classList.add('chapter-mode');fromHash();
})();
