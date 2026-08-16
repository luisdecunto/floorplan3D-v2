// Visual regression aid: draws detected structure over each private fixture
// so a detector change can be inspected by eye, not just by aggregate score.
// Requires the git-ignored private corpus at tests/fixtures/floorplans/.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { detectPlanRegions } from "../../app/plan-regions.ts";
import { alignAdjacentStairStructures, detectFloorStructures } from "../../app/structure-detector.ts";

const fixtureDirectory = new URL("../fixtures/floorplans/", import.meta.url);
const outDirectory = new URL("./out/", import.meta.url);
const manifestUrl = new URL("manifest.json", fixtureDirectory);

const manifest = await readFile(manifestUrl, "utf8")
  .then((contents) => JSON.parse(contents))
  .catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });

if (!manifest) {
  console.log("Private floorplan corpus is absent; nothing to render.");
  process.exit(0);
}

const { default: sharp } = await import("sharp");
await mkdir(outDirectory, { recursive: true });

const OPENING_COLOR = { door: "#16a34a", window: "#ea580c" };
const EVIDENCE_OPACITY = { symbol: 1, geometry: 0.75, context: 0.5 };
// Source walls are usually near-black, so overlay strokes must be bright,
// saturated colors with a white halo to stay visible against them.
const WEIGHT_COLOR = { heavy: "#ff2fb0", light: "#00c2ff" };

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function buildOverlaySvg(width, height, structures, regions) {
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`];
  for (const region of regions) {
    const structure = structures[region.id];
    if (!structure) continue;
    const transform = structure.sourceRotationDegrees && structure.rotationCenter
      ? ` transform="rotate(${structure.sourceRotationDegrees} ${structure.rotationCenter[0]} ${structure.rotationCenter[1]})"`
      : "";
    parts.push(`<g${transform}>`);

    for (const area of structure.outdoorAreas ?? []) {
      parts.push(`<rect x="${area.x}" y="${area.y}" width="${area.width}" height="${area.height}" fill="rgba(147,51,234,0.18)" stroke="#7c3aed" stroke-width="1.5" />`);
    }

    for (const stair of structure.stairs ?? []) {
      parts.push(`<rect x="${stair.x}" y="${stair.y}" width="${stair.width}" height="${stair.height}" fill="rgba(220,38,38,0.12)" stroke="#dc2626" stroke-width="1.5" />`);
      parts.push(`<text x="${stair.x + 2}" y="${stair.y + 10}" font-size="9" fill="#dc2626">${stair.stepCount} steps</text>`);
    }

    for (const room of structure.rooms ?? []) {
      const points = room.polygon.map(([x, y]) => `${x},${y}`).join(" ");
      const cx = room.polygon.reduce((sum, [x]) => sum + x, 0) / room.polygon.length;
      const cy = room.polygon.reduce((sum, [, y]) => sum + y, 0) / room.polygon.length;
      parts.push(`<polygon points="${points}" fill="rgba(37,99,235,0.08)" stroke="#93c5fd" stroke-width="1" stroke-dasharray="3,2" />`);
      parts.push(`<text x="${cx}" y="${cy}" font-size="9" fill="#1d4ed8" text-anchor="middle">${escapeAttr(room.id)}</text>`);
    }

    for (const wall of structure.walls) {
      const color = WEIGHT_COLOR[wall.weight ?? "heavy"];
      const strokeWidth = Math.max(2.5, wall.thickness * 0.5);
      parts.push(`<line x1="${wall.start[0]}" y1="${wall.start[1]}" x2="${wall.end[0]}" y2="${wall.end[1]}" stroke="white" stroke-width="${strokeWidth + 2}" stroke-linecap="round" stroke-opacity="0.9" />`);
      parts.push(`<line x1="${wall.start[0]}" y1="${wall.start[1]}" x2="${wall.end[0]}" y2="${wall.end[1]}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" />`);
      const dx = wall.end[0] - wall.start[0];
      const dy = wall.end[1] - wall.start[1];
      const length = Math.max(1, Math.hypot(dx, dy));
      for (const opening of wall.openings) {
        const from = opening.offset / length;
        const to = (opening.offset + opening.width) / length;
        const x1 = wall.start[0] + dx * from;
        const y1 = wall.start[1] + dy * from;
        const x2 = wall.start[0] + dx * to;
        const y2 = wall.start[1] + dy * to;
        const color = OPENING_COLOR[opening.kind];
        const opacity = EVIDENCE_OPACITY[opening.evidence ?? "context"];
        parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="4" stroke-opacity="${opacity}" />`);
      }
    }
    parts.push("</g>");
  }
  parts.push("</svg>");
  return parts.join("");
}

for (const fixture of manifest.fixtures) {
  const buffer = await readFile(new URL(fixture.file, fixtureDirectory));
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(fixture.width, fixture.height));
  const width = Math.max(1, Math.round(fixture.width * scale));
  const height = Math.max(1, Math.round(fixture.height * scale));
  const { data, info } = await sharp(buffer)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const regions = detectPlanRegions(data, info.width, info.height);
  const structuresRaw = detectFloorStructures(data, info.width, info.height, regions);
  const structures = regions.length === 2 ? alignAdjacentStairStructures(regions, structuresRaw) : structuresRaw;
  const overlay = buildOverlaySvg(info.width, info.height, structures, regions);

  const composed = await sharp(buffer)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .composite([{ input: Buffer.from(overlay) }])
    .png()
    .toBuffer();

  await writeFile(new URL(`${fixture.id}.png`, outDirectory), composed);
  console.log(`wrote ${fixture.id}.png (${regions.length} region${regions.length === 1 ? "" : "s"})`);
}
