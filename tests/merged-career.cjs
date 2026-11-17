const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({});for(const f of ['game-data','storage','game','career-story','tickets'])vm.runInContext(fs.readFileSync(__dirname+'/../js/'+f+'.js','utf8'),ctx);
const F=ctx.FP,rewards=new Set();
for(const position of ['타자','투수'])for(let seed=0;seed<60;seed++)for(let candidateIndex=0;candidateIndex<3;candidateIndex++) {
 const profile=F.careerAbilityCandidates(seed,position)[candidateIndex];assert.equal(profile.stats.reduce((a,b)=>a+b),240);
 const saved={rules:6,id:'merged-'+seed,seed,position,candidateIndex,startingAbilities:profile.stats,hand:position==='투수'?'좌투':'좌타',moves:[]};
 let c=F.restoreCareer(saved),random=seed+candidateIndex+1;assert(c);
 assert.equal(F.restoreCareer({...saved,startingAbilities:[40,40,40,40,40,41]}),null);
 while(!c.retired) {
  random=(Math.imul(random,1664525)+1013904223)>>>0;
  c=F.restoreCareer({...c,moves:[...c.moves,c.pending?random%c.pending.choices.length:-1]});assert(c);
  assert.equal(JSON.stringify(c),JSON.stringify(F.restoreCareer(c)));
  assert(c.abilities.every(n=>n>=0&&n<=100));
 }
 F.storyRewardIds(c).forEach(x=>rewards.add(x));
 // GitHub's old random candidate career stays under its original rules.
 const old=F.restoreCareer({...saved,rules:5,moves:[-1,0]});assert.equal(old.rules,5);assert.equal(old.moves.length,2);
}
assert.equal(rewards.size,20);
const remoteCustom=F.restoreCareer({rules:4,id:'remote-four',seed:5,position:'타자',hand:'우타',startingAbilities:[50,50,50,50,50,50],moves:[]});assert.equal(remoteCustom.rules,4);
const localStory=F.restoreCareer({rules:4,id:'local-four',seed:5,position:'타자',moves:[-1,2]});assert.equal(localStory.rules,7);assert(localStory.flags.promise);
const state=F.normalize({career:localStory,careerHistory:[],savedCareers:[{id:'old',career:remoteCustom}]});assert.equal(state.savedCareers[0].career.rules,4);
const ticket=F.ticketData({id:'old-ticket',date:'2026-11-17',home:'홈',away:'원정',place:'잠실',score:'3:2',memory:'예전 추억',layout:'classic',accent:'navy'});assert.equal(ticket.note,'예전 추억');assert.equal(ticket.hs,3);
console.log('PASS 360 merged careers, 20 reachable rewards, exact replay, six abilities, invalid candidates, both rule-4 formats, legacy tickets');
