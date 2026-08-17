import type { StairwellOpening } from "./scene-geometry";
import type { Wall } from "./scene-data";

/**
 * Geometry for the railing around a stairwell opening.
 *
 * Kept apart from the renderer so the invariant it guarantees — a wall only
 * loses geometry where railing stands in its place — can be checked directly.
 */

/** Remove every cut interval from `span`, returning the surviving sub-segments. */
export function subtractIntervals(span: [number, number], cuts: Array<[number, number]>): Array<[number, number]> {
  let segments: Array<[number, number]> = [[span[0], span[1]]];
  for (const [cutStart, cutEnd] of cuts) {
    const next: Array<[number, number]> = [];
    for (const [segStart, segEnd] of segments) {
      if (cutEnd <= segStart || cutStart >= segEnd) {
        next.push([segStart, segEnd]); // no overlap
        continue;
      }
      if (cutStart > segStart) next.push([segStart, cutStart]);
      if (cutEnd < segEnd) next.push([cutEnd, segEnd]);
    }
    segments = next;
  }
  // Drop slivers too short to read as a railing.
  return segments.filter(([s, e]) => e - s > 0.2);
}

const WALL_EDGE_TOLERANCE = 0.32;

/** Is this wall vertical (running along z) in scene space? */
export const isVerticalWall = (wall: Wall) => Math.abs(wall.end[0] - wall.start[0]) < Math.abs(wall.end[1] - wall.start[1]);

/**
 * A wall's rail spans as absolute run-axis coordinates. Deliberately unpadded:
 * the wall opens its gap at exactly these coordinates, so padding here would
 * draw railing across solid wall at each end.
 */
export function railSpansToAbsolute(wall: Wall): Array<[number, number]> {
  if (!wall.railSpans?.length) return [];
  const wallLength = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  if (wallLength < 0.01) return [];
  const vertical = isVerticalWall(wall);
  const dRun = vertical ? wall.end[1] - wall.start[1] : wall.end[0] - wall.start[0];
  const runStart = vertical ? wall.start[1] : wall.start[0];
  return wall.railSpans.map(([from, to]) => {
    const a = runStart + dRun * (from / wallLength);
    const b = runStart + dRun * (to / wallLength);
    return [Math.min(a, b), Math.max(a, b)] as [number, number];
  });
}

export type RailSegment = {
  key: string;
  axis: "x" | "z";
  fixed: number;
  from: number;
  to: number;
};

/**
 * The railing around a stairwell opening, as concrete segments.
 *
 * This is the single source of truth for where railing exists. Wall gaps are
 * derived from it rather than computed alongside it — when the two were worked
 * out independently they drifted apart, leaving railing buried in solid wall in
 * one direction and unfilled holes in the wall in the other.
 */
export function stairwellRailSegments(
  opening: StairwellOpening,
  walls: Wall[],
  access: { point: [number, number]; width: number } | null,
): RailSegment[] {
  const left = opening.x - opening.width / 2;
  const right = opening.x + opening.width / 2;
  const back = opening.z - opening.depth / 2;
  const front = opening.z + opening.depth / 2;

  // Intervals along an edge already covered by a structural wall. Those are
  // extruded full height, so railing must skip exactly them — but not the
  // sub-spans that wall marks as balustrade.
  const wallCutsOnEdge = (edgeCoord: number, edgeAxis: "x" | "z"): Array<[number, number]> => {
    const cuts: Array<[number, number]> = [];
    for (const wall of walls) {
      const vertical = isVerticalWall(wall);
      if (edgeAxis === "z" ? vertical : !vertical) continue;
      const line = edgeAxis === "z" ? (wall.start[1] + wall.end[1]) / 2 : (wall.start[0] + wall.end[0]) / 2;
      if (Math.abs(line - edgeCoord) > WALL_EDGE_TOLERANCE) continue;
      const runA = edgeAxis === "z" ? wall.start[0] : wall.start[1];
      const runB = edgeAxis === "z" ? wall.end[0] : wall.end[1];
      // The wall's own extent, unpadded. WALL_EDGE_TOLERANCE decides which walls
      // sit on this edge; using it to pad the span as well stopped railing 0.32m
      // short of a wall's end, leaving the opening un-railed into its corners.
      // Railing may butt against the end face — the sliver filter below still
      // discards anything too short to read.
      const fullSpan: [number, number] = [Math.min(runA, runB), Math.max(runA, runB)];
      const rails = railSpansToAbsolute(wall);
      cuts.push(...(rails.length ? subtractIntervals(fullSpan, rails) : [fullSpan]));
    }
    return cuts;
  };

  // The edge nearest the top-flight landing keeps a gap exactly as wide as the
  // flight — that is where you step onto the floor.
  let accessEdgeId: string | null = null;
  let accessGap: [number, number] | null = null;
  if (access) {
    const [ax, az] = access.point;
    const half = access.width / 2;
    const nearest = [
      { id: "back", distance: Math.abs(az - back), gap: [ax - half, ax + half] as [number, number] },
      { id: "front", distance: Math.abs(az - front), gap: [ax - half, ax + half] as [number, number] },
      { id: "left", distance: Math.abs(ax - left), gap: [az - half, az + half] as [number, number] },
      { id: "right", distance: Math.abs(ax - right), gap: [az - half, az + half] as [number, number] },
    ].reduce((best, edge) => (edge.distance < best.distance ? edge : best));
    accessEdgeId = nearest.id;
    accessGap = nearest.gap;
  }

  const edges = [
    { id: "back", fixed: back, edgeAxis: "z" as const, axis: "x" as const, span: [left, right] as [number, number] },
    { id: "front", fixed: front, edgeAxis: "z" as const, axis: "x" as const, span: [left, right] as [number, number] },
    { id: "left", fixed: left, edgeAxis: "x" as const, axis: "z" as const, span: [back, front] as [number, number] },
    { id: "right", fixed: right, edgeAxis: "x" as const, axis: "z" as const, span: [back, front] as [number, number] },
  ];

  return edges.flatMap((edge) => {
    const cuts = wallCutsOnEdge(edge.fixed, edge.edgeAxis);
    if (edge.id === accessEdgeId && accessGap) cuts.push(accessGap);
    return subtractIntervals(edge.span, cuts).map((segment, index) => ({
      key: `${edge.id}-${index}`,
      axis: edge.axis,
      fixed: edge.fixed,
      from: segment[0],
      to: segment[1],
    }));
  });
}

/**
 * Trim every wall's rail spans down to what the railing actually covers.
 *
 * Guarantees the invariant the render depends on: a wall only loses geometry
 * where a rail stands in its place. Anything the railing dropped — a sliver too
 * short to draw, or the landing's access gap — stays solid wall.
 */
export function clampWallGapsToRails(walls: Wall[], segments: RailSegment[]): Wall[] {
  if (!segments.length) return walls.map((wall) => (wall.railSpans ? { ...wall, railSpans: undefined } : wall));
  return walls.map((wall) => {
    if (!wall.railSpans?.length) return wall;
    const vertical = isVerticalWall(wall);
    const wallLength = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    const dRun = vertical ? wall.end[1] - wall.start[1] : wall.end[0] - wall.start[0];
    const runStart = vertical ? wall.start[1] : wall.start[0];
    if (wallLength < 0.01 || Math.abs(dRun) < 0.01) return { ...wall, railSpans: undefined };
    const line = vertical ? (wall.start[0] + wall.end[0]) / 2 : (wall.start[1] + wall.end[1]) / 2;
    // Only railing running along this wall's own line can fill its gap.
    const onLine = segments.filter((segment) => (
      segment.axis === (vertical ? "z" : "x") && Math.abs(segment.fixed - line) <= WALL_EDGE_TOLERANCE
    ));
    if (!onLine.length) return { ...wall, railSpans: undefined };

    const toLocal = (absolute: number) => ((absolute - runStart) / dRun) * wallLength;
    const kept: Array<[number, number]> = [];
    for (const [absFrom, absTo] of railSpansToAbsolute(wall)) {
      for (const segment of onLine) {
        const lo = Math.max(absFrom, segment.from);
        const hi = Math.min(absTo, segment.to);
        if (hi - lo <= 0.05) continue;
        const edgeA = toLocal(lo);
        const edgeB = toLocal(hi);
        const localFrom = Math.max(0, Math.min(edgeA, edgeB));
        const localTo = Math.min(wallLength, Math.max(edgeA, edgeB));
        if (localTo - localFrom > 0.05) kept.push([localFrom, localTo]);
      }
    }
    return kept.length ? { ...wall, railSpans: kept } : { ...wall, railSpans: undefined };
  });
}

/**
 * Keep only the rail spans that sit on an edge of the stairwell opening.
 *
 * A rail span removes solid wall geometry, and only `StairwellTrim` puts a
 * railing back — and it only rails the opening perimeter. A span anywhere else
 * would leave an unexplained hole in a wall, so those are dropped and the wall
 * renders solid. With no opening at all (any floor without a stairwell above),
 * every span is dropped.
 */
export function activateRailSpans(walls: Wall[], opening: StairwellOpening | null): Wall[] {
  if (!opening) return walls.map((wall) => (wall.railSpans ? { ...wall, railSpans: undefined } : wall));
  const tolerance = 0.36;
  const left = opening.x - opening.width / 2;
  const right = opening.x + opening.width / 2;
  const back = opening.z - opening.depth / 2;
  const front = opening.z + opening.depth / 2;

  return walls.map((wall) => {
    if (!wall.railSpans?.length) return wall;
    const isVertical = Math.abs(wall.end[0] - wall.start[0]) < Math.abs(wall.end[1] - wall.start[1]);
    const lineCoord = isVertical ? (wall.start[0] + wall.end[0]) / 2 : (wall.start[1] + wall.end[1]) / 2;
    // The wall must lie along one of the two opening edges parallel to it.
    const onEdge = isVertical
      ? (Math.abs(lineCoord - left) <= tolerance || Math.abs(lineCoord - right) <= tolerance)
      : (Math.abs(lineCoord - back) <= tolerance || Math.abs(lineCoord - front) <= tolerance);
    if (!onEdge) return { ...wall, railSpans: undefined };

    // …and each span is clipped to the opening's extent along that edge. Only
    // the opening perimeter gets railing, so a span running past it would open
    // wall geometry that nothing fills back in.
    const wallLength = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    const runStart = isVertical ? wall.start[1] : wall.start[0];
    const dRun = isVertical ? wall.end[1] - wall.start[1] : wall.end[0] - wall.start[0];
    if (wallLength < 0.01 || Math.abs(dRun) < 0.01) return { ...wall, railSpans: undefined };
    const [spanLo, spanHi] = isVertical ? [back, front] : [left, right];
    const toLocal = (absolute: number) => ((absolute - runStart) / dRun) * wallLength;

    const kept: Array<[number, number]> = [];
    for (const [from, to] of wall.railSpans) {
      const a = runStart + dRun * (from / wallLength);
      const b = runStart + dRun * (to / wallLength);
      const clippedLo = Math.max(Math.min(a, b), spanLo);
      const clippedHi = Math.min(Math.max(a, b), spanHi);
      if (clippedHi - clippedLo <= 0.05) continue;
      const edgeA = toLocal(clippedLo);
      const edgeB = toLocal(clippedHi);
      const localFrom = Math.max(0, Math.min(edgeA, edgeB));
      const localTo = Math.min(wallLength, Math.max(edgeA, edgeB));
      if (localTo - localFrom > 0.05) kept.push([localFrom, localTo]);
    }
    return kept.length ? { ...wall, railSpans: kept } : { ...wall, railSpans: undefined };
  });
}
