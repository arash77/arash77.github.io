import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Font } from 'satori';

// Fonts for the satori-rendered og:image (src/pages/og.png.ts), shared with its
// typography test. Committed static TTFs keep the card's build hermetic; satori
// reads TTF/OTF/WOFF, not the woff2 the Fonts API emits by default.
// Source: fontsource Geist 1.800 (fontversion 117965), latin subset, which is
// Latin-1 only; satori renders missing glyphs silently. License: Geist-OFL.txt.
const font = (file: string) => readFileSync(resolve('src/assets/fonts', file));

export const OG_FONTS: Font[] = [
  { name: 'Geist', data: font('Geist-Regular.ttf'), weight: 400, style: 'normal' },
  { name: 'Geist', data: font('Geist-SemiBold.ttf'), weight: 600, style: 'normal' },
];
