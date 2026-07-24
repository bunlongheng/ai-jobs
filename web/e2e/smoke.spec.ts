import { test, expect } from "@playwright/test";

test("unauthenticated board redirects to login", async ({ page }) => {
  await page.goto("/jobs");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
});

test("login then board renders, drill-down opens", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill(process.env.JOBS_PASSWORD || "test");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page).toHaveURL(/\/jobs/);
  await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
  // first company link -> drill-down
  const firstCompany = page.locator("table tbody tr td a").first();
  await firstCompany.click();
  await expect(page).toHaveURL(/\/jobs\/.+/);
  await expect(page.getByText("back to board")).toBeVisible();
});
