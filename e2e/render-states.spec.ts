import { expect, test } from '@playwright/test';

/**
 * Blocking regressions on the RENDERED states of the chart, the level meter,
 * the verdict banner, the readout table and the primer.
 *
 * The unit suite proves the model's arithmetic. This proves the page actually
 * paints what that arithmetic says, at each distinct state, including the
 * boundaries where a verdict flips. Reference points, all derived from the
 * published Level-1 numbers in model.ts:
 *
 *   BIKE      T1 = 148.17  ⇒  crosses the 143-bit floor at D = 2^11
 *   McEliece  T1 = 151.22  ⇒  crosses at D = 2^17
 *   HQC       T1 = 160.04  ⇒  crosses at D = 2^35
 *
 * so the banner must read 0, 1, 2 and 3 schemes below the floor at
 * D = 2^10, 2^11, 2^17 and 2^35 respectively.
 */

async function setD(page: import('@playwright/test').Page, log2d: number): Promise<void> {
  await page.locator('#d-slider').fill(String(log2d));
  await page.locator('#d-slider').dispatchEvent('input');
  await expect(page.locator('#d-exp')).toHaveText(String(log2d));
}

test.beforeEach(async ({ page }) => {
  await page.goto('.');
  await expect(page.locator('#d-slider')).toBeVisible();
});

test('the verdict banner changes state at each computed crossover', async ({ page }) => {
  await setD(page, 10);
  await expect(page.locator('.lm-banner')).toHaveClass(/lm-warn/);
  await expect(page.locator('.lm-banner-status')).toContainText('Margin is getting thin');
  await expect(page.locator('#readout-body tr.is-below')).toHaveCount(0);
  await expect(page.locator('#readout-body .pill.danger')).toHaveCount(0);

  // One doubling later BIKE is under the floor and the whole banner flips.
  await setD(page, 11);
  await expect(page.locator('.lm-banner')).toHaveClass(/lm-crit/);
  await expect(page.locator('.lm-banner-status')).toContainText('1 of 3 are below NIST Level 1');
  await expect(page.locator('#readout-body tr.is-below')).toHaveCount(1);
  await expect(page.locator('#readout-body .pill.danger')).toHaveCount(1);
  await expect(page.locator('#readout-body .pill.safe')).toHaveCount(2);

  await setD(page, 17);
  await expect(page.locator('.lm-banner-status')).toContainText('2 of 3 are below NIST Level 1');
  await expect(page.locator('#readout-body tr.is-below')).toHaveCount(2);

  await setD(page, 35);
  await expect(page.locator('.lm-banner-status')).toContainText(
    'All three are below NIST Level 1',
  );
  await expect(page.locator('#readout-body tr.is-below')).toHaveCount(3);
  await expect(page.locator('#readout-body .pill.safe')).toHaveCount(0);
});

test('the per-scheme meter bands span every qualitative label', async ({ page }) => {
  await setD(page, 0);
  // BIKE starts with only 5.17 bits of headroom; the other two are comfortable.
  await expect(page.locator('.lm-item.lm-warn')).toHaveCount(1);
  await expect(page.locator('.lm-item.lm-safe')).toHaveCount(2);
  await expect(page.locator('.lm-item.lm-warn .lm-band')).toHaveText('Thin margin');

  const max = await page.locator('#d-slider').getAttribute('max');
  await setD(page, Number(max));
  // At the far end BIKE and McEliece are more than 8 bits under the floor.
  await expect(page.locator('.lm-item.lm-crit')).toHaveCount(2);
  await expect(page.locator('.lm-item.lm-danger')).toHaveCount(1);
  await expect(page.locator('.lm-item.lm-danger .lm-band')).toHaveText('Below floor');
});

test('the chart paints one curve, one crossover mark and one live dot per scheme', async ({
  page,
}) => {
  await setD(page, 20);
  await expect(page.locator('#chart path.scheme-line')).toHaveCount(3);
  await expect(page.locator('#chart circle.cross-dot')).toHaveCount(3);
  await expect(page.locator('#chart circle.now-dot')).toHaveCount(3);
  await expect(page.locator('#chart line.now-line')).toHaveCount(1);
  await expect(page.locator('#chart line.floor-line')).toHaveCount(1);
  await expect(page.locator('#chart text.floor-label')).toHaveText('Level-1 floor: 143 bits');

  // The paper-crossover diamonds are a real toggle, not decoration.
  await expect(page.locator('#chart polygon.paper-mark')).toHaveCount(3);
  await page.locator('#show-paper').uncheck();
  await expect(page.locator('#chart polygon.paper-mark')).toHaveCount(0);
  await page.locator('#show-paper').check();
  await expect(page.locator('#chart polygon.paper-mark')).toHaveCount(3);
});

test('the screen-reader chart description tracks the rendered numbers', async ({ page }) => {
  await setD(page, 0);
  // effective(D=1) is the published single-instance T1 for each scheme.
  await expect(page.locator('#chart-desc')).toContainText('HQC 160.0 bits, above floor');
  await expect(page.locator('#chart-desc')).toContainText('BIKE 148.2 bits, above floor');
  await expect(page.locator('#chart-desc')).toContainText('Floor is 143 bits');

  await setD(page, 12);
  // 148.17 − ½·12 = 142.17
  await expect(page.locator('#chart-desc')).toContainText('BIKE 142.2 bits, below floor');
});

test('the syndrome-count cards recompute per scheme as D moves', async ({ page }) => {
  await setD(page, 0);
  const cards = page.locator('#syndrome-cards li');
  await expect(cards).toHaveCount(3);
  // BIKE is the n·D scheme; the other two are one syndrome per session.
  await expect(page.locator('#syndrome-cards')).toContainText('≈ n · D');
  await expect(page.locator('#syndrome-cards')).toContainText(
    'ring shifts donate n = 12,323 per session',
  );

  const bikeCard = cards.filter({ hasText: 'BIKE' });
  const before = (await bikeCard.textContent()) ?? '';
  await setD(page, 10);
  const after = (await bikeCard.textContent()) ?? '';
  expect(after).not.toEqual(before);
  // 12,323 × 1,024 ≈ 12.6M syndromes at D = 2^10.
  expect(after).toContain('12.6M');
});

test('the D readout and the shareable URL follow the slider', async ({ page }) => {
  await setD(page, 20);
  await expect(page.locator('#d-value')).toHaveText('1.0M');
  expect(new URL(page.url()).searchParams.get('d')).toBe('20');

  // A deep link restores that exact state on load.
  await page.goto('./?d=11');
  await expect(page.locator('#d-exp')).toHaveText('11');
  await expect(page.locator('.lm-banner')).toHaveClass(/lm-crit/);

  // Out-of-range input is clamped, not obeyed.
  await page.goto('./?d=9999');
  const max = await page.locator('#d-slider').getAttribute('max');
  await expect(page.locator('#d-exp')).toHaveText(String(max));
});

test('the rotation calculator flips its per-scheme verdicts on the inputs', async ({ page }) => {
  await page.locator('#target-input').fill('143');
  await page.locator('#margin-input').fill('0');
  await page.locator('#budget-input').fill('1000');
  await page.locator('#budget-input').dispatchEvent('input');
  // 2^10 sessions is inside every scheme's limit at a zero safety margin.
  await expect(page.locator('#ops-body .pill.safe')).toHaveCount(3);

  await page.locator('#budget-input').fill('1000000000');
  await page.locator('#budget-input').dispatchEvent('input');
  // 10^9 ≈ 2^30 is past BIKE's 2^10 limit but inside HQC's 2^34.
  await expect(page.locator('#ops-body .pill.danger')).toHaveCount(2);
  await expect(page.locator('#ops-body tr.is-below')).toHaveCount(2);

  // Demanding a huge safety margin puts everything below at D = 1.
  await page.locator('#margin-input').fill('60');
  await page.locator('#margin-input').dispatchEvent('input');
  await expect(page.locator('#ops-body')).toContainText('already below at D = 1');
  await expect(page.locator('#ops-body .pill.danger')).toHaveCount(3);
});

test('the syndrome primer computes H·e and its coset for real', async ({ page }) => {
  await page.locator('#primer-clear').click();
  await expect(page.locator('#primer-s')).toHaveText('000');
  await expect(page.locator('#primer-s-read')).toContainText('all zero');
  await expect(page.locator('#primer-weight')).toHaveText('0');

  // Column j of H is the binary of j+1, so flipping bit 1 gives syndrome 001.
  await page.locator('#primer-bits .bit').nth(0).click();
  await expect(page.locator('#primer-s')).toHaveText('001');
  await expect(page.locator('#primer-s-read')).toContainText('single flip at position 1');
  await expect(page.locator('#primer-weight')).toHaveText('1');
  await expect(page.locator('#primer-collision-text')).toContainText(
    '16</strong> different error patterns'.replace('</strong>', ''),
  );

  // Flipping bit 7 alone gives 111 = 7.
  await page.locator('#primer-bits .bit').nth(0).click();
  await page.locator('#primer-bits .bit').nth(6).click();
  await expect(page.locator('#primer-s')).toHaveText('111');
  await expect(page.locator('#primer-s-read')).toContainText('position 7');
});
