import { defineConfig } from "@playwright/test";

// e2e smoke against a prod build. Credentials come from the environment (CI sets
// them; local runs fall back to a generic value). No real secret in this file.
const fallback = "test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:3017" },
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3017/login",
    reuseExistingServer: true,
    env: {
      JOBS_SECRET: process.env.JOBS_SECRET || fallback,
      JOBS_PASSWORD: process.env.JOBS_PASSWORD || fallback,
      JOBS_DB: process.env.JOBS_DB || "",
    },
  },
});
