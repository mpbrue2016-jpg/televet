import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const useLocalServer = !process.env.PLAYWRIGHT_BASE_URL;
const browserChannel = process.env.PLAYWRIGHT_CHANNEL;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    launchOptions: {
      ...(browserChannel === 'chrome' || browserChannel === 'msedge' ? { channel: browserChannel } : {}),
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--auto-accept-camera-and-microphone-capture',
      ],
    },
  },
  webServer: useLocalServer ? {
    command: 'npm run dev -- --hostname 127.0.0.1',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  } : undefined,
});
