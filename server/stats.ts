// DRAFT — part of docs/NEXT-YEAR-PLAN.md step 2. Not wired into the app and not yet tested.
/**
 * Numerical routines used by the data build. Each one reproduces the
 * definition used by numpy / scipy in the reference pipeline, so a rebuild
 * from the raw results gives the same statistics.
 */

/* ---------------- rounding ---------------- */

/** numpy `np.round` / pandas `.round`: rint(x·10^d) / 10^d, ties to even. */
export function npRound(x: number, d: number): number {
  if (!Number.isFinite(x)) return x;
  const p = 10 ** d, y = x * p, f = Math.floor(y), diff = y - f;
  const r = diff > 0.5 ? f + 1 : diff < 0.5 ? f : f % 2 === 0 ? f : f + 1;
  return r / p;
}

/** Python's built-in `round(x, d)`: correctly rounded, exact ties to even. */
export function pyRound(x: number, d: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const neg = x < 0;
  const [ip, fp = ""] = Math.abs(x).toFixed(100).split(".");
  const keep = fp.slice(0, d), rest = fp.slice(d);
  const last = Number((d > 0 ? keep[d - 1] : ip![ip!.length - 1]) ?? "0");
  const up = rest[0]! > "5" || (rest[0] === "5" && (/[1-9]/.test(rest.slice(1)) || last % 2 === 1));
  let digits = BigInt(ip! + keep) + (up ? 1n : 0n);
  let s = digits.toString().padStart(d + 1, "0");
  s = d > 0 ? `${s.slice(0, s.length - d)}.${s.slice(s.length - d)}` : s;
  const v = Number(s);
  return neg ? -v : v;
}

/* ---------------- sums and moments ---------------- */

/** Neumaier-compensated sum (close to numpy's pairwise sum). */
export function sum(a: ArrayLike<number>): number {
  let s = 0, c = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i]!, t = s + v;
    c += Math.abs(s) >= Math.abs(v) ? s - t + v : v - t + s;
    s = t;
  }
  return s + c;
}
export const mean = (a: ArrayLike<number>) => sum(a) / a.length;

/** Central moments m2, m3, m4 (population, i.e. biased). */
export function moments(a: ArrayLike<number>): { mean: number; m2: number; m3: number; m4: number } {
  const mu = mean(a);
  const d2 = new Float64Array(a.length), d3 = new Float64Array(a.length), d4 = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) { const d = a[i]! - mu, q = d * d; d2[i] = q; d3[i] = q * d; d4[i] = q * q; }
  return { mean: mu, m2: sum(d2) / a.length, m3: sum(d3) / a.length, m4: sum(d4) / a.length };
}
export const variance = (a: ArrayLike<number>, ddof: number) => (moments(a).m2 * a.length) / (a.length - ddof);
export const std = (a: ArrayLike<number>, ddof: number) => Math.sqrt(variance(a, ddof));

/* ---------------- order statistics ---------------- */

/** numpy `np.percentile(sorted, p)` with the default "linear" method. */
export function percentile(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  const q = p / 100;
  const vi = n * q + (1 + q * (1 - 1 - 1)) - 1; // alpha = beta = 1
  const lo = Math.max(0, Math.min(n - 1, Math.floor(vi)));
  const hi = Math.min(n - 1, lo + 1);
  const t = vi - lo, a = sorted[lo]!, b = sorted[hi]!;
  if (a === b) return a;
  const diff = b - a;
  return t >= 0.5 ? b - diff * (1 - t) : a + diff * t;
}

/** Number of elements ≤ x in an ascending array (searchsorted side="right"). */
export function countLE(sorted: ArrayLike<number>, x: number): number {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m]! <= x) lo = m + 1; else hi = m; }
  return lo;
}
/** Number of elements < x (searchsorted side="left"). */
export function countLT(sorted: ArrayLike<number>, x: number): number {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m]! < x) lo = m + 1; else hi = m; }
  return lo;
}

/** numpy `np.linspace(a, b, n)`. */
export function linspace(a: number, b: number, n: number): number[] {
  const step = (b - a) / (n - 1);
  const out = Array.from({ length: n }, (_, i) => a + i * step);
  out[n - 1] = b;
  return out;
}

/** numpy `np.histogram(v, bins, range=(lo, hi))`; last bin includes `hi`. */
export function histogram(v: ArrayLike<number>, bins: number, lo: number, hi: number): { edges: number[]; counts: number[] } {
  const edges = linspace(lo, hi, bins + 1);
  const counts = new Array<number>(bins).fill(0);
  const norm = bins / (hi - lo);
  for (let i = 0; i < v.length; i++) {
    const x = v[i]!;
    if (x < lo || x > hi) continue;
    let k = Math.floor((x - lo) * norm);
    if (k >= bins) k = bins - 1;
    if (x < edges[k]!) k--;
    else if (k < bins - 1 && x >= edges[k + 1]!) k++;
    counts[k]!++;
  }
  return { edges, counts };
}

/** Distinct values (ascending) with their counts, from an ascending array. */
export function groups(sorted: ArrayLike<number>): { x: number[]; w: number[] } {
  const x: number[] = [], w: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i]!;
    if (x.length && x[x.length - 1] === v) w[w.length - 1]!++;
    else { x.push(v); w.push(1); }
  }
  return { x, w };
}

/* ---------------- normal distribution ---------------- */

const LOG_SQRT_2PI = 0.5 * Math.log(2 * Math.PI);
const phi = (x: number) => Math.exp(-0.5 * x * x - LOG_SQRT_2PI);

/** Upper tail Q(x) = 1 − Φ(x), accurate to ~1e-15 relative. */
function upperTail(x: number): number {
  if (x < 0) return 1 - upperTail(-x);
  if (x <= 3) {
    // Φ(x) − ½ = φ(x)·(x + x³/3 + x⁵/15 + …)
    let term = x, s = x;
    for (let k = 1; k < 200; k++) { term *= (x * x) / (2 * k + 1); s += term; if (term < s * 1e-17) break; }
    return 0.5 - phi(x) * s;
  }
  return Math.exp(logUpperTailLarge(x));
}
/** log Q(x) for x > 3 via the Laplace continued fraction. */
function logUpperTailLarge(x: number): number {
  let f = x;
  for (let k = 120; k >= 1; k--) f = x + k / f;
  return -0.5 * x * x - LOG_SQRT_2PI - Math.log(f);
}
export const normCdf = (x: number) => (x < 0 ? upperTail(-x) : 1 - upperTail(x));
export const normSf = (x: number) => upperTail(x);
export function normLogCdf(x: number): number {
  if (x < -3) return logUpperTailLarge(-x);
  return Math.log(normCdf(x));
}
export const normLogSf = (x: number) => normLogCdf(-x);

/** Inverse of Φ: Acklam's approximation refined with Halley steps. */
export function normPpf(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  let x: number;
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  } else if (p > 1 - 0.02425) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  } else {
    const q = p - 0.5, r = q * q;
    x = ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  }
  for (let i = 0; i < 2; i++) {
    const e = normCdf(x) - p;
    const u = e * Math.sqrt(2 * Math.PI) * Math.exp(0.5 * x * x);
    x = x - u / (1 + 0.5 * x * u);
  }
  return x;
}

/* ---------------- kernel density (scipy gaussian_kde, Scott's rule) ---------------- */

/**
 * Gaussian KDE evaluated on `grid` for the data given as distinct values + counts.
 * Bandwidth = std(ddof=1) · n_eff^(-1/5), Scott's rule as in scipy. `nEff` lets the
 * caller use the same bandwidth the reference used for its random subsample.
 */
export function kde(x: number[], w: number[], grid: number[], nEff: number): number[] {
  const n = w.reduce((a, b) => a + b, 0);
  let mu = 0;
  for (let i = 0; i < x.length; i++) mu += x[i]! * w[i]!;
  mu /= n;
  let ss = 0;
  for (let i = 0; i < x.length; i++) ss += w[i]! * (x[i]! - mu) ** 2;
  const sd = Math.sqrt(ss / (n - 1));
  const h = sd * nEff ** -0.2;
  const norm = 1 / (n * h * Math.sqrt(2 * Math.PI));
  return grid.map((g) => {
    let s = 0;
    for (let i = 0; i < x.length; i++) { const z = (g - x[i]!) / h; s += w[i]! * Math.exp(-0.5 * z * z); }
    return s * norm;
  });
}

/* ---------------- normality tests ---------------- */

function biasedShape(a: ArrayLike<number>) {
  const { m2, m3, m4 } = moments(a);
  return { skew: m3 / m2 ** 1.5, kurt: m4 / (m2 * m2) - 3 };
}

/** scipy.stats.normaltest (D'Agostino–Pearson K²). */
export function dagostinoK2(a: ArrayLike<number>): { statistic: number; p_value: number } {
  const n = a.length;
  const { skew, kurt } = biasedShape(a);
  // skewtest
  let y = skew * Math.sqrt(((n + 1) * (n + 3)) / (6 * (n - 2)));
  const beta2 = (3 * (n * n + 27 * n - 70) * (n + 1) * (n + 3)) / ((n - 2) * (n + 5) * (n + 7) * (n + 9));
  const W2 = -1 + Math.sqrt(2 * (beta2 - 1));
  const delta = 1 / Math.sqrt(0.5 * Math.log(W2));
  const alpha = Math.sqrt(2 / (W2 - 1));
  if (y === 0) y = 1;
  const zs = delta * Math.log(y / alpha + Math.sqrt((y / alpha) ** 2 + 1));
  // kurtosistest
  const b2 = kurt + 3;
  const E = (3 * (n - 1)) / (n + 1);
  const varb2 = (24 * n * (n - 2) * (n - 3)) / ((n + 1) * (n + 1) * (n + 3) * (n + 5));
  const xk = (b2 - E) / Math.sqrt(varb2);
  const sb1 = ((6 * (n * n - 5 * n + 2)) / ((n + 7) * (n + 9))) * Math.sqrt((6 * (n + 3) * (n + 5)) / (n * (n - 2) * (n - 3)));
  const A = 6 + (8 / sb1) * (2 / sb1 + Math.sqrt(1 + 4 / (sb1 * sb1)));
  const t1 = 1 - 2 / (9 * A);
  const den = 1 + xk * Math.sqrt(2 / (A - 4));
  const t2 = Math.sign(den) * Math.cbrt((1 - 2 / A) / Math.abs(den));
  const zk = (t1 - t2) / Math.sqrt(2 / (9 * A));
  const k2 = zs * zs + zk * zk;
  return { statistic: k2, p_value: Math.exp(-k2 / 2) };
}

/** scipy.stats.jarque_bera. */
export function jarqueBera(a: ArrayLike<number>): { statistic: number; p_value: number } {
  const { skew, kurt } = biasedShape(a);
  const jb = (a.length / 6) * (skew * skew + (kurt * kurt) / 4);
  return { statistic: jb, p_value: Math.exp(-jb / 2) };
}

/** scipy.stats.anderson(x, dist="norm"). */
export function andersonNorm(a: ArrayLike<number>): { statistic: number; critical_values: number[]; significance_levels: number[] } {
  const y = Float64Array.from(a).sort();
  const n = y.length, mu = mean(y), s = std(y, 1);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const lc = normLogCdf((y[i]! - mu) / s), ls = normLogSf((y[n - 1 - i]! - mu) / s);
    acc += ((2 * (i + 1) - 1) / n) * (lc + ls);
  }
  const avals = [0.576, 0.656, 0.787, 0.918, 1.092];
  return {
    statistic: -n - acc,
    critical_values: avals.map((v) => npRound(v / (1 + 4 / n - 25 / n / n), 3)),
    significance_levels: [15, 10, 5, 2.5, 1],
  };
}

/** Shapiro–Wilk W and p-value (Royston 1995, algorithm AS R94, as used by scipy). n in [3, 5000]. */
export function shapiroWilk(data: ArrayLike<number>): { statistic: number; p_value: number } {
  const x = Float64Array.from(data).sort();
  const n = x.length;
  if (n < 3) throw new Error("shapiroWilk needs n ≥ 3");
  const poly = (cc: number[], v: number) => { let r = 0; for (let i = cc.length - 1; i >= 0; i--) r = r * v + cc[i]!; return r; };
  const c1 = [0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056];
  const c2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633];
  const c3 = [0.544, -0.39978, 0.025054, -6.714e-4];
  const c4 = [1.3822, -0.77857, 0.062767, -0.0020322];
  const c5 = [-1.5861, -0.31082, -0.083751, 0.0038915];
  const c6 = [-0.4803, -0.082676, 0.0030302];
  const g = [-2.273, 0.459];
  const nn2 = Math.floor(n / 2);
  const a = new Float64Array(nn2);
  if (n === 3) a[0] = Math.SQRT1_2;
  else {
    const m = new Float64Array(nn2);
    let summ2 = 0;
    for (let i = 0; i < nn2; i++) { m[i] = normPpf((i + 1 - 0.375) / (n + 0.25)); summ2 += m[i]! * m[i]!; }
    summ2 *= 2;
    const ssumm2 = Math.sqrt(summ2), rsn = 1 / Math.sqrt(n);
    const a1 = poly(c1, rsn) - m[0]! / ssumm2;
    let i1: number, fac: number;
    if (n > 5) {
      i1 = 2;
      const a2 = -m[1]! / ssumm2 + poly(c2, rsn);
      fac = Math.sqrt((summ2 - 2 * m[0]! ** 2 - 2 * m[1]! ** 2) / (1 - 2 * a1 ** 2 - 2 * a2 ** 2));
      a[1] = a2;
    } else {
      i1 = 1;
      fac = Math.sqrt((summ2 - 2 * m[0]! ** 2) / (1 - 2 * a1 ** 2));
    }
    a[0] = a1;
    for (let i = i1; i < nn2; i++) a[i] = -m[i]! / fac;
  }
  // W = squared correlation between the ordered data and the antisymmetric coefficients.
  const coef = (i: number) => (i < nn2 ? -a[i]! : i >= n - nn2 ? a[n - 1 - i]! : 0);
  const range = x[n - 1]! - x[0]!;
  if (range < 1e-19) throw new Error("shapiroWilk: zero range");
  let sa = 0, sx = 0;
  for (let i = 0; i < n; i++) { sa += coef(i); sx += x[i]! / range; }
  sa /= n; sx /= n;
  let ssa = 0, ssx = 0, sax = 0;
  for (let i = 0; i < n; i++) {
    const asa = coef(i) - sa, xsx = x[i]! / range - sx;
    ssa += asa * asa; ssx += xsx * xsx; sax += asa * xsx;
  }
  const ssassx = Math.sqrt(ssa * ssx);
  const w1 = ((ssassx - sax) * (ssassx + sax)) / (ssa * ssx);
  const w = 1 - w1;
  if (n === 3) {
    const pi6 = 1.90985931710274, stqr = 1.04719755119660;
    return { statistic: w, p_value: Math.max(0, pi6 * (Math.asin(Math.sqrt(w)) - stqr)) };
  }
  let y = Math.log(w1);
  const lxx = Math.log(n);
  let mu: number, s: number;
  if (n <= 11) {
    const gamma = poly(g, n);
    if (y >= gamma) return { statistic: w, p_value: 1e-99 };
    y = -Math.log(gamma - y);
    mu = poly(c3, n);
    s = Math.exp(poly(c4, n));
  } else {
    mu = poly(c5, lxx);
    s = Math.exp(poly(c6, lxx));
  }
  return { statistic: w, p_value: normSf((y - mu) / s) };
}

/* ---------------- 1-D k-means (exact optimum) ---------------- */

/**
 * Optimal 1-D k-means on weighted distinct values by dynamic programming:
 * the globally minimal within-cluster sum of squares (no random restarts).
 * Returns cluster boundaries as index ranges into `x` (ascending).
 */
export function kmeans1d(x: number[], w: number[], k: number): { from: number; to: number; center: number; weight: number }[] {
  const m = x.length;
  const W = [0], S = [0], Q = [0];
  for (let i = 0; i < m; i++) { W.push(W[i]! + w[i]!); S.push(S[i]! + w[i]! * x[i]!); Q.push(Q[i]! + w[i]! * x[i]! * x[i]!); }
  const cost = (l: number, r: number) => { const ww = W[r + 1]! - W[l]!, s = S[r + 1]! - S[l]!; return Q[r + 1]! - Q[l]! - (s * s) / ww; };
  const K = Math.min(k, m);
  const D: number[][] = Array.from({ length: K }, () => new Array<number>(m).fill(Infinity));
  const B: number[][] = Array.from({ length: K }, () => new Array<number>(m).fill(0));
  for (let j = 0; j < m; j++) D[0]![j] = cost(0, j);
  for (let c = 1; c < K; c++) {
    for (let j = c; j < m; j++) {
      let best = Infinity, arg = c;
      for (let i = c; i <= j; i++) { const v = D[c - 1]![i - 1]! + cost(i, j); if (v < best) { best = v; arg = i; } }
      D[c]![j] = best; B[c]![j] = arg;
    }
  }
  const out: { from: number; to: number; center: number; weight: number }[] = [];
  let r = m - 1;
  for (let c = K - 1; c >= 0; c--) {
    const l = c === 0 ? 0 : B[c]![r]!;
    const ww = W[r + 1]! - W[l]!;
    out.unshift({ from: l, to: r, center: (S[r + 1]! - S[l]!) / ww, weight: ww });
    r = l - 1;
  }
  return out;
}

/* ---------------- seeded sampling ---------------- */

/** Deterministic sample without replacement (Floyd's algorithm on a seeded PRNG). */
export function sampleWithoutReplacement<T>(arr: ArrayLike<T>, k: number, seed: number): T[] {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const n = arr.length, chosen = new Set<number>();
  for (let j = n - k; j < n; j++) { const t = Math.floor(rnd() * (j + 1)); chosen.add(chosen.has(t) ? j : t); }
  return [...chosen].sort((a, b) => a - b).map((i) => arr[i]!);
}
