import { validateFloorplanDocument, type FloorplanDocumentV2 } from "./floorplan-document.ts";

const SHARE_FORMAT_VERSION = 1;
export const MAX_SHARE_URL_LENGTH = 60_000;
const MAX_SHARED_DOCUMENT_BYTES = 2_000_000;

type SharedProjectEnvelope = {
  version: typeof SHARE_FORMAT_VERSION;
  document: FloorplanDocumentV2;
};

export class ShareLinkTooLargeError extends Error {
  constructor() {
    super("This apartment is too large for a reliable browser-only share link.");
    this.name = "ShareLinkTooLargeError";
  }
}

/** The source image is private, large, and unnecessary for reconstructing the 3D scene. */
export function shareableProject(document: FloorplanDocumentV2): FloorplanDocumentV2 {
  return {
    ...document,
    source: { ...document.source, previewDataUrl: undefined },
    levels: document.levels.map((level) => ({
      ...level,
      structure: { ...level.structure, floorTextureUrl: undefined },
    })),
  };
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("The shared apartment link is damaged.");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, maximumBytes = MAX_SHARED_DOCUMENT_BYTES) {
  const reader = new Blob([bytes.slice().buffer]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maximumBytes) {
      await reader.cancel();
      throw new ShareLinkTooLargeError();
    }
    chunks.push(value);
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

export async function encodeSharedProject(document: FloorplanDocumentV2) {
  const envelope: SharedProjectEnvelope = { version: SHARE_FORMAT_VERSION, document: shareableProject(document) };
  const bytes = new TextEncoder().encode(JSON.stringify(envelope));
  if (bytes.length > MAX_SHARED_DOCUMENT_BYTES) throw new ShareLinkTooLargeError();
  if (typeof CompressionStream === "undefined") return `p.${bytesToBase64Url(bytes)}`;
  return `g.${bytesToBase64Url(await transform(bytes, new CompressionStream("gzip"), MAX_SHARE_URL_LENGTH))}`;
}

export async function decodeSharedProject(payload: string) {
  if (payload.length > MAX_SHARE_URL_LENGTH) throw new ShareLinkTooLargeError();
  const separator = payload.indexOf(".");
  const codec = payload.slice(0, separator);
  let bytes = base64UrlToBytes(payload.slice(separator + 1));
  if (codec === "g") {
    if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot open compressed apartment links.");
    bytes = await transform(bytes, new DecompressionStream("gzip"));
  } else if (codec !== "p") {
    throw new Error("This shared apartment link uses an unsupported format.");
  }
  const envelope = JSON.parse(new TextDecoder().decode(bytes)) as Partial<SharedProjectEnvelope>;
  if (envelope.version !== SHARE_FORMAT_VERSION || !envelope.document) throw new Error("This shared apartment link uses an unsupported format.");
  return validateFloorplanDocument(envelope.document);
}

export function sharedProjectPayload(hash: string) {
  return new URLSearchParams(hash.replace(/^#/, "")).get("share");
}

export async function createProjectShareUrl(document: FloorplanDocumentV2, applicationUrl: string) {
  const url = new URL(applicationUrl);
  url.search = "";
  url.hash = `share=${await encodeSharedProject(document)}`;
  if (url.href.length > MAX_SHARE_URL_LENGTH) throw new ShareLinkTooLargeError();
  return url.href;
}
