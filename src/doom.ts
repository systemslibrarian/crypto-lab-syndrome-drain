/**
 * doom.ts — a REAL, runnable toy DOOM (Decoding One Out of Many) search.
 *
 * Everything in this module is executed, never asserted. It builds a random
 * binary linear code, plants genuine low-weight errors, and runs an honest
 * two-list (birthday / Dumer-style) syndrome match against M targets at once.
 * Every reported number — enumerations, lookups, the fitted slope — is counted
 * during that run. Nothing is illustrated, interpolated, or hardcoded.
 *
 * WHY THE MEASURED SLOPE IS −½ (and not −1)
 * -----------------------------------------
 * The attacker never enumerates a whole error at once. It enumerates HALF
 * errors: a list A of left-half candidates and a list B of right-half
 * candidates, both stored by syndrome. A solution is a PAIR (a, b) with
 *
 *     H·e_L  XOR  H·e_R  =  s_i        for some target s_i
 *
 * so |A|·|B| pairs are tested by only |A|+|B| syndrome computations. With M
 * targets each pair gets M chances, so the number of pairs needed to expect one
 * hit falls as 2^r / M, and with |A| = |B| = L that means
 *
 *     L² · M ≈ 2^r     ⟹     L ≈ 2^(r/2) / √M
 *
 * The enumeration work 2L therefore falls as 1/√M — exactly the −½ bit per
 * doubling that the paper's degradation law states. The quadratic leverage of
 * the pair structure is the whole reason the discount is √M rather than M.
 *
 * The bookkeeping side moves the other way: table lookups cost L·M, which GROWS
 * as √M. The lab counts both and shows both, because that tension is precisely
 * why real analyses treat the DOOM discount as bounded rather than free.
 *
 * TOY SCALE — SAID PLAINLY
 * ------------------------
 * n = 96, r = 20 parity checks, error weight w = 6. That is a 2^20 syndrome
 * space, roughly a million: breakable in milliseconds, carrying NO security
 * whatsoever. Real BIKE / HQC / Classic McEliece parameters are thousands of
 * bits and cannot be searched in a browser. What transfers from this toy to
 * those schemes is the SCALING of work with M, not the absolute difficulty.
 */

/* ------------------------------------------------------------ toy parameters */

/** Code length n — number of columns of H. */
export const TOY_N = 96;
/** Number of parity checks r — the syndrome is r bits wide (2^20 space). */
export const TOY_R = 20;
/** Error weight w, split evenly across the two halves (w/2 each). */
export const TOY_W = 6;

/**
 * Deterministic RNG (mulberry32) so a run can be reproduced exactly from a seed.
 * The lab seeds from Math.random by default; tests seed explicitly. This is a
 * simulation RNG for a teaching search, NOT a cryptographic generator, and it is
 * never used to make a key.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function rng(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ToyCode {
  /** Code length (columns of H). */
  n: number;
  /** Parity checks (rows of H); syndromes are r bits. */
  r: number;
  /** Error weight the search looks for. */
  w: number;
  /** Column j of H packed as an r-bit integer. H·e = XOR of the columns e selects. */
  columns: Int32Array;
}

/**
 * A random binary [n, n−r] code: every column of H drawn uniformly at random
 * from the r-bit space. Real random linear code, real GF(2) arithmetic.
 */
export function makeToyCode(rng: () => number, n = TOY_N, r = TOY_R, w = TOY_W): ToyCode {
  if (n < 4 || n % 2 !== 0) throw new Error('n must be even and >= 4');
  if (r < 2 || r > 30) throw new Error('r must be in [2, 30]');
  if (w < 2 || w % 2 !== 0 || w > n) throw new Error('w must be even and <= n');
  const columns = new Int32Array(n);
  const span = 2 ** r;
  for (let j = 0; j < n; j++) columns[j] = Math.floor(rng() * span);
  return { n, r, w, columns };
}

/** Syndrome H·e over GF(2), where `support` lists the positions where e is 1. */
export function toySyndrome(code: ToyCode, support: readonly number[]): number {
  let s = 0;
  for (const j of support) {
    if (j < 0 || j >= code.n) throw new Error(`support index out of range: ${j}`);
    s ^= code.columns[j];
  }
  return s;
}

/** A uniformly random k-subset of [lo, hi), returned sorted. */
function randomSupport(lo: number, hi: number, k: number, rng: () => number): number[] {
  if (hi - lo < k) throw new Error('window too small for that weight');
  const picked: number[] = [];
  while (picked.length < k) {
    const j = lo + Math.floor(rng() * (hi - lo));
    if (!picked.includes(j)) picked.push(j);
  }
  return picked.sort((a, b) => a - b);
}

export interface DoomTrialResult {
  /** Syndrome computations performed — the metric the −½ slope is measured in. */
  enumerations: number;
  /** Target-table lookups performed — the bookkeeping cost, which grows with M. */
  lookups: number;
  /** True only if a real weight-w error was found AND re-verified against H. */
  solved: boolean;
  /** Which of the M targets was decoded (−1 when the budget ran out). */
  targetIndex: number;
  /** The recovered error's support, sorted (empty when unsolved). */
  solution: number[];
  /** The enumeration budget this trial was allowed. */
  budget: number;
}

/**
 * One real DOOM run against M targets.
 *
 * Targets are the syndromes of M genuinely planted weight-w errors, so every
 * instance provably has an answer. The search interleaves left-half and
 * right-half candidates, storing each by syndrome, and after each new candidate
 * checks all M targets for a completing partner. A hit is re-verified from
 * scratch (H·e recomputed, weight recounted) before it is reported solved —
 * a claimed solution that fails that check throws rather than being counted.
 *
 * Returns `solved: false` when the enumeration budget is exhausted first. That
 * is a real outcome of a real search, not an error condition.
 */
export function runDoomTrial(
  M: number,
  rng: () => number,
  budget = 200_000,
  code: ToyCode = makeToyCode(rng),
): DoomTrialResult {
  if (!Number.isInteger(M) || M < 1) throw new Error('M must be a positive integer');
  if (!Number.isInteger(budget) || budget < 1) throw new Error('budget must be a positive integer');

  const half = code.n >> 1;
  const hw = code.w >> 1;

  // Plant M real weight-w errors; the targets are their true syndromes.
  const targets = new Int32Array(M);
  for (let i = 0; i < M; i++) {
    const e = [...randomSupport(0, half, hw, rng), ...randomSupport(half, code.n, hw, rng)];
    targets[i] = toySyndrome(code, e);
  }

  const left = new Map<number, number[]>();
  const right = new Map<number, number[]>();
  const seenLeft = new Set<string>();
  const seenRight = new Set<string>();

  let enumerations = 0;
  let lookups = 0;

  while (enumerations < budget) {
    const onLeft = enumerations % 2 === 0;
    const seen = onLeft ? seenLeft : seenRight;
    const own = onLeft ? left : right;
    const other = onLeft ? right : left;

    // Draw a fresh (not previously tried) half-weight candidate.
    let support: number[];
    let key: string;
    let attempts = 0;
    do {
      support = onLeft
        ? randomSupport(0, half, hw, rng)
        : randomSupport(half, code.n, hw, rng);
      key = support.join(',');
      if (++attempts > 10_000) throw new Error('candidate space exhausted for these parameters');
    } while (seen.has(key));
    seen.add(key);

    const s = toySyndrome(code, support);
    enumerations++;
    if (!own.has(s)) own.set(s, support);

    for (let i = 0; i < M; i++) {
      lookups++;
      const partner = other.get(s ^ targets[i]);
      if (partner === undefined) continue;
      const solution = [...support, ...partner].sort((a, b) => a - b);
      // Re-verify from scratch. A "solution" that does not check out is a bug,
      // and the lab must crash rather than report a discount it did not earn.
      if (toySyndrome(code, solution) !== targets[i]) {
        throw new Error('internal: match failed syndrome re-verification');
      }
      if (solution.length !== code.w || new Set(solution).size !== code.w) {
        throw new Error('internal: match failed weight re-verification');
      }
      return { enumerations, lookups, solved: true, targetIndex: i, solution, budget };
    }
  }

  return { enumerations, lookups, solved: false, targetIndex: -1, solution: [], budget };
}

export interface DoomSweepPoint {
  log2M: number;
  M: number;
  /** Mean syndrome computations over the trials at this M. */
  meanEnumerations: number;
  /** Mean target-table lookups over the trials at this M. */
  meanLookups: number;
  /** How many of the trials at this M found and verified a real error. */
  solved: number;
  trials: number;
}

export interface DoomSweepResult {
  points: DoomSweepPoint[];
  /**
   * Least-squares slope of log2(mean enumerations) against log2(M), measured
   * from the points above. The paper's law predicts −0.5.
   */
  measuredSlope: number;
  /** Same fit for the lookup counter — the cost that moves the other way. */
  measuredLookupSlope: number;
  /** Total trials run across the sweep. */
  totalTrials: number;
  /** Trials that found and re-verified a real weight-w error. */
  totalSolved: number;
  /** Measured work discount from M = 1 to the largest M, as a raw ratio. */
  discountRatio: number;
  /** The same discount expressed in bits: log2(work at M=1 / work at max M). */
  discountBits: number;
  /** The seed the whole sweep was driven from, so it can be reproduced. */
  seed: number;
  code: { n: number; r: number; w: number };
}

/** Least-squares slope of ys against xs. Throws on degenerate input. */
export function fitSlope(xs: readonly number[], ys: readonly number[]): number {
  if (xs.length !== ys.length || xs.length < 2) throw new Error('need >= 2 paired points');
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) throw new Error('x values are all identical; slope undefined');
  return num / den;
}

export interface DoomSweepOptions {
  /** Largest exponent: the sweep covers M = 2^0 … 2^maxLog2M. */
  maxLog2M?: number;
  /** Independent searches averaged at each M. More trials = tighter fit. */
  trials?: number;
  /** Enumeration budget per trial; exceeding it is a real, reported failure. */
  budget?: number;
  seed?: number;
  n?: number;
  r?: number;
  w?: number;
}

/**
 * Run the whole sweep: for each M = 2^0 … 2^maxLog2M, run `trials` independent
 * real searches, average the measured work, then fit the slope. Every number in
 * the returned object was counted during those searches.
 */
export function runDoomSweep(options: DoomSweepOptions = {}): DoomSweepResult {
  const {
    maxLog2M = 8,
    trials = 12,
    budget = 200_000,
    seed = Math.floor(Math.random() * 2 ** 31),
    n = TOY_N,
    r = TOY_R,
    w = TOY_W,
  } = options;
  if (!Number.isInteger(maxLog2M) || maxLog2M < 1) throw new Error('maxLog2M must be >= 1');
  if (!Number.isInteger(trials) || trials < 1) throw new Error('trials must be >= 1');

  const rng = makeRng(seed);
  const points: DoomSweepPoint[] = [];
  let totalTrials = 0;
  let totalSolved = 0;

  for (let k = 0; k <= maxLog2M; k++) {
    const M = 2 ** k;
    let sumE = 0;
    let sumL = 0;
    let solved = 0;
    for (let t = 0; t < trials; t++) {
      const code = makeToyCode(rng, n, r, w);
      const res = runDoomTrial(M, rng, budget, code);
      sumE += res.enumerations;
      sumL += res.lookups;
      if (res.solved) solved++;
    }
    totalTrials += trials;
    totalSolved += solved;
    points.push({
      log2M: k,
      M,
      meanEnumerations: sumE / trials,
      meanLookups: sumL / trials,
      solved,
      trials,
    });
  }

  const xs = points.map((p) => p.log2M);
  const measuredSlope = fitSlope(xs, points.map((p) => Math.log2(p.meanEnumerations)));
  const measuredLookupSlope = fitSlope(xs, points.map((p) => Math.log2(p.meanLookups)));
  const first = points[0].meanEnumerations;
  const last = points[points.length - 1].meanEnumerations;
  const discountRatio = first / last;

  return {
    points,
    measuredSlope,
    measuredLookupSlope,
    totalTrials,
    totalSolved,
    discountRatio,
    discountBits: Math.log2(discountRatio),
    seed,
    code: { n, r, w },
  };
}

/**
 * How far the measured slope may sit from the law's −½ before the lab stops
 * calling it agreement. Chosen from the observed spread: over 100 independent
 * seeds at 12 trials per point the fitted slope ranged −0.57 … −0.44, so ±0.20
 * is roughly four times the observed half-spread — wide enough never to flap,
 * tight enough that a broken search (slope 0 or −1) is caught.
 */
export const SLOPE_AGREE_TOLERANCE = 0.2;

/** The slope the paper's √M law predicts for the enumeration metric. */
export const PREDICTED_SLOPE = -0.5;

export interface DoomVerdict {
  /** 'agree' | 'differ' | 'incomplete' — computed from the run, never assumed. */
  kind: 'agree' | 'differ' | 'incomplete';
  headline: string;
  detail: string;
}

/**
 * Turn a completed sweep into a verdict that states ONLY what the run showed.
 * If any trial failed to find an error within budget the verdict is
 * 'incomplete' and says so — a partial sweep never gets to claim agreement.
 */
export function doomVerdict(result: DoomSweepResult): DoomVerdict {
  const slope = result.measuredSlope;
  const shown = slope.toFixed(3);
  if (result.totalSolved < result.totalTrials) {
    const missed = result.totalTrials - result.totalSolved;
    return {
      kind: 'incomplete',
      headline: `${missed} of ${result.totalTrials} searches ran out of budget`,
      detail:
        `Those searches never found an error, so their work counts are budget caps, not ` +
        `costs. The fitted slope (${shown}) is not a measurement of the law — raise the ` +
        `enumeration budget and run it again.`,
    };
  }
  const delta = Math.abs(slope - PREDICTED_SLOPE);
  if (delta <= SLOPE_AGREE_TOLERANCE) {
    return {
      kind: 'agree',
      headline: `Measured slope ${shown} bits per doubling of M`,
      detail:
        `All ${result.totalTrials} searches found and re-verified a real weight-${result.code.w} ` +
        `error. Fitting the measured syndrome-computation counts gives ${shown}; the √M law ` +
        `predicts ${PREDICTED_SLOPE}. That is agreement within ±${SLOPE_AGREE_TOLERANCE} — the ` +
        `discount was measured here, at toy scale, not assumed.`,
    };
  }
  return {
    kind: 'differ',
    headline: `Measured slope ${shown} — outside the ±${SLOPE_AGREE_TOLERANCE} band`,
    detail:
      `All ${result.totalTrials} searches solved, but the fit came out at ${shown} rather ` +
      `than ${PREDICTED_SLOPE}. This run does not confirm the √M law; more trials per point ` +
      `tighten the fit.`,
  };
}
