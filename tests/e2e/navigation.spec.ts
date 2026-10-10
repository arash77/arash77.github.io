import { test, expect } from '@playwright/test';

const PAGES = ['/', '/projects', '/resume', '/impressum', '/datenschutz', '/lpg-trip', '/lpg-trip/privacy'] as const;

for (const path of PAGES) {
  test(`${path} loads with status 200`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
  });
}

// Cloudflare Pages treats a build without a top-level 404.html as a
// single-page app and answers every unknown URL with the homepage and a 200.
test('unknown paths get the 404 page with status 404', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
});

test('nav links navigate correctly', async ({ page }) => {
  await page.goto('/');

  // Click "Projects" in the desktop nav
  await page.locator('header nav a[href="/projects/"]').first().click();
  await expect(page).toHaveURL('/projects/');

  // Click "Resume"
  await page.locator('header nav a[href="/resume/"]').first().click();
  await expect(page).toHaveURL('/resume/');

  // Click "Home" (logo link)
  await page.locator('header a[href="/"]').first().click();
  await expect(page).toHaveURL('/');
});

test('skip-to-content link is present and points to #main-content', async ({ page }) => {
  await page.goto('/');
  const skipLink = page.locator('a[href="#main-content"]');
  await expect(skipLink).toBeAttached();
});

test('footer links have correct hrefs', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');

  await expect(footer.locator('a[href*="github.com"]')).toBeVisible();
  await expect(footer.locator('a[href*="linkedin.com"]')).toBeVisible();
  await expect(footer.locator('a[href^="mailto:"]')).toBeVisible();
  await expect(footer.locator('a[href="/impressum/"]')).toBeVisible();
  await expect(footer.locator('a[href="/datenschutz/"]')).toBeVisible();
});

test('the navbar brand stays on one line at 320px without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  const brand = page.locator('header a[aria-label="Home"] span');
  const { height, lineHeight } = await brand.evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    lineHeight: parseFloat(getComputedStyle(el).lineHeight),
  }));
  expect(height).toBeLessThan(lineHeight * 1.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
