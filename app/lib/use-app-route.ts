import * as React from "react";

import { type AppRoute, appRoutePath, readAppRoute } from "@/lib/routes";

export function useAppRoute(setupComplete: boolean | undefined): {
  navigate: (route: AppRoute, replace?: boolean) => void;
  route: AppRoute;
} {
  const [route, setRoute] = React.useState<AppRoute>(() => readAppRoute(window.location.href));

  const navigate = React.useCallback((nextRoute: AppRoute, replace = false) => {
    const path = appRoutePath(nextRoute);
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` === path) {
      setRoute(nextRoute);
      return;
    }
    window.history[replace ? "replaceState" : "pushState"](null, "", path);
    setRoute(nextRoute);
  }, []);

  React.useEffect(() => {
    const onPopState = () => setRoute(readAppRoute(window.location.href));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  React.useEffect(() => {
    if (window.location.pathname === "/setup" && setupComplete !== true) return;
    const canonicalPath = appRoutePath(route);
    if (window.location.pathname === canonicalPath) return;
    window.history.replaceState(
      null,
      "",
      `${canonicalPath}${window.location.search}${window.location.hash}`
    );
  }, [route, setupComplete]);

  return { navigate, route };
}
