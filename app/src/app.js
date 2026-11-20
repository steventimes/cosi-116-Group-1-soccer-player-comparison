import {
  AREAS,
  WHOLE_FIELD,
  densityIndex,
} from './model.js';
import { createPitchRenderer } from './pitch.js';
import { loadDataset } from './data.js';
import { renderComparison, renderLocalDetails } from './comparison.js';

const element = id => document.getElementById(id);

function createApplication(data) {
  data.players = data.players.map(p => ({ ...p, profiles: p.profiles.filter(x => x.events !== null) })).filter(p => p.profiles.length);
  data.seasons = [...new Set(data.players.flatMap(p => p.profiles.map(x => x.season)))];
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
  const profile = season => data.players.find(player => player.id === state.player).profiles.find(item => item.season === season) ?? {season, events: []};

  function updateCell() {
    renderLocalDetails(profile(state.season), profile(state.reference), state.selection, state.hoverCell);
  }

  function render() {
    element('current-label').textContent = state.season;
    element('reference-label').textContent = state.reference;
    element('legend-current').textContent = state.season;
    element('legend-reference').textContent = state.reference;
    element('heat-scale-max').textContent = `${maximum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
    document.querySelectorAll('[data-season]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.season === state.season));
    });
    pitch.drawHeat('current', state.player, state.season);
    pitch.drawHeat('reference', state.player, state.reference);
    paintOverlay();
    renderComparison(profile(state.season), profile(state.reference), state.selection);
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
  dataset = await loadDataset();
} catch (error) {
  const message = element('data-error');
  message.textContent = `Data could not be loaded. ${error.message} Check the data file and reload the page.`;
  message.hidden = false;
}
if (dataset) {
  createApplication(dataset);
  controls.forEach(control => { control.disabled = false; });
}
