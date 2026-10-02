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
      // The reset switch's own hover label is part of the thread, not content.
      if (!text || n.parentElement?.closest('[data-thread-root], .site-thread-reset__tip')) continue;
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
    const obstacles = 'a, button, img, svg, .skill-card, [data-thread-card], [data-thread-hint] > *, [class*="rounded"][class*="bg-"]:not([aria-hidden="true"]):not([data-thread-bar])';
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
 * Parts of the chip network that touch content: every net, wire and label,
 * the chip and the switch, against the same text / card / button boxes as the
 * route. A net may only enter its card through the last few px of its end.
 */
function boardCollisions(page: Page) {
  return page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
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
      if (!text || n.parentElement?.closest('[data-thread-root], [data-thread-reset]')) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) add(r, `text "${text.slice(0, 30)}"`);
    }
    for (const el of main.querySelectorAll('a, button, img, [data-thread-card]')) {
      if (el.closest('[data-thread-root], [data-thread-reset]')) continue;
      add(el.getBoundingClientRect(), `<${el.tagName.toLowerCase()}>`);
    }
    const hits: string[] = [];
    const check = (x: number, y: number, what: string) => {
      for (const b of boxes) if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) hits.push(`${what} (${x.toFixed(0)}, ${y.toFixed(0)}) in ${b.label}`);
    };
    for (const el of svg.querySelectorAll<SVGPathElement>('.site-thread__net, .site-thread__wire')) {
      const total = el.getTotalLength();
      const isNet = el.classList.contains('site-thread__net');
      for (let l = 0; l <= total - (isNet ? 4 : 0); l += 2) {
        const p = el.getPointAtLength(l);
        check(s.left + p.x, s.top + p.y, isNet ? 'net' : 'wire');
      }
    }
    for (const el of svg.querySelectorAll<SVGGraphicsElement>('.site-thread__chip, .site-thread__switch')) {
      const b = el.getBBox();
      for (const [x, y] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height], [b.x + b.width / 2, b.y + b.height / 2]]) {
        check(s.left + x, s.top + y, el.getAttribute('class') ?? 'board');
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

/** Vertical distance from each hero tag pill's centre to the route where it crosses that pill's centre x. */
function beadOffsets(page: Page) {
  return page.evaluate(() => {
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
}

/**
 * Records, for every change of the route geometry (the path's `d`), the
 * vertical translation of the element `sel` at that moment: was the geometry
 * measured while that element was transformed?
 */
function recordRebuilds(page: Page, sel: string) {
  return page.evaluate((sel) => {
    const w = window as unknown as { __rebuilds: number[] };
    w.__rebuilds = [];
    const p = document.querySelector('[data-thread-path]')!;
    const el = document.querySelector(sel)!;
    new MutationObserver(() => {
      const t = getComputedStyle(el).transform;
      w.__rebuilds.push(t === 'none' ? 0 : new DOMMatrixReadOnly(t).m42);
    }).observe(p, { attributes: true, attributeFilter: ['d'] });
  }, sel);
}
const rebuilds = (page: Page) => page.evaluate(() => (window as unknown as { __rebuilds: number[] }).__rebuilds);
const translateY = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const t = getComputedStyle(document.querySelector(sel)!).transform;
    return t === 'none' ? 0 : new DOMMatrixReadOnly(t).m42;
  }, sel);

/** Count `.site-thread__pulse` elements added from now on (the signal pulses). */
function countPulses(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __pulses: number };
    w.__pulses = 0;
    new MutationObserver((list) => {
      for (const m of list) for (const n of m.addedNodes) if ((n as Element).classList?.contains('site-thread__pulse')) w.__pulses++;
    }).observe(document.querySelector('[data-thread-pulses]')!, { childList: true });
  });
}
const pulsesSeen = (page: Page) => page.evaluate(() => (window as unknown as { __pulses: number }).__pulses);

/** Colour of `hsl(var(--name) / alpha)` in the current theme, as computed by the browser. */
const themeColor = (page: Page, css: string) =>
  page.evaluate((css) => {
    const probe = document.createElement('div');
    probe.style.color = css;
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, css);

const dashLength = (page: Page) =>
  page.locator('[data-thread-path]').evaluate((p) => parseFloat((p.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]));

test.describe('scroll thread, reduced motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('draws the full route statically with nodes, ink, card marks and the powered chip network', async ({ page }) => {
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
    for (const sel of ['[data-thread-node]', '[data-thread-ink]', '[data-thread-card]']) {
      const all = await page.locator(sel).count();
      expect(all, sel).toBeGreaterThan(0);
      await expect(page.locator(`${sel}[data-thread-done]`)).toHaveCount(all);
    }
    // Lit nodes take the primary colour; the original timeline line is hidden.
    const nodeBg = await nodes.last().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(nodeBg).toBe(await themeColor(page, 'hsl(var(--primary))'));
    await expect(page.locator('[data-thread-line]')).toHaveCSS('opacity', '0');
    // Ink underline and the cards' silkscreen marks are actually painted.
    await expect(page.locator('[data-thread-ink]').first()).toHaveCSS('background-size', '100% 2px');
    const marks = await page.locator('[data-thread-card]').evaluateAll((els) => els.map((el) => getComputedStyle(el, '::after').opacity));
    expect(marks.every((o) => o === '1'), JSON.stringify(marks)).toBe(true);
    // No silkscreen text anywhere on the board.
    await expect(page.locator('[data-thread-board] text')).toHaveCount(0);
    // The chip network is on and powered; every card is lit; no end pad and no pen.
    const board = page.locator('[data-thread-board]');
    await expect(board).toHaveAttribute('data-on', '');
    await expect(board).toHaveAttribute('data-powered', '');
    await expect(board.locator('.site-thread__chip')).toHaveCount(1);
    await expect(board.locator('.site-thread__net')).toHaveCount(4);
    const cards = await page.locator('[data-thread-card]').count();
    await expect(page.locator('[data-thread-card][data-thread-lit]')).toHaveCount(cards);
    await expect(page.locator('[data-thread-card]').first()).toHaveCSS('border-color', await themeColor(page, 'hsl(var(--secondary) / 0.6)'));
    await expect(page.locator('[data-thread-end]')).toHaveCSS('opacity', '0');
    await expect(page.locator('[data-thread-pen]')).toHaveCSS('opacity', '0');
    await expect(page.locator('[data-thread-reset]')).toBeVisible();
    await expect(page.locator('[data-thread-reset]')).toHaveAttribute('aria-label', 'Back to top');
  });

  test('the reset switch hover label stays on screen at every width', async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await ready(page);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const tip = page.locator('.site-thread-reset__tip');
      await page.locator('[data-thread-reset]').hover();
      await expect(tip).toHaveCSS('opacity', '1');
      const r = await tip.evaluate((el) => el.getBoundingClientRect().toJSON());
      const cw = await page.evaluate(() => document.documentElement.clientWidth);
      expect(r.left, `${width}px`).toBeGreaterThanOrEqual(0);
      expect(r.right, `${width}px`).toBeLessThanOrEqual(cw);
    }
  });

  test('the reset switch takes the reader back to the top, also by keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await ready(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const reset = page.locator('[data-thread-reset]');
    await reset.click();
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 3000 }).toBe(0);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('main-content');
    // The next Tab continues from the top of the content, not from the footer.
    await page.keyboard.press('Tab');
    const next = await page.evaluate(() => {
      const a = document.activeElement!;
      return a.getBoundingClientRect().top;
    });
    expect(next).toBeLessThan(900);
    // Keyboard: focus the switch and press Enter.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await reset.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 3000 }).toBe(0);
    // <main> takes focus programmatically: no focus ring around the whole page.
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('main-content');
    await expect(page.locator('#main-content')).toHaveCSS('outline-style', 'none');
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
      // The chip network fits at every width, clear of all content too.
      await expect(page.locator('[data-thread-board] .site-thread__chip')).toHaveCount(1);
      expect(await boardCollisions(page)).toEqual([]);
      const box = await page.locator('[data-thread-board]').evaluate((g) => {
        const s = g.closest('svg')!.getBoundingClientRect();
        const b = (g as SVGGElement).getBBox();
        return { x0: s.left + b.x, x1: s.left + b.x + b.width };
      });
      expect(box.x0).toBeGreaterThanOrEqual(0);
      expect(box.x1).toBeLessThanOrEqual(cw);
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
    expect(await boardCollisions(page)).toEqual([]);
    // Still fully drawn after the rebuild.
    const pathLength = parseFloat((await path.getAttribute('pathLength')) ?? '0');
    expect(await dashLength(page)).toBeCloseTo(pathLength, 0);
  });

  test('layering: the line stays under the content, which stays clickable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await ready(page);
    for (const sel of ['main a[href="/projects"]', '[data-thread-card]', '[data-thread-node]', '[data-thread-reset]']) {
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
    await expect(page.locator('[data-thread-reset]')).toBeHidden();
    // Lit nodes, ink and the cards' marks and lighting print as the page without the thread.
    await expect(page.locator('[data-thread-node]').last()).toHaveCSS('background-color', await themeColor(page, 'hsl(var(--card))'));
    await expect(page.locator('[data-thread-ink]').first()).toHaveCSS('background-size', '0% 2px');
    expect(await page.locator('[data-thread-card]').first().evaluate((el) => getComputedStyle(el, '::after').display)).toBe('none');
    await expect(page.locator('[data-thread-card]').first()).toHaveCSS('border-color', await themeColor(page, 'hsl(var(--border))'));
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

  test('scrolling down then up reverses ink, card marks, nodes and the chip network', async ({ page }) => {
    const sels = ['[data-thread-node]', '[data-thread-ink]', '[data-thread-card]'];
    // Every node starts unlit, the current job's too (only the pen lights it).
    const nodeFills = () => page.locator('[data-thread-node]').evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
    const unlit = await nodeFills();
    expect(new Set(unlit).size, unlit.join(' | ')).toBe(1);
    const board = page.locator('[data-thread-board]');
    await expect(board).not.toHaveAttribute('data-on', '');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    for (const sel of sels) {
      const all = await page.locator(sel).count();
      await expect(page.locator(`${sel}[data-thread-done]`), sel).toHaveCount(all, { timeout: 8000 });
    }
    await expect(board).toHaveAttribute('data-powered', '');
    await expect(page.locator('[data-thread-card][data-thread-lit]')).toHaveCount(await page.locator('[data-thread-card]').count());

    await page.evaluate(() => window.scrollTo(0, 0));
    for (const sel of sels) {
      await expect(page.locator(`${sel}[data-thread-done]`), sel).toHaveCount(0, { timeout: 8000 });
    }
    await expect(board).not.toHaveAttribute('data-powered', '');
    await expect(board).not.toHaveAttribute('data-on', '');
    await expect(page.locator('[data-thread-card][data-thread-lit]')).toHaveCount(0);
    await expect(page.locator('[data-thread-reset]')).toBeHidden();
    await expect.poll(nodeFills, { timeout: 2000 }).toEqual(unlit);
  });

  test('card marks and ink go as soon as the line retracts past them', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const cards = page.locator('[data-thread-card]');
    const all = await cards.count();
    await expect(page.locator('[data-thread-card][data-thread-done]')).toHaveCount(all, { timeout: 8000 });
    await page.waitForTimeout(900); // fully shown
    const marks = () => cards.evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el, '::after').opacity)));
    expect(Math.min(...(await marks()))).toBeGreaterThan(0.95);
    await page.evaluate(() => window.scrollBy(0, -500));
    await expect(page.locator('[data-thread-card][data-thread-done]')).toHaveCount(0, { timeout: 3000 });
    // The line has left the cards: within a moment nothing of the marks is left either.
    await page.waitForTimeout(450);
    expect(Math.max(...(await marks()))).toBeLessThan(0.05);
  });

  test('the chip powers on as the pen arrives, without a crawling tail, and lights the cards one by one', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as unknown as { __end: { t30: number; on: number } };
      w.__end = { t30: 0, on: 0 };
      const p = document.querySelector('[data-thread-path]')!;
      const board = document.querySelector('[data-thread-board]')!;
      const tick = (ts: number) => {
        const total = parseFloat(p.getAttribute('pathLength') ?? '0');
        const dash = parseFloat((p.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]);
        if (!w.__end.t30 && total > 0 && total - dash < 30) w.__end.t30 = ts;
        if (board.hasAttribute('data-powered')) w.__end.on = ts;
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
    const end = await page.evaluate(() => (window as unknown as { __end: { t30: number; on: number } }).__end);
    expect(end.t30).toBeGreaterThan(0);
    // A critically damped spring alone takes ~0.7s over its last 30px.
    expect(end.on - end.t30).toBeLessThan(350);
    // Each card lights when its net's pulse reaches it: one after another, all within a couple of seconds.
    const delays = await page.locator('[data-thread-card]').evaluateAll((els) => els.map((el) => parseFloat((el as HTMLElement).style.getPropertyValue('--thread-lit-delay'))));
    expect(new Set(delays).size).toBe(delays.length);
    expect(Math.max(...delays)).toBeLessThan(2000);
    const lit = await themeColor(page, 'hsl(var(--secondary) / 0.6)');
    await page.waitForTimeout(Math.max(...delays) + 700);
    const borders = await page.locator('[data-thread-card]').evaluateAll((els) => els.map((el) => getComputedStyle(el).borderColor));
    expect(borders.every((b) => b === lit), borders.join(' | ')).toBe(true);
  });

  test('the signal flows on into pin 1: the stub appears on arrival, the pulse ends in the pin and lights it', async ({ page }) => {
    // Board shown, line not arrived yet: no stub dangling below the chip.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight - 500));
    const board = page.locator('[data-thread-board]');
    await expect(board).toHaveAttribute('data-on', '', { timeout: 8000 });
    await expect(board).not.toHaveAttribute('data-powered', '');
    await expect(page.locator('.site-thread__stub')).toHaveCSS('opacity', '0');
    await page.evaluate(() => {
      const w = window as unknown as { __arrival: { ends: string[]; flashed: boolean } };
      w.__arrival = { ends: [], flashed: false };
      new MutationObserver((list) => {
        for (const m of list) for (const n of m.addedNodes) {
          const d = (n as Element).getAttribute?.('d') ?? '';
          const last = d.match(/[ML](-?[\d.]+),(-?[\d.]+)$/);
          if (last) w.__arrival.ends.push(`${last[1]},${last[2]}`);
        }
      }).observe(document.querySelector('[data-thread-pulses]')!, { childList: true });
      const pin = document.querySelector('.site-thread__pin--in')!;
      new MutationObserver(() => {
        if (pin.hasAttribute('data-flash')) w.__arrival.flashed = true;
      }).observe(pin, { attributes: true, attributeFilter: ['data-flash'] });
    });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(board).toHaveAttribute('data-powered', '', { timeout: 8000 });
    await expect(page.locator('.site-thread__stub')).toHaveCSS('opacity', '1');
    // The arrival pulse's own path ends at pin 1 (the stub's top), and the pin flashes when it gets there.
    const pin = await page.locator('.site-thread__pin--in').evaluate((el) => {
      const r = el as SVGRectElement;
      return { x: r.x.baseVal.value + r.width.baseVal.value / 2, y: r.y.baseVal.value + r.height.baseVal.value };
    });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __arrival: { flashed: boolean } }).__arrival.flashed), { timeout: 3000 }).toBe(true);
    const ends = await page.evaluate(() => (window as unknown as { __arrival: { ends: string[] } }).__arrival.ends);
    expect(ends.some((e) => {
      const [x, y] = e.split(',').map(Number);
      return Math.abs(x - pin.x) < 0.6 && Math.abs(y - pin.y) < 0.6;
    }), ends.join(' ')).toBe(true);
  });

  test('the reset switch presses, sends the signal back up the trace and returns to the top', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
    await countPulses(page);
    await page.locator('[data-thread-reset]').hover();
    await expect(page.locator('.site-thread-reset__tip')).toHaveCSS('opacity', '1');
    await page.evaluate(() => {
      const k = document.querySelector('[data-thread-knot]')!;
      const w = window as unknown as { __knotFlash: boolean };
      w.__knotFlash = false;
      new MutationObserver(() => {
        if (k.hasAttribute('data-flash')) w.__knotFlash = true;
      }).observe(k, { attributes: true, attributeFilter: ['data-flash'] });
    });
    await page.locator('[data-thread-reset]').click();
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-pressed', '');
    expect(await pulsesSeen(page)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 4000 }).toBe(0);
    await expect(page.locator('[data-thread-board]')).not.toHaveAttribute('data-powered', '', { timeout: 4000 });
    await expect(page.locator('[data-thread-board]')).not.toHaveAttribute('data-pressed', '');
    // The reset signal arrives at the start pad, which flashes.
    await expect.poll(() => page.evaluate(() => (window as unknown as { __knotFlash: boolean }).__knotFlash), { timeout: 4000 }).toBe(true);
  });

  test('the reset signal crosses every horizontal wire on screen, the line retracting behind it', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
    // Each frame: the signal's position, the drawn length and the signal's place on screen.
    await page.evaluate(() => {
      const w = window as unknown as { __rw: { pos: number; drawn: number; x: number; ly: number; y: number; flat: boolean }[] };
      w.__rw = [];
      const line = document.querySelector<SVGPathElement>('[data-thread-path]')!;
      const scale = line.getTotalLength() / parseFloat(line.getAttribute('pathLength')!);
      const at = (l: number) => line.getPointAtLength(Math.max(0, l) * scale);
      const f = () => {
        const el = document.querySelector('[data-thread-pulses] path');
        if (el) {
          const pos = 13 - parseFloat(el.getAttribute('stroke-dashoffset') ?? '0');
          const a = at(pos - 8), b = at(pos + 8), p = at(pos);
          const m = line.getScreenCTM()!;
          w.__rw.push({ pos, drawn: parseFloat((line.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]), x: p.x, ly: p.y, y: m.d * p.y + m.f, flat: Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 15 });
        }
        if (w.__rw.length < 600) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    await page.locator('[data-thread-reset]').click();
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 4000 }).toBe(0);
    await page.waitForTimeout(300);
    const { log, rows, rest, vh } = await page.evaluate(() => {
      const line = document.querySelector<SVGPathElement>('[data-thread-path]')!;
      // Horizontal wires (200px or longer) of the route, by their y and x span.
      const total = line.getTotalLength();
      const rows: { y: number; x0: number; x1: number }[] = [];
      let run: { y: number; x0: number; x1: number } | null = null;
      for (let l = 0; l <= total; l += 2) {
        const p = line.getPointAtLength(l), q = line.getPointAtLength(Math.min(total, l + 2));
        if (Math.abs(p.y - q.y) < 0.01 && Math.abs(p.x - q.x) > 1.9) {
          if (run && Math.abs(run.y - p.y) < 0.01) {
            run.x0 = Math.min(run.x0, p.x, q.x);
            run.x1 = Math.max(run.x1, p.x, q.x);
          } else run = { y: p.y, x0: Math.min(p.x, q.x), x1: Math.max(p.x, q.x) };
          if (run.x1 - run.x0 >= 200 && !rows.includes(run)) rows.push(run);
        } else run = null;
      }
      return {
        log: (window as unknown as { __rw: { pos: number; drawn: number; x: number; ly: number; y: number; flat: boolean }[] }).__rw,
        rows,
        rest: parseFloat((line.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]),
        vh: window.innerHeight,
      };
    });
    expect(log.length, 'frames with the signal').toBeGreaterThan(30);
    expect(rows.length, 'horizontal wires').toBeGreaterThan(3);
    // It crosses every horizontal wire (seen inside it), instead of jumping from one end to the other.
    for (const r of rows) {
      const inside = log.some((e) => e.flat && Math.abs(e.ly - r.y) < 1 && e.x > r.x0 + 20 && e.x < r.x1 - 20);
      expect(inside, `signal seen on the wire at y=${r.y.toFixed(0)} (${r.x0.toFixed(0)}-${r.x1.toFixed(0)})`).toBe(true);
    }
    for (const e of log) {
      if (e.pos <= 0) continue;
      // The page follows it: always on screen.
      expect(e.y, `signal on screen at ${e.pos.toFixed(0)}`).toBeGreaterThan(-2);
      expect(e.y, `signal on screen at ${e.pos.toFixed(0)}`).toBeLessThan(vh + 2);
      // It is the line's head: on the drawn part, with the line retracting right behind it.
      expect(e.drawn, 'on the drawn part').toBeGreaterThanOrEqual(e.pos - 0.5);
      expect(e.drawn, 'line retracts behind it').toBeLessThanOrEqual(Math.max(rest, e.pos + 14));
    }
  });

  test('scrolling during a reset hands the page back to the reader', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
    await page.locator('[data-thread-reset]').click();
    await page.waitForTimeout(300);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(150);
    const y = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(600);
    // No more scrolling by the reset, and its signal is gone.
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - y)).toBeLessThan(2);
    await expect(page.locator('[data-thread-pulses] path')).toHaveCount(0);
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

  test('a rebuild while a heading is still transformed by its reveal measures where it will rest', async ({ page }) => {
    await page.evaluate(() => document.fonts.ready);
    // Skills in view, but short of its reveal trigger (top 80%): the island has
    // hydrated and set the heading's start offset (y: 24px), and it holds there.
    await page.locator('#skills').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.9));
    const head = '#skills .gsap-reveal';
    await expect.poll(() => translateY(page, head), { timeout: 4000 }).toBeGreaterThan(10);
    await recordRebuilds(page, head);
    await page.setViewportSize({ width: 1180, height: 800 });
    await expect.poll(() => rebuilds(page)).not.toEqual([]);
    await page.waitForTimeout(500);
    // Now let it reveal (scrolling rebuilds nothing), and compare with where it rests.
    await page.locator('#skills').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.5));
    await expect.poll(() => translateY(page, head), { timeout: 4000 }).toBe(0);
    await page.waitForTimeout(300);
    const log = await rebuilds(page);
    expect(log[log.length - 1], `the last rebuild ran mid-reveal: ${log.join(', ')}`).toBeGreaterThan(5);
    const off = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
      const path = svg.querySelector<SVGPathElement>('[data-thread-path]')!;
      const s = svg.getBoundingClientRect();
      const bar = document.querySelector('#skills [data-thread-bar]')!.getBoundingClientRect();
      const cy = bar.top + bar.height / 2;
      let best = Infinity;
      for (let l = 0, total = path.getTotalLength(); l <= total; l += 1) {
        const p = path.getPointAtLength(l);
        if (s.left + p.x > bar.left && s.left + p.x < bar.right) best = Math.min(best, Math.abs(s.top + p.y - cy));
      }
      return best;
    });
    expect(off, 'the crossing runs through the bar').toBeLessThan(1);
  });

  test('jogs keep clear of the nodes, also after a rebuild while the timeline text slides in', async ({ page }) => {
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
        const rn = r.width / 2 + 9;
        let near = Infinity, side = 0;
        for (const [x, y] of pts) {
          if (Math.abs(y - cy) > rn * 2) continue;
          near = Math.min(near, Math.hypot(x - cx, y - cy));
          if (Math.abs(y - cy) < 1) side = Math.max(side, Math.abs(x - cx));
        }
        // The jog passes 8px clear of the node (its 45° legs) and runs rn beside the spine level with the node centre.
        return { clear: near - r.width / 2, side: side - rn };
      });
    });
    expect(gaps.length).toBe(await page.locator('[data-thread-node]').count());
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) {
      expect(g.clear).toBeGreaterThan(6.5);
      expect(g.clear).toBeLessThan(10);
      expect(Math.abs(g.side)).toBeLessThan(1.5);
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

  test('resizing at the bottom keeps the chip powered: no replay, no flicker, no stuck pulse', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
    await page.waitForTimeout(2500); // power-on sequence finished
    await countPulses(page);
    await page.evaluate(() => {
      const w = window as unknown as { __off: number; __unlit: number };
      w.__off = 0;
      w.__unlit = 0;
      const board = document.querySelector('[data-thread-board]')!;
      new MutationObserver(() => {
        if (!board.hasAttribute('data-powered')) w.__off++;
      }).observe(board, { attributes: true, attributeFilter: ['data-powered'] });
      for (const c of document.querySelectorAll('[data-thread-card]')) {
        new MutationObserver(() => {
          if (!c.hasAttribute('data-thread-lit')) w.__unlit++;
        }).observe(c, { attributes: true, attributeFilter: ['data-thread-lit'] });
      }
    });
    // A drag, 7px at a time, then a height-only change (the hero is viewport-tall here).
    for (let w = 1433; w >= 1300; w -= 7) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    }
    await page.setViewportSize({ width: 1300, height: 820 });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(600);
    const st = await page.evaluate(() => {
      const w = window as unknown as { __off: number; __unlit: number };
      return { off: w.__off, unlit: w.__unlit };
    });
    expect(st).toEqual({ off: 0, unlit: 0 });
    expect(await pulsesSeen(page)).toBe(0);
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-settled', '');
    // The net pulses play nothing again.
    const anims = await page.locator('.site-thread__net-pulse').evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
    expect(anims.every((a) => a === 'none'), anims.join(',')).toBe(true);
    // ...but a real power-off and power-on plays the sequence again.
    await page.evaluate(() => window.scrollBy(0, -600));
    await expect(page.locator('[data-thread-board]')).not.toHaveAttribute('data-powered', '', { timeout: 3000 });
    await expect(page.locator('[data-thread-board]')).not.toHaveAttribute('data-settled', '');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
    expect(await pulsesSeen(page)).toBeGreaterThan(0);
  });

  test('wheel scrolling with a jittering mouse sends no signal pulse', async ({ page }) => {
    await page.mouse.move(600, 300);
    await countPulses(page);
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, 60);
      await page.mouse.move(600 + (i % 2), 300);
      await page.waitForTimeout(25);
    }
    await page.waitForTimeout(300);
    expect(await pulsesSeen(page)).toBe(0);
  });

  test('the chip powers off the moment the line retracts from it', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
    const state = await page.evaluate(
      () =>
        new Promise<{ powered: boolean; lit: number }>((res) => {
          window.scrollBy(0, -400);
          // Three frames: the line has left the chip.
          requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res({
            powered: document.querySelector('[data-thread-board]')!.hasAttribute('data-powered'),
            lit: document.querySelectorAll('[data-thread-lit]').length,
          }))));
        }),
    );
    expect(state).toEqual({ powered: false, lit: 0 });
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

  test('on an edge rail the pen glow is never clipped', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.locator('#about').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 100));
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const w = window as unknown as { __glow: number[] };
      w.__glow = [];
      const g = document.querySelector('[data-thread-glow]')!;
      const t0 = performance.now();
      const tick = () => {
        if (getComputedStyle(g).opacity !== '0') {
          const cx = parseFloat(g.getAttribute('cx')!), r = parseFloat(g.getAttribute('r')!);
          w.__glow.push(cx - r, cx + r);
        }
        if (performance.now() - t0 < 2500) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // Scroll a little, so the pen runs down a rail with its glow.
    await page.mouse.move(400, 400);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(2600);
    const { glow, cw } = await page.evaluate(() => ({ glow: (window as unknown as { __glow: number[] }).__glow, cw: document.documentElement.clientWidth }));
    expect(glow.length).toBeGreaterThan(0);
    for (const v of glow) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(cw);
    }
  });

  test('a fast pointer sweep across the drawn trace sends a signal pulse both ways, never past the pen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 1250));
    await page.waitForTimeout(2500); // the pen comes to rest on the right rail
    const pen = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
      const path = svg.querySelector<SVGPathElement>('[data-thread-path]')!;
      const c = svg.querySelector('[data-thread-pen]')!;
      const s = svg.getBoundingClientRect();
      const dash = parseFloat((path.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]);
      const a = path.getPointAtLength(dash - 40), b = path.getPointAtLength(dash);
      return { x: s.left + parseFloat(c.getAttribute('cx')!), y: s.top + parseFloat(c.getAttribute('cy')!), vertical: Math.abs(a.x - b.x) < 0.5 && b.y - a.y > 39, dash };
    });
    expect(pen.vertical, 'the pen rests on a rail').toBe(true);
    await page.evaluate(() => {
      const w = window as unknown as { __pl: { max: number; min: number; seen: number; dirs: Set<number> } };
      w.__pl = { max: -Infinity, min: Infinity, seen: 0, dirs: new Set() };
      const g = document.querySelector('[data-thread-pulses]')!;
      const last = new Map<Element, number>();
      const t0 = performance.now();
      const tick = () => {
        for (const el of g.querySelectorAll('.site-thread__pulse')) {
          const pos = 13 - parseFloat(el.getAttribute('stroke-dashoffset') ?? '0');
          w.__pl.seen++;
          w.__pl.max = Math.max(w.__pl.max, pos);
          w.__pl.min = Math.min(w.__pl.min, pos);
          const prev = last.get(el);
          if (prev !== undefined && pos !== prev) w.__pl.dirs.add(Math.sign(pos - prev));
          last.set(el, pos);
        }
        if (performance.now() - t0 < 1800) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.mouse.move(pen.x + 60, pen.y - 80);
    await page.mouse.move(pen.x - 60, pen.y - 80, { steps: 2 });
    await page.waitForTimeout(1900);
    const pl = await page.evaluate(() => {
      const w = window as unknown as { __pl: { max: number; min: number; seen: number; dirs: Set<number> } };
      return { max: w.__pl.max, min: w.__pl.min, seen: w.__pl.seen, dirs: [...w.__pl.dirs].sort() };
    });
    expect(pl.seen, 'the sweep sent a pulse').toBeGreaterThan(0);
    expect(pl.dirs).toEqual([-1, 1]);
    expect(pl.max).toBeLessThanOrEqual(pen.dash + 1);
    // ...and they are gone again.
    await expect(page.locator('.site-thread__pulse')).toHaveCount(0, { timeout: 2000 });
  });

  test('a sweep across a part of the trace that is not drawn yet sends nothing', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 1250));
    await page.waitForTimeout(2500);
    // Well below the pen on the same rail: not drawn yet.
    const pen = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
      const c = svg.querySelector('[data-thread-pen]')!;
      const s = svg.getBoundingClientRect();
      return { x: s.left + parseFloat(c.getAttribute('cx')!), y: s.top + parseFloat(c.getAttribute('cy')!) };
    });
    await countPulses(page);
    await page.mouse.move(pen.x + 60, pen.y + 220);
    await page.mouse.move(pen.x - 60, pen.y + 220, { steps: 2 });
    await page.waitForTimeout(400);
    expect(await pulsesSeen(page)).toBe(0);
  });
});

test('without JavaScript the page has no thread and keeps the timeline line', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveClass(/\bthread-on\b/);
  await expect(page.locator('.site-thread')).toBeHidden();
  await expect(page.locator('[data-thread-line]')).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-thread-reset]')).toHaveCount(0);
  await context.close();
});

for (const path of ['/projects', '/resume', '/impressum']) {
  test(`${path} has no thread`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-thread-root]')).toHaveCount(0);
    await expect(page.locator('[data-thread-reset]')).toHaveCount(0);
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
  /** Frames where the line shows on a viewport whose content has not started to reveal. */
  blank: string[];
}

/**
 * Init script: records every frame for `ms` (default 4s) after navigation and
 * lists the frames where the drawn line has gone past a timeline node (or lit
 * it) whose card is still mostly transparent, or past a heading bar whose
 * heading is, while that content is on screen. Each frame is read after it has
 * been rendered (a task queued from the frame's callbacks), so the reading is
 * what was painted, whatever the order of the page's own frame callbacks.
 */
function revealRecorder(ms = 4000) {
  const rec: RevealRec = { done: false, frames: 0, violations: [], violationY: [], slid: [], noLine: [], firstDash: 0, minLen: 0, reachedNodes: false, restoredY: 0, blank: [] };
  (window as unknown as { __rec: RevealRec }).__rec = rec;
  const t0 = performance.now();
  const next = () => requestAnimationFrame(() => setTimeout(tick, 0));
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
      // The line on screen beside content that has not started to reveal at all.
      if (headY > 0) {
        const blocks = [...document.querySelectorAll('[data-thread-section]:not([data-thread-section="hero"]) .gsap-reveal')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.height > 0 && r.bottom > 0 && r.top < vh;
        });
        if (blocks.length && blocks.every((el) => parseFloat(getComputedStyle(el).opacity) < 0.05)) rec.blank.push(`${t}ms (scrollY ${Math.round(window.scrollY)}, head ${Math.round(headY)})`);
      }
    }
    if (t < ms) next();
    else rec.done = true;
  };
  next();
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
    expect(rec.blank, 'no line beside a viewport that has not started to reveal').toEqual([]);
    expect(rec.firstDash).toBeGreaterThan(rec.minLen + 200);
    expect(rec.reachedNodes).toBe(true);
  });

  test('after a reload at the page bottom, scrolling up never shows the line past content that has not revealed', async ({ page }) => {
    // The sections above hydrate only as they come back into view, after the
    // whole route was drawn at the bottom (also what a scrollbar jump does).
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await expect(page.locator('[data-thread-knot]')).toHaveCSS('opacity', '1', { timeout: 6000 });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(1500);
    await page.addInitScript(revealRecorder, 9000);
    await page.reload({ waitUntil: 'commit' });
    await page.waitForTimeout(2500);
    const bottom = await page.evaluate(() => window.scrollY);
    expect(bottom).toBeGreaterThan(2000);
    await page.mouse.move(683, 384);
    for (let i = 0; i < 40 && (await page.evaluate(() => window.scrollY)) > bottom - 2600; i++) {
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(70);
    }
    await page.waitForFunction(() => (window as unknown as { __rec?: { done: boolean } }).__rec?.done, null, { timeout: 12000 });
    const rec = await page.evaluate(() => (window as unknown as { __rec: RevealRec }).__rec);
    expect(rec.reachedNodes, 'scrolled back up through the timeline').toBe(true);
    expect(rec.violations).toEqual([]);
  });

  test('an island that hydrates late holds the line until its content reveals, however long it takes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await expect(page.locator('[data-thread-knot]')).toHaveCSS('opacity', '1', { timeout: 6000 });
    // The Experience heading in view, above the reading line.
    await page.locator('#experience').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 300));
    await page.waitForTimeout(1500);
    // A slow connection: the island's chunk arrives long after the section is in view.
    await page.route(/\/_astro\/Experience\.[^/]*\.js$/, async (route) => {
      await new Promise((r) => setTimeout(r, 4500));
      await route.continue();
    });
    await page.addInitScript(revealRecorder, 7000);
    await page.reload({ waitUntil: 'commit' });
    await page.waitForTimeout(3500);
    // Past the line's 2.5s cap for content that never reveals, and not hydrated yet.
    expect(await page.locator('#experience').evaluate((el) => el.closest('astro-island')?.hasAttribute('ssr'))).toBe(true);
    await page.waitForFunction(() => (window as unknown as { __rec?: { done: boolean } }).__rec?.done, null, { timeout: 12000 });
    const rec = await page.evaluate(() => (window as unknown as { __rec: RevealRec }).__rec);
    expect(rec.violations).toEqual([]);
    expect(rec.reachedNodes, 'the line does go on once the content is there').toBe(true);
  });

  test('scrolling away during the hero intro and back: nothing is drawn in the hero until the intro completes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      const w = window as unknown as { __hero: { v: string[]; drawingAway: boolean; back: number } };
      w.__hero = { v: [], drawingAway: false, back: 0 };
      const t0 = performance.now();
      const check = () => {
        const html = document.documentElement;
        const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]');
        const tags = document.querySelector('[data-thread-beads]');
        if (svg && tags && !('heroRevealed' in html.dataset)) {
          const t = Math.round(performance.now() - t0);
          const drawing = html.classList.contains('thread-drawing');
          const r = tags.getBoundingClientRect();
          const inView = r.bottom > 0 && r.top < window.innerHeight;
          if (drawing && !inView) w.__hero.drawingAway = true;
          if (drawing && inView) {
            w.__hero.back++;
            const path = svg.querySelector<SVGPathElement>('[data-thread-path]')!;
            const dash = parseFloat((path.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]) || 0;
            if (path.style.opacity === '1' && dash > 0.5) w.__hero.v.push(`${t}ms line drawn (${Math.round(dash)}) over tags at opacity ${getComputedStyle(tags).opacity}`);
            for (const sel of ['[data-thread-knot]', '[data-thread-pen]']) {
              const op = parseFloat(getComputedStyle(svg.querySelector(sel)!).opacity);
              if (op > 0.03) w.__hero.v.push(`${t}ms ${sel} at opacity ${op.toFixed(2)}`);
            }
          }
        }
        requestAnimationFrame(() => setTimeout(check, 0));
      };
      requestAnimationFrame(() => setTimeout(check, 0));
    });
    await page.goto('/');
    await page.waitForFunction(() => 'heroIntro' in document.documentElement.dataset);
    await page.mouse.move(720, 450);
    await page.waitForTimeout(200);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(250);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(40);
    }
    await page.waitForFunction(() => 'heroRevealed' in document.documentElement.dataset, null, { timeout: 8000 });
    const hero = await page.evaluate(() => (window as unknown as { __hero: { v: string[]; drawingAway: boolean; back: number } }).__hero);
    expect(hero.drawingAway, 'the line started in place while the hero was out of view').toBe(true);
    expect(hero.back, 'and the reader was back at the hero before the intro completed').toBeGreaterThan(5);
    expect(hero.v).toEqual([]);
    // Then the beads draw as usual.
    await expect.poll(() => dashLength(page), { timeout: 4000 }).toBeGreaterThan(200);
  });

  test('a rebuild during the hero intro measures the tags where they will rest', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await ready(page); // the font rebuild is done
    const tags = '[data-thread-beads]';
    await expect.poll(() => translateY(page, tags), { timeout: 4000 }).toBeGreaterThan(5);
    await recordRebuilds(page, tags);
    await page.setViewportSize({ width: 1180, height: 800 });
    await page.waitForFunction(() => 'heroRevealed' in document.documentElement.dataset, null, { timeout: 8000 });
    await page.waitForTimeout(400);
    const log = await rebuilds(page);
    expect(log.length).toBeGreaterThan(0);
    expect(log[log.length - 1], `the last rebuild ran mid-intro: ${log.join(', ')}`).toBeGreaterThan(5);
    for (const d of await beadOffsets(page)) expect(d).toBeLessThan(1.5);
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
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
    const full = await dashLength(page);
    const y = await page.evaluate(() => window.scrollY);
    // The viewport loses the URL bar's height; scrollY stays where it was.
    await page.setViewportSize({ width: 414, height: 840 });
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.scrollY)).toBe(y);
    expect(await dashLength(page)).toBeCloseTo(full, 0);
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '');
    await context.close();
  });
});
