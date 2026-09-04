import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, FlipHorizontal2, RotateCcw, RotateCw, Trash2, Check, X } from "lucide-react";
import type { FurniturePlacement } from "./furniture-catalog";
import { furnitureCatalogItem } from "./furniture-catalog";

export function FurnitureControls({ placement, draft, issue, onRotate, onMirror, onNudge, onDelete, onDone, onCancel }: {
  placement: FurniturePlacement; draft: boolean; issue: string | null;
  onRotate: (degrees: number) => void; onMirror: () => void; onNudge: (x: number, z: number) => void;
  onDelete: () => void; onDone: () => void; onCancel: () => void;
}) {
  const item = furnitureCatalogItem(placement.catalogId);
  return <section className={`ws-context ${issue ? "invalid" : ""}`} aria-label={draft ? "Placement preview" : "Selected furniture"}>
    <div className="ws-context-title"><div><small>{draft ? "PREVIEW · NOT SAVED" : "SELECTED"}</small><strong>{item?.name ?? "Furniture"}</strong></div>
      <button className="ws-icon" aria-label={draft ? "Cancel placement" : "Deselect furniture"} onClick={onCancel}><X size={20} /></button></div>
    {draft && <p className="ws-placement-hint" role="status">{issue ?? "Tap the floor or drag to position. Place when ready."}</p>}
    <div className="ws-context-actions">
      <button onClick={() => onRotate(90)} aria-label="Rotate furniture 90 degrees"><RotateCw size={18} />90°</button>
      <button onClick={onMirror} aria-label="Mirror furniture"><FlipHorizontal2 size={18} /><span>Mirror</span></button>
      {!draft && <button onClick={onDelete} aria-label="Delete furniture"><Trash2 size={18} /></button>}
      <button className="ws-primary" onClick={onDone} disabled={draft && Boolean(issue)}><Check size={18} />{draft ? "Place" : "Done"}</button>
    </div>
    <details className="ws-precision"><summary>Fine adjustments · {Math.round(placement.rotation * 180 / Math.PI) % 360}°</summary>
      <div className="ws-adjustments"><button onClick={() => onRotate(-15)} aria-label="Rotate left 15 degrees"><RotateCcw size={16} />15°</button><button onClick={() => onRotate(15)} aria-label="Rotate right 15 degrees"><RotateCw size={16} />15°</button>
      <div role="group" aria-label="Move furniture 10 centimetres"><button onClick={() => onNudge(-0.1, 0)} aria-label="Move left 10 cm"><ArrowLeft size={18} /></button><button onClick={() => onNudge(0, -0.1)} aria-label="Move back 10 cm"><ArrowUp size={18} /></button><button onClick={() => onNudge(0, 0.1)} aria-label="Move forward 10 cm"><ArrowDown size={18} /></button><button onClick={() => onNudge(0.1, 0)} aria-label="Move right 10 cm"><ArrowRight size={18} /></button></div></div>
    </details>
  </section>;
}
