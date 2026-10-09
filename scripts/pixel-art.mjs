// Generates the pixel icon sprite inside index.html and the multi-colour sprites in icons/pixel/.
// Run `npm run build:assets` after editing any drawing below.
// Icons come from pixelarticons (MIT, 12×12 cells on a 24 viewBox); paw, run, barbell and bike are drawn here in the same grid.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const pixelarticons = join(dirname(require.resolve('pixelarticons/package.json')), 'svg');

// id used in the app → pixelarticons file name
const LIBRARY_ICONS = {
  plus:'plus', flame:'fire', calendar:'calendar', 'calendar-month':'calendar-weeks', trash:'trash', home:'home', trophy:'trophy',
  x:'close', 'chevron-left':'chevron-left', 'chevron-right':'chevron-right', heart:'heart', logout:'logout', download:'download',
  lock:'lock', flag:'flag', moon:'moon', shield:'shield', zap:'zap', star:'star', users:'users', sword:'sword', crown:'crown',
  swim:'waves', yoga:'human-arms-up',
};

const CUSTOM_ICONS = {
  paw: [
    '............',
    '...##..##...',
    '..###..###..',
    '..###..###..',
    '##........##',
    '##..####..##',
    '##.######.##',
    '..########..',
    '.##########.',
    '.##########.',
    '..########..',
    '............',
  ],
  run: [
    '........##..',
    '........##..',
    '.....####...',
    '....#.##.#..',
    '...#..##..#.',
    '......##....',
    '.....#..#...',
    '....#....#..',
    '...#.....##.',
    '..##........',
    '............',
    '............',
  ],
  barbell: [
    '............',
    '............',
    '##........##',
    '##.#....#.##',
    '##.#....#.##',
    '############',
    '##.#....#.##',
    '##.#....#.##',
    '##........##',
    '............',
    '............',
    '............',
  ],
  bike: [
    '............',
    '............',
    '..##....##..',
    '...#.....#..',
    '...#######..',
    '...#....#...',
    '.###....###.',
    '#...#..#...#',
    '#.#.####.#.#',
    '#...#..#...#',
    '.###....###.',
    '............',
  ],
};

// 16×16 sitting cats drawn from photos of our own cats (photos stay local, see .gitignore).
// Letters map to each cat's palette; '.' is transparent.
const CATS = {
  // Carol: ginger-and-white — ginger head with a white blaze down to the muzzle, green eyes, white chest, ginger flanks.
  carol: {
    rows: [
      '..K..........K..',
      '.KPK........KPK.',
      '.KPFKKKKKKKKFPK.',
      '.KFFSFFSSFFSFFK.',
      'KFFFFSFFFFSFFFFK',
      'KFFEEFFWWFFEEFFK',
      'KFFEDFWWWWFDEFFK',
      'KFFWWWWPPWWWWFFK',
      'KFWWWWKWWKWWWWFK',
      '.KWWWWWKKWWWWWK.',
      '..KKWWWWWWWWKK..',
      '.KFFWWWWWWWWFFK.',
      '.KFFWWWWWWWWFFK.',
      '.KFSWWWWWWWWSFK.',
      '.KFWWKWWWWKWWFK.',
      '..KKKKKKKKKKKKK.',
    ],
    palette: { K:'#4a3226', F:'#e8954a', S:'#c4702e', W:'#fffaf2', E:'#79a064', D:'#2b2420', P:'#f2a3a8' },
  },
  // Allen: long-haired brown tabby with a flat face — small ears, "M" forehead stripes, big copper eyes, cream ruff, striped legs.
  allen: {
    rows: [
      '................',
      '.K............K.',
      '.KSK........KSK.',
      '.KSFKKKKKKKKFSK.',
      '.KFSFFSFFSFFSFK.',
      '.KFEEFFSSFFEEFK.',
      'KFFEDFFFFFFDEFFK',
      'LFLLFFFNNFFFLLFL',
      'LLLLLLKLLKLLLLLL',
      '.LWWWWWKKWWWWWL.',
      '.KWWWWWWWWWWWWK.',
      '.KFWWWWWWWWWWFK.',
      '.KFFWWWWWWWWFFK.',
      '.KFSFWWWWWWFSFK.',
      '.KFSFKFFFFKFSFK.',
      '..KKKKKKKKKKKKK.',
    ],
    palette: { K:'#3a3129', F:'#a08e76', S:'#66584a', L:'#c4b49c', W:'#ece5d8', E:'#d0923a', D:'#2a211a', N:'#8a5a4a' },
  },
};

function check(name, rows, size) {
  if (rows.length !== size || rows.some((row) => row.length !== size)) throw new Error(`${name} must be ${size}×${size}`);
}
// Every lit cell becomes a 2×2 square on the 24-unit icon grid; adjacent cells on a row merge into one run.
function iconPath(rows) {
  let d = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] !== '#') continue;
      let end = x; while (row[end + 1] === '#') end += 1;
      d += `M${x * 2} ${y * 2}h${(end - x + 1) * 2}v2h-${(end - x + 1) * 2}z`;
      x = end;
    }
  });
  return d;
}
function outline(rows) {
  const lit = (x, y) => rows[y]?.[x] === '#';
  return rows.map((row, y) => [...row].map((cell, x) => (cell === '#' && !(lit(x - 1, y) && lit(x + 1, y) && lit(x, y - 1) && lit(x, y + 1)) ? '#' : '.')).join(''));
}
function librarySymbol(id, file) {
  const svg = readFileSync(join(pixelarticons, `${file}.svg`), 'utf8');
  const paths = [...svg.matchAll(/<path[^>]*?d="([^"]+)"[^>]*\/>/g)].map((match) => `<path d="${match[1]}"/>`).join('');
  if (!paths) throw new Error(`no paths in pixelarticons/${file}`);
  return `<symbol id="i-${id}" viewBox="0 0 24 24">${paths}</symbol>`;
}
function spriteSvg(rows, palette) {
  let rects = '';
  rows.forEach((row, y) => [...row].forEach((cell, x) => { if (palette[cell]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${palette[cell]}"/>`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges">${rects}</svg>\n`;
}
function maskSvg(rows) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges"><path fill="#000" d="${iconPath(rows)}"/></svg>\n`;
}

Object.entries(CUSTOM_ICONS).forEach(([name, rows]) => check(name, rows, 12));
Object.entries(CATS).forEach(([person, cat]) => { check(`cat-${person}`, cat.rows, 16); [...cat.rows.join('')].forEach((cell) => { if (cell !== '.' && !cat.palette[cell]) throw new Error(`cat-${person}: no colour for '${cell}'`); }); });

const symbols = [
  ...Object.entries(LIBRARY_ICONS).map(([id, file]) => librarySymbol(id, file)),
  ...Object.entries(CUSTOM_ICONS).map(([id, rows]) => `<symbol id="i-${id}" viewBox="0 0 24 24"><path d="${iconPath(rows)}"/></symbol>`),
];
const indexPath = join(root, 'index.html');
const html = readFileSync(indexPath, 'utf8');
const start = '<!-- pixel-sprite:start -->'; const end = '<!-- pixel-sprite:end -->';
if (!html.includes(start) || !html.includes(end)) throw new Error('sprite markers missing in index.html');
const block = `${start}\n    <!-- 生成文件：npm run build:assets。图标来自 pixelarticons (MIT)，paw/run/barbell/bike 为自绘 -->\n    <svg class="icon-sprite" aria-hidden="true" shape-rendering="crispEdges">\n${symbols.map((symbol) => `      ${symbol}`).join('\n')}\n    </svg>\n    ${end}`;
writeFileSync(indexPath, html.replace(new RegExp(`${start}[\\s\\S]*?${end}`), block));

const out = join(root, 'icons', 'pixel');
mkdirSync(out, { recursive:true });
Object.entries(CATS).forEach(([person, cat]) => writeFileSync(join(out, `cat-${person}.svg`), spriteSvg(cat.rows, cat.palette)));
writeFileSync(join(out, 'paw.svg'), maskSvg(CUSTOM_ICONS.paw));
writeFileSync(join(out, 'paw-empty.svg'), maskSvg(outline(CUSTOM_ICONS.paw)));
console.log(`sprite: ${symbols.length} icons · cats: ${Object.keys(CATS).join(', ')} · paw masks`);
