import { useState } from "react";
import { addDocumentOpening, removeDocumentWall, setDocumentScale, updateDocumentLevel, realignDocumentStairs, type FloorplanDocumentV2 } from "./floorplan-document";
import { documentRegions } from "./floorplan-document";
import { moveRegion, resequenceRegions, resizeRegion } from "./plan-regions";

export function PlanControls({ project, activeLevel, selectedWall, onSelectWall, onChange, onMessage }: {
  project: FloorplanDocumentV2 | null; activeLevel: string; selectedWall: string | null; onSelectWall: (id: string | null) => void;
  onChange: (project: FloorplanDocumentV2) => void; onMessage: (message: string) => void;
}) {
  const [measurement, setMeasurement] = useState("");
  if (!project) return <p>This is a sample apartment. Upload a floorplan to review its original image and measurements.</p>;
  const level = project.levels.find((item) => item.id === activeLevel);
  if (!level) return null;
  const wall = level.structure.walls.find((item) => item.id === selectedWall);
  const issues = project.issues.filter((issue) => !issue.resolved && (!issue.levelId || issue.levelId === activeLevel));
  function reorder(reverse: boolean, direction: -1 | 1 = 1) {
    if (!project) return;
    const regions = documentRegions(project);
    const next = reverse ? resequenceRegions([...regions].reverse()) : moveRegion(regions, activeLevel, direction);
    onChange({ ...project, updatedAt: new Date().toISOString(), levels: next.map((region, order) => ({ ...project.levels.find((item) => item.id === region.id)!, name: region.name, sourceRegion: region, order, elevation: order * 3.05 })) });
  }
  return <div className="ws-plan-controls">
    <p className="ws-muted">The original image is the reference. Tap a wall or select it below to correct or measure it.</p>
    <label>Selected wall<select value={selectedWall ?? ""} onChange={(event) => onSelectWall(event.target.value || null)}><option value="">Choose a wall</option>{level.structure.walls.map((item, index) => <option key={item.id} value={item.id}>Wall {index + 1} · {item.axis}</option>)}</select></label>
    {wall && <>
      <form className="ws-measure" onSubmit={(event) => {
        event.preventDefault();
        const metres = Number(measurement);
        const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
        if (!Number.isFinite(metres) || metres <= 0 || metres > 40 || length <= 0) return;
        onChange(setDocumentScale(project, metres / length)); onMessage("Scale updated from your measurement.");
      }}><label>Real wall length (metres)<input type="number" inputMode="decimal" min="0.01" max="40" step="0.01" required value={measurement} onChange={(event) => setMeasurement(event.target.value)} placeholder="e.g. 3.60" /></label><button className="ws-primary" type="submit">Set scale</button></form>
      <div className="ws-button-row"><button onClick={() => onChange(addDocumentOpening(project, activeLevel, wall.id, "door"))}>Add door</button><button onClick={() => onChange(addDocumentOpening(project, activeLevel, wall.id, "window"))}>Add window</button><button onClick={() => { onChange(removeDocumentWall(project, activeLevel, wall.id)); onSelectWall(null); }}>Remove wall</button></div>
    </>}
    <p className="ws-scale-status">{project.scale.source === "user" ? "Scale verified by your measurement." : "Scale is estimated. Furniture fit needs a known measurement."}</p>
    <details open><summary>{issues.length ? issues.length + " review notes" : "No outstanding review notes"}</summary><ul className="ws-issues">{issues.map((issue) => <li key={issue.id}>{issue.message}</li>)}</ul>
      <button onClick={() => onChange({ ...project, updatedAt: new Date().toISOString(), levels: project.levels.map((item) => item.id === activeLevel ? { ...item, confirmed: true } : item), issues: project.issues.map((issue) => issue.levelId === activeLevel && issue.code !== "scale-needed" ? { ...issue, resolved: true } : issue) })}>{level.confirmed ? "Floor reviewed" : "Mark this floor reviewed"}</button></details>
    <details><summary>Floors & source boundaries</summary>
      <form onSubmit={(event) => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name") ?? "").trim(); if (name) onChange(updateDocumentLevel(project, activeLevel, (item) => ({ ...item, name, sourceRegion: { ...item.sourceRegion, name, nameEdited: true } }), { kind: "rename-level", before: level.name, after: name })); }}>
        <label>Floor name<input key={level.id + level.name} name="name" defaultValue={level.name} required maxLength={60} /></label><button type="submit">Rename floor</button></form>
      <div className="ws-button-row"><button disabled={level.order === 0} onClick={() => reorder(false, -1)}>Move down</button><button disabled={level.order === project.levels.length - 1} onClick={() => reorder(false, 1)}>Move up</button><button onClick={() => reorder(true)}>Reverse order</button></div>
      <p>Adjust the source review boundary. This does not re-run detection.</p>
      <div className="ws-button-row"><button onClick={() => onChange(updateDocumentLevel(project, activeLevel, (item) => ({ ...item, sourceRegion: resizeRegion(item.sourceRegion, -0.015) })))}>Shrink boundary</button><button onClick={() => onChange(updateDocumentLevel(project, activeLevel, (item) => ({ ...item, sourceRegion: resizeRegion(item.sourceRegion, 0.015) })))}>Expand boundary</button></div>
      <label className="ws-check"><input type="checkbox" checked={Boolean(level.sourceRegion.hasOutdoorArea)} onChange={(event) => onChange(updateDocumentLevel(project, activeLevel, (item) => ({ ...item, sourceRegion: { ...item.sourceRegion, hasOutdoorArea: event.target.checked } }), { kind: "set-outdoor-area", before: level.sourceRegion.hasOutdoorArea, after: event.target.checked }))} />Includes outdoor area</label>
      <button onClick={() => onChange(realignDocumentStairs(project))}>Realign stair shafts</button>
    </details>
  </div>;
}
