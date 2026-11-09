/* End-to-end checks against a running server (npm run build && npm start).
 *   BASE=http://127.0.0.1:8787 node e2e/run.cjs
 * Uses the Playwright library directly; exits non-zero on any failure. */
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const BASE = process.env.BASE || "http://127.0.0.1:8787";
const ROUTES = ["/", "/standing", "/admission", "/predictions", "/search", "/overview", "/distribution", "/top", "/stats", "/quality", "/about", "/methodology", "/faq"];
let pass = 0;
const fails = [];
const check = (name, cond, extra = "") => { if (cond) pass++; else { fails.push(`${name} ${extra}`); console.log("  ✗", name, extra); } };

async function newPage(browser, { lang = "ar", theme = "light", width = 1280, height = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  await ctx.addInitScript(([l, t]) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("bosla.lang", l); localStorage.setItem("bosla.theme", t); sessionStorage.setItem("seeded", "1"); } }, [lang, theme]);
  const page = await ctx.newPage();
  page.errors = [];
  page.on("console", (m) => { if (m.type() === "error") page.errors.push(m.text()); });
  page.on("pageerror", (e) => page.errors.push(String(e)));
  return page;
}
const go = (page, p) => page.goto(BASE + p, { waitUntil: "networkidle" });
const text = (page, sel) => page.locator(sel).first().innerText();

(async () => {
  const browser = await chromium.launch();

  console.log("1. every route × language × viewport × theme");
  for (const [lang, theme, width] of [["ar", "light", 1280], ["en", "dark", 1280], ["ar", "dark", 360], ["en", "light", 360], ["ar", "light", 320], ["en", "light", 768], ["ar", "dark", 1024]]) {
    const page = await newPage(browser, { lang, theme, width, height: 800 });
    for (const r of ROUTES) {
      await go(page, r);
      await page.waitForSelector("h1");
      const tag = `[${lang} ${theme} ${width}] ${r}`;
      const m = await page.evaluate(() => ({
        lang: document.documentElement.lang, dir: document.documentElement.dir, theme: document.documentElement.dataset.theme,
        overflow: document.documentElement.scrollWidth - window.innerWidth, title: document.title,
        h1: document.querySelectorAll("h1").length, skeleton: document.querySelectorAll(".loading").length,
        bg: getComputedStyle(document.body).backgroundColor,
        unlabeled: [...document.querySelectorAll("button, a, input, select")].filter((e) => !(e.textContent || "").trim() && !e.getAttribute("aria-label") && !e.labels?.length && !e.getAttribute("title")).length,
      }));
      check(`${tag} lang/dir`, m.lang === lang && m.dir === (lang === "ar" ? "rtl" : "ltr"));
      check(`${tag} theme`, m.theme === theme && (theme === "dark" ? m.bg === "rgb(14, 14, 13)" : m.bg === "rgb(246, 245, 241)"), m.bg);
      check(`${tag} no horizontal overflow`, m.overflow <= 0, `overflow=${m.overflow}`);
      check(`${tag} one h1 + title`, m.h1 === 1 && m.title.length > 3);
      check(`${tag} finished loading`, m.skeleton === 0);
      check(`${tag} controls labelled`, m.unlabeled === 0, `unlabeled=${m.unlabeled}`);
      check(`${tag} no console errors`, page.errors.length === 0, page.errors.join(" | "));
      page.errors = [];
    }
    await page.context().close();
  }

  console.log("2. where do I stand");
  {
    const page = await newPage(browser, { lang: "en" });
    await go(page, "/standing");
    const score = page.getByLabel("Total score"), pct = page.getByLabel("Percentage");
    check("empty state shown first", await page.locator(".state").count() === 1);
    await score.fill("320");
    check("320 → rank 1", (await text(page, '[data-testid="rank"]')) === "1");
    check("320 → percentile 100", (await text(page, '[data-testid="percentile"]')) === "100.00");
    check("320 → T 72.5", (await text(page, '[data-testid="tscore"]')) === "72.5");
    check("320 → pct field 100", (await pct.inputValue()) === "100");
    await score.fill("286.5");
    check("286.5 → rank 45,677", (await text(page, '[data-testid="rank"]')) === "45,677", await text(page, '[data-testid="rank"]'));
    check("286.5 → percentile 94.84", (await text(page, '[data-testid="percentile"]')) === "94.84");
    check("286.5 → pct field 89.53", (await pct.inputValue()) === "89.53");
    await pct.fill("50");
    check("50% → score field 160", (await score.inputValue()) === "160");
    await score.fill("٢٠٦");
    check("Arabic digits accepted (206 → 64.38%)", (await pct.inputValue()) === "64.38");
    await score.fill("321");
    check("321 → error message", await page.getByText("The total can't exceed 320.").isVisible());
    check("321 → aria-invalid", (await score.getAttribute("aria-invalid")) === "true");
    check("321 → no misleading result", await page.locator('[data-testid="rank"]').count() === 0);
    await score.fill("abc");
    check("abc → error message", await page.getByText("Use digits only").isVisible());
    await score.fill("-5");
    check("-5 → error", await page.locator(".err").count() === 1);
    await score.fill("286.5");
    await page.getByRole("button", { name: "Switch to Arabic" }).click();
    check("language switch keeps input", (await page.getByLabel("المجموع الكلي").inputValue()) === "286.5");
    check("language switch keeps result", (await text(page, '[data-testid="rank"]')) === "45,677");
    check("now RTL", (await page.evaluate(() => document.documentElement.dir)) === "rtl");
    await page.getByRole("button", { name: "عرض جدول البيانات" }).click();
    check("chart data table toggles", await page.locator(".table-wrap.mini tbody tr").count() === 50);
    await page.getByRole("link", { name: "مستكشف التنسيق" }).first().click();
    await page.waitForSelector('[data-testid="outlook-summary"]');
    check("score carries over to admission", (await page.getByLabel("النسبة المئوية", { exact: true }).inputValue()) === "89.53");
    check("no errors", page.errors.length === 0, page.errors.join("|"));
    await page.context().close();
  }

  console.log("3. home quick form");
  {
    const page = await newPage(browser, { lang: "en", width: 390 });
    await go(page, "/");
    await page.getByRole("button", { name: "Show my standing" }).click();
    check("empty submit shows error, stays on home", await page.getByText("Enter a number.").isVisible() && page.url().endsWith("/"));
    await page.getByLabel("Your total out of 320").fill("304");
    await page.getByRole("button", { name: "Show my standing" }).click();
    await page.waitForSelector('[data-testid="rank"]');
    check("navigates to standing with result", page.url().endsWith("/standing") && (await text(page, '[data-testid="rank"]')) === "9,579", await text(page, '[data-testid="rank"]'));
    await page.context().close();
  }

  console.log("4. admission explorer + estimates");
  {
    const page = await newPage(browser, { lang: "en" });
    await go(page, "/admission");
    check("hint before input", await page.getByText("Enter a percentage above").isVisible());
    await page.getByLabel("Percentage", { exact: true }).fill("90");
    const counts = await page.evaluate(() => Object.fromEntries(["likely", "expected", "borderline", "below"].map((k) => [k, document.querySelectorAll(`[data-outlook="${k}"]`).length])));
    check("90% → 11 likely, 1 borderline, 2 below", JSON.stringify(counts) === '{"likely":11,"expected":0,"borderline":1,"below":2}', JSON.stringify(counts));
    await page.getByLabel("Percentage", { exact: true }).fill("88.88");
    check("88.88% → engineering is exactly 'around the estimate'", await page.locator('[data-outlook="expected"]').count() === 1);
    await page.getByLabel("Percentage", { exact: true }).fill("90");
    check("slider follows input", (await page.locator("#pct-range").inputValue()) === "90");
    await page.locator("#pct-range").fill("95.5");
    check("input follows slider", (await page.getByLabel("Percentage", { exact: true }).inputValue()) === "95.5");
    check("95.5% → all 14 likely", await page.locator('[data-outlook="likely"]').count() === 14);
    await page.selectOption("#fac-select", "law");
    check("trend chart updates for Law", (await page.locator(".chart svg").last().getAttribute("aria-label")).includes("63.3"));
    check("faculty table has 14 rows", await page.locator("table.table tbody tr").count() === 14);
    await go(page, "/predictions");
    const med = page.locator('[data-faculty="medicine"]');
    check("medicine central estimate 94.5%", (await med.locator(".fac-num").innerText()).replace(/\s/g, "") === "94.5%");
    await med.locator("summary").click();
    const bd = await med.locator("details").innerText();
    check("breakdown shows trend, pressure, calibration, total", bd.includes("89.64%") && bd.includes("−1.19") && bd.includes("+6.00") && bd.includes("94.45%"), bd.replace(/\n/g, " "));
    check("unofficial banner present", await page.getByText("not official coordination-office results").first().isVisible());
    check("no errors", page.errors.length === 0, page.errors.join("|"));
    await page.context().close();
  }

  console.log("5. student search (demo API)");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bosla-e2e-"));
  {
    const page = await newPage(browser, { lang: "ar" });
    await go(page, "/search");
    check("demo-data notice shown", await page.getByText("بيانات تجريبية").isVisible());
    const q = page.getByLabel("عبارة البحث");
    await q.fill("محمد");
    await page.waitForSelector("table.table tbody tr");
    check("name search returns 25 rows", await page.locator("table.table tbody tr").count() === 25);
    const ranks = await page.locator("table.table tbody tr td:nth-child(6)").allInnerTexts();
    const nums = ranks.map((r) => Number(r.replace(/,/g, ""))).filter((n) => !Number.isNaN(n));
    check("results ordered by rank", nums.every((v, i) => i === 0 || v >= nums[i - 1]));
    await page.getByRole("button", { name: "التالي" }).click();
    await page.waitForFunction(() => document.querySelector(".pager span[aria-live]")?.textContent.includes("2 /"));
    check("pagination moves to page 2", true);
    await q.fill("أحمد محمود");
    await page.waitForTimeout(700);
    const names = await page.locator("table.table tbody tr td:nth-child(2)").allInnerTexts();
    check("multi-word AND with spelling folding", names.length > 0 && names.every((n) => /[أا]حمد/.test(n) && /محمود/.test(n)), names.slice(0, 3).join(" / "));
    const seat = (await page.locator("table.table tbody tr td:nth-child(1)").first().innerText()).trim();
    await q.fill(seat);
    await page.waitForFunction(() => document.querySelectorAll("table.table tbody tr").length === 1);
    check("exact seat lookup returns one row", (await page.locator(".card-head p").last().innerText()).includes("تطابق تام"));
    await page.locator("table.table tbody tr button").first().click();
    await page.waitForSelector('[data-testid="profile"]');
    check("profile opens with seat number", (await text(page, '[data-testid="profile"]')).includes(seat));
    check("profile lists rank neighbours with highlight", await page.locator('[data-testid="profile"] tr.hl').count() === 1);
    await page.getByRole("button", { name: "إغلاق البطاقة" }).click();
    check("profile closes", await page.locator('[data-testid="profile"]').count() === 0);
    await q.fill(seat.slice(0, 3));
    await page.waitForTimeout(700);
    const seats = await page.locator("table.table tbody tr td:nth-child(1)").allInnerTexts();
    check("seat prefix search", seats.length > 0 && seats.every((s) => s.trim().startsWith(seat.slice(0, 3))));
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForTimeout(200);
    check("mobile: results + profile cause no horizontal overflow", (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
    check("mobile: result rows are stacked cards", (await page.evaluate(() => getComputedStyle(document.querySelector("table.stack tbody tr")).display)) === "grid");
    await page.setViewportSize({ width: 1280, height: 900 });
    await q.fill("ضضضضضض");
    await page.waitForSelector('[data-testid="no-results"]');
    check("empty state for no matches", true);
    await q.fill("م");
    await page.waitForTimeout(600);
    check("too-short query explained", await page.getByText("اكتب حرفين عربيين على الأقل").isVisible());
    await page.getByRole("button", { name: "رقم الجلوس", exact: true }).click();
    check("mode toggle pressed state", (await page.getByRole("button", { name: "رقم الجلوس", exact: true }).getAttribute("aria-pressed")) === "true");
    check("no errors", page.errors.length === 0, page.errors.join("|"));
    await page.context().close();
  }

  console.log("6. exports");
  {
    const page = await newPage(browser, { lang: "ar" });
    await go(page, "/top");
    const [x] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Excel" }).click()]);
    const xlsx = path.join(tmp, "top.xlsx"); await x.saveAs(xlsx);
    const [c] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSV" }).click()]);
    const csv = path.join(tmp, "top.csv"); await c.saveAs(csv);
    const csvText = fs.readFileSync(csv, "utf8");
    check("CSV: BOM + header + 100 rows", csvText.charCodeAt(0) === 0xfeff && csvText.trim().split("\r\n").length === 101 && csvText.includes("الترتيب"));
    const py = `import openpyxl,sys,json\nwb=openpyxl.load_workbook(sys.argv[1]);ws=wb.active\nrows=list(ws.iter_rows(values_only=True))\nprint(json.dumps({"n":len(rows),"head":rows[0],"first":rows[1],"rtl":bool(ws.sheet_view.rightToLeft),"title":ws.title},ensure_ascii=False))`;
    const info = JSON.parse(execFileSync("python3", ["-I", "-c", py, xlsx], { encoding: "utf8" }));
    check("XLSX opens in openpyxl: 101 rows, RTL sheet", info.n === 101 && info.rtl === true, JSON.stringify(info).slice(0, 200));
    check("XLSX values are typed numbers and correct", info.first[0] === 1 && info.first[3] === 320 && info.first[4] === 100 && typeof info.first[1] === "string", JSON.stringify(info.first));
    await page.getByLabel("تصفية بالاسم أو رقم الجلوس").fill("2769465");
    check("top-100 filter by seat", await page.locator("table.table tbody tr").count() === 1);
    await page.getByLabel("تصفية بالاسم أو رقم الجلوس").fill("ضضضض");
    check("top-100 filter empty state", await page.getByText("لا أحد من المئة الأوائل").isVisible());
    check("export hidden when nothing to export", await page.getByRole("button", { name: "Excel" }).count() === 0);
    await page.context().close();
  }

  console.log("7. preferences, routing, resilience");
  {
    const page = await newPage(browser, { lang: "en", theme: "light", width: 390, height: 800 });
    await go(page, "/faq");
    await page.getByRole("button", { name: /^Theme/ }).click(); // light → dark
    await page.reload({ waitUntil: "networkidle" });
    check("theme persists across reload", (await page.evaluate(() => document.documentElement.dataset.theme)) === "dark");
    check("deep link survives refresh", (await text(page, "h1")) === "Frequently asked questions");
    const b = page.getByRole("button", { name: "Are the admission cutoffs official?" });
    await b.click();
    check("FAQ accordion opens", (await b.getAttribute("aria-expanded")) === "true" && await page.getByText("They are statistical estimates").isVisible());
    await page.getByRole("button", { name: "Menu" }).click();
    check("mobile drawer opens", await page.locator(".sidebar.open").count() === 1);
    await page.keyboard.press("Escape");
    check("Escape closes drawer", await page.locator(".sidebar.open").count() === 0);
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("link", { name: "Methodology" }).click();
    await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Methodology");
    check("drawer navigation works + closes", (await text(page, "h1")) === "Methodology" && await page.locator(".sidebar.open").count() === 0);
    await go(page, "/no-such-page");
    check("404 state", await page.getByText("Page not found").isVisible());
    await go(page, "/?lang=ar");
    check("?lang=ar overrides", (await page.evaluate(() => document.documentElement.lang)) === "ar");
    await page.keyboard.press("Tab");
    check("skip link is first focus stop", (await page.evaluate(() => document.activeElement.className)) === "skip");
    await page.context().close();

    const p2 = await newPage(browser, { lang: "en" });
    await p2.route("**/api/health", (r) => r.abort());
    await go(p2, "/search");
    check("search shows 'not connected' when API is absent", await p2.locator('[data-testid="search-off"]').count() === 1);
    await p2.context().close();

    const p3 = await newPage(browser, { lang: "en" });
    let failData = true;
    await p3.route("**/data/analytics.json", (r) => (failData ? r.fulfill({ status: 500, body: "x" }) : r.continue()));
    await go(p3, "/overview");
    check("data failure shows error state, not stale numbers", await p3.getByText("We couldn't load the data.").isVisible() && await p3.locator(".stat").count() === 0);
    failData = false;
    await p3.getByRole("button", { name: "Try again" }).click();
    await p3.waitForSelector(".stat");
    check("retry recovers", (await p3.locator(".stat-value").first().innerText()).includes("919,396"));
    await p3.context().close();
  }

  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { fails.forEach((f) => console.log(" -", f)); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
