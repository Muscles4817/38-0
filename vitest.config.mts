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
  },
});
