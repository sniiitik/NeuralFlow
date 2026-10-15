import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
const url = process.env.SECURITY_TEST_BASE_URL;
const database = process.env.TEST_DATABASE_URL;
if (!url || !database || !new URL(database).pathname.endsWith("_test"))
  throw new Error(
    "Use SECURITY_TEST_BASE_URL and an isolated TEST_DATABASE_URL ending in _test.",
  );
process.env.DATABASE_URL = database;
process.env.NEURALFLOW_BOOTSTRAP = "1";
const { auth } = await import("../src/lib/auth");
const { getPrisma } = await import("../src/lib/prisma");
const password = `Ui-${randomUUID()}`;
const email = `ui-${randomUUID()}@example.test`;
const account = await auth.api.signUpEmail({
  body: { name: "UI verification", email, password },
});
await getPrisma().user.update({
  where: { id: account.user.id },
  data: { role: "operator" },
});
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
  timezoneId: "America/New_York",
});
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" || m.text().includes("width(-1)"))
    errors.push(m.text());
});
const output =
  process.env.UI_SCREENSHOT_DIR ?? "/private/tmp/neuralflow-phase8";
await mkdir(output, { recursive: true });
try {
  await page.goto(`${url}/login`);
  const logo = page.getByRole("img", { name: "NeuralFlow logo" });
  await logo.waitFor();
  assert.ok(await logo.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0));
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${url}/`);
  for (const width of [1440, 1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of [
      "/",
      "/models",
      "/deployments",
      "/inference",
      "/monitoring",
      "/audit",
      "/settings",
    ]) {
      await page.goto(url + route);
      await page.locator("h1").waitFor();
      await page.waitForTimeout(600);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${route} overflows at ${width}`,
      );
      await page.screenshot({
        path: `${output}/${route === "/" ? "overview" : route.slice(1)}-${width}.png`,
        fullPage: false,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${url}/models`);
  const family = `ui-iris-${Date.now()}`;
  for (const version of ["v1", "v2"]) {
    await page
      .getByRole("button", { name: "Register version", exact: true })
      .click();
    await page.locator("dialog[open] input[name=name]").fill(family);
    await page.locator("dialog[open] input[name=version]").fill(version);
    await page
      .locator("dialog[open] input[name=artifact]")
      .setInputFiles(`inference/examples/iris-${version}.json`);
    await page
      .locator("dialog[open]")
      .getByRole("button", { name: "Register version", exact: true })
      .click();
    await page.locator("dialog[open]").waitFor({ state: "hidden" });
  }
  await page.getByLabel("Search model families").fill(family);
  await page.getByRole("button", { name: family, exact: true }).click();
  await page
    .getByRole("button", { name: "Activate for inference" })
    .last()
    .click();
  await page
    .getByText("Version loaded and ready for direct inference.", {
      exact: false,
    })
    .last()
    .waitFor();
  await page.keyboard.press("Escape");
  await page.goto(`${url}/deployments`);
  const models = await (await context.request.get(`${url}/api/models`)).json();
  const v1 = models.models.find(
    (m: { name: string; version: string }) =>
      m.name === family && m.version === "v1",
  );
  await page.locator("select[name=modelId]").selectOption(v1.id);
  await page.locator("select[name=toVersion]").selectOption("v2");
  await page
    .getByRole("button", { name: "Start rollout", exact: true })
    .click();
  await page.getByLabel("Search deployments").fill(family);
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: family, exact: true }) }).filter({hasText:"canary"});
  await card.waitFor();
  await card.getByRole("button", { name: "Promote", exact: true }).click();
  await page.getByRole("button", { name: "Confirm serving change" }).click();
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
  await page.goto(`${url}/inference`);
  const select = page.locator("select");
  const option = await select
    .locator("option")
    .filter({ hasText: family })
    .filter({ hasText: "serving route" })
    .getAttribute("value");
  assert.ok(option);
  await select.selectOption(option);
  await page.getByRole("button", { name: "Predict", exact: true }).click();
  await page
    .getByText("Class probability is a model estimate", { exact: false })
    .waitFor();
  assert.ok(await page.getByText("v2", { exact: true }).count());
  await page.screenshot({ path: `${output}/prediction.png`, fullPage: false });
  await page.goto(`${url}/deployments`);
  await page.getByLabel("Search deployments").fill(family);
  await card.getByRole("button", { name: "Rollback", exact: true }).click();
  await page.getByRole("button", { name: "Confirm serving change" }).click();
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
  await page.goto(`${url}/inference`);
  await select.selectOption(option);
  await page.getByRole("button", { name: "Predict", exact: true }).click();
  await page
    .getByText("Class probability is a model estimate", { exact: false })
    .waitFor();
  assert.ok(await page.getByText("v1", { exact: true }).count());
  // Role changes are checked in a new authenticated session.
  await getPrisma().user.update({
    where: { id: account.user.id },
    data: { role: "viewer" },
  });
  await context.clearCookies();
  await page.goto(`${url}/login`);
  const viewerLogo = page.getByRole("img", { name: "NeuralFlow logo" });
  await viewerLogo.waitFor();
  assert.ok(await viewerLogo.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0));
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${url}/`);
  await page.goto(`${url}/models`);
  assert.equal(
    await page
      .getByRole("button", { name: "Register version", exact: true })
      .isDisabled(),
    true,
  );
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Open navigation'}).click();
  assert.equal(await page.locator('aside').evaluate(el=>el.contains(document.activeElement)),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button',{name:'Open navigation'}).getAttribute('aria-expanded'),'false');
  await page.goto(`${url}/login`);
  for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.screenshot({path:`${output}/login-${width}.png`});}
  await page.getByLabel('Email').focus();await page.keyboard.press('Tab');
  assert.equal(await page.getByLabel('Password').evaluate(el=>el===document.activeElement),true);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 21 responsive page captures; UI registration, activation, promotion, prediction v2, rollback, prediction v1, viewer restrictions, mobile navigation Escape/focus, login keyboard order; no browser errors.",
  );
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  console.error((await page.locator("body").innerText()).slice(-4000));
  throw error;
} finally {
  await browser.close();
  await getPrisma().$disconnect();
}
