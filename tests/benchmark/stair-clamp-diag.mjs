// Measures stair boxes + rail spans across every fixture, so the flanking-wall
// clamp can be checked for regressions on plans it should not touch.
import { readFile } from "node:fs/promises";
import { detectPlanRegions } from "../../app/plan-regions.ts";
import { detectFloorStructure } from "../../app/structure-detector.ts";

const dir = new URL("../fixtures/floorplans/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", dir), "utf8"));
const { default: sharp } = await import("sharp");

for (const fx of manifest.fixtures) {
  const buffer = await readFile(new URL(fx.file, dir));
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(fx.width, fx.height));
  const w = Math.round(fx.width * scale), h = Math.round(fx.height * scale);
  const { data, info } = await sharp(buffer).resize(w, h, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const regions = detectPlanRegions(data, info.width, info.height);
  console.log(`\n=== ${fx.id} (${regions.length} regions) ===`);
  for (const region of regions) {
    const s = detectFloorStructure(data, info.width, info.height, region);
    const stairDesc = s.stairs.length
      ? s.stairs.map((st) => `${st.runAxis[0]} x=${st.x.toFixed(0)} y=${st.y.toFixed(0)} ${st.width.toFixed(0)}x${st.height.toFixed(0)} steps=${st.stepCount}`).join(" | ")
      : "none";
    const railWalls = s.walls.filter((wl) => wl.railSpans?.length);
    console.log(`  ${region.id.padEnd(8)} walls=${String(s.walls.length).padStart(2)} stairs=[${stairDesc}]`);
    for (const wl of railWalls) {
      const runLen = Math.abs(wl.axis === "vertical" ? wl.end[1] - wl.start[1] : wl.end[0] - wl.start[0]);
      const spans = wl.railSpans.map(([a, b]) => `${(a * 100).toFixed(0)}-${(b * 100).toFixed(0)}%`).join(",");
      console.log(`           RAIL ${wl.id} ${wl.axis} run=${runLen.toFixed(0)}px spans=[${spans}]`);
    }
  }
}
