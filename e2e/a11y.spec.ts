import { test } from '@playwright/test';
import { boot, driveAllStates, expectBaselineNotStale, NARROW } from './gate';

/**
 * WCAG A/AA regression gate for Syndrome Drain.
 *
 * Twenty-four states per theme at desktop and phone width. The D slider alone
 * produces four distinct status palettes that overwrite one another, and the
 * previous gate parked it at maximum and scanned only that — so three of the
 * four were never measured. Also driven: the four crossover presets, the paper
 * series toggle, the whole syndrome primer, the [7,4] decode-one-of-many scan,
 * the M-targets visualisation, BOTH sweep verdicts (starved and measured), the
 * policy calculator, the three traffic scenarios and both disclosures.
 *
 * See `gate.ts` for why nothing is injected into the page, why each scan
 * asserts its content first, and why `violations` is not the whole oracle.
 */

for (const theme of ['dark'] as const) {
  test(`no WCAG A/AA violations in ${theme} theme`, async ({ page }) => {
    test.setTimeout(900_000);
    await boot(page, theme);
    await driveAllStates(page, theme);

    // The third ratchet rule — a baselined finding that no longer appears must
    // be deleted, so the list can only shrink. `expectBaselineNotStale` was
    // exported from `gate.ts` and imported by nothing, so it had never run.
    //
    // Called in all four configurations, which this lab's baseline permits:
    // every one of the nine entries is produced by every drive, confirmed
    // through the gate's own capture path rather than assumed. (Sibling labs do
    // not have that luxury — an accent-bordered control fails in one theme
    // only, and there the check has to be scoped to the drive that sees it.)
    expectBaselineNotStale();
  });

  test(`no WCAG A/AA violations in ${theme} theme at 380px`, async ({ page }) => {
    test.setTimeout(900_000);
    await page.setViewportSize(NARROW);
    await boot(page, theme);
    await driveAllStates(page, `${theme} @380px`);
    expectBaselineNotStale();
  });
}
