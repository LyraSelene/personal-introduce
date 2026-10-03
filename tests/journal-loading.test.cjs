const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('compact summaries exclude images, bound excerpts, search full text and hide private content',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;
      create table public.journal_posts(id uuid primary key default gen_random_uuid(),title text,body text,image_data text,category text,published boolean,created_at timestamptz default now(),updated_at timestamptz default now(),deleted_at timestamptz);
      insert into public.journal_posts(title,body,image_data,category,published) values
        ('Public',repeat('a',200)||'needle','data:image/png;base64,AAAA','life',true),
        ('Private','secret needle',null,'life',false),
        ('Deleted','needle',null,'life',true);
      update public.journal_posts set deleted_at=now() where title='Deleted';
      insert into public.journal_posts(title,body,category,published,created_at,updated_at)
      select 'Post '||i,'body','self',true,now()+i*interval '1 minute',now()-i*interval '1 minute' from generate_series(1,14) i;`);
    const sql=readFileSync('supabase/migration-journal-loading.sql','utf8');await db.exec(sql);await db.exec(sql);
    for(const role of ['anon','authenticated']){
      await db.exec(`set role ${role}`);
      const all=(await db.query('select * from public.journal_summaries()')).rows;
      assert.equal(all.length,12);assert.equal(all[0].title,'Post 14');
      assert.equal((await db.query("select * from public.journal_summaries('','all',12)")).rows.length,3);
      const recent=(await db.query("select * from public.journal_summaries('','all',0,true)")).rows;
      assert.equal(recent.length,3);assert.equal(recent[0].title,'Public');
      const rows=(await db.query("select * from public.journal_summaries('needle','life')")).rows;
      assert.equal(rows.length,1);assert.equal(rows[0].excerpt.length,120);assert.equal(rows[0].has_image,true);
      assert.equal('body' in rows[0],false);assert.equal('image_data' in rows[0],false);
      assert.equal((await db.query("select * from public.journal_summaries('%')")).rows.length,0);
      await db.exec('reset role');
    }
  }finally{await db.close();}
});
