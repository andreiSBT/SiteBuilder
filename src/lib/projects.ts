import { migrate, newId } from "./site";
import type { Site } from "./types";

const KEY = "sitebuilder:projects:v1";

export type SavedProject = {
  id: string;
  name: string;
  updatedAt: number;
  site: Site;
};

function readAll(): SavedProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.id === "string")
      .map((p) => ({
        id: p.id,
        name: typeof p.name === "string" ? p.name : "Untitled",
        updatedAt: Number(p.updatedAt) || 0,
        site: migrate(p.site),
      }));
  } catch {
    return [];
  }
}

function writeAll(projects: SavedProject[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(projects));
    return true;
  } catch {
    // Almost always the ~5MB localStorage quota.
    return false;
  }
}

/** Newest first. */
export function listProjects(): SavedProject[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(id: string): SavedProject | undefined {
  return readAll().find((p) => p.id === id);
}

/**
 * Save under an existing id, or create a new one. Returns the id, or null if
 * the browser refused to store it.
 */
export function saveProject(site: Site, name: string, id?: string): string | null {
  const projects = readAll();
  const projectId = id ?? newId("proj");
  const entry: SavedProject = { id: projectId, name, updatedAt: Date.now(), site };
  const at = projects.findIndex((p) => p.id === projectId);
  if (at === -1) projects.push(entry);
  else projects[at] = entry;
  return writeAll(projects) ? projectId : null;
}

export function deleteProject(id: string): void {
  writeAll(readAll().filter((p) => p.id !== id));
}

export function duplicateProject(id: string): string | null {
  const source = getProject(id);
  if (!source) return null;
  return saveProject(structuredClone(source.site), `${source.name} copy`);
}

/** "just now", "5 min ago", "2 days ago" — for the saved-sites list. */
export function timeAgo(ts: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
