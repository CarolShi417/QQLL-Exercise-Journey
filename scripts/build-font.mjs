// Subsets the Fusion Pixel font (OFL) to the characters the app actually shows, and rewrites the
// @font-face block in styles.css. The full font stays as a fallback face: the browser only downloads
// it when a character outside the subset appears, so new copy never renders as missing glyphs.
// Run `npm run build:assets` after changing any user-visible text.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import subsetFont from 'subset-font';

const root = join(dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const SOURCES = ['index.html', 'app.js', 'game.js', 'logic.js', 'theme.js', 'backup.js'];
// Characters produced at runtime that never appear literally in the sources (dates, numbers, Intl output).
const RUNTIME = '0123456789年月日周一二三四五六七八九十，。、·—…：；！？（）「」《》％+-/×÷:.,%';

const chars = new Set(RUNTIME);
for (let code = 0x20; code < 0x7f; code += 1) chars.add(String.fromCharCode(code));
SOURCES.forEach((file) => { for (const char of readFileSync(join(root, file), 'utf8')) if (char.codePointAt(0) >= 0x20) chars.add(char); });
const text = [...chars].join('');

const full = readFileSync(join(root, 'fonts', 'fusion-pixel-12px-zh_hans.woff2'));
const subset = await subsetFont(full, text, { targetFormat:'woff2' });
writeFileSync(join(root, 'fonts', 'fusion-pixel-12px-subset.woff2'), subset);

// Collapse code points into unicode-range spans.
const codes = [...new Set([...chars].map((char) => char.codePointAt(0)))].sort((a, b) => a - b);
const ranges = [];
codes.forEach((code) => { const last = ranges[ranges.length - 1]; if (last && code === last[1] + 1) last[1] = code; else ranges.push([code, code]); });
const unicodeRange = ranges.map(([from, to]) => (from === to ? `U+${from.toString(16)}` : `U+${from.toString(16)}-${to.toString(16)}`)).join(', ');

const cssPath = join(root, 'styles.css');
const css = readFileSync(cssPath, 'utf8');
const start = '/* font-faces:start */'; const end = '/* font-faces:end */';
if (!css.includes(start) || !css.includes(end)) throw new Error('font markers missing in styles.css');
// When unicode ranges overlap, the face declared last is checked first — so the subset goes last.
const block = `${start}
/* 生成文件：npm run build:assets。Fusion Pixel Font (OFL)，见 fonts/FusionPixel-OFL.txt */
@font-face { font-family: "Fusion Pixel"; font-display: swap; src: url("fonts/fusion-pixel-12px-zh_hans.woff2") format("woff2"); }
@font-face { font-family: "Fusion Pixel"; font-display: swap; src: url("fonts/fusion-pixel-12px-subset.woff2") format("woff2"); unicode-range: ${unicodeRange}; }
${end}`;
writeFileSync(cssPath, css.replace(new RegExp(`${start.replace(/[*/]/g, '\\$&')}[\\s\\S]*?${end.replace(/[*/]/g, '\\$&')}`), block));
console.log(`font subset: ${codes.length} characters, ${(subset.length / 1024).toFixed(1)} KB (full font ${(full.length / 1024).toFixed(0)} KB as fallback)`);
