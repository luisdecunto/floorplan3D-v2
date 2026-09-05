import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Box3, BoxGeometry, CylinderGeometry, Matrix4, Vector3, Euler, Quaternion } from "three";
import { RETAIL_FURNITURE_CATALOG } from "../app/retail-furniture-catalog.ts";
import { BOOKSHELF_CATALOG } from "../app/bookshelf-catalog.ts";
import { DECOR_CATALOG } from "../app/decor-catalog.ts";

const server = await createServer({ root: fileURLToPath(new URL("../", import.meta.url)), configFile: false, cacheDir: fileURLToPath(new URL("../node_modules/.vite-furniture-model", import.meta.url)), plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false }, appType: "custom" });
after(() => server.close());
const { ProceduralFurniture } = await server.ssrLoadModule("/app/furniture-model.tsx");
const { FurnitureLibrary } = await server.ssrLoadModule("/app/furniture-library.tsx");
const { FurnitureControls } = await server.ssrLoadModule("/app/furniture-controls.tsx");

test("catalogue renders retailer-correct links, new categories and a brand selector", () => {
  const html = renderToStaticMarkup(createElement(FurnitureLibrary, { onChoose: () => {} }));
  assert.match(html, /View at JYSK/);
  assert.match(html, /View at IKEA/);
  assert.match(html, /aria-label="Furniture brand"/);
  for (const name of ["Wardrobes", "Cupboards", "Coffee tables", "Desks", "Lighting", "Wall décor"]) assert.ok(html.includes(name));
  assert.match(html, /jysk-billund-3611113\.svg/);
  assert.match(html, /href="https:\/\/jysk\.dk\/[^"]+"[^>]*>View at JYSK/);
});

test("selected retailer furniture keeps its product link within reach", () => {
  const html = renderToStaticMarkup(createElement(FurnitureControls, {
    placement: { id: "wardrobe", catalogId: "jysk-billund-3611113", levelId: "ground", x: 0, z: 0, rotation: 0 },
    draft: false, issue: null, onRotate: () => {}, onMirror: () => {}, onNudge: () => {}, onDelete: () => {}, onDone: () => {}, onCancel: () => {},
  }));
  assert.match(html, /href="https:\/\/jysk\.dk\/[^"]+"[^>]*>View at JYSK/);
});

function meshes(element, parent = new Matrix4()) {
  if (!element || typeof element !== "object") return [];
  if (Array.isArray(element)) return element.flatMap((child) => meshes(child, parent));
  if (typeof element.type === "function") return meshes(element.type(element.props), parent);
  const props = element.props ?? {};
  const transform = parent.clone().multiply(new Matrix4().compose(new Vector3(...(props.position ?? [0, 0, 0])), new Quaternion().setFromEuler(new Euler(...(props.rotation ?? [0, 0, 0]))), new Vector3(...(props.scale ?? [1, 1, 1]))));
  if (element.type !== "mesh") return meshes(props.children, transform);
  const children = [props.children].flat(Infinity).filter(Boolean);
  const node = children.find((child) => /Geometry$/.test(child.type));
  assert.ok(node, "every mesh has supported static geometry");
  const geometry = node.type === "boxGeometry" ? new BoxGeometry(...node.props.args) : node.type === "cylinderGeometry" ? new CylinderGeometry(...node.props.args) : null;
  assert.ok(geometry, "geometry supported by thumbnail generator");
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox.clone().applyMatrix4(transform);
  geometry.dispose();
  return [{ name: props.name, bounds, type: node.type }];
}

test("all new procedural meshes match their real outer dimensions and sit on the floor", () => {
  for (const item of [...RETAIL_FURNITURE_CATALOG, ...BOOKSHELF_CATALOG]) {
    const parts = meshes(ProceduralFurniture({ item }));
    const bounds = parts.reduce((box, part) => box.union(part.bounds), new Box3());
    const expectedMin = [-item.width / 2, 0, -item.depth / 2];
    const expectedMax = [item.width / 2, item.height, item.depth / 2];
    for (const [index, axis] of ["x", "y", "z"].entries()) {
      assert.ok(Math.abs(bounds.min[axis] - expectedMin[index]) < 1e-6, `${item.id} minimum ${axis}`);
      assert.ok(Math.abs(bounds.max[axis] - expectedMax[index]) < 1e-6, `${item.id} maximum ${axis}`);
    }
  }
});

test("bookcase variants retain their recognisable frame and shelf configurations", () => {
  for (const item of BOOKSHELF_CATALOG) {
    const parts = meshes(ProceduralFurniture({ item }));
    assert.equal(parts.filter((part) => part.name === "bookcase-shelf").length, item.shelving.sections * item.shelving.shelvesPerSection, item.name);
    if (item.shelving.system === "ivar") {
      assert.equal(parts.filter((part) => part.name === "bookcase-upright").length, (item.shelving.sections + 1) * 2, item.name);
      assert.equal(parts.filter((part) => part.name === "bookcase-brace").length, item.shelving.sections, item.name);
    } else {
      assert.equal(parts.filter((part) => part.name === "bookcase-side").length, 2, item.name);
      assert.equal(parts.filter((part) => part.name === "bookcase-back").length, 1, item.name);
    }
  }
  assert.equal(meshes(ProceduralFurniture({ item: BOOKSHELF_CATALOG.find((item) => item.shelving.storageBox) })).filter((part) => part.name === "bookcase-storage-box").length, 1);
  assert.equal(meshes(ProceduralFurniture({ item: BOOKSHELF_CATALOG.find((item) => item.shelving.lowerCabinets) })).filter((part) => part.name === "bookcase-cabinet-door").length, 4);
});

test("storage has the specified closed doors, drawers and mirror on its front face", () => {
  for (const item of RETAIL_FURNITURE_CATALOG.filter((item) => item.storage)) {
    const parts = meshes(ProceduralFurniture({ item }));
    const doors = parts.filter((part) => part.name === "cabinet-door");
    assert.equal(doors.length, item.storage.doors, item.name);
    assert.ok(doors.every((part) => part.bounds.max.z < 0), "doors face local -Z, not a fixed world direction");
    assert.equal(parts.filter((part) => part.name === "cabinet-drawer").length, item.storage.drawers ?? 0);
    assert.equal(parts.filter((part) => part.name === "cabinet-mirror").length, item.storage.mirrorDoor === undefined ? 0 : 1);
    assert.equal(parts.filter((part) => part.name === "cabinet-handle").length, item.storage.doors);
  }
});

test("table and desk variants retain their recognisable tops, supports and storage", () => {
  for (const item of RETAIL_FURNITURE_CATALOG.filter((item) => item.table)) {
    const parts = meshes(ProceduralFurniture({ item }));
    const round = parts.find((part) => part.name === "round-tabletop");
    const oval = parts.find((part) => part.name === "oval-tabletop");
    assert.equal(Boolean(round), item.table.top === "round");
    assert.equal(Boolean(oval), item.table.top === "oval");
    if (round) assert.equal(round.type, "cylinderGeometry");
    if (oval) assert.equal(oval.type, "cylinderGeometry");
    if (item.table.heightAdjustable) {
      assert.equal(parts.filter((part) => part.name === "desk-foot").length, 2);
      assert.equal(parts.filter((part) => part.name === "desk-lower-leg").length, 2);
      assert.equal(parts.filter((part) => part.name === "desk-upper-leg").length, 2);
      assert.equal(parts.filter((part) => part.name === "desk-controller").length, 1);
      continue;
    }
    assert.equal(parts.filter((part) => part.name === "table-leg").length, item.table.support === "panels" ? 0 : item.table.legs ?? 4);
    assert.equal(parts.filter((part) => part.name === "table-panel").length, item.table.support === "panels" ? 2 : 0);
    assert.equal(parts.some((part) => part.name === "table-shelf" || part.name === "shelf-slat"), Boolean(item.table.shelf));
    assert.equal(parts.filter((part) => part.name === "desk-drawer").length, item.table.drawers ?? 0);
  }
});

test("decor variants render at their floor, wall or ceiling mounting height", () => {
  for (const item of DECOR_CATALOG) {
    const parts = meshes(ProceduralFurniture({ item, ceilingHeight: 2.7 }));
    const bounds = parts.reduce((box, part) => box.union(part.bounds), new Box3());
    assert.ok(parts.length >= 2, item.name);
    if (item.mount.type === "floor") {
      assert.ok(Math.abs(bounds.min.y) < 1e-6, `${item.name} sits on floor`);
      assert.ok(Math.abs(bounds.max.y - item.height) < 1e-6, `${item.name} reaches declared height`);
    } else if (item.mount.type === "wall") {
      assert.ok(Math.abs((bounds.min.y + bounds.max.y) / 2 - item.mount.elevation) < 1e-6, `${item.name} wall elevation`);
    } else {
      assert.ok(Math.abs(bounds.max.y - 2.7) < 1e-6, `${item.name} attaches at ceiling`);
      assert.ok(Math.abs(bounds.min.y - (2.7 - item.mount.drop)) < 1e-6, `${item.name} uses default drop`);
    }
  }
  assert.equal(meshes(ProceduralFurniture({ item: DECOR_CATALOG.find((item) => item.shape === "mirror") })).filter((part) => part.name === "mirror-glass").length, 1);
  assert.equal(meshes(ProceduralFurniture({ item: DECOR_CATALOG.find((item) => item.shape === "picture") })).filter((part) => part.name === "picture-art").length, 1);
});
