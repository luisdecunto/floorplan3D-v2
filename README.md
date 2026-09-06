# Planform

Planform turns ordinary floorplan files into a structured, multi-level 3D digital twin that can be reviewed and explored from desktop or mobile.

[Open the live planner](https://luisdecunto.github.io/floorplan3D-v2/)

For a detailed description of the current image-analysis rules, confidence hierarchy, user corrections, and 3D generation mechanism, see the [compiled algorithms report](output/pdf/planform_v2_algorithms_report.pdf), its [LaTeX source](docs/planform_algorithms_report.tex), or the shorter [rules reference](docs/HOW_PLANFORM_WORKS.md).

This repository currently contains the first product vertical slice:

- image and document intake;
- lightweight floor-region proposals for separated plans;
- a responsive multi-level review workspace;
- metric scene entities for levels, walls and openings;
- a touch-enabled Three.js viewer with true door and window gaps;
- local project persistence and JSON backup;
- secret-link live collaboration backed by a per-apartment Durable Object, with a bounded activity timeline and version restore;
- a mobile-accessible GitHub Pages deployment.

The trained semantic CV pipeline, arbitrary-geometry correction, account-based ownership, and cross-device room discovery are future milestones. The current project identifies its analyser as a browser-based geometry/topology fallback rather than presenting it as a trained model.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Production checks:

```bash
npm run lint
npm run build
npm test
```

## Architecture

The browser currently owns image analysis, responsive review, local persistence, and derived 3D rendering. The canonical model stores editable building structure, not meshes. A future Python/GPU service can add semantic proposals without replacing the geometry/topology validator or the canonical document.

Live collaboration is the only server-backed feature. The static application stays on GitHub Pages, while `collaboration-worker/` provides persistent shared rooms and hibernating WebSockets through Cloudflare Durable Objects. Source floorplan images are removed before room creation. The edit capability lives in the collaboration link fragment and is never sent as part of an ordinary page request. Each room keeps the latest 50 accepted revisions with collaborator labels and read-only snapshots; restoring one creates a new revision and is guarded against concurrent edits.

The production collaboration endpoint is `https://planform-collaboration.luisdcnt.workers.dev`, hosted in the `luisdcnt@gmail.com` Cloudflare account. Set `VITE_COLLABORATION_URL` to override it for another deployment. Durable Object room state is account-bound and cannot be moved between accounts, so the app makes one automatic fallback to the legacy Cocoscraper Worker for a pre-migration invite link. New rooms are always created in Luisdcnt.

The website is built with React, TypeScript, React Three Fiber and Three.js. The same client application has two build targets while the hosting migration is in progress: vinext for the existing Sites deployment and a static Vite bundle for GitHub Pages.

## GitHub Pages

Build the static site locally with:

```bash
npm run validate:pages
```

The generated site lives in `pages-dist/`. GitHub Actions validates and deploys that directory on every push to `main`. The default project path is `/floorplan3D/`; set `PAGES_BASE_PATH=/` when moving to a custom domain.

The public `VITE_COLLABORATION_URL` build variable points the static client at the collaboration Worker. Deploy that service with:

```bash
npm run check:collaboration-worker
npm run deploy:collaboration
```

These scripts use this repository's private `.wrangler-luisdcnt` Wrangler profile, keeping it separate from the default Cocoscraper profile. `wrangler.collaboration.jsonc` also pins the Luisdcnt Cloudflare account ID so Planform cannot be deployed to Cocoscraper by mistake.

## Regression fixtures

When present in a local checkout, user-supplied floorplans approved for internal product testing live in the Git-ignored `tests/fixtures/floorplans` directory. The local manifest records expected floor counts, arrangements, integrity hashes, and parsing challenges. These files are not repository or production assets, are excluded from deployment, and are not approved for model training or public redistribution.
# Collaboration names

Opening a live invite asks for a display name before joining. Recent names are saved on this device and reuse the same identity. The Project panel shows connected collaborators and marks your identity with “You”; multiple tabs with the same identity count once. Names are not verified accounts. Presence and history backend changes are pending deployment to the intended Cloudflare account.
