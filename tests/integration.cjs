// 실행: node tests/integration.cjs (추가 패키지 불필요)
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const values=new Map();let fail=false,checks=0;
const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('quota');values.set(k,v);}};
const ctx=vm.createContext({console,localStorage:storage});
for(const f of ['game-data','storage','game','tickets'])vm.runInContext(fs.readFileSync(__dirname+'/../js/'+f+'.js','utf8'),ctx);
const F=ctx.FP;F.toast=()=>{};const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
test('기본값과 잘못된 커리어 분리 복구',()=>{assert.equal(F.normalize({career:{}}).career,null);assert.equal(F.normalize({career:{stats:[1,'2',3],step:1,log:[]}}).career,null);});
const ticket={...F.copy(F.sample),id:'test'};
test('v1.1 브라우저 기록을 원본과 별도로 복원',()=>{
 const legacyTicket={id:'legacy',date:'2026-04-01',home:'홈',away:'원정',place:'잠실',score:'5 : 3',memory:'첫 경기',layout:'scoreboard',accent:'red'};
 const raw=JSON.stringify({tickets:[legacyTicket],posts:[{id:'old-post',ticket:legacyTicket,author:'팬',message:'응원'}]});
 const legacyStorage={getItem:key=>key==='fanplay-prototype-v1'?raw:null};
 const restored=F.load(legacyStorage);
 assert.deepEqual([restored.tickets[0].stadium,restored.tickets[0].hs,restored.tickets[0].as,restored.tickets[0].note],['잠실',5,3,'첫 경기']);
 assert.deepEqual([restored.posts[0].nickname,restored.posts[0].text],['팬','응원']);
 assert.notEqual(F.key,'fanplay-prototype-v1');
});
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
console.log('TOTAL '+checks+' PASS');
