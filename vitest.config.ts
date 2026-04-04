import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    globalSetup: ["tests/global-setup.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
})
