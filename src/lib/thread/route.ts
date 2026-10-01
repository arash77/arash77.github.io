/**
 * Scroll thread: pure route builder.
 *
 * Takes a plain snapshot of the home page layout (all coordinates in the
 * thread layer's space, i.e. relative to the top-left of <main>) and returns
 * the line's geometry: SVG path data, a uniformly sampled polyline (used for
 * drawing progress, the pen, plucking and tests) and some anchors.
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
 *           spine with a half loop around each node (alternating sides). If
 *           parity would bring the line in from the left, one extra horizontal
 *           "parity row" is added in empty space beforehand (bottom of the
 *           hero, below the scroll hint), so there is never a hairpin.
 *   end   : after the last bar, down the far rail past the cards and in to an
 *           end knot centred below them.
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

export type Segment =
  | { k: 'L'; a: Pt; b: Pt }
  | { k: 'Q'; a: Pt; c: Pt; b: Pt }
  /** Circular arc around (cx, cy) from angle a0 through da radians (screen angles: +y is down, so da > 0 is clockwise). */
  | { k: 'A'; a: Pt; b: Pt; cx: number; cy: number; r: number; a0: number; da: number };

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
/** Radius of the fillets where the timeline spine meets a node loop. */
export const LOOP_FILLET = 9;

export function computeRails(width: number, containerLeft: number, containerRight: number): Rails {
  if (containerLeft >= RAIL_MIN_MARGIN && width - containerRight >= RAIL_MIN_MARGIN) {
    return { left: containerLeft - RAIL_OFFSET, right: containerRight + RAIL_OFFSET, narrow: false };
  }
  return { left: RAIL_EDGE, right: width - RAIL_EDGE, narrow: true };
}

const near = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;

/** Axis-aligned polyline with rounded (quadratic) corners, plus explicit arcs. */
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
   * Emit the buffered polyline with rounded corners. A corner may use at most
   * half of each adjacent leg (the neighbouring corner needs the other half),
   * except the final leg when `intoCurve` says a curve, not a corner, follows.
   */
  flush(intoCurve = false) {
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
      const r = Math.min(this.R, l1 / 2, intoCurve && i === b.length - 2 ? l2 : l2 / 2);
      const inPt: Pt = [p[0] - (v1x / l1) * r, p[1] - (v1y / l1) * r];
      const outPt: Pt = [p[0] + (v2x / l2) * r, p[1] + (v2y / l2) * r];
      if (!near(cur, inPt)) this.segments.push({ k: 'L', a: cur, b: inPt });
      this.segments.push({ k: 'Q', a: inPt, c: p, b: outPt });
      cur = outPt;
    }
    this.buf = [cur];
  }

  /** Arc of the circle around (cx, cy) from the current point (which must lie on it) through `da` radians. */
  arc(cx: number, cy: number, r: number, da: number) {
    const a = this.current;
    const a0 = Math.atan2(a[1] - cy, a[0] - cx);
    const b: Pt = [cx + r * Math.cos(a0 + da), cy + r * Math.sin(a0 + da)];
    this.segments.push({ k: 'A', a, b, cx, cy, r, a0, da });
    this.buf = [b];
  }

  /**
   * Loop around a timeline node centred on the spine (the current x). The
   * line leaves the spine tangentially through a small fillet of radius `rf`,
   * follows the node's circle (radius `rn`) on side `dir` (-1 left, 1 right)
   * and returns to the spine through a mirrored fillet, so there is no kink
   * where the spine meets the loop. Starts at the fillet top `cy - loopReach`.
   */
  nodeLoop(cy: number, rn: number, rf: number, dir: -1 | 1) {
    this.flush(true);
    const s = this.current[0];
    const h = loopReach(rn, rf);
    const fx = s + dir * rf;
    // Tangency points between the fillets and the loop circle lie on the lines
    // joining their centres, at distance rn from the node centre.
    const k = rn / (rn + rf);
    const tx = s + dir * rf * k;
    const topY = cy - h * k, botY = cy + h * k;
    const ang = (px: number, py: number, cx: number, cy2: number) => Math.atan2(py - cy2, px - cx);
    const signed = (da: number, sign: number) => (sign > 0 && da < 0 ? da + 2 * Math.PI : sign < 0 && da > 0 ? da - 2 * Math.PI : da);
    // Screen angles (+y down): da > 0 turns clockwise. A right loop bends out
    // anticlockwise, goes round clockwise and bends back anticlockwise.
    this.arc(fx, cy - h, rf, signed(ang(tx, topY, fx, cy - h) - ang(s, cy - h, fx, cy - h), -dir));
    this.arc(s, cy, rn, signed(ang(tx, botY, s, cy) - ang(tx, topY, s, cy), dir));
    this.arc(fx, cy + h, rf, signed(ang(s, cy + h, fx, cy + h) - ang(tx, botY, fx, cy + h), -dir));
    // Land exactly on the spine (no float drift).
    const end: Pt = [s, cy + h];
    const last = this.segments[this.segments.length - 1];
    if (last.k === 'A') last.b = end;
    this.buf = [end];
  }
}

/** How far above / below the node centre a fillet loop leaves / rejoins the spine. */
export function loopReach(rn: number, rf: number): number {
  return Math.sqrt(rn * rn + 2 * rn * rf);
}

const f = (v: number) => (Math.round(v * 100) / 100).toString();

export function segmentsToD(start: Pt, segments: Segment[]): string {
  let d = `M${f(start[0])},${f(start[1])}`;
  for (const s of segments) {
    if (s.k === 'L') d += ` L${f(s.b[0])},${f(s.b[1])}`;
    else if (s.k === 'Q') d += ` Q${f(s.c[0])},${f(s.c[1])} ${f(s.b[0])},${f(s.b[1])}`;
    else d += ` A${f(s.r)},${f(s.r)} 0 ${Math.abs(s.da) > Math.PI ? 1 : 0} ${s.da > 0 ? 1 : 0} ${f(s.b[0])},${f(s.b[1])}`;
  }
  return d;
}

/** Dense polyline approximation of the segments (lines exact, curves subdivided). */
function flatten(start: Pt, segments: Segment[]): number[] {
  const out: number[] = [start[0], start[1]];
  for (const s of segments) {
    if (s.k === 'L') {
      out.push(s.b[0], s.b[1]);
    } else if (s.k === 'Q') {
      const n = 16;
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        out.push(u * u * s.a[0] + 2 * u * t * s.c[0] + t * t * s.b[0], u * u * s.a[1] + 2 * u * t * s.c[1] + t * t * s.b[1]);
      }
    } else {
      const n = Math.max(4, Math.ceil((Math.abs(s.da) * s.r) / 2));
      for (let i = 1; i <= n; i++) {
        const th = s.a0 + s.da * (i / n);
        out.push(s.cx + s.r * Math.cos(th), s.cy + s.r * Math.sin(th));
      }
    }
  }
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
      const rn = list[0].w / 2 + 9;
      // Fillet radius: as round as the corners allow, but small enough that the
      // corner from the bar row into the spine keeps the full radius R.
      const room = list[0].y + list[0].h / 2 - y - R;
      const rf = Math.max(3, Math.min(R, LOOP_FILLET, (room * room - rn * rn) / (2 * rn)));
      const reach = loopReach(rn, rf);
      pb.to([curX, y]);
      pb.to([spine, y]);
      let loops = 0;
      list.forEach((n) => {
        const cy = n.y + n.h / 2;
        if (pb.current[1] > cy - reach + 0.01) return; // overlapping nodes: skip the loop
        pb.to([spine, cy - reach]);
        // Alternate sides, starting on the left: the bar row comes in from the
        // right, so the first loop continues the turn as an S, not a hook.
        pb.nodeLoop(cy, rn, rf, loops % 2 === 0 ? -1 : 1);
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
    const ey = Math.min(last.cards.y + last.cards.h + 44, last.bottom - 16);
    end = [last.cards.x + last.cards.w / 2, ey];
  } else {
    end = [s.width / 2, Math.min(last.bar.y + 60, last.bottom - 16)];
  }
  pb.to([curX, end[1]]);
  pb.to(end);
  pb.flush();

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
