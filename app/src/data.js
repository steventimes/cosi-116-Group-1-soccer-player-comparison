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

export async function loadDataset() {
  const response = await fetch(new URL('../data/demo.json', import.meta.url), {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`The data file could not be read (${response.status}).`);
  return validateDataset(await response.json());
}
