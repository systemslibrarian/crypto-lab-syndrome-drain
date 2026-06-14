/**
 * model.ts — the computation core for Syndrome Drain.
 *
 * Pure, deterministic, DOM-free. Every number is real arithmetic on PUBLISHED
 * Level-1 parameters from May & Sá Diogo, "Multi-Instance Security Degradation
 * of Code-Based KEMs", IACR ePrint 2026/517. NOTHING here is simulated, random,
 * or invented. This module runs NO decoding and NO DOOM attack — it COMPUTES
 * effective bit-security from the paper's stated √D degradation law.
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
