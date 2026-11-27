/* 사용자가 가져온 종료 경기만 저장합니다. 이전 경기 파일은 그대로 읽을 수 있습니다. */
FP.matchResultsKey = 'fanplay-match-results-v2';
const legacyMatchKey='fanplay-match-results-2026';

FP.parseMatchResults = function (text, legacy=false, tolerant=false) {
  const rows = JSON.parse(text);
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > (legacy?2000:10000)) {
    throw new Error('경기 목록이 비어 있거나 형식이 올바르지 않습니다.');
  }
  const matches=[],errors=[];
  for(const [index,row] of rows.entries()){
    const { date, stadium, home, away, homeScore, awayScore, time = '', gameNo, status = 'final' } = row ?? {};
    const validName = (value, limit) => typeof value === 'string' && value.trim() && value.trim().length <= limit;
    if (!FP.validDate(date) || !validName(stadium, 80) || !validName(home, 40) ||
      !validName(away, 40) || home.trim()===away.trim() ||
      !Number.isInteger(homeScore) || !Number.isInteger(awayScore) || !FP.validScore(homeScore) || !FP.validScore(awayScore) ||
      !['final','completed','종료'].includes(status) ||
      (gameNo!=null&&(!Number.isInteger(gameNo)||gameNo<1||gameNo>3)) ||
      (time !== '' && (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))) {
      errors.push(`${index + 1}행의 날짜, 경기 상태, 팀 또는 점수를 확인해 주세요.`);
      continue;
    }
    const source=row.sourceId??row.id;
    const sourceId=(typeof source==='string'||Number.isSafeInteger(source))&&(!legacy||!/^\d+$/.test(source))
      ?String(source).trim().slice(0,96):'';
    const season=date.slice(0,4);
    const id=sourceId?'id:'+season+':'+sourceId:
      'match:'+JSON.stringify([date,stadium.trim(),home.trim(),away.trim(),gameNo||time]);
    matches.push({ id, sourceId, date, stadium: stadium.trim(), home: home.trim(), away: away.trim(), homeScore, awayScore, time, gameNo:gameNo??null,row:index+1 });
  }
  if(tolerant)return {matches,errors};
  if(errors.length)throw new Error(errors[0]);
  return matches;
};

FP.loadMatchResults = function (storage) {
  try {
    const modern=storage.getItem(FP.matchResultsKey);
    return FP.parseMatchResults(modern??storage.getItem(legacyMatchKey)??'[]',modern===null,true).matches;
  } catch {
    return [];
  }
};

FP.mergeMatchResults = (current,imported) => {
 const matches=new Map(current.map(match=>[match.id,match]));
 const errors=[...imported.errors];
 let added=0,updated=0,duplicate=0;
 const byFile=new Map();
 for(const match of imported.matches){
  const previousInFile=byFile.get(match.id);
  if(previousInFile&&(previousInFile.homeScore!==match.homeScore||previousInFile.awayScore!==match.awayScore)){
   errors.push(`${match.row}행은 같은 경기 키에 다른 점수예요. 경기 ID나 차수를 확인해 주세요.`);
   continue;
  }
  byFile.set(match.id,match);
  const previous=matches.get(match.id);
  if(previous){
   const fields=['date','stadium','home','away','homeScore','awayScore','time','gameNo'];
   if(fields.every(field=>previous[field]===match[field])){duplicate++;continue;}
   if(!match.sourceId&&!match.time&&!match.gameNo){
    errors.push(`${match.row}행은 기존 경기와 구분할 시각·차수·ID가 필요해요.`);continue;
   }
   updated++;
  }else added++;
  matches.set(match.id,match);
 }
 if(matches.size>10000)throw new Error('이 브라우저에서 경기 10,000건까지 보관할 수 있어요.');
 return {matches:[...matches.values()],errors,added,updated,duplicate};
};

FP.matchesAt = function (results, date, stadium) {
  return results.filter(match => match.date === date && match.stadium === stadium)
    .sort((first, second) => first.time.localeCompare(second.time));
};
