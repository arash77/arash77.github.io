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
    for (const el of svg.querySelectorAll<SVGGraphicsElement>('.site-thread__chip, .site-thread__switch, .site-thread__silk, .site-thread__chip-text')) {
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

/**
 * Where the route runs through each heading bar (pads included, 4px beyond
 * its ends): the length at which the line enters it, in the path's own
 * pathLength units (-1 if it does not).
 */
function barCrossings(page: Page) {
  return page.evaluate(() => {
    const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
    const line = svg.querySelector<SVGPathElement>('[data-thread-path]')!;
    const s = svg.getBoundingClientRect();
    const total = line.getTotalLength();
    const unit = parseFloat(line.getAttribute('pathLength')!) / total;
    return [...document.querySelectorAll<HTMLElement>('[data-thread-bar]')].map((el) => {
      const r = el.getBoundingClientRect();
      const y = r.top + r.height / 2 - s.top, x0 = r.left - 4 - s.left, x1 = r.right + 4 - s.left;
      for (let l = 0; l <= total; l += 1) {
        const p = line.getPointAtLength(l);
        if (Math.abs(p.y - y) < 0.6 && p.x >= x0 && p.x <= x1) return { enter: l * unit };
      }
      return { enter: -1 };
    });
  });
}

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
    // Sparse silkscreen text: the chip's marking and the switch's label, nothing else.
    expect(await page.locator('[data-thread-board] text').allTextContents()).toEqual(['AK-01', 'RESET']);
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
    // Its name starts with the label it shows, so "click Reset" by voice finds it.
    await expect(page.locator('[data-thread-reset]')).toHaveAccessibleName('Reset: back to top');
    await expect(page.getByRole('button', { name: /^reset\b/i })).toHaveCount(1);
  });

  test('the reset switch focus ring passes clear of its label at every width', async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await ready(page);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const gap = await page.evaluate(() => {
        const btn = document.querySelector('[data-thread-reset]')!.getBoundingClientRect();
        // Ring: outline offset + width outside the (round) button.
        const ring = btn.width / 2 + 1 + 2;
        const cx = btn.left + btn.width / 2, cy = btn.top + btn.height / 2;
        const label = document.querySelector('.site-thread__silk')!.getBoundingClientRect();
        const dx = Math.max(label.left - cx, 0, cx - label.right), dy = Math.max(label.top - cy, 0, cy - label.bottom);
        return Math.hypot(dx, dy) - ring;
      });
      expect(gap, `${width}px`).toBeGreaterThan(2);
    }
  });

  test('the heading bars are LEDs on the trace: pads at both ends, lit, a plain body', async ({ page }) => {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await ready(page);
      const bars = page.locator('[data-thread-bar]');
      const n = await bars.count();
      expect(n).toBeGreaterThan(3);
      await expect(page.locator('[data-thread-bar][data-thread-done]')).toHaveCount(n);
      const looks = await bars.evaluateAll((els) => els.map((el) => [getComputedStyle(el, '::before').width, getComputedStyle(el, '::after').width, getComputedStyle(el).boxShadow, getComputedStyle(el).backgroundImage]));
      for (const [a, b, glow, body] of looks) {
        expect([a, b]).toEqual(['5px', '5px']);
        expect(glow, 'lit').not.toBe('none');
        // One gradient, no marks on it.
        expect(body.match(/gradient\(/g)?.length, body).toBe(1);
      }
      for (const c of await barCrossings(page)) expect(c.enter, `${width}px: the route runs through the bar`).toBeGreaterThanOrEqual(0);
    }
  });

  test('in forced colors the heading bars never cut gaps into the trace', async ({ page }) => {
    // Forced colors turn the pads' background into the Canvas colour while the
    // trace keeps its own: pads over the line would show as two gaps per bar.
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active', colorScheme: scheme });
      await page.goto('/');
      await ready(page);
      const bars = page.locator('[data-thread-bar]');
      const n = await bars.count();
      expect(n).toBeGreaterThan(3);
      const bad: string[] = [];
      for (let i = 0; i < n; i++) {
        await bars.nth(i).scrollIntoViewIfNeeded();
        const b = (await bars.nth(i).boundingBox())!;
        const w = Math.round(b.width);
        const png = (await page.screenshot({ clip: { x: Math.round(b.x) - 20, y: Math.round(b.y + b.height / 2) - 4, width: w + 40, height: 8 } })).toString('base64');
        // A column's strength: its largest colour distance from the Canvas
        // (the clip's top-left pixel, above the line). Through each pad's
        // centre the row must show at least half the line's strength beside the bar.
        const s = await page.evaluate(
          async ({ png, cols }) => {
            const img = new Image();
            img.src = `data:image/png;base64,${png}`;
            await img.decode();
            const c = document.createElement('canvas');
            [c.width, c.height] = [img.width, img.height];
            const ctx = c.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            const d = ctx.getImageData(0, 0, c.width, c.height).data;
            return cols.map((x) => {
              let m = 0;
              for (let y = 0; y < img.height; y++) {
                const k = (y * img.width + x) * 4;
                m = Math.max(m, Math.abs(d[k] - d[0]) + Math.abs(d[k + 1] - d[1]) + Math.abs(d[k + 2] - d[2]));
              }
              return m;
            });
          },
          // The clip starts 20px left of the bar; the pads overhang its ends by 4px.
          { png, cols: [20 - 12, 20 - 2, 20 + w + 1, 20 + w + 12] },
        );
        const line = Math.min(s[0], s[3]);
        if (s[1] < line / 2 || s[2] < line / 2) bad.push(`bar ${i}: line ${line}, pads ${s[1]} / ${s[2]}`);
      }
      expect(bad, scheme).toEqual([]);
    }
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

  test('the reset switch hover label below the switch hangs clear of the ground symbol', async ({ page }) => {
    for (const width of [390, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await ready(page);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const reset = page.locator('[data-thread-reset]');
      await expect(reset).toHaveAttribute('data-side', 'below');
      await reset.hover();
      await expect(page.locator('.site-thread-reset__tip')).toHaveCSS('opacity', '1');
      const { tip, bars } = await page.evaluate(() => {
        const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
        const s = svg.getBoundingClientRect();
        const b = document.querySelector('[data-thread-reset]')!.getBoundingClientRect();
        const cy = b.top + b.height / 2;
        // The ground symbol's bars: the board's level wires (M x,y H x2) under the switch, stroke included.
        const bars = [...svg.querySelectorAll<SVGPathElement>('[data-thread-board] > path.site-thread__wire')]
          .filter((p) => /^M[\d.]+,[\d.]+H[\d.]+$/.test(p.getAttribute('d') ?? ''))
          .map((p) => {
            const bb = p.getBBox();
            const sw = parseFloat(getComputedStyle(p).strokeWidth);
            return { x0: s.left + bb.x - sw / 2, x1: s.left + bb.x + bb.width + sw / 2, y0: s.top + bb.y - sw / 2, y1: s.top + bb.y + bb.height + sw / 2 };
          })
          .filter((r) => r.y0 > cy);
        return { tip: document.querySelector('.site-thread-reset__tip')!.getBoundingClientRect().toJSON(), bars };
      });
      expect(bars, `${width}px: the ground symbol's bars`).toHaveLength(3);
      // All three bars show: none under the tip, none touching its edge.
      const gaps = bars.map((r) => +Math.max(tip.top - r.y1, r.y0 - tip.bottom, tip.left - r.x1, r.x0 - tip.right).toFixed(2));
      for (const gap of gaps) expect(gap, `${width}px: tip top ${tip.top}, gaps to the bars ${gaps.join(', ')}`).toBeGreaterThanOrEqual(1.5);
    }
  });

  test('the reset switch hover label can be hovered, and Escape dismisses it', async ({ page }) => {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await ready(page);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const reset = page.locator('[data-thread-reset]');
      const tip = page.locator('.site-thread-reset__tip');
      const silk = page.locator('.site-thread__silk');
      // Beside the switch the tip takes the label's place; below it, it hangs under the ground symbol.
      const beside = (await reset.getAttribute('data-side')) !== 'below';
      const hovered = () => reset.evaluate((el) => el.matches(':hover'));
      // Hoverable: the pointer moves from the switch onto the tip, which stays.
      await reset.hover();
      await expect(tip).toHaveCSS('opacity', '1');
      const t = (await tip.boundingBox())!;
      await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 10 });
      expect(await hovered(), `${width}px: on the tip`).toBe(true);
      await expect(tip).toHaveCSS('opacity', '1');
      // Dismissible: Escape hides it where the pointer is, and the label comes back.
      const y = await page.evaluate(() => window.scrollY);
      await page.keyboard.press('Escape');
      await expect(tip, `${width}px: hover + Escape`).toHaveCSS('opacity', '0');
      if (beside) await expect(silk).toHaveCSS('opacity', '1');
      expect(await page.evaluate(() => window.scrollY)).toBe(y);
      // Not for good: the next hover shows it again.
      await page.mouse.move(5, 5);
      await reset.hover();
      await expect(tip).toHaveCSS('opacity', '1');
      await page.mouse.move(5, 5);
      await expect(tip).toHaveCSS('opacity', '0');
      // Keyboard: Shift+Tab back from the footer onto the switch, then Escape.
      await page.locator('footer a').first().focus();
      await page.keyboard.press('Shift+Tab');
      await expect(reset).toBeFocused();
      await expect(tip).toHaveCSS('opacity', '1');
      await page.keyboard.press('Escape');
      await expect(tip, `${width}px: focus + Escape`).toHaveCSS('opacity', '0');
      if (beside) await expect(silk).toHaveCSS('opacity', '1');
      await expect(reset).toBeFocused();
    }
  });

  test('the reset switch hover label can be hovered from anywhere on the round switch, not only its centre line', async ({ page }) => {
    const sides = new Set<string>();
    for (const width of [1280, 1024, 600, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await ready(page);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const reset = page.locator('[data-thread-reset]');
      const tip = page.locator('.site-thread-reset__tip');
      const side = (await reset.getAttribute('data-side'))!;
      sides.add(side);
      const b = (await reset.boundingBox())!;
      const [cx, cy] = [b.x + b.width / 2, b.y + b.height / 2];
      // Where the pointer leaves the switch, and with it the tip, if anywhere.
      await reset.evaluate((el: HTMLElement, [cx, cy]) => {
        const w = window as unknown as { __left: string | null };
        el.addEventListener('mouseleave', (e) => (w.__left ??= `(${e.clientX - cx}, ${e.clientY - cy})`));
      }, [cx, cy]);
      // Points of the round switch off its line to the tip (above and below it
      // beside the switch, either side of it below): from these a move to the
      // tip leaves the circle before it meets the tip's edge.
      const starts = side === 'below' ? [[13, 1], [-12, 4], [10, 9]] : [[4, 10], [0, -12], [-6, 12]];
      for (const [sx, dy] of starts) {
        const dx = side === 'left' ? -sx : sx;
        const [x0, y0] = [cx + dx, cy + dy];
        await page.mouse.move(5, 5);
        await page.mouse.move(x0, y0);
        await expect(tip, `${width}px: shown from (${dx}, ${dy})`).toHaveCSS('opacity', '1');
        await page.evaluate(() => ((window as unknown as { __left: string | null }).__left = null));
        // 1px at a time onto the tip: level across beside the switch (then up
        // or down onto it from above or below its reach), straight down below it.
        const t = (await tip.boundingBox())!;
        const x1 = side === 'below' ? x0 : side === 'right' ? t.x + 3 : t.x + t.width - 3;
        const y1 = side === 'below' ? t.y + 3 : y0;
        await page.mouse.move(x1, y1, { steps: Math.ceil(Math.abs(x1 - x0) + Math.abs(y1 - y0)) });
        const y2 = Math.min(Math.max(y1, t.y + 3), t.y + t.height - 3);
        if (y2 !== y1) await page.mouse.move(x1, y2, { steps: Math.ceil(Math.abs(y2 - y1)) });
        const left = await page.evaluate(() => (window as unknown as { __left: string | null }).__left);
        expect(left, `${width}px ${side}: from (${dx}, ${dy}) the pointer left the switch at ${left}`).toBeNull();
        await expect(tip).toHaveCSS('opacity', '1');
      }
    }
    expect([...sides].sort()).toEqual(['below', 'left', 'right']);
  });

  test('the reset switch label is readable in both themes', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await ready(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    for (const theme of ['light', 'dark']) {
      await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), theme === 'dark');
      // The label sits on the page background (the body's colour fades over to it).
      const bg = await themeColor(page, 'hsl(var(--background))');
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(bg);
      const ratio = await page.evaluate((bg) => {
        const rgba = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
        const lum = (rgb: number[]) => {
          const [r, g, b] = rgb.map((v) => {
            const x = v / 255;
            return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const back = rgba(bg);
        const [r, g, b, a = 1] = rgba(getComputedStyle(document.querySelector('.site-thread__silk')!).fill);
        const [x, y] = [lum([r, g, b].map((v, i) => v * a + back[i] * (1 - a))), lum(back)];
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      }, bg);
      // WCAG AA for its 8px text: it names the switch at rest.
      expect(ratio, theme).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('the board text and the hidden hover label stay out of copied text and find in page', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await ready(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.locator('[data-thread-board][data-powered]').waitFor({ state: 'attached' });
    await page.mouse.move(5, 5);
    const tip = page.locator('.site-thread-reset__tip');
    await expect(tip).toHaveCSS('opacity', '0');
    // Select all + copy, through the real clipboard.
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Control+C');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied, 'the tip nobody sees').not.toContain('Back to top');
    expect(copied, 'the decorative silk').not.toMatch(/AK-01|RESET/);
    const found = await page.evaluate(() => {
      window.getSelection()!.removeAllRanges();
      return (window as unknown as { find: (s: string) => boolean }).find('Back to top');
    });
    expect(found, 'find in page').toBe(false);
    // Still there for the reader who hovers the switch.
    await page.locator('[data-thread-reset]').hover();
    await expect(tip).toBeVisible();
    await expect(tip).toHaveCSS('opacity', '1');
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

  test('after a reset, a click in the page still sets where the next Tab goes', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await ready(page);
    const reset = page.locator('[data-thread-reset]');
    // Straight after the reset (<main> still holds its focus), and after a Tab has moved on from it.
    for (const tabFirst of [false, true]) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await reset.click();
      await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 3000 }).toBe(0);
      if (tabFirst) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => document.activeElement!.getBoundingClientRect().top)).toBeLessThan(800);
      }
      // Later, a click on plain text in Contact, then Tab: on to the next link
      // there, not back to the first one in the page (<main> took the click).
      await page.locator('#contact p.text-lg').first().click({ position: { x: 4, y: 8 } });
      expect(await page.evaluate(() => document.activeElement?.id), `Tab first: ${tabFirst}`).not.toBe('main-content');
      const y = await page.evaluate(() => window.scrollY);
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('#contact')), `Tab first: ${tabFirst}`).toBe(true);
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(y - 80);
    }
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
    for (const sel of ['main a[href="/projects/"]', '[data-thread-card]', '[data-thread-node]', '[data-thread-reset]']) {
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
    // On screen Contact makes room under the board for its ground symbol (py-24 otherwise).
    await expect(page.locator('#contact')).toHaveCSS('padding-bottom', '112px');
    await page.emulateMedia({ media: 'print' });
    // The route is laid out for the screen, not the paper: it must not print.
    await expect(page.locator('.site-thread')).toBeHidden();
    await expect(page.locator('[data-thread-line]')).toHaveCSS('opacity', '1');
    await expect(page.locator('[data-thread-reset]')).toBeHidden();
    // ...nor the room for it: Contact prints with its own py-24.
    await expect(page.locator('#contact')).toHaveCSS('padding-bottom', '96px');
    // Lit nodes, ink and the cards' marks and lighting print as the page without the thread.
    await expect(page.locator('[data-thread-node]').last()).toHaveCSS('background-color', await themeColor(page, 'hsl(var(--card))'));
    await expect(page.locator('[data-thread-ink]').first()).toHaveCSS('background-size', '0% 2px');
    expect(await page.locator('[data-thread-card]').first().evaluate((el) => getComputedStyle(el, '::after').display)).toBe('none');
    // The heading bars print as plain bars: no pads, no glow.
    expect(await page.locator('[data-thread-bar]').first().evaluate((el) => [getComputedStyle(el, '::before').content, getComputedStyle(el).boxShadow])).toEqual(['none', 'none']);
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

  test('at a small browser font size the ground symbol still fits under the chip, inside the page', async ({ page }) => {
    // The board hangs a fixed distance in px below the cards; the thread layer
    // is clipped at the bottom of Contact.
    const cdp = await page.context().newCDPSession(page);
    for (const standard of [12, 14]) {
      await cdp.send('Page.setFontSizes', { fontSizes: { standard } });
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/');
        await ready(page);
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(`${standard}px`);
        const board = page.locator('[data-thread-board]');
        await expect(board.locator('.site-thread__chip')).toHaveCount(1);
        const { bottom, clip } = await board.evaluate((g) => {
          const b = (g as SVGGElement).getBBox();
          const stroke = parseFloat(getComputedStyle(g.querySelector('.site-thread__wire')!).strokeWidth);
          return { bottom: b.y + b.height + stroke / 2, clip: +g.closest('svg')!.getAttribute('height')! };
        });
        expect(bottom, `bottom of the ground symbol at ${standard}px, ${width}px wide`).toBeLessThanOrEqual(clip);
      }
    }
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
      document.querySelector<HTMLElement>('main a[href="/projects/"]')!.scrollIntoView({ block: 'center' });
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

  test('under reduced motion the reset jumps to the top at once, with no signal', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await ready(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    await page.locator('[data-thread-reset]').click();
    // Read once, without retrying: a smooth scroll or the eased rewind would also get to the top, just later.
    const { y, pulses } = await page.evaluate(
      () =>
        new Promise<{ y: number; pulses: number }>((res) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => res({ y: window.scrollY, pulses: document.querySelectorAll('[data-thread-pulses] path').length })),
          ),
        ),
    );
    expect(y, 'scrollY two frames after the press').toBe(0);
    expect(pulses, 'reset signal paths').toBe(0);
  });

  test("the reset switch hover label takes the RESET label's place: the label hides while it shows", async ({ page }) => {
    const sides = new Set<string>();
    for (const width of [1280, 600]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await ready(page);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const reset = page.locator('[data-thread-reset]');
      const tip = page.locator('.site-thread-reset__tip');
      const silk = page.locator('.site-thread__silk');
      const side = (await reset.getAttribute('data-side'))!;
      sides.add(side);
      await expect(silk, `${width}px ${side}: at rest`).toHaveCSS('opacity', '1');
      // Hover: the tip opens over the label, which goes.
      await reset.hover();
      await expect(tip).toHaveCSS('opacity', '1');
      await expect(silk, `${width}px ${side}: hover`).toHaveCSS('opacity', '0');
      await page.mouse.move(5, 5);
      await expect(silk).toHaveCSS('opacity', '1');
      // Keyboard focus: the same.
      await page.locator('footer a').first().focus();
      await page.keyboard.press('Shift+Tab');
      await expect(reset).toBeFocused();
      await expect(tip).toHaveCSS('opacity', '1');
      await expect(silk, `${width}px ${side}: focus`).toHaveCSS('opacity', '0');
    }
    expect([...sides].sort()).toEqual(['left', 'right']);
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

    // Ink (a company in Experience): the reading line (62%) first below it, then above it.
    const ink = page.locator('#experience [data-thread-ink]').first();
    const inkAt = (f: number) => ink.evaluate((el, f) => window.scrollTo(0, el.getBoundingClientRect().bottom + window.scrollY - window.innerHeight * f), f);
    await inkAt(0.3);
    await expect(ink).toHaveAttribute('data-thread-done', '', { timeout: 8000 });
    await expect(ink).toHaveCSS('background-size', '100% 2px', { timeout: 3000 });
    await inkAt(0.9);
    await expect(ink).not.toHaveAttribute('data-thread-done', '', { timeout: 3000 });
    await page.waitForTimeout(450);
    expect(parseFloat(await ink.evaluate((el) => getComputedStyle(el).backgroundSize))).toBeLessThan(5);
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

  test('once the power-on has played, the nets, pin 1 and the lit cards follow a theme toggle with the page', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
    const delays = await page.locator('[data-thread-card]').evaluateAll((els) => els.map((el) => parseFloat((el as HTMLElement).style.getPropertyValue('--thread-lit-delay'))));
    await page.waitForTimeout(Math.max(...delays) + 1500); // the power-on sequence has played
    const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    await page.locator('button[aria-label="Toggle dark mode"]').first().click();
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(!dark);
    const want = {
      nets: Array(await page.locator('.site-thread__net').count()).fill(await themeColor(page, 'hsl(var(--secondary) / 0.9)')),
      pin: await themeColor(page, 'hsl(var(--secondary))'),
      cards: Array(await page.locator('[data-thread-card]').count()).fill(await themeColor(page, 'hsl(var(--secondary) / 0.6)')),
    };
    const colours = () =>
      page.evaluate(() => ({
        nets: [...document.querySelectorAll('.site-thread__net')].map((el) => getComputedStyle(el).stroke),
        pin: getComputedStyle(document.querySelector('.site-thread__pin--in')!).fill,
        cards: [...document.querySelectorAll('[data-thread-card]')].map((el) => getComputedStyle(el).borderColor),
      }));
    // The page takes 0.3s, a card's border 0.45s: nothing waits out the power-on stagger (up to ~1.2s) again.
    await expect.poll(colours, { timeout: 900, intervals: [50] }).toEqual(want);
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
    // Each frame: the signal's position, the drawn length, the signal's place on screen and how many other signals show.
    await page.evaluate(() => {
      const w = window as unknown as { __rw: { pos: number; drawn: number; x: number; ly: number; y: number; flat: boolean; others: number }[]; __pressed: boolean };
      w.__rw = [];
      w.__pressed = false;
      const line = document.querySelector<SVGPathElement>('[data-thread-path]')!;
      const scale = line.getTotalLength() / parseFloat(line.getAttribute('pathLength')!);
      const at = (l: number) => line.getPointAtLength(Math.max(0, l) * scale);
      // Pressed the moment the chip powers on, while the arrival signal still runs (on its own path) into pin 1.
      const board = document.querySelector('[data-thread-board]')!;
      new MutationObserver((_, mo) => {
        if (!board.hasAttribute('data-powered')) return;
        mo.disconnect();
        document.querySelector<HTMLButtonElement>('[data-thread-reset]')!.click();
        w.__pressed = true;
      }).observe(board, { attributes: true, attributeFilter: ['data-powered'] });
      const f = () => {
        // The reset signal is the one on the line itself.
        const all = [...document.querySelectorAll('.site-thread__pulse')];
        const el = all.find((p) => p.getAttribute('d') === line.getAttribute('d'));
        if (el) {
          const pos = 13 - parseFloat(el.getAttribute('stroke-dashoffset') ?? '0');
          const a = at(pos - 8), b = at(pos + 8), p = at(pos);
          const m = line.getScreenCTM()!;
          w.__rw.push({ pos, drawn: parseFloat((line.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]), x: p.x, ly: p.y, y: m.d * p.y + m.f, flat: Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 15, others: all.length - 1 });
        }
        if (w.__rw.length < 600) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => (window as unknown as { __pressed: boolean }).__pressed), { timeout: 8000 }).toBe(true);
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 4000 }).toBe(0);
    await page.waitForTimeout(300);
    const { log, rows, rest, end, vh } = await page.evaluate(() => {
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
        log: (window as unknown as { __rw: { pos: number; drawn: number; x: number; ly: number; y: number; flat: boolean; others: number }[] }).__rw,
        rows,
        rest: parseFloat((line.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]),
        end: parseFloat(line.getAttribute('pathLength')!),
        vh: window.innerHeight,
      };
    });
    expect(log.length, 'frames with the signal').toBeGreaterThan(30);
    expect(rows.length, 'horizontal wires').toBeGreaterThan(3);
    expect(log.some((e) => e.others > 0), 'pressed while the arrival signal ran').toBe(true);
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
      expect(e.drawn, 'line retracts behind it').toBeLessThanOrEqual(Math.max(rest, e.pos + 17));
      // Once the line is off the chip, the arrival signal has gone with the power.
      if (e.drawn < end - 2) expect(e.others, `other signals with the line drawn to ${e.drawn.toFixed(0)}`).toBe(0);
    }
  });

  for (const [w, h] of [[900, 420], [844, 390]] as const) {
    test(`in a short window the page sets off with the reset signal, never ahead of it (${w}x${h})`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
      // At the bottom of a short window the chip sits well above the reading line.
      const above = await page.evaluate(() => {
        const svg = document.querySelector('[data-thread-svg]')!.getBoundingClientRect();
        return window.innerHeight * 0.62 - (svg.top + parseFloat(document.querySelector('[data-thread-end]')!.getAttribute('cy')!));
      });
      expect(above, 'px from the chip down to the reading line').toBeGreaterThan(40);
      // Each painted frame: the page's scroll position and how far along the
      // trace the reset signal is (where it sets off, the line's end, until it
      // shows), up to halfway back. Pressed by script, so the click never
      // scrolls the switch into view first.
      const { log, end } = await page.evaluate(
        () =>
          new Promise<{ log: { y: number; pos: number }[]; end: number }>((resolve) => {
            const line = document.querySelector('[data-thread-path]')!;
            const end = parseFloat(line.getAttribute('pathLength')!);
            const log: { y: number; pos: number }[] = [];
            const f = () => {
              const el = [...document.querySelectorAll('.site-thread__pulse')].find((p) => p.getAttribute('d') === line.getAttribute('d'));
              log.push({ y: window.scrollY, pos: el ? 13 - parseFloat(el.getAttribute('stroke-dashoffset') ?? '0') : end });
              if (log.length === 2) document.querySelector<HTMLButtonElement>('[data-thread-reset]')!.click();
              if (log.length < 300 && log[log.length - 1].pos > end / 2) requestAnimationFrame(f);
              else resolve({ log, end });
            };
            requestAnimationFrame(f);
          }),
      );
      expect(log[log.length - 1].pos, 'the signal halfway back').toBeLessThan(end / 2);
      // The page follows the signal: in no frame does it move farther than the
      // signal does along the trace (snapped to the reading line at once, it
      // would jump in the frame of the press, before the signal has moved).
      for (let i = 1; i < log.length; i++) {
        const moved = log[i - 1].y - log[i].y, ran = log[i - 1].pos - log[i].pos;
        expect(moved - ran, `frame ${i}: page moved ${moved}px, the signal ${ran.toFixed(1)}px`).toBeLessThan(4);
      }
    });
  }

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

  test('reduced motion turning on during a reset still takes the reader to the top', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
    const max = await page.evaluate(() => window.scrollY);
    await page.locator('[data-thread-reset]').click();
    // Well on its way up, the reader's system switches to reduced motion.
    await page.waitForFunction((max) => window.scrollY < max * 0.7, max, { polling: 'raf' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // The reset ends as it does under reduced motion: at the top at once, with no signal.
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 1000 }).toBe(0);
    await expect(page.locator('[data-thread-pulses] path')).toHaveCount(0);
  });

  test('a resize during a reset goes on at its pace, its signal leading the line into the start pad', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
    // Each painted frame (read after the frame's callbacks): rebuilt yet, the start pad flashed yet, and the reset signal's position.
    await page.evaluate(() => {
      const w = window as unknown as { __rw: { t: number; rebuilt: boolean; knot: boolean; pos: number | null }[] };
      w.__rw = [];
      const line = document.querySelector('[data-thread-path]')!;
      let rebuilt = false;
      new MutationObserver(() => (rebuilt = true)).observe(line, { attributes: true, attributeFilter: ['d'] });
      const k = document.querySelector('[data-thread-knot]')!;
      let knot = false;
      new MutationObserver(() => (knot ||= k.hasAttribute('data-flash'))).observe(k, { attributes: true, attributeFilter: ['data-flash'] });
      const f = () => {
        const el = [...document.querySelectorAll('.site-thread__pulse')].find((p) => p.getAttribute('d') === line.getAttribute('d'));
        w.__rw.push({ t: performance.now(), rebuilt, knot, pos: el ? 13 - parseFloat(el.getAttribute('stroke-dashoffset') ?? '0') : null });
        if (w.__rw.length < 600) requestAnimationFrame(() => setTimeout(f, 0));
      };
      requestAnimationFrame(() => setTimeout(f, 0));
    });
    await page.locator('[data-thread-reset]').click();
    // A third of the way back up, the window narrows (snapped to half the screen).
    await page.waitForFunction(() => {
      const line = document.querySelector('[data-thread-path]')!;
      const el = [...document.querySelectorAll('.site-thread__pulse')].find((p) => p.getAttribute('d') === line.getAttribute('d'));
      return !!el && 13 - parseFloat(el.getAttribute('stroke-dashoffset') ?? '0') < parseFloat(line.getAttribute('pathLength')!) * 0.67;
    }, null, { polling: 'raf' });
    await page.setViewportSize({ width: 768, height: 800 });
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 4000 }).toBe(0);
    const log = await page.evaluate(() => (window as unknown as { __rw: { t: number; rebuilt: boolean; knot: boolean; pos: number | null }[] }).__rw);
    const i = log.findIndex((e) => e.rebuilt);
    // The reset goes on from the same place, its signal leading the line until it runs into the start pad (which flashes)...
    const run = log.slice(i).filter((e) => !e.knot);
    expect(run.length, 'frames of the reset after the rebuild').toBeGreaterThan(10);
    expect(run.filter((e) => e.pos === null).length, 'frames of the reset without its signal').toBe(0);
    expect(log.some((e) => e.knot), 'the start pad flashed').toBe(true);
    // ...at the pace it had (started over, it would stall and then run past its end).
    const speed = (a: (typeof log)[number], b: (typeof log)[number]) => (a.pos! - b.pos!) / (b.t - a.t);
    expect(speed(log[i], log[i + 3]), 'px/ms after the rebuild').toBeGreaterThan(speed(log[i - 4], log[i - 1]) / 2);
  });

  test('a second press during a reset does not start it over: its signal runs on into the start pad', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
    // Each painted frame: the reset signal's position; the presses, the second
    // one (a double click) once the signal is on its way; the start pad's flash.
    await page.evaluate(() => {
      const w = window as unknown as { __rw: { t: number; pos: number }[]; __presses: number[]; __second: number; __knot: number };
      w.__rw = [];
      w.__presses = [];
      w.__second = -1;
      w.__knot = 0;
      const btn = document.querySelector<HTMLButtonElement>('[data-thread-reset]')!;
      btn.addEventListener('click', () => w.__presses.push(performance.now()), { capture: true });
      const k = document.querySelector('[data-thread-knot]')!;
      new MutationObserver(() => {
        if (!w.__knot && k.hasAttribute('data-flash')) w.__knot = performance.now();
      }).observe(k, { attributes: true, attributeFilter: ['data-flash'] });
      const line = document.querySelector('[data-thread-path]')!;
      const end = parseFloat(line.getAttribute('pathLength')!);
      const f = () => {
        const el = [...document.querySelectorAll('.site-thread__pulse')].find((p) => p.getAttribute('d') === line.getAttribute('d'));
        if (el) {
          const pos = 13 - parseFloat(el.getAttribute('stroke-dashoffset') ?? '0');
          w.__rw.push({ t: performance.now(), pos });
          if (w.__second < 0 && pos < end - 300) {
            w.__second = w.__rw.length;
            btn.click();
          }
        }
        if (!w.__knot) requestAnimationFrame(() => setTimeout(f, 0));
      };
      requestAnimationFrame(() => setTimeout(f, 0));
    });
    await page.locator('[data-thread-reset]').click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __knot: number }).__knot), { timeout: 4000 }).toBeGreaterThan(0);
    const { rw, presses, second, knot } = await page.evaluate(() => {
      const w = window as unknown as { __rw: { t: number; pos: number }[]; __presses: number[]; __second: number; __knot: number };
      return { rw: w.__rw, presses: w.__presses, second: w.__second, knot: w.__knot };
    });
    expect(presses.length, 'pressed twice').toBe(2);
    expect(rw.length - second, 'frames after the second press').toBeGreaterThan(5);
    // It never jumps back towards the chip (started over, it would, by 16px)...
    for (let i = 1; i < rw.length; i++) expect(rw[i].pos, `frame ${i} (second press at ${second})`).toBeLessThanOrEqual(rw[i - 1].pos + 0.5);
    // ...goes on at its pace across the press (started over, it would all but stop)...
    const near = (t: number) => rw.reduce((a, e) => (Math.abs(e.t - t) < Math.abs(a.t - t) ? e : a));
    const at = rw[second - 1];
    const speed = (a: (typeof rw)[number], b: (typeof rw)[number]) => (a.pos - b.pos) / (b.t - a.t);
    expect(speed(at, near(at.t + 100)), 'px/ms after the second press').toBeGreaterThan(speed(near(at.t - 100), at) / 2);
    // ...and runs into the start pad on time. A loose bound, with room for a
    // loaded machine: the checks above are what catch a run started over.
    expect(knot - presses[0]).toBeLessThan(2000 + 300);
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
    await page.evaluate(() => document.fonts.ready);
    // Experience in view, but short of its reveal trigger (top 75%): the island
    // has hydrated and holds the timeline text at its start offset (y: 20px).
    const body = '#experience .timeline-card:last-child .timeline-body';
    await page.locator('#experience').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.9));
    await expect.poll(() => translateY(page, body), { timeout: 4000 }).toBeGreaterThan(10);
    await recordRebuilds(page, body);
    await page.setViewportSize({ width: 1180, height: 800 });
    await expect.poll(() => rebuilds(page)).not.toEqual([]);
    await page.waitForTimeout(500);
    // Now let it reveal (scrolling rebuilds nothing), then compare the geometry with the settled layout.
    await page.locator('#experience').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.5));
    await expect.poll(() => translateY(page, body), { timeout: 4000 }).toBe(0);
    await page.waitForTimeout(300);
    const log = await rebuilds(page);
    expect(log[log.length - 1], `the last rebuild ran mid-reveal: ${log.join(', ')}`).toBeGreaterThan(5);
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

    // What slides in with the text: each company's ink lights as the line reaches
    // where it rests (its bottom, less the 6px lead), not before and not 20px later.
    const inks = page.locator('#experience [data-thread-ink]');
    expect(await inks.count()).toBeGreaterThan(0);
    for (const ink of await inks.all()) {
      // The reading line (62%) `d` px below the ink's bottom, and the line at rest there.
      const lineAt = async (d: number) => {
        await ink.evaluate((el, d) => window.scrollTo(0, el.getBoundingClientRect().bottom + window.scrollY - window.innerHeight * 0.62 + d), d);
        await page.evaluate(
          () =>
            new Promise<void>((res) => {
              const p = document.querySelector('[data-thread-path]')!;
              let last = '', same = 0;
              const f = () => {
                const d = p.getAttribute('stroke-dasharray') ?? '';
                same = d === last ? same + 1 : 0;
                last = d;
                if (same >= 10) res();
                else requestAnimationFrame(f);
              };
              requestAnimationFrame(f);
            }),
        );
      };
      await lineAt(-14);
      await expect(ink).not.toHaveAttribute('data-thread-done', '');
      await lineAt(0);
      await expect(ink).toHaveAttribute('data-thread-done', '');
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

  test('a focused reset switch keeps its focus while the line retracts from the board, and goes once focus has left it', async ({ page }) => {
    const board = page.locator('[data-thread-board]');
    const reset = page.locator('[data-thread-reset]');
    const onSwitch = async () => {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(board).toHaveAttribute('data-powered', '', { timeout: 8000 });
      // By keyboard: back from the first footer link.
      await page.locator('footer a').first().focus();
      await page.keyboard.press('Shift+Tab');
      await expect(reset).toBeFocused();
      // Scrolled up until the line has left the contact cards: the board goes.
      await page.evaluate(() => window.scrollBy(0, -500));
      await expect(page.locator('[data-thread-card][data-thread-done]')).toHaveCount(0, { timeout: 3000 });
      await expect(board).not.toHaveAttribute('data-on', '');
    };
    await onSwitch();
    // The switch stays (focus does not drop to <body>)...
    await expect(reset).toBeFocused();
    await expect(reset).toBeVisible();
    // The line at rest (its length unchanged for a few frames): no frame runs
    // that could tidy up after the blur.
    const still = () =>
      page.locator('[data-thread-path]').evaluate(
        (p) =>
          new Promise<boolean>((res) => {
            const a = p.getAttribute('stroke-dasharray');
            let n = 0;
            const f = () => (p.getAttribute('stroke-dasharray') !== a ? res(false) : ++n < 6 ? requestAnimationFrame(f) : res(true));
            requestAnimationFrame(f);
          }),
      );
    await expect.poll(still, { timeout: 4000 }).toBe(true);
    // Leaving the window blurs it but keeps the focus on it: it stays.
    await reset.dispatchEvent('blur');
    await expect(reset).toBeVisible();
    // It goes once focus leaves it.
    await reset.blur();
    await expect(reset).toBeHidden();
    // Enter on it still takes the reader back to the top.
    await onSwitch();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 4000 }).toBe(0);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('main-content');
  });

  test('pulled back from the chip as it arrives, the line takes the arrival signal with it: no light past its head, no flash in pin 1', async ({ page }) => {
    // Board shown, line not arrived yet.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight - 500));
    const board = page.locator('[data-thread-board]');
    await expect(board).toHaveAttribute('data-on', '', { timeout: 8000 });
    await expect(board).not.toHaveAttribute('data-powered', '');
    await countPulses(page);
    await page.evaluate(() => {
      const w = window as unknown as { __back: { over: string[]; pin: boolean; done: boolean } };
      w.__back = { over: [], pin: false, done: false };
      const b = document.querySelector('[data-thread-board]')!;
      const line = document.querySelector('[data-thread-path]')!;
      const pin = b.querySelector('.site-thread__pin--in')!;
      new MutationObserver(() => {
        if (pin.hasAttribute('data-flash')) w.__back.pin = true;
      }).observe(pin, { attributes: true, attributeFilter: ['data-flash'] });
      // The page bounces off its bottom the moment the chip powers on.
      let up = false, off = 0;
      new MutationObserver(() => {
        if (b.hasAttribute('data-powered')) {
          if (!up) window.scrollBy(0, -400);
          up = true;
        } else if (up && !off) off = performance.now();
      }).observe(b, { attributes: true, attributeFilter: ['data-powered'] });
      // Every frame: the far end of the arrival signal's light (its own path is
      // the route's last stretch, then the stub) as a length on the route.
      const f = () => {
        const total = parseFloat(line.getAttribute('pathLength')!);
        const drawn = parseFloat((line.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]);
        for (const el of document.querySelectorAll('.site-thread__pulse')) {
          const d = el.getAttribute('d') ?? '';
          if (d === line.getAttribute('d')) continue;
          const pts = [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
          let run = 0; // up to the route's end (the stub is the last leg)
          for (let i = 1; i < pts.length - 1; i++) run += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          const pos = 13 - parseFloat(el.getAttribute('stroke-dashoffset') ?? '0');
          const lit = parseFloat((el.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]);
          const front = total - run + pos - 13 + lit;
          if (drawn < total - 1 && front > drawn + 2.5) w.__back.over.push(`light to ${front.toFixed(1)}, drawn ${drawn.toFixed(1)}`);
        }
        if (off && performance.now() - off > 600) w.__back.done = true;
        else requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => (window as unknown as { __back: { done: boolean } }).__back.done), { timeout: 10000 }).toBe(true);
    expect(await pulsesSeen(page), 'the arrival signal set off').toBeGreaterThan(0);
    const back = await page.evaluate(() => (window as unknown as { __back: { over: string[]; pin: boolean } }).__back);
    expect(back.over).toEqual([]);
    // It never reaches pin 1: the line left the chip before it got there.
    expect(back.pin, 'pin 1 flashed').toBe(false);
  });

  test('pulled back from the chip, the line takes the signals on its nets with it: no pin or card flashes on an unpowered board', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
    // The arrival signal has run into pin 1.
    await expect(page.locator('[data-thread-pulses] path')).toHaveCount(0, { timeout: 3000 });
    // The middle of the longest horizontal leg of the first net.
    const leg = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
      const s = svg.getBoundingClientRect();
      const pts = [...(svg.querySelector('.site-thread__net')!.getAttribute('d') ?? '').matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
      let best = { len: 0, x: 0, y: 0 };
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        if (Math.abs(ay - by) < 0.01 && Math.abs(bx - ax) > best.len) best = { len: Math.abs(bx - ax), x: s.left + (ax + bx) / 2, y: s.top + ay };
      }
      return best;
    });
    expect(leg.len).toBeGreaterThan(30);
    await page.evaluate(() => {
      const w = window as unknown as { __back: { sent: number; unpowered: string[]; done: boolean } };
      w.__back = { sent: 0, unpowered: [], done: false };
      const b = document.querySelector('[data-thread-board]')!;
      // The page bounces off its bottom the moment the signals set off.
      new MutationObserver((list) => {
        for (const m of list) for (const n of m.addedNodes) if ((n as Element).classList.contains('site-thread__pulse') && w.__back.sent++ === 0) window.scrollBy(0, -400);
      }).observe(document.querySelector('[data-thread-pulses]')!, { childList: true });
      let off = 0;
      new MutationObserver(() => {
        if (!b.hasAttribute('data-powered')) off ||= performance.now();
      }).observe(b, { attributes: true, attributeFilter: ['data-powered'] });
      for (const el of document.querySelectorAll('.site-thread__pin, [data-thread-card]')) {
        new MutationObserver(() => {
          if (el.hasAttribute('data-flash') && !b.hasAttribute('data-powered')) w.__back.unpowered.push(`${el.matches('[data-thread-card]') ? 'a card' : 'a pin'} flashed`);
        }).observe(el, { attributes: true, attributeFilter: ['data-flash'] });
      }
      // Every frame: no signal left on the board once it is off.
      const f = () => {
        if (!b.hasAttribute('data-powered')) for (const el of document.querySelectorAll('.site-thread__pulse')) w.__back.unpowered.push(`signal shown: ${el.getAttribute('d')?.slice(0, 30)}`);
        if (off && performance.now() - off > 600) w.__back.done = true;
        else requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    await page.mouse.move(leg.x, leg.y - 25);
    await page.waitForTimeout(300);
    await page.mouse.move(leg.x, leg.y + 25, { steps: 2 });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __back: { done: boolean } }).__back.done), { timeout: 5000 }).toBe(true);
    const back = await page.evaluate(() => (window as unknown as { __back: { sent: number; unpowered: string[] } }).__back);
    expect(back.sent, 'signals along the net').toBe(2);
    expect(back.unpowered).toEqual([]);
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

  test("on an edge rail the pen glow's flash is never clipped either: it grows only as far as there is room", async ({ page }) => {
    // The pen's x once it has come to rest (unmoved for a few frames).
    const penAtRest = () =>
      page.evaluate(async () => {
        const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
        const c = svg.querySelector('[data-thread-pen]')!;
        const at = () => `${c.getAttribute('cx')} ${c.getAttribute('cy')}`;
        const was = at();
        for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame);
        return at() === was ? svg.getBoundingClientRect().left + parseFloat(c.getAttribute('cx')!) : NaN;
      });
    // The glow's flash (a signal pouring into the pen) seeked through its 0.7s: its box every 5ms.
    const flash = () =>
      page.evaluate(() => {
        const g = document.querySelector('[data-thread-glow]')!;
        g.removeAttribute('data-flash');
        void getComputedStyle(g).transform;
        g.setAttribute('data-flash', '');
        const a = g.getAnimations().find((x) => (x as CSSAnimation).animationName === 'thread-flash-glow')!;
        a.pause();
        const boxes: [number, number][] = [];
        for (let t = 0; t <= 700; t += 5) {
          a.currentTime = t;
          const b = g.getBoundingClientRect();
          boxes.push([b.left, b.right]);
        }
        a.cancel();
        g.removeAttribute('data-flash');
        return { boxes, cw: document.documentElement.clientWidth };
      });
    await page.setViewportSize({ width: 768, height: 900 });
    // The pen at rest on the left rail, then on the right one (both 7px in).
    for (const [y, side] of [[900, 'left'], [1300, 'right']] as const) {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      if (side === 'left') await expect.poll(penAtRest, { timeout: 8000 }).toBeLessThan(20);
      else await expect.poll(penAtRest, { timeout: 8000 }).toBeGreaterThan(748);
      const { boxes, cw } = await flash();
      boxes.forEach(([l, r], i) => {
        expect(l, `${side} rail, ${i * 5}ms`).toBeGreaterThanOrEqual(0);
        expect(r, `${side} rail, ${i * 5}ms`).toBeLessThanOrEqual(cw);
      });
    }
    // With room (the right rail at 1440), it still flashes at 1.8x its size.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 1250));
    await expect.poll(penAtRest, { timeout: 8000 }).toBeGreaterThan(720);
    const { boxes } = await flash();
    expect(boxes[0][1] - boxes[0][0]).toBeCloseTo(2 * 11 * 1.8, 0);
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
          const lit = parseFloat((el.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]);
          w.__pl.seen++;
          // The far end of its light.
          w.__pl.max = Math.max(w.__pl.max, pos - 13 + lit);
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
    expect(pl.max, 'the light never runs past the pen').toBeLessThanOrEqual(pen.dash - 2.5);
    // ...and they are gone again.
    await expect(page.locator('.site-thread__pulse')).toHaveCount(0, { timeout: 2000 });
  });

  test('on a horizontal wire the signal starts where the pointer crossed it; moving along or beside it sends nothing', async ({ page }) => {
    await page.locator('#skills').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 300));
    await page.waitForTimeout(2500);
    // A drawn horizontal stretch of at least 300px on screen.
    const row = await page.evaluate(() => {
      const line = document.querySelector<SVGPathElement>('[data-thread-path]')!;
      const drawn = parseFloat((line.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]);
      const scale = line.getTotalLength() / parseFloat(line.getAttribute('pathLength')!);
      const m = line.getScreenCTM()!;
      for (let l = 0; l < drawn - 300; l += 4) {
        const a = line.getPointAtLength(l * scale), c = line.getPointAtLength((l + 300) * scale);
        const y = m.d * a.y + m.f;
        if (Math.abs(a.y - c.y) < 0.01 && Math.abs(a.x - c.x) > 299 && y > 100 && y < window.innerHeight - 100) {
          return { x0: m.a * Math.min(a.x, c.x) + m.e, x1: m.a * Math.max(a.x, c.x) + m.e, y };
        }
      }
      return null;
    });
    expect(row, 'a horizontal wire on screen').not.toBeNull();
    const { x0, x1, y } = row!;
    // Where each new pulse starts, on screen.
    await page.evaluate(() => {
      const w = window as unknown as { __starts: [number, number][] };
      w.__starts = [];
      const line = document.querySelector<SVGPathElement>('[data-thread-path]')!;
      const scale = line.getTotalLength() / parseFloat(line.getAttribute('pathLength')!);
      new MutationObserver((list) => {
        for (const m of list) {
          for (const n of m.addedNodes) {
            if (!(n as Element).classList.contains('site-thread__pulse')) continue;
            const pos = 13 - parseFloat((n as Element).getAttribute('stroke-dashoffset') ?? 'NaN');
            const p = line.getPointAtLength(pos * scale), c = line.getScreenCTM()!;
            w.__starts.push([c.a * p.x + c.e, c.d * p.y + c.f]);
          }
        }
      }).observe(document.querySelector('[data-thread-pulses]')!, { childList: true });
    });
    const starts = () => page.evaluate(() => (window as unknown as { __starts: [number, number][] }).__starts);
    // Fast along the wire, then fast along a line 6px beside it: nothing.
    for (const dy of [0, -6, 6]) {
      await page.mouse.move(x0 + 20, y + dy);
      await page.waitForTimeout(300);
      await page.mouse.move(x1 - 20, y + dy, { steps: 6 });
      await page.waitForTimeout(300);
    }
    expect(await starts(), 'no signal without crossing the wire').toEqual([]);
    // Fast across it: two pulses, both starting where the pointer crossed.
    const mid = (x0 + x1) / 2;
    await page.mouse.move(mid, y - 40);
    await page.waitForTimeout(300);
    await page.mouse.move(mid, y + 40, { steps: 2 });
    await page.waitForTimeout(200);
    const got = await starts();
    expect(got).toHaveLength(2);
    // Their glow is layered strokes, never a CSS filter: GPUs draw a filter over
    // a path the size of the page in tiles, with seams (a copy of the light below it).
    const filters = await page.locator('[data-thread-pulses] path').evaluateAll((els) => els.map((el) => getComputedStyle(el).filter));
    expect(filters.length).toBeGreaterThan(0);
    expect(filters.every((f) => f === 'none'), filters.join()).toBe(true);
    for (const [sx, sy] of got) {
      expect(Math.abs(sx - mid), `starts at the crossing (${sx.toFixed(1)} vs ${mid.toFixed(1)})`).toBeLessThan(2);
      expect(Math.abs(sy - y)).toBeLessThan(1);
    }
  });

  test('a heading LED is lit exactly while the drawn line has entered it', async ({ page }) => {
    const crossings = await barCrossings(page);
    const k = 1; // the Skills heading
    const enter = crossings[k].enter;
    expect(enter).toBeGreaterThan(0);
    // Every frame: the drawn length and whether the LED is lit (both set in the same frame).
    await page.evaluate((k) => {
      const w = window as unknown as { __led: [number, boolean][] };
      w.__led = [];
      const line = document.querySelector('[data-thread-path]')!;
      const bar = document.querySelectorAll('[data-thread-bar]')[k];
      const f = () => {
        w.__led.push([parseFloat((line.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]), bar.hasAttribute('data-thread-done')]);
        if (w.__led.length < 900) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    }, k);
    const barTop = () => page.locator('[data-thread-bar]').nth(k).evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    // Ahead of the line, then through it, then back.
    await page.evaluate((y) => window.scrollTo(0, y - window.innerHeight * 0.95), await barTop());
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-thread-bar]').nth(k)).not.toHaveAttribute('data-thread-done', '');
    await page.evaluate((y) => window.scrollTo(0, y - window.innerHeight * 0.3), await barTop());
    await expect(page.locator('[data-thread-bar]').nth(k)).toHaveAttribute('data-thread-done', '', { timeout: 4000 });
    await page.evaluate((y) => window.scrollTo(0, y - window.innerHeight * 0.95), await barTop());
    await expect(page.locator('[data-thread-bar]').nth(k)).not.toHaveAttribute('data-thread-done', '', { timeout: 4000 });
    const log = await page.evaluate(() => (window as unknown as { __led: [number, boolean][] }).__led);
    expect(log.some(([, on]) => on) && log.some(([, on]) => !on)).toBe(true);
    for (const [dash, on] of log) {
      if (Math.abs(dash - enter) < 4) continue; // the sample step of the route
      expect(on, `drawn ${dash.toFixed(0)} vs enters at ${enter.toFixed(0)}`).toBe(dash > enter);
    }
  });

  test('a signal through a lit heading LED makes it blink', async ({ page }) => {
    // The About row is drawn and its LED lit.
    await page.locator('#about [data-thread-bar]').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 300));
    await expect(page.locator('#about [data-thread-bar]')).toHaveAttribute('data-thread-done', '', { timeout: 4000 });
    await page.waitForTimeout(1500);
    await page.locator('#about [data-thread-bar]').evaluate((el) => {
      const w = window as unknown as { __blink: boolean };
      w.__blink = false;
      new MutationObserver(() => {
        if (el.hasAttribute('data-flash')) w.__blink = true;
      }).observe(el, { attributes: true, attributeFilter: ['data-flash'] });
    });
    // Sweep across the row 160px beside the bar: one of the two signals runs through it.
    const r = await page.locator('#about [data-thread-bar]').evaluate((el) => el.getBoundingClientRect().toJSON());
    const x = r.left - 160, y = r.top + r.height / 2;
    await page.mouse.move(x, y - 40);
    await page.waitForTimeout(300);
    await page.mouse.move(x, y + 40, { steps: 2 });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __blink: boolean }).__blink), { timeout: 2000 }).toBe(true);
  });

  test('a signal along the hero tags makes each tag blink as it passes, in order', async ({ page }) => {
    const tags = page.locator('[data-thread-beads] > *');
    // The run through the tags (the beads) is drawn past the last one.
    await expect.poll(() => page.evaluate(() => {
      const line = document.querySelector<SVGPathElement>('[data-thread-path]')!;
      const drawn = parseFloat((line.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]);
      const scale = line.getTotalLength() / parseFloat(line.getAttribute('pathLength')!);
      const p = line.getPointAtLength(drawn * scale), m = line.getScreenCTM()!;
      const last = document.querySelector('[data-thread-beads]')!.lastElementChild!.getBoundingClientRect();
      return m.a * p.x + m.e > last.right + 30 || m.d * p.y + m.f > last.bottom + 10;
    }), { timeout: 8000 }).toBe(true);
    await page.locator('[data-thread-beads]').evaluate((row) => {
      const w = window as unknown as { __blinks: number[] };
      w.__blinks = [];
      const kids = [...row.children];
      new MutationObserver((list) => {
        for (const m of list) if ((m.target as Element).hasAttribute('data-flash')) w.__blinks.push(kids.indexOf(m.target as Element));
      }).observe(row, { attributes: true, subtree: true, attributeFilter: ['data-flash'] });
    });
    // Sweep across the run just before the first tag: one signal runs right, through every tag.
    const first = (await tags.first().boundingBox())!;
    const x = first.x - 8, y = first.y + first.height / 2;
    await page.mouse.move(x, y - 30);
    await page.waitForTimeout(300);
    await page.mouse.move(x, y + 30, { steps: 3 });
    const n = await tags.count();
    expect(n).toBeGreaterThan(1);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __blinks: number[] }).__blinks), { timeout: 3000 }).toEqual([...Array(n).keys()]);
  });

  test('the reset signal blinks each lit heading LED it runs back through', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
    const bars = page.locator('[data-thread-bar]');
    await expect(page.locator('[data-thread-bar][data-thread-done]')).toHaveCount(await bars.count());
    await bars.evaluateAll((els) => {
      const w = window as unknown as { __blinks: boolean[] };
      w.__blinks = els.map(() => false);
      els.forEach((el, i) => new MutationObserver(() => {
        if (el.hasAttribute('data-flash')) w.__blinks[i] = true;
      }).observe(el, { attributes: true, attributeFilter: ['data-flash'] }));
    });
    await page.locator('[data-thread-reset]').click();
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 4000 }).toBe(0);
    // Each blinks as the signal passes, then goes dark with the line behind it.
    await expect.poll(() => page.evaluate(() => (window as unknown as { __blinks: boolean[] }).__blinks), { timeout: 2000 }).toEqual(Array(await bars.count()).fill(true));
    await expect(page.locator('[data-thread-bar][data-thread-done]')).toHaveCount(0);
  });

  test('a sweep across a powered net sends the signal into its card (which blinks) and its pin (which flashes); the ground wire stays quiet', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
    await page.waitForTimeout(2500); // the power-on sequence has played
    // The middle of the longest horizontal leg of the first net, on screen.
    const leg = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
      const s = svg.getBoundingClientRect();
      const net = svg.querySelector<SVGPathElement>('.site-thread__net')!;
      const pts = [...(net.getAttribute('d') ?? '').matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
      let best = { len: 0, x: 0, y: 0 };
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        if (Math.abs(ay - by) < 0.01 && Math.abs(bx - ax) > best.len) best = { len: Math.abs(bx - ax), x: s.left + (ax + bx) / 2, y: s.top + ay };
      }
      // The ground symbol's wire: the lowest vertical wire (it ends at the ground symbol).
      const wires = [...svg.querySelectorAll<SVGPathElement>('.site-thread__wire')].map((w) => [...(w.getAttribute('d') ?? '').matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]));
      const g = wires.filter((w) => w.length === 2 && Math.abs(w[0][0] - w[1][0]) < 0.01).sort((p, q) => Math.max(q[0][1], q[1][1]) - Math.max(p[0][1], p[1][1]))[0];
      return { ...best, gx: s.left + g[0][0], gy: s.top + (g[0][1] + g[1][1]) / 2, net: net.getAttribute('d') };
    });
    expect(leg.len).toBeGreaterThan(30);
    await page.evaluate(() => {
      const w = window as unknown as { __net: { ds: string[]; card: boolean; pin: boolean } };
      w.__net = { ds: [], card: false, pin: false };
      new MutationObserver((list) => {
        for (const m of list) for (const n of m.addedNodes) if ((n as Element).classList.contains('site-thread__pulse')) w.__net.ds.push((n as Element).getAttribute('d') ?? '');
      }).observe(document.querySelector('[data-thread-pulses]')!, { childList: true });
      const watch = (el: Element, key: 'card' | 'pin') => new MutationObserver(() => {
        if (el.hasAttribute('data-flash')) w.__net[key] = true;
      }).observe(el, { attributes: true, attributeFilter: ['data-flash'] });
      for (const el of document.querySelectorAll('[data-thread-card]')) watch(el, 'card');
      for (const el of document.querySelectorAll('.site-thread__pin')) watch(el, 'pin');
    });
    // Across the ground wire first: nothing.
    await page.mouse.move(leg.gx - 30, leg.gy);
    await page.waitForTimeout(300);
    await page.mouse.move(leg.gx + 30, leg.gy, { steps: 2 });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { __net: { ds: string[] } }).__net.ds)).toEqual([]);
    // Across the net: two signals along it, the card blinks and the pin flashes.
    await page.mouse.move(leg.x, leg.y - 25);
    await page.waitForTimeout(300);
    await page.mouse.move(leg.x, leg.y + 25, { steps: 2 });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __net: { card: boolean; pin: boolean } }).__net), { timeout: 2000 }).toEqual(expect.objectContaining({ card: true, pin: true }));
    const ds = await page.evaluate(() => (window as unknown as { __net: { ds: string[] } }).__net.ds);
    expect(ds).toHaveLength(2);
    const norm = (d: string) => [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => `${(+m[1]).toFixed(1)},${(+m[2]).toFixed(1)}`);
    const net = norm(leg.net!);
    expect(ds.map(norm)).toEqual(expect.arrayContaining([net, [...net].reverse()]));
  });

  test("a flashing pin's outline shrinks away smoothly: no ring that snaps off mid-flash", async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
    // A top pin (a net sweep flashes it) and pin 1 (the arrival flashes it): each flash seeked
    // through its 0.7s, the width of the outline drawn every 5ms (none without a stroke).
    const widths = await page.evaluate(() =>
      [document.querySelector('.site-thread__pin:not(.site-thread__pin--in)')!, document.querySelector('.site-thread__pin--in')!].map((el) => {
        el.removeAttribute('data-flash');
        void getComputedStyle(el).stroke;
        el.setAttribute('data-flash', '');
        const a = el.getAnimations().find((x) => (x as CSSAnimation).animationName === 'thread-flash')!;
        a.pause();
        const out: number[] = [];
        for (let t = 0; t <= 700; t += 5) {
          a.currentTime = t;
          const cs = getComputedStyle(el);
          out.push(cs.stroke === 'none' ? 0 : parseFloat(cs.strokeWidth));
        }
        a.cancel();
        el.removeAttribute('data-flash');
        return out;
      }),
    );
    for (const w of widths) {
      expect(w[0], 'it flashes as a ring').toBeGreaterThan(4);
      for (let i = 1; i < w.length; i++) expect(Math.abs(w[i] - w[i - 1]), `at ${i * 5}ms`).toBeLessThan(0.2);
    }
  });

  test('a flurry of signals into the pen never makes its glow jump: a flash runs to its end', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 1250));
    await page.waitForTimeout(2500); // the pen comes to rest on the right rail
    const pen = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
      const c = svg.querySelector('[data-thread-pen]')!;
      const s = svg.getBoundingClientRect();
      return { x: s.left + parseFloat(c.getAttribute('cx')!), y: s.top + parseFloat(c.getAttribute('cy')!) };
    });
    // Every change of the glow's flash, and its scale every frame.
    await page.evaluate(() => {
      const g = document.querySelector('[data-thread-glow]')!;
      const w = window as unknown as { __fl: [number, boolean][]; __sc: number[] };
      w.__fl = [];
      w.__sc = [];
      const t0 = performance.now();
      new MutationObserver(() => w.__fl.push([performance.now() - t0, g.hasAttribute('data-flash')])).observe(g, { attributes: true, attributeFilter: ['data-flash'] });
      const f = () => {
        const m = getComputedStyle(g).transform.match(/matrix\(([-\d.]+)/);
        w.__sc.push(m ? parseFloat(m[1]) : 1);
        if (performance.now() - t0 < 3200) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    // Sweeps across the rail above the pen, at different heights (each is its own crossing).
    for (let i = 0; i < 14; i++) {
      const y = pen.y - 60 - (i % 7) * 70;
      await page.mouse.move(pen.x + 50, y);
      await page.mouse.move(pen.x - 50, y, { steps: 2 });
      await page.waitForTimeout(90);
    }
    await page.waitForTimeout(1600);
    const { fl, sc } = await page.evaluate(() => {
      const w = window as unknown as { __fl: [number, boolean][]; __sc: number[] };
      return { fl: w.__fl, sc: w.__sc };
    });
    expect(fl.filter(([, on]) => on).length, 'it flashed').toBeGreaterThan(0);
    // On, off, on, off... and every flash lasts its full length.
    fl.forEach(([t, on], i) => {
      expect(on, `change ${i}`).toBe(i % 2 === 0);
      if (!on) expect(t - fl[i - 1][0], 'a flash runs to its end').toBeGreaterThan(650);
    });
    // The glow only ever grows at the start of a flash, from rest.
    for (let i = 1; i < sc.length; i++) if (sc[i] - sc[i - 1] > 0.2) expect(sc[i - 1], `frame ${i}`).toBeLessThan(1.05);
  });

  test('a signal never shows past the drawn line, also while the line retracts under it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 1250));
    await page.waitForTimeout(2500); // the pen comes to rest on the right rail
    const pen = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
      const c = svg.querySelector('[data-thread-pen]')!;
      const s = svg.getBoundingClientRect();
      return { x: s.left + parseFloat(c.getAttribute('cx')!), y: s.top + parseFloat(c.getAttribute('cy')!) };
    });
    // Every frame: the far end of each signal's light against the drawn length.
    await page.evaluate(() => {
      const w = window as unknown as { __over: string[]; __seen: number };
      w.__over = [];
      w.__seen = 0;
      const line = document.querySelector('[data-thread-path]')!;
      const t0 = performance.now();
      const f = () => {
        const drawn = parseFloat((line.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]);
        for (const el of document.querySelectorAll('.site-thread__pulse')) {
          if ((el.getAttribute('d') ?? '') !== line.getAttribute('d')) continue;
          const pos = 13 - parseFloat(el.getAttribute('stroke-dashoffset') ?? '0');
          const lit = parseFloat((el.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]);
          if (lit <= 0) continue;
          w.__seen++;
          if (pos - 13 + lit > drawn - 2.5) w.__over.push(`light to ${(pos - 13 + lit).toFixed(1)}, drawn ${drawn.toFixed(1)}`);
        }
        if (performance.now() - t0 < 2500) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    // Sweeps just above the pen (the signal heading down reaches it at once), then the line pulls back under them.
    for (const dy of [30, 60, 90]) {
      await page.mouse.move(pen.x + 50, pen.y - dy);
      await page.mouse.move(pen.x - 50, pen.y - dy, { steps: 2 });
      await page.waitForTimeout(40);
    }
    await page.evaluate(() => window.scrollBy(0, -500));
    await page.waitForTimeout(2600);
    const { over, seen } = await page.evaluate(() => {
      const w = window as unknown as { __over: string[]; __seen: number };
      return { over: w.__over, seen: w.__seen };
    });
    expect(seen, 'signals were sent').toBeGreaterThan(0);
    expect(over).toEqual([]);
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

  test('a key press that does not scroll, during a reset, hands the page back to the reader', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
    const max = await page.evaluate(() => window.scrollY);
    await page.locator('[data-thread-reset]').click();
    // Early in the run, well before it could end by itself.
    await page.waitForFunction((max) => window.scrollY < max - 200, max, { polling: 'raf' });
    await page.keyboard.press('Shift');
    // Read at once: the reset's own signal is gone (not only once it has run into the start pad).
    const { y, pulses } = await page.evaluate(() => ({ y: window.scrollY, pulses: document.querySelectorAll('[data-thread-pulses] path').length }));
    expect(pulses, 'reset signal right after the key').toBe(0);
    await page.waitForTimeout(600);
    const y2 = await page.evaluate(() => window.scrollY);
    expect(Math.abs(y2 - y), `scrollY ${y} then ${y2} 600 ms later`).toBeLessThan(2);
    expect(y2).toBeGreaterThan(100);
  });

  test('a finger put down without moving, during a reset, hands the page back to the reader', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await ready(page);
    await expect(page.locator('[data-thread-knot]')).toHaveCSS('opacity', '1', { timeout: 6000 });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
    const max = await page.evaluate(() => window.scrollY);
    await page.locator('[data-thread-reset]').click();
    await page.waitForFunction((max) => window.scrollY < max - 200, max, { polling: 'raf' });
    // A touch start with no move: nothing scrolls the page, so only the touch itself can stop the reset.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 640, y: 400 }] });
    const { y, pulses } = await page.evaluate(() => ({ y: window.scrollY, pulses: document.querySelectorAll('[data-thread-pulses] path').length }));
    expect(pulses, 'reset signal right after the touch').toBe(0);
    await page.waitForTimeout(600);
    const y2 = await page.evaluate(() => window.scrollY);
    expect(Math.abs(y2 - y), `scrollY ${y} then ${y2} 600 ms later`).toBeLessThan(2);
    expect(y2).toBeGreaterThan(100);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await context.close();
  });

  test('on a route too long to run back in 2 s (large browser font), the reset still takes at most 2 s', async ({ page }) => {
    // A 24px default font at 1920 wide makes the route ~15500 px: 2.8 s at the reset's pace, so only its 2 s cap holds it.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 24 } });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.reload();
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await ready(page);
    await expect(page.locator('[data-thread-knot]')).toHaveCSS('opacity', '1', { timeout: 6000 });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 10000 });
    const from = await page.locator('[data-thread-path]').evaluate((p) => parseFloat(p.getAttribute('pathLength')!));
    expect(from, 'route length (px)').toBeGreaterThan(11000 * 1.1);
    // The reset signal's position in each frame, stamped with that frame's time
    // (the time the runtime moves it by), until it runs into the start pad.
    await page.evaluate(() => {
      const w = window as unknown as { __rw: { t: number; pos: number }[]; __knot: boolean };
      w.__rw = [];
      w.__knot = false;
      const line = document.querySelector('[data-thread-path]')!;
      const k = document.querySelector('[data-thread-knot]')!;
      new MutationObserver(() => (w.__knot ||= k.hasAttribute('data-flash'))).observe(k, { attributes: true, attributeFilter: ['data-flash'] });
      new MutationObserver((recs) => {
        if (w.__knot) return;
        const el = recs.map((r) => r.target as Element).find((p) => p.classList.contains('site-thread__pulse') && p.getAttribute('d') === line.getAttribute('d'));
        if (el) w.__rw.push({ t: Number(document.timeline.currentTime), pos: 13 - parseFloat(el.getAttribute('stroke-dashoffset') ?? '0') });
      }).observe(document.querySelector('[data-thread-pulses]')!, { subtree: true, attributes: true, attributeFilter: ['stroke-dashoffset'] });
    });
    await page.locator('[data-thread-reset]').click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __knot: boolean }).__knot), { timeout: 6000 }).toBe(true);
    const rw = await page.evaluate(() => (window as unknown as { __rw: { t: number; pos: number }[] }).__rw);
    // Its eased path, pos = from - (from + 26) * (1 - cos(pi * u)) / 2 with u = (t - t0) / T,
    // gives each frame's progress u; two frames in the middle of the run give T without t0,
    // so a loaded machine (late or dropped frames) does not move it.
    const u = (pos: number) => Math.acos(1 - (2 * (from - pos)) / (from + 26)) / Math.PI;
    const mid = rw.filter((e) => u(e.pos) > 0.1 && u(e.pos) < 0.9);
    expect(mid.length, 'frames in the middle of the run').toBeGreaterThan(3);
    const [a, b] = [mid[0], mid[mid.length - 1]];
    const T = (b.t - a.t) / 1000 / (u(b.pos) - u(a.pos));
    expect(T, 'reset run time (s)').toBeGreaterThan(1.9);
    expect(T, 'reset run time (s)').toBeLessThanOrEqual(2.02);
  });

  test('a signal that starts inside a lit heading LED makes it blink too', async ({ page }) => {
    const bar = page.locator('#about [data-thread-bar]');
    await bar.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 300));
    await expect(bar).toHaveAttribute('data-thread-done', '', { timeout: 4000 });
    await page.waitForTimeout(1500);
    await bar.evaluate((el) => {
      const w = window as unknown as { __blink: boolean };
      w.__blink = false;
      new MutationObserver(() => {
        if (el.hasAttribute('data-flash')) w.__blink = true;
      }).observe(el, { attributes: true, attributeFilter: ['data-flash'] });
    });
    await countPulses(page);
    // Sweep straight across the middle of the bar: both signals start inside its LED.
    const r = await bar.evaluate((el) => el.getBoundingClientRect().toJSON());
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    await page.mouse.move(x, y - 40);
    await page.waitForTimeout(300);
    await page.mouse.move(x, y + 40, { steps: 2 });
    await expect.poll(() => pulsesSeen(page), { timeout: 2000 }).toBe(2);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __blink: boolean }).__blink), { timeout: 2000 }).toBe(true);
  });

  test('a slow pointer across the drawn trace sends nothing; the same crossing done fast sends a pair', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 1250));
    await page.waitForTimeout(2500); // the pen comes to rest on the right rail
    const pen = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
      const path = svg.querySelector<SVGPathElement>('[data-thread-path]')!;
      const c = svg.querySelector('[data-thread-pen]')!;
      const s = svg.getBoundingClientRect();
      const dash = parseFloat((path.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]);
      const a = path.getPointAtLength(dash - 140), b = path.getPointAtLength(dash);
      return { x: s.left + parseFloat(c.getAttribute('cx')!), y: s.top + parseFloat(c.getAttribute('cy')!), vertical: Math.abs(a.x - b.x) < 0.5 && b.y - a.y > 139 };
    });
    expect(pen.vertical, 'the last 140px drawn are the rail').toBe(true);
    await countPulses(page);
    const y = pen.y - 100;
    // A stroll: 1px per 20ms or slower (50px/s at most, under the 400px/s of a sweep) across the rail.
    await page.mouse.move(pen.x - 10.5, y);
    for (let i = 1; i <= 21; i++) {
      await page.mouse.move(pen.x - 10.5 + i, y);
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(400);
    expect(await pulsesSeen(page), 'a slow crossing sends nothing').toBe(0);
    // A sweep across the same spot: one signal each way.
    await page.mouse.move(pen.x + 60, y);
    await page.waitForTimeout(300);
    await page.mouse.move(pen.x - 60, y, { steps: 2 });
    await expect.poll(() => pulsesSeen(page), { timeout: 2000 }).toBe(2);
  });

  test('one crossing sends one pair of signals, also when a pointer event lands right on the wire: on the trace and on a powered net', async ({ page }) => {
    // The trace: the right rail above the pen at rest.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 1250));
    const penAtRest = () =>
      page.evaluate(async () => {
        const c = document.querySelector('[data-thread-pen]')!;
        const at = () => `${c.getAttribute('cx')} ${c.getAttribute('cy')}`;
        const was = at();
        for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame);
        return at() === was;
      });
    await page.waitForTimeout(1500);
    await expect.poll(penAtRest, { timeout: 8000 }).toBe(true);
    const pen = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
      const path = svg.querySelector<SVGPathElement>('[data-thread-path]')!;
      const c = svg.querySelector('[data-thread-pen]')!;
      const s = svg.getBoundingClientRect();
      const dash = parseFloat((path.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]);
      const a = path.getPointAtLength(dash - 120), b = path.getPointAtLength(dash);
      return { x: s.left + parseFloat(c.getAttribute('cx')!), y: s.top + parseFloat(c.getAttribute('cy')!), vertical: Math.abs(a.x - b.x) < 0.5 && b.y - a.y > 119 };
    });
    expect(pen.vertical, 'the pen rests on a rail, 120px of it drawn above').toBe(true);
    await countPulses(page);
    await page.mouse.move(pen.x + 60, pen.y - 80);
    await page.waitForTimeout(300);
    await page.mouse.move(pen.x + 59, pen.y - 80); // after the pause: only sets where the sweep starts
    // Two events, the first exactly on the rail: both see the same crossing.
    await page.mouse.move(pen.x - 59, pen.y - 80, { steps: 2 });
    await page.waitForTimeout(300);
    expect(await pulsesSeen(page), 'trace').toBe(2);

    // A powered net: the middle of the longest level leg of the first one.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('[data-thread-board]')).toHaveAttribute('data-powered', '', { timeout: 8000 });
    await page.waitForTimeout(2500); // the power-on sequence has played
    const leg = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('[data-thread-svg]')!;
      const s = svg.getBoundingClientRect();
      const pts = [...(svg.querySelector('.site-thread__net')!.getAttribute('d') ?? '').matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
      let best = { len: 0, x: 0, y: 0 };
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        if (Math.abs(ay - by) < 0.01 && Math.abs(bx - ax) > best.len) best = { len: Math.abs(bx - ax), x: s.left + (ax + bx) / 2, y: s.top + ay };
      }
      return best;
    });
    expect(leg.len).toBeGreaterThan(30);
    // The same counter (a second countPulses would add a second observer).
    await page.evaluate(() => ((window as unknown as { __pulses: number }).__pulses = 0));
    await page.mouse.move(leg.x, leg.y - 25);
    await page.waitForTimeout(300);
    await page.mouse.move(leg.x, leg.y - 24); // after the pause: only sets where the sweep starts
    // Two events, the first exactly on the net: both see the same crossing.
    await page.mouse.move(leg.x, leg.y + 24, { steps: 2 });
    await page.waitForTimeout(300);
    expect(await pulsesSeen(page), 'net').toBe(2);
  });

  test('a signal glows with layered strokes: two wider, fainter halos under its core', async ({ page }) => {
    await page.locator('#skills').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 300));
    await page.waitForTimeout(2500);
    // A drawn horizontal stretch of at least 300px on screen.
    const row = await page.evaluate(() => {
      const line = document.querySelector<SVGPathElement>('[data-thread-path]')!;
      const drawn = parseFloat((line.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]);
      const scale = line.getTotalLength() / parseFloat(line.getAttribute('pathLength')!);
      const m = line.getScreenCTM()!;
      for (let l = 0; l < drawn - 300; l += 4) {
        const a = line.getPointAtLength(l * scale), c = line.getPointAtLength((l + 300) * scale);
        const y = m.d * a.y + m.f;
        if (Math.abs(a.y - c.y) < 0.01 && Math.abs(a.x - c.x) > 299 && y > 100 && y < window.innerHeight - 100) {
          return { x: m.a * (a.x + c.x) / 2 + m.e, y };
        }
      }
      return null;
    });
    expect(row, 'a horizontal wire on screen').not.toBeNull();
    // Every stroke added to the signal layer, in order.
    type Stroke = { cls: string; d: string; off: string; width: number; opacity: number };
    await page.evaluate(() => {
      const w = window as unknown as { __strokes: Stroke[] };
      w.__strokes = [];
      new MutationObserver((list) => {
        for (const m of list) {
          for (const n of m.addedNodes) {
            if (!(n instanceof SVGPathElement)) continue;
            w.__strokes.push({ cls: n.getAttribute('class') ?? '', d: n.getAttribute('d') ?? '', off: n.getAttribute('stroke-dashoffset') ?? '', width: parseFloat(n.getAttribute('stroke-width') ?? 'NaN'), opacity: parseFloat(getComputedStyle(n).strokeOpacity) });
          }
        }
      }).observe(document.querySelector('[data-thread-pulses]')!, { childList: true });
    });
    await page.mouse.move(row!.x, row!.y - 40);
    await page.waitForTimeout(300);
    await page.mouse.move(row!.x, row!.y + 40, { steps: 2 });
    const strokes = () => page.evaluate(() => (window as unknown as { __strokes: Stroke[] }).__strokes);
    await expect.poll(async () => (await strokes()).filter((s) => s.cls === 'site-thread__pulse').length, { timeout: 2000 }).toBe(2);
    const all = await strokes();
    all.forEach((core, i) => {
      if (core.cls !== 'site-thread__pulse') return;
      // Its glow goes in just before it, on the same dash.
      const halos = all.slice(Math.max(0, i - 2), i).filter((h) => h.cls.includes('site-thread__pulse-halo') && h.d === core.d && h.off === core.off);
      expect(halos, all.map((s) => s.cls).join()).toHaveLength(2);
      for (const h of halos) {
        expect(h.width, 'a halo is wider than the core').toBeGreaterThan(core.width);
        expect(h.opacity, 'a halo is fainter than the core').toBeLessThan(core.opacity);
      }
    });
  });

  test('a heading LED is dark until the line enters it: no glow, a dim body; lit after', async ({ page }) => {
    // At the top of the page the line has not reached the last heading (Contact).
    const bar = page.locator('#contact [data-thread-bar]');
    await expect(bar).not.toHaveAttribute('data-thread-done', '');
    const look = () => bar.evaluate((el) => [getComputedStyle(el).boxShadow, getComputedStyle(el).backgroundImage]);
    const dim = await themeColor(page, 'hsl(var(--muted-foreground) / 0.3)');
    expect(await look(), 'unlit').toEqual(['none', `linear-gradient(${dim}, ${dim})`]);
    // Once the line has entered it: the glow and the primary-to-secondary body.
    await bar.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.3));
    await expect(bar).toHaveAttribute('data-thread-done', '', { timeout: 6000 });
    const primary = await themeColor(page, 'hsl(var(--primary))');
    await expect.poll(look, { timeout: 2000 }).toEqual([expect.not.stringMatching(/^none$/), expect.stringContaining(primary)]);
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
  // The heading bars stay plain bars.
  expect(await page.locator('[data-thread-bar]').first().evaluate((el) => getComputedStyle(el, '::before').content)).toBe('none');
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
    // The scripts (the thread's and the one reporting the intro) arrive late.
    await page.route(/\/_astro\/[^/]*\.js$/, async (route) => {
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

  test('boot builds the thread once: no ResizeObserver rebuild when nothing it watches has changed size', async ({ page }) => {
    // Each rebuild is spotted by measure() adding html.thread-measuring; it
    // records whether it ran inside a ResizeObserver callback and the observed
    // boxes (<main>, <html>, every section) as it started.
    await page.addInitScript(() => {
      const w = window as unknown as { __rebuilds: { fromRO: boolean; boxes: string }[] };
      w.__rebuilds = [];
      let inRO = 0;
      const RO = window.ResizeObserver;
      window.ResizeObserver = class extends RO {
        constructor(cb: ResizeObserverCallback) {
          super((entries, obs) => {
            inRO++;
            try {
              cb(entries, obs);
            } finally {
              inRO--;
            }
          });
        }
      };
      const add = DOMTokenList.prototype.add;
      DOMTokenList.prototype.add = function (...tokens: string[]) {
        if (tokens.includes('thread-measuring')) {
          const main = document.getElementById('main-content')!;
          const boxes = [main, document.documentElement, ...main.querySelectorAll('[data-thread-section]')].map((el) => {
            const r = el.getBoundingClientRect();
            return `${r.width}x${r.height}`;
          });
          w.__rebuilds.push({ fromRO: inRO > 0, boxes: boxes.join('|') });
        }
        return add.apply(this, tokens);
      };
    });
    for (const [width, height] of [[412, 823], [1440, 900]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await ready(page);
      await page.waitForTimeout(500);
      const rebuilds = await page.evaluate(() => (window as unknown as { __rebuilds: { fromRO: boolean; boxes: string }[] }).__rebuilds);
      const redundant = rebuilds.filter((r, i) => r.fromRO && i > 0 && r.boxes === rebuilds[i - 1].boxes);
      expect(redundant, `${width}px, rebuilds: ${rebuilds.map((r) => (r.fromRO ? 'RO' : 'direct')).join(', ')}`).toEqual([]);
    }
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

  test('a sweep across the line while an in-place start still hides it sends nothing', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await expect(page.locator('[data-thread-knot]')).toHaveCSS('opacity', '1', { timeout: 6000 });
    // The viewport top in the gap above the Contact heading: reloaded, the line
    // is drawn (hidden) down to just above that heading, well into the viewport.
    await page.evaluate(() => window.scrollTo(0, Math.max(...[...document.querySelectorAll('#education .gsap-reveal')].map((el) => el.getBoundingClientRect().bottom + window.scrollY)) + 2));
    await page.waitForTimeout(1200);
    const restored = await page.evaluate(() => window.scrollY);
    // A slow connection: the sections hydrate (and reveal) only once released.
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    await page.route(/\/_astro\/(About|Experience|Skills|Education|Contact)\.[^/]*\.js$/, async (route) => {
      await held;
      await route.continue().catch(() => {});
    });
    await page.reload({ waitUntil: 'commit' });
    await ready(page);
    // Back at that position (under load Chromium may get there in two steps, see above).
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(restored);
    // A point on a rail of the drawn line, on screen.
    const pick = () =>
      page.evaluate(() => {
        const line = document.querySelector<SVGPathElement>('[data-thread-path]')!;
        const drawn = parseFloat((line.getAttribute('stroke-dasharray') ?? '0').split(/[ ,]+/)[0]);
        const scale = line.getTotalLength() / parseFloat(line.getAttribute('pathLength')!);
        const m = line.getScreenCTM()!;
        for (let l = drawn - 20; l > 0; l -= 2) {
          const a = line.getPointAtLength(l * scale), b = line.getPointAtLength((l - 2) * scale);
          const y = m.d * a.y + m.f;
          if (y < 10) break;
          if (Math.abs(a.x - b.x) < 0.01) return { x: m.a * a.x + m.e, y };
        }
        return null;
      });
    await expect.poll(pick, { message: 'the drawn line on screen' }).not.toBeNull();
    const at = (await pick())!;
    const hidden = () => page.locator('[data-thread-path]').evaluate((p) => (p as SVGPathElement).style.opacity === '0' && !document.documentElement.classList.contains('thread-drawing'));
    expect(await hidden(), 'the line is drawn, but hidden').toBe(true);
    // Fast across it (crossing it mid-step).
    const sweep = async () => {
      await page.mouse.move(at.x - 70, at.y);
      await page.mouse.move(at.x + 50, at.y, { steps: 2 });
    };
    await countPulses(page);
    await sweep();
    await page.waitForTimeout(400);
    expect(await hidden(), 'still hidden').toBe(true);
    expect(await pulsesSeen(page)).toBe(0);
    // Once the content reveals, the line shows and the same sweep sends signals.
    release();
    await expect(page.locator('[data-thread-path]')).toHaveCSS('opacity', '1', { timeout: 8000 });
    await page.waitForTimeout(500);
    await sweep();
    await expect.poll(() => pulsesSeen(page), { timeout: 2000 }).toBeGreaterThan(0);
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
