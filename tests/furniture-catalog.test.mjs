import assert from "node:assert/strict";
import test from "node:test";
import {
  FURNITURE_CATALOG,
  clampFurniturePosition,
  furnitureFootprint,
} from "../app/furniture-catalog.ts";

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
