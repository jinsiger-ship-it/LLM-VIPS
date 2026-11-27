/* 화면 전환, 폼, 공통 이벤트. 외부 라이브러리 없이 file://와 정적 서버 모두 지원합니다. */
const app=document.querySelector('#app'), E=FP.esc;
FP.toast = (message,decorate=false) => {const el=document.querySelector('#toast');el.textContent=message;if(decorate){const link=document.createElement('a');link.href='#create';link.textContent='바로 꾸미기 →';link.addEventListener('click',e=>{e.preventDefault();FP.openDecorationEditor();});el.appendChild(link);}el.classList.add('show');clearTimeout(FP.toastTimer);FP.toastTimer=setTimeout(()=>el.classList.remove('show'),4500);};
FP.data=FP.guestData=FP.defaults();
let draft=null,draftExpected,draftPhotoMissing=false,filter='전체',formStage=1,photoBusy=false;
let guestTicketDraft=null;
let loginId='', loginReturn='profile', pendingShare=null, shareOptions=null;
const demoAuthRoutes=['login','register','login-team'];
let backupPreview=null;
let rankings={position:'투수',entries:[],mine:[],owner:null,error:'',loading:false,request:0};
let careerTimer, careerPaused=false, careerSaving=false;
let careerBroadcast;
let decorationTab='frame', showAllDecorations=false;
FP.openDecorationEditor = () => {
 const ticket=FP.data.tickets.find(t=>t.id===FP.data.profile.featuredTicketId)||FP.data.tickets[0];
 if(ticket)openTicketDraft(ticket,2);
 if(location.hash==='#create')render();else location.hash='create';
};
let guestMatches=[],matchResults=guestMatches,matchOwner=null;
let matchImportReport=null;
let appliedMatch = null;

function resultPicker() {
  const stadiums = [...new Set(matchResults.filter(match => match.date === draft.date).map(match => match.stadium))]
    .sort((first, second) => first.localeCompare(second, 'ko'));
  const matches = FP.matchesAt(matchResults, draft.date, draft.stadium.trim());
  const selectedMatch = appliedMatch?.draft === draft ? appliedMatch.match.id : '';
  const status = !matchResults.length ? '경기 결과 파일을 불러오면 날짜별 경기 자동 입력을 사용할 수 있어요.'
    : !stadiums.length ? '이 날짜에 등록된 종료 경기가 없어요. 직접 입력할 수 있어요.'
    : '구장을 고르면 팀과 최종 점수가 채워져요.';
  return `<p class="muted" role="status">${status}</p>
    ${matchImportReport?`<details open><summary>추가 ${matchImportReport.added} · 갱신 ${matchImportReport.updated} · 중복 ${matchImportReport.duplicate} · 오류 ${matchImportReport.errors.length}</summary>${matchImportReport.errors.map(error=>`<p>${E(error)}</p>`).join('')}</details>`:''}
    ${stadiums.length ? `<label>경기 구장 선택
      <select data-result-venue><option value="">구장 선택</option>
      ${stadiums.map(stadium => `<option value="${E(stadium)}" ${stadium === draft.stadium ? 'selected' : ''}>${E(stadium)}</option>`).join('')}
      </select></label>` : ''}
    ${matches.length > 1 ? `<label>경기 선택
      <select data-result-match><option value="">경기 시간 선택</option>
      ${matches.map((match, index) => `<option value="${E(match.id)}" ${match.id === selectedMatch ? 'selected' : ''}>${E(match.time || (match.gameNo||index + 1) + '차전')} · ${E(match.away)} vs ${E(match.home)} · ${match.awayScore}:${match.homeScore}</option>`).join('')}
      </select></label>` : ''}`;
}

function clearPreviousResult(form) {
  if (appliedMatch?.draft !== draft) return;
  const { match } = appliedMatch;
  for (const [field, value] of Object.entries({ home: match.home, away: match.away, hs: match.homeScore, as: match.awayScore })) {
    if (form.elements[field].value === String(value)) form.elements[field].value = '';
  }
  appliedMatch = null;
}

function applyMatch(form, match) {
  for (const [field, value] of Object.entries({ home: match.home, away: match.away, hs: match.homeScore, as: match.awayScore })) {
    form.elements[field].value = value;
  }
  appliedMatch = { draft, match };
}

function refreshMatchPicker(form) {
  syncDraft(form);
  form.querySelector('[data-result-picker]').innerHTML = resultPicker();
  document.querySelector('#ticket-preview').innerHTML = FP.ticket({ ...draft, home: draft.home || '홈 팀', away: draft.away || '원정 팀' });
}

app.addEventListener('change', async event => {
  const target = event.target;
  const form = target.closest('#ticket-form');
  if (!form?.querySelector('[data-result-picker]')) return;
  if (target.matches('[data-result-file]')) {
    const file = target.files[0];
    if (!file) return;
    const owner=FP.account.username;
    target.disabled = true;
    try {
      if (file.size > 1024 * 1024) throw new Error('1MB 이하의 경기 결과 파일을 선택해 주세요.');
      const imported = FP.parseMatchResults(await file.text(),false,true);
      if(owner!==FP.account.username||FP.account.restorePending)return;
      const report=FP.mergeMatchResults(owner?FP.loadMatchResults(localStorage):guestMatches,imported);
      if(owner&&(report.added||report.updated))localStorage.setItem(FP.matchResultsKey,JSON.stringify(report.matches));
      if(!owner)guestMatches=report.matches;
      matchImportReport=report;
      matchResults=report.matches;
      if (form.isConnected) refreshMatchPicker(form);
      FP.toast(`경기 ${report.added}건 추가 · ${report.updated}건 갱신 · ${report.errors.length}건 오류`);
    } catch (error) {
      FP.toast(error instanceof SyntaxError ? '올바른 JSON 파일을 선택해 주세요.' : error.message);
    } finally {
      target.value = '';
      target.disabled = false;
    }
    return;
  }
  if (target.matches('[data-result-match]')) {
    const match = FP.matchesAt(matchResults, form.elements.date.value, form.elements.stadium.value.trim())
      .find(candidate => candidate.id === target.value);
    if (match) applyMatch(form, match);
    else clearPreviousResult(form);
    refreshMatchPicker(form);
    return;
  }
  if (!target.matches('[data-result-venue], [name="stadium"], [name="date"]')) return;
  if (target.matches('[data-result-venue]') && !target.value) return;
  if (target.matches('[data-result-venue]')) form.elements.stadium.value = target.value;
  clearPreviousResult(form);
  const matches = FP.matchesAt(matchResults, form.elements.date.value, form.elements.stadium.value.trim());
  if (matches.length === 1) applyMatch(form, matches[0]);
  refreshMatchPicker(form);
});
const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
const button=(text,action,value='',cls='')=>`<button type="button" class="btn ${cls}" data-action="${action}" data-value="${E(value)}">${text}</button>`;
const heading=(eyebrow,title,sub='')=>`<div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${sub?`<p class="intro">${sub}</p>`:''}`;
const empty=(text,link='create',label='티켓 만들기')=>`<div class="empty"><span>◇</span><h2>${text}</h2><a class="btn" href="#${link}">${label} ↗</a></div>`;
function theme() {
  const team = FP.teams.find(team => team[0] === FP.data.profile.team);
  document.documentElement.style.setProperty('--accent', team[0] === 'neutral' ? '#172d37' : team[2]);
}
function home() {
  const { tickets, profile, career } = FP.data;
  const featured = tickets.find(ticket => ticket.id === profile.featuredTicketId) ?? tickets[0];
  const ticket = featured ?? FP.sample;
  return `<section class="hero">
    <div class="eyebrow">EVERY GAME, YOUR MEMORY</div>
    <h1>그날의 야구,<br>나만의 티켓으로</h1>
    <p>직관·중계의 추억을 티켓으로 남기고 야구 선수의 커리어를 플레이해요.</p>
    <div class="hero-actions">
      <a class="btn" href="#create">티켓 만들기</a>
      <a class="btn secondary" href="#game">커리어 게임</a>
    </div>
    <div class="hero-ticket">
      <div class="hero-ticket-meta"><span>${featured ? (ticket.mode==='커리어'?'MY CAREER TICKET':'MY MEMORY TICKET') : 'GAME DAY TICKET · 예시'}</span><span>⚾ FANPLAY</span></div>
      <div class="hero-ticket-match"><span>${E(ticket.home)}</span><strong>${ticket.mode==='커리어' ? '✦' : featured ? ticket.hs + ' : ' + ticket.as : 'VS'}</strong><span>${E(ticket.away)}</span></div>
      <div class="hero-ticket-meta hero-ticket-stub"><span>${featured ? E(ticket.date) : 'BASEBALL MOMENT'}</span><span>MEMORY PASS</span></div>
    </div>
  </section>
  <section class="home-section">
    <h2>야구 인생도 직접 플레이</h2>
    <a class="game-teaser" href="#game">
      <span class="teaser-ball" aria-hidden="true">⚾</span>
      <span><strong>벤치에서 레전드까지</strong><small>선택으로 쓰는 야구 인생 · 나만의 장식 보상</small><b>${career ? '커리어 이어가기' : '커리어 시작'} →</b></span>
    </a>
  </section>`;
}
function field(label,name,value,type='text',extra=''){return `<label>${label}<input name="${name}" type="${type}" value="${E(value)}" ${extra}></label>`;}
const ticketDraftKey=()=> 'fanplay-ticket-draft-v1:id:'+FP.account.username;
function rememberTicketDraft(){
 if(!draft||FP.account.restorePending)return;
 const record={ticket:draft,stage:formStage,expected:draftExpected,photoMissing:draftPhotoMissing};
 if(!FP.account.username){guestTicketDraft=record;return;}
 const key=ticketDraftKey();
 try{localStorage.setItem(key,JSON.stringify(record));}
 catch{
  if(!draft.photo)return;
  try{
   record.ticket={...draft,photo:''};
   record.photoMissing=true;
   localStorage.setItem(key,JSON.stringify(record));
  }catch{}
 }
}
function loadTicketDraft(){
 try{
  const saved=FP.account.username?JSON.parse(localStorage.getItem(ticketDraftKey())||'null'):guestTicketDraft;
  if(!saved?.ticket||!FP.str(saved.ticket.id)||![1,2,3].includes(saved.stage))return;
  const data=saved.ticket;
  const clean=FP.ticketData({...data,date:FP.validDate(data.date)?data.date:'2000-01-01',home:FP.str(data.home).trim()||'홈',away:FP.str(data.away).trim()||'원정'});
  if(!clean)return;
  draft={...clean,date:FP.str(data.date,10),home:FP.str(data.home,40),away:FP.str(data.away,40),
   hs:clean.hs??'',as:clean.as??''};
  draftExpected=typeof saved.expected==='string'?saved.expected:undefined;
  draftPhotoMissing=saved.photoMissing===true;
  formStage=saved.stage;
 }catch{}
}
function openTicketDraft(ticket,stage){
 draft=FP.copy(ticket);
 draftExpected=JSON.stringify(ticket);
 draftPhotoMissing=false;
 formStage=stage;
 rememberTicketDraft();
}
function clearTicketDraft(){
 if(FP.account.username){try{localStorage.removeItem(ticketDraftKey());}catch{}}
 else guestTicketDraft=null;
 draft=null;draftExpected=undefined;draftPhotoMissing=false;formStage=1;
}
function ticketPreview(){return `<div class="preview"><h2>티켓 미리보기</h2><div id="ticket-preview">${FP.ticket({...draft,home:draft.home||'홈 팀',away:draft.away||'원정 팀'})}</div></div>`;}
function editor(){
 if(!draft)loadTicketDraft();
 if(!draft){draft={...FP.copy(FP.sample),id:uid(),date:new Date().toLocaleDateString('sv-SE'),stadium:'',home:'',away:'',hs:'',as:'',note:'',tag:'',stickerIds:[]};formStage=1;draftExpected=undefined;draftPhotoMissing=false;}
return `${heading('MAKE A MEMORY','나의 티켓 만들기','경기 기록을 입력하고, 나만의 디자인으로 완성하세요.')}<div class="steps"><span class="${formStage===1?'active':''}">01 경기 기록</span><span class="${formStage===2?'active':''}">02 꾸미기</span><span class="${formStage===3?'active':''}">03 완성 미리보기</span></div><div class="editor-grid" data-stage="${formStage}"><form id="ticket-form" class="panel">${formStage===1?`<h2>어떤 경기였나요?</h2><div class="fields">${field('경기 날짜','date',draft.date,'date','required')}${field('야구장 / 시청 장소','stadium',draft.stadium,'text','maxlength="80" required')}</div><div data-result-picker>${resultPicker()}</div><details><summary>경기 결과 파일 불러오기</summary><label>경기 결과 파일 <input type="file" data-result-file accept=".json,application/json"></label></details><div class="fields">${field('홈 팀','home',draft.home,'text','maxlength="40" required')}${field('원정 팀','away',draft.away,'text','maxlength="40" required')}${field('홈 점수','hs',draft.hs,'number','min="0" max="99" required')}${field('원정 점수','as',draft.as,'number','min="0" max="99" required')}</div><label>관람 방식<select name="mode"><option ${draft.mode==='직관'?'selected':''}>직관</option><option ${draft.mode==='중계'?'selected':''}>중계</option></select></label>${field('태그','tag',draft.tag,'text','maxlength="30" placeholder="예: 첫 직관"')}<label>한 줄 감상<textarea name="note" maxlength="180" placeholder="이날의 기분을 남겨주세요">${E(draft.note)}</textarea></label><button class="btn" type="submit">꾸미기로 →</button>`:formStage===2?`<h2>나만의 한 장으로</h2><label>티켓 스타일<select name="theme">${[['classic','클래식'],['scoreboard','전광판'],['photo','포토']].map(([id,name])=>`<option value="${id}" ${draft.theme===id?'selected':''}>${name}</option>`).join('')}</select></label><label>컬러<select name="color">${[['forest','포레스트'],['rose','로즈'],['blue','블루'],['sand','샌드']].map(([id,name])=>`<option value="${id}" ${draft.color===id?'selected':''}>${name}</option>`).join('')}</select></label><label>경기 사진 (선택 · JPG/PNG/WebP · 최대 12MB)<input id="photo" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="muted" id="photo-status">긴 변 900px로 줄여 보관합니다.</p>${button('사진 제거','remove-photo','','secondary')}${ticketPreview()}${decorationPicker()}<div class="actions">${draft.mode==='커리어'?'<a class="btn secondary" href="#collection">← 수집함</a>':button('← 경기 기록','stage','1','secondary')}<button class="btn" type="submit" ${photoBusy?'disabled':''}>완성 미리보기 →</button></div>`:`<h2>이 순간을 간직할까요?</h2><p>${FP.account.username?'티켓을 계정에 보관해요.':'티켓은 이번 방문 중에 수집함에서 볼 수 있어요.'}</p><p class="muted">사진이 없으면 기본 다이아몬드 그래픽이 표시됩니다. 실제 입장권으로 사용할 수 없습니다.</p><div class="actions">${button('← 꾸미기','stage','2','secondary')}<button class="btn" type="submit">수집함에 저장 ↗</button></div>`}</form>${formStage===2?'':ticketPreview()}</div>`;}
function decorationPicker() {
 const types=[['frame','프레임'],['background','배경'],['sticker','스티커'],['badge','배지']];
 const fields={frame:'frameId',background:'backgroundId',sticker:'stickerIds',badge:'badgeId'};
 const name=fields[decorationTab], multi=decorationTab==='sticker';
 const owned=FP.data.inventory.itemIds;
 const items=FP.items.filter(i=>i.type===decorationTab&&(showAllDecorations||owned.includes(i.id))).sort((a,b)=>Number(owned.includes(b.id))-Number(owned.includes(a.id)));
 return `<section class="decoration-picker"><div class="section-title"><h3>나의 장식</h3><span class="muted">업적 장식 · ${owned.length}/20</span></div>
  <div class="decoration-tabs" role="group" aria-label="장식 종류">${types.map(([id,label])=>`<button type="button" aria-pressed="${id===decorationTab}" data-action="decoration-tab" data-value="${id}">${label}</button>`).join('')}</div>
  <div class="decoration-toolbar"><span>${multi?'스티커는 최대 3개':'한 가지를 골라보세요'}</span><button type="button" class="text-link" data-action="decoration-all">${showAllDecorations?'보유만 보기':'전체 보기 · 획득 조건'}</button></div>
  <div class="decoration-grid"><p id="decoration-info" class="decoration-info" role="status"></p>${multi?'':`<label class="decoration-option"><input type="radio" name="${name}" value="default" ${!draft[name]||draft[name]==='default'?'checked':''}><span class="decor-icon">○</span><span>기본</span><small class="applied-mark" aria-hidden="true">✓ 적용 중</small></label>`}
  ${items.map(i=>{const have=owned.includes(i.id),checked=multi?draft.stickerIds.includes(i.id):draft[name]===i.id;
   return have?`<label class="decoration-option"><input type="${multi?'checkbox':'radio'}" name="${name}" value="${i.id}" ${checked?'checked':''}><span class="decor-icon decor-${i.id}">${i.icon}</span><span>${i.name}</span><small class="applied-mark" aria-hidden="true">✓ 적용 중</small></label>`:
    `<button type="button" class="decoration-option locked" data-action="decoration-info" aria-controls="decoration-info" data-value="${i.id}" aria-label="${i.name}: 미획득, 획득 조건 보기"><span class="decor-icon decor-${i.id}">${i.icon}</span><span>${i.name}</span><small>미획득 · 조건 보기</small></button>`;
  }).join('')}</div>${multi&&!items.length?'<p class="muted">게임에서 나만의 세리머니를 정하면 첫 스티커를 얻을 수 있어요.</p>':''}
  <a class="text-link" href="#game">게임에서 장식 얻기 →</a></section>`;
}
function collection(){
 const ts=FP.data.tickets.filter(t=>filter==='전체'||t.mode===filter);
 const scope=FP.account.username?'계정에 저장된 티켓':'이번 방문의 티켓';
 const resumeShare=FP.account.username&&shareOptions?sharePanel():
  FP.account.username&&pendingShare?`<section class="panel pending-share"><h2>선택한 티켓 게시하기</h2>${FP.ticket(pendingShare)}<div class="actions">${button('커뮤니티에 게시','resume-share')}${button('닫기','dismiss-share','','secondary')}</div></section>`:'';
 return `${heading('MY COLLECTION','나의 티켓 수집함',`${scope} · ${FP.data.tickets.length}장`)}${resumeShare}<div class="toolbar"><div class="tabs">${['전체','직관','중계','커리어'].map(f=>button(f,'filter',f,filter===f?'':'secondary')).join('')}</div>${FP.data.tickets.length?'<a class="btn" href="#create">+ 티켓 만들기</a>':''}</div>${ts.length?`<div class="collection-grid">${ts.map(t=>`<section>${t.id===FP.data.profile.featuredTicketId?'<div class="badge">★ 대표 티켓</div>':''}${FP.ticket(t)}<div class="card-actions">${button('상세 / 수정','edit',t.id,'secondary')}${button('대표 지정','feature',t.id,'secondary')}${button('게시','share',t.id,'secondary')}${button('삭제','delete',t.id,'quiet')}</div></section>`).join('')}</div>`:FP.data.tickets.length?empty('이 분류에 저장된 티켓이 없어요.'):empty('아직 저장한 티켓이 없어요.','create','첫 티켓 만들기')}`;
}
function sharePanel(){
 const {ticket,text,photo,note}=shareOptions;
 return `<section class="panel pending-share" id="share-panel"><h2 tabindex="-1">공개 티켓 확인</h2>
   <form id="public-share-form"><label>함께 올릴 이야기<textarea name="message" maxlength="300">${E(text)}</textarea></label>
   ${ticket.photo?`<label><input name="includePhoto" type="checkbox" ${photo?'checked':''}>사진 포함</label>`:''}
   ${ticket.note?`<label><input name="includeNote" type="checkbox" ${note?'checked':''}>티켓 메모 포함</label>`:''}
   <div data-share-preview>${publicTicketPreview()}</div>
   <div class="actions"><button class="btn" type="submit">공개 게시</button>${button('취소','dismiss-share','','secondary')}</div>
   </form></section>`;
}
function publicTicketPreview(){
 const {ticket,photo,note}=shareOptions;
 return FP.ticket({...ticket,photo:photo?ticket.photo:'',note:note?ticket.note:''});
}
function legacyGame(c){const labels=c.position==='투수'?['구위','제구','체력']:['타격','수비','체력'],last=c.log.at(-1),end=FP.ending(c.stats),title=FP.titles.find(t=>t.id===end);return `${heading('PLAYER CAREER',`${E(c.name)}의 야구 일기`,`${E(c.position)} · ${c.step===8?'8시즌 완주':`${c.step+1}번째 시즌`}`)}<div class="game-grid"><aside class="panel"><span class="eyebrow">PLAYER REPORT</span><h2>${E(c.name)}</h2>${c.stats.map((n,i)=>`<div class="stat"><label>${labels[i]} <b>${n}</b></label><progress max="100" value="${n}">${n}</progress></div>`).join('')}<p>종합 ${Math.round(c.stats.reduce((a,b)=>a+b)/3)}</p><div class="season-dots">${Array.from({length:8},(_,i)=>`<span class="${i<c.step?'done':''}">${i+1}</span>`).join('')}</div><p class="muted">결말 기준: 종합 65 미만 / 65~79 / 80 이상 (반올림 전 평균)</p>${button('새 선수로 시작','restart','','quiet')}</aside><section class="panel scene">${c.step===8?`<div class="eyebrow">CAREER COMPLETE</div><div class="ending-icon">${end==='legend'?'🏆':'✦'}</div><h2>${{steady:'꾸준함의 선수',star:'구단의 간판',legend:'명예의 전당'}[end]}</h2><p>여덟 시즌의 기록이 나만의 컬렉션이 되었습니다.</p><div class="reward-banner">획득 아이템: 첫 완주 별 + ${FP.items.find(i=>i.id===end).name}<br>칭호: ${title.name}<small>이미 보유한 보상은 중복 추가하지 않습니다.</small></div><a class="btn" href="#collection">보상을 티켓에 적용하기 ↗</a><a class="text-link" href="#profile">칭호 전시하기 →</a>`:`<div class="eyebrow">SEASON ${String(c.step+1).padStart(2,'0')} / 08</div><h2>${FP.scenes[c.step].title}</h2><p>${FP.scenes[c.step][c.position==='투수'?'pitcher':'batter']}</p>${c.step===5?`<p class="context">${c.stats[0]>=60?'쌓아온 기술이 승부처의 자신감이 됩니다.':'아직 다듬어야 할 기술이 있지만, 다음 선택은 열려 있습니다.'}</p>`:''}<div class="choices">${FP.scenes[c.step].choices.map((ch,i)=>`<button data-action="choose" data-value="${i}"><span>0${i+1}</span><div>${ch}<small>${labels.map((l,j)=>`${l} +${FP.effects[i][j]}`).join(' · ')}</small></div><b>↗</b></button>`).join('')}</div>`}${last?`<div class="result"><b>직전 선택 결과</b><p>${E(last.text)}</p><small>${labels.map((l,i)=>`${l} +${last.delta[i]}`).join(' · ')}</small></div>`:''}</section></div><details class="panel history"><summary>시즌 기록 ${c.log.length}개</summary>${c.log.map(l=>`<p><b>${l.season}시즌</b> ${E(l.text)} <small>(${l.delta.map(n=>'+'+n).join(' / ')})</small></p>`).join('')||'<p>첫 시즌을 시작해 보세요.</p>'}</details>`;}
function community(){if(FP.communityMode)return heading('FAN COMMUNITY','우리들의 야구 이야기','공개 티켓과 인기 순위를 확인해요.')+FP.communityPanel();return `${heading('FAN COMMUNITY','우리들의 야구 이야기','커뮤니티 시연: 게시글·좋아요·댓글은 나의 기록으로 저장됩니다.')}<div class="notice community-cta"><div><strong>내 티켓 자랑하기</strong><p>수집함에서 티켓을 골라 게시할 수 있어요.</p></div><a class="btn" href="#collection">수집함 열기</a></div>${FP.data.posts.length?`<div class="collection-grid">${FP.data.posts.map(p=>`<article class="post panel"><div class="section-title"><b>${E(p.nickname)}</b>${button('게시글 삭제','delete-post',p.id,'quiet')}</div><p>${E(p.text)}</p>${FP.ticket(p.ticket)}<div class="actions">${button(p.liked?'♥ 좋아요 1':'♡ 좋아요 0','like',p.id,'secondary')}<span class="muted">댓글 ${p.comments.length}</span></div><div class="comments">${p.comments.map(c=>`<p><b>${E(c.nickname)}</b> ${E(c.text)}</p>`).join('')}</div><form class="comment-form" data-post="${E(p.id)}"><input name="comment" required maxlength="200" aria-label="댓글" placeholder="이 순간에 한마디"><button class="btn" type="submit">등록</button></form></article>`).join('')}</div>`:empty('첫 번째 야구 이야기를 기다려요.','collection','수집함에서 게시하기')}`;}
function profile(){
 const d=FP.data,t=d.tickets.find(ticket=>ticket.id===d.profile.featuredTicketId);
 const team=FP.teams.find(([id])=>id===d.profile.team);
 const guest=FP.cloudMode&&!FP.account.username;
 return `${heading('MY PAGE','마이')}
 <section class="profile-card ${guest?'guest-profile-card':''}">
  <a class="profile-edit" href="#profile-edit" aria-label="회원정보 수정" title="회원정보 수정"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m4 16-1 5 5-1L20 8l-4-4L4 16Z M14 6l4 4"/></svg></a>
  <div class="profile-avatar" aria-hidden="true">⚾</div><strong>${guest?'내 프로필':E(d.profile.nickname)}</strong>${guest?
    '<a class="btn profile-login" href="#login" data-login-return="profile">로그인</a>':
    `<small>${E(team[1])}${FP.cloudMode?' · '+E(FP.account.username):''}</small>`}
 </section>
 <a class="panel my-collection-link" href="#collection"><div><strong>내 수집함</strong><span>${FP.account.username?'계정에 저장된 티켓':'이번 방문의 티켓'}</span></div><span>티켓 ${d.tickets.length}장 →</span></a>
 ${FP.account.username&&!FP.cloudMode?'<a class="text-link" href="#records">기록 파일 관리 →</a>':''}
 ${FP.cloudMode?'':FP.accountPanel()}
 <div class="profile-grid"><section><div class="section-title"><h2>대표 티켓</h2>${d.profile.selectedTitleId?`<span class="badge">✦ ${FP.titles.find(t=>t.id===d.profile.selectedTitleId).name}</span>`:''}</div>${t?FP.ticket(t):empty('대표 티켓을 지정해 주세요.','collection','수집함 열기')}${t?button('대표 지정 해제','unfeature','','secondary'):''}</section></div>`;
}
function openLogin(destination, ticket=null){
 loginReturn=destination;
 loginId='';
 pendingShare=ticket;
 location.hash='login';
}
function login(signup=false){
 if(!FP.cloudMode)return profile();
 if(FP.account.username)return accountTools();
 const title=signup?'회원가입':'로그인';
 const backLabel={profile:'마이',collection:'내 수집함',community:'커뮤니티'}[loginReturn];
 const teamChoices=signup?`<fieldset class="login-teams"><legend>응원팀</legend>${[...FP.teams.slice(1),FP.teams[0]].map(([id,name])=>
   `<label><input type="radio" name="team" value="${E(id)}" aria-label="${E(id==='neutral'?'응원팀 없음':name)}" required><span>${E(id==='neutral'?'응원팀 없음':id)}</span></label>`).join('')}</fieldset>`:'';
 let content;
 if(FP.account.checking)content='<p role="status">온라인 기록을 확인하고 있어요.</p>';
 else if(!FP.account.available)content=`<p class="muted" role="status">${E(FP.cloudError||'온라인 저장소를 연결해 주세요.')}</p>${button('연결 다시 확인','cloud-retry','','secondary')}`;
 else content=`<p class="login-intro">${signup?'아이디와 응원팀을 선택해 시작해요.':'가입한 아이디로 티켓과 커리어를 이어가요.'}</p>
   <form data-account-action="${signup?'register':'login'}"><label for="demo-login-id">아이디</label><input id="demo-login-id" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" pattern="[a-zA-Z0-9_]{3,24}" minlength="3" maxlength="24" required aria-describedby="login-note login-error" value="${E(loginId)}" placeholder="예: fanplay_01">
   <p class="login-note" id="login-note">${signup?'영문·숫자·밑줄 3~24자. ':''}같은 아이디를 아는 사람과 기록을 공유해요.</p>
   ${teamChoices}<p class="login-error" id="login-error" role="alert"></p><button class="btn" type="submit">${title}</button></form>
   <a class="btn secondary login-switch" href="#${signup?'login':'register'}">${signup?'로그인':'회원가입'}</a>`;
 return `<section class="login-screen"><a class="text-link" href="#${loginReturn}" data-login-cancel>‹ ${backLabel}</a>
   <h1 tabindex="-1">${title}</h1>${content}<a class="text-link login-guest" href="#${loginReturn}" data-login-cancel>비회원으로 계속</a></section>`;
}
function accountTools(){
 if(!FP.cloudMode)return profile();
 if(!FP.account.username)return `<a class="text-link" href="#profile">‹ 마이</a>${heading('','계정 및 기록 관리')}<a class="btn" href="#login" data-login-return="profile">로그인</a>`;
 return `<a class="text-link" href="#profile">‹ 마이</a>${heading('','계정 및 기록 관리')}${FP.cloudAccountTools()}${recordTools()}`;
}
function recordTools(){
 if(!FP.account.username)return '';
 const original=FP.accountRecovery?.raw||readStoredRecovery();
 const controls=original?`<section class="panel"><h2>기록 복구</h2><p>복구 전 원본 기록을 내려받을 수 있어요.</p>
   ${button('원본 기록 내려받기','records-download-original','','secondary')}
   </section>`:'';
 const preview=backupPreview;
 const conflicting=preview?.state.tickets.filter(t=>FP.data.tickets.some(current=>current.id===t.id&&JSON.stringify(current)!==JSON.stringify(t)))||[];
 return controls+FP.recordBackupTools()+(preview?`<section class="panel"><h2>가져오기 확인</h2>
   <p>티켓 ${preview.state.tickets.length}장 · 진행·은퇴·보관 선수 ${Number(Boolean(preview.state.career))+preview.state.careerHistory.length+preview.state.savedCareers.length}명 · 선수 후보 ${Number(Boolean(preview.state.careerDraft))+preview.state.savedDrafts.length}개 · 장식 ${preview.state.inventory.itemIds.length}개 · 칭호 ${preview.state.inventory.titleIds.length}개</p>
   ${conflicting.length?`<p>내용이 다른 티켓 ${conflicting.length}장 · ${conflicting.slice(0,5).map(t=>E(t.date+' '+t.home+' / '+t.away)).join(', ')}</p>`:''}
   ${preview.issues.length?`<p>복구하지 못한 항목 ${E([...new Set(preview.issues)].join(', '))}. 원본 파일을 보관해 주세요.</p>`:''}
   <div class="actions">${button('현재 기록 우선','records-apply','account')}${button('파일 기록 우선','records-apply','device','secondary')}${button('취소','records-cancel','','quiet')}</div></section>`:'');
}
function readStoredRecovery(){
 if(!FP.account.username)return null;
 try{
  const legacy=FP.readDevice(localStorage);
  return localStorage.getItem('fanplay-account-recovery-'+FP.account.username)||localStorage.getItem(FP.key+'-recovery')||
   (legacy.unreadable||legacy.issues.length?legacy.raw:null);
 }catch{return null;}
}
function recordScreen(){return FP.account.username?
 `<a class="text-link" href="#profile">‹ 마이</a>${heading('','기록 파일 관리')}${recordTools()}`:
 `<a class="text-link" href="#profile">‹ 마이</a>${heading('','기록 파일 관리','로그인하면 기록을 내려받거나 복원할 수 있어요.')}<a class="btn" href="#${FP.cloudMode?'login':'profile'}">로그인</a>`;}
function profileEdit(){const d=FP.data;return `<a class="text-link" href="#profile">← 마이페이지</a>${heading('MY PAGE','회원정보 수정')}<form id="profile-form" class="panel">${field('닉네임','nickname',d.profile.nickname,'text','maxlength="24" required')}<label>응원팀 테마<select name="team">${FP.teams.map(t=>`<option value="${t[0]}" ${d.profile.team===t[0]?'selected':''}>${t[1]}</option>`).join('')}</select></label><label>전시할 칭호<select name="title"><option value="">칭호 없음</option>${FP.titles.filter(t=>d.inventory.titleIds.includes(t.id)).map(t=>`<option value="${t.id}" ${d.profile.selectedTitleId===t.id?'selected':''}>${t.name}</option>`).join('')}</select></label><button class="btn" type="submit">회원정보 저장</button></form>`;}
function careerSummary(career) {
  if([6,7,8].includes(career.rules)) return storySummary(career);
  const ticketId = `career-${career.id}`;
  const saved = FP.data.tickets.some(ticket => ticket.id===ticketId);
  return `<h3>${FP.careerConclusion(career)}</h3>
    <p><b>통산 기록</b> ${FP.careerRecord(career)}</p>
    ${saved ? '<a class="text-link" href="#collection">수집함에서 보기 →</a>' : button('기념 티켓 저장','career-ticket',career.id,'secondary')}
    ${career.retired&&FP.account.username&&FP.communityMode?button('선수 랭킹에 올리기','ranking-register',career.id,'secondary'):''}`;
}

function careerArchive() {
  const history = FP.data.careerHistory;
  const saved=FP.data.savedCareers||[];
  const drafts=FP.data.savedDrafts||[];
  const shelf=(saved.length?`<details class="panel career-shelf"><summary>잠시 쉬고 있는 선수 ${saved.length}명</summary>${saved.map(x=>`<article><p><b>${E(x.career.name)}</b> · ${x.career.position} · ${x.career.step}시즌</p>${button('이 선수 이어하기','career-resume',x.id,'secondary')}${x.career.retired&&FP.account.username&&FP.communityMode?button('선수 랭킹에 올리기','ranking-register',x.career.id,'secondary'):''}</article>`).join('')}</details>`:'')+
    (drafts.length?`<details class="panel"><summary>보관한 선수 후보 ${drafts.length}개</summary>${drafts.map((item,index)=>button('후보 묶음 '+(index+1)+' 열기','career-draft-resume',item.id,'secondary')).join('')}</details>`:'');
  if (!history.length) return shelf;
  return `${shelf}<details class="panel career-archive"><summary>지난 선수 기록 ${history.length}명</summary>
    ${history.map(career => `<article><b>${E(career.name)} · ${career.position}</b>${careerSummary(career)}</article>`).join('')}</details>`;
}

function syncCareerSetup(form) {
  const position=form.querySelector('input[name="position"]:checked')?.value || '타자';
  form.querySelectorAll('[data-career-for]').forEach(group=>{
    const active=group.dataset.careerFor===position;
    group.hidden=!active;
    group.querySelectorAll('input').forEach(input=>{input.disabled=!active;});
  });
  const group=[...form.querySelectorAll('[data-career-for]')].find(el=>el.dataset.careerFor===position);
  const selected=group?.querySelector('input[data-career-candidate]:checked');
  const hand=group?.querySelector('input[data-career-hand]:checked');
  form.querySelector('button[type="submit"]').disabled=!(selected && hand);
}

function customCareerForm(board) {
  const budget = FP.careerLegacyStartingTotal;
  return `<details class="panel custom-career"><summary>능력치 직접 배분하기</summary>
    <p>능력치 6개에 ${budget}점을 배분해 기존 커리어 방식으로 시작해요.</p>
    <form id="custom-career-form">
      <input type="hidden" name="board" value="${E(board.id)}">
      ${field('선수 이름','name','','text','maxlength="24" placeholder="신인 선수"')}
      <label>포지션<select name="position"><option>타자</option><option>투수</option></select></label>
      ${['타자','투수'].map(position=>`<fieldset data-custom-position="${position}" ${position==='투수'?'hidden disabled':''}>
        <legend>${position} 설정</legend>
        <label>좌우 선택<select name="hand">${(position==='타자'?['우타','좌타']:['우투','좌투']).map(hand=>`<option>${hand}</option>`).join('')}</select></label>
        <div class="fields">${FP.careerAbilityLabels(position).map(label=>`<label>${label}<input type="number" name="ability" min="0" max="100" step="1" value="50" required></label>`).join('')}</div>
      </fieldset>`).join('')}
      <p class="muted" data-custom-budget role="status">능력치 합계 ${budget} / ${budget}점</p>
      <button class="btn" type="submit">직접 만든 선수로 시작</button>
    </form></details>`;
}

function syncCustomCareerSetup(form) {
  const position = form.elements.position.value;
  for (const group of form.querySelectorAll('[data-custom-position]')) {
    group.hidden = group.disabled = group.dataset.customPosition !== position;
  }
  const data = new FormData(form);
  const values = data.getAll('ability').map(value => value === '' ? NaN : Number(value));
  const budget = FP.careerLegacyStartingTotal;
  const valid = FP.normalizeCareerAbilities(position, values, budget);
  const total = values.reduce((sum,value)=>sum+value,0);
  form.querySelector('[data-custom-budget]').textContent = Number.isFinite(total)
    ? `능력치 합계 ${total} / ${budget}점` : '능력치 6개를 입력해 주세요.';
  form.querySelector('button[type="submit"]').disabled = !valid;
  return {data, valid};
}

function careerLobby() {
  const board=FP.data.careerDraft;
  const selection=board ? `<form id="career-form" class="panel">
    <input type="hidden" name="board" value="${E(board.id)}">
    ${field('선수 이름','name','','text','maxlength="24" placeholder="신인 선수"')}
    <fieldset class="career-prospects"><legend>포지션 선택</legend>
      <label><input type="radio" name="position" value="타자" checked> 타자</label>
      <label><input type="radio" name="position" value="투수"> 투수</label>
    </fieldset>
    ${['타자','투수'].map(position=>{
      const active=position==='타자';
      const hands=active?['우타','좌타']:['우투','좌투'];
      const labels=FP.careerAbilityLabels(position);
      return `<fieldset data-career-for="${position}" ${active?'':'hidden'}><legend>${position} 설정</legend>
        <div class="career-prospects">${hands.map((hand,index)=>`<label><input type="radio" name="hand-${position}" data-career-hand value="${hand}" ${index===0?'checked':''} ${active?'':'disabled'}> ${hand}</label>`).join('')}</div>
        <div class="compact-draft"><div class="draft-caption"><span>시작 능력치 · ★ 최고</span><b>총합 240 · 평균 40</b></div>
        <div class="draft-options">${FP.careerAbilityCandidates(board.seed,position).map((candidate,index)=>`<label class="draft-card"><input type="radio" name="candidate-${position}" data-career-candidate value="${index}" required ${active?'':'disabled'}>
        <span class="draft-card-body"><span class="draft-card-heading"><b>후보 ${String.fromCharCode(65+index)}</b><span>${candidate.style}</span><i aria-hidden="true">✓</i></span>
        <span class="draft-values">${labels.map((label,stat)=>`<span><small>${label}</small><strong class="${candidate.stats[stat]===Math.max(...candidate.stats)?'standout':''}">${candidate.stats[stat]}${candidate.stats[stat]===Math.max(...candidate.stats)?'<sup aria-label="후보 최고 능력치">★</sup>':''}</strong></span>`).join('')}</span></span></label>`).join('')}</div></div>
        </fieldset>`;
    }).join('')}
    <p class="muted">후보를 고르면 시작할 수 있어요. 호칭은 은퇴할 때 선택해요.</p>
    <button class="btn" type="submit" disabled>선택한 선수로 시작하기</button></form>${customCareerForm(board)}`
    : `<section class="panel"><h2>나만의 선수 만들기</h2>
      <p>선수 이름, 타자/투수, 좌타·우타 또는 좌투·우투를 고른 뒤 랜덤 능력치 후보 3개 중 하나를 선택하세요.</p>
      ${button('선수 만들기 시작','career-draft')}
      <p class="muted">각 후보의 능력치 합계는 240점입니다. 새로운 드래프트마다 후보가 달라집니다.</p>
      </section>`;
  return `${heading('BASEBALL CAREER','나만의 선수 만들기','랜덤 후보 3개 중 하나를 선택하세요 · 총합 240점')}
    <div class="game-start">${selection}</div>${careerArchive()}`;
}

function storySummary(c) {
 const rewards=FP.storyRewardIds(c),options=FP.careerTitleOptions(c);
 const ending=c.farewell==='ring'?(c.champion?'마지막 우승 도전이 결실을 맺었어요.':'우승에는 닿지 못했지만 마지막 승부를 끝까지 이어갔어요.'):c.farewell==='mentor'?'후배들과 경험을 나누며 마지막 시즌을 마쳤어요.':c.farewell==='home'?'익숙한 홈 팬들 앞에서 마지막 인사를 건넸어요.':'일곱 시즌의 기록을 남기고 새로운 일상을 시작해요.';
 const memory={team:'함께한 동료들의 이름을 마지막 사진에 적었어요.',challenge:'가장 치열했던 승부를 마지막 사진에 적었어요.',fans:'팬들에게 고마운 마음을 마지막 사진에 적었어요.'}[c.flags.memory];
 return `<div class="retirement-summary"><h3>${E(FP.careerConclusion(c))}</h3><p><b>${FP.careerRecord(c)}</b></p><p>${ending}</p>${memory?`<p class="muted">${memory}</p>`:''}
  <h3>나를 기억할 호칭</h3><p class="muted">기록과 선택을 보고 추천했어요. 하나를 골라 프로필에 전시하세요.</p><div class="title-options">${options.map(t=>`<button class="title-option ${c.selectedTitleId===t.id?'selected':''}" data-action="career-title" data-value="${c.id}:${t.id}" aria-pressed="${c.selectedTitleId===t.id}"><b>${t.name} ${c.selectedTitleId===t.id?'✓':''}</b><small>${t.reason}</small></button>`).join('')}</div>
  <h3>이번 커리어의 장식 ${rewards.length}개</h3><div class="reward-chips">${rewards.map(id=>{const i=FP.items.find(x=>x.id===id);return `<span title="${i.condition}">${i.icon} ${i.name}</span>`;}).join('')}</div><p class="muted">이미 보유한 장식은 중복으로 쌓이지 않아요.</p><button type="button" class="btn secondary" data-action="reward-decorate">내 티켓에 꾸미기</button>
  ${FP.account.username&&FP.communityMode?button('선수 랭킹에 올리기','ranking-register',c.id,'secondary'):''}</div>`;
}

function rankingScreen(){
 const {position,entries,mine,error,loading}=rankings;
 const pitcher=position==='투수';
 return `<a class="text-link" href="#game">‹ 게임</a>${heading('','선수 랭킹','공개 등록한 은퇴 선수의 과제용 기록이에요.')}
  <div class="actions">${['투수','타자'].map(key=>`<button type="button" class="btn ${key===position?'':'secondary'}" data-action="ranking-position" data-value="${key}" aria-pressed="${key===position}">${key}</button>`).join('')}${button('새로고침','ranking-refresh','','secondary')}</div>
  <section class="panel"><h2>${position} TOP 10</h2><p>${pitcher?'ERA 낮은 순 · 100이닝 이상':'타율 높은 순 · 300타수 이상'}</p>
  ${loading?'<p role="status">순위를 불러오는 중이에요.</p>':error?`<p role="status">${E(error)}</p>`:entries.length?`<ol>${entries.map(entry=>`<li><b>${E(entry.name)}</b> · ${E(entry.nickname)} · ${E(entry.seasons)}시즌 · ${E(entry.sample)}${pitcher?'이닝':'타수'} · ${pitcher?'ERA':'타율'} ${Number(entry.score).toFixed(pitcher?2:3)}</li>`).join('')}</ol>`:'<p>등록된 선수가 없어요.</p>'}</section>
  ${FP.account.username===rankings.owner&&!error&&mine.length?`<section class="panel"><h2>내 순위 등록</h2>${mine.map(row=>`<p>${E(row.position)} · ${E(row.name)} ${button('등록 취소','ranking-cancel',row.position+':'+row.careerId,'secondary')}</p>`).join('')}</section>`:''}`;
}

async function loadRankings(){
 if(!FP.communityMode||location.hash!=='#ranking')return;
 const request=++rankings.request;
 const username=FP.account.username;
 rankings.loading=true;rankings.error='';render();
 try{
  const [entries,mine]=await Promise.all([
   FP.cloudRpc('fanplay_demo_career_rankings',{p_position:rankings.position}),
   username?FP.cloudRpc('fanplay_demo_career_rank_status',{p_player_id:username}):[]
  ]);
  if(request!==rankings.request||username!==FP.account.username)return;
  rankings.entries=entries;rankings.mine=mine;rankings.owner=username;
 }catch(error){
  if(request!==rankings.request)return;
  rankings.error=['PGRST202','42883'].includes(error.code)?'운영 데이터베이스에 선수 랭킹 설정을 적용한 뒤 이용할 수 있어요.':error.message;
 }finally{
  if(request===rankings.request){rankings.loading=false;if(location.hash==='#ranking')render();}
 }
}

function storyGame(c) {
 const version=`${c.id}:${c.moves.length}`,labels=FP.careerStatLabels(c.position);
 const status=c.retired?`${c.step}시즌 · 은퇴`:c.pending?.id==='retirement'?'7시즌 결산':`${c.step+1}시즌 · ${['시즌 준비','전반기','승부처','시즌 마무리'][c.segment]}`;
 return `${heading('PLAYER CAREER',E(c.name)+'의 야구 인생',E(c.club)+' · '+FP.careerRoles[c.role])}
 <div class="story-status"><span>${status}</span><span>${FP.account.username?(FP.cloudMode?'온라인 저장':'계정에 저장'):'이번 방문만'}</span></div>
 <section class="panel story-scene">${c.retired?`<h2>은퇴 결산</h2>${storySummary(c)}<div class="actions">${button('다음 선수 만들기','career-draft')}</div>`:
 c.pending?`<div class="decision-scene"><img src="assets/broadcast/${c.position==='투수'?'pitch-ready':'bat-ready'}.webp" alt=""></div><div class="eyebrow">${c.pending.category}</div><h2 tabindex="-1" data-decision-title>${c.pending.title}</h2><p>${c.pending.prompt}</p><div class="choices">${c.pending.choices.map((ch,i)=>`<button type="button" data-action="auto-choice" data-value="${version}:${i}"><div><strong>${ch.label}</strong><small>${ch.hint}</small></div><b aria-hidden="true">›</b></button>`).join('')}</div>`:
 `<div class="career-broadcast" aria-label="가상 경기 중계">${broadcastPlayer(playbackFor(c))}</div><p class="career-news" role="status">${E(c.news)}</p><div class="actions playback-controls">${button(careerPaused?'계속 진행':'일시정지','auto-pause','','secondary')}${button('다음 선택까지','auto-skip',version)}</div>`}</section>
 ${[6,8].includes(c.rules)?`<details class="panel ability-details"><summary>선수 능력치 · ${c.hand}</summary><div class="draft-values">${FP.careerAbilityLabels(c.position).map((label,i)=>`<span><small>${label}</small><strong>${c.abilities[i]}</strong></span>`).join('')}</div><p class="muted">컨디션은 별도로 관리해요. 시작 성향과 은퇴 호칭은 다를 수 있어요.</p></details>`:''}<section class="panel compact-player"><div class="section-title"><b>현재 성향</b><span>${FP.careerStyle(c)}</span></div><div class="compact-stats">${c.stats.map((n,i)=>`<div><small>${labels[i]}</small><b>${n}</b><progress aria-label="${labels[i]}" value="${n}" max="100"></progress></div>`).join('')}${c.position==='타자'?`<div><small>주루</small><b>${c.speed}</b><progress aria-label="주루" value="${c.speed}" max="100"></progress></div>`:''}</div></section>
 <details class="panel history"><summary>기록과 선택 모아 보기 · ${c.log.length}시즌</summary><p><b>${FP.careerRecord(c)}</b></p>${c.duels.some(x=>x.rival)?`<p>라이벌 상대 전적 · ${c.duels.filter(x=>x.rival&&x.success).length}승 ${c.duels.filter(x=>x.rival&&!x.success).length}패</p>`:''}
 ${c.log.map(e=>`<p><b>${e.season}시즌 · ${e.club} · ${FP.careerRoles[e.role]}</b><br>${FP.careerRecord(c,[e])}</p>`).join('')}
 ${c.story.map(e=>`<article class="story-entry"><small>${e.season}시즌 · ${e.title}</small><b>${e.choice}</b><p>${e.result}</p></article>`).join('')||'<p>첫 선택을 기다리고 있어요.</p>'}</details>${careerArchive()}`;
}

function game() {
  const career = FP.data.career;
  if (!career) return careerLobby();
  if ([6,7,8].includes(career.rules)) return storyGame(career);
  const upgrade=`<div class="notice"><p>이 선수는 이전 규칙으로 이어갈 수 있어요. 새 커리어에서는 다양한 사건과 장식 보상을 만날 수 있어요.</p>${button('현재 선수 보관하고 새 방식 시작','career-fresh','','secondary')}</div>`;
  if ([3,4,5].includes(career.rules)) return upgrade+autoGame(career);
  if (career.rules!==2) return upgrade+legacyGame(career)+careerArchive();
  const completed = career.step===FP.careerLength;
  const labels = FP.careerStatLabels(career.position);
  const last = career.log.at(-1);
  return `${upgrade}${heading('PLAYER CAREER',`${E(career.name)}의 야구 일기`,`${career.style} · ${FP.careerRoles[career.role]}`)}
    <div class="game-grid">
      <aside class="panel"><h2>선수 상태</h2>
      ${career.stats.map((value, index) => `<div class="stat"><label>${labels[index]} <b>${value}</b></label>
        <progress aria-label="${labels[index]}" max="100" value="${value}">${value}</progress></div>`).join('')}</aside>
      <section class="panel scene">
        ${last ? `<div class="result"><h3>${last.season}시즌 결산 · ${FP.careerRoles[last.role]}</h3>
          <p><b>${FP.careerRecord(career,[last])}</b></p><p>${last.reason}</p>${last.moment ? `<span class="badge">✦ ${last.moment}</span>` : ''}</div>` : ''}
        ${completed ? `<div class="eyebrow">CAREER COMPLETE</div><h2>3시즌 완주</h2>${careerSummary(career)}
          <div class="actions">${button('다음 선수 드래프트','career-draft')}</div>`
          : `<div class="eyebrow">SEASON ${career.step+1} / ${FP.careerLength}</div><h2>${career.step+1}시즌 진로 선택</h2>
          <div class="choices">${FP.careerChoices(career).map((choice, index) => `<button type="button" data-action="career-season" data-value="${career.id}:${career.step+1}:${index}">
            <span>0${index+1}</span><div>${choice.label}<small>${choice.hint}</small>
            <small>${labels.map((label, stat) => `${label} ${choice.delta[stat]>0?'+':''}${choice.delta[stat]}`).join(' · ')}</small></div><b>↗</b></button>`).join('')}</div>`}
      </section>
    </div>
    ${career.log.length ? `<details class="panel history"><summary>시즌 기록 ${career.log.length}개</summary>${career.log.map(entry =>
      `<p><b>${entry.season}시즌 · ${FP.careerRoles[entry.role]}</b><br>${entry.label} · ${FP.careerRecord(career,[entry])}</p>`).join('')}</details>` : ''}
    ${careerArchive()}`;
}

function autoGame(career) {
  const {pending, retired, step, log, name, club, segment, news, extended} = career;
  const version = `${career.id}:${career.moves.length}`;
  const season = step+1;
  const phase = season<=2 ? '신인' : season<=5 ? '전성기' : '베테랑';
  const last = log.at(-1);
  const labels = FP.careerStatLabels(career.position);
  const status = retired ? `${step}시즌 · 은퇴` : pending?.choices[0].retire ? '7시즌 결산' : `${season}시즌 · ${phase} · ${segment===0?'4월':'7월'}`;
  return `${heading('PLAYER CAREER',`${E(name)}의 야구 인생`,`${club} · ${FP.careerRoles[career.role]}`)}
    <div class="game-grid auto-career">
      <section class="panel scene">
        <div class="eyebrow">${status}</div>
        <p class="career-news" role="status">${news}</p>
        ${retired ? `<h2>은퇴 결산</h2>${careerSummary(career)}
          <div class="actions">${button('다음 선수 드래프트','career-draft')}</div>`
          : pending ? `<h2>${pending.title}</h2><p>${pending.prompt}</p><div class="choices">
            ${pending.choices.map((choice,index)=>`<button type="button" data-action="auto-choice" data-value="${version}:${index}">
              <span>0${index+1}</span><div>${choice.label}<small>${choice.hint}</small></div><b>↗</b></button>`).join('')}
          </div>` : `<h2>${careerPaused?'일시정지':extended?'마지막 시즌':'시즌 진행 중'}</h2>
          <div class="career-broadcast" aria-label="가상 경기 중계">${broadcastPlayer(playbackFor(career))}</div>
          <div class="actions">${button(careerPaused?'계속 진행':'일시정지','auto-pause','','secondary')}
          ${button('다음 선택까지','auto-skip',version,'secondary')}</div>`}
        ${last && !retired ? `<div class="result"><b>${last.season}시즌 결산 · ${FP.careerRoles[last.role]}</b><p>${FP.careerRecord(career,[last])}</p></div>` : ''}
      </section>
      <aside class="panel"><h2>선수 상태</h2>${career.stats.map((value,index)=>`<div class="stat"><label>${labels[index]} <b>${value}</b></label>
        <progress aria-label="${labels[index]}" max="100" value="${value}">${value}</progress></div>`).join('')}</aside>
    </div>
    ${log.length ? `<details class="panel history"><summary>시즌 기록 ${log.length}개</summary>${log.map(entry=>
      `<p><b>${entry.season}시즌 · ${entry.club} · ${FP.careerRoles[entry.role]}</b><br>${entry.label} · ${FP.careerRecord(career,[entry])}${entry.moment?` · ✦ ${entry.moment}`:''}</p>`).join('')}</details>` : ''}
    ${careerArchive()}`;
}

function playbackFor(career) {
  const version = `${career.id}:${career.moves.length}`;
  if (careerBroadcast?.version!==version) {
    const broadcast = FP.careerBroadcast(career);
    const pitcher = career.position==='투수';
    const video = pitcher ? {strikeout:'pitch-strikeout.mp4'} : {hit:'bat-hit.mp4',strikeout:'bat-miss.mp4'};
    const still = pitcher ? {strikeout:'strikeout.webp'} : {flyout:'flyout.webp',homeRun:'home-run.webp',hit:'hit.webp'};
    careerBroadcast = {version,index:0,videoTime:0,...broadcast,
      poster:pitcher?'pitch-ready.webp':'bat-ready.webp',still:still[broadcast.result],
      clip:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? null : video[broadcast.result]};
  }
  return careerBroadcast;
}

const broadcastAsset = file => `assets/broadcast/${file}`;

function broadcastPlayer(playback) {
  const showVideo = playback.clip && !playback.videoFailed;
  return `<div class="broadcast-visual" aria-hidden="true">
    <img class="broadcast-still" src="${broadcastAsset(playback.index===playback.frames.length-1 && playback.still ? playback.still : playback.poster)}" alt="" ${showVideo?'hidden':''}>
    ${showVideo ? `<video class="broadcast-clip" data-version="${playback.version}" src="${broadcastAsset(playback.clip)}" poster="${broadcastAsset(playback.poster)}" preload="metadata" muted playsinline disablepictureinpicture></video>` : ''}
    </div><div class="broadcast-content">${broadcastMarkup(playback)}</div>`;
}

function broadcastMarkup(playback) {
  const {inning,half,outs,frames,index} = playback;
  const frame = frames[index];
  return `<div class="broadcast-header"><span><i aria-hidden="true"></i> 경기 중계 · 대표 장면</span><b>${inning}회 ${half} · ${outs}아웃</b></div>
    <div class="broadcast-count" aria-label="${frame.balls}볼 ${frame.strikes}스트라이크">
      <span><b>${frame.balls}</b> 볼</span><span><b>${frame.strikes}</b> 스트라이크</span>
      <strong class="broadcast-call ${frame.tone||''}">${frame.label}</strong>
    </div>
    <p class="broadcast-line" ${frame.tone?'role="status"':''}>${frame.line}${frame.tone==='good'&&['heart','dance'].includes(playback.celebration)?`<span class="celebration" aria-hidden="true">${playback.celebration==='heart'?'♡':'♫'}</span>`:''}</p>
    <div class="broadcast-trail" aria-hidden="true">${frames.slice(1,index+1).map(pitch=>`<span>${pitch.label}</span>`).join('')}</div>`;
}

function updateBroadcastFrame(playback, index) {
  if (playback.index===index) return;
  playback.index = index;
  const content = app.querySelector('.broadcast-content');
  if (content) content.innerHTML = broadcastMarkup(playback);
  const still = app.querySelector('.broadcast-still');
  if (still && !still.hidden && playback.still && index===playback.frames.length-1) still.src = broadcastAsset(playback.still);
}

function fallBackBroadcast(playback, video) {
  if (!video.isConnected || careerBroadcast!==playback) return;
  playback.videoFailed = true;
  const still = app.querySelector('.broadcast-still');
  if (still) {
    still.hidden = false;
    if (playback.still && playback.index===playback.frames.length-1) still.src = broadcastAsset(playback.still);
  }
  video.pause();
  video.remove();
  scheduleCareer();
}

function playBroadcastClip(career, playback, video) {
  if (video.readyState>=1 && !video.dataset.restored) {
    video.dataset.restored = 'true';
    if (playback.videoTime>0) video.currentTime = playback.videoTime;
  }
  if (video.error) {fallBackBroadcast(playback,video);return;}
  if (video.ended) {
    updateBroadcastFrame(playback,playback.frames.length-1);
    void advanceTimeline(career.id,career.moves.length,-1);
    return;
  }
  const now = Date.now();
  playback.movingAt ??= now;
  if (video.currentTime>playback.videoTime) {
    playback.videoTime = video.currentTime;
    playback.movingAt = now;
  } else if (now-playback.movingAt>2500) {
    fallBackBroadcast(playback,video);
    return;
  }
  if (video.paused) video.play().catch(() => {
    if (!careerPaused && !document.hidden) fallBackBroadcast(playback,video);
  });
  const time = video.currentTime;
  const result = playback.frames.length-1;
  const index = time>=2.2 ? result : time<1.25 ? 0 : Math.min(result-1,1+Math.floor((time-1.25)/.3));
  updateBroadcastFrame(playback,index);
  careerTimer = setTimeout(scheduleCareer,100);
}

function scheduleCareer() {
  clearTimeout(careerTimer);
  const c = FP.data.career;
  const video = app.querySelector?.('.broadcast-clip');
  if (location.hash!=='#game' || document.hidden || careerPaused || careerSaving || FP.account.checking || FP.account.busy ||
    ![3,4,5,6,7,8].includes(c?.rules) || c.pending || c.retired) {
    if (video) video.pause();
    if (careerBroadcast) careerBroadcast.movingAt = null;
    return;
  }
  const playback = playbackFor(c);
  if (video && !playback.videoFailed) {playBroadcastClip(c,playback,video);return;}
  const resultShowing = playback.index===playback.frames.length-1;
  careerTimer = setTimeout(() => {
    if (location.hash!=='#game' || document.hidden || careerPaused || FP.data.career!==c) return;
    if (resultShowing) {
      void advanceTimeline(c.id,c.moves.length,-1);
      return;
    }
    updateBroadcastFrame(playback,playback.index+1);
    scheduleCareer();
  },resultShowing?1400:850);
}

async function advanceTimeline(id, version, move, skip=false) {
  if (careerSaving || FP.account.checking || FP.account.busy) return;
  clearTimeout(careerTimer);
  app.querySelector?.('.broadcast-clip')?.pause();
  careerSaving = true;
  try {
    const before=new Set(FP.data.inventory.itemIds);
    if (!await FP.advanceAutoCareer(id,version,move,skip)) careerPaused = true;
    else {const fresh=FP.data.inventory.itemIds.filter(x=>!before.has(x));if(fresh.length) FP.toast('새 장식: '+fresh.map(id=>FP.items.find(x=>x.id===id).name).join(', '),true);}
  } finally {
    careerSaving = false;
    if (location.hash==='#game') render();
  }
}

const signup=()=>login(true);
const screens={home,create:editor,collection,game,ranking:rankingScreen,community,profile,'profile-edit':profileEdit,login,register:signup,'login-team':signup,account:accountTools,records:recordScreen};
function render() {
  if(matchOwner!==FP.account.username){
    matchOwner=FP.account.username;
    matchResults=matchOwner?FP.loadMatchResults(localStorage):guestMatches;
    matchImportReport=null;
    appliedMatch=null;
  }
  theme();
  const route = location.hash.slice(1) || 'home';
  const view = Object.hasOwn(screens, route) ? route : 'home';
  const activeTab = view === 'create' ? 'home' : view==='ranking'?'game':['collection','profile-edit','account','records'].includes(view) ? 'profile' : view;
  const loginPage=FP.cloudMode&&demoAuthRoutes.includes(view)&&!FP.account.username;
  document.querySelector('.bottomnav')?.toggleAttribute?.('hidden',loginPage);
  const accountLink=document.querySelector('.header-account');
  if(accountLink?.toggleAttribute){
    accountLink.hidden=!FP.cloudMode||!FP.account.username;
    if(!accountLink.hidden&&view==='account')accountLink.setAttribute('aria-current','page');
    else accountLink.removeAttribute('aria-current');
  }
  const sections = view==='game' ? ['.history','.career-archive','.ability-details'] : ['.cloud-tools'];
  const openSections = sections.filter(selector=>app.querySelector?.(selector)?.open);
  const previousClip = app.querySelector?.('.broadcast-clip');
  if (previousClip) previousClip.pause();
  if (careerBroadcast) careerBroadcast.movingAt = null;
  const restore=FP.account.restorePending?`<section class="panel"><h1>온라인 기록 복원</h1>
   <p role="status">${E(FP.account.checking?'이전에 접속한 온라인 기록을 확인하고 있어요.':FP.cloudError||'온라인 기록을 복원하지 못했어요.')}</p>
   ${FP.account.checking?'':`<div class="actions">${button('다시 연결','cloud-retry')}${button('비회원으로 계속','cloud-guest','','secondary')}</div>`}</section>`:'';
  const guestNotice=!FP.account.username&&(loginPage||['create','collection','game','profile'].includes(view))?
    '<p class="notice">비회원 기록은 이번 방문에만 유지돼요. 새로고침하거나 탭을 닫으면 사라져요.</p>':'';
  const draftNotice=view==='create'?`<div class="actions"><button type="button" class="btn quiet" data-action="discard-ticket-draft">작성 중인 티켓 삭제</button>
   ${FP.account.username&&FP.accountSaveState==='error'?button('최신 티켓 확인 후 다시 저장','ticket-rebase','','secondary'):''}
   </div>`:'';
  const rankLink=view==='game'&&FP.communityMode?'<a class="text-link" href="#ranking">투수·타자 랭킹 →</a>':'';
  app.innerHTML = restore || guestNotice+rankLink+screens[view]()+draftNotice+(view==='create'&&draftPhotoMissing?'<p role="status">텍스트와 꾸미기를 복구했어요. 사진은 다시 선택해 주세요.</p>':'');
  const nextClip = app.querySelector?.('.broadcast-clip');
  if (previousClip && nextClip?.dataset.version===previousClip.dataset.version) nextClip.replaceWith(previousClip);
  for (const selector of openSections) {
    const details = app.querySelector(selector);
    if (details) details.open = true;
  }
  document.querySelectorAll('.bottomnav a').forEach(link => {
    const selected = link.hash === '#' + activeTab;
    link.classList.toggle('active', selected);
    if (selected) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  void FP.watchCommunity?.(view==='community'&&!FP.account.restorePending);
  scheduleCareer();
}
function syncDraft(form){
 if(!form||!draft)return;
 const data=new FormData(form);
 for(const name of ['date','stadium','home','away','hs','as','mode','tag','note','theme','color'])if(form.elements[name])draft[name]=['hs','as'].includes(name)?(form.elements[name].value === '' ? '' : Number(form.elements[name].value)):form.elements[name].value;
 for(const name of ['frameId','backgroundId','badgeId']) if(form.elements[name])draft[name]=data.get(name)||'default';
 if(formStage===2&&decorationTab==='sticker') {
  const selected=data.getAll('stickerIds');
  if(selected.length>3){FP.toast('스티커는 최대 3개까지 붙일 수 있어요.');for(const input of form.querySelectorAll('[name="stickerIds"]')) input.checked=draft.stickerIds.includes(input.value);}
  else draft.stickerIds=selected;
 }
 rememberTicketDraft();
}
app.addEventListener('change',e=>{const form=e.target.closest('#career-form');if(form)syncCareerSetup(form);});
for (const type of ['input','change']) app.addEventListener(type,event=>{
  const form=event.target.closest('#custom-career-form');
  if(form)syncCustomCareerSetup(form);
});
app.addEventListener('input',e=>{const form=e.target.closest('#ticket-form');if(form&&e.target.type!=='file'){syncDraft(form);document.querySelector('#ticket-preview').innerHTML=FP.ticket({...draft,home:draft.home||'홈 팀',away:draft.away||'원정 팀'});}});
app.addEventListener('change',async event=>{
 const input=event.target;
 if(input.id!=='photo'||photoBusy)return;
 const file=input.files[0];
 if(!file)return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024){
  FP.toast('JPG/PNG/WebP 이미지, 최대 12MB까지 선택할 수 있습니다.');
  input.value='';
  return;
 }
 const targetDraft=draft;
 photoBusy=true;
 document.querySelector('#photo-status').textContent='사진을 처리하고 있습니다…';
 document.querySelector('#ticket-form button[type=submit]').disabled=true;
 try{
  const bitmap=await createImageBitmap(file);
  try{
   const ratio=Math.min(1,900/Math.max(bitmap.width,bitmap.height));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(bitmap.width*ratio));
   canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
   canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
   if(draft!==targetDraft)return;
   draft.photo=canvas.toDataURL('image/jpeg',.68);
   draftPhotoMissing=false;
   rememberTicketDraft();
   FP.toast('사진을 추가했습니다.');
  }finally{bitmap.close();}
 }catch{
  FP.toast('이미지를 읽지 못했습니다. 다른 사진을 선택해 주세요.');
 }finally{
  photoBusy=false;
  if(location.hash==='#create')render();
 }
});
async function submitAccount(form) {
  if(FP.account.busy)return;
  const action = form.dataset.accountAction;
  const credentials = Object.fromEntries(new FormData(form));
  if (action === 'delete' && !confirm('이 계정과 서버에 저장된 기록을 삭제할까요?')) return;
  FP.account.busy = true;
  const submit = form.querySelector('button[type="submit"]');
  const inlineError=form.querySelector('.login-error');
  if(inlineError)inlineError.textContent='';
  submit.disabled = true;
  try {
    const result = action === 'delete'
      ? await FP.accountRequest('account', 'DELETE', { username: FP.account.username, password: credentials.password })
      : await FP.accountRequest(action, 'POST', {
        ...credentials,
        username: action === 'logout' ? FP.account.username : credentials.username,
        acceptedTerms: credentials.acceptedTerms === 'on'
      });
    FP.useAccount(result);
    backupPreview=null;
    shareOptions=null;
    rankings.mine=[];
    draft = null;draftExpected=undefined;draftPhotoMissing=false;
    appliedMatch = null;
    formStage = 1;
    filter = '전체';
    if(FP.cloudMode){
      if(action==='logout'){pendingShare=null;location.hash='profile';}
      else if(demoAuthRoutes.includes(location.hash.slice(1)))location.hash=loginReturn;
      loginReturn='profile';
      loginId='';
    }
    render();
    FP.toast(FP.cloudMode ? (action==='register'?'회원가입을 완료했어요.':result.username?'온라인 시연 기록을 불러왔어요.':'아이디 사용을 종료했어요.') : action === 'delete' ? '계정과 기록을 삭제했습니다.'
      : result.username ? '로그인했습니다.' : '로그아웃했습니다.');
  } catch (error) {
    const message=error.message||'계정 서버에 연결하지 못했습니다.';
    if(inlineError?.isConnected)inlineError.textContent=message;
    else FP.toast(message);
  } finally {
    FP.account.busy = false;
    submit.disabled = false;
  }
}

app.addEventListener('submit',async e=>{e.preventDefault();const form=e.target;
if(FP.account.checking || FP.account.busy) return;
if(form.id==='custom-career-form'){
 const {data,valid}=syncCustomCareerSetup(form);
 if(valid&&await FP.signCustomCareer(data.get('board'),data.get('name'),data.get('position'),data.get('hand'),valid))render();
 return;
}
if(form.dataset.accountAction){await submitAccount(form);return;}
if(form.id==='public-share-form'&&shareOptions){
 const {ticket,photo,note,text}=shareOptions;
 const submit=form.querySelector('button[type=submit]');
 submit.disabled=true;
 const publicTicket={...ticket,photo:photo?ticket.photo:'',note:note?ticket.note:''};
 const thumbnail=await FP.communityThumbnail(publicTicket.photo);
 if(!form.isConnected||!FP.account.username)return;
 if(await FP.communityAction('post',{p_ticket:publicTicket,p_text:text.trim(),p_include_photo:photo,p_include_note:note,p_thumbnail:thumbnail})){
  shareOptions=null;pendingShare=null;
  FP.communitySort='latest';FP.resetCommunityPage();location.hash='community';FP.toast('티켓을 게시했어요.');
 }else if(form.isConnected)submit.disabled=false;
 return;
}
if(FP.communityMode && form.classList.contains('comment-form')){
 const comment=form.elements.comment.value.trim();
 if(comment && await FP.communityAction('comment',{p_post_id:form.dataset.post,p_text:comment})){
  FP.communityDraft(form.dataset.post,'');form.reset();
  await FP.refreshCommunity(true);
 }
 return;
}
if(form.id==='ticket-form'){
 syncDraft(form);
 if(photoBusy)return;
 if(formStage===1&&(!FP.validDate(draft.date)||!draft.home.trim()||!draft.away.trim()||!draft.stadium.trim()||!FP.validScore(draft.hs)||!FP.validScore(draft.as))){
  FP.toast('날짜, 구장, 두 팀과 점수를 확인해 주세요.');
  return;
 }
 if(formStage<3){
  formStage++;rememberTicketDraft();render();
 }else{
  const editing=draft, owner=FP.account.username;
  if(await FP.saveTicket(editing,draftExpected)){
   if(draft===editing&&owner===FP.account.username)clearTicketDraft();
   if(location.hash==='#create')location.hash='collection';
   FP.toast('티켓을 수집함에 저장했습니다.');
  }else if(location.hash==='#create')render();
 }
 return;
}
if(form.id==='career-form'){
 const fields=new FormData(form);
 const position=fields.get('position');
 if(await FP.signStoryPlayer(fields.get('board'),fields.get('name'),position,fields.get('hand-'+position),Number(fields.get('candidate-'+position))))render();
}else if(form.id==='profile-form'){
 if(await FP.transact(d=>{
  d.profile.nickname=form.elements.nickname.value.trim()||'야구팬';
  d.profile.team=form.elements.team.value;
  d.profile.selectedTitleId=form.elements.title.value||null;
 })){
  location.hash='profile';
  FP.toast('프로필을 저장했습니다.');
 }
}else if(form.classList.contains('comment-form')){
 const value=form.elements.comment.value.trim();
 if(value&&await FP.transact(d=>{d.posts.find(p=>p.id===form.dataset.post).comments.push({nickname:d.profile.nickname,text:value.slice(0,200)});}))render();
}
});
app.addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b||FP.account.checking||FP.account.busy)return;const {action:a,value:v}=b.dataset;
if(a==='stage'){syncDraft(document.querySelector('#ticket-form'));formStage=Number(v);rememberTicketDraft();render();}
if(a==='remove-photo'){draft.photo='';draftPhotoMissing=false;rememberTicketDraft();render();}
if(a==='discard-ticket-draft'&&confirm('작성 중인 티켓을 지울까요? 수집함에 저장한 티켓은 남아요.')){clearTicketDraft();render();return;}
if(a==='ticket-rebase'&&draft&&FP.account.username){
 try{
  const result=FP.cloudMode?await FP.accountRequest('login','POST',{username:FP.account.username}):await FP.accountRequest('session');
  if(!result.username)throw new Error('다시 로그인해 주세요.');
  const latest=FP.normalize(result.state);
  const original=latest.tickets.find(t=>t.id===draft.id);
  const detail=original?`${original.date} · ${original.home} / ${original.away}`:'최신 기록에 이 티켓이 없어요.';
  if(!confirm(detail+'\n현재 초안으로 다시 저장할 수 있게 할까요?'))return;
  FP.useAccount(result);
  draftExpected=JSON.stringify(original??null);rememberTicketDraft();render();
 }catch(error){FP.toast(error.message);}
 return;
}
if(a==='filter'){filter=v;render();}
if(a==='edit'){const ticket=FP.data.tickets.find(t=>t.id===v);if(!ticket)return;openTicketDraft(ticket,ticket.mode==='커리어'?2:1);if(location.hash==='#create')render();else location.hash='create';}
if(a==='feature'&&await FP.transact(d=>{d.profile.featuredTicketId=v;})){render();FP.toast('대표 티켓을 지정했습니다.');}
if(a==='unfeature'&&await FP.transact(d=>{d.profile.featuredTicketId=null;}))render();
if(a==='delete'&&confirm('이 티켓을 삭제할까요? 게시된 사본은 유지됩니다.')&&await FP.deleteTicket(v))render();
if(a==='choose'&&await FP.choose(Number(v)))render();
if(a==='career-draft'&&await FP.openCareerDraft()){careerPaused=false;render();}
if(a==='career-fresh'&&await FP.newStoryWithBackup()){careerPaused=false;render();}
if(a==='career-resume'&&await FP.resumeSavedCareer(v)){careerPaused=true;render();FP.toast('선수 기록을 불러왔어요. 자동 진행은 일시정지 상태예요.');}
if(a==='career-draft-resume'&&await FP.resumeSavedDraft(v)){render();FP.toast('보관한 선수 후보를 열었어요.');}
if(a==='ranking-position'||a==='ranking-refresh'){
 if(a==='ranking-position')rankings.position=v;
 await loadRankings();return;
}
if(a==='ranking-register'||a==='ranking-cancel'){
 const username=FP.account.username;
 if(!username||!FP.communityMode)return;
 const career=[FP.data.career,...FP.data.careerHistory,...FP.data.savedCareers.map(item=>item.career)].find(c=>c?.id===v);
 const [position,id]=a==='ranking-register'?[career?.position,career?.id]:v.split(':');
 const register=a==='ranking-register';
 if(!id||!confirm(register?'선수 이름과 통산 기록을 공개 순위에 올릴까요? 같은 포지션의 기존 대표 기록을 교체해요.':'이 선수의 순위 등록을 취소할까요?'))return;
 FP.account.busy=true;
 try{
  const changed=await FP.cloudRpc('fanplay_demo_career_rank_write',{p_player_id:username,p_position:position,p_action:register?'register':'cancel',p_career_id:id});
  FP.toast(changed?(register?'선수 기록을 등록했어요.':'등록을 취소했어요.'):'이미 등록이 바뀌었어요.');
  rankings.position=position;
  if(location.hash==='#ranking')await loadRankings();else location.hash='ranking';
 }catch(error){FP.toast(error.message);}
 finally{FP.account.busy=false;}
 return;
}
if(a==='auto-pause'){careerPaused=!careerPaused;render();}
if(a==='auto-choice'||a==='auto-skip') {
 const [id,version,choice] = v.split(':');
 await advanceTimeline(id,Number(version),a==='auto-choice'?Number(choice):-1,a==='auto-skip');
}
if(a==='career-season') {
 const [id, season, option] = v.split(':');
 if(await FP.advanceCareer(id,Number(season),Number(option)))render();
}
if(a==='career-title') { const [id,title]=v.split(':'); if(await FP.selectCareerTitle(id,title)){render();FP.toast('호칭을 기록과 프로필에 전시했어요.');} }
if(a==='guest-import'){if(await FP.importGuestRecords(v,b.dataset.source))FP.toast('선택한 기록을 계정에 가져왔어요.');render();}
if(a==='cloud-download')FP.downloadDemoState?.();
if(a==='cloud-retry'&&FP.cloudMode){const restoring=FP.restoreAccount();render();await restoring;render();return;}
if(a==='cloud-guest'&&FP.continueAsGuest?.()){backupPreview=null;render();return;}
if(a==='records-download'&&FP.account.username){FP.downloadRecordFile(JSON.stringify({format:'fanplay-backup',version:1,state:FP.data},null,2),'fanplay-records.json');return;}
if(a==='records-download-pending'&&FP.account.username&&FP.pendingAccountSave?.username===FP.account.username){
 FP.downloadRecordFile(JSON.stringify(FP.pendingAccountSave.state,null,2),'fanplay-unsaved.json');return;
}
if(a==='records-download-original'&&FP.account.username){
 const raw=FP.accountRecovery?.raw||readStoredRecovery();
 if(raw)FP.downloadRecordFile(raw,'fanplay-original.json');return;
}
if(a==='records-cancel'){backupPreview=null;render();return;}
if(a==='records-apply'&&backupPreview&&FP.account.username){
 const next=FP.mergeGuestRecords(FP.data,backupPreview.state,v);
 const saved=await FP.transact(state=>Object.assign(state,next));
 if(saved){backupPreview=null;render();FP.toast('기록 파일을 가져왔어요.');}
 return;
}
if(a==='cloud-refresh'&&FP.cloudMode&&FP.account.username){
 if(confirm('현재 온라인 기록을 다시 불러올까요? 아직 저장하지 못한 변경은 먼저 현재 기록 내려받기로 보관해 주세요.')){
  FP.account.busy=true;
  try{const result=await FP.accountRequest('login','POST',{username:FP.account.username});FP.useAccount(result);draft=null;appliedMatch=null;formStage=1;FP.accountSaveState='idle';FP.accountSaveStatus='온라인 기록을 다시 불러왔어요.';render();FP.toast('최신 기록을 불러왔어요.');}
  catch(error){FP.toast(error.message);}
  finally{FP.account.busy=false;scheduleCareer();}
 }
}
if(a==='guest-dismiss'){FP.dismissGuestImport(b.dataset.source);render();}
if(a==='guest-review'){const available=FP.reopenGuestImport();render();if(!available)FP.toast('가져올 기록이 없어요.');}
if(a==='reward-decorate')FP.openDecorationEditor();
if(a==='import-backup'){
 let saved;try{saved=localStorage.getItem('fanplay-before-import-'+FP.account.username);}catch{}
 if(!saved)FP.toast('아직 기록 가져오기를 실행하지 않았어요.');
 else {const url=URL.createObjectURL(new Blob([saved],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='fanplay-before-import.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
if(a==='decoration-tab'){
 syncDraft(document.querySelector('#ticket-form'));decorationTab=v;render();
 app.querySelector('.decoration-tabs [aria-pressed="true"]')?.focus({preventScroll:true});
}
if(a==='decoration-all'){syncDraft(document.querySelector('#ticket-form'));showAllDecorations=!showAllDecorations;render();app.querySelector('[data-action="decoration-all"]')?.focus({preventScroll:true});}
if(a==='decoration-info'){
 const item=FP.items.find(i=>i.id===v),info=app.querySelector('.decoration-info');
 if(item&&info){info.textContent=item.name+' · 획득 조건: '+item.condition;info.scrollIntoView({block:'nearest'});}
}
if(a==='career-ticket') {
 const career = [FP.data.career,...FP.data.careerHistory].find(candidate => candidate?.id===v);
 if(![6,7,8].includes(career?.rules) && FP.careerComplete(career) && !FP.data.tickets.some(ticket => ticket.id===`career-${v}`) &&
  await FP.saveTicket(FP.careerTicket(career,new Date().toLocaleDateString('sv-SE')))) {
   filter='커리어';
   location.hash='collection';
   FP.toast('기념 티켓을 수집함에 저장했습니다.');
 }
}
if(a==='restart'&&confirm('현재 커리어를 끝내고 새 선수를 만들까요? 획득 보상은 유지됩니다.')&&await FP.transact(d=>{d.career=null;}))render();
if(a==='community-sort'&&FP.communityMode){
 FP.communitySort=v;FP.resetCommunityPage();FP.communityLoaded=false;FP.communityPosts=[];FP.communityError='';render();
 app.querySelector('[data-action="community-sort"][aria-pressed="true"]')?.focus({preventScroll:true});
 await FP.refreshCommunity(true);return;
}
if(a==='community-refresh'&&FP.communityMode){await FP.refreshCommunity(true);return;}
if(a==='community-page'&&FP.communityMode){
 await FP.changeCommunityPage(Number(v));window.scrollTo(0,0);return;
}
if(a==='community-comments'){await FP.communityComments(v,true);return;}
if(a==='community-photo'){await FP.showCommunityPhoto(v);return;}
if(a==='community-report'){
 const reason=prompt('신고 사유를 적어 주세요. (최대 200자)');
 if(reason?.trim()&&await FP.communityAction('report',{p_post_id:v,p_text:reason.trim().slice(0,200)}))FP.toast('신고가 접수됐어요.');
 return;
}
if(a==='dismiss-share'){pendingShare=null;shareOptions=null;render();return;}
if(FP.communityMode&&['share','resume-share'].includes(a)){
 const ticket=a==='resume-share'?pendingShare:FP.ticketData(FP.data.tickets.find(t=>t.id===v));
 if(!ticket)return;
 if(!FP.account.username){openLogin('collection',ticket);return;}
 shareOptions={ticket,text:'',photo:false,note:false};
 render();app.querySelector('#share-panel h2')?.focus();
 return;
}
if(FP.communityMode&&a==='like'){
 const post=FP.communityPosts.find(item=>item.id===v);
 if(post&&await FP.communityAction('like',{p_post_id:v,p_liked:!post.liked}))await FP.refreshCommunity(true);
 return;
}
if(FP.communityMode&&a==='delete-post'){
 if(confirm('이 게시글과 댓글을 삭제할까요?')&&await FP.communityAction('delete',{p_post_id:v}))await FP.refreshCommunity(true);
 return;
}
if(FP.communityMode&&a==='edit-post'){
 const post=FP.communityPosts.find(item=>item.id===v&&item.mine);
 if(!post)return;
 const message=prompt('게시글 글을 수정해 주세요. 티켓과 작성 시간은 유지돼요. (최대 300자)',post.text);
 if(message!==null&&await FP.communityAction('edit',{p_post_id:v,p_text:message.slice(0,300)}))await FP.refreshCommunity(true);
 return;
}
if(FP.communityMode&&a==='delete-comment'){
 if(confirm('이 댓글을 삭제할까요?')&&await FP.communityAction('remove-comment',{p_post_id:b.dataset.post,p_comment_id:v})){
  await FP.communityComments(b.dataset.post,false,v);
  await FP.refreshCommunity(true);
 }
 return;
}
if(a==='share'){const text=prompt('티켓과 함께 남길 이야기 (최대 300자)');if(text!==null&&await FP.transact(d=>{d.posts.unshift({id:uid(),nickname:d.profile.nickname,text:text.slice(0,300),ticket:FP.copy(d.tickets.find(t=>t.id===v)),liked:false,comments:[]});})){location.hash='community';FP.toast('커뮤니티 시연 기록에 저장했습니다.');}}
if(a==='like'&&await FP.transact(d=>{const p=d.posts.find(p=>p.id===v);p.liked=!p.liked;}))render();
if(a==='delete-post'&&confirm('이 게시글과 댓글을 삭제할까요?')&&await FP.transact(d=>{d.posts=d.posts.filter(p=>p.id!==v);}))render();
});
app.addEventListener('click',e=>{
 if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
 const link=e.target.closest('[data-login-return],[data-login-cancel]');
 if(!link)return;
 if(link.hasAttribute('data-login-cancel')){loginId='';loginReturn='profile';pendingShare=null;return;}
 e.preventDefault();openLogin(link.dataset.loginReturn);
});
window.addEventListener('hashchange',()=>{
 render();window.scrollTo(0,0);
 app.querySelector?.('.login-screen h1')?.focus();
 if(location.hash==='#ranking')void loadRankings();
});
function resetGuestVisit(){
 FP.guestData=FP.defaults();
 guestTicketDraft=null;
 guestMatches=[];
 pendingShare=null;
 if(FP.account.username)return;
 FP.data=FP.guestData;
 matchResults=guestMatches;
 matchImportReport=null;
 appliedMatch=null;
 draft=null;formStage=1;careerBroadcast=null;
 render();
}
window.addEventListener('pageshow',event=>{if(event.persisted)resetGuestVisit();});
window.addEventListener('fanplay-records-reset',resetGuestVisit);
app.addEventListener('change',async event=>{
 const input=event.target;
 if(!FP.account.username||!input.matches('[data-record-backup]'))return;
 const file=input.files[0],generation=FP.account.generation;
 input.value='';
 if(!file)return;
 try{
  if(file.size>16*1024*1024)throw new Error('16MB 이하의 기록 파일을 선택해 주세요.');
  const preview=FP.parseRecordBackup(await file.text());
  if(generation===FP.account.generation&&input.isConnected){backupPreview=preview;render();}
 }catch(error){FP.toast(error instanceof SyntaxError?'올바른 JSON 기록 파일을 선택해 주세요.':error.message);}
});
app.addEventListener('toggle',event=>{
 if(event.target.matches?.('.community-comments'))FP.communityThreadToggle?.(event.target);
},true);
app.addEventListener('input',event=>{
 if(event.target.id==='demo-login-id')loginId=event.target.value;
 const form=event.target.closest('form');
 if(form?.matches('.comment-form'))FP.communityDraft?.(form.dataset.post,form.elements.comment.value);
 if(form?.id!=='public-share-form'||!shareOptions)return;
 shareOptions.text=form.elements.message.value;
 shareOptions.photo=Boolean(form.elements.includePhoto?.checked);
 shareOptions.note=Boolean(form.elements.includeNote?.checked);
 form.querySelector('[data-share-preview]').innerHTML=publicTicketPreview();
});
document.addEventListener?.('visibilitychange',scheduleCareer);
const restoredAccount = FP.restoreAccount();
render();
restoredAccount.then(available => {
  if (!available && !FP.account.restorePending&&!['profile','account',...demoAuthRoutes].includes(location.hash.slice(1))) {scheduleCareer();return;}
  if (FP.account.username) { draft = null; appliedMatch = null; formStage = 1; }
  render();
  if(location.hash==='#community')void FP.refreshCommunity?.(true);
  if(location.hash==='#ranking')void loadRankings();
});
