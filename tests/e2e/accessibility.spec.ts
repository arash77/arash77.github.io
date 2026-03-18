import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = ['/', '/projects', '/resume'] as const;

for (const path of PAGES) {
  test(`${path} has zero critical/serious accessibility violations`, async ({ page }) => {
    await page.goto(path);

    // Wait for the page to be fully hydrated
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const criticalOrSerious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );

    expect(
      criticalOrSerious,
      `Violations on ${path}:\n${JSON.stringify(criticalOrSerious.map((v) => ({ id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.length })), null, 2)}`,
    ).toHaveLength(0);
  });
}
