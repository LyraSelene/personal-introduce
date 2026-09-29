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
    const close = button('×', () => dialog.close(), 'dialog-x'); close.setAttribute('aria-label','关闭');
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
    submit(f,'保存心事');const out=status(f);
    f.addEventListener('submit',e=>{e.preventDefault();busy(f,out,async()=>{
      if(!title.value.trim()||!body.value.trim())throw Error('标题和正文不能只有空白。');
      const payload={title:title.value.trim(),body:body.value.trim(),category:category.value,published:published.checked};
      const req=post?db.from('journal_posts').update(payload).eq('id',post.id):db.from('journal_posts').insert(payload);
      check(await req.select('id').single());d.close();showToast('心事已保存。');await fetchJournal();
    });});
  }
  function adminDialog() {
    if(!owner)return;
    const d=modal('我的小小宇宙'),actions=node('div','system-actions');
    actions.append(button('编辑网站文字',()=>{d.close();editText();}),button('写一篇心事',()=>{d.close();editJournal();}),button('管理心事 / 草稿',()=>{d.close();journalManager();}),button('收到的来信',()=>{d.close();messageInbox(true);}));
    d.append(node('p','system-note','文字与心事保存后会同步到云端。草稿只有你可见；来信默认私密，你可以选择公开。'),actions);
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
  const intro=node('div','message-intro');intro.append(node('span','eyebrow','05 / SOMETHING YOU WANT TO TELL ME'),node('span','section-script','Letters to Me'),node('h2','','想对我说'),node('p','system-note','评价、建议，或一个想问的问题。你的来信默认只有你与我能看见；我可能将它连同你的昵称公开在这里，请勿填写联系方式等隐私。'));
  const messageActions=node('div','system-actions');messageActions.append(button('写一封来信 ↗',()=>sendMessage(),'primary'),button('查看我的来信',()=>{if(!user)authDialog();else messageInbox(false);}));
  const board=node('div','message-board'),boardStatus=node('p','system-status');boardStatus.setAttribute('role','status');
  const boardMore=button('再读一些来信',()=>loadPublicMessages(false));boardMore.hidden=true;
  section.append(intro,messageActions,board,boardStatus,boardMore);q('.closing').before(section);
  async function loadPublicMessages(reset=true) {
    if(!db){boardStatus.textContent='来信功能正在准备中。';return;}
    boardMore.disabled=true;
    try {const offset=reset?0:publicOffset;const rows=check(await db.rpc('public_messages',{page_offset:offset}));
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
    f.append(node('p','system-note','默认私密。站主可选择公开这封信及你的昵称，请避免写入个人隐私。'));
    const name=field(f,'希望我怎么称呼你','text','',40);name.required=true;
    const category=select(f,'这封信是',{review:'评价',suggestion:'建议',question:'提问'},'review');
    const body=field(f,'想对我说的话','textarea','',3000);body.required=true;
    submit(f,'寄出这封信');const out=status(f);
    f.addEventListener('submit',e=>{e.preventDefault();busy(f,out,async()=>{
      if(!name.value.trim()||!body.value.trim())throw Error('昵称和来信不能只有空白。');
      check(await db.from('visitor_messages').insert({display_name:name.value.trim(),category:category.value,body:body.value.trim()}).select('id').single());
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
    if(row.deleted_at){publish.disabled=true;f.append(node('p','system-note','这封信已收起。请先恢复，再选择公开。'));}
    submit(f,'保存回复与可见范围');const out=status(f);
    f.addEventListener('submit',e=>{e.preventDefault();busy(f,out,async()=>{check(await db.from('visitor_messages').update({reply:reply.value.trim(),published:!row.deleted_at&&publish.checked}).eq('id',row.id).select('id').single());d.close();showToast('已保存。');await loadPublicMessages();});});
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
