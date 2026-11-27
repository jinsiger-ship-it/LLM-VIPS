const assert=require('node:assert/strict');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');

(async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon; create role authenticated;');
  const migrate=name=>db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8'));
  for(const name of fs.readdirSync(path.join(__dirname,'../supabase/migrations')).sort())await migrate(name);
  await migrate('2026112501_community_reliability.sql');
  await migrate('2026112502_career_rankings.sql');
  const owner={id:'demo_v2_a',key:'a'.repeat(64)};
  const guest={id:'demo_v2_b',key:'b'.repeat(64)};
  const otherBrowser={...owner,key:guest.key};
  const raw=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.result;
  const rpc=async(sql,args=[])=>{
    await db.exec('set role anon');
    try{return await raw(sql,args);}finally{await db.exec('reset role');}
  };
  const join=id=>rpc("select public.fanplay_demo_join($1,'LG') result",[id]);
  const read=id=>rpc('select public.fanplay_demo_resume($1) result',[id]);
  const save=(id,revision,state)=>rpc('select public.fanplay_demo_save($1,$2,$3) result',[id,revision,JSON.stringify(state)]);
  const write=(who,action,{post=null,text='',ticket=null,liked=null,comment=null,request=null,photo=false,note=false,thumb=null}={})=>
    rpc('select public.fanplay_demo_ticket_write_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) result',
      [who.id,who.key,action,post,text,ticket&&JSON.stringify(ticket),liked,comment,request,photo,note,thumb]);
  const feed=(who=owner,last=null,sort='latest')=>rpc('select public.fanplay_demo_ticket_feed_v2($1,$2,$3,$4,$5) result',
     [sort,last?.createdAt??null,last?.id??null,who.id,who.key]);
  const comments=(who,post,last=null)=>rpc('select public.fanplay_demo_ticket_comments($1,$2,$3,$4,$5) result',
     [post,last?.createdAt??null,last?.id??null,who.id,who.key]);
  const fetchPhoto=id=>rpc('select public.fanplay_demo_ticket_photo($1) result',[id]);
  const a=await join(owner.id);
  await join(guest.id);
  const image='data:image/jpeg;base64,YQ==';
  const ticket={id:'test-ticket',date:'2026-11-10',home:'가상 홈',away:'가상 원정',photo:image,note:'비공개',secret:'private'};
  const large=await save(owner.id,a.revision,{fixture:'x'.repeat(5242800),posts:[]});
  const request=randomUUID();
  const first=await write(owner,'post',{ticket,request,text:'공개 글'});
  assert.equal(await write(owner,'post',{ticket,request,text:'공개 글'}),first);
  await assert.rejects(()=>write(owner,'post',{ticket,request,text:'다른 내용'}),{code:'PT409'});
  assert.equal((await read(owner.id)).revision,large.revision);
  await save(owner.id,large.revision,{tickets:[ticket],posts:[]});
  assert(!JSON.stringify(await feed()).includes('secret'));
  await assert.rejects(()=>write(owner,'post',{ticket:{...ticket,date:'2026-02-31'}}),{code:'PT400'});
  assert.equal(await fetchPhoto(first),null);
  for(const [photo,note] of [[true,false],[false,true],[true,true]]){
    const post=await write(owner,'post',{ticket,photo,note,thumb:image});
    const row=(await feed()).find(x=>x.id===post);
    assert.equal(row.ticket.photo,undefined);
    assert.equal(row.ticket.note,note?ticket.note:undefined);
    assert.equal(row.thumbnail,photo?image:null);
    assert.equal(await fetchPhoto(post),photo?image:null);
  }
  const sameComment=randomUUID();
  const original=await write(owner,'comment',{post:first,text:'최초 댓글',request:sameComment});
  assert.equal(await write(owner,'comment',{post:first,text:'최초 댓글',request:sameComment}),original);
  for(let i=0;i<16;i++)await write(guest,'comment',{post:first,text:'가상 댓글 '+i});
  const recent=await comments(owner,first);
  assert.equal(recent.length,16);
  assert(!recent.slice(0,15).some(row=>row.id===original));
  const older=await comments(owner,first,recent[14]);
  assert(older.some(row=>row.mine&&row.id===original));
  await assert.rejects(()=>write(guest,'remove-comment',{post:first,comment:original}),{code:'PT403'});
  await assert.rejects(()=>write(otherBrowser,'delete',{post:first}),{code:'PT403'});
  await write(owner,'remove-comment',{post:first,comment:original});
  await write(guest,'like',{post:first,liked:true});
  assert.equal((await feed(guest,null,'likes'))[0].likes,1);
  await write(guest,'report',{post:first,text:'신고 검증'});
  await write(guest,'report',{post:first,text:'중복 신고'});
  assert.equal(await raw('select count(*) result from fanplay_private.demo_ticket_reports'),1);
  await assert.rejects(()=>rpc('select fanplay_private.demo_moderate($1,$2,$3) result',[first,'hide','차단 검증']),{code:'42501'});
  await raw('select fanplay_private.demo_moderate($1,$2,$3) result',[first,'hide','숨김 검증']);
  assert(!(await feed()).some(p=>p.id===first));
  assert.deepEqual(await comments(owner,first),[]);
  assert.equal(await fetchPhoto(first),null);
  const old=await rpc('select public.fanplay_demo_ticket_feed() result');
  assert(!old.some(p=>p.id===first));
  await raw('select fanplay_private.demo_moderate($1,$2,$3) result',[first,'restore','복원 검증']);
  assert((await feed()).some(p=>p.id===first));
  assert.equal(await raw('select count(*) result from fanplay_private.demo_moderation_log'),2);
  // Use fixtures of equal timestamps and one undated legacy post.
  await db.exec("insert into fanplay_private.demo_ticket_posts(nickname,ticket,message,created_at) select '가상 팬','{\"id\":\"legacy\",\"date\":\"2026-01-01\",\"home\":\"홈\",\"away\":\"원정\"}',i::text,case when i=1 then null else '2026-01-01T00:00:00Z'::timestamptz end from generate_series(1,22) i");
  const page1=(await feed()).slice(0,20);
  await write(guest,'post',{ticket,text:'중간에 새 글'});
  const page2=await feed(owner,page1.at(-1));
  assert(page2.length>0);
  assert(page2.every(post=>!page1.some(old=>old.id===post.id)));
  assert.equal(page2.at(-1).createdAt,null);

  function batted(id,name,amount,hits,retired=true){
    return {id,name,position:'타자',retired,step:7,rules:8,moves:Array(7).fill(0),
      log:Array.from({length:7},(_,i)=>({season:i+1,record:{atBats:amount,hits}}))};
  }
  const pitcher={id:'arm',name:'별 투수',position:'투수',retired:true,step:7,rules:8,moves:Array(7).fill(0),
    log:Array.from({length:7},(_,i)=>({season:i+1,record:{innings:25,earnedRuns:4}}))};
  const previous=await read(owner.id);
  await save(owner.id,previous.revision,{career:pilot(),careerHistory:[batted('batter','가상 타자',100,30),pitcher,batted('low','하한 미달',1,0)]});
  function pilot(){return batted('unfinished','미완주',100,60,false);}
  await save(guest.id,0,{career:batted('guest-role','같은 타율',200,60)});
  const rank=(id,position,action,career)=>rpc('select public.fanplay_demo_career_rank_write($1,$2,$3,$4) result',[id,position,action,career]);
  const rankings=position=>rpc('select public.fanplay_demo_career_rankings($1) result',[position]);
  for(const career of ['unfinished','low'])await assert.rejects(()=>rank(owner.id,'타자','register',career),{code:'PT400'});
  assert(await rank(owner.id,'타자','register','batter'));
  assert(await rank(owner.id,'타자','register','batter'));
  assert(await rank(owner.id,'투수','register','arm'));
  assert(await rank(guest.id,'타자','register','guest-role'));
  const batters=await rankings('타자');
  assert.deepEqual(batters.map(row=>row.name),['같은 타율','가상 타자']);
  assert.equal(batters[0].score,.3);
  assert.equal((await rankings('투수'))[0].score,1.44);
  assert(!JSON.stringify(batters).includes(owner.id));
  assert.equal(await rank(owner.id,'타자','cancel','unfinished'),false);
  assert(await rank(owner.id,'타자','cancel','batter'));
  assert.equal((await rankings('타자')).length,1);
  await assert.rejects(()=>rpc('select * from fanplay_private.demo_career_rankings'),{code:'42501'});
  console.log('PASS SQL upgrade, large private saves, retry IDs, disclosure, comments cursor, moderator isolation, rankings and previous API compatibility');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
