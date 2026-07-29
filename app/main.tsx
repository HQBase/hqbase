import React from "react";
import ReactDOM from "react-dom/client";

import { PwaLifecycle } from "./features/pwa/pwa-lifecycle";
import { initializeTheme } from "./features/theme/theme";
import { ThemeProvider } from "./features/theme/theme-provider";
import "./styles.css";

async function render() {
  const initialTheme = initializeTheme();
  const Component =
    window.location.pathname === "/mcp/consent"
      ? (await import("./features/mcp/consent-page")).McpConsentPage
      : import.meta.env.DEV && window.location.pathname === "/__ui/setup"
        ? (await import("./features/setup/setup-preview")).SetupPreview
        : (await import("./app")).App;

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
