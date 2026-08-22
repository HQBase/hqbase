import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "app"),
      "@worker": path.resolve(process.cwd(), "worker")
    }
  },
  server: {
    proxy: {
      "/.well-known": "http://127.0.0.1:8787",
      "/api": "http://127.0.0.1:8787",
      "/mcp": "http://127.0.0.1:8787"
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"]
  }
});
