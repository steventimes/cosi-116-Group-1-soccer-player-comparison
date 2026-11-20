import { inside, isWholeField, summarize } from './model.js';

const element = id => document.getElementById(id);
const format = (number, digits = 1) => number.toLocaleString('en-US', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
});

function metric(label, formula, key, denominator, selected, reference) {
  function row(totals, comparison) {
    const numerator = totals[key];
    const count = totals[denominator];
    const percentage = count ? 100 * numerator / count : null;
    return `<div class="bar-row"><div><div class="track"><div class="bar ${comparison ? 'ref' : ''}" style="width:${percentage ?? 0}%"></div></div><div class="fraction">${numerator} / ${count}${count ? '' : ' · no attempts'}</div></div><div class="percentage">${percentage === null ? '—' : `${format(percentage)}%`}</div></div>`;
  }
  return `<section class="metric" data-metric="${key}" data-current-n="${selected[key]}" data-current-d="${selected[denominator]}" data-reference-n="${reference[key]}" data-reference-d="${reference[denominator]}"><h3 class="metric-label">${label}</h3><p class="formula">${formula}</p>${row(selected, false)}${row(reference, true)}</section>`;
}

export function renderLocalDetails(current, reference, selection, cell) {
  if (!cell) {
    element('cell-place').textContent = 'Hover over either field for action counts.';
    element('cell-details').replaceChildren();
    return;
  }
  element('cell-place').textContent = `Length ${cell.x0}–${cell.x1}%, width ${cell.y0}–${cell.y1}%.`;
  element('cell-details').innerHTML = [current, reference].map(profile => {
    const totals = summarize(profile.events.filter(event => inside(event, selection) && inside(event, cell)));
    return `<div class="cell-row"><strong>${profile.season} · ${totals.n} actions</strong><br><span>Passes ${totals.completed}/${totals.passes} completed · Goals ${totals.goals}/${totals.shots} shots</span></div>`;
  }).join('');
}

export function renderComparison(current, reference, selection) {
  const selected = summarize(current.events.filter(event => inside(event, selection)));
  const previous = summarize(reference.events.filter(event => inside(event, selection)));
  const region = selection;
  const whole = isWholeField(region);
  element('stats-scope').textContent = whole ? 'Whole field' : 'Selected area';
  element('metrics').innerHTML = [
    metric('Pass completion', 'Completed passes / passes with known outcome', 'completed', 'knownPasses', selected, previous),
    metric('Shot conversion', 'Goals / attempted shots', 'goals', 'shots', selected, previous),
    metric('Shots on target', 'On-target shots / shots with known target classification', 'onTarget', 'knownTargetShots', selected, previous),
  ].join('');
  const scope = whole ? 'Whole field' : `Selected area · length ${format(region.x0, 0)}–${format(region.x1, 0)}%, width ${format(region.y0, 0)}–${format(region.y1, 0)}%`;
  element('selection-summary').innerHTML = `${scope}<br><span>${current.season}: ${selected.n} sample actions · ${reference.season}: ${previous.n} sample actions</span>`;
}
