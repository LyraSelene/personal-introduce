'use strict';
window.createLimeBlog=function(api){
  const {db,config,images,node,button,modal,field,select,checkbox,status,check,busy,errorText,date,identity}=api;
  const q=s=>document.querySelector(s),categories={tech:'技术',ai:'AI',notes:'随笔'};
  const list=q('#blog-list'),out=q('#blog-status'),more=q('#blog-more'),write=q('#blog-write');
  if(!list)return null;
  if(window.LimePublicReading)out.after(node('p','system-note',`公开阅读副本 · 更新于 ${date(window.LimePublicReading.exportedAt)}`));
  let offset=0,query='',category='all',request=0,route=0;
  const tags=value=>String(value||'').split(/[,，]/).map(s=>s.trim()).filter(Boolean).slice(0,10);
  const useStatic=()=>!!window.LimePublicReading&&!identity().owner;
  function failure(e){return ['PGRST202','PGRST205','42P01'].includes(e?.code)?'博客正在准备中。站主需先执行 migration-blog.sql，再刷新页面。':errorText(e);}
  function requireOwner(){if(!identity().owner)throw Error('请使用站主账号登录。');}
  async function ready(){if(!db)throw Error('博客尚未连接数据库。');const r=await db.rpc('blog_ready');if(r.error)throw r.error;if(r.data!==true)throw Error('请先执行博客数据库迁移。');}
  function chips(value){const el=node('div','blog-card-tags');tags(value).forEach(t=>el.append(node('span','',t)));return el;}
  function content(d,post){
    d.append(node('p','blog-reader-meta',`${categories[post.category]||'随笔'} · 写于 ${date(post.created_at||new Date())}`));
    const cover=images.render(post.image_data,'博客封面');if(cover)d.append(cover);
    const body=node('div','blog-reader-body');body.append(node('p','',post.body));d.append(body,chips(post.tags));
  }
  async function load(reset=true){
    const ticket=++request;if(!db&&!useStatic()){out.textContent='博客尚未连接数据库，其他页面仍可浏览。';return;}
    const start=reset?0:offset;more.disabled=true;out.textContent='正在翻开博客…';
    try{
      const rows=useStatic()?window.LimePublicReading.list('blogs',{query,category,offset:start}):check(await db.rpc('public_blog_posts',{search_query:query,category_filter:category,page_offset:start}));
      if(ticket!==request)return;
      if(reset)list.replaceChildren();
      rows.forEach(post=>{
        const card=node('article','blog-card'),open=button('',()=>read(post),'blog-card-button');
        const cover=images.render(post.image_data,'博客封面','blog-card-cover');if(cover)card.append(cover);
        const meta=node('div','blog-card-kicker');meta.append(node('b','',categories[post.category]),node('span','',date(post.created_at)));
        open.append(node('h3','',post.title));
        card.append(meta,open,node('p','blog-card-excerpt',post.excerpt||post.body.slice(0,140)),chips(post.tags),button('阅读全文 ↗',()=>read(post),'blog-card-link'));list.append(card);
      });offset=start+rows.length;more.hidden=rows.length<12;more.textContent='加载更多';delete more.dataset.retry;
      out.textContent=offset?`已显示 ${offset} 篇博客`:'还没有符合条件的文章。';
    }catch(e){if(ticket!==request)return;out.textContent=failure(e);more.hidden=false;more.textContent='重新加载';more.dataset.retry=String(reset);}
    finally{if(ticket===request)more.disabled=false;}
  }
  function read(post){
    const d=modal(post.title);d.classList.add('journal-reader','blog-reader');d.dataset.readingBlog=post.id;content(d,post);
    const actions=node('div','system-actions');
    if(post.published&&!post.deleted_at)actions.append(button('分享文章',()=>{
      const url=new URL(config.siteUrl||location.href);url.search='';url.searchParams.set('blog',post.id);url.hash='blog';
      const share=modal('分享这篇博客');const input=field(share,'复制文章链接','text',url.href);input.readOnly=true;const feedback=status(share);
      share.append(button('复制链接',async()=>{try{await navigator.clipboard.writeText(url.href);feedback.textContent='链接已复制。';}catch{input.focus();input.select();feedback.textContent='请复制选中的链接。';}}));
    }));
    if(identity().owner)actions.append(button('编辑文章',()=>{d.close();edit(post);}));d.append(actions);
  }
  async function openShared(){
    const id=new URLSearchParams(location.search).get('blog'),ticket=++route;
    if(!id||location.hash!=='#blog'||(!db&&!useStatic()))return;
    if([...document.querySelectorAll('[data-reading-blog]')].some(d=>d.dataset.readingBlog===id))return;
    try{
      const post=useStatic()?window.LimePublicReading.detail('blogs',id):check(await db.from('blog_posts').select('*').eq('id',id).eq('published',true).is('deleted_at',null).single());
      if(ticket!==route)return;if(!post)throw Error('文章已收起或不存在。');read(post);
    }catch(e){if(ticket!==route)return;const d=modal('这篇博客暂不可读');d.append(node('p','system-note',failure(e)));d.append(button('重试',()=>{d.close();openShared();}));}
  }
  function edit(post){
    requireOwner();const account=identity().user.id;
    const d=modal(post?'编辑博客':'写一篇博客'),f=node('form','system-form');d.append(f);
    const title=field(f,'标题','text',post?.title||'',160);title.required=true;
    const excerpt=field(f,'摘要（可选）','textarea',post?.excerpt||'',500);excerpt.rows=2;
    const cat=select(f,'分类',categories,post?.category||'tech');
    const tag=field(f,'标签（逗号分隔，最多 10 个）','text',post?.tags||'',300);
    const body=field(f,'正文（纯文字，保留换行与代码缩进）','textarea',post?.body||'',50000);body.rows=14;body.required=true;
    const picture=images.picker(f,post?.image_data);
    const published=checkbox(f,'公开发布（不勾选则保存为草稿）',post?.published||false);
    const feedback=status(f),actions=node('div','system-actions');f.append(actions);
    let writing=false,saved=false,preview=null;
    const snapshot=()=>JSON.stringify([title.value,excerpt.value,cat.value,tag.value,body.value,picture.value,published.checked]);
    const baseline=snapshot(),dirty=()=>!saved&&baseline!==snapshot();
    function beforeLeave(e){if(dirty()){e.preventDefault();e.returnValue='';}}
    window.addEventListener('beforeunload',beforeLeave);
    d.requestExit=()=>{
      if(writing)return;
      if(!dirty()){d.close();return;}
      const confirm=modal('保留这篇未保存的博客？');confirm.append(node('p','system-note','这篇博客还没有保存到云端。关闭编辑器会丢失本次修改。'));
      confirm.append(button('继续编辑',()=>confirm.close(),'primary'),button('放弃修改',()=>{confirm.close();d.close();},'danger'));
    };
    d.addEventListener('close',()=>{picture.dispose();window.removeEventListener('beforeunload',beforeLeave);preview?.close();});
    function payload(){
      picture.assertReady();if(!title.value.trim()||!body.value.trim())throw Error('标题和正文不能为空。');
      return {title:title.value.trim(),excerpt:excerpt.value.trim(),body:body.value,category:cat.value,tags:tags(tag.value).join(', '),published:published.checked,image_data:picture.value};
    }
    async function save(value){
      if(writing)return;writing=true;
      const target=preview||d,output=preview?preview.querySelector('.system-status'):feedback;
      await busy(target,output,async()=>{
        requireOwner();if(identity().user.id!==account)throw Error('账号已变化，请重新打开编辑器。');await ready();
        requireOwner();if(!d.isConnected||identity().user.id!==account)throw Error('编辑会话已结束，请重新打开编辑器。');
        const req=post?db.from('blog_posts').update(value).eq('id',post.id).eq('updated_at',post.updated_at):db.from('blog_posts').insert(value);
        const result=check(await req.select('id').single());if(!result)throw Error('保存未完成，文章可能已被修改，请先复制正文。');
        if(!d.isConnected||identity().user?.id!==account)return;
        saved=true;preview?.close();d.close();showToast(value.published?'博客已发布。':'博客草稿已保存。');load();
      });writing=false;
    }
    function showPreview(value,confirmSave){
      if(preview||writing)return;
      preview=modal(confirmSave?'确认发布博客':'博客预览');preview.classList.add('journal-reader','blog-reader');
      preview.append(node('h3','',value.title));content(preview,{...value,created_at:post?.created_at});status(preview);
      preview.append(button('返回编辑',()=>preview.close()));
      if(confirmSave)preview.append(button('确认发布',()=>save(value),'primary'));
      preview.requestExit=()=>{if(!writing)preview.close();};
      preview.addEventListener('close',()=>{preview=null;},{once:true});
    }
    actions.append(button('预览',()=>{try{showPreview(payload(),false);}catch(e){feedback.textContent=failure(e);}}));
    const submit=button('保存博客',()=>{},'primary');submit.type='submit';actions.append(submit);
    f.addEventListener('submit',event=>{event.preventDefault();if(writing)return;try{const value=payload();if(value.published)showPreview(value,true);else save(value);}catch(e){feedback.textContent=failure(e);}});
  }
  function manage(){
    requireOwner();const d=modal('博客 / 草稿 / 回收站'),items=node('div','manage-list'),feedback=status(d);
    d.append(button('写一篇博客',()=>{d.close();edit();},'primary'),items);
    let start=0;const next=button('加载更多',()=>fetchRows());d.append(next);
    async function fetchRows(){await busy(d,feedback,async()=>{
      const account=identity().user?.id;await ready();
      if(!d.isConnected||!identity().owner||identity().user?.id!==account)return;
      const rows=check(await db.from('blog_posts').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).range(start,start+19));
      if(!d.isConnected||!identity().owner||identity().user?.id!==account)return;
      rows.forEach(post=>{
        const card=node('article','manage-card');card.append(node('h3','',post.title),node('p','message-meta',`${post.deleted_at?'回收站':post.published?'已发布':'草稿'} · ${date(post.created_at)}`));
        const actions=node('div','system-actions');if(!post.deleted_at)actions.append(button('编辑',()=>{d.close();edit(post);}));
        actions.append(button(post.deleted_at?'恢复为草稿':'移入回收站',()=>{
          const confirm=modal(post.deleted_at?'恢复为草稿？':'移入回收站？'),message=status(confirm);
          confirm.append(node('p','system-note',post.deleted_at?'恢复后仅站主可见，重新发布后访客才能阅读。':'文章会从公开列表和分享链接中收起，可在回收站恢复。'));
          confirm.append(button('取消',()=>confirm.close()),button('确认',()=>busy(confirm,message,async()=>{
            requireOwner();check(await db.from('blog_posts').update({deleted_at:post.deleted_at?null:new Date().toISOString(),published:false}).eq('id',post.id).eq('updated_at',post.updated_at).select('id').single());
            confirm.close();d.close();load();manage();
          }),'primary'));
        }));card.append(actions);items.append(card);
      });start+=rows.length;next.hidden=rows.length<20;feedback.textContent=start?'':'还没有博客，先写一篇吧。';
    });}fetchRows();
  }
  write.addEventListener('click',()=>edit());
  const manageButton=button('管理博客 / 草稿',()=>manage());manageButton.hidden=true;write.after(manageButton);
  q('#blog-search').addEventListener('submit',e=>{e.preventDefault();query=q('#blog-search input').value.trim();load();});
  q('#blog-filters').addEventListener('click',e=>{const b=e.target.closest('[data-blog-category]');if(!b)return;category=b.dataset.blogCategory;q('#blog-filters').querySelectorAll('button').forEach(item=>{const active=item===b;item.classList.toggle('selected',active);item.setAttribute('aria-pressed',String(active));});load();});
  more.addEventListener('click',()=>load(more.dataset.retry==='true'));
  const shared=new URLSearchParams(location.search).get('blog');
  if(shared&&(!location.hash||location.hash==='#home'))history.replaceState(null,'',`${location.pathname}${location.search}#blog`);
  window.addEventListener('hashchange',openShared);window.addEventListener('popstate',openShared);
  load();openShared();
  return {manage,sessionChanged(){write.hidden=manageButton.hidden=!identity().owner;route++;document.querySelectorAll('[data-reading-blog]').forEach(d=>d.close());if(window.LimePublicReading)load();openShared();}};
};
