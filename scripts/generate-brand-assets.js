/**
 * Generates every raster brand asset (app icon, Android adaptive icon,
 * splash mark, notification icon, favicon) from the vector mark defined below.
 *
 *   npm i --no-save @resvg/resvg-js sharp && node scripts/generate-brand-assets.js
 *
 * The same geometry is used by <BrandMark /> in components/brand.
 */
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

let sharp = null;
try { sharp = require('sharp'); } catch { /* webp output skipped without sharp */ }

const CLAY = '#C4613F';
const PAPER = '#FAF6EF';
const CANVAS = '#F5F3EE';

// Superellipse (n = 5) — the continuous-corner tile used for the icon.
function squirclePath(size, n = 5, steps = 160) {
  const r = size / 2;
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = r + r * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const y = r + r * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
}

// The glyph: a lowercase "r" followed by a full stop — "record it."
// Drawn on a 100-unit grid, optically centred.
const GLYPH_STROKE = 'M37.5 70 V50.5 C37.5 40.5 44.5 33.5 55 33.5';
const glyph = (color, scale = 1) => `
  <g transform="translate(50 52) scale(${scale}) translate(-50 -52)">
    <path d="${GLYPH_STROKE}" fill="none" stroke="${color}" stroke-width="11" stroke-linecap="round"/>
    <circle cx="62.5" cy="64.5" r="6.8" fill="${color}"/>
  </g>`;

const svg = (body, size = 100, bg = null) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${bg ? `<rect width="100" height="100" fill="${bg}"/>` : ''}${body}</svg>`;

function png(svgText, width) {
  return new Resvg(svgText, { fitTo: { mode: 'width', value: width } }).render().asPng();
}

async function write(file, buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
  console.log('wrote', path.relative(process.cwd(), file));
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const assets = path.join(root, 'assets');

  // Vector sources (kept for design hand-off).
  const tile = `<path d="${squirclePath(100)}" fill="${CLAY}"/>${glyph(PAPER, 1.18)}`;
  await write(path.join(assets, 'brand/mark.svg'), svg(tile, 1024));

  // iOS / store icon: full bleed, the OS applies its own mask.
  await write(path.join(assets, 'icon.png'), png(svg(glyph(PAPER, 1.3), 1024, CLAY), 1024));
  // In-app / favicon mark with its own continuous-corner tile.
  await write(path.join(assets, 'logo.png'), png(svg(tile, 1024), 512));
  // Android adaptive foreground: glyph only, inside the 66% safe zone.
  const adaptive = svg(glyph(PAPER, 0.92), 1024);
  await write(path.join(assets, 'adaptive-icon.png'), png(adaptive, 1024));
  // Notification icon: white silhouette on transparent.
  await write(path.join(assets, 'notification-icon.png'), png(svg(glyph('#FFFFFF', 1.25), 96), 96));
  // Splash: the tile, centred by the native splash screen.
  await write(path.join(assets, 'splash.png'), png(svg(tile, 1024), 512));

  // Native Android resources (the project is prebuilt, so update them directly).
  const res = path.join(root, 'android/app/src/main/res');
  if (fs.existsSync(res)) {
    const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
    for (const [d, k] of Object.entries(densities)) {
      const splash = png(svg(tile, 1024), Math.round(96 * k)); // shown inside the 240dp splash icon circle
      await write(path.join(res, `drawable-${d}/splashscreen_logo.png`), splash);
      if (sharp) {
        const legacy = png(svg(`<path d="${squirclePath(100)}" fill="${CLAY}"/>${glyph(PAPER, 1.18)}`, 1024), Math.round(48 * k));
        const round = png(svg(`<circle cx="50" cy="50" r="50" fill="${CLAY}"/>${glyph(PAPER, 1.05)}`, 1024), Math.round(48 * k));
        const fg = png(adaptive, Math.round(108 * k));
        await write(path.join(res, `mipmap-${d}/ic_launcher.webp`), await sharp(legacy).webp({ lossless: true }).toBuffer());
        await write(path.join(res, `mipmap-${d}/ic_launcher_round.webp`), await sharp(round).webp({ lossless: true }).toBuffer());
        await write(path.join(res, `mipmap-${d}/ic_launcher_foreground.webp`), await sharp(fg).webp({ lossless: true }).toBuffer());
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
