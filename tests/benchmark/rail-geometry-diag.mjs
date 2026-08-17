// Replicates StairwellTrim exactly and prints every rail segment it emits, so
// visual artifacts can be traced to concrete geometry.
import { readFile } from "node:fs/promises";
import { detectPlanRegions } from "../../app/plan-regions.ts";
import { detectFloorStructures, alignAdjacentStairStructures, structureToLevel, resolveScaleFromDoors } from "../../app/structure-detector.ts";
import { suggestBuildingOrder } from "../../app/floorplan-document.ts";
import { buildStairConnections, stairwellOpening } from "../../app/scene-geometry.ts";

const dir = new URL("../fixtures/floorplans/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", dir), "utf8"));
const fx = manifest.fixtures.find((f) => f.id === (process.argv[2] ?? "fp-001"));
const { default: sharp } = await import("sharp");

const buffer = await readFile(new URL(fx.file, dir));
const sc0 = Math.min(1, 1280 / Math.max(fx.width, fx.height));
const { data, info } = await sharp(buffer).resize(Math.round(fx.width * sc0), Math.round(fx.height * sc0), { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

let regions = detectPlanRegions(data, info.width, info.height);
let structures = detectFloorStructures(data, info.width, info.height, regions);
regions = suggestBuildingOrder(regions, structures);
if (regions.length === 2) structures = alignAdjacentStairStructures(regions, structures);
const scale = resolveScaleFromDoors(structures) ?? undefined;
const levels = regions.map((r, i) => structureToLevel(structures[r.id], r, i, scale));
const connections = buildStairConnections(levels);
const openings = new Map(connections.map((c) => [c.upperLevelId, c.opening]));
const access = new Map(connections.map((c) => [c.upperLevelId, { point: c.upperFlight.end, width: c.width }]));

function subtractIntervals(span, cuts) {
  let segs = [[span[0], span[1]]];
  for (const [cs, ce] of cuts) {
    const next = [];
    for (const [ss, se] of segs) {
      if (ce <= ss || cs >= se) { next.push([ss, se]); continue; }
      if (cs > ss) next.push([ss, cs]);
      if (ce < se) next.push([ce, se]);
    }
    segs = next;
  }
  return segs.filter(([s, e]) => e - s > 0.2);
}

function activate(walls, opening) {
  if (!opening) return walls.map((w) => ({ ...w, railSpans: undefined }));
  const tol = 0.36;
  const L = opening.x - opening.width / 2, R = opening.x + opening.width / 2;
  const B = opening.z - opening.depth / 2, F = opening.z + opening.depth / 2;
  return walls.map((w) => {
    if (!w.railSpans?.length) return w;
    const isV = Math.abs(w.end[0] - w.start[0]) < Math.abs(w.end[1] - w.start[1]);
    const line = isV ? (w.start[0] + w.end[0]) / 2 : (w.start[1] + w.end[1]) / 2;
    const onEdge = isV ? (Math.abs(line - L) <= tol || Math.abs(line - R) <= tol)
                       : (Math.abs(line - B) <= tol || Math.abs(line - F) <= tol);
    if (!onEdge) return { ...w, railSpans: undefined };
    const len = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);
    const rs = isV ? w.start[1] : w.start[0];
    const d = isV ? w.end[1] - w.start[1] : w.end[0] - w.start[0];
    const [lo, hi] = isV ? [B, F] : [L, R];
    const toLocal = (abs) => ((abs - rs) / d) * len;
    const kept = [];
    for (const [f, t] of w.railSpans) {
      const a = rs + d * (f / len), b = rs + d * (t / len);
      const cl = Math.max(Math.min(a, b), lo), ch = Math.min(Math.max(a, b), hi);
      if (ch - cl <= 0.05) continue;
      const e1 = toLocal(cl), e2 = toLocal(ch);
      const lf = Math.max(0, Math.min(e1, e2)), lt = Math.min(len, Math.max(e1, e2));
      if (lt - lf > 0.05) kept.push([lf, lt]);
    }
    return kept.length ? { ...w, railSpans: kept } : { ...w, railSpans: undefined };
  });
}

levels.forEach((level, index) => {
  const opening = index > 0 ? (openings.get(level.id) ?? stairwellOpening(level)) : null;
  if (!opening) return;
  const walls = activate(level.walls, opening);
  const acc = access.get(level.id) ?? null;
  const tol = 0.32;
  const L = opening.x - opening.width / 2, R = opening.x + opening.width / 2;
  const B = opening.z - opening.depth / 2, F = opening.z + opening.depth / 2;
  console.log(`\n=== ${fx.id} level[${index}] "${level.name}" (${level.id})`);
  console.log(`opening x=[${L.toFixed(2)},${R.toFixed(2)}] z=[${B.toFixed(2)},${F.toFixed(2)}]`);
  if (acc) console.log(`access point=[${acc.point[0].toFixed(2)},${acc.point[1].toFixed(2)}] width=${acc.width.toFixed(2)}`);

  const railAbs = (w) => {
    if (!w.railSpans?.length) return [];
    const len = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);
    if (len < 0.01) return [];
    const isV = Math.abs(w.end[0] - w.start[0]) < Math.abs(w.end[1] - w.start[1]);
    const d = isV ? w.end[1] - w.start[1] : w.end[0] - w.start[0];
    const rs = isV ? w.start[1] : w.start[0];
    return w.railSpans.map(([f, t]) => {
      const a = rs + d * (f / len), b = rs + d * (t / len);
      return [Math.min(a, b), Math.max(a, b)];
    });
  };
  const cutsOn = (coord, axis) => {
    const cuts = [];
    for (const w of walls) {
      const isH = Math.abs(w.end[1] - w.start[1]) < Math.abs(w.end[0] - w.start[0]);
      const isV = !isH;
      if (axis === "z" && isH && Math.abs((w.start[1] + w.end[1]) / 2 - coord) <= tol) {
        const full = [Math.min(w.start[0], w.end[0]) - tol, Math.max(w.start[0], w.end[0]) + tol];
        const r = railAbs(w);
        cuts.push(...(r.length ? subtractIntervals(full, r) : [full]));
      }
      if (axis === "x" && isV && Math.abs((w.start[0] + w.end[0]) / 2 - coord) <= tol) {
        const full = [Math.min(w.start[1], w.end[1]) - tol, Math.max(w.start[1], w.end[1]) + tol];
        const r = railAbs(w);
        cuts.push(...(r.length ? subtractIntervals(full, r) : [full]));
      }
    }
    return cuts;
  };

  let accEdge = null, accGap = null;
  if (acc) {
    const [ax, az] = acc.point, half = acc.width / 2;
    const cand = [
      { id: "back", d: Math.abs(az - B), gap: [ax - half, ax + half] },
      { id: "front", d: Math.abs(az - F), gap: [ax - half, ax + half] },
      { id: "left", d: Math.abs(ax - L), gap: [az - half, az + half] },
      { id: "right", d: Math.abs(ax - R), gap: [az - half, az + half] },
    ];
    const n = cand.reduce((b, e) => (e.d < b.d ? e : b));
    accEdge = n.id; accGap = n.gap;
    console.log(`access edge=${accEdge} gap=[${accGap[0].toFixed(2)},${accGap[1].toFixed(2)}]`);
  }

  for (const w of walls.filter((x) => x.railSpans?.length)) {
    const isV = Math.abs(w.end[0] - w.start[0]) < Math.abs(w.end[1] - w.start[1]);
    const len = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);
    const d = isV ? w.end[1] - w.start[1] : w.end[0] - w.start[0];
    const rsx = isV ? w.start[1] : w.start[0];
    console.log(`  WALL ${w.id} len=${len.toFixed(2)} gapAbs=${JSON.stringify(w.railSpans.map(([f, t]) => [+(rsx + d * (f / len)).toFixed(2), +(rsx + d * (t / len)).toFixed(2)]))}`);
  }

  const edges = [
    { id: "back", fixed: B, edgeAxis: "z", axis: "x", span: [L, R] },
    { id: "front", fixed: F, edgeAxis: "z", axis: "x", span: [L, R] },
    { id: "left", fixed: L, edgeAxis: "x", axis: "z", span: [B, F] },
    { id: "right", fixed: R, edgeAxis: "x", axis: "z", span: [B, F] },
  ];
  for (const e of edges) {
    const cuts = cutsOn(e.fixed, e.edgeAxis);
    if (e.id === accEdge && accGap) cuts.push(accGap);
    const segs = subtractIntervals(e.span, cuts);
    console.log(`  edge ${e.id.padEnd(5)} fixed=${e.fixed.toFixed(2)} span=[${e.span[0].toFixed(2)},${e.span[1].toFixed(2)}] cuts=${JSON.stringify(cuts.map((c) => c.map((v) => +v.toFixed(2))))}`);
    for (const s of segs) {
      const len = s[1] - s[0];
      const pos = e.axis === "x" ? `[${((s[0] + s[1]) / 2).toFixed(2)}, y, ${e.fixed.toFixed(2)}]` : `[${e.fixed.toFixed(2)}, y, ${((s[0] + s[1]) / 2).toFixed(2)}]`;
      console.log(`     RAIL len=${len.toFixed(2)} at ${pos}  posts=${Math.max(2, Math.ceil(len / 1.0)) + 1}`);
    }
    if (!segs.length) console.log(`     (no rail)`);
  }
});
