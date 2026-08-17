// Prints the railing geometry the viewer actually emits for a fixture, so
// visual artifacts can be traced to concrete numbers.
// Uses the real functions from app/stairwell-rails.ts - never a local mirror,
// which is how the previous version silently drifted out of date.
import { readFile } from "node:fs/promises";
import { detectPlanRegions } from "../../app/plan-regions.ts";
import { detectFloorStructures, alignAdjacentStairStructures, structureToLevel, resolveScaleFromDoors } from "../../app/structure-detector.ts";
import { suggestBuildingOrder } from "../../app/floorplan-document.ts";
import { buildStairConnections, stairwellOpening } from "../../app/scene-geometry.ts";
import { activateRailSpans, stairwellRailSegments, clampWallGapsToRails, railSpansToAbsolute, isVerticalWall } from "../../app/stairwell-rails.ts";

const dir = new URL("../fixtures/floorplans/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", dir), "utf8"));
const fx = manifest.fixtures.find((f) => f.id === (process.argv[2] ?? "fp-001"));
const { default: sharp } = await import("sharp");

const buffer = await readFile(new URL(fx.file, dir));
const s0 = Math.min(1, 1280 / Math.max(fx.width, fx.height));
const { data, info } = await sharp(buffer).resize(Math.round(fx.width * s0), Math.round(fx.height * s0), { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

let regions = detectPlanRegions(data, info.width, info.height);
let structures = detectFloorStructures(data, info.width, info.height, regions);
regions = suggestBuildingOrder(regions, structures);
if (regions.length === 2) structures = alignAdjacentStairStructures(regions, structures);
const scale = resolveScaleFromDoors(structures) ?? undefined;
const levels = regions.map((r, i) => structureToLevel(structures[r.id], r, i, scale));
const connections = buildStairConnections(levels);
const openings = new Map(connections.map((c) => [c.upperLevelId, c.opening]));
const access = new Map(connections.map((c) => [c.upperLevelId, { point: c.upperFlight.end, width: c.width }]));

levels.forEach((level, index) => {
  const opening = index > 0 ? (openings.get(level.id) ?? stairwellOpening(level)) : null;
  if (!opening) return;
  const acc = access.get(level.id) ?? null;
  const candidates = activateRailSpans(level.walls, opening);
  const segments = stairwellRailSegments(opening, candidates, acc);
  const walls = clampWallGapsToRails(candidates, segments);

  const L = opening.x - opening.width / 2, R = opening.x + opening.width / 2;
  const B = opening.z - opening.depth / 2, F = opening.z + opening.depth / 2;
  console.log(`\n=== ${fx.id} level[${index}] "${level.name}"`);
  console.log(`opening x=[${L.toFixed(2)},${R.toFixed(2)}] z=[${B.toFixed(2)},${F.toFixed(2)}] corners at x=${L.toFixed(2)}/${R.toFixed(2)}, z=${B.toFixed(2)}/${F.toFixed(2)}`);
  if (acc) console.log(`access point=[${acc.point[0].toFixed(2)},${acc.point[1].toFixed(2)}] width=${acc.width.toFixed(2)}`);

  for (const w of walls.filter((x) => x.railSpans?.length)) {
    const line = isVerticalWall(w) ? (w.start[0] + w.end[0]) / 2 : (w.start[1] + w.end[1]) / 2;
    const ends = isVerticalWall(w) ? [w.start[1], w.end[1]] : [w.start[0], w.end[0]];
    console.log(`  WALL ${w.id} line=${line.toFixed(2)} extent=[${Math.min(...ends).toFixed(2)},${Math.max(...ends).toFixed(2)}] gapAbs=${JSON.stringify(railSpansToAbsolute(w).map((s) => s.map((v) => +v.toFixed(2))))}`);
  }
  for (const s of segments) {
    const len = s.to - s.from;
    const pos = s.axis === "x" ? `[${((s.from + s.to) / 2).toFixed(2)}, y, ${s.fixed.toFixed(2)}]` : `[${s.fixed.toFixed(2)}, y, ${((s.from + s.to) / 2).toFixed(2)}]`;
    console.log(`  RAIL ${s.key.padEnd(8)} ${s.axis} ${s.from.toFixed(2)}..${s.to.toFixed(2)} len=${len.toFixed(2)} at ${pos}`);
  }
  if (!segments.length) console.log("  (no railing)");
});
