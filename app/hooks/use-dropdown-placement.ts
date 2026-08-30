import * as React from "react";

export type DropdownPlacement = { maxHeight: number; side: "bottom" | "top" };

export function getDropdownPlacement(
  anchor: Pick<DOMRect, "bottom" | "top">,
  contentHeight: number,
  viewportHeight: number,
  gap = 8
): DropdownPlacement {
  const above = Math.max(0, anchor.top - gap);
  const below = Math.max(0, viewportHeight - anchor.bottom - gap);
  const side = below < contentHeight && above > below ? "top" : "bottom";
  return { maxHeight: side === "top" ? above : below, side };
}

export function useDropdownPlacement(
  open: boolean,
  anchorRef: React.RefObject<HTMLElement | null>,
  contentRef: React.RefObject<HTMLElement | null>
): DropdownPlacement {
  const [placement, setPlacement] = React.useState<DropdownPlacement>({
    maxHeight: 512,
    side: "bottom"
  });

  React.useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const anchor = anchorRef.current;
      const content = contentRef.current;
      if (!anchor || !content) return;
      const next = getDropdownPlacement(
        anchor.getBoundingClientRect(),
        Math.max(content.scrollHeight, content.getBoundingClientRect().height),
        window.innerHeight
      );
      setPlacement((current) =>
        current.maxHeight === next.maxHeight && current.side === next.side ? current : next
      );
    };
    const frame = window.requestAnimationFrame(update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (contentRef.current) observer?.observe(contentRef.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    update();
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, contentRef, open]);

  return placement;
}
