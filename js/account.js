/* 로그인 세션은 서버 쿠키로 복원하고 계정 기록은 응답으로만 교체합니다. */
FP.account = { available: false, checking: false, busy: false, username: null, revision: 0 };
const accountServerEnabled = document.currentScript?.hasAttribute('data-account-server');

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
  if (!accountServerEnabled) return false;
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
  try {
    const saved = await FP.accountRequest('state', 'PUT', {
      username: FP.account.username, revision: FP.account.revision, state: next
    });
    FP.useAccount(saved);
    return true;
  } catch (error) {
    FP.toast(error.status ? error.message : '서버에 저장하지 못했습니다. 연결을 확인하고 새로고침해 주세요.');
    return false;
  } finally {
    FP.account.busy = false;
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
  else if (!available) controls = '<p class="muted">이 페이지에서는 브라우저에 기록을 저장할 수 있어요. 계정 기능은 FANPLAY 서버에서 사용할 수 있어요.</p>';
  else if (!username) controls = `<p>로그인하면 같은 계정으로 휴대전화와 PC에서 기록을 볼 수 있어요.</p>
    ${credentials('login')}<details><summary>새 계정 만들기</summary><p class="muted">영문·숫자·밑줄로 아이디를 만들고 비밀번호는 8~16자로 입력하세요.</p>${credentials('register')}</details>`;
  else controls = `<p><strong>${FP.esc(username)}</strong> 계정으로 로그인 중</p>
    <p class="muted">티켓·게임·프로필은 이 계정에 저장돼요.</p>
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
