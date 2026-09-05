"use client";
/* eslint-disable react/no-unknown-property */
import { ContactShadows } from "@react-three/drei";
import { Canvas, useLoader } from "@react-three/fiber";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Group, SRGBColorSpace, TextureLoader } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { buildStairConnections, slabPieceTextureUv, slabPieces, stairwellOpening, type SlabPiece, type StairConnection, type StairwellOpening } from "./scene-geometry";
import { type Fixture, type Level, type Opening, type OutdoorArea, type Wall } from "./scene-data";
import { furnitureCatalogItem, furnitureCollisionParts, furnitureVerticalBounds, type FurniturePlacement } from "./furniture-catalog";
import type { FurnitureMoveResult } from "./furniture-placement";
import { activateRailSpans, clampWallGapsToRails, stairwellRailSegments, type RailSegment } from "./stairwell-rails";
import { ProceduralFurniture } from "./furniture-model";
import { WorkspaceCamera } from "./viewer-camera";
import { ViewerInteraction, type MovePreview } from "./viewer-interaction";
import { SCENE_Y_OFFSET } from "./workspace-state";

export default function TwinViewer({
  decorating, exploded, furnishings, gridSnapEnabled, levels, onCommitMoveFurnishing,
  onPreviewMoveFurnishing, onSelectFurnishing, selectedFurnishingId, visibleLevels, wallCutaway,
  activeLevel, view, fitRequest, active, draft, draftCollision, onDraftPosition, showLegend,
}: {
  decorating: boolean; exploded: boolean; furnishings: FurniturePlacement[]; gridSnapEnabled: boolean; levels: Level[];
  onCommitMoveFurnishing: (id: string, x: number, z: number) => void;
  onPreviewMoveFurnishing: (id: string, x: number, z: number) => FurnitureMoveResult;
  onSelectFurnishing: (id: string | null) => void; selectedFurnishingId: string | null;
  visibleLevels: Set<string>; wallCutaway: number; activeLevel: string; view: "perspective" | "top";
  fitRequest: number; active: boolean; draft: FurniturePlacement | null;
  draftCollision: FurnitureMoveResult["collision"]; onDraftPosition: (x: number, z: number) => void; showLegend: boolean;
}) {
  const [compact] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches);
  const [movePreview, setMovePreview] = useState<MovePreview>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  const explodeDistance = exploded ? 2.35 : 0;
  const stairConnections = buildStairConnections(levels, explodeDistance);
  const stairOpenings = new Map(stairConnections.map((connection) => [connection.upperLevelId, connection.opening]));
  const stairAccess = new Map(stairConnections.map((connection) => [connection.upperLevelId, { point: connection.upperFlight.end, width: connection.width }]));
  const level = levels.find((item) => item.id === activeLevel) ?? levels[0];
  const wholeBuilding = visibleLevels.size > 1;
  return <div className="twin-canvas">
    <Canvas shadows={!compact} dpr={compact ? [1, 1.5] : [1, 1.75]} frameloop={active ? "demand" : "never"}>
      <color attach="background" args={["#ebe9e1"]} />
      <ambientLight intensity={1.25} />
      <hemisphereLight args={["#f4f1e8", "#9d978a", 0.85]} />
      <directionalLight position={[-8, 9, -6]} intensity={0.45} />
      <directionalLight position={[7, 12, 6]} intensity={2.1} castShadow={!compact} shadow-mapSize={[1024, 1024]} />
      <group position={[0, SCENE_Y_OFFSET, 0]}>
        {levels.map((current, index) => visibleLevels.has(current.id) && <LevelModel key={current.id}
          level={current} opening={index > 0 ? stairOpenings.get(current.id) ?? stairwellOpening(current) : null}
          access={index > 0 ? stairAccess.get(current.id) ?? null : null} explodeOffset={index * explodeDistance}
          furnishings={furnishings.filter((placement) => placement.levelId === current.id)}
          decorating={decorating} gridSnapEnabled={gridSnapEnabled} selectedFurnishingId={selectedFurnishingId}
          movePreview={movePreview} wallCutaway={wallCutaway} />)}
        {draft && <PlacedFurnitureModel placement={draft} elevation={level.elevation} ceilingHeight={level.ceilingHeight} selected preview
          movePreview={movePreview?.id === draft.id ? movePreview.result : null} collision={draftCollision} />}
        {/* Isolating a floor hides the neighbouring slab, not its connected stair. */}
        {stairConnections.map((connection) => visibleLevels.has(connection.lowerLevelId) || visibleLevels.has(connection.upperLevelId)
          ? <StairConnectionModel key={connection.id} connection={connection} /> : null)}
        <ContactShadows position={[0, -0.03, 0]} opacity={0.24} scale={24} blur={2.8} far={12} />
      </group>
      <WorkspaceCamera view={view} level={level} levels={levels} wholeBuilding={wholeBuilding} exploded={exploded} fitRequest={fitRequest} controls={controls} />
      <ViewerInteraction controls={controls} enabled={decorating && active} elevation={level.elevation}
        furnishings={furnishings} selectedId={selectedFurnishingId} draft={draft} onPreview={onPreviewMoveFurnishing}
        onMovePreview={setMovePreview} onCommit={onCommitMoveFurnishing} onSelect={onSelectFurnishing} onDraftPosition={onDraftPosition} />
    </Canvas>
    {showLegend && <div className="viewer-legend"><span><i className="legend-wall" />Structure</span><span><i className="legend-door" />Doors</span><span><i className="legend-window" />Windows</span><span><i className="legend-stair" />Stairs</span><span><i className="legend-fixture" />Fixtures</span></div>}
  </div>;
}
function LevelModel({ decorating, level, opening, access, explodeOffset, furnishings, gridSnapEnabled, selectedFurnishingId, movePreview, wallCutaway }: {
  decorating: boolean; level: Level; opening: StairwellOpening | null; access: { point: [number, number]; width: number } | null;
  explodeOffset: number; furnishings: FurniturePlacement[]; gridSnapEnabled: boolean; selectedFurnishingId: string | null;
  movePreview: MovePreview; wallCutaway: number;
}) {
  const y = level.elevation + explodeOffset;
  const pieces = slabPieces(level, opening);
  const candidates = useMemo(() => activateRailSpans(level.walls, opening), [level.walls, opening]);
  const railSegments = useMemo(() => opening ? stairwellRailSegments(opening, candidates, access) : [], [opening, candidates, access]);
  const walls = useMemo(() => clampWallGapsToRails(candidates, railSegments), [candidates, railSegments]);
  return <group>
    {pieces.map((piece) => <SlabPieceModel key={piece.id} piece={piece} elevation={y} />)}
    {decorating && gridSnapEnabled && <gridHelper args={[Math.ceil(Math.max(level.slab.width, level.slab.depth)), Math.max(2, Math.ceil(Math.max(level.slab.width, level.slab.depth) / 0.5)), "#6680c5", "#b7c2dd"]} position={[level.slab.x, y + 0.081, level.slab.z]} />}
    {level.floorTextureUrl && <PlanFloor level={level} pieces={pieces} elevation={y} />}
    {opening && <StairwellTrim segments={railSegments} elevation={y} />}
    {(level.outdoorAreas ?? []).map((area) => <OutdoorAreaModel key={area.id} area={area} elevation={y} />)}
    {(level.fixtures ?? []).map((fixture) => <FurnitureModel key={fixture.id} fixture={fixture} elevation={y} />)}
    {furnishings.map((placement) => <PlacedFurnitureModel key={placement.id} placement={placement} elevation={y} ceilingHeight={level.ceilingHeight}
      selected={selectedFurnishingId === placement.id} movePreview={movePreview?.id === placement.id ? movePreview.result : null} />)}
    {walls.map((wall) => <WallModel key={wall.id} wall={wall} elevation={y} levelHeight={level.ceilingHeight} wallCutaway={wallCutaway} />)}
  </group>;
}
function PlacedFurnitureModel({ placement, elevation, ceilingHeight, selected, movePreview, preview = false, collision = null }: {
  placement: FurniturePlacement; elevation: number; ceilingHeight: number; selected: boolean; movePreview: FurnitureMoveResult | null; preview?: boolean; collision?: FurnitureMoveResult["collision"];
}) {
  const item = furnitureCatalogItem(placement.catalogId);
  const model = useRef<Group>(null);
  useEffect(() => {
    model.current?.traverse((object) => {
      if (!("material" in object)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        material.transparent = preview; material.opacity = preview ? 0.58 : 1; material.depthWrite = !preview;
      }
    });
  }, [preview]);
  if (!item) return null;
  const position = movePreview?.position ?? placement;
  const invalid = Boolean(movePreview?.collision ?? collision);
  const vertical = furnitureVerticalBounds(item, ceilingHeight);
  const selectionHeight = vertical.max - vertical.min;
  return <group position={[position.x, elevation + 0.06, position.z]} rotation={[0, placement.rotation, 0]} userData={{ furnitureId: placement.id }}>
    {selected && furnitureCollisionParts(item).map((part, index) => <mesh key={index} position={[(part.x ?? 0) * (placement.mirrored ? -1 : 1), vertical.min + selectionHeight / 2, part.z ?? 0]}>
      {part.kind === "circle"
        ? <cylinderGeometry args={[part.radius + 0.04, part.radius + 0.04, selectionHeight + 0.08, 28]} />
        : <boxGeometry args={[part.width + 0.08, selectionHeight + 0.08, part.depth + 0.08]} />}
      <meshBasicMaterial color={invalid ? "#d62f2f" : "#267064"} wireframe transparent opacity={0.85} depthWrite={false} />
    </mesh>)}
    <group ref={model} scale={[placement.mirrored ? -1 : 1, 1, 1]}><ProceduralFurniture item={item} ceilingHeight={ceilingHeight} /></group>
  </group>;
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

/**
 * Where the openable face of a cabinet is.
 *
 * Doors are on the long side of a carcass — a wardrobe two metres long does not
 * open through its 0.6 m end — and on whichever end of that side is clear of a
 * wall. Where the plan gives no backing wall, the near side is used, which is
 * at worst the side a viewer is less likely to be looking at.
 */
function cabinetFace(fixture: Fixture, width: number, depth: number) {
  const alongX = width >= depth;
  const offset = (alongX ? depth : width) / 2 + 0.004;
  const towards = fixture.front === "north" ? -1 : fixture.front === "south" ? 1
    : fixture.front === "west" ? -1 : fixture.front === "east" ? 1 : 1;
  // A front across the run's length says nothing about which long face opens,
  // so fall back to the near side there.
  const usable = alongX
    ? (fixture.front === "north" || fixture.front === "south")
    : (fixture.front === "east" || fixture.front === "west");
  const sign = usable ? towards : 1;
  const position: [number, number, number] = alongX
    ? [0, 0, sign * offset]
    : [sign * offset, 0, 0];
  return { alongX, position };
}

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
    // A glazed enclosure, not a tray with one panel beside it: the screens run
    // the full height of the joinery around them and close all four sides. The
    // two against walls are hidden by those walls, so they cost nothing and
    // save having to know which two they are.
    case "shower": {
      const glass = CUPBOARD_HEIGHT;
      const pane = 0.018;
      return (
        <group position={[x, y, z]} rotation={[0, rotation, 0]}>
          <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
            <boxGeometry args={[width, 0.08, depth]} />
            <meshStandardMaterial color="#d0e8ec" roughness={0.3} metalness={0.05} />
          </mesh>
          {([
            ["back", [0, glass / 2 + 0.08, -depth / 2], [width, glass, pane]],
            ["front", [0, glass / 2 + 0.08, depth / 2], [width, glass, pane]],
            ["left", [-width / 2, glass / 2 + 0.08, 0], [pane, glass, depth]],
            ["right", [width / 2, glass / 2 + 0.08, 0], [pane, glass, depth]],
          ] as const).map(([key, position, size]) => (
            <mesh key={key} position={position as [number, number, number]}>
              <boxGeometry args={size as [number, number, number]} />
              <meshStandardMaterial
                color="#a8ced6"
                roughness={0.08}
                metalness={0.02}
                transparent
                opacity={0.24}
                depthWrite={false}
              />
            </mesh>
          ))}
          {/* Rail capping the glazing, which is what makes it read as an enclosure */}
          <mesh position={[0, glass + 0.08, 0]}>
            <boxGeometry args={[width + 0.02, 0.03, depth + 0.02]} />
            <meshStandardMaterial color="#b7bcc0" metalness={0.6} roughness={0.35} />
          </mesh>
        </group>
      );
    }
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
    case "cupboard": {
      // Doors go on the face you can actually reach: the long side of the
      // carcass, on whichever end of it is not against a wall.
      const face = cabinetFace(fixture, width, depth);
      return (
        <group position={[x, y + CUPBOARD_HEIGHT / 2, z]} rotation={[0, rotation, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[width, CUPBOARD_HEIGHT, depth]} />
            <meshStandardMaterial color="#c4b89a" roughness={0.65} />
          </mesh>
          {/* Split between door leaves, so it reads as joinery across a room */}
          <mesh position={face.position}>
            <boxGeometry args={face.alongX ? [0.012, CUPBOARD_HEIGHT * 0.94, 0.008] : [0.008, CUPBOARD_HEIGHT * 0.94, 0.012]} />
            <meshStandardMaterial color="#9d9376" roughness={0.7} />
          </mesh>
        </group>
      );
    }
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
