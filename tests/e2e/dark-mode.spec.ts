import { test, expect } from '@playwright/test';

test('toggle adds "dark" class to <html>', async ({ page }) => {
  // Start in a clean light-mode state
  await page.goto('/');
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  });

  const html = page.locator('html');
  await expect(html).not.toHaveClass(/\bdark\b/);

  await page.locator('button[aria-label="Toggle dark mode"]').first().click();

  await expect(html).toHaveClass(/\bdark\b/);
});

test('toggle removes "dark" class when already dark', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  });

  const html = page.locator('html');
  await expect(html).toHaveClass(/\bdark\b/);

  await page.locator('button[aria-label="Toggle dark mode"]').first().click();

  await expect(html).not.toHaveClass(/\bdark\b/);
});

test('dark-mode preference persists across page reload (localStorage)', async ({ page }) => {
  await page.goto('/');
  // Ensure we start in light mode
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  });

  // Toggle to dark
  await page.locator('button[aria-label="Toggle dark mode"]').first().click();

  // Verify it was stored
  const stored = await page.evaluate(() => localStorage.getItem('theme'));
  expect(stored).toBe('dark');

  // Reload — the inline script in Layout.astro should re-apply dark class
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
});

test('meta[name="theme-color"] updates to dark value after toggle', async ({ page }) => {
  await page.goto('/');
  // Start in light mode
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  });

  // Toggle to dark
  await page.locator('button[aria-label="Toggle dark mode"]').first().click();

  const content = await page.locator('meta[name="theme-color"]').getAttribute('content');
  expect(content).toBe('#041618');
});

test('meta[name="theme-color"] updates to light value after toggle back', async ({ page }) => {
  await page.goto('/');
  // Start in dark mode
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  });

  // Toggle back to light
  await page.locator('button[aria-label="Toggle dark mode"]').first().click();

  const content = await page.locator('meta[name="theme-color"]').getAttribute('content');
  expect(content).toBe('#f7fcfc');
});
