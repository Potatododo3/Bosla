import { useEffect, useId, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { useScore } from "../data/store.tsx";
import { parseNumberInput, percentageOf, round, scoreOfPercentage, type ScoreError } from "../domain/scores.ts";
import { Icon } from "./ui.tsx";

const show = (v: number) => String(round(v, 2));

/**
 * Linked "total score" and "percentage" inputs bound to the shared score.
 * Text is kept as typed (so a language switch never discards input) and the
 * shared score only updates when the value is valid.
 */
export function ScoreFields({ only, max }: { only?: "pct"; max: number }) {
  const { t, n } = useI18n();
  const { score, setScore } = useScore();
  const [sText, setSText] = useState(() => (score === null ? "" : show(score)));
  const [pText, setPText] = useState(() => (score === null ? "" : show(percentageOf(score, max))));
  const [sErr, setSErr] = useState<ScoreError | null>(null);
  const [pErr, setPErr] = useState<ScoreError | null>(null);
  const ids = { s: useId(), p: useId(), sh: useId(), ph: useId() };

  // Another control (e.g. the slider) changed the shared score.
  useEffect(() => {
    if (score === null) return;
    setSText((cur) => { const p = parseNumberInput(cur, 0, max); return p.ok && Math.abs(p.value - score) < 1e-9 ? cur : show(score); });
    setPText((cur) => { const p = parseNumberInput(cur, 0, 100); return p.ok && Math.abs(scoreOfPercentage(p.value, max) - score) < 1e-9 ? cur : show(percentageOf(score, max)); });
    setSErr(null); setPErr(null);
  }, [score, max]);

  const onScore = (raw: string) => {
    setSText(raw); setPErr(null);
    const p = parseNumberInput(raw, 0, max);
    if (p.ok) { setSErr(null); setPText(show(percentageOf(p.value, max))); setScore(p.value); }
    else { setSErr(p.error === "empty" ? null : p.error); setPText(""); setScore(null); }
  };
  const onPct = (raw: string) => {
    setPText(raw); setSErr(null);
    const p = parseNumberInput(raw, 0, 100);
    if (p.ok) { setPErr(null); const s = scoreOfPercentage(p.value, max); setSText(show(s)); setScore(s); }
    else { setPErr(p.error === "empty" ? null : p.error); setSText(""); setScore(null); }
  };
  const msg = (e: ScoreError, kind: "score" | "pct") =>
    e === "above_max" ? (kind === "score" ? t.standing.errors.above_max_score(n(max)) : t.standing.errors.above_max_pct) : t.standing.errors[e];

  const pct = (
    <div className="field">
      <label htmlFor={ids.p}>{t.standing.inputPct}</label>
      <input id={ids.p} className="input" inputMode="decimal" autoComplete="off" dir="ltr" value={pText} placeholder="89.5"
        aria-invalid={pErr !== null} aria-describedby={ids.ph} onChange={(e) => onPct(e.target.value)} />
      <div id={ids.ph} aria-live="polite">
        {pErr ? <span className="err"><Icon name="alert" size={15} />{msg(pErr, "pct")}</span> : <span className="hint">{t.standing.pctHint}</span>}
      </div>
    </div>
  );
  if (only === "pct") return pct;
  return (
    <div className="inputs">
      <div className="field">
        <label htmlFor={ids.s}>{t.standing.inputScore}</label>
        <input id={ids.s} className="input" inputMode="decimal" autoComplete="off" dir="ltr" value={sText} placeholder="286.5"
          aria-invalid={sErr !== null} aria-describedby={ids.sh} onChange={(e) => onScore(e.target.value)} />
        <div id={ids.sh} aria-live="polite">
          {sErr ? <span className="err"><Icon name="alert" size={15} />{msg(sErr, "score")}</span> : <span className="hint">{t.standing.scoreHint(n(max))}</span>}
        </div>
      </div>
      {pct}
    </div>
  );
}
