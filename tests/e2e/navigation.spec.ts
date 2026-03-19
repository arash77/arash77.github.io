import { test, expect } from '@playwright/test';

const PAGES = ['/', '/projects', '/resume'] as const;

for (const path of PAGES) {
  test(`${path} loads with status 200`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
  });
}

test('nav links navigate correctly', async ({ page }) => {
  await page.goto('/');

  // Click "Projects" in the desktop nav
  await page.locator('header nav a[href="/projects"]').first().click();
  await expect(page).toHaveURL('/projects');

  // Click "Resume"
  await page.locator('header nav a[href="/resume"]').first().click();
  await expect(page).toHaveURL('/resume');

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
});
