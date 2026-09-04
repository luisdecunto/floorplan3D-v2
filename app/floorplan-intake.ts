import { type SourceRegion } from "./plan-regions";
import { alignAdjacentStairStructures, type DetectedStructure } from "./structure-detector";
import { suggestBuildingOrder } from "./floorplan-document";
type StructureMap = Record<string, DetectedStructure>;
type AnalysisSize = { width: number; height: number };
async function loadImage(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}
export async function inspectFloorplan(url: string, onPhase: (phase: string) => void = () => {}, signal?: AbortSignal): Promise<{ regions: SourceRegion[]; structures: StructureMap; size: AnalysisSize; previewDataUrl?: string }> {
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
    let { regions, structures } = await detectInWorker(pixels, width, height, onPhase, signal);
    onPhase("Preparing your apartment…");
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
  } catch (error) {
    throw new Error("Could not read this floorplan. Try a clear PNG or JPEG.", { cause: error });
  }
}

function detectInWorker(pixels: Uint8ClampedArray, width: number, height: number, onPhase: (phase: string) => void, signal?: AbortSignal) {
  return new Promise<{ regions: SourceRegion[]; structures: StructureMap }>((resolve, reject) => {
    const worker = new Worker(new URL("./floorplan-worker.ts", import.meta.url), { type: "module" });
    const close = () => { worker.terminate(); signal?.removeEventListener("abort", abort); };
    const abort = () => { close(); reject(new Error("Analysis cancelled.")); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = () => { close(); reject(new Error("Could not start floorplan analysis.")); };
    worker.onmessage = (event) => {
      if (event.data.phase) { onPhase(event.data.phase); return; }
      close();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data);
    };
    worker.postMessage({ pixels, width, height }, [pixels.buffer]);
  });
}
