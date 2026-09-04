import type { FurnitureCatalogItem } from "./furniture-catalog";

const ikea = (
  id: string,
  name: string,
  category: FurnitureCatalogItem["category"],
  shape: FurnitureCatalogItem["shape"],
  width: number,
  depth: number,
  height: number,
  color: string,
  accentColor: string,
  upholstery = "IKEA catalogue reference",
): FurnitureCatalogItem => ({
  id,
  name,
  collection: "IKEA",
  category,
  shape,
  width,
  depth,
  height,
  upholstery,
  color,
  accentColor,
});

/**
 * Dimension-first IKEA catalogue references. These are procedural previews,
 * not copied manufacturer models. Product dimensions are intentionally kept
 * in metres so placement and collision stay consistent with the floorplan.
 */
export const EXTENDED_IKEA_CATALOG: FurnitureCatalogItem[] = [
  ikea("ikea-malm-90", "MALM bed frame 90×200", "Beds", "bed", 0.96, 2.09, 0.47, "#eee9df", "#d2cec5", "White finish · mattress 90 × 200 cm"),
  ikea("ikea-brimnes-140", "BRIMNES bed frame with storage", "Beds", "bed", 1.46, 2.06, 0.47, "#f1f0eb", "#d8d5cc", "White finish · mattress 140 × 200 cm"),
  ikea("ikea-nordli-160", "NORDLI bed frame with storage", "Beds", "bed", 1.76, 2.06, 0.66, "#f0eee8", "#cfcbc0", "White finish · mattress 160 × 200 cm"),
  ikea("ikea-slakt-90", "SLÄKT bed frame with underbed", "Beds", "bed", 0.96, 2.08, 0.78, "#f0eee9", "#d5d0c5", "White finish · mattress 90 × 200 cm"),
  ikea("ikea-hemnes-160", "HEMNES bed frame", "Beds", "bed", 1.76, 2.09, 0.66, "#b9b0a1", "#8f8170", "Stained pine · mattress 160 × 200 cm"),
  ikea("ikea-vihals-90", "VIHALS bed frame", "Beds", "bed", 0.96, 2.06, 0.73, "#f3f1eb", "#d7d2c7", "White finish · mattress 90 × 200 cm"),
  ikea("ikea-idanas-160", "IDANÄS upholstered bed", "Beds", "bed", 1.76, 2.15, 1.05, "#b8aaa0", "#8f7c70", "Beige upholstery · mattress 160 × 200 cm"),
  ikea("ikea-kura-90", "KURA reversible bed", "Beds", "bed", 0.99, 2.09, 0.66, "#d9c4a1", "#8d6949", "Pine veneer · mattress 90 × 200 cm"),

  ikea("ikea-klippan-2", "KLIPPAN 2-seat sofa", "Sofas", "sofa", 1.80, 0.86, 0.66, "#777b73", "#5c6059", "Cotton-blend cover"),
  ikea("ikea-kivik-3", "KIVIK 3-seat sofa", "Sofas", "sofa", 2.28, 0.95, 0.83, "#77736c", "#5c5852", "Deep seat · fabric cover"),
  ikea("ikea-vimle-chaise", "VIMLE sofa with chaise longue", "Sofas", "chaise", 2.56, 1.64, 0.83, "#6f7470", "#555a56", "Modular fabric cover"),
  ikea("ikea-soderhamn-chaise", "SÖDERHAMN sofa with chaise longue", "Sofas", "chaise", 1.86, 1.51, 0.83, "#777b7a", "#555b5b", "Low profile · fabric cover"),
  ikea("ikea-ektorp-3", "EKTORP 3-seat sofa", "Sofas", "sofa", 2.18, 0.88, 0.88, "#aaa094", "#86796e", "Washable fabric cover"),
  ikea("ikea-parup-3", "PÄRUP 3-seat sofa", "Sofas", "sofa", 2.18, 0.86, 0.84, "#a7a49b", "#7e7b73", "Polyester fabric cover"),
  ikea("ikea-poang-armchair", "POÄNG armchair", "Chairs", "armchair", 0.68, 0.82, 0.94, "#c19d76", "#8d6949", "Layer-glued veneer · cushion"),

  ikea("ikea-micke-142", "MICKE desk", "Tables", "table", 1.42, 0.50, 0.75, "#f1f0eb", "#c9c5bd", "White finish"),
  ikea("ikea-linnmon-120", "LINNMON / ADILS table", "Tables", "table", 1.20, 0.60, 0.73, "#eee9df", "#c6c0b5", "Tabletop and steel legs"),
  ikea("ikea-lagkapten-alex-140", "LAGKAPTEN / ALEX desk", "Tables", "table", 1.40, 0.60, 0.73, "#e5e1d8", "#b9b4ac", "Tabletop with drawer unit"),
  ikea("ikea-tonstad-120", "TONSTAD extendable dining table", "Tables", "table", 1.20, 0.70, 0.75, "#b8956f", "#765b43", "Oak veneer"),
  ikea("ikea-ekedalen-120", "EKEDALEN dining table", "Tables", "table", 1.20, 0.80, 0.75, "#b49470", "#74563d", "Extendable oak veneer"),
  ikea("ikea-melltorp-75", "MELLTORP table", "Tables", "table", 0.75, 0.75, 0.74, "#eeeae1", "#77736d", "White laminate · steel"),
  ikea("ikea-vittsjo-coffee", "VITTSJÖ coffee table", "Tables", "table", 1.00, 0.50, 0.50, "#302b26", "#171514", "Black-brown and glass"),
  ikea("ikea-hemnes-coffee", "HEMNES coffee table", "Tables", "table", 0.90, 0.46, 0.46, "#b9a38a", "#806b57", "Solid pine"),
  ikea("ikea-hol-coffee", "HOL coffee table", "Tables", "table", 0.90, 0.50, 0.45, "#bd986c", "#88623e", "Solid acacia"),
  ikea("ikea-gladom", "GLADOM tray table", "Tables", "table", 0.45, 0.53, 0.47, "#5b6f68", "#3e4c48", "Powder-coated steel"),
  ikea("ikea-burvik", "BURVIK side table", "Tables", "table", 0.38, 0.38, 0.45, "#bd8d5e", "#805a3a", "Powder-coated steel and wood"),

  ikea("ikea-ingolf", "INGOLF chair", "Chairs", "chair", 0.45, 0.54, 0.91, "#f0ebe0", "#ae9b82", "Solid wood"),
  ikea("ikea-adde", "ADDE chair", "Chairs", "chair", 0.42, 0.48, 0.77, "#d9d8d1", "#4f514f", "Polypropylene and steel"),
  ikea("ikea-stefan", "STEFAN chair", "Chairs", "chair", 0.42, 0.49, 0.77, "#b49b7e", "#735a43", "Solid wood"),
  ikea("ikea-nordviken", "NORDVIKEN chair", "Chairs", "chair", 0.44, 0.53, 0.83, "#b29676", "#70553d", "Solid wood"),
  ikea("ikea-bergmund", "BERGMUND chair", "Chairs", "chair", 0.52, 0.56, 0.95, "#aaa69b", "#77736a", "Padded seat and cover"),
  ikea("ikea-odger", "ODGER chair", "Chairs", "chair", 0.51, 0.51, 0.81, "#b8b09f", "#817766", "Wood composite and recycled plastic"),
  ikea("ikea-janinge", "JANINGE chair", "Chairs", "chair", 0.50, 0.50, 0.77, "#d4d2ca", "#8c8b84", "Polypropylene"),
  ikea("ikea-marius", "MARIUS stool", "Chairs", "stool", 0.45, 0.48, 0.45, "#3f4542", "#252927", "Polypropylene and steel"),
  ikea("ikea-dalfred", "DALFRED bar stool", "Chairs", "stool", 0.42, 0.42, 0.75, "#343635", "#171918", "Steel and solid wood"),
];
