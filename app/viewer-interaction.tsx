import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import { Plane, Raycaster, Vector2, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { FurniturePlacement } from "./furniture-catalog";
import type { FurnitureMoveResult } from "./furniture-placement";
import { floorWorldY, grabbedPosition, passedDragThreshold, shouldCancelObjectGesture } from "./workspace-state";

export type MovePreview = { id: string; result: FurnitureMoveResult } | null;
type InteractionProps = {
  controls: RefObject<OrbitControlsImpl | null>; enabled: boolean; elevation: number;
  furnishings: FurniturePlacement[]; selectedId: string | null; draft: FurniturePlacement | null;
  onPreview: (id: string, x: number, z: number) => FurnitureMoveResult;
  onMovePreview: (preview: MovePreview) => void; onCommit: (id: string, x: number, z: number) => void;
  onSelect: (id: string | null) => void; onDraftPosition: (x: number, z: number) => void;
};

/** One pointer owner avoids competing orbit and furniture gestures. World-space
 * ray casting accounts for the scene group's vertical offset on *every* floor. */
export function ViewerInteraction(props: InteractionProps) {
  const { gl, camera, scene, invalidate } = useThree();
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; });
  useEffect(() => {
    const canvas = gl.domElement;
    const pointers = new Map<number, PointerEvent>();
    const handoffs = new WeakSet<Event>();
    const raycaster = new Raycaster();
    const plane = new Plane(new Vector3(0, 1, 0));
    let gesture: { pointer: number; start: { x: number; y: number }; item: FurniturePlacement | null; hit: string | null; offset: { x: number; z: number }; moving: boolean; result: FurnitureMoveResult | null; owned: boolean } | null = null;
    function ray(event: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
      plane.constant = -floorWorldY(latest.current.elevation);
      return raycaster.ray.intersectPlane(plane, new Vector3());
    }
    function cameraEnabled(enabled: boolean) { if (latest.current.controls.current) latest.current.controls.current.enabled = enabled; }
    function release(id: number) { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); }
    function cancel() {
      const old = gesture; gesture = null;
      latest.current.onMovePreview(null); cameraEnabled(true);
      if (old?.owned) release(old.pointer);
      invalidate();
    }
    function down(event: PointerEvent) {
      if (handoffs.has(event)) return;
      pointers.set(event.pointerId, event);
      if (pointers.size > 1) {
        // OrbitControls did not see an object-owned first finger. Restart that
        // finger for the camera before it receives this second pointer.
        const first = gesture?.owned ? pointers.get(gesture.pointer) : null;
        cancel();
        if (first) {
          const resumed = new PointerEvent("pointerdown", { bubbles: true, pointerId: first.pointerId, pointerType: first.pointerType, clientX: first.clientX, clientY: first.clientY, button: 0, buttons: 1, isPrimary: true });
          handoffs.add(resumed); canvas.dispatchEvent(resumed);
        }
        return;
      }
      if (!latest.current.enabled || event.button !== 0) return;
      const point = ray(event);
      if (!point) return;
      let hit: string | null = null;
      // Only visible meshes, not grid/line helpers, can select an object.
      for (const intersection of raycaster.intersectObjects(scene.children, true)) {
        if (intersection.object.type !== "Mesh") continue;
        let object = intersection.object;
        while (object.parent && !object.userData.furnitureId) object = object.parent;
        if (object.userData.furnitureId) hit = object.userData.furnitureId;
        break;
      }
      const item = hit === latest.current.draft?.id ? latest.current.draft : latest.current.furnishings.find((candidate) => candidate.id === hit) ?? null;
      const owned = Boolean(item && (item.id === latest.current.selectedId || item.id === latest.current.draft?.id));
      gesture = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, hit, item, offset: item ? { x: point.x - item.x, z: point.z - item.z } : { x: 0, z: 0 }, owned, moving: false, result: null };
      if (owned) { cameraEnabled(false); canvas.setPointerCapture(event.pointerId); event.stopImmediatePropagation(); }
    }
    function move(event: PointerEvent) {
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, event);
      if (!gesture || gesture.pointer !== event.pointerId || pointers.size > 1) return;
      if (gesture.owned && gesture.item && shouldCancelObjectGesture(gesture.item.id, latest.current.selectedId, latest.current.draft?.id ?? null, pointers.size)) { cancel(); return; }
      if (passedDragThreshold(gesture.start, { x: event.clientX, y: event.clientY })) gesture.moving = true;
      if (!gesture.owned || !gesture.item) return;
      event.stopImmediatePropagation();
      if (!gesture.moving) return;
      const point = ray(event);
      if (!point) return;
      const position = grabbedPosition(point, gesture.offset);
      const result = latest.current.onPreview(gesture.item.id, position.x, position.z);
      gesture.result = result;
      latest.current.onMovePreview({ id: gesture.item.id, result }); invalidate();
    }
    function up(event: PointerEvent) {
      pointers.delete(event.pointerId);
      if (!gesture || gesture.pointer !== event.pointerId) return;
      if (gesture.owned && gesture.item && shouldCancelObjectGesture(gesture.item.id, latest.current.selectedId, latest.current.draft?.id ?? null, pointers.size)) { cancel(); return; }
      const finished = gesture; gesture = null;
      if (finished.owned) { event.stopImmediatePropagation(); release(event.pointerId); }
      cameraEnabled(true); latest.current.onMovePreview(null);
      if (finished.moving && finished.owned && finished.item && finished.result) {
        latest.current.onCommit(finished.item.id, finished.result.position.x, finished.result.position.z);
      } else if (!finished.moving) {
        if (latest.current.draft && !finished.hit) { const point = ray(event); if (point) latest.current.onDraftPosition(point.x, point.z); }
        else if (!latest.current.draft) latest.current.onSelect(finished.hit);
      }
      invalidate();
    }
    function interrupted(event: PointerEvent) { pointers.delete(event.pointerId); if (gesture?.pointer === event.pointerId) cancel(); }
    function blur() { pointers.clear(); cancel(); }
    canvas.addEventListener("pointerdown", down, true);
    canvas.addEventListener("pointermove", move, true);
    canvas.addEventListener("pointerup", up, true);
    canvas.addEventListener("pointercancel", interrupted, true);
    canvas.addEventListener("lostpointercapture", interrupted, true);
    window.addEventListener("blur", blur);
    return () => {
      canvas.removeEventListener("pointerdown", down, true); canvas.removeEventListener("pointermove", move, true);
      canvas.removeEventListener("pointerup", up, true); canvas.removeEventListener("pointercancel", interrupted, true);
      canvas.removeEventListener("lostpointercapture", interrupted, true); window.removeEventListener("blur", blur);
      cameraEnabled(true);
    };
  }, [gl, camera, scene, invalidate]);
  return null;
}
