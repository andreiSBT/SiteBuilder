import { put } from "@vercel/blob";
import { jsonError } from "@/lib/publishShared";
import { VALID_ID, editKeyFor, keyMatches, newSiteId, sitePath } from "@/lib/liveSite";

/** A page this size is already far larger than anything the builder makes. */
const MAX_BYTES = 2_000_000;

type Body = { html?: string; title?: string; id?: string; editKey?: string };

async function readBody(request: Request): Promise<Body | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function checkHtml(html: unknown): string | null {
  if (typeof html !== "string" || !html.trim()) return null;
  if (Buffer.byteLength(html, "utf8") > MAX_BYTES) return null;
  return html;
}

async function store(id: string, html: string) {
  await put(sitePath(id), html, {
    access: "private",
    contentType: "text/html; charset=utf-8",
    allowOverwrite: true,
    addRandomSuffix: false,
    // Read back through our own route with the cache off, so an edit shows up
    // immediately rather than up to a minute later.
    cacheControlMaxAge: 0,
  });
}

/** Put a site online for the first time. */
export async function POST(request: Request) {
  const body = await readBody(request);
  if (!body) return jsonError("That request didn't make sense.");

  const html = checkHtml(body.html);
  if (!html) return jsonError("There's nothing to publish, or it's too big.");

  const id = newSiteId(typeof body.title === "string" ? body.title : "site");
  try {
    await store(id, html);
  } catch {
    return jsonError("Couldn't save the page. Try again in a moment.", 502);
  }

  return Response.json({
    id,
    editKey: editKeyFor(id),
    url: new URL(`/site/${id}`, request.url).toString(),
  });
}

/** Replace the page at an address you already made. */
export async function PUT(request: Request) {
  const body = await readBody(request);
  if (!body) return jsonError("That request didn't make sense.");

  const id = typeof body.id === "string" ? body.id : "";
  if (!VALID_ID.test(id)) return jsonError("That isn't an address made here.");
  if (!keyMatches(id, body.editKey)) {
    return jsonError("Only the person who made this page can change it.", 403);
  }

  const html = checkHtml(body.html);
  if (!html) return jsonError("There's nothing to publish, or it's too big.");

  try {
    await store(id, html);
  } catch {
    return jsonError("Couldn't save the page. Try again in a moment.", 502);
  }
  return Response.json({ ok: true, url: new URL(`/site/${id}`, request.url).toString() });
}
