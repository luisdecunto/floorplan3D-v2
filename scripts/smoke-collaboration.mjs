import assert from "node:assert/strict";
import WebSocket from "ws";

const endpoint = (process.env.PLANFORM_COLLABORATION_URL ?? "https://planform-collaboration.cocoscraper-app.workers.dev").replace(/\/$/, "");
const origin = process.env.PLANFORM_ORIGIN ?? "https://luisdecunto.github.io";
const now = new Date().toISOString();
const chair = { id: "smoke-chair", catalogId: "ikea-adde", levelId: "ground", x: 1, z: 1, rotation: 0 };
const document = {
  schemaVersion: 2,
  id: `smoke-${crypto.randomUUID()}`,
  name: "Collaboration smoke test",
  createdAt: now,
  updatedAt: now,
  model: { version: "smoke", runtime: "geometry-fallback" },
  source: { name: "smoke.png", mimeType: "image/png", width: 100, height: 100, previewDataUrl: "data:image/png;base64,private" },
  levels: [{ id: "ground", name: "Ground floor", order: 0, elevation: 0, sourceRegion: { id: "ground", name: "Ground floor", x: 0, y: 0, width: 100, height: 100, confidence: 1 }, structure: { regionId: "ground", sourceWidth: 100, sourceHeight: 100, walls: [], fixtures: [], stairs: [], rooms: [], outdoorAreas: [], footprint: { x: 0, y: 0, width: 100, height: 100 }, roomCount: 1, confidence: 1, diagnostics: { threshold: 140, wallThickness: 5, geometryVotes: 1, topologyVotes: 1, openingVotes: 0, stairVotes: 0 } }, confidence: 1, provenance: ["geometry"], confirmed: true }],
  issues: [],
  edits: [],
  scale: { metresPerPixel: 0.05, source: "user", confidence: 1 },
  furnishings: [chair],
};

const roomResponse = await fetch(`${endpoint}/rooms`, {
  method: "POST",
  headers: { "content-type": "application/json", origin },
  body: JSON.stringify({ document }),
});
assert.equal(roomResponse.status, 201);
const credentials = await roomResponse.json();

function waitFor(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for collaboration message")), 10_000);
    const listener = (payload) => {
      const message = JSON.parse(String(payload));
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.off("message", listener);
      resolve(message);
    };
    socket.on("message", listener);
  });
}

async function join(clientId) {
  const socketUrl = `${endpoint.replace(/^http/, "ws")}/rooms/${credentials.roomId}/socket`;
  const socket = new WebSocket(socketUrl, { headers: { Origin: origin } });
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  const snapshot = waitFor(socket, (message) => message.type === "snapshot");
  socket.send(JSON.stringify({ type: "join", protocol: 1, editKey: credentials.editKey, clientId, name: clientId }));
  return { socket, snapshot: await snapshot };
}

const first = await join("smoke-one");
const presence = waitFor(first.socket, (message) => message.type === "presence" && message.people === 2);
const second = await join("smoke-two");
assert.deepEqual((await presence).collaborators.map((member) => member.name).sort(), ["smoke-one", "smoke-two"]);
const duplicatePresence = waitFor(first.socket, (message) => message.type === "presence");
const duplicateTab = await join("smoke-two");
assert.equal((await duplicatePresence).people, 2);
const tabClosed = waitFor(first.socket, (message) => message.type === "presence");
duplicateTab.socket.close();
assert.equal((await tabClosed).people, 2);
const operationId = crypto.randomUUID();
const receivedByPartner = waitFor(second.socket, (message) => message.type === "snapshot" && message.operationId === operationId);
first.socket.send(JSON.stringify({
  type: "update",
  operationId,
  baseRevision: first.snapshot.revision,
  operation: { kind: "upsert-furniture", placement: { ...chair, x: 2 }, updatedAt: new Date().toISOString() },
}));
const synchronized = await receivedByPartner;
assert.equal(synchronized.revision, 1);
assert.equal(synchronized.document.furnishings.find((item) => item.id === chair.id).x, 2);
assert.equal(synchronized.document.source.previewDataUrl, undefined);
const departed = waitFor(first.socket, (message) => message.type === "presence" && message.people === 1);
second.socket.close();
assert.deepEqual((await departed).collaborators.map((member) => member.name), ["smoke-one"]);
first.socket.close();
console.log(`Live collaboration smoke test passed for room ${credentials.roomId}.`);
