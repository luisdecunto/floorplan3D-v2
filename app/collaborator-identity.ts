export type CollaboratorIdentity = { id: string; name: string };
export function cleanCollaboratorName(name: string) {
  return name.replace(/\s+/g, " ").trim().slice(0, 60);
}
export function readIdentities(storage: Pick<Storage, "getItem">): CollaboratorIdentity[] {
  try {
    const values: unknown = JSON.parse(storage.getItem("planform-identities") ?? "[]");
    if (!Array.isArray(values)) return [];
    return values.filter((v): v is CollaboratorIdentity => Boolean(v && typeof v.id === "string" && typeof v.name === "string" && cleanCollaboratorName(v.name))).slice(0, 8);
  } catch { return []; }
}
export function rememberIdentity(name: string, storage: Pick<Storage, "getItem" | "setItem">): CollaboratorIdentity {
  const normalized = cleanCollaboratorName(name);
  const previous = readIdentities(storage);
  const identity = previous.find((item) => item.name.toLowerCase() === normalized.toLowerCase()) ?? { id: crypto.randomUUID(), name: normalized };
  try {
    storage.setItem("planform-identities", JSON.stringify([identity, ...previous.filter((item) => item.id !== identity.id)].slice(0, 8)));
    storage.setItem("planform-collaborator-name", identity.name);
  } catch { /* Joining still works without persistent storage. */ }
  return identity;
}
