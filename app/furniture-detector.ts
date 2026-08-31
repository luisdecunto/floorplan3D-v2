/**
 * Furniture / fixture symbol detector.
 *
 * Each detector is independent and conservative: it only fires when the
 * evidence meets a measured threshold. Ambiguous regions produce nothing
 * (fallback = no fixture) rather than a wrong fixture. All sizes are expressed
 * relative to wallThickness so they are resolution-independent.
 *
 * To suppress the false positives that previously disabled the bordered-box
 * detectors, every fixture candidate is validated against two spatial
 * constraints before being accepted:
 * 1. It must lie inside a detected room polygon (filters text labels and
 *    dimension annotations that sit outside the interior).
 * 2. Where appropriate (sinks, fridges, showers, toilets, cupboards,
 *    countertops) it must be adjacent to a wall — real fixtures sit against
 *    walls, window mullions and text boxes don't.
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

/** Pixel-space wall segment. Only axis and endpoints are needed. */
type WallSegment = {
  axis: "horizontal" | "vertical";
  start: [number, number];
  end: [number, number];
  thickness: number;
};

/** Pixel-space room bounding box for "is this fixture inside a room?" checks. */
type RoomBox = {
  polygon: [number, number][];
};

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

// ---------------------------------------------------------------------------
// Spatial validation helpers
// ---------------------------------------------------------------------------

/** Point-in-polygon (bounding-box approximation for axis-aligned room boxes). */
function insideRoom(px: number, py: number, rooms: RoomBox[]): boolean {
  for (const room of rooms) {
    const xs = room.polygon.map((p) => p[0]);
    const ys = room.polygon.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    if (px >= minX && px <= maxX && py >= minY && py <= maxY) return true;
  }
  return false;
}

/**
 * True when a fixture centre is within `margin` pixels of any wall's
 * centreline span. Covers fixtures that sit flush against a wall — the
 * normal case for kitchens, bathrooms, and closets.
 */
function adjacentToWall(fx: number, fy: number, fw: number, fh: number, walls: WallSegment[], margin: number): boolean {
  const fMinX = fx - fw / 2;
  const fMinY = fy - fh / 2;
  const fMaxX = fx + fw / 2;
  const fMaxY = fy + fh / 2;
  for (const wall of walls) {
    const wMinX = Math.min(wall.start[0], wall.end[0]) - wall.thickness / 2;
    const wMaxX = Math.max(wall.start[0], wall.end[0]) + wall.thickness / 2;
    const wMinY = Math.min(wall.start[1], wall.end[1]) - wall.thickness / 2;
    const wMaxY = Math.max(wall.start[1], wall.end[1]) + wall.thickness / 2;
    // Check that fixture overlaps the wall's run-axis span, then is close
    // on the cross-axis.
    if (wall.axis === "horizontal") {
      if (fMaxX < wMinX || fMinX > wMaxX) continue;
      if (Math.abs(fy - (wMinY + wMaxY) / 2) < fh / 2 + margin) return true;
    } else {
      if (fMaxY < wMinY || fMinY > wMaxY) continue;
      if (Math.abs(fx - (wMinX + wMaxX) / 2) < fw / 2 + margin) return true;
    }
  }
  return false;
}

/** Find the nearest wall to a fixture centre and return its axis for rotation. */
function nearestWallRotation(fx: number, fy: number, walls: WallSegment[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (const wall of walls) {
    const mid = [(wall.start[0] + wall.end[0]) / 2, (wall.start[1] + wall.end[1]) / 2];
    const d = Math.hypot(fx - mid[0], fy - mid[1]);
    if (d < bestDist) {
      bestDist = d;
      if (wall.axis === "horizontal") {
        best = fy < mid[1] ? 0 : Math.PI;
      } else {
        best = fx < mid[0] ? Math.PI / 2 : -Math.PI / 2;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

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
          const aspect = Math.max(xSpan, ySpan) / Math.max(1, Math.min(xSpan, ySpan));
          if (aspect > 1.8) continue;
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
    const cisternW = c.r * 1.4;
    const cisternH = c.r * 0.7;
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
          const innerD = density(mask, imgW, x0 + m, y0 + m, x1 - m, y1 - m);
          if (innerD > 0.18) continue;
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
 * Fridge: a box whose interior contains two diagonal strokes forming an X.
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
          const borderDensity = (
            density(mask, imgW, x0, y0, x1, y0 + 2) +
            density(mask, imgW, x0, y1 - 2, x1, y1) +
            density(mask, imgW, x0, y0, x0 + 2, y1) +
            density(mask, imgW, x1 - 2, y0, x1, y1)
          ) / 4;
          if (borderDensity < 0.25) continue;
          const m = 3;
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
  return deduplicateFixtures(results);
}

/**
 * Built-in cupboard / wardrobe: an elongated bordered rectangle (aspect
 * ratio 2–7) whose interior is mostly clear or has regularly spaced thin
 * dividers (shelf lines). Must sit flush against a wall.
 */
export function detectCupboards(
  mask: Uint8Array,
  imgW: number,
  footprint: Bounds,
  wallThickness: number,
): DetectedFixture[] {
  const minShort = wallThickness * 0.8;
  const maxShort = wallThickness * 2.2;
  const minLong = wallThickness * 2.5;
  const maxLong = wallThickness * 9;
  const step = Math.max(2, Math.round(wallThickness * 0.45));
  const results: DetectedFixture[] = [];

  for (let y0 = Math.round(footprint.minY); y0 < Math.round(footprint.maxY) - Math.round(minShort); y0 += step) {
    for (let x0 = Math.round(footprint.minX); x0 < Math.round(footprint.maxX) - Math.round(minShort); x0 += step) {
      for (const [w, h] of [[minShort, minLong], [minLong, minShort]] as const) {
        for (let dw = 0; dw <= Math.round(Math.max(maxShort - w, maxLong - w)); dw += step) {
          for (let dh = 0; dh <= Math.round(Math.max(maxShort - h, maxLong - h)); dh += step) {
            const cw = Math.round(w + dw);
            const ch = Math.round(h + dh);
            const x1 = x0 + cw; const y1 = y0 + ch;
            if (x1 > footprint.maxX || y1 > footprint.maxY) continue;
            const aspect = Math.max(cw, ch) / Math.max(1, Math.min(cw, ch));
            if (aspect < 1.8 || aspect > 7) continue;
            // Short side must be cupboard-depth (0.4–1.2× wallThickness)
            const shortSide = Math.min(cw, ch);
            if (shortSide < minShort || shortSide > maxShort) continue;
            const longSide = Math.max(cw, ch);
            if (longSide < minLong || longSide > maxLong) continue;
            const m = 2;
            const borderD = (
              density(mask, imgW, x0, y0, x1, y0 + m) +
              density(mask, imgW, x0, y1 - m, x1, y1) +
              density(mask, imgW, x0, y0, x0 + m, y1) +
              density(mask, imgW, x1 - m, y0, x1, y1)
            ) / 4;
            if (borderD < 0.20) continue;
            const innerD = density(mask, imgW, x0 + m, y0 + m, x1 - m, y1 - m);
            // Cupboard interiors have shelves/dividers — allow higher ink than
            // an empty shower, but not solid fill.
            if (innerD > 0.30 || innerD < 0.01) continue;
            results.push({
              id: `cupboard-${results.length + 1}`,
              kind: "cupboard",
              x: (x0 + x1) / 2, y: (y0 + y1) / 2,
              width: cw, height: ch,
              rotation: 0,
              confidence: clamp(0.52 + borderD * 0.2 + (aspect > 2.5 ? 0.08 : 0), 0.52, 0.78),
            });
          }
        }
      }
    }
  }
  return deduplicateFixtures(results);
}

/**
 * Kitchen countertop: a long narrow rectangle (aspect 3+) against a wall,
 * with relatively high interior density (hatching/fill pattern common in
 * architectural drawings for counter surfaces). Must be wall-adjacent.
 */
export function detectCountertops(
  mask: Uint8Array,
  imgW: number,
  footprint: Bounds,
  wallThickness: number,
): DetectedFixture[] {
  const minShort = wallThickness * 0.9;
  const maxShort = wallThickness * 2.5;
  const minLong = wallThickness * 3;
  const maxLong = wallThickness * 12;
  const step = Math.max(2, Math.round(wallThickness * 0.5));
  const results: DetectedFixture[] = [];

  for (let y0 = Math.round(footprint.minY); y0 < Math.round(footprint.maxY) - Math.round(minShort); y0 += step) {
    for (let x0 = Math.round(footprint.minX); x0 < Math.round(footprint.maxX) - Math.round(minShort); x0 += step) {
      for (const [w, h] of [[minShort, minLong], [minLong, minShort]] as const) {
        for (let dw = 0; dw <= Math.round(Math.max(maxShort - w, maxLong - w)); dw += step) {
          for (let dh = 0; dh <= Math.round(Math.max(maxShort - h, maxLong - h)); dh += step) {
            const cw = Math.round(w + dw);
            const ch = Math.round(h + dh);
            const x1 = x0 + cw; const y1 = y0 + ch;
            if (x1 > footprint.maxX || y1 > footprint.maxY) continue;
            const aspect = Math.max(cw, ch) / Math.max(1, Math.min(cw, ch));
            if (aspect < 2.5) continue;
            const shortSide = Math.min(cw, ch);
            if (shortSide < minShort || shortSide > maxShort) continue;
            const longSide = Math.max(cw, ch);
            if (longSide < minLong || longSide > maxLong) continue;
            const m = 2;
            // Countertops typically have a solid outline or fill
            const borderD = (
              density(mask, imgW, x0, y0, x1, y0 + m) +
              density(mask, imgW, x0, y1 - m, x1, y1) +
              density(mask, imgW, x0, y0, x0 + m, y1) +
              density(mask, imgW, x1 - m, y0, x1, y1)
            ) / 4;
            if (borderD < 0.18) continue;
            const innerD = density(mask, imgW, x0 + m, y0 + m, x1 - m, y1 - m);
            // Counter surface has visible fill/hatching — higher density than
            // an empty fixture, but not a completely solid block.
            if (innerD < 0.08 || innerD > 0.55) continue;
            results.push({
              id: `countertop-${results.length + 1}`,
              kind: "countertop",
              x: (x0 + x1) / 2, y: (y0 + y1) / 2,
              width: cw, height: ch,
              rotation: 0,
              confidence: clamp(0.50 + innerD * 0.3 + (aspect > 4 ? 0.06 : 0), 0.50, 0.74),
            });
          }
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
 * obstacle (stair shaft or wall corridor), validates spatial constraints
 * (inside a room, adjacent to a wall where appropriate), deduplicates across
 * types, and returns at most `maxFixtures` results.
 */
export function detectFurniture(
  mask: Uint8Array,
  imgW: number,
  footprint: Bounds,
  wallThickness: number,
  obstacles: FixtureObstacle[] = [],
  maxFixtures = 24,
  walls: WallSegment[] = [],
  rooms: RoomBox[] = [],
): DetectedFixture[] {
  const wallMargin = wallThickness * 1.5;
  const hasRooms = rooms.length > 0;
  const hasWalls = walls.length > 0;

  const validate = (f: DetectedFixture, requireWall: boolean): boolean => {
    if (hasRooms && !insideRoom(f.x, f.y, rooms)) return false;
    if (requireWall && hasWalls && !adjacentToWall(f.x, f.y, f.width, f.height, walls, wallMargin)) return false;
    return true;
  };

  const assignRotation = (f: DetectedFixture): DetectedFixture => {
    if (hasWalls && f.rotation === 0) {
      return { ...f, rotation: nearestWallRotation(f.x, f.y, walls) };
    }
    return f;
  };

  const stoves = detectStoves(mask, imgW, footprint, wallThickness)
    .filter((f) => validate(f, false));
  const toilets = detectToilets(mask, imgW, footprint, wallThickness)
    .filter((f) => validate(f, true));
  const showers = detectShowersAndBathtubs(mask, imgW, footprint, wallThickness)
    .filter((f) => validate(f, true));
  const sinks = detectSinks(mask, imgW, footprint, wallThickness)
    .filter((f) => validate(f, true));
  const fridges = detectFridges(mask, imgW, footprint, wallThickness)
    .filter((f) => validate(f, true));
  const cupboards = detectCupboards(mask, imgW, footprint, wallThickness)
    .filter((f) => validate(f, true));
  const countertops = detectCountertops(mask, imgW, footprint, wallThickness)
    .filter((f) => validate(f, true));

  const all: DetectedFixture[] = [
    ...stoves.map(assignRotation),
    ...toilets.map(assignRotation),
    ...showers.map(assignRotation),
    ...sinks.map(assignRotation),
    ...fridges.map(assignRotation),
    ...cupboards.map(assignRotation),
    ...countertops.map(assignRotation),
  ];

  const cleared = obstacles.length ? all.filter((f) => !overlapsObstacle(f, obstacles)) : all;
  const renumbered = cleared.map((f, i) => ({ ...f, id: `fixture-${i + 1}` }));
  return deduplicateFixtures(renumbered).slice(0, maxFixtures);
}
