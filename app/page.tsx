"use client";
/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The custom 3D application is a keyboard interaction surface with documented arrow/rotate/cancel bindings. */
import "./workspace.css";
import { Box, Upload, FolderOpen, ArrowRight, Download } from "lucide-react";
import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sampleLevels } from "./scene-data";
import { furnitureCatalogItem, type FurnitureCatalogItem, type FurniturePlacement } from "./furniture-catalog";
import { findNearestValidFurniturePosition, type FurnitureMoveResult } from "./furniture-placement";
import { createFloorplanDocumentV2, documentRegions, documentStructures, documentSceneLevels, type FloorplanDocumentV2 } from "./floorplan-document";
import { downloadProject, parseProject } from "./project-storage";
import { inspectFloorplan } from "./floorplan-intake";
import { useWorkspaceProject } from "./use-workspace-project";
import { collisionDescription, confirmPlacement, placementObstacles, previewPlacement, projectFurnishings, withFurnishings } from "./workspace-state";
import { WorkspaceShell } from "./workspace-shell";
import { WorkspacePanel } from "./workspace-panel";
import { FurnitureLibrary } from "./furniture-library";
import { FurnitureControls } from "./furniture-controls";
import { PlanControls } from "./plan-controls";
import PlanReview from "./plan-review";

const TwinViewer = lazy(() => import("./twin-viewer"));
type Panel = "catalogue" | "project" | "plan" | null;
class ViewerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error("3D viewer failed", error); }
  render() {
    return this.state.failed ? <div className="viewer-loading"><p>The 3D view could not start on this device. Your project is still available to export.</p><button onClick={() => this.setState({ failed: false })}>Retry 3D</button></div> : this.props.children;
  }
}
export default function Home() {
  const { history, dispatch, project, lastProject, saveStatus } = useWorkspaceProject();
  const [stage, setStage] = useState<"welcome" | "analyzing" | "workspace">("welcome");
  const [phase, setPhase] = useState("Reading image…");
  const [panel, setPanel] = useState<Panel>(null);
  const [activeLevel, setActiveLevel] = useState("ground");
  const [focusedLevel, setFocusedLevel] = useState<string | null>(null);
  const [selectedWall, setSelectedWall] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FurniturePlacement | null>(null);
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"perspective" | "top">("perspective");
  const [fitRequest, setFitRequest] = useState(0);
  const [wholeBuilding, setWholeBuilding] = useState(false);
  const [exploded, setExploded] = useState(false);
  const [wallCutaway, setWallCutaway] = useState(0.32);
  const [gridSnap, setGridSnap] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const intakeGeneration = useRef(0);
  const intakeAbort = useRef<AbortController | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  const furnishings = useMemo(() => projectFurnishings(history.present), [history.present]);
  const levels = useMemo(() => project ? documentSceneLevels(project) : sampleLevels, [project]);
  const regions = useMemo(() => project ? documentRegions(project) : [], [project]);
  const structures = useMemo(() => project ? documentStructures(project) : {}, [project]);
  const floor = levels.find((level) => level.id === activeLevel) ?? levels[0];
  const visibleLevels = useMemo(() => new Set(wholeBuilding ? levels.map((level) => level.id) : [activeLevel]), [wholeBuilding, levels, activeLevel]);
  const selected = furnishings.find((placement) => placement.id === selectedId) ?? null;
  const editing = draft ?? selected;
  const draftPreview = draft && floor ? previewPlacement(draft, floor, furnishings, gridSnap) : null;
  const reviewing = panel === "plan";
  useEffect(() => {
    if (editing?.id && !panel) editor.current?.focus({ preventScroll: true });
  }, [editing?.id, panel]);

  function resetWorkspace(firstLevel: string) {
    setActiveLevel(firstLevel); setFocusedLevel(firstLevel); setSelectedWall(null); setSelectedId(null);
    setDraft(null); setPanel(null); setWholeBuilding(false); setExploded(false); setView("perspective");
    setFitRequest((value) => value + 1); setNotice(""); setStage("workspace");
  }
  function openProject(next: FloorplanDocumentV2) {
    if (!next.levels.length) { setNotice("This project has no floors. Try another file."); return; }
    dispatch({ type: "open", snapshot: { kind: "project", document: next } });
    resetWorkspace(documentRegions(next)[0].id);
  }
  function sample() {
    dispatch({ type: "open", snapshot: { kind: "sample", furnishings: [] } });
    resetWorkspace(sampleLevels[0].id);
  }
  async function chooseImage(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 20 * 1024 * 1024) {
      setNotice("Choose a PNG, JPEG or WebP image under 20 MB."); return;
    }
    const generation = ++intakeGeneration.current;
    intakeAbort.current?.abort();
    intakeAbort.current = new AbortController();
    const url = URL.createObjectURL(file);
    setNotice(""); setStage("analyzing"); setPhase("Reading image…");
    try {
      const result = await inspectFloorplan(url, setPhase, intakeAbort.current.signal);
      if (generation !== intakeGeneration.current) return;
      if (!result.regions.length || !Object.values(result.structures).some((structure) => structure.walls.length >= 3)) throw new Error("No usable floorplan was found. Try a clearer, straight-on image.");
      openProject(createFloorplanDocumentV2({ name: file.name, mimeType: file.type, width: result.size.width, height: result.size.height, previewDataUrl: result.previewDataUrl, regions: result.regions, structures: result.structures }));
    } catch (error) {
      if (generation === intakeGeneration.current) { setStage("welcome"); setNotice(error instanceof Error ? error.message : "Could not read this image."); }
    } finally { URL.revokeObjectURL(url); }
  }
  async function importProject(file: File | undefined) {
    if (!file) return;
    try { openProject(parseProject(await file.text())); }
    catch { setNotice("This is not a valid Planform project file. Your current project has not changed."); }
  }
  function commitProject(next: FloorplanDocumentV2) {
    if (next !== project) dispatch({ type: "commit", snapshot: { kind: "project", document: next } });
  }
  function changeFloor(id: string) {
    if (draft) setNotice("Preview cancelled when changing floor.");
    setDraft(null); setSelectedId(null); setSelectedWall(null); setActiveLevel(id); setFocusedLevel(id);
  }
  function undo() {
    if (draft) { setDraft(null); setNotice("Preview cancelled. No saved furniture was changed."); return; }
    if (!history.past.length) return;
    dispatch({ type: "undo" }); setSelectedId(null); setSelectedWall(null); setNotice("Last change undone.");
  }
  function previewMove(id: string, x: number, z: number): FurnitureMoveResult {
    const placement = draft?.id === id ? draft : furnishings.find((item) => item.id === id);
    const level = levels.find((item) => item.id === placement?.levelId);
    if (!placement || !level) return { position: { x, z }, collision: "wall" };
    return previewPlacement({ ...placement, x, z }, level, furnishings, gridSnap);
  }
  function commitMove(id: string, x: number, z: number) {
    const result = previewMove(id, x, z);
    if (draft?.id === id) { setDraft({ ...draft, ...result.position }); return; }
    if (result.collision) { setNotice(collisionDescription(result.collision) + " Move was not saved."); return; }
    const previous = furnishings.find((placement) => placement.id === id);
    if (!previous || (previous.x === result.position.x && previous.z === result.position.z)) return;
    dispatch({ type: "commit", snapshot: withFurnishings(history.present, furnishings.map((placement) => placement.id === id ? { ...placement, ...result.position } : placement)) });
  }
  function chooseFurniture(item: FurnitureCatalogItem) {
    if (!floor) return;
    const placement: FurniturePlacement = { id: "furniture-" + crypto.randomUUID(), catalogId: item.id, levelId: floor.id, x: floor.slab.x, z: floor.slab.z, rotation: 0 };
    const position = findNearestValidFurniturePosition(item, floor, 0, placement, gridSnap ? 0.1 : 0, placementObstacles(furnishings, placement));
    setDraft({ ...placement, ...(position ?? placement) }); setSelectedId(null); setPanel(null);
    setWholeBuilding(false); setExploded(false); setNotice("");
  }
  function changePlacement(next: FurniturePlacement) {
    const level = levels.find((item) => item.id === next.levelId);
    if (!level) return;
    const result = previewPlacement(next, level, furnishings, gridSnap);
    if (draft) { setDraft({ ...next, ...result.position }); return; }
    if (result.collision) { setNotice(collisionDescription(result.collision)); return; }
    dispatch({ type: "commit", snapshot: withFurnishings(history.present, furnishings.map((item) => item.id === next.id ? { ...next, ...result.position } : item)) });
  }
  function removeSelected() {
    if (!selected) return;
    dispatch({ type: "commit", snapshot: withFurnishings(history.present, furnishings.filter((item) => item.id !== selected.id)) }); setSelectedId(null);
  }
  function cancelPlacement() { const wasDraft = Boolean(draft); setDraft(null); setSelectedId(null); if (wasDraft) setPanel("catalogue"); }
  function finishPlacement() {
    if (draft && floor) {
      const next = confirmPlacement(history.present, draft, floor, gridSnap);
      if (next === history.present) return;
      dispatch({ type: "commit", snapshot: next }); setSelectedId(draft.id); setDraft(null); setNotice("Furniture placed.");
    } else setSelectedId(null);
  }
  function toggleReview() { setDraft(null); setSelectedId(null); setPanel(reviewing ? null : "plan"); if (!reviewing) setFocusedLevel(activeLevel); }
  function openCatalogue() { setDraft(null); setSelectedId(null); setPanel("catalogue"); setWholeBuilding(false); setExploded(false); }
  function exportProject() { if (project) { downloadProject(project); setNotice("Project file exported. Send this file to share your apartment."); } }

  useEffect(() => {
    if (stage !== "workspace") return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const key = event.key.toLowerCase();
      if (key === "escape") { event.preventDefault(); if (panel) setPanel(null); else { setDraft(null); setSelectedId(null); } return; }
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      if ((event.ctrlKey || event.metaKey) && key === "z") { event.preventDefault(); undo(); return; }
      if (!editing || panel || target?.closest("button, summary, a")) return;
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", "q", "e", "m", "delete", "backspace", "enter"].includes(key)) event.preventDefault();
      if (key === "arrowleft") commitMove(editing.id, editing.x - 0.1, editing.z);
      if (key === "arrowright") commitMove(editing.id, editing.x + 0.1, editing.z);
      if (key === "arrowup") commitMove(editing.id, editing.x, editing.z - 0.1);
      if (key === "arrowdown") commitMove(editing.id, editing.x, editing.z + 0.1);
      if (key === "q" || key === "e") changePlacement({ ...editing, rotation: editing.rotation + (key === "q" ? -1 : 1) * Math.PI / 12 });
      if (key === "m") changePlacement({ ...editing, mirrored: !editing.mirrored });
      if (key === "delete" || key === "backspace") { if (draft) setDraft(null); else removeSelected(); }
      if (key === "enter") finishPlacement();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, panel, editing, history, levels, gridSnap]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputs = <><input ref={fileInput} className="visually-hidden" tabIndex={-1} type="file" aria-label="Upload floorplan image" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void chooseImage(event.target.files?.[0]); event.target.value = ""; }} /><input ref={projectInput} className="visually-hidden" tabIndex={-1} type="file" aria-label="Import project file" accept=".json,.planform.json" onChange={(event) => { void importProject(event.target.files?.[0]); event.target.value = ""; }} /></>;
  if (stage === "analyzing") return <main className="ws-start"><div className="ws-start-card"><Box size={36} /><h1>Reading your apartment</h1><p role="status">{phase}</p><progress aria-label="Analysing floorplan" /><p>Your image stays on this device.</p><button onClick={() => { intakeGeneration.current++; intakeAbort.current?.abort(); setStage("welcome"); }}>Cancel</button></div></main>;
  if (stage === "welcome") return <main className="ws-start">{inputs}<div className="ws-start-card"><div className="ws-wordmark"><Box size={26} />PLANFORM</div><p className="ws-eyebrow">A little space to make it yours</p><h1>Your apartment.<br />Your way.</h1><p>Bring in a floorplan and arrange your space, one piece at a time.</p>
    {lastProject && <button className="ws-continue" onClick={() => openProject(lastProject)}><span><strong>Continue your project</strong><small>{lastProject.name}</small></span><ArrowRight size={20} /></button>}
    <button className="ws-primary ws-start-upload" onClick={() => fileInput.current?.click()}><Upload size={20} />Upload floorplan</button>
    <div className="ws-start-secondary"><button onClick={() => projectInput.current?.click()}><FolderOpen size={18} />Import project</button><button onClick={sample}>Try sample <ArrowRight size={18} /></button></div>
    {notice && <p className="ws-start-error" role="alert">{notice}</p>}<p className="ws-privacy">No account. No upload server. Saved on this device.<br />PNG, JPEG or WebP · up to 20 MB</p></div></main>;
  return <>{inputs}<WorkspaceShell name={project?.name ?? "Sample apartment"} saveStatus={saveStatus} levels={levels} activeLevel={activeLevel} onFloor={changeFloor} view={view} onView={setView} onFit={() => setFitRequest((value) => value + 1)}
    onMenu={() => { setDraft(null); setSelectedId(null); setPanel(panel === "project" ? null : "project"); }} onAdd={openCatalogue} onReview={toggleReview} onUndo={undo} canUndo={Boolean(history.past.length || draft)}
    needsScale={Boolean(project && project.scale.source !== "user")} reviewing={reviewing} panelOpen={Boolean(panel || editing)} notice={notice} clearNotice={() => setNotice("")}
    panels={<>
      <WorkspacePanel title="Furniture" open={panel === "catalogue"} onClose={() => setPanel(null)} className="ws-catalogue-panel"><FurnitureLibrary onChoose={chooseFurniture} /></WorkspacePanel>
      <WorkspacePanel title="Project" open={panel === "project"} onClose={() => setPanel(null)}>
        <div className="ws-menu-actions"><button disabled={!project} onClick={exportProject}><Download size={18} />Export / share project file</button><button onClick={() => projectInput.current?.click()}><FolderOpen size={18} />Import project</button><button onClick={() => { setNotice(""); setStage("welcome"); }}>Back to start</button></div>
        <h3>View settings</h3>
        <details><summary>Furniture on this floor ({furnishings.filter((item) => item.levelId === activeLevel).length})</summary>
          <div className="ws-menu-actions">{furnishings.filter((item) => item.levelId === activeLevel).map((item) => <button key={item.id} onClick={() => { setWholeBuilding(false); setExploded(false); setSelectedId(item.id); setPanel(null); }}>Edit {furnitureCatalogItem(item.catalogId)?.name ?? item.catalogId}</button>)}</div>
        </details>
        <label className="ws-check"><input type="checkbox" checked={wholeBuilding} onChange={(event) => { setWholeBuilding(event.target.checked); setFitRequest((value) => value + 1); }} />Show whole building</label>
        <label className="ws-check"><input type="checkbox" disabled={!wholeBuilding} checked={exploded} onChange={(event) => setExploded(event.target.checked)} />Separate floors</label>
        <label>Wall height<select value={wallCutaway} onChange={(event) => setWallCutaway(Number(event.target.value))}><option value={0.32}>Cutaway</option><option value={0.65}>Medium</option><option value={1}>Full height</option></select></label>
        <label className="ws-check"><input type="checkbox" checked={gridSnap} onChange={(event) => setGridSnap(event.target.checked)} />Snap to 10 cm grid</label>
        <label className="ws-check"><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />Show guide grid (50 cm)</label>
        <label className="ws-check"><input type="checkbox" checked={showLegend} onChange={(event) => setShowLegend(event.target.checked)} />Show model legend</label>
        <details><summary>Controls & project info</summary><p>Tap to select. Drag a selected piece to move it. Drag empty space to orbit in 3D or pan in Top. Use two fingers to pan and zoom.</p><p>Keyboard: arrows move 10 cm, Q/E rotate 15°, M mirrors, Delete removes, Esc cancels, Ctrl/Cmd+Z undoes.</p><p>Undo covers this session. Export a copy for backups or sharing; browser storage can be cleared.</p><p>Build {typeof __BUILD_ID__ === "undefined" ? "development" : __BUILD_ID__} · mobile workspace</p></details>
      </WorkspacePanel>
      <WorkspacePanel title="Check plan" open={reviewing} onClose={() => setPanel(null)}><PlanControls project={project} activeLevel={activeLevel} selectedWall={selectedWall} onSelectWall={setSelectedWall} onChange={commitProject} onMessage={setNotice} /></WorkspacePanel>
    </>}
    context={!panel && editing ? <FurnitureControls placement={editing} draft={Boolean(draft)} issue={draftPreview?.collision ? collisionDescription(draftPreview.collision) : null}
      onRotate={(degrees) => changePlacement({ ...editing, rotation: editing.rotation + degrees * Math.PI / 180 })} onMirror={() => changePlacement({ ...editing, mirrored: !editing.mirrored })}
      onNudge={(x, z) => commitMove(editing.id, editing.x + x, editing.z + z)} onDelete={removeSelected} onDone={finishPlacement} onCancel={cancelPlacement} /> : null}>
      <div ref={editor} className="ws-viewer" role="application" aria-label="Apartment editor" aria-describedby="editor-keyboard-help" tabIndex={0} style={{ visibility: reviewing ? "hidden" : "visible" }} inert={reviewing}>
        <span id="editor-keyboard-help" className="visually-hidden">Selected furniture: arrows move, Q and E rotate, M mirrors, Enter confirms, Escape cancels. Use Project menu to select existing furniture by name.</span>
        <ViewerBoundary><Suspense fallback={<div className="viewer-loading">Opening your apartment…</div>}>
          <TwinViewer decorating={!wholeBuilding && !reviewing} exploded={wholeBuilding && exploded} furnishings={furnishings} gridSnapEnabled={showGrid} levels={levels}
            onCommitMoveFurnishing={commitMove} onPreviewMoveFurnishing={previewMove} onSelectFurnishing={(id) => { if (!draft) { setSelectedId(id); if (id) setPanel(null); } }}
            selectedFurnishingId={selectedId} visibleLevels={visibleLevels} wallCutaway={wallCutaway}
            activeLevel={activeLevel} view={view} fitRequest={fitRequest} active={!reviewing} draft={draft} draftCollision={draftPreview?.collision ?? null}
            onDraftPosition={(x, z) => { if (draft) { const result = previewMove(draft.id, x, z); setDraft({ ...draft, ...result.position }); } }} showLegend={showLegend} />
        </Suspense></ViewerBoundary>
      </div>
      {reviewing && <div className="ws-plan-stage"><PlanReview imageUrl={project?.source.previewDataUrl ?? null} regions={regions} structures={structures} analysisSize={project ? { width: project.source.width, height: project.source.height } : null} activeLevel={activeLevel} focusedLevel={focusedLevel} selectedWallId={selectedWall} setActiveLevel={changeFloor} setFocusedLevel={setFocusedLevel} setSelectedWallId={setSelectedWall} /></div>}
    </WorkspaceShell></>;
}
