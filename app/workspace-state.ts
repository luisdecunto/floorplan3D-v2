import type { FloorplanDocumentV2 } from "./floorplan-document";
import { furnitureCatalogItem, type FurniturePlacement } from "./furniture-catalog.ts";
import { resolveFurnitureMove, type FurnitureMoveResult, type FurnitureObstacle } from "./furniture-placement.ts";
import type { Level } from "./scene-data";

/** Only committed project data belongs in this history. Panels, camera and drafts do not. */
export type WorkspaceSnapshot =
  | { kind: "project"; document: FloorplanDocumentV2 }
  | { kind: "sample"; furnishings: FurniturePlacement[] };
export type WorkspaceHistory = { present: WorkspaceSnapshot; past: WorkspaceSnapshot[] };
export type WorkspaceAction =
  | { type: "open"; snapshot: WorkspaceSnapshot }
  | { type: "commit"; snapshot: WorkspaceSnapshot }
  | { type: "sync"; snapshot: WorkspaceSnapshot }
  | { type: "undo" };

export function workspaceReducer(state: WorkspaceHistory, action: WorkspaceAction): WorkspaceHistory {
  if (action.type === "open") return { present: action.snapshot, past: [] };
  if (action.type === "sync") return { present: action.snapshot, past: [] };
  if (action.type === "commit") {
    if (action.snapshot === state.present) return state;
    return { present: action.snapshot, past: [...state.past.slice(-39), state.present] };
  }
  const previous = state.past.at(-1);
  if (!previous) return state;
  // Undo is itself a new save, otherwise reopening can incorrectly select a
  // different project whose timestamp is newer than the restored snapshot.
  const restored = previous.kind === "project"
    ? { ...previous, document: { ...previous.document, updatedAt: new Date().toISOString() } }
    : previous;
  return { present: restored, past: state.past.slice(0, -1) };
}

export function projectFurnishings(snapshot: WorkspaceSnapshot) {
  return snapshot.kind === "project" ? snapshot.document.furnishings ?? [] : snapshot.furnishings;
}

export function withFurnishings(snapshot: WorkspaceSnapshot, furnishings: FurniturePlacement[]): WorkspaceSnapshot {
  return snapshot.kind === "project"
    ? { kind: "project", document: { ...snapshot.document, furnishings, updatedAt: new Date().toISOString() } }
    : { kind: "sample", furnishings };
}

export function placementObstacles(furnishings: FurniturePlacement[], placement: FurniturePlacement): FurnitureObstacle[] {
  return furnishings.flatMap((other) => {
    const item = furnitureCatalogItem(other.catalogId);
    return item && other.levelId === placement.levelId && other.id !== placement.id
      ? [{ id: other.id, item, position: other, rotation: other.rotation }] : [];
  });
}

export function previewPlacement(placement: FurniturePlacement, level: Level, furnishings: FurniturePlacement[], grid: boolean): FurnitureMoveResult {
  const item = furnitureCatalogItem(placement.catalogId);
  if (!item || placement.levelId !== level.id) return { position: placement, collision: "wall" };
  return resolveFurnitureMove(item, level, placement.rotation, placement, placement, grid ? 0.1 : 0, placementObstacles(furnishings, placement));
}

/** Confirmation validates against the *current* floor/project, never a stale preview. */
export function confirmPlacement(snapshot: WorkspaceSnapshot, draft: FurniturePlacement, level: Level, grid: boolean): WorkspaceSnapshot {
  if (!furnitureCatalogItem(draft.catalogId) || draft.levelId !== level.id) return snapshot;
  const furnishings = projectFurnishings(snapshot);
  if (furnishings.some((item) => item.id === draft.id)) return snapshot;
  const result = previewPlacement(draft, level, furnishings, grid);
  return result.collision ? snapshot : withFurnishings(snapshot, [...furnishings, { ...draft, ...result.position }]);
}

export const SCENE_Y_OFFSET = -1.25;
export const DRAG_THRESHOLD_PX = 8;
export function floorWorldY(elevation: number, explodeOffset = 0) { return elevation + explodeOffset + 0.06 + SCENE_Y_OFFSET; }
export function passedDragThreshold(start: {x: number; y: number}, pointer: {x: number; y: number}) {
  return Math.hypot(pointer.x - start.x, pointer.y - start.y) >= DRAG_THRESHOLD_PX;
}
export function grabbedPosition(point: {x: number; z: number}, offset: {x: number; z: number}) {
  return { x: point.x - offset.x, z: point.z - offset.z };
}
export function shouldCancelObjectGesture(itemId: string, selectedId: string | null, draftId: string | null, pointerCount: number) {
  return pointerCount > 1 || (itemId !== selectedId && itemId !== draftId);
}

export function collisionDescription(reason: FurnitureMoveResult["collision"]) {
  switch (reason) {
    case "wall": return "Overlaps a wall. Move into a clear area.";
    case "door": return "Blocks a doorway. Leave the entrance clear.";
    case "fixture": return "Overlaps a built-in fixture.";
    case "stair": return "Overlaps the stairs. Keep this space clear.";
    case "furniture": return "Overlaps another piece of furniture.";
    default: return "Ready to place";
  }
}
