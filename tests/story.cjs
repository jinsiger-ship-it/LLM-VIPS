const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const values=new Map();let fail=false;
const localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>{if(fail)throw Error('quota');values.set(k,v);},removeItem:k=>values.delete(k)};
const ctx=vm.createContext({localStorage,console,location:{protocol:'file:'}});
for(const f of ['game-data','storage','game','career-story','tickets','account'])vm.runInContext(fs.readFileSync(__dirname+'/../js/'+f+'.js','utf8'),ctx);
const F=ctx.FP;F.toast=()=>{};
const start=(position,seed=47)=>F.restoreCareer({rules:7,id:'story-'+seed,seed,name:'테스트',position,moves:[]});
const tick=(c,move)=>{const next=F.restoreCareer({...c,moves:[...c.moves,move]});assert(next,'valid move '+move+' '+c.pending?.id);return next;};
const finish=(position,seed,select)=>{
 let c=start(position,seed);
 for(let i=0;i<65&&!c.retired;i++) {
  c=tick(c,c.pending?select(c): -1);
  assert.equal(JSON.stringify(F.restoreCareer(c)),JSON.stringify(c),'deterministic restore');
  assert(c.stats.every(n=>n>=0&&n<=100));
 }
 assert(c.retired);assert(c.step===7||c.step===8);return c;
};
const rewards=new Set(),events=new Set(),titles=new Set(),outcomes=new Set();
for(const position of ['투수','타자'])for(let seed=0;seed<350;seed++) {
 let random=seed+1;
 const c=finish(position,seed,c=>{
  events.add(c.pending.id);random=(Math.imul(random,1664525)+1013904223)>>>0;
  return random%c.pending.choices.length;
 });
 F.storyRewardIds(c).forEach(x=>rewards.add(x));F.careerTitleOptions(c).forEach(x=>titles.add(x.id));c.duels.forEach(x=>outcomes.add(x.result));
 assert.equal(c.story.filter(e=>e.id!=='retirement').length,c.step*3);
 assert.equal(F.careerTitleOptions(c).length,3);
 const forged=F.restoreCareer({...c,stats:[100,100,100],speed:100,flags:{mentor:true},log:[],selectedTitleId:'legend'});
 assert.deepEqual(forged.stats,c.stats);assert.equal(forged.selectedTitleId,null);
}
assert.equal(rewards.size,20,'all decorations reachable');
assert(events.has('experiment-test')&&events.has('experiment-final'));
assert(events.has('rival-1')&&events.has('rival-4')&&events.has('rival-6'));
console.log('PASS 700 careers: replay, 20 reachable decorations, '+events.size+' events, '+titles.size+' titles, '+outcomes.size+' outcomes');
let c=start('투수');c=tick(c,-1);c=tick(c,2);
while(c.pending?.id!=='promise')c=tick(c,c.pending?0:-1);
assert.match(c.pending.prompt,/작년에/);
assert.equal(F.restoreCareer({...c,moves:[...c.moves,-1]}),null);
assert.equal(F.restoreCareer({...c,moves:[...c.moves,99]}),null);
console.log('PASS promised role returns next season, invalid moves blocked');
F.data=F.defaults();F.data.career=start('타자');
assert(F.advanceAutoCareer(F.data.career.id,0,-1,true));assert(F.data.career.pending);
assert.equal(F.advanceAutoCareer(F.data.career.id,0,0),false);
const before=JSON.stringify(F.data);fail=true;assert.equal(F.advanceAutoCareer(F.data.career.id,1,0),false);fail=false;assert.equal(JSON.stringify(F.data),before);
assert.equal(F.data.tickets.length,0);
c=finish('타자',18,career=>career.pending.id==='retirement'?1:0);
F.data.career=c;F.grantStoryRewards(F.data,c);F.grantStoryRewards(F.data,c);
assert.equal(new Set(F.data.inventory.itemIds).size,F.data.inventory.itemIds.length);
const title=F.careerTitleOptions(c)[0].id;assert(F.selectCareerTitle(c.id,title));assert.equal(F.normalize(F.data).career.selectedTitleId,title);
assert.equal(F.selectCareerTitle(c.id,'legend'),false);
assert(F.openCareerDraft());assert.equal(F.normalize(F.data).careerHistory[0].selectedTitleId,title);
assert.equal(F.data.tickets.length,0);
console.log('PASS skip stops, duplicate/stale saves blocked, failed save unchanged, retirement titles persist, no game ticket');
F.data=F.defaults();
for(const i of F.items) {
 const field={frame:'frameId',background:'backgroundId',badge:'badgeId',sticker:'stickerIds'}[i.type];
 const ticket={...F.sample,id:'decor-'+i.id,[field]:i.type==='sticker'?[i.id]:i.id};
 assert.equal(F.saveTicket(ticket),false);
 F.data.inventory.itemIds.push(i.id);assert(F.saveTicket(ticket));
 assert.equal(JSON.stringify(F.normalize(F.data).tickets.find(t=>t.id===ticket.id)[field]),JSON.stringify(ticket[field]));
}
const guest=F.copy(F.data),account=F.defaults();account.tickets=[{...guest.tickets[0],note:'계정 수정'}];
guest.tickets[0].note='기기 수정';account.career=start('투수',2);guest.career=start('타자',3);
const a=F.mergeGuestRecords(account,guest,'account'),b=F.mergeGuestRecords(account,guest,'device');
assert.equal(a.tickets.find(t=>t.id===account.tickets[0].id).note,'계정 수정');assert.equal(b.tickets.find(t=>t.id===account.tickets[0].id).note,'기기 수정');
assert.equal(a.career.position,'투수');assert.equal(b.career.position,'타자');assert.equal(a.tickets.length,20);assert.equal(b.inventory.itemIds.length,20);
console.log('PASS all decoration types save, unearned decoration blocked, account/device conflict preference and union');
assert.equal(a.savedCareers[0].career.position,'타자');assert.equal(b.savedCareers[0].career.position,'투수');
F.data=F.defaults();F.data.career=F.restoreCareer({id:'old-auto',seed:15,rules:3,prospect:0,moves:[-1,0]});
const old=JSON.stringify(F.data.career);assert(F.newStoryWithBackup());
assert.equal(JSON.stringify(F.normalize(F.data).savedCareers[0].career),old);
assert(F.signStoryPlayer(F.data.careerDraft.id,'새 선수','타자','우타',0));assert(F.resumeSavedCareer('old-auto'));
assert.equal(JSON.stringify(F.data.career),old);assert.equal(F.data.savedCareers[0].career.rules,6);
F.data=F.defaults();F.startCareer('예전 선수','투수');F.choose(0);const legacy=JSON.stringify(F.data.career);
assert(F.newStoryWithBackup());assert.equal(JSON.stringify(F.normalize(F.data).savedCareers[0].career),legacy);
console.log('PASS imported extra player retained, old rule 3 and legacy careers backed up and restored');
