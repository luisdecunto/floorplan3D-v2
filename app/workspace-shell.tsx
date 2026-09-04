import { Plus, ScanLine, Undo2, MoreHorizontal, Maximize2, Box, Map, Ruler } from "lucide-react";
import type { ReactNode } from "react";
import type { Level } from "./scene-data";

export function WorkspaceShell({ name, saveStatus, levels, activeLevel, onFloor, view, onView, onFit, onMenu, onAdd, onReview, onUndo, canUndo, needsScale, reviewing, panelOpen, children, panels, context, notice, clearNotice }: {
  name: string; saveStatus: string; levels: Level[]; activeLevel: string; onFloor: (id: string) => void;
  view: "perspective" | "top"; onView: (view: "perspective" | "top") => void;
  onFit: () => void; onMenu: () => void; onAdd: () => void; onReview: () => void; onUndo: () => void;
  canUndo: boolean; needsScale: boolean; reviewing: boolean; panelOpen: boolean;
  children: ReactNode; panels: ReactNode; context: ReactNode; notice: string; clearNotice: () => void;
}) {
  return <main className={"ws-app" + (panelOpen ? " has-panel" : "") + (reviewing ? " is-reviewing" : "")}>
    <header className="ws-header"><span className="ws-logo" aria-label="Planform"><Box size={24} /></span><div className="ws-project-title"><h1>{name}</h1><span role="status">{saveStatus}</span></div><button className="ws-icon" onClick={onMenu} aria-label="Project menu"><MoreHorizontal size={22} /></button></header>
    <div className="ws-toolbar">
      <label className="ws-floor"><span className="visually-hidden">Active floor</span><select value={activeLevel} onChange={(event) => onFloor(event.target.value)}>{levels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}</select></label>
      {!reviewing && <div className="ws-view-switch" role="group" aria-label="Camera view"><button onClick={() => onView("perspective")} aria-pressed={view === "perspective"}><Box size={16} />3D</button><button onClick={() => onView("top")} aria-pressed={view === "top"}><Map size={16} />Top</button></div>}
      {reviewing ? <button onClick={onReview} className="ws-return">Back to 3D</button> : <button className="ws-icon" onClick={onFit} aria-label="Fit apartment in view"><Maximize2 size={18} /></button>}
    </div>
    <div className="ws-workarea"><div className="ws-stage">
      {children}
      {needsScale && !reviewing && <button className="ws-scale-reminder" onClick={onReview}><Ruler size={15} />Check scale</button>}
      {notice && <div className="ws-notice" role="status"><span>{notice}</span><button onClick={clearNotice} aria-label="Dismiss message">×</button></div>}
    </div><div className="ws-panels">{panels}{context}</div></div>
    <nav className="ws-bottom" aria-label="Workspace actions"><button className="ws-add" onClick={onAdd}><Plus size={21} />Add furniture</button><button onClick={onReview} aria-pressed={reviewing}><ScanLine size={20} />Check plan</button><button onClick={onUndo} disabled={!canUndo} aria-label="Undo last change"><Undo2 size={20} /><span>Undo</span></button></nav>
  </main>;
}
