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

const tags = ['Python', 'FastAPI', 'Docker', 'CI/CD'];

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

    // Main row: avatar + text
    h('div', { style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '56px' } },
      h('img', {
        src: avatarData, width: 190, height: 190,
        style: { borderRadius: '9999px', border: '4px solid rgba(14,116,128,0.6)', objectFit: 'cover', objectPosition: '81% 26%', flexShrink: 0 },
      }),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        h('div', { style: { fontSize: '15px', letterSpacing: '0.2em', color: '#2dd4bf', fontWeight: 400 } }, 'SOFTWARE ENGINEER'),
        h('div', { style: { fontSize: '66px', fontWeight: 600, color: '#f0fdfa', lineHeight: 1.1 } }, SITE.name),
        h('div', { style: { fontSize: '22px', color: 'rgba(240,253,250,0.5)', fontWeight: 400, marginTop: '2px' } }, 'Backend & Distributed Systems'),
        h('div', { style: { display: 'flex', flexDirection: 'row', gap: '10px', marginTop: '18px' } },
          ...tags.map((tag) =>
            h('div', {
              key: tag,
              style: { fontSize: '15px', fontWeight: 400, color: 'rgba(240,253,250,0.7)', background: 'rgba(14,116,128,0.18)', border: '1px solid rgba(14,116,128,0.35)', borderRadius: '9999px', padding: '6px 16px' },
            }, tag)
          )
        )
      )
    ),

    // Bottom bar
    h('div', {
      style: { position: 'absolute', bottom: '40px', left: '80px', right: '80px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(14,116,128,0.25)', paddingTop: '20px' },
    },
      h('div', { style: { fontSize: '16px', color: 'rgba(240,253,250,0.35)', fontWeight: 400 } }, 'kadkhodaei.de'),
      h('div', { style: { fontSize: '16px', color: 'rgba(240,253,250,0.35)', fontWeight: 400 } }, 'Freiburg, Germany'),
    )
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
