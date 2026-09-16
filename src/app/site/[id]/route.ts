import { get } from "@vercel/blob";
import { VALID_ID, sitePath } from "@/lib/liveSite";

const MISSING = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Page not found</title>
<style>body{font:16px/1.6 system-ui,sans-serif;margin:0;display:grid;place-items:center;
height:100vh;color:#334155;text-align:center;padding:24px}p{color:#64748b;max-width:24em}</style>
</head><body><div><h1>Nothing here</h1>
<p>This address doesn't have a page on it. It may have been taken down, or the link may be
wrong.</p></div></body></html>`;

/**
 * Serves a published site.
 *
 * Read with the cache off so an edit is visible immediately — a cached read can
 * be up to a minute behind, which would make a page look broken right after
 * it was changed.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notFound = () =>
    new Response(MISSING, {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });

  if (!VALID_ID.test(id)) return notFound();

  try {
    const blob = await get(sitePath(id), { access: "private", useCache: false });
    if (!blob || blob.statusCode !== 200 || !blob.stream) return notFound();
    return new Response(blob.stream, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return notFound();
  }
}
