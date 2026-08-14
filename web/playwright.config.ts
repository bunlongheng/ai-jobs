import { defineConfig } from "@playwright/test";

// e2e smoke against a prod build on 127.0.0.1 - loopback, so is-local bypasses the Google gate
// and the board is browsable without signing in. No real secret in this file.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:3017" },
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3017/login",
    reuseExistingServer: true,
    env: {
      // Auth.js needs a secret to initialize even though loopback bypasses the sign-in check.
      AUTH_SECRET: process.env.AUTH_SECRET || "e2e-smoke-secret-not-a-real-key",
      JOBS_DB: process.env.JOBS_DB || "",
    },
  },
});
