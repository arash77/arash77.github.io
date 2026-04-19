import { test, expect } from '@playwright/test';

const PAGES = ['/', '/projects', '/resume', '/impressum', '/datenschutz'] as const;

for (const path of PAGES) {
  test(`${path} has <title> and meta[name="description"]`, async ({ page }) => {
    await page.goto(path);

    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);

    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(desc).toBeTruthy();
    expect((desc ?? '').length).toBeGreaterThan(0);
  });

  test(`${path} has required Open Graph tags`, async ({ page }) => {
    await page.goto(path);

    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    expect(ogTitle?.length ?? 0).toBeGreaterThan(0);

    const ogDesc = await page.locator('meta[property="og:description"]').getAttribute('content');
    expect(ogDesc?.length ?? 0).toBeGreaterThan(0);

    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogImage?.length ?? 0).toBeGreaterThan(0);
  });

  test(`${path} has a canonical URL`, async ({ page }) => {
    await page.goto(path);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBeTruthy();
    expect(() => new URL(canonical!)).not.toThrow();
  });
}

test('/og.png returns a valid PNG response', async ({ request }) => {
  const response = await request.get('/og.png');
  expect(response.status()).toBe(200);
  const contentType = response.headers()['content-type'];
  expect(contentType).toMatch(/image\/(png|jpeg|webp)/);
});

test('JSON-LD on / has @type "Person"', async ({ page }) => {
  await page.goto('/');

  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  expect(jsonLd).toBeTruthy();

  const data = JSON.parse(jsonLd!);
  expect(data['@type']).toBe('Person');
});

test('/sitemap-index.xml exists and is valid XML', async ({ request }) => {
  const response = await request.get('/sitemap-index.xml');
  expect(response.status()).toBe(200);

  const body = await response.text();
  expect(body).toContain('<sitemapindex');
});
