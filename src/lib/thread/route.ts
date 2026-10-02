/**
 * Scroll thread: pure route builder.
 *
 * Takes a plain snapshot of the home page layout (all coordinates in the
 * thread layer's space, i.e. relative to the top-left of <main>) and returns
 * the line's geometry: SVG path data, a uniformly sampled polyline (used for
 * drawing progress, the pen, signal pulses and tests) and some anchors.
 *
 * The line is drawn like a circuit-board trace: straight runs, 45° chamfers
 * at the corners and 45° jogs around the timeline nodes.
 *
 * No DOM access here, so the geometry can be unit-tested on synthetic layouts.
 *
 * Route shape:
 *   hero  : start knot left of the tag pills, straight through them ("beads")
 *           to the right rail. On phones (or when the tags wrap) it starts
 *           beside the avatar and runs out to the left rail instead.
 *   bars  : every section heading bar is crossed horizontally on its own row,
 *           rail to rail; between bars the line runs down the rail it left on.
 *   spine : a section with visible timeline nodes is entered from the right,
 *           the crossing continues to the spine, then the line runs down the
 *           spine with a 45° jog around each node (alternating sides). If
 *           parity would bring the line in from the left, one extra horizontal
 *           "parity row" is added in empty space beforehand (bottom of the
 *           hero, below the scroll hint), so there is never a hairpin.
 *   end   : after the last bar, down the far rail past the cards and in to the
 *           end point centred below them, where the chip network takes over
 *           (see board.ts), leaving room above it for the network's wiring.
 */

export type Pt = readonly [number, number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Rails {
  left: number;
  right: number;
  /** No real side margin: rails hug the viewport edges, tighter corners, thinner stroke. */
  narrow: boolean;
}

export interface SectionLayout {
  /** Section box top / bottom. */
  top: number;
  bottom: number;
  /** The gradient bar under the section heading. */
  bar: Rect;
  /** Visible timeline nodes, top to bottom (empty or absent when the timeline is hidden). */
  nodes?: Rect[];
  /** Bounding box of the section's stitched cards (contact cards). */
  cards?: Rect | null;
}

export interface HeroLayout {
  top: number;
  bottom: number;
  /** Bounding box of the tag pills when they sit on one row, otherwise null. */
  tags: Rect | null;
  avatar: Rect | null;
  scrollHint: Rect | null;
}

export interface LayoutSnapshot {
  /** Viewport (client) width: the route must stay inside [0, width]. */
  width: number;
  rails: Rails;
  /** Below Tailwind's `sm` (40rem): start beside the avatar instead of through the tags. */
  phone: boolean;
  hero: HeroLayout;
  sections: SectionLayout[];
}

export type Segment = { k: 'L'; a: Pt; b: Pt };

export interface NodeAnchor {
  x: number;
  y: number;
  r: number;
}

export interface Route {
  d: string;
  segments: Segment[];
  /** Sampled polyline, x/y interleaved, one point every `step` px of length. */
  points: Float32Array;
  /** Running maximum y of the sampled points (for "how far has the reader got"). */
  maxY: Float32Array;
  count: number;
  step: number;
  /** Length of the sampled polyline (== (count - 1) * step, last step may be shorter). */
  total: number;
  start: Pt;
  end: Pt;
  /** Direction of the final horizontal run into `end`: 1 heading right, -1 heading left. */
  endDir: 1 | -1;
  nodes: NodeAnchor[];
  /** Length of the hero "beads" run, drawn as soon as the hero intro finishes. */
  minLen: number;
  /** Rails hug the viewport edges (no side margin). */
  narrow: boolean;
  strokeWidth: number;
  radius: number;
  /** y of the crossing row of each section bar, in order. */
  barRows: number[];
  /** y of the parity row when one was needed. */
  parityRow: number | null;
}

/** Margin the widest container must leave before the rails move outside it. */
export const RAIL_MIN_MARGIN = 40;
/** Distance of the rails from the container edge (wide) or the viewport edge (narrow). */
export const RAIL_OFFSET = 14;
export const RAIL_EDGE = 7;
/** Room the end point leaves below the cards for the chip network's wiring (see board.ts). */
export const END_GAP = 108;

export function computeRails(width: number, containerLeft: number, containerRight: number): Rails {
  if (containerLeft >= RAIL_MIN_MARGIN && width - containerRight >= RAIL_MIN_MARGIN) {
    return { left: containerLeft - RAIL_OFFSET, right: containerRight + RAIL_OFFSET, narrow: false };
  }
  return { left: RAIL_EDGE, right: width - RAIL_EDGE, narrow: true };
}

const near = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;

/** Axis-aligned polyline with 45° chamfered corners (circuit-board style). */
class PathBuilder {
  segments: Segment[] = [];
  private buf: Pt[] = [];

  constructor(private readonly R: number) {}

  start(p: Pt) {
    this.buf = [p];
  }

  get current(): Pt {
    return this.buf[this.buf.length - 1];
  }

  to(p: Pt) {
    const b = this.buf;
    const last = b[b.length - 1];
    if (near(last, p)) return;
    // Merge collinear continuations so no zero-angle "corner" is emitted.
    if (b.length >= 2) {
      const prev = b[b.length - 2];
      const cross = (last[0] - prev[0]) * (p[1] - last[1]) - (last[1] - prev[1]) * (p[0] - last[0]);
      const dot = (last[0] - prev[0]) * (p[0] - last[0]) + (last[1] - prev[1]) * (p[1] - last[1]);
      if (Math.abs(cross) < 0.01 && dot > 0) {
        b[b.length - 1] = p;
        return;
      }
    }
    b.push(p);
  }

  /**
   * Emit the buffered polyline with chamfered corners: each corner is cut by a
   * straight segment from `r` before the vertex to `r` after it (45° for a
   * right angle). A corner may use at most half of each adjacent leg (the
   * neighbouring corner needs the other half).
   */
  flush() {
    const b = this.buf;
    let cur = b[0];
    for (let i = 1; i < b.length; i++) {
      const p = b[i];
      const next = b[i + 1];
      if (!next) {
        if (!near(cur, p)) this.segments.push({ k: 'L', a: cur, b: p });
        cur = p;
        break;
      }
      const prev = b[i - 1];
      const v1x = p[0] - prev[0], v1y = p[1] - prev[1];
      const v2x = next[0] - p[0], v2y = next[1] - p[1];
      const l1 = Math.hypot(v1x, v1y) || 1, l2 = Math.hypot(v2x, v2y) || 1;
      const r = Math.min(this.R, l1 / 2, l2 / 2);
      const inPt: Pt = [p[0] - (v1x / l1) * r, p[1] - (v1y / l1) * r];
      const outPt: Pt = [p[0] + (v2x / l2) * r, p[1] + (v2y / l2) * r];
      if (!near(cur, inPt)) this.segments.push({ k: 'L', a: cur, b: inPt });
      this.segments.push({ k: 'L', a: inPt, b: outPt });
      cur = outPt;
    }
    this.buf = [cur];
  }

  /**
   * Jog around a timeline node on the spine `s`, like a trace routed around a
   * via: 45° out to `rn` beside the spine on side `dir` (-1 left, 1 right),
   * straight down past the node, 45° back onto the spine. Starts at
   * `cy - loopReach(rn)` on the spine (or, with `fromSide`, already on the
   * jog's outer line, reached by the buffered polyline) and lands at
   * `cy + loopReach(rn)` on the spine.
   */
  nodeJog(s: number, cy: number, rn: number, dir: -1 | 1, fromSide = false) {
    const h = loopReach(rn);
    if (fromSide) this.to([s + dir * rn, cy + h - rn]);
    this.flush();
    const pts: Pt[] = fromSide ? [[s, cy + h]] : [[s + dir * rn, cy - h + rn], [s + dir * rn, cy + h - rn], [s, cy + h]];
    let cur = this.current;
    for (const p of pts) {
      this.segments.push({ k: 'L', a: cur, b: p });
      cur = p;
    }
    this.buf = [cur];
  }
}

/**
 * How far above / below the node centre a jog leaves / rejoins the spine. `rn`
 * is the jog's offset from the spine (the node's radius + 9, as little as + 5
 * by an edge rail); the 45° legs then pass 8px (4px) clear of the node (their
 * distance from its centre is h / √2).
 */
export function loopReach(rn: number): number {
  return Math.SQRT2 * (rn - 1);
}

const f = (v: number) => (Math.round(v * 100) / 100).toString();

export function segmentsToD(start: Pt, segments: Segment[]): string {
  let d = `M${f(start[0])},${f(start[1])}`;
  for (const sg of segments) d += ` L${f(sg.b[0])},${f(sg.b[1])}`;
  return d;
}

/** The segments as one polyline (they are all straight). */
function flatten(start: Pt, segments: Segment[]): number[] {
  const out: number[] = [start[0], start[1]];
  for (const sg of segments) out.push(sg.b[0], sg.b[1]);
  return out;
}

/** Resample a polyline uniformly by arc length. */
export function resample(flat: number[], step: number) {
  const segs = flat.length / 2 - 1;
  let length = 0;
  for (let i = 0; i < segs; i++) length += Math.hypot(flat[i * 2 + 2] - flat[i * 2], flat[i * 2 + 3] - flat[i * 2 + 1]);
  const count = Math.max(2, Math.ceil(length / step) + 1);
  const points = new Float32Array(count * 2);
  let seg = 0, segStart = 0;
  let segLen = segs > 0 ? Math.hypot(flat[2] - flat[0], flat[3] - flat[1]) : 0;
  for (let k = 0; k < count; k++) {
    const target = Math.min(length, k * step);
    while (seg < segs - 1 && segStart + segLen < target) {
      segStart += segLen;
      seg++;
      segLen = Math.hypot(flat[seg * 2 + 2] - flat[seg * 2], flat[seg * 2 + 3] - flat[seg * 2 + 1]);
    }
    const t = segLen > 0 ? Math.min(1, Math.max(0, (target - segStart) / segLen)) : 0;
    points[k * 2] = flat[seg * 2] + (flat[seg * 2 + 2] - flat[seg * 2]) * t;
    points[k * 2 + 1] = flat[seg * 2 + 1] + (flat[seg * 2 + 3] - flat[seg * 2 + 1]) * t;
  }
  // Pin the last sample to the exact end point.
  points[(count - 1) * 2] = flat[flat.length - 2];
  points[(count - 1) * 2 + 1] = flat[flat.length - 1];
  const maxY = new Float32Array(count);
  let m = -Infinity;
  for (let k = 0; k < count; k++) {
    m = Math.max(m, points[k * 2 + 1]);
    maxY[k] = m;
  }
  return { points, maxY, count, total: length };
}

type Side = 'L' | 'R';
const other = (s: Side): Side => (s === 'L' ? 'R' : 'L');
const hasTimeline = (s: SectionLayout) => !!s.nodes && s.nodes.length > 0;

export function buildRoute(s: LayoutSnapshot, step = 3): Route | null {
  if (!s.sections.length) return null;
  const { left: L, right: Rr, narrow } = s.rails;
  const R = narrow ? 9 : 18;
  const X = (sd: Side) => (sd === 'L' ? L : Rr);
  const pb = new PathBuilder(R);

  let side: Side;
  let start: Pt;
  let minLen = 0;
  const tags = s.phone ? null : s.hero.tags;
  if (tags) {
    const y = tags.y + tags.h / 2;
    start = [Math.max(L + 2, tags.x - 24), y];
    pb.start(start);
    pb.to([Rr, y]);
    side = 'R';
    minLen = Math.max(0, Rr - R - start[0]);
  } else if (s.hero.avatar) {
    const av = s.hero.avatar;
    start = [Math.max(L + 2 * R, av.x - 14), av.y + av.h / 2];
    pb.start(start);
    pb.to([L, start[1]]);
    side = 'L';
  } else {
    start = [L, s.hero.top + (s.hero.bottom - s.hero.top) / 2];
    pb.start(start);
    side = 'L';
  }
  let curX = X(side);

  // Parity: a timeline must be entered from the right. Simulate the sides and,
  // if the first timeline would be entered from the left, flip once at the
  // bottom of the hero (below the scroll hint) where the row is empty.
  let parityRow: number | null = null;
  {
    let sim = side;
    for (const sec of s.sections) {
      if (hasTimeline(sec)) {
        if (sim === 'L') {
          const hint = s.hero.scrollHint;
          let y = s.hero.bottom - 16;
          if (hint) y = Math.max(y, Math.min(hint.y + hint.h + 10, s.hero.bottom - 6));
          parityRow = y;
        }
        break;
      }
      sim = other(sim);
    }
  }
  if (parityRow !== null) {
    pb.to([curX, parityRow]);
    side = other(side);
    curX = X(side);
    pb.to([curX, parityRow]);
  }

  const nodes: NodeAnchor[] = [];
  const barRows: number[] = [];
  for (const sec of s.sections) {
    const y = sec.bar.y + sec.bar.h / 2;
    barRows.push(y);
    if (hasTimeline(sec)) {
      if (side === 'L') {
        // A later timeline with the wrong parity: flip in the section's top padding.
        const py = sec.top + Math.min(24, Math.max(8, (sec.bar.y - sec.top) / 4));
        pb.to([curX, py]);
        side = 'R';
        curX = Rr;
        pb.to([curX, py]);
        if (parityRow === null) parityRow = py;
      }
      const list = sec.nodes!;
      const spine = list[0].x + list[0].w / 2;
      // The jogs' outer line keeps to the rail, where the pen and its glow fit
      // (a small browser font shrinks the node and the padding, not the 9px),
      // but its legs never pass closer than 4px to the node.
      const rn = Math.max(list[0].w / 2 + 5, Math.min(list[0].w / 2 + 9, spine - L));
      const reach = loopReach(rn);
      pb.to([curX, y]);
      // Alternate sides, starting on the left. The bar row comes in from the
      // right, so it runs straight on to the first jog's outer line and drops
      // past the first node there (the first node sits too close below the
      // row for a corner onto the spine and a 45° jog out again).
      const first = list[0];
      const firstCy = first.y + first.h / 2;
      const direct = firstCy + reach - rn - y > 2 * R;
      pb.to([direct ? spine - rn : spine, y]);
      let loops = 0;
      list.forEach((n, k) => {
        const cy = n.y + n.h / 2;
        const dir: -1 | 1 = loops % 2 === 0 ? -1 : 1;
        if (k === 0 && direct) {
          pb.nodeJog(spine, cy, rn, dir, true);
        } else {
          if (pb.current[1] > cy - reach + 0.01) return; // overlapping nodes: skip the jog
          pb.to([spine, cy - reach]);
          pb.nodeJog(spine, cy, rn, dir);
        }
        loops++;
        nodes.push({ x: spine, y: cy, r: rn });
      });
      side = 'L';
      curX = spine;
    } else {
      pb.to([curX, y]);
      side = other(side);
      curX = X(side);
      pb.to([curX, y]);
    }
  }

  const last = s.sections[s.sections.length - 1];
  let end: Pt;
  if (last.cards) {
    const ey = Math.min(last.cards.y + last.cards.h + END_GAP, last.bottom - 16);
    end = [last.cards.x + last.cards.w / 2, ey];
  } else {
    end = [s.width / 2, Math.min(last.bar.y + 60, last.bottom - 16)];
  }
  pb.to([curX, end[1]]);
  pb.to(end);
  pb.flush();
  const endDir: 1 | -1 = end[0] >= curX ? 1 : -1;

  const segments = pb.segments;
  const flat = flatten(start, segments);
  const { points, maxY, count, total } = resample(flat, step);
  return {
    d: segmentsToD(start, segments),
    segments,
    points,
    maxY,
    count,
    step,
    total,
    start,
    end,
    endDir,
    nodes,
    minLen: Math.min(minLen, total),
    narrow,
    strokeWidth: narrow ? 1.75 : 2.25,
    radius: R,
    barRows,
    parityRow,
  };
}

/** Length along the route at which the running max y first reaches `y`. */
export function lengthAtY(route: Route, y: number): number {
  const { maxY, count, step, total } = route;
  if (maxY[count - 1] < y) return total;
  let lo = 0, hi = count - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (maxY[m] < y) lo = m + 1;
    else hi = m;
  }
  return Math.min(total, lo * step);
}

/** Point on the sampled route at length `len`. */
export function pointAt(route: Route, len: number): Pt {
  const { points, count, step, total } = route;
  const l = Math.max(0, Math.min(total, len));
  const i = Math.min(count - 2, Math.floor(l / step));
  // Every interval is `step` long except the last, which takes the remainder.
  const span = i === count - 2 ? Math.max(1e-6, total - i * step) : step;
  const t = Math.min(1, (l - i * step) / span);
  return [points[i * 2] + (points[i * 2 + 2] - points[i * 2]) * t, points[i * 2 + 1] + (points[i * 2 + 3] - points[i * 2 + 1]) * t];
}

/** Piecewise-linear map of a y between two monotonic anchor lists of the same length. */
function remapY(y: number, from: number[], to: number[]): number {
  if (from.length !== to.length || from.length < 2) return y;
  if (y <= from[0]) return to[0] + (y - from[0]);
  for (let j = 0; j < from.length - 1; j++) {
    if (y <= from[j + 1]) {
      const span = from[j + 1] - from[j];
      const t = span > 0 ? (y - from[j]) / span : 0;
      return to[j] + t * (to[j + 1] - to[j]);
    }
  }
  return to[to.length - 1] + (y - from[from.length - 1]);
}

/**
 * Where drawn length `len` on `prev` lands on `next` (the same page after a
 * resize or reflow): the same place in the content, not the same number. The
 * reading height is mapped section by section through the bar rows, and a
 * position part-way along a horizontal run keeps its fraction of that run.
 */
export function carryOver(prev: Route, next: Route, len: number): number {
  if (len <= 0) return 0;
  if (len >= prev.total - 0.5) return next.total;
  if (prev.minLen > 0 && len < prev.minLen) return (len / prev.minLen) * next.minLen;
  const i = Math.min(prev.count - 1, Math.floor(len / prev.step));
  const y = prev.maxY[i];
  const p0 = lengthAtY(prev, y - 0.25), p1 = lengthAtY(prev, y + 0.25);
  const frac = p1 - p0 > 2 * prev.step ? Math.max(0, Math.min(1, (len - p0) / (p1 - p0))) : 0;
  const anchors = (r: Route) => [r.start[1], ...r.barRows, r.end[1]];
  const ny = remapY(y, anchors(prev), anchors(next));
  const n0 = lengthAtY(next, ny - 0.25), n1 = lengthAtY(next, ny + 0.25);
  const n = n1 - n0 > 2 * next.step ? n0 + frac * (n1 - n0) : n0;
  return Math.max(next.minLen, Math.min(next.total, n));
}
