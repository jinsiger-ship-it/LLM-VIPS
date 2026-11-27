const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');

const root=path.join(__dirname,'../supabase');
const reset=fs.readFileSync(path.join(root,'admin/20261127_hard_reset_demo.sql'),'utf8');
const migrations=fs.readdirSync(path.join(root,'migrations')).sort();

async function verify(files){
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create table public.unrelated_fixture(value text);insert into public.unrelated_fixture values(\'keep\');');
  for(const file of files)await db.exec(fs.readFileSync(path.join(root,'migrations',file),'utf8'));
  await db.query("select public.fanplay_demo_join('reset_fixture','LG')");
  const post=(await db.query("select public.fanplay_demo_ticket_write('reset_fixture',$1,'post',p_ticket:=$2) id",[
   'a'.repeat(64),JSON.stringify({id:'old',date:'2026-11-27',home:'가상 홈',away:'가상 원정'})
  ])).rows[0].id;
  await db.query("select public.fanplay_demo_ticket_write('reset_fixture',$1,'comment',p_post_id:=$2,p_text:='before reset')",['a'.repeat(64),post]);
  await db.query("select public.fanplay_demo_ticket_write('reset_fixture',$1,'like',p_post_id:=$2,p_liked:=true)",['a'.repeat(64),post]);
  if(files.length>3){
   for(const sql of [
    "insert into fanplay_private.demo_career_rankings(player_id,position,career_id,nickname,name,seasons,appearances,score) values('reset_fixture','투수','test','환산','가상 선수',7,100,3)",
    "insert into fanplay_private.demo_ticket_reports(post_id,owner_hash,reason) values($1,decode(repeat('aa',32),'hex'),'fixture')",
    "insert into fanplay_private.demo_moderation_log(post_id,action,reason,actor) values($1,'hide','fixture','operator')",
    "insert into fanplay_private.demo_community_requests(owner_hash,action,request_id,payload_hash) values(decode(repeat('aa',32),'hex'),'post',gen_random_uuid(),decode(repeat('bb',32),'hex'))"
   ])await db.query(sql,sql.includes('$1')?[post]:[]);
  }
  await db.exec(reset);
  const active=(await db.query("select tablename from pg_tables where schemaname='fanplay_private' and tablename<>'demo_reset_history' order by tablename")).rows;
  for(const {tablename} of active){
   assert.match(tablename,/^demo_[a-z_]+$/);
   assert.equal((await db.query('select count(*) as remaining from fanplay_private.'+tablename)).rows[0].remaining,0,tablename);
  }
  assert.equal((await db.query('select value from public.unrelated_fixture')).rows[0].value,'keep');
  await db.exec('set role anon');
  const status=(await db.query('select public.fanplay_demo_status() as status')).rows[0].status;
  assert.deepEqual(status,{ready:true,version:1,recordReset:'fanplay-demo-20261127'});
  await assert.rejects(()=>db.query('select * from fanplay_private.demo_reset_history'),{code:'42501'});
  await db.query("select public.fanplay_demo_join('new_fixture','KT')");
  await db.exec('reset role');
  await db.exec(reset);
  assert.equal((await db.query("select state->'profile'->>'team' as team from fanplay_private.demo_records where player_id='new_fixture'")).rows[0].team,'KT');
 }finally{await db.close();}
}

(async()=>{
 await verify(migrations.slice(0,3));
 await verify(migrations);
 console.log('PASS scoped test reset on original and upgraded schemas, fresh login, repeat protection, and unrelated table preservation');
})().catch(error=>{console.error(error);process.exitCode=1});
