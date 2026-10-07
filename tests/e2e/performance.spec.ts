import { test, expect } from '@playwright/test';

// On a phone the hero is the whole first screen and its name is the page's
// largest paint (LCP). These guard what made it slow on a mobile connection.

test('the hero name shows without waiting for any script', async ({ page }) => {
  // No script arrives at all: the intro plays in CSS anyway and the name shows.
  await page.route(/\.js(\?.*)?$/, (route) => route.abort());
  await page.goto('/');
  const name = page.getByRole('heading', { level: 1 });
  await expect.poll(() => name.evaluate((el) => parseFloat(getComputedStyle(el).opacity)), { timeout: 3000 }).toBeGreaterThan(0.99);
});

test('the hero avatar is a small modern image, fetched early', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 823 });
  await page.goto('/');
  const avatar = page.getByRole('img', { name: 'Arash Kadkhodaei' });
  await expect(avatar).toHaveAttribute('fetchpriority', 'high');
  await expect.poll(() => avatar.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const { src, bytes } = await avatar.evaluate((el: HTMLImageElement) => {
    const entry = performance.getEntriesByName(el.currentSrc)[0] as PerformanceResourceTiming | undefined;
    return { src: el.currentSrc, bytes: entry?.encodedBodySize ?? -1 };
  });
  expect(src).toMatch(/\.avif$/);
  expect(bytes).toBeGreaterThan(0);
  expect(bytes, `${src} is ${bytes} bytes`).toBeLessThan(50_000);
});

test('no stylesheet request holds up the first paint: the CSS comes with the HTML', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="stylesheet"]')).toHaveCount(0);
  await expect(page.locator('head style')).not.toHaveCount(0);
});

test('only the fonts of the first screen are preloaded', async ({ page }) => {
  // Every preload is fetched at once, ahead of the avatar and the scripts:
  // preloading all weights (16 files) held those back by about 2 s on a
  // slow phone connection. The rest load on demand.
  await page.goto('/');
  const preloads = await page.locator('link[rel="preload"][as="font"]').count();
  expect(preloads).toBeGreaterThan(0);
  expect(preloads).toBeLessThanOrEqual(3);
});
