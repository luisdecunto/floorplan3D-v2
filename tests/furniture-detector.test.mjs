import assert from "node:assert/strict";
import test from "node:test";
import { detectFurniture } from "../app/furniture-detector.ts";

// 50 px to the metre, so every drawn size below reads directly as centimetres.
const METRES_PER_PIXEL = 0.02;
const WIDTH = 300;
const HEIGHT = 260;
const WALL_THICKNESS = 8;

/**
 * A bathroom drawn the way a plan draws one: fixtures are closed outlines and
 * they abut the walls, which is precisely the case that defeated the earlier
 * rectangle-sweep detector.
 */
function syntheticBathroom({ showerDoorSwing = false, omitCistern = false } = {}) {
  const mask = new Uint8Array(WIDTH * HEIGHT);
  const set = (x, y) => {
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) mask[y * WIDTH + x] = 1;
  };
  const filled = (x1, y1, x2, y2) => {
    for (let y = y1; y <= y2; y += 1) for (let x = x1; x <= x2; x += 1) set(x, y);
  };
  const outline = (x1, y1, x2, y2) => {
    for (let x = x1; x <= x2; x += 1) { set(x, y1); set(x, y2); }
    for (let y = y1; y <= y2; y += 1) { set(x1, y); set(x2, y); }
  };
  const ring = (cx, cy, r) => {
    const steps = Math.max(48, Math.round(2 * Math.PI * r * 3));
    for (let i = 0; i < steps; i += 1) {
      const theta = (2 * Math.PI * i) / steps;
      set(Math.round(cx + r * Math.cos(theta)), Math.round(cy + r * Math.sin(theta)));
    }
  };

  // Enclosing walls, 8 px thick, centred on the rectangle below.
  filled(16, 16, 284, 24);
  filled(16, 236, 284, 244);
  filled(16, 16, 24, 244);
  filled(276, 16, 284, 244);

  // 1.00 x 1.00 m shower tray in the top-left corner, two sides on walls.
  outline(25, 25, 75, 75);
  // The screen's swing, drawn from the open corner of the tray. It touches the
  // tray, so it joins the same ink component and drags its bounding box well
  // past shower size unless the tray's own edges are recovered.
  if (showerDoorSwing) {
    for (let t = 0; t <= 60; t += 1) {
      set(25 + t, 75 + Math.round(t * 0.55));
      set(26 + t, 75 + Math.round(t * 0.55));
    }
  }
  // 2.40 x 0.70 m counter run along the bottom wall, with a 0.80 x 0.50 m basin
  // let into it. Run lengthways against the wall, which is what makes it a
  // counter rather than an island.
  outline(25, 198, 145, 232);
  outline(100, 203, 140, 227);
  // WC: cistern against the top wall with a 0.40 m pan hanging off it.
  if (!omitCistern) outline(158, 25, 182, 38);
  ring(170, 48, 10);

  const walls = [
    { axis: "horizontal", start: [16, 20], end: [284, 20], thickness: WALL_THICKNESS },
    { axis: "horizontal", start: [16, 240], end: [284, 240], thickness: WALL_THICKNESS },
    { axis: "vertical", start: [20, 16], end: [20, 244], thickness: WALL_THICKNESS },
    { axis: "vertical", start: [280, 16], end: [280, 244], thickness: WALL_THICKNESS },
  ];
  const footprint = { minX: 16, minY: 16, maxX: 284, maxY: 244 };
  return { mask, walls, footprint };
}

function detect(options) {
  const { mask, walls, footprint } = syntheticBathroom(options);
  return detectFurniture(mask, WIDTH, footprint, WALL_THICKNESS, [], 24, walls, METRES_PER_PIXEL);
}

const metres = (pixels) => pixels * METRES_PER_PIXEL;

test("bathroom fixtures are recovered from their outlines", () => {
  const fixtures = detect();
  const kinds = fixtures.map((f) => f.kind).sort();
  assert.deepEqual(kinds, ["countertop", "shower", "sink", "toilet"]);
});

test("a corner shower tray keeps the size it was drawn at", () => {
  const shower = detect().find((f) => f.kind === "shower");
  assert.ok(shower, "expected a shower");
  // Drawn 50 x 50 px = 1.00 x 1.00 m.
  assert.ok(Math.abs(metres(shower.width) - 1) <= 0.08, `width ${metres(shower.width)}`);
  assert.ok(Math.abs(metres(shower.height) - 1) <= 0.08, `height ${metres(shower.height)}`);
  assert.ok(Math.abs(shower.x - 50) <= 4 && Math.abs(shower.y - 50) <= 4, "centred on the tray");
});

test("a shower survives the screen swing drawn off its corner", () => {
  const shower = detect({ showerDoorSwing: true }).find((f) => f.kind === "shower");
  assert.ok(shower, "expected a shower despite the swing line touching the tray");
  assert.ok(Math.abs(metres(shower.width) - 1) <= 0.12, `width ${metres(shower.width)}`);
  assert.ok(Math.abs(metres(shower.height) - 1) <= 0.12, `height ${metres(shower.height)}`);
});

test("a basin is kept even though it sits inside its counter run", () => {
  const fixtures = detect();
  const counter = fixtures.find((f) => f.kind === "countertop");
  const sink = fixtures.find((f) => f.kind === "sink");
  assert.ok(counter && sink, "expected both a counter and a basin");
  // Containment is the expected layout here, not a duplicate detection.
  assert.ok(sink.x > counter.x - counter.width / 2 && sink.x < counter.x + counter.width / 2);
  assert.ok(metres(counter.width) > 2 && metres(counter.height) < 0.8);
});

test("a toilet is placed from its pan and reaches back to the wall", () => {
  const toilet = detect().find((f) => f.kind === "toilet");
  assert.ok(toilet, "expected a toilet");
  const depth = metres(Math.max(toilet.width, toilet.height));
  const across = metres(Math.min(toilet.width, toilet.height));
  assert.ok(depth >= 0.5 && depth <= 0.9, `depth ${depth}`);
  assert.ok(across >= 0.3 && across <= 0.7, `width ${across}`);
  // The pan sits below the cistern, so the box must span back up to the wall.
  assert.ok(toilet.y - toilet.height / 2 <= 30, "box reaches the wall face");
});

test("a round void with no cistern behind it is not a toilet", () => {
  // A double-door wardrobe encloses one of these between its two swing arcs,
  // and it otherwise passes every test a WC pan does.
  const fixtures = detect({ omitCistern: true });
  assert.equal(fixtures.find((f) => f.kind === "toilet"), undefined,
    `expected no toilet, got ${fixtures.map((f) => f.kind).join()}`);
});

/**
 * A kitchen: a run of cabinets across the top wall with a snowflake marking the
 * refrigerated cell, and a free-standing island carrying a basin.
 */
function syntheticKitchen() {
  const mask = new Uint8Array(WIDTH * HEIGHT);
  const set = (x, y) => {
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) mask[y * WIDTH + x] = 1;
  };
  const filled = (x1, y1, x2, y2) => {
    for (let y = y1; y <= y2; y += 1) for (let x = x1; x <= x2; x += 1) set(x, y);
  };
  const outline = (x1, y1, x2, y2) => {
    for (let x = x1; x <= x2; x += 1) { set(x, y1); set(x, y2); }
    for (let y = y1; y <= y2; y += 1) { set(x1, y); set(x2, y); }
  };
  const line = (x1, y1, x2, y2) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let i = 0; i <= steps; i += 1) {
      set(Math.round(x1 + ((x2 - x1) * i) / steps), Math.round(y1 + ((y2 - y1) * i) / steps));
    }
  };

  filled(16, 16, 284, 24);
  filled(16, 236, 284, 244);
  filled(16, 16, 24, 244);
  filled(276, 16, 284, 244);

  // Cabinet run across the top wall. Drawn the way a kitchen is drawn in plan:
  // shallow wall units against the wall with the base units and worktop in
  // front, so the run measured whole is 1.00 m deep and only the front band is
  // the counter.
  outline(25, 25, 190, 75);
  line(25, 40, 190, 40);
  line(60, 40, 60, 75);
  line(95, 40, 95, 75);
  // Snowflake in the second base cell: eight arms from a common centre.
  const cx = 77; const cy = 57; const r = 9;
  for (let i = 0; i < 8; i += 1) {
    const theta = (Math.PI * i) / 4;
    line(cx, cy, Math.round(cx + r * Math.cos(theta)), Math.round(cy + r * Math.sin(theta)));
  }
  // Free-standing island with a basin, clear of every wall.
  outline(90, 130, 210, 190);
  outline(135, 145, 175, 175);

  const walls = [
    { axis: "horizontal", start: [16, 20], end: [284, 20], thickness: WALL_THICKNESS },
    { axis: "horizontal", start: [16, 240], end: [284, 240], thickness: WALL_THICKNESS },
    { axis: "vertical", start: [20, 16], end: [20, 244], thickness: WALL_THICKNESS },
    { axis: "vertical", start: [280, 16], end: [280, 244], thickness: WALL_THICKNESS },
  ];
  return { mask, walls, footprint: { minX: 16, minY: 16, maxX: 284, maxY: 244 } };
}

function detectKitchen() {
  const { mask, walls, footprint } = syntheticKitchen();
  return detectFurniture(mask, WIDTH, footprint, WALL_THICKNESS, [], 24, walls, METRES_PER_PIXEL);
}

test("a snowflake marks refrigeration, sized to the cabinet cell holding it", () => {
  const fridge = detectKitchen().find((f) => f.kind === "fridge");
  assert.ok(fridge, "expected a fridge");
  // The cell is 35 px wide between its dividers, not the width of the glyph.
  assert.ok(metres(fridge.width) >= 0.5 && metres(fridge.width) <= 0.9, `width ${metres(fridge.width)}`);
  assert.ok(Math.abs(fridge.x - 77) <= 6, `centred on the cell, got x=${fridge.x}`);
});

test("a stacked cabinet run yields the worktop band, not its full depth", () => {
  const counter = detectKitchen().find((f) => f.kind === "countertop");
  assert.ok(counter, "expected a counter run");
  // The run is 1.00 m deep in total; the base units in front of the wall
  // cabinets are 0.70 m of that.
  const depth = metres(Math.min(counter.width, counter.height));
  assert.ok(depth >= 0.55 && depth <= 0.82, `depth ${depth}`);
  // And it is the front band, clear of the wall behind it.
  assert.ok(counter.y - counter.height / 2 >= 35, "measured from the base units, not the wall");
});

test("a fridge stands against the wall behind its run", () => {
  const fridge = detectKitchen().find((f) => f.kind === "fridge");
  assert.ok(fridge, "expected a fridge");
  // The wall's inner face is at y = 24. The cell is bounded by the worktop's
  // own lines and starts further forward, so the appliance has to be carried
  // back to the wall.
  assert.ok(Math.abs((fridge.y - fridge.height / 2) - 24) <= 3,
    `back edge should meet the wall, got ${(fridge.y - fridge.height / 2).toFixed(1)}`);
  // Carried back, not stretched: it keeps an appliance's depth.
  assert.ok(metres(fridge.height) >= 0.5 && metres(fridge.height) <= 0.85,
    `depth ${metres(fridge.height)} should stay appliance-sized`);
});

test("a worktop stops at the appliance standing in its run", () => {
  const fixtures = detectKitchen();
  const counter = fixtures.find((f) => f.kind === "countertop");
  const fridge = fixtures.find((f) => f.kind === "fridge");
  assert.ok(counter && fridge, "expected both a counter run and a fridge");
  const counterLeft = counter.x - counter.width / 2;
  const counterRight = counter.x + counter.width / 2;
  const fridgeLeft = fridge.x - fridge.width / 2;
  const fridgeRight = fridge.x + fridge.width / 2;
  const overlap = Math.min(counterRight, fridgeRight) - Math.max(counterLeft, fridgeLeft);
  assert.ok(overlap <= 1, `worktop should not run through the fridge, overlap ${overlap.toFixed(1)}px`);
  // And what is left is still a usable run rather than a sliver.
  assert.ok(metres(counter.width) > 1.2, `remaining run ${metres(counter.width)} m`);
});

test("a worktop clear of the walls is an island, not a counter run", () => {
  const fixtures = detectKitchen();
  const island = fixtures.find((f) => f.kind === "island");
  assert.ok(island, `expected an island, got ${fixtures.map((f) => f.kind).join()}`);
  assert.ok(metres(island.width) > 2 && metres(island.height) > 1);
  assert.ok(fixtures.some((f) => f.kind === "sink"), "the basin in it is still reported");
});

test("joinery faces away from the wall it backs onto", () => {
  const { mask, walls, footprint } = syntheticBathroom();
  const fixtures = detectFurniture(mask, WIDTH, footprint, WALL_THICKNESS, [], 24, walls, METRES_PER_PIXEL);
  // The counter run lies along the bottom wall, so it opens northwards, into
  // the room. Without this the doors are put on a face nobody can reach.
  const counter = fixtures.find((f) => f.kind === "countertop");
  assert.ok(counter, "expected a counter run");
  assert.equal(counter.front, "north");
});

test("a run along a wall opens through its long side", () => {
  // A closet run is far longer than it is deep, and its doors are on the long
  // face. Deriving that from the backing wall is what stops them being put on
  // the narrow end.
  const mask = new Uint8Array(WIDTH * HEIGHT);
  const set = (x, y) => { if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) mask[y * WIDTH + x] = 1; };
  const filled = (x1, y1, x2, y2) => {
    for (let y = y1; y <= y2; y += 1) for (let x = x1; x <= x2; x += 1) set(x, y);
  };
  const outline = (x1, y1, x2, y2) => {
    for (let x = x1; x <= x2; x += 1) { set(x, y1); set(x, y2); }
    for (let y = y1; y <= y2; y += 1) { set(x1, y); set(x2, y); }
  };
  filled(16, 16, 284, 24);
  filled(16, 236, 284, 244);
  filled(16, 16, 24, 244);
  filled(276, 16, 284, 244);
  // 0.7 m deep, 3.0 m long, against the left wall.
  outline(25, 60, 60, 210);

  const walls = [
    { axis: "horizontal", start: [16, 20], end: [284, 20], thickness: WALL_THICKNESS },
    { axis: "horizontal", start: [16, 240], end: [284, 240], thickness: WALL_THICKNESS },
    { axis: "vertical", start: [20, 16], end: [20, 244], thickness: WALL_THICKNESS },
    { axis: "vertical", start: [280, 16], end: [280, 244], thickness: WALL_THICKNESS },
  ];
  const fixtures = detectFurniture(mask, WIDTH, { minX: 16, minY: 16, maxX: 284, maxY: 244 },
    WALL_THICKNESS, [], 24, walls, METRES_PER_PIXEL);
  const run = fixtures.find((f) => f.kind === "cupboard" || f.kind === "countertop");
  assert.ok(run, `expected a run, got ${fixtures.map((f) => f.kind).join()}`);
  assert.ok(run.height > run.width, "the run should be longer than it is deep");
  // Backed by the left wall, so it opens east — across its long face.
  assert.equal(run.front, "east");
});

test("nothing is emitted without a project scale", () => {
  const { mask, walls, footprint } = syntheticBathroom();
  const fixtures = detectFurniture(mask, WIDTH, footprint, WALL_THICKNESS, [], 24, walls, undefined);
  assert.deepEqual(fixtures.filter((f) => f.kind !== "stove"), [],
    "real-world sizing is required, so an unscaled plan yields no fixtures");
});
