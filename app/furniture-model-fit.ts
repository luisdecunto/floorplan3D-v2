import { Box3, Vector3 } from "three";

/**
 * Pure helpers for the GLB-vs-procedural furniture pipeline. Kept free of
 * react-three-fiber/drei imports so this logic can be unit tested directly
 * under Node without a renderer.
 */

export type FurnitureBoundingBox = {
  min: [number, number, number];
  max: [number, number, number];
};

export type FurnitureFitTarget = {
  width: number;
  height: number;
  depth: number;
};

export type FurnitureFitTransform = {
  /** Per-axis [x, y, z] scale so the mesh's bounding box matches the target dimensions. */
  scale: [number, number, number];
  /** Group position that centers the mesh on x/z and rests it on the floor (y = 0). */
  offset: [number, number, number];
};

/**
 * Computes the scale/offset that makes an arbitrary GLB's bounding box match
 * a catalogue item's real-world width/height/depth and sit centered on the
 * floor, regardless of how the source mesh was authored (pivot, scale, units).
 * Non-uniform per-axis scale is used deliberately: placement collision and
 * the selection overlay are driven entirely by catalogue dimensions, so the
 * rendered mesh must match those dimensions exactly on every axis, not just
 * proportionally.
 */
export function fitFurnitureModelTransform(bounds: FurnitureBoundingBox, target: FurnitureFitTarget): FurnitureFitTransform {
  const box = new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max));
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const scale: [number, number, number] = [
    size.x > 1e-6 ? target.width / size.x : 1,
    size.y > 1e-6 ? target.height / size.y : 1,
    size.z > 1e-6 ? target.depth / size.z : 1,
  ];
  return {
    scale,
    offset: [-center.x * scale[0], -box.min.y * scale[1], -center.z * scale[2]],
  };
}

/**
 * Resolves a catalogue `glbUrl` to an actual fetchable URL. Relative paths
 * are treated as relative to the app's public root and joined with the
 * runtime base path (import.meta.env.BASE_URL), so the same catalogue entry
 * works under `vinext dev` (base "/") and the GitHub Pages build (base
 * "/<repo>/"). Absolute http(s) URLs pass through unchanged.
 */
export function resolveFurnitureAssetUrl(glbUrl: string, baseUrl = "/") {
  if (/^https?:\/\//i.test(glbUrl)) return glbUrl;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = glbUrl.startsWith("/") ? glbUrl.slice(1) : glbUrl;
  return `${normalizedBase}${normalizedPath}`;
}

/** Whether an item should render from its GLB asset or fall back to the procedural renderer. */
export function furnitureRenderMode(item: { glbUrl?: string }): "glb" | "procedural" {
  return item.glbUrl ? "glb" : "procedural";
}
