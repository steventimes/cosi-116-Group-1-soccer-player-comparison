import { GRID_HEIGHT, GRID_WIDTH, isWholeField } from './model.js';

const element = id => document.getElementById(id);
const palette = [[47, 100, 73], [149, 180, 65], [238, 214, 63], [243, 142, 40], [218, 64, 27]];

function svg(tag, attributes) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

export function createPitchRenderer(grids, maximum) {
  function color(value) {
    const position = (maximum ? Math.min(1, value / maximum) : 0) * (palette.length - 1);
    const index = Math.min(palette.length - 2, Math.floor(position));
    const weight = position - index;
    return palette[index].map((channel, i) => Math.round(channel * (1 - weight) + palette[index + 1][i] * weight));
  }

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
    pitch.append(
      svg('path', { class: 'outside', 'fill-rule': 'evenodd' }),
      svg('rect', { class: 'selection', hidden: 'true' }),
      svg('rect', { class: 'hover-cell', hidden: 'true' }),
    );
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
