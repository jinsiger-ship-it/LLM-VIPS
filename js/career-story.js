/* 규칙 4: 저장된 선택으로 사건·경기·보상·호칭을 재현합니다. 기존 규칙은 그대로 복원합니다. */
(() => {
 const restorePrevious = FP.restoreCareer;
 const completePrevious = FP.careerComplete;
 const advancePrevious = FP.advanceAutoCareer;
 const broadcastPrevious = FP.careerBroadcast;
 const recordPrevious = FP.careerRecord;
 const conclusionPrevious = FP.careerConclusion;
 const item = (id,name,type,icon,condition) => ({id,name,type,icon,condition});
 // 이전 네 보상 ID를 유지하면서 총 20종으로 확장합니다.
 FP.items = [
  item('steady','포레스트 자수','frame','▧','회복·기본기 선택 3회'),
  item('star','올스타 골드','frame','✧','1군에서 4시즌 보내기'),
  item('diamond','다이아몬드 라인','frame','◇','새 커리어 첫 은퇴'),
  item('stitch','레드 스티치','frame','⌁','라이벌 맞대결 1승'),
  item('night','구장 조명','background','☾','투수로 은퇴'),
  item('board','기록 전광판','background','▥','타자로 은퇴'),
  item('sunset','마지막 노을','background','◒','8시즌까지 뛰고 은퇴'),
  item('paper','추억의 스코어북','background','▤','한 구단에서 은퇴'),
  item('rookie','첫 완주 별','sticker','✦','커리어 첫 은퇴'),
  item('legend','레전드 트로피','sticker','♜','1군에서 5시즌 보내기'),
  item('heart','팬에게 보내는 하트','sticker','♡','하트 세리머니 선택'),
  item('dance','덕아웃 리듬','sticker','♫','동료와 춤 세리머니 선택'),
  item('signature','나의 사인','sticker','〰','팬의 사인 요청에 응하기'),
  item('ball','새로운 결정구','sticker','⚾','새 기술 훈련의 마지막 실전 도전 완료'),
  item('closer','9회의 문지기','badge','IX','통산 30세이브'),
  item('slugger','담장 너머','badge','HR','통산 50홈런'),
  item('rival','라이벌의 인정','badge','VS','라이벌 맞대결 2승'),
  item('mentor','다음 세대에게','badge','↗','후배 멘토 선택'),
  item('loyal','한 팀의 얼굴','badge','♥','이적 없이 7시즌 완주'),
  item('speed','베이스 러너','badge','➜','통산 30도루')
 ];
 const titles = [
  ['architect','마운드의 설계자'],['fireball','직구의 자존심'],['closer-title','9회를 닫는 사람'],
  ['slugger-title','담장을 넘는 해결사'],['contact','빈틈을 찾는 타자'],['runner','베이스의 바람'],
  ['challenger','승부를 즐기는 선수'],['craft','끝없이 배우는 선수'],['captain','함께 이기는 선수'],
  ['one-club','한 팀의 별'],['journey','끝까지 달린 선수']
 ];
 FP.titles.push(...titles.map(([id,name])=>({id,name})));
 FP.careerComplete = c => [6,7,8].includes(c?.rules) ? c.retired : completePrevious(c);
 FP.careerStyle = c => {
  if(![6,7,8].includes(c.rules)) return c.style;
  if(!c.story.length) return '나의 스타일을 찾아가는 중';
  if(c.position==='타자' && c.speed>=65 && c.traits.speed>=2) return '주루로 기회를 만드는 타자';
  const gap=c.stats[0]-c.stats[1];
  return c.position==='투수' ? gap>7?'구위 중심 투수':gap< -7?'제구 중심 투수':'균형 잡힌 투수'
   : gap>7?'장타 중심 타자':gap< -7?'정교한 타자':'균형 잡힌 타자';
 };
 const choice = (label,hint,delta=[0,0,0],extra={}) => ({label,hint,delta,...extra});
 const event = (id,category,title,prompt,choices) => ({id,category,title,prompt,choices});
 const pitch = c => c.position==='투수';
 const otherClub = c => c.club==='하버스'?'웨이브스':'하버스';
 const starting = c => pitch(c)?'starter':'regular';
 const relief = c => pitch(c)?'relief':'platoon';
 const word = c => pitch(c)?'선발':'주전';
 const rivalName = c => pitch(c)?'강태오':'윤도현';

 function roleEvent(c,s) {
  const p=pitch(c),w=word(c);
  if(s===1) return event('offer','진로','첫 1군 제안',`감독이 묻는다. “${p?'불펜':'교체 출전'} 자리가 생겼어. 지금 도전할래?”`,[
   choice('지금 1군에 도전한다','바로 출전 기회 · 컨디션 소모',[2,2,-9],{role:relief(c),tags:['courage']}),
   choice(`${w}를 목표로 준비한다`,'2군에서 기술 성장 · 승격은 다음 시즌',[5,4,5],{tags:['craft']}),
   choice(`이번 시즌 경험을 쌓고 ${w}에 도전한다`,'1군 경험 · 다음 시즌 감독과 재협상',[1,3,-5],{role:relief(c),flags:{promise:true},tags:['team']})
  ]);
  if(s===2) return event('promise','진로',c.flags.promise?'감독이 기억한 약속':`${w} 경쟁의 기회`,c.flags.promise?`“작년에 ${w} 재도전을 약속했지. 준비됐나?” 감독이 테스트 일정을 건넨다.`:`새 시즌 ${w} 테스트가 열린다. 지금까지 쌓은 기술을 보여줄 기회다.`,[
   choice('테스트에 도전한다','구위·장타 성장 · 기량 54 / 컨디션 42 이상이면 발탁',[6,2,-8],{test:true,tags:['courage','power']}),
   choice('현재 역할을 더 단단하게 만든다','제구·컨택 성장 · 컨디션 회복',[1,6,8],{tags:['precision','care']}),
   choice(p?'승부처 불펜을 맡는다':'발 빠른 교체 선수를 노린다',p?'불펜 역할 확정 · 체력 소모':'교체 역할 확정 · 주루 성장',[2,3,-5],{role:relief(c),speed:p?0:12,tags:[p?'team':'speed']})
  ]);
  if(s===3) return event('transfer','진로','다른 팀에서 온 전화',`${otherClub(c)}가 ${w} 경쟁 기회를 제안했다. 익숙한 팀에 남을 수도 있다.`,[
   choice(`${otherClub(c)}로 이적한다`,'새 팀의 주전 경쟁 · 적응으로 컨디션 소모',[3,3,-8],{club:otherClub(c),test:true,tags:['courage']}),
   choice(`${c.club}에 남는다`,'현재 역할 유지 · 익숙한 환경에서 회복',[2,3,8],{tags:['loyal','care']}),
   choice('현재 팀에 역할 확대를 요청한다','성장과 주전 테스트 · 더 큰 출전 부담',[4,2,-10],{test:true,tags:['loyal','power']})
  ]);
  if(s===4) return event('prime','진로','전성기의 설계',`코치가 묻는다. “이제 네가 원하는 ${p?'투구':'타격'}를 정해보자.”`,[
   choice(p?'직구의 위력을 높인다':'장타를 내 무기로 만든다','구위·장타력 크게 성장 · 기술 균형과 체력 부담',[9,-2,-8],{tags:['power']}),
   choice(p?'구석을 찌르는 제구를 만든다':'배트 컨트롤을 다듬는다','제구·컨택 크게 성장 · 힘을 조금 덜어냄',[-2,9,-4],{tags:['precision']}),
   choice(p?'긴 이닝을 준비한다':'베이스에서 승부한다',p?'컨디션 회복 · 선발 테스트':'주루 크게 성장 · 장타 훈련량 감소',[p?2:-1,2,8],{test:p,speed:p?0:16,tags:[p?'care':'speed']})
  ]);
  if(s===5) return event('recovery','대응',c.stats[2]<55?(p?'흔들리는 제구':'찾아온 타격 슬럼프'):'다음 도약을 위한 점검',c.stats[2]<55?'최근 경기에서 피로가 드러났다. 코치가 함께 해법을 찾자고 한다.':'상대 팀이 네 패턴을 분석하기 시작했다. 지금 경기 방식을 점검할 시간이다.',[
   choice('힘을 빼고 기본기를 찾는다','제구·컨택과 컨디션 회복 · 힘은 잠시 줄임',[-4,6,17],{tags:['care','precision'],rest:true}),
   choice('내 강점을 끝까지 믿는다','구위·장타 성장 · 피로 누적',[7,0,-8],{tags:['power','courage']}),
   choice('다른 패턴을 실험한다','새로운 기술 성장 · 적응에 체력 사용',[2,6,-4],{tags:['craft']})
  ]);
  if(s===6) return event('veteran','진로','베테랑에게 맞는 역할',`“경험은 충분해. 이제 ${p?'선발과 불펜':'주전과 전문 대타'} 중 어떤 역할을 맡고 싶나?”`,[
   choice(`${w}로 계속 뛴다`,'출전량 확대 · 기량 테스트와 체력 부담',[3,2,-11],{test:true,tags:['courage']}),
   choice(p?'마지막 이닝을 책임진다':'결정적인 대타를 맡는다','1군 전문 역할 · 컨디션 관리',[0,5,10],{role:relief(c),tags:['precision','care']}),
   choice('후배와 출전을 나눈다','출전량 감소 · 회복과 멘토 역할',[1,3,15],{rest:true,flags:{mentor:true},tags:['team']})
  ]);
  return event('stakes','가치관',s===8?'마지막 시즌의 약속':'기록과 팀 사이',s===8?`마지막 시즌의 목표는 '${{home:'홈 팬에게 인사',ring:'우승 도전',mentor:'후배와 함께'}[c.farewell]}'. 어떤 모습으로 준비할까?`:'순위 경쟁이 치열하다. 감독이 남은 일정의 출전 계획을 함께 정하자고 한다.',[
   choice('개인 최고 기록에 도전한다','구위·장타 성장 · 체력 부담',[5,1,-10],{tags:['power','courage']}),
   choice('큰 경기를 위해 힘을 아낀다','출전량 감소 · 컨디션 회복',[0,3,18],{rest:true,tags:['care','team']}),
   choice('필요한 순간에 집중한다','전문 역할로 전환 · 균형 있게 준비',[2,4,5],{role:relief(c),tags:['precision']})
  ]);
 }

 function matchEvent(c,s) {
  const p=pitch(c);
  if(s===2) return event('lesson','장기 도전','베테랑의 특별 수업',p?'선배가 새 변화구를 알려주겠다고 한다. “실전에서 쓸 때까지 시간이 필요해.”':'선배가 새 타격 접근법을 제안한다. “바깥쪽 공을 밀어치는 법, 배워볼래?”',[
   choice('새 기술을 배우기 시작한다','당장은 체력 소모 · 다음 시즌 실전 테스트',[0,3,-7],{flags:{experiment:'learning'},tags:['craft']}),
   choice('현재 무기를 더 완성한다','익숙한 강점을 강화',[6,0,-3],{tags:['power']}),
   choice(p?'경기 운영법을 배운다':'주루와 상대 분석을 배운다','제구·컨택과 판단을 다듬음',[0,5,3],{speed:p?0:8,tags:[p?'precision':'speed']})
  ]);
  if(s===3 && c.flags.experiment==='learning') return event('experiment-test','장기 도전','새 기술의 첫 실전', '지난 시즌부터 배운 기술을 쓸 기회가 왔다. 아직 익숙하진 않지만 상대는 예상하지 못한다.',[
   choice('실전에서 바로 사용한다','성공하면 자신감 · 실패해도 경험이 남음',[1,3,-3],{battle:'experiment',approach:'craft',flags:{experiment:'tested'},tags:['craft','courage']}),
   choice('쉬운 상황에서 시험한다','안정적인 운영 · 실험은 계속',[0,4,1],{battle:'experiment',approach:'safe',flags:{experiment:'tested'},tags:['precision']}),
   choice('현재 기술에 집중하기로 한다','훈련 중단 · 강점과 컨디션 회복',[4,0,6],{flags:{experiment:'closed'},tags:['care']})
  ]);
  if(s===5 && c.flags.experiment==='tested') return event('experiment-final','장기 도전','배운 것을 증명할 순간','연습과 첫 실전을 거친 기술. 이제 중요한 승부처에서 마지막 도전이 찾아왔다.',[
   choice('새 기술로 승부한다','실전 도전 완료 시 전용 장식 · 결과는 기량에 영향',[2,4,-4],{battle:'experiment',approach:'craft',flags:{experiment:'mastered'},tags:['craft']}),
   choice('익숙한 기술과 섞어서 쓴다','실전 도전 완료 · 안정적인 조합',[1,3,-2],{battle:'experiment',approach:'safe',flags:{experiment:'mastered'},tags:['craft','precision']}),
   choice('다음 기회를 위해 보류한다','이번 훈련 이야기는 여기서 종료 · 컨디션 회복',[1,1,9],{flags:{experiment:'closed'},tags:['care']})
  ]);
  const rival=[1,4,6].includes(s);
  const past=c.duels.filter(x=>x.rival);
  const context=rival?(past.length?`${rivalName(c)}와 다시 만났다. 지금까지 ${past.filter(x=>x.success).length}승 ${past.filter(x=>!x.success).length}패. “지난번 네 승부, 기억하고 있어.”`:`동기 ${rivalName(c)}와 첫 맞대결. 앞으로 자주 마주칠 상대다.`):'팽팽한 경기의 승부처. 네 판단이 필요한 순간이다.';
  return event(rival?'rival-'+s:'clutch-'+s,rival?'라이벌':'경기 승부',rival?`${rivalName(c)}와의 맞대결`:p?'마운드 위의 선택':'득점권 타석',context,[
   choice(p?'자신 있는 직구로 승부한다':'초구부터 담장을 노린다',p?'구위가 높을수록 유리 · 장타 허용 위험':'장타력이 높을수록 유리 · 삼진 위험',[2,0,-4],{battle:rival?'rival':'clutch',approach:'power',tags:['power','courage']}),
   choice(p?'상대 예상을 벗어난 공을 던진다':'짧게 쳐서 주자를 불러들인다',p?'제구가 높을수록 유리 · 빗맞은 안타 위험':'컨택이 높을수록 유리 · 장타 기회 감소',[0,2,-2],{battle:rival?'rival':'clutch',approach:'precision',tags:['precision']}),
   choice(p?'위험한 코스를 피한다':'내 공이 올 때까지 기다린다',p?'장타 위험 감소 · 볼넷 가능':'볼넷 가능 · 좋은 공을 놓칠 위험',[0,1,2],{battle:rival?'rival':'clutch',approach:'safe',tags:['team','care']})
  ]);
 }

 function lifeEvent(c,s) {
  const p=pitch(c);
  if(s===1) return event('celebration','일상','나만의 세리머니',`구단이 ${p?'삼진':'홈런'} 세리머니를 굿즈로 만들고 싶어 한다. 아직 정해둔 동작은 없다.`,[
   choice('묵묵히 다음 플레이를 준비한다','차분한 중계 반응 · 능력치 변화 없음',[0,0,0],{flags:{celebration:'quiet'}}),
   choice('덕아웃 동료와 짧은 춤을 맞춘다','리듬 스티커 · 성공 장면의 동료 반응',[0,0,0],{flags:{celebration:'dance'}}),
   choice('관중석에 작은 하트를 보낸다','하트 스티커 · 성공 장면의 팬 반응',[0,0,0],{flags:{celebration:'heart'}})
  ]);
  if(s===2) return event('routine','일상','경기 전 10분', '아직 경기 시작까지 조금 남았다. 오늘은 무엇으로 마음을 정리할까?',[
   choice('동료와 가볍게 몸을 푼다','컨디션 회복 · 팀과의 시간',[0,0,7],{tags:['team','care']}),
   choice('상대의 영상을 다시 본다','제구·컨택 성장 · 분석 습관',[0,3,2],{tags:['precision']}),
   choice(p?'새로운 그립을 메모한다':'주루 동선을 그려본다','작은 기술 성장 · 나만의 노트',[1,2,0],{speed:p?0:6,tags:[p?'craft':'speed']})
  ]);
  if(s===3) return event('fans','일상','버스 앞의 작은 팬','경기가 끝난 뒤 어린 팬이 네 이름이 적힌 공을 내민다.',[
   choice('이름을 물어보고 사인해 준다','사인 스티커 · 능력치 변화 없음',[0,0,0],{flags:{signature:true}}),
   choice('동료들과 함께 사진을 찍는다','함께한 기억 · 능력치 변화 없음',[0,0,0],{flags:{fanPhoto:true}}),
   choice('손을 흔들며 다음 만남을 약속한다','팬에게 남긴 인사 · 능력치 변화 없음',[0,0,0],{flags:{fanWave:true}})
  ]);
  if(s===4) return event('values','가치관','인터뷰의 마지막 질문','“어떤 선수로 기억되고 싶나요?” 마이크가 네 쪽으로 향했다.',[
   choice('승부를 피하지 않는 선수','도전을 중요하게 여기는 답변',[0,0,0],{tags:['courage']}),
   choice('동료가 믿을 수 있는 선수','팀을 중요하게 여기는 답변',[0,0,0],{tags:['team']}),
   choice('어제보다 나아지는 선수','배움을 중요하게 여기는 답변',[0,0,0],{tags:['craft']})
  ]);
  if(s===5) return event('community','일상','쉬는 날의 초대','유소년 야구교실과 동료의 휴식 모임이 같은 날 잡혔다.',[
   choice('야구교실에서 경험을 나눈다','후배 멘토 배지 · 컨디션 조금 소모',[0,2,-3],{flags:{mentor:true},tags:['team']}),
   choice('동료와 함께 쉬어간다','컨디션 회복',[0,0,10],{tags:['care','team']}),
   choice('개인 훈련 일정을 지킨다','기술 성장 · 체력 소모',[3,3,-6],{tags:['craft']})
  ]);
  if(s===6) return event('mentoring','관계','신인이 건넨 질문','“선배님은 처음에 어떻게 버텼어요?” 신인이 조심스럽게 다가온다.',[
   choice('함께 훈련하며 알려준다','후배 멘토 배지 · 기술을 함께 다듬음',[0,3,-2],{flags:{mentor:true},tags:['team','craft']}),
   choice('실패했던 날의 이야기를 들려준다','후배 멘토 배지 · 함께 마음을 정리',[0,1,6],{flags:{mentor:true},tags:['team']}),
   choice('직접 부딪혀볼 기회를 준다','스스로 판단하도록 격려',[2,1,3],{tags:['courage']})
  ]);
  return event('memory-'+s,'일상',s===8?'마지막 라커 정리':'오래된 신인 사진',s===8?'라커를 정리하다 첫 시즌 사진을 발견했다. 무엇을 남길까?':'구단에서 신인 시절 사진을 보내왔다. 지금의 너와 꽤 다르다.',[
   choice('함께한 동료들의 이름을 적는다','함께 이긴 기억을 엔딩에 남김',[0,0,0],{flags:{memory:'team'},tags:['team']}),
   choice('가장 치열했던 승부를 적는다','도전한 기억을 엔딩에 남김',[0,0,0],{flags:{memory:'challenge'},tags:['courage']}),
   choice('팬에게 고마운 마음을 적는다','팬과의 기억을 엔딩에 남김',[0,0,0],{flags:{memory:'fans'},tags:['loyal']})
  ]);
 }

 function retirement(c) {
  const offers=[choice('지금 은퇴한다','7시즌 기록과 장식, 호칭을 정리',[0,0,0],{retire:true}),
   choice(`${c.club}에서 팬들에게 인사한다`,'마지막 홈 시즌을 보내고 은퇴',[0,0,12],{farewell:'home',tags:['loyal']})];
  if(c.log.some(x=>x.role!=='farm')) offers.push(choice(`${otherClub(c)}의 우승 도전에 합류한다`,'다른 팀의 전문 역할로 마지막 시즌 · 우승은 경기력에 영향',[1,2,-4],{farewell:'ring',club:otherClub(c),role:relief(c),tags:['courage']}));
  if(c.flags.mentor || c.traits.team>=2) offers.push(choice('후배와 출전을 나누며 한 시즌 더 뛴다','현재 팀에서 멘토로 마지막 시즌',[0,3,10],{farewell:'mentor',rest:true,flags:{mentor:true},tags:['team']}));
  return event('retirement','은퇴','마지막 페이지의 선택','지금까지의 기록과 관계를 바탕으로 제안이 도착했다. 한 시즌을 더 뛰면 그 시즌 끝에 은퇴한다.',offers);
 }

 function duel(c,ch) {
  const roll=careerRoll(c.seed,2000+c.step*17+c.segment,100);
  const ability=ch.approach==='power'?c.stats[0]:ch.approach==='craft'?(c.stats[0]+c.stats[1])/2:c.stats[1];
  const support=[6,8].includes(c.rules)?(pitch(c)?(c.abilities[4]+c.abilities[5]-80)/20:(ch.approach==='safe'?(c.abilities[3]-40)/15:0)):0;
  const chance=Math.min(84,Math.max(28,Math.round(30+support+ability*.44+c.stats[2]*.12+(ch.approach==='safe'?5:0))));
  const success=roll<chance;
  const p=pitch(c);
  const result=p?(success?(ch.approach==='power'?'strikeout':'groundout'):(ch.approach==='safe'?'walk':ch.approach==='power'?'homeRun':'hit'))
   :(success?(ch.approach==='power'?'homeRun':ch.approach==='safe'?'walk':'hit'):(ch.approach==='power'?'strikeout':'flyout'));
  c.encounter={result,success,season:c.step+1,segment:c.segment,rival:ch.battle==='rival',approach:ch.approach};
  c.duels.push({...c.encounter});
  return `${success?'승부 성공':'상대의 승리'} · ${broadcastResults[result].label}${ch.battle==='rival'?` · ${rivalName(c)}와의 기억이 남았어요.`:''}`;
 }
 function finishRecord(c) {
  const defense=c.rules===8&&!pitch(c)?Math.trunc((c.abilities[4]+c.abilities[5]-80)/12):0;
  const rating=autoRating(c)+defense,r=seasonRecord(c.position,c.role,rating,c.rest);
  if(!pitch(c)) {
   r.hits=Math.round(r.atBats*(.175+c.stats[1]/660));
   r.homeRuns=Math.min(r.hits,Math.floor(r.atBats*Math.max(0,c.stats[0]-32)/650));
   r.rbi=Math.round(r.hits*.3+r.homeRuns*1.3);
   r.steals=Math.max(0,Math.round(r.atBats*Math.max(0,c.speed-38)/1100));
  }
  const moment=careerMoment(c.log,c.role,r);
  c.log.push({season:c.step+1,club:c.club,role:c.role,label:c.story.filter(e=>e.season===c.step+1).map(e=>e.choice).join(' / '),record:r,moment});
  c.step++; c.segment=0; c.encounter=null; c.rest=false;
  changeAutoStats(c,[0,0,c.step>=6?12:18]);
  c.news=`${c.step}시즌 결산 · ${FP.careerRecord(c,[c.log.at(-1)])}`;
  if(c.step===7) c.pending=retirement(c);
  if(c.step===8) { c.retired=true; c.champion=c.farewell==='ring' && rating>=63 && careerRoll(c.seed,3999,100)<65; }
 }
 function resolve(c,move) {
  if(c.retired) return false;
  if(c.pending) {
   if(!Number.isInteger(move) || move<0 || move>=c.pending.choices.length) return false;
   const e=c.pending,ch=e.choices[move];
   c.pending=null; c.encounter=null;
   changeAutoStats(c,ch.delta); c.speed=FP.number(c.speed+(ch.speed||0),0,100);
   for(const tag of ch.tags||[]) c.traits[tag]=(c.traits[tag]||0)+1;
   Object.assign(c.flags,ch.flags||{});
   if(ch.club && ch.club!==c.club) {c.transfers++;c.club=ch.club;}
   if(ch.role) c.role=ch.role;
   if(ch.test) c.role=autoRating(c)+([6,8].includes(c.rules)&&!pitch(c)?(c.abilities[4]+c.abilities[5]-80)/20:0)>=54 && c.stats[2]>=42 ? starting(c) : c.role;
   if(ch.rest) c.rest=true;
   if(ch.farewell) {c.farewell=ch.farewell;c.extended=true;}
   if(ch.retire) c.retired=true;
   const result=ch.battle?duel(c,ch):ch.test?`${FP.careerRoles[c.role]}에서 다음 경기를 준비해요.`:ch.farewell?'마지막 시즌의 목표가 정해졌어요.':ch.retire?'은퇴 기록과 장식을 정리했어요.':'선택을 기록했어요.';
   c.story.push({season:e.id==='retirement'?7:c.step+1,id:e.id,title:e.title,choice:ch.label,result});
   c.news=`${ch.label} · ${ch.battle?'승부 결과는 다음 장면에서 확인하세요.':result}`;
   return true;
  }
  if(move!==-1) return false;
  c.encounter=null;
  if(c.segment===3) {finishRecord(c);return true;}
  const season=c.step+1;
  if(c.segment===0) {
   const fatigue={farm:3,starter:9,regular:8,relief:5,platoon:4}[c.role];
   changeAutoStats(c,season>=6?[-1,1,-fatigue]:[1,1,-fatigue]);
  }
  c.pending=[roleEvent,matchEvent,lifeEvent][c.segment](c,season);
  c.segment++;
  c.news=`${season}시즌 · ${c.pending.category} · 잠시 멈춰 선택해 주세요.`;
  return true;
 }
 FP.restoreStoryCareer = saved => {
  const d=FP.normalizeCareerDraft(saved);
  if(!d || ![6,7,8].includes(saved.rules) || !['투수','타자'].includes(saved.position) || !Array.isArray(saved.moves) || saved.moves.length>64) return null;
  let profile=null;
  if([6,8].includes(saved.rules)) {
   if(![0,1,2].includes(saved.candidateIndex)||!FP.normalizeCareerHand(saved.position,saved.hand))return null;
   profile=FP.careerAbilityCandidates(d.seed,saved.position)[saved.candidateIndex];
   if(!Array.isArray(saved.startingAbilities)||profile.stats.some((n,i)=>saved.startingAbilities[i]!==n)||saved.startingAbilities.length!==6)return null;
  }
  const c={...d,rules:saved.rules,name:FP.str(saved.name,24).trim()||'신인 선수',position:saved.position,moves:[...saved.moves],
   stats:[50,50,70],speed:50,club:careerRoll(d.seed,70,2)?'하버스':'웨이브스',role:'farm',step:0,segment:0,
   pending:null,retired:false,extended:false,rest:false,farewell:null,champion:false,transfers:0,
   flags:{},traits:{},story:[],duels:[],encounter:null,log:[],selectedTitleId:null,news:'첫 시즌이 시작됐어요. 어떤 선수로 성장할지는 앞으로의 선택에 달려 있어요.'};
  if(profile) {
   c.candidateIndex=saved.candidateIndex;c.hand=saved.hand;c.startingAbilities=[...profile.stats];c.abilities=[...profile.stats];
   c.stats=saved.position==='투수'?[Math.round((profile.stats[0]+profile.stats[1])/2),Math.round((profile.stats[2]+profile.stats[3])/2),70]:[profile.stats[1],Math.round((profile.stats[0]+profile.stats[3])/2),70];
   c.speed=profile.stats[2];
  }
  for(const move of c.moves) {
   const before=[...c.stats],speed=c.speed;
   const decision=c.pending?.choices[move],kind=c.pending?.category;
   if(!resolve(c,move))return null;
   if(profile) {
    const delta=c.stats.map((n,i)=>n-before[i]);
    const growth=pitch(c)?[delta[0],delta[0],delta[1],delta[1],0,0]:[delta[1],delta[0],c.speed-speed,delta[1],0,0];
    if(c.rules===8&&decision){
     const traits=decision.tags||[];
     if(pitch(c)){
      growth[4]=(traits.includes('care')?2:0)+(kind==='훈련'&&delta[2]>0?1:0);
      growth[5]=(traits.includes('courage')?2:0)+(traits.includes('precision')||decision.test?1:0);
     }else{
      growth[4]=(traits.includes('team')?2:0)+(decision.test||kind==='훈련'?1:0);
      growth[5]=(traits.includes('craft')?2:0)+(traits.includes('precision')||decision.approach==='safe'?1:0);
     }
    }
    c.abilities=c.abilities.map((n,i)=>FP.number(n+growth[i],0,100));
   }
  }
  if(c.retired && FP.careerTitleOptions(c).some(t=>t.id===saved.selectedTitleId)) c.selectedTitleId=saved.selectedTitleId;
  return c;
 };
 FP.restoreCareer = raw => {
  const saved=raw?.rules===4&&!raw.startingAbilities?{...raw,rules:7}:raw;
  return [6,7,8].includes(saved?.rules)?FP.restoreStoryCareer(saved):restorePrevious(saved);
 };
 FP.signStoryPlayer = (id,name,position,hand,candidateIndex) => {
  if(FP.data.career || FP.data.careerDraft?.id!==id) return false;
  const profile=FP.careerAbilityCandidates(FP.data.careerDraft.seed,position)[candidateIndex];
  if(!profile)return false;
  const c=FP.restoreStoryCareer({...FP.data.careerDraft,rules:8,name,position,hand,candidateIndex,startingAbilities:profile.stats,moves:[]});
  return c?FP.transact(d=>{d.career=c;d.careerDraft=null;}):false;
 };
 FP.newStoryWithBackup = () => {
  const seed=Math.floor(Math.random()*0x100000000),id=`${Date.now().toString(36)}-${seed.toString(36)}`;
  return FP.transact(d=>{
   if(d.career)d.savedCareers.push({id:d.career.id||id+'-saved',career:d.career});
   d.career=null;d.careerDraft={id,seed};
  });
 };
 FP.resumeSavedCareer = id => {
  if(!FP.data.savedCareers.some(x=>x.id===id))return false;
  return FP.transact(d=>{
   const index=d.savedCareers.findIndex(x=>x.id===id),saved=d.savedCareers.splice(index,1)[0];
   if(d.career)d.savedCareers.push({id:d.career.id||Date.now().toString(36)+'-saved',career:d.career});
   if(d.careerDraft&&!d.savedDrafts.some(x=>x.id===d.careerDraft.id))d.savedDrafts.push(d.careerDraft);
   d.career=saved.career;d.careerDraft=null;
  });
 };
 FP.resumeSavedDraft = id => {
  if(!FP.data.savedDrafts.some(candidate=>candidate.id===id))return false;
  return FP.transact(d=>{
   const index=d.savedDrafts.findIndex(candidate=>candidate.id===id);
   if(index<0)throw new Error('conflict');
   const selected=d.savedDrafts.splice(index,1)[0];
   if(d.career)d.savedCareers.push({id:d.career.id||selected.id+'-saved',career:d.career});
   if(d.careerDraft)d.savedDrafts.push(d.careerDraft);
   d.career=null;d.careerDraft=selected;
  });
 };
 FP.storyRewardIds = c => {
  if(![6,7,8].includes(c?.rules)) return [];
  const ids=[],major=c.log.filter(e=>e.role!=='farm').length;
  const total=k=>c.log.reduce((sum,e)=>sum+(e.record[k]||0),0);
  const wins=c.duels.filter(x=>x.rival&&x.success).length;
  const grant=(yes,id)=>{if(yes) ids.push(id);};
  grant(c.traits.care>=3,'steady');grant(major>=4,'star');grant(c.retired,'diamond');grant(wins>=1,'stitch');
  grant(c.retired&&pitch(c),'night');grant(c.retired&&!pitch(c),'board');grant(c.retired&&c.step===8,'sunset');grant(c.retired&&!c.transfers,'paper');
  grant(c.retired,'rookie');grant(major>=5,'legend');grant(c.flags.celebration==='heart','heart');grant(c.flags.celebration==='dance','dance');
  grant(c.flags.signature,'signature');grant(c.flags.experiment==='mastered','ball');grant(total('saves')>=30,'closer');
  grant(total('homeRuns')>=50,'slugger');grant(wins>=2,'rival');grant(c.flags.mentor,'mentor');grant(c.step>=7&&!c.transfers,'loyal');grant(total('steals')>=30,'speed');
  return ids;
 };
 FP.careerTitleOptions = c => {
  const t=c.traits, candidates=[];
  const add=(id,score,reason)=>candidates.push({...FP.titles.find(x=>x.id===id),score,reason});
  if(pitch(c)) {
   add('architect',(t.precision||0)*3,`제구와 분석을 택한 결정 ${t.precision||0}회`);
   add('fireball',(t.power||0)*3,`구위와 정면 승부를 택한 결정 ${t.power||0}회`);
   const saves=c.log.reduce((n,e)=>n+e.record.saves,0);
   if(saves) add('closer-title',saves/4,`통산 ${saves}세이브를 기록했어요.`);
  } else {
   add('slugger-title',(t.power||0)*3,`장타와 강한 승부를 택한 결정 ${t.power||0}회`);
   add('contact',(t.precision||0)*3,`컨택과 분석을 택한 결정 ${t.precision||0}회`);
   if(t.speed) add('runner',t.speed*5,`주루 중심의 선택 ${t.speed}회`);
  }
  add('challenger',(t.courage||0)*2,`도전을 택한 결정 ${t.courage||0}회`);
  add('craft',(t.craft||0)*3+(c.flags.experiment==='mastered'?5:0),`새로운 배움에 투자한 결정 ${t.craft||0}회`);
  add('captain',(t.team||0)*3,`팀과 동료를 생각한 결정 ${t.team||0}회`);
  if(!c.transfers) add('one-club',7+(t.loyal||0),`${c.club}에서 ${c.step}시즌을 함께했어요.`);
  add('journey',1,`${c.step}시즌의 야구 인생을 완주했어요.`);
  return candidates.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,3);
 };
 FP.grantStoryRewards = (data,c) => {
  for(const id of FP.storyRewardIds(c)) if(!data.inventory.itemIds.includes(id)) data.inventory.itemIds.push(id);
  if(c.selectedTitleId && !data.inventory.titleIds.includes(c.selectedTitleId)) data.inventory.titleIds.push(c.selectedTitleId);
 };
 FP.advanceAutoCareer = (id,version,move,skip=false) => {
  const current=FP.data.career;
  if(![6,7,8].includes(current?.rules)) return advancePrevious(id,version,move,skip);
  if(current.id!==id || current.moves.length!==version) return false;
  let next=FP.restoreStoryCareer({...current,moves:[...current.moves,move]});
  if(!next) return false;
  while(skip&&!next.pending&&!next.retired) next=FP.restoreStoryCareer({...next,moves:[...next.moves,-1]});
  return FP.transact(d=>{d.career=next;FP.grantStoryRewards(d,next);});
 };
 FP.selectCareerTitle = (id,titleId) => {
  const c=[FP.data.career,...FP.data.careerHistory].find(x=>x?.id===id);
  if(![6,7,8].includes(c?.rules) || !c.retired || !FP.careerTitleOptions(c).some(x=>x.id===titleId)) return false;
  return FP.transact(d=>{
   const target=[d.career,...d.careerHistory].find(x=>x?.id===id);
   target.selectedTitleId=titleId;
   if(!d.inventory.titleIds.includes(titleId)) d.inventory.titleIds.push(titleId);
   d.profile.selectedTitleId=titleId;
  });
 };
 FP.careerRecord = (c,entries=c.log) => recordPrevious(c,entries)+([6,7,8].includes(c.rules)&&!pitch(c)?` · ${entries.reduce((n,e)=>n+(e.record.steals||0),0)}도루`:'');
 FP.careerConclusion = c => [6,7,8].includes(c.rules)?(FP.titles.find(t=>t.id===c.selectedTitleId)?.name||'나의 야구 인생'):conclusionPrevious(c);
 FP.careerBroadcast = c => {
  if(![6,7,8].includes(c.rules) || !c.encounter) return broadcastPrevious(c);
  const e=c.encounter,o=broadcastResults[e.result];
  const celebration=c.flags.celebration;
  const cheer=e.success?(celebration==='dance'?' 동료들과 짧은 리듬을 맞춥니다.':celebration==='heart'?' 관중석을 향해 작은 하트를 보냅니다.':' 차분하게 다음 플레이를 준비합니다.') : '';
  return {inning:9,outs:2,half:pitch(c)?'초':'말',result:e.result,celebration:e.success?celebration:null,
   frames:[{label:'승부처',line:e.rival?`${rivalName(c)}와 다시 마주합니다.`:'선택한 작전으로 승부합니다.',balls:0,strikes:0},
    {label:'준비',line:'관중이 숨을 죽이고 지켜봅니다.',balls:1,strikes:1},
    {label:o.label,line:o.line+cheer,balls:1,strikes:2,tone:e.success?'good':'bad'}]};
 };
})();
