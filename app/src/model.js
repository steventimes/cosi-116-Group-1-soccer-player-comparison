export const GRID_WIDTH = 40;
export const GRID_HEIGHT = 26;
export const WHOLE_FIELD = { x0: 0, y0: 0, x1: 100, y1: 100 };
export const AREAS = {
  whole: WHOLE_FIELD,
  defensive: { x0: 0, y0: 0, x1: 100 / 3, y1: 100 },
  middle: { x0: 100 / 3, y0: 0, x1: 200 / 3, y1: 100 },
  attacking: { x0: 200 / 3, y0: 0, x1: 100, y1: 100 },
  upper: { x0: 0, y0: 0, x1: 100, y1: 20 },
  lower: { x0: 0, y0: 80, x1: 100, y1: 100 },
};

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

/** Reject an invalid dataset at the file boundary without silently dropping records. */
export function validateDataset(data) {
  requireValue(data && typeof data === 'object', 'The data file must contain a dataset.');
  requireValue(
    typeof data.kind === 'string' && data.kind.includes('illustrative'),
    'This prototype requires explicitly illustrative data.',
  );
  requireValue(Array.isArray(data.seasons) && data.seasons.length > 0, 'No seasons were supplied.');
  const seasons = new Set();
  for (const season of data.seasons) {
    requireValue(typeof season === 'string' && /^\d{4}\/\d{2}$/.test(season), 'A season must use the form 2024/25.');
    requireValue(!seasons.has(season), `Season ${season} appears more than once.`);
    seasons.add(season);
  }
  requireValue(Array.isArray(data.players) && data.players.length > 0, 'No players were supplied.');
  const players = new Set();
  for (const player of data.players) {
    requireValue(player && typeof player === 'object', 'A player record is missing.');
    requireValue(typeof player.id === 'string' && player.id.trim(), 'A player identifier is missing.');
    requireValue(!players.has(player.id), `Player identifier ${player.id} appears more than once.`);
    players.add(player.id);
    requireValue(typeof player.name === 'string' && player.name.trim(), `Player ${player.id} has no name.`);
    requireValue(Array.isArray(player.profiles), `${player.name} has no season records.`);
    const seenSeasons = new Set();
    for (const profile of player.profiles) {
      requireValue(profile && seasons.has(profile.season), `${player.name} has an unknown season.`);
      const context = `${player.name}, ${profile.season}`;
      requireValue(!seenSeasons.has(profile.season), `${context} appears more than once.`);
      seenSeasons.add(profile.season);
      requireValue(Array.isArray(profile.events), `${context} has no action list.`);
      const eventIds = new Set();
      profile.events.forEach((event, index) => {
        const where = `${context}, action ${index + 1}`;
        requireValue(event && ['pass', 'shot', 'other'].includes(event.type), `${where} has an unknown action type.`);
        for (const coordinate of ['x', 'y']) {
          requireValue(
            typeof event[coordinate] === 'number' && Number.isFinite(event[coordinate]) && event[coordinate] >= 0 && event[coordinate] <= 100,
            `${where} needs a valid ${coordinate} coordinate from 0% to 100%.`,
          );
        }
        if (event.id !== undefined) {
          requireValue(typeof event.id === 'string' && event.id.trim(), `${where} has an empty action identifier.`);
          requireValue(!eventIds.has(event.id), `${context} repeats action identifier ${event.id}.`);
          eventIds.add(event.id);
        }
        if (event.type === 'pass') {
          requireValue(typeof event.complete === 'boolean', `${where} has no passing outcome.`);
        }
        if (event.type === 'shot') {
          requireValue(typeof event.goal === 'boolean' && typeof event.onTarget === 'boolean', `${where} has no shooting outcome.`);
          requireValue(!event.goal || event.onTarget, `${where} marks a goal as off target.`);
        }
      });
    }
    for (const season of seasons) {
      requireValue(seenSeasons.has(season), `${player.name} is missing the ${season} record.`);
    }
  }
  return data;
}

export function inside(event, region) {
  return event.x >= region.x0 && event.x <= region.x1 && event.y >= region.y0 && event.y <= region.y1;
}

export function summarize(events) {
  const totals = { n: events.length, passes: 0, completed: 0, shots: 0, goals: 0, onTarget: 0 };
  for (const event of events) {
    if (event.type === 'pass') {
      totals.passes += 1;
      if (event.complete) totals.completed += 1;
    } else if (event.type === 'shot') {
      totals.shots += 1;
      if (event.goal) totals.goals += 1;
      if (event.onTarget) totals.onTarget += 1;
    }
  }
  return totals;
}

export function density(events) {
  const bins = Array(GRID_WIDTH * GRID_HEIGHT).fill(0);
  const grid = Array(GRID_WIDTH * GRID_HEIGHT).fill(0);
  for (const event of events) {
    const x = Math.min(GRID_WIDTH - 1, Math.floor(event.x / 100 * GRID_WIDTH));
    const y = Math.min(GRID_HEIGHT - 1, Math.floor(event.y / 100 * GRID_HEIGHT));
    bins[y * GRID_WIDTH + x] += 1;
  }
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      if (!bins[y * GRID_WIDTH + x]) continue;
      for (let dy = -3; dy <= 3; dy += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && xx < GRID_WIDTH && yy >= 0 && yy < GRID_HEIGHT) {
            grid[yy * GRID_WIDTH + xx] += bins[y * GRID_WIDTH + x] * Math.exp(-(dx * dx + dy * dy) / (2 * 1.15 * 1.15));
          }
        }
      }
    }
  }
  const total = grid.reduce((sum, value) => sum + value, 0);
  return total ? grid.map(value => 100 * value / total) : grid;
}

export function densityIndex(data) {
  const grids = new Map();
  let maximum = 0;
  for (const player of data.players) {
    for (const profile of player.profiles) {
      const grid = density(profile.events);
      grids.set(`${player.id}_${profile.season}`, grid);
      maximum = Math.max(maximum, ...grid);
    }
  }
  return { grids, maximum };
}
