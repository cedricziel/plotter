const EVENTS = [
  "touchstart",
  "touchend",
  "pointerdown",
  "pointerup",
  "pointercancel",
  "mousedown",
  "click",
];

const name = (el: EventTarget | null): string => {
  if (!(el instanceof Element)) return String(el && (el as Node).nodeName);
  const cls =
    typeof el.className === "string" && el.className
      ? "." + el.className.trim().split(/\s+/).join(".")
      : "";
  return el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + cls;
};

/** On-screen event log for debugging taps on a phone without a remote inspector; enabled by `?taplog`. */
export function mountTapLog(): void {
  const out = document.createElement("pre");
  out.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:99999;margin:0;max-height:40vh;overflow:hidden;" +
    "pointer-events:none;background:rgba(0,0,0,.75);color:#0f0;font:10px/1.3 ui-monospace,monospace;white-space:pre-wrap";
  document.documentElement.append(out);
  const lines: string[] = [];
  for (const type of EVENTS) {
    window.addEventListener(
      type,
      (e) => {
        const p = (e as TouchEvent).changedTouches?.[0] ?? (e as MouseEvent);
        const hit = document.elementFromPoint(p.clientX, p.clientY);
        // Read defaultPrevented after every handler has run.
        setTimeout(() => {
          const t = new Date().toISOString().slice(17, 23);
          lines.unshift(
            `${t} ${type} ${Math.round(p.clientX)},${Math.round(p.clientY)} tgt=${name(e.target)} hit=${name(hit)}` +
              (e.defaultPrevented ? " PREVENTED" : ""),
          );
          lines.length = Math.min(lines.length, 40);
          out.textContent = lines.join("\n");
        });
      },
      { capture: true, passive: true },
    );
  }
}
