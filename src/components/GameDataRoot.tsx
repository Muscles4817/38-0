'use client';

// The snapshot is a 2.6 MB JSON file that every screen of the game reads. The
// bundler gives a module to the layout's chunk only when the layout itself
// imports it; left to the pages, each of the five routes got its own 1.3 MB
// chunk holding a full copy, and a run from setup to results downloaded the
// data four times. Importing it here, in the one client component the root
// layout renders, puts it in a single chunk that every route shares.
import '@/lib/gameData';

export default function GameDataRoot({ children }: { children: React.ReactNode }) {
  return children;
}
