// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { scrollActiveMobileMailSurfaceToTop } from "@/lib/mobile-scroll";

describe("compact top safe-area scrolling", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("smoothly scrolls only the currently visible mail surface to the top", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false }))
    );
    document.body.innerHTML = `
      <section data-mobile-scroll-active="true">
        <div data-pull-to-refresh-scroll></div>
      </section>
      <section>
        <div data-pull-to-refresh-scroll></div>
      </section>
    `;
    const [active, inactive] = document.querySelectorAll<HTMLElement>(
      "[data-pull-to-refresh-scroll]"
    );
    const activeScrollTo = vi.fn();
    const inactiveScrollTo = vi.fn();
    if (!active || !inactive) throw new Error("Expected both mail scroll surfaces.");
    active.scrollTop = 640;
    inactive.scrollTop = 320;
    active.scrollTo = activeScrollTo;
    inactive.scrollTo = inactiveScrollTo;

    scrollActiveMobileMailSurfaceToTop();

    expect(activeScrollTo).toHaveBeenCalledWith({ behavior: "smooth", top: 0 });
    expect(inactiveScrollTo).not.toHaveBeenCalled();
  });
});
