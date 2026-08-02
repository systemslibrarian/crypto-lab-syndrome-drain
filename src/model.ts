/**
 * model.ts — the computation core for Syndrome Drain.
 *
 * DOM-free. The scheme model is pure and deterministic: every number is real
 * arithmetic on PUBLISHED Level-1 parameters from May & Sá Diogo, "Multi-Instance
 * Security Degradation of Code-Based KEMs", IACR ePrint 2026/517. NOTHING there
 * is simulated or invented, and NO attack is run against those parameters — that
 * half of the module COMPUTES effective bit-security from the paper's stated √D
 * degradation law.
 *
 * The [7,4] Hamming section at the bottom is different in kind: it runs real,
 * exhaustive searches on a 7-bit toy code that carries no security. Those
 * counts are measured, not modeled, and the two halves are kept clearly apart.
 * The larger toy DOOM search lives in doom.ts.
 *
 * Audit trail: every constant cites PAPER-NOTES.md (which cites the PDF). See
 * model.test-notes.md for the prose derivation of each function.
 *
 * Notation: the paper's M ("number of session/public keys derived from one
 * public key") is this module's D.
 */

export type SchemeId = 'bike' | 'hqc' | 'mceliece';

/** How the multi-instance syndrome count grows with D, per scheme. */
export type SyndromeGrowth = 'nD' | 'D';

export interface SchemeParams {
  id: SchemeId;
  label: string; // display name
  paramSet: string; // the concrete parameter set name from the paper
  level: 1; // NIST Level 1 only in v1

  /** NIST Level-1 classical security floor, in bits. */
  targetSecurityBits: number; // source: 2026/517 Abstract & §3 ("143 bits")

  /**
   * Single-instance bit complexity T1 (pure time metric, best/MMT variant).
   * effective(D=1) === this value.
   */
  singleInstanceBits: number; // source: 2026/517 Table 2/5/7, MMT row

  /**
   * Code length n (length of the [n,k] code / quasi-cyclic block). For BIKE/HQC
   * this is the ring degree; it is the multiplier in BIKE's n·D syndrome count.
   */
  codeLengthN: number; // source: 2026/517 Table 1/4/6

  /**
   * The √n DOOM speedup already credited in single-instance parameter selection.
   * For HQC & BIKE this is the ring's n syndromes (so √n); for McEliece there is
   * no ring and no single-instance DOOM credit, so N = 1 (√1 = no speedup).
   */
  singleInstanceDoomRootN: number; // source: 2026/517 Abstract ("√n … taken into account")

  /** Multi-instance syndrome count shape: BIKE ≈ n·D, HQC & McEliece ≈ D. */
  syndromeGrowth: SyndromeGrowth; // source: 2026/517 §4.1 (nM), §3.1 (M), §5.1 (M)

  /**
   * Paper-stated crossover, as log2(D): the smallest log2(D) at which the
   * paper's COMPUTED effective security drops below targetSecurityBits.
   */
  paperCrossoverLog2D: number | 'UNKNOWN'; // source: 2026/517 Abstract & Table 2/5/7

  source: string; // human-readable citation
}

/**
 * The slope of the multi-instance degradation, in bits of security lost per
 * doubling of D. DOOM gives a √m speedup over m syndromes, i.e. −½·log2(m) bits;
 * the paper states the curves degrade with "slope roughly √M" in D. Because
 * doubling D doubles the syndrome count (whether the count is n·D or D, n being
 * constant), every scheme loses ½ bit per doubling of D.
 */
export const DOOM_SLOPE_BITS_PER_DOUBLING = 0.5; // source: 2026/517 §2 (O(√m)); Figs 2–5 ("slope ≈ √M")

/**
 * log2 tolerance for declaring the idealized √D law "in agreement" with the
 * paper's empirical (full-ISD) crossover. The idealized slope is exactly ½; the
 * paper's per-scheme ISD slopes lie in ≈[0.39, 0.52], and reporting crossovers
 * as integer log2(D) adds ±1 of rounding. So |Δlog2| ≤ 1 is "agreement within
 * the idealization's resolution"; larger gaps are genuine structural deviations.
 */
export const CROSSOVER_AGREE_TOLERANCE_LOG2 = 1; // see model.test-notes.md §4

/**
 * The three NIST Level-1 code-based KEMs analysed in the paper.
 * All numbers: 2026/517, MMT (best-attack) rows, pure time metric.
 */
export const SCHEMES: SchemeParams[] = [
  {
    id: 'hqc',
    label: 'HQC',
    paramSet: 'HQC-1',
    level: 1,
    targetSecurityBits: 143, // source: 2026/517 §3 ("143, 207 and 272 bits")
    singleInstanceBits: 160.04, // source: 2026/517 Table 2, HQC-1 MMT T1
    codeLengthN: 17669, // source: 2026/517 Table 1, HQC-1 n
    singleInstanceDoomRootN: 17669, // source: 2026/517 Abstract (√n credited; ring degree n)
    syndromeGrowth: 'D', // source: 2026/517 §3.1 ("M syndromes"; ring blocked by truncation P′·Tℓ)
    paperCrossoverLog2D: 34, // source: 2026/517 Abstract & Table 2 (M ≳ 2^34, MMT → 142.42)
    source: 'May & Sá Diogo, ePrint 2026/517, Tables 1 & 2 (HQC-1, MMT)',
  },
  {
    id: 'bike',
    label: 'BIKE',
    paramSet: 'BIKE-1',
    level: 1,
    targetSecurityBits: 143, // source: 2026/517 §3
    singleInstanceBits: 148.17, // source: 2026/517 Table 5, BIKE-1 MMT T1
    codeLengthN: 12323, // source: 2026/517 Table 4, BIKE-1 n
    singleInstanceDoomRootN: 12323, // source: 2026/517 Abstract (√n credited; ring degree n)
    syndromeGrowth: 'nD', // source: 2026/517 §4.1 ("nM many syndromes" via Xʲ·u ring shifts)
    paperCrossoverLog2D: 11, // source: 2026/517 Abstract & Table 5 (M ≳ 2^11, MMT → 142.63)
    source: 'May & Sá Diogo, ePrint 2026/517, Tables 4 & 5 (BIKE-1, MMT)',
  },
  {
    id: 'mceliece',
    label: 'Classic McEliece',
    paramSet: 'mceliece3488-64',
    level: 1,
    targetSecurityBits: 143, // source: 2026/517 §3
    singleInstanceBits: 151.22, // source: 2026/517 Table 7, mceliece3488-64 MMT T1
    codeLengthN: 3488, // source: 2026/517 Table 6, mceliece3488-64 n
    singleInstanceDoomRootN: 1, // source: 2026/517 — no ring, no single-instance DOOM credit
    syndromeGrowth: 'D', // source: 2026/517 §5.1 ("M syndromes c^(i)")
    paperCrossoverLog2D: 21, // source: 2026/517 Abstract & Table 7 (M ≳ 2^21, MMT → 142.97)
    source: 'May & Sá Diogo, ePrint 2026/517, Tables 6 & 7 (mceliece3488-64, MMT)',
  },
];

/* ============================================================ syndrome primer
 *
 * A concrete, real (not toy-security) [7,4] Hamming code so a newcomer can SEE
 * what a "syndrome" is before the demo starts counting them. This is standard
 * textbook coding theory — the same syndrome-decoding operation the KEMs rest
 * on, just at a size a human can read. It carries NO security; it exists purely
 * to build the mental image "syndrome = short fingerprint of a hidden error".
 *
 * H is the 3×7 parity-check matrix of the [7,4] Hamming code: column j is the
 * 3-bit binary representation of j (1..7). The syndrome of an error vector e is
 * s = H·e over GF(2) (each syndrome bit is the XOR/parity of the error bits in
 * that row). For a single-bit error at position j, s is exactly j in binary —
 * which is why this code corrects any single-bit error. Two DIFFERENT error
 * patterns can share one syndrome (they differ by a codeword), which is exactly
 * why decoding means "find the LOWEST-WEIGHT e for this s", not "find any e".
 */

/** [7,4] Hamming parity-check matrix H (3 rows × 7 columns), GF(2). */
export const HAMMING_H: ReadonlyArray<ReadonlyArray<0 | 1>> = [
  [0, 0, 0, 1, 1, 1, 1],
  [0, 1, 1, 0, 0, 1, 1],
  [1, 0, 1, 0, 1, 0, 1],
];

/** Length of the primer code's error/codeword vectors (7). */
export const HAMMING_N = 7;
/** Number of parity checks / syndrome bits (3). */
export const HAMMING_R = 3;

/**
 * Syndrome s = H·e over GF(2) for a length-7 error vector e (bits 0/1).
 * Returns a length-3 syndrome (each bit = parity of e over that row of H).
 * Pure: no state, no randomness. Throws on malformed input.
 */
export function hammingSyndrome(e: ReadonlyArray<0 | 1>): Array<0 | 1> {
  if (e.length !== HAMMING_N) throw new Error(`error vector must have length ${HAMMING_N}`);
  return HAMMING_H.map((row) => {
    let bit = 0;
    for (let j = 0; j < HAMMING_N; j++) bit ^= row[j] & e[j];
    return bit as 0 | 1;
  });
}

/** Hamming weight (number of set bits) of a 0/1 vector — the "cost" a decoder minimises. */
export function weight(e: ReadonlyArray<0 | 1>): number {
  return e.reduce((acc: number, b) => acc + (b ? 1 : 0), 0);
}

/**
 * All length-7 error vectors sharing a given syndrome s = H·e, sorted by weight
 * (lowest first). This is the whole coset of the code for that syndrome — every
 * pattern the attacker cannot tell apart from e using H alone. Decoding = pick
 * the lowest-weight member. Enumerated honestly over all 2^7 vectors (128).
 */
export function cosetForSyndrome(s: ReadonlyArray<0 | 1>): Array<Array<0 | 1>> {
  if (s.length !== HAMMING_R) throw new Error(`syndrome must have length ${HAMMING_R}`);
  const out: Array<Array<0 | 1>> = [];
  for (let mask = 0; mask < 1 << HAMMING_N; mask++) {
    const e = Array.from({ length: HAMMING_N }, (_, j) => ((mask >> j) & 1) as 0 | 1);
    const syn = hammingSyndrome(e);
    if (syn.every((b, i) => b === s[i])) out.push(e);
  }
  out.sort((a, b) => weight(a) - weight(b));
  return out;
}

/* ------------------------------------------- decode-one-out-of-many, at 7 bits
 *
 * The same [7,4] code, now with M targets instead of one — the smallest honest
 * version of the whole page's subject. The attacker is handed M syndromes and
 * needs to explain ANY ONE of them; it scans the 128 possible error vectors in
 * a uniformly random order and stops at the first vector whose syndrome is in
 * the target set. Everything below is either exhaustively enumerated or counted
 * during a real scan.
 *
 * This tiny code is small enough to try a WHOLE error vector at a time, so its
 * discount is the full M. The big DOOM lab (doom.ts) cannot afford whole errors
 * and has to pair up half-errors instead, and that pairing is exactly where the
 * discount drops from M to √M. Seeing both is the point.
 */

/** Number of distinct syndromes of the [7,4] code (2^3). */
export const HAMMING_SYNDROME_COUNT = 1 << HAMMING_R; // 8
/** Number of length-7 vectors (2^7) — the whole search space. */
export const HAMMING_VECTOR_COUNT = 1 << HAMMING_N; // 128
/** Vectors per syndrome: 2^7 / 2^3 = 16, identical for every syndrome. */
export const HAMMING_COSET_SIZE = HAMMING_VECTOR_COUNT / HAMMING_SYNDROME_COUNT; // 16

/** Pack a 3-bit syndrome into an integer 0..7 (row 1 is the high bit). */
export function hammingSyndromeToInt(s: ReadonlyArray<0 | 1>): number {
  if (s.length !== HAMMING_R) throw new Error(`syndrome must have length ${HAMMING_R}`);
  return s[0] * 4 + s[1] * 2 + s[2];
}

/** Unpack an integer 0..7 back into a 3-bit syndrome vector. */
export function intToHammingSyndrome(v: number): Array<0 | 1> {
  if (!Number.isInteger(v) || v < 0 || v >= HAMMING_SYNDROME_COUNT) {
    throw new Error(`syndrome int must be an integer in [0, ${HAMMING_SYNDROME_COUNT})`);
  }
  return [((v >> 2) & 1) as 0 | 1, ((v >> 1) & 1) as 0 | 1, (v & 1) as 0 | 1];
}

/** Syndrome of the length-7 vector whose bits are the low 7 bits of `mask`. */
export function hammingSyndromeOfMask(mask: number): number {
  let s = 0;
  for (let j = 0; j < HAMMING_N; j++) {
    if ((mask >> j) & 1) {
      let col = 0;
      for (let r = 0; r < HAMMING_R; r++) col |= HAMMING_H[r][j] << (HAMMING_R - 1 - r);
      s ^= col;
    }
  }
  return s;
}

/**
 * Expected number of vectors examined before a random-order scan of all 128
 * hits one of M distinct target syndromes. Exact, not estimated: every syndrome
 * has exactly 16 preimages, so 16·M of the 128 vectors are hits, and the
 * expected position of the first hit in a uniformly random permutation of N
 * items containing K hits is (N + 1) / (K + 1).
 */
export function hammingDoomExpectedGuesses(M: number): number {
  if (!Number.isInteger(M) || M < 1 || M > HAMMING_SYNDROME_COUNT) {
    throw new Error(`M must be an integer in [1, ${HAMMING_SYNDROME_COUNT}]`);
  }
  return (HAMMING_VECTOR_COUNT + 1) / (HAMMING_COSET_SIZE * M + 1);
}

export interface HammingDoomTrial {
  /** How many vectors the scan examined before its first hit. */
  guesses: number;
  /** The error vector found (length 7). */
  found: Array<0 | 1>;
  /** Which target it decoded (index into the target list). */
  targetIndex: number;
}

/** Fisher–Yates shuffle of 0..count-1 using the supplied RNG. */
function shuffledIndices(count: number, rng: () => number): number[] {
  const a = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick M distinct target syndromes (as ints 0..7), uniformly at random. */
export function pickHammingTargets(M: number, rng: () => number): number[] {
  if (!Number.isInteger(M) || M < 1 || M > HAMMING_SYNDROME_COUNT) {
    throw new Error(`M must be an integer in [1, ${HAMMING_SYNDROME_COUNT}]`);
  }
  return shuffledIndices(HAMMING_SYNDROME_COUNT, rng).slice(0, M).sort((a, b) => a - b);
}

/**
 * One real decode-one-out-of-many scan over the [7,4] code: walk all 128 error
 * vectors in a random order, stop at the first whose syndrome is one of the
 * targets, and re-verify H·e against that target before returning. Because
 * every syndrome has 16 preimages, a hit always exists — this scan cannot fail,
 * and `guesses` is a genuinely measured count.
 */
export function runHammingDoomTrial(targets: readonly number[], rng: () => number): HammingDoomTrial {
  if (targets.length === 0) throw new Error('need at least one target syndrome');
  const order = shuffledIndices(HAMMING_VECTOR_COUNT, rng);
  for (let i = 0; i < order.length; i++) {
    const mask = order[i];
    const s = hammingSyndromeOfMask(mask);
    const idx = targets.indexOf(s);
    if (idx === -1) continue;
    const found = Array.from({ length: HAMMING_N }, (_, j) => ((mask >> j) & 1) as 0 | 1);
    // Re-verify with the matrix routine, not the packed one, before reporting.
    if (hammingSyndromeToInt(hammingSyndrome(found)) !== targets[idx]) {
      throw new Error('internal: Hamming DOOM hit failed re-verification');
    }
    return { guesses: i + 1, found, targetIndex: idx };
  }
  throw new Error('internal: no hit in a full scan — impossible for this code');
}

export interface HammingDoomRun {
  M: number;
  targets: number[];
  trials: number;
  /** Mean measured guesses across the trials. */
  meanGuesses: number;
  /** The exact expectation for this M, computed in closed form. */
  expectedGuesses: number;
  /** Every trial's guess count, in order (the lab shows the first few). */
  samples: number[];
  /** The last trial's recovered error, for display. */
  lastFound: Array<0 | 1>;
  lastTargetIndex: number;
}

/** Run `trials` independent scans against the same M targets and average them. */
export function runHammingDoom(M: number, trials: number, rng: () => number): HammingDoomRun {
  if (!Number.isInteger(trials) || trials < 1) throw new Error('trials must be >= 1');
  const targets = pickHammingTargets(M, rng);
  const samples: number[] = [];
  let last: HammingDoomTrial | null = null;
  for (let t = 0; t < trials; t++) {
    last = runHammingDoomTrial(targets, rng);
    samples.push(last.guesses);
  }
  return {
    M,
    targets,
    trials,
    meanGuesses: samples.reduce((a, b) => a + b, 0) / samples.length,
    expectedGuesses: hammingDoomExpectedGuesses(M),
    samples,
    lastFound: last!.found,
    lastTargetIndex: last!.targetIndex,
  };
}

/** Look up a scheme by id; throws on unknown id (keeps callers honest). */
export function getScheme(id: SchemeId): SchemeParams {
  const s = SCHEMES.find((x) => x.id === id);
  if (!s) throw new Error(`unknown scheme id: ${id}`);
  return s;
}

/**
 * Number of DOOM syndromes the attacker assembles for D reused session keys.
 * BIKE: n·D (ring shifts donate n per session). HQC, McEliece: D (one per
 * session; HQC's ring is blocked by the truncation in its reduction).
 * source: 2026/517 §4.1, §3.1, §5.1.
 */
export function syndromeCount(scheme: SchemeParams, D: number): number {
  if (D < 1) throw new Error('D must be >= 1');
  return scheme.syndromeGrowth === 'nD' ? scheme.codeLengthN * D : D;
}

/**
 * Effective classical security in bits given D session keys derived from one
 * public key. Implements the paper's √D degradation law literally:
 *
 *     effective(D) = T1 − ½·log2(D)
 *
 * where T1 is the single-instance MMT bit complexity (which already credits the
 * scheme's √n single-instance DOOM, a constant — see PAPER-NOTES.md §7). Pure:
 * identical input → identical output, no randomness, no clamping.
 * source: 2026/517 §2 (O(√m) DOOM) + Figs 2–5 ("slope ≈ √M").
 */
export function effectiveSecurityBits(scheme: SchemeParams, D: number): number {
  if (D < 1) throw new Error('D must be >= 1');
  return scheme.singleInstanceBits - DOOM_SLOPE_BITS_PER_DOUBLING * Math.log2(D);
}

/** Security margin (bits) above the floor at D session keys (negative ⇒ below). */
export function marginToFloor(scheme: SchemeParams, D: number): number {
  return effectiveSecurityBits(scheme, D) - scheme.targetSecurityBits;
}

/** True once D session keys push effective security below the Level-1 floor. */
export function isBelowFloor(scheme: SchemeParams, D: number): boolean {
  return effectiveSecurityBits(scheme, D) < scheme.targetSecurityBits;
}

export interface CrossoverResult {
  /** Smallest INTEGER log2(D) at which the √D law drops below the floor. */
  computedLog2: number;
  /** The √D law's exact real-valued crossover, log2(D), for display. */
  computedLog2Exact: number;
  /** Smallest integer D (= 2^computedLog2) at which the law drops below floor. */
  computed: number;
  /** Paper-stated crossover as log2(D) (empirical full-ISD value), or UNKNOWN. */
  paperStatedLog2: number | 'UNKNOWN';
  /** Paper-stated crossover D (= 2^paperStatedLog2), or UNKNOWN. */
  paperStated: number | 'UNKNOWN';
  /** Whether computed and paper-stated agree within the log2 tolerance. */
  agree: boolean;
}

/**
 * Crossover D at which a scheme drops below its Level-1 floor.
 *
 *   computed:  derived from effectiveSecurityBits (the idealized ½-slope law),
 *              as the smallest integer log2(D) with effective(D) < floor.
 *   paperStated: transcribed from the paper's empirical full-ISD tables.
 *
 * If they disagree beyond CROSSOVER_AGREE_TOLERANCE_LOG2, agree=false and BOTH
 * are exposed — we never silently trust one over the other.
 * source: computed law = 2026/517 §2/Figs; paperStated = Abstract & Table 2/5/7.
 */
export function crossoverD(scheme: SchemeParams): CrossoverResult {
  // effective(D) < floor  ⇔  T1 − ½·log2(D) < floor  ⇔  log2(D) > 2·(T1 − floor)
  const exact =
    (scheme.singleInstanceBits - scheme.targetSecurityBits) /
    DOOM_SLOPE_BITS_PER_DOUBLING;
  // Smallest integer k with T1 − ½k < floor, i.e. k > exact ⇒ k = floor(exact)+1.
  const computedLog2 = Math.floor(exact) + 1;
  const computed = Math.pow(2, computedLog2);

  const paperStatedLog2 = scheme.paperCrossoverLog2D;
  const paperStated =
    paperStatedLog2 === 'UNKNOWN' ? 'UNKNOWN' : Math.pow(2, paperStatedLog2);

  const agree =
    paperStatedLog2 !== 'UNKNOWN' &&
    Math.abs(computedLog2 - paperStatedLog2) <= CROSSOVER_AGREE_TOLERANCE_LOG2;

  return {
    computedLog2,
    computedLog2Exact: exact,
    computed,
    paperStatedLog2,
    paperStated,
    agree,
  };
}

/**
 * Largest integer log2(D) at which a scheme still holds >= targetBits of
 * effective security (i.e. the last "safe" reuse count before rotation).
 *   effective(D) = T1 − ½·log2(D) ≥ target  ⇔  log2(D) ≤ 2·(T1 − target).
 * May be negative, meaning even a single key (D=1) is already below target.
 * source: same √D law as effectiveSecurityBits.
 */
export function maxSafeReuseLog2(scheme: SchemeParams, targetBits: number): number {
  return Math.floor((scheme.singleInstanceBits - targetBits) * 2);
}

/**
 * A sensible upper bound for the D slider/chart: comfortably past every
 * scheme's crossover (computed and paper-stated). Derived, never hardcoded.
 */
export function maxLog2DForDisplay(margin = 6): number {
  let maxCross = 0;
  for (const s of SCHEMES) {
    const c = crossoverD(s);
    maxCross = Math.max(maxCross, c.computedLog2);
    if (c.paperStatedLog2 !== 'UNKNOWN') {
      maxCross = Math.max(maxCross, c.paperStatedLog2);
    }
  }
  return maxCross + margin;
}
