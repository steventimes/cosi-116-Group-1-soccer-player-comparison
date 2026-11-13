import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, density, inside, summarize, validateDataset } from '../src/model.js';

function fixture() {
  return {
    kind: 'illustrative fixture',
    seasons: ['2024/25'],
    players: [{
      id: 'a', name: 'Player A', profiles: [{
        season: '2024/25',
        events: [
          { id: 'p1', type: 'pass', x: 25, y: 20, complete: true },
          { id: 'p2', type: 'pass', x: 50, y: 50, complete: false },
          { id: 's1', type: 'shot', x: 90, y: 50, goal: true, onTarget: true },
          { id: 's2', type: 'shot', x: 80, y: 50, goal: false, onTarget: false },
          { id: 'o1', type: 'other', x: 0, y: 100 },
        ],
      }],
    }],
  };
}

test('passing and shooting use their own attempted-action denominators', () => {
  const data = validateDataset(fixture());
  assert.deepEqual(summarize(data.players[0].profiles[0].events), {
    n: 5, passes: 2, completed: 1, shots: 2, goals: 1, onTarget: 1,
  });
  const shots = data.players[0].profiles[0].events.filter(event => inside(event, AREAS.attacking));
  assert.deepEqual(summarize(shots), { n: 2, passes: 0, completed: 0, shots: 2, goals: 1, onTarget: 1 });
  assert.deepEqual(summarize([]), { n: 0, passes: 0, completed: 0, shots: 0, goals: 0, onTarget: 0 });
});

test('density is normalized across field boundaries and is finite for an empty sample', () => {
  const grid = density([{ x: 0, y: 0 }, { x: 100, y: 100 }]);
  assert.ok(grid.every(Number.isFinite));
  assert.ok(Math.abs(grid.reduce((sum, value) => sum + value, 0) - 100) < 1e-10);
  assert.ok(grid[0] > 0 && grid.at(-1) > 0);
  assert.ok(density([]).every(value => value === 0));
});

test('missing and invalid data are rejected with the location instead of being discarded', () => {
  for (const invalid of [null, -1, 101, NaN, '20']) {
    const data = fixture();
    data.players[0].profiles[0].events[0].x = invalid;
    assert.throws(() => validateDataset(data), /Player A, 2024\/25, action 1 needs a valid x coordinate/);
  }
  const missing = fixture();
  delete missing.players[0].profiles[0].events[0].complete;
  assert.throws(() => validateDataset(missing), /has no passing outcome/);
  const profile = fixture();
  profile.players[0].profiles = [];
  assert.throws(() => validateDataset(profile), /missing the 2024\/25 record/);
});

test('known identifiers and outcomes retain their consistency checks', () => {
  const duplicated = fixture();
  duplicated.players[0].profiles[0].events[1].id = 'p1';
  assert.throws(() => validateDataset(duplicated), /repeats action identifier p1/);
  const impossible = fixture();
  impossible.players[0].profiles[0].events[2].onTarget = false;
  assert.throws(() => validateDataset(impossible), /marks a goal as off target/);
  const repeatedSeason = fixture();
  repeatedSeason.players[0].profiles.push(repeatedSeason.players[0].profiles[0]);
  assert.throws(() => validateDataset(repeatedSeason), /2024\/25 appears more than once/);
  const sameCoordinates = fixture();
  sameCoordinates.players[0].profiles[0].events[1].x = 25;
  sameCoordinates.players[0].profiles[0].events[1].y = 20;
  assert.equal(validateDataset(sameCoordinates), sameCoordinates);
});
