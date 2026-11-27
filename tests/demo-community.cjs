const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');

(async()=>{
  const db=new PGlite();
  const a={id:'demo_a',key:'a'.repeat(64)},b={id:'demo_b',key:'b'.repeat(64)};
  const sameIdOtherBrowser={id:a.id,key:b.key};
  try {
    await db.exec('create role anon; create role authenticated; create publication supabase_realtime;');
    const runMigration=name=>db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8'));
    await runMigration('2026111801_demo_records.sql');
    await runMigration('2026112402_demo_community.sql');
    await runMigration('2026112402_demo_community.sql');
    await runMigration('2026112403_demo_login_lookup.sql');
    await runMigration('2026112403_demo_login_lookup.sql');
    async function publicQuery(sql,args=[]){
      await db.exec('set role anon');
      try{return (await db.query(sql,args)).rows[0]?.result;}finally{await db.exec('reset role');}
    }
    const join=(id,team)=>publicQuery('select public.fanplay_demo_join($1,$2) result',[id,team]);
    const open=id=>publicQuery('select public.fanplay_demo_open($1) result',[id]);
    const resume=id=>publicQuery('select public.fanplay_demo_resume($1) result',[id]);
    const feed=(identity,sort='latest',page=0)=>publicQuery(
      'select public.fanplay_demo_ticket_feed($1,$2,$3,$4) result',[sort,page,identity?.id,identity?.key]);
    const write=(identity,action,id=null,message='',ticket=null,liked=null,comment=null)=>publicQuery(
      'select public.fanplay_demo_ticket_write($1,$2,$3,$4,$5,$6,$7,$8) result',
      [identity.id,identity.key,action,id,message,ticket&&JSON.stringify(ticket),liked,comment]);
    const old=await open('old_demo');
    await publicQuery('select public.fanplay_demo_save($1,$2,$3) result',['old_demo',old.revision,'{"profile":{"team":"한화"},"tickets":[{"id":"old_ticket"}]}']);
    assert.equal((await join('old_demo','LG')).state.profile.team,'한화');
    assert.equal((await open('old_demo')).state.tickets[0].id,'old_ticket');
    assert.deepEqual(await resume('old_demo'),await open('old_demo'));
    assert.equal(await resume(a.id),null);
    assert.equal((await db.query('select count(*) as count from fanplay_private.demo_records where player_id=$1',[a.id])).rows[0].count,0);
    await assert.rejects(()=>resume('INVALID'),{code:'PT400'});
    assert.equal((await join(a.id,'LG')).state.profile.team,'LG');
    assert.equal((await resume(a.id)).state.profile.team,'LG');
    assert.equal((await join(a.id,'KT')).state.profile.team,'LG');
    await join(b.id,'KIA');
    await assert.rejects(()=>join('demo_c','fake'),{code:'PT400'});
    await assert.rejects(()=>publicQuery('select * from fanplay_private.demo_ticket_posts'),{code:'42501'});
    await assert.rejects(()=>write({id:'missing',key:a.key},'post'),{code:'PT401'});
    await assert.rejects(()=>write({id:a.id,key:''},'post'),{code:'PT400'});
    const ids=[];
    for(let i=0;i<22;i++){
      const ticket={id:'a'+i,date:'2026-11-24',home:'홈',away:'원정'};
      const id=await write(a,'post',null,'경기 '+i,ticket);
      ids.push(id);
      await write(b,'like',id,'',null,true);
      await write(b,'comment',id,'댓글');
    }
    await write(b,'like',ids[0],'',null,true);
    await write(a,'like',ids[0],'',null,true);
    await write(b,'comment',ids[1],'한 번 더');
    const likes=await feed(null,'likes'),comments=await feed(b,'comments');
    assert.equal(likes.length,10);assert.equal(comments.length,10);
    assert.equal(likes[0].id,ids[0]);assert.equal(likes[0].likes,2);assert.equal(likes[0].liked,false);
    assert.equal(comments[0].id,ids[1]);assert.equal(comments[0].replyCount,2);assert.equal(comments[0].liked,true);
    assert.equal((await feed(b)).length,21);assert.equal((await feed(b,'latest',1)).length,2);
    const firstComment=comments[0].comments.find(row=>row.text==='한 번 더');
    await assert.rejects(()=>write(a,'remove-comment',ids[1],'',null,null,firstComment.id),{code:'PT403'});
    await write(b,'remove-comment',ids[1],'',null,null,firstComment.id);
    await write(b,'like',ids[0],'',null,false);
    assert.equal((await feed(a,'likes')).find(row=>row.id===ids[0])?.likes??1,1);
    const bPost=await write(b,'post',null,'B 커리어',{id:'b',date:'2026-11-24',home:'팀 B',away:'팀 A',mode:'커리어',inventory:{secret:true}});
    const otherPost=(await feed(a)).find(row=>row.id===bPost);
    assert.equal(otherPost.ticket.mode,'커리어');assert.equal(otherPost.mine,false);assert(otherPost.createdAt);
    assert.equal(otherPost.ticket.inventory,undefined);
    const recentA=ids.at(-1);
    assert((await feed(b)).some(row=>row.id===recentA&&!row.mine));
    assert((await feed(a)).some(row=>row.id===recentA&&row.mine));
    assert((await feed(sameIdOtherBrowser)).some(row=>row.id===recentA&&!row.mine));
    await assert.rejects(()=>write(a,'edit',bPost,'다른 사람'),{code:'PT403'});
    await assert.rejects(()=>write(sameIdOtherBrowser,'delete',ids[0]),{code:'PT403'});
    await assert.rejects(()=>write(sameIdOtherBrowser,'edit',ids[0],'같은 아이디의 다른 브라우저'),{code:'PT403'});
    await write(b,'edit',bPost,'내가 바꾼 글');
    const changed=(await feed(a)).find(row=>row.id===bPost);
    assert.equal(changed.text,'내가 바꾼 글');assert.equal(changed.createdAt,otherPost.createdAt);
    const aState=(await open(a.id)).state,bState=(await open(b.id)).state;
    assert(aState.posts.every(post=>post.id!==bPost));
    assert.deepEqual(bState.posts.map(post=>post.id),[bPost]);
    assert.equal(bState.posts[0].comments,undefined);
    assert(!JSON.stringify({aState,bState,likes,comments}).includes(a.key));
    await write(a,'delete',ids[0]);
    assert((await feed(null)).concat(await feed(null,'latest',1)).every(row=>row.id!==ids[0]));
    assert((await publicQuery('select version result from public.fanplay_demo_feed_updates'))>0);
    const legacy=fs.readFileSync(path.join(__dirname,'../supabase/admin/20261124_publish_reviewed_legacy_posts.sql'),'utf8');
    await db.exec(legacy);
    assert.equal((await db.query('select count(*) count from fanplay_private.demo_ticket_posts where created_at is null')).rows[0].count,0);
    const oldState=(await open('old_demo'));
    oldState.state.posts=[{id:'approved',nickname:'이전 팬',text:'예전 글',
      ticket:{id:'old',date:'2026-11-24',home:'홈',away:'원정',photo:'개인 사진',note:'개인 메모'}}];
    await publicQuery('select public.fanplay_demo_save($1,$2,$3) result',['old_demo',oldState.revision,JSON.stringify(oldState.state)]);
    const approved=legacy.replace("jsonb_to_recordset('[]'::jsonb)","jsonb_to_recordset('[{\"player_id\":\"old_demo\",\"post_id\":\"approved\"}]'::jsonb)");
    await db.exec(approved);
    await db.exec(approved);
    const oldPost=(await feed(a,'latest',1)).find(row=>row.text==='예전 글');
    assert.equal(oldPost.createdAt,null);
    assert.equal(oldPost.ticket.photo,undefined);
    assert.equal(oldPost.ticket.note,undefined);
    assert.equal(oldPost.mine,false);
    assert.equal((await db.query('select count(*) count from fanplay_private.demo_ticket_posts where created_at is null')).rows[0].count,1);
    console.log('PASS PostgreSQL: ID-only theme and existing saves, two IDs share feed, same ID cannot impersonate author, rankings, reactions and legacy SQL');
  } finally {await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
