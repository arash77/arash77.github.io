import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectsGrid, { type Project } from '@/components/ProjectsGrid';

const mockProjects: Project[] = [
  {
    id: 'featured-bio',
    title: 'Galaxy Core Contributions',
    description: 'Core bioinformatics platform work.',
    category: 'Bioinformatics',
    links: [{ label: 'GitHub Repo', url: 'https://github.com/galaxyproject/galaxy' }],
    tags: ['Python', 'Galaxy'],
    featured: true,
  },
  {
    id: 'regular-crypto',
    title: 'Crypto Trading Bot',
    description: 'Automated trading with ccxt.',
    category: 'Crypto',
    links: [{ label: 'GitHub Repo', url: 'https://github.com/arash77/ccxt-bot' }],
    tags: ['Python', 'CCXT'],
    featured: false,
  },
  {
    id: 'regular-bio',
    title: 'Bioinformatics Toolkit',
    description: 'Sequence analysis tools.',
    category: 'Bioinformatics',
    links: [{ label: 'Repo', url: 'https://github.com/arash77/bio-toolkit' }],
    tags: ['Python', 'BioPython'],
    featured: false,
  },
];

describe('ProjectsGrid', () => {
  it('renders all projects by default ("All" category)', () => {
    render(<ProjectsGrid projects={mockProjects} />);
    expect(screen.getByText('Galaxy Core Contributions')).toBeInTheDocument();
    expect(screen.getByText('Crypto Trading Bot')).toBeInTheDocument();
    expect(screen.getByText('Bioinformatics Toolkit')).toBeInTheDocument();
  });

  it('clicking a category filters to matching projects only', async () => {
    const user = userEvent.setup();
    render(<ProjectsGrid projects={mockProjects} />);

    await user.click(screen.getByRole('button', { name: /^Crypto/ }));

    expect(screen.getByText('Crypto Trading Bot')).toBeInTheDocument();
    expect(screen.queryByText('Galaxy Core Contributions')).not.toBeInTheDocument();
    expect(screen.queryByText('Bioinformatics Toolkit')).not.toBeInTheDocument();
  });

  it('featured projects appear separately with "Featured Work" label', () => {
    render(<ProjectsGrid projects={mockProjects} />);
    expect(screen.getByText(/featured work/i)).toBeInTheDocument();
  });

  it('active filter button has aria-pressed="true"', async () => {
    const user = userEvent.setup();
    render(<ProjectsGrid projects={mockProjects} />);

    const cryptoBtn = screen.getByRole('button', { name: /^Crypto/ });
    await user.click(cryptoBtn);

    expect(cryptoBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('"All" button is initially active (aria-pressed="true")', () => {
    render(<ProjectsGrid projects={mockProjects} />);
    const allBtn = screen.getByRole('button', { name: /^All/ });
    expect(allBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows empty state when a category has no projects', async () => {
    const user = userEvent.setup();
    render(<ProjectsGrid projects={mockProjects} />);

    await user.click(screen.getByRole('button', { name: /^Python Libraries/ }));

    expect(screen.getByText(/no projects in this category/i)).toBeInTheDocument();
  });
});
