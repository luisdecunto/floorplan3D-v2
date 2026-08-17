import { readFile } from "node:fs/promises";
import { detectPlanRegions } from "../../app/plan-regions.ts";
import { detectFloorStructures, alignAdjacentStairStructures, structureToLevel } from "../../app/structure-detector.ts";
import { buildStairConnections } from "../../app/scene-geometry.ts";

const dir = new URL("../fixtures/floorplans/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", dir), "utf8"));
const fx = manifest.fixtures.find((f) => f.id === "fp-001");
const { default: sharp } = await import("sharp");

const buffer = await readFile(new URL(fx.file, dir));
const maxSide = 1280;
const scale = Math.min(1, maxSide / Math.max(fx.width, fx.height));
const w = Math.round(fx.width * scale), h = Math.round(fx.height * scale);
const { data, info } = await sharp(buffer).resize(w, h, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

const regions = detectPlanRegions(data, info.width, info.height);
let structures = detectFloorStructures(data, info.width, info.height, regions);
if (regions.length === 2) structures = alignAdjacentStairStructures(regions, structures);
const levels = regions.map((region, index) => structureToLevel(structures[region.id], region, index));
const connections = buildStairConnections(levels);

for (const c of connections) {
  const o = c.opening;
  const left = o.x - o.width / 2, right = o.x + o.width / 2;
  const back = o.z - o.depth / 2, front = o.z + o.depth / 2;
  console.log(`\nconnection ${c.id}: opening x=[${left.toFixed(2)},${right.toFixed(2)}] z=[${back.toFixed(2)},${front.toFixed(2)}] width=${c.width.toFixed(2)}`);
  console.log(`  upperFlight.end (access) = [${c.upperFlight.end[0].toFixed(2)}, ${c.upperFlight.end[1].toFixed(2)}]`);
  const upper = levels.find((l) => l.id === c.upperLevelId);
  const tol = 0.4;
  for (const edge of [
    { id: "left", axis: "x", coord: left, span: [back, front] },
    { id: "right", axis: "x", coord: right, span: [back, front] },
    { id: "back", axis: "z", coord: back, span: [left, right] },
    { id: "front", axis: "z", coord: front, span: [left, right] },
  ]) {
    const hits = upper.walls.filter((wl) => {
      if (edge.axis === "x") {
        const isVertical = Math.abs(wl.end[0] - wl.start[0]) < Math.abs(wl.end[1] - wl.start[1]);
        const wx = (wl.start[0] + wl.end[0]) / 2;
        return isVertical && Math.abs(wx - edge.coord) <= tol;
      } else {
        const isHorizontal = Math.abs(wl.end[1] - wl.start[1]) < Math.abs(wl.end[0] - wl.start[0]);
        const wz = (wl.start[1] + wl.end[1]) / 2;
        return isHorizontal && Math.abs(wz - edge.coord) <= tol;
      }
    });
    console.log(`  edge ${edge.id} (coord ${edge.coord.toFixed(2)}, span [${edge.span[0].toFixed(2)},${edge.span[1].toFixed(2)}]):`);
    for (const wl of hits) {
      const a = edge.axis === "x" ? [wl.start[1], wl.end[1]] : [wl.start[0], wl.end[0]];
      console.log(`     wall ${wl.id} weight=${wl.weight ?? "?"} thick=${(wl.thickness ?? 0).toFixed(2)} span=[${Math.min(...a).toFixed(2)},${Math.max(...a).toFixed(2)}]`);
    }
    if (!hits.length) console.log("     (no wall on this edge)");
  }
}
