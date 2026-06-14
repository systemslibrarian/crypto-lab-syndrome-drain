# FIX-NOTES — fact-check pass against `2026-517.pdf`

Source of truth: the committed PDF's text layer (`2026-517.pdf` → `paper.txt`,
the `pdftotext -layout` extraction also committed in the repo). Image rendering
of the PDF was unavailable in this environment (`pdftoppm` not present), so
passages were confirmed against the PDF's extracted text layer, which is the
same content and is what `PAPER-NOTES.md` already cites. Page numbers below are
the paper's printed page numbers (visible in `paper.txt` running footers).

Headline crossover trio left untouched (already correct, per Abstract):
HQC-1 = 2³⁴, BIKE-1 = 2¹¹, mceliece3488-64 = 2²¹.

---

## FIX 1 — Common-Code HQC crossover (2⁹ → 2¹⁰)

**What the PDF says:** Page 13 — "we fall below the NIST security levels with
MMT-DOOM already for small values of M, namely for 2¹⁰ (HQC-1), 2³⁵ (HQC-3), and
2¹² (HQC-5) public keys, see also Table 3." Table 3 MMT row, HQC-1: **M = 10,
T = 142.61** (the Common-Code *secret-key* recovery uses **nM** syndromes; §3.2).
So the Common-Code HQC crossover is **2¹⁰**.

**What the repo said before:** Searched `README.md`, `index.html`, all of `src/`,
`PAPER-NOTES.md`, FAQ/misconceptions copy, CSS — for `2⁹`, `512`, "Common Code".
The repo **does not surface the Common-Code attack at all**, and contains **no
2⁹ / 512 public-key figure** anywhere.

**Result:** **No change needed.** There is no 2⁹ Common-Code claim to correct,
and the prompt forbids introducing a 2¹⁰ where no Common-Code claim exists.

---

## FIX 2 — HQC syndrome count: session-key is M, not nM

**What the PDF says (the table the fix is built on):**

| Attack                              | Syndromes | Paper location |
|-------------------------------------|-----------|----------------|
| BIKE session-key recovery           | **nM**    | Abstract; §4.1 (p. 14) "we define nM many syndromes" |
| HQC **session-key** recovery        | **M**     | §3.1 (p. 8): "we define M syndromes σᵢ"; "the multiplication with P′·T_ℓ prevents us from obtaining more syndromes through the quasi-cyclic structure of the ring"; DOOM instance `(P, 3wₑ, (σᵢ)_{1≤i≤M})` |
| HQC **Common-Code secret-key** rec. | **nM**    | §3.2 (pp. 11–13): "From M instances we derive nM syndromes" |
| Classic McEliece session-key rec.   | **M**     | §5.1 (pp. 17–18): "We collect M syndromes c⁽¹⁾…c⁽ᴹ⁾"; DOOM instance `(P, w, s⁽¹⁾…s⁽ᴹ⁾)` |

**What the repo said before:** The DOOM-mechanism explainer **already** made the
correct distinction:
- `index.html` footnote: "BIKE re-harvests its whole ring every session (≈ n·D),
  while HQC's reduction blocks the ring (≈ D) and Classic McEliece has no ring at
  all (≈ D)."
- `src/main.ts` `renderSyndromeCards`: BIKE → `≈ n · D`; HQC → `≈ D` ("ring
  blocked by the reduction — one per session"); McEliece → `≈ D`.
- `README.md` line 27: "≈ n·D for BIKE … and ≈ D for HQC and Classic McEliece" —
  already correct for session-key recovery.

So the substantive labeling (HQC session-key = M, **not** nM) was already right.
The explainer did **not** attach n·D to HQC and did **not** show a blanket n·D.

**Model double-counting check (STOP condition):** `model.ts` does **not**
double-apply n to HQC. `syndromeCount()` returns `D` for HQC (n·D only for BIKE),
and `effectiveSecurityBits()` is `T₁ − ½·log₂(D)` with no extra `n` factor. No
formula change made; no STOP finding.

**What changed:** The explainer *asserted* "HQC's reduction blocks the ring" but
did not **teach** why. Added a short clause naming the mechanism — multiplying by
**P′·T_ℓ** to cancel the message destroys the cyclic ring structure, so the n
cyclic shifts no longer yield valid syndromes (p. 8) — in:
- `index.html` mechanism footnote, and
- the HQC syndrome-card note in `src/main.ts`.

This is a labeling/teaching correction only; no `model.ts` arithmetic touched.
(The demo does not surface the Common-Code attack, so no HQC Common-Code = nM
label was added.)

---

## FIX 3 — McEliece model-vs-paper gap (verify only)

**What the PDF says:** Page 18 — "For parameter sets mceliece3488-64 (NIST level
1) … we fall below the desired security levels for M ≥ 2²¹" (Table 7 MMT row,
3488-64: **M = 21, T = 142.97**). Same page: "to be in line with the methodology
taken by the HQC and BIKE team, we are using throughout our work a **pure time
metric, not penalizing memory costs**" — which is why several single-instance MMT
complexities already sit below the security level ("our single instance MMT bit
complexities are already below the desired security levels").

**What the repo said before:** README "honest by construction" section: modeled
≈2¹⁷ vs **paper 2²¹**, gap attributed to McEliece's real ISD slope ≈0.39 being
shallower than the idealized ½. Paper value stated as 2²¹.

**Result:** **No change needed.** The README's paper value (2²¹), the pure-time-
metric rationale, and the slope explanation all match the PDF.

---

## Items that could not be verified from the PDF

None affecting these three fixes. One environment caveat: the PDF could not be
rendered to an image here (`pdftoppm` unavailable), so verification used the
committed PDF text layer (`paper.txt`) rather than the rendered page. All quoted
numbers and sentences were located verbatim in that text layer.
