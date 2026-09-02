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
function syntheticBathroom({ showerDoorSwing = false } = {}) {
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
  // 2.40 x 0.60 m counter run along the left wall, with a 0.80 x 0.40 m basin.
  outline(25, 180, 145, 210);
  outline(100, 185, 140, 205);
  // WC: cistern against the top wall with a 0.40 m pan hanging off it.
  outline(158, 25, 182, 38);
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

test("nothing is emitted without a project scale", () => {
  const { mask, walls, footprint } = syntheticBathroom();
  const fixtures = detectFurniture(mask, WIDTH, footprint, WALL_THICKNESS, [], 24, walls, undefined);
  assert.deepEqual(fixtures.filter((f) => f.kind !== "stove"), [],
    "real-world sizing is required, so an unscaled plan yields no fixtures");
});
