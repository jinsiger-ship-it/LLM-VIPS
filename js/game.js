/* 게임 규칙은 UI와 분리하여 전 경로 및 저장 실패를 독립 검사할 수 있게 합니다. */
FP.ending = stats => {const avg=stats.reduce((a,b)=>a+b,0)/3;return avg>=80?'legend':avg>=65?'star':'steady';};
FP.grant = data => {
 const id=FP.ending(data.career.stats);
 for(const item of ['rookie',id])if(!data.inventory.itemIds.includes(item))data.inventory.itemIds.push(item);
 if(!data.inventory.titleIds.includes(id))data.inventory.titleIds.push(id);
};
FP.startCareer = (name,position) => FP.transact(d=>{d.career={name:FP.str(name,24)||'신인 선수',position:['투수','포수','내야수','외야수'].includes(position)?position:'투수',stats:position==='투수'?[45,43,44]:[44,45,43],step:0,log:[]};});
FP.choose = option => {
 if(!Number.isInteger(option)||option<0||option>2||!FP.data.career||FP.data.career.step>=8)return false;
 return FP.transact(d=>{const c=d.career,scene=FP.scenes[c.step],before=[...c.stats];c.stats=c.stats.map((n,i)=>Math.min(100,n+FP.effects[option][i]));c.log.push({season:c.step+1,text:scene.title+' · '+scene.choices[option],delta:c.stats.map((n,i)=>n-before[i])});c.step++;if(c.step===8)FP.grant(d);});
};
