import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Navbar from '@/components/Navbar';
import { SITE, NAV_LINKS } from '@/lib/utils';

// Stub localStorage for dark-mode persistence tests
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

beforeEach(() => {
  localStorageMock.clear();
  // Reset dark mode state between tests
  document.documentElement.classList.remove('dark');
});

describe('Navbar', () => {
  it('renders the site name', () => {
    render(<Navbar />);
    // SITE.name appears in both desktop and mobile nav (Sheet header)
    const nodes = screen.getAllByText(SITE.name);
    expect(nodes.length).toBeGreaterThan(0);
  });

  it('renders all nav links', () => {
    render(<Navbar />);
    for (const { label } of NAV_LINKS) {
      // Each link appears twice: desktop + mobile sheet
      const links = screen.getAllByText(label);
      expect(links.length).toBeGreaterThan(0);
    }
  });

  it('nav links have correct hrefs', () => {
    render(<Navbar />);
    for (const { href } of NAV_LINKS) {
      const links = screen.getAllByRole('link', { name: new RegExp(href === '/' ? 'Home' : href.slice(1), 'i') });
      const matchingHref = links.some((el) => el.getAttribute('href') === href);
      expect(matchingHref, `No link with href="${href}" found`).toBe(true);
    }
  });

  it('dark mode toggle button exists with proper aria-label', () => {
    render(<Navbar />);
    // There are two toggle buttons: one in desktop nav, one in mobile nav
    const toggles = screen.getAllByRole('button', { name: /toggle dark mode/i });
    expect(toggles.length).toBeGreaterThan(0);
    for (const toggle of toggles) {
      expect(toggle).toHaveAttribute('aria-label', 'Toggle dark mode');
    }
  });

  it('clicking toggle adds "dark" class to documentElement', async () => {
    const user = userEvent.setup();
    render(<Navbar />);

    document.documentElement.classList.remove('dark');

    const [toggle] = screen.getAllByRole('button', { name: /toggle dark mode/i });
    await user.click(toggle);

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('clicking toggle twice removes "dark" class from documentElement', async () => {
    const user = userEvent.setup();
    render(<Navbar />);

    document.documentElement.classList.remove('dark');

    const [toggle] = screen.getAllByRole('button', { name: /toggle dark mode/i });
    await user.click(toggle);
    await user.click(toggle);

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('clicking toggle persists theme in localStorage', async () => {
    const user = userEvent.setup();
    render(<Navbar />);

    document.documentElement.classList.remove('dark');

    const [toggle] = screen.getAllByRole('button', { name: /toggle dark mode/i });
    await user.click(toggle);

    expect(localStorageMock.getItem('theme')).toBe('dark');

    await user.click(toggle);

    expect(localStorageMock.getItem('theme')).toBe('light');
  });
});
