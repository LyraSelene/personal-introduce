/* Deployed public copy. Never includes private letters or drafts. */
window.LimePublicReading=(()=>{
  const snapshot=window.LIME_PUBLIC_SNAPSHOT;
  const labels={self:'关于自己',life:'日常碎片',thoughts:'胡思乱想',tech:'技术',ai:'AI',notes:'随笔'};
  function list(kind,{query='',category='all',offset=0,recent=false}={}){
    const search=query.trim().toLowerCase(),sort=recent||kind==='blogs'?'updated_at':'created_at';
    return snapshot[kind].filter(p=>p.published===true&&!p.deleted_at&&(category==='all'||p.category===category)&&(!search||[p.title,p.body,p.excerpt,p.tags,labels[p.category]].join(' ').toLowerCase().includes(search)))
      .sort((a,b)=>String(b[sort]).localeCompare(String(a[sort]))||b.id.localeCompare(a.id)).slice(offset,offset+(recent?3:12));
  }
  function detail(kind,id){const post=snapshot[kind].find(p=>p.id===id&&p.published===true&&!p.deleted_at);if(!post)throw Error('此公开版本没有这篇文章。');return {...post};}
  return snapshot?{list,detail,text:snapshot.text,exportedAt:snapshot.exportedAt}:null;
})();
