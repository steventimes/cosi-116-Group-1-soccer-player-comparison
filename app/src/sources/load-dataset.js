import sourceIndex from '../../data/source-index.json' with { type: 'json' };
import { convertStatsBombEvent } from './statsbomb.js';
import { convertHuffPostEvent } from './huffpost.js';

const PROFILE_MATCH_IDS = new Map(
  sourceIndex.players.map((player) => [
    player.id,
    new Map(
      player.profiles.map((profile) => [
        profile.season,
        new Set(profile.summary.matchIds),
      ]),
    ),
  ]),
);
const HUFFPOST_PLAYER_IDS = new Map(
  sourceIndex.seasons.map((season) => [
    season,
    new Map(
      sourceIndex.players.flatMap((player) =>
        player.profiles
          .filter(
            (profile) => profile.season === season && profile.providerPlayerId,
          )
          .map((profile) => [profile.providerPlayerId, player.id]),
      ),
    ),
  ]),
);
const REQUEST_TIMEOUT_MS = 30000;
const MAX_CONCURRENCY = 2;

function sha256Hex(bytes) {
  return crypto.subtle
    .digest('SHA-256', bytes)
    .then((digest) =>
      [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(''),
    );
}

function requestSignal(parentSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () =>
      controller.abort(
        new DOMException('Source request timed out.', 'TimeoutError'),
      ),
    REQUEST_TIMEOUT_MS,
  );
  const abort = () =>
    controller.abort(
      parentSignal.reason ||
        new DOMException('Loading was cancelled.', 'AbortError'),
    );
  if (parentSignal) {
    if (parentSignal.aborted) abort();
    else parentSignal.addEventListener('abort', abort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', abort);
    },
  };
}

export function emptyStats() {
  return {
    sourcePlayerEvents: 0,
    retainedEvents: 0,
    missingEventId: 0,
    missingLocation: 0,
    invalidLocation: 0,
    duplicateEvents: 0,
    unknownPasses: 0,
    unknownShotOutcomes: 0,
    nonSpatialEvents: 0,
    ownGoalExcluded: 0,
    shootoutExcluded: 0,
    unknownShotTargets: 0,
  };
}

function emptyProfiles() {
  return new Map(sourceIndex.players.map((player) => [player.id, new Map()]));
}

export function addToProfiles(
  profiles,
  statsBySeason,
  match,
  events,
  seen,
  playerIds,
) {
  const huffPost = match.sourceId === 'huffpost-opta';
  const convertEvent = huffPost ? convertHuffPostEvent : convertStatsBombEvent;
  const seasonStats = statsBySeason.get(match.season);
  const retainedPlayerIds = new Set();
  for (const playerId of playerIds) {
    if (!PROFILE_MATCH_IDS.get(playerId)?.get(match.season)?.has(match.matchId))
      continue;
    const playerProfiles = profiles.get(playerId);
    if (!playerProfiles.has(match.season)) {
      playerProfiles.set(match.season, {
        season: match.season,
        coverage: {
          matches: 0,
          matchIds: [],
          includedMatchIds: [],
          note: 'Partial sample',
          unknownPasses: 0,
          validation: emptyStats(),
        },
        events: [],
      });
    }
    playerProfiles.get(match.season).coverage.includedMatchIds.push(match.matchId);
  }
  for (const event of events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new Error(`Match ${match.matchId} contains an invalid event record.`);
    }
    const playerId = huffPost
      ? HUFFPOST_PLAYER_IDS.get(match.season)?.get(event.player_id)
      : String(event.player?.id ?? '');
    if (!playerIds.has(playerId)) continue;
    // Additional focus-player matches do not expand another player's partial sample.
    if (!PROFILE_MATCH_IDS.get(playerId)?.get(match.season)?.has(match.matchId))
      continue;
    // StatsBomb excludes shootouts before counting source-player events. Opta counts
    // them as explicit exclusions inside its converter, preserving the source contracts.
    if (!huffPost && Number(event.period) >= 5) continue;
    const stats = profiles.get(playerId).get(match.season).coverage.validation;
    const before = { ...stats };
    const action = convertEvent(event, match, stats, seen);
    for (const key of Object.keys(stats))
      seasonStats[key] += stats[key] - before[key];
    if (!action) continue;
    const playerProfiles = profiles.get(playerId);
    const profile = playerProfiles.get(match.season);
    profile.events.push(action);
    retainedPlayerIds.add(playerId);
    if (action.type === 'pass' && action.complete === null)
      profile.coverage.unknownPasses += 1;
  }
  for (const playerId of retainedPlayerIds) {
    profiles
      .get(playerId)
      .get(match.season)
      .coverage.matchIds.push(match.matchId);
  }
}

async function fetchVerifiedMatch(match, fetchImpl, parentSignal) {
  const huffPost = match.sourceId === 'huffpost-opta';
  if (match.sourceId && !huffPost && match.sourceId !== 'statsbomb') {
    throw new Error(`Unknown match source ${match.sourceId}.`);
  }
  const provider = huffPost ? 'HuffPost/Opta' : 'StatsBomb';
  if (
    huffPost &&
    (typeof match.eventUrl !== 'string' ||
      !match.eventUrl.startsWith('https://'))
  ) {
    throw new Error(
      `HuffPost/Opta match ${match.matchId} needs an explicit HTTPS event URL.`,
    );
  }
  const url = huffPost
    ? match.eventUrl
    : `${sourceIndex.rawBaseUrl}/${match.eventPath}`;
  const request = requestSignal(parentSignal);
  try {
    const response = await fetchImpl(url, {
      signal: request.signal,
      cache: 'force-cache',
    });
    if (!response.ok)
      throw new Error(
        `${provider} match ${match.matchId} request failed with HTTP ${response.status}.`,
      );
    const bytes = await response.arrayBuffer();
    const actualHash = await sha256Hex(bytes);
    if (actualHash !== match.sha256) {
      throw new Error(
        `${provider} match ${match.matchId} SHA-256 mismatch. Expected ${match.sha256}, received ${actualHash}.`,
      );
    }
    let events;
    try {
      const payload = JSON.parse(new TextDecoder().decode(bytes));
      events = huffPost ? payload?.events : payload;
    } catch {
      throw new Error(
        `${provider} match ${match.matchId} returned invalid JSON.`,
      );
    }
    if (!Array.isArray(events))
      throw new Error(
        `${provider} match ${match.matchId} data is not an event array.`,
      );
    return events;
  } catch (error) {
    if (
      request.signal.aborted &&
      request.signal.reason?.name === 'TimeoutError'
    ) {
      throw new Error(
        `${provider} match ${match.matchId} request timed out after ${REQUEST_TIMEOUT_MS} ms.`,
      );
    }
    throw error;
  } finally {
    request.dispose();
  }
}

const datasetCache = new Map();

/** Load the full indexed season by default, or only the requested complete player profiles. */
export async function loadSourceDataset({
  season = sourceIndex.defaultSeason ?? sourceIndex.seasons.at(-1),
  featuredOnly = false,
  playerIds,
  onProgress = () => {},
  signal,
  fetchImpl = fetch,
  retry = false,
} = {}) {
  if (!sourceIndex.seasons.includes(season))
    throw new Error(`Unknown competition edition ${season}.`);
  const requestedIds =
    playerIds ??
    (featuredOnly
      ? sourceIndex.featuredPlayerIds
      : sourceIndex.players
          .filter((player) =>
            player.profiles.some((profile) => profile.season === season),
          )
          .map((player) => player.id));
  if (!Array.isArray(requestedIds) || !requestedIds.length)
    throw new Error('At least one player profile must be requested.');
  const targetIds = new Set(requestedIds);
  const matchIds = new Set();
  for (const playerId of targetIds) {
    const ids = PROFILE_MATCH_IDS.get(playerId)?.get(season);
    if (!ids) throw new Error(`Unknown player profile ${playerId}, ${season}.`);
    for (const matchId of ids) matchIds.add(matchId);
  }
  const fullSeason = playerIds === undefined && !featuredOnly;
  const matches = sourceIndex.matches.filter(
    (match) =>
      match.season === season && (fullSeason || matchIds.has(match.matchId)),
  );
  const cacheKey = JSON.stringify([
    season,
    [...targetIds].sort(),
    matches.map((match) => match.matchId),
  ]);
  signal?.throwIfAborted();
  if (retry) datasetCache.delete(cacheKey);
  if (datasetCache.has(cacheKey)) return datasetCache.get(cacheKey);
  if (!globalThis.crypto?.subtle)
    throw new Error(
      'Secure SHA-256 verification is unavailable in this browser context.',
    );
  const profiles = emptyProfiles();
  const statsBySeason = new Map(
    sourceIndex.seasons.map((season) => [season, emptyStats()]),
  );
  const seen = new Set();
  const total = matches.length;
  let nextIndex = 0;
  let completed = 0;
  let failure = null;

  async function worker() {
    while (!failure) {
      const index = nextIndex++;
      if (index >= total) return;
      const match = matches[index];
      try {
        signal?.throwIfAborted();
        const events = await fetchVerifiedMatch(match, fetchImpl, signal);
        signal?.throwIfAborted();
        addToProfiles(profiles, statsBySeason, match, events, seen, targetIds);
        completed += 1;
        onProgress({
          completed,
          total,
          matchId: match.matchId,
          season: match.season,
        });
      } catch (error) {
        failure ||= error;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, total) }, worker),
  );
  if (failure) throw failure;
  signal?.throwIfAborted();

  const matchOrder = new Map(
    sourceIndex.matches.map((match, index) => [match.matchId, index]),
  );
  for (const playerProfiles of profiles.values()) {
    for (const profile of playerProfiles.values()) {
      profile.coverage.matchIds.sort(
        (left, right) => matchOrder.get(left) - matchOrder.get(right),
      );
      profile.coverage.includedMatchIds.sort((left, right) => matchOrder.get(left) - matchOrder.get(right));
      profile.coverage.matches = profile.coverage.matchIds.length;
      profile.events.sort(
        (left, right) =>
          left.matchDate.localeCompare(right.matchDate) ||
          left.minute - right.minute ||
          left.second - right.second ||
          left.id.localeCompare(right.id),
      );
    }
  }
  const coverage = sourceIndex.seasons.map((indexedSeason) => ({
    season: indexedSeason,
    selectedMatches: sourceIndex.matches.filter(
      (match) => match.season === indexedSeason,
    ).length,
    retainedEventsByPlayer: Object.fromEntries(
      sourceIndex.players.map((player) => [
        player.id,
        player.profiles.find((profile) => profile.season === indexedSeason)
          ?.summary.retainedEvents ?? null,
      ]),
    ),
    exclusions:
      indexedSeason === season ? statsBySeason.get(indexedSeason) : null,
    loadedPlayerIds: indexedSeason === season ? [...targetIds] : [],
    verifiedMatchIds:
      indexedSeason === season ? matches.map((match) => match.matchId) : [],
  }));
  const players = sourceIndex.players.map((player) => {
    return {
      id: player.id,
      name: player.name,
      profiles: player.profiles.map((entry) => {
        const isLoaded = entry.season === season && targetIds.has(player.id);
        const loaded = isLoaded
          ? profiles.get(player.id).get(entry.season)
          : null;
        return {
          season: entry.season,
          summary: entry.summary,
          sourceId: sourceIndex.editions.find((edition) => edition.season === entry.season)?.sourceId ?? 'statsbomb',
          appearanceCoverage: sourceIndex.focusCoverage?.find((item) => item.playerId === player.id && item.season === entry.season) ?? null,
          loadState: isLoaded ? 'loaded' : 'not loaded',
          coverage: loaded
            ? { ...loaded.coverage, note: entry.summary.note }
            : {
                matches: entry.summary.matches,
                matchIds: entry.summary.matchIds,
                note: entry.summary.note,
                unknownPasses: entry.summary.unknownPasses,
              },
          events: isLoaded ? (loaded?.events ?? []) : null,
        };
      }),
    };
  });
  const dataset = {
    kind: 'observed events',
    metadata: {
      source: sourceIndex.source,
      defaultSeason: sourceIndex.defaultSeason,
      featuredPlayerIds: sourceIndex.featuredPlayerIds,
      sourceUrl: sourceIndex.sourceUrl,
      commit: sourceIndex.commit,
      attributionLogo: sourceIndex.attributionLogo,
      coverageNote: sourceIndex.coverageNote,
      additionalSources: sourceIndex.additionalSources,
      huffPostOpta: {
        source: 'HuffPost 2014 World Cup / Opta',
        integrity:
          'Each requested match file is verified against its indexed SHA-256 before parsing. The source commit above applies only to StatsBomb.',
        coordinateSystem:
          'Opta coordinates use a 0 to 100 pitch. x is retained and y is converted with 100 - y for the top-origin display. No extra team or half direction flip is applied.',
        passCompletion:
          'Type 1 uses outcome 1 for complete and 0 for incomplete. Other outcomes are unknown. Type 2 offside passes are incomplete.',
        onTarget:
          'Types 13 and 14 are off target. Type 16 is a goal and on target, except own goals (qualifier 28), which are excluded. Type 15 without qualifier 82 retains onTarget null because HuffPost omits the blocked-versus-saved classification. Type 15 with qualifier 82 is off target. Goal conversion includes every retained shot; the on-target rate excludes unknown classifications from its denominator.',
        exclusions:
          'Only indexed spatial event types in periods 1 to 4 are retained. Missing event identifiers, missing or out-of-range coordinates, own goals, management events and derived drawing points are excluded.',
      },
      coordinateSystem:
        'StatsBomb event locations use a 120 by 80 pitch coordinate system. Event x and y values are normalized directly to percentages with x / 120 * 100 and y / 80 * 100. No extra direction flip is applied.',
      passCompletion:
        'A pass with no outcome is complete. Named incomplete outcomes are incomplete. Outcome Unknown is retained with complete null and excluded from the known pass completion denominator.',
      onTarget:
        'True for shot outcomes Goal, Saved, or Saved To Post, following the StatsBomb glossary. Other recognized shot outcomes are false. Missing or unrecognized outcomes are excluded and counted.',
      onTargetSource: 'https://stats-portal.statsbomb.com/glossary',
      sampleCoverage: coverage,
    },
    seasons: sourceIndex.seasons,
    players,
  };
  datasetCache.set(cacheKey, dataset);
  return dataset;
}
