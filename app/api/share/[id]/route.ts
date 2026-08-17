import { eq } from "drizzle-orm";
import { getDb } from "../../../../db/index";
import { sharedRenders } from "../../../../db/schema";
import { validateFloorplanDocument } from "../../../floorplan-document";

export async function GET(_request: Request, { params }: { params: { id: string } }): Promise<Response> {
  const { id } = await params;
  if (!id || !/^[A-Za-z0-9_-]{6,12}$/.test(id)) {
    return Response.json({ error: "Invalid share ID." }, { status: 400 });
  }

  let row: { document: string } | undefined;
  try {
    const db = getDb();
    const rows = await db.select().from(sharedRenders).where(eq(sharedRenders.id, id)).limit(1);
    row = rows[0];
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    return Response.json({ error: message }, { status: 500 });
  }

  if (!row) {
    return Response.json({ error: "Share link not found or has expired." }, { status: 404 });
  }

  try {
    const document = validateFloorplanDocument(JSON.parse(row.document));
    return Response.json({ document });
  } catch {
    return Response.json({ error: "Stored project is corrupt." }, { status: 500 });
  }
}
