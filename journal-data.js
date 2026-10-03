/* Public reading only. Never persist article text or images in browser storage. */
window.createJournalData = function(db) {
  const textFields='id,title,body,category,published,created_at,updated_at';
  let compactAvailable;
  function check(result){if(result.error)throw result.error;return result.data;}
  async function summaries({query='',category='all',offset=0,recent=false}={}) {
    if(compactAvailable!==false){
      const result=await db.rpc('journal_summaries',{search_query:query,category_filter:category,page_offset:offset,recent_first:recent});
      if(!result.error){compactAvailable=true;return check(result);}
      if(result.error.code!=='PGRST202')throw result.error;
      compactAvailable=false;
    }
    // Older databases: exclude image_data; only the SQL upgrade can truncate body on the server.
    let rows;
    if(query)rows=check(await db.rpc('search_journals',{search_query:query,category_filter:category,page_offset:offset}));
    else {
      let req=db.from('journal_posts').select(textFields).eq('published',true).is('deleted_at',null);
      if(category!=='all')req=req.eq('category',category);
      rows=check(await req.order(recent?'updated_at':'created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+(recent?2:11)));
    }
    return rows.map(p=>({id:p.id,title:p.title,excerpt:p.body.slice(0,120),has_image:null,category:p.category,published:p.published,created_at:p.created_at,updated_at:p.updated_at}));
  }
  function publicRecord(id,fields){return db.from('journal_posts').select(fields).eq('id',id).eq('published',true).is('deleted_at',null).single();}
  return {
    summaries,
    async detail(id){return check(await publicRecord(id,textFields));},
    async cover(id){const row=check(await publicRecord(id,'id,image_data'));return row?.image_data||null;},
    async editable(id){return check(await publicRecord(id,'*'));}
  };
};
