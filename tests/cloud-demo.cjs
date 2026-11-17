/* PGLITE_MODULE, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE로 테스트 경로 지정. 실제 Supabase에 쓰지 않습니다. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const db=new PGlite();const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/2026111801_demo_records.sql'),'utf8');
 await db.exec('create role anon; create role authenticated;');await db.exec(migration);
 const anon=async(sql,params=[])=>{await db.exec('set role anon;');try{return await db.query(sql,params);}finally{await db.exec('reset role;');}};
 const rpc=async(name,args)=>{
  const q={fanplay_demo_status:['select public.fanplay_demo_status() as result',[]],fanplay_demo_open:['select public.fanplay_demo_open($1) as result',[args.p_player_id]],fanplay_demo_save:['select public.fanplay_demo_save($1,$2,$3::jsonb) as result',[args.p_player_id,args.p_revision,JSON.stringify(args.p_state)]]}[name];
  if(!q)throw Error('invalid rpc');return (await anon(...q)).rows[0].result;
 };
 let opened=await rpc('fanplay_demo_open',{p_player_id:'db_test'});assert.equal(opened.revision,0);
 const state={tickets:[],test:'기록'};
 const saved=await rpc('fanplay_demo_save',{p_player_id:'db_test',p_revision:0,p_state:state});assert.equal(saved.revision,1);assert.deepEqual(saved.state,state);
 await assert.rejects(()=>rpc('fanplay_demo_save',{p_player_id:'db_test',p_revision:0,p_state:{}}),e=>e.code==='PT409');
 for(const id of ['',"x' or true --",'UPPER','한글'])await assert.rejects(()=>rpc('fanplay_demo_open',{p_player_id:id}),e=>e.code==='PT400');
 for(const payload of [[],null,'x'.repeat(5242881)])await assert.rejects(()=>rpc('fanplay_demo_save',{p_player_id:'db_test',p_revision:1,p_state:payload}),e=>e.code==='PT413');
 await assert.rejects(()=>anon('select * from fanplay_private.demo_records'),e=>e.code==='42501');
 await assert.rejects(()=>anon("delete from fanplay_private.demo_records where player_id='db_test'"),e=>e.code==='42501');
 await db.exec(migration);assert.equal((await rpc('fanplay_demo_open',{p_player_id:'db_test'})).state.test,'기록');
 console.log('PASS PostgreSQL: validation, revisions, stale writes, size cap, private table denied, idempotent migration');
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(!/^\/(index\.html|js\/[a-z-]+\.js|css\/[a-z-]+\.css|assets\/broadcast\/[a-z-]+\.(mp4|webp))$/.test(pathname)&&pathname!=='/'){res.writeHead(404).end();return;}
  const file=path.join(root,pathname==='/'?'index.html':pathname.slice(1));
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.mp4':'video/mp4'};
  res.setHeader('Content-Type',mime[path.extname(file)]);fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
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
 const go=async c=>{const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/#profile');await p.waitForFunction(()=>!FP.account.checking);return p;};
 const open=async(p,id)=>{await p.locator('[data-account-action="login"] [name="username"]').fill(id);await p.locator('[data-account-action="login"] button').click();await p.waitForFunction(()=>FP.account.username&&!FP.account.busy);};
 try{
  missing=true;const c=await context(),p=await go(c);assert(await p.locator('.account-panel').innerText().then(t=>t.includes('設定')||t.includes('설정')));
  assert.equal(await p.locator('[name="password"]').count(),0);
  missing=false;await p.locator('[data-action="cloud-retry"]').click();await p.waitForFunction(()=>FP.account.available&&!FP.account.checking);
  await p.evaluate(()=>FP.transact(d=>{d.tickets.push({...FP.sample,id:'device-ticket'});}));
  await open(p,'Demo_One');assert.equal(await p.evaluate(()=>FP.account.username),'demo_one');
  await p.locator('[data-action="guest-import"][data-value="device"]').click();await p.waitForFunction(()=>!FP.account.busy);assert.equal(await p.evaluate(()=>FP.data.tickets.length),1);
  const c2=await context(),p2=await go(c2);await open(p2,'demo_one');assert.equal(await p2.evaluate(()=>FP.data.tickets[0].id),'device-ticket');
  assert(await p.evaluate(()=>FP.transact(d=>{d.profile.nickname='기기 하나';})));
  const before=await p2.evaluate(()=>JSON.stringify(FP.data));
  assert.equal(await p2.evaluate(()=>FP.transact(d=>{d.profile.nickname='옛 기록';})),false);
  assert.equal(await p2.evaluate(()=>JSON.stringify(FP.data)),before);
  p2.once('dialog',d=>d.accept());await p2.locator('[data-action="cloud-refresh"]').click();await p2.waitForFunction(()=>!FP.account.busy);
  assert.equal(await p2.evaluate(()=>FP.data.profile.nickname),'기기 하나');
  offline=true;assert.equal(await p2.evaluate(()=>FP.transact(d=>{d.profile.nickname='연결 실패';})),false);assert.equal(await p2.evaluate(()=>FP.data.profile.nickname),'기기 하나');offline=false;
  await p.reload();await p.waitForFunction(()=>!FP.account.checking);assert.equal(await p.evaluate(()=>FP.account.username),'demo_one');assert.equal(await p.evaluate(()=>FP.data.profile.nickname),'기기 하나');
  await p.locator('[data-account-action="logout"] button').click();await p.waitForFunction(()=>!FP.account.busy&&!FP.account.username);assert.equal(await p.evaluate(()=>FP.data.tickets[0].id),'device-ticket');
  await open(p,'other_demo');assert.equal(await p.evaluate(()=>FP.data.tickets.length),0);
  assert.deepEqual(errors,[]);
  fs.mkdirSync(path.join(root,'qa'),{recursive:true});await p.screenshot({path:path.join(root,'qa/cloud-demo.png'),fullPage:true});
  console.log('PASS browser with SQL-backed mock RPC: setup missing/retry, lowercase ID, guest import, two devices, revision conflict, refresh, offline, restore, exit, separate IDs');
 }finally{await browser.close();await new Promise(r=>server.close(r));await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
