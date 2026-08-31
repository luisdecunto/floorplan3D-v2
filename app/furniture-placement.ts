import type { FurnitureCatalogItem } from "./furniture-catalog.ts";
import { clampFurniturePosition } from "./furniture-catalog.ts";
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
};

type Axis = { x: number; z: number };

type OrientedRectangle = {
  center: FurniturePosition;
  axisX: Axis;
  axisZ: Axis;
  halfWidth: number;
  halfDepth: number;
};

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

function furnitureRectangle(
  item: FurnitureCatalogItem,
  rotation: number,
  position: FurniturePosition,
): OrientedRectangle {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return {
    center: position,
    axisX: { x: cosine, z: -sine },
    axisZ: { x: sine, z: cosine },
    halfWidth: item.width / 2 + WALL_CLEARANCE,
    halfDepth: item.depth / 2 + WALL_CLEARANCE,
  };
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

export function furnitureIntersectsWalls(
  item: FurnitureCatalogItem,
  level: Pick<Level, "walls">,
  rotation: number,
  position: FurniturePosition,
) {
  const furniture = furnitureRectangle(item, rotation, position);
  return level.walls.some((wall) => solidWallRuns(wall).some(({ from, to }) => {
    const obstacle = wallRectangle(wall, from, to);
    return obstacle ? rectanglesOverlap(furniture, obstacle) : false;
  }));
}

export function furnitureIntersectsDoors(
  item: FurnitureCatalogItem,
  level: Pick<Level, "walls">,
  rotation: number,
  position: FurniturePosition,
) {
  const furniture = furnitureRectangle(item, rotation, position);
  return level.walls.some((wall) => (wall.openings ?? []).some((opening) => {
    if (opening.kind !== "door") return false;
    const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    const door = wallRectangle(
      { ...wall, thickness: Math.max(0.08, wall.thickness ?? 0.18) },
      clamp(opening.offset, 0, length),
      clamp(opening.offset + opening.width, 0, length),
    );
    return door ? rectanglesOverlap(furniture, door) : false;
  }));
}

export function furnitureIntersectsFixtures(
  item: FurnitureCatalogItem,
  level: Pick<Level, "fixtures">,
  rotation: number,
  position: FurniturePosition,
) {
  const furniture = furnitureRectangle(item, rotation, position);
  return (level.fixtures ?? []).some((fixture) => rectanglesOverlap(furniture, {
    center: { x: fixture.x, z: fixture.z },
    axisX: { x: Math.cos(fixture.rotation), z: -Math.sin(fixture.rotation) },
    axisZ: { x: Math.sin(fixture.rotation), z: Math.cos(fixture.rotation) },
    halfWidth: fixture.width / 2,
    halfDepth: fixture.depth / 2,
  }));
}

export function furnitureIntersectsStairs(
  item: FurnitureCatalogItem,
  level: Pick<Level, "stairs">,
  rotation: number,
  position: FurniturePosition,
) {
  const furniture = furnitureRectangle(item, rotation, position);
  return (level.stairs ?? []).some((stair) => rectanglesOverlap(furniture, {
    center: { x: stair.x, z: stair.z },
    axisX: { x: 1, z: 0 },
    axisZ: { x: 0, z: 1 },
    halfWidth: stair.width / 2,
    halfDepth: stair.depth / 2,
  }));
}

export function furnitureIntersectsFurniture(
  item: FurnitureCatalogItem,
  rotation: number,
  position: FurniturePosition,
  obstacles: FurnitureObstacle[],
) {
  const furniture = furnitureRectangle(item, rotation, position);
  return obstacles.some((obstacle) => rectanglesOverlap(
    furniture,
    furnitureRectangle(obstacle.item, obstacle.rotation, obstacle.position),
  ));
}

function preparedPosition(
  item: FurnitureCatalogItem,
  level: Pick<Level, "slab">,
  rotation: number,
  position: FurniturePosition,
  gridSize: number,
) {
  const snapped = snapFurniturePosition(position, level, gridSize);
  return clampFurniturePosition(item, level.slab, rotation, snapped.x, snapped.z);
}

export function previewFurniturePosition(
  item: FurnitureCatalogItem,
  level: Pick<Level, "slab" | "walls" | "fixtures" | "stairs">,
  rotation: number,
  position: FurniturePosition,
  gridSize = 0,
  obstacles: FurnitureObstacle[] = [],
): FurnitureMoveResult {
  const prepared = preparedPosition(item, level, rotation, position, gridSize);
  let collision: FurnitureCollisionReason = null;
  if (furnitureIntersectsWalls(item, level, rotation, prepared)) collision = "wall";
  else if (furnitureIntersectsDoors(item, level, rotation, prepared)) collision = "door";
  else if (furnitureIntersectsFixtures(item, level, rotation, prepared)) collision = "fixture";
  else if (furnitureIntersectsStairs(item, level, rotation, prepared)) collision = "stair";
  else if (furnitureIntersectsFurniture(item, rotation, prepared, obstacles)) collision = "furniture";
  return { position: prepared, collision };
}

export function validFurniturePosition(
  item: FurnitureCatalogItem,
  level: Pick<Level, "slab" | "walls" | "fixtures" | "stairs">,
  rotation: number,
  position: FurniturePosition,
  gridSize = 0,
  obstacles: FurnitureObstacle[] = [],
) {
  const preview = previewFurniturePosition(item, level, rotation, position, gridSize, obstacles);
  return preview.collision ? null : preview.position;
}

/**
 * Dragging is a preview, so only the target matters. The model may pass through
 * an obstacle on its way to another room; an invalid final target is reported
 * to the caller and must not be committed.
 */
export function resolveFurnitureMove(
  item: FurnitureCatalogItem,
  level: Pick<Level, "slab" | "walls" | "fixtures" | "stairs">,
  rotation: number,
  _from: FurniturePosition,
  target: FurniturePosition,
  gridSize = 0,
  obstacles: FurnitureObstacle[] = [],
): FurnitureMoveResult {
  return previewFurniturePosition(item, level, rotation, target, gridSize, obstacles);
}

export function findNearestValidFurniturePosition(
  item: FurnitureCatalogItem,
  level: Pick<Level, "slab" | "walls" | "fixtures" | "stairs">,
  rotation: number,
  preferred: FurniturePosition,
  gridSize = 0,
  obstacles: FurnitureObstacle[] = [],
) {
  const direct = validFurniturePosition(item, level, rotation, preferred, gridSize, obstacles);
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
    const valid = validFurniturePosition(item, level, rotation, candidate, gridSize, obstacles);
    if (valid) return valid;
  }
  return null;
}
