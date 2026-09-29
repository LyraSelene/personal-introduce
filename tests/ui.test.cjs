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
    rpc(name){return Promise.resolve({data:name==='is_site_owner'?isOwner:name==='message_consent_ready'?true:[],error:null});},
    from(table){let operation='select',payload;const filters=[],orders=[];let range;const chain={
      select(){return chain;},eq(...args){filters.push(args);return chain;},is(...args){filters.push(args);return chain;},order(...args){orders.push(args);return chain;},range(...args){range=args;return chain;},
      update(value){operation='update';payload=value;return chain;},insert(value){operation='insert';payload=value;return chain;},upsert(value){operation='upsert';payload=value;return chain;},
      single(){return chain;},
      then(resolve,reject){calls.push({table,operation,payload,filters,orders,range});return Promise.resolve({data:operation==='select'?(table==='journal_posts'?[post]:[]):{id:'saved'},error:null}).then(resolve,reject);}
    };return chain;}
  };
}
test('unconfigured website remains readable without pretend accounts or editable local notes',async()=>{
  const dom=page();const d=dom.window.document;
  assert.equal(d.querySelectorAll('#postcards .postcard').length,3);
  assert.equal(d.querySelector('#write-note').hidden,true);assert.equal(d.querySelector('#edit-note').hidden,true);
  d.querySelector('.account-dock button').click();assert.match(d.querySelector('.system-dialog').textContent,/准备中/);
  d.querySelector('.system-dialog').close();
  await tick();
  dom.window.close();
});
test('journal edits recover after close, warn before exit, survive failures and clear after cloud save',async()=>{
  const client=fakeClient(true),dom=page(client),w=dom.window,d=w.document;await tick();await tick();
  try{
    d.querySelector('#write-note').click();
    let editor=d.querySelector('.system-dialog'),form=editor.querySelector('form');
    form.querySelector('input[type=text]').value='A draft';form.querySelector('textarea').value='Keep my words';
    form.dispatchEvent(new w.Event('input',{bubbles:true}));
    const key='lime-journal-draft-v1:me:new';
    assert.equal(JSON.parse(w.localStorage.getItem(key)).values.body,'Keep my words');
    let prompts=0;w.confirm=()=>{prompts++;return false;};
    editor.querySelector('.dialog-x').click();assert.equal(editor.open,true);assert.equal(prompts,1);
    const cancel=new w.Event('cancel',{cancelable:true});editor.dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,true);assert.equal(editor.open,true);
    w.confirm=()=>true;editor.querySelector('.dialog-x').click();
    d.querySelector('#write-note').click();editor=d.querySelector('.system-dialog');
    assert.ok(editor.querySelector('.draft-recovery'));
    [...editor.querySelectorAll('button')].find(b=>b.textContent==='恢复暂存').click();
    form=editor.querySelector('form');assert.equal(form.querySelector('textarea').value,'Keep my words');
    const original=client.from;
    client.from=()=>({upsert(){return this;},select(){return this;},single(){return Promise.resolve({error:{message:'network unavailable'}});}});
    form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
    assert.equal(editor.open,true);assert.ok(w.localStorage.getItem(key));assert.match(form.textContent,/网络连接失败/);
    client.from=original;form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
    assert.equal(w.localStorage.getItem(key),null);assert.equal(editor.isConnected,false);
    assert.equal(client.calls.find(c=>c.operation==='upsert').payload.published,false);
  }finally{await tick();dom.window.close();}
});
test('sender chooses private by default; missing migration blocks delivery',async()=>{
  const client=fakeClient(false),dom=page(client),w=dom.window,d=w.document;await tick();await tick();
  try{
    const open=()=>[...d.querySelectorAll('.account-dock button')].find(b=>b.textContent==='写一封来信').click();
    open();let form=d.querySelector('.system-dialog form');
    form.querySelector('input').value='Visitor';form.querySelector('textarea').value='For you only';
    form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
    assert.equal(client.calls.find(c=>c.operation==='insert').payload.allow_public,false);
    open();form=d.querySelector('.system-dialog form');form.querySelector('input').value='Visitor';form.querySelector('textarea').value='May share';
    [...form.querySelectorAll('select')].at(-1).value='public';
    const rpc=client.rpc;client.rpc=()=>Promise.resolve({error:{message:'missing function'}});
    form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
    assert.equal(client.calls.filter(c=>c.operation==='insert').length,1);assert.match(form.textContent,/正在升级/);
    client.rpc=rpc;form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
    assert.equal(client.calls.filter(c=>c.operation==='insert').at(-1).payload.allow_public,true);
  }finally{await tick();dom.window.close();}
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
  assert.equal(client.calls.some(c=>c.operation==='update'),false);
  assert.equal(d.querySelector('.journal-preview script'),null);
  [...d.querySelectorAll('.journal-preview button')].find(b=>b.textContent==='确认公开').click();await tick();
  assert.equal(client.calls.find(c=>c.operation==='update').payload.published,true);
  // Open a private management dialog then sign out; the dialog and controls disappear.
  [...d.querySelectorAll('.account-dock button')].find(b=>b.textContent==='管理我的网站').click();
  [...d.querySelectorAll('.account-dock button')].find(b=>b.textContent==='退出').click();await tick();
  assert.equal(d.querySelector('.system-dialog'),null);assert.equal(d.querySelector('#write-note').hidden,true);
  dom.window.close();
});
test('recent updates open article and discussion submits linked private letter',async()=>{
  const client=fakeClient(false),dom=page(client),w=dom.window,d=w.document;await tick();await tick();
  try{
    const query=client.calls.find(c=>c.range?.[1]===2);
    assert.deepEqual(query.filters,[['published',true],['deleted_at',null]]);
    assert.equal(query.orders[0][0],'updated_at');
    const recent=d.querySelector('.recent-entry');assert.ok(recent);assert.equal(recent.querySelector('img'),null);recent.click();
    const article=d.querySelector('.system-dialog');
    [...article.querySelectorAll('button')].find(b=>b.textContent==='写下读后感 / 提问').click();
    const form=[...d.querySelectorAll('.system-dialog form')].at(-1);
    assert.match(form.querySelector('.discussion-context').textContent,/Hello/);
    form.querySelector('input').value='A reader';form.querySelector('textarea').value='This made me think';
    form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
    const inserted=client.calls.find(c=>c.operation==='insert').payload;
    assert.equal(inserted.journal_id,'post-1');assert.equal(inserted.allow_public,false);
    article.close();await tick();
  }finally{dom.window.close();}
});
test('ordinary account receives submission controls but no owner tools',async()=>{
  const dom=page(fakeClient(false));await tick();await tick();const d=dom.window.document;
  assert.doesNotMatch(d.querySelector('.account-dock').textContent,/管理我的网站/);
  assert.equal(d.querySelector('#write-note').hidden,true);
  [...d.querySelectorAll('.account-dock button')].find(b=>b.textContent==='写一封来信').click();
  assert.match(d.querySelector('.system-dialog').textContent,/默认私密/);
  assert.equal([...d.querySelectorAll('.system-dialog select')].at(-1).value,'private');
  d.querySelector('.system-dialog').close();await tick();
  dom.window.close();
});
