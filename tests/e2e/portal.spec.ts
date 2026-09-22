import { test, expect } from "@playwright/test";
test("development client preview has no admin controls or other client identities", async ({
  page,
}) => {
  await page.goto("/preview?role=client");
  await expect(
    page.getByRole("heading", { name: "Ready for your next shoot?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clients & users", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open calendar", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Calendar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("DEMO · Forma Wellness", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("DEMO · Northline Interiors", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("client can complete the review step without confirming a shoot", async ({
  page,
}) => {
  await page.goto("/preview?role=client");
  await page
    .getByRole("button", { name: "Request a shoot", exact: true })
    .click();
  await expect(page.getByLabel("Team / resource", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("textbox", { name: "Location", exact: true })
    .fill("Demo studio");
  await page
    .getByRole("textbox", {
      name: "Doctor / spokesperson / subject",
      exact: true,
    })
    .fill("Demo subject");
  await page
    .getByRole("textbox", { name: "Shoot purpose / topics", exact: true })
    .fill("Fictional production topics");
  const date = new Date();
  date.setDate(date.getDate() + 14);
  while ([5, 6].includes(date.getDay())) date.setDate(date.getDate() + 1);
  await page
    .getByLabel("Preferred date", { exact: true })
    .fill(date.toISOString().slice(0, 10));
  await page
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Submit request", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/1 session on approval/)).toBeVisible();
});
