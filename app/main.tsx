import React from "react";
import ReactDOM from "react-dom/client";

import { PwaLifecycle } from "./features/pwa/pwa-lifecycle";
import "./styles.css";

async function render() {
  const Component =
    window.location.pathname === "/mcp/consent"
      ? (await import("./features/mcp/consent-page")).McpConsentPage
      : import.meta.env.DEV && window.location.pathname === "/__ui/setup"
        ? (await import("./features/setup/setup-preview")).SetupPreview
        : (await import("./app")).App;

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Component />
      <PwaLifecycle />
    </React.StrictMode>
  );
}

void render();
