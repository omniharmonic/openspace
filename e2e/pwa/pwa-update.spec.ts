import { expect, type Page, test } from "@playwright/test";
import { PWA_URL } from "./env";

/**
 * "A new version of OpenSpace is ready" → Reload must always end on the new version, quickly,
 * on iPhone (WebKit) and Android (Chromium) alike — including when the browser never reports
 * the switch-over, and when another (or a ghost) Studio tab seems to be open.
 */

const BUILD_A = "pwa-build-a";
const BUILD_B = "pwa-build-b";

async function deploy(to: 0 | 1) {
  const res = await fetch(`${PWA_URL}/__deploy?to=${to}`, { method: "POST" });
  expect(res.ok).toBe(true);
}

const build = (page: Page) =>
  page.locator('meta[name="os-build"]').getAttribute("content", { timeout: 5_000 });

/** Open Studio on build A, controlled by its service worker (the second load is). */
async function openOnBuildA(page: Page) {
  await deploy(0);
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  expect(await build(page)).toBe(BUILD_A);
}

/** Deploy build B and let this tab find it (what opening Studio again does). */
async function shipBuildB(page: Page) {
  await deploy(1);
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.update();
  });
  await expect(
    page.getByText("A new version of OpenSpace is ready", { exact: true }),
  ).toBeVisible();
}

async function tapReload(page: Page, label = "Reload") {
  await page.getByRole("button", { name: label, exact: true }).click();
}

async function expectBuildB(page: Page) {
  await expect.poll(() => build(page).catch(() => null), { timeout: 12_000 }).toBe(BUILD_B);
  await expect(page.getByText("A new version of OpenSpace is ready", { exact: true })).toHaveCount(
    0,
  );
}

test.beforeEach(async ({ context }) => {
  // Each test starts from a clean origin (service worker and caches are per context).
  await context.clearCookies();
});

test("Reload switches to the new version", async ({ page }) => {
  await openOnBuildA(page);
  await shipBuildB(page);
  await tapReload(page);
  await expectBuildB(page);
});

test("Reload still lands on the new version when the browser never announces the switch", async ({
  page,
}) => {
  // What iPhones do at times: the new version takes over but `controllerchange` never fires.
  await page.addInitScript(() => {
    const add = navigator.serviceWorker.addEventListener.bind(navigator.serviceWorker);
    navigator.serviceWorker.addEventListener = ((type: string, ...rest: unknown[]) => {
      if (type === "controllerchange") return;
      return (add as (...a: unknown[]) => void)(type, ...rest);
    }) as typeof navigator.serviceWorker.addEventListener;
  });
  await openOnBuildA(page);
  await shipBuildB(page);
  await tapReload(page);
  await expectBuildB(page);
});

test("Reload still lands on the new version when the waiting version never takes over", async ({
  page,
}) => {
  // The waiting worker ignores "skip waiting" (stuck): Studio must get past it anyway.
  await page.addInitScript(() => {
    const post = ServiceWorker.prototype.postMessage;
    ServiceWorker.prototype.postMessage = function (this: ServiceWorker, msg: unknown, ...rest) {
      if ((msg as { type?: string } | null)?.type === "SKIP_WAITING") return;
      return (post as (...a: unknown[]) => void).call(this, msg, ...rest);
    } as typeof ServiceWorker.prototype.postMessage;
  });
  await openOnBuildA(page);
  await shipBuildB(page);
  await tapReload(page);
  await expectBuildB(page);
});

test("a ghost Studio tab doesn't block the update for good", async ({ page, context }) => {
  await openOnBuildA(page);
  // Another "tab" that keeps saying it's open (a stale tab, or one the phone keeps alive).
  const ghost = await context.newPage();
  await ghost.goto("/__blank");
  await ghost.evaluate(() => {
    const ch = new BroadcastChannel("openspace-studio-tabs");
    const say = () => ch.postMessage({ type: "here", id: "tab-ghost" });
    ch.onmessage = (e) => {
      if ((e.data as { type?: string })?.type === "hello") say();
    };
    say();
    setInterval(say, 1000);
  });
  await shipBuildB(page);
  await tapReload(page);
  await expect(page.getByText("OpenSpace is also open in another tab")).toBeVisible();
  expect(await build(page)).toBe(BUILD_A);
  await tapReload(page, "Update anyway");
  await expectBuildB(page);
});
