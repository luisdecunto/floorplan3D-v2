import assert from "node:assert/strict";
import test from "node:test";
import {
  FURNITURE_CATALOG,
  FURNITURE_CATEGORIES,
  filterFurnitureCatalog,
  furnitureBrand,
  clampFurniturePosition,
  furnitureFootprint,
} from "../app/furniture-catalog.ts";
import {
  furnitureIntersectsWalls,
  resolveFurnitureMove,
  snapFurniturePosition,
  validFurniturePosition,
} from "../app/furniture-placement.ts";
import { RETAIL_FURNITURE_CATALOG } from "../app/retail-furniture-catalog.ts";
import { BOOKSHELF_CATALOG } from "../app/bookshelf-catalog.ts";

test("starter furniture has unique IDs and positive real-world dimensions", () => {
  assert.equal(new Set(FURNITURE_CATALOG.map(({ id }) => id)).size, FURNITURE_CATALOG.length);
  assert.ok(FURNITURE_CATALOG.length >= 35);
  for (const item of FURNITURE_CATALOG) {
    assert.ok(item.width > 0.25);
    assert.ok(item.depth > 0.25);
    assert.ok(item.height > 0.25);
  }
});

test("bookcase references retain the six checked BILLY and IVAR configurations", () => {
  const expected = {
    "002.638.50": [0.80, 0.28, 2.02], "502.638.38": [0.40, 0.28, 2.02],
    "894.045.78": [0.89, 0.30, 1.79], "394.070.70": [0.89, 0.50, 1.79],
    "594.038.15": [0.89, 0.30, 1.79], "394.039.39": [1.74, 0.30, 1.79],
  };
  assert.equal(BOOKSHELF_CATALOG.length, 6);
  assert.equal(FURNITURE_CATALOG.length, 75);
  for (const item of BOOKSHELF_CATALOG) {
    assert.deepEqual([item.width, item.depth, item.height], expected[item.articleNumber], item.name);
    assert.equal(item.category, "Bookcases");
    assert.equal(item.shape, "bookcase");
    assert.equal(item.brand, "IKEA");
    assert.ok(item.shelving.shelvesPerSection >= 3);
    assert.match(item.sourceUrl, /^https:\/\/www\.ikea\.com\/dk\/da\/p\//);
  }
  assert.equal(filterFurnitureCatalog("IVAR", "Bookcases", "IKEA").length, 4);
  assert.equal(filterFurnitureCatalog("BILLY", "Bookcases", "IKEA").length, 2);
});

test("expanded IKEA catalogue covers the requested furniture families", () => {
  const ikeaItems = FURNITURE_CATALOG.filter(({ collection }) => collection === "IKEA");
  assert.ok(ikeaItems.length >= 30);
  for (const category of ["Sofas", "Beds", "Tables", "Desks", "Chairs"]) {
    assert.ok(ikeaItems.some((item) => item.category === category), `missing ${category}`);
  }
  assert.ok(ikeaItems.some((item) => item.name.includes("coffee table")));
  assert.ok(ikeaItems.some((item) => item.shape === "stool"));
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
    new Set(FURNITURE_CATEGORIES),
  );
});

test("new retailer references retain checked assembled dimensions, materials and provenance", () => {
  const expected = {
    "804.372.34": [0.79, 0.55, 1.76], "004.417.58": [1.17, 0.55, 1.76],
    "005.292.42": [0.81, 0.47, 0.89], "803.006.60": [0.78, 0.41, 0.95],
    "804.499.01": [1.18, 0.78, 0.45], "202.866.38": [0.90, 0.90, 0.48],
    "905.001.21": [0.80, 0.80, 0.42], "3611113": [0.80, 0.51, 1.93],
    "3601087": [1.67, 0.53, 1.97], "3640396": [0.71, 0.35, 0.81],
    "3601188": [0.80, 0.35, 1.15], "3640374": [0.70, 0.70, 0.41],
    "3681141": [1.10, 0.60, 0.53], "3650037": [1.10, 0.60, 0.45],
    "3670383": [0.50, 0.50, 1.76], "3670378": [0.97, 0.50, 1.76],
    "3670381": [1.45, 0.50, 1.76], "3620248": [2.80, 0.90, 0.75],
    "3640237": [2.80, 1.00, 0.75], "3620177": [2.60, 0.95, 0.75],
    "3650133": [1.60, 0.80, 0.75], "3630073": [1.40, 0.60, 0.75],
  };
  assert.equal(RETAIL_FURNITURE_CATALOG.length, 22);
  assert.equal(FURNITURE_CATALOG.length, 75);
  for (const item of RETAIL_FURNITURE_CATALOG) {
    assert.deepEqual([item.width, item.depth, item.height], expected[item.articleNumber], item.name);
    assert.ok(item.materials.length > 0);
    assert.equal(item.modelProvenance, "original-procedural");
    assert.match(item.sourceCheckedAt, /^\d{4}-\d{2}-\d{2}$/);
    const source = new URL(item.sourceUrl);
    assert.equal(source.protocol, "https:");
    assert.equal(source.hostname, item.brand === "IKEA" ? "www.ikea.com" : "jysk.dk");
    if (item.storage) assert.ok(item.storage.doors >= 1 && item.storage.doors <= 3);
    if (item.table?.top === "round") assert.equal(item.width, item.depth);
  }
});

test("brand and category filters expose storage and both new and legacy coffee tables", () => {
  for (const brand of ["IKEA", "JYSK"]) {
    for (const category of ["Wardrobes", "Cupboards", "Coffee tables"]) {
      const matches = filterFurnitureCatalog("", category, brand);
      assert.ok(matches.length >= 2);
      assert.ok(matches.every((item) => furnitureBrand(item) === brand && item.category === category));
    }
  }
  assert.equal(filterFurnitureCatalog("JYSK wardrobe", "Wardrobes").length, 5);
  assert.equal(filterFurnitureCatalog("  sneslev  ", "All", "JYSK")[0].articleNumber, "3640374");
  assert.equal(filterFurnitureCatalog("SNESLEV", "All", "IKEA").length, 0);
  assert.equal(filterFurnitureCatalog("HAVEN", "All", "Originals").length, 2);
  assert.ok(filterFurnitureCatalog("", "Coffee tables").some((item) => item.id === "ikea-lack-table-40104294"));
  assert.ok(filterFurnitureCatalog("", "Tables").some((item) => item.id === "jysk-lyngvig-3650037"));
  assert.ok(filterFurnitureCatalog("", "Desks", "JYSK").some((item) => item.id === "jysk-svaneke-160-3650133"));
});

test("FANDRUP sizes and configurable tables retain their planning metadata", () => {
  const fandrup = RETAIL_FURNITURE_CATALOG.filter((item) => item.name.startsWith("FANDRUP"));
  assert.deepEqual(fandrup.map((item) => item.width), [0.50, 0.97, 1.45]);
  assert.deepEqual(fandrup.map((item) => item.storage.doors), [1, 2, 3]);
  const extended = RETAIL_FURNITURE_CATALOG.filter((item) => item.table?.extendable);
  assert.equal(extended.length, 3);
  assert.ok(extended.every((item) => item.width > item.table.extendable.closedWidth));
  const adjustable = RETAIL_FURNITURE_CATALOG.find((item) => item.id === "jysk-svaneke-160-3650133");
  assert.deepEqual(adjustable.table.heightAdjustable, { min: 0.70, max: 1.19 });
  assert.equal(adjustable.category, "Desks");
});

test("new retail furniture retains wall and furniture collision at rotated placements", () => {
  const level = { slab: { x: 0, z: 0, width: 12, depth: 12 }, walls: [{ id: "divider", start: [0, -6], end: [0, 6], thickness: 0.18 }] };
  for (const item of [...RETAIL_FURNITURE_CATALOG, ...BOOKSHELF_CATALOG]) {
    for (const rotation of [0, Math.PI / 4, Math.PI / 2]) {
      assert.equal(resolveFurnitureMove(item, level, rotation, { x: -3, z: 0 }, { x: 0, z: 0 }).collision, "wall", item.name);
      assert.equal(resolveFurnitureMove(item, level, rotation, { x: -3, z: 0 }, { x: -2, z: 0 }).collision, null, item.name);
      const obstacle = { id: "occupied", item, position: { x: -2, z: 0 }, rotation };
      assert.equal(resolveFurnitureMove(item, level, rotation, { x: -3, z: 0 }, { x: -2, z: 0 }, 0, [obstacle]).collision, "furniture", item.name);
    }
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
