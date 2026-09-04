/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { FURNITURE_CATALOG, type FurnitureCatalogItem } from "./furniture-catalog";

const categories = ["All", "Sofas", "Beds", "Tables", "Chairs"] as const;
export function FurnitureLibrary({ onChoose }: { onChoose: (item: FurnitureCatalogItem) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const items = useMemo(() => FURNITURE_CATALOG.filter((item) =>
    (category === "All" || item.category === category) && `${item.name} ${item.collection} ${item.upholstery}`.toLowerCase().includes(query.toLowerCase().trim())), [query, category]);
  return <div className="ws-library">
    <label className="ws-search"><Search size={18} /><span className="visually-hidden">Search furniture</span><input type="search" placeholder="Search beds, sofas, tables…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <div className="ws-categories" role="group" aria-label="Furniture categories">{categories.map((name) => <button key={name} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}</div>
    <p className="ws-library-count">{items.length} pieces · choose one to preview</p>
    <div className="ws-product-grid">{items.map((item) => <article key={item.id} className="ws-product">
      <button onClick={() => onChoose(item)} aria-label={`Preview ${item.name}`}>
        <img src={`${import.meta.env.BASE_URL}furniture-previews/${item.id}.svg`} alt="" width={240} height={168} loading="lazy" />
        <span className="ws-product-brand">{item.collection}</span><strong>{item.name}</strong>
        <span className="ws-dimensions">{item.width.toFixed(2)} × {item.depth.toFixed(2)} × {item.height.toFixed(2)} m</span>
        <span className="ws-product-action">Preview <span aria-hidden="true">＋</span></span>
      </button>
      <details><summary>Details</summary><p>{item.upholstery}</p><p>Width × depth × height. Procedural approximation, not a manufacturer mesh.</p>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">View at IKEA ↗</a>}</details>
    </article>)}</div>
    {items.length === 0 && <p>No matches. Try a different search or category.</p>}
  </div>;
}
