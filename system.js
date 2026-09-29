/* Supabase owns identity and permissions; this UI never assigns an owner role. */
(() => {
  'use strict';
  const q = s => document.querySelector(s);
  const config = window.LIME_CONFIG || {};
  const validConfig = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.supabaseUrl || '') && !!config.supabaseKey && !config.supabaseKey.startsWith('sb_secret_');
  const db = validConfig && window.supabase ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null;
  let user = null, owner = false, sessionVersion = 0, publicOffset = 0, journalOffset = 0;
  const categories = { self: '关于自己', life: '日常碎片', thoughts: '胡思乱想', review: '评价', suggestion: '建议', question: '提问' };
  const date = value => new Date(value).toLocaleString('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false });
  const node = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
  const button = (text, fn, cls = '') => { const el = node('button', `system-button ${cls}`, text); el.type = 'button'; el.addEventListener('click', fn); return el; };
  const status = parent => { const el = node('p','system-status'); el.setAttribute('role','status'); parent.append(el); return el; };
  function errorText(error) {
    const msg = error?.message || String(error);
    if (/Invalid login credentials/i.test(msg)) return '邮箱或密码不正确。';
    if (/Email not confirmed/i.test(msg)) return '请先点击邮箱中的验证链接，再登录。';
    if (/one minute/i.test(msg)) return '刚刚已经寄出一封，请过一分钟再试。';
    if (/Daily message/i.test(msg)) return '今天已经寄出 20 封来信，明天再来吧。';
    if (/rate limit/i.test(msg)) return '操作过于频繁，请稍后再试。';
    if (/fetch|network/i.test(msg)) return '网络连接失败，请稍后重试。内容尚未确认保存。';
    return `操作未完成：${msg}`;
  }
  function check(result) { if (result.error) throw result.error; return result.data; }
  async function consentReady() {
    const result=await db.rpc('message_consent_ready');
    if(result.error||result.data!==true)throw Error('来信授权功能正在升级，暂时不能寄信或公开来信，请稍后再试。');
  }
  async function busy(form, output, action) {
    if (form.dataset.busy) return;
    form.dataset.busy = 'true';
    const buttons = [...form.querySelectorAll('button')]; buttons.forEach(b => b.disabled = true);
    output.classList.remove('error'); output.textContent = '正在处理…';
    try { await action(); } catch (err) { output.textContent = errorText(err); output.classList.add('error'); }
    finally { delete form.dataset.busy; buttons.forEach(b => b.disabled = false); }
  }
  function modal(title) {
    const dialog = node('dialog','system-dialog');
    dialog.setAttribute('aria-label',title);
    const close = button('×', () => dialog.requestExit ? dialog.requestExit() : dialog.close(), 'dialog-x'); close.setAttribute('aria-label','关闭');
    dialog.addEventListener('cancel', event => { if (dialog.requestExit) { event.preventDefault(); dialog.requestExit(); } });
    dialog.append(close,node('span','system-kicker','LIME LETTERS / MY LITTLE WORLD'),node('h2','',title));
    document.body.append(dialog);
    dialog.addEventListener('close', () => { dialog.remove(); if (!document.querySelector('dialog[open]')) document.body.classList.remove('modal-open'); });
    dialog.showModal(); document.body.classList.add('modal-open'); return dialog;
  }
  function field(form, label, type = 'text', value = '', max = 0) {
    const wrapper = node('label','system-field',label);
    const input = node(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type; else input.rows = 5;
    if (max) input.maxLength = max;
    input.value = value; wrapper.append(input); form.append(wrapper); return input;
  }
  function select(form, label, options, value) {
    const wrapper = node('label','system-field',label), input = node('select');
    Object.entries(options).forEach(([key,text]) => { const option = node('option','',text); option.value = key; input.append(option); });
    input.value = value; wrapper.append(input); form.append(wrapper); return input;
  }
  function checkbox(form,label,value) {
    const wrap = node('label','system-check'), input = node('input'); input.type='checkbox'; input.checked=!!value;
    wrap.append(input,document.createTextNode(label)); form.append(wrap); return input;
  }
  function submit(form,text) { const b = button(text,()=>{},'primary'); b.type='submit'; form.append(b); return b; }
  function requireBackend() { if (db) return true; const d=modal('来信系统正在准备中'); d.append(node('p','system-note','网站仍可自由浏览。账号与来信功能将在后台连接完成后开放。')); return false; }

  // All editable values are plain text. Static decoration and markup stay local.
  const fields = new Map();
  function bind(key,label,selector) {
    const el=q(selector); if (!el) return;
    const original=el.innerText;
    fields.set(key,{label,read:()=>el.innerText,apply:value=>{el.textContent=value;el.classList.add('editable-copy');},original});
  }
  bind('hero.intro','首页 · 简介','.hero-copy > p');
  bind('hero.english','首页 · 英文副标题','.hero-english');
  document.querySelectorAll('#hero-title .hero-line').forEach((el,i)=>{
    fields.set(`hero.line${i+1}`,{label:`首页 · 标题第 ${i+1} 行`,read:()=>el.querySelector('.sr-only').textContent,original:el.querySelector('.sr-only').textContent,apply:value=>{
      const accessible=node('span','sr-only',value), visual=node('span'); visual.setAttribute('aria-hidden','true');
      [...value].forEach((char,j)=>{const c=node('span','letter-char',char);c.style.setProperty('--tilt',`${[-7,4,-3,6][j%4]}deg`);visual.append(c);}); el.replaceChildren(accessible,visual);
    }});
  });
  bind('about.name','关于我 · 相框介绍','.identity-card > strong');
  bind('about.caption','关于我 · 相框英文','.identity-caption');
  bind('about.state','关于我 · 此刻状态','.identity-bottom > span:last-child');
  bind('about.scribble','关于我 · 相框旁短句','.about-scribble');
  bind('about.title','关于我 · 标题','#about-title');
  document.querySelectorAll('.about-copy > p').forEach((el,i)=>bind(`about.p${i}`,`关于我 · 第 ${i+1} 段`,`.about-copy > p:nth-of-type(${i+1})`));
  document.querySelectorAll('.about-chips > span').forEach((el,i)=>bind(`about.tag${i}`,`关于我 · 标签 ${i+1}`,`.about-chips > span:nth-child(${i+1})`));
  bind('feelings.title','心情 · 标题','#feelings-title');
  bind('feelings.intro','心情 · 简介','#feelings .section-heading p');
  bind('feelings.footnote','心情 · 卡片脚注','.feeling-footnote');
  document.querySelectorAll('.small-likes > span').forEach((el,i)=>bind(`feelings.like${i}`,`心情 · 小喜好 ${i+1}`,`.small-likes > span:nth-child(${i+1})`));
  Object.entries(feelingCards).forEach(([key,card])=>{
    ['caption','title','text'].forEach(prop=>fields.set(`feeling.${key}.${prop}`,{label:`心情 · ${key==='wonder'?'好奇':key==='hope'?'期待':'方向'} · ${prop==='title'?'标题':prop==='text'?'正文':'天气'}`,read:()=>Array.isArray(card[prop])?card[prop].join('\n'):card[prop],original:Array.isArray(card[prop])?card[prop].join('\n'):card[prop],apply:value=>{card[prop]=prop==='title'?[value,'']:value;}}));
    bind(`feeling.${key}.label`,`心情 · ${key} 按钮`,`[data-feeling="${key}"] strong`);
  });
  bind('journal.title','心事 · 标题','#journal-title');
  bind('journal.intro','心事 · 简介','#journal .section-heading p');
  bind('pocket.text','口袋便签','#saved-note');
  bind('letter.title','给访客的信 · 标题','#letter-title');
  bind('letter.date','给访客的信 · 副标题','.letter-date');
  document.querySelectorAll('.letter-body p').forEach((el,i)=>bind(`letter.p${i}`,`给访客的信 · 第 ${i+1} 段`,`.letter-body p:nth-child(${i+1})`));
  bind('letter.signature','给访客的信 · 署名','.letter-signature > span');
  bind('closing.text','页尾 · 祝福','.closing > span');
  bind('closing.english','页尾 · 英文短句','.closing > p');
  q('#write-note').hidden=true; q('#edit-note').hidden=true; q('#note-dialog').remove();
  q('#write-note').textContent='写一篇心事 ↗'; q('#write-note').addEventListener('click',()=>editJournal());
  q('#edit-note').addEventListener('click',()=>editText('pocket.text'));
  const dock=node('aside','account-dock'); dock.setAttribute('aria-label','账号与管理'); document.body.append(dock);
  function renderAccount() {
    dock.replaceChildren();
    if (!user) dock.append(button('登录 / 注册',()=>authDialog()));
    else {
      dock.append(node('span','account-name',owner?'天空的记录者':'已登录的访客'));
      if(owner) dock.append(button('管理我的网站',adminDialog));
      else dock.append(button('我的来信',()=>messageInbox(false)));
      dock.append(button('退出',async()=>{ try { check(await db.auth.signOut()); } catch(e) {showToast(errorText(e));} }));
    }
    dock.append(button('写一封来信',()=>sendMessage()));
    q('#write-note').hidden=!owner; q('#edit-note').hidden=!owner;
  }
  function authDialog(mode='login') {
    if(!requireBackend())return;
    const d=modal(mode==='reset'?'设置新密码':mode==='signup'?'注册一个账号':mode==='recovery'?'找回密码':'欢迎回来');
    d.classList.add('auth-dialog');
    const greeting=node('span','auth-script',{login:'Welcome Back',signup:'Hello, You',recovery:'Find Your Way',reset:'A New Start'}[mode]);
    greeting.lang='en';
    d.querySelector('h2').before(greeting);
    const f=node('form','system-form'); d.append(f);
    let email,password;
    if(mode!=='reset') {email=field(f,'账号','email');email.required=true;email.autocomplete='email';}
    if(mode==='login'||mode==='signup'||mode==='reset') {password=field(f,mode==='reset'?'新密码（至少 10 位）':'密码（至少 10 位）','password');password.required=true;password.minLength=mode==='login'?1:10;password.autocomplete=mode==='login'?'current-password':'new-password';}
    submit(f,{login:'登录',signup:'注册并发送验证邮件',recovery:'发送重置邮件',reset:'保存新密码'}[mode]);
    const out=status(f);
    f.addEventListener('submit',e=>{e.preventDefault();busy(f,out,async()=>{
      const redirect=config.siteUrl;
      if(mode==='signup') {check(await db.auth.signUp({email:email.value.trim(),password:password.value,options:{emailRedirectTo:redirect}}));out.textContent='如果该邮箱可以注册，你会收到验证邮件。请前往邮箱确认后再登录。';}
      else if(mode==='recovery') {check(await db.auth.resetPasswordForEmail(email.value.trim(),{redirectTo:redirect}));out.textContent='如果该邮箱已注册，将收到密码重置邮件。请检查收件箱和垃圾邮件。';}
      else if(mode==='reset') {check(await db.auth.updateUser({password:password.value}));d.close();showToast('密码已更新。');}
      else {check(await db.auth.signInWithPassword({email:email.value.trim(),password:password.value}));d.close();showToast('欢迎回来。');}
    });});
    if(mode!=='reset') {const tabs=node('div','system-tabs');[['login','已有账号'],['signup','注册账号'],['recovery','忘记密码']].forEach(([m,t])=>{if(m!==mode)tabs.append(button(t,()=>{d.close();authDialog(m);}));});d.append(tabs);}
    d.append(node('p','system-note','访客账号可以寄送来信；网站正文和心事仅由站主管理。'));
  }
  async function loadText() {
    const rows=check(await db.from('site_text').select('key,value'));
    rows.forEach(row=>fields.get(row.key)?.apply(row.value));
    const active=q('[data-feeling].selected');if(active)active.click();
  }
  function editText(initial) {
    if(!owner)return;
    const d=modal('编辑网站文字'),f=node('form','system-form');d.append(f);
    const choice=select(f,'选择文字位置',Object.fromEntries([...fields].map(([k,v])=>[k,v.label])),initial||fields.keys().next().value);
    const input=field(f,'正文（纯文字，可换行）','textarea',fields.get(choice.value).read(),20000);input.rows=9;
    choice.addEventListener('change',()=>{input.value=fields.get(choice.value).read();});
    submit(f,'保存到网站');const out=status(f);
    f.addEventListener('submit',e=>{e.preventDefault();busy(f,out,async()=>{
      const key=choice.value,value=input.value;
      check(await db.from('site_text').upsert({key,value}).select('key').single());
      fields.get(key).apply(value);q('[data-feeling].selected')?.click();out.textContent='已保存，所有访客都会看到更新。';
    });});
  }
  const journalMore=button('再读一些心事',()=>fetchJournal(false));q('#postcards').after(journalMore);journalMore.hidden=true;
  const journalStatus=node('p','system-status');journalMore.after(journalStatus);journalStatus.setAttribute('role','status');
  async function fetchJournal(reset=true) {
    if(!db)return;
    journalMore.disabled=true;
    try {
      const offset=reset?0:journalOffset;
      const rows=check(await db.from('journal_posts').select('id,title,body,category,published,created_at,updated_at').eq('published',true).is('deleted_at',null).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+11));
      if(reset)q('#postcards').replaceChildren();
      rows.forEach(post=>{
        const article=node('article','postcard');article.dataset.category=post.category;
        const open=node('button','post-open');open.type='button';
        const art=node('span',`card-art system-journal-art ${post.category}`);art.append(node('span','','✳'),node('small','','A LITTLE LETTER'));
        const meta=node('span','card-meta',categories[post.category]);
        const time=node('time','post-date',`写于 ${date(post.created_at)}`);time.dateTime=post.created_at;
        open.append(art,meta,node('h3','',post.title),time,node('p','',post.body.slice(0,90)+(post.body.length>90?'…':'')),node('span','card-bottom','读这封信 ↗'));
        open.addEventListener('click',()=>{const d=modal(post.title);d.append(node('p','message-meta',`${categories[post.category]} · 写于 ${date(post.created_at)}`));const body=node('div','system-journal-body');body.append(node('p','',post.body));d.append(body);if(owner)d.append(button('编辑这篇',()=>{d.close();editJournal(post);}));});
        article.append(open);q('#postcards').append(article);
      });
      journalOffset=offset+rows.length;journalMore.hidden=rows.length<12;
      journalStatus.textContent=journalOffset?'':'还没有公开的心事，留一点空白给接下来的日子。';
      const filter=q('[data-filter].selected');filter?.click();
      q('[data-filter="all"] sup').textContent=String(journalOffset).padStart(2,'0');
    }catch(e){journalStatus.textContent=`心事暂时无法同步；原有静态手记仅供浏览。${errorText(e)}`;journalMore.hidden=false;journalMore.textContent='重试加载心事';}
    finally{journalMore.disabled=false;}
  }
  function editJournal(post) {
    if(!owner)return;
    const d=modal(post?'编辑心事':'写一篇心事'),f=node('form','system-form');d.append(f);
    if(post)d.append(node('p','message-meta',`写于 ${date(post.created_at)} · 更新于 ${date(post.updated_at)}`));
    const title=field(f,'标题','text',post?.title||'',120);title.required=true;
    const category=select(f,'分类',{self:'关于自己',life:'日常碎片',thoughts:'胡思乱想'},post?.category||'self');
    const body=field(f,'今天想记住什么？','textarea',post?.body||'',30000);body.required=true;body.rows=10;
    const published=checkbox(f,'公开给所有访客（不勾选则存为草稿）',post?.published||false);
    const draftStatus=node('p','system-note draft-status');draftStatus.setAttribute('role','status');f.append(draftStatus);
    const key=`lime-journal-draft-v1:${user.id}:${post?.id||'new'}`;
    const snapshot=()=>({title:title.value,body:body.value,category:category.value,published:published.checked});
    let baseline=JSON.stringify(snapshot()),saved=false,writing=false,pendingRecovery=false;
    let draftId=post?.id||crypto.randomUUID();
    const dirty=()=>JSON.stringify(snapshot())!==baseline;
    function persist(){
      if(saved)return true;
      if(pendingRecovery)return true;
      try {
        if(!dirty()){localStorage.removeItem(key);draftStatus.textContent='当前内容与打开时一致，没有未保存修改。';return true;}
        localStorage.setItem(key,JSON.stringify({version:1,id:draftId,baseUpdatedAt:post?.updated_at||null,values:snapshot(),savedAt:new Date().toISOString()}));
        draftStatus.textContent='已自动暂存在本机 · '+new Date().toLocaleTimeString('zh-CN')+'（尚未保存到云端）';return true;
      }catch{draftStatus.textContent='本机暂存失败，请保留窗口并保存到云端，或复制正文备份。';return false;}
    }
    draftStatus.textContent='编辑时自动暂存在当前浏览器；同一账号重新打开可恢复。共用设备请在保存后关闭。';
    try {
      const pending=JSON.parse(localStorage.getItem(key)||'null');
      if(pending?.version===1&&pending.values&&typeof pending.values.title==='string'&&typeof pending.values.body==='string'&&['self','life','thoughts'].includes(pending.values.category)){
        pendingRecovery=true;
        const restore=node('div','draft-recovery');
        restore.append(node('p','system-note',`找到 ${date(pending.savedAt)} 的本机暂存。${post&&pending.baseUpdatedAt!==post.updated_at?'云端内容已更新，请先确认暂存内容。':''}`));
        const controls=node('div','system-actions');
        // Do not overwrite an undisposed recovery copy with new typing.
        [...f.querySelectorAll('input,textarea,select')].forEach(el=>el.disabled=true);
        controls.append(button('恢复暂存',()=>{
          title.value=pending.values.title;body.value=pending.values.body;category.value=pending.values.category;published.checked=!!pending.values.published;
          if(!post&&/^[0-9a-f-]{36}$/i.test(pending.id))draftId=pending.id;
          pendingRecovery=false;[...f.querySelectorAll('input,textarea,select')].forEach(el=>el.disabled=false);restore.remove();persist();
        }),button('丢弃本机暂存',()=>{
          if(!window.confirm('确定丢弃这份本机暂存？云端心事不会改变。'))return;
          try{localStorage.removeItem(key);}catch{draftStatus.textContent='无法清理本机暂存，请检查浏览器存储设置。';return;}
          pendingRecovery=false;[...f.querySelectorAll('input,textarea,select')].forEach(el=>el.disabled=false);restore.remove();
        }));restore.append(controls);f.prepend(restore);
      }
    }catch{draftStatus.textContent='暂存无法读取；可以继续编辑并保存到云端。';}
    f.addEventListener('input',persist);f.addEventListener('change',persist);
    const unload=event=>{if(dirty()&&!saved){persist();event.preventDefault();event.returnValue='';}};
    const background=()=>{if(document.hidden)persist();};
    window.addEventListener('beforeunload',unload);document.addEventListener('visibilitychange',background);
    d.requestExit=()=>{
      if(writing){showToast('正在保存，请稍候再关闭。');return;}
      if(dirty()){
        const stored=persist();
        if(!window.confirm(stored?'内容尚未保存到云端，本机已暂存。确定关闭？':'暂存失败，关闭可能丢失修改。确定关闭？'))return;
      }d.close();
    };
    d.addEventListener('close',()=>{persist();window.removeEventListener('beforeunload',unload);document.removeEventListener('visibilitychange',background);});
    submit(f,'保存心事');const out=status(f);
    function getPayload(){
      if(!title.value.trim()||!body.value.trim())throw Error('标题和正文不能只有空白。');
      return {title:title.value.trim(),body:body.value.trim(),category:category.value,published:published.checked};
    }
    async function save(payload,preview){
      const container=preview||f,output=preview?status(preview):out;
      await busy(container,output,async()=>{
        if(!owner||!user)throw Error('请重新登录站主账号后保存。');
        writing=true;
        const inputs=[...f.querySelectorAll('input,textarea,select,button')];inputs.forEach(el=>el.disabled=true);
        try{
          // Reuse the draft ID after uncertain network failures to avoid duplicate new posts.
          let req=post?db.from('journal_posts').update(payload).eq('id',post.id).eq('updated_at',post.updated_at):db.from('journal_posts').upsert({id:draftId,...payload},{onConflict:'id'});
          const result=await req.select('id').single();
          if(result.error?.code==='PGRST116')throw Error('云端版本已更新或心事已移除。请复制当前正文，重新打开最新心事再编辑；本机暂存已保留。');
          check(result);saved=true;baseline=JSON.stringify(snapshot());
          try{localStorage.removeItem(key);}catch{showToast('云端已保存，但本机暂存未能清理。');}
          preview?.close();d.close();showToast(payload.published?'心事已公开。':'草稿已保存到云端。');await fetchJournal();
        }finally{writing=false;inputs.forEach(el=>el.disabled=false);}
      });
    }
    function preview(payload){
      const p=modal('发布前预览');p.classList.add('journal-preview');
      p.append(node('h3','',payload.title),node('p','message-meta',`${categories[payload.category]} · ${post?'写于 '+date(post.created_at):'首次写入日期将在保存时记录'}`));
      const content=node('div','system-journal-body');content.append(node('p','',payload.body));p.append(content);
      p.append(node('p','system-note','确认后，这篇心事将对所有访客公开。'));
      const actions=node('div','system-actions');actions.append(button('返回编辑',()=>p.close()),button('确认公开',()=>save(payload,p),'primary'));p.append(actions);
      p.requestExit=()=>{if(!writing)p.close();};
      d.addEventListener('close',()=>p.close(),{once:true});
    }
    f.addEventListener('submit',e=>{e.preventDefault();
      if(writing||f.querySelector('.draft-recovery'))return;
      try{const payload=getPayload();persist();if(payload.published)preview(payload);else save(payload);}catch(error){out.textContent=errorText(error);out.classList.add('error');}
    });
  }
  function adminDialog() {
    if(!owner)return;
    const d=modal('我的小小宇宙'),actions=node('div','system-actions');
    actions.append(button('编辑网站文字',()=>{d.close();editText();}),button('写一篇心事',()=>{d.close();editJournal();}),button('管理心事 / 草稿',()=>{d.close();journalManager();}),button('收到的来信',()=>{d.close();messageInbox(true);}));
    d.append(node('p','system-note','文字与心事保存后会同步到云端。草稿只有你可见；来信默认私密，仅获发信人授权的来信可以公开。'),actions);
    d.append(button('把原有三篇手记导入为草稿',async()=>{
      const f=node('div');d.append(f);const out=status(f);
      await busy(d,out,async()=>{
        // Stable IDs make repeated imports harmless and leave edited drafts unchanged.
        const ids=['0a000000-0000-4000-8000-000000000001','0a000000-0000-4000-8000-000000000002','0a000000-0000-4000-8000-000000000003'];
        const rows=Object.values(articles).map((a,i)=>({id:ids[i],title:a.title,body:a.paragraphs.join('\n\n'),category:['self','life','thoughts'][i],published:false}));
        check(await db.from('journal_posts').upsert(rows,{onConflict:'id',ignoreDuplicates:true}));out.textContent='已导入草稿，日期为本次导入时间。已有内容不会被覆盖。';
      });
    }));
  }
  function journalManager() {
    if(!owner)return;
    const d=modal('心事与草稿'),list=node('div','manage-list');d.append(list);let offset=0;
    const out=status(d),more=button('加载更多',()=>load(false));d.append(more);
    async function load(reset=true) {
      await busy(d,out,async()=>{
        if(reset){offset=0;list.replaceChildren();}
        const rows=check(await db.from('journal_posts').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+19));
        rows.forEach(post=>{const card=node('article','manage-card');card.append(node('h3','',post.title),node('p','message-meta',`${post.deleted_at?'回收站':post.published?'已公开':'草稿'} · 写于 ${date(post.created_at)}`));
          const actions=node('div','system-actions');
          if(!post.deleted_at)actions.append(button('编辑',()=>{d.close();editJournal(post);}));
          actions.append(button(post.deleted_at?'恢复为草稿':'移入回收站',async()=>{
            await busy(card,out,async()=>{check(await db.from('journal_posts').update({deleted_at:post.deleted_at?null:new Date().toISOString(),published:false}).eq('id',post.id).select('id').single());card.remove();out.textContent=post.deleted_at?'已恢复为草稿，重新打开列表即可编辑。':'已移入回收站，可以恢复。';await fetchJournal();});
          },post.deleted_at?'':'danger'));card.append(actions);list.append(card);
        });offset+=rows.length;more.hidden=rows.length<20;out.textContent=offset?'':'还没有心事，可以先写一篇，或导入原有手记。';
      });
    }load();
  }

  const section=node('section','message-section section-wrap');section.id='messages';
  const intro=node('div','message-intro');intro.append(node('span','eyebrow','05 / SOMETHING YOU WANT TO TELL ME'),node('span','section-script','Letters to Me'),node('h2','','想对我说'),node('p','system-note','评价、建议，或一个想问的问题。默认仅你与我可见；只有你选择允许公开，我才可以将昵称、来信与回复展示在这里。'));
  const messageActions=node('div','system-actions');messageActions.append(button('写一封来信 ↗',()=>sendMessage(),'primary'),button('查看我的来信',()=>{if(!user)authDialog();else messageInbox(false);}));
  const board=node('div','message-board'),boardStatus=node('p','system-status');boardStatus.setAttribute('role','status');
  const boardMore=button('再读一些来信',()=>loadPublicMessages(false));boardMore.hidden=true;
  section.append(intro,messageActions,board,boardStatus,boardMore);q('.closing').before(section);
  async function loadPublicMessages(reset=true) {
    if(!db){boardStatus.textContent='来信功能正在准备中。';return;}
    boardMore.disabled=true;
    try {await consentReady();const offset=reset?0:publicOffset;const rows=check(await db.rpc('public_messages',{page_offset:offset}));
      if(reset)board.replaceChildren();rows.forEach(row=>board.append(messageCard(row)));
      publicOffset=offset+rows.length;boardMore.hidden=rows.length<20;boardStatus.textContent=publicOffset?'':'还没有公开的来信。私密的心意，会好好收下。';
    }catch(e){boardStatus.textContent=errorText(e);boardMore.hidden=false;boardMore.textContent='重试加载来信';}finally{boardMore.disabled=false;}
  }
  function messageCard(row) {
    const card=node('article','message-card');card.append(node('span','message-meta',`${categories[row.category]} · ${date(row.created_at)}`),node('h3','',row.display_name),node('p','',row.body));
    if(row.reply)card.append(node('p','message-reply',`我的回复\n${row.reply}`));return card;
  }
  function sendMessage() {
    if(!requireBackend())return;if(!user){authDialog();return;}
    const d=modal('给我写一封来信'),f=node('form','system-form');d.append(f);
    f.append(node('p','system-note','默认私密。选择允许公开后，站主才可公开昵称、原文和回复；允许公开不代表立即发布。'));
    const name=field(f,'希望我怎么称呼你','text','',40);name.required=true;
    const category=select(f,'这封信是',{review:'评价',suggestion:'建议',question:'提问'},'review');
    const body=field(f,'想对我说的话','textarea','',3000);body.required=true;
    const consent=select(f,'这封信的公开授权',{private:'仅给你看',public:'允许公开（含昵称、来信和回复）'},'private');
    submit(f,'寄出这封信');const out=status(f);
    f.addEventListener('submit',e=>{e.preventDefault();busy(f,out,async()=>{
      if(!name.value.trim()||!body.value.trim())throw Error('昵称和来信不能只有空白。');
      await consentReady();
      check(await db.from('visitor_messages').insert({display_name:name.value.trim(),category:category.value,body:body.value.trim(),allow_public:consent.value==='public'}).select('id').single());
      d.close();showToast('来信已私密送达。谢谢你愿意写给我。');
    });});
  }
  function messageInbox(manage) {
    if(!user||manage&&!owner)return;
    const d=modal(manage?'收到的来信':'我寄出的来信'),list=node('div','manage-list');d.append(list);let offset=0;
    const out=status(d),more=button('加载更多',()=>load(false));d.append(more);
    async function load(reset=true) {
      await busy(d,out,async()=>{
        if(reset){offset=0;list.replaceChildren();}
        let req=db.from('visitor_messages').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+19);
        if(!manage)req=req.eq('author_id',user.id).is('deleted_at',null);
        const rows=check(await req);rows.forEach(row=>{
          const card=messageCard(row);card.append(node('p','message-meta',row.deleted_at?'已收起':row.published?'已公开':'私密来信'));
          card.append(node('p','system-note',row.allow_public?'发信人允许公开':'仅给站主看 · 不允许公开'));
          if(manage){const actions=node('div','system-actions');actions.append(button('回复 / 设置公开',()=>{d.close();editMessage(row);}),button(row.deleted_at?'恢复为私密':'收起这封信',async()=>{
            await busy(card,out,async()=>{check(await db.from('visitor_messages').update({deleted_at:row.deleted_at?null:new Date().toISOString(),published:false}).eq('id',row.id).select('id').single());card.remove();out.textContent='状态已更新，重新打开列表可查看。';await loadPublicMessages();});
          }));card.append(actions);}list.append(card);
        });offset+=rows.length;more.hidden=rows.length<20;out.textContent=offset?'':'这里还没有来信。';
      });
    }load();
  }
  function editMessage(row) {
    if(!owner)return;
    const d=modal('回复这封来信');d.append(messageCard(row));const f=node('form','system-form');d.append(f);
    const reply=field(f,'我的回复','textarea',row.reply,5000);
    const publish=checkbox(f,'将来信、昵称和回复公开给所有访客',row.published);
    if(!row.allow_public){publish.checked=false;publish.disabled=true;f.append(node('p','system-note','发信人未授权公开，只能私密回复。旧来信也按未授权处理。'));}
    if(row.deleted_at){publish.disabled=true;f.append(node('p','system-note','这封信已收起。请先恢复，再选择公开。'));}
    submit(f,'保存回复与可见范围');const out=status(f);
    f.addEventListener('submit',e=>{e.preventDefault();busy(f,out,async()=>{await consentReady();check(await db.from('visitor_messages').update({reply:reply.value.trim(),published:!!row.allow_public&&!row.deleted_at&&publish.checked}).eq('id',row.id).select('id').single());d.close();showToast('已保存。');await loadPublicMessages();});});
  }
  async function syncSession(session) {
    const version=++sessionVersion;user=session?.user||null;owner=false;
    // Remove private content immediately when accounts change or sessions end.
    document.querySelectorAll('.system-dialog').forEach(d=>d.close());renderAccount();
    if(user)try{const result=check(await db.rpc('is_site_owner'));if(version!==sessionVersion)return;owner=result===true;}catch(e){showToast(errorText(e));}
    if(version===sessionVersion)renderAccount();
  }
  renderAccount();
  if(db){
    let currentToken;
    db.auth.onAuthStateChange((event,session)=>{
      // Supabase callbacks must not await queries while holding the auth lock.
      if(event==='TOKEN_REFRESHED')return;
      const token=session?.access_token||null;
      if(event!=='PASSWORD_RECOVERY'&&token===currentToken)return;
      currentToken=token;
      setTimeout(async()=>{await syncSession(session);if(event==='PASSWORD_RECOVERY')authDialog('reset');},0);
    });
    loadText().catch(e=>showToast(`文字暂未同步。${errorText(e)}`));fetchJournal();loadPublicMessages();
  }else{
    boardStatus.textContent='来信功能正在准备中，网站内容可正常浏览。';
    q('[data-filter="all"] sup').textContent='03';
  }
})();
