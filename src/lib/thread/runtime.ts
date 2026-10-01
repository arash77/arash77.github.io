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
import { buildRoute, carryOver, computeRails, lengthAtY, loopReach, LOOP_FILLET, pointAt, type LayoutSnapshot, type Rect, type Route, type SectionLayout } from './route';

const SPRING_K = 40;
const READ_LINE = 0.62;
/** Hero intro (~2.2s) plus slack: start anyway if `hero:revealed` never comes. Counted from the intro's start. */
const INTRO_FALLBACK_MS = 2600;
/** If the hero island never even starts its intro, start once the tags are visible anyway. */
const BOOT_CAP_MS = 8000;
/** Only for font swaps; layout changes rebuild in the same frame (see the ResizeObserver). */
const FONT_DEBOUNCE_MS = 120;
const PLUCK_LIFE = 1.4;
const PLUCK_REACH = 160;
const PLUCK_MIN_SPEED = 400; // px/s: a deliberate sweep, not a stroll
const HASH_CELL = 40;
const GLOW_R = 11;
/** After a start with the hero out of view, how long the line tracks the reading position exactly. */
const SNAP_FOLLOW_S = 1.5;
/** Pen radius plus half its stroke: the glow never gets smaller than the pen. */
const PEN_EXTENT = 5.5;
/** A section heading or timeline card counts as revealed from this computed opacity on. */
const REVEAL_OPACITY = 0.9;
/**
 * A reveal gate in view opens this long after its island has hydrated, even if
 * the content never reaches REVEAL_OPACITY (a reveal that never plays must not
 * hold the line). The clock starts at hydration, not at first sight: on a slow
 * connection the island can take seconds to arrive, and until then its content
 * is invisible.
 */
const GATE_CAP_S = 2.5;
/** Backstop for an island in view that never hydrates at all (its chunk failed to load). */
const HYDRATE_CAP_S = 10;
/** Slack around a hydrated gate's box: its reveal offset (y: 20-40px) can keep it on screen after its layout box has left. */
const GATE_SLACK = 48;
/**
 * The spring's tail is slow (a critically damped spring covers its last 30px
 * in about 0.7s): the pen never crawls slower than this (px/s) on its way in,
 * so it reaches the end knot, or any resting place, without a long still tail.
 */
const SETTLE_SPEED = 240;
/** Fallback poll while the hero intro has not visibly played (hidden tab, stalled main thread). */
const FALLBACK_POLL_MS = 250;
/** Plucks only move straight stretches; the swing eases out over this distance before a corner or loop. */
const PLUCK_EASE = 36;
/** Once the page bottom was reached, scrolling up this little (or a mobile URL bar returning) keeps the route complete. */
const END_LATCH_PX = 64;

interface Anchor {
  el: Element;
  y: number;
  done: boolean;
}

/**
 * A point on the route the pen may only pass once `el` (a section heading or a
 * timeline card) has revealed: the line is never drawn over, or looped around,
 * content that is still invisible (sections are client:visible islands that
 * hydrate and fade in after the thread has started).
 */
interface Gate {
  el: Element;
  /** Route length the pen stops at while the gate is closed. */
  len: number;
  /** Vertical extent of `el` (layer coordinates): the gate only applies while it is in view. */
  top: number;
  bottom: number;
  /** The island `el` belongs to: while it still carries `ssr` it has not hydrated, and `el` cannot reveal yet. */
  island: Element | null;
  /** Part of the hero intro: open once the intro has completed (not on the element's own opacity). */
  hero: boolean;
}

interface Pluck {
  i: number;
  t0: number;
  a: number;
}

interface GateSpec {
  el: Element;
  /** y (layer coordinates) the pen must not pass: the top of a block, or the top of a node loop. */
  y: number;
  hero: boolean;
  box: Rect;
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
  let capTimer = 0;
  let viewW = 0;
  let rebuiltThisFrame = false;
  /** Until this time (s) the drawn length tracks the target exactly (no spring), see start(). */
  let snapUntil = 0;
  /** The line rests at its target (no spring motion in flight), as of the last frame. */
  let settled = true;
  /** A closed reveal gate held the target back in the last targetLen(). */
  let capActive = false;
  /** ...and it waits on something only polling can see (an opacity, a hydration). */
  let capPoll = false;
  /** ...and the content it waits on has not even started to reveal (or hydrate). */
  let capUnseen = false;
  /**
   * Started in place (deep link, reload mid-page): until the first content in
   * view starts to reveal, the line stays hidden. Otherwise the stretch it may
   * draw above that content (a rail through empty padding) would show on a
   * viewport that is still blank.
   */
  let inPlace = false;
  /** The hero intro has completed (or was given up on): the hero gates are open. */
  let heroDone = reduced || 'heroRevealed' in html.dataset;
  let gates: Gate[] = [];
  /** Per-sample pluck weight: 1 on straight stretches, easing to 0 at corners and loops. */
  let straight: Float32Array = new Float32Array(0);
  /** scrollY as of the last tick. */
  let lastTickY = window.scrollY;
  /** scrollY and time (s) as of the last revealCap(). */
  let lastScrollY = window.scrollY;
  let lastCapT = 0;
  /** scrollY at which the page bottom was last reached (see targetLen). */
  let endLatch: number | null = null;
  // Reveal state outlives rebuilds: GSAP reveals play once.
  const opened = new WeakSet<Element>();
  /** When each gate was first in view with its island hydrated (GATE_CAP_S) / not yet hydrated (HYDRATE_CAP_S). */
  const firstSeen = new WeakMap<Element, number>();
  const firstSeenDry = new WeakMap<Element, number>();
  /**
   * Width of the thread layer. <main>, not the root's clientWidth: a scroll
   * lock (the mobile menu) hides the scrollbar and pads <body> by its width,
   * so the root widens while the layout does not, and nothing resizes back
   * when the lock ends.
   */
  const layoutWidth = () => main!.clientWidth;

  html.classList.add('thread-on');

  /**
   * Layout snapshot in the thread layer's coordinates (relative to <main>).
   * Almost every element animates in with GSAP transforms, and
   * getBoundingClientRect() reports transformed boxes, so transforms on the
   * reveal elements are neutralised for the duration of this synchronous read
   * (`html.thread-measuring`, see global.css). Nothing is painted in between.
   */
  function measure(): { snap: LayoutSnapshot; height: number; gateSpecs: GateSpec[] } | null {
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
      const width = layoutWidth();

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
      // Reveal gates: every block that fades in (see Gate). The hero's are
      // held by its intro; a section's block holds the line level with its
      // top, or, for a timeline card, at the top of its node's loop.
      const gateSpecs: GateSpec[] = [];
      for (const el of heroEl.querySelectorAll('.gsap-reveal')) {
        const r = rel(el);
        if (r) gateSpecs.push({ el, y: r.y, hero: true, box: r });
      }
      for (const el of main!.querySelectorAll('[data-thread-section]')) {
        if (el === heroEl) continue;
        const box = rel(el);
        const bar = rel(el.querySelector('[data-thread-bar]'));
        if (!box || !bar) continue;
        const nodeRects: Rect[] = [];
        const loopTop = new Map<Element, number>();
        for (const nodeEl of el.querySelectorAll('[data-thread-node]')) {
          const r = rel(nodeEl);
          if (!r) continue;
          nodeRects.push(r);
          const card = nodeEl.closest('.gsap-reveal');
          if (card) loopTop.set(card, r.y + r.h / 2 - loopReach(r.w / 2 + 9, LOOP_FILLET));
        }
        // Phones hide the nodes: a timeline card is then an ordinary block.
        for (const block of el.querySelectorAll('.gsap-reveal')) {
          const r = rel(block);
          if (r) gateSpecs.push({ el: block, y: loopTop.get(block) ?? r.y, hero: false, box: r });
        }
        const cardRects = [...el.querySelectorAll('[data-thread-stitch]')].map(rel);
        sections.push({ top: box.y, bottom: box.y + box.h, bar, nodes: nodeRects, cards: union(cardRects) });
      }
      if (!sections.length) return null;

      const anchor = (sel: string, at: (r: Rect) => number): Anchor[] =>
        [...main!.querySelectorAll(sel)].flatMap((el) => {
          const r = rel(el);
          if (!r) return [];
          // Seed from the DOM, not from the previous list: an element that was
          // hidden (display: none at another width) keeps its attribute while it
          // is out of the list, and must be re-synced when it comes back.
          return [{ el, y: at(r), done: el.hasAttribute('data-thread-done') }];
        });
      nodes = anchor('[data-thread-node]', (r) => r.y + r.h / 2);
      inks = anchor('[data-thread-ink]', (r) => r.y + r.h);
      cards = anchor('[data-thread-stitch]', (r) => r.y + Math.min(24, r.h / 3));

      return {
        height: m.height,
        gateSpecs,
        snap: {
          width,
          rails: computeRails(width, cLeft, cRight),
          // Exactly Tailwind's `sm` breakpoint (a 40rem media query: the window
          // width, scrollbar included, in the browser's own rem), so the route
          // agrees with the layout it is drawn over at any default font size.
          phone: !window.matchMedia('(min-width: 40rem)').matches,
          hero: { top: heroRect.y, bottom: heroRect.y + heroRect.h, tags: oneRow ? union(pills) : null, avatar: rel(heroEl.querySelector('[data-thread-avatar]')), scrollHint: hint },
          sections,
        },
      };
    } finally {
      html.classList.remove('thread-measuring');
    }
  }

  /** Drawn length the reading position asks for. */
  function scrollTarget(): number {
    if (!route || !started) return 0;
    if (reduced) return route.total;
    const vh = window.innerHeight;
    const y0 = window.scrollY;
    // The whole route once the bottom is reached, and it stays complete while
    // the reader stays there: a mobile URL bar coming back shrinks the
    // viewport without scrolling, which would otherwise unwind the end.
    if (y0 + vh >= html.scrollHeight - 4) {
      endLatch = y0;
      return route.total;
    }
    if (endLatch !== null && y0 >= endLatch - Math.min(END_LATCH_PX, vh * 0.1)) return route.total;
    endLatch = null;
    const y = y0 + vh * READ_LINE - mainTop;
    return Math.max(route.minLen, lengthAtY(route, y));
  }

  /**
   * Is the gate's content on screen? An island that has not hydrated yet only
   * counts once its box really is in view: that is what hydrates it
   * (client:visible), so the line never waits on an island that is not coming.
   */
  function gateInView(g: Gate, top: number, bottom: number, hydrated: boolean): boolean {
    const slack = hydrated ? GATE_SLACK : 0;
    return g.bottom + slack > top && g.top - slack < bottom;
  }

  /**
   * Shortest route length a closed reveal gate in view allows (Infinity when
   * none binds). Gates above or below the viewport are ignored: what the
   * reader cannot see cannot look wrong. Conversely a gate the line went past
   * while it was out of view (a scrollbar jump, a reload at the page bottom)
   * still binds when it comes into view unrevealed: its island hydrates only
   * then, and the line must not stay drawn past content that is invisible.
   */
  function revealCap(want: number): number {
    const t = now();
    // Widened by the last frame's scroll while scrolling: a fast
    // (compositor-driven) scroll can paint the next frame that much further on.
    const lead = t - lastCapT < 0.05 ? Math.min(window.innerHeight / 2, Math.abs(window.scrollY - lastScrollY)) : 0;
    lastScrollY = window.scrollY;
    lastCapT = t;
    const top = window.scrollY - mainTop - lead;
    const bottom = window.scrollY - mainTop + window.innerHeight + lead;
    for (const g of gates) {
      if (g.len >= want) break; // sorted by len
      if (g.hero) {
        // Woken by heroFinished(), no polling needed.
        if (!heroDone && gateInView(g, top, bottom, true)) {
          capUnseen = true;
          return g.len;
        }
        continue;
      }
      if (opened.has(g.el)) continue;
      const hydrated = !g.island?.hasAttribute('ssr');
      if (!gateInView(g, top, bottom, hydrated)) continue;
      const opacity = hydrated ? parseFloat(getComputedStyle(g.el).opacity) : 0;
      if (opacity >= REVEAL_OPACITY) {
        opened.add(g.el);
        continue;
      }
      const clock = hydrated ? firstSeen : firstSeenDry;
      const seen = clock.get(g.el);
      if (seen === undefined) clock.set(g.el, t);
      else if (t - seen > (hydrated ? GATE_CAP_S : HYDRATE_CAP_S)) {
        opened.add(g.el);
        continue;
      }
      capPoll = true;
      capUnseen = opacity < 0.05;
      return g.len;
    }
    return Infinity;
  }

  function targetLen(): number {
    const want = scrollTarget();
    capActive = false;
    capPoll = false;
    capUnseen = false;
    if (!route || !started || reduced) return want;
    const cap = revealCap(want);
    if (cap < want) {
      capActive = true;
      return cap;
    }
    return want;
  }

  /**
   * A gate that binds behind the drawn head (content above the line that has
   * not revealed, scrolled back into view) pulls the line back at once: a
   * spring would leave it drawn over the invisible content for a while.
   */
  function holdAt(target: number) {
    if (capActive && shown > target) {
      shown = target;
      vel = 0;
    }
  }

  function rebuild() {
    window.clearTimeout(rebuildTimer);
    // Decided before the new geometry exists: was the line resting at its target?
    const wasSettled = settled && vel === 0;
    const measured = measure();
    const next = measured ? buildRoute(measured.snap) : null;
    if (!measured || !next) {
      // Layout not recognised: step aside and leave the page as it is without JS.
      route = null;
      html.classList.remove('thread-on', 'thread-drawing');
      return;
    }
    html.classList.add('thread-on');
    if (started) html.classList.add('thread-drawing');
    const prev = route;
    const prevShown = shown;
    const widthChanged = !!prev && measured.snap.width !== viewW;
    if (widthChanged) endLatch = null;
    route = next;
    viewW = measured.snap.width;

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
    straight = straightness(next);

    gates = measured.gateSpecs
      .map((g) => ({ el: g.el, len: lengthAtY(next, g.y - 2), top: g.box.y, bottom: g.box.y + g.box.h, island: g.el.closest('astro-island'), hero: g.hero }))
      .filter((g) => g.hero || g.len > next.minLen)
      .sort((a, b) => a.len - b.len);

    // Rebuild in place. A line at rest stays at the reading position on the
    // new geometry (a rotation or window snap keeps scrollY, not the content,
    // so the old drawn length can map to somewhere off screen). A line in
    // motion carries its progress over to the same place in the content and
    // the spring goes on from there, unless a width change lands it off screen
    // or far from where it is heading (it would sweep or rewind across the
    // viewport). At the same width the content mapping is exact: keep it.
    if (!started) shown = 0;
    else {
      shown = prev ? Math.min(next.total, Math.max(0, carryOver(prev, next, prevShown))) : 0;
      const target = targetLen();
      const head = pointAt(next, shown)[1] + mainTop;
      const off = head < window.scrollY || head > window.scrollY + window.innerHeight;
      const far = Math.abs(target - shown) > Math.max(200, window.innerHeight / 4);
      if (reduced || !prev || wasSettled || (widthChanged && (off || far))) {
        shown = target;
        vel = 0;
      }
      holdAt(target);
    }
    plucks = [];
    render(now());
    schedule();
  }

  /** Rebuild now unless a rebuild already ran in this frame (layout cannot have changed since). */
  function rebuildInFrame() {
    if (rebuiltThisFrame) return;
    rebuiltThisFrame = true;
    requestAnimationFrame(() => {
      rebuiltThisFrame = false;
    });
    rebuild();
  }

  function scheduleRebuild() {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(rebuild, FONT_DEBOUNCE_MS);
  }

  /** The start knot's row has scrolled above the viewport: the hero intro plays unseen. */
  function heroGone(): boolean {
    return !!route && route.start[1] + mainTop < window.scrollY;
  }

  /** The hero tags (the beads) have finished their reveal. */
  function beadsVisible(): boolean {
    const el = main!.querySelector('[data-thread-beads]');
    return !el || parseFloat(getComputedStyle(el).opacity) > 0.99;
  }

  /** Every element of the hero intro has finished revealing (the intro has visibly played). */
  function introPlayed(): boolean {
    const els = main!.querySelectorAll('[data-thread-section="hero"] .gsap-reveal');
    return [...els].every((el) => parseFloat(getComputedStyle(el).opacity) > 0.99);
  }

  function setGeometry() {
    if (!route) return;
    path!.setAttribute('d', route.d);
    // Lengths below are in the builder's units; pathLength maps them onto the browser's.
    path!.setAttribute('pathLength', route.total.toFixed(3));
    polyMode = false;
  }

  /**
   * Pluck weight per sample: 0 on curves (corners, loops, fillets), easing up
   * to 1 over PLUCK_EASE along straight stretches. Offsetting a curve along
   * its normal would change its radius (a loop squashing onto its node) and
   * fold its fillets into cusps; a straight stretch just bows. The hero run
   * (start knot, through the tag pills, to the first corner) does not swing
   * either: the beads are strung on it, and a swing would pull the line out
   * from behind the fixed pills into stray dashes in the gaps.
   */
  function straightness(r: Route): Float32Array {
    const P = r.points, n = r.count;
    const dist = new Float32Array(n).fill(1e9);
    for (let i = 1; i < n - 1; i++) {
      const ax = P[i * 2] - P[i * 2 - 2], ay = P[i * 2 + 1] - P[i * 2 - 1];
      const bx = P[i * 2 + 2] - P[i * 2], by = P[i * 2 + 3] - P[i * 2 + 1];
      const turn = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
      if (turn > 0.01) dist[i] = 0;
    }
    for (let i = 0; i < n && i * r.step <= r.minLen; i++) dist[i] = 0;
    dist[0] = dist[n - 1] = 0; // the ends do not swing either
    for (let i = 1; i < n; i++) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
    for (let i = n - 2; i >= 0; i--) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.sin((Math.PI / 2) * Math.min(1, (dist[i] * r.step) / PLUCK_EASE)) ** 2;
    return out;
  }

  /**
   * The drawing head is a fixed end too (the pen and its glow sit on it): the
   * swing eases out over PLUCK_EASE before the drawn length `L`, so the line
   * runs smoothly into the pen instead of jogging sideways into it.
   */
  function headTaper(i: number, L: number): number {
    return Math.sin((Math.PI / 2) * Math.max(0, Math.min(1, (L - i * route!.step) / PLUCK_EASE))) ** 2;
  }

  function offsetAt(i: number, t: number, L: number): number {
    const k = (straight[i] ?? 0) * headTaper(i, L);
    if (k === 0) return 0;
    let o = 0;
    for (const pk of plucks) {
      const ds = Math.abs(i - pk.i) * route!.step;
      if (ds > PLUCK_REACH) continue;
      const tau = t - pk.t0;
      const w = Math.cos((Math.PI / 2) * (ds / PLUCK_REACH)) ** 2;
      o += pk.a * Math.exp(-3.2 * tau) * Math.sin(2 * Math.PI * 7 * tau) * w;
    }
    return o * k;
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
        const o = offsetAt(i, t, L);
        let nx = 0, ny = 0;
        if (o !== 0) {
          const a = Math.max(0, i - 1), b = Math.min(r.count - 1, i + 1);
          const dx = P[b * 2] - P[a * 2], dy = P[b * 2 + 1] - P[a * 2 + 1];
          const l = Math.hypot(dx, dy) || 1;
          nx = -dy / l;
          ny = dx / l;
        }
        // Hard guard: a vibrating rail never leaves the viewport.
        const px = Math.max(r.strokeWidth / 2, Math.min(viewW - r.strokeWidth / 2, P[i * 2] + nx * o));
        d += (i ? 'L' : 'M') + px.toFixed(1) + ',' + (P[i * 2 + 1] + ny * o).toFixed(1);
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
    if (inPlace && !(capActive && capUnseen)) inPlace = false;
    const veiled = inPlace;
    // While veiled the page shows its own timeline line, as before the thread started.
    if (started) html.classList.toggle('thread-drawing', !veiled);
    // A zero-length dash with round caps would leave a dot at the start knot.
    // Fades in (after the veil of an in-place start, with the content), goes at once.
    const showPath = L > 0.5 && !veiled;
    if (path!.style.opacity !== (showPath ? '1' : '0')) {
      path!.style.transition = showPath ? 'opacity 0.3s ease' : 'none';
      path!.style.opacity = showPath ? '1' : '0';
    }

    const head = pointAt(r, L);
    const showPen = started && !reduced && L > 1 && !arrived && !veiled;
    // Fades out where it comes to rest, but goes at once when the line is
    // pulled back to nothing (it would linger on the start knot's spot).
    const penNow = L <= 1 || veiled ? 'none' : '';
    for (const c of [pen!, glow!]) {
      c.setAttribute('cx', head[0].toFixed(2));
      c.setAttribute('cy', head[1].toFixed(2));
      if (c.style.transition !== penNow) c.style.transition = penNow;
      c.style.opacity = showPen ? '1' : '0';
    }
    // The glow shrinks near the viewport edges (rails 7px in) so it is never cut off flat.
    const glowR = Math.max(PEN_EXTENT, Math.min(GLOW_R, Math.min(head[0], viewW - head[0]) - 0.5)).toFixed(2);
    if (glow!.getAttribute('r') !== glowR) glow!.setAttribute('r', glowR);
    // Both knots fade in, but go at once: a line pulled back (the start knot:
    // the hero intro replaying while it is in view) must not leave them behind.
    const showKnot = started && L > 0.5;
    if (knot!.style.opacity !== (showKnot ? '1' : '0')) {
      knot!.style.transition = showKnot ? '' : 'none';
      knot!.style.opacity = showKnot ? '1' : '0';
    }
    endKnot!.toggleAttribute('data-on', arrived);
    const reached = !started ? -Infinity : arrived ? Infinity : r.maxY[Math.min(r.count - 1, Math.floor(L / r.step))];
    setDone(nodes, reached, 4);
    setDone(inks, reached, 6);
    setDone(cards, reached, 0);
  }

  function tick(ts: number) {
    raf = 0;
    // Never step a frame on geometry for another width (the resize event and
    // the ResizeObserver can land after this frame's callbacks).
    if (route && layoutWidth() !== viewW) rebuildInFrame();
    if (!route) return;
    const t = ts / 1000;
    const dt = lastT ? Math.min(0.05, Math.max(0, t - lastT)) : 1 / 60;
    lastT = t;
    const target = targetLen();
    // After an in-place start the line tracks the target exactly while the
    // page scrolls (a hash link's smooth scroll), so it never trails behind,
    // or sweeps in from a gate the scroll has carried out of view. Once the
    // page rests, the spring draws it in behind the content as each part
    // reveals (exact tracking would make it jump the moment a gate opens).
    const scrolling = window.scrollY !== lastTickY;
    lastTickY = window.scrollY;
    holdAt(target);
    if (reduced || (t < snapUntil && scrolling)) {
      shown = target;
      vel = 0;
    } else {
      const c = 2 * Math.sqrt(SPRING_K);
      vel += (SPRING_K * (target - shown) - c * vel) * dt;
      const gap = target - shown;
      const minStep = SETTLE_SPEED * dt;
      if (gap !== 0 && Math.sign(vel) !== -Math.sign(gap) && Math.abs(vel * dt) < minStep) {
        // The spring's slow tail: finish at a steady pace instead.
        if (Math.abs(gap) <= minStep) {
          shown = target;
          vel = 0;
        } else {
          shown += Math.sign(gap) * minStep;
          vel = Math.sign(gap) * SETTLE_SPEED;
        }
      } else shown += vel * dt;
      if (Math.abs(target - shown) < 0.5 && Math.abs(vel) < 0.5) {
        shown = target;
        vel = 0;
      }
    }
    render(now());
    settled = shown === target && vel === 0;
    // A closed gate keeps the loop polling until its content reveals.
    if (!raf && (!settled || plucks.length || capPoll)) raf = requestAnimationFrame(tick);
    else lastT = 0;
  }

  function schedule() {
    if (!raf && route) raf = requestAnimationFrame(tick);
  }

  /**
   * Start drawing. When the hero is already out of view (deep link, reload or
   * back navigation into the middle of the page, or a quick scroll during the
   * intro) the line appears in place at the reading position instead of
   * sweeping in from the hero.
   */
  function start(snap = false) {
    if (started) return;
    started = true;
    html.classList.add('thread-drawing');
    settled = false;
    if (snap || heroGone()) {
      shown = targetLen();
      vel = 0;
      inPlace = true;
      // A hash link smooth-scrolls on after this: keep the line in place for
      // the rest of that scroll instead of letting the spring trail behind it.
      snapUntil = now() + SNAP_FOLLOW_S;
    }
    lastT = 0;
    render(now());
    schedule();
  }

  function markReady() {
    svg!.setAttribute('data-thread-ready', 'true');
  }

  /**
   * Largest pluck amplitude that keeps the stretch around sample `best` inside
   * the viewport: a rail 7px from the edge only has a few px of room outwards
   * (and the swing is symmetric, so it stays out of the content gutter too).
   */
  function pluckRoom(r: Route, best: number): number {
    const P = r.points;
    const reach = Math.ceil(PLUCK_REACH / r.step);
    let cap = Infinity;
    for (let j = Math.max(1, best - reach); j <= Math.min(r.count - 2, best + reach); j++) {
      const w = Math.cos((Math.PI / 2) * ((Math.abs(j - best) * r.step) / PLUCK_REACH)) ** 2 * (straight[j] ?? 0) * headTaper(j, shown);
      const dx = P[(j + 1) * 2] - P[(j - 1) * 2], dy = P[(j + 1) * 2 + 1] - P[(j - 1) * 2 + 1];
      const nx = Math.abs(dy) / (Math.hypot(dx, dy) || 1);
      if (nx * w < 0.05) continue;
      const room = Math.min(P[j * 2], viewW - P[j * 2]) - r.strokeWidth / 2 - 1;
      cap = Math.min(cap, Math.max(0, room) / (nx * w));
    }
    return cap;
  }

  function onPointerMove(e: PointerEvent) {
    if (reduced || !route || !started || e.pointerType === 'touch') return;
    // Track the pointer in viewport coordinates: page coordinates would count
    // the scroll between two events as pointer motion (a wheel step plus a 1px
    // jitter would read as a fast vertical sweep).
    const t = now();
    const prev = ptr;
    ptr = { x: e.clientX, y: e.clientY, t };
    if (!prev || t - prev.t > 0.12) return;
    const speed = Math.hypot(e.clientX - prev.x, e.clientY - prev.y) / Math.max(0.008, t - prev.t);
    if (speed < PLUCK_MIN_SPEED) return;
    // Both ends in the thread layer's space, with the current scroll.
    const ox = window.scrollX - mainLeft, oy = window.scrollY - mainTop;
    const x0 = prev.x + ox, y0 = prev.y + oy, x = e.clientX + ox, y = e.clientY + oy;
    // Test the whole movement since the last event: a fast sweep jumps right over the line.
    const r = route;
    const drawn = shown / r.step;
    const vx = x - x0, vy = y - y0, vl = vx * vx + vy * vy || 1;
    let best = -1, bd = 10;
    const cx0 = Math.floor((Math.min(x0, x) - 12) / HASH_CELL), cx1 = Math.floor((Math.max(x0, x) + 12) / HASH_CELL);
    const cy0 = Math.floor((Math.min(y0, y) - 12) / HASH_CELL), cy1 = Math.floor((Math.max(y0, y) + 12) / HASH_CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        for (const i of hash.get(cx * 100000 + cy) ?? []) {
          if (i > drawn) continue;
          const qx = r.points[i * 2], qy = r.points[i * 2 + 1];
          const u = Math.max(0, Math.min(1, ((qx - x0) * vx + (qy - y0) * vy) / vl));
          const dd = Math.hypot(x0 + vx * u - qx, y0 + vy * u - qy);
          if (dd < bd) {
            bd = dd;
            best = i;
          }
        }
      }
    }
    // A sweep across a loop, a corner, the beads or the pen plucks nothing (only straight stretches swing).
    if (best >= 0 && (straight[best] ?? 0) * headTaper(best, shown) < 0.3) return;
    if (best < 0 || plucks.some((pk) => Math.abs(pk.i - best) * r.step < 60 && t - pk.t0 < 0.25)) return;
    const a = Math.max(0, best - 1), b = Math.min(r.count - 1, best + 1);
    const nx = -(r.points[b * 2 + 1] - r.points[a * 2 + 1]), ny = r.points[b * 2] - r.points[a * 2];
    const side = Math.sign(vx * nx + vy * ny) || 1;
    const amp = Math.min(13, 4 + speed / 160, pluckRoom(r, best));
    if (amp < 1.5) return;
    plucks.push({ i: best, t0: t, a: side * amp });
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
    if (!started && heroGone()) start(true);
  });

  /**
   * The hero intro has completed, or the fallbacks below gave up waiting for
   * it: draw from the start knot (or, if the line already started in place
   * while the intro played unseen, open the hero gates).
   */
  function heroFinished() {
    if (heroDone) return;
    heroDone = true;
    window.clearTimeout(fallbackTimer);
    window.clearTimeout(capTimer);
    // The beads draw in from the knot, as on a normal start.
    snapUntil = 0;
    if (started) schedule();
    else start();
  }

  if (heroDone) start();
  else {
    // The hero out of view already: start in place; the hero gates keep the
    // line out of the hero until its intro has completed.
    if (heroGone()) start(true);
    window.addEventListener('hero:revealed', heroFinished, { once: true, signal });
    // The fallback counts from the start of the hero intro (the island may
    // hydrate late on a slow connection), never from this script's boot. It is
    // wall-clock time while the intro runs on animation frames: in a hidden tab
    // (or behind a long task) the timer fires before the intro has played, so
    // it only gives up once the intro has visibly played, polling until then.
    let armedAt = 0;
    const visible = () => document.visibilityState !== 'hidden';
    const tryFinish = () => {
      if (heroDone) return;
      if (visible() && (introPlayed() || performance.now() - armedAt > BOOT_CAP_MS)) heroFinished();
      else fallbackTimer = window.setTimeout(tryFinish, FALLBACK_POLL_MS);
    };
    const armFallback = () => {
      window.clearTimeout(fallbackTimer);
      armedAt = performance.now();
      fallbackTimer = window.setTimeout(tryFinish, INTRO_FALLBACK_MS);
    };
    if ('heroIntro' in html.dataset) armFallback();
    else window.addEventListener('hero:intro-start', armFallback, { once: true, signal });
    // Back from a background tab, the intro replays: give it its full time again.
    document.addEventListener('visibilitychange', () => {
      if (!heroDone && visible() && 'heroIntro' in html.dataset) armFallback();
    }, { signal });
    capTimer = window.setTimeout(() => {
      if (!('heroIntro' in html.dataset) && visible() && beadsVisible()) heroFinished();
    }, BOOT_CAP_MS);
  }

  window.addEventListener('scroll', () => {
    // A deep link or restored scroll position can land after boot.
    if (!started && heroGone()) start(true);
    schedule();
  }, { passive: true, signal });
  window.addEventListener('resize', () => {
    // A height-only resize (a mobile URL bar showing or hiding) moves the
    // reading line, not the route: no rebuild. Width changes rebuild before the
    // next paint (the ResizeObserver usually gets there first in the same frame).
    schedule();
    if (route && layoutWidth() !== viewW) requestAnimationFrame(() => {
      if (layoutWidth() !== viewW) rebuildInFrame();
    });
  }, { passive: true, signal });
  window.addEventListener('pointermove', onPointerMove, { passive: true, signal });
  document.fonts?.addEventListener?.('loadingdone', scheduleRebuild, { signal });
  reduceQuery.addEventListener('change', () => {
    reduced = reduceQuery.matches;
    plucks = [];
    if (reduced) {
      heroDone = true;
      start();
    }
    schedule();
  }, { signal });
  // Layout changes (resize drags, rotation, reflow): the callback runs after
  // layout and before paint, so rebuilding here means no frame ever shows the
  // old geometry over the new layout. Our own writes (the absolutely
  // positioned, clipped SVG) cannot resize the observed elements.
  const ro = new ResizeObserver(() => rebuildInFrame());
  ro.observe(main);
  // A scrollbar appearing or going resizes only the root (see layoutWidth).
  ro.observe(html);
  for (const el of main.querySelectorAll('[data-thread-section]')) ro.observe(el);

  return () => {
    ac.abort();
    ro.disconnect();
    window.clearTimeout(rebuildTimer);
    window.clearTimeout(fallbackTimer);
    window.clearTimeout(capTimer);
    if (raf) cancelAnimationFrame(raf);
    html.classList.remove('thread-on', 'thread-drawing');
  };
}
