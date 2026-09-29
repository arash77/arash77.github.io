import { describe, it, expect } from 'vitest';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { createElement as h } from 'react';
import { OG_FONTS } from '@/lib/og-fonts';

// og.png renders with Geist, whose GPOS kerning satori's opentype.js parser picks
// up (Inter's did not). Satori before 0.33 laid words out by summing unkerned
// per-character widths but drew them kerned, so gaps after heavily kerned words
// ("infrastructure") opened up by ~5px. Guard the rendered spacing, not the
// dependency version.

// Word gaps (px) of `text` rendered on one line. The text must fit the 1400px
// canvas on a single line with single spaces: the widest (words - 1) empty
// column runs are taken as the word gaps, which only holds while every word
// gap is wider than any gap between letters (~15px vs <=7px at 42px).
async function wordGaps(text: string, fontWeight: number): Promise<number[]> {
  const svg = await satori(
    h('div', {
      style: { display: 'flex', width: '100%', height: '100%', paddingLeft: '10px', background: '#fff', color: '#000', fontSize: '42px', fontFamily: 'Geist', fontWeight },
    }, text),
    { width: 1400, height: 70, fonts: OG_FONTS },
  );
  const { width, height, pixels } = new Resvg(svg).render();
  const inked = Array.from({ length: width }, (_, x) => {
    for (let y = 0; y < height; y++) if (pixels[(y * width + x) * 4] < 160) return true;
    return false;
  });
  // Empty runs between ink; the left margin (starts at 0) and the trailing
  // margin (never closed by ink) are skipped.
  const runs: [start: number, length: number][] = [];
  let start = -1;
  for (let x = 0; x < width; x++) {
    if (!inked[x] && start < 0) start = x;
    if (inked[x] && start >= 0) {
      if (start > 0) runs.push([start, x - start]);
      start = -1;
    }
  }
  const gapCount = text.split(' ').length - 1;
  return runs
    .sort((a, b) => b[1] - a[1])
    .slice(0, gapCount)
    .map(([, length]) => length);
}

describe('og image typography', () => {
  const lines = [
    'throughput backend infrastructure · production',
    'Backend & Distributed Systems',
    'distributed systems at production scale',
  ];
  const cases = OG_FONTS.flatMap(({ weight }) => lines.map((text) => [weight, text] as const));

  it.each(cases)('spaces words evenly at weight %i: %s', async (weight, text) => {
    const gaps = await wordGaps(text, weight as number);
    // Glyph sidebearings alone vary gaps by ~2-3px at 42px; the kerning
    // mismatch pushed the spread to 5-9px.
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(4);
  });
});
