/**
 * Scroll thread: DOM side.
 *
 * Measures the home page (transform-free, see `measure`), feeds the snapshot to
 * the pure route builder, and draws the route as the visitor reads: the drawn
 * length follows the reading line (62% down the viewport) through a critically
 * damped spring. Also drives the pen, timeline nodes, ink underlines, contact
 * card stitches and the pluck effect.
 *
 * Everything visual is opt-in through `html.thread-on`, which only this script
 * adds, so without JavaScript the page renders exactly as before.
 */
import { buildRoute, computeRails, lengthAtY, pointAt, type LayoutSnapshot, type Rect, type Route, type SectionLayout } from './route';

const SPRING_K = 40;
const READ_LINE = 0.62;
const START_FALLBACK_MS = 2600;
const REBUILD_DEBOUNCE_MS = 120;
const PLUCK_LIFE = 1.4;
const PLUCK_REACH = 160;
const PLUCK_MIN_SPEED = 400; // px/s: a deliberate sweep, not a stroll
const HASH_CELL = 40;

interface Anchor {
  el: Element;
  y: number;
  done: boolean;
}

interface Pluck {
  i: number;
  t0: number;
  a: number;
}

const now = () => performance.now() / 1000;

function union(rects: (Rect | null)[]): Rect | null {
  const list = rects.filter((r): r is Rect => !!r);
  if (!list.length) return null;
  const x0 = Math.min(...list.map((r) => r.x));
  const y0 = Math.min(...list.map((r) => r.y));
  const x1 = Math.max(...list.map((r) => r.x + r.w));
  const y1 = Math.max(...list.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function initThread(): () => void {
  const html = document.documentElement;
  const root = document.querySelector<HTMLElement>('[data-thread-root]');
  const main = document.getElementById('main-content');
  const svg = root?.querySelector<SVGSVGElement>('[data-thread-svg]');
  const path = svg?.querySelector<SVGPathElement>('[data-thread-path]');
  const knot = svg?.querySelector<SVGCircleElement>('[data-thread-knot]');
  const endKnot = svg?.querySelector<SVGCircleElement>('[data-thread-end]');
  const pen = svg?.querySelector<SVGCircleElement>('[data-thread-pen]');
  const glow = svg?.querySelector<SVGCircleElement>('[data-thread-glow]');
  const gradient = svg?.querySelector<SVGLinearGradientElement>('[data-thread-gradient]');
  if (!root || !main || !svg || !path || !knot || !endKnot || !pen || !glow || !gradient) return () => {};

  const ac = new AbortController();
  const { signal } = ac;
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reduceQuery.matches;

  let route: Route | null = null;
  let mainTop = 0;
  let mainLeft = 0;
  let shown = 0;
  let vel = 0;
  let lastT = 0;
  let raf = 0;
  let started = false;
  let polyMode = false;
  let plucks: Pluck[] = [];
  let ptr: { x: number; y: number; t: number } | null = null;
  let hash = new Map<number, number[]>();
  let nodes: Anchor[] = [];
  let inks: Anchor[] = [];
  let cards: Anchor[] = [];
  let rebuildTimer = 0;
  let fallbackTimer = 0;

  html.classList.add('thread-on');

  /**
   * Layout snapshot in the thread layer's coordinates (relative to <main>).
   * Almost every element animates in with GSAP transforms, and
   * getBoundingClientRect() reports transformed boxes, so transforms on the
   * reveal elements are neutralised for the duration of this synchronous read
   * (`html.thread-measuring`, see global.css). Nothing is painted in between.
   */
  function measure(): { snap: LayoutSnapshot; height: number } | null {
    html.classList.add('thread-measuring');
    try {
      const m = main!.getBoundingClientRect();
      mainTop = m.top + window.scrollY;
      mainLeft = m.left + window.scrollX;
      const rel = (el: Element | null): Rect | null => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return null; // display: none
        return { x: r.left - m.left, y: r.top - m.top, w: r.width, h: r.height };
      };
      const width = html.clientWidth;

      const containers = [...main!.querySelectorAll('[data-thread-section] > .container')].map(rel).filter((r): r is Rect => !!r);
      if (!containers.length) return null;
      const cLeft = Math.min(...containers.map((r) => r.x));
      const cRight = Math.max(...containers.map((r) => r.x + r.w));

      const heroEl = main!.querySelector('[data-thread-section="hero"]');
      const heroRect = rel(heroEl);
      if (!heroEl || !heroRect) return null;
      const pills = [...(heroEl.querySelector('[data-thread-beads]')?.children ?? [])].map(rel).filter((r): r is Rect => !!r);
      // Beads only when the pills sit on a single row.
      const oneRow = pills.length > 0 && pills.every((p) => Math.abs(p.y - pills[0].y) < 2);
      // The scroll hint bounces (CSS animation), so read its untransformed box from offsets.
      const hintEl = heroEl.querySelector<HTMLElement>('[data-thread-hint]');
      const hint = hintEl && hintEl.offsetWidth > 0 && heroRect
        ? { x: hintEl.offsetLeft + heroRect.x, y: hintEl.offsetTop + heroRect.y, w: hintEl.offsetWidth, h: hintEl.offsetHeight }
        : null;

      const sections: SectionLayout[] = [];
      for (const el of main!.querySelectorAll('[data-thread-section]')) {
        if (el === heroEl) continue;
        const box = rel(el);
        const bar = rel(el.querySelector('[data-thread-bar]'));
        if (!box || !bar) continue;
        const nodeRects = [...el.querySelectorAll('[data-thread-node]')].map(rel).filter((r): r is Rect => !!r);
        const cardRects = [...el.querySelectorAll('[data-thread-stitch]')].map(rel);
        sections.push({ top: box.y, bottom: box.y + box.h, bar, nodes: nodeRects, cards: union(cardRects) });
      }
      if (!sections.length) return null;

      const anchor = (sel: string, at: (r: Rect) => number, prev: Anchor[]): Anchor[] =>
        [...main!.querySelectorAll(sel)].flatMap((el) => {
          const r = rel(el);
          if (!r) return [];
          return [{ el, y: at(r), done: prev.find((a) => a.el === el)?.done ?? false }];
        });
      nodes = anchor('[data-thread-node]', (r) => r.y + r.h / 2, nodes);
      inks = anchor('[data-thread-ink]', (r) => r.y + r.h, inks);
      cards = anchor('[data-thread-stitch]', (r) => r.y + Math.min(24, r.h / 3), cards);

      return {
        height: m.height,
        snap: {
          width,
          rails: computeRails(width, cLeft, cRight),
          phone: width < 640,
          hero: { top: heroRect.y, bottom: heroRect.y + heroRect.h, tags: oneRow ? union(pills) : null, avatar: rel(heroEl.querySelector('[data-thread-avatar]')), scrollHint: hint },
          sections,
        },
      };
    } finally {
      html.classList.remove('thread-measuring');
    }
  }

  function targetLen(): number {
    if (!route || !started) return 0;
    if (reduced) return route.total;
    const vh = window.innerHeight;
    if (window.scrollY + vh >= html.scrollHeight - 4) return route.total;
    const y = window.scrollY + vh * READ_LINE - mainTop;
    return Math.max(route.minLen, lengthAtY(route, y));
  }

  function rebuild() {
    window.clearTimeout(rebuildTimer);
    const measured = measure();
    const next = measured ? buildRoute(measured.snap) : null;
    if (!measured || !next) {
      // Layout not recognised: step aside and leave the page as it is without JS.
      route = null;
      html.classList.remove('thread-on');
      return;
    }
    html.classList.add('thread-on');
    const prev = route;
    const prevShown = shown;
    route = next;

    const w = measured.snap.width;
    const h = Math.max(1, Math.round(measured.height));
    svg!.setAttribute('width', String(w));
    svg!.setAttribute('height', String(h));
    svg!.setAttribute('viewBox', `0 0 ${w} ${h}`);
    gradient!.setAttribute('y2', String(h));
    path!.setAttribute('stroke-width', String(next.strokeWidth));
    setGeometry();
    knot!.setAttribute('cx', next.start[0].toFixed(2));
    knot!.setAttribute('cy', next.start[1].toFixed(2));
    endKnot!.setAttribute('cx', next.end[0].toFixed(2));
    endKnot!.setAttribute('cy', next.end[1].toFixed(2));

    hash = new Map();
    for (let i = 0; i < next.count; i++) {
      const k = Math.floor(next.points[i * 2] / HASH_CELL) * 100000 + Math.floor(next.points[i * 2 + 1] / HASH_CELL);
      const list = hash.get(k);
      if (list) list.push(i);
      else hash.set(k, [i]);
    }

    // Rebuild in place: keep the drawn progress instead of replaying from the top.
    if (prev && started) {
      if (prev.minLen > 0 && prevShown < prev.minLen) shown = (prevShown / prev.minLen) * next.minLen;
      else shown = targetLen();
      shown = Math.min(next.total, Math.max(0, shown));
      vel = 0;
    } else if (!started) {
      shown = 0;
    }
    plucks = [];
    render(now());
    schedule();
  }

  function scheduleRebuild() {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(rebuild, REBUILD_DEBOUNCE_MS);
  }

  function setGeometry() {
    if (!route) return;
    path!.setAttribute('d', route.d);
    // Lengths below are in the builder's units; pathLength maps them onto the browser's.
    path!.setAttribute('pathLength', route.total.toFixed(3));
    polyMode = false;
  }

  function offsetAt(i: number, t: number): number {
    let o = 0;
    for (const pk of plucks) {
      const ds = Math.abs(i - pk.i) * route!.step;
      if (ds > PLUCK_REACH) continue;
      const tau = t - pk.t0;
      const w = Math.cos((Math.PI / 2) * (ds / PLUCK_REACH)) ** 2;
      o += pk.a * Math.exp(-3.2 * tau) * Math.sin(2 * Math.PI * 7 * tau) * w;
    }
    return o;
  }

  function setDone(list: Anchor[], reached: number, lead: number) {
    for (const a of list) {
      const done = reached >= a.y - lead;
      if (done !== a.done) {
        a.done = done;
        a.el.toggleAttribute('data-thread-done', done);
      }
    }
  }

  function render(t: number) {
    const r = route;
    if (!r) return;
    const L = Math.max(0, Math.min(r.total, shown));
    const arrived = started && L >= r.total - 1;
    plucks = plucks.filter((pk) => t - pk.t0 < PLUCK_LIFE);

    if (plucks.length) {
      // Vibrating stretch: draw the drawn part as a displaced polyline.
      const { points: P, step } = r;
      const upto = L / step;
      const last = Math.floor(upto);
      let d = '';
      for (let i = 0; i <= last && i < r.count; i++) {
        const o = offsetAt(i, t);
        let nx = 0, ny = 0;
        if (o !== 0) {
          const a = Math.max(0, i - 1), b = Math.min(r.count - 1, i + 1);
          const dx = P[b * 2] - P[a * 2], dy = P[b * 2 + 1] - P[a * 2 + 1];
          const l = Math.hypot(dx, dy) || 1;
          nx = -dy / l;
          ny = dx / l;
        }
        d += (i ? 'L' : 'M') + (P[i * 2] + nx * o).toFixed(1) + ',' + (P[i * 2 + 1] + ny * o).toFixed(1);
      }
      const head = pointAt(r, L);
      d += `L${head[0].toFixed(1)},${head[1].toFixed(1)}`;
      path!.setAttribute('d', d);
      path!.removeAttribute('pathLength');
      path!.removeAttribute('stroke-dasharray');
      polyMode = true;
    } else {
      if (polyMode) setGeometry();
      path!.setAttribute('stroke-dasharray', `${L.toFixed(2)} ${(r.total + 10).toFixed(2)}`);
    }
    // A zero-length dash with round caps would leave a dot at the start knot.
    path!.style.opacity = L > 0.5 ? '1' : '0';

    const head = pointAt(r, L);
    const showPen = started && !reduced && L > 1 && !arrived;
    for (const c of [pen!, glow!]) {
      c.setAttribute('cx', head[0].toFixed(2));
      c.setAttribute('cy', head[1].toFixed(2));
      c.style.opacity = showPen ? '1' : '0';
    }
    knot!.style.opacity = started ? '1' : '0';
    endKnot!.style.opacity = arrived ? '1' : '0';

    const reached = !started ? -Infinity : arrived ? Infinity : r.maxY[Math.min(r.count - 1, Math.floor(L / r.step))];
    setDone(nodes, reached, 4);
    setDone(inks, reached, 6);
    setDone(cards, reached, 0);
  }

  function tick(ts: number) {
    raf = 0;
    const t = ts / 1000;
    const dt = lastT ? Math.min(0.05, Math.max(0, t - lastT)) : 1 / 60;
    lastT = t;
    const target = targetLen();
    if (reduced) {
      shown = target;
      vel = 0;
    } else {
      const c = 2 * Math.sqrt(SPRING_K);
      vel += (SPRING_K * (target - shown) - c * vel) * dt;
      shown += vel * dt;
      if (Math.abs(target - shown) < 0.5 && Math.abs(vel) < 0.5) {
        shown = target;
        vel = 0;
      }
    }
    render(now());
    if (shown !== target || vel !== 0 || plucks.length) raf = requestAnimationFrame(tick);
    else lastT = 0;
  }

  function schedule() {
    if (!raf && route) raf = requestAnimationFrame(tick);
  }

  function start() {
    if (started) return;
    started = true;
    window.clearTimeout(fallbackTimer);
    lastT = 0;
    schedule();
  }

  function markReady() {
    svg!.setAttribute('data-thread-ready', 'true');
  }

  function onPointerMove(e: PointerEvent) {
    if (reduced || !route || !started || e.pointerType === 'touch') return;
    const x = e.pageX - mainLeft, y = e.pageY - mainTop, t = now();
    const prev = ptr;
    ptr = { x, y, t };
    if (!prev || t - prev.t > 0.12) return;
    const speed = Math.hypot(x - prev.x, y - prev.y) / Math.max(0.008, t - prev.t);
    if (speed < PLUCK_MIN_SPEED) return;
    // Test the whole movement since the last event: a fast sweep jumps right over the line.
    const r = route;
    const drawn = shown / r.step;
    const vx = x - prev.x, vy = y - prev.y, vl = vx * vx + vy * vy || 1;
    let best = -1, bd = 10;
    const cx0 = Math.floor((Math.min(prev.x, x) - 12) / HASH_CELL), cx1 = Math.floor((Math.max(prev.x, x) + 12) / HASH_CELL);
    const cy0 = Math.floor((Math.min(prev.y, y) - 12) / HASH_CELL), cy1 = Math.floor((Math.max(prev.y, y) + 12) / HASH_CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        for (const i of hash.get(cx * 100000 + cy) ?? []) {
          if (i > drawn) continue;
          const qx = r.points[i * 2], qy = r.points[i * 2 + 1];
          const u = Math.max(0, Math.min(1, ((qx - prev.x) * vx + (qy - prev.y) * vy) / vl));
          const dd = Math.hypot(prev.x + vx * u - qx, prev.y + vy * u - qy);
          if (dd < bd) {
            bd = dd;
            best = i;
          }
        }
      }
    }
    if (best < 0 || plucks.some((pk) => Math.abs(pk.i - best) * r.step < 60 && t - pk.t0 < 0.25)) return;
    const a = Math.max(0, best - 1), b = Math.min(r.count - 1, best + 1);
    const nx = -(r.points[b * 2 + 1] - r.points[a * 2 + 1]), ny = r.points[b * 2] - r.points[a * 2];
    const side = Math.sign(vx * nx + vy * ny) || 1;
    plucks.push({ i: best, t0: t, a: side * Math.min(13, 4 + speed / 160) });
    schedule();
  }

  // Boot.
  rebuild();
  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  Promise.race([fontsReady, new Promise((res) => window.setTimeout(res, 3000))]).then(() => {
    if (signal.aborted) return;
    // Rebuild with the webfonts in place, then flag readiness (tests and the
    // visual baselines wait on it; under reduced motion the full static
    // drawing is in place at this point).
    rebuild();
    if (route) markReady();
  });

  if (reduced || 'heroRevealed' in html.dataset) start();
  else {
    window.addEventListener('hero:revealed', start, { once: true, signal });
    fallbackTimer = window.setTimeout(start, START_FALLBACK_MS);
  }

  window.addEventListener('scroll', schedule, { passive: true, signal });
  window.addEventListener('resize', () => { schedule(); scheduleRebuild(); }, { passive: true, signal });
  window.addEventListener('pointermove', onPointerMove, { passive: true, signal });
  document.fonts?.addEventListener?.('loadingdone', scheduleRebuild, { signal });
  reduceQuery.addEventListener('change', () => {
    reduced = reduceQuery.matches;
    plucks = [];
    if (reduced) start();
    schedule();
  }, { signal });
  const ro = new ResizeObserver(scheduleRebuild);
  ro.observe(main);
  for (const el of main.querySelectorAll('[data-thread-section]')) ro.observe(el);

  return () => {
    ac.abort();
    ro.disconnect();
    window.clearTimeout(rebuildTimer);
    window.clearTimeout(fallbackTimer);
    if (raf) cancelAnimationFrame(raf);
    html.classList.remove('thread-on');
  };
}
