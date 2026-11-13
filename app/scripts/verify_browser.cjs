const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const app = path.resolve(__dirname, '..');
const artifacts = path.join(app, 'artifacts');
const fixture = JSON.parse(fs.readFileSync(path.join(app, 'data/demo.json'), 'utf8'));

async function startServer() {
  const serverProcess = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1', '--directory', app]);
  const url = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => {
      serverProcess.kill();
      reject(new Error(`The local server did not start. ${output}`));
    }, 10000);
    serverProcess.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    serverProcess.stderr.on('data', chunk => { output += chunk; });
    serverProcess.on('error', error => { clearTimeout(timeout); reject(error); });
    serverProcess.on('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`The local server exited with ${code}. ${output}`));
    });
  });
  return { process: serverProcess, url };
}

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const server = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1040 }, deviceScaleFactor: 2 });
    const errors = [], outsideRequests = [], receipt = { checks: [], screenshots: [] };
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (!request.url().startsWith(`${server.url}/`)) outsideRequests.push(request.url());
    });
    const inside = (event, region) => event.x >= region.x0 && event.x <= region.x1 && event.y >= region.y0 && event.y <= region.y1;

    async function verifyMetrics() {
      const state = await page.evaluate(() => {
        const selected = document.querySelector('#pitch-current .selection');
        const number = attribute => Number(selected.getAttribute(attribute));
        const region = selected.hasAttribute('hidden') ? { x0: 0, y0: 0, x1: 100, y1: 100 } : {
          x0: number('x'), x1: number('x') + number('width'),
          y0: number('y') / .65, y1: (number('y') + number('height')) / .65,
        };
        return {
          player: document.getElementById('player').value,
          season: document.querySelector('[data-season][aria-pressed="true"]').dataset.season,
          reference: document.getElementById('reference').value,
          region,
        };
      });
      const sample = season => {
        const events = fixture.players.find(player => player.id === state.player).profiles.find(profile => profile.season === season).events.filter(event => inside(event, state.region));
        const passes = events.filter(event => event.type === 'pass');
        const shots = events.filter(event => event.type === 'shot');
        return { events: events.length, passes: passes.length, shots: shots.length,
          completed: passes.filter(event => event.complete).length,
          goals: shots.filter(event => event.goal).length, onTarget: shots.filter(event => event.onTarget).length };
      };
      const current = sample(state.season), reference = sample(state.reference);
      for (const [key, denominator] of [['completed', 'passes'], ['goals', 'shots'], ['onTarget', 'shots']]) {
        const row = page.locator(`[data-metric="${key}"]`);
        for (const [prefix, totals] of [['current', current], ['reference', reference]]) {
          assert.equal(Number(await row.getAttribute(`data-${prefix}-n`)), totals[key]);
          assert.equal(Number(await row.getAttribute(`data-${prefix}-d`)), totals[denominator]);
        }
        assert.deepEqual(await row.locator('.percentage').allTextContents(), [current, reference].map(totals => (
          totals[denominator] ? `${(100 * totals[key] / totals[denominator]).toFixed(1)}%` : '—'
        )));
      }
      return { state, current, reference };
    }

    async function capture(name, keepHover = false) {
      await page.mouse.move(5, 5);
      await page.locator(':focus').evaluateAll(nodes => nodes.forEach(node => node.blur()));
      if (!keepHover) await page.keyboard.press('Escape');
      await page.locator('#app').screenshot({ path: path.join(artifacts, name) });
      receipt.screenshots.push(name);
    }

    async function drag(id, start, end) {
      const bounds = await page.locator(id).boundingBox();
      await page.mouse.move(bounds.x + start[0] * bounds.width, bounds.y + start[1] * bounds.height);
      await page.mouse.down();
      await page.mouse.move(bounds.x + end[0] * bounds.width, bounds.y + end[1] * bounds.height, { steps: 10 });
      await page.mouse.up();
    }

    await page.goto(server.url);
    await page.locator('#metrics [data-metric="completed"]').waitFor();
    assert.match(await page.locator('.notice').innerText(), /Demo data/);
    assert.match(await page.locator('.footer').innerText(), /illustrative/);
    receipt.overview = await verifyMetrics();
    const scale = await page.locator('#heat-scale-max').innerText();
    const heat = id => page.locator(id).evaluate(canvas => canvas.toDataURL());
    const currentHeat = await heat('#heat-current');
    const referenceHeat = await heat('#heat-reference');
    const currentField = await page.locator('#field-current').boundingBox();
    const referenceField = await page.locator('#field-reference').boundingBox();
    const statistics = await page.locator('aside').boundingBox();
    assert.ok(Math.abs(currentField.y - referenceField.y) < 2);
    assert.ok(referenceField.x > currentField.x + currentField.width);
    assert.ok(statistics.x > referenceField.x + referenceField.width);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await capture('01_season_comparison.png');
    receipt.checks.push('Both pitches and the linked statistics fit the desktop layout.');

    await page.getByRole('button', { name: '2019/20', exact: true }).click();
    assert.notEqual(await heat('#heat-current'), currentHeat);
    assert.equal(await heat('#heat-reference'), referenceHeat);
    assert.equal(await page.locator('#heat-scale-max').innerText(), scale);
    receipt.changedSeason = await verifyMetrics();
    await capture('02_season_switch.png');
    receipt.checks.push('Season switching changes its heatmap and rates while keeping the reference and common scale.');

    await page.locator('#reference').selectOption('2017/18');
    assert.notEqual(await heat('#heat-reference'), referenceHeat);
    await verifyMetrics();
    await page.locator('#reference').selectOption('2019/20');
    assert.equal(await heat('#heat-current'), await heat('#heat-reference'));
    const equal = await verifyMetrics();
    assert.deepEqual(equal.current, equal.reference);
    receipt.checks.push('Reference switching updates its sample, and equal seasons produce equal maps and rates.');

    await page.locator('#reference').selectOption('2014/15');
    await page.getByRole('button', { name: '2024/25', exact: true }).click();
    await drag('#field-reference', [.60, .30], [.98, .70]);
    receipt.brushed = await verifyMetrics();
    assert.ok(receipt.brushed.current.events > 0 && receipt.brushed.current.events < receipt.overview.current.events);
    assert.equal(await page.locator('#region').inputValue(), 'custom');
    assert.equal(await page.locator('.selection:not([hidden])').count(), 2);
    for (const name of ['x', 'y', 'width', 'height']) {
      assert.equal(await page.locator('#pitch-current .selection').getAttribute(name), await page.locator('#pitch-reference .selection').getAttribute(name));
    }
    receipt.checks.push('An actual pointer brush selects the same coordinates in both maps and recalculates both sets of metrics.');

    const bounds = await page.locator('#field-current').boundingBox();
    await page.mouse.move(bounds.x + .85 * bounds.width, bounds.y + .55 * bounds.height);
    assert.match(await page.locator('#cell-place').innerText(), /Length 80–90%, width 50–60%/);
    assert.equal(await page.locator('.hover-cell:not([hidden])').count(), 2);
    assert.equal(await page.locator('#cell-details .cell-row').count(), 2);
    await capture('03_region_linking.png', true);
    receipt.checks.push('Hover links the matching local area and exposes both seasons’ counts.');

    await page.locator('#region').selectOption('attacking');
    await verifyMetrics();
    await page.getByRole('button', { name: 'Reset area' }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#region').inputValue(), 'whole');
    assert.equal(await page.locator('.selection:not([hidden])').count(), 0);
    await drag('#field-current', [.001, .001], [.045, .045]);
    const empty = await verifyMetrics();
    assert.equal(empty.current.events, 0);
    assert.equal(empty.reference.events, 0);
    assert.deepEqual(await page.locator('.percentage').allTextContents(), Array(6).fill('—'));
    assert.doesNotMatch(await page.locator('#app').innerText(), /NaN|Infinity/);
    receipt.checks.push('Presets and keyboard reset work, and an empty area shows missing-attempt dashes.');

    await page.locator('#player').selectOption('1');
    assert.equal(await page.locator('#region').inputValue(), 'whole');
    await verifyMetrics();
    assert.notEqual(await heat('#heat-current'), currentHeat);
    await page.getByRole('button', { name: '2019/20', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('button', { name: '2021/22', exact: true }).getAttribute('aria-pressed'), 'true');
    await verifyMetrics();
    receipt.checks.push('Player switching resets the area, and arrow keys navigate seasons.');

    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.locator('#region').selectOption('lower');
    await verifyMetrics();
    await page.screenshot({ path: path.join(artifacts, 'mobile.png'), fullPage: true });
    receipt.checks.push('The mobile layout fits 390 pixels and its controls still work.');

    const invalid = structuredClone(fixture);
    invalid.players[0].profiles[0].events[0].x = null;
    await page.route('**/data/demo.json', route => route.fulfill({ json: invalid }));
    await page.reload();
    await page.locator('#data-error:not([hidden])').waitFor();
    assert.match(await page.locator('#data-error').innerText(), /action 1 needs a valid x coordinate/);
    assert.equal(await page.locator('#player').isDisabled(), true);
    assert.equal(await page.locator('#metrics .metric').count(), 0);
    await page.unroute('**/data/demo.json');
    await page.reload();
    await page.locator('#metrics .metric').first().waitFor();
    assert.equal(await page.locator('#data-error').isVisible(), false);
    await verifyMetrics();
    receipt.checks.push('An invalid source record produces a visible error, disables comparison, and recovers with valid data.');
    assert.deepEqual(errors, []);
    assert.deepEqual(outsideRequests, []);
    receipt.checks.push('The modular application has no page errors or external network requests.');
    receipt.status = 'passed';
    fs.writeFileSync(path.join(artifacts, 'browser-verification.json'), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify({ status: receipt.status, checks: receipt.checks.length, screenshots: receipt.screenshots }));
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      server.process.kill();
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
