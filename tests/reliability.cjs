const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const data=new Map();
const localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
const scripts=['game-data','storage','game','career-story','tickets','match-results','account'];
function createTab(){
  const context=vm.createContext({localStorage});
  for(const script of scripts)vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',script+'.js'),'utf8'),context);
  const {FP}=context;
  FP.toast=()=>{};
  FP.data=FP.guestData=FP.defaults();
  return FP;
}
const first=createTab(),second=createTab();
const firstTicket={...first.sample,id:'first'};
const secondTicket={...first.sample,id:'second'};
assert(first.saveTicket(firstTicket));
assert(second.saveTicket(secondTicket));
assert.equal(first.data.tickets.map(t=>t.id).join(','),'first');
assert.equal(second.data.tickets.map(t=>t.id).join(','),'second');
assert.equal(data.size,0);
assert.equal(createTab().data.tickets.length,0);

const damaged=JSON.stringify({tickets:[firstTicket],career:{stats:[30,30,30],step:1,log:[null]}});
data.set(first.key,damaged);
const legacy=createTab();
assert(legacy.saveTicket(secondTicket));
assert.equal(legacy.data.tickets[0].id,'second');
assert.equal(legacy.readDevice(localStorage).state.tickets[0].id,'first');
assert.equal(data.get(first.key),damaged);
data.set(first.key,'{unreadable');
const unreadable=createTab();
assert(unreadable.saveTicket(secondTicket));
assert(unreadable.readDevice(localStorage).unreadable);
assert.equal(data.get(first.key),'{unreadable');
const oldBackup=JSON.stringify({tickets:[firstTicket],posts:[]});
assert.equal(unreadable.parseRecordBackup(oldBackup).state.tickets[0].id,'first');
assert.throws(()=>unreadable.parseRecordBackup('{"schemaVersion":9,"tickets":[],"posts":[]}'));
const good=createTab();
data.clear();
assert(!good.saveTicket({...firstTicket,date:'2026-02-31'}));
assert(!good.saveTicket({...firstTicket,home:'  '}));
assert(!good.saveTicket({...firstTicket,hs:''}));
assert(good.saveTicket({...firstTicket,hs:0,as:0}));

const account=good.defaults(),guest=good.defaults();
account.careerDraft={id:'current-draft',seed:1};guest.careerDraft={id:'guest-draft',seed:2};
const merged=good.mergeGuestRecords(account,guest,'account');
assert.equal(merged.careerDraft.id,'current-draft');
assert.equal(merged.savedDrafts[0].id,'guest-draft');
assert.equal(good.mergeGuestRecords(merged,guest,'account').savedDrafts.length,1);

const base={date:'2026-04-01',stadium:'가상 야구장',home:'가상 홈',away:'가상 원정',homeScore:4,awayScore:2};
const parse=rows=>good.parseMatchResults(JSON.stringify(rows),false,true);
const april=parse([{...base,gameNo:1},{...base,gameNo:2,homeScore:2}]);
const may=parse([{...base,id:'may-1',date:'2026-05-01'},{...base,date:'2026-02-31'}]);
let month=good.mergeMatchResults([],april);
month=good.mergeMatchResults(month.matches,may);
assert.equal(month.matches.length,3);assert.equal(month.errors.length,1);
assert.equal(good.mergeMatchResults(month.matches,april).duplicate,2);
assert.equal(good.matchesAt(month.matches,base.date,base.stadium).length,2);
const reversed=good.mergeMatchResults(good.mergeMatchResults([],may).matches,april);
assert.deepEqual(month.matches.map(match=>match.id).sort(),reversed.matches.map(match=>match.id).sort());
assert.equal(good.mergeMatchResults(month.matches,parse([{...base,id:'may-1',date:'2026-05-01',homeScore:5}])).updated,1);

for(const position of ['투수','타자']){
  const hand=position==='투수'?'우투':'우타';
  const seed=15,startingAbilities=good.careerAbilityCandidates(seed,position)[0].stats;
  const candidate={id:'rule-test',seed,candidateIndex:0,position,hand,startingAbilities,moves:[]};
  const finish=rules=>{
    let career=good.restoreCareer({...candidate,rules});
    while(!career.retired)career=good.restoreCareer({...career,moves:[...career.moves,career.pending?0:-1]});
    return career;
  };
  const past=finish(6),current=finish(8);
  assert.equal(past.abilities[4],startingAbilities[4]);
  assert.equal(past.abilities[5],startingAbilities[5]);
  assert(current.abilities[4]>startingAbilities[4]);
  assert(current.abilities[5]>startingAbilities[5]);
  assert.equal(JSON.stringify(current),JSON.stringify(good.restoreCareer(current)));
}
console.log('PASS independent one-visit records, legacy preservation, backup parsing, cumulative KBO files, old and new game rules');
