import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import en, { type Dict } from "./en.ts";
import ar from "./ar.ts";

export type Lang = "ar" | "en";
const DICTS: Record<Lang, Dict> = { ar, en };

/**
 * Digit policy: Western digits (0–9) in both languages, so seat numbers,
 * scores and percentages always read identically. Grouping follows locale.
 */
const LOCALE: Record<Lang, string> = { ar: "ar-EG-u-nu-latn", en: "en-US" };

export interface I18n {
  lang: Lang;
  dir: "rtl" | "ltr";
  t: Dict;
  setLang: (l: Lang) => void;
  /** integer with grouping */
  n: (v: number | null | undefined) => string;
  /** fixed decimals */
  f: (v: number | null | undefined, digits?: number) => string;
  /** at most `digits` decimals (trailing zeros dropped) */
  g: (v: number | null | undefined, digits?: number) => string;
  compact: (v: number | null | undefined) => string;
}

const Ctx = createContext<I18n | null>(null);

function initialLang(): Lang {
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "ar" || q === "en") return q;
    const s = localStorage.getItem("bosla.lang");
    if (s === "ar" || s === "en") return s;
  } catch { /* storage unavailable */ }
  return "ar";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("bosla.lang", l); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const value = useMemo<I18n>(() => {
    const loc = LOCALE[lang];
    const dash = "—";
    const bad = (v: number | null | undefined): v is null | undefined => v === null || v === undefined || Number.isNaN(v);
    const int = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 });
    const cmp = new Intl.NumberFormat(loc, { notation: "compact", maximumFractionDigits: 1 });
    const fixed = new Map<number, Intl.NumberFormat>();
    const loose = new Map<number, Intl.NumberFormat>();
    const get = (m: Map<number, Intl.NumberFormat>, d: number, min: number) => {
      let x = m.get(d);
      if (!x) { x = new Intl.NumberFormat(loc, { minimumFractionDigits: min, maximumFractionDigits: d }); m.set(d, x); }
      return x;
    };
    return {
      lang, dir: lang === "ar" ? "rtl" : "ltr", t: DICTS[lang], setLang,
      n: (v) => (bad(v) ? dash : int.format(v)),
      f: (v, d = 1) => (bad(v) ? dash : get(fixed, d, d).format(v)),
      g: (v, d = 2) => (bad(v) ? dash : get(loose, d, 0).format(v)),
      compact: (v) => (bad(v) ? dash : cmp.format(v)),
    };
  }, [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside provider");
  return v;
}
