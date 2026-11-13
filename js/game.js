/* 게임 규칙은 UI와 분리하여 전 경로 및 저장 실패를 독립 검사할 수 있게 합니다. */
FP.ending = stats => {const avg=stats.reduce((a,b)=>a+b,0)/3;return avg>=80?'legend':avg>=65?'star':'steady';};
FP.grant = data => {
 const id=FP.ending(data.career.stats);
 for(const item of ['rookie',id])if(!data.inventory.itemIds.includes(item))data.inventory.itemIds.push(item);
 if(!data.inventory.titleIds.includes(id))data.inventory.titleIds.push(id);
};
FP.startCareer = (name,position) => FP.transact(d=>{d.career={name:FP.str(name,24)||'신인 선수',position:['투수','포수','내야수','외야수'].includes(position)?position:'투수',stats:position==='투수'?[45,43,44]:[44,45,43],step:0,log:[]};});
FP.choose = option => {
 if(!Number.isInteger(option)||option<0||option>2||!FP.data.career||FP.data.career.step>=8)return false;
 return FP.transact(d=>{const c=d.career,scene=FP.scenes[c.step],before=[...c.stats];c.stats=c.stats.map((n,i)=>Math.min(100,n+FP.effects[option][i]));c.log.push({season:c.step+1,text:scene.title+' · '+scene.choices[option],delta:c.stats.map((n,i)=>n-before[i])});c.step++;if(c.step===8)FP.grant(d);});
};

FP.careerLength = 3;
FP.careerRoles = {
 farm:'2군 육성', starter:'1군 선발', relief:'1군 불펜', regular:'1군 주전', platoon:'1군 교체 출전'
};
FP.careerStatLabels = position => position==='투수' ? ['구위','제구','컨디션'] : ['장타력','컨택','컨디션'];

const prospects = [
 {position:'투수', style:'강속구 투수', stats:[61,42,57], trait:'구위가 좋지만 제구가 불안해요.'},
 {position:'투수', style:'제구형 투수', stats:[46,61,52], trait:'제구가 좋고 구위를 더 키울 수 있어요.'},
 {position:'투수', style:'이닝을 버티는 투수', stats:[49,48,68], trait:'컨디션이 좋고 결정구는 더 다듬어야 해요.'},
 {position:'타자', style:'장타 유망주', stats:[61,43,56], trait:'장타력이 좋지만 컨택이 불안해요.'},
 {position:'타자', style:'교타자', stats:[44,61,55], trait:'공을 잘 맞히고 장타력은 더 키울 수 있어요.'},
 {position:'타자', style:'꾸준한 타자', stats:[48,49,68], trait:'컨디션이 좋고 타격 기술은 더 다듬어야 해요.'}
];

function careerRoll(seed, offset, range) {
 const mixed = Math.imul((seed ^ offset) >>> 0, 0x45d9f3b);
 return ((mixed ^ (mixed >>> 16)) >>> 0) % range;
}

FP.careerCandidates = seed => {
 const pitcher = careerRoll(seed, 7, 3);
 const hitter = 3 + careerRoll(seed, 19, 3);
 const remaining = prospects.map((_, index) => index).filter(index => index!==pitcher && index!==hitter);
 return [pitcher, hitter, remaining[careerRoll(seed, 31, remaining.length)]].map(index => ({
  ...prospects[index], stats:prospects[index].stats.map((value, stat) => value + careerRoll(seed, 41 + index*5 + stat, 7) - 3)
 }));
};

FP.normalizeCareerDraft = draft => {
 if (!draft || typeof draft.id!=='string' || !/^[a-z0-9-]{1,48}$/.test(draft.id) ||
  !Number.isInteger(draft.seed) || draft.seed<0 || draft.seed>0xffffffff) return null;
 return {id:draft.id, seed:draft.seed};
};

FP.openCareerDraft = () => {
 const current = FP.data.career;
 if (FP.data.careerDraft || (current && (!current.id || !FP.careerComplete(current)))) return false;
 const seed = Math.floor(Math.random() * 0x100000000);
 const id = `${Date.now().toString(36)}-${seed.toString(36)}`;
 return FP.transact(data => {
  if (current) data.careerHistory.unshift(current);
  data.career = null;
  data.careerDraft = {id, seed};
 });
};

FP.careerChoices = career => {
 const pitcher = career.position==='투수';
 const promoted = career.role!=='farm';
 const starting = ['starter','regular'].includes(career.role);
 return [
  {label:starting ? '주전 자리 지키기' : pitcher ? '선발 경쟁에 도전' : '주전 경쟁에 도전',
   hint:'큰 역할을 노려요. 기준에 못 미치면 2군에서 다시 기회를 잡아요.', delta:[7,3,-16]},
  {label:pitcher ? '불펜 역할에 집중' : '교체 출전 기회 잡기',
   hint:pitcher ? '제구를 다듬어 짧은 이닝의 기회를 노려요.' : '컨택을 다듬어 교체 출전 기회를 노려요.', delta:[2,7,-7]},
  {label:promoted ? '휴식하고 현재 역할 유지' : '2군에서 컨디션 회복',
   hint:'출전량을 줄이고 다음 시즌을 준비해요.', delta:[1,1,20]}
 ];
};

function seasonRecord(position, role, rating, rest) {
 const firstTeam = role!=='farm';
 const starting = ['starter','regular'].includes(role);
 if (position==='투수') {
  const innings = (starting ? 96 : firstTeam ? 34 : 43) + Math.floor(rating/4) - (rest ? 18 : 0);
  const earnedRuns = Math.round(innings * Math.max(2, 7-rating/20)/9);
  return {innings, earnedRuns, saves:role==='relief' ? Math.max(0, Math.floor((rating-42)/3) - (rest ? 2 : 0)) : 0};
 }
 const atBats = (starting ? 355 : firstTeam ? 118 : 160) + rating - (rest ? 65 : 0);
 const hits = Math.round(atBats * (0.17 + rating/650));
 const homeRuns = Math.min(hits, Math.floor(atBats * Math.max(0,rating-38)/850));
 return {atBats, hits, homeRuns, rbi:Math.round(hits*0.31 + homeRuns*1.3)};
}

function careerMoment(log, role, record) {
 if (record.saves>0 && log.every(entry => !entry.record.saves)) return '첫 세이브';
 if (role!=='farm' && log.every(entry => entry.role==='farm')) return '첫 1군 데뷔';
 return record.homeRuns>0 && log.every(entry => !entry.record.homeRuns) ? '첫 홈런' : '';
}

function playCareerSeason(career, option) {
 const {label, delta} = FP.careerChoices(career)[option];
 const season = career.step + 1;
 const stats = career.stats.map((value, index) => FP.number(value+delta[index], 0, 100));
 const rating = Math.round(stats[0]*0.43 + stats[1]*0.37 + stats[2]*0.20) + careerRoll(career.seed, 200+season, 11)-5;
 const pitcher = career.position==='투수';
 let role = career.role;
 let reason = role==='farm' ? '2군에서 출전량을 줄이고 컨디션을 회복했어요.' : '출전량을 줄여 컨디션을 회복하면서 기존 1군 역할을 지켰어요.';
 if (option!==2) {
  const eligible = stats[2]>=(option===0 ? 42 : 34);
  const threshold = option===0 ? 58 : 50;
  role = eligible && rating>=threshold ? (pitcher ? (option===0 ? 'starter' : 'relief') : (option===0 ? 'regular' : 'platoon')) : 'farm';
  reason = !eligible ? '컨디션이 부족해 1군 역할을 맡지 못했어요.'
   : role==='farm' ? '경쟁에서 성과 기준에 못 미쳐 2군에서 기회를 이어가요.'
   : option===0 ? '기술 성장과 시즌 성과를 인정받아 1군의 주전 역할을 맡았어요.'
   : pitcher ? '제구를 살린 활약으로 1군 불펜 기회를 얻었어요.' : '컨택을 살린 활약으로 1군 교체 출전 기회를 얻었어요.';
 }
 const record = seasonRecord(career.position, role, rating, option===2);
 const moment = careerMoment(career.log,role,record);
 career.stats = stats;
 career.role = role;
 career.step = season;
 career.log.push({season, label, role, reason, record, moment});
}

FP.restoreNewCareer = saved => {
 const draft = FP.normalizeCareerDraft(saved);
 if (!draft || saved.rules!==2 || ![0,1,2].includes(saved.prospect) || !Array.isArray(saved.picks) ||
  saved.picks.length>FP.careerLength || saved.picks.some(pick => ![0,1,2].includes(pick))) return null;
 const candidate = FP.careerCandidates(draft.seed)[saved.prospect];
 const career = {...draft, rules:2, prospect:saved.prospect, picks:[...saved.picks], name:FP.str(saved.name,24)||'신인 선수',
  position:candidate.position, style:candidate.style, stats:candidate.stats, role:'farm', step:0, log:[]};
 for (const option of career.picks) playCareerSeason(career, option);
 return career;
};

function signCareer(id, name, prospect, rules) {
 if (FP.data.career || FP.data.careerDraft?.id!==id) return false;
 const career = FP.restoreCareer({...FP.data.careerDraft, name:FP.str(name,24).trim(), prospect, rules, picks:[], moves:[]});
 if (!career) return false;
 return FP.transact(data => { data.career = career; data.careerDraft = null; });
}

FP.signProspect = (id, name, prospect) => signCareer(id,name,prospect,2);
FP.signAutoProspect = (id, name, prospect) => signCareer(id,name,prospect,3);

FP.advanceCareer = (id, season, option) => {
 const career = FP.data.career;
 if (career?.rules!==2 || career.id!==id || career.step+1!==season || career.step>=FP.careerLength || ![0,1,2].includes(option)) return false;
 return FP.transact(data => {
  data.career = FP.restoreNewCareer({...career, picks:[...career.picks,option]});
  if (data.career.step===FP.careerLength && !data.inventory.itemIds.includes('rookie')) data.inventory.itemIds.push('rookie');
 });
};

FP.careerRecord = (career, entries = career.log) => {
 const sum = key => entries.reduce((total, entry) => total + entry.record[key], 0);
 if (career.position==='투수') {
  const innings = sum('innings');
  return `${innings}이닝 · ERA ${innings ? (sum('earnedRuns')*9/innings).toFixed(2) : '—'} · ${sum('saves')}세이브`;
 }
 const atBats = sum('atBats');
 return `타율 ${atBats ? (sum('hits')/atBats).toFixed(3) : '—'} · ${sum('homeRuns')}홈런 · ${sum('rbi')}타점`;
};

FP.careerConclusion = career => {
 const majors = career.log.filter(entry => entry.role!=='farm').length;
 if (career.rules===3) return majors>=Math.ceil(career.step/2) ? '1군 베테랑' : majors ? '1군 무대를 밟은 선수' : '2군을 지킨 베테랑';
 return majors>=2 ? '1군에 자리 잡은 선수' : majors===1 ? '1군 무대를 밟은 선수' : '2군에서 성장한 선수';
};

FP.careerTicket = (career, date) => {
 const entry = career.log.find(season => season.moment);
 return {
  ...FP.sample, id:`career-${career.id}`, date, mode:'커리어', stadium:'FANPLAY 가상 리그',
  home:career.name, away:career.position, hs:0, as:0,
  tag:entry?.moment || (career.rules===3 ? '은퇴 기념' : '3시즌 완주'), note:entry ? `${entry.season}시즌 · ${FP.careerRecord(career,[entry])}` : FP.careerRecord(career),
  stickerIds:['rookie']
 };
};

const autoTick = -1;
const lastRegularSeason = 7;

FP.careerComplete = career => career?.rules===3 ? career.retired : career?.rules===2 && career.step===FP.careerLength;
FP.restoreCareer = saved => saved?.rules===3 ? restoreAutoCareer(saved) : FP.restoreNewCareer(saved);

function autoRating(career) {
 const [power, technique, condition] = career.stats;
 return Math.round(power*0.43 + technique*0.37 + condition*0.20) + careerRoll(career.seed,900+career.step,11)-5;
}

const broadcastResults = {
 strikeout:{label:'삼진', calls:['strike','ball','foul'], line:'헛스윙! 삼진으로 타석을 마무리합니다.'},
 walk:{label:'볼넷', calls:['ball','strike','ball','ball'], line:'마지막 공도 낮게 빠집니다. 볼넷으로 1루에 갑니다.'},
 hit:{label:'안타', calls:['strike','ball'], line:'타구가 내야를 빠져나갑니다. 안타입니다!'},
 homeRun:{label:'홈런', calls:['ball','foul'], line:'멀리 뻗어 갑니다. 담장을 넘겼습니다!'},
 groundout:{label:'땅볼 아웃', calls:['ball','strike'], line:'유격수가 잡아 1루로 송구합니다. 아웃!'},
 flyout:{label:'뜬공 아웃', calls:['strike','foul'], line:'외야수가 타구를 따라가 잡았습니다. 아웃!'}
};

FP.careerBroadcast = career => {
 const pitcher = career.position==='투수';
 const [power, technique, condition] = career.stats;
 const offset = 1300 + career.step*8 + career.segment*3;
 const roll = careerRoll(career.seed,offset,100);
 const walk = pitcher ? Math.round(18 - technique/6 + Math.max(0,50-condition)/3) : 9;
 const strikeout = pitcher ? 11 + Math.round(power/5) : Math.round(25 - technique/5 + Math.max(0,45-condition)/4);
 const homer = pitcher ? 3 : Math.round(power/9);
 const hit = pitcher ? 24 : 13 + Math.round(technique/5);
 const result = roll<walk ? 'walk' : roll<walk+strikeout ? 'strikeout' : roll<walk+strikeout+homer ? 'homeRun'
  : roll<walk+strikeout+homer+hit ? 'hit' : roll%2===0 ? 'groundout' : 'flyout';
 const outcome = broadcastResults[result];
 const inning = career.role==='relief' ? 7+careerRoll(career.seed,offset+1,3) : 1+careerRoll(career.seed,offset+1,6);
 const outs = careerRoll(career.seed,offset+2,3);
 const goodForHitter = ['walk','hit','homeRun'].includes(result);
 const lead = pitcher ? '마운드에 올랐습니다. 첫 공을 준비합니다.' : '타석에 들어섰습니다. 투수를 바라봅니다.';
 const pitches = {
  strike:['바깥쪽을 찌르는 직구. 스트라이크!','낮게 깔린 변화구, 스트라이크가 들어갑니다.'],
  ball:['공이 바깥쪽으로 빠집니다. 볼.', '변화구가 무릎 아래로 떨어집니다. 볼.'],
  foul:['배트에 스쳤습니다. 1루 쪽 파울.', '타구가 3루 쪽 파울 라인 밖으로 벗어납니다.']
 };
 let balls = 0;
 let strikes = 0;
 const frames = [{label:pitcher?'등판':'타석',line:lead,balls,strikes}];
 outcome.calls.forEach((call,index) => {
  if (call==='ball') balls++;
  else strikes++;
  frames.push({label:call==='ball'?'볼':call==='foul'?'파울':'스트라이크',line:pitches[call][(roll+index)%2],balls,strikes});
 });
 frames.push({label:outcome.label,line:outcome.line,balls,strikes,tone:goodForHitter!==pitcher?'good':'bad'});
 return {inning,outs,half:pitcher?'초':'말',frames,result};
};

function autoDecision(career) {
 const pitcher = career.position==='투수';
 const startingRole = pitcher ? 'starter' : 'regular';
 const specialistRole = pitcher ? 'relief' : 'platoon';
 const specialist = pitcher ? '불펜' : '교체 출전';
 const starting = pitcher ? '선발' : '주전';
 const rating = autoRating(career);
 switch (career.step+1) {
  case 1:
   return {title:'첫 1군 제안', prompt:`코치가 1군 ${specialist} 기회를 제안했어요. 지금 올라갈지, 2군에서 더 큰 역할을 준비할지 골라요.`, choices:[
    {label:`1군 ${specialist} 제안 수락`, hint:'바로 1군에서 뛰지만 출전 부담이 늘어요.', role:specialistRole, delta:[0,3,-9]},
    {label:`2군에서 ${starting} 준비`, hint:'당장 승격을 미루고 기술과 체력을 쌓아요.', role:'farm', delta:[5,4,8]}
   ]};
  case 2:
   return {title:`${starting} 경쟁`, prompt:`지난 시즌 경험을 바탕으로 ${starting} 테스트에 도전할 수 있어요.`, choices:[
    {label:`${starting} 테스트 참가`, hint:`기량과 컨디션이 좋으면 1군 ${starting}에 뽑혀요.`, role:rating>=54 && career.stats[2]>=42 ? startingRole : 'farm', delta:[6,3,-9]},
    {label:'지금 맡은 역할에 집중', hint:'역할을 지키며 기술을 다듬고 컨디션을 회복해요.', delta:[2,5,12]}
   ]};
  case 3: {
   const club = career.club==='하버스' ? '웨이브스' : '하버스';
   return {title:'다른 팀의 제안', prompt:`${club}가 출전 기회를 제안했어요. 새 팀으로 옮기면 ${specialist}부터 시작해요.`, choices:[
    {label:`${club}로 이적`, hint:'새 팀에서 1군 기회를 얻고 다른 역할에 적응해요.', club, role:specialistRole, delta:[2,4,-7]},
    {label:`${career.club}에 잔류`, hint:'지금 역할을 유지하며 익숙한 환경에서 성장해요.', delta:[4,3,6]}
   ]};
  }
  case 4:
   return {title:'전성기의 승부수', prompt:`코치가 1군 ${starting} 경쟁을 제안했어요. 지금 상태에서 더 많은 출전을 감당할지 결정해요.`, choices:[
    {label:`1군 ${starting}에 도전`, hint:'성공하면 출전이 늘어요. 컨디션이 부족하면 2군에서 다시 준비해요.', role:rating>=57 && career.stats[2]>=43 ? startingRole : 'farm', delta:[5,3,-15]},
    {label:'안정적인 1군 역할 선택', hint:`${specialist} 역할로 컨디션을 관리해요.`, role:specialistRole, delta:[1,5,9]}
   ]};
  case 5:
   if (career.stats[2]>=48) return null;
   return {title:pitcher ? '제구 난조' : '타격 슬럼프', prompt:'최근 경기력이 흔들려 코치가 출전 일정을 조정하자고 했어요.', choices:[
    {label:'출전 일정 유지', hint:'출전 기회를 지키지만 피로가 더 쌓여요.', delta:[4,1,-12]},
    {label:'일정을 줄이고 점검', hint:'이번 시즌 출전이 줄고 컨디션과 기술을 회복해요.', rest:true, delta:[0,4,22]}
   ]};
  case 6:
   return {title:'베테랑의 새 역할', prompt:`경험을 살려 1군 ${specialist}로 전환하거나 익숙한 보직을 이어갈 수 있어요.`, choices:[
    {label:`${specialist} 역할 전환`, hint:'짧은 출전을 소화하며 컨디션을 관리해요.', role:specialistRole, delta:[-2,4,13]},
    {label:'익숙한 보직 유지', hint:'현재 역할에서 한 시즌 더 뛰어요.', delta:[2,1,-9]}
   ]};
  default: return null;
 }
}

function changeAutoStats(career, delta) {
 career.stats = career.stats.map((value,index) => FP.number(value+delta[index],0,100));
}

function resolveAutoMove(career, move) {
 if (career.retired) return false;
 if (career.pending) {
  const choice = career.pending.choices[move];
  if (!choice) return false;
  career.pending = null;
  career.news = `${choice.label} 선택`;
  if (choice.retire) career.retired = true;
  else if (choice.extend) career.extended = true;
  else {
   career.decision = choice.label;
   career.role = choice.role ?? career.role;
   career.club = choice.club ?? career.club;
   career.rest = Boolean(choice.rest);
   changeAutoStats(career,choice.delta);
   career.news = `${choice.label} · ${career.club} ${FP.careerRoles[career.role]}`;
  }
  return true;
 }
 if (move!==autoTick) return false;
 const season = career.step+1;
 const workload = {farm:3,starter:10,regular:10,relief:6,platoon:6}[career.role];
 if (career.segment===0) {
  changeAutoStats(career, season>=6 ? [-1,1,-workload] : [2,2,-workload]);
  career.segment = 1;
  career.news = career.stats[2]<48 ? '전반기 일정이 끝났어요. 피로가 쌓이면서 경기력이 흔들리고 있어요.' : `전반기 일정이 끝났어요. ${FP.careerRoles[career.role]}에서 출전 경험을 쌓았어요.`;
  career.pending = autoDecision(career);
  return true;
 }
 const record = seasonRecord(career.position,career.role,autoRating(career),career.rest);
 const moment = careerMoment(career.log,career.role,record);
 career.log.push({season,club:career.club,role:career.role,label:career.decision||'시즌 진행',record,moment});
 career.step = season;
 career.segment = 0;
 career.rest = false;
 career.decision = '';
 changeAutoStats(career,[0,0,season>=6 ? 9 : 17]);
 career.news = moment ? `${season}시즌 결산 · ${moment}` : `${season}시즌 결산이 나왔어요.`;
 if (season===lastRegularSeason) {
  career.pending = {title:'은퇴를 결정할 때',prompt:'지금 커리어를 마무리하거나, 현재 팀에서 한 시즌 더 뛸 수 있어요.',choices:[
   {label:'지금 은퇴하기',hint:'7시즌의 기록과 기념 티켓을 남겨요.',retire:true},
   {label:'마지막 한 시즌 더 뛰기',hint:'현재 팀과 역할로 마지막 시즌을 보낸 뒤 은퇴해요.',extend:true}
  ]};
 }
 if (season===lastRegularSeason+1) career.retired = true;
 return true;
}

function restoreAutoCareer(saved) {
 const draft = FP.normalizeCareerDraft(saved);
 if (!draft || ![0,1,2].includes(saved.prospect) || !Array.isArray(saved.moves) || saved.moves.length>24) return null;
 const candidate = FP.careerCandidates(draft.seed)[saved.prospect];
 const career = {...draft,rules:3,prospect:saved.prospect,moves:[...saved.moves],name:FP.str(saved.name,24)||'신인 선수',
  position:candidate.position,style:candidate.style,stats:candidate.stats,club:careerRoll(draft.seed,70,2) ? '하버스' : '웨이브스',
  role:'farm',step:0,segment:0,log:[],pending:null,retired:false,extended:false,rest:false,decision:'',news:'드래프트를 마치고 2군에서 첫 시즌을 시작해요.'};
 for (const move of career.moves) {
  if (![autoTick,0,1].includes(move) || !resolveAutoMove(career,move)) return null;
 }
 return career;
}

FP.advanceAutoCareer = (id, version, move, skip = false) => {
 const current = FP.data.career;
 if (current?.rules!==3 || current.id!==id || current.moves.length!==version || ![autoTick,0,1].includes(move)) return false;
 const next = restoreAutoCareer({...current,moves:[...current.moves,move]});
 if (!next) return false;
 while (skip && !next.pending && !next.retired) {
  resolveAutoMove(next,autoTick);
  next.moves.push(autoTick);
 }
 return FP.transact(data => {
  data.career = next;
  if (next.retired && !data.inventory.itemIds.includes('rookie')) data.inventory.itemIds.push('rookie');
 });
};
