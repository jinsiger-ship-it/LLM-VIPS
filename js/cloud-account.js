/* 공개 과제용 공유 아이디. 로컬 계정 서버를 이용할 때는 기존 비밀번호 로그인을 유지합니다. */
(() => {
 if(typeof accountServerEnabled!=='undefined' && accountServerEnabled)return;
 const config=FP.cloudConfig;
 if(!config?.url||!config?.publishableKey)return;
 FP.cloudMode=true;
 FP.cloudError='';
 const activeKey='fanplay-demo-active-id-v1';
 const validId=id=>typeof id==='string'&&/^[a-z0-9_]{3,24}$/.test(id);
 FP.cloudRpc = async (name,body={}) => {
  let response;
  try {
   response=await fetch(config.url+'/rest/v1/rpc/'+name,{
    method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(15000),credentials:'omit'
   });
  }catch{throw new Error('온라인 저장소에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');}
  const result=await response.json().catch(()=>null);
  if(!response.ok){
   const setup=result?.code==='PGRST202'||result?.code==='42883';
   throw Object.assign(new Error(setup?'온라인 저장소 설정이 아직 완료되지 않았어요. 지금은 이 브라우저에 저장할 수 있어요.':result?.message||'온라인 기록을 처리하지 못했어요.'),{status:response.status});
  }
  return result;
 };
 const validateResult=result=>{
  if(!result||!validId(result.username)||!Number.isInteger(result.revision)||result.revision<0||!result.state||typeof result.state!=='object'||Array.isArray(result.state))throw new Error('온라인 기록의 형식이 올바르지 않아요. 기존 기록을 유지해요.');
  return result;
 };
 FP.accountRequest = async (route,method='GET',body={}) => {
  if(route==='logout'){
   try{localStorage.removeItem(activeKey);}catch{}
   return {username:null};
  }
  if(route==='login'){
   const id=String(body.username||'').trim().toLowerCase();
   if(!validId(id))throw Object.assign(new Error('아이디는 영문 소문자·숫자·밑줄 3~24자로 입력해 주세요.'),{status:400});
   const result=validateResult(await FP.cloudRpc('fanplay_demo_open',{p_player_id:id}));
   try{localStorage.setItem(activeKey,id);}catch{}
   return result;
  }
  if(route==='state'){
   const result=validateResult(await FP.cloudRpc('fanplay_demo_save',{p_player_id:body.username,p_revision:body.revision,p_state:body.state}));
   if(result.username!==body.username||result.revision!==body.revision+1)throw new Error('저장 응답을 확인하지 못했어요. 새로고침해 주세요.');
   return result;
  }
  throw new Error('지원하지 않는 요청이에요.');
 };
 FP.restoreAccount = async () => {
  if(!['http:','https:'].includes(location.protocol))return false;
  FP.account.checking=true;
  try{
   const status=await FP.cloudRpc('fanplay_demo_status');
   if(status?.ready!==true||status.version!==1)throw new Error('온라인 저장소 버전을 확인해 주세요.');
   FP.account.available=true;FP.cloudError='';
   let id;try{id=localStorage.getItem(activeKey);}catch{}
   if(validId(id))FP.useAccount(validateResult(await FP.cloudRpc('fanplay_demo_open',{p_player_id:id})));
   return true;
  }catch(error){FP.cloudError=error.message;return false;}
  finally{FP.account.checking=false;}
 };
 FP.accountPanel = () => {
  const {username,checking,available}=FP.account;
  const intro='<p class="muted">비밀번호 없는 과제용 공유 기록입니다. 같은 아이디를 아는 누구나 기록을 열고 수정할 수 있어요. 실제 개인정보·개인 사진은 넣지 마세요.</p>';
  let content;
  if(checking)content='<p role="status">온라인 기록을 확인하고 있어요.</p>';
  else if(username)content=`<p><strong>${FP.esc(username)}</strong> 기록을 사용 중이에요.</p><p class="muted" data-save-status role="status">${FP.esc(FP.accountSaveStatus)}</p>
   ${FP.guestImportPanel()}<div class="actions"><button class="btn secondary" data-action="cloud-download">현재 기록 내려받기</button><button class="btn secondary" data-action="cloud-refresh">온라인 기록 다시 불러오기</button></div>
   <button type="button" class="text-link" data-action="guest-review">이 기기 기록 가져오기 다시 확인</button><button type="button" class="text-link" data-action="import-backup">가져오기 전 사본 내려받기</button>
   <form data-account-action="logout"><button class="btn secondary" type="submit">아이디 사용 종료</button></form>`;
  else content=`${!available?`<p role="status" class="muted">${FP.esc(FP.cloudError||'온라인 저장소를 연결해 주세요.')}</p><button class="btn secondary" data-action="cloud-retry">연결 다시 확인</button>`:
   `<form data-account-action="login"><label>시연용 아이디<input name="username" autocomplete="off" autocapitalize="none" spellcheck="false" pattern="[a-zA-Z0-9_]{3,24}" minlength="3" maxlength="24" required placeholder="예: fanplay_demo01"></label><p class="muted">영문·숫자·밑줄 3~24자. 대문자는 소문자로 저장해요. 처음 쓰는 아이디면 새 기록을 만들어요.</p><button class="btn" type="submit">이 아이디로 시작·이어하기</button></form>`}
   <p class="muted">아이디를 사용하지 않으면 이 브라우저에 기록이 저장돼요.</p>`;
  return `<section class="panel account-panel"><h2>온라인 시연 기록</h2>${intro}${content}<details><summary>기록 저장 안내</summary><p>아이디와 티켓·게임·장식·프로필·커뮤니티 시연 기록을 프로젝트의 Supabase DB에 저장해요. 본인 인증이나 비밀번호 보호는 제공하지 않아요. 사용 종료는 이 기기에서 아이디 사용을 끝내며 온라인 기록은 지우지 않아요. 과제 운영자가 DB에서 기록을 삭제할 수 있어요.</p></details></section>`;
 };
 FP.downloadDemoState=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(FP.data,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='fanplay-'+(FP.account.username||'guest')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
})();
