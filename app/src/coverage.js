const LABELS = {
  missingEventId: 'missing identifiers',
  missingLocation: 'missing locations',
  invalidLocation: 'invalid coordinates',
  duplicateEvents: 'duplicate identifiers',
  unknownPasses: 'unknown pass outcomes',
  unknownShotOutcomes: 'unclassified shots excluded',
  unknownShotTargets: 'unknown shot target classifications',
  nonSpatialEvents: 'non-spatial records excluded',
  ownGoalExcluded: 'own goals excluded',
  shootoutExcluded: 'shootout records excluded',
};

export function coverageStatus(profile) {
  if (profile.loadState === 'failed') return 'load-failure';
  const count = profile.events?.length ?? profile.summary?.retainedEvents ?? 0;
  if (!count) return 'missing-location';
  const appearances = profile.appearanceCoverage;
  return appearances && appearances.missingAppearances === 0 &&
    appearances.selectedAppearances === appearances.expectedAppearances
    ? 'available' : 'partial';
}

export function coverageText(profile) {
  const status = coverageStatus(profile);
  if (status === 'load-failure') return 'Load failed';
  if (status === 'missing-location') return 'No location events';
  const matches = profile.coverage?.includedMatchIds?.length ?? profile.summary?.matches ?? 0;
  return `${status === 'available' ? 'Available · all indexed expected appearances' : 'Partial sample'} · ${matches} matches`;
}

export function renderCoverage(element, profile) {
  element.replaceChildren();
  element.dataset.coverageState = coverageStatus(profile);
  const add = (text) => {
    const line = document.createElement('p');
    line.textContent = text;
    element.append(line);
  };
  add(coverageText(profile));
  if (!profile.events?.length) add('No location records are available to plot. This does not mean the player had no actions.');
  add(`Source: ${profile.sourceId === 'huffpost-opta' ? 'HuffPost / Opta' : 'StatsBomb Open Data'}. Recorded ball actions, not running paths or complete tournament coverage.`);
  const ids = profile.coverage?.includedMatchIds ?? profile.coverage?.matchIds ?? [];
  add(`Included match IDs: ${ids.length ? ids.join(', ') : 'none'}.`);
  const stats = profile.coverage?.validation;
  if (stats) {
    add(`Loading check: ${stats.retainedEvents} located actions retained from ${stats.sourcePlayerEvents} player records.`);
    const issues = Object.entries(LABELS).filter(([key]) => stats[key] > 0)
      .map(([key, label]) => `${label}: ${stats[key]}`);
    add(issues.length ? `Data notes: ${issues.join('; ')}.` : 'Data notes: no validation issues found.');
  }
}
