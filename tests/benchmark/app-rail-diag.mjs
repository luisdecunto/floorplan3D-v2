// Mirrors the APP pipeline (including suggestBuildingOrder, which puts the
// balcony region on top) and reports which rail spans actually survive into the
// render. Raw region order is NOT what the app uses - checking without this
// reordering reads the wrong floor as "upper".
import { readFile } from "node:fs/promises";
import { detectPlanRegions } from "../../app/plan-regions.ts";
import { detectFloorStructures, alignAdjacentStairStructures, structureToLevel, resolveScaleFromDoors } from "../../app/structure-detector.ts";
import { suggestBuildingOrder } from "../../app/floorplan-document.ts";
import { buildStairConnections, stairwellOpening } from "../../app/scene-geometry.ts";

const dir = new URL("../fixtures/floorplans/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", dir), "utf8"));
const { default: sharp } = await import("sharp");

// Mirror of activateRailSpans in twin-viewer.tsx
function activate(walls, opening) {
  if (!opening) return walls.map((w) => ({ ...w, railSpans: undefined }));
  const tol = 0.36;
  const left = opening.x - opening.width / 2, right = opening.x + opening.width / 2;
  const back = opening.z - opening.depth / 2, front = opening.z + opening.depth / 2;
  return walls.map((w) => {
    if (!w.railSpans?.length) return w;
    const isV = Math.abs(w.end[0] - w.start[0]) < Math.abs(w.end[1] - w.start[1]);
    const line = isV ? (w.start[0] + w.end[0]) / 2 : (w.start[1] + w.end[1]) / 2;
    const onEdge = isV
      ? (Math.abs(line - left) <= tol || Math.abs(line - right) <= tol)
      : (Math.abs(line - back) <= tol || Math.abs(line - front) <= tol);
    if (!onEdge) return { ...w, railSpans: undefined, why: "not on opening edge" };
    const len = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);
    const runStart = isV ? w.start[1] : w.start[0];
    const dRun = isV ? w.end[1] - w.start[1] : w.end[0] - w.start[0];
    const [lo, hi] = isV ? [back, front] : [left, right];
    const kept = w.railSpans.filter(([f, t]) => {
      const a = runStart + dRun * (f / len), b = runStart + dRun * (t / len);
      return Math.min(a, b) < hi + tol && Math.max(a, b) > lo - tol;
    });
    return kept.length ? { ...w, railSpans: kept } : { ...w, railSpans: undefined, why: "span outside opening" };
  });
}

for (const fx of manifest.fixtures) {
  const buffer = await readFile(new URL(fx.file, dir));
  const scale = Math.min(1, 1280 / Math.max(fx.width, fx.height));
  const { data, info } = await sharp(buffer).resize(Math.round(fx.width * scale), Math.round(fx.height * scale), { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let regions = detectPlanRegions(data, info.width, info.height);
  let structures = detectFloorStructures(data, info.width, info.height, regions);
  regions = suggestBuildingOrder(regions, structures);
  if (regions.length === 2) structures = alignAdjacentStairStructures(regions, structures);
  const sc = resolveScaleFromDoors(structures) ?? undefined;
  const levels = regions.map((r, i) => structureToLevel(structures[r.id], r, i, sc));
  const openings = new Map(buildStairConnections(levels).map((c) => [c.upperLevelId, c.opening]));

  console.log(`\n=== ${fx.id} ===`);
  levels.forEach((level, i) => {
    const opening = i > 0 ? (openings.get(level.id) ?? stairwellOpening(level)) : null;
    const detected = level.walls.filter((w) => w.railSpans?.length).length;
    const live = activate(level.walls, opening).filter((w) => w.railSpans?.length);
    console.log(`  [${i}] ${level.id.padEnd(7)} "${level.name}" opening=${opening ? "yes" : "no"} detectedRailWalls=${detected} RENDERED=${live.length}`);
    for (const w of live) console.log(`        ${w.id} spans=${JSON.stringify(w.railSpans.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]))}`);
    if (detected && !live.length) console.log(`        (all dropped)`);
  });
}
