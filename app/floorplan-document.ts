import { resequenceRegions, type SourceRegion } from "./plan-regions.ts";
import type { Level } from "./scene-data";
import type { FurniturePlacement } from "./furniture-catalog";
import {
  alignAdjacentStairStructures,
  resolveScaleFromDoors,
  structureToLevel,
  type DetectedStructure,
  type ProjectScale,
} from "./structure-detector.ts";

export const FLOORPLAN_SCHEMA_VERSION = 2 as const;

export type DetectionProvenance = "semantic-model" | "geometry" | "ocr" | "topology" | "user";

export type ReviewIssue = {
  id: string;
  levelId?: string;
  entityId?: string;
  severity: "info" | "warning" | "blocking";
  code:
    | "floor-order"
    | "low-confidence-wall"
    | "missing-stairs"
    | "unaligned-stairs"
    | "outdoor-area"
    | "scale-needed";
  message: string;
  resolved: boolean;
};

export type FloorplanEdit = {
  id: string;
  levelId: string;
  kind:
    | "remove-wall"
    | "restore-wall"
    | "add-opening"
    | "remove-opening"
    | "move-opening"
    | "resize-opening"
    | "set-opening-kind"
    | "rename-level"
    | "set-outdoor-area"
    | "align-stairs"
    | "set-scale";
  entityId?: string;
  createdAt: string;
  before?: unknown;
  after?: unknown;
};

export type FloorplanLevelV2 = {
  id: string;
  name: string;
  order: number;
  elevation: number;
  sourceRegion: SourceRegion;
  structure: DetectedStructure;
  confidence: number;
  provenance: DetectionProvenance[];
  confirmed: boolean;
};

export type FloorplanDocumentV2 = {
  schemaVersion: typeof FLOORPLAN_SCHEMA_VERSION;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  model: {
    version: string;
    runtime: "webgpu" | "wasm" | "geometry-fallback";
  };
  source: {
    name: string;
    mimeType: string;
    width: number;
    height: number;
    previewDataUrl?: string;
  };
  levels: FloorplanLevelV2[];
  issues: ReviewIssue[];
  edits: FloorplanEdit[];
  scale: ProjectScale;
  furnishings?: FurniturePlacement[];
};

/**
 * Outdoor platforms are useful supporting evidence in an otherwise unlabeled
 * two-level sheet: a balcony normally belongs to an upper floor. The source's
 * top/bottom or left/right placement is never used as height by itself.
 */
export function suggestBuildingOrder(
  regions: SourceRegion[],
  structures: Record<string, DetectedStructure>,
) {
  if (regions.length !== 2) return resequenceRegions(regions);
  const withOutdoor = regions.filter((region) => structures[region.id]?.outdoorAreas.length);
  if (withOutdoor.length !== 1) return resequenceRegions(regions);
  return resequenceRegions([
    ...regions.filter((region) => region.id !== withOutdoor[0].id),
    withOutdoor[0],
  ]);
}

function identifier(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildIssues(levels: FloorplanLevelV2[], scale: ProjectScale): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  if (levels.length > 1 && levels.every((level) => !level.sourceRegion.nameEdited)) {
    issues.push({
      id: "floor-order-review",
      severity: "info",
      code: "floor-order",
      message: "Confirm the detected floor order. Page position is never treated as building height.",
      resolved: false,
    });
  }
  levels.forEach((level) => {
    level.structure.walls
      .filter((wall) => wall.confidence < 0.7)
      .forEach((wall) => issues.push({
        id: `wall-confidence-${level.id}-${wall.id}`,
        levelId: level.id,
        entityId: wall.id,
        severity: "warning",
        code: "low-confidence-wall",
        message: "This wall has weak structural evidence. Review it before generating 3D.",
        resolved: false,
      }));
    if (levels.length > 1 && level.structure.stairs.length === 0) {
      issues.push({
        id: `stairs-missing-${level.id}`,
        levelId: level.id,
        severity: "warning",
        code: "missing-stairs",
        message: "No stair shaft was found on this level.",
        resolved: false,
      });
    }
    if (level.sourceRegion.hasOutdoorArea && level.structure.outdoorAreas.length === 0) {
      issues.push({
        id: `outdoor-manual-${level.id}`,
        levelId: level.id,
        severity: "info",
        code: "outdoor-area",
        message: "Outdoor space was marked manually; verify its extent in plan review.",
        resolved: false,
      });
    }
  });
  const scaleIssue = levels[0] ? buildScaleIssue(scale, levels[0].id) : null;
  if (scaleIssue) issues.push(scaleIssue);
  return issues;
}

function buildScaleIssue(scale: ProjectScale, firstLevelId: string): ReviewIssue | null {
  if (scale.source === "user") return null;
  if (scale.source === "door-width") {
    return {
      id: "scale-door-width",
      levelId: firstLevelId,
      severity: "info",
      code: "scale-needed",
      message: "Scale is estimated from detected door widths, not measured. Add a known measurement to replace it.",
      resolved: false,
    };
  }
  return {
    id: "scale-provisional",
    levelId: firstLevelId,
    severity: "warning",
    code: "scale-needed",
    message: "Add one known measurement to resolve real-world scale.",
    resolved: false,
  };
}

export function createFloorplanDocumentV2({
  name,
  mimeType,
  width,
  height,
  regions,
  structures,
  previewDataUrl,
}: {
  name: string;
  mimeType: string;
  width: number;
  height: number;
  regions: SourceRegion[];
  structures: Record<string, DetectedStructure>;
  previewDataUrl?: string;
}): FloorplanDocumentV2 {
  const aligned = alignAdjacentStairStructures(regions, structures);
  const now = new Date().toISOString();
  const levels = regions.map((region, order) => ({
    id: region.id,
    name: region.name,
    order,
    elevation: order * 3.05,
    sourceRegion: { ...region },
    structure: aligned[region.id],
    confidence: Math.min(region.confidence, aligned[region.id]?.confidence ?? region.confidence),
    provenance: ["geometry", "topology"] as DetectionProvenance[],
    confirmed: false,
  })).filter((level) => Boolean(level.structure));
  const scale: ProjectScale = resolveScaleFromDoors(aligned) ?? {
    metresPerPixel: 0,
    source: "provisional",
    confidence: 0,
  };
  return {
    schemaVersion: FLOORPLAN_SCHEMA_VERSION,
    id: identifier("project"),
    name: name.replace(/\.[^.]+$/, "") || "Floorplan project",
    createdAt: now,
    updatedAt: now,
    model: { version: "v2-geometry-bootstrap", runtime: "geometry-fallback" },
    source: { name, mimeType, width, height, previewDataUrl },
    levels,
    issues: buildIssues(levels, scale),
    edits: [],
    scale,
    furnishings: [],
  };
}

export function documentRegions(document: FloorplanDocumentV2) {
  return [...document.levels]
    .sort((a, b) => a.order - b.order)
    .map((level) => ({ ...level.sourceRegion, name: level.name }));
}

export function documentStructures(document: FloorplanDocumentV2) {
  return Object.fromEntries(document.levels.map((level) => [level.id, level.structure]));
}

export function documentSceneLevels(document: FloorplanDocumentV2): Level[] {
  const sharedScale = document.scale.source === "provisional" ? undefined : document.scale;
  return [...document.levels]
    .sort((a, b) => a.order - b.order)
    .map((level, index) => structureToLevel(level.structure, { ...level.sourceRegion, name: level.name }, index, sharedScale));
}

/** Records an explicit user measurement, which always outranks the
 * door-width estimate or the provisional per-level fallback. */
export function setDocumentScale(document: FloorplanDocumentV2, metresPerPixel: number): FloorplanDocumentV2 {
  const before = document.scale;
  const after: ProjectScale = { metresPerPixel, source: "user", confidence: 1 };
  const now = new Date().toISOString();
  return {
    ...document,
    scale: after,
    updatedAt: now,
    issues: document.issues.filter((issue) => issue.code !== "scale-needed"),
    edits: [...document.edits, {
      id: identifier("edit"),
      levelId: document.levels[0]?.id ?? "building",
      kind: "set-scale" as const,
      createdAt: now,
      before,
      after,
    }],
  };
}

export function updateDocumentLevel(
  document: FloorplanDocumentV2,
  levelId: string,
  updater: (level: FloorplanLevelV2) => FloorplanLevelV2,
  edit?: Omit<FloorplanEdit, "id" | "levelId" | "createdAt">,
): FloorplanDocumentV2 {
  const now = new Date().toISOString();
  return {
    ...document,
    updatedAt: now,
    levels: document.levels.map((level) => level.id === levelId ? updater(level) : level),
    edits: edit ? [...document.edits, { ...edit, id: identifier("edit"), levelId, createdAt: now }] : document.edits,
  };
}

export function removeDocumentWall(document: FloorplanDocumentV2, levelId: string, wallId: string) {
  const level = document.levels.find((candidate) => candidate.id === levelId);
  const wall = level?.structure.walls.find((candidate) => candidate.id === wallId);
  if (!level || !wall) return document;
  return updateDocumentLevel(document, levelId, (current) => ({
    ...current,
    confirmed: false,
    structure: { ...current.structure, walls: current.structure.walls.filter((candidate) => candidate.id !== wallId) },
  }), { kind: "remove-wall", entityId: wallId, before: wall, after: null });
}

export function addDocumentOpening(
  document: FloorplanDocumentV2,
  levelId: string,
  wallId: string,
  kind: "door" | "window",
) {
  const level = document.levels.find((candidate) => candidate.id === levelId);
  const wall = level?.structure.walls.find((candidate) => candidate.id === wallId);
  if (!level || !wall) return document;
  const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  const width = Math.min(length * 0.42, Math.max(12, length * (kind === "door" ? 0.18 : 0.24)));
  const offset = Math.max(0, length / 2 - width / 2);
  const before = [...wall.openings];
  const after = [...before, { kind, offset, width, confidence: 1 }];
  return updateDocumentLevel(document, levelId, (current) => ({
    ...current,
    confirmed: false,
    structure: {
      ...current.structure,
      walls: current.structure.walls.map((candidate) => candidate.id === wallId ? { ...candidate, openings: after } : candidate),
    },
  }), { kind: "add-opening", entityId: wallId, before, after });
}

function updateOpening(
  document: FloorplanDocumentV2,
  levelId: string,
  wallId: string,
  openingIndex: number,
  kind: FloorplanEdit["kind"],
  transform: (opening: DetectedStructure["walls"][number]["openings"][number]) => DetectedStructure["walls"][number]["openings"][number] | null,
) {
  const level = document.levels.find((candidate) => candidate.id === levelId);
  const wall = level?.structure.walls.find((candidate) => candidate.id === wallId);
  const opening = wall?.openings[openingIndex];
  if (!level || !wall || !opening) return document;
  const before = [...wall.openings];
  const transformed = transform(opening);
  const after = transformed
    ? wall.openings.map((candidate, index) => index === openingIndex ? transformed : candidate)
    : wall.openings.filter((_, index) => index !== openingIndex);
  return updateDocumentLevel(document, levelId, (current) => ({
    ...current,
    confirmed: false,
    structure: {
      ...current.structure,
      walls: current.structure.walls.map((candidate) => candidate.id === wallId ? { ...candidate, openings: after } : candidate),
    },
  }), { kind, entityId: wallId, before, after });
}

export function removeDocumentOpening(document: FloorplanDocumentV2, levelId: string, wallId: string, openingIndex: number) {
  return updateOpening(document, levelId, wallId, openingIndex, "remove-opening", () => null);
}

export function moveDocumentOpening(document: FloorplanDocumentV2, levelId: string, wallId: string, openingIndex: number, offset: number) {
  return updateOpening(document, levelId, wallId, openingIndex, "move-opening", (opening) => ({ ...opening, offset: Math.max(0, offset) }));
}

export function resizeDocumentOpening(document: FloorplanDocumentV2, levelId: string, wallId: string, openingIndex: number, width: number) {
  return updateOpening(document, levelId, wallId, openingIndex, "resize-opening", (opening) => ({ ...opening, width: Math.max(4, width) }));
}

export function setDocumentOpeningKind(document: FloorplanDocumentV2, levelId: string, wallId: string, openingIndex: number, kind: "door" | "window") {
  return updateOpening(document, levelId, wallId, openingIndex, "set-opening-kind", (opening) => ({ ...opening, kind }));
}

export function undoLastDocumentEdit(document: FloorplanDocumentV2) {
  const edit = document.edits.at(-1);
  if (!edit) return document;
  if (edit.kind === "remove-wall" && edit.before) {
    const restored = updateDocumentLevel(document, edit.levelId, (level) => ({
      ...level,
      structure: { ...level.structure, walls: [...level.structure.walls, edit.before as DetectedStructure["walls"][number]] },
    }));
    return { ...restored, edits: document.edits.slice(0, -1) };
  }
  if (
    (edit.kind === "add-opening" || edit.kind === "remove-opening" || edit.kind === "move-opening" || edit.kind === "resize-opening" || edit.kind === "set-opening-kind")
    && Array.isArray(edit.before)
    && edit.entityId
  ) {
    const restored = updateDocumentLevel(document, edit.levelId, (level) => ({
      ...level,
      structure: {
        ...level.structure,
        walls: level.structure.walls.map((wall) => wall.id === edit.entityId ? {
          ...wall,
          openings: edit.before as DetectedStructure["walls"][number]["openings"],
        } : wall),
      },
    }));
    return { ...restored, edits: document.edits.slice(0, -1) };
  }
  if (edit.kind === "set-scale" && edit.before) {
    return {
      ...document,
      scale: edit.before as ProjectScale,
      edits: document.edits.slice(0, -1),
      updatedAt: new Date().toISOString(),
    };
  }
  return { ...document, edits: document.edits.slice(0, -1), updatedAt: new Date().toISOString() };
}

export function realignDocumentStairs(document: FloorplanDocumentV2) {
  const regions = documentRegions(document);
  const aligned = alignAdjacentStairStructures(regions, documentStructures(document));
  const now = new Date().toISOString();
  return {
    ...document,
    updatedAt: now,
    levels: document.levels.map((level) => ({ ...level, structure: aligned[level.id] })),
    edits: [...document.edits, {
      id: identifier("edit"),
      levelId: document.levels[0]?.id ?? "building",
      kind: "align-stairs" as const,
      createdAt: now,
    }],
  };
}

export function validateFloorplanDocument(value: unknown): FloorplanDocumentV2 {
  if (!value || typeof value !== "object") throw new Error("Project JSON must contain an object.");
  const candidate = value as Partial<FloorplanDocumentV2>;
  if (candidate.schemaVersion !== FLOORPLAN_SCHEMA_VERSION) throw new Error("This project uses an unsupported schema version.");
  if (!Array.isArray(candidate.levels) || candidate.levels.length === 0) throw new Error("The project contains no levels.");
  if (!candidate.source || !candidate.model || !Array.isArray(candidate.edits) || !Array.isArray(candidate.issues)) {
    throw new Error("The project is incomplete.");
  }
  // Projects saved before scale calibration was added have no scale field;
  // treat them as provisional rather than refusing to open them.
  if (!candidate.scale) {
    candidate.scale = { metresPerPixel: 0, source: "provisional", confidence: 0 };
  }
  candidate.furnishings = Array.isArray(candidate.furnishings)
    ? candidate.furnishings.filter((placement) => (
      placement
      && typeof placement.id === "string"
      && typeof placement.catalogId === "string"
      && typeof placement.levelId === "string"
      && Number.isFinite(placement.x)
      && Number.isFinite(placement.z)
      && Number.isFinite(placement.rotation)
    ))
    : [];
  return candidate as FloorplanDocumentV2;
}
