import { test, expect } from "@playwright/test";

// Smoke against a prod build on 127.0.0.1 (loopback) - is-local bypasses the Google gate, so the
// board is browsable. These confirm the app boots and the core pages render without error, even
// on a fresh DB (no jobs). Auth is Google-only; there is no password login to drive.

test("login page shows the Google sign-in", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /Sign in with Google/i })).toBeVisible();
});

test("board renders on localhost without signing in", async ({ page }) => {
  await page.goto("/jobs");
  await expect(page).toHaveURL(/\/jobs/);
  await expect(page.getByRole("heading", { name: "AI-Jobs" })).toBeVisible();
});

test("recruiter call sheet renders (sample data on a fresh clone)", async ({ page }) => {
  await page.goto("/jobs/recruiters");
  await expect(page.getByRole("heading", { name: "AI-Jobs" })).toBeVisible();
});
