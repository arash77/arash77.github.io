import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });
}

export const SITE = {
  name: 'Arash Kadkhodaei',
  title: 'Arash Kadkhodaei – Software Engineer',
  description:
    'Software Engineer at Freiburg University, specializing in Python, backend development, and Galaxy Project bioinformatics tooling.',
  url: 'https://kadkhodaei.de',
  author: 'Arash Kadkhodaei',
  email: 'arash@kadkhodaei.de',
  github: 'https://github.com/arash77',
  linkedin: 'https://linkedin.com/in/kadarash',
  location: 'Freiburg, Germany',
  avatar: '/assets/img/avatar.jpg',
} as const;

export const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/projects', label: 'Projects' },
  { href: '/resume', label: 'Resume' },
] as const;

export const LEGAL_LANGS = {
  DE: 'de',
  EN: 'en',
} as const;

export type LegalLang = (typeof LEGAL_LANGS)[keyof typeof LEGAL_LANGS];

export const STORAGE_KEYS = {
  THEME: 'theme',
  LEGAL_LANG: 'legal-lang',
} as const;
