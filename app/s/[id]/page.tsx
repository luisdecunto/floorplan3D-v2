"use client";

import { Suspense, lazy, useEffect, useState } from "react";
import { documentSceneLevels, validateFloorplanDocument, type FloorplanDocumentV2 } from "../../floorplan-document";
import { sampleLevels, type Level } from "../../scene-data";

const TwinViewer = lazy(() => import("../../twin-viewer"));

export default function SharePage({ params }: { params: { id: string } }) {
  const [document, setDocument] = useState<FloorplanDocumentV2 | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = params.id;
    const load = async () => {
      if (!id) throw new Error("Missing share ID.");
      const res = await fetch(`/api/share/${encodeURIComponent(id)}`);
      const data = await res.json() as { document?: unknown; error?: string };
      if (!res.ok || !data.document) throw new Error(data.error ?? "Share link not found.");
      const validated = validateFloorplanDocument(data.document);
      setDocument(validated);
      setLevels(documentSceneLevels(validated));
    };
    load()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load shared project."))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <main className="welcome-shell" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", gap: "1rem" }}>
        <strong style={{ fontSize: "1.1rem", letterSpacing: "-0.02em" }}>Planform</strong>
        <p style={{ color: "var(--text-secondary, #888)" }}>Loading shared project…</p>
      </main>
    );
  }

  if (error || !document) {
    return (
      <main className="welcome-shell" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", gap: "1rem" }}>
        <strong style={{ fontSize: "1.1rem", letterSpacing: "-0.02em" }}>Planform</strong>
        <p style={{ color: "var(--text-secondary, #888)" }}>{error ?? "Project not found."}</p>
      </main>
    );
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      <header className="workspace-header">
        <strong style={{ fontSize: "1rem", letterSpacing: "-0.02em" }}>Planform</strong>
        <div className="project-name">
          <span>Shared project</span>
          <strong>{document.name}</strong>
        </div>
        <div className="workspace-status" style={{ marginLeft: "auto" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary, #888)" }}>Read-only view</span>
        </div>
      </header>

      <div style={{ flex: 1, position: "relative" }}>
        <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary, #888)" }}>Loading 3D view…</div>}>
          <TwinViewer
            levels={levels.length > 0 ? levels : sampleLevels}
            exploded={false}
            wallCutaway={1}
            visibleLevels={new Set((levels.length > 0 ? levels : sampleLevels).map((l) => l.id))}
          />
        </Suspense>
      </div>
    </main>
  );
}
