/* eslint-disable react/no-unknown-property */
import type { FurnitureCatalogItem } from "./furniture-catalog";
import { BookcaseFurniture, StorageFurniture, RetailTableFurniture } from "./furniture-retail-model";
import { DecorFurniture } from "./decor-model";
export function ProceduralFurniture({item, ceilingHeight = 2.7}: {item: FurnitureCatalogItem; ceilingHeight?: number}) {
  if (item.decor) return <DecorFurniture item={item} ceilingHeight={ceilingHeight} />;
  if (item.shape === "bookcase") return <BookcaseFurniture item={item} />;
  if (item.shape === "wardrobe" || item.shape === "cabinet") return <StorageFurniture item={item} />;
  if (item.shape === "table" && item.table) return <RetailTableFurniture item={item} />;
  const bodyDepth = item.bodyDepth ?? item.depth;
  const bodyZ = item.shape === "chaise" ? (item.depth - bodyDepth) / 2 : 0;
  const armWidth = Math.min(0.24, item.width * 0.14);
  const cushionWidth = Math.max(0.25, item.width - armWidth * 2 - 0.06);
  const legInset = Math.min(0.24, item.width * 0.18);
  return <group>
      {item.shape === "bed" ? <BedFurniture item={item} /> : item.shape === "table" ? <TableFurniture item={item} /> : item.shape === "stool" ? <StoolFurniture item={item} /> : item.shape === "chair" || item.shape === "armchair" ? <ChairFurniture item={item} /> : <>
      {[-1, 1].flatMap((side) => [-1, 1].map((front) => (
        <mesh key={`${side}-${front}`} position={[side * (item.width / 2 - legInset), 0.08, bodyZ + front * (bodyDepth / 2 - 0.17)]} castShadow>
          <cylinderGeometry args={[0.035, 0.045, 0.16, 8]} />
          <meshStandardMaterial color="#4b3b2d" roughness={0.72} />
        </mesh>
      )))}
      <mesh position={[0, 0.22, bodyZ]} castShadow receiveShadow>
        <boxGeometry args={[item.width, 0.28, Math.max(0.42, bodyDepth - 0.14)]} />
        <meshStandardMaterial color={item.accentColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.42, bodyZ - bodyDepth * 0.08]} castShadow receiveShadow>
        <boxGeometry args={[cushionWidth, 0.16, Math.max(0.34, bodyDepth * 0.62)]} />
        <meshStandardMaterial color={item.color} roughness={0.96} />
      </mesh>
      <mesh position={[0, 0.3 + (item.height - 0.3) / 2, bodyZ + bodyDepth / 2 - 0.1]} castShadow receiveShadow>
        <boxGeometry args={[item.width, item.height - 0.3, 0.2]} />
        <meshStandardMaterial color={item.color} roughness={0.96} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (item.width / 2 - armWidth / 2), 0.45, bodyZ - 0.02]} castShadow receiveShadow>
          <boxGeometry args={[armWidth, 0.54, Math.max(0.42, bodyDepth - 0.12)]} />
          <meshStandardMaterial color={item.color} roughness={0.96} />
        </mesh>
      ))}
      {item.shape === "chaise" && (
        <group position={[-item.width * 0.31, 0, 0]}>
          <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
            <boxGeometry args={[item.width * 0.34, 0.28, item.depth - 0.16]} />
            <meshStandardMaterial color={item.accentColor} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.42, -0.03]} castShadow receiveShadow>
            <boxGeometry args={[item.width * 0.31, 0.16, item.depth - 0.22]} />
            <meshStandardMaterial color={item.color} roughness={0.96} />
          </mesh>
        </group>
      )}
      </>}

</group>;
}
function BedFurniture({ item }: { item: FurnitureCatalogItem }) {
  const frameHeight = Math.min(0.32, item.height * 0.46);
  const headboardHeight = item.height;
  const mattressWidth = Math.max(0.3, item.width - 0.14);
  const mattressDepth = Math.max(0.5, item.depth - 0.16);
  return (
    <group>
      <mesh position={[0, frameHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width, frameHeight, item.depth]} />
        <meshStandardMaterial color={item.accentColor} roughness={0.76} />
      </mesh>
      <mesh position={[0, frameHeight + 0.09, -0.02]} castShadow receiveShadow>
        <boxGeometry args={[mattressWidth, 0.18, mattressDepth]} />
        <meshStandardMaterial color="#f0eee6" roughness={0.98} />
      </mesh>
      <mesh position={[0, headboardHeight / 2, item.depth / 2 - 0.045]} castShadow receiveShadow>
        <boxGeometry args={[item.width, headboardHeight, 0.09]} />
        <meshStandardMaterial color={item.color} roughness={0.82} />
      </mesh>
      <mesh position={[0, frameHeight + 0.22, item.depth * 0.27]} castShadow>
        <boxGeometry args={[mattressWidth * 0.72, 0.14, Math.min(0.38, item.depth * 0.2)]} />
        <meshStandardMaterial color="#d9d4c9" roughness={1} />
      </mesh>
    </group>
  );
}

function TableFurniture({ item }: { item: FurnitureCatalogItem }) {
  const topThickness = Math.min(0.1, item.height * 0.14);
  const legWidth = Math.min(0.09, item.width * 0.12, item.depth * 0.12);
  const legHeight = item.height - topThickness;
  const xInset = Math.max(legWidth, item.width / 2 - legWidth * 1.25);
  const zInset = Math.max(legWidth, item.depth / 2 - legWidth * 1.25);
  return (
    <group>
      <mesh position={[0, item.height - topThickness / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width, topThickness, item.depth]} />
        <meshStandardMaterial color={item.color} roughness={0.72} />
      </mesh>
      {[-1, 1].flatMap((side) => [-1, 1].map((front) => (
        <mesh key={`${side}-${front}`} position={[side * xInset, legHeight / 2, front * zInset]} castShadow>
          <boxGeometry args={[legWidth, legHeight, legWidth]} />
          <meshStandardMaterial color={item.accentColor} roughness={0.8} />
        </mesh>
      )))}
    </group>
  );
}

function ChairFurniture({ item }: { item: FurnitureCatalogItem }) {
  const seatHeight = Math.min(0.45, item.height * 0.58);
  const seatThickness = 0.08;
  const legWidth = Math.min(0.045, item.width * 0.1);
  const xInset = item.width / 2 - legWidth * 1.4;
  const zInset = item.depth / 2 - legWidth * 1.4;
  return (
    <group>
      {[-1, 1].flatMap((side) => [-1, 1].map((front) => (
        <mesh key={`${side}-${front}`} position={[side * xInset, seatHeight / 2, front * zInset]} castShadow>
          <boxGeometry args={[legWidth, seatHeight, legWidth]} />
          <meshStandardMaterial color={item.accentColor} roughness={0.76} />
        </mesh>
      )))}
      <mesh position={[0, seatHeight, -0.015]} castShadow receiveShadow>
        <boxGeometry args={[item.width, seatThickness, Math.max(0.25, item.depth * 0.72)]} />
        <meshStandardMaterial color={item.color} roughness={0.86} />
      </mesh>
      <mesh position={[0, seatHeight + (item.height - seatHeight) / 2, item.depth / 2 - 0.045]} castShadow receiveShadow>
        <boxGeometry args={[item.width, item.height - seatHeight, 0.09]} />
        <meshStandardMaterial color={item.color} roughness={0.86} />
      </mesh>
    </group>
  );
}

function StoolFurniture({ item }: { item: FurnitureCatalogItem }) {
  const seatHeight = Math.min(0.72, item.height * 0.82);
  const seatThickness = Math.min(0.09, item.height * 0.13);
  return (
    <group>
      <mesh position={[0, seatHeight, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[Math.min(item.width, item.depth) * 0.43, Math.min(item.width, item.depth) * 0.43, seatThickness, 20]} />
        <meshStandardMaterial color={item.color} roughness={0.78} />
      </mesh>
      <mesh position={[0, seatHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.055, Math.max(0.08, seatHeight), 10]} />
        <meshStandardMaterial color={item.accentColor} roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.045, 0]} castShadow>
        <cylinderGeometry args={[Math.min(item.width, item.depth) * 0.36, Math.min(item.width, item.depth) * 0.45, 0.06, 12]} />
        <meshStandardMaterial color={item.accentColor} roughness={0.78} />
      </mesh>
    </group>
  );
}
