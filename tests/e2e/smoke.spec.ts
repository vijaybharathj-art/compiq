import { test, expect } from "@playwright/test";

// End-to-end smoke test covering the full navigable surface of the Phase 1
// MVP, per the execution brief's test plan: Login, Dashboard, Deals, Deal
// Detail, Clients, Client Detail, Tasks, Intelligence, Search, Settings,
// Audit Log. Runs against the real seeded Postgres database — no mocking.

test.describe("Tattava Phase 1 smoke test", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    (page as unknown as { __errors: string[] }).__errors = errors;
  });

  test("redirects unauthenticated users to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("Sign in")).toBeVisible();
  });

  test("logging in as a demo banker reaches the dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByText("Bharath Vijay").click();
    await page.waitForURL("**/dashboard");
    await expect(page.getByText("Good morning, Bharath.")).toBeVisible();
    await expect(page.getByText("Active Deals").first()).toBeVisible();
  });

  test("navigates the full app without console errors", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByText("Bharath Vijay").click();
    await page.waitForURL("**/dashboard");

    const routes: { path: string; expectText: string }[] = [
      { path: "/deals", expectText: "Project Falcon" },
      { path: "/deals/deal-falcon", expectText: "Acme Industries" },
      { path: "/clients", expectText: "Acme Industries" },
      { path: "/clients/client-acme", expectText: "Relationship Intelligence" },
      { path: "/tasks", expectText: "To Do" },
      { path: "/intelligence", expectText: "Intelligence Feed" },
      { path: "/pipeline", expectText: "Pipeline" },
      { path: "/calendar", expectText: "Calendar" },
      { path: "/settings", expectText: "Team Members" },
      { path: "/integrations", expectText: "Gmail" },
      { path: "/audit-log", expectText: "Audit Log" },
    ];

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.getByText(route.expectText).first()).toBeVisible();
    }

    const errors = (page as unknown as { __errors: string[] }).__errors;
    expect(errors, `Console/page errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("search finds a deal by name and by natural-language filters", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByText("Bharath Vijay").click();
    await page.waitForURL("**/dashboard");

    await page.goto("/search?q=Falcon");
    await expect(page.getByText("Project Falcon").first()).toBeVisible();

    await page.goto("/search?q=" + encodeURIComponent("high risk"));
    await expect(page.getByText("Detected:")).toBeVisible();
  });

  test("task board and pipeline render draggable cards", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByText("Bharath Vijay").click();
    await page.waitForURL("**/dashboard");

    await page.goto("/tasks");
    await expect(page.locator(".cursor-grab").first()).toBeVisible();

    await page.goto("/pipeline");
    await expect(page.getByText("drag a card to change its stage")).toBeVisible();
  });
});
