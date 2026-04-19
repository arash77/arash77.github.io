import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

export default function LegalToggle() {
  const [lang, setLang] = useState<'de' | 'en'>('de');

  useEffect(() => {
    const stored = localStorage.getItem('legal-lang') as 'de' | 'en' | null;
    const initial = stored ?? 'de';
    setLang(initial);
    document.getElementById('legal-content')?.setAttribute('data-legal-lang', initial);
  }, []);

  function toggle(next: 'de' | 'en') {
    setLang(next);
    localStorage.setItem('legal-lang', next);
    document.getElementById('legal-content')?.setAttribute('data-legal-lang', next);
  }

  return (
    <div className="flex items-center gap-1 mb-10" role="group" aria-label="Language / Sprache">
      {(['de', 'en'] as const).map((l) => (
        <button
          key={l}
          onClick={() => toggle(l)}
          aria-pressed={lang === l}
          className={cn(
            'px-3 py-1.5 text-xs font-mono uppercase tracking-widest rounded-md border transition-colors cursor-pointer',
            lang === l
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
          )}
        >
          {l === 'de' ? 'Deutsch' : 'English'}
        </button>
      ))}
    </div>
  );
}
