import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /j\d+-.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  globalTeardown: './teardown.ts',
  reporter: [['list'], ['json', { outputFile: '../test-results/journeys.json' }]],
  use: { ...devices['Pixel 7'], trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev',
    cwd: '..',
    url: 'http://127.0.0.1:5180/clients/tc-check/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
