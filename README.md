# crypto-lab-syndrome-drain

## What It Is

Syndrome Drain is an educational visualizer for the result in
[May & Sá Diogo, IACR ePrint 2026/517](https://eprint.iacr.org/2026/517) —
**Multi-Instance Security Degradation of Code-Based KEMs**. Code-based KEMs rest on
**syndrome decoding**. *Decoding One Out of Many* (DOOM, Sendrier) says that
holding `M` syndromes for the same key lets you decode one of them about **√M
faster** — a saving of ½·log₂(M) bits. When a single public key is reused to
derive **D** session keys, an attacker assembles many syndromes at once: **≈ n·D**
for BIKE (its quasi-cyclic ring donates `n` per session), and **≈ D** for HQC and
Classic McEliece. The effective security therefore *drains* with D. For NIST
Level‑1 parameters it falls below the 143‑bit floor at roughly **D = 2¹¹
(BIKE‑1)**, **2²¹ (mceliece3488‑64)**, and **2³⁴ (HQC‑1)** — so **public keys must
be rotated on a schedule tied to session volume.** This lab **computes** effective
bit-security from published NIST Level‑1 parameters and the paper's √D degradation
law; it runs **no attack** — no decoding, no DOOM execution, no random numbers.
Every number on screen is real arithmetic you can audit in
[`src/model.ts`](src/model.ts) and [`PAPER-NOTES.md`](PAPER-NOTES.md). Built with
Vite + TypeScript, no backend.

## When to Use It

- Use it to understand **multi-instance security degradation** — how reusing one code-based KEM public key across many sessions erodes effective bit-security.
- Use it to plan **key-rotation policy** — the rotation calculator turns a session rate into a rotation cadence with realistic traffic-scenario presets.
- Use it to see **why BIKE drains faster** than HQC or Classic McEliece (the `n·D` vs `D` syndrome-count mechanism), and why ML-KEM/Kyber is not hit the same way.
- Do NOT read the on-screen numbers as a break of code-based crypto — it is a teaching visualizer of an asymptotic √D model, runs no attack, and per-instance hardness is intact; verify before relying.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-syndrome-drain](https://systemslibrarian.github.io/crypto-lab-syndrome-drain/)**

The page is layered for progressive disclosure: a **TL;DR** card up top, a **live security‑level meter** that gives the qualitative "is it OK?" glance as you drag D, an interactive **erosion chart** (slider for D, preset jump buttons for each crossover, three live curves, the red floor line, both modeled and paper‑stated crossover markers, and a live readout table), a **DOOM mechanism** explainer with live syndrome counts, a **key‑rotation policy calculator** with realistic traffic‑scenario presets, a **Common misconceptions** FAQ (including why ML‑KEM/Kyber isn't hit the same way), a **Parameters & sources** drill‑down where every number cites the paper plus a copy‑pasteable **"verify it yourself"** block, and an honest **Known Gaps** panel. Every model‑derived number carries an inline **"idealized √D model"** badge, and the chart plots two crossover markers per scheme (a filled dot for the model, a hollow diamond for the paper's full‑ISD table) so the model‑vs‑reality distinction is native to the UI. You can deep‑link a specific reuse count with `?d=` (log₂ of D), e.g. `…/?d=21`.

## What Can Go Wrong

- **Reusing one public key across many sessions** — effective security drains by ½·log₂(D) bits; high-volume reuse can push a Level‑1 key below the 143‑bit floor.
- **BIKE reuses are worse** — its quasi-cyclic structure donates ≈ n syndromes per session (≈ n·D total), so BIKE‑1 crosses the floor far sooner (~D = 2¹¹) than HQC or McEliece.
- **No rotation schedule** — without rotating keys on a cadence tied to session volume, accumulated syndromes silently erode the security margin over time.
- **Conflating the idealized √D model with reality** — for mceliece3488‑64 the simple √D law (~2¹⁷) and the paper's full‑ISD table (2²¹) disagree, because McEliece's real ISD slope (~0.39) is shallower than the ½ the law assumes; trusting one number blindly misstates the margin.
- **Assuming all PQ KEMs degrade equally** — this effect is specific to code-based syndrome decoding; structured-lattice KEMs like ML-KEM are not hit the same way.

## Real-World Usage

- **Code-based KEMs in PQC** — BIKE, HQC, and Classic McEliece are the code-based candidates from the NIST post-quantum process; HQC was selected for standardization.
- **Key-rotation policy** — the result argues directly for rotating code-based KEM public keys on a schedule tied to how many sessions each key derives.
- **Conservative / long-term deployments** — Classic McEliece is favored where decades-old, well-studied hardness assumptions matter, despite very large public keys.
- **Hybrid post-quantum key exchange** — code-based KEMs are deployed alongside classical exchanges so security holds if either component survives.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-syndrome-drain
cd crypto-lab-syndrome-drain
npm install
npm run dev
```

## Related Demos

- [crypto-lab-mceliece-gate](https://systemslibrarian.github.io/crypto-lab-mceliece-gate/) — Classic McEliece with Goppa codes, one of the KEMs whose multi-instance margin is modeled here.
- [crypto-lab-hqc-vault](https://systemslibrarian.github.io/crypto-lab-hqc-vault/) — HQC, the Reed-Muller/Reed-Solomon code-based KEM selected by NIST.
- [crypto-lab-bike-vault](https://systemslibrarian.github.io/crypto-lab-bike-vault/) — BIKE, the QC-MDPC KEM whose quasi-cyclic structure makes its drain fastest.
- [crypto-lab-hqc-timing](https://systemslibrarian.github.io/crypto-lab-hqc-timing/) — an HQC BCH-decoder timing oracle and the case for constant-time decoding.
- [crypto-lab-hqc-timing-break](https://systemslibrarian.github.io/crypto-lab-hqc-timing-break/) — a cache-timing soft-ISD attack on HQC, another angle on code-based KEM security.

## The model (honest by construction)

`effectiveSecurityBits(D) = T₁ − ½·log₂(D)`, anchored on each scheme's published
single‑instance MMT bit complexity `T₁` (the attacker's best variant, pure‑time
metric). The `n·D` vs `D` syndrome counts are shown as the *mechanism*; because
`n` is a constant it is a fixed offset already folded into `T₁`, so it is not
applied twice (doing so would break the published 2³⁴ crossover — see
[`src/model.test-notes.md`](src/model.test-notes.md)).

`crossoverD()` computes each crossover from the model **and** cross‑checks it
against the paper's full‑ISD tables. They agree for HQC and BIKE; for
**mceliece3488‑64 they differ** (modeled ≈2¹⁷ vs paper 2²¹, because McEliece's
real ISD slope ≈0.39 is shallower than the ½ the law assumes). The demo shows
**both** and flags the gap rather than silently trusting one.

## Develop

```bash
npm test         # vitest — guards the model against regression
npm run build    # tsc --noEmit && vite build  →  dist/
npm run preview  # serve the production build
```

No runtime dependencies; TypeScript + Vite only. The pure computation core
([`src/model.ts`](src/model.ts)) has no DOM access and is deterministic — same
input, same output, no `Math.random`, no `Date`, no network. Its invariants
(D=1 ⇒ T₁, crossover ordering, the model‑vs‑paper agreement flags, no `n·D`
double‑counting, D<1 throws) are pinned by [`src/model.test.ts`](src/model.test.ts)
and run in CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Deploy

Pushes to `main` build and publish to **GitHub Pages** via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). The Vite `base`
is `/crypto-lab-syndrome-drain/` to match the repo path.

## Accessibility & mobile

Built mobile‑first and to WCAG AA intent: semantic landmarks, a skip link,
keyboard‑operable controls with a visible focus ring, `aria-live` readouts and a
full screen‑reader text description of the chart, generous touch targets,
`prefers-reduced-motion` and `prefers-contrast` support, and tables that reflow
into cards on narrow screens. Dark is the default theme; the toggle persists to
`localStorage`.

## Sources

- Alexander May & Gabriel Sá Diogo, *Multi-Instance Security Degradation of
  Code-Based KEMs*, IACR ePrint **2026/517**.
- N. Sendrier, *Decoding One Out of Many*, PQCrypto 2011 (DOOM).
- Esser, May, Zweydinger, *McEliece needs a break*, EUROCRYPT 2022 (MMT‑DOOM).
- Official Level‑1 parameter sets: HQC‑1, BIKE‑1, mceliece3488‑64.

Transcribed values and per‑number citations live in
[`PAPER-NOTES.md`](PAPER-NOTES.md).

## Disclaimer

*Educational use. Numbers are computed from published parameters; this is
asymptotic multi-instance degradation, not a break of syndrome decoding.
Per-instance hardness is intact. No warranties — verify before relying.*

---

*One of 120+ browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
