import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    include: ["tests/e2e/**/*.test.ts"],
    globalSetup: ["tests/e2e-global-setup.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
})
