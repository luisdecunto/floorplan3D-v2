"use client";

/* eslint-disable react/no-unknown-property */

import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useLoader } from "@react-three/fiber";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Plane, SRGBColorSpace, TextureLoader, Vector3 } from "three";
import {
  buildStairConnections,
  sceneFootprint,
  slabPieceTextureUv,
  slabPieces,
  stairwellOpening,
  type SlabPiece,
  type StairConnection,
  type StairwellOpening,
} from "./scene-geometry";
import { type Fixture, type Level, type Opening, type OutdoorArea, type Wall } from "./scene-data";
import { furnitureCatalogItem, type FurnitureCatalogItem, type FurniturePlacement } from "./furniture-catalog";
import type { FurnitureMoveResult, FurniturePosition } from "./furniture-placement";
import {
  activateRailSpans,
  clampWallGapsToRails,
  stairwellRailSegments,
  type RailSegment,
} from "./stairwell-rails";

export default function TwinViewer({
  decorating,
  exploded,
  furnishings,
  gridSnapEnabled,
  levels,
  onCommitMoveFurnishing,
  onPreviewMoveFurnishing,
  onSelectFurnishing,
  selectedFurnishingId,
  visibleLevels,
  wallCutaway,
}: {
  decorating: boolean;
  exploded: boolean;
  furnishings: FurniturePlacement[];
  gridSnapEnabled: boolean;
  levels: Level[];
  onCommitMoveFurnishing: (id: string, x: number, z: number) => void;
  onPreviewMoveFurnishing: (id: string, x: number, z: number) => FurnitureMoveResult;
  onSelectFurnishing: (id: string | null) => void;
  selectedFurnishingId: string | null;
  visibleLevels: Set<string>;
  wallCutaway: number;
}) {
  // Phones have far less GPU headroom than the desktop this was tuned on, and a
  // stalled frame there reads as the viewer simply never appearing. Measured
  // once on mount so it cannot churn renders.
  const [compact] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches
  ));
  const [draggingFurniture, setDraggingFurniture] = useState(false);
  const explodeDistance = exploded ? 2.35 : 0;
  const stairConnections = buildStairConnections(levels, explodeDistance);
  const stairOpenings = new Map(stairConnections.map((connection) => [connection.upperLevelId, connection.opening]));
  const footprint = sceneFootprint(levels);
  // Where the top flight lands on the upper floor: the rail must leave a gap
  // this wide on that edge, otherwise the stairwell is fenced off and the
  // floor is unreachable from the stairs. Only the flight-width span opens;
  // the rest of that edge is still railed.
  const stairAccess = new Map(stairConnections.map((connection) => [
    connection.upperLevelId,
    { point: connection.upperFlight.end, width: connection.width },
  ]));
  return (
    <div className="twin-canvas">
      <Canvas
        shadows={!compact}
        dpr={compact ? [1, 1.5] : [1, 1.75]}
        camera={{ position: [footprint.centerX + 12, 10, footprint.centerZ + 14], fov: 36, near: 0.1, far: 100 }}
        onPointerMissed={() => decorating && onSelectFurnishing(null)}
      >
        <color attach="background" args={["#ebe9e1"]} />
        <ambientLight intensity={1.25} />
        {/* Sky/ground fill replacing drei's <Environment preset>. That helper
            streams an HDR from an external CDN at runtime, so a slow or blocked
            request left the whole canvas suspended with nothing on screen. All
            lighting here is local, so the viewer never waits on the network. */}
        <hemisphereLight args={["#f4f1e8", "#9d978a", 0.85]} />
        <directionalLight position={[-8, 9, -6]} intensity={0.45} />
        <directionalLight position={[7, 12, 6]} intensity={2.1} castShadow={!compact} shadow-mapSize={[1024, 1024]} />
        <group position={[0, -1.25, 0]}>
          {levels.map((level, index) => visibleLevels.has(level.id) && (
            <LevelModel
              key={level.id}
              level={level}
              opening={index > 0 ? stairOpenings.get(level.id) ?? stairwellOpening(level) : null}
              access={index > 0 ? stairAccess.get(level.id) ?? null : null}
              explodeOffset={index * explodeDistance}
              furnishings={furnishings.filter((placement) => placement.levelId === level.id)}
              decorating={decorating}
              gridSnapEnabled={gridSnapEnabled}
              onDragStateChange={setDraggingFurniture}
              onCommitMoveFurnishing={onCommitMoveFurnishing}
              onPreviewMoveFurnishing={onPreviewMoveFurnishing}
              onSelectFurnishing={onSelectFurnishing}
              selectedFurnishingId={selectedFurnishingId}
              wallCutaway={wallCutaway}
            />
          ))}
          {stairConnections.map((connection) => (
            visibleLevels.has(connection.lowerLevelId) && visibleLevels.has(connection.upperLevelId)
              ? <StairConnectionModel key={connection.id} connection={connection} />
              : null
          ))}
          <ContactShadows position={[0, -0.03, 0]} opacity={0.24} scale={24} blur={2.8} far={12} />
        </group>
        <OrbitControls enabled={!draggingFurniture} makeDefault minDistance={7} maxDistance={30} minPolarAngle={0.35} maxPolarAngle={Math.PI / 2.05} target={[footprint.centerX, 2.2, footprint.centerZ]} />
      </Canvas>
      <div className="viewer-legend"><span><i className="legend-wall" /> Structure</span><span><i className="legend-door" /> Doors</span><span><i className="legend-window" /> Windows</span><span><i className="legend-stair" /> Stairs</span><span><i className="legend-outdoor" /> Balcony</span><span><i className="legend-fixture" /> Fixtures</span><span><i className="legend-detail" /> Plan details</span></div>
    </div>
  );
}

function LevelModel({
  decorating,
  level,
  opening,
  access,
  explodeOffset,
  furnishings,
  gridSnapEnabled,
  onDragStateChange,
  onCommitMoveFurnishing,
  onPreviewMoveFurnishing,
  onSelectFurnishing,
  selectedFurnishingId,
  wallCutaway,
}: {
  decorating: boolean;
  level: Level;
  opening: StairwellOpening | null;
  access: { point: [number, number]; width: number } | null;
  explodeOffset: number;
  furnishings: FurniturePlacement[];
  gridSnapEnabled: boolean;
  onDragStateChange: (dragging: boolean) => void;
  onCommitMoveFurnishing: (id: string, x: number, z: number) => void;
  onPreviewMoveFurnishing: (id: string, x: number, z: number) => FurnitureMoveResult;
  onSelectFurnishing: (id: string | null) => void;
  selectedFurnishingId: string | null;
  wallCutaway: number;
}) {
  const y = level.elevation + explodeOffset;
  const pieces = slabPieces(level, opening);
  // Rails are computed once, then the wall gaps are cut to match them, so a
  // wall can never lose geometry that no railing fills.
  const candidates = useMemo(() => activateRailSpans(level.walls, opening), [level.walls, opening]);
  const railSegments = useMemo(
    () => (opening ? stairwellRailSegments(opening, candidates, access) : []),
    [opening, candidates, access],
  );
  const walls = useMemo(() => clampWallGapsToRails(candidates, railSegments), [candidates, railSegments]);
  return (
    <group>
      {pieces.map((piece) => <SlabPieceModel key={piece.id} piece={piece} elevation={y} />)}
      {decorating && gridSnapEnabled && (
        <gridHelper
          args={[
            Math.ceil(Math.max(level.slab.width, level.slab.depth)),
            Math.max(2, Math.ceil(Math.max(level.slab.width, level.slab.depth) / 0.5)),
            "#6680c5",
            "#b7c2dd",
          ]}
          position={[level.slab.x, y + 0.081, level.slab.z]}
        />
      )}
      {level.floorTextureUrl && <PlanFloor level={level} pieces={pieces} elevation={y} />}
      {opening && <StairwellTrim segments={railSegments} elevation={y} />}
      {(level.outdoorAreas ?? []).map((area) => <OutdoorAreaModel key={area.id} area={area} elevation={y} />)}
      {(level.fixtures ?? []).map((fixture) => <FurnitureModel key={fixture.id} fixture={fixture} elevation={y} />)}
      {furnishings.map((placement) => (
        <PlacedFurnitureModel
          key={placement.id}
          decorating={decorating}
          elevation={y}
          onDragStateChange={onDragStateChange}
          onCommitMove={onCommitMoveFurnishing}
          onPreviewMove={onPreviewMoveFurnishing}
          onSelect={onSelectFurnishing}
          placement={placement}
          selected={selectedFurnishingId === placement.id}
        />
      ))}
      {walls.map((wall) => <WallModel key={wall.id} wall={wall} elevation={y} levelHeight={level.ceilingHeight} wallCutaway={wallCutaway} />)}
    </group>
  );
}

function PlacedFurnitureModel({
  decorating,
  elevation,
  onDragStateChange,
  onCommitMove,
  onPreviewMove,
  onSelect,
  placement,
  selected,
}: {
  decorating: boolean;
  elevation: number;
  onDragStateChange: (dragging: boolean) => void;
  onCommitMove: (id: string, x: number, z: number) => void;
  onPreviewMove: (id: string, x: number, z: number) => FurnitureMoveResult;
  onSelect: (id: string) => void;
  placement: FurniturePlacement;
  selected: boolean;
}) {
  const floorY = elevation + 0.06;
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState<FurnitureMoveResult | null>(null);
  const draftRef = useRef<FurnitureMoveResult | null>(null);
  const dragPlane = useMemo(() => new Plane(new Vector3(0, 1, 0), -floorY), [floorY]);
  const dragPoint = useMemo(() => new Vector3(), []);
  const item = furnitureCatalogItem(placement.catalogId);
  if (!item) return null;
  const bodyDepth = item.bodyDepth ?? item.depth;
  const bodyZ = item.shape === "chaise" ? (item.depth - bodyDepth) / 2 : 0;
  const armWidth = Math.min(0.24, item.width * 0.14);
  const cushionWidth = Math.max(0.25, item.width - armWidth * 2 - 0.06);
  const legInset = Math.min(0.24, item.width * 0.18);
  const startDragging = (event: ThreeEvent<PointerEvent>) => {
    if (!decorating) return;
    event.stopPropagation();
    onSelect(placement.id);
    const initialDraft = { position: { x: placement.x, z: placement.z }, collision: null } satisfies FurnitureMoveResult;
    draftRef.current = initialDraft;
    setDraft(initialDraft);
    setDragging(true);
    onDragStateChange(true);
    (event.target as EventTarget & { setPointerCapture(pointerId: number): void }).setPointerCapture(event.pointerId);
  };
  const drag = (event: ThreeEvent<PointerEvent>) => {
    if (!dragging || !decorating) return;
    event.stopPropagation();
    if (event.ray.intersectPlane(dragPlane, dragPoint)) {
      const preview = onPreviewMove(placement.id, dragPoint.x, dragPoint.z);
      draftRef.current = preview;
      setDraft(preview);
    }
  };
  const stopDragging = (event: ThreeEvent<PointerEvent>, commit = true) => {
    if (!dragging) return;
    event.stopPropagation();
    setDragging(false);
    onDragStateChange(false);
    (event.target as EventTarget & { releasePointerCapture(pointerId: number): void }).releasePointerCapture(event.pointerId);
    const finalDraft = draftRef.current;
    if (commit && finalDraft) onCommitMove(placement.id, finalDraft.position.x, finalDraft.position.z);
    draftRef.current = null;
    setDraft(null);
  };
  const renderPosition: FurniturePosition = draft?.position ?? placement;
  const invalid = Boolean(draft?.collision);
  return (
    <group
      position={[renderPosition.x, floorY, renderPosition.z]}
      rotation={[0, placement.rotation, 0]}
      onClick={(event) => { if (decorating) { event.stopPropagation(); onSelect(placement.id); } }}
      onPointerDown={startDragging}
      onPointerMove={drag}
      onPointerUp={(event) => stopDragging(event)}
      onPointerCancel={(event) => stopDragging(event, false)}
    >
      {selected && (
        <mesh position={[0, item.height / 2, 0]}>
          <boxGeometry args={[item.width + 0.08, item.height + 0.08, item.depth + 0.08]} />
          <meshBasicMaterial color={invalid ? "#d62f2f" : "#2457df"} wireframe transparent opacity={0.8} depthWrite={false} />
        </mesh>
      )}
      {invalid && (
        <mesh position={[0, item.height / 2, 0]} renderOrder={4}>
          <boxGeometry args={[item.width + 0.04, item.height + 0.04, item.depth + 0.04]} />
          <meshBasicMaterial color="#e23636" transparent opacity={0.38} depthWrite={false} />
        </mesh>
      )}
      <group scale={[placement.mirrored ? -1 : 1, 1, 1]}>
      {item.shape === "bed" ? <BedFurniture item={item} /> : item.shape === "table" ? <TableFurniture item={item} /> : item.shape === "chair" ? <ChairFurniture item={item} /> : <>
      {[-1, 1].flatMap((side) => [-1, 1].map((front) => (
        <mesh key={`${side}-${front}`} position={[side * (item.width / 2 - legInset), 0.08, bodyZ + front * (bodyDepth / 2 - 0.17)]} castShadow>
          <cylinderGeometry args={[0.035, 0.045, 0.16, 8]} />
          <meshStandardMaterial color="#4b3b2d" roughness={0.72} />
        </mesh>
      )))}
      <mesh position={[0, 0.22, bodyZ]} castShadow receiveShadow>
        <boxGeometry args={[item.width, 0.28, Math.max(0.42, bodyDepth - 0.14)]} />
        <meshStandardMaterial color={item.accentColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.42, bodyZ - bodyDepth * 0.08]} castShadow receiveShadow>
        <boxGeometry args={[cushionWidth, 0.16, Math.max(0.34, bodyDepth * 0.62)]} />
        <meshStandardMaterial color={item.color} roughness={0.96} />
      </mesh>
      <mesh position={[0, 0.3 + (item.height - 0.3) / 2, bodyZ + bodyDepth / 2 - 0.1]} castShadow receiveShadow>
        <boxGeometry args={[item.width, item.height - 0.3, 0.2]} />
        <meshStandardMaterial color={item.color} roughness={0.96} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (item.width / 2 - armWidth / 2), 0.45, bodyZ - 0.02]} castShadow receiveShadow>
          <boxGeometry args={[armWidth, 0.54, Math.max(0.42, bodyDepth - 0.12)]} />
          <meshStandardMaterial color={item.color} roughness={0.96} />
        </mesh>
      ))}
      {item.shape === "chaise" && (
        <group position={[-item.width * 0.31, 0, 0]}>
          <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
            <boxGeometry args={[item.width * 0.34, 0.28, item.depth - 0.16]} />
            <meshStandardMaterial color={item.accentColor} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.42, -0.03]} castShadow receiveShadow>
            <boxGeometry args={[item.width * 0.31, 0.16, item.depth - 0.22]} />
            <meshStandardMaterial color={item.color} roughness={0.96} />
          </mesh>
        </group>
      )}
      </>}
      </group>
    </group>
  );
}

function BedFurniture({ item }: { item: FurnitureCatalogItem }) {
  const frameHeight = Math.min(0.32, item.height * 0.46);
  const headboardHeight = item.height;
  const mattressWidth = Math.max(0.3, item.width - 0.14);
  const mattressDepth = Math.max(0.5, item.depth - 0.16);
  return (
    <group>
      <mesh position={[0, frameHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width, frameHeight, item.depth]} />
        <meshStandardMaterial color={item.accentColor} roughness={0.76} />
      </mesh>
      <mesh position={[0, frameHeight + 0.09, -0.02]} castShadow receiveShadow>
        <boxGeometry args={[mattressWidth, 0.18, mattressDepth]} />
        <meshStandardMaterial color="#f0eee6" roughness={0.98} />
      </mesh>
      <mesh position={[0, headboardHeight / 2, item.depth / 2 - 0.045]} castShadow receiveShadow>
        <boxGeometry args={[item.width, headboardHeight, 0.09]} />
        <meshStandardMaterial color={item.color} roughness={0.82} />
      </mesh>
      <mesh position={[0, frameHeight + 0.22, item.depth * 0.27]} castShadow>
        <boxGeometry args={[mattressWidth * 0.72, 0.14, Math.min(0.38, item.depth * 0.2)]} />
        <meshStandardMaterial color="#d9d4c9" roughness={1} />
      </mesh>
    </group>
  );
}

function TableFurniture({ item }: { item: FurnitureCatalogItem }) {
  const topThickness = Math.min(0.1, item.height * 0.14);
  const legWidth = Math.min(0.09, item.width * 0.12, item.depth * 0.12);
  const legHeight = item.height - topThickness;
  const xInset = Math.max(legWidth, item.width / 2 - legWidth * 1.25);
  const zInset = Math.max(legWidth, item.depth / 2 - legWidth * 1.25);
  return (
    <group>
      <mesh position={[0, item.height - topThickness / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width, topThickness, item.depth]} />
        <meshStandardMaterial color={item.color} roughness={0.72} />
      </mesh>
      {[-1, 1].flatMap((side) => [-1, 1].map((front) => (
        <mesh key={`${side}-${front}`} position={[side * xInset, legHeight / 2, front * zInset]} castShadow>
          <boxGeometry args={[legWidth, legHeight, legWidth]} />
          <meshStandardMaterial color={item.accentColor} roughness={0.8} />
        </mesh>
      )))}
    </group>
  );
}

function ChairFurniture({ item }: { item: FurnitureCatalogItem }) {
  const seatHeight = Math.min(0.45, item.height * 0.58);
  const seatThickness = 0.08;
  const legWidth = Math.min(0.045, item.width * 0.1);
  const xInset = item.width / 2 - legWidth * 1.4;
  const zInset = item.depth / 2 - legWidth * 1.4;
  return (
    <group>
      {[-1, 1].flatMap((side) => [-1, 1].map((front) => (
        <mesh key={`${side}-${front}`} position={[side * xInset, seatHeight / 2, front * zInset]} castShadow>
          <boxGeometry args={[legWidth, seatHeight, legWidth]} />
          <meshStandardMaterial color={item.accentColor} roughness={0.76} />
        </mesh>
      )))}
      <mesh position={[0, seatHeight, -0.015]} castShadow receiveShadow>
        <boxGeometry args={[item.width, seatThickness, Math.max(0.25, item.depth * 0.72)]} />
        <meshStandardMaterial color={item.color} roughness={0.86} />
      </mesh>
      <mesh position={[0, seatHeight + (item.height - seatHeight) / 2, item.depth / 2 - 0.045]} castShadow receiveShadow>
        <boxGeometry args={[item.width, item.height - seatHeight, 0.09]} />
        <meshStandardMaterial color={item.color} roughness={0.86} />
      </mesh>
    </group>
  );
}

function SlabPieceModel({ piece, elevation }: { piece: SlabPiece; elevation: number }) {
  return (
    <group>
      <mesh position={[piece.x, elevation - 0.09, piece.z]} receiveShadow castShadow>
        <boxGeometry args={[piece.width, 0.18, piece.depth]} />
        <meshStandardMaterial color="#d4c5a6" roughness={0.9} />
      </mesh>
      <mesh position={[piece.x, elevation + 0.015, piece.z]} receiveShadow>
        <boxGeometry args={[Math.max(0.02, piece.width - 0.08), 0.05, Math.max(0.02, piece.depth - 0.08)]} />
        <meshStandardMaterial color="#eee8da" roughness={0.82} />
      </mesh>
    </group>
  );
}

function PlanFloor({ level, pieces, elevation }: { level: Level; pieces: SlabPiece[]; elevation: number }) {
  return <>{pieces.map((piece) => <PlanFloorPiece key={piece.id} level={level} piece={piece} elevation={elevation} />)}</>;
}

function PlanFloorPiece({ level, piece, elevation }: { level: Level; piece: SlabPiece; elevation: number }) {
  const loadedTexture = useLoader(TextureLoader, level.floorTextureUrl ?? "");
  const uv = useMemo(() => new Float32Array(slabPieceTextureUv(level, piece)), [level, piece]);
  const texture = useMemo(() => {
    const copy = loadedTexture.clone();
    copy.colorSpace = SRGBColorSpace;
    copy.needsUpdate = true;
    return copy;
  }, [loadedTexture]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={[piece.x, elevation + 0.048, piece.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[piece.width, piece.depth]}>
        <bufferAttribute attach="attributes-uv" args={[uv, 2]} />
      </planeGeometry>
      <meshStandardMaterial map={texture} roughness={0.95} metalness={0} />
    </mesh>
  );
}

/**
 * Railing along one edge of the stairwell opening. Suppressed when a
 * structural wall already runs on that edge (detected from the level's walls).
 */
function StairwellRailEdge({
  position,
  size,
  axis,
  edgeKey,
}: {
  position: [number, number, number];
  size: [number, number, number];
  axis: "x" | "z";
  edgeKey: string;
}) {
  const railHeight = 0.9;
  const barThickness = 0.05;
  const spanLength = axis === "x" ? size[0] : size[2];
  const postCount = Math.max(2, Math.ceil(spanLength / 1.0));
  const [cx, cy, cz] = position;
  return (
    <group>
      {/* Two horizontal bars */}
      {[railHeight * 0.55, railHeight].map((h, i) => (
        <mesh key={`${edgeKey}-bar-${i}`} position={[cx, cy + h, cz]} castShadow>
          <boxGeometry args={[size[0], barThickness, size[2]]} />
          <meshStandardMaterial color="#36413f" roughness={0.56} metalness={0.28} />
        </mesh>
      ))}
      {/* Vertical posts */}
      {Array.from({ length: postCount + 1 }, (_, i) => {
        const t = i / postCount;
        const px = axis === "x" ? cx - spanLength / 2 + spanLength * t : cx;
        const pz = axis === "z" ? cz - spanLength / 2 + spanLength * t : cz;
        return (
          <mesh key={`${edgeKey}-post-${i}`} position={[px, cy + railHeight / 2, pz]} castShadow>
            <boxGeometry args={[barThickness, railHeight, barThickness]} />
            <meshStandardMaterial color="#36413f" roughness={0.56} metalness={0.28} />
          </mesh>
        );
      })}
      {/* Translucent glass infill */}
      <mesh position={[cx, cy + railHeight * 0.42, cz]} castShadow>
        <boxGeometry args={[size[0], railHeight * 0.65, size[2]]} />
        <meshStandardMaterial color="#85b8b6" roughness={0.28} metalness={0.08} transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}

function StairwellTrim({ segments, elevation }: { segments: RailSegment[]; elevation: number }) {
  return (
    <group>
      {segments.map((segment) => {
        const center = (segment.from + segment.to) / 2;
        const length = segment.to - segment.from;
        const position: [number, number, number] = segment.axis === "x"
          ? [center, elevation, segment.fixed]
          : [segment.fixed, elevation, center];
        const size: [number, number, number] = segment.axis === "x"
          ? [length, 0.02, 0.02]
          : [0.02, 0.02, length];
        return (
          <StairwellRailEdge
            key={segment.key}
            position={position}
            size={size}
            axis={segment.axis}
            edgeKey={segment.key}
          />
        );
      })}
    </group>
  );
}

function StairConnectionModel({ connection }: { connection: StairConnection }) {
  return (
    <group>
      <StairFlightModel flight={connection.lowerFlight} width={connection.width} colorOffset={0} />
      <mesh position={[connection.landing.x, connection.landing.elevation - 0.08, connection.landing.z]} castShadow receiveShadow>
        <boxGeometry args={[connection.landing.width, 0.16, connection.landing.depth]} />
        <meshStandardMaterial color="#bd8b52" roughness={0.82} />
      </mesh>
      <StairFlightModel flight={connection.upperFlight} width={connection.width} colorOffset={1} />
    </group>
  );
}

function StairFlightModel({
  flight,
  width,
  colorOffset,
}: {
  flight: StairConnection["lowerFlight"];
  width: number;
  colorOffset: number;
}) {
  const dx = flight.end[0] - flight.start[0];
  const dz = flight.end[1] - flight.start[1];
  const runLength = Math.max(0.5, Math.hypot(dx, dz));
  const angle = Math.atan2(dz, dx);
  const tread = runLength / flight.stepCount;
  const rise = flight.toElevation - flight.fromElevation;
  return (
    <group>
      {Array.from({ length: flight.stepCount }, (_, index) => {
        const progress = (index + 0.5) / flight.stepCount;
        const height = ((index + 1) / flight.stepCount) * rise;
        const position: [number, number, number] = [
          flight.start[0] + dx * progress,
          flight.fromElevation + height / 2,
          flight.start[1] + dz * progress,
        ];
        return (
          <mesh key={index} position={position} rotation={[0, -angle, 0]} castShadow receiveShadow>
            <boxGeometry args={[tread * 1.06, height, width]} />
            <meshStandardMaterial color={(index + colorOffset) % 2 ? "#c79a61" : "#d6ad78"} roughness={0.8} />
          </mesh>
        );
      })}
    </group>
  );
}

function OutdoorAreaModel({ area, elevation }: { area: OutdoorArea; elevation: number }) {
  const railHeight = 1.05;
  const railThickness = 0.06;
  const rails: Array<{ key: string; position: [number, number, number]; size: [number, number, number] }> = [];
  const guards: Array<{ key: string; position: [number, number, number]; size: [number, number, number] }> = [];
  const posts: Array<{ key: string; position: [number, number, number] }> = [];
  const addHorizontal = (key: string, z: number) => {
    guards.push({ key: `${key}-guard`, position: [area.x, elevation + 0.31, z], size: [Math.max(0.1, area.width - 0.1), 0.56, 0.035] });
    [railHeight * 0.55, railHeight].forEach((barHeight, index) => rails.push({
      key: `${key}-bar-${index}`,
      position: [area.x, elevation + barHeight, z],
      size: [area.width, railThickness, railThickness],
    }));
    const count = Math.max(2, Math.ceil(area.width / 1.25));
    for (let index = 0; index <= count; index += 1) posts.push({
      key: `${key}-post-${index}`,
      position: [area.x - area.width / 2 + area.width * index / count, elevation + railHeight / 2, z],
    });
  };
  const addVertical = (key: string, x: number) => {
    guards.push({ key: `${key}-guard`, position: [x, elevation + 0.31, area.z], size: [0.035, 0.56, Math.max(0.1, area.depth - 0.1)] });
    [railHeight * 0.55, railHeight].forEach((barHeight, index) => rails.push({
      key: `${key}-bar-${index}`,
      position: [x, elevation + barHeight, area.z],
      size: [railThickness, railThickness, area.depth],
    }));
    const count = Math.max(2, Math.ceil(area.depth / 1.25));
    for (let index = 0; index <= count; index += 1) posts.push({
      key: `${key}-post-${index}`,
      position: [x, elevation + railHeight / 2, area.z - area.depth / 2 + area.depth * index / count],
    });
  };
  /* The area side points away from the building, so the opposite edge is the
     attached edge and intentionally has no guard rail. */
  if (area.side !== "bottom") addHorizontal("rail-top", area.z - area.depth / 2);
  if (area.side !== "top") addHorizontal("rail-bottom", area.z + area.depth / 2);
  if (area.side !== "right") addVertical("rail-left", area.x - area.width / 2);
  if (area.side !== "left") addVertical("rail-right", area.x + area.width / 2);
  const plankCount = Math.max(4, Math.min(18, Math.ceil(area.width / 0.55)));
  const outerEdge = area.side === "bottom"
    ? { position: [area.x, elevation - 0.15, area.z + area.depth / 2] as [number, number, number], size: [area.width, 0.3, 0.12] as [number, number, number] }
    : area.side === "top"
      ? { position: [area.x, elevation - 0.15, area.z - area.depth / 2] as [number, number, number], size: [area.width, 0.3, 0.12] as [number, number, number] }
      : area.side === "right"
        ? { position: [area.x + area.width / 2, elevation - 0.15, area.z] as [number, number, number], size: [0.12, 0.3, area.depth] as [number, number, number] }
        : { position: [area.x - area.width / 2, elevation - 0.15, area.z] as [number, number, number], size: [0.12, 0.3, area.depth] as [number, number, number] };
  const supportHeight = Math.max(0, elevation - 0.12);
  const supportPoints: Array<[number, number]> = area.side === "top" || area.side === "bottom"
    ? [[area.x - area.width * 0.43, outerEdge.position[2]], [area.x + area.width * 0.43, outerEdge.position[2]]]
    : [[outerEdge.position[0], area.z - area.depth * 0.43], [outerEdge.position[0], area.z + area.depth * 0.43]];

  return (
    <group>
      <mesh position={[area.x, elevation - 0.035, area.z]} receiveShadow castShadow>
        <boxGeometry args={[area.width, 0.22, area.depth]} />
        <meshStandardMaterial color="#a96f36" emissive="#351702" emissiveIntensity={0.12} roughness={0.9} />
      </mesh>
      <mesh position={outerEdge.position} castShadow receiveShadow>
        <boxGeometry args={outerEdge.size} />
        <meshStandardMaterial color="#6b4528" roughness={0.86} />
      </mesh>
      {Array.from({ length: plankCount }, (_, index) => (
        <mesh key={`plank-${index}`} position={[area.x - area.width / 2 + area.width * (index + 0.5) / plankCount, elevation + 0.052, area.z]} receiveShadow>
          <boxGeometry args={[Math.max(0.08, area.width / plankCount - 0.025), 0.018, Math.max(0.12, area.depth - 0.08)]} />
          <meshStandardMaterial color={index % 2 ? "#c59056" : "#d0a168"} roughness={0.92} />
        </mesh>
      ))}
      {guards.map((guard) => (
        <mesh key={guard.key} position={guard.position} castShadow>
          <boxGeometry args={guard.size} />
          <meshStandardMaterial color="#85b8b6" roughness={0.28} metalness={0.08} transparent opacity={0.48} depthWrite={false} />
        </mesh>
      ))}
      {rails.map((rail) => (
        <mesh key={rail.key} position={rail.position} castShadow>
          <boxGeometry args={rail.size} />
          <meshStandardMaterial color="#36413f" roughness={0.56} metalness={0.28} />
        </mesh>
      ))}
      {posts.map((post) => (
        <mesh key={post.key} position={post.position} castShadow>
          <boxGeometry args={[railThickness, railHeight, railThickness]} />
          <meshStandardMaterial color="#36413f" roughness={0.56} metalness={0.28} />
        </mesh>
      ))}
      {supportHeight > 0.4 && supportPoints.map(([x, z], index) => (
        <mesh key={`balcony-support-${index}`} position={[x, supportHeight / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[0.18, supportHeight, 0.18]} />
          <meshStandardMaterial color="#515856" roughness={0.7} metalness={0.12} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Standing heights, in metres. Fixture detection recovers a footprint from the
 * plan but nothing about height, so these come from the sizes joinery is
 * actually built to.
 */
/** Worktop surface: the European kitchen and vanity standard. */
const WORKTOP_HEIGHT = 0.9;
/** A wardrobe or closet run — full height, unlike a base cupboard. */
const CUPBOARD_HEIGHT = 1.8;
/** Thickness of the worktop slab laid over a carcass. */
const SLAB = 0.04;

function FurnitureModel({ fixture, elevation }: { fixture: Fixture; elevation: number }) {
  const y = elevation + 0.06; // sit on the floor slab
  const { x, z, width, depth, rotation } = fixture;
  switch (fixture.kind) {
    case "stove": return (
      <group position={[x, y, z]} rotation={[0, rotation, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[width, 0.06, depth]} />
          <meshStandardMaterial color="#c8c6c0" roughness={0.55} metalness={0.35} />
        </mesh>
        {/* 4 burner rings */}
        {[[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].map(([dx, dz], i) => (
          <mesh key={i} position={[width * dx, 0.04, depth * dz]} castShadow>
            <cylinderGeometry args={[width * 0.15, width * 0.15, 0.03, 12]} />
            <meshStandardMaterial color="#3a3a3a" roughness={0.7} metalness={0.2} />
          </mesh>
        ))}
      </group>
    );
    // A fridge is a tall unit, the height of the joinery it stands among, not
    // something derived from how deep it happens to be drawn.
    case "fridge": return (
      <group position={[x, y + CUPBOARD_HEIGHT / 2, z]} rotation={[0, rotation, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[width, CUPBOARD_HEIGHT, depth]} />
          <meshStandardMaterial color="#e8e6e0" roughness={0.45} metalness={0.15} />
        </mesh>
        {/* Split between fridge and freezer compartments */}
        <mesh position={[0, CUPBOARD_HEIGHT * 0.12, depth / 2 + 0.004]}>
          <boxGeometry args={[width * 0.96, 0.012, 0.008]} />
          <meshStandardMaterial color="#b9b6ae" roughness={0.6} />
        </mesh>
        {/* Handle */}
        <mesh position={[width * 0.38, CUPBOARD_HEIGHT * 0.28, depth / 2 + 0.02]} castShadow>
          <boxGeometry args={[0.025, 0.28, 0.03]} />
          <meshStandardMaterial color="#aaa" roughness={0.3} metalness={0.7} />
        </mesh>
      </group>
    );
    // A basin is only ever detected inside a counter run, so it belongs at
    // worktop height, let into the surface, rather than standing on the floor.
    case "sink": return (
      <group position={[x, y + WORKTOP_HEIGHT, z]} rotation={[0, rotation, 0]}>
        {/* Bowl, recessed below the surface */}
        <mesh position={[0, -0.09, 0]} castShadow receiveShadow>
          <boxGeometry args={[width * 0.86, 0.18, depth * 0.8]} />
          <meshStandardMaterial color="#b5cfd4" roughness={0.28} metalness={0.05} />
        </mesh>
        {/* Rim, standing just proud of the worktop it is set into */}
        <mesh position={[0, 0.012, 0]} castShadow>
          <boxGeometry args={[width, 0.024, depth]} />
          <meshStandardMaterial color="#d8d4cc" roughness={0.45} metalness={0.12} />
        </mesh>
        {/* Drain */}
        <mesh position={[0, -0.016, 0]}>
          <cylinderGeometry args={[Math.min(width, depth) * 0.06, Math.min(width, depth) * 0.06, 0.02, 8]} />
          <meshStandardMaterial color="#888" metalness={0.6} roughness={0.3} />
        </mesh>
        {/* Tap at the back edge */}
        <mesh position={[0, 0.12, -depth * 0.34]} castShadow>
          <cylinderGeometry args={[0.018, 0.02, 0.22, 10]} />
          <meshStandardMaterial color="#c6c8cc" metalness={0.75} roughness={0.25} />
        </mesh>
      </group>
    );
    case "island": return (
      <group position={[x, y, z]} rotation={[0, rotation, 0]}>
        <mesh position={[0, (WORKTOP_HEIGHT - SLAB) / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[width, WORKTOP_HEIGHT - SLAB, depth]} />
          <meshStandardMaterial color="#c8bfa8" roughness={0.72} />
        </mesh>
        <mesh position={[0, WORKTOP_HEIGHT - SLAB / 2, 0]} castShadow>
          <boxGeometry args={[width + 0.02, SLAB, depth + 0.02]} />
          <meshStandardMaterial color="#d4cdb8" roughness={0.5} metalness={0.08} />
        </mesh>
      </group>
    );
    case "toilet": return (
      <group position={[x, y, z]} rotation={[0, rotation, 0]}>
        {/* Cistern */}
        <mesh position={[0, 0.2, -depth * 0.32]} castShadow receiveShadow>
          <boxGeometry args={[width * 0.85, 0.4, depth * 0.32]} />
          <meshStandardMaterial color="#eeece6" roughness={0.5} />
        </mesh>
        {/* Bowl */}
        <mesh position={[0, 0.18, depth * 0.15]} castShadow receiveShadow>
          <cylinderGeometry args={[width * 0.44, width * 0.36, 0.36, 14]} />
          <meshStandardMaterial color="#eeece6" roughness={0.4} />
        </mesh>
      </group>
    );
    case "shower": return (
      <group position={[x, y, z]} rotation={[0, rotation, 0]}>
        <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
          <boxGeometry args={[width, 0.08, depth]} />
          <meshStandardMaterial color="#d0e8ec" roughness={0.3} metalness={0.05} />
        </mesh>
        {/* Translucent screen on one side */}
        <mesh position={[0, 0.9, -depth / 2]}>
          <boxGeometry args={[width, 1.8, 0.02]} />
          <meshStandardMaterial color="#a0cccc" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      </group>
    );
    case "bathtub": return (
      <group position={[x, y, z]} rotation={[0, rotation, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[width, 0.52, depth]} />
          <meshStandardMaterial color="#e8e4de" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.28, 0]}>
          <boxGeometry args={[width * 0.84, 0.18, depth * 0.84]} />
          <meshStandardMaterial color="#b8d4d8" roughness={0.22} metalness={0.04} transparent opacity={0.6} depthWrite={false} />
        </mesh>
      </group>
    );
    case "washer": return (
      <group position={[x, y + 0.42, z]} rotation={[0, rotation, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[width, 0.84, depth]} />
          <meshStandardMaterial color="#e0ddd6" roughness={0.5} />
        </mesh>
        {/* Drum circle */}
        <mesh position={[0, 0.06, depth * 0.52]}>
          <cylinderGeometry args={[Math.min(width, depth) * 0.34, Math.min(width, depth) * 0.34, 0.03, 14]} />
          <meshStandardMaterial color="#b4c8cc" roughness={0.3} metalness={0.1} />
        </mesh>
      </group>
    );
    case "cupboard": return (
      <group position={[x, y + CUPBOARD_HEIGHT / 2, z]} rotation={[0, rotation, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[width, CUPBOARD_HEIGHT, depth]} />
          <meshStandardMaterial color="#c4b89a" roughness={0.65} />
        </mesh>
        {/* Door split down the long face, so it reads as joinery from across a room */}
        <mesh position={[0, 0, depth / 2 + 0.004]}>
          <boxGeometry args={[0.012, CUPBOARD_HEIGHT * 0.94, 0.008]} />
          <meshStandardMaterial color="#9d9376" roughness={0.7} />
        </mesh>
      </group>
    );
    // Carcass plus slab add up to exactly WORKTOP_HEIGHT, so a basin placed at
    // that height meets the surface it is let into.
    case "countertop": return (
      <group position={[x, y, z]} rotation={[0, rotation, 0]}>
        <mesh position={[0, (WORKTOP_HEIGHT - SLAB) / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[width, WORKTOP_HEIGHT - SLAB, depth]} />
          <meshStandardMaterial color="#bab0a0" roughness={0.6} />
        </mesh>
        <mesh position={[0, WORKTOP_HEIGHT - SLAB / 2, 0]} castShadow>
          <boxGeometry args={[width + 0.01, SLAB, depth + 0.01]} />
          <meshStandardMaterial color="#d0c8b8" roughness={0.4} metalness={0.1} />
        </mesh>
      </group>
    );
    default: return null;
  }
}

function WallModel({ wall, elevation, levelHeight, wallCutaway }: { wall: Wall; elevation: number; levelHeight: number; wallCutaway: number }) {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const openings = [...(wall.openings ?? [])].sort((a, b) => a.offset - b.offset);
  const pieces: ReactNode[] = [];
  let cursor = 0;

  // Horizontal section cut. Walls are near-white on a near-white ground, so
  // fading their alpha cannot actually reveal the interior — it only removes
  // their shadow. Clipping every wall at a section height does reveal it, and
  // keeps door and window geometry below the cut intact.
  const cutHeight = levelHeight * wallCutaway;
  const clamp = (value: number) => Math.max(0, Math.min(length, value));
  const addBox = (key: string, from: number, to: number, height: number, base: number, color = "#f3f0e8", opacity = 1, overrideDepth?: number) => {
    if (base >= cutHeight - 0.02) return;
    const clippedHeight = Math.min(height, cutHeight - base);
    if (to - from <= 0.02 || clippedHeight <= 0.02) return;
    const distance = (from + to) / 2;
    const t = distance / length;
    const x = wall.start[0] + dx * t;
    const z = wall.start[1] + dz * t;
    pieces.push(
      <mesh key={key} position={[x, elevation + base + clippedHeight / 2, z]} rotation={[0, -angle, 0]} castShadow receiveShadow>
        <boxGeometry args={[to - from, clippedHeight, overrideDepth ?? wall.thickness ?? 0.18]} />
        <meshStandardMaterial color={color} roughness={0.72} transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 0.99} />
      </mesh>,
    );
  };

  // Build a unified, sorted list of all gaps in the wall (openings + rail spans).
  // Opening gaps carry their own infill geometry; rail gaps are empty — the
  // StairwellTrim renders those spans as railing instead of solid wall.
  type WallGap =
    | { kind: "opening"; from: number; to: number; opening: Opening; idx: number }
    | { kind: "rail"; from: number; to: number };
  const gaps: WallGap[] = [
    ...openings.map((opening, idx): WallGap => ({
      kind: "opening", from: clamp(opening.offset), to: clamp(opening.offset + opening.width), opening, idx,
    })),
    ...(wall.railSpans ?? []).map(([rs, re]): WallGap => ({
      kind: "rail", from: clamp(rs), to: clamp(re),
    })),
  ].sort((a, b) => a.from - b.from);

  for (const gap of gaps) {
    if (gap.from > cursor + 0.01) addBox(`${wall.id}-body-${gap.from.toFixed(3)}`, cursor, gap.from, wall.height ?? levelHeight, 0);
    if (gap.kind === "opening") {
      const { opening, idx } = gap;
      if (opening.kind === "window") {
        const sill = opening.sill ?? 0.9;
        addBox(`${wall.id}-sill-${idx}`, gap.from, gap.to, sill, 0);
        addBox(`${wall.id}-header-${idx}`, gap.from, gap.to, levelHeight - sill - opening.height, sill + opening.height);
        addBox(`${wall.id}-glass-${idx}`, gap.from + 0.04, gap.to - 0.04, opening.height - 0.08, sill + 0.04, "#7fc6d1", 0.46);
      } else {
        addBox(`${wall.id}-header-${idx}`, gap.from, gap.to, levelHeight - opening.height, opening.height);
        addBox(`${wall.id}-door-${idx}`, gap.from + 0.03, gap.to - 0.03, opening.height - 0.02, 0.01, "#7a4f28", 1, 0.04);
      }
    }
    // rail gaps: no solid wall rendered here — StairwellTrim draws railing
    cursor = Math.max(cursor, gap.to);
  }
  addBox(`${wall.id}-body-end`, cursor, length, wall.height ?? levelHeight, 0);
  return <>{pieces}</>;
}
