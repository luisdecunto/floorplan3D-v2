import assert from "node:assert/strict";
import test from "node:test";
import {
  FURNITURE_CATALOG,
  clampFurniturePosition,
  furnitureFootprint,
} from "../app/furniture-catalog.ts";
import {
  furnitureIntersectsWalls,
  resolveFurnitureMove,
  snapFurniturePosition,
  validFurniturePosition,
} from "../app/furniture-placement.ts";

test("starter furniture has unique IDs and positive real-world dimensions", () => {
  assert.equal(new Set(FURNITURE_CATALOG.map(({ id }) => id)).size, FURNITURE_CATALOG.length);
  assert.ok(FURNITURE_CATALOG.length >= 5);
  for (const item of FURNITURE_CATALOG) {
    assert.ok(item.width > 0.5);
    assert.ok(item.depth > 0.5);
    assert.ok(item.height > 0.5);
  }
});

test("rotated furniture swaps its axis-aligned metric footprint", () => {
  const item = FURNITURE_CATALOG[0];
  const footprint = furnitureFootprint(item, Math.PI / 2);
  assert.ok(Math.abs(footprint.width - item.depth) < 1e-9);
  assert.ok(Math.abs(footprint.depth - item.width) < 1e-9);
});

test("placement is clamped so the full rotated footprint stays on the slab", () => {
  const item = FURNITURE_CATALOG[1];
  const slab = { x: 0, z: 0, width: 5, depth: 4 };
  const position = clampFurniturePosition(item, slab, 0, 100, -100);
  assert.ok(position.x + item.width / 2 <= slab.width / 2);
  assert.ok(position.z - item.depth / 2 >= -slab.depth / 2);
});

const testLevel = {
  slab: { x: 0.05, z: -0.05, width: 6, depth: 5 },
  walls: [
    { id: "divider", start: [0, -2.5], end: [0, 2.5], thickness: 0.18 },
  ],
};

const testChair = {
  id: "test-chair",
  name: "Test chair",
  collection: "Tests",
  shape: "armchair",
  width: 0.8,
  depth: 0.8,
  height: 0.8,
  upholstery: "Test",
  color: "#000",
  accentColor: "#111",
};

test("optional grid snapping is aligned to the floor slab origin", () => {
  const position = snapFurniturePosition({ x: 0.38, z: 0.18 }, testLevel, 0.1);
  assert.ok(Math.abs(position.x - 0.35) < 1e-9);
  assert.ok(Math.abs(position.z - 0.15) < 1e-9);
});

test("a furniture footprint cannot overlap a structural wall", () => {
  assert.equal(furnitureIntersectsWalls(testChair, testLevel, 0, { x: 0, z: 0 }), true);
  assert.equal(validFurniturePosition(testChair, testLevel, 0, { x: 0, z: 0 }), null);
  assert.deepEqual(validFurniturePosition(testChair, testLevel, 0, { x: -1, z: 0 }), { x: -1, z: 0 });
});

test("continuous drag sampling cannot teleport furniture through a wall", () => {
  const result = resolveFurnitureMove(testChair, testLevel, 0, { x: -1.2, z: 0 }, { x: 1.2, z: 0 });
  assert.equal(result.blockedByWall, true);
  assert.ok(result.position.x < -0.45);
});
