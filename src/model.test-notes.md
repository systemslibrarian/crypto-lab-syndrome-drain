# model.test-notes.md — auditing the math without running anything

This documents, in prose, exactly which formula and which sourced value each
function in `model.ts` implements. Cross-reference: `PAPER-NOTES.md` (values) →
`2026-517.pdf` (the paper). All values are NIST Level 1, MMT (best attack), pure
time metric. `D` ≡ the paper's `M` (session keys reused under one public key).

The lab COMPUTES; it does not attack. No decoding, no DOOM execution, no RNG.

---

## 1. `effectiveSecurityBits(scheme, D) = T₁ − ½·log₂(D)`

The paper's degradation law. DOOM (Decoding One Out of Many) decodes one of `m`
syndromes for a √m speedup [Sendrier Sen11; Esser–May–Zweydinger EMZ22], i.e.
−½·log₂(m) bits. The paper states the multi-instance curves fall with "slope
roughly √M" in the number of session keys (Figs 2–5). Doubling `D` doubles the
syndrome count — `n·D → n·2D` for BIKE, `D → 2D` for HQC/McEliece — so in every
case the attacker loses exactly ½ bit per doubling of `D`. Hence the slope
constant `DOOM_SLOPE_BITS_PER_DOUBLING = 0.5`.

`T₁` (`singleInstanceBits`) is the paper's single-instance MMT bit complexity
(Table 2/5/7): HQC-1 160.04, BIKE-1 148.17, mceliece3488-64 151.22. By
construction `effective(D=1) = T₁`.

**Why the n·D vs D distinction is NOT a second factor in this formula.** `n` is a
constant (code length), so `½·log₂(n·D) = ½·log₂(n) + ½·log₂(D)`. The constant
`½·log₂(n)` is the √n single-instance DOOM credit the BIKE/HQC teams already took
(PAPER-NOTES §2), so it is *already inside* `T₁`. Applying it again would
double-count and break the published crossovers. Verified: feeding the n·D count
into the bit formula gives HQC a 2⁴⁸ crossover (paper: 2³⁴) — wrong. The plain
`T₁ − ½·log₂(D)` reproduces 2³⁴. So `syndromeCount()` is reported as the
*mechanism* (Section 3 of the UI) but the bit formula uses `D` directly.

## 2. `syndromeCount(scheme, D)`

Literal transcription of the DOOM-instance sizes:
- BIKE → `n·D`. §4.1: "we define **nM** many syndromes u_{i,j}, 1≤i≤M, 0≤j<n"
  (the n ring shifts Xʲ·u of each of the M encapsulations).
- HQC → `D`. §3.1: "we define **M** syndromes σ_i"; the reduction's left-mult by
  P′·Tℓ "prevents us from obtaining more syndromes through the quasi-cyclic
  structure of the ring" — so no n-fold harvest.
- McEliece → `D`. §5.1: "We collect **M** syndromes c⁽¹⁾,…,c⁽ᴹ⁾" — no ring.

## 3. `crossoverD(scheme)` — computed vs paper-stated, with discrepancy flag

`computedLog2` solves `T₁ − ½·log₂(D) < floor` for the smallest integer
`log₂(D)`: `log₂(D) > 2·(T₁ − floor)`, so `computedLog2 = ⌊2·(T₁−floor)⌋ + 1`.

`paperStatedLog2` is transcribed from the paper (Abstract & Tables): HQC 34,
BIKE 11, McEliece 21.

Results (floor = 143):

| Scheme   | 2·(T₁−143) | computedLog2 | paperLog2 | \|Δ\| | agree |
|----------|-----------:|-------------:|----------:|-----:|:-----:|
| HQC-1    | 34.08      | 35           | 34        | 1    | yes   |
| BIKE-1   | 10.34      | 11           | 11        | 0    | yes   |
| mceliece | 16.44      | 17           | 21        | 4    | **no**|

## 4. The agreement tolerance `CROSSOVER_AGREE_TOLERANCE_LOG2 = 1`

The idealized law fixes the slope at exactly ½. The paper's per-scheme empirical
ISD slopes differ: near the crossover, HQC ≈ (160.04−142.42)/34 = 0.518, BIKE ≈
(148.17−142.63)/11 = 0.504, but **McEliece ≈ (151.22−142.97)/21 = 0.393**.
Reporting crossovers as integer log₂(D) adds ±1 of rounding. So |Δlog₂| ≤ 1 is
"agreement within the idealization's resolution," which holds for HQC (slope ≈ ½)
and BIKE (slope ≈ ½). McEliece's slope is materially shallower than ½, so the
½-slope law UNDER-states its resilience (predicts 2¹⁷; paper computes 2²¹). That
is a genuine structural deviation, not rounding — `agree=false`, and the UI's
KNOWN GAPS panel shows BOTH numbers rather than trusting either silently.

## 5. Invariant check — "BIKE erodes fastest"

Crossover ordering: BIKE 2¹¹ < McEliece 2²¹ < HQC 2³⁴. BIKE reaches the floor at
the fewest reused keys, so it erodes fastest — the required ordering holds.
Honest mechanism: all three share the ≈½ slope; BIKE leads because its
single-instance margin above the floor (148.17 − 143 = 5.17 bits) is the
thinnest, a consequence of BIKE's parameters being chosen with the √n DOOM
credit already spent. (Its n·D syndrome harvest is the richest, but as shown in
§1 that richness is a constant already folded into T₁, not a steeper slope.)

## 6. Purity / determinism

No `Math.random`, no `Date`, no network, no attack loop. Every function is a pure
map from its arguments to a number/boolean/struct. `effectiveSecurityBits`,
`crossoverD`, `syndromeCount`, `marginToFloor`, `isBelowFloor` are referentially
transparent. `D < 1` throws (out of domain) rather than returning a fabricated
value.
