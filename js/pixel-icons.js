// 9×9 pixel-art icons for the 8-bit buttons. Every <i class="px" data-icon="…"> is
// turned into a crisp SVG; pxIcon(el, name) swaps one at runtime.

const ICONS = {
  smear: [
    '.........',
    '.XX......',
    'X..X...X.',
    '....X.X..',
    '.....X...',
    '.XX......',
    'X..X...X.',
    '....X.X..',
    '.....X...',
  ],
  grow: [
    'XXX...XXX',
    'XX.....XX',
    'X.X...X.X',
    '...XXX...',
    '...X.X...',
    '...XXX...',
    'X.X...X.X',
    'XX.....XX',
    'XXX...XXX',
  ],
  shrink: [
    'X.X...X.X',
    '.XX...XX.',
    'XXX...XXX',
    '...XXX...',
    '...X.X...',
    '...XXX...',
    'XXX...XXX',
    '.XX...XX.',
    'X.X...X.X',
  ],
  swirl: [
    '..XXXXX..',
    '.X.....X.',
    'X..XXX..X',
    'X.X...X.X',
    'X.X.X.X.X',
    'X.X..XX.X',
    'X..X....X',
    '.X..XXXX.',
    '..X......',
  ],
  ungoo: [
    '....X....',
    '....X....',
    '...XXX...',
    '..XXXXX..',
    'XXXXXXXXX',
    '..XXXXX..',
    '...XXX...',
    '....X....',
    '....X....',
  ],
  undo: [
    '..X......',
    '.XX......',
    'XXXXXXX..',
    '.XX....X.',
    '..X.....X',
    '........X',
    '.......X.',
    '..XXXXX..',
    '.........',
  ],
  size: [
    '.........',
    '.XXXXXXX.',
    '.X.....X.',
    '.X..X..X.',
    '.X.XXX.X.',
    '.X..X..X.',
    '.X.....X.',
    '.XXXXXXX.',
    '.........',
  ],
  camera: [
    '.........',
    '..XXX....',
    'XXXXXXXXX',
    'X...XXX.X',
    'X..X...XX',
    'X..X...XX',
    'X...XXX.X',
    'XXXXXXXXX',
    '.........',
  ],
  next: [
    '....X....',
    '....XX...',
    '....XXX..',
    'XXXXXXXX.',
    'XXXXXXXXX',
    'XXXXXXXX.',
    '....XXX..',
    '....XX...',
    '....X....',
  ],
  save: [
    '....X....',
    '....X....',
    '....X....',
    '..X.X.X..',
    '...XXX...',
    '....X....',
    'X.......X',
    'X.......X',
    'XXXXXXXXX',
  ],
  share: [
    '....X....',
    '...XXX...',
    'XXXXXXXXX',
    '.XXXXXXX.',
    '..XXXXX..',
    '..XXXXX..',
    '.XXX.XXX.',
    '.XX...XX.',
    '.X.....X.',
  ],
  again: [
    '..XXXX.X.',
    '.X....XX.',
    'X....XXX.',
    'X........',
    'X.......X',
    'X.......X',
    '.X.....X.',
    '..XXXXX..',
    '.........',
  ],
  flip: [
    '..X......',
    '.XX......',
    'XXXXXXXX.',
    '.XX......',
    '..X...X..',
    '......XX.',
    '.XXXXXXXX',
    '......XX.',
    '......X..',
  ],
  note: [
    '.....XXXX',
    '...XXXX.X',
    '...X....X',
    '...X....X',
    '...X....X',
    '.XXX..XXX',
    'XXXX.XXXX',
    'XXX..XXX.',
    '.........',
  ],
  mute: [
    '.....XXXX',
    '...XXXX.X',
    '...X....X',
    'X..X...X.',
    '.X.X..X..',
    '.XXX.X.XX',
    'XXXXX.XXX',
    'XXX.X.XX.',
    '...X...X.',
  ],
  gallery: [
    'XXXXXXXXX',
    'X.......X',
    'X.XX....X',
    'X.XX....X',
    'X.....X.X',
    'X....XXXX',
    'X.X.XXXXX',
    'XXXXXXXXX',
    'XXXXXXXXX',
  ],
  film: [
    'XXXXXXXXX',
    'X.X.X.X.X',
    'XXXXXXXXX',
    'X.......X',
    'X.......X',
    'X.......X',
    'XXXXXXXXX',
    'X.X.X.X.X',
    'XXXXXXXXX',
  ],
  cut: [
    'X.......X',
    '.X.....X.',
    '..X...X..',
    '...X.X...',
    '....X....',
    '...X.X...',
    '.XX...XX.',
    'X..X.X..X',
    '.XX...XX.',
  ],
};
const mirror = (rows) => rows.map((r) => [...r].reverse().join(''));
ICONS.swirlccw = mirror(ICONS.swirl);
ICONS.back = mirror(ICONS.next);

function svg(rows) {
  let d = '';
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) if (r[x] === 'X') d += `M${x} ${y}h1v1h-1z`;
  });
  return `<svg viewBox="0 0 9 9" width="27" height="27" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
}

export function pxIcon(el, name) {
  if (!ICONS[name]) return;
  el.dataset.icon = name;
  el.innerHTML = svg(ICONS[name]);
}

export function initIcons(root = document) {
  root.querySelectorAll('i.px[data-icon]').forEach((el) => pxIcon(el, el.dataset.icon));
}
