const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');

test('withdrawal erases original text and replies; unread, counts and search respect privacy',async()=>{
  const db=new PGlite();
  const owner='10000000-0000-4000-8000-000000000001',alice='10000000-0000-4000-8000-000000000002',bob='10000000-0000-4000-8000-000000000003';
  const post='20000000-0000-4000-8000-000000000001',letter='30000000-0000-4000-8000-000000000001';
  async function as(role,id=''){await db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);set role ${role}`);}
  async function rows(sql){return (await db.query(sql)).rows;}
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
      insert into auth.users values ('${owner}','owner@example.test',now()),('${alice}','alice@example.test',now()),('${bob}','bob@example.test',now());`);
    await db.exec(readFileSync('supabase/schema.sql','utf8'));
    await db.exec(readFileSync('supabase/set-owner.sql','utf8').replace('YOUR_VERIFIED_EMAIL','owner@example.test'));
    const migration=readFileSync('supabase/migration-community.sql','utf8');await db.exec(migration);await db.exec(migration);
    await as('authenticated',owner);
    await db.exec(`insert into public.journal_posts(id,title,body,category,published) values ('${post}','公开心事','夏日酸橙','life',true);
      insert into public.journal_posts(title,body,category) values ('私密酸橙','secret','self');`);
    await as('authenticated',alice);
    await db.exec(`insert into public.visitor_messages(id,display_name,category,body,allow_public,journal_id,read_at,withdrawn_at)
      values ('${letter}','Alice','question','原始来信',true,'${post}',now(),now());`);
    let row=(await rows(`select * from public.visitor_messages where id='${letter}'`))[0];assert.equal(row.read_at,null);assert.equal(row.withdrawn_at,null);
    await assert.rejects(db.exec('select public.unread_message_count()'),/Owner access/);
    assert.equal((await rows(`update public.visitor_messages set body='changed' where id='${letter}' returning id`)).length,0);
    await as('authenticated',bob);await assert.rejects(db.exec(`select public.withdraw_message('${letter}')`),/not yours/);
    await db.exec(`insert into public.visitor_messages(display_name,category,body,journal_id) values ('Bob','review','私密交流','${post}')`);
    await as('authenticated',owner);
    assert.equal(Number((await rows('select public.unread_message_count() as n'))[0].n),2);
    await db.exec(`update public.visitor_messages set reply='站主回复',published=true where id='${letter}'`);
    assert.equal(Number((await rows('select public.unread_message_count() as n'))[0].n),1);
    await as('anon');await assert.rejects(db.exec(`select public.withdraw_message('${letter}')`),/permission denied/);
    let counts=await rows(`select * from public.journal_discussion_counts(array['${post}'::uuid])`);assert.equal(Number(counts[0].total),1);assert.equal(Number(counts[0].replied),1);
    assert.equal((await rows("select * from public.search_journals('酸橙')")).length,1);
    assert.equal((await rows("select * from public.search_journals('日常碎片')")).length,1);
    assert.equal((await rows("select * from public.search_journals('酸橙','self')")).length,0);
    assert.equal((await rows("select * from public.search_journals('%')")).length,0);
    await as('authenticated',owner);await db.exec(`update public.visitor_messages set deleted_at=now(),published=false where id='${letter}'`);
    await as('authenticated',alice);assert.equal((await rows(`select * from public.visitor_messages where id='${letter}'`)).length,1);
    await db.exec(`select public.withdraw_message('${letter}');select public.withdraw_message('${letter}')`);
    await as('authenticated',owner);row=(await rows(`select * from public.visitor_messages where id='${letter}'`))[0];
    assert.equal(row.body,'（来信已撤回）');assert.equal(row.reply,'');assert.equal(row.published,false);assert.ok(row.withdrawn_at);
    await assert.rejects(db.exec(`update public.visitor_messages set withdrawn_at=null,body='restored' where id='${letter}'`),/cannot be changed/);
    await as('anon');assert.equal((await rows(`select * from public.public_journal_messages('${post}')`)).length,0);
    assert.equal((await rows(`select * from public.journal_discussion_counts(array['${post}'::uuid])`)).length,0);
    await as('authenticated',owner);await db.exec(`update public.journal_posts set published=false where id='${post}'`);
    await as('anon');assert.equal((await rows("select * from public.search_journals('酸橙')")).length,0);
    await db.exec('reset role');await db.exec(migration);
    const imageMigration=readFileSync('supabase/migration-images.sql','utf8');await db.exec(imageMigration);await db.exec(imageMigration);
    const photo='data:image/png;base64,iVBORw0KGgo=';
    await as('authenticated',owner);
    await db.exec(`update public.journal_posts set image_data='${photo}',published=true where id='${post}'`);
    await db.exec(`insert into public.visitor_messages(display_name,category,body,image_data,allow_public) values ('Owner','review','A photo','${photo}',true)`);
    const photoId=(await rows("select id from public.visitor_messages where display_name='Owner'"))[0].id;
    await as('authenticated',bob);assert.equal((await rows(`select * from public.visitor_messages where id='${photoId}'`)).length,0);
    await as('anon');assert.equal((await rows('select * from public.public_messages_images()')).length,0);
    assert.equal((await rows("select * from public.search_journals_images('酸橙')"))[0].image_data,photo);
    await as('authenticated',owner);
    await assert.rejects(db.exec(`update public.visitor_messages set image_data=null where id='${photoId}'`),/content cannot be changed/);
    await assert.rejects(db.exec(`update public.journal_posts set image_data='data:image/svg+xml;base64,AAAA' where id='${post}'`),/check constraint/);
    await db.exec(`update public.visitor_messages set published=true where id='${photoId}'`);
    await as('anon');assert.equal((await rows('select * from public.public_messages_images()'))[0].image_data,photo);
    await as('authenticated',owner);await db.exec(`select public.withdraw_message('${photoId}')`);
    assert.equal((await rows(`select image_data from public.visitor_messages where id='${photoId}'`))[0].image_data,null);
    await as('anon');assert.equal((await rows('select * from public.public_messages_images()')).length,0);
  }finally{await db.close();}
});
