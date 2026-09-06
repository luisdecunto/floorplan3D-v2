import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

// Compile the real TSX component without a browser or a listening HTTP server.
const server = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)), configFile: false,
  cacheDir: fileURLToPath(new URL("../node_modules/.vite-workspace-shell", import.meta.url)),
  plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, ws: false }, appType: "custom",
});
after(() => server.close());
const { WorkspaceShell } = await server.ssrLoadModule("/app/workspace-shell.tsx");
const { PANEL_SWIPE_THRESHOLD, panelExpansionAfterSwipe } = await server.ssrLoadModule("/app/workspace-panel.tsx");
const { CollaborationHistory } = await server.ssrLoadModule("/app/collaboration-history.tsx");
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

test("bottom-sheet swipes snap upward to full catalogue and downward to the room", () => {
  assert.equal(panelExpansionAfterSwipe(false, -PANEL_SWIPE_THRESHOLD), true);
  assert.equal(panelExpansionAfterSwipe(true, PANEL_SWIPE_THRESHOLD), false);
  assert.equal(panelExpansionAfterSwipe(false, -PANEL_SWIPE_THRESHOLD + 1), false);
  assert.equal(panelExpansionAfterSwipe(true, PANEL_SWIPE_THRESHOLD - 1), true);
});

test("collaboration history shows readable edits and restore affordance", () => {
  const entries = [
    { revision: 4, operationId: "op-4", actorId: "a", actorName: "Guest 24", createdAt: "2026-09-05T12:00:00.000Z", kind: "move-furniture", catalogId: "ikea-friheten-39216754", targetId: "sofa" },
    { revision: 3, operationId: "op-3", actorId: "b", actorName: "Luis", createdAt: "2026-09-05T11:00:00.000Z", kind: "add-furniture", catalogId: "ikea-lack-table-40104294", targetId: "table" },
  ];
  const html = renderToStaticMarkup(CollaborationHistory({ entries, previewRevision: 4, loadingRevision: null, canRestore: true, onPreview: noop, onRestore: noop }));
  assert.match(html, /Recent changes/);
  assert.match(html, /moved FRIHETEN corner sofa-bed/);
  assert.match(html, /added LACK coffee table/);
  assert.match(html, /Previewing this version/);
  assert.match(html, /Restore/);
});
