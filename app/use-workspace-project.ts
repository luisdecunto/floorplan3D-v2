import { useEffect, useReducer, useRef, useState } from "react";
import { workspaceReducer, type WorkspaceHistory } from "./workspace-state";
import { loadLatestProjectLocally, saveProjectLocally } from "./project-storage";
import type { FloorplanDocumentV2 } from "./floorplan-document";

const initial: WorkspaceHistory = { present: { kind: "sample", furnishings: [] }, past: [] };

export function useWorkspaceProject() {
  const [history, dispatch] = useReducer(workspaceReducer, initial);
  const [lastProject, setLastProject] = useState<FloorplanDocumentV2 | null>(null);
  const [saved, setSaved] = useState<FloorplanDocumentV2 | null>(null);
  const [failed, setFailed] = useState<FloorplanDocumentV2 | null>(null);
  const saveQueue = useRef(Promise.resolve());
  const project = history.present.kind === "project" ? history.present.document : null;

  useEffect(() => { void loadLatestProjectLocally().then(setLastProject).catch(() => undefined); }, []);
  useEffect(() => {
    if (!project) return;
    let active = true;
    // Serial writes prevent an earlier save finishing after a newer edit/undo.
    const timer = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
        try {
          await saveProjectLocally(project);
          if (active) { setSaved(project); setLastProject(project); setFailed(null); }
        } catch { if (active) setFailed(project); }
      });
    }, 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [project]);

  const saveStatus = !project ? "Sample · not saved" : failed === project ? "Save failed · export a copy" : saved === project ? "Saved on this device" : "Saving…";
  return { history, dispatch, project, lastProject, saveStatus };
}
