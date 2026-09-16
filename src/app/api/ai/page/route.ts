import { jsonError } from "@/lib/publishShared";
import { AiPageSchema, SYSTEM_PROMPT, aiPageToSite } from "@/lib/aiPage";
import { checkBudget, recordSpend, visitorKey } from "@/lib/aiBudget";

/**
 * Writes a page from a description, using the Claude Agent SDK.
 *
 * The Agent SDK authenticates with a Claude subscription rather than an API
 * key — a Pro or Max plan includes a monthly Agent SDK credit, and when that
 * runs out requests simply stop instead of quietly becoming a bill.
 *
 * On your own machine it uses the login already sitting there. Deployed, it
 * needs CLAUDE_CODE_OAUTH_TOKEN — a long-lived subscription token from
 * `claude setup-token` — and without one it stays off, so nobody can spend
 * credit that was never offered.
 *
 * Because the deployed version spends the owner's credit on behalf of
 * strangers, every public run goes through a daily money cap first.
 */
const HAS_TOKEN = !!(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY);
const IS_LOCAL = process.env.NODE_ENV !== "production";
const AVAILABLE = IS_LOCAL || HAS_TOKEN;

const MAX_PROMPT = 600;

export async function GET() {
  return Response.json({ available: AVAILABLE });
}

export async function POST(request: Request) {
  if (!AVAILABLE) {
    return jsonError(
      "Writing with Claude isn't switched on here. It works when you run Sitebuilder yourself.",
      403
    );
  }

  // Only the public site is rationed: on your own machine it's your own credit
  // and your own decision.
  const visitor = visitorKey(request);
  if (!IS_LOCAL) {
    const verdict = await checkBudget(visitor);
    if (!verdict.ok) return jsonError(verdict.reason, 429);
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
        // A deployed function has no writable home directory, so point the
        // runtime's config at the one place it can write.
        env: IS_LOCAL ? process.env : { ...process.env, ANTHROPIC_CONFIG_DIR: "/tmp/claude" },
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
        if (!IS_LOCAL) await recordSpend(visitor, message.total_cost_usd);
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
