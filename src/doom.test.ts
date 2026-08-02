/**
 * doom.test.ts — guards on the toy DOOM search.
 *
 * These do not check that the search *looks* right; they run it and check the
 * numbers it produced. The headline guard is the measured slope: over 100
 * independent seeds at 12 trials per point the fit ranged −0.57 … −0.44, so the
 * ±0.20 band asserted here has roughly four times the observed half-spread of
 * margin while still failing loudly if the search stops exploiting M at all
 * (slope → 0) or exploits it linearly (slope → −1).
 */
import { describe, it, expect } from 'vitest';
import {
  makeRng,
  makeToyCode,
  toySyndrome,
  runDoomTrial,
  runDoomSweep,
  fitSlope,
  doomVerdict,
  PREDICTED_SLOPE,
  SLOPE_AGREE_TOLERANCE,
  TOY_N,
  TOY_R,
  TOY_W,
} from './doom.ts';

describe('toy code', () => {
  it('is a real random code with r-bit columns', () => {
    const code = makeToyCode(makeRng(7));
    expect(code.columns.length).toBe(TOY_N);
    for (const c of code.columns) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(2 ** TOY_R);
    }
    // Not a degenerate all-equal matrix.
    expect(new Set(Array.from(code.columns)).size).toBeGreaterThan(TOY_N / 2);
  });

  it('computes H·e as the XOR of the selected columns', () => {
    const code = makeToyCode(makeRng(11));
    expect(toySyndrome(code, [])).toBe(0);
    expect(toySyndrome(code, [3])).toBe(code.columns[3]);
    expect(toySyndrome(code, [3, 9])).toBe(code.columns[3] ^ code.columns[9]);
    // Over GF(2) a repeated position cancels.
    expect(toySyndrome(code, [5, 5])).toBe(0);
  });

  it('rejects out-of-range support instead of silently ignoring it', () => {
    const code = makeToyCode(makeRng(13));
    expect(() => toySyndrome(code, [TOY_N])).toThrow();
    expect(() => toySyndrome(code, [-1])).toThrow();
  });

  it('rejects impossible parameters', () => {
    expect(() => makeToyCode(makeRng(1), 63, TOY_R, TOY_W)).toThrow();
    expect(() => makeToyCode(makeRng(1), TOY_N, 40, TOY_W)).toThrow();
    expect(() => makeToyCode(makeRng(1), TOY_N, TOY_R, 5)).toThrow();
  });
});

describe('a single DOOM trial', () => {
  it('recovers a real weight-w error that verifies against a target', () => {
    const rng = makeRng(2024);
    const code = makeToyCode(rng);
    const res = runDoomTrial(4, rng, 200_000, code);
    expect(res.solved).toBe(true);
    expect(res.solution.length).toBe(TOY_W);
    expect(new Set(res.solution).size).toBe(TOY_W);
    expect(res.enumerations).toBeGreaterThan(0);
    // The support really is a weight-w error, half in each window.
    expect(res.solution.filter((j) => j < TOY_N / 2).length).toBe(TOY_W / 2);
  });

  it('is reproducible from a seed', () => {
    const a = runDoomTrial(8, makeRng(99));
    const b = runDoomTrial(8, makeRng(99));
    expect(b.enumerations).toBe(a.enumerations);
    expect(b.solution).toEqual(a.solution);
  });

  it('reports an honest failure when the budget runs out', () => {
    const res = runDoomTrial(1, makeRng(5), 20);
    expect(res.solved).toBe(false);
    expect(res.enumerations).toBe(20);
    expect(res.targetIndex).toBe(-1);
    expect(res.solution).toEqual([]);
  });

  it('rejects nonsense inputs rather than inventing a run', () => {
    expect(() => runDoomTrial(0, makeRng(1))).toThrow();
    expect(() => runDoomTrial(1.5, makeRng(1))).toThrow();
    expect(() => runDoomTrial(1, makeRng(1), 0)).toThrow();
  });
});

describe('fitSlope', () => {
  it('recovers an exact slope', () => {
    expect(fitSlope([0, 1, 2, 3], [1, -0.5, -2, -3.5])).toBeCloseTo(-1.5, 12);
  });
  it('refuses degenerate input', () => {
    expect(() => fitSlope([1, 1, 1], [1, 2, 3])).toThrow();
    expect(() => fitSlope([1], [1])).toThrow();
    expect(() => fitSlope([1, 2], [1])).toThrow();
  });
});

describe('the measured √M law', () => {
  // Five independent seeds. Each sweep is 9 M-values × 12 real searches = 108
  // decodings, so this block performs 540 real searches.
  const seeds = [1, 17, 404, 90210, 6];

  for (const seed of seeds) {
    it(`measures a slope within ±${SLOPE_AGREE_TOLERANCE} of ${PREDICTED_SLOPE} (seed ${seed})`, () => {
      const r = runDoomSweep({ seed, trials: 12, maxLog2M: 8 });
      expect(r.totalSolved).toBe(r.totalTrials);
      expect(r.totalTrials).toBe(9 * 12);
      expect(Math.abs(r.measuredSlope - PREDICTED_SLOPE)).toBeLessThanOrEqual(
        SLOPE_AGREE_TOLERANCE,
      );
      // Work really did fall: the largest M cost strictly less than M = 1.
      expect(r.discountRatio).toBeGreaterThan(4);
      expect(doomVerdict(r).kind).toBe('agree');
    });
  }

  it('spends MORE on bookkeeping as M grows — the other half of the tradeoff', () => {
    const r = runDoomSweep({ seed: 31337, trials: 12, maxLog2M: 8 });
    expect(r.measuredSlope).toBeLessThan(0);
    expect(r.measuredLookupSlope).toBeGreaterThan(0);
    // Enumerations fall roughly as fast as lookups rise: both ≈ ½ in magnitude.
    expect(Math.abs(r.measuredLookupSlope - 0.5)).toBeLessThanOrEqual(SLOPE_AGREE_TOLERANCE);
  });

  it('reports a sweep whose points are all solved and monotone-ish in M', () => {
    const r = runDoomSweep({ seed: 7, trials: 12, maxLog2M: 8 });
    for (const p of r.points) expect(p.solved).toBe(p.trials);
    expect(r.points[r.points.length - 1].meanEnumerations).toBeLessThan(
      r.points[0].meanEnumerations,
    );
    expect(r.code).toEqual({ n: TOY_N, r: TOY_R, w: TOY_W });
  });

  it('rejects a degenerate sweep request', () => {
    expect(() => runDoomSweep({ maxLog2M: 0 })).toThrow();
    expect(() => runDoomSweep({ trials: 0 })).toThrow();
  });
});

describe('the verdict states only what the run showed', () => {
  it('refuses to claim agreement when trials ran out of budget', () => {
    // A budget far too small: every trial fails, so no slope claim is allowed.
    const r = runDoomSweep({ seed: 4, trials: 2, maxLog2M: 2, budget: 8 });
    expect(r.totalSolved).toBeLessThan(r.totalTrials);
    const v = doomVerdict(r);
    expect(v.kind).toBe('incomplete');
    expect(v.headline).toMatch(/ran out of budget/);
    expect(v.detail).toMatch(/not a measurement/);
  });

  it('calls a genuinely wrong slope a disagreement', () => {
    const fake = {
      ...runDoomSweep({ seed: 3, trials: 2, maxLog2M: 2 }),
      measuredSlope: -0.05,
    };
    fake.totalSolved = fake.totalTrials;
    expect(doomVerdict(fake).kind).toBe('differ');
  });
});

