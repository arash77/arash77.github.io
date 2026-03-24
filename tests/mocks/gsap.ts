import { vi } from 'vitest';

const timelineInstance = {
  to: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  play: vi.fn().mockReturnThis(),
  pause: vi.fn().mockReturnThis(),
  kill: vi.fn().mockReturnThis(),
};

export const gsap = {
  to: vi.fn(),
  set: vi.fn(),
  from: vi.fn(),
  registerPlugin: vi.fn(),
  timeline: vi.fn(() => timelineInstance),
};

export default gsap;

// Named export for `import { gsap } from 'gsap'` pattern
// Also satisfies `import { useGSAP } from '@gsap/react'`
export const useGSAP = vi.fn((callback?: () => void, config?: unknown) => {
  if (typeof callback === 'function') {
    try {
      callback();
    } catch {
      // ignore errors in GSAP callbacks during tests
    }
  }
});
