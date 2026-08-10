import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditNonText, formatNonTextFailures, type NonTextFailure } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** A phone-width viewport, for the WCAG 1.4.10 reflow half of the gate. */
export const NARROW = { width: 380, height: 800 };

/**
 * Shared machinery for the WCAG gate.
 *
 * Three rules govern everything here:
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN. The gate this file
 *     replaces did drive the slider and both DOOM exhibits — better than most
 *     in this fleet — but then called `openAllDetails`, forcing the collapsed
 *     verification block open, and injected `animation-duration: 0s` /
 *     `transition-duration: 0s`, so the suite was structurally incapable of
 *     observing a transition or theme-swap defect.
 *
 *     More seriously it scanned ONE accumulated end state per theme, at desktop
 *     width, and asserted on axe `violations` alone — so every intermediate
 *     status the D slider produces (safe, thin, below-floor) was overwritten by
 *     the final one before anything looked at it.
 *
 *  2. EVERY SCAN ASSERTS ITS CONTENT IS PRESENT FIRST, and there are scans well
 *     past first paint. axe over an empty container passes having checked
 *     nothing, and the chart SVG, the three tables, the level meter and the
 *     syndrome cards are all injected by main.ts.
 *
 *  3. `violations` IS NOT THE WHOLE ORACLE. See `scan`.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Transitions drain in waves, not in one batch, so a poll for "nothing running
 * right now" can exit through a gap between waves. Require quiescence to hold
 * for several consecutive frames instead.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __quietFrames?: number };
      const running = document.getAnimations().filter((a) => a.playState === 'running');
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      return w.__quietFrames >= 6;
    },
    undefined,
    { timeout: 20_000, polling: 'raf' }
  );
}

/**
 * Assert that reduced motion left the page visible, not merely un-animated.
 *
 * The failure mode this guards against is an element whose only route to its
 * visible state is an animation, in a stylesheet whose reduced-motion block
 * cancels that animation without restoring its end state — the element then
 * renders at `opacity: 0` for every reader with the preference set. This lab
 * DOES cancel animations outright (`animation: none !important`), so the check
 * is load-bearing — but its one animation is `lm-pulse` on the live meter's
 * `::first-letter`, which starts AND ends at `opacity: 1`, so cancelling it
 * leaves the bullet visible. No element rule here sets `opacity: 0` waiting to
 * be animated open.
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      // Deliberately hidden subtrees are not "blank", they are closed.
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/**
 * Load the page in a known theme with reduced motion actually in effect, and
 * assert the content every scan relies on is really on the page.
 *
 * `test.use({ reducedMotion })` silently does nothing on Playwright 1.61.1, so
 * the emulation is applied imperatively BEFORE the navigation and then
 * *asserted* from inside the page.
 *
 * The theme is seeded in `localStorage` rather than reached by clicking the
 * toggle, so the page boots in the theme under test instead of transitioning
 * into it — and the light-theme walk is a fresh load rather than a walk of a
 * page that was mid-transition when the first scan ran.
 */
export async function boot(page: Page, theme: 'dark' | 'light'): Promise<void> {
  // Fail fast on an unreachable control. Playwright's default action timeout is
  // the whole test timeout, so a click on something a sticky header covers, or
  // a locator gated on a prerequisite that never ran, silently burns the entire
  // budget instead of pointing at the state it could not reach.
  page.setDefaultTimeout(20_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
  await page.goto('.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect'
  ).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

  // main.ts injects the chart, the three tables, the level meter and the
  // primer matrix on load. Scanning before they exist is scanning empty boxes.
  await expect(page.locator('#d-slider')).toBeVisible();
  await expect(page.locator('#chart svg')).toBeVisible();
  await expect(page.locator('#readout-body tr')).toHaveCount(3);
  await expect(page.locator('#ops-body tr')).toHaveCount(3);
  await expect(page.locator('#src-body tr')).toHaveCount(3);
  await expect(page.locator('#primer-bits button')).toHaveCount(7);
  await expect(page.locator('#level-meter')).not.toBeEmpty();

  await settle(page);
  await expectNotBlank(page, `${theme} first paint`);
}

/**
 * Assert the page does not require horizontal scrolling.
 *
 * WCAG 1.4.10 (Reflow, AA). axe has no rule for this at all, and this lab is a
 * plausible offender: it prints three wide tables, a `repeat(auto-fit,
 * minmax(200px, 1fr))` syndrome-card grid whose fixed floor a 380px viewport
 * cannot go below, and several fixed-column grids (`6.5rem 5rem minmax(0,1fr)`)
 * carrying long monospace bit strings.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;

    // Only elements that actually push the DOCUMENT sideways are culprits. A
    // wide table inside an `overflow-x: auto` wrapper has a huge bounding rect
    // but is clipped by its scroller and contributes nothing to the document's
    // scroll width — naming it sends you off fixing the wrong element.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement;
      while (n && n !== doc) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };

    const widest = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .filter((x) => !clipped(x.el))
      .sort((a, b) => b.r.right - a.r.right)[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1).
 * If it holds no focusable content it needs `tabindex="0"`, so it becomes a
 * focus target arrow keys can then scroll.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return (
          ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY)
        );
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`
      );
  });
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`
  ).toEqual([]);
}

/**
 * Scan the page as it currently stands.
 *
 * Five assertions, because axe's `violations` array alone is not a complete
 * oracle:
 *
 *  - `violations` — the usual WCAG A/AA rule failures.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. The one rule id allowed to remain incomplete is
 *    `color-contrast`, and only because the next assertion computes those
 *    ratios arithmetically. Everything else in that bucket is a real result
 *    axe simply could not finish — including `aria-prohibited-attr`, which is
 *    where an `aria-label` on a role-less div hides, a defect that never
 *    reaches the violations array at all.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
/**
 * WCAG 1.4.11 and generated content, ratcheted against a per-repo baseline.
 *
 * Neither class has ANY other oracle: axe has no rule for non-text contrast,
 * and the arithmetic text walk cannot reach a control's boundary or a
 * `::before` glyph, because a pseudo-element is not an element and owns no text
 * node. Both were being found by hand-sampling screenshot pixels, which does
 * not regress-test.
 *
 * The backlog is real, so this does not block on it — but a check that merely
 * logs is not a gate, and this sweep has spent its whole length deleting checks
 * that could not fail. So it ratchets instead: anything NOT in the baseline
 * fails, anything in the baseline that got WORSE fails, and anything in the
 * baseline that has been FIXED fails until its entry is deleted. That last rule
 * is what stops the allowlist becoming a permanent exemption.
 */
const nonTextSeen = new Set<string>();

export async function expectNoNewNonTextFailures(page: Page, label: string): Promise<void> {
  const found = await auditNonText(page);
  // Capture mode: emit every finding and assert nothing, so a baseline can be
  // generated by the SAME path that checks it. Opt-in via env, and the run is
  // deliberately left failing at the end by `expectBaselineNotStale` so a
  // capture pass can never be mistaken for a passing gate.
  if (process.env.NT_BASELINE_CAPTURE) {
    for (const f of found) {
      console.log(`NTCAP|${f.kind}|${f.selector}|${f.ratio}|${f.required}|${/POSITIONED/.test(f.detail)}`);
    }
    return;
  }
  const problems: string[] = [];
  for (const f of found) {
    const key = `${f.kind}|${f.selector}`;
    nonTextSeen.add(key);
    const base = NONTEXT_BASELINE[key];
    if (!base) {
      problems.push(`NEW ${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`);
    } else if (f.ratio < base.ratio - 0.01) {
      problems.push(
        `WORSE ${f.selector}: ${f.ratio}:1, baseline recorded ${base.ratio}:1`
      );
    }
  }
  expect(problems, `new or worsened non-text contrast in state: ${label}`).toEqual([]);
}

/**
 * Fail if a baselined finding never appeared during the whole drive.
 *
 * It has either been fixed — in which case delete the entry, which is the point
 * — or the drive stopped reaching the state that shows it, which is a coverage
 * regression worth knowing about. Call once, after `driveAllStates`.
 */
export function expectBaselineNotStale(): void {
  const unseen = Object.keys(NONTEXT_BASELINE).filter((k) => !nonTextSeen.has(k));
  expect(
    unseen,
    'baselined non-text findings that no longer appear — delete them from nontext-baseline.ts (or restore the drive state that showed them)'
  ).toEqual([]);
}

export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  expect(violations, `axe violations in state: ${label}`).toEqual([]);

  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  expect(unexplainedIncomplete, `axe incomplete results in state: ${label}`).toEqual([]);

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  expect(contrast, `measured contrast failures in state: ${label}`).toEqual([]);

  await expectNoNewNonTextFailures(page, label);
  await expectScrollersReachable(page, label);
  await expectNoHorizontalOverflow(page, label);
}

/**
 * Drive the whole single-page document, scanning each state.
 *
 * EVERY control on the page is reached, which the old gate did not manage. It
 * drove `#d-slider` (to its maximum only), `#hdoom-run`, `#lab-starve`,
 * `#lab-budget` and `#lab-run`, and left these untouched: the four `.preset`
 * crossover jumps, `#show-paper`, the whole syndrome primer
 * (`#primer-bits` toggles, `#primer-clear`, `#primer-single`),
 * `#doom-targets`, `#hdoom-m`, `#hdoom-trials`, `#lab-maxm`, `#lab-trials`,
 * the four policy-calculator number inputs, the three traffic `.scenario`
 * presets, and both `<details>`.
 *
 * The D slider is the lab's central control and it produces THREE distinct
 * status palettes — safe, thin, and below-floor — that overwrite one another.
 * Scanning only the parked end state, as the old gate did, means two of the
 * three were never measured by anything. Each is visited here.
 */
export async function driveAllStates(page: Page, theme: string): Promise<void> {
  await scan(page, `${theme} / first paint (D = 1)`);

  await page.locator('.cl-skip-link').focus();
  await scan(page, `${theme} / skip link focused`);

  // ── The D slider — every status palette, not just the last one ─────────
  for (const [log2, label] of [
    ['8', 'safe'],
    ['18', 'thinning'],
    ['28', 'at or below the floor'],
    ['40', 'far below the floor'],
  ] as const) {
    await page.locator('#d-slider').fill(log2);
    await expect(page.locator('#d-exp')).toHaveText(log2);
    await expect(page.locator('#readout-body tr')).toHaveCount(3);
    await scan(page, `${theme} / D = 2^${log2} (${label})`);
  }

  // The four crossover presets: each jumps the slider and re-renders the chart
  // marker, the level meter and all three tables.
  for (const log2 of ['0', '11', '21', '34']) {
    await page.locator(`.preset[data-log2="${log2}"]`).click();
    await expect(page.locator('#d-exp')).toHaveText(log2);
    await scan(page, `${theme} / crossover preset 2^${log2}`);
  }

  // The paper-crossover series is a second set of chart marks and legend rows.
  await page.locator('#show-paper').uncheck();
  await expect(page.locator('#chart svg')).toBeVisible();
  await scan(page, `${theme} / paper crossovers hidden`);
  await page.locator('#show-paper').check();

  // ── The syndrome primer ────────────────────────────────────────────────
  // Never driven at all. Each bit toggle re-renders the H-e matrix, the weight
  // readout and the syndrome, and the collision state is its own rendering.
  const bits = page.locator('#primer-bits button');
  await page.locator('#primer-clear').click();
  await expect(page.locator('#primer-weight')).toHaveText('0');
  await scan(page, `${theme} / primer with no flips`);

  await bits.nth(0).click();
  await bits.nth(3).click();
  await expect(page.locator('#primer-weight')).toHaveText('2');
  await scan(page, `${theme} / primer with two flips`);

  await page.locator('#primer-single').click();
  await expect(page.locator('#primer-weight')).toHaveText('1');
  await scan(page, `${theme} / primer with one random flip`);

  // Flipping every bit is the maximum-weight rendering, and the collision note
  // is populated from whatever error vector shares this syndrome.
  for (let i = 0; i < 7; i++) {
    const pressed = await bits.nth(i).getAttribute('aria-pressed');
    if (pressed !== 'true') await bits.nth(i).click();
  }
  await expect(page.locator('#primer-weight')).toHaveText('7');
  await scan(page, `${theme} / primer with every bit flipped`);
  await page.locator('#primer-clear').click();

  // ── The [7,4] decode-one-of-many exhibit ───────────────────────────────
  await page.locator('#hdoom-m').fill('8');
  await expect(page.locator('#hdoom-m-val')).toHaveText('8');
  await page.locator('#hdoom-trials').fill('60');
  await expect(page.locator('#hdoom-trials-val')).toHaveText('60');
  await scan(page, `${theme} / DOOM scan controls set`);

  await page.locator('#hdoom-run').click();
  await expect(page.locator('#hdoom-out .hdoom-stats li')).toHaveCount(3, { timeout: 120_000 });
  await scan(page, `${theme} / DOOM scan measured`);

  // ── The M-targets visualisation ────────────────────────────────────────
  await page.locator('#doom-targets').fill('10');
  await expect(page.locator('#doom-m-exp')).toHaveText('10');
  await expect(page.locator('#doom-viz svg')).toBeVisible();
  await scan(page, `${theme} / 2^10 targets held at once`);

  // ── The toy-DOOM sweep lab: both verdicts ──────────────────────────────
  // Starving it is the FAILURE verdict — the lab refuses to fit a slope and
  // says so, with its own palette and failed rows.
  await page.locator('#lab-starve').click();
  await expect(page.locator('[data-verdict]')).toHaveAttribute('data-verdict', 'incomplete', {
    timeout: 120_000,
  });
  await scan(page, `${theme} / sweep starved (no slope claimed)`);

  await page.locator('#lab-maxm').fill('6');
  await page.locator('#lab-trials').fill('4');
  await page.locator('#lab-budget').fill('200000');
  await page.locator('#lab-run').click();
  await expect(page.locator('#lab-chart svg')).toBeVisible({ timeout: 300_000 });
  await expect(page.locator('#lab-body tr').first()).toBeVisible();
  await scan(page, `${theme} / sweep measured`);

  // ── The key-rotation policy calculator ─────────────────────────────────
  // Four number inputs and three scenario presets, none of them ever driven.
  await page.locator('#target-input').fill('192');
  await page.locator('#margin-input').fill('16');
  await page.locator('#budget-input').fill('1000000000');
  await page.locator('#rate-input').fill('1');
  await expect(page.locator('#ops-body tr')).toHaveCount(3);
  await scan(page, `${theme} / policy calculator at an unreachable target`);

  for (const rate of ['1000', '100000', '5000000']) {
    await page.locator(`.scenario[data-rate="${rate}"]`).click();
    await expect(page.locator('#ops-body tr')).toHaveCount(3);
    await scan(page, `${theme} / traffic scenario ${rate} per day`);
  }

  // ── The two disclosures ────────────────────────────────────────────────
  // One ships open and one collapsed; the old gate forced both open at once
  // and so never scanned either in the configuration a visitor arrives at.
  await page.locator('.sources-details.verify-block summary').click();
  await expect(page.locator('.sources-details.verify-block')).toHaveAttribute('open', '');
  await scan(page, `${theme} / verification block open`);

  await page.locator('.sources-details:not(.verify-block) summary').click();
  await expect(page.locator('.sources-details:not(.verify-block)')).not.toHaveAttribute('open', '');
  await scan(page, `${theme} / sources collapsed`);
}
