// Prototype ONLY - not wired into the app.
//
// Tests whether framing detection as "partition the free space, then read
// walls off region adjacency" gives a more robust signal than the current
// "is this run thick/long/dense enough to be a wall" threshold chain.
//
// The decisive question is not whether it finds the right rooms on one plan.
// It is whether the quantity it decides on is BIMODAL - well separated, so
// the threshold can sit anywhere in a wide valley - versus the current
// tests where a real wall scored 0.60 against a 0.62 cutoff.
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const fixtureDirectory = new URL("../fixtures/floorplans/", import.meta.url);

async function loadPlan(file) {
  const buffer = await readFile(new URL(file, fixtureDirectory));
  const meta = await sharp(buffer).metadata();
  const scale = Math.min(1, 1280 / Math.max(meta.width, meta.height));
  const width = Math.round(meta.width * scale);
  const height = Math.round(meta.height * scale);
  const { data, info } = await sharp(buffer)
    .resize(width, height, { fit: "fill" }).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// Otsu on luminance; the only image-derived threshold, not a tuned constant.
function otsu(data, w, h, box) {
  const hist = new Uint32Array(256);
  let total = 0;
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const i = (y * w + x) * 4;
    hist[Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])]++;
    total++;
  }
  let sum = 0; for (let v = 0; v < 256; v++) sum += v * hist[v];
  let bw = 0, bs = 0, best = -1, thr = 145;
  for (let v = 0; v < 256; v++) {
    bw += hist[v]; if (!bw) continue;
    const fw = total - bw; if (!fw) break;
    bs += v * hist[v];
    const between = bw * fw * ((bs / bw) - ((sum - bs) / fw)) ** 2;
    if (between > best) { best = between; thr = v; }
  }
  return thr;
}

function inkMask(data, w, h, box, thr) {
  const ink = new Uint8Array(w * h);
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const i = (y * w + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    if (lum < thr || (sat > 0.25 && lum < 225)) ink[y * w + x] = 1;
  }
  return ink;
}

// Chamfer 3-4 distance transform of free space, restricted to the box.
function distanceTransform(ink, w, h, box) {
  const D = new Int32Array(w * h).fill(0);
  const BIG = 1 << 28;
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    D[y * w + x] = ink[y * w + x] ? 0 : BIG;
  }
  const at = (x, y) => (x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1) ? 0 : D[y * w + x];
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    if (!D[y * w + x]) continue;
    let v = D[y * w + x];
    v = Math.min(v, at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    D[y * w + x] = v;
  }
  for (let y = box.y1; y >= box.y0; y--) for (let x = box.x1; x >= box.x0; x--) {
    let v = D[y * w + x];
    v = Math.min(v, at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    D[y * w + x] = v;
  }
  return D;
}

// Watershed by immersion, flooding from the deepest free points outward.
// Bucket queue keyed on distance keeps this linear.
function watershed(ink, D, w, h, box) {
  const label = new Int32Array(w * h).fill(0);
  let maxD = 0;
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    if (D[y * w + x] > maxD) maxD = D[y * w + x];
  }
  // Seeds: free pixels that are strict local maxima of the distance map.
  // These are the deepest points of each room; no size or shape assumption.
  const seeds = [];
  for (let y = box.y0 + 1; y < box.y1; y++) for (let x = box.x0 + 1; x < box.x1; x++) {
    const i = y * w + x;
    if (ink[i] || D[i] < 6) continue;
    let isMax = true;
    for (let oy = -1; oy <= 1 && isMax; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (D[(y + oy) * w + x + ox] > D[i]) { isMax = false; break; }
    }
    if (isMax) seeds.push(i);
  }
  // Merge touching seeds into one label so a flat plateau is a single room.
  let next = 1;
  const seedSet = new Set(seeds);
  for (const s of seeds) {
    if (label[s]) continue;
    const id = next++; const st = [s]; label[s] = id;
    while (st.length) {
      const j = st.pop(), jx = j % w, jy = (j / w) | 0;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
        const k = (jy + oy) * w + jx + ox;
        if (seedSet.has(k) && !label[k]) { label[k] = id; st.push(k); }
      }
    }
  }
  const buckets = Array.from({ length: maxD + 1 }, () => []);
  for (let i = 0; i < label.length; i++) if (label[i]) buckets[D[i]].push(i);
  for (let d = maxD; d >= 0; d--) {
    const q = buckets[d];
    for (let c = 0; c < q.length; c++) {
      const i = q[c], x = i % w, y = (i / w) | 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ox, ny = y + oy;
        if (nx < box.x0 || nx > box.x1 || ny < box.y0 || ny > box.y1) continue;
        const k = ny * w + nx;
        if (ink[k] || label[k]) continue;
        label[k] = label[i];
        buckets[Math.min(d, D[k])].push(k);
      }
    }
  }
  return { label, count: next - 1 };
}

/**
 * For every pair of adjacent regions, measure what separates them:
 *   direct  - the two regions touch across open space (no wall)
 *   walled  - the two regions are separated by ink (a wall)
 * openRatio = direct / (direct + walled).
 *
 * A doorway is a short direct contact through a long wall  -> ratio near 0.
 * An open-plan split is direct contact along its whole length -> ratio near 1.
 * If those two populations are well separated, the merge rule is robust.
 */
function adjacency(label, ink, w, h, box) {
  const pairs = new Map();
  const key = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
  const bump = (a, b, field) => {
    if (!a || !b || a === b) return;
    const k = key(a, b);
    if (!pairs.has(k)) pairs.set(k, { a: Math.min(a, b), b: Math.max(a, b), direct: 0, walled: 0 });
    pairs.get(k)[field]++;
  };
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const i = y * w + x;
    if (label[i]) {
      if (x < box.x1) bump(label[i], label[i + 1], "direct");
      if (y < box.y1) bump(label[i], label[i + w], "direct");
    } else if (ink[i]) {
      // Look across the ink perpendicular to find the labels it separates.
      for (const [ox, oy] of [[1, 0], [0, 1]]) {
        let a = 0, b = 0;
        for (let step = 1; step <= 14; step++) {
          const px = x - ox * step, py = y - oy * step;
          if (px < box.x0 || py < box.y0) break;
          const p = py * w + px;
          if (label[p]) { a = label[p]; break; }
          if (!ink[p]) break;
        }
        for (let step = 1; step <= 14; step++) {
          const px = x + ox * step, py = y + oy * step;
          if (px > box.x1 || py > box.y1) break;
          const p = py * w + px;
          if (label[p]) { b = label[p]; break; }
          if (!ink[p]) break;
        }
        bump(a, b, "walled");
      }
    }
  }
  return [...pairs.values()];
}

async function run(file, label, box) {
  const { data, width, height } = await loadPlan(file);
  const b = box ?? { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
  const thr = otsu(data, width, height, b);
  const ink = inkMask(data, width, height, b, thr);
  const D = distanceTransform(ink, width, height, b);
  const { label: lab, count } = watershed(ink, D, width, height, b);
  const areas = new Map();
  for (let i = 0; i < lab.length; i++) if (lab[i]) areas.set(lab[i], (areas.get(lab[i]) ?? 0) + 1);
  const totalFree = [...areas.values()].reduce((s, v) => s + v, 0);
  const real = [...areas.entries()].filter(([, a]) => a > totalFree * 0.01);
  console.log(`\n=== ${label}: ${count} raw basins, ${real.length} above 1% of free area`);
  const adj = adjacency(lab, ink, width, height, b).filter((p) => p.direct + p.walled > 12);
  const scored = adj.map((p) => ({ ...p, openRatio: p.direct / (p.direct + p.walled) }))
    .sort((x, y) => x.openRatio - y.openRatio);
  console.log("  openRatio distribution (low = separated by a wall, high = open):");
  scored.forEach((p) => console.log(
    `    ${String(p.a).padStart(3)}-${String(p.b).padStart(3)}  direct=${String(p.direct).padStart(4)} walled=${String(p.walled).padStart(4)}  openRatio=${p.openRatio.toFixed(3)}`,
  ));
  const vals = scored.map((p) => p.openRatio);
  let bestGap = 0, bestAt = 0;
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] - vals[i - 1] > bestGap) { bestGap = vals[i] - vals[i - 1]; bestAt = (vals[i] + vals[i - 1]) / 2; }
  }
  console.log(`  widest valley in the distribution: ${bestGap.toFixed(3)} wide, centred at ${bestAt.toFixed(3)}`);
}

const { width, height } = await loadPlan("fp-001-two-levels-vertical.png");
await run("fp-001-two-levels-vertical.png", "fp-001 LOWER plan (Toilet/Entre/Vaerelse)",
  { x0: 40, y0: 345, x1: 300, y1: 552 });
await run("fp-001-two-levels-vertical.png", "fp-001 UPPER plan (Stue/Kokken open-plan)",
  { x0: 40, y0: 14, x1: 300, y1: 216 });
await run("fp-005-single-small-centered.png", "fp-005 (currently 8.9% wall coverage)");
console.log(`\n(fp-001 analysed at ${width}x${height})`);
