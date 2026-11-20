const TARGET_OUTCOMES = new Set([
  'Goal',
  'Saved',
  'Saved To Post',
  'Saved to Post',
]);
const KNOWN_NON_TARGET_OUTCOMES = new Set([
  'Blocked',
  'Off T',
  'Post',
  'Wayward',
  'Saved Off T',
]);
const KNOWN_INCOMPLETE_PASSES = new Set([
  'Incomplete',
  'Pass Offside',
  'Out',
  'Injury Clearance',
  'Miscommunication',
]);

function roundTenth(value) {
  return Math.floor(value * 10 + 0.5) / 10;
}

function outcomeName(value) {
  return value && typeof value.name === 'string' ? value.name : null;
}

export function convertStatsBombEvent(event, match, stats, seen) {
  stats.sourcePlayerEvents += 1;

  if (typeof event.id !== 'string' || !event.id.trim()) {
    stats.missingEventId += 1;
    return null;
  }
  const eventKey = `${match.matchId}:${event.id}`;
  if (seen.has(eventKey)) {
    stats.duplicateEvents += 1;
    return null;
  }
  seen.add(eventKey);

  const location = event.location;
  if (location == null) {
    stats.missingLocation += 1;
    return null;
  }
  if (!Array.isArray(location) || location.length < 2 || !location.slice(0, 2).every(Number.isFinite)) {
    stats.invalidLocation += 1;
    return null;
  }
  const [rawX, rawY] = location;
  if (rawX < 0 || rawX > 120 || rawY < 0 || rawY > 80) {
    stats.invalidLocation += 1;
    return null;
  }

  const action = {
    id: event.id,
    matchId: match.matchId,
    matchDate: match.matchDate,
    minute: Number(event.minute) || 0,
    second: Number(event.second) || 0,
    x: roundTenth((rawX / 120) * 100),
    y: roundTenth((rawY / 80) * 100),
  };
  const type = event.type?.name;
  if (type === 'Pass') {
    action.type = 'pass';
    const passOutcome = outcomeName(event.pass?.outcome);
    if (passOutcome === null) action.complete = true;
    else if (passOutcome === 'Unknown') {
      action.complete = null;
      stats.unknownPasses += 1;
    } else if (KNOWN_INCOMPLETE_PASSES.has(passOutcome))
      action.complete = false;
    else {
      action.complete = null;
      stats.unknownPasses += 1;
    }
  } else if (type === 'Shot') {
    const shotOutcome = outcomeName(event.shot?.outcome);
    if (
      !TARGET_OUTCOMES.has(shotOutcome) &&
      !KNOWN_NON_TARGET_OUTCOMES.has(shotOutcome)
    ) {
      stats.unknownShotOutcomes += 1;
      return null;
    }
    action.type = 'shot';
    action.goal = shotOutcome === 'Goal';
    action.onTarget = TARGET_OUTCOMES.has(shotOutcome);
  } else action.type = 'other';

  stats.retainedEvents += 1;
  return action;
}
