import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Resolves the "@/*" alias from tsconfig.json.
    tsconfigPaths: true,
  },
  test: {
    // Everything under test is pure TypeScript with no DOM dependency. Add
    // jsdom + @testing-library/react here if component tests are introduced.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Many of these tests play whole seasons. The default five seconds is
    // enough on a developer machine and not on a shared CI runner, where two
    // of them timed out with nothing wrong. A test that needs longer than
    // this still says so itself.
    testTimeout: 30_000,
  },
});
