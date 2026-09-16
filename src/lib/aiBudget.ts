import { createHash } from "node:crypto";
import { get, put } from "@vercel/blob";

/**
 * A daily ceiling on what the AI can spend.
 *
 * The public site writes pages with the owner's Claude subscription credit, so
 * without a cap a handful of visitors could use up a month's worth in an
 * afternoon. The Agent SDK reports what each run actually cost, so this counts
 * real money rather than guessing from request counts.
 */
// A Pro plan's Agent SDK credit is about $20 a month, so a pound a day would
// swallow it. This leaves room, and AI_DAILY_LIMIT_USD raises it.
const DEFAULT_DAILY_LIMIT_USD = 0.5;
const PER_VISITOR_DAILY = 5;

export const dailyLimitUsd = () => Number(process.env.AI_DAILY_LIMIT_USD) || DEFAULT_DAILY_LIMIT_USD;

type Usage = { spent: number; visitors: Record<string, number> };

const today = () => new Date().toISOString().slice(0, 10);
const usagePath = () => `ai/usage-${today()}.json`;

/**
 * Visitors are counted by a hash of their address, not the address itself —
 * enough to stop one person using the lot, without keeping a list of who
 * visited.
 */
export function visitorKey(request: Request): string {
  const address =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  return createHash("sha256")
    .update(`${address}:${process.env.SITE_EDIT_SECRET ?? ""}`)
    .digest("hex")
    .slice(0, 16);
}

async function readUsage(): Promise<Usage> {
  try {
    const blob = await get(usagePath(), { access: "private", useCache: false });
    if (!blob || blob.statusCode !== 200 || !blob.stream) return { spent: 0, visitors: {} };
    const parsed = JSON.parse(await new Response(blob.stream).text());
    return {
      spent: Number(parsed?.spent) || 0,
      visitors: typeof parsed?.visitors === "object" ? parsed.visitors : {},
    };
  } catch {
    // No file yet, or it's unreadable — today starts at nothing.
    return { spent: 0, visitors: {} };
  }
}

async function writeUsage(usage: Usage) {
  await put(usagePath(), JSON.stringify(usage), {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
  });
}

export type BudgetVerdict = { ok: true } | { ok: false; reason: string };

/** Is there room for another one today? */
export async function checkBudget(visitor: string): Promise<BudgetVerdict> {
  const usage = await readUsage();
  if (usage.spent >= dailyLimitUsd()) {
    return {
      ok: false,
      reason: "Claude has done all its writing for today. It starts again tomorrow.",
    };
  }
  if ((usage.visitors[visitor] ?? 0) >= PER_VISITOR_DAILY) {
    return {
      ok: false,
      reason: `That's ${PER_VISITOR_DAILY} pages today — come back tomorrow, or edit one of the ones you have.`,
    };
  }
  return { ok: true };
}

/** Record what a run actually cost. */
export async function recordSpend(visitor: string, costUsd: number) {
  try {
    const usage = await readUsage();
    usage.spent += Number.isFinite(costUsd) && costUsd > 0 ? costUsd : 0.02;
    usage.visitors[visitor] = (usage.visitors[visitor] ?? 0) + 1;
    await writeUsage(usage);
  } catch {
    // Losing a tally is better than failing a page that already succeeded.
  }
}
