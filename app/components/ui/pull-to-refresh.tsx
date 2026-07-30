import { ArrowDown, Check, TriangleAlert } from "lucide-react";
import * as React from "react";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";

const refreshThreshold = 64;
const refreshOffset = 44;
const maximumPull = 96;

type PullStatus = "idle" | "pulling" | "refreshing" | "complete" | "failed";

type PullToRefreshProps = {
  children: React.ReactNode;
  className?: string;
  onRefresh: () => Promise<void> | void;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
};

export function PullToRefresh({
  children,
  className,
  onRefresh,
  scrollContainerRef
}: PullToRefreshProps): React.ReactElement {
  const internalScrollRef = React.useRef<HTMLDivElement>(null);
  const activeScrollRef = scrollContainerRef ?? internalScrollRef;
  const gestureRef = React.useRef({ startX: 0, startY: 0, tracking: false });
  const distanceRef = React.useRef(0);
  const mountedRef = React.useRef(true);
  const statusRef = React.useRef<PullStatus>("idle");
  const resetTimerRef = React.useRef<number | null>(null);
  const [distance, setDistance] = React.useState(0);
  const [status, setStatus] = React.useState<PullStatus>("idle");

  const updateStatus = React.useCallback((nextStatus: PullStatus): void => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const updateDistance = React.useCallback((nextDistance: number): void => {
    distanceRef.current = nextDistance;
    setDistance(nextDistance);
  }, []);

  const reset = React.useCallback(
    (delay = 0): void => {
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = window.setTimeout(() => {
        if (!mountedRef.current) return;
        updateDistance(0);
        updateStatus("idle");
      }, delay);
    },
    [updateDistance, updateStatus]
  );

  const runRefresh = React.useCallback(async (): Promise<void> => {
    updateStatus("refreshing");
    updateDistance(refreshOffset);
    try {
      await onRefresh();
      if (!mountedRef.current) return;
      updateStatus("complete");
      reset(450);
    } catch {
      if (!mountedRef.current) return;
      updateStatus("failed");
      reset(900);
    }
  }, [onRefresh, reset, updateDistance, updateStatus]);

  React.useEffect(() => {
    mountedRef.current = true;
    const scrollContainer = activeScrollRef.current;
    if (!scrollContainer) return;

    const handleTouchStart = (event: TouchEvent): void => {
      if (statusRef.current === "refreshing" || event.touches.length !== 1) return;
      if (scrollContainer.scrollTop > 0) return;
      const touch = event.touches[0];
      if (!touch) return;
      gestureRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        tracking: true
      };
    };

    const handleTouchMove = (event: TouchEvent): void => {
      const gesture = gestureRef.current;
      const touch = event.touches[0];
      if (!gesture.tracking || !touch || statusRef.current === "refreshing") return;
      if (scrollContainer.scrollTop > 0) {
        gesture.tracking = false;
        return;
      }

      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      if (deltaY <= 0 || Math.abs(deltaX) > Math.abs(deltaY)) {
        if (distanceRef.current > 0) {
          updateDistance(0);
          updateStatus("idle");
        }
        if (deltaY < 0) gesture.tracking = false;
        return;
      }

      event.preventDefault();
      const resistedDistance = Math.min(maximumPull, deltaY * 0.46);
      updateDistance(resistedDistance);
      updateStatus("pulling");
    };

    const finishGesture = (): void => {
      if (!gestureRef.current.tracking) return;
      gestureRef.current.tracking = false;
      if (distanceRef.current >= refreshThreshold && statusRef.current !== "refreshing") {
        void runRefresh();
        return;
      }
      reset();
    };

    scrollContainer.addEventListener("touchstart", handleTouchStart, { passive: true });
    scrollContainer.addEventListener("touchmove", handleTouchMove, { passive: false });
    scrollContainer.addEventListener("touchend", finishGesture, { passive: true });
    scrollContainer.addEventListener("touchcancel", finishGesture, { passive: true });
    return () => {
      mountedRef.current = false;
      scrollContainer.removeEventListener("touchstart", handleTouchStart);
      scrollContainer.removeEventListener("touchmove", handleTouchMove);
      scrollContainer.removeEventListener("touchend", finishGesture);
      scrollContainer.removeEventListener("touchcancel", finishGesture);
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    };
  }, [activeScrollRef, reset, runRefresh, updateDistance, updateStatus]);

  const armed = distance >= refreshThreshold;
  const visible =
    distance > 4 || status === "refreshing" || status === "complete" || status === "failed";
  const label =
    status === "refreshing"
      ? "Refreshing…"
      : status === "complete"
        ? "Updated"
        : status === "failed"
          ? "Refresh failed"
          : armed
            ? "Release to refresh"
            : "Pull to refresh";

  return (
    <div className={cn("relative min-h-0 overflow-hidden", className)}>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="pointer-events-none absolute inset-x-0 top-0 flex h-11 items-center justify-center gap-2 text-xs text-muted-foreground"
        style={{
          opacity: visible ? 1 : 0,
          transform: `translateY(${Math.min(0, distance - refreshOffset)}px)`
        }}
      >
        {status === "refreshing" ? (
          <Spinner aria-label="Refreshing mail" />
        ) : status === "complete" ? (
          <Check aria-hidden="true" className="size-4" />
        ) : status === "failed" ? (
          <TriangleAlert aria-hidden="true" className="size-4" />
        ) : (
          <ArrowDown
            aria-hidden="true"
            className={cn("size-4 transition-transform", armed && "rotate-180")}
          />
        )}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          "h-full overflow-auto overscroll-contain will-change-transform",
          status !== "pulling" && "transition-transform duration-200 motion-reduce:transition-none"
        )}
        ref={activeScrollRef}
        style={{ transform: `translateY(${distance}px)` }}
      >
        {children}
      </div>
    </div>
  );
}
