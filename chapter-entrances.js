'use strict';
(() => {
  const entries = [...document.querySelectorAll('.chapter-entry')];
  if (!('IntersectionObserver' in window)) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const paused = () => reduceMotion.matches || document.body.classList.contains('motion-paused');
  const inView = new Set();
  const observer = new IntersectionObserver(changes => {
    changes.forEach(({ target, isIntersecting, intersectionRatio }) => {
      if (isIntersecting && intersectionRatio >= .25) {
        inView.add(target);
        if (!paused()) target.classList.add('is-active');
      } else if (!isIntersecting) {
        inView.delete(target);
        target.classList.remove('is-active');
      }
    });
  }, { threshold: [0, .25] });
  entries.forEach(entry => observer.observe(entry));
  // Reuse the site's motion control; only replay after fully leaving the viewport.
  const sync = () => entries.forEach(entry => {
    entry.classList.toggle('is-active', !paused() && inView.has(entry));
  });
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  reduceMotion.addEventListener('change', sync);
})();
