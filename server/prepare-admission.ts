/**
 * Validates config/admission.json and publishes it to public/data/admission.json.
 * Runs automatically before `npm run dev` and `npm run build`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateAdmission } from "../src/domain/admissionConfig.ts";

const src = resolve("config/admission.json"), out = resolve("public/data/admission.json");
const stop = (lines: string[]): never => { console.error(`\n✗ config/admission.json has a problem:\n${lines.map((l) => `   • ${l}`).join("\n")}\n`); process.exit(1); };

if (!existsSync(src)) stop(["The file does not exist."]);
let raw: unknown;
try { raw = JSON.parse(readFileSync(src, "utf8")); } catch (e) { stop([`It is not valid JSON: ${(e as Error).message}`]); }
const v = validateAdmission(raw);
if (!v.ok) stop(v.errors);
else {
  mkdirSync(resolve("public/data"), { recursive: true });
  writeFileSync(out, JSON.stringify(v.config));
  const c = v.config;
  let resultsYear: number | null = null;
  try { resultsYear = JSON.parse(readFileSync(resolve("public/data/analytics.json"), "utf8")).meta?.year ?? null; } catch { /* statistics not built yet */ }
  if (!c.published) console.log(`[admission] ${c.year}: not published yet — admission pages will say the official minimums are not out.`);
  else console.log(`[admission] ${c.year}: ${c.faculties.length} official minimums (${c.label_en}).`);
  if (resultsYear !== null && resultsYear !== c.year) console.log(`⚠ [admission] the figures are for ${c.year} but the results are for ${resultsYear}; they will NOT be shown until "year" matches.`);
}
