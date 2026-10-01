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

/**
 * At the centre of every heading bar and every hero tag pill (the route runs
 * straight through each), is the content or the line painted on top?
 */
function paintOrder(page: Page) {
  return page.evaluate(async () => {
    const path = document.querySelector<SVGPathElement>('[data-thread-path]')!;
    const els = [...document.querySelectorAll('[data-thread-bar]'), ...document.querySelector('[data-thread-beads]')!.children];
    const out: { label: string; lineThere: boolean; top: string }[] = [];
    path.style.pointerEvents = 'stroke';
    try {
      for (const el of els) {
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const stack = document.elementsFromPoint(x, y);
        const top = stack[0];
        out.push({
          label: el.hasAttribute('data-thread-bar') ? `bar of #${el.closest('section')?.id}` : `pill "${el.textContent}"`,
          lineThere: stack.includes(path),
          top: top === el || el.contains(top) ? 'content' : top === path ? 'line' : `other: ${top?.tagName}`,
        });
      }
    } finally {
      path.style.pointerEvents = '';
    }
    return out;
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
    // Paint order, asked of the browser directly: let the line take hits for a
    // moment and see what is on top where the route runs right through a
    // heading bar or a tag pill. (The thread layer has no pointer events, so
    // the clickability checks above cannot see it; comparing z-index values
    // cannot see a stacking context created by an ancestor either.)
    const probes = await paintOrder(page);
    expect(probes.length).toBeGreaterThanOrEqual(6); // every bar plus the pills
    for (const p of probes) {
      expect(p.lineThere, `${p.label}: the line runs through it`).toBe(true);
      expect(p.top, `${p.label}: painted above the line`).toBe('content');
    }
  });

  test('printing leaves the thread out and restores the timeline line', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await ready(page);
    await expect(page.locator('[data-thread-node][data-thread-done]')).not.toHaveCount(0);
    await page.emulateMedia({ media: 'print' });
    // The route is laid out for the screen, not the paper: it must not print.
    await expect(page.locator('.site-thread')).toBeHidden();
    await expect(page.locator('[data-thread-line]')).toHaveCSS('opacity', '1');
    // Lit nodes, ink and stitches print as the page without the thread.
    const card = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.color = 'hsl(var(--card))';
      document.body.append(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    });
    await expect(page.locator('[data-thread-node]').last()).toHaveCSS('background-color', card);
    await expect(page.locator('[data-thread-ink]').first()).toHaveCSS('background-size', '0% 2px');
    const sew = await page.locator('[data-thread-stitch]').first().evaluate((el) => getComputedStyle(el, '::after').getPropertyValue('--thread-sew').trim());
    expect(sew).toBe('0deg');
  });

  test("uses the layout's own breakpoint at a non-default browser font size", async ({ page }) => {
    // At a 14px default font size Tailwind's sm (40rem) starts at 560px: at
    // 600px the tags sit on one row and the route must thread them.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 14 } });
    await page.setViewportSize({ width: 600, height: 1000 });
    await page.goto('/');
    await ready(page);
    expect(await page.evaluate(() => matchMedia('(min-width: 40rem)').matches)).toBe(true);
    const { knotY, tags } = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
      const r = document.querySelector('[data-thread-beads]')!.getBoundingClientRect();
      return { knotY: svg.getBoundingClientRect().top + parseFloat(svg.querySelector('[data-thread-knot]')!.getAttribute('cy')!), tags: { top: r.top, bottom: r.bottom } };
    });
    expect(knotY).toBeGreaterThan(tags.top);
    expect(knotY).toBeLessThan(tags.bottom);
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

  test('the end knot goes the moment the line retracts from it', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-end]')).toHaveCSS('opacity', '1', { timeout: 8000 });
    const op = await page.evaluate(
      () =>
        new Promise<number>((res) => {
          window.scrollBy(0, -400);
          // Two frames: the line has left the knot; a fade-out would still be near 1.
          requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res(parseFloat(getComputedStyle(document.querySelector('[data-thread-end]')!).opacity)))));
        }),
    );
    expect(op).toBe(0);
  });

  test('a lighting node keeps its icon readable through the colour change', async ({ page }) => {
    for (const theme of ['light', 'dark']) {
      await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), theme === 'dark');
      for (const lit of [true, false]) {
        const worst = await page.evaluate(async (lit) => {
          const lum = (c: string) => {
            const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
              const x = Number(v) / 255;
              return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const contrast = (a: string, b: string) => {
            const [x, y] = [lum(a), lum(b)];
            return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
          };
          // A node that is not the current job (that one is always filled).
          const node = [...document.querySelectorAll<HTMLElement>('[data-thread-node]')].find((n) => n.className.includes('bg-card'))!;
          node.toggleAttribute('data-thread-done', !lit);
          await new Promise((r) => setTimeout(r, 600));
          node.toggleAttribute('data-thread-done', lit);
          const anims = node.getAnimations();
          anims.forEach((a) => a.pause());
          let min = Infinity;
          for (let t = 0; t <= 420; t += 5) {
            anims.forEach((a) => (a.currentTime = t));
            const cs = getComputedStyle(node);
            min = Math.min(min, contrast(cs.backgroundColor, cs.color));
          }
          anims.forEach((a) => a.finish());
          return min;
        }, lit);
        // A cross-fade dips to ~1:1 (the icon disappears); the stepped icon colour stays above 2:1.
        expect(worst, `${theme}, ${lit ? 'lighting' : 'unlighting'}`).toBeGreaterThan(2);
      }
    }
  });

  test('a width change at rest rebuilds at the reading position (no sweep, no rewind)', async ({ page }) => {
    for (const [from, to, y] of [
      [[1440, 900], [720, 900], 2400],
      [[390, 844], [1024, 768], 2600],
    ] as const) {
      await page.setViewportSize({ width: from[0], height: from[1] });
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await page.waitForTimeout(2500);
      await page.evaluate(() => {
        const w = window as unknown as { __f: { head: number; vh: number; dash: number; cw: number; svgW: number }[] };
        w.__f = [];
        const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
        const path = svg.querySelector<SVGPathElement>('[data-thread-path]')!;
        const tick = () => {
          const dash = parseFloat((path.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]);
          const p = path.getPointAtLength(Math.min(dash, path.getTotalLength()));
          w.__f.push({ head: svg.getBoundingClientRect().top + p.y, vh: innerHeight, dash, cw: document.documentElement.clientWidth, svgW: Number(svg.getAttribute('width')) });
          if (w.__f.length < 70) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await page.setViewportSize({ width: to[0], height: to[1] });
      await page.waitForFunction(() => (window as unknown as { __f: unknown[] }).__f.length >= 70);
      const frames = (await page.evaluate(() => (window as unknown as { __f: { head: number; vh: number; dash: number; cw: number; svgW: number }[] }).__f)).filter(
        (f) => f.cw === to[0] && f.svgW === to[0],
      );
      expect(frames.length, `${from} -> ${to}`).toBeGreaterThan(30);
      for (const [i, f] of frames.entries()) {
        // The head stays in view (it never lands off screen and sweeps back in)...
        expect(f.head, `${from} -> ${to}, frame ${i}`).toBeGreaterThanOrEqual(0);
        expect(f.head, `${from} -> ${to}, frame ${i}`).toBeLessThanOrEqual(f.vh);
        // ...and never rewinds (an overshoot pulled back to the reading line).
        if (i) expect(f.dash, `${from} -> ${to}, frame ${i}`).toBeGreaterThanOrEqual(frames[i - 1].dash - 1);
      }
    }
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
    // render() clamps every vibrating x to [stroke/2, width - stroke/2] as a
    // last resort; the amplitude cap must keep the swing off that clamp (a
    // clamped stretch would be squashed flat against the edge).
    const sw = parseFloat((await page.locator('[data-thread-path]').getAttribute('stroke-width')) ?? '0');
    expect(sw).toBeGreaterThan(0);
    expect(x[0]).toBeGreaterThan(sw / 2 + 0.5);
    expect(x[1]).toBeLessThan(cw - sw / 2 - 0.5);
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

interface RevealRec {
  done: boolean;
  frames: number;
  violations: string[];
  /** scrollY of each violation. */
  violationY: number[];
  slid: string[];
  noLine: string[];
  firstDash: number;
  minLen: number;
  reachedNodes: boolean;
  restoredY: number;
}

/**
 * Init script: records every frame for 4s after navigation and lists the
 * frames where the drawn line has gone past a timeline node (or lit it) whose
 * card is still mostly transparent, or past a heading bar whose heading is,
 * while that content is on screen.
 */
function revealRecorder() {
  const rec: RevealRec = { done: false, frames: 0, violations: [], violationY: [], slid: [], noLine: [], firstDash: 0, minLen: 0, reachedNodes: false, restoredY: 0 };
  (window as unknown as { __rec: RevealRec }).__rec = rec;
  const t0 = performance.now();
  const tick = () => {
    const t = Math.round(performance.now() - t0);
    const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]');
    const path = svg?.querySelector<SVGPathElement>('[data-thread-path]');
    const line = document.querySelector('[data-thread-line]');
    if (svg && path && line && document.querySelector('.timeline-card')) {
      rec.frames++;
      rec.restoredY = Math.max(rec.restoredY, window.scrollY);
      const dash = parseFloat((path.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]) || 0;
      const drawn = path.style.opacity === '1' && dash > 0;
      if (drawn && !rec.firstDash) {
        rec.firstDash = dash;
        // The beads run: from the start knot to the first corner on the right rail.
        const knotX = parseFloat(svg.querySelector('[data-thread-knot]')!.getAttribute('cx')!);
        rec.minLen = Math.max(0, Number(svg.getAttribute('width')) - knotX);
      }
      if (getComputedStyle(line).opacity !== '1' && !drawn && window.scrollY > 1000) rec.noLine.push(`${t}ms`);
      // The route only ever runs downwards, so the head is its lowest drawn point.
      const headY = drawn ? svg.getBoundingClientRect().top + path.getPointAtLength(Math.min(dash, path.getTotalLength())).y : -Infinity;
      const vh = window.innerHeight;
      const violate = (msg: string) => {
        rec.violations.push(msg);
        rec.violationY.push(window.scrollY);
      };
      document.querySelectorAll('.timeline-card').forEach((card, i) => {
        const node = card.querySelector('[data-thread-node]');
        const body = card.querySelector('.timeline-body');
        if (body) {
          const m = new DOMMatrixReadOnly(getComputedStyle(body).transform === 'none' ? undefined : getComputedStyle(body).transform);
          if (Math.abs(m.m41) > 0.5) rec.slid.push(`${t}ms card ${i + 1} x=${m.m41.toFixed(1)}`);
        }
        if (!node) return;
        const r = node.getBoundingClientRect();
        if (!r.width || r.bottom < 0 || r.top > vh) return;
        if (headY > r.top) rec.reachedNodes = true;
        const op = parseFloat(getComputedStyle(card).opacity);
        if ((headY > r.top - 10 || node.hasAttribute('data-thread-done')) && op < 0.85) violate(`${t}ms node ${i + 1} at opacity ${op.toFixed(2)} (scrollY ${Math.round(window.scrollY)}, head ${Math.round(headY)}, node top ${Math.round(r.top)})`);
      });
      document.querySelectorAll('[data-thread-bar]').forEach((bar) => {
        const heading = bar.closest('.gsap-reveal');
        if (!heading) return;
        const hr = heading.getBoundingClientRect();
        if (hr.bottom < 0 || hr.top > vh) return;
        const r = bar.getBoundingClientRect();
        const op = parseFloat(getComputedStyle(heading).opacity);
        if (headY > r.top - 2 && op < 0.85) violate(`${t}ms bar of #${bar.closest('section')?.id} at opacity ${op.toFixed(2)} (scrollY ${Math.round(window.scrollY)}, head ${Math.round(headY)}, bar ${Math.round(r.top)})`);
      });
    }
    if (t < 4000) requestAnimationFrame(tick);
    else rec.done = true;
  };
  requestAnimationFrame(tick);
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

  for (const [w, h] of [[1440, 900], [768, 800]] as const) {
    test(`a deep link mid-page starts in place and never draws over content that has not revealed (${w}px)`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.addInitScript(revealRecorder);
      await page.goto('/#experience', { waitUntil: 'commit' });
      await page.waitForFunction(() => (window as unknown as { __rec?: { done: boolean } }).__rec?.done, null, { timeout: 10000 });
      const rec = await page.evaluate(() => (window as unknown as { __rec: RevealRec }).__rec);
      expect(rec.frames, `${w}px`).toBeGreaterThan(60);
      expect(rec.violations, `${w}px`).toEqual([]);
      expect(rec.slid, `${w}px: timeline text moves only vertically`).toEqual([]);
      // Never both gone: the original timeline line stays until the thread draws.
      expect(rec.noLine, `${w}px`).toEqual([]);
      // In place, not swept in from the hero, and it does reach the timeline.
      expect(rec.firstDash, `${w}px`).toBeGreaterThan(rec.minLen + 200);
      expect(rec.reachedNodes, `${w}px`).toBe(true);
    });
  }

  test('a reload mid-page draws the line in behind the content as it reveals', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await expect(page.locator('[data-thread-knot]')).toHaveCSS('opacity', '1', { timeout: 6000 });
    await page.evaluate(() => window.scrollTo(0, 2000));
    await page.waitForTimeout(1500);
    await page.addInitScript(revealRecorder);
    await page.reload({ waitUntil: 'commit' });
    await page.waitForFunction(() => (window as unknown as { __rec?: { done: boolean } }).__rec?.done, null, { timeout: 10000 });
    const rec = await page.evaluate(() => (window as unknown as { __rec: RevealRec }).__rec);
    expect(rec.restoredY).toBeGreaterThan(1500);
    // Only while the page sits at the restored position. Under load Chromium
    // sometimes restores the position, drops back near the top and then
    // smooth-scrolls down again (html has scroll-behavior: smooth; a trace
    // showed no page script calling scrollTo or setting scrollTop): content
    // scrolled past during that is not what this test is about.
    expect(rec.violations.filter((_, i) => Math.abs(rec.violationY[i] - 2000) <= 40)).toEqual([]);
    expect(rec.firstDash).toBeGreaterThan(rec.minLen + 200);
    expect(rec.reachedNodes).toBe(true);
  });

  test('in a background tab the thread waits until the intro has actually played', async ({ page }) => {
    // Timers keep firing in a hidden tab while animation frames (which run the
    // GSAP intro) do not: emulate that, then bring the tab to the front.
    await page.addInitScript(() => {
      const w = window as unknown as { __hidden: boolean; __show: () => void };
      const realRAF = window.requestAnimationFrame.bind(window);
      let queue: FrameRequestCallback[] = [];
      w.__hidden = true;
      Object.defineProperty(document, 'visibilityState', { get: () => (w.__hidden ? 'hidden' : 'visible') });
      Object.defineProperty(document, 'hidden', { get: () => w.__hidden });
      window.requestAnimationFrame = (cb) => {
        if (!w.__hidden) return realRAF(cb);
        queue.push(cb);
        return -queue.length;
      };
      w.__show = () => {
        w.__hidden = false;
        const q = queue;
        queue = [];
        q.forEach((cb) => realRAF(cb));
        document.dispatchEvent(new Event('visibilitychange'));
      };
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForTimeout(4500); // longer than the start fallback
    await expect(page.locator('html')).not.toHaveClass(/\bthread-drawing\b/);
    const intro = await page.evaluate(
      () =>
        new Promise<number>((res) => {
          (window as unknown as { __show: () => void }).__show();
          const knot = document.querySelector<SVGElement>('[data-thread-knot]')!;
          const tick = () => {
            if (knot.style.opacity === '1') {
              const els = document.querySelectorAll('[data-thread-section="hero"] .gsap-reveal');
              return res(Math.min(...[...els].map((el) => parseFloat(getComputedStyle(el).opacity))));
            }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    expect(intro).toBeGreaterThan(0.99);
  });

  test('at the page bottom on a phone, the URL bar coming back keeps the route complete', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await expect(page.locator('[data-thread-knot]')).toHaveCSS('opacity', '1', { timeout: 6000 });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-end]')).toHaveCSS('opacity', '1', { timeout: 8000 });
    const full = await dashLength(page);
    const y = await page.evaluate(() => window.scrollY);
    // The viewport loses the URL bar's height; scrollY stays where it was.
    await page.setViewportSize({ width: 414, height: 840 });
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.scrollY)).toBe(y);
    expect(await dashLength(page)).toBeCloseTo(full, 0);
    await expect(page.locator('[data-thread-end]')).toHaveCSS('opacity', '1');
    await context.close();
  });
});
