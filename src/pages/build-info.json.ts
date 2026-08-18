import type { APIRoute } from 'astro';

// Emitted so the post-deploy smoke check can prove it is looking at the NEW
// deployment. GitHub Pages keeps serving the previous build for a while after
// the deploy API reports success, and that stale build answers 200 with a
// valid title and working CSS -- so every content-based assertion passes
// against it. Comparing this against the deploy in flight is the only thing
// that distinguishes "the new site works" from "the old site is still up".
//
// `run` is what the smoke check compares, because it is unique per build.
// `commit` alone would repeat across the nightly scheduled rebuild of an
// unchanged HEAD, and GITHUB_RUN_ID alone would repeat across a "re-run all
// jobs" -- either would let that check pass against the previous deployment.
// The value is handed down from the deploy workflow's build job rather than
// derived here, so that it identifies the build even when a later run attempt
// does not rebuild. `commit` stays for humans reading the file.
//
// Evaluated at build time (this is a static build, so the value is baked into
// the emitted file and the response headers below are not served by Pages --
// the smoke check busts caches with a query string instead).
const commit = process.env.GITHUB_SHA ?? 'unknown';
const run = process.env.BUILD_ID ?? 'unknown';

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ commit, run }), {
    headers: { 'Content-Type': 'application/json' },
  });
