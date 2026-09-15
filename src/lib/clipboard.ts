/**
 * Copy text, falling back to the old way when the clipboard API says no —
 * which it does on older browsers, and on any page it doesn't trust.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through to the scratch-textarea trick.
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
    return worked;
  } catch {
    return false;
  }
}
