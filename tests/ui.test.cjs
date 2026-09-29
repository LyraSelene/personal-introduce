const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const { Script } = require('node:vm');
const tick = () => new Promise(resolve => setTimeout(resolve,25));
test('chapter links, keyboard and history retain one visible chapter without intercepting forms',async()=>{
  const dom=page(),w=dom.window,d=w.document;
  const active=()=>[...d.querySelectorAll('.chapter-page')].filter(p=>!p.hidden);
  assert.equal(active().length,1);assert.equal(active()[0].dataset.chapter,'home');
  assert.equal(d.querySelectorAll('.chapter-nav a').length,6);
  d.querySelector('.cream-button').click();
  assert.equal(active()[0].dataset.chapter,'about');assert.equal(w.location.hash,'#about');
  const about=active()[0];about.scrollTop=120;
  about.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(active()[0].dataset.chapter,'feelings');assert.equal(about.inert,true);
  w.history.back();await tick();
  assert.equal(active()[0].dataset.chapter,'about');assert.equal(about.scrollTop,120);
  const input=d.createElement('input');about.append(input);
  input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(active()[0].dataset.chapter,'about');
  const dialog=d.querySelector('dialog');dialog.open=true;
  about.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(active()[0].dataset.chapter,'about');dialog.open=false;
  d.querySelector('.chapter-nav a[href="#messages"]').click();
  assert.equal(active()[0].dataset.chapter,'messages');assert.ok(active()[0].querySelector('.footer'));
  assert.equal(d.querySelectorAll('.chapter-nav [aria-current="page"]').length,1);
  dom.window.close();
});
function page(client) {
  const dom = new JSDOM(readFileSync('index.html','utf8'), {url:'https://sixmonth12.github.io/personal-introduce/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  w.matchMedia=()=>({matches:false,addEventListener(){}});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;},set(t){this.textContent=t;}});
  new Script(readFileSync('script.js','utf8')).runInContext(dom.getInternalVMContext());
  if(client){w.LIME_CONFIG={supabaseUrl:'https://test.supabase.co',supabaseKey:'sb_publishable_test',siteUrl:w.location.href};w.supabase={createClient:()=>client};}
  new Script(readFileSync('system.js','utf8')).runInContext(dom.getInternalVMContext());
  new Script(readFileSync('chapters.js','utf8')).runInContext(dom.getInternalVMContext());
  return dom;
}
function fakeClient(isOwner) {
  let cb;
  const now='2026-09-27T01:00:00Z';
  const post={id:'post-1',title:'Hello <img src=x onerror=alert(1)>',body:'<script>evil()</script>',category:'self',published:true,created_at:now,updated_at:now};
  const calls=[];
  return {calls,
    auth:{onAuthStateChange(fn){cb=fn;setTimeout(()=>fn('INITIAL_SESSION',{user:{id:'me'},access_token:'one'}),0);},async signOut(){cb('SIGNED_OUT',null);return {data:{},error:null};}},
    rpc(name){return Promise.resolve({data:name==='is_site_owner'?isOwner:[],error:null});},
    from(table){let operation='select',payload;const chain={
      select(){return chain;},eq(){return chain;},is(){return chain;},order(){return chain;},range(){return chain;},
      update(value){operation='update';payload=value;return chain;},insert(value){operation='insert';payload=value;return chain;},upsert(value){operation='upsert';payload=value;return chain;},
      single(){return chain;},
      then(resolve,reject){calls.push({table,operation,payload});return Promise.resolve({data:operation==='select'?(table==='journal_posts'?[post]:[]):{id:'saved'},error:null}).then(resolve,reject);}
    };return chain;}
  };
}
test('unconfigured website remains readable without pretend accounts or editable local notes',()=>{
  const dom=page();const d=dom.window.document;
  assert.equal(d.querySelectorAll('#postcards .postcard').length,3);
  assert.equal(d.querySelector('#write-note').hidden,true);assert.equal(d.querySelector('#edit-note').hidden,true);
  d.querySelector('.account-dock button').click();assert.match(d.querySelector('.system-dialog').textContent,/准备中/);
  dom.window.close();
});
test('owner may edit a published entry without silently turning it into a draft; stored text is inert',async()=>{
  const client=fakeClient(true),dom=page(client),w=dom.window,d=w.document;await tick();await tick();
  assert.match(d.querySelector('.account-dock').textContent,/管理我的网站/);
  assert.equal(d.querySelector('#write-note').hidden,false);
  assert.equal(d.querySelector('#postcards img'),null);
  d.querySelector('#postcards .post-open').click();
  assert.match(d.querySelector('.system-dialog').textContent,/<script>evil/);assert.equal(d.querySelector('.system-dialog script'),null);
  [...d.querySelectorAll('.system-dialog button')].find(b=>b.textContent==='编辑这篇').click();
  assert.equal(d.querySelector('.system-dialog input[type=checkbox]').checked,true);
  const form=d.querySelector('.system-dialog form');form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  assert.equal(client.calls.find(c=>c.operation==='update').payload.published,true);
  // Open a private management dialog then sign out; the dialog and controls disappear.
  [...d.querySelectorAll('.account-dock button')].find(b=>b.textContent==='管理我的网站').click();
  [...d.querySelectorAll('.account-dock button')].find(b=>b.textContent==='退出').click();await tick();
  assert.equal(d.querySelector('.system-dialog'),null);assert.equal(d.querySelector('#write-note').hidden,true);
  dom.window.close();
});
test('ordinary account receives submission controls but no owner tools',async()=>{
  const dom=page(fakeClient(false));await tick();await tick();const d=dom.window.document;
  assert.doesNotMatch(d.querySelector('.account-dock').textContent,/管理我的网站/);
  assert.equal(d.querySelector('#write-note').hidden,true);
  [...d.querySelectorAll('.account-dock button')].find(b=>b.textContent==='写一封来信').click();
  assert.match(d.querySelector('.system-dialog').textContent,/默认私密/);
  assert.equal(d.querySelector('.system-dialog input[type=checkbox]'),null);
  dom.window.close();
});
