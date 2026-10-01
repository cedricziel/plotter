const SHOW = 'maplibregl-compact-show';

/** Collapses MapLibre's compact attribution `ms` after it opens; MapLibre itself only collapses it on a drag. */
export function collapseAfter(el: HTMLElement, ms: number): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sync = () => {
    if (!el.classList.contains(SHOW)) {
      clearTimeout(timer);
      timer = undefined;
    } else if (timer === undefined) {
      timer = setTimeout(() => {
        timer = undefined;
        el.classList.remove(SHOW);
      }, ms);
    }
  };
  new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ['class'] });
  sync();
}
