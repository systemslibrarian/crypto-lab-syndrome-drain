import { expect, test, type Page } from '@playwright/test';

async function controlBoundaryContrast(page: Page): Promise<number> {
  return page.locator("input[type='number']").first().evaluate((element) => {
    const style = getComputedStyle(element);
    const rgb = (value: string): number[] => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (value: string): number => {
      const channels = rgb(value).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const border = luminance(style.borderTopColor);
    const background = luminance(style.backgroundColor);
    return (Math.max(border, background) + 0.05) / (Math.min(border, background) + 0.05);
  });
}

test('number-input boundary clears WCAG non-text contrast', async ({ page }) => {
  await page.goto('.');
  expect(await controlBoundaryContrast(page)).toBeGreaterThanOrEqual(3);
});
