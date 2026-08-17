import { readFile } from "node:fs/promises";
import { detectPlanRegions } from "../../app/plan-regions.ts";
import { detectFloorStructure } from "../../app/structure-detector.ts";

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
for (const region of regions) {
  const structure = detectFloorStructure(data, info.width, info.height, region);
  const stair = structure.stairs[0];
  console.log(`\n=== ${region.id} (${structure.walls.length} walls, stair=${stair ? `x${stair.x.toFixed(0)} y${stair.y.toFixed(0)} ${stair.width.toFixed(0)}x${stair.height.toFixed(0)}` : "none"}) ===`);
  for (const wall of structure.walls) {
    if (wall.railSpans?.length) {
      const line = wall.axis === "vertical" ? (wall.start[0] + wall.end[0]) / 2 : (wall.start[1] + wall.end[1]) / 2;
      const runLen = Math.abs(wall.axis === "vertical" ? wall.end[1] - wall.start[1] : wall.end[0] - wall.start[0]);
      console.log(`  ${wall.id} ${wall.axis} t=${wall.thickness.toFixed(0)}px line=${line.toFixed(0)} run=${runLen.toFixed(0)}px`);
      for (const [from, to] of wall.railSpans) {
        console.log(`    rail span [${(from * 100).toFixed(0)}%–${(to * 100).toFixed(0)}%] = ${(from * runLen).toFixed(0)}–${(to * runLen).toFixed(0)}px`);
      }
    }
  }
  if (!structure.walls.some((w) => w.railSpans?.length)) {
    console.log("  (no rail spans detected)");
  }
}
