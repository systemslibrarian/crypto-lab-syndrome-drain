# Syndrome Drain

`code-based KEMs` · `BIKE` · `HQC` · `Classic McEliece` · `DOOM` · `Vite + TypeScript` · `no backend`

**Multi-Instance Security Degradation of Code-Based KEMs** — an educational
visualizer for the result in
[May & Sá Diogo, IACR ePrint 2026/517](https://eprint.iacr.org/2026/517).

🔗 **Live demo:** https://systemslibrarian.github.io/crypto-lab-syndrome-drain/

> This lab **computes** effective bit-security from published NIST Level‑1
> parameters and the paper's √D degradation law. It runs **no attack** — no
> decoding, no DOOM execution, no random numbers. Every number on screen is real
> arithmetic you can audit in [`src/model.ts`](src/model.ts) and
> [`PAPER-NOTES.md`](PAPER-NOTES.md).

---

## What it shows

Code-based KEMs rest on **syndrome decoding**. *Decoding One Out of Many* (DOOM,
Sendrier) says that holding `M` syndromes for the same key lets you decode one of
them about **√M faster** — a saving of ½·log₂(M) bits.

When a single public key is reused to derive **D** session keys, an attacker
assembles many syndromes at once: **≈ n·D** for BIKE (its quasi-cyclic ring
donates `n` per session), and **≈ D** for HQC and Classic McEliece. The effective
security therefore *drains* with D. For NIST Level‑1 parameters it falls below
the 143‑bit floor at roughly **D = 2¹¹ (BIKE‑1)**, **2²¹ (mceliece3488‑64)**, and
**2³⁴ (HQC‑1)** — so **public keys must be rotated on a schedule tied to session
volume.**

The page has: an interactive **erosion chart** (slider for D, preset jump
buttons for each crossover, three live curves, the red floor line, **both**
modeled and paper‑stated crossover markers, live readout table), a **DOOM
mechanism** explainer with live syndrome counts, a **key‑rotation policy
calculator** that turns a session rate into a rotation cadence, a
**Parameters & sources** drill‑down where every number cites the paper, an
honest **Known Gaps** panel, and a scripture footer.

The chart deliberately plots **two** crossover markers per scheme: a filled dot
(the idealized √D model) and a hollow diamond (the paper's full‑ISD table). For
mceliece3488‑64 they sit visibly apart — the model‑vs‑paper distinction is made
native to the visual, not buried in prose.

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
npm install
npm run dev      # local dev server
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

You can deep‑link a specific reuse count with `?d=` (log₂ of D), e.g.
`…/?d=21`.

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

## Related demos

Other labs in the `crypto-lab` series:

- **crypto-lab-aes-modes** — AES block-cipher modes, visualized.

---

*Educational use. Numbers are computed from published parameters; this is
asymptotic multi-instance degradation, not a break of syndrome decoding.
Per-instance hardness is intact. No warranties — verify before relying.*
