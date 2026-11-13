/**
 * Production / preview server: serves the built app (dist/) and the search API.
 *
 *   npm start                         → app + API on :8787 with SYNTHETIC demo data
 *   STUDENTS_CSV=/path/file.csv npm start   → real dataset (you must have the right to publish it)
 *   SEARCH_API=off npm start          → app only; the search page shows "not connected"
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDataset, loadCsv, type Dataset } from "./dataset.ts";
import { synthesize } from "./synth.ts";
import { handleApi } from "./api.ts";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(root, "dist");
const apiOnly = process.argv.includes("--api-only");
const port = Number(process.env.PORT ?? 8787);

// The statistics file tells us which year and maximum total the site is showing.
const analyticsPath = join(root, "public/data/analytics.json");
const published: { meta?: { year?: number; max_score?: number }; cohort?: { sitters?: number } } = existsSync(analyticsPath) ? JSON.parse(readFileSync(analyticsPath, "utf8")) : {};
const maxScore = published.meta?.max_score ?? 320, year = published.meta?.year ?? null;

let ds: Dataset | null = null;
if (process.env.SEARCH_API !== "off") {
  const csv = process.env.STUDENTS_CSV;
  const t0 = Date.now();
  ds = csv
    ? buildDataset(loadCsv(csv), false, maxScore)
    : buildDataset(synthesize(Number(process.env.DEMO_STUDENTS ?? 5000), analyticsPath), true, maxScore);
  console.log(`[api] ${ds.students.length.toLocaleString()} students (${ds.rankedCount.toLocaleString()} ranked) loaded in ${Date.now() - t0} ms — ${ds.demo ? "SYNTHETIC DEMO DATA" : csv}`);
  const expected = published.cohort?.sitters;
  if (!ds.demo && expected !== undefined && expected !== ds.rankedCount) {
    console.warn(`\n⚠ The site's statistics (${year ?? "?"}) were built from ${expected.toLocaleString()} ranked students, but this CSV has ${ds.rankedCount.toLocaleString()}.\n  Search results and the statistics pages will disagree. Rebuild the statistics from this file:\n    npm run build-data -- --csv ${csv} --year <yyyy>   then   npm run build\n`);
  }
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};
const SECURITY = {
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
};

// Tiny fixed-window rate limit for the API (per IP).
const hits = new Map<string, { n: number; t: number }>();
function limited(ip: string): boolean {
  const now = Date.now(), h = hits.get(ip);
  if (!h || now - h.t > 60_000) { hits.set(ip, { n: 1, t: now }); if (hits.size > 50_000) hits.clear(); return false; }
  return ++h.n > 240;
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const send = (status: number, body: string, headers: Record<string, string>) => { res.writeHead(status, { ...SECURITY, ...headers }); res.end(body); };
  if (req.method !== "GET" && req.method !== "HEAD") return send(405, '{"detail":"Method not allowed"}', { "Content-Type": MIME[".json"]! });

  if (url.pathname.startsWith("/api/")) {
    const json = { "Content-Type": MIME[".json"]!, "Cache-Control": "no-store" };
    if (!ds) return send(503, '{"detail":"Search API is disabled on this deployment"}', json);
    if (limited(req.socket.remoteAddress ?? "?")) return send(429, '{"detail":"Too many requests"}', json);
    try {
      const r = handleApi(ds, url.pathname, url.searchParams, { year });
      return send(r.status, JSON.stringify(r.body), json);
    } catch (e) {
      console.error(e);
      return send(500, '{"detail":"internal_error"}', json);
    }
  }
  if (apiOnly) return send(404, '{"detail":"Not found"}', { "Content-Type": MIME[".json"]! });

  let file = normalize(join(dist, decodeURIComponent(url.pathname)));
  if (!file.startsWith(dist)) return send(403, "Forbidden", {});
  const isAsset = /^\/(assets|data)\//.test(url.pathname) || extname(url.pathname) !== "";
  if (!existsSync(file) || statSync(file).isDirectory()) {
    if (isAsset) return send(404, "Not found", { "Content-Type": "text/plain" });
    file = join(dist, "index.html"); // SPA fallback for client routes
  }
  if (!existsSync(file)) return send(500, "Build missing — run `npm run build` first.", { "Content-Type": "text/plain" });
  res.writeHead(200, {
    ...SECURITY,
    "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
    "Cache-Control": url.pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`[bosla] http://127.0.0.1:${port}${apiOnly ? " (API only)" : ""}`));
