const activeMobileMailSurfaceSelector =
  '[data-mobile-scroll-active="true"] [data-pull-to-refresh-scroll]';

export function scrollActiveMobileMailSurfaceToTop(): void {
  const surface = document.querySelector<HTMLElement>(activeMobileMailSurfaceSelector);
  if (surface) scrollMailSurfaceToTop(surface);
}

export function scrollMailSurfaceToTop(surface: HTMLElement): void {
  if (surface.scrollTop <= 0) return;
  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  surface.scrollTo({ behavior: reduceMotion ? "auto" : "smooth", top: 0 });
}
