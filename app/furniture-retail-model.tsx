/* eslint-disable react/no-unknown-property */
import type { FurnitureCatalogItem } from "./furniture-catalog";

type Vector = [number, number, number];
function Box({ size, at, color, name }: { size: Vector; at: Vector; color: string; name?: string }) {
  return <mesh name={name} position={at} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.76} /></mesh>;
}

/** Closed fronts face local -Z and rotate/mirror with their placement.
 * Handles are included INSIDE the catalogue depth, not added to the footprint. */
export function StorageFurniture({ item }: { item: FurnitureCatalogItem }) {
  const { width, depth, height, color, accentColor } = item;
  const config = item.storage ?? { doors: 2 };
  const doors = Math.max(1, Math.round(config.doors));
  const drawers = Math.max(0, Math.round(config.drawers ?? 0));
  const base = config.baseHeight ?? 0.08;
  const bodyHeight = height - base;
  const drawerHeight = drawers ? Math.min(0.23, bodyHeight * 0.25 / drawers) : 0;
  const doorHeight = bodyHeight - drawerHeight * drawers - 0.032;
  const doorWidth = (width - 0.032) / doors;
  const front = -depth / 2 + 0.022;
  return <group>
    <Box name="cabinet-body" size={[width, bodyHeight, depth - 0.034]} at={[0, base + bodyHeight / 2, 0.017]} color={accentColor} />
    {config.base === "legs" ? [-1, 1].flatMap((x) => [-1, 1].map((z) =>
      <Box key={`${x}-${z}`} name="cabinet-leg" size={[0.04, base, 0.04]} at={[x * (width / 2 - 0.05), base / 2, z * (depth / 2 - 0.05)]} color={accentColor} />,
    )) : <Box name="cabinet-plinth" size={[width - 0.05, base, depth - 0.06]} at={[0, base / 2, 0.015]} color={accentColor} />}
    {Array.from({ length: doors }, (_, index) => {
      const x = -width / 2 + 0.016 + doorWidth * (index + 0.5);
      const y = base + 0.016 + drawerHeight * drawers + doorHeight / 2;
      const insetWidth = doorWidth - 0.085, insetHeight = doorHeight - 0.11;
      return <group key={index}>
        <Box name="cabinet-door" size={[doorWidth - 0.008, doorHeight, 0.02]} at={[x, y, front]} color={color} />
        {config.mirrorDoor === index ? <mesh name="cabinet-mirror" position={[x, y, front - 0.011]}>
          <boxGeometry args={[insetWidth, insetHeight, 0.004]} /><meshStandardMaterial color="#b8c9cc" metalness={0.65} roughness={0.18} />
        </mesh> : config.front === "panel" || config.front === "rattan" ? <>
          <Box name="cabinet-inset" size={[insetWidth, insetHeight, 0.004]} at={[x, y, front - 0.011]} color={config.front === "rattan" ? "#bcaa82" : accentColor} />
          {config.front === "rattan" && Array.from({ length: 12 }, (_, slat) =>
            <Box key={slat} size={[insetWidth, 0.003, 0.002]} at={[x, y - insetHeight / 2 + insetHeight * (slat + 0.5) / 12, front - 0.014]} color="#9c8a67" />,
          )}
        </> : null}
        <Box name="cabinet-handle" size={[0.014, Math.min(0.16, doorHeight * 0.24), 0.012]} at={[x + (index % 2 === 0 ? 1 : -1) * (doorWidth / 2 - 0.045), y, -depth / 2 + 0.006]} color="#68675f" />
      </group>;
    })}
    {Array.from({ length: drawers }, (_, index) => {
      const y = base + 0.016 + drawerHeight * (index + 0.5);
      return <group key={index}>
        <Box name="cabinet-drawer" size={[width - 0.04, drawerHeight - 0.009, 0.02]} at={[0, y, front]} color={color} />
        <Box name="drawer-handle" size={[0.15, 0.014, 0.012]} at={[0, y, -depth / 2 + 0.006]} color="#68675f" />
      </group>;
    })}
  </group>;
}

/** Table variants opt in; legacy table geometry is intentionally unchanged. */
export function RetailTableFurniture({ item }: { item: FurnitureCatalogItem }) {
  const { width, depth, height, color, accentColor } = item;
  const config = item.table!;
  const round = config.top === "round";
  const top = Math.min(0.04, height * 0.1);
  const legHeight = height - top;
  const legWidth = config.legStyle === "square" ? 0.07 : 0.045;
  const legs = round ? Array.from({ length: config.legs ?? 4 }, (_, index) => {
    const angle = index * Math.PI * 2 / (config.legs ?? 4) - Math.PI / 2;
    return [Math.cos(angle) * width * 0.35, Math.sin(angle) * depth * 0.35];
  }) : [-1, 1].flatMap((x) => [-1, 1].map((z) => [x * (width / 2 - 0.06), z * (depth / 2 - 0.06)]));
  return <group>
    {round ? <mesh name="round-tabletop" position={[0, height - top / 2, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[width / 2, width / 2, top, 32]} /><meshStandardMaterial color={color} roughness={0.7} />
    </mesh> : <Box name="tabletop" size={[width, top, depth]} at={[0, height - top / 2, 0]} color={color} />}
    {config.support === "panels" ? [-1, 1].map((side) =>
      <Box key={side} name="table-panel" size={[0.035, legHeight, depth * 0.9]} at={[side * width * 0.38, legHeight / 2, 0]} color={accentColor} />,
    ) : legs.map(([x, z], index) => config.legStyle === "square" ?
      <Box key={index} name="table-leg" size={[legWidth, legHeight, legWidth]} at={[x, legHeight / 2, z]} color={accentColor} /> :
      <mesh key={index} name="table-leg" position={[x, legHeight / 2, z]} castShadow><cylinderGeometry args={[legWidth / 2, legWidth * 0.44, legHeight, 12]} /><meshStandardMaterial color={accentColor} roughness={0.75} /></mesh>,
    )}
    {config.shelf && (round ? <mesh name="table-shelf" position={[0, height * 0.36, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[width * 0.37, width * 0.37, 0.018, 32]} /><meshStandardMaterial color={color} roughness={0.75} />
    </mesh> : config.shelf === "slatted" ? Array.from({ length: 9 }, (_, index) =>
      <Box key={index} name="shelf-slat" size={[(width - 0.13) / 9 * 0.76, 0.018, depth - 0.12]} at={[-(width - 0.13) / 2 + (width - 0.13) * (index + 0.5) / 9, height * 0.36, 0]} color={accentColor} />,
    ) : <Box name="table-shelf" size={[width - 0.10, 0.025, depth - 0.10]} at={[0, height * 0.36, 0]} color={config.support === "panels" ? accentColor : color} />)}
  </group>;
}
