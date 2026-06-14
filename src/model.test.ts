/**
 * model.test.ts — executable guards on the pure computation core.
 *
 * These turn the audit narrative in model.test-notes.md into regression checks:
 * the model must keep reproducing the paper's Level-1 numbers and never silently
 * drift. Run with `npm test`.
 */
import { describe, it, expect } from 'vitest';
import {
  SCHEMES,
  getScheme,
  effectiveSecurityBits,
  marginToFloor,
  isBelowFloor,
  syndromeCount,
  crossoverD,
  maxSafeReuseLog2,
  maxLog2DForDisplay,
  DOOM_SLOPE_BITS_PER_DOUBLING,
} from './model.ts';

const bike = getScheme('bike');
const hqc = getScheme('hqc');
const mce = getScheme('mceliece');

describe('single-instance anchor', () => {
  it('effective(D=1) equals the published single-instance T1', () => {
    for (const s of SCHEMES) {
      expect(effectiveSecurityBits(s, 1)).toBeCloseTo(s.singleInstanceBits, 10);
    }
  });

  it('all three schemes share the 143-bit Level-1 floor', () => {
    for (const s of SCHEMES) expect(s.targetSecurityBits).toBe(143);
  });
});

describe('the √D degradation law', () => {
  it('loses exactly ½ bit per doubling of D', () => {
    for (const s of SCHEMES) {
      const drop = effectiveSecurityBits(s, 2) - effectiveSecurityBits(s, 4);
      expect(drop).toBeCloseTo(DOOM_SLOPE_BITS_PER_DOUBLING, 10);
    }
  });

  it('is monotonically decreasing in D', () => {
    for (const s of SCHEMES) {
      expect(effectiveSecurityBits(s, 1000)).toBeLessThan(effectiveSecurityBits(s, 10));
    }
  });

  it('rejects D < 1 instead of fabricating a value', () => {
    expect(() => effectiveSecurityBits(bike, 0)).toThrow();
    expect(() => effectiveSecurityBits(bike, 0.5)).toThrow();
    expect(() => syndromeCount(bike, 0)).toThrow();
  });

  it('is deterministic (pure): identical input → identical output', () => {
    expect(effectiveSecurityBits(hqc, 12345)).toBe(effectiveSecurityBits(hqc, 12345));
  });
});

describe('syndrome counts (mechanism, sourced)', () => {
  it('BIKE harvests ≈ n·D; HQC and McEliece ≈ D', () => {
    const D = 2 ** 11;
    expect(syndromeCount(bike, D)).toBe(bike.codeLengthN * D);
    expect(syndromeCount(hqc, D)).toBe(D);
    expect(syndromeCount(mce, D)).toBe(D);
  });

  it('does NOT double-count n in the bit formula', () => {
    // If n·D leaked into effectiveSecurityBits, BIKE(D=1) would differ from T1.
    expect(effectiveSecurityBits(bike, 1)).toBeCloseTo(bike.singleInstanceBits, 10);
  });
});

describe('crossovers vs the paper', () => {
  it('reproduces the paper-stated Level-1 crossovers (transcribed)', () => {
    expect(hqc.paperCrossoverLog2D).toBe(34);
    expect(bike.paperCrossoverLog2D).toBe(11);
    expect(mce.paperCrossoverLog2D).toBe(21);
  });

  it('HQC and BIKE agree (modeled ≈ paper, within tolerance)', () => {
    expect(crossoverD(hqc).agree).toBe(true);
    expect(crossoverD(bike).agree).toBe(true);
  });

  it('McEliece disagrees and is flagged (real ISD slope ≈0.39, not ½)', () => {
    const c = crossoverD(mce);
    expect(c.agree).toBe(false);
    expect(c.computedLog2).toBeLessThan(c.paperStatedLog2 as number); // law under-states resilience
    // both values are exposed, never silently dropped
    expect(c.computed).toBeGreaterThan(0);
    expect(c.paperStated).toBeGreaterThan(0);
  });

  it('ordering: BIKE erodes fastest, then McEliece, then HQC', () => {
    const order = [bike, mce, hqc].map((s) => crossoverD(s).computedLog2);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });

  it('the curve is at/above floor before the modeled crossover and below after', () => {
    for (const s of SCHEMES) {
      const k = crossoverD(s).computedLog2;
      expect(isBelowFloor(s, 2 ** (k - 1))).toBe(false);
      expect(isBelowFloor(s, 2 ** k)).toBe(true);
    }
  });
});

describe('margin + safe-reuse helpers', () => {
  it('marginToFloor is positive above and negative below the floor', () => {
    expect(marginToFloor(bike, 1)).toBeGreaterThan(0);
    expect(marginToFloor(bike, 2 ** 20)).toBeLessThan(0);
  });

  it('maxSafeReuseLog2 is the largest log2(D) still at/above target', () => {
    for (const s of SCHEMES) {
      const k = maxSafeReuseLog2(s, s.targetSecurityBits);
      expect(effectiveSecurityBits(s, 2 ** k)).toBeGreaterThanOrEqual(s.targetSecurityBits);
      expect(effectiveSecurityBits(s, 2 ** (k + 1))).toBeLessThan(s.targetSecurityBits);
    }
  });

  it('a higher safety margin shrinks the safe-reuse budget', () => {
    expect(maxSafeReuseLog2(hqc, 143 + 10)).toBeLessThan(maxSafeReuseLog2(hqc, 143));
  });
});

describe('display bounds', () => {
  it('the slider max comfortably passes every crossover', () => {
    const max = maxLog2DForDisplay();
    for (const s of SCHEMES) {
      expect(max).toBeGreaterThan(crossoverD(s).computedLog2);
      if (s.paperCrossoverLog2D !== 'UNKNOWN') {
        expect(max).toBeGreaterThan(s.paperCrossoverLog2D);
      }
    }
  });
});
