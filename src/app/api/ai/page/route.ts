import { jsonError } from "@/lib/publishShared";
import { AiPageSchema, SYSTEM_PROMPT, aiPageToSite } from "@/lib/aiPage";

/**
 * Writes a page from a description, using the Claude Agent SDK.
 *
 * The Agent SDK authenticates with a Claude subscription rather than an API
 * key — a Pro or Max plan includes a monthly Agent SDK credit, and when that
 * runs out requests simply stop instead of quietly becoming a bill.
 *
 * It runs the Claude Code runtime as a local process, so this only works where
 * that runtime and its credentials exist: the machine you run the builder on.
 * On the deployed site it's off, which also means visitors can't spend someone
 * else's credit.
 */
const AVAILABLE = process.env.NODE_ENV !== "production";

const MAX_PROMPT = 600;

export async function GET() {
  return Response.json({ available: AVAILABLE });
}

export async function POST(request: Request) {
  if (!AVAILABLE) {
    return jsonError(
      "Writing with Claude only works when you run Sitebuilder on your own computer.",
      403
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("That request didn't make sense.");
  }

  const description = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!description) return jsonError("Say what the site is for first.");
  if (description.length > MAX_PROMPT) {
    return jsonError(`Keep it under ${MAX_PROMPT} characters.`);
  }

  let text = "";
  try {
    // Loaded here rather than at the top of the file: it's a few megabytes of
    // local runtime that the deployed site can never use, and an import inside
    // the guard keeps it out of that build entirely.
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const run = query({
      prompt: `${description}\n\nReturn only JSON matching this shape, with no explanation and no code fence:
{"title": string, "accent": "#rrggbb", "font": one of system|rounded|verdana|tahoma|futura|serif|times|palatino|garamond|mono|courier|impact|comic|brush, "blocks": [{"type": "hero"|"heading"|"text"|"image"|"button"|"features"|"footer", "heading"?: string, "subheading"?: string, "text"?: string, "buttonText"?: string, "title"?: string, "cards"?: [{"icon": string, "title": string, "body": string}], "alt"?: string, "caption"?: string}]}`,
      options: {
        model: "claude-opus-5",
        systemPrompt: SYSTEM_PROMPT,
        // Nothing to do but write: no file access, no shell, one turn.
        allowedTools: [],
        maxTurns: 1,
        // Don't pick up this project's own settings or CLAUDE.md — they're
        // about building Sitebuilder, not about the site being written.
        settingSources: [],
      },
    });

    for await (const message of run) {
      if (message.type === "result") {
        if (message.subtype !== "success") {
          return jsonError("Claude couldn't finish that one. Try describing it differently.", 502);
        }
        text = message.result;
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    if (/auth|login|credential|unauthor/i.test(detail)) {
      return jsonError(
        "Claude isn't signed in on this computer. Run `claude` once in a terminal and log in with your subscription.",
        401
      );
    }
    return jsonError("Couldn't reach Claude from this computer.", 502);
  }

  // It was asked for bare JSON, but a fence is the most likely thing to arrive
  // anyway, and it's cheaper to strip one than to ask again.
  const json = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let parsed;
  try {
    parsed = AiPageSchema.safeParse(JSON.parse(json));
  } catch {
    return jsonError("Claude's answer wasn't a page. Try again.", 502);
  }
  if (!parsed.success) {
    return jsonError("Claude's answer didn't fit the blocks here. Try again.", 502);
  }

  return Response.json({ site: aiPageToSite(parsed.data) });
}
