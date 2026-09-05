/* eslint-disable react/no-unknown-property */
import type { FurnitureCatalogItem } from "./furniture-catalog";

type Vector = [number, number, number];
function Box({ size, at, color, name, rotation }: { size: Vector; at: Vector; color: string; name?: string; rotation?: Vector }) {
  return <mesh name={name} position={at} rotation={rotation} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.72} /></mesh>;
}
function Cylinder({ radius, height, at, color, name, rotation, sides = 20 }: { radius: number; height: number; at: Vector; color: string; name?: string; rotation?: Vector; sides?: number }) {
  return <mesh name={name} position={at} rotation={rotation} castShadow receiveShadow><cylinderGeometry args={[radius, radius, height, sides]} /><meshStandardMaterial color={color} roughness={0.72} /></mesh>;
}

function FloorLamp({ item }: { item: FurnitureCatalogItem }) {
  const { width, depth, height, color, accentColor } = item;
  const config = item.decor!;
  const shadeDiameter = config.shadeDiameter ?? Math.min(width, depth) * 0.7;
  const shadeHeight = config.shadeHeight ?? Math.min(0.24, height * 0.22);
  if (config.variant === "lantern-floor") return <group>
    <mesh name="lamp-rattan-shade" position={[0, height / 2, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[width * 0.38, width / 2, height, 16]} /><meshStandardMaterial color={color} roughness={0.9} wireframe />
    </mesh>
    <Cylinder name="lamp-glow" radius={width * 0.16} height={height * 0.62} at={[0, height * 0.48, 0]} color="#f2d39b" sides={16} />
  </group>;
  const shadeY = height - shadeHeight / 2;
  const supportTop = height - shadeHeight;
  return <group>
    {config.variant === "tripod-floor" ? Array.from({ length: 3 }, (_, index) => {
      const angle = index * Math.PI * 2 / 3 - Math.PI / 2;
      const legWidth = 0.035;
      const footRadius = Math.min(width, depth) / 2 - legWidth / 2;
      const topRadius = 0.045;
      const tilt = Math.atan2(topRadius - footRadius, supportTop);
      const length = Math.hypot(supportTop, footRadius - topRadius);
      const edgeLift = legWidth / 2 * Math.abs(Math.sin(tilt));
      return <group key={index} rotation={[0, Math.PI / 2 - angle, 0]}>
        <Box name="lamp-tripod-leg" size={[legWidth, length, legWidth]} at={[0, supportTop / 2 + edgeLift, (footRadius + topRadius) / 2]} color={accentColor} rotation={[tilt, 0, 0]} />
      </group>;
    }) : <>
      <Cylinder name="lamp-base" radius={Math.min(width, depth) / 2} height={0.035} at={[0, 0.0175, 0]} color={accentColor} />
      <Cylinder name="lamp-pole" radius={0.014} height={supportTop - 0.035} at={[0, 0.035 + (supportTop - 0.035) / 2, 0]} color={accentColor} sides={12} />
    </>}
    {config.variant === "reading-floor" && <Box name="lamp-reading-arm" size={[0.025, 0.025, Math.min(0.20, depth * 0.75)]} at={[0, supportTop - 0.02, -Math.min(0.08, depth * 0.3)]} color={accentColor} rotation={[-0.25, 0, 0]} />}
    <mesh name="lamp-shade" position={[0, shadeY, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[shadeDiameter * 0.40, shadeDiameter / 2, shadeHeight, 24]} /><meshStandardMaterial color={color} roughness={0.82} />
    </mesh>
    <Cylinder name="lamp-bulb" radius={Math.min(0.035, shadeDiameter * 0.16)} height={Math.min(0.09, shadeHeight * 0.46)} at={[0, shadeY - shadeHeight * 0.08, 0]} color="#f3d38f" sides={16} />
  </group>;
}

function WallLamp({ item }: { item: FurnitureCatalogItem }) {
  const { width, depth, height, color, accentColor } = item;
  const y = item.mount?.elevation ?? 1.35;
  const shadeDiameter = item.decor?.shadeDiameter ?? width;
  const shadeDepth = item.decor?.shadeHeight ?? depth * 0.55;
  return <group>
    <Box name="wall-lamp-backplate" size={[width, height, 0.02]} at={[0, y, depth / 2 - 0.01]} color={accentColor} />
    <Box name="wall-lamp-arm" size={[0.022, 0.022, Math.max(0.02, depth - shadeDepth)]} at={[0, y, (shadeDepth - 0.02) / 2]} color={accentColor} />
    <Cylinder name="wall-lamp-shade" radius={shadeDiameter / 2} height={shadeDepth} at={[0, y, -depth / 2 + shadeDepth / 2]} color={color} rotation={[Math.PI / 2, 0, 0]} />
  </group>;
}

function PendantLamp({ item, ceilingHeight }: { item: FurnitureCatalogItem; ceilingHeight: number }) {
  const { width, height, color, accentColor } = item;
  const drop = Math.max(height, item.mount?.drop ?? height);
  const bottom = ceilingHeight - drop;
  const shadeCenter = bottom + height / 2;
  const cordBottom = bottom + height;
  return <group>
    <Cylinder name="pendant-canopy" radius={Math.min(0.09, width * 0.25)} height={0.035} at={[0, ceilingHeight - 0.0175, 0]} color={accentColor} />
    <Cylinder name="pendant-cord" radius={0.006} height={Math.max(0.01, ceilingHeight - cordBottom)} at={[0, (ceilingHeight + cordBottom) / 2, 0]} color={accentColor} sides={8} />
    <mesh name="pendant-shade" position={[0, shadeCenter, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[width * 0.28, width / 2, height, item.decor?.variant === "woven-pendant" ? 18 : 28]} />
      <meshStandardMaterial color={color} roughness={item.decor?.variant === "woven-pendant" ? 0.92 : 0.68} wireframe={item.decor?.variant === "woven-pendant"} />
    </mesh>
    <Cylinder name="pendant-bulb" radius={Math.min(0.04, width * 0.12)} height={Math.min(0.11, height * 0.30)} at={[0, bottom + height * 0.48, 0]} color="#f4d18c" sides={16} />
  </group>;
}

function WallDecor({ item }: { item: FurnitureCatalogItem }) {
  const { width, depth, height, color, accentColor } = item;
  const y = item.mount?.elevation ?? 1.45;
  const frame = Math.min(0.045, width * 0.09, height * 0.07);
  const front = -depth / 2 + 0.004;
  return <group>
    <Box name="wall-decor-frame" size={[width, height, depth]} at={[0, y, 0]} color={color} />
    <Box name={item.shape === "mirror" ? "mirror-glass" : "picture-art"} size={[width - frame * 2, height - frame * 2, 0.006]} at={[0, y, front]} color={accentColor} />
    {item.shape === "picture" && <>
      <Box name="picture-horizon" size={[width - frame * 2.7, 0.012, 0.006]} at={[0, y - height * 0.08, front]} color="#d7b889" rotation={[0, 0, -0.08]} />
      <Box name="picture-foreground" size={[width * 0.42, height * 0.22, 0.006]} at={[-width * 0.18, y - height * 0.24, front]} color="#53685e" rotation={[0, 0, 0.22]} />
    </>}
  </group>;
}

export function DecorFurniture({ item, ceilingHeight = 2.7 }: { item: FurnitureCatalogItem; ceilingHeight?: number }) {
  if (item.shape === "floor-lamp") return <FloorLamp item={item} />;
  if (item.shape === "wall-lamp") return <WallLamp item={item} />;
  if (item.shape === "pendant-lamp") return <PendantLamp item={item} ceilingHeight={ceilingHeight} />;
  return <WallDecor item={item} />;
}
