/** Build-only SVG snapshots of the SAME procedural React meshes as the viewer.
 * No WebGL contexts, manufacturer images, backend or runtime fetching per card. */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { BoxGeometry, CylinderGeometry, Matrix4, Vector3, Euler, Quaternion, Color } from "three";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = new URL("../public/furniture-previews/", import.meta.url);
const server = await createServer({ root, configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false }, appType: "custom" });
try {
  const { FURNITURE_CATALOG } = await server.ssrLoadModule("/app/furniture-catalog.ts");
  const { ProceduralFurniture } = await server.ssrLoadModule("/app/furniture-model.tsx");
  const eye = new Vector3(5, 4, -6).normalize();
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), eye).normalize();
  const up = new Vector3().crossVectors(eye, right).normalize();
  const light = new Vector3(-3, 8, -5).normalize();
  function facesOf(element, parent = new Matrix4(), faces = []) {
    if (!element || typeof element !== "object") return faces;
    if (Array.isArray(element)) { element.forEach((child) => facesOf(child, parent, faces)); return faces; }
    if (typeof element.type === "function") return facesOf(element.type(element.props), parent, faces);
    const props = element.props ?? {};
    const local = new Matrix4().compose(new Vector3(...(props.position ?? [0, 0, 0])), new Quaternion().setFromEuler(new Euler(...(props.rotation ?? [0, 0, 0]))), new Vector3(...(props.scale ?? [1, 1, 1])));
    const matrix = parent.clone().multiply(local);
    if (element.type !== "mesh") return facesOf(props.children, matrix, faces);
    const children = [props.children].flat(Infinity).filter(Boolean);
    const geometryNode = children.find((child) => /Geometry$/.test(child.type));
    const materialNode = children.find((child) => /Material$/.test(child.type));
    if (!geometryNode) return faces;
    const args = geometryNode.props.args ?? [];
    // Small faces avoid painter-sort artefacts where a mattress crosses a frame.
    const geometry = geometryNode.type === "boxGeometry" ? new BoxGeometry(...args.slice(0, 3), 4, 4, 4) : geometryNode.type === "cylinderGeometry" ? new CylinderGeometry(...args) : null;
    if (!geometry) throw new Error("Unsupported preview geometry: " + geometryNode.type);
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const positions = flat.getAttribute("position");
    const base = new Color(materialNode?.props.color ?? "#aaa999");
    for (let index = 0; index < positions.count; index += 3) {
      const points = [0, 1, 2].map((offset) => new Vector3().fromBufferAttribute(positions, index + offset).applyMatrix4(matrix));
      const normal = new Vector3().crossVectors(points[1].clone().sub(points[0]), points[2].clone().sub(points[0])).normalize();
      if (normal.dot(eye) <= 0) continue;
      const color = base.clone().multiplyScalar(0.68 + 0.42 * Math.max(0, normal.dot(light))).getHexString();
      faces.push({ points: points.map((point) => [point.dot(right), -point.dot(up)]), depth: points.reduce((sum, point) => sum + point.dot(eye), 0) / 3, color });
    }
    flat.dispose(); if (flat !== geometry) geometry.dispose();
    return faces;
  }
  await mkdir(output, { recursive: true });
  for (const item of FURNITURE_CATALOG) {
    const faces = facesOf(ProceduralFurniture({ item })).sort((a, b) => a.depth - b.depth);
    const points = faces.flatMap((face) => face.points);
    const minX = Math.min(...points.map((point) => point[0])), maxX = Math.max(...points.map((point) => point[0]));
    const minY = Math.min(...points.map((point) => point[1])), maxY = Math.max(...points.map((point) => point[1]));
    const scale = Math.min(198 / (maxX - minX), 126 / (maxY - minY));
    const polygons = faces.map((face) => '<polygon points="' + face.points.map(([x, y]) => ((x - (minX + maxX) / 2) * scale + 120).toFixed(2) + ',' + ((y - maxY) * scale + 149).toFixed(2)).join(' ') + '" fill="#' + face.color + '" stroke="#' + face.color + '" stroke-width="0.3"/>').join("");
    await writeFile(new URL(item.id + ".svg", output), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 168"><rect width="240" height="168" fill="#f3f3ec"/><ellipse cx="120" cy="148" rx="77" ry="8" fill="#24352e" opacity=".07"/>' + polygons + '</svg>\n');
  }
  console.log("Generated " + FURNITURE_CATALOG.length + " procedural furniture previews.");
} finally { await server.close(); }
