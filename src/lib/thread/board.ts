/**
 * Scroll thread: pure geometry of the chip network at the end of the line.
 *
 * The route ends below the contact cards (route.ts, END_GAP). Here a small
 * chip (U1) takes the trace on its input pin; its four outputs are wired as
 * traces up to the four contact cards, its ground pin goes to a ground symbol,
 * and a tactile reset switch (SW1) on its reset pin goes to ground too. The
 * runtime draws this and lights the cards when the signal arrives.
 *
 * All coordinates are in the thread layer's space (relative to <main>), like
 * the route. No DOM access, so the layout can be unit-tested.
 */
import type { Pt, Rect } from './route';

export interface BoardNet {
  points: Pt[];
  /** Polyline length in px (for the signal pulse). */
  length: number;
  /** Indices (into the cards passed in) lit when the signal arrives, in order. */
  cards: number[];
}

export interface Board {
  chip: { cx: number; cy: number; w: number; h: number };
  /** Pin centre x positions, left to right, top row and bottom row. */
  topPins: number[];
  botPins: number[];
  pinTop: number;
  pinBottom: number;
  /** The bottom pin the trace feeds (pin 1). */
  inputPin: number;
  /** Plain wires: input stub, ground wires, reset wires. */
  wires: Pt[][];
  grounds: Pt[];
  /** Centre of the reset switch. */
  reset: Pt;
  nets: BoardNet[];
  labels: { x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end' }[];
  /** Bounding box of everything drawn except the nets (for tests and clearance checks). */
  box: Rect;
}

export const PIN_PITCH = 12;
const CHIP_W = 60;
const CHIP_H = 28;
const PIN_LEN = 9;
/** The chip's top pins reach this far above the end point. */
const CHIP_REACH = 58;
/** Smallest channel between the cards and the chip's top pins that still fits three routing rows. */
export const MIN_CHANNEL = 36;
/** 45° chamfer of the nets' corners. */
const NET_CHAMFER = 6;

const len = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

/** Axis-aligned polyline to polyline with 45° chamfered corners. */
export function chamfer(pts: Pt[], c = NET_CHAMFER): Pt[] {
  if (pts.length < 3) return pts.slice();
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], a = pts[i - 1], b = pts[i + 1];
    const l1 = Math.hypot(p[0] - a[0], p[1] - a[1]) || 1, l2 = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
    const k = Math.min(c, l1 / 2, l2 / 2);
    out.push([p[0] - ((p[0] - a[0]) / l1) * k, p[1] - ((p[1] - a[1]) / l1) * k]);
    out.push([p[0] + ((b[0] - p[0]) / l2) * k, p[1] + ((b[1] - p[1]) / l2) * k]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

const net = (pts: Pt[], cards: number[]): BoardNet => {
  const points = chamfer(pts);
  return { points, length: len(points), cards };
};

/**
 * Lay out the chip network for a route ending at `end` (reached heading `dir`)
 * below `cards`. Returns null when the cards are not a 2×2 grid or a single
 * column, or there is not enough room between them and the end point: the
 * runtime then ends the line on a plain pad.
 */
export function buildBoard(end: Pt, dir: 1 | -1, cards: Rect[], width: number): Board | null {
  if (!cards.length) return null;
  const [ex, ey] = end;
  const cardsBottom = Math.max(...cards.map((c) => c.y + c.h));
  const pinTop = ey - CHIP_REACH;
  if (pinTop - cardsBottom < MIN_CHANNEL) return null;

  // The input pin (pin 1, bottom row, on the side the trace comes from) sits
  // right above the end point.
  const cx = ex + dir * (1.5 * PIN_PITCH);
  const cy = ey - CHIP_REACH + PIN_LEN + CHIP_H / 2;
  const offs = [-1.5, -0.5, 0.5, 1.5].map((k) => k * PIN_PITCH);
  const topPins = offs.map((o) => cx + o);
  const botPins = topPins.slice();
  const pinBottom = cy + CHIP_H / 2 + PIN_LEN;
  const inputPin = dir > 0 ? 0 : 3;
  const groundPin = dir > 0 ? 1 : 2;
  const resetPin = dir > 0 ? 3 : 0;

  const wires: Pt[][] = [];
  const grounds: Pt[] = [];
  // Input stub: from the end point up into pin 1.
  wires.push([[ex, ey], [ex, pinBottom]]);
  // Ground pin straight down to a ground symbol.
  const gx = botPins[groundPin];
  wires.push([[gx, pinBottom], [gx, ey + 2]]);
  grounds.push([gx, ey + 2]);
  // Reset pin → SW1 → ground, beyond the chip on the far side.
  const rx = botPins[resetPin];
  const swX = cx + dir * (CHIP_W / 2 + 22);
  const swY = ey - 3;
  wires.push(chamfer([[rx, pinBottom], [rx, swY], [swX - dir * 8, swY]], 4));
  const g2x = swX + dir * 22;
  wires.push(chamfer([[swX + dir * 8, swY], [g2x, swY], [g2x, ey + 2]], 4));
  grounds.push([g2x, ey + 2]);

  // Nets from the four top pins to the cards.
  const nets: BoardNet[] = [];
  const xs = [...new Set(cards.map((c) => Math.round(c.x)))].sort((a, b) => a - b);
  const centre = (c: Rect) => c.x + c.w / 2;
  const channel = pinTop - cardsBottom;
  const row = (k: number) => cardsBottom + (channel * k) / 4; // three rows: k = 1 (by the cards) .. 3 (by the chip)
  if (cards.length === 4 && xs.length === 2) {
    const idx = cards.map((c, i) => ({ c, i }));
    const top = idx.filter((o) => o.c.y + o.c.h < cardsBottom - 1).sort((a, b) => a.c.x - b.c.x);
    const bot = idx.filter((o) => o.c.y + o.c.h >= cardsBottom - 1).sort((a, b) => a.c.x - b.c.x);
    if (top.length !== 2 || bot.length !== 2) return null;
    const [A, B] = top, [C, D] = bot;
    const gap = (C.c.x + C.c.w + D.c.x) / 2;
    const rowGap = (Math.max(A.c.y + A.c.h, B.c.y + B.c.h) + Math.min(C.c.y, D.c.y)) / 2;
    // Which of A / B takes the row nearer the cards: the one whose pin is
    // further from the gap, so the two never cross on their way to it.
    const [yA, yB] = dir > 0 ? [row(2), row(1)] : [row(1), row(2)];
    nets.push(net([[topPins[0], pinTop], [topPins[0], row(3)], [centre(C.c), row(3)], [centre(C.c), C.c.y + C.c.h - 2]], [C.i]));
    nets.push(net([[topPins[1], pinTop], [topPins[1], yA], [gap - 4, yA], [gap - 4, rowGap], [centre(A.c), rowGap], [centre(A.c), A.c.y + A.c.h - 2]], [A.i]));
    nets.push(net([[topPins[2], pinTop], [topPins[2], yB], [gap + 4, yB], [gap + 4, rowGap], [centre(B.c), rowGap], [centre(B.c), B.c.y + B.c.h - 2]], [B.i]));
    nets.push(net([[topPins[3], pinTop], [topPins[3], row(3)], [centre(D.c), row(3)], [centre(D.c), D.c.y + D.c.h - 2]], [D.i]));
  } else if (xs.length === 1) {
    // One column (phones): a four-line bus into the bottom card; the cards light up the column, bottom to top.
    const order = cards.map((c, i) => ({ c, i })).sort((a, b) => b.c.y - a.c.y);
    const last = order[0].c;
    if (topPins[0] < last.x + 8 || topPins[3] > last.x + last.w - 8) return null;
    topPins.forEach((x, k) => nets.push(net([[x, pinTop], [x, last.y + last.h - 2]], k === 0 ? order.map((o) => o.i) : [])));
  } else {
    return null;
  }

  const labels: Board['labels'] = [
    { x: cx - dir * (CHIP_W / 2 + 14), y: cy + 3, text: 'U1', anchor: 'middle' },
    // Above the switch, running away from the chip (clear of its pins and the reset wire).
    { x: swX - dir * 8, y: swY - 13, text: 'SW1 RESET', anchor: dir > 0 ? 'start' : 'end' },
  ];
  const xsAll = [cx - CHIP_W / 2 - 24, cx + CHIP_W / 2 + 24, swX - 12, swX + 12, swX - dir * 8 + dir * 54, g2x - 11, g2x + 11];
  const x0 = Math.min(...xsAll), x1 = Math.max(...xsAll);
  const box = { x: x0, y: pinTop, w: x1 - x0, h: ey + 12 - pinTop };
  if (box.x < 2 || box.x + box.w > width - 2) return null;

  return {
    chip: { cx, cy, w: CHIP_W, h: CHIP_H },
    topPins,
    botPins,
    pinTop,
    pinBottom,
    inputPin,
    wires,
    grounds,
    reset: [swX, swY],
    nets,
    labels,
    box,
  };
}
