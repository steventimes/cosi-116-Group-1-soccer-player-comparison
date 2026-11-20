// Opta event codes and pitch orientation are documented in the indexed source notes.
const SPATIAL_TYPES = new Set([
  '1',
  '2',
  '3',
  '4',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '41',
  '42',
  '44',
  '45',
  '49',
  '50',
  '51',
  '52',
  '54',
  '55',
  '56',
  '59',
  '61',
  '67',
  '74',
]);
const SHOT_TYPES = new Set(['13', '14', '15', '16']);
const roundTenth = (value) => Math.floor(value * 10 + 0.5) / 10;

export function convertHuffPostEvent(event, match, stats, seen) {
  stats.sourcePlayerEvents += 1;
  if (!['1', '2', '3', '4'].includes(event.period)) {
    if (event.period === '5') stats.shootoutExcluded += 1;
    else stats.nonSpatialEvents += 1;
    return null;
  }
  if (typeof event.id !== 'string' || !event.id.trim()) {
    stats.missingEventId += 1;
    return null;
  }
  const id = `huffpost:${match.matchId}:${event.id}`;
  if (seen.has(id)) {
    stats.duplicateEvents += 1;
    return null;
  }
  seen.add(id);
  if (!SPATIAL_TYPES.has(event.type)) {
    stats.nonSpatialEvents += 1;
    return null;
  }
  if (event.x == null || event.y == null) {
    stats.missingLocation += 1;
    return null;
  }
  if (!Number.isFinite(event.x) || !Number.isFinite(event.y) || event.x < 0 || event.x > 100 || event.y < 0 || event.y > 100) {
    stats.invalidLocation += 1;
    return null;
  }
  if (event.type === '16' && Object.hasOwn(event.qualifiers ?? {}, '28')) {
    stats.ownGoalExcluded += 1;
    return null;
  }
  const action = {
    id,
    matchId: match.matchId,
    matchDate: match.matchDate,
    minute: event.min,
    second: event.sec,
    x: roundTenth(event.x),
    y: roundTenth(100 - event.y),
  };
  if (event.type === '1' || event.type === '2') {
    action.type = 'pass';
    action.complete =
      event.type === '2'
        ? false
        : event.outcome === '1'
          ? true
          : event.outcome === '0'
            ? false
            : null;
    if (action.complete === null) stats.unknownPasses += 1;
  } else if (SHOT_TYPES.has(event.type)) {
    action.type = 'shot';
    action.goal = event.type === '16';
    // HuffPost omits qualifier 82 on saved/blocked attempts; absence is not evidence of a save.
    action.onTarget =
      event.type === '15'
        ? Object.hasOwn(event.qualifiers ?? {}, '82')
          ? false
          : null
        : action.goal;
    if (action.onTarget === null) stats.unknownShotTargets += 1;
  } else action.type = 'other';
  stats.retainedEvents += 1;
  return action;
}
