import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:3000',
    // Opcional: usar un Chromium ya instalado en lugar del de Playwright.
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    },
  },
  webServer: {
    command: 'pnpm build && pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Por defecto valores ficticios (el CI no se conecta a Supabase). Para las pruebas que
    // sí lo usan (stamp.spec.ts), E2E_SUPABASE_* apunta la app al mismo proyecto.
    env: {
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.E2E_SUPABASE_URL ?? 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.E2E_SUPABASE_PUBLISHABLE_KEY ?? 'dummy',
      SUPABASE_SECRET_KEY: process.env.E2E_SUPABASE_SECRET_KEY ?? 'dummy',
    },
  },
});
