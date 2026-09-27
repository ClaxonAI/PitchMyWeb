// UX checks on the production build, run by CI after `npm run build` with the
// API on :4000 and the web app on :3000 (see .github/workflows/ci.yml).
//
//   node apps/web/e2e/ux.mjs
//
// Phone (iPhone 13) in light and dark, and laptop (1366×800). What it guards:
// the phone menu never stays open over the sign-in page, the Back button
// closes overlays instead of leaving the page, sign-in returns to the page
// that asked for it, and the dashboard fits a phone — no sideways scroll,
// 44px tap targets, a bottom tab bar that never covers content.
//
// `playwright` is not a dependency of apps/web; it is resolved from the
// workspace root, where the recorder and verification workers install it.
import { chromium, devices } from "playwright";

const WEB = process.env.UX_WEB_URL ?? "http://localhost:3000";
const API = process.env.UX_API_URL ?? "http://localhost:4000";
const PASSWORD = "CorrectHorse!42";
const email = `ux-${Date.now()}@example.test`;

const failures = [];
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

const register = await fetch(`${API}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: WEB },
  body: JSON.stringify({ email, password: PASSWORD }),
});
if (!register.ok) {
  console.error(`Could not register the test user: ${register.status} ${await register.text()}`);
  process.exit(1);
}

const PUBLIC_PAGES = [
  "/",
  "/pricing",
  "/login",
  "/register",
  "/forgot-password",
  "/how-it-works",
  "/contact",
  "/privacy",
  "/terms",
  "/refunds",
  "/guides",
  "/guides/find-local-businesses-without-a-website",
  "/for",
  "/for/dental-clinics",
  "/in/chennai",
];

const DASHBOARD_PAGES = ["/dashboard", "/campaigns", "/leads", "/websites", "/settings", "/whatsapp", "/campaigns/new"];

// Layout facts about the current page, measured in the browser.
function measure() {
  const doc = document.documentElement;
  doc.style.scrollBehavior = "auto";
  const bar = document.querySelector('nav[aria-label="Main"]');
  const barRect = bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect() : null;
  const small = [...document.querySelectorAll("header button, header a, main button, main a[class*='inline-flex'], nav[aria-label='Main'] a")]
    // Switches carry an enlarged ::before hit area (52×44) around a 36×20 track.
    .filter((el) => el.getAttribute("role") !== "switch")
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && (r.height < 43.5 || r.width < 43.5);
    })
    .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24)}" ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`);
  window.scrollTo({ top: doc.scrollHeight, behavior: "instant" });
  const main = document.querySelector("main");
  return {
    sideways: doc.scrollWidth - doc.clientWidth,
    barTop: barRect?.top ?? null,
    barBottom: barRect?.bottom ?? null,
    viewport: innerHeight,
    mainBottom: main ? main.getBoundingClientRect().bottom : null,
    small,
  };
}

async function signIn(page, next) {
  await page.goto(`${WEB}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([page.waitForURL(`**${next ?? "/dashboard"}`), page.click('button[type="submit"]')]);
}

const browser = await chromium.launch();
const runs = [
  ["phone", "light", devices["iPhone 13"]],
  ["phone", "dark", devices["iPhone 13"]],
  ["laptop", "light", { viewport: { width: 1366, height: 800 } }],
];

for (const [device, theme, options] of runs) {
  const tag = `${device}/${theme}`;
  const context = await browser.newContext({ ...options, colorScheme: theme });
  const page = await context.newPage();
  const errors = [];
  // Clerk's browser SDK cannot reach its (placeholder) frontend API in CI;
  // that is expected here and not what this suite checks.
  page.on("pageerror", (error) => { if (!/clerk/i.test(`${error.message} ${error.stack}`)) errors.push(error.message); });

  for (const path of PUBLIC_PAGES) {
    const response = await page.goto(WEB + path, { waitUntil: "networkidle" });
    check(`${tag} ${path}: loads`, response?.status() === 200, String(response?.status()));
    const { sideways } = await page.evaluate(measure);
    check(`${tag} ${path}: no sideways scroll`, sideways <= 0, `${sideways}px`);
    // Nothing unfinished may reach a public page.
    const leftover = await page.evaluate(() => /\bPLACEHOLDER\b|lorem ipsum|\bTODO\b/i.exec(document.body.innerText)?.[0] ?? null);
    check(`${tag} ${path}: no placeholder text`, leftover === null, leftover ?? "");
  }

  // The business behind the site, as Razorpay and India's DPDP rules ask.
  await page.goto(`${WEB}/contact`, { waitUntil: "networkidle" });
  const contact = await page.evaluate(() => document.body.innerText);
  check(`${tag}: /contact shows Claxon AI, address and phone`, /Claxon AI/.test(contact) && /Chennai, Tamil Nadu 600119/.test(contact) && (await page.locator('a[href="tel:+919176274991"]').count()) > 0);
  await page.goto(`${WEB}/privacy`, { waitUntil: "networkidle" });
  check(`${tag}: /privacy names the Grievance Officer`, /Grievance Officer is Nitin P/.test(await page.evaluate(() => document.body.innerText)));

  // Forgot password: sign-in links to it, and asking for a code moves to the
  // code step with the same answer for any address.
  await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.waitForURL("**/forgot-password");
  await page.getByLabel("Email").fill(`nobody-${Date.now()}@example.test`);
  await page.getByRole("button", { name: "Send code" }).click();
  const codeStep = await page.getByLabel("Digit 1").waitFor({ timeout: 5000 }).then(() => true, () => false);
  check(`${tag}: forgot password reaches the code step`, codeStep);

  // Coupons are checked with the server: a code nobody created in
  // /admin/coupons shows as invalid instead of a discount checkout won't give.
  await page.goto(`${WEB}/pricing`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Have a coupon/ }).first().click();
  await page.getByLabel("Coupon code").fill("LAUNCH50");
  await page.getByRole("button", { name: "Apply" }).click();
  const couponRejected = await page.getByText("That code isn't valid or has expired.").waitFor({ timeout: 5000 }).then(() => true, () => false);
  check(`${tag}: /pricing rejects a coupon the server doesn't have`, couponRejected);

  // /admin is Cloudflare Access's to open: signed out it is a plain 404,
  // not a sign-in form or a "promote this account" page.
  const admin = await page.goto(`${WEB}/admin`, { waitUntil: "networkidle" });
  check(`${tag}: /admin is a 404 when signed out`, admin?.status() === 404 && !page.url().includes("/login"), `${admin?.status()} ${page.url().replace(WEB, "")}`);

  // A dead link: a real 404 with the site's navigation, not a bare page.
  const missing = await page.goto(`${WEB}/this-page-does-not-exist`, { waitUntil: "networkidle" });
  check(`${tag}: unknown page is a 404`, missing?.status() === 404, String(missing?.status()));
  check(`${tag}: 404 keeps the navigation`, (await page.locator("header").count()) > 0 && (await page.locator("footer").count()) > 0);

  if (device === "phone") {
    // ☰ → Sign in: the menu is gone and the social buttons are in view.
    await page.goto(`${WEB}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.locator("#mobile-menu").getByRole("link", { name: "Sign in" }).click();
    await page.waitForURL("**/login");
    await page.waitForTimeout(300);
    check(`${tag}: menu closed after tapping Sign in`, (await page.locator("#mobile-menu").count()) === 0);
    const github = await page.getByRole("button", { name: /Continue with GitHub/ }).boundingBox();
    const viewport = page.viewportSize();
    check(`${tag}: Google and GitHub buttons in view`, Boolean(github) && github.y + github.height <= viewport.height, github ? `bottom ${Math.round(github.y + github.height)} of ${viewport.height}` : "missing");

    // Back, a tap on the dimmed page and Escape each close the menu in place.
    await page.goto(`${WEB}/pricing`, { waitUntil: "networkidle" });
    for (const [how, close] of [
      ["Back", () => page.goBack()],
      ["backdrop tap", () => page.mouse.click(20, viewport.height - 20)],
      ["Escape", () => page.keyboard.press("Escape")],
    ]) {
      await page.getByRole("button", { name: "Open menu" }).click();
      await page.locator("#mobile-menu").waitFor();
      await close();
      await page.waitForTimeout(300);
      check(`${tag}: ${how} closes the menu`, (await page.locator("#mobile-menu").count()) === 0 && page.url().endsWith("/pricing"), page.url());
    }

    // The home page's "See plans" bar sits on the bottom edge.
    await page.goto(`${WEB}/`, { waitUntil: "networkidle" });
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(300);
    const gap = await page.getByRole("link", { name: "See plans →" }).last().evaluate((el) => innerHeight - (el.closest("div.fixed")?.getBoundingClientRect().bottom ?? Number.NaN));
    check(`${tag}: See plans bar pinned to the bottom`, Math.abs(gap) <= 2, `gap ${gap}`);
  }

  // A signed-out visit to a dashboard page signs in and comes back to it, and
  // Back afterwards does not land on the sign-in form.
  await page.goto(`${WEB}/websites`, { waitUntil: "networkidle" });
  check(`${tag}: sign-in keeps the page asked for`, /\/login\?next=%2Fwebsites/.test(page.url()), page.url().replace(WEB, ""));
  await signIn(page, "/websites");
  check(`${tag}: returned to /websites after sign-in`, page.url().endsWith("/websites"));
  await page.goBack().catch(() => {});
  await page.waitForTimeout(300);
  check(`${tag}: Back skips the sign-in form`, !page.url().includes("/login"), page.url().replace(WEB, ""));

  for (const path of DASHBOARD_PAGES) {
    const started = Date.now();
    await page.goto(WEB + path, { waitUntil: "networkidle" });
    const loadMs = Date.now() - started;
    const m = await page.evaluate(measure);
    check(`${tag} ${path}: renders the dashboard`, m.mainBottom !== null);
    if (m.mainBottom === null) continue;
    check(`${tag} ${path}: no sideways scroll`, m.sideways <= 0, `${m.sideways}px`);
    check(`${tag} ${path}: loads within 3s`, loadMs < 3000, `${loadMs}ms`);
    if (device === "phone") {
      check(`${tag} ${path}: tab bar on the bottom edge`, m.barBottom !== null && Math.abs(m.barBottom - m.viewport) <= 1, `${m.barTop}–${m.barBottom} of ${m.viewport}`);
      check(`${tag} ${path}: content ends above the tab bar`, m.barTop !== null && m.mainBottom <= m.barTop + 1, `main ${Math.round(m.mainBottom)}, bar ${m.barTop}`);
      check(`${tag} ${path}: tap targets at least 44px`, m.small.length === 0, m.small.slice(0, 5).join("; "));
    } else {
      check(`${tag} ${path}: no tab bar on a laptop`, m.barTop === null);
    }
  }

  if (device === "phone") {
    // Tabs: one tap to a module, the current one marked.
    await page.goto(`${WEB}/dashboard`, { waitUntil: "networkidle" });
    await page.locator('nav[aria-label="Main"]').getByRole("link", { name: "Websites" }).click();
    await page.waitForURL("**/websites");
    check(`${tag}: Websites tab opens /websites`, page.url().endsWith("/websites"));
    await page.goto(`${WEB}/leads`, { waitUntil: "networkidle" });
    check(`${tag}: Campaigns tab marked on /leads`, (await page.locator('nav[aria-label="Main"] a[aria-current="page"]').textContent())?.includes("Campaigns") === true);

    // Back closes the dashboard drawer and stays on the page.
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("dialog").waitFor();
    await page.goBack();
    await page.waitForTimeout(300);
    check(`${tag}: Back closes the drawer`, (await page.getByRole("dialog").count()) === 0 && page.url().endsWith("/leads"), page.url());
  }

  // Signed in as an ordinary user, /admin is still a 404.
  const adminSignedIn = await page.goto(`${WEB}/admin`, { waitUntil: "networkidle" });
  check(`${tag}: /admin is a 404 for a signed-in user`, adminSignedIn?.status() === 404 && !(await page.evaluate(() => document.body.innerText)).includes("admin:promote"), String(adminSignedIn?.status()));

  // A signed-in /login?next=… goes straight there; a foreign next is ignored.
  await page.goto(`${WEB}/login?next=%2Fsettings`, { waitUntil: "networkidle" });
  check(`${tag}: signed-in /login?next= goes to next`, page.url().endsWith("/settings"), page.url().replace(WEB, ""));
  await page.goto(`${WEB}/login?next=https%3A%2F%2Fevil.example`, { waitUntil: "networkidle" });
  check(`${tag}: foreign next= ignored`, page.url().startsWith(WEB), page.url());

  check(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await context.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} UX check(s) failed` : "\nAll UX checks passed");
process.exit(failures.length ? 1 : 0);
