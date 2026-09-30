const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const { Script } = require('node:vm');
const tick = () => new Promise(resolve => setTimeout(resolve,25));

test('blog editor previews before publishing, preserves failed edits and guards exit',async()=>{
  const client=fakeClient(true),dom=page(client),w=dom.window,d=w.document;
  try{
    await tick();await tick();assert.equal(d.querySelector('#blog-write').hidden,false);
    d.querySelector('#blog-write').click();const editor=d.querySelector('dialog[aria-label="写一篇博客"]'),f=editor.querySelector('form');
    f.querySelector('input[type=text]').value='A technical note';
    f.querySelectorAll('textarea')[0].value='An excerpt';f.querySelectorAll('textarea')[1].value='  code\n<script>inert()</script>';
    f.querySelector('input[type=checkbox]').checked=true;
    editor.querySelector('.dialog-x').click();assert.ok(d.querySelector('dialog[aria-label="保留这篇未保存的博客？"]'));
    [...d.querySelectorAll('button')].find(b=>b.textContent==='继续编辑').click();assert.ok(editor.isConnected);
    f.dispatchEvent(new w.Event('submit',{cancelable:true}));
    let preview=d.querySelector('dialog[aria-label="确认发布博客"]');
    assert.ok(preview);assert.equal(preview.querySelector('.blog-reader-body p').textContent,'  code\n<script>inert()</script>');assert.equal(preview.querySelector('script'),null);
    assert.equal(client.calls.some(c=>c.table==='blog_posts'&&c.operation==='insert'),false);
    const rpc=client.rpc;client.rpc=name=>name==='blog_ready'?Promise.resolve({error:{message:'network failed'}}):rpc(name);
    [...preview.querySelectorAll('button')].find(b=>b.textContent==='确认发布').click();await tick();
    assert.match(preview.textContent,/网络连接失败/);assert.equal(f.querySelectorAll('textarea')[1].value,'  code\n<script>inert()</script>');
    client.rpc=rpc;[...preview.querySelectorAll('button')].find(b=>b.textContent==='确认发布').click();await tick();
    assert.equal(editor.isConnected,false);const saved=client.calls.find(c=>c.table==='blog_posts'&&c.operation==='insert');
    assert.equal(saved.payload.published,true);assert.equal(saved.payload.excerpt,'An excerpt');assert.equal(saved.payload.category,'tech');
  }finally{await tick();w.close();}
});

test('blog public list searches, paginates and retries a missing migration',async()=>{
  const client=fakeClient(false),rpc=client.rpc,calls=[];let missing=true;
  const post={id:'blog-1',title:'<img src=x>',body:'<script>bad()</script>',excerpt:'A note',category:'tech',tags:'SQL',published:true,created_at:'2026-09-01'};
  client.rpc=(name,args)=>{
    if(name!=='public_blog_posts')return rpc(name);
    calls.push(args);return Promise.resolve(missing?{error:{code:'PGRST202'}}:{data:args.page_offset?[]:Array.from({length:12},(_,i)=>({...post,id:`blog-${i}`}))});
  };
  const dom=page(client),w=dom.window,d=w.document;
  try{
    await tick();await tick();assert.equal(d.querySelector('#blog-write').hidden,true);assert.match(d.querySelector('#blog-status').textContent,/migration-blog.sql/);
    missing=false;d.querySelector('#blog-more').click();await tick();assert.equal(d.querySelectorAll('.blog-card').length,12);
    d.querySelector('.blog-card-button').click();assert.equal(d.querySelector('.blog-reader script'),null);assert.equal(d.querySelector('.blog-reader .blog-reader-body p').textContent,post.body);d.querySelector('.blog-reader').close();
    d.querySelector('#blog-more').click();await tick();assert.equal(calls.at(-1).page_offset,12);assert.equal(d.querySelector('#blog-more').hidden,true);
    d.querySelector('#blog-search input').value='SQL';d.querySelector('#blog-search').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
    assert.equal(calls.at(-1).search_query,'SQL');assert.equal(calls.at(-1).page_offset,0);
    d.querySelector('[data-blog-category="ai"]').click();await tick();assert.equal(calls.at(-1).category_filter,'ai');assert.equal(calls.at(-1).page_offset,0);
  }finally{await tick();w.close();}
});

test('shared blog opens independently of list and requires public nondeleted data',async()=>{
  const client=fakeClient(false),from=client.from,filters=[];
  const post={id:'old-blog',title:'Older post',body:'Still accessible',category:'notes',published:true,created_at:'2026-01-01'};
  client.from=table=>{
    if(table!=='blog_posts')return from(table);
    const chain={select(){return chain;},eq(...args){filters.push(args);return chain;},is(...args){filters.push(args);return chain;},single(){return Promise.resolve({data:post});}};return chain;
  };
  const dom=page(client,'https://sixmonth12.github.io/personal-introduce/?blog=old-blog#blog'),w=dom.window,d=w.document;
  try{
    await tick();await tick();assert.equal(d.querySelector('[data-reading-blog]').dataset.readingBlog,'old-blog');
    assert.ok(filters.some(([k,v])=>k==='published'&&v===true));assert.ok(filters.some(([k,v])=>k==='deleted_at'&&v===null));
    assert.equal(d.querySelector('.chapter-page:not([hidden])').dataset.chapter,'blog');
    assert.equal(d.querySelectorAll('[data-reading-blog]').length,1);
  }finally{await tick();w.close();}
});
test('image draft recovers into preview, survives failed save, and can be removed',async()=>{
  const client=fakeClient(true),dom=page(client),w=dom.window,d=w.document;await tick();await tick();
  try{
    const photo='data:image/png;base64,iVBORw0KGgo=';
    w.localStorage.setItem('lime-journal-draft-v1:me:new',JSON.stringify({version:1,id:'20000000-0000-4000-8000-000000000001',savedAt:'2026-01-01',values:{title:'Photo',body:'Memory',category:'life',published:true,image_data:photo}}));
    d.querySelector('#write-note').click();[...d.querySelectorAll('button')].find(b=>b.textContent==='恢复暂存').click();
    let f=d.querySelector('.system-form');assert.equal(f.querySelector('.image-picker img').src,photo);
    f.dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(d.querySelector('.journal-preview img').src,photo);
    const rpc=client.rpc;client.rpc=name=>name==='images_ready'?Promise.resolve({error:{code:'PGRST202'}}):rpc(name);
    [...d.querySelectorAll('.journal-preview button')].find(b=>b.textContent==='确认公开').click();await tick();
    assert.equal(client.calls.some(c=>c.operation==='upsert'),false);assert.match(d.querySelector('.journal-preview').textContent,/等待数据库升级/);assert.ok(w.localStorage.getItem('lime-journal-draft-v1:me:new'));
    d.querySelector('.journal-preview').close();f.querySelector('.image-picker button').click();assert.equal(f.querySelector('.image-picker img'),null);
    assert.equal(JSON.parse(w.localStorage.getItem('lime-journal-draft-v1:me:new')).values.image_data,null);
  }finally{await tick();dom.window.close();}
});

test('image picker rejects unsafe formats and cancels an in-flight selection when removed',async()=>{
  const dom=page(),w=dom.window,d=w.document;
  try{
    const box=d.createElement('div');d.body.append(box);const picker=w.LimeImages.picker(box);
    assert.equal(w.LimeImages.render('data:image/svg+xml;base64,AAAA'),null);
    const input=box.querySelector('input');Object.defineProperty(input,'files',{configurable:true,value:[new w.File(['x'],'bad.svg',{type:'image/svg+xml'})]});input.dispatchEvent(new w.Event('change'));await tick();
    assert.throws(()=>picker.assertReady(),/处理失败/);box.querySelector('button').click();picker.assertReady();
    let pendingImage;w.URL.createObjectURL=()=> 'blob:test';let revoked=false;w.URL.revokeObjectURL=()=>{revoked=true;};
    w.Image=class{constructor(){pendingImage=this;}set src(v){}get naturalWidth(){return 10;}get naturalHeight(){return 10;}};
    w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/webp;base64,AAAA';
    Object.defineProperty(input,'files',{configurable:true,value:[new w.File(['x'],'ok.png',{type:'image/png'})]});input.dispatchEvent(new w.Event('change'));
    assert.throws(()=>picker.assertReady(),/处理中/);box.querySelector('button').click();pendingImage.onload();await tick();
    assert.equal(picker.value,null);assert.equal(box.querySelector('img'),null);assert.equal(revoked,true);
  }finally{await tick();dom.window.close();}
});
test('chapter links, keyboard and history retain one visible chapter without intercepting forms',async()=>{
  const dom=page(),w=dom.window,d=w.document;
  const active=()=>[...d.querySelectorAll('.chapter-page')].filter(p=>!p.hidden);
  assert.equal(active().length,1);assert.equal(active()[0].dataset.chapter,'home');
  assert.equal(d.querySelectorAll('.chapter-nav a').length,7);
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
test('journal view switching preserves article nodes and opens the same full reader',async()=>{
  const client=fakeClient(false),dom=page(client),w=dom.window,d=w.document;await tick();await tick();
  try {
    const cards=d.querySelector('#postcards'),article=cards.querySelector('.postcard');
    const switches=[...d.querySelectorAll('.journal-view-switch button')];
    assert.equal(cards.dataset.view,'cards');
    const calls=client.calls.length;
    switches.find(b=>b.textContent==='列表').click();
    assert.equal(cards.dataset.view,'list');
    assert.equal(cards.querySelector('.postcard'),article);
    assert.equal(client.calls.length,calls);
    assert.equal(w.localStorage.getItem('lime-journal-view-v1'),'list');
    assert.equal(switches.filter(b=>b.getAttribute('aria-pressed')==='true').length,1);
    article.querySelector('.post-open').click();await tick();
    assert.ok(d.querySelector('.journal-reader[data-reading-journal="post-1"]'));
    assert.equal(d.querySelector('.journal-reader .system-journal-body p').textContent,'<script>evil()</script>');
    d.querySelector('.journal-reader .dialog-x').click();
    switches.find(b=>b.textContent==='卡片').click();
    assert.equal(cards.dataset.view,'cards');assert.equal(cards.querySelector('.postcard'),article);
  } finally { await tick();w.close(); }
});
function page(client,url='https://sixmonth12.github.io/personal-introduce/') {
  const dom = new JSDOM(readFileSync('index.html','utf8'), {url,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  w.matchMedia=()=>({matches:false,addEventListener(){}});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;},set(t){this.textContent=t;}});
  new Script(readFileSync('script.js','utf8')).runInContext(dom.getInternalVMContext());
  new Script(readFileSync('images.js','utf8')).runInContext(dom.getInternalVMContext());
  new Script(readFileSync('blog.js','utf8')).runInContext(dom.getInternalVMContext());
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
    rpc(name){if(name.endsWith('_images'))return Promise.resolve({error:{code:'PGRST202'}});return Promise.resolve({data:name==='is_site_owner'?isOwner:['message_consent_ready','images_ready','blog_ready'].includes(name)?true:[],error:null});},
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

test('search runs against all public content and share card copies title, excerpt and direct URL safely',async()=>{
  const client=fakeClient(false),rpc=client.rpc,requests=[];
  const post={id:'shared-post',title:'Old <img src=x>',body:'A complete searchable memory',category:'life',published:true,created_at:'2026-01-01',updated_at:'2026-01-01'};
  client.rpc=(name,args)=>{if(name==='search_journals'){requests.push(args);return Promise.resolve({data:args.search_query==='missing'?[]:[post]});}return rpc(name,args);};
  const dom=page(client),w=dom.window,d=w.document;await tick();await tick();
  try{
    const form=d.querySelector('.journal-search');form.querySelector('input').value='memory';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
    assert.equal(requests[0].search_query,'memory');assert.equal(d.querySelectorAll('#postcards .postcard').length,1);
    d.querySelector('#postcards .post-open').click();await tick();
    [...d.querySelectorAll('.system-dialog button')].find(b=>b.textContent==='分享这篇心事 ↗').click();
    const share=d.querySelector('.share-card');assert.ok(share);assert.equal(share.querySelector('img'),null);
    const link=new URL(share.querySelector('a').href);assert.equal(link.searchParams.get('journal'),'shared-post');assert.equal(link.hash,'#journal');
    assert.match(share.parentNode.querySelector('textarea').value,/Old <img src=x>\nA complete searchable memory/);
    [...d.querySelectorAll('.system-dialog')].forEach(dialog=>dialog.close());
    form.querySelector('input').value='missing';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
    assert.equal(d.querySelectorAll('#postcards .postcard').length,0);assert.match(d.querySelector('#filter-status').textContent,/没有找到/);
  }finally{dom.window.close();}
});

test('direct article URL fetches an old article independently from the first page and keeps readable navigation labels',async()=>{
  const client=fakeClient(false),original=client.from;let targeted=false;
  client.from=table=>{const chain=original(table);if(table==='journal_posts'){
    const eq=chain.eq;chain.eq=(key,value)=>{if(key==='id'&&value==='old-post')targeted=true;return eq(key,value);};
    chain.single=()=>Promise.resolve({data:{id:'old-post',title:'An old letter',body:'A memory',category:'life',published:true,created_at:'2025-01-01'}});
  }return chain;};
  const dom=page(client,'https://sixmonth12.github.io/personal-introduce/?journal=old-post#journal'),w=dom.window,d=w.document;await tick();await tick();
  try{
    assert.equal(targeted,true);assert.equal(d.querySelector('[data-reading-journal]').dataset.readingJournal,'old-post');
    assert.equal(d.querySelector('.chapter-nav [aria-current]').getAttribute('aria-label'),'心事');
    d.querySelector('.system-dialog').close();d.querySelector('.chapter-nav a[href="#home"]').click();
    assert.equal(new URL(w.location.href).searchParams.has('journal'),false);assert.equal(w.location.hash,'#home');await tick();
  }finally{dom.window.close();}
});

test('withdraw confirmation retains text on failure, erases it on success and removes public cached copy',async()=>{
  const client=fakeClient(false),original=client.from,rpc=client.rpc;
  const letter={id:'letter-1',display_name:'Reader',body:'Private original',reply:'Private reply',category:'review',created_at:'2026-01-01',allow_public:true};
  client.from=table=>{const chain=original(table);if(table==='visitor_messages')chain.then=(resolve,reject)=>Promise.resolve({data:[letter]}).then(resolve,reject);return chain;};
  let fail=true;client.rpc=(name,args)=>name==='withdraw_message'?Promise.resolve(fail?{error:{message:'network unavailable'}}:{data:true}):rpc(name,args);
  const dom=page(client),d=dom.window.document;await tick();await tick();
  try{
    [...d.querySelectorAll('.account-dock button')].find(b=>b.textContent==='我的来信').click();await tick();
    [...d.querySelectorAll('.system-dialog button')].find(b=>b.textContent==='撤回这封信').click();
    const confirm=[...d.querySelectorAll('.system-dialog')].at(-1);const action=[...confirm.querySelectorAll('button')].find(b=>b.textContent==='确认撤回');
    action.click();await tick();assert.equal(confirm.open,true);assert.match(d.querySelector('.message-body').textContent,/Private original/);
    fail=false;action.click();await tick();assert.equal(confirm.isConnected,false);assert.doesNotMatch(d.querySelector('.manage-list').textContent,/Private original|Private reply/);assert.match(d.querySelector('.manage-list').textContent,/已撤回/);
  }finally{dom.window.close();}
});

test('owner sees unread count before opening inbox and marks a letter read without changing its reply status',async()=>{
  const client=fakeClient(true),original=client.from,rpc=client.rpc;let unread=2;
  const letter={id:'letter-1',display_name:'Reader',body:'Hello',reply:'',category:'review',created_at:'2026-01-01',allow_public:false};
  client.rpc=(name,args)=>name==='unread_message_count'?Promise.resolve({data:unread}):rpc(name,args);
  client.from=table=>{const chain=original(table);if(table==='visitor_messages'){
    let updating=false;const update=chain.update;chain.update=value=>{updating=true;unread=1;return update(value);};
    const then=chain.then;chain.then=(resolve,reject)=>updating?then(resolve,reject):Promise.resolve({data:[letter]}).then(resolve,reject);
  }return chain;};
  const dom=page(client),d=dom.window.document;await tick();await tick();
  try{
    assert.equal(d.querySelector('.unread-badge').textContent,'2');d.querySelector('[data-owner-inbox]').click();await tick();
    [...d.querySelectorAll('.system-dialog button')].find(b=>b.textContent==='标为已读').click();await tick();
    assert.equal(d.querySelector('.unread-badge').textContent,'1');assert.equal(d.querySelector('.read-state').textContent,'已读');assert.equal(d.querySelector('.message-status').textContent,'等待回复');
  }finally{dom.window.close();}
});
