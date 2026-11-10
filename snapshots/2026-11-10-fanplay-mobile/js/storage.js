/* 사본을 먼저 저장하고 성공했을 때만 메모리를 교체합니다. 실패 시 어떤 변경도 반영하지 않습니다. */
FP.key = 'fanplay-prototype-v1';
FP.copy = value => JSON.parse(JSON.stringify(value));
FP.defaults = () => ({schemaVersion:2,tickets:[],posts:[],career:null,profile:{nickname:'야구팬',team:'neutral',featuredTicketId:null,selectedTitleId:null},inventory:{itemIds:[],titleIds:[]}});
FP.str = (s,max=160) => typeof s === 'string' ? s.slice(0,max) : '';
FP.number = (n,min,max,fallback=0) => Number.isFinite(Number(n)) ? Math.max(min,Math.min(max,Number(n))) : fallback;
FP.image = value => typeof value === 'string' && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value) && value.length < 3000000 ? value : '';
FP.ticketData = t => {
 if (!t || typeof t !== 'object' || !FP.str(t.id) || !/^\d{4}-\d{2}-\d{2}$/.test(t.date || '') || !FP.str(t.home) || !FP.str(t.away)) return null;
 return {id:FP.str(t.id),date:t.date,stadium:FP.str(t.stadium,80),home:FP.str(t.home,40),away:FP.str(t.away,40),hs:Math.floor(FP.number(t.hs,0,99)),as:Math.floor(FP.number(t.as,0,99)),mode:t.mode==='중계'?'중계':'직관',note:FP.str(t.note,180),tag:FP.str(t.tag,30),theme:['classic','scoreboard','photo'].includes(t.theme)?t.theme:'classic',color:['forest','rose','blue','sand'].includes(t.color)?t.color:'forest',photo:FP.image(t.photo),frameId:['steady','star'].includes(t.frameId)?t.frameId:'default',stickerIds:Array.isArray(t.stickerIds)?[...new Set(t.stickerIds.filter(id=>['rookie','legend'].includes(id)))]:[]};
};
FP.normalize = raw => {
 const d=FP.defaults(), r=raw && typeof raw==='object'?raw:{};
 d.tickets=(Array.isArray(r.tickets)?r.tickets:[]).map(FP.ticketData).filter(Boolean).filter((t,i,a)=>a.findIndex(x=>x.id===t.id)===i);
 const p=r.profile || {};
 d.profile.nickname=FP.str(p.nickname,24)||'야구팬';
 d.profile.team=FP.teams.some(t=>t[0]===p.team)?p.team:'neutral';
 d.profile.featuredTicketId=d.tickets.some(t=>t.id===(p.featuredTicketId||r.featured))?(p.featuredTicketId||r.featured):null;
 const inv=r.inventory||{};
 d.inventory.itemIds=[...new Set((Array.isArray(inv.itemIds)?inv.itemIds:[]).filter(id=>FP.items.some(i=>i.id===id)))];
 d.inventory.titleIds=[...new Set((Array.isArray(inv.titleIds)?inv.titleIds:[]).filter(id=>FP.titles.some(i=>i.id===id)))];
 // Diamond Memories 데이터의 보상은 새 아이템 정의로 명시적으로 대응합니다.
 if(Array.isArray(r.rewards)) for(const id of r.rewards){const mapped={night:'steady',gold:'star',trophy:'legend'}[id];if(mapped&&!d.inventory.itemIds.includes(mapped))d.inventory.itemIds.push(mapped);}
 d.profile.selectedTitleId=d.inventory.titleIds.includes(p.selectedTitleId)?p.selectedTitleId:null;
 const c=r.career;
 if(c && Array.isArray(c.stats)&&c.stats.length===3&&c.stats.every(n=>typeof n==='number'&&Number.isFinite(n))&&Number.isInteger(c.step)&&c.step>=0&&c.step<=8&&Array.isArray(c.log)) {
 d.career={name:FP.str(c.name,24)||'신인 선수',position:['투수','포수','내야수','외야수'].includes(c.position)?c.position:'투수',stats:c.stats.map(n=>FP.number(n,0,100)),step:c.step,log:c.log.slice(0,8).map(l=>({season:FP.number(l.season,1,8),text:FP.str(l.text,200),delta:Array.isArray(l.delta)?l.delta.slice(0,3).map(n=>FP.number(n,-100,100)):[]}))};
 // 완료 저장본에 보상이 빠졌다면 다음 성공 저장에서 함께 복구됩니다.
 if(c.step===8)FP.grant(d);
 }
 d.posts=(Array.isArray(r.posts)?r.posts:[]).filter(p=>p&&FP.str(p.id)&&FP.ticketData(p.ticket)).map(p=>({id:FP.str(p.id),nickname:FP.str(p.nickname,24)||'야구팬',text:FP.str(p.text,300),ticket:FP.ticketData(p.ticket),liked:p.liked===true,comments:(Array.isArray(p.comments)?p.comments:[]).filter(c=>c&&typeof c.text==='string').slice(-100).map(c=>({nickname:FP.str(c.nickname,24)||'야구팬',text:FP.str(c.text,200)}))}));
 return d;
};
FP.load = storage => {
 try {let text=storage.getItem(FP.key);if(text===null){text=storage.getItem('diamond-v1');FP.migrated=Boolean(text);} return FP.normalize(text?JSON.parse(text):{});}
 catch {FP.loadWarning=true;return FP.defaults();}
};
FP.transact = change => {
 const next=FP.copy(FP.data);
 try {change(next);localStorage.setItem(FP.key,JSON.stringify(next));FP.data=next;return true;}
 catch {FP.toast('저장하지 못했습니다. 기존 상태를 유지합니다. 저장 공간과 브라우저 설정을 확인해 주세요.');return false;}
};
