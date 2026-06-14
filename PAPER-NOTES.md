# PAPER-NOTES — authoritative values transcribed from the source PDF

**Source paper:** Alexander May & Gabriel Sá Diogo, *Multi-Instance Security
Degradation of Code-Based KEMs*, IACR ePrint **2026/517**, Ruhr-University
Bochum. (PDF `2026-517.pdf` committed at repo root.)

These values were transcribed by `pdftotext -layout` extraction of the committed
PDF and hand-verified against the tables. Every constant in `src/model.ts` cites
back to a line/table here. **v1 of this lab models NIST security Level 1 only.**

> Notation bridge: the paper's variable **M** = "number of session keys (or
> public keys) derived from one public key" is exactly the build's **D**. We use
> **D** in code/UI and note `D ≡ M (paper)`.

---

## 1. The security floor (NIST Level 1)

- **Level-1 classical floor = 143 bits.**
  Source: Abstract ("drop below the desired 143 bits …") and Section 3 results
  ("falls below the NIST security levels of **143**, 207 and 272 bits,
  respectively"). (L3 = 207, L5 = 272 — out of scope for v1.)

## 2. The DOOM mechanism (Decoding One Out of Many)

- With **m** syndromes for the same parity-check matrix, decoding *one* of them
  costs a factor **≈ √m** less. Shown for Dumer–Stern by Sendrier [Sen11] and
  for MMT by Esser–May–Zweydinger [EMZ22]. Source: Abstract; Section 2 ("This
  leads in total to a speedup of O(√m)").
- A √m speedup is **−½·log₂(m) bits** of security. The paper states the
  multi-instance curves degrade with "slope **roughly √M**" in the number of
  session keys (Sections 3, 4, 5; Figs 2–5).
- Single-instance parameter selection for **HQC and BIKE already credits a √n
  DOOM speedup**, because their ring F₂[X]/(Xⁿ−1) donates n syndromes for free.
  Source: Abstract ("DOOM-type speed-ups of √n have been taking into account for
  the HQC and BIKE parameter selection in the single-instance setting").

## 3. Multi-instance syndrome counts (the lever), per scheme

For D reused session keys under one public key, the attacker assembles a DOOM
instance with this many syndromes:

- **BIKE: ≈ n·D** syndromes. Source: §4.1, "we define **nM** many syndromes
  u_{i,j} … for 1≤i≤M, 0≤j<n" (the ring shifts Xʲ·u give n per session).
- **HQC: ≈ D** syndromes. Source: §3.1, "we define **M** syndromes σ_i …".
  Critically: "the multiplication with P′·T_ℓ **prevents us from obtaining more
  syndromes through the quasi-cyclic structure of the ring**" — so HQC's ring
  does NOT donate extra multi-instance syndromes.
- **Classic McEliece: ≈ D** syndromes. Source: §5.1, "We collect **M** syndromes
  c⁽¹⁾,…,c⁽ᴹ⁾ … the M syndromes s⁽ⁱ⁾ … (P, w, s⁽¹⁾,…,s⁽ᴹ⁾)". No ring; one
  syndrome per session.

> Why n·D vs D matters: n is a **constant** (the code length), so it contributes
> a constant ½·log₂(n) vertical offset, not a steeper slope. That offset is
> already baked into BIKE's single-instance security (which credited √n). Hence
> all three curves share the same ≈√D slope, and the **starting margin** above
> the floor — not the slope — sets the crossover. BIKE crosses first because its
> single-instance margin is thinnest. See `model.test-notes.md`.

## 4. Single-instance bit complexity T₁ (pure time metric, MMT — the best/lowest)

The paper reports Dumer–Stern (DS) and MMT runtimes; MMT is the attacker's best
(lowest) and drives the abstract's crossovers. Pure time metric (no memory
penalty), consistent with the HQC/BIKE teams' methodology (§5 results note).

| Scheme            | T₁ (MMT, bits) | T₁ (DS, bits) | Source            |
|-------------------|----------------|---------------|-------------------|
| HQC-1             | **160.04**     | 165 (≈, Fig 2)| Table 2, MMT row  |
| BIKE-1            | **148.17**     | 155.51        | Table 5, MMT row  |
| mceliece3488-64   | **151.22**     | 158.50        | Table 7, MMT row  |

(DS HQC-1 T₁ exact value not needed; the lab uses MMT, the operative attack.)

## 5. Paper-stated crossover D (log₂), Level 1 (MMT)

The smallest log₂(D) at which the paper's *computed* effective security drops
below 143 bits:

| Scheme            | crossover log₂(D) | effective at crossover | Source           |
|-------------------|-------------------|------------------------|------------------|
| HQC-1             | **34**            | 142.42                 | Abstract; Table 2|
| BIKE-1            | **11**            | 142.63                 | Abstract; Table 5|
| mceliece3488-64   | **21**            | 142.97                 | Abstract; Table 7|

Abstract verbatim: "we drop below the desired 143 bits for a number of session
keys M ≳ 2³⁴ (HQC-1), M ≳ 2¹¹ (BIKE-1), respectively M ≳ 2²¹ (mceliece3488-64)."

## 6. Underlying code parameters (Level 1)

- **HQC-1** (Table 1): n = 17669, error weight wₑ = 75, w = 66, k-row = 128.
- **BIKE-1** (Table 4): n = 12323, weight w = 134.
- **mceliece3488-64** (Table 6): n = 3488, k = 2720, w = 64.

## 7. Modeling decision (auditable)

`effectiveSecurityBits(D) = T₁ − ½·log₂(D)` — the paper's explicit √D
degradation law, anchored on the real single-instance MMT T₁ (§4). The syndrome
count (n·D vs D) is reported separately (§3) as the mechanism; its constant n is
already inside T₁ (§3 note), so it is NOT applied a second time in the bit
formula (doing so would double-count and break HQC's 2³⁴ crossover).

This idealized slope-½ law is cross-checked in `crossoverD()` against the
paper-stated crossovers (§5). It matches HQC (2³⁴) and BIKE (2¹¹) within rounding
but UNDER-states McEliece's resilience (computes ≈2¹⁷ vs paper 2²¹) because
McEliece's real ISD slope is ≈0.39, not 0.5 (Table 7: (151.22−142.97)/21). That
disagreement is surfaced, not hidden (KNOWN GAPS panel + `agree:false`).

## 8. Values still UNKNOWN

- None required for the Level-1 model. (DS-only single-instance T₁ for HQC-1 is
  approximate from Fig 2 but unused; MMT drives all displayed numbers.)
