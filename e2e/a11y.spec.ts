import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Strict WCAG regression gate for Syndrome Drain.
 *
 * The app is a single-page, slider-driven visualizer rendered by main.ts. It
 * has two real <details> (one open by default, one collapsed) plus several
 * dynamically-injected regions (chart SVG, live level-meter, readout / ops /
 * sources tables, syndrome cards) that main.ts populates on load and on slider
 * input. Before scanning we:
 *   - wait for the app + injected regions to mount,
 *   - drive the slider to a below-floor D so the danger/warn states render,
 *   - open every <details>,
 *   - neutralize animation/transition/opacity so mid-flight states can't hide
 *     text from the contrast checker.
 * Scans both themes with WCAG 2.0/2.1 A + AA rules; asserts zero violations.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function killMotion(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `*,*::before,*::after{
      animation-duration:0s!important;animation-delay:0s!important;
      transition-duration:0s!important;transition-delay:0s!important;
      opacity:1!important;scroll-behavior:auto!important;
    }`,
  });
}

async function openAllDetails(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const d of document.querySelectorAll('details')) {
      (d as HTMLDetailsElement).open = true;
    }
  });
}

// Drive the slider across the range so every level-meter / readout state
// (safe, thin, below-floor, dangerously-low) has been rendered, then park it
// at a high D so the below-floor styling (danger pills, critical banner, tinted
// rows) is what axe measures.
async function driveDemo(page: Page): Promise<void> {
  const slider = page.locator('#d-slider');
  const max = await slider.getAttribute('max');
  await slider.fill(max ?? '40');
  await slider.dispatchEvent('input');
  await expect(page.locator('#readout-body tr')).toHaveCount(3);
  await expect(page.locator('#ops-body tr')).toHaveCount(3);
  await expect(page.locator('#src-body tr')).toHaveCount(3);
  await expect(page.locator('.lm-banner').first()).toBeVisible();

  // Run the [7,4] decode-one-out-of-many exhibit so its measured output is on
  // the page to be scanned.
  await page.locator('#hdoom-run').click();
  await expect(page.locator('#hdoom-out .hdoom-stats li')).toHaveCount(3);

  // Run the toy-DOOM lab twice: once starved (critical verdict, failed rows)
  // and once for real (success verdict, full chart + table), so axe measures
  // both verdict palettes and the injected SVG.
  await page.locator('#lab-starve').click();
  await expect(page.locator('[data-verdict]')).toHaveAttribute('data-verdict', 'incomplete', {
    timeout: 30_000,
  });
  await page.locator('#lab-budget').fill('200000');
  await page.locator('#lab-run').click();
  await expect(page.locator('[data-verdict]')).toHaveAttribute('data-verdict', 'agree', {
    timeout: 30_000,
  });
  await expect(page.locator('#lab-body tr')).toHaveCount(9);
  await expect(page.locator('#lab-chart svg')).toBeVisible();
}

async function scan(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
  }));
  expect(summary).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.goto('.');
  await expect(page.locator('#cl-theme-toggle')).toBeVisible();
  await expect(page.locator('#d-slider')).toBeVisible();
  await killMotion(page);
});

test('no WCAG A/AA violations in dark theme', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await driveDemo(page);
  await openAllDetails(page);
  await killMotion(page);
  await scan(page);
});

test('no WCAG A/AA violations in light theme', async ({ page }) => {
  await page.locator('#cl-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await driveDemo(page);
  await openAllDetails(page);
  await killMotion(page);
  await scan(page);
});
