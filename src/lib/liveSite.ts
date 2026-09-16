import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { projectSlug } from "./publishShared";

/** Where a site's page lives in the blob store. */
export const sitePath = (id: string) => `sites/${id}.html`;

/** Ids are used in a storage path, so nothing but these characters is allowed. */
export const VALID_ID = /^[a-z0-9][a-z0-9-]{1,59}$/;

export function newSiteId(title: string): string {
  const slug = projectSlug(title).slice(0, 40).replace(/-+$/, "");
  return `${slug || "site"}-${randomBytes(3).toString("hex")}`;
}

/**
 * The key that proves you're the one who made a site.
 *
 * Derived from the id with a server-side secret rather than stored, so there's
 * no key sitting anywhere to be read, and nothing to keep in step with the
 * page itself.
 */
export function editKeyFor(id: string): string {
  const secret = process.env.SITE_EDIT_SECRET;
  if (!secret) throw new Error("SITE_EDIT_SECRET is not set");
  return createHmac("sha256", secret).update(id).digest("hex").slice(0, 32);
}

export function keyMatches(id: string, key: unknown): boolean {
  if (typeof key !== "string" || key.length !== 32) return false;
  try {
    const expected = Buffer.from(editKeyFor(id));
    const given = Buffer.from(key);
    // Same length by construction, but compare in constant time anyway.
    return expected.length === given.length && timingSafeEqual(expected, given);
  } catch {
    return false;
  }
}
