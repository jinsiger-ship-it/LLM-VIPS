// 실행: node tests/integration.cjs (추가 패키지 불필요)
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const values=new Map();let fail=false,checks=0;
const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('quota');values.set(k,v);}};
const ctx=vm.createContext({console,localStorage:storage});
for(const f of ['game-data','storage','game','tickets'])vm.runInContext(fs.readFileSync(__dirname+'/../js/'+f+'.js','utf8'),ctx);
const F=ctx.FP;F.toast=()=>{};const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
test('기본값과 잘못된 커리어 분리 복구',()=>{assert.equal(F.normalize({career:{}}).career,null);assert.equal(F.normalize({career:{stats:[1,'2',3],step:1,log:[]}}).career,null);});
const ticket={...F.copy(F.sample),id:'test'};
test('티켓 생성, 동일 ID 수정, 복원',()=>{F.data=F.defaults();assert(F.saveTicket(ticket));assert(F.saveTicket({...ticket,note:'수정'}));assert.equal(F.data.tickets.length,1);assert.equal(F.load(storage).tickets[0].note,'수정');});
test('대표 티켓 삭제 연동과 게시 사본 유지',()=>{F.transact(d=>{d.profile.featuredTicketId='test';d.posts.push({id:'p',ticket:F.copy(d.tickets[0]),comments:[]});});assert(F.deleteTicket('test'));assert.equal(F.data.profile.featuredTicketId,null);assert.equal(F.data.posts[0].ticket.id,'test');});
test('미획득 보상 적용 차단',()=>{assert.equal(F.saveTicket({...ticket,frameId:'star'}),false);});
test('세 결말, 중복 방지, 새 선수 후 보상 유지',()=>{F.data=F.defaults();for(let option=0;option<3;option++){assert(F.startCareer('테스트','투수'));for(let i=0;i<8;i++)assert(F.choose(option));assert.equal(F.ending(F.data.career.stats),['steady','star','legend'][option]);assert(F.data.inventory.itemIds.includes(['steady','star','legend'][option]));}assert.equal(F.data.inventory.itemIds.length,4);assert.equal(F.data.inventory.titleIds.length,3);F.grant(F.data);assert.equal(F.data.inventory.itemIds.length,4);F.startCareer('새 선수','내야수');assert.equal(F.data.inventory.itemIds.length,4);});
test('진행 중 커리어 저장 복원',()=>{F.choose(1);const loaded=F.load(storage);assert.equal(loaded.career.step,1);assert.equal(loaded.career.log.length,1);assert.deepEqual(JSON.stringify(loaded.career),JSON.stringify(F.data.career));});
test('획득 보상 디자인 저장·복원',()=>{assert(F.saveTicket({...ticket,frameId:'star',stickerIds:['rookie','legend']}));const t=F.load(storage).tickets[0];assert.equal(t.frameId,'star');assert.equal(t.stickerIds.length,2);});
test('저장 실패 시 게임·티켓·프로필·게시·좋아요·댓글 전체 불변',()=>{for(const change of [()=>F.choose(2),()=>F.deleteTicket('test'),()=>F.saveTicket({...ticket,note:'실패'}),()=>F.transact(d=>d.profile.nickname='실패'),()=>F.transact(d=>d.posts=[]),()=>F.transact(d=>d.posts[0].liked=true),()=>F.transact(d=>d.posts[0].comments.push({text:'실패'}))]){const before=JSON.stringify(F.data),persisted=values.get(F.key);fail=true;assert.equal(change(),false);fail=false;assert.equal(JSON.stringify(F.data),before);assert.equal(values.get(F.key),persisted);}});
test('이전 Diamond 데이터 변환 및 정상 티켓 보존',()=>{const d=F.normalize({tickets:[ticket,{id:'bad'}],rewards:['night','gold','trophy'],featured:'test',career:{}});assert.equal(d.tickets.length,1);assert.equal(d.profile.featuredTicketId,'test');assert.equal(d.inventory.itemIds.length,3);assert.equal(d.schemaVersion,2);});
test('악성 문자열 이스케이프와 외부 사진 차단',()=>{assert(!F.ticket({...ticket,note:'<script>alert(1)</script>',photo:'javascript:alert(1)'}).includes('<script>'));assert.equal(F.image('https://example.com/test.jpg'),'');});
test('전체 13,122 경로의 결말 분포와 보상 도달',()=>{const reports=[];for(const position of ['투수','내야수']){const counts={steady:0,star:0,legend:0};for(let route=0;route<6561;route++){let n=route,stats=position==='투수'?[45,43,44]:[44,45,43];for(let i=0;i<8;i++){const option=n%3;n=Math.floor(n/3);stats=stats.map((s,j)=>Math.min(100,s+F.effects[option][j]));}counts[F.ending(stats)]++;}assert(Object.values(counts).every(n=>n>0));assert.equal(Object.values(counts).reduce((a,b)=>a+b),6561);reports.push({position,counts});}console.log('PATH_COUNTS '+JSON.stringify(reports));});
test('같은 후보도 선택에 따라 기록과 진로가 갈림',()=>{
 const seed=27;
 const candidates=F.careerCandidates(seed);
 assert.equal(candidates.length,3);
 assert.deepEqual([...new Set(candidates.map(c=>c.position))],['투수','타자']);
 const make=(prospect,picks)=>F.restoreNewCareer({id:'test-player',seed,rules:2,prospect,picks});
 for(const prospect of [0,1]) {
  const recovered=make(prospect,[2]);
  const competing=make(prospect,[1]);
  assert.equal(recovered.role,'farm');
  assert.notEqual(competing.role,recovered.role);
  assert.notEqual(F.careerChoices(competing)[2].label,F.careerChoices(recovered)[2].label);
  assert.notEqual(F.careerRecord(competing),F.careerRecord(recovered));
  assert.equal(JSON.stringify(F.restoreNewCareer(competing)),JSON.stringify(competing));
 }
});
test('드래프트·시즌·과거 선수와 기념 티켓을 저장',()=>{
 F.data=F.defaults();
 assert(F.openCareerDraft());
 const board=F.data.careerDraft;
 assert.equal(JSON.stringify(F.load(storage).careerDraft),JSON.stringify(board));
 assert(F.signProspect(board.id,'새 신인',0));
 for(let season=1;season<=F.careerLength;season++) {
  assert(F.advanceCareer(board.id,season,1));
  assert.equal(F.advanceCareer(board.id,season,0),false);
 }
 const completed=F.data.career;
 assert.equal(completed.log.length,3);
 const memory=F.careerTicket(completed,'2026-11-10');
 assert(F.saveTicket(memory));
 assert.match(F.ticket(F.load(storage).tickets[0]),/FANPLAY \/ 커리어/);
 assert(F.openCareerDraft());
 const loaded=F.load(storage);
 assert.equal(loaded.career,null);
 assert.equal(loaded.careerHistory[0].id,board.id);
 assert.equal(JSON.stringify(loaded.careerHistory[0]),JSON.stringify(completed));
 assert.equal(loaded.tickets[0].id,memory.id);
});
test('자동 시즌은 제안에서 멈추고 같은 선택을 복원',()=>{
 F.data=F.defaults();
 assert(F.openCareerDraft());
 const {id}=F.data.careerDraft;
 assert(F.signAutoProspect(id,'자동 진행 신인',0));
 assert(F.advanceAutoCareer(id,0,-1));
 const paused=F.load(storage).career;
 assert.equal(paused.pending.title,'첫 1군 제안');
 assert.equal(F.advanceAutoCareer(id,1,-1),false);
 assert.equal(F.advanceAutoCareer(id,0,0),false);
 assert(F.advanceAutoCareer(id,1,0));
 assert.equal(F.data.career.role,'relief');
 const farm=F.restoreCareer({...paused,moves:[-1,1,-1]});
 assert.equal(farm.log[0].role,'farm');
 assert(F.advanceAutoCareer(id,2,-1,true));
 assert.equal(F.data.career.log[0].role,'relief');
 assert.notEqual(F.careerRecord(farm),F.careerRecord(F.data.career));
 assert.equal(JSON.stringify(F.load(storage).career),JSON.stringify(F.data.career));
});
test('7시즌 은퇴 또는 8시즌 연장 후 티켓과 기록을 보관',()=>{
 const advance=(move,skip=false)=>F.advanceAutoCareer(F.data.career.id,F.data.career.moves.length,move,skip);
 for(const retireOption of [0,1]) {
  F.data=F.defaults();
  assert(F.openCareerDraft());
  const {id}=F.data.careerDraft;
  assert(F.signAutoProspect(id,'은퇴하는 타자',1));
  for(let attempts=0;attempts<16 && F.data.career.step<7;attempts++) {
   assert(F.data.career.pending ? advance(0) : advance(-1,true));
  }
  assert.equal(F.data.career.pending.title,'은퇴를 결정할 때');
  assert.equal(F.data.career.step,7);
  assert(advance(retireOption));
  if(retireOption===1) assert(advance(-1,true));
  const completed=F.data.career;
  assert(F.careerComplete(completed));
  assert.equal(completed.step,7+retireOption);
  assert(F.saveTicket(F.careerTicket(completed,'2026-11-10')));
  assert(F.openCareerDraft());
  assert.equal(F.load(storage).careerHistory[0].step,7+retireOption);
  assert.equal(F.load(storage).tickets[0].mode,'커리어');
 }
});
test('중계는 같은 장면에서 유지되고 투수·타자 결과가 구분됨',()=>{
 const outcomes=new Set();
 for(const prospect of [0,1])for(let seed=0;seed<64;seed++) {
  const career=F.restoreCareer({id:'broadcast-test',seed,rules:3,prospect,moves:[]});
  const live=F.careerBroadcast(career);
  assert.deepEqual(live,F.careerBroadcast(career));
  assert.equal(live.half,prospect===0?'초':'말');
  assert.equal(live.frames[0].label,prospect===0?'등판':'타석');
  assert(live.frames.every(frame=>frame.balls<=3 && frame.strikes<=2));
  assert(['good','bad'].includes(live.frames.at(-1).tone));
  outcomes.add(live.frames.at(-1).label);
 }
 assert(outcomes.has('삼진') && outcomes.has('볼넷') && outcomes.has('안타') && outcomes.has('홈런'));
});
console.log('TOTAL '+checks+' PASS');
