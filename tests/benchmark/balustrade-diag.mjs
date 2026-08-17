import { readFile } from "node:fs/promises";
import { detectPlanRegions } from "../../app/plan-regions.ts";
import { detectFloorStructure, inspectStructureEvidence } from "../../app/structure-detector.ts";

const dir = new URL("../fixtures/floorplans/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", dir), "utf8"));
const fx = manifest.fixtures.find((f) => f.id === "fp-001");
const { default: sharp } = await import("sharp");

const buffer = await readFile(new URL(fx.file, dir));
const maxSide = 1280;
const scale = Math.min(1, maxSide / Math.max(fx.width, fx.height));
const w = Math.round(fx.width * scale), h = Math.round(fx.height * scale);
const { data, info } = await sharp(buffer).resize(w, h, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

// Local ink thickness perpendicular to the run at position p: the count of
// inked pixels within a window around the wall centreline (median over a few
// run rows for robustness).
function localThickness(mask, W, H, axis, line, p, maxHalf) {
  const counts = [];
  for (let d = -1; d <= 1; d += 1) {
    let c = 0;
    for (let off = -maxHalf; off <= maxHalf; off += 1) {
      const x = axis === "vertical" ? Math.round(line + off) : Math.round(p + d);
      const y = axis === "vertical" ? Math.round(p + d) : Math.round(line + off);
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      if (mask[y * W + x]) c += 1;
    }
    counts.push(c);
  }
  counts.sort((a, b) => a - b);
  return counts[1]; // median of the 3 run rows
}

const regions = detectPlanRegions(data, info.width, info.height);
for (const region of regions) {
  const structure = detectFloorStructure(data, info.width, info.height, region);
  console.log(`\n=== region ${region.id} rot=${(structure.sourceRotationDegrees ?? 0).toFixed(1)} ===`);
  const ev = inspectStructureEvidence(data, info.width, info.height, region);
  const mask = ev.mediumMask;
  for (const wall of structure.walls) {
    const runStart = wall.axis === "vertical" ? wall.start[1] : wall.start[0];
    const runEnd = wall.axis === "vertical" ? wall.end[1] : wall.end[0];
    const line = wall.axis === "vertical" ? (wall.start[0] + wall.end[0]) / 2 : (wall.start[1] + wall.end[1]) / 2;
    const t = Math.max(3, wall.thickness);
    const samples = 40;
    const maxHalf = Math.max(4, Math.round(t * 1.5));
    let profile = "";
    const thicks = [];
    for (let i = 0; i < samples; i += 1) {
      const p = runStart + (runEnd - runStart) * i / (samples - 1);
      const lt = localThickness(mask, info.width, info.height, wall.axis, line, p, maxHalf);
      thicks.push(lt);
      // Encode thickness as a digit 0-9 (clamped), "." for no ink (gap).
      profile += lt === 0 ? "." : String(Math.min(9, lt));
    }
    const runLen = Math.abs(runEnd - runStart);
    const nonzero = thicks.filter((x) => x > 0);
    const maxT = Math.max(0, ...nonzero);
    const minT = nonzero.length ? Math.min(...nonzero) : 0;
    console.log(`${wall.id.padEnd(18)} ${wall.axis.padEnd(10)} w=${wall.weight.padEnd(5)} t=${t.toFixed(0)}px run=${runLen.toFixed(0)} min/max=${minT}/${maxT} [${profile}]`);
  }
}
