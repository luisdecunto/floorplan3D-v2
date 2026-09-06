import { Eye, History, RotateCcw } from "lucide-react";
import { furnitureCatalogItem } from "./furniture-catalog";
import type { CollaborationHistoryEntry } from "./collaboration-protocol.ts";

export function collaborationHistoryDescription(entry: CollaborationHistoryEntry) {
  const name = entry.catalogId ? furnitureCatalogItem(entry.catalogId)?.name ?? "a furniture item" : "the apartment";
  if (entry.kind === "initial") return "Initial apartment";
  if (entry.kind === "add-furniture") return `added ${name}`;
  if (entry.kind === "move-furniture") return `moved ${name}`;
  if (entry.kind === "remove-furniture") return `removed ${name}`;
  if (entry.kind === "restore") return "restored an earlier version";
  return `updated ${name}`;
}

function historyTime(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function CollaborationHistory({
  entries,
  previewRevision,
  loadingRevision,
  canRestore,
  onPreview,
  onRestore,
}: {
  entries: CollaborationHistoryEntry[];
  previewRevision: number | null;
  loadingRevision: number | null;
  canRestore: boolean;
  onPreview: (revision: number) => void;
  onRestore: () => void;
}) {
  return <section className="ws-history" aria-label="Apartment history">
    <div className="ws-history-heading"><span className="ws-history-icon"><History size={17} /></span><div><h3>Recent changes</h3><p>Latest 50 accepted versions are kept.</p></div></div>
    {!entries.length ? <p className="ws-muted">History will appear after the first live edit.</p> : <ol className="ws-history-list">
      {entries.map((entry) => <li key={`${entry.revision}-${entry.operationId}`} className={previewRevision === entry.revision ? "selected" : ""}>
        <button className="ws-history-entry" onClick={() => onPreview(entry.revision)} aria-label={`Preview version ${entry.revision}`}>
          <span className="ws-history-revision">v{entry.revision}</span>
          <span className="ws-history-copy"><strong>{collaborationHistoryDescription(entry)}</strong><small>{entry.actorName} · <time dateTime={entry.createdAt}>{historyTime(entry.createdAt)}</time></small></span>
          {loadingRevision === entry.revision ? <span className="ws-history-loading" aria-label="Loading version">…</span> : <Eye size={17} />}
        </button>
        {previewRevision === entry.revision && <div className="ws-history-actions"><span>{loadingRevision === entry.revision ? "Loading version…" : "Previewing this version"}</span>{canRestore && loadingRevision !== entry.revision && <button onClick={onRestore}><RotateCcw size={15} />Restore</button>}</div>}
      </li>)}
    </ol>}
  </section>;
}
