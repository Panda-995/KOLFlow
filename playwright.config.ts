import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT || 4179);
const baseURL = `http://127.0.0.1:${port}`;
const windowsChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  || (process.platform === 'win32' && existsSync(windowsChrome) ? windowsChrome : undefined);
const dataDir = join(process.cwd(), 'test-results', `e2e-data-${Date.now()}-${process.pid}`);

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  outputDir: 'test-results/e2e-artifacts',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/e2e-report', open: 'never' }],
  ],
  use: {
    baseURL,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  webServer: {
    command: 'npm run e2e:serve',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: 'production',
      PORT: String(port),
      DATA_DIR: dataDir,
      JWT_SECRET: 'kolflow-e2e-jwt-secret-2026-release',
      INVITE_CODE: 'kolflow-e2e-invite',
      CORS_ORIGIN: '*',
    },
  },
});
