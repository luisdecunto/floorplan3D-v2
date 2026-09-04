import { EXTENDED_IKEA_CATALOG } from "./ikea-furniture-catalog.ts";

export type FurnitureShape = "sofa" | "chaise" | "armchair" | "bed" | "table" | "chair" | "stool";
export type FurnitureCategory = "Sofas" | "Beds" | "Tables" | "Chairs";

export type FurnitureCatalogItem = {
  id: string;
  name: string;
  collection: string;
  category: FurnitureCategory;
  shape: FurnitureShape;
  width: number;
  depth: number;
  height: number;
  bodyDepth?: number;
  upholstery: string;
  color: string;
  accentColor: string;
  articleNumber?: string;
  sourceUrl?: string;
};

export type FurniturePlacement = {
  id: string;
  catalogId: string;
  levelId: string;
  x: number;
  z: number;
  rotation: number;
  mirrored?: boolean;
};

/**
 * Procedural, dimension-first prototype furniture. These entries intentionally
 * avoid redistributing a manufacturer's mesh while the branded catalogue
 * licensing path is being established. A licensed GLB can later replace each
 * procedural renderer without changing placement or project data.
 */
const CORE_FURNITURE_CATALOG: FurnitureCatalogItem[] = [
  {
    id: "ikea-friheten-39216754",
    name: "FRIHETEN corner sofa-bed",
    collection: "IKEA · 392.167.54",
    category: "Sofas",
    shape: "chaise",
    width: 2.3,
    depth: 1.51,
    bodyDepth: 0.88,
    height: 0.86,
    upholstery: "Skiftebo dark grey",
    color: "#656563",
    accentColor: "#4f504f",
    articleNumber: "392.167.54",
    sourceUrl: "https://www.ikea.com/dk/da/p/friheten-hjornesovesofa-med-opbevaring-skiftebo-morkegra-s39216754/",
  },
  {
    id: "ikea-malm-160-09929373",
    name: "MALM high bed frame",
    collection: "IKEA · 099.293.73",
    category: "Beds",
    shape: "bed",
    width: 1.76,
    depth: 2.09,
    height: 1,
    upholstery: "White finish · mattress 160 × 200 cm",
    color: "#eee9df",
    accentColor: "#d2cec5",
    articleNumber: "099.293.73",
    sourceUrl: "https://www.ikea.com/dk/da/p/malm-sengestel-hojt-hvid-s09929373/",
  },
  {
    id: "ikea-neiden-70395239",
    name: "NEIDEN bed frame",
    collection: "IKEA · 703.952.39",
    category: "Beds",
    shape: "bed",
    width: 1.44,
    depth: 2.05,
    height: 0.65,
    upholstery: "Solid pine · mattress 140 × 200 cm",
    color: "#cda979",
    accentColor: "#a77e50",
    articleNumber: "703.952.39",
    sourceUrl: "https://www.ikea.com/dk/da/p/neiden-sengestel-fyr-70395239/",
  },
  {
    id: "ikea-lisabo-table-80382439",
    name: "LISABO dining table",
    collection: "IKEA · 803.824.39",
    category: "Tables",
    shape: "table",
    width: 1.4,
    depth: 0.78,
    height: 0.74,
    upholstery: "Black ash veneer",
    color: "#30302e",
    accentColor: "#1f201f",
    articleNumber: "803.824.39",
    sourceUrl: "https://www.ikea.com/dk/da/p/lisabo-bord-sort-asketraesfiner-80382439/",
  },
  {
    id: "ikea-lack-table-40104294",
    name: "LACK coffee table",
    collection: "IKEA · 401.042.94",
    category: "Tables",
    shape: "table",
    width: 0.9,
    depth: 0.55,
    height: 0.45,
    upholstery: "Black-brown finish",
    color: "#3a3029",
    accentColor: "#251f1b",
    articleNumber: "401.042.94",
    sourceUrl: "https://www.ikea.com/dk/da/p/lack-sofabord-sortbrun-40104294/",
  },
  {
    id: "ikea-lisabo-chair-60446786",
    name: "LISABO chair",
    collection: "IKEA · 604.467.86",
    category: "Chairs",
    shape: "chair",
    width: 0.46,
    depth: 0.51,
    height: 0.8,
    upholstery: "Black ash veneer and birch",
    color: "#343331",
    accentColor: "#242321",
    articleNumber: "604.467.86",
    sourceUrl: "https://www.ikea.com/dk/da/p/lisabo-stol-sort-60446786/",
  },
  {
    id: "ikea-teodores-chair-20530621",
    name: "TEODORES chair",
    collection: "IKEA · 205.306.21",
    category: "Chairs",
    shape: "chair",
    width: 0.46,
    depth: 0.54,
    height: 0.8,
    upholstery: "Black polypropylene and steel",
    color: "#292a2a",
    accentColor: "#171818",
    articleNumber: "205.306.21",
    sourceUrl: "https://www.ikea.com/dk/da/p/teodores-stol-sort-20530621/",
  },
  {
    id: "haven-compact-2",
    name: "Haven compact 2-seat",
    collection: "Nordic essentials",
    category: "Sofas",
    shape: "sofa",
    width: 1.65,
    depth: 0.88,
    height: 0.82,
    upholstery: "Warm grey weave",
    color: "#8c8a82",
    accentColor: "#6f6d67",
  },
  {
    id: "haven-wide-3",
    name: "Haven wide 3-seat",
    collection: "Nordic essentials",
    category: "Sofas",
    shape: "sofa",
    width: 2.21,
    depth: 0.92,
    height: 0.83,
    upholstery: "Moss green weave",
    color: "#667668",
    accentColor: "#4e5c51",
  },
  {
    id: "harbor-chaise",
    name: "Harbor sofa with chaise",
    collection: "Modular living",
    category: "Sofas",
    shape: "chaise",
    width: 2.58,
    depth: 1.64,
    bodyDepth: 0.94,
    height: 0.84,
    upholstery: "Deep blue twill",
    color: "#53687b",
    accentColor: "#3f5060",
  },
  {
    id: "drift-sleeper",
    name: "Drift sleeper sofa",
    collection: "Flexible rooms",
    category: "Sofas",
    shape: "sofa",
    width: 2.3,
    depth: 0.95,
    height: 0.86,
    upholstery: "Natural linen",
    color: "#b7aa95",
    accentColor: "#918571",
  },
  {
    id: "cove-armchair",
    name: "Cove armchair",
    collection: "Nordic essentials",
    category: "Chairs",
    shape: "armchair",
    width: 0.92,
    depth: 0.88,
    height: 0.86,
    upholstery: "Clay bouclé",
    color: "#ae745d",
    accentColor: "#8c5947",
  },
];

export const FURNITURE_CATALOG: FurnitureCatalogItem[] = [
  ...CORE_FURNITURE_CATALOG,
  ...EXTENDED_IKEA_CATALOG,
];

export function furnitureCatalogItem(catalogId: string) {
  return FURNITURE_CATALOG.find((item) => item.id === catalogId);
}

export function furnitureFootprint(item: FurnitureCatalogItem, rotation: number) {
  const cosine = Math.abs(Math.cos(rotation));
  const sine = Math.abs(Math.sin(rotation));
  return {
    width: item.width * cosine + item.depth * sine,
    depth: item.width * sine + item.depth * cosine,
  };
}

export function clampFurniturePosition(
  item: FurnitureCatalogItem,
  slab: { x: number; z: number; width: number; depth: number },
  rotation: number,
  x: number,
  z: number,
) {
  const footprint = furnitureFootprint(item, rotation);
  const padding = 0.08;
  const halfWidth = Math.min(slab.width / 2, footprint.width / 2 + padding);
  const halfDepth = Math.min(slab.depth / 2, footprint.depth / 2 + padding);
  return {
    x: Math.max(slab.x - slab.width / 2 + halfWidth, Math.min(slab.x + slab.width / 2 - halfWidth, x)),
    z: Math.max(slab.z - slab.depth / 2 + halfDepth, Math.min(slab.z + slab.depth / 2 - halfDepth, z)),
  };
}
