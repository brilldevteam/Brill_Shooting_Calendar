import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

test("local administrator can sign in and sign out", async ({
  page,
}, testInfo) => {
  test.skip(
    !existsSync(".env.seed-accounts"),
    "Requires optional local development seed",
  );
  const accounts = readFileSync(".env.seed-accounts", "utf8");
  for (const email of ["super@brill.example.test"]) {
    const password = accounts
      .split(email + "\nPassword: ")[1]
      ?.split("\n")[0]
      ?.trim();
    if (!password) throw new Error("Seed credentials format is invalid");
    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: /A clear view/ }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(
        email.startsWith("super") ? "admin.png" : "client.png",
      ),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (testInfo.project.name === "mobile")
      await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("button", { name: "Sessions & contracts", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Sessions & contracts", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    if (testInfo.project.name === "mobile")
      await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  }
});

test("sign-up form has accessible password visibility controls", async ({
  page,
}) => {
  await page.goto("/signup");
  await expect(
    page.getByRole("heading", { name: "Start your client workspace." }),
  ).toBeVisible();
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("A secure password");
  await expect(password).toHaveAttribute("type", "password");
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await page
    .getByRole("button", { name: "Hide password", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "password");
  await expect(
    page.getByLabel("Confirm password", { exact: true }),
  ).toHaveAttribute("type", "password");
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveAttribute("href", "/login");
});
