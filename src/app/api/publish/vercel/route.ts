import { jsonError, readRequest } from "@/lib/publishShared";

const API = "https://api.vercel.com";

/**
 * Publish one HTML file to Vercel.
 *
 * The token is taken from the request, used once, and never stored or logged —
 * this route exists only because browsers can't call the Vercel API directly.
 */
export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("That request didn't make sense.");
  }

  const parsed = readRequest(body);
  if (!parsed.ok) return jsonError(parsed.error);
  const { token, name, html } = parsed;

  let created;
  try {
    // skipAutoDetectionConfirmation: a single .html file shouldn't be quizzed
    // about which framework it is.
    const response = await fetch(`${API}/v13/deployments?skipAutoDetectionConfirmation=1`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        target: "production",
        files: [
          {
            file: "index.html",
            data: Buffer.from(html, "utf8").toString("base64"),
            encoding: "base64",
          },
        ],
        // Plain static file: nothing to install, build, or detect.
        projectSettings: {
          framework: null,
          buildCommand: null,
          installCommand: null,
          outputDirectory: null,
          devCommand: null,
        },
      }),
    });
    created = await response.json();
    if (!response.ok) return jsonError(vercelError(response.status, created), response.status);
  } catch {
    return jsonError("Couldn't reach Vercel. Check your internet connection.", 502);
  }

  const url = created?.url ? `https://${created.url}` : null;
  if (!url) return jsonError("Vercel didn't give back a web address.", 502);

  return Response.json({ url, status: await waitUntilReady(token, created.id) });
}

/** A one-file site builds in seconds; give it a little while, then hand it over. */
async function waitUntilReady(token: string, id: string | undefined): Promise<string> {
  if (!id) return "UNKNOWN";
  const deadline = Date.now() + 20_000;
  let state = "QUEUED";
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const response = await fetch(`${API}/v13/deployments/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return state;
      const data = await response.json();
      state = data?.readyState ?? state;
      if (state === "READY" || state === "ERROR" || state === "CANCELED") return state;
    } catch {
      return state;
    }
  }
  return state;
}

function vercelError(status: number, data: unknown): string {
  const message =
    (data as { error?: { message?: string } })?.error?.message ?? "Vercel refused the upload.";
  if (status === 401 || status === 403) {
    return "Vercel didn't accept that token. Check you copied the whole thing, and that it hasn't expired.";
  }
  if (status === 429) return "Too many attempts for now — wait a minute and try again.";
  return message;
}
