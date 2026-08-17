import { readFile } from "node:fs/promises";
import { detectPlanRegions } from "../../app/plan-regions.ts";
import { detectFloorStructure } from "../../app/structure-detector.ts";

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

function luminance(px, i) { return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; }

// Pure-TS enhancement producing a NEW RGBA buffer (browser-portable).
function enhancePixels(px, W, H, amount) {
  const gray = new Float32Array(W * H);
  let mn = 255, mx = 0;
  for (let i = 0; i < W * H; i += 1) { const v = luminance(px, i * 4); gray[i] = v; if (v < mn) mn = v; if (v > mx) mx = v; }
  const span = Math.max(1, mx - mn);
  const norm = new Float32Array(W * H);
  for (let i = 0; i < W * H; i += 1) norm[i] = ((gray[i] - mn) / span) * 255;
  const blur = new Float32Array(W * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    let s = 0, n = 0;
    for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
      const yy = y + oy, xx = x + ox; if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
      s += norm[yy * W + xx]; n += 1;
    }
    blur[y * W + x] = s / Math.max(1, n);
  }
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i += 1) {
    const v = Math.max(0, Math.min(255, norm[i] + amount * (norm[i] - blur[i])));
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v; out[i * 4 + 3] = 255;
  }
  return out;
}

const regions = detectPlanRegions(data, W, H);
const upper = regions[regions.length - 1];

function report(label, pixels) {
  const structure = detectFloorStructure(pixels, W, H, upper);
  const stair = structure.stairs[0];
  const thin = structure.walls.filter((wl) => wl.thickness <= 4);
  console.log(`\n${label}: ${structure.walls.length} walls, ${thin.length} thin(<=4px), stair=${stair ? `x${stair.x.toFixed(0)} y${stair.y.toFixed(0)} ${stair.width.toFixed(0)}x${stair.height.toFixed(0)}` : "none"}`);
  for (const wl of thin) {
    const midx = ((wl.start[0] + wl.end[0]) / 2).toFixed(0);
    const midy = ((wl.start[1] + wl.end[1]) / 2).toFixed(0);
    const len = Math.hypot(wl.end[0] - wl.start[0], wl.end[1] - wl.start[1]).toFixed(0);
    const nearStair = stair && wl.start[0] >= stair.x - 30 && wl.end[0] <= stair.x + stair.width + 30 && ((wl.start[1] + wl.end[1]) / 2) >= stair.y - 30 && ((wl.start[1] + wl.end[1]) / 2) <= stair.y + stair.height + 30;
    console.log(`   ${wl.id} ${wl.axis} t=${wl.thickness}px len=${len} mid=(${midx},${midy})${nearStair ? " NEAR-STAIR" : ""}`);
  }
}

report("baseline", data);
report("enhanced amount=1.6", enhancePixels(data, W, H, 1.6));
report("enhanced amount=2.5", enhancePixels(data, W, H, 2.5));
