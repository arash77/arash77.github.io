import { describe, it, expect } from 'vitest';
import { cn, formatDate, SITE, NAV_LINKS } from '@/lib/utils';

describe('cn()', () => {
  it('merges Tailwind classes correctly', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-sm font-bold', 'text-lg')).toBe('font-bold text-lg');
  });

  it('handles falsy values', () => {
    expect(cn('base', false && 'not-included')).toBe('base');
    expect(cn('base', null, undefined, '')).toBe('base');
    expect(cn('base', 0 && 'zero')).toBe('base');
  });

  it('handles conditional classes', () => {
    const active = true;
    expect(cn('btn', active && 'btn-active')).toBe('btn btn-active');
    expect(cn('btn', !active && 'btn-active')).toBe('btn');
  });
});

describe('formatDate()', () => {
  it('returns "Month Year" format for a Date object', () => {
    const result = formatDate(new Date('2024-04-01'));
    expect(result).toMatch(/\w+ \d{4}/);
    expect(result).toContain('2024');
    expect(result).toContain('April');
  });

  it('returns "Month Year" format for a string input', () => {
    const result = formatDate('2023-02-15');
    expect(result).toContain('2023');
  });

  it('handles year-month strings', () => {
    const result = formatDate('2021-10');
    expect(result).toContain('2021');
  });
});

describe('SITE', () => {
  it('has all required fields', () => {
    expect(SITE).toHaveProperty('name');
    expect(SITE).toHaveProperty('url');
    expect(SITE).toHaveProperty('email');
    expect(SITE).toHaveProperty('github');
    expect(SITE).toHaveProperty('linkedin');
  });

  it('url is a valid URL', () => {
    expect(() => new URL(SITE.url)).not.toThrow();
    expect(SITE.url).toMatch(/^https?:\/\//);
  });

  it('email contains an @ sign', () => {
    expect(SITE.email).toContain('@');
  });

  it('github points to a GitHub profile', () => {
    expect(SITE.github).toContain('github.com');
  });

  it('linkedin points to a LinkedIn profile', () => {
    expect(SITE.linkedin).toContain('linkedin.com');
  });
});

describe('NAV_LINKS', () => {
  it('has exactly 3 entries', () => {
    expect(NAV_LINKS).toHaveLength(3);
  });

  it('contains the correct hrefs', () => {
    const hrefs = NAV_LINKS.map((l) => l.href);
    expect(hrefs).toContain('/');
    expect(hrefs).toContain('/projects');
    expect(hrefs).toContain('/resume');
  });

  it('each entry has a non-empty label', () => {
    for (const link of NAV_LINKS) {
      expect(link.label.length).toBeGreaterThan(0);
    }
  });
});
