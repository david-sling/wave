/**
 * Writes to the clipboard, falling back to the old selection trick.
 *
 * The async API needs a secure context and a permission that some browsers
 * refuse; silently doing nothing is the one outcome a copy must not have,
 * since the whole point is that the result is invisible.
 */
export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Fall through to the legacy path.
  }

  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}
