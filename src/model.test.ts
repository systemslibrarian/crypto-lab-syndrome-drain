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
  HAMMING_H,
  HAMMING_N,
  HAMMING_R,
  hammingSyndrome,
  weight,
  cosetForSyndrome,
  HAMMING_SYNDROME_COUNT,
  HAMMING_VECTOR_COUNT,
  HAMMING_COSET_SIZE,
  hammingSyndromeToInt,
  intToHammingSyndrome,
  hammingSyndromeOfMask,
  hammingDoomExpectedGuesses,
  pickHammingTargets,
  runHammingDoomTrial,
  runHammingDoom,
} from './model.ts';
import { makeRng } from './doom.ts';

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

describe('syndrome primer ([7,4] Hamming code)', () => {
  it('H has the right shape (3×7) and columns are 1..7 in binary', () => {
    expect(HAMMING_H.length).toBe(HAMMING_R);
    for (const row of HAMMING_H) expect(row.length).toBe(HAMMING_N);
    // column j (0-indexed) read top-to-bottom as MSB..LSB equals j+1
    for (let j = 0; j < HAMMING_N; j++) {
      const val = HAMMING_H[0][j] * 4 + HAMMING_H[1][j] * 2 + HAMMING_H[2][j];
      expect(val).toBe(j + 1);
    }
  });

  it('the all-zero error has the all-zero syndrome', () => {
    expect(hammingSyndrome([0, 0, 0, 0, 0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('a single-bit error at position j yields the syndrome = j in binary', () => {
    for (let j = 0; j < HAMMING_N; j++) {
      const e = Array.from({ length: HAMMING_N }, (_, i) => (i === j ? 1 : 0)) as Array<0 | 1>;
      const s = hammingSyndrome(e);
      const val = s[0] * 4 + s[1] * 2 + s[2];
      expect(val).toBe(j + 1); // nonzero → the code pinpoints the flipped bit
    }
  });

  it('two DIFFERENT error patterns can share one syndrome (decoding is ambiguous by weight)', () => {
    // e1 = single bit at pos 6; find another, heavier pattern with the same syndrome.
    const e1 = [0, 0, 0, 0, 0, 0, 1] as Array<0 | 1>;
    const s = hammingSyndrome(e1);
    const coset = cosetForSyndrome(s);
    expect(coset.length).toBe(1 << (HAMMING_N - HAMMING_R)); // 2^4 = 16 patterns per syndrome
    // the lowest-weight member is the unique single-bit error the decoder picks
    expect(weight(coset[0])).toBe(1);
    expect(coset[0]).toEqual(e1);
    // but heavier patterns exist with the identical syndrome — genuine collisions
    const heavier = coset.find((e) => weight(e) > 1);
    expect(heavier).toBeDefined();
    expect(hammingSyndrome(heavier!)).toEqual(s);
  });

  it('every syndrome partitions all 128 vectors into equal-size cosets', () => {
    const seen = new Set<string>();
    let total = 0;
    for (let a = 0; a < 2; a++)
      for (let b = 0; b < 2; b++)
        for (let c = 0; c < 2; c++) {
          const coset = cosetForSyndrome([a as 0 | 1, b as 0 | 1, c as 0 | 1]);
          total += coset.length;
          for (const e of coset) seen.add(e.join(''));
        }
    expect(total).toBe(1 << HAMMING_N); // 128, every vector accounted for once
    expect(seen.size).toBe(1 << HAMMING_N);
  });

  it('rejects malformed inputs instead of guessing', () => {
    expect(() => hammingSyndrome([0, 1, 0] as Array<0 | 1>)).toThrow();
    expect(() => cosetForSyndrome([0, 0] as Array<0 | 1>)).toThrow();
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

/* ------------------------------------------- decode-one-out-of-many at 7 bits */
describe('the [7,4] decode-one-out-of-many exhibit', () => {
  it('packs and unpacks syndromes losslessly', () => {
    for (let v = 0; v < HAMMING_SYNDROME_COUNT; v++) {
      expect(hammingSyndromeToInt(intToHammingSyndrome(v))).toBe(v);
    }
    expect(() => intToHammingSyndrome(8)).toThrow();
    expect(() => intToHammingSyndrome(-1)).toThrow();
  });

  it('the packed syndrome agrees with the matrix routine on all 128 vectors', () => {
    for (let mask = 0; mask < HAMMING_VECTOR_COUNT; mask++) {
      const e = Array.from({ length: HAMMING_N }, (_, j) => ((mask >> j) & 1) as 0 | 1);
      expect(hammingSyndromeOfMask(mask)).toBe(hammingSyndromeToInt(hammingSyndrome(e)));
    }
  });

  it('every syndrome has exactly 16 preimages — so 16·M of 128 vectors are hits', () => {
    const counts = new Array(HAMMING_SYNDROME_COUNT).fill(0);
    for (let mask = 0; mask < HAMMING_VECTOR_COUNT; mask++) counts[hammingSyndromeOfMask(mask)]++;
    for (const c of counts) expect(c).toBe(HAMMING_COSET_SIZE);
  });

  it('the closed-form expectation is exact at both ends', () => {
    expect(hammingDoomExpectedGuesses(1)).toBeCloseTo(129 / 17, 12);
    // With all 8 syndromes targeted every vector is a hit, so it always takes 1.
    expect(hammingDoomExpectedGuesses(8)).toBe(1);
    expect(() => hammingDoomExpectedGuesses(0)).toThrow();
    expect(() => hammingDoomExpectedGuesses(9)).toThrow();
  });

  it('picks M distinct targets', () => {
    const rng = makeRng(21);
    for (let M = 1; M <= HAMMING_SYNDROME_COUNT; M++) {
      const t = pickHammingTargets(M, rng);
      expect(t.length).toBe(M);
      expect(new Set(t).size).toBe(M);
    }
    expect(() => pickHammingTargets(9, rng)).toThrow();
  });

  it('a scan really recovers a vector whose syndrome is one of the targets', () => {
    const rng = makeRng(77);
    for (let M = 1; M <= 8; M++) {
      const targets = pickHammingTargets(M, rng);
      const trial = runHammingDoomTrial(targets, rng);
      expect(trial.guesses).toBeGreaterThanOrEqual(1);
      expect(trial.guesses).toBeLessThanOrEqual(HAMMING_VECTOR_COUNT);
      expect(hammingSyndromeToInt(hammingSyndrome(trial.found))).toBe(targets[trial.targetIndex]);
    }
  });

  it('targeting all 8 syndromes always succeeds on the very first guess', () => {
    const rng = makeRng(5);
    const run = runHammingDoom(8, 40, rng);
    expect(run.samples.every((g) => g === 1)).toBe(true);
    expect(run.meanGuesses).toBe(1);
    expect(run.expectedGuesses).toBe(1);
  });

  it('the measured mean tracks the exact expectation across every M', () => {
    // 8 values of M × 400 real scans = 3200 measured searches. The variance of
    // the geometric-ish first-hit position is largest at M = 1 (sd ≈ 7), so 400
    // trials puts the standard error near 0.35 and a ±25% band is > 4 sigma.
    const rng = makeRng(20260802);
    for (let M = 1; M <= HAMMING_SYNDROME_COUNT; M++) {
      const run = runHammingDoom(M, 400, rng);
      const expected = run.expectedGuesses;
      expect(run.meanGuesses).toBeGreaterThan(expected * 0.75);
      expect(run.meanGuesses).toBeLessThan(expected * 1.25 + 0.001);
    }
  });

  it('more targets are never more work — the discount is real and measured', () => {
    const rng = makeRng(31);
    const one = runHammingDoom(1, 400, rng).meanGuesses;
    const eight = runHammingDoom(8, 400, rng).meanGuesses;
    expect(eight).toBeLessThan(one / 4);
  });

  it('rejects a trial with no targets or a bad trial count', () => {
    expect(() => runHammingDoomTrial([], makeRng(1))).toThrow();
    expect(() => runHammingDoom(1, 0, makeRng(1))).toThrow();
  });
});
