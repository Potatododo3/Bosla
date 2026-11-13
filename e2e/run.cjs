/* End-to-end checks against a running server (npm run build && npm start).
 *   BASE=http://127.0.0.1:8787 node e2e/run.cjs
 * Uses the Playwright library directly; exits non-zero on any failure. */
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const BASE = process.env.BASE || "http://127.0.0.1:8787";
const ROUTES = ["/", "/standing", "/admission", "/minimums", "/search", "/overview", "/distribution", "/top", "/stats", "/quality", "/about", "/methodology", "/faq"];
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

// A published admission file (invented numbers) for tests; the shipped file is unpublished.
const PUBLISHED = {
  year: 2026, published: true, label_ar: "الحد الأدنى للمرحلة الأولى (اختبار)", label_en: "First-phase minimums (test data)", source: "https://example.org/tansiq", updated: "2026-08-01",
  faculties: [
    { key: "medicine", name_ar: "الطب البشري", name_en: "Medicine", track: "science", cutoff: 95 },
    { key: "pharmacy", name_ar: "الصيدلة", name_en: "Pharmacy", track: "science", cutoff: 90.5 },
    { key: "engineering", name_ar: "الهندسة", name_en: "Engineering", track: "math", cutoff: 90 },
    { key: "commerce", name_ar: "التجارة", name_en: "Commerce", track: "literary", cutoff: 60 },
  ],
};
const publish = (page, cfg = PUBLISHED) => page.route("**/data/admission.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(cfg) }));
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
    await publish(page);
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

  console.log("4. admission: official minimums");
  {
    // 4a. as shipped: nothing published → no admission number anywhere
    const page = await newPage(browser, { lang: "en" });
    for (const r of ["/admission", "/minimums"]) {
      await go(page, r);
      check(`${r}: 'not published yet' state`, await page.getByRole("heading", { name: "Official minimums for 2026 have not been published yet" }).isVisible());
      check(`${r}: no percentages or tables shown`, await page.locator("table, .fac-num, .outlook, #pct-range").count() === 0);
    }
    await go(page, "/predictions");
    check("old /predictions link redirects to /minimums", page.url().endsWith("/minimums"));
    await go(page, "/");
    check("home card says not published", await page.locator('[data-testid="admission-pending"]').count() === 1);
    await go(page, "/standing");
    await page.getByLabel("Total score").fill("300");
    check("standing card says not published, no outlook list", await page.locator('[data-testid="admission-pending"]').count() === 1 && await page.locator(".outlook").count() === 0);
    check("no errors", page.errors.length === 0, page.errors.join("|"));
    await page.context().close();

    // 4b. published for the right year
    const p2 = await newPage(browser, { lang: "en" });
    await publish(p2);
    await go(p2, "/admission");
    check("label + source link shown", await p2.getByText("First-phase minimums (test data)").isVisible() && (await p2.getByRole("link", { name: "Official source" }).getAttribute("href")) === "https://example.org/tansiq");
    check("hint before input", await p2.getByText("Enter a percentage above").isVisible());
    await p2.getByLabel("Percentage", { exact: true }).fill("90");
    const counts = await p2.evaluate(() => Object.fromEntries(["above", "close", "below"].map((k) => [k, document.querySelectorAll(`[data-outlook="${k}"]`).length])));
    check("90% → meets 2, within a point 1, below 1", JSON.stringify(counts) === '{"above":2,"close":1,"below":1}', JSON.stringify(counts));
    check("summary sentence", (await text(p2, '[data-testid="outlook-summary"]')) === "Your percentage meets the official minimum for 2 of 4 faculties.");
    check("slider follows input", (await p2.locator("#pct-range").inputValue()) === "90");
    await p2.locator("#pct-range").fill("95.5");
    check("input follows slider", (await p2.getByLabel("Percentage", { exact: true }).inputValue()) === "95.5");
    check("95.5% → meets all 4", await p2.locator('[data-outlook="above"]').count() === 4);
    const rows = await p2.locator("table.table tbody tr").allInnerTexts();
    check("table sorted by minimum, 4 rows", rows.length === 4 && rows[0].includes("Medicine") && rows[3].includes("Commerce"));
    check("Engineering 90%: total needed 288 / 320 and 42,889 students at or above", rows[2].includes("288.0 / 320") && rows[2].includes("42,889") && rows[2].includes("4.85%"), rows[2]);
    await go(p2, "/minimums");
    const med = p2.locator('[data-faculty="medicine"]');
    check("minimums page: Medicine 95.00%, 304 / 320, 10,327 students", (await med.innerText()).replace(/\s+/g, " ").includes("95.00%") && (await med.innerText()).includes("304.0 / 320") && (await med.innerText()).includes("10,327"), (await med.innerText()).replace(/\s+/g, " "));
    check("official badge shown", await p2.getByText("Official minimums", { exact: true }).first().isVisible());
    await go(p2, "/");
    check("home lists highest official minimums", (await p2.locator(".barlist li").first().innerText()).includes("Medicine"));
    await p2.getByRole("button", { name: "Switch to Arabic" }).click();
    check("faculty names follow the language", (await p2.locator(".barlist li").first().innerText()).includes("الطب البشري"));
    check("no errors", p2.errors.length === 0, p2.errors.join("|"));
    await p2.context().close();

    // 4c. file for another year → refused
    const p3 = await newPage(browser, { lang: "en" });
    await publish(p3, { ...PUBLISHED, year: 2025 });
    await go(p3, "/minimums");
    check("wrong-year file is not shown", await p3.getByText("The admission figures on file are for 2025, not 2026, so they are not shown.").isVisible() && await p3.locator(".fac-num").count() === 0);
    // 4d. malformed file → treated as not published, page still works
    const p4 = await newPage(browser, { lang: "en" });
    await publish(p4, { year: 2026, published: true, faculties: [{ key: "x", cutoff: 150 }] });
    await go(p4, "/admission");
    check("malformed file falls back to 'not published'", await p4.locator('[data-testid="admission-pending"]').count() === 1 && p4.errors.length === 0, p4.errors.join("|"));
    await p3.context().close(); await p4.context().close();
  }

  console.log("4e. another results year and maximum total");
  {
    const page = await newPage(browser, { lang: "en" });
    const real = await (await fetch(BASE + "/data/analytics.json")).json();
    real.meta = { ...real.meta, year: 2027, max_score: 400 };
    real.frequency_table = real.frequency_table.map((r) => ({ ...r, score: r.score * 1.25 }));
    real.stats_score = { ...real.stats_score, mean: real.stats_score.mean * 1.25, std: real.stats_score.std * 1.25, mode: real.stats_score.mode * 1.25 };
    await page.route("**/data/analytics.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(real) }));
    await go(page, "/");
    check("home title uses the data's year", (await text(page, "h1")).includes("2027") && !(await page.locator("#content").innerText()).includes("2026"));
    check("quick form uses the data's maximum", await page.getByLabel("Your total out of 400").count() === 1);
    await go(page, "/standing");
    const score = page.getByLabel("Total score");
    await score.fill("400");
    check("400/400 → 100%, rank 1", (await page.getByLabel("Percentage").inputValue()) === "100" && (await text(page, '[data-testid="rank"]')) === "1");
    await score.fill("358");
    check("358/400 = 89.5% ranks like 286.4/320", (await page.getByLabel("Percentage").inputValue()) === "89.5");
    await score.fill("401");
    check("401 rejected with the right maximum", await page.getByText("The total can't exceed 400.").isVisible());
    await go(page, "/faq");
    check("FAQ wording follows year and maximum", await page.getByRole("button", { name: "Why is the total out of 400?" }).count() === 1 && await page.getByRole("button", { name: "Which year am I looking at?" }).count() === 1);
    await go(page, "/admission");
    check("2026 admission file refused for 2027 results", await page.getByRole("heading", { name: "Official minimums for 2027 have not been published yet" }).isVisible() && await page.getByText("are for 2026, not 2027").isVisible());
    await go(page, "/about");
    check("About shows what data is loaded", (await text(page, '[data-testid="about-data"]')).startsWith("2027 ·"));
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
    const b = page.getByRole("button", { name: "Are the admission minimums official?" });
    await b.click();
    check("FAQ accordion opens", (await b.getAttribute("aria-expanded")) === "true" && await page.getByText("They are the ministry's published figures").isVisible());
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
