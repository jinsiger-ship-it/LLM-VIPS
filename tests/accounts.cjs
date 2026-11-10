const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server.cjs');

async function verify() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'fanplay-account-test-'));
  const databasePath = path.join(directory, 'test.sqlite');
  let server;
  let base;
  async function start() {
    server = createServer({ databasePath }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = 'http://127.0.0.1:' + server.address().port;
  }
  async function stop() {
    if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  async function request(route, { method = 'GET', cookie, body, origin, status = 200 } = {}) {
    const headers = { 'X-Fanplay-Request': '1' };
    if (cookie) headers.Cookie = cookie;
    if (origin) headers.Origin = origin;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + route, { method, headers, body: JSON.stringify(body) });
    const json = await response.json();
    assert.equal(response.status, status, JSON.stringify(json));
    const setCookie = response.headers.get('set-cookie');
    return { json, cookie: setCookie?.split(';')[0], setCookie };
  }
  const primary = { username: 'tester_one', password: 'Test8ch!', acceptedTerms: true };
  const second = { ...primary, username: 'tester_two', password: 'SixteenChars123!' };
  try {
    await start();
    const home = await fetch(base + '/');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /js\/account\.js" data-account-server/);
    await request('/database/fanplay.sqlite', { status: 404 });
    await request('/api/register', { method: 'POST', body: { ...primary, acceptedTerms: false }, status: 400 });
    await request('/api/register', { method: 'POST', origin: 'https://other.example', body: primary, status: 403 });
    for (const length of [7, 17]) {
      await request('/api/register', { method: 'POST', body: { ...primary, password: 'a'.repeat(length) }, status: 400 });
    }
    const registered = await request('/api/register', { method: 'POST', body: primary });
    assert.match(registered.setCookie, /HttpOnly; SameSite=Strict; Max-Age=604800/);
    await request('/api/register', { method: 'POST', body: primary, status: 409 });
    await request('/api/login', { method: 'POST', body: { ...primary, password: 'wrong' }, status: 401 });
    const deviceTwo = await request('/api/login', { method: 'POST', body: primary });
    const other = await request('/api/register', { method: 'POST', body: second });
    const state = registered.json.state;
    state.tickets.push({ id: 'test-ticket', date: '2026-05-05', stadium: '테스트 야구장', home: '홈', away: '원정', hs: 5, as: 1 });
    state.career = { name: '테스트', position: '투수', stats: [60, 60, 60], step: 1, log: [] };
    const payload = { username: primary.username, state, revision: 0 };
    await request('/api/state', { method: 'PUT', body: payload, status: 401 });
    await request('/api/state', { method: 'PUT', cookie: other.cookie, body: payload, status: 409 });
    const saved = await request('/api/state', { method: 'PUT', cookie: registered.cookie, body: payload });
    assert.equal(saved.json.revision, 1);
    await request('/api/state', { method: 'PUT', cookie: deviceTwo.cookie, body: payload, status: 409 });
    assert.equal((await request('/api/session', { cookie: other.cookie })).json.state.tickets.length, 0);
    await stop();
    await start();
    const restored = await request('/api/session', { cookie: deviceTwo.cookie });
    assert.equal(restored.json.state.tickets[0].id, 'test-ticket');
    assert.equal(restored.json.state.career.step, 1);
    await request('/api/logout', { method: 'POST', cookie: registered.cookie, body: { username: primary.username } });
    assert.equal((await request('/api/session', { cookie: registered.cookie })).json.username, null);
    assert.equal((await request('/api/session', { cookie: deviceTwo.cookie })).json.username, primary.username);
    await request('/api/account', { method: 'DELETE', cookie: deviceTwo.cookie, body: primary });
    assert.equal((await request('/api/session', { cookie: deviceTwo.cookie })).json.username, null);
    await request('/api/login', { method: 'POST', body: primary, status: 401 });
    console.log('PASS accounts, durable sessions, device sync, isolation, stale-write protection and deletion');
  } finally {
    await stop();
    // Only removes known test artifacts inside the temporary directory this script created.
    for (const suffix of ['', '-shm', '-wal']) rmSync(databasePath + suffix, { force: true });
    require('node:fs').rmdirSync(directory);
  }
}

verify().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
