import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.{js,ts}"],
    environment: "node",
    testTimeout: 10000,
    alias: {
      "@/": new URL("./src/", import.meta.url).pathname,
    },
  },
});
