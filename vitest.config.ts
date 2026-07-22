import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        // CLI command surface is implemented in later milestones (M3+);
        // this stub has no behavior to unit test yet.
        "src/cli/**",
      ],
    },
  },
});
