/**
 * Talking to the live-site store from the browser.
 *
 * The edit key is kept in this browser only — never in the project, and never
 * in the exported page. Otherwise anyone you sent the .html to could overwrite
 * your live site.
 */
const keyStore = (id: string) => `sitebuilder:editkey:${id}`;

export function rememberKey(id: string, key: string) {
  try {
    localStorage.setItem(keyStore(id), key);
  } catch {
    // Without it, the site stays up but can't be updated from here.
  }
}

export function recallKey(id: string): string | null {
  try {
    return localStorage.getItem(keyStore(id));
  } catch {
    return null;
  }
}

export type LiveSite = { id: string; editKey: string; url: string };

export async function createLiveSite(html: string, title: string): Promise<LiveSite> {
  const response = await fetch("/api/site", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html, title }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? "Couldn't put it online.");
  rememberKey(data.id, data.editKey);
  return data as LiveSite;
}

/** Replace what's at an address. Returns false if this browser can't. */
export async function updateLiveSite(id: string, html: string): Promise<boolean> {
  const editKey = recallKey(id);
  if (!editKey) return false;
  const response = await fetch("/api/site", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, editKey, html }),
  });
  return response.ok;
}
