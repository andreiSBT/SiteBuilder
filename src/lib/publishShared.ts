/** Project/repo names: lowercase, digits and hyphens. */
export function projectSlug(name: string): string {
  return (
    String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "my-site"
  );
}

export type PublishRequest = { token?: string; name?: string; html?: string };

/** Read and check the bits every publish route needs. */
export function readRequest(body: PublishRequest):
  | { ok: true; token: string; name: string; html: string }
  | { ok: false; error: string } {
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const html = typeof body.html === "string" ? body.html : "";
  if (!token) return { ok: false, error: "Paste your token first." };
  if (!html.trim()) return { ok: false, error: "There's nothing to publish yet." };
  return { ok: true, token, name: projectSlug(body.name ?? ""), html };
}

export function jsonError(error: string, status = 400) {
  return Response.json({ error }, { status });
}
