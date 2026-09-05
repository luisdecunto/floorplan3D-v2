import type { FurnitureCatalogItem } from "./furniture-catalog.ts";
import { clampFurniturePosition, furnitureCollisionParts, furnitureVerticalBounds } from "./furniture-catalog.ts";
import type { Level, Wall } from "./scene-data.ts";

export type FurniturePosition = { x: number; z: number };

export type FurnitureMoveResult = {
  position: FurniturePosition;
  collision: FurnitureCollisionReason;
};

export type FurnitureCollisionReason = "wall" | "door" | "fixture" | "stair" | "furniture" | null;

export type FurnitureObstacle = {
  id: string;
  item: FurnitureCatalogItem;
  position: FurniturePosition;
  rotation: number;
  mirrored?: boolean;
};

type Axis = { x: number; z: number };

type OrientedRectangle = {
  kind: "box";
  center: FurniturePosition;
  axisX: Axis;
  axisZ: Axis;
  halfWidth: number;
  halfDepth: number;
};

type Circle = {
  kind: "circle";
  center: FurniturePosition;
  radius: number;
};

type CollisionShape = OrientedRectangle | Circle;
type PlacementLevel = Pick<Level, "slab" | "walls" | "fixtures" | "stairs"> & Partial<Pick<Level, "ceilingHeight">>;

const WALL_CLEARANCE = 0.035;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

function snapCoordinate(value: number, origin: number, gridSize: number) {
  if (gridSize <= 0) return value;
  return origin + Math.round((value - origin) / gridSize) * gridSize;
}

export function snapFurniturePosition(
  position: FurniturePosition,
  level: Pick<Level, "slab">,
  gridSize: number,
) {
  return {
    x: snapCoordinate(position.x, level.slab.x, gridSize),
    z: snapCoordinate(position.z, level.slab.z, gridSize),
  };
}

function furnitureShapes(
  item: FurnitureCatalogItem,
  rotation: number,
  position: FurniturePosition,
  mirrored = false,
): CollisionShape[] {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return furnitureCollisionParts(item).map((part) => {
    const localX = (part.x ?? 0) * (mirrored ? -1 : 1);
    const localZ = part.z ?? 0;
    const center = {
      x: position.x + localX * cosine + localZ * sine,
      z: position.z - localX * sine + localZ * cosine,
    };
    return part.kind === "circle"
      ? { kind: "circle" as const, center, radius: part.radius + WALL_CLEARANCE }
      : {
        kind: "box" as const, center,
        axisX: { x: cosine, z: -sine }, axisZ: { x: sine, z: cosine },
        halfWidth: part.width / 2 + WALL_CLEARANCE, halfDepth: part.depth / 2 + WALL_CLEARANCE,
      };
  });
}

function wallRectangle(wall: Wall, from: number, to: number): OrientedRectangle | null {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  if (length <= 0.001 || to - from <= 0.001) return null;
  const axisX = { x: dx / length, z: dz / length };
  const axisZ = { x: -axisX.z, z: axisX.x };
  const distance = (from + to) / 2;
  return {
    kind: "box",
    center: {
      x: wall.start[0] + axisX.x * distance,
      z: wall.start[1] + axisX.z * distance,
    },
    axisX,
    axisZ,
    halfWidth: (to - from) / 2,
    halfDepth: (wall.thickness ?? 0.18) / 2 + WALL_CLEARANCE,
  };
}

function solidWallRuns(wall: Wall) {
  const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  const doors = (wall.openings ?? [])
    .filter((opening) => opening.kind === "door")
    .map((opening) => ({
      from: clamp(opening.offset, 0, length),
      to: clamp(opening.offset + opening.width, 0, length),
    }))
    .filter((opening) => opening.to - opening.from > 0.01)
    .sort((a, b) => a.from - b.from);
  const runs: Array<{ from: number; to: number }> = [];
  let cursor = 0;
  doors.forEach((door) => {
    if (door.from > cursor + 0.01) runs.push({ from: cursor, to: door.from });
    cursor = Math.max(cursor, door.to);
  });
  if (cursor < length - 0.01) runs.push({ from: cursor, to: length });
  return runs;
}

function dot(left: Axis, right: Axis) {
  return left.x * right.x + left.z * right.z;
}

function projectionRadius(rectangle: OrientedRectangle, axis: Axis) {
  return rectangle.halfWidth * Math.abs(dot(rectangle.axisX, axis))
    + rectangle.halfDepth * Math.abs(dot(rectangle.axisZ, axis));
}

function rectanglesOverlap(left: OrientedRectangle, right: OrientedRectangle) {
  const centerDelta = {
    x: right.center.x - left.center.x,
    z: right.center.z - left.center.z,
  };
  return [left.axisX, left.axisZ, right.axisX, right.axisZ].every((axis) => (
    Math.abs(dot(centerDelta, axis)) < projectionRadius(left, axis) + projectionRadius(right, axis) - 0.0001
  ));
}

function mountableWallRuns(wall: Wall) {
  const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  const openings = (wall.openings ?? []).map((opening) => ({
    from: clamp(opening.offset, 0, length),
    to: clamp(opening.offset + opening.width, 0, length),
  })).filter((opening) => opening.to - opening.from > 0.01).sort((a, b) => a.from - b.from);
  const runs: Array<{ from: number; to: number }> = [];
  let cursor = 0;
  openings.forEach((opening) => {
    if (opening.from > cursor + 0.01) runs.push({ from: cursor, to: opening.from });
    cursor = Math.max(cursor, opening.to);
  });
  if (cursor < length - 0.01) runs.push({ from: cursor, to: length });
  return runs;
}

function circleAndRectangleOverlap(circle: Circle, rectangle: OrientedRectangle) {
  const delta = { x: circle.center.x - rectangle.center.x, z: circle.center.z - rectangle.center.z };
  const localX = dot(delta, rectangle.axisX);
  const localZ = dot(delta, rectangle.axisZ);
  const nearestX = clamp(localX, -rectangle.halfWidth, rectangle.halfWidth);
  const nearestZ = clamp(localZ, -rectangle.halfDepth, rectangle.halfDepth);
  return Math.hypot(localX - nearestX, localZ - nearestZ) < circle.radius - 0.0001;
}

function shapesOverlap(left: CollisionShape, right: CollisionShape) {
  if (left.kind === "box" && right.kind === "box") return rectanglesOverlap(left, right);
  if (left.kind === "circle" && right.kind === "circle") {
    return Math.hypot(left.center.x - right.center.x, left.center.z - right.center.z) < left.radius + right.radius - 0.0001;
  }
  return left.kind === "circle" ? circleAndRectangleOverlap(left, right as OrientedRectangle) : circleAndRectangleOverlap(right as Circle, left);
}

function overlapsAny(left: CollisionShape[], right: CollisionShape[]) {
  return left.some((leftShape) => right.some((rightShape) => shapesOverlap(leftShape, rightShape)));
}

function verticalRangesOverlap(left: FurnitureCatalogItem, right: FurnitureCatalogItem, ceilingHeight: number) {
  const leftRange = furnitureVerticalBounds(left, ceilingHeight);
  const rightRange = furnitureVerticalBounds(right, ceilingHeight);
  return leftRange.min < rightRange.max - 0.001 && rightRange.min < leftRange.max - 0.001;
}

export function furnitureIntersectsWalls(
  item: FurnitureCatalogItem,
  level: Pick<Level, "walls">,
  rotation: number,
  position: FurniturePosition,
  mirrored = false,
) {
  // Wall-mounted items are intentionally flush with their supporting wall.
  // Door/window runs are avoided by the initial wall-placement helper below.
  if (item.mount?.type === "wall") return false;
  const furniture = furnitureShapes(item, rotation, position, mirrored);
  return level.walls.some((wall) => solidWallRuns(wall).some(({ from, to }) => {
    const obstacle = wallRectangle(wall, from, to);
    return obstacle ? overlapsAny(furniture, [obstacle]) : false;
  }));
}

export function furnitureIntersectsDoors(
  item: FurnitureCatalogItem,
  level: Pick<Level, "walls">,
  rotation: number,
  position: FurniturePosition,
  mirrored = false,
) {
  const furniture = furnitureShapes(item, rotation, position, mirrored);
  return level.walls.some((wall) => (wall.openings ?? []).some((opening) => {
    if (opening.kind !== "door") return false;
    const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    const door = wallRectangle(
      { ...wall, thickness: Math.max(0.08, wall.thickness ?? 0.18) },
      clamp(opening.offset, 0, length),
      clamp(opening.offset + opening.width, 0, length),
    );
    return door ? overlapsAny(furniture, [door]) : false;
  }));
}

export function furnitureIntersectsFixtures(
  item: FurnitureCatalogItem,
  level: Pick<Level, "fixtures">,
  rotation: number,
  position: FurniturePosition,
  mirrored = false,
) {
  if (item.mount?.type === "ceiling") return false;
  const furniture = furnitureShapes(item, rotation, position, mirrored);
  return (level.fixtures ?? []).some((fixture) => overlapsAny(furniture, [{
    kind: "box",
    center: { x: fixture.x, z: fixture.z },
    axisX: { x: Math.cos(fixture.rotation), z: -Math.sin(fixture.rotation) },
    axisZ: { x: Math.sin(fixture.rotation), z: Math.cos(fixture.rotation) },
    halfWidth: fixture.width / 2,
    halfDepth: fixture.depth / 2,
  }]));
}

export function furnitureIntersectsStairs(
  item: FurnitureCatalogItem,
  level: Pick<Level, "stairs">,
  rotation: number,
  position: FurniturePosition,
  mirrored = false,
) {
  if (item.mount?.type === "ceiling") return false;
  const furniture = furnitureShapes(item, rotation, position, mirrored);
  return (level.stairs ?? []).some((stair) => overlapsAny(furniture, [{
    kind: "box",
    center: { x: stair.x, z: stair.z },
    axisX: { x: 1, z: 0 },
    axisZ: { x: 0, z: 1 },
    halfWidth: stair.width / 2,
    halfDepth: stair.depth / 2,
  }]));
}

export function furnitureIntersectsFurniture(
  item: FurnitureCatalogItem,
  rotation: number,
  position: FurniturePosition,
  obstacles: FurnitureObstacle[],
  mirrored = false,
  ceilingHeight = 2.7,
) {
  const furniture = furnitureShapes(item, rotation, position, mirrored);
  return obstacles.some((obstacle) => verticalRangesOverlap(item, obstacle.item, ceilingHeight) && overlapsAny(
    furniture,
    furnitureShapes(obstacle.item, obstacle.rotation, obstacle.position, obstacle.mirrored),
  ));
}

function preparedPosition(
  item: FurnitureCatalogItem,
  level: Pick<Level, "slab">,
  rotation: number,
  position: FurniturePosition,
  gridSize: number,
  mirrored: boolean,
) {
  const snapped = snapFurniturePosition(position, level, gridSize);
  return clampFurniturePosition(item, level.slab, rotation, snapped.x, snapped.z, mirrored);
}

export function previewFurniturePosition(
  item: FurnitureCatalogItem,
  level: PlacementLevel,
  rotation: number,
  position: FurniturePosition,
  gridSize = 0,
  obstacles: FurnitureObstacle[] = [],
  mirrored = false,
): FurnitureMoveResult {
  const prepared = preparedPosition(item, level, rotation, position, gridSize, mirrored);
  let collision: FurnitureCollisionReason = null;
  if (furnitureIntersectsWalls(item, level, rotation, prepared, mirrored)) collision = "wall";
  else if (furnitureIntersectsDoors(item, level, rotation, prepared, mirrored)) collision = "door";
  else if (furnitureIntersectsFixtures(item, level, rotation, prepared, mirrored)) collision = "fixture";
  else if (furnitureIntersectsStairs(item, level, rotation, prepared, mirrored)) collision = "stair";
  else if (furnitureIntersectsFurniture(item, rotation, prepared, obstacles, mirrored, level.ceilingHeight ?? 2.7)) collision = "furniture";
  return { position: prepared, collision };
}

export function validFurniturePosition(
  item: FurnitureCatalogItem,
  level: PlacementLevel,
  rotation: number,
  position: FurniturePosition,
  gridSize = 0,
  obstacles: FurnitureObstacle[] = [],
  mirrored = false,
) {
  const preview = previewFurniturePosition(item, level, rotation, position, gridSize, obstacles, mirrored);
  return preview.collision ? null : preview.position;
}

/**
 * Dragging is a preview, so only the target matters. The model may pass through
 * an obstacle on its way to another room; an invalid final target is reported
 * to the caller and must not be committed.
 */
export function resolveFurnitureMove(
  item: FurnitureCatalogItem,
  level: PlacementLevel,
  rotation: number,
  _from: FurniturePosition,
  target: FurniturePosition,
  gridSize = 0,
  obstacles: FurnitureObstacle[] = [],
  mirrored = false,
): FurnitureMoveResult {
  return previewFurniturePosition(item, level, rotation, target, gridSize, obstacles, mirrored);
}

export function findNearestValidFurniturePosition(
  item: FurnitureCatalogItem,
  level: PlacementLevel,
  rotation: number,
  preferred: FurniturePosition,
  gridSize = 0,
  obstacles: FurnitureObstacle[] = [],
  mirrored = false,
) {
  const direct = validFurniturePosition(item, level, rotation, preferred, gridSize, obstacles, mirrored);
  if (direct) return direct;

  const step = Math.max(gridSize, 0.2);
  const candidates: FurniturePosition[] = [];
  const left = level.slab.x - level.slab.width / 2;
  const right = level.slab.x + level.slab.width / 2;
  const back = level.slab.z - level.slab.depth / 2;
  const front = level.slab.z + level.slab.depth / 2;
  for (let x = left; x <= right + 0.001; x += step) {
    for (let z = back; z <= front + 0.001; z += step) candidates.push({ x, z });
  }
  candidates.sort((leftCandidate, rightCandidate) => (
    Math.hypot(leftCandidate.x - preferred.x, leftCandidate.z - preferred.z)
      - Math.hypot(rightCandidate.x - preferred.x, rightCandidate.z - preferred.z)
  ));
  for (const candidate of candidates) {
    const valid = validFurniturePosition(item, level, rotation, candidate, gridSize, obstacles, mirrored);
    if (valid) return valid;
  }
  return null;
}

/** Finds a clear solid wall run, places the item's back face flush to it and
 * points local -Z into the room. Existing placements remain plain x/z/rotation. */
export function findNearestWallMountedFurniturePlacement(
  item: FurnitureCatalogItem,
  level: PlacementLevel,
  preferred: FurniturePosition,
  obstacles: FurnitureObstacle[] = [],
) {
  if (item.mount?.type !== "wall") return null;
  const candidates: Array<{ position: FurniturePosition; rotation: number; distance: number }> = [];
  for (const wall of level.walls) {
    const dx = wall.end[0] - wall.start[0];
    const dz = wall.end[1] - wall.start[1];
    const length = Math.hypot(dx, dz);
    if (length <= 0.001) continue;
    const axisX = { x: dx / length, z: dz / length };
    const normal = { x: -axisX.z, z: axisX.x };
    const projected = (preferred.x - wall.start[0]) * axisX.x + (preferred.z - wall.start[1]) * axisX.z;
    const margin = item.width / 2 + WALL_CLEARANCE;
    for (const run of mountableWallRuns(wall)) {
      if (run.to - run.from < margin * 2) continue;
      const along = clamp(projected, run.from + margin, run.to - margin);
      const point = { x: wall.start[0] + axisX.x * along, z: wall.start[1] + axisX.z * along };
      const offset = (wall.thickness ?? 0.18) / 2 + item.depth / 2 + 0.006;
      for (const side of [-1, 1]) {
        const position = { x: point.x + normal.x * offset * side, z: point.z + normal.z * offset * side };
        const rotation = Math.atan2(-axisX.z, axisX.x) + (side === 1 ? Math.PI : 0);
        const footprint = clampFurniturePosition(item, level.slab, rotation, position.x, position.z);
        if (Math.hypot(footprint.x - position.x, footprint.z - position.z) > 0.015) continue;
        const valid = validFurniturePosition(item, level, rotation, position, 0, obstacles);
        if (!valid) continue;
        candidates.push({ position: valid, rotation, distance: Math.hypot(valid.x - preferred.x, valid.z - preferred.z) });
      }
    }
  }
  candidates.sort((left, right) => left.distance - right.distance);
  return candidates[0] ? { position: candidates[0].position, rotation: candidates[0].rotation } : null;
}
