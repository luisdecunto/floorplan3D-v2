import assert from "node:assert/strict";
import test from "node:test";
import {
  fitFurnitureModelTransform,
  furnitureRenderMode,
  resolveFurnitureAssetUrl,
} from "../app/furniture-model-fit.ts";

test("an item without a glbUrl falls back to the procedural renderer", () => {
  assert.equal(furnitureRenderMode({}), "procedural");
  assert.equal(furnitureRenderMode({ glbUrl: undefined }), "procedural");
});

test("an item with a glbUrl selects the GLB renderer", () => {
  assert.equal(furnitureRenderMode({ glbUrl: "models/chairs/cove-armchair.glb" }), "glb");
});

test("a relative glbUrl resolves under the GitHub Pages base path", () => {
  assert.equal(
    resolveFurnitureAssetUrl("models/chairs/cove-armchair.glb", "/floorplan3D/"),
    "/floorplan3D/models/chairs/cove-armchair.glb",
  );
});

test("a relative glbUrl resolves under a root base path", () => {
  assert.equal(resolveFurnitureAssetUrl("models/chairs/cove-armchair.glb", "/"), "/models/chairs/cove-armchair.glb");
});

test("a leading slash on the asset path doesn't double up with the base path", () => {
  assert.equal(resolveFurnitureAssetUrl("/models/chairs/cove-armchair.glb", "/floorplan3D/"), "/floorplan3D/models/chairs/cove-armchair.glb");
});

test("an absolute https glbUrl passes through untouched", () => {
  const url = "https://cdn.example.com/assets/cove-armchair.glb";
  assert.equal(resolveFurnitureAssetUrl(url, "/floorplan3D/"), url);
});

test("a GLB's bounding box is fit to the catalogue's real-world dimensions", () => {
  const bounds = { min: [-0.5, 0, -0.4], max: [0.5, 1.6, 0.4] };
  const target = { width: 0.92, height: 0.86, depth: 0.88 };
  const transform = fitFurnitureModelTransform(bounds, target);

  assert.ok(Math.abs(transform.scale[0] - target.width / 1) < 1e-9);
  assert.ok(Math.abs(transform.scale[1] - target.height / 1.6) < 1e-9);
  assert.ok(Math.abs(transform.scale[2] - target.depth / 0.8) < 1e-9);
});

test("the fit transform centers the model on x/z and rests it on the floor", () => {
  const bounds = { min: [1, 0.2, -3], max: [3, 2.2, -1] };
  const target = { width: 1, height: 1, depth: 1 };
  const transform = fitFurnitureModelTransform(bounds, target);

  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  assert.ok(Math.abs(transform.offset[0] - -centerX * transform.scale[0]) < 1e-9);
  assert.ok(Math.abs(transform.offset[2] - -centerZ * transform.scale[2]) < 1e-9);
  assert.ok(Math.abs(transform.offset[1] - -bounds.min[1] * transform.scale[1]) < 1e-9);

  const worldMinY = transform.offset[1] + bounds.min[1] * transform.scale[1];
  assert.ok(Math.abs(worldMinY) < 1e-9, "mesh should sit exactly on the floor after fitting");
});

test("a degenerate (flat) source axis falls back to unit scale instead of dividing by zero", () => {
  const bounds = { min: [0, 0, 0], max: [1, 0, 1] };
  const transform = fitFurnitureModelTransform(bounds, { width: 1, height: 1, depth: 1 });
  assert.equal(transform.scale[1], 1);
  assert.ok(Number.isFinite(transform.scale[1]));
});
