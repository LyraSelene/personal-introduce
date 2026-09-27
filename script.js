'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const articles = {
  myself: { category: '关于自己 / LETTER 001', title: '我想成为的人，还没有标准答案。', paragraphs: ['要介绍自己的时候，我反而常常不知道从哪里说起。爱好、正在做的事、几个形容词，好像都能说一点，却又不完全。', '我会认真地想一个问题，会反复修改一句话，也会在还没有结论的时候先把它记下来。有时觉得自己想得太多，有时又很庆幸，还有那么多事能让我好奇。', '现在的我，正在接触新的东西，也在慢慢分辨：哪些是自己真正喜欢的，哪些只是觉得应该喜欢。这个过程还没有答案，我想给它一点时间。', '如果你问我想成为怎样的人，我大概会说：希望能把在意的事做得认真一点，也能诚实地说出自己的感受。剩下的，以后再慢慢补充。'] },
  summer: { category: '日常碎片 / LETTER 002', title: '一些不必有用的，夏日收藏。', paragraphs: ['有些东西不必被装进待办清单：像窗边那一小块阳光，像汽水杯壁的水珠，像走到路口时刚好吹来的风。', '如果记忆有形状，它也许不是一份整齐的文档，而是口袋里几张折过角的纸。有的写了半句话，有的只是一个日期，旁边画着一颗歪歪扭扭的星星。', '我想给这些小事留一个位置。哪怕过了一阵子，已经想不起那天到底做了什么，至少还知道，有个瞬间值得停下来。', '下一次遇见喜欢的云，就把那一天写在这里。'] },
  detour: { category: '胡思乱想 / LETTER 003', title: '还没有答案，也可以先出发。', paragraphs: ['地图总是比真实的路整齐。那些在纸面上直接相连的地方，走起来可能要拐好几个弯，也可能会在路边碰见意想不到的风景。', '有时我也想把接下来的每一步都提前想好。可想得再仔细，真正走起来，还是会有新的问题，也会有新的喜欢。', '我想试着给生活留一点空白。有些选择可以边走边看，有些心情可以过一阵子再理解。没有写满的那一页，也属于这本日记。', '这一封信，留给还在路上的自己。等以后回来读，也许会有新的答案。'] }
};
const dialogs = $$('dialog');
function openDialog(dialog) { dialog.showModal(); document.body.classList.add('modal-open'); playEntrance(dialog, 0, 18); }
function closeDialog(dialog) { dialog.close(); }
dialogs.forEach(dialog => {
  $('.close-dialog', dialog).addEventListener('click', () => closeDialog(dialog));
  dialog.addEventListener('click', event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(dialog); });
  dialog.addEventListener('close', () => { if (!dialogs.some(item => item.open)) document.body.classList.remove('modal-open'); });
});
$$('[data-article]').forEach(button => button.addEventListener('click', () => {
  const article = articles[button.dataset.article];
  $('#reader-category').textContent = article.category;
  $('#reader-title').textContent = article.title;
  $('#reader-content').replaceChildren(...article.paragraphs.map(text => { const p = document.createElement('p'); p.textContent = text; return p; }));
  openDialog($('#reader-dialog'));
}));
$$('[data-filter]').forEach(button => button.addEventListener('click', () => {
  const category = button.dataset.filter;
  $$('[data-filter]').forEach(item => { const active = item === button; item.classList.toggle('selected', active); item.setAttribute('aria-pressed', active); });
  $$('[data-category]').forEach(card => { card.hidden = category !== 'all' && card.dataset.category !== category; });
  $('#filter-status').textContent = `显示${button.textContent.replace('04', '').trim()}：${$$('[data-category]').filter(card => !card.hidden).length} 条`;
}));
let toastTimer;
function showToast(text) { $('#toast').textContent = text; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500); }
$('#sky-switch').addEventListener('click', () => {
  const dusk = document.body.classList.toggle('dusk');
  $('#sky-switch').setAttribute('aria-pressed', dusk);
  $('#sky-switch').setAttribute('aria-label', dusk ? '切换为晴日天空' : '切换为日落天空');
  $('.sky-label').textContent = dusk ? '日落时分' : '今日晴';
  $('.sun-icon').textContent = dusk ? '☾' : '☀';
});
const bgm = $('#bgm');
const bgmToggle = $('#bgm-toggle');
const bgmLabel = $('.bgm-label', bgmToggle);
function syncBgm() {
  const playing = !bgm.paused;
  bgmToggle.classList.toggle('playing', playing);
  bgmToggle.setAttribute('aria-pressed', String(playing));
  bgmToggle.setAttribute('aria-label', playing ? '暂停背景音乐' : '播放背景音乐');
  bgmLabel.textContent = playing ? '正在播放' : '播放 BGM';
}
bgmToggle.addEventListener('click', async () => {
  if (bgm.paused) {
    try {
      await bgm.play();
      try { localStorage.setItem('lime-bgm-enabled-v1', 'true'); } catch { /* optional */ }
    } catch { showToast('音乐暂时无法播放，请检查网络或网易云链接。'); }
  } else {
    bgm.pause();
    try { localStorage.setItem('lime-bgm-enabled-v1', 'false'); } catch { /* optional */ }
  }
  syncBgm();
});
bgm.addEventListener('play', syncBgm);
bgm.addEventListener('pause', syncBgm);
bgm.addEventListener('error', () => { bgm.pause(); syncBgm(); showToast('音乐链接暂时不可用，网站其他内容仍可正常浏览。'); });
try { if (localStorage.getItem('lime-bgm-enabled-v1') === 'true') bgm.play().catch(() => {}); } catch { /* optional */ }
syncBgm();
$('#year').textContent = new Date().getFullYear();
const navigation = $$('.site-header nav a');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => { entries.forEach(entry => { if (entry.isIntersecting) navigation.forEach(link => { const active = link.hash === `#${entry.target.id}`; link.classList.toggle('active', active); if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); }); }); }, { rootMargin: '-10% 0px -60% 0px', threshold: 0 });
  ['home', 'about', 'feelings', 'journal'].forEach(id => observer.observe(document.getElementById(id)));
}

const feelingCards = {
  wonder: { symbol: '✳', caption: 'CURIOUS / 晴，有一点风', title: ['想知道，', '世界为什么这样运转。'], text: '遇见一个有意思的问题，我总想再往里走一点。比起立刻得到答案，那个“原来如此”的瞬间，常常更让我着迷。' },
  uncertain: { symbol: '☁', caption: 'WANDERING / 多云，方向未定', title: ['还不太确定，', '下一站会去哪里。'], text: '有时会想很多，有时也不知道该从哪一步开始。先把眼前的事做一点，再停下来看看，也许方向就是这样慢慢清楚的。' },
  hope: { symbol: '☀', caption: 'HOPEFUL / 云层之间，有光', title: ['还有好多事，', '想亲自去遇见。'], text: '想做出一个自己喜欢的小东西，想读到一句刚好懂我的话，也想在某个普通的日子，发现自己比从前多懂了一点。' }
};
$$('[data-feeling]').forEach(button => button.addEventListener('click', () => {
  const card = feelingCards[button.dataset.feeling];
  $$('[data-feeling]').forEach(item => { const selected = item === button; item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', selected); });
  $('#feeling-symbol').textContent = card.symbol;
  $('#feeling-caption').textContent = card.caption;
  $('#feeling-title').replaceChildren(document.createTextNode(card.title[0]), document.createElement('br'), document.createTextNode(card.title[1]));
  $('#feeling-text').textContent = card.text;
  playEntrance($('.feeling-display'), 0, 14);
}));

// 动画是渐进增强：JS 不可用时正文仍然可见，开场也会自行退出。
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let motionPaused = motionPreference.matches;
const entrances = new Set();
function playEntrance(element, delay = 0, distance = 38) {
  if (motionPaused || motionPreference.matches || !element.animate) return;
  // translate 与原有卡片旋转分开，避免入场和悬浮样式互相覆盖。
  const animation = element.animate([
    { opacity: 0, translate: `0 ${distance}px` },
    { opacity: 1, translate: '0 0' }
  ], { duration: 850, delay, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
  entrances.add(animation);
  animation.finished.catch(() => {}).finally(() => entrances.delete(animation));
}
function syncMotion() {
  document.body.classList.toggle('motion-paused', motionPaused);
  $('#motion-toggle').textContent = motionPaused ? '开启动效' : '暂停动效';
  $('#motion-toggle').setAttribute('aria-pressed', motionPaused);
  if (motionPaused) {
    entrances.forEach(animation => animation.cancel());
    entrances.clear();
    $('.arrival').hidden = true;
  }
}
$('#motion-toggle').addEventListener('click', () => {
  if (motionPreference.matches) { showToast('正在遵循设备的“减少动态效果”设置。'); return; }
  motionPaused = !motionPaused;
  syncMotion();
});
motionPreference.addEventListener('change', event => { motionPaused = event.matches; syncMotion(); });
syncMotion();
const arrival = $('.arrival');
arrival.addEventListener('animationend', event => { if (event.animationName === 'arrival-depart') arrival.hidden = true; });
document.addEventListener('keydown', event => { if (event.key === 'Escape' || event.key === 'Tab') arrival.hidden = true; });
if (location.hash && location.hash !== '#home') arrival.hidden = true;
if ('IntersectionObserver' in window) {
  const reveal = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      reveal.unobserve(entry.target);
      playEntrance(entry.target, Number(entry.target.dataset.delay || 0));
    });
  }, { threshold: .12 });
  $$('.about-illustration, .about-copy, .section-heading, .feeling-picker, .feeling-display, .small-likes, .postcard, .pocket-note, .letter-paper, .closing').forEach(element => reveal.observe(element));
  $$('.postcard').forEach((element, index) => { element.dataset.delay = index * 110; });
}
