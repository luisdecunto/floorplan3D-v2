// Asserts the render invariant across every fixture: a wall only loses geometry
// where railing stands in its place, and no railing is buried in solid wall.
// Imports the real functions the renderer uses, so it cannot drift from it.
import { readFile } from "node:fs/promises";
import { detectPlanRegions } from "../../app/plan-regions.ts";
import { detectFloorStructures, alignAdjacentStairStructures, structureToLevel, resolveScaleFromDoors } from "../../app/structure-detector.ts";
import { suggestBuildingOrder } from "../../app/floorplan-document.ts";
import { buildStairConnections, stairwellOpening } from "../../app/scene-geometry.ts";
import { activateRailSpans, stairwellRailSegments, clampWallGapsToRails, railSpansToAbsolute, isVerticalWall } from "../../app/stairwell-rails.ts";

const dir = new URL("../fixtures/floorplans/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", dir), "utf8"));
const { default: sharp } = await import("sharp");

let failures = 0;
for (const fx of manifest.fixtures) {
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
    const candidates = activateRailSpans(level.walls, opening);
    const segments = opening ? stairwellRailSegments(opening, candidates, access.get(level.id) ?? null) : [];
    const walls = clampWallGapsToRails(candidates, segments);
    const gapWalls = walls.filter((w) => w.railSpans?.length);
    console.log(`${fx.id} [${index}] ${level.name.padEnd(12)} rails=${String(segments.length).padStart(2)} wallsWithGaps=${gapWalls.length}`);

    for (const wall of gapWalls) {
      const vertical = isVerticalWall(wall);
      const line = vertical ? (wall.start[0] + wall.end[0]) / 2 : (wall.start[1] + wall.end[1]) / 2;
      const onLine = segments.filter((sg) => sg.axis === (vertical ? "z" : "x") && Math.abs(sg.fixed - line) <= 0.32);
      for (const [a, b] of railSpansToAbsolute(wall)) {
        // every point of the gap must lie inside some rail segment
        const covered = onLine.some((sg) => sg.from - 0.06 <= a && sg.to + 0.06 >= b);
        if (!covered) {
          failures += 1;
          console.log(`   FAIL uncovered gap on ${wall.id}: [${a.toFixed(2)},${b.toFixed(2)}] rails=${JSON.stringify(onLine.map((sg) => [+sg.from.toFixed(2), +sg.to.toFixed(2)]))}`);
        }
      }
    }
  });
}
console.log(failures ? `\n${failures} INVARIANT FAILURE(S)` : "\ninvariant holds: every wall gap is filled by railing");
process.exitCode = failures ? 1 : 0;
