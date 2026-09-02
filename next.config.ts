import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import type { NextConfig } from 'next';

/**
 * The deployed game is a fully static site. It reads the committed JSON
 * snapshot in src/data and runs the season simulation in the browser, so it
 * needs no server at runtime and can be hosted on GitHub Pages.
 *
 * The data editor under /editor and the /api routes behind it are authoring
 * tools. They talk to a local SQLite database, which a static host cannot
 * serve, so their files are named `*.dev.tsx` / `*.dev.ts` and Next only
 * registers those page extensions while the dev server is running.
 *
 *   npm run dev     game + editor, backed by SQLite
 *   npm run build   game only, static export into ./out
 */
export default function nextConfig(phase: string): NextConfig {
  const isDevServer = phase === PHASE_DEVELOPMENT_SERVER;

  if (isDevServer) {
    return {
      pageExtensions: ['tsx', 'ts', 'dev.tsx', 'dev.ts'],
    };
  }

  return {
    // Leaving out the dev extensions keeps /editor and /api out of the build.
    pageExtensions: ['tsx', 'ts'],
    output: 'export',
    // A GitHub Pages project site is served from /<repo>, so the deploy
    // workflow passes that prefix in. Empty for a user site or local previews.
    basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
    // Emit /draft/index.html rather than /draft.html, which every static host
    // resolves without extra rewrite rules.
    trailingSlash: true,
    // No image optimiser exists on a static host.
    images: { unoptimized: true },
  };
}
