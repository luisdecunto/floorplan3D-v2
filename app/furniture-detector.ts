/**
 * Furniture / fixture symbol detector.
 *
 * Each detector is independent and conservative: it only fires when the
 * evidence meets a measured threshold. Ambiguous regions produce nothing
 * (fallback = no fixture) rather than a wrong fixture. All sizes are expressed
 * relative to wallThickness so they are resolution-independent.
 */

export type DetectedFixture = {
  id: string;
  kind: "fridge" | "stove" | "sink" | "island" | "cupboard" | "toilet" | "shower" | "bathtub" | "washer" | "countertop";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  confidence: number;
};

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

/** Count ink pixels inside a rectangular region. */
function inkCount(mask: Uint8Array, imgW: number, x0: number, y0: number, x1: number, y1: number): number {
  let count = 0;
  for (let y = Math.max(0, Math.round(y0)); y <= Math.min(mask.length / imgW - 1, Math.round(y1)); y += 1) {
    for (let x = Math.max(0, Math.round(x0)); x <= Math.min(imgW - 1, Math.round(x1)); x += 1) {
      if (mask[y * imgW + x]) count += 1;
    }
  }
  return count;
}

/** Approximate ink density in a box. */
function density(mask: Uint8Array, imgW: number, x0: number, y0: number, x1: number, y1: number): number {
  const area = Math.max(1, (x1 - x0) * (y1 - y0));
  return inkCount(mask, imgW, x0, y0, x1, y1) / area;
}

/**
 * Scan for small circles by measuring ink on a thin ring at each candidate
 * centre. Returns (cx, cy, radius) triples that pass the ring test.
 */
function findCircles(
  mask: Uint8Array,
  imgW: number,
  bounds: Bounds,
  minR: number,
  maxR: number,
  stepR: number,
  maxResults = 80,
): Array<{ cx: number; cy: number; r: number }> {
  const imgH = mask.length / imgW;
  const results: Array<{ cx: number; cy: number; r: number }> = [];
  const posStep = Math.max(2, Math.round(minR));
  for (let cy = Math.round(bounds.minY + minR); cy <= Math.round(bounds.maxY - minR); cy += posStep) {
    for (let cx = Math.round(bounds.minX + minR); cx <= Math.round(bounds.maxX - minR); cx += posStep) {
      for (let r = Math.round(minR); r <= Math.round(maxR); r += Math.max(1, Math.round(stepR))) {
        const samples = Math.max(8, Math.round(2 * Math.PI * r));
        let ringInk = 0;
        let innerInk = 0;
        for (let i = 0; i < samples; i += 1) {
          const theta = (2 * Math.PI * i) / samples;
          const rx = Math.round(cx + r * Math.cos(theta));
          const ry = Math.round(cy + r * Math.sin(theta));
          if (rx >= 0 && rx < imgW && ry >= 0 && ry < imgH && mask[ry * imgW + rx]) ringInk += 1;
          const irx = Math.round(cx + r * 0.5 * Math.cos(theta));
          const iry = Math.round(cy + r * 0.5 * Math.sin(theta));
          if (irx >= 0 && irx < imgW && iry >= 0 && iry < imgH && mask[iry * imgW + irx]) innerInk += 1;
        }
        if (ringInk / samples >= 0.38 && innerInk / samples <= 0.22) {
          results.push({ cx, cy, r });
          if (results.length >= maxResults) return results;
          break;
        }
      }
    }
  }
  return results;
}

/**
 * Stove / cooktop: look for 4 circles arranged in a 2×2 grid.
 * The grid's bounding box should be roughly square with side ~3–8× wallThickness.
 */
export function detectStoves(
  mask: Uint8Array,
  imgW: number,
  footprint: Bounds,
  wallThickness: number,
): DetectedFixture[] {
  const minR = Math.max(1.5, wallThickness * 0.18);
  const maxR = wallThickness * 0.55;
  const circles = findCircles(mask, imgW, footprint, minR, maxR, 0.5);
  if (circles.length < 4) return [];

  const results: DetectedFixture[] = [];
  // Try every combination of 4 circles and see if they fit a 2×2 grid.
  // circles is capped at 80 by findCircles so this is at most C(80,4) ≈ 1.5M.
  outer: for (let i = 0; i < circles.length - 3; i += 1) {
    for (let j = i + 1; j < circles.length - 2; j += 1) {
      for (let k = j + 1; k < circles.length - 1; k += 1) {
        for (let l = k + 1; l < circles.length; l += 1) {
          const quad = [circles[i], circles[j], circles[k], circles[l]];
          const xs = quad.map((c) => c.cx).sort((a, b) => a - b);
          const ys = quad.map((c) => c.cy).sort((a, b) => a - b);
          const xSpan = xs[3] - xs[0];
          const ySpan = ys[3] - ys[0];
          if (xSpan < minR * 2.5 || ySpan < minR * 2.5) continue;
          if (xSpan > wallThickness * 5 || ySpan > wallThickness * 5) continue;
          // Check roughly square
          const aspect = Math.max(xSpan, ySpan) / Math.max(1, Math.min(xSpan, ySpan));
          if (aspect > 1.8) continue;
          // Check that circles sit in two distinct columns and two rows
          const midX = (xs[1] + xs[2]) / 2;
          const midY = (ys[1] + ys[2]) / 2;
          const colGroups = quad.filter((c) => c.cx <= midX).length;
          const rowGroups = quad.filter((c) => c.cy <= midY).length;
          if (colGroups !== 2 || rowGroups !== 2) continue;
          const cx = (xs[0] + xs[3]) / 2;
          const cy = (ys[0] + ys[3]) / 2;
          results.push({
            id: `stove-${results.length + 1}`,
            kind: "stove",
            x: cx, y: cy,
            width: xSpan + quad[0].r * 2.4, height: ySpan + quad[0].r * 2.4,
            rotation: 0,
            confidence: 0.78,
          });
          if (results.length >= 4) break outer;
        }
      }
    }
  }
  return results;
}

/**
 * Fridge: a box whose interior contains two diagonal strokes forming an X.
 * The box sits against a wall, is portrait-ish (taller than wide), and the X
 * occupies most of its interior.
 */
export function detectFridges(
  mask: Uint8Array,
  imgW: number,
  footprint: Bounds,
  wallThickness: number,
): DetectedFixture[] {
  const minSide = wallThickness * 1.1;
  const maxSide = wallThickness * 3.2;
  const step = Math.max(1, Math.round(wallThickness * 0.4));
  const results: DetectedFixture[] = [];

  for (let y0 = Math.round(footprint.minY); y0 < Math.round(footprint.maxY) - Math.round(minSide); y0 += step) {
    for (let x0 = Math.round(footprint.minX); x0 < Math.round(footprint.maxX) - Math.round(minSide); x0 += step) {
      for (let w = Math.round(minSide); w <= Math.round(maxSide); w += step) {
        for (let h = Math.round(minSide); h <= Math.round(maxSide); h += step) {
          const x1 = x0 + w; const y1 = y0 + h;
          if (x1 > footprint.maxX || y1 > footprint.maxY) continue;
          const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));
          if (aspect > 2.0) continue;
          // Outer box border density (should have ink)
          const borderDensity = (
            density(mask, imgW, x0, y0, x1, y0 + 2) +
            density(mask, imgW, x0, y1 - 2, x1, y1) +
            density(mask, imgW, x0, y0, x0 + 2, y1) +
            density(mask, imgW, x1 - 2, y0, x1, y1)
          ) / 4;
          if (borderDensity < 0.25) continue;
          // Interior must have X diagonals: check 4 diagonal strips
          const m = 3;
          // Diagonal 1: top-left to bottom-right
          let d1 = 0; let d2 = 0;
          const steps = Math.round(Math.min(w, h) * 0.7);
          for (let s = 0; s < steps; s += 1) {
            const t = s / Math.max(1, steps - 1);
            const px1 = Math.round(x0 + m + t * (w - m * 2));
            const py1 = Math.round(y0 + m + t * (h - m * 2));
            const px2 = Math.round(x1 - m - t * (w - m * 2));
            const py2 = Math.round(y0 + m + t * (h - m * 2));
            if (px1 >= 0 && px1 < imgW && py1 >= 0 && py1 < mask.length / imgW && mask[py1 * imgW + px1]) d1 += 1;
            if (px2 >= 0 && px2 < imgW && py2 >= 0 && py2 < mask.length / imgW && mask[py2 * imgW + px2]) d2 += 1;
          }
          if (d1 / steps < 0.28 || d2 / steps < 0.28) continue;
          // Interior should be mostly clear except for the diagonals
          const interiorD = density(mask, imgW, x0 + m, y0 + m, x1 - m, y1 - m);
          if (interiorD > 0.35) continue;
          results.push({
            id: `fridge-${results.length + 1}`,
            kind: "fridge",
            x: x0 + w / 2, y: y0 + h / 2,
            width: w, height: h,
            rotation: 0,
            confidence: clamp(0.6 + (d1 + d2) / steps * 0.15, 0.6, 0.82),
          });
        }
      }
    }
  }
  // Deduplicate overlapping hits
  return deduplicateFixtures(results);
}

/**
 * Toilet: an elongated oval (the bowl) near a wall, often with a small
 * rectangle (cistern) attached. We look for a concentrated oval blob with
 * high ring density and an interior clear zone.
 */
export function detectToilets(
  mask: Uint8Array,
  imgW: number,
  footprint: Bounds,
  wallThickness: number,
): DetectedFixture[] {
  const minR = Math.max(2, wallThickness * 0.35);
  const maxR = wallThickness * 0.9;
  const circles = findCircles(mask, imgW, footprint, minR, maxR, 1);
  const results: DetectedFixture[] = [];
  for (const c of circles) {
    // Check for a small rectangle (cistern) adjacent to the oval
    const cisternW = c.r * 1.4;
    const cisternH = c.r * 0.7;
    // Look in all 4 cardinal directions for a cistern-shaped ink patch
    const dirs = [
      { dx: 0, dy: -(c.r + cisternH / 2 + 1) },
      { dx: 0, dy: c.r + cisternH / 2 + 1 },
      { dx: -(c.r + cisternW / 2 + 1), dy: 0 },
      { dx: c.r + cisternW / 2 + 1, dy: 0 },
    ];
    let hasCistern = false;
    let rotation = 0;
    for (const { dx, dy } of dirs) {
      const cx2 = c.cx + dx; const cy2 = c.cy + dy;
      const d = density(mask, imgW, cx2 - cisternW / 2, cy2 - cisternH / 2, cx2 + cisternW / 2, cy2 + cisternH / 2);
      if (d >= 0.15) {
        hasCistern = true;
        rotation = Math.atan2(dy, dx);
        break;
      }
    }
    if (!hasCistern) continue;
    results.push({
      id: `toilet-${results.length + 1}`,
      kind: "toilet",
      x: c.cx, y: c.cy,
      width: c.r * 2.1, height: c.r * 2.8,
      rotation,
      confidence: 0.72,
    });
  }
  return deduplicateFixtures(results);
}

/**
 * Sink basin: a basin-shaped rectangle with a clear interior and a small
 * drain dot at the centre. Can appear in kitchen or bathroom.
 */
export function detectSinks(
  mask: Uint8Array,
  imgW: number,
  footprint: Bounds,
  wallThickness: number,
): DetectedFixture[] {
  const minW = wallThickness * 0.6;
  const maxW = wallThickness * 2.4;
  const step = Math.max(1, Math.round(wallThickness * 0.35));
  const results: DetectedFixture[] = [];

  for (let y0 = Math.round(footprint.minY); y0 < Math.round(footprint.maxY) - Math.round(minW); y0 += step) {
    for (let x0 = Math.round(footprint.minX); x0 < Math.round(footprint.maxX) - Math.round(minW); x0 += step) {
      for (let w = Math.round(minW); w <= Math.round(maxW); w += step) {
        for (let h = Math.round(minW); h <= Math.round(maxW); h += step) {
          const x1 = x0 + w; const y1 = y0 + h;
          if (x1 > footprint.maxX || y1 > footprint.maxY) continue;
          const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));
          if (aspect > 1.9) continue;
          const m = 2;
          const borderD = (
            density(mask, imgW, x0, y0, x1, y0 + m) +
            density(mask, imgW, x0, y1 - m, x1, y1) +
            density(mask, imgW, x0, y0, x0 + m, y1) +
            density(mask, imgW, x1 - m, y0, x1, y1)
          ) / 4;
          if (borderD < 0.22) continue;
          // Interior mostly clear
          const innerD = density(mask, imgW, x0 + m, y0 + m, x1 - m, y1 - m);
          if (innerD > 0.18) continue;
          // Small drain dot near centre
          const drainR = Math.max(1, Math.round(Math.min(w, h) * 0.1));
          const dCx = (x0 + x1) / 2; const dCy = (y0 + y1) / 2;
          const drainD = density(mask, imgW, dCx - drainR, dCy - drainR, dCx + drainR, dCy + drainR);
          if (drainD < 0.08) continue;
          results.push({
            id: `sink-${results.length + 1}`,
            kind: "sink",
            x: (x0 + x1) / 2, y: (y0 + y1) / 2,
            width: w, height: h,
            rotation: 0,
            confidence: 0.65,
          });
        }
      }
    }
  }
  return deduplicateFixtures(results);
}

/**
 * Shower tray / bathtub: a larger clear rectangle (bigger than a sink) with
 * a solid border, typically in a bathroom corner or alcove.
 */
export function detectShowersAndBathtubs(
  mask: Uint8Array,
  imgW: number,
  footprint: Bounds,
  wallThickness: number,
): DetectedFixture[] {
  const minSide = wallThickness * 2.0;
  const maxSide = wallThickness * 5.0;
  const step = Math.max(2, Math.round(wallThickness * 0.5));
  const results: DetectedFixture[] = [];

  for (let y0 = Math.round(footprint.minY); y0 < Math.round(footprint.maxY) - Math.round(minSide); y0 += step) {
    for (let x0 = Math.round(footprint.minX); x0 < Math.round(footprint.maxX) - Math.round(minSide); x0 += step) {
      for (let w = Math.round(minSide); w <= Math.round(maxSide); w += step) {
        for (let h = Math.round(minSide); h <= Math.round(maxSide); h += step) {
          const x1 = x0 + w; const y1 = y0 + h;
          if (x1 > footprint.maxX || y1 > footprint.maxY) continue;
          const m = 2;
          const borderD = (
            density(mask, imgW, x0, y0, x1, y0 + m) +
            density(mask, imgW, x0, y1 - m, x1, y1) +
            density(mask, imgW, x0, y0, x0 + m, y1) +
            density(mask, imgW, x1 - m, y0, x1, y1)
          ) / 4;
          if (borderD < 0.28) continue;
          const innerD = density(mask, imgW, x0 + m, y0 + m, x1 - m, y1 - m);
          if (innerD > 0.14) continue;
          const kind: "shower" | "bathtub" = Math.max(w, h) > wallThickness * 3.5 ? "bathtub" : "shower";
          results.push({
            id: `${kind}-${results.length + 1}`,
            kind,
            x: (x0 + x1) / 2, y: (y0 + y1) / 2,
            width: w, height: h,
            rotation: 0,
            confidence: 0.60,
          });
        }
      }
    }
  }
  return deduplicateFixtures(results);
}

/** Remove fixtures whose bounding boxes overlap more than 60%. Keep the higher-confidence one. */
function deduplicateFixtures(fixtures: DetectedFixture[]): DetectedFixture[] {
  const kept: DetectedFixture[] = [];
  for (const f of [...fixtures].sort((a, b) => b.confidence - a.confidence)) {
    const overlaps = kept.some((k) => {
      const ix = Math.max(0, Math.min(f.x + f.width / 2, k.x + k.width / 2) - Math.max(f.x - f.width / 2, k.x - k.width / 2));
      const iy = Math.max(0, Math.min(f.y + f.height / 2, k.y + k.height / 2) - Math.max(f.y - f.height / 2, k.y - k.height / 2));
      const intersection = ix * iy;
      const smallest = Math.min(f.width * f.height, k.width * k.height);
      return intersection / Math.max(1, smallest) > 0.6;
    });
    if (!overlaps) kept.push(f);
  }
  return kept;
}

/**
 * A rectangle the furniture detector must avoid. Stair shafts (their treads
 * read as a grid of small boxes) and wall corridors (their corners read as
 * bordered boxes) are the dominant false-positive sources, so both are passed
 * in as obstacles and any fixture overlapping one is dropped.
 */
export type FixtureObstacle = { minX: number; minY: number; maxX: number; maxY: number };

/** Pixel-space wall segment for wall-strip scanning. */
export type DetectorWall = {
  axis: "horizontal" | "vertical";
  start: [number, number];
  end: [number, number];
  thickness: number;
};

/**
 * Wall-strip fixture detector: for each wall, scan a strip on each side and
 * find continuous runs of ink that indicate an attached fixture. This is the
 * core approach — instead of searching for random rectangles across the whole
 * footprint, we only look for structure that shares a border with a known wall.
 *
 * For each wall, we define a "strip" — a narrow band (maxDepth px deep)
 * parallel to the wall, starting just past the wall's edge. We walk along the
 * wall in steps and measure ink density in each cross-wall slice. A continuous
 * run of elevated density (above the threshold) that spans at least minRun px
 * is a fixture candidate.
 */
function detectWallStripFixtures(
  mask: Uint8Array,
  imgW: number,
  walls: DetectorWall[],
  wallThickness: number,
  footprint: Bounds,
): DetectedFixture[] {
  const imgH = mask.length / imgW;
  const maxDepth = Math.round(wallThickness * 3.5);
  const minDepth = Math.max(2, Math.round(wallThickness * 0.2));
  const minRun = Math.max(3, Math.round(wallThickness * 0.8));
  const densityThreshold = 0.02;
  const step = Math.max(1, Math.round(wallThickness * 0.25));
  const results: DetectedFixture[] = [];

  for (const wall of walls) {
    const wallLength = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    if (wallLength < minRun) continue;

    for (const side of [-1, 1] as const) {
      // For each side of the wall, scan the adjacent strip.
      // side = -1 means "left/above", +1 means "right/below"
      const profile: Array<{ pos: number; depth: number; density: number }> = [];

      for (let along = 0; along <= Math.round(wallLength); along += step) {
        const t = along / wallLength;
        const wx = wall.start[0] + t * (wall.end[0] - wall.start[0]);
        const wy = wall.start[1] + t * (wall.end[1] - wall.start[1]);

        // Measure cross-wall ink depth: how far does ink extend from the wall edge?
        let inkDepth = 0;
        let totalInk = 0;
        for (let d = 1; d <= maxDepth; d += 1) {
          const px = wall.axis === "horizontal" ? wx : wx + side * (wall.thickness / 2 + d);
          const py = wall.axis === "horizontal" ? wy + side * (wall.thickness / 2 + d) : wy;
          const ix = Math.round(px);
          const iy = Math.round(py);
          if (ix < 0 || ix >= imgW || iy < 0 || iy >= imgH) break;
          if (ix < footprint.minX || ix > footprint.maxX || iy < footprint.minY || iy > footprint.maxY) break;
          if (mask[iy * imgW + ix]) {
            totalInk += 1;
            inkDepth = d;
          }
        }
        const d = maxDepth > 0 ? totalInk / maxDepth : 0;
        profile.push({ pos: along, depth: inkDepth, density: d });
      }

      // Find continuous runs of elevated density
      let runStart = -1;
      let runDepths: number[] = [];
      for (let i = 0; i <= profile.length; i += 1) {
        const above = i < profile.length && profile[i].density >= densityThreshold && profile[i].depth >= minDepth;
        if (above) {
          if (runStart < 0) runStart = i;
          runDepths.push(profile[i].depth);
        } else if (runStart >= 0) {
          const runLength = (i - runStart) * step;
          if (runLength >= minRun) {
            const medianDepth = [...runDepths].sort((a, b) => a - b)[Math.floor(runDepths.length / 2)];
            const startAlong = profile[runStart].pos;
            const endAlong = profile[i - 1].pos;
            const midAlong = (startAlong + endAlong) / 2;
            const t = midAlong / wallLength;
            const cx = wall.start[0] + t * (wall.end[0] - wall.start[0]);
            const cy = wall.start[1] + t * (wall.end[1] - wall.start[1]);
            const fixtureDepth = Math.min(medianDepth, maxDepth);

            let fx: number, fy: number, fw: number, fh: number;
            if (wall.axis === "horizontal") {
              fx = cx;
              fy = cy + side * (wall.thickness / 2 + fixtureDepth / 2);
              fw = runLength;
              fh = fixtureDepth;
            } else {
              fx = cx + side * (wall.thickness / 2 + fixtureDepth / 2);
              fy = cy;
              fw = fixtureDepth;
              fh = runLength;
            }

            const aspect = Math.max(fw, fh) / Math.max(1, Math.min(fw, fh));
            const kind = classifyWallStrip(aspect, runLength, fixtureDepth, wallThickness);
            if (kind) {
              results.push({
                id: `ws-${results.length + 1}`,
                kind,
                x: fx, y: fy,
                width: fw, height: fh,
                rotation: 0,
                confidence: clamp(0.45 + aspect * 0.04 + runLength / wallLength * 0.2, 0.45, 0.82),
              });
            }
          }
          runStart = -1;
          runDepths = [];
        }
      }
    }
  }

  return deduplicateFixtures(results);
}

/** Classify a wall-strip run into a fixture kind based on its shape.
 * Currently permissive for diagnostic tuning — returns a kind for any
 * run that meets minimum size thresholds so we can see everything the
 * scanner finds on the plan review overlay. */
function classifyWallStrip(
  aspect: number,
  runLength: number,
  depth: number,
  wallThickness: number,
): DetectedFixture["kind"] | null {
  if (runLength >= wallThickness * 3 && aspect >= 2.0) {
    return "countertop";
  }
  if (runLength >= wallThickness * 1.5 && aspect >= 1.3) {
    return "cupboard";
  }
  // Catch-all for small wall-adjacent ink (sinks, appliances, etc.)
  if (runLength >= wallThickness * 0.8 && depth >= wallThickness * 0.2) {
    return "island";
  }
  return null;
}

/** True when a fixture's box overlaps any obstacle by more than `maxOverlap` of its own area. */
function overlapsObstacle(f: DetectedFixture, obstacles: FixtureObstacle[], maxOverlap = 0.2): boolean {
  const fMinX = f.x - f.width / 2;
  const fMinY = f.y - f.height / 2;
  const fMaxX = f.x + f.width / 2;
  const fMaxY = f.y + f.height / 2;
  const fArea = Math.max(1, f.width * f.height);
  for (const o of obstacles) {
    const ix = Math.max(0, Math.min(fMaxX, o.maxX) - Math.max(fMinX, o.minX));
    const iy = Math.max(0, Math.min(fMaxY, o.maxY) - Math.max(fMinY, o.minY));
    if ((ix * iy) / fArea > maxOverlap) return true;
  }
  return false;
}

/**
 * Top-level entry point. Runs all detectors, removes any hit that overlaps an
 * obstacle (stair shaft or wall corridor), deduplicates across types, and
 * returns at most `maxFixtures` results. When evidence is ambiguous nothing is
 * emitted — a missed fixture is preferable to a wrong one.
 */
export function detectFurniture(
  mask: Uint8Array,
  imgW: number,
  footprint: Bounds,
  wallThickness: number,
  obstacles: FixtureObstacle[] = [],
  maxFixtures = 24,
  walls: DetectorWall[] = [],
): DetectedFixture[] {
  const all: DetectedFixture[] = [
    ...detectStoves(mask, imgW, footprint, wallThickness),
  ];

  // Wall-strip detector: scan strips adjacent to each wall for attached
  // fixtures (countertops, cupboards). This replaces the brute-force
  // bordered-box detectors which produce too many false positives.
  if (walls.length > 0) {
    all.push(...detectWallStripFixtures(mask, imgW, walls, wallThickness, footprint));
  }

  const cleared = obstacles.length ? all.filter((f) => !overlapsObstacle(f, obstacles)) : all;
  const renumbered = cleared.map((f, i) => ({ ...f, id: `fixture-${i + 1}` }));
  return deduplicateFixtures(renumbered).slice(0, maxFixtures);
}
