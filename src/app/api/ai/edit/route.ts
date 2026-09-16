import { jsonError } from "@/lib/publishShared";
import { AiPageSchema, EDIT_PROMPT } from "@/lib/aiPage";
import { checkBudget, recordSpend, visitorKey } from "@/lib/aiBudget";

/**
 * Change the page someone is looking at.
 *
 * Deliberately stateless: each message carries the page as it stands, so Claude
 * sees the edits made by hand in between rather than its own last answer. A
 * conversation that remembers would drift from what's actually on screen.
 */
const HAS_TOKEN = !!(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY);
const IS_LOCAL = process.env.NODE_ENV !== "production";
const AVAILABLE = IS_LOCAL || HAS_TOKEN;

const MAX_INSTRUCTION = 400;
const MAX_PAGE_CHARS = 20_000;

export async function POST(request: Request) {
  if (!AVAILABLE) {
    return jsonError("Talking to Claude isn't switched on here.", 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("That request didn't make sense.");
  }

  const instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) return jsonError("Say what you'd like changed.");
  if (instruction.length > MAX_INSTRUCTION) {
    return jsonError(`Keep it under ${MAX_INSTRUCTION} characters.`);
  }

  const current = AiPageSchema.safeParse(body?.page);
  if (!current.success) return jsonError("Couldn't read the page to change.");

  const asText = JSON.stringify(current.data);
  if (asText.length > MAX_PAGE_CHARS) {
    return jsonError("This page is too big to talk about. Try it a page at a time.");
  }

  const visitor = visitorKey(request);
  if (!IS_LOCAL) {
    const verdict = await checkBudget(visitor);
    if (!verdict.ok) return jsonError(verdict.reason, 429);
  }

  let text = "";
  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const run = query({
      prompt: `Here is the page:\n${asText}\n\nChange it: ${instruction}\n\nReturn only the whole page as JSON, in the same shape, with no explanation and no code fence.`,
      options: {
        model: "claude-opus-5",
        systemPrompt: EDIT_PROMPT,
        allowedTools: [],
        maxTurns: 1,
        // A deployed function has no writable home directory, so point the
        // runtime's config at the one place it can write.
        env: IS_LOCAL ? process.env : { ...process.env, ANTHROPIC_CONFIG_DIR: "/tmp/claude" },
        settingSources: [],
      },
    });

    for await (const message of run) {
      if (message.type === "result") {
        if (message.subtype !== "success") {
          return jsonError("Claude couldn't do that one. Try saying it differently.", 502);
        }
        text = message.result;
        if (!IS_LOCAL) await recordSpend(visitor, message.total_cost_usd);
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    if (/auth|login|credential|unauthor/i.test(detail)) {
      return jsonError("Claude isn't signed in here. Run `claude` once in a terminal.", 401);
    }
    return jsonError("Couldn't reach Claude.", 502);
  }

  const json = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let revised;
  try {
    revised = AiPageSchema.safeParse(JSON.parse(json));
  } catch {
    return jsonError("Claude's answer wasn't a page. Try again.", 502);
  }
  if (!revised.success) {
    return jsonError("Claude's answer didn't fit the blocks here. Try again.", 502);
  }

  return Response.json({ page: revised.data });
}
