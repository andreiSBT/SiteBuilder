"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { projectSlug } from "@/lib/publishShared";
import { canShareByLink, encodeSiteLink } from "@/lib/shareLink";
import { timeAgo } from "@/lib/projects";
import type { Site } from "@/lib/types";
import { exportHtml } from "@/lib/render";

type Host = "link" | "drop" | "vercel" | "github";

type Result = {
  url: string;
  repoUrl?: string;
  status?: string;
  note?: string;
  updated?: boolean;
};

const TOKEN_KEY = (host: Host) => `sitebuilder:token:${host}`;

/** A token saved earlier for this host, if there is one. */
function readToken(host: Host): string {
  try {
    return localStorage.getItem(TOKEN_KEY(host)) ?? "";
  } catch {
    return "";
  }
}

const HOSTS: Record<
  Host,
  {
    name: string;
    blurb: string;
    lasts: string;
    tokenUrl?: string;
    tokenHelp?: string;
    nameLabel?: string;
  }
> = {
  link: {
    name: "Just a link",
    blurb:
      "The whole site is packed into the link itself. Press the button, send the link, done — no sign-up, nothing stored anywhere, and it never expires.",
    lasts: "Never expires · nothing is stored · the link is long",
  },
  drop: {
    name: "No account",
    blurb:
      "Drag your site onto a drop page and it's online in seconds. Nothing to sign up for.",
    lasts: "Live for 60 minutes, counted from the moment you drop it",
  },
  vercel: {
    name: "Vercel",
    blurb: "Puts your site online in a few seconds, on a free vercel.app address.",
    lasts: "Stays up · free account needed",
    tokenUrl: "https://vercel.com/account/tokens",
    tokenHelp: "Create a token (any name, scope “Full Account”), then paste it here.",
    nameLabel: "Project name",
  },
  github: {
    name: "GitHub",
    blurb:
      "Puts your site in a repository and switches on GitHub Pages, so the code and the site both live there.",
    lasts: "Stays up · free account needed",
    tokenUrl: "https://github.com/settings/tokens/new?scopes=repo&description=Sitebuilder",
    tokenHelp: "Create a classic token with the “repo” box ticked, then paste it here.",
    nameLabel: "Repository name",
  },
};

/**
 * Cloudflare Drop only. Netlify Drop also takes anonymous uploads, but their own
 * support says the no-account path fails often enough that they recommend
 * signing up — a button that usually errors is worse than no button.
 */
const DROP = { name: "Cloudflare Drop", url: "https://www.cloudflare.com/drop/" };

export default function PublishDialog({
  site,
  onPublished,
  onClose,
}: {
  site: Site;
  /** Remembers the address, so it isn't lost when this closes. */
  onPublished: (host: string, record: { url: string; repoUrl?: string }) => void;
  onClose: () => void;
}) {
  const [host, setHost] = useState<Host>(canShareByLink() ? "link" : "drop");
  const [token, setToken] = useState("");
  const [remember, setRemember] = useState(false);
  const [name, setName] = useState(projectSlug(site.title));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const [dropped, setDropped] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);

  /** Each host has its own token, and its own result to forget. */
  const switchHost = (next: Host) => {
    setHost(next);
    setDropped(false);
    setShareLink(null);
    setToken(readToken(next));
    setRemember(!!readToken(next));
    setResult(null);
    setError(null);
  };

  const publish = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/publish/${host}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, html: exportHtml(site, { embedProject: true }) }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "That didn't work.");
        return;
      }
      setResult(data as Result);
      onPublished(host, { url: data.url, repoUrl: data.repoUrl });
      try {
        if (remember) localStorage.setItem(TOKEN_KEY(host), token);
        else localStorage.removeItem(TOKEN_KEY(host));
      } catch {
        // Not being able to remember it isn't worth an error.
      }
    } catch {
      setError("Couldn't reach the publisher. Is the site still running?");
    } finally {
      setBusy(false);
    }
  };

  const alreadyPublished = Object.entries(site.published ?? {}).sort((a, b) => b[1].at - a[1].at);
  const tabs: Host[] = canShareByLink()
    ? ["link", "drop", "vercel", "github"]
    : ["drop", "vercel", "github"];
  const info = HOSTS[host];

  /** Copy, falling back to the old way when the clipboard API says no. */
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      return;
    } catch {
      // Older browsers, and any page the browser doesn't trust with the
      // clipboard, land here.
    }
    try {
      const scratch = document.createElement("textarea");
      scratch.value = text;
      scratch.style.position = "fixed";
      scratch.style.opacity = "0";
      document.body.appendChild(scratch);
      scratch.select();
      const worked = document.execCommand("copy");
      scratch.remove();
      if (worked) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Then the link is still sitting in the box to copy by hand.
    }
  };

  /** Pack the whole site into a link. Nothing is uploaded. */
  const makeLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const link = await encodeSiteLink(exportHtml(site), window.location.origin);
      setShareLink(link);
      await copyText(link);
    } catch {
      setError("Couldn't make the link on this browser.");
    } finally {
      setBusy(false);
    }
  };

  /** Save the file, then open the drop page to drag it onto. */
  const startDrop = (url: string) => {
    const blob = new Blob([exportHtml(site, { embedProject: true })], { type: "text/html" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${name || "site"}.html`;
    link.click();
    URL.revokeObjectURL(href);
    window.open(url, "_blank", "noopener,noreferrer");
    setDropped(true);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-title"
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="publish-title" className="text-base font-semibold text-slate-900">
          Put your site on the internet
        </h2>

        <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1">
          {tabs.map((key) => (
            <button
              key={key}
              onClick={() => switchHost(key)}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
                host === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {HOSTS[key].name}
            </button>
          ))}
        </div>

        {alreadyPublished.length > 0 && (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Your site is online at
            </h3>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {alreadyPublished.map(([where, record]) => (
                <div key={where} className="flex items-center gap-2">
                  <a
                    href={record.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate font-mono text-[11px] text-indigo-700 hover:underline"
                    title={record.url}
                  >
                    {record.url.replace(/^https?:\/\//, "")}
                  </a>
                  <span className="shrink-0 text-[10px] text-slate-400">
                    {HOSTS[where as Host]?.name ?? where} · {timeAgo(record.at)}
                  </span>
                  <button
                    onClick={() => copyText(record.url)}
                    className="shrink-0 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Copy
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-3 text-xs leading-relaxed text-slate-600">{info.blurb}</p>
        <p className="mt-1 text-[11px] text-slate-400">{info.lasts}</p>

        {host === "link" ? (
          <div className="mt-4">
            {shareLink ? (
              <>
                <p className="text-sm font-semibold text-emerald-700">
                  {copied ? "Copied — paste it anywhere" : "Here's your link"}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {shareLink.length.toLocaleString()} characters. Select it all when you
                  copy — half a link opens nothing.
                </p>
                <textarea
                  readOnly
                  value={shareLink}
                  onFocus={(e) => e.currentTarget.select()}
                  className="mt-2 h-24 w-full resize-none rounded-md bg-slate-50 px-3 py-2 font-mono text-[10px] leading-relaxed text-slate-600 outline-none"
                />
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  {window.location.hostname === "localhost"
                    ? "This link starts with localhost, so it only opens on this computer. Put Sitebuilder online once and the links work for everyone."
                    : "Anyone with this link can open your site. It works forever, because the site travels inside it."}
                </p>
              </>
            ) : (
              <p className="text-xs leading-relaxed text-slate-600">
                Nothing gets uploaded. Your site is squeezed down and written into the link,
                so there&apos;s nothing to sign up for and nothing to expire. The only catch
                is that the link is long — fine to paste into a message, too long to read out
                loud.
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
              <button
                onClick={() => (shareLink ? copyText(shareLink) : makeLink())}
                disabled={busy}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
              >
                {busy ? "Packing…" : shareLink ? "Copy it" : "Make the link"}
              </button>
            </div>

            {error && (
              <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700">
                {error}
              </p>
            )}
          </div>
        ) : host === "drop" ? (
          <div className="mt-4">
            <ol className="flex flex-col gap-1.5 text-xs leading-relaxed text-slate-600">
              <li>
                <b className="text-slate-800">1.</b> We save your site as one file.
              </li>
              <li>
                <b className="text-slate-800">2.</b> The drop page opens in a new tab.
              </li>
              <li>
                <b className="text-slate-800">3.</b> Drag the file onto it — that&apos;s it.
              </li>
            </ol>

            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
              <b>What the hour means:</b> the link works for anyone, straight away, for 60
              minutes. Inside that hour you can press <b>Claim</b> to sign in and keep it
              for good, on the same address. If you don&apos;t, the link stops working —
              and dropping the file again gives you a <i>different</i> address, so anything
              you&apos;ve already sent people goes dead. Good for showing someone now; use
              GitHub or Vercel for a link you want to keep.
            </p>

            {dropped && (
              <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-[11px] leading-relaxed text-emerald-800">
                Saved to your downloads, and the drop page is open. Drag{" "}
                <code className="font-mono">{name || "site"}.html</code> onto it. The
                countdown starts then.
              </p>
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
              <button
                onClick={() => startDrop(DROP.url)}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
              >
                Save &amp; open {DROP.name}
              </button>
            </div>
          </div>
        ) : result ? (
          <Success result={result} copied={copied} onCopy={async () => {
            try {
              await navigator.clipboard.writeText(result.url);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            } catch {
              setCopied(false);
            }
          }} />
        ) : (
          <>
            <label className="mt-4 block text-xs font-medium text-slate-600">
              {info.nameLabel}
            </label>
            <input
              value={name}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setName(projectSlug(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />

            <div className="mt-3 flex items-baseline justify-between gap-2">
              <label className="text-xs font-medium text-slate-600">
                {info.name} token
              </label>
              <a
                href={info.tokenUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-medium text-indigo-600 hover:underline"
              >
                Get one →
              </a>
            </div>
            <input
              type="password"
              value={token}
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste it here"
              onChange={(e) => setToken(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{info.tokenHelp}</p>

            <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-slate-600">
              <input
                type="checkbox"
                autoComplete="off"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="mt-0.5 accent-indigo-600"
              />
              <span>
                Remember this token in this browser.
                <span className="text-slate-400">
                  {" "}
                  Only do this on a computer that&apos;s yours — a token is like a password.
                </span>
              </span>
            </label>

            {error && (
              <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700">
                {error}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={publish}
                disabled={busy || !token.trim() || !name}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
              >
                {busy ? "Publishing…" : `Publish to ${info.name}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

function Success({
  result,
  copied,
  onCopy,
}: {
  result: Result;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-emerald-700">
        {result.updated ? "Updated — it's live" : "It's live"}
      </p>
      <a
        href={result.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 block break-all rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-indigo-700 hover:underline"
      >
        {result.url}
      </a>

      {result.note && (
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{result.note}</p>
      )}
      {result.status === "ERROR" && (
        <p className="mt-2 text-[11px] leading-relaxed text-rose-600">
          The host reported a problem building it. Try publishing again.
        </p>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {result.repoUrl && (
          <a
            href={result.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            See the code
          </a>
        )}
        <button
          onClick={onCopy}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
        >
          Open it
        </a>
      </div>
    </div>
  );
}
