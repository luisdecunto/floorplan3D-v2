import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { FURNITURE_CATALOG } from "../app/furniture-catalog.ts";

const outputDirectory = new URL("../pages-dist/", import.meta.url);
const expectedBasePath = process.env.PAGES_BASE_PATH ?? "/floorplan3D/";

test("GitHub Pages build contains the Planform application shell", async () => {
  const html = await readFile(new URL("index.html", outputDirectory), "utf8");

  assert.match(html, /<title>Planform/);
  assert.match(html, /id="root"/);
  assert.ok(html.includes(`${expectedBasePath}assets/`), `expected assets below ${expectedBasePath}`);
  assert.doesNotMatch(html, /_next|_vinext|chatgpt\.site/);
});

test("GitHub Pages artifact contains only deployable static assets", async () => {
  const entries = await readdir(outputDirectory);
  assert.ok(entries.includes("index.html"));
  assert.ok(entries.includes("assets"));
  assert.ok(entries.includes(".nojekyll"));
  assert.ok(!entries.includes("tests"));
  assert.ok(!entries.includes("fixtures"));
  await access(new URL("og.png", outputDirectory));
});

test("plan review visually separates detected walls from source annotations", async () => {
  const assetDirectory = new URL("assets/", outputDirectory);
  const stylesheet = (await readdir(assetDirectory)).find((entry) => entry.endsWith(".css"));
  assert.ok(stylesheet, "expected the production stylesheet");
  const css = await readFile(new URL(stylesheet, assetDirectory), "utf8");

  assert.match(css, /\.detected-wall-halo/);
  assert.match(css, /\.region-box\{[^}]*background:(?:transparent|0 0)/);
  assert.match(css, /\.ws-panel\.expanded\{[^}]*position:absolute[^}]*inset:0/);
});

test("GitHub Pages bundle includes wall-safe furniture editing controls", async () => {
  const assetDirectory = new URL("assets/", outputDirectory);
  const scripts = (await readdir(assetDirectory)).filter((entry) => entry.endsWith(".js"));
  const javascript = (await Promise.all(scripts.map((entry) => readFile(new URL(entry, assetDirectory), "utf8")))).join("\n");

  assert.match(javascript, /Snap to 10 cm grid/);
  assert.match(javascript, /Ready to place/);
  assert.match(javascript, /PREVIEW · NOT SAVED/);
  assert.match(javascript, /Saved on this device/);
  assert.match(javascript, /Whole house/);
  assert.match(javascript, /ws-wall-height/);
  assert.match(javascript, /% of full wall height/);
  assert.match(javascript, /Share apartment link/);
  assert.match(javascript, /Opening shared apartment/);
  assert.match(javascript, /without the original floorplan image/);
  assert.doesNotMatch(javascript, /fetch\("\/api\/share/);
  assert.match(javascript, /Mirror furniture/);
  assert.match(javascript, /Delete furniture/);
  assert.match(javascript, /FRIHETEN corner sofa-bed/);
  assert.match(javascript, /MALM high bed frame/);
  assert.match(javascript, /LISABO dining table/);
  assert.match(javascript, /TEODORES chair/);
  assert.match(javascript, /BILLUND wardrobe with drawers/);
  assert.match(javascript, /SALTVIG rattan-door cupboard/);
  assert.match(javascript, /JYSK/);
  assert.match(javascript, /Furniture brand/);
  assert.match(javascript, /View at/);
});

test("all furniture previews are static local SVGs and test harness is not deployed", async () => {
  const previews = await readdir(new URL("furniture-previews/", outputDirectory));
  assert.deepEqual(previews.filter((file) => file.endsWith(".svg")).sort(), FURNITURE_CATALOG.map((item) => `${item.id}.svg`).sort());
  assert.ok(!(await readdir(outputDirectory)).includes("qa.html"));
  for (const file of previews) {
    const svg = await readFile(new URL("furniture-previews/" + file, outputDirectory), "utf8");
    assert.match(svg, /<polygon/);
    assert.doesNotMatch(svg, /<script|href=|foreignObject/);
  }
});
