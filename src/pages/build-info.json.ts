import type { APIRoute } from 'astro';

// Emitted so the post-deploy smoke check can prove it is looking at the NEW
// deployment. GitHub Pages keeps serving the previous build for a while after
// the deploy API reports success, and that stale build answers 200 with a
// valid title and working CSS -- so every content-based assertion passes
// against it. Comparing this commit against the one being deployed is the only
// thing that distinguishes "the new site works" from "the old site is still up".
//
// Evaluated at build time (this is a static build, so the value is baked into
// the emitted file and the response headers below are not served by Pages --
// the smoke check busts caches with a query string instead).
const commit = process.env.GITHUB_SHA ?? 'unknown';

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ commit }), {
    headers: { 'Content-Type': 'application/json' },
  });
