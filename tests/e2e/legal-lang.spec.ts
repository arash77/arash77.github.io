import { test, expect } from '@playwright/test';

test('toggle to EN sets data-legal-lang="en" on <html>', async ({ page }) => {
  await page.goto('/impressum');
  await page.evaluate(() => localStorage.removeItem('legal-lang'));
  await page.reload();

  await page.locator('button[data-lang-btn="en"]').first().click();

  await expect(page.locator('html')).toHaveAttribute('data-legal-lang', 'en');
});

test('toggle back to DE removes data-legal-lang from <html>', async ({ page }) => {
  await page.goto('/impressum');
  await page.evaluate(() => localStorage.setItem('legal-lang', 'en'));
  await page.reload();

  await page.locator('button[data-lang-btn="de"]').first().click();

  await expect(page.locator('html')).not.toHaveAttribute('data-legal-lang');
});

test('EN preference persists across reload', async ({ page }) => {
  await page.goto('/impressum');
  await page.locator('button[data-lang-btn="en"]').first().click();

  const stored = await page.evaluate(() => localStorage.getItem('legal-lang'));
  expect(stored).toBe('en');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-legal-lang', 'en');
});

test('EN preference persists from /impressum to /datenschutz', async ({ page }) => {
  await page.goto('/impressum');
  await page.locator('button[data-lang-btn="en"]').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-legal-lang', 'en');

  await page.goto('/datenschutz');
  await expect(page.locator('html')).toHaveAttribute('data-legal-lang', 'en');
});

test('EN preference persists from /datenschutz to /impressum', async ({ page }) => {
  await page.goto('/datenschutz');
  await page.locator('button[data-lang-btn="en"]').first().click();

  await page.goto('/impressum');
  await expect(page.locator('html')).toHaveAttribute('data-legal-lang', 'en');
});

test('EN content visible and DE content hidden when EN active', async ({ page }) => {
  await page.goto('/impressum');
  await page.locator('button[data-lang-btn="en"]').first().click();

  await expect(page.locator('[data-lang="en"]').first()).toBeVisible();
  await expect(page.locator('[data-lang="de"]').first()).not.toBeVisible();
});

test('DE content visible and EN content hidden by default', async ({ page }) => {
  await page.goto('/impressum');
  await page.evaluate(() => localStorage.removeItem('legal-lang'));
  await page.reload();

  await expect(page.locator('[data-lang="de"]').first()).toBeVisible();
  await expect(page.locator('[data-lang="en"]').first()).not.toBeVisible();
});
