(() => {
  if (!FP.cloudMode || !['http:','https:'].includes(location.protocol)) return;
  const labels={latest:'최신',likes:'좋아요 TOP 10',comments:'댓글 TOP 10'};
  const E=FP.esc;
  const sdkUrl=new URL('vendor/supabase.js',document.currentScript.src);
  let realtimeClient;
  let interval, refreshTimer, disconnect, active=false, epoch=0;
  let requested=0;
  let cursors=[null], viewer, feedViewer;
  const threads=new Map(), photos=new Map(), commentDrafts=new Map(), openThreads=new Set(), writes=new Map();
  const missing=error=>['PGRST202','42883'].includes(error.code);
  function requestId(){
    if(crypto.randomUUID)return crypto.randomUUID();
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    bytes[6]=(bytes[6]&15)|64;
    bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
    return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  }
  function pendingRequest(key){
    let id=writes.get(key);
    try{id=id||sessionStorage.getItem('fanplay-post-request:'+key);}catch{}
    if(!id)id=requestId();
    if(writes.size>=8)writes.delete(writes.keys().next().value);
    writes.set(key,id);
    try{sessionStorage.setItem('fanplay-post-request:'+key,id);}catch{}
    return id;
  }
  function finishRequest(key){
    if(!key)return;
    writes.delete(key);
    try{sessionStorage.removeItem('fanplay-post-request:'+key);}catch{}
  }
  FP.communityMode=true;
  FP.communityPage=0;
  FP.communitySort='latest';
  FP.communityPosts=[];
  FP.communityError='';
  FP.resetCommunityPage=()=>{FP.communityPage=0;cursors=[null];};
  FP.changeCommunityPage=async change=>{
    if(change>0&&!FP.communityHasMore)return;
    if(change>0&&FP.communityV2){
      const last=FP.communityPosts.at(-1);
      cursors[FP.communityPage+1]={p_after_id:last.id,p_after_time:last.createdAt};
    }
    FP.communityPage=Math.max(0,FP.communityPage+change);
    await FP.refreshCommunity(true);
  };

  async function connectRealtime(callback, subscription) {
    if(!realtimeClient) {
      if(!globalThis.supabase?.createClient)await new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src=sdkUrl.href;
        script.onload=resolve;
        script.onerror=reject;
        document.head.append(script);
      });
      const {url,publishableKey}=FP.cloudConfig;
      realtimeClient=globalThis.supabase.createClient(url,publishableKey,{
        auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
      });
    }
    const channel=realtimeClient.channel('fanplay-demo-ticket-updates-'+subscription)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'fanplay_demo_feed_updates'},callback)
      .subscribe();
    return ()=>{void realtimeClient.removeChannel(channel);};
  }

  FP.communityPanel = () => `<section class="panel community-toolbar">
    <div class="community-sorts" role="group" aria-label="티켓 정렬">${Object.entries(labels).map(([key,label])=>
      `<button class="btn secondary" type="button" data-action="community-sort" data-value="${key}" aria-pressed="${FP.communitySort===key}">${label}</button>`).join('')}</div>
    <div class="community-links">${FP.account.username?'<a class="text-link" href="#collection">내 수집함에서 티켓 올리기 →</a>':'<a class="text-link" href="#login" data-login-return="community">로그인하고 참여하기 →</a>'}
      <button type="button" class="btn secondary" data-action="community-refresh">새로고침</button></div>
  </section><div id="community-feed">${feed()}</div>`;

  function feed() {
    if(FP.communityError)return `<p class="panel" role="status">${E(FP.communityError)} <button type="button" class="btn secondary" data-action="community-refresh">다시 불러오기</button></p>`;
    if(!FP.communityLoaded)return '<p class="panel" role="status">티켓을 불러오는 중이에요.</p>';
    const paging=FP.communitySort==='latest'&&(FP.communityPage>0||FP.communityHasMore)
      ?`<div class="actions community-pages"><button type="button" class="btn secondary" data-action="community-page" data-value="-1" ${FP.communityPage===0?'disabled':''}>이전</button><span>${FP.communityPage+1} 페이지</span><button type="button" class="btn secondary" data-action="community-page" data-value="1" ${FP.communityHasMore?'':'disabled'}>다음</button></div>`:'';
    if(!FP.communityPosts.length)return '<p class="panel">아직 이 목록에 티켓이 없어요.</p>'+paging;
    const sameViewer=Boolean(FP.account.username)&&feedViewer===FP.account.username;
    return `<div class="collection-grid">${FP.communityPosts.map((post,index)=>{
      const ticket=FP.ticketData({...post.ticket,photo:photos.get(post.id)||post.thumbnail||post.ticket?.photo});
      if(!ticket)return '';
      const published=post.createdAt ? new Date(post.createdAt) : null;
      const date=published&&Number.isFinite(+published)
        ?`<time datetime="${E(post.createdAt)}">${E(published.toLocaleString('ko-KR',{dateStyle:'short',timeStyle:'short'}))}</time>`:'<span>이전 기록 · 작성 시각 없음</span>';
      return `<article class="post panel">
        <div class="section-title"><div>${FP.communitySort==='latest'?'':`<span class="badge">${index+1}위</span> `}<b>${E(post.nickname)}</b><div class="muted">${date}</div></div>
        ${sameViewer&&post.mine?`<div class="community-owner-actions"><button type="button" class="btn secondary" data-action="edit-post" data-value="${E(post.id)}">수정</button><button type="button" class="btn quiet" data-action="delete-post" data-value="${E(post.id)}">삭제</button></div>`:''}</div>
        <p>${E(post.text)}</p>${FP.ticket(ticket)}
        ${FP.communityV2&&post.hasPhoto&&!photos.has(post.id)?`<button class="btn secondary" type="button" data-action="community-photo" data-value="${E(post.id)}">원본 사진 보기</button>`:''}
        <div class="actions">
          ${FP.account.username?`<button type="button" class="btn secondary" data-action="like" data-value="${E(post.id)}" aria-pressed="${sameViewer&&post.liked===true}">${sameViewer&&post.liked?'♥':'♡'} 좋아요 ${Number(post.likes)||0}</button>`:`<span>좋아요 ${Number(post.likes)||0}</span>`}
          ${FP.communityV2&&FP.account.username&&!post.mine?`<button type="button" class="btn quiet" data-action="community-report" data-value="${E(post.id)}">신고</button>`:''}
        </div>
        <details class="community-comments" data-thread="${E(post.id)}" ${openThreads.has(post.id)?'open':''}><summary>댓글 ${Number(post.replyCount)||0}</summary>
          <div class="comments">${threadMarkup(post)}</div>
          ${FP.account.username?`<form class="comment-form" data-post="${E(post.id)}"><input name="comment" required maxlength="200" aria-label="댓글" placeholder="댓글 쓰기" value="${E(viewer===FP.account.username?commentDrafts.get(post.id)||'':'')}"><button class="btn" type="submit">등록</button></form>`:''}
        </details>
      </article>`;
    }).join('')}</div>${paging}`;
  }
  function threadMarkup(post){
    const cached=viewer===FP.account.username?threads.get(post.id):null;
    const rows=FP.communityV2?[...(cached?.rows||[])].reverse():(post.comments||[]);
    return (cached?.error?`<p role="status">${E(cached.error)}</p>`:'')+
      (FP.communityV2&&post.replyCount&&(!cached?.rows||cached.more||cached.error)?
        `<button type="button" class="btn secondary" data-action="community-comments" data-value="${E(post.id)}">${cached?.error?'다시 불러오기':cached?.rows?'이전 댓글 더 보기':'댓글 불러오기'}</button>`:'')+
      (!FP.communityV2&&post.replyCount>rows.length?'<p class="muted">최근 댓글 15개를 표시해요.</p>':'')+
      rows.map(c=>`<div class="community-comment"><p><b>${E(c.nickname)}</b> ${E(c.text)}</p>
        ${c.mine&&feedViewer===FP.account.username&&FP.account.username?`<button type="button" class="btn quiet" data-action="delete-comment" data-value="${E(c.id)}" data-post="${E(post.id)}" aria-label="내 댓글 삭제">삭제</button>`:''}</div>`).join('');
  }
  function drawFeed(){
    const node=document.querySelector('#community-feed');
    if(node)node.innerHTML=feed();
  }
  function drawThread(id){
    const container=[...document.querySelectorAll('[data-thread]')].find(e=>e.dataset.thread===id);
    const post=FP.communityPosts.find(item=>item.id===id);
    if(container&&post)container.querySelector('.comments').innerHTML=threadMarkup(post);
  }
  FP.communityDraft=(id,text)=>{if(text)commentDrafts.set(id,text);else commentDrafts.delete(id);};
  FP.communityThreadToggle=element=>{
    const id=element.dataset.thread;
    if(element.open){
      openThreads.add(id);
      if(!threads.has(id)&&FP.communityV2&&FP.communityPosts.find(post=>post.id===id)?.replyCount)void FP.communityComments(id);
    }else if(element.isConnected)openThreads.delete(id);
  };
  FP.communityComments=async(id,more=false,removedId)=>{
    if(!FP.communityV2)return;
    const previous=threads.get(id);
    if(previous?.loading)return;
    const source=removedId?(previous?.rows||[]).filter(row=>row.id!==removedId):previous?.rows;
    const last=more?source?.at(-1):null;
    const owner=FP.account.username;
    threads.set(id,{...previous,rows:source,loading:true,error:''});
    try{
      const response=await FP.cloudRpc('fanplay_demo_ticket_comments',{p_post_id:id,
        ...(last?{p_after_id:last.id,p_after_time:last.createdAt}:{}),...FP.communityIdentity()});
      if(owner!==FP.account.username)return;
      const current=response.slice(0,15);
      const rows=[...new Map([...(more||source?.length>15?source||[]:[]),...current].map(row=>[row.id,row])).values()]
        .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
      threads.set(id,{rows,more:more||!source||source.length<=15?response.length>15:previous.more});
    }catch(error){threads.set(id,{...previous,rows:source,error:error.message});}
    drawThread(id);
  };
  FP.showCommunityPhoto=async id=>{
    try{
      const photo=FP.image(await FP.cloudRpc('fanplay_demo_ticket_photo',{p_post_id:id}));
      if(!photo){FP.toast('공개 사진을 찾지 못했어요.');return;}
      photos.set(id,photo);drawFeed();
    }catch(error){FP.toast(error.message);}
  };

  FP.refreshCommunity = async (force=false) => {
    const node=document.querySelector('#community-feed');
    if(!node || (!force && (FP.communityPage>0||node.querySelector('input:focus, button:focus'))))return;
    if(viewer!==FP.account.username){
      if(viewer!==undefined){threads.clear();commentDrafts.clear();openThreads.clear();}
      viewer=FP.account.username;
    }
    const serial=++requested;
    const sort=FP.communitySort;
    const owner=FP.account.username;
    try {
      const identity=FP.communityIdentity();
      const posts=await FP.cloudRpc('fanplay_demo_ticket_feed_v2',{p_sort:sort,...cursors[FP.communityPage],...identity})
        .then(rows=>{FP.communityV2=true;return rows;})
        .catch(error=>{
          if(!missing(error))throw error;
          FP.communityV2=false;
          return FP.cloudRpc('fanplay_demo_ticket_feed',{p_sort:sort,p_page:FP.communityPage,...identity});
        });
      if(serial!==requested || sort!==FP.communitySort||owner!==FP.account.username)return;
      FP.communityHasMore=sort==='latest'&&Array.isArray(posts)&&posts.length>20;
      const previous=new Map(FP.communityPosts.map(post=>[post.id,post.replyCount]));
      FP.communityPosts=Array.isArray(posts)?posts.slice(0,20):[];
      feedViewer=owner;
      FP.communityError='';
      FP.communityLoaded=true;
      if(FP.communityV2)for(const post of FP.communityPosts){
        if(openThreads.has(post.id)&&previous.get(post.id)!==post.replyCount)void FP.communityComments(post.id);
      }
    } catch(error) {
      if(serial!==requested)return;
      FP.communityError=error.message;
    }
    if(node.isConnected && (force || !node.querySelector('input:focus, button:focus'))){
      drawFeed();
    }
  };

  FP.watchCommunity = async viewing => {
    if(viewing===active)return;
    active=viewing;
    const version=++epoch;
    if(!viewing){requested++;clearInterval(interval);clearTimeout(refreshTimer);refreshTimer=null;disconnect?.();disconnect=null;return;}
    void FP.refreshCommunity(true);
    interval=setInterval(()=>{if(!document.hidden)void FP.refreshCommunity();},30000);
    try {
      const stop=await connectRealtime(()=>{
        if(!active||document.hidden||refreshTimer)return;
        refreshTimer=setTimeout(()=>{refreshTimer=null;if(active)void FP.refreshCommunity();},1500);
      },version);
      if(version===epoch)disconnect=stop;else stop();
    } catch { /* The periodic refresh also works if Realtime cannot connect. */ }
  };

  FP.communityAction = async (action,args={}) => {
    if(!FP.account.username){location.hash='login';FP.toast('아이디로 들어와서 참여해 주세요.');return false;}
    if(FP.account.busy)return false;
    FP.account.busy=true;
    let key;
    try {
      const identity=FP.communityIdentity(true);
      const {p_include_photo,p_include_note,p_thumbnail,...compatible}=args;
      const base={p_action:action,...compatible,...identity};
      if(['post','comment'].includes(action))key=FP.guestFingerprint([identity.p_player_id,action,args]);
      let modern=true;
      await FP.cloudRpc('fanplay_demo_ticket_write_v2',{...base,p_include_photo,p_include_note,p_thumbnail,p_request_id:key?pendingRequest(key):undefined})
        .catch(error=>{
          if(!missing(error)||action==='report')throw error;
          modern=false;
          return FP.cloudRpc('fanplay_demo_ticket_write',base);
        });
      finishRequest(key);
      if(!modern&&['post','edit','delete'].includes(action)) {
        try {FP.useAccount(await FP.accountRequest('login','POST',{username:FP.account.username}));}
        catch {FP.toast('게시글이 반영됐어요. 내 기록을 다시 불러오려면 새로고침해 주세요.');}
      }
      return true;
    } catch(error) {
      if(key&&[400,401,403,404,409].includes(error.status)&&!missing(error))finishRequest(key);
      FP.toast(error.message);
      return false;
    } finally{FP.account.busy=false;}
  };

  FP.communityThumbnail=async photo=>{
    if(!photo)return null;
    try{
      const image=new Image();
      image.src=photo;
      await image.decode();
      const scale=Math.min(1,180/Math.max(image.width,image.height));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      const thumbnail=canvas.toDataURL('image/jpeg',.58);
      return thumbnail.length<=65536?thumbnail:null;
    }catch{return null;}
  };
})();
