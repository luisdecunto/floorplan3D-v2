import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

// Compile the real TSX component without a browser or a listening HTTP server.
const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)), configFile: false,
  plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null }, appType: "custom",
});
after(() => server.close());
const { WorkspaceShell } = await server.ssrLoadModule("/app/workspace-shell.tsx");
const noop = () => {};
function shell(overrides = {}) {
  return WorkspaceShell({
    name: "Test house", saveStatus: "Saved", levels: [{ id: "ground", name: "Ground floor" }, { id: "upper", name: "First floor" }],
    activeLevel: "ground", onFloor: noop, view: "perspective", onView: noop,
    wholeBuilding: false, onWholeBuilding: noop, wallCutaway: 0.32, onWallCutaway: noop,
    onFit: noop, onMenu: noop, onAdd: noop, onReview: noop, onUndo: noop,
    canUndo: false, needsScale: false, reviewing: false, panelOpen: false,
    children: null, panels: null, context: null, notice: "", clearNotice: noop, ...overrides,
  });
}
function elements(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}

test("whole-house control is visible without opening Project and toggles both ways", () => {
  for (const wholeBuilding of [false, true]) {
    let changed;
    const tree = shell({ wholeBuilding, onWholeBuilding: (value) => { changed = value; } });
    const button = elements(tree).find((element) => element.props?.className === "ws-house-toggle");
    assert.equal(button.props["aria-pressed"], wholeBuilding);
    button.props.onClick();
    assert.equal(changed, !wholeBuilding);
    assert.match(renderToStaticMarkup(tree), /Whole house/);
  }
});

test("wall slider supports continuous cutaway and full-height values in either house view", () => {
  for (const wholeBuilding of [false, true]) {
    for (const percent of [15, 32, 73, 100]) {
      let changed;
      const tree = shell({ wholeBuilding, wallCutaway: percent / 100, onWallCutaway: (value) => { changed = value; } });
      const input = elements(tree).find((element) => element.props?.type === "range");
      assert.equal(input.props["aria-label"], "Wall height");
      assert.equal(input.props["aria-valuetext"], `${percent}% of full wall height`);
      assert.equal(input.props.min, 15);
      assert.equal(input.props.max, 100);
      assert.equal(input.props.step, 1);
      assert.equal(input.props.value, percent);
      input.props.onChange({ target: { value: String(percent) } });
      assert.equal(changed, percent / 100);
    }
  }
});

test("display controls remain available with furniture panels, but not over plan review", () => {
  assert.match(renderToStaticMarkup(shell({ panelOpen: true })), /id="ws-wall-height"/);
  const reviewing = renderToStaticMarkup(shell({ reviewing: true }));
  assert.doesNotMatch(reviewing, /ws-wall-height|Whole house/);
  assert.match(reviewing, /Back to 3D/);
});

test("floor selector still passes the exact floor ID in whole-house view", () => {
  let changed;
  const tree = shell({ wholeBuilding: true, onFloor: (value) => { changed = value; } });
  elements(tree).find((element) => element.type === "select").props.onChange({ target: { value: "upper" } });
  assert.equal(changed, "upper");
});
