import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15_000,
    hookTimeout: 10_000,
  },
  resolve: {
    alias: {
      "@dexter.js/types": path.resolve(__dirname, "shared/types/src"),
      "@dexter.js/sdk": path.resolve(__dirname, "packages/sdk/src"),
      "@dexter.js/sidecar": path.resolve(__dirname, "packages/sidecar/src"),
    },
  },
});
