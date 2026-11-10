const http = require('node:http');
const https = require('node:https');
const { createHash, randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { createReadStream, mkdirSync, readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { promisify } = require('node:util');
const { DatabaseSync } = require('node:sqlite');

const derive = promisify(scrypt);
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const ATTEMPT_WINDOW = 15 * 60 * 1000;
const MAX_STATE_BYTES = 5 * 1024 * 1024;
const TERMS_VERSION = '2026-11-10';
const dummySalt = randomBytes(16).toString('hex');
const staticFiles = new Map([
  ['/', ['index.html', 'text/html']],
  ['/index.html', ['index.html', 'text/html']],
  ['/pages/fanplay-v1.1/', ['pages/fanplay-v1.1/index.html', 'text/html']],
  ['/pages/fanplay-v1.1/index.html', ['pages/fanplay-v1.1/index.html', 'text/html']],
  ['/pages/wireframe/10week_wireframe.html', ['pages/wireframe/10week_wireframe.html', 'text/html']],
  ['/css/legacy-v1.1/style.css', ['css/legacy-v1.1/style.css', 'text/css']],
  ['/js/legacy-v1.1/app.js', ['js/legacy-v1.1/app.js', 'text/javascript']],
  ...['style', 'mobile'].map(name => [`/css/${name}.css`, [`css/${name}.css`, 'text/css']]),
  ...['game-data', 'storage', 'game', 'tickets', 'account', 'app']
    .map(name => [`/js/${name}.js`, [`js/${name}.js`, 'text/javascript']])
]);

function model() {
  const context = vm.createContext({});
  for (const name of ['game-data', 'storage', 'game', 'tickets']) {
    vm.runInContext(readFileSync(path.join(__dirname, 'js', name + '.js'), 'utf8'), context);
  }
  return context.FP;
}

function problem(status, message) {
  return Object.assign(new Error(message), { status });
}

async function jsonBody(request, limit = 4096) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
    throw problem(415, 'JSON 요청만 처리할 수 있습니다.');
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    length += chunk.length;
    if (length > limit) {
      request.resume();
      throw problem(413, '저장 용량을 초과했습니다. 티켓 사진의 수나 크기를 줄여 주세요.');
    }
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
    return value;
  } catch {
    throw problem(400, '요청 형식을 확인해 주세요.');
  }
}

function digest(token) {
  return createHash('sha256').update(token).digest('hex');
}

function passwordHash(password, salt) {
  return derive(password, Buffer.from(salt, 'hex'), 64, {
    N: 2 ** 16, r: 8, p: 2, maxmem: 96 * 1024 * 1024
  });
}

function createServer({ databasePath, tls, publicOrigin } = {}) {
  const index = readFileSync(path.join(__dirname, 'index.html'), 'utf8')
    .replace('<script src="js/account.js">', '<script src="js/account.js" data-account-server>');
  const filename = databasePath ?? path.join(__dirname, 'database', 'fanplay.sqlite');
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      terms_version TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      state TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS sessions_expiration ON sessions(expires_at);
  `);
  const fp = model();
  const accountByName = db.prepare('SELECT * FROM accounts WHERE username = ?');
  const accountById = db.prepare('SELECT * FROM accounts WHERE id = ?');
  const createAccount = db.prepare('INSERT INTO accounts (username, salt, password_hash, terms_version, created_at, state) VALUES (?, ?, ?, ?, ?, ?)');
  const createSession = db.prepare('INSERT INTO sessions VALUES (?, ?, ?)');
  const dropSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const expireSessions = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');
  const sessionAccount = db.prepare('SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?');
  const saveState = db.prepare('UPDATE accounts SET state = ?, revision = revision + 1 WHERE id = ? AND revision = ?');
  const deleteAccount = db.prepare('DELETE FROM accounts WHERE id = ?');
  const attempts = new Map();
  let activeHashes = 0;
  const secure = Boolean(tls) || publicOrigin?.startsWith('https://');
  const cookieName = secure ? '__Host-fanplay_session' : 'fanplay_session';

  function sessionCookie(token, maxAge) {
    return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  }

  function requestToken(request) {
    const cookies = (request.headers.cookie ?? '').split(';').map(cookie => cookie.trim());
    const raw = cookies.find(cookie => cookie.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    return /^[a-f0-9]{64}$/.test(raw ?? '') ? digest(raw) : null;
  }

  function view(account) {
    return { username: account.username, state: JSON.parse(account.state), revision: account.revision };
  }

  function json(response, status, value) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(value));
  }

  function limitAttempts(request) {
    const now = Date.now();
    for (const [ip, record] of attempts) if (record.until <= now) attempts.delete(ip);
    const ip = request.socket.remoteAddress;
    const record = attempts.get(ip) ?? { count: 0, until: now + ATTEMPT_WINDOW };
    if (record.count >= 12 || (!attempts.has(ip) && attempts.size >= 10000)) {
      throw problem(429, '잠시 후 다시 시도해 주세요.');
    }
    record.count++;
    attempts.set(ip, record);
  }

  async function hashForRequest(password, salt) {
    if (activeHashes >= 2) throw problem(429, '잠시 후 다시 시도해 주세요.');
    activeHashes++;
    try {
      return await passwordHash(password, salt);
    } finally {
      activeHashes--;
    }
  }

  function finishLogin(response, account, previousToken) {
    if (previousToken) dropSession.run(previousToken);
    expireSessions.run(Date.now());
    const token = randomBytes(32).toString('hex');
    createSession.run(digest(token), account.id, Date.now() + SESSION_SECONDS * 1000);
    response.setHeader('Set-Cookie', sessionCookie(token, SESSION_SECONDS));
    json(response, 200, view(account));
  }

  async function handleApi(request, response, route) {
    const token = requestToken(request);
    if (request.method === 'GET' && route === '/api/session') {
      const account = token && sessionAccount.get(token, Date.now());
      return json(response, 200, account ? view(account) : { username: null });
    }
    const origin = publicOrigin ?? `${secure ? 'https' : 'http'}://${request.headers.host}`;
    if (request.headers['x-fanplay-request'] !== '1' ||
      (request.headers.origin && request.headers.origin !== origin)) {
      throw problem(403, '이 사이트에서 보낸 요청만 처리할 수 있습니다.');
    }
    if (request.method === 'POST' && ['/api/register', '/api/login'].includes(route)) {
      const body = await jsonBody(request);
      const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      const password = body.password;
      const registering = route === '/api/register';
      if (!/^[a-z0-9_]{3,24}$/.test(username) || typeof password !== 'string' ||
        password.length < (registering ? 8 : 1) || password.length > (registering ? 16 : 128)) {
        throw problem(400, '아이디는 영문·숫자·밑줄 3~24자, 가입 비밀번호는 8~16자로 입력해 주세요.');
      }
      if (registering && body.acceptedTerms !== true) throw problem(400, '약관과 개인정보 안내를 확인해 주세요.');
      limitAttempts(request);
      if (registering) {
        const salt = randomBytes(16).toString('hex');
        const hash = await hashForRequest(password, salt);
        let result;
        try {
          result = createAccount.run(username, salt, hash.toString('hex'), TERMS_VERSION, Date.now(), JSON.stringify(fp.defaults()));
        } catch (error) {
          if (error.errcode === 2067) throw problem(409, '이미 사용 중인 아이디입니다.');
          throw error;
        }
        return finishLogin(response, accountById.get(result.lastInsertRowid), token);
      }
      const account = accountByName.get(username);
      const hash = await hashForRequest(password, account?.salt ?? dummySalt);
      if (!account || !timingSafeEqual(hash, Buffer.from(account.password_hash, 'hex'))) {
        throw problem(401, '아이디 또는 비밀번호가 올바르지 않습니다.');
      }
      const current = accountById.get(account.id);
      if (!current || current.password_hash !== account.password_hash) throw problem(401, '다시 로그인해 주세요.');
      return finishLogin(response, current, token);
    }
    if (request.method === 'POST' && route === '/api/logout') {
      const body = await jsonBody(request);
      const account = token && sessionAccount.get(token, Date.now());
      if (account && account.username !== body.username) throw problem(409, '다른 계정으로 바뀌었습니다. 페이지를 새로고침해 주세요.');
      if (token) dropSession.run(token);
      response.setHeader('Set-Cookie', sessionCookie('', 0));
      return json(response, 200, { username: null });
    }
    if (!((request.method === 'PUT' && route === '/api/state') ||
      (request.method === 'DELETE' && route === '/api/account'))) throw problem(404, '경로를 찾을 수 없습니다.');
    const body = await jsonBody(request, route === '/api/state' ? MAX_STATE_BYTES : 4096);
    const account = token && sessionAccount.get(token, Date.now());
    if (!account) throw problem(401, '로그인 시간이 만료됐습니다. 다시 로그인해 주세요.');
    if (account.username !== body.username) throw problem(409, '다른 계정으로 바뀌었습니다. 페이지를 새로고침해 주세요.');
    if (route === '/api/account') {
      if (typeof body.password !== 'string' || !body.password || body.password.length > 128) throw problem(400, '비밀번호를 확인해 주세요.');
      limitAttempts(request);
      const hash = await hashForRequest(body.password, account.salt);
      if (!timingSafeEqual(hash, Buffer.from(account.password_hash, 'hex'))) throw problem(401, '비밀번호가 올바르지 않습니다.');
      if (!sessionAccount.get(token, Date.now())) throw problem(401, '다시 로그인해 주세요.');
      deleteAccount.run(account.id);
      response.setHeader('Set-Cookie', sessionCookie('', 0));
      return json(response, 200, { username: null });
    }
    if (!Number.isSafeInteger(body.revision) || !body.state || typeof body.state !== 'object' ||
      !Array.isArray(body.state.tickets) || !Array.isArray(body.state.posts)) throw problem(400, '기록 형식을 확인해 주세요.');
    let state;
    try {
      state = JSON.stringify(fp.normalize(body.state));
    } catch {
      throw problem(400, '기록에 잘못된 값이 있습니다.');
    }
    if (Buffer.byteLength(state) > MAX_STATE_BYTES) throw problem(413, '계정의 저장 용량을 초과했습니다.');
    if (!saveState.run(state, account.id, body.revision).changes) {
      throw problem(409, '다른 기기에서 기록이 바뀌었습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
    }
    return json(response, 200, view(accountById.get(account.id)));
  }

  async function handler(request, response) {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const route = new URL(request.url, 'http://fanplay.invalid').pathname;
      if (route.startsWith('/api/')) return await handleApi(request, response, route);
      const file = staticFiles.get(route);
      if (!file || !['GET', 'HEAD'].includes(request.method)) throw problem(404, '경로를 찾을 수 없습니다.');
      response.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8', 'Cache-Control': 'no-cache' });
      if (request.method === 'HEAD') return response.end();
      if (file[0] === 'index.html') return response.end(index);
      createReadStream(path.join(__dirname, file[0])).on('error', () => response.destroy()).pipe(response);
    } catch (error) {
      if (!response.headersSent) json(response, error.status ?? 500, { error: error.status ? error.message : '서버 처리 중 문제가 발생했습니다.' });
      else response.destroy();
      if (!error.status) console.error(error);
    }
  }

  const server = tls ? https.createServer(tls, handler) : http.createServer(handler);
  server.requestTimeout = 30_000;
  server.on('close', () => db.close());
  return server;
}

if (require.main === module) {
  const host = process.env.FANPLAY_HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 8080);
  const cert = process.env.FANPLAY_TLS_CERT;
  const key = process.env.FANPLAY_TLS_KEY;
  const publicOrigin = process.env.FANPLAY_PUBLIC_ORIGIN;
  if (Boolean(cert) !== Boolean(key)) throw new Error('TLS 인증서와 키를 함께 설정하세요.');
  const tls = cert && key ? { cert: readFileSync(cert), key: readFileSync(key) } : undefined;
  if (!tls && !['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('외부 인터페이스에서 로그인 서버를 실행하려면 TLS 인증서와 키를 설정하세요.');
  }
  if (publicOrigin && (!publicOrigin.startsWith('https://') || new URL(publicOrigin).origin !== publicOrigin)) {
    throw new Error('FANPLAY_PUBLIC_ORIGIN은 경로 없는 HTTPS 주소여야 합니다.');
  }
  createServer({ databasePath: process.env.FANPLAY_DATABASE, tls, publicOrigin }).listen(port, host, () => {
    const address = host.includes(':') ? `[${host}]` : host;
    console.log(`FANPLAY: ${tls ? 'https' : 'http'}://${address}:${port}`);
  });
}

module.exports = { createServer };
