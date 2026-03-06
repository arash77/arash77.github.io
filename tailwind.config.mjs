/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // Brand colors — teal family
        'brand-blue': '#0a8a8a',       /* teal primary */
        'brand-green': '#159957',      /* brand green kept */
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        amber: {
          DEFAULT: 'hsl(var(--amber))',
          foreground: 'hsl(var(--amber-foreground))',
        },
        indigo: {
          DEFAULT: 'hsl(var(--indigo))',
          foreground: 'hsl(var(--indigo-foreground))',
        },
        rose: {
          DEFAULT: 'hsl(var(--rose))',
          foreground: 'hsl(var(--rose-foreground))',
        },
        violet: {
          DEFAULT: 'hsl(var(--violet))',
          foreground: 'hsl(var(--violet-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'blob-drift-1': {
          '0%, 100%': { transform: 'translate(-50%, -50%)' },
          '25%':       { transform: 'translate(-20%, -80%)' },
          '50%':       { transform: 'translate(-80%, -20%)' },
          '75%':       { transform: 'translate(-30%, -70%)' },
        },
        'blob-drift-2': {
          '0%, 100%': { transform: 'translate(50%, 50%)' },
          '25%':      { transform: 'translate(20%, 80%)' },
          '50%':      { transform: 'translate(80%, 20%)' },
          '75%':      { transform: 'translate(70%, 70%)' },
        },
        'blob-drift-3': {
          '0%, 100%': { transform: 'translate(-50%, 0%)' },
          '33%':      { transform: 'translate(-20%, -40%)' },
          '66%':      { transform: 'translate(-80%, 40%)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-up': 'fade-up 0.6s ease-out',
        'fade-in': 'fade-in 0.4s ease-out',
        'gradient-shift': 'gradient-shift 8s ease infinite',
        'blob-drift-1': 'blob-drift-1 12s ease-in-out infinite',
        'blob-drift-2': 'blob-drift-2 15s ease-in-out infinite',
        'blob-drift-3': 'blob-drift-3 10s ease-in-out infinite',
      },
      backgroundSize: {
        '300%': '300%',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
