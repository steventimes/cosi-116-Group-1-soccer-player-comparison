import {
  AREAS,
  WHOLE_FIELD,
  densityIndex,
  inside,
  summarize,
  validateDataset,
} from './model.js';
import { createPitchRenderer } from './pitch.js';

const element = id => document.getElementById(id);
const format = (number, digits = 1) => number.toLocaleString('en-US', {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
});
function createApplication(data) {
  const state = {
    player: data.players[0].id,
    season: data.seasons.at(-1),
    reference: data.seasons[0],
    selection: { ...WHOLE_FIELD },
    hoverCell: null,
    drag: null,
  };
  const { grids, maximum } = densityIndex(data);
  const pitch = createPitchRenderer(grids, maximum);
  const paintOverlay = (region = state.selection) => pitch.paintOverlay(region, state.hoverCell);
  const profile = season => data.players.find(player => player.id === state.player).profiles.find(item => item.season === season);

  function metric(label, formula, key, denominator, selected, reference) {
    function row(totals, comparison) {
      const numerator = totals[key];
      const count = totals[denominator];
      const percentage = count ? 100 * numerator / count : null;
      return `<div class="bar-row"><div><div class="track"><div class="bar ${comparison ? 'ref' : ''}" style="width:${percentage ?? 0}%"></div></div><div class="fraction">${numerator} / ${count}${count ? '' : ' · no attempts'}</div></div><div class="percentage">${percentage === null ? '—' : `${format(percentage)}%`}</div></div>`;
    }
    return `<section class="metric" data-metric="${key}" data-current-n="${selected[key]}" data-current-d="${selected[denominator]}" data-reference-n="${reference[key]}" data-reference-d="${reference[denominator]}"><h3 class="metric-label">${label}</h3><p class="formula">${formula}</p>${row(selected, false)}${row(reference, true)}</section>`;
  }

  function updateCell() {
    if (!state.hoverCell) {
      element('cell-place').textContent = 'Hover over either pitch for local counts.';
      element('cell-details').replaceChildren();
      return;
    }
    const cell = state.hoverCell;
    element('cell-place').textContent = `Length ${cell.x0}–${cell.x1}%, width ${cell.y0}–${cell.y1}%.`;
    element('cell-details').innerHTML = [state.season, state.reference].map(season => {
      const totals = summarize(profile(season).events.filter(event => inside(event, state.selection) && inside(event, cell)));
      return `<div class="cell-row"><strong>${season} · ${totals.n} actions</strong><br><span>Passes ${totals.completed}/${totals.passes} completed · Goals ${totals.goals}/${totals.shots} shots</span></div>`;
    }).join('');
  }

  function render() {
    element('current-label').textContent = state.season;
    element('reference-label').textContent = state.reference;
    element('legend-current').textContent = state.season;
    element('legend-reference').textContent = state.reference;
    element('heat-scale-max').textContent = `${format(maximum, 2)}%`;
    document.querySelectorAll('[data-season]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.season === state.season));
    });
    pitch.drawHeat('current', state.player, state.season);
    pitch.drawHeat('reference', state.player, state.reference);
    paintOverlay();
    const selected = summarize(profile(state.season).events.filter(event => inside(event, state.selection)));
    const reference = summarize(profile(state.reference).events.filter(event => inside(event, state.selection)));
    const region = state.selection;
    const whole = region.x0 === 0 && region.x1 === 100 && region.y0 === 0 && region.y1 === 100;
    element('stats-scope').textContent = whole ? 'Whole field' : 'Selected area';
    element('metrics').innerHTML = [
      metric('Pass completion', 'Completed passes / attempted passes', 'completed', 'passes', selected, reference),
      metric('Shot conversion', 'Goals / attempted shots', 'goals', 'shots', selected, reference),
      metric('Shots on target', 'Shots directed within the goal frame / shots', 'onTarget', 'shots', selected, reference),
    ].join('');
    const scope = whole ? 'Whole field' : `Selected area · length ${format(region.x0, 0)}–${format(region.x1, 0)}%, width ${format(region.y0, 0)}–${format(region.y1, 0)}%`;
    element('selection-summary').innerHTML = `${scope}<br><span>${state.season}: ${selected.n} sample actions · ${state.reference}: ${reference.n} sample actions</span>`;
    updateCell();
  }

  function clearArea() {
    state.selection = { ...WHOLE_FIELD };
    state.hoverCell = null;
    element('region').value = 'whole';
    render();
  }

  function point(event, field) {
    const bounds = field.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)),
      y: Math.max(0, Math.min(100, (event.clientY - bounds.top) / bounds.height * 100)),
    };
  }

  for (const kind of ['current', 'reference']) {
    pitch.initializePitch(kind);
    const field = element(`field-${kind}`);
    field.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      state.drag = { ...point(event, field), field };
      state.hoverCell = null;
      field.setPointerCapture(event.pointerId);
    });
    field.addEventListener('pointermove', event => {
      const location = point(event, field);
      if (state.drag && state.drag.field === field) {
        paintOverlay({
          x0: Math.min(state.drag.x, location.x), x1: Math.max(state.drag.x, location.x),
          y0: Math.min(state.drag.y, location.y), y1: Math.max(state.drag.y, location.y),
        });
        return;
      }
      if (state.drag) return;
      const x = Math.min(90, Math.floor(location.x / 10) * 10);
      const y = Math.min(90, Math.floor(location.y / 10) * 10);
      state.hoverCell = { x0: x, y0: y, x1: x + 10, y1: y + 10 };
      paintOverlay();
      updateCell();
    });
    field.addEventListener('pointerup', event => {
      if (!state.drag || state.drag.field !== field) return;
      const location = point(event, field);
      const start = state.drag;
      state.drag = null;
      const region = {
        x0: Math.min(start.x, location.x), x1: Math.max(start.x, location.x),
        y0: Math.min(start.y, location.y), y1: Math.max(start.y, location.y),
      };
      if (region.x1 - region.x0 > 1 && region.y1 - region.y0 > 1) {
        state.selection = region;
        element('region').value = 'custom';
      }
      state.hoverCell = null;
      render();
    });
    field.addEventListener('pointercancel', () => {
      state.drag = null;
      paintOverlay();
    });
  }

  for (const player of data.players) element('player').append(new Option(player.name, player.id));
  element('player').value = state.player;
  element('player').addEventListener('change', event => {
    state.player = event.target.value;
    clearArea();
  });
  for (const season of data.seasons) element('reference').append(new Option(season, season));
  element('reference').value = state.reference;
  element('reference').addEventListener('change', event => {
    state.reference = event.target.value;
    state.hoverCell = null;
    render();
  });
  data.seasons.forEach((season, index) => {
    const button = document.createElement('button');
    button.textContent = season;
    button.dataset.season = season;
    button.addEventListener('click', () => {
      state.season = season;
      state.hoverCell = null;
      render();
    });
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const next = (index + offset + data.seasons.length) % data.seasons.length;
      const destination = element('seasons').children[next];
      destination.click();
      destination.focus();
    });
    element('seasons').append(button);
  });
  element('region').addEventListener('change', event => {
    if (event.target.value === 'custom') return;
    state.selection = { ...AREAS[event.target.value] };
    state.hoverCell = null;
    render();
  });
  element('clear').addEventListener('click', clearArea);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    state.drag = null;
    state.hoverCell = null;
    paintOverlay();
    updateCell();
  });
  render();
}

const controls = document.querySelectorAll('button, select');
controls.forEach(control => { control.disabled = true; });
let dataset;
try {
  const response = await fetch(new URL('../data/demo.json', import.meta.url), { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`The data file could not be read (${response.status}).`);
  dataset = validateDataset(await response.json());
} catch (error) {
  const message = element('data-error');
  message.textContent = `Data could not be loaded. ${error.message} Check the data file and reload the page.`;
  message.hidden = false;
}
if (dataset) {
  createApplication(dataset);
  controls.forEach(control => { control.disabled = false; });
}
