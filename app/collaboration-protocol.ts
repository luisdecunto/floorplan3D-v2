import type { FloorplanDocumentV2 } from "./floorplan-document.ts";
import type { FurniturePlacement } from "./furniture-catalog.ts";

export const COLLABORATION_PROTOCOL_VERSION = 1;
export const MAX_COLLABORATION_DOCUMENT_BYTES = 2_000_000;
export const MAX_COLLABORATION_MESSAGE_BYTES = 2_100_000;
export const MAX_COLLABORATION_HISTORY = 50;

export type CollaborationCredentials = {
  roomId: string;
  editKey: string;
};

export type CollaborationOperation =
  | { kind: "upsert-furniture"; placement: FurniturePlacement; updatedAt: string }
  | { kind: "remove-furniture"; id: string; updatedAt: string }
  | { kind: "replace-document"; document: FloorplanDocumentV2 };

export type CollaborationHistoryKind = "initial" | "add-furniture" | "move-furniture" | "remove-furniture" | "document" | "restore";

export type CollaborationHistoryEntry = {
  revision: number;
  operationId: string;
  actorId: string;
  actorName: string;
  createdAt: string;
  kind: CollaborationHistoryKind;
  targetId?: string;
  catalogId?: string;
};

export type CollaborationCondition =
  | { kind: "furniture"; id: string; value: FurniturePlacement | null }
  | { kind: "revision"; revision: number };

export type CollaborationClientMessage =
  | { type: "join"; protocol: typeof COLLABORATION_PROTOCOL_VERSION; editKey: string; clientId: string; name: string }
  | { type: "update"; operationId: string; baseRevision: number; operation: CollaborationOperation; condition?: CollaborationCondition; action?: "restore" }
  | { type: "history-request"; revision: number };

export type CollaborationServerMessage =
  | { type: "snapshot"; document: FloorplanDocumentV2; revision: number; operationId?: string; actorId?: string; people: number }
  | { type: "history"; entries: CollaborationHistoryEntry[] }
  | { type: "history-snapshot"; document: FloorplanDocumentV2; revision: number }
  | { type: "history-entry"; entry: CollaborationHistoryEntry }
  | { type: "presence"; people: number; collaborators?: { id: string; name: string }[] }
  | { type: "error"; code: "unauthorized" | "invalid-message" | "room-missing" | "stale" | "undo-conflict" | "history-not-found" | "rate-limited"; message: string; document?: FloorplanDocumentV2; revision?: number };

function comparableDocument(document: FloorplanDocumentV2) {
  return { ...document, furnishings: [], updatedAt: "" };
}

function equal(valueA: unknown, valueB: unknown) {
  return JSON.stringify(valueA) === JSON.stringify(valueB);
}

/**
 * Furniture edits become small entity operations, so partners can move
 * different pieces concurrently. Less common structural edits remain an
 * atomic document replacement guarded by the room revision.
 */
export function collaborationOperation(
  before: FloorplanDocumentV2,
  after: FloorplanDocumentV2,
): CollaborationOperation | null {
  if (equal(before, after)) return null;
  if (!equal(comparableDocument(before), comparableDocument(after))) {
    return { kind: "replace-document", document: after };
  }

  const beforeById = new Map((before.furnishings ?? []).map((item) => [item.id, item]));
  const afterById = new Map((after.furnishings ?? []).map((item) => [item.id, item]));
  const changed = new Set<string>();
  for (const [id, item] of beforeById) if (!equal(item, afterById.get(id))) changed.add(id);
  for (const [id, item] of afterById) if (!equal(item, beforeById.get(id))) changed.add(id);
  if (changed.size !== 1) return { kind: "replace-document", document: after };

  const id = [...changed][0];
  const placement = afterById.get(id);
  return placement
    ? { kind: "upsert-furniture", placement, updatedAt: after.updatedAt }
    : { kind: "remove-furniture", id, updatedAt: after.updatedAt };
}

export function applyCollaborationOperation(
  document: FloorplanDocumentV2,
  operation: CollaborationOperation,
): FloorplanDocumentV2 {
  if (operation.kind === "replace-document") return operation.document;
  const furnishings = document.furnishings ?? [];
  if (operation.kind === "remove-furniture") {
    return { ...document, furnishings: furnishings.filter((item) => item.id !== operation.id), updatedAt: operation.updatedAt };
  }
  const exists = furnishings.some((item) => item.id === operation.placement.id);
  return {
    ...document,
    furnishings: exists
      ? furnishings.map((item) => item.id === operation.placement.id ? operation.placement : item)
      : [...furnishings, operation.placement],
    updatedAt: operation.updatedAt,
  };
}

/** Derives the small, non-sensitive activity record stored beside a revision. */
export function collaborationHistoryChange(
  operation: CollaborationOperation,
  before: FloorplanDocumentV2,
  action?: "restore",
): Pick<CollaborationHistoryEntry, "kind" | "targetId" | "catalogId"> {
  if (action === "restore") return { kind: "restore" };
  if (operation.kind === "upsert-furniture") {
    const existed = (before.furnishings ?? []).some((item) => item.id === operation.placement.id);
    return {
      kind: existed ? "move-furniture" : "add-furniture",
      targetId: operation.placement.id,
      catalogId: operation.placement.catalogId,
    };
  }
  if (operation.kind === "remove-furniture") {
    const removed = (before.furnishings ?? []).find((item) => item.id === operation.id);
    return {
      kind: "remove-furniture",
      targetId: operation.id,
      ...(removed ? { catalogId: removed.catalogId } : {}),
    };
  }
  return { kind: "document" };
}

export function collaborationConditionAfter(
  operation: CollaborationOperation,
  acceptedRevision: number,
): CollaborationCondition {
  if (operation.kind === "replace-document") return { kind: "revision", revision: acceptedRevision };
  return operation.kind === "upsert-furniture"
    ? { kind: "furniture", id: operation.placement.id, value: operation.placement }
    : { kind: "furniture", id: operation.id, value: null };
}

export function collaborationConditionMatches(
  document: FloorplanDocumentV2,
  revision: number,
  condition: CollaborationCondition,
) {
  if (condition.kind === "revision") return revision === condition.revision;
  const placement = (document.furnishings ?? []).find((item) => item.id === condition.id) ?? null;
  return equal(placement, condition.value);
}

export function collaborationInvite(hash: string): CollaborationCredentials | null {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get("collab");
  if (!value) return null;
  const separator = value.indexOf(".");
  const roomId = value.slice(0, separator);
  const editKey = value.slice(separator + 1);
  return /^[A-Za-z0-9_-]{16,80}$/.test(roomId) && /^[A-Za-z0-9_-]{32,160}$/.test(editKey)
    ? { roomId, editKey }
    : null;
}

export function createCollaborationInviteUrl(
  applicationUrl: string,
  credentials: CollaborationCredentials,
) {
  const url = new URL(applicationUrl);
  url.search = "";
  url.hash = new URLSearchParams({ collab: `${credentials.roomId}.${credentials.editKey}` }).toString();
  return url.href;
}

export function isFurniturePlacement(value: unknown): value is FurniturePlacement {
  if (!value || typeof value !== "object") return false;
  const placement = value as Partial<FurniturePlacement>;
  return typeof placement.id === "string" && placement.id.length > 0 && placement.id.length <= 200
    && typeof placement.catalogId === "string" && placement.catalogId.length > 0 && placement.catalogId.length <= 200
    && typeof placement.levelId === "string" && placement.levelId.length > 0 && placement.levelId.length <= 200
    && Number.isFinite(placement.x)
    && Math.abs(placement.x!) < 10_000
    && Number.isFinite(placement.z)
    && Math.abs(placement.z!) < 10_000
    && Number.isFinite(placement.rotation)
    && Math.abs(placement.rotation!) < 10_000
    && (placement.mirrored === undefined || typeof placement.mirrored === "boolean");
}

export function isCollaborationOperation(value: unknown): value is CollaborationOperation {
  if (!value || typeof value !== "object") return false;
  const operation = value as Partial<CollaborationOperation>;
  if (operation.kind === "upsert-furniture") {
    return isFurniturePlacement(operation.placement) && typeof operation.updatedAt === "string" && operation.updatedAt.length <= 100;
  }
  if (operation.kind === "remove-furniture") return typeof operation.id === "string" && operation.id.length > 0 && operation.id.length <= 200 && typeof operation.updatedAt === "string" && operation.updatedAt.length <= 100;
  if (operation.kind === "replace-document") {
    const document = operation.document as Partial<FloorplanDocumentV2> | undefined;
    return Boolean(document && document.schemaVersion === 2 && Array.isArray(document.levels) && document.levels.length);
  }
  return false;
}
