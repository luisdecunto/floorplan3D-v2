import { getDb } from "../../../db/index";
import { sharedRenders } from "../../../db/schema";
import { validateFloorplanDocument, type FloorplanDocumentV2 } from "../../floorplan-document";

function shortId(): string {
  // 8 random URL-safe characters — enough entropy for a private share link
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }

  let document: FloorplanDocumentV2;
  try {
    document = validateFloorplanDocument(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid project document.";
    return errorResponse(message, 422);
  }

  // Strip the preview image and floor texture URLs from the stored copy to
  // keep the D1 row small (< 512 KB). The recipient's render re-derives geometry
  // from the structural data; they can upload the source image for textures.
  const stored: FloorplanDocumentV2 = {
    ...document,
    source: { ...document.source, previewDataUrl: undefined },
    levels: document.levels.map((level) => ({
      ...level,
      structure: { ...level.structure, floorTextureUrl: undefined },
    })),
  };

  const id = shortId();
  try {
    const db = getDb();
    await db.insert(sharedRenders).values({ id, document: JSON.stringify(stored) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    if (message.includes("no such table")) {
      return errorResponse(
        "The shared_renders table is not yet available. Run `npm run db:generate` locally, then deploy so the platform can apply the migration to the D1 database.",
        503,
      );
    }
    return errorResponse(message, 500);
  }

  const origin = new URL(request.url).origin;
  return Response.json({ id, url: `${origin}/s/${id}` }, { status: 201 });
}
