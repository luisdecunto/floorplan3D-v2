# Furniture GLB assets

Static GLB files for the furniture catalogue live here. This folder is
served as-is by both build targets (`vinext` and the GitHub Pages static
build), so anything placed here ships to every visitor's browser — **do not
add a file you don't have the rights to redistribute.**

## Why this folder is currently empty

The starter catalogue (`app/furniture-catalog.ts`) references a few real
IKEA products by name, dimensions, and product-page URL, purely as a
dimensional/style reference. None of them ship a GLB — every item renders
with the procedural fallback in `app/furniture-model.tsx`. Do not add a
ripped or scraped manufacturer mesh here to "complete" one of those entries;
that's exactly what this pipeline is designed to avoid.

Only add a GLB that is:
- modeled/scanned by you, or
- licensed under terms that explicitly permit redistribution in a web app
  (e.g. CC0, CC-BY with attribution kept in the catalogue entry), or
- covered by a purchased license that permits this kind of redistribution.

## Folder convention

```
public/models/<category-slug>/<catalog-item-id>.glb
```

- `<category-slug>` is a lowercase, hyphenated version of the item's
  `category` (e.g. `sofas`, `beds`, `tables`, `chairs`).
- `<catalog-item-id>` matches the item's `id` field in `FURNITURE_CATALOG`,
  so the file is self-documenting and there's no separate id-to-path map to
  keep in sync.

Example: a licensed model for the catalogue entry `id: "cove-armchair"`
(`category: "Chairs"`) would live at `public/models/chairs/cove-armchair.glb`.

## Wiring a GLB into the catalogue

1. Add the file under the path above.
2. In `app/furniture-catalog.ts`, set the entry's `glbUrl` to the path
   relative to `public/` (e.g. `"models/chairs/cove-armchair.glb"`), and
   update `license` to describe the actual provenance of the mesh (type
   other than `"procedural-only"`, plus `owner`/`attributionUrl`/`notes` as
   applicable).
3. Nothing else changes — placement, collision, dragging, rotation, and
   mirroring are all driven by the catalogue's `width`/`height`/`depth`
   (and optional `footprint` override), never by the mesh itself. The
   loader in `app/furniture-model.tsx` automatically scales and centers
   whatever geometry it finds to match those dimensions, so the model can be
   authored at any convenient scale/pivot.
4. If the GLB fails to load (missing file, bad path, network hiccup), the
   viewer automatically falls back to the procedural renderer — you don't
   need a manual guard.

## Keeping things static-hosting friendly

- No Draco/meshopt decoder is wired up — keep files as plain (uncompressed
  transform, embedded textures) GLBs, and keep them small; a floorplan scene
  may place many instances of the same catalogue item.
- Everything here is fetched as a static file over HTTP — no backend, no
  external API, and it works unchanged on GitHub Pages under the repo's
  base path.
