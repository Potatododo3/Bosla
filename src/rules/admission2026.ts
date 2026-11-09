/**
 * Rule set: 2026 admission-cutoff ESTIMATION model (unofficial).
 *
 * These parameters reproduce the reference project's published model so that
 * the numbers stay comparable. They are NOT official coordination-office
 * (tansiq) rules. The historical series are approximate anchors, and the
 * dataset has no academic track, so every output is a directional estimate.
 */
export type FacultyCategory = "science" | "math" | "literary" | "mixed";

export interface FacultyAnchor {
  key: string;
  category: FacultyCategory;
  /** year → approximate minimum admission percentage */
  history: Readonly<Record<number, number>>;
}

export interface AdmissionRuleSet {
  id: string;
  academicYear: string;
  version: number;
  status: "unofficial-estimate";
  targetYear: number;
  baselineMeanPct: number;
  pressureK: number;
  pressureClip: number;
  sigmaFloor: number;
  cutoffMin: number;
  cutoffMax: number;
  /** Uniform manual uplift applied to every faculty in the reference deployment. */
  calibrationPP: number;
  scenarioZ: number;
  ciZ: number;
  sourceReferences: string[];
  faculties: FacultyAnchor[];
}

const h = (a: number | null, b: number, c: number, d: number, e: number): Record<number, number> =>
  a === null ? { 2022: b, 2023: c, 2024: d, 2025: e } : { 2021: a, 2022: b, 2023: c, 2024: d, 2025: e };

export const ADMISSION_2026: AdmissionRuleSet = {
  id: "admission-estimate-2026",
  academicYear: "2025/2026",
  version: 1,
  status: "unofficial-estimate",
  targetYear: 2026,
  baselineMeanPct: 68,
  pressureK: 0.35,
  pressureClip: 3,
  sigmaFloor: 0.8,
  cutoffMin: 30,
  cutoffMax: 99.5,
  calibrationPP: 6,
  scenarioZ: 0.9,
  ciZ: 1.96,
  sourceReferences: ["https://github.com/omarhamed888/Thanaweya-2026 (pipeline/predictions.py, docs/METHODOLOGY.md)"],
  faculties: [
    { key: "medicine", category: "science", history: h(91.0, 90.2, 88.6, 89.4, 90.8) },
    { key: "dentistry", category: "science", history: h(89.5, 88.4, 86.9, 87.8, 89.1) },
    { key: "pharmacy", category: "science", history: h(88.0, 86.7, 85.0, 85.9, 87.2) },
    { key: "vet", category: "science", history: h(83.0, 81.6, 79.8, 80.7, 82.4) },
    { key: "engineering", category: "math", history: h(86.5, 85.0, 83.2, 84.1, 85.6) },
    { key: "computer_science", category: "math", history: h(83.0, 81.4, 79.9, 81.0, 82.6) },
    { key: "ai", category: "math", history: h(null, 82.0, 80.1, 81.2, 83.0) },
    { key: "nursing", category: "science", history: h(79.0, 77.5, 76.0, 77.1, 78.4) },
    { key: "science", category: "science", history: h(74.0, 72.3, 70.5, 71.4, 73.0) },
    { key: "agriculture", category: "science", history: h(66.0, 64.2, 62.5, 63.6, 65.1) },
    { key: "commerce", category: "literary", history: h(62.0, 60.4, 58.8, 59.7, 61.2) },
    { key: "law", category: "literary", history: h(61.0, 59.3, 57.6, 58.5, 60.1) },
    { key: "arts", category: "literary", history: h(64.0, 62.5, 60.9, 61.8, 63.3) },
    { key: "education", category: "mixed", history: h(68.0, 66.4, 64.8, 65.7, 67.2) },
  ],
};
