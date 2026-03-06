import { useState, useEffect } from 'react';
import { Menu, Moon, Sun } from 'lucide-react';
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

function DarkModeToggle({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label="Toggle dark mode"
      className={className}
      suppressHydrationWarning
    >
      <Sun className="h-4 w-4 hidden dark:block" />
      <Moon className="h-4 w-4 dark:hidden" />
    </Button>
  );
}

export default function Navbar({ currentPath: initialPath = '/' }: NavbarProps) {
  const [isDark, setIsDark] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const currentPath = initialPath;

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));

    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleDark = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', next ? '#041618' : '#f7fcfc');
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
          <img src="/a-logo.png" alt="" aria-hidden="true" className="h-8 w-8 object-contain" />
          <span className="font-mono">{SITE.name}</span>
        </a>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors hover:text-primary hover:bg-accent ${
                isActive(href) ? 'text-primary bg-accent' : 'text-muted-foreground'
              }`}
            >
              {label}
            </a>
          ))}
          <DarkModeToggle onClick={toggleDark} className="ml-2" />
        </div>

        {/* Mobile nav */}
        <div className="flex items-center gap-2 md:hidden">
          <DarkModeToggle onClick={toggleDark} />
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
                        isActive(href) ? 'text-primary bg-accent' : 'text-foreground'
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
