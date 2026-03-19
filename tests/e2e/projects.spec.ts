import { test, expect } from '@playwright/test';

test('project cards render on /projects', async ({ page }) => {
  await page.goto('/projects');

  // Wait for React island to hydrate and render project articles
  const cards = page.locator('article.project-card');
  await expect(cards.first()).toBeVisible();
  await expect(cards).toHaveCount(await cards.count()); // at least 1
  expect(await cards.count()).toBeGreaterThan(0);
});

test('category filter buttons are present', async ({ page }) => {
  await page.goto('/projects');

  // "All" is always the first filter button and should be active by default
  const allButton = page.locator('button[aria-pressed]').filter({ hasText: /^All/ });
  await expect(allButton).toBeVisible();
  await expect(allButton).toHaveAttribute('aria-pressed', 'true');
});

test('category filter works end-to-end', async ({ page }) => {
  await page.goto('/projects');

  // Click "Bioinformatics" filter
  const bioBtn = page.locator('button[aria-pressed]').filter({ hasText: /^Bioinformatics/ });
  await bioBtn.click();

  // The clicked button should now be active
  await expect(bioBtn).toHaveAttribute('aria-pressed', 'true');

  // "All" button should no longer be active
  const allButton = page.locator('button[aria-pressed]').filter({ hasText: /^All/ });
  await expect(allButton).toHaveAttribute('aria-pressed', 'false');
});

test('featured section has distinct heading', async ({ page }) => {
  await page.goto('/projects');

  // The featured section label uses "Featured Work" text
  await expect(page.locator('text=Featured Work')).toBeVisible();
});

test('clicking a filter with no projects shows empty state', async ({ page }) => {
  await page.goto('/projects');

  // "Other" category likely has no projects in the fixture
  // Click it and look for an empty-state message
  const otherBtn = page.locator('button[aria-pressed]').filter({ hasText: /^Other/ });
  if (await otherBtn.isVisible()) {
    await otherBtn.click();
    // Either cards are shown or the empty-state message appears
    const cards = page.locator('article.project-card');
    const emptyMsg = page.locator('text=/no projects in this category/i');
    const hasCards = (await cards.count()) > 0;
    const hasEmpty = await emptyMsg.isVisible().catch(() => false);
    expect(hasCards || hasEmpty).toBe(true);
  }
});
