export type FurnitureShape = "sofa" | "chaise" | "armchair";

export type FurnitureCatalogItem = {
  id: string;
  name: string;
  collection: string;
  shape: FurnitureShape;
  width: number;
  depth: number;
  height: number;
  bodyDepth?: number;
  upholstery: string;
  color: string;
  accentColor: string;
};

export type FurniturePlacement = {
  id: string;
  catalogId: string;
  levelId: string;
  x: number;
  z: number;
  rotation: number;
};

/**
 * Procedural, dimension-first prototype furniture. These entries intentionally
 * avoid redistributing a manufacturer's mesh while the branded catalogue
 * licensing path is being established. A licensed GLB can later replace each
 * procedural renderer without changing placement or project data.
 */
export const FURNITURE_CATALOG: FurnitureCatalogItem[] = [
  {
    id: "haven-compact-2",
    name: "Haven compact 2-seat",
    collection: "Nordic essentials",
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
    shape: "armchair",
    width: 0.92,
    depth: 0.88,
    height: 0.86,
    upholstery: "Clay bouclé",
    color: "#ae745d",
    accentColor: "#8c5947",
  },
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
