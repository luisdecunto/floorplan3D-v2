import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Stores shared Planform projects so that each project can be opened via a
 * short URL (`/s/<id>`) without requiring the recipient to have the original
 * file. Projects are stored as JSON (the FloorplanDocumentV2 shape).
 *
 * The `id` is a short random slug generated at share time; it doubles as the
 * URL path segment so it must be URL-safe.
 */
export const sharedRenders = sqliteTable("shared_renders", {
  id: text("id").primaryKey(),
  document: text("document").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});
