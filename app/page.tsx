"use client";
/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The custom 3D application is a keyboard interaction surface with documented arrow/rotate/cancel bindings. */
import "./workspace.css";
import { Box, Upload, FolderOpen, ArrowRight, Download, Share2, Users, LogOut } from "lucide-react";
import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sampleLevels } from "./scene-data";
import { furnitureCatalogItem, type FurnitureCatalogItem, type FurniturePlacement } from "./furniture-catalog";
import { findNearestValidFurniturePosition, findNearestWallMountedFurniturePlacement, type FurnitureMoveResult } from "./furniture-placement";
import { createFloorplanDocumentV2, documentRegions, documentStructures, documentSceneLevels, type FloorplanDocumentV2 } from "./floorplan-document";
import { downloadProject, parseProject } from "./project-storage";
import { createProjectShareUrl, decodeSharedProject, sharedProjectPayload, ShareLinkTooLargeError } from "./project-share";
import { collaborationInvite } from "./collaboration-protocol";
import { CollaborationHistory } from "./collaboration-history";
import { CollaborationJoin } from "./collaboration-join";
import { useCollaboration } from "./use-collaboration";
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
function hasStartupShare() { return typeof window !== "undefined" && Boolean(collaborationInvite(window.location.hash) || sharedProjectPayload(window.location.hash)); }
function startupPhase() { return typeof window !== "undefined" && collaborationInvite(window.location.hash) ? "Joining shared apartment…" : "Opening shared apartment…"; }
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
  const [stage, setStage] = useState<"welcome" | "analyzing" | "workspace">(() => hasStartupShare() ? "analyzing" : "welcome");
  const [phase, setPhase] = useState(() => hasStartupShare() ? startupPhase() : "Reading image…");
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
  const [sharing, setSharing] = useState(false);
  const [historyTargetRevision, setHistoryTargetRevision] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const intakeGeneration = useRef(0);
  const intakeAbort = useRef<AbortController | null>(null);
  const sharedProjectStarted = useRef(false);
  const editor = useRef<HTMLDivElement>(null);

  function resetWorkspace(firstLevel: string) {
    setActiveLevel(firstLevel); setFocusedLevel(firstLevel); setSelectedWall(null); setSelectedId(null);
    setDraft(null); setPanel(null); setHistoryTargetRevision(null); setWholeBuilding(false); setExploded(false); setView("perspective");
    setFitRequest((value) => value + 1); setNotice(""); setStage("workspace");
  }
  function openProject(next: FloorplanDocumentV2) {
    if (!next.levels.length) { setNotice("This project has no floors. Try another file."); return; }
    collaboration.leave();
    dispatch({ type: "open", snapshot: { kind: "project", document: next } });
    resetWorkspace(documentRegions(next)[0].id);
  }
  const collaboration = useCollaboration({
    onDocument: (next, initial) => {
      setHistoryTargetRevision(null);
      dispatch({ type: "sync", snapshot: { kind: "project", document: next } });
      if (initial) {
        resetWorkspace(documentRegions(next)[0].id);
        setNotice("Live apartment joined. Changes now sync between everyone with this link.");
      }
    },
    onNotice: setNotice,
    onFatalError: () => setStage("welcome"),
  });
  const currentFurnishings = useMemo(() => projectFurnishings(history.present), [history.present]);
  const historyPreview = historyTargetRevision !== null && collaboration.historySnapshot?.revision === historyTargetRevision
    ? collaboration.historySnapshot
    : null;
  const displayedProject = historyPreview?.document ?? project;
  const furnishings = historyPreview?.document.furnishings ?? currentFurnishings;
  const levels = useMemo(() => displayedProject ? documentSceneLevels(displayedProject) : sampleLevels, [displayedProject]);
  const regions = useMemo(() => displayedProject ? documentRegions(displayedProject) : [], [displayedProject]);
  const structures = useMemo(() => displayedProject ? documentStructures(displayedProject) : {}, [displayedProject]);
  const floor = levels.find((level) => level.id === activeLevel) ?? levels[0];
  const visibleLevels = useMemo(() => new Set(wholeBuilding ? levels.map((level) => level.id) : [activeLevel]), [wholeBuilding, levels, activeLevel]);
  const selected = historyPreview ? null : currentFurnishings.find((placement) => placement.id === selectedId) ?? null;
  const editing = draft ?? selected;
  const draftPreview = !historyPreview && draft && floor ? previewPlacement(draft, floor, currentFurnishings, gridSnap) : null;
  const reviewing = panel === "plan";
  useEffect(() => {
    if (editing?.id && !panel) editor.current?.focus({ preventScroll: true });
  }, [editing?.id, panel]);
  function commitSnapshot(next: typeof history.present) {
    if (historyPreview) return;
    if (next === history.present) return;
    const before = history.present;
    dispatch({ type: "commit", snapshot: next });
    if (before.kind === "project" && next.kind === "project") collaboration.commit(before.document, next.document);
  }
  function sample() {
    collaboration.leave();
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
    if (historyPreview) { setNotice("Exit version preview before editing the apartment."); return; }
    if (next !== project) commitSnapshot({ kind: "project", document: next });
  }
  function changeFloor(id: string) {
    if (draft) setNotice("Preview cancelled when changing floor.");
    setDraft(null); setSelectedId(null); setSelectedWall(null); setActiveLevel(id); setFocusedLevel(id);
    setWholeBuilding(false); setExploded(false);
  }
  useEffect(() => {
    if (sharedProjectStarted.current) return;
    const payload = sharedProjectPayload(window.location.hash);
    if (!payload) return;
    sharedProjectStarted.current = true;
    void decodeSharedProject(payload).then((shared) => {
      const now = new Date().toISOString();
      const copy = { ...shared, id: `project-${crypto.randomUUID()}`, name: `${shared.name} · shared copy`, createdAt: now, updatedAt: now };
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      openProject(copy);
      setNotice("Shared apartment opened as an editable copy and saved on this device.");
    }).catch((error: unknown) => {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setStage("welcome");
      setNotice(error instanceof Error ? error.message : "This shared apartment could not be opened.");
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- A share hash is consumed once when the application starts.
  function changeWholeBuilding(show: boolean) {
    if (draft) setNotice("Preview cancelled when changing house view.");
    setDraft(null); setSelectedId(null); setWholeBuilding(show);
    if (!show) setExploded(false);
  }
  function undo() {
    if (historyPreview) { setNotice("Exit version preview before editing the apartment."); return; }
    if (draft) { setDraft(null); setNotice("Preview cancelled. No saved furniture was changed."); return; }
    if (collaboration.active) {
      if (collaboration.undo()) setNotice("Undo sent to the shared apartment.");
      return;
    }
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
    if (historyPreview) { setNotice("Exit version preview before editing the apartment."); return; }
    const result = previewMove(id, x, z);
    if (draft?.id === id) { setDraft({ ...draft, ...result.position }); return; }
    if (result.collision) { setNotice(collisionDescription(result.collision) + " Move was not saved."); return; }
    const previous = furnishings.find((placement) => placement.id === id);
    if (!previous || (previous.x === result.position.x && previous.z === result.position.z)) return;
    commitSnapshot(withFurnishings(history.present, furnishings.map((placement) => placement.id === id ? { ...placement, ...result.position } : placement)));
  }
  function chooseFurniture(item: FurnitureCatalogItem) {
    if (historyPreview) { setNotice("Exit version preview before adding furniture."); return; }
    if (!floor) return;
    const placement: FurniturePlacement = { id: "furniture-" + crypto.randomUUID(), catalogId: item.id, levelId: floor.id, x: floor.slab.x, z: floor.slab.z, rotation: 0 };
    const obstacles = placementObstacles(furnishings, placement);
    const mounted = findNearestWallMountedFurniturePlacement(item, floor, placement, obstacles);
    const position = mounted?.position ?? findNearestValidFurniturePosition(item, floor, mounted?.rotation ?? 0, placement, gridSnap ? 0.1 : 0, obstacles);
    setDraft({ ...placement, rotation: mounted?.rotation ?? 0, ...(position ?? { x: placement.x, z: placement.z }) }); setSelectedId(null); setPanel(null);
    setWholeBuilding(false); setExploded(false); setNotice("");
  }
  function changePlacement(next: FurniturePlacement) {
    if (historyPreview) { setNotice("Exit version preview before editing the apartment."); return; }
    const level = levels.find((item) => item.id === next.levelId);
    if (!level) return;
    const result = previewPlacement(next, level, furnishings, gridSnap);
    if (draft) { setDraft({ ...next, ...result.position }); return; }
    if (result.collision) { setNotice(collisionDescription(result.collision)); return; }
    commitSnapshot(withFurnishings(history.present, furnishings.map((item) => item.id === next.id ? { ...next, ...result.position } : item)));
  }
  function removeSelected() {
    if (historyPreview) { setNotice("Exit version preview before editing the apartment."); return; }
    if (!selected) return;
    commitSnapshot(withFurnishings(history.present, furnishings.filter((item) => item.id !== selected.id))); setSelectedId(null);
  }
  function cancelPlacement() { const wasDraft = Boolean(draft); setDraft(null); setSelectedId(null); if (wasDraft) setPanel("catalogue"); }
  function finishPlacement() {
    if (historyPreview) { setNotice("Exit version preview before editing the apartment."); return; }
    if (draft && floor) {
      const next = confirmPlacement(history.present, draft, floor, gridSnap);
      if (next === history.present) return;
      commitSnapshot(next); setSelectedId(draft.id); setDraft(null); setNotice("Furniture placed.");
    } else setSelectedId(null);
  }
  function toggleReview() {
    if (historyPreview) { setNotice("Exit version preview before opening plan editing."); return; }
    setDraft(null); setSelectedId(null); setPanel(reviewing ? null : "plan"); if (!reviewing) setFocusedLevel(activeLevel);
  }
  function openCatalogue() {
    if (historyPreview) { setNotice("Exit version preview before adding furniture."); return; }
    setDraft(null); setSelectedId(null); setPanel("catalogue");
  }
  function previewHistory(revision: number) {
    setHistoryTargetRevision(revision);
    if (collaboration.historySnapshot?.revision === revision) return;
    if (!collaboration.requestHistorySnapshot(revision)) {
      setHistoryTargetRevision(null);
      setNotice("Wait until the live apartment is connected before opening history.");
    }
  }
  function restoreHistory() {
    if (!project || !historyPreview) return;
    if (!window.confirm(`Restore version ${historyPreview.revision}? This will create a new shared version.`)) return;
    if (collaboration.restore(project, historyPreview.document)) setNotice("Restoring this version for everyone…");
    else setNotice("Finish the current shared change before restoring a version.");
  }
  function exportProject() { if (project) { downloadProject(project); setNotice("Project file exported. Send this file to share your apartment."); } }
  async function copyShareLink(url: string) {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); return; }
    const field = document.createElement("textarea");
    field.value = url; field.setAttribute("readonly", ""); field.style.position = "fixed"; field.style.opacity = "0";
    document.body.appendChild(field); field.select();
    const copied = document.execCommand("copy"); field.remove();
    if (!copied) throw new Error("Copy failed");
  }
  async function shareProject() {
    if (!project || sharing) return;
    setSharing(true);
    try {
      const applicationUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href;
      const url = await createProjectShareUrl(project, applicationUrl);
      if (navigator.share) {
        await navigator.share({ title: project.name, text: "Open this apartment in Planform", url });
        setNotice("Share link sent. It contains a snapshot of your apartment, without the original floorplan image.");
      } else {
        await copyShareLink(url);
        setNotice("Share link copied. It contains a snapshot of your apartment, without the original floorplan image.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice(error instanceof ShareLinkTooLargeError
        ? "This apartment is too large for a reliable link. Export the project file instead."
        : "The share link could not be created. Export the project file instead.");
    } finally { setSharing(false); }
  }
  async function shareLiveProject() {
    if (!project || sharing) return;
    setSharing(true);
    try {
      const applicationUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href;
      const url = collaboration.inviteUrl ?? await collaboration.start(project, applicationUrl);
      if (navigator.share) {
        await navigator.share({ title: project.name, text: "Edit our apartment together in Planform", url });
        setNotice("Collaboration link sent. Anyone with it can edit this apartment live.");
      } else {
        await copyShareLink(url);
        setNotice("Collaboration link copied. Anyone with it can edit this apartment live.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice(error instanceof Error ? error.message : "The live room could not be created.");
    } finally { setSharing(false); }
  }

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

  if (collaboration.pendingJoin) return <CollaborationJoin onJoin={collaboration.join} onCancel={() => { collaboration.leave(); if (stage === "analyzing") setStage("welcome"); }} />;
  const inputs = <><input ref={fileInput} className="visually-hidden" tabIndex={-1} type="file" aria-label="Upload floorplan image" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void chooseImage(event.target.files?.[0]); event.target.value = ""; }} /><input ref={projectInput} className="visually-hidden" tabIndex={-1} type="file" aria-label="Import project file" accept=".json,.planform.json" onChange={(event) => { void importProject(event.target.files?.[0]); event.target.value = ""; }} /></>;
  if (stage === "analyzing") return <main className="ws-start"><div className="ws-start-card"><Box size={36} /><h1>Reading your apartment</h1><p role="status">{phase}</p><progress aria-label="Analysing floorplan" /><p>Your image stays on this device.</p><button onClick={() => { intakeGeneration.current++; intakeAbort.current?.abort(); setStage("welcome"); }}>Cancel</button></div></main>;
  if (stage === "welcome") return <main className="ws-start">{inputs}<div className="ws-start-card"><div className="ws-wordmark"><Box size={26} />PLANFORM</div><p className="ws-eyebrow">A little space to make it yours</p><h1>Your apartment.<br />Your way.</h1><p>Bring in a floorplan and arrange your space, one piece at a time.</p>
    {lastProject && <button className="ws-continue" onClick={() => openProject(lastProject)}><span><strong>Continue your project</strong><small>{lastProject.name}</small></span><ArrowRight size={20} /></button>}
    <button className="ws-primary ws-start-upload" onClick={() => fileInput.current?.click()}><Upload size={20} />Upload floorplan</button>
    <div className="ws-start-secondary"><button onClick={() => projectInput.current?.click()}><FolderOpen size={18} />Import project</button><button onClick={sample}>Try sample <ArrowRight size={18} /></button></div>
    {notice && <p className="ws-start-error" role="alert">{notice}</p>}<p className="ws-privacy">No account. Floorplan analysis stays on this device.<br />Live rooms share only the model, never the source image.</p></div></main>;
  return <>{inputs}<WorkspaceShell name={project?.name ?? "Sample apartment"} saveStatus={saveStatus} levels={levels} activeLevel={activeLevel} onFloor={changeFloor} view={view} onView={setView} onFit={() => setFitRequest((value) => value + 1)}
    wholeBuilding={wholeBuilding} onWholeBuilding={changeWholeBuilding} wallCutaway={wallCutaway} onWallCutaway={setWallCutaway}
    collaboration={collaboration.active ? { status: collaboration.status, people: collaboration.people } : null}
    onMenu={() => { setDraft(null); setSelectedId(null); setPanel(panel === "project" ? null : "project"); }} onAdd={openCatalogue} onReview={toggleReview} onUndo={undo} canUndo={Boolean(!historyPreview && (draft || (collaboration.active ? collaboration.canUndo : history.past.length)))}
    needsScale={Boolean(project && project.scale.source !== "user")} reviewing={reviewing} panelOpen={Boolean(panel || editing)} notice={notice} clearNotice={() => setNotice("")}
    panels={<>
      <WorkspacePanel title="Furniture" open={panel === "catalogue"} onClose={() => setPanel(null)} className="ws-catalogue-panel"><FurnitureLibrary onChoose={chooseFurniture} /></WorkspacePanel>
      <WorkspacePanel title="Project" open={panel === "project"} onClose={() => setPanel(null)}>
        {collaboration.active && <div className="ws-live-card"><span className={`ws-live-dot ${collaboration.status}`} /><span><strong>{collaboration.status === "live" ? `Live together · ${collaboration.people} ${collaboration.people === 1 ? "person" : "people"}` : collaboration.status === "reconnecting" ? "Reconnecting…" : "Connecting…"}</strong><small>Everyone with the secret link can edit.</small></span></div>}
        {collaboration.active && collaboration.collaborators.length > 0 && <ul className="ws-collaborators" aria-label="Online collaborators">{collaboration.collaborators.map((member) => <li key={member.id}><span className="ws-live-dot live" /><span>{member.name}{collaboration.collaborators.filter((other) => other.name.toLowerCase() === member.name.toLowerCase()).length > 1 ? ` (${member.id.slice(0, 6)})` : ""}{member.id === collaboration.selfId ? " · You" : ""}</span><small>Online</small></li>)}</ul>}
        <div className="ws-menu-actions"><button disabled={!project || sharing} onClick={() => void shareLiveProject()}><Users size={18} />{sharing ? "Preparing link…" : collaboration.active ? "Share collaboration link" : "Collaborate live"}</button><button disabled={!project || sharing} onClick={() => void shareProject()}><Share2 size={18} />Send an editable copy</button>{collaboration.active && <button onClick={() => { collaboration.leave(); setHistoryTargetRevision(null); setNotice("You left the live room. This apartment is now a local copy."); }}><LogOut size={18} />Leave live room</button>}<button disabled={!project} onClick={exportProject}><Download size={18} />Export project file</button><button onClick={() => projectInput.current?.click()}><FolderOpen size={18} />Import project</button><button onClick={() => { collaboration.leave(); setHistoryTargetRevision(null); setNotice(""); setStage("welcome"); }}>Back to start</button></div>
        {collaboration.active && <CollaborationHistory entries={collaboration.historyEntries} previewRevision={historyTargetRevision} loadingRevision={collaboration.historyLoadingRevision} canRestore={Boolean(historyPreview && collaboration.status === "live")} onPreview={previewHistory} onRestore={restoreHistory} />}
        <h3>View settings</h3>
        {!historyPreview && <details><summary>Furniture on this floor ({furnishings.filter((item) => item.levelId === activeLevel).length})</summary>
          <div className="ws-menu-actions">{furnishings.filter((item) => item.levelId === activeLevel).map((item) => <button key={item.id} onClick={() => { setWholeBuilding(false); setExploded(false); setSelectedId(item.id); setPanel(null); }}>Edit {furnitureCatalogItem(item.catalogId)?.name ?? item.catalogId}</button>)}</div>
        </details>}
        <label className="ws-check"><input type="checkbox" disabled={!wholeBuilding} checked={exploded} onChange={(event) => setExploded(event.target.checked)} />Separate floors</label>
        <label className="ws-check"><input type="checkbox" checked={gridSnap} onChange={(event) => setGridSnap(event.target.checked)} />Snap to 10 cm grid</label>
        <label className="ws-check"><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />Show guide grid (50 cm)</label>
        <label className="ws-check"><input type="checkbox" checked={showLegend} onChange={(event) => setShowLegend(event.target.checked)} />Show model legend</label>
        <details><summary>Controls & project info</summary><p>Tap to select. Drag a selected piece to move it. Drag empty space to orbit in 3D or pan in Top. Use two fingers to pan and zoom.</p><p>Keyboard: arrows move 10 cm, Q/E rotate 15°, M mirrors, Delete removes, Esc cancels, Ctrl/Cmd+Z undoes.</p><p>Collaborate live keeps everyone with the secret link in the same apartment. Send an editable copy creates an independent snapshot. Neither link contains the original floorplan image.</p><p>Build {typeof __BUILD_ID__ === "undefined" ? "development" : __BUILD_ID__} · mobile workspace</p></details>
      </WorkspacePanel>
      <WorkspacePanel title="Check plan" open={reviewing} onClose={() => setPanel(null)}><PlanControls project={displayedProject} activeLevel={activeLevel} selectedWall={selectedWall} onSelectWall={setSelectedWall} onChange={commitProject} onMessage={setNotice} /></WorkspacePanel>
    </>}
    context={!panel && editing ? <FurnitureControls placement={editing} draft={Boolean(draft)} issue={draftPreview?.collision ? collisionDescription(draftPreview.collision) : null}
      onRotate={(degrees) => changePlacement({ ...editing, rotation: editing.rotation + degrees * Math.PI / 180 })} onMirror={() => changePlacement({ ...editing, mirrored: !editing.mirrored })}
      onNudge={(x, z) => commitMove(editing.id, editing.x + x, editing.z + z)} onDelete={removeSelected} onDone={finishPlacement} onCancel={cancelPlacement} /> : null}>
      <div ref={editor} className="ws-viewer" role="application" aria-label="Apartment editor" aria-describedby="editor-keyboard-help" tabIndex={0} style={{ visibility: reviewing ? "hidden" : "visible" }} inert={reviewing || Boolean(historyPreview)}>
        <span id="editor-keyboard-help" className="visually-hidden">Selected furniture: arrows move, Q and E rotate, M mirrors, Enter confirms, Escape cancels. Use Project menu to select existing furniture by name.</span>
        <ViewerBoundary><Suspense fallback={<div className="viewer-loading">Opening your apartment…</div>}>
          <TwinViewer decorating={!wholeBuilding && !reviewing} exploded={wholeBuilding && exploded} furnishings={furnishings} gridSnapEnabled={showGrid} levels={levels}
            onCommitMoveFurnishing={commitMove} onPreviewMoveFurnishing={previewMove} onSelectFurnishing={(id) => { if (!draft) { setSelectedId(id); if (id) setPanel(null); } }}
            selectedFurnishingId={selectedId} visibleLevels={visibleLevels} wallCutaway={wallCutaway}
            activeLevel={activeLevel} view={view} fitRequest={fitRequest} active={!reviewing} draft={draft} draftCollision={draftPreview?.collision ?? null}
            onDraftPosition={(x, z) => { if (draft) { const result = previewMove(draft.id, x, z); setDraft({ ...draft, ...result.position }); } }} showLegend={showLegend} />
        </Suspense></ViewerBoundary>
      </div>
      {historyPreview && <div className="ws-history-banner" role="status"><span>Previewing shared version {historyPreview.revision}. Editing is paused.</span><button onClick={() => setHistoryTargetRevision(null)}>Exit preview</button></div>}
      {reviewing && <div className="ws-plan-stage"><PlanReview imageUrl={project?.source.previewDataUrl ?? null} regions={regions} structures={structures} analysisSize={project ? { width: project.source.width, height: project.source.height } : null} activeLevel={activeLevel} focusedLevel={focusedLevel} selectedWallId={selectedWall} setActiveLevel={changeFloor} setFocusedLevel={setFocusedLevel} setSelectedWallId={setSelectedWall} /></div>}
    </WorkspaceShell></>;
}
