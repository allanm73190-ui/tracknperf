import { expect, test } from "@playwright/test";

test("smoke: home loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

