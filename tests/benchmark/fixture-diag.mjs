import { readFile } from "node:fs/promises";
import { detectPlanRegions } from "../../app/plan-regions.ts";
import { detectFloorStructures } from "../../app/structure-detector.ts";

const dir = new URL("../fixtures/floorplans/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", dir), "utf8"));
const { default: sharp } = await import("sharp");

for (const fixture of manifest.fixtures) {
  const buffer = await readFile(new URL(fixture.file, dir));
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(fixture.width, fixture.height));
  const width = Math.max(1, Math.round(fixture.width * scale));
  const height = Math.max(1, Math.round(fixture.height * scale));
  const { data, info } = await sharp(buffer).resize(width, height, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const regions = detectPlanRegions(data, info.width, info.height);
  const structures = detectFloorStructures(data, info.width, info.height, regions);
  const counts = {};
  let total = 0;
  for (const region of regions) {
    for (const f of structures[region.id].fixtures ?? []) {
      counts[f.kind] = (counts[f.kind] ?? 0) + 1;
      total += 1;
    }
  }
  console.log(`${fixture.id}: ${total} fixtures`, JSON.stringify(counts));
}
