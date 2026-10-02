import { describe, it, expect } from 'vitest';
import { buildBoard, type Board } from '@/lib/thread/board';
import {
  buildRoute,
  carryOver,
  computeRails,
  lengthAtY,
  loopReach,
  pointAt,
  type LayoutSnapshot,
  type Rect,
  type Route,
  type SectionLayout,
} from '@/lib/thread/route';

/**
 * Synthetic layouts that mirror the real home page structure: a hero with the
 * avatar and tag pills, then sections with a centred heading block ending in
 * the gradient bar, a timeline section and a contact section with cards.
 * `obstacles` are the text / card / button boxes the route must never enter
 * (except along a bar row, and through the tag pills on the beads row).
 */
interface Fixture {
  snap: LayoutSnapshot;
  obstacles: Rect[];
  /** Round obstacles (timeline nodes are `rounded-full`). */
  circles: { x: number; y: number; r: number }[];
  tags: Rect | null;
  /** The contact cards, one by one. */
  cards: Rect[];
}

const container = (width: number, max: number) => {
  const w = Math.min(width, max);
  const left = (width - w) / 2;
  return { left, right: left + w, cl: left + 16, cr: left + w - 16 };
};

interface SectionSpec {
  kind: 'plain' | 'timeline' | 'contact';
  max: number;
}

const REAL_ORDER: SectionSpec[] = [
  { kind: 'plain', max: 1152 }, // About
  { kind: 'plain', max: 1152 }, // Skills
  { kind: 'timeline', max: 1024 }, // Experience
  { kind: 'plain', max: 896 }, // Education
  { kind: 'contact', max: 1024 }, // Contact
];

function makeLayout(width: number, order: SectionSpec[] = REAL_ORDER): Fixture {
  const phone = width < 640;
  const lg = width >= 1024;
  const vh = 900;
  const c6 = container(width, 1152);
  const obstacles: Rect[] = [];
  const circles: Fixture['circles'] = [];
  const contactCards: Rect[] = [];
  const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

  // Hero
  const heroBottom = phone ? 1150 : vh;
  let avatar: Rect;
  let tagsRect: Rect;
  if (lg) {
    avatar = rect(c6.cl, vh / 2 - 112, 224, 224);
    const tx = c6.cl + 224 + 80;
    obstacles.push(rect(tx, 300, 360, 20)); // hello
    obstacles.push(rect(tx, 330, Math.min(620, c6.cr - tx), 72)); // name
    obstacles.push(rect(tx, 420, Math.min(560, c6.cr - tx), 64)); // subtitle
    tagsRect = rect(tx, 508, 410, 26);
    obstacles.push(rect(tx, 566, 420, 44)); // buttons
  } else {
    const size = 176;
    avatar = rect(width / 2 - size / 2, phone ? 160 : 180, size, size);
    obstacles.push(rect(width / 2 - 70, avatar.y + size + 48, 140, 20));
    obstacles.push(rect(c6.cl, avatar.y + size + 80, c6.cr - c6.cl, phone ? 100 : 48));
    obstacles.push(rect(c6.cl, avatar.y + size + (phone ? 200 : 150), c6.cr - c6.cl, 56));
    const tw = Math.min(410, c6.cr - c6.cl);
    tagsRect = rect(width / 2 - tw / 2, avatar.y + size + (phone ? 280 : 230), tw, phone ? 60 : 26);
    obstacles.push(rect(c6.cl, tagsRect.y + tagsRect.h + 32, c6.cr - c6.cl, phone ? 150 : 44));
  }
  obstacles.push(avatar);
  const scrollHint = phone ? null : rect(width / 2 - 20, heroBottom - 32 - 60, 40, 60);
  if (scrollHint) obstacles.push(scrollHint);
  // Tag pills are obstacles too, except along the beads row (checked separately).
  obstacles.push(tagsRect);

  const sections: SectionLayout[] = [];
  let y = heroBottom;
  for (const spec of order) {
    const c = container(width, spec.max);
    const top = y;
    const padTop = spec.kind === 'contact' ? 96 : 48;
    const headTop = top + padTop;
    obstacles.push(rect(width / 2 - 110, headTop, 220, 20)); // eyebrow
    obstacles.push(rect(width / 2 - 120, headTop + 28, 240, 40)); // h2
    const bar = rect(width / 2 - 32, headTop + 84, 64, 4);
    let cy = bar.y + bar.h + 32;
    const sec: SectionLayout = { top, bottom: 0, bar };
    if (spec.kind === 'contact') {
      obstacles.push(rect(Math.max(c.cl, width / 2 - 288), bar.y + 28, Math.min(576, c.cr - c.cl), 56)); // lede
      cy = bar.y + 4 + 24 + 56 + 64;
      const cols = phone ? 1 : 2;
      const cw = (c.cr - c.cl - (cols - 1) * 16) / cols;
      const cards: Rect[] = [];
      for (let i = 0; i < 4; i++) {
        const r = rect(c.cl + (i % cols) * (cw + 16), cy + Math.floor(i / cols) * (82 + 16), cw, 82);
        cards.push(r);
        contactCards.push(r);
        obstacles.push(r);
      }
      const bottomCard = cards[cards.length - 1];
      sec.cards = rect(c.cl, cy, c.cr - c.cl, bottomCard.y + bottomCard.h - cy);
      sec.bottom = bottomCard.y + bottomCard.h + 40 + 96;
    } else if (spec.kind === 'timeline') {
      const nodes: Rect[] = [];
      for (let i = 0; i < 4; i++) {
        const itemH = phone ? 220 : 150;
        if (!phone) nodes.push(rect(c.cl, cy, 48, 48));
        const textX = phone ? c.cl : c.cl + 72;
        obstacles.push(rect(textX, cy + 4, c.cr - textX, itemH - 8));
        cy += itemH + 32;
      }
      for (const n of nodes) circles.push({ x: n.x + n.w / 2, y: n.y + n.h / 2, r: n.w / 2 });
      sec.nodes = nodes;
      sec.bottom = cy - 32 + 48;
    } else {
      obstacles.push(rect(c.cl, cy, c.cr - c.cl, 320));
      sec.bottom = cy + 320 + 48;
    }
    sections.push(sec);
    y = sec.bottom;
  }

  const snap: LayoutSnapshot = {
    width,
    rails: computeRails(width, c6.left, c6.right),
    phone,
    hero: { top: 0, bottom: heroBottom, tags: phone ? null : tagsRect, avatar, scrollHint },
    sections,
  };
  return { snap, obstacles, circles, tags: phone ? null : tagsRect, cards: contactCards };
}

const inside = (r: Rect, x: number, y: number, pad = 1.5) =>
  x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;

function horizontalRuns(route: Route) {
  return route.segments
    .filter((s) => s.k === 'L' && Math.abs(s.a[1] - s.b[1]) < 0.01 && Math.abs(s.a[0] - s.b[0]) > 1)
    .map((s) => ({ y: s.a[1], x0: Math.min(s.a[0], s.b[0]), x1: Math.max(s.a[0], s.b[0]), dir: Math.sign(s.b[0] - s.a[0]) }));
}

function checkInvariants(fx: Fixture) {
  const route = buildRoute(fx.snap)!;
  expect(route).not.toBeNull();
  const { points, count } = route;
  const W = fx.snap.width;

  // 1. Inside the viewport, with room for the stroke.
  for (let i = 0; i < count; i++) {
    const x = points[i * 2];
    expect(x).toBeGreaterThanOrEqual(route.strokeWidth);
    expect(x).toBeLessThanOrEqual(W - route.strokeWidth);
  }

  // 2. Never inside a content box, except along a bar row or the beads row.
  const tagsRow = fx.tags ? fx.tags.y + fx.tags.h / 2 : null;
  for (let i = 0; i < count; i++) {
    const x = points[i * 2], y = points[i * 2 + 1];
    if (route.barRows.some((r) => Math.abs(r - y) < 0.5)) continue;
    if (tagsRow !== null && Math.abs(y - tagsRow) < 0.5 && inside(fx.tags!, x, y, 2)) continue;
    for (const o of fx.obstacles) {
      if (inside(o, x, y)) throw new Error(`route point (${x.toFixed(1)}, ${y.toFixed(1)}) inside box ${JSON.stringify(o)}`);
    }
    for (const c of fx.circles) {
      if (Math.hypot(x - c.x, y - c.y) < c.r + 4) throw new Error(`route point (${x.toFixed(1)}, ${y.toFixed(1)}) too close to node ${JSON.stringify(c)}`);
    }
  }

  // 3. No hairpins: no two horizontal runs closer than 30px that overlap in x.
  const runs = horizontalRuns(route);
  for (let a = 0; a < runs.length; a++) {
    for (let b = a + 1; b < runs.length; b++) {
      const A = runs[a], B = runs[b];
      const overlap = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
      if (Math.abs(A.y - B.y) < 30 && Math.abs(A.y - B.y) > 0.01 && overlap > 0) {
        throw new Error(`hairpin between rows ${A.y} and ${B.y}`);
      }
    }
  }

  // 4. Every bar is crossed on its row, through the bar.
  fx.snap.sections.forEach((sec) => {
    const row = sec.bar.y + sec.bar.h / 2;
    const run = runs.find((r) => Math.abs(r.y - row) < 0.01);
    expect(run, `crossing on bar row ${row}`).toBeTruthy();
    expect(run!.x0).toBeLessThanOrEqual(sec.bar.x);
    expect(run!.x1).toBeGreaterThanOrEqual(sec.bar.x + sec.bar.w);
  });

  // 5. Ends at the end point, centred below the cards (with room for the chip network) and above the section end.
  const last = [points[(count - 1) * 2], points[(count - 1) * 2 + 1]];
  expect(last[0]).toBeCloseTo(route.end[0], 3);
  expect(last[1]).toBeCloseTo(route.end[1], 3);
  const contact = fx.snap.sections[fx.snap.sections.length - 1];
  if (contact.cards) {
    expect(route.end[0]).toBeCloseTo(contact.cards.x + contact.cards.w / 2, 3);
    expect(route.end[1]).toBeGreaterThan(contact.cards.y + contact.cards.h + 16);
    expect(route.end[1]).toBeLessThan(contact.bottom);
  }

  // 6. y never goes backwards (the pen follows the reading position).
  for (let i = 1; i < count; i++) expect(points[i * 2 + 1]).toBeGreaterThanOrEqual(points[i * 2 - 1] - 0.01);

  return { route, runs };
}

function checkTimeline(fx: Fixture, route: Route, runs: ReturnType<typeof horizontalRuns>) {
  const sec = fx.snap.sections.find((s) => s.nodes && s.nodes.length)!;
  const row = sec.bar.y + sec.bar.h / 2;
  const run = runs.find((r) => Math.abs(r.y - row) < 0.01)!;
  const spine = sec.nodes![0].x + sec.nodes![0].w / 2;
  const rn = sec.nodes![0].w / 2 + 9;
  const reach = loopReach(rn);
  // Entered from the right, running straight on to the first jog's outer line (left of the spine).
  expect(run.dir).toBe(-1);
  expect(run.x0).toBeGreaterThan(spine - rn);
  expect(run.x0).toBeLessThanOrEqual(spine - rn + route.radius + 0.01);
  // Down the spine: every point from the bar row to the last node stays on the spine or its jogs.
  const lastNode = sec.nodes![sec.nodes!.length - 1];
  const yEnd = lastNode.y + lastNode.h / 2 + reach;
  for (let i = 0; i < route.count; i++) {
    const x = route.points[i * 2], y = route.points[i * 2 + 1];
    if (y > row + route.radius + 1 && y < yEnd) {
      expect(Math.abs(x - spine)).toBeLessThanOrEqual(rn + 0.5);
    }
  }
  // One jog per node: a vertical run rn beside the spine, level with the node, on alternating sides
  // (first one on the left). Only within the timeline: at narrow widths a rail elsewhere shares the x.
  const verticals = route.segments.filter(
    (s) => Math.abs(s.a[0] - s.b[0]) < 0.01 && Math.abs(Math.abs(s.a[0] - spine) - rn) < 0.01 && Math.min(s.a[1], s.b[1]) >= row - 0.01 && Math.max(s.a[1], s.b[1]) <= yEnd,
  );
  expect(verticals).toHaveLength(sec.nodes!.length);
  verticals.forEach((v, i) => {
    const n = sec.nodes![i];
    const cy = n.y + n.h / 2;
    expect(Math.sign(v.a[0] - spine)).toBe(i % 2 === 0 ? -1 : 1);
    expect(Math.min(v.a[1], v.b[1])).toBeLessThan(cy);
    expect(Math.max(v.a[1], v.b[1])).toBeGreaterThan(cy);
  });
  // Every jog lands back on the spine below its node with a 45° leg.
  sec.nodes!.forEach((n) => {
    const cy = n.y + n.h / 2;
    const leg = route.segments.find((s) => Math.abs(s.b[0] - spine) < 0.01 && Math.abs(s.b[1] - (cy + reach)) < 0.01);
    expect(leg, `jog back onto the spine below the node at ${cy}`).toBeTruthy();
    expect(Math.abs(leg!.b[0] - leg!.a[0])).toBeCloseTo(Math.abs(leg!.b[1] - leg!.a[1]), 3);
  });
  expect(route.nodes.map((n) => n.y)).toEqual(sec.nodes!.map((n) => n.y + n.h / 2));
}

/**
 * Sharpest turn of the sampled polyline. A circuit trace only ever turns by
 * 45° at a time (chamfered corners, 45° jogs): a hard 90° join would show up
 * as a single turn of 90°.
 */
function maxTurn(route: Route): { deg: number; at: [number, number] } {
  const P = route.points;
  let worst = { deg: 0, at: [0, 0] as [number, number] };
  for (let i = 1; i < route.count - 1; i++) {
    const ax = P[i * 2] - P[i * 2 - 2], ay = P[i * 2 + 1] - P[i * 2 - 1];
    const bx = P[i * 2 + 2] - P[i * 2], by = P[i * 2 + 3] - P[i * 2 + 1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 0.5 || lb < 0.5) continue;
    const deg = (Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))) * 180) / Math.PI;
    if (deg > worst.deg) worst = { deg, at: [P[i * 2], P[i * 2 + 1]] };
  }
  return worst;
}

describe('computeRails', () => {
  it('puts the rails just outside the container when there is a real margin', () => {
    expect(computeRails(1440, 144, 1296)).toEqual({ left: 130, right: 1310, narrow: false });
  });
  it('hugs the viewport edges when the margin is under 40px', () => {
    expect(computeRails(1200, 24, 1176)).toEqual({ left: 7, right: 1193, narrow: true });
    expect(computeRails(390, 0, 390)).toEqual({ left: 7, right: 383, narrow: true });
  });
});

describe.each([1440, 1280, 1024, 900, 768])('route at %ipx', (width) => {
  const fx = makeLayout(width);

  it('stays in bounds, avoids content, has no hairpins and ends at the knot', () => {
    checkInvariants(fx);
  });

  it('enters the timeline from the right and runs down the spine', () => {
    const { route, runs } = checkInvariants(fx);
    checkTimeline(fx, route, runs);
  });

  it('turns only by 45° at a time: chamfered corners, no 90° joins', () => {
    const route = buildRoute(fx.snap)!;
    const t = maxTurn(route);
    expect(t.deg, `turn at (${t.at[0].toFixed(1)}, ${t.at[1].toFixed(1)})`).toBeLessThanOrEqual(45.5);
  });

  it('threads the tags like beads, starting left of them', () => {
    const route = buildRoute(fx.snap)!;
    const tags = fx.tags!;
    const row = tags.y + tags.h / 2;
    expect(route.start[1]).toBeCloseTo(row, 3);
    expect(route.start[0]).toBeLessThan(tags.x);
    const onRow: number[] = [];
    for (let i = 0; i < route.count; i++) if (Math.abs(route.points[i * 2 + 1] - row) < 0.01) onRow.push(route.points[i * 2]);
    expect(Math.min(...onRow)).toBeLessThan(tags.x);
    expect(Math.max(...onRow)).toBeGreaterThan(tags.x + tags.w);
    // The beads run is drawn up front: it covers the tags.
    expect(route.start[0] + route.minLen).toBeGreaterThan(tags.x + tags.w);
    expect(route.parityRow).toBeNull();
  });

  it('uses wide rails only when the container leaves a margin', () => {
    const route = buildRoute(fx.snap)!;
    if (width >= 1232) {
      expect(fx.snap.rails.narrow).toBe(false);
      expect(route.strokeWidth).toBe(2.25);
    } else {
      expect(fx.snap.rails).toEqual({ left: 7, right: width - 7, narrow: true });
      expect(route.strokeWidth).toBe(1.75);
      expect(route.radius).toBe(9);
    }
  });
});

describe.each([414, 390, 360])('phone route at %ipx', (width) => {
  const fx = makeLayout(width);

  it('starts beside the avatar and keeps every invariant', () => {
    const { route } = checkInvariants(fx);
    const av = fx.snap.hero.avatar!;
    expect(route.start[0]).toBeLessThan(av.x);
    expect(route.start[1]).toBeCloseTo(av.y + av.h / 2, 3);
    expect(route.minLen).toBe(0);
    expect(route.nodes).toHaveLength(0);
    expect(maxTurn(route).deg).toBeLessThanOrEqual(45.5);
  });
});

describe('parity row', () => {
  // About then Experience: the beads leave on the right, About flips to the
  // left, so the timeline would be entered from the left without a parity row.
  const order: SectionSpec[] = [
    { kind: 'plain', max: 1152 },
    { kind: 'timeline', max: 1024 },
    { kind: 'contact', max: 1024 },
  ];

  it.each([1440, 1024, 768])('adds one row below the scroll hint at %ipx and still enters from the right', (width) => {
    const fx = makeLayout(width, order);
    const { route, runs } = checkInvariants(fx);
    expect(route.parityRow).not.toBeNull();
    const hint = fx.snap.hero.scrollHint!;
    expect(route.parityRow!).toBeGreaterThan(hint.y + hint.h);
    expect(route.parityRow!).toBeLessThan(fx.snap.hero.bottom);
    checkTimeline(fx, route, runs);
  });

  it('is not added when parity already works (real section order)', () => {
    expect(buildRoute(makeLayout(1440).snap)!.parityRow).toBeNull();
  });
});

describe('sampling helpers', () => {
  const route = buildRoute(makeLayout(1440).snap)!;

  it('samples uniformly and starts at the start knot', () => {
    expect(route.points[0]).toBeCloseTo(route.start[0], 3);
    expect(route.points[1]).toBeCloseTo(route.start[1], 3);
    for (let i = 1; i < route.count - 1; i++) {
      const d = Math.hypot(route.points[i * 2] - route.points[i * 2 - 2], route.points[i * 2 + 1] - route.points[i * 2 - 1]);
      expect(d).toBeLessThanOrEqual(route.step + 0.01);
      expect(d).toBeGreaterThan(route.step * 0.7); // chords across tight corners are a little shorter
    }
  });

  it('maps reading position to length monotonically', () => {
    let prev = -1;
    for (let y = 0; y < 6000; y += 50) {
      const l = lengthAtY(route, y);
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
    expect(lengthAtY(route, 1e9)).toBe(route.total);
    const end = pointAt(route, route.total);
    expect(end[0]).toBeCloseTo(route.end[0], 1);
    expect(end[1]).toBeCloseTo(route.end[1], 1);
  });

  it('emits path data that starts at the pad and ends at the end point', () => {
    expect(route.d.startsWith(`M${route.start[0]},${route.start[1]}`)).toBe(true);
    const tail = route.d.trim().split(/\s+/).pop()!;
    const [x, y] = tail.replace(/^L/, '').split(',').map(Number);
    expect(x).toBeCloseTo(route.end[0], 1);
    expect(y).toBeCloseTo(route.end[1], 1);
  });
});

describe('carryOver (rebuild in place)', () => {
  const a = buildRoute(makeLayout(1440).snap)!;

  it('is the identity when the layout did not change', () => {
    for (let len = 0; len <= a.total; len += 37) {
      expect(Math.abs(carryOver(a, a, len) - len)).toBeLessThanOrEqual(a.step + 0.01);
    }
    expect(carryOver(a, a, a.total)).toBe(a.total);
  });

  it('keeps the pen at the same place in the content after a reflow, continuously', () => {
    // The hero grows by 56px (a mobile URL bar collapsing with a vh-tall hero):
    // everything below moves down; the pen must follow, not jump.
    const fx = makeLayout(1440);
    const shift = (r: Rect): Rect => ({ ...r, y: r.y + 56 });
    const snap = structuredClone(fx.snap);
    snap.hero.bottom += 56;
    snap.sections = snap.sections.map((sec) => ({
      ...sec,
      top: sec.top + 56,
      bottom: sec.bottom + 56,
      bar: shift(sec.bar),
      nodes: sec.nodes?.map(shift),
      cards: sec.cards ? shift(sec.cards) : sec.cards,
    }));
    const b = buildRoute(snap)!;
    let prev = 0;
    for (let len = a.minLen + 1; len < a.total; len += 11) {
      const n = carryOver(a, b, len);
      expect(n).toBeGreaterThanOrEqual(prev - 0.01);
      // Same height in the content, give or take a sample and the corner rounding.
      const pa = pointAt(a, len), pb = pointAt(b, n);
      if (pa[1] > fx.snap.hero.bottom) expect(Math.abs(pb[1] - (pa[1] + 56))).toBeLessThan(a.radius + 4);
      prev = n;
    }
  });

  it('maps between widths section by section', () => {
    const wide = buildRoute(makeLayout(1440).snap)!;
    const narrow = buildRoute(makeLayout(900).snap)!;
    wide.barRows.forEach((y, k) => {
      const len = lengthAtY(wide, y + 1);
      const n = carryOver(wide, narrow, len);
      const ny = pointAt(narrow, n)[1];
      expect(Math.abs(ny - narrow.barRows[k])).toBeLessThan(narrow.radius + 4);
    });
  });
});

/* ---------------------------------------------------------------------------
   Chip network (board.ts)
   ------------------------------------------------------------------------- */

type Seg = [number, number, number, number];
const segsOf = (pts: readonly (readonly [number, number])[]): Seg[] => pts.slice(1).map((p, i) => [pts[i][0], pts[i][1], p[0], p[1]]);
function crosses(a: Seg, b: Seg): boolean {
  const o = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  return o(a[0], a[1], a[2], a[3], b[0], b[1]) * o(a[0], a[1], a[2], a[3], b[2], b[3]) < 0 && o(b[0], b[1], b[2], b[3], a[0], a[1]) * o(b[0], b[1], b[2], b[3], a[2], a[3]) < 0;
}
/** Points every `step` px along a polyline. */
function sample(pts: readonly (readonly [number, number])[], step = 2): [number, number][] {
  const out: [number, number][] = [];
  segsOf(pts).forEach(([x0, y0, x1, y1]) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 0; i <= n; i++) out.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
  });
  return out;
}

function boardFor(fx: Fixture): { route: Route; board: Board } {
  const route = buildRoute(fx.snap)!;
  const board = buildBoard(route.end, route.endDir, fx.cards, fx.snap.width)!;
  expect(board, 'a chip network fits').not.toBeNull();
  return { route, board };
}

function checkBoard(fx: Fixture) {
  const { route, board } = boardFor(fx);
  const contact = fx.snap.sections[fx.snap.sections.length - 1];
  const cardsBottom = Math.max(...fx.cards.map((c) => c.y + c.h));
  // Pin 1 sits right above the end point; the stub joins them.
  expect(board.botPins[board.inputPin]).toBeCloseTo(route.end[0], 6);
  expect(board.wires[0][0]).toEqual(route.end);
  // The chip and its parts sit between the cards and the section end, inside the viewport, clear of all content.
  expect(board.box.y).toBeGreaterThan(cardsBottom + 20);
  expect(board.box.y + board.box.h).toBeLessThanOrEqual(contact.bottom);
  expect(board.box.x).toBeGreaterThan(0);
  expect(board.box.x + board.box.w).toBeLessThan(fx.snap.width);
  for (const o of fx.obstacles) {
    const overlap = board.box.x < o.x + o.w && board.box.x + board.box.w > o.x && board.box.y < o.y + o.h && board.box.y + board.box.h > o.y;
    expect(overlap, `board overlaps ${JSON.stringify(o)}`).toBe(false);
  }
  // Every card gets lit by exactly one net, and each net ends just inside its first card's bottom edge.
  const lit = board.nets.flatMap((n) => n.cards).sort();
  expect(lit).toEqual(fx.cards.map((_, i) => i));
  for (const n of board.nets) {
    if (!n.cards.length) continue;
    const c = fx.cards[n.cards[0]];
    const [x, y] = n.points[n.points.length - 1];
    expect(x).toBeGreaterThan(c.x);
    expect(x).toBeLessThan(c.x + c.w);
    expect(y).toBeGreaterThanOrEqual(c.y + c.h - 3);
    expect(y).toBeLessThan(c.y + c.h);
  }
  // Nets never run through a card (other than entering their own card's bottom edge) or any other content.
  for (const n of board.nets) {
    // The card the net ends in (a bus line that lights nothing itself still ends in the bottom card).
    const [ex, ey] = n.points[n.points.length - 1];
    const target = fx.cards.find((c) => ex > c.x && ex < c.x + c.w && ey >= c.y + c.h - 3 && ey <= c.y + c.h) ?? null;
    expect(target, 'every net ends in a card').not.toBeNull();
    for (const [x, y] of sample(n.points)) {
      if (target && x > target.x && x < target.x + target.w && y >= target.y + target.h - 3) continue;
      for (const o of fx.obstacles) {
        if (inside(o, x, y, 1)) throw new Error(`net point (${x.toFixed(1)}, ${y.toFixed(1)}) inside ${JSON.stringify(o)}`);
      }
    }
  }
  // Nets never cross each other, the trace or the board's own wires.
  const netSegs = board.nets.map((n) => segsOf(n.points));
  const routeSegs: Seg[] = route.segments.map((sg) => [sg.a[0], sg.a[1], sg.b[0], sg.b[1]]);
  const wireSegs = board.wires.flatMap((w) => segsOf(w));
  netSegs.forEach((a, i) => {
    netSegs.forEach((b, j) => {
      if (j <= i) return;
      for (const sa of a) for (const sb of b) expect(crosses(sa, sb), `nets ${i} and ${j} cross`).toBe(false);
    });
    for (const sa of a) {
      for (const sb of routeSegs) expect(crosses(sa, sb), `net ${i} crosses the trace`).toBe(false);
      for (const sb of wireSegs) expect(crosses(sa, sb), `net ${i} crosses a wire`).toBe(false);
    }
  });
  for (const sa of wireSegs) for (const sb of routeSegs) expect(crosses(sa, sb), 'a wire crosses the trace').toBe(false);
  // Circuit style: only straight and 45° legs.
  for (const n of board.nets) {
    for (const [x0, y0, x1, y1] of segsOf(n.points)) {
      const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
      expect(dx < 0.01 || dy < 0.01 || Math.abs(dx - dy) < 0.01, `net leg (${x0},${y0})-(${x1},${y1})`).toBe(true);
    }
  }
  return { route, board };
}

describe.each([1440, 1280, 1024, 900, 768])('chip network at %ipx (two columns)', (width) => {
  const fx = makeLayout(width);
  it('wires every card, stays clear of content and never crosses itself or the trace', () => {
    const { board } = checkBoard(fx);
    expect(board.nets).toHaveLength(4);
    expect(board.nets.every((n) => n.cards.length === 1)).toBe(true);
  });
});

describe.each([414, 390, 360])('chip network at %ipx (one column)', (width) => {
  const fx = makeLayout(width);
  it('runs a bus into the bottom card and lights the column bottom to top', () => {
    const { board } = checkBoard(fx);
    const bus = board.nets.find((n) => n.cards.length)!;
    const ys = bus.cards.map((i) => fx.cards[i].y);
    expect([...ys].sort((a, b) => b - a)).toEqual(ys);
  });
});

describe('buildBoard falls back to a plain end', () => {
  const fx = makeLayout(1440);
  const route = buildRoute(fx.snap)!;
  it('when there is no room between the cards and the end point', () => {
    expect(buildBoard([route.end[0], Math.max(...fx.cards.map((c) => c.y + c.h)) + 40], route.endDir, fx.cards, 1440)).toBeNull();
  });
  it('when the cards are neither a 2×2 grid nor one column', () => {
    expect(buildBoard(route.end, route.endDir, fx.cards.slice(0, 3), 1440)).toBeNull();
    expect(buildBoard(route.end, route.endDir, [], 1440)).toBeNull();
  });
});
