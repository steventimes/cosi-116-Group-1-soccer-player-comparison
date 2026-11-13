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

export function isWholeField(region) {
  return region.x0 === 0 && region.y0 === 0 && region.x1 === 100 && region.y1 === 100;
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
