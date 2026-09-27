'use strict';
(() => {
  if (!('IntersectionObserver' in window) || !Element.prototype.animate) return;
  const definitions = [
    ['about', 'plane', 'paper-plane.jpg'],
    ['feelings', 'camera', 'camera.jpg'],
    ['journal', 'traveler', 'traveler.jpg'],
    ['letter', 'delivery', 'delivery.jpg']
  ];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const disabled = () => reduced.matches || document.body.classList.contains('motion-paused');
  const overlay = document.createElement('div');
  overlay.className = 'chapter-cut-in';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = '<div class="cut-in-ribbon"></div><div class="cut-in-character"><img alt=""></div><span class="cut-in-spark">✧</span><span class="cut-in-spark">✳</span>';
  document.body.append(overlay);
  const character = overlay.querySelector('.cut-in-character');
  const image = overlay.querySelector('img');
  const animations = new Set();
  let generation = 0;
  let activeSection = null;
  const loaded = new Map(definitions.map(([id, kind, file]) => {
    const asset = new Image();
    asset.src = 'assets/stickers/' + file;
    return [id, { kind, asset }];
  }));
  function stop() {
    generation++;
    animations.forEach(animation => animation.cancel());
    animations.clear();
    overlay.classList.remove('is-playing');
  }
  function animate(element, frames, options) {
    const animation = element.animate(frames, options);
    animations.add(animation);
    animation.finished.catch(() => {}).finally(() => animations.delete(animation));
    return animation;
  }
  const frame = (x, y, rotate, scale, opacity, offset) => ({
    transform: 'translate(calc(-50% + ' + x + 'px),calc(-50% + ' + y + 'px)) rotate(' + rotate + 'deg) scale(' + scale + ')',
    opacity, offset
  });
  const paths = {
    plane: [frame(-360,90,-20,.7,0,0),frame(-60,-8,3,1,1,.3),frame(60,-20,-4,1,1,.65),frame(440,-180,13,.75,0,1)],
    camera: [frame(160,100,14,.7,0,0),frame(0,0,-5,1,1,.3),frame(0,-5,4,1.04,1,.5),frame(0,0,-2,1,1,.7),frame(-130,-60,-12,.65,0,1)],
    traveler: [frame(270,70,12,.8,0,0),frame(15,-12,-4,1,1,.35),frame(-20,3,2,1,1,.68),frame(-340,-70,-8,.8,0,1)],
    delivery: [frame(-260,60,-13,.8,0,0),frame(-50,-30,8,1,1,.27),frame(0,10,-3,1,1,.43),frame(30,-15,5,1,1,.64),frame(290,50,13,.85,0,1)]
  };
  async function enter(section) {
    stop();
    if (disabled()) return;
    const ticket = generation;
    const {kind, asset} = loaded.get(section.id);
    // Wait at most 250 ms: a slow image must never delay the actual content.
    try { await Promise.race([asset.decode(), new Promise(resolve => setTimeout(resolve, 250))]); } catch { return; }
    if (ticket !== generation || disabled() || !asset.complete || !asset.naturalWidth) return;
    image.src = asset.src;
    overlay.classList.add('is-playing');
    const duration = 1550;
    const options = {duration, easing:'ease-in-out', fill:'both'};
    const travel = animate(character, paths[kind], options);
    animate(overlay.querySelector('.cut-in-ribbon'), [
      {opacity:0,transform:'translateX(-100%) rotate(-9deg)',offset:0},
      {opacity:.9,transform:'translateX(0) rotate(-9deg)',offset:.3},
      {opacity:.6,transform:'translateX(10%) rotate(-9deg)',offset:.65},
      {opacity:0,transform:'translateX(100%) rotate(-9deg)',offset:1}
    ], options);
    overlay.querySelectorAll('.cut-in-spark').forEach((spark, index) => animate(spark, [
      {opacity:0,scale:.4,rotate:'-30deg'},
      {opacity:.9,scale:1.2,rotate:'20deg',offset:.4},
      {opacity:0,scale:.7,rotate:'60deg'}
    ], {duration:1000,delay:200+index*120,fill:'both'}));
    // Reveal the actual module under the departing character, without changing layout.
    animate(section, [
      {opacity:.35,translate:'0 22px'}, {opacity:1,translate:'0 0'}
    ], {duration:800,delay:220,easing:'cubic-bezier(.2,.7,.2,1)',fill:'backwards'});
    try { await travel.finished; } catch { return; }
    if (ticket === generation) stop();
  }
  const sections = definitions.map(([id]) => document.getElementById(id)).filter(Boolean);
  const visible = new Set();
  const observer = new IntersectionObserver(changes => {
    changes.forEach(({target,isIntersecting}) => isIntersecting ? visible.add(target) : visible.delete(target));
    // The central viewport band picks one module, even during a fast anchor jump.
    const candidate = [...visible].sort((a,b) =>
      Math.abs(a.getBoundingClientRect().top - innerHeight*.35) -
      Math.abs(b.getBoundingClientRect().top - innerHeight*.35)
    )[0];
    if (!candidate) { if (activeSection) stop(); activeSection = null; return; }
    if (candidate === activeSection) return;
    activeSection = candidate;
    enter(candidate);
  }, {rootMargin:'-20% 0px -45% 0px',threshold:0});
  sections.forEach(section => observer.observe(section));
  // Cancel immediately when motion is paused; resuming doesn't replay unexpectedly.
  new MutationObserver(() => { if (disabled()) stop(); }).observe(document.body,{attributes:true,attributeFilter:['class']});
  reduced.addEventListener('change', () => { if (disabled()) stop(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
})();
