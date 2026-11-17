/* 화면 전환, 폼, 공통 이벤트. 외부 라이브러리 없이 file://와 정적 서버 모두 지원합니다. */
const app=document.querySelector('#app'), E=FP.esc;
FP.toast = (message,decorate=false) => {const el=document.querySelector('#toast');el.textContent=message;if(decorate){const link=document.createElement('a');link.href='#create';link.textContent='바로 꾸미기 →';link.addEventListener('click',e=>{e.preventDefault();FP.openDecorationEditor();});el.appendChild(link);}el.classList.add('show');clearTimeout(FP.toastTimer);FP.toastTimer=setTimeout(()=>el.classList.remove('show'),4500);};
FP.data=FP.load(localStorage);
let draft=null,filter='전체',formStage=1,photoBusy=false;
let careerTimer, careerPaused=false, careerSaving=false;
let careerBroadcast;
let decorationTab='frame', showAllDecorations=false;
FP.openDecorationEditor = () => {
 const ticket=FP.data.tickets.find(t=>t.id===FP.data.profile.featuredTicketId)||FP.data.tickets[0];
 draft=ticket?FP.copy(ticket):null;formStage=ticket?2:1;
 if(location.hash==='#create')render();else location.hash='create';
};
let matchResults = FP.loadMatchResults(localStorage);
let appliedMatch = null;

function resultPicker() {
  const stadiums = [...new Set(matchResults.filter(match => match.date === draft.date).map(match => match.stadium))]
    .sort((first, second) => first.localeCompare(second, 'ko'));
  const matches = FP.matchesAt(matchResults, draft.date, draft.stadium.trim());
  const selectedMatch = appliedMatch?.draft === draft ? appliedMatch.match.id : '';
  const status = !matchResults.length ? '경기 결과 파일을 불러오면 2026년 경기 자동 입력을 사용할 수 있어요.'
    : !draft.date.startsWith('2026-') ? '자동 입력은 2026년 경기만 지원해요.'
    : !stadiums.length ? '이 날짜에 등록된 종료 경기가 없어요. 직접 입력할 수 있어요.'
    : '구장을 고르면 팀과 최종 점수가 채워져요.';
  return `<p class="muted" role="status">${status}</p>
    ${stadiums.length ? `<label>2026년 경기 구장 선택
      <select data-result-venue><option value="">구장 선택</option>
      ${stadiums.map(stadium => `<option value="${E(stadium)}" ${stadium === draft.stadium ? 'selected' : ''}>${E(stadium)}</option>`).join('')}
      </select></label>` : ''}
    ${matches.length > 1 ? `<label>경기 선택
      <select data-result-match><option value="">경기 시간 선택</option>
      ${matches.map((match, index) => `<option value="${E(match.id)}" ${match.id === selectedMatch ? 'selected' : ''}>${E(match.time || (index + 1) + '차전')} · ${E(match.away)} vs ${E(match.home)} · ${match.awayScore}:${match.homeScore}</option>`).join('')}
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
  document.querySelector('#ticket-preview').innerHTML = FP.ticket({ ...draft, hs: draft.hs || 0, as: draft.as || 0, home: draft.home || '홈 팀', away: draft.away || '원정 팀' });
}

app.addEventListener('change', async event => {
  const target = event.target;
  const form = target.closest('#ticket-form');
  if (!form?.querySelector('[data-result-picker]')) return;
  if (target.matches('[data-result-file]')) {
    const file = target.files[0];
    if (!file) return;
    target.disabled = true;
    try {
      if (file.size > 1024 * 1024) throw new Error('1MB 이하의 경기 결과 파일을 선택해 주세요.');
      const results = FP.parseMatchResults(await file.text());
      localStorage.setItem(FP.matchResultsKey, JSON.stringify(results));
      matchResults = results;
      if (form.isConnected) refreshMatchPicker(form);
      FP.toast(`종료 경기 ${results.length}건을 불러왔습니다.`);
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
const button=(text,action,value='',cls='')=>`<button class="btn ${cls}" data-action="${action}" data-value="${E(value)}">${text}</button>`;
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
    <p>직관도 중계 관람도. 잊고 싶지 않은 경기를<br>직접 꾸며 한 장의 추억으로 남겨요.</p>
    <div class="hero-ticket">
      <div class="hero-ticket-meta"><span>${featured ? (ticket.mode==='커리어'?'MY CAREER TICKET':'MY MEMORY TICKET') : 'GAME DAY TICKET · 예시'}</span><span>⚾ FANPLAY</span></div>
      <div class="hero-ticket-match"><span>${E(ticket.home)}</span><strong>${ticket.mode==='커리어' ? '✦' : featured ? ticket.hs + ' : ' + ticket.as : 'VS'}</strong><span>${E(ticket.away)}</span></div>
      <div class="hero-ticket-meta hero-ticket-stub"><span>${featured ? E(ticket.date) : 'BASEBALL MOMENT'}</span><span>MEMORY PASS</span></div>
    </div>
    <a class="btn" href="#create">+ 나만의 티켓 만들기</a>
  </section>
  <section class="home-section">
    <h2>이렇게 즐겨보세요</h2>
    <div class="home-flow">
      <a href="#create"><b>01</b><span>경기 기록</span><small>직관·중계 모두 가능</small></a>
      <a href="#create"><b>02</b><span>티켓 꾸미기</span><small>디자인·사진·문구</small></a>
      <a href="#collection"><b>03</b><span>수집하고 자랑</span><small>보관·커뮤니티</small></a>
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
function editor(){if(!draft){draft={...FP.copy(FP.sample),id:uid(),date:new Date().toLocaleDateString('sv-SE'),home:'',away:'',hs:0,as:0,note:'',tag:'',stickerIds:[]};formStage=1;}
return `${heading('MAKE A MEMORY','나의 티켓 만들기','경기 기록을 입력하고, 나만의 디자인으로 완성하세요.')}<div class="steps"><span class="${formStage===1?'active':''}">01 경기 기록</span><span class="${formStage===2?'active':''}">02 꾸미기</span><span class="${formStage===3?'active':''}">03 완성 미리보기</span></div><div class="editor-grid" data-stage="${formStage}"><form id="ticket-form" class="panel">${formStage===1?`<h2>어떤 경기였나요?</h2><div class="fields">${field('경기 날짜','date',draft.date,'date','required')}${field('야구장 / 시청 장소','stadium',draft.stadium,'text','maxlength="80" required')}</div><div data-result-picker>${resultPicker()}</div><details><summary>2026년 경기 결과 파일 불러오기</summary><label>경기 결과 파일 <input type="file" data-result-file accept=".json,application/json"></label></details><div class="fields">${field('홈 팀','home',draft.home,'text','maxlength="40" required')}${field('원정 팀','away',draft.away,'text','maxlength="40" required')}${field('홈 점수','hs',draft.hs,'number','min="0" max="99" required')}${field('원정 점수','as',draft.as,'number','min="0" max="99" required')}</div><label>관람 방식<select name="mode"><option ${draft.mode==='직관'?'selected':''}>직관</option><option ${draft.mode==='중계'?'selected':''}>중계</option></select></label>${field('태그','tag',draft.tag,'text','maxlength="30" placeholder="예: 첫 직관"')}<label>한 줄 감상<textarea name="note" maxlength="180" placeholder="이날의 기분을 남겨주세요">${E(draft.note)}</textarea></label><button class="btn" type="submit">꾸미기로 →</button>`:formStage===2?`<h2>나만의 한 장으로</h2><label>티켓 스타일<select name="theme">${[['classic','클래식'],['scoreboard','전광판'],['photo','포토']].map(([id,name])=>`<option value="${id}" ${draft.theme===id?'selected':''}>${name}</option>`).join('')}</select></label><label>컬러<select name="color">${[['forest','포레스트'],['rose','로즈'],['blue','블루'],['sand','샌드']].map(([id,name])=>`<option value="${id}" ${draft.color===id?'selected':''}>${name}</option>`).join('')}</select></label><label>경기 사진 (선택 · JPG/PNG/WebP · 최대 12MB)<input id="photo" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="muted" id="photo-status">긴 변 900px로 줄여 이 브라우저에 저장합니다.</p>${button('사진 제거','remove-photo','','secondary')}${decorationPicker()}<div class="actions">${draft.mode==='커리어'?'<a class="btn secondary" href="#collection">← 수집함</a>':button('← 경기 기록','stage','1','secondary')}<button class="btn" type="submit" ${photoBusy?'disabled':''}>완성 미리보기 →</button></div>`:`<h2>이 순간을 간직할까요?</h2><p>티켓과 획득 보상은 새로고침 후에도 남습니다.</p><p class="muted">사진이 없으면 기본 다이아몬드 그래픽이 표시됩니다. 실제 입장권으로 사용할 수 없습니다.</p><div class="actions">${button('← 꾸미기','stage','2','secondary')}<button class="btn" type="submit">수집함에 저장 ↗</button></div>`}</form><div class="preview"><div class="eyebrow">LIVE PREVIEW</div><div id="ticket-preview">${FP.ticket({...draft,hs:draft.hs||0,as:draft.as||0,home:draft.home||'홈 팀',away:draft.away||'원정 팀'})}</div></div></div>`;}
function decorationPicker() {
 const types=[['frame','프레임'],['background','배경'],['sticker','스티커'],['badge','배지']];
 const fields={frame:'frameId',background:'backgroundId',sticker:'stickerIds',badge:'badgeId'};
 const name=fields[decorationTab], multi=decorationTab==='sticker';
 const owned=FP.data.inventory.itemIds;
 const items=FP.items.filter(i=>i.type===decorationTab&&(showAllDecorations||owned.includes(i.id))).sort((a,b)=>Number(owned.includes(b.id))-Number(owned.includes(a.id)));
 return `<section class="decoration-picker"><div class="section-title"><h3>나의 장식</h3><span class="muted">업적 장식 · ${owned.length}/20</span></div>
  <div class="decoration-tabs" role="tablist" aria-label="장식 종류">${types.map(([id,label])=>`<button type="button" role="tab" aria-selected="${id===decorationTab}" data-action="decoration-tab" data-value="${id}">${label}</button>`).join('')}</div>
  <div class="decoration-toolbar"><span>${multi?'스티커는 최대 3개':'한 가지를 골라보세요'}</span><button type="button" class="text-link" data-action="decoration-all">${showAllDecorations?'보유만 보기':'전체 보기 · 획득 조건'}</button></div>
  <div class="decoration-grid">${multi?'':`<label class="decoration-option"><input type="radio" name="${name}" value="default" ${!draft[name]||draft[name]==='default'?'checked':''}><span class="decor-icon">○</span><span>기본</span></label>`}
  ${items.map(i=>{const have=owned.includes(i.id),checked=multi?draft.stickerIds.includes(i.id):draft[name]===i.id;
   return have?`<label class="decoration-option"><input type="${multi?'checkbox':'radio'}" name="${name}" value="${i.id}" ${checked?'checked':''}><span class="decor-icon decor-${i.id}">${i.icon}</span><span>${i.name}</span></label>`:
    `<button type="button" class="decoration-option locked" data-action="decoration-info" data-value="${i.id}" aria-label="${i.name}: 미획득, 획득 조건 보기"><span class="decor-icon decor-${i.id}">${i.icon}</span><span>${i.name}</span><small>미획득 · 조건 보기</small></button>`;
  }).join('')}</div>${multi&&!items.length?'<p class="muted">게임에서 나만의 세리머니를 정하면 첫 스티커를 얻을 수 있어요.</p>':''}
  <p class="decoration-info muted" role="status"></p><a class="text-link" href="#game">게임에서 장식 얻기 →</a></section>`;
}
function collection(){const ts=FP.data.tickets.filter(t=>filter==='전체'||t.mode===filter);return `${heading('MY COLLECTION','나의 티켓 수집함',`${FP.data.tickets.length}장의 티켓. 다시 꺼내 보고 싶은 장면들.`)}<div class="toolbar"><div class="tabs">${['전체','직관','중계','커리어'].map(f=>button(f,'filter',f,filter===f?'':'secondary')).join('')}</div><a class="btn" href="#create">+ 티켓 만들기</a></div>${ts.length?`<div class="collection-grid">${ts.map(t=>`<section>${t.id===FP.data.profile.featuredTicketId?'<div class="badge">★ 대표 티켓</div>':''}${FP.ticket(t)}<div class="card-actions">${button('상세 / 수정','edit',t.id,'secondary')}${button('대표 지정','feature',t.id,'secondary')}${button('게시','share',t.id,'secondary')}${button('삭제','delete',t.id,'quiet')}</div></section>`).join('')}</div>`:empty('아직 이곳에 담긴 순간이 없어요.')}`;}
function legacyGame(c){const labels=c.position==='투수'?['구위','제구','체력']:['타격','수비','체력'],last=c.log.at(-1),end=FP.ending(c.stats),title=FP.titles.find(t=>t.id===end);return `${heading('PLAYER CAREER',`${E(c.name)}의 야구 일기`,`${E(c.position)} · ${c.step===8?'8시즌 완주':`${c.step+1}번째 시즌`}`)}<div class="game-grid"><aside class="panel"><span class="eyebrow">PLAYER REPORT</span><h2>${E(c.name)}</h2>${c.stats.map((n,i)=>`<div class="stat"><label>${labels[i]} <b>${n}</b></label><progress max="100" value="${n}">${n}</progress></div>`).join('')}<p>종합 ${Math.round(c.stats.reduce((a,b)=>a+b)/3)}</p><div class="season-dots">${Array.from({length:8},(_,i)=>`<span class="${i<c.step?'done':''}">${i+1}</span>`).join('')}</div><p class="muted">결말 기준: 종합 65 미만 / 65~79 / 80 이상 (반올림 전 평균)</p>${button('새 선수로 시작','restart','','quiet')}</aside><section class="panel scene">${c.step===8?`<div class="eyebrow">CAREER COMPLETE</div><div class="ending-icon">${end==='legend'?'🏆':'✦'}</div><h2>${{steady:'꾸준함의 선수',star:'구단의 간판',legend:'명예의 전당'}[end]}</h2><p>여덟 시즌의 기록이 나만의 컬렉션이 되었습니다.</p><div class="reward-banner">획득 아이템: 첫 완주 별 + ${FP.items.find(i=>i.id===end).name}<br>칭호: ${title.name}<small>이미 보유한 보상은 중복 추가하지 않습니다.</small></div><a class="btn" href="#collection">보상을 티켓에 적용하기 ↗</a><a class="text-link" href="#profile">칭호 전시하기 →</a>`:`<div class="eyebrow">SEASON ${String(c.step+1).padStart(2,'0')} / 08</div><h2>${FP.scenes[c.step].title}</h2><p>${FP.scenes[c.step][c.position==='투수'?'pitcher':'batter']}</p>${c.step===5?`<p class="context">${c.stats[0]>=60?'쌓아온 기술이 승부처의 자신감이 됩니다.':'아직 다듬어야 할 기술이 있지만, 다음 선택은 열려 있습니다.'}</p>`:''}<div class="choices">${FP.scenes[c.step].choices.map((ch,i)=>`<button data-action="choose" data-value="${i}"><span>0${i+1}</span><div>${ch}<small>${labels.map((l,j)=>`${l} +${FP.effects[i][j]}`).join(' · ')}</small></div><b>↗</b></button>`).join('')}</div>`}${last?`<div class="result"><b>직전 선택 결과</b><p>${E(last.text)}</p><small>${labels.map((l,i)=>`${l} +${last.delta[i]}`).join(' · ')}</small></div>`:''}</section></div><details class="panel history"><summary>시즌 기록 ${c.log.length}개</summary>${c.log.map(l=>`<p><b>${l.season}시즌</b> ${E(l.text)} <small>(${l.delta.map(n=>'+'+n).join(' / ')})</small></p>`).join('')||'<p>첫 시즌을 시작해 보세요.</p>'}</details>`;}
function community(){return `${heading('FAN COMMUNITY','우리들의 야구 이야기','커뮤니티 시연: 게시글·좋아요·댓글은 나의 기록으로 저장됩니다.')}<div class="notice community-cta"><div><strong>내 티켓 자랑하기</strong><p>수집함에서 티켓을 골라 게시할 수 있어요.</p></div><a class="btn" href="#collection">수집함 열기</a></div>${FP.data.posts.length?`<div class="collection-grid">${FP.data.posts.map(p=>`<article class="post panel"><div class="section-title"><b>${E(p.nickname)}</b>${button('게시글 삭제','delete-post',p.id,'quiet')}</div><p>${E(p.text)}</p>${FP.ticket(p.ticket)}<div class="actions">${button(p.liked?'♥ 좋아요 1':'♡ 좋아요 0','like',p.id,'secondary')}<span class="muted">댓글 ${p.comments.length}</span></div><div class="comments">${p.comments.map(c=>`<p><b>${E(c.nickname)}</b> ${E(c.text)}</p>`).join('')}</div><form class="comment-form" data-post="${E(p.id)}"><input name="comment" required maxlength="200" aria-label="댓글" placeholder="이 순간에 한마디"><button class="btn" type="submit">등록</button></form></article>`).join('')}</div>`:empty('첫 번째 야구 이야기를 기다려요.','collection','수집함에서 게시하기')}`;}
function profile(){const d=FP.data,t=d.tickets.find(t=>t.id===d.profile.featuredTicketId);return `${heading('MY PAGE','마이페이지','티켓과 커리어, 나의 활동을 한눈에 확인하세요.')}
<section class="profile-card"><div class="profile-avatar" aria-hidden="true">⚾</div><strong>${E(d.profile.nickname)}</strong><small>${E(FP.teams.find(team => team[0] === d.profile.team)[1])}</small></section>
<div class="profile-metrics"><div><strong>${d.tickets.length}</strong><small>수집 티켓</small></div><div><strong>${d.posts.length}</strong><small>자랑 글</small></div><div><strong>${d.career?.step || 0}</strong><small>플레이 시즌</small></div></div>${FP.accountPanel()}<div class="profile-grid"><form id="profile-form" class="panel"><h2>나의 프로필</h2>${field('닉네임','nickname',d.profile.nickname,'text','maxlength="24" required')}<label>응원팀 테마<select name="team">${FP.teams.map(t=>`<option value="${t[0]}" ${d.profile.team===t[0]?'selected':''}>${t[1]}</option>`).join('')}</select></label><label>전시할 칭호<select name="title"><option value="">칭호 없음</option>${FP.titles.filter(t=>d.inventory.titleIds.includes(t.id)).map(t=>`<option value="${t.id}" ${d.profile.selectedTitleId===t.id?'selected':''}>${t.name}</option>`).join('')}</select></label><button class="btn" type="submit">프로필 저장</button><div class="activity"><b>${d.tickets.length}</b> 티켓 · <b>${d.posts.length}</b> 게시글 · <b>${d.inventory.itemIds.length}</b> 보상</div><h3>최근 활동</h3><p class="muted">${d.tickets[0]?`최근 저장 티켓: ${E(d.tickets[0].date)} · ${E(d.tickets[0].home)}`:'저장한 티켓 없음'}</p><p class="muted">커리어 ${d.career?`${E(d.career.name)} / ${d.career.step}시즌 진행`:'시작 전'}</p></form><section><div class="section-title"><h2>대표 티켓</h2>${d.profile.selectedTitleId?`<span class="badge">✦ ${FP.titles.find(t=>t.id===d.profile.selectedTitleId).name}</span>`:''}</div>${t?FP.ticket(t):empty('대표 티켓을 지정해 주세요.','collection','수집함 열기')}${t?button('대표 지정 해제','unfeature','','secondary'):''}</section></div><p class="compact-decor-link">장식 ${d.inventory.itemIds.length}개 · 티켓 꾸미기에서 확인할 수 있어요. <a class="text-link" href="#collection">티켓 고르기 →</a></p>`;}
function careerSummary(career) {
  if([6,7].includes(career.rules)) return storySummary(career);
  const ticketId = `career-${career.id}`;
  const saved = FP.data.tickets.some(ticket => ticket.id===ticketId);
  return `<h3>${FP.careerConclusion(career)}</h3>
    <p><b>통산 기록</b> ${FP.careerRecord(career)}</p>
    ${saved ? '<a class="text-link" href="#collection">수집함에서 보기 →</a>' : button('기념 티켓 저장','career-ticket',career.id,'secondary')}`;
}

function careerArchive() {
  const history = FP.data.careerHistory;
  const saved=FP.data.savedCareers||[];
  const shelf=saved.length?`<details class="panel career-shelf"><summary>잠시 쉬고 있는 선수 ${saved.length}명</summary>${saved.map(x=>`<article><p><b>${E(x.career.name)}</b> · ${x.career.position} · ${x.career.step}시즌</p>${button('이 선수 이어하기','career-resume',x.id,'secondary')}</article>`).join('')}</details>`:'';
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
        <div class="compact-draft"><div class="draft-caption"><span>후보별 시작 능력치 · 6개 항목</span><b>총합 240 · 평균 40</b></div>
        <div class="draft-options">${FP.careerAbilityCandidates(board.seed,position).map((candidate,index)=>`<label class="draft-card"><input type="radio" name="candidate-${position}" data-career-candidate value="${index}" required ${active?'':'disabled'}>
        <span class="draft-card-body"><span class="draft-card-heading"><b>후보 ${String.fromCharCode(65+index)}</b><span>${candidate.style}</span><i aria-hidden="true">✓</i></span>
        <span class="draft-values">${labels.map((label,stat)=>`<span><small>${label}</small><strong class="${candidate.stats[stat]===Math.max(...candidate.stats)?'standout':''}">${candidate.stats[stat]}</strong></span>`).join('')}</span></span></label>`).join('')}</div></div>
        </fieldset>`;
    }).join('')}
    <p class="muted">후보 하나를 선택하면 커리어를 시작할 수 있어요. 시작 성향은 고정 호칭이 아니에요. 플레이로 성장하고 은퇴할 때 호칭을 선택해요.</p>
    <button class="btn" type="submit" disabled>선택한 선수로 시작하기</button></form>`
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
  <h3>이번 커리어의 장식 ${rewards.length}개</h3><div class="reward-chips">${rewards.map(id=>{const i=FP.items.find(x=>x.id===id);return `<span title="${i.condition}">${i.icon} ${i.name}</span>`;}).join('')}</div><p class="muted">이미 보유한 장식은 중복으로 쌓이지 않아요.</p><button type="button" class="btn secondary" data-action="reward-decorate">내 티켓에 꾸미기</button></div>`;
}

function storyGame(c) {
 const version=`${c.id}:${c.moves.length}`,labels=FP.careerStatLabels(c.position);
 const status=c.retired?`${c.step}시즌 · 은퇴`:c.pending?.id==='retirement'?'7시즌 결산':`${c.step+1}시즌 · ${['시즌 준비','전반기','승부처','시즌 마무리'][c.segment]}`;
 return `${heading('PLAYER CAREER',E(c.name)+'의 야구 인생',E(c.club)+' · '+FP.careerRoles[c.role])}
 <div class="story-status"><span>${status}</span><span>${FP.account.username?'계정에 저장':'이 기기에 저장'}</span></div>
 <section class="panel story-scene">${c.retired?`<h2>은퇴 결산</h2>${storySummary(c)}<div class="actions">${button('다음 선수 만들기','career-draft')}</div>`:
 c.pending?`<div class="decision-scene"><img src="assets/broadcast/${c.position==='투수'?'pitch-ready':'bat-ready'}.webp" alt=""><span>선택을 기다리고 있어요</span></div><div class="eyebrow">${c.pending.category}</div><h2 tabindex="-1" data-decision-title>${c.pending.title}</h2><p>${c.pending.prompt}</p><div class="choices">${c.pending.choices.map((ch,i)=>`<button type="button" data-action="auto-choice" data-value="${version}:${i}"><span>0${i+1}</span><div>${ch.label}<small>${ch.hint}</small></div><b>↗</b></button>`).join('')}</div>`:
 `<div class="career-broadcast" aria-label="가상 경기 중계">${broadcastPlayer(playbackFor(c))}</div><p class="career-news" role="status">${E(c.news)}</p><div class="actions playback-controls">${button(careerPaused?'계속 진행':'일시정지','auto-pause','','secondary')}${button('다음 선택까지','auto-skip',version,'secondary')}</div>`}</section>
 ${c.rules===6?`<details class="panel ability-details"><summary>선수 능력치 · ${c.hand}</summary><div class="draft-values">${FP.careerAbilityLabels(c.position).map((label,i)=>`<span><small>${label}</small><strong>${c.abilities[i]}</strong></span>`).join('')}</div><p class="muted">컨디션은 별도로 관리해요. 시작 성향과 은퇴 호칭은 다를 수 있어요.</p></details>`:''}<section class="panel compact-player"><div class="section-title"><b>현재 성향</b><span>${FP.careerStyle(c)}</span></div><div class="compact-stats">${c.stats.map((n,i)=>`<div><small>${labels[i]}</small><b>${n}</b><progress aria-label="${labels[i]}" value="${n}" max="100"></progress></div>`).join('')}${c.position==='타자'?`<div><small>주루</small><b>${c.speed}</b><progress aria-label="주루" value="${c.speed}" max="100"></progress></div>`:''}</div></section>
 <details class="panel history"><summary>기록과 선택 모아 보기 · ${c.log.length}시즌</summary><p><b>${FP.careerRecord(c)}</b></p>${c.duels.some(x=>x.rival)?`<p>라이벌 상대 전적 · ${c.duels.filter(x=>x.rival&&x.success).length}승 ${c.duels.filter(x=>x.rival&&!x.success).length}패</p>`:''}
 ${c.log.map(e=>`<p><b>${e.season}시즌 · ${e.club} · ${FP.careerRoles[e.role]}</b><br>${FP.careerRecord(c,[e])}</p>`).join('')}
 ${c.story.map(e=>`<article class="story-entry"><small>${e.season}시즌 · ${e.title}</small><b>${e.choice}</b><p>${e.result}</p></article>`).join('')||'<p>첫 선택을 기다리고 있어요.</p>'}</details>${careerArchive()}`;
}

function game() {
  const career = FP.data.career;
  if (!career) return careerLobby();
  if ([6,7].includes(career.rules)) return storyGame(career);
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
    ![3,4,5,6,7].includes(c?.rules) || c.pending || c.retired) {
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

const screens={home,create:editor,collection,game,community,profile};
function render() {
  theme();
  const route = location.hash.slice(1) || 'home';
  const view = Object.hasOwn(screens, route) ? route : 'home';
  const activeTab = view === 'create' ? 'home' : view;
  const openSections = view==='game' ? ['.history','.career-archive'].filter(selector=>app.querySelector?.(selector)?.open) : [];
  const previousClip = app.querySelector?.('.broadcast-clip');
  if (previousClip) previousClip.pause();
  if (careerBroadcast) careerBroadcast.movingAt = null;
  app.innerHTML = screens[view]();
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
}
app.addEventListener('change',e=>{const form=e.target.closest('#career-form');if(form)syncCareerSetup(form);});
app.addEventListener('input',e=>{const form=e.target.closest('#ticket-form');if(form&&e.target.type!=='file'){syncDraft(form);document.querySelector('#ticket-preview').innerHTML=FP.ticket({...draft,hs:draft.hs||0,as:draft.as||0,home:draft.home||'홈 팀',away:draft.away||'원정 팀'});}});
app.addEventListener('change',async e=>{if(e.target.id!=='photo')return;const file=e.target.files[0];if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024){FP.toast('JPG/PNG/WebP 이미지, 최대 12MB까지 선택할 수 있습니다.');e.target.value='';return;}const targetDraft=draft;photoBusy=true;document.querySelector('#photo-status').textContent='사진을 처리하고 있습니다…';document.querySelector('#ticket-form button[type=submit]').disabled=true;try{const bitmap=await createImageBitmap(file);try{const ratio=Math.min(1,900/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);if(draft===targetDraft)draft.photo=canvas.toDataURL('image/jpeg',.68);}finally{bitmap.close();}FP.toast('사진을 추가했습니다.');}catch{FP.toast('이미지를 읽지 못했습니다. 다른 사진을 선택해 주세요.');}finally{photoBusy=false;if(draft===targetDraft&&location.hash==='#create')render();}});
async function submitAccount(form) {
  const action = form.dataset.accountAction;
  const credentials = Object.fromEntries(new FormData(form));
  if (action === 'delete' && !confirm('이 계정과 서버에 저장된 기록을 삭제할까요?')) return;
  FP.account.busy = true;
  const submit = form.querySelector('button[type="submit"]');
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
    draft = null;
    appliedMatch = null;
    formStage = 1;
    filter = '전체';
    render();
    FP.toast(action === 'delete' ? '계정과 기록을 삭제했습니다.'
      : result.username ? '로그인했습니다.' : '로그아웃했습니다.');
  } catch (error) {
    FP.toast(error.status ? error.message : '계정 서버에 연결하지 못했습니다.');
  } finally {
    FP.account.busy = false;
    submit.disabled = false;
  }
}

app.addEventListener('submit',async e=>{e.preventDefault();const form=e.target;
if(FP.account.checking || FP.account.busy) return;
if(form.dataset.accountAction){await submitAccount(form);return;}if(form.id==='ticket-form'){syncDraft(form);if(photoBusy)return;if(formStage<3){formStage++;render();}else if(await FP.saveTicket(draft)){draft=null;location.hash='collection';FP.toast('티켓을 수집함에 저장했습니다.');}}else if(form.id==='career-form'){if(await FP.signStoryPlayer(form.elements.board.value,form.elements.name.value,new FormData(form).get('position'),new FormData(form).get('hand-'+new FormData(form).get('position')),Number(new FormData(form).get('candidate-'+new FormData(form).get('position')))))render();}else if(form.id==='profile-form'){if(await FP.transact(d=>{d.profile.nickname=form.elements.nickname.value.trim()||'야구팬';d.profile.team=form.elements.team.value;d.profile.selectedTitleId=form.elements.title.value||null;})){render();FP.toast('프로필을 저장했습니다.');}}else if(form.classList.contains('comment-form')){const value=form.elements.comment.value.trim();if(value&&await FP.transact(d=>{d.posts.find(p=>p.id===form.dataset.post).comments.push({nickname:d.profile.nickname,text:value.slice(0,200)});}))render();}});
app.addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b||FP.account.checking||FP.account.busy)return;const {action:a,value:v}=b.dataset;
if(a==='stage'){syncDraft(document.querySelector('#ticket-form'));formStage=Number(v);render();}
if(a==='remove-photo'){draft.photo='';render();}
if(a==='filter'){filter=v;render();}
if(a==='edit'){draft=FP.copy(FP.data.tickets.find(t=>t.id===v));formStage=draft.mode==='커리어'?2:1;if(location.hash==='#create')render();else location.hash='create';}
if(a==='feature'&&await FP.transact(d=>{d.profile.featuredTicketId=v;})){render();FP.toast('대표 티켓을 지정했습니다.');}
if(a==='unfeature'&&await FP.transact(d=>{d.profile.featuredTicketId=null;}))render();
if(a==='delete'&&confirm('이 티켓을 삭제할까요? 게시된 사본은 유지됩니다.')&&await FP.deleteTicket(v))render();
if(a==='choose'&&await FP.choose(Number(v)))render();
if(a==='career-draft'&&await FP.openCareerDraft()){careerPaused=false;render();}
if(a==='career-fresh'&&await FP.newStoryWithBackup()){careerPaused=false;render();}
if(a==='career-resume'&&await FP.resumeSavedCareer(v)){careerPaused=true;render();FP.toast('선수 기록을 불러왔어요. 자동 진행은 일시정지 상태예요.');}
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
if(a==='guest-import'){if(await FP.importGuestRecords(v)){render();FP.toast('기기 기록을 계정에 가져왔어요.');}else render();}
if(a==='guest-dismiss'){FP.dismissGuestImport();render();}
if(a==='guest-review'){FP.reopenGuestImport();render();if(!FP.guestImportCandidate())FP.toast('가져올 기기 기록이 없어요.');}
if(a==='reward-decorate')FP.openDecorationEditor();
if(a==='import-backup'){
 let saved;try{saved=localStorage.getItem('fanplay-before-import-'+FP.account.username);}catch{}
 if(!saved)FP.toast('아직 기록 가져오기를 실행하지 않았어요.');
 else {const url=URL.createObjectURL(new Blob([saved],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='fanplay-before-import.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
if(a==='decoration-tab'){syncDraft(document.querySelector('#ticket-form'));decorationTab=v;render();}
if(a==='decoration-all'){syncDraft(document.querySelector('#ticket-form'));showAllDecorations=!showAllDecorations;render();}
if(a==='decoration-info'){document.querySelector('.decoration-info').textContent=FP.items.find(i=>i.id===v)?.condition||'';}
if(a==='career-ticket') {
 const career = [FP.data.career,...FP.data.careerHistory].find(candidate => candidate?.id===v);
 if(![6,7].includes(career?.rules) && FP.careerComplete(career) && !FP.data.tickets.some(ticket => ticket.id===`career-${v}`) &&
  await FP.saveTicket(FP.careerTicket(career,new Date().toLocaleDateString('sv-SE')))) {
   filter='커리어';
   location.hash='collection';
   FP.toast('기념 티켓을 수집함에 저장했습니다.');
 }
}
if(a==='restart'&&confirm('현재 커리어를 끝내고 새 선수를 만들까요? 획득 보상은 유지됩니다.')&&await FP.transact(d=>{d.career=null;}))render();
if(a==='share'){const text=prompt('티켓과 함께 남길 이야기 (최대 300자)');if(text!==null&&await FP.transact(d=>{d.posts.unshift({id:uid(),nickname:d.profile.nickname,text:text.slice(0,300),ticket:FP.copy(d.tickets.find(t=>t.id===v)),liked:false,comments:[]});})){location.hash='community';FP.toast('커뮤니티 시연 기록에 저장했습니다.');}}
if(a==='like'&&await FP.transact(d=>{const p=d.posts.find(p=>p.id===v);p.liked=!p.liked;}))render();
if(a==='delete-post'&&confirm('이 게시글과 댓글을 삭제할까요?')&&await FP.transact(d=>{d.posts=d.posts.filter(p=>p.id!==v);}))render();
});
window.addEventListener('hashchange',()=>{render();window.scrollTo(0,0);});
document.addEventListener?.('visibilitychange',scheduleCareer);
const restoredAccount = FP.restoreAccount();
render();
restoredAccount.then(available => {
  if (!available && location.hash !== '#profile') {scheduleCareer();return;}
  if (FP.account.username) { draft = null; appliedMatch = null; formStage = 1; }
  render();
});
if(FP.loadWarning)FP.toast('저장값을 읽지 못해 기본 화면으로 시작했습니다. 기존 저장값은 덮어쓰지 않았습니다.');else if(FP.migrated)FP.toast('기존 Diamond Memories 기록을 불러왔습니다. 다음 저장 시 FANPLAY 형식으로 저장합니다.');
