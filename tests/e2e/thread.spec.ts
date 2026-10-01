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
    // Also icons and decorated boxes (icon tiles, date pills): anything with a
    // rounded background, except the purely decorative (aria-hidden) layers.
    const obstacles = 'a, button, img, svg, .skill-card, [data-thread-stitch], [data-thread-hint] > *, [class*="rounded"][class*="bg-"]:not([aria-hidden="true"]):not([data-thread-bar])';
    for (const el of main.querySelectorAll(obstacles)) {
      if (el.closest('[data-thread-root], [data-thread-node]')) continue;
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

  test('layering: the line stays under the content, which stays clickable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await ready(page);
    for (const sel of ['main a[href="/projects"]', '[data-thread-stitch]', '[data-thread-node]']) {
      const el = page.locator(sel).first();
      await el.scrollIntoViewIfNeeded();
      const hit = await el.evaluate((target) => {
        const r = target.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!top && (top === target || target.contains(top));
      });
      expect(hit, sel).toBe(true);
    }
    // Thread layer: in the root stacking context, below the content containers.
    const z = await page.evaluate(() => ({
      thread: getComputedStyle(document.querySelector('.site-thread')!).zIndex,
      content: getComputedStyle(document.querySelector('[data-thread-section] > .container')!).zIndex,
    }));
    expect(Number(z.thread)).toBeLessThan(Number(z.content));
  });

  test('the ink underline sits below the descenders', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await ready(page);
    const gaps = await page.locator('[data-thread-ink]').evaluateAll((els) =>
      els.map((el) => {
        const box = el.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(el);
        const text = range.getBoundingClientRect();
        // The 2px line occupies the bottom of the padded box; the text's content
        // area ends at the font's descent (the bottom of g / y).
        return box.bottom - 2 - text.bottom;
      }),
    );
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(0.5);
  });

  test('the hero is not a scroll container (scripted scrolling cannot shift it off the line)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await ready(page);
    const scrollTop = await page.evaluate(() => {
      const hero = document.querySelector<HTMLElement>('[data-thread-section="hero"]')!;
      // Overflow like the drifting blobs produce at some points of their loop.
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:200%;pointer-events:none';
      hero.append(probe);
      hero.scrollTop = 80;
      document.querySelector<HTMLElement>('main a[href="/projects"]')!.scrollIntoView({ block: 'center' });
      const top = hero.scrollTop;
      probe.remove();
      return top;
    });
    expect(scrollTop).toBe(0);
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

  test('a height-only resize (mobile URL bar) never makes the drawn length jump', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 788 });
    await page.waitForTimeout(600); // settle at phone width first
    await page.evaluate(() => {
      const w = window as unknown as { __dash: [number, number][] };
      w.__dash = [];
      const p = document.querySelector('[data-thread-path]')!;
      const tick = (ts: number) => {
        w.__dash.push([ts, parseFloat((p.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0])]);
        if (w.__dash.length < 150) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      window.scrollBy(0, 1400);
    });
    await page.waitForTimeout(60);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => (window as unknown as { __dash: unknown[] }).__dash.length >= 150, null, { timeout: 8000 });
    const dash = await page.evaluate(() => (window as unknown as { __dash: [number, number][] }).__dash);
    // The spring tops out around 4px/ms for a jump this size; a snap to the
    // target covers ~1000px in one frame (~60px/ms).
    let worst = 0;
    for (let i = 1; i < dash.length; i++) {
      worst = Math.max(worst, Math.abs(dash[i][1] - dash[i - 1][1]) / Math.max(8, dash[i][0] - dash[i - 1][0]));
    }
    expect(dash[dash.length - 1][1]).toBeGreaterThan(dash[0][1] + 500); // it did follow the scroll
    expect(worst).toBeLessThan(15);
  });

  test('during a resize drag every frame shows geometry for the current width', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#experience').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 200));
    await page.waitForTimeout(600);
    for (let w = 1420; w >= 1280; w -= 20) {
      await page.setViewportSize({ width: w, height: 900 });
      // Two frames later: far less than any debounce.
      const [svgW, cw] = await page.evaluate(
        () =>
          new Promise<[number, number]>((res) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => res([Number(document.querySelector('[data-thread-svg]')!.getAttribute('width')), document.documentElement.clientWidth])),
            ),
          ),
      );
      expect(svgW, `at ${w}px`).toBe(cw);
    }
  });

  test('loops are concentric with the nodes and the beads run through the pills, even when rebuilt mid-reveal', async ({ page }) => {
    // Beads: the boot / font rebuilds ran during the hero intro (tags at y +15px).
    const beads = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
      const path = svg.querySelector<SVGPathElement>('[data-thread-path]')!;
      const s = svg.getBoundingClientRect();
      const pills = [...document.querySelector('[data-thread-beads]')!.children].map((el) => el.getBoundingClientRect());
      const total = path.getTotalLength();
      return pills.map((r) => {
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let best = Infinity;
        for (let l = 0; l < Math.min(total, 1500); l += 1) {
          const p = path.getPointAtLength(l);
          if (Math.abs(s.left + p.x - cx) < 1) best = Math.min(best, Math.abs(s.top + p.y - cy));
        }
        return best;
      });
    });
    for (const d of beads) expect(d).toBeLessThan(1.5);

    // Nodes: rebuild while the timeline cards are still sliding in.
    const vh = 800;
    await page.locator('#experience').evaluate((el, vh) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - vh * 0.7), vh);
    await expect
      .poll(() => page.locator('.timeline-card').last().evaluate((el) => getComputedStyle(el).opacity), { timeout: 3000 })
      .not.toBe('0');
    const midReveal = await page.locator('.timeline-body').last().evaluate((el) => getComputedStyle(el).transform);
    expect(midReveal).not.toBe('none');
    await page.setViewportSize({ width: 1180, height: vh });
    // Let every reveal finish, then compare the geometry with the settled layout.
    await page.waitForTimeout(2000);
    const gaps = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
      const path = svg.querySelector<SVGPathElement>('[data-thread-path]')!;
      const s = svg.getBoundingClientRect();
      const total = path.getTotalLength();
      const pts: [number, number][] = [];
      for (let l = 0; l <= total; l += 1) {
        const p = path.getPointAtLength(l);
        pts.push([s.left + p.x, s.top + p.y]);
      }
      return [...document.querySelectorAll('[data-thread-node]')].map((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const want = r.width / 2 + 9;
        let near = Infinity, left = Infinity, right = -Infinity;
        for (const [x, y] of pts) {
          if (Math.abs(y - cy) > want * 1.6) continue;
          near = Math.min(near, Math.hypot(x - cx, y - cy));
          if (Math.abs(y - cy) < 1) {
            left = Math.min(left, x);
            right = Math.max(right, x);
          }
        }
        // Concentric: closest approach is the loop radius, and the loop's far
        // side at the node's row is one radius from the centre.
        const far = Math.max(cx - left, right - cx);
        return { near: near - want, far: far - want };
      });
    });
    expect(gaps.length).toBe(await page.locator('[data-thread-node]').count());
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) {
      expect(Math.abs(g.near)).toBeLessThan(1.5);
      expect(Math.abs(g.far)).toBeLessThan(1.5);
    }
  });

  test('nodes are re-synced after being hidden at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const all = await page.locator('[data-thread-node]').count();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-node][data-thread-done]')).toHaveCount(all, { timeout: 8000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1200);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);
    await expect(page.locator('[data-thread-node][data-thread-done]')).toHaveCount(0);
  });

  test('wheel scrolling with a jittering mouse does not pluck', async ({ page }) => {
    await page.mouse.move(600, 300);
    await page.evaluate(() => {
      const w = window as unknown as { __plucked: boolean };
      w.__plucked = false;
      const p = document.querySelector('[data-thread-path]')!;
      new MutationObserver(() => {
        if (!p.hasAttribute('pathLength')) w.__plucked = true;
      }).observe(p, { attributes: true, attributeFilter: ['pathLength'] });
    });
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, 60);
      await page.mouse.move(600 + (i % 2), 300);
      await page.waitForTimeout(25);
    }
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { __plucked: boolean }).__plucked)).toBe(false);
  });

  test('a pluck on an edge rail stays inside the viewport, and the pen glow is never clipped', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.locator('#about').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 100));
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const w = window as unknown as { __x: [number, number]; __poly: number; __glow: number[] };
      w.__x = [Infinity, -Infinity];
      w.__poly = 0;
      w.__glow = [];
      const svg = document.querySelector('[data-thread-svg]')!;
      const p = svg.querySelector('[data-thread-path]')!;
      const g = svg.querySelector('[data-thread-glow]')!;
      const t0 = performance.now();
      const tick = () => {
        if (!p.hasAttribute('pathLength')) {
          w.__poly++;
          for (const m of (p.getAttribute('d') ?? '').matchAll(/[ML](-?[\d.]+),/g)) {
            const x = parseFloat(m[1]);
            w.__x = [Math.min(w.__x[0], x), Math.max(w.__x[1], x)];
          }
        }
        if (getComputedStyle(g).opacity !== '0') {
          const cx = parseFloat(g.getAttribute('cx')!), r = parseFloat(g.getAttribute('r')!);
          w.__glow.push(cx - r, cx + r);
        }
        if (performance.now() - t0 < 2500) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const y = 400;
    await page.mouse.move(80, y);
    await page.mouse.move(0, y, { steps: 2 });
    await page.mouse.move(80, y + 10, { steps: 2 });
    // Scroll a little too, so the pen runs down a rail with its glow.
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(2600);
    const { x, poly, glow, cw } = await page.evaluate(() => {
      const w = window as unknown as { __x: [number, number]; __poly: number; __glow: number[] };
      return { x: w.__x, poly: w.__poly, glow: w.__glow, cw: document.documentElement.clientWidth };
    });
    expect(poly, 'the sweep plucked the rail').toBeGreaterThan(0);
    expect(x[0]).toBeGreaterThanOrEqual(0);
    expect(x[1]).toBeLessThanOrEqual(cw);
    for (const v of glow) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(cw);
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

test.describe('scroll thread, start', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('starts exactly when the hero intro completes, not before', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    const t = await page.evaluate(
      () =>
        new Promise<{ revealed: number; knot: number; beadsOpacity: number }>((res) => {
          const html = document.documentElement;
          const knot = document.querySelector<SVGElement>('[data-thread-knot]')!;
          const beads = document.querySelector('[data-thread-beads]')!;
          let revealed = -1;
          const tick = (ts: number) => {
            if (revealed < 0 && 'heroRevealed' in html.dataset) revealed = ts;
            if (knot.style.opacity === '1') return res({ revealed, knot: ts, beadsOpacity: parseFloat(getComputedStyle(beads).opacity) });
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    expect(t.revealed, 'the thread waited for hero:revealed').toBeGreaterThan(0);
    expect(t.knot - t.revealed).toBeLessThan(300);
    expect(t.beadsOpacity).toBeGreaterThan(0.99);
  });

  test('on a slow connection the thread still waits for the hero intro', async ({ page }) => {
    await page.route(/\/_astro\/Hero\.[^/]*\.js$/, async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'commit' });
    const beadsOpacity = await page.evaluate(
      () =>
        new Promise<number>((res) => {
          const tick = () => {
            const knot = document.querySelector<SVGElement>('[data-thread-knot]');
            const beads = document.querySelector('[data-thread-beads]');
            if (knot && beads && knot.style.opacity === '1') return res(parseFloat(getComputedStyle(beads).opacity));
            requestAnimationFrame(tick);
          };
          tick();
        }),
    );
    expect(beadsOpacity).toBeGreaterThan(0.99);
  });

  test('a deep link mid-page never leaves the timeline without a spine and does not replay from the top', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#experience', { waitUntil: 'commit' });
    const samples = await page.evaluate(
      () =>
        new Promise<{ t: number; y: number; line: string; drawn: boolean; dash: number }[]>((res) => {
          const out: { t: number; y: number; line: string; drawn: boolean; dash: number }[] = [];
          const t0 = performance.now();
          const tick = () => {
            const line = document.querySelector('[data-thread-line]');
            const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]');
            const path = svg?.querySelector<SVGPathElement>('[data-thread-path]');
            const node = document.querySelector('[data-thread-node]');
            if (line && svg && path && node && window.scrollY > 1000) {
              const dash = parseFloat((path.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]);
              let drawn = false;
              if (path.style.opacity === '1' && dash > 0) {
                const head = path.getPointAtLength(Math.min(dash, path.getTotalLength()));
                const r = node.getBoundingClientRect();
                drawn = svg.getBoundingClientRect().top + head.y >= r.top + r.height / 2;
              }
              out.push({ t: performance.now() - t0, y: window.scrollY, line: getComputedStyle(line).opacity, drawn, dash });
            }
            if (performance.now() - t0 < 3500) requestAnimationFrame(tick);
            else res(out);
          };
          tick();
        }),
    );
    expect(samples.length).toBeGreaterThan(20);
    // Never both gone: the original timeline line stays until the thread draws.
    for (const s of samples) expect(s.line === '1' || s.dash > 0, `no line at all at ${s.t.toFixed(0)}ms`).toBe(true);
    // In place, not swept in from the hero: the first drawn frame is already
    // far down the route, and the line reaches the timeline quickly.
    const drawn = samples.filter((s) => s.dash > 0);
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn[0].dash).toBeGreaterThan(1500);
    const atNodes = samples.find((s) => s.drawn);
    expect(atNodes, 'the line reaches the timeline').toBeTruthy();
    expect(atNodes!.t - drawn[0].t).toBeLessThan(1000);
  });
});
