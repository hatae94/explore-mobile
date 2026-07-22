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
        // Process entrypoint glue only (real process.argv/stdout/exitCode);
        // its logic (router.ts + commands/*) is fully unit tested and
        // intentionally NOT excluded here.
        "src/cli/bin.ts",
        // Real child_process.spawn wiring; exercised through AdbBackend's
        // injected-mock unit tests, not directly (would require a real
        // adb binary / real subprocess).
        "src/backend/adb-executor.ts",
      ],
    },
  },
});
