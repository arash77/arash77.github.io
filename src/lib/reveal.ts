/**
 * Timing for a home page section's scroll reveal.
 *
 * A section whose island hydrates while its top is already above the viewport
 * (the reader came back up from below, or the browser restored a scroll
 * position inside or past it) has its ScrollTrigger fire at once. A top-down
 * stagger would then reveal the part that is actually in view last, and the
 * scroll thread waits for the content it runs past to appear. Such a section
 * reveals all at once: quickly while part of it is in view, and instantly
 * while it is still entirely above the viewport (the islands hydrate a little
 * before they scroll into view), so it is complete by the time it is seen.
 */
export function revealTiming(section: Element | null, duration: number, stagger = 0): { duration: number; stagger: number } {
  const r = section?.getBoundingClientRect();
  if (!r || r.top >= 0) return { duration, stagger };
  return { duration: r.bottom <= 0 ? 0 : Math.min(duration, 0.35), stagger: 0 };
}
