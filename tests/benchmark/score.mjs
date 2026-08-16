// Ground-truth-free regression signal: reports structural counts and a wall
// pixel-coverage ratio per fixture region so a detector change can be judged
// by how much more (or less) of the drawn structure it explains, without
// requiring hand-annotated coordinates for the private corpus.
import { readFile } from "node:fs/promises";
import { detectPlanRegions } from "../../app/plan-regions.ts";
import {
  alignAdjacentStairStructures,
  detectFloorStructures,
  inspectStructureEvidence,
} from "../../app/structure-detector.ts";

const fixtureDirectory = new URL("../fixtures/floorplans/", import.meta.url);
const manifestUrl = new URL("manifest.json", fixtureDirectory);

const manifest = await readFile(manifestUrl, "utf8")
  .then((contents) => JSON.parse(contents))
  .catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });

if (!manifest) {
  console.log("Private floorplan corpus is absent; nothing to score.");
  process.exit(0);
}

const { default: sharp } = await import("sharp");

function wallCoverageRatio(structure, evidence, width, height) {
  const { bounds, strongMask } = evidence;
  const covered = new Uint8Array(width * height);
  for (const wall of structure.walls) {
    const halfBand = Math.max(1.5, wall.thickness * 0.65);
    const dx = wall.end[0] - wall.start[0];
    const dy = wall.end[1] - wall.start[1];
    const length = Math.max(1e-6, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;
    const minX = Math.max(bounds.minX, Math.floor(Math.min(wall.start[0], wall.end[0]) - halfBand));
    const maxX = Math.min(bounds.maxX, Math.ceil(Math.max(wall.start[0], wall.end[0]) + halfBand));
    const minY = Math.max(bounds.minY, Math.floor(Math.min(wall.start[1], wall.end[1]) - halfBand));
    const maxY = Math.min(bounds.maxY, Math.ceil(Math.max(wall.start[1], wall.end[1]) + halfBand));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const px = x - wall.start[0];
        const py = y - wall.start[1];
        const along = px * ux + py * uy;
        if (along < -halfBand || along > length + halfBand) continue;
        const perpendicular = Math.abs(px * uy - py * ux);
        if (perpendicular <= halfBand) covered[y * width + x] = 1;
      }
    }
  }
  let coveredDark = 0;
  let totalDark = 0;
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const index = y * width + x;
      if (!strongMask[index]) continue;
      totalDark += 1;
      if (covered[index]) coveredDark += 1;
    }
  }
  return totalDark ? coveredDark / totalDark : 0;
}

function summarizeOpenings(structure) {
  const openings = structure.walls.flatMap((wall) => wall.openings);
  const byKind = { door: 0, window: 0 };
  const byEvidence = { symbol: 0, geometry: 0, context: 0 };
  openings.forEach((opening) => {
    byKind[opening.kind] += 1;
    byEvidence[opening.evidence ?? "context"] += 1;
  });
  return { total: openings.length, byKind, byEvidence };
}

const rows = [];
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

  regions.forEach((region, index) => {
    const structure = structures[region.id];
    const evidence = inspectStructureEvidence(data, info.width, info.height, region);
    const coverage = wallCoverageRatio(structure, evidence, info.width, info.height);
    const openings = summarizeOpenings(structure);
    rows.push({
      fixture: fixture.id,
      region: `${index + 1}/${regions.length}`,
      walls: structure.walls.length,
      heavy: structure.walls.filter((wall) => (wall.weight ?? "heavy") === "heavy").length,
      light: structure.walls.filter((wall) => wall.weight === "light").length,
      rooms: structure.rooms?.length ?? structure.roomCount,
      doors: openings.byKind.door,
      windows: openings.byKind.window,
      symbolOpenings: openings.byEvidence.symbol,
      stairs: structure.stairs.length,
      balconies: structure.outdoorAreas.length,
      confidence: structure.confidence.toFixed(2),
      coverage: `${(coverage * 100).toFixed(1)}%`,
    });
  });
}

const columns = ["fixture", "region", "walls", "heavy", "light", "rooms", "doors", "windows", "symbolOpenings", "stairs", "balconies", "confidence", "coverage"];
const widths = columns.map((column) => Math.max(column.length, ...rows.map((row) => String(row[column]).length)));
const formatRow = (values) => values.map((value, index) => String(value).padEnd(widths[index])).join("  ");
console.log(formatRow(columns));
console.log(widths.map((width) => "-".repeat(width)).join("  "));
rows.forEach((row) => console.log(formatRow(columns.map((column) => row[column]))));

const meanCoverage = rows.reduce((sum, row) => sum + parseFloat(row.coverage), 0) / rows.length;
console.log(`\nmean wall coverage across ${rows.length} regions: ${meanCoverage.toFixed(1)}%`);
