/**
 * A whole site, carried inside a link.
 *
 * The page is compressed and written into the URL's fragment (the part after
 * `#`). Nothing is stored anywhere: no account, no database, no expiry, and no
 * bill. The trade-off is a long link — a few thousand characters.
 *
 * Fragments are never sent to the server, so the site never leaves the two
 * browsers that open the link.
 */

const PREFIX = "s1"; // so the format can change later without breaking old links

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function squeeze(bytes: Uint8Array, mode: "compress" | "decompress"): Promise<Uint8Array> {
  const Stream = mode === "compress" ? CompressionStream : DecompressionStream;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new Stream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Whether this browser can do the compressing. */
export const canShareByLink = () =>
  typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

export async function encodeSiteLink(html: string, origin: string): Promise<string> {
  const packed = await squeeze(new TextEncoder().encode(html), "compress");
  return `${origin}/s#${PREFIX}.${toBase64Url(packed)}`;
}

/** Read a site back out of a link's fragment. Returns null if it isn't one. */
export async function decodeSiteLink(fragment: string): Promise<string | null> {
  const raw = fragment.replace(/^#/, "");
  const [version, payload] = raw.split(".");
  if (version !== PREFIX || !payload) return null;
  try {
    const bytes = await squeeze(fromBase64Url(payload), "decompress");
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
