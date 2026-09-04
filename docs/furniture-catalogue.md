# Retail furniture catalogue

This expansion adds 14 products to the existing 47 (61 total). The new entries
are in `app/retail-furniture-catalog.ts`. All original placement IDs, dimensions
and procedural shapes are retained. Four existing coffee tables are regrouped
under Coffee tables; the Tables filter includes coffee tables as well.

The catalogue now has a brand selector (IKEA, JYSK, Originals) alongside search.
Product links name the correct retailer. No backend, stock/price API, remote
texture, manufacturer photo or manufacturer mesh is added.

## Product references

Checked 2026-09-04 against the linked Danish retailer pages. Dimensions below
are assembled **width × depth × height in metres**, not package sizes. For
rectangular tables, the retailer's length is the model's X/width axis. For round
tables, width and depth both equal diameter. Stock and prices are not tracked.

| Product | W × D × H (m) | Reference |
| --- | --- | --- |
| IKEA KLEPPSTAD, 2 doors | 0.79 × 0.55 × 1.76 | [804.372.34](https://www.ikea.com/dk/da/p/kleppstad-garderobeskab-med-2-dore-hvid-80437234/) |
| IKEA KLEPPSTAD, 3 doors | 1.17 × 0.55 × 1.76 | [004.417.58](https://www.ikea.com/dk/da/p/kleppstad-garderobeskab-med-3-dore-hvid-00441758/) |
| IKEA HAVSTA cupboard | 0.81 × 0.47 × 0.89 | [005.292.42](https://www.ikea.com/dk/da/p/havsta-skab-med-sokkel-hvid-00529242/) |
| IKEA BRIMNES cupboard | 0.78 × 0.41 × 0.95 | [803.006.60](https://www.ikea.com/dk/da/p/brimnes-skab-med-lager-sort-80300660/) |
| IKEA LACK coffee table | 1.18 × 0.78 × 0.45 | [804.499.01](https://www.ikea.com/dk/da/p/lack-sofabord-hvid-80449901/) |
| IKEA KRAGSTA coffee table | 0.90 × 0.90 × 0.48 | [202.866.38](https://www.ikea.com/dk/da/p/kragsta-sofabord-hvid-20286638/) |
| IKEA JAKOBSFORS coffee table | 0.80 × 0.80 × 0.42 | [905.001.21](https://www.ikea.com/dk/da/p/jakobsfors-sofabord-egetraesfiner-90500121/) |
| JYSK BILLUND wardrobe | 0.80 × 0.51 × 1.93 | [3611113](https://jysk.dk/opbevaring/garderobeskabe/garderobeskab-billund-80x193-hvid-natur-egefarve) |
| JYSK VEDDE wardrobe | 1.67 × 0.53 × 1.97 | [3601087](https://jysk.dk/opbevaring/garderobeskabe/garderobeskab-vedde-167x197-m-spejl-vild-moerk-egefarve) |
| JYSK SKALS cupboard, with legs | 0.71 × 0.35 × 0.81 | [3640396](https://jysk.dk/opbevaring/reoler-og-rumdelere/reolmodul-skals-skab-2-laager-hvid-0) |
| JYSK SALTVIG cupboard | 0.80 × 0.35 × 1.15 | [3601188](https://jysk.dk/spisestue/vitrineskabe/skab-saltvig-2-laager-ask) |
| JYSK SNESLEV coffee table | 0.70 × 0.70 × 0.41 | [3640374](https://jysk.dk/stue/sofaborde-og-sideborde/sofabord-sneslev-oe70-natur-egefarve) |
| JYSK MARKSKEL coffee table | 1.10 × 0.60 × 0.53 | [3681141](https://jysk.dk/stue/sofaborde-og-sideborde/sofabord-markskel-60x110-hvid-vild-natur-egefarve) |
| JYSK LYNGVIG coffee table | 1.10 × 0.60 × 0.45 | [3650037](https://jysk.dk/stue/sofaborde-og-sideborde/sofabord-lyngvig-60x110-m-hylde-natur-eg) |

## Rendering and limitations

- `app/furniture-retail-model.tsx` supplies reusable storage and table variants.
  New optional `storage` / `table` fields select doors, drawers, mirror panels,
  panelled/rattan-style fronts, plinths/legs, round tops and solid/slatted shelves.
- New entries carry brand, materials, source URL/article, check date, and
  `modelProvenance: "original-procedural"`. Legacy metadata remains valid.
- Outer bounds match catalogue dimensions, including handles. Cabinet fronts
  face local -Z and follow placement rotation/mirroring, not a fixed compass side.
- Colours, internal joinery, shelf heights, feet and face details are approximate.
  Mirror panels use a metallic material, not a live reflection. No door animation.
- Collision retains the existing rectangular envelope (conservative for round
  tops). Cabinet doors are closed; door-swing clearance and assembly/anchoring
  requirements must be checked separately against the retailer's instructions.
- This does not alter floorplan-detected built-ins, fixtures or stairs.
- Static SVG thumbnails come from the same mesh components via
  `npm run build:previews`. The Pages test compares emitted thumbnail filenames
  against the actual catalogue, so missing products cannot silently be omitted.

`npm run test:furniture` checks factual dimensions, retailer/category filtering,
rotated wall/furniture collisions, actual procedural bounds and front details,
plus the existing placement/history and workspace controls. `npm run
validate:pages` includes these tests and the static build.

## Bookcases and IVAR configurations

Six IKEA bookcases extend the catalogue to 67 pieces. BILLY is rendered as an
enclosed case with back panel, plinth and five shelves. IVAR uses open pine
uprights, shelves and a simplified rear cross-brace; the combination variants
also show their lower cabinets or rolling storage box. These are original
procedural models with the same sourcing and placement rules described above.

| Product | W × D × H (m) | Reference |
| --- | --- | --- |
| IKEA BILLY bookcase, 80 cm | 0.80 × 0.28 × 2.02 | [002.638.50](https://www.ikea.com/dk/da/p/billy-reol-hvid-00263850/) |
| IKEA BILLY narrow bookcase | 0.40 × 0.28 × 2.02 | [502.638.38](https://www.ikea.com/dk/da/p/billy-reol-hvid-50263838/) |
| IKEA IVAR shelving, shallow | 0.89 × 0.30 × 1.79 | [894.045.78](https://www.ikea.com/dk/da/p/ivar-reol-fyr-s89404578/) |
| IKEA IVAR shelving, deep | 0.89 × 0.50 × 1.79 | [394.070.70](https://www.ikea.com/dk/da/p/ivar-reol-fyr-s39407070/) |
| IKEA IVAR with storage box | 0.89 × 0.30 × 1.79 | [594.038.15](https://www.ikea.com/dk/da/p/ivar-reol-med-opbevaringskasse-fyr-s59403815/) |
| IKEA IVAR, 2 sections/cabinets | 1.74 × 0.30 × 1.79 | [394.039.39](https://www.ikea.com/dk/da/p/ivar-2-sektioner-hylder-skab-fyr-s39403939/) |
