import type { Level, Stair } from "./scene-data";

export type StairwellOpening = {
  x: number;
  z: number;
  width: number;
  depth: number;
};

export type SlabPiece = {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
};

export type SlabPieceTextureUv = [number, number, number, number, number, number, number, number];

export type StairConnection = {
  id: string;
  lowerLevelId: string;
  upperLevelId: string;
  opening: StairwellOpening;
  width: number;
  lowerFlight: {
    start: [number, number];
    end: [number, number];
    fromElevation: number;
    toElevation: number;
    stepCount: number;
  };
  upperFlight: {
    start: [number, number];
    end: [number, number];
    fromElevation: number;
    toElevation: number;
    stepCount: number;
  };
  landing: {
    x: number;
    z: number;
    width: number;
    depth: number;
    elevation: number;
  };
};

export type SceneFootprint = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function sceneFootprint(levels: Level[]): SceneFootprint {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  levels.forEach((level) => {
    minX = Math.min(minX, level.slab.x - level.slab.width / 2);
    maxX = Math.max(maxX, level.slab.x + level.slab.width / 2);
    minZ = Math.min(minZ, level.slab.z - level.slab.depth / 2);
    maxZ = Math.max(maxZ, level.slab.z + level.slab.depth / 2);
    (level.outdoorAreas ?? []).forEach((area) => {
      minX = Math.min(minX, area.x - area.width / 2);
      maxX = Math.max(maxX, area.x + area.width / 2);
      minZ = Math.min(minZ, area.z - area.depth / 2);
      maxZ = Math.max(maxZ, area.z + area.depth / 2);
    });
  });
  if (!Number.isFinite(minX)) return { minX: -5, maxX: 5, minZ: -4, maxZ: 4, centerX: 0, centerZ: 0 };
  return { minX, maxX, minZ, maxZ, centerX: (minX + maxX) / 2, centerZ: (minZ + maxZ) / 2 };
}

export function stairwellOpening(level: Level): StairwellOpening | null {
  const stair = [...(level.stairs ?? [])].sort((a, b) => b.confidence - a.confidence)[0];
  if (!stair) return null;
  const width = clamp(stair.width * 1.1, 1.4, 2.8);
  const depth = clamp(stair.depth * 0.94, 2, 3.25);
  const halfWidth = level.slab.width / 2;
  const halfDepth = level.slab.depth / 2;
  return {
    x: clamp(stair.x, level.slab.x - halfWidth + width / 2 + 0.08, level.slab.x + halfWidth - width / 2 - 0.08),
    z: clamp(stair.z, level.slab.z - halfDepth + depth / 2 + 0.08, level.slab.z + halfDepth - depth / 2 - 0.08),
    width,
    depth,
  };
}

export function slabPieces(level: Level, opening: StairwellOpening | null): SlabPiece[] {
  if (!opening) return [{ id: "whole", ...level.slab }];
  const left = level.slab.x - level.slab.width / 2;
  const right = level.slab.x + level.slab.width / 2;
  const back = level.slab.z - level.slab.depth / 2;
  const front = level.slab.z + level.slab.depth / 2;
  const openingLeft = clamp(opening.x - opening.width / 2, left, right);
  const openingRight = clamp(opening.x + opening.width / 2, left, right);
  const openingBack = clamp(opening.z - opening.depth / 2, back, front);
  const openingFront = clamp(opening.z + opening.depth / 2, back, front);
  const pieces: SlabPiece[] = [];
  const add = (id: string, minX: number, maxX: number, minZ: number, maxZ: number) => {
    if (maxX - minX <= 0.04 || maxZ - minZ <= 0.04) return;
    pieces.push({ id, x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, width: maxX - minX, depth: maxZ - minZ });
  };
  add("left", left, openingLeft, back, front);
  add("right", openingRight, right, back, front);
  add("back", openingLeft, openingRight, back, openingBack);
  add("front", openingLeft, openingRight, openingFront, front);
  return pieces;
}

/** Maps a slab fragment directly into the single cropped floorplan image. */
export function slabPieceTextureUv(level: Level, piece: SlabPiece): SlabPieceTextureUv {
  const slabLeft = level.slab.x - level.slab.width / 2;
  const slabBack = level.slab.z - level.slab.depth / 2;
  const pieceLeft = piece.x - piece.width / 2;
  const pieceRight = piece.x + piece.width / 2;
  const pieceBack = piece.z - piece.depth / 2;
  const pieceFront = piece.z + piece.depth / 2;
  const uLeft = clamp((pieceLeft - slabLeft) / level.slab.width, 0, 1);
  const uRight = clamp((pieceRight - slabLeft) / level.slab.width, 0, 1);
  // PlaneGeometry's upper UV row becomes the back edge after the floor plane
  // is rotated flat, so image-top is v=1 and image-bottom is v=0.
  const vBack = 1 - clamp((pieceBack - slabBack) / level.slab.depth, 0, 1);
  const vFront = 1 - clamp((pieceFront - slabBack) / level.slab.depth, 0, 1);
  return [uLeft, vBack, uRight, vBack, uLeft, vFront, uRight, vFront];
}

function stairEnds(stair: Stair) {
  if (stair.runAxis === "vertical") return {
    front: [stair.x, stair.z + stair.depth * 0.42] as [number, number],
    back: [stair.x, stair.z - stair.depth * 0.42] as [number, number],
  };
  return {
    front: [stair.x + stair.width * 0.42, stair.z] as [number, number],
    back: [stair.x - stair.width * 0.42, stair.z] as [number, number],
  };
}

/**
 * A flight that winds back on itself around a newel.
 *
 * The winder treads sweep a half turn, not a quarter: the long flight arrives,
 * the treads wrap right around the post, and the stair leaves heading back the
 * way it came on the other side of it — the two legs parallel, one much shorter
 * than the other. The half-turn built below has that topology but places its
 * legs from the shaft's own proportions, which puts them symmetrically. Taking
 * them from the winder and the flight instead gives the legs the plan actually
 * shows: the long one on the flight's line, the short one across the part of
 * the winder the flight does not cover.
 */
function windingTurnConnection(
  lowerLevelId: string,
  upperLevelId: string,
  lowerStair: Stair,
  turn: { winder: NonNullable<Stair["winder"]>; flight: NonNullable<Stair["flight"]> },
  opening: StairwellOpening,
  fromElevation: number,
  toElevation: number,
): StairConnection | null {
  const { winder, flight } = turn;
  const vertical = lowerStair.runAxis === "vertical";
  // Along the run: the flight climbs towards the winder.
  const flightRunCenter = vertical ? flight.z : flight.x;
  const winderRunCenter = vertical ? winder.z : winder.x;
  const flightRunHalf = (vertical ? flight.depth : flight.width) / 2;
  const winderRunHalf = (vertical ? winder.depth : winder.width) / 2;
  const towardsWinder = Math.sign(winderRunCenter - flightRunCenter) || -1;

  // Across it: the two legs sit either side of the newel. The long one is on
  // the flight's line; the short one runs back down the strip of the winder the
  // flight leaves clear, which is the side the treads wind towards.
  const flightCross = vertical ? flight.x : flight.z;
  const flightCrossHalf = (vertical ? flight.width : flight.depth) / 2;
  const winderCross = vertical ? winder.x : winder.z;
  const winderCrossHalf = (vertical ? winder.width : winder.depth) / 2;
  const winderLow = winderCross - winderCrossHalf;
  const winderHigh = winderCross + winderCrossHalf;
  const flightLow = flightCross - flightCrossHalf;
  const flightHigh = flightCross + flightCrossHalf;
  const lowGap = flightLow - winderLow;
  const highGap = winderHigh - flightHigh;
  const returnsLow = lowGap >= highGap;
  const gap = Math.max(lowGap, highGap);
  if (gap < 0.35) return null;
  const width = Math.max(0.55, Math.min(flightCrossHalf * 2, gap));
  const shortCross = returnsLow ? winderLow + width / 2 : winderHigh - width / 2;

  // The turn is at the far edge of the winder; both legs meet there.
  const turnPoint = winderRunCenter + towardsWinder * winderRunHalf;
  const foot = flightRunCenter - towardsWinder * flightRunHalf;
  const shortEnd = winderRunCenter - towardsWinder * winderRunHalf;
  const runLength = Math.abs(turnPoint - foot);
  const sweepLength = Math.abs(shortEnd - turnPoint);
  if (runLength < 0.4 || sweepLength < 0.3) return null;

  // How many steps there are follows from the height climbed, at a normal
  // riser. Counting the tread lines instead over-counts badly: the plan draws
  // the flight below the cut as well, which on the reference plan gave a
  // staircase of twenty-four steps for a rise that needs seventeen.
  const rise = toElevation - fromElevation;
  const steps = Math.max(6, Math.round(rise / 0.18));
  const total = runLength + sweepLength;
  const flightSteps = Math.max(3, Math.round(steps * (runLength / total)));
  const sweepSteps = Math.max(2, steps - flightSteps);
  const cornerElevation = fromElevation
    + (toElevation - fromElevation) * (flightSteps / Math.max(1, flightSteps + sweepSteps));

  const point = (along: number, across: number): [number, number] => (
    vertical ? [across, along] : [along, across]
  );
  return {
    id: `${lowerLevelId}-to-${upperLevelId}`,
    lowerLevelId,
    upperLevelId,
    opening,
    width,
    lowerFlight: {
      start: point(foot, flightCross),
      end: point(turnPoint, flightCross),
      fromElevation,
      toElevation: cornerElevation,
      stepCount: flightSteps,
    },
    upperFlight: {
      start: point(turnPoint, shortCross),
      end: point(shortEnd, shortCross),
      fromElevation: cornerElevation,
      toElevation,
      stepCount: sweepSteps,
    },
    // The winders themselves, bridging the two legs around the newel.
    landing: {
      x: vertical ? (flightCross + shortCross) / 2 : turnPoint,
      z: vertical ? turnPoint : (flightCross + shortCross) / 2,
      width: vertical ? Math.abs(flightCross - shortCross) + width : width,
      depth: vertical ? width : Math.abs(flightCross - shortCross) + width,
      elevation: cornerElevation,
    },
  };
}

export function buildStairConnections(levels: Level[], explodeDistance = 0): StairConnection[] {
  const ordered = levels
    .map((level, index) => ({ level, index }))
    .sort((a, b) => a.level.elevation - b.level.elevation);
  const connections: StairConnection[] = [];

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const lower = ordered[index];
    const upper = ordered[index + 1];
    const candidates = (lower.level.stairs ?? []).flatMap((lowerStair) => (
      (upper.level.stairs ?? []).map((upperStair) => ({
        lowerStair,
        upperStair,
        distance: Math.hypot(lowerStair.x - upperStair.x, lowerStair.z - upperStair.z),
      }))
    )).sort((a, b) => a.distance - b.distance || (b.lowerStair.confidence + b.upperStair.confidence) - (a.lowerStair.confidence + a.upperStair.confidence));
    const pair = candidates[0];
    if (!pair) continue;
    const lowerCross = pair.lowerStair.runAxis === "vertical" ? pair.lowerStair.width : pair.lowerStair.depth;
    const upperCross = pair.upperStair.runAxis === "vertical" ? pair.upperStair.width : pair.upperStair.depth;
    const lowerEnds = stairEnds(pair.lowerStair);
    const upperEnds = stairEnds(pair.upperStair);
    const opening = stairwellOpening(upper.level);
    if (!opening) continue;
    const fromElevation = lower.level.elevation + lower.index * explodeDistance + 0.06;
    const toElevation = upper.level.elevation + upper.index * explodeDistance + 0.04;

    // Where the plan shows a turn, build the stair that was drawn rather than
    // the half-turn assumed below. The upper floor's reading is preferred: it
    // shows the sweep arriving, where the lower floor shows it cut through.
    const turn = (pair.upperStair.winder && pair.upperStair.flight
      ? { winder: pair.upperStair.winder, flight: pair.upperStair.flight }
      : pair.lowerStair.winder && pair.lowerStair.flight
        ? { winder: pair.lowerStair.winder, flight: pair.lowerStair.flight }
        : null);
    if (turn) {
      const winding = windingTurnConnection(
        lower.level.id,
        upper.level.id,
        pair.lowerStair,
        turn,
        opening,
        fromElevation,
        toElevation,
      );
      if (winding) { connections.push(winding); continue; }
    }

    const landingElevation = (fromElevation + toElevation) / 2;
    const verticalRun = pair.lowerStair.runAxis === "vertical" && pair.upperStair.runAxis === "vertical";
    const clearance = 0.08;
    const crossSize = verticalRun ? opening.width : opening.depth;
    const runSize = verticalRun ? opening.depth : opening.width;
    const availableCross = Math.max(1.16, crossSize - clearance * 2);
    const baseFlightWidth = clamp(Math.min(lowerCross, upperCross) * 0.5, 0.72, 1.18);
    const flightWidth = Math.max(0.56, Math.min(baseFlightWidth, availableCross / 2));
    const detectedSeparation = verticalRun
      ? Math.abs(lowerEnds.front[0] - upperEnds.front[0])
      : Math.abs(lowerEnds.front[1] - upperEnds.front[1]);
    const desiredSeparation = detectedSeparation > flightWidth * 0.35 ? detectedSeparation : flightWidth * 0.96;
    const laneSeparation = clamp(desiredSeparation, flightWidth * 0.72, Math.max(flightWidth * 0.72, availableCross - flightWidth));
    const crossDelta = verticalRun
      ? lowerEnds.front[0] - upperEnds.front[0]
      : lowerEnds.front[1] - upperEnds.front[1];
    // Normalized shafts can differ by floating-point dust. Treat them as
    // aligned so the lower flight consistently starts on the right-hand lane.
    const laneDirection = Math.abs(crossDelta) > 0.04 ? Math.sign(crossDelta) : 1;
    const crossCenter = verticalRun ? opening.x : opening.z;
    const lowerLane = crossCenter + laneDirection * laneSeparation / 2;
    const upperLane = crossCenter - laneDirection * laneSeparation / 2;
    const landingRun = Math.min(flightWidth * 1.08, Math.max(0.62, runSize * 0.34));
    const openingRear = verticalRun ? opening.z - opening.depth / 2 : opening.x - opening.width / 2;
    const openingFront = verticalRun ? opening.z + opening.depth / 2 : opening.x + opening.width / 2;
    const landingRear = openingRear + clearance;
    const landingCenter = landingRear + landingRun / 2;
    const landingJoint = landingRear + landingRun;
    const flightFrontLimit = openingFront - clearance;
    // Extend the lower flight to the detected lower-stair extent (it may span
    // more steps than the upper flight). Cap at an arbitrary comfortable limit
    // so the stair never punches too far out of the slab.
    const detectedLowerFront = verticalRun ? lowerEnds.front[1] : lowerEnds.front[0];
    const maxLowerExtension = (verticalRun ? opening.depth : opening.width) * 1.6;
    // When the direction arrow was detected and says the "start" end ascends,
    // the stair goes the opposite way: the flight bottom is at the BACK of the
    // detected stair box rather than the front. Flip lowerFront accordingly.
    const lowerAscendAtStart = pair.lowerStair.ascend === "start";
    const detectedLowerBack = verticalRun ? lowerEnds.back[1] : lowerEnds.back[0];
    const rawLowerFront = lowerAscendAtStart ? detectedLowerBack : detectedLowerFront;
    const lowerFront = Math.min(
      Math.max(rawLowerFront, flightFrontLimit),
      openingFront + maxLowerExtension,
    );
    // The last tread is the upper-floor landing: it must meet the slab edge,
    // rather than stop at the shorter linework detected inside the stair symbol.
    const upperFront = openingFront;
    // Allocate step counts proportionally to each flight's run length, so the
    // longer ground-floor flight gets more treads.
    const lowerRunLength = Math.abs(lowerFront - landingJoint);
    const upperRunLength = Math.abs(upperFront - landingJoint);
    const totalRun = lowerRunLength + upperRunLength;
    const totalSteps = pair.lowerStair.stepCount + pair.upperStair.stepCount;
    const lowerStepShare = totalRun > 0.01 ? lowerRunLength / totalRun : 0.5;
    const lowerSteps = Math.round(clamp(totalSteps * lowerStepShare, 6, 14));
    const upperSteps = Math.round(clamp((toElevation - landingElevation) / 0.19, 4, 10));
    const lowerStart: [number, number] = verticalRun ? [lowerLane, lowerFront] : [lowerFront, lowerLane];
    const lowerLanding: [number, number] = verticalRun ? [lowerLane, landingJoint] : [landingJoint, lowerLane];
    const upperLanding: [number, number] = verticalRun ? [upperLane, landingJoint] : [landingJoint, upperLane];
    const upperEnd: [number, number] = verticalRun ? [upperLane, upperFront] : [upperFront, upperLane];
    const landingSpan = laneSeparation + flightWidth;
    connections.push({
      id: `${lower.level.id}-to-${upper.level.id}`,
      lowerLevelId: lower.level.id,
      upperLevelId: upper.level.id,
      opening,
      width: flightWidth,
      lowerFlight: { start: lowerStart, end: lowerLanding, fromElevation, toElevation: landingElevation, stepCount: lowerSteps },
      upperFlight: { start: upperLanding, end: upperEnd, fromElevation: landingElevation, toElevation, stepCount: upperSteps },
      landing: {
        x: verticalRun ? crossCenter : landingCenter,
        z: verticalRun ? landingCenter : crossCenter,
        width: verticalRun ? landingSpan : landingRun,
        depth: verticalRun ? landingRun : landingSpan,
        elevation: landingElevation,
      },
    });
  }
  return connections;
}
