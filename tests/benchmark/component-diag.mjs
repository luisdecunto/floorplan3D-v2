// Dump every labelled ink component inside a chosen box, with the descriptors
// the fixture classifier uses. Lets thresholds be set from measured values
// instead of guesses.
//
//   node --experimental-strip-types tests/benchmark/component-diag.mjs [x0 y0 x1 y1]

import { readFile } from "node:fs/promises";
import { detectPlanRegions } from "../../app/plan-regions.ts";
import {
  detectFloorStructures,
  inspectStructureEvidence,
  resolveScaleFromDoors,
} from "../../app/structure-detector.ts";
import { inspectInkComponents } from "../../app/furniture-detector.ts";

const dir = new URL("../fixtures/floorplans/", import.meta.url);
const { default: sharp } = await import("sharp");

const [bx0, by0, bx1, by1] = process.argv.slice(2).map(Number);
const hasBox = [bx0, by0, bx1, by1].every((v) => Number.isFinite(v));

const FIXTURE = process.env.FIXTURE ?? "rowhouse.jpg";
const buffer = await readFile(new URL(FIXTURE, dir));
const meta = await sharp(buffer).metadata();
const maxSide = 1280;
const scale = Math.min(1, maxSide / Math.max(meta.width, meta.height));
const width = Math.max(1, Math.round(meta.width * scale));
const height = Math.max(1, Math.round(meta.height * scale));
const { data, info } = await sharp(buffer)
  .resize(width, height, { fit: "fill" })
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true });

const regions = detectPlanRegions(data, info.width, info.height);
const structures = detectFloorStructures(data, info.width, info.height, regions);
const mpp = resolveScaleFromDoors(structures)?.metresPerPixel ?? null;
console.log(`metresPerPixel=${mpp} (1m = ${mpp ? (1 / mpp).toFixed(1) : "?"} px)`);

for (const [i, region] of regions.entries()) {
  const s = structures[region.id];
  const ev = inspectStructureEvidence(data, info.width, info.height, region);
  const walls = s.walls.map((w) => ({ axis: w.axis, start: w.start, end: w.end, thickness: w.thickness }));

  // Report the per-level scale the detector actually used.
  const doors = s.walls.flatMap((w) => w.openings)
    .filter((o) => o.kind === "door" && o.evidence === "symbol")
    .map((o) => o.width).filter((w) => w >= 12 && w <= 90).sort((a, b) => a - b);
  const localMpp = doors.length ? 0.89 / doors[Math.floor(doors.length / 2)] : null;
  console.log(`\n=== region ${i + 1} (${region.id}) symbolDoors=${doors.length} localMpp=${localMpp ? localMpp.toFixed(5) : "NONE"} wallThickness=${ev.wallThickness}`);

  const comps = inspectInkComponents(ev.mediumMask, info.width, ev.bounds, ev.wallThickness, walls);
  const use = mpp ?? localMpp;
  const inBox = (c) => !hasBox || (c.maxX >= bx0 && c.minX <= bx1 && c.maxY >= by0 && c.minY <= by1);
  const shown = comps.filter(inBox);
  console.log(`components: ${comps.length} total, ${shown.length} in box`);
  console.log("  box(px)                 size(px)   size(m)        fill  interior  sides T/B/L/R           closed");
  for (const c of shown.sort((a, b) => b.area - a.area).slice(0, 45)) {
    const wm = use ? (c.width * use).toFixed(2) : "?";
    const hm = use ? (c.height * use).toFixed(2) : "?";
    const s4 = `${c.sides.top.toFixed(2)}/${c.sides.bottom.toFixed(2)}/${c.sides.left.toFixed(2)}/${c.sides.right.toFixed(2)}`;
    console.log(
      `  (${String(c.minX).padStart(4)},${String(c.minY).padStart(4)})-(${String(c.maxX).padStart(4)},${String(c.maxY).padStart(4)})` +
      `  ${String(c.width).padStart(4)}x${String(c.height).padStart(4)}` +
      `  ${wm.padStart(5)}x${hm.padStart(5)}m` +
      `  ${c.fill.toFixed(2)}  ${c.interior.toFixed(2)}      ${s4}  ${c.closedRect ? "YES" : "no"}`,
    );
    if (c.rect) {
      const rw = use ? (c.rect.width * use).toFixed(2) : "?";
      const rh = use ? (c.rect.height * use).toFixed(2) : "?";
      console.log(
        `      -> trimmed rect (${c.rect.minX},${c.rect.minY})-(${c.rect.maxX},${c.rect.maxY})` +
        `  ${c.rect.width}x${c.rect.height}  ${rw}x${rh} m  interior=${c.rect.interior.toFixed(2)}`,
      );
    }
  }
}
