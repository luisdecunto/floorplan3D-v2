# Mobile workspace checkpoint

The pre-redesign checkpoint is `checkpoint/pre-mobile-workspace` (`15ce51f`).
Development branch: `codex/mobile-workspace-redesign`. Publishing remains the
existing GitHub Pages workflow; there is no new backend or hosting service.

## Interaction model

- Open an apartment directly into one persistent 3D workspace. Use the floor
  picker and 3D/Top control; editing is no longer a separate screen.
- Add furniture opens a bottom sheet on phones or a docked panel on desktop.
  Search, category and scroll are retained while previewing an item.
- Choosing a product creates an unsaved preview. Tap the floor or drag the
  preview, rotate/mirror it, then Place. Cancel does not change project data.
- Tap an existing item to select it, then drag to move. A drag begins after
  8 screen pixels and retains the original grab offset. Invalid releases roll
  back. A second pointer or cancelled selection cancels the object gesture.
- Empty-space drag orbits (3D) or pans (Top); two fingers pan/zoom. The ray plane
  includes the scene's -1.25 m offset and the selected floor's elevation.
- Context controls provide rotate 90°, mirror, delete and optional ±15°/10 cm
  adjustments. Arrows, Q/E, M, Delete, Enter, Escape and Ctrl/Cmd+Z work when the
  editor has focus. Existing furniture is also selectable by name in Project.
- Check plan shows the original image, zoom controls, wall selection, inline
  measurement and structural corrections. It pauses, rather than unmounts, 3D.
- Undo follows committed furniture and structural changes chronologically,
  retaining up to 40 in-session snapshots. Importing another project starts a
  new session history. Project JSON remains V2 with unchanged catalogue IDs.
- Export/share downloads a project file. Autosave is local IndexedDB and reports
  completion/failure. Sample apartments are explicitly not saved. Export backups
  before clearing browser data.

## Code map

| File | Responsibility |
| --- | --- |
| `app/page.tsx` | App lifecycle and user actions |
| `app/workspace-shell.tsx`, `app/workspace.css` | Responsive canvas-first layout |
| `app/workspace-panel.tsx` | Non-modal sheet/dock, focus restoration, expansion |
| `app/furniture-library.tsx`, `app/furniture-controls.tsx` | Catalogue and contextual editing |
| `app/workspace-state.ts` | Pure history, placement confirmation and gesture maths |
| `app/use-workspace-project.ts` | Canonical project state and serialized autosave |
| `app/viewer-camera.tsx`, `app/viewer-interaction.tsx` | Camera fitting, input ownership and world-space placement |
| `app/twin-viewer.tsx` | Existing structural meshes plus editable/preview furniture |
| `app/furniture-model.tsx` | Extracted, unchanged procedural furniture shapes |
| `app/plan-review.tsx`, `app/plan-controls.tsx` | Original-source overlay and corrections |
| `app/floorplan-intake.ts`, `app/floorplan-worker.ts` | Same detector at 1280 px; automatic, cancellable browser-worker intake |
| `scripts/generate-furniture-previews.mjs` | Build-only SVG snapshots of the procedural meshes |

Static previews are generated under `public/furniture-previews/`. They use the
same component geometry, colours and dimensions as the viewer; no manufacturer
meshes or photos and no per-card WebGL contexts. Run `npm run build:previews`
after changing procedural shapes. `build:pages` does this automatically.

## Verification and release

Verification on 2026-09-04: Pages validation passed (66 checks, one optional
private-corpus skip); the server build and combined test run also passed
(62 checks, the same skip). The browser harness passed its 17 assertions at all
four viewport sizes. Automatic image intake and reopening a locally saved
project were also checked in the browser.

Run `npm run validate:pages` for lint, Pages-specific TypeScript checking,
document, detector, region, stairs, furniture/history and static-build tests.
The optional private floorplan image corpus is absent in this checkout: its test
is explicitly skipped, not counted as a successful image regression. Detector
algorithms and structural mesh functions were preserved from the checkpoint.

For repeatable browser checks, start:

```powershell
npx vite --config vite.pages.config.ts --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173/floorplan3D/qa.html`. The development-only harness has
390×844, 844×390, 768×1024 and 1280×800 viewports. It imports a synthetic V2 file
through the real input, drives the rendered controls, and checks the real JSON
export. It also feeds a generated image into automatic worker analysis.
The harness is excluded from the Pages output and asserts that exclusion.

Browser checks cover backwards-compatible import, retained catalogue search,
preview/cancel/confirmation, invalid-placement rejection, undo, live camera ray
placement, upper-floor isolation, original-image review, persistent canvas,
mixed structural/furniture undo and horizontal overflow. Native multi-touch
capture on physical Android/iOS hardware should still be included in device QA;
the automated gesture tests exercise cancellation logic and coordinate maths.

Before merging, run validation with `PAGES_BASE_PATH=/floorplan3D-v2/`. After
pushing `main`, wait for the Pages workflow to succeed and verify the live app.
Project → Controls & project info shows the build commit to identify the release.

Rollback is a normal revert of the redesign release commit, followed by the same
Pages workflow. Never reset away newer user changes or clear users' saved data.
