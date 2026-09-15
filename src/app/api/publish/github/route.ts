import { jsonError, readRequest } from "@/lib/publishShared";

const API = "https://api.github.com";

type GitHubCall = { path: string; method?: string; body?: unknown; token: string };

async function github({ path, method = "GET", body, token }: GitHubCall) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // 204s and the like have no body.
  }
  return { ok: response.ok, status: response.status, data } as const;
}

/**
 * Put one HTML file in a GitHub repository and turn on GitHub Pages.
 *
 * Publishing again reuses the same repository and updates the file, so the
 * address people already have keeps working.
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
  const { token, name: repo, html } = parsed;

  // 1. Who does this token belong to?
  const me = await github({ path: "/user", token });
  if (!me.ok) {
    if (me.status === 401) {
      return jsonError(
        "GitHub didn't accept that token. Check you copied the whole thing, and that it hasn't expired.",
        401
      );
    }
    return jsonError("Couldn't check that token with GitHub.", me.status);
  }
  const owner = (me.data as { login?: string })?.login;
  if (!owner) return jsonError("GitHub didn't say who that token belongs to.", 502);

  // 2. Make the repository, or carry on with the one that's already there.
  const created = await github({
    path: "/user/repos",
    method: "POST",
    token,
    body: {
      name: repo,
      description: "Made with Sitebuilder",
      private: false,
      auto_init: true, // gives us a main branch with something on it
    },
  });
  if (!created.ok && created.status !== 422) {
    if (created.status === 403) {
      return jsonError(
        "That token isn't allowed to create repositories. It needs the 'repo' scope.",
        403
      );
    }
    return jsonError(githubMessage(created.data, "Couldn't create the repository."), created.status);
  }
  const reusedExisting = created.status === 422;

  // A freshly created repo can take a moment before its contents API answers.
  if (!reusedExisting) await new Promise((resolve) => setTimeout(resolve, 1200));

  // 3. Write index.html — updating needs the current file's sha.
  const existing = await github({ path: `/repos/${owner}/${repo}/contents/index.html`, token });
  const sha = existing.ok ? (existing.data as { sha?: string })?.sha : undefined;

  const put = await github({
    path: `/repos/${owner}/${repo}/contents/index.html`,
    method: "PUT",
    token,
    body: {
      message: sha ? "Update site" : "Add site",
      content: Buffer.from(html, "utf8").toString("base64"),
      ...(sha ? { sha } : {}),
    },
  });
  if (!put.ok) {
    if (reusedExisting && put.status === 404) {
      return jsonError(
        `You already have a repository called "${repo}", but this token can't write to it. Try another name.`,
        put.status
      );
    }
    return jsonError(githubMessage(put.data, "Couldn't upload the page."), put.status);
  }

  // 4. Switch GitHub Pages on. 409 means it already is, which is fine.
  const pages = await github({
    path: `/repos/${owner}/${repo}/pages`,
    method: "POST",
    token,
    body: { source: { branch: "main", path: "/" } },
  });
  const pagesOk = pages.ok || pages.status === 409;

  return Response.json({
    url: `https://${owner}.github.io/${repo}/`,
    repoUrl: `https://github.com/${owner}/${repo}`,
    status: pagesOk ? "BUILDING" : "NO_PAGES",
    updated: reusedExisting,
    note: pagesOk
      ? "GitHub takes a minute or two to build the page the first time."
      : "The files are uploaded, but GitHub Pages couldn't be switched on automatically. Turn it on in the repository's Settings → Pages.",
  });
}

function githubMessage(data: unknown, fallback: string): string {
  const message = (data as { message?: string })?.message;
  return message ? `GitHub said: ${message}` : fallback;
}
