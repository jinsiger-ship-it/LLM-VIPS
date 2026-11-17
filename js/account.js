/* 로그인 세션은 서버 쿠키로 복원하고 계정 기록은 응답으로만 교체합니다. */
const accountServerEnabled = typeof document!=='undefined' && document.currentScript?.hasAttribute('data-account-server');
FP.account = { available: false, checking: false, busy: false, username: null, revision: 0 };
FP.accountSaveStatus = '저장된 기록을 불러왔어요.';
FP.guestFingerprint = data => {
  const text=JSON.stringify(data);
  let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return `${text.length}:${hash>>>0}`;
};
FP.guestImportCandidate = () => {
  if(!FP.account.username)return null;
  const guest=FP.load(localStorage);
  if(!guest.tickets.length&&!guest.posts.length&&!guest.career&&!guest.careerDraft&&!guest.careerHistory.length&&!guest.savedCareers.length&&!guest.inventory.itemIds.length) return null;
  try{if(localStorage.getItem('fanplay-imported-'+FP.account.username)===FP.guestFingerprint(guest)) return null;}catch{}
  return guest;
};
FP.dismissGuestImport = () => {
  try{localStorage.setItem('fanplay-imported-'+FP.account.username,FP.guestFingerprint(FP.load(localStorage)));}catch{}
};
FP.reopenGuestImport = () => {
  try{localStorage.removeItem('fanplay-imported-'+FP.account.username);}catch{}
};
FP.mergeGuestRecords = (account,guest,prefer) => {
  if(!['account','device'].includes(prefer))throw new Error('기록 우선순위를 선택해 주세요.');
  const first=prefer==='device'?guest:account,second=prefer==='device'?account:guest;
  const union=(a,b)=>[...new Map([...b,...a].map(x=>[x.id,x])).values()];
  const next=FP.copy(first);
  next.tickets=union(first.tickets,second.tickets);
  next.posts=union(first.posts,second.posts);
  next.inventory.itemIds=[...new Set([...first.inventory.itemIds,...second.inventory.itemIds])];
  next.inventory.titleIds=[...new Set([...first.inventory.titleIds,...second.inventory.titleIds])];
  next.career=first.career||second.career;
  next.careerDraft=next.career?null:first.careerDraft||second.careerDraft;
  next.careerHistory=union(first.careerHistory,second.careerHistory);
  next.savedCareers=union(first.savedCareers,second.savedCareers);
  // 다른 선수가 진행 중이면 버리지 않고 이어하기 목록에 보관합니다.
  const extra=second.career;
  if(extra&&extra.id!==next.career?.id&&!FP.careerComplete(extra)&&!next.savedCareers.some(x=>x.career.id===extra.id))next.savedCareers.push({id:extra.id||'imported-legacy',career:extra});
  for(const c of [first.career,second.career])if(FP.careerComplete(c)&&c.id!==next.career?.id&&!next.careerHistory.some(x=>x.id===c.id))next.careerHistory.push(c);
  return FP.normalize(next);
};
FP.importGuestRecords = async prefer => {
  const guest=FP.guestImportCandidate();
  if(!guest||FP.account.busy)return false;
  const next=FP.mergeGuestRecords(FP.data,guest,prefer);
  // 덮어쓰기 선택 전 계정 기록을 해당 브라우저에 별도로 보존합니다.
  try{localStorage.setItem('fanplay-before-import-'+FP.account.username,JSON.stringify(FP.data));}
  catch{FP.toast('계정 기록의 안전 사본을 저장하지 못해 가져오기를 멈췄어요.');return false;}
  if(!await FP.saveAccountState(next))return false;
  FP.dismissGuestImport();
  return true;
};
FP.guestImportPanel = () => {
  const guest=FP.guestImportCandidate();
  if(!guest)return '';
  const conflicts=guest.tickets.filter(t=>FP.data.tickets.some(a=>a.id===t.id&&JSON.stringify(a)!==JSON.stringify(t))).length;
  const careerConflict=Boolean(guest.career&&FP.data.career&&JSON.stringify(guest.career)!==JSON.stringify(FP.data.career));
  return `<section class="guest-import"><h3>이 기기의 기록을 가져올까요?</h3><p>티켓 ${guest.tickets.length}장 · 장식 ${guest.inventory.itemIds.length}개 · ${guest.career?'진행한 선수 있음':'진행 중인 선수 없음'}</p>
    <p class="muted">다른 티켓과 장식은 합쳐요. 같은 티켓 ${conflicts}건${careerConflict?'과 현재 선수 기록이 겹쳐요. 현재 선수는 한 명만 이어갈 수 있어요.':'이 겹쳐요.'} 프로필과 겹치는 기록은 아래에서 고른 쪽을 사용해요. 기기 원본은 유지해요.</p>
    <div class="actions"><button class="btn secondary" data-action="guest-import" data-value="account">계정 기록 우선으로 합치기</button><button class="btn secondary" data-action="guest-import" data-value="device">기기 기록 우선으로 합치기</button><button class="btn quiet" data-action="guest-dismiss">지금은 가져오지 않기</button></div></section>`;
};

FP.accountRequest = async function (route, method = 'GET', body) {
  const response = await fetch('/api/' + route, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Fanplay-Request': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('FANPLAY 계정 서버에 연결해 주세요.');
  }
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || '요청을 처리하지 못했습니다.'), { status: response.status });
  return result;
};

FP.useAccount = function (result) {
  FP.account.username = result.username;
  FP.account.revision = result.revision ?? 0;
  FP.data = result.username ? FP.normalize(result.state) : FP.load(localStorage);
};

FP.restoreAccount = async function () {
  if (!accountServerEnabled || !['http:', 'https:'].includes(location.protocol)) return false;
  FP.account.checking = true;
  try {
    const result = await FP.accountRequest('session');
    if (typeof result.username !== 'string' && result.username !== null) return false;
    FP.account.available = true;
    if (result.username) FP.useAccount(result);
    return true;
  } catch {
    return false;
  } finally {
    FP.account.checking = false;
  }
};

FP.saveAccountState = async function (next) {
  if (FP.account.busy) return false;
  FP.account.busy = true;
  FP.accountSaveStatus = '계정에 저장 중…';
  try {
    const saved = await FP.accountRequest('state', 'PUT', {
      username: FP.account.username, revision: FP.account.revision, state: next
    });
    FP.useAccount(saved);
    FP.accountSaveStatus = '계정에 저장 완료 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
    return true;
  } catch (error) {
    FP.accountSaveStatus = '저장하지 못했어요. 마지막으로 저장한 기록을 유지해요.';
    FP.toast(error.status ? error.message : '서버에 저장하지 못했습니다. 연결을 확인하고 새로고침해 주세요.');
    return false;
  } finally {
    FP.account.busy = false;
    const status=typeof document==='undefined'?null:document.querySelector('[data-save-status]');
    if(status)status.textContent=FP.accountSaveStatus;
  }
};

FP.accountPanel = function () {
  const { available, checking, username } = FP.account;
  const credentials = (mode) => {
    const joining = mode === 'register';
    return `<form data-account-action="${mode}">
      <label>아이디 <input name="username" autocomplete="username" maxlength="24" required></label>
      <label>비밀번호 <input name="password" type="password" autocomplete="${joining ? 'new-password' : 'current-password'}" ${joining ? 'minlength="8" maxlength="16"' : 'maxlength="128"'} required></label>
      ${joining ? '<label><input type="checkbox" name="acceptedTerms" required> 아래 개인정보 처리방침과 이용약관을 확인하고 가입에 동의합니다.</label>' : ''}
      <button type="submit" class="btn">${joining ? '회원가입' : '로그인'}</button>
    </form>`;
  };
  let controls;
  if (checking) controls = '<p role="status">로그인 상태를 확인하고 있어요.</p>';
  else if (!available) controls = '<p class="muted">계정에 로그인하려면 FANPLAY 서버 주소로 접속해 주세요. 이 화면에서는 이 브라우저에 기록을 저장할 수 있어요.</p>';
  else if (!username) controls = `<p>가입 없이도 플레이할 수 있어요. 로그인하면 티켓·장식·선수 기록을 계정에 저장해요.</p><p class="muted">현재는 로컬 서버에서 로그인과 저장을 이용할 수 있어요.</p>
    ${credentials('login')}<details><summary>새 계정 만들기</summary><p class="muted">영문·숫자·밑줄로 아이디를 만들고 비밀번호는 8~16자로 입력하세요.</p>${credentials('register')}</details>`;
  else controls = `<p><strong>${FP.esc(username)}</strong> 계정으로 로그인 중</p>
    <p class="muted" data-save-status role="status">${FP.esc(FP.accountSaveStatus)}</p>${FP.guestImportPanel()}
    <button type="button" class="text-link" data-action="guest-review">기기 기록 가져오기 다시 확인</button>
    <button type="button" class="text-link" data-action="import-backup">가져오기 전 계정 사본 내려받기</button>
    <form data-account-action="logout"><button type="submit" class="btn secondary">로그아웃</button></form>
    <details><summary>계정 삭제</summary><p class="muted">계정과 서버에 저장한 티켓 및 게임 기록을 삭제합니다.</p>
    <form data-account-action="delete">
      <label>비밀번호 확인 <input name="password" type="password" autocomplete="current-password" maxlength="128" required></label>
      <button type="submit" class="btn quiet">계정과 기록 삭제</button>
    </form></details>`;
  return `<section class="panel account-panel" aria-labelledby="account-title">
    <h2 id="account-title">계정</h2>${controls}
    <details><summary>개인정보 처리방침</summary>
      <p>2026년 11월 10일 · FANPLAY 과제용 서비스 안내</p>
      <p>계정 운영을 위해 아이디, 비밀번호 검증값, 가입·약관 동의 정보와 로그인 세션을 저장합니다. 저장 기능을 쓰면 닉네임, 응원팀, 티켓 및 첨부 사진, 게임 진행과 보상, 커뮤니티 시연 기록을 해당 계정에 저장합니다. 로그인 시도 제한을 위해 접속 IP를 서버 메모리에서 사용합니다.</p>
      <p>로그인 상태는 브라우저 쿠키로 최대 7일 유지됩니다. 로그아웃하면 해당 기기의 세션이 만료됩니다. 계정 기록은 계정 유지 중 보관하며, 마이페이지의 계정 삭제에서 서버 기록과 모든 로그인 세션을 삭제할 수 있습니다. 비회원 기록과 불러온 경기 파일은 해당 브라우저의 사이트 데이터에서 삭제할 수 있습니다.</p>
      <p>앱은 계정 기록을 다른 이용자에게 공개하지 않습니다. 화면 글꼴을 불러올 때 브라우저가 Google Fonts에 연결할 수 있습니다. 계정 및 개인정보 관련 문의는 이 사이트를 제공한 FANPLAY 프로젝트 운영자에게 해 주세요.</p>
    </details>
    <details><summary>이용약관</summary>
      <p>2026년 11월 10일 · FANPLAY 과제용 서비스</p>
      <p>FANPLAY는 개인 야구 관람 기록과 게임을 위한 서비스입니다. 앱에서 만든 티켓은 개인 기념용으로 실제 입장에 사용할 수 없습니다. 본인에게 사용 권한이 있는 사진과 내용만 올려 주세요.</p>
      <p>다른 사람의 계정을 사용하거나 서비스 이용을 방해할 수 없습니다. 계정은 마이페이지에서 삭제할 수 있으며 서버에 저장된 기록도 함께 삭제됩니다. 계정 복구는 지원하지 않으므로 비밀번호를 안전하게 관리해 주세요.</p>
    </details>
  </section>`;
};
