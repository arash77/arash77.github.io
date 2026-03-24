import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = ['/', '/projects', '/resume'] as const;

for (const path of PAGES) {
  test(`${path} has zero critical/serious accessibility violations`, async ({ page }) => {
    await page.goto(path);

    // Wait for the page to be fully hydrated
    await page.waitForLoadState('networkidle');

    // Freeze CSS animations and reveal GSAP-hidden elements so axe sees the
    // fully-rendered state. Without this, elements with animation-fill-mode:both
    // delays and .gsap-reveal { opacity:0 } look invisible to axe, which reports
    // degenerate contrast ratios for those nodes.
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
        }
        .gsap-reveal {
          opacity: 1 !important;
          visibility: visible !important;
        }
      `,
    });
    // Also clear any inline opacity/transform applied by GSAP or fill-mode:both
    await page.evaluate(() => {
      document.querySelectorAll<HTMLElement>('[style*="animation"]').forEach((el) => {
        el.style.removeProperty('animation');
        el.style.opacity = '1';
        el.style.removeProperty('transform');
      });
      document.querySelectorAll<HTMLElement>('.gsap-reveal').forEach((el) => {
        el.style.opacity = '1';
        el.style.visibility = 'visible';
      });
    });

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
