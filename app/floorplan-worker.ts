import { detectPlanRegions } from "./plan-regions";
import { detectFloorStructures } from "./structure-detector";

// Same detector and pixel resolution as the checkpoint. Moving the work off the
// UI thread keeps Cancel, progress messages and the mobile browser responsive.
self.onmessage = (event: MessageEvent<{ pixels: Uint8ClampedArray; width: number; height: number }>) => {
  const { pixels, width, height } = event.data;
  try {
    self.postMessage({ phase: "Separating floor regions…" });
    const regions = detectPlanRegions(pixels, width, height);
    self.postMessage({ phase: "Tracing walls, stairs and fixtures…" });
    const structures = detectFloorStructures(pixels, width, height, regions);
    self.postMessage({ regions, structures });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "Detection failed." }); }
};
