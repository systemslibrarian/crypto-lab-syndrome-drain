# Syndrome Drain 10/10 Assessment

For what this demo is trying to be, the path to **10/10** is less "add more stuff" and more "make the trust, interpretation, and operational takeaway impossible to miss."

The biggest upgrade: **surface the McEliece model-vs-paper discrepancy directly in the main visualizer**, not mainly in Known Gaps. Right now the chart plots the idealized `1/2 * log2(D)` curve from `src/model.ts`, while the headline/README emphasizes the paper-stated `2^21` McEliece crossover. A 10/10 version should show both on the chart: modeled crossover marker and paper-stated crossover marker, with a small legend note like "idealized sqrt(D) law" vs "paper full-ISD table." That would make the central visual as honest as the prose already is.

Second: add **real executable tests** for the pure model. `src/model.test-notes.md` is excellent as an audit narrative, but a 10/10 demo should have Vitest or similar checking invariants: `D=1` equals `T1`, BIKE/HQC/McEliece crossover ordering, paper agreement flags, `D < 1` throws, no accidental double-counting of `n * D`, and expected values at `2^11`, `2^21`, `2^34`. That turns "auditable" into "guarded against regression."

Third: make the **policy calculator more operational**. It already answers "is this D safe?" A great version would also answer: "At my traffic rate, how often do I rotate?" Add inputs like sessions/day, safety buffer in bits, and maybe an output like "rotate every 18 hours / every 750k sessions." That makes the demo move from educational to decision-support without pretending to be a standard.

Fourth: improve the chart interaction. Add keyboard/focusable crossover markers, hover/focus tooltips, a scheme toggle, and maybe preset buttons for `D = 2^11`, `2^21`, `2^34`. The current slider is clear, but the "aha" points should be one click away.

Fifth: add **source drill-down per displayed number**. The README and `PAPER-NOTES.md` are strong, but the UI could expose tiny "source" links or expandable rows for `T1`, `n`, syndrome growth, and paper crossover. A serious crypto demo gets a lot of credibility when every number can be chased immediately.

Sixth: add a small **Assumptions / Model switch** area. For example: "Idealized sqrt(D) law" vs "paper-stated crossover markers." You do not need to implement full ISD curves, but the UI should make the distinction visually native, not an afterthought.

Seventh: tighten the "10/10 product feel" with validation: Playwright screenshots for desktop/mobile, Lighthouse/accessibility pass, and maybe an `npm test` plus `npm run build` CI workflow. The accessibility work in `index.html` and `src/style.css` is already thoughtful; automated checks would make that confidence repeatable.

Priority order:

1. **Main-chart paper vs modeled crossover markers**, especially McEliece.
2. **Executable model tests**.
3. **Rotation interval calculator** using sessions/day and safety margin.
4. **Interactive chart tooltips / preset jump buttons**.
5. **Inline source drill-down for constants**.
6. **CI with build, tests, and basic visual/accessibility checks**.

The current demo already has a strong spine: pure deterministic model, good caveats, sourced notes, and a real operational message. The 10/10 version would make the distinction between "paper result," "idealized model," and "operator action" visually unavoidable.
