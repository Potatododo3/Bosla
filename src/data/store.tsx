import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Analytics, Quality, SearchResponse, StudentProfile } from "./types.ts";
import { buildCohortIndex, type CohortIndex } from "../domain/standing.ts";
import { estimateAll, type FacultyEstimate } from "../domain/admission.ts";
import { ADMISSION_2026 } from "../rules/admission2026.ts";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("json")) throw new ApiError(res.ok ? 502 : res.status, "not_json"); // e.g. SPA fallback HTML
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, typeof body?.detail === "string" ? body.detail : res.statusText);
  return body as T;
}

/* ---- precomputed datasets (static JSON) --------------------------------- */
export interface Core {
  a: Analytics;
  cohort: CohortIndex;
  faculties: FacultyEstimate[];
  pressure: number;
}
let corePromise: Promise<Core> | null = null;
function loadCore(): Promise<Core> {
  corePromise ??= getJson<Analytics>("/data/analytics.json").then((a) => {
    const cohort = buildCohortIndex(a.frequency_table, a.stats_score.mean, a.stats_score.std);
    const faculties = estimateAll(ADMISSION_2026, cohort, a.stats_pct.mean);
    return { a, cohort, faculties, pressure: faculties[0]?.pressure ?? 0 };
  }).catch((e) => { corePromise = null; throw e; });
  return corePromise;
}
let qualityPromise: Promise<Quality> | null = null;
const loadQuality = () => (qualityPromise ??= getJson<Quality>("/data/quality.json").catch((e) => { qualityPromise = null; throw e; }));

export type Async<T> = { state: "loading" } | { state: "error"; retry: () => void } | { state: "ready"; data: T };

function useLoader<T>(loader: () => Promise<T>): Async<T> {
  const [tick, setTick] = useState(0);
  const [s, setS] = useState<{ state: "loading" } | { state: "error" } | { state: "ready"; data: T }>({ state: "loading" });
  useEffect(() => {
    let alive = true;
    setS({ state: "loading" });
    loader().then((data) => alive && setS({ state: "ready", data }), () => alive && setS({ state: "error" }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  const retry = useCallback(() => setTick((t) => t + 1), []);
  return s.state === "error" ? { state: "error", retry } : s;
}
export const useCore = () => useLoader(loadCore);
export const useQuality = () => useLoader(loadQuality);

/* ---- search API (optional backend) -------------------------------------- */
const API = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";
export type ApiHealth = { state: "checking" } | { state: "off" } | { state: "on"; demo: boolean; students: number };
let healthPromise: Promise<ApiHealth> | null = null;
export function checkHealth(): Promise<ApiHealth> {
  healthPromise ??= getJson<{ status: string; demo?: boolean; students?: number }>(`${API}/api/health`)
    .then((h): ApiHealth => (h.status === "ok" ? { state: "on", demo: !!h.demo, students: h.students ?? 0 } : { state: "off" }))
    .catch((): ApiHealth => ({ state: "off" }));
  return healthPromise;
}
export const api = {
  search: (q: string, by: string, page: number, signal?: AbortSignal) =>
    getJson<SearchResponse>(`${API}/api/search?q=${encodeURIComponent(q)}&by=${by}&page=${page}&size=25`, signal),
  student: (seat: number, signal?: AbortSignal) => getJson<StudentProfile>(`${API}/api/student/${seat}`, signal),
};

/* ---- the student's own score (memory only — never persisted) ------------ */
interface ScoreCtx { score: number | null; setScore: (s: number | null) => void }
const Score = createContext<ScoreCtx | null>(null);
export function ScoreProvider({ children }: { children: ReactNode }) {
  const [score, setScore] = useState<number | null>(null);
  const v = useMemo(() => ({ score, setScore }), [score]);
  return <Score.Provider value={v}>{children}</Score.Provider>;
}
export function useScore(): ScoreCtx {
  const v = useContext(Score);
  if (!v) throw new Error("useScore outside provider");
  return v;
}
