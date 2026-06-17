import { expect, test } from "@playwright/test";

test("buyer can run Jill from clean sheet to issued PO", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Annual savings")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: "New Request" })).toBeVisible();

  await page.getByLabel("Primary", { exact: true }).getByRole("button", { name: "Vendors" }).click();
  await expect(page.getByText("Vendor emails drive AgentMail sends")).toBeVisible();
  await page.getByRole("button", { name: "Add vendor" }).click();
  await expect(page.getByText("Unsaved")).toBeVisible();
  await page.getByLabel("Supplier name").first().fill("Northstar Industrial Supply");
  await page.getByLabel("RFQ email address").first().fill("rfq-test@northstar.example");
  await page.getByRole("button", { name: "Create vendor" }).first().click();
  await expect(page.getByRole("button", { name: "Save vendor" }).first()).toBeVisible();
  await expect(page.getByText("rfq-test@northstar.example").first()).toBeVisible();

  await page.getByLabel("Primary", { exact: true }).getByRole("button", { name: "Dashboard" }).click();
  await page.getByRole("main").getByRole("button", { name: "New Request" }).click();
  await expect(page.getByText("Structured RFQ draft")).toBeVisible();
  await expect(page.getByText("Needs your confirmation")).toBeVisible();

  await page.getByRole("button", { name: "Approve & continue to vendors" }).click();
  await expect(page.getByText("Selected for RFQ")).toBeVisible();
  await expect(page.getByText("Vendor emails drive AgentMail sends")).not.toBeVisible();

  await expect(page.getByText("Jill recommends suppliers")).toBeVisible();
  await expect(page.getByText("Selected for RFQ")).toBeVisible();
  await expect(page.getByText("rfq-test@northstar.example").first()).toBeVisible();

  await page.getByRole("button", { name: "Send RFQ via AgentMail" }).click();
  await expect(page.getByText("Refresh AgentMail replies")).toBeVisible({ timeout: 30000 });

  const state = await page.evaluate(async () => {
    const response = await fetch("/api/state");
    return response.json();
  });
  const rfqId = state.rfqs[0].id;
  const webhook = await page.evaluate(async (id) => {
    const response = await fetch("/api/agentmail/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
      event_type: "message.received",
      message: {
        from: "rfq-test@northstar.example",
        to: ["bsl-procurement@agentmail.to"],
        subject: `Re: RFQ ${id}`,
        text: "Price: USD 164,200 total for qty 2 packages. Lead: 28 calendar days. Terms: Net30. Warranty = 24 months. Compliance: API-610 yes.",
        labels: [`rfq:${id}`]
      }
    })
    });
    return response.json();
  }, rfqId);
  expect(webhook.ok).toBe(true);

  await page.getByRole("button", { name: "Refresh AgentMail replies" }).click();
  await expect(page.getByText("Normalized quote comparison")).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("Jill's pick")).toBeVisible();

  await page.getByRole("button", { name: "Send to approval" }).click();
  await expect(page.getByText("Award summary")).toBeVisible();
  await expect(page.getByText("Compliance checklist")).toBeVisible();

  await page.getByRole("button", { name: "Approve & issue PO" }).click();
  await expect(page.getByText(/PO-\d{4} issued — vendor notified by email\./)).toBeVisible();
});
