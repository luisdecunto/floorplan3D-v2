/* Three.js cameras are intentionally mutable scene objects, not React state. */
/* eslint-disable react-hooks/immutability */
import { useEffect, useRef, type RefObject } from "react";
import { OrthographicCamera, PerspectiveCamera, OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { OrthographicCamera as Ortho, PerspectiveCamera as Perspective } from "three";
import type { Level } from "./scene-data";
import { SCENE_Y_OFFSET } from "./workspace-state";

export function WorkspaceCamera({ view, level, levels, wholeBuilding, exploded, fitRequest, controls }: {
  view: "perspective" | "top"; level: Level; levels: Level[]; wholeBuilding: boolean; exploded: boolean;
  fitRequest: number; controls: RefObject<OrbitControlsImpl | null>;
}) {
  const { camera, size, invalidate } = useThree();
  const savedFit = useRef("");
  useEffect(() => {
    const key = [camera.uuid, view, level.id, wholeBuilding, exploded, fitRequest].join("/");
    if (savedFit.current === key || !controls.current) return;
    if (view === "top" ? !(camera instanceof Ortho) : !(camera instanceof Perspective)) return;
    savedFit.current = key;
    const targets = wholeBuilding ? levels : [level];
    const left = Math.min(...targets.map((item) => item.slab.x - item.slab.width / 2));
    const right = Math.max(...targets.map((item) => item.slab.x + item.slab.width / 2));
    const back = Math.min(...targets.map((item) => item.slab.z - item.slab.depth / 2));
    const front = Math.max(...targets.map((item) => item.slab.z + item.slab.depth / 2));
    const x = (left + right) / 2, z = (back + front) / 2;
    const baseY = level.elevation + SCENE_Y_OFFSET;
    const y = wholeBuilding ? (targets[0].elevation + targets.at(-1)!.elevation) / 2 + SCENE_Y_OFFSET + 1 : baseY;
    const radius = Math.hypot(right - left, front - back) / 2;
    controls.current.target.set(x, y, z);
    if (camera instanceof Ortho) {
      camera.position.set(x, y + 30, z + 0.001);
      camera.zoom = Math.min(size.width / ((right - left) * 1.22), size.height / ((front - back) * 1.22));
    } else if (camera instanceof Perspective) {
      const halfFov = camera.fov * Math.PI / 360;
      const limitingFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * size.width / size.height));
      const buildingHeight = wholeBuilding ? targets.at(-1)!.elevation + (exploded ? (targets.length - 1) * 2.35 : 0) : 0;
      const distance = (radius + buildingHeight * 0.3) / Math.sin(limitingFov) * 1.03;
      camera.position.set(x + distance * 0.50, y + distance * 0.70, z + distance * 0.51);
    }
    camera.lookAt(x, y, z); camera.updateProjectionMatrix(); controls.current.update(); invalidate();
  }, [camera, size, view, level, levels, wholeBuilding, exploded, fitRequest, controls, invalidate]);
  return <>
    <PerspectiveCamera makeDefault={view === "perspective"} fov={40} near={0.1} far={200} position={[12, 10, 14]} />
    <OrthographicCamera makeDefault={view === "top"} near={0.1} far={200} position={[0, 30, 0]} />
    <OrbitControls ref={controls} makeDefault enableRotate={view === "perspective"} minDistance={2} maxDistance={100} minZoom={5} maxZoom={350} minPolarAngle={0} maxPolarAngle={Math.PI / 2.05} />
  </>;
}
