import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  expect: {
    toHaveScreenshot: {
      // Antialiasing differs by a pixel or two between otherwise identical
      // runs. Without a tolerance the visual suite fails on noise, which
      // would put the manual work straight back on the maintainer; keep it
      // tight enough that a real layout or colour break still trips it.
      maxDiffPixelRatio: 0.01,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    env: {
      SITE: 'https://kadkhodaei.de',
    },
    timeout: 120_000,
  },
});
