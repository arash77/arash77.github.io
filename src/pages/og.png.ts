import type { APIRoute } from 'astro';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createElement as h } from 'react';
import { SITE } from '@/lib/utils';

const interRegular  = readFileSync(resolve('src/assets/fonts/Inter-Regular.otf'));
const interSemiBold = readFileSync(resolve('src/assets/fonts/Inter-SemiBold.otf'));
const avatarData    = `data:image/jpeg;base64,${readFileSync(resolve('public/assets/img/avatar.jpg')).toString('base64')}`;

// Distributed node-graph as a pre-built SVG data URI (satori can't render SVG children)
const graphNodes: [number, number, number][] = [
  [275, 315, 8],   // hub
  [150, 200, 5.5], [400, 210, 5.5], [160, 430, 5.5], [390, 420, 5.5],
  [80,  115, 3.5], [200, 100, 3.5], [330,  90, 3.5], [490, 155, 3.5],
  [510, 310, 3.5], [460, 480, 3.5], [300, 540, 3.5], [130, 530, 3.5],
  [ 45, 380, 3.5], [ 60, 250, 3.5],
];
const graphEdges: [number, number][] = [
  [0,1],[0,2],[0,3],[0,4],
  [1,5],[1,6],[1,14],[1,2],[2,7],[2,8],[2,9],
  [3,12],[3,13],[3,4],[3,11],[4,10],[4,9],[4,11],
  [5,14],[8,9],[10,11],[11,12],[12,13],
];
const graphSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="580" height="630" viewBox="0 0 580 630">',
  ...graphEdges.map(([a, b]) =>
    `<line x1="${graphNodes[a][0]}" y1="${graphNodes[a][1]}" x2="${graphNodes[b][0]}" y2="${graphNodes[b][1]}" stroke="rgba(20,184,166,0.18)" stroke-width="1.5"/>`
  ),
  ...graphNodes.filter(n => n[2] > 4).map(([cx, cy, r]) =>
    `<circle cx="${cx}" cy="${cy}" r="${r * 3.5}" fill="rgba(20,184,166,0.09)"/>`
  ),
  ...graphNodes.map(([cx, cy, r]) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(20,184,166,${r > 4 ? 0.65 : 0.45})"/>`
  ),
  '</svg>',
].join('');
const graphDataUri = `data:image/svg+xml;utf8,${encodeURIComponent(graphSvg)}`;

export const GET: APIRoute = async () => {
  const element = h('div', {
    style: {
      width: '1200px', height: '630px', background: '#041618',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '72px 80px', fontFamily: 'Inter', position: 'relative', overflow: 'hidden',
    },
  },
    // Teal glow top-left
    h('div', { style: { position: 'absolute', top: '-100px', left: '-100px', width: '500px', height: '500px', borderRadius: '9999px', background: 'radial-gradient(circle, rgba(14,116,128,0.35) 0%, transparent 70%)', display: 'flex' } }),
    // Green glow bottom-right
    h('div', { style: { position: 'absolute', bottom: '-120px', right: '-80px', width: '480px', height: '480px', borderRadius: '9999px', background: 'radial-gradient(circle, rgba(21,153,87,0.22) 0%, transparent 70%)', display: 'flex' } }),

    // Network graph — right-side decoration (embedded as pre-built SVG image)
    h('img', {
      src: graphDataUri,
      width: 580, height: 630,
      style: { position: 'absolute', right: '0', top: '0' },
    }),

    // Main row: avatar + text
    h('div', { style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '72px' } },
      // Replicate Hero scale(1.75) / transformOrigin:'81% 26%' without CSS transforms:
      // container 210×210 clips the oversized (368×368) image shifted so the 81%/26% point stays centered
      h('div', {
        style: {
          width: '210px', height: '210px', borderRadius: '9999px', flexShrink: 0,
          border: '5px solid rgba(20,184,166,0.55)', overflow: 'hidden', position: 'relative', display: 'flex',
        },
      },
        h('img', {
          src: avatarData, width: 367, height: 551,
          style: { position: 'absolute', left: '-128px', top: '-89px', width: '367px', height: '551px' },
        }),
      ),
      // Text stack — specialty leads, name follows
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '640px' } },
        // 1. Specialty — most prominent, high-contrast light teal
        h('div', { style: { fontSize: '36px', fontWeight: 600, color: '#99f6e4', letterSpacing: '0.04em', lineHeight: 1.2 } }, 'Backend & Distributed Systems'),
        // 2. Name — large but visually second
        h('div', { style: { fontSize: '68px', fontWeight: 600, color: '#f0fdfa', lineHeight: 1.05 } }, SITE.name),
        // 3. Role — readable contrast
        h('div', { style: { fontSize: '24px', fontWeight: 400, color: 'rgba(240,253,250,0.85)', letterSpacing: '0.12em' } }, 'SOFTWARE ENGINEER'),
        // 4. Single powerful tagline
        h('div', { style: { fontSize: '21px', fontWeight: 400, color: 'rgba(240,253,250,0.72)', marginTop: '12px', lineHeight: 1.5 } },
          'High-throughput backend infrastructure · production-scale distributed systems'
        ),
      ),
    ),

    // Bottom bar — no divider, domain stands out as CTA
    h('div', {
      style: { position: 'absolute', bottom: '44px', left: '80px', right: '80px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    },
      h('div', { style: { fontSize: '22px', color: '#5eead4', fontWeight: 600 } }, new URL(SITE.url).hostname),
      h('div', { style: { fontSize: '20px', color: 'rgba(240,253,250,0.65)', fontWeight: 400 } }, SITE.location),
    ),
  );

  const svg = await satori(element, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Inter', data: interRegular,  weight: 400, style: 'normal' },
      { name: 'Inter', data: interSemiBold, weight: 600, style: 'normal' },
    ],
  });

  const png = new Uint8Array(new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng());

  return new Response(png, {
    headers: { 'Content-Type': 'image/png' },
  });
};
