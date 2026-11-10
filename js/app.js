/* 화면 전환, 폼, 공통 이벤트. 외부 라이브러리 없이 file://와 정적 서버 모두 지원합니다. */
const app=document.querySelector('#app'), E=FP.esc;
FP.toast = message => {const el=document.querySelector('#toast');el.textContent=message;el.classList.add('show');clearTimeout(FP.toastTimer);FP.toastTimer=setTimeout(()=>el.classList.remove('show'),4500);};
FP.data=FP.load(localStorage);
let draft=null,filter='전체',formStage=1,photoBusy=false;
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
      <div class="hero-ticket-meta"><span>${featured ? 'MY MEMORY TICKET' : 'GAME DAY TICKET · 예시'}</span><span>⚾ FANPLAY</span></div>
      <div class="hero-ticket-match"><span>${E(ticket.home)}</span><strong>${featured ? ticket.hs + ' : ' + ticket.as : 'VS'}</strong><span>${E(ticket.away)}</span></div>
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
      <span><strong>벤치에서 레전드까지</strong><small>내 이름으로 시작하는 여덟 시즌의 야구 인생</small><b>${career ? '커리어 이어가기' : '커리어 시작'} →</b></span>
    </a>
  </section>`;
}
function field(label,name,value,type='text',extra=''){return `<label>${label}<input name="${name}" type="${type}" value="${E(value)}" ${extra}></label>`;}
function editor(){if(!draft){draft={...FP.copy(FP.sample),id:uid(),date:new Date().toLocaleDateString('sv-SE'),home:'',away:'',hs:0,as:0,note:'',tag:'',stickerIds:[]};formStage=1;}
return `${heading('MAKE A MEMORY','나의 티켓 만들기','경기 기록을 입력하고, 나만의 디자인으로 완성하세요.')}<div class="steps"><span class="${formStage===1?'active':''}">01 경기 기록</span><span class="${formStage===2?'active':''}">02 꾸미기</span><span class="${formStage===3?'active':''}">03 완성 미리보기</span></div><div class="editor-grid" data-stage="${formStage}"><form id="ticket-form" class="panel">${formStage===1?`<h2>어떤 경기였나요?</h2><div class="fields">${field('경기 날짜','date',draft.date,'date','required')}${field('야구장 / 시청 장소','stadium',draft.stadium,'text','maxlength="80" required')}</div><div data-result-picker>${resultPicker()}</div><details><summary>2026년 경기 결과 파일 불러오기</summary><label>경기 결과 파일 <input type="file" data-result-file accept=".json,application/json"></label></details><div class="fields">${field('홈 팀','home',draft.home,'text','maxlength="40" required')}${field('원정 팀','away',draft.away,'text','maxlength="40" required')}${field('홈 점수','hs',draft.hs,'number','min="0" max="99" required')}${field('원정 점수','as',draft.as,'number','min="0" max="99" required')}</div><label>관람 방식<select name="mode"><option ${draft.mode==='직관'?'selected':''}>직관</option><option ${draft.mode==='중계'?'selected':''}>중계</option></select></label>${field('태그','tag',draft.tag,'text','maxlength="30" placeholder="예: 첫 직관"')}<label>한 줄 감상<textarea name="note" maxlength="180" placeholder="이날의 기분을 남겨주세요">${E(draft.note)}</textarea></label><button class="btn" type="submit">꾸미기로 →</button>`:formStage===2?`<h2>나만의 한 장으로</h2><label>티켓 스타일<select name="theme">${[['classic','클래식'],['scoreboard','전광판'],['photo','포토']].map(([id,name])=>`<option value="${id}" ${draft.theme===id?'selected':''}>${name}</option>`).join('')}</select></label><label>컬러<select name="color">${[['forest','포레스트'],['rose','로즈'],['blue','블루'],['sand','샌드']].map(([id,name])=>`<option value="${id}" ${draft.color===id?'selected':''}>${name}</option>`).join('')}</select></label><label>경기 사진 (선택 · JPG/PNG/WebP · 최대 12MB)<input id="photo" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="muted" id="photo-status">긴 변 900px로 줄여 이 브라우저에 저장합니다.</p>${button('사진 제거','remove-photo','','secondary')}<h3>프레임</h3><label><input type="radio" name="frameId" value="default" ${draft.frameId==='default'?'checked':''}> 기본 프레임</label>${FP.items.filter(i=>i.type==='frame').map(i=>rewardControl(i,'radio','frameId',draft.frameId===i.id)).join('')}<h3>스티커</h3>${FP.items.filter(i=>i.type==='sticker').map(i=>rewardControl(i,'checkbox','stickerIds',draft.stickerIds.includes(i.id))).join('')}<div class="actions">${button('← 경기 기록','stage','1','secondary')}<button class="btn" type="submit" ${photoBusy?'disabled':''}>완성 미리보기 →</button></div>`:`<h2>이 순간을 간직할까요?</h2><p>티켓과 획득 보상은 새로고침 후에도 남습니다.</p><p class="muted">사진이 없으면 기본 다이아몬드 그래픽이 표시됩니다. 실제 입장권으로 사용할 수 없습니다.</p><div class="actions">${button('← 꾸미기','stage','2','secondary')}<button class="btn" type="submit">수집함에 저장 ↗</button></div>`}</form><div class="preview"><div class="eyebrow">LIVE PREVIEW</div><div id="ticket-preview">${FP.ticket({...draft,hs:draft.hs||0,as:draft.as||0,home:draft.home||'홈 팀',away:draft.away||'원정 팀'})}</div></div></div>`;}
function rewardControl(i,type,name,checked){const owned=FP.data.inventory.itemIds.includes(i.id);return `<label class="reward-option ${owned?'':'locked'}"><input type="${type}" name="${name}" value="${i.id}" ${checked?'checked':''} ${owned?'':'disabled'}><span>${i.icon||'▣'} ${i.name}<small>${owned?'획득 완료':`🔒 ${i.condition}`}</small></span></label>`;}
function collection(){const ts=FP.data.tickets.filter(t=>filter==='전체'||t.mode===filter);return `${heading('MY COLLECTION','나의 티켓 수집함',`${FP.data.tickets.length}장의 티켓. 다시 꺼내 보고 싶은 장면들.`)}<div class="toolbar"><div class="tabs">${['전체','직관','중계'].map(f=>button(f,'filter',f,filter===f?'':'secondary')).join('')}</div><a class="btn" href="#create">+ 티켓 만들기</a></div>${ts.length?`<div class="collection-grid">${ts.map(t=>`<section>${t.id===FP.data.profile.featuredTicketId?'<div class="badge">★ 대표 티켓</div>':''}${FP.ticket(t)}<div class="card-actions">${button('상세 / 수정','edit',t.id,'secondary')}${button('대표 지정','feature',t.id,'secondary')}${button('게시','share',t.id,'secondary')}${button('삭제','delete',t.id,'quiet')}</div></section>`).join('')}</div>`:empty('아직 이곳에 담긴 순간이 없어요.')}`;}
function game(){const c=FP.data.career;if(!c)return `${heading('BASEBALL CAREER SIMULATION','벤치에서 레전드까지','신인에서 베테랑까지. 여덟 번의 선택이 나의 커리어와 보상을 만듭니다.')}<div class="game-start"><div class="game-cover"><div class="eyebrow">YOUR ROAD TO THE LEGEND</div><h2>내 이름으로 시작하는<br>8시즌의 야구 인생</h2><p>훈련, 출전, 진로를 결정하고 선수의 커리어를 완성해 보세요.</p></div><form id="career-form" class="panel"><h2>새 선수 등록</h2>${field('선수 이름','name','','text','maxlength="24" required')}<label>포지션<select name="position"><option>투수</option><option>포수</option><option>내야수</option><option>외야수</option></select></label><p class="muted">창작 선택형 게임입니다. 실제 경기나 선수 성적을 예측하지 않습니다. 진행은 선택마다 저장됩니다.</p><button class="btn" type="submit">커리어 시작 →</button></form></div>`;
const labels=c.position==='투수'?['구위','제구','체력']:['타격','수비','체력'],last=c.log.at(-1),end=FP.ending(c.stats),title=FP.titles.find(t=>t.id===end);return `${heading('PLAYER CAREER',`${E(c.name)}의 야구 일기`,`${E(c.position)} · ${c.step===8?'8시즌 완주':`${c.step+1}번째 시즌`}`)}<div class="game-grid"><aside class="panel"><span class="eyebrow">PLAYER REPORT</span><h2>${E(c.name)}</h2>${c.stats.map((n,i)=>`<div class="stat"><label>${labels[i]} <b>${n}</b></label><progress max="100" value="${n}">${n}</progress></div>`).join('')}<p>종합 ${Math.round(c.stats.reduce((a,b)=>a+b)/3)}</p><div class="season-dots">${Array.from({length:8},(_,i)=>`<span class="${i<c.step?'done':''}">${i+1}</span>`).join('')}</div><p class="muted">결말 기준: 종합 65 미만 / 65~79 / 80 이상 (반올림 전 평균)</p>${button('새 선수로 시작','restart','','quiet')}</aside><section class="panel scene">${c.step===8?`<div class="eyebrow">CAREER COMPLETE</div><div class="ending-icon">${end==='legend'?'🏆':'✦'}</div><h2>${{steady:'꾸준함의 선수',star:'구단의 간판',legend:'명예의 전당'}[end]}</h2><p>여덟 시즌의 기록이 나만의 컬렉션이 되었습니다.</p><div class="reward-banner">획득 아이템: 첫 완주 별 + ${FP.items.find(i=>i.id===end).name}<br>칭호: ${title.name}<small>이미 보유한 보상은 중복 추가하지 않습니다.</small></div><a class="btn" href="#collection">보상을 티켓에 적용하기 ↗</a><a class="text-link" href="#profile">칭호 전시하기 →</a>`:`<div class="eyebrow">SEASON ${String(c.step+1).padStart(2,'0')} / 08</div><h2>${FP.scenes[c.step].title}</h2><p>${FP.scenes[c.step][c.position==='투수'?'pitcher':'batter']}</p>${c.step===5?`<p class="context">${c.stats[0]>=60?'쌓아온 기술이 승부처의 자신감이 됩니다.':'아직 다듬어야 할 기술이 있지만, 다음 선택은 열려 있습니다.'}</p>`:''}<div class="choices">${FP.scenes[c.step].choices.map((ch,i)=>`<button data-action="choose" data-value="${i}"><span>0${i+1}</span><div>${ch}<small>${labels.map((l,j)=>`${l} +${FP.effects[i][j]}`).join(' · ')}</small></div><b>↗</b></button>`).join('')}</div>`}${last?`<div class="result"><b>직전 선택 결과</b><p>${E(last.text)}</p><small>${labels.map((l,i)=>`${l} +${last.delta[i]}`).join(' · ')}</small></div>`:''}</section></div><details class="panel history"><summary>시즌 기록 ${c.log.length}개</summary>${c.log.map(l=>`<p><b>${l.season}시즌</b> ${E(l.text)} <small>(${l.delta.map(n=>'+'+n).join(' / ')})</small></p>`).join('')||'<p>첫 시즌을 시작해 보세요.</p>'}</details>`;}
function community(){return `${heading('FAN COMMUNITY','우리들의 야구 이야기','커뮤니티 시연: 게시글·좋아요·댓글은 나의 기록으로 저장됩니다.')}<div class="notice community-cta"><div><strong>내 티켓 자랑하기</strong><p>수집함에서 티켓을 골라 게시할 수 있어요.</p></div><a class="btn" href="#collection">수집함 열기</a></div>${FP.data.posts.length?`<div class="collection-grid">${FP.data.posts.map(p=>`<article class="post panel"><div class="section-title"><b>${E(p.nickname)}</b>${button('게시글 삭제','delete-post',p.id,'quiet')}</div><p>${E(p.text)}</p>${FP.ticket(p.ticket)}<div class="actions">${button(p.liked?'♥ 좋아요 1':'♡ 좋아요 0','like',p.id,'secondary')}<span class="muted">댓글 ${p.comments.length}</span></div><div class="comments">${p.comments.map(c=>`<p><b>${E(c.nickname)}</b> ${E(c.text)}</p>`).join('')}</div><form class="comment-form" data-post="${E(p.id)}"><input name="comment" required maxlength="200" aria-label="댓글" placeholder="이 순간에 한마디"><button class="btn" type="submit">등록</button></form></article>`).join('')}</div>`:empty('첫 번째 야구 이야기를 기다려요.','collection','수집함에서 게시하기')}`;}
function profile(){const d=FP.data,t=d.tickets.find(t=>t.id===d.profile.featuredTicketId);return `${heading('MY PAGE','마이페이지','티켓과 커리어, 나의 활동을 한눈에 확인하세요.')}
<section class="profile-card"><div class="profile-avatar" aria-hidden="true">⚾</div><strong>${E(d.profile.nickname)}</strong><small>${E(FP.teams.find(team => team[0] === d.profile.team)[1])}</small></section>
<div class="profile-metrics"><div><strong>${d.tickets.length}</strong><small>수집 티켓</small></div><div><strong>${d.posts.length}</strong><small>자랑 글</small></div><div><strong>${d.career?.step || 0}</strong><small>플레이 시즌</small></div></div>${FP.accountPanel()}<div class="profile-grid"><form id="profile-form" class="panel"><h2>나의 프로필</h2>${field('닉네임','nickname',d.profile.nickname,'text','maxlength="24" required')}<label>응원팀 테마<select name="team">${FP.teams.map(t=>`<option value="${t[0]}" ${d.profile.team===t[0]?'selected':''}>${t[1]}</option>`).join('')}</select></label><label>전시할 칭호<select name="title"><option value="">칭호 없음</option>${FP.titles.filter(t=>d.inventory.titleIds.includes(t.id)).map(t=>`<option value="${t.id}" ${d.profile.selectedTitleId===t.id?'selected':''}>${t.name}</option>`).join('')}</select></label><button class="btn" type="submit">프로필 저장</button><div class="activity"><b>${d.tickets.length}</b> 티켓 · <b>${d.posts.length}</b> 게시글 · <b>${d.inventory.itemIds.length}</b> 보상</div><h3>최근 활동</h3><p class="muted">${d.tickets[0]?`최근 저장 티켓: ${E(d.tickets[0].date)} · ${E(d.tickets[0].home)}`:'저장한 티켓 없음'}</p><p class="muted">커리어 ${d.career?`${E(d.career.name)} / ${d.career.step}시즌 진행`:'시작 전'}</p></form><section><div class="section-title"><h2>대표 티켓</h2>${d.profile.selectedTitleId?`<span class="badge">✦ ${FP.titles.find(t=>t.id===d.profile.selectedTitleId).name}</span>`:''}</div>${t?FP.ticket(t):empty('대표 티켓을 지정해 주세요.','collection','수집함 열기')}${t?button('대표 지정 해제','unfeature','','secondary'):''}</section></div><section class="section"><h2>보상 인벤토리</h2><div class="inventory-grid">${FP.items.map(i=>`<article class="panel ${d.inventory.itemIds.includes(i.id)?'owned':'locked'}"><span class="item-icon">${i.icon||'▣'}</span><h3>${i.name}</h3><p>${i.condition}</p><span class="badge">${d.inventory.itemIds.includes(i.id)?'획득 완료':'🔒 미획득'}</span></article>`).join('')}</div><h3>획득 칭호</h3><p>${d.inventory.titleIds.length?FP.titles.filter(t=>d.inventory.titleIds.includes(t.id)).map(t=>`<span class="badge">${t.name}</span>`).join(' '):'아직 획득한 칭호가 없습니다.'}</p></section>`;}
const screens={home,create:editor,collection,game,community,profile};
function render() {
  theme();
  const route = location.hash.slice(1) || 'home';
  const view = Object.hasOwn(screens, route) ? route : 'home';
  const activeTab = view === 'create' ? 'home' : view;
  app.innerHTML = screens[view]();
  document.querySelectorAll('.bottomnav a').forEach(link => {
    const selected = link.hash === '#' + activeTab;
    link.classList.toggle('active', selected);
    if (selected) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}
function syncDraft(form){for(const name of ['date','stadium','home','away','hs','as','mode','tag','note','theme','color'])if(form.elements[name])draft[name]=['hs','as'].includes(name)?(form.elements[name].value === '' ? '' : Number(form.elements[name].value)):form.elements[name].value;if(form.elements.frameId)draft.frameId=new FormData(form).get('frameId')||'default';if(formStage===2)draft.stickerIds=new FormData(form).getAll('stickerIds');}
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
if(form.dataset.accountAction){await submitAccount(form);return;}if(form.id==='ticket-form'){syncDraft(form);if(photoBusy)return;if(formStage<3){formStage++;render();}else if(await FP.saveTicket(draft)){draft=null;location.hash='collection';FP.toast('티켓을 수집함에 저장했습니다.');}}else if(form.id==='career-form'){if(await FP.startCareer(form.elements.name.value,form.elements.position.value))render();}else if(form.id==='profile-form'){if(await FP.transact(d=>{d.profile.nickname=form.elements.nickname.value.trim()||'야구팬';d.profile.team=form.elements.team.value;d.profile.selectedTitleId=form.elements.title.value||null;})){render();FP.toast('프로필을 저장했습니다.');}}else if(form.classList.contains('comment-form')){const value=form.elements.comment.value.trim();if(value&&await FP.transact(d=>{d.posts.find(p=>p.id===form.dataset.post).comments.push({nickname:d.profile.nickname,text:value.slice(0,200)});}))render();}});
app.addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b||FP.account.checking||FP.account.busy)return;const {action:a,value:v}=b.dataset;
if(a==='stage'){syncDraft(document.querySelector('#ticket-form'));formStage=Number(v);render();}
if(a==='remove-photo'){draft.photo='';render();}
if(a==='filter'){filter=v;render();}
if(a==='edit'){draft=FP.copy(FP.data.tickets.find(t=>t.id===v));formStage=1;if(location.hash==='#create')render();else location.hash='create';}
if(a==='feature'&&await FP.transact(d=>{d.profile.featuredTicketId=v;})){render();FP.toast('대표 티켓을 지정했습니다.');}
if(a==='unfeature'&&await FP.transact(d=>{d.profile.featuredTicketId=null;}))render();
if(a==='delete'&&confirm('이 티켓을 삭제할까요? 게시된 사본은 유지됩니다.')&&await FP.deleteTicket(v))render();
if(a==='choose'&&await FP.choose(Number(v)))render();
if(a==='restart'&&confirm('현재 커리어를 끝내고 새 선수를 만들까요? 획득 보상은 유지됩니다.')&&await FP.transact(d=>{d.career=null;}))render();
if(a==='share'){const text=prompt('티켓과 함께 남길 이야기 (최대 300자)');if(text!==null&&await FP.transact(d=>{d.posts.unshift({id:uid(),nickname:d.profile.nickname,text:text.slice(0,300),ticket:FP.copy(d.tickets.find(t=>t.id===v)),liked:false,comments:[]});})){location.hash='community';FP.toast('커뮤니티 시연 기록에 저장했습니다.');}}
if(a==='like'&&await FP.transact(d=>{const p=d.posts.find(p=>p.id===v);p.liked=!p.liked;}))render();
if(a==='delete-post'&&confirm('이 게시글과 댓글을 삭제할까요?')&&await FP.transact(d=>{d.posts=d.posts.filter(p=>p.id!==v);}))render();
});
window.addEventListener('hashchange',()=>{render();window.scrollTo(0,0);});
const restoredAccount = FP.restoreAccount();
render();
restoredAccount.then(available => {
  if (!available && location.hash !== '#profile') return;
  if (FP.account.username) { draft = null; appliedMatch = null; formStage = 1; }
  render();
});
if(FP.loadWarning)FP.toast('저장값을 읽지 못해 기본 화면으로 시작했습니다. 기존 저장값은 덮어쓰지 않았습니다.');else if(FP.migrated)FP.toast('이 브라우저의 이전 야구 기록을 불러왔습니다.');
