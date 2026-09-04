import assert from "node:assert/strict";
import test from "node:test";
import { Plane, Ray, Vector3 } from "three";
import { workspaceReducer, projectFurnishings, withFurnishings, confirmPlacement, placementObstacles, previewPlacement, floorWorldY, grabbedPosition, passedDragThreshold, shouldCancelObjectGesture } from "../app/workspace-state.ts";
import { FURNITURE_CATALOG } from "../app/furniture-catalog.ts";
import { createFloorplanDocumentV2, addDocumentOpening } from "../app/floorplan-document.ts";
import { parseProject, serializeProject } from "../app/project-storage.ts";

const item = FURNITURE_CATALOG.find((item) => item.shape === "chair");
const floor = { id: "ground", elevation: 0, slab: { x: 0, z: 0, width: 10, depth: 8 }, walls: [], fixtures: [], stairs: [] };
const draft = { id: "preview", catalogId: item.id, levelId: "ground", x: 0, z: 0, rotation: 0 };
const empty = () => ({ kind: "sample", furnishings: [] });

test("preview and cancellation leave committed data and undo history untouched", () => {
  const snapshot = empty();
  const state = { present: snapshot, past: [] };
  const before = JSON.stringify(state);
  previewPlacement({ ...draft, x: 1.234 }, floor, [], true);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(projectFurnishings(state.present), []);
});
test("Place commits exactly once, snaps, and can be undone", () => {
  let state = { present: empty(), past: [] };
  const next = confirmPlacement(state.present, { ...draft, x: 1.23 }, floor, true);
  state = workspaceReducer(state, { type: "commit", snapshot: next });
  assert.equal(state.past.length, 1);
  assert.ok(Math.abs(projectFurnishings(state.present)[0].x - 1.2) < 1e-8);
  assert.equal(confirmPlacement(next, draft, floor, true), next, "duplicate confirmation cannot duplicate a placement");
  state = workspaceReducer(state, { type: "undo" });
  assert.deepEqual(projectFurnishings(state.present), []);
});
test("invalid previews remain editable but cannot be confirmed", () => {
  const snapshot = empty();
  const blocked = { ...floor, walls: [{ id: "wall", start: [-4, 0], end: [4, 0], thickness: 0.2, openings: [] }] };
  assert.equal(previewPlacement(draft, blocked, [], true).collision, "wall");
  assert.equal(confirmPlacement(snapshot, draft, blocked, true), snapshot);
  assert.notEqual(confirmPlacement(snapshot, { ...draft, z: 2 }, blocked, true), snapshot);
});
test("confirmation rechecks fixtures, stairs and other furniture", () => {
  const fixtureFloor = { ...floor, fixtures: [{ id: "builtin", kind: "cupboard", x: 0, z: 0, width: 1, depth: 1, rotation: 0 }] };
  assert.equal(previewPlacement(draft, fixtureFloor, [], false).collision, "fixture");
  const stairFloor = { ...floor, stairs: [{ id: "stairs", x: 0, z: 0, width: 2, depth: 3, runAxis: "vertical" }] };
  assert.equal(previewPlacement(draft, stairFloor, [], false).collision, "stair");
  const snapshot = withFurnishings(empty(), [{ ...draft, id: "existing" }]);
  assert.equal(confirmPlacement(snapshot, draft, floor, true), snapshot);
});
test("drafts cannot move to another floor accidentally; upper floor has its own collision space", () => {
  const upper = { ...floor, id: "upper", elevation: 3.05 };
  const snapshot = withFurnishings(empty(), [{ ...draft, id: "ground-chair" }]);
  assert.equal(confirmPlacement(snapshot, draft, upper, true), snapshot);
  assert.notEqual(confirmPlacement(snapshot, { ...draft, levelId: "upper" }, upper, true), snapshot);
  assert.equal(placementObstacles(projectFurnishings(snapshot), { ...draft, levelId: "upper" }).length, 0);
});
test("unknown catalogue IDs are not silently placed", () => {
  const snapshot = empty();
  assert.equal(confirmPlacement(snapshot, { ...draft, catalogId: "not-a-product" }, floor, true), snapshot);
});

function project() {
  const region = { id: "ground", name: "Ground floor", x: 0, y: 0, width: 1, height: 1, confidence: 1 };
  const structure = { regionId: "ground", sourceWidth: 200, sourceHeight: 200, walls: [{ id: "wall", axis: "horizontal", start: [0, 0], end: [200, 0], thickness: 8, confidence: 1, weight: "heavy", openings: [] }], outdoorAreas: [], stairs: [], rooms: [], fixtures: [], footprint: { x: 0, y: 0, width: 200, height: 200 }, roomCount: 1, confidence: 1, diagnostics: { threshold: 140, wallThickness: 8, geometryVotes: 1, topologyVotes: 1, openingVotes: 0, stairVotes: 0 } };
  return createFloorplanDocumentV2({ name: "test.png", mimeType: "image/png", width: 200, height: 200, regions: [region], structures: { ground: structure } });
}
test("mixed structural and furniture undo is chronological; audit data and schema survive", () => {
  const original = project();
  let state = { present: { kind: "project", document: original }, past: [] };
  const changed = addDocumentOpening(original, "ground", "wall", "door");
  state = workspaceReducer(state, { type: "commit", snapshot: { kind: "project", document: changed } });
  state = workspaceReducer(state, { type: "commit", snapshot: withFurnishings(state.present, [draft]) });
  const reopened = parseProject(serializeProject(state.present.document));
  assert.equal(reopened.schemaVersion, 2);
  assert.equal(reopened.edits[0].kind, "add-opening");
  assert.equal(reopened.furnishings[0].catalogId, item.id);
  state = workspaceReducer(state, { type: "undo" });
  assert.equal(state.present.document.levels[0].structure.walls[0].openings.length, 1);
  assert.equal(state.present.document.edits.length, 1);
  assert.equal(projectFurnishings(state.present).length, 0);
  state = workspaceReducer(state, { type: "undo" });
  assert.equal(state.present.document.levels[0].structure.walls[0].openings.length, 0);
});
test("opening a different project clears session history", () => {
  const snapshot = empty();
  const state = workspaceReducer({ present: withFurnishings(snapshot, [draft]), past: [snapshot] }, { type: "open", snapshot: { kind: "project", document: project() } });
  assert.deepEqual(state.past, []);
  assert.equal(workspaceReducer(state, { type: "undo" }), state);
});
test("undo marks the restored project as the most recently updated save", () => {
  const previous = { kind: "project", document: { ...project(), updatedAt: "2000-01-01T00:00:00.000Z" } };
  const result = workspaceReducer({ present: withFurnishings(previous, [draft]), past: [previous] }, { type: "undo" });
  assert.ok(result.present.document.updatedAt > previous.document.updatedAt);
  assert.deepEqual(result.present.document.furnishings, previous.document.furnishings);
});
test("history is bounded and ignores identical snapshots", () => {
  let state = { present: empty(), past: [] };
  assert.equal(workspaceReducer(state, { type: "commit", snapshot: state.present }), state);
  for (let i = 0; i < 50; i++) state = workspaceReducer(state, { type: "commit", snapshot: withFurnishings(state.present, [{ ...draft, x: i }]) });
  assert.equal(state.past.length, 40);
});
test("touch threshold distinguishes taps from drags", () => {
  assert.equal(passedDragThreshold({ x: 10, y: 10 }, { x: 15, y: 15 }), false);
  assert.equal(passedDragThreshold({ x: 10, y: 10 }, { x: 18, y: 10 }), true);
});
test("drag retains the original grab offset", () => {
  assert.deepEqual(grabbedPosition({ x: 3, z: 4 }, { x: 0.3, z: -0.5 }), { x: 2.7, z: 4.5 });
});
test("a second finger or cancelled selection invalidates an object gesture", () => {
  assert.equal(shouldCancelObjectGesture("chair", "chair", null, 1), false);
  assert.equal(shouldCancelObjectGesture("chair", "chair", null, 2), true);
  assert.equal(shouldCancelObjectGesture("chair", null, "chair", 2), true);
  assert.equal(shouldCancelObjectGesture("chair", null, null, 1), true);
  assert.equal(shouldCancelObjectGesture("chair", null, "chair", 1), false);
});
test("ray intersections use actual scene elevation for ground, upper and exploded floors", () => {
  for (const [elevation, explode] of [[0, 0], [3.05, 0], [3.05, 2.35]]) {
    const expectedY = elevation + explode + 0.06 - 1.25;
    assert.equal(floorWorldY(elevation, explode), expectedY);
    const ray = new Ray(new Vector3(4, 12, 4), new Vector3(-1, -3, -1).normalize());
    const intersection = ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -floorWorldY(elevation, explode)), new Vector3());
    assert.ok(Math.abs(intersection.y - expectedY) < 1e-8);
  }
});
