import { readFile } from "node:fs/promises";
import { detectPlanRegions } from "../../app/plan-regions.ts";
import { detectFloorStructure, inspectStructureEvidence } from "../../app/structure-detector.ts";

const dir = new URL("../fixtures/floorplans/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", dir), "utf8"));
const fx = manifest.fixtures.find((f) => f.id === "fp-001");
const { default: sharp } = await import("sharp");

const buffer = await readFile(new URL(fx.file, dir));
const maxSide = 1280;
const scale = Math.min(1, maxSide / Math.max(fx.width, fx.height));
const w = Math.round(fx.width * scale), h = Math.round(fx.height * scale);
const { data, info } = await sharp(buffer).resize(w, h, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;

// --- pure-TS enhancement (mirrors what would run in-browser) ---
function luminance(px, i) { return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; }

function buildEnhancedMask(px, W, H, bounds, amount = 1.6) {
  const gray = new Float32Array(W * H);
  let mn = 255, mx = 0;
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const v = luminance(px, (y * W + x) * 4);
      gray[y * W + x] = v; if (v < mn) mn = v; if (v > mx) mx = v;
    }
  }
  const span = Math.max(1, mx - mn);
  const norm = new Float32Array(W * H);
  for (let y = bounds.minY; y <= bounds.maxY; y += 1)
    for (let x = bounds.minX; x <= bounds.maxX; x += 1)
      norm[y * W + x] = ((gray[y * W + x] - mn) / span) * 255;
  // box blur radius 1
  const blur = new Float32Array(W * H);
  for (let y = bounds.minY; y <= bounds.maxY; y += 1)
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      let s = 0, n = 0;
      for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
        const yy = y + oy, xx = x + ox;
        if (yy < bounds.minY || yy > bounds.maxY || xx < bounds.minX || xx > bounds.maxX) continue;
        s += norm[yy * W + xx]; n += 1;
      }
      blur[y * W + x] = s / Math.max(1, n);
    }
  const sharpArr = new Float32Array(W * H);
  const hist = new Array(256).fill(0);
  let total = 0;
  for (let y = bounds.minY; y <= bounds.maxY; y += 1)
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const v = Math.max(0, Math.min(255, norm[y * W + x] + amount * (norm[y * W + x] - blur[y * W + x])));
      sharpArr[y * W + x] = v; hist[Math.round(v)] += 1; total += 1;
    }
  // Otsu threshold
  let sum = 0; for (let i = 0; i < 256; i += 1) sum += i * hist[i];
  let sumB = 0, wB = 0, maxVar = 0, thr = 128;
  for (let i = 0; i < 256; i += 1) {
    wB += hist[i]; if (wB === 0) continue;
    const wF = total - wB; if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) { maxVar = between; thr = i; }
  }
  const mask = new Uint8Array(W * H);
  for (let y = bounds.minY; y <= bounds.maxY; y += 1)
    for (let x = bounds.minX; x <= bounds.maxX; x += 1)
      if (sharpArr[y * W + x] < thr) mask[y * W + x] = 1;
  return mask;
}

function localThickness(mask, axis, line, p, maxHalf) {
  const counts = [];
  for (let d = -1; d <= 1; d += 1) {
    let c = 0;
    for (let off = -maxHalf; off <= maxHalf; off += 1) {
      const x = axis === "vertical" ? Math.round(line + off) : Math.round(p + d);
      const y = axis === "vertical" ? Math.round(p + d) : Math.round(line + off);
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      if (mask[y * W + x]) c += 1;
    }
    counts.push(c);
  }
  counts.sort((a, b) => a - b);
  return counts[1];
}

function profile(wall, mask) {
  const runStart = wall.axis === "vertical" ? wall.start[1] : wall.start[0];
  const runEnd = wall.axis === "vertical" ? wall.end[1] : wall.end[0];
  const line = wall.axis === "vertical" ? (wall.start[0] + wall.end[0]) / 2 : (wall.start[1] + wall.end[1]) / 2;
  const t = Math.max(3, wall.thickness);
  const maxHalf = Math.max(4, Math.round(t * 1.5));
  let s = "";
  for (let i = 0; i < 40; i += 1) {
    const p = runStart + (runEnd - runStart) * i / 39;
    const lt = localThickness(mask, wall.axis, line, p, maxHalf);
    s += lt === 0 ? "." : String(Math.min(9, lt));
  }
  return s;
}

const regions = detectPlanRegions(data, W, H);
const upper = regions[regions.length - 1];
const structure = detectFloorStructure(data, W, H, upper);
const ev = inspectStructureEvidence(data, W, H, upper);
const enhanced = buildEnhancedMask(data, W, H, ev.bounds);

console.log("vertical walls — baseline mediumMask vs enhanced mask:");
for (const wall of structure.walls.filter((wl) => wl.axis === "vertical")) {
  console.log(`${wall.id.padEnd(18)} t=${wall.thickness.toFixed(0)}`);
  console.log(`   base [${profile(wall, ev.mediumMask)}]`);
  console.log(`   enh  [${profile(wall, enhanced)}]`);
}
