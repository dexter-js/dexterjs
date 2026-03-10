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
      "@dexterjs/types": path.resolve(__dirname, "shared/types/src"),
      "@dexterjs/sdk": path.resolve(__dirname, "packages/sdk/src"),
      "@dexterjs/sidecar": path.resolve(__dirname, "packages/sidecar/src"),
    },
  },
});
