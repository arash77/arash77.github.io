import { test, expect } from '@playwright/test';

/**
 * Scroll thread with a classic scrollbar (Chrome and Edge on Windows): the
 * scrollbar takes layout width, and a scroll lock (the mobile menu) hides it
 * while padding <body> by its width. A separate file because the browser
 * launch options differ (headless Chromium hides scrollbars by default).
 */
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

test('opening and closing the mobile menu leaves the route at the visible width', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 700, height: 800 });
  await page.goto('/');
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; } ::-webkit-scrollbar { width: 15px; }' });
  await expect(page.locator('[data-thread-knot]')).toHaveCSS('opacity', '1', { timeout: 6000 });
  const widths = () =>
    page.evaluate(() => {
      const svg = document.querySelector('[data-thread-svg]')!;
      return { cw: document.documentElement.clientWidth, svg: Number(svg.getAttribute('width')) };
    });
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect.poll(widths).toEqual({ cw: 685, svg: 685 });
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.clientWidth)).toBe(700);
  // Anything that wakes the drawing loop while the menu is open.
  await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
  await page.waitForTimeout(300);
  // The layout under the overlay did not change width: neither does the route.
  expect((await widths()).svg).toBe(685);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.documentElement.clientWidth)).toBe(685);
  await page.waitForTimeout(500);
  expect(await widths()).toEqual({ cw: 685, svg: 685 });
  // The right rail is inside the visible area.
  const maxX = await page.evaluate(() => {
    const path = document.querySelector<SVGPathElement>('[data-thread-path]')!;
    let m = 0;
    for (let l = 0, total = path.getTotalLength(); l <= total; l += 4) m = Math.max(m, path.getPointAtLength(l).x);
    return m;
  });
  expect(maxX).toBeLessThanOrEqual(685 - 6);
});
