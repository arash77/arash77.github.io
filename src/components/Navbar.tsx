'use client';

import { useState, useEffect } from 'react';
import { Menu, X, Moon, Sun, Code2 } from 'lucide-react';
import { Button } from './ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from './ui/sheet';
import { NAV_LINKS, SITE } from '@/lib/utils';

interface NavbarProps {
  currentPath?: string;
}

export default function Navbar({ currentPath: initialPath = '/' }: NavbarProps) {
  const [isDark, setIsDark] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const currentPath = initialPath;

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));

    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    handleScroll(); // sync on mount (handles refresh-while-scrolled)
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleDark = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  const isActive = (href: string) => {
    if (href === '/') return currentPath === '/';
    return currentPath.startsWith(href);
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-background/80 backdrop-blur-md border-b border-border shadow-sm'
          : 'bg-transparent'
      }`}
    >
      <nav className="container mx-auto px-4 h-16 flex items-center justify-between max-w-6xl">
        {/* Logo */}
        <a
          href="/"
          className="flex items-center gap-2 font-semibold text-lg hover:text-primary transition-colors"
          aria-label="Home"
        >
          <Code2 className="h-6 w-6 text-primary" />
          <span className="font-mono">{SITE.name}</span>
        </a>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors hover:text-primary hover:bg-accent ${
                isActive(href)
                  ? 'text-primary bg-accent'
                  : 'text-muted-foreground'
              }`}
            >
              {label}
            </a>
          ))}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleDark}
            aria-label="Toggle dark mode"
            className="ml-2"
            suppressHydrationWarning
          >
            <Sun className="h-4 w-4 hidden dark:block" />
            <Moon className="h-4 w-4 dark:hidden" />
          </Button>
        </div>

        {/* Mobile nav */}
        <div className="flex items-center gap-2 md:hidden">
          <Button variant="ghost" size="icon" onClick={toggleDark} aria-label="Toggle dark mode" suppressHydrationWarning>
            <Sun className="h-4 w-4 hidden dark:block" />
            <Moon className="h-4 w-4 dark:hidden" />
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" aria-describedby={undefined}>
              <SheetHeader>
                <SheetTitle className="font-mono">{SITE.name}</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-2 mt-8">
                {NAV_LINKS.map(({ href, label }) => (
                  <SheetClose asChild key={href}>
                    <a
                      href={href}
                      className={`px-4 py-3 rounded-md text-sm font-medium transition-colors hover:text-primary hover:bg-accent ${
                        isActive(href)
                          ? 'text-primary bg-accent'
                          : 'text-foreground'
                      }`}
                    >
                      {label}
                    </a>
                  </SheetClose>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
