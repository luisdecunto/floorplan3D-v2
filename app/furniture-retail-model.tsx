/* eslint-disable react/no-unknown-property */
import type { FurnitureCatalogItem } from "./furniture-catalog";

type Vector = [number, number, number];
function Box({ size, at, color, name, rotation }: { size: Vector; at: Vector; color: string; name?: string; rotation?: Vector }) {
  return <mesh name={name} position={at} rotation={rotation} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.76} /></mesh>;
}

function IvarBookcase({ item }: { item: FurnitureCatalogItem }) {
  const { width, depth, height, color, accentColor } = item;
  const config = item.shelving!;
  const post = 0.035;
  const boundaries = Array.from({ length: config.sections + 1 }, (_, index) => -width / 2 + post / 2 + (width - post) * index / config.sections);
  const sectionWidth = (width - post) / config.sections;
  const shelfWidth = sectionWidth - post - 0.016;
  const shelfDepth = depth - 0.028;
  const shelfThickness = 0.025;
  const cabinets = Math.min(config.sections, config.lowerCabinets ?? 0);
  return <group>
    {boundaries.flatMap((x, index) => [-1, 1].map((side) =>
      <Box key={`post-${index}-${side}`} name="bookcase-upright" size={[post, height, post]} at={[x, height / 2, side * (depth / 2 - post / 2)]} color={accentColor} />,
    ))}
    {Array.from({ length: config.sections }, (_, section) => {
      const center = (boundaries[section] + boundaries[section + 1]) / 2;
      return <group key={`section-${section}`}>
        {Array.from({ length: config.shelvesPerSection }, (_, shelf) => {
          const rangeBottom = cabinets > section ? 0.91 : config.storageBox && section === 0 ? 0.44 : 0.075;
          const rangeTop = height - 0.075;
          const y = config.shelvesPerSection === 1 ? rangeTop : rangeBottom + (rangeTop - rangeBottom) * shelf / (config.shelvesPerSection - 1);
          return <Box key={shelf} name="bookcase-shelf" size={[shelfWidth, shelfThickness, shelfDepth]} at={[center, y, 0]} color={color} />;
        })}
        {cabinets > section && <group>
          <Box name="bookcase-cabinet" size={[shelfWidth, 0.82, depth - 0.045]} at={[center, 0.47, 0.008]} color={accentColor} />
          {[-1, 1].map((side) => <Box key={side} name="bookcase-cabinet-door" size={[shelfWidth / 2 - 0.008, 0.76, 0.018]} at={[center + side * shelfWidth / 4, 0.47, -depth / 2 + 0.014]} color={color} />)}
        </group>}
        {config.storageBox && section === 0 && <group>
          <Box name="bookcase-storage-box" size={[shelfWidth - 0.03, 0.32, depth - 0.05]} at={[center, 0.21, 0.008]} color={color} />
          <Box name="bookcase-storage-box-front" size={[shelfWidth - 0.05, 0.22, 0.018]} at={[center, 0.23, -depth / 2 + 0.014]} color={accentColor} />
        </group>}
        <Box name="bookcase-brace" size={[Math.hypot(shelfWidth, height * 0.58), 0.009, 0.009]} at={[center, height * 0.50, depth / 2 - 0.011]} color="#8a8e86" rotation={[0, 0, Math.atan2(height * 0.58, shelfWidth)]} />
      </group>;
    })}
  </group>;
}

function BillyBookcase({ item }: { item: FurnitureCatalogItem }) {
  const { width, depth, height, color, accentColor } = item;
  const shelves = item.shelving!.shelvesPerSection;
  const side = 0.022;
  const panel = 0.026;
  const innerWidth = width - side * 2;
  return <group>
    {[-1, 1].map((position) => <Box key={position} name="bookcase-side" size={[side, height, depth]} at={[position * (width / 2 - side / 2), height / 2, 0]} color={color} />)}
    <Box name="bookcase-back" size={[innerWidth, height - panel * 2, 0.009]} at={[0, height / 2, depth / 2 - 0.005]} color={accentColor} />
    <Box name="bookcase-bottom" size={[innerWidth, panel, depth]} at={[0, panel / 2, 0]} color={color} />
    <Box name="bookcase-top" size={[innerWidth, panel, depth]} at={[0, height - panel / 2, 0]} color={color} />
    {Array.from({ length: shelves }, (_, index) => <Box key={index} name="bookcase-shelf" size={[innerWidth, 0.021, depth - 0.018]} at={[0, height * (index + 1) / (shelves + 1), -0.006]} color={color} />)}
    <Box name="bookcase-plinth" size={[innerWidth, 0.075, 0.018]} at={[0, 0.065, -depth / 2 + 0.012]} color={accentColor} />
  </group>;
}

export function BookcaseFurniture({ item }: { item: FurnitureCatalogItem }) {
  return item.shelving?.system === "ivar" ? <IvarBookcase item={item} /> : <BillyBookcase item={item} />;
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
  if (config.heightAdjustable) return <AdjustableDeskFurniture item={item} />;
  const round = config.top === "round";
  const oval = config.top === "oval";
  const top = Math.min(0.04, height * 0.1);
  const legHeight = height - top;
  const legWidth = config.legStyle === "square" ? 0.07 : 0.045;
  const legs = round ? Array.from({ length: config.legs ?? 4 }, (_, index) => {
    const angle = index * Math.PI * 2 / (config.legs ?? 4) - Math.PI / 2;
    return [Math.cos(angle) * width * 0.35, Math.sin(angle) * depth * 0.35];
  }) : [-1, 1].flatMap((x) => [-1, 1].map((z) => [x * (width / 2 - 0.06), z * (depth / 2 - 0.06)]));
  return <group>
    {round || oval ? <mesh name={round ? "round-tabletop" : "oval-tabletop"} position={[0, height - top / 2, 0]} scale={[width, top, depth]} castShadow receiveShadow>
      <cylinderGeometry args={[0.5, 0.5, 1, 32]} /><meshStandardMaterial color={color} roughness={0.7} />
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
    {config.drawers && <group>
      <Box name="desk-drawer-case" size={[width * 0.52, 0.14, depth * 0.72]} at={[-width * 0.19, height - top - 0.07, 0]} color={accentColor} />
      {Array.from({ length: config.drawers }, (_, index) => {
        const drawerWidth = width * 0.52 / config.drawers!;
        return <Box key={index} name="desk-drawer" size={[drawerWidth - 0.01, 0.105, 0.018]} at={[-width * 0.45 + drawerWidth * (index + 0.5), height - top - 0.07, -depth / 2 + 0.012]} color={color} />;
      })}
    </group>}
  </group>;
}

/** Two telescoping T-legs make an adjustable desk distinct from a dining table.
 * The catalogue height is its seated preview height; the supported lift range is metadata. */
function AdjustableDeskFurniture({ item }: { item: FurnitureCatalogItem }) {
  const { width, depth, height, color, accentColor } = item;
  const top = Math.min(0.04, height * 0.1);
  const frameTop = height - top;
  const xInset = width / 2 - 0.18;
  const lowerHeight = frameTop * 0.58;
  const upperHeight = frameTop * 0.46;
  return <group>
    <Box name="tabletop" size={[width, top, depth]} at={[0, height - top / 2, 0]} color={color} />
    {[-1, 1].map((side) => <group key={side}>
      <Box name="desk-foot" size={[0.09, 0.04, depth * 0.78]} at={[side * xInset, 0.02, 0]} color={accentColor} />
      <Box name="desk-lower-leg" size={[0.09, lowerHeight, 0.09]} at={[side * xInset, 0.04 + lowerHeight / 2, 0]} color={accentColor} />
      <Box name="desk-upper-leg" size={[0.065, upperHeight, 0.065]} at={[side * xInset, frameTop - upperHeight / 2, 0]} color="#4c504d" />
    </group>)}
    <Box name="desk-crossbar" size={[width - 0.34, 0.075, 0.09]} at={[0, frameTop - 0.055, 0]} color={accentColor} />
    <Box name="desk-cable-tray" size={[width * 0.48, 0.035, 0.10]} at={[0, frameTop - 0.13, 0.10]} color="#4c504d" />
    <Box name="desk-controller" size={[0.12, 0.035, 0.06]} at={[width * 0.32, frameTop - 0.025, -depth / 2 + 0.05]} color="#303331" />
  </group>;
}
