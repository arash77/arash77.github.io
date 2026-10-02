/**
 * Scroll thread: DOM side.
 *
 * Measures the home page (transform-free, see `measure`), feeds the snapshot to
 * the pure route builder, and draws the route as the visitor reads: the drawn
 * length follows the reading line (62% down the viewport) through a critically
 * damped spring. Also drives the pen, timeline nodes, ink underlines, the
 * contact cards' silkscreen marks, signal pulses (a fast pointer sweep across
 * the trace) and the chip network at the end (board.ts), whose reset switch
 * takes the reader back to the top.
 *
 * Everything visual is opt-in through `html.thread-on`, which only this script
 * adds, so without JavaScript the page renders exactly as before.
 */
import { buildBoard, GROUND_BAR_GAP, SW_PAD_X, SW_PAD_Y, type Board } from './board';
import { buildRoute, carryOver, computeRails, lengthAtY, loopReach, pointAt, type LayoutSnapshot, type Rect, type Route, type SectionLayout } from './route';

const SPRING_K = 40;
const READ_LINE = 0.62;
/** Hero intro (~2.2s) plus slack: start anyway if `hero:revealed` never comes. Counted from the intro's start. */
const INTRO_FALLBACK_MS = 2600;
/** If the hero island never even starts its intro, start once the tags are visible anyway. */
const BOOT_CAP_MS = 8000;
/** Only for font swaps; layout changes rebuild in the same frame (see the ResizeObserver). */
const FONT_DEBOUNCE_MS = 120;
const SWEEP_MIN_SPEED = 400; // px/s: a deliberate sweep, not a stroll
/** Signal pulse: a short bright dash running along the trace. */
const PULSE_LEN = 26;
const PULSE_SPEED = 950;
const PULSE_LIFE = 1.2;
/** A signal on the trace is lit only up to this far short of the drawn line's head (its round ends stay under the pen). */
const HEAD_INSET = 3;
/**
 * The reset signal runs back to the start pad in this long (s per px of
 * drawn line, within bounds), the page following it: steady enough to
 * visibly cross every horizontal wire, quick enough for a "back to top".
 */
const REWIND_S_PER_PX = 1 / 5500;
const REWIND_MIN_S = 0.9;
const REWIND_MAX_S = 2;
const RESET_PRESS_MS = 320;
const FLASH_MS = 700;
/** A heading bar's solder pads reach this far beyond its ends (CSS). */
const LED_PAD = 4;
/** The arrival pulse starts this far before the end and runs on up the stub into pin 1. */
const ARRIVAL_RUN = 240;
/** The nets fire this long after the arrival pulse has reached pin 1. */
const NET_AFTER_PIN_MS = 60;
const NET_STAGGER_MS = 140;
/** ms per px of a net: the speed of the pulse along it (keep in sync with global.css). */
const NET_MS_PER_PX = 1.4;
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
/** Once the page bottom was reached, scrolling up this little (or a mobile URL bar returning) keeps the route complete. */
const END_LATCH_PX = 64;

interface Anchor {
  el: Element;
  y: number;
  done: boolean;
}

/**
 * A section heading bar, drawn as an indicator LED on the trace (CSS): it
 * lights once the line has entered it, between route lengths `enter` and `exit`.
 */
interface Led {
  el: Element;
  enter: number;
  exit: number;
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

interface Pulse {
  el: SVGPathElement;
  /** Its glow: wider, fainter strokes under it, widest first. */
  halos: SVGPathElement[];
  /** Length along its path where it started, its direction and speed (px/s). */
  from: number;
  dir: 1 | -1;
  speed: number;
  t0: number;
  life: number;
  /** Current position along its path (the middle of its light). */
  pos: number;
  /** The gap after its dash (longer than its path, so the dash never repeats). */
  gap: string;
  /** Runs along its own path (the arrival into pin 1) instead of the route; ends at `end`. */
  end?: number;
  /** Placed by the reset each frame (see stepRewind), not by its speed; never fades. */
  held?: boolean;
  /** Not moved yet (it may start inside an LED). */
  fresh?: boolean;
  /** Ran off its end (not faded out): what it reached. */
  onEnd?: () => void;
}

interface GateSpec {
  el: Element;
  /** y (layer coordinates) the pen must not pass: the top of a block, or the top of a node loop. */
  y: number;
  hero: boolean;
  box: Rect;
}

const now = () => performance.now() / 1000;
const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  parent.append(e);
  return e;
}

const polyline = (pts: readonly (readonly [number, number])[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join('');

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
  const boardG = svg?.querySelector<SVGGElement>('[data-thread-board]');
  const pulseG = svg?.querySelector<SVGGElement>('[data-thread-pulses]');
  if (!root || !main || !svg || !path || !knot || !endKnot || !pen || !glow || !gradient || !boardG || !pulseG) return () => {};

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
  let pulses: Pulse[] = [];
  let board: Board | null = null;
  /** Card elements in the order buildBoard() was given them. */
  let boardCards: Element[] = [];
  let powered = false;
  let resetBtn: HTMLButtonElement | null = null;
  /** When the nets fire after power-on (ms): once the arrival pulse has reached pin 1. */
  let netDelay = 0;
  /**
   * The reset in flight: its signal runs back up the trace from `from` over
   * `T` seconds, the line retracting behind it and the page following it.
   * `y` is the scroll position it set last (any other means the reader took over).
   */
  let rewind: { p: Pulse; from: number; t0: number; T: number; y: number } | null = null;
  let ptr: { x: number; y: number; t: number } | null = null;
  let hash = new Map<number, number[]>();
  let nodes: Anchor[] = [];
  let inks: Anchor[] = [];
  let cards: Anchor[] = [];
  let leds: Led[] = [];
  /** The chip's top pins (the nets start at them, in order). */
  let topPinEls: SVGRectElement[] = [];
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
  function measure(): { snap: LayoutSnapshot; height: number; gateSpecs: GateSpec[]; cardEls: Element[]; cardRects: Rect[]; barEls: Element[] } | null {
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
      const barEls: Element[] = [];
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
        const barEl = el.querySelector('[data-thread-bar]');
        const bar = rel(barEl);
        if (!box || !bar) continue;
        barEls.push(barEl!);
        const nodeRects: Rect[] = [];
        const loopTop = new Map<Element, number>();
        for (const nodeEl of el.querySelectorAll('[data-thread-node]')) {
          const r = rel(nodeEl);
          if (!r) continue;
          nodeRects.push(r);
          const card = nodeEl.closest('.gsap-reveal');
          if (card) loopTop.set(card, r.y + r.h / 2 - loopReach(r.w / 2 + 9));
        }
        // Phones hide the nodes: a timeline card is then an ordinary block.
        for (const block of el.querySelectorAll('.gsap-reveal')) {
          const r = rel(block);
          if (r) gateSpecs.push({ el: block, y: loopTop.get(block) ?? r.y, hero: false, box: r });
        }
        const cardRects = [...el.querySelectorAll('[data-thread-card]')].map(rel);
        sections.push({ top: box.y, bottom: box.y + box.h, bar, nodes: nodeRects, cards: union(cardRects) });
      }
      if (!sections.length) return null;
      // The chip network wires up the last section's cards.
      const lastSection = [...main!.querySelectorAll('[data-thread-section]')].pop();
      const cardEls: Element[] = [];
      const cardRects: Rect[] = [];
      for (const el of lastSection?.querySelectorAll('[data-thread-card]') ?? []) {
        const r = rel(el);
        if (r) {
          cardEls.push(el);
          cardRects.push(r);
        }
      }

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
      cards = anchor('[data-thread-card]', (r) => r.y + Math.min(24, r.h / 3));

      return {
        height: m.height,
        gateSpecs,
        cardEls,
        cardRects,
        barEls,
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
      board = null;
      boardG!.replaceChildren();
      setPowered(false);
      resetBtn?.setAttribute('hidden', '');
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
    // A rebuild while powered (a resize at the page bottom, a mobile URL bar)
    // keeps the board lit as it is: no replay of the power-on, no flicker.
    const wasPowered = powered;
    board = buildBoard(next.end, next.endDir, measured.cardRects, w);
    boardCards = measured.cardEls;
    leds = placeLeds(next, measured.snap.sections, measured.barEls);
    drawBoard(board);
    if (wasPowered && board) setPowered(true, true);
    else setPowered(false);

    hash = new Map();
    for (let i = 0; i < next.count; i++) {
      const k = Math.floor(next.points[i * 2] / HASH_CELL) * 100000 + Math.floor(next.points[i * 2 + 1] / HASH_CELL);
      const list = hash.get(k);
      if (list) list.push(i);
      else hash.set(k, [i]);
    }

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
    // A reset in flight goes on from the same place in the content.
    const rw = rewind;
    clearPulses();
    if (rw && prev && started) beginRewind(carryOver(prev, next, Math.max(0, rw.p.pos)), Math.max(0.3, rw.T - (now() - rw.t0)));
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
  }

  /**
   * Where the route runs through each section heading bar (its LED): the
   * lengths at which the line enters and leaves it (pads included).
   */
  function placeLeds(r: Route, sections: SectionLayout[], els: Element[]): Led[] {
    const out: Led[] = [];
    sections.forEach((sec, i) => {
      const el = els[i];
      const y = r.barRows[i];
      if (!el || y === undefined) return;
      const x0 = sec.bar.x - LED_PAD, x1 = sec.bar.x + sec.bar.w + LED_PAD;
      let first = -1, last = -1;
      for (let k = 0; k < r.count; k++) {
        const px = r.points[k * 2], py = r.points[k * 2 + 1];
        if (Math.abs(py - y) < 0.5 && px >= x0 && px <= x1) {
          if (first < 0) first = k;
          last = k;
        } else if (first >= 0) break;
      }
      if (first < 0) return;
      out.push({ el, enter: first * r.step, exit: last * r.step, done: el.hasAttribute('data-thread-done') });
    });
    return out;
  }

  /** Draw the chip network (board.ts) into its group; empty when there is none. */
  function drawBoard(b: Board | null) {
    boardG!.replaceChildren();
    if (!b) {
      resetBtn?.setAttribute('hidden', '');
      return;
    }
    const g = boardG!;
    const pinMs = Math.round(((Math.min(ARRIVAL_RUN, route?.total ?? 0) + (route ? route.end[1] - b.pinBottom : 0)) / PULSE_SPEED) * 1000);
    netDelay = pinMs + NET_AFTER_PIN_MS;
    g.style.setProperty('--pin-at', `${pinMs}ms`);
    b.nets.forEach((n, i) => {
      const d = polyline(n.points);
      const delay = netDelay + i * NET_STAGGER_MS;
      const vars = `--i:${i};--len:${n.length.toFixed(1)};--delay:${delay}ms;--lit-at:${Math.round(delay + n.length * NET_MS_PER_PX)}ms`;
      svgEl('path', { d, class: 'site-thread__net', style: vars }, g);
      svgEl('path', { d, class: 'site-thread__net-pulse', style: vars }, g);
    });
    // The first wire is the stub from the end point up into pin 1: part of the trace, drawn when the line arrives.
    b.wires.forEach((w, k) => svgEl('path', { d: polyline(w), class: k === 0 ? 'site-thread__wire site-thread__stub' : 'site-thread__wire' }, g));
    for (const [x, y] of b.grounds) {
      [16, 10, 4].forEach((wd, k) => svgEl('path', { d: `M${x - wd / 2},${y + k * GROUND_BAR_GAP}H${x + wd / 2}`, class: 'site-thread__wire' }, g));
    }
    const { cx, cy, w, h } = b.chip;
    const left = b.inputPin === 0;
    topPinEls = b.topPins.map((x) => svgEl('rect', { x: x - 1.6, y: b.pinTop, width: 3.2, height: 9, rx: 0.6, class: 'site-thread__pin' }, g));
    b.botPins.forEach((x, k) => svgEl('rect', { x: x - 1.6, y: b.pinBottom - 9, width: 3.2, height: 9, rx: 0.6, class: k === b.inputPin ? 'site-thread__pin site-thread__pin--in' : 'site-thread__pin' }, g));
    svgEl('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 2.5, class: 'site-thread__chip' }, g);
    const nx = left ? cx - w / 2 : cx + w / 2;
    svgEl('path', { d: `M${nx},${cy - 4}A4,4 0 0 ${left ? 1 : 0} ${nx},${cy + 4}`, class: 'site-thread__chip-notch' }, g);
    svgEl('text', { x: cx, y: cy + 2.6, 'text-anchor': 'middle', class: 'site-thread__chip-text' }, g).textContent = 'AK-01';
    // The reset switch: four pads (its legs, on the wires), the body and the actuator that presses in.
    const [sx, sy] = b.reset;
    const sw = svgEl('g', { class: 'site-thread__switch' }, g);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) svgEl('rect', { x: sx + dx * SW_PAD_X - 2.5, y: sy + dy * SW_PAD_Y - 2, width: 5, height: 4, rx: 0.8, class: 'site-thread__pad' }, sw);
    svgEl('rect', { x: sx - SW_PAD_X + 2, y: sy - SW_PAD_Y - 1, width: 2 * (SW_PAD_X - 2), height: 2 * (SW_PAD_Y + 1), rx: 2, class: 'site-thread__switch-body' }, sw);
    svgEl('circle', { cx: sx, cy: sy, r: 4, class: 'site-thread__switch-act' }, sw);
    for (const l of b.labels) svgEl('text', { x: l.x, y: l.y, 'text-anchor': l.anchor, class: 'site-thread__silk' }, g).textContent = l.text;

    // The reset switch's button: after the contact cards in the tab order (it
    // is created here, so the page without JavaScript has none).
    if (!resetBtn) {
      resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'site-thread-reset';
      resetBtn.setAttribute('aria-label', 'Back to top');
      resetBtn.setAttribute('data-thread-reset', '');
      const tip = document.createElement('span');
      tip.className = 'site-thread-reset__tip';
      tip.setAttribute('aria-hidden', 'true');
      tip.textContent = 'Back to top';
      resetBtn.append(tip);
      resetBtn.addEventListener('click', resetToTop, { signal });
    }
    if (resetBtn.parentElement !== main) main!.append(resetBtn);
    resetBtn.style.left = `${sx}px`;
    resetBtn.style.top = `${sy}px`;
    // Its hover label opens away from the chip, over empty board, or below the
    // switch when the viewport has no room beside it (phones).
    const room = sx > cx ? layoutWidth() - sx - 22 : sx - 22;
    resetBtn.dataset.side = room < 150 ? 'below' : sx > cx ? 'right' : 'left';
  }

  /**
   * Power on the board (the line has arrived): the input pin lights and the
   * nets light the cards one after another (CSS timing). `instant` re-applies
   * the powered state after a rebuild without playing it again.
   */
  function setPowered(on: boolean, instant = false) {
    if (on === powered && !instant) return;
    powered = on;
    boardG!.toggleAttribute('data-powered', on);
    boardG!.toggleAttribute('data-settled', on && instant);
    if (!on) {
      for (const el of main!.querySelectorAll('[data-thread-lit]')) el.removeAttribute('data-thread-lit');
      return;
    }
    if (!board) return;
    board.nets.forEach((n, i) => {
      const at = netDelay + i * NET_STAGGER_MS + n.length * NET_MS_PER_PX;
      n.cards.forEach((ci, k) => {
        const el = boardCards[ci] as HTMLElement | undefined;
        if (!el) return;
        el.style.setProperty('--thread-lit-delay', instant ? '0ms' : `${Math.round(at + k * NET_STAGGER_MS)}ms`);
        el.setAttribute('data-thread-lit', '');
      });
    });
  }

  /** A pulse along the route (or along `path` / `pathLen`, its own polyline). */
  function spawnPulse(from: number, dir: 1 | -1, opts: Partial<Pick<Pulse, 'speed' | 'life' | 'end' | 'held' | 'onEnd'>> & { d?: string; width?: number } = {}) {
    const r = route;
    if (!r || reduced) return null;
    const sw = opts.width ?? r.strokeWidth;
    const len = opts.end ?? r.total;
    const dash = {
      d: opts.d ?? r.d,
      pathLength: len.toFixed(3),
      'stroke-dasharray': `${PULSE_LEN} ${(len + PULSE_LEN * 2).toFixed(2)}`,
      // Where it starts, before its first frame (without it the dash would sit at the path's start).
      'stroke-dashoffset': (PULSE_LEN / 2 - from).toFixed(2),
    };
    // The glow is layered strokes, not a CSS filter: a filter over a path the
    // size of the page is drawn in GPU tiles, with seams (a copy of the light beside it).
    const halos = [11, 5].map((extra, k) => svgEl('path', { ...dash, class: `site-thread__pulse-halo site-thread__pulse-halo--${k}`, 'stroke-width': (sw + extra).toFixed(2) }, pulseG!));
    const el = svgEl('path', { ...dash, class: 'site-thread__pulse', 'stroke-width': (sw + 1.6).toFixed(2) }, pulseG!);
    const p: Pulse = { el, halos, from, dir, speed: opts.speed ?? PULSE_SPEED, t0: now(), life: opts.life ?? PULSE_LIFE, pos: from, gap: (len + PULSE_LEN * 2).toFixed(2), end: opts.end, held: opts.held, onEnd: opts.onEnd, fresh: true };
    pulses.push(p);
    schedule();
    return p;
  }

  function dropPulse(p: Pulse) {
    p.el.remove();
    for (const h of p.halos) h.remove();
  }

  function clearPulses() {
    for (const p of pulses) dropPulse(p);
    pulses = [];
    rewind = null;
  }

  /**
   * A short flash where a pulse arrives (the start pad, the pen, a pin, an
   * LED, a card). A flash in progress runs to its end, and signals arriving
   * meanwhile add nothing: restarting it (or an earlier flash's timer cutting
   * a later one short) makes it jump, which flickers under a flurry of sweeps.
   */
  function flash(el: Element | null | undefined) {
    if (!el || reduced || el.hasAttribute('data-flash')) return;
    el.setAttribute('data-flash', '');
    window.setTimeout(() => el.removeAttribute('data-flash'), FLASH_MS);
  }

  /**
   * Move the pulses. A pulse on the route never runs past the drawn head:
   * there it flashes the pen (or pin 1, once the line has arrived); one that
   * runs back to the start flashes the start pad.
   */
  function updatePulses(t: number, L: number, arrived: boolean) {
    pulses = pulses.filter((p) => {
      const age = t - p.t0;
      const was = p.pos;
      if (!p.held) p.pos = p.from + p.dir * age * p.speed;
      // A signal through a lit LED makes it blink (it is in series on the trace).
      if (p.end === undefined) for (const led of leds) if (led.done && Math.min(was, p.pos) <= led.exit && Math.max(was, p.pos) >= led.enter && (was < led.enter || was > led.exit || p.fresh)) flash(led.el);
      p.fresh = false;
      // On the trace, the light never runs past the drawn line's head: it pours
      // into the pen, and goes once none of it is left on the drawn line (also
      // when the line retracts past it).
      const lit = p.end === undefined ? Math.min(PULSE_LEN, L - HEAD_INSET - (p.pos - PULSE_LEN / 2)) : PULSE_LEN;
      const offStart = p.dir < 0 && p.pos < 0;
      const offEnd = p.end === undefined ? lit < 0.5 : p.dir > 0 && p.pos > p.end;
      if (offStart || offEnd || (!p.held && age > p.life)) {
        dropPulse(p);
        if (offStart && p.end === undefined) flash(knot);
        else if (offEnd && p.dir > 0) {
          if (p.onEnd) p.onEnd();
          else if (arrived && board) flash(boardG!.querySelector('.site-thread__pin--in'));
          else flash(glow);
        }
        return false;
      }
      const offset = (PULSE_LEN / 2 - p.pos).toFixed(2);
      const dash = `${lit.toFixed(2)} ${p.gap}`;
      const opacity = p.held ? '1' : String(Math.max(0, 1 - (age / p.life) ** 3));
      for (const e of [p.el, ...p.halos]) {
        e.setAttribute('stroke-dashoffset', offset);
        e.setAttribute('stroke-dasharray', dash);
        e.style.opacity = opacity;
      }
      return true;
    });
  }

  /** The arrival pulse: the last stretch of the route, then on up the stub into pin 1. */
  function arrivalPulse(r: Route) {
    if (!board) return;
    const run = Math.min(ARRIVAL_RUN, r.total);
    const pts: [number, number][] = [];
    for (let l = r.total - run; l < r.total; l += r.step) pts.push(pointAt(r, l) as [number, number]);
    pts.push([r.end[0], r.end[1]], [r.end[0], board.pinBottom]);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    spawnPulse(0, 1, { d: polyline(pts), end: len, life: len / PULSE_SPEED + 0.2, onEnd: () => flash(boardG!.querySelector('.site-thread__pin--in')) });
  }

  function beginRewind(from: number, T: number): boolean {
    const p = from > 0 ? spawnPulse(from, -1, { held: true, life: Infinity }) : null;
    if (!p) return false;
    rewind = { p, from, t0: now(), T, y: window.scrollY };
    return true;
  }

  function stopRewind() {
    if (!rewind) return;
    const { p } = rewind;
    dropPulse(p);
    pulses = pulses.filter((q) => q !== p);
    rewind = null;
  }

  /**
   * One frame of the reset: the signal moves back along the trace (eased, so
   * it leaves the chip and reaches the start pad gently), the drawn line ends
   * right behind it and the page scrolls to keep it on the reading line. On a
   * horizontal wire the page holds still while the signal crosses it.
   */
  function stepRewind(t: number): boolean {
    const rw = rewind!;
    const r = route!;
    // The reader took over (scrollbar, find in page, a scroll the listeners missed): let go.
    if (Math.abs(window.scrollY - rw.y) > 2) {
      stopRewind();
      return false;
    }
    const u = Math.min(1, Math.max(0, (t - rw.t0) / rw.T));
    // On past the start, all the way into the start pad (which flashes, see updatePulses).
    rw.p.pos = rw.from - (rw.from + PULSE_LEN) * ((1 - Math.cos(Math.PI * u)) / 2);
    // The line retracts with it, down to what the top of the page shows.
    const vh = window.innerHeight;
    const rest = Math.max(r.minLen, lengthAtY(r, vh * READ_LINE - mainTop));
    shown = Math.max(rest, Math.min(rw.from, rw.p.pos + PULSE_LEN / 2 + HEAD_INSET));
    vel = 0;
    const follow = Math.max(0, Math.min(html.scrollHeight - vh, mainTop + pointAt(r, Math.max(0, rw.p.pos))[1] - vh * READ_LINE));
    // In the last stretch the page settles on the very top (the start pad can sit below the reading line).
    const k = Math.min(1, Math.max(0, (u - 0.85) / 0.15));
    window.scrollTo({ top: follow * (1 - k * k * (3 - 2 * k)), behavior: 'instant' });
    rw.y = window.scrollY;
    if (u >= 1) rewind = null;
    return true;
  }

  function resetToTop() {
    boardG!.setAttribute('data-pressed', '');
    window.setTimeout(() => boardG!.removeAttribute('data-pressed'), RESET_PRESS_MS);
    // The reset signal runs back up the trace into the start pad and the page
    // follows it (under reduced motion, or without a line, straight to the top).
    stopRewind();
    const from = Math.max(0, Math.min(route?.total ?? 0, shown));
    if (!beginRewind(from, Math.min(REWIND_MAX_S, Math.max(REWIND_MIN_S, from * REWIND_S_PER_PX)))) {
      window.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' });
    }
    // Keyboard users continue from the top of the content, not from the footer.
    if (!main!.hasAttribute('tabindex')) main!.setAttribute('tabindex', '-1');
    main!.focus({ preventScroll: true });
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
    path!.setAttribute('stroke-dasharray', `${L.toFixed(2)} ${(r.total + 10).toFixed(2)}`);
    updatePulses(t, L, arrived);
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
    // While the reset runs, its signal is the line's head.
    const showPen = started && !reduced && L > 1 && !arrived && !veiled && !rewind;
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
    // Without a chip network the line ends on a plain pad.
    endKnot!.toggleAttribute('data-on', arrived && !board);
    const reached = !started ? -Infinity : arrived ? Infinity : r.maxY[Math.min(r.count - 1, Math.floor(L / r.step))];
    setDone(nodes, reached, 4);
    setDone(inks, reached, 6);
    setDone(cards, reached, 0);
    for (const led of leds) {
      const on = started && !veiled && (arrived || L >= led.enter);
      if (on !== led.done) {
        led.done = on;
        led.el.toggleAttribute('data-thread-done', on);
      }
    }
    // The board shows once the line has reached the cards (they have revealed
    // by then), and powers on when the line arrives.
    const boardOn = !!board && started && !veiled && (arrived || cards.some((c) => c.done));
    boardG!.toggleAttribute('data-on', boardOn);
    if (resetBtn) resetBtn.toggleAttribute('hidden', !boardOn);
    if (arrived && !powered && board && !reduced && !veiled) arrivalPulse(r);
    setPowered(arrived && !veiled && !!board);
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
    // The reset places the line (and the page) itself.
    const placed = !!rewind && stepRewind(t);
    if (!placed) holdAt(target);
    if (placed) {
      // Nothing to spring.
    } else if (reduced || (t < snapUntil && scrolling)) {
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
    if (!raf && (!settled || pulses.length || capPoll || rewind)) raf = requestAnimationFrame(tick);
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
    if (speed < SWEEP_MIN_SPEED) return;
    // Both ends in the thread layer's space, with the current scroll.
    const ox = window.scrollX - mainLeft, oy = window.scrollY - mainTop;
    const x0 = prev.x + ox, y0 = prev.y + oy, x = e.clientX + ox, y = e.clientY + oy;
    // Where the movement since the last event crossed the drawn trace (a fast
    // sweep jumps right over it), exactly. Only a real crossing counts: moving
    // along a wire, or past it without touching it, sends nothing.
    const r = route;
    const pts = r.points;
    const drawn = Math.min(r.count - 1, Math.floor(shown / r.step));
    const vx = x - x0, vy = y - y0;
    let at = -1, latest = -1;
    const seen = new Set<number>();
    const cx0 = Math.floor((Math.min(x0, x) - 6) / HASH_CELL), cx1 = Math.floor((Math.max(x0, x) + 6) / HASH_CELL);
    const cy0 = Math.floor((Math.min(y0, y) - 6) / HASH_CELL), cy1 = Math.floor((Math.max(y0, y) + 6) / HASH_CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        for (const i of hash.get(cx * 100000 + cy) ?? []) {
          if (i >= drawn || seen.has(i)) continue;
          seen.add(i);
          // The trace between samples i and i + 1 against the pointer's movement.
          const ax = pts[i * 2], ay = pts[i * 2 + 1];
          const ex = pts[i * 2 + 2] - ax, ey = pts[i * 2 + 3] - ay;
          const den = vx * ey - vy * ex;
          if (Math.abs(den) < 1e-9) continue;
          const u = ((ax - x0) * ey - (ay - y0) * ex) / den; // along the movement
          const sg = ((ax - x0) * vy - (ay - y0) * vx) / den; // along the trace
          if (u < 0 || u > 1 || sg < 0 || sg > 1) continue;
          // A sweep across two wires at once: the one it crossed last.
          if (u > latest) {
            latest = u;
            at = (i + sg) * r.step;
          }
        }
      }
    }
    if (at < 0) {
      sweepNets(x0, y0, x, y, t);
      return;
    }
    // One signal per crossing (a sweep reports several events near the same spot).
    if (pulses.some((p) => p.end === undefined && !p.held && p.speed === PULSE_SPEED && Math.abs(p.from - at) < 60 && t - p.t0 < 0.25)) return;
    // The signal runs out both ways along the trace from where it was touched.
    spawnPulse(at, 1);
    spawnPulse(at, -1);
  }

  /**
   * A sweep across one of the chip's nets (powered): the signal runs out both
   * ways along it, into its card (which blinks) and into its pin (which
   * flashes). The ground and reset wires stay quiet: ground carries no
   * signal, and the reset line only changes when the switch is pressed.
   */
  function sweepNets(x0: number, y0: number, x1: number, y1: number, t: number) {
    const b = board;
    if (!b || !powered) return;
    const vx = x1 - x0, vy = y1 - y0;
    let hit: { k: number; at: number; u: number } | null = null;
    b.nets.forEach((n, k) => {
      let run = 0;
      for (let i = 1; i < n.points.length; i++) {
        const [ax, ay] = n.points[i - 1];
        const ex = n.points[i][0] - ax, ey = n.points[i][1] - ay;
        const seg = Math.hypot(ex, ey);
        const den = vx * ey - vy * ex;
        if (Math.abs(den) > 1e-9) {
          const u = ((ax - x0) * ey - (ay - y0) * ex) / den;
          const sg = ((ax - x0) * vy - (ay - y0) * vx) / den;
          if (u >= 0 && u <= 1 && sg >= 0 && sg <= 1 && (!hit || u > hit.u)) hit = { k, at: run + sg * seg, u };
        }
        run += seg;
      }
    });
    if (!hit) return;
    const { k, at } = hit as { k: number; at: number; u: number };
    if (netPulses.get(k) !== undefined && t - netPulses.get(k)! < 0.25) return;
    netPulses.set(k, t);
    const n = b.nets[k];
    const width = 1.7;
    spawnPulse(at, 1, { d: polyline(n.points), end: n.length, width, onEnd: () => flash(boardCards[n.target]) });
    spawnPulse(n.length - at, 1, { d: polyline([...n.points].reverse()), end: n.length, width, onEnd: () => flash(topPinEls[k]) });
  }
  /** When each net last sent a signal (s): one per crossing. */
  const netPulses = new Map<number, number>();

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
  // The reader scrolling during a reset takes over from it.
  for (const type of ['wheel', 'touchstart', 'keydown'] as const) window.addEventListener(type, stopRewind, { passive: true, signal });
  document.fonts?.addEventListener?.('loadingdone', scheduleRebuild, { signal });
  reduceQuery.addEventListener('change', () => {
    reduced = reduceQuery.matches;
    clearPulses();
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
    clearPulses();
    resetBtn?.remove();
    html.classList.remove('thread-on', 'thread-drawing');
  };
}
