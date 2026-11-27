const kboTeams = new Set(['DOOSAN', 'SAMSUNG', 'LOTTE', 'HANWHA', 'LG', 'KIA', 'HEROES', 'NC', 'KT', 'SSG']);
const venueAliases = [
  ['문학', '인천', '인천문학', '인천SSG랜더스필드', 'SSG랜더스필드'],
  ['잠실', '잠실야구장', '서울잠실야구장'],
  ['사직', '부산사직', '사직야구장', '부산사직야구장'],
  ['고척', '고척돔', '고척스카이돔'],
  ['수원', '수원KT위즈파크', 'KT위즈파크'],
  ['대구', '대구삼성라이온즈파크', '삼성라이온즈파크', '라팍'],
  ['창원', '창원NC파크', 'NC파크'],
  ['광주', '광주기아챔피언스필드', '기아챔피언스필드', '챔필'],
  ['대전', '대전한화생명볼파크', '한화생명볼파크']
];
const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[\s-]/g, '');
function venueMatches(stadium, search) {
  const venue = normalize(stadium);
  const term = normalize(search);
  if (!term) return false;
  return venue.includes(term) || venueAliases.some(group => {
    const aliases = group.map(normalize);
    return aliases.includes(venue) && aliases.includes(term);
  });
}

async function lookupKboGames(date, team, stadium) {
  const teams = team ? [team] : [...kboTeams];
  const signal = AbortSignal.timeout(4500);
  const groups = await Promise.all(teams.map(async code => {
    const response = await fetch(`http://127.0.0.1:8080/api/game-schedule/${code}/${date}`, { signal, redirect: 'error' });
    if (!response.ok) throw new Error('KBO lookup failed');
    const result = await response.json();
    if (result.code !== 'OK' || !Array.isArray(result.data)) throw new Error('Invalid KBO response');
    return result.data;
  }));
  const games = new Map();
  for (const game of groups.flat()) {
    if (game.date !== date || game.gameStatus !== '경기 종료' || !game.gameKey ||
        typeof game.stadium !== 'string' || (stadium && !venueMatches(game.stadium, stadium))) continue;
    games.set(game.gameKey, {
      sourceId: game.gameKey, date, stadium: game.stadium, home: game.homeTeam, away: game.awayTeam,
      homeScore: game.homeScore, awayScore: game.awayScore, time: (game.time ?? '').slice(0, 5), status: 'final'
    });
  }
  return [...games.values()].sort((a,b) => a.time.localeCompare(b.time) || a.sourceId.localeCompare(b.sourceId));
}

module.exports = { lookupKboGames, kboTeams };
