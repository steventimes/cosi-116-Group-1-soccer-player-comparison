import { summarize } from './model.js';
import { loadSourceDataset } from './sources/load-dataset.js';

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

const validSeason = (season) =>
  typeof season === 'string' &&
  season.trim().length > 0 &&
  /[\p{L}\p{N}]/u.test(season);

export function validateDataset(data) {
  requireValue(
    data && typeof data === 'object' && !Array.isArray(data),
    'The data file must contain a dataset.',
  );
  requireValue(
    typeof data.kind === 'string' &&
      (data.kind === 'observed events' ||
        data.kind.toLowerCase().includes('illustrative')),
    'The data kind must identify observed events or explicitly illustrative data.',
  );
  requireValue(
    Array.isArray(data.seasons) && data.seasons.length > 0,
    'No samples were supplied.',
  );
  const seasons = new Set();
  for (const season of data.seasons) {
    requireValue(
      validSeason(season),
      'A sample label must contain a meaningful name.',
    );
    requireValue(
      !seasons.has(season),
      `Sample ${season} appears more than once.`,
    );
    seasons.add(season);
  }

  requireValue(
    Array.isArray(data.players) && data.players.length > 0,
    'No players were supplied.',
  );
  const players = new Set();
  for (const player of data.players) {
    requireValue(
      player && typeof player === 'object',
      'A player record is missing.',
    );
    requireValue(
      typeof player.id === 'string' && player.id.trim(),
      'A player identifier is missing.',
    );
    requireValue(
      !players.has(player.id),
      `Player identifier ${player.id} appears more than once.`,
    );
    players.add(player.id);
    requireValue(
      typeof player.name === 'string' && player.name.trim(),
      `Player ${player.id} has no name.`,
    );
    requireValue(
      Array.isArray(player.profiles) && player.profiles.length > 0,
      `${player.name} has no sample records.`,
    );

    // Profiles are sparse by season. A missing profile differs from a present profile with no events.
    const seenSeasons = new Set();
    for (const profile of player.profiles) {
      requireValue(
        profile && seasons.has(profile.season),
        `${player.name} has an unknown sample.`,
      );
      const context = `${player.name}, ${profile.season}`;
      requireValue(
        !seenSeasons.has(profile.season),
        `${context} appears more than once.`,
      );
      seenSeasons.add(profile.season);
      const unloaded =
        profile.loadState === 'not loaded' || profile.loadState === 'loading';
      requireValue(
        unloaded ? profile.events === null : Array.isArray(profile.events),
        `${context} has no action list.`,
      );
      if (unloaded) {
        requireValue(
          data.kind === 'observed events' &&
            profile.summary &&
            Number.isInteger(profile.summary.retainedEvents) &&
            profile.summary.retainedEvents >= 0,
          `${context} needs an indexed event count.`,
        );
        requireValue(
          Number.isInteger(profile.summary.matches) &&
            profile.summary.matches >= 0 &&
            Array.isArray(profile.summary.matchIds) &&
            profile.summary.matches === profile.summary.matchIds.length,
          `${context} needs indexed match coverage.`,
        );
        continue;
      }
      if (profile.coverage !== undefined) {
        requireValue(
          profile.coverage && typeof profile.coverage === 'object',
          `${context} has invalid coverage metadata.`,
        );
        requireValue(
          Number.isInteger(profile.coverage.matches) &&
            profile.coverage.matches >= 0,
          `${context} needs a non-negative match count.`,
        );
        requireValue(
          Array.isArray(profile.coverage.matchIds) &&
            profile.coverage.matchIds.every((id) => typeof id === 'string'),
          `${context} needs a list of match identifiers.`,
        );
        requireValue(
          typeof profile.coverage.note === 'string',
          `${context} needs a coverage note.`,
        );
        requireValue(
          profile.coverage.matches === profile.coverage.matchIds.length,
          `${context} match count does not match its match identifiers.`,
        );
        if (profile.coverage.unknownPasses !== undefined) {
          requireValue(
            Number.isInteger(profile.coverage.unknownPasses) &&
              profile.coverage.unknownPasses >= 0,
            `${context} has an invalid unknown-pass count.`,
          );
        }
      }
      if (data.kind === 'observed events') {
        requireValue(
          profile.coverage,
          `${context} needs explicit match coverage.`,
        );
        requireValue(
          Number.isInteger(profile.coverage.unknownPasses),
          `${context} needs an explicit unknown-pass count.`,
        );
      }

      let unknownPasses = 0;
      const eventIds = new Set();
      profile.events.forEach((event, index) => {
        const where = `${context}, action ${index + 1}`;
        requireValue(
          event && ['pass', 'shot', 'other'].includes(event.type),
          `${where} has an unknown action type.`,
        );
        for (const coordinate of ['x', 'y']) {
          requireValue(
            typeof event[coordinate] === 'number' &&
              Number.isFinite(event[coordinate]) &&
              event[coordinate] >= 0 &&
              event[coordinate] <= 100,
            `${where} needs a valid ${coordinate} coordinate from 0% to 100%.`,
          );
        }
        if (event.id !== undefined) {
          requireValue(
            typeof event.id === 'string' && event.id.trim(),
            `${where} has an empty action identifier.`,
          );
          requireValue(
            !eventIds.has(event.id),
            `${context} repeats action identifier ${event.id}.`,
          );
          eventIds.add(event.id);
        }
        if (event.matchId !== undefined)
          requireValue(
            typeof event.matchId === 'string',
            `${where} has an invalid match identifier.`,
          );
        if (event.matchDate !== undefined)
          requireValue(
            typeof event.matchDate === 'string',
            `${where} has an invalid match date.`,
          );
        if (event.minute !== undefined)
          requireValue(
            typeof event.minute === 'number' &&
              Number.isFinite(event.minute) &&
              event.minute >= 0,
            `${where} has an invalid minute.`,
          );
        if (event.second !== undefined)
          requireValue(
            typeof event.second === 'number' &&
              Number.isFinite(event.second) &&
              event.second >= 0 &&
              event.second < 60,
            `${where} has an invalid second.`,
          );
        if (event.type === 'pass')
          requireValue(
            typeof event.complete === 'boolean' || event.complete === null,
            `${where} has no passing outcome.`,
          );
        if (event.type === 'pass' && event.complete === null)
          unknownPasses += 1;
        if (event.type === 'shot') {
          requireValue(
            typeof event.goal === 'boolean' &&
              (typeof event.onTarget === 'boolean' || event.onTarget === null),
            `${where} has no shooting outcome.`,
          );
          requireValue(
            !event.goal || event.onTarget === true,
            `${where} marks a goal as off target.`,
          );
        }
      });
      if (profile.summary) {
        const totals = summarize(profile.events);
        const fields = {
          retainedEvents: 'n',
          passes: 'passes',
          knownPasses: 'knownPasses',
          completedPasses: 'completed',
          unknownPasses: 'unknownPasses',
          shots: 'shots',
          goals: 'goals',
          shotsOnTarget: 'onTarget',
        };
        for (const [field, total] of Object.entries(fields)) {
          requireValue(
            profile.summary[field] === totals[total],
            `${context} indexed ${field} does not match its events.`,
          );
        }
        if (profile.summary.unknownShotTargets !== undefined) {
          requireValue(
            profile.summary.unknownShotTargets === totals.unknownShotTargets,
            `${context} indexed unknownShotTargets does not match its events.`,
          );
        }
        requireValue(
          profile.summary.otherActions ===
            totals.n - totals.passes - totals.shots,
          `${context} indexed otherActions does not match its events.`,
        );
        requireValue(
          profile.summary.matches === profile.coverage.matches &&
            profile.summary.matchIds.join(',') ===
              profile.coverage.matchIds.join(','),
          `${context} indexed matches do not match its coverage.`,
        );
      }
      // Preserve source coverage counts while checking them against retained Unknown passes.
      if (profile.coverage?.unknownPasses !== undefined) {
        requireValue(
          profile.coverage.unknownPasses === unknownPasses,
          `${context} unknown-pass count does not match its events.`,
        );
      }
    }
  }
  if (data.metadata !== undefined) {
    requireValue(
      data.metadata && typeof data.metadata === 'object',
      'Dataset metadata must be an object.',
    );
    if (data.metadata.coverageNote !== undefined)
      requireValue(
        typeof data.metadata.coverageNote === 'string',
        'The dataset coverage note must be text.',
      );
  }
  if (data.kind === 'observed events') {
    const metadata = data.metadata;
    requireValue(
      typeof metadata?.source === 'string' && metadata.source,
      'Observed data needs a named source.',
    );
    requireValue(
      typeof metadata.sourceUrl === 'string' &&
        metadata.sourceUrl.startsWith('https://'),
      'Observed data needs a secure source URL.',
    );
    requireValue(
      typeof metadata.commit === 'string' && metadata.commit,
      'Observed data needs a pinned source commit.',
    );
    requireValue(
      typeof metadata.coverageNote === 'string' && metadata.coverageNote,
      'Observed data needs an explicit coverage note.',
    );
  }
  return data;
}

export async function loadDataset(options) {
  return validateDataset(await loadSourceDataset(options));
}
