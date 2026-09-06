import { useCallback, useEffect, useRef, useState } from "react";
import { validateFloorplanDocument, type FloorplanDocumentV2 } from "./floorplan-document.ts";
import { shareableProject } from "./project-share.ts";
import { rememberIdentity, type CollaboratorIdentity } from "./collaborator-identity.ts";
import {
  applyCollaborationOperation,
  collaborationConditionAfter,
  collaborationInvite,
  collaborationOperation,
  COLLABORATION_PROTOCOL_VERSION,
  MAX_COLLABORATION_HISTORY,
  createCollaborationInviteUrl,
  type CollaborationCondition,
  type CollaborationCredentials,
  type CollaborationHistoryEntry,
  type CollaborationOperation,
  type CollaborationServerMessage,
} from "./collaboration-protocol.ts";

type CollaborationStatus = "idle" | "connecting" | "live" | "reconnecting" | "error";
type PendingUpdate = {
  id: string;
  operation: CollaborationOperation;
  inverse: CollaborationOperation;
  condition?: CollaborationCondition;
  undo: boolean;
  action?: "restore";
};
type UndoEntry = { inverse: CollaborationOperation; condition: CollaborationCondition };

const SERVER_URL = (import.meta.env.VITE_COLLABORATION_URL as string | undefined)?.replace(/\/$/, "")
  ?? "https://planform-collaboration.cocoscraper-app.workers.dev";

function webSocketUrl(roomId: string) {
  const url = new URL(`${SERVER_URL}/rooms/${encodeURIComponent(roomId)}/socket`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

export function useCollaboration({
  onDocument,
  onNotice,
  onFatalError,
}: {
  onDocument: (document: FloorplanDocumentV2, initial: boolean) => void;
  onNotice: (message: string) => void;
  onFatalError: () => void;
}) {
  const [status, setStatus] = useState<CollaborationStatus>("idle");
  const [people, setPeople] = useState(1);
  const [collaborators, setCollaborators] = useState<CollaboratorIdentity[]>([]);
  const [pendingJoin, setPendingJoin] = useState<{ credentials: CollaborationCredentials; opening: boolean } | null>(null);
  const identity = useRef<CollaboratorIdentity | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<CollaborationHistoryEntry[]>([]);
  const [historySnapshot, setHistorySnapshot] = useState<{ revision: number; document: FloorplanDocumentV2 } | null>(null);
  const [historyLoadingRevision, setHistoryLoadingRevision] = useState<number | null>(null);
  const [credentials, setCredentials] = useState<CollaborationCredentials | null>(null);
  const callbacks = useRef({ onDocument, onNotice, onFatalError });
  const socket = useRef<WebSocket | null>(null);
  const session = useRef<CollaborationCredentials | null>(null);
  const revision = useRef(0);
  const authenticated = useRef(false);
  const initialOpen = useRef(false);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<number | null>(null);
  const stopped = useRef(false);
  const queue = useRef<PendingUpdate[]>([]);
  const inFlight = useRef<PendingUpdate | null>(null);
  const undoStack = useRef<UndoEntry[]>([]);
  const clientId = useRef<string>(crypto.randomUUID());
  useEffect(() => { callbacks.current = { onDocument, onNotice, onFatalError }; }, [onDocument, onNotice, onFatalError]);

  const renderCanonical = useCallback((canonical: FloorplanDocumentV2, initial: boolean) => {
    setHistorySnapshot(null);
    setHistoryLoadingRevision(null);
    let visible = canonical;
    const optimistic = [inFlight.current, ...queue.current].filter(Boolean) as PendingUpdate[];
    for (const pending of optimistic) visible = applyCollaborationOperation(visible, pending.operation);
    callbacks.current.onDocument(validateFloorplanDocument(visible), initial);
  }, []);

  const pump = useCallback(() => {
    if (!authenticated.current || socket.current?.readyState !== WebSocket.OPEN || inFlight.current || !queue.current.length) return;
    const pending = queue.current.shift()!;
    inFlight.current = pending;
    socket.current.send(JSON.stringify({
      type: "update",
      operationId: pending.id,
      baseRevision: revision.current,
      operation: pending.operation,
      ...(pending.condition ? { condition: pending.condition } : {}),
      ...(pending.action ? { action: pending.action } : {}),
    }));
  }, []);

  const connect = useCallback(function connectToRoom(next: CollaborationCredentials, opening: boolean) {
    if (!SERVER_URL) {
      setStatus("error");
      callbacks.current.onNotice("Live collaboration is not configured in this build.");
      window.setTimeout(() => callbacks.current.onFatalError(), 0);
      return;
    }
    if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
    socket.current?.close(1000, "Replaced connection");
    session.current = next;
    setHistoryEntries([]);
    setHistorySnapshot(null);
    setHistoryLoadingRevision(null);
    setCredentials(next);
    initialOpen.current = opening;
    stopped.current = false;
    authenticated.current = false;
    setStatus(reconnectAttempt.current ? "reconnecting" : "connecting");
    const ws = new WebSocket(webSocketUrl(next.roomId));
    socket.current = ws;
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({
        type: "join",
        protocol: COLLABORATION_PROTOCOL_VERSION,
        editKey: next.editKey,
        clientId: clientId.current,
        name: identity.current?.name ?? "Guest",
      }));
    });
    ws.addEventListener("message", (event) => {
      let message: CollaborationServerMessage;
      try { message = JSON.parse(String(event.data)) as CollaborationServerMessage; }
      catch { return; }
      if (socket.current !== ws || stopped.current) return;
      if (message.type === "presence") { setPeople(message.people); setCollaborators(message.collaborators ?? []); return; }
      if (message.type === "history") { setHistoryEntries(message.entries.slice(0, MAX_COLLABORATION_HISTORY)); return; }
      if (message.type === "history-entry") {
        setHistoryEntries((entries) => [message.entry, ...entries.filter((entry) => entry.revision !== message.entry.revision)].slice(0, MAX_COLLABORATION_HISTORY));
        return;
      }
      if (message.type === "history-snapshot") {
        setHistorySnapshot({ revision: message.revision, document: validateFloorplanDocument(message.document) });
        setHistoryLoadingRevision(null);
        return;
      }
      if (message.type === "error") {
        if (message.document && typeof message.revision === "number") {
          revision.current = message.revision;
          renderCanonical(validateFloorplanDocument(message.document), false);
        }
        if (message.code === "history-not-found") setHistoryLoadingRevision(null);
        if (message.code === "unauthorized" || message.code === "room-missing") {
          stopped.current = true;
          setStatus("error");
          callbacks.current.onNotice(message.message);
          window.setTimeout(() => callbacks.current.onFatalError(), 0);
          ws.close(1008, message.code);
          return;
        }
        if (inFlight.current) {
          const failed = inFlight.current;
          inFlight.current = null;
          if (failed.undo) callbacks.current.onNotice("Undo was not applied because your partner changed the same content.");
          else callbacks.current.onNotice("A simultaneous change won. The shared apartment has been refreshed.");
          setCanUndo(queue.current.length === 0 && undoStack.current.length > 0);
          pump();
        }
        return;
      }
      if (message.type !== "snapshot") return;
      authenticated.current = true;
      reconnectAttempt.current = 0;
      setStatus("live");
      setPeople(message.people);
      revision.current = message.revision;
      const accepted = inFlight.current && message.operationId === inFlight.current.id && message.actorId === clientId.current
        ? inFlight.current : null;
      if (accepted) {
        inFlight.current = null;
        if (accepted.undo) undoStack.current.pop();
        else undoStack.current.push({
          inverse: accepted.inverse,
          condition: collaborationConditionAfter(accepted.operation, message.revision),
        });
      }
      const first = initialOpen.current;
      initialOpen.current = false;
      renderCanonical(validateFloorplanDocument(message.document), first);
      setCanUndo(!inFlight.current && queue.current.length === 0 && undoStack.current.length > 0);
      pump();
    });
    ws.addEventListener("close", () => {
      if (socket.current !== ws || stopped.current) return;
      authenticated.current = false;
      setCanUndo(false);
      setHistorySnapshot(null);
      setHistoryLoadingRevision(null);
      if (inFlight.current) {
        queue.current.unshift(inFlight.current);
        inFlight.current = null;
      }
      setStatus("reconnecting");
      setCollaborators([]);
      if (reconnectAttempt.current >= 6) {
        stopped.current = true;
        setStatus("error");
        callbacks.current.onNotice("The shared apartment could not be reached. Check the link and try again.");
        window.setTimeout(() => callbacks.current.onFatalError(), 0);
        return;
      }
      const delay = Math.min(12_000, 800 * 2 ** reconnectAttempt.current++);
      reconnectTimer.current = window.setTimeout(() => {
        const current = session.current;
        if (current && !stopped.current) connectToRoom(current, false);
      }, delay);
    });
    ws.addEventListener("error", () => ws.close());
  }, [pump, renderCanonical]);

  useEffect(() => {
    const invite = collaborationInvite(window.location.hash);
    if (invite) setPendingJoin({ credentials: invite, opening: true });
    return () => {
      stopped.current = true;
      if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
      socket.current?.close(1000, "Editor closed");
    };
  }, [connect]);

  const commit = useCallback((before: FloorplanDocumentV2, after: FloorplanDocumentV2) => {
    if (!session.current || status === "error") return false;
    const operation = collaborationOperation(shareableProject(before), shareableProject(after));
    const inverse = collaborationOperation(shareableProject(after), shareableProject(before));
    if (!operation || !inverse) return false;
    queue.current.push({ id: crypto.randomUUID(), operation, inverse, undo: false });
    setCanUndo(false);
    pump();
    return true;
  }, [pump, status]);

  const undo = useCallback(() => {
    const entry = undoStack.current.at(-1);
    if (!entry || !session.current || status !== "live" || inFlight.current || queue.current.length) return false;
    queue.current.push({
      id: crypto.randomUUID(),
      operation: entry.inverse,
      inverse: entry.inverse,
      condition: entry.condition,
      undo: true,
    });
    setCanUndo(false);
    pump();
    return true;
  }, [pump, status]);

  const requestHistorySnapshot = useCallback((targetRevision: number) => {
    if (!session.current || status !== "live" || !Number.isInteger(targetRevision)) return false;
    const current = socket.current;
    if (!current || current.readyState !== WebSocket.OPEN) return false;
    setHistoryLoadingRevision(targetRevision);
    current.send(JSON.stringify({ type: "history-request", revision: targetRevision }));
    return true;
  }, [status]);

  const restore = useCallback((before: FloorplanDocumentV2, target: FloorplanDocumentV2) => {
    if (!session.current || status !== "live" || inFlight.current || queue.current.length) return false;
    const operation = collaborationOperation(shareableProject(before), shareableProject(target));
    const inverse = collaborationOperation(shareableProject(target), shareableProject(before));
    if (!operation || !inverse) return false;
    queue.current.push({ id: crypto.randomUUID(), operation, inverse, undo: false, action: "restore" });
    setCanUndo(false);
    pump();
    return true;
  }, [pump, status]);

  const start = useCallback(async (document: FloorplanDocumentV2, applicationUrl: string) => {
    if (!SERVER_URL) throw new Error("Live collaboration is not configured in this build.");
    if (session.current) return createCollaborationInviteUrl(applicationUrl, session.current);
    const response = await fetch(`${SERVER_URL}/rooms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ document: shareableProject(document) }),
    });
    const body = await response.json() as Partial<CollaborationCredentials> & { error?: string };
    if (!response.ok || !body.roomId || !body.editKey) throw new Error(body.error ?? "The live room could not be created.");
    const next = { roomId: body.roomId, editKey: body.editKey };
    const link = createCollaborationInviteUrl(applicationUrl, next);
    window.history.replaceState(null, "", link);
    setPendingJoin({ credentials: next, opening: false });
    return link;
  }, []);

  const leave = useCallback(() => {
    stopped.current = true;
    socket.current?.close(1000, "Left room");
    socket.current = null;
    session.current = null;
    setCredentials(null);
    setPendingJoin(null);
    setCollaborators([]);
    setStatus("idle");
    setPeople(1);
    undoStack.current = [];
    queue.current = [];
    inFlight.current = null;
    setCanUndo(false);
    setHistoryEntries([]);
    setHistorySnapshot(null);
    setHistoryLoadingRevision(null);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  return {
    pendingJoin: Boolean(pendingJoin),
    join: (name: string) => {
      if (!pendingJoin) return;
      let storage: Pick<Storage, "getItem" | "setItem">;
      try { storage = localStorage; } catch { storage = { getItem: () => null, setItem: () => {} }; }
      identity.current = rememberIdentity(name, storage);
      if (!identity.current.name) return;
      clientId.current = identity.current.id;
      connect(pendingJoin.credentials, pendingJoin.opening);
      setPendingJoin(null);
    },
    collaborators,
    selfId: clientId.current,
    active: Boolean(credentials),
    status,
    people,
    canUndo,
    commit,
    undo,
    historyEntries,
    historySnapshot,
    historyLoadingRevision,
    requestHistorySnapshot,
    restore,
    start,
    leave,
    inviteUrl: credentials && typeof window !== "undefined" ? createCollaborationInviteUrl(window.location.href, credentials) : null,
  };
}
