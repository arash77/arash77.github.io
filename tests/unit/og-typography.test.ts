import { describe, it, expect } from 'vitest';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createElement as h } from 'react';

// og.png.ts renders with Geist, whose GPOS kerning opentype.js can read. Satori
// before 0.33 laid words out by summing unkerned per-character widths but drew
// them kerned, so gaps after heavily kerned words ("infrastructure") opened up
// by ~5px. Guard the rendered spacing, not the dependency version.
const geist = readFileSync(resolve('src/assets/fonts/Geist-Regular.ttf'));

async function wordGaps(text: string): Promise<number[]> {
  const svg = await satori(
    h('div', {
      style: { display: 'flex', width: '100%', height: '100%', paddingLeft: '10px', background: '#fff', color: '#000', fontSize: '42px', fontFamily: 'Geist' },
    }, text),
    { width: 1400, height: 70, fonts: [{ name: 'Geist', data: geist, weight: 400, style: 'normal' }] },
  );
  const img = new Resvg(svg).render();
  const { width, height, pixels } = img;
  const inked = (x: number) => {
    for (let y = 0; y < height; y++) if (pixels[(y * width + x) * 4] < 160) return true;
    return false;
  };
  // Empty column runs between ink; the widest (words - 1) of them are the word gaps.
  const runs: [start: number, length: number][] = [];
  let start = -1;
  for (let x = 0; x < width; x++) {
    if (!inked(x) && start < 0) start = x;
    if (inked(x) && start >= 0) {
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
  it.each([
    'throughput backend infrastructure · production',
    'Backend & Distributed Systems',
    'distributed systems at production scale',
  ])('spaces words evenly: %s', async (text) => {
    const gaps = await wordGaps(text);
    // Glyph sidebearings alone vary gaps by ~2-3px at 42px; the kerning
    // mismatch pushed the spread to 5-9px.
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(4);
  });
});
