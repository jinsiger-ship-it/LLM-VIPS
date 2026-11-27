/* PGLITE_MODULE, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE로 테스트 경로 지정. 실제 Supabase에 쓰지 않습니다. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const db=new PGlite();
 const readSql=name=>fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8');
 const migration=readSql('2026111801_demo_records.sql'), signup=readSql('2026112701_demo_signup.sql');
 await db.exec('create role anon; create role authenticated;');await db.exec(migration);
 const anon=async(sql,params=[])=>{await db.exec('set role anon;');try{return await db.query(sql,params);}finally{await db.exec('reset role;');}};
 const rpc=async(name,args)=>{
  const q={
   fanplay_demo_status:['select public.fanplay_demo_status() as result',[]],
   fanplay_demo_open:['select public.fanplay_demo_open($1) as result',[args.p_player_id]],
   fanplay_demo_resume:['select public.fanplay_demo_resume($1) as result',[args.p_player_id]],
   fanplay_demo_join:['select public.fanplay_demo_join($1,$2) as result',[args.p_player_id,args.p_team]],
   fanplay_demo_save:['select public.fanplay_demo_save($1,$2,$3::jsonb) as result',[args.p_player_id,args.p_revision,JSON.stringify(args.p_state)]]
  }[name];
  if(!q)throw Error('invalid rpc');return (await anon(...q)).rows[0].result;
 };
 const opened=await rpc('fanplay_demo_open',{p_player_id:'db_test'});assert.equal(opened.revision,0);
 await db.exec(readSql('2026112403_demo_login_lookup.sql'));
 await db.exec(signup);
 for(const name of ['fanplay_demo_open','fanplay_demo_resume'])assert.equal(await rpc(name,{p_player_id:'new_id'}),null);
 await assert.rejects(()=>rpc('fanplay_demo_join',{p_player_id:'new_id',p_team:'bad_team'}),{code:'PT400'});
 assert.equal(await rpc('fanplay_demo_resume',{p_player_id:'new_id'}),null);
 const joined=await rpc('fanplay_demo_join',{p_player_id:' New_ID ',p_team:'LG'});
 assert.deepEqual([joined.username,joined.state.profile.team,joined.revision],['new_id','LG',0]);
 await assert.rejects(()=>rpc('fanplay_demo_join',{p_player_id:'NEW_ID',p_team:'KT'}),{code:'PT409'});
 assert.deepEqual(await rpc('fanplay_demo_open',{p_player_id:'new_id'}),joined);
 await assert.rejects(()=>rpc('fanplay_demo_join',{p_player_id:'db_test',p_team:'KT'}),{code:'PT409'});
 const state={tickets:[],test:'기록'};
 const saved=await rpc('fanplay_demo_save',{p_player_id:'db_test',p_revision:0,p_state:state});assert.equal(saved.revision,1);assert.deepEqual(saved.state,state);
 await assert.rejects(()=>rpc('fanplay_demo_save',{p_player_id:'db_test',p_revision:0,p_state:{}}),e=>e.code==='PT409');
 for(const id of ['',"x' or true --",'UPPER','한글'])await assert.rejects(()=>rpc('fanplay_demo_open',{p_player_id:id}),e=>e.code==='PT400');
 for(const payload of [[],null,'x'.repeat(5242881)])await assert.rejects(()=>rpc('fanplay_demo_save',{p_player_id:'db_test',p_revision:1,p_state:payload}),e=>e.code==='PT413');
 await assert.rejects(()=>anon('select * from fanplay_private.demo_records'),e=>e.code==='42501');
 await assert.rejects(()=>anon("delete from fanplay_private.demo_records where player_id='db_test'"),e=>e.code==='42501');
 await db.exec(signup);assert.equal((await rpc('fanplay_demo_open',{p_player_id:'db_test'})).state.test,'기록');
 console.log('PASS PostgreSQL: explicit signup, read-only login, duplicate IDs, existing records, revisions, size cap and private table denied');
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(!/^\/(index\.html|js\/[a-z-]+\.js|css\/[a-z-]+\.css|assets\/broadcast\/[a-z-]+\.(mp4|webp))$/.test(pathname)&&pathname!=='/'){res.writeHead(404).end();return;}
  const file=path.join(root,pathname==='/'?'index.html':pathname.slice(1));
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.mp4':'video/mp4'};
  res.setHeader('Content-Type',mime[path.extname(file)]);
  // Exercise account setup without loading the community UI.
  if(path.extname(file)==='.html')return res.end(fs.readFileSync(file,'utf8')
    .replace(/<script src="js\/community\.js[^"]*"><\/script>/,''));
  fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
 }).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 let offline=false,missing=false;const errors=[];
 const context=async()=>{
  const c=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await c.route('https://*.supabase.co/rest/v1/rpc/*',async route=>{
   if(offline)return route.abort();
   if(missing)return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({code:'PGRST202',message:'missing'})});
   try{const result=await rpc(new URL(route.request().url()).pathname.split('/').at(-1),route.request().postDataJSON());await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});}
   catch(error){await route.fulfill({status:Number(error.code?.slice(2))||500,contentType:'application/json',body:JSON.stringify({message:error.message,code:error.code})});}
  });return c;
 };
 const base='http://127.0.0.1:'+server.address().port;
 const go=async c=>{const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/#login');await p.waitForFunction(()=>!FP.account.checking);return p;};
 async function open(p,id,team){
  const login=p.locator('[data-account-action="login"]');
  await login.locator('[name="username"]').fill(id);
  await login.locator('button').click();
  if(team){
   await p.locator('#login-error',{hasText:'가입한 아이디를 찾지 못했어요.'}).waitFor();
   assert.equal(await rpc('fanplay_demo_resume',{p_player_id:id.toLowerCase()}),null);
   await p.getByRole('link',{name:'회원가입',exact:true}).click();
   const signup=p.locator('[data-account-action="register"]');
   assert.equal(await signup.locator('[name="username"]').inputValue(),id);
   await signup.locator(`[name="team"][value="${team}"] + span`).click();
   await signup.locator('button').click();
  }
  await p.waitForFunction(id=>FP.account.username===id&&!FP.account.busy,id.toLowerCase());
  await p.locator('a[href="#account"]').click();
 }
 try{
  missing=true;const c=await context(),p=await go(c);assert(await p.locator('.login-screen').innerText().then(t=>t.includes('설정')));
  assert.equal(await p.locator('[name="password"]').count(),0);
  missing=false;await p.locator('[data-action="cloud-retry"]').click();await p.waitForFunction(()=>FP.account.available&&!FP.account.checking);
  await p.evaluate(()=>FP.transact(d=>{d.tickets.push({...FP.sample,id:'device-ticket'});}));
  await open(p,'Demo_One','LG');assert.equal(await p.evaluate(()=>FP.data.profile.team),'LG');
  await p.locator('[data-action="guest-import"][data-value="device"]').click();await p.waitForFunction(()=>!FP.account.busy);assert.equal(await p.evaluate(()=>FP.data.tickets.length),1);
  const c2=await context(),p2=await go(c2);await open(p2,'demo_one');assert.equal(await p2.evaluate(()=>FP.data.tickets[0].id),'device-ticket');
  assert(await p.evaluate(()=>FP.transact(d=>{d.profile.nickname='기기 하나';})));
  const before=await p2.evaluate(()=>JSON.stringify(FP.data));
  assert.equal(await p2.evaluate(()=>FP.transact(d=>{d.profile.nickname='옛 기록';})),false);
  assert.equal(await p2.evaluate(()=>JSON.stringify(FP.data)),before);
  await p2.getByText('저장 도구',{exact:true}).click();
  p2.once('dialog',d=>d.accept());await p2.locator('[data-action="cloud-refresh"]').click();await p2.waitForFunction(()=>!FP.account.busy);
  assert.equal(await p2.evaluate(()=>FP.data.profile.nickname),'기기 하나');
  offline=true;assert.equal(await p2.evaluate(()=>FP.transact(d=>{d.profile.nickname='연결 실패';})),false);assert.equal(await p2.evaluate(()=>FP.data.profile.nickname),'기기 하나');offline=false;
  await p.reload();await p.waitForFunction(()=>!FP.account.checking);assert.equal(await p.evaluate(()=>FP.account.username),'demo_one');assert.equal(await p.evaluate(()=>FP.data.profile.nickname),'기기 하나');
  await p.locator('[data-account-action="logout"] button').click();await p.waitForFunction(()=>!FP.account.busy&&!FP.account.username);assert.equal(await p.evaluate(()=>FP.data.tickets.length),0);
  await p.getByRole('link',{name:'로그인',exact:true}).click();
  await open(p,'other_demo','neutral');assert.equal(await p.evaluate(()=>FP.data.tickets.length),0);
  assert.deepEqual(errors,[]);
  fs.mkdirSync(path.join(root,'qa'),{recursive:true});await p.screenshot({path:path.join(root,'qa/cloud-demo.png'),fullPage:true});
  console.log('PASS browser with SQL-backed RPC mock: signup, existing login, guest import, two devices, conflict, offline, restore, logout and separate IDs');
 }finally{await browser.close();await new Promise(r=>server.close(r));await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
