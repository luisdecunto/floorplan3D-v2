import type { FurnitureCatalogItem } from "./furniture-catalog";

// Outer assembled dimensions checked on the linked Danish retailer pages.
// Only factual references are retained: all meshes/thumbnails are our own
// procedural approximations. Front details, colours and supports are simplified.
const reference = { sourceCheckedAt: "2026-09-04", modelProvenance: "original-procedural" } as const;
const ikea = { ...reference, brand: "IKEA", collection: "IKEA" } as const;
const jysk = { ...reference, brand: "JYSK", collection: "JYSK" } as const;

export const RETAIL_FURNITURE_CATALOG: FurnitureCatalogItem[] = [
  {
    ...ikea, id: "ikea-kleppstad-2-80437234", name: "KLEPPSTAD 2-door wardrobe", articleNumber: "804.372.34",
    category: "Wardrobes", shape: "wardrobe", width: 0.79, depth: 0.55, height: 1.76,
    color: "#f3f1eb", accentColor: "#d5d1c8", upholstery: "White · 2 hinged doors",
    materials: ["Particleboard", "Paper foil", "Fibreboard"], storage: { doors: 2 },
    sourceUrl: "https://www.ikea.com/dk/da/p/kleppstad-garderobeskab-med-2-dore-hvid-80437234/",
  },
  {
    ...ikea, id: "ikea-kleppstad-3-00441758", name: "KLEPPSTAD 3-door wardrobe", articleNumber: "004.417.58",
    category: "Wardrobes", shape: "wardrobe", width: 1.17, depth: 0.55, height: 1.76,
    color: "#f3f1eb", accentColor: "#d5d1c8", upholstery: "White · 3 hinged doors",
    materials: ["Particleboard", "Paper foil", "Fibreboard"], storage: { doors: 3 },
    sourceUrl: "https://www.ikea.com/dk/da/p/kleppstad-garderobeskab-med-3-dore-hvid-00441758/",
  },
  {
    ...ikea, id: "ikea-havsta-00529242", name: "HAVSTA cupboard with plinth", articleNumber: "005.292.42",
    category: "Cupboards", shape: "cabinet", width: 0.81, depth: 0.47, height: 0.89,
    color: "#efede6", accentColor: "#d2cec3", upholstery: "White stained pine · 2 panelled doors",
    materials: ["Solid pine", "Fibreboard"], storage: { doors: 2, front: "panel", baseHeight: 0.10 },
    sourceUrl: "https://www.ikea.com/dk/da/p/havsta-skab-med-sokkel-hvid-00529242/",
  },
  {
    ...ikea, id: "ikea-brimnes-cabinet-80300660", name: "BRIMNES 2-door cupboard", articleNumber: "803.006.60",
    category: "Cupboards", shape: "cabinet", width: 0.78, depth: 0.41, height: 0.95,
    color: "#333431", accentColor: "#212320", upholstery: "Black · 2 hinged doors",
    materials: ["Particleboard", "Paper foil", "Fibreboard"], storage: { doors: 2, front: "panel" },
    sourceUrl: "https://www.ikea.com/dk/da/p/brimnes-skab-med-lager-sort-80300660/",
  },
  {
    ...ikea, id: "ikea-lack-118-80449901", name: "LACK coffee table 118×78", articleNumber: "804.499.01",
    category: "Coffee tables", shape: "table", width: 1.18, depth: 0.78, height: 0.45,
    color: "#f1efe8", accentColor: "#e2dfd6", upholstery: "White · lower storage shelf",
    materials: ["Particleboard", "Fibreboard", "Paper filling"], table: { top: "rectangle", shelf: "solid", legStyle: "square" },
    sourceUrl: "https://www.ikea.com/dk/da/p/lack-sofabord-hvid-80449901/",
  },
  {
    ...ikea, id: "ikea-kragsta-20286638", name: "KRAGSTA round coffee table", articleNumber: "202.866.38",
    category: "Coffee tables", shape: "table", width: 0.90, depth: 0.90, height: 0.48,
    color: "#f1efe8", accentColor: "#e0dcd3", upholstery: "White · Ø90 cm",
    materials: ["Fibreboard", "Laminated beech and walnut"], table: { top: "round", legs: 4, legStyle: "round" },
    sourceUrl: "https://www.ikea.com/dk/da/p/kragsta-sofabord-hvid-20286638/",
  },
  {
    ...ikea, id: "ikea-jakobsfors-90500121", name: "JAKOBSFORS round coffee table", articleNumber: "905.001.21",
    category: "Coffee tables", shape: "table", width: 0.80, depth: 0.80, height: 0.42,
    color: "#c5a170", accentColor: "#ab8656", upholstery: "Oak veneer · Ø80 cm · lower shelf",
    materials: ["Oak veneer", "Plywood", "Solid birch"], table: { top: "round", shelf: "solid", legs: 3, legStyle: "round" },
    sourceUrl: "https://www.ikea.com/dk/da/p/jakobsfors-sofabord-egetraesfiner-90500121/",
  },
  {
    ...jysk, id: "jysk-billund-3611113", name: "BILLUND wardrobe with drawers", articleNumber: "3611113",
    category: "Wardrobes", shape: "wardrobe", width: 0.80, depth: 0.51, height: 1.93,
    color: "#f0efe8", accentColor: "#b89970", upholstery: "White / natural oak look · 2 doors, 2 drawers",
    materials: ["Fibreboard", "Melamine", "HDF"], storage: { doors: 2, drawers: 2 },
    sourceUrl: "https://jysk.dk/opbevaring/garderobeskabe/garderobeskab-billund-80x193-hvid-natur-egefarve",
  },
  {
    ...jysk, id: "jysk-vedde-3601087", name: "VEDDE mirrored wardrobe", articleNumber: "3601087",
    category: "Wardrobes", shape: "wardrobe", width: 1.67, depth: 0.53, height: 1.97,
    color: "#766049", accentColor: "#504638", upholstery: "Dark oak look · 3 doors, 1 mirror",
    materials: ["Melamine", "Fibreboard", "MDF", "Mirror glass"], storage: { doors: 3, mirrorDoor: 1 },
    sourceUrl: "https://jysk.dk/opbevaring/garderobeskabe/garderobeskab-vedde-167x197-m-spejl-vild-moerk-egefarve",
  },
  {
    ...jysk, id: "jysk-skals-3640396", name: "SKALS cupboard with legs", articleNumber: "3640396",
    category: "Cupboards", shape: "cabinet", width: 0.71, depth: 0.35, height: 0.81,
    color: "#f0eee8", accentColor: "#d4d0c7", upholstery: "White · freestanding version with legs (81 cm high)",
    materials: ["MDF", "Fibreboard", "Foil", "ABS plastic"], storage: { doors: 2, base: "legs", baseHeight: 0.10 },
    sourceUrl: "https://jysk.dk/opbevaring/reoler-og-rumdelere/reolmodul-skals-skab-2-laager-hvid-0",
  },
  {
    ...jysk, id: "jysk-saltvig-3601188", name: "SALTVIG rattan-door cupboard", articleNumber: "3601188",
    category: "Cupboards", shape: "cabinet", width: 0.80, depth: 0.35, height: 1.15,
    color: "#c3a272", accentColor: "#a68659", upholstery: "Ash / rattan · 2 doors",
    materials: ["Solid ash", "Ash veneer", "MDF", "Rattan", "Steel"], storage: { doors: 2, front: "rattan", base: "legs", baseHeight: 0.20 },
    sourceUrl: "https://jysk.dk/spisestue/vitrineskabe/skab-saltvig-2-laager-ask",
  },
  {
    ...jysk, id: "jysk-sneslev-3640374", name: "SNESLEV round coffee table", articleNumber: "3640374",
    category: "Coffee tables", shape: "table", width: 0.70, depth: 0.70, height: 0.41,
    color: "#bea077", accentColor: "#30312e", upholstery: "Natural oak look / steel · Ø70 cm · lower shelf",
    materials: ["MDF", "Melamine", "Steel"], table: { top: "round", shelf: "solid", legStyle: "round" },
    sourceUrl: "https://jysk.dk/stue/sofaborde-og-sideborde/sofabord-sneslev-oe70-natur-egefarve",
  },
  {
    ...jysk, id: "jysk-markskel-3681141", name: "MARKSKEL coffee table", articleNumber: "3681141",
    category: "Coffee tables", shape: "table", width: 1.10, depth: 0.60, height: 0.53,
    color: "#bfa178", accentColor: "#edeae1", upholstery: "White / natural oak look · lower shelf",
    materials: ["Fibreboard", "Melamine", "Plastic"], table: { top: "rectangle", shelf: "solid", support: "panels" },
    sourceUrl: "https://jysk.dk/stue/sofaborde-og-sideborde/sofabord-markskel-60x110-hvid-vild-natur-egefarve",
  },
  {
    ...jysk, id: "jysk-lyngvig-3650037", name: "LYNGVIG coffee table with shelf", articleNumber: "3650037",
    category: "Coffee tables", shape: "table", width: 1.10, depth: 0.60, height: 0.45,
    color: "#c3a073", accentColor: "#ad885c", upholstery: "Natural oak · slatted lower shelf",
    materials: ["Solid oak", "Oak veneer", "Fibreboard"], table: { top: "rectangle", shelf: "slatted", legStyle: "round" },
    sourceUrl: "https://jysk.dk/stue/sofaborde-og-sideborde/sofabord-lyngvig-60x110-m-hylde-natur-eg",
  },
];
