// Why does / doesn't markBalustradeSpans fire on a given region's stair edges?
import { readFile } from "node:fs/promises";
import { detectPlanRegions } from "../../app/plan-regions.ts";
import { detectFloorStructure, inspectStructureEvidence } from "../../app/structure-detector.ts";

const dir = new URL("../fixtures/floorplans/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", dir), "utf8"));
const fx = manifest.fixtures.find((f) => f.id === "fp-001");
const { default: sharp } = await import("sharp");
const buffer = await readFile(new URL(fx.file, dir));
const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;

function localThicknessAt(mask, axis, line, p, maxHalf) {
  const counts = [];
  for (let d = -1; d <= 1; d++) {
    let c = 0;
    for (let off = -maxHalf; off <= maxHalf; off++) {
      const x = axis === "vertical" ? Math.round(line + off) : Math.round(p + d);
      const y = axis === "vertical" ? Math.round(p + d) : Math.round(line + off);
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      if (mask[y * W + x]) c++;
    }
    counts.push(c);
  }
  counts.sort((a, b) => a - b);
  return counts[1];
}

for (const region of detectPlanRegions(data, W, H)) {
  const s = detectFloorStructure(data, W, H, region);
  const ev = inspectStructureEvidence(data, W, H, region);
  const wt = ev.wallThickness;
  const THIN = Math.max(4, wt * 0.55);
  const TOL = wt * 3;
  const stair = s.stairs[0];
  console.log(`\n=== region ${region.id}  wallThickness=${wt.toFixed(1)} THIN<=${THIN.toFixed(1)} stairTol=${TOL.toFixed(1)}`);
  console.log(`    stair: ${stair ? `x=${stair.x.toFixed(0)}..${(stair.x + stair.width).toFixed(0)} y=${stair.y.toFixed(0)}..${(stair.y + stair.height).toFixed(0)}` : "none"}`);
  for (const wall of s.walls.filter((w) => w.axis === "vertical")) {
    const cx = (wall.start[0] + wall.end[0]) / 2;
    const onEdge = stair && (Math.abs(cx - stair.x) <= TOL || Math.abs(cx - (stair.x + stair.width)) <= TOL);
    const maxHalf = Math.max(4, Math.round(wt * 1.5));
    const rs = wall.start[1], re = wall.end[1];
    const N = 60;
    const t = [];
    for (let i = 0; i < N; i++) t.push(localThicknessAt(ev.mediumMask, "vertical", cx, rs + (re - rs) * i / (N - 1), maxHalf));
    const thin = t.filter((v) => v > 0 && v <= THIN).length;
    const thick = t.filter((v) => v > THIN).length;
    const prof = t.map((v) => (v === 0 ? "." : String(Math.min(9, v)))).join("");
    console.log(`  ${wall.id.padEnd(18)} cx=${cx.toFixed(0)} t=${wall.thickness.toFixed(0)} y=${Math.min(rs, re).toFixed(0)}..${Math.max(rs, re).toFixed(0)} thin=${thin} thick=${thick} ${onEdge ? "ON-STAIR-EDGE" : ""} ${wall.railSpans ? "RAILS=" + JSON.stringify(wall.railSpans.map(([a, b]) => [+(a * 100).toFixed(0), +(b * 100).toFixed(0)])) : ""}`);
    console.log(`     [${prof}]`);
  }
}
