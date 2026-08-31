import assert from "node:assert/strict";
import test from "node:test";
import {
  FURNITURE_CATALOG,
  clampFurniturePosition,
  furnitureCollisionSize,
  furnitureFootprint,
} from "../app/furniture-catalog.ts";
import {
  furnitureIntersectsFurniture,
  furnitureIntersectsWalls,
  resolveFurnitureMove,
  snapFurniturePosition,
  validFurniturePosition,
} from "../app/furniture-placement.ts";

test("starter furniture has unique IDs and positive real-world dimensions", () => {
  assert.equal(new Set(FURNITURE_CATALOG.map(({ id }) => id)).size, FURNITURE_CATALOG.length);
  assert.ok(FURNITURE_CATALOG.length >= 5);
  for (const item of FURNITURE_CATALOG) {
    assert.ok(item.width > 0.25);
    assert.ok(item.depth > 0.25);
    assert.ok(item.height > 0.25);
  }
});

test("IKEA starter set includes verified furniture categories and FRIHETEN dimensions", () => {
  const friheten = FURNITURE_CATALOG.find(({ articleNumber }) => articleNumber === "392.167.54");
  assert.ok(friheten);
  assert.deepEqual(
    { width: friheten.width, depth: friheten.depth, height: friheten.height },
    { width: 2.3, depth: 1.51, height: 0.86 },
  );
  assert.match(friheten.sourceUrl, /ikea\.com\/dk\/da\/p\/friheten/);
  assert.deepEqual(
    new Set(FURNITURE_CATALOG.filter(({ articleNumber }) => articleNumber).map(({ category }) => category)),
    new Set(["Sofas", "Beds", "Tables", "Chairs"]),
  );
});

test("every starter furniture item declares materials and asset license provenance", () => {
  for (const item of FURNITURE_CATALOG) {
    assert.ok(Array.isArray(item.materials) && item.materials.length > 0, `${item.id} should list materials`);
    assert.ok(item.license && typeof item.license.type === "string", `${item.id} should declare a license`);
    // No starter item ships a redistributed manufacturer mesh.
    if (!item.glbUrl) assert.equal(item.license.type, "procedural-only");
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
  category: "Chairs",
  shape: "armchair",
  width: 0.8,
  depth: 0.8,
  height: 0.8,
  upholstery: "Test",
  materials: ["Test"],
  color: "#000",
  accentColor: "#111",
  license: { type: "procedural-only" },
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

test("drag previews can cross a wall when the final position is clear", () => {
  const result = resolveFurnitureMove(testChair, testLevel, 0, { x: -1.2, z: 0 }, { x: 1.2, z: 0 });
  assert.equal(result.collision, null);
  assert.deepEqual(result.position, { x: 1.2, z: 0 });
});

test("an invalid drag target is preserved for a red preview but cannot validate", () => {
  const result = resolveFurnitureMove(testChair, testLevel, 0, { x: -1.2, z: 0 }, { x: 0, z: 0 });
  assert.equal(result.collision, "wall");
  assert.deepEqual(result.position, { x: 0, z: 0 });
  assert.equal(validFurniturePosition(testChair, testLevel, 0, result.position), null);
});

test("door openings are pass-through paths but not valid final positions", () => {
  const levelWithDoor = {
    ...testLevel,
    walls: [{
      ...testLevel.walls[0],
      openings: [{ kind: "door", offset: 2, width: 1, height: 2.1 }],
    }],
  };
  assert.equal(resolveFurnitureMove(testChair, levelWithDoor, 0, { x: -1.2, z: 0 }, { x: 0, z: 0 }).collision, "door");
  assert.equal(resolveFurnitureMove(testChair, levelWithDoor, 0, { x: -1.2, z: 0 }, { x: 1.2, z: 0 }).collision, null);
});

test("furniture, fixtures, and stairs are final-placement obstacles", () => {
  const obstacle = { id: "placed", item: testChair, position: { x: -1, z: 0 }, rotation: 0 };
  const occupiedLevel = {
    ...testLevel,
    fixtures: [{ id: "island", kind: "island", x: 1, z: -1, width: 1, depth: 1, rotation: 0, confidence: 1 }],
    stairs: [{ id: "stairs", x: 1, z: 1, width: 1, depth: 1, runAxis: "horizontal", stepCount: 10, confidence: 1 }],
  };
  assert.equal(resolveFurnitureMove(testChair, occupiedLevel, 0, { x: -2, z: 0 }, { x: -1, z: 0 }, 0, [obstacle]).collision, "furniture");
  assert.equal(resolveFurnitureMove(testChair, occupiedLevel, 0, { x: -2, z: 0 }, { x: 1, z: -1 }).collision, "fixture");
  assert.equal(resolveFurnitureMove(testChair, occupiedLevel, 0, { x: -2, z: 0 }, { x: 1, z: 1 }).collision, "stair");
});

test("a footprint override drives collision instead of the visual width/depth", () => {
  // Visually a 0.8m armchair, but its collision footprint is overridden down to 0.3m -
  // e.g. a GLB asset whose real occupied floor space is smaller than its bounding box.
  const compactFootprintChair = { ...testChair, footprint: { width: 0.3, depth: 0.3 } };
  assert.deepEqual(furnitureCollisionSize(compactFootprintChair), { width: 0.3, depth: 0.3 });

  const obstacle = { id: "placed", item: testChair, position: { x: 0, z: 0 }, rotation: 0 };
  // 0.7m away: still overlaps the full-size chair's footprint (combined half-width 0.87m),
  // but clears the overridden compact one (combined half-width only 0.62m).
  assert.equal(furnitureIntersectsFurniture(testChair, 0, { x: 0.7, z: 0 }, [obstacle]), true);
  assert.equal(furnitureIntersectsFurniture(compactFootprintChair, 0, { x: 0.7, z: 0 }, [obstacle]), false);
});

test("furnitureFootprint respects a footprint override when clamping to the slab", () => {
  const wideVisualNarrowFootprint = { ...testChair, width: 4, depth: 4, footprint: { width: 0.5, depth: 0.5 } };
  const slab = { x: 0, z: 0, width: 5, depth: 4 };
  // Without the override this would need to clamp hard for a 4m-wide item; with it, it barely clamps.
  const position = clampFurniturePosition(wideVisualNarrowFootprint, slab, 0, 100, -100);
  assert.ok(position.x > slab.width / 2 - 1);
});
