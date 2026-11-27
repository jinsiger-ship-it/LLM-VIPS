/* 공개 과제용 공유 아이디. 로컬 계정 서버를 이용할 때는 기존 비밀번호 로그인을 유지합니다. */
(() => {
 if(typeof accountServerEnabled!=='undefined' && accountServerEnabled)return;
 const config=FP.cloudConfig;
 if(!config?.url||!config?.publishableKey)return;
 FP.cloudMode=true;
 FP.cloudError='';
 const activeKey='fanplay-demo-active-id-v1';
 const previousKey='fanplay-demo-last-id-v1';
 const resetMarker='fanplay-record-reset-applied';
 const resetId='fanplay-demo-20261127';
 const oldRecordKeys=new Set([
  activeKey,previousKey,FP.key,FP.key+'-recovery','fanplay-prototype-v1','diamond-v1','fanplay-archive-v1.1',
  'fanplay-match-results-2026',FP.matchResultsKey
 ]);
 const oldRecordPrefixes=[
  'fanplay-ticket-draft-v1:','fanplay-before-import-','fanplay-imported-',
  'fanplay-account-recovery-','fanplay-community-browser-v1:','fanplay-post-request:'
 ];
 function clearResetRecords(serverReset){
  if(serverReset!==resetId||localStorage.getItem(resetMarker)===serverReset)return false;
  for(const storage of [localStorage,sessionStorage]){
   for(let i=storage.length-1;i>=0;i--){
    const key=storage.key(i);
    if(key&&(oldRecordKeys.has(key)||oldRecordPrefixes.some(prefix=>key.startsWith(prefix))))storage.removeItem(key);
   }
  }
  localStorage.setItem(resetMarker,serverReset);
  return true;
 }
 window.addEventListener('storage',event=>{
  if(event.key===resetMarker&&event.newValue===resetId&&!FP.account.checking)location.reload();
 });
 FP.activeDemoId=()=>{try{return localStorage.getItem(activeKey)||'';}catch{return '';}};
 FP.lastDemoId=()=>{try{return FP.activeDemoId()||localStorage.getItem(previousKey)||'';}catch{return '';}};
 FP.communityIdentity=(create=false)=>{
  const id=FP.account.username;
  if(!id)return {};
  const storageKey='fanplay-community-browser-v1:'+id;
  let previous;
  try {previous=localStorage.getItem(storageKey);} catch(error){if(create)throw error;}
  if(/^[\da-f]{64}$/.test(previous||''))return {p_player_id:id,p_browser_key:previous};
  if(!create)return {};
  const secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');
  localStorage.setItem(storageKey,secret);
  return {p_player_id:id,p_browser_key:localStorage.getItem(storageKey)};
 };
 const validId=id=>typeof id==='string'&&/^[a-z0-9_]{3,24}$/.test(id);
 const normalizeId=value=>{
  const id=String(value||'').trim().toLowerCase();
  if(!validId(id))throw Object.assign(new Error('아이디는 영문·숫자·밑줄 3~24자로 입력해 주세요.'),{status:400});
  return id;
 };
 const rememberAccount=result=>{
  try{localStorage.setItem(activeKey,result.username);localStorage.setItem(previousKey,result.username);}catch{}
  return result;
 };
 FP.cloudRpc = async (name,body={}) => {
  let response;
  try {
   response=await fetch(config.url+'/rest/v1/rpc/'+name,{
    method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(15000),credentials:'omit'
   });
  }catch{throw new Error('온라인 저장소에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');}
  let result;
  try{result=await response.json();}
  catch{if(response.ok)throw new Error('온라인 저장소 응답을 읽지 못했어요. 다시 시도해 주세요.');}
  if(!response.ok){
   const setup=result?.code==='PGRST202'||result?.code==='42883';
   throw Object.assign(new Error(setup?'온라인 저장소 설정이 아직 완료되지 않았어요. 비회원으로 이번 방문만 플레이할 수 있어요.':result?.message||'온라인 기록을 처리하지 못했어요.'),{status:response.status,code:result?.code});
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
   const id=normalizeId(body.username);
   const result=await FP.cloudRpc('fanplay_demo_resume',{p_player_id:id});
   if(result===null)throw Object.assign(new Error('가입한 아이디를 찾지 못했어요. 새 아이디라면 회원가입을 선택해 주세요.'),{status:404});
   return rememberAccount(validateResult(result));
  }
  if(route==='register'){
   const id=normalizeId(body.username);
   const team=FP.teams.find(([key])=>key===body.team)?.[0];
   if(!team)throw Object.assign(new Error('응원팀을 선택해 주세요.'),{status:400});
   const result=validateResult(await FP.cloudRpc('fanplay_demo_join',{p_player_id:id,p_team:team}));
   return rememberAccount(result);
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
  const generation=FP.account.generation;
  if(validId(FP.activeDemoId()))FP.account.restorePending=true;
  FP.account.checking=true;
  try{
   const status=await FP.cloudRpc('fanplay_demo_status');
   if(status?.ready!==true||status.version!==1)throw new Error('온라인 저장소 버전을 확인해 주세요.');
   FP.account.available=true;FP.cloudError='';
   if(clearResetRecords(status.recordReset)){
    FP.useAccount({username:null});
    window.dispatchEvent(new Event('fanplay-records-reset'));
    FP.toast('이전에 남은 FANPLAY 기록을 초기화했어요.');
    return true;
   }
   const id=FP.activeDemoId();
   if(validId(id)){
    const result=await FP.cloudRpc('fanplay_demo_resume',{p_player_id:id});
    if(FP.account.generation!==generation||FP.activeDemoId()!==id)return false;
    if(!result)throw new Error('이전에 접속한 아이디의 기록을 찾지 못했어요.');
    FP.useAccount(validateResult(result));
   }else FP.account.restorePending=false;
   return true;
  }catch(error){FP.cloudError=error.message;return false;}
  finally{FP.account.checking=false;}
 };
 FP.continueAsGuest=()=>{
  try{localStorage.removeItem(activeKey);}catch{FP.toast('이 브라우저에서 로그인 상태를 바꿀 수 없어요.');return false;}
  FP.useAccount({username:null});
  return true;
 };
 FP.cloudAccountTools = () => `<section class="panel account-panel" aria-label="온라인 저장"><div class="storage-mode"><strong>온라인 저장</strong><span>아이디 <b>${FP.esc(FP.account.username)}</b></span></div><p class="save-status" data-save-status data-save-state="${FP.accountSaveState || 'idle'}" role="status">${FP.esc(FP.accountSaveStatus)}</p>
   ${FP.guestImportPanel()}<details class="cloud-tools"><summary>저장 도구</summary><div class="cloud-tools-actions"><button class="btn secondary" data-action="cloud-download">현재 기록 내려받기</button><button class="btn secondary" data-action="cloud-refresh">온라인 기록 다시 불러오기</button>
   ${FP.pendingAccountSave?.username===FP.account.username?'<button type="button" class="btn secondary" data-action="records-download-pending">저장에 실패한 변경 사본 내려받기</button>':''}
   <button type="button" class="text-link" data-action="guest-review">이 기기 기록 가져오기 다시 확인</button><button type="button" class="text-link" data-action="import-backup">가져오기 전 사본 내려받기</button></div></details>
   <form data-account-action="logout"><button class="btn secondary" type="submit">로그아웃</button></form>
   <details><summary>기록과 게시물 이용 안내</summary><p>같은 아이디를 아는 사람과 저장 기록을 공유해요. 게시글과 댓글은 처음 작성한 브라우저에서 관리할 수 있어요.</p></details></section>`;
 FP.downloadDemoState=()=>{
  FP.downloadRecordFile(JSON.stringify(FP.data,null,2),'fanplay-'+(FP.account.username||'guest')+'.json');
 };
})();
