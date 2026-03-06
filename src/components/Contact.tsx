import { useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { Mail, MapPin } from 'lucide-react';
import { IconGithub, IconLinkedin } from './BrandIcons';
import { Button } from './ui/button';
import { SITE } from '@/lib/utils';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const contactLinks = [
  {
    icon: Mail,
    label: 'Email',
    value: SITE.email,
    href: `mailto:${SITE.email}`,
    color: 'group-hover:text-red-500',
  },
  {
    icon: IconGithub,
    label: 'GitHub',
    value: 'github.com/arash77',
    href: SITE.github,
    color: 'group-hover:text-foreground',
  },
  {
    icon: IconLinkedin,
    label: 'LinkedIn',
    value: 'linkedin.com/in/kadarash',
    href: SITE.linkedin,
    color: 'group-hover:text-blue-500',
  },
  {
    icon: MapPin,
    label: 'Location',
    value: SITE.location,
    href: 'https://www.google.com/maps/place/Freiburg+im+Breisgau',
    color: 'group-hover:text-green-500',
  },
];

export default function Contact() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.set(headingRef.current, { y: 24 });
    gsap.to(headingRef.current, {
      opacity: 1, visibility: 'inherit', y: 0, duration: 0.6, ease: 'power3.out',
      scrollTrigger: { trigger: sectionRef.current, start: 'top 80%' },
    });
    gsap.set('.contact-item', { y: 20 });
    gsap.to('.contact-item', {
      opacity: 1,
      visibility: 'inherit',
      y: 0,
      duration: 0.6,
      stagger: 0.1,
      ease: 'power3.out',
      scrollTrigger: { trigger: sectionRef.current, start: 'top 80%' },
    });
  }, { scope: sectionRef });

  return (
    <section id="contact" ref={sectionRef} className="py-24">
      <div className="container mx-auto px-4 max-w-4xl">
        <div ref={headingRef} className="gsap-reveal text-center mb-16">
          <p className="text-sm font-mono text-secondary tracking-widest uppercase mb-2">
            Let's connect
          </p>
          <h2 className="text-4xl font-bold mb-4">Contact</h2>
          <div className="w-16 h-1 bg-gradient-to-r from-primary to-secondary mx-auto rounded-full mb-6" />
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            I'm always open to interesting conversations, collaboration opportunities, or just saying hi!
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-10">
          {contactLinks.map(({ icon: Icon, label, value, href, color }) => (
            <a
              key={label}
              href={href}
              target={href.startsWith('http') ? '_blank' : undefined}
              rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="gsap-reveal contact-item group flex items-center gap-4 p-5 rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-md transition-[border-color,box-shadow] duration-150"
            >
              <div className={`p-3 rounded-lg bg-muted transition-colors ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-0.5">
                  {label}
                </p>
                <p className="font-medium text-sm group-hover:text-primary transition-colors">{value}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
