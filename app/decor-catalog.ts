import type { FurnitureCatalogItem } from "./furniture-catalog";

const reference = { sourceCheckedAt: "2026-09-05", modelProvenance: "original-procedural" } as const;
const ikea = { ...reference, brand: "IKEA", collection: "IKEA" } as const;
const jysk = { ...reference, brand: "JYSK", collection: "JYSK" } as const;

/**
 * Lighting and wall décor use retailer dimensions but original procedural
 * geometry. Wall elevations and pendant drops are editable-placement defaults,
 * not measurements claimed by the retailer.
 */
export const DECOR_CATALOG: FurnitureCatalogItem[] = [
  {
    ...ikea, id: "ikea-lauters-floor-30405042", name: "LAUTERS tripod floor lamp", articleNumber: "304.050.42",
    category: "Lighting", shape: "floor-lamp", width: 0.62, depth: 0.62, height: 1.51,
    color: "#eeeae1", accentColor: "#b98d60", upholstery: "Ash / white · preview at maximum adjustable height",
    materials: ["Solid ash", "Recycled polyester", "Polypropylene"], mount: { type: "floor" },
    decor: { variant: "tripod-floor", shadeDiameter: 0.37, shadeHeight: 0.28 },
    sourceUrl: "https://www.ikea.com/dk/da/p/lauters-gulvlampe-ask-hvid-30405042/",
  },
  {
    ...ikea, id: "ikea-lersta-floor-20428789", name: "LERSTA floor reading lamp", articleNumber: "204.287.89",
    category: "Lighting", shape: "floor-lamp", width: 0.25, depth: 0.25, height: 1.31,
    color: "#f1f0e9", accentColor: "#c8c8c2", upholstery: "White · adjustable reading head",
    materials: ["Aluminium", "Steel", "Concrete", "Polyethylene"], mount: { type: "floor" },
    decor: { variant: "reading-floor", shadeDiameter: 0.15, shadeHeight: 0.16 },
    sourceUrl: "https://www.ikea.com/dk/da/p/lersta-gulv-laeselampe-hvid-20428789/",
  },
  {
    ...jysk, id: "jysk-hansson-floor-4911923", name: "HANSSON floor lamp", articleNumber: "4911923",
    category: "Lighting", shape: "floor-lamp", width: 0.22, depth: 0.22, height: 1.55,
    color: "#252726", accentColor: "#1a1c1b", upholstery: "Black / chrome · Ø22 cm",
    materials: ["Metal", "Plastic"], mount: { type: "floor" },
    decor: { variant: "pole-floor", shadeDiameter: 0.18, shadeHeight: 0.22 },
    sourceUrl: "https://jysk.dk/indretning/belysning/lamper/gulvlampe-hansson-h155cm-sort",
  },
  {
    ...jysk, id: "jysk-dani-floor-4912496", name: "DANI rattan floor lamp", articleNumber: "4912496",
    category: "Lighting", shape: "floor-lamp", width: 0.33, depth: 0.33, height: 0.54,
    color: "#bd9560", accentColor: "#8c683f", upholstery: "Brown rattan · Ø33 cm",
    materials: ["Bamboo", "Eucalyptus", "Rattan"], mount: { type: "floor" },
    decor: { variant: "lantern-floor", shadeDiameter: 0.33, shadeHeight: 0.54 },
    sourceUrl: "https://jysk.dk/indretning/belysning/lamper/gulvlampe-dani-h54cm-brun",
  },
  {
    ...ikea, id: "ikea-nymane-wall-50415224", name: "NYMÅNE wall reading lamp", articleNumber: "504.152.24",
    category: "Lighting", shape: "wall-lamp", width: 0.07, depth: 0.15, height: 0.11,
    color: "#343735", accentColor: "#242624", upholstery: "Anthracite · default centre height 1.35 m",
    materials: ["Steel", "Aluminium"], mount: { type: "wall", elevation: 1.35 },
    decor: { variant: "wall-spot", shadeDiameter: 0.07, shadeHeight: 0.08 },
    sourceUrl: "https://www.ikea.com/dk/da/p/nymane-vaeg-laeselampe-antracit-50415224/",
  },
  {
    ...ikea, id: "ikea-skurup-pendant-80407114", name: "SKURUP pendant lamp 38 cm", articleNumber: "804.071.14",
    category: "Lighting", shape: "pendant-lamp", width: 0.38, depth: 0.38, height: 0.29,
    color: "#252625", accentColor: "#181918", upholstery: "Black steel · default pendant drop 75 cm",
    materials: ["Steel", "Polypropylene"], mount: { type: "ceiling", drop: 0.75 },
    decor: { variant: "metal-pendant", shadeDiameter: 0.38, shadeHeight: 0.29 },
    sourceUrl: "https://www.ikea.com/dk/da/p/skurup-loftlampe-sort-80407114/",
  },
  {
    ...ikea, id: "ikea-sinnerlig-pendant-70311697", name: "SINNERLIG bamboo pendant lamp 50 cm", articleNumber: "703.116.97",
    category: "Lighting", shape: "pendant-lamp", width: 0.50, depth: 0.50, height: 0.54,
    color: "#c59d62", accentColor: "#886638", upholstery: "Handwoven bamboo · default pendant drop 90 cm",
    materials: ["Bamboo", "Polypropylene", "Steel"], mount: { type: "ceiling", drop: 0.90 },
    decor: { variant: "woven-pendant", shadeDiameter: 0.50, shadeHeight: 0.54 },
    sourceUrl: "https://www.ikea.com/dk/da/p/sinnerlig-loftlampe-bambus-handlavet-70311697/",
  },
  {
    ...ikea, id: "ikea-nissedal-mirror-30320316", name: "NISSEDAL wall mirror 40×150", articleNumber: "303.203.16",
    category: "Wall décor", shape: "mirror", width: 0.40, depth: 0.04, height: 1.50,
    color: "#f1efe8", accentColor: "#9cabad", upholstery: "White frame · vertical wall placement",
    materials: ["Fibreboard", "Plastic foil", "Mirror glass"], mount: { type: "wall", elevation: 1.20 },
    decor: { variant: "mirror" },
    sourceUrl: "https://www.ikea.com/dk/da/p/nissedal-spejl-hvid-30320316/",
  },
  {
    ...ikea, id: "ikea-knoppang-frame-80427305", name: "KNOPPÄNG picture frame 50×70", articleNumber: "804.273.05",
    category: "Wall décor", shape: "picture", width: 0.52, depth: 0.02, height: 0.72,
    color: "#f3f1eb", accentColor: "#6f8279", upholstery: "White frame · muted landscape placeholder",
    materials: ["Fibreboard", "Paper foil", "Styrene plastic"], mount: { type: "wall", elevation: 1.50 },
    decor: { variant: "picture" },
    sourceUrl: "https://www.ikea.com/dk/da/p/knoppaeng-ramme-hvid-80427305/",
  },
];
