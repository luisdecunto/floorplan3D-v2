// Bathroom fixture diagnostic.
//
// Runs the full detection pipeline over a fixture plan and renders an overlay
// PNG so detector changes can be judged visually offline, without deploying.
// Prints every detected fixture with its pixel box and its size in metres
// (using the door-derived project scale) so thresholds can be tuned against
// real-world dimensions rather than guessed.
//
//   node --experimental-strip-types tests/benchmark/bathroom-diag.mjs
//
// Output: tests/benchmark/out/<fixture>-overlay.png

import { readFile, mkdir } from "node:fs/promises";
import { detectPlanRegions } from "../../app/plan-regions.ts";
import {
  detectFloorStructures,
  resolveScaleFromDoors,
} from "../../app/structure-detector.ts";

const dir = new URL("../fixtures/floorplans/", import.meta.url);
const outDir = new URL("./out/", import.meta.url);
await mkdir(outDir, { recursive: true });

const { default: sharp } = await import("sharp");

const FIXTURE = process.argv[2] ?? "rowhouse.png";

const KIND_COLOR = {
  toilet: "#e0218a",
  shower: "#00a0c0",
  bathtub: "#0080a0",
  sink: "#2050d0",
  countertop: "#28a050",
  cupboard: "#b46428",
  fridge: "#8040c0",
  stove: "#c83232",
  island: "#787878",
  washer: "#d0a000",
};

const buffer = await readFile(new URL(FIXTURE, dir));
const meta = await sharp(buffer).metadata();
const maxSide = 1280;
const scale = Math.min(1, maxSide / Math.max(meta.width, meta.height));
const width = Math.max(1, Math.round(meta.width * scale));
const height = Math.max(1, Math.round(meta.height * scale));
const { data, info } = await sharp(buffer)
  .resize(width, height, { fit: "fill" })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

console.log(`fixture ${FIXTURE}: source ${meta.width}x${meta.height} -> working ${info.width}x${info.height}`);

const regions = detectPlanRegions(data, info.width, info.height);
const structures = detectFloorStructures(data, info.width, info.height, regions);
const projectScale = resolveScaleFromDoors(structures);
const mpp = projectScale?.metresPerPixel ?? null;

console.log(`regions: ${regions.length}, metresPerPixel: ${mpp ? mpp.toFixed(5) : "unresolved"}`);
if (mpp) console.log(`  (1 m = ${(1 / mpp).toFixed(1)} px)`);

const parts = [];

for (const [i, region] of regions.entries()) {
  const s = structures[region.id];
  const fixtures = s.fixtures ?? [];
  console.log(`\n--- region ${i + 1}/${regions.length} (${region.id}) ---`);
  console.log(`  walls=${s.walls.length} rooms=${s.rooms?.length ?? 0} stairs=${s.stairs.length} wallThickness=${s.diagnostics.wallThickness.toFixed(2)}px`);
  console.log(`  rooms:`);
  for (const room of s.rooms ?? []) {
    const [[x0, y0], , [x1, y1]] = room.polygon;
    const wm = mpp ? ((x1 - x0) * mpp).toFixed(2) : "?";
    const hm = mpp ? ((y1 - y0) * mpp).toFixed(2) : "?";
    console.log(`    ${room.id}: px(${x0.toFixed(0)},${y0.toFixed(0)})-(${x1.toFixed(0)},${y1.toFixed(0)})  ${wm}x${hm} m`);
  }
  console.log(`  fixtures: ${fixtures.length}`);
  for (const f of fixtures) {
    const wm = mpp ? (f.width * mpp).toFixed(2) : "?";
    const hm = mpp ? (f.height * mpp).toFixed(2) : "?";
    console.log(
      `    ${f.kind.padEnd(11)} px(${f.x.toFixed(0)},${f.y.toFixed(0)}) ${f.width.toFixed(0)}x${f.height.toFixed(0)}` +
      `  =  ${wm}x${hm} m   conf=${f.confidence.toFixed(2)}`,
    );
  }

  // Overlay geometry (region coords are already working-image pixels)
  for (const wall of s.walls) {
    parts.push(
      `<line x1="${wall.start[0]}" y1="${wall.start[1]}" x2="${wall.end[0]}" y2="${wall.end[1]}" ` +
      `stroke="#2060ff" stroke-width="${Math.max(1, wall.thickness)}" stroke-opacity="0.35" stroke-linecap="round"/>`,
    );
  }
  for (const room of s.rooms ?? []) {
    const [[x0, y0], , [x1, y1]] = room.polygon;
    parts.push(
      `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" ` +
      `stroke="#00c000" stroke-width="1" stroke-dasharray="6 4" stroke-opacity="0.5"/>`,
    );
  }
  for (const st of s.stairs) {
    parts.push(
      `<rect x="${st.x}" y="${st.y}" width="${st.width}" height="${st.height}" fill="none" ` +
      `stroke="#8040c0" stroke-width="1.5" stroke-opacity="0.7"/>`,
    );
  }
  for (const f of fixtures) {
    const color = KIND_COLOR[f.kind] ?? "#ff0000";
    const x = f.x - f.width / 2;
    const y = f.y - f.height / 2;
    parts.push(
      `<rect x="${x}" y="${y}" width="${f.width}" height="${f.height}" fill="${color}" fill-opacity="0.22" ` +
      `stroke="${color}" stroke-width="1.8"/>` +
      `<text x="${f.x}" y="${y - 3}" font-family="monospace" font-size="11" fill="${color}" ` +
      `text-anchor="middle" paint-order="stroke" stroke="#ffffff" stroke-width="3">${f.kind}</text>`,
    );
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">${parts.join("")}</svg>`;
const outPath = new URL(`${FIXTURE.replace(/\.[^.]+$/, "")}-overlay.png`, outDir);
await sharp(buffer)
  .resize(info.width, info.height, { fit: "fill" })
  .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  .png()
  .toFile(outPath.pathname.replace(/^\//, ""));

console.log(`\nwrote overlay -> tests/benchmark/out/${FIXTURE.replace(/\.[^.]+$/, "")}-overlay.png`);
