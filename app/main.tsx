import React from "react";
import ReactDOM from "react-dom/client";

import { selectEntryRoute } from "./entry-route";
import { PwaLifecycle } from "./features/pwa/pwa-lifecycle";
import { initializeTheme } from "./features/theme/theme";
import { ThemeProvider } from "./features/theme/theme-provider";
import "./styles.css";

async function loadRootComponent(): Promise<React.ComponentType> {
  if (import.meta.env.DEV && window.location.pathname === "/__ui/design") {
    return (await import("./features/ui-lab/design-preview")).DesignPreview;
  }

  if (import.meta.env.DEV && window.location.pathname === "/__ui/setup") {
    return (await import("./features/setup/setup-preview")).SetupPreview;
  }

  switch (selectEntryRoute(window.location.pathname)) {
    case "device-authorization":
      return (await import("./features/auth/device-authorization-page")).DeviceAuthorizationPage;
    case "oauth-consent":
      return (await import("./features/mcp/consent-page")).OAuthConsentPage;
    case "app":
      return (await import("./app")).App;
  }
}

async function render() {
  const initialTheme = initializeTheme();
  const Component = await loadRootComponent();

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider initialTheme={initialTheme}>
        <Component />
        <PwaLifecycle />
      </ThemeProvider>
    </React.StrictMode>
  );
}

void render();
