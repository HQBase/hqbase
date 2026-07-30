import * as React from "react";

export const desktopShellMediaQuery = "(hover: hover) and (pointer: fine)";

export function useDesktopShell(): boolean {
  const [matches, setMatches] = React.useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(desktopShellMediaQuery).matches
  );

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(desktopShellMediaQuery);
    const update = (): void => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return matches;
}
