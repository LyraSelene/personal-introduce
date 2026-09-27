'use strict';
(() => {
  if (!('IntersectionObserver' in window) || !Element.prototype.animate) return;
  const definitions = [
    ['about', 'plane', 'paper-plane.webp'],
    ['feelings', 'camera', 'camera.webp'],
    ['journal', 'traveler', 'traveler.webp'],
    ['letter', 'delivery', 'delivery.webp']
  ];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const disabled = () => reduced.matches || document.body.classList.contains('motion-paused');
  const overlay = document.createElement('div');
  overlay.className = 'chapter-cut-in';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = '<div class="cut-in-character"><img alt=""></div><span class="cut-in-spark">✧</span><span class="cut-in-spark">✳</span>';
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
    plane: [frame(-35,18,-6,.94,0,0),frame(-8,-3,1,1,.78,.32),frame(8,-8,-1,1,.78,.64),frame(36,-26,3,.96,0,1)],
    camera: [frame(12,22,4,.96,0,0),frame(0,0,-2,1,.78,.32),frame(0,-3,2,1,.78,.6),frame(4,-12,0,.98,0,1)],
    traveler: [frame(18,22,3,.95,0,0),frame(0,-4,-1,1,.78,.32),frame(-4,0,1,1,.78,.64),frame(-12,-18,-2,.98,0,1)],
    delivery: [frame(-18,20,-4,.95,0,0),frame(-5,-5,2,1,.78,.32),frame(0,2,-1,1,.78,.52),frame(4,-3,1,1,.7,.72),frame(18,-10,2,.98,0,1)]
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
    overlay.dataset.character = kind;
    // A small illustration near the section's outer edge, never a fullscreen wipe.
    const bounds = section.getBoundingClientRect();
    const small = innerWidth <= 760;
    const radius = small ? 70 : 110;
    const x = Math.min(innerWidth - radius + 10, bounds.right - (small ? 30 : 20));
    const y = Math.max(radius + 30, Math.min(innerHeight - radius - 30, bounds.top + (small ? 115 : 160)));
    overlay.style.setProperty('--cut-x', x + 'px');
    overlay.style.setProperty('--cut-y', y + 'px');
    overlay.classList.add('is-playing');
    const duration = 2300;
    const options = {duration, easing:'ease-in-out', fill:'both'};
    const travel = animate(character, paths[kind], options);
    overlay.querySelectorAll('.cut-in-spark').forEach((spark, index) => animate(spark, [
      {opacity:0,scale:.8,rotate:'-8deg'},
      {opacity:.35,scale:1,rotate:'8deg',offset:.4},
      {opacity:0,scale:.9,rotate:'16deg'}
    ], {duration:1700,delay:200+index*120,fill:'both'}));
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
