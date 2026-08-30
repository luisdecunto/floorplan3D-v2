"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Box,
  Check,
  ChevronLeft,
  CircleHelp,
  Download,
  Eye,
  EyeOff,
  Grid3X3,
  ImageUp,
  Layers3,
  Maximize2,
  Menu,
  Minimize2,
  MoreHorizontal,
  Move,
  Move3D,
  Plus,
  RotateCw,
  Ruler,
  ScanLine,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sofa,
  Smartphone,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { ChangeEvent, Component, lazy, type PointerEvent as ReactPointerEvent, ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  detectPlanRegions,
  LEVEL_NAME_OPTIONS,
  moveRegion,
  resequenceRegions,
  resizeRegion,
  type SourceRegion,
} from "./plan-regions";
import { sampleLevels, type Level } from "./scene-data";
import {
  FURNITURE_CATALOG,
  furnitureCatalogItem,
  type FurnitureCatalogItem,
  type FurniturePlacement,
} from "./furniture-catalog";
import {
  findNearestValidFurniturePosition,
  resolveFurnitureMove,
  validFurniturePosition,
} from "./furniture-placement";
import {
  addDocumentOpening,
  createFloorplanDocumentV2,
  documentRegions,
  documentStructures,
  realignDocumentStairs,
  removeDocumentWall,
  setDocumentScale,
  suggestBuildingOrder,
  undoLastDocumentEdit,
  type FloorplanDocumentV2,
} from "./floorplan-document";
import { downloadProject, loadLatestProjectLocally, parseProject, saveProjectLocally } from "./project-storage";
import {
  alignAdjacentStairStructures,
  detectFloorStructures,
  resolveScaleFromDoors,
  structureToLevel,
  type DetectedStructure,
  type ProjectScale,
} from "./structure-detector";

const TwinViewer = lazy(() => import("./twin-viewer"));

type AppStage = "welcome" | "analyzing" | "workspace";
type ViewMode = "review" | "twin" | "furnish";
type AnalysisSize = { width: number; height: number };
type StructureMap = Record<string, DetectedStructure>;

const sampleRegions: SourceRegion[] = [
  { id: "ground", name: "Ground floor", x: 0.05, y: 0.14, width: 0.42, height: 0.68, confidence: 0.96 },
  { id: "upper", name: "First floor", x: 0.53, y: 0.14, width: 0.42, height: 0.68, confidence: 0.91 },
];

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function loadImage(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

async function inspectFloorplan(url: string): Promise<{ regions: SourceRegion[]; structures: StructureMap; size: AnalysisSize; previewDataUrl?: string }> {
  try {
    const image = await loadImage(url);
    // Preserve thin balcony rails and stair treads. At 900 px the browser's
    // bilinear resize can erase these one-pixel signals in phone screenshots.
    // 1280 px remains modest for mobile memory while retaining the structure.
    const maxSide = 1280;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let regions = detectPlanRegions(pixels, width, height);
    let structures = detectFloorStructures(pixels, width, height, regions);
    Object.values(structures).forEach((structure) => {
      const cropX = Math.max(0, Math.floor(structure.footprint.x));
      const cropY = Math.max(0, Math.floor(structure.footprint.y));
      const cropWidth = Math.max(1, Math.min(width - cropX, Math.ceil(structure.footprint.width)));
      const cropHeight = Math.max(1, Math.min(height - cropY, Math.ceil(structure.footprint.height)));
      const floorCanvas = document.createElement("canvas");
      floorCanvas.width = cropWidth;
      floorCanvas.height = cropHeight;
      const floorContext = floorCanvas.getContext("2d");
      if (floorContext) {
        floorContext.translate(-cropX, -cropY);
        if (structure.sourceRotationDegrees && structure.rotationCenter) {
          const [centerX, centerY] = structure.rotationCenter;
          floorContext.translate(centerX, centerY);
          floorContext.rotate(-structure.sourceRotationDegrees * Math.PI / 180);
          floorContext.translate(-centerX, -centerY);
        }
        floorContext.drawImage(canvas, 0, 0);
      }
      structure.floorTextureUrl = floorCanvas.toDataURL("image/jpeg", 0.86);
    });
    regions = regions.map((region) => ({
      ...region,
      hasOutdoorArea: structures[region.id]?.outdoorAreas.length > 0,
      confidence: structures[region.id]
        ? Math.min(region.confidence, structures[region.id].confidence)
        : region.confidence,
    }));

    // A rail-enclosed exterior platform is useful ordering evidence in a
    // two-level plan: suggest the enclosed plan below the balcony level while
    // retaining the explicit reverse/relabel controls for ambiguous cases.
    regions = suggestBuildingOrder(regions, structures);
    structures = alignAdjacentStairStructures(regions, structures);
    return { regions, structures, size: { width, height }, previewDataUrl: canvas.toDataURL("image/jpeg", 0.9) };
  } catch {
    const regions = [{ id: "ground", name: "Floor 1", x: 0.03, y: 0.03, width: 0.94, height: 0.94, confidence: 0.42 }];
    return { regions, structures: {}, size: { width: 1, height: 1 } };
  }
}

function scaleLabel(scale: ProjectScale | undefined) {
  if (!scale || scale.source === "provisional") return "Measurement needed";
  if (scale.source === "user") return "Resolved (measured)";
  return "Estimated (door width)";
}

function scaleHeadline(scale: ProjectScale | undefined) {
  if (!scale || scale.source === "provisional") return "One measurement needed";
  if (scale.source === "user") return "Scale verified";
  return "Scale estimated from doors";
}

function scaleCopy(scale: ProjectScale | undefined, hasSelectedWall: boolean) {
  if (!scale || scale.source === "provisional") return "Select a wall, then Measure and enter its real length.";
  if (scale.source === "user") return "Dimensions use your measured wall length.";
  return hasSelectedWall
    ? "Dimensions are estimated from typical door widths. Press Measure to enter this wall's real length instead."
    : "Dimensions are estimated from typical door widths, not measured. Select a wall to enter a real length instead.";
}

/**
 * Keeps a WebGL failure legible. Without this, anything thrown while building
 * the scene (a lost context, a driver refusing a texture, a bad asset) unmounts
 * the tree and leaves an empty stage with no indication of what went wrong —
 * which is indistinguishable from the viewer simply hanging.
 */
class ViewerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("3D viewer failed to start", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="viewer-loading viewer-failed">
          <Box size={22} />
          <span>The 3D view could not start on this device.</span>
          <button onClick={() => this.setState({ failed: false })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function buildPreviewLevels(regions: SourceRegion[], structures: StructureMap, sharedScale?: ProjectScale): Level[] {
  return regions.map((region, index) => {
    const detected = structures[region.id];
    if (detected?.walls.length >= 3) return structureToLevel(detected, region, index, sharedScale);
    const template = sampleLevels[Math.min(index, sampleLevels.length - 1)];
    return {
      ...template,
      id: region.id,
      name: region.name,
      shortName: index === 0 ? "BASE" : `${index}F`,
      elevation: index * 3.05,
      detectionConfidence: region.confidence,
    };
  });
}

export default function Home() {
  const [stage, setStage] = useState<AppStage>("welcome");
  const [viewMode, setViewMode] = useState<ViewMode>("review");
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [regions, setRegions] = useState<SourceRegion[]>(sampleRegions);
  const [structures, setStructures] = useState<StructureMap>({});
  const [analysisSize, setAnalysisSize] = useState<AnalysisSize | null>(null);
  const [activeLevel, setActiveLevel] = useState("ground");
  const [focusedLevel, setFocusedLevel] = useState<string | null>(null);
  const [visibleLevels, setVisibleLevels] = useState(() => new Set(["ground", "upper"]));
  const [exploded, setExploded] = useState(false);
  const [wallCutaway, setWallCutaway] = useState(1);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [mobilePanel, setMobilePanel] = useState<"levels" | "canvas" | "details">("canvas");
  const [document, setDocument] = useState<FloorplanDocumentV2 | null>(null);
  const [lastProject, setLastProject] = useState<FloorplanDocumentV2 | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [furnishings, setFurnishings] = useState<FurniturePlacement[]>([]);
  const [furnitureHistory, setFurnitureHistory] = useState<FurniturePlacement[][]>([]);
  const [gridSnapEnabled, setGridSnapEnabled] = useState(true);
  const [selectedFurnishingId, setSelectedFurnishingId] = useState<string | null>(null);
  const [projectMessage, setProjectMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  useEffect(() => {
    loadLatestProjectLocally().then(setLastProject).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!document) return;
    const timeout = window.setTimeout(() => {
      saveProjectLocally(document)
        .then(() => setLastProject(document))
        .catch(() => setProjectMessage("Local save is unavailable in this browser."));
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [document]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDocument((project) => project ? {
        ...project,
        furnishings,
        updatedAt: new Date().toISOString(),
      } : project);
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [furnishings]);

  const doorScale = useMemo(() => resolveScaleFromDoors(structures) ?? undefined, [structures]);
  const sharedScale = document?.scale.source === "user" ? document.scale : doorScale;
  const previewLevels = buildPreviewLevels(regions, structures, sharedScale);
  const selectedRegion = regions.find((region) => region.id === activeLevel) ?? regions[0];
  const selectedLevel = previewLevels.find((level) => level.id === activeLevel) ?? previewLevels[0] ?? sampleLevels[0];

  useEffect(() => {
    if (stage !== "workspace" || viewMode !== "furnish" || !selectedFurnishingId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button")) return;
      const key = event.key.toLowerCase();
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", "q", "e", "delete", "backspace"].includes(key)) {
        event.preventDefault();
      }
      if (key === "arrowleft") nudgeFurnishing(selectedFurnishingId, -0.1, 0);
      if (key === "arrowright") nudgeFurnishing(selectedFurnishingId, 0.1, 0);
      if (key === "arrowup") nudgeFurnishing(selectedFurnishingId, 0, -0.1);
      if (key === "arrowdown") nudgeFurnishing(selectedFurnishingId, 0, 0.1);
      if (key === "q") rotateFurnishing(selectedFurnishingId, -1);
      if (key === "e") rotateFurnishing(selectedFurnishingId, 1);
      if (key === "delete" || key === "backspace") removeFurnishing(selectedFurnishingId);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedFurnishingId, stage, viewMode, furnishings, previewLevels]); // eslint-disable-line react-hooks/exhaustive-deps

  function measureScale() {
    if (!document) return;
    const wall = structures[activeLevel]?.walls.find((candidate) => candidate.id === selectedWallId);
    if (!wall) {
      setProjectMessage("Select a wall first, then Measure to enter its real length.");
      return;
    }
    const pixelLength = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    const input = window.prompt("Real length of the selected wall, in metres:");
    const metres = input ? Number.parseFloat(input) : NaN;
    if (!Number.isFinite(metres) || metres <= 0 || metres > 40) {
      setProjectMessage("Enter a wall length between 0 and 40 metres.");
      return;
    }
    setDocument(setDocumentScale(document, metres / pixelLength));
    setProjectMessage("Scale updated from your measurement.");
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    const supported = ["image/jpeg", "image/png", "image/webp"].includes(nextFile.type);
    if (!supported || nextFile.size > 20 * 1024 * 1024) {
      setProjectMessage(!supported ? "Choose a JPG, PNG or WebP image." : "This image is larger than the 20 MB limit.");
      event.target.value = "";
      return;
    }
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setFile(nextFile);
    setImageUrl(URL.createObjectURL(nextFile));
    setProjectMessage(null);
  }

  async function analyze(useSample = false) {
    setStage("analyzing");
    setAnalysisStep(0);
    await sleep(420);
    setAnalysisStep(1);
    let proposedRegions = sampleRegions;
    let proposedStructures: StructureMap = {};
    let proposedSize: AnalysisSize | null = null;
    let proposedPreviewDataUrl: string | undefined;
    if (!useSample && imageUrl) {
      const analysis = await inspectFloorplan(imageUrl);
      proposedRegions = analysis.regions;
      proposedStructures = analysis.structures;
      proposedSize = analysis.size;
      proposedPreviewDataUrl = analysis.previewDataUrl;
    }
    await sleep(520);
    setAnalysisStep(2);
    await sleep(460);
    setAnalysisStep(3);
    await sleep(420);
    setRegions(proposedRegions);
    setStructures(proposedStructures);
    setDocument(!useSample && proposedSize && Object.keys(proposedStructures).length ? createFloorplanDocumentV2({
      name: file?.name ?? "Floorplan project",
      mimeType: file?.type ?? "image/unknown",
      width: proposedSize.width,
      height: proposedSize.height,
      regions: proposedRegions,
      structures: proposedStructures,
      previewDataUrl: proposedPreviewDataUrl,
    }) : null);
    setFurnishings([]);
    setFurnitureHistory([]);
    setSelectedFurnishingId(null);
    setAnalysisSize(proposedSize);
    setActiveLevel(proposedRegions[0]?.id ?? "ground");
    setVisibleLevels(new Set(proposedRegions.slice(0, 2).map((region) => region.id)));
    setWallCutaway(1);
    setSelectedWallId(null);
    setProjectMessage(null);
    setStage("workspace");
  }

  async function importProject(event: ChangeEvent<HTMLInputElement>) {
    const projectFile = event.target.files?.[0];
    if (!projectFile) return;
    try {
      const imported = parseProject(await projectFile.text());
      setDocument(imported);
      setFurnishings(imported.furnishings ?? []);
      setFurnitureHistory([]);
      setSelectedFurnishingId(null);
      setRegions(documentRegions(imported));
      setStructures(documentStructures(imported));
      setImageUrl(imported.source.previewDataUrl ?? null);
      setAnalysisSize({ width: imported.source.width, height: imported.source.height });
      setActiveLevel(imported.levels[0].id);
      setVisibleLevels(new Set(imported.levels.map((level) => level.id)));
      setSelectedWallId(null);
      setProjectMessage("Project imported. The source texture is restored when it was included in the project.");
      setStage("workspace");
    } catch (error) {
      setProjectMessage(error instanceof Error ? error.message : "This project could not be imported.");
    } finally {
      event.target.value = "";
    }
  }

  function openProject(project: FloorplanDocumentV2) {
    setDocument(project);
    setFurnishings(project.furnishings ?? []);
    setFurnitureHistory([]);
    setSelectedFurnishingId(null);
    setRegions(documentRegions(project));
    setStructures(documentStructures(project));
    setImageUrl(project.source.previewDataUrl ?? null);
    setAnalysisSize({ width: project.source.width, height: project.source.height });
    setActiveLevel(project.levels[0].id);
    setVisibleLevels(new Set(project.levels.map((level) => level.id)));
    setSelectedWallId(null);
    setProjectMessage("Local project restored.");
    setStage("workspace");
  }

  function removeSelectedWall() {
    if (!document || !selectedWallId) return;
    const next = removeDocumentWall(document, activeLevel, selectedWallId);
    setDocument(next);
    setStructures(documentStructures(next));
    setSelectedWallId(null);
    setProjectMessage("Wall removed and the space marked open. Undo is available.");
  }

  function addOpening(kind: "door" | "window") {
    if (!document || !selectedWallId) return;
    const next = addDocumentOpening(document, activeLevel, selectedWallId, kind);
    setDocument(next);
    setStructures(documentStructures(next));
    setProjectMessage(`${kind === "door" ? "Door" : "Window"} added at the wall midpoint. Drag positioning is the next editor refinement.`);
  }

  function undoEdit() {
    if (!document) return;
    const next = undoLastDocumentEdit(document);
    setDocument(next);
    setStructures(documentStructures(next));
    setProjectMessage("Last structural edit undone.");
  }

  function alignStairs() {
    if (!document) return;
    const next = realignDocumentStairs(document);
    setDocument(next);
    setStructures(documentStructures(next));
    setProjectMessage("Stair shafts aligned across adjacent floors.");
  }

  function confirmLevel() {
    if (!document) return;
    const now = new Date().toISOString();
    setDocument({
      ...document,
      updatedAt: now,
      levels: document.levels.map((level) => level.id === activeLevel ? { ...level, confirmed: true } : level),
      issues: document.issues.map((issue) => (
        issue.levelId === activeLevel || issue.code === "floor-order" ? { ...issue, resolved: true } : issue
      )),
    });
    setProjectMessage(`${selectedRegion.name} confirmed.`);
  }

  function toggleLevel(id: string) {
    setVisibleLevels((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function moveLevel(id: string, offset: -1 | 1) {
    setRegions((current) => {
      const next = moveRegion(current, id, offset);
      setDocument((project) => project ? {
        ...project,
        updatedAt: new Date().toISOString(),
        levels: next.map((region, order) => {
          const level = project.levels.find((candidate) => candidate.id === region.id)!;
          return { ...level, order, elevation: order * 3.05, name: region.name, sourceRegion: region };
        }),
      } : project);
      return next;
    });
  }

  function reverseLevelOrder() {
    setRegions((current) => {
      const next = resequenceRegions([...current].reverse());
      setDocument((project) => project ? {
        ...project,
        updatedAt: new Date().toISOString(),
        levels: next.map((region, order) => {
          const level = project.levels.find((candidate) => candidate.id === region.id)!;
          return { ...level, order, elevation: order * 3.05, name: region.name, sourceRegion: region };
        }),
      } : project);
      return next;
    });
  }

  function renameLevel(id: string, name: string) {
    setRegions((current) => current.map((region) => (
      region.id === id ? { ...region, name, nameEdited: true } : region
    )));
    setDocument((project) => project ? {
      ...project,
      updatedAt: new Date().toISOString(),
      levels: project.levels.map((level) => level.id === id ? {
        ...level,
        name,
        sourceRegion: { ...level.sourceRegion, name, nameEdited: true },
      } : level),
    } : project);
  }

  function resizeLevelBoundary(id: string, amount: number) {
    setRegions((current) => current.map((region) => (
      region.id === id ? resizeRegion(region, amount) : region
    )));
    setDocument((project) => project ? {
      ...project,
      updatedAt: new Date().toISOString(),
      levels: project.levels.map((level) => level.id === id ? {
        ...level,
        sourceRegion: resizeRegion(level.sourceRegion, amount),
      } : level),
    } : project);
  }

  function toggleOutdoorArea(id: string, included: boolean) {
    setRegions((current) => current.map((region) => {
      if (region.id !== id) return region;
      const next = { ...region, hasOutdoorArea: included };
      return included && !region.hasOutdoorArea ? resizeRegion(next, 0.035) : next;
    }));
    setDocument((project) => project ? {
      ...project,
      updatedAt: new Date().toISOString(),
      levels: project.levels.map((level) => level.id === id ? {
        ...level,
        sourceRegion: { ...level.sourceRegion, hasOutdoorArea: included },
      } : level),
    } : project);
  }

  async function shareProject() {
    if (!document) return;
    setProjectMessage("Creating share link…");
    try {
      const response = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(document),
      });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        setProjectMessage(data.error ?? "Failed to create share link.");
        return;
      }
      await navigator.clipboard.writeText(data.url).catch(() => undefined);
      setProjectMessage(`Share link copied: ${data.url}`);
    } catch {
      setProjectMessage("Share link unavailable. Export the project file to share manually.");
    }
  }

  function rememberFurnitureLayout() {
    setFurnitureHistory((current) => [...current.slice(-24), furnishings]);
  }

  function beginFurnitureMove() {
    rememberFurnitureLayout();
  }

  function undoFurnitureEdit() {
    const previous = furnitureHistory.at(-1);
    if (!previous) return;
    setFurnishings(previous);
    setFurnitureHistory((current) => current.slice(0, -1));
    setSelectedFurnishingId((current) => current && previous.some((placement) => placement.id === current) ? current : null);
    setProjectMessage("Last furniture change undone.");
  }

  function addFurnishing(item: FurnitureCatalogItem) {
    const level = previewLevels.find((candidate) => candidate.id === activeLevel) ?? previewLevels[0];
    if (!level) return;
    const sameLevelCount = furnishings.filter((placement) => placement.levelId === level.id).length;
    const stagger = Math.min(1.2, sameLevelCount * 0.28);
    const placement: FurniturePlacement = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `furniture-${crypto.randomUUID()}`
        : `furniture-${Date.now()}`,
      catalogId: item.id,
      levelId: level.id,
      x: level.slab.x + stagger,
      z: level.slab.z + stagger * 0.45,
      rotation: 0,
    };
    const position = findNearestValidFurniturePosition(
      item,
      level,
      placement.rotation,
      placement,
      gridSnapEnabled ? 0.1 : 0,
    );
    if (!position) {
      setProjectMessage(`${item.name} does not fit in an open area on ${level.name}.`);
      return;
    }
    placement.x = position.x;
    placement.z = position.z;
    rememberFurnitureLayout();
    setFurnishings((current) => [...current, placement]);
    setSelectedFurnishingId(placement.id);
    setViewMode("furnish");
    setExploded(false);
    setMobilePanel("canvas");
    setProjectMessage(`${item.name} added at true size on ${level.name}.`);
  }

  function selectFurnishing(id: string | null) {
    setSelectedFurnishingId(id);
    if (!id) return;
    const placement = furnishings.find((candidate) => candidate.id === id);
    if (placement) setActiveLevel(placement.levelId);
  }

  function moveFurnishing(id: string, x: number, z: number) {
    const placement = furnishings.find((candidate) => candidate.id === id);
    const item = placement ? furnitureCatalogItem(placement.catalogId) : undefined;
    const level = placement ? previewLevels.find((candidate) => candidate.id === placement.levelId) : undefined;
    if (!placement || !item || !level) return;
    const result = resolveFurnitureMove(
      item,
      level,
      placement.rotation,
      placement,
      { x, z },
      gridSnapEnabled ? 0.1 : 0,
    );
    setFurnishings((current) => current.map((candidate) => (
      candidate.id === id ? { ...candidate, ...result.position } : candidate
    )));
    if (result.blockedByWall) setProjectMessage("Placement stopped at the wall.");
  }

  function nudgeFurnishing(id: string, deltaX: number, deltaZ: number) {
    const placement = furnishings.find((candidate) => candidate.id === id);
    if (!placement) return;
    rememberFurnitureLayout();
    moveFurnishing(id, placement.x + deltaX, placement.z + deltaZ);
  }

  function rotateFurnishing(id: string, direction: -1 | 1) {
    const snap = Math.PI / 12;
    const placement = furnishings.find((candidate) => candidate.id === id);
    const item = placement ? furnitureCatalogItem(placement.catalogId) : undefined;
    const level = placement ? previewLevels.find((candidate) => candidate.id === placement.levelId) : undefined;
    if (!placement || !item || !level) return;
    const rotation = placement.rotation + snap * direction;
    const position = validFurniturePosition(
      item,
      level,
      rotation,
      placement,
      gridSnapEnabled ? 0.1 : 0,
    );
    if (!position) {
      setProjectMessage("There is not enough clearance to rotate here.");
      return;
    }
    rememberFurnitureLayout();
    setFurnishings((current) => current.map((candidate) => (
      candidate.id === id ? { ...candidate, ...position, rotation } : candidate
    )));
  }

  function removeFurnishing(id: string) {
    rememberFurnitureLayout();
    setFurnishings((current) => current.filter((placement) => placement.id !== id));
    setSelectedFurnishingId((current) => current === id ? null : current);
    setProjectMessage("Furniture removed from the room.");
  }

  if (stage === "analyzing") return <AnalysisScreen step={analysisStep} />;

  if (stage === "workspace") {
    return (
      <Workspace
        activeLevel={activeLevel}
        addOpening={addOpening}
        alignStairs={alignStairs}
        analysisSize={analysisSize}
        canUndoFurniture={furnitureHistory.length > 0}
        confirmLevel={confirmLevel}
        document={document}
        exploded={exploded}
        furnishings={furnishings}
        focusedLevel={focusedLevel}
        gridSnapEnabled={gridSnapEnabled}
        imageUrl={imageUrl}
        measureScale={measureScale}
        mobilePanel={mobilePanel}
        moveLevel={moveLevel}
        moveFurnishing={moveFurnishing}
        nudgeFurnishing={nudgeFurnishing}
        onBeginMoveFurnishing={beginFurnitureMove}
        previewLevels={previewLevels}
        shareProject={shareProject}
        projectMessage={projectMessage}
        regions={regions}
        renameLevel={renameLevel}
        removeFurnishing={removeFurnishing}
        resizeLevelBoundary={resizeLevelBoundary}
        rotateFurnishing={rotateFurnishing}
        reverseLevelOrder={reverseLevelOrder}
        removeSelectedWall={removeSelectedWall}
        selectedLevel={selectedLevel}
        selectedRegion={selectedRegion}
        selectedFurnishingId={selectedFurnishingId}
        selectedWallId={selectedWallId}
        structures={structures}
        setActiveLevel={setActiveLevel}
        setExploded={setExploded}
        setFocusedLevel={setFocusedLevel}
        setGridSnapEnabled={setGridSnapEnabled}
        setMobilePanel={setMobilePanel}
        setSelectedWallId={setSelectedWallId}
        setSelectedFurnishingId={selectFurnishing}
        setStage={setStage}
        setViewMode={setViewMode}
        setWallCutaway={setWallCutaway}
        toggleLevel={toggleLevel}
        toggleOutdoorArea={toggleOutdoorArea}
        undoEdit={undoEdit}
        undoFurnitureEdit={undoFurnitureEdit}
        viewMode={viewMode}
        visibleLevels={visibleLevels}
        wallCutaway={wallCutaway}
        addFurnishing={addFurnishing}
      />
    );
  }

  return (
    <main className="welcome-shell">
      <header className="marketing-header">
        <Brand />
        <div className="header-actions">
          <span className="prototype-pill"><span /> Early build</span>
          <button className="icon-button mobile-only" aria-label="Open menu"><Menu size={20} /></button>
        </div>
      </header>

      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow"><Sparkles size={14} /> Structure before decoration</p>
          <h1>Your home,<br /><em>rebuilt in space.</em></h1>
          <p className="hero-lede">
            Turn an ordinary floorplan into a precise, multi-level digital twin you can inspect from every angle.
          </p>

          <div className="upload-panel">
            <input ref={projectInputRef} type="file" accept="application/json,.json" onChange={importProject} className="visually-hidden" />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={chooseFile}
              className="visually-hidden"
            />
            {!file ? (
              <button className="drop-zone" onClick={() => fileInputRef.current?.click()}>
                <span className="upload-icon"><ImageUp size={24} /></span>
                <span className="drop-copy">
                  <strong>Upload your floorplan</strong>
                  <small>JPG, PNG or WebP · up to 20 MB</small>
                </span>
                <span className="browse-label">Choose file</span>
              </button>
            ) : (
              <div className="file-ready">
                <span className="file-type">{file.name.split(".").pop()?.toUpperCase().slice(0, 4) || "FILE"}</span>
                <span className="file-copy"><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} MB · Ready to inspect</small></span>
                <button className="icon-button" onClick={() => { setFile(null); setImageUrl(null); }} aria-label="Remove file"><X size={18} /></button>
              </div>
            )}

            <button className="primary-action" disabled={!file} onClick={() => analyze(false)}>
              Find floors <ArrowRight size={18} />
            </button>
            <button className="sample-action" onClick={() => analyze(true)}>
              Explore the sample residence
            </button>
            <button className="sample-action import-project-action" onClick={() => projectInputRef.current?.click()}>
              <Upload size={13} /> Import a V2 project
            </button>
            {lastProject && (
              <button className="resume-project-action" onClick={() => openProject(lastProject)}>
                <span><strong>Continue {lastProject.name}</strong><small>Saved {new Date(lastProject.updatedAt).toLocaleString()}</small></span>
                <ArrowRight size={16} />
              </button>
            )}
            {projectMessage && <p className="project-message">{projectMessage}</p>}
            <p className="privacy-note"><ShieldCheck size={13} /> Analysis and project storage stay on this device.</p>
          </div>
        </div>

        <div className="hero-visual" aria-label="Two-level floorplan becoming a 3D building">
          <div className="visual-caption visual-caption-top"><ScanLine size={15} /><span>2 plans found</span></div>
          <div className="paper-plan paper-plan-back"><PlanLines variant="upper" /></div>
          <div className="paper-plan paper-plan-front"><PlanLines variant="ground" /></div>
          <div className="height-guide"><span>5.25 m</span></div>
          <div className="visual-caption visual-caption-bottom"><Box size={15} /><span>Metric structure</span></div>
        </div>
      </section>

      <section className="promise-strip" aria-label="Product capabilities">
        <PromiseCard icon={<Layers3 size={19} />} title="Multi-level" copy="Separate, align and stack every floor." />
        <PromiseCard icon={<Ruler size={19} />} title="Real dimensions" copy="Recover scale or calibrate one known length." />
        <PromiseCard icon={<Smartphone size={19} />} title="Made for mobile" copy="Review your model from wherever you are." />
      </section>
    </main>
  );
}

function Workspace({
  addFurnishing,
  activeLevel,
  addOpening,
  alignStairs,
  analysisSize,
  canUndoFurniture,
  confirmLevel,
  document,
  exploded,
  furnishings,
  focusedLevel,
  gridSnapEnabled,
  imageUrl,
  measureScale,
  mobilePanel,
  moveFurnishing,
  moveLevel,
  nudgeFurnishing,
  onBeginMoveFurnishing,
  previewLevels,
  projectMessage,
  regions,
  renameLevel,
  removeFurnishing,
  resizeLevelBoundary,
  reverseLevelOrder,
  rotateFurnishing,
  removeSelectedWall,
  selectedLevel,
  selectedRegion,
  selectedFurnishingId,
  selectedWallId,
  shareProject,
  structures,
  setActiveLevel,
  setExploded,
  setFocusedLevel,
  setGridSnapEnabled,
  setMobilePanel,
  setSelectedWallId,
  setSelectedFurnishingId,
  setStage,
  setViewMode,
  setWallCutaway,
  toggleLevel,
  toggleOutdoorArea,
  undoEdit,
  undoFurnitureEdit,
  viewMode,
  visibleLevels,
  wallCutaway,
}: {
  addFurnishing: (item: FurnitureCatalogItem) => void;
  activeLevel: string;
  addOpening: (kind: "door" | "window") => void;
  alignStairs: () => void;
  analysisSize: AnalysisSize | null;
  canUndoFurniture: boolean;
  confirmLevel: () => void;
  document: FloorplanDocumentV2 | null;
  exploded: boolean;
  furnishings: FurniturePlacement[];
  focusedLevel: string | null;
  gridSnapEnabled: boolean;
  imageUrl: string | null;
  measureScale: () => void;
  mobilePanel: "levels" | "canvas" | "details";
  moveFurnishing: (id: string, x: number, z: number) => void;
  moveLevel: (id: string, offset: -1 | 1) => void;
  nudgeFurnishing: (id: string, deltaX: number, deltaZ: number) => void;
  onBeginMoveFurnishing: () => void;
  previewLevels: Level[];
  projectMessage: string | null;
  regions: SourceRegion[];
  renameLevel: (id: string, name: string) => void;
  removeFurnishing: (id: string) => void;
  resizeLevelBoundary: (id: string, amount: number) => void;
  reverseLevelOrder: () => void;
  rotateFurnishing: (id: string, direction: -1 | 1) => void;
  removeSelectedWall: () => void;
  selectedLevel: Level;
  selectedRegion: SourceRegion;
  selectedFurnishingId: string | null;
  selectedWallId: string | null;
  shareProject: () => void;
  structures: StructureMap;
  setActiveLevel: (id: string) => void;
  setExploded: (value: boolean) => void;
  setFocusedLevel: (id: string | null) => void;
  setGridSnapEnabled: (enabled: boolean) => void;
  setMobilePanel: (panel: "levels" | "canvas" | "details") => void;
  setSelectedWallId: (id: string | null) => void;
  setSelectedFurnishingId: (id: string | null) => void;
  setStage: (stage: AppStage) => void;
  setViewMode: (mode: ViewMode) => void;
  setWallCutaway: (cutaway: number) => void;
  toggleLevel: (id: string) => void;
  toggleOutdoorArea: (id: string, included: boolean) => void;
  undoEdit: () => void;
  undoFurnitureEdit: () => void;
  viewMode: ViewMode;
  visibleLevels: Set<string>;
  wallCutaway: number;
}) {
  const selectedWall = structures[activeLevel]?.walls.find((wall) => wall.id === selectedWallId) ?? null;
  const levelIssues = document?.issues.filter((issue) => !issue.levelId || issue.levelId === activeLevel) ?? [];
  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <button className="back-button" onClick={() => setStage("welcome")} aria-label="Back to upload"><ChevronLeft size={20} /></button>
        <Brand compact />
        <div className="project-name"><span>V2 project</span><strong>{document?.name ?? "Sample residence"}</strong></div>
        <div className="workspace-status"><span className="saved-dot" />Saved on this device</div>
        {document && <button className="header-tool" onClick={() => downloadProject(document)}><Download size={16} /><span>Export</span></button>}
        {document && <button className="header-tool" onClick={shareProject}><Share2 size={16} /><span>Share</span></button>}
        {document?.edits.length ? <button className="icon-button" onClick={undoEdit} aria-label="Undo last structural edit"><Undo2 size={18} /></button> : null}
        <button className="icon-button" aria-label="Project options"><MoreHorizontal size={20} /></button>
      </header>

      <div className="workspace-grid">
        <aside className={`level-rail ${mobilePanel === "levels" ? "mobile-active" : ""}`}>
          <div className="panel-heading">
            <div><span className="panel-kicker">Detected structure</span><h2>{regions.length} {regions.length === 1 ? "level" : "levels"}</h2></div>
            <button className="icon-button small" aria-label="Level help"><CircleHelp size={16} /></button>
          </div>
          <p className="panel-intro">Confirm that the plan regions belong to separate floors.</p>
          <div className="level-list">
            {regions.map((region, index) => {
              const level = previewLevels[index] ?? sampleLevels[1];
              const selected = activeLevel === region.id;
              const visible = visibleLevels.has(region.id);
              return (
                <div
                  key={region.id}
                  className={`level-card ${selected ? "selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveLevel(region.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setActiveLevel(region.id);
                  }}
                >
                  <span className="level-thumb"><PlanLines variant={index === 0 ? "ground" : "upper"} /></span>
                  <span className="level-card-copy">
                    <small>{index === 0 ? "BASE LEVEL" : `LEVEL ${index + 1}`}</small>
                    <strong>{region.name}</strong>
                    <em>{level.area.toFixed(1)} m² · {Math.round(region.confidence * 100)}% match{region.hasOutdoorArea ? " · outdoor" : ""}</em>
                  </span>
                  <span className="level-card-actions">
                    <button
                      disabled={index === 0}
                      aria-label={`Move ${region.name} down in the building`}
                      onClick={(event) => { event.stopPropagation(); moveLevel(region.id, -1); }}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      disabled={index === regions.length - 1}
                      aria-label={`Move ${region.name} up in the building`}
                      onClick={(event) => { event.stopPropagation(); moveLevel(region.id, 1); }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      className="visibility-toggle"
                      aria-label={`${visible ? "Hide" : "Show"} ${region.name}`}
                      onClick={(event) => { event.stopPropagation(); toggleLevel(region.id); }}
                    >
                      {visible ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
          {regions.length > 1 && (
            <button className="secondary-button" onClick={reverseLevelOrder}><ArrowUpDown size={16} /> Reverse floor order</button>
          )}
          <button className="secondary-button"><ScanLine size={16} /> Split or add a level</button>
          <div className="rail-tip"><Sparkles size={15} /><span>We use whitespace, labels and disconnected structure to propose separate floors.</span></div>
        </aside>

        <section className={`canvas-panel ${mobilePanel === "canvas" ? "mobile-active" : ""}`}>
          <div className="canvas-toolbar">
            <div className="view-switch" role="group" aria-label="View mode">
              <button className={viewMode === "review" ? "active" : ""} onClick={() => setViewMode("review")}><ScanLine size={16} /> Plan review</button>
              <button className={viewMode === "twin" ? "active" : ""} onClick={() => setViewMode("twin")}><Box size={16} /> 3D twin</button>
              <button className={viewMode === "furnish" ? "active" : ""} onClick={() => { setViewMode("furnish"); setExploded(false); }}><Sofa size={16} /> Furnish</button>
            </div>
            <div className="canvas-actions">
              {viewMode === "twin" && <button className={`toolbar-button ${exploded ? "active" : ""}`} onClick={() => setExploded(!exploded)}><Move3D size={16} /> Explode</button>}
              <button className="toolbar-button desktop-only"><Maximize2 size={16} /> Fit</button>
            </div>
          </div>

          <div className="canvas-stage">
            {viewMode === "review" ? (
              <PlanReview
                imageUrl={imageUrl}
                regions={regions}
                structures={structures}
                analysisSize={analysisSize}
                activeLevel={activeLevel}
                focusedLevel={focusedLevel}
                selectedWallId={selectedWallId}
                setActiveLevel={setActiveLevel}
                setFocusedLevel={setFocusedLevel}
                setSelectedWallId={setSelectedWallId}
              />
            ) : (
              <ViewerBoundary>
                <Suspense fallback={<div className="viewer-loading"><Box size={22} /><span>Building the 3D twin…</span></div>}>
                  <TwinViewer
                    decorating={viewMode === "furnish"}
                    exploded={exploded}
                    furnishings={furnishings}
                    gridSnapEnabled={gridSnapEnabled}
                    levels={previewLevels}
                    onBeginMoveFurnishing={onBeginMoveFurnishing}
                    onMoveFurnishing={moveFurnishing}
                    onSelectFurnishing={setSelectedFurnishingId}
                    selectedFurnishingId={selectedFurnishingId}
                    visibleLevels={visibleLevels}
                    wallCutaway={wallCutaway}
                  />
                </Suspense>
              </ViewerBoundary>
            )}
            {/* Floor visibility lives beside the model on mobile, where the level
                rail is a separate tab and toggling there hides the result. */}
            {viewMode !== "review" && regions.length > 1 && (
              <div className="floor-visibility mobile-only" role="group" aria-label="Floor visibility">
                {regions.map((region, index) => (
                  <button
                    key={region.id}
                    className={visibleLevels.has(region.id) ? "on" : ""}
                    aria-pressed={visibleLevels.has(region.id)}
                    onClick={() => toggleLevel(region.id)}
                  >
                    {visibleLevels.has(region.id) ? <Eye size={13} /> : <EyeOff size={13} />}
                    <span>{index === 0 ? "BASE" : `${index}F`}</span>
                  </button>
                ))}
              </div>
            )}
            {viewMode !== "review" && (
              <label className="wall-opacity-control">
                <span><SlidersHorizontal size={14} /> Wall cutaway</span>
                <input
                  type="range"
                  min="0.15"
                  max="1"
                  step="0.05"
                  value={wallCutaway}
                  onChange={(event) => setWallCutaway(Number(event.target.value))}
                />
                <output>{Math.round(wallCutaway * 100)}%</output>
              </label>
            )}
            {viewMode === "furnish" && (
              <div className="canvas-placement-bar" aria-label="Furniture placement controls">
                <label className="grid-snap-toggle">
                  <input
                    type="checkbox"
                    checked={gridSnapEnabled}
                    onChange={(event) => setGridSnapEnabled(event.target.checked)}
                  />
                  <Grid3X3 size={14} /> Grid 10 cm
                </label>
                <button onClick={undoFurnitureEdit} disabled={!canUndoFurniture}><Undo2 size={14} /> Undo</button>
                {selectedFurnishingId && (
                  <>
                    <button onClick={() => setSelectedFurnishingId(null)}><ChevronLeft size={14} /> Back</button>
                    <button onClick={() => rotateFurnishing(selectedFurnishingId, 1)}><RotateCw size={14} /> Rotate</button>
                    <button className="danger" onClick={() => removeFurnishing(selectedFurnishingId)}><Trash2 size={14} /> Delete</button>
                  </>
                )}
              </div>
            )}
            <div className="canvas-hint">
              {viewMode === "review"
                ? <><ScanLine size={14} /> Tap a region to review that level</>
                : viewMode === "furnish"
                  ? <><Sofa size={14} /> Select furniture in the room or catalogue</>
                  : <><Move3D size={14} /> Drag to orbit · Pinch to zoom</>}
            </div>
          </div>
        </section>

        <aside className={`detail-panel ${mobilePanel === "details" ? "mobile-active" : ""}`}>
          {viewMode === "furnish" ? (
            <FurniturePanel
              activeLevel={selectedLevel}
              addFurnishing={addFurnishing}
              canUndoFurniture={canUndoFurniture}
              furnishings={furnishings}
              gridSnapEnabled={gridSnapEnabled}
              nudgeFurnishing={nudgeFurnishing}
              projectMessage={projectMessage}
              removeFurnishing={removeFurnishing}
              rotateFurnishing={rotateFurnishing}
              selectedFurnishingId={selectedFurnishingId}
              setGridSnapEnabled={setGridSnapEnabled}
              setSelectedFurnishingId={setSelectedFurnishingId}
              undoFurnitureEdit={undoFurnitureEdit}
            />
          ) : <>
          <div className="panel-heading details-heading">
            <div><span className="panel-kicker">Review status</span><h2>{selectedLevel.name}</h2></div>
            <span className="match-badge"><Check size={13} /> {Math.round((selectedLevel.detectionConfidence ?? selectedRegion.confidence) * 100)}%</span>
          </div>

          <div className="progress-row"><span><i className="complete" /><i className="complete" /><i className="complete" /><i /></span><em>3 of 4 checks</em></div>

          {projectMessage && <div className="project-message workspace-message">{projectMessage}</div>}

          {document && (
            <div className="detail-section v2-runtime-card">
              <span className="detail-label">V2 reconstruction</span>
              <strong>Editable hybrid structure</strong>
              <p>{document.model.runtime === "geometry-fallback" ? "Geometry and topology fallback active. Semantic model output will use this same review document." : `${document.model.runtime.toUpperCase()} semantic model active.`}</p>
              <button className="inline-action" onClick={alignStairs}><ArrowUpDown size={14} /> Align shared stair shaft</button>
            </div>
          )}

          {document && !selectedWall && (
            <div className="detail-section wall-review-list">
              <span className="detail-label">Wall review</span>
              <p>Select any detected boundary to inspect or mark it as open space.</p>
              <div>
                {(structures[activeLevel]?.walls ?? []).map((wall, index) => (
                  <button key={wall.id} onClick={() => setSelectedWallId(wall.id)}>
                    <span>{index + 1}</span>
                    <strong>Detected wall</strong>
                    <em>{Math.round(wall.confidence * 100)}%</em>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedWall && (
            <div className="detail-section selected-wall-card">
              <span className="detail-label">Selected boundary</span>
              <strong>Detected wall · {Math.round(selectedWall.confidence * 100)}% evidence</strong>
              <p>If this line is furniture, a dimension, or an open boundary, mark it as open. The original proposal remains in edit history.</p>
              <div className="opening-actions">
                <button onClick={() => addOpening("door")}>Add door</button>
                <button onClick={() => addOpening("window")}>Add window</button>
              </div>
              <button className="danger-action" onClick={removeSelectedWall}><Trash2 size={14} /> Mark as open space</button>
            </div>
          )}

          {levelIssues.length > 0 && (
            <div className="detail-section issue-list">
              <span className="detail-label">Review queue</span>
              {levelIssues.slice(0, 4).map((issue) => <p key={issue.id}>{issue.message}</p>)}
            </div>
          )}

          <div className="detail-section correction-section">
            <span className="detail-label">Level identity</span>
            <label className="level-name-field">
              <span>Which floor is this?</span>
              <select value={selectedRegion.name} onChange={(event) => renameLevel(selectedRegion.id, event.target.value)}>
                {LEVEL_NAME_OPTIONS.map((name) => <option key={name} value={name}>{name}</option>)}
                {!LEVEL_NAME_OPTIONS.includes(selectedRegion.name) && <option value={selectedRegion.name}>{selectedRegion.name}</option>}
              </select>
            </label>
            <label className="outdoor-area-toggle">
              <input
                type="checkbox"
                aria-label="Balcony or terrace belongs to this level"
                checked={Boolean(selectedRegion.hasOutdoorArea)}
                onChange={(event) => toggleOutdoorArea(selectedRegion.id, event.target.checked)}
              />
              <span><strong>Balcony or terrace belongs to this level</strong><small>Includes nearby exterior lines in the plan boundary.</small></span>
            </label>
            <div className="boundary-controls">
              <button onClick={() => resizeLevelBoundary(selectedRegion.id, 0.025)}><Maximize2 size={14} /> Include more</button>
              <button onClick={() => resizeLevelBoundary(selectedRegion.id, -0.025)}><ScanLine size={14} /> Tighten outline</button>
            </div>
          </div>

          <div className="detail-section">
            <span className="detail-label">Structure</span>
            <div className="stat-grid">
              <div><strong>{selectedLevel.roomCount}</strong><span>rooms</span></div>
              <div><strong>{selectedLevel.wallCount}</strong><span>walls</span></div>
              <div><strong>{selectedLevel.openingCount}</strong><span>openings</span></div>
              <div><strong>{selectedLevel.stairs?.length ?? 0}</strong><span>stairs</span></div>
            </div>
          </div>

          <div className="detail-section">
            <span className="detail-label">Dimensions</span>
            <DetailRow label="Floor area" value={`${selectedLevel.area.toFixed(1)} m²`} />
            <DetailRow label="Ceiling" value={`${selectedLevel.ceilingHeight.toFixed(2)} m`} />
            <DetailRow label="Scale" value={scaleLabel(document?.scale)} warning={(document?.scale.source ?? "provisional") !== "user"} />
          </div>

          <div className="attention-card">
            <span className="attention-icon"><Ruler size={18} /></span>
            <div><strong>{scaleHeadline(document?.scale)}</strong><p>{scaleCopy(document?.scale, Boolean(selectedWall))}</p></div>
            <button onClick={measureScale}>{document?.scale.source === "user" ? "Remeasure" : "Measure"}</button>
          </div>

          <div className="detail-footer">
            <button className="primary-action" onClick={confirmLevel}>Confirm this level <ArrowRight size={17} /></button>
            <p>{selectedLevel.source === "detected" ? "Blue = walls · amber = openings · purple = stairs · green = balcony or terrace. Source-plan details remain visible on the 3D floor." : "The sample demonstrates the review flow with prepared geometry."}</p>
          </div>
          </>}
        </aside>
      </div>

      <nav className="mobile-nav" aria-label="Workspace panels">
        <button className={mobilePanel === "levels" ? "active" : ""} onClick={() => setMobilePanel("levels")}><Layers3 size={19} /><span>Levels</span></button>
        <button className={mobilePanel === "canvas" ? "active" : ""} onClick={() => setMobilePanel("canvas")}><Box size={19} /><span>Model</span></button>
        <button className={mobilePanel === "details" ? "active" : ""} onClick={() => setMobilePanel("details")}>
          {viewMode === "furnish" ? <Sofa size={19} /> : <Ruler size={19} />}
          <span>{viewMode === "furnish" ? "Furniture" : "Review"}</span>
        </button>
      </nav>
    </main>
  );
}

function FurniturePanel({
  activeLevel,
  addFurnishing,
  canUndoFurniture,
  furnishings,
  gridSnapEnabled,
  nudgeFurnishing,
  projectMessage,
  removeFurnishing,
  rotateFurnishing,
  selectedFurnishingId,
  setGridSnapEnabled,
  setSelectedFurnishingId,
  undoFurnitureEdit,
}: {
  activeLevel: Level;
  addFurnishing: (item: FurnitureCatalogItem) => void;
  canUndoFurniture: boolean;
  furnishings: FurniturePlacement[];
  gridSnapEnabled: boolean;
  nudgeFurnishing: (id: string, deltaX: number, deltaZ: number) => void;
  projectMessage: string | null;
  removeFurnishing: (id: string) => void;
  rotateFurnishing: (id: string, direction: -1 | 1) => void;
  selectedFurnishingId: string | null;
  setGridSnapEnabled: (enabled: boolean) => void;
  setSelectedFurnishingId: (id: string | null) => void;
  undoFurnitureEdit: () => void;
}) {
  const levelFurniture = furnishings.filter((placement) => placement.levelId === activeLevel.id);
  const selectedPlacement = furnishings.find((placement) => placement.id === selectedFurnishingId);
  const selectedItem = selectedPlacement ? furnitureCatalogItem(selectedPlacement.catalogId) : undefined;
  return (
    <div className="furniture-panel">
      <div className="panel-heading furniture-heading">
        <div><span className="panel-kicker">Furniture library</span><h2>Place to scale</h2></div>
        <span className="furniture-count">{levelFurniture.length} placed</span>
      </div>
      <p className="panel-intro">Starter sofas use exact metric footprints and lightweight procedural models. Licensed branded GLBs can replace them later.</p>
      <div className="furniture-edit-toolbar">
        <label className="grid-snap-toggle panel-grid-toggle">
          <input
            type="checkbox"
            checked={gridSnapEnabled}
            onChange={(event) => setGridSnapEnabled(event.target.checked)}
          />
          <Grid3X3 size={14} /> Snap to 10 cm grid
        </label>
        <button onClick={undoFurnitureEdit} disabled={!canUndoFurniture}><Undo2 size={14} /> Undo</button>
      </div>
      {projectMessage && <div className="project-message furniture-message">{projectMessage}</div>}

      {selectedItem && selectedPlacement && (
        <div className="selected-furniture-card">
          <div className="selected-furniture-summary">
            <span><Sofa size={18} /></span>
            <strong>{selectedItem.name}</strong>
            <small>{selectedItem.width.toFixed(2)} × {selectedItem.depth.toFixed(2)} m · selected</small>
            <button onClick={() => setSelectedFurnishingId(null)} aria-label="Clear furniture selection"><X size={13} /></button>
          </div>
          <div className="placement-controls" aria-label={`Position ${selectedItem.name}`}>
            <span className="placement-control-label"><Move size={13} /> Position and rotation</span>
            <output className="placement-metrics">
              X {selectedPlacement.x.toFixed(2)} m · Z {selectedPlacement.z.toFixed(2)} m · {Math.round(selectedPlacement.rotation * 180 / Math.PI)}°
            </output>
            <span className="nudge-pad">
              <button onClick={() => nudgeFurnishing(selectedPlacement.id, 0, -0.1)} aria-label="Move furniture away"><ArrowUp size={14} /></button>
              <button onClick={() => nudgeFurnishing(selectedPlacement.id, -0.1, 0)} aria-label="Move furniture left"><ArrowDown className="turn-left" size={14} /></button>
              <button onClick={() => nudgeFurnishing(selectedPlacement.id, 0, 0.1)} aria-label="Move furniture toward"><ArrowDown size={14} /></button>
              <button onClick={() => nudgeFurnishing(selectedPlacement.id, 0.1, 0)} aria-label="Move furniture right"><ArrowDown className="turn-right" size={14} /></button>
            </span>
            <span className="placement-actions">
              <button onClick={() => rotateFurnishing(selectedPlacement.id, -1)}><RotateCw className="rotate-left" size={13} /> −15°</button>
              <button onClick={() => rotateFurnishing(selectedPlacement.id, 1)}><RotateCw size={13} /> +15°</button>
              <button className="back-to-catalogue" onClick={() => setSelectedFurnishingId(null)}><ChevronLeft size={13} /> Back to catalogue</button>
              <button className="remove-furniture" onClick={() => removeFurnishing(selectedPlacement.id)}><Trash2 size={13} /> Delete furniture</button>
            </span>
          </div>
        </div>
      )}

      <div className="catalogue-list">
        {FURNITURE_CATALOG.map((item) => (
          <article className="catalogue-card" key={item.id}>
            <span className="catalogue-icon" style={{ background: item.color }}><Sofa size={22} /></span>
            <span className="catalogue-copy">
              <small>{item.collection}</small>
              <strong>{item.name}</strong>
              <em>W {item.width.toFixed(2)} · D {item.depth.toFixed(2)} · H {item.height.toFixed(2)} m</em>
              <span>{item.upholstery}</span>
            </span>
            <button onClick={() => addFurnishing(item)} aria-label={`Add ${item.name} to ${activeLevel.name}`}><Plus size={12} /> Add</button>
          </article>
        ))}
      </div>

      <div className="catalogue-note"><ShieldCheck size={15} /><span>Furniture stops at structural walls. Drag it on the floor or use the 10 cm controls. Keyboard: arrows move, Q/E rotate, Delete removes.</span></div>
    </div>
  );
}

const clampNumber = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

/** Counts of everything the detector claims for one region, for the focus legend. */
function levelFindings(structure: DetectedStructure | undefined) {
  if (!structure) return null;
  const openings = structure.walls.flatMap((wall) => wall.openings);
  return {
    heavyWalls: structure.walls.filter((wall) => wall.weight === "heavy").length,
    lightWalls: structure.walls.filter((wall) => wall.weight === "light").length,
    doors: openings.filter((opening) => opening.kind === "door").length,
    windows: openings.filter((opening) => opening.kind === "window").length,
    stairs: structure.stairs.length,
    steps: structure.stairs.reduce((sum, stair) => sum + stair.stepCount, 0),
    rails: structure.walls.reduce((sum, wall) => sum + (wall.railSpans?.length ?? 0), 0),
    outdoor: structure.outdoorAreas.length,
    rooms: structure.rooms.length,
    fixtures: structure.fixtures?.length ?? 0,
  };
}

function PlanReview({
  imageUrl,
  regions,
  structures,
  analysisSize,
  activeLevel,
  focusedLevel,
  selectedWallId,
  setActiveLevel,
  setFocusedLevel,
  setSelectedWallId,
}: {
  imageUrl: string | null;
  regions: SourceRegion[];
  structures: StructureMap;
  analysisSize: AnalysisSize | null;
  activeLevel: string;
  focusedLevel: string | null;
  selectedWallId: string | null;
  setActiveLevel: (id: string) => void;
  setFocusedLevel: (id: string | null) => void;
  setSelectedWallId: (id: string | null) => void;
}) {
  const focusRegion = focusedLevel ? regions.find((region) => region.id === focusedLevel) ?? null : null;
  const findings = focusRegion ? levelFindings(structures[focusRegion.id]) : null;

  // Focus mode is laid out against the measured stage rather than the source
  // sheet: a portrait scan is only a few hundred pixels wide, so scaling inside
  // its own box left the floor tiny. Measuring lets the chosen floor use the
  // whole viewport whatever the sheet's proportions are.
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setViewport({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [focusedLevel]);

  // Entering a floor always starts from a clean, fitted view. Adjusted during
  // render rather than in an effect so the first paint of a newly focused floor
  // is already reset, never briefly showing the previous floor's zoom.
  const [lastFocused, setLastFocused] = useState(focusedLevel);
  if (focusedLevel !== lastFocused) {
    setLastFocused(focusedLevel);
    setZoomLevel(1);
    setPan({ x: 0, y: 0 });
  }

  const layout = useMemo(() => {
    if (!focusRegion || !analysisSize || viewport.width < 20 || viewport.height < 20) return null;
    const regionWidth = Math.max(0.02, focusRegion.width);
    const regionHeight = Math.max(0.02, focusRegion.height);
    const padding = 20;
    const availableWidth = Math.max(60, viewport.width - padding * 2);
    const availableHeight = Math.max(60, viewport.height - padding * 2);
    // Widest sheet whose region still fits both axes of the stage.
    const fittedSheetWidth = Math.min(
      availableWidth / regionWidth,
      (availableHeight * analysisSize.width) / (regionHeight * analysisSize.height),
    );
    const sheetWidth = fittedSheetWidth * zoomLevel;
    const sheetHeight = sheetWidth * (analysisSize.height / analysisSize.width);
    const limitX = sheetWidth / 2;
    const limitY = sheetHeight / 2;
    const panX = clampNumber(pan.x, -limitX, limitX);
    const panY = clampNumber(pan.y, -limitY, limitY);
    const left = (viewport.width - regionWidth * sheetWidth) / 2 - focusRegion.x * sheetWidth + panX;
    const top = (viewport.height - regionHeight * sheetHeight) / 2 - focusRegion.y * sheetHeight + panY;
    return {
      sheet: { width: `${sheetWidth}px`, height: `${sheetHeight}px`, left: `${left}px`, top: `${top}px` },
      // Dims everything outside the chosen floor, so only it reads as in scope.
      mask: {
        left: `${left + focusRegion.x * sheetWidth}px`,
        top: `${top + focusRegion.y * sheetHeight}px`,
        width: `${regionWidth * sheetWidth}px`,
        height: `${regionHeight * sheetHeight}px`,
      },
    };
  }, [focusRegion, analysisSize, viewport, zoomLevel, pan]);

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!focusRegion) return;
    dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPan({ x: drag.panX + (event.clientX - drag.x), y: drag.panY + (event.clientY - drag.y) });
  };
  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const nudgeZoom = (factor: number) => setZoomLevel((current) => clampNumber(current * factor, 1, 8));

  return (
    <div className={`plan-review ${imageUrl ? "has-image" : "sample-review"} ${focusRegion ? "focused" : ""}`}>
      <div
        className="plan-viewport"
        ref={viewportRef}
        onPointerDown={focusRegion ? beginPan : undefined}
        onPointerMove={focusRegion ? movePan : undefined}
        onPointerUp={focusRegion ? endPan : undefined}
        onPointerCancel={focusRegion ? endPan : undefined}
        onWheel={focusRegion ? (event) => nudgeZoom(event.deltaY > 0 ? 0.9 : 1.1) : undefined}
      >
      <div className="plan-zoom" style={layout?.sheet}>
      {imageUrl ? <img src={imageUrl} alt="Uploaded floorplan" /> : <SampleSheet />}
      {analysisSize && (
        <svg
          className="structure-overlay"
          viewBox={`0 0 ${analysisSize.width} ${analysisSize.height}`}
          preserveAspectRatio="none"
          aria-label="Detected walls, openings and exterior areas"
        >
          {regions.flatMap((region) => structures[region.id]?.outdoorAreas.map((area) => (
            <rect
              key={`${region.id}-${area.id}`}
              className={`detected-outdoor ${activeLevel === region.id ? "active" : ""}`}
              x={area.x}
              y={area.y}
              width={area.width}
              height={area.height}
              transform={structures[region.id]?.sourceRotationDegrees && structures[region.id]?.rotationCenter
                ? `rotate(${structures[region.id].sourceRotationDegrees} ${structures[region.id].rotationCenter?.[0]} ${structures[region.id].rotationCenter?.[1]})`
                : undefined}
            />
          )) ?? [])}
          {regions.flatMap((region) => structures[region.id]?.stairs.map((stair) => (
            <g
              key={`${region.id}-${stair.id}`}
              className={`detected-stair ${activeLevel === region.id ? "active" : ""}`}
              transform={structures[region.id]?.sourceRotationDegrees && structures[region.id]?.rotationCenter
                ? `rotate(${structures[region.id].sourceRotationDegrees} ${structures[region.id].rotationCenter?.[0]} ${structures[region.id].rotationCenter?.[1]})`
                : undefined}
            >
              <rect x={stair.x} y={stair.y} width={stair.width} height={stair.height} />
              {Array.from({ length: Math.min(12, stair.stepCount) }, (_, index) => {
                const count = Math.min(12, stair.stepCount);
                const progress = (index + 1) / (count + 1);
                return stair.runAxis === "vertical"
                  ? <line key={index} x1={stair.x} x2={stair.x + stair.width} y1={stair.y + stair.height * progress} y2={stair.y + stair.height * progress} />
                  : <line key={index} y1={stair.y} y2={stair.y + stair.height} x1={stair.x + stair.width * progress} x2={stair.x + stair.width * progress} />;
              })}
            </g>
          )) ?? [])}
          {regions.flatMap((region) => structures[region.id]?.walls.map((wall) => (
            <g
              key={`${region.id}-${wall.id}`}
              className={`${activeLevel === region.id ? "active" : ""} ${activeLevel === region.id && selectedWallId === wall.id ? "selected" : ""}`}
              transform={structures[region.id]?.sourceRotationDegrees && structures[region.id]?.rotationCenter
                ? `rotate(${structures[region.id].sourceRotationDegrees} ${structures[region.id].rotationCenter?.[0]} ${structures[region.id].rotationCenter?.[1]})`
                : undefined}
            >
              <line
                className="detected-wall-hit"
                x1={wall.start[0]}
                y1={wall.start[1]}
                x2={wall.end[0]}
                y2={wall.end[1]}
                strokeWidth={Math.max(14, wall.thickness * 1.8)}
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveLevel(region.id);
                  setSelectedWallId(wall.id);
                }}
              />
              <line
                className="detected-wall-halo"
                x1={wall.start[0]}
                y1={wall.start[1]}
                x2={wall.end[0]}
                y2={wall.end[1]}
                strokeWidth={Math.max(4, wall.thickness * 1.05)}
              />
              <line
                className="detected-wall"
                x1={wall.start[0]}
                y1={wall.start[1]}
                x2={wall.end[0]}
                y2={wall.end[1]}
                strokeWidth={Math.max(2, wall.thickness * 0.72)}
              />
              {wall.openings.map((opening, index) => {
                const dx = wall.end[0] - wall.start[0];
                const dy = wall.end[1] - wall.start[1];
                const length = Math.max(1, Math.hypot(dx, dy));
                const from = opening.offset / length;
                const to = (opening.offset + opening.width) / length;
                return (
                  <line
                    key={`${wall.id}-opening-${index}`}
                    className={`detected-opening ${opening.kind}`}
                    x1={wall.start[0] + dx * from}
                    y1={wall.start[1] + dy * from}
                    x2={wall.start[0] + dx * to}
                    y2={wall.start[1] + dy * to}
                    strokeWidth={Math.max(4, wall.thickness)}
                  />
                );
              })}
            </g>
          )) ?? [])}
        </svg>
      )}
      {!focusRegion && (
      <div className="region-overlay">
        {regions.map((region, index) => (
          <div
            key={region.id}
            className={`region-box ${activeLevel === region.id ? "active" : ""}`}
            style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }}
            role="button"
            tabIndex={0}
            onClick={() => setActiveLevel(region.id)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setActiveLevel(region.id); }}
          >
            <span>{index + 1}</span>
            <strong>{region.name}</strong>
            <em>{Math.round(region.confidence * 100)}%</em>
            <button
              className="region-expand"
              aria-label={`Expand ${region.name} in detail`}
              onClick={(event) => {
                event.stopPropagation();
                setActiveLevel(region.id);
                setFocusedLevel(region.id);
              }}
            >
              <Maximize2 size={13} />
            </button>
          </div>
        ))}
      </div>
      )}
      </div>
      {layout && <div className="focus-mask" style={layout.mask} />}
      </div>

      {focusRegion && findings && (
        <aside className="focus-legend">
          <div className="focus-legend-head">
            <div>
              <small>REVIEWING</small>
              <strong>{focusRegion.name}</strong>
            </div>
            <button onClick={() => setFocusedLevel(null)} aria-label="Show all levels"><Minimize2 size={14} /> Show all</button>
          </div>
          <div className="focus-zoom" role="group" aria-label="Zoom">
            <button onClick={() => nudgeZoom(1 / 1.35)} aria-label="Zoom out" disabled={zoomLevel <= 1.001}>−</button>
            <span>{Math.round(zoomLevel * 100)}%</span>
            <button onClick={() => nudgeZoom(1.35)} aria-label="Zoom in" disabled={zoomLevel >= 7.99}>+</button>
            <button
              className="focus-zoom-reset"
              onClick={() => { setZoomLevel(1); setPan({ x: 0, y: 0 }); }}
              disabled={zoomLevel <= 1.001 && pan.x === 0 && pan.y === 0}
            >
              Reset
            </button>
          </div>
          <ul>
            <li><i className="k-wall" /><span>Structural walls</span><b>{findings.heavyWalls}</b></li>
            <li><i className="k-light" /><span>Thin partitions</span><b>{findings.lightWalls}</b></li>
            <li><i className="k-door" /><span>Doors</span><b>{findings.doors}</b></li>
            <li><i className="k-window" /><span>Windows</span><b>{findings.windows}</b></li>
            <li><i className="k-stair" /><span>Stairs{findings.stairs ? ` · ${findings.steps} steps` : ""}</span><b>{findings.stairs}</b></li>
            <li><i className="k-rail" /><span>Balustrades</span><b>{findings.rails}</b></li>
            <li><i className="k-outdoor" /><span>Balcony / terrace</span><b>{findings.outdoor}</b></li>
            <li><i className="k-room" /><span>Enclosed rooms</span><b>{findings.rooms}</b></li>
            <li><i className="k-fixture" /><span>Fixtures</span><b>{findings.fixtures}</b></li>
          </ul>
          <p>Counts come from accepted pixel evidence. Anything ambiguous is left out rather than guessed. Drag the plan to move it.</p>
        </aside>
      )}
      {analysisSize && !focusRegion && <div className="detection-legend"><span className="wall" />Walls <span className="opening" />Doors/windows <span className="stair" />Stairs <span className="outdoor" />Balcony</div>}
    </div>
  );
}

function AnalysisScreen({ step }: { step: number }) {
  const steps = ["Reading the document", "Separating floor regions", "Tracing walls and openings", "Cross-checking the structure"];
  return (
    <main className="analysis-screen">
      <Brand />
      <div className="analysis-card">
        <div className="scan-illustration"><span className="scan-beam" /><PlanLines variant="ground" /></div>
        <p className="eyebrow"><ScanLine size={14} /> Document intake</p>
        <h1>Finding the plans<br />inside your file.</h1>
        <div className="analysis-steps">
          {steps.map((label, index) => (
            <div key={label} className={index < step ? "done" : index === step ? "current" : ""}>
              <span>{index < step ? <Check size={14} /> : index + 1}</span><strong>{label}</strong>
            </div>
          ))}
        </div>
        <p className="analysis-note">Geometry is accepted only when stroke, topology and opening evidence agree.</p>
      </div>
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "compact" : ""}`}>
      <span className="brand-mark"><i /><i /><i /></span>
      <span className="brand-word">PLANFORM</span>
    </div>
  );
}

function PromiseCard({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return <div className="promise"><span>{icon}</span><div><strong>{title}</strong><p>{copy}</p></div></div>;
}

function DetailRow({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className="detail-row"><span>{label}</span><strong className={warning ? "warning" : ""}>{value}</strong></div>;
}

function PlanLines({ variant }: { variant: "ground" | "upper" }) {
  return (
    <div className={`plan-lines ${variant}`}>
      <i className="line line-a" /><i className="line line-b" /><i className="line line-c" /><i className="line line-d" />
      <i className="line line-e" /><i className="line line-f" /><i className="door-swing" /><i className="room-label label-a">LIVING</i><i className="room-label label-b">ROOM</i>
    </div>
  );
}

function SampleSheet() {
  return (
    <div className="sample-sheet">
      <div className="sheet-title"><strong>SAMPLE RESIDENCE</strong><span>PLAN SET · 1:100</span></div>
      <div className="sheet-plan first"><PlanLines variant="ground" /></div>
      <div className="sheet-plan second"><PlanLines variant="upper" /></div>
      <div className="sheet-label first-label">GROUND FLOOR</div>
      <div className="sheet-label second-label">FIRST FLOOR</div>
    </div>
  );
}
