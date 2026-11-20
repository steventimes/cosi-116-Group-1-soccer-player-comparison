const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs/promises');
const path = require('path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const cache = process.env.SOURCE_CACHE;
const artifacts = process.env.ARTIFACT_DIR || path.join(root, 'app/artifacts');
if (!cache) throw new Error('Set SOURCE_CACHE to the verified match cache directory.');
(async () => {
  await fs.mkdir(artifacts, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const index = JSON.parse(await fs.readFile(path.join(root, 'app/data/source-index.json'), 'utf8'));
  let failIniesta = false;
  await page.route('https://**/*', async route => {
    const source = index.matches.find(m => (m.eventUrl ?? `${index.rawBaseUrl}/${m.eventPath}`) === route.request().url());
    if (!source || (failIniesta && source.season === '2018 World Cup')) return route.fulfill({ status: 503, body: 'Controlled unavailable source' });
    try {
      return await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: await fs.readFile(path.join(cache, source.eventPath)) });
    } catch { return route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: 'Not cached' }); }
  });
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:8000');
  await page.locator('#coverage-current').getByText(/1546 located actions/).waitFor();
  assert.equal(await page.locator('#coverage-current').getAttribute('data-coverage-state'), 'available');
  assert.match(await page.locator('#coverage-reference').innerText(), /366 located actions/);
  await page.screenshot({ path: path.join(artifacts, 'coverage-real-profiles.png'), fullPage: true });
  console.log('PASS default real Messi/Ronaldo profiles, source, match IDs, diagnostics');

  failIniesta = true;
  await page.selectOption('#player-current', '5216');
  await page.locator('#error-current').waitFor({ state: 'visible' });
  assert.match(await page.locator('#error-current').innerText(), /Load failed for Andres Iniesta/);
  assert.match(await page.locator('#current-label').innerText(), /Lionel Messi/);
  assert.equal(await page.locator('#error-current').getAttribute('data-coverage-state'), 'load-failure');
  failIniesta = false;
  await page.click('#retry-current');
  await page.locator('#coverage-current').getByText(/377 located actions/).waitFor();
  assert.equal(await page.locator('#coverage-current').getAttribute('data-coverage-state'), 'partial');
  assert.match(await page.locator('#coverage-current').innerText(), /7576, 7582/);
  await page.selectOption('#region', 'attacking');
  assert.match(await page.locator('#stats-scope').innerText(), /Selected area/);
  await page.click('#clear');
  assert.equal(await page.locator('#stats-scope').innerText(), 'Whole field');
  await page.fill('#player-search', 'Iniesta');
  assert.equal(await page.locator('#overview-body tr').count(), 1);
  await page.screenshot({ path: path.join(artifacts, 'coverage-partial-profile.png'), fullPage: true });
  console.log('PASS failure retains previous comparison, Retry succeeds, partial match IDs, selection/reset, search');

  await page.fill('#player-search', 'Messi 2014');
  await page.locator('#overview-body tr').getByRole('button', { name: 'Compare B' }).click();
  await page.locator('#coverage-reference').getByText(/524 located actions/).waitFor();
  assert.match(await page.locator('#coverage-reference').innerText(), /HuffPost \/ Opta/);
  console.log('PASS real 2014 HuffPost/Opta profile and diagnostics');

  const result = await page.evaluate(async () => {
    const { addToProfiles, emptyStats } = await import('/app/src/sources/load-dataset.js');
    const { renderCoverage } = await import('/app/src/coverage.js');
    const { default: idx } = await import('/app/data/source-index.json', { with: { type: 'json' } });
    const m = idx.matches.find(m => m.season === '2018 World Cup' && m.matchId === '7576');
    const profiles = new Map([['5216', new Map()]]);
    const raw = { id: 'controlled', player: { id: 5216 }, period: 1, location: [60, 40], type: { name: 'Pass' } };
    addToProfiles(profiles, new Map([[m.season, emptyStats()]]), m, [raw, raw, { ...raw, id: 'invalid', location: [121, 20] }, { ...raw, id: 'unknown', location: undefined }], new Set(), new Set(['5216']));
    const p = profiles.get('5216').get(m.season);
    renderCoverage(document.getElementById('coverage-current'), p);
    return { count: p.events.length, text: document.getElementById('coverage-current').innerText };
  });
  assert.equal(result.count, 1);
  assert.match(result.text, /duplicate identifiers: 1/);
  assert.match(result.text, /invalid coordinates: 1/);
  assert.match(result.text, /missing locations: 1/);
  console.log('PASS controlled loader input shows duplicate, invalid and missing-location counts in page');
  await page.evaluate(async () => {
    const { renderCoverage } = await import('/app/src/coverage.js');
    renderCoverage(document.getElementById('coverage-current'), { events: [], coverage: { includedMatchIds: ['controlled-missing-location-case'] } });
  });
  assert.equal(await page.locator('#coverage-current').getAttribute('data-coverage-state'), 'missing-location');
  assert.match(await page.locator('#coverage-current').innerText(), /No location records are available to plot/);
  console.log('PASS controlled no-location profile explains absence on screen');
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await page.locator('#coverage-current').boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
  console.log('PASS coverage messages fit a 390px viewport');
  assert.deepEqual(errors, []);
  await browser.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
