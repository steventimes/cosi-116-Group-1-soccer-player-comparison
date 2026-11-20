import { GRID_HEIGHT, GRID_WIDTH, isWholeField } from './model.js';

const element = id => document.getElementById(id);
const palette = [[47, 100, 73], [149, 180, 65], [238, 214, 63], [243, 142, 40], [218, 64, 27]];

export function createPitchRenderer(grids, maximum) {
  const colorScale = window.d3.scaleLinear().domain(palette.map((_, i) => i / (palette.length - 1) * (maximum || 1))).range(palette.map(c => `rgb(${c.join(',')})`)).clamp(true);
  const color = value => { const c = window.d3.color(colorScale(value)); return [c.r, c.g, c.b]; };

  function drawHeat(kind, player, season) {
    const canvas = element(`heat-${kind}`);
    const context = canvas.getContext('2d');
    const tiny = document.createElement('canvas');
    tiny.width = GRID_WIDTH;
    tiny.height = GRID_HEIGHT;
    const source = tiny.getContext('2d');
    const pixels = source.createImageData(GRID_WIDTH, GRID_HEIGHT);
    grids.get(`${player}_${season}`).forEach((value, index) => {
      pixels.data.set([...color(value), 255], index * 4);
    });
    source.putImageData(pixels, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(tiny, 0, 0, canvas.width, canvas.height);
  }

  function initializePitch(kind) {
    const pitch = element(`pitch-${kind}`);
    pitch.innerHTML = '<rect class="pitch-line" x=".4" y=".4" width="99.2" height="64.2"/><path class="pitch-line" d="M50 .4V64.6 M.4 17H17V48H.4 M99.6 17H83V48H99.6 M.4 25H6V40H.4 M99.6 25H94V40H99.6"/><circle class="pitch-line" cx="50" cy="32.5" r="8.7"/><circle class="pitch-line" cx="50" cy="32.5" r=".45"/>';
    for (const [tag, attrs] of [['path', {class: 'outside', 'fill-rule': 'evenodd'}], ['rect', {class: 'selection', hidden: true}], ['rect', {class: 'hover-cell', hidden: true}]]) {
      const node = window.d3.select(pitch).append(tag);
      Object.entries(attrs).forEach(([key, value]) => node.attr(key, value));
    }
  }

  function paintOverlay(region, hoverCell) {
    const whole = isWholeField(region);
    for (const kind of ['current', 'reference']) {
      const pitch = element(`pitch-${kind}`);
      const outside = pitch.querySelector('.outside');
      const rectangle = pitch.querySelector('.selection');
      const hover = pitch.querySelector('.hover-cell');
      const x = region.x0;
      const y = region.y0 * .65;
      const width = region.x1 - region.x0;
      const height = (region.y1 - region.y0) * .65;
      outside.setAttribute('d', whole ? '' : `M0 0H100V65H0Z M${x} ${y}v${height}h${width}v${-height}Z`);
      rectangle.toggleAttribute('hidden', whole);
      for (const [key, value] of Object.entries({ x, y, width, height })) rectangle.setAttribute(key, value);
      hover.toggleAttribute('hidden', !hoverCell);
      if (hoverCell) {
        const cell = { x: hoverCell.x0, y: hoverCell.y0 * .65, width: 10, height: 6.5 };
        for (const [key, value] of Object.entries(cell)) hover.setAttribute(key, value);
      }
    }
  }

  return { drawHeat, initializePitch, paintOverlay };
}
