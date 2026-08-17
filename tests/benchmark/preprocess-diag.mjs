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

async function rasterize(pipeline) {
  const { data, info } = await pipeline.resize(w, h, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
}

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
  return counts[1];
}

function profileWall(wall, mask, W, H) {
  const runStart = wall.axis === "vertical" ? wall.start[1] : wall.start[0];
  const runEnd = wall.axis === "vertical" ? wall.end[1] : wall.end[0];
  const line = wall.axis === "vertical" ? (wall.start[0] + wall.end[0]) / 2 : (wall.start[1] + wall.end[1]) / 2;
  const t = Math.max(3, wall.thickness);
  const maxHalf = Math.max(4, Math.round(t * 1.5));
  let profile = "";
  for (let i = 0; i < 40; i += 1) {
    const p = runStart + (runEnd - runStart) * i / 39;
    const lt = localThickness(mask, W, H, wall.axis, line, p, maxHalf);
    profile += lt === 0 ? "." : String(Math.min(9, lt));
  }
  return profile;
}

const variants = {
  baseline: () => sharp(buffer),
  "normalize+sharpen": () => sharp(buffer).normalize().sharpen({ sigma: 1.2 }),
  "grayscale+linear+sharpen": () => sharp(buffer).grayscale().linear(1.6, -60).sharpen({ sigma: 1.5 }),
};

for (const [name, make] of Object.entries(variants)) {
  const { data, W, H } = await rasterize(make());
  const regions = detectPlanRegions(data, W, H);
  const upper = regions[regions.length - 1];
  const structure = detectFloorStructure(data, W, H, upper);
  const ev = inspectStructureEvidence(data, W, H, upper);
  console.log(`\n=== ${name} (upper region, ${structure.walls.length} walls) ===`);
  for (const wall of structure.walls.filter((wl) => wl.axis === "vertical")) {
    console.log(`${wall.id.padEnd(18)} t=${wall.thickness.toFixed(0)}px [${profileWall(wall, ev.mediumMask, W, H)}]`);
  }
}
