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
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"]
  }
});
