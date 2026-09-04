import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCollaborationOperation,
  collaborationConditionAfter,
  collaborationConditionMatches,
  collaborationInvite,
  collaborationOperation,
  createCollaborationInviteUrl,
} from "../app/collaboration-protocol.ts";
import { createFloorplanDocumentV2 } from "../app/floorplan-document.ts";

const chair = { id: "chair-1", catalogId: "ikea-adde", levelId: "ground", x: 1, z: 1, rotation: 0 };

function project() {
  const region = { id: "ground", name: "Ground floor", x: 0, y: 0, width: 1, height: 1, confidence: 1 };
  const structure = { regionId: "ground", sourceWidth: 200, sourceHeight: 200, walls: [], outdoorAreas: [], stairs: [], rooms: [], fixtures: [], footprint: { x: 0, y: 0, width: 200, height: 200 }, roomCount: 1, confidence: 1, diagnostics: { threshold: 140, wallThickness: 8, geometryVotes: 1, topologyVotes: 1, openingVotes: 0, stairVotes: 0 } };
  return createFloorplanDocumentV2({ name: "shared.png", mimeType: "image/png", width: 200, height: 200, regions: [region], structures: { ground: structure } });
}

test("collaboration links keep the edit capability in the URL fragment", () => {
  const credentials = { roomId: "1234567890abcdef", editKey: "0123456789abcdef0123456789abcdef" };
  const url = createCollaborationInviteUrl("https://example.test/floorplan3D-v2/?old=1#share=old", credentials);
  assert.equal(new URL(url).search, "");
  assert.deepEqual(collaborationInvite(new URL(url).hash), credentials);
  assert.equal(collaborationInvite("#collab=broken"), null);
});

test("one furniture change becomes an entity operation that preserves concurrent furniture", () => {
  const original = { ...project(), furnishings: [chair] };
  const moved = { ...original, updatedAt: "2026-01-01T00:00:00.000Z", furnishings: [{ ...chair, x: 2 }] };
  const operation = collaborationOperation(original, moved);
  assert.equal(operation.kind, "upsert-furniture");
  const partnerChair = { ...chair, id: "chair-2", x: 4 };
  const canonical = { ...original, furnishings: [chair, partnerChair] };
  assert.deepEqual(applyCollaborationOperation(canonical, operation).furnishings, [{ ...chair, x: 2 }, partnerChair]);
});

test("furniture removal and its inverse are safe to apply by entity", () => {
  const original = { ...project(), furnishings: [chair] };
  const removed = { ...original, updatedAt: "2026-01-01T00:00:00.000Z", furnishings: [] };
  const forward = collaborationOperation(original, removed);
  const inverse = collaborationOperation(removed, original);
  assert.equal(forward.kind, "remove-furniture");
  assert.deepEqual(applyCollaborationOperation(applyCollaborationOperation(original, forward), inverse).furnishings, [chair]);
});

test("undo conditions reject changes to the same piece but allow unrelated edits", () => {
  const original = { ...project(), furnishings: [chair] };
  const movedChair = { ...chair, x: 2 };
  const operation = collaborationOperation(original, { ...original, updatedAt: "later", furnishings: [movedChair] });
  const condition = collaborationConditionAfter(operation, 4);
  assert.equal(collaborationConditionMatches({ ...original, furnishings: [movedChair] }, 5, condition), true);
  assert.equal(collaborationConditionMatches({ ...original, furnishings: [{ ...movedChair, x: 3 }] }, 5, condition), false);
});

test("structural changes remain atomic and revision guarded", () => {
  const original = project();
  const renamed = { ...original, name: "Our apartment", updatedAt: "later" };
  const operation = collaborationOperation(original, renamed);
  assert.equal(operation.kind, "replace-document");
  const condition = collaborationConditionAfter(operation, 7);
  assert.equal(collaborationConditionMatches(renamed, 7, condition), true);
  assert.equal(collaborationConditionMatches(renamed, 8, condition), false);
});
