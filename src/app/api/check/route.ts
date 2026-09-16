import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Is a published page actually reachable?
 *
 * The browser can't ask directly — another site's server won't answer a
 * cross-origin request — so this asks on its behalf and reports only the
 * status code.
 *
 * Fetching a URL someone else chose is a way to make a server knock on doors it
 * shouldn't, so the address is checked before anything is requested: public
 * http(s) only, and redirects are not followed.
 */

/** Addresses that belong to a private network, or to the machine itself. */
function isPrivateAddress(ip: string): boolean {
  if (ip.startsWith("127.") || ip === "::1" || ip === "0.0.0.0") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  // Link-local, including the cloud metadata address.
  if (ip.startsWith("169.254.") || ip.toLowerCase().startsWith("fe80:")) return true;
  // IPv6 unique-local.
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true;
  return false;
}

async function isPublicHost(hostname: string): Promise<boolean> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (bare === "localhost" || bare.endsWith(".localhost")) return false;
  if (isIP(bare)) return !isPrivateAddress(bare);
  try {
    const addresses = await lookup(bare, { all: true });
    return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url") ?? "";

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return Response.json({ online: false, reason: "bad-url" });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return Response.json({ online: false, reason: "bad-url" });
  }
  // This app's own address is always allowed — in development that's
  // localhost, which the check below would otherwise refuse, leaving pages
  // hosted here looking dead while you work on them.
  const self = new URL(request.url);
  const isSelf = parsed.host === self.host;
  if (!isSelf && !(await isPublicHost(parsed.hostname))) {
    return Response.json({ online: false, reason: "not-public" });
  }

  try {
    const response = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(6000),
      headers: { "user-agent": "Sitebuilder link check" },
    });
    // A redirect still means something is there.
    const online = response.status < 400;
    return Response.json({ online, status: response.status });
  } catch {
    return Response.json({ online: false, reason: "unreachable" });
  }
}
