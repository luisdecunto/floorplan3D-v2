// Does detection depend on the resolution the plan is uploaded at?
// Feeds the same plan at several sizes and reports what each yields.
import { readFile } from "node:fs/promises";
import { detectPlanRegions } from "../../app/plan-regions.ts";
import { detectFloorStructures, resolveScaleFromDoors } from "../../app/structure-detector.ts";
const dir = new URL("../fixtures/floorplans/", import.meta.url);
const { default: sharp } = await import("sharp");
const src = await readFile(new URL("rowhouse.jpg", dir));
const meta = await sharp(src).metadata();

for (const factor of [0.6, 0.8, 1, 1.4, 2, 3]) {
  const sw = Math.round(meta.width * factor);
  const sh = Math.round(meta.height * factor);
  const up = await sharp(src).resize(sw, sh, { kernel: "lanczos3" }).png().toBuffer();
  // Same intake the app uses: downscale only, to a 1280 px long side.
  const s0 = Math.min(1, 1280 / Math.max(sw, sh));
  const W = Math.round(sw * s0), H = Math.round(sh * s0);
  const { data, info } = await sharp(up).resize(W, H, { fit: "fill" }).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const regions = detectPlanRegions(data, info.width, info.height);
  const structures = detectFloorStructures(data, info.width, info.height, regions);
  const mpp = resolveScaleFromDoors(structures)?.metresPerPixel;
  const counts = {};
  let total = 0;
  for (const r of regions) for (const f of structures[r.id].fixtures ?? []) {
    counts[f.kind] = (counts[f.kind] ?? 0) + 1; total += 1;
  }
  const order = Object.keys(counts).sort().map((k) => `${k}:${counts[k]}`).join(" ");
  console.log(`${String(factor).padStart(4)}x  source ${String(sw).padStart(4)}x${String(sh).padStart(4)}` +
    ` -> working ${String(info.width).padStart(4)}x${String(info.height).padStart(4)}` +
    `  regions=${regions.length}  total=${String(total).padStart(2)}  ${order}`);
}
