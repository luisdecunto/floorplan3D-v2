import assert from "node:assert/strict";
import test from "node:test";
import { createFloorplanDocumentV2 } from "../app/floorplan-document.ts";
import { createProjectShareUrl, decodeSharedProject, encodeSharedProject, shareableProject, sharedProjectPayload } from "../app/project-share.ts";

function project() {
  const region = { id: "ground", name: "Ground floor", x: 0, y: 0, width: 1, height: 1, confidence: 1 };
  const structure = { regionId: "ground", sourceWidth: 200, sourceHeight: 200, walls: [{ id: "wall", axis: "horizontal", start: [0, 0], end: [200, 0], thickness: 8, confidence: 1, weight: "heavy", openings: [] }], outdoorAreas: [], stairs: [], rooms: [], fixtures: [], footprint: { x: 0, y: 0, width: 200, height: 200 }, floorTextureUrl: "data:image/png;base64,FLOOR", roomCount: 1, confidence: 1, diagnostics: { threshold: 140, wallThickness: 8, geometryVotes: 1, topologyVotes: 1, openingVotes: 0, stairVotes: 0 } };
  const document = createFloorplanDocumentV2({ name: "Shared home", mimeType: "image/png", width: 200, height: 200, previewDataUrl: "data:image/png;base64,SOURCE", regions: [region], structures: { ground: structure } });
  return { ...document, furnishings: [{ id: "chair", catalogId: "teodores-chair", levelId: "ground", x: 1, z: 2, rotation: 0 }] };
}

test("share snapshots remove source imagery but preserve geometry and furniture", () => {
  const source = project();
  const shared = shareableProject(source);
  assert.equal(shared.source.previewDataUrl, undefined);
  assert.equal(shared.levels[0].structure.floorTextureUrl, undefined);
  assert.deepEqual(shared.furnishings, source.furnishings);
  assert.equal(source.source.previewDataUrl, "data:image/png;base64,SOURCE", "sharing must not mutate the open project");
});

test("static share payloads round-trip through a GitHub Pages hash URL", async () => {
  const source = project();
  const url = await createProjectShareUrl(source, "https://example.test/floorplan3D-v2/");
  assert.match(url, /^https:\/\/example\.test\/floorplan3D-v2\/#share=/);
  const payload = sharedProjectPayload(new URL(url).hash);
  assert.ok(payload);
  const opened = await decodeSharedProject(payload);
  assert.equal(opened.name, source.name);
  assert.deepEqual(opened.furnishings, source.furnishings);
  assert.equal(opened.source.previewDataUrl, undefined);
});

test("invalid and unsupported share payloads are rejected", async () => {
  await assert.rejects(() => decodeSharedProject("x.invalid"), /unsupported format/);
  const encoded = await encodeSharedProject(project());
  await assert.rejects(() => decodeSharedProject(encoded.slice(0, -4) + "nope"));
});
