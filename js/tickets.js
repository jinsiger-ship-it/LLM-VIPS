/* 티켓 렌더링과 입력 정규화. 사용자 문자열은 항상 이스케이프하고 사진은 data URL만 허용합니다. */
FP.esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
FP.sample={id:'sample',date:'2026-11-06',stadium:'잠실 야구장',home:'우리 팀',away:'상대 팀',hs:5,as:4,mode:'직관',note:'아홉 번의 이닝, 오래 남을 한순간.',tag:'나의 야구 일기',theme:'classic',color:'forest',frameId:'default',backgroundId:'default',badgeId:'default',stickerIds:[],photo:''};
FP.ticket = t => `<article class="ticket ${FP.esc(t.theme)} ${FP.esc(t.color)} frame-${FP.esc(t.frameId)} background-${FP.esc(t.backgroundId||'default')}"><div class="ticket-top"><span>FANPLAY / ${FP.esc(t.mode)}</span><span>${FP.esc(t.date)}</span></div>${t.photo?`<img class="ticket-photo" src="${FP.image(t.photo)}" alt="내가 첨부한 경기 사진">`:'<div class="diamond-art" aria-hidden="true"><i></i><span>✦</span></div>'}<div class="ticket-content"><small>${FP.esc(t.stadium)} · ${FP.esc(t.tag)}</small><div class="match"><b>${FP.esc(t.home)}</b><strong>${t.mode==='커리어'?'✦':`${FP.validScore(t.hs)?Number(t.hs):"—"} <em>:</em> ${FP.validScore(t.as)?Number(t.as):"—"}`}</strong><b>${FP.esc(t.away)}</b></div><p>${FP.esc(t.note)||'이날의 야구를 기억합니다.'}</p><div class="ticket-bottom"><span>${t.badgeId&&t.badgeId!=='default'?`<span class="ticket-achievement" title="${FP.esc(FP.items.find(i=>i.id===t.badgeId)?.name)}">${FP.esc(FP.items.find(i=>i.id===t.badgeId)?.icon)} · ${FP.esc(FP.items.find(i=>i.id===t.badgeId)?.name)}</span>`:'ADMIT ONE MEMORY'}</span><span>${(t.stickerIds||[]).map(id=>{const i=FP.items.find(x=>x.id===id);return i?`<span class="ticket-sticker" title="${FP.esc(i.name)}">${i.icon}</span>`:'';}).join(' ')}</span></div></div><div class="ticket-stub"><span>나의 순간을 위한 단 한 장</span><div class="barcode"></div><small>MEMORY ${FP.esc(t.date.replaceAll('-',''))}</small></div></article>`;
FP.saveTicket = (t,expected) => {
 const clean=FP.ticketData(t);
 if(!clean||(!clean.stadium&&clean.mode!=='커리어')){FP.toast('경기 날짜, 구장과 두 팀 이름을 확인해 주세요.');return false;}
 if(clean.mode!=='커리어'&&(clean.hs===null||clean.as===null)){FP.toast('홈과 원정 점수를 입력해 주세요.');return false;}
 if([clean.frameId,clean.backgroundId,clean.badgeId,...clean.stickerIds].some(id=>id!=='default'&&!FP.data.inventory.itemIds.includes(id))){FP.toast('먼저 게임에서 보상을 획득해 주세요.');return false;}
 return FP.transact(d=>{
  const index=d.tickets.findIndex(x=>x.id===clean.id);
  if(expected!==undefined&&JSON.stringify(d.tickets[index]??null)!==expected)throw new Error('conflict');
  if(index<0)d.tickets.unshift(clean);else d.tickets[index]=clean;
 });
};
FP.deleteTicket = id => FP.transact(d=>{d.tickets=d.tickets.filter(t=>t.id!==id);if(d.profile.featuredTicketId===id)d.profile.featuredTicketId=null;});
