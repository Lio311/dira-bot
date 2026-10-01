// Renders the app icons (home-screen / PWA) from the diraBot mark.
// Usage: node scripts/generate-icons.mjs
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BG_TOP = "#2a2926";
const BG_BOTTOM = "#141413";
const INK = "#f7f6f3";
const ACCENT = "#2dd4bf";

// The logo mark on its 32×32 grid (same paths as src/components/logo.tsx).
const mark = `
  <path d="M5.5 14.2 15 6.4a1.6 1.6 0 0 1 2 0l9.5 7.8V24.5a3 3 0 0 1-3 3h-15a3 3 0 0 1-3-3V14.2Z"
        stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" fill="none"/>
  <path d="M16 6V2.8" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
  <circle cx="16" cy="2.4" r="1.5" fill="${ACCENT}"/>
  <rect x="9.5" y="15.5" width="13" height="7" rx="3.5" fill="${INK}" opacity="0.1"/>
  <circle cx="12.9" cy="19" r="1.55" fill="${INK}"/>
  <circle cx="19.1" cy="19" r="1.55" fill="${ACCENT}"/>`;

/** Full-bleed square (iOS and maskable icons are cropped by the OS); `scale` = mark size / icon size. */
function iconSvg(size, scale) {
  const markPx = size * scale;
  const offset = (size - markPx) / 2;
  const k = markPx / 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BG_TOP}"/><stop offset="1" stop-color="${BG_BOTTOM}"/>
    </linearGradient></defs>
    <rect width="${size}" height="${size}" fill="url(#g)"/>
    <g transform="translate(${offset} ${offset + markPx * 0.03}) scale(${k})">${mark}</g>
  </svg>`;
}

const outputs = [
  // iOS home screen. iOS rounds the corners itself, so the square stays full-bleed.
  { file: "public/apple-touch-icon.png", size: 180, scale: 0.62 },
  { file: "public/apple-touch-icon-precomposed.png", size: 180, scale: 0.62 },
  // Android / PWA: "any" keeps the mark large; "maskable" stays inside the 80% safe zone.
  { file: "public/icon-192.png", size: 192, scale: 0.62 },
  { file: "public/icon-512.png", size: 512, scale: 0.62 },
  { file: "public/icon-maskable-512.png", size: 512, scale: 0.5 },
];

/** Browser-tab favicon: the mark on a dark rounded square (same as src/app/icon.svg). */
function faviconSvg(size) {
  const r = size * 0.22;
  const markPx = size * 0.78;
  const offset = (size - markPx) / 2;
  const k = markPx / 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${r}" fill="#1c1b19"/>
    <g transform="translate(${offset} ${offset}) scale(${k})">${mark.replaceAll('stroke-width="2.2"', 'stroke-width="2.6"').replaceAll('stroke-width="2"', 'stroke-width="2.4"')}</g>
  </svg>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const { file, size, scale } of outputs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${iconSvg(size, scale)}</body></html>`);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: size, height: size } });
  console.log("wrote", file);
}
// Favicons: 32px PNG for <link rel="icon">, and a PNG-in-ICO /favicon.ico for clients
// that request it directly.
const favicons = {};
for (const size of [16, 32, 48]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${faviconSvg(size)}</body></html>`);
  favicons[size] = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size }, omitBackground: true });
}
writeFileSync("public/favicon-32.png", favicons[32]);
console.log("wrote public/favicon-32.png");
writeFileSync("src/app/favicon.ico", toIco([16, 32, 48].map((size) => ({ size, png: favicons[size] }))));
console.log("wrote src/app/favicon.ico");

await browser.close();

/** ICO container holding PNG images (supported by every current browser). */
function toIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const dir = images.map(({ size, png }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  return Buffer.concat([header, ...dir, ...images.map((i) => i.png)]);
}
