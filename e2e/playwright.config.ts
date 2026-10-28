import { defineConfig, devices } from '@playwright/test';
import { CLIENT_PORT, CLIENT_URL } from './helpers/rig';

export default defineConfig({
  testDir: '.',
  testMatch: /j\d+-.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  globalTeardown: './teardown.ts',
  reporter: [['list'], ['json', { outputFile: '../test-results/journeys.json' }]],
  use: { ...devices['Pixel 7'], trace: 'retain-on-failure' },
  webServer: {
    command: `npm run dev -- --port ${CLIENT_PORT}`,
    cwd: '..',
    url: CLIENT_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
