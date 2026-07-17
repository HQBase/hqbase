import React from "react";
import ReactDOM from "react-dom/client";

import "./styles.css";

async function render() {
  const Component =
    import.meta.env.DEV && window.location.pathname === "/__ui/setup"
      ? (await import("./features/setup/setup-preview")).SetupPreview
      : (await import("./app")).App;

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Component />
    </React.StrictMode>
  );
}

void render();
