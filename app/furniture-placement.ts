import type { FurnitureCatalogItem } from "./furniture-catalog.ts";
import { clampFurniturePosition } from "./furniture-catalog.ts";
import type { Level, Wall } from "./scene-data.ts";

export type FurniturePosition = { x: number; z: number };

export type FurnitureMoveResult = {
  position: FurniturePosition;
  blockedByWall: boolean;
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
const DRAG_SAMPLE_DISTANCE = 0.045;

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

export function validFurniturePosition(
  item: FurnitureCatalogItem,
  level: Pick<Level, "slab" | "walls">,
  rotation: number,
  position: FurniturePosition,
  gridSize = 0,
) {
  const prepared = preparedPosition(item, level, rotation, position, gridSize);
  return furnitureIntersectsWalls(item, level, rotation, prepared) ? null : prepared;
}

/** Samples the whole drag path so a large pointer jump cannot cross a wall. */
export function resolveFurnitureMove(
  item: FurnitureCatalogItem,
  level: Pick<Level, "slab" | "walls">,
  rotation: number,
  from: FurniturePosition,
  target: FurniturePosition,
  gridSize = 0,
): FurnitureMoveResult {
  const preparedTarget = preparedPosition(item, level, rotation, target, gridSize);
  const distance = Math.hypot(preparedTarget.x - from.x, preparedTarget.z - from.z);
  const steps = Math.max(1, Math.ceil(distance / DRAG_SAMPLE_DISTANCE));
  let lastValid = preparedPosition(item, level, rotation, from, gridSize);

  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    const sample = preparedPosition(item, level, rotation, {
      x: from.x + (preparedTarget.x - from.x) * progress,
      z: from.z + (preparedTarget.z - from.z) * progress,
    }, gridSize);
    if (sample.x === lastValid.x && sample.z === lastValid.z) continue;
    if (furnitureIntersectsWalls(item, level, rotation, sample)) {
      return { position: lastValid, blockedByWall: true };
    }
    lastValid = sample;
  }
  return { position: lastValid, blockedByWall: false };
}

export function findNearestValidFurniturePosition(
  item: FurnitureCatalogItem,
  level: Pick<Level, "slab" | "walls">,
  rotation: number,
  preferred: FurniturePosition,
  gridSize = 0,
) {
  const direct = validFurniturePosition(item, level, rotation, preferred, gridSize);
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
    const valid = validFurniturePosition(item, level, rotation, candidate, gridSize);
    if (valid) return valid;
  }
  return null;
}
