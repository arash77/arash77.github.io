import { test, expect, type Page } from '@playwright/test';

/**
 * Scroll thread on the home page (src/components/SiteThread.astro).
 *
 * The geometric checks run under reduced motion: GSAP skips its reveals, so
 * getBoundingClientRect() is transform-free, and the whole route is drawn.
 */

const WIDTHS = [1440, 1280, 1100, 1024, 900, 768, 414, 360] as const;

const ready = (page: Page) => page.locator('[data-thread-ready="true"]').waitFor({ state: 'attached' });

/** Sampled route points in client coordinates. */
function routePoints(page: Page, step = 4) {
  return page.evaluate((step) => {
    const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
    const path = svg.querySelector<SVGPathElement>('[data-thread-path]')!;
    const s = svg.getBoundingClientRect();
    const total = path.getTotalLength();
    const pts: [number, number][] = [];
    for (let l = 0; l <= total; l += step) {
      const p = path.getPointAtLength(l);
      pts.push([s.left + p.x, s.top + p.y]);
    }
    const e = path.getPointAtLength(total);
    pts.push([s.left + e.x, s.top + e.y]);
    return pts;
  }, step);
}

/**
 * Route points that fall inside a text, card, button or image box (or too
 * close to a timeline node), ignoring the bar rows (the line crosses each
 * heading bar by design) and the tags row (the beads pass behind the pills).
 */
function collisions(page: Page) {
  return page.evaluate(async () => {
    const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
    const path = svg.querySelector<SVGPathElement>('[data-thread-path]')!;
    const s = svg.getBoundingClientRect();
    const main = document.getElementById('main-content')!;
    type Box = { x0: number; y0: number; x1: number; y1: number; label: string };
    const boxes: Box[] = [];
    const add = (r: DOMRect, label: string) => {
      if (r.width < 1 || r.height < 1) return;
      boxes.push({ x0: r.left - 1, y0: r.top - 1, x1: r.right + 1, y1: r.bottom + 1, label });
    };
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim();
      if (!text || n.parentElement?.closest('[data-thread-root]')) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) add(r, `text "${text.slice(0, 30)}"`);
    }
    // Visible box: clipped by every overflow-clipping ancestor (the avatar
    // image is scaled up inside a round overflow-hidden frame).
    const visibleBox = (el: Element) => {
      let r = el.getBoundingClientRect();
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const c = a.getBoundingClientRect();
        const x0 = Math.max(r.left, c.left), y0 = Math.max(r.top, c.top);
        const x1 = Math.min(r.right, c.right), y1 = Math.min(r.bottom, c.bottom);
        r = new DOMRect(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
      }
      return r;
    };
    for (const el of main.querySelectorAll('a, button, img, .skill-card, [data-thread-stitch], [data-thread-hint] > *')) {
      add(visibleBox(el), `<${el.tagName.toLowerCase()} class="${el.className}">`.slice(0, 80));
    }
    const circles = [...main.querySelectorAll('[data-thread-node]')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .map((r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }));
    const bars = [...main.querySelectorAll('[data-thread-bar]')].map((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    const pills = [...(main.querySelector('[data-thread-beads]')?.children ?? [])].map((el) => el.getBoundingClientRect());
    const tagsRow = pills.length ? { y: pills[0].top + pills[0].height / 2, x0: Math.min(...pills.map((r) => r.left)), x1: Math.max(...pills.map((r) => r.right)) } : null;

    const hits: string[] = [];
    const total = path.getTotalLength();
    for (let l = 0; l <= total; l += 3) {
      const p = path.getPointAtLength(l);
      const x = s.left + p.x, y = s.top + p.y;
      if (bars.some((b) => Math.abs(b - y) < 2.5)) continue;
      if (tagsRow && Math.abs(y - tagsRow.y) < 2 && x >= tagsRow.x0 - 2 && x <= tagsRow.x1 + 2) continue;
      for (const b of boxes) {
        if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) hits.push(`(${x.toFixed(0)}, ${y.toFixed(0)}) in ${b.label}`);
      }
      for (const c of circles) {
        if (Math.hypot(x - c.x, y - c.y) < c.r + 4) hits.push(`(${x.toFixed(0)}, ${y.toFixed(0)}) on a timeline node`);
      }
    }
    return [...new Set(hits)].slice(0, 20);
  });
}

const dashLength = (page: Page) =>
  page.locator('[data-thread-path]').evaluate((p) => parseFloat((p.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]));

test.describe('scroll thread, reduced motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('draws the full route statically with nodes, ink and stitches applied', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await ready(page);
    await expect(page.locator('html')).toHaveClass(/\bthread-on\b/);

    const path = page.locator('[data-thread-path]');
    const d = await path.getAttribute('d');
    expect(d && d.length).toBeGreaterThan(100);
    const pathLength = parseFloat((await path.getAttribute('pathLength')) ?? '0');
    expect(await dashLength(page)).toBeCloseTo(pathLength, 0);

    const nodes = page.locator('[data-thread-node]');
    expect(await nodes.count()).toBeGreaterThan(0);
    for (const sel of ['[data-thread-node]', '[data-thread-ink]', '[data-thread-stitch]']) {
      const all = await page.locator(sel).count();
      expect(all, sel).toBeGreaterThan(0);
      await expect(page.locator(`${sel}[data-thread-done]`)).toHaveCount(all);
    }
    // Lit nodes take the primary colour; the original timeline line is hidden.
    const nodeBg = await nodes.last().evaluate((el) => getComputedStyle(el).backgroundColor);
    const primary = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.color = 'hsl(var(--primary))';
      document.body.append(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    });
    expect(nodeBg).toBe(primary);
    await expect(page.locator('[data-thread-line]')).toHaveCSS('opacity', '0');
    // Ink underline and stitches are actually painted.
    await expect(page.locator('[data-thread-ink]').first()).toHaveCSS('background-size', '100% 2px');
    const sew = await page.locator('[data-thread-stitch]').first().evaluate((el) => getComputedStyle(el, '::after').getPropertyValue('--thread-sew').trim());
    expect(sew).toBe('360deg');
    // No pen under reduced motion; end knot shown.
    await expect(page.locator('[data-thread-pen]')).toHaveCSS('opacity', '0');
    await expect(page.locator('[data-thread-end]')).toHaveCSS('opacity', '1');
  });

  for (const width of WIDTHS) {
    test(`stays in bounds, clear of content and causes no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await ready(page);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);

      const cw = await page.evaluate(() => document.documentElement.clientWidth);
      const pts = await routePoints(page);
      expect(pts.length).toBeGreaterThan(100);
      for (const [x] of pts) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(cw);
      }

      expect(await collisions(page)).toEqual([]);
    });
  }

  test('rebuilds after a viewport resize and stays in bounds', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await ready(page);
    const path = page.locator('[data-thread-path]');
    const before = await path.getAttribute('d');

    await page.setViewportSize({ width: 820, height: 900 });
    await expect.poll(() => path.getAttribute('d')).not.toBe(before);
    // Let the debounce settle.
    await page.waitForTimeout(400);

    const cw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(cw).toBe(820);
    for (const [x] of await routePoints(page)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(cw);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(await collisions(page)).toEqual([]);
    // Still fully drawn after the rebuild.
    const pathLength = parseFloat((await path.getAttribute('pathLength')) ?? '0');
    expect(await dashLength(page)).toBeCloseTo(pathLength, 0);
  });

  test('stays visible across a theme toggle', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript(() => localStorage.setItem('theme', 'light'));
    await page.goto('/');
    await ready(page);
    const stop = page.locator('.site-thread__stop-from');
    const light = await stop.evaluate((el) => getComputedStyle(el).stopColor);

    await page.locator('button[aria-label="Toggle dark mode"]').first().click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);

    await expect.poll(() => stop.evaluate((el) => getComputedStyle(el).stopColor)).not.toBe(light);
    await expect(page.locator('[data-thread-path]')).toHaveCSS('opacity', '1');
    await expect(page.locator('.site-thread')).toBeVisible();
    expect((await page.locator('[data-thread-path]').getAttribute('d'))?.length).toBeGreaterThan(100);
  });
});

test.describe('scroll thread, normal motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    // html has scroll-behavior: smooth; jump instantly so assertions do not race the scroll.
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await ready(page);
    // Drawing starts once the hero intro has finished.
    await expect(page.locator('[data-thread-knot]')).toHaveCSS('opacity', '1', { timeout: 6000 });
  });

  test('draws the beads after the hero intro, then follows the reading position', async ({ page }) => {
    await expect.poll(() => dashLength(page)).toBeGreaterThan(200);
    const atTop = await dashLength(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
    await expect.poll(() => dashLength(page)).toBeGreaterThan(atTop + 1000);
  });

  test('scrolling down then up reverses ink, stitches and nodes', async ({ page }) => {
    const sels = ['[data-thread-node]', '[data-thread-ink]', '[data-thread-stitch]'];
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    for (const sel of sels) {
      const all = await page.locator(sel).count();
      await expect(page.locator(`${sel}[data-thread-done]`), sel).toHaveCount(all, { timeout: 8000 });
    }
    await expect(page.locator('[data-thread-end]')).toHaveCSS('opacity', '1');

    await page.evaluate(() => window.scrollTo(0, 0));
    for (const sel of sels) {
      await expect(page.locator(`${sel}[data-thread-done]`), sel).toHaveCount(0, { timeout: 8000 });
    }
    await expect(page.locator('[data-thread-end]')).toHaveCSS('opacity', '0');
  });

  test('a resize keeps the drawn progress instead of replaying from the top', async ({ page }) => {
    const firstNode = page.locator('[data-thread-node]').first();
    await firstNode.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 200));
    await expect(firstNode).toHaveAttribute('data-thread-done', '', { timeout: 8000 });
    const before = await page.locator('[data-thread-path]').getAttribute('d');

    await page.setViewportSize({ width: 1100, height: 800 });
    await firstNode.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 200));
    await expect.poll(() => page.locator('[data-thread-path]').getAttribute('d')).not.toBe(before);
    // Sample for a while: the node must never go dark (a replay would un-draw it).
    for (let i = 0; i < 10; i++) {
      await expect(firstNode).toHaveAttribute('data-thread-done', '');
      await page.waitForTimeout(80);
    }
  });

  test('a fast pointer sweep plucks the line', async ({ page }) => {
    await expect.poll(() => dashLength(page)).toBeGreaterThan(200);
    const target = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
      const knot = svg.querySelector('[data-thread-knot]')!;
      const s = svg.getBoundingClientRect();
      return { x: s.left + parseFloat(knot.getAttribute('cx')!) + 60, y: s.top + parseFloat(knot.getAttribute('cy')!) };
    });
    await page.mouse.move(target.x, target.y - 60);
    await page.mouse.move(target.x, target.y + 60, { steps: 2 });
    // While vibrating, the drawn part is rendered as a displaced polyline.
    await expect.poll(() => page.locator('[data-thread-path]').getAttribute('pathLength'), { timeout: 1000 }).toBeNull();
    // ...and it settles back to the exact geometry.
    await expect.poll(() => page.locator('[data-thread-path]').getAttribute('pathLength'), { timeout: 4000 }).not.toBeNull();
  });
});

test('without JavaScript the page has no thread and keeps the timeline line', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveClass(/\bthread-on\b/);
  await expect(page.locator('.site-thread')).toBeHidden();
  await expect(page.locator('[data-thread-line]')).toHaveCSS('opacity', '1');
  await context.close();
});

for (const path of ['/projects', '/resume', '/impressum']) {
  test(`${path} has no thread`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-thread-root]')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveClass(/\bthread-on\b/);
  });
}
