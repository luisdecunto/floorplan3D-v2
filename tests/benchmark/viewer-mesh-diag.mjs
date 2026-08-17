// Replicates the mesh counts TwinViewer would generate, to catch runaway
// geometry (the classic cause of a phone freezing on a blank canvas).
import { readFile } from "node:fs/promises";
import { detectPlanRegions } from "../../app/plan-regions.ts";
import { detectFloorStructures, alignAdjacentStairStructures, structureToLevel, resolveScaleFromDoors } from "../../app/structure-detector.ts";
import { buildStairConnections, stairwellOpening, slabPieces } from "../../app/scene-geometry.ts";

const dir = new URL("../fixtures/floorplans/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", dir), "utf8"));
const { default: sharp } = await import("sharp");

function subtractIntervals(span, cuts) {
  let segments = [[span[0], span[1]]];
  for (const [cutStart, cutEnd] of cuts) {
    const next = [];
    for (const [segStart, segEnd] of segments) {
      if (cutEnd <= segStart || cutStart >= segEnd) { next.push([segStart, segEnd]); continue; }
      if (cutStart > segStart) next.push([segStart, cutStart]);
      if (cutEnd < segEnd) next.push([cutEnd, segEnd]);
    }
    segments = next;
  }
  return segments.filter(([s, e]) => e - s > 0.2);
}

const bad = [];
for (const fx of manifest.fixtures) {
  const buffer = await readFile(new URL(fx.file, dir));
  const scale = Math.min(1, 1280 / Math.max(fx.width, fx.height));
  const w = Math.round(fx.width * scale), h = Math.round(fx.height * scale);
  const { data, info } = await sharp(buffer).resize(w, h, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const regions = detectPlanRegions(data, info.width, info.height);
  let structures = detectFloorStructures(data, info.width, info.height, regions);
  if (regions.length === 2) structures = alignAdjacentStairStructures(regions, structures);
  const sc = resolveScaleFromDoors(structures) ?? undefined;
  const levels = regions.map((region, i) => structureToLevel(structures[region.id], region, i, sc));
  const connections = buildStairConnections(levels);
  const openings = new Map(connections.map((c) => [c.upperLevelId, c.opening]));

  let total = 0;
  for (const [index, level] of levels.entries()) {
    const opening = index > 0 ? (openings.get(level.id) ?? stairwellOpening(level)) : null;
    total += slabPieces(level, opening).length * 2;
    // Wall meshes
    for (const wall of level.walls) {
      total += 1 + (wall.openings?.length ?? 0) * 3;
    }
    if (!opening) continue;
    // Stairwell rail meshes
    const left = opening.x - opening.width / 2, right = opening.x + opening.width / 2;
    const back = opening.z - opening.depth / 2, front = opening.z + opening.depth / 2;
    const edges = [
      { span: [left, right], axis: "x" }, { span: [left, right], axis: "x" },
      { span: [back, front], axis: "z" }, { span: [back, front], axis: "z" },
    ];
    for (const edge of edges) {
      for (const seg of subtractIntervals(edge.span, [])) {
        const spanLength = seg[1] - seg[0];
        const postCount = Math.max(2, Math.ceil(spanLength / 1.0));
        if (!Number.isFinite(postCount) || postCount > 500) bad.push(`${fx.id} ${level.id} postCount=${postCount} span=${spanLength}`);
        total += 2 + (postCount + 1) + 1;
      }
    }
    for (const c of connections) total += c.lowerFlight.stepCount + c.upperFlight.stepCount + 1;
  }
  console.log(`${fx.id.padEnd(8)} levels=${levels.length} approxMeshes=${total}`);
}
if (bad.length) { console.log("\nPATHOLOGICAL:"); bad.forEach((b) => console.log("  " + b)); }
else console.log("\nno runaway geometry");
