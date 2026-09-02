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
  /**
   * Fraction of the ring that must carry ink. The default is permissive enough
   * to accept an arc; callers that need a genuinely closed circle — a hob
   * burner, say, rather than one side of a larger curve — should raise it.
   */
  minRingCoverage = 0.38,
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
        if (ringInk / samples >= minRingCoverage && innerInk / samples <= 0.22) {
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
/** Keep one representative per cluster of overlapping circle hits. */
function collapseCoincidentCircles<T extends { cx: number; cy: number; r: number }>(circles: T[]): T[] {
  const kept: T[] = [];
  for (const circle of circles) {
    const duplicate = kept.some((k) => (
      Math.hypot(k.cx - circle.cx, k.cy - circle.cy) <= Math.max(k.r, circle.r)
    ));
    if (!duplicate) kept.push(circle);
  }
  return kept;
}

export function detectStoves(
  mask: Uint8Array,
  imgW: number,
  footprint: Bounds,
  wallThickness: number,
  metresPerPixel?: number,
): DetectedFixture[] {
  const minR = Math.max(1.5, wallThickness * 0.18);
  const maxR = wallThickness * 0.55;
  // findCircles reports several near-identical hits around a single drawn ring.
  // Left as-is, four of those clustered around one circle satisfy the grid test
  // below and a lone round symbol — a WC pan is the usual one — reads as a hob.
  // Collapse coincident hits so only genuinely separate burners can pair up.
  const circles = collapseCoincidentCircles(
    findCircles(mask, imgW, footprint, minR, maxR, 0.5, 80, 0.72),
  );
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
          // A domestic hob is 0.3-0.95 m across. Without this the burner grid
          // can be assembled from unrelated round marks spread over a metre or
          // more of plan — stair nosings and fittings are the usual source.
          if (metresPerPixel) {
            const spanMetres = Math.max(xSpan, ySpan) * metresPerPixel;
            if (spanMetres < 0.22 || spanMetres > 0.85) continue;
          }
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
 * A basin is drawn inside its counter run, and a hob inside a worktop, so
 * containment is the expected layout for these pairs rather than a duplicate
 * detection. Overlap between them must not delete the inner fixture.
 */
function nestingIsExpected(a: DetectedFixture, b: DetectedFixture): boolean {
  const hosts = new Set(["countertop", "island", "cupboard"]);
  const inner = new Set(["sink", "stove"]);
  return (inner.has(a.kind) && hosts.has(b.kind)) || (inner.has(b.kind) && hosts.has(a.kind));
}

/** Remove fixtures whose bounding boxes overlap more than 60%. Keep the higher-confidence one. */
function deduplicateFixtures(fixtures: DetectedFixture[]): DetectedFixture[] {
  const kept: DetectedFixture[] = [];
  for (const f of [...fixtures].sort((a, b) => b.confidence - a.confidence)) {
    const overlaps = kept.some((k) => {
      if (nestingIsExpected(f, k)) return false;
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

/* ------------------------------------------------------------------ *
 * Connected-component fixture detector
 *
 * Plumbing fixtures are drawn as closed outlines: a shower tray is a hollow
 * square, a vanity is a long shallow rectangle, a toilet is a cistern box with
 * a rounded bowl hanging off it. Labelling connected ink components therefore
 * recovers the symbol's actual shape, where the older brute-force rectangle
 * sweep could only guess at boxes and fired on dimension text and wall
 * corners.
 *
 * Walls are erased before labelling: fixture outlines abut them, so without
 * that every symbol merges into one building-sized blob. Classification is
 * then done in metres via the door-derived project scale, so the thresholds
 * are real-world sizes ("a shower tray is 0.7-1.4 m square") rather than
 * pixel guesses that only hold at one resolution.
 * ------------------------------------------------------------------ */

/** A labelled blob of ink with the descriptors classification needs. */
export type InkComponent = {
  minX: number; minY: number; maxX: number; maxY: number;
  /** Ink pixel count. */
  area: number;
  width: number;
  height: number;
  /** area / bounding-box area — outlines are low, filled glyphs are high. */
  fill: number;
  /** Fraction of each bbox side carrying component ink. */
  sides: { top: number; bottom: number; left: number; right: number };
  /** Which sides sit flush against an erased wall band. */
  onWall: { top: boolean; bottom: boolean; left: boolean; right: boolean };
  /** `sides`, with wall-backed edges counted as fully covered. */
  effectiveSides: { top: number; bottom: number; left: number; right: number };
  /** Ink density strictly inside the bbox — hollow symbols are near zero. */
  interior: number;
  /** True when all four sides are well covered: a closed rectangle. */
  closedRect: boolean;
};

/** Paint wall bands out of a copy of the mask so fixtures separate from them. */
function eraseWalls(mask: Uint8Array, imgW: number, imgH: number, walls: DetectorWall[]): Uint8Array {
  const work = Uint8Array.from(mask);
  for (const wall of walls) {
    const half = wall.thickness / 2 + 1;
    const minX = Math.max(0, Math.floor(Math.min(wall.start[0], wall.end[0]) - half));
    const maxX = Math.min(imgW - 1, Math.ceil(Math.max(wall.start[0], wall.end[0]) + half));
    const minY = Math.max(0, Math.floor(Math.min(wall.start[1], wall.end[1]) - half));
    const maxY = Math.min(imgH - 1, Math.ceil(Math.max(wall.start[1], wall.end[1]) + half));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) work[y * imgW + x] = 0;
    }
  }
  return work;
}

/** Flood-fill label every 8-connected ink blob inside `bounds`. */
function labelComponents(
  work: Uint8Array,
  imgW: number,
  imgH: number,
  bounds: Bounds,
  minArea: number,
  maxComponents: number,
): { labels: Int32Array; boxes: Array<{ id: number; minX: number; minY: number; maxX: number; maxY: number; area: number }> } {
  const labels = new Int32Array(imgW * imgH);
  const boxes: Array<{ id: number; minX: number; minY: number; maxX: number; maxY: number; area: number }> = [];
  const x0 = Math.max(0, Math.floor(bounds.minX));
  const x1 = Math.min(imgW - 1, Math.ceil(bounds.maxX));
  const y0 = Math.max(0, Math.floor(bounds.minY));
  const y1 = Math.min(imgH - 1, Math.ceil(bounds.maxY));
  const stack: number[] = [];
  let next = 1;

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const seed = y * imgW + x;
      if (!work[seed] || labels[seed]) continue;
      const id = next;
      next += 1;
      let area = 0;
      let mnX = x; let mnY = y; let mxX = x; let mxY = y;
      labels[seed] = id;
      stack.push(seed);
      while (stack.length) {
        const cur = stack.pop() as number;
        const cy = Math.floor(cur / imgW);
        const cx = cur - cy * imgW;
        area += 1;
        if (cx < mnX) mnX = cx;
        if (cx > mxX) mxX = cx;
        if (cy < mnY) mnY = cy;
        if (cy > mxY) mxY = cy;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            if (!ox && !oy) continue;
            const nx = cx + ox;
            const ny = cy + oy;
            if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
            const nIndex = ny * imgW + nx;
            if (!work[nIndex] || labels[nIndex]) continue;
            labels[nIndex] = id;
            stack.push(nIndex);
          }
        }
      }
      if (area >= minArea) boxes.push({ id, minX: mnX, minY: mnY, maxX: mxX, maxY: mxY, area });
      if (boxes.length >= maxComponents) return { labels, boxes };
    }
  }
  return { labels, boxes };
}

/**
 * Which sides of a box are flush against a wall band.
 *
 * Wall erasure deletes the fixture edges that abut walls, so a shower tray in a
 * corner keeps only its two free sides. Without this, no wall-mounted fixture
 * ever reads as a closed rectangle.
 */
function sidesAgainstWalls(
  box: { minX: number; minY: number; maxX: number; maxY: number },
  walls: DetectorWall[],
  tolerance: number,
): { top: boolean; bottom: boolean; left: boolean; right: boolean } {
  const result = { top: false, bottom: false, left: false, right: false };
  const width = Math.max(1, box.maxX - box.minX);
  const height = Math.max(1, box.maxY - box.minY);
  for (const wall of walls) {
    const half = wall.thickness / 2 + 1;
    const wMinX = Math.min(wall.start[0], wall.end[0]) - half;
    const wMaxX = Math.max(wall.start[0], wall.end[0]) + half;
    const wMinY = Math.min(wall.start[1], wall.end[1]) - half;
    const wMaxY = Math.max(wall.start[1], wall.end[1]) + half;
    const xOverlap = (Math.min(wMaxX, box.maxX) - Math.max(wMinX, box.minX)) / width;
    const yOverlap = (Math.min(wMaxY, box.maxY) - Math.max(wMinY, box.minY)) / height;
    if (xOverlap >= 0.55) {
      if (Math.abs(wMaxY - box.minY) <= tolerance) result.top = true;
      if (Math.abs(wMinY - box.maxY) <= tolerance) result.bottom = true;
    }
    if (yOverlap >= 0.55) {
      if (Math.abs(wMaxX - box.minX) <= tolerance) result.left = true;
      if (Math.abs(wMinX - box.maxX) <= tolerance) result.right = true;
    }
  }
  return result;
}

type BoxBounds = { minX: number; minY: number; maxX: number; maxY: number };

/** Measure the shape descriptors of one rectangle of a labelled component. */
function measureBox(
  labels: Int32Array,
  imgW: number,
  id: number,
  bounds: BoxBounds,
  area: number,
  walls: DetectorWall[],
  wallTolerance: number,
): Omit<InkComponent, "minX" | "minY" | "maxX" | "maxY"> {
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  const band = Math.max(1, Math.round(Math.min(width, height) * 0.12));
  const has = (x: number, y: number) => labels[y * imgW + x] === id;

  let top = 0; let bottom = 0;
  for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
    for (let d = 0; d < band; d += 1) {
      if (bounds.minY + d <= bounds.maxY && has(x, bounds.minY + d)) { top += 1; break; }
    }
    for (let d = 0; d < band; d += 1) {
      if (bounds.maxY - d >= bounds.minY && has(x, bounds.maxY - d)) { bottom += 1; break; }
    }
  }
  let left = 0; let right = 0;
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let d = 0; d < band; d += 1) {
      if (bounds.minX + d <= bounds.maxX && has(bounds.minX + d, y)) { left += 1; break; }
    }
    for (let d = 0; d < band; d += 1) {
      if (bounds.maxX - d >= bounds.minX && has(bounds.maxX - d, y)) { right += 1; break; }
    }
  }

  const inset = Math.max(2, Math.round(Math.min(width, height) * 0.22));
  let interiorInk = 0; let interiorArea = 0;
  for (let y = bounds.minY + inset; y <= bounds.maxY - inset; y += 1) {
    for (let x = bounds.minX + inset; x <= bounds.maxX - inset; x += 1) {
      interiorArea += 1;
      if (has(x, y)) interiorInk += 1;
    }
  }

  const sides = {
    top: top / width,
    bottom: bottom / width,
    left: left / height,
    right: right / height,
  };
  // A side lying on an erased wall counts as closed: the drawing had an edge
  // there, wall removal took it away.
  const onWall = walls.length
    ? sidesAgainstWalls(bounds, walls, wallTolerance)
    : { top: false, bottom: false, left: false, right: false };
  const effective = {
    top: onWall.top ? 1 : sides.top,
    bottom: onWall.bottom ? 1 : sides.bottom,
    left: onWall.left ? 1 : sides.left,
    right: onWall.right ? 1 : sides.right,
  };
  return {
    area,
    width, height,
    fill: area / Math.max(1, width * height),
    sides,
    onWall,
    effectiveSides: effective,
    interior: interiorArea ? interiorInk / interiorArea : 0,
    closedRect: effective.top >= 0.55 && effective.bottom >= 0.55
      && effective.left >= 0.55 && effective.right >= 0.55,
  };
}

/**
 * Trim a component back to the rectangle it was drawn as.
 *
 * Symbols are rarely drawn in isolation: a shower screen's swing arc starts on
 * the corner of its tray, so the two share an ink component and the bounding
 * box stretches to cover the arc — enough to push a 1 m tray out of shower
 * size entirely. The drawn edges are still recoverable, because a rectangle's
 * sides are the only rows and columns carrying ink along their whole length,
 * while an arc contributes a pixel or two to each of many rows. Snap each free
 * side in to the outermost such line; sides resting on a wall keep the box
 * edge, since wall erasure already removed the line that was there.
 */
function trimToDrawnRectangle(
  labels: Int32Array,
  imgW: number,
  id: number,
  box: BoxBounds,
  onWall: { top: boolean; bottom: boolean; left: boolean; right: boolean },
): BoxBounds | null {
  const width = box.maxX - box.minX + 1;
  const height = box.maxY - box.minY + 1;
  const rowInk = new Int32Array(height);
  const colInk = new Int32Array(width);
  for (let y = box.minY; y <= box.maxY; y += 1) {
    for (let x = box.minX; x <= box.maxX; x += 1) {
      if (labels[y * imgW + x] !== id) continue;
      rowInk[y - box.minY] += 1;
      colInk[x - box.minX] += 1;
    }
  }
  // Thresholds are relative to the longest line present, so they hold whatever
  // the symbol's size or the plan's resolution.
  const rowThreshold = Math.max(...rowInk) * 0.55;
  const colThreshold = Math.max(...colInk) * 0.55;
  const firstAbove = (values: Int32Array, threshold: number) => {
    for (let i = 0; i < values.length; i += 1) if (values[i] >= threshold) return i;
    return -1;
  };
  const lastAbove = (values: Int32Array, threshold: number) => {
    for (let i = values.length - 1; i >= 0; i -= 1) if (values[i] >= threshold) return i;
    return -1;
  };

  const top = onWall.top ? 0 : firstAbove(rowInk, rowThreshold);
  const bottom = onWall.bottom ? height - 1 : lastAbove(rowInk, rowThreshold);
  const left = onWall.left ? 0 : firstAbove(colInk, colThreshold);
  const right = onWall.right ? width - 1 : lastAbove(colInk, colThreshold);
  if (top < 0 || bottom < 0 || left < 0 || right < 0 || bottom <= top || right <= left) return null;

  // Only ever shave an appendage off. A large collapse means the component was
  // not a rectangle to begin with — a WC, whose pan carries no full-length
  // line — and its own bounding box is the better description.
  if ((right - left + 1) < width * 0.55 || (bottom - top + 1) < height * 0.55) return null;
  if (top === 0 && left === 0 && bottom === height - 1 && right === width - 1) return null;

  return {
    minX: box.minX + left, minY: box.minY + top,
    maxX: box.minX + right, maxY: box.minY + bottom,
  };
}

/** Measure the shape descriptors that separate one fixture symbol from another. */
function describeComponent(
  labels: Int32Array,
  imgW: number,
  box: { id: number; minX: number; minY: number; maxX: number; maxY: number; area: number },
  walls: DetectorWall[] = [],
  wallTolerance = 0,
): InkComponent {
  const raw = measureBox(labels, imgW, box.id, box, box.area, walls, wallTolerance);
  if (!raw.closedRect) {
    const trimmed = trimToDrawnRectangle(labels, imgW, box.id, box, raw.onWall);
    if (trimmed) {
      const refined = measureBox(labels, imgW, box.id, trimmed, box.area, walls, wallTolerance);
      // Adopt the trim only when it actually recovers a rectangle.
      if (refined.closedRect) return { ...refined, ...trimmed };
    }
  }
  return { ...raw, minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY };
}

/** Shortest gap from a component's box to any wall band, in pixels. */
function distanceToWall(c: InkComponent, walls: DetectorWall[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const wall of walls) {
    const half = wall.thickness / 2;
    const wMinX = Math.min(wall.start[0], wall.end[0]) - half;
    const wMaxX = Math.max(wall.start[0], wall.end[0]) + half;
    const wMinY = Math.min(wall.start[1], wall.end[1]) - half;
    const wMaxY = Math.max(wall.start[1], wall.end[1]) + half;
    const dx = Math.max(0, Math.max(wMinX - c.maxX, c.minX - wMaxX));
    const dy = Math.max(0, Math.max(wMinY - c.maxY, c.minY - wMaxY));
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}

/** Nearest wall band to a point, with the band rectangle for side tests. */
function nearestWallBand(x: number, y: number, walls: DetectorWall[]) {
  let best: { minX: number; minY: number; maxX: number; maxY: number; axis: DetectorWall["axis"]; distance: number } | null = null;
  for (const wall of walls) {
    const half = wall.thickness / 2;
    const band = {
      minX: Math.min(wall.start[0], wall.end[0]) - half,
      maxX: Math.max(wall.start[0], wall.end[0]) + half,
      minY: Math.min(wall.start[1], wall.end[1]) - half,
      maxY: Math.max(wall.start[1], wall.end[1]) + half,
    };
    const dx = Math.max(band.minX - x, 0, x - band.maxX);
    const dy = Math.max(band.minY - y, 0, y - band.maxY);
    const distance = Math.hypot(dx, dy);
    if (!best || distance < best.distance) best = { ...band, axis: wall.axis, distance };
  }
  return best;
}

/**
 * Locate closed, isolated round outlines — the shape of a WC pan.
 *
 * Stricter than `findCircles`, which only asks for 38% of a ring to be inked
 * and so fires anywhere regularly spaced linework (shelving, stair treads,
 * hatching) happens to cross a ring. Three tests must pass together: the ring
 * is nearly complete, the middle is empty, and — the discriminating one — the
 * space just outside is empty too. A pan stands in open floor; a ring traced
 * over a field of parallel lines never is.
 */
function findIsolatedRings(
  mask: Uint8Array,
  imgW: number,
  bounds: Bounds,
  minR: number,
  maxR: number,
  maxResults = 40,
): Array<{ cx: number; cy: number; r: number; score: number }> {
  const imgH = Math.floor(mask.length / imgW);
  const results: Array<{ cx: number; cy: number; r: number; score: number }> = [];
  const step = Math.max(2, Math.round(minR * 0.5));
  const inkAt = (x: number, y: number) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= imgW || iy < 0 || iy >= imgH) return 0;
    return mask[iy * imgW + ix] ? 1 : 0;
  };
  const ringCoverage = (cx: number, cy: number, r: number) => {
    const samples = Math.max(16, Math.round(2 * Math.PI * r));
    let hit = 0;
    for (let i = 0; i < samples; i += 1) {
      const theta = (2 * Math.PI * i) / samples;
      // Tolerate a pixel of slop so ovals and anti-aliased strokes still count.
      const x = cx + r * Math.cos(theta);
      const y = cy + r * Math.sin(theta);
      if (inkAt(x, y) || inkAt(x + Math.cos(theta), y + Math.sin(theta))
        || inkAt(x - Math.cos(theta), y - Math.sin(theta))) hit += 1;
    }
    return hit / samples;
  };

  for (let cy = Math.round(bounds.minY + maxR); cy <= Math.round(bounds.maxY - maxR); cy += step) {
    for (let cx = Math.round(bounds.minX + maxR); cx <= Math.round(bounds.maxX - maxR); cx += step) {
      // Keep the best-fitting radius at this centre, not merely the first that
      // clears the bar: the smallest passing ring is often an off-centre
      // partial match, which would size the fixture wrongly.
      let best: { r: number; score: number } | null = null;
      for (let r = Math.round(minR); r <= Math.round(maxR); r += 1) {
        const ring = ringCoverage(cx, cy, r);
        if (ring < 0.62) continue;
        if (ringCoverage(cx, cy, r * 0.45) > 0.18) continue;
        if (ringCoverage(cx, cy, r * 1.45) > 0.34) continue;
        if (!best || ring > best.score) best = { r, score: ring };
      }
      if (best) results.push({ cx, cy, r: best.r, score: best.score });
      if (results.length >= maxResults) return dedupeRings(results);
    }
  }
  return dedupeRings(results);
}

/** Collapse rings that describe the same circle, keeping the best fit. */
function dedupeRings(rings: Array<{ cx: number; cy: number; r: number; score: number }>) {
  const kept: Array<{ cx: number; cy: number; r: number; score: number }> = [];
  for (const ring of [...rings].sort((a, b) => b.score - a.score)) {
    if (kept.some((k) => Math.hypot(k.cx - ring.cx, k.cy - ring.cy) < Math.max(k.r, ring.r))) continue;
    kept.push(ring);
  }
  return kept;
}

/**
 * Toilets, found from the bowl rather than the whole symbol.
 *
 * A WC is drawn as a cistern box against the wall with a rounded pan hanging
 * off it, and at normal plan resolutions the cistern merges with whatever is
 * drawn beside it (a floor drain, a duct riser), which makes the component
 * bounding box unusable. The pan is the stable feature: an isolated oval of
 * known real-world radius, sitting a short distance off a wall. Anchor the
 * fixture to it and project the box back to the wall face to recover the
 * cistern depth.
 */
function detectToiletsByBowl(
  work: Uint8Array,
  imgW: number,
  footprint: Bounds,
  walls: DetectorWall[],
  metresPerPixel: number,
  components: InkComponent[],
): DetectedFixture[] {
  const minR = SIZE.toiletBowlRadius[0] / metresPerPixel;
  const maxR = SIZE.toiletBowlRadius[1] / metresPerPixel;
  if (!(maxR > minR)) return [];
  const circles = findIsolatedRings(work, imgW, footprint, minR, maxR, 40);
  const results: DetectedFixture[] = [];
  // A pan belongs to the WC symbol and nothing else. Requiring its ring to sit
  // inside a small isolated blob rejects rings traced over stairs, joinery and
  // other large linework that happen to enclose a clear patch.
  // The blob must also not be a closed rectangle: a WC symbol always breaks
  // that shape where the pan rounds away from the cistern. Without this an
  // empty square — a shower tray, a coat cupboard — can host a ring and be
  // reported as both a tray and a toilet at once.
  const maxSymbol = 1.35 / metresPerPixel;
  const hostsBowl = (cx: number, cy: number) => components.some((c) => (
    cx >= c.minX && cx <= c.maxX && cy >= c.minY && cy <= c.maxY
    && c.width <= maxSymbol && c.height <= maxSymbol
    && !c.closedRect
  ));

  // Hob burners come in twos and fours; a WC pan stands alone. Rejecting rings
  // that have a same-sized neighbour keeps a cooktop from reading as a toilet
  // without having to guess a radius that separates the two.
  const isolated = (c: { cx: number; cy: number; r: number }) => !circles.some((other) => (
    other !== c
    && Math.abs(other.r - c.r) <= c.r * 0.45
    && Math.hypot(other.cx - c.cx, other.cy - c.cy) <= c.r * 4
  ));

  for (const circle of circles) {
    if (!hostsBowl(circle.cx, circle.cy)) continue;
    if (!isolated(circle)) continue;
    const band = nearestWallBand(circle.cx, circle.cy, walls);
    if (!band) continue;
    // The pan sits just clear of the wall, with the cistern between.
    const gapMetres = band.distance * metresPerPixel;
    if (gapMetres > 0.55) continue;

    let x: number; let y: number; let width: number; let height: number;
    const across = circle.r * 2.3;
    if (band.axis === "horizontal") {
      const below = circle.cy > band.maxY;
      const face = below ? band.maxY : band.minY;
      const far = circle.cy + (below ? circle.r : -circle.r);
      height = Math.abs(far - face);
      width = across;
      x = circle.cx;
      y = (face + far) / 2;
    } else {
      const right = circle.cx > band.maxX;
      const face = right ? band.maxX : band.minX;
      const far = circle.cx + (right ? circle.r : -circle.r);
      width = Math.abs(far - face);
      height = across;
      x = (face + far) / 2;
      y = circle.cy;
    }

    const depthMetres = Math.max(width, height) * metresPerPixel;
    const widthMetres = Math.min(width, height) * metresPerPixel;
    if (depthMetres < 0.42 || depthMetres > 1.05) continue;
    if (widthMetres < 0.26 || widthMetres > 0.72) continue;

    results.push({
      id: `wc-${results.length + 1}`,
      kind: "toilet",
      x, y, width, height,
      rotation: 0,
      confidence: 0.7,
    });
  }
  return deduplicateFixtures(results);
}

/** Real-world fixture envelopes, in metres. */
const SIZE = {
  /** Smallest tray sold is 0.70 m square; below that it is joinery, not a shower. */
  showerSide: [0.70, 1.45] as const,
  tubLong: [1.40, 1.95] as const,
  tubShort: [0.60, 0.90] as const,
  counterDepth: [0.40, 0.82] as const,
  counterLength: [0.60, 3.60] as const,
  cupboardShort: [0.45, 1.10] as const,
  cupboardLong: [0.55, 2.60] as const,
  sinkSide: [0.24, 0.85] as const,
  /** Pan radius of a WC bowl: a 0.36-0.40 m wide pan. */
  toiletBowlRadius: [0.13, 0.30] as const,
};

const within = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;

/**
 * Classify labelled ink blobs into bathroom fixtures. Sizes are metres, so the
 * same thresholds hold at any source resolution. Anything that does not match
 * a fixture envelope is dropped rather than guessed at.
 */
function detectComponentFixtures(
  mask: Uint8Array,
  imgW: number,
  footprint: Bounds,
  wallThickness: number,
  walls: DetectorWall[],
  metresPerPixel: number,
): DetectedFixture[] {
  const imgH = Math.floor(mask.length / imgW);
  if (!walls.length || !(metresPerPixel > 0)) return [];

  const work = eraseWalls(mask, imgW, imgH, walls);
  const minArea = Math.max(12, Math.round(wallThickness * wallThickness * 0.35));
  const wallTolerance = wallThickness * 0.9;
  const { labels, boxes } = labelComponents(work, imgW, imgH, footprint, minArea, 900);
  const described = boxes.map((b) => describeComponent(labels, imgW, b, walls, wallTolerance));

  const wallGap = wallThickness * 1.6;
  const results: DetectedFixture[] = [];
  const counters: InkComponent[] = [];
  /** Shower candidates awaiting confirmation, mapped to whether they abut a wall. */
  const provisionalTrays = new Map<string, boolean>();

  for (const c of described) {
    const wm = c.width * metresPerPixel;
    const hm = c.height * metresPerPixel;
    const longSide = Math.max(wm, hm);
    const shortSide = Math.min(wm, hm);
    const aspect = longSide / Math.max(0.01, shortSide);
    const touchesWall = distanceToWall(c, walls) <= wallGap;
    const push = (kind: DetectedFixture["kind"], confidence: number) => {
      results.push({
        id: `cc-${results.length + 1}`,
        kind,
        x: (c.minX + c.maxX) / 2,
        y: (c.minY + c.maxY) / 2,
        width: c.width,
        height: c.height,
        rotation: 0,
        confidence,
      });
    };

    // Shower tray: a hollow, near-square closed rectangle. Confirmed against
    // neighbouring sanitary fixtures further down — an empty square alone is
    // just as likely to be a closet.
    if (c.closedRect && c.interior <= 0.16 && aspect <= 1.45
      && within(wm, SIZE.showerSide) && within(hm, SIZE.showerSide)) {
      provisionalTrays.set(`cc-${results.length + 1}`, touchesWall);
      push("shower", clamp(0.62 + (0.16 - c.interior), 0.62, 0.86));
      continue;
    }

    // Bathtub: hollow closed rectangle, clearly oblong, tub-sized.
    if (c.closedRect && c.interior <= 0.2
      && within(longSide, SIZE.tubLong) && within(shortSide, SIZE.tubShort)) {
      push("bathtub", 0.7);
      continue;
    }

    // Vanity / kitchen run: a distinctly oblong shallow rectangle flush against
    // a wall. Its interior may hold a basin outline, so a modest interior fill
    // is allowed.
    if (c.closedRect && touchesWall && aspect >= 1.8 && c.interior <= 0.34
      && within(shortSide, SIZE.counterDepth) && within(longSide, SIZE.counterLength)) {
      counters.push(c);
      push("countertop", clamp(0.6 + Math.min(0.2, longSide * 0.06), 0.6, 0.84));
      continue;
    }

    // Built-in storage: a closed, mostly empty box against a wall that is too
    // chunky to be a counter run. Wardrobes and airing cupboards land here.
    if (c.closedRect && touchesWall && c.interior <= 0.3
      && within(shortSide, SIZE.cupboardShort) && within(longSide, SIZE.cupboardLong)) {
      counters.push(c);
      push("cupboard", 0.62);
      continue;
    }
  }

  // Toilets share this pass's labelling: the pan ring must fall inside one of
  // the small blobs found above.
  results.push(...detectToiletsByBowl(work, imgW, footprint, walls, metresPerPixel, described));

  // Basins: a small rounded blob sitting inside a detected counter run.
  for (const c of described) {
    const wm = c.width * metresPerPixel;
    const hm = c.height * metresPerPixel;
    if (!within(wm, SIZE.sinkSide) || !within(hm, SIZE.sinkSide)) continue;
    if (c.interior > 0.45) continue;
    const host = counters.find((k) => c.minX >= k.minX - 2 && c.maxX <= k.maxX + 2
      && c.minY >= k.minY - 2 && c.maxY <= k.maxY + 2
      && c.area < k.area);
    if (!host) continue;
    results.push({
      id: `cc-sink-${results.length + 1}`,
      kind: "sink",
      x: (c.minX + c.maxX) / 2,
      y: (c.minY + c.maxY) / 2,
      width: c.width,
      height: c.height,
      rotation: 0,
      confidence: 0.72,
    });
  }

  // Confirm shower trays against their neighbours. Sanitary fixtures share a
  // soil stack, so a tray sits within a few metres of a WC or basin; a lone
  // empty square elsewhere in the plan is joinery — a coat cupboard by the
  // front door is the usual culprit — so demote it rather than emit a shower
  // in the hallway.
  const sanitary = results.filter((f) => f.kind === "toilet" || f.kind === "sink");
  const stackRadius = 3.2 / metresPerPixel;
  return results.flatMap((f) => {
    if (f.kind !== "shower" && f.kind !== "bathtub") return [f];
    const nearWet = sanitary.some((s) => Math.hypot(s.x - f.x, s.y - f.y) <= stackRadius);
    if (nearWet) return [f];
    return provisionalTrays.get(f.id)
      ? [{ ...f, kind: "cupboard" as const, confidence: 0.55 }]
      : [];
  });
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
  metresPerPixel?: number,
): DetectedFixture[] {
  const all: DetectedFixture[] = [
    ...detectStoves(mask, imgW, footprint, wallThickness, metresPerPixel),
  ];

  // Component detector: recovers the true outline of plumbing fixtures and
  // counter runs. Requires a project scale, since it classifies by real-world
  // size; without one it contributes nothing rather than guessing.
  if (walls.length > 0 && metresPerPixel && metresPerPixel > 0) {
    all.push(...detectComponentFixtures(mask, imgW, footprint, wallThickness, walls, metresPerPixel));
  }

  const cleared = obstacles.length ? all.filter((f) => !overlapsObstacle(f, obstacles)) : all;
  const renumbered = cleared.map((f, i) => ({ ...f, id: `fixture-${i + 1}` }));
  return deduplicateFixtures(renumbered).slice(0, maxFixtures);
}

/**
 * Diagnostic hook: return every labelled component with its descriptors, so
 * the offline benchmark can show why a symbol was or was not classified.
 * Not used by the app.
 */
export function inspectInkComponents(
  mask: Uint8Array,
  imgW: number,
  footprint: Bounds,
  wallThickness: number,
  walls: DetectorWall[],
): InkComponent[] {
  const imgH = Math.floor(mask.length / imgW);
  const work = eraseWalls(mask, imgW, imgH, walls);
  const minArea = Math.max(12, Math.round(wallThickness * wallThickness * 0.35));
  const { labels, boxes } = labelComponents(work, imgW, imgH, footprint, minArea, 900);
  return boxes.map((b) => describeComponent(labels, imgW, b, walls, wallThickness * 0.9));
}
