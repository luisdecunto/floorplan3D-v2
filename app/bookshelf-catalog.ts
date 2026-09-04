import type { FurnitureCatalogItem } from "./furniture-catalog";

// Outer assembled dimensions checked on the linked IKEA Denmark pages.
// Models and thumbnails are original procedural approximations, not IKEA assets.
const ikea = {
  brand: "IKEA",
  collection: "IKEA",
  sourceCheckedAt: "2026-09-04",
  modelProvenance: "original-procedural",
} as const;

export const BOOKSHELF_CATALOG: FurnitureCatalogItem[] = [
  {
    ...ikea, id: "ikea-billy-80-00263850", name: "BILLY bookcase 80 cm", articleNumber: "002.638.50",
    category: "Bookcases", shape: "bookcase", width: 0.80, depth: 0.28, height: 2.02,
    color: "#f2f1eb", accentColor: "#d8d7d0", upholstery: "White · 5 adjustable/fixed shelves",
    materials: ["Particleboard", "Paper foil", "Melamine foil", "Fibreboard"],
    shelving: { system: "billy", sections: 1, shelvesPerSection: 5 },
    sourceUrl: "https://www.ikea.com/dk/da/p/billy-reol-hvid-00263850/",
  },
  {
    ...ikea, id: "ikea-billy-40-50263838", name: "BILLY narrow bookcase", articleNumber: "502.638.38",
    category: "Bookcases", shape: "bookcase", width: 0.40, depth: 0.28, height: 2.02,
    color: "#f2f1eb", accentColor: "#d8d7d0", upholstery: "White · narrow 40 cm frame · 5 adjustable/fixed shelves",
    materials: ["Particleboard", "Paper foil", "Melamine foil", "Fibreboard"],
    shelving: { system: "billy", sections: 1, shelvesPerSection: 5 },
    sourceUrl: "https://www.ikea.com/dk/da/p/billy-reol-hvid-50263838/",
  },
  {
    ...ikea, id: "ikea-ivar-30-89404578", name: "IVAR shelving unit 30 cm", articleNumber: "894.045.78",
    category: "Bookcases", shape: "bookcase", width: 0.89, depth: 0.30, height: 1.79,
    color: "#cba774", accentColor: "#ad8759", upholstery: "Untreated pine · 5 shelves · shallow frame",
    materials: ["Solid pine", "Galvanized steel"],
    shelving: { system: "ivar", sections: 1, shelvesPerSection: 5 },
    sourceUrl: "https://www.ikea.com/dk/da/p/ivar-reol-fyr-s89404578/",
  },
  {
    ...ikea, id: "ikea-ivar-50-39407070", name: "IVAR shelving unit 50 cm", articleNumber: "394.070.70",
    category: "Bookcases", shape: "bookcase", width: 0.89, depth: 0.50, height: 1.79,
    color: "#cba774", accentColor: "#ad8759", upholstery: "Untreated pine · 5 shelves · deep frame",
    materials: ["Solid pine", "Galvanized steel"],
    shelving: { system: "ivar", sections: 1, shelvesPerSection: 5 },
    sourceUrl: "https://www.ikea.com/dk/da/p/ivar-reol-fyr-s39407070/",
  },
  {
    ...ikea, id: "ikea-ivar-box-59403815", name: "IVAR shelving with storage box", articleNumber: "594.038.15",
    category: "Bookcases", shape: "bookcase", width: 0.89, depth: 0.30, height: 1.79,
    color: "#cba774", accentColor: "#ad8759", upholstery: "Untreated pine · 4 shelves · rolling storage box",
    materials: ["Solid pine", "Galvanized steel"],
    shelving: { system: "ivar", sections: 1, shelvesPerSection: 4, storageBox: true },
    sourceUrl: "https://www.ikea.com/dk/da/p/ivar-reol-med-opbevaringskasse-fyr-s59403815/",
  },
  {
    ...ikea, id: "ikea-ivar-cabinets-39403939", name: "IVAR 2 sections with cabinets", articleNumber: "394.039.39",
    category: "Bookcases", shape: "bookcase", width: 1.74, depth: 0.30, height: 1.79,
    color: "#cba774", accentColor: "#ad8759", upholstery: "Untreated pine · 2 sections · 6 shelves · 2 lower cabinets",
    materials: ["Solid pine", "Fibreboard", "Galvanized steel"],
    shelving: { system: "ivar", sections: 2, shelvesPerSection: 3, lowerCabinets: 2 },
    sourceUrl: "https://www.ikea.com/dk/da/p/ivar-2-sektioner-hylder-skab-fyr-s39403939/",
  },
];
