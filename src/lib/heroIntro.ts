/**
 * Reports the hero intro to the scroll thread (SiteThread), which starts
 * drawing once the intro has settled and arms its start fallback from the
 * intro's start. The intro itself plays in CSS from the first paint
 * (global.css: hero-intro), so this runs as a plain page script, not from the
 * Hero island: no hydration to wait for. The data flags cover a listener that
 * attaches after an event has fired.
 */
export function reportHeroIntro(): void {
  const html = document.documentElement;
  const cta = document.querySelector('[data-hero-intro="cta"]');
  if (!cta) return;
  html.dataset.heroIntro = '';
  window.dispatchEvent(new Event('hero:intro-start'));
  const revealed = () => {
    html.dataset.heroRevealed = '';
    window.dispatchEvent(new Event('hero:revealed'));
  };
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    revealed();
    return;
  }
  // The intro ends with the call-to-action row (already over if this runs
  // late). Only a reader who could see it has had it: in a hidden tab, wait
  // until the page shows.
  const shown = () => {
    if (document.visibilityState !== 'hidden') revealed();
    else document.addEventListener('visibilitychange', shown, { once: true });
  };
  const last = cta.getAnimations().find((a) => a instanceof CSSAnimation && a.animationName === 'hero-intro');
  if (last) last.finished.then(shown, shown);
  else shown();
}
