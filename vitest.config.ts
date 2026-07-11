import { defineConfig } from 'vitest/config';

// Keep the Playwright a11y specs under e2e/ out of the vitest unit run —
// they use @playwright/test, not vitest, and must run via `npm run test:a11y`.
export default defineConfig({
  test: {
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
