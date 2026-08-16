import { test, expect } from '@playwright/test';

/**
 * Visual regression baselines.
 *
 * Every other e2e spec asserts structure (titles, meta tags, hrefs, ARIA).
 * None of them asserts appearance, so a styling-layer major — Tailwind, GSAP,
 * an Astro CSS change — can ship a visually broken site with all of them green.
 * These screenshots are the gate that makes unattended major upgrades safe.
 *
 * Determinism comes from `reducedMotion: 'reduce'`:
 *   - the GSAP hooks in src/components/* return early under that media query
 *   - global.css then forces `.gsap-reveal { opacity: 1; visibility: visible }`
 * so pages settle into a fully-rendered static state with no animation frames
 * to race. Fonts are self-hosted via fontsource, so there is no network race.
 *
 * Baselines are generated on ubuntu-latest by .github/workflows/update-snapshots.yml
 * — never locally, since font rasterisation differs between distros. After an
 * intentional design change, run that workflow to refresh them.
 */

const PAGES = [
  { path: '/', name: 'home' },
  { path: '/projects', name: 'projects' },
  { path: '/resume', name: 'resume' },
  { path: '/impressum', name: 'impressum' },
  { path: '/datenschutz', name: 'datenschutz' },
] as const;

const THEMES = ['light', 'dark'] as const;

for (const theme of THEMES) {
  test.describe(`${theme} theme @visual`, () => {
    test.beforeEach(async ({ page }) => {
      // Must be emulateMedia(), not test.use({ reducedMotion }) -- the latter
      // silently fails to apply here (verified: matchMedia reports false), which
      // produced baselines of a half-animated page that were stable but useless.
      // Both must happen before goto(): the GSAP hooks read the media query when
      // their effect runs, and the theme script runs at document parse.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((t) => {
        localStorage.setItem('theme', t);
      }, theme);
    });

    for (const { path, name } of PAGES) {
      test(`${name} page renders as expected`, async ({ page }) => {
        await page.goto(path, { waitUntil: 'load' });

        // Assert the precondition rather than silently capturing the wrong
        // theme — otherwise a regression in the theme script would just make
        // both baselines identical and the dark suite would stop testing
        // anything.
        const html = page.locator('html');
        if (theme === 'dark') {
          await expect(html).toHaveClass(/\bdark\b/);
        } else {
          await expect(html).not.toHaveClass(/\bdark\b/);
        }

        // Webfonts must be swapped in before capture, or the first run bakes a
        // fallback-font baseline that every later run diffs against.
        await page.evaluate(() => document.fonts.ready.then(() => undefined));

        await expect(page).toHaveScreenshot(`${name}-${theme}.png`, {
          fullPage: true,
        });
      });
    }
  });
}
