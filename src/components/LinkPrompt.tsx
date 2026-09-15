"use client";

/** What kind of thing a link leads to, in plain words. */
function describe(href: string): { kind: string; detail: string } {
  if (/^mailto:/i.test(href))
    return { kind: "an email address", detail: href.replace(/^mailto:/i, "") };
  if (/^tel:/i.test(href))
    return { kind: "a phone number", detail: href.replace(/^tel:/i, "") };
  if (/^https?:\/\//i.test(href)) {
    try {
      return { kind: `another website (${new URL(href).hostname})`, detail: href };
    } catch {
      return { kind: "another website", detail: href };
    }
  }
  if (href === "#" || href === "")
    return { kind: "nowhere yet — it's still empty", detail: "(no link set)" };
  return { kind: "somewhere outside your site", detail: href };
}

export const isOpenable = (href: string) => href !== "#" && href !== "";

/** The dialog content for a link that leaves the site. */
export function externalLinkPrompt(href: string) {
  const { kind, detail } = describe(href);
  const openable = isOpenable(href);

  return {
    title: "This button points outside your site",
    confirmLabel: openable ? "Yes, open it" : "Close",
    cancelLabel: "No, stay here",
    hideCancel: !openable,
    message: (
      <>
        <p>It goes to {kind}.</p>
        <p className="mt-2 break-all rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
          {detail}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {openable
            ? "Do you want to open it in a new tab? Your site stays where it is."
            : "Give the button a link in the panel on the right, then try again."}
        </p>
      </>
    ),
  };
}
