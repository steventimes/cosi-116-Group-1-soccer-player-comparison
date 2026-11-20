import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { convertStatsBombEvent } from '../src/sources/statsbomb.js';
import { convertHuffPostEvent } from '../src/sources/huffpost.js';
import { emptyStats, addToProfiles, loadSourceDataset } from '../src/sources/load-dataset.js';
import { validateDataset } from '../src/data.js';
import { coverageStatus, coverageText } from '../src/coverage.js';
import index from '../data/source-index.json' with { type: 'json' };

const match = index.matches.find(m => m.season === '2022 World Cup' && index.players.find(p => p.id === '5503').profiles.find(p => p.season === m.season).summary.matchIds.includes(m.matchId));
const event = (overrides = {}) => ({ id: 'test-event', player: { id: 5503 }, period: 1, minute: 1, second: 2, location: [60, 40], type: { name: 'Pass' }, ...overrides });

test('StatsBomb percentages and orientation are stable across halves', () => {
  for (const period of [1, 2, 3, 4]) {
    const action = convertStatsBombEvent(event({ period, location: [90, 20] }), match, emptyStats(), new Set());
    assert.deepEqual([action.x, action.y, action.complete], [75, 25, true]);
  }
});
test('rejects malformed, non-finite and out-of-range coordinates without clamping', () => {
  for (const location of [[121, 10], [-1, 10], [10, 81], [NaN, 20], ['60', 20], [10], {}]) {
    const stats = emptyStats();
    assert.equal(convertStatsBombEvent(event({ location }), match, stats, new Set()), null);
    assert.equal(stats.invalidLocation, 1);
  }
  const stats = emptyStats();
  assert.equal(convertStatsBombEvent(event({ location: undefined }), match, stats, new Set()), null);
  assert.equal(stats.missingLocation, 1);
});
test('repeated supplied IDs are rejected even after an invalid first record', () => {
  const stats = emptyStats(), seen = new Set();
  convertStatsBombEvent(event({ location: [130, 20] }), match, stats, seen);
  assert.equal(convertStatsBombEvent(event(), match, stats, seen), null);
  assert.equal(stats.duplicateEvents, 1);
  assert.equal(stats.invalidLocation, 1);
  assert.ok(convertStatsBombEvent(event(), { ...match, matchId: 'other-match' }, stats, seen));
});
test('unknown pass outcomes remain explicit; unclassified shots are counted as exclusions', () => {
  const stats = emptyStats();
  assert.equal(convertStatsBombEvent(event({ pass: { outcome: { name: 'Unknown' } } }), match, stats, new Set()).complete, null);
  assert.equal(convertStatsBombEvent(event({ type: { name: 'Shot' }, shot: {} }), match, stats, new Set()), null);
  assert.equal(stats.unknownPasses, 1);
  assert.equal(stats.unknownShotOutcomes, 1);
});
test('Opta uses x directly and inverts y; saved/blocked ambiguity stays unknown', () => {
  for (const period of ['1', '2', '3', '4']) {
    const action = convertHuffPostEvent({ id: 'opta', period, type: '15', x: 90, y: 20, min: 2, sec: 3 }, match, emptyStats(), new Set());
    assert.deepEqual([action.x, action.y, action.onTarget, action.goal], [90, 80, null, false]);
  }
});
test('Opta duplicate, invalid, missing ID and missing position counts are separate', () => {
  const stats = emptyStats(), seen = new Set();
  const base = { id: 'opta', period: '1', type: '1', x: 50, y: 40, outcome: '1' };
  convertHuffPostEvent(base, match, stats, seen);
  assert.equal(convertHuffPostEvent(base, match, stats, seen), null);
  convertHuffPostEvent({ ...base, id: 'bad', x: '50' }, match, stats, seen);
  convertHuffPostEvent({ ...base, id: 'missing', x: null }, match, stats, seen);
  convertHuffPostEvent({ ...base, id: ' ' }, match, stats, seen);
  assert.deepEqual([stats.duplicateEvents, stats.invalidLocation, stats.missingLocation, stats.missingEventId], [1, 1, 1, 1]);
});
test('a match with no usable locations still has a loaded profile and diagnostics', () => {
  const profiles = new Map([['5503', new Map()]]), stats = new Map([[match.season, emptyStats()]]);
  addToProfiles(profiles, stats, match, [event({ location: undefined })], new Set(), new Set(['5503']));
  const p = profiles.get('5503').get(match.season);
  assert.deepEqual(p.events, []);
  assert.deepEqual(p.coverage.includedMatchIds, [match.matchId]);
  assert.equal(p.coverage.validation.missingLocation, 1);
  assert.equal(coverageStatus(p), 'missing-location');
});
test('invalid event containers fail clearly at the loading boundary', () => {
  assert.throws(() => addToProfiles(new Map([['5503', new Map()]]), new Map([[match.season, emptyStats()]]), match, [null], new Set(), new Set(['5503'])), /invalid event record/);
});
test('coverage separates complete indexed appearances, partial, missing and failure', () => {
  const p = { events: [{}], summary: { matches: 2 } };
  assert.equal(coverageStatus(p), 'partial');
  p.appearanceCoverage = { selectedAppearances: 2, expectedAppearances: 2, missingAppearances: 0 };
  assert.equal(coverageStatus(p), 'available');
  assert.match(coverageText(p), /indexed expected appearances/);
  assert.equal(coverageStatus({ ...p, events: [] }), 'missing-location');
  assert.equal(coverageStatus({ ...p, loadState: 'failed' }), 'load-failure');
});
test('loader rejects HTTP failures and hash mismatch before parsing', async () => {
  const options = { season: match.season, playerIds: ['5503'], retry: true };
  await assert.rejects(loadSourceDataset({ ...options, fetchImpl: async () => new Response('unavailable', { status: 503 }) }), /HTTP 503/);
  await assert.rejects(loadSourceDataset({ ...options, fetchImpl: async () => new Response('[]') }), /SHA-256 mismatch/);
});

const cache = process.env.SOURCE_CACHE;
for (const [playerId, season] of [['5503', '2022 World Cup'], ['5207', '2022 World Cup'], ['5216', '2018 World Cup'], ['5503', '2014 World Cup']]) {
  test(`verified real profile: ${playerId}, ${season}`, { skip: !cache }, async () => {
    let requests = 0;
    const fetchImpl = async url => {
      requests++;
      const source = index.matches.find(m => (m.eventUrl ?? `${index.rawBaseUrl}/${m.eventPath}`) === url);
      return new Response(await readFile(`${cache}/${source.eventPath}`));
    };
    const options = { season, playerIds: [playerId], fetchImpl };
    const data = validateDataset(await loadSourceDataset(options));
    const profile = data.players.find(p => p.id === playerId).profiles.find(p => p.season === season);
    assert.equal(profile.events.length, profile.summary.retainedEvents);
    assert.equal(profile.coverage.includedMatchIds.length, profile.summary.matches);
    assert.ok(profile.coverage.validation.sourcePlayerEvents >= profile.events.length);
    const first = requests;
    await loadSourceDataset(options);
    assert.equal(requests, first);
    await loadSourceDataset({ ...options, retry: true });
    assert.equal(requests, first * 2);
    console.log(`${playerId} ${season}: ${profile.events.length} located actions; ${coverageText(profile)}`);
  });
}
