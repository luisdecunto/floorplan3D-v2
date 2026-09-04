/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { FURNITURE_CATEGORIES, filterFurnitureCatalog, furnitureBrand, type FurnitureCatalogItem } from "./furniture-catalog";

const categories = ["All", ...FURNITURE_CATEGORIES];
export function FurnitureLibrary({ onChoose }: { onChoose: (item: FurnitureCatalogItem) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [brand, setBrand] = useState("All");
  const items = useMemo(() => filterFurnitureCatalog(query, category, brand), [query, category, brand]);
  return <div className="ws-library">
    <div className="ws-library-tools"><label className="ws-search"><Search size={18} /><span className="visually-hidden">Search furniture</span><input type="search" placeholder="Search furniture…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <select aria-label="Furniture brand" value={brand} onChange={(event) => setBrand(event.target.value)}><option value="All">All brands</option><option>IKEA</option><option>JYSK</option><option>Originals</option></select></div>
    <div className="ws-categories" role="group" aria-label="Furniture categories">{categories.map((name) => <button key={name} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}</div>
    <p className="ws-library-count">{items.length} pieces · choose one to preview</p>
    <div className="ws-product-grid">{items.map((item) => <article key={item.id} className="ws-product">
      <button onClick={() => onChoose(item)} aria-label={`Preview ${item.name}`}>
        <img src={`${import.meta.env.BASE_URL}furniture-previews/${item.id}.svg`} alt="" width={240} height={168} loading="lazy" />
        <span className="ws-product-brand">{item.collection}{item.brand && item.articleNumber ? ` · ${item.articleNumber}` : ""}</span><strong>{item.name}</strong>
        <span className="ws-dimensions">{item.width.toFixed(2)} × {item.depth.toFixed(2)} × {item.height.toFixed(2)} m</span>
        <span className="ws-product-action">Preview <span aria-hidden="true">＋</span></span>
      </button>
      <details><summary>Details</summary><p>{item.upholstery}</p>{item.materials && <p>{item.materials.join(" · ")}</p>}<p>Width × depth × height. Procedural approximation, not a manufacturer mesh.</p>
        {item.storage && <p>Closed-door footprint. Leave room to open doors and follow the retailer’s anchoring instructions.</p>}
        {item.table?.top === "round" && <p>Placement uses a conservative square clearance footprint.</p>}
        {item.sourceCheckedAt && <p>Dimensions checked {item.sourceCheckedAt}.</p>}
        {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">View at {furnitureBrand(item)} ↗</a>}</details>
    </article>)}</div>
    {items.length === 0 && <p>No matches. Try a different search or category.</p>}
  </div>;
}
