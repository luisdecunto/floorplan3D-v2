import { DurableObject } from "cloudflare:workers";
import { cleanCollaboratorName } from "../app/collaborator-identity.ts";
import {
  applyCollaborationOperation,
  collaborationConditionMatches,
  collaborationHistoryChange,
  COLLABORATION_PROTOCOL_VERSION,
  MAX_COLLABORATION_HISTORY,
  isCollaborationOperation,
  MAX_COLLABORATION_DOCUMENT_BYTES,
  MAX_COLLABORATION_MESSAGE_BYTES,
  type CollaborationClientMessage,
  type CollaborationHistoryEntry,
  type CollaborationServerMessage,
} from "../app/collaboration-protocol.ts";
import type { FloorplanDocumentV2 } from "../app/floorplan-document.ts";

interface Env {
  ROOMS: DurableObjectNamespace<ApartmentRoom>;
}

type SocketAttachment = {
  authenticated: boolean;
  clientId: string;
  name: string;
  windowStartedAt: number;
  messageCount: number;
};

type HibernatingWebSocket = WebSocket & {
  serializeAttachment(value: SocketAttachment): void;
  deserializeAttachment(): SocketAttachment | null;
};

type RoomRow = {
  document: string;
  edit_hash: string;
  revision: number;
};

type RoomHistoryRow = {
  revision: number;
  operation_id: string;
  actor_id: string;
  actor_name: string;
  kind: CollaborationHistoryEntry["kind"];
  target_id: string | null;
  catalog_id: string | null;
  created_at: number;
  document: string;
};

function encodedBytes(value: unknown) {
  return new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).byteLength;
}

function randomToken(bytes: number) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return [...values].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safelyEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function isDocument(value: unknown): value is FloorplanDocumentV2 {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<FloorplanDocumentV2>;
  return document.schemaVersion === 2
    && typeof document.id === "string"
    && typeof document.name === "string"
    && Boolean(document.source && typeof document.source === "object")
    && Array.isArray(document.levels)
    && document.levels.length > 0
    && Array.isArray(document.issues)
    && Array.isArray(document.edits)
    && (document.furnishings === undefined || Array.isArray(document.furnishings));
}

/** Defense in depth: collaboration never stores the user's source bitmap. */
function privateSourceRemoved(document: FloorplanDocumentV2): FloorplanDocumentV2 {
  return {
    ...document,
    source: { ...document.source, previewDataUrl: undefined },
    levels: document.levels.map((level) => ({
      ...level,
      structure: { ...level.structure, floorTextureUrl: undefined },
    })),
  };
}

function allowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.origin === "https://luisdecunto.github.io") return url.origin;
    if (url.protocol === "https:" && (url.hostname === "planform.pages.dev" || url.hostname.endsWith(".planform.pages.dev"))) return url.origin;
    if ((url.hostname === "localhost" || url.hostname === "127.0.0.1") && (url.protocol === "http:" || url.protocol === "https:")) return url.origin;
  } catch { return null; }
  return null;
}

function corsHeaders(origin: string) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

function json(value: unknown, status = 200, origin?: string) {
  return Response.json(value, {
    status,
    headers: origin ? corsHeaders(origin) : undefined,
  });
}

export class ApartmentRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS room_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        document TEXT NOT NULL,
        edit_hash TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS applied_operations (
        operation_id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS room_history (
        revision INTEGER PRIMARY KEY,
        operation_id TEXT NOT NULL UNIQUE,
        actor_id TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        kind TEXT NOT NULL,
        target_id TEXT,
        catalog_id TEXT,
        created_at INTEGER NOT NULL,
        document TEXT NOT NULL
      ) STRICT;
    `);
  }

  create(document: FloorplanDocumentV2, editHash: string) {
    if (this.room()) return false;
    const stored = JSON.stringify(privateSourceRemoved(document));
    if (encodedBytes(stored) > MAX_COLLABORATION_DOCUMENT_BYTES) throw new Error("Document is too large");
    this.ctx.storage.sql.exec(
      "INSERT INTO room_state (id, document, edit_hash, revision, updated_at) VALUES (1, ?, ?, 0, ?)",
      stored,
      editHash,
      Date.now(),
    );
    this.ctx.storage.sql.exec(
      "INSERT INTO room_history (revision, operation_id, actor_id, actor_name, kind, created_at, document) VALUES (0, ?, ?, ?, ?, ?, ?)",
      `initial-${randomToken(8)}`,
      "system",
      "Planform",
      "initial",
      Date.now(),
      stored,
    );
    return true;
  }

  private room() {
    const room = this.ctx.storage.sql.exec<RoomRow>(
      "SELECT document, edit_hash, revision FROM room_state WHERE id = 1",
    ).toArray()[0] ?? null;
    if (room) this.ensureHistory(room);
    return room;
  }

  private ensureHistory(room: RoomRow) {
    const count = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM room_history").toArray()[0]?.count ?? 0;
    if (count > 0) return;
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO room_history (revision, operation_id, actor_id, actor_name, kind, created_at, document) VALUES (?, ?, ?, ?, ?, ?, ?)",
      room.revision,
      `history-bootstrap-${room.revision}`,
      "system",
      "Planform",
      "initial",
      Date.now(),
      room.document,
    );
  }

  private historyEntries() {
    return this.ctx.storage.sql.exec<RoomHistoryRow>(
      "SELECT revision, operation_id, actor_id, actor_name, kind, target_id, catalog_id, created_at, document FROM room_history ORDER BY revision DESC LIMIT ?",
      MAX_COLLABORATION_HISTORY,
    ).toArray().map((row): CollaborationHistoryEntry => ({
      revision: row.revision,
      operationId: row.operation_id,
      actorId: row.actor_id,
      actorName: row.actor_name,
      createdAt: new Date(row.created_at).toISOString(),
      kind: row.kind,
      ...(row.target_id ? { targetId: row.target_id } : {}),
      ...(row.catalog_id ? { catalogId: row.catalog_id } : {}),
    }));
  }

  private historySnapshot(revision: number) {
    return this.ctx.storage.sql.exec<Pick<RoomHistoryRow, "revision" | "document">>(
      "SELECT revision, document FROM room_history WHERE revision = ?",
      revision,
    ).toArray()[0] ?? null;
  }

  private recordHistory(entry: CollaborationHistoryEntry, document: string) {
    this.ctx.storage.sql.exec(
      "INSERT INTO room_history (revision, operation_id, actor_id, actor_name, kind, target_id, catalog_id, created_at, document) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      entry.revision,
      entry.operationId,
      entry.actorId,
      entry.actorName,
      entry.kind,
      entry.targetId ?? null,
      entry.catalogId ?? null,
      Date.parse(entry.createdAt),
      document,
    );
    this.ctx.storage.sql.exec(
      "DELETE FROM room_history WHERE revision NOT IN (SELECT revision FROM room_history ORDER BY revision DESC LIMIT ?)",
      MAX_COLLABORATION_HISTORY,
    );
  }

  private sockets() {
    return this.ctx.getWebSockets() as HibernatingWebSocket[];
  }

  private people() {
    return this.collaborators().length;
  }

  private collaborators() {
    const members = new Map<string, { id: string; name: string }>();
    for (const candidate of this.sockets()) {
      const member = candidate.deserializeAttachment();
      if (member?.authenticated) members.set(member.clientId, { id: member.clientId, name: member.name });
    }
    return [...members.values()];
  }

  private send(webSocket: WebSocket, message: CollaborationServerMessage) {
    try { webSocket.send(JSON.stringify(message)); } catch { /* disconnected between enumeration and send */ }
  }

  private broadcast(message: CollaborationServerMessage) {
    for (const candidate of this.sockets()) {
      if (candidate.deserializeAttachment()?.authenticated) this.send(candidate, message);
    }
  }

  private broadcastPresence() {
    this.broadcast({ type: "presence", people: this.people(), collaborators: this.collaborators() });
  }

  async fetch(request: Request) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    if (!this.room()) return new Response("Room not found", { status: 404 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1] as HibernatingWebSocket;
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ authenticated: false, clientId: "", name: "", windowStartedAt: Date.now(), messageCount: 0 });
    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket });
  }

  async webSocketMessage(webSocket: HibernatingWebSocket, incoming: string | ArrayBuffer) {
    if (typeof incoming !== "string" || encodedBytes(incoming) > MAX_COLLABORATION_MESSAGE_BYTES) {
      this.send(webSocket, { type: "error", code: "invalid-message", message: "That update is too large or invalid." });
      webSocket.close(1009, "Message too large");
      return;
    }
    let message: CollaborationClientMessage;
    try { message = JSON.parse(incoming) as CollaborationClientMessage; }
    catch {
      this.send(webSocket, { type: "error", code: "invalid-message", message: "The collaboration message was invalid." });
      return;
    }
    const attachment = webSocket.deserializeAttachment() ?? { authenticated: false, clientId: "", name: "", windowStartedAt: Date.now(), messageCount: 0 };
    if (!attachment.authenticated) {
      if (message.type !== "join" || message.protocol !== COLLABORATION_PROTOCOL_VERSION || !/^[A-Za-z0-9_-]{32,160}$/.test(message.editKey) || typeof message.clientId !== "string" || typeof message.name !== "string") {
        this.send(webSocket, { type: "error", code: "unauthorized", message: "This collaboration link is invalid." });
        webSocket.close(1008, "Unauthorized");
        return;
      }
      const room = this.room();
      if (!room) {
        this.send(webSocket, { type: "error", code: "room-missing", message: "This shared apartment no longer exists." });
        webSocket.close(1008, "Room missing");
        return;
      }
      if (!safelyEqual(await sha256(message.editKey), room.edit_hash)) {
        this.send(webSocket, { type: "error", code: "unauthorized", message: "This collaboration link is invalid." });
        webSocket.close(1008, "Unauthorized");
        return;
      }
      webSocket.serializeAttachment({
        authenticated: true,
        clientId: message.clientId.slice(0, 100),
        name: cleanCollaboratorName(message.name) || "Guest",
        windowStartedAt: Date.now(),
        messageCount: 0,
      });
      const people = this.people();
      this.send(webSocket, { type: "snapshot", document: JSON.parse(room.document), revision: room.revision, people });
      this.send(webSocket, { type: "history", entries: this.historyEntries() });
      this.broadcastPresence();
      return;
    }

    const now = Date.now();
    const currentRate = now - attachment.windowStartedAt > 10_000
      ? { ...attachment, windowStartedAt: now, messageCount: 1 }
      : { ...attachment, messageCount: attachment.messageCount + 1 };
    webSocket.serializeAttachment(currentRate);
    if (currentRate.messageCount > 120) {
      this.send(webSocket, { type: "error", code: "rate-limited", message: "Too many changes at once. Please wait a moment." });
      return;
    }
    const room = this.room();
    if (!room) return;
    if (message.type === "history-request") {
      if (!Number.isInteger(message.revision) || message.revision < 0 || message.revision > room.revision) {
        this.send(webSocket, { type: "error", code: "history-not-found", message: "That apartment version is no longer available.", revision: room.revision });
        return;
      }
      const historical = this.historySnapshot(message.revision);
      if (!historical) {
        this.send(webSocket, { type: "error", code: "history-not-found", message: "That apartment version is no longer available.", revision: room.revision });
        return;
      }
      this.send(webSocket, { type: "history-snapshot", revision: historical.revision, document: JSON.parse(historical.document) });
      return;
    }
    if (message.type !== "update" || !/^[A-Za-z0-9_-]{10,100}$/.test(message.operationId) || !isCollaborationOperation(message.operation)) {
      this.send(webSocket, { type: "error", code: "invalid-message", message: "That apartment change was invalid." });
      return;
    }
    const canonical = JSON.parse(room.document) as FloorplanDocumentV2;
    const duplicate = this.ctx.storage.sql.exec<{ revision: number }>(
      "SELECT revision FROM applied_operations WHERE operation_id = ?",
      message.operationId,
    ).toArray()[0];
    if (duplicate) {
      this.send(webSocket, {
        type: "snapshot",
        document: canonical,
        revision: room.revision,
        operationId: message.operationId,
        actorId: attachment.clientId,
        people: this.people(),
      });
      return;
    }
    if (message.condition && !collaborationConditionMatches(canonical, room.revision, message.condition)) {
      this.send(webSocket, { type: "error", code: "undo-conflict", message: "That content changed after your edit, so undo was not applied.", document: canonical, revision: room.revision });
      return;
    }
    if (message.operation.kind === "replace-document" && message.baseRevision !== room.revision) {
      this.send(webSocket, { type: "error", code: "stale", message: "The apartment changed before this structural edit arrived.", document: canonical, revision: room.revision });
      return;
    }
    let next = applyCollaborationOperation(canonical, message.operation);
    if (!isDocument(next)) {
      this.send(webSocket, { type: "error", code: "invalid-message", message: "That apartment change was invalid." });
      return;
    }
    next = privateSourceRemoved(next);
    const stored = JSON.stringify(next);
    if (encodedBytes(stored) > MAX_COLLABORATION_DOCUMENT_BYTES) {
      this.send(webSocket, { type: "error", code: "invalid-message", message: "The shared apartment has become too large." });
      return;
    }
    const nextRevision = room.revision + 1;
    // Persist before broadcasting so reconnecting clients always see the same revision.
    this.ctx.storage.sql.exec(
      "UPDATE room_state SET document = ?, revision = ?, updated_at = ? WHERE id = 1",
      stored,
      nextRevision,
      now,
    );
    this.ctx.storage.sql.exec(
      "INSERT INTO applied_operations (operation_id, revision) VALUES (?, ?)",
      message.operationId,
      nextRevision,
    );
    this.ctx.storage.sql.exec("DELETE FROM applied_operations WHERE rowid NOT IN (SELECT rowid FROM applied_operations ORDER BY rowid DESC LIMIT 1000)");
    const historyEntry: CollaborationHistoryEntry = {
      revision: nextRevision,
      operationId: message.operationId,
      actorId: attachment.clientId,
      actorName: attachment.name,
      createdAt: new Date(now).toISOString(),
      ...collaborationHistoryChange(message.operation, canonical, message.action),
    };
    this.recordHistory(historyEntry, stored);
    this.broadcast({
      type: "snapshot",
      document: next,
      revision: nextRevision,
      operationId: message.operationId,
      actorId: attachment.clientId,
      people: this.people(),
    });
    this.broadcast({ type: "history-entry", entry: historyEntry });
  }

  webSocketClose(socket: HibernatingWebSocket) {
    const attachment = socket.deserializeAttachment();
    if (attachment) socket.serializeAttachment({ ...attachment, authenticated: false });
    socket.close();
    this.broadcastPresence();
  }
  webSocketError(socket: HibernatingWebSocket) { this.webSocketClose(socket); }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === "/" && request.method === "GET") return json({ service: "planform-collaboration", ok: true });
    const origin = allowedOrigin(request);
    if (!origin) return json({ error: "Origin not allowed." }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (url.pathname === "/rooms" && request.method === "POST") {
      const length = Number(request.headers.get("content-length") ?? 0);
      if (length > MAX_COLLABORATION_DOCUMENT_BYTES + 10_000) return json({ error: "Apartment is too large." }, 413, origin);
      let body: { document?: unknown };
      try { body = JSON.parse(await request.text()) as { document?: unknown }; }
      catch { return json({ error: "Invalid apartment data." }, 400, origin); }
      if (!isDocument(body.document)) return json({ error: "Invalid apartment data." }, 400, origin);
      const document = privateSourceRemoved(body.document);
      if (encodedBytes(document) > MAX_COLLABORATION_DOCUMENT_BYTES) return json({ error: "Apartment is too large." }, 413, origin);
      const editKey = randomToken(32);
      const editHash = await sha256(editKey);
      for (let attempt = 0; attempt < 3; attempt++) {
        const roomId = randomToken(16);
        const room = env.ROOMS.getByName(roomId);
        if (await room.create(document, editHash)) return json({ roomId, editKey }, 201, origin);
      }
      return json({ error: "Could not allocate a collaboration room." }, 503, origin);
    }
    const match = url.pathname.match(/^\/rooms\/([A-Za-z0-9_-]{16,80})\/socket$/);
    if (match && request.method === "GET") return env.ROOMS.getByName(match[1]).fetch(request);
    return json({ error: "Not found." }, 404, origin);
  },
};
