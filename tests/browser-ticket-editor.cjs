const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdirSync } = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../server.cjs');

async function verify() {
  const server = createServer({ databasePath: ':memory:' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE });
    const date = '2026-05-02';
    const stadium = '가상 야구장 이름이 아주 길어지는 모바일 줄바꿈 확인 구장';
    const home = '가상 홈 구단 이름이 아주 길어지는 경우';
    const away = '가상 원정 구단 이름이 아주 길어지는 경우';
    const files = [
      { date, stadium, home, away, homeScore: 3, awayScore: 7, time: '14:00' },
      { date, stadium, home, away, homeScore: 8, awayScore: 9, time: '18:30' }
    ];
    if(process.env.FANPLAY_TICKET_SCREENSHOTS)mkdirSync('qa',{recursive:true});
    for (const width of [320, 390, 768]) {
      const page = await browser.newPage({ viewport: { width, height: 820 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const form = page.locator('#ticket-form');
      const submit = form.locator('[type=submit]');
      const checkLayout = async step => {
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.match(await page.locator('.steps [aria-current="step"]').textContent(), new RegExp('^'+step+'\\.'));
        await submit.evaluate(element => element.scrollIntoView({ block: 'center' }));
        const bounds = await submit.boundingBox();
        const nav = await page.locator('.bottomnav').boundingBox();
        assert(bounds.height >= 44 && bounds.y + bounds.height <= nav.y + 1, JSON.stringify({width,step,bounds,nav}));
        if(process.env.FANPLAY_TICKET_SCREENSHOTS) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: `qa/ticket-after-${width}-${step}.png`, fullPage: true, style:'#toast { visibility:hidden }' });
        }
      };
      await page.goto('http://127.0.0.1:'+server.address().port+'/#create');
      await page.waitForFunction(() => !FP.account.checking);
      await form.locator('[name=date]').fill(date);
      await form.getByText('경기 결과 파일 불러오기', { exact: true }).click();
      await form.locator('[data-result-file]').setInputFiles({
        name: 'game-results.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(files))
      });
      await form.locator('[data-result-venue]').selectOption(stadium);
      await form.locator('[data-result-match]').nth(1).check();
      assert.equal(await form.locator('[name=hs]').inputValue(), '8');
      await checkLayout(1);
      await submit.click();
      await page.waitForFunction(() => document.activeElement?.id === 'ticket-step-title');
      await checkLayout(2);
      await form.getByText('티켓 스타일·색상·사진', { exact: true }).click();
      await form.locator('[name=color]').selectOption('blue');
      await form.locator('#ticket-preview .ticket.blue').waitFor();
      await form.locator('[data-action=decoration-all]').click();
      await form.locator('[data-action=decoration-info]').first().click();
      await form.locator('#decoration-info').filter({ hasText: '획득 조건' }).waitFor();
      await form.getByRole('button', { name: '경기 기록 수정' }).click();
      assert.equal(await form.locator('[name=home]').inputValue(), home);
      await form.locator('[name=hs]').fill('0');
      await submit.click();
      await form.locator('#ticket-preview .ticket.blue').waitFor();
      await submit.click();
      await checkLayout(3);
      await page.evaluate(() => {
        const save = FP.saveTicket;
        FP.saveTicket = async () => {
          FP.saveTicket = save;
          return new Promise(resolve => { window.finishFailedTicketSave = () => resolve(false); });
        };
      });
      await submit.click();
      await form.locator('[data-ticket-save-status][data-state=saving]').waitFor();
      assert(await submit.isDisabled());
      await page.evaluate(() => window.finishFailedTicketSave());
      await form.locator('[data-ticket-save-status][data-state=error]').waitFor();
      await form.locator('#ticket-preview .ticket.blue').waitFor();
      await submit.click();
      await page.waitForURL('**/#collection');
      assert.deepEqual(await page.evaluate(() => FP.data.tickets.map(t => [t.hs, t.as, t.color])), [[0, 9, 'blue']]);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS ${width}px ticket editor: file import, match choice, manual edit, decorations, stage focus, layout and retry`);
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
