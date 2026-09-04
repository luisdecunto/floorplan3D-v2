/* eslint-disable @next/next/no-img-element */
import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { SourceRegion } from "./plan-regions";
import type { DetectedStructure } from "./structure-detector";
type StructureMap = Record<string, DetectedStructure>;
type AnalysisSize = { width: number; height: number };
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
export default function PlanReview({
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
              {/* A turned stair covers an L. Drawing its bounding box instead
                  claims the corner the stair turns away from, which is open
                  floor. Draw the winder and the flight when they are known. */}
              {(stair.winder && stair.flight ? [stair.winder, stair.flight] : [stair]).map((part, partIndex) => {
                const steps = Math.max(2, Math.round(
                  Math.min(12, stair.stepCount)
                  * (stair.winder && stair.flight
                    ? (stair.runAxis === "vertical" ? part.height : part.width)
                      / Math.max(1, stair.runAxis === "vertical" ? stair.height : stair.width)
                    : 1),
                ));
                return (
                  <g key={partIndex}>
                    <rect x={part.x} y={part.y} width={part.width} height={part.height} />
                    {Array.from({ length: steps }, (_, index) => {
                      const progress = (index + 1) / (steps + 1);
                      return stair.runAxis === "vertical"
                        ? <line key={index} x1={part.x} x2={part.x + part.width} y1={part.y + part.height * progress} y2={part.y + part.height * progress} />
                        : <line key={index} y1={part.y} y2={part.y + part.height} x1={part.x + part.width * progress} x2={part.x + part.width * progress} />;
                    })}
                  </g>
                );
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
          {regions.flatMap((region) => (structures[region.id]?.fixtures ?? []).map((fixture) => (
            <rect
              key={`${region.id}-${fixture.id}`}
              className={`detected-fixture fixture-${fixture.kind} ${activeLevel === region.id ? "active" : ""}`}
              x={fixture.x - fixture.width / 2}
              y={fixture.y - fixture.height / 2}
              width={fixture.width}
              height={fixture.height}
              transform={structures[region.id]?.sourceRotationDegrees && structures[region.id]?.rotationCenter
                ? `rotate(${structures[region.id].sourceRotationDegrees} ${structures[region.id].rotationCenter?.[0]} ${structures[region.id].rotationCenter?.[1]})`
                : undefined}
            >
              <title>{fixture.kind} ({(fixture.confidence * 100).toFixed(0)}%) {fixture.width.toFixed(0)}×{fixture.height.toFixed(0)}px</title>
            </rect>
          )))}
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

      {focusRegion && <div className="ws-plan-tools" role="group" aria-label="Plan zoom">
        <button onClick={() => nudgeZoom(1 / 1.35)} aria-label="Zoom plan out" disabled={zoomLevel <= 1.001}>−</button>
        <button onClick={() => { setZoomLevel(1); setPan({ x: 0, y: 0 }); }}>Fit plan</button>
        <button onClick={() => nudgeZoom(1.35)} aria-label="Zoom plan in" disabled={zoomLevel >= 7.99}>+</button>
        <button onClick={() => setFocusedLevel(null)}>All floors</button>
      </div>}

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
