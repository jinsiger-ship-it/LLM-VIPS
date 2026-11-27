const assert = require('node:assert/strict');
const { once } = require('node:events');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../server.cjs');

async function verify() {
  const originalFetch = global.fetch;
  const date = '2026-05-02';
  const publicSite = process.env.FANPLAY_KBO_TEST_URL;
  const cloud = !!publicSite || process.argv.includes('--cloud');
  const live = !!publicSite || process.argv.includes('--live') || process.env.FANPLAY_KBO_LIVE_TEST === '1';
  let offline = false;
  const first = {
    gameKey: 'fixture-1', date, time: '14:00:00', stadium: '문학',
    homeTeam: 'SSG 랜더스', awayTeam: '롯데 자이언츠', homeScore: 5, awayScore: 7, gameStatus: '경기 종료'
  };
  const second = { ...first, gameKey: 'fixture-2', time: '18:30:00', homeScore: 2, awayScore: 3 };
  if (!live) global.fetch = (input, options) => {
    if (typeof input !== 'string' || !input.startsWith('http://127.0.0.1:8080/api/game-schedule/')) return originalFetch(input, options);
    if (offline) return Promise.reject(new Error('KBO server offline'));
    const [team, day] = input.split('/').slice(-2);
    const games = day === date && ['SSG', 'LOTTE'].includes(team) ? [first, second] : [];
    return Promise.resolve(Response.json({ code: 'OK', data: games }));
  };
  const server = createServer({ databasePath: ':memory:', kboLookup: true }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const local = 'http://127.0.0.1:' + server.address().port;
  const base = publicSite || (cloud ? 'http://fanplay.test' : local);
  let browser;
  try {
    const headers = { 'x-fanplay-request': '1' };
    assert.equal((await fetch(local + '/api/kbo-games')).status, 403);
    assert.equal((await fetch(local + '/api/kbo-games?date=2026-02-31&team=LOTTE', { headers })).status, 400);
    browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE });
    const page = await browser.newPage({ viewport: { width: 320, height: 780 } });
    if (cloud && !publicSite) {
      await page.route('http://fanplay.test/**', route => {
        const name = new URL(route.request().url()).pathname.slice(1) || 'index.html';
        if (!/^(index\.html|(?:js|css)\/[a-z-]+\.(?:js|css)|js\/vendor\/supabase\.js)$/.test(name)) return route.abort();
        return route.fulfill({ path: path.resolve(__dirname, '..', name) });
      });
      if (!live) await page.route('https://*.supabase.co/rest/v1/rpc/*', route => {
        const name = new URL(route.request().url()).pathname.split('/').pop();
        if (name === 'fanplay_demo_status') return route.fulfill({ json: { ready: true, version: 1 } });
        assert.equal(name, 'fanplay_kbo_games');
        if (offline) return route.fulfill({ status: 503, json: { message: 'offline' } });
        const {p_date, p_team, p_stadium} = route.request().postDataJSON();
        const matches = p_date === date && ['LOTTE',null].includes(p_team) &&
          ['인천 SSG랜더스필드',null].includes(p_stadium) ? [first,second] : [];
        return route.fulfill({ json: matches.map(game => ({
          sourceId: game.gameKey, date: game.date, stadium: game.stadium, home: game.homeTeam, away: game.awayTeam,
          homeScore: game.homeScore, awayScore: game.awayScore, time: game.time.slice(0,5), status: 'final'
        })) });
      });
    }
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/#create');
    await page.waitForFunction(() => !FP.account.checking);
    const pick = selector => page.locator(selector);
    await pick('[name="date"]').fill(date);
    await pick('[data-kbo-team]').selectOption('LOTTE');
    if (live) {
      await pick('[data-kbo-status]').filter({ hasText: '적용됨' }).waitFor();
      assert.equal(await pick('[name="hs"]').inputValue(), '5');
      assert.equal(await pick('[name="as"]').inputValue(), '7');
    } else {
      await pick('[data-kbo-match]').first().waitFor();
      assert.equal(await pick('[data-kbo-match]').count(), 2);
      await pick('[data-kbo-match]').nth(1).check();
      assert.equal(await pick('[name="hs"]').inputValue(), '2');
      assert.equal(await pick('[name="as"]').inputValue(), '3');
    }
    await pick('[data-kbo-team]').selectOption('');
    await pick('[name="hs"]').fill('0');
    await pick('[data-kbo-stadium]').fill('인천 SSG랜더스필드');
    await pick('[data-kbo-find]').click();
    if (!live) {
      await pick('[data-kbo-match]').first().waitFor();
      assert.equal(await pick('[data-kbo-match]').count(), 2);
      await pick('[data-kbo-match]').first().check();
    }
    await page.waitForFunction(() => document.querySelector('[name="hs"]').value === '5');
    assert.equal(await pick('[name="home"]').inputValue(), 'SSG 랜더스');
    assert.equal(await pick('[name="stadium"]').inputValue(), '문학');
    const status = pick('[data-kbo-status]');
    await pick('[name="home"]').fill('직접 입력한 홈 팀');
    await pick('[data-kbo-stadium]').fill('검색에 존재하지 않는 구장');
    await pick('[data-kbo-find]').click();
    await status.filter({ hasText: '일치하는 종료 경기가 없어요' }).waitFor();
    assert.equal(await pick('[name="home"]').inputValue(), '직접 입력한 홈 팀');
    if (!live) {
      offline = true;
      await pick('[data-kbo-find]').click();
      await status.filter({ hasText: '경기를 불러오지 못했어요' }).waitFor();
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    console.log((cloud ? 'CLOUD ' : 'LOCAL ') + (live ? 'PASS real KBO team and stadium autofill in Edge' : 'PASS fixture lookup, multiple games, manual input and offline fallback'));
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    global.fetch = originalFetch;
  }
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
