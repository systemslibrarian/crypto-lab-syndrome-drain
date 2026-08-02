import { expect, test } from '@playwright/test';

/**
 * Blocking browser regressions for the two exhibits that RUN something.
 *
 * These assert computed outcomes, not the presence of markup: the numbers the
 * page prints must be the numbers the search produced. Both the success path
 * and the learner-caused failure path are covered.
 *
 * Statistical margin: the fitted slope is asserted only through the page's own
 * ±0.2 agreement band. Over 40 independent seeds at 24 searches per point the
 * fit ranged −0.550 … −0.466 (and over 100 seeds at 12 searches per point,
 * −0.569 … −0.440), so the band carries roughly four times the observed
 * half-spread of margin. The tests drive the trials slider to its maximum to
 * take the tighter of those two distributions.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('.');
  await expect(page.locator('#lab-run')).toBeVisible();
});

test('the DOOM lab measures the √M law from searches it actually ran', async ({ page }) => {
  // No claim before a run.
  await expect(page.locator('#lab-status')).toContainText('No slope is claimed');
  await expect(page.locator('#lab-verdict')).toBeEmpty();
  await expect(page.locator('#lab-body')).toContainText('No run yet');

  await page.locator('#lab-trials').fill('24');
  await page.locator('#lab-trials').dispatchEvent('input');
  await expect(page.locator('#lab-trials-val')).toHaveText('24');

  await page.locator('#lab-run').click();

  const verdict = page.locator('[data-verdict]');
  await expect(verdict).toHaveAttribute('data-verdict', 'agree', { timeout: 30_000 });

  // The headline slope is real: parse it back out and check the band.
  const headline = (await verdict.textContent()) ?? '';
  const slope = Number(/(-?\d+\.\d+)/.exec(headline)?.[1]);
  expect(Number.isFinite(slope)).toBe(true);
  expect(Math.abs(slope - -0.5)).toBeLessThanOrEqual(0.2);

  // Every search found and re-verified a real error: 9 points × 24 searches.
  await expect(page.locator('#lab-status')).toContainText('216 searches run');
  await expect(page.locator('#lab-status')).toContainText(
    '216 found and re-verified a real weight-6 error',
  );

  // One measured row per M, all fully solved, and work really fell.
  const rows = page.locator('#lab-body tr');
  await expect(rows).toHaveCount(9);
  await expect(rows.first()).toContainText('24 / 24');
  await expect(rows.last()).toContainText('24 / 24');
  const numAt = async (row: number, col: number): Promise<number> =>
    Number(
      ((await page.locator('#lab-body tr').nth(row).locator('td').nth(col).textContent()) ?? '')
        .replace(/[^\d]/g, ''),
    );
  const enumFirst = await numAt(0, 1);
  const enumLast = await numAt(8, 1);
  const lookFirst = await numAt(0, 2);
  const lookLast = await numAt(8, 2);
  // 2^8 = 256 targets should buy about a 16× discount; demand at least 4×.
  expect(enumLast).toBeLessThan(enumFirst / 4);
  // …and the bookkeeping really does move the other way.
  expect(lookLast).toBeGreaterThan(lookFirst);

  // The chart was drawn from those points: one filled + one hollow dot per M.
  await expect(page.locator('#lab-chart svg')).toBeVisible();
  await expect(page.locator('#lab-chart circle.lab-dot:not(.lab-dot-hollow)')).toHaveCount(9);
  await expect(page.locator('#lab-chart circle.lab-dot-hollow')).toHaveCount(9);
  await expect(page.locator('#lab-chart-desc')).toContainText('fitted slope');
});

test('starving the budget makes the lab refuse to claim a slope', async ({ page }) => {
  await page.locator('#lab-starve').click();

  const verdict = page.locator('[data-verdict]');
  await expect(verdict).toHaveAttribute('data-verdict', 'incomplete', { timeout: 30_000 });
  await expect(verdict).toContainText('ran out of budget');
  await expect(page.locator('#lab-verdict')).toContainText('not a measurement of the law');
  await expect(page.locator('#lab-verdict .lm-banner')).toHaveClass(/lm-crit/);

  // The budget really was applied, and the failure is visible per row.
  await expect(page.locator('#lab-budget')).toHaveValue('40');
  await expect(page.locator('#lab-status')).toContainText('budget 40 per search');
  await expect(page.locator('#lab-body tr.is-below').first()).toBeVisible();

  // Recovering from the failure restores a real measurement.
  await page.locator('#lab-budget').fill('200000');
  await page.locator('#lab-trials').fill('24');
  await page.locator('#lab-trials').dispatchEvent('input');
  await page.locator('#lab-run').click();
  await expect(verdict).toHaveAttribute('data-verdict', 'agree', { timeout: 30_000 });
});

test('the [7,4] mini-exhibit measures guesses against the exact expectation', async ({ page }) => {
  const out = page.locator('#hdoom-out');
  await expect(out).toContainText('Run the scans');

  // M = 8 targets every syndrome, so a hit is certain on the first guess.
  await page.locator('#hdoom-m').fill('8');
  await page.locator('#hdoom-m').dispatchEvent('input');
  await page.locator('#hdoom-trials').fill('600');
  await page.locator('#hdoom-trials').dispatchEvent('input');
  await expect(page.locator('#hdoom-m-val')).toHaveText('8');
  await page.locator('#hdoom-run').click();

  await expect(out).toContainText('128 of 128 vectors are hits');
  const stats = out.locator('.hdoom-stats li');
  await expect(stats.nth(0)).toContainText('1.00');
  await expect(stats.nth(1)).toContainText('1.00');
  await expect(stats.nth(2)).toHaveClass(/hd-ok/);
  await expect(stats.nth(2)).toContainText('1.00');

  // M = 1: the exact expectation is 129/17 = 7.59, and 600 scans lands inside
  // the ±25% band the exhibit checks (sd ≈ 7 ⇒ standard error ≈ 0.29, so the
  // ±1.9 band is more than six standard errors wide).
  await page.locator('#hdoom-m').fill('1');
  await page.locator('#hdoom-m').dispatchEvent('input');
  await page.locator('#hdoom-run').click();
  await expect(out).toContainText('16 of 128 vectors are hits');
  await expect(stats.nth(1)).toContainText('7.59');
  await expect(stats.nth(2)).toHaveClass(/hd-ok/);
  const measured = Number(
    /(\d+\.\d+)/.exec((await stats.nth(0).textContent()) ?? '')?.[1],
  );
  expect(measured).toBeGreaterThan(7.59 * 0.75);
  expect(measured).toBeLessThan(7.59 * 1.25);

  // The reported error really decodes to one of the targets.
  await expect(out).toContainText('Verified against H before');
});
