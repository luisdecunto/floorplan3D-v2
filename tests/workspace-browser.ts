/** Development-only browser integration harness (not a Pages Router entry). Uses DOM inputs, real pointer
 * events and the app's JSON export; never reads React state or Three internals. */
import { createFloorplanDocumentV2 } from "../app/floorplan-document";
import { FURNITURE_CATALOG } from "../app/furniture-catalog";
import type { DetectedStructure } from "../app/structure-detector";
import type { FloorplanDocumentV2 } from "../app/floorplan-document";

const frame = document.querySelector<HTMLIFrameElement>("iframe")!;
const report = document.querySelector<HTMLPreElement>("#report")!;
const chair = FURNITURE_CATALOG.find((item) => item.shape === "chair")!;
const log = (message: string) => { report.textContent += message + "\n"; };
const doc = () => frame.contentDocument!;
function button(name: string) {
  const result = [...doc().querySelectorAll<HTMLButtonElement>("button")].find((element) => !element.closest("[hidden]") && (element.getAttribute("aria-label") === name || element.textContent?.trim() === name));
  if (!result) throw new Error("Missing button: " + name);
  return result;
}
function click(name: string) { button(name).click(); }
async function until(test: () => boolean, message = "UI did not settle", timeout = 10000) {
  const start = performance.now();
  while (!test()) { if (performance.now() - start > timeout) throw new Error(message); await new Promise((resolve) => setTimeout(resolve, 40)); }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 150));
function check(condition: boolean, message: string) { if (!condition) throw new Error(message); log("PASS " + message); }
function fixtureImage() {
  const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 440;
  const ctx = canvas.getContext("2d")!; ctx.fillStyle = "white"; ctx.fillRect(0, 0, 640, 440);
  ctx.strokeStyle = "black"; ctx.lineWidth = 6;
  for (const x of [20, 340]) { ctx.strokeRect(x, 30, 260, 360); ctx.beginPath(); ctx.moveTo(x, 170); ctx.lineTo(x + 90, 170); ctx.moveTo(x + 140, 170); ctx.lineTo(x + 260, 170); ctx.stroke(); }
  return canvas;
}
function regressionProject() {
  const regions = ["ground", "upper"].map((id, order) => ({ id, name: order ? "First floor" : "Ground floor", x: (20 + order * 320) / 640, y: 30 / 440, width: 260 / 640, height: 360 / 440, confidence: 1, nameEdited: true }));
  const structures = Object.fromEntries(regions.map((region, order) => {
    const x = 20 + order * 320, y = 30;
    const structure: DetectedStructure = {
      regionId: region.id, sourceWidth: 640, sourceHeight: 440, footprint: { x, y, width: 260, height: 360 },
      walls: [ [[x, y], [x + 260, y]], [[x, y + 360], [x + 260, y + 360]], [[x, y], [x, y + 360]], [[x + 260, y], [x + 260, y + 360]] ].map(([start, end], index) => ({ id: region.id + "-wall-" + index, axis: index < 2 ? "horizontal" : "vertical", start: start as [number, number], end: end as [number, number], thickness: 6, confidence: 1, weight: "heavy", openings: [] })),
      fixtures: [], stairs: [], rooms: [], outdoorAreas: [], roomCount: 1, confidence: 1,
      diagnostics: { threshold: 140, wallThickness: 6, geometryVotes: 1, topologyVotes: 1, openingVotes: 0, stairVotes: 0 },
    };
    return [region.id, structure];
  }));
  const project = createFloorplanDocumentV2({ name: "Workspace regression", mimeType: "image/png", width: 640, height: 440, previewDataUrl: fixtureImage().toDataURL("image/png"), regions, structures });
  project.scale = { metresPerPixel: 0.025, source: "user", confidence: 1 };
  project.furnishings = [{ id: "legacy", catalogId: "haven-wide-3", levelId: "ground", x: -1.7, z: 2.5, rotation: Math.PI / 2, mirrored: true }];
  return project;
}
async function upload(file: File, label: string) {
  const input = doc().querySelector<HTMLInputElement>('input[aria-label="' + label + '"]')!;
  const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true })); await tick();
}
async function seed() {
  await upload(new File([JSON.stringify(regressionProject())], "regression.planform.json", { type: "application/json" }), "Import project file");
  await until(() => Boolean(doc().querySelector(".ws-viewer canvas")));
  await tick();
}
async function exported() {
  const win = frame.contentWindow as Window & typeof globalThis;
  const proto = win.HTMLAnchorElement.prototype;
  const original = proto.click;
  let result: FloorplanDocumentV2 | null = null;
  let pending = Promise.resolve();
  proto.click = function () { pending = fetch(this.href).then((response) => response.json()).then((value) => { result = value; }); };
  try {
    if (!doc().querySelector('.ws-panel:not([hidden]) h2')?.textContent?.includes("Project")) { click("Project menu"); await tick(); }
    click("Export / share project file"); await pending; return result!;
  } finally { proto.click = original; click("Close project"); await tick(); }
}
async function chooseChair() { click("Add furniture"); await tick(); click("Preview " + chair.name); await tick(); }
function searchFurniture(value: string) {
  const win = frame.contentWindow as Window & typeof globalThis;
  const input = doc().querySelector<HTMLInputElement>('input[type="search"]')!;
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
}
async function selectChair() {
  click("Project menu"); await tick();
  const summary = [...doc().querySelectorAll("summary")].find((item) => item.textContent?.startsWith("Furniture on this floor"))!;
  if (!summary.parentElement?.hasAttribute("open")) summary.click();
  click("Edit " + chair.name); await tick();
}
function pointer(type: string, x: number, y: number, id = 1, pointerType = "mouse") {
  const canvas = doc().querySelector("canvas")!;
  const win = frame.contentWindow as Window & typeof globalThis;
  canvas.dispatchEvent(new win.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType, isPrimary: id === 1, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1 }));
}
document.querySelectorAll<HTMLButtonElement>("[data-size]").forEach((element) => element.addEventListener("click", () => {
  const [width, height] = element.dataset.size!.split(","); frame.width = width; frame.height = height;
  document.querySelector("#size")!.textContent = width + " × " + height;
}));
document.querySelector("#seed")!.addEventListener("click", () => { void seed().then(() => log("Loaded synthetic two-floor project, with a legacy furniture placement.")); });
document.querySelector("#checks")!.addEventListener("click", () => { void (async () => {
  report.textContent = ""; await seed();
  const baseline = await exported();
  check(baseline.furnishings?.[0].catalogId === "haven-wide-3" && baseline.furnishings[0].mirrored === true, "Legacy placement imports unchanged");
  click("Add furniture"); await tick(); click("Chairs"); searchFurniture("LISABO"); await tick();
  click("Preview " + chair.name); await tick(); click("Cancel placement"); await tick();
  check(doc().querySelector<HTMLInputElement>('input[type="search"]')?.value === "LISABO" && button("Chairs").getAttribute("aria-pressed") === "true", "Catalogue search and category survive preview/cancel");
  searchFurniture(""); await tick();
  await chooseChair();
  check(doc().querySelector(".ws-context-title small")?.textContent === "PREVIEW · NOT SAVED", "Choosing furniture creates a preview");
  click("Cancel placement"); await tick();
  check((await exported()).furnishings?.length === 1, "Cancel does not commit furniture");
  await chooseChair(); click("Place"); await tick();
  const placed = await exported();
  check(placed.furnishings?.length === 2, "Place commits once");
  check(placed.schemaVersion === 2, "Export keeps V2 schema");
  click("Undo last change"); await tick();
  check((await exported()).furnishings?.length === 1, "Undo removes only the new item");
  await chooseChair(); click("Place"); await tick();
  click("Top"); await tick(); click("Fit apartment in view"); await tick();
  // Real pointer-capture requires trusted input; gesture maths is unit-tested.
  // A background tap still exercises the live ray/camera/elevation pipeline.
  await chooseChair();
  const bounds = doc().querySelector("canvas")!.getBoundingClientRect();
  const offset = Math.min(bounds.width, bounds.height);
  const x = bounds.x + bounds.width / 2 + offset * 0.15, y = bounds.y + bounds.height / 2 - offset * 0.1;
  pointer("pointerdown", x, y); pointer("pointerup", x, y); await tick();
  click("Place"); await tick();
  const tapped = await exported();
  check(tapped.furnishings!.at(-1)!.x > 0.3, "Floor tap positions a preview using the live camera");
  await chooseChair();
  const edge = doc().querySelector("canvas")!.getBoundingClientRect();
  pointer("pointerdown", edge.right - 1, edge.y + edge.height / 2); pointer("pointerup", edge.right - 1, edge.y + edge.height / 2); await tick();
  check(button("Place").disabled, "Invalid wall-overlap preview disables Place");
  click("Cancel placement"); await tick();
  check((await exported()).furnishings!.length === 3, "Invalid/cancelled preview does not leak into export");
  await selectChair();
  const beforeRotate = (await exported()).furnishings![1].rotation;
  await selectChair(); click("Rotate furniture 90 degrees"); await tick();
  check((await exported()).furnishings![1].rotation !== beforeRotate, "Contextual rotation commits");
  const select = doc().querySelector<HTMLSelectElement>('select')!; select.value = "upper"; select.dispatchEvent(new Event("change", { bubbles: true })); await tick();
  await chooseChair(); click("Place"); await tick();
  const upper = await exported();
  check(upper.furnishings!.at(-1)!.levelId === "upper", "Furniture belongs to the active upper floor");
  check(upper.furnishings!.filter((item) => item.levelId === "ground").length === 3, "Other-floor furniture is unchanged");
  click("Check plan"); await tick();
  check(Boolean(doc().querySelector('img[alt="Uploaded floorplan"]')), "Plan review uses the original image");
  check(doc().querySelectorAll("canvas").length === 1, "Review keeps the single 3D canvas mounted");
  const wall = doc().querySelector<HTMLSelectElement>('.ws-plan-controls select')!; wall.value = "upper-wall-0"; wall.dispatchEvent(new Event("change", { bubbles: true })); await tick();
  click("Add door"); await tick(); click("Back to 3D"); await tick(); click("Undo last change"); await tick();
  const undone = await exported();
  check(undone.levels.find((item) => item.id === "upper")!.structure.walls[0].openings.length === 0 && undone.furnishings!.length === 4, "Structural undo preserves the preceding furniture edit");
  check(doc().documentElement.scrollWidth === frame.clientWidth, "No horizontal overflow at this viewport");
  log("Workspace checks complete.");
})().catch((error) => log("FAIL " + error.message)); });
document.querySelector("#intake")!.addEventListener("click", () => { void (async () => {
  const blob = await new Promise<Blob>((resolve) => fixtureImage().toBlob((value) => resolve(value!), "image/png"));
  await upload(new File([blob], "Synthetic floors.png", { type: "image/png" }), "Upload floorplan image");
  await until(() => Boolean(doc().querySelector(".ws-app")), "Automatic analysis did not open a workspace", 30000);
  const result = await exported();
  check(result.levels.length > 0 && result.levels.every((level) => level.structure.walls.length >= 3), "Image selection runs real worker analysis and opens detected floors");
})().catch((error) => log("FAIL " + error.message)); });
