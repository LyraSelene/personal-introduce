const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

test('database enforces owner editing, private messages and publication boundaries', async () => {
  const db = new PGlite();
  const owner = '10000000-0000-4000-8000-000000000001';
  const alice = '10000000-0000-4000-8000-000000000002';
  const bob = '10000000-0000-4000-8000-000000000003';
  const post = '20000000-0000-4000-8000-000000000001';
  const msg = '30000000-0000-4000-8000-000000000001';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
      insert into auth.users values ('${owner}','owner@example.test',now()),('${alice}','alice@example.test',now()),('${bob}','bob@example.test',now());`);
    const schema = readFileSync('supabase/schema.sql','utf8');
    await db.exec(schema); await db.exec(schema); // migration is repeatable
    await db.exec(readFileSync('supabase/set-owner.sql','utf8').replace('YOUR_VERIFIED_EMAIL','owner@example.test'));
    async function as(role, id='') { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false); set role ${role};`); }
    async function rows(sql) { return (await db.query(sql)).rows; }
    await as('authenticated',owner);
    assert.equal((await rows('select public.is_site_owner() as owner'))[0].owner,true);
    await db.exec(`insert into public.site_text values ('about.name','hello',now()); insert into public.journal_posts (id,title,body,category) values ('${post}','draft','secret draft','self');`);
    await as('anon');
    assert.equal((await rows('select * from public.site_text')).length,1);
    assert.equal((await rows('select * from public.journal_posts')).length,0);
    await assert.rejects(db.exec('select * from public.visitor_messages'),/permission denied/);
    await assert.rejects(db.exec('select * from private.site_owner'),/permission denied/);
    await as('authenticated',alice);
    assert.equal((await rows('select public.is_site_owner() as owner'))[0].owner,false);
    await assert.rejects(db.exec("insert into public.site_text(key,value) values ('evil','no')"),/row-level security/);
    assert.equal((await rows("update public.site_text set value='stolen' returning *")).length,0);
    await assert.rejects(db.exec("insert into public.journal_posts(title,body,category) values ('evil','no','life')"),/row-level security/);
    assert.equal((await rows(`update public.journal_posts set published=true where id='${post}' returning *`)).length,0);
    // A caller cannot forge author, publication, reply or creation date on insertion.
    await db.exec(`insert into public.visitor_messages(id,author_id,display_name,category,body,published,reply,created_at,deleted_at)
      values ('${msg}','${bob}','Alice','question','<script>alert(1)</script>',true,'fake','2000-01-01',now());`);
    const own=(await rows('select * from public.visitor_messages'))[0];
    assert.equal(own.author_id,alice);assert.equal(own.published,false);assert.equal(own.reply,'');assert.equal(own.deleted_at,null);
    assert.ok(new Date(own.created_at).getFullYear()>2020);
    await assert.rejects(db.exec("insert into public.visitor_messages(display_name,category,body) values ('A','review','too soon')"),/one minute/);
    assert.equal((await rows(`update public.visitor_messages set published=true where id='${msg}' returning *`)).length,0);
    await assert.rejects(db.exec('delete from public.visitor_messages'),/permission denied/);
    await as('authenticated',bob);
    assert.equal((await rows('select * from public.visitor_messages')).length,0);
    assert.equal((await rows('select * from public.public_messages()')).length,0);
    await as('authenticated',owner);
    assert.equal((await rows('select * from public.visitor_messages')).length,1);
    await db.exec(`update public.visitor_messages set published=true, reply='Thank you',author_id='${bob}',created_at='2000-01-01' where id='${msg}'; update public.journal_posts set published=true where id='${post}';`);
    const guarded=(await rows('select * from public.visitor_messages'))[0];
    assert.equal(guarded.author_id,alice);assert.equal(guarded.created_at.getTime(),own.created_at.getTime());
    await as('anon');
    const publicRows=await rows('select * from public.public_messages()');
    assert.equal(publicRows.length,1);assert.equal(publicRows[0].reply,'Thank you');assert.equal('author_id' in publicRows[0],false);
    assert.equal((await rows('select * from public.journal_posts')).length,1);
    await as('authenticated',owner);
    await db.exec(`update public.visitor_messages set published=false where id='${msg}'; update public.journal_posts set deleted_at=now() where id='${post}';`);
    await as('anon');
    assert.equal((await rows('select * from public.public_messages()')).length,0);
    assert.equal((await rows('select * from public.journal_posts')).length,0);
  } finally { await db.close(); }
});
