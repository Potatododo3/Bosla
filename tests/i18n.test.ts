import { describe, expect, it } from "vitest";
import en from "../src/i18n/en.ts";
import ar from "../src/i18n/ar.ts";

/** Flatten to "a.b.c" → kind, so the two dictionaries can be compared structurally. */
function shape(o: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (Array.isArray(o)) { out[prefix] = `array(${o.length})`; o.forEach((v, i) => shape(v, `${prefix}[${i}]`, out)); }
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) shape(v, prefix ? `${prefix}.${k}` : k, out);
  else out[prefix] = typeof o;
  return out;
}

describe("translations", () => {
  it("Arabic and English have identical keys, types and list lengths", () => {
    expect(shape(ar)).toEqual(shape(en));
  });
  it("no empty strings; Arabic strings actually contain Arabic", () => {
    const walk = (o: unknown, path: string, lang: "ar" | "en") => {
      if (typeof o === "string") {
        if (path !== "search.mode.empty") expect(o.trim(), path).not.toBe("");
        if (lang === "ar" && !/^(ui\.(language|exportCsv|exportXlsx)|band\.b\d+_\d+)$/.test(path) && path !== "search.mode.empty") expect(/[؀-ۿ]/.test(o), `${path}: ${o}`).toBe(true);
      } else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k, lang);
    };
    walk(en, "", "en"); walk(ar, "", "ar");
  });
  it("interpolating functions use every argument in both languages", () => {
    const probe = (o: unknown, path: string) => {
      if (typeof o === "function") {
        const args = Array.from({ length: o.length }, (_, i) => `⟦${i}⟧`);
        const s = (o as (...a: string[]) => string)(...args);
        args.forEach((a) => expect(s.includes(a), `${path} drops arg ${a}`).toBe(true));
      } else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) probe(v, path ? `${path}.${k}` : k);
    };
    probe(en, "en"); probe(ar, "ar");
  });
});
