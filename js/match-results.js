/* 2026년 종료 경기만 불러옵니다. 티켓 저장소와 별도로 관리합니다. */
FP.matchResultsKey = 'fanplay-match-results-2026';

FP.parseMatchResults = function (text) {
  const rows = JSON.parse(text);
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 2000) {
    throw new Error('경기 목록이 비어 있거나 형식이 올바르지 않습니다.');
  }
  const matchIds = new Set();
  return rows.map((row, index) => {
    const { date, stadium, home, away, homeScore, awayScore, time = '' } = row ?? {};
    const parsedDate = typeof date === 'string' ? new Date(date + 'T00:00:00Z') : new Date(NaN);
    const validDate = /^2026-\d{2}-\d{2}$/.test(date ?? '') &&
      !Number.isNaN(parsedDate.valueOf()) && parsedDate.toISOString().slice(0, 10) === date;
    const validName = (value, limit) => typeof value === 'string' && value.trim() && value.trim().length <= limit;
    const validScore = value => Number.isInteger(value) && value >= 0 && value <= 99;
    if (!validDate || !validName(stadium, 80) || !validName(home, 40) ||
      !validName(away, 40) || !validScore(homeScore) || !validScore(awayScore) ||
      (time !== '' && (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))) {
      throw new Error(`${index + 1}번째 경기의 날짜, 구장, 팀 또는 점수를 확인해 주세요.`);
    }
    const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : String(index + 1);
    if (matchIds.has(id)) throw new Error('경기 ID가 중복되었습니다.');
    matchIds.add(id);
    return { id, date, stadium: stadium.trim(), home: home.trim(), away: away.trim(), homeScore, awayScore, time };
  });
};

FP.loadMatchResults = function (storage) {
  try {
    return FP.parseMatchResults(storage.getItem(FP.matchResultsKey) ?? '[]');
  } catch {
    return [];
  }
};

FP.matchesAt = function (results, date, stadium) {
  return results.filter(match => match.date === date && match.stadium === stadium)
    .sort((first, second) => first.time.localeCompare(second.time));
};
