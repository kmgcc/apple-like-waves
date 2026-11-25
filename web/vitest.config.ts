import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@alwave/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "@alwave/canvas": path.resolve(__dirname, "packages/canvas/src/index.ts"),
    },
  },
});
